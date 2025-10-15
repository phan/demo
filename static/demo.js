/*eslint-env browser */
/*global ace, PHP */
/*eslint-disable no-console */
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github");
editor.session.setMode("ace/mode/php");
editor.session.setUseWorker(false);  // Disable syntax validation - we use Phan instead
editor.setShowPrintMargin(false);
editor.setFontSize(18);

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
    editor.setValue(initial_code, -1);
} else {
    editor.setValue(default_code, -1);
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

// Dark mode toggle functionality
(function() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const themeIcon = darkModeToggle.querySelector('.theme-icon');
    const htmlElement = document.documentElement;

    // Check for saved theme preference or detect system preference
    let currentTheme = localStorage.getItem('theme');
    if (!currentTheme) {
        // No saved preference, use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        currentTheme = prefersDark ? 'dark' : 'light';
    }

    // Apply the theme
    htmlElement.setAttribute('data-theme', currentTheme);
    themeIcon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';

    // Update ace editor theme
    if (currentTheme === 'dark') {
        editor.setTheme("ace/theme/tomorrow_night");
    } else {
        editor.setTheme("ace/theme/github");
    }

    // Toggle theme on button click
    darkModeToggle.addEventListener('click', function() {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';

        // Update ace editor theme
        if (newTheme === 'dark') {
            editor.setTheme("ace/theme/tomorrow_night");
        } else {
            editor.setTheme("ace/theme/github");
        }

        // Update AST background if AST view is active
        if (astPaper) {
            var backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--output-bg').trim();
            astPaper.options.background.color = backgroundColor;
            astPaper.drawBackground();
        }
    });
})();

// Phan plugin definitions and level mappings (alphabetically sorted)
// Note: Some plugins are excluded because they require external dependencies not available in WebAssembly:
// - InvokePHPNativeSyntaxCheckPlugin (requires php binary)
// - FFIAnalysisPlugin (requires FFI which may not work in WASM)
// - PHPUnitAssertionPlugin (requires PHPUnit framework)
// - PHPUnitNotDeadCodePlugin (requires PHPUnit framework)
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

function doRunWithPhar(code, outputIsHTML, defaultText, pharName) {
    output_area.innerHTML = '';
    code = code + "\necho PHP_EOL;" // flush line buffer
    console.log('evaluating code'); // , code);
    let invokePHP = function () {
        combinedOutput = '';
        combinedHTMLOutput = '';
        lazyGenerateNewPHPModule(invokePHPInner);
    };
    let invokePHPInner = function () {
        // Load the phar file now that the PHP module is ready
        if (pharName) {
            loadPharFile(pharName, function() {
                executeCode();
            });
        } else {
            executeCode();
        }
    };
    let executeCode = function() {
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

                // Clear loaded phar tracking since the new module will have a fresh virtual filesystem
                loadedPharFiles = {};

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

    // Pass the phar name to doRun so it can be loaded after PHP module is ready
    doRunWithPhar(analysisCode, outputIsHTML, defaultText, phanPharName);
}

var didInit = false;

var ast_button = document.getElementById('ast');
var opcodes_button = document.getElementById('opcodes');
var buttons = [run_button, analyze_button, ast_button, opcodes_button];

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
    ast_button.textContent = "AST"
    opcodes_button.textContent = "Opcodes"
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
    if (code == default_code) {
        // Clear URL params for default code
        history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    var url = new URLSearchParams();

    // Add compressed code
    var compressed = LZString.compressToEncodedURIComponent(code);
    url.set('c', compressed);

    // Add version parameters
    url.set('php', currentPhpVersion);
    url.set('phan', currentPhanVersion);
    url.set('ast', currentAstVersion);

    // Encode active plugins as bitfield (using BigInt for 43+ plugins)
    var pluginBits = 0n;
    allPlugins.forEach(function(plugin, index) {
        if (activePlugins.indexOf(plugin) !== -1) {
            pluginBits |= (1n << BigInt(index));
        }
    });
    url.set('plugins', pluginBits.toString());

    history.replaceState({}, document.title, "?" + url.toString());
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
var loadedPharFiles = {}; // Cache loaded phar files
var pharManifest = null; // Phar file mtimes for cache-busting

function getVersionPath() {
    // New structure: builds/php-{VERSION}/ast-{VERSION}/
    return 'builds/php-' + currentPhpVersion + '/ast-' + currentAstVersion + '/';
}

// Fetch manifest.json with phar mtimes for cache-busting
function fetchPharManifest(callback) {
    if (pharManifest !== null) {
        // Already loaded
        callback();
        return;
    }

    fetch('manifest.json')
        .then(function(response) {
            if (!response.ok) {
                console.warn('Failed to fetch manifest.json, cache-busting will be disabled');
                pharManifest = {}; // Empty object to prevent retrying
                callback();
                return;
            }
            return response.json();
        })
        .then(function(manifest) {
            if (manifest) {
                pharManifest = manifest;
                console.log('Loaded phar manifest:', pharManifest);
            }
            callback();
        })
        .catch(function(error) {
            console.warn('Error loading manifest.json:', error);
            pharManifest = {}; // Empty object to prevent retrying
            callback();
        });
}

// Function to load a .phar file dynamically into the PHP virtual filesystem
function loadPharFile(pharName, callback) {
    // Check if already loaded
    if (loadedPharFiles[pharName]) {
        console.log('Phar already loaded:', pharName);
        callback();
        return;
    }

    console.log('Loading phar file:', pharName);
    var startTime = performance.now();

    // Use mtime from manifest for cache-busting (allows browser caching across page loads)
    var cacheBuster = '';
    if (pharManifest && pharManifest[pharName]) {
        cacheBuster = '?v=' + pharManifest[pharName];
    } else {
        console.warn('No mtime found in manifest for', pharName, '- using timestamp');
        cacheBuster = '?v=' + Date.now();
    }
    fetch(pharName + cacheBuster)
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Failed to fetch ' + pharName + ': ' + response.status);
            }
            return response.arrayBuffer();
        })
        .then(function(buffer) {
            var fetchTime = performance.now() - startTime;
            console.log('Fetched ' + pharName + ' (' + buffer.byteLength + ' bytes) in ' + fetchTime.toFixed(2) + 'ms');

            // Write to virtual filesystem using FS_createDataFile
            var uint8Array = new Uint8Array(buffer);
            var filename = '/' + pharName;

            // Use the module's FS object (exported via EXPORTED_RUNTIME_METHODS)
            if (phpModule && phpModule.FS && phpModule.FS.createDataFile) {
                phpModule.FS.createDataFile('/', pharName, uint8Array, true, true, true);
                loadedPharFiles[pharName] = true;
                console.log('Successfully loaded ' + pharName + ' into virtual filesystem');
                callback();
            } else {
                var errorMsg = 'PHP module not ready or FS not available';
                if (!phpModule) {
                    errorMsg += ' (phpModule is null/undefined)';
                } else if (!phpModule.FS) {
                    errorMsg += ' (FS object not found)';
                } else if (!phpModule.FS.createDataFile) {
                    errorMsg += ' (FS.createDataFile not found)';
                }
                throw new Error(errorMsg);
            }
        })
        .catch(function(error) {
            console.error('Error loading phar:', error);
            showWebAssemblyError('Failed to load ' + pharName + ': ' + error.message);
        });
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
    phpWasmData = null; // Not used anymore (no embedded files)

    fetchRemotePackage(currentVersionPath + 'php.wasm', function (data) {
        phpWasmBinary = data;
        // No php.data to load - phars are loaded dynamically
        cb(phpWasmBinary);
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

    // Clear loaded phar tracking since the new module will have a fresh virtual filesystem
    loadedPharFiles = {};
    console.log('Cleared phar file cache for new module');

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
        output_area.classList.remove('ast-view');
        output_area.classList.remove('opcode-view');
        // Remove AST cursor tracking if active
        editor.selection.removeListener('changeCursor', highlightAstNodesFromEditor);
        if (currentEditorHighlightFromAst) {
            editor.session.removeMarker(currentEditorHighlightFromAst);
            currentEditorHighlightFromAst = null;
        }
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
        output_area.classList.remove('ast-view');
        output_area.classList.remove('opcode-view');
        // Remove AST cursor tracking if active
        editor.selection.removeListener('changeCursor', highlightAstNodesFromEditor);
        if (currentEditorHighlightFromAst) {
            editor.session.removeMarker(currentEditorHighlightFromAst);
            currentEditorHighlightFromAst = null;
        }
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
        wasmMemory: reusableWasmMemory
        // No getPreloadedPackage needed - phars loaded dynamically
    };
    console.log('creating PHP module (phars will be loaded dynamically)');
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

// AST Visualization
var currentAstData = null;
var astGraph = null;
var astPaper = null;
var astNodeMap = new Map(); // Map line numbers to AST nodes/cells
var astTooltip = null; // Current tooltip element

// Clear AST tooltip
function clearAstTooltip() {
    if (astTooltip) {
        astTooltip.remove();
        astTooltip = null;
    }
}

// Determine node category for coloring
function getNodeCategory(kind) {
    // Statements
    if (kind.includes('STMT') || kind === 'AST_IF' || kind === 'AST_WHILE' ||
        kind === 'AST_FOR' || kind === 'AST_FOREACH' || kind === 'AST_SWITCH' ||
        kind === 'AST_CASE' || kind === 'AST_TRY' || kind === 'AST_CATCH' ||
        kind === 'AST_RETURN' || kind === 'AST_BREAK' || kind === 'AST_CONTINUE' ||
        kind === 'AST_THROW' || kind === 'AST_ECHO' || kind === 'AST_PRINT' ||
        kind === 'AST_UNSET' || kind === 'AST_DECLARE') {
        return 'statement';
    }

    // Expressions
    if (kind.includes('ASSIGN') || kind.includes('BINARY_OP') || kind.includes('UNARY_OP') ||
        kind === 'AST_CALL' || kind === 'AST_METHOD_CALL' || kind === 'AST_STATIC_CALL' ||
        kind === 'AST_NEW' || kind === 'AST_VAR' || kind === 'AST_DIM' ||
        kind === 'AST_PROP' || kind === 'AST_STATIC_PROP' || kind === 'AST_CONDITIONAL' ||
        kind === 'AST_INSTANCEOF' || kind === 'AST_ISSET' || kind === 'AST_EMPTY' ||
        kind === 'AST_CLONE' || kind === 'AST_CAST' || kind === 'AST_ARRAY' ||
        kind === 'AST_ARRAY_ELEM' || kind === 'AST_CLOSURE' || kind === 'AST_ARROW_FUNC' ||
        kind === 'AST_MATCH' || kind === 'AST_MATCH_ARM') {
        return 'expression';
    }

    // Declarations
    if (kind === 'AST_FUNC_DECL' || kind === 'AST_METHOD' || kind === 'AST_CLASS' ||
        kind === 'AST_PARAM' || kind === 'AST_PARAM_LIST' || kind === 'AST_PROP_DECL' ||
        kind === 'AST_CONST_DECL' || kind === 'AST_CONST_ELEM' || kind === 'AST_USE' ||
        kind === 'AST_USE_TRAIT' || kind === 'AST_TRAIT_ALIAS' || kind === 'AST_NAMESPACE') {
        return 'declaration';
    }

    // Literals
    if (kind.includes('AST_CONST') || kind === 'AST_MAGIC_CONST' ||
        kind === 'AST_CLASS_CONST') {
        return 'literal';
    }

    // Names
    if (kind === 'AST_NAME' || kind === 'AST_TYPE') {
        return 'name';
    }

    return 'other';
}

// Build JointJS graph from AST - let dagre handle positioning
function buildAstGraph(astNode, parent, graph, childKey) {
    if (!astNode || typeof astNode !== 'object') {
        return;
    }

    var kind = astNode.kind || 'Unknown';
    var category = getNodeCategory(kind);

    // Create compact node label
    var label = kind.replace('AST_', '');

    // Only show line number in label to keep it compact
    if (astNode.lineno) {
        label += '\nL:' + astNode.lineno;
    }

    // Create JointJS element - let dagre position it
    var cell = new joint.shapes.standard.Rectangle({
        size: { width: 90, height: 35 },
        attrs: {
            body: {
                class: 'ast-node-rect ast-node-' + category,
                cursor: 'pointer',
                rx: 4,
                ry: 4
            },
            label: {
                text: label,
                fill: '#212529',
                fontSize: 10,
                fontWeight: 'bold'
            }
        }
    });

    // Store metadata
    cell.astData = astNode;
    cell.astCategory = category;

    // Map line numbers to cells for highlighting
    if (astNode.lineno) {
        if (!astNodeMap.has(astNode.lineno)) {
            astNodeMap.set(astNode.lineno, []);
        }
        astNodeMap.get(astNode.lineno).push(cell);
    }

    graph.addCell(cell);

    // Create link to parent with edge label
    if (parent) {
        var linkAttrs = {
            line: {
                stroke: '#dee2e6',
                strokeWidth: 1,
                targetMarker: {
                    type: 'path',
                    d: 'M 6 -3 0 0 6 3 z',
                    fill: '#dee2e6'
                }
            }
        };

        // Add edge label if childKey is provided
        if (childKey) {
            linkAttrs.label = {
                text: childKey,
                fill: '#6c757d',
                fontSize: 9,
                fontWeight: '600',
                class: 'edge-label'
            };
        }

        var link = new joint.shapes.standard.Link({
            source: { id: parent.id },
            target: { id: cell.id },
            router: {
                name: 'manhattan',
                args: {
                    padding: 10
                }
            },
            connector: { name: 'rounded' },
            attrs: linkAttrs
        });
        graph.addCell(link);
    }

    // Process children recursively
    if (astNode.children) {
        var childKeys = Object.keys(astNode.children);
        for (var i = 0; i < childKeys.length; i++) {
            var key = childKeys[i];
            var child = astNode.children[key];

            if (child && typeof child === 'object' && child.kind) {
                buildAstGraph(child, cell, graph, key);
            }
        }
    }
}

// Render AST visualization
function renderAstVisualization(astData) {
    currentAstData = astData;
    astNodeMap.clear();

    // Clear output area and add canvas with zoom controls
    output_area.innerHTML = '<div id="ast-canvas"></div><div id="ast-zoom-controls"><button id="zoom-in" title="Zoom In">+</button><button id="zoom-out" title="Zoom Out">-</button><button id="zoom-fit" title="Zoom to Fit">⊡</button></div>';
    output_area.classList.add('ast-view');

    var canvas = document.getElementById('ast-canvas');

    // Create JointJS graph and paper
    astGraph = new joint.dia.Graph();

    // Calculate paper dimensions based on content
    var paperWidth = Math.max(output_area.clientWidth, 1000);
    var paperHeight = Math.max(output_area.clientHeight, 2000);

    // Get current theme background color
    var backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--output-bg').trim();

    astPaper = new joint.dia.Paper({
        el: canvas,
        model: astGraph,
        width: paperWidth,
        height: paperHeight,
        gridSize: 10,
        interactive: {
            elementMove: false  // Disable dragging nodes
        },
        background: {
            color: backgroundColor
        }
    });

    // Build graph from AST
    if (astData.ast) {
        buildAstGraph(astData.ast, null, astGraph);
    }

    // Auto-layout using dagre - tree layout left-to-right
    if (typeof joint.layout !== 'undefined' && joint.layout.DirectedGraph) {
        joint.layout.DirectedGraph.layout(astGraph, {
            setLinkVertices: false,
            rankDir: 'LR',
            align: 'UL',
            rankSep: 100,
            nodeSep: 30,
            edgeSep: 10,
            marginX: 30,
            marginY: 30
        });
    }

    // Resize paper to fit content
    var bbox = astGraph.getBBox();
    if (bbox) {
        astPaper.setDimensions(bbox.width + 100, bbox.height + 100);
    }

    // Set up zoom and pan controls
    setupZoomAndPan(canvas);

    // Set up tooltips and click handlers
    setupAstInteractions(canvas);
}

// Set up zoom and pan controls for AST visualization
function setupZoomAndPan(canvas) {
    var currentScale = 1;
    var minScale = 0.1;
    var maxScale = 3;
    var scaleStep = 0.1;

    var isPanning = false;
    var startPoint = { x: 0, y: 0 };
    var currentTranslate = { x: 0, y: 0 };

    // Zoom function
    function zoom(scale, centerX, centerY) {
        var oldScale = currentScale;
        currentScale = Math.max(minScale, Math.min(maxScale, scale));

        if (centerX !== undefined && centerY !== undefined) {
            // Zoom towards the mouse position
            var dx = centerX - (centerX - currentTranslate.x) * (currentScale / oldScale);
            var dy = centerY - (centerY - currentTranslate.y) * (currentScale / oldScale);
            currentTranslate.x = dx;
            currentTranslate.y = dy;
        }

        astPaper.scale(currentScale, currentScale);
        astPaper.translate(currentTranslate.x, currentTranslate.y);

        // Clear tooltip when zooming
        clearAstTooltip();
    }

    // Zoom to fit - using JointJS built-in method
    function zoomToFit() {
        astPaper.scaleContentToFit({
            padding: 20,
            minScale: 0.1,
            maxScale: 2.0,
            scaleGrid: 0.05,
            useModelGeometry: true
        });

        // Get the current transformation to track it
        var scale = astPaper.scale();
        currentScale = scale.sx;
        var translate = astPaper.translate();
        currentTranslate.x = translate.tx;
        currentTranslate.y = translate.ty;
    }

    // Mouse wheel zoom
    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();

        var delta = e.deltaY > 0 ? -scaleStep : scaleStep;
        var rect = canvas.getBoundingClientRect();
        var mouseX = e.clientX - rect.left;
        var mouseY = e.clientY - rect.top;

        zoom(currentScale + delta, mouseX, mouseY);
    }, { passive: false });

    // Panning - only on blank areas
    astPaper.on('blank:pointerdown', function(evt, x, y) {
        isPanning = true;
        startPoint = { x: evt.clientX, y: evt.clientY };
        canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', function(evt) {
        if (!isPanning) return;

        var dx = evt.clientX - startPoint.x;
        var dy = evt.clientY - startPoint.y;

        currentTranslate.x += dx;
        currentTranslate.y += dy;

        astPaper.translate(currentTranslate.x, currentTranslate.y);

        startPoint = { x: evt.clientX, y: evt.clientY };

        // Clear tooltip when panning
        clearAstTooltip();
    });

    canvas.addEventListener('mouseup', function() {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseleave', function() {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
        }
    });

    // Zoom buttons
    document.getElementById('zoom-in').addEventListener('click', function() {
        var rect = canvas.getBoundingClientRect();
        zoom(currentScale + scaleStep, rect.width / 2, rect.height / 2);
    });

    document.getElementById('zoom-out').addEventListener('click', function() {
        var rect = canvas.getBoundingClientRect();
        zoom(currentScale - scaleStep, rect.width / 2, rect.height / 2);
    });

    document.getElementById('zoom-fit').addEventListener('click', function() {
        zoomToFit();
    });

    // Initial zoom to fit
    setTimeout(zoomToFit, 100);
}

// Set up AST node interactions (tooltips, highlighting)
function setupAstInteractions(canvas) {
    // Hover for tooltips
    astPaper.on('element:mouseenter', function(cellView) {
        var cell = cellView.model;
        var astData = cell.astData;

        if (!astData) return;

        // Clear any existing tooltip first
        clearAstTooltip();

        // Create tooltip
        astTooltip = document.createElement('div');
        astTooltip.className = 'ast-tooltip';

        var html = '<div class="tooltip-kind">' + (astData.kind || 'Unknown') + '</div>';

        if (astData.lineno) {
            html += '<div class="tooltip-property"><span class="tooltip-label">Line:</span> <span class="tooltip-value">' + astData.lineno;
            if (astData.endLineno && astData.endLineno !== astData.lineno) {
                html += '-' + astData.endLineno;
            }
            html += '</span></div>';
        }

        if (astData.flags !== undefined) {
            html += '<div class="tooltip-property"><span class="tooltip-label">Flags:</span> <span class="tooltip-value">' +
                    (astData.flags_formatted || astData.flags) + '</span></div>';
        }

        if (astData.children) {
            var childCount = Object.keys(astData.children).length;
            html += '<div class="tooltip-property"><span class="tooltip-label">Children:</span> <span class="tooltip-value">' +
                    childCount + '</span></div>';
        }

        astTooltip.innerHTML = html;
        document.body.appendChild(astTooltip);

        // Position tooltip relative to viewport using actual element position
        var elementRect = cellView.el.getBoundingClientRect();

        astTooltip.style.left = (elementRect.right + 10) + 'px';
        astTooltip.style.top = elementRect.top + 'px';
    });

    astPaper.on('element:mouseleave', function() {
        clearAstTooltip();
    });

    // Clear tooltip when hovering over blank area
    astPaper.on('blank:mouseenter', function() {
        clearAstTooltip();
    });

    // Clear tooltip on any paper interaction
    astPaper.on('blank:pointerdown', function() {
        clearAstTooltip();
    });

    // Clear tooltip when scrolling
    canvas.addEventListener('scroll', function() {
        clearAstTooltip();
    });

    // Clear tooltip when mouse leaves the canvas entirely
    canvas.addEventListener('mouseleave', function() {
        clearAstTooltip();
    });

    // Click to highlight in editor
    astPaper.on('element:pointerclick', function(cellView, evt) {
        var cell = cellView.model;
        var astData = cell.astData;

        // Clear tooltip on any click
        clearAstTooltip();

        // Highlight in editor
        if (astData && astData.lineno) {
            highlightEditorLineFromAst(astData.lineno, astData.endLineno);
        }
    });
}

// Highlight editor line from AST node click
var currentEditorHighlightFromAst = null;

function highlightEditorLineFromAst(startLine, endLine) {
    // Remove previous highlight
    if (currentEditorHighlightFromAst) {
        editor.session.removeMarker(currentEditorHighlightFromAst);
    }

    // Add new highlight
    if (startLine) {
        var Range = ace.require('ace/range').Range;
        var end = endLine || startLine;
        currentEditorHighlightFromAst = editor.session.addMarker(
            new Range(startLine - 1, 0, end - 1, 1000),
            'ace-highlight-line',
            'fullLine'
        );

        // Scroll to line
        editor.scrollToLine(startLine - 1, true, true, function() {});
        editor.gotoLine(startLine, 0, true);
    }
}

// Highlight AST nodes from editor cursor position
function highlightAstNodesFromEditor() {
    if (!astPaper || !currentAstData) return;

    var cursorPos = editor.getCursorPosition();
    var lineNum = cursorPos.row + 1;

    // Clear all highlights
    astGraph.getCells().forEach(function(cell) {
        if (cell.isElement && cell.isElement()) {
            cell.removeAttr('body/class', { rewrite: true });
            var category = cell.astCategory || 'other';
            cell.attr('body/class', 'ast-node-rect ast-node-' + category);
        }
    });

    // Highlight nodes at current line
    if (astNodeMap.has(lineNum)) {
        var cells = astNodeMap.get(lineNum);
        cells.forEach(function(cell) {
            var category = cell.astCategory || 'other';
            cell.attr('body/class', 'ast-node-rect ast-node-' + category + ' ast-node-highlighted');

            // Scroll first node into view
            if (cells.indexOf(cell) === 0) {
                var cellView = astPaper.findViewByModel(cell);
                if (cellView) {
                    var bbox = cellView.getBBox();
                    // Scroll the output area to show the highlighted node
                    output_area.scrollTop = Math.max(0, bbox.y - 100);
                    output_area.scrollLeft = Math.max(0, bbox.x - 50);
                }
            }
        });
    }
}

// AST button click handler
function initAstVisualization() {
    ast_button.addEventListener('click', function() {
        if (!isUsable) {
            console.log('skipping due to already running');
            return;
        }
        isUsable = false;
        output_area.innerText = '';
        output_area.classList.remove('opcode-view');
        ast_button.textContent = "Generating AST";
        disableButtons();

        var code = editor.getValue();
        var astWrapper = document.getElementById('ast_dumper_source').innerText;
        code = "?>" + code;

        // Run AST dumper
        var contentsFragment = 'rawurldecode("' + encodeURIComponent(code) + '")';
        var astCode = astWrapper.replace('$CONTENTS_TO_ANALYZE', contentsFragment);

        combinedOutput = '';
        combinedHTMLOutput = '';

        lazyGenerateNewPHPModule(function() {
            let ret = phpModule.ccall('pib_eval', 'number', ["string"], [astCode]);
            console.log('AST generation complete', ret);

            if (ret == 0 && combinedHTMLOutput) {
                try {
                    // Strip stderr output (wrapped in <span class="stderr">) before parsing JSON
                    var cleanOutput = combinedHTMLOutput.replace(/<span class="stderr">.*?<\/span>\n?/gs, '').trim();

                    if (!cleanOutput) {
                        console.error('No JSON output after filtering stderr');
                        output_area.innerText = 'Failed to generate AST. No output received.';
                    } else {
                        var astData = JSON.parse(cleanOutput);
                        console.log('AST data:', astData);

                        // Render in output area
                        renderAstVisualization(astData);

                        // Set up cursor tracking
                        editor.selection.on('changeCursor', highlightAstNodesFromEditor);
                        highlightAstNodesFromEditor(); // Initial highlight
                    }

                } catch (e) {
                    console.error('Failed to parse AST JSON:', e);
                    console.error('Raw output:', combinedHTMLOutput);
                    console.error('Cleaned output:', cleanOutput);
                    output_area.innerText = 'Failed to parse AST data: ' + e.message + '\n\nCheck browser console for details.';
                }
            } else {
                console.error('AST generation failed or no output');
                output_area.innerText = 'Failed to generate AST. Check console for errors.';
            }

            // Cleanup and reset
            try {
                phpModule._pib_force_exit();
            } catch (e) {
                // ExitStatus expected
            }
            phpModule = null;
            phpModuleDidLoad = false;
            // Clear cached phar records since the module will be re-created
            loadedPharFiles = {};
            enableButtons();
            ast_button.textContent = "AST";
            isUsable = true;
            lazyGenerateNewPHPModule();
        });
    });

    opcodes_button.addEventListener('click', function() {
        if (!isUsable) {
            console.log('skipping due to already running');
            return;
        }
        isUsable = false;
        output_area.innerText = '';
        output_area.classList.remove('ast-view');
        output_area.classList.remove('opcode-view');
        // Remove AST cursor tracking if active
        editor.selection.removeListener('changeCursor', highlightAstNodesFromEditor);
        if (currentEditorHighlightFromAst) {
            editor.session.removeMarker(currentEditorHighlightFromAst);
            currentEditorHighlightFromAst = null;
        }
        // Remove opcode cursor tracking if active
        if (window.highlightOpcodesForCurrentLine) {
            editor.selection.removeListener('changeCursor', window.highlightOpcodesForCurrentLine);
            window.highlightOpcodesForCurrentLine = null;
        }
        opcodes_button.textContent = "Generating Opcodes";
        disableButtons();

        var code = editor.getValue();
        // Strip any existing PHP tags from user code
        code = code.replace(/^<\?php\s*/i, '').replace(/\?>\s*$/i, '').trim();

        combinedOutput = '';
        combinedHTMLOutput = '';

        // Force cleanup of current module to create new one with VLD enabled
        if (phpModule) {
            try {
                phpModule._pib_force_exit();
            } catch (e) {
                // ExitStatus expected
            }
            phpModule = null;
        }
        phpModuleDidLoad = false;

        // Create a new PHP module with VLD enabled via php.ini
        generateNewPHPModule().then(function(newPHPModule) {
            phpModule = newPHPModule;
            phpModuleDidLoad = true;

            // Create php.ini with VLD settings in the virtual filesystem
            var phpIniContent =
                "vld.active=1\n" +
                "vld.execute=0\n" +
                "vld.verbosity=1\n" +
                "vld.dump_paths=0\n";

            phpModule.FS.writeFile('/php.ini', phpIniContent);
            console.log('Created /php.ini with VLD settings');

            // Run user code directly - VLD will dump its opcodes
            let ret = phpModule.ccall('pib_eval', 'number', ["string"], [code]);
            console.log('Opcode generation complete', ret);

            // VLD outputs to stdout/stderr
            if (combinedOutput || combinedHTMLOutput) {
                // Strip HTML tags from the output
                var temp = document.createElement('div');
                temp.innerHTML = combinedHTMLOutput || combinedOutput;
                var text = temp.textContent || temp.innerText;

                // Filter and parse VLD output
                // First, strip out all PHP error/warning messages (which may span multiple lines)
                // Match lines starting with error types and any continuation lines (lines containing " in PIB on line")
                text = text.replace(/^(Deprecated|Warning|Notice|Fatal error|Parse error):.*$/gm, '');
                text = text.replace(/^.*\s+in PIB on line \d+.*$/gm, '');

                var lines = text.split('\n');
                var html = '';

                lines.forEach(function(line) {
                    // Skip empty lines
                    if (line.trim() === '') return;
                    // Remove "filename: PIB" lines
                    if (line.match(/^filename:\s+PIB\s*$/)) return;
                    // Remove "function name: (null)" lines
                    if (line.match(/^function name:\s+\(null\)\s*$/)) return;

                    // Check if this is an opcode line with a line number
                    // Format: "    6     0*       NEW ..."
                    var opcodeMatch = line.match(/^(\s+)(\d+)(\s+\d+\*\s+.*)$/);
                    if (opcodeMatch) {
                        var indent = opcodeMatch[1];
                        var lineNum = opcodeMatch[2];
                        var rest = opcodeMatch[3];

                        html += '<div class="opcode-line">';
                        html += '<span class="opcode-line-number" data-line="' + lineNum + '">' +
                                indent + lineNum + '</span>';
                        html += '<span class="opcode-content">' + htmlescape(rest) + '</span>';
                        html += '</div>';
                    } else {
                        // Regular line (headers, separators, etc.)
                        html += '<div class="opcode-text">' + htmlescape(line) + '</div>';
                    }
                });

                output_area.innerHTML = html;
                output_area.classList.add('opcode-view');

                // Track editor highlight for opcodes
                var currentOpcodeEditorHighlight = null;
                function highlightEditorLineFromOpcode(lineNum) {
                    if (currentOpcodeEditorHighlight) {
                        editor.session.removeMarker(currentOpcodeEditorHighlight);
                        currentOpcodeEditorHighlight = null;
                    }
                    if (lineNum !== null) {
                        var Range = ace.require('ace/range').Range;
                        currentOpcodeEditorHighlight = editor.session.addMarker(
                            new Range(lineNum - 1, 0, lineNum - 1, 1000),
                            'ace-highlight-line',
                            'fullLine'
                        );
                    }
                }

                // Add click and hover handlers for opcode lines
                var opcodeLines = output_area.querySelectorAll('.opcode-line');
                opcodeLines.forEach(function(elem) {
                    var lineNumSpan = elem.querySelector('.opcode-line-number');
                    if (lineNumSpan) {
                        var line = parseInt(lineNumSpan.getAttribute('data-line'));

                        // Click handler
                        elem.addEventListener('click', function() {
                            if (!isNaN(line) && line > 0) {
                                editor.gotoLine(line, 0, true);
                                editor.focus();
                            }
                        });

                        // Hover handlers - highlight both opcode line and editor line
                        elem.addEventListener('mouseenter', function() {
                            if (!isNaN(line) && line > 0) {
                                elem.classList.add('hovered');
                                highlightEditorLineFromOpcode(line);
                            }
                        });

                        elem.addEventListener('mouseleave', function() {
                            elem.classList.remove('hovered');
                            highlightEditorLineFromOpcode(null);
                        });
                    }
                });

                // Highlight opcodes for current editor line
                window.highlightOpcodesForCurrentLine = function() {
                    var cursorPos = editor.getCursorPosition();
                    var lineNum = cursorPos.row + 1;

                    var opcodeDivs = output_area.querySelectorAll('.opcode-line');
                    opcodeDivs.forEach(function(div) {
                        var lineNumSpan = div.querySelector('.opcode-line-number');
                        if (lineNumSpan) {
                            var opLineNum = parseInt(lineNumSpan.getAttribute('data-line'));
                            if (opLineNum === lineNum) {
                                div.classList.add('highlighted');
                                // Scroll into view if needed
                                if (div.offsetTop < output_area.scrollTop ||
                                    div.offsetTop > output_area.scrollTop + output_area.clientHeight) {
                                    div.scrollIntoView({block: 'nearest', behavior: 'smooth'});
                                }
                            } else {
                                div.classList.remove('highlighted');
                            }
                        }
                    });
                };

                // Listen for cursor position changes
                editor.selection.on('changeCursor', window.highlightOpcodesForCurrentLine);
                // Initial highlight
                window.highlightOpcodesForCurrentLine();
            } else {
                output_area.innerText = 'No opcode output generated.';
            }

            // Cleanup and reset
            try {
                phpModule._pib_force_exit();
            } catch (e) {
                // ExitStatus expected
            }
            phpModule = null;
            phpModuleDidLoad = false;

            // Clear loaded phar tracking since the new module will have a fresh virtual filesystem
            loadedPharFiles = {};

            enableButtons();
            opcodes_button.textContent = "Opcodes";
            isUsable = true;
            lazyGenerateNewPHPModule();
        });
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

    console.log('Loading phar manifest for cache-busting');
    fetchPharManifest(function() {
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
                    initAstVisualization();

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
    });
}
