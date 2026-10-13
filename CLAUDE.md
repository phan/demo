# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phan-in-Browser is a web application that runs Phan (PHP static analyzer) and PHP entirely in the browser using WebAssembly via Emscripten. It's based on the "PHP in Browser" (pib) project.

**Live demo**: https://phan.github.io/demo/

The project compiles:
- PHP 8.1-8.5 (with minimal extensions: ast, vld, bcmath, ctype, filter, json, phar, mbstring, tokenizer)
- Phan 5.5.1, 5.5.2, or v6-dev static analyzer (dynamically loaded .phar files)
- Custom C evaluation wrapper (`pib_eval.c`)

into WebAssembly that runs in modern browsers (Firefox/Chrome, requires 4GB+ RAM).

## Building From Source

### Multi-Version Build System

The project now supports building multiple PHP and Phan version combinations. Users can select their desired versions via dropdown menus in the UI.

**Supported versions:**
- PHP: branches 8.1 through 8.5, each at its latest release as resolved from php.net at build time
- Phan: 5.5.2, 6.0.8, v6-dev (dynamically loaded)
- php-ast: 1.1.2, 1.1.3 (user-selectable)

**Single source of truth:** `build-multi.sh` is the only place versions are configured. It writes `manifest.json`, and `static/demo.js` populates the version dropdowns, defaults and ast constraints from that file at page load. `index.html` contains empty `<select>` elements only.

**Note:**
- Phan .phar files are loaded dynamically at runtime (not embedded in builds)
- Phan v6-dev is built from the v6 branch using `internal/make_phar`
- PHP 8.4, 8.5, and Phan 6.x all require php-ast 1.1.3. The UI derives this from the manifest: an ast version is offered only if a build exists for the selected PHP version and it meets the selected Phan version's `minAst`.
- VLD (Vulcan Logic Dumper) extension is included for opcode visualization
- Opcache is not available (requires shared memory support not available in WebAssembly)

### Build with Docker (recommended)
```bash
docker run --rm -v $(pwd):/src emscripten/emsdk bash -c 'apt update && DEBIAN_FRONTEND=noninteractive apt install -y php-cli autoconf git composer; ./build-multi.sh'
```

### Build manually
1. Install emsdk (>= 2.0.9): https://emscripten.org/docs/getting_started/downloads.html
2. Install autoconf, git, and composer
3. Run `bash build-multi.sh`

The multi-version build process (`build-multi.sh`):
1. Resolves the latest release of each branch in `PHP_BRANCHES` from https://www.php.net/releases/active.php (falling back to `releases/index.php?json&version=X.Y` for end-of-life branches). Set `PHP_VERSIONS="8.4.26 8.5.11"` in the environment to pin exact versions.
2. Downloads the Phan releases in `PHAN_RELEASED_VERSIONS` from GitHub
3. Builds Phan v6-dev from v6 branch using `internal/make_phar`
4. For each PHP version:
   - For each compatible php-ast version (1.1.2, 1.1.3):
       - Downloads PHP source
       - Patches one condition in `main/main.c` (`patch_main_c`) so `display_errors=stderr` works for the embed SAPI
       - Downloads php-ast extension (version-specific)
       - Clones VLD extension from GitHub (latest version)
       - Configures PHP with minimal extensions + VLD using `emconfigure`
       - Compiles with `emmake` and `emcc`
       - Outputs PHP WebAssembly without embedded .phar
5. Outputs to `builds/php-{VERSION}/ast-{VERSION}/` containing:
   - `php.wasm`
   - `php.js`
   - `version.txt` (the exact PHP version; a build is redone when the resolved version differs)
6. Writes `manifest.json` with the version lists, UI defaults, available builds and phar mtimes

Phan .phar files are placed in the root directory and loaded dynamically at runtime:
   - `phan-5.5.2.phar`
   - `phan-6.0.8.phar`
   - `phan-v6-dev.phar`

**Note:** This creates 8 builds total:
- 3 PHP versions (8.1, 8.2, 8.3) × 2 ast = 6 builds
- 2 PHP versions (8.4, 8.5) × 1 ast (1.1.3 only) = 2 builds
Each build takes 5-15 minutes.

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
- `patch_main_c` in `build-multi.sh` - Edits one condition in upstream `main/main.c` so errors go to stderr for any SAPI. It fails the build if the line is not found exactly once, which signals that upstream changed and the pattern needs updating.

**Web Interface** (`index.html`):
- Ace editor for code input
- Version selectors for PHP, Phan, and php-ast versions, populated from `manifest.json`
  - php-ast options are disabled when no build exists for the selected PHP version or the selected Phan version needs a newer ast
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
- `static/demo.js` fetches `manifest.json` first, fills the dropdowns and applies its defaults, then applies `?php=`, `?phan=`, `?ast=` URL parameters if they name a listed version
- `static/demo.js` dynamically loads the correct `php.js` script based on selected PHP/ast versions
- Files are loaded from `builds/php-{VERSION}/ast-{VERSION}/` directory structure
- Phan .phar files are fetched on-demand and loaded into the virtual filesystem using `FS_createDataFile`
- Loaded .phar files are cached in memory to avoid re-fetching
- When PHP/ast versions change, the WebAssembly module is reloaded with the new binaries
- Share links and gists that name a version no longer in the manifest fall back to the current selection

### Key Files

- `build-multi.sh` - Multi-version build script and the single source of truth for versions
- `build.sh` - Legacy single-version build script (deprecated)
- `pib_eval.c` - WebAssembly entry point (exports `pib_eval()`)
- `manifest.json` - Generated by `build-multi.sh`; read by the UI (not in git)
- `index.html` - Main UI with version selectors and embedded PHP runner code
- `static/demo.js` - JavaScript handling version selection, WebAssembly loading, and dynamic .phar loading
- `static/demo.css` - Styling for UI including version selectors and dark mode
- `test.php` - Standalone test script for Phan
- `examples/` - Example PHP snippets
- `builds/` - Output directory for PHP+ast builds (not in git)
- `phan-*.phar` - Phan analyzer files loaded dynamically (not in git, generated by build)

## Testing Changes

After building, test locally by:
1. Running local web server (see "Running Locally")
2. Opening browser to http://localhost:8080/
3. Selecting different PHP, Phan, and php-ast versions from dropdowns
4. Verifying PHP 8.4, 8.5, and Phan v6-dev auto-select ast 1.1.3 and disable ast 1.1.2
5. Testing both "Analyze" (Phan) and "Run" (PHP execution) buttons
6. Verifying version switching works correctly

## Version Configuration

All versions are configured in `build-multi.sh` only. Do not edit `index.html` or `static/demo.js` for a version change.

**PHP** - `PHP_BRANCHES=("8.1" "8.2" "8.3" "8.4" "8.5")`. Each branch's latest release is resolved from php.net at build time. `DEFAULT_PHP_VERSION="8.4"` selects the UI default.

**Phan** - `PHAN_RELEASED_VERSIONS=("5.5.2" "6.0.8")`; the last entry is the UI default. `PHAN_V6_DEV_BRANCH="v6"` is built from git with `internal/make_phar`. Phan 6.x and v6-dev get `minAst: 1.1.3` in the manifest.

**php-ast** - `AST_VERSIONS=("1.1.2" "1.1.3")`; the last entry is the UI default. The build skips ast 1.1.2 for PHP 8.4 and 8.5, and the UI only offers ast versions that have a build.

**Releasing a new Phan version:** edit `PHAN_RELEASED_VERSIONS`, run `./build-multi.sh` (it only downloads the new phar and regenerates `manifest.json`), commit, and run `./deploy-to-gh-pages.sh`. The deploy script removes phars that are no longer in the manifest from gh-pages.

**Incremental builds:** `build-multi.sh` skips a build directory whose `version.txt` matches the resolved PHP version. `deploy-to-gh-pages.sh` commits `builds/`, the phars and `manifest.json` on gh-pages, which means switching back to master would delete them from the working tree; the script restores them afterwards. If `builds/` is ever lost, recover it from gh-pages instead of rebuilding: `git checkout gh-pages -- builds && git reset -q -- builds`.

**New PHP point releases** need no edit: rerunning `./build-multi.sh` resolves them and rebuilds only the directories whose `version.txt` differs.

## Publishing

Run `./publish.sh` to deploy to GitHub Pages (requires appropriate permissions).
