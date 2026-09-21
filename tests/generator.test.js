'use strict';

const assert = require('node:assert/strict');
const encoder = require('../assets/vendor/qrcode.js');
require('../assets/js/admin.js');

const qr = globalThis.JyavaniQrGenerator;
const tests = [];

function test(name, callback) {
  tests.push({name, callback});
}

test('exports the browser-independent API', () => {
  assert.equal(typeof qr.buildPayload, 'function');
  assert.equal(typeof qr.contrastRatio, 'function');
  assert.equal(typeof qr.renderBasicCanvas, 'function');
});

test('preserves plain text and UTF-8 content', () => {
  assert.equal(qr.buildPayload('text', {text: '  Halo dunia 🌏  '}), '  Halo dunia 🌏  ');
  assert.throws(() => qr.buildPayload('text', {text: '   '}), /empty/);
});

test('normalizes safe website URLs', () => {
  assert.equal(qr.buildPayload('url', {url: 'example.com/path'}), 'https://example.com/path');
  assert.equal(qr.buildPayload('url', {url: 'http://example.com'}), 'http://example.com/');
  assert.throws(() => qr.buildPayload('url', {url: 'javascript:alert(1)'}), /invalidUrl/);
  assert.throws(() => qr.buildPayload('url', {url: 'https://'}), /invalidUrl/);
});

test('builds encoded email payloads', () => {
  assert.equal(
    qr.buildPayload('email', {email: 'hello@example.com', subject: 'Halo dunia', body: 'Baris 1\nBaris 2'}),
    'mailto:hello@example.com?subject=Halo+dunia&body=Baris+1%0ABaris+2'
  );
  assert.equal(qr.buildPayload('email', {email: 'a#b@example.com'}), 'mailto:a%23b@example.com');
  assert.throws(() => qr.buildPayload('email', {email: 'not-an-email'}), /invalidEmail/);
});

test('builds phone and SMS payloads', () => {
  assert.equal(qr.buildPayload('phone', {phone: '+62 812-3456'}), 'tel:+62 812-3456');
  assert.equal(qr.buildPayload('sms', {phone: '+62812', message: 'Halo: dunia'}), 'SMSTO:+62812:Halo: dunia');
  assert.throws(() => qr.buildPayload('phone', {phone: ''}), /invalidPhone/);
  assert.throws(() => qr.buildPayload('sms', {phone: 'abc', message: 'No'}), /invalidPhone/);
});

test('escapes Wi-Fi reserved characters without changing the SSID', () => {
  assert.equal(
    qr.buildPayload('wifi', {ssid: ' Cafe;Guest ', security: 'WPA', password: 'a,b:c\\d', hidden: true}),
    'WIFI:T:WPA;S: Cafe\\;Guest ;P:a\\,b\\:c\\\\d;H:true;;'
  );
  assert.equal(qr.buildPayload('wifi', {ssid: 'Public', security: 'nopass', password: 'ignored'}), 'WIFI:T:nopass;S:Public;P:;H:false;;');
  assert.throws(() => qr.buildPayload('wifi', {ssid: ' '}), /invalidWifi/);
});

test('calculates useful color contrast ratios', () => {
  assert.equal(qr.contrastRatio('#000000', '#ffffff'), 21);
  assert.ok(qr.contrastRatio('#0f172a', '#ffffff') > 15);
  assert.ok(qr.contrastRatio('#777777', '#888888') < 3);
  assert.equal(qr.assessContrast('#0f172a', '#ffffff').level, 'good');
  assert.equal(qr.assessContrast('#777777', '#888888').level, 'warning');
  assert.equal(qr.assessContrast('#ffffff', '#000000').inverted, true);
  assert.equal(qr.assessContrast('#777777', '#777777').inverted, false);
});

test('sanitizes visual presets without payload or image data', () => {
  const preset = qr.sanitizeVisualPreset({
    foreground: '#123456', background: '#abcdef', errorLevel: 'H', outputSize: 1024,
    quietZone: 8, frameRadius: 16, imageScale: 25, imageBackgroundMode: 'transparent',
    imageBackgroundColor: '#fedcba', imageRadius: 50, imageTrim: 99, payload: 'secret', imageUrl: '/private/image'
  });
  assert.deepEqual(Object.keys(preset), [
    'foreground', 'background', 'errorLevel', 'outputSize', 'quietZone', 'frameRadius', 'imageScale',
    'imageBackgroundMode', 'imageBackgroundColor', 'imageRadius', 'imageTrim'
  ]);
  assert.equal(preset.imageBackgroundMode, 'transparent');
  assert.equal(preset.frameRadius, 12);
  assert.equal(preset.imageRadius, 50);
  assert.equal(preset.imageTrim, 20);
  assert.equal('payload' in preset, false);
  assert.equal('imageUrl' in preset, false);
});

test('auto-trims transparent image edges before bounded manual trimming', () => {
  const pixels = new Uint8ClampedArray(12 * 12 * 4);
  for (let y = 2; y <= 9; y += 1) {
    for (let x = 2; x <= 9; x += 1) pixels[(y * 12 + x) * 4 + 3] = 255;
  }
  assert.deepEqual(qr.alphaTrimBounds(pixels, 12, 12, 0), {x: 2, y: 2, width: 8, height: 8});
  assert.deepEqual(qr.alphaTrimBounds(pixels, 12, 12, 20), {x: 3, y: 3, width: 6, height: 6});
  assert.equal(qr.alphaTrimBounds(new Uint8ClampedArray(4 * 3 * 4), 4, 3, 20), null);
});

test('renders a preset-driven QR canvas without browser DOM state', () => {
  const calls = [];
  const context = {
    beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, clip() {}, save() {}, restore() {}, clearRect() {},
    fillRect(x, y, width, height) { calls.push({x, y, width, height}); },
    set fillStyle(value) {}
  };
  const canvas = {width: 0, height: 0, getContext: () => context};
  const rendered = qr.renderBasicCanvas(canvas, 'https://example.com/', {outputSize: 256, frameRadius: 8}, encoder);
  assert.equal(canvas.width, 256);
  assert.equal(canvas.height, 256);
  assert.ok(rendered.modules >= 21);
  assert.ok(calls.length > 1);
});

test('reads same-origin prefill paths only from the URL fragment', () => {
  assert.equal(qr.prefillUrlFromFragment('#jqrg_url=%2Farticle%2F', 'https://site.test'), 'https://site.test/article/');
  assert.equal(qr.prefillUrlFromFragment('#jqrg_url=%2F%2Fevil.test%2F', 'https://site.test'), '');
  assert.equal(qr.prefillUrlFromFragment('#jqrg_url=https%3A%2F%2Fevil.test%2F', 'https://site.test'), '');
  assert.equal(qr.prefillUrlFromFragment('#other=value', 'https://site.test'), '');
});

test('adds protected frame padding before rounding the outer surface', () => {
  const frame = qr.frameLayout(177, 4, 12);
  assert.deepEqual(frame, {radius: 12, framePadding: 8, moduleOffset: 12, innerModules: 185, totalModules: 201});
  const radius = frame.totalModules * frame.radius / 100;
  const boundaryAtFinder = radius - Math.sqrt(2 * radius * frame.moduleOffset - frame.moduleOffset ** 2);
  assert.ok(boundaryAtFinder <= frame.framePadding);
  assert.equal(qr.frameLayout(177, 4, 0).framePadding, 0);
});

test('accepts only same-origin center images', () => {
  assert.equal(
    qr.normalizeCenterImageUrl('/static/img/logo.png', 'https://site.test/dashboard/', 'https://site.test'),
    'https://site.test/static/img/logo.png'
  );
  assert.equal(
    qr.normalizeCenterImageUrl('https://site.test/private/media/view/?id=7', 'https://site.test/', 'https://site.test'),
    'https://site.test/private/media/view/?id=7'
  );
  assert.throws(() => qr.normalizeCenterImageUrl('https://cdn.test/logo.png', 'https://site.test/', 'https://site.test'), /imageInvalid/);
  assert.throws(() => qr.normalizeCenterImageUrl('data:image/png;base64,AAAA', 'https://site.test/', 'https://site.test'), /imageInvalid/);
});

test('bounds center image geometry to a safe scale', () => {
  assert.equal(qr.centerImageGeometry(500, 5).percentage, 10);
  assert.equal(qr.centerImageGeometry(500, 40).percentage, 25);
  const geometry = qr.centerImageGeometry(500, 18);
  assert.equal(geometry.imageSize, 90);
  assert.equal(geometry.imageOffset, 205);
  assert.ok(geometry.backingSize > geometry.imageSize);
});

test('sizes raster overlays against the rendered QR area', () => {
  const layout = qr.qrRasterLayout(256, 81, 4);
  assert.deepEqual(layout, {totalModules: 89, modulePixels: 2, rasterSize: 178, offset: 39});
  const geometry = qr.centerImageGeometry(layout.rasterSize, 25);
  assert.equal(geometry.imageSize, 44.5);
  assert.ok(geometry.imageSize <= layout.rasterSize * 0.25);
});

test('fits and clips non-square center images by their visible bounds', () => {
  assert.deepEqual(qr.containedImageRect(400, 200, 10, 20, 100), {x: 10, y: 45, width: 100, height: 50});
  assert.deepEqual(qr.containedImageRect(200, 400, 10, 20, 100), {x: 35, y: 20, width: 50, height: 100});
});

test('encoder accepts UTF-8 ECI assignment 26', () => {
  encoder.stringToBytes = encoder.stringToBytesFuncs['UTF-8'];
  const output = encoder(0, 'M');
  output.addData(26, 'ECI');
  output.addData('Halo dunia 🌏');
  output.make();
  assert.ok(output.getModuleCount() >= 21);
});

let failures = 0;
for (const {name, callback} of tests) {
  try {
    callback();
    console.log('PASS ' + name);
  } catch (error) {
    failures += 1;
    console.error('FAIL ' + name);
    console.error(error && error.stack ? error.stack : error);
  }
}

if (failures > 0) {
  console.error(failures + ' test(s) failed.');
  process.exit(1);
}
console.log('RESULT: ALL PASS');
