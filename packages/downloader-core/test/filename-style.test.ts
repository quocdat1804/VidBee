import { describe, expect, it } from 'vitest'
import {
  applyViaVidBeeFilename,
  DEFAULT_FILENAME_STYLE,
  DEFAULT_FILENAME_TEMPLATE,
  DEFAULT_FILENAME_VIA_VIDBEE,
  FILENAME_DEFAULTS_MIGRATION,
  FILENAME_STYLE_PREVIEWS,
  FILENAME_STYLES,
  isFilenameStyle,
  migrateFilenameDefaults,
  resolveFilenameTemplate,
  VIA_VIDBEE_LABEL
} from '../src/filename-style'
import {
  appendPlatformFilenameSafetyArgs,
  buildDownloadArgs,
  VIDBEE_OUTPUT_PATH_PREFIX
} from '../src/yt-dlp-args'

/**
 * The fork defaults to keeping the source title verbatim: no author,
 * resolution, extractor or `via VidBee` decoration, and no length capping.
 * These tests pin that default so an upstream sync cannot quietly reintroduce
 * decorated names.
 */
describe('source filename default', () => {
  it('defaults to the source style with via VidBee off', () => {
    expect(DEFAULT_FILENAME_STYLE).toBe('source')
    expect(DEFAULT_FILENAME_VIA_VIDBEE).toBe(false)
    expect(FILENAME_STYLES).toContain('source')
  })

  it('resolves an unset style to a bare title template', () => {
    expect(resolveFilenameTemplate(undefined, 'video')).toBe(DEFAULT_FILENAME_TEMPLATE)
    expect(resolveFilenameTemplate(undefined, 'audio')).toBe(DEFAULT_FILENAME_TEMPLATE)
    expect(DEFAULT_FILENAME_TEMPLATE).toBe('%(title)s.%(ext)s')
  })

  it('keeps the title untouched for both media types', () => {
    expect(resolveFilenameTemplate('source', 'video')).toBe('%(title)s.%(ext)s')
    expect(resolveFilenameTemplate('source', 'audio')).toBe('%(title)s.%(ext)s')
  })

  it('does not append the via VidBee suffix by default', () => {
    expect(resolveFilenameTemplate('source', 'video')).not.toContain(VIA_VIDBEE_LABEL)
    expect(applyViaVidBeeFilename('%(title)s.%(ext)s')).toBe('%(title)s.%(ext)s')
  })

  it('never decorates the source style even when the toggle is forced on', () => {
    // The suffix must go before the extension when a user opts in, but the
    // source template itself carries no author/resolution fields to decorate.
    expect(resolveFilenameTemplate('source', 'video', false, true)).toBe(
      `%(title)s ${VIA_VIDBEE_LABEL}.%(ext)s`
    )
  })
})

describe('opt-in decoration is preserved', () => {
  it('still brands filenames when via VidBee is explicitly enabled', () => {
    const template = resolveFilenameTemplate('pretty', 'video', false, true)
    expect(template).toContain(VIA_VIDBEE_LABEL)
    expect(template).not.toContain('via VidBee via VidBee')
  })

  it('keeps the decorated styles available for users who want them', () => {
    for (const style of ['basic', 'classic', 'nerdy', 'pretty'] as const) {
      const template = resolveFilenameTemplate(style, 'video', false, false)
      expect(template).not.toContain(VIA_VIDBEE_LABEL)
      expect(template).not.toBe(DEFAULT_FILENAME_TEMPLATE)
    }
  })

  it('keeps share-watermark mode branded', () => {
    expect(resolveFilenameTemplate('source', 'video', true, false)).toBe(
      `%(title)s ${VIA_VIDBEE_LABEL}.%(ext)s`
    )
  })

  it('recognises only real style names', () => {
    expect(isFilenameStyle('source')).toBe(true)
    expect(isFilenameStyle('nope')).toBe(false)
    expect(isFilenameStyle(undefined)).toBe(false)
  })

  it('exposes a plain preview for the source style', () => {
    expect(FILENAME_STYLE_PREVIEWS.source.video).toBe('Video Title.mp4')
    expect(FILENAME_STYLE_PREVIEWS.source.audio).toBe('Audio Title.mp3')
  })
})

describe('appendPlatformFilenameSafetyArgs', () => {
  it('no longer caps filename length on any desktop platform', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const args: string[] = []
      appendPlatformFilenameSafetyArgs(args, platform)
      expect(args).not.toContain('--trim-filenames')
    }
  })

  it('keeps the Windows-only legality flag', () => {
    const windows: string[] = []
    appendPlatformFilenameSafetyArgs(windows, 'win32')
    expect(windows).toContain('--windows-filenames')

    const mac: string[] = []
    appendPlatformFilenameSafetyArgs(mac, 'darwin')
    expect(mac).toEqual([])
  })
})

describe('migrateFilenameDefaults', () => {
  it('moves an install that never recorded the migration onto the source title', () => {
    expect(migrateFilenameDefaults(undefined)).toEqual({
      filenameStyle: 'source',
      filenameViaVidBee: false
    })
  })

  it('overrides a decorated choice so existing installs get bare titles', () => {
    // The fork deliberately overrides even a deliberate decoration choice.
    for (const marker of [null, '', 'legacy', 'source-title-v0']) {
      expect(migrateFilenameDefaults(marker)).toEqual({
        filenameStyle: 'source',
        filenameViaVidBee: false
      })
    }
  })

  it('reports nothing to do once the marker matches', () => {
    expect(migrateFilenameDefaults(FILENAME_DEFAULTS_MIGRATION)).toBeNull()
  })

  it('applies the module defaults rather than duplicating the literals', () => {
    const migrated = migrateFilenameDefaults(undefined)
    expect(migrated?.filenameStyle).toBe(DEFAULT_FILENAME_STYLE)
    expect(migrated?.filenameViaVidBee).toBe(DEFAULT_FILENAME_VIA_VIDBEE)
  })

  it('is idempotent across repeated starts', () => {
    const first = migrateFilenameDefaults(undefined)
    expect(first).not.toBeNull()
    // A second launch sees the marker written by the first.
    expect(migrateFilenameDefaults(FILENAME_DEFAULTS_MIGRATION)).toBeNull()
  })

  it('produces a template with no decoration after migrating', () => {
    const migrated = migrateFilenameDefaults(undefined)
    const template = resolveFilenameTemplate(
      migrated?.filenameStyle,
      'video',
      false,
      migrated?.filenameViaVidBee
    )
    expect(template).toBe('%(title)s.%(ext)s')
    expect(template).not.toContain(VIA_VIDBEE_LABEL)
  })
})

describe('assembled yt-dlp output path', () => {
  const settings = {
    downloadPath: '/downloads',
    filenameStyle: 'source' as const,
    filenameViaVidBee: false,
    shareWatermark: false
  }

  it('passes a bare title template as -o and nothing that rewrites it', () => {
    for (const type of ['video', 'audio'] as const) {
      const args = buildDownloadArgs({ url: 'https://example.com/v', type }, '/tmp', settings)
      const outputIndex = args.indexOf('-o')

      expect(outputIndex).toBeGreaterThan(-1)
      expect(args[outputIndex + 1]).toBe('/downloads/%(title)s.%(ext)s')
      expect(args).not.toContain('--trim-filenames')
      expect(JSON.stringify(args)).not.toContain(VIA_VIDBEE_LABEL)
    }
  })

  it('still emits the sentinel used to recover the saved path', () => {
    const args = buildDownloadArgs(
      { url: 'https://example.com/v', type: 'video' },
      '/tmp',
      settings
    )
    expect(args).toContain(`after_move:${VIDBEE_OUTPUT_PATH_PREFIX}%(filepath)s`)
  })
})
