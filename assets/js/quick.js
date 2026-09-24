(function (global) {
  'use strict';

  if (typeof document === 'undefined') return;

  function boot() {
    var config = global.JQRG_CONFIG || {};
    var runtimePromise = null;

    var overlay = document.createElement('div');
    overlay.className = 'jqrg-quick';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="jqrg-quick__panel" role="dialog" aria-modal="true" aria-labelledby="jqrg-quick-title" aria-describedby="jqrg-quick-description">' +
      '<button class="jqrg-quick__close" type="button" aria-label=""></button>' +
      '<div class="jqrg-quick__eyebrow"></div>' +
      '<h2 id="jqrg-quick-title"></h2>' +
      '<p id="jqrg-quick-description"></p>' +
      '<div class="jqrg-quick__canvas-wrap"><canvas aria-label="QR code"></canvas></div>' +
      '<code class="jqrg-quick__url"></code>' +
      '<p class="jqrg-quick__status" role="status" aria-live="polite"></p>' +
      '<div class="jqrg-quick__actions"><button type="button" data-jqrg-share></button><button type="button" data-jqrg-download></button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var panel = overlay.querySelector('.jqrg-quick__panel');
    var closeButton = overlay.querySelector('.jqrg-quick__close');
    var title = overlay.querySelector('h2');
    var description = overlay.querySelector('#jqrg-quick-description');
    var eyebrow = overlay.querySelector('.jqrg-quick__eyebrow');
    var canvas = overlay.querySelector('canvas');
    var urlOutput = overlay.querySelector('.jqrg-quick__url');
    var status = overlay.querySelector('.jqrg-quick__status');
    var shareButton = overlay.querySelector('[data-jqrg-share]');
    var downloadButton = overlay.querySelector('[data-jqrg-download]');
    var messages = config.messages || {};
    var payload = '';
    var previousFocus = null;
    var isolatedNodes = [];
    var modalSequence = 0;
    var runtimeFallbackUrl = '';

    function loadScript(source) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        var settled = false;
        var timeout = global.setTimeout(function () {
          if (settled) return;
          settled = true;
          script.remove();
          reject(new Error('runtime'));
        }, 10000);
        function finish(callback, value) {
          if (settled) return;
          settled = true;
          global.clearTimeout(timeout);
          callback(value);
        }
        script.src = source;
        script.async = true;
        script.onload = function () { finish(resolve); };
        script.onerror = function () { finish(reject, new Error('runtime')); };
        document.head.appendChild(script);
      });
    }

    function loadRuntime() {
      if (global.JyavaniQrGenerator && typeof global.JyavaniQrGenerator.renderBasicCanvas === 'function'
          && typeof global.qrcode === 'function') return Promise.resolve(global.JyavaniQrGenerator);
      if (runtimePromise) return runtimePromise;
      var base = typeof config.assetBase === 'string' ? config.assetBase : '';
      var version = encodeURIComponent(typeof config.assetVersion === 'string' ? config.assetVersion : '');
      if (!/^\/static\/plugins\/qr-code-generator\/$/.test(base)) return Promise.reject(new Error('runtime'));
      runtimePromise = loadScript(base + 'qrcode.js?v=' + version)
        .then(function () { return loadScript(base + 'admin.js?v=' + version); })
        .then(function () {
          if (!global.JyavaniQrGenerator || typeof global.JyavaniQrGenerator.renderBasicCanvas !== 'function'
              || typeof global.qrcode !== 'function') throw new Error('runtime');
          return global.JyavaniQrGenerator;
        })
        .catch(function (error) {
          runtimePromise = null;
          throw error;
        });
      return runtimePromise;
    }

    function prefillUrlFromFragment(hash) {
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
        var parsed = new URL(path, global.location.origin);
        return parsed.origin === global.location.origin ? parsed.href : '';
      } catch (error) {
        return '';
      }
    }

    closeButton.setAttribute('aria-label', messages.close || 'Close');
    closeButton.textContent = '\u00d7';
    title.textContent = messages.quickTitle || 'Quick QR';
    description.textContent = messages.quickDescription || 'Generated locally with the Site Default Preset.';
    eyebrow.textContent = config.defaultPreset && config.defaultPreset.name ? config.defaultPreset.name : 'Classic';
    shareButton.textContent = messages.share || 'Share';
    downloadButton.textContent = messages.download || 'Download';

    function canvasBlob() {
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('blob')); }, 'image/png');
      });
    }

    function isolateBackground() {
      isolatedNodes = Array.prototype.slice.call(document.body.children).filter(function (node) {
        return node !== overlay;
      }).map(function (node) {
        var state = {node: node, inert: node.inert === true, ariaHidden: node.getAttribute('aria-hidden')};
        node.inert = true;
        node.setAttribute('aria-hidden', 'true');
        return state;
      });
    }

    function restoreBackground() {
      isolatedNodes.forEach(function (state) {
        state.node.inert = state.inert;
        if (state.ariaHidden === null) state.node.removeAttribute('aria-hidden');
        else state.node.setAttribute('aria-hidden', state.ariaHidden);
      });
      isolatedNodes = [];
    }

    function copyFallback(value, sequence) {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.reject(new Error('copy'));
      return navigator.clipboard.writeText(value).then(function () {
        if (sequence === modalSequence && !overlay.hidden) {
          status.textContent = messages.shareFallback || 'Image sharing is unavailable. The content URL was copied instead.';
        }
      }, function () {
        throw new Error('copy');
      });
    }

    function fileName() {
      var now = new Date();
      return 'qr-code-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '.png';
    }

    function close() {
      if (overlay.hidden) return;
      modalSequence += 1;
      overlay.hidden = true;
      document.documentElement.classList.remove('jqrg-quick-open');
      payload = '';
      runtimeFallbackUrl = '';
      downloadButton.textContent = messages.download || 'Download';
      restoreBackground();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      previousFocus = null;
    }

    function open(anchor, url) {
      previousFocus = anchor;
      modalSequence += 1;
      var openSequence = modalSequence;
      payload = prefillUrlFromFragment(url.hash);
      if (!payload) return;
      overlay.hidden = false;
      document.documentElement.classList.add('jqrg-quick-open');
      status.textContent = messages.preparing || 'Preparing QR code...';
      status.classList.remove('is-error');
      urlOutput.textContent = payload;
      runtimeFallbackUrl = '';
      downloadButton.textContent = messages.download || 'Download';
      shareButton.disabled = true;
      downloadButton.disabled = true;
      closeButton.focus();
      isolateBackground();
      loadRuntime().then(function (api) {
        if (openSequence !== modalSequence || overlay.hidden) return;
        api.renderBasicCanvas(canvas, payload, config.defaultPreset ? config.defaultPreset.settings : {}, global.qrcode);
        status.textContent = messages.ready || 'QR code ready.';
        shareButton.disabled = false;
        downloadButton.disabled = false;
      }).catch(function () {
        if (openSequence !== modalSequence || overlay.hidden) return;
        status.textContent = messages.shareFailed || 'The QR code could not be generated.';
        status.classList.add('is-error');
        runtimeFallbackUrl = url.href;
        downloadButton.textContent = messages.openGenerator || 'Open generator';
        downloadButton.disabled = false;
      });
    }

    document.addEventListener('click', function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var anchor = event.target.closest('a[href]');
      if (!anchor) return;
      var url;
      try { url = new URL(anchor.href, global.location.href); } catch (error) { return; }
      if (url.origin !== global.location.origin || url.searchParams.get('page') !== 'admin/tools/qr-code-generator'
          || !url.hash.startsWith('#jqrg_url=')) return;
      event.preventDefault();
      open(anchor, url);
    });

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    document.addEventListener('keydown', function (event) {
      if (overlay.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(panel.querySelectorAll('button:not(:disabled)'));
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }, true);

    downloadButton.addEventListener('click', function () {
      if (runtimeFallbackUrl) {
        global.open(runtimeFallbackUrl, '_blank', 'noopener');
        return;
      }
      if (!payload) return;
      canvasBlob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName();
        anchor.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    });

    shareButton.addEventListener('click', function () {
      if (!payload) return;
      var sharePayload = payload;
      var shareSequence = modalSequence;
      shareButton.disabled = true;
      canvasBlob().catch(function () { return null; }).then(function (blob) {
        if (blob && typeof File === 'function' && navigator.share && navigator.canShare) {
          var file = new File([blob], fileName(), {type: 'image/png'});
          var canShareFiles = false;
          try { canShareFiles = navigator.canShare({files: [file]}); } catch (error) {}
          if (canShareFiles) {
            return navigator.share({files: [file], title: messages.quickTitle || 'Quick QR'}).catch(function (error) {
              if (error && error.name === 'AbortError') throw error;
              return copyFallback(sharePayload, shareSequence);
            });
          }
        }
        return copyFallback(sharePayload, shareSequence);
      }).catch(function (error) {
        if (error && error.name === 'AbortError') return;
        if (shareSequence === modalSequence && !overlay.hidden) {
          status.textContent = error && error.message === 'copy'
            ? (messages.copyFailed || 'Could not copy the content URL.')
            : (messages.shareFailed || 'The QR code could not be shared.');
          status.classList.add('is-error');
        }
      }).finally(function () {
        if (shareSequence === modalSequence && !overlay.hidden) shareButton.disabled = false;
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
