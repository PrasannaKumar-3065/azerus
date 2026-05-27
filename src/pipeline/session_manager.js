import chalk from 'chalk'
import Conf from 'conf'
import crypto from 'crypto'

const agentSession = new Conf({ projectName: 'ai-agent-workflow' })

const task_struct = {
    id: '',
    objective: '',
    status: 'pending',
    dependencies: [],
    artifacts: [],
    retry_count: 0,
    validation_rules: {},
    memory_refs: [],
}

export const startNewSession = () => {
    const sessionPayload = {
        sessionId: crypto.randomUUID(),
        taskList: [],
        session_memory: [],
        createdAt: Date.now(),
        contextLength: 0,
    }
    
    agentSession.set('current_session', sessionPayload)
    return sessionPayload
}

export const updateContextLength = (contextLength, agentSession) => {
    var currentSession = agentSession.get('current_session')
    var context = (currentSession.contextLength || 0) + contextLength
    currentSession.contextLength = context
    agentSession.set('current_session', currentSession)
    console.log(chalk.yellow(`Context Length Updated: ${context}`))
}


export default agentSession