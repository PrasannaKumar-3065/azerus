#!/usr/bin/env node

const { Command } = require('commander');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const inquirer = require('inquirer');

const program = new Command();

// Ensure the directory exists
const CONFIG_DIR = path.join(os.homedir(), '.cli-tool');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const getConfig = () => {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
        return null;
    }
};

const storeConfig = (config) => {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('✅ Configuration stored successfully.');
};

program
    .name('cli')
    .description('A simple CLI')
    .version('1.0.0');

program
    .command('config')
    .description('Setup needed for the cli')
    .action(async () => {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'username',
                message: 'Enter GitHub username:',
                validate: async (input) => {
                    if (!input) return 'Username is required';
                    // Optional: fetch validation here
                    return true;
                }
            },
            {
                type: 'password',
                name: 'token',
                message: 'Enter GitHub token:',
                mask: '#'
            }
        ]);

        storeConfig({ git_username: answers.username, git_token: answers.token });
    });

program
    .command('setup')
    .description('Clones a repo')
    .argument('<link>', 'Link to the repository')
    .option('-n, --name <folder>', 'Specify Foldername')
    .action((repo, options) => {
        const config = getConfig();
        if (!config) {
            return console.log('❌ Configuration not found. Run "cli config" first.');
        }

        const folderName = options.name || repo.split('/').pop().replace('.git', '');
        try {
            console.log(`Cloning as ${config.git_username}...`);
            execSync(`git clone ${repo} ${folderName}`, { stdio: 'inherit' });
            console.log(`\n✨ Done: ${folderName}`);
        } catch (error) {
            console.error(`\n❌ Git Error: ${error.message}`);
        }
    });

program.parse();