<?php

echo "Loading\n";
try {
    require_once 'phar://phan-1.0.1.phar/src/requirements.php';
} catch (Throwable $e) {
    echo $e;
}

echo "Loaded\n";
/*
<?php
set_error_handler(function ($e) {
    echo "Caught\n";
    echo "$e\n";

});
set_exception_handler(function ($e) {
    echo "Caught\n";
    echo "$e\n";

});
echo "Calling setcwd\n";
setcwd();
try {
throw new Error("test");
} catch (Error $e) {
    echo "Caught exception\n";
    echo $e;
}
chdir('/');
echo "Loading\n";
try {
    require_once 'phar://phan-1.0.1.phar/src/reddquirements.php';
} catch (Throwable $e) {
    echo $e;
}

echo "Loaded\n";
*/
