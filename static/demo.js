/*eslint-env browser */
/*global ace, PHP */
/*eslint-disable no-console */
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github");
editor.session.setMode("ace/mode/php");
editor.setShowPrintMargin(false);

var default_code = "<?php\n" + document.getElementById('features_example').innerText;

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
var combinedHTMLOutput = '';

function getOrDefault(value, defaultValue) {
    return value !== '' ? value : defaultValue;
}

function doRun(code, outputIsHTML, defaultText) {
    output_area.innerHTML = '';
    code = code + "\necho PHP_EOL;" // flush line buffer
    console.log('evaluating code', code);
    let invokePHP = function () {
        combinedOutput = '';
        combinedHTMLOutput = '';
        let ret = phpModule.ccall('pib_eval', 'number', ["string"], [code])
        console.log('done evaluating code', ret);
        if (ret != 0) {
            combinedOutput += "Error, please check your code";
            combinedHTMLOutput += "Error, please check your code";
        }
        if (outputIsHTML && ret == 0) {
            output_area.innerHTML = getOrDefault(combinedHTMLOutput.replace(/\n/g, ""), defaultText);
        } else {
            output_area.innerText = getOrDefault(combinedOutput, defaultText);
        }
        enableButtons();
    };
    // This works around an issue seen in firefox where
    // the browser's appearance won't update because JS(emscripten) is still running.
    // This tries to ensure that buttons get hidden properly and output gets cleared.
    requestAnimationFrame(function () {
        setTimeout(invokePHP, 0);
    });
}
function doRunWithWrapper(analysisWrapper, code, outputIsHTML, defaultText) {
    // single quotes aren't escaped by encodeURIComponent, but double quotes are.
    // Other problematic characters are escaped, and this preserves UTF-8.
    var contentsFragment = 'rawurldecode("' + encodeURIComponent(code) + '")';
    var analysisCode = analysisWrapper.replace('$CONTENTS_TO_ANALYZE', contentsFragment);
    console.log(analysisCode);

    doRun(analysisCode, outputIsHTML, defaultText);
}

var didInit = false;

var buttons = [run_button, analyze_button];

function enableButtons() {
    run_button.textContent = "Run"
    analyze_button.textContent = "Analyze"
    for (var button of buttons) {
        button.disabled = false
        button.classList.remove('disabled')
    }
}

function disableButtons() {
    for (var button of buttons) {
        button.disabled = true
        button.classList.add('disabled')
    }
}

function init() {
    didInit = true;
    // This is a monospace element without HTML.
    output_area.innerText = "Click ANALYZE";
    enableButtons();

    run_button.addEventListener('click', function () {
        output_area.innerText = '';
        run_button.textContent = "Running"
        disableButtons();
        var code = editor.getValue();
        var query = new URLSearchParams();
        if (code.length < 1024) {
            query.append('code', encodeURIComponent(code));
            history.replaceState({}, document.title, "?" + query.toString());
        }
        // TODO: Figure out why we need an error handler for this to work.
        var analysisWrapper = document.getElementById('eval_wrapper_source').innerText;
        code = "?>" + code;
        doRunWithWrapper(analysisWrapper, code, false, 'PHP code ran without any output');
    });
    analyze_button.addEventListener('click', function () {
        output_area.innerText = '';
        analyze_button.textContent = "Analyzing"
        disableButtons();
        var code = editor.getValue();
        var query = new URLSearchParams();
        if (code.length < 1024) {
            query.append('code', encodeURIComponent(code));
            history.replaceState({}, document.title, "?" + query.toString());
        }
        var analysisWrapper = document.getElementById('phan_runner_source').innerText;
        doRunWithWrapper(analysisWrapper, code, true, 'Phan did not detect any errors');
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
            combinedHTMLOutput += text + "\n";
        }
    },
    printErr: function (text) {
        console.log('printErr', arguments);

        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        if (didInit) {
            combinedHTMLOutput += '<span class="stderr">' + text + "</span>\n";
            combinedOutput += text + "\n";
        }
    }
};
phpModule = PHP(phpModuleOptions);
