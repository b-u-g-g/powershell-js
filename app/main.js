const readline = require("node:readline");
const fs = require("node:fs");
const { spawnSync } = require("child_process");
const path = require("node:path");

const { handlePipeline } = require("./pipeline");
const { completer } = require("./autocomplete");
const { parseArgs } = require("./quoting");
const {
  addHistory,
  listHistory,
  readHistoryFile,
  writeHistoryFile,
  appendHistoryFile,
  getPreviousCommand,
  getNextCommand,
} = require("./history");

// ================= PATH RESOLUTION =================
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

// ================= BUILTINS =================
const commands = {
  exit: (code) => {
    // save history to HISTFILE if set on exit
    if (process.env.HISTFILE) {
      try {
        writeHistoryFile(process.env.HISTFILE);
      } catch (_) {}
    }
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
    if (commands[command]) {
      console.log(`${command} is a shell builtin`);
      return;
    }
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
    dir: (...args) => {
    try {
      const dirPath = args[0] ? path.resolve(process.cwd(), args[0]) : process.cwd();
      const files = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const file of files) {
        const stats = fs.statSync(path.join(dirPath, file.name));
        const size = stats.isDirectory() ? "<DIR>" : `${stats.size} bytes`;
        console.log(`${file.isDirectory() ? "📁" : "📄"} ${file.name}  ${size}`);
      }
    } catch (err) {
      console.error(`dir: ${err.message}`);
    }
  },
cat: (...args) => {
  if (args.length === 0) {
    console.log("cat: missing file operand");
    return;
  }

  for (const file of args) {
    try {
      const content = fs.readFileSync(file, "utf8");
      process.stdout.write(content);
    } catch (err) {
      console.error(`cat: ${file}: ${err.message}`);
    }
  }
},


  //  history builtin now supports -r, -w, -a, <n>, and plain
  history: (flagOrArg, maybeFile) => {
    // history -r <file>
    if (flagOrArg === "-r" && maybeFile) {
      readHistoryFile(maybeFile);
      return;
    }

    // history -w <file>
    if (flagOrArg === "-w" && maybeFile) {
      writeHistoryFile(maybeFile);
      return;
    }

    // history -a <file>
    if (flagOrArg === "-a" && maybeFile) {
      appendHistoryFile(maybeFile);
      return;
    }

    // history <n>
    if (flagOrArg && !isNaN(parseInt(flagOrArg, 10))) {
      const n = parseInt(flagOrArg, 10);
      if (isNaN(n) || n < 0) {
        console.log("history: invalid number");
        return;
      }
      listHistory(n);
      return;
    }

    // plain history
    listHistory();
  },
};

// ================== SAFE REPL LOOP ==================
function safeRepl() {
  if (!rl.closed) repl();
}

// ================== READLINE SETUP ==================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => completer(line, commands),
  terminal: true,
});

if (process.stdin.isTTY) process.stdin.setRawMode(true);

let currentBuffer = "";

// ================== ARROW + ENTER HANDLING ==================
process.stdin.on("data", (chunk) => {
  const key = chunk.toString();

  if (key === "\u001b[A") {
    const prev = getPreviousCommand();
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write("$ " + prev);
    rl.line = prev;
    currentBuffer = prev;
  } else if (key === "\u001b[B") {
    const next = getNextCommand();
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write("$ " + next);
    rl.line = next;
    currentBuffer = next;
  } 
});

// ================== MAIN REPL ==================
function repl() {
  rl.question("$ ", (input) => {
    input = input.replace(/\r?\n/g, "").trim();
    if (!input) return safeRepl();

    addHistory(input);

    if (input.includes("|")) {
      handlePipeline(input, parseArgs, commands, getAbsPath, safeRepl);
      return;
    }

    let stdoutRedirect = null;
    let stderrRedirect = null;

    const redirs = [
      [/2>>\s*(\S+)/, (m) => (stderrRedirect = { path: m[1], flags: "a" })],
      [/2>\s*(\S+)/, (m) => (stderrRedirect = { path: m[1], flags: "w" })],
      [/1?>>\s*(\S+)/, (m) => (stdoutRedirect = { path: m[1], flags: "a" })],
      [/1?>\s*(\S+)/, (m) => (stdoutRedirect = { path: m[1], flags: "w" })],
    ];
    for (const [regex, handler] of redirs) {
      const match = input.match(regex);
      if (match) {
        handler(match);
        input = input.replace(regex, "").trim();
      }
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

// Auto-load history on startup if HISTFILE is set
if (process.env.HISTFILE) {
  try {
    readHistoryFile(process.env.HISTFILE);
  } catch (_) {}
}

repl();
