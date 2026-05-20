import * as cheerio from 'cheerio'
import chalk from 'chalk'
import pupppeteer from 'puppeteer'
import stringSimilarity from 'string-similarity'
import ollama from 'ollama'
import ora from 'ora'

const WEB_PROMPT = `### System Role
You are an expert Web Research Analyst. Your job is to thoroughly analyze the provided web page content chunks and extract a dense, highly detailed summary focused specifically on the user's information goals.

### Strict Guardrails & Instructions:
1. **Fact-Based Filtering**: Extract only hard data, key dates, specifications, statistics, and direct arguments. Completely ignore webpage clutter, ads, navigation links, and generic marketing fluff.
2. **Structural Density**: Format your answer using structured bullet points with **bolded key terms** for immediate scannability.
3. **No Hallucinations**: Rely strictly on the text provided in the chunks. If the provided chunks do not contain a direct answer to the query, state exactly what information was available rather than inventing details.
4. **Tone**: Maintain a neutral, professional, and analytical tone. Avoid conversational filler like "Based on the text..." or "Here is the summary...". Go straight to the data.`



const extractContent  = async (url, page) => {
    try{
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
        const html = await page.content()
        const $ = cheerio.load(html)
        $('script, style, footer, nav, iframe, noscript, header, ads, aside').remove()
        var rawParagraphs = []
        $('main, article, p, li, h1, h2, h3').each((i, el) => {
            const txt = $(el).text().replace(/\s+/g, ' ').trim()
                rawParagraphs.push(txt)
        })
        rawParagraphs = [...new Set(rawParagraphs)]
        return rawParagraphs
    }catch(err){
        console.error(chalk.red('SCRAPE ERROR: '+err))
        return []
    }
}

const chunkContent = (rawParagraphs, query) => {
    return rawParagraphs.map(chunk => {
        const score = stringSimilarity.compareTwoStrings(query, chunk)
        return {chunk, score}
    })
}

const rankChunks = (rawChunks) => {
    return rawChunks.sort((a,b) => b.score - a.score).slice(0, 5).map(item => item.chunk)
}

const normalizeResultUrl = (link) => {
    if (!link) return ''

    const url = link.startsWith('//') ? `https:${link}` : link
    try {
        const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`)
        const duckDuckGoTarget = parsedUrl.searchParams.get('uddg')
        return duckDuckGoTarget || parsedUrl.toString()
    } catch {
        return ''
    }
}

const summarizeChunks = async (topChunks, query) => {
    try{
        const agentPrompt = `${WEB_PROMPT}

### Research Objective
* **Target Query:** "${query}"

### Source Materials (Extracted Webpage Chunks)
\`\`\`text
${topChunks.map((chunk, index) => `[Chunk ${index + 1}]:\n${chunk}\n---`).join('\n')}
\`\`\`

### Comprehensive Analytical Report:`

        const response = await ollama.chat({
            model: 'qwen3.5:4b',
            messages: [{role: 'user', content: agentPrompt}]
        })
        return response.message.content
    }catch(err){
        console.error(chalk.red('SUMMARIZE ERROR: '+err))
        return ''
    }
}

const webSearch = async (query) =>{
    let spinner = ora(chalk.grey(`Web search started for ${query}`)).start()
    const browser = await pupppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    try {
        const page = await browser.newPage()
        await page.setRequestInterception(true)
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort()
            } else {
                req.continue()
            }
        })
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })

        if (!response.ok) {
            spinner.fail(`Search engine returned an error status: ${response.status}`)
            return `Search engine returned an error status: ${response.status}`
        }

        const html = await response.text()
        
        const $ = cheerio.load(html)
        const results = []
        const searchResults = $('.result__body').toArray()
        for (const [index, element] of searchResults.entries()) {
            if(index >= 4) break

            const title = $(element).find('.result__title a').text().trim()
            const snippet = $(element).find('.result__snippet').text().trim()
            const rawLink = $(element).find('.result__title a').attr('href') || $(element).find('.result__url').text().trim()
            const link = normalizeResultUrl(rawLink)
            if (!link) continue
            spinner.text = chalk.grey(`Reading result ${index + 1}: ${title || link}`)
            const webContent = await extractContent(link, page)
            const webChunks = chunkContent(webContent, query)
            const chunkScoring = rankChunks(webChunks)
            if(chunkScoring.length > 0){
                spinner.text = chalk.grey(`Summarizing result ${index + 1}: ${title || link}`)
                const summarization = await summarizeChunks(chunkScoring, query)
                if (summarization) {
                    results.push(`Source: ${title || link}\nSnippet: ${snippet}\n${summarization}`)
                }
            }
        }

        if(results.length === 0){
            spinner.warn(`No search results found for ${query}`)
            return "No search results found. The engine returned no content or structure changed. Try a different query"
        }
        spinner.succeed(`Web search completed for ${query}`)
        return results.join('\n\n')
    } catch (err) {
        spinner.fail('ERROR:'+err)
        return 'WEB SEARCH ERROR: ' + err
    } finally {
        await browser.close()
    }
}

export default webSearch
