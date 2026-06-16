<?php

require __DIR__ . '/_bootstrap.php';

jsonResponse([
    'ws_host' => env('WS_HOST', '127.0.0.1'),
    'ws_port' => (int) env('WS_PORT', '3001'),
]);
