const fs = require('bluebird').promisifyAll(require('fs'))
const path = require('path')

class FolderOutput {
  async method (destination, data) {
    const date = (new Date()).toISOString().replace(/:|\./g, '-')
    const folder = `backup-${date}`

    const services = path.join(folder, 'services')
    const configs = path.join(folder, 'configs')
    const secrets = path.join(folder, 'secrets')

    await fs.mkdirAsync(folder)
    await Promise.all([
      fs.mkdirAsync(services),
      fs.mkdirAsync(configs),
      fs.mkdirAsync(secrets),
    ])

    const writeAll = subfolder => {
      return Promise.each(Object.keys(data[subfolder]), key => fs.writeFileAsync(
        path.join(folder, subfolder, key),
        JSON.stringify(data[subfolder][key]),
      ))
    }

    return Promise.all([
      writeAll('services'),
      writeAll('configs'),
      writeAll('secrets'),
    ])
  }
}

module.exports = FolderOutput
