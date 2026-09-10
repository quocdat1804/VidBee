import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TASK_QUEUE_DDL_V1 } from '@vidbee/db/task-queue'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mergeLegacyTaskQueueDb } from '../src/migrate-task-queue-db'

/**
 * Upgrade path for users coming from a release where the queue lived in a
 * standalone `task-queue.db`. On v2 the unified `vidbee.db` adopts those rows
 * via `INSERT OR IGNORE INTO tasks SELECT * FROM legacy_tq.tasks`, which is a
 * positional copy: it silently mismatches if either side's column order ever
 * drifts. These tests pin the copy, the idempotency, and the source-file
 * handoff so a future schema edit cannot quietly corrupt an upgrade.
 */

const tempDirs: string[] = []

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-tq-migrate-'))
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

/** Stand-in for a pre-v2 standalone `task-queue.db`. */
const createLegacyDb = (filePath: string): void => {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.exec(TASK_QUEUE_DDL_V1)
  db.prepare(
    `INSERT INTO tasks (
       id, kind, parent_id, status, prev_status, status_reason, entered_status_at,
       priority, group_key, attempt, max_attempts, next_retry_at, pid, pid_started_at,
       created_at, updated_at, input_json, progress_json, output_json, last_error_json
     ) VALUES (
       'task-legacy-1', 'download', NULL, 'completed', 'running', NULL, 1000,
       0, 'group-a', 1, 3, NULL, NULL, NULL,
       900, 1000, '{"url":"https://example.com/a"}', NULL, '{"filePath":"/tmp/a.mp4"}', NULL
     )`
  ).run()
  db.prepare(
    `INSERT INTO attempts (
       id, task_id, attempt_number, started_at, ended_at, exit_code, error_category,
       stdout_tail, stderr_tail, raw_args_hash
     ) VALUES ('attempt-legacy-1', 'task-legacy-1', 1, 900, 1000, 0, NULL, '', '', 'hash-legacy')`
  ).run()
  db.prepare(
    `INSERT INTO process_journal (ts, op, task_id, attempt_id, pid, pid_started_at, exit_code, signal)
     VALUES (900, 'spawn', 'task-legacy-1', 'attempt-legacy-1', 4321, 900, NULL, NULL)`
  ).run()
  db.close()
}

const countRows = (db: Database.Database, table: string): number =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n)

describe('mergeLegacyTaskQueueDb', () => {
  it('copies legacy tasks, attempts and journal rows into the unified database', () => {
    const dir = makeTempDir()
    const legacyPath = join(dir, 'task-queue.db')
    createLegacyDb(legacyPath)

    const target = new Database(join(dir, 'vidbee.db'))
    target.exec(TASK_QUEUE_DDL_V1)

    const result = mergeLegacyTaskQueueDb({
      target,
      legacyPath,
      openLegacy: (path) => new Database(path, { readonly: true })
    })

    expect(result.merged).toBe(true)
    expect(result.tasksCopied).toBe(1)
    expect(countRows(target, 'tasks')).toBe(1)
    expect(countRows(target, 'attempts')).toBe(1)
    expect(countRows(target, 'process_journal')).toBe(1)

    // The positional `SELECT *` copy must land values in the right columns.
    const task = target
      .prepare('SELECT id, status, group_key, input_json, output_json FROM tasks')
      .get() as { id: string; status: string; group_key: string; input_json: string; output_json: string }
    expect(task.id).toBe('task-legacy-1')
    expect(task.status).toBe('completed')
    expect(task.group_key).toBe('group-a')
    expect(task.input_json).toBe('{"url":"https://example.com/a"}')
    expect(task.output_json).toBe('{"filePath":"/tmp/a.mp4"}')

    target.close()
  })

  it('hands the legacy file off to *.migrated so the app cannot re-merge it', () => {
    const dir = makeTempDir()
    const legacyPath = join(dir, 'task-queue.db')
    createLegacyDb(legacyPath)

    const target = new Database(join(dir, 'vidbee.db'))
    target.exec(TASK_QUEUE_DDL_V1)

    const result = mergeLegacyTaskQueueDb({
      target,
      legacyPath,
      openLegacy: (path) => new Database(path, { readonly: true })
    })

    expect(result.backupPath).toBe(`${legacyPath}.migrated`)
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}.migrated`)).toBe(true)

    target.close()
  })

  it('is idempotent when the same legacy rows are offered twice', () => {
    const dir = makeTempDir()
    const legacyPath = join(dir, 'task-queue.db')
    createLegacyDb(legacyPath)

    const target = new Database(join(dir, 'vidbee.db'))
    target.exec(TASK_QUEUE_DDL_V1)

    const first = mergeLegacyTaskQueueDb({
      target,
      legacyPath,
      openLegacy: (path) => new Database(path, { readonly: true })
    })
    expect(first.tasksCopied).toBe(1)

    // A re-run against a copy of the same rows must not duplicate them, and the
    // second pass must report zero newly copied tasks.
    const second = mergeLegacyTaskQueueDb({
      target,
      legacyPath: `${legacyPath}.migrated`,
      openLegacy: (path) => new Database(path, { readonly: true })
    })
    expect(second.merged).toBe(true)
    expect(second.tasksCopied).toBe(0)
    expect(countRows(target, 'tasks')).toBe(1)
    expect(countRows(target, 'attempts')).toBe(1)

    target.close()
  })

  it('keeps the existing database untouched when no legacy file is present', () => {
    const dir = makeTempDir()

    const target = new Database(join(dir, 'vidbee.db'))
    target.exec(TASK_QUEUE_DDL_V1)

    const result = mergeLegacyTaskQueueDb({
      target,
      legacyPath: join(dir, 'absent.db'),
      openLegacy: (path) => new Database(path, { readonly: true })
    })

    expect(result.merged).toBe(false)
    expect(result.backupPath).toBeNull()
    expect(countRows(target, 'tasks')).toBe(0)

    target.close()
  })

  it('ignores a legacy file that has no tasks table', () => {
    const dir = makeTempDir()
    const legacyPath = join(dir, 'task-queue.db')
    // A fresh standalone DB from an even older build can be empty.
    new Database(legacyPath).close()

    const target = new Database(join(dir, 'vidbee.db'))
    target.exec(TASK_QUEUE_DDL_V1)

    const result = mergeLegacyTaskQueueDb({
      target,
      legacyPath,
      openLegacy: (path) => new Database(path, { readonly: true })
    })

    expect(result.merged).toBe(false)
    expect(result.tasksCopied).toBe(0)
    // Not merged means no rename, so a later run can still try.
    expect(existsSync(legacyPath)).toBe(true)

    target.close()
  })
})
