import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Deployment may not contain symlinks')
    return entry.isDirectory() ? walk(name) : [name]
  })
}

export function validate(directory, prefix = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(prefix)) throw new Error('Invalid deployment base path')
  const root = path.resolve(directory)
  const files = walk(root)
  const problems = []
  let checked = 0
  function localReference(value, from) {
    value = value.replaceAll('&amp;', '&').trim()
    if (!value || value.startsWith('#') || /^(https?:|data:|mailto:|tel:|blob:|\/\/)/i.test(value)) return
    if (/^[a-z]+:/i.test(value)) { problems.push(`Unexpected URL scheme in ${path.relative(root, from)}`); return }
    const base = new URL('https://local.invalid' + prefix + path.relative(root, from).split(path.sep).join('/'))
    let pathname
    try { pathname = decodeURIComponent(new URL(value, base).pathname) } catch { problems.push(`Invalid URL in ${path.relative(root, from)}`); return }
    if (!pathname.startsWith(prefix)) { problems.push(`${path.relative(root, from)} links outside its deployment base: ${pathname}`); return }
    pathname = '/' + pathname.slice(prefix.length)
    const target = path.resolve(root, '.' + pathname)
    if (target !== root && !target.startsWith(root + path.sep)) { problems.push('Asset escapes deployment root'); return }
    const found = fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html')))
    if (!found) problems.push(`${path.relative(root, from)} points to missing ${pathname}`)
    checked++
  }
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    if (/\.(?:pdf|sav|db|sqlite|sqlite3)$/i.test(relative) || /(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|server|private-reference|vendor)(\/|$)/.test(relative)) problems.push(`Private/source material in output: ${relative}`)
    if (/(^|\/)CNAME$/.test(relative)) problems.push(`Unexpected domain binding: ${relative}`)
    if (/\.(?:test|spec)\.[cm]?js$/.test(file)) problems.push(`Test file in output: ${relative}`)
    if (!/\.(?:html|css|js|mjs|json|txt)$/.test(file)) continue
    const content = fs.readFileSync(file, 'utf8')
    if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content)) problems.push(`Possible credential in ${relative}`)
    if (file.endsWith('.html')) {
      for (const match of content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) localReference(match[1], file)
    } else if (file.endsWith('.css')) {
      for (const match of content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) localReference(match[1], file)
    } else if (/\.[cm]?js$/.test(file)) {
      for (const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) localReference(match[1], file)
    }
  }
  for (const app of ['', 'math', 'chess', 'gushi', 'saves']) {
    if (!fs.existsSync(path.join(root, app, 'index.html'))) problems.push(`Missing entry: /${app}${app ? '/' : ''}`)
  }
  if (problems.length) throw new Error(problems.join('\n'))
  console.log(`Verified ${files.length} deployment files and ${checked} local asset/link references`)
  return { files: files.length, references: checked }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const output = path.join(root, 'dist')
  const metadata = path.join(output, 'build-info.json')
  const prefix = process.env.LEARN_BASE || (fs.existsSync(metadata) ? JSON.parse(fs.readFileSync(metadata, 'utf8')).base : '/') || '/'
  validate(output, prefix)
}
