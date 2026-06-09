<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$apiFile = __DIR__ . $path;

if (str_starts_with($path, '/api/') && is_file($apiFile)) {
    require $apiFile;
    return true;
}

$publicFile = __DIR__ . '/public' . $path;

if ($path !== '/' && is_file($publicFile)) {
    return false;
}

require __DIR__ . '/public/index.php';
return true;
