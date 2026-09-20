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
