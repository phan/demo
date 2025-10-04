/*eslint-env browser */
/*global ace, PHP */
/*eslint-disable no-console */
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github");
editor.session.setMode("ace/mode/php");
editor.setShowPrintMargin(false);
editor.setFontSize(14);

var default_code = "<?php\n" + document.getElementById('features_example').innerText;

var query = new URLSearchParams(document.location.search);
var run_button = document.getElementById('run');
var analyze_button = document.getElementById('analyze');
var output_area = document.getElementById('output');
var isUsable = false;

// Handle compressed code parameter
var initial_code = '';
if (query.has('c')) {
    // Compressed code
    try {
        initial_code = LZString.decompressFromEncodedURIComponent(query.get('c'));
    } catch (e) {
        console.error('Failed to decompress code:', e);
    }
} else if (query.has('code')) {
    // Legacy uncompressed code
    initial_code = query.get('code');
}

if (initial_code && initial_code != default_code) {
    editor.setValue(initial_code);
} else {
    editor.setValue(default_code);
    // Pre-render the output of the demo to show the types of issues Phan is capable of detecting.
    output_area.innerHTML =
        '<p><span class="phan_file">input</span>:<span class="phan_line">6</span>: <span class="phan_issuetype_critical">PhanUndeclaredClassMethod</span> Call to method <span class="phan_method">__construct</span> from undeclared class <span class="phan_class">\\my_class</span> (<span class="phan_suggestion">Did you mean class \\MyClass</span>)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">10</span>: <span class="phan_issuetype_critical">PhanTypeMismatchArgumentInternalReal</span> Argument <span class="phan_index">1</span> (<span class="phan_parameter">$object</span>) is <span class="phan_code">$cond</span> of type <span class="phan_type">bool</span><span class="phan_details"></span> but <span class="phan_functionlike">\\SplObjectStorage::attach()</span> takes <span class="phan_type">object</span><span class="phan_details"></span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">11</span>: <span class="phan_issuetype_critical">PhanUndeclaredMethod</span> Call to undeclared method <span class="phan_method">\\SplObjectStorage::atach</span> (<span class="phan_suggestion">Did you mean expr-&gt;attach()</span>)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">12</span>: <span class="phan_issuetype_critical">PhanParamTooManyInternal</span> Call with <span class="phan_count">3</span> arg(s) to <span class="phan_functionlike">\\SplObjectStorage::attach(object $object, $info = null)</span> which only takes <span class="phan_count">2</span> arg(s). This is an ArgumentCountError for internal functions in PHP 8.0+.</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">13</span>: <span class="phan_issuetype_normal">PhanTypeMismatchArgument</span> Argument <span class="phan_index">1</span> (<span class="phan_parameter">$x</span>) is <span class="phan_code">$argc</span> of type <span class="phan_type">int</span> but <span class="phan_functionlike">\\MyClass::__construct()</span> takes <span class="phan_type">?string</span> defined at <span class="phan_file">input</span>:<span class="phan_line">25</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">19</span>: <span class="phan_issuetype">PhanRedundantCondition</span> Redundant attempt to cast <span class="phan_code">$cond</span> of type <span class="phan_type">bool</span> to <span class="phan_type">bool</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">19</span>: <span class="phan_issuetype_normal">PhanUnusedVariable</span> Unused definition of variable <span class="phan_variable">$always_true</span></p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">20</span>: <span class="phan_issuetype_normal">PhanTypeSuspiciousStringExpression</span> Suspicious type <span class="phan_type">null=</span> of a variable or expression <span class="phan_code">$argv</span> used to build a string. (Expected type to be able to cast to a string)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">20</span>: <span class="phan_issuetype_normal">PhanUndeclaredVariable</span> Variable <span class="phan_variable">$argv</span> is undeclared (<span class="phan_suggestion">Did you mean $arg or $argc or (global $argv)</span>)</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">21</span>: <span class="phan_issuetype_critical">PhanTypeMismatchReturnReal</span> Returning <span class="phan_code">$arg</span> of type <span class="phan_type">\\SplObjectStorage</span><span class="phan_details"></span> but <span class="phan_functionlike">demo()</span> is declared to return <span class="phan_type">?int</span><span class="phan_details"></span></p>' +
	'<p><span class="phan_file">input</span>:<span class="phan_line">25</span>: <span class="phan_issuetype_normal">PhanDeprecatedImplicitNullableParam</span> Implicit nullable parameters (<span class="phan_type">string</span> <span class="phan_parameter">$x</span> = null) have been deprecated in PHP 8.4</p>' +
        '<p><span class="phan_file">input</span>:<span class="phan_line">27</span>: <span class="phan_issuetype_normal">PhanUndeclaredProperty</span> Reference to undeclared property <span class="phan_property">\\MyClass-&gt;x</span></p>';
}

var phpModule;
var phpModuleDidLoad = false;
var combinedOutput = '';
var combinedHTMLOutput = '';
var currentPhpVersion = '84';  // default
var currentPhanVersion = '5.5.2';  // default
var currentAstVersion = '1.1.3';  // default (matches HTML)
var shouldAutoAnalyze = false;

// Phan plugin definitions and level mappings (alphabetically sorted)
// Note: Some plugins are excluded because they require external tools not available in WebAssembly:
// - InvokePHPNativeSyntaxCheckPlugin (requires php binary)
// - FFIAnalysisPlugin (requires FFI which may not work in WASM)
var allPlugins = [
    'AddNeverReturnTypePlugin',
    'AlwaysReturnPlugin',
    'AsymmetricVisibilityPlugin',
    'AvoidableGetterPlugin',
    'ConstantVariablePlugin',
    'DollarDollarPlugin',
    'DuplicateArrayKeyPlugin',
    'DuplicateConstantPlugin',
    'DuplicateExpressionPlugin',
    'EmptyMethodAndFunctionPlugin',
    'EmptyStatementListPlugin',
    'HasPHPDocPlugin',
    'InlineHTMLPlugin',
    'InvalidVariableIssetPlugin',
    'LoopVariableReusePlugin',
    'MoreSpecificElementTypePlugin',
    'NoAssertPlugin',
    'NonBoolBranchPlugin',
    'NonBoolInLogicalArithPlugin',
    'NumericalComparisonPlugin',
    'PHPDocInWrongCommentPlugin',
    'PHPUnitAssertionPlugin',
    'PHPUnitNotDeadCodePlugin',
    'PossiblyStaticMethodPlugin',
    'PregRegexCheckerPlugin',
    'PrintfCheckerPlugin',
    'RedundantAssignmentPlugin',
    'RemoveDebugStatementPlugin',
    'ShortArrayPlugin',
    'SimplifyExpressionPlugin',
    'SleepCheckerPlugin',
    'StaticVariableMisusePlugin',
    'StrictComparisonPlugin',
    'StrictLiteralComparisonPlugin',
    'SuspiciousParamOrderPlugin',
    'UnknownClassElementAccessPlugin',
    'UnknownElementTypePlugin',
    'UnreachableCodePlugin',
    'UnsafeCodePlugin',
    'UnusedSuppressionPlugin',
    'UseReturnValuePlugin'
];

var pluginLevels = {
    1: [],
    2: [
        'AlwaysReturnPlugin',
        'DollarDollarPlugin',
        'DuplicateArrayKeyPlugin',
        'DuplicateExpressionPlugin',
        'PregRegexCheckerPlugin',
        'PrintfCheckerPlugin',
        'SleepCheckerPlugin',
        'UnreachableCodePlugin',
        'UseReturnValuePlugin',
        'EmptyStatementListPlugin',
        'StrictComparisonPlugin',
        'LoopVariableReusePlugin'
    ],
    3: [
        'AlwaysReturnPlugin',
        'DollarDollarPlugin',
        'DuplicateArrayKeyPlugin',
        'DuplicateExpressionPlugin',
        'PregRegexCheckerPlugin',
        'PrintfCheckerPlugin',
        'SleepCheckerPlugin',
        'UnreachableCodePlugin',
        'UseReturnValuePlugin',
        'EmptyStatementListPlugin',
        'InvalidVariableIssetPlugin',
        'NonBoolBranchPlugin',
        'NonBoolInLogicalArithPlugin',
        'NumericalComparisonPlugin'
    ],
    4: [
        'AlwaysReturnPlugin',
        'DollarDollarPlugin',
        'DuplicateArrayKeyPlugin',
        'DuplicateExpressionPlugin',
        'PregRegexCheckerPlugin',
        'PrintfCheckerPlugin',
        'SleepCheckerPlugin',
        'UnreachableCodePlugin',
        'UseReturnValuePlugin',
        'EmptyStatementListPlugin',
        'InvalidVariableIssetPlugin',
        'NonBoolBranchPlugin',
        'NonBoolInLogicalArithPlugin',
        'NumericalComparisonPlugin',
        'RedundantAssignmentPlugin',
        'UnknownElementTypePlugin'
    ],
    5: allPlugins
};

var activePlugins = pluginLevels[2]; // Default to level 2

// Parse URL parameters for versions and plugins
function parseUrlParams() {
    if (query.has('php')) {
        var phpVer = query.get('php');
        if (['81', '82', '83', '84', '85'].indexOf(phpVer) !== -1) {
            currentPhpVersion = phpVer;
        }
    }
    if (query.has('phan')) {
        currentPhanVersion = query.get('phan');
    }
    if (query.has('ast')) {
        var astVer = query.get('ast');
        if (['1.1.2', '1.1.3'].indexOf(astVer) !== -1) {
            currentAstVersion = astVer;
        }
    }
    // Parse plugins bitfield (using BigInt for 43+ plugins)
    if (query.has('plugins')) {
        try {
            var pluginBits = BigInt(query.get('plugins'));
            var selectedPlugins = [];
            allPlugins.forEach(function(plugin, index) {
                if (pluginBits & (1n << BigInt(index))) {
                    selectedPlugins.push(plugin);
                }
            });
            if (selectedPlugins.length > 0) {
                activePlugins = selectedPlugins;
            }
        } catch (e) {
            console.error('Failed to parse plugins:', e);
        }
    }
}

function getOrDefault(value, defaultValue) {
    return value !== '' ? value : defaultValue;
}

function htmlescape(text) {
    var el = document.createElement('span');
    el.innerText = text;
    return el.innerHTML;
}

/**
 * This wraps generateNewPHPModule.
 *
 * It makes the buttons clickable immediately on subsequent runs,
 * while silently waiting for php to become executable again.
 *
 * @returns {Promise<PHP>}
 */
function lazyGenerateNewPHPModule(cb) {
    cb = cb || function() {}
    if (phpModuleDidLoad) {
        cb();
        return;
    }
    try {
        generateNewPHPModule().then(function (newPHPModule) {
            phpModuleDidLoad = true;
            phpModule = newPHPModule;
            cb();
        }).catch(function(e) {
            showWebAssemblyError("Unexpected error reloading php: " + e.toString())
        });
    } catch (e) {
        showWebAssemblyError("Unexpected error reloading php: " + e.toString())
    }
}

function doRun(code, outputIsHTML, defaultText) {
    output_area.innerHTML = '';
    code = code + "\necho PHP_EOL;" // flush line buffer
    console.log('evaluating code'); // , code);
    let invokePHP = function () {
        combinedOutput = '';
        combinedHTMLOutput = '';
        lazyGenerateNewPHPModule(invokePHPInner);
    };
    let invokePHPInner = function () {
        let ret = phpModule.ccall('pib_eval', 'number', ["string"], [code])
        console.log('done evaluating code', ret);
        if (ret != 0) {
            combinedOutput += "Error, please check your code";
            combinedHTMLOutput += "Error, please check your code";
        }
        if (outputIsHTML && ret == 0) {
            output_area.innerHTML = getOrDefault(combinedHTMLOutput.replace(/\n/g, ""), defaultText);
        } else {
            output_area.innerHTML = getOrDefault(combinedOutput, defaultText);
        }
        // Make sure the output area is rendered, then refresh the php runtime environment
        requestAnimationFrame(function () {
            setTimeout(function () {
                try {
                    phpModule._pib_force_exit();
                } catch (e) {
                    // ExitStatus
                }
                phpModule = null;
                phpModuleDidLoad = false;
                enableButtons();
                isUsable = true;
                console.log('buttons enabled');
                requestAnimationFrame(function () {
                    setTimeout(function () {
                        console.log('render'); lazyGenerateNewPHPModule();
                    }, 0);
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
    console.log('doRunWithWrapper called with versions:', {
        php: currentPhpVersion,
        phan: currentPhanVersion,
        ast: currentAstVersion
    });

    // single quotes aren't escaped by encodeURIComponent, but double quotes are.
    // Other problematic characters are escaped, and this preserves UTF-8.
    var contentsFragment = 'rawurldecode("' + encodeURIComponent(code) + '")';
    var analysisCode = analysisWrapper.replace('$CONTENTS_TO_ANALYZE', contentsFragment);

    // Replace phan phar path placeholder
    var phanPharName = 'phan-' + currentPhanVersion + '.phar';
    analysisCode = analysisCode.replace('$PHAN_PHAR_PATH', phanPharName);

    // Replace active plugins placeholder
    var pluginsCode = 'Config::setValue(\'plugins\', ' + JSON.stringify(activePlugins) + ');';
    analysisCode = analysisCode.replace('$ACTIVE_PLUGINS_PLACEHOLDER', pluginsCode);

    doRun(analysisCode, outputIsHTML, defaultText);
}

var didInit = false;

var buttons = [run_button, analyze_button];

// Function to enforce ast version constraints (global so modal can use it)
function enforceAstConstraints() {
    var astVersionSelect = document.getElementById('ast-version');
    if (!astVersionSelect) return;

    // Re-read current ast version from dropdown
    currentAstVersion = astVersionSelect.value;
    console.log('enforceAstConstraints called:', {
        currentPhpVersion: currentPhpVersion,
        currentPhanVersion: currentPhanVersion,
        currentAstVersion: currentAstVersion,
        dropdownValue: astVersionSelect.value
    });

    // PHP 8.4, 8.5, and Phan v6-dev all require ast 1.1.3
    var requiresAst113 = (currentPhpVersion === '84' || currentPhpVersion === '85' || currentPhanVersion === 'v6-dev');

    if (requiresAst113) {
        console.log('Requires ast 1.1.3, current is:', currentAstVersion);
        if (currentAstVersion === '1.1.2') {
            console.log('Forcing ast version to 1.1.3');
            currentAstVersion = '1.1.3';
            astVersionSelect.value = '1.1.3';
        }
        // Disable ast 1.1.2 option
        Array.from(astVersionSelect.options).forEach(function(option) {
            option.disabled = (option.value === '1.1.2');
        });
    } else {
        // Enable all ast options
        Array.from(astVersionSelect.options).forEach(function(option) {
            option.disabled = false;
        });
    }
    console.log('After enforcement, currentAstVersion:', currentAstVersion);
}

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

// Based on emscripten generated source
function fetchRemotePackage(packageName, callback) {
    var xhr = new XMLHttpRequest;
    xhr.open('GET', packageName, true);
    xhr.responseType = 'arraybuffer';
    xhr.onerror = function (event) {
        console.log('NetworkError for: ' + packageName, event);
        showWebAssemblyError('NetworkError for: ' + packageName);
        throw new Error('NetworkError for: ' + packageName);
    };
    xhr.onload = function (/*event */) {
        console.log('xhr loaded status=' + xhr.status);
        if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || xhr.status == 0 && xhr.response) {
            var packageData = xhr.response;
            callback(packageData)
        } else {
            showWebAssemblyError(xhr.statusText + ' : ' + xhr.responseURL);
            throw new Error(xhr.statusText + ' : ' + xhr.responseURL)
        }
    };
    xhr.send(null)
}

/* This can be reused - This avoids notices about HTTP 302s and using the streaming API in some browsers (firefox), but is counterproductive if other browsers (Chrome) would normally just use disk cache. */
var phpWasmBinary = null;
var phpWasmData = null;
var currentVersionPath = '';

function getVersionPath() {
    return 'builds/php-' + currentPhpVersion + '/phan-' + currentPhanVersion + '/ast-' + currentAstVersion + '/';
}

function updatePhanVersionInfo() {
    var phanVersionSelect = document.getElementById('phan-version');

    // Only update dropdown for dev versions
    if (currentPhanVersion === 'v6-dev') {
        // Fetch the .info file for this version
        var infoUrl = 'phan-' + currentPhanVersion + '.phar.info';

        fetch(infoUrl)
            .then(function(response) {
                if (response.ok) {
                    return response.text();
                }
                return null;
            })
            .then(function(text) {
                if (text) {
                    // Extract just the commit hash
                    var match = text.match(/commit ([a-f0-9]+)/);
                    if (match) {
                        var commitHash = match[1];
                        // Update dropdown text to show commit hash
                        var v6Option = Array.from(phanVersionSelect.options).find(function(opt) {
                            return opt.value === 'v6-dev';
                        });
                        if (v6Option) {
                            v6Option.textContent = 'v6 dev (' + commitHash + ')';
                        }
                    }
                }
            })
            .catch(function() {
                // Ignore errors
            });
    }
}

function loadPhpWasm(cb) {
    currentVersionPath = getVersionPath();
    console.log('called loadPhpWasm for path:', currentVersionPath);

    // Reset cached data when version changes
    phpWasmBinary = null;
    phpWasmData = null;

    fetchRemotePackage(currentVersionPath + 'php.wasm', function (data) {
        phpWasmBinary = data;
        fetchRemotePackage(currentVersionPath + 'php.data', function (data) {
            phpWasmData = data;
            cb(phpWasmBinary);
        });
    });
}

function reloadPHPModule() {
    if (!isUsable) {
        console.log('Cannot reload - PHP is currently executing');
        return;
    }

    output_area.innerText = 'Loading new PHP/Phan version...';
    disableButtons();
    run_button.textContent = "Loading...";
    analyze_button.textContent = "Loading...";

    // Force cleanup of current module
    if (phpModule) {
        try {
            phpModule._pib_force_exit();
        } catch (e) {
            // ExitStatus expected
        }
        phpModule = null;
    }
    phpModuleDidLoad = false;
    fillReusableMemoryWithZeroes();

    // Clear window.PHP to force reload of new version
    window.PHP = undefined;

    // Load new php.js script for the new version
    loadPHPScript(function() {
        // Load new version
        loadPhpWasm(function () {
            console.log('successfully downloaded new php.wasm');
            generateNewPHPModule().then(function (newPHPModule) {
                console.log('successfully initialized new php module');
                phpModule = newPHPModule;
                phpModuleDidLoad = true;
                isUsable = true;
                output_area.innerText = '';
                enableButtons();

                // Auto-analyze if version was changed
                if (shouldAutoAnalyze && editor.getValue().trim()) {
                    shouldAutoAnalyze = false;
                    console.log('Auto-analyzing after version change');
                    analyze_button.click();
                }
            }).catch(function (error) {
                showWebAssemblyError('Failed to initialize WebAssembly module: ' + error.message);
            });
        });
    });
}

function init() {
    if (didInit) {
        return;
    }
    didInit = true;
    // This is a monospace element without HTML.
    // output_area.innerText = "Click ANALYZE";

    // Set up version selectors
    var phpVersionSelect = document.getElementById('php-version');
    var phanVersionSelect = document.getElementById('phan-version');
    var astVersionSelect = document.getElementById('ast-version');

    // Read initial values from dropdowns
    currentPhpVersion = phpVersionSelect.value;
    currentPhanVersion = phanVersionSelect.value;
    currentAstVersion = astVersionSelect.value;

    phpVersionSelect.addEventListener('change', function() {
        currentPhpVersion = this.value;
        console.log('PHP version changed to:', currentPhpVersion);
        enforceAstConstraints();
        shouldAutoAnalyze = true;
        reloadPHPModule();
    });

    phanVersionSelect.addEventListener('change', function() {
        currentPhanVersion = this.value;
        console.log('Phan version changed to:', currentPhanVersion);
        updatePhanVersionInfo();
        enforceAstConstraints();
        shouldAutoAnalyze = true;
        reloadPHPModule();
    });

    astVersionSelect.addEventListener('change', function() {
        currentAstVersion = this.value;
        console.log('ast version changed to:', currentAstVersion);
        shouldAutoAnalyze = true;
        reloadPHPModule();
    });

    // Initial constraint check
    enforceAstConstraints();
    updatePhanVersionInfo();

    enableButtons();

    // Share button
    var shareButton = document.getElementById('share-link');
    shareButton.addEventListener('click', function() {
        var code = editor.getValue();
        var url = new URL(window.location.href.split('?')[0]);

        // Add compressed code
        var compressed = LZString.compressToEncodedURIComponent(code);
        url.searchParams.set('c', compressed);

        // Add version parameters
        url.searchParams.set('php', currentPhpVersion);
        url.searchParams.set('phan', currentPhanVersion);
        url.searchParams.set('ast', currentAstVersion);

        // Encode active plugins as bitfield (using BigInt for 43+ plugins)
        var pluginBits = 0n;
        allPlugins.forEach(function(plugin, index) {
            if (activePlugins.indexOf(plugin) !== -1) {
                pluginBits |= (1n << BigInt(index));
            }
        });
        url.searchParams.set('plugins', pluginBits.toString());

        // Copy to clipboard
        var urlString = url.toString();
        navigator.clipboard.writeText(urlString).then(function() {
            // Visual feedback
            var originalText = shareButton.textContent;
            shareButton.textContent = '✓ Copied!';
            shareButton.style.background = '#198754';
            shareButton.style.color = 'white';
            shareButton.style.borderColor = '#198754';

            setTimeout(function() {
                shareButton.textContent = originalText;
                shareButton.style.background = '';
                shareButton.style.color = '';
                shareButton.style.borderColor = '';
            }, 2000);
        }).catch(function(err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy link. Please copy manually:\n\n' + urlString);
        });
    });

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

    // Set up line number highlighting
    setupLineHighlighting();
}

function setupLineHighlighting() {
    var currentEditorHighlight = null;

    // Parse line number from error message
    function getLineNumberFromError(errorElement) {
        var lineSpan = errorElement.querySelector('.phan_line');
        if (lineSpan) {
            var lineNum = parseInt(lineSpan.textContent);
            if (!isNaN(lineNum)) {
                return lineNum;
            }
        }
        return null;
    }

    // Highlight editor line
    function highlightEditorLine(lineNum) {
        if (currentEditorHighlight) {
            editor.session.removeMarker(currentEditorHighlight);
        }
        if (lineNum !== null) {
            var Range = ace.require('ace/range').Range;
            currentEditorHighlight = editor.session.addMarker(
                new Range(lineNum - 1, 0, lineNum - 1, 1000),
                'ace-highlight-line',
                'fullLine'
            );
        }
    }

    // Add hover handlers to output errors
    output_area.addEventListener('mouseover', function(e) {
        var errorP = e.target.closest('p');
        if (errorP && errorP.parentElement === output_area) {
            var lineNum = getLineNumberFromError(errorP);
            if (lineNum !== null) {
                highlightEditorLine(lineNum);
                errorP.classList.add('highlighted');
            }
        }
    });

    output_area.addEventListener('mouseout', function(e) {
        var errorP = e.target.closest('p');
        if (errorP && errorP.parentElement === output_area) {
            highlightEditorLine(null);
            errorP.classList.remove('highlighted');
        }
    });

    // Highlight errors when cursor moves in editor
    function highlightErrorsForCurrentLine() {
        var cursorPos = editor.getCursorPosition();
        var lineNum = cursorPos.row + 1;

        // Find and highlight matching errors
        var errorPs = output_area.querySelectorAll('p');
        errorPs.forEach(function(errorP) {
            var errorLine = getLineNumberFromError(errorP);
            if (errorLine === lineNum) {
                errorP.classList.add('highlighted');
                // Scroll error into view if not visible
                if (errorP.offsetTop < output_area.scrollTop ||
                    errorP.offsetTop > output_area.scrollTop + output_area.clientHeight) {
                    errorP.scrollIntoView({block: 'nearest', behavior: 'smooth'});
                }
            } else {
                errorP.classList.remove('highlighted');
            }
        });
    }

    // Listen for cursor position changes
    editor.selection.on('changeCursor', highlightErrorsForCurrentLine);

    // Initial highlight on page load
    highlightErrorsForCurrentLine();
}

var sizeInBytes = 134217728;
var WASM_PAGE_SIZE = 65536;
var reusableWasmMemory;

/**
 * @param {Function} callback callback to call after the script runs
 * @returns {Promise<PHP>} the new php module
 */
function generateNewPHPModule() {
    fillReusableMemoryWithZeroes();
    reusableWasmMemory = reusableWasmMemory || new WebAssembly.Memory({
        initial: sizeInBytes / WASM_PAGE_SIZE,
        maximum: sizeInBytes / WASM_PAGE_SIZE,
    });
    var phpModuleOptions = {
        // postRun: [callback],
        onAbort: function(what) {
            markButtonsAsUnusable();
            var errorElement = document.createElement('p');
            errorElement.setAttribute('class', 'phan_issuetype_critical');
            errorElement.innerText = 'WebAssembly aborted: ' + what.toString();
            output_area.appendChild(errorElement);
        },
        print: function (text) {
            console.log('print', arguments);

            if (arguments.length > 1) {
                text = Array.prototype.slice.call(arguments).join(' ');
            }
            if (text == '') {
                return;
            }
            if (didInit && phpModuleDidLoad) {
                combinedOutput += htmlescape(text) + "\n";
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
            if (didInit && phpModuleDidLoad) {
                combinedHTMLOutput += '<span class="stderr">' + text + "</span>\n";
                combinedOutput += '<span class="stderr">' + htmlescape(text) + "</span>\n";
            }
        },
        wasmBinary: phpWasmBinary,
        wasmMemory: reusableWasmMemory,
        getPreloadedPackage: function(name) {
          if (name === 'php.data') {
            console.log('getPreloadedPackage returning php.data', phpWasmBinary);
            return phpWasmData;
          }
        }
    };
    console.log('creating PHP module fetchPreloadedPackage override');
    return PHP(phpModuleOptions).then(function (newPHPModule) {
        console.log('created PHP module', newPHPModule);
        return newPHPModule;
    }).catch(function (error) {
        showWebAssemblyError('Failed to initialize WebAssembly module: ' + error.message);
        throw error;
    });
}

/** This fills the wasm memory with 0s, so that the next fresh program startup succeeds */
function fillReusableMemoryWithZeroes() {
    if (reusableWasmMemory) {
        var arr = new Uint8Array(reusableWasmMemory.buffer);
        arr.fill(0);
    }
}
function markButtonsAsUnusable() {
    run_button.innerText = "ERROR";
    run_button.removeAttribute('title');
    analyze_button.innerText = "ERROR";
    analyze_button.removeAttribute('title');
    disableButtons();
    isUsable = false;
}
function showWebAssemblyError(message) {
    output_area.setAttribute('style', 'font-family: serif');
    output_area.innerHTML =
        '<h1 class="phan_issuetype_critical">' + message + '</h1>' +
        '<br />' +
        '<p>But you can install <a href="https://github.com/phan/phan">Phan</a> locally with <a href="https://github.com/phan/phan/wiki/Getting-Started">these instructions for getting started.</a>, or try this in Firefox or Chrome.</p>';
    markButtonsAsUnusable();
}
function loadPHPScript(callback) {
    var versionPath = getVersionPath();
    var scriptUrl = versionPath + 'php.js';

    console.log('Loading PHP script from:', scriptUrl);

    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptUrl;
    script.onload = function() {
        console.log('Successfully loaded php.js');
        callback();
    };
    script.onerror = function() {
        showWebAssemblyError('Failed to load php.js from ' + scriptUrl);
    };
    document.head.appendChild(script);
}

// Plugin configuration modal functions
function initPluginModal() {
    var modal = document.getElementById('plugin-modal');
    var configureBtn = document.getElementById('configure-plugins');
    var closeBtn = document.getElementById('modal-close');
    var cancelBtn = document.getElementById('modal-cancel');
    var applyBtn = document.getElementById('modal-apply');
    var pluginList = document.getElementById('plugin-list');
    var levelBtns = document.querySelectorAll('.level-btn');

    // Populate plugin list
    allPlugins.forEach(function(plugin) {
        var item = document.createElement('div');
        item.className = 'plugin-item';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'plugin-' + plugin;
        checkbox.value = plugin;
        checkbox.checked = activePlugins.indexOf(plugin) !== -1;

        var label = document.createElement('label');
        label.htmlFor = 'plugin-' + plugin;
        label.textContent = plugin;

        item.appendChild(checkbox);
        item.appendChild(label);
        pluginList.appendChild(item);
    });

    // Open modal
    configureBtn.addEventListener('click', function() {
        modal.classList.add('show');

        // Update checkboxes to reflect current state
        allPlugins.forEach(function(plugin) {
            var checkbox = document.getElementById('plugin-' + plugin);
            checkbox.checked = activePlugins.indexOf(plugin) !== -1;
        });

        // Update level button active state
        updateLevelButtonState();
    });

    // Close modal
    function closeModal() {
        modal.classList.remove('show');
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Level button clicks
    levelBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var level = parseInt(this.getAttribute('data-level'));
            var levelPlugins = pluginLevels[level];

            // Update all checkboxes
            allPlugins.forEach(function(plugin) {
                var checkbox = document.getElementById('plugin-' + plugin);
                checkbox.checked = levelPlugins.indexOf(plugin) !== -1;
            });

            updateLevelButtonState();
        });
    });

    // Update level button active state based on current selection
    function updateLevelButtonState() {
        var checkedPlugins = [];
        allPlugins.forEach(function(plugin) {
            var checkbox = document.getElementById('plugin-' + plugin);
            if (checkbox.checked) {
                checkedPlugins.push(plugin);
            }
        });

        // Check if current selection matches any level
        var matchingLevel = null;
        for (var level in pluginLevels) {
            var levelPlugins = pluginLevels[level];
            if (levelPlugins.length === checkedPlugins.length &&
                levelPlugins.every(function(p) { return checkedPlugins.indexOf(p) !== -1; })) {
                matchingLevel = level;
                break;
            }
        }

        levelBtns.forEach(function(btn) {
            var btnLevel = btn.getAttribute('data-level');
            if (btnLevel === matchingLevel) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Update on checkbox change
    pluginList.addEventListener('change', function() {
        updateLevelButtonState();
    });

    // Apply button
    applyBtn.addEventListener('click', function() {
        console.log('Modal apply clicked');
        // Collect checked plugins
        var newActivePlugins = [];
        allPlugins.forEach(function(plugin) {
            var checkbox = document.getElementById('plugin-' + plugin);
            if (checkbox.checked) {
                newActivePlugins.push(plugin);
            }
        });

        activePlugins = newActivePlugins;
        console.log('Active plugins set to:', activePlugins);
        closeModal();

        // Make sure ast constraints are enforced (this will update currentAstVersion if needed)
        var oldAstVersion = currentAstVersion;
        enforceAstConstraints();

        // If ast version changed due to constraints, reload the module
        if (oldAstVersion !== currentAstVersion) {
            console.log('ast version changed from', oldAstVersion, 'to', currentAstVersion, '- reloading module');
            shouldAutoAnalyze = true;
            reloadPHPModule();
        } else {
            // Auto-analyze with new plugin configuration
            console.log('About to trigger analyze, currentAstVersion:', currentAstVersion);
            if (isUsable && editor.getValue().trim()) {
                analyze_button.click();
            }
        }
    });
}

if (!window.WebAssembly) {
    showWebAssemblyError('Your browser does not support WebAssembly.');
} else {
    // Parse URL parameters first
    parseUrlParams();

    // Set dropdown values from URL params or defaults
    var phpSelect = document.getElementById('php-version');
    var phanSelect = document.getElementById('phan-version');
    var astSelect = document.getElementById('ast-version');

    phpSelect.value = currentPhpVersion;
    phanSelect.value = currentPhanVersion;
    astSelect.value = currentAstVersion;

    console.log('Initial versions:', {php: currentPhpVersion, phan: currentPhanVersion, ast: currentAstVersion});

    console.log('Loading PHP script dynamically');
    loadPHPScript(function() {
        console.log('downloading php.wasm');
        loadPhpWasm(function () {
            console.log('successfully downloaded php.wasm to reuse');
            /** This fills the wasm memory with 0s, so that the next fresh program startup succeeds */
            generateNewPHPModule().then(function (newPHPModule) {
                console.log('successfully initialized php module');
                phpModule = newPHPModule
                isUsable = true;
                init();
                initPluginModal();

                // Auto-analyze if code was provided in URL
                if ((query.has('c') || query.has('code')) && editor.getValue().trim()) {
                    console.log('Auto-analyzing from URL parameter');
                    setTimeout(function() {
                        if (isUsable) {
                            analyze_button.click();
                        }
                    }, 100);
                }
            }).catch(function (error) {
                showWebAssemblyError('Failed to initialize WebAssembly module: ' + error.message);
            });
        });
    });
}
