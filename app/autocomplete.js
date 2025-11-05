const fs = require("fs");
const path = require("path");

function completer(line, commands) {
  const lastSpaceIndex = line.lastIndexOf(" ");
  if (lastSpaceIndex !== -1 && line.substring(0, lastSpaceIndex).trim()) {
    return [[], line];
  }

  const wordToComplete = line.substring(lastSpaceIndex + 1);
  const allCommands = new Set(Object.keys(commands));

  if (process.env.PATH) {
    process.env.PATH.split(":").forEach((dir) => {
      try {
        if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
          fs.readdirSync(dir).forEach((file) => allCommands.add(file));
        }
      } catch (_) {}
    });
  }

  const hits = Array.from(allCommands)
    .filter((c) => c.startsWith(wordToComplete))
    .sort();

  if (hits.length === 0) {
    process.stdout.write("\x07");
    return [[], wordToComplete];
  }

  if (hits.length === 1) return [[hits[0] + " "], wordToComplete];

  const commonPrefix = hits.reduce((prefix, cmd) => {
    let i = 0;
    while (i < prefix.length && i < cmd.length && prefix[i] === cmd[i]) i++;
    return prefix.slice(0, i);
  });

  if (commonPrefix.length > wordToComplete.length) {
    return [[commonPrefix], wordToComplete];
  }

  process.stdout.write("\x07\n" + hits.join("  ") + "\n");
  process.stdout.write(`$ ${line}`);
  return [[], wordToComplete];
}

module.exports = { completer };
