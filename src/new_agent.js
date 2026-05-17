#!/usr/bin/env node
import { Command } from 'commander'
import fs, { read, readlink } from 'fs';
import path from 'path';
import os, { type } from 'os';
import ollama from 'ollama'
import keytar from 'keytar'
import inquirer from 'inquirer';
import ora from 'ora'
import chalk from 'chalk';
import { error } from 'console';
import readline from 'readline'


const program = new Command()

const CONFIG_DIR = path.join(os.homedir(), '.agent-shell' )
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')
console.log(os.homedir())

const SYSTEM_PROMPT = `### System Role
You are a specialized **File Management AI**. Your sole purpose is to perform CRUD (Create, Read, Update, Delete) operations on the user's file system.
### Constraints & Guardrails
* **Scope:** You only handle file-related tasks. If a request is unrelated to file management, you must refuse by stating: *"I am an agent dedicated to file management; I can only assist with file-related tasks."*`

var CONVERSATION_PROMPT = `### Conversation History`

class DirectoryClass{
    init(){
        if(!fs.existsSync(CONFIG_DIR)){
            fs.mkdirSync(CONFIG_DIR, {
                recursive: true,
                mode: 0o700
            })
        }
        if(!fs.existsSync(CONFIG_PATH)){
            // FIX 1: Wrote valid empty JSON instead of an object string reference
            fs.writeFileSync(CONFIG_PATH, '{}', {
                mode: 0o600
            })
        }
    }
}

const mgmt = new DirectoryClass()
mgmt.init(); // Initialize directories on startup

const availableTools = {
     // FIX 2: Removed await from synchronous fs.writeFileSync
    createFile: async ({filename, content=''}) => {
        try {
            await fs.promises.writeFile(path.join(CONFIG_DIR, filename), content, {
                mode: 0o600,
                encoding: 'utf8'
            });
            console.log(chalk.yellow(`${filename} file written successfully `));
            return `${filename} file written successfully `;
        } catch(error) {
            console.error('TOOL ERROR:', error);
            return 'TOOL ERROR: ' + error;
        }
    },
    // FIX 3: Fixed typo (_filename -> filename)
    removeFile: async ({filename}) => {
        try {
            await fs.promises.unlink(path.join(CONFIG_DIR, filename));
            console.log(chalk.yellow(`${filename} deleted successfully`))
            return true;
        } catch(error) {
            console.error('TOOL ERROR:', error);
            return 'TOOL ERROR: ' + error;
        }
    },
    // FIX 4: Fixed wrong variable path (CONFIG_PATH -> CONFIG_DIR)
    readFileContent: async ({filename, start, end}) => {
        try {
            let reader = await fs.promises.readFile(path.join(CONFIG_DIR, filename), 'utf-8');
            if (start && end) {
                const lines = reader.split(/\r?\n/);
                reader = lines.slice(start - 1, end).join('\n');
            }
            console.log(chalk.yellow(`${filename} opened for read.`))
            return reader;
        } catch(error) {
            console.error('TOOL ERROR:', error);
            return 'TOOL ERROR: ' + error;
        }
    },
    findKeywordInstance: async ({filename, keyword, allInstanceFlag = false}) => {
        try {
            const filePath = path.join(CONFIG_DIR, filename);
            const stream = fs.createReadStream(filePath);
            const rl = readline.createInterface({
                input: stream,
                crlfDelay: Infinity
            });
            console.log(chalk.yellow(`Keyword search initiated in ${filename} for ${keyword}`))
            let lineNumber = 0;
            const matches = [];

            for await (const line of rl) {
                lineNumber++;

                if (line.toLowerCase().includes(keyword.toLowerCase())) {
                    const result = {
                        line: lineNumber,
                        content: line
                    };
                    console.log(chalk.yellow(`${keyword} found in line ${lineNumber}`))
                    if (!allInstanceFlag) {
                        rl.close();
                        stream.destroy();
                        return result;
                    }

                    matches.push(result);
                }
            }

            return allInstanceFlag ? matches : null;
        } catch(error) {
            console.error('TOOL ERROR:', error);
            return 'TOOL ERROR: ' + error;
        }
    },
    displayStructure: async () => {
        try {
            const files = await fs.promises.readdir(CONFIG_DIR);
            
            if (files.length === 0) {
                return 'No files exist to manage for now';
            }

            // Map stats concurrently using Promise.all
            const fileStats = await Promise.all(
                files.map(async (fileName) => {
                    const fullPath = path.join(CONFIG_DIR, fileName);
                    const stats = await fs.promises.stat(fullPath);
                    return `File: ${fileName} | Created: ${stats.birthtime} | Modified: ${stats.mtime} | Size: ${stats.size} bytes`;
                })
            );

            return fileStats.join('\n');
        } catch(error) {
            console.error('TOOL ERROR:', error);
            return 'TOOL ERROR: ' + error;
        }
    },
    replaceLines: async ({filename, line, content}) => {
        try {
            const filePath = path.join(CONFIG_DIR, filename);
            
            const fileData = await fs.promises.readFile(filePath, 'utf-8');
            const lines = fileData.split(/\r?\n/);
                        
            if (line > 0) {
                // Adjust human-readable index (1) to JS memory offset (0)
                lines[line - 1] = content;
            } else {
                lines.push(content);
            }
            
            // Fixed tool schema mismatch payload
            const updatedContent = lines.join('\n');
            await availableTools.createFile({ filename, content: updatedContent });
            console.log(chalk.yellow(`Line ${line} replaced in ${filename}`))
            return 'Line replaced successfully.';
        } catch(error) {
            console.error('TOOL ERROR:', error);
            return 'TOOL ERROR: ' + error;
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

]

program.exitOverride()
program.name('agent-shell').description('Simple agentic shell with repl workflow')

program.command('hello <name>').description('Hello message').action((name)=>{
    console.log(`Hello ${name}`)
})


const streamOllama = async (model, prompt) => {
    try{
        const response = await ollama.chat({
            model: model,
            messages:[{role:'user', content:prompt}],
            stream: true
        })
        for await (const chunk of response) {
            process.stdout.write(chunk.message.content)
        }
        process.stdout.write('\n');
    }catch(error){
        console.error('Error Connecting OLLAMA: ', error)
    }
}

const constructPrompt = (history) =>{
    var prompt = SYSTEM_PROMPT
    if(history.length > 0){
        prompt += CONVERSATION_PROMPT + '\n' + history.join('\n') + '\n------------'
    }
    return prompt
}

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
                console.log(chalk.gray(`\nModel is accessing tool ${functionName} ${functionArguments}`))

                if(availableTools[functionName]){
                    const result = await availableTools[functionName](functionArguments)
                    tool_result.push('**'+functionName+'**\n'+result)
                    history.push({role:'tool', content: String(result), name: functionName})
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

const getConfig = async () => {
    try{
        const key = await keytar.getPassword('agent-shell', 'config')
        // FIX 5: Checked if key string exists before accessing object properties
        if(!key){
            console.log('Configuration is not set for the current workflow')
            console.log('Use `config` command to set configurations.')
            process.exit(0) 
        }
        return JSON.parse(key)
    }catch(err) {
        console.error(chalk.red('Error reading configuration:'+err))
    }
};

const storeConfig = async (config) => {
    try{
        await keytar.setPassword(
            'agent-shell',
            'config',
            JSON.stringify(config, null, 2)
        )
        console.log(chalk.green('Configuration updated successfully'))
    }catch(err){
        console.error('Error saving configuration:', err)
    }
};

program.command('prompt <message>').description('Converse with your providers agent').action(async (prompt) => {
    // 1. Config loading spinner
    let spinner = ora('Retrieving Configurations ...').start();
    try {
        const config = await getConfig();
        const provider = config['provider'];
        const model = config['model'];
        spinner.succeed('Configuration loaded successfully.');

        if (provider === 'gemini') {
            // Non-streaming Gemini preview: keep spinner active during wait
            spinner = ora('Model is thinking ...').start();
            console.log(`\nSending prompt to Gemini (${model})... [Feature in development]`);
            spinner.succeed('Done');
        } else {
            console.log(chalk.gray(`\n🤖 Ollama (${model || 'qwen3.5:4b'}) is generating...`));
            await ollamaToolHandler('qwen3.5:4b',prompt);
            console.log('\n'); // Ensure a clean spacing newline after stream ends
        }
    } catch (err) {
        spinner.fail('An error occurred during execution.');
        console.error(err);
    }
});


program.command('config').description('Configuration for the CLI management').action( async ()=>{
    var config = {}
    const answerProvider = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'provider',
            message: 'Select LLM provider for your workflow',
            // FIX 6: Fixed typo 'chioices' -> 'choices'
            choices:[{name:'GEMINI', value:'gemini'}, {name:'OLLAMA', value:'ollama'}]
        }
    ])
    config['provider'] = answerProvider.provider
    let followup = {};

    if(answerProvider.provider == 'gemini'){
        followup = await inquirer.prompt([
            {
                type:'password',
                name:'apikey',
                message:"Enter your provider's api key",
                mask: '*',
                validate: async (input) => {
                    if (!input || input.trim() === '') {
                        return 'API key is required for the workflow';
                    }
                    try {
                        // FIX 7: Corrected base Gemini API URL and added missing $ sign
                        var res = await fetch(`https://googleapis.com{input.trim()}`);
                        return res.ok ? true : 'Invalid API key. Please try again.';
                    } catch (error) {
                        return 'Network error. Could not verify the API key.';
                    }
                }
            },
            {
                type: 'input',
                name: 'model',
                message: 'Enter the Gemini model name (e.g., gemini-2.5-flash)',
                validate: async (input, answers) => {
                    if (!input || input.trim() === '') return 'Model name is required';
                    
                    let modelName = input.trim().toLowerCase();
                    if (!modelName.startsWith('models/')) {
                        modelName = `models/${modelName}`;
                    }
                    const apiKey = answers.apikey.trim();
                    try {
                        // FIX 8: Corrected base Gemini API URL and added missing $ sign
                        const res = await fetch(`https://googleapis.com{modelName}?key=${apiKey}`);
                        if (res.status === 404) {
                            return `Model '${input}' does not exist or isn't supported.`;
                        }
                        return res.ok ? true : `Could not verify model (HTTP Error ${res.status})`;
                    } catch (error) {
                        return 'Network error. Could not reach the Gemini API to verify the model.';
                    }
                }
            }
        ])
    }else{
        followup = await inquirer.prompt([
            {
                type: 'input', // FIX 9: Changed 'text' to standard inquirer 'input'
                name: 'model',
                message: 'Enter the Ollama model name',
                validate: async (input) => {
                    if(!input) return 'Model name is required';
                    try {
                        var res = await fetch('http://localhost:11434/api/tags')
                        // FIX 10: Extracted json payload before filtering arrays
                        var data = await res.json();
                        var fil = data.models.filter(model => model.name == input || model.name == `${input}:latest`)
                        if(fil.length == 0){
                            return `No model named ${input}`
                        }
                        return true
                    } catch (err) {
                        return 'Could not connect to Ollama. Ensure the service is running.';
                    }
                }
            }
        ])
    }

    if(followup.apikey){
        config['apikey'] = followup.apikey
    }
    if(followup.model){
        config['model'] = followup.model
    }
    await storeConfig(config)
})

program.parse(process.argv)
