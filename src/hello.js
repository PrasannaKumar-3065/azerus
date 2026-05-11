#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import pkg from 'enquirer';
const { prompt } = pkg;
import chalk from 'chalk'

const program = new Command();

program
    .name('todo')
    .description('A simple CLI')
    .version('1.0.0');

var TODO_LIST = []
const CONFIG_DIR = path.join(os.homedir(), '.todo-cli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');


const retriveFromFs = () => {
    if (!fs.existsSync(CONFIG_PATH)) return

    TODO_LIST = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

const writeToFs = () => {
    if (!fs.existsSync(CONFIG_PATH)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(TODO_LIST, null, 2))
}

const storeConfig = (config) => {
    if (!fs.existsSync(CONFIG_PATH)){
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config,null,2))
}

const printTodos = () => {
    retriveFromFs()
    if (TODO_LIST.length == 0) {
        console.log('No todo available.\n')
        console.log('Use `todo add [todo]` to add todos')
        return
    }
    TODO_LIST.forEach((todo, idx) => {
        console.log(`${idx + 1}. ${todo}`)
    })
}

retriveFromFs()

program.command('list').action(() => {
    printTodos()
})

program.command('add').argument('<string>', 'todo to be added').action((todo) => {
    retriveFromFs()
    TODO_LIST.push(todo)
    writeToFs()
    console.log('Todo added successfully!')
})

program.command('delete').argument('<string>', 'todo index to be deleted').action((todo) => {
    retriveFromFs()
    let idx = parseInt(todo) - 1
    if (idx < 0 || idx >= TODO_LIST.length) {
        console.log('Invalid todo index!')
        return
    }
    TODO_LIST.splice(idx, 1)
    writeToFs()
    console.log('Todo deleted successfully! \n')
    printTodos()

})

program.command('grep').argument('<string>', 'Keyword to search').argument('<string>', 'File Path').action(async (keyword, filePath) => {
    if (!fs.existsSync(filePath)) {
        console.log('File Doesnot exists')
        process.exit(1)
    }
    var file = fs.createReadStream(filePath, {})
    var rl = readline.createInterface({ input: file, crlfDelay: Infinity })

    for await (const line of rl) {
        if (line.includes(keyword)) {
            console.log(line)
        }
    }

})

program.command('execute').argument('<string>', 'Command to execute').action((command) => {
    const parts = command.split(' ');
    const mainCommand = parts[0];
    const args = parts.slice(1);

    const child = spawn(mainCommand, args);

    child.stdout.on('data', (data) => {
        console.log(`${data}`)
    })
    child.stderr.on('data', (data) => {
        console.log(`Error: ${data}`)
    })
    child.on('close', (code) => {
        console.log(`Process exited with code ${code}`)
        process.exit(code)
    })

})

program.command('setup').action(async () => {
    try{
        const answers = await prompt([
            {
                type: 'select',
                name: 'stack',
                message: 'Select the stack',
                choices: ['frontend', 'backend', 'fullstack']
            },
            {
                type: 'input',
                name: 'username',
                message: 'Enter GitHub username:',
                validate: async (input) => {
                    if (!input) return 'Username is required';
                    var res = await fetch(`https://api.github.com/users/${input}`)
                    return res.ok ? true : 'Username doesnot exist.'
                }
            }
        ])
        if (answers.stack === 'frontend') {
            console.log(chalk.green('frontend'))
        }
        else if (answers.stack === 'backend') {
            console.log(chalk.yellow('backend'))
        }
        else {
            console.log(chalk.red('fullstack'))
        }
        var config = {
            stack: answers.stack,
            github_username: answers.username,
            github_token: answers.token
        }
        storeConfig(config)
    }catch(err){
        console.log('Keyboard Interrupt')
        process.exit(1)
    }
})

program.parse();