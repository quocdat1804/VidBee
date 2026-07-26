# VidBee Electrobun Migration Design Document

- **Date**: 2026-07-26
- **Status**: Approved
- **Target Branch**: `feat/electrobun-migration`
- **Scope**: Migration of VidBee Desktop Application from Electron to Electrobun (Bun + System WebKit/WebView2).

---

## 1. Objectives & Benefits

VidBee is currently built as a monorepo desktop app powered by Electron (`apps/desktop`). While feature-complete, Electron introduces high memory usage (~200MB+ RAM idle) and large bundle sizes (~180MB+ per platform).

Migrating to **Electrobun** provides:
- **Ultra-lightweight footprint**: App bundle reduced from ~180MB to ~15–20MB.
- **Fast Startup & Low Memory**: Instant cold boot and ~30–50MB RAM consumption.
- **Native Bun Ecosystem**: Uses `bun:sqlite` out of the box (zero native build/gyp step overhead) and `Bun.spawn` for subprocess management (`yt-dlp`, `ffmpeg`).
- **Clean Separation**: UI built with React 19 + Vite remains unchanged in the Renderer layer.

---

## 2. System Architecture & Comparison

| Domain / Subsystem | Current (Electron) | Target (Electrobun) | Rationale / Benefits |
| :--- | :--- | :--- | :--- |
| **Main Process Runtime** | Node.js + Electron Main | **Bun + Electrobun Main** | Direct execution of TypeScript via Bun engine |
| **SQLite Database** | `better-sqlite3` + `drizzle-orm` | **`bun:sqlite` + `drizzle-orm`** | Eliminates native C++ compilation; faster queries |
| **IPC Bridge** | `ipcMain` / `ipcRenderer` | **Electrobun RPC & Event System** | Strongly-typed RPC bridge between Bun & Webview |
| **Subprocess Execution** | Node `child_process` | **`Bun.spawn`** | High performance stdio streaming for `yt-dlp` & `ffmpeg` |
| **Renderer UI** | React 19 + Vite + Tailwind v4 | **React 19 + Vite + Tailwind v4** | Renderer assets load into system WebView seamlessly |
| **Window & Tray** | Electron `BrowserWindow` | **Electrobun `BrowserWindow`** | Lightweight native window controls |

---

## 3. Migration Roadmap & Phased Approach

### Phase 1: Workspace & App Co-Existence Setup
- Create a dedicated app folder `apps/desktop-electrobun` or configure dual-target building in monorepo.
- Configure Electrobun CLI (`electrobun.config.ts`), Vite plugins, and Bun workspace dependencies.

### Phase 2: Core Database & Task Queue Compatibility
- Update `@vidbee/db` to support `bun:sqlite` driver in parallel with `better-sqlite3`.
- Verify Drizzle ORM migrations and task queue persistence on `bun:sqlite`.

### Phase 3: Subprocess Management (`downloader-core`)
- Refactor downloader execution to utilize `Bun.spawn` for `yt-dlp`, `ffmpeg`, and `deno` binaries.
- Ensure cross-platform binary path resolution (`mac`, `win`, `linux`) works with extra resources.

### Phase 4: Typed IPC Bridge & Main Services
- Replace Electron IPC channels with Electrobun RPC endpoints.
- Migrate Services: Download Service, Settings Service, Update Service, Subscription Service, and History Service.

### Phase 5: Renderer Integration & Quality Assurance
- Connect existing React 19 + Vite renderer bundle to Electrobun WebView.
- Comprehensive UI testing: Download flows, playlist expand/collapse, virtualized lists, i18n switching, theme switching.

### Phase 6: Packaging & Distribution
- Configure Electrobun build & packaging scripts for macOS (`.dmg`), Windows (`.exe`), and Linux (`.AppImage`).
