var PROMPT = `You are a highly efficient Project Coordinator and Task Planner Agent. Your job is to take a complex user request and break it down into a highly specific, step-by-step execution plan.`


import ollamaHandler from '../llm_handlers/ollama'


const planner = (prompt) =>{
    const response = ollamaHandler('qwen3.5:4b', PROMPT+'\n **USER** '+prompt)
    console.log(response.message.content)
}