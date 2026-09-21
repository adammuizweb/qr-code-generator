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
- Adjustable rounded outer frame with transparent PNG/SVG corners
- Published Article, Page, and Theme Content row actions that prefill the public URL
- Live accessible preview
- PNG and SVG downloads
- UTF-8 payload support
- Responsive keyboard-friendly dashboard UI
- Dedicated delegable permission: `plugin.qr-code-generator.codes.generate`

## Privacy

Generation is client-side. The plugin does not store payloads, add database tables, call external APIs, or add public frontend routes. The only network requests are ordinary Jyavani static asset requests from the same site.

Custom presets are optional and stored in the current browser. They contain visual settings only; payloads and selected image URLs are excluded.

## Development

```bash
php tests/contract.php
node tests/generator.test.js
php tools/build-package.php /tmp/qr-code-generator-0.4.0.zip
```

Run PHP and JavaScript syntax checks before packaging:

```bash
for file in plugin.php admin/*.php tests/*.php tools/*.php languages/*.php; do php -l "$file" || exit 1; done
for file in assets/js/*.js assets/vendor/*.js tests/*.js; do node --check "$file" || exit 1; done
```
