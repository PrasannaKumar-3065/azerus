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

function startNewSession() {
    const sessionPayload = {
        sessionId: crypto.randomUUID(),
        taskList: [],
        session_memory: [],
        createdAt: Date.now()
    }
    
    agentSession.set('current_session', sessionPayload)
    return sessionPayload
}


export default agentSession