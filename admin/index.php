<?php
declare(strict_types=1);

if (!defined('DASHBOARD_CONTEXT')) exit;

$pdo = $GLOBALS['pdo'] ?? null;
if (!$pdo instanceof PDO) {
    adiwira_render_404();
    return;
}
adiwira_require_permission($pdo, 'plugin.qr-code-generator.codes.generate', false);
$actorId = (int)($_SESSION['user_id'] ?? 0);
$siteDefaultPreset = jqrg_site_default_preset($pdo);
$canManageDefaultPreset = $actorId > 0 && function_exists('user_can')
    && user_can($pdo, $actorId, 'plugin.qr-code-generator.presets.manage');
$settingsUrl = rtrim((string)ADMIN_BASE_PATH, '/') . '/?' . http_build_query(['page' => JQRG_SETTINGS_ROUTE], '', '&', PHP_QUERY_RFC3986);

$messages = [
    'empty' => jqrg_t('Enter content before generating a QR code.'),
    'invalidUrl' => jqrg_t('Enter a valid HTTP or HTTPS URL.'),
    'invalidEmail' => jqrg_t('Enter a valid email address.'),
    'invalidPhone' => jqrg_t('Enter a phone number.'),
    'invalidWifi' => jqrg_t('Enter a Wi-Fi network name.'),
    'lowContrast' => jqrg_t('Increase the contrast between foreground and background colors.'),
    'reversePolarity' => jqrg_t('Choose a foreground color darker than the background.'),
    'resolution' => jqrg_t('Choose a larger image size for this payload.'),
    'overflow' => jqrg_t('This payload is too large for the selected error correction level.'),
    'unexpected' => jqrg_t('The QR code could not be generated in this browser.'),
    'imageInvalid' => jqrg_t('Choose an image from this site gallery.'),
    'imageLoadFailed' => jqrg_t('The center image could not be loaded. Choose another gallery image.'),
    'pickerUnavailable' => jqrg_t('The media gallery is not available for this account.'),
    'pickerFailed' => jqrg_t('The media gallery could not be opened.'),
    'updating' => jqrg_t('Updating preview...'),
    'contrastGood' => jqrg_t('Strong contrast'),
    'contrastAcceptable' => jqrg_t('Usable contrast'),
    'contrastLow' => jqrg_t('Low contrast may be difficult to scan.'),
    'contrastInverted' => jqrg_t('Light modules on a dark background may not work in every scanner.'),
    'presetSaved' => jqrg_t('Custom preset saved in this browser.'),
    'presetDeleted' => jqrg_t('Custom preset deleted.'),
    'presetNameRequired' => jqrg_t('Enter a name for the custom preset.'),
    'presetStorageFailed' => jqrg_t('This browser could not save the custom preset.'),
    'defaultPresetSaved' => jqrg_t('Site Default Preset saved.'),
    'defaultPresetFailed' => jqrg_t('The Site Default Preset could not be saved.'),
    'customSettings' => jqrg_t('Custom settings'),
    'ready' => jqrg_t('QR code ready: %d modules, %d characters.'),
    'copied' => jqrg_t('Payload copied.'),
    'copyFailed' => jqrg_t('Could not copy the payload.'),
    'wifiHidden' => jqrg_t('Wi-Fi payload hidden. Use Copy to retrieve it.'),
    'typeHelp' => [
        'text' => jqrg_t('Encode a note, instruction, identifier, or any other plain text.'),
        'url' => jqrg_t('Open a website or web page when the code is scanned.'),
        'email' => jqrg_t('Open a new email draft with an address, subject, and message.'),
        'phone' => jqrg_t('Open the phone dialer with a number ready to call.'),
        'sms' => jqrg_t('Open a new text message with a phone number and message.'),
        'wifi' => jqrg_t('Let a compatible device join a Wi-Fi network without typing its details.'),
    ],
    'downloadPng' => jqrg_t('Download PNG'),
    'downloadSvg' => jqrg_t('Download SVG'),
];
?>
<main class="jqrg-shell" id="jqrg-app">
  <header class="jqrg-hero">
    <div class="jqrg-hero__copy">
      <span class="jqrg-kicker"><?= jqrg_h(jqrg_t('LOCAL SIGNAL STUDIO')) ?></span>
      <h1><?= jqrg_h(jqrg_t('QR Code Generator')) ?></h1>
      <p><?= jqrg_h(jqrg_t('Turn useful information into a scan-ready code without sending the payload outside this browser.')) ?></p>
    </div>
    <div class="jqrg-privacy-seal" aria-label="<?= jqrg_h(jqrg_t('Privacy status')) ?>">
      <span aria-hidden="true"></span>
      <div><strong><?= jqrg_h(jqrg_t('Private by design')) ?></strong><small><?= jqrg_h(jqrg_t('No upload. No history. No external API.')) ?></small></div>
    </div>
  </header>

  <div class="jqrg-workbench">
    <section class="jqrg-card jqrg-controls" aria-labelledby="jqrg-content-title">
      <div class="jqrg-card__head"><span>01</span><div><h2 id="jqrg-content-title"><?= jqrg_h(jqrg_t('Compose payload')) ?></h2><p><?= jqrg_h(jqrg_t('Choose a format and fill only the information the scanner should receive.')) ?></p></div></div>

      <label class="jqrg-field">
        <span class="jqrg-label-row"><?= jqrg_h(jqrg_t('Payload type')) ?><span class="jqrg-tooltip" tabindex="0" aria-label="<?= jqrg_h(jqrg_t('More information')) ?>" aria-describedby="jqrg-tip-payload">?<span class="jqrg-tooltip__bubble" id="jqrg-tip-payload" role="tooltip"><?= jqrg_h(jqrg_t('Choose what should happen after someone scans the QR code. The selected type formats your information for compatible scanner apps.')) ?></span></span></span>
        <select id="jqrg-type" aria-describedby="jqrg-type-help">
          <option value="text"><?= jqrg_h(jqrg_t('Plain text')) ?></option>
          <option value="url" selected><?= jqrg_h(jqrg_t('Website URL')) ?></option>
          <option value="email"><?= jqrg_h(jqrg_t('Email message')) ?></option>
          <option value="phone"><?= jqrg_h(jqrg_t('Phone call')) ?></option>
          <option value="sms"><?= jqrg_h(jqrg_t('SMS message')) ?></option>
          <option value="wifi"><?= jqrg_h(jqrg_t('Wi-Fi network')) ?></option>
        </select>
        <small class="jqrg-field-help" id="jqrg-type-help"><?= jqrg_h($messages['typeHelp']['url']) ?></small>
      </label>

      <div class="jqrg-payload-fields" data-jqrg-fields="text" hidden>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Text')) ?></span><textarea id="jqrg-text" maxlength="4096" rows="5" placeholder="<?= jqrg_h(jqrg_t('Write the text to encode')) ?>"></textarea></label>
      </div>
      <div class="jqrg-payload-fields" data-jqrg-fields="url">
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Website URL')) ?></span><input id="jqrg-url" type="url" maxlength="2048" placeholder="https://example.com" inputmode="url" autocomplete="url"></label>
      </div>
      <div class="jqrg-payload-fields" data-jqrg-fields="email" hidden>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Email address')) ?></span><input id="jqrg-email" type="email" maxlength="320" autocomplete="email"></label>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Subject')) ?></span><input id="jqrg-email-subject" type="text" maxlength="200"></label>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Message')) ?></span><textarea id="jqrg-email-body" maxlength="2000" rows="3"></textarea></label>
      </div>
      <div class="jqrg-payload-fields" data-jqrg-fields="phone" hidden>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Phone number')) ?></span><input id="jqrg-phone" type="tel" maxlength="40" inputmode="tel" autocomplete="tel"></label>
      </div>
      <div class="jqrg-payload-fields" data-jqrg-fields="sms" hidden>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Phone number')) ?></span><input id="jqrg-sms-phone" type="tel" maxlength="40" inputmode="tel"></label>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Message')) ?></span><textarea id="jqrg-sms-message" maxlength="1000" rows="3"></textarea></label>
      </div>
      <div class="jqrg-payload-fields" data-jqrg-fields="wifi" hidden>
        <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Network name (SSID)')) ?></span><input id="jqrg-wifi-ssid" type="text" maxlength="128" autocomplete="off"></label>
        <div class="jqrg-split">
          <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Security')) ?></span><select id="jqrg-wifi-security"><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass"><?= jqrg_h(jqrg_t('Open network')) ?></option></select></label>
          <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Password')) ?></span><input id="jqrg-wifi-password" type="password" maxlength="128" autocomplete="new-password"></label>
        </div>
        <label class="jqrg-check"><input id="jqrg-wifi-hidden" type="checkbox"><span><?= jqrg_h(jqrg_t('This network is hidden')) ?></span></label>
      </div>

      <div class="jqrg-divider"></div>
      <div class="jqrg-card__head jqrg-card__head--compact"><span>02</span><div><h2><?= jqrg_h(jqrg_t('Shape the output')) ?></h2><p><?= jqrg_h(jqrg_t('Use strong contrast and keep the quiet zone for reliable scanning.')) ?></p></div></div>
      <div class="jqrg-options-grid">
        <label class="jqrg-field"><span class="jqrg-label-row"><?= jqrg_h(jqrg_t('Error correction')) ?><span class="jqrg-tooltip" tabindex="0" aria-label="<?= jqrg_h(jqrg_t('More information')) ?>" aria-describedby="jqrg-tip-error">?<span class="jqrg-tooltip__bubble" id="jqrg-tip-error" role="tooltip"><?= jqrg_h(jqrg_t('Controls how much damage or obstruction the code can recover from. Higher levels improve resilience but create a denser code. M is a good default.')) ?></span></span></span><select id="jqrg-error"><option value="L">L - 7%</option><option value="M" selected>M - 15%</option><option value="Q">Q - 25%</option><option value="H">H - 30%</option></select></label>
        <label class="jqrg-field"><span class="jqrg-label-row"><?= jqrg_h(jqrg_t('Image size')) ?><span class="jqrg-tooltip" tabindex="0" aria-label="<?= jqrg_h(jqrg_t('More information')) ?>" aria-describedby="jqrg-tip-size">?<span class="jqrg-tooltip__bubble" id="jqrg-tip-size" role="tooltip"><?= jqrg_h(jqrg_t('Sets the downloaded image dimensions. Use a larger size for print, posters, or high-resolution displays.')) ?></span></span></span><select id="jqrg-size"><option value="256">256 px</option><option value="512" selected>512 px</option><option value="768">768 px</option><option value="1024">1024 px</option></select></label>
        <label class="jqrg-field"><span class="jqrg-label-row"><?= jqrg_h(jqrg_t('Quiet zone')) ?><span class="jqrg-tooltip" tabindex="0" aria-label="<?= jqrg_h(jqrg_t('More information')) ?>" aria-describedby="jqrg-tip-margin">?<span class="jqrg-tooltip__bubble" id="jqrg-tip-margin" role="tooltip"><?= jqrg_h(jqrg_t('Adds blank space around the code so scanners can detect its edges. Keep at least 4 modules; use more near busy backgrounds.')) ?></span></span></span><select id="jqrg-margin"><option value="4" selected>4 modules</option><option value="6">6 modules</option><option value="8">8 modules</option></select></label>
        <div class="jqrg-color-pair">
          <label><span><?= jqrg_h(jqrg_t('Foreground')) ?></span><input id="jqrg-foreground" type="color" value="#0f172a"></label>
          <label><span><?= jqrg_h(jqrg_t('Background')) ?></span><input id="jqrg-background" type="color" value="#ffffff"></label>
        </div>
        <div class="jqrg-contrast" id="jqrg-contrast"><span><?= jqrg_h(jqrg_t('Contrast ratio')) ?></span><strong id="jqrg-contrast-ratio">17.85:1</strong><small id="jqrg-contrast-label"><?= jqrg_h(jqrg_t('Strong contrast')) ?></small></div>
        <label class="jqrg-frame-radius"><span class="jqrg-label-row"><?= jqrg_h(jqrg_t('Frame radius')) ?><span class="jqrg-tooltip" tabindex="0" aria-label="<?= jqrg_h(jqrg_t('More information')) ?>" aria-describedby="jqrg-tip-frame-radius">?<span class="jqrg-tooltip__bubble" id="jqrg-tip-frame-radius" role="tooltip"><?= jqrg_h(jqrg_t('Rounds only the outer background corners. QR modules and the quiet zone remain protected. PNG and SVG corners become transparent.')) ?></span></span><output id="jqrg-frame-radius-output" for="jqrg-frame-radius">0%</output></span><input id="jqrg-frame-radius" type="range" min="0" max="12" step="1" value="0"></label>
      </div>
      <div class="jqrg-presets">
        <div class="jqrg-presets__head"><strong><?= jqrg_h(jqrg_t('Visual presets')) ?></strong><small><?= jqrg_h(jqrg_t('Presets include only visual settings. Payloads and selected images are never saved.')) ?></small></div>
        <div class="jqrg-site-default" id="jqrg-site-default-settings">
          <span><?= jqrg_h(jqrg_t('Site Default Preset')) ?>: <strong id="jqrg-site-default-name"><?= jqrg_h((string)$siteDefaultPreset['name']) ?></strong></span>
          <?php if ($canManageDefaultPreset): ?>
            <span class="jqrg-site-default__actions">
              <button id="jqrg-site-default-save" type="button"><?= jqrg_h(jqrg_t('Use as site default')) ?></button>
              <a href="<?= jqrg_h($settingsUrl) ?>"><?= jqrg_h(jqrg_t('Global settings')) ?></a>
            </span>
          <?php endif; ?>
        </div>
        <div class="jqrg-presets__apply">
          <select id="jqrg-preset-select" aria-label="<?= jqrg_h(jqrg_t('Visual preset')) ?>">
            <option value=""><?= jqrg_h(jqrg_t('Current settings')) ?></option>
            <optgroup label="<?= jqrg_h(jqrg_t('Built-in presets')) ?>">
              <option value="builtin:classic"><?= jqrg_h(jqrg_t('Classic')) ?></option>
              <option value="builtin:print"><?= jqrg_h(jqrg_t('Print ready')) ?></option>
              <option value="builtin:ocean"><?= jqrg_h(jqrg_t('Ocean')) ?></option>
            </optgroup>
            <optgroup id="jqrg-custom-presets" label="<?= jqrg_h(jqrg_t('Custom presets')) ?>"></optgroup>
          </select>
          <button id="jqrg-preset-delete" type="button" disabled><?= jqrg_h(jqrg_t('Delete preset')) ?></button>
        </div>
        <div class="jqrg-presets__save">
          <input id="jqrg-preset-name" type="text" maxlength="40" aria-label="<?= jqrg_h(jqrg_t('Custom preset name')) ?>" placeholder="<?= jqrg_h(jqrg_t('Custom preset name')) ?>">
          <button id="jqrg-preset-save" type="button"><?= jqrg_h(jqrg_t('Save current settings')) ?></button>
        </div>
      </div>
      <div class="jqrg-center-image">
        <div class="jqrg-center-image__head">
          <div><strong><?= jqrg_h(jqrg_t('Center image')) ?></strong><small><?= jqrg_h(jqrg_t('Add a logo or icon from the Media Gallery. High error correction is selected automatically for safer scanning.')) ?></small></div>
          <span class="jqrg-tooltip" tabindex="0" aria-label="<?= jqrg_h(jqrg_t('More information')) ?>" aria-describedby="jqrg-tip-center-image">?<span class="jqrg-tooltip__bubble" id="jqrg-tip-center-image" role="tooltip"><?= jqrg_h(jqrg_t('The image covers some QR modules. Keep it small, use a simple square image, and test the final code with several cameras.')) ?></span></span>
        </div>
        <input id="jqrg-center-image-url" type="hidden" value="">
        <div class="jqrg-center-image__body">
          <div class="jqrg-center-image__preview" id="jqrg-center-image-preview" hidden><img id="jqrg-center-image-thumbnail" alt="<?= jqrg_h(jqrg_t('Selected center image')) ?>"></div>
          <div class="jqrg-center-image__actions">
            <button id="jqrg-center-image-choose" type="button"><?= jqrg_h(jqrg_t('Choose from Gallery')) ?></button>
            <button id="jqrg-center-image-clear" type="button" disabled><?= jqrg_h(jqrg_t('Remove image')) ?></button>
          </div>
          <div class="jqrg-center-image__settings" id="jqrg-center-image-settings" hidden>
            <label class="jqrg-center-image__size"><span><?= jqrg_h(jqrg_t('Image scale')) ?> <output id="jqrg-center-image-size-output" for="jqrg-center-image-size">18%</output></span><input id="jqrg-center-image-size" type="range" min="10" max="25" step="1" value="18"></label>
            <label class="jqrg-center-image__size"><span><?= jqrg_h(jqrg_t('Transparent edge trim')) ?> <output id="jqrg-center-image-trim-output" for="jqrg-center-image-trim">0%</output></span><input id="jqrg-center-image-trim" type="range" min="0" max="20" step="1" value="0"><small><?= jqrg_h(jqrg_t('Transparent edges are removed automatically. Increase this value to crop farther inward.')) ?></small></label>
            <label class="jqrg-field"><span><?= jqrg_h(jqrg_t('Image background')) ?></span><select id="jqrg-center-image-background-mode"><option value="match"><?= jqrg_h(jqrg_t('Match QR background')) ?></option><option value="custom"><?= jqrg_h(jqrg_t('Custom color')) ?></option><option value="transparent"><?= jqrg_h(jqrg_t('Transparent')) ?></option></select></label>
            <label class="jqrg-center-image__color" id="jqrg-center-image-color-wrap" hidden><span><?= jqrg_h(jqrg_t('Background color')) ?></span><input id="jqrg-center-image-background-color" type="color" value="#ffffff"></label>
            <label class="jqrg-center-image__size"><span><?= jqrg_h(jqrg_t('Corner radius')) ?> <output id="jqrg-center-image-radius-output" for="jqrg-center-image-radius">12%</output></span><input id="jqrg-center-image-radius" type="range" min="0" max="50" step="1" value="12"></label>
          </div>
        </div>
      </div>
      <button class="jqrg-generate" id="jqrg-generate" type="button"><span aria-hidden="true">↻</span><?= jqrg_h(jqrg_t('Refresh preview')) ?></button>
      <p class="jqrg-live-note"><?= jqrg_h(jqrg_t('Live preview updates automatically while you edit.')) ?></p>
    </section>

    <aside class="jqrg-card jqrg-preview-card" aria-labelledby="jqrg-preview-title">
      <div class="jqrg-card__head"><span>03</span><div><h2 id="jqrg-preview-title"><?= jqrg_h(jqrg_t('Scan preview')) ?></h2><p><?= jqrg_h(jqrg_t('The downloaded image uses the selected output size.')) ?></p></div></div>
      <div class="jqrg-preview" id="jqrg-preview">
        <div class="jqrg-placeholder" id="jqrg-placeholder" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <canvas id="jqrg-canvas" hidden aria-label="<?= jqrg_h(jqrg_t('Generated QR code preview')) ?>"></canvas>
      </div>
      <p class="jqrg-status" id="jqrg-status" role="status" aria-live="polite"><?= jqrg_h(jqrg_t('Enter a payload to start the live preview.')) ?></p>
      <div class="jqrg-downloads">
        <button id="jqrg-download-png" type="button" disabled><?= jqrg_h(jqrg_t('Download PNG')) ?></button>
        <button id="jqrg-download-svg" type="button" disabled><?= jqrg_h(jqrg_t('Download SVG')) ?></button>
      </div>
      <div class="jqrg-payload-readout">
        <div><span><?= jqrg_h(jqrg_t('Encoded payload')) ?></span><button id="jqrg-copy" type="button" disabled><?= jqrg_h(jqrg_t('Copy')) ?></button></div>
        <code id="jqrg-payload-output"><?= jqrg_h(jqrg_t('Nothing generated yet')) ?></code>
      </div>
      <div class="jqrg-tip"><strong><?= jqrg_h(jqrg_t('Print check')) ?></strong><p><?= jqrg_h(jqrg_t('Test the final code with more than one camera before printing it at scale.')) ?></p></div>
    </aside>
  </div>
</main>
<script type="application/json" id="jqrg-messages"><?= json_encode($messages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
