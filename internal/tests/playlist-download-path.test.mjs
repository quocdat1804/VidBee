import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolvePlaylistDownloadPath } from '../../apps/desktop/src/main/lib/path-resolver.ts'

/**
 * A playlist must not get a folder of its own. Upstream created
 * `{downloadPath}/Playlists/{title}`, and the 1.3.13 `createSubfolder` toggle
 * that let users opt out was dropped in v2 — so without these assertions the
 * stray folder can quietly come back on the next upstream sync.
 */

test('playlist files land in the configured download directory', () => {
  assert.equal(resolvePlaylistDownloadPath(undefined, '/downloads'), '/downloads')
})

test('no Playlists segment is appended for any title', () => {
  for (const downloadPath of ['/downloads', '/Volumes/ssd', '/Users/me/Downloads/VidBee']) {
    const resolved = resolvePlaylistDownloadPath(undefined, downloadPath)
    assert.equal(resolved, downloadPath)
    assert.ok(!resolved.includes('Playlists'), `${resolved} must not contain a Playlists segment`)
  }
})

test('a user-selected directory always wins', () => {
  assert.equal(
    resolvePlaylistDownloadPath('/Volumes/ssd/mine', '/downloads'),
    '/Volumes/ssd/mine'
  )
})

test('a blank or whitespace-only selection falls back to the download directory', () => {
  for (const blank of ['', '   ', '\t', '\n']) {
    assert.equal(resolvePlaylistDownloadPath(blank, '/downloads'), '/downloads')
  }
})

test('a selection is trimmed and used verbatim, with no folder appended', () => {
  assert.equal(
    resolvePlaylistDownloadPath('  /Volumes/ssd/mine  ', '/downloads'),
    '/Volumes/ssd/mine'
  )
})

test('resolved path never gains a trailing separator from the fallback', () => {
  assert.ok(!resolvePlaylistDownloadPath(undefined, '/downloads').endsWith('/'))
  assert.ok(!resolvePlaylistDownloadPath(undefined, '/downloads/').endsWith('//'))
})
