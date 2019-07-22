
if [ ! -d Zend ]; then
    echo "Must run $0 from within php-7.x directory" 1>&2
    exit 1
fi
PHAN_PATH=phan-2.2.6.phar
# Check that the phar is not corrupt
php $PHAN_PATH --version || exit 1
# Ensure the allocator patches are applied.
cp ../zend_alloc.c Zend/

set -xeu
mkdir -p out
#CFLAGS=-g4
CFLAGS=-O3
emcc $CFLAGS -I . -I Zend -I main -I TSRM/ ../pib_eval.c -o pib_eval.o
# TODO disable assertions
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
