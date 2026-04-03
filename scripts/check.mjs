import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeInfluenceSnapshot } from '../src/engine.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function runSyntaxCheck(relativePath) {
  execFileSync(process.execPath, ['--check', path.join(projectRoot, relativePath)], {
    stdio: 'inherit',
  })
}

async function main() {
  runSyntaxCheck('src/engine.mjs')
  runSyntaxCheck('src/cli.mjs')

  const snapshot = JSON.parse(
    await readFile(
      path.join(projectRoot, 'examples', 'sample-captanet-snapshot.json'),
      'utf8'
    )
  )
  const analysis = analyzeInfluenceSnapshot(snapshot)

  if (!Array.isArray(analysis.valid_chains) || analysis.valid_chains.length === 0) {
    throw new Error('Sample snapshot did not produce any valid influence chains.')
  }

  const [topChain] = analysis.valid_chains
  if (topChain.from !== 'startup' || topChain.to !== 'exam') {
    throw new Error(
      `Unexpected top sample chain ${topChain.from} -> ${topChain.to}. Expected startup -> exam.`
    )
  }

  console.log('Influnet checks passed.')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
