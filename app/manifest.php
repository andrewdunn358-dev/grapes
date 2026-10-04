<?php
require __DIR__ . '/lib.php';
header('Content-Type: application/manifest+json');
$logo = logo_file();
$icons = $logo
    ? [['src' => $logo, 'sizes' => 'any', 'purpose' => 'any']]
    : [['src' => 'icon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml', 'purpose' => 'any']];
echo json_encode([
    'name' => 'The Grapes Keeper',
    'short_name' => 'Grapes Keeper',
    'start_url' => './',
    'display' => 'standalone',
    'background_color' => '#f4f1f0',
    'theme_color' => '#411111',
    'icons' => $icons,
], JSON_UNESCAPED_SLASHES);
