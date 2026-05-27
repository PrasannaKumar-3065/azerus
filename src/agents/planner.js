var SYSTEM_PROMPT = `You are a highly efficient Project Coordinator and Task Planner Agent. 
Your job is to break down complex requests into a clean list of execution items.

Your workflow MUST follow these steps exactly:
1. Call the 'createTasks' tool with an array of short, clear task objectives.
2. Formulate each task objective clearly so it states what needs to be done.
3. Immediately after creating the tasks, call the 'finish' tool to conclude your planning.

DO NOT embed agent names or variables like 'AGENT=' or 'OUTPUT=' inside the task strings. Just provide the raw human-readable objectives.`

import chalk from 'chalk'
import ollamaHandler from '../llm_handlers/ollama.js'
import agentSession, { updateContextLength } from '../pipeline/session_manager.js'
import { TaskManager } from '../pipeline/task_manager.js'
import crypto from 'crypto'

const availableTools = {
    createTasks: ({taskList, taskManager}) => {
        console.log(chalk.cyan('Creating tasks:'))
        console.log(taskList)
        ;[...taskList].map((task)=> {
            taskManager.createTask({
                id: crypto.randomUUID(),
                objective: task,
                assigned_agent: "",
                status: "CREATED",
                dependencies: [],
                artifacts: [],
                retry_count: 0,
                validation_rules: {},
                memory_refs: []
            })
        })
        taskManager.commitSession()
        return 'Tasks saved successfully.'
    },
    viewAllTasks: ({taskManager}) => {
        return JSON.stringify(taskManager.taskList, null, 2)
    },
    finish: ({reasoning, taskManager}) => {
        console.log(chalk.green('=== EXECUTION PLAN ==='))
        console.log(chalk.blue(reasoning))
        console.log(chalk.green('======================'))
    }
}

const tools = [
    {
        type: 'function',
        function: {
            name: 'createTasks',
            description: 'Create tasks with agent assignments and specific instructions',
            parameters: {
                type: 'object',
                properties: {
                    taskList: {type: 'array', description: 'Array of task strings formatted as: AGENT=AgentName, TASK=description, OUTPUT=filename'},
                },
                required: ['taskList']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'viewAllTasks',
            description: 'View all created tasks',
        }
    },
    {
        type: 'function',
        function: {
            name: 'finish',
            description: 'Finish planning and return the execution plan',
            parameters: {
                type: 'object',
                properties: {
                    reasoning: {type: 'string', description: 'Detailed execution plan with agent assignments and step-by-step instructions'},
                },
                required: ['reasoning']
            }
        }
    },
]

export const planner = async (prompt) =>{

    const taskManager = new TaskManager(agentSession)
    var chatCount = 1
    var tokenLength = 0
    var hadError = false
    var maxIterations = 10
    var iterationCount = 0
    var agentHistory = [{role:'system', content: SYSTEM_PROMPT}, {role:'user', content: prompt}]
    while(chatCount > 0 && iterationCount < maxIterations){
        iterationCount++
        console.log(chalk.grey(`[Iteration ${iterationCount}] Calling OLLAMA...`))
        let response = await ollamaHandler('qwen3.5:4b', agentHistory, tools)
        if(!response){
            console.log(chalk.red('Error: Failed to get response from OLLAMA. Check if OLLAMA service is running.'))
            hadError = true
            break
        }
        if(response.messages && response.messages.content){
            console.log(chalk.blue(response.messages.content))
        }
        const inputTokens = response.prompt_eval_count
        const outputTokens = response.eval_count
        const totalTokens = inputTokens + outputTokens
        tokenLength = totalTokens
        if (response.message && response.message.tool_calls && response.message.tool_calls.length > 0){
            console.log(chalk.grey(`[Iteration ${iterationCount}] Found ${response.message.tool_calls.length} tool call(s)`))
            agentHistory.push(response.message);
            [...response.message.tool_calls].map((tool)=>{
                if(availableTools[tool.function.name]){
                    console.log(chalk.cyan(`  -> Using ${tool.function.name}`))
                    var toolResult = availableTools[tool.function.name]({...tool.function.arguments,taskManager})
                    agentHistory.push({role:'tool', content: toolResult})
                }
                if(tool.function.name == 'finish'){
                    console.log(chalk.green('Planner finished workflow'))
                    chatCount = 0
                }
            })
        } else {
            console.log(chalk.yellow(`[Iteration ${iterationCount}] No tool calls in response, exiting loop`))
            chatCount = 0
        }
    }
    if(iterationCount >= maxIterations){
        console.log(chalk.yellow(`Max iterations (${maxIterations}) reached, stopping workflow`))
    }
    if(!hadError && tokenLength > 0){
        try{
            updateContextLength(tokenLength, agentSession)
        }catch(err){
            console.log(chalk.yellow('Warning: Could not update context length'))
        }
    }
    return agentHistory
}