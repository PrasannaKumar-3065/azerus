#!/usr/bin/env node

const args = process.argv.slice(2);

const command = args[0];

const arg1 = Number(args[1]);
const arg2 = Number(args[2]);

if (isNaN(arg1) || isNaN(arg2)) {
    process.stderr.write('Error: Arguments must be valid integers.\n');
    process.exit(1); // Use 1 for error
}

let result;

if (command === 'add') {
    result = arg1 + arg2;
} else if (command === 'sub') {
    result = arg1 - arg2;
} else if (command === 'mult') {
    result = arg1 * arg2;
} else {
    process.stderr.write(`Error: Unknown Command ${command}\n`);
    process.exit(1);
}

process.stdout.write(result.toString() + '\n'); 
process.exit(0);