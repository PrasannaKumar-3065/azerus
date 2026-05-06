#!/usr/bin/env node

const args = process.argv.slice(2)

let option, value;
if (args.length >= 1) {
    if (args.includes('-u') || args.includes('--uppercase')) {
        value = args.filter(a => a !== '-u' && a !== '--uppercase')
        if (value.length === 0) {
            process.stderr.write('Error: No value provided for uppercase\n')
            process.exit(1)
        }
        value = value[0].toUpperCase()
        process.stdout.write(`Hello ${value}\n`)
        process.exit(0)
    } else if (args.includes('-h')) {
        process.stdout.write('Usage <option> <value>\n')
        process.stdout.write('available options -u or --uppercase\n')
        process.exit(0)
    } else if (args[0]) {
        process.stdout.write(`Hello ${args[0]}\n`)
        process.exit(0)
    } else {
        process.stderr.write(`Error: Invalid Option\n`)
        process.exit(1)
    }

} else {
    process.stderr.write('Error: Usage <option> <value>\n')
    process.stderr.write('available options -u or --uppercase\n')
    process.exit(1)
}
process.exit(0)