<?php
use Phan\Config;
use Phan\Issue;
use Phan\IssueInstance;
use Phan\Output\HTML;
use Phan\Output\IssuePrinterInterface;
use Symfony\Component\Console\Output\OutputInterface;


use Phan\CLI;
use Phan\Phan;
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

try {
    $phar = 'phar://phan-2.2.6.phar';
    gc_disable();
    $data = require($phar . '/src/Phan/Language/Internal/ClassDocumentationMap.php');
    require_once($phar . '/src/requirements.php');

$code_base = require_once($phar . '/src/codebase.php');

require_once($phar . '/src/Phan/Bootstrap.php');


file_put_contents('input', rawurldecode(""));
Config::setValue('file_list', ['input']);

$cli = CLI::fromRawValues([
    'output-mode' => 'html',
    'allow-polyfill-parser' => false,
    'redundant-condition-detection' => false,
    'dead-code-detection' => false,
], []);

// Analyze the file list provided via the CLI
$is_issue_found = Phan::analyzeFileList(
    $code_base,
    function (bool $recompute_file_list = false) use ($cli) : array {
        return $cli->getFileList();
    }
);
} catch (\Throwable $e) {
    echo "Caught $e\n";
}

echo PHP_EOL;
