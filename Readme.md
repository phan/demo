# Phan in Browser

This is based on [oraoto/pib](https://oraoto.github.io/pib/)

[Run Phan in your browser](https://tysonandre.github.io/phan-demo/) (Requires Firefox and at least 4GB of free RAM)].

[![Preview](static/preview.png)](https://tysonandre.github.io/phan-demo/)

- This uses emscripten to allow running both Phan and regular PHP scripts entirely in your browser.

PHP Version: 7.3.7

## Examples

TODO:

## Building From Source

### Using Docker

TODO: would these instructions work for phan-demo?

The quickest way to build PIB is by using Docker:

```
docker run --rm -v $(pwd):/src trzeci/emscripten:sdk-incoming-64bit bash build.sh
```

### Setup Emscripten SDK (emsdk) manually

Steps:

1. Setup emsdk (>= 1.38.11), see [Installation Instructions](https://github.com/juj/emsdk#installation-instructions)
2. Run `bash build.sh`

## Known issues

+ Fatal errors (e.g. duplicate classes) do not get reported.

## Running locally

This requires that a web server be running and serve static files.
`python 3 -m http.server --bind 127.0.0.1 8080` is one way to do this.

Then, copy `test.php` to run Phan on an example file.
This will be tidied up once this works reliably.

## Acknowledgements

This application is based on [PHP in Browser (oraoto/pib)](https://github.com/oraoto/pib).

The Web UI is based on [Rust Playground](https://play.rust-lang.org/).
