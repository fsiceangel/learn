import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { root, apps, sourceDirectory, readSources, canonicalRepository, ensureCacheParent, git, runNpm, verifySource } from './sources.mjs'

export function prepareSources(selected = apps) {
  const sources = readSources()
  if (!selected.length || selected.some(app => !apps.includes(app))) throw new Error('Select math, chess, or gushi')
  const parent = ensureCacheParent()
  // Validate ALL existing inputs before installing dependencies or creating others.
  for (const app of selected) {
    const directory = sourceDirectory(app)
    if (fs.existsSync(directory)) verifySource(directory, sources[app])
  }
  for (const app of selected) {
    const source = sources[app]
    const directory = sourceDirectory(app)
    if (!fs.existsSync(directory)) {
      console.log(`Preparing pinned ${app} source`)
      // Fixed HTTPS URL with no token; normal Git credentials handle private gushi.
      git(parent, ['clone', '--no-checkout', canonicalRepository(source.repository) + '.git', app], { inherit: true })
      git(directory, ['checkout', '--detach', source.commit], { inherit: true })
    }
    verifySource(directory, source)
    const lock = path.join(directory, 'package-lock.json')
    const manifest = path.join(directory, 'package.json')
    if (!fs.existsSync(lock)) throw new Error(`${app} has no package-lock.json; refusing an unpinned install`)
    const installKey = crypto.createHash('sha256').update(fs.readFileSync(lock)).update(fs.readFileSync(manifest))
      .update(`${process.platform}/${process.arch}/${process.versions.node}`).digest('hex')
    const stateDirectory = path.join(root, '.cache', 'state')
    const stateFile = path.join(stateDirectory, `${app}.json`)
    let state
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { state = null }
    if (state?.installKey !== installKey || !fs.existsSync(path.join(directory, 'node_modules', '.package-lock.json'))) {
      runNpm(['ci', '--no-audit', '--no-fund'], directory)
      verifySource(directory, source)
      fs.mkdirSync(stateDirectory, { recursive: true })
      fs.writeFileSync(stateFile, JSON.stringify({ installKey }) + '\n')
    }
    verifySource(directory, source)
  }
  return sources
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const selected = args.length === 0 ? apps : args.length === 2 && args[0] === '--app' ? [args[1]] : []
  if (!selected.length) throw new Error('Usage: node scripts/prepare.mjs [--app math|chess|gushi]')
  prepareSources(selected)
}
