const { runCli, withHarness, extractJsonFromMock } = require('./utils')

describe('backup a folder to another folder', () => {
  jest.setTimeout(30 * 1000)

  test('can copy one folder to another', withHarness(async harness => {
    const source = `localhost:${harness.port}`

    // Backup the source Swarm to a folder.
    const firstMocks = await runCli('-s', source, '--porcelain')
    await expect(firstMocks.consoleLog).toHaveBeenCalled()

    // Parse porcelain output
    let sourceOutput
    await expect(() => {
      sourceOutput = extractJsonFromMock(firstMocks.consoleLog)
    }).not.toThrow()
    firstMocks.restore()

    await expect(sourceOutput).toHaveProperty('input', 'swarm')
    await expect(sourceOutput).toHaveProperty('output', 'folder')
    await expect(sourceOutput).toHaveProperty('source', source)
    await expect(sourceOutput).toHaveProperty('destination')

    // Transfer that folder to the destination Swarm.
    const secondMocks = await runCli('-i', 'folder', '-s', sourceOutput.destination, '--porcelain')
    await expect(secondMocks.consoleLog).toHaveBeenCalled()

    // Parse porcelain output from second output
    let destOutput
    await expect(() => {
      destOutput = extractJsonFromMock(secondMocks.consoleLog)
    }).not.toThrow()
    secondMocks.restore()

    await expect(destOutput).toHaveProperty('input', 'folder')
    await expect(destOutput).toHaveProperty('output', 'folder')
    await expect(destOutput).toHaveProperty('source', sourceOutput.destination)
    await expect(destOutput).toHaveProperty('destination')

    // Expect the original Swarm to match the second backup.
    const backupAssertions = await harness.expectBackupToMatch(expect, destOutput.destination)
    expect.assertions(12 + backupAssertions)
  }))
})
