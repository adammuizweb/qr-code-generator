<?php
declare(strict_types=1);

if (!defined('PLUGIN_SYSTEM_LOADED')) return;

const JQRG_VERSION = '0.4.0';
const JQRG_ROUTE = 'admin/tools/qr-code-generator';

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
    if (trim((string)($_GET['page'] ?? ''), '/') !== JQRG_ROUTE) return;
    $base = '/static/plugins/qr-code-generator/';
    $version = rawurlencode(JQRG_VERSION);
    echo '<link rel="stylesheet" href="' . $base . 'admin.css?v=' . $version . '">';
    echo '<script defer src="' . $base . 'qrcode.js?v=' . $version . '"></script>';
    echo '<script defer src="' . $base . 'admin.js?v=' . $version . '"></script>';
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
    if (!in_array((string)($context['content_type'] ?? ''), ['article', 'page', 'theme'], true)
        || ($context['is_public'] ?? false) !== true || (string)($context['status'] ?? '') !== 'published'
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

add_action('admin_head', 'jqrg_admin_assets');
add_filter('admin_content_row_actions', 'jqrg_content_row_actions');
