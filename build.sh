#!/bin/bash
set -xeu

if ! type emconfigure >/dev/null; then
    echo "Must load emconfigure (e.g. with emsdk)" 1>&2
    exit 1
fi

PHP_VERSION=7.3.7
PHAN_VERSION=2.2.6

echo "Get PHP source"
if [ ! -e php-$PHP_VERSION.tar.xz ]; then
    wget https://www.php.net/distributions/php-$PHP_VERSION.tar.xz
fi
rm -rf php-$PHP_VERSION || true
tar xf php-$PHP_VERSION.tar.xz

echo "Get Phan phar"
if [ ! -e phan-$PHAN_VERSION.phar ]; then
    wget https://github.com/phan/phan/releases/download/$PHAN_VERSION/phan.phar -O phan-$PHAN_VERSION.phar
fi

cp phan-$PHAN_VERSION.phar php-$PHP_VERSION/

echo "Apply patch"
patch -p0 -i mods.diff

echo "Configure"
cd php-$PHP_VERSION

export CFLAGS=-O2

emconfigure ./configure \
  --disable-all \
  --disable-cgi \
  --disable-cli \
  --disable-rpath \
  --disable-phpdbg \
  --without-pear \
  --without-valgrind \
  --without-pcre-jit \
  --with-layout=GNU \
  --enable-ast \
  --enable-bcmath \
  --enable-ctype \
  --enable-embed=static \
  --enable-filter \
  --enable-json \
  --enable-phar \
  --enable-tokenizer

echo "Build"
# TODO: Does -j5 work for parallel builds?
emmake make -j5
mkdir out
emcc -O3 -I . -I Zend -I main -I TSRM/ ../pib_eval.c -o pib_eval.o
emcc -O3 \
  -s WASM=1 \
  -s ENVIRONMENT=web \
  -s EXPORTED_FUNCTIONS='["_pib_eval", "_php_embed_init", "_zend_eval_string", "_php_embed_shutdown"]' \
  -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall"]' \
  -s TOTAL_MEMORY=134217728 \
  -s ASSERTIONS=0 \
  -s INVOKE_RUN=0 \
  --preload-file Zend/bench.php \
  --preload-file phan-$PHAN_VERSION.phar \
  libs/libphp7.a pib_eval.o -o out/php.html

cp out/php.wasm out/php.js out/php.data ..

echo "Done"
