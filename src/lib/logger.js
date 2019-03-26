const log4js = require('log4js')
const logger = log4js.getLogger()

logger.level = 'error'
logger.levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

// Convenience methods
logger.raiseLevel = function() {
  const thisLevelIdx = this.levels.indexOf(this.level.levelStr.toLowerCase())
  this.level = this.levels[Math.min(this.levels.length - 1, thisLevelIdx + 1)]
}

logger.silence = function() {
  this.level = 'off'
}

module.exports = logger
