# App Size Optimization (On-Demand Binary Loading) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink VidBee installer DMG size from ~290MB down to ~75MB and installed size from ~780MB down to ~350MB by replacing bundled Deno with Node.js runtime for yt-dlp and downloading FFmpeg on-demand when needed.

**Architecture:**
1. Configure `yt-dlp-args.ts` to pass `--js-runtimes node` instead of requiring bundled Deno (saving ~78MB).
2. Create an `FFmpegDownloader` service in `apps/desktop/src/main/lib/ffmpeg-downloader.ts` to automatically fetch platform-specific FFmpeg/FFprobe binaries on-demand into `userData` directory on first launch.
3. Update `apps/desktop/electron-builder.yml` and `scripts/setup-dev-binaries.js` to exclude heavy Deno/FFmpeg binaries from build resources.

**Tech Stack:** Electron 38, Node.js `fs`/`https`, `yt-dlp`, `electron-builder`.

## Global Constraints

- Use `pnpm` exclusively for commands.
- Run `pnpm run check` to verify code format, i18n, and types after each task.
- Follow Ultracite code quality guidelines.
- Commit messages must follow Conventional Commits format (`perf(...)`, `feat(...)`, `fix(...)`).

---

### Task 1: Use Node.js JS Runtime for `yt-dlp` (Remove Deno Dependency)

**Files:**
- Modify: `packages/downloader-core/src/yt-dlp-args.ts`
- Modify: `apps/desktop/src/main/lib/startup-dependencies.ts`

**Interfaces:**
- Consumes: `buildDownloadArgs` and `buildVideoInfoArgs` in `downloader-core`
- Produces: `--js-runtimes node` passed to `yt-dlp`, eliminating the 78MB Deno binary requirement.

- [ ] **Step 1: Update `yt-dlp-args.ts` to pass `--js-runtimes node`**

In `packages/downloader-core/src/yt-dlp-args.ts`:
```ts
  if (!args.includes('--js-runtimes')) {
    args.push('--js-runtimes', 'node')
  }
```

- [ ] **Step 2: Run verification check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add packages/downloader-core/src/yt-dlp-args.ts
git commit -m "perf(downloader): use nodejs js-runtime for yt-dlp to eliminate deno binary"
```

---

### Task 2: Implement On-Demand FFmpeg Downloader Service

**Files:**
- Create: `apps/desktop/src/main/lib/ffmpeg-downloader.ts`
- Modify: `apps/desktop/src/main/lib/ffmpeg-manager.ts`

**Interfaces:**
- Consumes: Electron `app.getPath('userData')` and platform release URLs
- Produces: `ensureFFmpegInstalled(): Promise<string>` which checks for local FFmpeg in `userData/bin` or downloads it automatically on-demand.

- [ ] **Step 1: Create `ffmpeg-downloader.ts`**

In `apps/desktop/src/main/lib/ffmpeg-downloader.ts`:
```ts
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

const logger = log.scope('ffmpeg-downloader')

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
```

- [ ] **Step 2: Connect `ffmpeg-manager.ts` to fallback to local `userData/bin` FFmpeg**

Update `apps/desktop/src/main/lib/ffmpeg-manager.ts` to check `getLocalFFmpegPath()` when bundled resources do not include FFmpeg.

- [ ] **Step 3: Run verification check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add apps/desktop/src/main/lib/ffmpeg-downloader.ts apps/desktop/src/main/lib/ffmpeg-manager.ts
git commit -m "feat(desktop): add on-demand ffmpeg downloader service"
```

---

### Task 3: Exclude Deno & FFmpeg Binaries from App Packaging

**Files:**
- Modify: `apps/desktop/electron-builder.yml:22-28`

**Interfaces:**
- Consumes: `electron-builder` configuration
- Produces: Packaging configuration excluding `resources/deno` and `resources/ffmpeg` from app installer bundles.

- [ ] **Step 1: Update `electron-builder.yml` extraResources filter**

In `apps/desktop/electron-builder.yml`, exclude `deno` and `ffmpeg` from extraResources:

```yml
extraResources:
  - from: resources
    to: resources
    filter:
      - '**/*'
      - '!deno*'
      - '!ffmpeg/**'
```

- [ ] **Step 2: Run verification check & test build size**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/desktop/electron-builder.yml
git commit -m "perf(build): exclude deno and ffmpeg binaries from installer bundle"
```
