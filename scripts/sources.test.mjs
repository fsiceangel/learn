import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { canonicalRepository, git, verifySource } from './sources.mjs'

test('repository comparison accepts equivalent GitHub URLs and rejects credentials or other hosts', () => {
  for (const value of ['https://github.com/Owner/Project.git', 'git@github.com:owner/project.git', 'ssh://git@github.com/owner/project']) {
    assert.equal(canonicalRepository(value), 'https://github.com/owner/project')
  }
  for (const value of ['https://token@github.com/owner/project', 'https://other.example/owner/project', 'https://github.com/owner/project?token=secret']) {
    assert.throws(() => canonicalRepository(value))
  }
})

test('source validation blocks dirty, wrong-origin and wrong-revision inputs without changing them', () => {
  const parent = fs.realpathSync(os.tmpdir())
  const directory = fs.mkdtempSync(path.join(parent, 'learning-source-check-'))
  try {
    git(directory, ['init', '-b', 'main'])
    git(directory, ['remote', 'add', 'origin', 'https://github.com/example/learning-fixture.git'])
    fs.writeFileSync(path.join(directory, '.gitignore'), 'node_modules/\n')
    fs.writeFileSync(path.join(directory, 'source.js'), 'export const value = 1\n')
    git(directory, ['add', '.'])
    git(directory, ['-c', 'user.name=Learning Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture'])
    const source = { repository: 'https://github.com/example/learning-fixture', commit: git(directory, ['rev-parse', 'HEAD']) }
    assert.equal(verifySource(directory, source), source.commit)
    assert.throws(() => verifySource(directory, { ...source, repository: 'https://github.com/example/other' }), /origin/)
    assert.throws(() => verifySource(directory, { ...source, commit: '0'.repeat(40) }), /HEAD/)
    fs.mkdirSync(path.join(directory, 'node_modules'))
    fs.writeFileSync(path.join(directory, 'node_modules', 'cache'), 'ignored dependency')
    assert.equal(verifySource(directory, source), source.commit)
    const untracked = path.join(directory, 'unreviewed.js')
    fs.writeFileSync(untracked, 'unreviewed change')
    assert.throws(() => verifySource(directory, source), /changes/)
    assert.equal(fs.readFileSync(untracked, 'utf8'), 'unreviewed change')
    fs.unlinkSync(untracked)
    fs.writeFileSync(path.join(directory, 'source.js'), 'uncommitted edit')
    assert.throws(() => verifySource(directory, source), /changes/)
    assert.equal(fs.readFileSync(path.join(directory, 'source.js'), 'utf8'), 'uncommitted edit')
    assert.equal(git(directory, ['rev-parse', 'HEAD']), source.commit)
  } finally {
    const resolved = fs.realpathSync(directory)
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('learning-source-check-')) throw new Error('Unsafe test cleanup path')
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})
