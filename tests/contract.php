<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$GLOBALS['_jqrg_hooks'] = [];
$GLOBALS['_jqrg_locale'] = 'en';
$GLOBALS['_jqrg_can_generate'] = true;
$GLOBALS['_jqrg_can_manage'] = true;
$GLOBALS['_jqrg_setting'] = '';
$GLOBALS['_jqrg_category_permalink'] = '/category/fallback/';
$GLOBALS['_jqrg_category_permalink_throws'] = false;

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
    if ($userId !== 7) return false;
    if ($permission === 'plugin.qr-code-generator.codes.generate') return $GLOBALS['_jqrg_can_generate'];
    if ($permission === 'plugin.qr-code-generator.presets.manage') return $GLOBALS['_jqrg_can_manage'];
    return false;
}
function settings_get(PDO $pdo, string $key, ?string $default = null): ?string { return $GLOBALS['_jqrg_setting'] ?: $default; }
function csrf_token(): string { return 'contract-token'; }
function get_category_permalink(PDO $pdo, array $category, int $page = 1, string $query = ''): string
{
    if ($GLOBALS['_jqrg_category_permalink_throws']) throw new RuntimeException('permalink failure');
    return (string)$GLOBALS['_jqrg_category_permalink'];
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
$check(($manifest['requires']['jyavani'] ?? null) === '>=2.3.152', 'minimum Core version provides validated asset detail actions');
$check(($manifestObject->requires->plugins ?? null) instanceof stdClass, 'plugin dependencies use an object map');

$permission = $manifest['permissions'][0] ?? [];
$presetPermission = $manifest['permissions'][1] ?? [];
$page = $manifest['admin']['pages'][0] ?? [];
$presetPage = $manifest['admin']['pages'][1] ?? [];
$navigation = $manifest['admin']['nav'][0] ?? [];
$check(($permission['key'] ?? '') === 'plugin.qr-code-generator.codes.generate'
    && ($permission['default_roles'] ?? null) === ['admin']
    && ($permission['delegable'] ?? null) === true, 'generation permission is declared and delegable');
$check(($presetPermission['key'] ?? '') === 'plugin.qr-code-generator.presets.manage'
    && ($presetPermission['default_roles'] ?? null) === ['admin']
    && ($presetPermission['delegable'] ?? null) === true, 'Site Default Preset has a dedicated delegable permission');
$check(($page['route'] ?? '') === JQRG_ROUTE
    && ($page['file'] ?? '') === 'admin/index.php'
    && ($page['permission'] ?? '') === $permission['key'], 'dashboard route uses the declared permission');
$check(($presetPage['route'] ?? '') === JQRG_DEFAULT_PRESET_ROUTE
    && ($presetPage['file'] ?? '') === 'admin/default-preset.php'
    && ($presetPage['hidden'] ?? null) === true
    && ($presetPage['permission'] ?? '') === $presetPermission['key'], 'Site Default Preset endpoint is hidden and permission guarded');
$check(($navigation['page'] ?? '') === JQRG_ROUTE && ($navigation['parent'] ?? '') === 'tools', 'navigation points to the owned Tools route');
$check(($manifest['dependencies']['js'] ?? null) === ['modal-helpers', 'media-selector'], 'Media Gallery dependencies use Core-owned asset IDs');
$check(isset($GLOBALS['_jqrg_hooks']['admin_head']), 'route-scoped dashboard assets are registered');
$check(isset($GLOBALS['_jqrg_hooks']['admin_content_row_actions']), 'content row-action integration is registered');
$check(isset($GLOBALS['_jqrg_hooks']['admin_category_row_actions']), 'category row-action integration is registered');
$check(isset($GLOBALS['_jqrg_hooks']['admin_asset_detail_actions']), 'asset detail integration is registered');

$pdo = new PDO('sqlite::memory:');
$items = jqrg_content_row_actions([], ['title' => 'Public article'], [
    'content_type' => 'article', 'actor_id' => 7, 'status' => 'published', 'is_public' => true, 'public_url' => '/article/',
], $pdo);
$check(count($items) === 1
    && ($items[0]['key'] ?? '') === 'qr-code-generator.create'
    && str_contains((string)($items[0]['url'] ?? ''), '/hidden-admin/?page=admin%2Ftools%2Fqr-code-generator')
    && str_contains((string)($items[0]['url'] ?? ''), '#jqrg_url=%2Farticle%2F')
    && !str_contains((string)($items[0]['url'] ?? ''), '&jqrg_url='), 'published content receives a browser-only permission-aware prefilled QR action');
$privateItems = jqrg_content_row_actions([], ['title' => 'Private page'], [
    'content_type' => 'page', 'actor_id' => 7, 'status' => 'private', 'is_public' => false, 'public_url' => '/private-page/',
], $pdo);
$scheduledItems = jqrg_content_row_actions([], ['title' => 'Scheduled Theme Content'], [
    'content_type' => 'theme', 'actor_id' => 7, 'status' => 'scheduled', 'is_public' => false, 'public_url' => '/scheduled-theme/',
], $pdo);
$check(count($privateItems) === 1 && count($scheduledItems) === 1,
    'private and scheduled content receive QR actions for their canonical paths');
$check(jqrg_public_path('//evil.test/') === null && jqrg_public_path('https://evil.test/') === null
    && jqrg_public_path('/safe/%252e%252e/admin/') === null
    && jqrg_public_path('/%252f%252fevil.test/') === null
    && jqrg_public_path('/safe/%0dheader/') === null
    && jqrg_public_path('/safe/path/') === '/safe/path/', 'row actions accept only safe root-relative public paths');
$check(jqrg_visual_settings_are_quick_safe(jqrg_sanitize_visual_settings([]))
    && !jqrg_visual_settings_are_quick_safe(jqrg_sanitize_visual_settings(['foreground' => '#ffffff', 'background' => '#000000']))
    && !jqrg_visual_settings_are_quick_safe(jqrg_sanitize_visual_settings(['foreground' => '#777777', 'background' => '#888888'])), 'Site Default Preset requires scanner-safe contrast and polarity');
$check(jqrg_content_row_actions([], ['title' => 'Draft'], [
    'content_type' => 'page', 'actor_id' => 7, 'status' => 'draft', 'is_public' => false, 'public_url' => '/draft/',
], $pdo) === [] && jqrg_content_row_actions([], ['title' => 'Unknown'], [
    'content_type' => 'page', 'actor_id' => 7, 'status' => 'unknown', 'is_public' => false, 'public_url' => '/unknown/',
], $pdo) === [], 'draft and unknown content statuses do not receive a QR action');

ob_start();
jqrg_category_row_actions([
    'name' => 'Localized <Category>',
    'display_url' => '/de/kategorie/lokal/',
], ['actor_id' => 7, 'can_update' => true], $pdo);
$localizedCategoryAction = (string)ob_get_clean();
$check(str_contains($localizedCategoryAction, '<span class="muted-divider">|</span>')
    && str_contains($localizedCategoryAction, 'class="adam-ubah"')
    && str_contains($localizedCategoryAction, '#jqrg_url=%2Fde%2Fkategorie%2Flokal%2F')
    && str_contains($localizedCategoryAction, 'Localized &lt;Category&gt;')
    && !str_contains($localizedCategoryAction, '&jqrg_url='),
    'category actions preserve safe localized paths, escaping, and row-action separation');
$GLOBALS['_jqrg_category_permalink'] = '/category/canonical-child/';
ob_start();
jqrg_category_row_actions(['name' => 'Fallback', 'display_url' => '//unsafe.test/'], [
    'actor_id' => 7, 'can_update' => false,
], $pdo);
$fallbackCategoryAction = (string)ob_get_clean();
$check(!str_contains($fallbackCategoryAction, 'muted-divider')
    && str_contains($fallbackCategoryAction, '#jqrg_url=%2Fcategory%2Fcanonical-child%2F'),
    'category actions use the canonical permalink fallback without a leading separator');
$GLOBALS['_jqrg_category_permalink'] = '//unsafe.test/';
ob_start();
jqrg_category_row_actions(['name' => 'Unsafe'], ['actor_id' => 7, 'can_update' => false], $pdo);
$check(ob_get_clean() === '', 'category actions reject unsafe display and canonical paths');
$GLOBALS['_jqrg_category_permalink_throws'] = true;
ob_start();
jqrg_category_row_actions(['name' => 'Unavailable'], ['actor_id' => 7, 'can_update' => false], $pdo);
$check(ob_get_clean() === '', 'category permalink failures fail closed without partial output');
$GLOBALS['_jqrg_category_permalink_throws'] = false;
$GLOBALS['_jqrg_can_generate'] = false;
$check(jqrg_content_row_actions([], ['title' => 'Public page'], [
    'content_type' => 'page', 'actor_id' => 7, 'status' => 'published', 'is_public' => true, 'public_url' => '/page/',
], $pdo) === [], 'row action requires the plugin generation permission');
ob_start();
jqrg_category_row_actions(['name' => 'Denied', 'display_url' => '/category/denied/'], [
    'actor_id' => 7, 'can_update' => false,
], $pdo);
$check(ob_get_clean() === '', 'category actions require the plugin generation permission');
$GLOBALS['_jqrg_can_generate'] = true;

$assetItems = jqrg_asset_detail_actions([], [
    'schema' => 1, 'resource' => 'media', 'surface' => 'admin.media.detail', 'actor_id' => 7,
    'title' => 'Public image', 'filename' => 'image.jpg', 'is_public' => true,
    'visibility' => 'public', 'storage_disk' => 'public', 'access_scope' => 'public',
    'public_url' => '/static/img/image.jpg',
], $pdo);
$check(count($assetItems) === 1
    && ($assetItems[0]['key'] ?? '') === 'qr-code-generator.create'
    && str_contains((string)($assetItems[0]['url'] ?? ''), '#jqrg_url=%2Fstatic%2Fimg%2Fimage.jpg'),
    'public Media detail receives a browser-only prefilled QR action');
foreach (['visibility', 'storage_disk', 'access_scope'] as $restrictedField) {
    $context = [
        'schema' => 1, 'resource' => 'file', 'surface' => 'admin.file.modal.detail', 'actor_id' => 7,
        'title' => 'Restricted file', 'filename' => 'file.pdf', 'is_public' => true,
        'visibility' => 'public', 'storage_disk' => 'public', 'access_scope' => 'public',
        'public_url' => '/static/files/file.pdf',
    ];
    $context[$restrictedField] = 'private';
    $check(jqrg_asset_detail_actions([], $context, $pdo) === [],
        'asset detail rejects nonpublic ' . $restrictedField);
}
$check(jqrg_asset_detail_actions([], [
    'schema' => 1, 'resource' => 'file', 'surface' => 'admin.file.detail', 'actor_id' => 7,
    'is_public' => false, 'visibility' => 'private', 'storage_disk' => 'private', 'access_scope' => 'editorial',
    'public_url' => null,
], $pdo) === [], 'protected File detail does not receive a QR action');

$_GET['page'] = 'admin/tools/another-plugin';
ob_start();
jqrg_admin_assets();
$unrelatedAssets = (string)ob_get_clean();
$check($unrelatedAssets === '', 'assets do not load without an authenticated actor');
$_GET['page'] = JQRG_ROUTE;
$_SESSION['user_id'] = 7;
ob_start();
jqrg_admin_assets();
$ownedAssets = (string)ob_get_clean();
$check(str_contains($ownedAssets, '/static/plugins/qr-code-generator/admin.css?v=' . JQRG_VERSION)
    && str_contains($ownedAssets, '/static/plugins/qr-code-generator/qrcode.js?v=' . JQRG_VERSION)
    && str_contains($ownedAssets, '/static/plugins/qr-code-generator/admin.js?v=' . JQRG_VERSION)
    && str_contains($ownedAssets, 'JQRG_CONFIG'), 'owned route loads each versioned static asset and bounded configuration');
$_GET['page'] = 'admin/tools/another-plugin';
ob_start();
jqrg_admin_assets();
$sharedQuickAssets = (string)ob_get_clean();
$check(str_contains($sharedQuickAssets, '/static/plugins/qr-code-generator/quick.css?v=' . JQRG_VERSION)
    && str_contains($sharedQuickAssets, '/static/plugins/qr-code-generator/quick.js?v=' . JQRG_VERSION)
    && !str_contains($sharedQuickAssets, '/static/plugins/qr-code-generator/admin.css?v=')
    && !str_contains($sharedQuickAssets, '/static/plugins/qr-code-generator/qrcode.js?v=')
    && !str_contains($sharedQuickAssets, '/static/plugins/qr-code-generator/admin.js?v='),
    'authorized dashboard routes load only the lightweight quick runtime for reusable asset detail modals');
$_GET['page'] = 'admin/posts/index';
ob_start();
jqrg_admin_assets();
$quickAssets = (string)ob_get_clean();
$check(str_contains($quickAssets, '/static/plugins/qr-code-generator/quick.css?v=' . JQRG_VERSION)
    && str_contains($quickAssets, '/static/plugins/qr-code-generator/quick.js?v=' . JQRG_VERSION)
    && !str_contains($quickAssets, '/static/plugins/qr-code-generator/qrcode.js?v=')
    && !str_contains($quickAssets, '/static/plugins/qr-code-generator/admin.js?v='), 'content lists load only lightweight quick-modal assets');
$_GET['page'] = 'admin/categories/index';
ob_start();
jqrg_admin_assets();
$categoryAssets = (string)ob_get_clean();
$check(str_contains($categoryAssets, '/static/plugins/qr-code-generator/quick.css?v=' . JQRG_VERSION)
    && str_contains($categoryAssets, '/static/plugins/qr-code-generator/quick.js?v=' . JQRG_VERSION)
    && !str_contains($categoryAssets, '/static/plugins/qr-code-generator/admin.css?v='), 'category lists load quick-modal assets');
foreach (['admin/media/index', 'admin/file/index'] as $assetRoute) {
    $_GET['page'] = $assetRoute;
    ob_start();
    jqrg_admin_assets();
    $assetManagerAssets = (string)ob_get_clean();
    $check(str_contains($assetManagerAssets, '/static/plugins/qr-code-generator/quick.css?v=' . JQRG_VERSION)
        && str_contains($assetManagerAssets, '/static/plugins/qr-code-generator/quick.js?v=' . JQRG_VERSION),
        $assetRoute . ' loads quick-modal assets for dynamically opened details');
}

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
$presetEndpoint = (string)file_get_contents($root . '/admin/default-preset.php');
$browserSource = (string)file_get_contents($root . '/assets/js/admin.js');
$quickSource = (string)file_get_contents($root . '/assets/js/quick.js');
$quickStyles = (string)file_get_contents($root . '/assets/css/quick.css');
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
$check(str_contains($adminSource, 'id="jqrg-center-image-trim"')
    && str_contains($browserSource, 'alphaTrimBounds')
    && str_contains($browserSource, 'trimCenterImage'), 'center images support automatic alpha trim and bounded manual trim');
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
$check(substr_count($browserSource, 'fetch(') === 1
    && str_contains($browserSource, 'settings: currentVisualSettings()')
    && !str_contains($browserSource, 'currentPayload})')
    && !preg_match('/\b(?:XMLHttpRequest|sendBeacon|WebSocket)\s*\(/', $browserSource . $quickSource), 'network writes are limited to payload-free Site Default Preset settings');
$check(!preg_match('/\b(?:sessionStorage|indexedDB)\b/', $browserSource)
    && !str_contains($browserSource, 'localStorage.setItem(presetStorageKey, currentPayload)')
    && !str_contains($browserSource, 'localStorage.setItem(presetStorageKey, centerImageUrl'), 'browser storage never receives payloads or selected image URLs');
$check(str_contains($quickSource, "url.hash.startsWith('#jqrg_url=')")
    && str_contains($quickSource, "loadScript(base + 'qrcode.js?v='")
    && str_contains($quickSource, "loadScript(base + 'admin.js?v='")
    && str_contains($quickSource, '}, 10000)')
    && str_contains($quickSource, "global.open(runtimeFallbackUrl, '_blank', 'noopener')")
    && str_contains($quickSource, 'navigator.canShare({files: [file]})')
    && str_contains($quickSource, 'navigator.clipboard.writeText(value)')
    && str_contains($quickSource, 'var sharePayload = payload')
    && str_contains($quickSource, 'shareSequence === modalSequence')
    && str_contains($quickSource, 'node.inert = true')
    && str_contains($quickSource, 'restoreBackground()')
    && str_contains($quickSource, "role=\"dialog\"")
    && !preg_match('/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/', $quickSource), 'quick modal generates locally with image sharing and URL-copy fallback');
$check(str_contains($quickStyles, 'page=admin%2Ftools%2Fqr-code-generator')
    && substr_count($quickStyles, '/static/plugins/qr-code-generator/qr-code.svg') === 4
    && str_contains($quickStyles, '.asset-detail-extension-action[href*="page=admin%2Ftools%2Fqr-code-generator"]::before'),
    'content, category, and asset QR actions use the plugin-owned line icon');
$check(strpos($browserSource, 'if (requestSequence !== generationSequence) return;')
    < strpos($browserSource, 'centerImageThumbnail.src = centerAsset.dataUrl'), 'stale image trimming cannot overwrite the current thumbnail');
$check(str_contains($presetEndpoint, "adiwira_csrf_validate(")
    && str_contains($presetEndpoint, 'settings_set($pdo, JQRG_DEFAULT_PRESET_SETTING')
    && !str_contains($presetEndpoint, 'public_url'), 'Site Default Preset endpoint is CSRF protected and stores visual settings only');
$check(!isset($manifest['migrations']) && !isset($manifest['frontend']), 'plugin declares no database migrations or frontend routes');

$translationSources = [];
foreach (['plugin.php', 'admin/index.php', 'admin/default-preset.php'] as $relative) {
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
