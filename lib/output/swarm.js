const fs = require('bluebird').promisifyAll(require('fs'))

const requireFrom = require('requirefrom')
const requireLib = requireFrom('lib')
const requireUtil = requireFrom('lib/utils')

const logger = requireLib('logger')
const dockerSafeParseHost = requireUtil('dockerSafeParseHost')
const h = requireUtil('helpHelper')

const Dockerode = require('simple-dockerode')

// Help documentation to be exported
const myArgs = {
	'--registry-credentials': String,
	'-R': '--registry-credentials',
}

const myArgsHelp = `
		${h.flag('--registry-credentials|-R')}: the location of a JSON file for Swarm.
			${h.optional()}, default is '${h.em('./registry-credentials.json')}'
			This file must be present if your output is '${h.em('swarm')}'.
			Must contain a JSON object following registry authentication format.
			See '${h.em('https://docs.docker.com/engine/api/v1.37/#section/Authentication')}'
`

class SwarmOutput {
	constructor() {
		this.args = myArgs
		this.argsHelp = myArgsHelp
		this.authOptions = null
	}

	async validateArgs(args) {
		if( args['--output'] === 'swarm' ) {
			// Configure registry authentication
			const credsPath = args['--registry-credentials']
			if( !credsPath ) {
				throw new Error('Must have --registry-credentials flag with --output swarm!')
			}

			const creds = await fs.readFileAsync(credsPath)
			this.registryAuth = JSON.parse(creds)
		}
	}

	async method(destination, data) {
		const docker = new Dockerode(dockerSafeParseHost(destination))

		// Put configs into the Swarm.
		const newConfigIdMapping = {}
		await Promise.each(Object.keys(data.configs), async key => {
			const res = await docker.createConfig(data.configs[key])
			newConfigIdMapping[data.configs[key].ID] = res.Id
		})

		// Put secrets into the Swarm.
		const newSecretIdMapping = {}
		await Promise.each(Object.keys(data.secrets), async key => {
			const res = await docker.createSecret(data.secrets[key])
			newSecretIdMapping[data.secrets[key].ID] = res.Id
		})

		// Put services into the Swarm -- remap old to new IDs in configs and secrets
		await Promise.each(Object.keys(data.services), async key => {
			const newService = Object.assign({}, data.services[key])
			logger.trace('Copy of service:', newService)

			// replace configs and secrets
			if( 'Configs' in newService.TaskTemplate ) {
				newService.TaskTemplate.Configs = newService.TaskTemplate.Configs.reduce((acc, config) => {
					if( !(config.ConfigID in newConfigIdMapping) ) {
						logger.warn(`Couldn't find config with ID ${config.ConfigID} in backup! Must drop it!`)
						return acc
					}
					config.ConfigID = newConfigIdMapping[config.ConfigID]
					acc.push(config)
					return acc
				}, [])
			}

			if( 'Secrets' in newService.TaskTemplate ) {
				newService.TaskTemplate.Secrets = newService.TaskTemplate.Secrets.reduce((acc, secret) => {
					if( !(secret.SecretID in newSecretIdMapping) ) {
						logger.warn(`Couldn't find secret with ID ${secret.SecretID} in backup! Must drop it!`)
						return acc
					}
					secret.SecretID = newSecretIdMapping[secret.SecretID]
					acc.push(secret)
					return acc
				}, [])
			}

			// set replicas to 0
			newService.Mode = { Replicated: { Replicas: 0 } }

			logger.trace('After editing:', newService)

			const res = await docker.createService(newService, { authconfig: this.registryAuth })
			logger.trace('Response:', res)
		})
	}
}

module.exports = SwarmOutput
