#! /usr/bin/env node
// Configure Promises
const Promise = require('bluebird')
global.Promise = Promise

Promise.config({
	// Enable warnings
	warnings: true,
	// Enable long stack traces
	longStackTraces: true,
	// Enable cancellation
	cancellation: true,
	// Enable monitoring
	monitoring: true
})

process.on('unhandledRejection', function(reason, promise) {
	console.error('unhandledRejection:', reason, promise)
})

const url = require('url')
const requireFrom = require('requirefrom')
const requireLib = requireFrom('lib')
const requireRoot = requireFrom('/')
const logger = requireLib('logger')
const base64url = require('base64url')

const parseArgs = requireLib('parseArgs')

const args = parseArgs()

const secretServiceName = 'lifevest-backup'

// Put together initialization options for Dockerode
const hostOptions = {
	protocol: 'http',
	port: 2375,
	version: 'v1.37',
	Promise,
}

const parsedHostUrl = url.parse(args['--host'])
if( parsedHostUrl.host === null && parsedHostUrl.pathname !== null ) {
	// Plain hostname parses wrong.
	hostOptions.host = parsedHostUrl.pathname
} else {
	Object.assign(hostOptions, parsedHostUrl)
}

// Set up Dockerode
const Dockerode = require('simple-dockerode')
const docker = new Dockerode(hostOptions)

// Configure registry authentication
const authconfig = requireRoot('registry-credentials.json')
const defaultOptions = { authconfig }

function listToMap(rawList) {
	return rawList.reduce((acc, item) => {
		acc[item.ID] = item.Spec
		return acc
	}, {})
}

async function main() {
	// Get all services
	const services = listToMap(await docker.listServices(defaultOptions))
	logger.info('Retrieved services.')

	// Get all configs
	const configs = listToMap(await docker.listConfigs(defaultOptions))
	logger.info('Retrieved configs.')

	// Get all secrets
	const secrets = listToMap(await docker.listSecrets(defaultOptions))
	logger.info('Retrieved secret listing.')

	if( Object.keys(secrets).length > 0 ) {
		// Second step to getting all secrets: launch a special service that can retrieve secret content.
		// Check to see that we have an active node.
		const nodes = await docker.listNodes(defaultOptions)
		logger.debug('Retrieved nodes:', nodes)
		if( !nodes.some(node => node.Status.State === 'ready') ) {
			logger.error('Secrets exist that must be retrieved, but there are no nodes that can run a service!')
			logger.error('Secrets can only be retrieved by running a service.')
			throw new Error()
		}

		// Create a service that does nothing, but has all the secrets.
		const secretService = await docker.createService(Object.assign({}, defaultOptions, {
			Name: secretServiceName,
			Mode: { Replicated: { Replicas: 1 } },
			TaskTemplate: {
				ContainerSpec: {
					Image: 'alpine:latest',
					Command: ['sleep', '999999'],
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
				},
			},
		}))
		logger.info('Created lifevest service to retrieve secrets')
		logger.trace(secretService)

		// Create this ahead of time to be used on failures.
		const cleanupSecretService = () => {
			return secretService.remove()
		}

		// Wait for the service to have a working container.
		let secretTask = null
		let tries = 30
		while( secretTask === null && tries > 0 ) {
			const taskListing = await docker.listTasks({filters: JSON.stringify({service: [secretServiceName], 'desired-state': ['running']})})
			logger.trace('Got tasks listing:', taskListing)

			// As desired-state only returns the state it wants to be, not the state it is, do one more filter.
			const possibleTask = taskListing.find(task => task.Status.State === 'running')

			if( possibleTask ) {
				secretTask = possibleTask
			} else {
				tries--
				logger.trace('Waiting 1 sec. Remaining tries:', tries)
				await Promise.delay(1000)
			}
		}

		logger.debug('Got task:', secretTask)
		if( !secretTask ) {
			logger.error('Something went wrong while getting the secret-retrieval task! Cleaning up secret service...')
			await cleanupSecretService()
			throw new Error()
		}

		if( secretTask.ServiceID !== secretService.id || secretTask.Status.State !== 'running' ) {
			logger.error('Something went wrong while filtering tasks! Cleaning up secret service...')
			await cleanupSecretService()
			throw new Error()
		}

		// Set up a new Dockerode to exec into that instance.
		const secretServiceNode = nodes.find(node => node.ID === secretTask.NodeID)

		if( !secretServiceNode ) {
			logger.error('Could not find the node that holds the secret task! Cleaning up secret service...')
			await cleanupSecretService()
			throw new Error()
		}

		const secretDockerode = new Dockerode({
			Promise,
			host: secretServiceNode.Status.Addr,
			protocol: 'http',
			port: 2375,
			version: 'v1.37',
		})

		const secretContainer = await secretDockerode.getContainer(secretTask)
		logger.debug('Got secret container:', secretContainer)

		// Grab all the secrets
		await Promise.each(Object.keys(secrets), async secretID => {
			// const results = await secretContainer.exec(['sh', '-c', `cat /${secretID}.secret | base64`], {stdout: true, stderr: true})
			const results = await secretContainer.exec(['cat', `/${secretID}.secret`], {stdout: true, stderr: true})
			if( results.inspect.ExitCode !== 0 ) {
				// This file obviously doesn't exist, we get an exit code of 1
				logger.error(`When getting ${secretID}, got exit ${results.inspect.ExitCode}! Stderr:`, results.stderr)
				throw new Error(results.stderr)
			} else {
				logger.trace('Got secret:', secretID, results)
				secrets[secretID].Data = base64url.encode(results.stdout)
			}
		})

		logger.debug('Final secrets:', secrets)

		logger.info('Cleaning up service.')
		await cleanupSecretService()
	}

	// Now, output all of it.
	logger.warn('Services:', services)
	logger.warn('Configs:', configs)
	logger.warn('Secrets:', secrets)
}
main()
