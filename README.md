

# PowerShell-JS

A lightweight Node.js-based shell that mimics basic PowerShell/Bash behavior.
Supports command execution, pipelines, redirection, and history management.



### Core Shell

* Interactive `$` prompt using `readline`
* PATH-based command resolution
* Multi-command pipelines (`|`)
* Output and error redirection (`>`, `>>`, `2>`, `2>>`)
* Environment variable support (`HISTFILE` for history persistence)

### Built-in Commands

* **exit [code]** – exits shell and writes history to file if set
* **echo [-n] [args...]** – prints arguments
* **type [command]** – identifies builtins or binaries
* **pwd** – prints current working directory
* **cd [path]** – changes directory
* **history** – lists or manages command history

  * `history <n>` – last *n* commands
  * `history -r <file>` – read from file
  * `history -w <file>` – write to file
  * `history -a <file>` – append new commands

### History Navigation

* `↑` and `↓` recall previous or next commands
* Commands executed via Enter are re-added to memory
* Auto-loads and writes history on startup/exit if `HISTFILE` is defined

---

## Example Usage

<img width="1038" height="706" alt="Screenshot 2025-11-06 000352" src="https://github.com/user-attachments/assets/d615ceaa-1717-4826-9b1f-44373987e2e6" />


---

## Limitations and Future Work

* `type` command identifies commands but cannot display file contents
  (can be improved by adding a `cat` builtin)
* Pipelines currently use synchronous execution; can be optimized using streams
* `echo` does not yet interpret escape sequences (`\n`, `\t`)
* Error handling and invalid argument feedback can be enhanced
* Command parsing is basic; future improvement could use token-based parsing

---

## File Structure

```
app/
 ├── main.js          # Shell core (REPL, builtins, I/O handling)
 ├── history.js       # History management (read, write, append)
 ├── pipeline.js      # Handles pipe-based execution
 ├── quoting.js       # Command argument parsing
 ├── autocomplete.js  # Basic tab completion
 └── redirection.js   # Handles output/error redirection




