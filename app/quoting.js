function parseArgs(input) {
  const args = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }
    if (char === "\\") {
      const next = input[i + 1];
      if (inDoubleQuote && ['"', "\\", "$", "\n"].includes(next)) {
        current += next;
        i += 2;
        continue;
      }
      if (!inSingleQuote && !inDoubleQuote && next !== undefined) {
        current += next;
        i += 2;
        continue;
      }
      current += char;
      i++;
      continue;
    }
    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      i++;
    } else {
      current += char;
      i++;
    }
  }

  if (current.length > 0) args.push(current);
  return args;
}

module.exports = { parseArgs };
