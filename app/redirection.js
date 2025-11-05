// redirection.js
const fs = require("fs");

/**
 * Handle redirection operators: >, >>, 2>, 2>>, 2>&1
 */
function applyRedirection(args) {
  let stdout = null;
  let stderr = null;
  const cleanedArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === ">>") {
      const file = args[++i];
      stdout = fs.openSync(file, "a");
    } else if (args[i] === ">") {
      const file = args[++i];
      stdout = fs.openSync(file, "w");
    } else if (args[i] === "2>>") {
      const file = args[++i];
      stderr = fs.openSync(file, "a");
    } else if (args[i] === "2>") {
      const file = args[++i];
      stderr = fs.openSync(file, "w");
    } else if (args[i] === "2>&1") {
      stderr = "stdout";
    } else {
      cleanedArgs.push(args[i]);
    }
  }

  return { cleanedArgs, stdout, stderr };
}

module.exports = { applyRedirection };
