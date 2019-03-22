const log4js = require('log4js')
const logger = log4js.getLogger()

logger.level = 'error'
logger.levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
module.exports = logger
