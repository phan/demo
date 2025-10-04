# Changelog

## 2025-10-04 - Multi-Version Support Implementation

### Added
- Multi-version build system supporting 5 PHP versions (8.1, 8.2, 8.3, 8.4, 8.5 RC1)
- `build-multi.sh` - New build script for creating all PHP+ast version combinations
- PHP version selector dropdown in web UI
- Phan version selector dropdown in web UI (currently only 5.5.1 available)
- php-ast version selector dropdown in web UI (1.1.2, 1.1.3)
  - Automatic constraint enforcement: PHP 8.5 requires ast 1.1.3
  - UI disables incompatible ast versions based on PHP selection
- Dynamic WebAssembly loading based on selected PHP, Phan, and ast versions
- Version switching without page reload
- `MULTI_VERSION_README.md` - Implementation documentation
- `BUILD_TROUBLESHOOTING.md` - Build troubleshooting guide
- `CHANGELOG.md` - This file
- `MAIN_C_PATCHES.md` - Documentation of main.c patches for each PHP version

### Changed
- `index.html` - Added version selector UI elements
- `static/demo.js` - Implemented dynamic php.js loading and version switching
- `static/demo.css` - Added styling for version selectors
- `CLAUDE.md` - Updated with multi-version build instructions
- `.gitignore` - Added `builds/` and `phan-git-*/` to ignore list

### Fixed
- Build script output redirection (2025-10-04)
  - Fixed function return value contamination by redirecting informational output to stderr
  - `download_phan_release()` now correctly returns only the phar filename
  - All echo statements in build functions use `>&2` to avoid polluting return values
- Version-specific main.c files (2025-10-04)
  - Created separate main.c patches for each PHP version (8.1, 8.2, 8.3, 8.4, 8.5)
  - Build script now uses correct main-8.{VERSION}.c for each PHP version
  - Prevents build failures due to PHP API changes between versions
- PHP 8.5 ast extension compatibility (2025-10-04)
  - PHP 8.5 requires ast 1.1.3 (removed ZEND_AST_CLONE and ZEND_AST_EXIT nodes)
  - Build script now uses ast 1.1.3 for PHP 8.5, ast 1.1.2 for PHP 8.1-8.4
  - Fixes compilation errors with ast extension on PHP 8.5

### Known Issues
- Phan development versions (v5-dev, v6-dev) are currently disabled
  - Issue: `internal/package.php` creates malformed phars when building from git
  - Workaround: Use pre-built stable releases only (5.5.1)
  - Status: Under investigation

### Build Details
- PHP versions: 8.1.33, 8.2.29, 8.3.26, 8.4.13, 8.5.0RC1
- Phan version: 5.5.1 (stable)
- php-ast versions: 1.1.2, 1.1.3
- Total builds: 9 (PHP 8.1-8.4 with both ast versions + PHP 8.5 with ast 1.1.3 only)
- Estimated build time: 45-135 minutes total
- Disk space required: ~4.5-9GB

### Technical Details

#### Output Directory Structure
```
builds/
├── php-81/
│   └── phan-5.5.1/
│       ├── ast-1.1.2/
│       │   ├── php.wasm
│       │   ├── php.js
│       │   └── php.data
│       └── ast-1.1.3/
│           ├── php.wasm
│           ├── php.js
│           └── php.data
├── php-82/
│   └── phan-5.5.1/
│       ├── ast-1.1.2/
│       └── ast-1.1.3/
└── php-85/
    └── phan-5.5.1/
        └── ast-1.1.3/  (only, ast 1.1.2 incompatible)
```

#### Version Loading Flow
1. User selects PHP, Phan, or ast version from dropdowns
2. If PHP 8.5 is selected, JavaScript enforces ast 1.1.3 requirement
3. JavaScript calls `reloadPHPModule()`
4. Cleans up current WebAssembly module
5. Dynamically loads new `php.js` from `builds/php-{VERSION}/phan-{VERSION}/ast-{VERSION}/`
6. Loads corresponding `php.wasm` and `php.data`
7. Initializes new PHP module
8. Re-enables UI buttons

### Migration Notes

For users upgrading from single-version build:
- Legacy `build.sh` still works for single PHP 8.4 + Phan 5.5.1 build
- New `build-multi.sh` creates builds in `builds/` subdirectory
- No changes needed to existing deployments
- To use multi-version: rebuild with `build-multi.sh` and copy `builds/` to deployment

### Contributors
- Implementation based on original phan-demo by @TysonAndre
- Multi-version support added 2025-10-04
