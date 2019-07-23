const { runCli, createStockHarness, withHarness, extractJsonFromMock } = require('./utils')

describe('restore folder to Swarm', () => {
  jest.setTimeout(30 * 1000)

  test('can restore clean Swarm from backup', withHarness(async sourceHarness => {
    // Set up destination harness without any services.
    let destHarness

    try {
      destHarness = await createStockHarness(0)

      const source = `localhost:${sourceHarness.port}`
      const dest = `localhost:${destHarness.port}`

      // Backup the source Swarm to a folder.
      const firstMocks = await runCli('-s', source, '--porcelain')
      await expect(firstMocks.consoleLog).toHaveBeenCalled()

      // Parse porcelain output
      let sourceOutput
      await expect(() => {
        sourceOutput = extractJsonFromMock(firstMocks.consoleLog)
      }).not.toThrow()

      await expect(sourceOutput).toHaveProperty('input', 'swarm')
      await expect(sourceOutput).toHaveProperty('output', 'folder')
      await expect(sourceOutput).toHaveProperty('source', source)
      await expect(sourceOutput).toHaveProperty('destination')

      // Transfer that folder to the destination Swarm.
      const secondMocks = await runCli('-i', 'folder', '-s', sourceOutput.destination, '-o', 'swarm', '-d', dest)
      await expect(secondMocks.consoleLog).not.toHaveBeenCalled()
      await expect(secondMocks.processStdout).not.toHaveBeenCalled()
      secondMocks.restore()

      // Let the destination Swarm settle.
      await new Promise(resolve => setTimeout(resolve, 100))

      // Back up the destination Swarm to a folder to inspect it.
      const thirdMocks = await runCli('-s', dest, '--porcelain')
      await expect(thirdMocks.consoleLog).toHaveBeenCalled()

      // Parse porcelain output
      let destOutput
      await expect(() => {
        destOutput = extractJsonFromMock(thirdMocks.consoleLog)
      }).not.toThrow()

      await expect(destOutput).toHaveProperty('input', 'swarm')
      await expect(destOutput).toHaveProperty('output', 'folder')
      await expect(destOutput).toHaveProperty('source', dest)
      await expect(destOutput).toHaveProperty('destination')

      // Expect the source to match the destination's backup, but not with the same IDs.
      const backupAssertions = await sourceHarness.expectBackupToMatchLoose(expect, destOutput.destination)
      expect.assertions(14 + backupAssertions)
      thirdMocks.restore()
    } catch ( err ) {
      if( destHarness ) {
        await destHarness.destroy()
      }
      throw err
    }
    await destHarness.destroy()
  }))
})
