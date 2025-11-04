const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PassThrough, Readable } = require("stream");

function findExecutable(cmd) {
  const pathDirs = process.env.PATH.split(path.delimiter);
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    try {
      const stats = fs.statSync(fullPath);
      fs.accessSync(fullPath, fs.constants.X_OK);
      if (stats.isFile()) return fullPath;
    } catch (_) {}
  }
  return null;
}

// Handles builtins inside pipeline
function runBuiltin(cmd, args, inputStream, outputStream, rl, builtins) {
  const write = (msg) => {
    if (outputStream && !outputStream.destroyed) outputStream.write(msg);
  };

  if (cmd === "echo") {
    let buffer = args.join(" ") + "\n";
    write(buffer);
    if (outputStream !== process.stdout) outputStream.end();
    return;
  }

  if (cmd === "type") {
    const target = args[0];
    if (!target) {
      write("type: missing argument\n");
    } else if (builtins.includes(target)) {
      write(`${target} is a shell builtin\n`);
    } else {
      const pathDirs = process.env.PATH.split(path.delimiter);
      let found = false;
      for (const dir of pathDirs) {
        const fullPath = path.join(dir, target);
        try {
          const stats = fs.statSync(fullPath);
          fs.accessSync(fullPath, fs.constants.X_OK);
          if (stats.isFile()) {
            write(`${target} is ${fullPath}\n`);
            found = true;
            break;
          }
        } catch (_) {}
      }
      if (!found) write(`${target}: not found\n`);
    }
    if (outputStream !== process.stdout) outputStream.end();
    return;
  }

  if (cmd === "exit") {
    const code = args[0] ? parseInt(args[0]) : 0;
    rl.close();
    process.exit(code);
  }

  if (cmd === "pwd") {
    write(process.cwd() + "\n");
    if (outputStream !== process.stdout) outputStream.end();
    return;
  }

  if (outputStream !== process.stdout) outputStream.end();
}

function executePipeline(command1, args1, command2, args2, rl, builtins) {
  const cmd1IsBuiltin = builtins.includes(command1);
  const cmd2IsBuiltin = builtins.includes(command2);

  // Case 1: both external
  if (!cmd1IsBuiltin && !cmd2IsBuiltin) {
    const cmd1Path = findExecutable(command1);
    const cmd2Path = findExecutable(command2);
    if (!cmd1Path || !cmd2Path) {
      console.log(`${!cmd1Path ? command1 : command2}: command not found`);
      rl.prompt();
      return;
    }
    const first = spawn(cmd1Path, args1, { stdio: ["inherit", "pipe", "inherit"] });
    const second = spawn(cmd2Path, args2, { stdio: ["pipe", "inherit", "inherit"] });
    first.stdout.pipe(second.stdin);
    second.on("close", () => rl.prompt());
    return;
  }

  // Case 2: first builtin, second external
  if (cmd1IsBuiltin && !cmd2IsBuiltin) {
    const cmd2Path = findExecutable(command2);
    if (!cmd2Path) {
      console.log(`${command2}: command not found`);
      rl.prompt();
      return;
    }
    const second = spawn(cmd2Path, args2, { stdio: ["pipe", "inherit", "inherit"] });
    runBuiltin(command1, args1, null, second.stdin, rl, builtins);
    second.on("close", () => rl.prompt());
    return;
  }

  // Case 3: first external, second builtin
  if (!cmd1IsBuiltin && cmd2IsBuiltin) {
    const cmd1Path = findExecutable(command1);
    if (!cmd1Path) {
      console.log(`${command1}: command not found`);
      rl.prompt();
      return;
    }

    const first = spawn(cmd1Path, args1, { stdio: ["inherit", "pipe", "inherit"] });
    let buffer = "";
    first.stdout.on("data", (data) => (buffer += data.toString()));
    first.on("close", () => {
      const inputStream = Readable.from(buffer);
      runBuiltin(command2, args2, inputStream, process.stdout, rl, builtins);
      rl.prompt();
    });
    return;
  }

  // Case 4: both builtins
  const pipe = new PassThrough();
  runBuiltin(command1, args1, null, pipe, rl, builtins);
  runBuiltin(command2, args2, pipe, process.stdout, rl, builtins);
  pipe.on("end", () => rl.prompt());
}

module.exports = { executePipeline };
