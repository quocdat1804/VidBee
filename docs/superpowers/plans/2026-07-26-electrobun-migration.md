# Electrobun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate VidBee desktop application architecture from Electron to Electrobun (Bun + System WebKit/WebView2), enabling instant startup, ~15-20MB app bundle size, zero-GYP native `bun:sqlite` database, and `Bun.spawn` subprocess management.

**Architecture:** Monorepo package structure where Electrobun runs Bun for main process logic, interfacing via Electrobun typed RPC/events with the existing React 19 + Vite + Tailwind v4 Renderer UI.

**Tech Stack:** Bun, Electrobun, React 19, Vite, Tailwind CSS v4, `bun:sqlite`, Drizzle ORM, TypeScript.

## Global Constraints

- Node/Bun version: Bun 1.1+ runtime.
- Monorepo package manager: `pnpm` workspace.
- Keep original Electron `apps/desktop` intact while bootstrapping Electrobun application structure.
- Adhere to KISS & YAGNI principles.

---

### Task 1: Setup Electrobun App Package & Workspace Scaffolding

**Files:**
- Create: `apps/desktop-electrobun/package.json`
- Create: `apps/desktop-electrobun/electrobun.config.ts`
- Create: `apps/desktop-electrobun/src/main/index.ts`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: Monorepo workspace configuration.
- Produces: `apps/desktop-electrobun` runnable bundle setup with Electrobun CLI.

- [ ] **Step 1: Update `pnpm-workspace.yaml` to include `apps/desktop-electrobun`**

Modify `pnpm-workspace.yaml` if necessary to include `apps/desktop-electrobun`.

- [ ] **Step 2: Create `apps/desktop-electrobun/package.json`**

```json
{
  "name": "@vidbee/desktop-electrobun",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "electrobun dev",
    "build": "electrobun build"
  },
  "dependencies": {
    "electrobun": "^0.1.0"
  }
}
```

- [ ] **Step 3: Create `apps/desktop-electrobun/electrobun.config.ts`**

```typescript
import { defineConfig } from "electrobun/config";

export default defineConfig({
  app: {
    name: "VidBee Electrobun",
    identifier: "com.vidbee.app.electrobun",
    version: "1.0.0"
  },
  browserViews: {
    main: {
      url: "http://localhost:5173"
    }
  }
});
```

- [ ] **Step 4: Create entry file `apps/desktop-electrobun/src/main/index.ts`**

```typescript
import Electrobun from "electrobun/bun";

console.log("VidBee Electrobun main process initialized");

const win = new Electrobun.BrowserWindow({
  title: "VidBee Electrobun",
  width: 1024,
  height: 720,
  url: "http://localhost:5173"
});

win.on("close", () => {
  process.exit(0);
});
```

- [ ] **Step 5: Verify build/type check setup & commit**

```bash
pnpm check
git add apps/desktop-electrobun pnpm-workspace.yaml
git commit -m "feat(electrobun): scaffold desktop-electrobun app package"
```

---

### Task 2: Database Driver Adapter (`bun:sqlite` with Drizzle ORM)

**Files:**
- Create: `packages/db/src/bun-driver.ts`
- Create: `packages/db/src/__tests__/bun-driver.test.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: `bun:sqlite` Database API.
- Produces: `createBunDatabase(dbPath: string)` returning Drizzle DB instance.

- [ ] **Step 1: Write unit test for `bun:sqlite` Drizzle driver**

```typescript
import { describe, expect, test } from "bun:test";
import { createBunDatabase } from "../bun-driver";

describe("bun:sqlite driver", () => {
  test("initializes memory database successfully", () => {
    const db = createBunDatabase(":memory:");
    expect(db).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement `createBunDatabase` in `packages/db/src/bun-driver.ts`**

```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export function createBunDatabase(dbPath: string) {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema });
}
```

- [ ] **Step 3: Run test with Bun to verify pass**

```bash
bun test packages/db/src/__tests__/bun-driver.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add packages/db/src/bun-driver.ts packages/db/src/__tests__/bun-driver.test.ts packages/db/package.json
git commit -m "feat(db): implement bun:sqlite driver adapter for drizzle"
```

---

### Task 3: High Performance Subprocess Spawner (`downloader-core` using `Bun.spawn`)

**Files:**
- Create: `packages/downloader-core/src/bun-spawner.ts`
- Create: `packages/downloader-core/src/__tests__/bun-spawner.test.ts`

**Interfaces:**
- Consumes: Binary path string and string array of arguments.
- Produces: `spawnBinary(command: string, args: string[], onStdout: (data: string) => void)` returning process control handle.

- [ ] **Step 1: Write test for `spawnBinary`**

```typescript
import { describe, expect, test } from "bun:test";
import { spawnBinary } from "../bun-spawner";

describe("Bun Subprocess Spawner", () => {
  test("executes command and receives stdout", async () => {
    let output = "";
    const proc = spawnBinary("echo", ["hello vidbee"], (data) => {
      output += data;
    });
    await proc.exited;
    expect(output.trim()).toBe("hello vidbee");
  });
});
```

- [ ] **Step 2: Implement `spawnBinary` in `packages/downloader-core/src/bun-spawner.ts`**

```typescript
export function spawnBinary(
  command: string,
  args: string[],
  onStdout: (data: string) => void,
  onStderr?: (data: string) => void
) {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe"
  });

  (async () => {
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onStdout(decoder.decode(value));
      }
    }
  })();

  (async () => {
    if (proc.stderr && onStderr) {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onStderr(decoder.decode(value));
      }
    }
  })();

  return proc;
}
```

- [ ] **Step 3: Run test with Bun**

```bash
bun test packages/downloader-core/src/__tests__/bun-spawner.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add packages/downloader-core/src/bun-spawner.ts packages/downloader-core/src/__tests__/bun-spawner.test.ts
git commit -m "feat(downloader-core): add Bun.spawn wrapper with stream readers"
```

---

### Task 4: Electrobun RPC Bridge for Main-Renderer Services

**Files:**
- Create: `apps/desktop-electrobun/src/main/rpc.ts`
- Create: `apps/desktop-electrobun/src/renderer/rpc-client.ts`

**Interfaces:**
- Consumes: Electrobun messaging API.
- Produces: Strongly typed RPC call handlers (`getAppVersion`, `startDownload`, `getDownloadHistory`).

- [ ] **Step 1: Define RPC schema and handler in `apps/desktop-electrobun/src/main/rpc.ts`**

```typescript
export interface AppRPC {
  getAppVersion: () => Promise<string>;
  ping: () => Promise<string>;
}

export function registerRPCHandlers() {
  return {
    getAppVersion: async () => "1.3.13-electrobun",
    ping: async () => "pong"
  };
}
```

- [ ] **Step 2: Commit RPC bridge setup**

```bash
git add apps/desktop-electrobun/src/main/rpc.ts
git commit -m "feat(electrobun): setup typed RPC bridge handlers"
```

---

### Task 5: Electrobun Renderer Integration & Bundling

**Files:**
- Modify: `apps/desktop-electrobun/electrobun.config.ts`
- Modify: `apps/desktop-electrobun/package.json`

**Interfaces:**
- Consumes: Built React 19 Vite bundle (`apps/desktop/out/renderer`).
- Produces: Integrated Electrobun distribution build.

- [ ] **Step 1: Configure build script in `package.json` to link Vite build output**
- [ ] **Step 2: Test building the app**

```bash
pnpm check
git add apps/desktop-electrobun
git commit -m "feat(electrobun): link react 19 vite renderer to electrobun build"
```
