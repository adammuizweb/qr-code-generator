<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$GLOBALS['_jqrg_hooks'] = [];
$GLOBALS['_jqrg_locale'] = 'en';
$GLOBALS['_jqrg_can_generate'] = true;

define('PLUGIN_SYSTEM_LOADED', true);
define('ADMIN_BASE_PATH', '/hidden-admin');
function __(string $source): string { return $source; }
function get_locale(): string { return (string)$GLOBALS['_jqrg_locale']; }
function add_action(string $name, callable $callback, int $priority = 10): void
{
    $GLOBALS['_jqrg_hooks'][$name][] = ['callback' => $callback, 'priority' => $priority];
}
function add_filter(string $name, callable $callback, int $priority = 10): void
{
    $GLOBALS['_jqrg_hooks'][$name][] = ['callback' => $callback, 'priority' => $priority];
}
function user_can(PDO $pdo, int $userId, string $permission, array $context = []): bool
{
    return $GLOBALS['_jqrg_can_generate'] && $userId === 7 && $permission === 'plugin.qr-code-generator.codes.generate';
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
$check(($manifest['requires']['jyavani'] ?? null) === '>=2.3.147', 'minimum Core version provides content row actions and isolated media selection');
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
$check(($manifest['dependencies']['js'] ?? null) === ['modal-helpers', 'media-selector'], 'Media Gallery dependencies use Core-owned asset IDs');
$check(isset($GLOBALS['_jqrg_hooks']['admin_head']), 'route-scoped dashboard assets are registered');
$check(isset($GLOBALS['_jqrg_hooks']['admin_content_row_actions']), 'published content row-action integration is registered');

$pdo = new PDO('sqlite::memory:');
$items = jqrg_content_row_actions([], ['title' => 'Public article'], [
    'content_type' => 'article', 'actor_id' => 7, 'status' => 'published', 'is_public' => true, 'public_url' => '/article/',
], $pdo);
$check(count($items) === 1
    && ($items[0]['key'] ?? '') === 'qr-code-generator.create'
    && str_contains((string)($items[0]['url'] ?? ''), '/hidden-admin/?page=admin%2Ftools%2Fqr-code-generator')
    && str_contains((string)($items[0]['url'] ?? ''), '#jqrg_url=%2Farticle%2F')
    && !str_contains((string)($items[0]['url'] ?? ''), '&jqrg_url='), 'published content receives a browser-only permission-aware prefilled QR action');
$check(jqrg_public_path('//evil.test/') === null && jqrg_public_path('https://evil.test/') === null
    && jqrg_public_path('/safe/%252e%252e/admin/') === null
    && jqrg_public_path('/%252f%252fevil.test/') === null
    && jqrg_public_path('/safe/%0dheader/') === null
    && jqrg_public_path('/safe/path/') === '/safe/path/', 'row actions accept only safe root-relative public paths');
$check(jqrg_content_row_actions([], ['title' => 'Draft'], [
    'content_type' => 'page', 'actor_id' => 7, 'status' => 'draft', 'is_public' => false, 'public_url' => '/draft/',
], $pdo) === [], 'non-public content does not receive a QR action');
$GLOBALS['_jqrg_can_generate'] = false;
$check(jqrg_content_row_actions([], ['title' => 'Public page'], [
    'content_type' => 'page', 'actor_id' => 7, 'status' => 'published', 'is_public' => true, 'public_url' => '/page/',
], $pdo) === [], 'row action requires the plugin generation permission');
$GLOBALS['_jqrg_can_generate'] = true;

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
$check(substr_count($adminSource, 'role="tooltip"') === 6
    && str_contains($adminSource, 'id="jqrg-type-help"')
    && str_contains($browserSource, "messages.typeHelp[type.value]"), 'accessible tooltips and contextual payload guidance are wired');
$check(str_contains($adminSource, 'id="jqrg-center-image-choose"')
    && str_contains($browserSource, 'global.openMediaSelector({')
    && str_contains($browserSource, "selection_mode: 'immediate'")
    && str_contains($browserSource, 'scheduleGenerate'), 'Media Gallery image and live-preview controls are wired');
$check(str_contains($adminSource, 'id="jqrg-center-image-background-mode"')
    && str_contains($adminSource, 'id="jqrg-center-image-background-color"')
    && str_contains($adminSource, 'id="jqrg-center-image-radius"'), 'center image background, transparency, and radius controls are rendered');
$check(str_contains($adminSource, 'id="jqrg-preset-select"')
    && str_contains($browserSource, "presetStorageKey = 'jqrg.visualPresets.v1'")
    && substr_count($browserSource, 'global.localStorage.') === 2, 'visual presets use one bounded browser-local storage namespace');
$check(str_contains($adminSource, 'id="jqrg-frame-radius"')
    && str_contains($browserSource, 'jqrg-frame-clip')
    && str_contains($browserSource, 'framePadding')
    && str_contains($browserSource, 'context.clearRect(0, 0, outputSize, outputSize)'), 'rounded transparent PNG and SVG frame controls are wired');
$check(!str_contains($adminSource, "\$_GET['jqrg_url']")
    && str_contains($browserSource, "prefix = '#jqrg_url='")
    && str_contains($browserSource, 'global.history.replaceState'), 'prefilled payload stays in the browser fragment and is removed after reading');
$check(!preg_match('/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/', $browserSource), 'browser runtime has no payload transport API');
$check(!preg_match('/\b(?:sessionStorage|indexedDB)\b/', $browserSource)
    && !str_contains($browserSource, 'localStorage.setItem(presetStorageKey, currentPayload)')
    && !str_contains($browserSource, 'localStorage.setItem(presetStorageKey, centerImageUrl'), 'browser storage never receives payloads or selected image URLs');
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
