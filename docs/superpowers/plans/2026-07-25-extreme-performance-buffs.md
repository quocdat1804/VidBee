# Extreme Performance Buffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement extreme performance upgrades (Pro Max Performance) across SQLite memory caching, multi-threaded yt-dlp downloader args, atomic transient progress state, and virtualized list rendering.

**Architecture:** 
1. Enable SQLite 64MB memory page cache and memory temp store in Main process.
2. Add `--concurrent-fragments 4` (multi-threaded chunk downloads) to yt-dlp argument builder in `downloader-core`.
3. Separate high-frequency transient download progress state from structural metadata atoms in Jotai store.
4. Integrate `@tanstack/react-virtual` for virtualized rendering of download item lists.

**Tech Stack:** Electron 38, React 19, `@tanstack/react-virtual`, Jotai, better-sqlite3, yt-dlp.

## Global Constraints

- Use `pnpm` exclusively for commands.
- Run `pnpm run check` to verify code format, i18n, and types after each task.
- Follow Ultracite code quality guidelines.
- Commit messages must follow Conventional Commits format (`perf(...)`, `feat(...)`, `fix(...)`).

---

### Task 1: SQLite RAM Page Cache & Memory Temp Store Tuning

**Files:**
- Modify: `apps/desktop/src/main/lib/database.ts:31-35`

**Interfaces:**
- Consumes: `better-sqlite3` instance in `getDatabaseConnection()`
- Produces: SQLite connection tuned with 64MB RAM page cache (`cache_size = -64000`) and memory temp storage (`temp_store = MEMORY`).

- [ ] **Step 1: Update SQLite pragmas in `database.ts`**

In `apps/desktop/src/main/lib/database.ts`, add RAM page cache and memory temp store pragmas:

```ts
  const sqlite = new DatabaseConstructor(databasePath, { timeout: 5000 })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('cache_size = -64000') // 64MB RAM page cache
  sqlite.pragma('temp_store = MEMORY')
  sqlite.pragma('foreign_keys = ON')
```

- [ ] **Step 2: Run verification check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/desktop/src/main/lib/database.ts
git commit -m "perf(desktop): tune sqlite ram page cache and memory temp store"
```

---

### Task 2: Multi-Threaded Chunk Downloads in `downloader-core`

**Files:**
- Modify: `packages/downloader-core/src/yt-dlp-args.ts`

**Interfaces:**
- Consumes: `buildDownloadArgs` function in `downloader-core`
- Produces: Default multi-fragment concurrent downloading (`--concurrent-fragments 4`) for up to 4x faster stream downloads.

- [ ] **Step 1: Update `buildDownloadArgs` in `packages/downloader-core/src/yt-dlp-args.ts`**

Add `--concurrent-fragments` option to `buildDownloadArgs` defaults when no custom fragments argument is passed:

```ts
  // Enable multi-threaded concurrent fragment downloads for faster speed
  if (!args.includes('--concurrent-fragments') && !args.includes('-N')) {
    args.push('--concurrent-fragments', '4')
  }
```

- [ ] **Step 2: Run verification check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add packages/downloader-core/src/yt-dlp-args.ts
git commit -m "perf(downloader): add multi-threaded concurrent fragment downloads"
```

---

### Task 3: Granular Atomic Progress State Isolation

**Files:**
- Modify: `apps/desktop/src/renderer/src/store/downloads.ts`
- Modify: `apps/desktop/src/renderer/src/components/download/DownloadItem.tsx`

**Interfaces:**
- Consumes: Progress updates from IPC facade
- Produces: Isolated `downloadProgressMapAtom` storing progress ticks separately from main download list records, preventing full array re-sorting and list re-renders during high-frequency progress updates.

- [ ] **Step 1: Add isolated progress atom in `store/downloads.ts`**

In `apps/desktop/src/renderer/src/store/downloads.ts`:
```ts
export type DownloadProgressState = {
  progress?: number
  speed?: string
  eta?: string
  downloaded?: string
  total?: string
}

export const downloadProgressMapAtom = atom<Map<string, DownloadProgressState>>(new Map())

export const updateDownloadProgressAtom = atom(
  null,
  (get, set, payload: { id: string; progress?: number; speed?: string; eta?: string }) => {
    const map = new Map(get(downloadProgressMapAtom))
    const existing = map.get(payload.id) ?? {}
    map.set(payload.id, { ...existing, ...payload })
    set(downloadProgressMapAtom, map)
  }
)
```

- [ ] **Step 2: Verify typecheck & check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/desktop/src/renderer/src/store/downloads.ts apps/desktop/src/renderer/src/components/download/DownloadItem.tsx
git commit -m "perf(renderer): isolate transient progress state into dedicated progress atom"
```

---

### Task 4: Virtualized Download History List Rendering

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/renderer/src/components/download/UnifiedDownloadHistory.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-virtual`
- Produces: 60-120 FPS smooth scrolling virtualized list rendering only visible items in viewport.

- [ ] **Step 1: Install `@tanstack/react-virtual` in `apps/desktop`**

Run: `pnpm --filter ./apps/desktop add @tanstack/react-virtual`

- [ ] **Step 2: Implement virtualized scrolling in `UnifiedDownloadHistory.tsx`**

Integrate `useVirtualizer` in `UnifiedDownloadHistory.tsx` for items container:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

// Wrap list container with virtualizer for 60FPS list rendering
```

- [ ] **Step 3: Run check & build**

Run: `pnpm run check && pnpm run build`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add apps/desktop/package.json apps/desktop/src/renderer/src/components/download/UnifiedDownloadHistory.tsx pnpm-lock.yaml
git commit -m "perf(renderer): virtualize download history list rendering"
```
