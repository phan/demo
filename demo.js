/*eslint-env browser */
/*global ace, PHP */
/*eslint-disable no-console */
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github");
editor.session.setMode("ace/mode/php");
editor.setShowPrintMargin(false);

var default_code = "<"+"?php\n\nphpinfo();\n"

var query = new URLSearchParams(document.location.search);
if (query.has('code')) {
    editor.setValue(decodeURIComponent(query.get('code')));
} else {
    editor.setValue(default_code);
}

var run_button = document.getElementById('run');
var analyze_button = document.getElementById('analyze');
var output_area = document.getElementById('output');

var phpModule;

function doRun(code) {
    code = code + "\necho PHP_EOL;" // flush line buffer
    console.log('evaluating code', code);
    let ret = phpModule.ccall('pib_eval', 'number', ["string"], [code])
    console.log('done evaluating code', ret);
    if (ret != 0) {
        output_area.innerText += "Error, please check your code";
    }
}
function doRunWithWrapper(analysisWrapper, code) {
    // single quotes aren't escaped by encodeURIComponent, but double quotes are.
    // Other problematic characters are escaped, and this preserves UTF-8.
    var contentsFragment = 'rawurldecode("' + encodeURIComponent(code) + '")';
    var analysisCode = analysisWrapper.replace('$CONTENTS_TO_ANALYZE', contentsFragment);
    console.log(analysisCode);

    doRun(analysisCode);
}


function init() {
    // This is a monospace element without HTML.
    output_area.innerText = "Click ANALYZE";

    run_button.disabled = false
    analyze_button.disabled = false
    run_button.textContent = "Run"
    analyze_button.textContent = "Analyze"

    run_button.addEventListener('click', function () {
        output_area.innerText = '';
        var code = editor.getValue();
        var query = new URLSearchParams();
        if (code.length < 1024) {
            query.append('code', encodeURIComponent(code));
            history.replaceState({}, document.title, "?" + query.toString());
        }
        var analysisWrapper = 'try { eval($CONTENTS_TO_ANALYZE); } catch (Throwable $e) { echo "Caught " . $e; }';
        code = "?>" + code;
        doRunWithWrapper(analysisWrapper, code);
    });
    analyze_button.addEventListener('click', function () {
        output_area.innerText = '';
        var code = editor.getValue();
        var query = new URLSearchParams();
        if (code.length < 1024) {
            query.append('code', encodeURIComponent(code));
            history.replaceState({}, document.title, "?" + query.toString());
        }
        var analysisWrapper = document.getElementById('phan_runner_source').innerText;
        doRunWithWrapper(analysisWrapper, code);
    });
}

var phpModuleOptions = {
    postRun: [init],
    print: function (text) {
        console.log('print', arguments);

        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        output_area.innerText += text + "\n";
    },
    printErr: function (text) {
        console.log('printErr', arguments);

        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        output_area.innerText += text + "\n";
    }
};
phpModule = PHP(phpModuleOptions);
