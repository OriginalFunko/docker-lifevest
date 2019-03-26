const path = require('path')
const fs = require('bluebird').promisifyAll(require('fs'))
const arg = require('arg')
const chalk = require('chalk')

const requireFrom = require('requirefrom')
const requireUtil = requireFrom('src/lib/utils')
const h = requireUtil('helpHelper')

const defaultArgs = {
  // Types
  '--help': Boolean,
  '--verbose': arg.COUNT,
  '--quiet': Boolean,
  '-?': '--help',

  // Aliases
  '-v': '--verbose',
  '-q': '--quiet',

  '--input': String,
  '--source': String,
  '-i': '--input',
  '--in': '--input',
  '-s': '--source',

  '--output': String,
  '--destination': String,
  '-o': '--output',
  '--out': '--output',
  '-d': '--destination',
  '--dest': '--destination',
}

class ArgParser {
  constructor(classes) {
    this.otherArgs = []
    this.otherHelps = []

    classes.forEach(item => {
      if( 'args' in item ) { this.otherArgs.push(item.args) }
      if( 'argsHelp' in item ) { this.otherHelps.push(item.argsHelp) }
    })
  }

  parse() {
    const args = arg(Object.assign({}, defaultArgs, ...this.otherArgs))
    return args
  }

  async help() {
    const validInputs = await fs.readdirAsync(path.join(__dirname, 'input'))
    const validOutputs = await fs.readdirAsync(path.join(__dirname, 'output'))

    console.log(`
${h.header('docker-lifevest')} [--input type] --source sourceIPOrDir [--output type] [--destination destIPOrDir]

  This program can backup and restore the configuration of a Docker Swarm.
  To use, specify a source and destination.

  ${h.header('Flags:')}
    ${h.flag('--input|--in|-i')}: the type of input. ${h.optional()}, default is '${h.em('swarm')}'.
      Valid values: ${validInputs.join(', ')}.

    ${h.flag('--source|-s')}: the source of the input. ${h.required()}.
      For input ${h.em('swarm')}, this is like Docker's -H flag.
      For input ${h.em('folder')}, this is a path to a previous backup.

    ${h.flag('--output|--out|-o')}: the type of output. ${h.optional()}, default is '${h.em('folder')}'.
      Valid values: ${validOutputs.join(', ')}.

    ${h.flag('--destination|--dest|-d')}: the destination of the output.
      ${h.required()} for output ${h.em('swarm')}, this is like Docker's -H flag.
      ${h.optional()} for output ${h.em('folder')}, default is a date-stamped backup folder.
    ${this.otherHelps.join('\n\n')}
    ${h.flag('--verbose|-v')}: Raises the log level by one step every time it is used.
      Default is '${chalk.red('error')}', next steps are ${chalk.yellow('warn')}, ${chalk.green('info')}, ${chalk.cyan('debug')}, ${chalk.blue('trace')}.

    ${h.flag('--quiet|-q')}: Silences all logging.

  ${h.header('Recipes:')}
    To backup a Swarm to a folder:
    -s mySwarmIP

    To copy one Swarm to another:
    -s sourceIP -o swarm -d destIP

    To restore a Swarm from a folder:
    -i folder -s backup-20XX-01-01T00-00-00-000Z -o swarm -d destIP
`.trim())
  }
}

module.exports = ArgParser
