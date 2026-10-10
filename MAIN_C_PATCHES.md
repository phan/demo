# main.c patch

The demo needs PHP's `display_errors=stderr` to work with the embed SAPI, which
upstream `main/main.c` only allows for the cli, cgi and phpdbg SAPIs.

This used to be done by keeping a full patched copy of `main.c` per PHP minor
version (`main-8.X.c`). That silently reverted upstream changes to `main.c`
whenever the point release was bumped, so the copies were removed.

`build-multi.sh` now applies the change in place with `patch_main_c`, which
rewrites exactly one line in the freshly extracted upstream source:

```c
/* Write CLI/CGI errors to stderr if display_errors = "stderr" */
if ((!strcmp(sapi_module.name, "cli") || !strcmp(sapi_module.name, "cgi") || !strcmp(sapi_module.name, "phpdbg")) &&
    PG(display_errors) == PHP_DISPLAY_ERRORS_STDERR
) {
```

becomes

```c
/* Phan Demo patch: write errors to stderr regardless of SAPI */
if (
    PG(display_errors) == PHP_DISPLAY_ERRORS_STDERR
) {
```

The function fails the build if the line is not found exactly once. If a future
PHP release changes that line, update the `pattern` in `patch_main_c`.
