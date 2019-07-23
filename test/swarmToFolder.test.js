const temp = require('temp').track()
const { runCli, withHarness, extractJsonFromMock } = require('./utils')

describe('backup Swarm to folder', () => {
  jest.setTimeout(30 * 1000)

  test('can backup to timestamped folder with porcelain output', withHarness(async harness => {
    const source = `localhost:${harness.port}`
    const mocks = await runCli('-s', source, '--porcelain')

    // Help doc uses console log, logger.fatal uses process.stdout
    // Porcelain outputs a JSON blob, but does not use process.stdout
    await expect(mocks.consoleLog).toHaveBeenCalled()

    // Parse and test porcelain output
    let output
    await expect(() => {
      output = extractJsonFromMock(mocks.consoleLog)
    }).not.toThrow()

    await expect(output).toHaveProperty('input', 'swarm')
    await expect(output).toHaveProperty('output', 'folder')
    await expect(output).toHaveProperty('source', source)
    await expect(output).toHaveProperty('destination')

    const backupAssertions = await harness.expectBackupToMatch(expect, output.destination)
    expect.assertions(6 + backupAssertions)
    mocks.restore()
  }))

  // Tests without porcelain and default folder are hard to verify -- we'd have to guess at the folder name.
  // Verbosity is incompatible with porcelain, so that combination is not done.
  // Verbosity is therefore only tested with custom folder. This should be fine.

  test('can backup to custom folder', withHarness(async harness => {
    const outDir = temp.path()
    const mocks = await runCli('-s', `localhost:${harness.port}`, '-d', outDir)

    // Help doc uses console log, logger.fatal uses process.stdout
    // The tool should say nothing when verbosity is off and porcelain is not enabled.
    await expect(mocks.consoleLog).not.toHaveBeenCalled()
    await expect(mocks.processStdout).not.toHaveBeenCalled()

    const backupAssertions = await harness.expectBackupToMatch(expect, outDir)
    expect.assertions(2 + backupAssertions)
    mocks.restore()
  }))

  test('can backup to custom folder verbosely', withHarness(async harness => {
    const outDir = temp.path()
    const mocks = await runCli('-s', `localhost:${harness.port}`, '-d', outDir, '-vvvvv')

    // Help doc uses console log, logger.fatal uses process.stdout
    // The tool should say a lot when verbosity is on
    await expect(mocks.processStdout).toHaveBeenCalled()

    const backupAssertions = await harness.expectBackupToMatch(expect, outDir)
    expect.assertions(1 + backupAssertions)
    mocks.restore()
  }))
})
