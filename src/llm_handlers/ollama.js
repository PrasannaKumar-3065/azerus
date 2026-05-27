import { Command } from 'commander'
import fs, { read, readlink } from 'fs'
import path from 'path'
import os, { type } from 'os'
import ollama from 'ollama'
import keytar from 'keytar'
import inquirer from 'inquirer'
import ora from 'ora'
import chalk from 'chalk'
import { error } from 'console'
import readline from 'readline'
import webSearch from '../agents/browser.js'

const CONFIG_DIR = path.join(os.homedir(), '.agent-shell' )
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')
console.log(os.homedir())

const SYSTEM_PROMPT = `### System Role
You are a specialized **File Management and Browser research AI**. Your sole purpose is to perform CRUD (Create, Read, Update, Delete) and browser search operations on the user's file system.
### Constraints & Guardrails
* **Scope:** You only handle file-related tasks. If a request is unrelated to file management, you must refuse by stating: *"I am an agent dedicated to file management or web research I can only assist with file-related or web-related tasks."*`

var CONVERSATION_PROMPT = `### Conversation History`

const availableTools = {
    webSearch: async ({query}) => {
        return webSearch(query)
    },
     // FIX 2: Removed await from synchronous fs.writeFileSync
    createFile: async ({filename, content=''}) => {
        try {
            await fs.promises.writeFile(path.join(CONFIG_DIR, filename), content, {
                mode: 0o600,
                encoding: 'utf8'
            })
            console.log(chalk.yellow(`${filename} file written successfully `))
            return `${filename} file written successfully `
        } catch(error) {
            console.error('TOOL ERROR:', error)
            return 'TOOL ERROR: ' + error
        }
    },
    appendFile: async({filename, content}) => {
        await fs.appendFile(filename, content)
        return 'Data appended successfully!'
    },
    // FIX 3: Fixed typo (_filename -> filename)
    removeFile: async ({filename}) => {
        try {
            await fs.promises.unlink(path.join(CONFIG_DIR, filename))
            console.log(chalk.yellow(`${filename} deleted successfully`))
            return true
        } catch(error) {
            console.error('TOOL ERROR:', error)
            return 'TOOL ERROR: ' + error
        }
    },
    // FIX 4: Fixed wrong variable path (CONFIG_PATH -> CONFIG_DIR)
    readFileContent: async ({filename, start, end}) => {
        try {
            let reader = await fs.promises.readFile(path.join(CONFIG_DIR, filename), 'utf-8')
            if (start && end) {
                const lines = reader.split(/\r?\n/)
                reader = lines.slice(start - 1, end).join('\n')
            }
            console.log(chalk.yellow(`${filename} opened for read.`))
            return reader
        } catch(error) {
            console.error('TOOL ERROR:', error)
            return 'TOOL ERROR: ' + error
        }
    },
    findKeywordInstance: async ({filename, keyword, allInstanceFlag = false}) => {
        try {
            const filePath = path.join(CONFIG_DIR, filename)
            const stream = fs.createReadStream(filePath)
            const rl = readline.createInterface({
                input: stream,
                crlfDelay: Infinity
            })
            console.log(chalk.yellow(`Keyword search initiated in ${filename} for ${keyword}`))
            let lineNumber = 0
            const matches = []

            for await (const line of rl) {
                lineNumber++

                if (line.toLowerCase().includes(keyword.toLowerCase())) {
                    const result = {
                        line: lineNumber,
                        content: line
                    }
                    console.log(chalk.yellow(`${keyword} found in line ${lineNumber}`))
                    if (!allInstanceFlag) {
                        rl.close()
                        stream.destroy()
                        return result
                    }

                    matches.push(result)
                }
            }

            return allInstanceFlag ? matches : null
        } catch(error) {
            console.error('TOOL ERROR:', error)
            return 'TOOL ERROR: ' + error
        }
    },
    displayStructure: async () => {
        try {
            const files = await fs.promises.readdir(CONFIG_DIR)
            
            if (files.length === 0) {
                return 'No files exist to manage for now'
            }

            // Map stats concurrently using Promise.all
            const fileStats = await Promise.all(
                files.map(async (fileName) => {
                    const fullPath = path.join(CONFIG_DIR, fileName)
                    const stats = await fs.promises.stat(fullPath)
                    return `File: ${fileName} | Created: ${stats.birthtime} | Modified: ${stats.mtime} | Size: ${stats.size} bytes`
                })
            )

            return fileStats.join('\n')
        } catch(error) {
            console.error('TOOL ERROR:', error)
            return 'TOOL ERROR: ' + error
        }
    },
    replaceLines: async ({filename, line, content}) => {
        try {
            const filePath = path.join(CONFIG_DIR, filename)
            
            const fileData = await fs.promises.readFile(filePath, 'utf-8')
            const lines = fileData.split(/\r?\n/)
                        
            if (line > 0) {
                // Adjust human-readable index (1) to JS memory offset (0)
                lines[line - 1] = content
            } else {
                lines.push(content)
            }
            
            // Fixed tool schema mismatch payload
            const updatedContent = lines.join('\n')
            await availableTools.createFile({ filename, content: updatedContent })
            console.log(chalk.yellow(`Line ${line} replaced in ${filename}`))
            return 'Line replaced successfully.'
        } catch(error) {
            console.error('TOOL ERROR:', error)
            return 'TOOL ERROR: ' + error
        }
    }
}

const tools = [
    {
        type: 'function',
        function: {
            name: 'createFile',
            description: 'Create new file inside the configured directory',
            parameters: {
                type: 'object',
                properties: {
                    filename: {type: 'string', description: 'The name of the file'},
                    content: {type: 'string', description: 'The text content to write inside the file.'}
                },
                required: ['filename', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appendFile',
            description: 'Append content to already existing file.',
            parameters: {
                type: 'object',
                properties: {
                    filename: {type: 'string', description: 'The name of the file'},
                    content: {type: 'string', description: 'The text content to write inside the file.'}
                },
                required: ['filename', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'readFileContent',
            description: 'Read a portion or full file content',
            parameters: {
                type: 'object',
                properties: {
                    filename: {type: 'string', description: 'The name of the file'},
                    start: {type: 'number', description: 'Line number to start reading the file from.'},
                    end: {type: 'number', description: 'Line number to end reading the file from.'}
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'removeFile',
            description: 'Remove file inside the configured directory',
            parameters: {
                type: 'object',
                properties: {
                    filename: {type: 'string', description: 'The name of the file'},
                },
                required: ['filename']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'displayStructure',
            description: 'View all files in the configured directory',
        }
    },
    {
        type: 'function',
        function: {
            name: 'findKeywordInstance',
            description: 'Find keyword instances inside a file.',
            parameters: {
                type: 'object',
                properties: {
                    filename: {type: 'string', description: 'The name of the file.'},
                    keyword: {type: 'string', description: 'Keyword to find in a file.'},
                    allInstanceFlag: {type: 'boolean', description: 'Set to true to find all instances, or false to find only the first instance.'}
                },
                required: ['filename', 'keyword']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replaceLines',
            description: 'Replaces lines inside a file',
            parameters: {
                type: 'object',
                properties: {
                    filename: {type: 'string', description: 'The name of the file.'},
                    line: {type: 'integer', description: 'Line number to replace. Give 0 if wanna append'},
                    content: {type: 'string', description: 'Content to replace existing line.'}
                },
                required: ['filename', 'line', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'webSearch',
            description: 'Searches web for a particular query and returns the top summarized page results.',
            parameters: {
                type: 'object',
                properties: {
                    query: {type: 'string', description: 'The search keywords or question to look up on the internet.'}
                },
                required: ['query']
            }
        }
    }

]

const ollamaToolHandler = async (model, prompt, history=[]) =>{
    try{
        if(history.length == 0){
            history.push({role:'system', content: SYSTEM_PROMPT})
            history.push({role:'user', content: prompt})
        }
        let response = await ollama.chat({
            model: model,
            messages: history,
            tools: tools
        })
        history.push(response.message)
        if(response.message.content)
            console.log(chalk.blue(response.message.content))
        var tool_result = []
        if (response.message.tool_calls && response.message.tool_calls.length > 0){
            for (const call of response.message.tool_calls){
                const functionName = call.function.name
                const functionArguments = call.function.arguments
                console.log(chalk.gray(`\nModel is accessing tool ${functionName} ${JSON.stringify(functionArguments)}`))

                if(availableTools[functionName]){
                    const result = await availableTools[functionName](functionArguments)
                    tool_result.push('**'+functionName+'**\n'+result)
                    history.push({role:'tool', content: String(result), name: functionName})
                } else {
                    history.push({role:'tool', content: `Tool ${functionName} is not available.`, name: functionName})
                }
            }
            const finalResult = await ollamaToolHandler(model, '', history)
            return finalResult
        }
        return response.message.content
    }catch(error){
        console.error(chalk.red('Error Connecting OLLAMA: '+error))
    }
}

const ollamaHandler = async (model, prompt, tools) =>{
    try{
        let response = await ollama.chat({
            model: model,
            messages: prompt,
            tools: tools
        })
        return response
    }catch(error){
        console.error(chalk.red('Error Connecting OLLAMA: '+error))
        return null
    }
}

export default ollamaHandler
