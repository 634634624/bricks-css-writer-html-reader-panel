(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});
  var cfg = w.CM6GPT_Lite_Config || w.CM6GPT_Config || {};
  var UI_PREFS_KEY = 'cm6gpt_ui_prefs_v1';

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][panel]', context, err); } catch (_) { /* noop */ }
  }

  function getBridgeRuntimeUtils() {
    if (
      !ns.BridgeRuntimeUtils
      || typeof ns.BridgeRuntimeUtils.createManagedAnimationFrame !== 'function'
      || typeof ns.BridgeRuntimeUtils.copyTextWithFallback !== 'function'
      || typeof ns.BridgeRuntimeUtils.focusDomNode !== 'function'
      || typeof ns.BridgeRuntimeUtils.blurActiveElementWithin !== 'function'
      || typeof ns.BridgeRuntimeUtils.trackListener !== 'function'
      || typeof ns.BridgeRuntimeUtils.drainCleanupQueue !== 'function'
      || typeof ns.BridgeRuntimeUtils.removeDomNode !== 'function'
    ) {
      throw new Error('CM6GPT.BridgeRuntimeUtils lifecycle helpers missing');
    }
    return ns.BridgeRuntimeUtils;
  }

  function createManagedAnimationFrame(frameApi) {
    return getBridgeRuntimeUtils().createManagedAnimationFrame(frameApi);
  }

  function removeDomNode(node) {
    return getBridgeRuntimeUtils().removeDomNode(node, _warn);
  }

  function copyTextWithFallback(text, opts) {
    return getBridgeRuntimeUtils().copyTextWithFallback(text, opts);
  }

  function focusDomNode(node, opts) {
    return getBridgeRuntimeUtils().focusDomNode(node, opts, _warn);
  }

  function blurActiveElementWithin(rootNode, docRef, context) {
    return getBridgeRuntimeUtils().blurActiveElementWithin(rootNode, {
      document: docRef,
      context: context
    }, _warn);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function setIcon(button, iconClass, ariaLabel, badge) {
    if (!button) return;
    button.innerHTML = '';
    var icon = el('i', iconClass || '');
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    if (badge) {
      var marker = el('span', 'cm6gpt-icon-badge', String(badge));
      marker.setAttribute('aria-hidden', 'true');
      button.appendChild(marker);
      button.classList.add('has-badge');
    } else {
      button.classList.remove('has-badge');
    }
    if (ariaLabel) button.setAttribute('aria-label', String(ariaLabel));
  }

  function setGlyphIcon(button, glyph, ariaLabel, badge) {
    if (!button) return;
    button.innerHTML = '';
    var mark = el('span', 'cm6gpt-icon-glyph', String(glyph || ''));
    mark.setAttribute('aria-hidden', 'true');
    button.appendChild(mark);
    if (badge) {
      var marker = el('span', 'cm6gpt-icon-badge', String(badge));
      marker.setAttribute('aria-hidden', 'true');
      button.appendChild(marker);
      button.classList.add('has-badge');
    } else {
      button.classList.remove('has-badge');
    }
    if (ariaLabel) button.setAttribute('aria-label', String(ariaLabel));
  }

  function setRecipeStarIcon(button, active, ariaLabel) {
    if (!button) return;
    var nsSvg = 'http://www.w3.org/2000/svg';
    button.innerHTML = '';
    var svg = document.createElementNS(nsSvg, 'svg');
    svg.setAttribute('class', 'cm6gpt-recipe-star-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', active ? 'currentColor' : 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(nsSvg, 'path');
    path.setAttribute('d', 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a.53.53 0 0 0 .398.29l5.166.751a.53.53 0 0 1 .294.904l-3.738 3.644a.53.53 0 0 0-.152.47l.882 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a.53.53 0 0 0-.492 0l-4.62 2.43a.53.53 0 0 1-.77-.56l.882-5.14a.53.53 0 0 0-.152-.47L3.357 8.92a.53.53 0 0 1 .294-.904l5.166-.75a.53.53 0 0 0 .398-.29z');
    svg.appendChild(path);
    button.appendChild(svg);
    button.classList.toggle('is-active', !!active);
    if (ariaLabel) button.setAttribute('aria-label', String(ariaLabel));
  }

  var PANEL_LISTENER_KEYS = [
    'refresh',
    'close',
    'scopeMode',
    'layerMode',
    'htmlLensMode',
    'cssLensMode',
    'cssPropertyFilter',
    'cssContextTarget',
    'cssApply',
    'cssClassAdd',
    'undo',
    'redo',
    'htmlCopy',
    'cssCopy'
  ];

  function createPanelListenerRegistry() {
    var registry = {};
    for (var i = 0; i < PANEL_LISTENER_KEYS.length; i++) {
      registry[PANEL_LISTENER_KEYS[i]] = [];
    }
    return registry;
  }

  function ensurePanelListenerRegistry(root) {
    var registry = root && root.__cm6gptPanelListeners && typeof root.__cm6gptPanelListeners === 'object'
      ? root.__cm6gptPanelListeners
      : null;
    if (!registry) registry = createPanelListenerRegistry();
    for (var i = 0; i < PANEL_LISTENER_KEYS.length; i++) {
      var key = PANEL_LISTENER_KEYS[i];
      if (!Array.isArray(registry[key])) registry[key] = [];
    }
    if (root) root.__cm6gptPanelListeners = registry;
    return registry;
  }

  function resetPanelListenerRegistry(root) {
    var registry = ensurePanelListenerRegistry(root);
    for (var i = 0; i < PANEL_LISTENER_KEYS.length; i++) {
      registry[PANEL_LISTENER_KEYS[i]].length = 0;
    }
    return registry;
  }

  function clearChildren(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function renderContextChip(label, className, opts) {
    opts = opts || {};
    var clickable = !!opts.clickable;
    var tag = clickable ? 'button' : 'span';
    var chip = el(tag, 'cm6gpt-context-chip' + (className ? (' ' + className) : ''), String(label || ''));
    if (clickable) {
      chip.type = 'button';
      chip.dataset.cssTargetKind = String(opts.kind || '').trim();
      chip.dataset.cssTargetRef = String(opts.ref || '').trim();
      chip.dataset.cssTargetName = String(opts.name || '').trim();
      chip.dataset.cssTargetId = String(opts.id || '').trim();
      chip.dataset.cssTargetLabel = String(label || '').trim();
      chip.title = String(opts.title || label || '').trim();
      chip.setAttribute('aria-label', String(opts.ariaLabel || ('Switch CSS target to ' + String(label || ''))).trim());
      chip.setAttribute('aria-pressed', opts.active ? 'true' : 'false');
    }
    return chip;
  }

  function renderStructuredPaneContext(node, which, payload) {
    if (!node) return;
    clearChildren(node);
    node.classList.remove('is-structured', 'is-empty');
    if (!isRecord(payload)) {
      node.textContent = String(payload || '');
      if (!String(payload || '').trim()) node.classList.add('is-empty');
      return;
    }

    node.classList.add('is-structured');

    if (which === 'html') {
      var semantic = String(payload.semantic || payload.label || '').trim();
      var tag = String(payload.tag || '').trim().toLowerCase();
      var summaryParts = [];
      if (payload.id) summaryParts.push('#' + String(payload.id).trim());
      if (tag && (!semantic || tag !== semantic)) summaryParts.push('<' + tag + '>');
      if (payload.scope && payload.scope !== 'self') summaryParts.push(String(payload.scope).trim());
      var summaryText = summaryParts.join(' · ') || String(payload.summary || '').trim();
      var htmlWrap = el('div', 'cm6gpt-context-inline');
      if (semantic) htmlWrap.appendChild(el('span', 'cm6gpt-context-caption', semantic));
      if (summaryText) htmlWrap.appendChild(el('span', 'cm6gpt-context-summary', summaryText));
      if (!semantic && !summaryText) {
        node.classList.add('is-empty');
        return;
      }
      node.appendChild(htmlWrap);
      return;
    }

    var cssWrap = el('div', 'cm6gpt-context-targets');
    var targets = Array.isArray(payload.targets) ? payload.targets : [];
    var maxTargets = 4;
    for (var i = 0; i < targets.length && i < maxTargets; i++) {
      var target = isRecord(targets[i]) ? targets[i] : null;
      if (!target || !target.label) continue;
      var chipClass = '';
      if (target.kind) chipClass += ' is-' + String(target.kind).trim();
      if (target.active) chipClass += ' is-active';
      var isSelectableTarget = !!(
        target.kind &&
        (
          target.ref ||
          target.name ||
          target.id ||
          target.kind === 'id'
        )
      );
      cssWrap.appendChild(renderContextChip(target.label, chipClass.trim(), {
        clickable: isSelectableTarget,
        kind: target.kind,
        ref: target.ref,
        name: target.name,
        id: target.id,
        title: target.title,
        active: !!target.active
      }));
    }
    if (targets.length > maxTargets) {
      cssWrap.appendChild(renderContextChip('+' + String(targets.length - maxTargets), 'is-count'));
    }
    if (!cssWrap.childNodes.length) {
      var emptyText = String(payload.empty || payload.summary || payload.label || '').trim();
      if (emptyText) {
        cssWrap.appendChild(el('span', 'cm6gpt-context-summary is-muted', emptyText));
      } else {
        node.classList.add('is-empty');
      }
    }
    node.appendChild(cssWrap);
  }

  function summarizeCssInfoText(text) {
    var lines = String(text || '').split('\n').map(function (line) {
      return String(line || '').trim();
    }).filter(Boolean);
    var rows = [];
    var note = '';

    function pushRow(label, value, kind) {
      label = String(label || '').trim();
      value = String(value || '').trim();
      kind = String(kind || '').trim();
      if (!label || !value) return;
      rows.push({ label: label, value: value, kind: kind });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      if (line.indexOf('Source:') === 0) {
        var sourceValue = line.slice('Source:'.length).trim();
        var selectorSplit = sourceValue.split(' · selector: ');
        pushRow('Source', selectorSplit[0] || sourceValue, 'source');
        if (selectorSplit[1]) pushRow('Selector', selectorSplit[1], 'selector');
        continue;
      }
      if (line === 'Page mode') {
        pushRow('Mode', 'Page', 'mode');
        continue;
      }
      if (line.indexOf('selected id:') === 0) {
        pushRow('Selected', line.slice('selected id:'.length).trim(), 'selected');
        continue;
      }
      if (line.indexOf('Write target:') === 0) {
        pushRow('Target', line.slice('Write target:'.length).trim(), 'target');
        continue;
      }
      if (line.indexOf('Class target:') === 0) {
        pushRow('Class', line.slice('Class target:'.length).trim(), 'class');
        continue;
      }
      if (line.indexOf('Property filter:') === 0) {
        pushRow('Filter', line.slice('Property filter:'.length).trim(), 'filter');
        continue;
      }
      if (line.indexOf('Element:') === 0) {
        pushRow('Element', line.slice('Element:'.length).trim(), 'element');
        continue;
      }
      if (line.indexOf('Apply gate:') === 0) {
        pushRow('Gate', line.slice('Apply gate:'.length).trim(), 'gate');
        continue;
      }
      if (line.indexOf('Children:') === 0) {
        pushRow('Children', line.slice('Children:'.length).trim(), 'children');
        continue;
      }
      if (line.indexOf('pageSettings.customCss is the active page write target') === 0) {
        pushRow('Target', 'pageSettings.customCss', 'target');
        continue;
      }
      if (line.indexOf('Switch to Write for full context info.') === 0) {
        note = 'Switch to Write for full target details.';
      }
    }

    if (!rows.length && lines.length) pushRow('Context', lines[0], 'raw');

    return { rows: rows.slice(0, 6), note: note };
  }

  function createManagedTimeoutRegistry(timerApi) {
    timerApi = timerApi || {};
    var setManagedTimeout = typeof timerApi.setTimeout === 'function' ? timerApi.setTimeout : setTimeout;
    var clearManagedTimeout = typeof timerApi.clearTimeout === 'function' ? timerApi.clearTimeout : clearTimeout;
    var activeIds = [];

    function removeId(id) {
      var idx = activeIds.indexOf(id);
      if (idx === -1) return false;
      activeIds.splice(idx, 1);
      return true;
    }

    function schedule(callback, delay) {
      if (typeof callback !== 'function') return 0;
      var timeoutId = setManagedTimeout(function () {
        removeId(timeoutId);
        callback();
      }, delay);
      activeIds.push(timeoutId);
      return timeoutId;
    }

    function clear(timeoutId) {
      if (!timeoutId) return false;
      if (!removeId(timeoutId)) return false;
      clearManagedTimeout(timeoutId);
      return true;
    }

    function clearAll() {
      var cleared = 0;
      while (activeIds.length) {
        clearManagedTimeout(activeIds.pop());
        cleared += 1;
      }
      return cleared;
    }

    function pending() {
      return activeIds.length > 0;
    }

    function size() {
      return activeIds.length;
    }

    return {
      schedule: schedule,
      clear: clear,
      clearAll: clearAll,
      pending: pending,
      size: size
    };
  }

  function createRecipeHoverPreviewRuntime(opts) {
    opts = opts || {};
    var hoverDelayMs = Math.max(0, Number(opts.delayMs || 50));
    var hoverTimeouts = createManagedTimeoutRegistry(opts.timerApi);
    var hoveredId = '';
    var canPreview = typeof opts.canPreview === 'function'
      ? opts.canPreview
      : function () { return true; };
    var resolveRecipe = typeof opts.resolveRecipe === 'function'
      ? opts.resolveRecipe
      : function () { return null; };
    var showPreview = typeof opts.showPreview === 'function'
      ? opts.showPreview
      : function () {};
    var clearPreview = typeof opts.clearPreview === 'function'
      ? opts.clearPreview
      : function () {};

    function clear(emitClear) {
      hoveredId = '';
      hoverTimeouts.clearAll();
      if (!emitClear) return;
      try { clearPreview(); } catch (e0) { _warn('createRecipeHoverPreviewRuntime.clearPreview', e0); }
    }

    function schedule(id) {
      id = String(id || '');
      if (!id || !canPreview() || id === hoveredId) return false;
      hoveredId = id;
      hoverTimeouts.clearAll();
      hoverTimeouts.schedule(function () {
        var recipe = null;
        if (hoveredId !== id) return;
        try { recipe = resolveRecipe(id); } catch (e0) { _warn('createRecipeHoverPreviewRuntime.resolveRecipe', e0); recipe = null; }
        if (!recipe || !recipe.body) return;
        try { showPreview(recipe); } catch (e1) { _warn('createRecipeHoverPreviewRuntime.showPreview', e1); }
      }, hoverDelayMs);
      return true;
    }

    function cleanup() {
      clear(true);
    }

    return {
      schedule: schedule,
      clear: clear,
      cleanup: cleanup,
      pending: hoverTimeouts.pending,
      size: hoverTimeouts.size
    };
  }

  /* ── Custom Select Dropdown (cyberpunk terminal style) ── */
  function createCustomSelect(opts) {
    opts = opts || {};
    var currentValue = '';
    var currentLabel = '';
    var optionItems = [];
    var changeCallbacks = [];
    var isOpen = false;

    var root = el('div', 'cm6gpt-custom-select');
    root.setAttribute('role', 'listbox');
    if (opts.ariaLabel) root.setAttribute('aria-label', opts.ariaLabel);

    var trigger = el('button', 'cm6gpt-custom-select-trigger');
    trigger.type = 'button';
    var triggerLabel = el('span', 'cm6gpt-custom-select-label', '');
    var triggerArrow = el('span', 'cm6gpt-custom-select-arrow');
    triggerArrow.innerHTML = '<svg width="10" height="6" viewBox="0 0 10 6" xmlns="http://www.w3.org/2000/svg"><path d="M0 0l5 6 5-6z" fill="#00f0ff"/></svg>';
    trigger.appendChild(triggerLabel);
    trigger.appendChild(triggerArrow);
    root.appendChild(trigger);

    var dropdown = el('div', 'cm6gpt-custom-select-dropdown');
    dropdown.style.display = 'none';
    root.appendChild(dropdown);

    function openDropdown() {
      if (isOpen) return;
      isOpen = true;
      dropdown.style.display = '';
      root.classList.add('is-open');
      var sel = dropdown.querySelector('.is-selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
    function closeDropdown() {
      if (!isOpen) return;
      isOpen = false;
      dropdown.style.display = 'none';
      root.classList.remove('is-open');
    }
    function onTriggerClick(e) {
      e.stopPropagation();
      if (isOpen) closeDropdown(); else openDropdown();
    }
    function onDocumentClick(e) {
      if (isOpen && !root.contains(e.target)) closeDropdown();
    }
    trigger.addEventListener('click', onTriggerClick);
    document.addEventListener('click', onDocumentClick);
    function renderOptions() {
      clearChildren(dropdown);
      for (var i = 0; i < optionItems.length; i++) {
        (function (item) {
          var row = el('div', 'cm6gpt-custom-select-item');
          row.setAttribute('role', 'option');
          var isSel = item.value === currentValue;
          if (isSel) { row.classList.add('is-selected'); row.setAttribute('aria-selected', 'true'); }
          row.textContent = (isSel ? '\u2713 ' : '  ') + item.label;
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            selectValue(item.value, true);
            closeDropdown();
          });
          dropdown.appendChild(row);
        })(optionItems[i]);
      }
    }
    function selectValue(val, notify) {
      currentValue = val;
      currentLabel = '';
      for (var i = 0; i < optionItems.length; i++) {
        if (optionItems[i].value === val) { currentLabel = optionItems[i].label; break; }
      }
      triggerLabel.textContent = currentLabel || val || '';
      renderOptions();
      if (notify) {
        for (var j = 0; j < changeCallbacks.length; j++) {
          try { changeCallbacks[j](currentValue); } catch (e) { _warn('selectValue', e); }
        }
      }
    }
    function setOptions(arr) {
      optionItems = [];
      for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (typeof item === 'string') optionItems.push({ value: item, label: item });
        else if (item && typeof item === 'object') optionItems.push({ value: item.value || '', label: item.label || item.value || '' });
      }
      renderOptions();
      var found = false;
      for (var j = 0; j < optionItems.length; j++) {
        if (optionItems[j].value === currentValue) { found = true; triggerLabel.textContent = optionItems[j].label; break; }
      }
      if (!found && optionItems.length) {
        currentValue = optionItems[0].value;
        currentLabel = optionItems[0].label;
        triggerLabel.textContent = currentLabel;
      }
    }
    Object.defineProperty(root, 'value', {
      get: function () { return currentValue; },
      set: function (v) { selectValue(v, false); }
    });
    Object.defineProperty(root, 'disabled', {
      get: function () { return trigger.disabled; },
      set: function (v) { trigger.disabled = !!v; if (v) closeDropdown(); }
    });
    Object.defineProperty(root, 'options', {
      get: function () { return optionItems.map(function (item) { return { value: item.value }; }); }
    });
    var pendingOptions = [];
    root.appendChild = function (child) {
      if (child && child.tagName === 'OPTION') {
        pendingOptions.push({ value: child.value || '', label: child.textContent || child.value || '' });
      } else {
        HTMLElement.prototype.appendChild.call(root, child);
      }
    };
    root._flushPendingOptions = function () {
      if (pendingOptions.length) {
        optionItems = pendingOptions.slice();
        pendingOptions = [];
        renderOptions();
        if (optionItems.length) {
          triggerLabel.textContent = optionItems[0].label;
          currentValue = optionItems[0].value;
          currentLabel = optionItems[0].label;
        }
      }
    };
    function destroy() {
      closeDropdown();
      try { trigger.removeEventListener('click', onTriggerClick); } catch (e0) { _warn('createCustomSelect', e0); }
      try { document.removeEventListener('click', onDocumentClick); } catch (e1) { _warn('createCustomSelect', e1); }
    }
    root.__cm6gptCustomSelectCleanup = destroy;
    return {
      root: root, trigger: trigger,
      setValue: function (val) { selectValue(val, false); },
      getValue: function () { return currentValue; },
      setOptions: setOptions,
      onChange: function (cb) { if (typeof cb === 'function') changeCallbacks.push(cb); },
      close: closeDropdown,
      destroy: destroy
    };
  }

  var Panel = {
    _clampFontSize: function (raw) {
      var n = Number(raw);
      if (!isFinite(n)) n = 12;
      n = Math.round(n);
      if (n < 9) n = 9;
      if (n > 16) n = 16;
      return n;
    },

    _clampRecipeSplitPercent: function (raw) {
      var n = Number(raw);
      if (!isFinite(n)) n = 38;
      n = Math.round(n);
      if (n < 28) n = 28;
      if (n > 72) n = 72;
      return n;
    },

    _normalizeRecentRecipeIds: function (raw) {
      var src = Array.isArray(raw) ? raw : [];
      var out = [];
      var seen = {};
      for (var i = 0; i < src.length; i++) {
        var id = String(src[i] == null ? '' : src[i]).trim();
        if (!id || seen[id]) continue;
        seen[id] = true;
        out.push(id);
        if (out.length >= 8) break;
      }
      return out;
    },

    _normalizeFavoriteRecipeIds: function (raw) {
      var src = Array.isArray(raw) ? raw : [];
      var out = [];
      var seen = {};
      for (var i = 0; i < src.length; i++) {
        var id = String(src[i] == null ? '' : src[i]).trim();
        if (!id || seen[id]) continue;
        seen[id] = true;
        out.push(id);
        if (out.length >= 48) break;
      }
      return out;
    },

    // Lite: single-mode normalizers — lens/layer modes disabled in Lite version
    _normalizeHtmlLensMode: function (raw) {
      var mode = String(raw || '').toLowerCase();
      if (mode === 'minimal' || mode === 'edit' || mode === 'plain' || mode === 'read') return 'minimal';
      return 'minimal';
    },

    _normalizeCssLensMode: function (raw) {
      var mode = String(raw || '').toLowerCase();
      if (mode === 'minimal' || mode === 'edit' || mode === 'plain') return 'minimal';
      if (mode === 'global' || mode === 'all' || mode === 'full') return 'global';
      return 'minimal';
    },

    _normalizeLayerMode: function (raw) {
      void raw;
      return 'l2';
    },

    _copyTextWithFallback: copyTextWithFallback,

    _loadUiPrefs: function () {
      var out = {
        dockMode: 'centered',
        flushDock: false,
        editorFontSize: 12,
        softWrap: true,
        scopeMode: 'self',
        layerMode: 'l2',
        htmlLensMode: 'minimal',
        cssLensMode: 'minimal',
        recipeSplitPercent: 38,
        recentRecipeIds: [],
        favoriteRecipeIds: [],
        recipeFavoritesOnly: false
      };
      try {
        var raw = w.localStorage ? w.localStorage.getItem(UI_PREFS_KEY) : '';
        if (!raw) return out;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (String(parsed.dockMode || '') === 'full') out.dockMode = 'full';
          out.flushDock = !!parsed.flushDock;
          out.editorFontSize = this._clampFontSize(parsed.editorFontSize);
          out.softWrap = !!parsed.softWrap;
          if (String(parsed.scopeMode || '') === 'page') {
            out.scopeMode = 'page';
          }
          out.layerMode = this._normalizeLayerMode(parsed.layerMode);
          out.htmlLensMode = this._normalizeHtmlLensMode(parsed.htmlLensMode);
          out.cssLensMode = this._normalizeCssLensMode(parsed.cssLensMode);
          out.recipeSplitPercent = this._clampRecipeSplitPercent(parsed.recipeSplitPercent);
          out.recentRecipeIds = this._normalizeRecentRecipeIds(parsed.recentRecipeIds);
          out.favoriteRecipeIds = this._normalizeFavoriteRecipeIds(parsed.favoriteRecipeIds);
          out.recipeFavoritesOnly = !!parsed.recipeFavoritesOnly;
        }
      } catch (e) { _warn('_loadUiPrefs', e); }
      // Always boot in normal editing context; advanced filters remain user-toggleable per session.
      out.scopeMode = 'self';
      out.layerMode = 'l2';
      out.htmlLensMode = 'minimal';
      out.cssLensMode = this._normalizeCssLensMode(out.cssLensMode);
      return out;
    },

    _saveUiPrefs: function (prefs) {
      if (!prefs || typeof prefs !== 'object') return;
      var payload = {
        dockMode: (String(prefs.dockMode || '') === 'full') ? 'full' : 'centered',
        flushDock: !!prefs.flushDock,
        editorFontSize: this._clampFontSize(prefs.editorFontSize),
        softWrap: !!prefs.softWrap,
        scopeMode: (function (v) {
          v = String(v || '').toLowerCase();
          return v === 'page' ? 'page' : 'self';
        })(prefs.scopeMode),
        layerMode: this._normalizeLayerMode(prefs.layerMode),
        htmlLensMode: this._normalizeHtmlLensMode(prefs.htmlLensMode),
        cssLensMode: this._normalizeCssLensMode(prefs.cssLensMode),
        recipeSplitPercent: this._clampRecipeSplitPercent(prefs.recipeSplitPercent),
        recentRecipeIds: this._normalizeRecentRecipeIds(prefs.recentRecipeIds),
        favoriteRecipeIds: this._normalizeFavoriteRecipeIds(prefs.favoriteRecipeIds),
        recipeFavoritesOnly: !!prefs.recipeFavoritesOnly
      };
      try {
        if (w.localStorage) w.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(payload));
      } catch (e) { _warn('_saveUiPrefs', e); }
    },

    _applyEditorFontSize: function (fontSizePx) {
      var px = this._clampFontSize(fontSizePx);
      try {
        document.documentElement.style.setProperty('--cm6gpt-editor-font-size', px + 'px');
      } catch (e) { _warn('_applyEditorFontSize', e); }
      return px;
    },

    _ensureLauncher: function (panelRoot) {
      var launcher = document.getElementById('cm6gpt-launcher');
      if (!launcher) {
        launcher = el('button', 'cm6gpt-launcher cm6gpt-hidden');
        launcher.id = 'cm6gpt-launcher';
        launcher.type = 'button';
        launcher.title = 'Open QCSS panel';
        launcher.setAttribute('aria-label', 'Open QCSS panel');
        launcher.innerHTML = '<span class="bricks-svg-wrapper"><i class="fab fa-css3-alt" aria-hidden="true"></i></span>';
        document.body.appendChild(launcher);
      }
      if (!launcher.__cm6gptBound) {
        launcher.__cm6gptBound = true;
        launcher.addEventListener('click', function () {
          if (!panelRoot || !panelRoot.classList) return;
          panelRoot.classList.remove('cm6gpt-hidden');
          document.documentElement.classList.add('cm6gpt-panel-open');
          launcher.classList.add('cm6gpt-hidden');
          if (typeof panelRoot.__cm6gptLayoutSync === 'function') {
            try { panelRoot.__cm6gptLayoutSync(); } catch (e) { _warn('_ensureLauncher', e); }
          }
          if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
            ns.editors.refreshMountedEditors();
          }
        });
      }
      return launcher;
    },

    create: function () {
      if (document.getElementById('cm6gpt-panel')) {
        var existing = document.getElementById('cm6gpt-panel');
        var existingLauncher = this._ensureLauncher(existing);
        if (existingLauncher) {
          existingLauncher.classList.toggle('cm6gpt-hidden', !existing.classList.contains('cm6gpt-hidden'));
        }
        this._installLayoutSync(existing);
        this._requestLayoutSync(existing);
        resetPanelListenerRegistry(existing);
        if (existing.__cm6gptPanelApi && typeof existing.__cm6gptPanelApi === 'object') {
          return existing.__cm6gptPanelApi;
        }
        return this._apiFromExisting(existing);
      }

      var self = this;
      document.documentElement.classList.add('cm6gpt-panel-open');

      var root = el('section', '');
      root.id = 'cm6gpt-panel';
      root.setAttribute('aria-label', 'CM6GPT Bricks HTML and CSS panel');
      var uiPrefs = this._loadUiPrefs();
      root.classList.toggle('cm6gpt-dock-full', uiPrefs.dockMode === 'full');
      root.classList.toggle('cm6gpt-dock-flush', !!uiPrefs.flushDock);
      root.classList.toggle('cm6gpt-wrap-on', !!uiPrefs.softWrap);
      uiPrefs.editorFontSize = this._applyEditorFontSize(uiPrefs.editorFontSize);
      var panelUiTimeouts = createManagedTimeoutRegistry();

      function schedulePanelUiTimeout(callback, delay) {
        return panelUiTimeouts.schedule(callback, delay);
      }

      var resizer = el('div', 'cm6gpt-resizer');
      resizer.setAttribute('aria-hidden', 'true');
      root.appendChild(resizer);

      var header = el('div', 'cm6gpt-header');
      var title = el('div', 'cm6gpt-title');
      title.appendChild(el('span', '', 'QCSS'));
      header.appendChild(title);

      var toolbar = el('div', 'cm6gpt-toolbar');
      var chipHtml = el('button', 'cm6gpt-chip is-active', 'HTML');
      chipHtml.type = 'button';
      chipHtml.title = 'Toggle HTML pane';
      chipHtml.dataset.mode = 'html';
      var chipCss = el('button', 'cm6gpt-chip is-active', 'CSS');
      chipCss.type = 'button';
      chipCss.title = 'Toggle CSS pane';
      chipCss.dataset.mode = 'css';
      var chipUndo = el('button', 'cm6gpt-chip cm6gpt-chip-icon', '↶');
      chipUndo.type = 'button';
      chipUndo.title = 'Undo (Cmd/Ctrl + Z)';
      chipUndo.dataset.mode = 'undo';
      chipUndo.disabled = true;
      var chipRedo = el('button', 'cm6gpt-chip cm6gpt-chip-icon', '↷');
      chipRedo.type = 'button';
      chipRedo.title = 'Redo (Cmd/Ctrl + Shift + Z)';
      chipRedo.dataset.mode = 'redo';
      chipRedo.disabled = true;
      toolbar.appendChild(chipHtml);
      toolbar.appendChild(chipCss);
      toolbar.appendChild(chipUndo);
      toolbar.appendChild(chipRedo);
      header.appendChild(toolbar);

      var actions = el('div', 'cm6gpt-actions');
      var btnDock = el('button', 'cm6gpt-btn');
      btnDock.type = 'button';
      btnDock.title = 'Dock mode';
      btnDock.dataset.action = 'dock-mode';
      setIcon(btnDock, 'fas fa-columns', 'Dock mode');
      var btnFlush = el('button', 'cm6gpt-btn');
      btnFlush.type = 'button';
      btnFlush.title = 'Flush mode';
      btnFlush.dataset.action = 'flush-dock';
      setIcon(btnFlush, 'fas fa-compress-arrows-alt', 'Flush mode');
      var btnFontDown = el('button', 'cm6gpt-btn');
      btnFontDown.type = 'button';
      btnFontDown.title = 'Smaller editor font';
      btnFontDown.dataset.action = 'font-down';
      setGlyphIcon(btnFontDown, 'A', 'Smaller editor font', '-');
      var btnFontUp = el('button', 'cm6gpt-btn');
      btnFontUp.type = 'button';
      btnFontUp.title = 'Larger editor font';
      btnFontUp.dataset.action = 'font-up';
      setGlyphIcon(btnFontUp, 'A', 'Larger editor font', '+');
      var btnWrap = el('button', 'cm6gpt-btn');
      btnWrap.type = 'button';
      btnWrap.title = 'Toggle line wrapping';
      btnWrap.dataset.action = 'toggle-wrap';
      setIcon(btnWrap, 'fas fa-align-left', 'Toggle line wrapping');
      var btnRecipes = el('button', 'cm6gpt-btn');
      btnRecipes.type = 'button';
      btnRecipes.title = 'Recipe Catalog';
      btnRecipes.dataset.action = 'recipes';
      setIcon(btnRecipes, 'fas fa-book-open', 'Recipe Catalog');
      var btnVarSheet = el('button', 'cm6gpt-btn');
      btnVarSheet.type = 'button';
      btnVarSheet.title = 'Variable Cheat Sheet';
      btnVarSheet.dataset.action = 'var-sheet';
      setIcon(btnVarSheet, 'fas fa-swatchbook', 'Variable Cheat Sheet');
      var btnRefresh = el('button', 'cm6gpt-btn');
      btnRefresh.type = 'button';
      btnRefresh.title = 'Refresh snapshots';
      btnRefresh.dataset.action = 'refresh';
      setIcon(btnRefresh, 'fas fa-sync-alt', 'Refresh snapshots');
      var btnMin = el('button', 'cm6gpt-btn');
      btnMin.type = 'button';
      btnMin.title = 'Minimize panel';
      btnMin.dataset.action = 'minimize';
      setIcon(btnMin, 'fas fa-window-minimize', 'Minimize panel');
      var btnClose = el('button', 'cm6gpt-btn is-danger');
      btnClose.type = 'button';
      btnClose.title = 'Close panel';
      btnClose.dataset.action = 'close';
      setIcon(btnClose, 'fas fa-times', 'Close panel');
      actions.appendChild(btnDock);
      actions.appendChild(btnFlush);
      actions.appendChild(btnFontDown);
      actions.appendChild(btnFontUp);
      actions.appendChild(btnWrap);
      actions.appendChild(btnRecipes);
      actions.appendChild(btnVarSheet);
      actions.appendChild(btnRefresh);
      actions.appendChild(btnMin);
      actions.appendChild(btnClose);
      actions.addEventListener('wheel', function (e) {
        if (!e || !actions || !isFinite(e.deltaY)) return;
        if (Math.abs(e.deltaY) < 1) return;
        actions.scrollLeft += e.deltaY;
        try { e.preventDefault(); } catch (e0) { _warn('create', e0); }
      }, { passive: false });
      header.appendChild(actions);

      root.appendChild(header);

      var contextRow = el('div', 'cm6gpt-context-row');
      var contextHtml = el('div', 'cm6gpt-context-text is-html', '');
      var contextCss = el('div', 'cm6gpt-context-text is-css', '');
      var scopeModeUi = this._createScopeModeGroup(uiPrefs.scopeMode || 'self');
      var contextControls = el('div', 'cm6gpt-context-controls');
      contextControls.appendChild(scopeModeUi.root);
      contextRow.appendChild(contextHtml);
      contextRow.appendChild(contextControls);
      contextRow.appendChild(contextCss);
      root.appendChild(contextRow);

      var body = el('div', 'cm6gpt-body');
      var htmlPane = this._createPane('HTML', 'selected subtree', 'cm6gpt-html-editor');
      var cssPane = this._createPane('CSS', 'snapshot', 'cm6gpt-css-editor');
      var htmlHeadActions = el('div', 'cm6gpt-pane-head-actions cm6gpt-html-head-actions');
      var cssHeadActions = el('div', 'cm6gpt-pane-head-actions');
      htmlPane.head.insertBefore(htmlHeadActions, htmlPane.meta);
      cssPane.head.insertBefore(cssHeadActions, cssPane.meta);
      htmlPane.meta.textContent = '';
      htmlPane.meta.setAttribute('aria-hidden', 'true');
      cssPane.meta.textContent = '';
      cssPane.meta.setAttribute('aria-hidden', 'true');
      // --- Copy buttons (HTML + CSS) ---
      function createCopyBtn(which) {
        var btn = el('button', 'cm6gpt-pane-btn cm6gpt-copy-btn');
        btn.type = 'button';
        btn.title = 'Copy ' + which;
        setIcon(btn, 'fas fa-copy', 'Copy ' + which);
        var busy = false;
        btn.addEventListener('click', function () {
          if (busy) return;
          var cbs = which === 'HTML' ? listeners.htmlCopy : listeners.cssCopy;
          var text = '';
          for (var i = 0; i < cbs.length; i++) {
            try { text = cbs[i]() || text; } catch (e) { _warn('createCopyBtn', e); }
          }
          if (!text) return;
          busy = true;
          navigator.clipboard.writeText(text).then(function () {
            setIcon(btn, 'fas fa-check', 'Copied!');
            btn.title = 'Copied!';
            schedulePanelUiTimeout(function () {
              setIcon(btn, 'fas fa-copy', 'Copy ' + which);
              btn.title = 'Copy ' + which;
              busy = false;
            }, 1200);
          }, function () {
            busy = false;
          });
        });
        return btn;
      }
      var htmlCopyBtn = createCopyBtn('HTML');
      var cssCopyBtn = createCopyBtn('CSS');

      var htmlGateBadge = this._createGateBadge();
      htmlHeadActions.appendChild(htmlCopyBtn);
      htmlHeadActions.appendChild(htmlGateBadge);
      var htmlLensModeUi = { root: null, trigger: null, menu: null, buttons: [], setActive: function () {} };
      var cssLensToggleBtn = el('button', 'cm6gpt-mini-chip');
      cssLensToggleBtn.type = 'button';
      cssLensToggleBtn.dataset.cssLensToggle = 'global';
      setIcon(cssLensToggleBtn, 'fas fa-globe-americas', 'Global CSS lens');
      scopeModeUi.root.setAttribute('aria-label', 'Scope mode and CSS lens');
      scopeModeUi.root.appendChild(cssLensToggleBtn);
      var cssLensModeUi = {
        root: scopeModeUi.root,
        trigger: cssLensToggleBtn,
        menu: null,
        buttons: [cssLensToggleBtn],
        setActive: function (value) {
          var isGlobal = String(value || '') === 'global';
          cssLensToggleBtn.classList.toggle('is-active', isGlobal);
          cssLensToggleBtn.setAttribute('aria-pressed', isGlobal ? 'true' : 'false');
          cssLensToggleBtn.title = isGlobal
            ? 'Global CSS lens enabled'
            : 'Page CSS lens enabled · click for Global CSS lens';
          cssLensToggleBtn.setAttribute('aria-label', isGlobal ? 'Global CSS lens enabled' : 'Enable Global CSS lens');
        }
      };
      var cssPropertyFilterUi = this._createPropertyFilterGroup({
        class: true,
        id: false
      });
      var cssInfoState = { text: '', active: false };
      var cssInfoBtn = el('button', 'cm6gpt-pane-info');
      cssInfoBtn.type = 'button';
      cssInfoBtn.setAttribute('aria-label', 'CSS target summary');
      cssInfoBtn.setAttribute('aria-haspopup', 'dialog');
      cssInfoBtn.setAttribute('aria-expanded', 'false');
      setIcon(cssInfoBtn, 'fas fa-circle-info', 'CSS target summary');
      cssInfoBtn.title = 'CSS target summary';
      var cssInfoWrap = el('div', 'cm6gpt-pane-info-wrap');
      var cssInfoPopover = el('div', 'cm6gpt-pane-info-popover cm6gpt-hidden');
      var cssInfoPopoverTitle = el('div', 'cm6gpt-pane-info-popover-title', 'CSS target');
      var cssInfoPopoverBody = el('div', 'cm6gpt-pane-info-popover-body');
      var cssInfoPopoverNote = el('div', 'cm6gpt-pane-info-popover-note');
      cssInfoPopover.appendChild(cssInfoPopoverTitle);
      cssInfoPopover.appendChild(cssInfoPopoverBody);
      cssInfoPopover.appendChild(cssInfoPopoverNote);
      cssInfoWrap.appendChild(cssInfoBtn);
      cssInfoWrap.appendChild(cssInfoPopover);

      function setCssInfoPopoverOpen(open) {
        open = !!open;
        cssInfoPopover.classList.toggle('cm6gpt-hidden', !open);
        cssInfoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      function renderCssInfoPopover() {
        clearChildren(cssInfoPopoverBody);
        var summary = summarizeCssInfoText(cssInfoState.text);
        cssInfoWrap.classList.toggle('is-readonly', cssInfoState.active === false);
        if (!summary.rows.length) {
          var empty = el('div', 'cm6gpt-pane-info-popover-empty', 'No CSS target info');
          cssInfoPopoverBody.appendChild(empty);
          cssInfoPopoverNote.textContent = '';
          cssInfoBtn.classList.add('is-muted');
          cssInfoBtn.title = 'No CSS target info';
          return;
        }

        cssInfoBtn.classList.remove('is-muted');
        cssInfoBtn.title = cssInfoState.active === false ? 'CSS context summary' : 'CSS target summary';

        for (var i = 0; i < summary.rows.length; i++) {
          var row = summary.rows[i];
          if (!row) continue;
          var infoRow = el('div', 'cm6gpt-pane-info-row');
          if (row.kind) infoRow.classList.add('is-' + row.kind);
          var label = el('span', 'cm6gpt-pane-info-label', row.label);
          var value = el('span', 'cm6gpt-pane-info-value', row.value);
          infoRow.appendChild(label);
          infoRow.appendChild(value);
          cssInfoPopoverBody.appendChild(infoRow);
        }
        cssInfoPopoverNote.textContent = summary.note || (cssInfoState.active === false ? 'Read mode: summary only.' : '');
      }

      var panelGlobalTeardownFns = [];

      function trackPanelGlobalListener(target, type, handler, options) {
        return getBridgeRuntimeUtils().trackListener(panelGlobalTeardownFns, target, type, handler, options);
      }

      cssInfoBtn.addEventListener('click', function (e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (!String(cssInfoState.text || '').trim()) return;
        setCssInfoPopoverOpen(cssInfoPopover.classList.contains('cm6gpt-hidden'));
      });
      cssInfoWrap.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === 'Escape') {
          setCssInfoPopoverOpen(false);
          try { cssInfoBtn.focus(); } catch (e0) { _warn('renderCssInfoPopover', e0); }
        }
      });
      function onCssInfoDocumentClick(e) {
        if (!cssInfoWrap.contains(e.target)) setCssInfoPopoverOpen(false);
      }
      trackPanelGlobalListener(document, 'click', onCssInfoDocumentClick);
      renderCssInfoPopover();
      cssPropertyFilterUi.root.addEventListener('wheel', function (e) {
        if (!e || !cssPropertyFilterUi.root || !isFinite(e.deltaY)) return;
        if (Math.abs(e.deltaY) < 1) return;
        cssPropertyFilterUi.root.scrollLeft += e.deltaY;
        try { e.preventDefault(); } catch (e0) { _warn('renderCssInfoPopover', e0); }
      }, { passive: false });
      // cssApplyBtn removed — Lite version uses live-sync, no manual Apply CSS
      var cssAddClassBtn = this._createPaneActionButton('+ Class');
      cssAddClassBtn.dataset.action = 'add-css-class';
      cssAddClassBtn.disabled = true;
      cssAddClassBtn.title = 'Select a Bricks element to add class';
      setIcon(cssAddClassBtn, 'fas fa-plus', 'Add class');
      var cssAddClassWrap = el('div', 'cm6gpt-classadd-wrap');
      var cssAddClassPopover = el('div', 'cm6gpt-classadd-popover cm6gpt-hidden');
      var cssAddClassInput = el('input', 'cm6gpt-classadd-input');
      cssAddClassInput.type = 'text';
      cssAddClassInput.placeholder = 'new-class';
      cssAddClassInput.setAttribute('aria-label', 'Class name');
      cssAddClassInput.autocomplete = 'off';
      cssAddClassInput.spellcheck = false;
      var cssAddClassSubmitBtn = el('button', 'cm6gpt-classadd-mini');
      cssAddClassSubmitBtn.type = 'button';
      cssAddClassSubmitBtn.title = 'Add class';
      setIcon(cssAddClassSubmitBtn, 'fas fa-check', 'Add class');
      var cssAddClassCancelBtn = el('button', 'cm6gpt-classadd-mini is-cancel');
      cssAddClassCancelBtn.type = 'button';
      cssAddClassCancelBtn.title = 'Close';
      setIcon(cssAddClassCancelBtn, 'fas fa-times', 'Close');
      cssAddClassPopover.appendChild(cssAddClassInput);
      cssAddClassPopover.appendChild(cssAddClassSubmitBtn);
      cssAddClassPopover.appendChild(cssAddClassCancelBtn);
      cssAddClassWrap.appendChild(cssAddClassBtn);
      cssAddClassWrap.appendChild(cssAddClassPopover);
      cssHeadActions.appendChild(cssPropertyFilterUi.root);
      cssHeadActions.appendChild(cssAddClassWrap);
      cssHeadActions.appendChild(cssInfoWrap);
      cssHeadActions.appendChild(cssCopyBtn);
      htmlHeadActions.addEventListener('wheel', function (e) {
        if (!e || !htmlHeadActions || !isFinite(e.deltaY)) return;
        if (Math.abs(e.deltaY) < 1) return;
        htmlHeadActions.scrollLeft += e.deltaY;
        try { e.preventDefault(); } catch (e0) { _warn('renderCssInfoPopover', e0); }
      }, { passive: false });
      cssHeadActions.addEventListener('wheel', function (e) {
        if (!e || !cssHeadActions || !isFinite(e.deltaY)) return;
        if (Math.abs(e.deltaY) < 1) return;
        cssHeadActions.scrollLeft += e.deltaY;
        try { e.preventDefault(); } catch (e0) { _warn('renderCssInfoPopover', e0); }
      }, { passive: false });
      body.appendChild(htmlPane.pane);
      body.appendChild(cssPane.pane);
      root.appendChild(body);

      var status = el('div', 'cm6gpt-status');
      var statusMain = el('div', 'cm6gpt-status-main', 'Waiting for Bricks builder…');
      var statusSide = el('div', 'cm6gpt-status-side', 'No selection');
      status.appendChild(statusMain);
      status.appendChild(statusSide);
      root.appendChild(status);

      var miniDock = el('button', 'cm6gpt-mini-dock cm6gpt-hidden', 'QCSS');
      miniDock.type = 'button';
      miniDock.title = 'Restore panel';
      miniDock.setAttribute('aria-label', 'Restore panel');
      root.appendChild(miniDock);

      var feedbackLayer = el('div', 'cm6gpt-feedback-layer');
      feedbackLayer.setAttribute('aria-live', 'polite');
      feedbackLayer.setAttribute('aria-atomic', 'false');
      root.appendChild(feedbackLayer);

      var recipeModal = this._createRecipeManagerModal();
      var varSheetModal = this._createVarCheatSheetModal();

      document.body.appendChild(root);
      document.body.appendChild(recipeModal.root);
      document.body.appendChild(varSheetModal.root);
      var launcher = this._ensureLauncher(root);
      if (launcher) launcher.classList.add('cm6gpt-hidden');

      this._wireResize(root, resizer);
      this._installLayoutSync(root);

      var listeners = resetPanelListenerRegistry(root);

      var scopeMode = String(uiPrefs.scopeMode || '').toLowerCase();
      var layerMode = this._normalizeLayerMode(uiPrefs.layerMode);
      var htmlLensMode = this._normalizeHtmlLensMode(uiPrefs.htmlLensMode);
      var cssLensMode = this._normalizeCssLensMode(uiPrefs.cssLensMode);
      var cssPropertyFilter = {
        class: true,
        id: false
      };
      var paneVisibility = {
        html: true,
        css: true
      };
      var feedbackNonce = 0;
      var cssClassAddPopoverOpen = false;
      var cssClassAddHoverTimer = null;

      contextCss.addEventListener('click', function (event) {
        var targetEl = event && event.target && typeof event.target.closest === 'function'
          ? event.target.closest('.cm6gpt-context-chip[data-css-target-kind]')
          : null;
        if (!targetEl || !contextCss.contains(targetEl)) return;
        var kind = String(targetEl.dataset.cssTargetKind || '').trim();
        if (!kind) return;
        var payload = {
          kind: kind,
          ref: String(targetEl.dataset.cssTargetRef || '').trim(),
          name: String(targetEl.dataset.cssTargetName || '').trim(),
          id: String(targetEl.dataset.cssTargetId || '').trim(),
          label: String(targetEl.dataset.cssTargetLabel || '').trim()
        };
        listeners.cssContextTarget.forEach(function (cb) {
          try { cb(payload); } catch (e) { _warn('renderCssInfoPopover', e); }
        });
      });

      function flashAction(text, opts) {
        text = String(text || '').trim();
        if (!text) return;
        opts = opts || {};
        var kind = String(opts.kind || 'ok').toLowerCase();
        var ttl = Math.max(700, Number(opts.ttlMs || 1400));
        var item = el('div', 'cm6gpt-feedback', text);
        if (kind === 'warn' || kind === 'warning') item.classList.add('is-warn');
        else if (kind === 'error' || kind === 'danger') item.classList.add('is-error');
        else if (kind === 'info') item.classList.add('is-info');
        else item.classList.add('is-ok');
        feedbackLayer.appendChild(item);
        while (feedbackLayer.children.length > 4) {
          feedbackLayer.removeChild(feedbackLayer.firstChild);
        }
        var localNonce = ++feedbackNonce;
        schedulePanelUiTimeout(function () {
          if (!item.parentNode) return;
          item.classList.add('is-out');
          schedulePanelUiTimeout(function () {
            removeDomNode(item);
          }, 180);
        }, ttl);
        return localNonce;
      }

      function setCssAddClassPopoverOpen(next, opts) {
        next = !!next;
        opts = opts || {};
        if (next === cssClassAddPopoverOpen) return;
        cssClassAddPopoverOpen = next;
        cssAddClassWrap.classList.toggle('is-open', cssClassAddPopoverOpen);
        cssAddClassPopover.classList.toggle('cm6gpt-hidden', !cssClassAddPopoverOpen);
        if (cssClassAddPopoverOpen) {
          schedulePanelUiTimeout(function () {
            try { cssAddClassInput.focus(); } catch (e0) { _warn('setTimeout', e0); }
            if (String(cssAddClassInput.value || '').trim()) {
              try { cssAddClassInput.select(); } catch (e1) { _warn('setTimeout', e1); }
            }
          }, 0);
        } else if (opts.restoreFocus) {
          try { cssAddClassBtn.focus(); } catch (e2) { _warn('setTimeout', e2); }
        }
      }

      function emitCssClassAdd(rawValue) {
        listeners.cssClassAdd.forEach(function (cb) {
          try { cb(rawValue); } catch (e) { _warn('emitCssClassAdd', e); }
        });
      }

      function submitCssClassAddFromPopover() {
        if (cssAddClassBtn.disabled) return;
        var rawValue = String(cssAddClassInput.value || '').trim();
        if (!rawValue) {
          setCssAddClassPopoverOpen(false, { restoreFocus: true });
          return;
        }
        emitCssClassAdd(rawValue);
        cssAddClassInput.value = '';
        setCssAddClassPopoverOpen(false, { restoreFocus: true });
      }

      var recipeAdapter = null;
      var recipeQuery = '';
      var recipeCategoryFilter = '';
      var recipeTagFilter = '';
      var recipeSelectedId = '';
      var recipeCatalogSnapshot = [];
      var recipeCatalogMeta = { categories: [], tags: [] };
      var recipeCatalogReady = false;
      var recipeListSnapshot = [];
      var recipeExpandedCategories = [];
      var recipeModalLastFocus = null;
      var recipeSplitPercent = this._clampRecipeSplitPercent(uiPrefs.recipeSplitPercent);
      var recipeSplitDragging = false;
      var recipeRecentIds = this._normalizeRecentRecipeIds(uiPrefs.recentRecipeIds);
      var recipeFavoriteIds = this._normalizeFavoriteRecipeIds(uiPrefs.favoriteRecipeIds);
      var recipeFavoritesOnly = !!uiPrefs.recipeFavoritesOnly;
      var recipeSearchDebounceTimer = 0;
      var recipeCatalogRefreshTimer = 0;
      var recipeCatalogWarmupTimer = 0;
      var recipeListRenderToken = 0;
      var recipeListRenderHandle = 0;
      var recipePresetState = {
        locked: false,
        mode: '',
        custom: false,
        activePresetKey: 'all',
        activePresetLabel: 'All Recipes',
        enabledPresets: [],
        presets: []
      };
      var recipeInlineDraft = null;
      var recipePendingRevealId = '';
      var recipeDraftFocusRequestToken = 0;
      var RECIPE_SEARCH_DEBOUNCE_MS = 80;
      var RECIPE_RENDER_BATCH_SIZE = 48;
      var recipeHoverPreview = createRecipeHoverPreviewRuntime({
        canPreview: function () {
          return !!recipeAdapter && typeof recipeAdapter.ghostPreview === 'function';
        },
        resolveRecipe: function (id) {
          if (!recipeAdapter || typeof recipeAdapter.resolve !== 'function') return null;
          return recipeAdapter.resolve(id);
        },
        showPreview: function (recipe) {
          if (!recipeAdapter || typeof recipeAdapter.ghostPreview !== 'function') return;
          recipeAdapter.ghostPreview(recipe);
        },
        clearPreview: function () {
          if (!recipeAdapter || typeof recipeAdapter.clearGhostPreview !== 'function') return;
          recipeAdapter.clearGhostPreview();
        }
      });

      function toRecipeArray(value) {
        return Array.isArray(value) ? value : [];
      }

      function clearRecipeHoverPreview(emitClear) {
        recipeHoverPreview.clear(emitClear !== false);
      }

      function clearRecipeSearchDebounce() {
        if (!recipeSearchDebounceTimer) return;
        clearTimeout(recipeSearchDebounceTimer);
        recipeSearchDebounceTimer = 0;
      }

      function clearQueuedRecipeCatalogRefresh() {
        if (!recipeCatalogRefreshTimer) return;
        clearTimeout(recipeCatalogRefreshTimer);
        recipeCatalogRefreshTimer = 0;
      }

      function clearQueuedRecipeCatalogWarmup() {
        if (!recipeCatalogWarmupTimer) return;
        try {
          if (w.cancelIdleCallback && typeof recipeCatalogWarmupTimer === 'number') {
            w.cancelIdleCallback(recipeCatalogWarmupTimer);
          } else {
            clearTimeout(recipeCatalogWarmupTimer);
          }
        } catch (e0) { _warn('clearQueuedRecipeCatalogWarmup', e0); }
        recipeCatalogWarmupTimer = 0;
      }

      function invalidateRecipeCatalogCache() {
        recipeCatalogReady = false;
        recipeCatalogSnapshot = [];
        recipeCatalogMeta = { categories: [], tags: [] };
        recipeListSnapshot = [];
      }

      function scheduleRecipeCatalogWarmup() {
        clearQueuedRecipeCatalogWarmup();
        if (!recipeAdapter || recipeCatalogReady) return;
        var runWarmup = function () {
          recipeCatalogWarmupTimer = 0;
          if (!recipeAdapter || recipeCatalogReady) return;
          refreshRecipeCatalog();
        };
        try {
          if (w.requestIdleCallback) {
            recipeCatalogWarmupTimer = w.requestIdleCallback(runWarmup, { timeout: 900 });
            return;
          }
        } catch (e0) { _warn('runWarmup', e0); }
        recipeCatalogWarmupTimer = setTimeout(runWarmup, 180);
      }

      function scheduleRecipeCatalogRefresh(opts) {
        opts = opts || {};
        clearQueuedRecipeCatalogRefresh();
        clearQueuedRecipeCatalogWarmup();
        if (!recipeAdapter) {
          syncRecipeControls();
          updateRecipeStatusHint();
          return;
        }
        updateRecipeStatusHint('Loading recipe catalog...');
        recipeCatalogRefreshTimer = setTimeout(function () {
          recipeCatalogRefreshTimer = 0;
          refreshRecipeCatalog(opts);
          syncRecipeControls();
        }, 24);
      }

      function cancelQueuedRecipeListRender() {
        recipeListRenderToken += 1;
        if (!recipeListRenderHandle) return;
        try {
          if (w.cancelAnimationFrame) w.cancelAnimationFrame(recipeListRenderHandle);
          else clearTimeout(recipeListRenderHandle);
        } catch (e0) { _warn('cancelQueuedRecipeListRender', e0); }
        recipeListRenderHandle = 0;
      }

      function scheduleRecipeListBatch(cb) {
        if (typeof cb !== 'function') return;
        try {
          if (w.requestAnimationFrame) {
            recipeListRenderHandle = w.requestAnimationFrame(function () {
              recipeListRenderHandle = 0;
              cb();
            });
            return;
          }
        } catch (e0) { _warn('scheduleRecipeListBatch', e0); }
        recipeListRenderHandle = setTimeout(function () {
          recipeListRenderHandle = 0;
          cb();
        }, 16);
      }

      function getRecipeModalFocusableNodes() {
        if (!recipeModal || !recipeModal.root) return [];
        var nodes = recipeModal.root.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (!node) continue;
          if (node.hasAttribute('hidden')) continue;
          if (String(node.getAttribute('aria-hidden') || '').toLowerCase() === 'true') continue;
          if (node.getClientRects && node.getClientRects().length === 0) continue;
          out.push(node);
        }
        return out;
      }

      function normalizeRecipeEntry(input) {
        if (!input || typeof input !== 'object') return null;
        var id = String(input.id || '').trim();
        if (!id) return null;
        var aliases = toRecipeArray(input.aliases).map(function (a) { return String(a || '').trim(); }).filter(Boolean);
        if (!aliases.length) aliases = [id];
        var type = String(input.type || 'css-snippet').trim().toLowerCase();
        var body = input.body;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          body = {
            css: String(body.css || ''),
            html: String(body.html || '')
          };
        } else {
          body = String(input.body || '');
        }
        return {
          id: id,
          aliases: aliases,
          type: type || 'css-snippet',
          category: String(input.category || '').trim(),
          description: String(input.description || '').trim(),
          body: body,
          tags: toRecipeArray(input.tags).map(function (v) { return String(v || '').trim(); }).filter(Boolean),
          blockedContexts: toRecipeArray(input.blockedContexts).map(function (v) { return String(v || '').trim(); }).filter(Boolean),
          preset: String(input.preset || '').trim(),
          presetLabel: String(input.presetLabel || '').trim(),
          requiresSelection: !!input.requiresSelection,
          safeSubsetOnly: !!input.safeSubsetOnly,
          raw: input
        };
      }

      function formatRecipePreviewBody(recipe) {
        if (!recipe || typeof recipe !== 'object') return '';
        var type = String(recipe.type || '').toLowerCase();
        if (type === 'compound' && recipe.body && typeof recipe.body === 'object') {
          var parts = [];
          var htmlPart = String(recipe.body.html || '').trim();
          var cssPart = String(recipe.body.css || '').trim();
          if (htmlPart) parts.push('<!-- HTML -->\n' + htmlPart);
          if (cssPart) parts.push('/* CSS */\n' + cssPart);
          return parts.join('\n\n');
        }
        return String(recipe.body || '');
      }

      /** Lightweight CSS syntax highlighter — returns safe HTML */
      function highlightCssPreview(raw) {
        if (!raw) return '';
        var d = document.createElement('div');
        d.textContent = raw;
        var s = d.innerHTML;
        // 1) comments
        s = s.replace(/\/\*[\s\S]*?\*\//g, function (m) {
          return '<span class="css-comment">' + m + '</span>';
        });
        // 2) @rules
        s = s.replace(/(@[\w-]+)/g, '<span class="css-at">$1</span>');
        // 3) strings
        s = s.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="css-str">$1</span>');
        // 4) full declarations: property: value;
        s = s.replace(/([\w-]+)(\s*:\s*)((?:(?!<span)[^;{}])*)(;?)/g, function (m, prop, colon, val, semi) {
          if (m.indexOf('css-comment') !== -1 || m.indexOf('css-at') !== -1) return m;
          var v = val;
          v = v.replace(/\b(\d+\.?\d*)(px|em|rem|%|vh|vw|vmin|vmax|fr|ms|s|deg|ch|ex|cm|mm|in|pt|pc)\b/g,
            '<span class="css-num">$1</span><span class="css-unit">$2</span>');
          v = v.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="css-num">$1</span>');
          return '<span class="css-prop">' + prop + '</span>' + colon + '<span class="css-val">' + v + '</span>' + (semi ? ';' : '');
        });
        // 5) braces
        s = s.replace(/([{}])/g, '<span class="css-brace">$1</span>');
        return s;
      }

      function normalizeRecipeFilterValue(value) {
        return String(value || '').trim().toLowerCase();
      }

      function normalizeRecipePresetKey(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      }

      function hasLockedRecipePresetPolicy() {
        return !!(recipePresetState && recipePresetState.locked);
      }

      function isInlineRecipeCreateBlockedByPresetPolicy() {
        // D5 override: always allow create. The save flow normalizes filters
        // (resets to All sources) so the new recipe will always be visible.
        return false;
      }

      function hasActiveRecipePresetFilters() {
        if (hasLockedRecipePresetPolicy()) {
          return normalizeRecipePresetKey(recipePresetState.activePresetKey || 'all') !== 'all';
        }
        return !!(recipePresetState && recipePresetState.custom);
      }

      function getActiveRecipePresetLabel() {
        if (!recipePresetState) return 'All Recipes';
        var label = String(recipePresetState.activePresetLabel || '').trim();
        return label || 'All Recipes';
      }

      function findRecipePresetEntryByKey(presetKey) {
        presetKey = normalizeRecipePresetKey(presetKey || '');
        if (!presetKey || !recipePresetState || !recipePresetState.presets) return null;
        for (var i = 0; i < recipePresetState.presets.length; i++) {
          var entry = recipePresetState.presets[i];
          if (!entry) continue;
          if (normalizeRecipePresetKey(entry.key || '') === presetKey) return entry;
        }
        return null;
      }

      function getInlineRecipeDraftTargetPreset() {
        var fallback = { key: 'shared', label: 'Shared' };
        if (!recipePresetState) return fallback;
        var activeKey = normalizeRecipePresetKey(recipePresetState.activePresetKey || '');
        if (activeKey && activeKey !== 'all') {
          var activeEntry = findRecipePresetEntryByKey(activeKey);
          return {
            key: activeKey,
            label: String(
              (activeEntry && (activeEntry.label || activeEntry.presetLabel)) ||
              recipePresetState.activePresetLabel ||
              activeKey
            ).trim() || activeKey
          };
        }

        var enabledPresets = toRecipeArray(recipePresetState.enabledPresets).map(function (key) {
          return normalizeRecipePresetKey(key || '');
        }).filter(Boolean);
        if (enabledPresets.length === 1) {
          var singleKey = enabledPresets[0];
          var singleEntry = findRecipePresetEntryByKey(singleKey);
          return {
            key: singleKey,
            label: String(
              (singleEntry && (singleEntry.label || singleEntry.presetLabel)) ||
              singleKey
            ).trim() || singleKey
          };
        }

        return fallback;
      }

      function recipeToHaystack(recipe) {
        if (!recipe || typeof recipe !== 'object') return '';
        var parts = [];
        parts.push(String(recipe.id || ''));
        parts = parts.concat(toRecipeArray(recipe.aliases));
        parts.push(String(recipe.category || ''));
        parts.push(String(recipe.description || ''));
        parts = parts.concat(toRecipeArray(recipe.tags));
        return parts.join(' ').toLowerCase();
      }

      function recipeHasTag(recipe, tag) {
        tag = normalizeRecipeFilterValue(tag);
        if (!tag) return true;
        var tags = toRecipeArray(recipe && recipe.tags);
        for (var i = 0; i < tags.length; i++) {
          if (normalizeRecipeFilterValue(tags[i]) === tag) return true;
        }
        return false;
      }

      function normalizeRecipeAccordionKey(value) {
        return normalizeRecipeFilterValue(value || 'misc') || 'misc';
      }

      function ensureRecipeCategoryExpanded(category, forceState) {
        var key = normalizeRecipeAccordionKey(category);
        if (!key) return false;
        var shouldExpand = (typeof forceState === 'boolean') ? forceState : (recipeExpandedCategories.indexOf(key) === -1);
        var prev = recipeExpandedCategories.indexOf(key) !== -1;
        if (shouldExpand && !prev) {
          recipeExpandedCategories.push(key);
          return true;
        }
        if (!shouldExpand && prev) {
          recipeExpandedCategories = recipeExpandedCategories.filter(function (entry) {
            return entry !== key;
          });
          return true;
        }
        return false;
      }

      function buildRecipeRenderGroups(sourceList) {
        var groups = [];
        var byKey = {};
        var list = toRecipeArray(sourceList);
        for (var i = 0; i < list.length; i++) {
          var recipe = list[i];
          if (!recipe) continue;
          var key = normalizeRecipeAccordionKey(recipe.category);
          if (!byKey[key]) {
            byKey[key] = {
              key: key,
              label: String(recipe.category || key || 'misc').trim() || key || 'misc',
              items: [],
              selected: false
            };
            groups.push(byKey[key]);
          }
          byKey[key].items.push(recipe);
          if (String(recipe.id || '') === String(recipeSelectedId || '')) {
            byKey[key].selected = true;
          }
        }
        if (recipeInlineDraft) {
          var savedKey = 'saved';
          if (!byKey[savedKey]) {
            byKey[savedKey] = {
              key: savedKey,
              label: 'saved',
              items: [],
              selected: false
            };
            groups.push(byKey[savedKey]);
          }
          byKey[savedKey].items.unshift({ __draft: true, category: 'saved' });
          ensureRecipeCategoryExpanded(savedKey, true);
        }
        groups.sort(function (a, b) {
          var aSel = a.selected ? 1 : 0;
          var bSel = b.selected ? 1 : 0;
          if (aSel !== bSel) return bSel - aSel;
          return String(a.label || '').localeCompare(String(b.label || ''));
        });
        if (recipeInlineDraft) {
          var savedIndex = -1;
          for (var g = 0; g < groups.length; g++) {
            if (groups[g] && groups[g].key === 'saved') {
              savedIndex = g;
              break;
            }
          }
          if (savedIndex > 0) {
            groups.unshift(groups.splice(savedIndex, 1)[0]);
          }
        }
        // Force-expand saved group when a just-saved recipe needs to be revealed
        if (recipePendingRevealId && byKey['saved']) {
          ensureRecipeCategoryExpanded('saved', true);
        }
        return groups;
      }

      function syncRecipeAccordionState(groups) {
        var list = toRecipeArray(groups);
        var validKeys = list.map(function (group) { return group.key; });
        recipeExpandedCategories = recipeExpandedCategories.filter(function (key) {
          return validKeys.indexOf(key) !== -1;
        });
        if (recipePendingRevealId) {
        }
        if (!validKeys.length) {
          recipeExpandedCategories = [];
          return;
        }
      }

      function collectRecipeFilterMeta(sourceList) {
        var categories = {};
        var tags = {};
        var outCategories = [];
        var outTags = [];
        var list = toRecipeArray(sourceList);
        for (var i = 0; i < list.length; i++) {
          var recipe = list[i];
          if (!recipe) continue;
          var category = normalizeRecipeFilterValue(recipe.category);
          if (category && !categories[category]) {
            categories[category] = true;
            outCategories.push(category);
          }
          var recipeTags = toRecipeArray(recipe.tags);
          for (var t = 0; t < recipeTags.length; t++) {
            var tag = normalizeRecipeFilterValue(recipeTags[t]);
            if (!tag || tags[tag]) continue;
            tags[tag] = true;
            outTags.push(tag);
          }
        }
        outCategories.sort();
        outTags.sort();
        return { categories: outCategories, tags: outTags };
      }

      function fillRecipeFilterSelect(selectNode, values, allLabel, selectedValue) {
        if (!selectNode) return '';
        // Build options array for custom select
        var items = [{ value: '', label: allLabel || 'All' }];
        var arr = toRecipeArray(values);
        for (var i = 0; i < arr.length; i++) {
          var value = normalizeRecipeFilterValue(arr[i]);
          if (!value) continue;
          items.push({ value: value, label: value });
        }

        // Use setOptions API if available (custom select), else fall back
        if (selectNode._customSelect && typeof selectNode._customSelect.setOptions === 'function') {
          selectNode._customSelect.setOptions(items);
        } else if (typeof selectNode.setOptions === 'function') {
          selectNode.setOptions(items);
        }

        var normalizedSelected = normalizeRecipeFilterValue(selectedValue);
        var options = selectNode.options || [];
        if (normalizedSelected) {
          var hasMatch = false;
          for (var j = 0; j < options.length; j++) {
            if (String(options[j].value || '') === normalizedSelected) {
              hasMatch = true;
              break;
            }
          }
          if (hasMatch) selectNode.value = normalizedSelected;
          else selectNode.value = '';
        } else {
          selectNode.value = '';
        }
        if (recipePendingRevealId) {
        }
        return normalizeRecipeFilterValue(selectNode.value || '');
      }

      function syncRecipePresetState() {
        var next = {
          locked: false,
          mode: '',
          custom: false,
          activePresetKey: 'all',
          activePresetLabel: 'All Recipes',
          enabledPresets: [],
          presets: []
        };
        if (recipeAdapter) {
          try {
            if (typeof recipeAdapter.getPresetState === 'function') {
              next = recipeAdapter.getPresetState() || next;
            } else if (typeof recipeAdapter.listPresets === 'function') {
              next = {
                locked: false,
                mode: '',
                custom: false,
                activePresetKey: 'all',
                activePresetLabel: 'All Recipes',
                enabledPresets: [],
                presets: recipeAdapter.listPresets() || []
              };
            }
          } catch (e0) {
            next = {
              locked: false,
              mode: '',
              custom: false,
              activePresetKey: 'all',
              activePresetLabel: 'All Recipes',
              enabledPresets: [],
              presets: []
            };
          }
        }

        var presets = toRecipeArray(next.presets).map(function (entry) {
          if (!entry || typeof entry !== 'object') return null;
          var key = normalizeRecipePresetKey(entry.key || entry.preset || '');
          if (!key) return null;
          var label = String(entry.label || entry.presetLabel || entry.key || entry.preset || '').trim();
          if (!label) label = key;
          var count = Number(entry.count || 0);
          if (!isFinite(count) || count < 0) count = 0;
          return {
            key: key,
            label: label,
            count: Math.round(count),
            enabled: entry.enabled !== false,
            active: !!entry.active,
            managed: !!entry.managed,
            description: String(entry.description || '').trim()
          };
        }).filter(Boolean);

        var enabledPresets = toRecipeArray(next.enabledPresets).map(normalizeRecipePresetKey).filter(Boolean);
        if (!enabledPresets.length) {
          enabledPresets = presets.filter(function (entry) { return entry.enabled; }).map(function (entry) {
            return entry.key;
          });
        }

        recipePresetState = {
          locked: !!next.locked,
          mode: String(next.mode || '').trim(),
          custom: !!next.custom,
          activePresetKey: normalizeRecipePresetKey(next.activePresetKey || 'all') || 'all',
          activePresetLabel: String(next.activePresetLabel || '').trim() || 'All Recipes',
          enabledPresets: enabledPresets,
          presets: presets
        };
      }

      function renderRecipePresetChips() {
        if (!recipeModal || !recipeModal.presetWrap || !recipeModal.presetList || !recipeModal.presetAllBtn) return;

        clearChildren(recipeModal.presetList);
        recipeModal.presetLabel.textContent = 'Sources';
        recipeModal.presetAllBtn.hidden = false;

        if (!recipeAdapter || !recipePresetState.presets.length) {
          recipeModal.presetWrap.hidden = true;
          recipeModal.presetAllBtn.disabled = true;
          recipeModal.presetAllBtn.classList.remove('is-active');
          recipeModal.presetAllBtn.setAttribute('aria-pressed', 'false');
          return;
        }

        if (hasLockedRecipePresetPolicy()) {
          recipeModal.presetWrap.hidden = false;
          recipeModal.presetLabel.textContent = 'Active preset';
          recipeModal.presetAllBtn.hidden = true;
          recipeModal.presetAllBtn.disabled = true;
          recipeModal.presetAllBtn.classList.remove('is-active');
          recipeModal.presetAllBtn.setAttribute('aria-pressed', 'false');

          var activeChip = el('span', 'cm6gpt-recipes-preset-chip is-active');
          activeChip.setAttribute('aria-disabled', 'true');
          activeChip.title = 'Preset switching is managed in CM6GPT Lite admin';
          activeChip.appendChild(el('span', 'cm6gpt-recipes-preset-chip-label', getActiveRecipePresetLabel()));

          var activeEntry = null;
          for (var i = 0; i < recipePresetState.presets.length; i++) {
            if (!recipePresetState.presets[i] || !recipePresetState.presets[i].active) continue;
            activeEntry = recipePresetState.presets[i];
            break;
          }
          var chipCount = recipeCatalogSnapshot.length || (activeEntry && activeEntry.count) || 0;
          activeChip.appendChild(el('span', 'cm6gpt-recipes-preset-chip-count', String(chipCount)));
          recipeModal.presetList.appendChild(activeChip);
          return;
        }

        recipeModal.presetWrap.hidden = false;
        recipeModal.presetAllBtn.disabled = false;
        recipeModal.presetAllBtn.classList.toggle('is-active', !recipePresetState.custom);
        recipeModal.presetAllBtn.setAttribute('aria-pressed', recipePresetState.custom ? 'false' : 'true');
        recipeModal.presetAllBtn.title = recipePresetState.custom
          ? 'Show all recipe sources'
          : 'All recipe sources visible';

        recipePresetState.presets.forEach(function (entry) {
          var chip = el('button', 'cm6gpt-recipes-preset-chip');
          chip.type = 'button';
          chip.dataset.presetKey = entry.key;
          chip.classList.toggle('is-active', !!entry.enabled);
          chip.classList.toggle('is-muted', !entry.enabled);
          chip.setAttribute('aria-pressed', entry.enabled ? 'true' : 'false');
          chip.title = entry.enabled
            ? ('Hide source: ' + entry.label)
            : ('Show source: ' + entry.label);

          chip.appendChild(el('span', 'cm6gpt-recipes-preset-chip-label', entry.label));
          chip.appendChild(el('span', 'cm6gpt-recipes-preset-chip-count', String(entry.count)));

          chip.addEventListener('click', function () {
            if (!recipeAdapter || typeof recipeAdapter.setPresetEnabled !== 'function') return;
            try {
              recipeAdapter.setPresetEnabled(entry.key, !entry.enabled);
            } catch (e0) { _warn('renderRecipePresetChips', e0); }
            syncRecipePresetState();
            renderRecipePresetChips();
            applyRecipeFiltersAndRender();
            syncRecipeControls();
          });

          recipeModal.presetList.appendChild(chip);
        });
      }

      function isRecipePresetEnabledInPanel(recipe) {
        if (hasLockedRecipePresetPolicy()) return true;
        if (!recipePresetState.custom) return true;
        var enabled = toRecipeArray(recipePresetState.enabledPresets);
        if (!enabled.length) return false;
        var preset = normalizeRecipePresetKey(recipe && recipe.preset || 'shared') || 'shared';
        return enabled.indexOf(preset) !== -1;
      }

      function filterRecipeCatalog() {
        var query = normalizeRecipeFilterValue(recipeQuery);
        var category = normalizeRecipeFilterValue(recipeCategoryFilter);
        var tag = normalizeRecipeFilterValue(recipeTagFilter);
        var source = toRecipeArray(recipeCatalogSnapshot);
        var out = source.filter(function (recipe) {
          var id = String(recipe && recipe.id || '');
          if (!isRecipePresetEnabledInPanel(recipe)) return false;
          if (recipeFavoritesOnly && !isFavoriteRecipeId(id)) return false;
          if (category && normalizeRecipeFilterValue(recipe.category) !== category) return false;
          if (!recipeHasTag(recipe, tag)) return false;
          if (!query) return true;
          return recipeToHaystack(recipe).indexOf(query) !== -1;
        });
        if (!out.length) return out;
        out.sort(function (a, b) {
          var aFav = isFavoriteRecipeId(String(a && a.id || '')) ? 1 : 0;
          var bFav = isFavoriteRecipeId(String(b && b.id || '')) ? 1 : 0;
          if (aFav === bFav) return 0;
          return bFav - aFav;
        });
        return out;
      }

      function findRecipeById(id) {
        id = String(id || '').trim();
        if (!id) return null;
        for (var i = 0; i < recipeListSnapshot.length; i++) {
          var item = recipeListSnapshot[i];
          if (!item) continue;
          if (String(item.id || '') === id) return item;
          if (item.aliases.indexOf(id) !== -1) return item;
        }
        return null;
      }

      function findRecipeInCatalogById(id) {
        id = String(id || '').trim();
        if (!id) return null;
        for (var i = 0; i < recipeCatalogSnapshot.length; i++) {
          var item = recipeCatalogSnapshot[i];
          if (!item) continue;
          if (String(item.id || '') === id) return item;
          if (item.aliases.indexOf(id) !== -1) return item;
        }
        return null;
      }

      function isFavoriteRecipeId(id) {
        id = String(id || '').trim();
        if (!id) return false;
        return recipeFavoriteIds.indexOf(id) !== -1;
      }

      function persistFavoriteRecipeIds() {
        recipeFavoriteIds = self._normalizeFavoriteRecipeIds(recipeFavoriteIds);
        uiPrefs.favoriteRecipeIds = recipeFavoriteIds.slice();
        uiPrefs.recipeFavoritesOnly = !!recipeFavoritesOnly;
        self._saveUiPrefs(uiPrefs);
      }

      function toggleFavoriteRecipeId(id, forceState) {
        id = String(id || '').trim();
        if (!id) return false;
        var shouldEnable = (typeof forceState === 'boolean') ? forceState : !isFavoriteRecipeId(id);
        if (shouldEnable) {
          recipeFavoriteIds = recipeFavoriteIds.filter(function (entry) {
            return String(entry || '') !== id;
          });
          recipeFavoriteIds.unshift(id);
          if (recipeFavoriteIds.length > 48) recipeFavoriteIds = recipeFavoriteIds.slice(0, 48);
        } else {
          recipeFavoriteIds = recipeFavoriteIds.filter(function (entry) {
            return String(entry || '') !== id;
          });
        }
        persistFavoriteRecipeIds();
        return shouldEnable;
      }

      function getRecentRecipeItems() {
        var out = [];
        for (var i = 0; i < recipeRecentIds.length; i++) {
          var id = recipeRecentIds[i];
          var item = findRecipeInCatalogById(id);
          if (!item) continue;
          out.push(item);
        }
        return out;
      }

      function persistRecentRecipeIds() {
        recipeRecentIds = self._normalizeRecentRecipeIds(recipeRecentIds);
        uiPrefs.recentRecipeIds = recipeRecentIds.slice();
        self._saveUiPrefs(uiPrefs);
      }

      function rememberRecentRecipeId(id) {
        id = String(id || '').trim();
        if (!id) return;
        recipeRecentIds = recipeRecentIds.filter(function (entry) {
          return String(entry || '').trim() && String(entry || '') !== id;
        });
        recipeRecentIds.unshift(id);
        if (recipeRecentIds.length > 8) recipeRecentIds = recipeRecentIds.slice(0, 8);
        persistRecentRecipeIds();
      }

      function renderRecentRecipeChips() {
        if (!recipeModal || !recipeModal.recentWrap || !recipeModal.recentList) return;
        clearChildren(recipeModal.recentList);
        if (!recipeAdapter) {
          recipeModal.recentWrap.hidden = true;
          return;
        }
        var recent = getRecentRecipeItems();
        if (!recent.length) {
          recipeModal.recentWrap.hidden = true;
          return;
        }
        recipeModal.recentWrap.hidden = false;
        for (var i = 0; i < recent.length; i++) {
          var item = recent[i];
          if (!item) continue;
          var alias = item.aliases.length ? item.aliases[0] : item.id;
          var chip = el('button', 'cm6gpt-recipes-recent-chip', '@' + alias);
          chip.type = 'button';
          chip.dataset.recipeId = String(item.id || '');
          chip.title = 'Click select · double-click insert + close';
          chip.classList.toggle('is-active', String(item.id || '') === String(recipeSelectedId || ''));
          chip.classList.toggle('is-favorite', isFavoriteRecipeId(String(item.id || '')));
          chip.addEventListener('click', function () {
            var nextId = String(this.dataset.recipeId || '');
            if (!nextId) return;
            setRecipeSelectionById(nextId);
          });
          chip.addEventListener('dblclick', function () {
            var nextId = String(this.dataset.recipeId || '');
            if (!nextId) return;
            setRecipeSelectionById(nextId);
            insertSelectedRecipe({ closeOnSuccess: true });
          });
          recipeModal.recentList.appendChild(chip);
        }
      }

      function getSelectedRecipe() {
        var selected = findRecipeById(recipeSelectedId);
        if (selected) return selected;
        if (!recipeListSnapshot.length) return null;
        return recipeListSnapshot[0];
      }

      function getSelectedRecipeIndex() {
        if (!recipeListSnapshot.length) return -1;
        if (!recipeSelectedId) return 0;
        for (var i = 0; i < recipeListSnapshot.length; i++) {
          var item = recipeListSnapshot[i];
          if (!item) continue;
          if (String(item.id || '') === String(recipeSelectedId)) return i;
        }
        return 0;
      }

      function clampRecipeIndex(index) {
        if (!recipeListSnapshot.length) return -1;
        var size = recipeListSnapshot.length;
        var n = Number(index);
        if (!Number.isFinite(n)) n = 0;
        n = Math.trunc(n);
        if (n < 0) return size - 1;
        if (n >= size) return 0;
        return n;
      }

      function findRecipeRowNodeById(id) {
        if (!recipeModal || !recipeModal.list) return null;
        id = String(id || '').trim();
        if (!id) return null;
        var rows = recipeModal.list.querySelectorAll('.cm6gpt-recipe-item');
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!row) continue;
          if (String(row.dataset.recipeId || '') === id) return row;
        }
        return null;
      }

      function syncRecentRecipeSelectionUi() {
        if (!recipeModal || !recipeModal.recentList) return;
        var chips = recipeModal.recentList.children;
        for (var i = 0; i < chips.length; i++) {
          var chip = chips[i];
          if (!chip) continue;
          chip.classList.toggle('is-active', String(chip.dataset.recipeId || '') === String(recipeSelectedId || ''));
        }
      }

      function ensureSelectedRecipeVisible() {
        if (!recipeModal || !recipeModal.list || !recipeSelectedId) return;
        var row = findRecipeRowNodeById(recipeSelectedId);
        if (!row || typeof row.scrollIntoView !== 'function') return;
        try { row.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e0) { _warn('ensureSelectedRecipeVisible', e0); }
      }

      function setRecipeSelectionById(id, opts) {
        opts = opts || {};
        var nextId = String(id || '').trim();
        if (!nextId) return false;
        var nextItem = findRecipeById(nextId);
        if (!nextItem) return false;
        var prevId = String(recipeSelectedId || '');
        if (prevId === nextId && !opts.force) {
          if (opts.ensureVisible !== false) ensureSelectedRecipeVisible();
          return true;
        }
        recipeSelectedId = nextId;
        if (opts.renderList) {
          renderRecipeList();
          return true;
        }
        var nextCategory = normalizeRecipeAccordionKey(nextItem.category);
        if (recipePendingRevealId || String(nextId || '') === String(recipeSelectedId || '')) {
        }
        if (ensureRecipeCategoryExpanded(nextCategory) && !findRecipeRowNodeById(nextId)) {
          renderRecipeList();
          return true;
        }
        if (prevId && prevId !== nextId) {
          var prevRow = findRecipeRowNodeById(prevId);
          if (prevRow) prevRow.classList.remove('is-active');
        }
        var nextRow = findRecipeRowNodeById(nextId);
        if (nextRow) nextRow.classList.add('is-active');
        renderRecipePreview(nextItem);
        syncRecentRecipeSelectionUi();
        updateRecipeStatusHint();
        if (opts.ensureVisible !== false) ensureSelectedRecipeVisible();
        syncDeleteButtonState();
        return true;
      }

      // P1: Sync toolbar delete button enabled/disabled state based on selection
      function syncDeleteButtonState() {
        if (!recipeModal || !recipeModal.btnDeleteRecipe) return;
        // Exit inline confirm mode whenever selection changes
        if (typeof exitDeleteConfirmMode === 'function') try { exitDeleteConfirmMode(); } catch (e) { _warn('syncDeleteButtonState', e); }
        if (recipeInlineDraft) {
          recipeModal.btnDeleteRecipe.disabled = true;
          recipeModal.btnDeleteRecipe.title = 'Finish or cancel the draft first';
          return;
        }
        var canDelete = false;
        if (recipeSelectedId && recipeAdapter && typeof recipeAdapter.isUserOwned === 'function') {
          canDelete = recipeAdapter.isUserOwned(recipeSelectedId);
        }
        recipeModal.btnDeleteRecipe.disabled = !canDelete;
        recipeModal.btnDeleteRecipe.title = canDelete
          ? 'Delete @' + recipeSelectedId
          : recipeSelectedId ? 'Cannot delete built-in recipes' : 'Select a recipe first';
      }

      function setRecipeSelectionByIndex(index, opts) {
        var nextIndex = clampRecipeIndex(index);
        if (nextIndex < 0) return false;
        var nextItem = recipeListSnapshot[nextIndex];
        if (!nextItem) return false;
        return setRecipeSelectionById(String(nextItem.id || ''), opts);
      }

      function moveRecipeSelection(delta) {
        var step = Number(delta);
        if (!Number.isFinite(step) || !step) return false;
        var fromIndex = getSelectedRecipeIndex();
        if (fromIndex < 0) return false;
        return setRecipeSelectionByIndex(fromIndex + (step > 0 ? 1 : -1));
      }

      function moveRecipeSelectionBy(delta) {
        var step = Number(delta);
        if (!Number.isFinite(step) || !step) return false;
        var fromIndex = getSelectedRecipeIndex();
        if (fromIndex < 0) return false;
        return setRecipeSelectionByIndex(fromIndex + Math.trunc(step));
      }

      function moveRecipeSelectionToBoundary(toEnd) {
        if (!recipeListSnapshot.length) return false;
        return setRecipeSelectionByIndex(toEnd ? (recipeListSnapshot.length - 1) : 0);
      }

      function applyRecipeSplitPercent(next, opts) {
        opts = opts || {};
        var clamped = self._clampRecipeSplitPercent(next);
        recipeSplitPercent = clamped;
        if (recipeModal && recipeModal.card) {
          recipeModal.card.style.setProperty('--cm6gpt-recipes-left-col', String(clamped));
        }
        if (recipeModal && recipeModal.splitter) {
          recipeModal.splitter.setAttribute('aria-valuenow', String(clamped));
        }
        uiPrefs.recipeSplitPercent = clamped;
        if (opts.persist !== false) self._saveUiPrefs(uiPrefs);
      }

      function stopRecipeSplitDrag() {
        if (!recipeSplitDragging) return;
        recipeSplitDragging = false;
        if (recipeModal && recipeModal.main) {
          recipeModal.main.classList.remove('is-resizing');
        }
        document.body.classList.remove('cm6gpt-recipes-resizing');
        self._saveUiPrefs(uiPrefs);
      }

      function updateRecipeSplitFromPointer(clientX) {
        if (!recipeModal || !recipeModal.card) return;
        var rect = recipeModal.card.getBoundingClientRect();
        var width = Number(rect && rect.width) || 0;
        if (!width) return;
        var left = Number(clientX) - Number(rect.left || 0);
        var percent = (left / width) * 100;
        applyRecipeSplitPercent(percent, { persist: false });
      }

      function setRecipeModalOpen(open, opts) {
        opts = opts || {};
        var restoreFocus = opts.restoreFocus !== false;
        var isOpen = !!open;
        if (isOpen) {
          recipeExpandedCategories = [];
          var active = document.activeElement;
          recipeModalLastFocus = (active && active !== document.body) ? active : btnRecipes;
        }
        recipeModal.root.classList.toggle('cm6gpt-hidden', !isOpen);
        recipeModal.root.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        btnRecipes.classList.toggle('is-active', isOpen);
        document.body.classList.toggle('cm6gpt-recipes-open', isOpen);
        if (isOpen) {
          schedulePanelUiTimeout(function () {
            if (!recipeModal || !recipeModal.root || recipeModal.root.classList.contains('cm6gpt-hidden')) return;
            if (focusDomNode(recipeModal.search)) {
              try { recipeModal.search.select(); } catch (e0) { _warn('setTimeout', e0); }
              return;
            }
            var focusable = getRecipeModalFocusableNodes();
            if (focusable.length) focusDomNode(focusable[0]);
            else focusDomNode(recipeModal.root);
          }, 0);
          return;
        }
        clearQueuedRecipeCatalogRefresh();
        clearQueuedRecipeCatalogWarmup();
        clearRecipeSearchDebounce();
        cancelQueuedRecipeListRender();
        stopRecipeSplitDrag();
        clearRecipeHoverPreview(true);
        if (recipeInlineDraft) recipeInlineDraft = null;
        recipePendingRevealId = '';
        recipeDraftFocusRequestToken += 1;
        if (restoreFocus) {
          var target = recipeModalLastFocus || btnRecipes;
          recipeModalLastFocus = null;
          if (!focusDomNode(target)) focusDomNode(btnRecipes);
        } else {
          recipeModalLastFocus = null;
        }
      }

      function createRecipeMetaBadge(label, variant) {
        label = String(label || '').trim();
        if (!label) return null;
        var className = 'cm6gpt-recipe-badge';
        if (variant) className += ' is-' + String(variant || '').trim();
        return el('span', className, label);
      }

      function appendRecipeMetaBadge(container, label, variant) {
        if (!container) return;
        var badge = createRecipeMetaBadge(label, variant);
        if (badge) container.appendChild(badge);
      }

      function getRecipeSourceBadgeLabel(recipe) {
        if (!recipe || (!recipe.presetLabel && !recipe.preset)) return '';
        var sourceLabel = String(recipe.presetLabel || recipe.preset || '').trim();
        if (!sourceLabel) return '';
        if (/^source\s*:/i.test(sourceLabel)) return sourceLabel;
        return 'Source: ' + sourceLabel;
      }

      function buildRecipeItemMeta(item) {
        var meta = el('span', 'cm6gpt-recipe-item-sub');
        appendRecipeMetaBadge(meta, item.category || item.id, 'category');
        if (item.tags && item.tags.length) appendRecipeMetaBadge(meta, item.tags[0], 'tag');
        var sourceBadgeLabel = getRecipeSourceBadgeLabel(item);
        if (sourceBadgeLabel) {
          appendRecipeMetaBadge(
            meta,
            sourceBadgeLabel,
            item.preset && item.preset !== 'shared' ? 'preset' : 'shared'
          );
        }
        if (item.blockedContexts && item.blockedContexts.length) {
          appendRecipeMetaBadge(meta, 'Blocked', 'danger');
        } else if (item.requiresSelection) {
          appendRecipeMetaBadge(meta, 'Selection', 'warn');
        }
        return meta;
      }

      function renderRecipePreviewMeta(recipe) {
        clearChildren(recipeModal.previewMeta);
        if (!recipe) return;

        appendRecipeMetaBadge(recipeModal.previewMeta, recipe.type || 'css-snippet', 'type');
        appendRecipeMetaBadge(recipeModal.previewMeta, recipe.category || 'misc', 'category');
        var sourceBadgeLabel = getRecipeSourceBadgeLabel(recipe);
        if (sourceBadgeLabel) {
          appendRecipeMetaBadge(
            recipeModal.previewMeta,
            sourceBadgeLabel,
            recipe.preset && recipe.preset !== 'shared' ? 'preset' : 'shared'
          );
        }
        if (recipe.tags && recipe.tags.length) {
          var tagLimit = Math.min(recipe.tags.length, 3);
          for (var i = 0; i < tagLimit; i++) appendRecipeMetaBadge(recipeModal.previewMeta, recipe.tags[i], 'tag');
          if (recipe.tags.length > tagLimit) appendRecipeMetaBadge(recipeModal.previewMeta, '+' + String(recipe.tags.length - tagLimit) + ' tags', 'tag');
        }
        if (recipe.blockedContexts && recipe.blockedContexts.length) appendRecipeMetaBadge(recipeModal.previewMeta, 'Blocked', 'danger');
        if (recipe.requiresSelection) appendRecipeMetaBadge(recipeModal.previewMeta, 'Requires selection', 'warn');
        if (recipe.safeSubsetOnly) appendRecipeMetaBadge(recipeModal.previewMeta, 'Safe subset only', 'success');
      }

      // Edit mode state
      var recipeEditMode = false;

      function exitRecipeEditMode() {
        recipeEditMode = false;
        recipeModal.previewBody.hidden = false;
        recipeModal.previewEditArea.hidden = true;
        recipeModal.previewEditCategory.hidden = true;
        recipeModal.previewBtnSave.hidden = true;
        recipeModal.previewBtnCancel.hidden = true;
        recipeModal.previewBtnEdit.hidden = false;
      }

      function enterRecipeEditMode() {
        var recipe = getSelectedRecipe();
        if (!recipe) return;
        recipeEditMode = true;
        recipeModal.previewBody.hidden = true;
        recipeModal.previewEditArea.hidden = false;
        recipeModal.previewEditArea.value = formatRecipePreviewBody(recipe);
        recipeModal.previewEditCategory.hidden = false;
        // Populate category dropdown from existing categories
        var cats = recipeCatalogMeta.categories || [];
        var currentCat = recipe.category || 'saved';
        recipeModal.previewEditCategory.textContent = '';
        var hasCurrent = false;
        for (var ci = 0; ci < cats.length; ci++) {
          var opt = el('option', '');
          opt.value = cats[ci];
          opt.textContent = cats[ci];
          if (cats[ci] === currentCat) { opt.selected = true; hasCurrent = true; }
          recipeModal.previewEditCategory.appendChild(opt);
        }
        if (!hasCurrent) {
          var customOpt = el('option', '');
          customOpt.value = currentCat;
          customOpt.textContent = currentCat;
          customOpt.selected = true;
          recipeModal.previewEditCategory.insertBefore(customOpt, recipeModal.previewEditCategory.firstChild);
        }
        recipeModal.previewBtnEdit.hidden = true;
        recipeModal.previewBtnSave.hidden = false;
        recipeModal.previewBtnCancel.hidden = false;
        schedulePanelUiTimeout(function () { recipeModal.previewEditArea.focus(); }, 30);
      }

      function saveRecipeEdit() {
        var recipe = getSelectedRecipe();
        if (!recipe || !recipeAdapter || typeof recipeAdapter.upsert !== 'function') return;
        var newBody = String(recipeModal.previewEditArea.value || '').trim();
        if (!newBody) {
          updateRecipeStatusHint('Cannot save empty recipe body');
          return;
        }
        var out = null;
        try {
          var newCategory = String(recipeModal.previewEditCategory.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || recipe.category || 'saved';
          out = recipeAdapter.upsert({
            id: recipe.id,
            aliases: recipe.aliases || [recipe.id],
            type: recipe.type || 'css-snippet',
            body: newBody,
            category: newCategory,
            preset: recipe.preset || 'shared',
            description: recipe.description || 'Saved from editor'
          });
        } catch (e) { _warn('saveRecipeEdit.upsert', e); out = null; }
        if (out && out.ok) {
          updateRecipeStatusHint('Updated: @' + recipe.id);
          exitRecipeEditMode();
          refreshRecipeCatalog({ forceSourceReload: true });
          schedulePanelUiTimeout(function () {
            setRecipeSelectionById(recipe.id, { force: true });
          }, 50);
        } else {
          updateRecipeStatusHint('Save failed: ' + (out && out.reason ? out.reason : 'unknown'));
        }
      }

      function renderRecipePreview(recipe) {
        if (recipeEditMode) exitRecipeEditMode();

        if (!recipe) {
          recipeModal.previewTitle.textContent = 'No recipe selected';
          clearChildren(recipeModal.previewMeta);
          recipeModal.previewBody.textContent = '';
          recipeModal.btnInsert.disabled = true;
          recipeModal.previewBtnEdit.hidden = true;
          return;
        }

        var primaryAlias = recipe.aliases.length ? recipe.aliases[0] : recipe.id;
        recipeModal.previewTitle.textContent = '@' + primaryAlias;
        renderRecipePreviewMeta(recipe);
        recipeModal.previewBody.textContent = '';
        // SECURITY: CSS content escaped via highlightCssPreview() which calls esc() first (line 1242).
        // highlightCssPreview uses textContent internally for escaping, then adds class spans
        var highlighted = highlightCssPreview(formatRecipePreviewBody(recipe));
        recipeModal.previewBody.insertAdjacentHTML('afterbegin', highlighted);
        recipeModal.btnInsert.disabled = !recipeAdapter;
        var canEdit = recipeAdapter && typeof recipeAdapter.isUserOwned === 'function'
          && recipeAdapter.isUserOwned(recipe.id);
        recipeModal.previewBtnEdit.hidden = !canEdit;
      }

      function createRecipeListRow(item, selectedId) {
        if (!item) return null;
        var row = el('div', 'cm6gpt-recipe-item');
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.dataset.recipeId = String(item.id || '');
        row.classList.toggle('is-active', String(item.id || '') === String(selectedId || ''));
        row.classList.toggle('is-favorite', isFavoriteRecipeId(String(item.id || '')));
        row.title = item.description || ('@' + (item.aliases[0] || item.id));

        var name = el('span', 'cm6gpt-recipe-item-name', '@' + (item.aliases[0] || item.id));
        var sub = buildRecipeItemMeta(item);
        var head = el('span', 'cm6gpt-recipe-item-main');
        var isFavorite = isFavoriteRecipeId(String(item.id || ''));
        var favBtn = el('button', 'cm6gpt-recipe-item-star');
        favBtn.type = 'button';
        favBtn.dataset.recipeId = String(item.id || '');
        favBtn.classList.toggle('is-active', isFavorite);
        favBtn.title = isFavorite ? 'Unfavorite recipe' : 'Favorite recipe';
        setRecipeStarIcon(favBtn, isFavorite, isFavorite ? 'Unfavorite recipe' : 'Favorite recipe');

        head.appendChild(name);
        if (sub.childNodes && sub.childNodes.length) head.appendChild(sub);
        row.appendChild(head);
        row.appendChild(favBtn);
        return row;
      }

      function sanitizeInlineRecipeName(raw) {
        return String(raw || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      }

      function cancelInlineRecipeDraft() {
        if (!recipeInlineDraft) return;
        recipeInlineDraft = null;
        recipeDraftFocusRequestToken += 1;
        applyRecipeFiltersAndRender();
        syncRecipeControls();
      }

      function openInlineRecipeDraft() {
        if (!recipeAdapter || typeof recipeAdapter.upsert !== 'function') return;
        if (isInlineRecipeCreateBlockedByPresetPolicy()) {
          updateRecipeStatusHint('Cannot save while admin preset mode hides shared recipes');
          return;
        }
        if (recipeInlineDraft) {
          if (!String(recipeInlineDraft.rawName || '').trim()) {
            cancelInlineRecipeDraft();
            return;
          }
          var existingInput = recipeModal && recipeModal.list
            ? recipeModal.list.querySelector('.cm6gpt-recipe-inline-input')
            : null;
          if (existingInput && focusDomNode(existingInput)) {
            try {
              var valueLength = String(existingInput.value || '').length;
              existingInput.setSelectionRange(valueLength, valueLength);
            } catch (e0) { _warn('openInlineRecipeDraft', e0); }
            return;
          }
          recipeDraftFocusRequestToken += 1;
          applyRecipeFiltersAndRender();
          return;
        }
        recipeInlineDraft = {
          css: '/* empty */',
          rawName: '',
          warningText: '',
          confirmCollision: false
        };
        ensureRecipeCategoryExpanded('saved', true);
        recipeDraftFocusRequestToken += 1;
        applyRecipeFiltersAndRender();
      }

      function commitInlineRecipeDraft() {
        if (!recipeInlineDraft || !recipeAdapter || typeof recipeAdapter.upsert !== 'function') return;
        var name = sanitizeInlineRecipeName(recipeInlineDraft.rawName);
        var targetPreset = getInlineRecipeDraftTargetPreset();
        if (!name) {
          recipeInlineDraft.warningText = 'Enter a valid recipe name';
          recipeInlineDraft.confirmCollision = false;
          applyRecipeFiltersAndRender();
          return;
        }
        var existing = null;
        if (typeof recipeAdapter.resolve === 'function') {
          try { existing = recipeAdapter.resolve(name, { ignorePresetFilters: true }); } catch (e0) { _warn('commitInlineRecipeDraft', e0); }
        }
        if (existing && recipeInlineDraft.confirmCollision !== true) {
          var isOwned = typeof recipeAdapter.isUserOwned === 'function' && recipeAdapter.isUserOwned(name);
          recipeInlineDraft.warningText = isOwned
            ? '@' + name + ' exists — press Enter again to overwrite'
            : '@' + name + ' is built-in — press Enter again to shadow it';
          recipeInlineDraft.confirmCollision = true;
          applyRecipeFiltersAndRender();
          return;
        }
        var out = null;
        try {
          out = recipeAdapter.upsert({
            id: name,
            aliases: [name],
            type: 'css-snippet',
            body: String(recipeInlineDraft.css || ''),
            category: 'saved',
            preset: targetPreset.key,
            presetLabel: targetPreset.label,
            description: 'Saved from editor'
          });
        } catch (e1) { _warn('commitInlineRecipeDraft.upsert', e1); out = null; }
        if (out && out.ok) {
          recipeFavoritesOnly = false;
          recipeQuery = '';
          recipeCategoryFilter = '';
          recipeTagFilter = '';
          if (recipeModal && recipeModal.search) recipeModal.search.value = '';
          ensureRecipeCategoryExpanded('saved', true);
          recipePendingRevealId = name;
          recipeInlineDraft = null;
          recipeDraftFocusRequestToken += 1;
          refreshRecipeCatalog({ forceSourceReload: true });
          return;
        }
        recipeInlineDraft.warningText = 'Save failed: ' + (out && out.reason ? out.reason : 'unknown');
        applyRecipeFiltersAndRender();
      }

      function createRecipeDraftRow() {
        if (!recipeInlineDraft) return null;
        var row = el('div', 'cm6gpt-recipe-item is-draft');
        row.setAttribute('data-recipe-draft', 'true');

        var main = el('span', 'cm6gpt-recipe-item-main');
        var nameWrap = el('span', 'cm6gpt-recipe-item-name is-editing');
        var input = el('input', 'cm6gpt-recipe-inline-input');
        input.type = 'text';
        input.value = String(recipeInlineDraft.rawName || '');
        input.placeholder = 'recipe-name';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', 'Recipe name');

        var sub = el('span', 'cm6gpt-recipe-item-sub');
        appendRecipeMetaBadge(sub, 'saved', 'category');
        appendRecipeMetaBadge(sub, 'Source: shared', 'shared');
        appendRecipeMetaBadge(sub, 'css-snippet', 'type');

        var warning = el('span', 'cm6gpt-recipe-inline-warning', String(recipeInlineDraft.warningText || ''));
        warning.hidden = !String(recipeInlineDraft.warningText || '').trim();

        input.addEventListener('input', function () {
          if (!recipeInlineDraft) return;
          recipeInlineDraft.rawName = String(this.value || '');
          recipeInlineDraft.warningText = '';
          recipeInlineDraft.confirmCollision = false;
        });
        input.addEventListener('keydown', function (e) {
          if (!e) return;
          var key = String(e.key || '');
          if (
            key === 'Enter' ||
            key === 'Escape' ||
            key === 'ArrowUp' ||
            key === 'ArrowDown' ||
            key === 'ArrowLeft' ||
            key === 'ArrowRight' ||
            key === 'Home' ||
            key === 'End'
          ) {
            try { e.stopPropagation(); } catch (e0) { _warn('createRecipeDraftRow', e0); }
          }
          if (key === 'Enter') {
            try { e.preventDefault(); } catch (e1) { _warn('createRecipeDraftRow', e1); }
            commitInlineRecipeDraft();
            return;
          }
          if (key === 'Escape') {
            try { e.preventDefault(); } catch (e2) { _warn('createRecipeDraftRow', e2); }
            cancelInlineRecipeDraft();
          }
        });
        input.addEventListener('blur', function () {
          schedulePanelUiTimeout(function () {
            if (!recipeInlineDraft) return;
            if (!String(recipeInlineDraft.rawName || '').trim()) cancelInlineRecipeDraft();
          }, 120);
        });

        nameWrap.appendChild(input);
        main.appendChild(nameWrap);
        main.appendChild(sub);
        main.appendChild(warning);
        row.appendChild(main);
        return row;
      }

      function applyRecipeFiltersAndRender() {
        clearRecipeSearchDebounce();
        recipeListSnapshot = filterRecipeCatalog();
        if (recipePendingRevealId) {
        }
        if (recipeSelectedId && !findRecipeById(recipeSelectedId)) {
          recipeSelectedId = '';
        }
        renderRecipeList();
      }

      function renderRecipeList() {
        cancelQueuedRecipeListRender();
        clearChildren(recipeModal.list);
        if (!recipeListSnapshot.length && !recipeInlineDraft) {
          recipeModal.empty.hidden = false;
          recipeModal.count.textContent = '0 recipes';
          renderRecipePreview(null);
          renderRecentRecipeChips();
          updateRecipeStatusHint();
          syncDeleteButtonState();
          return;
        }

        recipeModal.empty.hidden = true;
        var groups = buildRecipeRenderGroups(recipeListSnapshot);
        syncRecipeAccordionState(groups);
        if (recipePendingRevealId) {
        }
        var countLabel = String(recipeListSnapshot.length) + ' recipes · ' + String(groups.length) + ' groups';
        if (hasLockedRecipePresetPolicy()) {
          countLabel += ' · ' + getActiveRecipePresetLabel();
        }
        recipeModal.count.textContent = countLabel;

        var selected = getSelectedRecipe();
        recipeSelectedId = selected ? String(selected.id || '') : '';
        renderRecipePreview(getSelectedRecipe());
        renderRecentRecipeChips();
        syncRecentRecipeSelectionUi();

        var renderToken = ++recipeListRenderToken;
        var renderTasks = [];
        var total = 0;

        for (var g = 0; g < groups.length; g++) {
          var group = groups[g];
          if (!group) continue;
          var section = el('section', 'cm6gpt-recipe-group');
          section.dataset.categoryKey = group.key;
          section.classList.toggle('is-active', !!group.selected);
          var expanded = recipeExpandedCategories.indexOf(group.key) !== -1;
          section.classList.toggle('is-expanded', expanded);

          var header = el('button', 'cm6gpt-recipe-group-toggle');
          header.type = 'button';
          header.dataset.categoryKey = group.key;
          header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          header.title = (expanded ? 'Collapse ' : 'Expand ') + group.label;

          var headerMain = el('span', 'cm6gpt-recipe-group-main');
          headerMain.appendChild(el('span', 'cm6gpt-recipe-group-label', group.label));
          if (group.selected) headerMain.appendChild(createRecipeMetaBadge('selected', 'success'));

          var headerSide = el('span', 'cm6gpt-recipe-group-side');
          headerSide.appendChild(el('span', 'cm6gpt-recipe-group-count', String(group.items.length)));
          headerSide.appendChild(el('span', 'cm6gpt-recipe-group-chevron', expanded ? '−' : '+'));

          header.appendChild(headerMain);
          header.appendChild(headerSide);

          var body = el('div', 'cm6gpt-recipe-group-body');
          body.hidden = !expanded;

          section.appendChild(header);
          section.appendChild(body);
          recipeModal.list.appendChild(section);

          if (expanded) {
            renderTasks.push({
              body: body,
              items: group.items
            });
            total += group.items.length;
          }
        }

        function handlePostRenderRevealAndFocus() {
          if (recipePendingRevealId) {
            var revealId = String(recipePendingRevealId || '').trim();
            recipePendingRevealId = '';
            if (revealId) {
              setRecipeSelectionById(revealId, { ensureVisible: true, renderList: false, force: true });
              // Auto-enter edit mode for newly created empty recipes
              var revealedRecipe = getSelectedRecipe();
              if (revealedRecipe && !String(revealedRecipe.body || '').trim()) {
                schedulePanelUiTimeout(enterRecipeEditMode, 80);
              }
            }
          }
          if (recipeInlineDraft) {
            var focusToken = recipeDraftFocusRequestToken;
            schedulePanelUiTimeout(function () {
              if (focusToken !== recipeDraftFocusRequestToken) return;
              if (!recipeInlineDraft) return;
              var inp = recipeModal.list.querySelector('.cm6gpt-recipe-inline-input');
              if (inp && document.activeElement !== inp) inp.focus();
            }, 30);
          }
        }

        function appendRecipeBatch(taskIndex, rowIndex, renderedCount) {
          if (renderToken !== recipeListRenderToken) return;
          if (!renderTasks.length) {
            updateRecipeStatusHint();
            handlePostRenderRevealAndFocus();
            return;
          }
          var task = renderTasks[taskIndex];
          if (!task || !task.body) {
            updateRecipeStatusHint();
            ensureSelectedRecipeVisible();
            handlePostRenderRevealAndFocus();
            return;
          }
          var fragment = document.createDocumentFragment();
          var endIndex = Math.min(rowIndex + RECIPE_RENDER_BATCH_SIZE, task.items.length);
          for (var i = rowIndex; i < endIndex; i++) {
            var item = task.items[i];
            var row = null;
            if (item && item.__draft) {
              row = createRecipeDraftRow();
            } else {
              row = createRecipeListRow(item, recipeSelectedId);
            }
            if (row) fragment.appendChild(row);
          }
          task.body.appendChild(fragment);
          var nextRendered = renderedCount + Math.max(0, endIndex - rowIndex);
          if (endIndex < task.items.length) {
            updateRecipeStatusHint('Rendering ' + String(nextRendered) + '/' + String(total) + ' recipes · Esc close');
            scheduleRecipeListBatch(function () {
              appendRecipeBatch(taskIndex, endIndex, nextRendered);
            });
            return;
          }
          var nextTaskIndex = taskIndex + 1;
          if (nextTaskIndex < renderTasks.length) {
            updateRecipeStatusHint('Rendering ' + String(nextRendered) + '/' + String(total) + ' recipes · Esc close');
            scheduleRecipeListBatch(function () {
              appendRecipeBatch(nextTaskIndex, 0, nextRendered);
            });
            return;
          }
          handlePostRenderRevealAndFocus();
          updateRecipeStatusHint();
        }

        appendRecipeBatch(0, 0, 0);
        syncDeleteButtonState();
      }

      function refreshRecipeCatalog(opts) {
        opts = opts || {};
        var listed = [];
        syncRecipePresetState();
        renderRecipePresetChips();

        if (!recipeAdapter) {
          invalidateRecipeCatalogCache();
          syncRecipeFavoritesUi();
          recipeCategoryFilter = fillRecipeFilterSelect(
            recipeModal.categorySelect,
            [],
            'All categories',
            recipeCategoryFilter
          );
          recipeTagFilter = fillRecipeFilterSelect(
            recipeModal.tagSelect,
            [],
            'All tags',
            recipeTagFilter
          );
          applyRecipeFiltersAndRender();
          return;
        }

        if (!opts.forceSourceReload && recipeCatalogReady) {
          recipeFavoriteIds = recipeFavoriteIds.filter(function (id) {
            return !!findRecipeInCatalogById(id);
          });
          persistFavoriteRecipeIds();
          renderRecentRecipeChips();
          syncRecipeFavoritesUi();
          recipeCategoryFilter = fillRecipeFilterSelect(
            recipeModal.categorySelect,
            recipeCatalogMeta.categories,
            'All categories',
            recipeCategoryFilter
          );
          recipeTagFilter = fillRecipeFilterSelect(
            recipeModal.tagSelect,
            recipeCatalogMeta.tags,
            'All tags',
            recipeTagFilter
          );
          applyRecipeFiltersAndRender();
          return;
        }

        try {
          if (typeof recipeAdapter.listRef === 'function') {
            listed = recipeAdapter.listRef({ ignorePresetFilters: true });
          } else if (typeof recipeAdapter.list === 'function') {
            listed = recipeAdapter.list({ ignorePresetFilters: true });
          } else if (typeof recipeAdapter.search === 'function') {
            listed = recipeAdapter.search('');
          }
        } catch (e0) {
          listed = [];
        }
        if (recipeAdapter.normalizedSource) {
          recipeCatalogSnapshot = toRecipeArray(listed).filter(Boolean).slice();
        } else {
          recipeCatalogSnapshot = toRecipeArray(listed).map(normalizeRecipeEntry).filter(Boolean);
        }
        // Merge ALL user-owned recipes that locked preset policy excluded from listRef.
        // This ensures every saved recipe is visible, not just the most recent one.
        if (recipeAdapter && typeof recipeAdapter.export === 'function') {
          try {
            var userPayload = recipeAdapter.export({ asString: false });
            var userRecipes = (userPayload && Array.isArray(userPayload.recipes)) ? userPayload.recipes : [];
            for (var ur = 0; ur < userRecipes.length; ur++) {
              var userR = userRecipes[ur];
              if (userR && userR.id && !findRecipeInCatalogById(userR.id)) {
                var normalizedUser = normalizeRecipeEntry(userR);
                if (normalizedUser) recipeCatalogSnapshot.push(normalizedUser);
              }
            }
          } catch (eUser) { _warn('refreshRecipeCatalog', eUser); }
        }
        recipeCatalogMeta = collectRecipeFilterMeta(recipeCatalogSnapshot);
        recipeCatalogReady = true;
        recipeFavoriteIds = recipeFavoriteIds.filter(function (id) {
          return !!findRecipeInCatalogById(id);
        });
        persistFavoriteRecipeIds();
        renderRecentRecipeChips();
        syncRecipeFavoritesUi();
        recipeCategoryFilter = fillRecipeFilterSelect(
          recipeModal.categorySelect,
          recipeCatalogMeta.categories,
          'All categories',
          recipeCategoryFilter
        );
        recipeTagFilter = fillRecipeFilterSelect(
          recipeModal.tagSelect,
          recipeCatalogMeta.tags,
          'All tags',
          recipeTagFilter
        );
        applyRecipeFiltersAndRender();
      }

      function syncRecipeControls() {
        var hasAdapter = !!recipeAdapter;
        var createBlocked = hasAdapter && isInlineRecipeCreateBlockedByPresetPolicy();
        btnRecipes.classList.toggle('is-muted', !hasAdapter);
        recipeModal.search.disabled = !hasAdapter;
        recipeModal.categorySelect.disabled = !hasAdapter;
        recipeModal.tagSelect.disabled = !hasAdapter;
        if (recipeModal.presetAllBtn) recipeModal.presetAllBtn.disabled = !hasAdapter;
        recipeModal.btnImport.disabled = !hasAdapter;
        recipeModal.btnExport.disabled = !hasAdapter;
        recipeModal.btnSaveRecipe.disabled = !hasAdapter || createBlocked;
        recipeModal.btnSaveRecipe.title = !hasAdapter
          ? 'Recipe catalog unavailable'
          : createBlocked
            ? 'Cannot save while admin preset mode hides shared recipes'
            : 'Save current CSS as recipe';
        recipeModal.btnInsert.disabled = !hasAdapter || !getSelectedRecipe();
        syncRecipeFavoritesUi();
        renderRecipePresetChips();
        renderRecentRecipeChips();
        syncDeleteButtonState();
        updateRecipeStatusHint();
      }

      function syncRecipeFavoritesUi() {
        if (!recipeModal || !recipeModal.btnFavorites) return;
        var hasAdapter = !!recipeAdapter;
        recipeModal.btnFavorites.disabled = !hasAdapter;
        recipeModal.btnFavorites.classList.toggle('is-active', hasAdapter && recipeFavoritesOnly);
        recipeModal.btnFavorites.setAttribute('aria-pressed', hasAdapter && recipeFavoritesOnly ? 'true' : 'false');
        if (!hasAdapter) {
          recipeModal.btnFavorites.title = 'Favorites unavailable';
          return;
        }
        recipeModal.btnFavorites.title = recipeFavoritesOnly
          ? 'Showing favorites only (click for all recipes)'
          : 'Show favorites only';
      }

      function updateRecipeStatusHint(message) {
        if (!recipeModal || !recipeModal.status) return;
        var custom = String(message == null ? '' : message).trim();
        if (custom) {
          recipeModal.status.textContent = custom;
          return;
        }
        if (!recipeAdapter) {
          recipeModal.status.textContent = 'Recipe catalog unavailable';
          return;
        }
        if (recipeInlineDraft) {
          recipeModal.status.textContent = 'Enter save draft · Escape cancel draft · Drag divider resize';
          return;
        }
        var createBlocked = isInlineRecipeCreateBlockedByPresetPolicy();
        if (!recipeListSnapshot.length) {
          if (hasActiveRecipePresetFilters()) {
            recipeModal.status.textContent = hasLockedRecipePresetPolicy()
              ? ('No recipes in admin preset "' + getActiveRecipePresetLabel() + '"' + (createBlocked ? ' · Save disabled while shared is hidden · Esc close' : ' · Esc close'))
              : 'No recipes in active preset selection · Esc close';
            return;
          }
          recipeModal.status.textContent = 'No recipes found · Esc close';
          return;
        }
        var prefix = recipeFavoritesOnly ? 'Favorites only · ' : '';
        if (hasLockedRecipePresetPolicy()) {
          prefix += 'Preset: ' + getActiveRecipePresetLabel() + ' · ';
        }
        if (createBlocked) {
          prefix += 'Save disabled while shared is hidden · ';
        }
        recipeModal.status.textContent = prefix + 'Enter insert · Ctrl/Cmd+Enter insert+close · Star favorite · Esc close · Drag divider resize';
      }

      function insertSelectedRecipe(opts) {
        opts = opts || {};
        var recipe = getSelectedRecipe();
        if (!recipe) return false;
        if (!recipeAdapter || typeof recipeAdapter.insert !== 'function') {
          flashAction('Recipe catalog unavailable', { kind: 'warn' });
          return false;
        }
        var alias = recipe.aliases.length ? recipe.aliases[0] : recipe.id;
        var analysis = null;
        if (typeof recipeAdapter.getSelectionAnalysis === 'function') {
          try { analysis = recipeAdapter.getSelectionAnalysis(); } catch (e0) { _warn('insertSelectedRecipe.getSelectionAnalysis', e0); analysis = null; }
        }
        var out = null;
        try {
          out = recipeAdapter.insert(alias, { selectionAnalysis: analysis, addTrailingNewline: true });
        } catch (e1) {
          _warn('insertSelectedRecipe.insert', e1);
          out = { ok: false, reason: 'insert-failed' };
        }

        if (out && out.ok) {
          rememberRecentRecipeId(recipe.id);
          renderRecentRecipeChips();
          flashAction('Recipe inserted: @' + alias, { kind: 'ok' });
          statusMain.textContent = 'Recipe inserted: @' + alias;
          updateRecipeStatusHint();
          if (opts.closeOnSuccess) {
            var canFocusAfterInsert = !!(recipeAdapter && typeof recipeAdapter.focusAfterInsert === 'function');
            setRecipeModalOpen(false, { restoreFocus: !canFocusAfterInsert });
            if (canFocusAfterInsert) {
              schedulePanelUiTimeout(function () {
                try { recipeAdapter.focusAfterInsert(out); } catch (e2) { _warn('setTimeout', e2); }
              }, 0);
            }
          }
          return true;
        }

        var reason = out && out.reason ? String(out.reason) : 'insert-failed';
        var details = '';
        if (out && Array.isArray(out.blockedReasons) && out.blockedReasons.length) {
          details = out.blockedReasons.map(function (line) { return String(line || '').trim(); }).filter(Boolean).join(' | ');
        } else if (out && Array.isArray(out.blockedContexts) && out.blockedContexts.length) {
          details = out.blockedContexts.join(', ');
        }
        var label = details ? ('Recipe insert blocked: ' + reason + ' (' + details + ')') : ('Recipe insert blocked: ' + reason);
        flashAction(label, { kind: 'warn' });
        recipeModal.status.textContent = details || reason;
        return false;
      }

      function importRecipesFromPrompt() {
        if (!recipeAdapter || typeof recipeAdapter.import !== 'function') {
          flashAction('Recipe catalog unavailable', { kind: 'warn' });
          return;
        }
        var payload = '';
        try { payload = w.prompt('Paste recipe JSON (array/object/export payload)', ''); } catch (e0) { payload = ''; }
        if (payload == null) return;
        payload = String(payload || '').trim();
        if (!payload) return;

        var replace = false;
        try {
          replace = !!w.confirm('Replace existing custom recipes? OK = replace, Cancel = merge');
        } catch (e1) {
          replace = false;
        }

        var out = null;
        try {
          out = recipeAdapter.import(payload, { mode: replace ? 'replace' : 'merge' });
        } catch (e2) {
          out = { ok: false, reason: 'import-failed', imported: 0 };
        }
        if (!out || !out.ok) {
          flashAction('Recipe import failed', { kind: 'error' });
          return;
        }
        flashAction('Recipes imported: ' + String(out.imported || 0), { kind: 'ok' });
        invalidateRecipeCatalogCache();
        refreshRecipeCatalog({ forceSourceReload: true });
      }

      function exportRecipesToClipboard() {
        if (!recipeAdapter || typeof recipeAdapter.export !== 'function') {
          flashAction('Recipe catalog unavailable', { kind: 'warn' });
          return;
        }

        var includeDefaults = false;
        try {
          includeDefaults = !!w.confirm('Include default recipes in export? OK = yes, Cancel = custom only');
        } catch (e0) {
          includeDefaults = false;
        }

        var raw = null;
        try {
          raw = recipeAdapter.export({ includeDefaults: includeDefaults, asString: true });
        } catch (e1) {
          raw = null;
        }
        var text = String(raw || '').trim();
        if (!text) {
          flashAction('Recipe export failed', { kind: 'error' });
          return;
        }

        copyTextWithFallback(text, {
          navigator: w.navigator || null,
          document: document,
          window: w,
          promptLabel: 'Copy recipe JSON',
          warn: _warn
        }).then(function (result) {
          if (result && result.status === 'copied') {
            flashAction('Recipe JSON copied to clipboard', { kind: 'info' });
            return;
          }
          if (result && result.status === 'prompt') {
            flashAction('Recipe JSON ready to copy', { kind: 'info' });
            return;
          }
          flashAction('Recipe export ready but manual copy fallback is unavailable', { kind: 'warn' });
        }).catch(function (err) {
          _warn('exportRecipesToClipboard', err);
          flashAction('Recipe export failed', { kind: 'error' });
        });
      }

      function normalizeScopeMode(next) {
        var mode = String(next || '').toLowerCase();
        if (mode === 'page') return mode;
        return 'self';
      }

      function setScopeMode(next, emit) {
        var normalized = normalizeScopeMode(next);
        if (scopeMode === normalized) return;
        scopeMode = normalized;
        uiPrefs.scopeMode = normalized;
        self._saveUiPrefs(uiPrefs);
        scopeModeUi.buttons.forEach(function (btn) {
          btn.classList.toggle('is-active', String(btn.dataset.scopeMode || '') === scopeMode);
        });
        if (emit !== false) {
          listeners.scopeMode.forEach(function (cb) {
            try { cb(scopeMode); } catch (e) { _warn('setScopeMode', e); }
          });
        }
      }

      function setLayerMode(next, emit) {
        var normalized = self._normalizeLayerMode(next);
        if (layerMode === normalized) return;
        layerMode = normalized;
        uiPrefs.layerMode = normalized;
        self._saveUiPrefs(uiPrefs);
        if (emit !== false) {
          listeners.layerMode.forEach(function (cb) {
            try { cb(layerMode); } catch (e) { _warn('setLayerMode', e); }
          });
        }
      }

      function setHtmlLensMode(next, emit) {
        var normalized = self._normalizeHtmlLensMode(next);
        if (htmlLensMode === normalized) return;
        htmlLensMode = normalized;
        uiPrefs.htmlLensMode = normalized;
        self._saveUiPrefs(uiPrefs);
        if (htmlLensModeUi && typeof htmlLensModeUi.setActive === 'function') {
          htmlLensModeUi.setActive(htmlLensMode);
        } else {
          htmlLensModeUi.buttons.forEach(function (btn) {
            btn.classList.toggle('is-active', String(btn.dataset.htmlLensMode || '') === htmlLensMode);
          });
        }
        if (emit !== false) {
          listeners.htmlLensMode.forEach(function (cb) {
            try { cb(htmlLensMode); } catch (e) { _warn('setHtmlLensMode', e); }
          });
        }
      }

      function setCssLensMode(next, emit) {
        var normalized = self._normalizeCssLensMode(next);
        if (cssLensMode === normalized) return;
        cssLensMode = normalized;
        uiPrefs.cssLensMode = normalized;
        self._saveUiPrefs(uiPrefs);
        if (cssLensModeUi && typeof cssLensModeUi.setActive === 'function') {
          cssLensModeUi.setActive(cssLensMode);
        } else {
          cssLensModeUi.buttons.forEach(function (btn) {
            btn.classList.toggle('is-active', String(btn.dataset.cssLensMode || '') === cssLensMode);
          });
        }
        if (emit !== false) {
          listeners.cssLensMode.forEach(function (cb) {
            try { cb(cssLensMode); } catch (e) { _warn('setCssLensMode', e); }
          });
        }
      }

      function normalizeCssPropertyFilter(next) {
        var out = {
          class: !!(next && next.class),
          id: !!(next && next.id)
        };
        if (out.class && out.id) {
          out.id = false;
        }
        if (!out.class && !out.id) {
          out.class = true;
        }
        return out;
      }

      function setCssPropertyFilter(next, emit) {
        var normalized = normalizeCssPropertyFilter(next);
        if (
          normalized.class === cssPropertyFilter.class &&
          normalized.id === cssPropertyFilter.id
        ) return;
        cssPropertyFilter = normalized;
        cssPropertyFilterUi.buttons.forEach(function (btn) {
          var key = String(btn.dataset.cssPropertyFilter || '');
          var isActive = false;
          if (key === 'class') isActive = !!cssPropertyFilter.class;
          else if (key === 'id') isActive = !!cssPropertyFilter.id;
          btn.classList.toggle('is-active', isActive);
        });
        if (emit !== false) {
          listeners.cssPropertyFilter.forEach(function (cb) {
            try {
              cb({
                class: cssPropertyFilter.class,
                id: cssPropertyFilter.id
              });
            } catch (e) { _warn('setCssPropertyFilter', e); }
          });
        }
      }

      function syncPaneVisibility() {
        if (!paneVisibility.html && !paneVisibility.css) {
          paneVisibility.html = true;
        }
        chipHtml.classList.toggle('is-active', !!paneVisibility.html);
        chipCss.classList.toggle('is-active', !!paneVisibility.css);
        htmlPane.pane.style.display = paneVisibility.html ? '' : 'none';
        cssPane.pane.style.display = paneVisibility.css ? '' : 'none';
        root.classList.toggle('cm6gpt-only-html', !!paneVisibility.html && !paneVisibility.css);
        root.classList.toggle('cm6gpt-only-css', !!paneVisibility.css && !paneVisibility.html);
        if (typeof root.__cm6gptLayoutSync === 'function') {
          try { root.__cm6gptLayoutSync(); } catch (e0) { _warn('syncPaneVisibility', e0); }
        }
        if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
          ns.editors.refreshMountedEditors();
        }
      }

      function setPaneVisibility(which, active) {
        if (which === 'html') {
          paneVisibility.html = !!active;
        } else if (which === 'css') {
          paneVisibility.css = !!active;
        }
        syncPaneVisibility();
      }

      function setPanelMinimized(next, focusDock) {
        var minimized = !!next;
        if (minimized) setRecipeModalOpen(false, { restoreFocus: false });
        root.classList.toggle('cm6gpt-minimized', minimized);
        miniDock.classList.toggle('cm6gpt-hidden', !minimized);
        btnMin.classList.toggle('is-active', minimized);
        btnMin.title = minimized ? 'Restore panel' : 'Minimize panel';
        setIcon(btnMin, minimized ? 'fas fa-window-restore' : 'fas fa-window-minimize', minimized ? 'Restore panel' : 'Minimize panel');
        if (minimized && focusDock !== false) {
          try { miniDock.focus(); } catch (e0) { _warn('setPanelMinimized', e0); }
        }
        if (typeof root.__cm6gptLayoutSync === 'function') {
          try { root.__cm6gptLayoutSync(); } catch (e1) { _warn('setPanelMinimized', e1); }
        }
      }

      function emitUndo() {
        listeners.undo.forEach(function (cb) {
          try { cb(); } catch (e) { _warn('emitUndo', e); }
        });
      }

      function emitRedo() {
        listeners.redo.forEach(function (cb) {
          try { cb(); } catch (e) { _warn('emitRedo', e); }
        });
      }

      function setUndoRedoState(state) {
        state = state || {};
        var canUndo = !!state.canUndo;
        var canRedo = !!state.canRedo;
        chipUndo.disabled = !canUndo;
        chipRedo.disabled = !canRedo;
        chipUndo.classList.toggle('is-active', canUndo);
        chipRedo.classList.toggle('is-active', canRedo);
      }

      function cleanupPanelLifecycle() {
        if (cleanupPanelLifecycle.__done) return;
        cleanupPanelLifecycle.__done = true;
        try { panelUiTimeouts.clearAll(); } catch (ePanelTimeouts) { _warn('cleanupPanelLifecycle', ePanelTimeouts); }
        try { setCssAddClassPopoverOpen(false); } catch (e0) { _warn('cleanupPanelLifecycle', e0); }
        try { setRecipeModalOpen(false, { restoreFocus: false }); } catch (e1) { _warn('cleanupPanelLifecycle', e1); }
        try { setPanelMinimized(false, false); } catch (e1a) { _warn('cleanupPanelLifecycle', e1a); }
        try { finalizePanelClose({ restoreFocus: false }); } catch (e1b) { _warn('cleanupPanelLifecycle', e1b); }
        if (recipeModal && typeof recipeModal.cleanup === 'function') {
          try { recipeModal.cleanup(); } catch (e2) { _warn('cleanupPanelLifecycle', e2); }
        }
        if (varSheetModal && typeof varSheetModal.cleanup === 'function') {
          try { varSheetModal.cleanup(); } catch (e3) { _warn('cleanupPanelLifecycle', e3); }
        }
        if (resizer && typeof resizer.__cm6gptResizeCleanup === 'function') {
          try { resizer.__cm6gptResizeCleanup(); } catch (e4) { _warn('cleanupPanelLifecycle', e4); }
        }
        if (typeof root.__cm6gptInputShieldCleanup === 'function') {
          try { root.__cm6gptInputShieldCleanup(); } catch (e5) { _warn('cleanupPanelLifecycle', e5); }
        }
        if (typeof root.__cm6gptEditorActivityCleanup === 'function') {
          try { root.__cm6gptEditorActivityCleanup(); } catch (e5a) { _warn('cleanupPanelLifecycle', e5a); }
        }
        if (typeof root.__cm6gptPanelVisibilityObserverCleanup === 'function') {
          try { root.__cm6gptPanelVisibilityObserverCleanup(); } catch (e6) { _warn('cleanupPanelLifecycle', e6); }
        }
        if (typeof root.__cm6gptStopLayoutSync === 'function') {
          try { root.__cm6gptStopLayoutSync(); } catch (e7) { _warn('cleanupPanelLifecycle', e7); }
        }
        if (typeof root.__cm6gptMainRuntimeCleanup === 'function') {
          try { root.__cm6gptMainRuntimeCleanup(); } catch (e7a) { _warn('cleanupPanelLifecycle', e7a); }
        }
        getBridgeRuntimeUtils().drainCleanupQueue(panelGlobalTeardownFns, function (e8) {
          _warn('cleanupPanelLifecycle', e8);
        });
        try { document.documentElement.classList.remove('cm6gpt-panel-open'); } catch (e9) { _warn('cleanupPanelLifecycle', e9); }
        try { document.documentElement.classList.remove('cm6gpt-dock-full'); } catch (e10) { _warn('cleanupPanelLifecycle', e10); }
        try { document.body.classList.remove('cm6gpt-recipes-open'); } catch (e11) { _warn('cleanupPanelLifecycle', e11); }
        try { document.body.classList.remove('cm6gpt-recipes-resizing'); } catch (e12) { _warn('cleanupPanelLifecycle', e12); }
        try { document.body.classList.remove('cm6gpt-resizing'); } catch (e13) { _warn('cleanupPanelLifecycle', e13); }
        try { document.body.style.cursor = ''; } catch (e14) { _warn('cleanupPanelLifecycle', e14); }
        try { document.body.style.userSelect = ''; } catch (e15) { _warn('cleanupPanelLifecycle', e15); }
        if (launcher && launcher.parentNode) {
          removeDomNode(launcher);
        }
        if (recipeModal && recipeModal.root && recipeModal.root.parentNode) {
          removeDomNode(recipeModal.root);
        }
        if (varSheetModal && varSheetModal.root && varSheetModal.root.parentNode) {
          removeDomNode(varSheetModal.root);
        }
        if (root && root.parentNode) {
          removeDomNode(root);
        }
        try { resetPanelListenerRegistry(root); } catch (e19a) { _warn('cleanupPanelLifecycle', e19a); }
        if (root.__cm6gptPanelApi) {
          root.__cm6gptPanelApi = null;
        }
        if (root.__cm6gptPanelCleanup === cleanupPanelLifecycle) {
          root.__cm6gptPanelCleanup = null;
        }
      }

      root.__cm6gptPanelCleanup = cleanupPanelLifecycle;

      applyRecipeSplitPercent(recipeSplitPercent, { persist: false });
      scopeMode = normalizeScopeMode(scopeMode);
      uiPrefs.scopeMode = scopeMode;
      layerMode = this._normalizeLayerMode(layerMode);
      uiPrefs.layerMode = layerMode;
      htmlLensMode = this._normalizeHtmlLensMode(htmlLensMode);
      uiPrefs.htmlLensMode = htmlLensMode;
      cssLensMode = this._normalizeCssLensMode(cssLensMode);
      uiPrefs.cssLensMode = cssLensMode;
      this._saveUiPrefs(uiPrefs);
      scopeModeUi.buttons.forEach(function (btn) {
        btn.classList.toggle('is-active', String(btn.dataset.scopeMode || '') === scopeMode);
      });
      if (htmlLensModeUi && typeof htmlLensModeUi.setActive === 'function') {
        htmlLensModeUi.setActive(htmlLensMode);
      } else {
        htmlLensModeUi.buttons.forEach(function (btn) {
          btn.classList.toggle('is-active', String(btn.dataset.htmlLensMode || '') === htmlLensMode);
        });
      }
      if (cssLensModeUi && typeof cssLensModeUi.setActive === 'function') {
        cssLensModeUi.setActive(cssLensMode);
      } else {
        cssLensModeUi.buttons.forEach(function (btn) {
          btn.classList.toggle('is-active', String(btn.dataset.cssLensMode || '') === cssLensMode);
        });
      }
      function updateUiPrefButtons() {
        var isFull = uiPrefs.dockMode === 'full';
        var isFlush = !!uiPrefs.flushDock;
        var isWrap = !!uiPrefs.softWrap;
        var fs = self._clampFontSize(uiPrefs.editorFontSize);

        btnDock.classList.toggle('is-active', isFull);
        btnDock.title = isFull
          ? 'Dock: Full width (click to switch to centered)'
          : 'Dock: Centered between Bricks panels (click to switch to full width)';

        btnFlush.classList.toggle('is-active', isFlush);
        btnFlush.title = isFlush
          ? 'Flush ON: no outer gap / no radius (click to disable)'
          : 'Flush OFF (click for edge-to-edge look)';

        btnFontDown.disabled = fs <= 9;
        btnFontUp.disabled = fs >= 16;
        btnFontDown.title = 'Smaller editor font (' + fs + 'px)';
        btnFontUp.title = 'Larger editor font (' + fs + 'px)';

        btnWrap.classList.toggle('is-active', isWrap);
        btnWrap.title = isWrap
          ? 'Wrap ON: horizontal scrolling off'
          : 'Wrap OFF: horizontal scrolling on';
      }
      updateUiPrefButtons();
      setUndoRedoState({ canUndo: false, canRedo: false });
      syncPaneVisibility();
      syncRecipeControls();

      btnRecipes.addEventListener('click', function () {
        if (!recipeAdapter) {
          flashAction('Recipe catalog unavailable', { kind: 'warn' });
          return;
        }
        var isHidden = recipeModal.root.classList.contains('cm6gpt-hidden');
        if (isHidden) {
          setRecipeModalOpen(true);
          scheduleRecipeCatalogRefresh();
        } else {
          setRecipeModalOpen(false);
        }
      });

      recipeModal.btnClose.addEventListener('click', function () {
        setRecipeModalOpen(false);
      });
      recipeModal.root.addEventListener('click', function (e) {
        if (e && e.target === recipeModal.root) {
          setRecipeModalOpen(false);
        }
      });

      /* ── Variable Cheat Sheet wiring ── */
      btnVarSheet.addEventListener('click', function () {
        var isHidden = varSheetModal.root.classList.contains('cm6gpt-hidden');
        varSheetModal.root.classList.toggle('cm6gpt-hidden', !isHidden);
        varSheetModal.root.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
        if (isHidden) varSheetModal.root.focus();
      });
      varSheetModal.btnClose.addEventListener('click', function () {
        varSheetModal.root.classList.add('cm6gpt-hidden');
        varSheetModal.root.setAttribute('aria-hidden', 'true');
      });
      varSheetModal.root.addEventListener('click', function (e) {
        if (e && e.target === varSheetModal.root) {
          varSheetModal.root.classList.add('cm6gpt-hidden');
          varSheetModal.root.setAttribute('aria-hidden', 'true');
        }
      });
      varSheetModal.root.addEventListener('keydown', function (e) {
        if (e && String(e.key || '').toLowerCase() === 'escape') {
          varSheetModal.root.classList.add('cm6gpt-hidden');
          varSheetModal.root.setAttribute('aria-hidden', 'true');
        }
      });
      recipeModal.root.addEventListener('keydown', function (e) {
        if (!e) return;
        var draftInput = recipeModal.list ? recipeModal.list.querySelector('.cm6gpt-recipe-inline-input') : null;
        if (draftInput && document.activeElement === draftInput) return;
        var key = String(e.key || '');
        var keyLower = key.toLowerCase();
        var mod = !!(e.metaKey || e.ctrlKey);
        if (mod && !e.altKey && keyLower === 'enter') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e0) { _warn('updateUiPrefButtons', e0); }
          insertSelectedRecipe({ closeOnSuccess: true });
          return;
        }
        if (e.key === 'Escape') {
          try { e.preventDefault(); } catch (e1) { _warn('updateUiPrefButtons', e1); }
          setRecipeModalOpen(false);
          return;
        }
        if (e.key === 'Tab') {
          var focusable = getRecipeModalFocusableNodes();
          if (!focusable.length) {
            try { e.preventDefault(); } catch (e2) { _warn('updateUiPrefButtons', e2); }
            focusDomNode(recipeModal.root);
            return;
          }
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          var active = document.activeElement;
          var outside = !recipeModal.root.contains(active);
          if (e.shiftKey) {
            if (outside || active === first || active === recipeModal.root) {
              try { e.preventDefault(); } catch (e3) { _warn('updateUiPrefButtons', e3); }
              focusDomNode(last);
            }
            return;
          }
          if (outside || active === last) {
            try { e.preventDefault(); } catch (e4) { _warn('updateUiPrefButtons', e4); }
            focusDomNode(first);
          }
        }
      });
      if (recipeModal.splitter) {
        recipeModal.splitter.addEventListener('pointerdown', function (e) {
          if (!e || (typeof e.button === 'number' && e.button !== 0)) return;
          if (recipeModal.root.classList.contains('cm6gpt-hidden')) return;
          recipeSplitDragging = true;
          if (recipeModal.main) recipeModal.main.classList.add('is-resizing');
          document.body.classList.add('cm6gpt-recipes-resizing');
          if (typeof this.setPointerCapture === 'function' && typeof e.pointerId === 'number') {
            try { this.setPointerCapture(e.pointerId); } catch (e0) { _warn('updateUiPrefButtons', e0); }
          }
          updateRecipeSplitFromPointer(e.clientX);
          try { e.preventDefault(); } catch (e1) { _warn('updateUiPrefButtons', e1); }
        });
        recipeModal.splitter.addEventListener('keydown', function (e) {
          if (!e) return;
          var key = String(e.key || '');
          var delta = 0;
          if (key === 'ArrowLeft') delta = -2;
          else if (key === 'ArrowRight') delta = 2;
          else if (key === 'Home') applyRecipeSplitPercent(28);
          else if (key === 'End') applyRecipeSplitPercent(72);
          else return;
          if (delta) applyRecipeSplitPercent(recipeSplitPercent + delta);
          try { e.preventDefault(); } catch (e2) { _warn('updateUiPrefButtons', e2); }
        });
      }
      self._wireRecipeModalRuntime(recipeModal, {
        isDragging: function () { return recipeSplitDragging; },
        updateSplitFromPointer: updateRecipeSplitFromPointer,
        stopSplitDrag: stopRecipeSplitDrag,
        clearSearchDebounce: clearRecipeSearchDebounce,
        clearQueuedRefresh: clearQueuedRecipeCatalogRefresh,
        clearQueuedWarmup: clearQueuedRecipeCatalogWarmup,
        cancelQueuedRender: cancelQueuedRecipeListRender,
        clearHoverPreview: function () { clearRecipeHoverPreview(true); }
      });
      recipeModal.search.addEventListener('input', function () {
        recipeQuery = String(recipeModal.search.value || '').trim();
        clearRecipeSearchDebounce();
        recipeSearchDebounceTimer = setTimeout(function () {
          recipeSearchDebounceTimer = 0;
          applyRecipeFiltersAndRender();
        }, RECIPE_SEARCH_DEBOUNCE_MS);
      });
      function handleRecipeNavKey(e) {
        if (!e) return;
        var key = String(e.key || '');
        var targetToggle = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-group-toggle') : null;
        var targetStar = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item-star') : null;
        var targetRow = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item') : null;
        if (targetToggle) return;
        if (!targetStar && targetRow && (key === 'Enter' || key === ' ')) {
          var targetId = String(targetRow.dataset.recipeId || '');
          if (!targetId) return;
          setRecipeSelectionById(targetId);
          try { e.preventDefault(); } catch (e0) { _warn('handleRecipeNavKey', e0); }
          try { e.stopPropagation(); } catch (e1) { _warn('handleRecipeNavKey', e1); }
          return;
        }
        if (key === 'Home') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e2) { _warn('handleRecipeNavKey', e2); }
          moveRecipeSelectionToBoundary(false);
          return;
        }
        if (key === 'End') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e3) { _warn('handleRecipeNavKey', e3); }
          moveRecipeSelectionToBoundary(true);
          return;
        }
        if (key === 'PageDown') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e4) { _warn('handleRecipeNavKey', e4); }
          moveRecipeSelectionBy(8);
          return;
        }
        if (key === 'PageUp') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e5) { _warn('handleRecipeNavKey', e5); }
          moveRecipeSelectionBy(-8);
          return;
        }
        if (key === 'ArrowDown') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e6) { _warn('handleRecipeNavKey', e6); }
          moveRecipeSelection(1);
          return;
        }
        if (key === 'ArrowUp') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e7) { _warn('handleRecipeNavKey', e7); }
          moveRecipeSelection(-1);
          return;
        }
        if (key === 'Enter') {
          if (!recipeListSnapshot.length) return;
          try { e.preventDefault(); } catch (e8) { _warn('handleRecipeNavKey', e8); }
          insertSelectedRecipe({ closeOnSuccess: !!(e.metaKey || e.ctrlKey) });
        }
      }
      recipeModal.search.addEventListener('keydown', handleRecipeNavKey);
      recipeModal.categorySelect._customSelect.onChange(function (val) {
        recipeCategoryFilter = normalizeRecipeFilterValue(val || '');
        applyRecipeFiltersAndRender();
      });
      recipeModal.tagSelect._customSelect.onChange(function (val) {
        recipeTagFilter = normalizeRecipeFilterValue(val || '');
        applyRecipeFiltersAndRender();
      });
      recipeModal.btnInsert.addEventListener('click', function () {
        insertSelectedRecipe();
      });
      recipeModal.btnFavorites.addEventListener('click', function () {
        if (!recipeAdapter) return;
        recipeFavoritesOnly = !recipeFavoritesOnly;
        persistFavoriteRecipeIds();
        applyRecipeFiltersAndRender();
        syncRecipeFavoritesUi();
      });
      recipeModal.presetAllBtn.addEventListener('click', function () {
        if (hasLockedRecipePresetPolicy()) return;
        if (!recipeAdapter || typeof recipeAdapter.resetPresetFilters !== 'function') return;
        try { recipeAdapter.resetPresetFilters(); } catch (e0) { _warn('handleRecipeNavKey', e0); }
        syncRecipePresetState();
        renderRecipePresetChips();
        applyRecipeFiltersAndRender();
        syncRecipeControls();
      });
      recipeModal.btnImport.addEventListener('click', function () {
        importRecipesFromPrompt();
      });
      recipeModal.btnExport.addEventListener('click', function () {
        exportRecipesToClipboard();
      });
      // P1: Toolbar delete — single button for selected recipe
      // Inline delete confirm helpers
      var deleteConfirmTimer = null;
      function enterDeleteConfirmMode() {
        recipeModal.btnDeleteRecipe.hidden = true;
        recipeModal.btnDeleteConfirm.hidden = false;
        recipeModal.btnDeleteCancel.hidden = false;
        recipeModal.deleteWrap.classList.add('is-confirming');
        clearTimeout(deleteConfirmTimer);
        deleteConfirmTimer = setTimeout(exitDeleteConfirmMode, 4000);
      }
      function exitDeleteConfirmMode() {
        clearTimeout(deleteConfirmTimer);
        recipeModal.btnDeleteRecipe.hidden = false;
        recipeModal.btnDeleteConfirm.hidden = true;
        recipeModal.btnDeleteCancel.hidden = true;
        recipeModal.deleteWrap.classList.remove('is-confirming');
      }
      recipeModal.btnDeleteRecipe.addEventListener('click', function () {
        if (recipeModal.btnDeleteRecipe.disabled) return;
        if (!recipeSelectedId || !recipeAdapter || typeof recipeAdapter.remove !== 'function') return;
        if (!recipeAdapter.isUserOwned(recipeSelectedId)) return;
        enterDeleteConfirmMode();
      });
      recipeModal.btnDeleteConfirm.addEventListener('click', function (evt) {
        evt.stopPropagation();
        var idToDelete = recipeSelectedId;
        exitDeleteConfirmMode();
        if (!idToDelete || !recipeAdapter || typeof recipeAdapter.remove !== 'function') {
          console.warn('[CM6GPT-DELETE] no id or adapter', idToDelete, !!recipeAdapter);
          return;
        }
        if (!recipeAdapter.isUserOwned(idToDelete)) {
          console.warn('[CM6GPT-DELETE] not user-owned', idToDelete);
          return;
        }
        var out = null;
        try { out = recipeAdapter.remove(idToDelete); } catch (e1) { _warn('deleteRecipe.remove', e1); out = null; }
        if (out && out.ok) {
          updateRecipeStatusHint('Deleted: @' + idToDelete);
          recipeSelectedId = '';
          refreshRecipeCatalog({ forceSourceReload: true });
        } else {
          updateRecipeStatusHint('Delete failed: ' + (out && out.reason ? out.reason : 'unknown'));
        }
      });
      recipeModal.btnDeleteCancel.addEventListener('click', function () {
        exitDeleteConfirmMode();
      });
      recipeModal.btnSaveRecipe.addEventListener('click', function () {
        if (recipeModal.btnSaveRecipe.disabled) return;
        openInlineRecipeDraft();
      });
      // Edit mode handlers
      recipeModal.previewBtnEdit.addEventListener('click', enterRecipeEditMode);
      recipeModal.previewBtnCancel.addEventListener('click', function () {
        exitRecipeEditMode();
        var recipe = getSelectedRecipe();
        if (recipe) renderRecipePreview(recipe);
      });
      recipeModal.previewBtnSave.addEventListener('click', saveRecipeEdit);
      recipeModal.previewEditArea.addEventListener('keydown', function (e) {
        if (!e) return;
        // Cmd/Ctrl+Enter = save, Escape = cancel
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          saveRecipeEdit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          exitRecipeEditMode();
          var recipe = getSelectedRecipe();
          if (recipe) renderRecipePreview(recipe);
        }
      });
      recipeModal.list.addEventListener('click', function (e) {
        if (!e) return;
        // P2: Ignore clicks inside draft row
        var draftEl = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item.is-draft') : null;
        if (draftEl) return;
        var toggleBtn = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-group-toggle') : null;
        if (toggleBtn && recipeModal.list.contains(toggleBtn)) {
          var categoryKey = normalizeRecipeAccordionKey(toggleBtn.dataset.categoryKey || '');
          if (!categoryKey) return;
          ensureRecipeCategoryExpanded(categoryKey, recipeExpandedCategories.indexOf(categoryKey) === -1);
          renderRecipeList();
          return;
        }
        var starBtn = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item-star') : null;
        if (starBtn && recipeModal.list.contains(starBtn)) {
          var starRecipeId = String(starBtn.dataset.recipeId || '');
          if (!starRecipeId) return;
          toggleFavoriteRecipeId(starRecipeId);
          applyRecipeFiltersAndRender();
          syncRecipeFavoritesUi();
          try { e.stopPropagation(); } catch (e0) { _warn('exitDeleteConfirmMode', e0); }
          try { e.preventDefault(); } catch (e1) { _warn('exitDeleteConfirmMode', e1); }
          return;
        }
        var row = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item') : null;
        if (!row || !recipeModal.list.contains(row)) return;
        setRecipeSelectionById(String(row.dataset.recipeId || ''));
      });
      recipeModal.list.addEventListener('dblclick', function (e) {
        if (!e) return;
        var toggleBtn = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-group-toggle') : null;
        if (toggleBtn && recipeModal.list.contains(toggleBtn)) {
          try { e.stopPropagation(); } catch (e0) { _warn('exitDeleteConfirmMode', e0); }
          try { e.preventDefault(); } catch (e1) { _warn('exitDeleteConfirmMode', e1); }
          return;
        }
        var starBtn = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item-star') : null;
        if (starBtn && recipeModal.list.contains(starBtn)) {
          try { e.stopPropagation(); } catch (e2) { _warn('exitDeleteConfirmMode', e2); }
          try { e.preventDefault(); } catch (e3) { _warn('exitDeleteConfirmMode', e3); }
          return;
        }
        var row = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item') : null;
        if (!row || !recipeModal.list.contains(row)) return;
        if (!setRecipeSelectionById(String(row.dataset.recipeId || ''))) return;
        insertSelectedRecipe({ closeOnSuccess: true });
      });
      recipeModal.list.addEventListener('keydown', handleRecipeNavKey);

      recipeModal.list.addEventListener('mouseover', function (e) {
        if (!e) return;
        var row = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item') : null;
        if (!row || !recipeModal.list.contains(row)) return;
        var id = String(row.dataset.recipeId || '');
        recipeHoverPreview.schedule(id);
      });
      recipeModal.list.addEventListener('mouseout', function (e) {
        if (!e) return;
        var row = e.target && e.target.closest ? e.target.closest('.cm6gpt-recipe-item') : null;
        var related = e.relatedTarget && e.relatedTarget.closest
          ? e.relatedTarget.closest('.cm6gpt-recipe-item')
          : null;
        // Only clear if leaving the list or moving to a different row
        if (row && related && row === related) return;
        clearRecipeHoverPreview(true);
      });

      btnRefresh.addEventListener('click', function () {
        listeners.refresh.forEach(function (cb) {
          try { cb(); } catch (e) { _warn('exitDeleteConfirmMode', e); }
        });
      });

      btnDock.addEventListener('click', function () {
        uiPrefs.dockMode = (uiPrefs.dockMode === 'full') ? 'centered' : 'full';
        var nowFull = uiPrefs.dockMode === 'full';
        root.classList.toggle('cm6gpt-dock-full', nowFull);
        // Immediately propagate to <html> so sidebar CSS reacts without waiting for RAF
        document.documentElement.classList.toggle('cm6gpt-dock-full', nowFull);
        self._saveUiPrefs(uiPrefs);
        updateUiPrefButtons();
        if (typeof root.__cm6gptLayoutSync === 'function') {
          try { root.__cm6gptLayoutSync(); } catch (e) { _warn('exitDeleteConfirmMode', e); }
        }
      });

      btnFlush.addEventListener('click', function () {
        uiPrefs.flushDock = !uiPrefs.flushDock;
        root.classList.toggle('cm6gpt-dock-flush', !!uiPrefs.flushDock);
        self._saveUiPrefs(uiPrefs);
        updateUiPrefButtons();
        if (typeof root.__cm6gptLayoutSync === 'function') {
          try { root.__cm6gptLayoutSync(); } catch (e) { _warn('exitDeleteConfirmMode', e); }
        }
      });

      btnFontDown.addEventListener('click', function () {
        var next = self._clampFontSize(uiPrefs.editorFontSize - 1);
        if (next === uiPrefs.editorFontSize) return;
        uiPrefs.editorFontSize = self._applyEditorFontSize(next);
        self._saveUiPrefs(uiPrefs);
        updateUiPrefButtons();
        if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
          ns.editors.refreshMountedEditors();
        }
      });

      btnFontUp.addEventListener('click', function () {
        var next = self._clampFontSize(uiPrefs.editorFontSize + 1);
        if (next === uiPrefs.editorFontSize) return;
        uiPrefs.editorFontSize = self._applyEditorFontSize(next);
        self._saveUiPrefs(uiPrefs);
        updateUiPrefButtons();
        if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
          ns.editors.refreshMountedEditors();
        }
      });

      btnWrap.addEventListener('click', function () {
        uiPrefs.softWrap = !uiPrefs.softWrap;
        root.classList.toggle('cm6gpt-wrap-on', !!uiPrefs.softWrap);
        self._saveUiPrefs(uiPrefs);
        updateUiPrefButtons();
        if (ns.editors && typeof ns.editors.setSoftWrapForMounted === 'function') {
          ns.editors.setSoftWrapForMounted(!!uiPrefs.softWrap);
        }
        if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
          ns.editors.refreshMountedEditors();
        }
      });

      // cssApplyBtn click listener removed — Lite uses live-sync

      cssAddClassBtn.addEventListener('click', function () {
        if (cssAddClassBtn.disabled) return;
        setCssAddClassPopoverOpen(!cssClassAddPopoverOpen);
      });
      // Popover opens only on click (line above), not on hover
      cssAddClassInput.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === 'Enter') {
          try { e.preventDefault(); } catch (e0) { _warn('exitDeleteConfirmMode', e0); }
          submitCssClassAddFromPopover();
          return;
        }
        if (e.key === 'Escape') {
          try { e.preventDefault(); } catch (e1) { _warn('exitDeleteConfirmMode', e1); }
          setCssAddClassPopoverOpen(false, { restoreFocus: true });
        }
      });
      cssAddClassSubmitBtn.addEventListener('click', function () {
        submitCssClassAddFromPopover();
      });
      cssAddClassCancelBtn.addEventListener('click', function () {
        setCssAddClassPopoverOpen(false, { restoreFocus: true });
      });
      function onCssClassPopoverDocumentMouseDown(e) {
        if (!cssClassAddPopoverOpen) return;
        if (!cssAddClassWrap.contains(e.target)) {
          setCssAddClassPopoverOpen(false);
        }
      }
      trackPanelGlobalListener(document, 'mousedown', onCssClassPopoverDocumentMouseDown, true);

      function finalizePanelClose(opts) {
        opts = opts || {};
        var restoreFocus = opts.restoreFocus !== false;
        var activeEl = document.activeElement;
        var wasVisible = !!(root && root.classList && !root.classList.contains('cm6gpt-hidden'));

        root.classList.add('cm6gpt-hidden');
        document.documentElement.classList.remove('cm6gpt-panel-open');
        if (launcher) launcher.classList.remove('cm6gpt-hidden');

        blurActiveElementWithin(root, document, 'finalizePanelClose');
        if (restoreFocus) focusDomNode(launcher, { preventScroll: true, context: 'finalizePanelClose' });
        if (typeof root.__cm6gptLayoutSync === 'function') {
          try { root.__cm6gptLayoutSync(); } catch (eSync) { _warn('finalizePanelClose', eSync); }
        }
        if (!wasVisible) return;
        listeners.close.forEach(function (cb) {
          try { cb(); } catch (eCb) { _warn('finalizePanelClose', eCb); }
        });
      }

      btnMin.addEventListener('click', function () {
        setCssAddClassPopoverOpen(false);
        setPanelMinimized(!root.classList.contains('cm6gpt-minimized'), true);
      });

      miniDock.addEventListener('click', function () {
        setPanelMinimized(false, false);
        if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
          ns.editors.refreshMountedEditors();
        }
      });

      btnClose.addEventListener('click', function () {
        setCssAddClassPopoverOpen(false);
        setRecipeModalOpen(false, { restoreFocus: false });
        setPanelMinimized(false, false);
        finalizePanelClose({ restoreFocus: true });
      });

      chipHtml.addEventListener('click', function () {
        setPaneVisibility('html', !paneVisibility.html);
      });
      chipCss.addEventListener('click', function () {
        setPaneVisibility('css', !paneVisibility.css);
      });
      chipUndo.addEventListener('click', function () {
        if (chipUndo.disabled) return;
        emitUndo();
      });
      chipRedo.addEventListener('click', function () {
        if (chipRedo.disabled) return;
        emitRedo();
      });
      root.addEventListener('keydown', function (e) {
        if (!e) return;
        if (!root.contains(e.target)) return;
        var target = e.target;
        var inEditor = !!(target && target.closest && target.closest('.cm6gpt-editor-wrap'));
        if (!inEditor) return;
        var mod = !!(e.metaKey || e.ctrlKey);
        if (!mod || e.altKey) return;
        var key = String(e.key || '').toLowerCase();
        var isUndo = (key === 'z' && !e.shiftKey);
        var isRedo = (key === 'y') || (key === 'z' && !!e.shiftKey);
        // Stop Bricks from intercepting Ctrl+C/X/V inside our editor
        var isCopyPaste = (key === 'c' || key === 'x' || key === 'v');
        if (!isUndo && !isRedo && !isCopyPaste) return;
        if (isCopyPaste) {
          // Only stop propagation — let the browser handle copy/paste natively
          try { e.stopPropagation(); } catch (e2) { _warn('exitDeleteConfirmMode', e2); }
          return;
        }
        try { e.preventDefault(); } catch (e0) { _warn('exitDeleteConfirmMode', e0); }
        try { e.stopPropagation(); } catch (e1) { _warn('exitDeleteConfirmMode', e1); }
        if (isUndo) emitUndo();
        else emitRedo();
      }, true);

      cssPropertyFilterUi.buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = String(btn.dataset.cssPropertyFilter || '');
          if (key !== 'class' && key !== 'id') return;
          var next = {
            class: cssPropertyFilter.class,
            id: cssPropertyFilter.id
          };
          if (key === 'class') {
            next.class = true;
            next.id = false;
          } else if (key === 'id') {
            next.class = false;
            next.id = true;
          }
          setCssPropertyFilter(next, true);
        });
      });

      scopeModeUi.buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = String(btn.dataset.scopeMode || '');
          setScopeMode(next, true);
        });
      });
      htmlLensModeUi.buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = String(btn.dataset.htmlLensMode || '');
          setHtmlLensMode(next, true);
        });
      });
      if (cssLensModeUi.trigger) {
        cssLensModeUi.trigger.addEventListener('click', function () {
          var next = cssLensMode === 'global' ? 'minimal' : 'global';
          setCssLensMode(next, true);
        });
      }

      var api = {
        root: root,
        htmlMount: htmlPane.mount,
        cssMount: cssPane.mount,
        setStatus: function (text) { statusMain.textContent = String(text || ''); },
        setSelectionInfo: function (text) { statusSide.textContent = String(text || ''); },
        flashAction: flashAction,
        setPaneMeta: function (which, text) {
          if (which === 'html') {
            renderStructuredPaneContext(contextHtml, 'html', text);
            htmlPane.meta.textContent = '';
            return;
          }
          if (which === 'css') {
            renderStructuredPaneContext(contextCss, 'css', text);
            cssPane.meta.textContent = '';
            return;
          }
          var target = which === 'css' ? cssPane.meta : htmlPane.meta;
          target.textContent = String(text || '');
        },
        setCssInfo: function (text, opts) {
          opts = opts || {};
          var infoText = String(text || '').trim();
          cssInfoState.text = infoText;
          cssInfoState.active = opts.active !== false;
          renderCssInfoPopover();
          if (!infoText) setCssInfoPopoverOpen(false);
        },
        setPaneGate: function (which, gate) {
          if (which !== 'html') return;
          var level = gate && gate.level ? String(gate.level) : '';
          var reasons = gate && Array.isArray(gate.reasons) ? gate.reasons : [];
          var diagnostics = gate && gate.diagnostics && typeof gate.diagnostics === 'object'
            ? gate.diagnostics
            : null;
          var policySummary = diagnostics && diagnostics.summary ? String(diagnostics.summary).trim() : '';
          htmlGateBadge.className = 'cm6gpt-gate';
          if (!level) {
            htmlGateBadge.hidden = true;
            htmlGateBadge.textContent = '';
            htmlGateBadge.removeAttribute('title');
            return;
          }
          htmlGateBadge.hidden = false;
          htmlGateBadge.textContent = level;
          htmlGateBadge.classList.add('is-' + level);
          if (reasons.length) {
            htmlGateBadge.title = (
              'Gate: ' + level + '\n' +
              (policySummary ? (policySummary + '\n') : '') +
              reasons.slice(0, 4).join('\n')
            ).trim();
          } else if (policySummary) {
            htmlGateBadge.title = ('Gate: ' + level + '\n' + policySummary).trim();
          } else {
            htmlGateBadge.title = 'Gate: ' + level;
          }
        },
        setHtmlApplyState: function (state) {
          void state;
        },
        setCssApplyState: function () {
          // No-op: cssApplyBtn removed in Lite — live-sync replaces manual Apply CSS
        },
        setCssClassAddState: function (state) {
          state = state || {};
          var enabled = !!state.enabled;
          var busy = !!state.busy;
          cssAddClassBtn.disabled = !enabled || busy;
          if (!enabled || busy) {
            setCssAddClassPopoverOpen(false);
            cssAddClassInput.value = '';
          }
          setIcon(
            cssAddClassBtn,
            busy ? 'fas fa-spinner fa-spin' : 'fas fa-plus',
            busy ? 'Adding class' : (state.label || 'Add class')
          );
          cssAddClassBtn.classList.toggle('is-busy', busy);
          if (state.title) {
            cssAddClassBtn.title = state.title;
          } else if (busy) {
            cssAddClassBtn.title = 'Adding class';
          } else if (!enabled) {
            cssAddClassBtn.title = 'Select a Bricks element in Write mode to add class';
          } else {
            cssAddClassBtn.title = 'Add class to selected element. New class becomes the active class target.';
          }
        },
        setCssPropertyFilter: function (filter, emit) {
          setCssPropertyFilter(filter, emit);
        },
        bindRecipeManager: function (adapter) {
          recipeAdapter = (adapter && typeof adapter === 'object') ? adapter : null;
          clearQueuedRecipeCatalogWarmup();
          recipeQuery = '';
          recipeCategoryFilter = '';
          recipeTagFilter = '';
          recipeSelectedId = '';
          recipeExpandedCategories = [];
          invalidateRecipeCatalogCache();
          recipePresetState = {
            locked: false,
            mode: '',
            custom: false,
            activePresetKey: 'all',
            activePresetLabel: 'All Recipes',
            enabledPresets: [],
            presets: []
          };
          if (recipeModal && recipeModal.search) recipeModal.search.value = '';
          if (recipeModal && recipeModal.categorySelect) recipeModal.categorySelect.value = '';
          if (recipeModal && recipeModal.tagSelect) recipeModal.tagSelect.value = '';
          syncRecipeControls();
          if (recipeModal && recipeModal.root && !recipeModal.root.classList.contains('cm6gpt-hidden')) {
            scheduleRecipeCatalogRefresh();
          } else {
            scheduleRecipeCatalogWarmup();
          }
        },
        openRecipeManager: function () {
          if (!recipeAdapter) return false;
          setRecipeModalOpen(true);
          scheduleRecipeCatalogRefresh();
          return true;
        },
        closeRecipeManager: function () {
          setRecipeModalOpen(false);
        },
        isRecipeManagerOpen: function () {
          return !recipeModal.root.classList.contains('cm6gpt-hidden');
        },
        onRefresh: function (cb) { if (typeof cb === 'function') listeners.refresh.push(cb); },
        onClose: function (cb) { if (typeof cb === 'function') listeners.close.push(cb); },
        onScopeModeChange: function (cb) { if (typeof cb === 'function') listeners.scopeMode.push(cb); },
        onLayerModeChange: function (cb) { if (typeof cb === 'function') listeners.layerMode.push(cb); },
        onHtmlLensModeChange: function (cb) { if (typeof cb === 'function') listeners.htmlLensMode.push(cb); },
        onCssLensModeChange: function (cb) { if (typeof cb === 'function') listeners.cssLensMode.push(cb); },
        onCssPropertyFilterChange: function (cb) { if (typeof cb === 'function') listeners.cssPropertyFilter.push(cb); },
        onCssContextTargetSelect: function (cb) { if (typeof cb === 'function') listeners.cssContextTarget.push(cb); },
        onCssApply: function () { /* No-op: Apply CSS removed in Lite */ },
        onCssClassAdd: function (cb) { if (typeof cb === 'function') listeners.cssClassAdd.push(cb); },
        onUndo: function (cb) { if (typeof cb === 'function') listeners.undo.push(cb); },
        onRedo: function (cb) { if (typeof cb === 'function') listeners.redo.push(cb); },
        onHtmlCopy: function (cb) { if (typeof cb === 'function') listeners.htmlCopy.push(cb); },
        onCssCopy: function (cb) { if (typeof cb === 'function') listeners.cssCopy.push(cb); },
        getScopeMode: function () { return scopeMode; },
        setScopeMode: function (mode) { setScopeMode(mode, false); },
        getLayerMode: function () { return layerMode; },
        setLayerMode: function (mode) { setLayerMode(mode, false); },
        getHtmlLensMode: function () { return htmlLensMode; },
        setHtmlLensMode: function (mode) { setHtmlLensMode(mode, false); },
        getCssLensMode: function () { return cssLensMode; },
        setCssLensMode: function (mode) { setCssLensMode(mode, false); },
        getCssPropertyFilter: function () {
          return {
            class: cssPropertyFilter.class,
            id: cssPropertyFilter.id
          };
        },
        setUndoRedoState: function (state) { setUndoRedoState(state); },
        isSoftWrapEnabled: function () { return !!uiPrefs.softWrap; },
        show: function () {
          setPanelMinimized(false, false);
          root.classList.remove('cm6gpt-hidden');
          document.documentElement.classList.add('cm6gpt-panel-open');
          if (launcher) launcher.classList.add('cm6gpt-hidden');
          if (typeof root.__cm6gptLayoutSync === 'function') {
            try { root.__cm6gptLayoutSync(); } catch (e) { _warn('show', e); }
          }
        },
        refreshEditors: function () {
          if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
            ns.editors.refreshMountedEditors();
          }
        },
        destroy: function () {
          cleanupPanelLifecycle();
        }
      };
      root.__cm6gptPanelApi = api;
      return api;
    },

    _createRecipeManagerModal: function () {
      var overlay = el('section', 'cm6gpt-recipes-modal cm6gpt-hidden');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Recipe Catalog');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.tabIndex = -1;

      var card = el('div', 'cm6gpt-recipes-card');
      overlay.appendChild(card);

      var head = el('div', 'cm6gpt-recipes-head');
      var title = el('div', 'cm6gpt-recipes-title', 'Recipe Catalog');
      var count = el('div', 'cm6gpt-recipes-count', '0 recipes');
      var btnClose = el('button', 'cm6gpt-btn is-danger');
      btnClose.type = 'button';
      btnClose.classList.add('cm6gpt-recipes-action-close');
      btnClose.title = 'Close recipe catalog';
      btnClose.setAttribute('aria-label', 'Close recipe catalog');
      setIcon(btnClose, 'fas fa-times', 'Close recipe catalog');
      head.appendChild(title);
      head.appendChild(count);
      head.appendChild(btnClose);
      card.appendChild(head);

      var tools = el('div', 'cm6gpt-recipes-tools');
      var search = el('input', 'cm6gpt-recipes-search');
      search.type = 'search';
      search.placeholder = 'Search recipes by alias, tag, category...';
      search.setAttribute('aria-label', 'Search recipes');
      search.autocomplete = 'off';
      search.spellcheck = false;
      var categoryCustom = createCustomSelect({ ariaLabel: 'Filter recipes by category' });
      categoryCustom.setOptions([{ value: '', label: 'All categories' }]);
      var categorySelect = categoryCustom.root;
      categorySelect.classList.add('cm6gpt-recipes-select', 'is-category-filter');
      categorySelect._customSelect = categoryCustom;
      var tagCustom = createCustomSelect({ ariaLabel: 'Filter recipes by tag' });
      tagCustom.setOptions([{ value: '', label: 'All tags' }]);
      var tagSelect = tagCustom.root;
      tagSelect.classList.add('cm6gpt-recipes-select', 'is-tag-filter');
      tagSelect._customSelect = tagCustom;
      var btnInsert = el('button', 'cm6gpt-pane-btn');
      btnInsert.type = 'button';
      btnInsert.classList.add('cm6gpt-recipes-action-insert');
      btnInsert.title = 'Insert selected recipe';
      setIcon(btnInsert, 'fas fa-arrow-down', 'Insert selected recipe');
      var btnFavorites = el('button', 'cm6gpt-pane-btn');
      btnFavorites.type = 'button';
      btnFavorites.classList.add('cm6gpt-recipes-action-favorites');
      btnFavorites.title = 'Show favorites only';
      btnFavorites.setAttribute('aria-pressed', 'false');
      setIcon(btnFavorites, 'fas fa-star', 'Show favorites only');
      var btnImport = el('button', 'cm6gpt-pane-btn');
      btnImport.type = 'button';
      btnImport.classList.add('cm6gpt-recipes-action-import');
      btnImport.title = 'Import recipes from JSON';
      setIcon(btnImport, 'fas fa-file-import', 'Import recipes');
      var btnExport = el('button', 'cm6gpt-pane-btn');
      btnExport.type = 'button';
      btnExport.classList.add('cm6gpt-recipes-action-export');
      btnExport.title = 'Export recipes as JSON';
      setIcon(btnExport, 'fas fa-file-export', 'Export recipes');
      // Inline recipe create action
      var btnSaveRecipe = el('button', 'cm6gpt-pane-btn');
      btnSaveRecipe.type = 'button';
      btnSaveRecipe.classList.add('cm6gpt-recipes-action-save');
      btnSaveRecipe.title = 'Save current CSS as recipe';
      setIcon(btnSaveRecipe, 'fas fa-plus', 'Save as recipe');
      // Single toolbar delete action with inline confirm
      var btnDeleteRecipe = el('button', 'cm6gpt-pane-btn');
      btnDeleteRecipe.type = 'button';
      btnDeleteRecipe.classList.add('cm6gpt-recipes-action-delete');
      btnDeleteRecipe.title = 'Delete selected recipe';
      btnDeleteRecipe.disabled = true;
      setIcon(btnDeleteRecipe, 'fas fa-trash-alt', 'Delete recipe');
      var btnDeleteConfirm = el('button', 'cm6gpt-pane-btn cm6gpt-recipes-action-delete-confirm');
      btnDeleteConfirm.type = 'button';
      btnDeleteConfirm.title = 'Confirm delete';
      btnDeleteConfirm.hidden = true;
      setIcon(btnDeleteConfirm, 'fas fa-check', 'Confirm delete');
      var btnDeleteCancel = el('button', 'cm6gpt-pane-btn cm6gpt-recipes-action-delete-cancel');
      btnDeleteCancel.type = 'button';
      btnDeleteCancel.title = 'Cancel delete';
      btnDeleteCancel.hidden = true;
      setIcon(btnDeleteCancel, 'fas fa-times', 'Cancel delete');
      var deleteWrap = el('div', 'cm6gpt-recipes-delete-wrap');
      deleteWrap.appendChild(btnDeleteRecipe);
      deleteWrap.appendChild(btnDeleteConfirm);
      deleteWrap.appendChild(btnDeleteCancel);
      var toolActions = el('div', 'cm6gpt-recipes-tool-actions');
      toolActions.appendChild(btnInsert);
      toolActions.appendChild(btnFavorites);
      toolActions.appendChild(btnSaveRecipe);
      toolActions.appendChild(deleteWrap);
      toolActions.appendChild(btnImport);
      toolActions.appendChild(btnExport);
      tools.appendChild(search);
      tools.appendChild(categorySelect);
      tools.appendChild(tagSelect);
      tools.appendChild(toolActions);
      card.appendChild(tools);

      var presetWrap = el('div', 'cm6gpt-recipes-presets');
      var presetLabel = el('div', 'cm6gpt-recipes-presets-label', 'Sources');
      var presetAllBtn = el('button', 'cm6gpt-recipes-preset-chip is-active', 'All sources');
      presetAllBtn.type = 'button';
      presetAllBtn.title = 'Show all recipe sources';
      presetAllBtn.setAttribute('aria-pressed', 'true');
      var presetList = el('div', 'cm6gpt-recipes-presets-list');
      presetWrap.hidden = true;
      presetWrap.appendChild(presetLabel);
      presetWrap.appendChild(presetAllBtn);
      presetWrap.appendChild(presetList);
      card.appendChild(presetWrap);

      var recentWrap = el('div', 'cm6gpt-recipes-recent');
      var recentLabel = el('div', 'cm6gpt-recipes-recent-label', 'Recent');
      var recentList = el('div', 'cm6gpt-recipes-recent-list');
      recentWrap.hidden = true;
      recentWrap.appendChild(recentLabel);
      recentWrap.appendChild(recentList);
      card.appendChild(recentWrap);

      var main = el('div', 'cm6gpt-recipes-main');
      var listWrap = el('div', 'cm6gpt-recipes-list-wrap');
      var list = el('div', 'cm6gpt-recipes-list');
      var empty = el('div', 'cm6gpt-recipes-empty', 'No recipes');
      listWrap.appendChild(list);
      listWrap.appendChild(empty);
      main.appendChild(listWrap);

      var splitter = el('button', 'cm6gpt-recipes-splitter');
      splitter.type = 'button';
      splitter.title = 'Resize recipe list and preview';
      splitter.setAttribute('aria-label', 'Resize recipe list and preview');
      splitter.setAttribute('role', 'separator');
      splitter.setAttribute('aria-orientation', 'vertical');
      splitter.setAttribute('aria-valuemin', '28');
      splitter.setAttribute('aria-valuemax', '72');
      splitter.setAttribute('aria-valuenow', '38');
      main.appendChild(splitter);

      var preview = el('div', 'cm6gpt-recipes-preview');
      var previewTitle = el('div', 'cm6gpt-recipes-preview-title', 'No recipe selected');
      var previewMeta = el('div', 'cm6gpt-recipes-preview-meta', '');
      var previewBody = el('pre', 'cm6gpt-recipes-preview-body', '');
      // Edit mode elements
      var previewEditBar = el('div', 'cm6gpt-recipes-preview-edit-bar');
      var previewBtnEdit = el('button', 'cm6gpt-pane-btn cm6gpt-recipes-preview-btn-edit');
      previewBtnEdit.type = 'button';
      previewBtnEdit.title = 'Edit recipe';
      setIcon(previewBtnEdit, 'fas fa-pen', 'Edit');
      previewBtnEdit.hidden = true;
      var previewBtnSave = el('button', 'cm6gpt-pane-btn cm6gpt-recipes-preview-btn-save', 'Save');
      previewBtnSave.type = 'button';
      previewBtnSave.hidden = true;
      var previewBtnCancel = el('button', 'cm6gpt-pane-btn cm6gpt-recipes-preview-btn-cancel', 'Cancel');
      previewBtnCancel.type = 'button';
      previewBtnCancel.hidden = true;
      var previewEditCategory = el('select', 'cm6gpt-recipes-preview-edit-category');
      previewEditCategory.hidden = true;
      previewEditBar.appendChild(previewBtnEdit);
      previewEditBar.appendChild(previewEditCategory);
      previewEditBar.appendChild(previewBtnSave);
      previewEditBar.appendChild(previewBtnCancel);
      var previewEditArea = el('textarea', 'cm6gpt-recipes-preview-edit-area');
      previewEditArea.hidden = true;
      previewEditArea.spellcheck = false;
      previewEditArea.placeholder = 'CSS body...';
      preview.appendChild(previewTitle);
      preview.appendChild(previewMeta);
      preview.appendChild(previewEditBar);
      preview.appendChild(previewBody);
      preview.appendChild(previewEditArea);
      main.appendChild(preview);
      card.appendChild(main);

      var status = el('div', 'cm6gpt-recipes-status', '');
      card.appendChild(status);

      function cleanup() {
        var categoryCleanup = categorySelect && categorySelect.__cm6gptCustomSelectCleanup;
        var tagCleanup = tagSelect && tagSelect.__cm6gptCustomSelectCleanup;
        if (typeof categoryCleanup === 'function') {
          try { categoryCleanup(); } catch (e0) { _warn('_createRecipeManagerModal', e0); }
          if (categorySelect.__cm6gptCustomSelectCleanup === categoryCleanup) {
            categorySelect.__cm6gptCustomSelectCleanup = null;
          }
        }
        if (typeof tagCleanup === 'function') {
          try { tagCleanup(); } catch (e1) { _warn('_createRecipeManagerModal', e1); }
          if (tagSelect.__cm6gptCustomSelectCleanup === tagCleanup) {
            tagSelect.__cm6gptCustomSelectCleanup = null;
          }
        }
        if (overlay.__cm6gptRecipeModalCleanup === cleanup) {
          overlay.__cm6gptRecipeModalCleanup = null;
        }
      }

      overlay.__cm6gptRecipeModalCleanup = cleanup;

      return {
        root: overlay,
        card: card,
        main: main,
        splitter: splitter,
        btnClose: btnClose,
        search: search,
        categorySelect: categorySelect,
        tagSelect: tagSelect,
        presetWrap: presetWrap,
        presetLabel: presetLabel,
        presetAllBtn: presetAllBtn,
        presetList: presetList,
        recentWrap: recentWrap,
        recentList: recentList,
        btnInsert: btnInsert,
        btnFavorites: btnFavorites,
        btnImport: btnImport,
        btnExport: btnExport,
        btnSaveRecipe: btnSaveRecipe,
        btnDeleteRecipe: btnDeleteRecipe,
        btnDeleteConfirm: btnDeleteConfirm,
        btnDeleteCancel: btnDeleteCancel,
        deleteWrap: deleteWrap,
        count: count,
        list: list,
        empty: empty,
        previewTitle: previewTitle,
        previewMeta: previewMeta,
        previewBody: previewBody,
        previewBtnEdit: previewBtnEdit,
        previewBtnSave: previewBtnSave,
        previewBtnCancel: previewBtnCancel,
        previewEditCategory: previewEditCategory,
        previewEditArea: previewEditArea,
        status: status,
        cleanup: cleanup
      };
    },

    _wireRecipeModalRuntime: function (recipeModal, hooks) {
      hooks = hooks || {};
      var cleanedUp = false;
      var teardownFns = [];
      var baseCleanup = recipeModal && typeof recipeModal.cleanup === 'function'
        ? recipeModal.cleanup
        : function () {};
      var isDragging = typeof hooks.isDragging === 'function'
        ? hooks.isDragging
        : function () { return false; };
      var updateSplitFromPointer = typeof hooks.updateSplitFromPointer === 'function'
        ? hooks.updateSplitFromPointer
        : function () {};
      var stopSplitDrag = typeof hooks.stopSplitDrag === 'function'
        ? hooks.stopSplitDrag
        : function () {};
      var clearSearchDebounce = typeof hooks.clearSearchDebounce === 'function'
        ? hooks.clearSearchDebounce
        : function () {};
      var clearQueuedRefresh = typeof hooks.clearQueuedRefresh === 'function'
        ? hooks.clearQueuedRefresh
        : function () {};
      var clearQueuedWarmup = typeof hooks.clearQueuedWarmup === 'function'
        ? hooks.clearQueuedWarmup
        : function () {};
      var cancelQueuedRender = typeof hooks.cancelQueuedRender === 'function'
        ? hooks.cancelQueuedRender
        : function () {};
      var clearHoverPreview = typeof hooks.clearHoverPreview === 'function'
        ? hooks.clearHoverPreview
        : function () {};

      function trackListener(target, type, handler, options) {
        return getBridgeRuntimeUtils().trackListener(teardownFns, target, type, handler, options);
      }

      function onPointerMove(e) {
        if (!isDragging() || !e) return;
        updateSplitFromPointer(e.clientX);
      }

      function onPointerUp() {
        stopSplitDrag();
      }

      function onPointerCancel() {
        stopSplitDrag();
      }

      function onWindowBlur() {
        stopSplitDrag();
      }

      trackListener(w, 'pointermove', onPointerMove);
      trackListener(w, 'pointerup', onPointerUp);
      trackListener(w, 'pointercancel', onPointerCancel);
      trackListener(w, 'blur', onWindowBlur);

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        clearSearchDebounce();
        clearQueuedRefresh();
        clearQueuedWarmup();
        cancelQueuedRender();
        clearHoverPreview();
        stopSplitDrag();
        try { baseCleanup(); } catch (e0) { _warn('_wireRecipeModalRuntime', e0); }
        getBridgeRuntimeUtils().drainCleanupQueue(teardownFns, function (e1) {
          _warn('_wireRecipeModalRuntime', e1);
        });
        if (recipeModal) {
          if (recipeModal.cleanup === cleanup) recipeModal.cleanup = null;
          if (recipeModal.root && recipeModal.root.__cm6gptRecipeModalCleanup === cleanup) {
            recipeModal.root.__cm6gptRecipeModalCleanup = null;
          }
        }
      }

      if (recipeModal) {
        recipeModal.cleanup = cleanup;
        if (recipeModal.root) recipeModal.root.__cm6gptRecipeModalCleanup = cleanup;
      }

      return cleanup;
    },

    _createVarCheatSheetModal: function () {
      /* Read config at runtime — panel.js loads before CM6GPT_Lite_Config inline */
      var runtimeCfg = window.CM6GPT_Lite_Config || window.CM6GPT_Config || {};
      var fullVars = Array.isArray(runtimeCfg.bricksVariablesFull) ? runtimeCfg.bricksVariablesFull : [];
      if (!fullVars.length) {
        var nameList = Array.isArray(runtimeCfg.bricksVariables) ? runtimeCfg.bricksVariables : [];
        for (var ni = 0; ni < nameList.length; ni++) {
          var n = String(nameList[ni] || '');
          if (n) fullVars.push({ name: n, value: '' });
        }
      }
      var vars = fullVars;

      function categorize(list) {
        var groups = {};
        var order = [];
        for (var i = 0; i < list.length; i++) {
          var v = list[i];
          if (!v || !v.name) continue;
          var raw = String(v.name).replace(/^--/, '');
          var parts = raw.split('-');
          var prefix = parts.length > 1 ? parts[0] : 'misc';
          if (!groups[prefix]) {
            groups[prefix] = [];
            order.push(prefix);
          }
          groups[prefix].push(v);
        }
        order.sort();
        return { groups: groups, order: order };
      }

      var data = categorize(vars);

      var overlay = el('section', 'cm6gpt-varsheet-modal cm6gpt-hidden');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Variable Cheat Sheet');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.tabIndex = -1;

      var card = el('div', 'cm6gpt-varsheet-card');
      overlay.appendChild(card);

      var head = el('div', 'cm6gpt-varsheet-head');
      var title = el('div', 'cm6gpt-varsheet-title', 'Variable Cheat Sheet');
      var count = el('div', 'cm6gpt-varsheet-count', vars.length + ' variables');
      var btnClose = el('button', 'cm6gpt-btn is-danger');
      btnClose.type = 'button';
      btnClose.title = 'Close';
      btnClose.setAttribute('aria-label', 'Close cheat sheet');
      setIcon(btnClose, 'fas fa-times', 'Close');
      head.appendChild(title);
      head.appendChild(count);
      head.appendChild(btnClose);
      card.appendChild(head);

      var tools = el('div', 'cm6gpt-varsheet-tools');
      var search = el('input', 'cm6gpt-varsheet-search');
      search.type = 'search';
      search.placeholder = 'Search variables...';
      search.setAttribute('aria-label', 'Search variables');
      search.autocomplete = 'off';
      search.spellcheck = false;
      tools.appendChild(search);
      card.appendChild(tools);

      var body = el('div', 'cm6gpt-varsheet-body');
      card.appendChild(body);
      var varSheetUiTimeouts = createManagedTimeoutRegistry();

      var expandedGroups = {};

      function isColor(val) {
        if (!val) return false;
        var v = String(val).trim();
        return /^#([0-9a-f]{3,8})$/i.test(v) ||
               /^rgba?\s*\(/.test(v) ||
               /^hsla?\s*\(/.test(v);
      }

      function clearChildren(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
      }

      function renderGroups(filter) {
        clearChildren(body);
        var query = String(filter || '').toLowerCase().trim();
        var totalVisible = 0;
        for (var g = 0; g < data.order.length; g++) {
          var prefix = data.order[g];
          var items = data.groups[prefix];
          var filtered = [];
          for (var i = 0; i < items.length; i++) {
            var name = String(items[i].name || '').toLowerCase();
            var value = String(items[i].value || '').toLowerCase();
            if (!query || name.indexOf(query) !== -1 || value.indexOf(query) !== -1) {
              filtered.push(items[i]);
            }
          }
          if (!filtered.length) continue;
          totalVisible += filtered.length;

          var group = el('div', 'cm6gpt-varsheet-group');
          var isExpanded = !!expandedGroups[prefix];

          var toggle = el('button', 'cm6gpt-varsheet-group-toggle');
          toggle.type = 'button';
          toggle.dataset.prefix = prefix;
          toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
          var arrow = el('i', isExpanded ? 'fas fa-chevron-down cm6gpt-varsheet-arrow' : 'fas fa-chevron-right cm6gpt-varsheet-arrow');
          arrow.setAttribute('aria-hidden', 'true');
          var label = el('span', 'cm6gpt-varsheet-group-label', prefix);
          var badge = el('span', 'cm6gpt-varsheet-group-badge', String(filtered.length));
          toggle.appendChild(arrow);
          toggle.appendChild(label);
          toggle.appendChild(badge);
          group.appendChild(toggle);

          if (isExpanded || query) {
            if (query) expandedGroups[prefix] = true;
            toggle.setAttribute('aria-expanded', 'true');
            arrow.className = 'fas fa-chevron-down cm6gpt-varsheet-arrow';
            var table = el('div', 'cm6gpt-varsheet-table');
            for (var j = 0; j < filtered.length; j++) {
              var row = el('div', 'cm6gpt-varsheet-row');
              var nameCell = el('span', 'cm6gpt-varsheet-name');
              nameCell.textContent = 'var(' + filtered[j].name + ')';
              nameCell.title = 'Click to copy';
              nameCell.dataset.varName = 'var(' + filtered[j].name + ')';
              var valCell = el('span', 'cm6gpt-varsheet-value');
              var rawVal = String(filtered[j].value || '');
              valCell.textContent = rawVal || '(empty)';
              if (isColor(rawVal)) {
                var swatch = el('span', 'cm6gpt-varsheet-swatch');
                swatch.style.backgroundColor = rawVal;
                valCell.insertBefore(swatch, valCell.firstChild);
              }
              row.appendChild(nameCell);
              row.appendChild(valCell);
              table.appendChild(row);
            }
            group.appendChild(table);
          }
          body.appendChild(group);
        }
        count.textContent = totalVisible + ' / ' + vars.length + ' variables';
      }

      renderGroups('');

      body.addEventListener('click', function (e) {
        var toggleBtn = e.target && e.target.closest ? e.target.closest('.cm6gpt-varsheet-group-toggle') : null;
        if (toggleBtn) {
          var pfx = toggleBtn.dataset.prefix;
          expandedGroups[pfx] = !expandedGroups[pfx];
          renderGroups(search.value);
          return;
        }
        var nameNode = e.target && e.target.closest ? e.target.closest('.cm6gpt-varsheet-name') : null;
        if (nameNode && nameNode.dataset.varName) {
          try {
            navigator.clipboard.writeText(nameNode.dataset.varName);
            nameNode.classList.add('is-copied');
            varSheetUiTimeouts.schedule(function () { nameNode.classList.remove('is-copied'); }, 800);
          } catch (err) { _warn('setTimeout', err); }
        }
      });

      var searchTimer = null;
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          renderGroups(search.value);
        }, 120);
      });

      function cleanup() {
        varSheetUiTimeouts.clearAll();
        if (searchTimer) {
          clearTimeout(searchTimer);
          searchTimer = null;
        }
      }

      return {
        root: overlay,
        btnClose: btnClose,
        search: search,
        body: body,
        cleanup: cleanup
      };
    },

    _createPane: function (titleText, metaText, mountId) {
      var pane = el('section', 'cm6gpt-pane');
      var head = el('div', 'cm6gpt-pane-head');
      var title = el('div', 'cm6gpt-pane-title', titleText);
      var meta = el('div', 'cm6gpt-pane-meta', metaText);
      head.appendChild(title);
      head.appendChild(meta);
      pane.appendChild(head);

      var wrap = el('div', 'cm6gpt-editor-wrap');
      var mount = el('div', 'cm6gpt-editor-mount');
      mount.id = mountId;
      wrap.appendChild(mount);
      pane.appendChild(wrap);

      return { pane: pane, head: head, mount: mount, meta: meta };
    },

    _createGateBadge: function () {
      var badge = el('span', 'cm6gpt-gate');
      badge.hidden = true;
      badge.setAttribute('aria-label', 'Apply gate status');
      return badge;
    },

    _createPaneActionButton: function (label) {
      var btn = el('button', 'cm6gpt-pane-btn', label || 'Action');
      btn.type = 'button';
      return btn;
    },

    _createModeGroup: function (items, activeValue, opts) {
      opts = opts || {};
      var datasetKey = String(opts.datasetKey || 'cssViewMode');
      var groupLabel = String(opts.ariaLabel || 'CSS layer mode');
      var buttonAriaLabel = String(opts.buttonAriaLabel || 'mode');
      var groupClassName = String(opts.className || '').trim();
      var buttonClassName = String(opts.buttonClassName || '').trim();
      var root = el('div', 'cm6gpt-modegroup');
      if (groupClassName) root.classList.add.apply(root.classList, groupClassName.split(/\s+/));
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', groupLabel);
      var buttons = [];

      (items || []).forEach(function (item) {
        var btn = el('button', 'cm6gpt-mini-chip');
        if (buttonClassName) btn.classList.add.apply(btn.classList, buttonClassName.split(/\s+/));
        btn.type = 'button';
        btn.title = String(item.tooltip || item.label || '');
        btn.setAttribute('aria-label', String(item.label || item.value || buttonAriaLabel));
        btn.dataset[datasetKey] = String(item.value || '');
        if (item.iconClass) {
          setIcon(btn, String(item.iconClass), String(item.label || item.value || buttonAriaLabel));
        } else {
          btn.textContent = item.label;
        }
        if (String(item.value) === String(activeValue)) btn.classList.add('is-active');
        root.appendChild(btn);
        buttons.push(btn);
      });

      return { root: root, buttons: buttons };
    },

    _createPropertyFilterGroup: function (activeFilter) {
      var root = el('div', 'cm6gpt-modegroup');
      root.classList.add('cm6gpt-filtergroup');
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', 'CSS write target');
      var buttons = [];

      var classBtn = el('button', 'cm6gpt-mini-chip', 'Class');
      classBtn.type = 'button';
      classBtn.dataset.cssPropertyFilter = 'class';
      classBtn.title = 'Edit active class target CSS';
      classBtn.setAttribute('aria-label', 'Edit active class target CSS');
      setIcon(classBtn, 'fas fa-layer-group', 'Edit active class target CSS');
      if (activeFilter && activeFilter.class) classBtn.classList.add('is-active');
      root.appendChild(classBtn);
      buttons.push(classBtn);

      var idBtn = el('button', 'cm6gpt-mini-chip', 'ID');
      idBtn.type = 'button';
      idBtn.dataset.cssPropertyFilter = 'id';
      idBtn.title = 'Edit current element ID CSS';
      idBtn.setAttribute('aria-label', 'Edit current element ID CSS');
      setIcon(idBtn, 'fas fa-hashtag', 'Edit current element ID CSS');
      if (activeFilter && activeFilter.id) idBtn.classList.add('is-active');
      root.appendChild(idBtn);
      buttons.push(idBtn);

      return { root: root, buttons: buttons };
    },

    _createScopeModeGroup: function (activeMode) {
      activeMode = String(activeMode || '').toLowerCase();
      if (activeMode !== 'page') activeMode = 'self';
      var root = el('div', 'cm6gpt-modegroup cm6gpt-scopegroup');
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', 'Scope mode');
      var buttons = [];
      var items = [
        { value: 'self', iconClass: 'fas fa-crosshairs', label: 'Self scope' },
        { value: 'page', iconClass: 'fas fa-globe', label: 'Page scope (read-only)' }
      ];
      items.forEach(function (item) {
        var btn = el('button', 'cm6gpt-mini-chip');
        btn.type = 'button';
        btn.dataset.scopeMode = String(item.value);
        btn.title = String(item.label || item.value || 'scope');
        btn.setAttribute('aria-label', String(item.label || item.value || 'scope'));
        setIcon(btn, String(item.iconClass || ''), String(item.label || item.value || 'scope'));
        if (String(item.value) === activeMode) btn.classList.add('is-active');
        root.appendChild(btn);
        buttons.push(btn);
      });
      return { root: root, buttons: buttons };
    },

    _requestLayoutSync: function (root, forceDirect) {
      if (!root) return;
      if (!forceDirect && typeof root.__cm6gptLayoutSync === 'function') {
        try { root.__cm6gptLayoutSync(); } catch (e) { _warn('_requestLayoutSync', e); }
        return;
      }

      var hidden = root.classList && root.classList.contains('cm6gpt-hidden');
      var rect = root.getBoundingClientRect ? root.getBoundingClientRect() : { height: 0 };
      var computed = null;
      var bottom = 0;
      try { computed = w.getComputedStyle(root); } catch (e1) { computed = null; }
      if (computed && computed.bottom) {
        bottom = parseFloat(computed.bottom) || 0;
      }
      var effectiveHeight = hidden ? 0 : Math.max(0, Math.round((rect && rect.height) || 0));
      var previewPad = hidden ? 0 : Math.max(0, effectiveHeight + Math.max(0, Math.round(bottom)));
      if (!hidden && root.classList && root.classList.contains('cm6gpt-dock-flush')) {
        previewPad = Math.max(0, effectiveHeight + Math.max(0, Math.round(bottom)));
      }
      try { document.documentElement.style.setProperty('--cm6gpt-panel-height', effectiveHeight + 'px'); } catch (e2) { _warn('_requestLayoutSync', e2); }
      try { document.documentElement.style.setProperty('--cm6gpt-preview-padding-bottom', previewPad + 'px'); } catch (e3) { _warn('_requestLayoutSync', e3); }
      // Detect Bricks sidebar panel widths (left: elements, right: structure)
      try {
        var structurePanel = document.getElementById('bricks-structure');
        var structureWidth = 0;
        if (structurePanel) {
          var structureRect = structurePanel.getBoundingClientRect();
          if (structureRect && structureRect.width > 0) {
            var structureStyle = w.getComputedStyle(structurePanel);
            var structureHidden = structureStyle && (structureStyle.display === 'none' || structureStyle.visibility === 'hidden');
            if (!structureHidden) structureWidth = Math.round(structureRect.width);
          }
        }
        document.documentElement.style.setProperty('--cm6gpt-structure-panel-width', structureWidth + 'px');
      } catch (e4) { _warn('_requestLayoutSync', e4); }
      try {
        var elementsPanel = document.getElementById('bricks-panel-inner');
        var elementsWidth = 0;
        if (elementsPanel) {
          var elementsRect = elementsPanel.getBoundingClientRect();
          if (elementsRect && elementsRect.width > 0) {
            var elementsStyle = w.getComputedStyle(elementsPanel);
            var elementsHidden = elementsStyle && (elementsStyle.display === 'none' || elementsStyle.visibility === 'hidden');
            if (!elementsHidden) elementsWidth = Math.round(elementsRect.width);
          }
        }
        document.documentElement.style.setProperty('--cm6gpt-elements-panel-width', elementsWidth + 'px');
      } catch (e5) { _warn('_requestLayoutSync', e5); }
    },

    _installLayoutSync: function (root) {
      if (!root || root.__cm6gptLayoutSyncInstalled) return;
      root.__cm6gptLayoutSyncInstalled = true;
      var self = this;
      var layoutSyncFrame = createManagedAnimationFrame(w);
      var intervalId = 0;
      var ro = null;
      var runtimeActive = false;
      var warmupTimeoutIds = [];

      function getDockRect() {
        var preview = document.getElementById('bricks-preview');
        if (!preview || !preview.getBoundingClientRect) return null;
        var rect = preview.getBoundingClientRect();
        if (!rect) return null;
        if (rect.width < 260 || rect.height < 140) return null;
        return rect;
      }

      function syncNow() {
        if (!root || !root.isConnected) return;

        var isFull = root.classList && root.classList.contains('cm6gpt-dock-full');
        var isFlush = root.classList && root.classList.contains('cm6gpt-dock-flush');

        // Propagate dock-full state to <html> so CSS can conditionally shrink sidebars
        // only when panel is full-width (overlapping them), not when centered
        try {
          if (isFull) {
            document.documentElement.classList.add('cm6gpt-dock-full');
          } else {
            document.documentElement.classList.remove('cm6gpt-dock-full');
          }
        } catch (eDock) { _warn('syncNow', eDock); }

        var dockRect = getDockRect();
        if (isFull) {
          root.style.left = '0px';
          root.style.right = '0px';
        } else if (dockRect) {
          var gutter = isFlush ? 0 : 8;
          var left = Math.max(0, Math.round(dockRect.left) + gutter);
          var right = Math.max(0, Math.round(window.innerWidth - dockRect.right) + gutter);
          // Ensure panel never underlaps Bricks sidebars
          var elW = parseInt(document.documentElement.style.getPropertyValue('--cm6gpt-elements-panel-width'), 10) || 0;
          var stW = parseInt(document.documentElement.style.getPropertyValue('--cm6gpt-structure-panel-width'), 10) || 0;
          if (elW > 0) left = Math.max(left, elW);
          if (stW > 0) right = Math.max(right, stW);
          root.style.left = left + 'px';
          root.style.right = right + 'px';
        } else {
          root.style.left = '0px';
          root.style.right = '0px';
        }

        self._requestLayoutSync(root);
      }

      function clearWarmupTimeouts() {
        while (warmupTimeoutIds.length) {
          clearTimeout(warmupTimeoutIds.pop());
        }
      }

      function cancelPendingSync() {
        layoutSyncFrame.clear();
      }

      function scheduleWarmupSync(delayMs) {
        var timeoutId = setTimeout(function () {
          var idx = warmupTimeoutIds.indexOf(timeoutId);
          if (idx !== -1) warmupTimeoutIds.splice(idx, 1);
          requestSync();
        }, delayMs);
        warmupTimeoutIds.push(timeoutId);
      }

      function stopRuntime() {
        cancelPendingSync();
        clearWarmupTimeouts();
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = 0;
        }
        try { w.removeEventListener('resize', requestSync); } catch (e0) {}
        try { w.removeEventListener('orientationchange', requestSync); } catch (e1) {}
        try { document.removeEventListener('transitionend', requestSync, true); } catch (e2) {}
        if (ro && typeof ro.disconnect === 'function') {
          try { ro.disconnect(); } catch (e3) { _warn('stopRuntime', e3); }
        }
        ro = null;
        runtimeActive = false;
      }

      function resetDetachedLayoutState() {
        try { document.documentElement.classList.remove('cm6gpt-panel-open'); } catch (e0) { _warn('resetDetachedLayoutState', e0); }
        try { document.documentElement.classList.remove('cm6gpt-dock-full'); } catch (e1) { _warn('resetDetachedLayoutState', e1); }
        try { document.documentElement.style.setProperty('--cm6gpt-panel-height', '0px'); } catch (e2) { _warn('resetDetachedLayoutState', e2); }
        try { document.documentElement.style.setProperty('--cm6gpt-preview-padding-bottom', '0px'); } catch (e3) { _warn('resetDetachedLayoutState', e3); }
        try { document.documentElement.style.setProperty('--cm6gpt-structure-panel-width', '0px'); } catch (e4) { _warn('resetDetachedLayoutState', e4); }
        try { document.documentElement.style.setProperty('--cm6gpt-elements-panel-width', '0px'); } catch (e5) { _warn('resetDetachedLayoutState', e5); }
      }

      function startRuntime() {
        if (runtimeActive || !root || !root.isConnected) return;
        if (root.classList && root.classList.contains('cm6gpt-hidden')) return;
        runtimeActive = true;

        if (w.ResizeObserver) {
          try {
            ro = new ResizeObserver(function () {
              requestSync();
            });
            ro.observe(root);
            var preview = document.getElementById('bricks-preview');
            if (preview) ro.observe(preview);
          } catch (eRo) {
            ro = null;
          }
        }

        try { w.addEventListener('resize', requestSync, { passive: true }); } catch (e4) { w.addEventListener('resize', requestSync); }
        try { w.addEventListener('orientationchange', requestSync, { passive: true }); } catch (e5) { w.addEventListener('orientationchange', requestSync); }
        document.addEventListener('transitionend', requestSync, true);

        intervalId = setInterval(requestSync, 900);
        scheduleWarmupSync(120);
        scheduleWarmupSync(360);
        scheduleWarmupSync(900);
      }

      function scheduleSync() {
        layoutSyncFrame.schedule(syncNow);
      }

      function requestSync() {
        if (!root || !root.isConnected) {
          stopRuntime();
          resetDetachedLayoutState();
          return;
        }
        if (root.classList && root.classList.contains('cm6gpt-hidden')) {
          stopRuntime();
          self._requestLayoutSync(root, true);
          return;
        }
        if (!runtimeActive) startRuntime();
        scheduleSync();
      }

      root.__cm6gptStartLayoutSync = function () {
        if (!root || !root.isConnected) return;
        if (root.classList && root.classList.contains('cm6gpt-hidden')) {
          self._requestLayoutSync(root);
          return;
        }
        if (!runtimeActive) startRuntime();
        scheduleSync();
      };

      root.__cm6gptStopLayoutSync = function () {
        stopRuntime();
        self._requestLayoutSync(root, true);
      };

      root.__cm6gptLayoutSync = requestSync;
      requestSync();
    },

    _wireResize: function (root, handle) {
      if (handle && typeof handle.__cm6gptResizeCleanup === 'function') {
        try { handle.__cm6gptResizeCleanup(); } catch (eCleanup) { _warn('_wireResize', eCleanup); }
      }

      var dragging = false;
      var startY = 0;
      var startH = 0;
      var dragShield = null;
      var hasPointerEvents = !!(w && w.PointerEvent);
      var activePointerId = null;
      var refreshFrame = createManagedAnimationFrame(w);
      var teardownFns = [];

      function trackListener(target, type, handler, options) {
        return getBridgeRuntimeUtils().trackListener(teardownFns, target, type, handler, options);
      }

      function ensureDragShield() {
        if (dragShield && dragShield.isConnected) return dragShield;
        dragShield = document.getElementById('cm6gpt-drag-shield');
        if (!dragShield) {
          dragShield = el('div', '');
          dragShield.id = 'cm6gpt-drag-shield';
          dragShield.setAttribute('aria-hidden', 'true');
          document.body.appendChild(dragShield);
        }
        return dragShield;
      }

      function requestEditorsRefresh() {
        refreshFrame.schedule(function () {
          if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
            ns.editors.refreshMountedEditors();
          }
        });
      }

      function cleanupResizeBindings() {
        stop();
        layoutSyncFrame.clear();
        refreshFrame.clear();
        getBridgeRuntimeUtils().drainCleanupQueue(teardownFns, function (eTeardown) {
          _warn('_wireResize', eTeardown);
        });
        if (handle && handle.__cm6gptResizeCleanup === cleanupResizeBindings) {
          handle.__cm6gptResizeCleanup = null;
        }
      }

      function begin(y) {
        dragging = true;
        startY = Number(y) || 0;
        startH = root.getBoundingClientRect().height;
        ensureDragShield();
        document.body.classList.add('cm6gpt-resizing');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
      }

      function stop() {
        if (!dragging) return;
        dragging = false;
        activePointerId = null;
        // Cancel any pending throttled sync so the final sync below is authoritative
        layoutSyncFrame.clear();
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('cm6gpt-resizing');
        // Final layout sync after drag ends — sidebars recalc once, cleanly
        if (typeof root.__cm6gptLayoutSync === 'function') {
          try { root.__cm6gptLayoutSync(); } catch (e) { _warn('stop', e); }
        }
        requestEditorsRefresh();
      }

      var layoutSyncFrame = createManagedAnimationFrame(w);
      function moveTo(clientY) {
        if (!dragging) return;
        var y = Number(clientY);
        if (!isFinite(y)) return;
        var delta = startY - y;
        var next = Math.max(180, Math.min(Math.round(window.innerHeight * 0.82), startH + delta));
        root.style.height = next + 'px';
        if (!root.classList.contains('cm6gpt-hidden')) {
          document.documentElement.classList.add('cm6gpt-panel-open');
        }
        // Throttle layout sync to 1 per animation frame during drag
        // to avoid sidebar height recalc on every pixel
        layoutSyncFrame.schedule(function () {
          if (typeof root.__cm6gptLayoutSync === 'function') {
            try { root.__cm6gptLayoutSync(); } catch (e0) { _warn('moveTo', e0); }
          }
        });
        requestEditorsRefresh();
      }

      function moveMouse(e) {
        if (!dragging) return;
        moveTo(e && typeof e.clientY === 'number' ? e.clientY : NaN);
      }

      function moveTouch(e) {
        if (!dragging) return;
        var t = e && e.touches && e.touches[0] ? e.touches[0] : null;
        moveTo(t ? t.clientY : NaN);
        if (e && e.cancelable && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }

      function movePointer(e) {
        if (!dragging) return;
        if (activePointerId != null && e && e.pointerId !== activePointerId) return;
        moveTo(e && typeof e.clientY === 'number' ? e.clientY : NaN);
        if (e && e.cancelable && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }

      function startMouse(e) {
        if (dragging) return;
        if (e && typeof e.button === 'number' && e.button !== 0) return;
        begin(e && typeof e.clientY === 'number' ? e.clientY : NaN);
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
      }

      function startTouch(e) {
        if (dragging) return;
        var t = e && e.touches && e.touches[0] ? e.touches[0] : null;
        if (!t) return;
        begin(t.clientY);
        if (e && e.cancelable && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }

      function startPointer(e) {
        if (!hasPointerEvents) return;
        if (e && typeof e.isPrimary === 'boolean' && !e.isPrimary) return;
        if (e && typeof e.button === 'number' && e.button !== 0) return;
        activePointerId = e ? e.pointerId : null;
        begin(e && typeof e.clientY === 'number' ? e.clientY : NaN);
        try {
          if (handle && handle.setPointerCapture && activePointerId != null) {
            handle.setPointerCapture(activePointerId);
          }
        } catch (eCap) { _warn('startPointer', eCap); }
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
      }

      try { handle.style.touchAction = 'none'; } catch (eStyle) { _warn('startPointer', eStyle); }

      trackListener(handle, 'mousedown', startMouse);
      trackListener(handle, 'touchstart', startTouch, { passive: false });
      trackListener(handle, 'pointerdown', startPointer);

      if (hasPointerEvents) {
        trackListener(handle, 'pointermove', movePointer);
        trackListener(handle, 'pointerup', function (e) {
          if (activePointerId != null && e && e.pointerId !== activePointerId) return;
          stop();
        });
        trackListener(handle, 'pointercancel', function (e) {
          if (activePointerId != null && e && e.pointerId !== activePointerId) return;
          stop();
        });
        trackListener(handle, 'lostpointercapture', function (e) {
          if (activePointerId != null && e && e.pointerId !== activePointerId) return;
          stop();
        });
        trackListener(document, 'pointermove', movePointer);
        trackListener(document, 'pointerup', stop);
        trackListener(document, 'pointercancel', stop);
        var pointerShield = ensureDragShield();
        trackListener(pointerShield, 'pointermove', movePointer);
        trackListener(pointerShield, 'pointerup', stop);
        trackListener(pointerShield, 'pointercancel', stop);
      }
      trackListener(document, 'mousemove', moveMouse);
      trackListener(document, 'mouseup', stop);
      trackListener(document, 'touchmove', moveTouch, { passive: false });
      trackListener(document, 'touchend', stop);
      trackListener(document, 'touchcancel', stop);
      var shield = ensureDragShield();
      trackListener(shield, 'mousemove', moveMouse);
      trackListener(shield, 'mouseup', stop);
      trackListener(shield, 'touchmove', moveTouch, { passive: false });
      trackListener(shield, 'touchend', stop);
      trackListener(shield, 'touchcancel', stop);
      trackListener(window, 'blur', stop);

      handle.__cm6gptResizeCleanup = cleanupResizeBindings;
    },

    _apiFromExisting: function (root) {
      return {
        root: root,
        htmlMount: root.querySelector('#cm6gpt-html-editor'),
        cssMount: root.querySelector('#cm6gpt-css-editor'),
        setStatus: function (text) {
          var n = root.querySelector('.cm6gpt-status-main');
          if (n) n.textContent = String(text || '');
        },
        setSelectionInfo: function (text) {
          var n = root.querySelector('.cm6gpt-status-side');
          if (n) n.textContent = String(text || '');
        },
        flashAction: function () {},
        setPaneMeta: function () {},
        setCssInfo: function () {},
        setPaneGate: function () {},
        setHtmlApplyState: function () {},
        setCssApplyState: function () {},
        setCssClassAddState: function () {},
        setCssPropertyFilter: function () {},
        bindRecipeManager: function () {},
        openRecipeManager: function () { return false; },
        closeRecipeManager: function () {},
        isRecipeManagerOpen: function () { return false; },
        onRefresh: function () {},
        onClose: function () {},
        onScopeModeChange: function () {},
        onLayerModeChange: function () {},
        onHtmlLensModeChange: function () {},
        onCssLensModeChange: function () {},
        onCssPropertyFilterChange: function () {},
        onCssContextTargetSelect: function () {},
        onCssApply: function () {},
        onCssClassAdd: function () {},
        onUndo: function () {},
        onRedo: function () {},
        onHtmlCopy: function () {},
        onCssCopy: function () {},
        getScopeMode: function () { return 'self'; },
        setScopeMode: function () {},
        getLayerMode: function () { return 'l2'; },
        setLayerMode: function () {},
        getHtmlLensMode: function () { return 'minimal'; },
        setHtmlLensMode: function () {},
        getCssLensMode: function () { return 'minimal'; },
        setCssLensMode: function () {},
        getCssPropertyFilter: function () { return { class: true, id: false }; },
        setUndoRedoState: function () {},
        isSoftWrapEnabled: function () { return !!(root.classList && root.classList.contains('cm6gpt-wrap-on')); },
        show: function () {
          root.classList.remove('cm6gpt-hidden');
          document.documentElement.classList.add('cm6gpt-panel-open');
          var launcher = document.getElementById('cm6gpt-launcher');
          if (launcher && launcher.classList) launcher.classList.add('cm6gpt-hidden');
          if (typeof root.__cm6gptLayoutSync === 'function') {
            try { root.__cm6gptLayoutSync(); } catch (e) { _warn('show', e); }
          }
        },
        refreshEditors: function () {
          if (ns.editors && typeof ns.editors.refreshMountedEditors === 'function') {
            ns.editors.refreshMountedEditors();
          }
        },
        destroy: function () {
          if (typeof root.__cm6gptPanelCleanup === 'function') {
            try { root.__cm6gptPanelCleanup(); } catch (e) { _warn('_apiFromExisting.destroy', e); }
          }
        }
      };
    }
  };

  ns.panelInternals = ns.panelInternals || {};
  ns.panelInternals.createManagedTimeoutRegistry = createManagedTimeoutRegistry;
  ns.panelInternals.createRecipeHoverPreviewRuntime = createRecipeHoverPreviewRuntime;
  ns.panel = Panel;
})(window);
