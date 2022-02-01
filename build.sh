#!/usr/bin/env bash

# TODO: https://emscripten.org/docs/porting/Debugging.html
set -xeu

PHP_VERSION=8.2-deque
PHP_PATH=php-$PHP_VERSION

if ! type emconfigure 2>/dev/null >/dev/null ; then
    echo "emconfigure not found. Install emconfigure and add it to your path (e.g. source emsdk/emsdk_env.sh)"
    exit 1
fi

echo "Get PHP source"
if [ ! -d $PHP_PATH ]; then
    git clone --branch=deque --depth=1 git@github.com:TysonAndre/php-src.git $PHP_PATH
fi

echo "Apply error handler patch"
cp main8.c $PHP_PATH/main/main.c

echo "Configure"

# https://emscripten.org/docs/porting/Debugging.html
# -g4 can be used to generate source maps for debugging C crashes
# NOTE: If -g4 is used, then firefox can require a lot of memory to load the resulting file.
export CFLAGS=-O3
cd $PHP_PATH
./buildconf --force
emconfigure ./configure \
  --disable-all \
  --disable-cgi \
  --disable-cli \
  --disable-fiber-asm \
  --disable-rpath \
  --disable-phpdbg \
  --with-valgrind=no \
  --without-pear \
  --without-valgrind \
  --without-pcre-jit \
  --with-layout=GNU \
  --enable-bcmath \
  --enable-ctype \
  --enable-embed=static \
  --enable-filter \
  --enable-json \
  --enable-phar \
  --enable-mbstring \
  --disable-mbregex \
  --enable-tokenizer

echo "Build"
# -j5 seems to work for parallel builds
emmake make clean
emmake make -j5
rm -rf out
mkdir -p out
emcc $CFLAGS -I . -I Zend -I main -I TSRM/ ../pib_eval.c -c -o pib_eval.o
# NOTE: If this crashes with code 16, ASSERTIONS=1 is useful
# -s IMPORTED_MEMORY=1 may help reduce memory if emscripten 3.0.10 is used?
emcc $CFLAGS \
  --llvm-lto 2 \
  -s ENVIRONMENT=web \
  -s EXPORTED_FUNCTIONS='["_pib_eval", "_php_embed_init", "_zend_eval_string", "_php_embed_shutdown"]' \
  -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall"]' \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="'PHP'" \
  -s TOTAL_MEMORY=134217728 \
  -s ASSERTIONS=0 \
  -s INVOKE_RUN=0 \
  -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
  libs/libphp.a pib_eval.o -o out/php.js

cp out/php.wasm out/php.js out/php.data ..

echo "Done"
