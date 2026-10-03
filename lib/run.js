import { spawn } from "node:child_process";

export function runTool(command, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdout = { value: "" };
    const stderr = { value: "" };
    const flushOut = collect(child.stdout, stdout, onLine);
    const flushErr = collect(child.stderr, stderr, onLine);

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error(`Could not start ${command}.`));
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      flushOut();
      flushErr();
      if (code === 0) {
        resolve({ stdout: stdout.value, stderr: stderr.value });
        return;
      }
      reject(new Error(toolError(stderr.value, stdout.value, code)));
    });
  });
}

function collect(stream, sink, onLine) {
  let buffer = "";
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    sink.value += text;
    buffer += text;
    const parts = buffer.split(/\r\n|\n|\r/);
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.trim()) onLine?.(line);
    }
  });
  return () => {
    if (buffer.trim()) onLine?.(buffer);
  };
}

export function toolError(stderr, stdout, code) {
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorLine = [...lines].reverse().find((line) => /^ERROR:/i.test(line));
  const message = (errorLine || lines.at(-1) || `The tool exited with code ${code}`)
    .replace(/^ERROR:\s*/i, "")
    .replace(/^\[[^\]]+\]\s+[\w-]+:\s*/, "");
  return message.slice(0, 500);
}
