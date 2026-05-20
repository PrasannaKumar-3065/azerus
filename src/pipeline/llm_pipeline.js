const CONFIG_DIR = path.join(os.homedir(), '.agent-shell' )
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

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