<?php
declare(strict_types=1);

if (!defined('DASHBOARD_CONTEXT')) exit;

$pdo = $GLOBALS['pdo'] ?? null;
if (!$pdo instanceof PDO) adiwira_json(['success' => false, 'error' => jqrg_t('Database connection is unavailable.')], 500);
adiwira_require_permission($pdo, 'plugin.qr-code-generator.presets.manage', false);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') adiwira_json(['success' => false, 'error' => jqrg_t('Method not allowed.')], 405);

$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 8192) adiwira_json(['success' => false, 'error' => jqrg_t('Preset data is too large.')], 413);
try {
    $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
} catch (Throwable) {
    adiwira_json(['success' => false, 'error' => jqrg_t('Invalid preset data.')], 422);
}
if (!is_array($input) || !adiwira_csrf_validate(is_string($input['csrf_token'] ?? null) ? $input['csrf_token'] : null)) {
    adiwira_json(['success' => false, 'error' => jqrg_t('Invalid form token. Please try again.')], 419);
}
$name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
if ($name === '' || strlen($name) > 160 || preg_match('/[\x00-\x1F\x7F]/', $name)) {
    adiwira_json(['success' => false, 'error' => jqrg_t('Enter a valid preset name.')], 422);
}
$settings = jqrg_sanitize_visual_settings($input['settings'] ?? []);
if (!jqrg_visual_settings_are_quick_safe($settings)) {
    adiwira_json(['success' => false, 'error' => jqrg_t('Site Default Preset needs dark modules on a lighter background with at least 3:1 contrast.')], 422);
}
$preset = ['name' => $name, 'settings' => $settings];
$encoded = json_encode($preset, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
if (!settings_set($pdo, JQRG_DEFAULT_PRESET_SETTING, $encoded, 1)) {
    adiwira_json(['success' => false, 'error' => jqrg_t('The Site Default Preset could not be saved.')], 500);
}
adiwira_json(['success' => true, 'preset' => $preset]);
