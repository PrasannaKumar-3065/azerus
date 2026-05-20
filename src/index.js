#!/usr/bin/env node

import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';
import readline from 'readline';
import ollamaHandler from './llm_handlers/ollama.js';
const program = new Command();

program
    .name('agent-cli')
    .description('A simple CLI')
    .version('1.0.0');

program
    .command('chat')
    .description('Enter a live, interactive sub-shell session with your agent')
    .action(async () => {
        console.clear()
        console.log(chalk.bold.green('Welcome to Agent Sub-She;l chat.\n'))

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.bold.cyan('>>> ')
        })

        rl.prompt()

        rl.on('line', async (line) => {
            const input = line.trim()
            if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
                console.log(chalk.yellow('\n👋 Closing agent session. Returning to main shell...'));
                rl.close();
                return;
            }
            if (!input) {
                rl.prompt();
                return;
            }
            try {
                await ollamaHandler('qwen3.5:4b', input)
            }catch(err){console.log(err)}finally{rl.prompt()}

        })
        
        rl.on('close', () => {
            process.exit(0);
        });
    });

program.parse();