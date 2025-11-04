const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const { executePipeline } = require("./pipeline");

let lastCompletionInput = "";
let lastCompletionTime = 0;

function longestCommonPrefix(strings) {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (prefix === "") return "";
    }
  }
  return prefix;
}

const builtins = ["echo", "exit", "type", "pwd", "cd"];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
  completer: (line) => {
    const split = line.trim().split(" ");
    if (split.length === 1) {
      const input = line.trim();
      const pathDirs = process.env.PATH.split(path.delimiter);
      const externalCommands = [];

      for (const dir of pathDirs) {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
              const stats = fs.statSync(fullPath);
              fs.accessSync(fullPath, fs.constants.X_OK);
              if (stats.isFile()) externalCommands.push(file);
            } catch (_) {}
          }
        } catch (_) {}
      }

      const allCommands = [...new Set([...builtins, ...externalCommands])];
      const hits = allCommands.filter((cmd) => cmd.startsWith(input));

      if (hits.length === 0) {
        process.stdout.write("\x07");
        return [[], line];
      }

      if (hits.length === 1) return [[hits[0] + " "], line];

      const lcp = longestCommonPrefix(hits);
      if (lcp.length > input.length) return [[lcp], line];

      const now = Date.now();
      if (lastCompletionInput === input && now - lastCompletionTime < 1000) {
        process.stdout.write("\n" + hits.sort().join("  ") + "\n");
        rl.prompt(true);
        lastCompletionInput = "";
      } else {
        process.stdout.write("\x07");
        lastCompletionInput = input;
        lastCompletionTime = now;
      }
      return [[], line];
    }
    return [[], line];
  },
});

rl.prompt();

rl.on("line", (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  // ✅ NEW: Handle pipelines like "cat file | wc"
  if (input.includes("|")) {
    const [left, right] = input.split("|").map((s) => s.trim());
    const [cmd1, ...args1] = left.split(" ");
    const [cmd2, ...args2] = right.split(" ");
executePipeline(cmd1, args1, cmd2, args2, rl, builtins);

    return;
  }

  const parts = [];
  let current = "";
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (c === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (c === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (c === "\\" && !inSingleQuotes) {
      const next = input[i + 1];
      if (inDoubleQuotes) {
        if (next === '"' || next === "\\" || next === "$" || next === "`") {
          i++;
          current += next;
        } else {
          current += "\\";
        }
      } else {
        if (next === " ") {
          i++;
          current += " ";
        } else if (next === "\\") {
          i++;
          current += "\\";
        } else if (next) {
          i++;
          current += next;
        }
      }
      continue;
    }

    if (c === " " && !inSingleQuotes && !inDoubleQuotes) {
      if (current !== "") {
        parts.push(current);
        current = "";
      }
    } else {
      current += c;
    }
  }

  if (current !== "") parts.push(current);

  let outRedirectIndex = parts.findIndex((p) => p === ">" || p === "1>");
  let appendOutIndex = parts.findIndex((p) => p === ">>" || p === "1>>");
  let errRedirectIndex = parts.findIndex((p) => p === "2>");
  let appendErrIndex = parts.findIndex((p) => p === "2>>");

  let outFile = null;
  let appendFile = null;
  let errFile = null;
  let appendErrFile = null;

  if (outRedirectIndex !== -1) {
    outFile = parts[outRedirectIndex + 1];
    parts.splice(outRedirectIndex, 2);
  }

  if (appendOutIndex !== -1) {
    appendFile = parts[appendOutIndex + 1];
    parts.splice(appendOutIndex, 2);
  }

  if (errRedirectIndex !== -1) {
    errFile = parts[errRedirectIndex + 1];
    parts.splice(errRedirectIndex, 2);
    fs.writeFileSync(errFile, "");
  }

  if (appendErrIndex !== -1) {
    appendErrFile = parts[appendErrIndex + 1];
    parts.splice(appendErrIndex, 2);
    if (!fs.existsSync(appendErrFile)) fs.writeFileSync(appendErrFile, "");
  }

  const cmd = parts[0];
  const args = parts.slice(1);

  if (cmd === "exit") {
    const code = args[0] ? parseInt(args[0]) : 0;
    rl.close();
    process.exit(code);
  } else if (cmd === "echo") {
    const output = args.join(" ") + "\n";
    if (outFile) {
      fs.writeFileSync(outFile, output);
    } else if (appendFile) {
      fs.appendFileSync(appendFile, output);
    } else {
      process.stdout.write(output);
    }
    rl.prompt();
  } else if (cmd === "pwd") {
    const output = process.cwd() + "\n";
    if (outFile) {
      fs.writeFileSync(outFile, output);
    } else if (appendFile) {
      fs.appendFileSync(appendFile, output);
    } else {
      process.stdout.write(output);
    }
    rl.prompt();
  } else if (cmd === "cd") {
    let targetDir = args[0];
    if (!targetDir) {
      rl.prompt();
      return;
    }

    if (targetDir === "~") {
      targetDir = process.env.HOME || process.env.USERPROFILE;
    }

    try {
      process.chdir(targetDir);
    } catch (err) {
      console.log(`cd: ${args[0]}: No such file or directory`);
    }

    rl.prompt();
  } else if (cmd === "type") {
    if (args.length === 0) {
      console.log("type: missing argument");
    } else {
      const target = args[0];
      if (builtins.includes(target)) {
        console.log(`${target} is a shell builtin`);
      } else {
        const pathDirs = process.env.PATH.split(path.delimiter);
        let found = false;
        for (const dir of pathDirs) {
          const fullPath = path.join(dir, target);
          try {
            const stats = fs.statSync(fullPath);
            fs.accessSync(fullPath, fs.constants.X_OK);
            if (stats.isFile()) {
              console.log(`${target} is ${fullPath}`);
              found = true;
              break;
            }
          } catch (_) {
            continue;
          }
        }
        if (!found) {
          console.log(`${target}: not found`);
        }
      }
    }
    rl.prompt();
  } else {
    let fullPath = null;
    const pathDirs = process.env.PATH.split(path.delimiter);

    for (const dir of pathDirs) {
      const potentialPath = path.join(dir, cmd);
      try {
        const stats = fs.statSync(potentialPath);
        fs.accessSync(potentialPath, fs.constants.X_OK);
        if (stats.isFile()) {
          fullPath = potentialPath;
          break;
        }
      } catch (_) {
        continue;
      }
    }

    if (!fullPath) {
      try {
        const stats = fs.statSync(cmd);
        fs.accessSync(cmd, fs.constants.X_OK);
        if (stats.isFile()) {
          fullPath = cmd;
        }
      } catch (_) {}
    }

    if (fullPath) {
      let stdio;
      if (outFile || appendFile || errFile || appendErrFile) {
        const stdoutFd = outFile
          ? fs.openSync(outFile, "w")
          : appendFile
          ? fs.openSync(appendFile, "a")
          : "inherit";
        const stderrFd = errFile
          ? fs.openSync(errFile, "w")
          : appendErrFile
          ? fs.openSync(appendErrFile, "a")
          : "inherit";
        stdio = ["inherit", stdoutFd, stderrFd];
      } else {
        stdio = "inherit";
      }

      const child = spawn(fullPath, args, { stdio, argv0: cmd });
      child.on("exit", () => rl.prompt());
    } else {
      console.log(`${cmd}: command not found`);
      rl.prompt();
    }
  }
});

rl.on("close", () => {
  console.log("\nExiting shell...");
});
