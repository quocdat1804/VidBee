import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ExecutorFinishEvent, TaskInput } from '@vidbee/task-queue'
import { afterEach, describe, expect, it } from 'vitest'
import { YtDlpExecutor, type YtDlpExecutorOptions } from '../src/index'
import { buildDownloadArgs, VIDBEE_OUTPUT_PATH_PREFIX } from '../src/yt-dlp-args'

/**
 * The saved-file path is recovered from the yt-dlp log. yt-dlp is asked to
 * print a sentinel-prefixed `%(filepath)s` (deterministic — see
 * `buildDownloadArgs`); the log-pattern fallback only covers logs that
 * somehow lack the sentinel. These tests pin both paths, plus the buffering
 * behaviour that keeps an early sentinel alive through a flood of progress
 * output.
 */

type SpawnFn = NonNullable<YtDlpExecutorOptions['spawnFn']>

const sentinelLine = (filePath: string): string => `${VIDBEE_OUTPUT_PATH_PREFIX}${filePath}`

/** Minimal stand-in for the yt-dlp-wrap-plus child process. */
class FakeChild {
  private readonly closeListeners: Array<(code: number | null) => void> = []
  private readonly stdoutEmitter = new EventEmitter()
  private readonly stderrEmitter = new EventEmitter()

  readonly ytDlpProcess = {
    pid: 4242,
    stdout: this.stdoutEmitter,
    stderr: this.stderrEmitter,
    kill: (): boolean => true
  }

  on(event: string, listener: (code: number | null) => void): this {
    if (event === 'close') {
      this.closeListeners.push(listener)
    }
    return this
  }

  once(event: string, listener: (code: number | null) => void): this {
    return this.on(event, listener)
  }

  writeStdout(text: string): void {
    this.stdoutEmitter.emit('data', Buffer.from(text))
  }

  close(code = 0): void {
    for (const listener of this.closeListeners) {
      listener(code)
    }
  }
}

const spawnWith =
  (child: FakeChild): SpawnFn =>
  (): ReturnType<SpawnFn> =>
    child as unknown as ReturnType<SpawnFn>

interface FinishSummary {
  filePath: string
  size: number
}

/**
 * Run one task against a fake child. `run()` binds the child's listeners
 * synchronously, so `drive` fires after binding without needing a tick.
 */
const runTask = async ({
  child,
  input,
  drive,
  defaultDownloadDir = '/tmp'
}: {
  child: FakeChild
  input: TaskInput
  drive: (target: FakeChild) => void
  defaultDownloadDir?: string
}): Promise<FinishSummary> => {
  const executor = new YtDlpExecutor({
    resolveYtDlpPath: () => '/usr/local/bin/yt-dlp',
    resolveFfmpegLocation: () => '/usr/local/bin/ffmpeg',
    defaultDownloadDir,
    spawnFn: spawnWith(child)
  })

  const finishes: ExecutorFinishEvent[] = []
  const finished = new Promise<void>((done) => {
    executor.run(
      { taskId: 'task-1', attemptId: 'attempt-1', attemptNumber: 1, input },
      {
        onSpawn: () => undefined,
        onProgress: () => undefined,
        onStd: () => undefined,
        onFinish: (event) => {
          finishes.push(event)
          done()
        }
      }
    )
  })

  drive(child)
  await finished

  const event = finishes[0]
  if (event?.result.type !== 'success') {
    throw new Error(`expected a successful finish, received ${JSON.stringify(event?.result)}`)
  }
  return { filePath: event.result.output.filePath, size: event.result.output.size }
}

const tempDirs: string[] = []

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-output-path-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { force: true, recursive: true })
    }
  }
})

const videoInput = (customDownloadPath: string): TaskInput => ({
  url: 'https://example.com/video',
  kind: 'video',
  options: { customDownloadPath }
})

describe('buildDownloadArgs output sentinel', () => {
  it('asks yt-dlp to print the final path so detection never has to guess', () => {
    const args = buildDownloadArgs({ url: 'https://example.com/video', type: 'video' }, '/tmp', {
      downloadPath: '/tmp'
    })

    expect(args).toContain(`after_move:${VIDBEE_OUTPUT_PATH_PREFIX}%(filepath)s`)
    // The sentinel is useless if yt-dlp also suppresses progress output.
    expect(args).toContain('--no-quiet')
  })
})

describe('YtDlpExecutor output path detection', () => {
  it('reads the path from the sentinel line', async () => {
    const target = join(makeTempDir(), 'clip.mp4')

    const summary = await runTask({
      child: new FakeChild(),
      input: videoInput('/tmp'),
      drive: (child) => {
        child.writeStdout(`${sentinelLine(target)}\n`)
        child.close()
      }
    })

    expect(summary.filePath).toBe(target)
  })

  it('keeps the path when progress output floods the tail buffer', async () => {
    const summary = await runTask({
      child: new FakeChild(),
      input: videoInput('/tmp'),
      drive: (child) => {
        // The sentinel arrives first, then >8KB of progress pushes it out of
        // both the 8KB stdout tail and the 4KB path-scan window.
        child.writeStdout(`${sentinelLine('/tmp/streamed.mp4')}\n`)
        for (let index = 0; index < 120; index += 1) {
          child.writeStdout(
            `[download]  ${index}.0% of ~ 300.00MiB at 3.00MiB/s ETA 00:05 (frag ${index}/120) padding padding padding padding\n`
          )
        }
        child.close()
      }
    })

    expect(summary.filePath).toBe('/tmp/streamed.mp4')
  })

  it('reassembles a sentinel split across chunk boundaries', async () => {
    const summary = await runTask({
      child: new FakeChild(),
      input: videoInput('/tmp'),
      drive: (child) => {
        child.writeStdout(sentinelLine('/tmp/frag'))
        child.writeStdout('mented.mp4\n')
        child.close()
      }
    })

    expect(summary.filePath).toBe('/tmp/fragmented.mp4')
  })

  it('falls back to log patterns when the sentinel is absent', async () => {
    const summary = await runTask({
      child: new FakeChild(),
      input: videoInput('/tmp'),
      drive: (child) => {
        child.writeStdout(
          [
            '[download] Destination: /tmp/video.f137.mp4',
            '[download] 100% of 100MiB',
            '[Merger] Merging formats into "/tmp/merged.mp4"',
            '[Metadata] Adding metadata to "/tmp/merged.mp4"',
            ''
          ].join('\n')
        )
        child.close()
      }
    })

    // The final post-processed file wins over the intermediate streams.
    expect(summary.filePath).toBe('/tmp/merged.mp4')
  })

  it('resolves a relative path against the task download directory', async () => {
    const downloadDir = makeTempDir()
    const contents = 'vidbee-relative-output'
    writeFileSync(join(downloadDir, 'relative.mp4'), contents)

    const summary = await runTask({
      child: new FakeChild(),
      input: videoInput(downloadDir),
      drive: (child) => {
        // yt-dlp echoes back whatever it wrote, which stays relative when the
        // configured download path is relative.
        child.writeStdout(`${sentinelLine('relative.mp4')}\n`)
        child.close()
      }
    })

    expect(summary.filePath).toBe(resolve(downloadDir, 'relative.mp4'))
    // A resolved path lets the size check see the real file instead of
    // reporting 0 bytes and tripping the output-missing guard.
    expect(summary.size).toBe(contents.length)
  })
})
