import { chromium } from 'playwright'
import ollama from 'ollama' // Ensure ollama is imported
import chalk from 'chalk'
import readline from 'readline'
import fs from 'fs'
import path from 'path'


const OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text'

const getCosineSimilarity = (a, b) => {
  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i += 1) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
}

var SYSTEM_PROMPT = `You are a browser automation assistant. Output ONLY Reason for act and thought. Always give out Thought even when calling Tools.

Current Page State:
{{STATE}}

User Goal:
{{prompt}}

TASK:
Analyze the user goal and current page state. 
- If the user's specific request is already done, you MUST call the "finish" tool immediately.
- DO NOT perform extra steps, testing, or logins unless explicitly specified in the User Goal.

OUTPUT FORMAT:
"Thought": "Brief of what's in the browser or Short 2-sentence reason for action"`

const availableTools = {
  openUrl: async ({ url, page }) => {
    await page.goto(url, { waitUntil: 'networkidle' }) 
    return `Page redirected to ${url}`
  },
  click: async ({ selector, page }) => {
    const element = page.locator(selector)
    const count = await element.count()
    if (count > 1) {
      return `Multiple elements found (${count}) for this selector (${selector}). Please use a unique selector.`
    }
    if (count === 0) {
      return `Element not found for selector: ${selector}`
    }
    await element.click()
    return `${selector} clicked successfully`
  },
  type: async ({ selector, value, page }) => {
    const element = page.locator(selector)
    const count = await element.count()
    if (count > 1) {
      return `Multiple elements found (${count}) for this selector (${selector}). Please use a unique selector.`
    }
    if (count === 0) {
      return `Element not found for selector: ${selector}`
    }
    await element.fill(value)
    return `Typed value successfully into ${selector}`
  },
  scroll: async ({ direction, page }) => {
    const isAtBottom = await page.evaluate(() => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const totalHeight = document.documentElement.scrollHeight
      return (scrollTop + windowHeight) >= (totalHeight - 1)
    })
    
    const isAtTop = await page.evaluate(() => window.scrollY === 0)

    if (direction.toLowerCase() === 'up') {
      if (!isAtTop) {
        await page.evaluate(() => window.scrollBy(0, -window.innerHeight))
      } else {
        return 'Page reached top.'
      }
    } else {
      if (!isAtBottom) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      } else {
        return 'Page reached bottom.'
      }
    }
    return `Page scrolled ${direction} successfully`
  },
  finish: async ({ summary }) => {
    return `SUCCESS: ${summary}`
  }
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'openUrl',
      description: 'Opens a completely new URL in the browser.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The absolute URL to open.' },
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description: 'Clicks an interactive element based on a unique CSS selector derived from the page state.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Unique CSS selector (e.g., "#id" or "button[class=\'...\']")' },
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'type',
      description: 'Inserts text into an interactive input, textarea, or form field.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Unique CSS selector for the input element.' },
          value: { type: 'string', description: 'The text string to insert into the element.' },
        },
        // FIX: Adjusted required parameters to reflect input fields
        required: ['selector', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scrolls the page layout up or down to find hidden elements.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: 'Direction to scroll: "up" or "down".' },
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Call this tool immediately when you have successfully completed the specific task the user asked for.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A short description of what was accomplished.' }
        },
        required: ['summary']
      }
    }
  }
]

const ollamaAutomationHandler = async (model, prompt, history = [], page='', embeddingModel=OLLAMA_EMBEDDING_MODEL) => {
  try {
    // Collect the dynamic page state
    await page.waitForLoadState('domcontentloaded')
    
    var visibleElements = await page.evaluate(async () => {
      const elements = document.querySelectorAll(':not(table *) :is(button, a, input, select, textarea, [role="button"])')
      const tableElements = document.querySelectorAll('table :is(button, a, input, select, textarea, [role="button"])')
      const results = []
      // 1. Process standard non-table elements
      let elementCount = 0
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect()
        const isInViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
          rect.width > 0 &&
          rect.height > 0
        )

        if (isInViewport) {
          let cleanSelector = el.id ? `#${el.id}` : ''
          if (!cleanSelector && el.tagName.toLowerCase() === 'button' && el.innerText.trim()) {
            cleanSelector = `button:has-text("${el.innerText.trim().substring(0, 15)}")`
          }
          if(['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())){
            el.setAttribute('label', el.parentElement?.innerText?.trim() || '')
          }
          el.setAttribute('ai-interactive', elementCount)
          results.push({
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            name: el.name,
            label: el.getAttribute('label'),
            value: el.value,
            type: el.type,
            text: el.innerText.trim() || undefined,
            placeholder: el.getAttribute('placeholder') || undefined,
            suggestedSelector: `${el.tagName.toLowerCase()}[ai-interactive="${elementCount}"]`
          })
          elementCount += 1
        }
      })

      // 2. Process table elements cleanly
      let elemCount = 0
      tableElements.forEach((el) => {
        const rect = el.getBoundingClientRect()
        const isInViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
          rect.width > 0 &&
          rect.height > 0
        )

        if (isInViewport) {
          let cleanSelector = el.id ? `#${el.id}` : ''
          if (!cleanSelector && el.tagName.toLowerCase() === 'button' && el.innerText.trim()) {
            cleanSelector = `button:has-text("${el.innerText.trim().substring(0, 15)}")`
          }

          // FIX: Use querySelectorAll to find all cells, and optional chaining safety
          const extras = []
          const row = el.closest('tr')
          if (row) {
            row.querySelectorAll('td').forEach((cell) => {
              const cellText = cell.innerText.trim()
              if (cellText) {
                extras.push(cellText)
              }
            })
          }

          // Assign custom attribute for direct target matching
          el.setAttribute('extra-id', elemCount)

          results.push({
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            text: el.innerText.trim() || undefined,
            placeholder: el.getAttribute('placeholder') || undefined,
            value: el.value,
            type: el.type,
            // FIX: Replaced syntax error (=) with correct colon assignment (:)
            suggestedSelector: `${el.tagName.toLowerCase()}[extra-id="${elemCount}"]`,
            rowContext: extras.length > 0 ? extras : undefined
          })
          
          elemCount += 1
        }
      })

      return results
    })

    var embedDocs = [...visibleElements].map((element)=>{
      return JSON.stringify(element)
    })

    if (embedDocs.length > 0) {
      const { embeddings } = await ollama.embed({
        model: embeddingModel,
        input: [prompt, ...embedDocs]
      })
      const [embedQuery, ...embeddedDocs] = embeddings
      const similarityScore = embeddedDocs.map((embeddedDoc) => getCosineSimilarity(embedQuery, embeddedDoc))
      visibleElements = [...visibleElements].map((context, index) => ({
        ...context,
        score: similarityScore[index].toFixed(4)
      })).sort((a,b) => b.score - a.score).slice(0, 5)
    }

    // FIX: Inject variables cleanly into your system prompt template
    const formattedSystemPrompt = SYSTEM_PROMPT
      .replace('{{STATE}}', JSON.stringify(visibleElements, null, 2))
      .replace('{{prompt}}', prompt)

    if (history.length === 0) {
      history.push({ role: 'system', content: formattedSystemPrompt })
    } else {
      // Keep the system prompt's snapshot fresh on subsequent loops
      history[0].content = formattedSystemPrompt
    }

    let response = await ollama.chat({
      model: model,
      messages: history,
      tools: tools
    })

    history.push(response.message)
    
    if (response.message.content) {
      console.log(chalk.blue(`\n🤖 ${response.message.content}`))
    }
    let shouldStop = false
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      for (const call of response.message.tool_calls) {
        const functionName = call.function.name
        const functionArguments = call.function.arguments // This is a parsed JSON object
        
        console.log(chalk.gray(`\nModel is accessing tool: ${functionName}`))
        if (functionName === 'finish') {
          console.log(chalk.bold.green(`\n🏁 Task Finished: ${functionArguments.summary}`))
          shouldStop = true
          break 
        }
        if (availableTools[functionName]) {
          // FIX: Pass functionArguments directly and include the page context explicitly inside the single object argument
          const result = await availableTools[functionName]({ ...functionArguments, page })
          console.log(chalk.green(`🔧 Tool Output: ${result}`))
          history.push({ role: 'tool', content: String(result), name: functionName })
        } else {
          history.push({ role: 'tool', content: `Tool ${functionName} is not available.`, name: functionName })
        }
      }
      if (shouldStop) {
        return response.message.content
      }
      // Recursively keep moving toward the goal after executing a tool call action
      return await ollamaAutomationHandler(model, prompt, history, page, embeddingModel)
    }
    
    return response.message.content
  } catch (error) {
    console.error(chalk.red('Error in Automation Handler: ' + error))
  }
}


const automationAgent = async (filePath) => {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  console.clear()
  console.log(chalk.bold.green('Welcome to your Local AI Agent Shell.\n'))
  const embeddingModel = OLLAMA_EMBEDDING_MODEL
  if(!filePath){
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.bold.cyan('>>> ')
    })

    rl.prompt()

    // Create a persistent history array tracking the conversation loop session
    let contextHistory = []

    rl.on('line', async (line) => {
      const input = line.trim()
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log(chalk.yellow('\n👋 Closing agent session...'))
        rl.close()
        return
      }
      if (!input) {
        rl.prompt()
        return
      }
      try {
        // Clear out history context for completely new objective tasks if necessary
        contextHistory = [] 
        await ollamaAutomationHandler('qwen3.5:4B', input, contextHistory, page, embeddingModel)
      } catch (err) {
        console.log(chalk.red(err))
      } finally {
        rl.prompt()
      }
    })

    rl.on('close', async () => {
      await browser.close()
      process.exit(0)
    })
  } else {
    const normalizedPath = path.resolve(filePath)

    if (!fs.existsSync(normalizedPath)) {
      console.error(chalk.red(`Instruction file not found: ${normalizedPath}`))
      await browser.close()
      return
    }

    const fileStream = fs.createReadStream(normalizedPath)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
      prompt: '>>> '
    })

    try {
      for await (const line of rl) {
        const input = line.trim()
        if (!input) {
          continue
        }

        console.log(chalk.gray(`${rl.getPrompt()}${input}`))
        await ollamaAutomationHandler('qwen3.5:4B', input, [], page, embeddingModel)
      }
    } catch (error) {
      console.error(chalk.red(`Error reading file: ${error.message}`))
    } finally {
      await browser.close()
    }
  }
}

export default automationAgent
