const fs = require('bluebird').promisifyAll(require('fs'))
const path = require('path')

class FolderInput {
	async method(source) {
		const readAll = async subfolder => {
			const items = await fs.readdirAsync(path.join(source, subfolder))
			return Promise.reduce(items, async (acc, item) => {
				const rawData = await fs.readFileAsync(path.join(source, subfolder, item))
				acc[item] = JSON.parse(rawData)
				return acc
			}, {})
		}

		return Promise.props({
			services: readAll('services'),
			configs: readAll('configs'),
			secrets: readAll('secrets'),
		})
	}
}

module.exports = FolderInput
