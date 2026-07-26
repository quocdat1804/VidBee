import { describe, expect, test } from "bun:test";
import { createBunDatabase } from "../bun-driver";

describe("bun:sqlite driver", () => {
  test("initializes memory database successfully", () => {
    const db = createBunDatabase(":memory:");
    expect(db).toBeDefined();
  });
});
