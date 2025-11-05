// main.js
const readline = require("node:readline");
const fs = require("node:fs");
const { spawnSync } = require("child_process");
const path = require("node:path");

const { handlePipeline } = require("./pipeline");
const { completer } = require("./autocomplete");
const { applyRedirection } = require("./redirection");
const { parseArgs } = require("./quoting");

function getAbsPath(cmd) {
  if (!process.env.PATH) return false;
  const pathDirs = process.env.PATH.split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, cmd);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (_) {}
  }
  return false;
}

const commands = {
  exit: (code) => {
    rl.close();
    process.exit(code ? Number.parseInt(code) : 0);
  },
  echo: (...rest) => {
    let noNewline = false;
    if (rest[0] === "-n") {
      noNewline = true;
      rest = rest.slice(1);
    }
    const output = rest.join(" ");
    process.stdout.write(output + (noNewline ? "" : "\n"));
  },
  type: (command) => {
    if (commands[command]) return console.log(`${command} is a shell builtin`);
    const absPath = getAbsPath(command);
    if (absPath) console.log(`${command} is ${absPath}`);
    else console.log(`${command}: not found`);
  },
  pwd: () => console.log(process.cwd()),
  cd: (targetPath) => {
    if (!targetPath) return console.log("cd: missing argument");
    if (targetPath === "~") targetPath = process.env.HOME;
    const resolvedPath = path.resolve(process.cwd(), targetPath);
    try {
      process.chdir(resolvedPath);
    } catch {
      console.log(`cd: ${targetPath}: No such file or directory`);
    }
  },
};

function safeRepl() {
  if (!rl.closed) repl();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => completer(line, commands),
  terminal: true,
});

function repl() {
  rl.question("$ ", (input) => {
    input = input.replace(/\r?\n/g, "").trim();
    if (!input) return safeRepl();

    if (input.includes("|")) return handlePipeline(input, parseArgs, commands, getAbsPath, safeRepl);

    let stdoutRedirect = null;
    let stderrRedirect = null;

    const stderrAppendMatch = input.match(/2>>\s*(\S+)/);
    if (stderrAppendMatch) {
      stderrRedirect = { path: stderrAppendMatch[1], flags: "a" };
      input = input.replace(/2>>\s*\S+/, "").trim();
    }
    const stderrMatch = input.match(/2>\s*(\S+)/);
    if (stderrMatch) {
      stderrRedirect = { path: stderrMatch[1], flags: "w" };
      input = input.replace(/2>\s*\S+/, "").trim();
    }
    const stdoutAppendMatch = input.match(/1?>>\s*(\S+)/);
    if (stdoutAppendMatch) {
      stdoutRedirect = { path: stdoutAppendMatch[1], flags: "a" };
      input = input.replace(/1?>>\s*\S+/, "").trim();
    }
    const stdoutMatch = input.match(/1?>\s*(\S+)/);
    if (stdoutMatch) {
      stdoutRedirect = { path: stdoutMatch[1], flags: "w" };
      input = input.replace(/1?>\s*\S+/, "").trim();
    }

    const args = parseArgs(input);
    const command = args[0];
    if (!command) return safeRepl();

    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;

    if (commands[command]) {
      if (stdoutRedirect) {
        const outStream = fs.createWriteStream(stdoutRedirect.path, { flags: stdoutRedirect.flags });
        process.stdout.write = outStream.write.bind(outStream);
      }
      if (stderrRedirect) {
        const errStream = fs.createWriteStream(stderrRedirect.path, { flags: stderrRedirect.flags });
        process.stderr.write = errStream.write.bind(errStream);
      }
      try {
        commands[command](...args.slice(1));
      } catch (e) {
        console.error(e.message);
      }
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      return safeRepl();
    }

    const stdio = ["inherit", "inherit", "inherit"];
    const fdsToClose = [];

    if (stdoutRedirect) {
      const fd = fs.openSync(stdoutRedirect.path, stdoutRedirect.flags);
      stdio[1] = fd;
      fdsToClose.push(fd);
    }

    if (stderrRedirect) {
      const fd = fs.openSync(stderrRedirect.path, stderrRedirect.flags);
      stdio[2] = fd;
      fdsToClose.push(fd);
    }

    if (getAbsPath(command)) {
      try {
        spawnSync(command, args.slice(1), { stdio });
      } catch (e) {
        console.error(e.message);
      } finally {
        fdsToClose.forEach(fs.closeSync);
      }
    } else {
      console.error(`${command}: command not found`);
    }

    safeRepl();
  });
}

repl();
