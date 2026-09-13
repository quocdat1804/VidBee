import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type DownloadRuntimeSettings, WebAppSettingsSchema } from '@vidbee/downloader-core'
import {
  DEFAULT_FILENAME_STYLE,
  DEFAULT_FILENAME_VIA_VIDBEE,
  FILENAME_DEFAULTS_MIGRATION,
  migrateFilenameDefaults
} from '@vidbee/downloader-core/filename-style'
import { DEFAULT_SUBTITLE_LANGUAGES } from '@vidbee/downloader-core/subtitle-languages'

const STORAGE_DIR = path.resolve(process.cwd(), '.data')
const STORAGE_FILE = path.join(STORAGE_DIR, 'web-settings.json')
/**
 * One-time migration markers live beside the settings file rather than inside
 * it: `set()` rewrites the settings file from the parsed schema, which would
 * strip any bookkeeping key it does not know about.
 */
const MIGRATIONS_FILE = path.join(STORAGE_DIR, 'web-settings-migrations.json')

const defaultWebSettings = WebAppSettingsSchema.parse({
  downloadPath: '',
  maxConcurrentDownloads: 5,
  browserForCookies: 'none',
  cookiesPath: '',
  proxy: '',
  configPath: '',
  betaProgram: false,
  language: 'en',
  theme: 'system',
  oneClickDownload: false,
  oneClickDownloadType: 'video',
  oneClickQuality: 'best',
  oneClickContainer: 'auto',
  closeToTray: true,
  autoUpdate: true,
  subscriptionOnlyLatestDefault: true,
  enableAnalytics: true,
  downloadSubtitles: true,
  subtitleLanguages: [...DEFAULT_SUBTITLE_LANGUAGES],
  embedSubs: true,
  writeAutoSubs: true,
  embedThumbnail: false,
  embedMetadata: true,
  embedChapters: true,
  filenameStyle: DEFAULT_FILENAME_STYLE,
  filenameViaVidBee: DEFAULT_FILENAME_VIA_VIDBEE,
  shareWatermark: false,
  autoTranscribeAfterDownload: true,
  maxConcurrentTranscriptions: 1,
  asrTier: 'minimal'
})

type WebAppSettings = typeof defaultWebSettings

class WebSettingsStore {
  private settings = defaultWebSettings
  private initialized = false

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.initialized = true

    try {
      const raw = await readFile(STORAGE_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      const result = WebAppSettingsSchema.safeParse(parsed)
      if (result.success) {
        this.settings = result.data
      }
    } catch {
      this.settings = defaultWebSettings
    }

    await this.migrateFilenameDefaults()
  }

  /**
   * Move installs predating the `source` style onto the untouched source
   * title. Runs once: the marker records the pass so a later explicit choice
   * is not reverted on the next start.
   */
  private async migrateFilenameDefaults(): Promise<void> {
    try {
      const migrations = await this.readMigrations()
      const migrated = migrateFilenameDefaults(migrations.filenameDefaults)

      if (!migrated) {
        return
      }

      this.settings = WebAppSettingsSchema.parse({ ...this.settings, ...migrated })
      await mkdir(STORAGE_DIR, { recursive: true })
      await writeFile(STORAGE_FILE, JSON.stringify(this.settings), 'utf-8')
      await writeFile(
        MIGRATIONS_FILE,
        JSON.stringify({ ...migrations, filenameDefaults: FILENAME_DEFAULTS_MIGRATION }),
        'utf-8'
      )
    } catch {
      // A failed migration only leaves the previous filename settings in
      // place; the remaining settings must still load.
    }
  }

  private async readMigrations(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(MIGRATIONS_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  async get(): Promise<WebAppSettings> {
    await this.ensureInitialized()
    return this.settings
  }

  async set(nextSettings: WebAppSettings): Promise<WebAppSettings> {
    await this.ensureInitialized()
    const validated = WebAppSettingsSchema.parse(nextSettings)
    await mkdir(STORAGE_DIR, { recursive: true })
    await writeFile(STORAGE_FILE, JSON.stringify(validated), 'utf-8')
    this.settings = validated
    return this.settings
  }
}

export const webSettingsStore = new WebSettingsStore()

/**
 * Project stored Web settings onto the settings accepted by the download executor.
 *
 * @param settings Validated Web application settings.
 * @returns Runtime settings for one queued download.
 */
export const toWebDownloadRuntimeSettings = (
  settings: WebAppSettings
): DownloadRuntimeSettings => ({
  downloadPath: settings.downloadPath,
  browserForCookies: settings.browserForCookies,
  cookiesPath: settings.cookiesPath,
  proxy: settings.proxy,
  configPath: settings.configPath,
  downloadSubtitles: settings.downloadSubtitles,
  subtitleLanguages: settings.subtitleLanguages,
  interfaceLanguage: settings.language,
  embedSubs: settings.embedSubs,
  writeAutoSubs: settings.writeAutoSubs,
  embedThumbnail: settings.embedThumbnail,
  embedMetadata: settings.embedMetadata,
  embedChapters: settings.embedChapters,
  filenameStyle: settings.filenameStyle,
  filenameViaVidBee: settings.filenameViaVidBee,
  shareWatermark: settings.shareWatermark
})
