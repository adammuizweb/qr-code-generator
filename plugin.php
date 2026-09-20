<?php
declare(strict_types=1);

if (!defined('PLUGIN_SYSTEM_LOADED')) return;

const JQRG_VERSION = '0.1.0';
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

add_action('admin_head', 'jqrg_admin_assets');
