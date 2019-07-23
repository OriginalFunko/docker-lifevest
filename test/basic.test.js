const { runCli } = require('./utils')

describe('basic functionality', () => {
  test('can run tool', async () => {
    const mocks = await runCli()

    expect(mocks.processExit).toHaveBeenCalledWith(1)

    // Help doc uses console log, logger.fatal uses process.stdout
    expect(mocks.consoleLog).toHaveBeenCalled()
    expect(mocks.processStdout).toHaveBeenCalled()

    mocks.restore()
  })

  test('can get help doc', async () => {
    const mocks = await runCli('--help')

    expect(mocks.consoleLog).toHaveBeenCalled()

    mocks.restore()
  })
})

describe('logging', () => {
  test('can be verbose', async () => {
    const mocks = await runCli('-vvvvv')

    expect(mocks.processExit).toHaveBeenCalledWith(1)
    expect(mocks.consoleLog).toHaveBeenCalled()
    expect(mocks.processStdout).toHaveBeenCalled()

    mocks.restore()
  })

  test('can be quiet', async () => {
    const mocks = await runCli('-q')

    expect(mocks.processExit).toHaveBeenCalledWith(1)
    expect(mocks.consoleLog).toHaveBeenCalled()
    expect(mocks.processStdout).not.toHaveBeenCalled()

    mocks.restore()
  })
})
