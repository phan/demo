<?php


use Phan\CLI;
use Phan\Phan;
use Phan\Config;

try {
    var_export($_SERVER['argv'] = ['-a', '-b']);
    var_export(getopt('ab'));
    //require 'phar://phan-1.0.1.phar';

    $phar = 'phar://phan-1.0.1.phar';


// Phan does a ton of GC and this offers a major speed
// improvement if your system can handle it (which it
// should be able to)
gc_disable();

// Check the environment to make sure Phan can run successfully
require_once($phar . '/src/requirements.php');

// Build a code base based on PHP internally defined
// functions, methods and classes before loading our
// own
$code_base = require_once($phar . '/src/codebase.php');

require_once($phar . '/src/Phan/Bootstrap.php');


if (extension_loaded('ast')) {
    // Warn if the php-ast version is too low.
    $ast_version = (new ReflectionExtension('ast'))->getVersion();
    if (version_compare($ast_version, '0.1.5') < 0) {
        fprintf(STDERR, "Phan supports php-ast version 0.1.5 or newer, but the installed php-ast version is $ast_version. You may see bugs in some edge cases\n");
    }
}
echo "Creating temp file\n";
file_put_contents('/Zend/fail.php', '<'.'?php echo 2 2;');
Config::setValue('directory_list', ['/Zend']);

// Create our CLI interface and load arguments
// $cli = new CLI();

// Analyze the file list provided via the CLI
$is_issue_found =
    Phan::analyzeFileList(
        $code_base,
        function (bool $recompute_file_list = false) use ($cli) : array {
            if ($recompute_file_list) {
                $cli->recomputeFileList();
            }
            return $cli->getFileList();
        }  // Daemon mode will reload the file list.
    );

// Provide an exit status code based on if
// issues were found
exit($is_issue_found ? EXIT_ISSUES_FOUND : EXIT_SUCCESS);

} catch (Throwable $e) {
    echo "Caught\n";
    echo $e;
}
