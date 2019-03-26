const path = require('path')
const fs = require('bluebird').promisifyAll(require('fs'))

module.exports = async function getAllClassesOfType(type) {
  const map = {}

  const possibilities = await fs.readdirAsync(path.join(__dirname, '..', type))

  possibilities.forEach(name => {
    const className = path.parse(name).name

    try {
      const Constructor = require(path.join(__dirname, '..', type, name))
      map[className] = new Constructor()
    } catch (e) {
      e.sidechannel = ['Unable to initialize input:', className]
      throw e
    }
  })

  return map
}
