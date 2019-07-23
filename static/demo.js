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
var combinedOutput = '';

function doRun(code, outputIsHTML) {
    code = code + "\necho PHP_EOL;" // flush line buffer
    console.log('evaluating code', code);
    combinedOutput = '';
    let ret = phpModule.ccall('pib_eval', 'number', ["string"], [code])
    console.log('done evaluating code', ret);
    if (ret != 0) {
        combinedOutput += "Error, please check your code";
    }
    if (outputIsHTML && ret == 0) {
        output_area.innerHTML = combinedOutput.replace(/\n/g, "");
    } else {
        output_area.innerText = combinedOutput;
    }
}
function doRunWithWrapper(analysisWrapper, code, outputIsHTML) {
    // single quotes aren't escaped by encodeURIComponent, but double quotes are.
    // Other problematic characters are escaped, and this preserves UTF-8.
    var contentsFragment = 'rawurldecode("' + encodeURIComponent(code) + '")';
    var analysisCode = analysisWrapper.replace('$CONTENTS_TO_ANALYZE', contentsFragment);
    console.log(analysisCode);

    doRun(analysisCode, outputIsHTML);
}

var didInit = false;

function init() {
    didInit = true;
    // This is a monospace element without HTML.
    output_area.innerText = "Click ANALYZE";

    run_button.textContent = "Run"
    analyze_button.textContent = "Analyze"
    run_button.disabled = false
    run_button.classList.remove('disabled')
    analyze_button.disabled = false
    analyze_button.classList.remove('disabled')

    run_button.addEventListener('click', function () {
        output_area.innerText = '';
        var code = editor.getValue();
        var query = new URLSearchParams();
        if (code.length < 1024) {
            query.append('code', encodeURIComponent(code));
            history.replaceState({}, document.title, "?" + query.toString());
        }
        var analysisWrapper = 'try { error_reporting(E_ALL); ini_set("display_errors", "stderr"); echo "Set display_errors\n"; eval($CONTENTS_TO_ANALYZE); } catch (Throwable $e) { echo "Caught " . $e; }';
        code = "?>" + code;
        doRunWithWrapper(analysisWrapper, code, false);
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
        doRunWithWrapper(analysisWrapper, code, true);
    });
}

var phpModuleOptions = {
    postRun: [init],
    print: function (text) {
        console.log('print', arguments);

        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        if (didInit) {
            combinedOutput += text + "\n";
        }
    },
    printErr: function (text) {
        console.log('printErr', arguments);

        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        if (didInit) {
            combinedOutput += text + "\n";
        }
    }
};
phpModule = PHP(phpModuleOptions);
