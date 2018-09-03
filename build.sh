#!/bin/bash
set -xeu

if ! type emconfigure >/dev/null; then
    echo "Must load emconfigure (e.g. with emsdk)" 1>&2
    exit 1
fi

echo "Get PHP source"
if [ ! -e php-7.3.0beta3.tar.xz ]; then
    wget https://downloads.php.net/~cmb/php-7.3.0beta3.tar.xz
fi
rm -rf php-7.3.0beta3 || true
tar xf php-7.3.0beta3.tar.xz

echo "Get Phan phar"
if [ ! -e phan-1.0.1.phar ]; then
    wget https://github.com/phan/phan/releases/download/1.0.1/phan.phar -O phan-1.0.1.phar
fi

cp phan-1.0.1.phar php-7.3.0beta3/

echo "Apply patch"
patch -p0 -i mods.diff

echo "Configure"
cd php-7.3.0beta3

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
  --preload-file phan-1.0.1.phar \
  libs/libphp7.a pib_eval.o -o out/php.html

cp out/php.wasm out/php.js out/php.data ..

echo "Done"
