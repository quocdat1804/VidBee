import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as historySchema from "./history";
import * as subscriptionsSchema from "./subscriptions";
import * as taskQueueSchema from "./task-queue";

export function createBunDatabase(dbPath: string) {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, {
    schema: {
      ...historySchema,
      ...subscriptionsSchema,
      ...taskQueueSchema
    }
  });
}
