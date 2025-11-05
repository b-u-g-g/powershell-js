const { spawn } = require("child_process");
const { PassThrough } = require("stream");

function handlePipeline(input, parseArgs, commands, getAbsPath, safeRepl) {
  const segments = input.split("|").map((s) => s.trim());
  if (segments.length === 0 || segments[0] === "") {
    return setTimeout(safeRepl, 10);
  }

  const pipes = Array.from({ length: segments.length - 1 }, () => new PassThrough());
  const processes = [];
  let remaining = segments.length;

  segments.forEach((segment, i) => {
    const args = parseArgs(segment);
    const cmd = args[0];
    const isBuiltin = commands[cmd];
    const stdin = i === 0 ? process.stdin : pipes[i - 1];
    const stdout = i === segments.length - 1 ? process.stdout : pipes[i];

    if (isBuiltin) {
      const chunks = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      };

      try {
        commands[cmd](...args.slice(1));
      } catch (e) {
        chunks.push(Buffer.from(e.message + "\n"));
      }

      process.stdout.write = originalWrite;
      const output = Buffer.concat(chunks);
      if (stdout !== process.stdout) {
        stdout.write(output);
        stdout.end();
      } else {
        process.stdout.write(output);
      }

      if (--remaining === 0) setTimeout(safeRepl, 10);
    } else {
      const proc = spawn(cmd, args.slice(1), { stdio: ["pipe", "pipe", "inherit"] });
      if (stdin !== process.stdin) stdin.pipe(proc.stdin);
      else proc.stdin.end();

      proc.stdout.pipe(stdout);

      proc.on("close", () => {
        if (--remaining === 0) setTimeout(safeRepl, 10);
      });

      proc.on("error", () => {
        console.error(`${cmd}: command not found`);
        if (--remaining === 0) setTimeout(safeRepl, 10);
      });

      processes.push(proc);
    }
  });
}

module.exports = { handlePipeline };
