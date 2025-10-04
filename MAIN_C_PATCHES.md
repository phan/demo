# main.c Patches for Phan-in-Browser

This document describes the patches applied to PHP's `main/main.c` file for each PHP version.

## Purpose

The phan-demo uses PHP's embed SAPI to run PHP code in WebAssembly. By default, PHP's embed SAPI doesn't write errors to stderr when `display_errors = "stderr"` is set. The patch removes the SAPI name check to allow stderr output regardless of SAPI.

## Patch Details

### Single Modification

The patch modifies the error display logic in the `php_error_cb` function:

**Original code:**
```c
/* Write CLI/CGI errors to stderr if display_errors = "stderr" */
if ((!strcmp(sapi_module.name, "cli") || !strcmp(sapi_module.name, "cgi") || !strcmp(sapi_module.name, "phpdbg")) &&
    PG(display_errors) == PHP_DISPLAY_ERRORS_STDERR
) {
    fprintf(stderr, "%s: ", error_type_str);
    // ... error output ...
}
```

**Patched code:**
```c
/* Write errors to stderr if display_errors = "stderr" regardless of sapi (Phan Demo patch for "embed" sapi) */
if (
    PG(display_errors) == PHP_DISPLAY_ERRORS_STDERR
) {
    fprintf(stderr, "%s: ", error_type_str);
    // ... error output ...
}
```

### Changes Made

1. Removed SAPI name checks: `!strcmp(sapi_module.name, "cli")`, etc.
2. Updated comment to reflect the change
3. This allows the "embed" SAPI (used by WebAssembly) to write errors to stderr

## Version-Specific Files

### PHP 8.1 (`main-8.1.c`)
- Source: PHP 8.1 branch from php-src
- Patch line: ~1345
- Additional notes: PHP 8.1 had some ini handler simplifications already applied

### PHP 8.2 (`main-8.2.c`)
- Source: PHP 8.2 branch from php-src
- Patch line: ~1359
- Additional notes: Similar structure to 8.1

### PHP 8.3 (`main-8.3.c`)
- Source: PHP 8.3 branch from php-src
- Patch line: ~1370
- Additional notes: Uses `fwrite()` for message output (slightly different from other versions)

### PHP 8.4 (`main-8.4.c`)
- Source: PHP 8.4 branch from php-src
- Patch line: ~1411
- Additional notes: This was the original version used

### PHP 8.5 (`main-8.5.c`)
- Source: PHP 8.5 branch from php-src
- Patch line: ~1482
- Additional notes: Latest development version

## Why Version-Specific Files?

PHP's internal API changes between versions. While the patch is conceptually the same, the exact line numbers and surrounding code differ. Using version-specific files ensures:

1. **Compatibility**: Each PHP version gets the correct patch
2. **Maintainability**: Easy to update patches when PHP versions change
3. **Reliability**: No risk of applying patches to wrong line numbers

## Generating Patches

If you need to update or regenerate these patches:

1. Checkout the desired PHP version branch in php-src:
   ```bash
   cd ~/php-src
   git checkout PHP-8.X
   ```

2. Copy the original main.c:
   ```bash
   cp main/main.c /path/to/phan-demo/main-8.X.c
   ```

3. Apply the patch:
   ```bash
   cd /path/to/phan-demo
   # Update comment
   sed -i 's|Write CLI/CGI errors to stderr|Write errors to stderr if display_errors = "stderr" regardless of sapi (Phan Demo patch for "embed" sapi)|' main-8.X.c

   # Remove SAPI check
   line=$(grep -n 'if ((!strcmp(sapi_module.name, "cli")' main-8.X.c | cut -d: -f1)
   sed -i "${line}s|.*if ((!strcmp.*|\t\t\t\t\tif (|" main-8.X.c
   ```

4. Verify the patch:
   ```bash
   # Check the patched section
   sed -n "$((line-1)),$((line+6))p" main-8.X.c
   ```

## Testing

After applying patches, verify by:

1. Building the specific PHP version
2. Running sample code with intentional errors
3. Confirming errors appear in stderr output
4. Testing with `display_errors = "stderr"` in pib_eval.c

## Future Considerations

### PHP 8.6+
When new PHP versions are released:
1. Create new main-8.X.c file using the process above
2. Add version to `PHP_VERSIONS` array in `build-multi.sh`
3. Update `index.html` dropdown with new version
4. Update documentation

### Alternative Approaches

Instead of patching main.c, alternatives could include:
- Setting `display_errors = 1` and capturing output differently
- Modifying pib_eval.c to redirect output streams
- Using a custom error handler in PHP code

However, the main.c patch is the cleanest solution as it allows proper stderr output at the PHP level.
