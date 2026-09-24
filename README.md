# QR Code Generator for Jyavani

QR Code Generator is a private Jyavani CMS plugin project that creates QR codes entirely in the dashboard browser. Payloads are not submitted to the server or an external QR service.

## MVP Features

- Text, URL, email, phone, SMS, and Wi-Fi payload builders
- Error correction levels L, M, Q, and H
- Configurable output size, quiet zone, foreground, and background colors
- Optional gallery image in the QR center with adjustable sizing
- Center-image backplate mode, custom color, and corner radius controls
- Debounced live preview while editing
- Built-in visual presets and browser-local custom presets
- Permission-controlled global Site Default Preset for the generator and quick actions
- Adjustable rounded outer frame with transparent PNG/SVG corners
- Published, private, and scheduled Article, Page, and Theme Content row actions with a local Share/Download modal
- Category archive row actions that preserve localized public paths
- Permission-aware QR actions for public Media Gallery and File Library details
- Global settings for enabling QR actions independently on Post, Page, Theme Content, Category, Media, and File surfaces
- Nested quick modal behavior that remains above Core asset detail dialogs
- Automatic transparent-edge trimming and adjustable manual trim for center images
- Live accessible preview
- PNG and SVG downloads
- UTF-8 payload support
- Responsive keyboard-friendly dashboard UI
- Delegable generation and Site Default Preset management permissions

## Privacy

Generation is client-side. The plugin does not store payloads, add database tables, call external APIs, or add public frontend routes. Saving the Site Default Preset sends only sanitized visual settings to the same-site dashboard endpoint.

Custom presets are optional and stored in the current browser. They contain visual settings only; payloads and selected image URLs are excluded.

## Development

```bash
php tests/contract.php
node tests/generator.test.js
php tools/build-package.php /tmp/qr-code-generator-0.8.2.zip
```

Run PHP and JavaScript syntax checks before packaging:

```bash
for file in plugin.php admin/*.php tests/*.php tools/*.php languages/*.php; do php -l "$file" || exit 1; done
for file in assets/js/*.js assets/vendor/*.js tests/*.js; do node --check "$file" || exit 1; done
```
