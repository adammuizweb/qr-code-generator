<?php
declare(strict_types=1);

if (!defined('DASHBOARD_CONTEXT')) exit;

$pdo = $GLOBALS['pdo'] ?? null;
if (!$pdo instanceof PDO) {
    adiwira_render_404();
    return;
}
adiwira_require_permission($pdo, 'plugin.qr-code-generator.presets.manage', false);

$actorId = (int)($_SESSION['user_id'] ?? 0);
$canGenerate = $actorId > 0 && function_exists('user_can')
    && user_can($pdo, $actorId, 'plugin.qr-code-generator.codes.generate');
$settingsUrl = rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query(['page' => JQRG_SETTINGS_ROUTE], '', '&', PHP_QUERY_RFC3986);
$generatorUrl = rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query(['page' => JQRG_ROUTE], '', '&', PHP_QUERY_RFC3986);
$error = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if (!adiwira_csrf_validate(is_string($_POST['csrf_token'] ?? null) ? $_POST['csrf_token'] : null)) {
        $error = jqrg_t('Invalid form token. Please try again.');
    } elseif (!jqrg_save_action_settings($pdo, $_POST['actions'] ?? [])) {
        $error = jqrg_t('Settings could not be saved.');
    } elseif (function_exists('adiwira_redirect_with_flash')) {
        adiwira_redirect_with_flash($settingsUrl, 'success', jqrg_t('Settings saved.'));
    }
}

$actionSettings = jqrg_action_settings($pdo);
$siteDefaultPreset = jqrg_site_default_preset($pdo);
$actionLabels = [
    'post' => jqrg_t('Post'),
    'page' => jqrg_t('Page'),
    'theme_content' => jqrg_t('Theme Content'),
    'category' => jqrg_t('Category'),
    'media' => jqrg_t('Media'),
    'file' => jqrg_t('File'),
];
?>
<main class="jqrg-shell jqrg-settings-shell">
  <header class="jqrg-hero jqrg-settings-hero">
    <div class="jqrg-hero__copy">
      <span class="jqrg-kicker"><?= jqrg_h(jqrg_t('GLOBAL CONFIGURATION')) ?></span>
      <h1><?= jqrg_h(jqrg_t('QR Code Generator Settings')) ?></h1>
      <p><?= jqrg_h(jqrg_t('Choose where authorized dashboard users can open quick QR actions.')) ?></p>
    </div>
    <?php if ($canGenerate): ?><a class="jqrg-hero-link" href="<?= jqrg_h($generatorUrl) ?>"><?= jqrg_h(jqrg_t('Back to generator')) ?></a><?php endif; ?>
  </header>

  <?php if ($error !== ''): ?><div class="jqrg-settings-notice is-error" role="alert"><?= jqrg_h($error) ?></div><?php endif; ?>

  <div class="jqrg-settings-grid">
    <form class="jqrg-card jqrg-settings-card" method="post" action="<?= jqrg_h($settingsUrl) ?>" data-unsaved-guard>
      <input type="hidden" name="csrf_token" value="<?= jqrg_h(csrf_token()) ?>">
      <div class="jqrg-card__head"><span>01</span><div><h2><?= jqrg_h(jqrg_t('Global QR actions')) ?></h2><p><?= jqrg_h(jqrg_t('Disabled resources do not receive QR links. Existing content and generated files are not changed.')) ?></p></div></div>
      <div class="jqrg-action-settings">
        <?php foreach ($actionLabels as $key => $label): ?>
          <label class="jqrg-action-setting">
            <span><strong><?= jqrg_h($label) ?></strong><small><?= jqrg_h(jqrg_t('Show QR action in %s', $label)) ?></small></span>
            <input type="checkbox" name="actions[<?= jqrg_h($key) ?>]" value="1" <?= ($actionSettings[$key] ?? false) ? 'checked' : '' ?>>
          </label>
        <?php endforeach; ?>
      </div>
      <button class="jqrg-settings-save" type="submit"><?= jqrg_h(jqrg_t('Save settings')) ?></button>
    </form>

    <section class="jqrg-card jqrg-settings-card" aria-labelledby="jqrg-default-preset-title">
      <div class="jqrg-card__head"><span>02</span><div><h2 id="jqrg-default-preset-title"><?= jqrg_h(jqrg_t('Site Default Preset')) ?></h2><p><?= jqrg_h(jqrg_t('Quick actions use this visual preset while keeping every QR payload in the browser.')) ?></p></div></div>
      <div class="jqrg-current-preset"><span><?= jqrg_h(jqrg_t('Current preset')) ?></span><strong><?= jqrg_h((string)$siteDefaultPreset['name']) ?></strong></div>
      <?php if ($canGenerate): ?><a class="jqrg-settings-secondary" href="<?= jqrg_h($generatorUrl) ?>#jqrg-site-default-settings"><?= jqrg_h(jqrg_t('Open generator to change the preset')) ?></a><?php endif; ?>
    </section>
  </div>
</main>
