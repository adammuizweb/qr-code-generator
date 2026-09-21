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

  function assessContrast(foreground, background) {
    var ratio = contrastRatio(foreground, background);
    var inverted = ratio >= 3 && relativeLuminance(foreground) > relativeLuminance(background);
    return {
      ratio: ratio,
      inverted: inverted,
      level: inverted || ratio < 3 ? 'warning' : (ratio < 4.5 ? 'acceptable' : 'good')
    };
  }

  function sanitizeVisualPreset(value) {
    value = value && typeof value === 'object' ? value : {};
    var errorLevel = ['L', 'M', 'Q', 'H'].indexOf(value.errorLevel) >= 0 ? value.errorLevel : 'M';
    var outputSize = [256, 512, 768, 1024].indexOf(Number(value.outputSize)) >= 0 ? Number(value.outputSize) : 512;
    var quietZone = [4, 6, 8].indexOf(Number(value.quietZone)) >= 0 ? Number(value.quietZone) : 4;
    var backgroundMode = ['match', 'custom', 'transparent'].indexOf(value.imageBackgroundMode) >= 0 ? value.imageBackgroundMode : 'match';
    return {
      foreground: parseHex(value.foreground) ? String(value.foreground).toLowerCase() : '#0f172a',
      background: parseHex(value.background) ? String(value.background).toLowerCase() : '#ffffff',
      errorLevel: errorLevel,
      outputSize: outputSize,
      quietZone: quietZone,
      frameRadius: Math.max(0, Math.min(12, Number(value.frameRadius) || 0)),
      imageScale: Math.max(10, Math.min(25, Number(value.imageScale) || 18)),
      imageBackgroundMode: backgroundMode,
      imageBackgroundColor: parseHex(value.imageBackgroundColor) ? String(value.imageBackgroundColor).toLowerCase() : '#ffffff',
      imageRadius: Math.max(0, Math.min(50, Number(value.imageRadius) || 0))
    };
  }

  function prefillUrlFromFragment(hash, origin) {
    var prefix = '#jqrg_url=';
    var rawHash = String(hash || '');
    if (!rawHash.startsWith(prefix)) return '';
    var path;
    try {
      path = decodeURIComponent(rawHash.slice(prefix.length));
    } catch (error) {
      return '';
    }
    if (!path || path.length > 2048 || path[0] !== '/' || path.startsWith('//') || /[\\\x00-\x1F\x7F]/.test(path)) return '';
    try {
      var parsed = new URL(path, origin);
      return parsed.origin === origin ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function frameLayout(moduleCount, quietZone, outerRadius) {
    var radius = Math.max(0, Math.min(12, Number(outerRadius) || 0));
    var framePadding = radius > 0 ? 8 : 0;
    return {
      radius: radius,
      framePadding: framePadding,
      moduleOffset: quietZone + framePadding,
      innerModules: moduleCount + quietZone * 2,
      totalModules: moduleCount + (quietZone + framePadding) * 2
    };
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

  function containedImageRect(width, height, x, y, size) {
    width = Number(width);
    height = Number(height);
    if (!(width > 0) || !(height > 0)) return {x: x, y: y, width: size, height: size};
    var scale = Math.min(size / width, size / height);
    var drawWidth = width * scale;
    var drawHeight = height * scale;
    return {x: x + (size - drawWidth) / 2, y: y + (size - drawHeight) / 2, width: drawWidth, height: drawHeight};
  }

  var api = {
    escapeWifi: escapeWifi,
    normalizeUrl: normalizeUrl,
    buildPayload: buildPayload,
    contrastRatio: contrastRatio,
    assessContrast: assessContrast,
    sanitizeVisualPreset: sanitizeVisualPreset,
    prefillUrlFromFragment: prefillUrlFromFragment,
    frameLayout: frameLayout,
    normalizeCenterImageUrl: normalizeCenterImageUrl,
    centerImageGeometry: centerImageGeometry,
    qrRasterLayout: qrRasterLayout,
    containedImageRect: containedImageRect
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
    var contrastBox = document.getElementById('jqrg-contrast');
    var contrastRatioOutput = document.getElementById('jqrg-contrast-ratio');
    var contrastLabel = document.getElementById('jqrg-contrast-label');
    var frameRadius = document.getElementById('jqrg-frame-radius');
    var frameRadiusOutput = document.getElementById('jqrg-frame-radius-output');
    var presetSelect = document.getElementById('jqrg-preset-select');
    var customPresetGroup = document.getElementById('jqrg-custom-presets');
    var presetDelete = document.getElementById('jqrg-preset-delete');
    var presetName = document.getElementById('jqrg-preset-name');
    var presetSave = document.getElementById('jqrg-preset-save');
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
    var centerImageSettings = document.getElementById('jqrg-center-image-settings');
    var centerImageSize = document.getElementById('jqrg-center-image-size');
    var centerImageSizeOutput = document.getElementById('jqrg-center-image-size-output');
    var centerImageBackgroundMode = document.getElementById('jqrg-center-image-background-mode');
    var centerImageColorWrap = document.getElementById('jqrg-center-image-color-wrap');
    var centerImageBackgroundColor = document.getElementById('jqrg-center-image-background-color');
    var centerImageRadius = document.getElementById('jqrg-center-image-radius');
    var centerImageRadiusOutput = document.getElementById('jqrg-center-image-radius-output');
    var currentPayload = '';
    var currentSvg = '';
    var generationSequence = 0;
    var generateTimer = null;
    var imageCache = null;
    var initialPayload = payloadOutput.textContent;
    var presetStorageKey = 'jqrg.visualPresets.v1';
    var builtInPresets = {
      classic: sanitizeVisualPreset({foreground: '#0f172a', background: '#ffffff', errorLevel: 'M', outputSize: 512, quietZone: 4, frameRadius: 0, imageScale: 18, imageBackgroundMode: 'match', imageRadius: 12}),
      print: sanitizeVisualPreset({foreground: '#000000', background: '#ffffff', errorLevel: 'H', outputSize: 1024, quietZone: 6, frameRadius: 0, imageScale: 16, imageBackgroundMode: 'match', imageRadius: 0}),
      ocean: sanitizeVisualPreset({foreground: '#064e5b', background: '#ecfeff', errorLevel: 'Q', outputSize: 768, quietZone: 4, frameRadius: 10, imageScale: 18, imageBackgroundMode: 'custom', imageBackgroundColor: '#ffffff', imageRadius: 24})
    };
    var prefilledUrl = prefillUrlFromFragment(global.location.hash, global.location.origin);
    if (global.location.hash.startsWith('#jqrg_url=')) {
      global.history.replaceState(null, '', global.location.pathname + global.location.search);
    }
    if (prefilledUrl) document.getElementById('jqrg-url').value = prefilledUrl;

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

    function currentVisualSettings() {
      return sanitizeVisualPreset({
        foreground: foreground.value,
        background: background.value,
        errorLevel: errorLevel.value,
        outputSize: size.value,
        quietZone: margin.value,
        frameRadius: frameRadius.value,
        imageScale: centerImageSize.value,
        imageBackgroundMode: centerImageBackgroundMode.value,
        imageBackgroundColor: centerImageBackgroundColor.value,
        imageRadius: centerImageRadius.value
      });
    }

    function updateCenterStyleVisibility() {
      centerImageColorWrap.hidden = centerImageBackgroundMode.value !== 'custom';
      centerImageSizeOutput.textContent = centerImageSize.value + '%';
      centerImageRadiusOutput.textContent = centerImageRadius.value + '%';
    }

    function updateContrastFeedback() {
      var assessment = assessContrast(foreground.value, background.value);
      contrastBox.classList.remove('is-good', 'is-acceptable', 'is-warning');
      contrastBox.classList.add('is-' + assessment.level);
      contrastRatioOutput.textContent = assessment.ratio.toFixed(2) + ':1';
      if (assessment.inverted) contrastLabel.textContent = messages.contrastInverted || 'Light modules on a dark background may not work in every scanner.';
      else if (assessment.level === 'warning') contrastLabel.textContent = messages.contrastLow || 'Low contrast may be difficult to scan.';
      else if (assessment.level === 'acceptable') contrastLabel.textContent = messages.contrastAcceptable || 'Usable contrast';
      else contrastLabel.textContent = messages.contrastGood || 'Strong contrast';
      return assessment;
    }

    function applyVisualSettings(settings) {
      var safe = sanitizeVisualPreset(settings);
      foreground.value = safe.foreground;
      background.value = safe.background;
      errorLevel.value = safe.errorLevel;
      size.value = String(safe.outputSize);
      margin.value = String(safe.quietZone);
      frameRadius.value = String(safe.frameRadius);
      frameRadiusOutput.textContent = safe.frameRadius + '%';
      centerImageSize.value = String(safe.imageScale);
      centerImageBackgroundMode.value = safe.imageBackgroundMode;
      centerImageBackgroundColor.value = safe.imageBackgroundColor;
      centerImageRadius.value = String(safe.imageRadius);
      updateCenterStyleVisibility();
      updateContrastFeedback();
    }

    function readCustomPresets() {
      try {
        var decoded = JSON.parse(global.localStorage.getItem(presetStorageKey) || '[]');
        if (!Array.isArray(decoded)) return [];
        return decoded.slice(0, 20).filter(function (item) {
          return item && typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim() !== '';
        }).map(function (item) {
          return {id: item.id.slice(0, 80), name: item.name.trim().slice(0, 40), settings: sanitizeVisualPreset(item.settings)};
        });
      } catch (error) {
        return [];
      }
    }

    function writeCustomPresets(items) {
      try {
        global.localStorage.setItem(presetStorageKey, JSON.stringify(items.slice(0, 20)));
        return true;
      } catch (error) {
        return false;
      }
    }

    function renderCustomPresets(selectedValue) {
      while (customPresetGroup.firstChild) customPresetGroup.removeChild(customPresetGroup.firstChild);
      readCustomPresets().forEach(function (item) {
        var option = document.createElement('option');
        option.value = 'custom:' + item.id;
        option.textContent = item.name;
        customPresetGroup.appendChild(option);
      });
      if (selectedValue) presetSelect.value = selectedValue;
      presetDelete.disabled = !presetSelect.value.startsWith('custom:');
    }

    function presetStatus(key, fallback, error) {
      status.textContent = messages[key] || fallback;
      status.classList.toggle('is-error', error === true);
      status.classList.remove('is-warning');
    }

    function markPresetModified(target) {
      var visualControls = [foreground, background, errorLevel, size, margin, frameRadius, centerImageSize, centerImageBackgroundMode, centerImageBackgroundColor, centerImageRadius];
      if (visualControls.indexOf(target) < 0) return;
      presetSelect.value = '';
      presetDelete.disabled = true;
    }

    function escapeXml(value) {
      return String(value).replace(/[&<>"']/g, function (character) {
        return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character];
      });
    }

    function makeSvg(qr, outputSize, quietZone, dark, light, centerAsset, outerRadius) {
      var modules = qr.getModuleCount();
      var frame = frameLayout(modules, quietZone, outerRadius);
      var total = frame.totalModules;
      var paths = [];
      for (var row = 0; row < modules; row += 1) {
        for (var column = 0; column < modules; column += 1) {
          if (qr.isDark(row, column)) paths.push('M' + (column + frame.moduleOffset) + ' ' + (row + frame.moduleOffset) + 'h1v1h-1z');
        }
      }
      var overlay = '';
      if (centerAsset) {
        var geometry = centerImageGeometry(frame.innerModules, centerAsset.percentage);
        geometry.imageOffset += frame.framePadding;
        geometry.backingOffset += frame.framePadding;
        var imageRect = containedImageRect(centerAsset.width, centerAsset.height, geometry.imageOffset, geometry.imageOffset, geometry.imageSize);
        var radius = Math.min(imageRect.width, imageRect.height) * centerAsset.radius / 100;
        var backingRadius = geometry.backingSize * centerAsset.radius / 100;
        var backplate = centerAsset.backgroundMode === 'transparent' ? '' : '<rect x="' + geometry.backingOffset + '" y="' + geometry.backingOffset + '" width="' + geometry.backingSize + '" height="' + geometry.backingSize + '" rx="' + backingRadius + '" fill="' + escapeXml(centerAsset.backgroundColor) + '"/>';
        overlay = '<defs><clipPath id="jqrg-center-clip"><rect x="' + imageRect.x + '" y="' + imageRect.y + '" width="' + imageRect.width + '" height="' + imageRect.height + '" rx="' + radius + '"/></clipPath></defs>' + backplate +
          '<image href="' + escapeXml(centerAsset.dataUrl) + '" x="' + imageRect.x + '" y="' + imageRect.y + '" width="' + imageRect.width + '" height="' + imageRect.height + '" image-rendering="auto" clip-path="url(#jqrg-center-clip)"/>';
      }
      var body =
        '<rect width="' + total + '" height="' + total + '" fill="' + escapeXml(light) + '"/>' +
        '<path d="' + paths.join('') + '" fill="' + escapeXml(dark) + '"/>' + overlay;
      var safeOuterRadius = frame.radius;
      var frameClip = safeOuterRadius > 0
        ? '<defs><clipPath id="jqrg-frame-clip"><rect width="' + total + '" height="' + total + '" rx="' + (total * safeOuterRadius / 100) + '"/></clipPath></defs>'
        : '';
      if (safeOuterRadius > 0) body = '<g clip-path="url(#jqrg-frame-clip)">' + body + '</g>';
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + outputSize + '" height="' + outputSize + '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' + frameClip + body + '</svg>';
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

    function drawContainedImage(context, image, rect) {
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error('imageLoadFailed');
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }

    function drawCanvas(qr, outputSize, quietZone, dark, light, centerAsset, outerRadius) {
      var context = canvas.getContext('2d');
      if (!context) throw new Error('unexpected');
      var modules = qr.getModuleCount();
      var frame = frameLayout(modules, quietZone, outerRadius);
      var layout = qrRasterLayout(outputSize, modules, quietZone + frame.framePadding);
      if (layout.modulePixels < 2) throw new Error('resolution');
      canvas.width = outputSize;
      canvas.height = outputSize;
      canvas.style.width = Math.min(outputSize, 560) + 'px';
      canvas.style.height = Math.min(outputSize, 560) + 'px';
      context.clearRect(0, 0, outputSize, outputSize);
      var safeOuterRadius = frame.radius;
      if (safeOuterRadius > 0) {
        context.save();
        roundedRect(context, 0, 0, outputSize, outputSize, outputSize * safeOuterRadius / 100);
        context.clip();
      }
      context.fillStyle = light;
      context.fillRect(0, 0, outputSize, outputSize);
      context.fillStyle = dark;
      for (var row = 0; row < modules; row += 1) {
        for (var column = 0; column < modules; column += 1) {
          if (!qr.isDark(row, column)) continue;
          var left = layout.offset + (column + frame.moduleOffset) * layout.modulePixels;
          var top = layout.offset + (row + frame.moduleOffset) * layout.modulePixels;
          context.fillRect(left, top, layout.modulePixels, layout.modulePixels);
        }
      }
      if (centerAsset) {
        var innerSize = frame.innerModules * layout.modulePixels;
        var innerOffset = layout.offset + frame.framePadding * layout.modulePixels;
        var geometry = centerImageGeometry(innerSize, centerAsset.percentage);
        if (centerAsset.backgroundMode !== 'transparent') {
          context.fillStyle = centerAsset.backgroundColor;
          roundedRect(context, innerOffset + geometry.backingOffset, innerOffset + geometry.backingOffset, geometry.backingSize, geometry.backingSize, geometry.backingSize * centerAsset.radius / 100);
          context.fill();
        }
        var imageRect = containedImageRect(centerAsset.image.naturalWidth || centerAsset.image.width, centerAsset.image.naturalHeight || centerAsset.image.height, innerOffset + geometry.imageOffset, innerOffset + geometry.imageOffset, geometry.imageSize);
        context.save();
        roundedRect(context, imageRect.x, imageRect.y, imageRect.width, imageRect.height, Math.min(imageRect.width, imageRect.height) * centerAsset.radius / 100);
        context.clip();
        drawContainedImage(context, centerAsset.image, imageRect);
        context.restore();
      }
      if (safeOuterRadius > 0) context.restore();
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
      status.classList.remove('is-warning');
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
      status.classList.remove('is-error', 'is-warning');
    }

    function scheduleGenerate(delay) {
      clearTimeout(generateTimer);
      markUpdating();
      generateTimer = setTimeout(generate, typeof delay === 'number' ? delay : 320);
    }

    async function generate() {
      clearTimeout(generateTimer);
      var requestSequence = ++generationSequence;
      status.classList.remove('is-error', 'is-warning');
      try {
        var payload = buildPayload(type.value, valuesForType(type.value));
        var dark = foreground.value;
        var light = background.value;
        var contrast = updateContrastFeedback();
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
          var loadedImage = await loadCenterImage(safeImageUrl);
          var backgroundMode = centerImageBackgroundMode.value;
          centerAsset = {
            image: loadedImage.image,
            dataUrl: loadedImage.dataUrl,
            width: loadedImage.image.naturalWidth || loadedImage.image.width,
            height: loadedImage.image.naturalHeight || loadedImage.image.height,
            percentage: parseInt(centerImageSize.value, 10) || 18,
            backgroundMode: backgroundMode,
            backgroundColor: backgroundMode === 'custom' ? centerImageBackgroundColor.value : light,
            radius: Math.max(0, Math.min(50, parseInt(centerImageRadius.value, 10) || 0))
          };
        }
        if (requestSequence !== generationSequence) return;
        var outerRadius = parseInt(frameRadius.value, 10) || 0;
        drawCanvas(qr, outputSize, quietZone, dark, light, centerAsset, outerRadius);
        currentSvg = makeSvg(qr, outputSize, quietZone, dark, light, centerAsset, outerRadius);
        currentPayload = payload;
        canvas.hidden = false;
        placeholder.hidden = true;
        pngButton.disabled = false;
        svgButton.disabled = false;
        copyButton.disabled = false;
        payloadOutput.textContent = type.value === 'wifi' ? (messages.wifiHidden || 'Wi-Fi payload hidden. Use Copy to retrieve it.') : payload;
        var readyMessage = String(messages.ready || 'QR code ready: %d modules, %d characters.')
          .replace('%d', String(qr.getModuleCount())).replace('%d', String(Array.from(payload).length));
        if (contrast.inverted) {
          status.textContent = (messages.contrastInverted || 'Light modules on a dark background may not work in every scanner.') + ' ' + readyMessage;
          status.classList.add('is-warning');
        } else if (contrast.level === 'warning') {
          status.textContent = (messages.contrastLow || 'Low contrast may be difficult to scan.') + ' ' + readyMessage;
          status.classList.add('is-warning');
        } else {
          status.textContent = readyMessage;
        }
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
    centerImageRadius.addEventListener('input', function () {
      centerImageRadiusOutput.textContent = centerImageRadius.value + '%';
    });
    frameRadius.addEventListener('input', function () {
      frameRadiusOutput.textContent = frameRadius.value + '%';
    });
    centerImageBackgroundMode.addEventListener('change', updateCenterStyleVisibility);
    presetSelect.addEventListener('change', function () {
      var selected = presetSelect.value;
      presetDelete.disabled = !selected.startsWith('custom:');
      if (!selected) return;
      if (selected.startsWith('builtin:')) {
        applyVisualSettings(builtInPresets[selected.slice(8)] || builtInPresets.classic);
      } else if (selected.startsWith('custom:')) {
        var id = selected.slice(7);
        var custom = readCustomPresets().find(function (item) { return item.id === id; });
        if (custom) applyVisualSettings(custom.settings);
      }
      scheduleGenerate(0);
    });
    presetSave.addEventListener('click', function () {
      var name = presetName.value.trim();
      if (!name) {
        presetStatus('presetNameRequired', 'Enter a name for the custom preset.', true);
        presetName.focus();
        return;
      }
      var items = readCustomPresets();
      var id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      items.unshift({id: id, name: name.slice(0, 40), settings: currentVisualSettings()});
      if (!writeCustomPresets(items)) {
        presetStatus('presetStorageFailed', 'This browser could not save the custom preset.', true);
        return;
      }
      presetName.value = '';
      renderCustomPresets('custom:' + id);
      presetStatus('presetSaved', 'Custom preset saved in this browser.', false);
    });
    presetDelete.addEventListener('click', function () {
      if (!presetSelect.value.startsWith('custom:')) return;
      var id = presetSelect.value.slice(7);
      var items = readCustomPresets().filter(function (item) { return item.id !== id; });
      if (!writeCustomPresets(items)) {
        presetStatus('presetStorageFailed', 'This browser could not save the custom preset.', true);
        return;
      }
      presetSelect.value = '';
      renderCustomPresets('');
      presetStatus('presetDeleted', 'Custom preset deleted.', false);
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
        centerImageSettings.hidden = false;
        centerImageClear.disabled = false;
        errorLevel.value = 'H';
        markPresetModified(errorLevel);
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
      centerImageSettings.hidden = true;
      centerImageClear.disabled = true;
      scheduleGenerate(0);
    });
    root.addEventListener('input', function (event) {
      if (event.target === centerImageUrl || event.target === presetName) return;
      markPresetModified(event.target);
      if (event.target === foreground || event.target === background) updateContrastFeedback();
      scheduleGenerate();
    });
    root.addEventListener('change', function (event) {
      if (event.target === centerImageUrl || event.target === presetSelect || event.target === presetName) return;
      markPresetModified(event.target);
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
    updateCenterStyleVisibility();
    updateContrastFeedback();
    renderCustomPresets('');
    if (read('jqrg-url').trim() !== '') scheduleGenerate(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
