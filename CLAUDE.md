# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phan-in-Browser is a web application that runs Phan (PHP static analyzer) and PHP entirely in the browser using WebAssembly via Emscripten. It's based on the "PHP in Browser" (pib) project.

**Live demo**: https://phan.github.io/demo/

The project compiles:
- PHP 8.4.11 (with minimal extensions: ast, bcmath, ctype, filter, json, phar, mbstring, tokenizer)
- Phan 5.5.1 or 5.5.2 static analyzer (as a .phar file)
- Custom C evaluation wrapper (`pib_eval.c`)

into WebAssembly that runs in modern browsers (Firefox/Chrome, requires 4GB+ RAM).

## Building From Source

### Multi-Version Build System

The project now supports building multiple PHP and Phan version combinations. Users can select their desired versions via dropdown menus in the UI.

**Supported versions:**
- PHP: 8.1, 8.2, 8.3, 8.4, 8.5 RC1
- Phan: 5.5.1, 5.5.2 (user-selectable)
- php-ast: 1.1.2, 1.1.3 (user-selectable)

**Note:**
- Development Phan versions from git are not currently available due to phar build complexity.
- PHP 8.5 requires php-ast 1.1.3 (ast 1.1.2 is incompatible and will be disabled automatically)

### Build with Docker (recommended)
```bash
docker run --rm -v $(pwd):/src emscripten/emsdk bash -c 'apt update && DEBIAN_FRONTEND=noninteractive apt install -y php-cli autoconf git composer; ./build-multi.sh'
```

### Build manually
1. Install emsdk (>= 2.0.9): https://emscripten.org/docs/getting_started/downloads.html
2. Install autoconf, git, and composer
3. Run `bash build-multi.sh`

The multi-version build process (`build-multi.sh`):
1. Downloads Phan 5.5.1 and 5.5.2 from GitHub releases
2. For each PHP version (8.1, 8.2, 8.3, 8.4, 8.5 RC1):
   - For each compatible php-ast version (1.1.2, 1.1.3):
     - For each Phan version (5.5.1, 5.5.2):
       - Downloads PHP source
       - Applies version-specific error handler patch (`main-8.{1,2,3,4,5}.c`)
       - Downloads php-ast extension (version-specific)
       - Configures PHP with minimal extensions using `emconfigure`
       - Compiles with `emmake` and `emcc`
       - Bundles with the selected Phan version
3. Outputs to `builds/php-{VERSION}/phan-{VERSION}/ast-{VERSION}/` containing:
   - `php.wasm`
   - `php.js`
   - `php.data`

**Note:** Building all combinations creates 18 builds (4 PHP × 2 ast × 2 Phan + 1 PHP 8.5 × 1 ast × 2 Phan). Each build can take 5-15 minutes.

### Building Single Versions (Legacy)

The original `build.sh` still exists for building a single PHP 8.4 + Phan 5.5.2 combination:
```bash
docker run --rm -v $(pwd):/src emscripten/emsdk bash -c 'apt update && DEBIAN_FRONTEND=noninteractive apt install -y php-cli autoconf; ./build.sh'
```

## Running Locally

Start a local web server from the project root:
```bash
python3 -m http.server --bind 127.0.0.1 8080
```
Then open http://localhost:8080/

## Architecture

### Core Components

**C Layer**:
- `pib_eval.c` - Main WebAssembly interface exposing `pib_eval()` function that initializes PHP embed SAPI and evaluates code
- `main-8.{1,2,3,4,5}.c` - Version-specific patched PHP main.c files with custom error handling
  - Patch removes SAPI check for stderr output (allows embed SAPI to write to stderr)
  - Each version corresponds to its PHP version (main-8.1.c for PHP 8.1, etc.)

**Web Interface** (`index.html`):
- Ace editor for code input
- Version selectors for PHP, Phan, and php-ast versions
  - php-ast version selector enforces constraints (PHP 8.5 requires ast 1.1.3)
- Two execution modes:
  1. **Analyze button** - Runs Phan static analyzer on the code
  2. **Run button** - Executes PHP code directly
- JavaScript (`static/demo.js`) handles UI, version switching, and calls WebAssembly functions

**PHP Runner** (embedded in `index.html`):
- `#phan_runner_source` textarea contains PHP code that:
  - Loads phan phar (path dynamically replaced based on selected version)
  - Configures Phan with level-2 plugins (AlwaysReturnPlugin, DuplicateArrayKeyPlugin, etc.)
  - Outputs results in HTML format
- `#eval_wrapper_source` textarea contains wrapper for direct PHP execution with error handling

**Dynamic Version Loading**:
- `static/demo.js` dynamically loads the correct `php.js` script based on selected PHP/Phan/ast versions
- Files are loaded from `builds/php-{VERSION}/phan-{VERSION}/ast-{VERSION}/` directory structure
- When versions change, the WebAssembly module is reloaded with the new binaries
- Automatic constraint enforcement: selecting PHP 8.5 automatically requires ast 1.1.3

### Key Files

- `build-multi.sh` - Multi-version build script (builds all PHP and Phan versions)
- `build.sh` - Legacy single-version build script (PHP 8.4 + Phan 5.5.2)
- `pib_eval.c` - WebAssembly entry point (exports `pib_eval()`)
- `main-8.{1,2,3,4,5}.c` - Version-specific modified PHP main.c files with custom error handling
- `index.html` - Main UI with version selectors and embedded PHP runner code
- `static/demo.js` - JavaScript handling version selection and WebAssembly loading
- `static/demo.css` - Styling for UI including version selectors
- `test.php` - Standalone test script for Phan
- `examples/` - Example PHP snippets
- `builds/` - Output directory for multi-version builds (not in git)

## Testing Changes

After building, test locally by:
1. Running local web server (see "Running Locally")
2. Opening browser to http://localhost:8080/
3. Selecting different PHP, Phan, and php-ast versions from dropdowns
4. Verifying PHP 8.5 auto-selects ast 1.1.3 and disables ast 1.1.2
5. Testing both "Analyze" (Phan) and "Run" (PHP execution) buttons
6. Verifying version switching works correctly

## Version Configuration

**PHP versions** are configured in `build-multi.sh`:
- Array: `PHP_VERSIONS=("8.1.33" "8.2.29" "8.3.26" "8.4.13" "8.5.0RC1")`
- Also update dropdown in `index.html` `<select id="php-version">`

**Phan versions** are configured in `build-multi.sh`:
- Array: `PHAN_RELEASED_VERSIONS=("5.5.1" "5.5.2")`
- Also update dropdown in `index.html` `<select id="phan-version">`
- Dev versions from git are currently disabled

**php-ast versions** are configured in `build-multi.sh`:
- Array: `AST_VERSIONS=("1.1.2" "1.1.3")`
- Also update dropdown in `index.html` `<select id="ast-version">`
- Build script automatically skips incompatible combinations (PHP 8.5 + ast 1.1.2)
- UI automatically enforces constraints when user selects PHP 8.5

## Publishing

Run `./publish.sh` to deploy to GitHub Pages (requires appropriate permissions).
