<?php
function is_prime(int $x) {
    if ($x < 2) { return false; }
    for ($i = 2; $i * $i <= $x; $i++) {
        if ($x % $i === 0) {
            return false;
        }
    }
    return true;
}
for ($i = 0; $i < 20; $i++) {
    printf("%d is prime: %s\n", $i, json_encode(is_prime($i)));
}
fwrite(STDERR, "Done\n");
