<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$GLOBALS['_jqrg_hooks'] = [];
$GLOBALS['_jqrg_locale'] = 'en';

define('PLUGIN_SYSTEM_LOADED', true);
function __(string $source): string { return $source; }
function get_locale(): string { return (string)$GLOBALS['_jqrg_locale']; }
function add_action(string $name, callable $callback, int $priority = 10): void
{
    $GLOBALS['_jqrg_hooks'][$name][] = ['callback' => $callback, 'priority' => $priority];
}

require_once $root . '/plugin.php';

$failures = [];
$check = static function (bool $passed, string $message) use (&$failures): void {
    echo ($passed ? 'PASS' : 'FAIL') . ' ' . $message . PHP_EOL;
    if (!$passed) $failures[] = $message;
};

$manifestJson = (string)file_get_contents($root . '/plugin.json');
$manifest = json_decode($manifestJson, true, 512, JSON_THROW_ON_ERROR);
$manifestObject = json_decode($manifestJson, false, 512, JSON_THROW_ON_ERROR);
$check(($manifest['name'] ?? null) === 'qr-code-generator', 'plugin slug is stable');
$check(($manifest['version'] ?? null) === JQRG_VERSION, 'manifest and runtime versions match');
$check(($manifest['requires']['jyavani'] ?? null) === '>=2.3.74', 'minimum Core version is explicit');
$check(($manifestObject->requires->plugins ?? null) instanceof stdClass, 'plugin dependencies use an object map');

$permission = $manifest['permissions'][0] ?? [];
$page = $manifest['admin']['pages'][0] ?? [];
$navigation = $manifest['admin']['nav'][0] ?? [];
$check(($permission['key'] ?? '') === 'plugin.qr-code-generator.codes.generate'
    && ($permission['default_roles'] ?? null) === ['admin']
    && ($permission['delegable'] ?? null) === true, 'generation permission is declared and delegable');
$check(($page['route'] ?? '') === JQRG_ROUTE
    && ($page['file'] ?? '') === 'admin/index.php'
    && ($page['permission'] ?? '') === $permission['key'], 'dashboard route uses the declared permission');
$check(($navigation['page'] ?? '') === JQRG_ROUTE && ($navigation['parent'] ?? '') === 'tools', 'navigation points to the owned Tools route');
$check(isset($GLOBALS['_jqrg_hooks']['admin_head']), 'route-scoped dashboard assets are registered');

$_GET['page'] = 'admin/tools/another-plugin';
ob_start();
jqrg_admin_assets();
$unrelatedAssets = (string)ob_get_clean();
$check($unrelatedAssets === '', 'assets do not load on unrelated dashboard routes');
$_GET['page'] = JQRG_ROUTE;
ob_start();
jqrg_admin_assets();
$ownedAssets = (string)ob_get_clean();
$check(str_contains($ownedAssets, '/static/plugins/qr-code-generator/admin.css?v=' . JQRG_VERSION)
    && str_contains($ownedAssets, '/static/plugins/qr-code-generator/qrcode.js?v=' . JQRG_VERSION)
    && str_contains($ownedAssets, '/static/plugins/qr-code-generator/admin.js?v=' . JQRG_VERSION), 'owned route loads each versioned static asset');

$staticSources = [];
foreach ($manifest['static']['copy'] ?? [] as $entry) {
    $source = (string)($entry['from'] ?? '');
    $destination = (string)($entry['to'] ?? '');
    $staticSources[] = $source;
    $check(str_starts_with($destination, 'static/plugins/qr-code-generator/'), 'static destination stays in the plugin namespace');
    $check(is_file($root . '/' . $source) && !is_link($root . '/' . $source), 'declared static source exists and is a regular file');
}
$check(count($staticSources) === count(array_unique($staticSources)), 'static source declarations are unique');
$check(hash_file('sha256', $root . '/assets/vendor/qrcode.js') === '1d24c1c0679d1f406bc0eaeeb79d908681775e42597142214e7fe73261e6eb04', 'vendored encoder matches the reviewed local checksum');

$adminSource = (string)file_get_contents($root . '/admin/index.php');
$browserSource = (string)file_get_contents($root . '/assets/js/admin.js');
$check(str_contains($adminSource, "adiwira_require_permission(\$pdo, 'plugin.qr-code-generator.codes.generate', false)"), 'dashboard page enforces permission server-side');
$check(!preg_match('/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/', $browserSource), 'browser runtime has no payload transport API');
$check(!preg_match('/\b(?:localStorage|sessionStorage|indexedDB)\b/', $browserSource), 'browser runtime does not persist payloads');
$check(!isset($manifest['migrations']) && !isset($manifest['frontend']), 'plugin declares no database migrations or frontend routes');

$translationSources = [];
foreach (['plugin.php', 'admin/index.php'] as $relative) {
    $source = (string)file_get_contents($root . '/' . $relative);
    preg_match_all("/jqrg_t\\('((?:[^'\\\\]|\\\\.)*)'/", $source, $matches);
    foreach ($matches[1] ?? [] as $message) $translationSources[stripcslashes($message)] = true;
}
foreach (['id', 'de'] as $locale) {
    $catalog = require $root . '/languages/' . $locale . '.php';
    $missing = array_diff(array_keys($translationSources), array_keys($catalog));
    $check($missing === [], $locale . ' catalog covers every dashboard string');
}
$GLOBALS['_jqrg_locale'] = 'id';
$check(jqrg_t('QR Code Generator') === 'Generator Kode QR', 'Indonesian catalog is available');
$GLOBALS['_jqrg_locale'] = 'de';
$check(jqrg_t('QR Code Generator') === 'QR-Code-Generator', 'German catalog is available');

if ($failures !== []) {
    fwrite(STDERR, count($failures) . " contract check(s) failed.\n");
    exit(1);
}
echo "RESULT: ALL PASS\n";
