# QR Code Generator Plugin

This repository is the authoritative source for the standalone Jyavani QR Code Generator plugin.

## Boundaries

- Keep product changes inside this repository.
- Use the `jqrg_` prefix for PHP symbols and `jqrg-` for browser-facing CSS identifiers.
- Keep `plugin.json` at the package root and release ZIPs flat.
- Keep every copied asset below `static/plugins/qr-code-generator/`.
- QR payloads are generated only in the visitor's browser. Do not submit, log, persist, or transmit them.
- Never hardcode a dashboard path or customer domain.
- Necessary permission checks remain server-side even though generation is client-side.
- Keep the vendored QR encoder pinned and preserve its license notice.

## Verification

- Run PHP syntax checks for every PHP file.
- Run JavaScript syntax checks for every JavaScript file.
- Run `php tests/contract.php` and `node tests/generator.test.js`.
- Build a flat package with `php tools/build-package.php <output>` and inspect it before release.
- Test PNG and SVG downloads, UTF-8 payloads, each payload type, color contrast, keyboard navigation, and mobile layout.
