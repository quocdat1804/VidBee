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
