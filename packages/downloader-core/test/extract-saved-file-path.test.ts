import { describe, expect, it } from 'vitest'
import { extractCandidateFromLine, extractSavedFilePath } from '../src/yt-dlp-executor'

describe('extractCandidateFromLine', () => {
  it('extracts from [Metadata] Adding metadata', () => {
    expect(
      extractCandidateFromLine(
        '[Metadata] Adding metadata to "/Volumes/qdSSD/FashionQQueen/Floral Mini Dress.mp4"'
      )
    ).toBe('/Volumes/qdSSD/FashionQQueen/Floral Mini Dress.mp4')
  })

  it('extracts from [Metadata] Writing metadata', () => {
    expect(
      extractCandidateFromLine(
        "[Metadata] Writing metadata to '/Volumes/qdSSD/FashionQQueen/Floral Mini Dress.mp4'"
      )
    ).toBe('/Volumes/qdSSD/FashionQQueen/Floral Mini Dress.mp4')
  })

  it('extracts from [FixupM3u8]', () => {
    expect(
      extractCandidateFromLine(
        '[FixupM3u8] Fixing MPEG-TS in MP4 container of "/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4"'
      )
    ).toBe(
      '/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4'
    )
  })

  it('extracts from [VideoRemuxer] Not remuxing media file', () => {
    expect(
      extractCandidateFromLine(
        '[VideoRemuxer] Not remuxing media file "/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4"; already is in target format mp4'
      )
    ).toBe(
      '/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4'
    )
  })

  it('extracts from [VideoRemuxer] Remuxing video with resulting file', () => {
    expect(
      extractCandidateFromLine(
        '[VideoRemuxer] Remuxing video from mp4 to mkv; resulting file is "/Volumes/qdSSD/output.mkv"'
      )
    ).toBe('/Volumes/qdSSD/output.mkv')
  })

  it('extracts from [EmbedSubtitle]', () => {
    expect(
      extractCandidateFromLine(
        '[EmbedSubtitle] Embedding subtitles in "/Volumes/qdSSD/subtitled.mp4"'
      )
    ).toBe('/Volumes/qdSSD/subtitled.mp4')
  })

  it('extracts from [EmbedThumbnail]', () => {
    expect(
      extractCandidateFromLine(
        '[EmbedThumbnail] ffmpeg: Adding thumbnail to "/Volumes/qdSSD/thumb.mp4"'
      )
    ).toBe('/Volumes/qdSSD/thumb.mp4')
  })

  it('extracts from [Merger] Merging formats into', () => {
    expect(
      extractCandidateFromLine(
        '[Merger] Merging formats into "/Volumes/qdSSD/merged.mp4"'
      )
    ).toBe('/Volumes/qdSSD/merged.mp4')
  })

  it('extracts from [ExtractAudio] Destination:', () => {
    expect(
      extractCandidateFromLine(
        '[ExtractAudio] Destination: /Volumes/qdSSD/audio.mp3'
      )
    ).toBe('/Volumes/qdSSD/audio.mp3')
  })

  it('extracts from [download] Destination:', () => {
    expect(
      extractCandidateFromLine(
        '[download] Destination: /Volumes/qdSSD/downloaded.mp4'
      )
    ).toBe('/Volumes/qdSSD/downloaded.mp4')
  })

  it('extracts from [download] already downloaded', () => {
    expect(
      extractCandidateFromLine(
        '[download] /Volumes/qdSSD/already.mp4 has already been downloaded'
      )
    ).toBe('/Volumes/qdSSD/already.mp4')
  })

  it('extracts from [MoveFiles]', () => {
    expect(
      extractCandidateFromLine(
        '[MoveFiles] Moving file "/tmp/temp.mp4" to "/Volumes/qdSSD/final.mp4"'
      )
    ).toBe('/Volumes/qdSSD/final.mp4')
  })
})

describe('extractSavedFilePath', () => {
  it('extracts the final path from the exact user log snippet', () => {
    const log = `
(frag 150/162)[download]  92.6% of ~ 302.30MiB at    3.06MiB/s ETA 00:07 (frag 151/162)[download]  93.8% of ~ 298.45MiB at    3.09MiB/s ETA 00:07
[download] 100% of  295.51MiB in 00:01:14 at 3.98MiB/s                   
[FixupM3u8] Fixing MPEG-TS in MP4 container of "/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4"
[VideoRemuxer] Not remuxing media file "/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4"; already is in target format mp4
[EmbedSubtitle] There aren't any subtitles to embed
[Metadata] Adding metadata to "/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4"
`
    expect(extractSavedFilePath(log)).toBe(
      '/Volumes/qdSSD/FashionQQueen/Floral Mini Dress Cottagecore Aesthetic Red Chiffon Style.mp4'
    )
  })

  it('prioritizes the post-processed file over intermediate streams', () => {
    const log = `
[download] Destination: /tmp/video.f137.mp4
[download] 100% of 100MiB
[download] Destination: /tmp/video.f140.m4a
[download] 100% of 10MiB
[Merger] Merging formats into "/tmp/final_video.mp4"
[Metadata] Adding metadata to "/tmp/final_video.mp4"
`
    expect(extractSavedFilePath(log)).toBe('/tmp/final_video.mp4')
  })
})

describe('YtDlpExecutor streaming filePath preservation', () => {
  it('retains the filePath even when flooded with >8KB progress logs and no trailing metadata', async () => {
    const { EventEmitter } = await import('node:events')
    const { YtDlpExecutor } = await import('../src/yt-dlp-executor')

    let finishEvent: any = null

    const executor = new YtDlpExecutor({
      resolveYtDlpPath: () => '/usr/local/bin/yt-dlp',
      resolveFfmpegLocation: () => '/usr/local/bin/ffmpeg',
      defaultDownloadDir: '/tmp',
      spawnFn: () => {
        const procEmitter = new EventEmitter() as any
        const stdoutEmitter = new EventEmitter()
        const stderrEmitter = new EventEmitter()
        procEmitter.ytDlpProcess = {
          pid: 12345,
          stdout: stdoutEmitter,
          stderr: stderrEmitter
        }

        setTimeout(() => {
          // 1. First chunk emits destination
          stdoutEmitter.emit(
            'data',
            Buffer.from('[download] Destination: /tmp/test-stream-file.mp4\n')
          )

          // 2. Flood with 100 lines of progress (>10KB) so the first chunk is pushed out of the 8KB tail buffer
          for (let i = 1; i <= 100; i++) {
            stdoutEmitter.emit(
              'data',
              Buffer.from(
                `[download]  ${i}.0% of ~ 300.00MiB at 3.00MiB/s ETA 00:05 (frag ${i}/100) some long extra filler text here to ensure buffer overflows\n`
              )
            )
          }

          // 3. Close with code 0
          procEmitter.emit('close', 0)
        }, 10)

        return procEmitter
      }
    })

    await new Promise<void>((resolve) => {
      executor.run(
        {
          taskId: 'task-1',
          attemptId: 'att-1',
          input: {
            url: 'https://example.com/video',
            kind: 'video',
            downloadDir: '/tmp'
          } as any
        },
        {
          onSpawn: () => {},
          onProgress: () => {},
          onStd: () => {},
          onFinish: (e) => {
            finishEvent = e
            resolve()
          }
        }
      )
    })

    expect(finishEvent).not.toBeNull()
    expect(finishEvent.result.type).toBe('success')
    expect(finishEvent.result.output.filePath).toBe('/tmp/test-stream-file.mp4')
  })

  it('correctly reassembles lines that are split across chunk boundaries', async () => {
    const { EventEmitter } = await import('node:events')
    const { YtDlpExecutor } = await import('../src/yt-dlp-executor')

    let finishEvent: any = null

    const executor = new YtDlpExecutor({
      resolveYtDlpPath: () => '/usr/local/bin/yt-dlp',
      resolveFfmpegLocation: () => '/usr/local/bin/ffmpeg',
      defaultDownloadDir: '/tmp',
      spawnFn: () => {
        const procEmitter = new EventEmitter() as any
        const stdoutEmitter = new EventEmitter()
        const stderrEmitter = new EventEmitter()
        procEmitter.ytDlpProcess = {
          pid: 12346,
          stdout: stdoutEmitter,
          stderr: stderrEmitter
        }

        setTimeout(() => {
          // Emitting line split across two chunk fragments
          stdoutEmitter.emit(
            'data',
            Buffer.from('[Metadata] Adding metadata to "/tmp/frag')
          )
          stdoutEmitter.emit('data', Buffer.from('mented-file.mp4"\n'))
          procEmitter.emit('close', 0)
        }, 10)

        return procEmitter
      }
    })

    await new Promise<void>((resolve) => {
      executor.run(
        {
          taskId: 'task-2',
          attemptId: 'att-2',
          input: {
            url: 'https://example.com/video2',
            kind: 'video',
            downloadDir: '/tmp'
          } as any
        },
        {
          onSpawn: () => {},
          onProgress: () => {},
          onStd: () => {},
          onFinish: (e) => {
            finishEvent = e
            resolve()
          }
        }
      )
    })

    expect(finishEvent).not.toBeNull()
    expect(finishEvent.result.type).toBe('success')
    expect(finishEvent.result.output.filePath).toBe('/tmp/fragmented-file.mp4')
  })
})

