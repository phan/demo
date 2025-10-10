# Multi-Version Support Implementation

This document describes the multi-version support system added to phan-demo.

## Overview

The phan-demo system has been enhanced to support multiple PHP and Phan version combinations that users can select via dropdown menus in the web UI.

## Supported Versions

### PHP Versions
- 8.1.31
- 8.2.27
- 8.3.16
- 8.4.2
- 8.5.0RC2

### Phan Versions
- 5.5.1 (latest stable release)

**Note:** Development versions (v5-dev, v6-dev) are currently disabled due to complexity in building phars from git. These may be added in a future update once the phar build process is properly debugged.

## Changes Made

### 1. Build System (`build-multi.sh`)

New multi-version build script that:
- Downloads Phan 5.5.1 release
- Builds each PHP version (8.1, 8.2, 8.3, 8.4, 8.5 RC2) with Phan 5.5.1
- Outputs to `builds/php-{VERSION}/phan-{VERSION}/` directory structure
- Handles special cases like PHP RC versions from maintainer directories
- Total of 5 builds (5 PHP versions × 1 Phan version)

### 2. Web UI (`index.html`)

- Added version selector dropdowns for PHP and Phan
- Updated to dynamically reference Phan phar path with `$PHAN_PHAR_PATH` placeholder
- Removed static `php.js` script tag (now loaded dynamically)
- Added CSS styling for version selectors

### 3. JavaScript (`static/demo.js`)

- Dynamic loading of `php.js` from version-specific paths
- `loadPHPScript()` function to load correct php.js for selected version
- `reloadPHPModule()` function to switch versions on-the-fly
- Event listeners for version selector changes
- Path resolution via `getVersionPath()` function

### 4. CSS (`static/demo.css`)

Added styling for:
- `.version-selectors` - Container for version dropdowns
- `.selector-wrapper` - Individual selector styling
- Labels and select elements with proper spacing and styling

### 5. Documentation

- Updated `CLAUDE.md` with multi-version build instructions
- Added version configuration documentation
- Updated architecture section to describe dynamic loading

### 6. Git Configuration (`.gitignore`)

Added entries to ignore:
- `builds/` directory
- `phan-git-*/` directories
- `php-7.*` sources

## How It Works

1. **Build Time**: `build-multi.sh` creates all version combinations in `builds/` directory
2. **Load Time**: JavaScript dynamically loads `php.js` from default version path (`builds/php-84/phan-5.5.1/`)
3. **Runtime**: User selects different versions via dropdowns
4. **Version Switch**: JavaScript reloads PHP module with new version's binaries

## File Structure

```
phan-demo/
├── build-multi.sh              # Multi-version build script
├── build.sh                    # Legacy single-version build
├── builds/                     # Build output (gitignored)
│   ├── php-81/
│   │   ├── phan-5.5.1/
│   │   │   ├── php.wasm
│   │   │   ├── php.js
│   │   │   └── php.data
│   │   ├── phan-v5-dev/
│   │   └── phan-v6-dev/
│   ├── php-82/
│   │   └── ...
│   └── ...
├── index.html                  # Main UI with version selectors
├── static/
│   ├── demo.js                 # Version switching logic
│   └── demo.css                # Version selector styling
└── CLAUDE.md                   # Updated documentation
```

## Building

### Build All Versions
```bash
docker run --rm -v $(pwd):/src emscripten/emsdk bash -c 'apt update && DEBIAN_FRONTEND=noninteractive apt install -y php-cli autoconf git composer; ./build-multi.sh'
```

### Build Single Version (Legacy)
```bash
docker run --rm -v $(pwd):/src emscripten/emsdk bash -c 'apt update && DEBIAN_FRONTEND=noninteractive apt install -y php-cli autoconf; ./build.sh'
```

## Testing

1. Build the desired versions
2. Start local web server: `python3 -m http.server --bind 127.0.0.1 8080`
3. Open http://localhost:8080/
4. Use version selectors to switch between PHP and Phan versions
5. Test both "Analyze" and "Run" buttons with different version combinations

## Adding New Versions

### Add a PHP Version

1. Update `build-multi.sh`:
   ```bash
   PHP_VERSIONS=("8.1.31" "8.2.27" "8.3.16" "8.4.2" "8.5.0RC2" "8.6.0beta1")
   ```

2. Update `index.html`:
   ```html
   <select id="php-version">
       ...
       <option value="86">8.6 beta1</option>
   </select>
   ```

### Add a Phan Version

1. Update `build-multi.sh` with new version variable
2. Add build call in main loop
3. Update `index.html` dropdown

## Performance Considerations

- Each build takes significant time (5-15 minutes per combination)
- Total build time: ~2-4 hours for all 15 combinations
- Disk space: ~500MB-1GB per build = 7.5-15GB total
- Browser loading: First load downloads selected version's WASM (~20-30MB)
- Version switching: Downloads new WASM files when switching versions

## Backward Compatibility

- Original `build.sh` still works for single-version builds
- Outputs to project root (legacy behavior)
- No breaking changes to existing deployments
