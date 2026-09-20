(function (global) {
  'use strict';

  function escapeWifi(value) {
    return String(value || '').replace(/([\\;,:"])/g, '\\$1');
  }

  function normalizeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) throw new Error('invalidUrl');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw;
    var parsed;
    try {
      parsed = new URL(raw);
    } catch (error) {
      throw new Error('invalidUrl');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('invalidUrl');
    return parsed.href;
  }

  function buildPayload(type, values) {
    values = values || {};
    if (type === 'url') return normalizeUrl(values.url);
    if (type === 'email') {
      var email = String(values.email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalidEmail');
      var emailParams = new URLSearchParams();
      if (values.subject) emailParams.set('subject', String(values.subject));
      if (values.body) emailParams.set('body', String(values.body));
      var emailQuery = emailParams.toString();
      var emailParts = email.split('@');
      var recipient = encodeURIComponent(emailParts[0]) + '@' + encodeURIComponent(emailParts[1]);
      return 'mailto:' + recipient + (emailQuery ? '?' + emailQuery : '');
    }
    if (type === 'phone') {
      var phone = String(values.phone || '').trim();
      if (!/^\+?[0-9().\-\s]{3,40}$/.test(phone) || !/[0-9]/.test(phone)) throw new Error('invalidPhone');
      return 'tel:' + phone;
    }
    if (type === 'sms') {
      var smsPhone = String(values.phone || '').trim();
      if (!/^\+?[0-9().\-\s]{3,40}$/.test(smsPhone) || !/[0-9]/.test(smsPhone)) throw new Error('invalidPhone');
      return 'SMSTO:' + smsPhone + ':' + String(values.message || '');
    }
    if (type === 'wifi') {
      var ssid = String(values.ssid || '');
      if (!ssid.trim()) throw new Error('invalidWifi');
      var security = ['WPA', 'WEP', 'nopass'].indexOf(values.security) >= 0 ? values.security : 'WPA';
      var password = security === 'nopass' ? '' : String(values.password || '');
      return 'WIFI:T:' + security + ';S:' + escapeWifi(ssid) + ';P:' + escapeWifi(password) + ';H:' + (values.hidden ? 'true' : 'false') + ';;';
    }
    var text = String(values.text || '');
    if (!text.trim()) throw new Error('empty');
    return text;
  }

  function parseHex(color) {
    var match = /^#([a-f0-9]{6})$/i.exec(String(color || ''));
    if (!match) return null;
    return [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
  }

  function relativeLuminance(color) {
    var rgb = parseHex(color);
    if (!rgb) return 0;
    var channels = rgb.map(function (channel) {
      var value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(foreground, background) {
    var first = relativeLuminance(foreground);
    var second = relativeLuminance(background);
    var light = Math.max(first, second);
    var dark = Math.min(first, second);
    return (light + 0.05) / (dark + 0.05);
  }

  var api = {
    escapeWifi: escapeWifi,
    normalizeUrl: normalizeUrl,
    buildPayload: buildPayload,
    contrastRatio: contrastRatio
  };
  global.JyavaniQrGenerator = api;

  if (typeof document === 'undefined') return;

  function boot() {
    var root = document.getElementById('jqrg-app');
    if (!root || typeof global.qrcode !== 'function') return;

    if (typeof TextEncoder === 'function') {
      global.qrcode.stringToBytes = function (value) {
        return Array.prototype.slice.call(new TextEncoder().encode(value));
      };
    } else {
      global.qrcode.stringToBytes = function (value) {
        return unescape(encodeURIComponent(value)).split('').map(function (character) { return character.charCodeAt(0); });
      };
    }

    var messagesNode = document.getElementById('jqrg-messages');
    var messages = {};
    try { messages = JSON.parse(messagesNode ? messagesNode.textContent : '{}'); } catch (error) {}

    var type = document.getElementById('jqrg-type');
    var errorLevel = document.getElementById('jqrg-error');
    var size = document.getElementById('jqrg-size');
    var margin = document.getElementById('jqrg-margin');
    var foreground = document.getElementById('jqrg-foreground');
    var background = document.getElementById('jqrg-background');
    var canvas = document.getElementById('jqrg-canvas');
    var placeholder = document.getElementById('jqrg-placeholder');
    var status = document.getElementById('jqrg-status');
    var payloadOutput = document.getElementById('jqrg-payload-output');
    var generateButton = document.getElementById('jqrg-generate');
    var pngButton = document.getElementById('jqrg-download-png');
    var svgButton = document.getElementById('jqrg-download-svg');
    var copyButton = document.getElementById('jqrg-copy');
    var wifiSecurity = document.getElementById('jqrg-wifi-security');
    var wifiPassword = document.getElementById('jqrg-wifi-password');
    var currentPayload = '';
    var currentSvg = '';
    var initialStatus = status.textContent;
    var initialPayload = payloadOutput.textContent;

    function read(id) {
      var element = document.getElementById(id);
      return element ? element.value : '';
    }

    function valuesForType(selectedType) {
      if (selectedType === 'url') return {url: read('jqrg-url')};
      if (selectedType === 'email') return {email: read('jqrg-email'), subject: read('jqrg-email-subject'), body: read('jqrg-email-body')};
      if (selectedType === 'phone') return {phone: read('jqrg-phone')};
      if (selectedType === 'sms') return {phone: read('jqrg-sms-phone'), message: read('jqrg-sms-message')};
      if (selectedType === 'wifi') return {
        ssid: read('jqrg-wifi-ssid'),
        security: read('jqrg-wifi-security'),
        password: read('jqrg-wifi-password'),
        hidden: document.getElementById('jqrg-wifi-hidden').checked
      };
      return {text: read('jqrg-text')};
    }

    function escapeXml(value) {
      return String(value).replace(/[&<>"']/g, function (character) {
        return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character];
      });
    }

    function makeSvg(qr, outputSize, quietZone, dark, light) {
      var modules = qr.getModuleCount();
      var total = modules + quietZone * 2;
      var paths = [];
      for (var row = 0; row < modules; row += 1) {
        for (var column = 0; column < modules; column += 1) {
          if (qr.isDark(row, column)) paths.push('M' + (column + quietZone) + ' ' + (row + quietZone) + 'h1v1h-1z');
        }
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + outputSize + '" height="' + outputSize + '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
        '<rect width="' + total + '" height="' + total + '" fill="' + escapeXml(light) + '"/>' +
        '<path d="' + paths.join('') + '" fill="' + escapeXml(dark) + '"/></svg>';
    }

    function drawCanvas(qr, outputSize, quietZone, dark, light) {
      var context = canvas.getContext('2d', {alpha: false});
      if (!context) throw new Error('unexpected');
      var modules = qr.getModuleCount();
      var total = modules + quietZone * 2;
      var modulePixels = Math.floor(outputSize / total);
      if (modulePixels < 2) throw new Error('resolution');
      var offset = Math.floor((outputSize - total * modulePixels) / 2);
      canvas.width = outputSize;
      canvas.height = outputSize;
      canvas.style.width = Math.min(outputSize, 560) + 'px';
      canvas.style.height = Math.min(outputSize, 560) + 'px';
      context.fillStyle = light;
      context.fillRect(0, 0, outputSize, outputSize);
      context.fillStyle = dark;
      for (var row = 0; row < modules; row += 1) {
        for (var column = 0; column < modules; column += 1) {
          if (!qr.isDark(row, column)) continue;
          var left = offset + (column + quietZone) * modulePixels;
          var top = offset + (row + quietZone) * modulePixels;
          context.fillRect(left, top, modulePixels, modulePixels);
        }
      }
    }

    function fail(key) {
      currentPayload = '';
      currentSvg = '';
      canvas.hidden = true;
      placeholder.hidden = false;
      pngButton.disabled = true;
      svgButton.disabled = true;
      copyButton.disabled = true;
      payloadOutput.textContent = messages[key] || messages.overflow || key;
      status.textContent = messages[key] || messages.overflow || key;
      status.classList.add('is-error');
    }

    function invalidate() {
      if (!currentPayload) return;
      currentPayload = '';
      currentSvg = '';
      canvas.hidden = true;
      placeholder.hidden = false;
      pngButton.disabled = true;
      svgButton.disabled = true;
      copyButton.disabled = true;
      payloadOutput.textContent = initialPayload;
      status.textContent = initialStatus;
      status.classList.remove('is-error');
    }

    function generate() {
      status.classList.remove('is-error');
      try {
        var payload = buildPayload(type.value, valuesForType(type.value));
        var dark = foreground.value;
        var light = background.value;
        if (contrastRatio(dark, light) < 3) throw new Error('lowContrast');
        if (relativeLuminance(dark) >= relativeLuminance(light)) throw new Error('reversePolarity');
        var qr = global.qrcode(0, errorLevel.value);
        if (/[^\x00-\x7F]/.test(payload)) qr.addData(26, 'ECI');
        qr.addData(payload);
        qr.make();
        var outputSize = parseInt(size.value, 10) || 512;
        var quietZone = Math.max(4, parseInt(margin.value, 10) || 4);
        drawCanvas(qr, outputSize, quietZone, dark, light);
        currentSvg = makeSvg(qr, outputSize, quietZone, dark, light);
        currentPayload = payload;
        canvas.hidden = false;
        placeholder.hidden = true;
        pngButton.disabled = false;
        svgButton.disabled = false;
        copyButton.disabled = false;
        payloadOutput.textContent = type.value === 'wifi' ? (messages.wifiHidden || 'Wi-Fi payload hidden. Use Copy to retrieve it.') : payload;
        status.textContent = String(messages.ready || 'QR code ready: %d modules, %d characters.')
          .replace('%d', String(qr.getModuleCount())).replace('%d', String(Array.from(payload).length));
      } catch (error) {
        var key = error && error.message ? error.message : 'overflow';
        if (!messages[key]) key = 'unexpected';
        fail(key);
      }
    }

    function filename(extension) {
      var now = new Date();
      var stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
      return 'qr-code-' + stamp + '.' + extension;
    }

    function downloadBlob(blob, name) {
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    type.addEventListener('change', function () {
      root.querySelectorAll('[data-jqrg-fields]').forEach(function (group) { group.hidden = group.dataset.jqrgFields !== type.value; });
      invalidate();
    });
    wifiSecurity.addEventListener('change', function () {
      var open = wifiSecurity.value === 'nopass';
      wifiPassword.disabled = open;
      if (open) wifiPassword.value = '';
    });
    root.addEventListener('input', invalidate);
    root.addEventListener('change', invalidate);
    generateButton.addEventListener('click', generate);
    pngButton.addEventListener('click', function () {
      if (!currentPayload) return;
      canvas.toBlob(function (blob) { if (blob) downloadBlob(blob, filename('png')); }, 'image/png');
    });
    svgButton.addEventListener('click', function () {
      if (currentSvg) downloadBlob(new Blob([currentSvg], {type: 'image/svg+xml;charset=utf-8'}), filename('svg'));
    });
    copyButton.addEventListener('click', function () {
      if (!currentPayload) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentPayload).then(function () { status.textContent = messages.copied || 'Payload copied.'; }, function () { status.textContent = messages.copyFailed || 'Could not copy the payload.'; });
      } else {
        status.textContent = messages.copyFailed || 'Could not copy the payload.';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
