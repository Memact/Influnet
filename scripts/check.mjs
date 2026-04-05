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
  runSyntaxCheck('scripts/pitch-report.mjs')

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

  const startupToExam = analysis.valid_chains.find(
    (chain) => chain.from === 'startup' && chain.to === 'exam'
  )
  if (!startupToExam) {
    throw new Error(
      'Expected sample chain startup -> exam was not found.'
    )
  }

  if (!Array.isArray(analysis.trajectories) || analysis.trajectories.length === 0) {
    throw new Error('Sample snapshot did not produce any repeated trajectories.')
  }

  const startupTrajectory = analysis.trajectories.find(
    (trajectory) => trajectory.path.join('=>') === 'startup=>exam=>coding'
  )
  if (!startupTrajectory) {
    throw new Error('Expected sample trajectory startup -> exam -> coding was not found.')
  }

  const startupDrift = analysis.drift_signals.find((signal) => signal.key === 'startup')
  if (!startupDrift) {
    throw new Error('Expected startup drift signal was not found.')
  }

  const startupFormation = analysis.formation_signals.find((signal) => signal.key === 'startup')
  if (!startupFormation) {
    throw new Error('Expected startup formation signal was not found.')
  }

  console.log('Influnet checks passed.')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
