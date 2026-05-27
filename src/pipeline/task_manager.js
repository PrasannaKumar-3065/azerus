import crypto from 'crypto'
import agentSession, { startNewSession } from "./session_manager.js"

const taskTemplate = {
  id: "",
  objective: "",
  assigned_agent: "",
  status: "",
  dependencies: [],
  artifacts: [],
  retry_count: 0,
  validation_rules: {},
  memory_refs: []
}
export class TaskManager{
    constructor(agentSession){
        var currentSession = agentSession.get('current_session')
        if(!currentSession){
            currentSession = startNewSession()
        }
        var taskList = currentSession.taskList
        var sessionMemory = currentSession.session_memory
        this.agentSession = agentSession
        this.currentSession = currentSession
        this.taskList = taskList
        this.sessionMemory = sessionMemory
    }

    createTask(task){
        this.taskList.push(task)
        this.currentSession['tasklist'] = this.taskList
    }

    createSessionMemory(mem){
        this.sessionMemory.push(mem)
        this.currentSession['session_memory'] = this.sessionMemory
    }

    commitSession(){
        agentSession.set('current_session', this.currentSession)
    }
}