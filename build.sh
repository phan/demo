#!/usr/bin/env bash

# TODO: https://emscripten.org/docs/porting/Debugging.html
set -xeu

PHP_VERSION=7.4.0RC5
PHP_PATH=php-$PHP_VERSION
AST_PATH=ast-1.0.3
PHAN_VERSION=2.4.1
PHAN_PATH=phan-$PHAN_VERSION.phar

echo "Get PHP source"
if [ ! -d $PHP_PATH ]; then
    if [ ! -e $PHP_PATH.tar.xz ]; then
        wget https://www.php.net/distributions/$PHP_PATH.tar.xz
    fi
    tar xf $PHP_PATH.tar.xz
fi

echo "Apply error handler patch"
cp main.c $PHP_PATH/main/

echo "Get Phan phar"

if [ ! -e $PHAN_PATH ]; then
    wget https://github.com/phan/phan/releases/download/$PHAN_VERSION/phan.phar -O $PHAN_PATH
fi
if [ ! -d "$PHP_PATH/ext/ast"  ]; then
    if [ ! -f "$AST_PATH.tgz" ]; then
        wget https://pecl.php.net/get/$AST_PATH.tgz -O $AST_PATH.tgz
    fi
    tar zxf $AST_PATH.tgz
    mv "$AST_PATH" "$PHP_PATH/ext/ast"
fi

# Check that the phar is not corrupt
php $PHAN_PATH --version || exit 1

cp $PHAN_PATH $PHP_PATH/

echo "Configure"

# https://emscripten.org/docs/porting/Debugging.html
# -g4 can be used to generate source maps for debugging C crashes
# NOTE: If -g4 is used, then firefox can require a lot of memory to load the resulting file.
export CFLAGS=-O3
cd $PHP_PATH
# Configure this with a minimal set of extensions, statically compiling the third-party ast library.
# Run buildconf so that ast will a valid configure option
./buildconf --force
emconfigure ./configure \
  --disable-all \
  --disable-cgi \
  --disable-cli \
  --disable-rpath \
  --disable-phpdbg \
  --with-valgrind=no \
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
  --enable-mbstring \
  --disable-mbregex \
  --enable-tokenizer

echo "Build"
# -j5 seems to work for parallel builds
emmake make clean
emmake make -j5
mkdir -p out
emcc $CFLAGS -I . -I Zend -I main -I TSRM/ ../pib_eval.c -c -o pib_eval.o
# NOTE: If this crashes with code 16, ASSERTIONS=1 is useful
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
  --preload-file $PHAN_PATH \
  libs/libphp7.a pib_eval.o -o out/php.html

cp out/php.wasm out/php.js out/php.data ..

echo "Done"
