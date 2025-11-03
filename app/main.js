const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

const builtins = ["echo", "exit", "type", "pwd", "cd"];

rl.prompt();

rl.on("line", (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
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

  const cmd = parts[0];
  const args = parts.slice(1);

  if (cmd === "exit") {
    const code = args[0] ? parseInt(args[0]) : 0;
    rl.close();
    process.exit(code);
  } else if (cmd === "echo") {
    console.log(args.join(" "));
    rl.prompt();
  } else if (cmd === "pwd") {
    console.log(process.cwd());
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
      const child = spawn(fullPath, args, { stdio: "inherit", argv0: cmd });
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
