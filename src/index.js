#!/usr/bin/env node

import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';

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
                    var res = await fetch(`https://api.github.com/users/${input}`)
                    return res.ok ? true : 'Username doesnot exist.'
                }
            },
            {
                type: 'password',
                name: 'token',
                message: 'Enter GitHub token:',
                mask: '#',
                validate: async (input) => {
                    if (!input) return 'Token is required';
                    var res = await fetch(`https://api.github.com/user`, {
                        headers: {
                            Authorization: `Bearer ${input}`
                        }
                    })
                    if (!res.ok) return 'Invalid Auth token.'

                    let json = await res.json()
                    console.log(chalk.blue(res.status))
                    return json.ok ? true : 'Invalid Auth token for given user.'
                }
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