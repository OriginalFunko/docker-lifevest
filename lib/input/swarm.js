const requireFrom = require('requirefrom')
const requireLib = requireFrom('lib')
const requireUtil = requireFrom('lib/utils')

const logger = requireLib('logger')
const listToMap = requireUtil('dockerListToMap')
const dockerSafeParseHost = requireUtil('dockerSafeParseHost')

const Dockerode = require('simple-dockerode')
const base64url = require('base64url')

const secretServiceName = 'lifevest-backup'

class SwarmInput {
	async method(source) {
		// Set up Dockerode
		const docker = new Dockerode(dockerSafeParseHost(source))

		// Get all services
		const services = listToMap(await docker.listServices())
		logger.info('Retrieved services.')
		logger.trace(services)

		// Get all configs
		const configs = listToMap(await docker.listConfigs())
		logger.info('Retrieved configs.')
		logger.trace(configs)

		// Get all secrets
		const secrets = listToMap(await docker.listSecrets())
		logger.info('Retrieved secret listing.')
		logger.trace(secrets)

		if( Object.keys(secrets).length > 0 ) {
			// Second step to getting all secrets: launch a special service that can retrieve secret content.
			// Check to see that we have an active node.
			logger.debug('Retrieving node listing...')
			const nodes = await docker.listNodes()
			logger.trace('Retrieved nodes:', nodes)
			if( !nodes.some(node => node.Status.State === 'ready') ) {
				throw new Error('Secrets exist that must be retrieved, but there are no nodes that can run a service! Secrets can only be retrieved by running a service.')
			}

			// Create a service that echoes out all the secrets for us to consume.
			logger.debug('Creating secret service...')
			const secretService = await docker.createService({
				Name: secretServiceName,
				Mode: { Replicated: { Replicas: 1 } },
				TaskTemplate: {
					ContainerSpec: {
						Image: 'alpine:latest',
						// Mount all the secrets at the root with unique filenames
						Secrets: Object.keys(secrets).map(secretID => ({
							SecretID: secretID,
							SecretName: secrets[secretID].Name,
							File: {
								Name: `/${secretID}.secret`,
								UID: '0',
								GID: '0',
								Mode: 666,
							},
						})),
						// Run a script on startup that dumps them all.
						/* eslint-disable indent */
						Command: ['sh', '-c'].concat([
							'echo -----BEGIN-----',
							'for i in /*.secret',
								'do echo $i',
								'cat $i | base64',
								'echo -----NEXT-----',
							'done',
							'echo -----END-----',
						].join('; ')),
						/* eslint-enable indent */

					},
					// Do it only once, and don't start up again.
					RestartPolicy: { Condition: 'none' },
				},
			})
			logger.info('Created lifevest service to retrieve secrets')
			logger.trace(secretService)

			// Create this ahead of time to be used on failures.
			const cleanupSecretService = () => {
				return secretService.remove()
			}

			// For everything next, if there is any error, clean up the temp service before dying
			try {
				// Wait for the service to finish
				let logs = ''
				let logsFinished = false
				let tries = 30
				while( !logsFinished && tries > 0 ) {
					logs = await secretService.logs({stdout: true})

					if( logs.includes('-----END-----') ) {
						logsFinished = true
					} else {
						tries--
						logger.trace('Waiting 1 sec. Remaining tries:', tries)
						await Promise.delay(1000)
					}
				}

				if( tries === 0 ) {
					throw new Error('Timeout expired while waiting for secret service to finish!')
				}

				// Process the hideous mess that is returned from service logs.
				logs = logs.split('\n').map(x => x.slice(8))

				let currentSecret = null
				let currentSecretBuffer = ''
				logs.forEach(line => {
					if( !line || line === '' || line === '-----BEGIN-----' || line === '-----END-----' ) { return }

					if( line === '-----NEXT-----' ) {
						// Re-encode the normal Base64 to RFC4648 Base64.
						secrets[currentSecret].Data = base64url.encode(Buffer.from(currentSecretBuffer, 'base64'))

						// Reset the buffers
						currentSecret = null
						currentSecretBuffer = ''
					} else if( currentSecret === null ) {
						currentSecret = line.split('.')[0].slice(1)
					} else {
						currentSecretBuffer += line.trim()
					}
				})

				if( Object.keys(secrets).some(secretID => !('Data' in secrets[secretID])) ) {
					logger.trace(secrets)
					throw new Error('Not all secrets were retrieved from the secret service! Check dumped information (on trace level).')
				}
			} catch (e) {
				logger.fatal('Error encountered while retrieving secrets from the swarm:', e)
				logger.info('Cleaning up temporary service...')
				await cleanupSecretService()
				throw e
			}

			logger.info('Cleaning up temporary service.')
			await cleanupSecretService()
		}

		return {services, configs, secrets}
	}
}

module.exports = SwarmInput