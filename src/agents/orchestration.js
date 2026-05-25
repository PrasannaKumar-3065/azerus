import chalk from "chalk"
import agentSession from "../pipeline/session_manager.js"
import { TaskManager } from "../pipeline/task_manager.js"

SYSTEM_PROMPT = `You're an AI agentic workflow orchestrator. You will recieve user requests
You will orchestrate the workflow by using the agents available. User planner agent only if the task require multiple agents.
**RULES & GUIDELINES**
1. Reject all any any task you are not capable with available agent.
2. Reject unethical or inappropriate or illegal tasks,
3. Concentrate on the status of the Task and take next steps based on that.

**TASK STATUS**
*CORE*
CREATED=>ASSIGNED=>INPROGRESS=>COMPLETED=>VERIFIED=>CLOSED

*ERROR*
ERROR=>INVESTIGATION=>RETRYING=>INPROGRESS=>COMPLETED=>VERIFIED=>CLOSED

You may freely change the status of the tasks. 
You are to nevet trust the agent outputs and verify if the task is actually completed by assiging a new task to the respective agent`

const availableAgents = {
    PlannerAgent: async ({prompt}) => {
        return ''
    },
    WebResearchAgent: async ({task}) => {
        return ''
    },
    FileManager: async ({task}) => {
        return ''
    },
    BrowserAutomation: async ({task}) => {
        return ''
    },
}

const tools = [
    {
        type: 'function',
        function: {
            name: 'PlannerAgent',
            description: 'Creates a multi step breakdown on tasks based on the available agents.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: {type: 'string', description: 'The basis of the plan'},
                },
                required: ['prompt']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'WebResearchAgent',
            description: 'Returns a summarized web results from multiple website',
            parameters: {
                type: 'object',
                properties: {
                    task: {type: 'string', description: 'Goal for the agent to accompolish.'},
                },
                required: ['task']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'WebResearchAgent',
            description: 'Returns a summarized web results from multiple website',
            parameters: {
                type: 'object',
                properties: {
                    task: {type: 'string', description: 'Goal for the agent to accompolish.'},
                },
                required: ['task']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'BrowserAutomation',
            description: 'Returns a summarized web results from multiple website',
            parameters: {
                type: 'object',
                properties: {
                    task: {type: 'string', description: 'Goal for the agent to accompolish.'},
                },
                required: ['task']
            }
        }
    },
]

const orchestration = (prompt) => {
    taskManager = TaskManager(agentSession)
    taskList = taskManager.taskList

    while(taskList.length != 0){
        let response = await ollama.chat({
            model: model,
            messages: [],
            tools: tools
        })

        if(response.messages.content){
            console.log(chalk.blue(response.messages.content))
        }

        if (response.message.tool_calls && response.message.tool_calls.length > 0){
            [...response.message.tool_calls].map((tool)=>{
                if(availableAgents[tool.function.name]){
                    var toolResult = availableAgents[tool.function.name](tool.function.arguments)
                    var toolResult = summarize(toolResult)

                }
            })
        }
    }
}