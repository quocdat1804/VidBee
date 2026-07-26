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
