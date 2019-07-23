const fs = require('bluebird').promisifyAll(require('fs'))

const requireFrom = require('requirefrom')
const requireLib = requireFrom('src/lib')
const requireUtil = requireFrom('src/lib/utils')

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
    ${h.flag('--registry-credentials|-R')}: the location of a JSON file for Swarm auth.
      ${h.optional()}, default is '${h.em('registry-credentials.json')}'
      Adds authentication to all services restored
      Must contain a JSON object following registry authentication format.
      See '${h.em('https://docs.docker.com/engine/api/v1.37/#section/Authentication')}'
`

const defaultCredsPath = 'registry-credentials.json'

class SwarmOutput {
  constructor() {
    this.args = myArgs
    this.argsHelp = myArgsHelp
    this.registryAuth = null
  }

  async validateArgs(args) {
    // Configure registry authentication
    const credsPath = args['--registry-credentials'] || defaultCredsPath

    // Try to read the file.
    try {
      logger.trace('Trying to read credentials file at', credsPath)
      const creds = await fs.readFileAsync(credsPath)
      logger.trace('Got content:', creds)
      this.registryAuth = JSON.parse(creds)
    } catch (e) {
      // If the user did not specify a file and we couldn't find the default, ignore the error.
      if( e.code === 'ENOENT' && credsPath === defaultCredsPath ) {
        return
      }

      logger.fatal(`Could not read ${credsPath}:`)
      throw e
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
        const newConfig = await docker.createConfig(data.configs[key])
        newId = newConfig.id
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
