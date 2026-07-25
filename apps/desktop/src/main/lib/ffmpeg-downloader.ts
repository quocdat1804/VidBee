import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export const getLocalFFmpegPath = (): string => {
  const binDir = path.join(app.getPath('userData'), 'bin')
  const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return path.join(binDir, executableName)
}

export const isFFmpegAvailable = async (): Promise<boolean> => {
  const localPath = getLocalFFmpegPath()
  try {
    await fsPromises.access(localPath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}
