/*eslint-env browser */
/*global ace, PHP */
/*eslint-disable no-console */
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github");
editor.session.setMode("ace/mode/php");
editor.setShowPrintMargin(false);

var default_code = "<?php\n" + document.getElementById('features_example').innerText;

var query = new URLSearchParams(document.location.search);
var run_button = document.getElementById('run');
var analyze_button = document.getElementById('analyze');
var output_area = document.getElementById('output');
var isUsable = false;

var initial_code = query.has('code') ? query.get('code') : '';
if (query.has('code') && initial_code != default_code) {
    editor.setValue(initial_code);
} else {
    editor.setValue(default_code);
    // Pre-render the output of the demo to show the types of issues Phan is capable of detecting.
    output_area.innerHTML =
        '<p><span class="phan_file">input</span>:<span class="phan_line">2</span>: <span class="phan_issuetype_normal">PhanUnreferencedFunction</span> Possibly zero references to function <span class="phan_function">\\demo()</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">6</span>: <span class="phan_issuetype_critical">PhanUndeclaredClassMethod</span> Call to method <span class="phan_method">__construct</span> from undeclared class <span class="phan_class">\\my_class</span> (<span class="phan_suggestion">Did you mean class \\MyClass</span>)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">9</span>: <span class="phan_issuetype_normal">PhanTypeMismatchReturn</span> Returning type <span class="phan_type">\'fail\'</span> but <span class="phan_functionlike">demo()</span> is declared to return <span class="phan_type">?int</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">10</span>: <span class="phan_issuetype_normal">PhanTypeMismatchArgumentInternal</span> Argument <span class="phan_index">1</span> (<span class="phan_parameter">$obj</span>) is <span class="phan_type">bool</span> but <span class="phan_functionlike">\\SplObjectStorage::attach()</span> takes <span class="phan_type">object</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">11</span>: <span class="phan_issuetype_critical">PhanUndeclaredMethod</span> Call to undeclared method <span class="phan_method">\\SplObjectStorage::atach</span> (<span class="phan_suggestion">Did you mean expr-&gt;attach()</span>)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">12</span>: <span class="phan_issuetype">PhanParamTooManyInternal</span> Call with <span class="phan_count">3</span> arg(s) to <span class="phan_functionlike">\\SplObjectStorage::attach()</span> which only takes <span class="phan_count">2</span> arg(s)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">13</span>: <span class="phan_issuetype_normal">PhanTypeMismatchArgument</span> Argument <span class="phan_index">1</span> (<span class="phan_parameter">$x</span>) is <span class="phan_type">int</span> but <span class="phan_functionlike">\\MyClass::__construct()</span> takes <span class="phan_type">?string</span> defined at <span class="phan_file">input</span>:<span class="phan_line">24</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">18</span>: <span class="phan_issuetype">PhanRedundantCondition</span> Redundant attempt to cast <span class="phan_code">$cond</span> of type <span class="phan_type">bool</span> to <span class="phan_type">bool</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">18</span>: <span class="phan_issuetype_normal">PhanUnusedVariable</span> Unused definition of variable <span class="phan_variable">$always_true</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">19</span>: <span class="phan_issuetype_normal">PhanUndeclaredVariable</span> Variable <span class="phan_variable">$argv</span> is undeclared (<span class="phan_suggestion">Did you mean $arg or $argc</span>)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">20</span>: <span class="phan_issuetype_normal">PhanTypeMismatchReturn</span> Returning type <span class="phan_type">\\SplObjectStorage</span> but <span class="phan_functionlike">demo()</span> is declared to return <span class="phan_type">?int</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">25</span>: <span class="phan_issuetype_normal">PhanUndeclaredProperty</span> Reference to undeclared property <span class="phan_property">\\MyClass-&gt;x</span></p>';
}

var phpModule;
var combinedOutput = '';
var combinedHTMLOutput = '';

function getOrDefault(value, defaultValue) {
    return value !== '' ? value : defaultValue;
}

function doRun(code, outputIsHTML, defaultText) {
    output_area.innerHTML = '';
    code = code + "\necho PHP_EOL;" // flush line buffer
    console.log('evaluating code'); // , code);
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
        // Make sure the output area is rendered, then refresh the php runtime environment
        requestAnimationFrame(function () {
            setTimeout(function () {
                try {
                    phpModule._pib_force_exit();
                } catch (e) {
                    // ExitStatus
                }
                phpModule = generateNewPHPModule(function () {
                    isUsable = true;
                    enableButtons();
                });
            }, 0);
        });
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

function updateQueryParams(code) {
    var query = new URLSearchParams();
    if (code.length < 1024 && code != default_code) {
        query.append('code', code);
        history.replaceState({}, document.title, "?" + query.toString());
    }
}

function init() {
    if (didInit) {
        return;
    }
    didInit = true;
    // This is a monospace element without HTML.
    // output_area.innerText = "Click ANALYZE";
    enableButtons();

    run_button.addEventListener('click', function () {
        if (!isUsable) {
            console.log('skipping due to already running');
            return;
        }
        isUsable = false;
        output_area.innerText = '';
        run_button.textContent = "Running"
        disableButtons();
        var code = editor.getValue();
        updateQueryParams(code);
        // TODO: Figure out why we need an error handler for this to work.
        var analysisWrapper = document.getElementById('eval_wrapper_source').innerText;
        code = "?>" + code;
        doRunWithWrapper(analysisWrapper, code, false, 'PHP code ran successfully with no output.');
    });
    analyze_button.addEventListener('click', function () {
        if (!isUsable) {
            console.log('skipping due to already running');
            return;
        }
        isUsable = false;
        output_area.innerText = '';
        analyze_button.textContent = "Analyzing"
        disableButtons();
        var code = editor.getValue();
        updateQueryParams(code);
        var analysisWrapper = document.getElementById('phan_runner_source').innerText;
        doRunWithWrapper(analysisWrapper, code, true, 'Phan did not detect any errors.');
    });
}

var sizeInBytes = 134217728;
var WASM_PAGE_SIZE = 65536;
var reusableWasmMemory;

function generateNewPHPModule(callback) {
    fillReusableMemoryWithZeroes();
    reusableWasmMemory = reusableWasmMemory || new WebAssembly.Memory({
        initial: sizeInBytes / WASM_PAGE_SIZE,
        maximum: sizeInBytes / WASM_PAGE_SIZE,
    });
    var phpModuleOptions = {
        postRun: [callback],
        print: function (text) {
            console.log('print', arguments);

            if (arguments.length > 1) {
                text = Array.prototype.slice.call(arguments).join(' ');
            }
            if (text == '') {
                return;
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
            if (text == '') {
                return;
            }
            if (didInit) {
                combinedHTMLOutput += '<span class="stderr">' + text + "</span>\n";
                combinedOutput += text + "\n";
            }
        },
        wasmMemory: reusableWasmMemory
    };
    return PHP(phpModuleOptions);
}
/** This fills the wasm memory with 0s, so that the next fresh program startup succeeds */
var fillReusableMemoryWithZeroes = function() {
    if (reusableWasmMemory) {
        var arr = new Uint8Array(reusableWasmMemory.buffer);
        arr.fill(0);
    }
}
phpModule = generateNewPHPModule(init);
isUsable = true;
