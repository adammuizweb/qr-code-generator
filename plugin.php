<?php
declare(strict_types=1);

if (!defined('PLUGIN_SYSTEM_LOADED')) return;

const JQRG_VERSION = '0.8.4';
const JQRG_ROUTE = 'admin/tools/qr-code-generator';
const JQRG_SETTINGS_ROUTE = 'admin/tools/qr-code-generator/settings';
const JQRG_DEFAULT_PRESET_ROUTE = 'admin/tools/qr-code-generator/default-preset';
const JQRG_DEFAULT_PRESET_SETTING = 'plugin_qr_code_generator_default_preset';
const JQRG_SETTINGS_SETTING = 'plugin_qr_code_generator_settings';

function jqrg_h(mixed $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function jqrg_t(string $source, mixed ...$args): string
{
    $translated = function_exists('__') ? __($source) : $source;
    if ($translated === $source) {
        $locale = function_exists('get_locale') ? strtolower((string)get_locale()) : 'en';
        $locale = explode('-', str_replace('_', '-', $locale), 2)[0];
        if (in_array($locale, ['id', 'de'], true)) {
            static $catalogs = [];
            if (!isset($catalogs[$locale])) {
                $catalog = require __DIR__ . '/languages/' . $locale . '.php';
                $catalogs[$locale] = is_array($catalog) ? $catalog : [];
            }
            $translated = (string)($catalogs[$locale][$source] ?? $source);
        }
    }
    return $args === [] ? $translated : sprintf($translated, ...$args);
}

function jqrg_admin_assets(): void
{
    $route = trim((string)($_GET['page'] ?? ''), '/');
    $generatorRoute = $route === JQRG_ROUTE;
    $settingsRoute = $route === JQRG_SETTINGS_ROUTE;
    if ($route === '') return;

    $pdo = $GLOBALS['pdo'] ?? null;
    $actorId = (int)($_SESSION['user_id'] ?? 0);
    if (!$pdo instanceof PDO || $actorId < 1 || !function_exists('user_can')) return;
    $canGenerate = user_can($pdo, $actorId, 'plugin.qr-code-generator.codes.generate');
    $canManageDefault = user_can($pdo, $actorId, 'plugin.qr-code-generator.presets.manage');
    if (($settingsRoute && !$canManageDefault) || (!$settingsRoute && !$canGenerate)) return;

    $base = '/static/plugins/qr-code-generator/';
    $version = rawurlencode(JQRG_VERSION);
    if ($settingsRoute) {
        echo '<link rel="stylesheet" href="' . $base . 'admin.css?v=' . $version . '">';
        return;
    }
    $defaultPreset = jqrg_site_default_preset($pdo);
    $config = [
        'assetBase' => $base,
        'assetVersion' => JQRG_VERSION,
        'defaultPreset' => $defaultPreset,
        'canManageDefault' => $canManageDefault,
        'defaultEndpoint' => $canManageDefault ? rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query([
            'page' => JQRG_DEFAULT_PRESET_ROUTE,
            'action' => 'save',
        ], '', '&', PHP_QUERY_RFC3986) : '',
        'csrfToken' => $canManageDefault && function_exists('csrf_token') ? csrf_token() : '',
        'generatorRoute' => rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query(['page' => JQRG_ROUTE], '', '&', PHP_QUERY_RFC3986),
        'messages' => [
            'quickTitle' => jqrg_t('Quick QR'),
            'quickDescription' => jqrg_t('Generated locally with the Site Default Preset.'),
            'share' => jqrg_t('Share'),
            'download' => jqrg_t('Download'),
            'openGenerator' => jqrg_t('Open generator'),
            'close' => jqrg_t('Close'),
            'preparing' => jqrg_t('Preparing QR code...'),
            'ready' => jqrg_t('QR code ready.'),
            'shareFallback' => jqrg_t('Image sharing is unavailable. The content URL was copied instead.'),
            'shareFailed' => jqrg_t('The QR code could not be shared.'),
            'copyFailed' => jqrg_t('Could not copy the content URL.'),
        ],
    ];
    echo '<script>window.JQRG_CONFIG=' . json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>';
    echo '<link rel="stylesheet" href="' . $base . ($generatorRoute ? 'admin.css' : 'quick.css') . '?v=' . $version . '">';
    if ($generatorRoute) {
        echo '<script defer src="' . $base . 'qrcode.js?v=' . $version . '"></script>';
        echo '<script defer src="' . $base . 'admin.js?v=' . $version . '"></script>';
    } else {
        echo '<script defer src="' . $base . 'quick.js?v=' . $version . '"></script>';
    }
}

function jqrg_action_setting_defaults(): array
{
    return [
        'post' => true,
        'page' => true,
        'theme_content' => true,
        'category' => true,
        'media' => true,
        'file' => true,
    ];
}

function jqrg_action_settings(PDO $pdo): array
{
    $settings = jqrg_action_setting_defaults();
    if (!function_exists('settings_get')) return $settings;
    $raw = settings_get($pdo, JQRG_SETTINGS_SETTING, '');
    if (!is_string($raw) || $raw === '' || strlen($raw) > 4096) return $settings;
    try {
        $stored = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        return $settings;
    }
    if (!is_array($stored) || ($stored['schema'] ?? null) !== 1 || !is_array($stored['actions'] ?? null)) {
        return $settings;
    }
    foreach ($settings as $key => $enabled) {
        if (is_bool($stored['actions'][$key] ?? null)) $settings[$key] = $stored['actions'][$key];
    }
    return $settings;
}

function jqrg_action_enabled(PDO $pdo, string $resource): bool
{
    $settings = jqrg_action_settings($pdo);
    return ($settings[$resource] ?? false) === true;
}

function jqrg_save_action_settings(PDO $pdo, mixed $submitted): bool
{
    if (!function_exists('settings_set')) return false;
    $submitted = is_array($submitted) ? $submitted : [];
    $actions = [];
    foreach (jqrg_action_setting_defaults() as $key => $enabled) {
        $actions[$key] = isset($submitted[$key]) && $submitted[$key] === '1';
    }
    $encoded = json_encode(['schema' => 1, 'actions' => $actions], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    return settings_set($pdo, JQRG_SETTINGS_SETTING, $encoded, 1);
}

function jqrg_sanitize_visual_settings(mixed $value): array
{
    $value = is_array($value) ? $value : [];
    $color = static fn(mixed $candidate, string $fallback): string => is_string($candidate)
        && preg_match('/\A#[a-f0-9]{6}\z/i', $candidate) === 1 ? strtolower($candidate) : $fallback;
    $errorLevel = in_array($value['errorLevel'] ?? null, ['L', 'M', 'Q', 'H'], true) ? $value['errorLevel'] : 'M';
    $outputSize = in_array((int)($value['outputSize'] ?? 0), [256, 512, 768, 1024], true) ? (int)$value['outputSize'] : 512;
    $quietZone = in_array((int)($value['quietZone'] ?? 0), [4, 6, 8], true) ? (int)$value['quietZone'] : 4;
    $backgroundMode = in_array($value['imageBackgroundMode'] ?? null, ['match', 'custom', 'transparent'], true)
        ? $value['imageBackgroundMode'] : 'match';
    return [
        'foreground' => $color($value['foreground'] ?? null, '#0f172a'),
        'background' => $color($value['background'] ?? null, '#ffffff'),
        'errorLevel' => $errorLevel,
        'outputSize' => $outputSize,
        'quietZone' => $quietZone,
        'frameRadius' => max(0, min(12, (int)($value['frameRadius'] ?? 0))),
        'imageScale' => max(10, min(25, (int)($value['imageScale'] ?? 18))),
        'imageBackgroundMode' => $backgroundMode,
        'imageBackgroundColor' => $color($value['imageBackgroundColor'] ?? null, '#ffffff'),
        'imageRadius' => max(0, min(50, (int)($value['imageRadius'] ?? 0))),
        'imageTrim' => max(0, min(20, (int)($value['imageTrim'] ?? 0))),
    ];
}

function jqrg_visual_settings_are_quick_safe(array $settings): bool
{
    $luminance = static function (string $color): float {
        $channels = [hexdec(substr($color, 1, 2)), hexdec(substr($color, 3, 2)), hexdec(substr($color, 5, 2))];
        $linear = array_map(static function (int $channel): float {
            $value = $channel / 255;
            return $value <= 0.03928 ? $value / 12.92 : (($value + 0.055) / 1.055) ** 2.4;
        }, $channels);
        return 0.2126 * $linear[0] + 0.7152 * $linear[1] + 0.0722 * $linear[2];
    };
    $foreground = $luminance((string)$settings['foreground']);
    $background = $luminance((string)$settings['background']);
    return $foreground < $background && ($background + 0.05) / ($foreground + 0.05) >= 3;
}

function jqrg_site_default_preset(PDO $pdo): array
{
    $fallback = ['name' => jqrg_t('Classic'), 'settings' => jqrg_sanitize_visual_settings([])];
    if (!function_exists('settings_get')) return $fallback;
    $raw = settings_get($pdo, JQRG_DEFAULT_PRESET_SETTING, '');
    if (!is_string($raw) || $raw === '' || strlen($raw) > 4096) return $fallback;
    try {
        $stored = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        return $fallback;
    }
    if (!is_array($stored)) return $fallback;
    $name = is_string($stored['name'] ?? null) ? trim($stored['name']) : '';
    if (strlen($name) > 160 || preg_match('/[\x00-\x1F\x7F]/', $name)) $name = '';
    $settings = jqrg_sanitize_visual_settings($stored['settings'] ?? []);
    if (!jqrg_visual_settings_are_quick_safe($settings)) return $fallback;
    return [
        'name' => $name !== '' ? $name : $fallback['name'],
        'settings' => $settings,
    ];
}

function jqrg_public_path(string $url): ?string
{
    $url = trim($url);
    if ($url === '' || strlen($url) > 2048 || !str_starts_with($url, '/') || str_starts_with($url, '//')
        || str_contains($url, '\\') || preg_match('/[\x00-\x1F\x7F]/', $url)) return null;
    $parts = parse_url($url);
    if (!is_array($parts) || isset($parts['scheme']) || isset($parts['host']) || isset($parts['user']) || isset($parts['pass'])
        || !str_starts_with((string)($parts['path'] ?? ''), '/')) return null;
    $decodedPath = (string)$parts['path'];
    for ($i = 0; $i < 5; $i++) {
        $next = rawurldecode($decodedPath);
        if (!str_starts_with($next, '/') || str_starts_with($next, '//')
            || str_contains($next, '\\') || preg_match('/[\x00-\x1F\x7F]/', $next)) return null;
        $segments = explode('/', $next);
        if (in_array('.', $segments, true) || in_array('..', $segments, true)) return null;
        if ($next === $decodedPath) break;
        $decodedPath = $next;
        if ($i === 4) return null;
    }
    return $url;
}

function jqrg_content_row_actions(mixed $items, array $row, array $context, PDO $pdo): array
{
    if (!is_array($items)) $items = [];
    $resource = match ((string)($context['content_type'] ?? '')) {
        'article' => 'post',
        'page' => 'page',
        'theme' => 'theme_content',
        default => null,
    };
    if ($resource === null || !jqrg_action_enabled($pdo, $resource)
        || !in_array((string)($context['status'] ?? ''), ['published', 'private', 'scheduled'], true)
        || !defined('ADMIN_BASE_PATH')) return $items;
    $actorId = (int)($context['actor_id'] ?? 0);
    if ($actorId < 1 || !function_exists('user_can')
        || !user_can($pdo, $actorId, 'plugin.qr-code-generator.codes.generate')) return $items;
    $publicPath = jqrg_public_path((string)($context['public_url'] ?? ''));
    if ($publicPath === null) return $items;

    $title = trim((string)($row['title'] ?? ''));
    $items[] = [
        'key' => 'qr-code-generator.create',
        'label' => jqrg_t('QR'),
        'url' => rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query([
            'page' => JQRG_ROUTE,
        ], '', '&', PHP_QUERY_RFC3986) . '#jqrg_url=' . rawurlencode($publicPath),
        'title' => jqrg_t('Create QR code for %s', $title !== '' ? $title : $publicPath),
    ];
    return $items;
}

function jqrg_category_row_actions(array $category, array $context, PDO $pdo): void
{
    if (!defined('ADMIN_BASE_PATH') || !function_exists('user_can') || !jqrg_action_enabled($pdo, 'category')) return;

    $actorId = (int)($context['actor_id'] ?? 0);
    if ($actorId < 1 || !user_can($pdo, $actorId, 'plugin.qr-code-generator.codes.generate')) return;

    $publicPath = jqrg_public_path((string)($category['display_url'] ?? ''));
    if ($publicPath === null && function_exists('get_category_permalink')) {
        try {
            $publicPath = jqrg_public_path(get_category_permalink($pdo, $category));
        } catch (Throwable) {
            return;
        }
    }
    if ($publicPath === null) return;

    $name = trim((string)($category['name'] ?? ''));
    $url = rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query([
        'page' => JQRG_ROUTE,
    ], '', '&', PHP_QUERY_RFC3986) . '#jqrg_url=' . rawurlencode($publicPath);

    if (($context['can_update'] ?? false) === true) echo '<span class="muted-divider">|</span>';
    echo '<a class="adam-ubah" href="' . jqrg_h($url) . '" title="'
        . jqrg_h(jqrg_t('Create QR code for %s', $name !== '' ? $name : $publicPath)) . '">'
        . jqrg_h(jqrg_t('QR')) . '</a>';
}

function jqrg_asset_detail_actions(mixed $items, array $context, PDO $pdo): array
{
    if (!is_array($items)) $items = [];
    $resource = (string)($context['resource'] ?? '');
    if (($context['schema'] ?? null) !== 1
        || !in_array($resource, ['media', 'file'], true)
        || !jqrg_action_enabled($pdo, $resource)
        || !in_array((string)($context['surface'] ?? ''), [
            'admin.media.detail',
            'admin.media.modal.detail',
            'admin.file.detail',
            'admin.file.modal.detail',
        ], true)
        || ($context['is_public'] ?? false) !== true
        || (string)($context['visibility'] ?? '') !== 'public'
        || (string)($context['storage_disk'] ?? '') !== 'public'
        || (string)($context['access_scope'] ?? '') !== 'public'
        || !defined('ADMIN_BASE_PATH')) return $items;

    $actorId = (int)($context['actor_id'] ?? 0);
    if ($actorId < 1 || !function_exists('user_can')
        || !user_can($pdo, $actorId, 'plugin.qr-code-generator.codes.generate')) return $items;
    $publicPath = jqrg_public_path((string)($context['public_url'] ?? ''));
    if ($publicPath === null) return $items;

    $name = trim((string)($context['title'] ?? ''));
    if ($name === '') $name = trim((string)($context['filename'] ?? ''));
    $items[] = [
        'key' => 'qr-code-generator.create',
        'label' => jqrg_t('QR'),
        'url' => rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query([
            'page' => JQRG_ROUTE,
        ], '', '&', PHP_QUERY_RFC3986) . '#jqrg_url=' . rawurlencode($publicPath),
        'title' => jqrg_t('Create QR code for %s', $name !== '' ? $name : $publicPath),
    ];
    return $items;
}

add_action('admin_head', 'jqrg_admin_assets');
add_action('admin_category_row_actions', 'jqrg_category_row_actions');
add_filter('admin_content_row_actions', 'jqrg_content_row_actions');
add_filter('admin_asset_detail_actions', 'jqrg_asset_detail_actions');
