const arg = require('arg')

function parseArgs() {
	const args = arg({
		// Types
		'--help': Boolean,
		// '--version': Boolean,
		'--verbose': arg.COUNT,
		'--host': String,
		// '--name': String,
		// '--tag': [String],

		// Aliases
		'-v': '--verbose',
		'-H': '--host',
	})
	return args
}

module.exports = parseArgs
