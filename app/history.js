const fs = require("fs");

let commandHistory = [];
let historyIndex = -1;
let lastWrittenIndex = 0; // ✅ Track last command index written with -a

// Add command to history
function addHistory(command) {
  if (command && command.trim().length > 0) {
    commandHistory.push(command.trim());
    historyIndex = commandHistory.length;
  }
}

// List all or last n commands
function listHistory(limit) {
  const n = limit ? parseInt(limit, 10) : null;
  const start = n && !isNaN(n) && n > 0 ? Math.max(commandHistory.length - n, 0) : 0;
  let output = "";
  for (let i = start; i < commandHistory.length; i++) {
    const idx = (i + 1).toString().padStart(4, " ");
    output += `${idx}  ${commandHistory[i]}\n`;
  }
  process.stdout.write(output.trimEnd() + "\n");
}

// Read history file for `history -r <file>`
function readHistoryFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        commandHistory.push(trimmed);
      }
    }
    historyIndex = commandHistory.length;
    lastWrittenIndex = commandHistory.length; // after reading, everything is up-to-date
  } catch (error) {
    console.log(`history: ${error.message}`);
  }
}

// Write full history to file for `history -w <file>`
function writeHistoryFile(filePath) {
  try {
    const data = commandHistory.join("\n") + "\n";
    fs.writeFileSync(filePath, data, "utf8");
    lastWrittenIndex = commandHistory.length; // all written
  } catch (error) {
    console.log(`history: ${error.message}`);
  }
}

// ✅ Append new commands to file for `history -a <file>`
function appendHistoryFile(filePath) {
  try {
    if (lastWrittenIndex >= commandHistory.length) return; // nothing new

    const newCommands = commandHistory.slice(lastWrittenIndex);
    const data = newCommands.join("\n") + "\n";
    fs.appendFileSync(filePath, data, "utf8");
    lastWrittenIndex = commandHistory.length; // mark up-to-date
  } catch (error) {
    console.log(`history: ${error.message}`);
  }
}

// Recall previous / next command
function getPreviousCommand() {
  if (commandHistory.length === 0) return "";
  if (historyIndex > 0) historyIndex--;
  return commandHistory[historyIndex] || "";
}

function getNextCommand() {
  if (commandHistory.length === 0) return "";
  if (historyIndex < commandHistory.length - 1) {
    historyIndex++;
    return commandHistory[historyIndex];
  } else {
    historyIndex = commandHistory.length;
    return "";
  }
}

module.exports = {
  addHistory,
  listHistory,
  readHistoryFile,
  writeHistoryFile,
  appendHistoryFile,
  getPreviousCommand,
  getNextCommand,
};
