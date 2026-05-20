import fs, { read, readlink } from 'fs';

const CONFIG_DIR = path.join(os.homedir(), '.agent-shell' )
const SESSION_PATH = path.join(CONFIG_DIR, 'session.json');


const loadSession = () => {
    try {
        if (fs.existsSync(SESSION_PATH)) {
            return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to read session, starting fresh.');
    }
    return []; // Return empty array if no session exists yet
};

// 2. Save session history back to disk
const saveSession = (messages) => {
    try {
        fs.writeFileSync(SESSION_PATH, JSON.stringify(messages, null, 2), { mode: 0o600 });
    } catch (e) {
        console.error('Failed to save session state.');
    }
};

const clearSession = () => {
    if (fs.existsSync(SESSION_PATH)) {
        fs.unlinkSync(SESSION_PATH);
        console.log('🧹 Chat session cleared!');
    }
};
