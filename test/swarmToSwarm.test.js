const { runCli, createStockHarness, withHarness, extractJsonFromMock } = require('./utils')

describe('transfer Swarm to Swarm', () => {
  jest.setTimeout(30 * 1000)

  test('can transfer from one Swarm to another', withHarness(async sourceHarness => {
    // Set up destination harness without any services.
    let destHarness

    try {
      destHarness = await createStockHarness(0)

      // Transfer the source Swarm to the destination Swarm.
      const source = `localhost:${sourceHarness.port}`
      const dest = `localhost:${destHarness.port}`
      const firstMocks = await runCli('-s', source, '-o', 'swarm', '-d', dest)
      await expect(firstMocks.consoleLog).not.toHaveBeenCalled()
      await expect(firstMocks.processStdout).not.toHaveBeenCalled()
      firstMocks.restore()

      // Back up the source Swarm to a folder to inspect it.
      const secondMocks = await runCli('-s', source, '--porcelain')
      await expect(secondMocks.consoleLog).toHaveBeenCalled()

      // Parse porcelain output
      let output
      await expect(() => {
        output = extractJsonFromMock(secondMocks.consoleLog)
      }).not.toThrow()

      await expect(output).toHaveProperty('input', 'swarm')
      await expect(output).toHaveProperty('output', 'folder')
      await expect(output).toHaveProperty('source', source)
      await expect(output).toHaveProperty('destination')

      // Expect the destination to match the source's backup
      const backupAssertions = await destHarness.expectBackupToMatch(expect, output.destination)
      expect.assertions(8 + backupAssertions)
      secondMocks.restore()
    } catch ( err ) {
      if( destHarness ) {
        await destHarness.destroy()
      }
      throw err
    }
    await destHarness.destroy()
  }))
})
