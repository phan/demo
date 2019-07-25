#!/usr/bin/env bash
set -xeu
if [ ! -d Zend ]; then
    echo "Must run $0 from within php-7.x directory" 1>&2
    exit 1
fi
PHAN_PATH=phan-2.2.6.phar
cp ../$PHAN_PATH .
# Check that the phar is not corrupt
php $PHAN_PATH --version || exit 1
# Ensure the allocator patches are applied.
cp ../zend_alloc.c Zend/
cp ../main.c main/

set -xeu
mkdir -p out
# NOTE: Adding debug symbols makes this take ~15GB of ram to load in a browser.
# Opening this project compiled with `-g4` in firefox may cause system performance issues or swapping.
# But this (plus assertions) can be useful for investigating crashes.
#CFLAGS=-g4
# Fast compilation
#CFLAGS='-Os'
# Fast runtime, slow compilation (pass with --llvm-lto for the final compilation)
CFLAGS='-O3'
emcc $CFLAGS -I . -I Zend -I main -I TSRM/ ../pib_eval.c -o pib_eval.o
emcc $CFLAGS \
  --llvm-lto 2 \
  -s ENVIRONMENT=web \
  -s EXPORTED_FUNCTIONS='["_pib_eval", "_php_embed_init", "_zend_eval_string", "_php_embed_shutdown", "_pib_force_exit"]' \
  -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall"]' \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="'PHP'" \
  -s TOTAL_MEMORY=134217728 \
  -s ASSERTIONS=0 \
  -s INVOKE_RUN=0 \
  -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
  --preload-file $PHAN_PATH \
  libs/libphp7.a pib_eval.o -o out/php.html

cp out/php.wasm out/php.js out/php.data ..

echo "Done"
