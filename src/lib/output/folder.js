const fs = require('fs')
const path = require('path')

class FolderOutput {
  async method (destination, data) {
    const services = path.join(destination, 'services')
    const configs = path.join(destination, 'configs')
    const secrets = path.join(destination, 'secrets')

    fs.mkdirSync(destination)
    fs.mkdirSync(services)
    fs.mkdirSync(configs)
    fs.mkdirSync(secrets)

    const writeAll = subfolder =>
      Object.keys(data[subfolder])
        .forEach(key => fs.writeFileSync(
          path.join(destination, subfolder, key),
          JSON.stringify(data[subfolder][key]),
        ))

    writeAll('services')
    writeAll('configs')
    writeAll('secrets')
  }
}

module.exports = FolderOutput
