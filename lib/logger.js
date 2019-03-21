const log4js = require('log4js')
const logger = log4js.getLogger()

logger.level = 'trace'

if( process.env.WRAPPER_LOG_LEVEL ) {
	logger.level = process.env.WRAPPER_LOG_LEVEL
}

logger.debug('Logger initialized.')

module.exports = logger
