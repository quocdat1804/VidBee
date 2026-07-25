# Performance Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize application startup time, renderer JS bundle size, disk I/O latency, and SQLite write throughput for VidBee Desktop.

**Architecture:** Split secondary React routes with `React.lazy()`, configure Vite Rollup `manualChunks` function to eliminate the 2.33MB monolithic chunk, parallelize thumbnail filesystem queries in Main process with a fast-path check, and configure SQLite `synchronous = NORMAL` for WAL mode.

**Tech Stack:** Electron 38, React 19, Vite / electron-vite, TypeScript, better-sqlite3, Jotai.

## Global Constraints

- Use `pnpm` exclusively for commands.
- Run `pnpm run check` to verify code format, i18n, and types after each task.
- Follow Ultracite code quality guidelines.
- Commit messages must follow Conventional Commits format (`perf(...)`, `feat(...)`, `fix(...)`).

---

### Task 1: Optimize SQLite Database Write Performance

**Files:**
- Modify: `apps/desktop/src/main/lib/database.ts:31-33`

**Interfaces:**
- Consumes: `better-sqlite3` instance in `getDatabaseConnection()`
- Produces: `DatabaseConnection` with `synchronous = NORMAL` set on the SQLite connection

- [ ] **Step 1: Update SQLite pragmas in `database.ts`**

Update `getDatabaseConnection` in `apps/desktop/src/main/lib/database.ts`:
```ts
  const sqlite = new DatabaseConstructor(databasePath, { timeout: 5000 })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
```

- [ ] **Step 2: Run verification check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/desktop/src/main/lib/database.ts
git commit -m "perf(desktop): set sqlite synchronous mode to NORMAL for WAL mode"
```

---

### Task 2: Optimize Thumbnail Cache Disk Access with Fast-Path & Parallel Fallback

**Files:**
- Modify: `apps/desktop/src/main/lib/thumbnail-cache.ts:100-117`

**Interfaces:**
- Consumes: `ThumbnailCache.findExistingPath`
- Produces: Fast-path single disk check for expected extension + parallel `Promise.all` fallback, reducing up to 5 sequential disk syscalls to 1.

- [ ] **Step 1: Refactor `findExistingPath` in `thumbnail-cache.ts`**

Replace `findExistingPath` in `apps/desktop/src/main/lib/thumbnail-cache.ts` with fast-path + parallel fallback:

```ts
  private async findExistingPath(
    basePath: string,
    defaultExtension: string
  ): Promise<string | null> {
    // Fast path: 95%+ of thumbnails match default extension derived from URL path
    const primaryCandidate = `${basePath}${defaultExtension}`
    if (await this.exists(primaryCandidate)) {
      return primaryCandidate
    }

    // Fallback: Parallel check for remaining supported extensions
    const otherExtensions = Array.from(SUPPORTED_EXTENSIONS).filter(
      (ext) => ext !== defaultExtension
    )
    const checks = otherExtensions.map(async (ext) => {
      const candidate = `${basePath}${ext}`
      return (await this.exists(candidate)) ? candidate : null
    })

    const results = await Promise.all(checks)
    return results.find((path): path is string => path !== null) ?? null
  }
```

- [ ] **Step 2: Run verification check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/desktop/src/main/lib/thumbnail-cache.ts
git commit -m "perf(desktop): add fast-path and parallel checks for thumbnail cache"
```

---

### Task 3: Implement React Route Code-Splitting for Renderer

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx:18-24`

**Interfaces:**
- Consumes: React `lazy` & `Suspense`
- Produces: Asynchronously loaded sub-pages (`Settings`, `Subscriptions`, `About`) deferred until navigation, reducing initial page script weight.

- [ ] **Step 1: Convert static page imports to `lazy()` in `App.tsx`**

In `apps/desktop/src/renderer/src/App.tsx`, replace static page imports with:
```tsx
import { lazy, Suspense } from 'react'
import { Home } from './pages/Home'

const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const Subscriptions = lazy(() =>
  import('./pages/Subscriptions').then((m) => ({ default: m.Subscriptions }))
)
```

Wrap route components in `<Suspense fallback={null}>` inside `<Routes>`:
```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route
    path="/subscriptions"
    element={
      <Suspense fallback={null}>
        <Subscriptions />
      </Suspense>
    }
  />
  <Route
    path="/settings"
    element={
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    }
  />
  <Route
    path="/about"
    element={
      <Suspense fallback={null}>
        <About />
      </Suspense>
    }
  />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

- [ ] **Step 2: Verify typecheck & check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit changes**

```bash
git add apps/desktop/src/renderer/src/App.tsx
git commit -m "perf(renderer): lazy load Settings, Subscriptions and About routes"
```

---

### Task 4: Configure Rollup Chunk Splitting in Vite

**Files:**
- Modify: `apps/desktop/electron.vite.config.ts:72-91`

**Interfaces:**
- Consumes: Vite / Rollup build configuration in `electron.vite.config.ts`
- Produces: Split bundle outputs separating vendor libraries (`vendor-react`, `vendor-ui`) from application business logic.

- [ ] **Step 1: Update `renderer.build` in `electron.vite.config.ts`**

Add `rollupOptions.output.manualChunks` function to `renderer.build` in `apps/desktop/electron.vite.config.ts`:

```ts
    renderer: {
      base: './',
      define,
      build: {
        sourcemap: true,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (
                  id.includes('/react/') ||
                  id.includes('/react-dom/') ||
                  id.includes('/react-router/') ||
                  id.includes('/jotai/')
                ) {
                  return 'vendor-react'
                }
                if (
                  id.includes('/@radix-ui/') ||
                  id.includes('/lucide-react/') ||
                  id.includes('/sonner/')
                ) {
                  return 'vendor-ui'
                }
              }
            }
          }
        }
      },
```

- [ ] **Step 2: Build project and measure chunk sizes**

Run: `pnpm run build`
Expected: Output chunks split into vendor files, reducing main entry bundle size significantly below 2.33MB.

- [ ] **Step 3: Run check**

Run: `pnpm run check`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add apps/desktop/electron.vite.config.ts
git commit -m "perf(build): configure Rollup manualChunks function for vendor code splitting"
```
