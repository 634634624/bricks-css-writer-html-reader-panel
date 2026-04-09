(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});

  function now() { return Date.now ? Date.now() : +new Date(); }

  function debounce(fn, ms) {
    var t = null;
    function clear() {
      if (!t) return false;
      clearTimeout(t);
      t = null;
      return true;
    }
    function debounced() {
      var args = arguments;
      clear();
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
    debounced.cancel = clear;
    debounced.pending = function () { return !!t; };
    return debounced;
  }

  function getBridgeRuntimeUtils() {
    if (
      !ns.BridgeRuntimeUtils
      || typeof ns.BridgeRuntimeUtils.removeValueFromArray !== 'function'
      || typeof ns.BridgeRuntimeUtils.removeDomNode !== 'function'
    ) {
      throw new Error('CM6GPT.BridgeRuntimeUtils DOM/array helpers missing');
    }
    return ns.BridgeRuntimeUtils;
  }

  function removeValueFromArray(list, value) {
    return getBridgeRuntimeUtils().removeValueFromArray(list, value);
  }

  function removeDomNode(node) {
    return getBridgeRuntimeUtils().removeDomNode(node, _warn);
  }

  function safeGet(valueFn, fallback) {
    try {
      var out = valueFn();
      return typeof out === 'undefined' ? fallback : out;
    } catch (e) {
      return fallback;
    }
  }

  var isObject = ns.isObject || function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var hasOwn = ns.hasOwn || function (obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); };

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][bricks-api]', context, err); } catch (_) { /* noop */ }
  }

  // Phase-1 internal decomposition: keep the public BricksAPI facade stable, but
  // group lower-coupled slices behind explicit installer modules inside the same
  // asset until the build pipeline can safely split them into standalone files.
  var runtimeModule = (ns.BricksApiRuntimeModule = ns.BricksApiRuntimeModule || {});
  var discoveryModule = (ns.BricksApiDiscoveryModule = ns.BricksApiDiscoveryModule || {});
  var previewModule = (ns.BricksApiPreviewModule = ns.BricksApiPreviewModule || {});

  function deepValueEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    var aObj = typeof a === 'object';
    var bObj = typeof b === 'object';
    if (aObj !== bObj) return false;
    if (!aObj) return String(a) === String(b);
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
      return false;
    }
  }

  function escapeRegExp(s) {
    return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function deepCloneBestEffort(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var structuredCloneError = null;
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(obj);
      }
    } catch (e) { structuredCloneError = e; }
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e2) { /* fall through to shallow clone */ }
    try {
      var clone = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
      if (obj.settings && typeof obj.settings === 'object') {
        clone.settings = Array.isArray(obj.settings) ? obj.settings.slice() : Object.assign({}, obj.settings);
      }
      return clone;
    } catch (e3) {
      if (structuredCloneError) _warn("deepCloneBestEffort", structuredCloneError);
      _warn("deepCloneBestEffort", e3);
    }
    return obj;
  }

  function patchObjectShallow(target, source) {
    if (!target || !source || typeof target !== 'object' || typeof source !== 'object') return false;
    var changed = false;
    Object.keys(source).forEach(function (k) {
      if (k === 'settings') return;
      var nextVal = source[k];
      if (target[k] !== nextVal) {
        target[k] = nextVal;
        changed = true;
      }
    });
    return changed;
  }

  function normalizeClassNameLike(value) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    s = s.replace(/^\.+/, '');
    s = s.replace(/[:\s].*$/, '');
    return s.trim();
  }

  function addClassSafe(node, className) {
    if (!node || !className) return false;
    if (node.classList && typeof node.classList.add === 'function') {
      try { node.classList.add(className); return true; } catch (e0) { _warn("addClassSafe", e0); }
    }
    if (typeof node.getAttribute === 'function' && typeof node.setAttribute === 'function') {
      try {
        var raw = String(node.getAttribute('class') || '').trim();
        var tokens = raw ? raw.split(/\s+/).filter(Boolean) : [];
        if (tokens.indexOf(className) === -1) tokens.push(className);
        node.setAttribute('class', tokens.join(' ').trim());
        return true;
      } catch (e1) { _warn("addClassSafe", e1); }
    }
    return false;
  }

  function removeClassSafe(node, className) {
    if (!node || !className) return false;
    if (node.classList && typeof node.classList.remove === 'function') {
      try { node.classList.remove(className); return true; } catch (e0) { _warn("removeClassSafe", e0); }
    }
    if (typeof node.getAttribute === 'function' && typeof node.setAttribute === 'function') {
      try {
        var raw = String(node.getAttribute('class') || '').trim();
        var tokens = raw ? raw.split(/\s+/).filter(Boolean) : [];
        var next = tokens.filter(function (token) { return token !== className; });
        node.setAttribute('class', next.join(' ').trim());
        return true;
      } catch (e1) { _warn("removeClassSafe", e1); }
    }
    return false;
  }

  function splitCssSelectorList(value) {
    var source = String(value == null ? '' : value);
    if (!source) return [];
    var out = [];
    var chunk = '';
    var parenDepth = 0;
    var bracketDepth = 0;
    for (var i = 0; i < source.length; i++) {
      var ch = source.charAt(i);
      if (ch === '(') parenDepth++;
      else if (ch === ')' && parenDepth > 0) parenDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']' && bracketDepth > 0) bracketDepth--;

      if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
        var token = chunk.trim();
        if (token) out.push(token);
        chunk = '';
        continue;
      }
      chunk += ch;
    }
    var tail = chunk.trim();
    if (tail) out.push(tail);
    return out;
  }

  function pushUniqueSelector(out, selector) {
    selector = String(selector || '').trim();
    if (!selector) return;
    if (out.indexOf(selector) === -1) out.push(selector);
  }

  function buildScopedSelectorVariants(selector, targetSelector, targetAttrSelector) {
    selector = String(selector || '').trim();
    targetSelector = String(targetSelector || '').trim();
    targetAttrSelector = String(targetAttrSelector || '').trim();
    if (!selector || !targetSelector) return [];

    var out = [];
    var startsCombinator = /^[>+~]/.test(selector);
    var startsPseudoElement = /^::/.test(selector);
    var startsPseudo = /^:[^:]/.test(selector);
    var startsSimpleClassLike = /^[.#\[]/.test(selector);
    var hasCombinator = /[\s>+~]/.test(selector);

    if (startsPseudoElement) {
      pushUniqueSelector(out, targetSelector + selector);
      return out;
    }

    if (startsCombinator) {
      pushUniqueSelector(out, targetSelector + ' ' + selector);
      return out;
    }

    pushUniqueSelector(out, targetSelector + ' ' + selector);

    if (startsPseudo || startsSimpleClassLike) {
      pushUniqueSelector(out, targetSelector + selector);
      return out;
    }

    if (!hasCombinator && targetAttrSelector) {
      pushUniqueSelector(out, selector + targetAttrSelector);
    }
    return out;
  }

  function parseSingleTopLevelAtRuleBlock(source) {
    source = String(source == null ? '' : source).trim();
    if (!source || source.charAt(0) !== '@') return null;

    var openIndex = -1;
    for (var i = 0; i < source.length; i++) {
      if (source.charAt(i) === '{') {
        openIndex = i;
        break;
      }
    }
    if (openIndex < 0) return null;

    var depth = 0;
    var closeIndex = -1;
    for (i = openIndex; i < source.length; i++) {
      var ch = source.charAt(i);
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          closeIndex = i;
          break;
        }
      }
    }
    if (closeIndex < 0 || depth !== 0) return null;

    var prelude = source.slice(0, openIndex).trim();
    var body = source.slice(openIndex + 1, closeIndex).trim();
    var tail = source.slice(closeIndex + 1).trim();
    if (!prelude || !body || tail) return null;

    return {
      prelude: prelude,
      body: body
    };
  }

  // Mirrors the proven CSS->Bricks state map from the original QuantumCSS sync engine.
  // Used for writing native structured Bricks settings from editable _cssCustom deltas.
  var CSS_TO_BRICKS_SETTINGS_PATH = {
    'font-size': '_typography.font-size',
    'font-weight': '_typography.font-weight',
    'font-style': '_typography.font-style',
    'font-family': '_typography.font-family',
    'line-height': '_typography.line-height',
    'letter-spacing': '_typography.letter-spacing',
    'text-align': '_typography.text-align',
    'text-transform': '_typography.text-transform',
    'text-decoration': '_typography.text-decoration',
    'word-spacing': '_typography.word-spacing',
    'color': '_typography.color',
    'padding-top': '_padding.top',
    'padding-right': '_padding.right',
    'padding-bottom': '_padding.bottom',
    'padding-left': '_padding.left',
    'margin-top': '_margin.top',
    'margin-right': '_margin.right',
    'margin-bottom': '_margin.bottom',
    'margin-left': '_margin.left',
    'width': '_width',
    'height': '_height',
    'min-width': '_widthMin',
    'max-width': '_widthMax',
    'min-height': '_heightMin',
    'max-height': '_heightMax',
    'background-color': '_background.color',
    'background-image': '_background.image',
    'background-size': '_background.size',
    'background-position': '_background.position',
    'background-repeat': '_background.repeat',
    'background-attachment': '_background.attachment',
    'background-blend-mode': '_background.blendMode',
    'border-style': '_border.style',
    'border-color': '_border.color',
    'border-top-width': '_border.width.top',
    'border-right-width': '_border.width.right',
    'border-bottom-width': '_border.width.bottom',
    'border-left-width': '_border.width.left',
    'border-top-left-radius': '_border.radius.top',
    'border-top-right-radius': '_border.radius.right',
    'border-bottom-right-radius': '_border.radius.bottom',
    'border-bottom-left-radius': '_border.radius.left',
    'display': '_display',
    'flex-direction': '_direction',
    'flex-wrap': '_flexWrap',
    'align-items': '_alignItems',
    'justify-content': '_justifyContent',
    'align-self': '_alignSelf',
    'flex-grow': '_flexGrow',
    'flex-shrink': '_flexShrink',
    'order': '_order',
    'gap': '_gap',
    'row-gap': '_rowGap',
    'column-gap': '_columnGap',
    'grid-template-columns': '_gridTemplateColumns',
    'grid-template-rows': '_gridTemplateRows',
    'grid-auto-columns': '_gridAutoColumns',
    'grid-auto-rows': '_gridAutoRows',
    'grid-auto-flow': '_gridAutoFlow',
    'grid-gap': '_gridGap',
    'grid-column': '_gridItemColumnSpan',
    'grid-row': '_gridItemRowSpan',
    'position': '_position',
    'top': '_positionTop',
    'right': '_positionRight',
    'bottom': '_positionBottom',
    'left': '_positionLeft',
    'z-index': '_zIndex',
    'opacity': '_opacity',
    'overflow': '_overflow',
    'object-fit': '_objectFit',
    'aspect-ratio': '_aspectRatio',
    'visibility': '_visibility',
    'cursor': '_cursor',
    'pointer-events': '_pointerEvents',
    'white-space': '_whiteSpace',
    'transition': '_cssTransition',
    'transition-duration': 'transitionDuration',
    'transition-timing-function': 'transitionTimingFunction',
    'filter': '_cssFilters',
    'fill': 'fill',
    'stroke': 'stroke',
    'stroke-width': 'strokeWidth',
    '--brx-icon-transform': 'accordionTitleIconTransform',
    '--brxe-toggle-bar-radius': 'barRadius',
    '--brxe-toggle-scale': 'barScale',
    'resize': 'fieldResize',
    'margin-inline-start': 'suffixSpacing',
    'margin-inline-end': 'prefixSpacing',
    'box-shadow': '_boxShadow',
    'text-shadow': '_textShadow',
    'transform': '_transform',
    'container-type': '_containerType',
    'container-name': '_containerName',
    'overflow-x': '_overflowX',
    'overflow-y': '_overflowY',
    'scroll-behavior': '_scrollBehavior',
    'scroll-snap-type': '_scrollSnapType',
    'scroll-snap-align': '_scrollSnapAlign',
    'overscroll-behavior': '_overscrollBehavior',
    'text-overflow': '_textOverflow',
    'word-break': '_wordBreak',
    'overflow-wrap': '_overflowWrap',
    'hyphens': '_hyphens',
    'writing-mode': '_writingMode',
    'text-indent': '_textIndent',
    'vertical-align': '_verticalAlign',
    'transform-origin': '_transformOrigin',
    'animation': '_cssAnimation',
    'animation-name': '_animationName',
    'animation-duration': '_animationDuration',
    'animation-delay': '_animationDelay',
    'animation-timing-function': '_animationTimingFunction',
    'mix-blend-mode': '_mixBlendMode',
    'isolation': '_isolation',
    'backdrop-filter': '_backdropFilter',
    'clip-path': '_clipPath',
    'mask-image': '_maskImage',
    'outline': '_outline',
    'outline-offset': '_outlineOffset',
    'list-style': '_listStyle',
    'list-style-type': '_listStyleType',
    'table-layout': '_tableLayout',
    'border-collapse': '_borderCollapse',
    'user-select': '_userSelect',
    'touch-action': '_touchAction',
    'will-change': '_willChange',
    'content-visibility': '_contentVisibility'
  };

  // Prefer generated external mapping when available to keep CM6GPT in sync
  // with the curated mapping-source/mapping-output pipeline.
  var externalCssToBricksMap = safeGet(function () {
    return w.CM6GPT_CSS_TO_BRICKS_SETTINGS_PATH;
  }, null);
  if (externalCssToBricksMap && isObject(externalCssToBricksMap) && !Array.isArray(externalCssToBricksMap)) {
    var externalKeys = Object.keys(externalCssToBricksMap);
    if (externalKeys.length) {
      CSS_TO_BRICKS_SETTINGS_PATH = Object.assign({}, externalCssToBricksMap);
    }
  }

  function ensureMappedCssAlias(aliasProp, canonicalProp) {
    aliasProp = String(aliasProp || '').trim().toLowerCase();
    canonicalProp = String(canonicalProp || '').trim().toLowerCase();
    if (!aliasProp || !canonicalProp) return;
    if (hasOwn(CSS_TO_BRICKS_SETTINGS_PATH, aliasProp)) return;
    if (!hasOwn(CSS_TO_BRICKS_SETTINGS_PATH, canonicalProp)) return;
    var mappedPath = String(CSS_TO_BRICKS_SETTINGS_PATH[canonicalProp] || '').trim();
    if (!mappedPath) return;
    CSS_TO_BRICKS_SETTINGS_PATH[aliasProp] = mappedPath;
  }

  // Defensive aliases: users frequently type these variants in Write mode.
  ensureMappedCssAlias('font-color', 'color');
  ensureMappedCssAlias('font-colour', 'color');
  ensureMappedCssAlias('text-color', 'color');
  ensureMappedCssAlias('text-colour', 'color');
  ensureMappedCssAlias('border-top-color', 'border-color');
  ensureMappedCssAlias('border-right-color', 'border-color');
  ensureMappedCssAlias('border-bottom-color', 'border-color');
  ensureMappedCssAlias('border-left-color', 'border-color');
  if (!hasOwn(CSS_TO_BRICKS_SETTINGS_PATH, 'background-image')) {
    CSS_TO_BRICKS_SETTINGS_PATH['background-image'] = '_background.image';
  }

  var HTML_SYNC_TEXT_ELEMENTS = {
    heading: true,
    'text-basic': true,
    text: true,
    button: true,
    'text-link': true,
    icon: true,
    'post-title': true,
    'post-excerpt': true,
    'post-content': true
  };

  var HTML_SYNC_TAG_TO_BRICKS = {
    div: { name: 'div', label: 'Div' },
    section: { name: 'section', label: 'Section' },
    header: { name: 'div', label: 'Header' },
    footer: { name: 'div', label: 'Footer' },
    main: { name: 'div', label: 'Main' },
    article: { name: 'div', label: 'Article' },
    aside: { name: 'div', label: 'Aside' },
    nav: { name: 'div', label: 'Nav' },
    ul: { name: 'div', label: 'List' },
    ol: { name: 'div', label: 'List' },
    li: { name: 'div', label: 'List Item' },
    h1: { name: 'heading', label: 'Heading' },
    h2: { name: 'heading', label: 'Heading' },
    h3: { name: 'heading', label: 'Heading' },
    h4: { name: 'heading', label: 'Heading' },
    h5: { name: 'heading', label: 'Heading' },
    h6: { name: 'heading', label: 'Heading' },
    p: { name: 'text-basic', label: 'Text' },
    span: { name: 'div', label: 'Span' },
    a: { name: 'text-link', label: 'Link' },
    img: { name: 'image', label: 'Image' },
    button: { name: 'button', label: 'Button' },
    form: { name: 'div', label: 'Form' },
    details: { name: 'div', label: 'Details' },
    summary: { name: 'text-basic', label: 'Summary' },
    fieldset: { name: 'div', label: 'Fieldset' },
    legend: { name: 'text-basic', label: 'Legend' },
    label: { name: 'text-basic', label: 'Label' },
    input: { name: 'div', label: 'Input' },
    textarea: { name: 'div', label: 'Textarea' },
    select: { name: 'div', label: 'Select' },
    option: { name: 'text-basic', label: 'Option' },
    video: { name: 'video', label: 'Video' },
    figure: { name: 'div', label: 'Figure' },
    figcaption: { name: 'text-basic', label: 'Caption' },
    blockquote: { name: 'div', label: 'Blockquote' },
    table: { name: 'div', label: 'Table' },
    thead: { name: 'div', label: 'Table Head' },
    tbody: { name: 'div', label: 'Table Body' },
    tfoot: { name: 'div', label: 'Table Foot' },
    tr: { name: 'div', label: 'Table Row' },
    td: { name: 'div', label: 'Table Cell' },
    th: { name: 'div', label: 'Table Header Cell' },
    template: { name: 'div', label: 'Template' },
    slot: { name: 'div', label: 'Slot' }
  };

  var HTML_SYNC_SEMANTIC_DIV_TAGS = {
    div: true,
    section: true,
    header: true,
    footer: true,
    main: true,
    article: true,
    aside: true,
    nav: true,
    ul: true,
    ol: true,
    li: true,
    form: true,
    details: true,
    fieldset: true,
    figure: true,
    blockquote: true,
    table: true,
    thead: true,
    tbody: true,
    tfoot: true,
    tr: true,
    td: true,
    th: true,
    template: true,
    slot: true,
    span: true
  };

  // Inverse index (path -> css property) for settings -> declaration serialization.
  // First-wins preserves deterministic output order aligned with CSS_TO_BRICKS_SETTINGS_PATH.
  // Some generated maps contain duplicate paths for alias/logical variants; prefer
  // stable canonical keys when serializing mapped settings back to editable CSS.
  var CANONICAL_READBACK_CSS_PROPERTY_BY_PATH = {
    '_border.style': 'border-style',
    '_border.color': 'border-color',
    '_margin.top': 'margin-top',
    '_margin.bottom': 'margin-bottom',
    '_padding.left': 'padding-left',
    '_padding.right': 'padding-right'
  };
  var BRICKS_SETTINGS_PATH_TO_CSS_PROPERTY = {};
  var BRICKS_SETTINGS_MAPPED_PATH_ORDER = [];
  (function buildCssMappingInverse() {
    var cssProps = Object.keys(CSS_TO_BRICKS_SETTINGS_PATH || {});
    for (var i = 0; i < cssProps.length; i++) {
      var prop = String(cssProps[i] || '').trim();
      if (!prop) continue;
      var path = String(CSS_TO_BRICKS_SETTINGS_PATH[prop] || '').trim();
      if (!path) continue;
      if (!hasOwn(BRICKS_SETTINGS_PATH_TO_CSS_PROPERTY, path)) {
        BRICKS_SETTINGS_PATH_TO_CSS_PROPERTY[path] = prop;
        BRICKS_SETTINGS_MAPPED_PATH_ORDER.push(path);
      }
    }
    var canonicalPaths = Object.keys(CANONICAL_READBACK_CSS_PROPERTY_BY_PATH || {});
    for (var j = 0; j < canonicalPaths.length; j++) {
      var canonicalPath = String(canonicalPaths[j] || '').trim();
      if (!canonicalPath) continue;
      var preferredProp = String(CANONICAL_READBACK_CSS_PROPERTY_BY_PATH[canonicalPath] || '').trim();
      if (!preferredProp) continue;
      if (String(CSS_TO_BRICKS_SETTINGS_PATH[preferredProp] || '').trim() !== canonicalPath) continue;
      BRICKS_SETTINGS_PATH_TO_CSS_PROPERTY[canonicalPath] = preferredProp;
      if (BRICKS_SETTINGS_MAPPED_PATH_ORDER.indexOf(canonicalPath) < 0) {
        BRICKS_SETTINGS_MAPPED_PATH_ORDER.push(canonicalPath);
      }
    }
  })();

  function BricksAPI(opts) {
    opts = opts || {};
    this.pollMs = Number(opts.pollMs || 250);
    this.domDebounceMs = Number(opts.domDebounceMs || 120);
    this._destroyed = false;
    this._listeners = {};
    this._selectionPoll = null;
    this._pollingActive = true;
    this._observer = null;
    this._iframe = null;
    this._iframeDoc = null;
    this._lastSelectedId = '';
    this._lastBuilderReady = false;
    this._lastSelectionStateKey = '';
    this._lastPollModelId = '';
    this._lastPollSettingsJSON = '';
    this._cachedMappedCssSnapshot = '';
    this._classFilterRegex = /^(?:brxe-|brx-|bricks-|is-active-|is-hover-|sortable|ui-|vue-|selected$|active$)/;
    this._globalClassNameCache = {};
    this._cssHoverPreview = {
      selector: '',
      nodes: [],
      attrName: 'data-cm6gpt-hover-preview',
      styleId: 'cm6gpt-hover-preview-style'
    };
    this._recipeGhostPreview = {
      targetId: '',
      targetNode: null,
      alias: '',
      cssBody: '',
      className: 'cm6gpt-recipe-ghost-preview',
      attrName: 'data-cm6gpt-recipe-ghost-preview-target',
      styleId: 'cm6gpt-recipe-ghost-preview-style',
      lastMode: ''
    };
    this._deferredUiStabilizerTimeouts = [];
    this._emitDomChangedDebounced = debounce(this._emitDomChanged.bind(this), this.domDebounceMs);
    this._boot();
  }

  runtimeModule.install = function (BricksAPI, deps) {
    var now = deps.now;
    var _warn = deps.warn;
    var removeValueFromArray = deps.removeValueFromArray;
    var isObject = deps.isObject;

  BricksAPI.prototype._scheduleDeferredUiStabilizer = function (callback, delayMs) {
    if (typeof callback !== 'function') return 0;
    if (this._destroyed) return 0;
    if (!Array.isArray(this._deferredUiStabilizerTimeouts)) {
      this._deferredUiStabilizerTimeouts = [];
    }
    var self = this;
    var timeoutId = setTimeout(function () {
      removeValueFromArray(self._deferredUiStabilizerTimeouts, timeoutId);
      if (self._destroyed) return;
      callback();
    }, Number(delayMs || 0));
    this._deferredUiStabilizerTimeouts.push(timeoutId);
    return timeoutId;
  };

  BricksAPI.prototype._clearDeferredUiStabilizers = function () {
    if (!Array.isArray(this._deferredUiStabilizerTimeouts) || !this._deferredUiStabilizerTimeouts.length) {
      this._deferredUiStabilizerTimeouts = [];
      return 0;
    }
    var pending = this._deferredUiStabilizerTimeouts.slice();
    this._deferredUiStabilizerTimeouts = [];
    for (var i = 0; i < pending.length; i++) {
      clearTimeout(pending[i]);
    }
    return pending.length;
  };

  BricksAPI.prototype._boot = function () {
    this._startSelectionPoll();
    this._tick();
  };

  BricksAPI.prototype._startSelectionPoll = function () {
    var self = this;
    if (!this._pollingActive || this._selectionPoll) return;
    // W36: Polling (setInterval 250ms) is used instead of MutationObserver because
    // Bricks element selection state lives in Vue reactivity (bricksInjected / window.bricksData),
    // not in the DOM. There is no reliable DOM mutation to observe for selection changes.
    this._selectionPoll = setInterval(function () {
      self._tick();
    }, this.pollMs);
  };

  BricksAPI.prototype._stopSelectionPoll = function () {
    if (this._selectionPoll) {
      clearInterval(this._selectionPoll);
      this._selectionPoll = null;
    }
    if (this._observer) {
      try { this._observer.disconnect(); } catch (e) { _warn("_stopSelectionPoll", e); }
      this._observer = null;
    }
  };

  BricksAPI.prototype.setPollingActive = function (active) {
    var next = !!active;
    if (next === this._pollingActive) return this._pollingActive;
    this._pollingActive = next;
    if (!next) {
      this._stopSelectionPoll();
      return this._pollingActive;
    }
    this._startSelectionPoll();
    this._tick();
    return this._pollingActive;
  };

  BricksAPI.prototype._tick = function () {
    if (!this._pollingActive) return;
    this._attachToBuilderIfReady();

    var selectedId = this.getSelectedElementId() || '';
    if (selectedId !== this._lastSelectedId) {
      this._lastSelectedId = selectedId;
      this._lastSelectionStateKey = '';
      this.emit('selection:changed', this.getSelectionContext());
    }
    this._emitSelectionStatePollIfChanged();
  };

  };

  discoveryModule.install = function (BricksAPI, deps) {
    var _warn = deps.warn;

  BricksAPI.prototype._getIframeDocumentSafe = function (iframe) {
    if (!iframe) return null;
    try {
      return iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document) || null;
    } catch (e) {
      return null;
    }
  };

  BricksAPI.prototype._looksLikeBuilderIframeDocument = function (doc) {
    if (!doc || !doc.body) return false;
    try {
      if (typeof doc.querySelector === 'function') {
        if (doc.querySelector('#brx-content')) return true;
        if (doc.querySelector(this._getBricksDomNodeSelector())) return true;
      }
    } catch (e) { _warn("_looksLikeBuilderIframeDocument", e); }

    try {
      var bodyClass = '';
      if (typeof doc.body.className === 'string') bodyClass = doc.body.className;
      else if (doc.body && typeof doc.body.getAttribute === 'function') bodyClass = String(doc.body.getAttribute('class') || '');
      bodyClass = String(bodyClass || '').toLowerCase();
      if (bodyClass.indexOf('brx') !== -1 || bodyClass.indexOf('bricks') !== -1) return true;
    } catch (e2) { _warn("_looksLikeBuilderIframeDocument", e2); }

    return false;
  };

  BricksAPI.prototype._resolveBuilderIframeState = function () {
    var docRef = document;
    if (!docRef) return null;

    var seen = [];
    var candidates = [];
    var self = this;

    function pushCandidate(iframe, baseScore, source) {
      if (!iframe || seen.indexOf(iframe) !== -1) return;
      seen.push(iframe);
      var iframeDoc = self._getIframeDocumentSafe(iframe);
      var ready = !!(iframe && iframeDoc && iframeDoc.body);
      var looksLikeBricks = ready && self._looksLikeBuilderIframeDocument(iframeDoc);
      candidates.push({
        iframe: iframe,
        doc: iframeDoc,
        ready: ready,
        looksLikeBricks: looksLikeBricks,
        source: String(source || ''),
        score: Number(baseScore || 0) + (ready ? 1000 : 0) + (looksLikeBricks ? 100 : 0)
      });
    }

    var selectorCandidates = [
      '#bricks-preview iframe',
      '#bricks-builder-iframe',
      'iframe#bricks-builder-iframe',
      'iframe[name="bricks-builder-iframe"]'
    ];
    for (var i = 0; i < selectorCandidates.length; i++) {
      var selector = selectorCandidates[i];
      try {
        pushCandidate(docRef.querySelector(selector), 500 - (i * 50), selector);
      } catch (e0) { _warn("_resolveBuilderIframeState", e0); }
    }

    try {
      var iframes = docRef.querySelectorAll ? docRef.querySelectorAll('iframe') : [];
      for (var j = 0; j < iframes.length; j++) {
        pushCandidate(iframes[j], 100, 'iframe-scan');
      }
    } catch (e1) { _warn("_resolveBuilderIframeState", e1); }

    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      if (a.looksLikeBricks !== b.looksLikeBricks) return a.looksLikeBricks ? -1 : 1;
      return 0;
    });

    return candidates[0];
  };

  BricksAPI.prototype._attachToBuilderIfReady = function () {
    var resolved = this._resolveBuilderIframeState();
    var iframe = resolved && resolved.iframe;
    var iframeDoc = resolved && resolved.doc;
    var ready = !!(resolved && resolved.ready);

    if (!ready) {
      this._lastBuilderReady = false;
      this._lastSelectionStateKey = '';
      return;
    }

    if (this._iframe === iframe && this._iframeDoc === iframeDoc && this._observer) {
      return;
    }

    var iframeChanged = (this._iframe !== iframe) || (this._iframeDoc !== iframeDoc);
    if (iframeChanged) {
      this.clearRecipeGhostPreview();
      this.clearCssHoverPreview();
    }

    this._iframe = iframe;
    this._iframeDoc = iframeDoc;
    this._connectObserver();

    if (!this._lastBuilderReady) {
      this._lastBuilderReady = true;
    }

    this.emit('builder:ready', { iframe: iframe });
    this.emit('dom:changed', { reason: 'attach' });
  };

  BricksAPI.prototype._connectObserver = function () {
    if (this._observer) {
      try { this._observer.disconnect(); } catch (e) { _warn("_connectObserver", e); }
    }

    if (!this._iframeDoc || !this._iframeDoc.body || !w.MutationObserver) return;

    var self = this;
    this._observer = new MutationObserver(function () {
      self._emitDomChangedDebounced();
    });

    // Observe the full document root so head <style> mutations (native Bricks/class CSS updates)
    // also trigger refreshes, not only body DOM mutations.
    var observeRoot = this._iframeDoc.documentElement || this._iframeDoc.body;
    this._observer.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-id', 'data-element-id'],
      characterData: true
    });
  };

  BricksAPI.prototype._emitDomChanged = function () {
    this.emit('dom:changed', {
      ts: now(),
      selection: this.getSelectionContext()
    });
  };

  BricksAPI.prototype._getSelectionStatePollKey = function () {
    var ctx = this.getSelectionContext();
    if (!ctx) return 'none';

    if (ctx.mode === 'page') {
      var pageCss = '';
      try { pageCss = String(this.getPageCustomCss() || ''); } catch (e0) { pageCss = ''; }
      return ['page', pageCss].join('|');
    }

    if (ctx.mode !== 'element') return String(ctx.mode || 'unknown');
    var id = String(ctx.id || '');
    var model = this.getElementModelById(id);
    if (!model || !isObject(model.settings)) return 'element|' + id + '|model-missing';

    var settings = model.settings;

    // T10: Build a lightweight fingerprint of the settings fields that affect mapped CSS,
    // so we can skip the expensive _serializeMappedSettingsCssSnapshot when nothing changed.
    var cssCustom = typeof settings._cssCustom === 'string' ? settings._cssCustom : '';
    var cssId = typeof settings._cssId === 'string' ? settings._cssId : '';
    var cssClasses = typeof settings._cssClasses === 'string' ? settings._cssClasses : '';
    var globalClasses = Array.isArray(settings._cssGlobalClasses)
      ? settings._cssGlobalClasses.map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(',')
      : '';

    // T10: Cache _serializeMappedSettingsCssSnapshot — only recompute when settings JSON changes.
    var settingsJSON = '';
    try { settingsJSON = JSON.stringify(settings); } catch (ej) { settingsJSON = ''; }
    var mappedCss = '';
    if (id === this._lastPollModelId && settingsJSON === this._lastPollSettingsJSON) {
      mappedCss = this._cachedMappedCssSnapshot;
    } else {
      try {
        mappedCss = this._serializeMappedSettingsCssSnapshot(settings);
      } catch (e1) {
        mappedCss = '';
      }
      this._lastPollModelId = id;
      this._lastPollSettingsJSON = settingsJSON;
      this._cachedMappedCssSnapshot = mappedCss;
    }

    // T10: Use precompiled _classFilterRegex instead of 10 individual regex tests per class name.
    var domUserClasses = '';
    var filterRe = this._classFilterRegex;
    try {
      var domClassList = Array.prototype.slice.call(ctx.element && ctx.element.classList ? ctx.element.classList : [])
        .map(function (name) { return String(name || '').trim(); })
        .filter(function (name) {
          return name && !filterRe.test(name);
        });
      domUserClasses = this._normalizeClassNameList(domClassList).join(' ');
    } catch (e2) {
      domUserClasses = '';
    }

    return ['element', id, cssId, cssClasses, globalClasses, domUserClasses, mappedCss, cssCustom].join('|');
  };

  BricksAPI.prototype._emitSelectionStatePollIfChanged = function () {
    var nextKey = this._getSelectionStatePollKey();
    if (nextKey === this._lastSelectionStateKey) return;
    this._lastSelectionStateKey = nextKey;
    this.emit('dom:changed', {
      reason: 'selection-state-poll',
      ts: now(),
      selection: this.getSelectionContext()
    });
  };

  BricksAPI.prototype.on = function (eventName, cb) {
    if (typeof cb !== 'function') return function () {};
    this._listeners[eventName] = this._listeners[eventName] || [];
    this._listeners[eventName].push(cb);
    var self = this;
    return function () {
      var arr = self._listeners[eventName] || [];
      var idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    };
  };

  BricksAPI.prototype.emit = function (eventName, payload) {
    var arr = this._listeners[eventName] || [];
    arr.forEach(function (cb) {
      try { cb(payload); } catch (e) { _warn("emit", e); }
    });
  };

  BricksAPI.prototype.getIframeDocument = function () {
    return this._iframeDoc || null;
  };

  BricksAPI.prototype._getBricksDomNodeSelector = function () {
    return '[data-id], [data-script-id], [data-component-instance], [data-component], [data-bricks-id], [id^="brxe-"]';
  };

  BricksAPI.prototype._getBricksElementIdAttributeNames = function () {
    return ['data-script-id', 'data-id', 'data-component-instance', 'data-component', 'data-bricks-id'];
  };

  BricksAPI.prototype.getBuilderRoot = function () {
    var doc = this.getIframeDocument();
    if (!doc) return null;
    var candidates = [];
    var seen = [];

    function push(node) {
      if (!node || seen.indexOf(node) !== -1) return;
      seen.push(node);
      candidates.push(node);
    }

    try { push(doc.querySelector && doc.querySelector('#brx-content')); } catch (e0) { _warn("getBuilderRoot", e0); }
    try { push(doc.querySelector && doc.querySelector('.brx-body')); } catch (e1) { _warn("getBuilderRoot", e1); }
    try { push(doc.querySelector && doc.querySelector('[data-builder-root]')); } catch (e2) { _warn("getBuilderRoot", e2); }
    try { push(doc.querySelector && doc.querySelector('[data-canvas-root]')); } catch (e3) { _warn("getBuilderRoot", e3); }
    try { push(doc.body); } catch (e4) { _warn("getBuilderRoot", e4); }

    var selector = this._getBricksDomNodeSelector();
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      if (!node) continue;
      try {
        if (typeof node.matches === 'function' && node.matches(selector)) return node;
      } catch (e5) { _warn("getBuilderRoot", e5); }
      try {
        if (typeof node.querySelector === 'function' && node.querySelector(selector)) return node;
      } catch (e6) { _warn("getBuilderRoot", e6); }
    }

    return candidates.length ? candidates[0] : null;
  };

  };

  previewModule.install = function (BricksAPI, deps) {
    var _warn = deps.warn;
    var removeClassSafe = deps.removeClassSafe;
    var splitCssSelectorList = deps.splitCssSelectorList;
    var pushUniqueSelector = deps.pushUniqueSelector;
    var buildScopedSelectorVariants = deps.buildScopedSelectorVariants;
    var parseSingleTopLevelAtRuleBlock = deps.parseSingleTopLevelAtRuleBlock;

  BricksAPI.prototype._getCssHoverPreviewState = function () {
    if (!this._cssHoverPreview || typeof this._cssHoverPreview !== 'object') {
      this._cssHoverPreview = {
        selector: '',
        nodes: [],
        attrName: 'data-cm6gpt-hover-preview',
        styleId: 'cm6gpt-hover-preview-style'
      };
    }
    if (!this._cssHoverPreview.attrName) this._cssHoverPreview.attrName = 'data-cm6gpt-hover-preview';
    if (!this._cssHoverPreview.styleId) this._cssHoverPreview.styleId = 'cm6gpt-hover-preview-style';
    if (!Array.isArray(this._cssHoverPreview.nodes)) this._cssHoverPreview.nodes = [];
    return this._cssHoverPreview;
  };

  BricksAPI.prototype._ensureCssHoverPreviewStyle = function () {
    var doc = this.getIframeDocument();
    if (!doc || typeof doc.createElement !== 'function') return null;
    var state = this._getCssHoverPreviewState();
    var style = null;
    try {
      style = doc.getElementById ? doc.getElementById(state.styleId) : null;
    } catch (e) {
      style = null;
    }
    if (style) return style;

    try {
      style = doc.createElement('style');
      style.id = state.styleId;
      style.type = 'text/css';
      style.textContent = '[' + state.attrName + '="1"] {' +
        'outline: 2px solid rgba(56, 189, 248, 0.95) !important;' +
        'outline-offset: 2px !important;' +
        'box-shadow: 0 0 0 2px rgba(14, 116, 144, 0.35) !important;' +
      '}';
      var head = doc.head || doc.documentElement || doc.body;
      if (!head || typeof head.appendChild !== 'function') return null;
      head.appendChild(style);
      return style;
    } catch (e2) {
      return null;
    }
  };

  BricksAPI.prototype._clearCssHoverPreviewNodes = function () {
    var state = this._getCssHoverPreviewState();
    var nodes = Array.isArray(state.nodes) ? state.nodes : [];
    var attrName = state.attrName;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || typeof node.removeAttribute !== 'function') continue;
      try { node.removeAttribute(attrName); } catch (e) { _warn("_clearCssHoverPreviewNodes", e); }
    }
    state.nodes = [];
  };

  BricksAPI.prototype.clearCssHoverPreview = function () {
    var state = this._getCssHoverPreviewState();
    this._clearCssHoverPreviewNodes();
    state.selector = '';
    return { ok: true, cleared: true };
  };

  BricksAPI.prototype.setCssHoverPreviewSelector = function (selector, opts) {
    opts = opts || {};
    var normalizedSelector = String(selector == null ? '' : selector).trim();
    var state = this._getCssHoverPreviewState();

    if (!normalizedSelector) {
      return this.clearCssHoverPreview();
    }

    var doc = this.getIframeDocument();
    var root = this.getBuilderRoot();
    if (!doc || !root || typeof root.querySelectorAll !== 'function') {
      this.clearCssHoverPreview();
      return { ok: false, reason: 'builder-not-ready', selector: normalizedSelector, count: 0 };
    }

    var maxMatches = Math.max(1, Math.min(400, Number(opts.maxMatches || 64)));
    this._ensureCssHoverPreviewStyle();

    var matches = [];
    var truncated = false;

    try {
      if (typeof root.matches === 'function' && root.matches(normalizedSelector)) {
        matches.push(root);
      }
    } catch (e0) { _warn("setCssHoverPreviewSelector", e0); }

    try {
      var nodeList = root.querySelectorAll(normalizedSelector);
      for (var i = 0; i < nodeList.length; i++) {
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
        var node = nodeList[i];
        if (!node || typeof node.setAttribute !== 'function') continue;
        if (matches.indexOf(node) !== -1) continue;
        matches.push(node);
      }
    } catch (e1) {
      this.clearCssHoverPreview();
      return {
        ok: false,
        reason: 'invalid-selector',
        selector: normalizedSelector,
        count: 0,
        error: e1 && e1.message ? e1.message : String(e1)
      };
    }

    this._clearCssHoverPreviewNodes();

    var attrName = state.attrName;
    for (var j = 0; j < matches.length; j++) {
      try { matches[j].setAttribute(attrName, '1'); } catch (e2) { _warn("setCssHoverPreviewSelector", e2); }
    }

    state.selector = normalizedSelector;
    state.nodes = matches;

    return {
      ok: true,
      reason: matches.length ? 'highlighted' : 'no-match',
      selector: normalizedSelector,
      count: matches.length,
      truncated: truncated
    };
  };

  BricksAPI.prototype._getRecipeGhostPreviewState = function () {
    if (!this._recipeGhostPreview || typeof this._recipeGhostPreview !== 'object') {
      this._recipeGhostPreview = {
        targetId: '',
        targetNode: null,
        alias: '',
        cssBody: '',
        className: 'cm6gpt-recipe-ghost-preview',
        attrName: 'data-cm6gpt-recipe-ghost-preview-target',
        styleId: 'cm6gpt-recipe-ghost-preview-style',
        lastMode: ''
      };
    }
    if (!this._recipeGhostPreview.className) this._recipeGhostPreview.className = 'cm6gpt-recipe-ghost-preview';
    if (!this._recipeGhostPreview.attrName) this._recipeGhostPreview.attrName = 'data-cm6gpt-recipe-ghost-preview-target';
    if (!this._recipeGhostPreview.styleId) this._recipeGhostPreview.styleId = 'cm6gpt-recipe-ghost-preview-style';
    return this._recipeGhostPreview;
  };

  BricksAPI.prototype._buildRecipeGhostPreviewCss = function (cssBody, className, targetSelector) {
    var raw = String(cssBody == null ? '' : cssBody).trim();
    var selector = '.' + String(className || 'cm6gpt-recipe-ghost-preview').trim();
    targetSelector = String(targetSelector || '').trim();
    var targetAttrSelector = targetSelector || '[data-cm6gpt-recipe-ghost-preview-target="1"]';
    if (!raw) return { ok: false, reason: 'empty-css', css: '', mode: '' };
    if (!selector || selector === '.') return { ok: false, reason: 'invalid-class', css: '', mode: '' };

    var cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!cleaned) return { ok: false, reason: 'empty-css', css: '', mode: '' };

    if (cleaned.indexOf('{') === -1) {
      return {
        ok: true,
        reason: 'declaration-block',
        mode: 'declaration-block',
        css: selector + ' {\n' + cleaned + '\n}'
      };
    }

    if (cleaned.indexOf('&') !== -1) {
      return {
        ok: true,
        reason: 'ampersand-rules',
        mode: 'ampersand-rules',
        css: cleaned.replace(/&/g, selector)
      };
    }

    if (/^\{[\s\S]*\}$/.test(cleaned)) {
      var inner = cleaned.slice(1, -1).trim();
      if (inner) {
        return {
          ok: true,
          reason: 'wrapped-declarations',
          mode: 'wrapped-declarations',
          css: selector + ' {\n' + inner + '\n}'
        };
      }
    }

    if (cleaned.charAt(0) === '@') {
      if (!/^@(?:media|supports)\b/i.test(cleaned)) {
        return { ok: false, reason: 'unsupported-at-rule-kind', css: '', mode: '' };
      }
      var atRule = parseSingleTopLevelAtRuleBlock(cleaned);
      if (!atRule) {
        return { ok: false, reason: 'unsupported-at-rule-structure', css: '', mode: '' };
      }
      var nestedOut = this._buildRecipeGhostPreviewCss(atRule.body, className, targetAttrSelector);
      if (!nestedOut || !nestedOut.ok || !nestedOut.css) {
        return {
          ok: false,
          reason: nestedOut && nestedOut.reason ? nestedOut.reason : 'unsupported-at-rule-no-anchor',
          css: '',
          mode: ''
        };
      }
      var nestedCss = String(nestedOut.css || '');
      var indented = nestedCss.split('\n').map(function (line) { return '  ' + line; }).join('\n');
      return {
        ok: true,
        reason: 'at-rule-scoped',
        mode: 'at-rule-scoped',
        css: atRule.prelude + ' {\n' + indented + '\n}'
      };
    }

    var ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
    var scopedRules = [];
    var consumed = 0;
    var m = null;

    while ((m = ruleRegex.exec(cleaned))) {
      var before = cleaned.slice(consumed, m.index).trim();
      if (before) {
        return { ok: false, reason: 'unsupported-selector-rules', css: '', mode: '' };
      }
      consumed = ruleRegex.lastIndex;

      var selectorSource = String(m[1] || '').trim();
      var body = String(m[2] || '').trim();
      if (!selectorSource || !body) continue;

      var selectorItems = splitCssSelectorList(selectorSource);
      if (!selectorItems.length) continue;

      var scopedSelectors = [];
      for (var i = 0; i < selectorItems.length; i++) {
        var item = String(selectorItems[i] || '').trim();
        if (!item) continue;
        var variants = buildScopedSelectorVariants(item, targetAttrSelector, targetAttrSelector);
        for (var v = 0; v < variants.length; v++) {
          pushUniqueSelector(scopedSelectors, variants[v]);
        }
      }

      if (!scopedSelectors.length) continue;
      scopedRules.push(scopedSelectors.join(', ') + ' {\n' + body + '\n}');
    }

    if (!scopedRules.length) {
      return { ok: false, reason: 'unsupported-selector-rules', css: '', mode: '' };
    }

    if (cleaned.slice(consumed).trim()) {
      return { ok: false, reason: 'unsupported-selector-rules', css: '', mode: '' };
    }

    return {
      ok: true,
      reason: 'selector-rules-scoped',
      mode: 'selector-rules-scoped',
      css: scopedRules.join('\n')
    };
  };

  BricksAPI.prototype._ensureRecipeGhostPreviewStyle = function () {
    var doc = this.getIframeDocument();
    if (!doc || typeof doc.createElement !== 'function') return null;
    var state = this._getRecipeGhostPreviewState();
    var style = null;
    try {
      style = doc.getElementById ? doc.getElementById(state.styleId) : null;
    } catch (e0) {
      style = null;
    }
    if (style) return style;

    try {
      style = doc.createElement('style');
      style.id = state.styleId;
      style.type = 'text/css';
      style.textContent = '';
      var head = doc.head || doc.documentElement || doc.body;
      if (!head || typeof head.appendChild !== 'function') return null;
      head.appendChild(style);
      return style;
    } catch (e1) {
      return null;
    }
  };

  BricksAPI.prototype._clearRecipeGhostPreviewTarget = function () {
    var state = this._getRecipeGhostPreviewState();
    var node = state.targetNode;
    if (node) {
      removeClassSafe(node, state.className);
      if (state.attrName && typeof node.removeAttribute === 'function') {
        try { node.removeAttribute(state.attrName); } catch (e) { _warn("_clearRecipeGhostPreviewTarget", e); }
      }
    }
    state.targetNode = null;
    state.targetId = '';
    state.alias = '';
    state.cssBody = '';
    state.lastMode = '';
  };

  BricksAPI.prototype.clearRecipeGhostPreview = function () {
    var state = this._getRecipeGhostPreviewState();
    this._clearRecipeGhostPreviewTarget();
    var doc = this.getIframeDocument();
    var style = null;
    if (doc) {
      try { style = doc.getElementById ? doc.getElementById(state.styleId) : null; } catch (e0) { style = null; }
    }
    if (style) {
      try { style.textContent = ''; } catch (e1) { _warn("clearRecipeGhostPreview", e1); }
    }
    return { ok: true, cleared: true };
  };

  BricksAPI.prototype.setRecipeGhostPreview = function (opts) {
    opts = opts || {};
    var state = this._getRecipeGhostPreviewState();
    var targetId = String(opts.targetId || this.getSelectedElementId() || '').trim();
    var alias = String(opts.alias || '').trim();
    var cssBody = String(opts.cssBody == null ? '' : opts.cssBody);

    if (!targetId) {
      this.clearRecipeGhostPreview();
      return { ok: false, reason: 'no-target', alias: alias, targetId: '', mode: '' };
    }

    var doc = this.getIframeDocument();
    if (!doc) {
      this.clearRecipeGhostPreview();
      return { ok: false, reason: 'builder-not-ready', alias: alias, targetId: targetId, mode: '' };
    }

    var targetNode = this._queryElementDomById(targetId);
    if (!targetNode) {
      this.clearRecipeGhostPreview();
      return { ok: false, reason: 'target-not-found', alias: alias, targetId: targetId, mode: '' };
    }

    var targetSelector = '[' + state.attrName + '="1"]';
    var cssOut = this._buildRecipeGhostPreviewCss(cssBody, state.className, targetSelector);
    if (!cssOut || !cssOut.ok || !cssOut.css) {
      this.clearRecipeGhostPreview();
      return {
        ok: false,
        reason: cssOut && cssOut.reason ? cssOut.reason : 'invalid-css',
        alias: alias,
        targetId: targetId,
        mode: cssOut && cssOut.mode ? cssOut.mode : ''
      };
    }

    var style = this._ensureRecipeGhostPreviewStyle();
    if (!style) {
      this.clearRecipeGhostPreview();
      return { ok: false, reason: 'style-unavailable', alias: alias, targetId: targetId, mode: cssOut.mode || '' };
    }

    this._clearRecipeGhostPreviewTarget();
    addClassSafe(targetNode, state.className);
    if (state.attrName && typeof targetNode.setAttribute === 'function') {
      try { targetNode.setAttribute(state.attrName, '1'); } catch (e2) { _warn("setRecipeGhostPreview", e2); }
    }
    try { style.textContent = String(cssOut.css || ''); } catch (e3) { _warn("setRecipeGhostPreview", e3); }

    state.targetNode = targetNode;
    state.targetId = targetId;
    state.alias = alias;
    state.cssBody = cssBody;
    state.lastMode = String(cssOut.mode || '');

    return {
      ok: true,
      reason: 'previewed',
      alias: alias,
      targetId: targetId,
      mode: String(cssOut.mode || ''),
      cssLength: String(cssOut.css || '').length
    };
  };

  };

  BricksAPI.prototype.getAdmin = function () {
    if (w.ADMINBRXC && typeof w.ADMINBRXC === 'object') {
      return w.ADMINBRXC;
    }

    var vueProps = this._getVueGlobalProps();
    if (!vueProps || typeof vueProps !== 'object') {
      return null;
    }

    var vueState = null;
    if (vueProps.$_state && typeof vueProps.$_state === 'object') {
      vueState = vueProps.$_state;
    } else if (vueProps.vueState && typeof vueProps.vueState === 'object') {
      vueState = vueProps.vueState;
    }

    var builderStates = null;
    if (vueProps.builderStates && typeof vueProps.builderStates === 'object') {
      builderStates = vueProps.builderStates;
    } else if (vueState && vueState.builderStates && typeof vueState.builderStates === 'object') {
      builderStates = vueState.builderStates;
    }

    return {
      vueGlobalProp: vueProps,
      vueState: vueState,
      builderStates: builderStates,
      helpers: vueProps.helpers && typeof vueProps.helpers === 'object' ? vueProps.helpers : vueProps
    };
  };

  BricksAPI.prototype.getVueState = function () {
    if (w.QCSSv2 && w.QCSSv2.bridge && w.QCSSv2.bridge.QBricksBridge && w.QCSSv2.bridge.QBricksBridge.vueState) {
      return w.QCSSv2.bridge.QBricksBridge.vueState;
    }
    var admin = this.getAdmin();
    if (admin && admin.vueState) return admin.vueState;
    var appRoot = this._getBuilderAppRoot();
    return safeGet(function () {
      return appRoot.__vue_app__.config.globalProperties.$_state;
    }, null);
  };

  BricksAPI.prototype._getBuilderAppRoot = function () {
    var docRef = document;
    if (!docRef) return null;

    var candidates = [];
    function pushCandidate(node) {
      if (!node || candidates.indexOf(node) !== -1) return;
      candidates.push(node);
    }

    try { pushCandidate(docRef.querySelector && docRef.querySelector('.brx-body')); } catch (e0) { _warn("_getBuilderAppRoot", e0); }
    try { pushCandidate(docRef.getElementById && docRef.getElementById('bricks-builder')); } catch (e1) { _warn("_getBuilderAppRoot", e1); }
    try { pushCandidate(docRef.body); } catch (e2) { _warn("_getBuilderAppRoot", e2); }

    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      if (node && node.__vue_app__) return node;
    }

    return candidates.length ? candidates[0] : null;
  };

  BricksAPI.prototype._getVueGlobalProps = function () {
    var appRoot = this._getBuilderAppRoot();
    return safeGet(function () {
      return appRoot.__vue_app__.config.globalProperties;
    }, null);
  };

  BricksAPI.prototype._getCompatibilityStateRoots = function (opts) {
    opts = opts || {};
    var out = [];
    var seen = [];
    var admin = this.getAdmin();
    var state = this.getVueState();

    function push(root, path) {
      if (!root || (typeof root !== 'object' && typeof root !== 'function')) return;
      if (seen.indexOf(root) !== -1) return;
      seen.push(root);
      out.push({ root: root, path: String(path || '') });
    }

    if (opts.includeAdminWrapper) push(admin, 'admin');
    if (opts.includeBuilderStates) push(admin && admin.builderStates, 'admin.builderStates');
    push(state, 'vueState');
    if (opts.includeBuilderStates) push(state && state.builderStates, 'vueState.builderStates');
    push(admin && admin.vueState, 'admin.vueState');
    if (opts.includeBuilderStates) push(admin && admin.vueState && admin.vueState.builderStates, 'admin.vueState.builderStates');
    if (opts.includeVueGlobalPropLoadData) push(admin && admin.vueGlobalProp && admin.vueGlobalProp.loadData, 'admin.vueGlobalProp.loadData');
    push(admin && admin.vueGlobalProp, 'admin.vueGlobalProp');
    push(w.bricksData && w.bricksData.loadData, 'bricksData.loadData');
    push(w.bricksData, 'bricksData');

    return out;
  };

  BricksAPI.prototype._getCompatibilityWalkRoots = function () {
    return this._getCompatibilityStateRoots({
      includeAdminWrapper: true,
      includeBuilderStates: false,
      includeVueGlobalPropLoadData: true
    });
  };

  BricksAPI.prototype._getSelectedElementStateRoots = function () {
    return this._getCompatibilityStateRoots({
      includeBuilderStates: true
    });
  };

  BricksAPI.prototype._getElementStateRootEntries = function () {
    var out = [];
    var roots = this._getCompatibilityStateRoots({
      includeVueGlobalPropLoadData: true
    });
    var allowedPaths = {
      'vueState': true,
      'admin.vueState': true,
      'admin.vueGlobalProp.loadData': true,
      'bricksData.loadData': true,
      'bricksData': true
    };

    for (var i = 0; i < roots.length; i++) {
      var entry = roots[i];
      var path = entry && entry.path ? String(entry.path) : '';
      if (!allowedPaths[path]) continue;
      out.push({
        root: entry && entry.root,
        path: path
      });
    }

    return out;
  };

  BricksAPI.prototype._getBuilderRefreshHooks = function () {
    var admin = null;
    var vueProps = null;

    try {
      admin = this.getAdmin();
    } catch (e0) { _warn("_getBuilderRefreshHooks", e0); }

    try {
      vueProps = this._getVueGlobalProps();
    } catch (e1) { _warn("_getBuilderRefreshHooks", e1); }

    function pick(candidates) {
      for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        var fn = candidate && candidate.fn;
        if (typeof fn !== 'function') continue;
        return {
          fn: fn,
          owner: candidate.owner || null,
          path: String(candidate.path || '')
        };
      }
      return null;
    }

    return {
      saveChanges: pick([
        { fn: admin && admin.helpers && admin.helpers.saveChanges, owner: admin && admin.helpers, path: 'admin.helpers.saveChanges' },
        { fn: vueProps && vueProps.helpers && vueProps.helpers.saveChanges, owner: vueProps && vueProps.helpers, path: 'vueGlobalProps.helpers.saveChanges' },
        {
          fn: admin && admin.vueGlobalProp && typeof admin.vueGlobalProp.$_savePost === 'function'
            ? function () { return admin.vueGlobalProp.$_savePost.call(admin.vueGlobalProp, {}); }
            : null,
          owner: null,
          path: 'admin.vueGlobalProp.$_savePost(adapter)'
        },
        {
          fn: vueProps && typeof vueProps.$_savePost === 'function'
            ? function () { return vueProps.$_savePost.call(vueProps, {}); }
            : null,
          owner: null,
          path: 'vueGlobalProps.$_savePost(adapter)'
        }
      ]),
      renderElement: pick([
        { fn: admin && admin.helpers && admin.helpers.renderElement, owner: admin && admin.helpers, path: 'admin.helpers.renderElement' },
        { fn: vueProps && vueProps.helpers && vueProps.helpers.renderElement, owner: vueProps && vueProps.helpers, path: 'vueGlobalProps.helpers.renderElement' },
        { fn: admin && admin.vueGlobalProp && admin.vueGlobalProp.$_rerenderElementId, owner: admin && admin.vueGlobalProp, path: 'admin.vueGlobalProp.$_rerenderElementId' },
        { fn: vueProps && vueProps.$_rerenderElementId, owner: vueProps, path: 'vueGlobalProps.$_rerenderElementId' }
      ]),
      generateCss: pick([
        { fn: admin && admin.vueGlobalProp && admin.vueGlobalProp.$_generateCss, owner: admin && admin.vueGlobalProp, path: 'admin.vueGlobalProp.$_generateCss' },
        { fn: vueProps && vueProps.$_generateCss, owner: vueProps, path: 'vueGlobalProps.$_generateCss' }
      ])
    };
  };

  BricksAPI.prototype._getBuilderUiTouchTargets = function (opts) {
    opts = opts || {};
    var out = [];
    var seen = [];
    var state = null;
    var bricksData = null;

    function push(owner, key, path) {
      if (!owner || typeof owner !== 'object') return;
      if (!key) return;
      for (var i = 0; i < seen.length; i++) {
        var entry = seen[i];
        if (entry.owner === owner && entry.key === key) return;
      }
      seen.push({ owner: owner, key: key });
      out.push({
        owner: owner,
        key: String(key),
        path: String(path || '')
      });
    }

    try {
      state = this.getVueState();
    } catch (e0) { _warn("_getBuilderUiTouchTargets", e0); }

    try {
      bricksData = w.bricksData;
    } catch (e1) { _warn("_getBuilderUiTouchTargets", e1); }

    if (opts.includeVueStateRerenderControls !== false) {
      push(state, 'rerenderControls', 'vueState.rerenderControls');
    }
    if (opts.includeBricksDataTimestamp !== false) {
      push(bricksData, 'timestamp', 'bricksData.timestamp');
    }

    return out;
  };

  BricksAPI.prototype._getActiveClassUiCompatibility = function (refs) {
    refs = refs || this._collectActiveClassUiRefs();
    var admin = refs && refs.admin ? refs.admin : null;
    var builderStates = admin && admin.builderStates && typeof admin.builderStates === 'object'
      ? admin.builderStates
      : null;
    var isClassActiveHook = null;

    function makeStateRef(owner, key, path, requireOwn) {
      if (!owner || typeof owner !== 'object') return null;
      if (requireOwn && !hasOwn(owner, key)) return null;
      return {
        owner: owner,
        key: String(key || ''),
        path: String(path || '')
      };
    }

    try {
      if (admin && admin.helpers && typeof admin.helpers.isClassActive === 'function') {
        isClassActiveHook = {
          fn: admin.helpers.isClassActive,
          owner: admin.helpers,
          path: 'admin.helpers.isClassActive'
        };
      }
    } catch (e) { _warn("_getActiveClassUiCompatibility", e); }

    return {
      refs: refs,
      activeClassOwners: Array.isArray(refs && refs.activeClassOwners) ? refs.activeClassOwners : [],
      classModeOwners: Array.isArray(refs && refs.classModeOwners) ? refs.classModeOwners : [],
      activeClassState: makeStateRef(builderStates, 'activeClass', 'admin.builderStates.activeClass', true),
      activeObjectState: makeStateRef(builderStates, 'activeObject', 'admin.builderStates.activeObject', false),
      activeElementState: makeStateRef(builderStates, 'activeElement', 'admin.builderStates.activeElement', false),
      isClassActiveHook: isClassActiveHook
    };
  };

  BricksAPI.prototype.getBuilderCompatibilityReport = function (opts) {
    opts = opts || {};
    var includeStores = opts.includeStores !== false;
    var issues = [];

    function pushIssue(code, severity, message, details) {
      issues.push({
        code: String(code || ''),
        severity: String(severity || 'warning'),
        message: String(message || ''),
        details: details && typeof details === 'object' ? details : null
      });
    }

    function uniquePaths(entries) {
      var out = [];
      var seen = [];
      entries = Array.isArray(entries) ? entries : [];
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var path = '';
        if (typeof entry === 'string') path = entry;
        else if (entry && entry.path) path = String(entry.path || '');
        if (!path || seen.indexOf(path) !== -1) continue;
        seen.push(path);
        out.push(path);
      }
      return out;
    }

    function makePath(pathLike) {
      return pathLike && pathLike.path ? String(pathLike.path || '') : '';
    }

    function deriveStatus(list) {
      var status = 'ok';
      for (var i = 0; i < list.length; i++) {
        var severity = String((list[i] && list[i].severity) || '');
        if (severity === 'error') return 'error';
        if (severity === 'warning') status = 'warning';
      }
      return status;
    }

    function inferAdminSource(admin, vueProps) {
      if (w.ADMINBRXC && typeof w.ADMINBRXC === 'object') return 'ADMINBRXC';
      if (admin && admin.vueGlobalProp && vueProps && admin.vueGlobalProp === vueProps) return 'vueGlobalProps';
      if (admin) return 'compat-wrapper';
      return '';
    }

    function inferVueStateSource(admin, appRoot) {
      if (
        w.QCSSv2 &&
        w.QCSSv2.bridge &&
        w.QCSSv2.bridge.QBricksBridge &&
        w.QCSSv2.bridge.QBricksBridge.vueState
      ) {
        return 'QCSSv2.bridge.QBricksBridge.vueState';
      }
      if (admin && admin.vueState) return 'admin.vueState';
      if (
        appRoot &&
        appRoot.__vue_app__ &&
        appRoot.__vue_app__.config &&
        appRoot.__vue_app__.config.globalProperties &&
        appRoot.__vue_app__.config.globalProperties.$_state
      ) {
        return 'vueGlobalProps.$_state';
      }
      return '';
    }

    var iframeDoc = null;
    var builderRoot = null;
    var appRoot = null;
    var vueProps = null;
    var admin = null;
    var vueState = null;
    var selectionRoots = [];
    var refreshHooks = {};
    var uiTouchTargets = [];
    var activeCompat = null;
    var selection = null;
    var selectedModel = null;
    var globalStores = [];
    var pageStores = [];
    var bricksData = safeGet(function () { return w.bricksData; }, null);
    var identity = {
      postId: bricksData && bricksData.postId != null ? String(bricksData.postId) : '',
      postType: bricksData && bricksData.postType != null ? String(bricksData.postType) : '',
      postStatus: bricksData && bricksData.postStatus != null ? String(bricksData.postStatus) : '',
      isTemplate: !!(bricksData && bricksData.isTemplate)
    };

    try {
      iframeDoc = this.getIframeDocument();
    } catch (e0) {
      pushIssue('builder-iframe-document-exception', 'error', 'Builder iframe document lookup threw an exception.', {
        error: e0 && e0.message ? String(e0.message) : String(e0)
      });
    }

    var builderReady = !!(iframeDoc && iframeDoc.body);
    if (!builderReady) {
      return {
        title: 'Bricks Builder Compatibility v1',
        status: 'pending',
        summary: 'Bricks builder iframe is not attached yet.',
        builderReady: false,
        includeStores: includeStores,
        identity: identity,
        issues: [],
        capabilities: {
          iframeDocument: { ok: false },
          builderIdentity: identity
        }
      };
    }

    try {
      builderRoot = this.getBuilderRoot();
    } catch (e1) {
      pushIssue('builder-root-exception', 'error', 'Builder root lookup threw an exception.', {
        error: e1 && e1.message ? String(e1.message) : String(e1)
      });
    }

    try {
      appRoot = this._getBuilderAppRoot();
    } catch (e2) {
      pushIssue('builder-app-root-exception', 'warning', 'Builder app-root lookup threw an exception.', {
        error: e2 && e2.message ? String(e2.message) : String(e2)
      });
    }

    try {
      vueProps = this._getVueGlobalProps();
    } catch (e3) {
      pushIssue('builder-vue-props-exception', 'warning', 'Vue global-properties lookup threw an exception.', {
        error: e3 && e3.message ? String(e3.message) : String(e3)
      });
    }

    try {
      admin = this.getAdmin();
    } catch (e4) {
      pushIssue('admin-surface-exception', 'warning', 'Builder admin-surface lookup threw an exception.', {
        error: e4 && e4.message ? String(e4.message) : String(e4)
      });
    }

    try {
      vueState = this.getVueState();
    } catch (e5) {
      pushIssue('vue-state-exception', 'error', 'Builder Vue-state lookup threw an exception.', {
        error: e5 && e5.message ? String(e5.message) : String(e5)
      });
    }

    try {
      selectionRoots = this._getSelectedElementStateRoots();
    } catch (e6) {
      pushIssue('selection-state-roots-exception', 'error', 'Selected-element state-root lookup threw an exception.', {
        error: e6 && e6.message ? String(e6.message) : String(e6)
      });
    }

    try {
      refreshHooks = this._getBuilderRefreshHooks();
    } catch (e7) {
      pushIssue('builder-refresh-hooks-exception', 'warning', 'Builder refresh-hook lookup threw an exception.', {
        error: e7 && e7.message ? String(e7.message) : String(e7)
      });
    }

    try {
      uiTouchTargets = this._getBuilderUiTouchTargets();
    } catch (e8) {
      pushIssue('ui-touch-targets-exception', 'warning', 'Builder UI-touch target lookup threw an exception.', {
        error: e8 && e8.message ? String(e8.message) : String(e8)
      });
    }

    try {
      activeCompat = this._getActiveClassUiCompatibility();
    } catch (e9) {
      pushIssue('active-class-ui-exception', 'warning', 'Active-class UI compatibility lookup threw an exception.', {
        error: e9 && e9.message ? String(e9.message) : String(e9)
      });
    }

    try {
      selection = this.getSelectionContext();
    } catch (e10) {
      pushIssue('selection-context-exception', 'warning', 'Selection-context lookup threw an exception.', {
        error: e10 && e10.message ? String(e10.message) : String(e10)
      });
    }

    if (selection && selection.mode === 'element' && selection.id) {
      try {
        selectedModel = this.getElementModelById(selection.id);
      } catch (e11) {
        pushIssue('selection-model-exception', 'warning', 'Selected-element model lookup threw an exception.', {
          error: e11 && e11.message ? String(e11.message) : String(e11)
        });
      }
    }

    if (includeStores) {
      try {
        globalStores = this._collectGlobalClassStores();
      } catch (e12) {
        pushIssue('global-class-stores-exception', 'warning', 'Global-class store scan threw an exception.', {
          error: e12 && e12.message ? String(e12.message) : String(e12)
        });
      }

      try {
        pageStores = this._getPageSettingsStores();
      } catch (e13) {
        pushIssue('page-settings-stores-exception', 'warning', 'Page-settings store scan threw an exception.', {
          error: e13 && e13.message ? String(e13.message) : String(e13)
        });
      }
    }

    if (!builderRoot) {
      pushIssue('builder-root-missing', 'error', 'Builder canvas root could not be resolved from the active iframe.');
    }

    if (!appRoot || !appRoot.__vue_app__) {
      pushIssue('builder-app-root-missing', 'warning', 'Builder Vue app root was not resolved with a live __vue_app__ handle.');
    }

    if (!admin) {
      pushIssue('admin-surface-missing', 'warning', 'Builder admin wrapper was not resolved through ADMINBRXC or Vue global props.');
    }

    if (!vueState) {
      pushIssue('vue-state-missing', 'error', 'Builder Vue state was not resolved.');
    }

    if (!selectionRoots.length) {
      pushIssue('selection-state-roots-missing', 'error', 'No selected-element state roots were discovered.');
    }

    if (!refreshHooks || !refreshHooks.saveChanges) {
      pushIssue('save-changes-hook-missing', 'warning', 'No builder saveChanges hook was discovered.');
    }

    if (!refreshHooks || !refreshHooks.renderElement) {
      pushIssue('render-element-hook-missing', 'warning', 'No builder renderElement hook was discovered.');
    }

    if (!refreshHooks || !refreshHooks.generateCss) {
      pushIssue('generate-css-hook-missing', 'warning', 'No builder generateCss hook was discovered.');
    }

    if (!uiTouchTargets.length) {
      pushIssue('ui-touch-targets-missing', 'warning', 'No builder UI-touch targets were discovered for rerender/timestamp nudges.');
    }

    var activeClassOwnerCount = activeCompat && Array.isArray(activeCompat.activeClassOwners)
      ? activeCompat.activeClassOwners.length
      : 0;
    var classModeOwnerCount = activeCompat && Array.isArray(activeCompat.classModeOwners)
      ? activeCompat.classModeOwners.length
      : 0;
    var activeClassUiOk = !!(
      (activeCompat && activeCompat.activeClassState) ||
      (activeCompat && activeCompat.isClassActiveHook) ||
      activeClassOwnerCount > 0
    );
    if (!activeClassUiOk) {
      pushIssue('active-class-ui-missing', 'warning', 'No active-class UI compatibility seam was discovered.');
    }

    if (selection && selection.mode === 'element') {
      if (!selection.element) {
        pushIssue('selected-element-dom-missing', 'warning', 'The current selected-element context does not resolve to a live DOM node.');
      }
      if (!selectedModel) {
        pushIssue('selected-element-model-missing', 'warning', 'The current selected-element context does not resolve to a live element model.');
      }
    }

    if (includeStores && !globalStores.length) {
      pushIssue('global-class-store-missing', 'warning', 'No writable global-class registry store was discovered.');
    }

    if (includeStores && !pageStores.length) {
      pushIssue('page-settings-store-missing', 'warning', 'No pageSettings.customCss store was discovered.');
    }

    var status = deriveStatus(issues);
    var summary = issues.length
      ? issues.map(function (issue) { return String(issue.message || ''); }).filter(Boolean).join(' | ')
      : 'Builder compatibility seams resolved successfully.';

    return {
      title: 'Bricks Builder Compatibility v1',
      status: status,
      summary: summary,
      builderReady: true,
      includeStores: includeStores,
      identity: identity,
      issues: issues,
      capabilities: {
        iframeDocument: {
          ok: true
        },
        builderRoot: {
          ok: !!builderRoot
        },
        builderAppRoot: {
          ok: !!(appRoot && appRoot.__vue_app__),
          hasVueApp: !!(appRoot && appRoot.__vue_app__)
        },
        adminSurface: {
          ok: !!admin,
          source: inferAdminSource(admin, vueProps)
        },
        vueState: {
          ok: !!vueState,
          source: inferVueStateSource(admin, appRoot)
        },
        selectionRoots: {
          ok: selectionRoots.length > 0,
          count: selectionRoots.length,
          paths: uniquePaths(selectionRoots)
        },
        refreshHooks: {
          saveChanges: {
            ok: !!(refreshHooks && refreshHooks.saveChanges),
            path: refreshHooks && refreshHooks.saveChanges ? String(refreshHooks.saveChanges.path || '') : ''
          },
          renderElement: {
            ok: !!(refreshHooks && refreshHooks.renderElement),
            path: refreshHooks && refreshHooks.renderElement ? String(refreshHooks.renderElement.path || '') : ''
          },
          generateCss: {
            ok: !!(refreshHooks && refreshHooks.generateCss),
            path: refreshHooks && refreshHooks.generateCss ? String(refreshHooks.generateCss.path || '') : ''
          }
        },
        uiTouchTargets: {
          ok: uiTouchTargets.length > 0,
          count: uiTouchTargets.length,
          paths: uniquePaths(uiTouchTargets)
        },
        activeClassUi: {
          ok: activeClassUiOk,
          activeClassOwnerCount: activeClassOwnerCount,
          classModeOwnerCount: classModeOwnerCount,
          activeClassStatePath: makePath(activeCompat && activeCompat.activeClassState),
          activeObjectStatePath: makePath(activeCompat && activeCompat.activeObjectState),
          activeElementStatePath: makePath(activeCompat && activeCompat.activeElementState),
          isClassActivePath: activeCompat && activeCompat.isClassActiveHook
            ? String(activeCompat.isClassActiveHook.path || '')
            : ''
        },
        selection: {
          mode: selection && selection.mode ? String(selection.mode) : '',
          id: selection && selection.id ? String(selection.id) : '',
          domFound: !!(selection && selection.element),
          modelFound: !!selectedModel
        },
        globalClassStores: {
          scanned: includeStores,
          ok: includeStores ? globalStores.length > 0 : null,
          count: globalStores.length,
          paths: includeStores ? uniquePaths(globalStores) : []
        },
        pageSettingsStores: {
          scanned: includeStores,
          ok: includeStores ? pageStores.length > 0 : null,
          count: pageStores.length,
          paths: includeStores ? uniquePaths(pageStores) : []
        },
        builderIdentity: identity
      }
    };
  };

  BricksAPI.prototype._isSelectedElementClassModeActive = function (roots, admin) {
    roots = Array.isArray(roots) ? roots : this._getSelectedElementStateRoots();
    admin = admin || this.getAdmin();
    var compat = null;

    try {
      compat = this._getActiveClassUiCompatibility();
    } catch (eCompat) { _warn("_isSelectedElementClassModeActive", eCompat); }

    for (var i = 0; i < roots.length; i++) {
      var owner = roots[i] && roots[i].root;
      if (!owner || typeof owner !== 'object') continue;

      if (typeof owner.isClassActive !== 'undefined') {
        if (owner.isClassActive) return true;
        continue;
      }

      try {
        if (owner.activeClass != null && owner.activeObject != null && owner.activeClass === owner.activeObject) {
          return true;
        }
      } catch (e0) { _warn("_isSelectedElementClassModeActive", e0); }
    }

    try {
      var hook = compat && compat.isClassActiveHook;
      if (!hook && admin && admin.helpers && typeof admin.helpers.isClassActive === 'function') {
        hook = {
          fn: admin.helpers.isClassActive,
          owner: admin.helpers,
          path: 'admin.helpers.isClassActive'
        };
      }
      if (hook && typeof hook.fn === 'function') {
        return !!hook.fn.call(hook.owner);
      }
    } catch (e1) { _warn("_isSelectedElementClassModeActive", e1); }

    return false;
  };

  BricksAPI.prototype._extractSelectedElementIdFromValue = function (value, opts) {
    opts = opts || {};

    if (typeof value === 'string' || typeof value === 'number') {
      return String(value || '').trim();
    }
    if (!value || typeof value !== 'object') return '';

    var hasElementSignals = !!(
      (value.settings && typeof value.settings === 'object') ||
      Array.isArray(value.children) ||
      hasOwn(value, 'parent') ||
      hasOwn(value, 'type')
    );
    var hasClassSignals = !!(
      hasOwn(value, 'activeClass') ||
      hasOwn(value, 'selector') ||
      hasOwn(value, 'class') ||
      hasOwn(value, 'value')
    );
    if (!opts.allowClassLike && hasClassSignals && !hasElementSignals) return '';

    var idKeys = ['id', 'elementId', 'bricksId', 'nodeId', 'element_id'];
    for (var i = 0; i < idKeys.length; i++) {
      var key = idKeys[i];
      var candidate = '';
      try { candidate = String(value[key] || '').trim(); } catch (e) { candidate = ''; }
      if (candidate) return candidate;
    }

    return '';
  };

  BricksAPI.prototype._collectSelectedElementIdCandidates = function () {
    var admin = this.getAdmin();
    var roots = this._getSelectedElementStateRoots();
    var classModeActive = this._isSelectedElementClassModeActive(roots, admin);
    var out = [];
    var seen = [];
    var stringKeys = ['activeId', 'selectedId', 'selectedElementId', 'activeElementId', 'currentElementId'];
    var objectKeys = ['activeElement', 'selectedElement', 'currentElement'];
    var fallbackObjectKeys = classModeActive ? [] : ['activeObject', 'selectedObject'];
    var self = this;

    function pushCandidate(raw, source, opts) {
      var id = self._extractSelectedElementIdFromValue(raw, opts);
      if (!id || seen.indexOf(id) !== -1) return;
      seen.push(id);
      out.push({ id: id, source: String(source || '') });
    }

    for (var r = 0; r < roots.length; r++) {
      var entry = roots[r];
      var root = entry && entry.root;
      var path = entry && entry.path ? entry.path : '';
      if (!root || typeof root !== 'object') continue;

      for (var s = 0; s < stringKeys.length; s++) {
        var stringKey = stringKeys[s];
        try { pushCandidate(root[stringKey], path + '.' + stringKey, { allowClassLike: false }); } catch (e0) { _warn("_collectSelectedElementIdCandidates", e0); }
      }

      for (var o = 0; o < objectKeys.length; o++) {
        var objectKey = objectKeys[o];
        try { pushCandidate(root[objectKey], path + '.' + objectKey, { allowClassLike: false }); } catch (e1) { _warn("_collectSelectedElementIdCandidates", e1); }
      }

      for (var f = 0; f < fallbackObjectKeys.length; f++) {
        var fallbackKey = fallbackObjectKeys[f];
        try { pushCandidate(root[fallbackKey], path + '.' + fallbackKey, { allowClassLike: false }); } catch (e2) { _warn("_collectSelectedElementIdCandidates", e2); }
      }
    }

    return out;
  };

  BricksAPI.prototype.getSelectedElementId = function () {
    var candidates = this._collectSelectedElementIdCandidates();
    if (!candidates.length) return '';
    return String(candidates[0].id || '');
  };

  BricksAPI.prototype.getSelectedElementDom = function () {
    var id = this.getSelectedElementId();
    if (!id) return null;
    return this._queryElementDomById(id);
  };

  BricksAPI.prototype._normalizeScopeMode = function (mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === 'children' || mode === 'parent' || mode === 'page') return mode;
    return 'self';
  };

  BricksAPI.prototype.getParentBricksNode = function (node) {
    if (!node || !node.parentElement || !node.parentElement.closest) return null;
    return node.parentElement.closest(this._getBricksDomNodeSelector()) || null;
  };

  BricksAPI.prototype._extractChildIdsFromElementModel = function (model) {
    if (!model || !Array.isArray(model.children)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < model.children.length; i++) {
      var raw = model.children[i];
      var id = '';
      if (typeof raw === 'string' || typeof raw === 'number') {
        id = String(raw || '');
      } else if (raw && typeof raw === 'object') {
        id = String(raw.id || raw.elementId || raw.value || '');
      }
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  };

  BricksAPI.prototype.getScopedChildrenNodes = function (root, opts) {
    root = root || this.getBuilderRoot();
    opts = opts || {};
    if (!root) return [];

    // Fast path: direct Bricks descendants from current canvas DOM.
    var direct = this.getTopLevelBricksNodes(root);
    if (direct.length) return direct;

    // Fallback: when runtime wrappers hide direct markers, resolve from model children IDs.
    var rootId = String(opts.rootId || '');
    var resolved = null;
    if (rootId) {
      var modelById = this.getElementModelById(rootId);
      if (modelById) {
        resolved = { id: rootId, model: modelById };
      }
    }
    if (!resolved || !resolved.model) {
      resolved = this.getElementModelByDom(root, { preferredId: rootId });
    }
    if (!resolved || !resolved.model) return [];

    var childIds = this._extractChildIdsFromElementModel(resolved.model);
    if (!childIds.length) return [];

    var selector = this._getBricksDomNodeSelector();
    var out = [];
    for (var i = 0; i < childIds.length; i++) {
      var childId = childIds[i];
      if (!childId) continue;
      var childEl = this._queryElementDomById(childId);
      if (!childEl) continue;
      if (root !== childEl && root.contains && !root.contains(childEl)) continue;
      if (!childEl.matches || !childEl.matches(selector)) {
        childEl = childEl.closest ? childEl.closest(selector) : null;
      }
      if (!childEl) continue;
      if (out.indexOf(childEl) !== -1) continue;
      out.push(childEl);
    }
    return out;
  };

  BricksAPI.prototype.getScopedSelectionContext = function (scopeMode) {
    var scope = this._normalizeScopeMode(scopeMode);
    var base = this.getSelectionContext();

    var pageCtx = {
      mode: 'page',
      scope: 'page',
      requestedScope: scope,
      id: '',
      tag: 'page',
      element: this.getBuilderRoot(),
      elements: this.getTopLevelBricksNodes(this.getBuilderRoot())
    };

    if (scope === 'page') return pageCtx;
    if (!base || base.mode !== 'element' || !base.element) return pageCtx;

    if (scope === 'parent') {
      var parentEl = this.getParentBricksNode(base.element);
      if (!parentEl) return pageCtx;
      var parentResolved = this.getElementModelByDom(parentEl, {
        preferredIds: this._getElementIdCandidatesFromDom(parentEl)
      });
      var parentId = String((parentResolved && parentResolved.id) || this._getElementIdCandidatesFromDom(parentEl)[0] || '');
      return {
        mode: 'element',
        scope: 'parent',
        requestedScope: scope,
        id: parentId,
        anchorId: String(base.id || ''),
        tag: (parentEl.tagName || '').toLowerCase(),
        element: parentEl,
        elements: [parentEl]
      };
    }

    if (scope === 'children') {
      var children = this.getScopedChildrenNodes(base.element, {
        rootId: String(base.id || '')
      });
      return {
        mode: 'element',
        scope: 'children',
        requestedScope: scope,
        id: String(base.id || ''),
        anchorId: String(base.id || ''),
        tag: (base.element.tagName || '').toLowerCase(),
        element: base.element,
        elements: children
      };
    }

    return {
      mode: 'element',
      scope: 'self',
      requestedScope: scope,
      id: String(base.id || ''),
      tag: (base.tag || (base.element && base.element.tagName ? base.element.tagName.toLowerCase() : '')),
      element: base.element,
      elements: [base.element]
    };
  };

  BricksAPI.prototype.getSelectionContext = function () {
    var el = this.getSelectedElementDom();
    var id = this.getSelectedElementId();
    if (el && id) {
      return {
        mode: 'element',
        scope: 'self',
        id: id,
        tag: (el.tagName || '').toLowerCase(),
        element: el,
        elements: [el]
      };
    }

    return {
      mode: 'page',
      scope: 'page',
      id: '',
      tag: 'page',
      element: this.getBuilderRoot(),
      elements: this.getTopLevelBricksNodes(this.getBuilderRoot())
    };
  };

  BricksAPI.prototype.getTopLevelBricksNodes = function (root) {
    root = root || this.getBuilderRoot();
    if (!root) return [];
    var selector = this._getBricksDomNodeSelector();
    var all = Array.prototype.slice.call(root.querySelectorAll(selector));
    return all.filter(function (node) {
      var parent = node.parentElement && node.parentElement.closest ? node.parentElement.closest(selector) : null;
      if (!parent) return true;
      // Keep nodes whose nearest Bricks ancestor is exactly the root (direct children in scoped mode).
      if (parent === root) return true;
      return !root.contains(parent);
    });
  };

  BricksAPI.prototype.manualRefresh = function (opts) {
    opts = opts || {};
    var errors = [];
    var reason = opts.reason || 'manual-refresh';
    var ctx = null;

    try {
      ctx = this.getSelectionContext();
    } catch (eCtx) {
      errors.push('selection-context:' + (eCtx && eCtx.message ? eCtx.message : String(eCtx || 'selection-context-failed')));
      var fallbackRoot = null;
      try {
        if (typeof this.getBuilderRoot === 'function') fallbackRoot = this.getBuilderRoot();
      } catch (eRoot) { _warn("manualRefresh", eRoot); }
      ctx = {
        mode: 'page',
        scope: 'page',
        id: '',
        tag: 'page',
        element: fallbackRoot || null,
        elements: []
      };
    }

    try {
      this._lastSelectionStateKey = this._getSelectionStatePollKey();
    } catch (ePoll) {
      errors.push('selection-poll:' + (ePoll && ePoll.message ? ePoll.message : String(ePoll || 'selection-poll-failed')));
    }

    try {
      this.emit('dom:changed', { reason: reason, selection: ctx });
    } catch (eDom) {
      errors.push('emit-dom:' + (eDom && eDom.message ? eDom.message : String(eDom || 'emit-dom-failed')));
    }

    if (opts.includeSelection !== false) {
      try {
        this.emit('selection:changed', ctx);
      } catch (eSel) {
        errors.push('emit-selection:' + (eSel && eSel.message ? eSel.message : String(eSel || 'emit-selection-failed')));
      }
    }

    return {
      ok: errors.length === 0,
      selection: ctx,
      errors: errors
    };
  };

  BricksAPI.prototype._requestManualRefresh = function (opts) {
    opts = opts || {};
    var report = null;
    try {
      report = this.manualRefresh(opts);
      if (!report || typeof report !== 'object') {
        var invalidPrimaryType = report === null ? 'null' : typeof report;
        report = {
          ok: false,
          errors: ['manual-refresh:invalid-report-shape:' + invalidPrimaryType]
        };
      }
    } catch (eManual) {
      var manualReason = this._normalizeManualRefreshThrowReason(eManual, 'manual-refresh-failed');
      report = {
        ok: false,
        errors: ['manual-refresh:' + manualReason]
      };
    }
    var finalFailed = false;
    if (report && typeof this.isManualRefreshFinalFailure === 'function') {
      try { finalFailed = !!this.isManualRefreshFinalFailure(report); } catch (eFinal) { _warn("_requestManualRefresh", eFinal); }
    } else {
      finalFailed = !!(report && report.ok === false && !(report.retry && report.retry.ok === true));
    }
    if (!report || !finalFailed) return report;

    try { this._touchBuilderUi(); } catch (eTouch) { _warn("_requestManualRefresh", eTouch); }

    var retryOpts = {};
    for (var key in opts) {
      if (hasOwn(opts, key)) retryOpts[key] = opts[key];
    }
    retryOpts.includeSelection = false;
    var baseReason = String(opts.reason || 'manual-refresh');
    retryOpts.reason = baseReason + '-retry';
    try {
      report.retry = this.manualRefresh(retryOpts);
      if (!report.retry || typeof report.retry !== 'object') {
        var invalidRetryType = report.retry === null ? 'null' : typeof report.retry;
        report.retry = {
          ok: false,
          errors: ['manual-refresh-retry:invalid-report-shape:' + invalidRetryType]
        };
      }
    } catch (eRetry) {
      var retryReason = this._normalizeManualRefreshThrowReason(eRetry, 'manual-refresh-retry-failed');
      report.retry = {
        ok: false,
        errors: ['manual-refresh-retry:' + retryReason]
      };
    }
    return report;
  };

  BricksAPI.prototype.requestManualRefresh = function (opts) {
    return this._requestManualRefresh(opts || {});
  };

  BricksAPI.prototype.getManualRefreshFn = function () {
    if (typeof this.requestManualRefresh === 'function') return this.requestManualRefresh;
    if (typeof this._requestManualRefresh === 'function') return this._requestManualRefresh;
    if (typeof this.manualRefresh === 'function') return this.manualRefresh;
    return null;
  };

  BricksAPI.prototype.hasManualRefreshSupport = function () {
    if (typeof this.getManualRefreshOutcome === 'function') return true;
    return typeof this.getManualRefreshFn === 'function' && !!this.getManualRefreshFn();
  };

  BricksAPI.prototype._normalizeManualRefreshThrowReason = function (errorLike, fallback) {
    fallback = String(fallback == null ? '' : fallback).trim();
    if (!fallback) fallback = 'manual-refresh-failed';
    var reason = '';
    if (errorLike && typeof errorLike === 'object' && hasOwn(errorLike, 'message')) {
      reason = String(errorLike.message == null ? '' : errorLike.message);
    }
    if (!reason) reason = String(errorLike == null ? '' : errorLike);
    reason = String(reason == null ? '' : reason).trim();
    if (!reason || reason === '[object Object]' || /^[A-Za-z]*Error$/.test(reason)) reason = fallback;
    return reason;
  };

  BricksAPI.prototype._manualRefreshErrorMessages = function (errors) {
    var out = [];
    var visited = [];
    var hasOwnLocal = Object.prototype.hasOwnProperty;

    function wasVisited(obj) {
      for (var i = 0; i < visited.length; i++) {
        if (visited[i] === obj) return true;
      }
      return false;
    }

    function pushString(value) {
      var msg = String(value == null ? '' : value).trim();
      if (msg) out.push(msg);
    }

    function visit(value) {
      if (value == null) return;

      var valueType = typeof value;
      if (valueType === 'string' || valueType === 'number') {
        pushString(value);
        return;
      }
      if (valueType !== 'object') return;

      if (wasVisited(value)) return;
      visited.push(value);

      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) visit(value[i]);
        return;
      }

      var directKeys = ['message', 'error', 'reason'];
      for (var dk = 0; dk < directKeys.length; dk++) {
        var directKey = directKeys[dk];
        if (!hasOwnLocal.call(value, directKey)) continue;
        var beforeDirect = out.length;
        visit(value[directKey]);
        if (out.length > beforeDirect) return;
      }

      var nestedKeys = ['errors', 'details', 'detail', 'cause'];
      for (var nk = 0; nk < nestedKeys.length; nk++) {
        var nestedKey = nestedKeys[nk];
        if (!hasOwnLocal.call(value, nestedKey)) continue;
        var beforeNested = out.length;
        visit(value[nestedKey]);
        if (out.length > beforeNested) return;
      }

      if (typeof value.toString === 'function') {
        var raw = String(value).trim();
        if (raw && raw !== '[object Object]') out.push(raw);
      }
    }

    visit(errors);
    return out;
  };

  BricksAPI.prototype._manualRefreshReportErrorMessages = function (reportLike) {
    if (!reportLike || typeof reportLike !== 'object') return [];
    var hasOwnLocal = Object.prototype.hasOwnProperty;
    var out = [];
    if (hasOwnLocal.call(reportLike, 'errors')) out = out.concat(this._manualRefreshErrorMessages(reportLike.errors));
    if (hasOwnLocal.call(reportLike, 'error')) out = out.concat(this._manualRefreshErrorMessages(reportLike.error));
    if (hasOwnLocal.call(reportLike, 'reason')) out = out.concat(this._manualRefreshErrorMessages(reportLike.reason));
    return out;
  };

  BricksAPI.prototype._isManualRefreshReportFailure = function (reportLike) {
    if (!reportLike || typeof reportLike !== 'object') return false;
    if (reportLike.ok === true) return false;
    if (reportLike.ok === false) return true;
    return this._manualRefreshReportErrorMessages(reportLike).length > 0;
  };

  BricksAPI.prototype._hasManualRefreshErrorPrefix = function (errors, prefix) {
    if (!prefix) return false;
    var list = this._manualRefreshErrorMessages(errors);
    for (var i = 0; i < list.length; i++) {
      var msg = String(list[i] == null ? '' : list[i]).trim();
      if (msg.indexOf(prefix) === 0) return true;
    }
    return false;
  };

  BricksAPI.prototype.isManualRefreshFinalFailure = function (report) {
    if (!this._isManualRefreshReportFailure(report)) return false;
    if (report && report.retry && report.retry.ok === true) return false;
    return true;
  };

  BricksAPI.prototype.isManualRefreshHardFailure = function (report) {
    if (!report) return false;
    if (this._hasManualRefreshErrorPrefix(this._manualRefreshReportErrorMessages(report), 'manual-refresh:')) return true;
    if (report.retry && this._hasManualRefreshErrorPrefix(this._manualRefreshReportErrorMessages(report.retry), 'manual-refresh-retry:')) return true;
    return false;
  };

  BricksAPI.prototype.getManualRefreshErrorReason = function (report, fallback) {
    var self = this;

    function toReportMessages(reportLike) {
      if (self && typeof self._manualRefreshReportErrorMessages === 'function') {
        return self._manualRefreshReportErrorMessages(reportLike);
      }
      if (!reportLike || typeof reportLike !== 'object') return [];
      if (Object.prototype.hasOwnProperty.call(reportLike, 'errors')) return self._manualRefreshErrorMessages(reportLike.errors);
      if (Object.prototype.hasOwnProperty.call(reportLike, 'error')) return self._manualRefreshErrorMessages(reportLike.error);
      if (Object.prototype.hasOwnProperty.call(reportLike, 'reason')) return self._manualRefreshErrorMessages(reportLike.reason);
      return [];
    }

    function firstHardFailureError(reportLike, onlyPrefix) {
      var list = toReportMessages(reportLike);
      for (var i = 0; i < list.length; i++) {
        var msg = String(list[i] == null ? '' : list[i]).trim();
        if (!msg) continue;
        if (onlyPrefix) {
          if (msg.indexOf(onlyPrefix) === 0) return msg;
          continue;
        }
        if (msg.indexOf('manual-refresh:') === 0 || msg.indexOf('manual-refresh-retry:') === 0) return msg;
      }
      return '';
    }

    function firstNonEmptyError(reportLike) {
      var list = toReportMessages(reportLike);
      for (var i = 0; i < list.length; i++) {
        var msg = String(list[i] == null ? '' : list[i]).trim();
        if (msg) return msg;
      }
      return '';
    }

    fallback = String(fallback == null ? '' : fallback).trim();
    if (!fallback) fallback = 'manual-refresh-failed';
    if (report) {
      var retryReport = (report.retry && report.retry.ok !== true) ? report.retry : null;
      var retryHard = retryReport ? firstHardFailureError(retryReport, 'manual-refresh-retry:') : '';
      if (retryHard) return retryHard;
      var retryHardGeneric = retryReport ? firstHardFailureError(retryReport) : '';
      if (retryHardGeneric) return retryHardGeneric;
      var primaryHard = firstHardFailureError(report, 'manual-refresh:');
      if (primaryHard) return primaryHard;
      var primary = firstNonEmptyError(report);
      if (primary) return primary;
      var retry = retryReport ? firstNonEmptyError(retryReport) : '';
      if (retry) return retry;
    }
    return fallback;
  };

  BricksAPI.prototype._manualRefreshShapeTag = function (value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  BricksAPI.prototype._isManualRefreshReportLike = function (value) {
    if (!value || typeof value !== 'object') return false;
    return hasOwn(value, 'ok')
      || hasOwn(value, 'errors')
      || hasOwn(value, 'error')
      || hasOwn(value, 'reason')
      || hasOwn(value, 'retry');
  };

  BricksAPI.prototype._extractManualRefreshReportShape = function (value) {
    if (!value || typeof value !== 'object') return null;
    var out = {};
    var found = false;
    if (hasOwn(value, 'ok')) {
      out.ok = value.ok;
      found = true;
    }
    if (hasOwn(value, 'errors')) {
      out.errors = value.errors;
      found = true;
    }
    if (hasOwn(value, 'error')) {
      out.error = value.error;
      found = true;
    }
    if (hasOwn(value, 'reason')) {
      out.reason = value.reason;
      found = true;
    }
    if (hasOwn(value, 'retry')) {
      out.retry = value.retry;
      found = true;
    }
    return found ? out : null;
  };

  BricksAPI.prototype._isManualRefreshOutcomeLike = function (value) {
    if (!value || typeof value !== 'object') return false;
    return hasOwn(value, 'attempted')
      || hasOwn(value, 'report')
      || hasOwn(value, 'finalFailed')
      || hasOwn(value, 'retryRecovered')
      || hasOwn(value, 'hardFailure')
      || hasOwn(value, 'failureKind')
      || hasOwn(value, 'failureReason');
  };

  BricksAPI.prototype._normalizeManualRefreshOutcome = function (outcome) {
    var normalized = {
      attempted: false,
      report: null,
      finalFailed: false,
      retryRecovered: false,
      hardFailure: false,
      failureKind: '',
      failureReason: ''
    };
    if (!outcome || typeof outcome !== 'object') return normalized;
    var looksLikeOutcome = this._isManualRefreshOutcomeLike(outcome);
    var reportShape = this._extractManualRefreshReportShape(outcome);
    var looksLikeReport = !!reportShape;
    if (!looksLikeOutcome && looksLikeReport) {
      outcome = {
        attempted: true,
        report: reportShape
      };
    } else if (looksLikeOutcome && reportShape && (!hasOwn(outcome, 'report') || outcome.report == null)) {
      var mergedOutcome = {};
      for (var key in outcome) {
        if (hasOwn(outcome, key)) mergedOutcome[key] = outcome[key];
      }
      mergedOutcome.report = reportShape;
      outcome = mergedOutcome;
    }
    if (hasOwn(outcome, 'report') && outcome.report !== null) {
      var isReportObject = typeof outcome.report === 'object';
      var isReportLike = isReportObject && this._isManualRefreshReportLike(outcome.report);
      if (!isReportLike) {
        var recoveredReportShape = reportShape;
        if (recoveredReportShape && this._isManualRefreshReportLike(recoveredReportShape)) {
          var recoveredOutcome = {};
          for (var recoveredKey in outcome) {
            if (hasOwn(outcome, recoveredKey)) recoveredOutcome[recoveredKey] = outcome[recoveredKey];
          }
          recoveredOutcome.report = recoveredReportShape;
          outcome = recoveredOutcome;
        } else {
          var invalidOutcomeReportShape = this._manualRefreshShapeTag(outcome.report);
          var invalidOutcomeReportReason = 'manual-refresh:invalid-outcome-report-shape:' + invalidOutcomeReportShape;
          outcome = {
            attempted: true,
            report: { ok: false, errors: [invalidOutcomeReportReason] },
            finalFailed: true,
            retryRecovered: false,
            hardFailure: true,
            failureKind: 'hard',
            failureReason: invalidOutcomeReportReason
          };
        }
      }
    }

    var report = outcome.report || null;
    if (report && typeof report === 'object' && hasOwn(report, 'retry')) {
      var retryReport = report.retry;
      var retryIsObject = !!retryReport && typeof retryReport === 'object';
      var retryIsReportLike = retryIsObject && this._isManualRefreshReportLike(retryReport);
      if (!retryIsReportLike) {
        var invalidRetryShape = this._manualRefreshShapeTag(retryReport);
        var invalidRetryReason = 'manual-refresh-retry:invalid-report-shape:' + invalidRetryShape;
        var normalizedReport = {};
        for (var reportKey in report) {
          if (hasOwn(report, reportKey)) normalizedReport[reportKey] = report[reportKey];
        }
        normalizedReport.retry = {
          ok: false,
          errors: [invalidRetryReason]
        };
        normalizedReport.ok = false;
        report = normalizedReport;
      }
    }
    if (report && typeof report === 'object' && report.ok === true) {
      var reportMessages = this._manualRefreshReportErrorMessages(report);
      if (reportMessages.length > 0) {
        var failClosedReport = {};
        for (var failClosedKey in report) {
          if (hasOwn(report, failClosedKey)) failClosedReport[failClosedKey] = report[failClosedKey];
        }
        failClosedReport.ok = false;
        report = failClosedReport;
      }
    }
    if (report && typeof report === 'object' && report.ok === true && report.retry && typeof report.retry === 'object') {
      var retryFailure = this._isManualRefreshReportFailure(report.retry);
      if (retryFailure) {
        var retryFailClosedReport = {};
        for (var retryFailClosedKey in report) {
          if (hasOwn(report, retryFailClosedKey)) retryFailClosedReport[retryFailClosedKey] = report[retryFailClosedKey];
        }
        retryFailClosedReport.ok = false;
        report = retryFailClosedReport;
      }
    }
    var attempted = !!outcome.attempted || !!report;
    var reportRetryRecovered = !!(report && report.retry && report.retry.ok === true && this._isManualRefreshReportFailure(report));
    var retryRecovered = !!outcome.retryRecovered;
    if (!retryRecovered && reportRetryRecovered) {
      retryRecovered = true;
    }
    if (retryRecovered && report && !reportRetryRecovered) {
      retryRecovered = false;
    }
    var hasExplicitFinalFailed = typeof outcome.finalFailed === 'boolean';
    var reportFinalFailed = report ? this.isManualRefreshFinalFailure(report) : false;
    var finalFailed = report
      ? reportFinalFailed
      : (hasExplicitFinalFailed ? outcome.finalFailed : false);
    if (retryRecovered && finalFailed) {
      finalFailed = false;
    }
    if (!attempted && (finalFailed || retryRecovered)) {
      attempted = true;
    }
    var hardFailure = false;
    if (finalFailed) {
      var reportHardFailure = report ? this.isManualRefreshHardFailure(report) : false;
      if (report) {
        hardFailure = reportHardFailure;
      } else {
        hardFailure = typeof outcome.hardFailure === 'boolean'
          ? outcome.hardFailure
          : reportHardFailure;
      }
    }
    var failureReason = String(outcome.failureReason == null ? '' : outcome.failureReason).trim();
    if ((finalFailed || retryRecovered) && !failureReason) {
      failureReason = this.getManualRefreshErrorReason(report, finalFailed ? 'manual-refresh-failed' : 'manual-refresh-recovered');
    } else if (!finalFailed && !retryRecovered) {
      failureReason = '';
    }
    var failureKind = String(outcome.failureKind == null ? '' : outcome.failureKind).trim();
    if (failureKind && failureKind !== 'hard' && failureKind !== 'report') {
      failureKind = '';
    }
    if (finalFailed) {
      var expectedKind = hardFailure ? 'hard' : 'report';
      if (failureKind !== expectedKind) {
        failureKind = expectedKind;
      }
    } else {
      failureKind = '';
    }

    normalized.attempted = attempted;
    normalized.report = report;
    normalized.finalFailed = finalFailed;
    normalized.retryRecovered = retryRecovered;
    normalized.hardFailure = hardFailure;
    normalized.failureKind = failureKind;
    normalized.failureReason = failureReason;
    return normalized;
  };

  BricksAPI.prototype.normalizeManualRefreshOutcome = function (outcome) {
    return this._normalizeManualRefreshOutcome(outcome);
  };

  BricksAPI.prototype.formatManualRefreshDiagSuffix = function (outcome) {
    outcome = this._normalizeManualRefreshOutcome(outcome || {});
    if (outcome.finalFailed) {
      var kind = outcome.failureKind || (outcome.hardFailure ? 'hard' : 'report') || 'report';
      var reason = String(outcome.failureReason || this.getManualRefreshErrorReason(outcome.report, 'manual-refresh-failed'));
      return ' · refresh final-fail (' + kind + '): ' + reason;
    }
    if (outcome.retryRecovered) {
      var retryReason = String(outcome.failureReason || this.getManualRefreshErrorReason(outcome.report, 'manual-refresh-recovered'));
      return ' · refresh retry recovered: ' + retryReason;
    }
    return '';
  };

  BricksAPI.prototype.getManualRefreshOutcome = function (opts) {
    opts = opts || {};
    var fn = (typeof this.getManualRefreshFn === 'function') ? this.getManualRefreshFn() : null;
    if (!fn) {
      if (typeof this.requestManualRefresh === 'function') fn = this.requestManualRefresh;
      else if (typeof this._requestManualRefresh === 'function') fn = this._requestManualRefresh;
      else if (typeof this.manualRefresh === 'function') fn = this.manualRefresh;
    }

    if (!fn) return this._normalizeManualRefreshOutcome({});

    var raw = null;
    try {
      raw = fn.call(this, opts);
    } catch (eRefresh) {
      var reason = this._normalizeManualRefreshThrowReason(eRefresh, 'manual-refresh-failed');
      return this._normalizeManualRefreshOutcome({
        attempted: true,
        report: { ok: false, errors: ['manual-refresh:' + reason] },
        finalFailed: true,
        retryRecovered: false,
        hardFailure: true,
        failureKind: 'hard',
        failureReason: reason
      });
    }

    if (this._isManualRefreshOutcomeLike(raw)) {
      return this._normalizeManualRefreshOutcome(raw);
    }

    var looksLikeReport = this._isManualRefreshReportLike(raw);
    if (looksLikeReport) {
      return this._normalizeManualRefreshOutcome(raw);
    }

    var invalidShape = this._manualRefreshShapeTag(raw);
    var invalidReason = 'manual-refresh:invalid-report-shape:' + invalidShape;
    return this._normalizeManualRefreshOutcome({
      attempted: true,
      report: { ok: false, errors: [invalidReason] },
      finalFailed: true,
      retryRecovered: false,
      hardFailure: true,
      failureKind: 'hard',
      failureReason: invalidReason
    });
  };

  BricksAPI.prototype.selectElementInBuilder = function (id) {
    if (!id) return false;
    var target = this._resolveBuilderStructureSelectionTarget(id);
    if (!target) return false;
    try { target.click(); return true; } catch (e) { _warn("selectElementInBuilder", e); }
    return false;
  };

  BricksAPI.prototype._getBuilderStructureRoots = function () {
    var docRef = document;
    if (!docRef) return [];

    var roots = [];
    var seen = [];

    function push(node) {
      if (!node || seen.indexOf(node) !== -1) return;
      seen.push(node);
      roots.push(node);
    }

    var selectors = [
      '#bricks-structure',
      '#bricks-panel',
      '[data-panel="structure"]',
      '[data-builder-panel="structure"]',
      '[data-builder-view="structure"]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try { push(docRef.querySelector(selectors[i])); } catch (e0) { _warn("_getBuilderStructureRoots", e0); }
    }

    try { push(docRef.body); } catch (e1) { _warn("_getBuilderStructureRoots", e1); }
    return roots;
  };

  BricksAPI.prototype._resolveBuilderStructureSelectionTarget = function (id) {
    id = String(id || '').trim();
    if (!id) return null;

    var docRef = document;
    if (!docRef) return null;

    var escaped = id;
    var hasCssEscape = typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function';
    var safeId = hasCssEscape ? CSS.escape(escaped) : escaped.replace(/"/g, '\\"');

    var selectors = [
      '#bricks-structure .structure-item[data-id="' + safeId + '"]',
      '#bricks-structure [data-id="' + safeId + '"]',
      '#bricks-structure .structure-item[data-script-id="' + safeId + '"]',
      '#bricks-structure [data-script-id="' + safeId + '"]',
      '#bricks-panel .structure-item[data-id="' + safeId + '"]',
      '#bricks-panel [data-id="' + safeId + '"]',
      '#bricks-panel .structure-item[data-script-id="' + safeId + '"]',
      '#bricks-panel [data-script-id="' + safeId + '"]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var hit = docRef.querySelector(selectors[i]);
        if (hit) return hit;
      } catch (e0) { _warn("_resolveBuilderStructureSelectionTarget", e0); }
    }

    var attrs = this._getBricksElementIdAttributeNames();
    var roots = this._getBuilderStructureRoots();
    var best = null;

    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root || typeof root.querySelector !== 'function') continue;

      for (var a = 0; a < attrs.length; a++) {
        var attr = attrs[a];
        var selector = '[' + attr + '="' + safeId + '"]';
        var node = null;
        try { node = root.querySelector(selector); } catch (e1) { node = null; }
        if (!node) continue;

        var clickable = node;
        try {
          if (clickable.closest) {
            clickable = clickable.closest('.structure-item, [role="treeitem"], [draggable="true"], button, a, [tabindex]') || clickable;
          }
        } catch (e2) { _warn("_resolveBuilderStructureSelectionTarget", e2); }

        if (!best) best = clickable;
        if (clickable && clickable !== node && clickable.classList && clickable.classList.contains('structure-item')) {
          return clickable;
        }
        if (clickable && clickable.getAttribute && String(clickable.getAttribute('role') || '').toLowerCase() === 'treeitem') {
          return clickable;
        }
      }
    }

    return best;
  };

  BricksAPI.prototype.getSelectedElementModel = function () {
    var id = this.getSelectedElementId();
    if (!id) return null;
    return this.getElementModelById(id);
  };

  BricksAPI.prototype._getElementModelSearchRoots = function () {
    var out = [];
    var seen = [];

    function push(root) {
      if (!root || (typeof root !== 'object' && typeof root !== 'function')) return;
      if (seen.indexOf(root) !== -1) return;
      seen.push(root);
      out.push(root);
    }

    var stateRoots = this._getElementStateRootEntries();
    for (var r = 0; r < stateRoots.length; r++) {
      push(stateRoots[r] && stateRoots[r].root);
    }

    var stores = this._collectElementStateStores();
    for (var i = 0; i < stores.length; i++) {
      push(stores[i] && stores[i].arr);
    }

    return out;
  };

  BricksAPI.prototype.getElementModelById = function (id) {
    id = String(id || '');
    if (!id) return null;
    var roots = this._getElementModelSearchRoots();
    for (var i = 0; i < roots.length; i++) {
      var model = this._findElementModelById(roots[i], id);
      if (model) return model;
    }
    return null;
  };

  BricksAPI.prototype.getSelectionAnalysis = function () {
    var ctx = this.getSelectionContext();
    if (!ctx || ctx.mode !== 'element') {
      return {
        mode: 'page',
        id: '',
        model: null,
        dom: ctx && ctx.element ? ctx.element : this.getBuilderRoot(),
        stateFound: false,
        signals: {},
        applyGate: { level: 'allow', reasons: [] },
        evidence: []
      };
    }
    return this.getElementAnalysisById(ctx.id, ctx.element);
  };

  BricksAPI.prototype.getElementAnalysisById = function (id, domEl) {
    id = String(id || '');
    var dom = domEl || (id ? this._queryElementDomById(id) : null);
    var model = id ? this.getElementModelById(id) : null;
    return this._buildElementAnalysis(id, model, dom);
  };

  BricksAPI.prototype._queryElementDomById = function (id) {
    var doc = this.getIframeDocument();
    if (!doc || !id) return null;
    var escaped = String(id).trim();
    if (!escaped) return null;
    var hasCssEscape = typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function';
    var safeId = hasCssEscape ? CSS.escape(escaped) : escaped.replace(/"/g, '\\"');
    var domId = 'brxe-' + escaped;
    var safeDomId = hasCssEscape ? CSS.escape(domId) : domId.replace(/"/g, '\\"');

    try {
      var directIdHit = doc.getElementById ? doc.getElementById(domId) : null;
      if (directIdHit) return directIdHit;
    } catch (e0) { _warn("_queryElementDomById", e0); }

    try {
      if (doc.querySelector) {
        directIdHit = doc.querySelector('#' + safeDomId);
        if (directIdHit) return directIdHit;
      }
    } catch (e1) { _warn("_queryElementDomById", e1); }

    var attrs = this._getBricksElementIdAttributeNames();

    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var selector = '[' + attr + '="' + safeId + '"]';
      try {
        var hit = doc.querySelector(selector);
        if (hit) return hit;
      } catch (e) {
        try {
          hit = doc.querySelector('[' + attr + '="' + escaped.replace(/"/g, '\\"') + '"]');
          if (hit) return hit;
        } catch (e2) { _warn("_queryElementDomById", e2); }
      }
    }

    var classSelectors = [
      '.brxe-' + safeId
    ];
    for (var j = 0; j < classSelectors.length; j++) {
      try {
        var classHit = doc.querySelector ? doc.querySelector(classSelectors[j]) : null;
        if (classHit) return classHit;
      } catch (e3) { _warn("_queryElementDomById", e3); }
    }

    return null;
  };

  BricksAPI.prototype._buildElementAnalysis = function (id, model, dom) {
    var signals = this._detectElementSignals(model, dom);
    var gate = this._deriveApplyGate(signals);

    return {
      mode: 'element',
      id: String(id || ''),
      model: model || null,
      dom: dom || null,
      stateFound: !!model,
      signals: signals.flags,
      signalLevels: signals.signalLevels,
      evidence: signals.evidence,
      matchedKeys: signals.matchedKeys,
      applyGate: gate
    };
  };

  BricksAPI.prototype._detectElementSignals = function (model, dom) {
    var out = {
      flags: {
        component: false,
        slot: false,
        variant: false,
        queryLoop: false,
        dynamicData: false,
        schema: false,
        wpml: false,
        conditions: false
      },
      signalLevels: {
        component: 0,
        slot: 0,
        variant: 0,
        queryLoop: 0,
        dynamicData: 0,
        schema: 0,
        wpml: 0,
        conditions: 0
      },
      signalSourceLevels: {},
      evidence: [],
      matchedKeys: []
    };

    var texts = [];
    var keyMatches = {};
    var signalSourceBuckets = ['stateKey', 'model', 'domClass', 'domAttr', 'text'];
    var signalKeys = Object.keys(out.flags || {});
    for (var si = 0; si < signalKeys.length; si++) {
      var signalKey = signalKeys[si];
      var sourceLevel = {};
      for (var sb = 0; sb < signalSourceBuckets.length; sb++) {
        sourceLevel[signalSourceBuckets[sb]] = 0;
      }
      out.signalSourceLevels[signalKey] = sourceLevel;
    }
    var looksLikeDynamicPlaceholder = function (value) {
      value = String(value || '');
      if (!value) return false;
      // Compact placeholder-like markers (avoid generic JSON/object braces false positives).
      if (/\{\{[^{}]{1,120}\}\}/.test(value)) return true;
      if (/\{[a-z0-9_:@.|-]{2,120}\}/i.test(value)) return true;
      if (/\{echo:[^{}]{1,240}\}/i.test(value)) return true;
      return false;
    };
    var looksLikeQueryLoopDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])(query|loop|queryloop|query-loop|query_loop|hasloop|has-loop|has_loop)(?=$|[-_:])/i.test(value);
    };
    var looksLikeQueryLoopStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])(query|queryloop|query-loop|query_loop|hasloop|has-loop|has_loop|loopquery|loop-query|loop_query)(?=$|[._:-])/i.test(value);
    };
    var looksLikeConditionDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])(condition|conditions|conditional)(?=$|[-_:])/i.test(value);
    };
    var looksLikeConditionStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])(condition|conditions|conditional)(?=$|[._:-])/i.test(value);
    };
    var looksLikeDynamicStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])(dynamic|dynamicdata|dynamic-data|dynamic_data)(?=$|[._:-])/i.test(value);
    };
    var looksLikeDynamicDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])(dynamic|dynamicdata|dynamic-data|dynamic_data)(?=$|[-_:])/i.test(value);
    };
    var looksLikeWpmlStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])wpml(?=$|[._:-])/i.test(value);
    };
    var looksLikeWpmlDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])wpml(?=$|[-_:])/i.test(value);
    };
    var looksLikeComponentDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])component(?=$|[-_:])/i.test(value);
    };
    var looksLikeSlotDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])slot(?=$|[-_:])/i.test(value);
    };
    var looksLikeVariantDomToken = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[-_:])variant(?=$|[-_:])/i.test(value);
    };
    var looksLikeComponentStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])component(?=$|[._:-])/i.test(value);
    };
    var looksLikeSlotStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])slot(?=$|[._:-])/i.test(value);
    };
    var looksLikeVariantStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])variant(?=$|[._:-])/i.test(value);
    };
    var looksLikeSchemaStateKey = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|[._:-])schema(?=$|[._:-])/i.test(value);
    };
    var looksLikeMetadataCarrierAttr = function (attrName) {
      attrName = String(attrName || '');
      if (!attrName) return false;
      return /^(data-|x-|ng-|v-)/i.test(attrName) || /(^|[-_:])(settings|config|meta|props|options|state|payload)(?=$|[-_:])/i.test(attrName);
    };
    var looksLikeStructuredQueryValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|["'{[(_:-])(queryLoop|query-loop|query_loop|hasLoop|has-loop|has_loop|query|loop)(?=$|["'}\])_:-])/i.test(value);
    };
    var looksLikeStructuredConditionValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|["'{[(_:-])(condition|conditions|conditional)(?=$|["'}\])_:-])/i.test(value);
    };
    var looksLikeStructuredWpmlValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|["'{[(_:-])wpml(?=$|["'}\])_:-])/i.test(value);
    };
    var looksLikeStructuredComponentValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|["'{[(_:-])component(?=$|["'}\])_:-])/i.test(value);
    };
    var looksLikeStructuredSlotValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|["'{[(_:-])slot(?=$|["'}\])_:-])/i.test(value);
    };
    var looksLikeStructuredVariantValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      return /(^|["'{[(_:-])variant(?=$|["'}\])_:-])/i.test(value);
    };
    var looksLikeStructuredSchemaValue = function (value) {
      value = String(value || '');
      if (!value) return false;
      if (/\bitem(scope|type|prop|id|ref)\s*=/i.test(value)) return true;
      if (/["']item(scope|type|prop|id|ref)["']\s*:/i.test(value)) return true;
      if (/<[^>]*\bitem(scope|type|prop|id|ref)\b/i.test(value)) return true;
      if (/["']@context["']\s*:\s*["'](?:https?:)?\/\/schema\.org(?:\/[a-z0-9_#:/.-]+)?["']/i.test(value)) return true;
      if (/\bschema\.org\/[a-z0-9][^\s"'<>)}\]]*/i.test(value)) return true;
      return false;
    };

    var normalizeSignalStrength = function (strength) {
      if (strength == null) return 2;
      if (strength === 'weak') return 1;
      if (strength === 'strong') return 2;
      var n = Number(strength);
      if (!isFinite(n)) return 2;
      if (n <= 0) return 0;
      if (n < 2) return 1;
      return 2;
    };

    var mark = function (flag, why, strength, source) {
      if (hasOwn(out.flags, flag)) out.flags[flag] = true;
      var level = normalizeSignalStrength(strength);
      if (hasOwn(out.signalLevels, flag)) {
        if (out.signalLevels[flag] < level) out.signalLevels[flag] = level;
      }
      if (source && hasOwn(out.signalSourceLevels, flag)) {
        var sourceKey = String(source || '');
        var sourceLevelMap = out.signalSourceLevels[flag];
        if (hasOwn(sourceLevelMap, sourceKey) && sourceLevelMap[sourceKey] < level) {
          sourceLevelMap[sourceKey] = level;
        }
      }
      if (why) out.evidence.push(why);
    };

    var collectKeysAndText = function (obj, path, depth) {
      if (!obj || depth > 3) return;
      if (Array.isArray(obj)) {
        for (var i = 0; i < Math.min(obj.length, 20); i++) {
          collectKeysAndText(obj[i], path + '[]', depth + 1);
        }
        return;
      }
      if (!isObject(obj)) {
        if (typeof obj === 'string' && obj.length) texts.push(String(obj));
        return;
      }

      var keys = [];
      try { keys = Object.keys(obj); } catch (e) { keys = []; }
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var fullKey = path ? (path + '.' + key) : key;
        if (
          looksLikeComponentStateKey(key) ||
          looksLikeSlotStateKey(key) ||
          looksLikeVariantStateKey(key) ||
          looksLikeSchemaStateKey(key) ||
          looksLikeQueryLoopStateKey(key) ||
          looksLikeDynamicStateKey(key) ||
          looksLikeConditionStateKey(key) ||
          looksLikeWpmlStateKey(key)
        ) {
          keyMatches[fullKey] = true;
        }
        var value;
        try { value = obj[key]; } catch (e2) { value = null; }
        if (typeof value === 'string' && value.length) texts.push(value);
        if (isObject(value) || Array.isArray(value)) collectKeysAndText(value, fullKey, depth + 1);
      }
    };

    if (model) {
      collectKeysAndText(model, 'model', 0);
      if (isObject(model.settings)) collectKeysAndText(model.settings, 'settings', 0);
    }

    out.matchedKeys = Object.keys(keyMatches).sort();

    for (var i = 0; i < out.matchedKeys.length; i++) {
      var mk = out.matchedKeys[i];
      if (looksLikeComponentStateKey(mk)) mark('component', 'state key: ' + mk, null, 'stateKey');
      if (looksLikeSlotStateKey(mk)) mark('slot', 'state key: ' + mk, null, 'stateKey');
      if (looksLikeVariantStateKey(mk)) mark('variant', 'state key: ' + mk, null, 'stateKey');
      if (looksLikeQueryLoopStateKey(mk)) mark('queryLoop', 'state key: ' + mk, 'weak', 'stateKey');
      if (looksLikeDynamicStateKey(mk)) mark('dynamicData', 'state key: ' + mk, 'weak', 'stateKey');
      if (looksLikeSchemaStateKey(mk)) mark('schema', 'state key: ' + mk, null, 'stateKey');
      if (looksLikeWpmlStateKey(mk)) mark('wpml', 'state key: ' + mk, 'weak', 'stateKey');
      if (looksLikeConditionStateKey(mk)) mark('conditions', 'state key: ' + mk, 'weak', 'stateKey');
    }

    if (model) {
      if (model.hasLoop || (model.settings && model.settings.hasLoop)) {
        mark('queryLoop', 'model.hasLoop', null, 'model');
      }
      if (model.query || (model.settings && model.settings.query)) {
        mark('queryLoop', 'model.query/settings.query', null, 'model');
      }
      if (model.settings && Array.isArray(model.settings._conditions) && model.settings._conditions.length) {
        mark('conditions', 'settings._conditions (' + model.settings._conditions.length + ')', null, 'model');
      }
      if (model.settings && typeof model.settings._cssCustom === 'string' && looksLikeStructuredSchemaValue(model.settings._cssCustom)) {
        mark('schema', 'settings._cssCustom mentions schema markers', null, 'model');
      }
      if (model.settings && Array.isArray(model.settings._attributes)) {
        for (i = 0; i < model.settings._attributes.length; i++) {
          var a = model.settings._attributes[i] || {};
          var n = String(a.name || '');
          var v = String(a.value || '');
          var hasWpmlSettingsAttrName = looksLikeWpmlDomToken(n);
          var hasStructuredWpmlSettingsAttrValue = looksLikeMetadataCarrierAttr(n) && looksLikeStructuredWpmlValue(v);
          var hasDynamicSettingsAttrName = looksLikeDynamicDomToken(n);
          if (/^item(scope|type|prop|id|ref)$/i.test(n) || looksLikeStructuredSchemaValue(v)) mark('schema', 'settings._attributes: ' + n, null, 'model');
          if (hasWpmlSettingsAttrName) mark('wpml', 'settings._attributes name: ' + n, 'weak', 'model');
          if (hasStructuredWpmlSettingsAttrValue) mark('wpml', 'settings._attributes value: ' + n, null, 'model');
          if (hasDynamicSettingsAttrName) mark('dynamicData', 'settings._attributes name: ' + n, 'weak', 'model');
          if (looksLikeDynamicPlaceholder(v)) mark('dynamicData', 'settings._attributes value: ' + n, null, 'model');
        }
      }
    }

    if (dom && dom.attributes) {
      var cls = Array.prototype.slice.call(dom.classList || []);
      for (i = 0; i < cls.length; i++) {
        var c = cls[i];
        if (!c) continue;
        if (looksLikeComponentDomToken(c)) mark('component', 'dom class: ' + c, null, 'domClass');
        if (looksLikeSlotDomToken(c)) mark('slot', 'dom class: ' + c, null, 'domClass');
        if (looksLikeVariantDomToken(c)) mark('variant', 'dom class: ' + c, null, 'domClass');
        if (looksLikeQueryLoopDomToken(c)) mark('queryLoop', 'dom class: ' + c, 'weak', 'domClass');
        if (looksLikeConditionDomToken(c)) mark('conditions', 'dom class: ' + c, 'weak', 'domClass');
        if (looksLikeWpmlDomToken(c)) mark('wpml', 'dom class: ' + c, 'weak', 'domClass');
      }

      for (i = 0; i < dom.attributes.length; i++) {
        var attr = dom.attributes[i];
        var attrName = String(attr && attr.name || '');
        var attrVal = String(attr && attr.value || '');
        if (!attrName) continue;
        var hasQueryLoopAttrName = looksLikeQueryLoopDomToken(attrName);
        var hasStructuredQueryLoopAttrValue = looksLikeMetadataCarrierAttr(attrName) && looksLikeStructuredQueryValue(attrVal);
        var hasConditionAttrName = looksLikeConditionDomToken(attrName);
        var hasStructuredConditionAttrValue = looksLikeMetadataCarrierAttr(attrName) && looksLikeStructuredConditionValue(attrVal);
        var hasWpmlAttrName = looksLikeWpmlDomToken(attrName);
        var hasStructuredWpmlAttrValue = looksLikeMetadataCarrierAttr(attrName) && looksLikeStructuredWpmlValue(attrVal);
        var hasDynamicAttrName = looksLikeDynamicDomToken(attrName);
        var hasComponentAttrName = looksLikeComponentDomToken(attrName);
        var hasStructuredComponentAttrValue = looksLikeMetadataCarrierAttr(attrName) && looksLikeStructuredComponentValue(attrVal);
        var hasSlotAttrName = looksLikeSlotDomToken(attrName);
        var hasStructuredSlotAttrValue = looksLikeMetadataCarrierAttr(attrName) && looksLikeStructuredSlotValue(attrVal);
        var hasVariantAttrName = looksLikeVariantDomToken(attrName);
        var hasStructuredVariantAttrValue = looksLikeMetadataCarrierAttr(attrName) && looksLikeStructuredVariantValue(attrVal);
        if (hasComponentAttrName || hasStructuredComponentAttrValue) mark('component', 'dom attr: ' + attrName, null, 'domAttr');
        if (hasSlotAttrName || hasStructuredSlotAttrValue) mark('slot', 'dom attr: ' + attrName, null, 'domAttr');
        if (hasVariantAttrName || hasStructuredVariantAttrValue) mark('variant', 'dom attr: ' + attrName, null, 'domAttr');
        if (hasQueryLoopAttrName || hasStructuredQueryLoopAttrValue) mark('queryLoop', 'dom attr: ' + attrName, 'weak', 'domAttr');
        if (hasConditionAttrName || hasStructuredConditionAttrValue) mark('conditions', 'dom attr: ' + attrName, 'weak', 'domAttr');
        if (/^item(scope|type|prop|id|ref)$/i.test(attrName) || looksLikeStructuredSchemaValue(attrVal)) mark('schema', 'dom attr: ' + attrName, null, 'domAttr');
        if (hasWpmlAttrName || hasStructuredWpmlAttrValue) mark('wpml', 'dom attr: ' + attrName, 'weak', 'domAttr');
        if (hasDynamicAttrName) mark('dynamicData', 'dom attr name: ' + attrName, 'weak', 'domAttr');
        if (looksLikeDynamicPlaceholder(attrVal)) mark('dynamicData', 'dom attr value: ' + attrName, null, 'domAttr');
      }
    }

    if (texts.length) {
      for (i = 0; i < Math.min(texts.length, 40); i++) {
        var t = String(texts[i] || '');
        if (!t) continue;
        if (looksLikeStructuredSchemaValue(t)) mark('schema', 'state value mentions schema', null, 'text');
        if (looksLikeStructuredQueryValue(t)) mark('queryLoop', 'state value mentions query', 'weak', 'text');
        if (looksLikeStructuredConditionValue(t)) mark('conditions', 'state value mentions condition', 'weak', 'text');
        if (looksLikeStructuredWpmlValue(t)) mark('wpml', 'state value mentions wpml', 'weak', 'text');
        if (looksLikeDynamicPlaceholder(t)) mark('dynamicData', 'state value dynamic-ish', 'weak', 'text');
      }
    }

    // Deduplicate evidence while preserving order.
    var seenEvidence = {};
    out.evidence = out.evidence.filter(function (line) {
      if (seenEvidence[line]) return false;
      seenEvidence[line] = true;
      return true;
    });

    return out;
  };

  BricksAPI.prototype._deriveApplyGate = function (signalInfo) {
    var flags = signalInfo && signalInfo.flags ? signalInfo.flags : {};
    var signalLevels = signalInfo && signalInfo.signalLevels && isObject(signalInfo.signalLevels)
      ? signalInfo.signalLevels
      : {};
    var signalSourceLevels = signalInfo && signalInfo.signalSourceLevels && isObject(signalInfo.signalSourceLevels)
      ? signalInfo.signalSourceLevels
      : {};
    var reasons = [];
    var level = 'allow';
    var allowSafeSubset = true;
    var allowStructure = true;
    var diagnosticsContexts = [];
    var diagnosticsExceptions = [];

    var resolveSignalLevel = function (key, defaultLevel) {
      if (!flags[key]) return 0;
      var value = Number(signalLevels[key]);
      if (!isFinite(value)) value = Number(defaultLevel);
      if (!isFinite(value)) value = 2;
      if (value <= 0) return 0;
      if (value < 2) return 1;
      return 2;
    };

    var resolveSignalSourceLevels = function (key) {
      var normalized = {
        stateKey: 0,
        model: 0,
        domClass: 0,
        domAttr: 0,
        text: 0
      };
      if (!signalSourceLevels || !isObject(signalSourceLevels)) return normalized;
      var raw = signalSourceLevels[key];
      if (!raw || !isObject(raw)) return normalized;
      var sourceKeys = Object.keys(normalized);
      for (var i = 0; i < sourceKeys.length; i++) {
        var sourceKey = sourceKeys[i];
        var value = Number(raw[sourceKey]);
        if (!isFinite(value) || value <= 0) continue;
        normalized[sourceKey] = value < 2 ? 1 : 2;
      }
      return normalized;
    };

    var hasAnySignalSourceLevel = function (levels) {
      if (!levels || !isObject(levels)) return false;
      return !!(
        levels.stateKey ||
        levels.model ||
        levels.domClass ||
        levels.domAttr ||
        levels.text
      );
    };

    var isStateKeyOnlyWeakSignal = function (levels) {
      if (!hasAnySignalSourceLevel(levels)) return false;
      if (!levels.stateKey) return false;
      return !levels.model && !levels.domClass && !levels.domAttr && !levels.text;
    };

    var isStateKeyOrTextOnlyWeakSignal = function (levels) {
      if (!hasAnySignalSourceLevel(levels)) return false;
      if (levels.model || levels.domClass || levels.domAttr) return false;
      return !!(levels.stateKey || levels.text);
    };

    var pushDiagnosticContext = function (key, severity, reason, safeSubsetAllowed, structureAllowed) {
      diagnosticsContexts.push({
        key: String(key || ''),
        severity: String(severity || 'guarded'),
        reason: String(reason || ''),
        htmlApplySafeSubsetAllowed: !!safeSubsetAllowed,
        htmlApplyStructureAllowed: !!structureAllowed
      });
    };

    if (flags.slot) {
      if (level === 'allow') level = 'guarded';
      var slotReason = 'slot context detected (slot boundaries need dedicated write rules)';
      reasons.push(slotReason);
      allowStructure = false;
      pushDiagnosticContext('slot', 'guarded', slotReason, true, false);
    }
    if (flags.component) {
      if (level === 'allow') level = 'guarded';
      var componentReason = 'component context detected (component-owned structure may be inherited/shared)';
      reasons.push(componentReason);
      allowStructure = false;
      pushDiagnosticContext('component', 'guarded', componentReason, true, false);
    }
    if (flags.variant) {
      if (level === 'allow') level = 'guarded';
      var variantReason = 'variant context detected (variant/inheritance-safe apply required)';
      reasons.push(variantReason);
      allowStructure = false;
      pushDiagnosticContext('variant', 'guarded', variantReason, true, false);
    }
    var querySourceLevels = resolveSignalSourceLevels('queryLoop');
    var conditionsSourceLevels = resolveSignalSourceLevels('conditions');
    var schemaSourceLevels = resolveSignalSourceLevels('schema');
    var dynamicSourceLevels = resolveSignalSourceLevels('dynamicData');
    var wpmlSourceLevels = resolveSignalSourceLevels('wpml');

    var queryLevel = resolveSignalLevel('queryLoop', 2);
    if (flags.queryLoop) {
      if (queryLevel >= 2) {
        if (level === 'allow') level = 'guarded';
        var queryReason = 'query loop context detected (loop-bound structure/attrs need protection)';
        reasons.push(queryReason);
        allowStructure = false;
        pushDiagnosticContext('queryLoop', 'guarded', queryReason, true, false);
      } else if (hasAnySignalSourceLevel(querySourceLevels) && !isStateKeyOrTextOnlyWeakSignal(querySourceLevels)) {
        if (level === 'allow') level = 'guarded';
        var queryWeakStructuralReason = 'query loop hints detected (structural weak signal; safe-subset-only until confirmed)';
        reasons.push(queryWeakStructuralReason);
        allowStructure = false;
        pushDiagnosticContext('queryLoop', 'guarded', queryWeakStructuralReason, true, false);
        diagnosticsExceptions.push('queryLoop:weak-structural-downgrade');
      } else {
        var queryWeakReason = hasAnySignalSourceLevel(querySourceLevels)
          ? 'query loop key/text hints only (non-structural weak signal; full-structure apply kept until confirmed)'
          : 'query loop hints detected (weak signal; full-structure apply kept until confirmed)';
        reasons.push(queryWeakReason);
        pushDiagnosticContext('queryLoop', 'allow', queryWeakReason, true, true);
        if (querySourceLevels.stateKey && querySourceLevels.text) {
          diagnosticsExceptions.push('queryLoop:weak-statekey-text-no-gate');
        } else if (querySourceLevels.text) {
          diagnosticsExceptions.push('queryLoop:weak-text-no-gate');
        } else if (querySourceLevels.stateKey) {
          diagnosticsExceptions.push('queryLoop:weak-statekey-no-gate');
        } else {
          diagnosticsExceptions.push('queryLoop:weak-signal-no-gate');
        }
      }
    }
    var conditionsLevel = resolveSignalLevel('conditions', 2);
    if (flags.conditions) {
      if (conditionsLevel >= 2) {
        if (level === 'allow') level = 'guarded';
        var conditionsReason = 'conditions metadata present (do not overwrite canonical settings blindly)';
        reasons.push(conditionsReason);
        allowStructure = false;
        pushDiagnosticContext('conditions', 'guarded', conditionsReason, true, false);
      } else if (hasAnySignalSourceLevel(conditionsSourceLevels) && !isStateKeyOrTextOnlyWeakSignal(conditionsSourceLevels)) {
        if (level === 'allow') level = 'guarded';
        var conditionsWeakStructuralReason = 'conditions hints detected (structural weak signal; safe-subset-only until confirmed)';
        reasons.push(conditionsWeakStructuralReason);
        allowStructure = false;
        pushDiagnosticContext('conditions', 'guarded', conditionsWeakStructuralReason, true, false);
        diagnosticsExceptions.push('conditions:weak-structural-downgrade');
      } else {
        var conditionsWeakReason = hasAnySignalSourceLevel(conditionsSourceLevels)
          ? 'conditions key/text hints only (non-structural weak signal; full-structure apply kept until confirmed)'
          : 'conditions hints detected (weak signal; full-structure apply kept until confirmed)';
        reasons.push(conditionsWeakReason);
        pushDiagnosticContext('conditions', 'allow', conditionsWeakReason, true, true);
        if (conditionsSourceLevels.stateKey && conditionsSourceLevels.text) {
          diagnosticsExceptions.push('conditions:weak-statekey-text-no-gate');
        } else if (conditionsSourceLevels.text) {
          diagnosticsExceptions.push('conditions:weak-text-no-gate');
        } else if (conditionsSourceLevels.stateKey) {
          diagnosticsExceptions.push('conditions:weak-statekey-no-gate');
        } else {
          diagnosticsExceptions.push('conditions:weak-signal-no-gate');
        }
      }
    }
    var schemaLevel = resolveSignalLevel('schema', 2);
    if (flags.schema) {
      if (isStateKeyOnlyWeakSignal(schemaSourceLevels)) {
        var schemaKeyOnlyReason = 'schema key hints only (non-structural weak signal; full-structure apply kept until confirmed)';
        reasons.push(schemaKeyOnlyReason);
        pushDiagnosticContext('schema', 'allow', schemaKeyOnlyReason, true, true);
        diagnosticsExceptions.push('schema:weak-statekey-no-gate');
      } else {
        if (level === 'allow') level = 'guarded';
        var schemaReason = 'schema markers detected (schema-aware writes required)';
        reasons.push(schemaReason);
        allowSafeSubset = false;
        allowStructure = false;
        pushDiagnosticContext('schema', 'blocked', schemaReason, false, false);
      }
    }
    var dynamicLevel = resolveSignalLevel('dynamicData', 2);
    if (flags.dynamicData) {
      if (dynamicLevel >= 2) {
        if (level === 'allow') level = 'guarded';
        var dynamicReason = 'dynamic data markers detected (roundtrip/placeholder-safe parsing needed)';
        reasons.push(dynamicReason);
        allowSafeSubset = false;
        allowStructure = false;
        pushDiagnosticContext('dynamicData', 'blocked', dynamicReason, false, false);
      } else if (isStateKeyOrTextOnlyWeakSignal(dynamicSourceLevels)) {
        var dynamicNonStructuralWeakReason = 'dynamic data key/text hints only (non-structural weak signal; full-structure apply kept until confirmed)';
        reasons.push(dynamicNonStructuralWeakReason);
        pushDiagnosticContext('dynamicData', 'allow', dynamicNonStructuralWeakReason, true, true);
        if (dynamicSourceLevels.stateKey && dynamicSourceLevels.text) {
          diagnosticsExceptions.push('dynamicData:weak-statekey-text-no-gate');
        } else if (dynamicSourceLevels.text) {
          diagnosticsExceptions.push('dynamicData:weak-text-no-gate');
        } else {
          diagnosticsExceptions.push('dynamicData:weak-statekey-no-gate');
        }
      } else {
        if (level === 'allow') level = 'guarded';
        var dynamicWeakReason = 'dynamic data hints detected (weak signal; safe-subset-only until confirmed)';
        reasons.push(dynamicWeakReason);
        allowStructure = false;
        pushDiagnosticContext('dynamicData', 'guarded', dynamicWeakReason, true, false);
        diagnosticsExceptions.push('dynamicData:weak-signal-downgrade');
      }
    }
    var wpmlLevel = resolveSignalLevel('wpml', 2);
    if (flags.wpml) {
      if (wpmlLevel >= 2) {
        if (level === 'allow') level = 'guarded';
        var wpmlReason = 'WPML-related markers detected (translation-aware writes required)';
        reasons.push(wpmlReason);
        allowSafeSubset = false;
        allowStructure = false;
        pushDiagnosticContext('wpml', 'blocked', wpmlReason, false, false);
      } else if (isStateKeyOrTextOnlyWeakSignal(wpmlSourceLevels)) {
        var wpmlNonStructuralWeakReason = 'WPML key/text hints only (non-structural weak signal; full-structure apply kept until confirmed)';
        reasons.push(wpmlNonStructuralWeakReason);
        pushDiagnosticContext('wpml', 'allow', wpmlNonStructuralWeakReason, true, true);
        if (wpmlSourceLevels.stateKey && wpmlSourceLevels.text) {
          diagnosticsExceptions.push('wpml:weak-statekey-text-no-gate');
        } else if (wpmlSourceLevels.text) {
          diagnosticsExceptions.push('wpml:weak-text-no-gate');
        } else {
          diagnosticsExceptions.push('wpml:weak-statekey-no-gate');
        }
      } else {
        if (level === 'allow') level = 'guarded';
        var wpmlWeakReason = 'WPML hints detected (weak signal; safe-subset-only until confirmed)';
        reasons.push(wpmlWeakReason);
        allowStructure = false;
        pushDiagnosticContext('wpml', 'guarded', wpmlWeakReason, true, false);
        diagnosticsExceptions.push('wpml:weak-signal-downgrade');
      }
    }

    if (!allowSafeSubset && !allowStructure) {
      level = 'blocked';
    }

    var policyMode = 'allow-all';
    if (!allowSafeSubset && !allowStructure) {
      policyMode = 'blocked';
    } else if (allowSafeSubset && !allowStructure) {
      policyMode = 'safe-subset-only';
    } else if (!allowSafeSubset && allowStructure) {
      policyMode = 'structure-only';
    }

    var blockedBy = diagnosticsContexts.filter(function (ctx) {
      return !ctx.htmlApplySafeSubsetAllowed && !ctx.htmlApplyStructureAllowed;
    }).map(function (ctx) {
      return ctx.key;
    });
    var guardedBy = diagnosticsContexts.filter(function (ctx) {
      return ctx.htmlApplySafeSubsetAllowed && !ctx.htmlApplyStructureAllowed;
    }).map(function (ctx) {
      return ctx.key;
    });

    var diagnostics = {
      version: 2,
      mode: policyMode,
      htmlApplySafeSubsetAllowed: !!allowSafeSubset,
      htmlApplyStructureAllowed: !!allowStructure,
      blockedBy: blockedBy,
      guardedBy: guardedBy,
      exceptions: diagnosticsExceptions,
      signalLevels: {
        queryLoop: queryLevel,
        conditions: conditionsLevel,
        schema: schemaLevel,
        dynamicData: dynamicLevel,
        wpml: wpmlLevel
      },
      signalSourceLevels: {
        queryLoop: querySourceLevels,
        conditions: conditionsSourceLevels,
        schema: schemaSourceLevels,
        dynamicData: dynamicSourceLevels,
        wpml: wpmlSourceLevels
      },
      contexts: diagnosticsContexts,
      summary: (
        'policy v2: mode=' + policyMode +
        ' · safeSubset=' + (allowSafeSubset ? 'allow' : 'block') +
        ' · structure=' + (allowStructure ? 'allow' : 'block') +
        (diagnosticsExceptions.length ? (' · exceptions=' + diagnosticsExceptions.join(',')) : '')
      )
    };

    return {
      level: level,
      reasons: reasons,
      htmlApplySafeSubsetAllowed: !!allowSafeSubset,
      htmlApplyStructureAllowed: !!allowStructure,
      diagnostics: diagnostics
    };
  };

  BricksAPI.prototype._findElementModelById = function (root, targetId) {
    targetId = String(targetId || '');
    if (!root || !targetId) return null;

    var commonCandidates = [];
    try {
      if (root.elements) commonCandidates.push(root.elements);
      if (root.content) commonCandidates.push(root.content);
      if (root.pageData) commonCandidates.push(root.pageData);
      if (root.pageData && root.pageData.elements) commonCandidates.push(root.pageData.elements);
      // Do not prioritize builderStates UI clones for model lookup.
      // Canonical state trees must win to avoid writing/applying against projected UI-only snapshots.
    } catch (e) { _warn("_findElementModelById", e); }

    for (var c = 0; c < commonCandidates.length; c++) {
      var quick = this._findElementModelByIdDeep(commonCandidates[c], targetId, 3000);
      if (quick) return quick;
    }

    return this._findElementModelByIdDeep(root, targetId, 5000);
  };

  BricksAPI.prototype._findElementModelByIdDeep = function (root, targetId, maxNodes) {
    if (!root) return null;
    var stack = [root];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : [];
    var scanned = 0;

    while (stack.length && scanned < (maxNodes || 5000)) {
      var node = stack.pop();
      if (!node || (typeof node !== 'object' && typeof node !== 'function')) continue;
      if (node === w || node === document) continue;

      if (seen && typeof seen.add === 'function') {
        if (seen.has(node)) continue;
        seen.add(node);
      } else {
        if (seen.indexOf(node) !== -1) continue;
        seen.push(node);
      }

      scanned++;

      try {
        if (String(node.id || '') === targetId && (node.settings || node.name || node.parent || node.children)) {
          return node;
        }
      } catch (e) { _warn("_findElementModelByIdDeep", e); }

      if (Array.isArray(node)) {
        for (var i = node.length - 1; i >= 0; i--) stack.push(node[i]);
        continue;
      }

      var keys = [];
      try { keys = Object.keys(node); } catch (e2) { keys = []; }

      for (var k = keys.length - 1; k >= 0; k--) {
        var key = keys[k];
        if (key === 'el' || key === '$el' || key === 'parentNode' || key === 'ownerDocument') continue;
        var child;
        try { child = node[key]; } catch (e3) { child = null; }
        if (!child) continue;
        if (typeof Node !== 'undefined' && child instanceof Node) continue;
        if (typeof child === 'object' || typeof child === 'function') stack.push(child);
      }
    }

    return null;
  };

  BricksAPI.prototype._getElementIdCandidatesFromDom = function (domEl) {
    if (!domEl || !domEl.getAttribute) return [];
    var attrs = this._getBricksElementIdAttributeNames();
    var seen = {};
    var out = [];
    for (var i = 0; i < attrs.length; i++) {
      var v = String(domEl.getAttribute(attrs[i]) || '');
      if (!v || seen[v]) continue;
      seen[v] = true;
      out.push(v);
    }
    var domId = String(domEl.id || '').trim();
    if (/^brxe-/.test(domId)) {
      var normalizedId = domId.replace(/^brxe-/, '');
      if (normalizedId && !seen[normalizedId]) {
        seen[normalizedId] = true;
        out.push(normalizedId);
      }
    }
    return out;
  };

  BricksAPI.prototype.getElementModelByDom = function (domEl, opts) {
    opts = opts || {};
    var ids = this._getElementIdCandidatesFromDom(domEl);
    var tryIds = [];
    var seen = {};
    var self = this;

    function pushId(v) {
      v = String(v || '');
      if (!v || seen[v]) return;
      seen[v] = true;
      tryIds.push(v);
    }

    if (opts.preferredId) pushId(opts.preferredId);
    if (Array.isArray(opts.preferredIds)) {
      for (var p = 0; p < opts.preferredIds.length; p++) pushId(opts.preferredIds[p]);
    }

    // If this DOM node is the currently selected element, prefer the builder's active ID
    // (often canonical `data-id`) over runtime/script IDs to avoid writing preview/apply state
    // into the wrong model when both IDs are present.
    try {
      var selectedId = this.getSelectedElementId();
      if (selectedId) {
        var selectedDom = this.getSelectedElementDom();
        if ((selectedDom && domEl && selectedDom === domEl) || ids.indexOf(String(selectedId)) !== -1) {
          pushId(selectedId);
        }
      }
    } catch (eSel) { _warn("pushId", eSel); }

    for (var i = 0; i < ids.length; i++) pushId(ids[i]);

    for (i = 0; i < tryIds.length; i++) {
      var model = self.getElementModelById(tryIds[i]);
      if (model) {
        return {
          id: tryIds[i],
          model: model,
          idCandidates: tryIds
        };
      }
    }
    return {
      id: '',
      model: null,
      idCandidates: tryIds.length ? tryIds : ids
    };
  };

  BricksAPI.prototype._touchBuilderUi = function (opts) {
    var ts = now();
    var targets = this._getBuilderUiTouchTargets(opts);
    for (var i = 0; i < targets.length; i++) {
      try {
        targets[i].owner[targets[i].key] = ts;
      } catch (e) { _warn("_touchBuilderUi", e); }
    }
    return ts;
  };

  BricksAPI.prototype.notifyContentSettingsChanged = function () {
    var hooks = this._getBuilderRefreshHooks();
    var saveChanges = hooks && hooks.saveChanges;
    try {
      if (saveChanges && typeof saveChanges.fn === 'function') {
        saveChanges.fn.call(saveChanges.owner, 'content', false);
        return true;
      }
    } catch (e) { _warn("notifyContentSettingsChanged", e); }
    return false;
  };

  BricksAPI.prototype.notifyGlobalClassesChanged = function () {
    var hooks = this._getBuilderRefreshHooks();
    var saveChanges = hooks && hooks.saveChanges;
    var changed = false;
    try {
      if (saveChanges && typeof saveChanges.fn === 'function') {
        saveChanges.fn.call(saveChanges.owner, 'globalClasses');
        changed = true;
      }
    } catch (e1) { _warn("notifyGlobalClassesChanged", e1); }
    try {
      if (saveChanges && typeof saveChanges.fn === 'function') {
        saveChanges.fn.call(saveChanges.owner, 'globalClassesLocked');
        changed = true;
      }
    } catch (e2) { _warn("notifyGlobalClassesChanged", e2); }
    return changed;
  };

  BricksAPI.prototype._patchActiveUiCloneFromCanonical = function (target, canonicalModel, opts) {
    opts = opts || {};
    if (!target || !canonicalModel || typeof target !== 'object' || typeof canonicalModel !== 'object') return false;
    if (target === canonicalModel) return false;
    var syncGlobalClasses = opts.syncGlobalClasses !== false;

    var changed = false;
    changed = patchObjectShallow(target, canonicalModel) || changed;

    var canonicalSettings = isObject(canonicalModel.settings) ? canonicalModel.settings : {};
    var targetSettings = isObject(target.settings) ? target.settings : {};
    var nextSettings = Object.assign({}, targetSettings);
    var settingsChanged = !isObject(target.settings);

    // Patch only the fields CM6GPT manages. Preserve UI/plugin-specific enrichments.
    var managedKeySet = {
      text: 1,
      _cssId: 1,
      _attributes: 1,
      _cssClasses: 1,
      _cssCustom: 1
    };
    var extraManaged = Array.isArray(opts.managedSettingKeys) ? opts.managedSettingKeys : [];
    for (var mk = 0; mk < extraManaged.length; mk++) {
      var rawKey = String(extraManaged[mk] || '').trim();
      if (!rawKey) continue;
      if (rawKey === '_cssGlobalClasses') continue;
      managedKeySet[rawKey] = 1;
    }
    var managedKeys = Object.keys(managedKeySet);
    for (var i = 0; i < managedKeys.length; i++) {
      var key = managedKeys[i];
      if (hasOwn(canonicalSettings, key)) {
        var nextVal = deepCloneBestEffort(canonicalSettings[key]);
        if (JSON.stringify(nextSettings[key]) !== JSON.stringify(nextVal)) {
          nextSettings[key] = nextVal;
          changed = true;
          settingsChanged = true;
        }
      } else if (hasOwn(nextSettings, key)) {
        delete nextSettings[key];
        changed = true;
        settingsChanged = true;
      }
    }

    // IMPORTANT: do not overwrite UI clone `_cssGlobalClasses` with canonical IDs here.
    // AT/Bricks sidebar helpers may treat UI clone values as selector names and crash on raw IDs (e.g. ".353a53").
    // Canonical model still gets the real `_cssGlobalClasses` IDs in the state tree.
    // Instead, patch `_cssGlobalClasses` using a UI-safe projection (prefer class names / object entries).
    if (syncGlobalClasses && (hasOwn(canonicalSettings, '_cssGlobalClasses') || hasOwn(targetSettings, '_cssGlobalClasses'))) {
      var desiredUiGlobal = this._projectCanonicalGlobalClassesForUi(
        canonicalSettings._cssGlobalClasses,
        targetSettings._cssGlobalClasses
      );

      // Guard: when canonical still has global class IDs but UI projection cannot resolve
      // a safe representation yet, do not wipe existing UI clone entries to [].
      // This prevents transient class-loss regressions during _cssCustom apply/refresh.
      var canonicalGlobalIds = this._normalizeGlobalClassIdList(canonicalSettings._cssGlobalClasses);
      var currentUiGlobal = Array.isArray(targetSettings._cssGlobalClasses) ? targetSettings._cssGlobalClasses : [];
      if (
        canonicalGlobalIds.length &&
        Array.isArray(desiredUiGlobal) &&
        !desiredUiGlobal.length &&
        currentUiGlobal.length
      ) {
        desiredUiGlobal = currentUiGlobal.slice();
      }

      var currentUiGlobalJson = JSON.stringify(typeof targetSettings._cssGlobalClasses === 'undefined' ? null : targetSettings._cssGlobalClasses);
      var nextUiGlobalJson = JSON.stringify(typeof desiredUiGlobal === 'undefined' ? null : desiredUiGlobal);
      if (currentUiGlobalJson !== nextUiGlobalJson) {
        if (typeof desiredUiGlobal === 'undefined') {
          if (hasOwn(nextSettings, '_cssGlobalClasses')) delete nextSettings._cssGlobalClasses;
        } else {
          nextSettings._cssGlobalClasses = desiredUiGlobal;
        }
        changed = true;
        settingsChanged = true;
      }
    }

    if (settingsChanged) {
      target.settings = nextSettings;
      changed = true;
    }

    return changed;
  };

  BricksAPI.prototype._projectCanonicalGlobalClassesForUi = function (canonicalGlobalIdsInput, currentUiValue) {
    var canonicalGlobalIds = this._normalizeGlobalClassIdList(canonicalGlobalIdsInput);
    if (!canonicalGlobalIds.length) return [];

    var indexes = this._getGlobalClassIndexes();
    var desiredIdSet = {};
    var desiredNameSet = {};
    for (var i = 0; i < canonicalGlobalIds.length; i++) {
      desiredIdSet[canonicalGlobalIds[i]] = true;
      var desiredName = String(indexes.idToName[canonicalGlobalIds[i]] || '');
      if (desiredName) desiredNameSet[desiredName] = true;
    }

    var uiArr = Array.isArray(currentUiValue) ? currentUiValue : [];
    var hasObjectEntries = false;
    for (i = 0; i < uiArr.length; i++) {
      if (uiArr[i] && typeof uiArr[i] === 'object') {
        hasObjectEntries = true;
        break;
      }
    }

    var seenIds = {};
    var seenNames = {};
    var out = [];

    function parseUiEntry(entry) {
      if (entry && typeof entry === 'object') {
        return {
          kind: 'object',
          id: String(entry.id || entry.value || ''),
          name: String(entry.name || entry.label || entry.class || '')
        };
      }
      var s = String(entry || '').trim();
      return { kind: 'string', id: '', name: s };
    }

    // Preserve UI entry shape/order where possible, but filter to canonical set.
    for (i = 0; i < uiArr.length; i++) {
      var parsed = parseUiEntry(uiArr[i]);
      var keep = false;
      var resolvedId = '';
      var resolvedName = '';

      if (parsed.id && desiredIdSet[parsed.id]) {
        keep = true;
        resolvedId = parsed.id;
        resolvedName = String(indexes.idToName[parsed.id] || parsed.name || '');
      } else if (parsed.name && desiredNameSet[parsed.name]) {
        keep = true;
        resolvedName = parsed.name;
        // Backfill ID if registry knows it.
        var nameToId = this._getGlobalClassIndexes().nameToId;
        resolvedId = String(nameToId && nameToId[parsed.name] ? nameToId[parsed.name] : '');
      }

      if (!keep) continue;
      if (resolvedId && seenIds[resolvedId]) continue;
      if (!resolvedId && resolvedName && seenNames[resolvedName]) continue;
      if (resolvedId) seenIds[resolvedId] = true;
      if (resolvedName) seenNames[resolvedName] = true;

      if (hasObjectEntries && parsed.kind === 'object') {
        var nextObj = Object.assign({}, uiArr[i]);
        if (resolvedId) {
          if (hasOwn(nextObj, 'id')) nextObj.id = resolvedId;
          if (hasOwn(nextObj, 'value')) nextObj.value = resolvedId;
        }
        if (resolvedName) {
          if (hasOwn(nextObj, 'name')) nextObj.name = resolvedName;
          if (hasOwn(nextObj, 'label')) nextObj.label = resolvedName;
          if (hasOwn(nextObj, 'class')) nextObj.class = resolvedName;
        }
        out.push(nextObj);
      } else {
        out.push(resolvedName || parsed.name || parsed.id);
      }
    }

    // Append missing canonical entries in a UI-safe shape.
    for (i = 0; i < canonicalGlobalIds.length; i++) {
      var gid = canonicalGlobalIds[i];
      var gname = String(indexes.idToName[gid] || '');
      if (seenIds[gid]) continue;
      if (!gname && !desiredIdSet[gid]) continue;
      if (hasObjectEntries) {
        out.push({ id: gid, name: gname || gid });
      } else {
        // Prefer names for UI safety (AT may treat strings as selectors).
        if (gname) out.push(gname);
      }
      seenIds[gid] = true;
      if (gname) seenNames[gname] = true;
    }

    return out;
  };

  BricksAPI.prototype._collectActiveClassUiRefs = function () {
    var state = this.getVueState();
    var admin = this.getAdmin();
    var activeClassOwners = [];
    var classModeOwners = [];
    var seenOwners = [];

    function pushOwner(arr, obj) {
      if (!obj || typeof obj !== 'object') return;
      if (seenOwners.indexOf(obj) !== -1) return;
      seenOwners.push(obj);
      arr.push(obj);
    }

    pushOwner(activeClassOwners, state);
    pushOwner(activeClassOwners, admin && admin.vueState);
    pushOwner(activeClassOwners, admin && admin.builderStates);

    var seenModeOwners = [];
    function pushModeOwner(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (seenModeOwners.indexOf(obj) !== -1) return;
      seenModeOwners.push(obj);
      classModeOwners.push(obj);
    }

    pushModeOwner(admin && admin.builderStates);
    pushModeOwner(state);
    pushModeOwner(admin && admin.vueState);

    return {
      state: state,
      admin: admin,
      activeClassOwners: activeClassOwners,
      classModeOwners: classModeOwners
    };
  };

  BricksAPI.prototype._readActiveClassUiInfo = function () {
    var compat = this._getActiveClassUiCompatibility();
    var refs = compat.refs;
    var raw = null;
    var owner = null;
    for (var i = 0; i < compat.activeClassOwners.length; i++) {
      var candidateOwner = compat.activeClassOwners[i];
      if (!candidateOwner) continue;
      if (candidateOwner.activeClass == null) continue;
      raw = candidateOwner.activeClass;
      owner = candidateOwner;
      break;
    }

    var id = '';
    var name = '';
    if (raw && typeof raw === 'object') {
      id = String(raw.id || raw.value || '');
      name = normalizeClassNameLike(raw.name || raw.label || raw.class || raw.selector || '');
    } else {
      name = normalizeClassNameLike(raw);
    }

    var isClassActive = false;
    for (i = 0; i < compat.classModeOwners.length; i++) {
      var modeOwner = compat.classModeOwners[i];
      if (!modeOwner) continue;
      if (typeof modeOwner.isClassActive !== 'undefined') {
        isClassActive = !!modeOwner.isClassActive;
        if (isClassActive) break;
      }
    }
    if (!isClassActive) {
      try {
        var hook = compat && compat.isClassActiveHook;
        if (hook && typeof hook.fn === 'function') {
          isClassActive = !!hook.fn.call(hook.owner);
        }
      } catch (e) { _warn("_readActiveClassUiInfo", e); }
    }

    return {
      refs: refs,
      compat: compat,
      raw: raw,
      owner: owner,
      id: id,
      name: name,
      isClassActive: isClassActive
    };
  };

  BricksAPI.prototype.getActiveClassUiInfo = function () {
    try {
      return this._readActiveClassUiInfo();
    } catch (e) {
      return {
        refs: null,
        raw: null,
        owner: null,
        id: '',
        name: '',
        isClassActive: false
      };
    }
  };

  BricksAPI.prototype._applyActiveClassUiSnapshot = function (opts) {
    opts = opts || {};
    var result = {
      changed: false,
      wroteActiveClass: false,
      modeTouched: false,
      rebound: false,
      touched: false
    };
    var warnPrefix = String(opts.warnPrefix || '_applyActiveClassUiSnapshot');
    var compat = opts.compat || this._getActiveClassUiCompatibility(opts.refs || null);
    var snapshot = opts.raw;
    if (!snapshot || typeof snapshot !== 'object') return result;

    snapshot = deepCloneBestEffort(snapshot) || snapshot;

    function safeJson(value) {
      try { return JSON.stringify(value); } catch (e) { _warn(warnPrefix, e); return ''; }
    }

    var desiredJson = safeJson(snapshot);
    for (var i = 0; i < compat.activeClassOwners.length; i++) {
      var owner = compat.activeClassOwners[i];
      if (!owner || typeof owner !== 'object') continue;
      if (!hasOwn(owner, 'activeClass')) continue;
      if (safeJson(owner.activeClass) !== desiredJson) {
        owner.activeClass = deepCloneBestEffort(snapshot);
        result.wroteActiveClass = true;
      }
    }
    result.changed = result.wroteActiveClass || result.changed;

    if (typeof opts.classModeActive !== 'undefined') {
      try {
        result.modeTouched = !!this._setActiveClassModeUi(!!opts.classModeActive);
        result.changed = result.modeTouched || result.changed;
      } catch (eMode) { _warn(warnPrefix, eMode); }
    }

    if (opts.rebindActiveObject !== false) {
      try {
        var info = opts.info || {
          refs: compat.refs,
          compat: compat,
          raw: deepCloneBestEffort(snapshot) || snapshot,
          id: String(opts.id || snapshot.id || snapshot.value || ''),
          name: normalizeClassNameLike(opts.name || snapshot.name || snapshot.label || snapshot.class || snapshot.selector || ''),
          isClassActive: opts.classModeActive !== false
        };
        result.rebound = !!this._rebindActiveObjectToActiveClassUi({ info: info });
        result.changed = result.rebound || result.changed;
      } catch (eRebind) { _warn(warnPrefix, eRebind); }
    }

    if (opts.touchBuilderUi) {
      try {
        result.touchTs = isObject(opts.touchBuilderUiOptions) && !Array.isArray(opts.touchBuilderUiOptions)
          ? this._touchBuilderUi(Object.assign({}, opts.touchBuilderUiOptions))
          : this._touchBuilderUi();
        result.touched = !!result.touchTs;
        result.changed = result.touched || result.changed;
      } catch (eTouch) { _warn(warnPrefix, eTouch); }
    }

    return result;
  };

  BricksAPI.prototype._restoreActiveObjectSelectionUi = function (opts) {
    opts = opts || {};
    var warnPrefix = String(opts.warnPrefix || '_restoreActiveObjectSelectionUi');
    var compat = opts.compat || this._getActiveClassUiCompatibility(opts.refs || null);
    var result = {
      changed: false,
      restored: false
    };

    try {
      var activeObjectState = compat.activeObjectState;
      var activeElementState = compat.activeElementState;
      if (!activeObjectState || !activeElementState) return result;

      var nextActiveElement = activeElementState.owner[activeElementState.key];
      if (nextActiveElement && activeObjectState.owner[activeObjectState.key] !== nextActiveElement) {
        activeObjectState.owner[activeObjectState.key] = nextActiveElement;
        result.restored = true;
        result.changed = true;
      }
    } catch (e) { _warn(warnPrefix, e); }

    return result;
  };

  BricksAPI.prototype._clearActiveClassUiState = function (opts) {
    opts = opts || {};
    var warnPrefix = String(opts.warnPrefix || '_clearActiveClassUiState');
    var compat = opts.compat || this._getActiveClassUiCompatibility(opts.refs || null);
    var result = {
      changed: false,
      clearedActiveClass: false,
      modeTouched: false,
      restoredActiveObject: false,
      touched: false
    };

    for (var i = 0; i < compat.activeClassOwners.length; i++) {
      var owner = compat.activeClassOwners[i];
      if (!owner || typeof owner !== 'object') continue;
      if (!hasOwn(owner, 'activeClass')) continue;
      if (owner.activeClass != null) {
        owner.activeClass = null;
        result.clearedActiveClass = true;
      }
    }
    result.changed = result.clearedActiveClass || result.changed;

    try {
      result.modeTouched = !!this._setActiveClassModeUi(false);
      result.changed = result.modeTouched || result.changed;
    } catch (eMode) { _warn(warnPrefix, eMode); }

    if (opts.restoreActiveObject !== false) {
      var restored = this._restoreActiveObjectSelectionUi({
        compat: compat,
        warnPrefix: warnPrefix
      });
      result.restoredActiveObject = !!(restored && restored.changed);
      result.changed = result.restoredActiveObject || result.changed;
    }

    if (opts.touchBuilderUi) {
      try {
        result.touchTs = isObject(opts.touchBuilderUiOptions) && !Array.isArray(opts.touchBuilderUiOptions)
          ? this._touchBuilderUi(Object.assign({}, opts.touchBuilderUiOptions))
          : this._touchBuilderUi();
        result.touched = !!result.touchTs;
        result.changed = result.touched || result.changed;
      } catch (eTouch) { _warn(warnPrefix, eTouch); }
    }

    return result;
  };

  BricksAPI.prototype._setActiveClassModeUi = function (isActive) {
    var compat = this._getActiveClassUiCompatibility();
    var changed = false;
    for (var i = 0; i < compat.classModeOwners.length; i++) {
      var owner = compat.classModeOwners[i];
      if (!owner || typeof owner !== 'object') continue;
      if (typeof owner.isClassActive === 'undefined') continue;
      if (!!owner.isClassActive !== !!isActive) {
        owner.isClassActive = !!isActive;
        changed = true;
      }
    }
    return changed;
  };

  BricksAPI.prototype._clearActiveClassUi = function () {
    var result = this._clearActiveClassUiState({
      warnPrefix: '_clearActiveClassUi'
    });
    return !!(result && result.changed);
  };

  BricksAPI.prototype._syncActiveClassUiState = function (opts) {
    opts = opts || {};
    var result = {
      changed: false,
      refreshedClassUi: false,
      refreshedSelectionUi: false,
      reconciled: false,
      rebound: false,
      touched: false
    };
    var warnPrefix = String(opts.warnPrefix || '_syncActiveClassUiState');
    var globalClassId = String(opts.globalClassId || '');
    var globalClassName = String(opts.globalClassName || '');
    var modelId = String(opts.modelId || '');
    var model = opts.model || null;
    var managedSettingKeys = Array.isArray(opts.managedSettingKeys) ? opts.managedSettingKeys.slice() : [];
    var reconcileOptions = isObject(opts.reconcileOptions) && !Array.isArray(opts.reconcileOptions)
      ? Object.assign({}, opts.reconcileOptions)
      : null;
    var touchBuilderUiOptions = isObject(opts.touchBuilderUiOptions) && !Array.isArray(opts.touchBuilderUiOptions)
      ? Object.assign({}, opts.touchBuilderUiOptions)
      : null;

    if (globalClassId || globalClassName) {
      try {
        result.refreshedClassUi = !!this._refreshActiveClassUiFromRegistry(globalClassId, globalClassName);
        result.changed = result.refreshedClassUi || result.changed;
      } catch (eClass) { _warn(warnPrefix, eClass); }
    }

    if (model && modelId) {
      try {
        result.refreshedSelectionUi = !!this.refreshActiveSelectionUiFromCanonical(modelId, model, {
          syncGlobalClasses: opts.syncGlobalClasses !== false,
          managedSettingKeys: managedSettingKeys
        });
        result.changed = result.refreshedSelectionUi || result.changed;
      } catch (eSelection) { _warn(warnPrefix, eSelection); }
    }

    if (reconcileOptions) {
      try {
        if (!reconcileOptions.model && model) reconcileOptions.model = model;
        var reconcileResult = this.reconcileActiveClassUi(reconcileOptions);
        result.reconciled = !!(reconcileResult && reconcileResult.changed);
        result.reconcileAction = reconcileResult && reconcileResult.action ? String(reconcileResult.action) : '';
        result.changed = result.reconciled || result.changed;
      } catch (eReconcile) { _warn(warnPrefix, eReconcile); }
    }

    if (opts.rebindActiveObject !== false) {
      try {
        var rebindOpts = {};
        if (opts.rebindInfo) rebindOpts.info = opts.rebindInfo;
        result.rebound = !!this._rebindActiveObjectToActiveClassUi(rebindOpts);
        result.changed = result.rebound || result.changed;
      } catch (eRebind) { _warn(warnPrefix, eRebind); }
    }

    if (opts.touchBuilderUi) {
      try {
        result.touchTs = touchBuilderUiOptions
          ? this._touchBuilderUi(touchBuilderUiOptions)
          : this._touchBuilderUi();
        result.touched = !!result.touchTs;
        result.changed = result.touched || result.changed;
      } catch (eTouch) { _warn(warnPrefix, eTouch); }
    }

    return result;
  };

  BricksAPI.prototype._scheduleActiveClassUiSync = function (opts) {
    opts = opts || {};
    if (opts.enabled === false || this._destroyed) return [];

    var delays = Array.isArray(opts.delays) && opts.delays.length ? opts.delays.slice() : [0, 70];
    var scheduledOpts = Object.assign({}, opts);
    delete scheduledOpts.delays;
    delete scheduledOpts.enabled;

    if (Array.isArray(opts.managedSettingKeys)) {
      scheduledOpts.managedSettingKeys = opts.managedSettingKeys.slice();
    }
    if (isObject(opts.reconcileOptions) && !Array.isArray(opts.reconcileOptions)) {
      scheduledOpts.reconcileOptions = Object.assign({}, opts.reconcileOptions);
    }
    if (isObject(opts.touchBuilderUiOptions) && !Array.isArray(opts.touchBuilderUiOptions)) {
      scheduledOpts.touchBuilderUiOptions = Object.assign({}, opts.touchBuilderUiOptions);
    }

    var self = this;
    var ids = [];
    function run() {
      self._syncActiveClassUiState(scheduledOpts);
    }
    for (var i = 0; i < delays.length; i++) {
      ids.push(this._scheduleDeferredUiStabilizer(run, delays[i]));
    }
    return ids;
  };

  BricksAPI.prototype._refreshActiveClassUiFromRegistry = function (globalClassId, globalClassName) {
    globalClassId = String(globalClassId || '');
    globalClassName = String(globalClassName || '');
    var found = this._findGlobalClassEntry(globalClassId || globalClassName);
    if (!found || !found.entry) return false;

    var freshClone = deepCloneBestEffort(found.entry);
    var applied = this._applyActiveClassUiSnapshot({
      raw: freshClone,
      id: String(found.id || ''),
      name: String(found.name || globalClassName || ''),
      classModeActive: true,
      rebindActiveObject: true,
      warnPrefix: '_refreshActiveClassUiFromRegistry'
    });
    return !!(applied && applied.changed);
  };

  BricksAPI.prototype.activateClassUiByName = function (className, opts) {
    opts = opts || {};
    var normalized = normalizeClassNameLike(className);
    if (!normalized) return { changed: false, reason: 'invalid-class', id: '', name: '' };

    var found = this._findGlobalClassEntry(normalized);
    var changed = false;
    var activeId = '';
    var touchedActivationUi = false;

    if (found && found.entry) {
      activeId = String(found.id || '');
      changed = this._refreshActiveClassUiFromRegistry(activeId || normalized, String(found.name || normalized)) || changed;
    } else {
      var localClone = {
        id: '',
        value: normalized,
        name: normalized,
        label: normalized,
        class: normalized,
        selector: '.' + normalized
      };
      var applied = this._applyActiveClassUiSnapshot({
        raw: localClone,
        id: '',
        name: normalized,
        classModeActive: true,
        rebindActiveObject: true,
        touchBuilderUi: !opts.deferUiRefresh,
        warnPrefix: 'activateClassUiByName'
      });
      changed = !!(applied && applied.changed);
      touchedActivationUi = !!(applied && applied.touched);
    }

    if (changed && !opts.deferUiRefresh && !touchedActivationUi) this._touchBuilderUi();
    return {
      changed: changed,
      reason: changed ? 'activated' : 'already-active',
      id: activeId,
      name: normalized
    };
  };

  BricksAPI.prototype.activateClassUiByRef = function (ref, opts) {
    opts = opts || {};
    ref = String(ref || '').trim();
    if (!ref) return { changed: false, reason: 'invalid-class', id: '', name: '' };

    var found = this._findGlobalClassEntry(ref);
    if (found && found.entry) {
      var activeId = String(found.id || '').trim();
      var activeName = normalizeClassNameLike(found.name || ref);
      var changed = this._refreshActiveClassUiFromRegistry(activeId || ref, activeName) || false;
      if (changed && !opts.deferUiRefresh) this._touchBuilderUi();
      return {
        changed: changed,
        reason: changed ? 'activated' : 'already-active',
        id: activeId,
        name: activeName
      };
    }

    return this.activateClassUiByName(ref, opts);
  };

  BricksAPI.prototype._rebindActiveObjectToActiveClassUi = function (opts) {
    opts = opts || {};
    var info = opts.info || null;
    if (!info) {
      try { info = this._readActiveClassUiInfo(); } catch (eInfo) { _warn("_rebindActiveObjectToActiveClassUi", eInfo); info = null; }
    }
    if (!info || !info.isClassActive || !info.raw || typeof info.raw !== 'object') return false;

    var compat = info.compat || this._getActiveClassUiCompatibility(info.refs || null);
    var activeClassState = compat.activeClassState;
    var activeObjectState = compat.activeObjectState;
    if (!activeObjectState) return false;

    var desiredActiveClass = deepCloneBestEffort(info.raw) || info.raw;
    var desiredId = String(desiredActiveClass && (desiredActiveClass.id || desiredActiveClass.value) || '');
    var changed = false;

    function safeJson(v) {
      try { return JSON.stringify(v); } catch (e) { _warn("_rebindActiveObjectToActiveClassUi.safeJson", e); return ''; }
    }

    try {
      if (activeClassState) {
        var currentActiveClassJson = safeJson(activeClassState.owner[activeClassState.key]);
        var desiredActiveClassJson = safeJson(desiredActiveClass);
        if (currentActiveClassJson !== desiredActiveClassJson) {
          activeClassState.owner[activeClassState.key] = deepCloneBestEffort(desiredActiveClass);
          changed = true;
        }
      }
    } catch (e1) { _warn("safeJson", e1); }

    try {
      var currentActiveObject = activeObjectState.owner[activeObjectState.key];
      var currentId = String(currentActiveObject && (currentActiveObject.id || currentActiveObject.value) || '');
      var shouldReplace =
        !currentActiveObject ||
        typeof currentActiveObject !== 'object' ||
        !desiredId ||
        currentId !== desiredId ||
        safeJson(currentActiveObject) !== safeJson(desiredActiveClass);

      if (shouldReplace) {
        activeObjectState.owner[activeObjectState.key] = deepCloneBestEffort(desiredActiveClass);
        changed = true;
      }
    } catch (e2) {
      try {
        activeObjectState.owner[activeObjectState.key] = deepCloneBestEffort(desiredActiveClass);
        changed = true;
      } catch (e3) { _warn("safeJson", e3); }
    }

    return changed;
  };

  BricksAPI.prototype.reconcileActiveClassUi = function (opts) {
    opts = opts || {};
    var info = this._readActiveClassUiInfo();
    if (!info.raw && !info.isClassActive) return { changed: false, action: 'noop' };

    var deletedId = String(opts.deletedGlobalId || '');
    var deletedName = String(opts.deletedGlobalName || '');
    var targetModel = opts.model || null;
    if (!targetModel && !opts.skipSelectedLookup) {
      try { targetModel = this.getSelectedElementModel(); } catch (e) { _warn("reconcileActiveClassUi", e); targetModel = null; }
    }

    if ((deletedId && info.id && info.id === deletedId) ||
        (deletedName && info.name && info.name === deletedName)) {
      var forcedCleared = this._clearActiveClassUiState({
        touchBuilderUi: true,
        warnPrefix: 'reconcileActiveClassUi'
      });
      return { changed: !!(forcedCleared && forcedCleared.changed), action: forcedCleared && forcedCleared.changed ? 'cleared-deleted' : 'noop' };
    }

    if (!targetModel || !isObject(targetModel.settings)) {
      return { changed: false, action: 'no-target-model' };
    }

    var settings = targetModel.settings;
    var currentLocal = this._normalizeClassNameList(settings._cssClasses || '');
    var currentGlobalIds = this._normalizeGlobalClassIdList(settings._cssGlobalClasses);
    var indexes = this._getGlobalClassIndexes();
    var globalNames = {};
    for (var i = 0; i < currentGlobalIds.length; i++) {
      var gid = currentGlobalIds[i];
      var gname = String(indexes.idToName[gid] || '');
      if (gname) globalNames[gname] = gid;
    }

    var activeId = String(info.id || '');
    var activeName = String(info.name || '');
    var stillAssigned = false;
    var matchedGlobalId = '';
    var matchedGlobalName = '';

    if (activeId && currentGlobalIds.indexOf(activeId) !== -1) {
      stillAssigned = true;
      matchedGlobalId = activeId;
      matchedGlobalName = String(indexes.idToName[activeId] || '');
    } else if (activeName) {
      if (currentLocal.indexOf(activeName) !== -1) {
        stillAssigned = true;
      }
      if (globalNames[activeName]) {
        stillAssigned = true;
        matchedGlobalId = String(globalNames[activeName] || '');
        matchedGlobalName = activeName;
      }
    }

    if (!stillAssigned && info.isClassActive) {
      var cleared = this._clearActiveClassUiState({
        touchBuilderUi: true,
        warnPrefix: 'reconcileActiveClassUi'
      });
      return { changed: !!(cleared && cleared.changed), action: cleared && cleared.changed ? 'cleared-stale' : 'noop' };
    }

    if (matchedGlobalId) {
      var refreshed = this._refreshActiveClassUiFromRegistry(matchedGlobalId, matchedGlobalName);
      if (refreshed) this._touchBuilderUi();
      return { changed: refreshed, action: refreshed ? 'refreshed-global' : 'noop' };
    }

    if (info.isClassActive && activeName && currentLocal.indexOf(activeName) !== -1) {
      var keptLocal = this._applyActiveClassUiSnapshot({
        info: info,
        compat: info.compat,
        raw: info.raw,
        id: activeId,
        name: activeName,
        classModeActive: true,
        rebindActiveObject: true,
        touchBuilderUi: true,
        warnPrefix: 'reconcileActiveClassUi'
      });
      if (keptLocal && keptLocal.changed) {
        return { changed: true, action: 'kept-local' };
      }
    }

    return { changed: false, action: 'noop' };
  };

  BricksAPI.prototype._getActiveSelectionUiReadbackTargets = function () {
    var state = null;
    var compat = null;
    var out = [];
    var seen = [];

    function push(target, path) {
      if (!target || typeof target !== 'object') return;
      if (seen.indexOf(target) !== -1) return;
      seen.push(target);
      out.push({
        target: target,
        path: String(path || '')
      });
    }

    try {
      state = this.getVueState();
    } catch (eState) { _warn("_getActiveSelectionUiReadbackTargets", eState); }

    try {
      compat = this._getActiveClassUiCompatibility();
    } catch (eCompat) { _warn("_getActiveSelectionUiReadbackTargets", eCompat); }

    push(state && state.activeElement, 'state.activeElement');

    try {
      var activeElementState = compat && compat.activeElementState;
      if (activeElementState) {
        push(activeElementState.owner[activeElementState.key], 'builderStates.activeElement');
      }
    } catch (eActiveElement) { _warn("_getActiveSelectionUiReadbackTargets", eActiveElement); }

    try {
      var activeObjectState = compat && compat.activeObjectState;
      if (activeObjectState) {
        push(activeObjectState.owner[activeObjectState.key], 'builderStates.activeObject');
      }
    } catch (eActiveObject) { _warn("_getActiveSelectionUiReadbackTargets", eActiveObject); }

    return out;
  };

  BricksAPI.prototype._getActiveSelectionUiCloneTargets = function (modelId) {
    modelId = String(modelId || '');
    if (!modelId) return [];

    function normalizeUiModelId(value) {
      return String(value || '')
        .trim()
        .replace(/^#/, '')
        .replace(/^brxe-/, '');
    }

    var activeSelectionId = '';
    var out = [];
    var readbackTargets = this._getActiveSelectionUiReadbackTargets();

    try {
      activeSelectionId = String((this.getSelectionContext() || {}).id || '');
    } catch (eSelection) { _warn("_getActiveSelectionUiCloneTargets", eSelection); }

    var normalizedModelId = normalizeUiModelId(modelId);
    var normalizedActiveSelectionId = normalizeUiModelId(activeSelectionId);
    var allowActiveFallback = !!normalizedActiveSelectionId && normalizedActiveSelectionId === normalizedModelId;

    for (var i = 0; i < readbackTargets.length; i++) {
      var entry = readbackTargets[i];
      var targetId = normalizeUiModelId(entry && entry.target && entry.target.id);
      if (targetId === normalizedModelId || allowActiveFallback) {
        out.push(entry);
      }
    }

    return out;
  };

  BricksAPI.prototype.refreshActiveSelectionUiFromCanonical = function (modelId, canonicalModel, opts) {
    opts = opts || {};
    modelId = String(modelId || '');
    if (!modelId || !canonicalModel) return false;

    var changed = false;
    var cloneTargets = this._getActiveSelectionUiCloneTargets(modelId);
    for (var i = 0; i < cloneTargets.length; i++) {
      var cloneEntry = cloneTargets[i];
      try {
        changed = this._patchActiveUiCloneFromCanonical(cloneEntry.target, canonicalModel, {
          uiKind: cloneEntry.path,
          syncGlobalClasses: opts.syncGlobalClasses !== false,
          managedSettingKeys: opts.managedSettingKeys || []
        }) || changed;
      } catch (e) { _warn("refreshActiveSelectionUiFromCanonical", e); }
    }

    if (changed) {
      try {
        this._touchBuilderUi({ includeBricksDataTimestamp: false });
      } catch (eTouch) { _warn("refreshActiveSelectionUiFromCanonical", eTouch); }
    }
    return changed;
  };

  BricksAPI.prototype.renderElementInBuilder = function (id) {
    id = String(id || '');
    if (!id) return false;
    var hooks = this._getBuilderRefreshHooks();
    var renderElement = hooks && hooks.renderElement;
    try {
      if (renderElement && typeof renderElement.fn === 'function') {
        renderElement.fn.call(renderElement.owner, id);
        return true;
      }
    } catch (e) { _warn("renderElementInBuilder", e); }
    return false;
  };

  BricksAPI.prototype._getBricksGenerateCssFn = function () {
    var hooks = this._getBuilderRefreshHooks();
    var generateCss = hooks && hooks.generateCss;
    if (generateCss && typeof generateCss.fn === 'function') {
      return function () {
        return generateCss.fn.apply(generateCss.owner, arguments);
      };
    }
    return null;
  };

  BricksAPI.prototype.getNativeGeneratedCssPreviewByDom = function (domEl, opts) {
    opts = opts || {};
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');
    var result = {
      ok: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      modelName: model && model.name ? String(model.name) : '',
      source: '',
      css: ''
    };

    if (!model || !modelId) {
      result.reason = 'model-not-found';
      return result;
    }

    var generateFn = this._getBricksGenerateCssFn();
    var elementTypeUnsupportedRe = /cssType\s+["']element["']\s+is\s+not\s+defined/i;
    var invokeGenerateCssElement = function (input, selectors) {
      var out = {
        raw: '',
        error: '',
        warning: '',
        unsupportedElementType: false
      };
      var originalWarn = null;
      var capturedWarn = '';
      if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
        originalWarn = console.warn;
        try {
          console.warn = function () {
            var parts = [];
            for (var a = 0; a < arguments.length; a++) {
              parts.push(String(arguments[a] == null ? '' : arguments[a]));
            }
            var msg = parts.join(' ').replace(/\s+/g, ' ').trim();
            if (msg && !capturedWarn) capturedWarn = msg;
            if (elementTypeUnsupportedRe.test(msg)) return;
            try {
              return originalWarn.apply(console, arguments);
            } catch (eWarnForward) {
              return undefined;
            }
          };
        } catch (eWarnPatch) {
          originalWarn = null;
        }
      }

      try {
        var generated = generateFn('element', input, selectors || []);
        out.raw = typeof generated === 'string' ? generated : String(generated == null ? '' : generated);
      } catch (eGen) {
        out.error = eGen && eGen.message ? eGen.message : String(eGen);
      } finally {
        if (originalWarn) {
          try {
            console.warn = originalWarn;
          } catch (eWarnRestore) { _warn("warn", eWarnRestore); }
        }
      }

      if (capturedWarn) out.warning = capturedWarn;
      if (elementTypeUnsupportedRe.test(String(out.error || '')) || elementTypeUnsupportedRe.test(String(out.warning || ''))) {
        out.unsupportedElementType = true;
      }
      out.raw = String(out.raw || '').replace(/\r\n/g, '\n').trim();
      return out;
    };
    if (typeof generateFn === 'function' && !this._generateCssElementTypeUnsupported) {
      try {
        var modelInput = deepCloneBestEffort(model) || model;
        var elementName = String((modelInput && modelInput.name) || model.name || '');
        var generatedElement = invokeGenerateCssElement(modelInput, elementName ? [elementName] : []);
        if (generatedElement.unsupportedElementType) {
          this._generateCssElementTypeUnsupported = true;
          result.generateError = String(generatedElement.error || generatedElement.warning || '');
        } else if (generatedElement.raw && /{/.test(generatedElement.raw)) {
          result.ok = true;
          result.reason = 'ok';
          result.source = '$_generateCss';
          result.css = generatedElement.raw;
          return result;
        } else if (generatedElement.error) {
          result.generateError = String(generatedElement.error || '');
        }
      } catch (e) {
        var genMsg = e && e.message ? e.message : String(e);
        if (elementTypeUnsupportedRe.test(genMsg)) {
          this._generateCssElementTypeUnsupported = true;
        }
        result.generateError = genMsg;
      }
    }

    // Fallback: read inline/generated style tag fragments for the element if present.
    try {
      var doc = this.getIframeDocument();
      var cssChunks = [];
      if (doc && modelId) {
        var ids = ['bricks-css-inline-' + modelId, 'bricks-css-' + modelId];
        for (var i = 0; i < ids.length; i++) {
          var node = doc.getElementById(ids[i]);
          var txt = node && typeof node.textContent === 'string' ? node.textContent.trim() : '';
          if (txt && cssChunks.indexOf(txt) === -1) cssChunks.push(txt);
        }
      }
      if (!cssChunks.length && doc && modelId) {
        var elementSelector = '#brxe-' + String(modelId);
        var selectorCss = this._findIframeStyleCssBySelectorPattern(elementSelector);
        if (selectorCss) {
          cssChunks.push(selectorCss);
        }
      }
      if (cssChunks.length) {
        result.ok = true;
        result.reason = 'ok';
        result.source = cssChunks.length && /#brxe-/.test(cssChunks[0]) ? 'iframe-style-search(#brxe-' + modelId + ')' : 'iframe-style-tag';
        result.css = cssChunks.join('\n\n');
        return result;
      }
    } catch (e2) {
      result.fallbackError = e2 && e2.message ? e2.message : String(e2);
    }

    result.reason = 'native-css-preview-unavailable';
    return result;
  };

  BricksAPI.prototype.getNativeGeneratedCssPreviewForGlobalClass = function (ref, opts) {
    opts = opts || {};
    ref = String(ref || '').trim();
    var result = {
      ok: false,
      reason: '',
      ref: ref,
      id: '',
      name: '',
      source: '',
      css: ''
    };
    if (!ref) {
      result.reason = 'empty-class-ref';
      return result;
    }

    var found = this._findGlobalClassEntry(ref);
    if (!found || !found.entry) {
      result.reason = 'global-class-not-found';
      return result;
    }

    result.id = String(found.id || '');
    result.name = String(found.name || '');

    var generateFn = this._getBricksGenerateCssFn();
    var classTypeUnsupportedRe = /cssType\s+["']class["']\s+is\s+not\s+defined/i;
    var invokeGenerateCssClass = function (input, selectors) {
      var out = {
        raw: '',
        error: '',
        warning: '',
        unsupportedClassType: false
      };
      var originalWarn = null;
      var capturedWarn = '';
      if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
        originalWarn = console.warn;
        try {
          console.warn = function () {
            var parts = [];
            for (var a = 0; a < arguments.length; a++) {
              parts.push(String(arguments[a] == null ? '' : arguments[a]));
            }
            var msg = parts.join(' ').replace(/\s+/g, ' ').trim();
            if (msg && !capturedWarn) capturedWarn = msg;
            if (classTypeUnsupportedRe.test(msg)) return;
            try {
              return originalWarn.apply(console, arguments);
            } catch (eWarnForward) {
              return undefined;
            }
          };
        } catch (eWarnPatch) {
          originalWarn = null;
        }
      }

      try {
        var generated = generateFn('class', input, selectors || []);
        out.raw = typeof generated === 'string' ? generated : String(generated == null ? '' : generated);
      } catch (eGen) {
        out.error = eGen && eGen.message ? eGen.message : String(eGen);
      } finally {
        if (originalWarn) {
          try {
            console.warn = originalWarn;
          } catch (eWarnRestore) { _warn("warn", eWarnRestore); }
        }
      }

      if (capturedWarn) out.warning = capturedWarn;
      if (classTypeUnsupportedRe.test(String(out.error || '')) || classTypeUnsupportedRe.test(String(out.warning || ''))) {
        out.unsupportedClassType = true;
      }
      out.raw = String(out.raw || '').replace(/\r\n/g, '\n').trim();
      return out;
    };
    if (typeof generateFn === 'function' && !this._generateCssClassTypeUnsupported) {
      // Prefer the reactive activeClass UI clone when it matches the requested class.
      // Bricks may update class-edit UI state before the registry array is fully synchronized.
      try {
        var activeInfo = this._readActiveClassUiInfo();
        var refName = normalizeClassNameLike(ref);
        var activeMatches = !!(
          activeInfo &&
          activeInfo.raw &&
          typeof activeInfo.raw === 'object' &&
          (
            (activeInfo.id && (ref === String(activeInfo.id))) ||
            (refName && activeInfo.name && refName === String(activeInfo.name))
          )
        );
        if (activeMatches) {
          var activeClassClone = deepCloneBestEffort(activeInfo.raw) || activeInfo.raw;
          var activeGenerated = invokeGenerateCssClass(activeClassClone, []);
          if (activeGenerated.unsupportedClassType) {
            this._generateCssClassTypeUnsupported = true;
            result.activeGenerateError = String(activeGenerated.error || activeGenerated.warning || '');
          } else if (activeGenerated.raw && /{/.test(activeGenerated.raw)) {
            result.ok = true;
            result.reason = 'ok';
            result.source = 'activeClass.$_generateCss(class)';
            result.css = activeGenerated.raw;
            return result;
          } else if (activeGenerated.error) {
            result.activeGenerateError = String(activeGenerated.error || '');
          }
        }
      } catch (activeErr) {
        var activeMsg = activeErr && activeErr.message ? activeErr.message : String(activeErr);
        if (classTypeUnsupportedRe.test(activeMsg)) {
          this._generateCssClassTypeUnsupported = true;
        }
        result.activeGenerateError = activeMsg;
      }
      if (!this._generateCssClassTypeUnsupported) {
        try {
          var classEntryInput = deepCloneBestEffort(found.entry) || found.entry;
          var generatedClass = invokeGenerateCssClass(classEntryInput, []);
          if (generatedClass.unsupportedClassType) {
            this._generateCssClassTypeUnsupported = true;
            result.generateError = String(generatedClass.error || generatedClass.warning || '');
          } else if (generatedClass.raw && /{/.test(generatedClass.raw)) {
            result.ok = true;
            result.reason = 'ok';
            result.source = '$_generateCss(class)';
            result.css = generatedClass.raw;
            return result;
          } else if (generatedClass.error) {
            result.generateError = String(generatedClass.error || '');
          }
        } catch (e) {
          var genMsg = e && e.message ? e.message : String(e);
          if (classTypeUnsupportedRe.test(genMsg)) {
            this._generateCssClassTypeUnsupported = true;
          }
          result.generateError = genMsg;
        }
      }
    }

    // Fallback: search iframe <style> blocks for rules mentioning the class selector.
    try {
      var className = String(found.name || '').trim();
      if (className) {
        var styleCss = this._findIframeStyleCssByClassName(className);
        if (styleCss) {
          result.ok = true;
          result.reason = 'ok';
          result.source = 'iframe-style-search(.' + className + ')';
          result.css = styleCss;
          return result;
        }
      }
    } catch (styleSearchErr) {
      result.styleSearchError = styleSearchErr && styleSearchErr.message ? styleSearchErr.message : String(styleSearchErr);
    }

    // Fallback: expose class-level custom CSS if present.
    try {
      var classSettings = found.entry && isObject(found.entry.settings) ? found.entry.settings : {};
      var classCustomCss = typeof classSettings._cssCustom === 'string' ? classSettings._cssCustom.trim() : '';
      if (classCustomCss) {
        result.ok = true;
        result.reason = 'ok';
        result.source = 'globalClass.settings._cssCustom';
        result.css = classCustomCss;
        return result;
      }
    } catch (e2) {
      result.fallbackError = e2 && e2.message ? e2.message : String(e2);
    }

    result.reason = 'native-class-css-preview-unavailable';
    return result;
  };

  BricksAPI.prototype._findIframeStyleCssByClassName = function (className) {
    className = String(className || '').trim();
    if (!className) return '';
    var doc = this.getIframeDocument();
    if (!doc) return '';
    var styles = Array.prototype.slice.call(doc.querySelectorAll('style'));
    if (!styles.length) return '';

    var re = new RegExp('(^|[^A-Za-z0-9_-])\\.' + escapeRegExp(className) + '([^A-Za-z0-9_-]|$)');
    var chunks = [];
    for (var i = 0; i < styles.length; i++) {
      var txt = String((styles[i] && styles[i].textContent) || '').trim();
      if (!txt) continue;
      if (!re.test(txt)) continue;
      if (chunks.indexOf(txt) !== -1) continue;
      chunks.push(txt);
      if (chunks.length >= 2) break;
    }
    return chunks.join('\n\n').trim();
  };

  BricksAPI.prototype._findIframeStyleCssBySelectorPattern = function (selectorText) {
    selectorText = String(selectorText || '').trim();
    if (!selectorText) return '';
    var doc = this.getIframeDocument();
    if (!doc) return '';
    var styles = Array.prototype.slice.call(doc.querySelectorAll('style'));
    if (!styles.length) return '';

    var needle = selectorText.toLowerCase();
    var chunks = [];
    for (var i = 0; i < styles.length; i++) {
      var txt = String((styles[i] && styles[i].textContent) || '').trim();
      if (!txt) continue;
      if (txt.toLowerCase().indexOf(needle) === -1) continue;
      if (chunks.indexOf(txt) !== -1) continue;
      chunks.push(txt);
      if (chunks.length >= 2) break;
    }
    return chunks.join('\n\n').trim();
  };

  BricksAPI.prototype._isStateSyncableCustomAttrName = function (name) {
    name = String(name || '').toLowerCase();
    if (!name) return false;
    if (/^aria-/.test(name)) return true;
    if (/^data-/.test(name)) return true;
    if (name === 'role') return true;
    if (/^item(scope|type|prop|id|ref)$/.test(name)) return true;
    if (name === 'title') return true;
    return false;
  };

  BricksAPI.prototype._syncSettingsCustomAttributes = function (settings, desiredAttrs) {
    settings = isObject(settings) ? settings : {};
    desiredAttrs = isObject(desiredAttrs) ? desiredAttrs : {};

    var out = {
      changed: false,
      attempted: 0,
      changedCount: 0,
      unsupported: [],
      nextAttributes: Array.isArray(settings._attributes) ? settings._attributes.slice() : []
    };

    var desiredSyncable = {};
    Object.keys(desiredAttrs).forEach(function (name) {
      var v = desiredAttrs[name];
      if (this._isStateSyncableCustomAttrName(name)) {
        desiredSyncable[String(name)] = String(v == null ? '' : v);
        out.attempted++;
      } else {
        out.unsupported.push(String(name));
      }
    }, this);

    var existing = Array.isArray(settings._attributes) ? settings._attributes : [];
    var next = [];
    var seenManaged = {};

    for (var i = 0; i < existing.length; i++) {
      var entry = existing[i];
      if (!entry || typeof entry !== 'object') {
        next.push(entry);
        continue;
      }

      var rawName = entry.name != null ? entry.name : entry.key;
      var attrName = String(rawName || '');
      if (!attrName || !this._isStateSyncableCustomAttrName(attrName)) {
        next.push(entry);
        continue;
      }

      // Deduplicate managed attrs by name; keep first canonicalized entry.
      if (seenManaged[attrName]) {
        out.changed = true;
        continue;
      }
      seenManaged[attrName] = true;

      if (!hasOwn(desiredSyncable, attrName)) {
        out.changed = true; // remove managed attr absent from desired HTML subset
        out.changedCount++;
        continue;
      }

      var nextVal = desiredSyncable[attrName];
      var currentVal = String(entry.value == null ? '' : entry.value);
      var nextEntry = Object.assign({}, entry, { name: attrName, value: nextVal });
      if (hasOwn(nextEntry, 'key')) nextEntry.key = attrName;
      if (currentVal !== nextVal || String(rawName || '') !== attrName) {
        out.changed = true;
        out.changedCount++;
      }
      next.push(nextEntry);
    }

    Object.keys(desiredSyncable).forEach(function (attrName) {
      if (seenManaged[attrName]) return;
      next.push({ name: attrName, value: desiredSyncable[attrName] });
      out.changed = true;
      out.changedCount++;
    });

    out.nextAttributes = next;
    return out;
  };

  BricksAPI.prototype._normalizeClassNameList = function (input) {
    var arr = Array.isArray(input) ? input : String(input || '').split(/\s+/);
    var out = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
      var name = String(arr[i] == null ? '' : arr[i]).trim();
      if (!name || seen[name]) continue;
      seen[name] = true;
      out.push(name);
    }
    return out;
  };

  BricksAPI.prototype._equalStringArrays = function (a, b) {
    a = Array.isArray(a) ? a : [];
    b = Array.isArray(b) ? b : [];
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (String(a[i]) !== String(b[i])) return false;
    }
    return true;
  };

  BricksAPI.prototype._normalizeGlobalClassIdList = function (input) {
    if (!Array.isArray(input)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < input.length; i++) {
      var raw = input[i];
      var id = '';
      if (raw && typeof raw === 'object') {
        id = String(raw.id || raw.value || '');
      } else {
        id = String(raw || '');
      }
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  };

  BricksAPI.prototype._normalizeHtmlTagName = function (tagName, fallbackTag) {
    var fallback = String(fallbackTag || 'div').toLowerCase();
    var normalized = String(tagName || '').trim().toLowerCase();
    if (!normalized) return fallback;
    if (!/^[a-z][a-z0-9-]*$/.test(normalized)) return fallback;
    return normalized;
  };

  BricksAPI.prototype._defaultSemanticTagForModel = function (modelName) {
    modelName = String(modelName || '').trim().toLowerCase();
    if (modelName === 'div') return 'div';
    if (modelName === 'section') return 'section';
    if (modelName === 'text-basic') return 'p';
    if (modelName === 'text-link') return 'a';
    if (modelName === 'button') return 'button';
    return '';
  };

  BricksAPI.prototype._isSemanticTagAllowedForModel = function (modelName, semanticTag) {
    modelName = String(modelName || '').trim().toLowerCase();
    var tag = this._normalizeHtmlTagName(semanticTag, '');
    if (!tag) return false;

    if (modelName === 'heading') return /^h[1-6]$/.test(tag);
    if (modelName === 'div') return !!HTML_SYNC_SEMANTIC_DIV_TAGS[tag];
    if (modelName === 'section') return !!(
      tag === 'section' ||
      tag === 'div' ||
      tag === 'header' ||
      tag === 'footer' ||
      tag === 'main' ||
      tag === 'article' ||
      tag === 'aside' ||
      tag === 'nav'
    );
    if (modelName === 'text-basic') return !!(
      tag === 'p' ||
      tag === 'span' ||
      tag === 'div' ||
      tag === 'label' ||
      tag === 'legend' ||
      tag === 'figcaption' ||
      tag === 'summary' ||
      tag === 'option'
    );
    if (modelName === 'text-link') return (tag === 'a' || tag === 'span');
    if (modelName === 'button') return (tag === 'button' || tag === 'a');
    return false;
  };

  BricksAPI.prototype._applySemanticTagSubset = function (modelName, settings, nextSettings, requestedTag) {
    var result = {
      attempted: false,
      changed: false,
      supported: false,
      reason: ''
    };

    if (typeof requestedTag === 'undefined') return result;
    result.attempted = true;

    var nextTag = this._normalizeHtmlTagName(requestedTag, '');
    if (!nextTag) {
      result.reason = 'invalid-tag';
      return result;
    }

    modelName = String(modelName || '').trim().toLowerCase();
    if (!this._isSemanticTagAllowedForModel(modelName, nextTag)) {
      result.reason = 'unsupported-tag-for-model';
      return result;
    }
    result.supported = true;

    var defaultTag = this._defaultSemanticTagForModel(modelName);
    var currentTag = this._normalizeHtmlTagName(settings && settings.tag, '');
    if (defaultTag && nextTag === defaultTag) {
      if (currentTag && hasOwn(nextSettings, 'tag')) {
        delete nextSettings.tag;
        result.changed = true;
      } else {
        result.reason = 'already-synced';
      }
      return result;
    }

    if (currentTag !== nextTag) {
      nextSettings.tag = nextTag;
      result.changed = true;
      return result;
    }

    result.reason = 'already-synced';
    return result;
  };

  BricksAPI.prototype._mapHtmlTagToBricksElement = function (tagName) {
    var tag = this._normalizeHtmlTagName(tagName, 'div');
    return HTML_SYNC_TAG_TO_BRICKS[tag] || { name: 'div', label: 'Div' };
  };

  BricksAPI.prototype._isHtmlSyncTextElementName = function (name) {
    name = String(name || '').trim().toLowerCase();
    if (!name) return false;
    return !!HTML_SYNC_TEXT_ELEMENTS[name];
  };

  BricksAPI.prototype._isBuilderSystemClassName = function (name) {
    name = String(name || '');
    if (!name) return false;
    if (/^brxe-/.test(name)) return true;
    if (/^brx-/.test(name)) return true;
    if (/^brxc-/.test(name)) return true;
    if (/^bricks-/.test(name)) return true;
    if (/^is-active-/.test(name)) return true;
    if (/^is-hover-/.test(name)) return true;
    if (/^sortable/.test(name)) return true;
    if (/^ui-/.test(name)) return true;
    if (/^vue-/.test(name)) return true;
    if (/^selected$/.test(name)) return true;
    if (/^active$/.test(name)) return true;
    return false;
  };

  BricksAPI.prototype._extractUserClassesFromDom = function (domEl) {
    if (!domEl || !domEl.classList) return [];
    var classes = Array.prototype.slice.call(domEl.classList || []);
    var out = [];
    for (var i = 0; i < classes.length; i++) {
      var cls = String(classes[i] || '').trim();
      if (!cls || this._isBuilderSystemClassName(cls)) continue;
      out.push(cls);
    }
    return this._normalizeClassNameList(out);
  };

  BricksAPI.prototype._extractParsedUserClasses = function (node) {
    if (!node || !node.classList) return [];
    var classes = Array.prototype.slice.call(node.classList || []);
    var out = [];
    for (var i = 0; i < classes.length; i++) {
      var cls = String(classes[i] || '').trim();
      if (!cls || this._isBuilderSystemClassName(cls)) continue;
      out.push(cls);
    }
    return this._normalizeClassNameList(out);
  };

  BricksAPI.prototype._extractParsedManagedAttrs = function (node) {
    var out = {};
    if (!node || !node.attributes) return out;
    var attrs = Array.prototype.slice.call(node.attributes || []);
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var name = String(attr && attr.name || '').toLowerCase();
      if (!name) continue;
      if (name === 'class' || name === 'id' || name === 'style') continue;
      if (name === 'data-bid' || name === 'data-id') continue;
      if (this._isBuilderDataAttr(name)) continue;
      if (!this._isStateSyncableCustomAttrName(name)) continue;
      out[name] = String(attr.value == null ? '' : attr.value);
    }
    return out;
  };

  BricksAPI.prototype._extractParsedTextContent = function (node, elementName) {
    if (!node) return '';
    if (this._isHtmlSyncTextElementName(elementName)) {
      return String(node.innerHTML == null ? '' : node.innerHTML);
    }
    if (!node.childNodes) return '';
    var chunks = [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (!child || child.nodeType !== 3) continue;
      var text = String(child.textContent || '').trim();
      if (!text) continue;
      chunks.push(text);
    }
    return chunks.join(' ');
  };

  BricksAPI.prototype._getParsedElementChildren = function (node) {
    if (!node || !node.childNodes) return [];
    var out = [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (!child || child.nodeType !== 1) continue;
      out.push(child);
    }
    return out;
  };

  BricksAPI.prototype._collectElementStateStores = function () {
    var out = [];
    var seen = [];
    var storeKeys = ['content', 'header', 'footer', 'elements'];

    function pushStore(arr, path) {
      if (!Array.isArray(arr)) return;
      if (seen.indexOf(arr) !== -1) return;
      seen.push(arr);
      out.push({ arr: arr, path: path });
    }

    var roots = this._getElementStateRootEntries();
    for (var r = 0; r < roots.length; r++) {
      var entry = roots[r];
      var root = entry && entry.root;
      var basePath = entry && entry.path ? String(entry.path) : '';
      if (!root || typeof root !== 'object') continue;

      for (var i = 0; i < storeKeys.length; i++) {
        var key = storeKeys[i];
        try {
          pushStore(root[key], basePath + '.' + key);
        } catch (e0) { _warn("_collectElementStateStores", e0); }
      }

      try {
        pushStore(root.pageData && root.pageData.elements, basePath + '.pageData.elements');
      } catch (e1) { _warn("_collectElementStateStores", e1); }
    }

    return out;
  };

  BricksAPI.prototype._findStoreContainingElementId = function (stores, modelId) {
    modelId = String(modelId || '');
    if (!modelId) return null;
    stores = Array.isArray(stores) ? stores : [];
    for (var si = 0; si < stores.length; si++) {
      var store = stores[si];
      if (!store || !Array.isArray(store.arr)) continue;
      for (var i = 0; i < store.arr.length; i++) {
        var node = store.arr[i];
        if (!node || typeof node !== 'object') continue;
        if (String(node.id || '') === modelId) return store;
      }
    }
    return null;
  };

  BricksAPI.prototype._resolvePrimaryElementStore = function (stores, parentId) {
    stores = Array.isArray(stores) ? stores : [];
    parentId = String(parentId || '');
    if (parentId) {
      var byParent = this._findStoreContainingElementId(stores, parentId);
      if (byParent) return byParent;
    }
    for (var i = 0; i < stores.length; i++) {
      var path = String(stores[i] && stores[i].path || '');
      if (/content/i.test(path)) return stores[i];
    }
    for (i = 0; i < stores.length; i++) {
      path = String(stores[i] && stores[i].path || '');
      if (/elements/i.test(path)) return stores[i];
    }
    return stores.length ? stores[0] : null;
  };

  BricksAPI.prototype._insertModelIntoStoreArray = function (storeArr, model, beforeId) {
    if (!Array.isArray(storeArr) || !model || typeof model !== 'object') return false;
    var modelId = String(model.id || '');
    if (!modelId) return false;

    var existingIdx = -1;
    for (var i = 0; i < storeArr.length; i++) {
      if (String(storeArr[i] && storeArr[i].id || '') === modelId) {
        existingIdx = i;
        break;
      }
    }
    if (existingIdx !== -1) return false;

    beforeId = String(beforeId || '');
    if (beforeId) {
      for (i = 0; i < storeArr.length; i++) {
        if (String(storeArr[i] && storeArr[i].id || '') === beforeId) {
          storeArr.splice(i, 0, model);
          return true;
        }
      }
    }
    storeArr.push(model);
    return true;
  };

  BricksAPI.prototype._removeElementIdsFromStores = function (stores, idSet) {
    stores = Array.isArray(stores) ? stores : [];
    idSet = isObject(idSet) ? idSet : {};
    var removed = 0;
    var refsPruned = 0;

    for (var si = 0; si < stores.length; si++) {
      var store = stores[si];
      if (!store || !Array.isArray(store.arr)) continue;
      var arr = store.arr;

      for (var i = arr.length - 1; i >= 0; i--) {
        var model = arr[i];
        var modelId = String(model && model.id || '');
        if (!modelId || !idSet[modelId]) continue;
        arr.splice(i, 1);
        removed++;
      }
    }

    // Ensure all parent child refs are pruned in all known stores.
    for (si = 0; si < stores.length; si++) {
      store = stores[si];
      if (!store || !Array.isArray(store.arr)) continue;
      arr = store.arr;
      for (i = 0; i < arr.length; i++) {
        model = arr[i];
        if (!model || !Array.isArray(model.children)) continue;
        var nextChildren = [];
        for (var ci = 0; ci < model.children.length; ci++) {
          var cid = String(model.children[ci] || '');
          if (!cid || idSet[cid]) {
            if (cid && idSet[cid]) refsPruned++;
            continue;
          }
          nextChildren.push(cid);
        }
        if (!this._equalStringArrays(model.children, nextChildren)) {
          model.children.splice(0, model.children.length);
          for (ci = 0; ci < nextChildren.length; ci++) model.children.push(nextChildren[ci]);
        }
      }
    }

    return { removed: removed, refsPruned: refsPruned };
  };

  BricksAPI.prototype._collectDescendantElementIds = function (rootId) {
    rootId = String(rootId || '');
    if (!rootId) return [];
    var out = [];
    var stack = [rootId];
    var seen = {};
    while (stack.length) {
      var id = String(stack.pop() || '');
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
      var model = this.getElementModelById(id);
      if (!model || !Array.isArray(model.children)) continue;
      for (var i = model.children.length - 1; i >= 0; i--) {
        var childId = String(model.children[i] || '');
        if (!childId || seen[childId]) continue;
        stack.push(childId);
      }
    }
    return out;
  };

  BricksAPI.prototype._removeElementSubtreeById = function (rootId, stores, summary) {
    rootId = String(rootId || '');
    if (!rootId) return false;
    var ids = this._collectDescendantElementIds(rootId);
    if (!ids.length) return false;
    var idSet = {};
    for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;
    var removed = this._removeElementIdsFromStores(stores, idSet);
    if (summary && typeof summary === 'object') {
      summary.deletedNodes += ids.length;
      summary.removedStoreEntries += removed.removed;
      summary.removedRefs += removed.refsPruned;
    }
    return (removed.removed > 0) || (removed.refsPruned > 0);
  };

  BricksAPI.prototype._generateHtmlSyncId = function (prefix) {
    prefix = String(prefix || 'e').trim().toLowerCase();
    if (!/^[a-z]/.test(prefix)) prefix = 'e';

    var admin = this.getAdmin();
    try {
      if (admin && admin.vueGlobalProp && typeof admin.vueGlobalProp.$_generateId === 'function') {
        var nativeId = String(admin.vueGlobalProp.$_generateId() || '');
        if (nativeId && !this.getElementModelById(nativeId)) return nativeId;
      }
    } catch (e) { _warn("_generateHtmlSyncId", e); }

    for (var i = 0; i < 24; i++) {
      var candidate = prefix.charAt(0) + Math.random().toString(36).slice(2, 8);
      if (!this.getElementModelById(candidate)) return candidate;
    }
    return prefix.charAt(0) + String(Date.now() % 1000000);
  };

  BricksAPI.prototype._collectCustomAttrsFromParsedNode = function (node) {
    var out = [];
    if (!node || !node.attributes) return out;
    var attrs = Array.prototype.slice.call(node.attributes || []);
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var name = String(attr && attr.name || '').toLowerCase();
      if (!name) continue;
      if (name === 'class' || name === 'style' || name === 'id') continue;
      if (name === 'data-bid' || name === 'data-id') continue;
      if (this._isBuilderDataAttr(name)) continue;
      out.push({
        id: this._generateHtmlSyncId('attr'),
        name: name,
        value: String(attr.value == null ? '' : attr.value)
      });
    }
    return out;
  };

  BricksAPI.prototype._buildNewElementModelFromParsedNode = function (node, parentId, preferredId) {
    var tag = this._normalizeHtmlTagName(node && node.tagName, 'div');
    var mapping = this._mapHtmlTagToBricksElement(tag);
    var suggestedId = String(preferredId || '').trim();
    if (suggestedId && this.getElementModelById(suggestedId)) suggestedId = '';
    var newId = suggestedId || this._generateHtmlSyncId(mapping && mapping.name ? mapping.name : 'e');

    var model = {
      id: newId,
      name: mapping.name || 'div',
      parent: String(parentId || ''),
      children: [],
      settings: {},
      label: mapping.label || 'Element'
    };

    var userClasses = this._extractParsedUserClasses(node);
    if (userClasses.length) model.settings._cssClasses = userClasses.join(' ');

    var cssId = String(node && node.getAttribute ? (node.getAttribute('id') || '') : '').trim();
    if (cssId) model.settings._cssId = cssId;

    var inlineCss = String(node && node.getAttribute ? (node.getAttribute('style') || '') : '').trim();
    if (inlineCss) model.settings._inlineCSS = inlineCss;

    var customAttrs = this._collectCustomAttrsFromParsedNode(node);
    if (customAttrs.length) model.settings._attributes = customAttrs;

    var text = this._extractParsedTextContent(node, model.name);
    if (text && this._isHtmlSyncTextElementName(model.name)) {
      model.settings.text = text;
    }

    if (model.name === 'heading') {
      model.settings.tag = tag;
    } else if (model.name === 'div' && tag !== 'div') {
      model.settings.tag = tag;
    }

    return model;
  };

  BricksAPI.prototype._applySafeSubsetStateById = function (modelId, subset, opts) {
    opts = opts || {};
    subset = subset || {};
    modelId = String(modelId || '');
    var model = modelId ? this.getElementModelById(modelId) : null;

    var result = {
      ok: false,
      changed: false,
      reason: '',
      id: modelId,
      modelName: '',
      text: { attempted: false, changed: false, supported: false, reason: '' },
      cssId: { attempted: false, changed: false, supported: false, reason: '' },
      semantic: { attempted: false, changed: false, supported: false, reason: '' },
      attrs: { attempted: false, changed: false, supported: true, unsupported: [], changedCount: 0 },
      classes: { attempted: false, changed: false, supported: false, reason: 'not-implemented' }
    };

    if (!model) {
      result.reason = 'model-not-found';
      return result;
    }

    var name = String(model.name || '').toLowerCase();
    result.modelName = name || '';

    var settings = isObject(model.settings) ? model.settings : {};
    var nextSettings = Object.assign({}, settings);
    var anyChanged = false;

    if (hasOwn(subset, 'text')) {
      result.text.attempted = true;
      var normalizedText = String(subset.text == null ? '' : subset.text);
      var hasExplicitTextField = hasOwn(settings, 'text');
      var textishByName = /^(text|rich-text|heading|button|text-basic|text-link|post-title|post-excerpt|post-content)$/.test(name);
      if (hasExplicitTextField || textishByName) {
        result.text.supported = true;
        var currentText = String(settings.text == null ? '' : settings.text);
        if (currentText !== normalizedText) {
          nextSettings.text = normalizedText;
          result.text.changed = true;
          anyChanged = true;
        } else {
          result.text.reason = 'already-synced';
        }
      } else {
        result.text.reason = 'unsupported-element-type';
      }
    }

    if (hasOwn(subset, 'idRaw')) {
      result.cssId.attempted = true;
      result.cssId.supported = true;
      var nextCssId = String(subset.idRaw == null ? '' : subset.idRaw);
      var currentCssId = String(settings._cssId == null ? '' : settings._cssId);
      if (currentCssId !== nextCssId) {
        nextSettings._cssId = nextCssId;
        result.cssId.changed = true;
        anyChanged = true;
      } else {
        result.cssId.reason = 'already-synced';
      }
    }

    if (hasOwn(subset, 'semanticTag')) {
      var semanticResult = this._applySemanticTagSubset(name, settings, nextSettings, subset.semanticTag);
      result.semantic = semanticResult;
      if (semanticResult.changed) anyChanged = true;
    }

    if (hasOwn(subset, 'attrs')) {
      result.attrs.attempted = true;
      var attrSync = this._syncSettingsCustomAttributes(settings, subset.attrs || {});
      result.attrs.unsupported = attrSync.unsupported || [];
      result.attrs.changedCount = Number(attrSync.changedCount || 0);
      if (attrSync.changed) {
        nextSettings._attributes = attrSync.nextAttributes;
        result.attrs.changed = true;
        anyChanged = true;
      }
    }

    if (hasOwn(subset, 'userClasses') || (hasOwn(subset, 'classChanged') && subset.classChanged)) {
      result.classes.attempted = !!(hasOwn(subset, 'classChanged') ? subset.classChanged : true);
      result.classes.supported = true;

      var classPlan = this._buildClassStatePlan(settings, subset.userClasses || [], subset.originalUserClasses || []);
      var currentLocalStr = classPlan.currentLocalClasses.length ? classPlan.currentLocalClasses.join(' ') : '';
      var nextLocalStr = classPlan.desiredLocalClasses.length ? classPlan.desiredLocalClasses.join(' ') : '';
      if (currentLocalStr !== nextLocalStr) {
        if (nextLocalStr) nextSettings._cssClasses = nextLocalStr;
        else if (hasOwn(nextSettings, '_cssClasses')) delete nextSettings._cssClasses;
        result.classes.changed = true;
        anyChanged = true;
      }

      if (!this._equalStringArrays(classPlan.currentGlobalClassIds, classPlan.desiredGlobalClassIds)) {
        if (classPlan.desiredGlobalClassIds.length) {
          nextSettings._cssGlobalClasses = classPlan.desiredGlobalClassIds.slice();
        } else if (hasOwn(nextSettings, '_cssGlobalClasses')) {
          delete nextSettings._cssGlobalClasses;
        }
        result.classes.changed = true;
        anyChanged = true;
      }

      if (!result.classes.changed) result.classes.reason = 'already-synced';
      else result.classes.reason = 'updated';
      if (classPlan.unresolvedGlobalClassIds.length) {
        result.classes.unresolvedGlobalClassIds = classPlan.unresolvedGlobalClassIds.slice();
      }
    }

    if (!anyChanged) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced-or-unsupported';
      return result;
    }

    try {
      model.settings = nextSettings;
    } catch (e) {
      result.reason = 'state-write-failed';
      result.error = e && e.message ? e.message : String(e);
      return result;
    }

    this.refreshActiveSelectionUiFromCanonical(modelId, model);
    if (result.classes && result.classes.changed) {
      this.reconcileActiveClassUi({ model: model, skipSelectedLookup: true });
    }

    if (!opts.deferUiRefresh) {
      if (result.classes && result.classes.changed && typeof this.notifyGlobalClassesChanged === 'function') {
        try { this.notifyGlobalClassesChanged(); } catch (eN) { _warn("_applySafeSubsetStateById", eN); }
      }
      this._touchBuilderUi();
      this.renderElementInBuilder(modelId);
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    return result;
  };

  BricksAPI.prototype._syncElementTreeFromParsedNode = function (modelId, parsedNode, stores, summary, opts) {
    modelId = String(modelId || '');
    if (!modelId || !parsedNode) return false;
    summary = summary || {};
    opts = opts || {};

    var visited = opts.visited || {};
    if (visited[modelId]) return false;
    visited[modelId] = true;
    opts.visited = visited;

    var changed = false;
    var model = this.getElementModelById(modelId);
    if (!model) return false;

    try {
      if (parsedNode && parsedNode.setAttribute) {
        parsedNode.setAttribute('data-bid', modelId);
      }
    } catch (e0) { _warn("_syncElementTreeFromParsedNode", e0); }

    var actualDom = this._queryElementDomById(modelId);
    var subset = {
      text: this._extractParsedTextContent(parsedNode, model.name),
      idRaw: String(parsedNode.getAttribute ? (parsedNode.getAttribute('id') || '') : ''),
      semanticTag: this._normalizeHtmlTagName(parsedNode && parsedNode.tagName, ''),
      attrs: this._extractParsedManagedAttrs(parsedNode),
      userClasses: this._extractParsedUserClasses(parsedNode),
      originalUserClasses: this._extractUserClassesFromDom(actualDom),
      classChanged: true
    };

    var subsetRes;
    if (actualDom) {
      subsetRes = this.updateElementSafeSubsetStateByDom(actualDom, subset, { deferUiRefresh: true });
    } else {
      subsetRes = this._applySafeSubsetStateById(modelId, subset, { deferUiRefresh: true });
    }
    if (subsetRes && subsetRes.ok && subsetRes.changed) {
      changed = true;
      summary.updatedNodes += 1;
      if (subsetRes.text && subsetRes.text.changed) summary.textOps += 1;
      if (subsetRes.cssId && subsetRes.cssId.changed) summary.idOps += 1;
      if (subsetRes.attrs && subsetRes.attrs.changed) {
        summary.attrOps += Math.max(1, Number(subsetRes.attrs.changedCount || 1));
      }
      if (subsetRes.classes && subsetRes.classes.changed) summary.classOps += 1;
      if (subsetRes.semantic && subsetRes.semantic.changed) summary.semanticOps += 1;
    }

    var parsedChildren = this._getParsedElementChildren(parsedNode);
    if (this._syncChildrenListFromParsed(modelId, parsedChildren, stores, summary, opts)) {
      changed = true;
    }

    return changed;
  };

  BricksAPI.prototype._createElementSubtreeFromParsedNode = function (parsedNode, parentId, stores, summary, opts, beforeId) {
    if (!parsedNode) return { ok: false, id: '' };
    summary = summary || {};
    opts = opts || {};

    var preferredId = String(parsedNode.getAttribute ? (parsedNode.getAttribute('data-bid') || parsedNode.getAttribute('data-id') || '') : '').trim();
    var model = this._buildNewElementModelFromParsedNode(parsedNode, parentId, preferredId);
    var modelId = String(model.id || '');
    if (!modelId) return { ok: false, id: '' };

    var primaryStore = this._resolvePrimaryElementStore(stores, parentId);
    if (!primaryStore || !Array.isArray(primaryStore.arr)) {
      return { ok: false, id: '' };
    }

    this._insertModelIntoStoreArray(primaryStore.arr, model, beforeId);
    summary.createdNodes += 1;
    summary.changed = true;

    try {
      if (parsedNode && parsedNode.setAttribute) {
        parsedNode.setAttribute('data-bid', modelId);
      }
    } catch (e0) { _warn("_createElementSubtreeFromParsedNode", e0); }

    var children = this._getParsedElementChildren(parsedNode);
    for (var i = 0; i < children.length; i++) {
      var childRes = this._createElementSubtreeFromParsedNode(children[i], modelId, stores, summary, opts, '');
      if (childRes && childRes.ok && childRes.id) {
        model.children.push(String(childRes.id));
      }
    }

    return { ok: true, id: modelId };
  };

  BricksAPI.prototype._syncChildrenListFromParsed = function (parentId, parsedChildren, stores, summary, opts) {
    parentId = String(parentId || '');
    if (!parentId) return false;
    parsedChildren = Array.isArray(parsedChildren) ? parsedChildren : [];
    summary = summary || {};
    opts = opts || {};

    var parentModel = this.getElementModelById(parentId);
    if (!parentModel) return false;
    if (!Array.isArray(parentModel.children)) parentModel.children = [];

    var currentChildren = [];
    for (var i = 0; i < parentModel.children.length; i++) {
      var cid = String(parentModel.children[i] || '').trim();
      if (cid) currentChildren.push(cid);
    }

    var nextOrder = [];
    var seenNext = {};
    var changed = false;

    for (i = 0; i < parsedChildren.length; i++) {
      var childNode = parsedChildren[i];
      if (!childNode || childNode.nodeType !== 1) continue;
      var childId = String(childNode.getAttribute('data-bid') || childNode.getAttribute('data-id') || '').trim();
      if (childId === parentId) childId = '';
      if (childId && seenNext[childId]) childId = '';

      var childModel = childId ? this.getElementModelById(childId) : null;
      if (childModel) {
        var oldParentId = String(childModel.parent || '');
        if (oldParentId && oldParentId !== parentId) {
          var oldParent = this.getElementModelById(oldParentId);
          if (oldParent && Array.isArray(oldParent.children)) {
            var oldNext = [];
            for (var oi = 0; oi < oldParent.children.length; oi++) {
              var oldCid = String(oldParent.children[oi] || '');
              if (!oldCid || oldCid === childId) continue;
              oldNext.push(oldCid);
            }
            if (!this._equalStringArrays(oldParent.children, oldNext)) {
              oldParent.children.splice(0, oldParent.children.length);
              for (oi = 0; oi < oldNext.length; oi++) oldParent.children.push(oldNext[oi]);
            }
          }
          childModel.parent = parentId;
          summary.reparentedNodes += 1;
          changed = true;
        } else if (!oldParentId) {
          childModel.parent = parentId;
          summary.reparentedNodes += 1;
          changed = true;
        }

        seenNext[childId] = true;
        nextOrder.push(childId);
        if (this._syncElementTreeFromParsedNode(childId, childNode, stores, summary, opts)) {
          changed = true;
        }
        continue;
      }

      var beforeId = String(currentChildren[i] || '');
      var createRes = this._createElementSubtreeFromParsedNode(childNode, parentId, stores, summary, opts, beforeId);
      if (createRes && createRes.ok && createRes.id) {
        seenNext[createRes.id] = true;
        nextOrder.push(String(createRes.id));
        changed = true;
      }
    }

    for (i = 0; i < currentChildren.length; i++) {
      var prevId = currentChildren[i];
      if (!prevId || seenNext[prevId]) continue;
      if (this._removeElementSubtreeById(prevId, stores, summary)) {
        changed = true;
      }
    }

    var normalizedCurrent = [];
    for (i = 0; i < parentModel.children.length; i++) {
      var ncur = String(parentModel.children[i] || '').trim();
      if (ncur) normalizedCurrent.push(ncur);
    }
    if (!this._equalStringArrays(normalizedCurrent, nextOrder)) {
      parentModel.children.splice(0, parentModel.children.length);
      for (i = 0; i < nextOrder.length; i++) parentModel.children.push(nextOrder[i]);
      summary.reorderedParents += 1;
      changed = true;
    }

    return changed;
  };

  BricksAPI.prototype._syncTopLevelListFromParsed = function (parsedRoots, stores, summary, opts) {
    parsedRoots = Array.isArray(parsedRoots) ? parsedRoots : [];
    stores = Array.isArray(stores) ? stores : [];
    summary = summary || {};
    opts = opts || {};

    var primaryStore = this._resolvePrimaryElementStore(stores, '');
    if (!primaryStore || !Array.isArray(primaryStore.arr)) return false;

    var currentTopLevel = [];
    var currentTopLevelSet = {};
    for (var i = 0; i < primaryStore.arr.length; i++) {
      var model = primaryStore.arr[i];
      if (!model || typeof model !== 'object') continue;
      var modelId = String(model.id || '').trim();
      if (!modelId || currentTopLevelSet[modelId]) continue;
      var parentId = String(model.parent || '').trim();
      if (parentId) continue;
      currentTopLevelSet[modelId] = true;
      currentTopLevel.push(modelId);
    }

    var nextOrder = [];
    var seenNext = {};
    var changed = false;

    for (i = 0; i < parsedRoots.length; i++) {
      var parsedNode = parsedRoots[i];
      if (!parsedNode || parsedNode.nodeType !== 1) continue;

      var parsedId = String(parsedNode.getAttribute('data-bid') || parsedNode.getAttribute('data-id') || '').trim();
      if (parsedId && seenNext[parsedId]) parsedId = '';
      var parsedModel = parsedId ? this.getElementModelById(parsedId) : null;

      if (parsedModel) {
        var existingId = String(parsedModel.id || '').trim();
        if (!existingId || seenNext[existingId]) continue;

        var oldParentId = String(parsedModel.parent || '').trim();
        if (oldParentId) {
          var oldParent = this.getElementModelById(oldParentId);
          if (oldParent && Array.isArray(oldParent.children)) {
            var oldNext = [];
            for (var oi = 0; oi < oldParent.children.length; oi++) {
              var oldCid = String(oldParent.children[oi] || '');
              if (!oldCid || oldCid === existingId) continue;
              oldNext.push(oldCid);
            }
            if (!this._equalStringArrays(oldParent.children, oldNext)) {
              oldParent.children.splice(0, oldParent.children.length);
              for (oi = 0; oi < oldNext.length; oi++) oldParent.children.push(oldNext[oi]);
            }
          }
          parsedModel.parent = '';
          summary.reparentedNodes += 1;
          changed = true;
        }

        if (!currentTopLevelSet[existingId]) {
          var beforeId = String(currentTopLevel[i] || '');
          this._insertModelIntoStoreArray(primaryStore.arr, parsedModel, beforeId);
          currentTopLevelSet[existingId] = true;
          changed = true;
        }

        seenNext[existingId] = true;
        nextOrder.push(existingId);
        if (this._syncElementTreeFromParsedNode(existingId, parsedNode, stores, summary, opts)) {
          changed = true;
        }
        continue;
      }

      var createBeforeId = String(currentTopLevel[i] || '');
      var createRes = this._createElementSubtreeFromParsedNode(parsedNode, '', stores, summary, opts, createBeforeId);
      if (createRes && createRes.ok && createRes.id) {
        seenNext[createRes.id] = true;
        nextOrder.push(String(createRes.id));
        currentTopLevelSet[createRes.id] = true;
        changed = true;
      }
    }

    for (i = 0; i < currentTopLevel.length; i++) {
      var prevId = currentTopLevel[i];
      if (!prevId || seenNext[prevId]) continue;
      if (this._removeElementSubtreeById(prevId, stores, summary)) {
        changed = true;
      }
    }

    var normalizedCurrent = [];
    for (i = 0; i < primaryStore.arr.length; i++) {
      model = primaryStore.arr[i];
      if (!model || typeof model !== 'object') continue;
      modelId = String(model.id || '').trim();
      if (!modelId) continue;
      if (String(model.parent || '').trim()) continue;
      normalizedCurrent.push(modelId);
    }

    if (!this._equalStringArrays(normalizedCurrent, nextOrder)) {
      var nonTopEntries = [];
      var topLevelModels = {};
      var topLevelInsertIdx = -1;

      for (i = 0; i < primaryStore.arr.length; i++) {
        model = primaryStore.arr[i];
        if (!model || typeof model !== 'object') {
          nonTopEntries.push(model);
          continue;
        }
        modelId = String(model.id || '').trim();
        if (modelId && !String(model.parent || '').trim()) {
          if (topLevelInsertIdx === -1) topLevelInsertIdx = nonTopEntries.length;
          topLevelModels[modelId] = model;
          continue;
        }
        nonTopEntries.push(model);
      }

      var orderedTopLevel = [];
      for (i = 0; i < nextOrder.length; i++) {
        var nextId = String(nextOrder[i] || '');
        if (!nextId) continue;
        var topModel = topLevelModels[nextId] || this.getElementModelById(nextId);
        if (topModel) orderedTopLevel.push(topModel);
      }

      if (topLevelInsertIdx < 0) topLevelInsertIdx = nonTopEntries.length;
      var rebuilt = nonTopEntries.slice(0, topLevelInsertIdx)
        .concat(orderedTopLevel)
        .concat(nonTopEntries.slice(topLevelInsertIdx));

      primaryStore.arr.splice(0, primaryStore.arr.length);
      for (i = 0; i < rebuilt.length; i++) primaryStore.arr.push(rebuilt[i]);

      summary.reorderedParents += 1;
      changed = true;
    }

    return changed;
  };

  BricksAPI.prototype.syncHtmlStructureFromParsed = function (ctx, parsedRoots, opts) {
    opts = opts || {};
    parsedRoots = Array.isArray(parsedRoots) ? parsedRoots : [];
    parsedRoots = parsedRoots.filter(function (node) {
      return !!(node && node.nodeType === 1);
    });

    var result = {
      ok: false,
      changed: false,
      reason: '',
      stats: {
        updatedNodes: 0,
        createdNodes: 0,
        deletedNodes: 0,
        reorderedParents: 0,
        reparentedNodes: 0,
        removedStoreEntries: 0,
        removedRefs: 0,
        textOps: 0,
        attrOps: 0,
        classOps: 0,
        semanticOps: 0,
        idOps: 0
      }
    };

    if (!ctx || (ctx.mode !== 'element' && ctx.mode !== 'page')) {
      result.reason = 'unsupported-mode';
      return result;
    }

    var rootId = String(ctx.id || '');
    if (ctx.mode === 'element' && !rootId) {
      result.reason = 'missing-root-id';
      return result;
    }
    var scope = String(ctx && ctx.scope || 'self').toLowerCase();
    if (!parsedRoots.length) {
      var allowEmptyAsDelete = !!(
        ctx.mode === 'page' ||
        (ctx.mode === 'element' && scope === 'children')
      );
      if (!allowEmptyAsDelete) {
        result.reason = 'empty-html';
        return result;
      }
    }

    var stores = this._collectElementStateStores();
    if (!stores.length) {
      result.reason = 'state-stores-not-found';
      return result;
    }

    var summary = result.stats;
    var changed = false;
    if (ctx.mode === 'page') {
      if (this._syncTopLevelListFromParsed(parsedRoots, stores, summary, { visited: {} })) {
        changed = true;
      }
    } else {
      scope = String(ctx.scope || 'self').toLowerCase();
      if (scope === 'children') {
        if (this._syncChildrenListFromParsed(rootId, parsedRoots, stores, summary, { visited: {} })) {
          changed = true;
        }
      } else {
        var parsedRoot = null;
        for (var i = 0; i < parsedRoots.length; i++) {
          var bid = String(parsedRoots[i].getAttribute('data-bid') || parsedRoots[i].getAttribute('data-id') || '').trim();
          if (bid && bid === rootId) {
            parsedRoot = parsedRoots[i];
            break;
          }
        }
        if (!parsedRoot) parsedRoot = parsedRoots[0];
        try {
          if (parsedRoot && parsedRoot.setAttribute) parsedRoot.setAttribute('data-bid', rootId);
        } catch (e0) { _warn("syncHtmlStructureFromParsed", e0); }
        if (this._syncElementTreeFromParsedNode(rootId, parsedRoot, stores, summary, { visited: {} })) {
          changed = true;
        }
      }
    }

    if (!changed) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced';
      return result;
    }

    if (ctx.mode === 'element') {
      try {
        var rootModel = this.getElementModelById(rootId);
        if (rootModel) {
          this.refreshActiveSelectionUiFromCanonical(rootId, rootModel);
          this.reconcileActiveClassUi({ model: rootModel, skipSelectedLookup: true });
        }
      } catch (e1) { _warn("syncHtmlStructureFromParsed", e1); }
    }

    if (summary.classOps > 0 && typeof this.notifyGlobalClassesChanged === 'function') {
      this.notifyGlobalClassesChanged();
    }
    this.notifyContentSettingsChanged();
    this._touchBuilderUi();
    if (ctx.mode === 'element' && rootId) this.renderElementInBuilder(rootId);

    if (!opts.deferUiRefresh) {
      this._requestManualRefresh({ includeSelection: false, reason: 'html-structure-sync' });
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    return result;
  };

  BricksAPI.prototype._getGlobalClassesArray = function () {
    var stores = this._listGlobalClassStores();
    return stores.length ? stores[0].array : [];
  };

  BricksAPI.prototype._looksLikeGlobalClassRegistryArray = function (arr) {
    if (!Array.isArray(arr)) return false;
    if (!arr.length) return true;

    var sampleSize = Math.min(arr.length, 8);
    var objectMatches = 0;
    var primitiveMatches = 0;

    for (var i = 0; i < sampleSize; i++) {
      var entry = arr[i];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        if (
          hasOwn(entry, 'id') ||
          hasOwn(entry, 'name') ||
          hasOwn(entry, 'label') ||
          hasOwn(entry, 'class')
        ) {
          objectMatches++;
          continue;
        }
      }

      if (typeof entry === 'string' || typeof entry === 'number') {
        primitiveMatches++;
      }
    }

    return objectMatches > 0 && objectMatches >= primitiveMatches;
  };

  BricksAPI.prototype._isLikelyGlobalClassStoreKey = function (key) {
    var normalizedKey = String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!normalizedKey) return false;
    if (normalizedKey.indexOf('globalclasses') === -1) return false;
    if (
      normalizedKey.indexOf('trash') !== -1 ||
      normalizedKey.indexOf('locked') !== -1 ||
      normalizedKey.indexOf('categories') !== -1 ||
      normalizedKey.indexOf('timestamp') !== -1 ||
      normalizedKey.indexOf('user') !== -1
    ) {
      return false;
    }
    return true;
  };

  BricksAPI.prototype._collectGlobalClassStores = function () {
    var stores = [];
    var seen = [];
    var self = this;

    function push(arr, path) {
      if (!self._looksLikeGlobalClassRegistryArray(arr)) return;
      if (seen.indexOf(arr) !== -1) return;
      seen.push(arr);
      stores.push({ array: arr, path: path });
    }

    var state = this.getVueState();
    var admin = this.getAdmin();

    push(state && state.globalClasses, 'vueState.globalClasses');
    push(state && state.options && state.options.bricks_global_classes, 'vueState.options.bricks_global_classes');
    push(admin && admin.vueState && admin.vueState.globalClasses, 'admin.vueState.globalClasses');
    push(admin && admin.vueState && admin.vueState.options && admin.vueState.options.bricks_global_classes, 'admin.vueState.options.bricks_global_classes');
    push(admin && admin.vueGlobalProp && admin.vueGlobalProp.globalClasses, 'admin.vueGlobalProp.globalClasses');
    push(admin && admin.vueGlobalProp && admin.vueGlobalProp.options && admin.vueGlobalProp.options.bricks_global_classes, 'admin.vueGlobalProp.options.bricks_global_classes');
    push(w.bricksData && w.bricksData.loadData && w.bricksData.loadData.globalClasses, 'bricksData.loadData.globalClasses');
    push(w.bricksData && w.bricksData.loadData && w.bricksData.loadData.options && w.bricksData.loadData.options.bricks_global_classes, 'bricksData.loadData.options.bricks_global_classes');
    push(w.bricksData && w.bricksData.globalClasses, 'bricksData.globalClasses');
    push(w.bricksData && w.bricksData.options && w.bricksData.options.bricks_global_classes, 'bricksData.options.bricks_global_classes');

    var roots = this._getCompatibilityWalkRoots();

    for (var r = 0; r < roots.length; r++) {
      var rootEntry = roots[r];
      this._walkStateObjects(rootEntry && rootEntry.root, function (node) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return;

        var keys = [];
        try { keys = Object.keys(node); } catch (eKeys) { keys = []; }
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (!self._isLikelyGlobalClassStoreKey(key)) continue;
          var candidate = null;
          try { candidate = node[key]; } catch (eRead) { candidate = null; }
          push(candidate, 'walk.' + key);
        }
      }, 16000);
    }

    return stores;
  };

  BricksAPI.prototype._ensureWritableGlobalClassStores = function () {
    var stores = this._collectGlobalClassStores();
    if (stores.length) return stores;

    var created = [];
    var seen = [];

    function pushCreated(arr, path) {
      if (!Array.isArray(arr)) return;
      if (seen.indexOf(arr) !== -1) return;
      seen.push(arr);
      created.push({ array: arr, path: path });
    }

    function ensureArray(owner, key, path) {
      if (!owner || typeof owner !== 'object') return null;
      if (!Array.isArray(owner[key])) {
        try { owner[key] = []; } catch (e) { return null; }
      }
      pushCreated(owner[key], path);
      return owner[key];
    }

    var state = this.getVueState();
    var admin = this.getAdmin();

    ensureArray(state, 'globalClasses', 'vueState.globalClasses');
    ensureArray(admin && admin.vueState, 'globalClasses', 'admin.vueState.globalClasses');
    ensureArray(admin && admin.vueGlobalProp, 'globalClasses', 'admin.vueGlobalProp.globalClasses');
    ensureArray(w.bricksData && w.bricksData.loadData, 'globalClasses', 'bricksData.loadData.globalClasses');
    ensureArray(w.bricksData, 'globalClasses', 'bricksData.globalClasses');

    return created;
  };

  BricksAPI.prototype._getGlobalClassIndexes = function () {
    var arr = this._getGlobalClassesArray();
    var idToName = {};
    var nameToId = {};
    if (!this._globalClassNameCache || typeof this._globalClassNameCache !== 'object') {
      this._globalClassNameCache = {};
    }
    for (var i = 0; i < arr.length; i++) {
      var cls = arr[i];
      if (!cls || typeof cls !== 'object') continue;
      var id = String(cls.id || '');
      var name = String(cls.name || '');
      if (!id || !name) continue;
      if (!idToName[id]) idToName[id] = name;
      if (!nameToId[name]) nameToId[name] = id;
      this._globalClassNameCache[id] = name;
    }

    // Fallback to last known ID->name pairs to reduce transient unresolved flicker
    // when Bricks global class registries are momentarily out-of-sync.
    var cache = this._globalClassNameCache || {};
    var cacheIds = Object.keys(cache);
    for (i = 0; i < cacheIds.length; i++) {
      var cacheId = cacheIds[i];
      var cacheName = String(cache[cacheId] || '');
      if (!cacheId || !cacheName) continue;
      if (!idToName[cacheId]) idToName[cacheId] = cacheName;
      if (!nameToId[cacheName]) nameToId[cacheName] = cacheId;
    }

    return {
      idToName: idToName,
      nameToId: nameToId
    };
  };

  BricksAPI.prototype._isLikelySafeCssClassName = function (name) {
    name = String(name || '').trim();
    if (!name) return false;
    // Conservative check for unescaped selector-safe names to avoid AT selector crashes.
    if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(name)) return false;
    return true;
  };

  BricksAPI.prototype._generateBricksLikeId = function () {
    var vueProps = this._getVueGlobalProps();
    try {
      if (vueProps && typeof vueProps.$_generateId === 'function') {
        var generated = String(vueProps.$_generateId() || '');
        if (generated) return generated;
      }
    } catch (e) { _warn("_generateBricksLikeId", e); }
    return ('cm6' + Math.random().toString(36).slice(2, 8));
  };

  BricksAPI.prototype._ensureGlobalClassIdByName = function (name) {
    name = String(name || '').trim();
    if (!name) return '';
    if (!this._isLikelySafeCssClassName(name)) return '';

    var indexes = this._getGlobalClassIndexes();
    if (indexes.nameToId[name]) return String(indexes.nameToId[name]);

    var stores = this._ensureWritableGlobalClassStores();
    var arr = stores.length ? stores[0].array : null;
    if (!Array.isArray(arr)) return '';

    var id = this._generateBricksLikeId();
    if (!id) return '';

    var entry = { id: id, name: name, settings: [] };
    try {
      arr.push(entry);
    } catch (e) {
      return '';
    }

    // Best-effort mirror into sibling stores when the builder keeps separate registries in sync.
    for (var s = 0; s < stores.length; s++) {
      var store = stores[s];
      if (!store || !Array.isArray(store.array) || store.array === arr) continue;
      var alreadyPresent = false;
      for (var i = 0; i < store.array.length; i++) {
        var existing = store.array[i];
        if (!existing || typeof existing !== 'object') continue;
        if (String(existing.id || '') === id || String(existing.name || '') === name) {
          alreadyPresent = true;
          break;
        }
      }
      if (alreadyPresent) continue;
      try {
        store.array.push(entry);
      } catch (e2) { _warn("_ensureGlobalClassIdByName", e2); }
    }

    return id;
  };

  BricksAPI.prototype._findGlobalClassEntry = function (ref) {
    ref = String(ref || '').trim();
    if (!ref) return null;
    var arr = this._getGlobalClassesArray();
    if (!Array.isArray(arr) || !arr.length) return null;
    for (var i = 0; i < arr.length; i++) {
      var entry = arr[i];
      if (!entry || typeof entry !== 'object') continue;
      var id = String(entry.id || '');
      var name = String(entry.name || '');
      if (!id && !name) continue;
      if (ref === id || ref === name) {
        return {
          id: id,
          name: name,
          entry: entry,
          array: arr,
          index: i
        };
      }
    }
    return null;
  };

  BricksAPI.prototype._getBricksRootSelectorForElement = function (domEl, id) {
    var domId = '';
    try { domId = String((domEl && domEl.getAttribute && domEl.getAttribute('data-id')) || ''); } catch (e) { _warn("_getBricksRootSelectorForElement", e); domId = ''; }
    var fallbackId = domId || String(id || '');
    return fallbackId ? ('#brxe-' + fallbackId) : '';
  };

  BricksAPI.prototype._stripCssComments = function (cssText) {
    return String(cssText == null ? '' : cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  };

  BricksAPI.prototype._splitCssDeclarations = function (text) {
    text = String(text == null ? '' : text);
    var out = [];
    var buf = '';
    var quote = '';
    var esc = false;
    var parenDepth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        buf += ch;
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === '\'') {
        quote = ch;
        buf += ch;
        continue;
      }
      if (ch === '(') {
        parenDepth++;
        buf += ch;
        continue;
      }
      if (ch === ')') {
        if (parenDepth > 0) parenDepth--;
        buf += ch;
        continue;
      }
      if (ch === ';' && parenDepth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  };

  BricksAPI.prototype._parseDeclarationMap = function (bodyText) {
    var out = {};
    var chunks = this._splitCssDeclarations(bodyText);
    for (var i = 0; i < chunks.length; i++) {
      var part = String(chunks[i] || '').trim();
      if (!part) continue;
      if (part.indexOf('{') >= 0 || part.indexOf('}') >= 0) continue;
      if (/^@/.test(part)) continue;
      var colonIdx = part.indexOf(':');
      if (colonIdx <= 0) continue;
      var prop = part.slice(0, colonIdx).trim().toLowerCase();
      var val = part.slice(colonIdx + 1).trim();
      if (!prop || !val) continue;
      out[prop] = val;
    }
    return out;
  };

  BricksAPI.prototype._tokenizeCssValueList = function (valueText) {
    var text = String(valueText == null ? '' : valueText).trim();
    if (!text) return [];
    var out = [];
    var buf = '';
    var quote = '';
    var esc = false;
    var parenDepth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        buf += ch;
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === '\'') {
        quote = ch;
        buf += ch;
        continue;
      }
      if (ch === '(') {
        parenDepth++;
        buf += ch;
        continue;
      }
      if (ch === ')') {
        if (parenDepth > 0) parenDepth--;
        buf += ch;
        continue;
      }
      if (/\s/.test(ch) && parenDepth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  };

  BricksAPI.prototype._expandBorderRadiusMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    if (!hasOwn(declMap, 'border-radius')) return declMap;
    var raw = String(declMap['border-radius'] == null ? '' : declMap['border-radius']).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return declMap;

    var slashIdx = raw.indexOf('/');
    var horizontal = slashIdx >= 0 ? raw.slice(0, slashIdx).trim() : raw;
    var vals = this._tokenizeCssValueList(horizontal);
    if (!vals.length) return declMap;

    var tl = vals[0];
    var tr = vals.length > 1 ? vals[1] : tl;
    var br = vals.length > 2 ? vals[2] : tl;
    var bl = vals.length > 3 ? vals[3] : tr;
    if (vals.length === 3) bl = tr;

    if (!hasOwn(declMap, 'border-top-left-radius')) declMap['border-top-left-radius'] = tl;
    if (!hasOwn(declMap, 'border-top-right-radius')) declMap['border-top-right-radius'] = tr;
    if (!hasOwn(declMap, 'border-bottom-right-radius')) declMap['border-bottom-right-radius'] = br;
    if (!hasOwn(declMap, 'border-bottom-left-radius')) declMap['border-bottom-left-radius'] = bl;
    return declMap;
  };

  BricksAPI.prototype._expandFourSideCssShorthandValues = function (rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return null;

    var vals = this._tokenizeCssValueList(raw);
    if (!vals.length) return null;

    var top = vals[0];
    var right = vals.length > 1 ? vals[1] : top;
    var bottom = vals.length > 2 ? vals[2] : top;
    var left = vals.length > 3 ? vals[3] : right;
    if (vals.length === 3) left = right;

    return {
      top: top,
      right: right,
      bottom: bottom,
      left: left
    };
  };

  BricksAPI.prototype._expandQuadMappedDeclarations = function (declMap, shorthandProp, longhands) {
    declMap = isObject(declMap) ? declMap : {};
    shorthandProp = String(shorthandProp || '').trim().toLowerCase();
    if (!shorthandProp || !hasOwn(declMap, shorthandProp)) return declMap;

    var values = this._expandFourSideCssShorthandValues(declMap[shorthandProp]);
    if (!values) return declMap;

    longhands = isObject(longhands) ? longhands : {};
    var topProp = String(longhands.top || '').trim().toLowerCase();
    var rightProp = String(longhands.right || '').trim().toLowerCase();
    var bottomProp = String(longhands.bottom || '').trim().toLowerCase();
    var leftProp = String(longhands.left || '').trim().toLowerCase();

    if (topProp && !hasOwn(declMap, topProp)) declMap[topProp] = values.top;
    if (rightProp && !hasOwn(declMap, rightProp)) declMap[rightProp] = values.right;
    if (bottomProp && !hasOwn(declMap, bottomProp)) declMap[bottomProp] = values.bottom;
    if (leftProp && !hasOwn(declMap, leftProp)) declMap[leftProp] = values.left;
    return declMap;
  };

  BricksAPI.prototype._expandTwoValueCssShorthandValues = function (rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return null;

    var vals = this._tokenizeCssValueList(raw);
    if (!vals.length) return null;

    return {
      start: vals[0],
      end: vals.length > 1 ? vals[1] : vals[0]
    };
  };

  BricksAPI.prototype._expandPairMappedDeclarations = function (declMap, shorthandProp, startProp, endProp) {
    declMap = isObject(declMap) ? declMap : {};
    shorthandProp = String(shorthandProp || '').trim().toLowerCase();
    if (!shorthandProp || !hasOwn(declMap, shorthandProp)) return declMap;

    var values = this._expandTwoValueCssShorthandValues(declMap[shorthandProp]);
    if (!values) return declMap;

    startProp = String(startProp || '').trim().toLowerCase();
    endProp = String(endProp || '').trim().toLowerCase();
    if (startProp && !hasOwn(declMap, startProp)) declMap[startProp] = values.start;
    if (endProp && !hasOwn(declMap, endProp)) declMap[endProp] = values.end;
    return declMap;
  };

  BricksAPI.prototype._isCssWideKeywordToken = function (token) {
    token = String(token || '').trim();
    return /^(inherit|initial|unset|revert|revert-layer)$/i.test(token);
  };

  BricksAPI.prototype._isBorderStyleToken = function (token) {
    token = String(token || '').trim();
    return /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/i.test(token);
  };

  BricksAPI.prototype._isBorderWidthToken = function (token) {
    token = String(token || '').trim();
    if (!token) return false;
    if (/^(thin|medium|thick)$/i.test(token)) return true;
    if (/^(calc|min|max|clamp|var)\(/i.test(token)) return true;
    if (/^-?(?:\d+|\d*\.\d+)(?:[a-z%]+)?$/i.test(token)) return true;
    return false;
  };

  BricksAPI.prototype._parseBorderShorthandParts = function (rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return null;

    var width = '';
    var style = '';
    var color = '';

    if (this._isCssWideKeywordToken(raw)) {
      width = raw;
      style = raw;
      color = raw;
    } else {
      var tokens = this._tokenizeCssValueList(raw);
      var colorParts = [];
      for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || '').trim();
        if (!token) continue;
        if (!style && this._isBorderStyleToken(token)) {
          style = token;
          continue;
        }
        if (!width && this._isBorderWidthToken(token)) {
          width = token;
          continue;
        }
        colorParts.push(token);
      }
      color = colorParts.join(' ').trim();
    }

    return {
      width: width,
      style: style,
      color: color
    };
  };

  BricksAPI.prototype._expandBorderMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    if (!hasOwn(declMap, 'border')) return declMap;

    var parts = this._parseBorderShorthandParts(declMap.border);
    if (!parts) return declMap;

    if (parts.width && !hasOwn(declMap, 'border-width')) declMap['border-width'] = parts.width;
    if (parts.style && !hasOwn(declMap, 'border-style')) declMap['border-style'] = parts.style;
    if (parts.color && !hasOwn(declMap, 'border-color')) declMap['border-color'] = parts.color;
    return declMap;
  };

  BricksAPI.prototype._expandBorderAxisMappedDeclarations = function (declMap, shorthandProp, startWidthProp, endWidthProp) {
    declMap = isObject(declMap) ? declMap : {};
    shorthandProp = String(shorthandProp || '').trim().toLowerCase();
    if (!shorthandProp || !hasOwn(declMap, shorthandProp)) return declMap;

    var parts = this._parseBorderShorthandParts(declMap[shorthandProp]);
    if (!parts) return declMap;

    startWidthProp = String(startWidthProp || '').trim().toLowerCase();
    endWidthProp = String(endWidthProp || '').trim().toLowerCase();

    if (parts.width) {
      if (startWidthProp && !hasOwn(declMap, startWidthProp)) declMap[startWidthProp] = parts.width;
      if (endWidthProp && !hasOwn(declMap, endWidthProp)) declMap[endWidthProp] = parts.width;
    }
    if (parts.style && !hasOwn(declMap, 'border-style')) declMap['border-style'] = parts.style;
    if (parts.color && !hasOwn(declMap, 'border-color')) declMap['border-color'] = parts.color;
    return declMap;
  };

  BricksAPI.prototype._expandBorderSideMappedDeclarations = function (declMap, shorthandProp, widthProp) {
    declMap = isObject(declMap) ? declMap : {};
    shorthandProp = String(shorthandProp || '').trim().toLowerCase();
    if (!shorthandProp || !hasOwn(declMap, shorthandProp)) return declMap;

    var parts = this._parseBorderShorthandParts(declMap[shorthandProp]);
    if (!parts) return declMap;

    widthProp = String(widthProp || '').trim().toLowerCase();
    if (parts.width && widthProp && !hasOwn(declMap, widthProp)) declMap[widthProp] = parts.width;
    if (parts.style && !hasOwn(declMap, 'border-style')) declMap['border-style'] = parts.style;
    if (parts.color && !hasOwn(declMap, 'border-color')) declMap['border-color'] = parts.color;
    return declMap;
  };

  BricksAPI.prototype._expandGapMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    var sourceProp = hasOwn(declMap, 'gap') ? 'gap' : (hasOwn(declMap, 'grid-gap') ? 'grid-gap' : '');
    if (!sourceProp) return declMap;

    var raw = String(declMap[sourceProp] == null ? '' : declMap[sourceProp]).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return declMap;

    var row = '';
    var col = '';
    if (this._isCssWideKeywordToken(raw)) {
      row = raw;
      col = raw;
    } else {
      var values = this._expandTwoValueCssShorthandValues(raw);
      if (!values) return declMap;
      row = values.start;
      col = values.end;
    }

    if (row && !hasOwn(declMap, 'row-gap')) declMap['row-gap'] = row;
    if (col && !hasOwn(declMap, 'column-gap')) declMap['column-gap'] = col;
    return declMap;
  };

  BricksAPI.prototype._expandOverflowMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    if (!hasOwn(declMap, 'overflow')) return declMap;

    var raw = String(declMap.overflow == null ? '' : declMap.overflow).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return declMap;

    var x = '';
    var y = '';
    if (this._isCssWideKeywordToken(raw)) {
      x = raw;
      y = raw;
    } else {
      var values = this._expandTwoValueCssShorthandValues(raw);
      if (!values) return declMap;
      x = values.start;
      y = values.end;
    }

    if (x && !hasOwn(declMap, 'overflow-x')) declMap['overflow-x'] = x;
    if (y && !hasOwn(declMap, 'overflow-y')) declMap['overflow-y'] = y;
    return declMap;
  };

  BricksAPI.prototype._isFlexDirectionToken = function (token) {
    token = String(token || '').trim();
    return /^(row|row-reverse|column|column-reverse)$/i.test(token);
  };

  BricksAPI.prototype._isFlexWrapToken = function (token) {
    token = String(token || '').trim();
    return /^(nowrap|wrap|wrap-reverse)$/i.test(token);
  };

  BricksAPI.prototype._expandFlexFlowMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    if (!hasOwn(declMap, 'flex-flow')) return declMap;

    var raw = String(declMap['flex-flow'] == null ? '' : declMap['flex-flow']).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return declMap;

    var direction = '';
    var wrap = '';
    if (this._isCssWideKeywordToken(raw)) {
      direction = raw;
      wrap = raw;
    } else {
      var tokens = this._tokenizeCssValueList(raw);
      for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || '').trim();
        if (!token) continue;
        if (!direction && this._isFlexDirectionToken(token)) {
          direction = token;
          continue;
        }
        if (!wrap && this._isFlexWrapToken(token)) {
          wrap = token;
          continue;
        }
      }
    }

    if (direction && !hasOwn(declMap, 'flex-direction')) declMap['flex-direction'] = direction;
    if (wrap && !hasOwn(declMap, 'flex-wrap')) declMap['flex-wrap'] = wrap;
    return declMap;
  };

  BricksAPI.prototype._expandPlaceMappedDeclarations = function (declMap, shorthandProp, alignProp, justifyProp) {
    declMap = isObject(declMap) ? declMap : {};
    shorthandProp = String(shorthandProp || '').trim().toLowerCase();
    if (!shorthandProp || !hasOwn(declMap, shorthandProp)) return declMap;

    var raw = String(declMap[shorthandProp] == null ? '' : declMap[shorthandProp]).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return declMap;

    var align = '';
    var justify = '';
    if (this._isCssWideKeywordToken(raw)) {
      align = raw;
      justify = raw;
    } else {
      var values = this._expandTwoValueCssShorthandValues(raw);
      if (!values) return declMap;
      align = values.start;
      justify = values.end;
    }

    alignProp = String(alignProp || '').trim().toLowerCase();
    justifyProp = String(justifyProp || '').trim().toLowerCase();
    if (align && alignProp && !hasOwn(declMap, alignProp)) declMap[alignProp] = align;
    if (justify && justifyProp && !hasOwn(declMap, justifyProp)) declMap[justifyProp] = justify;
    return declMap;
  };

  BricksAPI.prototype._expandAliasMappedDeclaration = function (declMap, sourceProp, targetProp) {
    declMap = isObject(declMap) ? declMap : {};
    sourceProp = String(sourceProp || '').trim().toLowerCase();
    targetProp = String(targetProp || '').trim().toLowerCase();
    if (!sourceProp || !targetProp || !hasOwn(declMap, sourceProp)) return declMap;
    if (sourceProp === targetProp) return declMap;

    var raw = String(declMap[sourceProp] == null ? '' : declMap[sourceProp]).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (raw && !hasOwn(declMap, targetProp)) declMap[targetProp] = raw;
    delete declMap[sourceProp];
    return declMap;
  };

  BricksAPI.prototype._expandFlexMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    if (!hasOwn(declMap, 'flex')) return declMap;
    var raw = String(declMap.flex == null ? '' : declMap.flex).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return declMap;

    var grow = '';
    var shrink = '';
    var basis = '';
    var isNumber = function (token) {
      return /^-?(?:\d+|\d*\.\d+)$/.test(String(token || '').trim());
    };
    var lower = raw.toLowerCase();
    if (lower === 'none') {
      grow = '0';
      shrink = '0';
      basis = 'auto';
    } else if (lower === 'auto') {
      grow = '1';
      shrink = '1';
      basis = 'auto';
    } else if (lower === 'initial') {
      grow = '0';
      shrink = '1';
      basis = 'auto';
    } else if (/^(inherit|unset|revert|revert-layer)$/i.test(raw)) {
      grow = raw;
      shrink = raw;
      basis = raw;
    } else {
      var tokens = this._tokenizeCssValueList(raw);
      if (tokens.length === 1) {
        if (isNumber(tokens[0])) {
          grow = tokens[0];
          shrink = '1';
          basis = '0%';
        } else {
          grow = '1';
          shrink = '1';
          basis = tokens[0];
        }
      } else if (tokens.length === 2) {
        if (isNumber(tokens[0]) && isNumber(tokens[1])) {
          grow = tokens[0];
          shrink = tokens[1];
        } else if (isNumber(tokens[0])) {
          grow = tokens[0];
          shrink = '1';
          basis = tokens[1];
        }
      } else if (tokens.length >= 3 && isNumber(tokens[0]) && isNumber(tokens[1])) {
        grow = tokens[0];
        shrink = tokens[1];
        basis = tokens.slice(2).join(' ');
      }
    }

    if (grow && !hasOwn(declMap, 'flex-grow')) declMap['flex-grow'] = grow;
    if (shrink && !hasOwn(declMap, 'flex-shrink')) declMap['flex-shrink'] = shrink;
    if (basis && !hasOwn(declMap, 'flex-basis')) declMap['flex-basis'] = basis;
    return declMap;
  };

  BricksAPI.prototype._isFontStyleToken = function (token) {
    token = String(token || '').trim();
    return /^(normal|italic|oblique)$/i.test(token);
  };

  BricksAPI.prototype._isFontWeightToken = function (token) {
    token = String(token || '').trim();
    if (!token) return false;
    if (/^(normal|bold|bolder|lighter)$/i.test(token)) return true;
    return /^[1-9]00$/.test(token);
  };

  BricksAPI.prototype._isFontSizeToken = function (token) {
    token = String(token || '').trim();
    if (!token) return false;
    if (/^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i.test(token)) return true;
    if (/^(calc|min|max|clamp|var)\(/i.test(token)) return true;
    if (/^0(?:\.0+)?$/.test(token)) return true;
    if (/^-?(?:\d+|\d*\.\d+)(?:[a-z%]+)$/i.test(token)) return true;
    return false;
  };

  BricksAPI.prototype._isLineHeightToken = function (token) {
    token = String(token || '').trim();
    if (!token) return false;
    if (this._isCssWideKeywordToken(token)) return true;
    if (/^normal$/i.test(token)) return true;
    if (/^(calc|min|max|clamp|var)\(/i.test(token)) return true;
    if (/^-?(?:\d+|\d*\.\d+)(?:[a-z%]+)?$/i.test(token)) return true;
    return false;
  };

  BricksAPI.prototype._parseFontShorthandParts = function (rawValue) {
    var raw = String(rawValue == null ? '' : rawValue).trim();
    raw = raw.replace(/\s*!important\s*$/i, '').trim();
    if (!raw) return null;

    if (this._isCssWideKeywordToken(raw)) {
      return {
        style: raw,
        weight: raw,
        size: raw,
        lineHeight: raw,
        family: raw
      };
    }

    if (/^(caption|icon|menu|message-box|small-caption|status-bar)$/i.test(raw)) {
      return null;
    }

    var tokens = this._tokenizeCssValueList(raw);
    if (!tokens.length) return null;

    var size = '';
    var lineHeight = '';
    var sizeIdx = -1;
    var i;
    for (i = 0; i < tokens.length; i++) {
      var token = String(tokens[i] || '').trim();
      if (!token || token === '/') continue;

      var slashIdx = token.indexOf('/');
      if (slashIdx > 0 && slashIdx < token.length - 1) {
        var sizePart = token.slice(0, slashIdx).trim();
        var linePart = token.slice(slashIdx + 1).trim();
        if (this._isFontSizeToken(sizePart) && this._isLineHeightToken(linePart)) {
          size = sizePart;
          lineHeight = linePart;
          sizeIdx = i;
          break;
        }
      }

      if (this._isFontSizeToken(token)) {
        size = token;
        sizeIdx = i;
        break;
      }
    }
    if (sizeIdx < 0 || !size) return null;

    var cursor = sizeIdx + 1;
    if (!lineHeight && cursor < tokens.length) {
      var nextToken = String(tokens[cursor] || '').trim();
      if (nextToken === '/' && cursor + 1 < tokens.length) {
        var lh = String(tokens[cursor + 1] || '').trim();
        if (this._isLineHeightToken(lh)) {
          lineHeight = lh;
          cursor += 2;
        }
      } else if (nextToken.charAt(0) === '/') {
        var inlineLh = nextToken.slice(1).trim();
        if (this._isLineHeightToken(inlineLh)) {
          lineHeight = inlineLh;
          cursor += 1;
        }
      }
    }

    var family = tokens.slice(cursor).join(' ').trim();
    if (!family) return null;

    var style = '';
    var weight = '';
    for (i = 0; i < sizeIdx; i++) {
      token = String(tokens[i] || '').trim();
      if (!token || token === '/') continue;
      if (!style && this._isFontStyleToken(token)) {
        style = token;
        continue;
      }
      if (!weight && this._isFontWeightToken(token)) {
        weight = token;
      }
    }

    return {
      style: style,
      weight: weight,
      size: size,
      lineHeight: lineHeight,
      family: family
    };
  };

  BricksAPI.prototype._expandFontMappedDeclarations = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    if (!hasOwn(declMap, 'font')) return declMap;

    var parts = this._parseFontShorthandParts(declMap.font);
    if (!parts) return declMap;

    if (parts.style && !hasOwn(declMap, 'font-style')) declMap['font-style'] = parts.style;
    if (parts.weight && !hasOwn(declMap, 'font-weight')) declMap['font-weight'] = parts.weight;
    if (parts.size && !hasOwn(declMap, 'font-size')) declMap['font-size'] = parts.size;
    if (parts.lineHeight && !hasOwn(declMap, 'line-height')) declMap['line-height'] = parts.lineHeight;
    if (parts.family && !hasOwn(declMap, 'font-family')) declMap['font-family'] = parts.family;
    return declMap;
  };

  BricksAPI.prototype._expandMappedCssShorthands = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    var out = {};
    var keys = Object.keys(declMap);
    for (var i = 0; i < keys.length; i++) {
      var key = String(keys[i] || '').trim().toLowerCase();
      if (!key) continue;
      out[key] = declMap[keys[i]];
    }
    this._expandAliasMappedDeclaration(out, 'typography', 'font');
    this._expandFontMappedDeclarations(out);
    this._expandBorderMappedDeclarations(out);
    this._expandBorderRadiusMappedDeclarations(out);
    this._expandQuadMappedDeclarations(out, 'padding', {
      top: 'padding-top',
      right: 'padding-right',
      bottom: 'padding-bottom',
      left: 'padding-left'
    });
    this._expandQuadMappedDeclarations(out, 'margin', {
      top: 'margin-top',
      right: 'margin-right',
      bottom: 'margin-bottom',
      left: 'margin-left'
    });
    this._expandQuadMappedDeclarations(out, 'border-width', {
      top: 'border-top-width',
      right: 'border-right-width',
      bottom: 'border-bottom-width',
      left: 'border-left-width'
    });
    this._expandPairMappedDeclarations(out, 'border-block-width', 'border-top-width', 'border-bottom-width');
    this._expandPairMappedDeclarations(out, 'border-inline-width', 'border-left-width', 'border-right-width');
    this._expandBorderAxisMappedDeclarations(out, 'border-block', 'border-top-width', 'border-bottom-width');
    this._expandBorderAxisMappedDeclarations(out, 'border-inline', 'border-left-width', 'border-right-width');
    this._expandBorderSideMappedDeclarations(out, 'border-top', 'border-top-width');
    this._expandBorderSideMappedDeclarations(out, 'border-right', 'border-right-width');
    this._expandBorderSideMappedDeclarations(out, 'border-bottom', 'border-bottom-width');
    this._expandBorderSideMappedDeclarations(out, 'border-left', 'border-left-width');
    this._expandBorderSideMappedDeclarations(out, 'border-block-start', 'border-top-width');
    this._expandBorderSideMappedDeclarations(out, 'border-block-end', 'border-bottom-width');
    this._expandBorderSideMappedDeclarations(out, 'border-inline-start', 'border-left-width');
    this._expandBorderSideMappedDeclarations(out, 'border-inline-end', 'border-right-width');
    this._expandQuadMappedDeclarations(out, 'inset', {
      top: 'top',
      right: 'right',
      bottom: 'bottom',
      left: 'left'
    });
    this._expandPairMappedDeclarations(out, 'margin-block', 'margin-block-start', 'margin-block-end');
    this._expandPairMappedDeclarations(out, 'margin-inline', 'margin-inline-start', 'margin-inline-end');
    this._expandPairMappedDeclarations(out, 'padding-block', 'padding-top', 'padding-bottom');
    this._expandPairMappedDeclarations(out, 'padding-inline', 'padding-inline-start', 'padding-inline-end');
    this._expandPairMappedDeclarations(out, 'inset-block', 'top', 'bottom');
    this._expandPairMappedDeclarations(out, 'inset-inline', 'left', 'right');
    this._expandGapMappedDeclarations(out);
    this._expandOverflowMappedDeclarations(out);
    this._expandFlexFlowMappedDeclarations(out);
    this._expandPlaceMappedDeclarations(out, 'place-content', 'align-content', 'justify-content');
    this._expandPlaceMappedDeclarations(out, 'place-items', 'align-items', 'justify-items');
    this._expandPlaceMappedDeclarations(out, 'place-self', 'align-self', 'justify-self');
    this._expandAliasMappedDeclaration(out, 'font-color', 'color');
    this._expandAliasMappedDeclaration(out, 'font-colour', 'color');
    this._expandAliasMappedDeclaration(out, 'text-color', 'color');
    this._expandAliasMappedDeclaration(out, 'text-colour', 'color');
    this._expandAliasMappedDeclaration(out, 'inset-block-start', 'top');
    this._expandAliasMappedDeclaration(out, 'inset-block-end', 'bottom');
    this._expandAliasMappedDeclaration(out, 'inset-inline-start', 'left');
    this._expandAliasMappedDeclaration(out, 'inset-inline-end', 'right');
    this._expandAliasMappedDeclaration(out, 'inline-size', 'width');
    this._expandAliasMappedDeclaration(out, 'block-size', 'height');
    this._expandAliasMappedDeclaration(out, 'min-inline-size', 'min-width');
    this._expandAliasMappedDeclaration(out, 'max-inline-size', 'max-width');
    this._expandAliasMappedDeclaration(out, 'min-block-size', 'min-height');
    this._expandAliasMappedDeclaration(out, 'max-block-size', 'max-height');
    this._expandAliasMappedDeclaration(out, 'margin-block-start', 'margin-top');
    this._expandAliasMappedDeclaration(out, 'margin-block-end', 'margin-bottom');
    this._expandAliasMappedDeclaration(out, 'padding-block-start', 'padding-top');
    this._expandAliasMappedDeclaration(out, 'padding-block-end', 'padding-bottom');
    this._expandAliasMappedDeclaration(out, 'padding-inline-start', 'padding-left');
    this._expandAliasMappedDeclaration(out, 'padding-inline-end', 'padding-right');
    this._expandAliasMappedDeclaration(out, 'border-start-start-radius', 'border-top-left-radius');
    this._expandAliasMappedDeclaration(out, 'border-start-end-radius', 'border-top-right-radius');
    this._expandAliasMappedDeclaration(out, 'border-end-start-radius', 'border-bottom-left-radius');
    this._expandAliasMappedDeclaration(out, 'border-end-end-radius', 'border-bottom-right-radius');
    this._expandAliasMappedDeclaration(out, 'border-block-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-inline-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-block-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-inline-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-block-start-width', 'border-top-width');
    this._expandAliasMappedDeclaration(out, 'border-block-end-width', 'border-bottom-width');
    this._expandAliasMappedDeclaration(out, 'border-inline-start-width', 'border-left-width');
    this._expandAliasMappedDeclaration(out, 'border-inline-end-width', 'border-right-width');
    this._expandAliasMappedDeclaration(out, 'border-block-start-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-block-end-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-inline-start-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-inline-end-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-top-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-right-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-bottom-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-left-style', 'border-style');
    this._expandAliasMappedDeclaration(out, 'border-top-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-right-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-bottom-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-left-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-block-start-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-block-end-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-inline-start-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'border-inline-end-color', 'border-color');
    this._expandAliasMappedDeclaration(out, 'overflow-block', 'overflow-y');
    this._expandAliasMappedDeclaration(out, 'overflow-inline', 'overflow-x');
    this._expandAliasMappedDeclaration(out, 'overscroll-behavior-block', 'overscroll-behavior');
    this._expandAliasMappedDeclaration(out, 'overscroll-behavior-inline', 'overscroll-behavior');
    this._expandAliasMappedDeclaration(out, 'overscroll-behavior-x', 'overscroll-behavior');
    this._expandAliasMappedDeclaration(out, 'overscroll-behavior-y', 'overscroll-behavior');
    this._expandFlexMappedDeclarations(out);
    return out;
  };

  BricksAPI.prototype._collectCssRuleBlocks = function (cssText) {
    var css = this._stripCssComments(cssText || '');
    var blocks = [];
    var stack = [{ header: '', body: '', isAtRule: false, atRuleDepth: 0 }];
    var quote = '';
    var esc = false;

    for (var i = 0; i < css.length; i++) {
      var ch = css.charAt(i);
      var frame = stack[stack.length - 1];

      if (quote) {
        frame.body += ch;
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === quote) quote = '';
        continue;
      }

      if (ch === '"' || ch === '\'') {
        quote = ch;
        frame.body += ch;
        continue;
      }

      if (ch === '{') {
        var header = String(frame.body || '').trim();
        var isAtRule = header.charAt(0) === '@';
        frame.body = '';
        stack.push({
          header: header,
          body: '',
          isAtRule: isAtRule,
          atRuleDepth: frame.atRuleDepth + (isAtRule ? 1 : 0)
        });
        continue;
      }

      if (ch === '}') {
        if (stack.length > 1) {
          var completed = stack.pop();
          blocks.push({
            header: String(completed.header || '').trim(),
            body: String(completed.body || ''),
            isAtRule: !!completed.isAtRule,
            atRuleDepth: Number(completed.atRuleDepth || 0)
          });
        } else {
          frame.body += ch;
        }
        continue;
      }

      frame.body += ch;
    }
    return blocks;
  };

  BricksAPI.prototype._selectorListHasExactSelector = function (header, selector) {
    header = String(header || '').trim();
    selector = String(selector || '').trim();
    if (!header || !selector) return false;
    if (header.charAt(0) === '@') return false;
    var parts = header.split(',');
    for (var i = 0; i < parts.length; i++) {
      if (String(parts[i] || '').trim() === selector) return true;
    }
    return false;
  };

  BricksAPI.prototype._extractMappedCssDeclarations = function (cssText, rootSelector) {
    var cssRaw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n');
    var css = this._stripBricksBreakpointBlocks(cssRaw).trim();
    var root = String(rootSelector || '').trim();
    if (!css) return {};

    if (css.indexOf('{') === -1) {
      return this._parseDeclarationMap(css);
    }

    var blocks = this._collectCssRuleBlocks(css);
    var out = {};
    var matchedRoot = false;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var header = String(block && block.header || '').trim();
      var atRuleDepth = Number(block && block.atRuleDepth || 0);
      if (!header || header.charAt(0) === '@') continue;
      // Do not map declarations inside @media/@supports/... to base settings.
      if (atRuleDepth > 0) continue;
      if (root && !this._selectorListHasExactSelector(header, root)) continue;
      matchedRoot = true;
      var parsed = this._parseDeclarationMap(block.body || '');
      var props = Object.keys(parsed);
      for (var p = 0; p < props.length; p++) {
        out[props[p]] = parsed[props[p]];
      }
    }

    if (!matchedRoot && !root) {
      for (i = 0; i < blocks.length; i++) {
        var fallbackHeader = String(blocks[i] && blocks[i].header || '').trim();
        if (!fallbackHeader || fallbackHeader.charAt(0) === '@') continue;
        parsed = this._parseDeclarationMap(blocks[i].body || '');
        props = Object.keys(parsed);
        for (p = 0; p < props.length; p++) {
          out[props[p]] = parsed[props[p]];
        }
      }
    }

    return out;
  };

  BricksAPI.prototype._normalizeBricksBreakpointToken = function (value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    raw = raw.replace(/^_breakpoint_/i, '');
    raw = raw.replace(/[^A-Za-z0-9_-]+/g, '_');
    raw = raw.replace(/^_+|_+$/g, '');
    return String(raw || '').trim();
  };

  BricksAPI.prototype._scanBricksBreakpointBlocks = function (cssText) {
    var css = this._stripCssComments(String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n'));
    var out = [];
    var re = /@bricks-breakpoint\s+([A-Za-z0-9_-]+)\s*\{/gi;
    var m;

    while ((m = re.exec(css))) {
      var token = this._normalizeBricksBreakpointToken(m[1]);
      if (!token) continue;

      var bodyStart = re.lastIndex;
      var depth = 1;
      var quote = '';
      var esc = false;
      var idx = bodyStart;
      for (; idx < css.length; idx++) {
        var ch = css.charAt(idx);
        if (quote) {
          if (esc) {
            esc = false;
            continue;
          }
          if (ch === '\\') {
            esc = true;
            continue;
          }
          if (ch === quote) quote = '';
          continue;
        }
        if (ch === '"' || ch === '\'') {
          quote = ch;
          continue;
        }
        if (ch === '{') {
          depth++;
          continue;
        }
        if (ch === '}') {
          depth--;
          if (depth === 0) break;
        }
      }

      var complete = depth === 0 && idx < css.length;
      var body = complete ? css.slice(bodyStart, idx) : css.slice(bodyStart);
      out.push({
        token: token,
        start: m.index,
        end: complete ? (idx + 1) : css.length,
        body: String(body || ''),
        complete: complete
      });
      re.lastIndex = complete ? (idx + 1) : css.length;
    }

    return out;
  };

  BricksAPI.prototype._extractBreakpointMappedCssDeclarations = function (cssText) {
    var blocks = this._scanBricksBreakpointBlocks(cssText);
    var out = {};
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (!block || !block.complete) continue;
      var token = this._normalizeBricksBreakpointToken(block.token);
      if (!token) continue;
      var parsed = this._parseDeclarationMap(block.body || '');
      if (!out[token]) out[token] = {};
      var props = Object.keys(parsed || {});
      for (var p = 0; p < props.length; p++) {
        out[token][props[p]] = parsed[props[p]];
      }
    }
    return out;
  };

  BricksAPI.prototype._stripBricksBreakpointBlocks = function (cssText) {
    var css = this._stripCssComments(String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n'));
    var blocks = this._scanBricksBreakpointBlocks(css);
    if (!blocks.length) return css;

    var out = '';
    var cursor = 0;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var start = Number(block && block.start || 0);
      var end = Number(block && block.end || 0);
      if (start < cursor) continue;
      out += css.slice(cursor, start);
      cursor = Math.max(cursor, end);
    }
    out += css.slice(cursor);
    return out;
  };

  BricksAPI.prototype._filterDeclarationListByMappedProperties = function (bodyText, mappedPropsSet) {
    var blocked = isObject(mappedPropsSet) ? mappedPropsSet : {};
    var chunks = this._splitCssDeclarations(bodyText || '');
    var kept = [];
    var removed = [];
    var seenRemoved = {};

    for (var i = 0; i < chunks.length; i++) {
      var part = String(chunks[i] || '').trim();
      if (!part) continue;

      var colonIdx = part.indexOf(':');
      if (colonIdx <= 0) {
        kept.push(part);
        continue;
      }

      var prop = part.slice(0, colonIdx).trim().toLowerCase();
      if (prop && hasOwn(blocked, prop)) {
        if (!seenRemoved[prop]) {
          seenRemoved[prop] = true;
          removed.push(prop);
        }
        continue;
      }
      kept.push(part);
    }

    var out = [];
    for (i = 0; i < kept.length; i++) {
      var line = String(kept[i] || '').trim();
      if (!line) continue;
      if (!/[;}]$/.test(line)) line += ';';
      out.push(line);
    }

    return {
      css: out.join('\n'),
      removedProps: removed
    };
  };

  BricksAPI.prototype.filterCustomCssMappedOverlap = function (customCss, mappedCss, opts) {
    opts = opts || {};
    var result = {
      ok: true,
      changed: false,
      css: String(customCss == null ? '' : customCss).replace(/\r\n/g, '\n').trim(),
      removedProps: []
    };
    if (!result.css) return result;

    var mappedDecls = this._extractMappedCssDeclarations(String(mappedCss == null ? '' : mappedCss), '');
    var mappedProps = {};
    var mappedKeys = Object.keys(mappedDecls || {});
    for (var i = 0; i < mappedKeys.length; i++) {
      var prop = String(mappedKeys[i] || '').trim().toLowerCase();
      if (!prop) continue;
      if (!hasOwn(CSS_TO_BRICKS_SETTINGS_PATH, prop)) continue;
      mappedProps[prop] = true;
    }
    if (!Object.keys(mappedProps).length) return result;

    if (result.css.indexOf('{') === -1) {
      var filteredDeclList = this._filterDeclarationListByMappedProperties(result.css, mappedProps);
      result.changed = filteredDeclList.css !== result.css;
      result.css = filteredDeclList.css;
      result.removedProps = filteredDeclList.removedProps || [];
      return result;
    }

    var rootSelector = String(opts.rootSelector || '').trim();
    if (!rootSelector) return result;

    var escapedRoot = rootSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var rootOnlyRe = new RegExp('^\\s*' + escapedRoot + '\\s*\\{([\\s\\S]*)\\}\\s*$');
    var rootOnlyMatch = rootOnlyRe.exec(result.css);
    var body = '';
    var filteredBody = null;
    var nextCss = '';
    var lines = [];

    if (rootOnlyMatch) {
      body = String(rootOnlyMatch[1] || '');
      filteredBody = this._filterDeclarationListByMappedProperties(body, mappedProps);
      if (filteredBody.css) {
        lines = filteredBody.css.split('\n').map(function (line) { return String(line || '').trim(); }).filter(Boolean);
        if (lines.length) {
          nextCss = rootSelector + ' {\n  ' + lines.join('\n  ') + '\n}';
        }
      }
      result.changed = nextCss !== result.css;
      result.css = nextCss;
      result.removedProps = filteredBody.removedProps || [];
      return result;
    }

    var rootRuleRe = new RegExp(escapedRoot + '\\s*\\{([\\s\\S]*?)\\}');
    var rootRuleMatch = rootRuleRe.exec(result.css);
    if (!rootRuleMatch) return result;

    body = String(rootRuleMatch[1] || '');
    filteredBody = this._filterDeclarationListByMappedProperties(body, mappedProps);
    nextCss = '';
    if (filteredBody.css) {
      lines = filteredBody.css.split('\n').map(function (line) { return String(line || '').trim(); }).filter(Boolean);
      if (lines.length) {
        nextCss = rootSelector + ' {\n  ' + lines.join('\n  ') + '\n}';
      }
    }

    var before = String(result.css || '');
    var after = before.slice(0, rootRuleMatch.index) + nextCss + before.slice(rootRuleMatch.index + rootRuleMatch[0].length);
    after = after.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    result.changed = after !== result.css;
    result.css = after;
    result.removedProps = filteredBody.removedProps || [];
    return result;
  };

  BricksAPI.prototype._readSettingPath = function (settings, path) {
    settings = isObject(settings) ? settings : {};
    path = String(path || '').trim();
    if (!path) return { exists: false, value: void 0 };
    var parts = path.split('.').filter(Boolean);
    if (!parts.length) return { exists: false, value: void 0 };
    var cur = settings;
    for (var i = 0; i < parts.length; i++) {
      if (!isObject(cur) || Array.isArray(cur) || !hasOwn(cur, parts[i])) {
        return { exists: false, value: void 0 };
      }
      cur = cur[parts[i]];
    }
    return { exists: true, value: cur };
  };

  BricksAPI.prototype._isMappedColorPath = function (path) {
    path = String(path || '').trim().toLowerCase();
    return /(^|[.])(color|fill|stroke)$/.test(path);
  };

  BricksAPI.prototype._serializeMappedSettingValue = function (path, value) {
    if (value == null) return '';
    if (!this._isMappedColorPath(path)) {
      if (isObject(value) || Array.isArray(value)) return '';
      return String(value).trim();
    }
    if (isObject(value) && !Array.isArray(value)) {
      var candidates = ['raw', 'hex', 'rgb', 'hsl'];
      for (var i = 0; i < candidates.length; i++) {
        var k = candidates[i];
        if (!hasOwn(value, k)) continue;
        var v = String(value[k] == null ? '' : value[k]).trim();
        if (v) return v;
      }
      return '';
    }
    return String(value).trim();
  };

  BricksAPI.prototype._resolveCssColorKeywordToHex = function (keyword) {
    keyword = String(keyword || '').trim();
    if (!keyword || !/^[a-z-]+$/i.test(keyword)) return '';
    if (/^(inherit|initial|unset|revert|currentcolor|transparent)$/i.test(keyword)) return '';

    var doc = null;
    try {
      doc = this.getIframeDocument && typeof this.getIframeDocument === 'function'
        ? this.getIframeDocument()
        : null;
    } catch (e0) {
      doc = null;
    }
    if (!doc && w && w.document) doc = w.document;
    if (!doc || !doc.createElement || !doc.defaultView || !doc.defaultView.getComputedStyle) return '';

    var host = doc.body || doc.documentElement;
    if (!host) return '';

    var probe = doc.createElement('span');
    probe.style.position = 'absolute';
    probe.style.left = '-9999px';
    probe.style.top = '-9999px';
    probe.style.color = '';
    probe.style.color = keyword;
    if (!probe.style.color) return '';

    var computed = '';
    try {
      host.appendChild(probe);
      computed = String(doc.defaultView.getComputedStyle(probe).color || '').trim();
    } catch (e1) {
      computed = '';
    } finally {
      try {
        removeDomNode(probe);
      } catch (e2) { _warn("_resolveCssColorKeywordToHex", e2); }
    }
    if (!computed) return '';

    var m = /^rgba?\(\s*([0-9]{1,3})\s*[,\s]\s*([0-9]{1,3})\s*[,\s]\s*([0-9]{1,3})(?:\s*[,/]\s*([0-9.]+)\s*)?\)$/i.exec(computed);
    if (!m) return '';
    if (m[4] != null && m[4] !== '' && Number(m[4]) < 1) return '';

    function toHexByte(n) {
      var v = Number(n);
      if (!isFinite(v)) v = 0;
      v = Math.max(0, Math.min(255, Math.round(v)));
      var h = v.toString(16);
      return h.length < 2 ? ('0' + h) : h;
    }
    return ('#' + toHexByte(m[1]) + toHexByte(m[2]) + toHexByte(m[3])).toLowerCase();
  };

  BricksAPI.prototype._normalizeMappedSettingWriteValue = function (path, rawValue) {
    if (rawValue == null) return null;
    var text = String(rawValue).trim();
    text = text.replace(/\s*!important\s*$/i, '').trim();
    if (!text) return null;
    if (!this._isMappedColorPath(path)) return text;

    if (/^#([0-9a-f]{3,8})$/i.test(text)) return { hex: text.toLowerCase() };
    if (/^rgba?\(/i.test(text)) return { rgb: text };
    if (/^hsla?\(/i.test(text)) return { hsl: text };
    if (/^var\(/i.test(text)) return { raw: text };
    if (/^[a-z-]+$/i.test(text)) {
      var namedHex = this._resolveCssColorKeywordToHex(text);
      if (namedHex) return { hex: namedHex };
      return { raw: text };
    }
    return { raw: text };
  };

  BricksAPI.prototype._extractMappedSettingsDeclarationMap = function (settings) {
    settings = isObject(settings) ? settings : {};
    var out = {};
    var seenProps = {};
    var paths = Array.isArray(BRICKS_SETTINGS_MAPPED_PATH_ORDER)
      ? BRICKS_SETTINGS_MAPPED_PATH_ORDER
      : [];

    for (var i = 0; i < paths.length; i++) {
      var path = String(paths[i] || '').trim();
      if (!path) continue;
      var prop = String(BRICKS_SETTINGS_PATH_TO_CSS_PROPERTY[path] || '').trim();
      if (!prop || seenProps[prop]) continue;

      var read = this._readSettingPath(settings, path);
      if (!read.exists) continue;

      var value = read.value;
      var text = this._serializeMappedSettingValue(path, value);
      if (!text && text !== '0') continue;
      out[prop] = text;
      seenProps[prop] = true;
    }

    return out;
  };

  BricksAPI.prototype._extractMappedSettingsBreakpointDeclarationMap = function (settings) {
    settings = isObject(settings) ? settings : {};
    var out = {};
    var keys = Object.keys(settings);
    for (var i = 0; i < keys.length; i++) {
      var key = String(keys[i] || '').trim();
      if (!/^_breakpoint_/i.test(key)) continue;
      var token = this._normalizeBricksBreakpointToken(key.replace(/^_breakpoint_/i, ''));
      if (!token) continue;
      var value = settings[key];
      if (!isObject(value) || Array.isArray(value)) continue;
      var declMap = this._extractMappedSettingsDeclarationMap(value);
      if (!Object.keys(declMap).length) continue;
      out[token] = declMap;
    }
    return out;
  };

  BricksAPI.prototype._serializeBreakpointDeclarationMaps = function (breakpointDeclMaps) {
    breakpointDeclMaps = isObject(breakpointDeclMaps) ? breakpointDeclMaps : {};
    var tokens = Object.keys(breakpointDeclMaps).map(function (token) {
      return String(token || '').trim();
    }).filter(Boolean).sort();
    if (!tokens.length) return '';

    var chunks = [];
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var declText = this._serializeDeclarationMap(breakpointDeclMaps[token]);
      if (!declText) continue;
      var lines = declText.split('\n').map(function (line) { return String(line || '').trim(); }).filter(Boolean);
      if (!lines.length) continue;
      chunks.push('@bricks-breakpoint ' + token + ' {');
      for (var j = 0; j < lines.length; j++) {
        chunks.push('  ' + lines[j]);
      }
      chunks.push('}');
    }
    return chunks.join('\n');
  };

  BricksAPI.prototype._serializeMappedSettingsCssSnapshot = function (settings) {
    settings = isObject(settings) ? settings : {};
    var baseCss = this._serializeDeclarationMap(this._extractMappedSettingsDeclarationMap(settings));
    var breakpointCss = this._serializeBreakpointDeclarationMaps(this._extractMappedSettingsBreakpointDeclarationMap(settings));
    if (baseCss && breakpointCss) return (baseCss + '\n\n' + breakpointCss).trim();
    return (baseCss || breakpointCss || '').trim();
  };

  BricksAPI.prototype._serializeDeclarationMap = function (declMap) {
    declMap = isObject(declMap) ? declMap : {};
    var lines = [];
    var propsInOrder = Object.keys(CSS_TO_BRICKS_SETTINGS_PATH || {});
    var seen = {};
    for (var i = 0; i < propsInOrder.length; i++) {
      var prop = String(propsInOrder[i] || '').trim();
      if (!prop || seen[prop]) continue;
      seen[prop] = true;
      if (!hasOwn(declMap, prop)) continue;
      var value = String(declMap[prop] == null ? '' : declMap[prop]).trim();
      if (!value && value !== '0') continue;
      lines.push(prop + ': ' + value + ';');
    }
    return lines.join('\n');
  };

  BricksAPI.prototype._writeSettingPath = function (settings, path, value) {
    settings = isObject(settings) ? settings : {};
    path = String(path || '').trim();
    if (!path) return false;
    var parts = path.split('.').filter(Boolean);
    if (!parts.length) return false;
    var cur = settings;
    var changed = false;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!isObject(cur[key]) || Array.isArray(cur[key])) {
        cur[key] = {};
        changed = true;
      }
      cur = cur[key];
    }
    var leaf = parts[parts.length - 1];
    if (!deepValueEqual(cur[leaf], value)) {
      cur[leaf] = value;
      changed = true;
    }
    return changed;
  };

  BricksAPI.prototype._deleteSettingPath = function (settings, path) {
    settings = isObject(settings) ? settings : {};
    path = String(path || '').trim();
    if (!path) return false;
    var parts = path.split('.').filter(Boolean);
    if (!parts.length) return false;

    var chain = [settings];
    var cur = settings;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!isObject(cur[key]) || Array.isArray(cur[key])) return false;
      cur = cur[key];
      chain.push(cur);
    }

    var leaf = parts[parts.length - 1];
    if (!hasOwn(cur, leaf)) return false;
    delete cur[leaf];

    for (i = parts.length - 2; i >= 0; i--) {
      var parent = chain[i];
      var childKey = parts[i];
      var childObj = parent[childKey];
      if (!isObject(childObj) || Array.isArray(childObj)) break;
      if (Object.keys(childObj).length === 0) {
        delete parent[childKey];
      } else {
        break;
      }
    }
    return true;
  };

  BricksAPI.prototype._countMappedDeclarationsForCss = function (cssText, rootSelector) {
    var root = String(rootSelector || '').trim();
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n');
    if (!raw.trim()) return 0;

    var count = 0;
    var baseCss = this._stripBricksBreakpointBlocks(raw);
    var baseDecls = this._expandMappedCssShorthands(this._extractMappedCssDeclarations(baseCss, root));
    var baseProps = Object.keys(baseDecls || {});
    for (var i = 0; i < baseProps.length; i++) {
      if (hasOwn(CSS_TO_BRICKS_SETTINGS_PATH, baseProps[i])) count++;
    }

    var bpDecls = this._extractBreakpointMappedCssDeclarations(raw);
    var bpTokens = Object.keys(bpDecls || {});
    for (var t = 0; t < bpTokens.length; t++) {
      var token = bpTokens[t];
      var bpMap = this._expandMappedCssShorthands(isObject(bpDecls[token]) ? bpDecls[token] : {});
      var bpProps = Object.keys(bpMap);
      for (var p = 0; p < bpProps.length; p++) {
        if (hasOwn(CSS_TO_BRICKS_SETTINGS_PATH, bpProps[p])) count++;
      }
    }

    return count;
  };

  BricksAPI.prototype.validateMappedSettingsCssInput = function (cssText) {
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!raw) return { ok: true };

    var blocks = this._scanBricksBreakpointBlocks(raw);
    if (!blocks.length) {
      return { ok: false, reason: 'mapped settings block supports declarations + @bricks-breakpoint blocks only' };
    }

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (!block.complete) {
        return { ok: false, reason: 'incomplete breakpoint block (typing...)' };
      }
      var body = String(block.body || '').trim();
      if (!body) continue;
      if (/[{}]/.test(body)) {
        return { ok: false, reason: 'breakpoint block supports declarations only' };
      }
      var parsed = this._parseDeclarationMap(body);
      if (!Object.keys(parsed || {}).length) {
        return { ok: false, reason: 'incomplete breakpoint declaration (typing...)' };
      }
    }

    var remainder = this._stripBricksBreakpointBlocks(raw).trim();
    if (/[{}]/.test(remainder)) {
      return { ok: false, reason: 'mapped settings block supports declarations + @bricks-breakpoint blocks only' };
    }
    return { ok: true };
  };

  BricksAPI.prototype._applyCssMappedSettingsDiff = function (nextSettings, previousCss, editedCss, opts) {
    opts = opts || {};
    var rootSelector = String(opts.rootSelector || '').trim();
    var previousRaw = String(previousCss == null ? '' : previousCss);
    var editedRaw = String(editedCss == null ? '' : editedCss);
    var beforeDecls = this._expandMappedCssShorthands(
      this._extractMappedCssDeclarations(this._stripBricksBreakpointBlocks(previousRaw), rootSelector)
    );
    var afterDecls = this._expandMappedCssShorthands(
      this._extractMappedCssDeclarations(this._stripBricksBreakpointBlocks(editedRaw), rootSelector)
    );

    var summary = {
      attempted: true,
      changed: false,
      writes: [],
      deletes: [],
      changedSettingRoots: []
    };
    var seenRoots = {};

    var union = {};
    var beforeProps = Object.keys(beforeDecls);
    var afterProps = Object.keys(afterDecls);
    for (var i = 0; i < beforeProps.length; i++) union[beforeProps[i]] = true;
    for (i = 0; i < afterProps.length; i++) union[afterProps[i]] = true;

    var props = Object.keys(union);
    for (i = 0; i < props.length; i++) {
      var prop = props[i];
      var path = CSS_TO_BRICKS_SETTINGS_PATH[prop];
      if (!path) continue;
      var beforeVal = hasOwn(beforeDecls, prop) ? beforeDecls[prop] : null;
      var afterVal = hasOwn(afterDecls, prop) ? afterDecls[prop] : null;
      if (beforeVal === afterVal) continue;
      var changedForProp = false;

      if (afterVal == null) {
        if (this._deleteSettingPath(nextSettings, path)) {
          summary.changed = true;
          changedForProp = true;
          summary.deletes.push({ cssProperty: prop, path: path });
        }
      } else {
        var normalizedAfterVal = this._normalizeMappedSettingWriteValue(path, afterVal);
        if (normalizedAfterVal == null) {
          if (this._deleteSettingPath(nextSettings, path)) {
            summary.changed = true;
            changedForProp = true;
            summary.deletes.push({ cssProperty: prop, path: path });
          }
        } else if (this._writeSettingPath(nextSettings, path, normalizedAfterVal)) {
          summary.changed = true;
          changedForProp = true;
          summary.writes.push({ cssProperty: prop, path: path, value: afterVal });
        }
      }

      if (changedForProp) {
        var rootKey = String(path.split('.')[0] || '').trim();
        if (rootKey && !seenRoots[rootKey]) {
          seenRoots[rootKey] = true;
          summary.changedSettingRoots.push(rootKey);
        }
      }
    }

    var beforeBreakpoints = this._extractBreakpointMappedCssDeclarations(previousRaw);
    var afterBreakpoints = this._extractBreakpointMappedCssDeclarations(editedRaw);
    var breakpointUnion = {};
    var beforeTokens = Object.keys(beforeBreakpoints || {});
    var afterTokens = Object.keys(afterBreakpoints || {});
    for (i = 0; i < beforeTokens.length; i++) breakpointUnion[beforeTokens[i]] = true;
    for (i = 0; i < afterTokens.length; i++) breakpointUnion[afterTokens[i]] = true;

    var tokens = Object.keys(breakpointUnion);
    for (var ti = 0; ti < tokens.length; ti++) {
      var token = this._normalizeBricksBreakpointToken(tokens[ti]);
      if (!token) continue;
      var beforeBpDecls = this._expandMappedCssShorthands(
        isObject(beforeBreakpoints[token]) ? beforeBreakpoints[token] : {}
      );
      var afterBpDecls = this._expandMappedCssShorthands(
        isObject(afterBreakpoints[token]) ? afterBreakpoints[token] : {}
      );
      var propUnion = {};
      var beforeBpProps = Object.keys(beforeBpDecls);
      var afterBpProps = Object.keys(afterBpDecls);
      for (i = 0; i < beforeBpProps.length; i++) propUnion[beforeBpProps[i]] = true;
      for (i = 0; i < afterBpProps.length; i++) propUnion[afterBpProps[i]] = true;

      var bpProps = Object.keys(propUnion);
      for (var bpi = 0; bpi < bpProps.length; bpi++) {
        var bpProp = bpProps[bpi];
        var bpPathSuffix = CSS_TO_BRICKS_SETTINGS_PATH[bpProp];
        if (!bpPathSuffix) continue;

        var bpPath = '_breakpoint_' + token + '.' + bpPathSuffix;
        var beforeBpVal = hasOwn(beforeBpDecls, bpProp) ? beforeBpDecls[bpProp] : null;
        var afterBpVal = hasOwn(afterBpDecls, bpProp) ? afterBpDecls[bpProp] : null;
        if (beforeBpVal === afterBpVal) continue;

        var changedForBreakpointProp = false;
        if (afterBpVal == null) {
          if (this._deleteSettingPath(nextSettings, bpPath)) {
            summary.changed = true;
            changedForBreakpointProp = true;
            summary.deletes.push({ cssProperty: bpProp, path: bpPath, breakpoint: token });
          }
        } else {
          var normalizedBpVal = this._normalizeMappedSettingWriteValue(bpPathSuffix, afterBpVal);
          if (normalizedBpVal == null) {
            if (this._deleteSettingPath(nextSettings, bpPath)) {
              summary.changed = true;
              changedForBreakpointProp = true;
              summary.deletes.push({ cssProperty: bpProp, path: bpPath, breakpoint: token });
            }
          } else if (this._writeSettingPath(nextSettings, bpPath, normalizedBpVal)) {
            summary.changed = true;
            changedForBreakpointProp = true;
            summary.writes.push({ cssProperty: bpProp, path: bpPath, value: afterBpVal, breakpoint: token });
          }
        }

        if (changedForBreakpointProp) {
          var bpRootKey = '_breakpoint_' + token;
          if (!seenRoots[bpRootKey]) {
            seenRoots[bpRootKey] = true;
            summary.changedSettingRoots.push(bpRootKey);
          }
        }
      }
    }

    return summary;
  };

  BricksAPI.prototype.getGlobalClassInfo = function (ref) {
    ref = String(ref || '').trim();
    var found = this._findGlobalClassEntry(ref);
    if (found && found.entry) {
      return {
        ok: true,
        reason: 'ok',
        ref: ref,
        id: String(found.id || ''),
        name: String(found.name || ''),
        settings: found.entry && found.entry.settings
      };
    }

    // Fallback: active class UI state can be ahead of registry arrays while editing.
    var activeInfo = null;
    try { activeInfo = this._readActiveClassUiInfo(); } catch (eActive) { _warn("findGlobalClassByRef", eActive); activeInfo = null; }
    if (activeInfo && activeInfo.raw && typeof activeInfo.raw === 'object') {
      var refName = normalizeClassNameLike(ref);
      var id = String(activeInfo.id || activeInfo.raw.id || activeInfo.raw.value || '');
      var name = normalizeClassNameLike(activeInfo.name || activeInfo.raw.name || activeInfo.raw.label || activeInfo.raw.class || '');
      var matches = !!(
        (id && ref === id) ||
        (refName && name && refName === name)
      );
      if (matches) {
        var raw = activeInfo.raw;
        var settings = isObject(raw.settings) && !Array.isArray(raw.settings)
          ? raw.settings
          : (isObject(raw) ? raw : {});
        return {
          ok: true,
          reason: 'ok-active-class-fallback',
          ref: ref,
          id: id,
          name: name,
          settings: settings
        };
      }
    }

    return {
      ok: false,
      reason: 'global-class-not-found',
      ref: ref,
      id: '',
      name: ''
    };
  };

  BricksAPI.prototype.getGlobalClassCustomCss = function (ref) {
    ref = String(ref || '').trim();
    var info = this.getGlobalClassInfo(ref);
    if (!info.ok) return info;
    var settings = isObject(info.settings) && !Array.isArray(info.settings) ? info.settings : {};
    return {
      ok: true,
      reason: 'ok',
      ref: ref,
      id: info.id,
      name: info.name,
      css: typeof settings._cssCustom === 'string' ? settings._cssCustom : ''
    };
  };

  BricksAPI.prototype.getGlobalClassMappedSettingsCss = function (ref) {
    ref = String(ref || '').trim();
    var info = this.getGlobalClassInfo(ref);
    if (!info.ok) return info;
    var settings = isObject(info.settings) && !Array.isArray(info.settings) ? info.settings : {};
    var css = this._serializeMappedSettingsCssSnapshot(settings);

    if (!css && info.name && typeof this.getNativeGeneratedCssPreviewForGlobalClass === 'function') {
      var preview = this.getNativeGeneratedCssPreviewForGlobalClass(ref);
      if (preview && preview.ok && typeof preview.css === 'string' && preview.css.trim()) {
        var selector = '.' + String(info.name);
        var fromPreview = this._extractMappedCssDeclarations(String(preview.css || ''), selector);
        css = this._serializeDeclarationMap(fromPreview);
      }
    }

    return {
      ok: true,
      reason: css ? 'ok' : 'no-mapped-settings',
      ref: ref,
      id: info.id,
      name: info.name,
      css: css
    };
  };

  BricksAPI.prototype.updateGlobalClassCustomCss = function (ref, nextCss, opts) {
    opts = opts || {};
    ref = String(ref || '').trim();
    var result = {
      ok: false,
      changed: false,
      reason: '',
      ref: ref,
      id: '',
      name: '',
      css: { attempted: true, changed: false, supported: true, reason: '' },
      mapped: { attempted: true, changed: false, writes: [], deletes: [], changedSettingRoots: [] }
    };
    if (!ref) {
      result.reason = 'empty-class-ref';
      result.css.reason = 'empty-class-ref';
      return result;
    }

    var found = this._findGlobalClassEntry(ref);
    if (!found || !found.entry) {
      result.reason = 'global-class-not-found';
      result.css.reason = 'global-class-not-found';
      return result;
    }

    var classId = String(found.id || '');
    var className = String(found.name || '');
    result.id = classId;
    result.name = className;

    var currentSettings = isObject(found.entry.settings) && !Array.isArray(found.entry.settings) ? found.entry.settings : {};
    var nextSettings = Object.assign({}, currentSettings);
    var normalized = String(nextCss == null ? '' : nextCss).replace(/\r\n/g, '\n');
    var cleaned = normalized.replace(/^\s+|\s+$/g, '');
    var currentCss = typeof currentSettings._cssCustom === 'string' ? currentSettings._cssCustom : '';

    if (cleaned) {
      nextSettings._cssCustom = cleaned;
    } else if (hasOwn(nextSettings, '_cssCustom')) {
      delete nextSettings._cssCustom;
    }

    var mappedSummary = this._applyCssMappedSettingsDiff(
      nextSettings,
      currentCss,
      cleaned,
      { rootSelector: className ? ('.' + className) : '' }
    );
    result.mapped = mappedSummary;

    if (currentCss === cleaned && !mappedSummary.changed) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced';
      result.css.reason = 'already-synced';
      return result;
    }

    var stores = this._listGlobalClassStores();
    var wroteAny = false;
    for (var s = 0; s < stores.length; s++) {
      var arr = stores[s] && stores[s].array;
      if (!Array.isArray(arr)) continue;
      for (var i = 0; i < arr.length; i++) {
        var entry = arr[i];
        if (!entry || typeof entry !== 'object') continue;
        if (String(entry.id || '') !== classId) continue;
        try {
          entry.settings = deepCloneBestEffort(nextSettings);
          wroteAny = true;
        } catch (eWrite) { _warn("updateGlobalClassCustomCss", eWrite); }
      }
    }
    if (!wroteAny) {
      try {
        found.entry.settings = deepCloneBestEffort(nextSettings);
        wroteAny = true;
      } catch (eFallback) { _warn("updateGlobalClassCustomCss", eFallback); }
    }
    if (!wroteAny) {
      result.reason = 'state-write-failed';
      result.css.reason = 'state-write-failed';
      return result;
    }

    if (classId && className) {
      this._globalClassNameCache[classId] = className;
    }

    this._syncActiveClassUiState({
      globalClassId: classId,
      globalClassName: className,
      rebindActiveObject: true,
      touchBuilderUi: true,
      warnPrefix: 'updateGlobalClassCustomCss'
    });
    var activeClassMode = false;
    try { activeClassMode = !!((this._readActiveClassUiInfo() || {}).isClassActive); } catch (eInfo) { _warn("updateGlobalClassCustomCss", eInfo); }
    try {
      var selectedId = String(this.getSelectedElementId() || '');
      if (selectedId) this.renderElementInBuilder(selectedId);
    } catch (eRender) { _warn("updateGlobalClassCustomCss", eRender); }
    this.notifyGlobalClassesChanged();
    this.notifyContentSettingsChanged();
    if (!opts.deferUiRefresh) {
      this._requestManualRefresh({ includeSelection: false, reason: 'global-class-css-update' });
    }
    if (activeClassMode) {
      this._scheduleActiveClassUiSync({
        globalClassId: classId,
        globalClassName: className,
        rebindActiveObject: true,
        touchBuilderUi: true,
        warnPrefix: 'stabilizeClassUi'
      });
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    result.css.changed = currentCss !== cleaned;
    result.css.reason = result.css.changed ? 'updated' : 'already-synced';
    return result;
  };

  BricksAPI.prototype._listGlobalClassStores = function () {
    return this._collectGlobalClassStores();
  };

  BricksAPI.prototype._removeGlobalClassRegistryEntryById = function (targetId) {
    targetId = String(targetId || '');
    var result = {
      changed: false,
      removedEntries: 0,
      storesTouched: []
    };
    if (!targetId) return result;

    var stores = this._listGlobalClassStores();
    for (var s = 0; s < stores.length; s++) {
      var arr = stores[s].array;
      var before = arr.length;
      for (var i = arr.length - 1; i >= 0; i--) {
        var entry = arr[i];
        if (!entry || typeof entry !== 'object') continue;
        if (String(entry.id || '') !== targetId) continue;
        arr.splice(i, 1);
      }
      if (arr.length !== before) {
        result.changed = true;
        result.removedEntries += (before - arr.length);
        result.storesTouched.push(stores[s].path);
      }
    }
    if (result.changed && this._globalClassNameCache && hasOwn(this._globalClassNameCache, targetId)) {
      delete this._globalClassNameCache[targetId];
    }
    return result;
  };

  BricksAPI.prototype._walkStateObjects = function (root, visitor, maxNodes) {
    if (!root || typeof visitor !== 'function') return { scanned: 0, stopped: false };
    var stack = [root];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : [];
    var scanned = 0;
    var limit = Math.max(1000, Number(maxNodes || 12000));

    while (stack.length && scanned < limit) {
      var node = stack.pop();
      if (!node || (typeof node !== 'object' && typeof node !== 'function')) continue;
      if (node === w || node === document) continue;

      if (seen && typeof seen.add === 'function') {
        if (seen.has(node)) continue;
        seen.add(node);
      } else {
        if (seen.indexOf(node) !== -1) continue;
        seen.push(node);
      }

      scanned++;
      var shouldStop = false;
      try {
        shouldStop = visitor(node) === false;
      } catch (e) { _warn("_walkStateObjects", e); }
      if (shouldStop) return { scanned: scanned, stopped: true };

      if (Array.isArray(node)) {
        for (var ai = node.length - 1; ai >= 0; ai--) stack.push(node[ai]);
        continue;
      }

      var keys = [];
      try { keys = Object.keys(node); } catch (e2) { keys = []; }
      for (var k = keys.length - 1; k >= 0; k--) {
        var key = keys[k];
        if (key === 'el' || key === '$el' || key === 'parentNode' || key === 'ownerDocument') continue;
        var child;
        try { child = node[key]; } catch (e3) { child = null; }
        if (!child) continue;
        if (typeof Node !== 'undefined' && child instanceof Node) continue;
        if (typeof child === 'object' || typeof child === 'function') stack.push(child);
      }
    }

    return { scanned: scanned, stopped: false };
  };

  BricksAPI.prototype._collectGlobalClassReferences = function (targetId, opts) {
    targetId = String(targetId || '');
    opts = opts || {};
    var out = {
      targetId: targetId,
      references: [],
      total: 0,
      scanned: 0
    };
    if (!targetId) return out;

    var root = this.getVueState() || this.getAdmin() || null;
    var seenModelIds = {};
    var maxSamples = Math.max(5, Number(opts.maxSamples || 50));
    var self = this;
    var walk = this._walkStateObjects(root, function (node) {
      if (!node || typeof node !== 'object') return;
      if (!node.settings || typeof node.settings !== 'object') return;
      var rawIds = node.settings._cssGlobalClasses;
      if (!Array.isArray(rawIds) || !rawIds.length) return;
      var ids = self._normalizeGlobalClassIdList(rawIds);
      if (ids.indexOf(targetId) === -1) return;

      var modelId = String(node.id || '');
      if (modelId && seenModelIds[modelId]) return;
      if (modelId) seenModelIds[modelId] = true;

      out.total++;
      if (out.references.length < maxSamples) {
        out.references.push({
          id: modelId,
          name: String(node.name || ''),
          label: String(node.label || ''),
          model: node
        });
      }
    }, Number(opts.maxNodes || 18000));

    out.scanned = walk.scanned || 0;
    return out;
  };

  BricksAPI.prototype.getElementClassLifecycleByDom = function (domEl) {
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    if (!model) {
      return {
        ok: false,
        reason: 'model-not-found',
        id: String(resolved.id || ''),
        idCandidates: resolved.idCandidates || []
      };
    }

    var settings = isObject(model.settings) ? model.settings : {};
    var localClasses = this._normalizeClassNameList(settings._cssClasses || '');
    var globalIds = this._normalizeGlobalClassIdList(settings._cssGlobalClasses);
    var indexes = this._getGlobalClassIndexes();
    var globals = [];
    var unresolved = [];

    for (var i = 0; i < globalIds.length; i++) {
      var gid = globalIds[i];
      var gname = String(indexes.idToName[gid] || '');
      globals.push({ id: gid, name: gname, resolved: !!gname });
      if (!gname) unresolved.push(gid);
    }

    return {
      ok: true,
      reason: 'ok',
      id: String(resolved.id || ''),
      idCandidates: resolved.idCandidates || [],
      modelName: String(model.name || ''),
      localClasses: localClasses,
      globalClasses: globals,
      unresolvedGlobalClassIds: unresolved
    };
  };

  BricksAPI.prototype.detachClassFromElementByDom = function (domEl, ref, opts) {
    opts = opts || {};
    ref = String(ref || '').trim();
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');
    var result = {
      ok: false,
      changed: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      ref: ref,
      removed: { localNames: [], globalIds: [], globalNames: [] }
    };

    if (!ref) {
      result.reason = 'empty-class-ref';
      return result;
    }
    if (!model) {
      result.reason = 'model-not-found';
      return result;
    }

    var settings = isObject(model.settings) ? model.settings : {};
    var nextSettings = Object.assign({}, settings);
    var localClasses = this._normalizeClassNameList(settings._cssClasses || '');
    var globalIds = this._normalizeGlobalClassIdList(settings._cssGlobalClasses);
    var indexes = this._getGlobalClassIndexes();
    var targetGlobalIds = [];
    var targetLocalName = '';

    if (localClasses.indexOf(ref) !== -1) targetLocalName = ref;
    if (indexes.idToName[ref]) {
      targetGlobalIds.push(ref);
    } else {
      for (var i = 0; i < globalIds.length; i++) {
        var gid = globalIds[i];
        if (String(indexes.idToName[gid] || '') === ref) targetGlobalIds.push(gid);
      }
    }

    if (targetLocalName) {
      localClasses = localClasses.filter(function (c) { return c !== targetLocalName; });
      result.removed.localNames.push(targetLocalName);
    }
    if (targetGlobalIds.length) {
      var removeSet = {};
      for (i = 0; i < targetGlobalIds.length; i++) removeSet[targetGlobalIds[i]] = true;
      var keptGlobalIds = [];
      for (i = 0; i < globalIds.length; i++) {
        if (!removeSet[globalIds[i]]) keptGlobalIds.push(globalIds[i]);
      }
      for (i = 0; i < targetGlobalIds.length; i++) {
        result.removed.globalIds.push(targetGlobalIds[i]);
        result.removed.globalNames.push(String(indexes.idToName[targetGlobalIds[i]] || ''));
      }
      globalIds = keptGlobalIds;
    }

    if (!result.removed.localNames.length && !result.removed.globalIds.length) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-detached';
      return result;
    }

    if (localClasses.length) nextSettings._cssClasses = localClasses.join(' ');
    else if (hasOwn(nextSettings, '_cssClasses')) delete nextSettings._cssClasses;

    if (globalIds.length) nextSettings._cssGlobalClasses = globalIds.slice();
    else if (hasOwn(nextSettings, '_cssGlobalClasses')) delete nextSettings._cssGlobalClasses;

    try {
      model.settings = nextSettings;
    } catch (e) {
      result.reason = 'state-write-failed';
      result.error = e && e.message ? e.message : String(e);
      return result;
    }

    this.refreshActiveSelectionUiFromCanonical(modelId, model, { syncGlobalClasses: false });
    this.reconcileActiveClassUi({ model: model });
    this._touchBuilderUi();
    this.renderElementInBuilder(modelId);
    this.notifyContentSettingsChanged();
    if (!opts.deferUiRefresh) this._requestManualRefresh();

    result.ok = true;
    result.changed = true;
    result.reason = 'detached';
    return result;
  };

  BricksAPI.prototype.deleteGlobalClassDefinition = function (ref, opts) {
    opts = opts || {};
    ref = String(ref || '').trim();
    var force = !!opts.force;
    var result = {
      ok: false,
      changed: false,
      reason: '',
      ref: ref,
      force: force,
      deleted: false,
      detachedReferences: 0,
      referenceCount: 0,
      referenceSamples: []
    };

    if (!ref) {
      result.reason = 'empty-class-ref';
      return result;
    }

    var found = this._findGlobalClassEntry(ref);
    if (!found) {
      result.reason = 'global-class-not-found';
      return result;
    }

    result.targetId = found.id;
    result.targetName = found.name;

    var refs = this._collectGlobalClassReferences(found.id, {
      maxSamples: force ? 5000 : 20,
      maxNodes: force ? 30000 : 18000
    });
    result.referenceCount = refs.total || 0;
    result.referenceSamples = (refs.references || []).slice(0, 20).map(function (r) {
      return { id: r.id, name: r.name, label: r.label };
    });

    if (result.referenceCount > 0 && !force) {
      result.reason = 'global-class-still-referenced';
      return result;
    }

    if (result.referenceCount > 0 && force) {
      if ((refs.total || 0) > (refs.references || []).length) {
        result.reason = 'too-many-references-for-force-delete';
        return result;
      }
      for (var i = 0; i < refs.references.length; i++) {
        var modelRef = refs.references[i];
        var model = modelRef && modelRef.model;
        if (!model || !isObject(model.settings)) continue;
        var settings = model.settings;
        var currentIds = this._normalizeGlobalClassIdList(settings._cssGlobalClasses);
        if (currentIds.indexOf(found.id) === -1) continue;
        var nextIds = currentIds.filter(function (gid) { return gid !== found.id; });
        var nextSettings = Object.assign({}, settings);
        if (nextIds.length) nextSettings._cssGlobalClasses = nextIds;
        else if (hasOwn(nextSettings, '_cssGlobalClasses')) delete nextSettings._cssGlobalClasses;
        try {
          model.settings = nextSettings;
          result.detachedReferences++;
          if (String(model.id || '') === String(this.getSelectedElementId() || '')) {
            this.refreshActiveSelectionUiFromCanonical(String(model.id || ''), model);
            this.reconcileActiveClassUi({ model: model, deletedGlobalId: found.id, deletedGlobalName: found.name });
          }
        } catch (e) {
          result.reason = 'state-write-failed';
          result.error = e && e.message ? e.message : String(e);
          return result;
        }
      }
    }

    var removal = this._removeGlobalClassRegistryEntryById(found.id);
    if (!removal.changed) {
      result.reason = 'global-class-registry-remove-failed';
      return result;
    }

    this._touchBuilderUi();
    this.reconcileActiveClassUi({ deletedGlobalId: found.id, deletedGlobalName: found.name });
    this.notifyGlobalClassesChanged();
    this.notifyContentSettingsChanged();
    this._requestManualRefresh();

    result.ok = true;
    result.changed = true;
    result.deleted = true;
    result.reason = force && result.detachedReferences > 0 ? 'deleted-and-detached' : 'deleted';
    result.storesTouched = removal.storesTouched || [];
    result.removedRegistryEntries = removal.removedEntries || 0;
    return result;
  };

  BricksAPI.prototype._buildClassStatePlan = function (settings, desiredUserClasses, originalDomUserClasses) {
    settings = isObject(settings) ? settings : {};
    desiredUserClasses = this._normalizeClassNameList(desiredUserClasses);
    originalDomUserClasses = this._normalizeClassNameList(originalDomUserClasses);

    var currentLocalClasses = this._normalizeClassNameList(settings._cssClasses || '');
    var currentGlobalClassIds = this._normalizeGlobalClassIdList(settings._cssGlobalClasses);
    var indexes = this._getGlobalClassIndexes();

    var currentLocalSet = {};
    var i;
    for (i = 0; i < currentLocalClasses.length; i++) {
      currentLocalSet[currentLocalClasses[i]] = true;
    }

    var currentGlobalNameToId = {};
    var unresolvedGlobalClassIds = [];
    for (i = 0; i < currentGlobalClassIds.length; i++) {
      var gid = currentGlobalClassIds[i];
      var gname = indexes.idToName[gid];
      if (gname) {
        if (!currentGlobalNameToId[gname]) currentGlobalNameToId[gname] = gid;
      } else {
        unresolvedGlobalClassIds.push(gid);
      }
    }

    var nextLocalClasses = [];
    var nextGlobalClassIds = [];
    var seenLocal = {};
    var seenGlobalIds = {};
    var localKeepMap = {};
    var globalKeepMap = {};

    var hasOriginalDomBaseline = originalDomUserClasses.length > 0;

    if (hasOriginalDomBaseline) {
      for (i = 0; i < currentLocalClasses.length; i++) localKeepMap[currentLocalClasses[i]] = true;
      for (i = 0; i < currentGlobalClassIds.length; i++) globalKeepMap[currentGlobalClassIds[i]] = true;

      var desiredSet = {};
      var originalSet = {};
      for (i = 0; i < desiredUserClasses.length; i++) desiredSet[desiredUserClasses[i]] = true;
      for (i = 0; i < originalDomUserClasses.length; i++) originalSet[originalDomUserClasses[i]] = true;

      // Remove only what the user explicitly removed from the HTML class attr (relative to original DOM snapshot).
      for (i = 0; i < originalDomUserClasses.length; i++) {
        var removedName = originalDomUserClasses[i];
        if (desiredSet[removedName]) continue;
        delete localKeepMap[removedName];
        var removeGlobalId = currentGlobalNameToId[removedName];
        if (removeGlobalId) delete globalKeepMap[removeGlobalId];
      }

      // Add only what the user explicitly added.
      for (i = 0; i < desiredUserClasses.length; i++) {
        var addName = desiredUserClasses[i];
        if (originalSet[addName]) continue;

        var existingGlobalIdForAdd = currentGlobalNameToId[addName];
        if (existingGlobalIdForAdd && globalKeepMap[existingGlobalIdForAdd]) continue;
        if (localKeepMap[addName]) continue;

        var registryId = indexes.nameToId[addName] || this._ensureGlobalClassIdByName(addName);
        if (registryId) {
          globalKeepMap[registryId] = true;
        } else {
          localKeepMap[addName] = true;
        }
      }

      for (i = 0; i < currentLocalClasses.length; i++) {
        var localName = currentLocalClasses[i];
        if (localKeepMap[localName] && !seenLocal[localName]) {
          seenLocal[localName] = true;
          nextLocalClasses.push(localName);
        }
      }
      for (i = 0; i < currentGlobalClassIds.length; i++) {
        var gidCurrent = currentGlobalClassIds[i];
        if (globalKeepMap[gidCurrent] && !seenGlobalIds[gidCurrent]) {
          seenGlobalIds[gidCurrent] = true;
          nextGlobalClassIds.push(gidCurrent);
        }
      }

      // Append newly introduced names that were not part of current assignments.
      for (i = 0; i < desiredUserClasses.length; i++) {
        addName = desiredUserClasses[i];
        if (originalSet[addName]) continue;

        registryId = indexes.nameToId[addName] || this._ensureGlobalClassIdByName(addName);
        if (registryId) {
          if (!seenGlobalIds[registryId]) {
            seenGlobalIds[registryId] = true;
            nextGlobalClassIds.push(registryId);
          }
          continue;
        }

        if (!seenLocal[addName]) {
          seenLocal[addName] = true;
          nextLocalClasses.push(addName);
        }
      }

      return {
        currentLocalClasses: currentLocalClasses,
        currentGlobalClassIds: currentGlobalClassIds,
        desiredLocalClasses: nextLocalClasses,
        desiredGlobalClassIds: nextGlobalClassIds,
        unresolvedGlobalClassIds: unresolvedGlobalClassIds
      };
    }

    for (i = 0; i < desiredUserClasses.length; i++) {
      var clsName = desiredUserClasses[i];
      if (!clsName) continue;

      // Preserve current ownership first (global vs local), then fall back to registry lookup.
      var existingGlobalId = currentGlobalNameToId[clsName];
      if (existingGlobalId) {
        if (!seenGlobalIds[existingGlobalId]) {
          seenGlobalIds[existingGlobalId] = true;
          nextGlobalClassIds.push(existingGlobalId);
        }
        continue;
      }

      if (currentLocalSet[clsName]) {
        if (!seenLocal[clsName]) {
          seenLocal[clsName] = true;
          nextLocalClasses.push(clsName);
        }
        continue;
      }

      var registryGlobalId = indexes.nameToId[clsName] || this._ensureGlobalClassIdByName(clsName);
      if (registryGlobalId) {
        if (!seenGlobalIds[registryGlobalId]) {
          seenGlobalIds[registryGlobalId] = true;
          nextGlobalClassIds.push(registryGlobalId);
        }
        continue;
      }

      // Unknown class names become local element classes by default (safer than creating globals).
      if (!seenLocal[clsName]) {
        seenLocal[clsName] = true;
        nextLocalClasses.push(clsName);
      }
    }

    // Preserve unresolved global IDs (we can't map them back to names safely).
    for (i = 0; i < unresolvedGlobalClassIds.length; i++) {
      var unresolvedId = unresolvedGlobalClassIds[i];
      if (!seenGlobalIds[unresolvedId]) {
        seenGlobalIds[unresolvedId] = true;
        nextGlobalClassIds.push(unresolvedId);
      }
    }

    return {
      currentLocalClasses: currentLocalClasses,
      currentGlobalClassIds: currentGlobalClassIds,
      desiredLocalClasses: nextLocalClasses,
      desiredGlobalClassIds: nextGlobalClassIds,
      unresolvedGlobalClassIds: unresolvedGlobalClassIds
    };
  };

  BricksAPI.prototype.updateElementSafeSubsetStateByDom = function (domEl, subset, opts) {
    opts = opts || {};
    subset = subset || {};
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');

    var result = {
      ok: false,
      changed: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      modelName: '',
      text: { attempted: false, changed: false, supported: false, reason: '' },
      cssId: { attempted: false, changed: false, supported: false, reason: '' },
      semantic: { attempted: false, changed: false, supported: false, reason: '' },
      attrs: { attempted: false, changed: false, supported: true, unsupported: [] },
      classes: { attempted: false, changed: false, supported: false, reason: 'not-implemented' }
    };

    if (!model) {
      result.reason = 'model-not-found';
      return result;
    }

    var name = String(model.name || '').toLowerCase();
    result.modelName = name || '';

    var settings = isObject(model.settings) ? model.settings : {};
    var nextSettings = Object.assign({}, settings);
    var anyChanged = false;

    // Text field sync (common Bricks text-like elements).
    if (hasOwn(subset, 'text')) {
      result.text.attempted = true;
      var normalizedText = String(subset.text == null ? '' : subset.text);
      var hasExplicitTextField = hasOwn(settings, 'text');
      var textishByName = /^(text|rich-text|heading|button)$/.test(name);
      if (hasExplicitTextField || textishByName) {
        result.text.supported = true;
        var currentText = String(settings.text == null ? '' : settings.text);
        if (currentText !== normalizedText) {
          nextSettings.text = normalizedText;
          result.text.changed = true;
          anyChanged = true;
        } else {
          result.text.reason = 'already-synced';
        }
      } else {
        result.text.reason = 'unsupported-element-type';
      }
    }

    // Custom CSS ID sync (Bricks state commonly uses _cssId).
    if (hasOwn(subset, 'idRaw')) {
      result.cssId.attempted = true;
      result.cssId.supported = true;
      var nextCssId = String(subset.idRaw == null ? '' : subset.idRaw);
      var currentCssId = String(settings._cssId == null ? '' : settings._cssId);
      if (currentCssId !== nextCssId) {
        nextSettings._cssId = nextCssId;
        result.cssId.changed = true;
        anyChanged = true;
      } else {
        result.cssId.reason = 'already-synced';
      }
    }

    if (hasOwn(subset, 'semanticTag')) {
      var semanticResult = this._applySemanticTagSubset(name, settings, nextSettings, subset.semanticTag);
      result.semantic = semanticResult;
      if (semanticResult.changed) anyChanged = true;
    }

    // Best-effort custom attributes sync via settings._attributes.
    if (hasOwn(subset, 'attrs')) {
      result.attrs.attempted = true;
      var attrSync = this._syncSettingsCustomAttributes(settings, subset.attrs || {});
      result.attrs.unsupported = attrSync.unsupported || [];
      if (attrSync.changed) {
        nextSettings._attributes = attrSync.nextAttributes;
        result.attrs.changed = true;
        anyChanged = true;
      }
    }

    // User classes: sync to local (_cssClasses) + global IDs (_cssGlobalClasses) based on current ownership and registry lookup.
    if (hasOwn(subset, 'userClasses') || (hasOwn(subset, 'classChanged') && subset.classChanged)) {
      result.classes.attempted = !!(hasOwn(subset, 'classChanged') ? subset.classChanged : true);
      result.classes.supported = true;

      var classPlan = this._buildClassStatePlan(settings, subset.userClasses || [], subset.originalUserClasses || []);
      var currentLocalStr = classPlan.currentLocalClasses.length ? classPlan.currentLocalClasses.join(' ') : '';
      var nextLocalStr = classPlan.desiredLocalClasses.length ? classPlan.desiredLocalClasses.join(' ') : '';
      if (currentLocalStr !== nextLocalStr) {
        if (nextLocalStr) {
          nextSettings._cssClasses = nextLocalStr;
        } else if (hasOwn(nextSettings, '_cssClasses')) {
          delete nextSettings._cssClasses;
        }
        result.classes.changed = true;
        anyChanged = true;
      }

      if (!this._equalStringArrays(classPlan.currentGlobalClassIds, classPlan.desiredGlobalClassIds)) {
        if (classPlan.desiredGlobalClassIds.length) {
          nextSettings._cssGlobalClasses = classPlan.desiredGlobalClassIds.slice();
        } else if (hasOwn(nextSettings, '_cssGlobalClasses')) {
          delete nextSettings._cssGlobalClasses;
        }
        result.classes.changed = true;
        anyChanged = true;
      }

      if (!result.classes.changed) {
        result.classes.reason = 'already-synced';
      } else {
        result.classes.reason = 'updated';
      }
      if (classPlan.unresolvedGlobalClassIds.length) {
        result.classes.unresolvedGlobalClassIds = classPlan.unresolvedGlobalClassIds.slice();
      }
    }

    if (!anyChanged) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced-or-unsupported';
      return result;
    }

    try {
      model.settings = nextSettings;
    } catch (e) {
      result.reason = 'state-write-failed';
      result.error = e && e.message ? e.message : String(e);
      return result;
    }

    // Bricks sidebar often reads a cloned activeElement/activeObject snapshot.
    // Refresh those refs from canonical state so GUI controls show updated values immediately.
    this.refreshActiveSelectionUiFromCanonical(modelId, model);
    if (result.classes && result.classes.changed) {
      this.reconcileActiveClassUi({ model: model });
    }

    if (!opts.deferUiRefresh) {
      if (result.classes && result.classes.changed && typeof this.notifyGlobalClassesChanged === 'function') {
        try { this.notifyGlobalClassesChanged(); } catch (eN2) { _warn("updateElementSafeSubsetStateByDom", eN2); }
      }
      this._touchBuilderUi();
      this.renderElementInBuilder(modelId);
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    return result;
  };

  BricksAPI.prototype.updateElementTextSettingByDom = function (domEl, nextText, opts) {
    var res = this.updateElementSafeSubsetStateByDom(domEl, { text: nextText }, opts || {});
    return {
      ok: !!res.ok,
      changed: !!res.changed && !!(res.text && res.text.changed),
      reason: res.text && res.text.reason ? res.text.reason : (res.reason || ''),
      id: res.id || '',
      modelName: res.modelName || '',
      idCandidates: res.idCandidates || []
    };
  };

  BricksAPI.prototype.getElementMappedSettingsCssByDom = function (domEl) {
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');
    var result = {
      ok: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      modelName: '',
      css: ''
    };
    if (!model) {
      result.reason = 'model-not-found';
      return result;
    }

    result.modelName = String(model.name || '').toLowerCase() || '';
    var settings = isObject(model.settings) ? model.settings : {};
    result.css = this._serializeMappedSettingsCssSnapshot(settings);
    result.ok = true;
    result.reason = result.css ? 'ok' : 'no-mapped-settings';
    return result;
  };

  BricksAPI.prototype.updateElementMappedSettingsByDom = function (domEl, nextCss, opts) {
    opts = opts || {};
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');
    var result = {
      ok: false,
      changed: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      modelName: '',
      mapped: { attempted: true, changed: false, writes: [], deletes: [], changedSettingRoots: [] }
    };

    if (!model) {
      result.reason = 'model-not-found';
      return result;
    }

    var name = String(model.name || '').toLowerCase();
    result.modelName = name || '';

    var settings = isObject(model.settings) ? model.settings : {};
    var nextSettings = Object.assign({}, settings);
    var normalized = String(nextCss == null ? '' : nextCss).replace(/\r\n/g, '\n');
    var cleaned = normalized.replace(/^\s+|\s+$/g, '');
    var previousMappedCss = this._serializeMappedSettingsCssSnapshot(settings);

    if (cleaned) {
      var mappedPropCount = this._countMappedDeclarationsForCss(cleaned, '');
      if (!mappedPropCount) {
        result.reason = 'no-mapped-properties-detected';
        return result;
      }
    }

    var mappedSummary = this._applyCssMappedSettingsDiff(
      nextSettings,
      previousMappedCss,
      cleaned,
      { rootSelector: '' }
    );
    result.mapped = mappedSummary;

    if (!mappedSummary.changed) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced';
      return result;
    }

    try {
      model.settings = nextSettings;
    } catch (e) {
      result.reason = 'state-write-failed';
      result.error = e && e.message ? e.message : String(e);
      return result;
    }

    this.refreshActiveSelectionUiFromCanonical(modelId, model, {
      managedSettingKeys: mappedSummary.changedSettingRoots || []
    });
    try {
      this.reconcileActiveClassUi({ model: model });
    } catch (eRec) { _warn("updateElementMappedSettingsByDom", eRec); }

    if (!opts.deferUiRefresh) {
      this._touchBuilderUi();
      this.renderElementInBuilder(modelId);
      this.notifyContentSettingsChanged();
      this._requestManualRefresh({ includeSelection: false, reason: 'mapped-settings-css-update' });
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    return result;
  };

  BricksAPI.prototype.syncActiveSelectionUiFromCssPreviewByDom = function (domEl, nextCss, opts) {
    opts = opts || {};
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');
    var result = {
      ok: false,
      changed: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      modelName: '',
      preview: { attempted: true, changed: false, writes: [], deletes: [], changedSettingRoots: [] }
    };

    if (!model) {
      result.reason = 'model-not-found';
      return result;
    }

    var name = String(model.name || '').toLowerCase();
    result.modelName = name || '';

    var rootSelector = this._getBricksRootSelectorForElement(domEl, modelId);
    if (!rootSelector) {
      result.reason = 'root-selector-missing';
      return result;
    }

    var syntheticModel = deepCloneBestEffort(model);
    if (!syntheticModel || syntheticModel === model || typeof syntheticModel !== 'object') {
      syntheticModel = Object.assign({}, model);
    }

    var settings = isObject(model.settings) ? model.settings : {};
    var syntheticSettings = deepCloneBestEffort(settings);
    if (!syntheticSettings || syntheticSettings === settings || typeof syntheticSettings !== 'object') {
      syntheticSettings = Object.assign({}, settings);
    }
    syntheticModel.settings = syntheticSettings;

    var normalized = String(nextCss == null ? '' : nextCss).replace(/\r\n/g, '\n').trim();
    var previewSummary = this._applyCssMappedSettingsDiff(
      syntheticSettings,
      '',
      normalized,
      { rootSelector: rootSelector }
    );
    result.preview = previewSummary;

    if (!previewSummary.changed) {
      result.ok = true;
      result.changed = false;
      result.reason = 'no-mapped-preview-changes';
      return result;
    }

    var uiChanged = this.refreshActiveSelectionUiFromCanonical(modelId, syntheticModel, {
      managedSettingKeys: previewSummary.changedSettingRoots || []
    });
    try {
      this.reconcileActiveClassUi({ model: syntheticModel });
    } catch (eRec) { _warn("syncActiveSelectionUiFromCssPreviewByDom", eRec); }

    result.ok = true;
    result.changed = !!uiChanged;
    result.reason = uiChanged ? 'updated' : 'already-synced';
    return result;
  };

  BricksAPI.prototype.updateElementCustomCssByDom = function (domEl, nextCss, opts) {
    opts = opts || {};
    var syncMappedFromCustom = opts.syncMappedFromCustom !== false;
    var resolved = this.getElementModelByDom(domEl);
    var model = resolved.model;
    var modelId = String(resolved.id || '');
    var hadActiveClassMode = false;
    try {
      hadActiveClassMode = !!(this._readActiveClassUiInfo() || {}).isClassActive;
    } catch (eInfo) { _warn("updateElementCustomCssByDom", eInfo); }

    var result = {
      ok: false,
      changed: false,
      reason: '',
      id: modelId,
      idCandidates: resolved.idCandidates || [],
      modelName: '',
      css: { attempted: true, changed: false, supported: false, reason: '' },
      mapped: { attempted: syncMappedFromCustom, changed: false, writes: [], deletes: [], changedSettingRoots: [] }
    };

    if (!model) {
      result.reason = 'model-not-found';
      result.css.reason = 'model-not-found';
      return result;
    }

    var name = String(model.name || '').toLowerCase();
    result.modelName = name || '';

    var settings = isObject(model.settings) ? model.settings : {};
    var nextSettings = Object.assign({}, settings);
    var currentCss = typeof settings._cssCustom === 'string' ? settings._cssCustom : '';
    var normalized = String(nextCss == null ? '' : nextCss).replace(/\r\n/g, '\n');
    var cleaned = normalized.replace(/^\s+|\s+$/g, '');
    var finalCustomCss = cleaned;
    var rootSelector = this._getBricksRootSelectorForElement(domEl, modelId);

    result.css.supported = true;

    var mappedSummary = result.mapped;
    if (syncMappedFromCustom) {
      var previousMappedCss = this._serializeMappedSettingsCssSnapshot(settings);
      mappedSummary = this._applyCssMappedSettingsDiff(
        nextSettings,
        previousMappedCss,
        cleaned,
        { rootSelector: rootSelector }
      );
      result.mapped = mappedSummary;

      var nextMappedCss = this._serializeMappedSettingsCssSnapshot(nextSettings);
      var filteredCustom = this.filterCustomCssMappedOverlap(cleaned, nextMappedCss, {
        rootSelector: rootSelector
      });
      if (filteredCustom && filteredCustom.ok) {
        finalCustomCss = String(filteredCustom.css || '').replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '');
        result.css.removedMappedProps = Array.isArray(filteredCustom.removedProps)
          ? filteredCustom.removedProps.slice()
          : [];
      }
    }

    if (finalCustomCss) {
      nextSettings._cssCustom = finalCustomCss;
    } else if (hasOwn(nextSettings, '_cssCustom')) {
      delete nextSettings._cssCustom;
    }

    if (currentCss === finalCustomCss && !mappedSummary.changed) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced';
      result.css.reason = 'already-synced';
      return result;
    }

    try {
      model.settings = nextSettings;
    } catch (e) {
      result.reason = 'state-write-failed';
      result.css.reason = 'state-write-failed';
      result.error = e && e.message ? e.message : String(e);
      return result;
    }

    this._syncActiveClassUiState({
      modelId: modelId,
      model: model,
      managedSettingKeys: mappedSummary.changedSettingRoots || [],
      reconcileOptions: { model: model },
      rebindActiveObject: false,
      touchBuilderUi: false,
      warnPrefix: 'updateElementCustomCssByDom'
    });

    if (!opts.deferUiRefresh) {
      this._touchBuilderUi();
      this.renderElementInBuilder(modelId);
      this.notifyContentSettingsChanged();
      if (hadActiveClassMode) {
        this._scheduleActiveClassUiSync({
          modelId: modelId,
          model: model,
          managedSettingKeys: (mappedSummary && mappedSummary.changedSettingRoots) || [],
          reconcileOptions: { model: model },
          syncGlobalClasses: false,
          rebindActiveObject: true,
          touchBuilderUi: true,
          warnPrefix: 'updateElementCustomCssByDom'
        });
      }
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    result.css.changed = currentCss !== finalCustomCss;
    result.css.reason = result.css.changed ? 'updated' : 'already-synced';
    return result;
  };

  BricksAPI.prototype._getPageSettingsStores = function () {
    var out = [];
    var seen = [];

    function pushStore(obj, path) {
      if (!isObject(obj)) return;
      if (seen.indexOf(obj) >= 0) return;
      seen.push(obj);
      out.push({ obj: obj, path: path });
    }

    var roots = this._getCompatibilityWalkRoots();
    for (var i = 0; i < roots.length; i++) {
      var rootEntry = roots[i];
      var root = rootEntry && rootEntry.root;
      var rootPath = rootEntry && rootEntry.path ? String(rootEntry.path) : '';
      try {
        pushStore(root && root.pageSettings, rootPath ? (rootPath + '.pageSettings') : 'pageSettings');
      } catch (ePush) { _warn("pushStore", ePush); }
    }

    var self = this;
    for (var r = 0; r < roots.length; r++) {
      var walkEntry = roots[r];
      this._walkStateObjects(walkEntry && walkEntry.root, function (node) {
        if (!isObject(node)) return;

        if (isObject(node.pageSettings)) {
          pushStore(node.pageSettings, 'walk.pageSettings');
        }

        var keys = [];
        try { keys = Object.keys(node); } catch (eKeys) { keys = []; }
        for (var k = 0; k < keys.length; k++) {
          var key = String(keys[k] || '').trim();
          if (!key) continue;
          var normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
          if (normalizedKey.indexOf('pagesettings') === -1) continue;
          if (normalizedKey === 'pagesettings') continue;
          var candidate = null;
          try { candidate = node[key]; } catch (eRead) { candidate = null; }
          if (!isObject(candidate)) continue;
          pushStore(candidate, 'walk.' + key);
        }
      }, 16000);
    }

    return out;
  };

  BricksAPI.prototype._writePageCustomCssStores = function (stores, nextCss) {
    stores = Array.isArray(stores) ? stores : [];
    var cleaned = String(nextCss == null ? '' : nextCss).replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '');

    for (var i = 0; i < stores.length; i++) {
      var pageSettings = stores[i] && stores[i].obj;
      if (!pageSettings) continue;
      pageSettings.customCss = cleaned;
    }

    return cleaned;
  };

  BricksAPI.prototype.getPageCustomCss = function () {
    var stores = this._getPageSettingsStores();
    for (var i = 0; i < stores.length; i++) {
      var pageSettings = stores[i] && stores[i].obj;
      if (!pageSettings || typeof pageSettings !== 'object') continue;
      if (typeof pageSettings.customCss === 'string') return pageSettings.customCss;
      if (pageSettings.customCss != null) return String(pageSettings.customCss);
    }
    return '';
  };

  BricksAPI.prototype.updatePageCustomCss = function (nextCss, opts) {
    opts = opts || {};
    var stores = this._getPageSettingsStores();
    var result = {
      ok: false,
      changed: false,
      reason: '',
      css: { attempted: true, changed: false, supported: false, reason: '', reappliedAfterNotify: false },
      stores: stores.map(function (s) { return s.path; })
    };

    if (!stores.length) {
      result.reason = 'page-settings-not-found';
      result.css.reason = 'page-settings-not-found';
      return result;
    }

    var normalized = String(nextCss == null ? '' : nextCss).replace(/\r\n/g, '\n');
    var cleaned = normalized.replace(/^\s+|\s+$/g, '');
    var currentCss = this.getPageCustomCss();

    result.css.supported = true;
    if (String(currentCss || '') === cleaned) {
      result.ok = true;
      result.changed = false;
      result.reason = 'already-synced';
      result.css.reason = 'already-synced';
      return result;
    }

    var writeFailed = null;
    try {
      this._writePageCustomCssStores(stores, cleaned);
    } catch (e) {
      writeFailed = e;
    }

    if (writeFailed) {
      result.reason = 'state-write-failed';
      result.css.reason = 'state-write-failed';
      result.error = writeFailed && writeFailed.message ? writeFailed.message : String(writeFailed);
      return result;
    }

    if (String(this.getPageCustomCss() || '') !== cleaned) {
      result.reason = 'state-readback-mismatch';
      result.css.reason = 'state-readback-mismatch';
      return result;
    }

    this._touchBuilderUi();
    if (!opts.deferUiRefresh) {
      this.notifyContentSettingsChanged();
      if (String(this.getPageCustomCss() || '') !== cleaned) {
        try {
          this._writePageCustomCssStores(stores, cleaned);
          result.css.reappliedAfterNotify = true;
        } catch (reapplyErr) {
          result.reason = 'state-reapply-failed';
          result.css.reason = 'state-reapply-failed';
          result.error = reapplyErr && reapplyErr.message ? reapplyErr.message : String(reapplyErr);
          return result;
        }
        if (String(this.getPageCustomCss() || '') !== cleaned) {
          result.reason = 'state-readback-mismatch';
          result.css.reason = 'state-readback-mismatch';
          return result;
        }
        this._touchBuilderUi();
      }
      this._requestManualRefresh();
    }

    result.ok = true;
    result.changed = true;
    result.reason = 'updated';
    result.css.changed = true;
    result.css.reason = 'updated';
    return result;
  };

  BricksAPI.prototype.destroy = function () {
    this._destroyed = true;
    this._pollingActive = false;
    this._stopSelectionPoll();
    if (this._emitDomChangedDebounced && typeof this._emitDomChangedDebounced.cancel === 'function') {
      this._emitDomChangedDebounced.cancel();
    }
    this._clearDeferredUiStabilizers();
    this.clearRecipeGhostPreview();
    this.clearCssHoverPreview();
    this._listeners = {};
  };

  var moduleDeps = {
    now: now,
    warn: _warn,
    removeValueFromArray: removeValueFromArray,
    isObject: isObject,
    removeClassSafe: removeClassSafe,
    splitCssSelectorList: splitCssSelectorList,
    pushUniqueSelector: pushUniqueSelector,
    buildScopedSelectorVariants: buildScopedSelectorVariants,
    parseSingleTopLevelAtRuleBlock: parseSingleTopLevelAtRuleBlock
  };
  runtimeModule.install(BricksAPI, moduleDeps);
  discoveryModule.install(BricksAPI, moduleDeps);
  previewModule.install(BricksAPI, moduleDeps);

  ns.BricksAPI = BricksAPI;
})(window);
