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

/* eslint-disable indent */
const myArgsHelp = `
    ${h.flag('--registry-credentials|-R')}: the location of a JSON file for Swarm.
      ${h.optional()}, default is '${h.em('registry-credentials.json')}'
      This file must be present if your output is '${h.em('swarm')}'.
      Must contain a JSON object following registry authentication format.
      See '${h.em('https://docs.docker.com/engine/api/v1.37/#section/Authentication')}'
`
/* eslint-enable indent */

class SwarmOutput {
	constructor() {
		this.args = myArgs
		this.argsHelp = myArgsHelp
		this.registryAuth = null
	}

	async validateArgs(args) {
		if( args['--output'] === 'swarm' ) {
			// Configure registry authentication
			const credsPath = args['--registry-credentials']
			let creds
			if( !credsPath ) {
				// Try to read the default file.
				try {
					creds = await fs.readFileAsync('registry-credentials.json')
				} catch (e) {
					logger.fatal('Could not read registry-credentials.json:')
					if( e.code === 'ENOENT' ) {
						throw new Error('registry-credentials.json does not exist; must have --registry-credentials flag with --output swarm!')
					}
					throw e
				}
			} else {
				creds = await fs.readFileAsync(credsPath)
			}

			this.registryAuth = JSON.parse(creds)
		}
	}

	async method(destination, data) {
		const docker = new Dockerode(dockerSafeParseHost(destination))

		// Put configs into the Swarm.
		const newConfigIdMapping = {}
		const existingConfigs = await docker.listConfigs()
		logger.trace('Got existing configs:', existingConfigs)
		await Promise.each(Object.keys(data.configs), async key => {
			let newId = null

			// Search to see if this one already exists by matching on name. If so, use that.
			const existingConfig = existingConfigs.find(config => config.Spec.Name === data.configs[key].Name)
			if( existingConfig ) {
				logger.info(`Config ${key} already exists.`)
				newId = existingConfig.ID
			} else {
				const res = await docker.createConfig(data.configs[key])
				newId = res.Id
			}

			newConfigIdMapping[key] = newId
		})

		// Put secrets into the Swarm.
		const newSecretIdMapping = {}
		const existingSecrets = await docker.listSecrets()
		logger.trace('Got existing secrets:', existingSecrets)
		await Promise.each(Object.keys(data.secrets), async key => {
			let newId = null

			// Search to see if this one already exists by matching on name. If so, use that.
			const existingSecret = existingSecrets.find(secret => secret.Spec.Name === data.secrets[key].Name)
			if( existingSecret ) {
				logger.info(`Secret ${key} already exists.`)
				newId = existingSecret.ID
			} else {
				logger.trace('Creating secret:', data.secrets[key])
				const newSecret = await docker.createSecret(data.secrets[key])
				newId = newSecret.id
			}

			newSecretIdMapping[key] = newId
		})

		logger.trace('Mapping Configs:', newConfigIdMapping, 'Secrets:', newSecretIdMapping)

		// Put services into the Swarm -- remap old to new IDs in configs and secrets
		const existingServices = await docker.listServices()
		await Promise.each(Object.keys(data.services), async key => {
			// Search to see if this one already exists by matching on name. If so, skip.
			const existingService = existingServices.find(services => services.Spec.Name === data.services[key].Name)
			if( existingService ) {
				logger.warn(`Service ${key} already exists.`)
				return true
			}

			const newService = Object.assign({}, data.services[key])
			logger.trace('Copy of service:', JSON.stringify(newService, null, '\t'))

			// replace config and secret IDs.
			if( 'Configs' in newService.TaskTemplate.ContainerSpec ) {
				newService.TaskTemplate.ContainerSpec.Configs = newService.TaskTemplate.ContainerSpec.Configs.reduce((acc, config) => {
					if( !(config.ConfigID in newConfigIdMapping) ) {
						logger.warn(`Couldn't find config with ID ${config.ConfigID} in backup! Must drop it!`)
						return acc
					}
					config.ConfigID = newConfigIdMapping[config.ConfigID]
					acc.push(config)
					return acc
				}, [])
			}

			if( 'Secrets' in newService.TaskTemplate.ContainerSpec ) {
				newService.TaskTemplate.ContainerSpec.Secrets = newService.TaskTemplate.ContainerSpec.Secrets.reduce((acc, secret) => {
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

			logger.trace('After editing:', JSON.stringify(newService, null, '\t'))

			// Be sure to create the service with the magical registry auth.
			await docker.createService(this.registryAuth, newService)
		})
	}
}

module.exports = SwarmOutput
