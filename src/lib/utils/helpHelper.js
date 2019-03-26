const chalk = require('chalk')

const header = chalk.bold.cyan
const flag = chalk.bold
const optional = () => chalk.blue('Optional')
const required = () => chalk.yellow('Required')
const em = chalk.green

module.exports = {
  header,
  flag,
  optional,
  required,
  em,
}
