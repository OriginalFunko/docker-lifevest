#! /usr/bin/env node
// Configure Promises
const Promise = require('bluebird')
global.Promise = Promise

process.on('unhandledRejection', function(reason, promise) {
  console.error('unhandledRejection:', reason, promise)
})

const requireFrom = require('requirefrom')
const requireLib = requireFrom('src/lib')
const requireUtil = requireFrom('src/lib/utils')
const logger = requireLib('logger')
const getAllClassesOfType = requireUtil('getAllClassesOfType')

const ArgParser = requireLib('parseArgs')

const main = async (input, source, output, destination) => {
  const data = await input(source)
  output(destination, data)
}

const initialize = async () => {
  // Initialize all classes to retrieve dynamic flags and help text
  let inputs, outputs
  try {
    inputs = await getAllClassesOfType('input')
    outputs = await getAllClassesOfType('output')
  } catch (e) {
    // give a little more info from sidechannel
    if( 'sidechannel' in e ) {
      logger.fatal(...e.sidechannel, e)
    }
    throw e
  }

  const parser = new ArgParser([...Object.values(inputs), ...Object.values(outputs)])

  let args
  try {
    args = parser.parse()
  } catch (e) {
    await parser.help()
    throw e
  }

  if( args['--help'] ) {
    return parser.help()
  }

  if( args['--verbose'] ) {
    // Increase the log level for a step every time
    while( args['--verbose'] > 0 ) {
      logger.raiseLevel()
      args['--verbose'] -= 1
    }
  }

  if( args['--quiet'] ) {
    logger.silence()
  }

  // If any class needs to validate args, do so.
  try {
    await Promise.each(Object.keys(inputs), key => {
      if( args['--input'] === key && 'validateArgs' in inputs[key] ) {
        return inputs[key].validateArgs(args)
      }
      return true
    })

    await Promise.each(Object.keys(outputs), key => {
      if( args['--output'] === key && 'validateArgs' in outputs[key] ) {
        return outputs[key].validateArgs(args)
      }
      return true
    })
  } catch (e) {
    await parser.help()
    throw e
  }

  // Configure the input class
  const preferredInput = args['--input'] || 'swarm'
  const source = args['--source']
  logger.trace(inputs)
  const input = inputs[preferredInput].method.bind(inputs[preferredInput])

  // Configure the output class
  const preferredOutput = args['--output'] || 'folder'
  const destination = args['--destination'] || ('backup-' + (new Date()).toISOString())
  const output = outputs[preferredOutput].method.bind(outputs[preferredOutput])

  // Final validation
  if( !source ) {
    await parser.help()
    throw new Error('No source specified, must pass --source flag!')
  }

  // Start actual work
  return main(input, source, output, destination)
}

initialize().catch(err => {
  logger.fatal(err)
  process.exit(1)
})
