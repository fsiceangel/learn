import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const apps = ['math', 'chess', 'gushi']
export const sourceDirectory = app => path.join(root, '.cache', 'sources', app)

export function canonicalRepository(value) {
  if (typeof value !== 'string') throw new Error('Invalid source repository')
  const match = value.match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w-]+)\/([\w.-]+?)\/?$/i)
  if (!match) throw new Error('Source repositories must be GitHub URLs without credentials or URL parameters')
  const repository = match[2].replace(/\.git$/i, '')
  if (!repository || repository === '.' || repository === '..') throw new Error('Invalid source repository')
  return `https://github.com/${match[1].toLowerCase()}/${repository.toLowerCase()}`
}

export function readSources() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'))
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid sources.json')
  for (const app of apps) {
    const source = config[app]
    canonicalRepository(source?.repository)
    if (!/^[0-9a-f]{40}$/i.test(source?.commit ?? '')) throw new Error(`${app} needs a full 40-character commit SHA`)
    source.commit = source.commit.toLowerCase()
  }
  return config
}

function samePath(a, b) {
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
  return normalize(a) === normalize(b)
}

export function git(directory, args, { inherit = false } = {}) {
  const result = spawnSync('git', ['-c', `safe.directory=${directory.replaceAll('\\', '/')}`, ...args], {
    cwd: directory,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed in source cache; check GitHub access and the pinned revision`)
  return (result.stdout ?? '').trim()
}

export function runNpm(args, directory) {
  const result = spawnSync('npm', args, { cwd: directory, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed with exit code ${result.status}`)
}

export function verifySource(directory, source) {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Source caches may not be symlinks to other working directories')
  const realDirectory = fs.realpathSync.native(directory)
  const top = git(directory, ['rev-parse', '--show-toplevel'])
  if (!samePath(fs.realpathSync.native(top), realDirectory)) throw new Error('Each source cache must be its own repository')
  const remote = git(directory, ['remote', 'get-url', 'origin'])
  if (canonicalRepository(remote) !== canonicalRepository(source.repository)) throw new Error('Source cache origin does not match sources.json')
  // No automatic reset/clean/checkout of existing caches: preserve every local edit.
  const status = git(directory, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status) throw new Error('Source cache has tracked or untracked changes. Preserve them before preparing a clean cache; nothing was reset or removed.')
  const commit = git(directory, ['rev-parse', 'HEAD'])
  if (commit !== source.commit) throw new Error('Source cache HEAD does not match sources.json. Prepare a separate clean cache at the pinned revision.')
  return commit
}

export function ensureCacheParent() {
  const directory = path.join(root, '.cache', 'sources')
  fs.mkdirSync(directory, { recursive: true })
  if (fs.lstatSync(path.join(root, '.cache')).isSymbolicLink() || fs.lstatSync(directory).isSymbolicLink()) throw new Error('Source cache must remain inside this checkout')
  return directory
}
