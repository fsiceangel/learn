import fs from 'node:fs'
import path from 'node:path'
import { validate } from './validate.mjs'
import { root, apps, sourceDirectory, runNpm, verifySource } from './sources.mjs'
import { prepareSources } from './prepare.mjs'

const out = path.join(root, 'dist')
const base = process.env.LEARN_BASE || '/'
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('LEARN_BASE must be a slash-delimited path, such as / or /learn/')
const sources = prepareSources()

function resetOutput() {
  // Only this project's literal dist directory may be recursively removed.
  const realRoot = fs.realpathSync(root)
  if (out !== path.join(realRoot, 'dist') || path.relative(realRoot, out) !== 'dist') throw new Error('Unsafe output path')
  if (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink()) throw new Error('Refusing to replace a linked output directory')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out)
}

const revisions = []
for (const app of apps) {
  const directory = sourceDirectory(app)
  const commit = verifySource(directory, sources[app])
  console.log(`Building ${app} at ${base}${app}/`)
  runNpm(['run', 'build', '--', `--base=${base}${app}/`], directory)
  verifySource(directory, sources[app])
  revisions.push({ app, commit, base: `${base}${app}/` })
}

resetOutput()
fs.cpSync(path.join(root, 'site'), out, {
  recursive: true,
  filter: source => !/\.(?:test|spec)\.[cm]?js$/.test(source) && !path.basename(source).startsWith('.'),
})

const navigation = `<nav class="learning-hub-nav" aria-label="Learning navigation"><a href="${base}">Learning home</a><a href="${base}saves/">Save files</a></nav>`
const navigationCss = `
.learning-hub-nav{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:44px;padding:.65rem max(1rem,calc((100vw - 1120px)/2));background:#173f3b;color:#fff;font:600 14px/1.4 system-ui,sans-serif;position:relative;z-index:50}
.learning-hub-nav a{color:inherit;text-decoration:none;border-radius:4px;padding:2px 4px;white-space:nowrap}
.learning-hub-nav a:hover{text-decoration:underline}
.learning-hub-nav a:focus-visible{outline:3px solid #f5ca73;outline-offset:3px}
@media print{.learning-hub-nav{display:none!important}}
`
fs.writeFileSync(path.join(out, 'learning-nav.css'), navigationCss.trim() + '\n')
for (const app of apps) {
  const destination = path.join(out, app)
  verifySource(sourceDirectory(app), sources[app])
  fs.cpSync(path.join(sourceDirectory(app), 'dist'), destination, {
    recursive: true,
    // Old domain bindings and host-wide rewrite rules do not belong under subpaths.
    filter: source => !['CNAME', '_redirects', '_headers', '.nojekyll'].includes(path.basename(source)),
  })
  const entry = path.join(destination, 'index.html')
  let html = fs.readFileSync(entry, 'utf8')
  if (!/<\/head>/i.test(html) || !/<body\b[^>]*>/i.test(html)) throw new Error(`${app} has no HTML shell`)
  html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="${base}learning-nav.css"></head>`)
    .replace(/<body\b[^>]*>/i, '$&' + navigation)
  fs.writeFileSync(entry, html)
}
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify({ version: 1, base, sources: revisions }, null, 2) + '\n')
fs.writeFileSync(path.join(out, '.nojekyll'), '')
if (base === '/') fs.writeFileSync(path.join(out, 'CNAME'), 'learn.sorapinkice.top\n')
validate(out, base)
console.log('Learning hub is ready in dist/')
