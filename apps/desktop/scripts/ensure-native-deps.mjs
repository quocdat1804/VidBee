#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process'
import path from 'node:path'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const checkScript =
  "const Database=require('better-sqlite3');const db=new Database(':memory:');db.close()"

function canLoadBetterSqlite3WithElectron() {
  const result = spawnSync('pnpm', ['exec', 'electron', '-e', checkScript], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    },
    encoding: 'utf8'
  })

  if (result.status === 0) {
    return true
  }

  const stderr = result.stderr?.trim()
  const stdout = result.stdout?.trim()
  const details = stderr || stdout || 'No output'
  console.warn(`[native-deps] better-sqlite3 check failed: ${details}`)
  return false
}

if (canLoadBetterSqlite3WithElectron()) {
  console.log('[native-deps] better-sqlite3 is ready for Electron')
  process.exit(0)
}

console.log('[native-deps] Rebuilding Electron native dependencies...')
try {
  execSync('pnpm exec electron-builder install-app-deps', {
    cwd: desktopRoot,
    stdio: 'inherit'
  })
} catch (error) {
  console.warn(
    '[native-deps] electron-builder install-app-deps failed. Trying fallback manual gyp rebuild for better-sqlite3...',
    error.message
  )
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const betterSqlite3Dir = path.dirname(require.resolve('better-sqlite3/package.json'))

    // Get electron version
    const electronVerOutput = execSync('pnpm exec electron --version', {
      cwd: desktopRoot,
      encoding: 'utf8'
    }).trim()
    const electronVersion = electronVerOutput.replace(/^v/, '')
    const arch = process.arch

    console.log(
      `[native-deps] Manually rebuilding better-sqlite3 for Electron ${electronVersion} (${arch})...`
    )
    execSync(
      `npx node-gyp rebuild --release --target=${electronVersion} --arch=${arch} --dist-url=https://electronjs.org/headers`,
      {
        cwd: betterSqlite3Dir,
        stdio: 'inherit'
      }
    )
  } catch (fallbackError) {
    console.error('[native-deps] Fallback manual rebuild failed:', fallbackError)
    throw error
  }
}

if (!canLoadBetterSqlite3WithElectron()) {
  throw new Error('[native-deps] better-sqlite3 is still unavailable after install-app-deps')
}

console.log('[native-deps] Electron native dependencies are ready')
