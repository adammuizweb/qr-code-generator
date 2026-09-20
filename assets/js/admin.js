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

  function normalizeCenterImageUrl(value, baseUrl, expectedOrigin) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var parsed;
    try {
      parsed = new URL(raw, baseUrl);
    } catch (error) {
      throw new Error('imageInvalid');
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== expectedOrigin) {
      throw new Error('imageInvalid');
    }
    return parsed.href;
  }

  function centerImageGeometry(surfaceSize, percentage) {
    var percent = Math.max(10, Math.min(25, Number(percentage) || 18));
    var imageSize = surfaceSize * percent / 100;
    var padding = Math.max(surfaceSize * 0.012, imageSize * 0.08);
    var backingSize = imageSize + padding * 2;
    return {
      percentage: percent,
      imageSize: imageSize,
      imageOffset: (surfaceSize - imageSize) / 2,
      backingSize: backingSize,
      backingOffset: (surfaceSize - backingSize) / 2,
      radius: Math.max(surfaceSize * 0.008, backingSize * 0.12)
    };
  }

  function qrRasterLayout(outputSize, moduleCount, quietZone) {
    var totalModules = moduleCount + quietZone * 2;
    var modulePixels = Math.floor(outputSize / totalModules);
    var rasterSize = totalModules * modulePixels;
    return {
      totalModules: totalModules,
      modulePixels: modulePixels,
      rasterSize: rasterSize,
      offset: Math.floor((outputSize - rasterSize) / 2)
    };
  }

  var api = {
    escapeWifi: escapeWifi,
    normalizeUrl: normalizeUrl,
    buildPayload: buildPayload,
    contrastRatio: contrastRatio,
    normalizeCenterImageUrl: normalizeCenterImageUrl,
    centerImageGeometry: centerImageGeometry,
    qrRasterLayout: qrRasterLayout
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
    var typeHelp = document.getElementById('jqrg-type-help');
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
    var centerImageUrl = document.getElementById('jqrg-center-image-url');
    var centerImageChoose = document.getElementById('jqrg-center-image-choose');
    var centerImageClear = document.getElementById('jqrg-center-image-clear');
    var centerImagePreview = document.getElementById('jqrg-center-image-preview');
    var centerImageThumbnail = document.getElementById('jqrg-center-image-thumbnail');
    var centerImageSizeWrap = document.getElementById('jqrg-center-image-size-wrap');
    var centerImageSize = document.getElementById('jqrg-center-image-size');
    var centerImageSizeOutput = document.getElementById('jqrg-center-image-size-output');
    var currentPayload = '';
    var currentSvg = '';
    var generationSequence = 0;
    var generateTimer = null;
    var imageCache = null;
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

    function makeSvg(qr, outputSize, quietZone, dark, light, centerAsset) {
      var modules = qr.getModuleCount();
      var total = modules + quietZone * 2;
      var paths = [];
      for (var row = 0; row < modules; row += 1) {
        for (var column = 0; column < modules; column += 1) {
          if (qr.isDark(row, column)) paths.push('M' + (column + quietZone) + ' ' + (row + quietZone) + 'h1v1h-1z');
        }
      }
      var overlay = '';
      if (centerAsset) {
        var geometry = centerImageGeometry(total, centerAsset.percentage);
        overlay = '<rect x="' + geometry.backingOffset + '" y="' + geometry.backingOffset + '" width="' + geometry.backingSize + '" height="' + geometry.backingSize + '" rx="' + geometry.radius + '" fill="' + escapeXml(light) + '"/>' +
          '<image href="' + escapeXml(centerAsset.dataUrl) + '" x="' + geometry.imageOffset + '" y="' + geometry.imageOffset + '" width="' + geometry.imageSize + '" height="' + geometry.imageSize + '" preserveAspectRatio="xMidYMid meet" image-rendering="auto"/>';
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + outputSize + '" height="' + outputSize + '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
        '<rect width="' + total + '" height="' + total + '" fill="' + escapeXml(light) + '"/>' +
        '<path d="' + paths.join('') + '" fill="' + escapeXml(dark) + '"/>' + overlay + '</svg>';
    }

    function roundedRect(context, x, y, width, height, radius) {
      var safeRadius = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + safeRadius, y);
      context.arcTo(x + width, y, x + width, y + height, safeRadius);
      context.arcTo(x + width, y + height, x, y + height, safeRadius);
      context.arcTo(x, y + height, x, y, safeRadius);
      context.arcTo(x, y, x + width, y, safeRadius);
      context.closePath();
    }

    function drawContainedImage(context, image, x, y, size) {
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;
      var scale = Math.min(size / width, size / height);
      var drawWidth = width * scale;
      var drawHeight = height * scale;
      context.drawImage(image, x + (size - drawWidth) / 2, y + (size - drawHeight) / 2, drawWidth, drawHeight);
    }

    function drawCanvas(qr, outputSize, quietZone, dark, light, centerAsset) {
      var context = canvas.getContext('2d', {alpha: false});
      if (!context) throw new Error('unexpected');
      var modules = qr.getModuleCount();
      var layout = qrRasterLayout(outputSize, modules, quietZone);
      if (layout.modulePixels < 2) throw new Error('resolution');
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
          var left = layout.offset + (column + quietZone) * layout.modulePixels;
          var top = layout.offset + (row + quietZone) * layout.modulePixels;
          context.fillRect(left, top, layout.modulePixels, layout.modulePixels);
        }
      }
      if (centerAsset) {
        var geometry = centerImageGeometry(layout.rasterSize, centerAsset.percentage);
        context.fillStyle = light;
        roundedRect(context, layout.offset + geometry.backingOffset, layout.offset + geometry.backingOffset, geometry.backingSize, geometry.backingSize, geometry.radius);
        context.fill();
        drawContainedImage(context, centerAsset.image, layout.offset + geometry.imageOffset, layout.offset + geometry.imageOffset, geometry.imageSize);
      }
    }

    function imageAsDataUrl(image) {
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error('imageLoadFailed');
      var scale = Math.min(1, 512 / Math.max(width, height));
      var surface = document.createElement('canvas');
      surface.width = Math.max(1, Math.round(width * scale));
      surface.height = Math.max(1, Math.round(height * scale));
      var context = surface.getContext('2d');
      if (!context) throw new Error('imageLoadFailed');
      context.drawImage(image, 0, 0, surface.width, surface.height);
      try {
        return surface.toDataURL('image/png');
      } catch (error) {
        throw new Error('imageLoadFailed');
      }
    }

    function loadCenterImage(url) {
      if (imageCache && imageCache.url === url) return Promise.resolve(imageCache);
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          try {
            imageCache = {url: url, image: image, dataUrl: imageAsDataUrl(image)};
            resolve(imageCache);
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = function () { reject(new Error('imageLoadFailed')); };
        image.src = url;
      });
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

    function markUpdating() {
      generationSequence += 1;
      currentPayload = '';
      currentSvg = '';
      pngButton.disabled = true;
      svgButton.disabled = true;
      copyButton.disabled = true;
      payloadOutput.textContent = initialPayload;
      status.textContent = messages.updating || 'Updating preview...';
      status.classList.remove('is-error');
    }

    function scheduleGenerate(delay) {
      clearTimeout(generateTimer);
      markUpdating();
      generateTimer = setTimeout(generate, typeof delay === 'number' ? delay : 320);
    }

    async function generate() {
      clearTimeout(generateTimer);
      var requestSequence = ++generationSequence;
      status.classList.remove('is-error');
      try {
        var payload = buildPayload(type.value, valuesForType(type.value));
        var dark = foreground.value;
        var light = background.value;
        if (contrastRatio(dark, light) < 3) throw new Error('lowContrast');
        if (relativeLuminance(dark) >= relativeLuminance(light)) throw new Error('reversePolarity');
        var hasCenterImage = centerImageUrl.value !== '';
        if (hasCenterImage) errorLevel.value = 'H';
        var qr = global.qrcode(0, errorLevel.value);
        if (/[^\x00-\x7F]/.test(payload)) qr.addData(26, 'ECI');
        qr.addData(payload);
        qr.make();
        var outputSize = parseInt(size.value, 10) || 512;
        var quietZone = Math.max(4, parseInt(margin.value, 10) || 4);
        var centerAsset = null;
        if (hasCenterImage) {
          var safeImageUrl = normalizeCenterImageUrl(centerImageUrl.value, global.location.href, global.location.origin);
          centerAsset = await loadCenterImage(safeImageUrl);
          centerAsset.percentage = parseInt(centerImageSize.value, 10) || 18;
        }
        if (requestSequence !== generationSequence) return;
        drawCanvas(qr, outputSize, quietZone, dark, light, centerAsset);
        currentSvg = makeSvg(qr, outputSize, quietZone, dark, light, centerAsset);
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
        if (requestSequence !== generationSequence) return;
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
      if (typeHelp && messages.typeHelp) typeHelp.textContent = messages.typeHelp[type.value] || '';
    });
    wifiSecurity.addEventListener('change', function () {
      var open = wifiSecurity.value === 'nopass';
      wifiPassword.disabled = open;
      if (open) wifiPassword.value = '';
    });
    centerImageSize.addEventListener('input', function () {
      centerImageSizeOutput.textContent = centerImageSize.value + '%';
    });
    centerImageChoose.addEventListener('click', function () {
      if (typeof global.openMediaSelector !== 'function') {
        status.textContent = messages.pickerUnavailable || 'The media gallery is not available for this account.';
        status.classList.add('is-error');
        return;
      }
      global.openMediaSelector({
        context: {surface: 'qr-code-generator', consumer: 'qr-code-generator', field: 'center_image', selection_mode: 'immediate'}
      }).then(function (detail) {
        var media = typeof global.normalizeMedia === 'function' ? global.normalizeMedia(detail) : detail;
        if (!media || !media.url) return;
        var safeUrl;
        try {
          safeUrl = normalizeCenterImageUrl(media.url, global.location.href, global.location.origin);
        } catch (error) {
          fail('imageInvalid');
          return;
        }
        imageCache = null;
        centerImageUrl.value = safeUrl;
        centerImageThumbnail.src = safeUrl;
        centerImagePreview.hidden = false;
        centerImageSizeWrap.hidden = false;
        centerImageClear.disabled = false;
        errorLevel.value = 'H';
        scheduleGenerate(0);
      }).catch(function () {
        status.textContent = messages.pickerFailed || 'The media gallery could not be opened.';
        status.classList.add('is-error');
      });
    });
    centerImageClear.addEventListener('click', function () {
      imageCache = null;
      centerImageUrl.value = '';
      centerImageThumbnail.removeAttribute('src');
      centerImagePreview.hidden = true;
      centerImageSizeWrap.hidden = true;
      centerImageClear.disabled = true;
      scheduleGenerate(0);
    });
    root.addEventListener('input', function (event) {
      if (event.target === centerImageUrl) return;
      scheduleGenerate();
    });
    root.addEventListener('change', function (event) {
      if (event.target === centerImageUrl) return;
      scheduleGenerate(0);
    });
    generateButton.addEventListener('click', function () { generate(); });
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
