const path = require('path')
const fs = require('fs').promises
const temp = require('temp').track()
const mockProcess = require('jest-mock-process')
const Dockerode = require('simple-dockerode')
const getUnusedPort = require('get-unused-port')
const randomWords = require('random-words')
const cli = require('../src/cli.js')
const execa = require('execa')

const imageTag = 'docker:dind'

// FS methods that wait until files are flushed.
const waitATick = () => new Promise(resolve => setTimeout(resolve, 100))

const readdirEventually = async dir => {
  let output = []
  let waitTicks = 10
  while( output.length === 0 && waitTicks > 0 ) {
    try {
      output = await fs.readdir(dir)
    } catch ( err ) {
      if( err.code !== 'ENOENT' ) {
        throw err
      }
    }

    if( output.length === 0 ) {
      await waitATick()
      waitTicks--
    }
  }

  if( waitTicks === 0 ) {
    throw new Error(dir + ' did not settle while waiting for it!')
  }

  return output
}

const readFileEventually = async filePath => {
  let output
  let waitTicks = 10
  while( !output && waitTicks > 0 ) {
    try {
      output = await fs.readFile(filePath)
    } catch ( err ) {
      if( err.code !== 'ENOENT' ) {
        throw err
      }
    }

    if( !output ) {
      await waitATick()
      waitTicks--
    }
  }
  return output
}

/**
 * A class to initialize, manage, and match against a Docker-in-Docker Swarm.
 *
 * @class SwarmHarness
 */
class SwarmHarness {
  /**
   * Creates an instance of SwarmHarness.
   *
   * @memberof SwarmHarness
   * @constructs SwarmHarness
   */
  constructor() {
    this.hostDocker = new Dockerode()
  }

  /**
   * Initialize the harness. Async function.
   *
   * @memberof SwarmHarness
   * @returns {Promise} - When resolved, initialization is complete.
   * @throws Error
   */
  async init() {
    const port = await getUnusedPort()
    this.port = port

    // // Run a fresh Docker on this unused port.
    // this.swarmContainer = await this.hostDocker.createContainer({
    //   image: imageTag,
    //   create_options: {
    //     Env: [ `PORT=${port}` ],
    //     HostConfig: {
    //       PortBindings: { '2375/tcp': [{ HostPort: `${port}` }] },
    //       Privileged: true,
    //       SecurityOpt: [
    //         'label=disable',
    //         'apparmor=unconfined',
    //         'seccomp=unconfined',
    //       ],
    //     },
    //   },
    // })
    //
    // await this.swarmContainer.start()

    // For some reason API creation doesn't work?! Time to be jank!
    const { stdout } = await execa('docker', ['run', '-d', '--privileged', '-e', `PORT=${port}`, '-p', `${port}:2375`, imageTag])
    const containerId = stdout.trim()
    this.swarmContainer = await this.hostDocker.getContainer(containerId)

    // Initialize a Swarm within the container
    try {
      this.swarm = new Dockerode({ host: '127.0.0.1', port })

      // Let the new Docker-in-Docker settle.
      let swarmInitialized = false
      let waitTicks = 10
      while( !swarmInitialized && waitTicks > 0 ) {
        try {
          await this.swarm.swarmInit({ ListenAddr: `0.0.0.0:${port}`, AdvertiseAddr: `127.0.0.1:${port}` })
          swarmInitialized = true
        } catch ( err ) {
          if( err.code !== 'ECONNRESET' ) {
            throw err
          }
          await waitATick()
          waitTicks--
        }
      }
    } catch ( err ) {
      console.error('Error while initializing Swarm in harness:', err)
      await this.destroy()
      throw err
    }
  }

  /**
   * In this initialized Swarm, generate and create a new service with a config and secret.
   *
   * @memberof SwarmHarness
   * @returns {Promise}                  - When resolved, gives an object of the created items.
   * @property {object} config           - Created config object
   * @property {object} config.obj       - The config object as returned from Dockerode
   * @property {string} config.content   - The content of the config.
   * @property {object} config.document  - The whole document object of the config.
   * @property {object} secret           - Created secret object
   * @property {object} secret.obj       - The secret object as returned from Dockerode
   * @property {string} secret.content   - The content of the secret.
   * @property {object} secret.document  - The whole document object of the secret.
   * @property {object} service          - Created service object
   * @property {object} service.obj      - The service object as returned from Dockerode
   * @property {object} service.document - The whole document object of the service.
   */
  async createRandomService() {
    const configName = 'config-' + randomWords({ exactly: 2, join: '-' })
    const configContent = randomWords({ exactly: 5, wordsPerString: 2, join: '\n' })
    const configDocument = {
      Name: configName,
      Data: Buffer.from(configContent).toString('base64'),
    }
    const config = await this.swarm.createConfig(configDocument)

    const secretName = 'secret-' + randomWords({ exactly: 2, join: '-' })
    const secretContent = randomWords({ exactly: 5, wordsPerString: 2, join: '\n' })
    const secretDocument = {
      Name: secretName,
      Data: Buffer.from(secretContent).toString('base64'),
    }
    const secret = await this.swarm.createSecret(secretDocument)

    const serviceName = 'service-' + randomWords({ exactly: 3, join: '-' })
    const serviceDocument = {
      Name: serviceName,
      Labels: {},
      TaskTemplate: {
        ContainerSpec: {
          Image: 'alpine:latest',
          Secrets: [{
            File: {
              Name: secretName,
              UID: '0',
              GID: '0',
              Mode: 444,
            },
            SecretID: secret.id,
            SecretName: secretName,
          }],
          Configs: [{
            File: {
              Name: configName,
              UID: '0',
              GID: '0',
              Mode: 444,
            },
            ConfigID: config.id,
            ConfigName: configName,
          }],
        },
      },
      Mode: { Replicated: { Replicas: 0 } },
    }

    const service = await this.swarm.createService(serviceDocument)

    return {
      config: {
        obj: config,
        content: configContent,
        document: configDocument,
      },
      secret: {
        obj: secret,
        content: secretContent,
        document: secretDocument,
      },
      service: {
        obj: service,
        document: serviceDocument,
      },
    }
  }

  /**
   * Create a number of random services for this initialized Swarm.
   *
   * @memberof SwarmHarness
   * @param {number} [numOfServices=2] - The number of services to generate
   * @returns {Promise} - When resolved, all services are generated.
   */
  async populateServices(numOfServices = 2) {
    // Create some random services
    const services = []
    const configs = []
    const secrets = []

    while( numOfServices > 0 ) {
      const newPayload = await this.createRandomService()
      services.push(newPayload.service)
      configs.push(newPayload.config)
      secrets.push(newPayload.secret)
      numOfServices--
    }

    this.services = services
    this.configs = configs
    this.secrets = secrets
  }

  /**
   * Read in a backup folder and match its objects to this Swarm.
   *
   * @memberof SwarmHarness
   * @param {object} expect - The `expect` object to use for assertions.
   * @param {string} folder - A path to read that should match this Swarm's services.
   * @returns {Promise}     - Resolves to the number of `expect` assertions made in this function.
   */
  async expectBackupToMatch(expect, folder) {
    let assertions = 0

    // Expect folders
    const backupFolderContents = await readdirEventually(folder)
    expect(backupFolderContents).toEqual(['configs', 'secrets', 'services'])
    assertions++

    // Expect documents in folders to equal services, secrets, and configs created initially.
    const backupEqual = key => this[`${key}s`].map(async item => {
      const filePath = path.join(folder, `${key}s`, item.obj.id)
      const fileContents = await readFileEventually(filePath)
      let fileJson

      try {
        fileJson = JSON.parse(fileContents)
      } catch ( err ) {
        throw new Error('Error while parsing JSON from ' + filePath + ' contents: ' + fileContents)
      }

      // There may be some additional properties created by Swarm, so we aren't checking for total equality.
      expect(fileJson).toMatchObject(item.document)
      assertions++
    })

    await Promise.all(
      backupEqual('service')
        .concat(backupEqual('config'))
        .concat(backupEqual('secret'))
    )

    return assertions
  }

  /**
   * Read in a backup folder and match its objects to this Swarm, assuming that certain IDs won't match.
   *
   * @memberof SwarmHarness
   * @param {object} expect - The `expect` object to use for assertions.
   * @param {string} folder - A path to read that should match this Swarm's services.
   * @returns {Promise}     - Resolves to the number of `expect` assertions made in this function.
   * @memberof SwarmHarness
   */
  async expectBackupToMatchLoose(expect, folder) {
    let assertions = 0

    // Expect folders
    const backupFolderContents = await readdirEventually(folder)
    expect(backupFolderContents).toEqual(['configs', 'secrets', 'services'])
    assertions++

    const readTree = async key => {
      const listOfFiles = await readdirEventually(path.join(folder, key))
      const fileContents = await Promise.map(listOfFiles, x => readFileEventually(path.join(folder, key, x)))
      return fileContents.map(x => JSON.parse(x))
    }

    const subfolderContents = {
      configs: await readTree('configs'),
      services: await readTree('services'),
      secrets: await readTree('secrets'),
    }

    // Expect documents in folders to equal services, secrets, and configs created initially.
    const itemHasBackup = key => this[`${key}s`].map(async item => {
      const foundObject = subfolderContents[`${key}s`].find(x => x.Name === item.document.Name)

      // Remove any of the internal IDs that have changed when the objects were recreated.
      if( 'TaskTemplate' in item.document && 'ContainerSpec' in item.document.TaskTemplate ) {
        if( 'Configs' in item.document.TaskTemplate.ContainerSpec ) {
          item.document.TaskTemplate.ContainerSpec.Configs.forEach(x => delete x.ConfigID)
        }

        if( 'Secrets' in item.document.TaskTemplate.ContainerSpec ) {
          item.document.TaskTemplate.ContainerSpec.Secrets.forEach(x => delete x.SecretID)
        }
      }

      expect(foundObject).toMatchObject(item.document)
      assertions++
    })

    await Promise.all(
      itemHasBackup('service')
        .concat(itemHasBackup('config'))
        .concat(itemHasBackup('secret'))
    )

    return assertions
  }

  /**
   * Destroy this harness.
   *
   * @memberof SwarmHarness
   * @returns {Promise} - When resolved, destruction is complete.
   */
  async destroy() {
    if( this.swarmContainer ) {
      await this.swarmContainer.kill()
      await this.swarmContainer.remove()
    }
  }
}

/**
 * Pass all arguments to this function as arguments to run Lifevest.
 *
 * @param {...string} args          - An array of arguments to Lifevest.
 * @returns {Promise}               - Resolves to the process' mocked console functions and a method for restoring them
 * @property {object} consoleLog    - A Jest.fn for console.log
 * @property {object} processExit   - A Jest.fn for process.exit
 * @property {object} processStdout - A Jest.fn for process.stdout
 * @property {Function} restore     - Call this at the end to restore all the mocks at once.
 */
async function runCli (...args) {
  // Sandbox process methods before run
  const consoleLog = mockProcess.mockConsoleLog()
  const processExit = mockProcess.mockProcessExit()
  const processStdout = mockProcess.mockProcessStdout()

  // Change the process to a temporary dir and execute the script
  const tempDir = temp.mkdirSync()
  process.chdir(tempDir)
  await cli(args)

  return {
    consoleLog,
    processExit,
    processStdout,
    restore: () => {
      // Un-sandbox process methods when finished inspecting.
      consoleLog.mockRestore()
      processExit.mockRestore()
      processStdout.mockRestore()
    },
  }
}

/**
 * Given a mock function, assume it's output only a JSON blob and parse it.
 *
 * @param {object} fn - A Jest.fn
 * @returns {object}  - The parsed object from JSON
 * @throws Error
 */
function extractJsonFromMock(fn) {
  try {
    return JSON.parse(fn.mock.calls.join(''))
  } catch ( err ) {
    throw new Error('Error while parsing JSON from mock output. Received:' + JSON.stringify(fn.mock.calls))
  }
}

/**
 * Create a Swarm harness with a certain number of services.
 *
 * @param {number} numOfServices - Number of services to generate.
 * @returns {SwarmHarness}       - The new harness.
 */
async function createStockHarness (numOfServices) {
  const harness = new SwarmHarness()
  await harness.init()
  await harness.populateServices(numOfServices)

  return harness
}

/**
 * Given a function, create a harness and pass it to the function.
 * Wrap for errors and destroy the harness when complete or errored.
 *
 * @param {Function} func - The async function to run as a test.
 * @returns {Function}    - A function to give to Jest
 */
function withHarness (func) {
  return async () => {
    let harness

    try {
      harness = await createStockHarness()
      await func(harness)
      await harness.destroy()
    } catch (e) {
      console.error('Error when running harness func:', e, e.stack)
      if( harness ) {
        await harness.destroy()
      }
      throw e
    }
  }
}

module.exports = {
  runCli,
  createStockHarness,
  withHarness,
  SwarmHarness,
  extractJsonFromMock,
}
