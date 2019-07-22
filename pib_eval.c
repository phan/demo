#include "sapi/embed/php_embed.h"
#include "Zend/zend_exceptions.h"
#include <emscripten.h>
#include <stdlib.h>

static bool did_register_file_handles = false;

// Source: php-src/sapi/php_cli.c
static void pib_cli_register_file_handles(void) /* {{{ */
{
    php_stream /* *s_in, */ *s_out, *s_err;
    php_stream_context /* *sc_in=NULL, */ *sc_out=NULL, *sc_err=NULL;
    zend_constant /* ic, */ oc, ec;

    // s_in  = php_stream_open_wrapper_ex("php://stdin",  "rb", 0, NULL, sc_in);
    s_out = php_stream_open_wrapper_ex("php://stdout", "wb", 0, NULL, sc_out);
    s_err = php_stream_open_wrapper_ex("php://stderr", "wb", 0, NULL, sc_err);

    if (/* s_in == NULL || */ s_out==NULL || s_err==NULL) {
        // if (s_in) php_stream_close(s_in);
        if (s_out) php_stream_close(s_out);
        if (s_err) php_stream_close(s_err);
        return;
    }

    // TODO: Support s_in
    // s_in_process = s_in;

    // TODO: Set up an empty stream instead for STDIN
    // php_stream_to_zval(s_in,  &ic.value);
    php_stream_to_zval(s_out, &oc.value);
    php_stream_to_zval(s_err, &ec.value);

    /*
    ZEND_CONSTANT_SET_FLAGS(&ic, CONST_CS, 0);
    ic.name = zend_string_init_interned("STDIN", sizeof("STDIN")-1, 0);
    zend_register_constant(&ic);
    */

    ZEND_CONSTANT_SET_FLAGS(&oc, CONST_CS, 0);
    oc.name = zend_string_init_interned("STDOUT", sizeof("STDOUT")-1, 0);
    zend_register_constant(&oc);

    ZEND_CONSTANT_SET_FLAGS(&ec, CONST_CS, 0);
    ec.name = zend_string_init_interned("STDERR", sizeof("STDERR")-1, 0);
    zend_register_constant(&ec);
}
/* }}} */

// Based on void zend_exception_error
static void pib_report_exception(zend_object *ex) {
    printf("exception=%llx\n", (long long)ex);
    zval exception;

    ZVAL_OBJ(&exception, ex);
    zend_class_entry *ce_exception = Z_OBJCE(exception);
    if (ce_exception) {
        printf("Uncaught throwable '%s'\n", ZSTR_VAL(ce_exception->name));
    }
    // TODO: Cast to string and report it.
}

// Based on code by https://github.com/oraoto/pib with modifications.
int EMSCRIPTEN_KEEPALIVE pib_eval(char *code) {
    int ret = 0;
    putenv("USE_ZEND_ALLOC=0");
    php_embed_init(0, NULL);
    pib_cli_register_file_handles();
    zend_first_try {
        ret = zend_eval_string(code, NULL, "PIB");

        // If there was an uncaught error/exception, then report it.
        zend_object *ex = EG(exception);
        if (ex != NULL) {
            pib_report_exception(ex);
        }
    } zend_catch {
		printf("In zend_catch\n");
        zend_object *ex = EG(exception);
        if (ex != NULL) {
            pib_report_exception(ex);
        }
        ret = EG(exit_status);
    } zend_end_try();
    php_embed_shutdown();
    return ret;
}
