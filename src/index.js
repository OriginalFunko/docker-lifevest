#! /usr/bin/env node
// Configure Promises
const Promise = require('bluebird')
global.Promise = Promise

process.on('unhandledRejection', function(reason, promise) {
	console.error('unhandledRejection:', reason, promise)
})

const requireFrom = require('requirefrom')
const requireLib = requireFrom('lib')
const requireUtil = requireFrom('lib/utils')
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
	const args = parser.parse()

	if( args['--help'] ) {
		return parser.help()
	}

	// If any class needs to validate args, do so.
	// TODO: add sidechannel errors here
	try {
		await Promise.each(Object.keys(inputs), key => {
			if( 'validateArgs' in inputs[key] ) {
				return inputs[key].validateArgs(args)
			}
			return true
		})

		await Promise.each(Object.keys(outputs), key => {
			if( 'validateArgs' in outputs[key] ) {
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
	const input = inputs[preferredInput].method

	// Configure the output class
	const preferredOutput = args['--output'] || 'folder'
	const destination = args['--destination'] || ('backup-' + (new Date()).toISOString())
	const output = outputs[preferredOutput].method

	// Final validation
	if( !source ) {
		throw new Error('No source specified, must pass --source flag!')
	}

	// Start actual work
	return main(input, source, output, destination)
}

initialize().catch(err => {
	logger.error(err)
	process.exit(1)
})
