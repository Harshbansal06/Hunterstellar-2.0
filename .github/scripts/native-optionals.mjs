/**
 * Prints the optional native packages this platform needs but the lockfile
 * may not record.
 *
 * npm writes a lockfile for the OS it runs on: a lockfile written on Windows
 * lists @tailwindcss/oxide-win32-x64-msvc and nothing for Linux, so `npm ci`
 * on the Linux runner has no entry to install and Vite dies at config load
 * ("Cannot find module '@tailwindcss/oxide-linux-x64-gnu'", npm/cli#4828).
 *
 * Instead of hardcoding package names and versions in the workflow, walk every
 * installed package, read its optionalDependencies, and keep the ones whose
 * name targets this platform and architecture. Versions come from the parent
 * package, so they always match what the lockfile pinned.
 *
 *   npm install --no-save $(node .github/scripts/native-optionals.mjs)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const target = `${process.platform}-${process.arch}` // e.g. linux-x64, win32-x64
const roots = ['node_modules', 'frontend/node_modules', 'backend/node_modules']
const wanted = new Set()

function visit(dir) {
  const pj = join(dir, 'package.json')
  if (!existsSync(pj)) return
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pj, 'utf8'))
  } catch {
    return
  }
  for (const [name, version] of Object.entries(pkg.optionalDependencies || {})) {
    // Skip musl on glibc runners and vice versa; GitHub's ubuntu images are glibc.
    if (!name.includes(target) || name.includes('musl')) continue
    wanted.add(`${name}@${version}`)
  }
}

for (const root of roots) {
  if (!existsSync(root)) continue
  for (const entry of readdirSync(root)) {
    if (entry.startsWith('.')) continue
    const p = join(root, entry)
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(p)) visit(join(p, scoped))
    } else {
      visit(p)
    }
  }
}

process.stdout.write([...wanted].sort().join(' '))
