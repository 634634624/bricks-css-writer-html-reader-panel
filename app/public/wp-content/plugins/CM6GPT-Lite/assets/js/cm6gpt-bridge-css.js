(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][bridge-css]', context, err); } catch (_) { /* noop */ }
  }

  /** Bricks builder element ID selector prefix (e.g. #brxe-abcdef). */
  var BRICKS_ELEMENT_PREFIX = '#brxe-';

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  var hasOwn = ns.hasOwn || function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // Fail-fast dependency guards: these throw intentionally at call-time so that
  // missing helper modules surface immediately rather than causing silent bugs.
  function getBridgeTiming() {
    if (!ns.BridgeTiming || typeof ns.BridgeTiming.debounce !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeTiming is missing or incomplete — ensure cm6gpt-bridge-timing.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeTiming;
  }

  function getBridgeGateUx() {
    if (!ns.BridgeGateUx || typeof ns.BridgeGateUx.normalizeGateForUx !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeGateUx is missing or incomplete — ensure cm6gpt-bridge-gate-ux.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeGateUx;
  }

  function getBridgeAnalysisLens() {
    if (!ns.BridgeAnalysisLens || typeof ns.BridgeAnalysisLens.readSummary !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeAnalysisLens is missing or incomplete — ensure cm6gpt-bridge-analysis-lens.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeAnalysisLens;
  }

  function getBridgeStatusUx() {
    if (!ns.BridgeStatusUx || typeof ns.BridgeStatusUx.setPanelStatus !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeStatusUx is missing or incomplete — ensure cm6gpt-bridge-status-ux.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeStatusUx;
  }

  function getBridgeFacadeUtils() {
    if (!ns.BridgeFacadeUtils || typeof ns.BridgeFacadeUtils.installStatusApplyFacade !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeFacadeUtils is missing or incomplete — ensure cm6gpt-bridge-shared.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeFacadeUtils;
  }

  function getBridgeScopeContext() {
    if (!ns.BridgeScopeContext || typeof ns.BridgeScopeContext.getScopedContext !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeScopeContext is missing or incomplete — ensure cm6gpt-bridge-scope-context.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeScopeContext;
  }

  function getBridgeApplyPolicy() {
    if (!ns.BridgeApplyPolicy || typeof ns.BridgeApplyPolicy.resolve !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeApplyPolicy is missing or incomplete — ensure cm6gpt-bridge-apply-policy.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeApplyPolicy;
  }

  function getBridgeRuntimeUtils() {
    if (
      !ns.BridgeRuntimeUtils
      || typeof ns.BridgeRuntimeUtils.runApplyTransaction !== 'function'
      || typeof ns.BridgeRuntimeUtils.createManagedTimeout !== 'function'
      || typeof ns.BridgeRuntimeUtils.removeDomNode !== 'function'
    ) {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeRuntimeUtils is missing or incomplete — ensure cm6gpt-bridge-runtime-utils.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeRuntimeUtils;
  }

  function createManagedTimeout(timerApi) {
    return getBridgeRuntimeUtils().createManagedTimeout(timerApi);
  }

  function removeDomNode(node) {
    return getBridgeRuntimeUtils().removeDomNode(node, _warn);
  }

  function getBridgeCanonicalReport() {
    if (!ns.BridgeCanonicalReport || typeof ns.BridgeCanonicalReport.buildReport !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeCanonicalReport is missing or incomplete — ensure cm6gpt-bridge-canonical-report.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeCanonicalReport;
  }

  function getBridgeManualRefresh() {
    if (!ns.BridgeManualRefresh || typeof ns.BridgeManualRefresh.requestReport !== 'function') {
      throw new Error('CM6GPT: required dependency CM6GPT.BridgeManualRefresh is missing or incomplete — ensure cm6gpt-bridge-manual-refresh.js is loaded before cm6gpt-bridge-css.js');
    }
    return ns.BridgeManualRefresh;
  }

  function CSSBridge(opts) {
    opts = opts || {};
    this.api = opts.api;
    this.editor = opts.editor;
    this.panel = opts.panel;
    this.readOnly = opts.readOnly !== false;
    this.liveSync = {
      enabled: opts.liveSync !== false,
      debounceMs: Math.max(80, Number(opts.liveSyncDebounceMs || 180))
    };
    this.maxStyleKb = Number(opts.maxStyleKb || 128);
    this._lastCss = null;
    this._editSeq = 0;
    this._lastEditAt = 0;
    this._lastEditSelectionId = '';
    this._lastEditContextMode = '';
    this._lastEditContextKey = '';
    this._dirty = false;
    this._dirtySelectionId = '';
    this._dirtyContextKey = '';
    this._dirtyViewMode = '';
    this._applying = false;
    this._lastAutoStatus = '';
    this.statusPolicy = {
      dedupeMs: Math.max(120, Number(opts.statusDedupeMs || 260)),
      autoThrottleMs: Math.max(420, Number(opts.statusAutoThrottleMs || 900))
    };
    this._statusCache = {};
    this._lastRenderedContextKey = '';
    this._lastRenderedViewMode = '';
    this._lastRenderedPropertyFilterKey = '';
    this._lastRenderedChildrenScopeSignature = '';
    this._lastRenderedMappedSettingsCss = '';
    this._lastCanonicalInfoText = '';
    this._lastCanonicalInfoContextKey = '';
    this._childScopeElementTokens = typeof WeakMap === 'function' ? new WeakMap() : null;
    this._childScopeElementTokenSeq = 0;
    this._hoverPreviewSelector = '';
    this._ignorePageSelectionUntil = 0;
    this._pendingPageSelectionTimer = createManagedTimeout(opts.timerApi);
    this._pendingTypingRefreshTimer = createManagedTimeout(opts.timerApi);
    this._pendingTypingRefreshKey = '';
    this._pageRenderOverride = null;
    this._elementRenderOverride = null;
    this._unsubs = [];
    this._refreshDebounced = getBridgeTiming().debounce(this.refresh.bind(this), Number(opts.debounceMs || 120));
    this._autoApplyDebounced = getBridgeTiming().debounce(this._runAutoApply.bind(this), this.liveSync.debounceMs);
    this.viewMode = 'canonical';
    this.scopeMode = this._normalizeScopeMode(
      opts.scopeMode || (this.panel && typeof this.panel.getScopeMode === 'function' ? this.panel.getScopeMode() : 'self')
    );
    this.layerMode = this._normalizeLayerMode(
      opts.layerMode || (this.panel && typeof this.panel.getLayerMode === 'function' ? this.panel.getLayerMode() : 'l2')
    );
    this.cssLensMode = this._normalizeCssLensMode(
      opts.cssLensMode || (this.panel && typeof this.panel.getCssLensMode === 'function' ? this.panel.getCssLensMode() : 'minimal')
    );
    this.propertyFilter = this._normalizePropertyFilter(
      opts.propertyFilter || (this.panel && typeof this.panel.getCssPropertyFilter === 'function'
        ? this.panel.getCssPropertyFilter()
        : { class: true, id: false })
    );
  }

  getBridgeFacadeUtils().installStatusApplyFacade(CSSBridge.prototype, {
    kind: 'CSS',
    lane: 'css',
    getStatusUx: getBridgeStatusUx,
    getApplyPolicy: getBridgeApplyPolicy,
    getRuntimeUtils: getBridgeRuntimeUtils
  });

  CSSBridge.prototype.start = function () {
    var self = this;
    if (!this.api || !this.editor) return;

    this._unsubs.push(this.api.on('builder:ready', function () { self.refresh({ force: true }); }));
    this._unsubs.push(this.api.on('dom:changed', function () { self._refreshDebounced(); }));
    this._unsubs.push(this.api.on('selection:changed', function (ctx) {
      // Clear pill-click class override — the user selected a different element
      self._activeClassTargetOverride = null;
      self._clearHoverPreview();
      if (self._normalizeScopeMode(self.scopeMode) === 'page') {
        var pageScopedCtx = self._getScopedContext();
        if (pageScopedCtx && pageScopedCtx.mode === 'page') {
          self._updateMeta(pageScopedCtx);
          self.refresh({ force: true });
          return;
        }
      }
      // Bricks can briefly drop to a "page" selection while re-rendering controls during apply.
      // Ignore that transient event to avoid jumping the CSS panel to page mode mid-edit.
      var nowTs = Date.now ? Date.now() : +new Date();
      var shouldDelayPageSelection = false;
      var selfScope = self._normalizeScopeMode(self.scopeMode);
      if (selfScope === 'self' && ctx && ctx.mode === 'page' && String(self._lastRenderedContextKey || '') !== 'page') {
        if (self._applying) return;
        if (self._ignorePageSelectionUntil && nowTs < self._ignorePageSelectionUntil) return;
        var panelRoot = self.panel && self.panel.root;
        var activeEl = document.activeElement;
        var panelFocused = !!(panelRoot && panelRoot.contains && activeEl && panelRoot.contains(activeEl));
        var quietMs = Math.max(300, Number((self.liveSync && self.liveSync.debounceMs) || 180) + 260);
        var hasRecentEdit = !!self._lastEditAt && (nowTs - self._lastEditAt) < quietMs;
        if (self._dirty || panelFocused || hasRecentEdit) return;
        shouldDelayPageSelection = true;
      }
      if (shouldDelayPageSelection) {
        self._clearPendingPageSelectionTimer();
        self._pendingPageSelectionTimer.schedule(function () {
          var liveCtx = self._getScopedContext();
          var selectedId = self.api && typeof self.api.getSelectedElementId === 'function'
            ? String(self.api.getSelectedElementId() || '')
            : '';
          if (!(liveCtx && liveCtx.mode === 'page')) return;
          if (selectedId && self._normalizeScopeMode(self.scopeMode) === 'self') return;
          if (self._autoApplyDebounced && typeof self._autoApplyDebounced.cancel === 'function') {
            self._autoApplyDebounced.cancel();
          }
          // W23: Re-check dirty flag — an edit may have arrived during the 220ms debounce window.
          // If dirty changed, skip clearing and let the auto-apply handle it instead.
          if (self._dirty) return;
          self._dirty = false;
          self._dirtySelectionId = '';
          self._dirtyContextKey = '';
          self._dirtyViewMode = '';
          self._lastAutoStatus = '';
          self._statusCache = {};
          self._lastEditSelectionId = '';
          self._lastEditContextMode = '';
          self._lastEditContextKey = '';
          self._updateMeta(liveCtx);
          self.refresh({ force: true });
        }, 220);
        return;
      }
      self._clearPendingPageSelectionTimer();
      if (self._autoApplyDebounced && typeof self._autoApplyDebounced.cancel === 'function') {
        self._autoApplyDebounced.cancel();
      }
      self._dirty = false;
      self._dirtySelectionId = '';
      self._dirtyContextKey = '';
      self._dirtyViewMode = '';
      self._lastAutoStatus = '';
      self._statusCache = {};
      self._lastEditSelectionId = '';
      self._lastEditContextMode = '';
      self._lastEditContextKey = '';
      self._updateMeta(self._getScopedContext());
      self.refresh({ force: true });
    }));

    if (this.panel && typeof this.panel.onScopeModeChange === 'function') {
      this.panel.onScopeModeChange(function (mode) {
        self.setScopeMode(mode);
      });
    }

    if (this.panel && typeof this.panel.onCssLensModeChange === 'function') {
      this.panel.onCssLensModeChange(function (mode) {
        self.setCssLensMode(mode);
      });
    }

    if (this.panel && typeof this.panel.onCssApply === 'function') {
      this.panel.onCssApply(function () {
        self.applyFromEditor();
      });
    }

    if (this.panel && typeof this.panel.onCssPropertyFilterChange === 'function') {
      this.panel.onCssPropertyFilterChange(function (filter) {
        // Manual Class/ID toggle from panel buttons — clear pill override
        // so the snapshot builder falls back to Bricks API active class.
        self._activeClassTargetOverride = null;
        self.setPropertyFilter(filter);
      });
    }

    if (this.panel && typeof this.panel.onCssContextTargetSelect === 'function') {
      this.panel.onCssContextTargetSelect(function (target) {
        self.selectContextTarget(target);
      });
    }

    if (this.panel && typeof this.panel.onCssClassAdd === 'function') {
      this.panel.onCssClassAdd(function (rawValue) {
        self.addClassFromPanel(rawValue);
      });
    }

    if (typeof this.editor.onChange === 'function') {
      this.editor.onChange(function () {
        if (self.readOnly) {
          self._setPanelStatus('CSS panel is read-only in Phase 1.5 (' + self._modeLabel(self.viewMode) + ' view)', { channel: 'edit' });
          self._syncApplyButtonState(self._getScopedContext());
          return;
        }
        var ctx = self._getScopedContext();
        var ctxKey = self._contextKey(ctx);
        var samePendingEdit = !!(
          self._dirty &&
          self._dirtyViewMode === self.viewMode &&
          ctxKey &&
          self._dirtyContextKey === ctxKey
        );
        self._editSeq++;
        self._lastEditAt = Date.now ? Date.now() : +new Date();
        self._dirty = true;
        self._dirtySelectionId = ctx && ctx.mode === 'element' ? String(ctx.id || '') : '';
        self._dirtyContextKey = ctxKey;
        self._lastEditSelectionId = self._dirtySelectionId;
        self._lastEditContextMode = ctx && ctx.mode ? String(ctx.mode) : '';
        self._lastEditContextKey = self._dirtyContextKey;
        self._dirtyViewMode = self.viewMode;
        self._lastAutoStatus = '';
        self._syncApplyButtonState(ctx);
        if (self._canAutoApply(ctx)) {
          self._queueAutoApply();
          if (!samePendingEdit) {
            if (ctx && ctx.mode === 'page') {
              self._setPanelStatus('CSS edited · Live sync queued (' + self.liveSync.debounceMs + 'ms) · Sync pageCustomCss', { channel: 'edit' });
            } else {
              self._setPanelStatus('CSS edited · Live sync queued (' + self.liveSync.debounceMs + 'ms) · Sync _cssCustom + mappedSettingsCss', { channel: 'edit' });
            }
          }
          return;
        }
        if (samePendingEdit) return;
        if (!self._isEditableCssMode(self.viewMode)) {
          if (self._isAuthorLayer()) {
            self._setPanelStatus('CSS edited (unsaved) · L1 Author read layer · switch to L2 for live sync', { channel: 'edit' });
          } else {
            self._setPanelStatus('CSS edited (unsaved) · Switch to Write view to enable live sync on editable CSS blocks', { channel: 'edit' });
          }
        } else if (!ctx) {
          self._setPanelStatus('CSS edited (unsaved) · Bricks builder context not ready', { channel: 'edit' });
        } else if (ctx.mode === 'page') {
          self._setPanelStatus('CSS edited (unsaved) · Page mode write target = pageCustomCss', { channel: 'edit' });
        } else if (ctx.mode === 'element' && String(ctx.scope || 'self') === 'children') {
          self._setPanelStatus('CSS edited (unsaved) · Children scope write is unavailable in CM6GPT Lite', { channel: 'edit' });
        } else if (ctx.mode !== 'element') {
          self._setPanelStatus('CSS edited (unsaved) · Select a Bricks element to enable live sync', { channel: 'edit' });
        } else {
          self._setPanelStatus('CSS edited (unsaved) · Element write target = _cssCustom + mapped settings', { channel: 'edit' });
        }
      });
    }

    if (typeof this.editor.onHover === 'function') {
      this.editor.onHover(function (payload) {
        self._handleEditorHoverPreview(payload);
      });
    }

    try {
      this._updateMeta(this._getScopedContext());
    } catch (metaErr) {
      this._setPanelStatus('CSS meta init warning · ' + (metaErr && metaErr.message ? metaErr.message : String(metaErr)), { channel: 'init' });
    }
    try {
      this.refresh();
    } catch (refreshErr) {
      this._setPanelStatus('CSS snapshot init warning · ' + (refreshErr && refreshErr.message ? refreshErr.message : String(refreshErr)), { channel: 'init' });
    }
  };

  CSSBridge.prototype.setViewMode = function (mode) {
    var next = this._normalizeMode(mode);
    if (next === this.viewMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.viewMode = next;
    this._updateMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  CSSBridge.prototype._normalizeMode = function (mode) {
    void mode;
    return 'canonical';
  };

  CSSBridge.prototype._normalizeScopeMode = function (mode) {
    var next = getBridgeScopeContext().normalizeScopeMode(mode);
    return next === 'page' ? 'page' : 'self';
  };

  CSSBridge.prototype._normalizeLayerMode = function (mode) {
    void mode;
    return 'l2';
  };

  CSSBridge.prototype._layerModeLabel = function (mode, human) {
    return getBridgeScopeContext().layerModeLabel(this, mode, human);
  };

  CSSBridge.prototype._isAuthorLayer = function () {
    return getBridgeScopeContext().isAuthorLayer(this);
  };

  CSSBridge.prototype._normalizeCssLensMode = function (mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === 'minimal' || mode === 'edit' || mode === 'plain') return 'minimal';
    if (mode === 'global' || mode === 'all' || mode === 'full') return 'global';
    return 'minimal';
  };

  CSSBridge.prototype._cssLensModeLabel = function (mode, human) {
    mode = this._normalizeCssLensMode(mode);
    if (mode === 'minimal') return human ? 'Page CSS' : 'minimal';
    if (mode === 'global') return human ? 'Global CSS' : 'global';
    return getBridgeAnalysisLens().modeLabel(mode, human);
  };

  CSSBridge.prototype._getScopedContext = function () {
    if (this.panel && typeof this.panel.getScopeMode === 'function') {
      var liveScopeMode = this._normalizeScopeMode(this.panel.getScopeMode());
      if (liveScopeMode !== this.scopeMode) this.scopeMode = liveScopeMode;
    }
    return getBridgeScopeContext().getScopedContext(this);
  };

  CSSBridge.prototype._normalizeContextIdToken = function (value) {
    if (value == null) return '';
    var type = typeof value;
    if (type !== 'string' && type !== 'boolean' && !(type === 'number' && Number.isFinite(value))) {
      return '';
    }
    var text = String(value).trim();
    return text && !/\s/.test(text) ? text : '';
  };

  CSSBridge.prototype._getChildrenScopeElementToken = function (el) {
    if (!el || typeof el !== 'object') return '';
    if (!this._childScopeElementTokens) return '';
    var token = this._childScopeElementTokens.get(el);
    if (token) return token;
    this._childScopeElementTokenSeq += 1;
    token = 'anon' + String(this._childScopeElementTokenSeq);
    this._childScopeElementTokens.set(el, token);
    return token;
  };

  CSSBridge.prototype._collectChildrenScopeEntries = function (ctx) {
    var list = Array.isArray(ctx && ctx.elements) ? ctx.elements : [];
    var entries = [];
    var denseIndex = 0;
    for (var i = 0; i < list.length; i++) {
      var childEl = list[i];
      if (!childEl) continue;
      denseIndex++;
      var intrinsicId = this._resolveElementIdFromDom(childEl, '');
      entries.push({
        element: childEl,
        ordinal: denseIndex,
        intrinsicId: intrinsicId,
        childId: intrinsicId || String(denseIndex)
      });
    }
    return entries;
  };

  CSSBridge.prototype._getChildrenScopeDuplicateChildIds = function (entries) {
    entries = Array.isArray(entries) ? entries : [];
    var seen = {};
    var duplicates = [];
    for (var i = 0; i < entries.length; i++) {
      var childId = String(entries[i] && entries[i].childId || '');
      if (!childId) continue;
      if (hasOwn(seen, childId)) {
        if (!hasOwn(seen, 'dup:' + childId)) {
          seen['dup:' + childId] = true;
          duplicates.push(childId);
        }
        continue;
      }
      seen[childId] = true;
    }
    return duplicates;
  };

  CSSBridge.prototype._getChildrenScopeDuplicateChildIdsMessage = function (entries) {
    var duplicates = this._getChildrenScopeDuplicateChildIds(entries);
    if (!duplicates.length) return '';
    return 'duplicate child ids in current context (' + duplicates.join(', ') + ')';
  };

  CSSBridge.prototype._getChildrenScopeIdentitySignature = function (ctx) {
    if (!ctx || ctx.mode !== 'element' || this._normalizeScopeMode(ctx.scope) !== 'children') return '';
    var parentId = this._resolveElementIdFromDom(ctx.element, ctx.id);
    if (!parentId) return '';
    var entries = this._collectChildrenScopeEntries(ctx);
    if (!entries.length) return 'children:' + parentId;
    var parts = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var token = entry.intrinsicId || this._getChildrenScopeElementToken(entry.element);
      if (!token) return '';
      parts.push(token);
    }
    return 'children:' + parentId + ':' + parts.join(',');
  };

  CSSBridge.prototype._contextKey = function (ctx) {
    if (!ctx) return 'none';
    if (ctx.mode === 'page') return 'page';
    if (ctx.mode !== 'element') return String(ctx.mode || 'unknown');
    var scope = this._normalizeScopeMode(ctx.scope);
    if (scope === 'parent') {
      var parentScopeId = this._normalizeContextIdToken(ctx.id);
      return parentScopeId ? ('parent:' + parentScopeId) : '';
    }
    if (scope === 'children') {
      var parentId = this._resolveElementIdFromDom(ctx.element, ctx.id);
      var childIds = [];
      var seenChildIds = {};
      var entries = this._collectChildrenScopeEntries(ctx);
      for (var i = 0; i < entries.length; i++) {
        var cid = entries[i].childId;
        if (!cid || seenChildIds[cid]) continue;
        seenChildIds[cid] = true;
        childIds.push(cid);
      }
      if (!parentId) return '';
      return childIds.length
        ? ('children:' + parentId + ':' + childIds.join(','))
        : ('children:' + parentId);
    }
    var elementId = this._normalizeContextIdToken(ctx.id);
    return elementId ? ('element:' + elementId) : '';
  };

  CSSBridge.prototype._clearPendingPageSelectionTimer = function () {
    if (!this._pendingPageSelectionTimer || typeof this._pendingPageSelectionTimer.clear !== 'function') return false;
    return this._pendingPageSelectionTimer.clear();
  };

  CSSBridge.prototype._clearPendingTypingRefreshTimer = function () {
    if (this._pendingTypingRefreshTimer && typeof this._pendingTypingRefreshTimer.clear === 'function') {
      this._pendingTypingRefreshTimer.clear();
    }
    this._pendingTypingRefreshKey = '';
  };

  CSSBridge.prototype._cancelPendingAutoApply = function () {
    if (this._autoApplyDebounced && typeof this._autoApplyDebounced.cancel === 'function') {
      this._autoApplyDebounced.cancel();
    }
  };

  CSSBridge.prototype._hasRecentLocalEdit = function (quietMs) {
    var nowTs = Date.now ? Date.now() : +new Date();
    var windowMs = Math.max(0, Number(quietMs || 0));
    if (!windowMs) {
      windowMs = Math.max(300, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 260);
    }
    return !!this._lastEditAt && (nowTs - this._lastEditAt) < windowMs;
  };

  CSSBridge.prototype._isCssEditorLikelyFocused = function () {
    var doc = (typeof document !== 'undefined') ? document : null;
    if (!doc) return false;
    var activeEl = doc.activeElement;
    if (!activeEl) return false;
    var panelRoot = this.panel && this.panel.root;
    if (!panelRoot || !panelRoot.contains || !panelRoot.contains(activeEl)) return false;
    var cssMount = this.panel && this.panel.cssMount;
    if (cssMount && cssMount.contains) {
      return !!cssMount.contains(activeEl);
    }
    return true;
  };

  CSSBridge.prototype._shouldPreserveEditorViewOnRefresh = function (ctx, ctxKey) {
    if (!this._isCssEditorLikelyFocused()) return false;
    ctxKey = ctxKey || this._contextKey(ctx);
    if (ctxKey && ctxKey === String(this._lastRenderedContextKey || '')) return true;

    if (this._dirty) {
      if (ctx && ctx.mode === 'element' && String(ctx.id || '') === String(this._dirtySelectionId || '')) return true;
      if (ctx && ctx.mode === 'page' && String(this._dirtyContextKey || '') === 'page') return true;
    }

    return this._hasRecentLocalEdit(Math.max(320, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 260));
  };

  CSSBridge.prototype._scheduleDeferredRefreshWhileTyping = function (ctx) {
    var self = this;
    var ctxKey = String(this._contextKey(ctx) || '');
    var quietMs = Math.max(300, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 260);
    var nowTs = Date.now ? Date.now() : +new Date();
    var waitMs = 16;
    if (this._lastEditAt) {
      waitMs = Math.max(16, quietMs - (nowTs - this._lastEditAt) + 16);
    }
    this._clearPendingTypingRefreshTimer();
    this._pendingTypingRefreshKey = ctxKey;
    this._pendingTypingRefreshTimer.schedule(function () {
      self._pendingTypingRefreshKey = '';
      if (self._dirty && ctxKey && String(self._dirtyContextKey || '') === ctxKey) return;
      try { self.refresh(); } catch (e) { _warn('_scheduleDeferredRefreshWhileTyping', e); }
    }, waitMs);
  };

  CSSBridge.prototype._shouldSuppressTypingAutoFeedback = function () {
    if (!this._isCssEditorLikelyFocused()) return false;
    return this._hasRecentLocalEdit(Math.max(420, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 320));
  };

  CSSBridge.prototype._clearDirtyEditState = function () {
    this._dirty = false;
    this._dirtySelectionId = '';
    this._dirtyContextKey = '';
    this._dirtyViewMode = '';
    this._lastAutoStatus = '';
    this._lastEditSelectionId = '';
    this._lastEditContextMode = '';
    this._lastEditContextKey = '';
    this._statusCache = {};
  };

  CSSBridge.prototype._clearPageRenderOverride = function () {
    this._pageRenderOverride = null;
    this._elementRenderOverride = null;
  };

  CSSBridge.prototype._invalidatePendingEditState = function () {
    this._clearPendingPageSelectionTimer();
    this._clearPendingTypingRefreshTimer();
    this._cancelPendingAutoApply();
    this._clearDirtyEditState();
    this._clearPageRenderOverride();
  };

  CSSBridge.prototype.setScopeMode = function (mode) {
    var next = this._normalizeScopeMode(mode);
    if (next === this.scopeMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.scopeMode = next;
    if (this.editor && typeof this.editor.setReadOnly === 'function') {
      this.editor.setReadOnly(next === 'page');
    }
    this._updateMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  CSSBridge.prototype.setLayerMode = function (mode) {
    var next = this._normalizeLayerMode(mode);
    if (next === this.layerMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.layerMode = next;
    this._updateMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  CSSBridge.prototype.setCssLensMode = function (mode) {
    var next = this._normalizeCssLensMode(mode);
    if (next === this.cssLensMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.cssLensMode = next;
    this._updateMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  CSSBridge.prototype._extractHoverSelectorFromLine = function (lineText) {
    var line = String(lineText == null ? '' : lineText);
    if (!line) return '';
    var open = line.indexOf('{');
    if (open < 0) return '';
    var selector = line.slice(0, open).trim();
    if (!selector) return '';
    if (selector.charAt(0) === '@') return '';
    if (/^\/\*/.test(selector)) return '';
    if (/^\*/.test(selector)) return '';
    if (selector.length > 320) return '';
    return selector;
  };

  CSSBridge.prototype._clearHoverPreview = function () {
    this._hoverPreviewSelector = '';
    if (!this.api) return;
    if (typeof this.api.clearRecipeGhostPreview === 'function') {
      try { this.api.clearRecipeGhostPreview(); } catch (e0) { _warn('_clearHoverPreview', e0); }
    }
    if (typeof this.api.clearCssHoverPreview !== 'function') return;
    try { this.api.clearCssHoverPreview(); } catch (e1) { _warn('_clearHoverPreview', e1); }
  };

  CSSBridge.prototype._handleEditorHoverPreview = function (payload) {
    if (!this.api || typeof this.api.setCssHoverPreviewSelector !== 'function') return;
    if (!payload || payload.kind === 'leave') {
      this._clearHoverPreview();
      return;
    }

    var selector = this._extractHoverSelectorFromLine(payload.lineText || '');
    if (!selector) {
      this._clearHoverPreview();
      return;
    }

    if (selector === this._hoverPreviewSelector) return;

    var ctx = this._getScopedContext();
    if (!ctx || !ctx.element) {
      this._clearHoverPreview();
      return;
    }

    this._hoverPreviewSelector = selector;
    try {
      var out = this.api.setCssHoverPreviewSelector(selector, { maxMatches: 64 });
      if (!out || !out.ok) this._hoverPreviewSelector = '';
    } catch (e) { _warn('_handleEditorHoverPreview', e); 
      this._hoverPreviewSelector = '';
      this._clearHoverPreview();
    }
  };

  CSSBridge.prototype._getCssLensState = function (ctx, analysis) {
    var mode = this._normalizeCssLensMode(this.cssLensMode);
    if (mode === 'all' || mode === 'minimal' || mode === 'global') {
      return { active: false, mode: mode, hasMatch: true };
    }
    if (!ctx || ctx.mode !== 'element') {
      return { active: true, mode: mode, hasMatch: false };
    }
    var resolvedAnalysis = analysis || (this.api && typeof this.api.getElementAnalysisById === 'function'
      ? this.api.getElementAnalysisById(ctx.id, ctx.element)
      : null);
    return {
      active: true,
      mode: mode,
      hasMatch: this._analysisLensHasMatch(resolvedAnalysis, mode)
    };
  };

  CSSBridge.prototype._modeLabel = function (mode) {
    void mode;
    return 'Write';
  };

  CSSBridge.prototype._normalizeGateLevel = function (level) {
    return getBridgeGateUx().normalizeGateLevel(level);
  };

  CSSBridge.prototype._normalizeGuardReasonText = function (reason) {
    return getBridgeGateUx().normalizeGuardReasonText(reason);
  };

  CSSBridge.prototype._normalizeGateForUx = function (gate) {
    return getBridgeGateUx().normalizeGateForUx(gate);
  };

  CSSBridge.prototype._analysisLensReadGroups = function (analysis, lensMode) {
    lensMode = this._normalizeCssLensMode(lensMode || this.cssLensMode);
    return getBridgeAnalysisLens().readGroups(analysis, lensMode);
  };

  CSSBridge.prototype._analysisLensReadSummary = function (analysis, opts) {
    opts = opts || {};
    var lensMode = hasOwn(opts, 'lensMode') ? opts.lensMode : this.cssLensMode;
    return getBridgeAnalysisLens().readSummary(analysis, {
      lensMode: this._normalizeCssLensMode(lensMode),
      separator: opts.separator
    });
  };

  CSSBridge.prototype._analysisLensHasMatch = function (analysis, lensMode) {
    return getBridgeAnalysisLens().hasMatch(analysis, this._normalizeCssLensMode(lensMode || this.cssLensMode));
  };

  CSSBridge.prototype._isEditableCssMode = function (mode) {
    mode = this._normalizeMode(mode);
    if (this._isAuthorLayer()) return false;
    return mode === 'canonical';
  };

  CSSBridge.prototype._normalizePropertyFilter = function (filter) {
    var out = {
      class: !!(filter && filter.class),
      id: !!(filter && filter.id)
    };
    if (out.class && out.id) {
      console.debug('CM6GPT: _normalizePropertyFilter — class+id both requested; id overridden to false (class takes precedence)');
      out.id = false;
    }
    if (!out.class && !out.id) out.class = true;
    return out;
  };

  CSSBridge.prototype._isClassOnlyFilter = function (filter) {
    filter = this._normalizePropertyFilter(filter || this.propertyFilter);
    return !!filter.class && !filter.id;
  };

  CSSBridge.prototype._describePrimaryGlobalClassTargetFromLifecycle = function (lifecycle) {
    var target = {
      ref: '',
      id: '',
      name: '',
      label: '',
      kind: '',
      count: 0,
      extraCount: 0
    };
    if (!lifecycle || !lifecycle.ok) {
      return target;
    }
    var globals = Array.isArray(lifecycle.globalClasses) ? lifecycle.globalClasses : [];
    var locals = Array.isArray(lifecycle.localClasses) ? lifecycle.localClasses : [];
    // Use explicit override from selectContextTarget if available (bypasses Vue reactivity lag)
    var override = this._activeClassTargetOverride;
    var activeInfo = null;
    if (override && override.kind) {
      activeInfo = { isClassActive: true, id: String(override.id || override.ref || '').trim(), name: String(override.name || '').trim() };
    } else if (this.api) {
      if (typeof this.api.getActiveClassUiInfo === 'function') {
        try { activeInfo = this.api.getActiveClassUiInfo(); } catch (e0) { _warn('_describePrimaryGlobalClassTargetFromLifecycle', e0);  activeInfo = null; }
      } else if (typeof this.api._readActiveClassUiInfo === 'function') {
        try { activeInfo = this.api._readActiveClassUiInfo(); } catch (e1) { _warn('_describePrimaryGlobalClassTargetFromLifecycle', e1);  activeInfo = null; }
      }
    }

    var activeId = activeInfo && activeInfo.isClassActive ? String(activeInfo.id || '').trim() : '';
    var activeName = activeInfo && activeInfo.isClassActive ? String(activeInfo.name || '').trim() : '';
    var i;

    for (i = 0; i < globals.length; i++) {
      var activeGlobal = globals[i] || {};
      var activeGlobalId = String(activeGlobal.id || '').trim();
      var activeGlobalName = String(activeGlobal.name || '').trim();
      if (
        (activeId && activeGlobalId && activeId === activeGlobalId) ||
        (activeName && activeGlobalName && activeName === activeGlobalName)
      ) {
        target.count = globals.length;
        target.extraCount = Math.max(0, globals.length - 1);
        target.kind = 'global';
        target.id = activeGlobalId;
        target.name = activeGlobalName;
        target.ref = String(activeGlobalId || activeGlobalName || '').trim();
        target.label = activeGlobalName ? ('.' + activeGlobalName) : (activeGlobalId ? ('[' + activeGlobalId + ']') : '');
        return target;
      }
    }

    for (i = 0; i < locals.length; i++) {
      var activeLocalName = String(locals[i] || '').trim();
      if (!activeLocalName) continue;
      if (activeName && activeName === activeLocalName) {
        target.count = locals.length;
        target.extraCount = Math.max(0, locals.length - 1);
        target.kind = 'local';
        target.name = activeLocalName;
        target.ref = activeLocalName;
        target.label = '.' + activeLocalName;
        return target;
      }
    }

    if (globals.length) {
      var first = globals[0] || {};
      target.count = globals.length;
      target.extraCount = Math.max(0, globals.length - 1);
      target.kind = 'global';
      target.id = String(first.id || '').trim();
      target.name = String(first.name || '').trim();
      target.ref = String(first.id || first.name || '').trim();
      if (target.name) target.label = '.' + target.name;
      else if (target.id) target.label = '[' + target.id + ']';
      return target;
    }

    if (locals.length) {
      var firstLocal = String(locals[0] || '').trim();
      if (firstLocal) {
        target.count = locals.length;
        target.extraCount = Math.max(0, locals.length - 1);
        target.kind = 'local';
        target.name = firstLocal;
        target.ref = firstLocal;
        target.label = '.' + firstLocal;
      }
      return target;
    }

    return target;
  };

  CSSBridge.prototype._getPrimaryGlobalClassTarget = function (ctx) {
    if (!ctx || ctx.mode !== 'element' || !ctx.element) {
      return this._describePrimaryGlobalClassTargetFromLifecycle(null);
    }
    if (!this.api || typeof this.api.getElementClassLifecycleByDom !== 'function') {
      return this._describePrimaryGlobalClassTargetFromLifecycle(null);
    }
    return this._describePrimaryGlobalClassTargetFromLifecycle(this.api.getElementClassLifecycleByDom(ctx.element));
  };

  CSSBridge.prototype._formatPrimaryGlobalClassTargetSummary = function (target) {
    target = target || {};
    return target.label ? ('class target ' + target.label) : 'class target';
  };

  CSSBridge.prototype._resolvePrimaryGlobalClassRefFromContext = function (ctx) {
    return this._getPrimaryGlobalClassTarget(ctx).ref;
  };

  CSSBridge.prototype._propertyFilterKey = function (filter) {
    filter = this._normalizePropertyFilter(filter || this.propertyFilter);
    return [
      filter.class ? 'class' : '',
      filter.id ? 'id' : ''
    ].join('|');
  };

  CSSBridge.prototype._buildPaneContextMeta = function (ctx) {
    ctx = ctx || this._getScopedContext();
    if (!ctx) return '';
    if (ctx.mode !== 'element') {
      return {
        mode: 'page',
        summary: 'Page CSS'
      };
    }

    var filter = this._normalizePropertyFilter(this.propertyFilter);
    var lifecycle = this.api && typeof this.api.getElementClassLifecycleByDom === 'function'
      ? this.api.getElementClassLifecycleByDom(ctx.element)
      : null;
    var activeClassTarget = filter.class ? this._getPrimaryGlobalClassTarget(ctx) : null;
    var targets = [];
    var seen = {};

    function pushTarget(label, kind, title, active, meta) {
      label = String(label || '').trim();
      if (!label || seen[label]) return;
      seen[label] = true;
      meta = meta || {};
      targets.push({
        label: label,
        kind: kind,
        title: title,
        active: !!active,
        ref: String(meta.ref || '').trim(),
        name: String(meta.name || '').trim(),
        id: String(meta.id || '').trim()
      });
    }

    // Always show class AND id chips regardless of filter — filter only affects which is "active"
    if (lifecycle && lifecycle.ok) {
      var globals = Array.isArray(lifecycle.globalClasses) ? lifecycle.globalClasses : [];
      for (var i = 0; i < globals.length; i++) {
        var globalEntry = globals[i] || {};
        var globalName = String(globalEntry.name || '').trim();
        var globalId = String(globalEntry.id || '').trim();
        var globalLabel = globalName ? ('.' + globalName) : (globalId ? ('.' + globalId) : '');
        var globalTitle = i === 0
          ? 'Global class CSS target'
          : 'Additional global class';
        pushTarget(globalLabel, 'global', globalTitle, !!(
          filter.class &&
          activeClassTarget &&
          activeClassTarget.kind === 'global' &&
          (
            (activeClassTarget.id && globalId && activeClassTarget.id === globalId) ||
            (activeClassTarget.name && globalName && activeClassTarget.name === globalName)
          )
        ), {
          ref: globalId || globalName,
          name: globalName,
          id: globalId
        });
      }

      var locals = Array.isArray(lifecycle.localClasses) ? lifecycle.localClasses : [];
      for (var l = 0; l < locals.length; l++) {
        var localName = String(locals[l] || '').trim();
        if (!localName) continue;
        pushTarget('.' + localName, 'local', 'Element class', !!(
          filter.class &&
          activeClassTarget &&
          activeClassTarget.kind === 'local' &&
          activeClassTarget.name === localName
        ), {
          ref: localName,
          name: localName,
          id: ''
        });
      }
    }

    if (ctx.id) {
      pushTarget('#' + String(ctx.id || '').trim(), 'id', 'Element ID selector', !!filter.id, {
        ref: String(ctx.id || '').trim(),
        name: '',
        id: String(ctx.id || '').trim()
      });
    }

    return {
      mode: 'element',
      id: String(ctx.id || ''),
      tag: String(ctx.tag || '').trim().toLowerCase(),
      scope: String(ctx.scope || ''),
      targets: targets,
      empty: filter.class
        ? 'No classes'
        : (filter.id ? 'No ID target' : 'No CSS target')
    };
  };

  CSSBridge.prototype.setPropertyFilter = function (filter) {
    var next = this._normalizePropertyFilter(filter);
    if (
      next.class === this.propertyFilter.class &&
      next.id === this.propertyFilter.id
    ) return;
    this.propertyFilter = next;
    this._clearPageRenderOverride();
    this.refresh({ force: true });
  };

  CSSBridge.prototype.selectContextTarget = function (target) {
    target = target || {};
    var kind = String(target.kind || '').trim();
    if (kind === 'id') {
      this._invalidatePendingEditState();
      // Clear class override — we are leaving class context
      this._activeClassTargetOverride = null;
      // Deactivate class in Bricks native panel so it doesn't show a stale active class
      if (this.api && typeof this.api._clearActiveClassUi === 'function') {
        try { this.api._clearActiveClassUi(); } catch (e) { _warn('selectContextTarget', e); }
      }
      this.setPropertyFilter({ class: false, id: true });
      // Rebuild pills so ID pill shows as active and class pills deactivate
      this._updateMeta(this._getScopedContext());
      this._setPanelStatus('CSS target switched: ' + String(target.label || '#id').trim(), { channel: 'target', dedupeMs: 0 });
      return true;
    }
    if (kind !== 'global' && kind !== 'local') return false;
    if (!this.api) return false;

    var ref = String(target.ref || '').trim();
    var name = String(target.name || '').trim();
    var label = String(target.label || name || ref || '').trim();

    if (typeof this.api.activateClassUiByRef === 'function') {
      try {
        this.api.activateClassUiByRef(ref || name, { deferUiRefresh: false });
      } catch (e0) { _warn('selectContextTarget', e0); }
    } else if (typeof this.api.activateClassUiByName === 'function') {
      try {
        this.api.activateClassUiByName(name || ref, { deferUiRefresh: false });
      } catch (e1) { _warn('selectContextTarget', e1); }
    } else {
      return false;
    }

    this._invalidatePendingEditState();
    // Set an explicit override so the snapshot builder uses the clicked class
    // instead of relying on getActiveClassUiInfo() which may lag behind Vue reactivity.
    this._activeClassTargetOverride = {
      kind: kind,
      ref: ref,
      name: name,
      id: String(target.id || '').trim(),
      label: label
    };
    if (!this.propertyFilter.class || this.propertyFilter.id) {
      this.setPropertyFilter({ class: true, id: false });
      // setPropertyFilter's internal refresh doesn't rebuild pills —
      // force pill rebuild now so the clicked class shows as active.
      this._updateMeta(this._getScopedContext());
    } else {
      this._clearPageRenderOverride();
      this._updateMeta(this._getScopedContext());
      this.refresh({ force: true });
    }
    // NOTE: Do NOT clear _activeClassTargetOverride here.
    // The override must survive debounced refreshes triggered by Bricks Vue DOM mutations
    // (dom:changed fires ~120ms after activateClassUiByRef).  It is cleared on:
    //   - next selectContextTarget() call (overwritten)
    //   - selection:changed event (element switch)
    //   - ID pill click (explicit clear below)
    this._setPanelStatus('CSS target switched: ' + (label || 'class target'), { channel: 'target', dedupeMs: 0 });
    return true;
  };

  CSSBridge.prototype._updateMeta = function (ctx) {
    ctx = ctx || this._getScopedContext();
    if (!this.panel || !this.panel.setPaneMeta) return;
    if (!ctx) {
      this.panel.setPaneMeta('css', '');
      this._syncCssInfoBadge(null);
      this._syncApplyButtonState(null);
      this._syncClassAddButtonState(null);
      return;
    }
    this.panel.setPaneMeta('css', this._buildPaneContextMeta(ctx));
    this._syncCssInfoBadge(ctx);
    this._syncApplyButtonState(ctx);
    this._syncClassAddButtonState(ctx);
  };

  CSSBridge.prototype._getWriteSyncCapabilityChecks = function (ctx) {
    ctx = ctx || this._getScopedContext();
    var analysis = (ctx && ctx.mode === 'element' && this.api && typeof this.api.getElementAnalysisById === 'function')
      ? this.api.getElementAnalysisById(ctx.id, ctx.element)
      : null;
    var gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);

    return [
      {
        key: 'editorWritable',
        label: 'Editor writable',
        ready: !this.readOnly && !!(this.editor && typeof this.editor.getValue === 'function')
      },
      {
        key: 'contextApi',
        label: 'Context API',
        ready: !!(this.api && (
          typeof this.api.getScopedSelectionContext === 'function' ||
          typeof this.api.getSelectionContext === 'function'
        ))
      },
      {
        key: 'contextReady',
        label: 'Scoped context ready',
        ready: !!(ctx && (ctx.mode === 'page' || (ctx.mode === 'element' && ctx.element)))
      },
      {
        key: 'applyEntry',
        label: 'Apply entrypoint',
        ready: typeof this.applyFromEditor === 'function'
      },
      {
        key: 'elementCssWrite',
        label: 'Element CSS write helper',
        ready: !!(this.api && typeof this.api.updateElementCssStateByDom === 'function')
      },
      {
        key: 'mappedWrite',
        label: 'Mapped settings write helper',
        ready: !!(this.api && typeof this.api.updateElementMappedSettingsByDom === 'function')
      },
      {
        key: 'mappedRead',
        label: 'Mapped settings read helper',
        ready: !!(this.api && typeof this.api.getElementMappedSettingsCssByDom === 'function')
      },
      {
        key: 'pageCssWrite',
        label: 'Page CSS write helper',
        ready: !!(this.api && typeof this.api.updatePageCustomCss === 'function')
      },
      {
        key: 'globalClassWrite',
        label: 'Global class write helper',
        ready: !!(this.api && typeof this.api.updateGlobalClassCustomCss === 'function')
      },
      {
        key: 'gateCompatible',
        label: 'Gate compatible',
        ready: !gate || gate.level !== 'blocked'
      },
      {
        key: 'manualRefresh',
        label: 'Manual refresh hook',
        ready: this._hasManualRefreshSupport()
      },
      {
        key: 'mappedValidator',
        label: 'Mapped block validator',
        ready: typeof this._isEditableMappedSettingsCssReadyForAutoApply === 'function'
      },
      {
        key: 'liveSyncPipeline',
        label: 'Live sync pipeline',
        ready: !!(this.liveSync && this.liveSync.enabled && this._autoApplyDebounced)
      }
    ];
  };

  CSSBridge.prototype.getWriteSyncCapabilityReport = function (ctx) {
    var checks = this._getWriteSyncCapabilityChecks(ctx);
    var ready = 0;
    for (var i = 0; i < checks.length; i++) {
      if (checks[i] && checks[i].ready) ready++;
    }
    var total = checks.length;
    return {
      lane: 'css',
      title: 'Write/Sync 9+',
      threshold: 9,
      ready: ready,
      total: total,
      ok: ready >= 9,
      checks: checks
    };
  };

  CSSBridge.prototype._formatWriteSyncCapabilityBadge = function (report) {
    return getBridgeRuntimeUtils().formatWriteSyncCapabilityBadge(this, report);
  };

  CSSBridge.prototype._normalizeSnapshotText = function (value) {
    return getBridgeRuntimeUtils().normalizeSnapshotText(value);
  };

  CSSBridge.prototype._hashSnapshotText = function (value) {
    return getBridgeCanonicalReport().hashText(value);
  };

  CSSBridge.prototype.getCanonicalSnapshotReport = function (opts) {
    opts = opts || {};
    var canonicalReport = getBridgeCanonicalReport();
    var ctx = opts.ctx || this._getScopedContext();
    var ctxKey = this._contextKey(ctx);
    var editorRaw = this.editor && typeof this.editor.getValue === 'function'
      ? String(this.editor.getValue() || '')
      : '';
    var renderedRaw = String(this._lastCss || '');
    var editorNormalized = this._normalizeSnapshotText(editorRaw);
    var renderedNormalized = this._normalizeSnapshotText(renderedRaw);
    var contextState = canonicalReport.buildLaneContextState({
      ctx: ctx,
      ctxKey: ctxKey,
      dirty: this._dirty,
      applying: this._applying
    });
    var comparableSnapshotState = contextState.comparableSnapshotState;
    var filterKey = this._propertyFilterKey(this.propertyFilter);
    var hashSnapshot = this._hashSnapshotText.bind(this);
    return canonicalReport.buildEvaluatedLaneReport({
      lane: 'css',
      ctx: ctx,
      ctxKey: ctxKey,
      stateSpecs: [
        { key: 'dirty', type: 'boolean', value: this._dirty },
        { key: 'applying', type: 'boolean', value: this._applying },
        { key: 'viewMode', type: 'string', value: this.viewMode },
        { key: 'propertyFilterKey', type: 'string', value: filterKey },
        { key: 'lastRenderedContextKey', type: 'string', value: this._lastRenderedContextKey },
        { key: 'lastRenderedViewMode', type: 'string', value: this._lastRenderedViewMode },
        { key: 'lastRenderedPropertyFilterKey', type: 'string', value: this._lastRenderedPropertyFilterKey }
      ],
      snapshots: {
        editorRaw: editorRaw,
        editorNormalized: editorNormalized,
        renderedRaw: renderedRaw,
        renderedNormalized: renderedNormalized,
        hashFn: hashSnapshot
      },
      dirty: !!this._dirty,
      applying: !!this._applying,
      contextState: contextState,
      compareSpecs: [
        { key: 'editorVsRendered', enabled: comparableSnapshotState, left: editorNormalized, right: renderedNormalized }
      ],
      alignmentSpecs: [
        { key: 'contextAligned', reason: 'render-context-stale', strict: true, lastValue: this._lastRenderedContextKey || '', currentValue: ctxKey || '' },
        { key: 'viewAligned', reason: 'render-view-stale', strict: false, lastValue: this._lastRenderedViewMode, currentValue: this.viewMode },
        { key: 'filterAligned', reason: 'render-filter-stale', strict: false, lastValue: this._lastRenderedPropertyFilterKey, currentValue: filterKey }
      ],
      mismatchFlagSpecs: [
        { key: 'editorVsRenderedMismatch', value: comparableSnapshotState && editorNormalized !== renderedNormalized }
      ],
      mismatchSpecs: [
        { key: 'editorVsRenderedMismatch', reason: 'editor-vs-rendered-mismatch' }
      ]
    });
  };

  CSSBridge.prototype._syncCssInfoBadge = function (ctx) {
    if (!this.panel || typeof this.panel.setCssInfo !== 'function') return;
    ctx = ctx || this._getScopedContext() || {};
    var editableMode = this._isEditableCssMode(this.viewMode);
    var ctxKey = this._contextKey(ctx);
    var info = '';
    if (editableMode && this._lastCanonicalInfoText && this._lastCanonicalInfoContextKey === ctxKey) {
      info = this._lastCanonicalInfoText;
    } else if (ctx && ctx.mode === 'element') {
      var scopeLabel = (ctx.scope && ctx.scope !== 'self') ? (' (' + ctx.scope + ')') : '';
      info = 'Source: selected Bricks element #' + String(ctx.id || '?') + scopeLabel + '\nSwitch to Write for full context info.';
    } else {
      info = 'Page mode\nSwitch to Write for full context info.';
    }
    this.panel.setCssInfo(info, { active: editableMode });
  };

  CSSBridge.prototype._setCanonicalInfoCache = function (text, contextInfoKey) {
    this._lastCanonicalInfoText = String(text || '');
    this._lastCanonicalInfoContextKey = String(contextInfoKey || '');
  };

  CSSBridge.prototype._buildElementCanonicalInfoText = function (opts) {
    opts = opts || {};
    var el = opts.el || null;
    var id = String(opts.id || '');
    var selector = String(opts.selector || this._selectorFor(el, id));
    var analysis = opts.analysis || null;
    var model = opts.model || null;
    var propertyFilter = this._normalizePropertyFilter(opts.propertyFilter || this.propertyFilter);
    var includeClassBlocks = !!propertyFilter.class;
    var includeIdBlocks = !!propertyFilter.id;
    var domDataId = String(opts.domDataId || '');
    var domScriptId = String(opts.domScriptId || '');
    var domComponentId = String(opts.domComponentId || '');
    var domComponentInstanceId = String(opts.domComponentInstanceId || '');
    var settings = model && isObject(model.settings) ? model.settings : {};
    var lifecycle = opts.lifecycle || null;
    var nativePreview = opts.nativePreview || null;

    var info = [];
    var gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);
    var lensSummary = this._analysisLensReadSummary(analysis, { separator: ' · ' });
    info.push('Source: selected Bricks element #' + (id || '?') + ' · selector: ' + selector);
    info.push('Sync = editable blocks with full two-way Bricks sync.');
    info.push('Property filter: class=' + (includeClassBlocks ? 'on' : 'off') + ', id=' + (includeIdBlocks ? 'on' : 'off'));
    info.push('Write target: ' + (includeClassBlocks
      ? this._formatPrimaryGlobalClassTargetSummary(this._describePrimaryGlobalClassTargetFromLifecycle(lifecycle))
      : 'current element ID CSS'));
    info.push('Apply gate: gate:' + gate.level
      + ' · html-safe-subset=' + (gate.htmlApplySafeSubsetAllowed ? 'true' : 'false')
      + ' · html-structure=' + (gate.htmlApplyStructureAllowed ? 'true' : 'false'));
    if (gate.diagnostics && gate.diagnostics.summary) {
      info.push('Gate policy: ' + String(gate.diagnostics.summary));
    }
    if (gate.reasons && gate.reasons.length) {
      info.push('Gate reasons: ' + gate.reasons.slice(0, 4).join(' | '));
    }
    info.push('Lenses: ' + (lensSummary || 'none'));
    info.push('Runtime ids: id=' + (id || '(none)')
      + ' · data-id=' + (domDataId || '(none)')
      + ' · data-script-id=' + (domScriptId || '(none)'));
    if (domComponentId || domComponentInstanceId) {
      info.push('Component ids: data-component=' + (domComponentId || '(none)')
        + ' · data-component-instance=' + (domComponentInstanceId || '(none)'));
    }
    if (model) {
      info.push('Element: ' + String(settings.tag || model.name || (el && el.tagName ? String(el.tagName).toLowerCase() : '') || 'element')
        + ' · parent=' + String(hasOwn(model, 'parent') ? model.parent : '')
        + ' · children=' + String(Array.isArray(model.children) ? model.children.length : 0));
      info.push('Bricks identity: _cssId=' + this._fmtValue(settings._cssId || '')
        + ' · _cssClasses=' + this._fmtValue(settings._cssClasses || ''));
    } else {
      info.push('Bricks canonical model unavailable; using DOM-only fallback context.');
    }
    if (lifecycle && lifecycle.ok) {
      var globalList = Array.isArray(lifecycle.globalClasses) ? lifecycle.globalClasses : [];
      var localList = Array.isArray(lifecycle.localClasses) ? lifecycle.localClasses : [];
      var activeClassTarget = includeClassBlocks
        ? this._describePrimaryGlobalClassTargetFromLifecycle(lifecycle)
        : null;
      var globalSummary = globalList.map(function (g) {
        var name = g && g.name ? g.name : '';
        var gid = g && g.id ? g.id : '';
        if (name && gid) return name + ' [' + gid + ']';
        return name || gid;
      }).filter(Boolean);
      if (includeClassBlocks) {
        info.push('Class target: ' + this._formatPrimaryGlobalClassTargetSummary(activeClassTarget));
      }
      if (globalSummary.length) {
        info.push('Global classes on node: ' + globalSummary.join(', '));
      }
      if (localList.length) {
        info.push('Local classes on node: ' + localList.join(', '));
      }
    }
    if (nativePreview && nativePreview.reason) {
      info.push('Bricks native generated CSS preview unavailable: ' + nativePreview.reason);
    }
    return info.join('\n');
  };

  CSSBridge.prototype._buildPageCanonicalInfoText = function () {
    var state = this.api && typeof this.api.getVueState === 'function' ? this.api.getVueState() : null;
    var selection = this.api && typeof this.api.getSelectedElementId === 'function' ? this.api.getSelectedElementId() : '';
    var info = [];
    info.push('Page mode');
    info.push('selected id: ' + (selection || '(none)'));
    info.push('pageSettings.customCss is the active page write target in Write mode.');
    info.push('Page CSS lens = page-relevant/authored rules only. Global CSS lens = full iframe/head CSS context.');
    if (!state) {
      info.push('Vue/Bricks state not available from current hooks.');
      info.push('Fallback modes: Computed / Authored');
    } else {
      var topKeys = Object.keys(state);
      info.push('vueState top-level keys: ' + topKeys.length);
    }
    return info.join('\n');
  };

  CSSBridge.prototype._buildChildrenCanonicalInfoText = function (ctx) {
    var children = this._collectChildrenScopeEntries(ctx);
    var info = [
      'Source: children scope for #' + String((ctx && ctx.id) || '?'),
      'Children: ' + children.length,
      'Write mode applies child blocks by id markers.'
    ];
    var duplicateMessage = this._getChildrenScopeDuplicateChildIdsMessage(children);
    if (duplicateMessage) {
      info.push('Status: blocked by ' + duplicateMessage + '.');
    }
    return info.join('\n');
  };

  CSSBridge.prototype._refreshCanonicalInfoCache = function (ctx) {
    ctx = ctx || this._getScopedContext();
    if (!ctx) return;
    if (!this._isEditableCssMode(this.viewMode)) return;

    var key = this._contextKey(ctx);
    if (ctx.mode === 'page') {
      this._setCanonicalInfoCache(this._buildPageCanonicalInfoText(), key);
      return;
    }
    if (ctx.mode !== 'element') return;
    if (String(ctx.scope || 'self') === 'children') {
      this._setCanonicalInfoCache(this._buildChildrenCanonicalInfoText(ctx), key);
      return;
    }

    var el = ctx.element || null;
    var id = String(ctx.id || '');
    var selector = this._selectorFor(el, id);
    var domDataId = el && el.getAttribute ? String(el.getAttribute('data-id') || '') : '';
    var domScriptId = el && el.getAttribute ? String(el.getAttribute('data-script-id') || '') : '';
    var domComponentId = el && el.getAttribute ? String(el.getAttribute('data-component') || '') : '';
    var domComponentInstanceId = el && el.getAttribute ? String(el.getAttribute('data-component-instance') || '') : '';
    var analysis = this.api && typeof this.api.getElementAnalysisById === 'function'
      ? this.api.getElementAnalysisById(id, el)
      : null;
    var model = analysis && analysis.model ? analysis.model : null;
    var vueState = null;
    if (!model) {
      vueState = this.api && typeof this.api.getVueState === 'function' ? this.api.getVueState() : null;
      model = this._findElementModelById(vueState, id);
    }
    var lifecycle = this.api && typeof this.api.getElementClassLifecycleByDom === 'function'
      ? this.api.getElementClassLifecycleByDom(el)
      : null;
    var nativePreview = this.api && typeof this.api.getNativeGeneratedCssPreviewByDom === 'function'
      ? this.api.getNativeGeneratedCssPreviewByDom(el)
      : null;

    this._setCanonicalInfoCache(this._buildElementCanonicalInfoText({
      el: el,
      id: id,
      selector: selector,
      analysis: analysis,
      model: model,
      propertyFilter: this.propertyFilter,
      domDataId: domDataId,
      domScriptId: domScriptId,
      domComponentId: domComponentId,
      domComponentInstanceId: domComponentInstanceId,
      lifecycle: lifecycle,
      nativePreview: nativePreview
    }), key);
  };

  CSSBridge.prototype._syncRenderedMappedSettingsBaseline = function (ctx, cssText) {
    cssText = String(cssText == null ? '' : cssText);
    var mappedFromSnapshot = this._extractEditableMappedSettingsCss(cssText);
    if (mappedFromSnapshot != null) {
      this._lastRenderedMappedSettingsCss = mappedFromSnapshot || '';
      return;
    }
    if (ctx && ctx.mode === 'element' && ctx.scope !== 'children' && this.api && typeof this.api.getElementMappedSettingsCssByDom === 'function') {
      var mappedInfo = this.api.getElementMappedSettingsCssByDom(ctx.element);
      this._lastRenderedMappedSettingsCss = mappedInfo && mappedInfo.ok && mappedInfo.css ? String(mappedInfo.css || '') : '';
      return;
    }
    this._lastRenderedMappedSettingsCss = '';
  };

  CSSBridge.prototype.refresh = function (opts) {
    opts = opts || {};
    var force = !!opts.force;
    var ctx = this._getScopedContext();
    if (!ctx) return;
    var ctxKey = this._contextKey(ctx);
    if (!force && !this.readOnly && !this._applying && this._dirty) {
      if (this._dirtyViewMode === this.viewMode) {
        if (this._dirtyContextKey && this._dirtyContextKey === ctxKey) {
          return;
        }
      }
    }
    if (!force && !this.readOnly && !this._applying && this._shouldDeferRefreshWhileTyping(ctx)) {
      this._scheduleDeferredRefreshWhileTyping(ctx);
      return;
    }
    this._clearPendingTypingRefreshTimer();
    // Keep the selected view mode stable across layers.
    // L1 remains read-only via apply gating, but the rendered snapshot should not jump to Authored automatically.
    var effectiveViewMode = 'canonical';
    var lensMode = this._normalizeCssLensMode(this.cssLensMode);
    // Lite keeps a single editable CSS mode: canonical Write.
    var minimalLens = (lensMode === 'minimal') && this._isEditableCssMode(effectiveViewMode);
    var cssText = '';
    var lensState = this._getCssLensState(ctx);
    var lensNoMatch = lensState.active && !lensState.hasMatch;
    var childrenIdentitySignature = this._getChildrenScopeIdentitySignature(ctx);
    if (lensNoMatch) {
      cssText = '';
      if (this._isEditableCssMode(this.viewMode)) {
        var lensInfo = [];
        if (ctx.mode === 'element') {
          lensInfo.push('Source: selected Bricks element #' + String(ctx.id || '?'));
        } else {
          lensInfo.push('Page mode');
        }
        lensInfo.push('Write lens: ' + this._cssLensModeLabel(lensState.mode, true));
        lensInfo.push('No match in current context.');
        this._lastCanonicalInfoText = lensInfo.join('\n');
        this._lastCanonicalInfoContextKey = ctxKey;
      }
    } else if (ctx.mode === 'element') {
      if (minimalLens && ctx.scope === 'children') {
        cssText = this._buildChildrenScopeMinimalSnapshot(ctx);
      } else if (minimalLens) {
        cssText = this._buildElementMinimalEditableSnapshot(ctx.element, ctx.id);
      } else if (ctx.scope === 'children') {
        cssText = this._buildChildrenScopeSnapshot(ctx, { viewMode: 'canonical' });
      } else {
        cssText = this._buildElementCanonicalSnapshot(ctx.element, ctx.id, { contextInfoKey: ctxKey });
      }
    } else {
      if (minimalLens) {
        cssText = this._buildPageLiveInspectorSummary();
      } else {
        cssText = this._buildPageCanonicalSummary();
      }
    }

    var filterKey = this._propertyFilterKey(this.propertyFilter);
    var pageOverrideCss = this._resolvePageRenderOverrideCss(ctx, filterKey);
    if (pageOverrideCss != null) {
      cssText = pageOverrideCss;
    } else if (ctx.mode === 'page') {
      var pageParityOverrideCss = this._buildPageSelectionParityRenderOverride(ctx, cssText);
      if (pageParityOverrideCss != null) cssText = pageParityOverrideCss;
    } else {
      var elementOverrideCss = this._resolveElementRenderOverrideCss(ctx, filterKey);
      if (elementOverrideCss != null) {
        cssText = elementOverrideCss;
      }
    }

    var preserveView = this._shouldPreserveEditorViewOnRefresh(ctx, ctxKey);

    if (cssText === this._lastCss) {
      this._lastRenderedContextKey = ctxKey;
      this._lastRenderedViewMode = this.viewMode;
      this._lastRenderedPropertyFilterKey = filterKey;
      this._lastRenderedChildrenScopeSignature = childrenIdentitySignature;
      if (!lensNoMatch) this._refreshCanonicalInfoCache(ctx);
      this._syncRenderedMappedSettingsBaseline(ctx, cssText);
      if (this.panel && typeof this.panel.setPaneMeta === 'function') {
        this._updateMeta(ctx);
      } else {
        this._syncCssInfoBadge(ctx);
        this._syncApplyButtonState(ctx);
        this._syncClassAddButtonState(ctx);
      }
      return;
    }
    this._lastCss = cssText;
    this.editor.setValue(cssText, {
      silent: true,
      preserveScroll: preserveView,
      preserveSelection: preserveView
    });
    this._lastRenderedContextKey = ctxKey;
    this._lastRenderedViewMode = this.viewMode;
    this._lastRenderedPropertyFilterKey = filterKey;
    this._lastRenderedChildrenScopeSignature = childrenIdentitySignature;
    this._syncRenderedMappedSettingsBaseline(ctx, cssText);
    this._dirty = false;
    this._dirtySelectionId = '';
    this._dirtyContextKey = '';
    this._dirtyViewMode = '';
    this._syncCssInfoBadge(ctx);
    this._syncApplyButtonState(ctx);
    this._syncClassAddButtonState(ctx);
  };

  CSSBridge.prototype._shouldDeferRefreshWhileTyping = function (ctx) {
    if (!ctx || (ctx.mode !== 'element' && ctx.mode !== 'page')) return false;
    var panelRoot = this.panel && this.panel.root;
    if (!panelRoot || !panelRoot.contains) return false;
    var active = document.activeElement;
    if (!active || !panelRoot.contains(active)) return false;
    if (!this._isEditableCssMode(this.viewMode)) return false;
    var ctxKey = this._contextKey(ctx);
    if (!ctxKey || ctxKey !== String(this._lastEditContextKey || '')) return false;
    var nowTs = Date.now ? Date.now() : +new Date();
    var quietMs = Math.max(300, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 260);
    return !!this._lastEditAt && (nowTs - this._lastEditAt) < quietMs;
  };

  CSSBridge.prototype._canAutoApply = function (ctx) {
    if (this.readOnly) return false;
    if (!this.liveSync || !this.liveSync.enabled) return false;
    if (!ctx) return false;
    if (!this._isEditableCssMode(this.viewMode)) return false;
    var lensState = this._getCssLensState(ctx);
    if (lensState.active && !lensState.hasMatch) return false;
    if (ctx.mode === 'element' && String(ctx.scope || 'self') === 'children') return false;
    if (ctx.mode === 'page') {
      // Page scope is read-only in Lite — no auto-apply
      return false;
    }
    if (ctx.mode !== 'element' || !ctx.element) return false;
    var analysis = this.api && typeof this.api.getElementAnalysisById === 'function'
      ? this.api.getElementAnalysisById(ctx.id, ctx.element)
      : null;
    var gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);
    var opPolicy = this._resolveApplyOperationPolicy(gate);
    if (opPolicy.level === 'blocked') return false;
    return true;
  };

  CSSBridge.prototype._queueAutoApply = function () {
    if (!this._autoApplyDebounced) return;
    this._autoApplyDebounced();
  };

  CSSBridge.prototype._runAutoApply = function () {
    if (!this._dirty || this._applying) return false;
    var ctx = this._getScopedContext();
    if (!this._canAutoApply(ctx)) return false;
    if (this._dirtyContextKey && this._dirtyContextKey !== this._contextKey(ctx)) return false;
    if (ctx.mode === 'element') {
      if (!this._dirtySelectionId || String(ctx.id || '') !== this._dirtySelectionId) return false;
    } else if (ctx.mode === 'page') {
      if (this._dirtySelectionId) return false;
    } else {
      return false;
    }
    if (this._dirtyViewMode !== this.viewMode) return false;
    if (!this._isEditableCssMode(this._dirtyViewMode) || !this._isEditableCssMode(this.viewMode)) return false;
    var readiness = null;
    try {
      var source = this.editor && this.editor.getValue ? this.editor.getValue() : '';
      if (ctx.mode === 'page') {
        var extractedPageCss = this._extractEditablePageCustomCss(source);
        readiness = this._isEditablePageCustomCssReadyForAutoApply(extractedPageCss);
      } else {
        var mappedCss = this._extractEditableMappedSettingsCss(source);
        var mappedEdited = mappedCss != null &&
          this._normalizeMappedSettingsCssText(mappedCss) !== this._normalizeMappedSettingsCssText(this._lastRenderedMappedSettingsCss);
        var customExtract = this._extractEditableCustomCssOptional(source);
        var hasGlobalClassBlocks = this._extractEditableGlobalClassCssBlocks(source).length > 0;
        if (customExtract.found) {
          readiness = this._isEditableCustomCssReadyForAutoApply(customExtract.css, ctx);
        } else if (mappedCss != null || hasGlobalClassBlocks) {
          readiness = { ok: true, reason: 'class-or-id-block-only' };
        } else {
          readiness = { ok: false, reason: 'No editable CSS block found for current filter' };
        }
        if (readiness.ok) {
          if (mappedEdited) {
            readiness = this._isEditableMappedSettingsCssReadyForAutoApply(mappedCss);
          }
        }
      }
    } catch (err) {
      readiness = { ok: false, reason: (err && err.message) ? err.message : 'auto-css-parse-check-failed' };
    }
    if (!readiness.ok) {
      var readinessReason = String(readiness && readiness.reason ? readiness.reason : '').trim();
      var typingWait = /\btyping\b/i.test(readinessReason);
      if (!typingWait && !this._shouldSuppressTypingAutoFeedback()) {
        var waitingStatus = 'CSS Live Sync waiting · ' + readinessReason;
        this._setAutoStatus(waitingStatus);
        this._lastAutoStatus = waitingStatus;
      }
      return false;
    }
    return this.applyFromEditor({ source: 'auto' });
  };

  CSSBridge.prototype._syncApplyButtonState = function (ctx) {
    if (!this.panel || !this.panel.setCssApplyState) return;
    ctx = ctx || this._getScopedContext();

    if (this.readOnly) {
      this.panel.setCssApplyState({
        enabled: false,
        busy: false,
        title: 'CSS editor is read-only in this phase'
      });
      return;
    }

    if (!ctx) {
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Bricks builder context not ready'
      });
      return;
    }

    if (this._isAuthorLayer()) {
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: 'L1 Author is read-focused. Switch to L2 Structure + Attrs to enable live sync.'
      });
      return;
    }

    if (!this._isEditableCssMode(this.viewMode)) {
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Live sync writes only the active Lite write target in Edit view'
      });
      return;
    }

    var lensState = this._getCssLensState(ctx);
    if (lensState.active && !lensState.hasMatch) {
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Lens filter "' + this._cssLensModeLabel(lensState.mode, true) + '" has no match in current context'
      });
      return;
    }

    if (ctx.mode === 'page') {
      this.panel.setCssApplyState({
        enabled: true,
        busy: this._applying,
        title: 'Apply page-scoped CSS to pageSettings.customCss'
      });
      return;
    }

    if (ctx.mode !== 'element' || !ctx.element) {
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Select a Bricks element to target class or ID live sync'
      });
      return;
    }

    if (String(ctx.scope || 'self') === 'children') {
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Children scope CSS write is unavailable in CM6GPT Lite'
      });
      return;
    }

    var analysis = this.api && typeof this.api.getElementAnalysisById === 'function'
      ? this.api.getElementAnalysisById(ctx.id, ctx.element)
      : null;
    var gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);
    var opPolicy = this._resolveApplyOperationPolicy(gate);
    var classOnlyFilter = this._isClassOnlyFilter(this.propertyFilter);
    var primaryClassTarget = classOnlyFilter ? this._getPrimaryGlobalClassTarget(ctx) : null;
    var applyTargetSummary = classOnlyFilter
      ? ('Class write target: ' + this._formatPrimaryGlobalClassTargetSummary(primaryClassTarget))
      : 'ID write target: current element _cssCustom + mappedSettingsCss';
    var gatePolicySummary = gate && gate.diagnostics && gate.diagnostics.summary
      ? String(gate.diagnostics.summary)
      : '';
    if (opPolicy.level === 'blocked') {
      var blockedReason = this._formatApplyOperationBlockedReason(opPolicy);
      this.panel.setCssApplyState({
        enabled: false,
        busy: this._applying,
        title: gate && gate.reasons && gate.reasons.length
          ? (
            'Gate: blocked\n' +
            blockedReason + '\n' +
            (gatePolicySummary ? (gatePolicySummary + '\n') : '') +
            gate.reasons.slice(0, 4).join('\n')
          )
          : (
            (gatePolicySummary || blockedReason)
              ? ('Gate: blocked\n' + blockedReason + (gatePolicySummary ? ('\n' + gatePolicySummary) : ''))
              : 'Gate: blocked'
          )
      });
      return;
    }

    this.panel.setCssApplyState({
      enabled: true,
      busy: this._applying,
        title: gate && gate.reasons && gate.reasons.length
          ? (
            'Gate: ' + gate.level + '\n' +
            applyTargetSummary + '\n' +
            (gatePolicySummary ? (gatePolicySummary + '\n') : '') +
            gate.reasons.slice(0, 4).join('\n')
          )
        : (applyTargetSummary + ' to selected element')
    });
  };

  CSSBridge.prototype._syncClassAddButtonState = function (ctx) {
    if (!this.panel || typeof this.panel.setCssClassAddState !== 'function') return;
    ctx = ctx || this._getScopedContext();

    if (this.readOnly) {
      this.panel.setCssClassAddState({
        enabled: false,
        busy: false,
        title: 'Class add is unavailable: editor is read-only'
      });
      return;
    }

    if (this._isAuthorLayer()) {
      this.panel.setCssClassAddState({
        enabled: false,
        busy: this._applying,
        title: 'Class add is disabled in L1 Author (switch to L2 Structure + Attrs)'
      });
      return;
    }

    if (!this._isEditableCssMode(this.viewMode)) {
      this.panel.setCssClassAddState({
        enabled: false,
        busy: this._applying,
        title: 'Switch to Write mode to add class'
      });
      return;
    }

    if (!ctx || ctx.mode !== 'element' || !ctx.element) {
      this.panel.setCssClassAddState({
        enabled: false,
        busy: this._applying,
        title: 'Select a Bricks element to add class'
      });
      return;
    }

    if (String(ctx.scope || 'self') === 'children') {
      this.panel.setCssClassAddState({
        enabled: false,
        busy: this._applying,
        title: 'Children scope: class add is disabled (switch to Self or Parent)'
      });
      return;
    }

    this.panel.setCssClassAddState({
      enabled: !this._applying,
      busy: false,
      title: 'Add class to selected element. New class becomes the active class target.'
    });
  };

  CSSBridge.prototype._normalizeClassNameInput = function (raw) {
    var token = String(raw == null ? '' : raw).trim();
    if (!token) return '';
    token = token.replace(/^[.#]+/, '');
    token = token.split(/\s+/)[0] || '';
    token = token.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-');
    token = token.replace(/^-+/, '').replace(/-+$/, '');
    if (!token) return '';
    if (!/^[A-Za-z_]/.test(token)) token = 'c-' + token;
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) return '';
    return token;
  };

  CSSBridge.prototype.addClassFromPanel = function (rawInput) {
    if (!this.api) return false;
    if (this.readOnly) {
      this._setPanelStatus('Class add unavailable: editor is read-only', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (this._isAuthorLayer()) {
      this._setPanelStatus('Class add unavailable in L1 Author layer · switch to L2', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (!this._isEditableCssMode(this.viewMode)) {
      this._setPanelStatus('Class add unavailable: switch to Write mode', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (this._applying) return false;

    var ctx = this._getScopedContext();
    if (!ctx || ctx.mode !== 'element' || !ctx.element) {
      this._setPanelStatus('Class add unavailable: select a Bricks element', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (String(ctx.scope || 'self') === 'children') {
      this._setPanelStatus('Class add unavailable in children scope (switch to Self or Parent)', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (!this.api || typeof this.api.updateElementSafeSubsetStateByDom !== 'function') {
      this._setPanelStatus('Class add unavailable: Bricks API class state helper missing', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    var currentClasses = this._getUserClasses(ctx.element);
    var primaryTargetBeforeAdd = this._getPrimaryGlobalClassTarget(ctx);
    var suggested = currentClasses.length ? '' : 'new-class';
    var hasProvidedInput = arguments.length > 0;
    var raw = hasProvidedInput ? rawInput : w.prompt('Add class name', suggested);
    if (raw == null) return false;
    var className = this._normalizeClassNameInput(raw);
    if (!className) {
      this._setPanelStatus('Invalid class name. Use letters, numbers, "-" or "_" and start with letter/_', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    if (currentClasses.indexOf(className) !== -1) {
      this._setPanelStatus('Class already assigned: .' + className, { channel: 'class', dedupeMs: 0 });
      if (this.panel && typeof this.panel.flashAction === 'function') {
        this.panel.flashAction('Class already present: .' + className, { kind: 'info', ttlMs: 1100 });
      }
      this.refresh({ force: true });
      return true;
    }

    var nextClasses = currentClasses.slice();
    nextClasses.push(className);
    var res = this.api.updateElementSafeSubsetStateByDom(ctx.element, {
      classChanged: true,
      userClasses: nextClasses,
      originalUserClasses: currentClasses
    });

    if (!res || !res.ok) {
      var reason = res && res.reason ? res.reason : 'class-state-update-failed';
      this._setPanelStatus('Class add failed: ' + reason, { channel: 'class', dedupeMs: 0 });
      return false;
    }

    // Activate the new class in Bricks GUI so it becomes the active class target
    if (this.api && typeof this.api.activateClassUiByName === 'function') {
      try {
        this.api.activateClassUiByName(className, { deferUiRefresh: false });
      } catch (eActivate) { _warn('addClassFromPanel', eActivate); }
    }

    if (this.panel && typeof this.panel.flashAction === 'function') {
      this.panel.flashAction('Class added: .' + className, { kind: 'ok', ttlMs: 1200 });
    }
    var classTargetStatusSuffix = primaryTargetBeforeAdd.label && primaryTargetBeforeAdd.label !== ('.' + className)
      ? (' · previous target was ' + primaryTargetBeforeAdd.label)
      : '';
    this._setPanelStatus('Class added and synced: .' + className + ' · editor switched to Class target · class target now .' + className + classTargetStatusSuffix, { channel: 'class', dedupeMs: 0 });
    // B9 fix: warn if switching away from unsaved ID-scoped edits
    var switchingFromId = this.propertyFilter && this.propertyFilter.id && !this.propertyFilter.class;
    if (switchingFromId && this._dirty) {
      var confirmSwitch = w.confirm(
        'You have unsaved ID-scoped CSS edits. Switching to Class target will discard them.\n\nSwitch anyway?'
      );
      if (!confirmSwitch) {
        this._setPanelStatus('Class added: .' + className + ' · kept ID target (unsaved edits preserved)', { channel: 'class', dedupeMs: 0 });
        return true;
      }
    }
    if (this.panel && typeof this.panel.setCssPropertyFilter === 'function') {
      this.panel.setCssPropertyFilter({
        class: true,
        id: false
      }, false);
    }
    this.propertyFilter = this._normalizePropertyFilter({
      class: true,
      id: false
    });
    var classRefreshOutcome = null;
    var refreshError = null;
    try {
      classRefreshOutcome = this._requestManualRefreshReport({ includeSelection: false, reason: 'class-add' });
      if (classRefreshOutcome.finalFailed) {
        var classRefreshReason = String(classRefreshOutcome.failureReason || '').trim();
        if (!classRefreshReason) classRefreshReason = this._manualRefreshErrorReason(classRefreshOutcome.report, 'manual-refresh-failed');
        refreshError = new Error(classRefreshReason);
      }
    } catch (eRefresh) { _warn('addClassFromPanel', eRefresh); 
      refreshError = eRefresh;
    }
    // W30: Only force-refresh if the manual refresh above failed; successful manual refresh already refreshed.
    if (refreshError) {
      this.refresh({ force: true });
    }
    if (refreshError) {
      this._setPanelStatus('Class added · editor switched to Class target · refresh fallback applied' + classTargetStatusSuffix + this._formatManualRefreshDiagSuffix(classRefreshOutcome), { channel: 'class', dedupeMs: 0 });
    } else if (classRefreshOutcome && classRefreshOutcome.retryRecovered) {
      this._setPanelStatus('Class added and synced (retry recovered): .' + className + ' · editor switched to Class target' + classTargetStatusSuffix + this._formatManualRefreshDiagSuffix(classRefreshOutcome), { channel: 'class', dedupeMs: 0 });
    } else {
      this._setPanelStatus('Class added and synced: .' + className + ' · editor switched to Class target' + classTargetStatusSuffix + this._formatManualRefreshDiagSuffix(classRefreshOutcome), { channel: 'class', dedupeMs: 0 });
    }
    return true;
  };

  CSSBridge.prototype._hasManualRefreshSupport = function () {
    return getBridgeManualRefresh().hasSupport(this);
  };

  CSSBridge.prototype._getManualRefreshFn = function () {
    return getBridgeManualRefresh().getFn(this);
  };

  CSSBridge.prototype._isManualRefreshFinalFailure = function (report) {
    return getBridgeManualRefresh().isFinalFailure(this, report);
  };

  CSSBridge.prototype._manualRefreshErrorMessages = function (errors) {
    return getBridgeManualRefresh().errorMessages(errors);
  };

  CSSBridge.prototype._manualRefreshReportErrorMessages = function (reportLike) {
    return getBridgeManualRefresh().reportErrorMessages(this, reportLike);
  };

  CSSBridge.prototype._manualRefreshShapeTag = function (value) {
    return getBridgeManualRefresh().shapeTag(value);
  };

  CSSBridge.prototype._normalizeManualRefreshThrowReason = function (errorLike, fallback) {
    return getBridgeManualRefresh().normalizeThrowReason(errorLike, fallback);
  };

  CSSBridge.prototype._isManualRefreshReportLike = function (value) {
    return getBridgeManualRefresh().isReportLike(value);
  };

  CSSBridge.prototype._extractManualRefreshReportShape = function (value) {
    return getBridgeManualRefresh().extractReportShape(value);
  };

  CSSBridge.prototype._isManualRefreshReportFailure = function (reportLike) {
    return getBridgeManualRefresh().isReportFailure(this, reportLike);
  };

  CSSBridge.prototype._isManualRefreshHardFailure = function (report) {
    return getBridgeManualRefresh().isHardFailure(this, report);
  };

  CSSBridge.prototype._manualRefreshErrorReason = function (report, fallback) {
    return getBridgeManualRefresh().errorReason(this, report, fallback);
  };

  CSSBridge.prototype._formatManualRefreshDiagSuffix = function (outcome) {
    return getBridgeManualRefresh().formatDiagSuffix(this, outcome);
  };

  CSSBridge.prototype._normalizeManualRefreshOutcome = function (outcome) {
    return getBridgeManualRefresh().normalizeOutcome(this, outcome);
  };

  CSSBridge.prototype._isManualRefreshOutcomeOrReportLike = function (value) {
    return getBridgeManualRefresh().isOutcomeOrReportLike(this, value);
  };

  CSSBridge.prototype._invalidManualRefreshOutcome = function (rawOutcome, prefix) {
    return getBridgeManualRefresh().invalidOutcome(this, rawOutcome, prefix);
  };

  CSSBridge.prototype._requestManualRefreshReport = function (payload) {
    return getBridgeManualRefresh().requestReport(this, payload);
  };

  CSSBridge.prototype.applyFromEditor = function (options) {
    options = options || {};
    var isAuto = options.source === 'auto';
    var startEditSeq = this._editSeq;
    if (this.readOnly) {
      if (!isAuto) this._setPanelStatus('CSS Apply unavailable: editor is read-only', { channel: 'apply' });
      return false;
    }
    if (this._isAuthorLayer()) {
      if (!isAuto) this._setPanelStatus('CSS Apply unavailable in L1 Author layer · switch to L2', { channel: 'apply' });
      return false;
    }
    if (!this.api || !this.editor) return false;

    var ctx = this._getScopedContext();
    if (!ctx) {
      if (!isAuto) this._setPanelStatus('CSS Apply unavailable: Bricks builder context not ready', { channel: 'apply' });
      return false;
    }
    if (!this._isEditableCssMode(this.viewMode)) {
      if (!isAuto) this._setPanelStatus('CSS Apply unavailable: switch to Write view (editable CSS blocks only)', { channel: 'apply' });
      return false;
    }
    if (ctx.mode === 'element' && String(ctx.scope || 'self') === 'children') {
      if (!isAuto) this._setPanelStatus('CSS Apply unavailable: children scope is disabled in CM6GPT Lite', { channel: 'apply' });
      return false;
    }
    var lensState = this._getCssLensState(ctx);
    if (lensState.active && !lensState.hasMatch) {
      if (!isAuto) this._setPanelStatus('CSS Apply unavailable: lens "' + this._cssLensModeLabel(lensState.mode, true) + '" has no match in current context', { channel: 'apply' });
      return false;
    }
    if (ctx.mode === 'element' && ctx.element) {
      var analysis = this.api && typeof this.api.getElementAnalysisById === 'function'
        ? this.api.getElementAnalysisById(ctx.id, ctx.element)
        : null;
      var gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);
      var opPolicy = this._resolveApplyOperationPolicy(gate);
      if (opPolicy.level === 'blocked') {
        if (!isAuto) this._emitApplyTaxonomyStatus('apply-blocked', {
          reason: 'gate:blocked · ' + this._formatApplyOperationBlockedReason(opPolicy)
        });
        return false;
      }
    }
    if (this._applying) return false;

    // SYNC CONTRACT: The entire apply pipeline below MUST execute synchronously.
    // _applying acts as a reentrance guard — it is set here and cleared in finally{}.
    // If any helper method introduces async/Promise behavior, the guard will release
    // before the transaction completes, allowing concurrent applies and data corruption.
    // If you need to add async operations, replace this boolean with a proper mutex/queue.
    this._applying = true;
    this._syncApplyButtonState(ctx);
    try {
    var self = this;
    var dirtySnapshot = {
      dirty: !!this._dirty,
      selectionId: String(this._dirtySelectionId || ''),
      contextKey: String(this._dirtyContextKey || ''),
      viewMode: String(this._dirtyViewMode || '')
    };
    var rollbackSnapshot = {
      pageCss: '',
      pageCaptured: false,
      element: ctx && ctx.element ? ctx.element : null,
      elementCustomCss: '',
      elementCustomCaptured: false,
      elementMappedCss: '',
      elementMappedCaptured: false
    };
    var childrenRollbackSnapshot = null;
    var txResult = this._runApplyTransaction({
      source: isAuto ? 'auto' : 'manual',
      mode: ctx && ctx.mode ? ctx.mode : '',
      scope: ctx && ctx.scope ? ctx.scope : ''
    }, function (tx) {
      tx.enter('prepare');
      var source = self.editor.getValue ? self.editor.getValue() : '';
      if (ctx.mode === 'element' && String(ctx.scope || 'self') === 'children') {
        childrenRollbackSnapshot = self._captureChildrenScopeRollbackSnapshot(ctx, source);
        tx.enter('apply');
        var childSummary = self._applyChildrenScopeCss(source, ctx, { isAuto: isAuto });
        tx.enter('verify');
        self._dirty = false;
        self._dirtySelectionId = '';
        self._dirtyContextKey = '';
        self._dirtyViewMode = '';
        self._lastAutoStatus = '';
        var hasChildrenRefreshApi = self._hasManualRefreshSupport();
        if (hasChildrenRefreshApi) {
          var baseNowChildren = Date.now ? Date.now() : +new Date();
          self._ignorePageSelectionUntil = baseNowChildren + Math.max(450, Number((self.liveSync && self.liveSync.debounceMs) || 180) + 320);
        }
        var childrenRefreshOutcome = self._requestManualRefreshReport({ includeSelection: false, reason: 'css-apply-children' });
        if (childrenRefreshOutcome.finalFailed) {
          if (childrenRefreshOutcome.hardFailure) {
            throw new Error(self._manualRefreshErrorReason(childrenRefreshOutcome.report, 'manual-refresh-failed'));
          }
          self.refresh({ force: true });
        } else if (!childrenRefreshOutcome.attempted) {
          self.refresh({ force: true });
        }
        tx.enter('commit');
        var scopeStatus = (isAuto ? 'CSS Live Sync OK · ' : 'CSS Apply OK · ')
          + 'children updated ' + childSummary.changed + '/' + childSummary.attempted;
        if (childSummary.unchanged) scopeStatus += ' · unchanged ' + childSummary.unchanged;
        if (childSummary.failed) scopeStatus += ' · failed ' + childSummary.failed;
        if (childSummary.mappedCount > 0) scopeStatus += ' · mapped sync ' + childSummary.mappedCount;
        if (childSummary.globalClassChanged > 0) scopeStatus += ' · global class CSS ' + childSummary.globalClassChanged;
        if (childSummary.errors.length) scopeStatus += ' · ' + childSummary.errors.slice(0, 2).join(' | ');
        if (isAuto) self._setAutoStatus(scopeStatus);
        else self._setPanelStatus(scopeStatus, { channel: 'apply' });
        if (self.panel && typeof self.panel.flashAction === 'function' && !isAuto) {
          self.panel.flashAction(
            childSummary.failed
              ? ('Children CSS partial: ' + childSummary.changed + '/' + childSummary.attempted)
              : ('Children CSS applied: ' + childSummary.changed + '/' + childSummary.attempted),
            { kind: childSummary.failed ? 'info' : 'ok', ttlMs: 1400 }
          );
        }
        return childSummary.failed === 0;
      }
      tx.enter('apply');
      var res = null;
      var normalizedCss = null;
      var globalClassApply = null;
      var mappedSettingsApply = null;
      var mappedSettingsFallbackApply = null;
      var mappedSettingsCss = null;
      var mappedSettingsEdited = false;
      var hasGlobalClassBlocks = false;
      var pageUiSync = null;

      if (!isAuto && ctx.mode === 'element' && ctx.element) {
        self._runClassLifecycleCommandsFromSource(source, ctx);
      }

      if (ctx.mode === 'page') {
        if (!self.api || typeof self.api.updatePageCustomCss !== 'function') {
          throw new Error('Page CSS apply unavailable: Bricks API page CSS write helper missing');
        }
        if (!rollbackSnapshot.pageCaptured && self.api && typeof self.api.getPageCustomCss === 'function') {
          rollbackSnapshot.pageCss = String(self.api.getPageCustomCss() || '');
          rollbackSnapshot.pageCaptured = true;
        }
        var pageCssSource = self._extractEditablePageCustomCss(source);
        var mergedPageCss = self._mergePageScopedEditableCssWithCurrentPageCss(pageCssSource);
        res = self.api.updatePageCustomCss(mergedPageCss);
        if (!res || !res.ok) {
          throw new Error(res && (res.reason || (res.css && res.css.reason)) ? (res.reason || res.css.reason) : 'page-css-write-failed');
        }
        pageUiSync = self._syncPageCssIntoSelectedElementUi(mergedPageCss);
      } else if (ctx.mode === 'element' && ctx.element) {
        var classOnlyFilter = self._isClassOnlyFilter(self.propertyFilter);
        var hasEditableMarkers = /@cm6gpt-editable-(begin|end)\b|\/\*\s*@cm6gpt-editable-(begin|end)\b/i.test(String(source || ''));

        if (classOnlyFilter && !hasEditableMarkers) {
          var classTarget = self._getPrimaryGlobalClassTarget(ctx);
          var classRef = String(classTarget && classTarget.ref || '').trim();
          var directClassCss = String(source || '').trim();
          if (classRef && classTarget && classTarget.kind === 'global') {
            if (!self.api || typeof self.api.updateGlobalClassCustomCss !== 'function') {
              throw new Error('Class layer apply unavailable: Bricks API global class write helper missing');
            }
            var classSelector = classTarget.name
              ? ('.' + self._escapeCssIdentifier(classTarget.name))
              : '';
            var emptyClassSkeleton = self._stripEmptySelectorSkeleton(directClassCss, classSelector);
            if (emptyClassSkeleton !== null) {
              directClassCss = emptyClassSkeleton;
            }
            var directClassRes = self.api.updateGlobalClassCustomCss(classRef, directClassCss, { deferUiRefresh: true });
            if (!directClassRes || !directClassRes.ok) {
              throw new Error(directClassRes && directClassRes.reason ? directClassRes.reason : 'global-class-write-failed');
            }
            globalClassApply = {
              supported: true,
              attempted: true,
              blockCount: 1,
              changedCount: directClassRes.changed ? 1 : 0,
              unchangedCount: directClassRes.changed ? 0 : 1,
              failedCount: 0,
              reason: directClassRes.changed ? 'updated' : 'already-synced'
            };
            res = {
              ok: true,
              changed: false,
              reason: 'class-only-direct',
              id: String(ctx.id || ''),
              mapped: { changed: false, writes: [], deletes: [] }
            };
          } else {
            if (classTarget && classTarget.kind === 'local' && classTarget.name) {
              var localClassSelector = '.' + self._escapeCssIdentifier(classTarget.name);
              var emptyLocalClassSkeleton = self._stripEmptySelectorSkeleton(directClassCss, localClassSelector);
              if (emptyLocalClassSkeleton !== null) {
                directClassCss = emptyLocalClassSkeleton;
              }
            }
            if (!rollbackSnapshot.elementCustomCaptured && self.api && typeof self.api.getElementModelByDom === 'function') {
              var directRollbackResolved = self.api.getElementModelByDom(ctx.element);
              var directRollbackModel = directRollbackResolved && directRollbackResolved.model ? directRollbackResolved.model : null;
              var directRollbackSettings = directRollbackModel && directRollbackModel.settings && typeof directRollbackModel.settings === 'object'
                ? directRollbackModel.settings
                : null;
              rollbackSnapshot.elementCustomCss = directRollbackSettings && typeof directRollbackSettings._cssCustom === 'string'
                ? directRollbackSettings._cssCustom
                : '';
              rollbackSnapshot.elementCustomCaptured = true;
            }
            if (!rollbackSnapshot.elementMappedCaptured && self.api && typeof self.api.getElementMappedSettingsCssByDom === 'function') {
              var directRollbackMappedInfo = self.api.getElementMappedSettingsCssByDom(ctx.element);
              rollbackSnapshot.elementMappedCss = (directRollbackMappedInfo && directRollbackMappedInfo.ok && directRollbackMappedInfo.css != null)
                ? String(directRollbackMappedInfo.css)
                : '';
              rollbackSnapshot.elementMappedCaptured = true;
            }
            if (!self.api || typeof self.api.updateElementCustomCssByDom !== 'function') {
              throw new Error('CSS Apply unavailable: Bricks API CSS write helper missing');
            }
            normalizedCss = self._normalizeEditableCustomCssForElement(directClassCss, ctx);
            res = self.api.updateElementCustomCssByDom(ctx.element, normalizedCss.css, {
              syncMappedFromCustom: true
            });
            if (!res || !res.ok) {
              throw new Error(res && (res.reason || (res.css && res.css.reason)) ? (res.reason || res.css.reason) : 'css-state-write-failed');
            }
            if (
              self._normalizeMode(self.viewMode) === 'canonical' &&
              (!res.mapped || !res.mapped.changed) &&
              self.api &&
              typeof self.api.updateElementMappedSettingsByDom === 'function' &&
              normalizedCss &&
              normalizedCss.css
            ) {
              mappedSettingsFallbackApply = self.api.updateElementMappedSettingsByDom(ctx.element, normalizedCss.css, { deferUiRefresh: true });
              if (mappedSettingsFallbackApply && mappedSettingsFallbackApply.ok && mappedSettingsFallbackApply.changed) {
                mappedSettingsApply = mappedSettingsFallbackApply;
              }
            }
          }
        } else {
          hasGlobalClassBlocks = self._extractEditableGlobalClassCssBlocks(source).length > 0;
          mappedSettingsCss = self._extractEditableMappedSettingsCss(source);
          mappedSettingsEdited = mappedSettingsCss != null &&
            self._normalizeMappedSettingsCssText(mappedSettingsCss) !== self._normalizeMappedSettingsCssText(self._lastRenderedMappedSettingsCss);

          var customExtract = self._extractEditableCustomCssOptional(source);
          var hasCustomBlock = !!customExtract.found;
          if (!hasCustomBlock && mappedSettingsCss == null && !hasGlobalClassBlocks) {
            throw new Error('No editable CSS block found for current filter. Enable Class and/or ID blocks in the panel.');
          }
          if ((hasCustomBlock || mappedSettingsEdited) && !rollbackSnapshot.elementCustomCaptured && self.api && typeof self.api.getElementModelByDom === 'function') {
            var rollbackResolved = self.api.getElementModelByDom(ctx.element);
            var rollbackModel = rollbackResolved && rollbackResolved.model ? rollbackResolved.model : null;
            var rollbackSettings = rollbackModel && rollbackModel.settings && typeof rollbackModel.settings === 'object'
              ? rollbackModel.settings
              : null;
            rollbackSnapshot.elementCustomCss = rollbackSettings && typeof rollbackSettings._cssCustom === 'string'
              ? rollbackSettings._cssCustom
              : '';
            rollbackSnapshot.elementCustomCaptured = true;
          }
          if ((hasCustomBlock || mappedSettingsEdited) && !rollbackSnapshot.elementMappedCaptured && self.api && typeof self.api.getElementMappedSettingsCssByDom === 'function') {
            var rollbackMappedInfo = self.api.getElementMappedSettingsCssByDom(ctx.element);
            rollbackSnapshot.elementMappedCss = (rollbackMappedInfo && rollbackMappedInfo.ok && rollbackMappedInfo.css != null)
              ? String(rollbackMappedInfo.css)
              : '';
            rollbackSnapshot.elementMappedCaptured = true;
          }

          if (hasCustomBlock) {
            if (!self.api || typeof self.api.updateElementCustomCssByDom !== 'function') {
              if (!isAuto) self._setPanelStatus('CSS Apply unavailable: Bricks API CSS write helper missing', { channel: 'apply' });
              return false;
            }
            normalizedCss = self._normalizeEditableCustomCssForElement(customExtract.css, ctx);
            res = self.api.updateElementCustomCssByDom(ctx.element, normalizedCss.css, {
              syncMappedFromCustom: true
            });
            if (!res || !res.ok) {
              throw new Error(res && (res.reason || (res.css && res.css.reason)) ? (res.reason || res.css.reason) : 'css-state-write-failed');
            }
          } else {
            res = {
              ok: true,
              changed: false,
              reason: 'no-editable-custom-css-block',
              id: String(ctx.id || ''),
              mapped: { changed: false, writes: [], deletes: [] }
            };
          }

          if (mappedSettingsEdited) {
            if (!self.api || typeof self.api.updateElementMappedSettingsByDom !== 'function') {
              throw new Error('Mapped settings apply unavailable: Bricks API mapped settings helper missing');
            }
            mappedSettingsApply = self.api.updateElementMappedSettingsByDom(ctx.element, mappedSettingsCss);
            if (!mappedSettingsApply || !mappedSettingsApply.ok) {
              throw new Error(mappedSettingsApply && mappedSettingsApply.reason ? mappedSettingsApply.reason : 'mapped-settings-write-failed');
            }
          } else if (
            hasCustomBlock &&
            self._normalizeMode(self.viewMode) === 'canonical' &&
            (!res || !res.mapped || !res.mapped.changed)
          ) {
            // Sync mode can contain class-root rules; fallback mapped sync parses declarations
            // without forcing the Bricks id root selector, so native controls still update.
            if (self.api && typeof self.api.updateElementMappedSettingsByDom === 'function' && normalizedCss && normalizedCss.css) {
              mappedSettingsFallbackApply = self.api.updateElementMappedSettingsByDom(ctx.element, normalizedCss.css, { deferUiRefresh: true });
              if (mappedSettingsFallbackApply && mappedSettingsFallbackApply.ok && mappedSettingsFallbackApply.changed) {
                mappedSettingsApply = mappedSettingsFallbackApply;
              }
            }
          }
        }
      } else {
        if (!isAuto) self._setPanelStatus('CSS Apply unavailable: select a Bricks element or use page mode', { channel: 'apply' });
        return false;
      }

      if (!globalClassApply) {
        globalClassApply = self._applyEditableGlobalClassCssFromSource(source, ctx);
      }

      if (!res || !res.ok) {
        throw new Error(res && (res.reason || (res.css && res.css.reason)) ? (res.reason || res.css.reason) : 'css-state-write-failed');
      }

      tx.enter('verify');
      self._dirty = false;
      self._dirtySelectionId = '';
      self._dirtyContextKey = '';
      self._dirtyViewMode = '';
      self._lastAutoStatus = '';

      var mappedSettingsChanged = !!(mappedSettingsApply && mappedSettingsApply.changed);
      var customCssChanged = !!(res && res.css && res.css.changed);
      var nativeMappedChanged = !!(res && res.mapped && res.mapped.changed);
      var nativeMapByCustomCount = (res && res.mapped && res.mapped.changed)
        ? ((Array.isArray(res.mapped.writes) ? res.mapped.writes.length : 0) +
          (Array.isArray(res.mapped.deletes) ? res.mapped.deletes.length : 0))
        : 0;
      var nativeMapByBlockCount = (mappedSettingsApply && mappedSettingsApply.mapped && mappedSettingsApply.mapped.changed)
        ? ((Array.isArray(mappedSettingsApply.mapped.writes) ? mappedSettingsApply.mapped.writes.length : 0) +
          (Array.isArray(mappedSettingsApply.mapped.deletes) ? mappedSettingsApply.mapped.deletes.length : 0))
        : 0;

      var globalClassChanged = !!(globalClassApply && globalClassApply.changedCount > 0);
      var pageUiParityChanged = !!(pageUiSync && pageUiSync.changed);
      var targetLabel = (ctx.mode === 'page')
        ? 'pageSettings.customCss updated'
        : (
          ((customCssChanged && nativeMappedChanged) || (customCssChanged && mappedSettingsChanged))
            ? ('settings._cssCustom + mapped settings updated for #' + (res.id || ctx.id || '?'))
            : ((mappedSettingsChanged || nativeMappedChanged)
              ? ('mapped settings updated for #' + (res.id || ctx.id || '?'))
              : (customCssChanged
                ? ('settings._cssCustom updated for #' + (res.id || ctx.id || '?'))
                : (globalClassChanged
                  ? 'class CSS updated'
                  : ('no element-level CSS changes for #' + (res.id || ctx.id || '?'))))
            )
        );
      var anyChanged = !!(customCssChanged || nativeMappedChanged || mappedSettingsChanged || globalClassChanged);
      var successDetail = anyChanged
        ? targetLabel
        : ('no changes (' + (res.reason || 'already-synced') + ')');
      if (normalizedCss && normalizedCss.autoWrapped) {
        successDetail += ' · auto-wrapped root selector';
      }
      if (nativeMapByCustomCount > 0) {
        successDetail += ' · native settings synced via _cssCustom (' + nativeMapByCustomCount + ')';
      }
      if (nativeMapByBlockCount > 0) {
        successDetail += ' · native settings synced via mapped block (' + nativeMapByBlockCount + ')';
      }
      if (globalClassApply && globalClassApply.changedCount > 0) {
        successDetail += ' · primary target synced';
      }
      if (globalClassApply && globalClassApply.failedCount > 0) {
        successDetail += ' · primary target sync failed';
      }
      if (pageUiParityChanged) {
        successDetail += ' · native GUI parity synced';
      }
      var successStatus = self._formatApplyTaxonomyStatus('apply-ok', {
        auto: isAuto,
        reason: successDetail
      });

      if (ctx && ctx.mode === 'page' && normalizedCss) {
        self._capturePageRenderOverride(ctx, extractedPageCss, normalizedCss.css);
      } else if (ctx && ctx.mode === 'element' && String(ctx.scope || 'self') !== 'children') {
        self._captureElementRenderOverride(ctx, source);
      } else {
        self._clearPageRenderOverride();
      }

      var hasApplyRefreshApi = self._hasManualRefreshSupport();
      if (hasApplyRefreshApi && ctx && ctx.mode === 'element') {
        var baseNow = Date.now ? Date.now() : +new Date();
        self._ignorePageSelectionUntil = baseNow + Math.max(450, Number((self.liveSync && self.liveSync.debounceMs) || 180) + 320);
      }
      var applyRefreshOutcome = self._requestManualRefreshReport({ includeSelection: false, reason: 'css-apply' });
      if (applyRefreshOutcome.finalFailed) {
        if (applyRefreshOutcome.hardFailure) {
          throw new Error(self._manualRefreshErrorReason(applyRefreshOutcome.report, 'manual-refresh-failed'));
        }
        self.refresh({ force: true });
      } else if (!applyRefreshOutcome.attempted) {
        self.refresh({ force: true });
      }
      tx.enter('commit');
      var suppressAutoFeedback = isAuto && self._shouldSuppressTypingAutoFeedback();
      if (isAuto) {
        if (!suppressAutoFeedback) self._setAutoStatus(successStatus);
      } else {
        self._setPanelStatus(successStatus, { channel: 'apply' });
      }
      if (!isAuto && self.panel && typeof self.panel.flashAction === 'function') {
        var cssActionText = '';
        var cssActionKind = 'ok';
        if (globalClassApply && globalClassApply.changedCount > 0) {
          cssActionText = 'Global class CSS applied (' + globalClassApply.changedCount + ')';
          cssActionKind = 'ok';
        } else if (mappedSettingsChanged) {
          var mappedBlockCount = nativeMapByBlockCount;
          cssActionText = mappedBlockCount > 0
            ? ('Mapped settings synced (' + mappedBlockCount + ')')
            : 'Mapped settings synced';
          cssActionKind = 'ok';
        } else if (res && res.mapped && res.mapped.changed) {
          var mappedCount = (Array.isArray(res.mapped.writes) ? res.mapped.writes.length : 0) +
            (Array.isArray(res.mapped.deletes) ? res.mapped.deletes.length : 0);
          cssActionText = 'Native style state synced (' + mappedCount + ')';
          cssActionKind = 'ok';
        } else if (res.changed) {
          if (isAuto) {
            cssActionText = (ctx.mode === 'page') ? 'Page CSS live synced' : 'Element CSS live synced';
          } else {
            cssActionText = (ctx.mode === 'page') ? 'Page CSS applied' : 'Element CSS applied';
          }
          if (normalizedCss && normalizedCss.autoWrapped) cssActionText += ' (auto-wrap)';
        } else if (!isAuto) {
          cssActionText = 'CSS apply: no changes';
          cssActionKind = 'info';
        }
        if (cssActionText) {
          self.panel.flashAction(cssActionText, {
            kind: cssActionKind,
            ttlMs: 1400
          });
        }
      }
      return true;
    }, function () {
      if (childrenRollbackSnapshot) {
        try { self._restoreChildrenScopeRollbackSnapshot(childrenRollbackSnapshot); } catch (eChildren) { console.warn('CM6GPT: rollback partial failure — children scope restore', eChildren); }
      }
      if (rollbackSnapshot.pageCaptured && self.api && typeof self.api.updatePageCustomCss === 'function') {
        try {
          self.api.updatePageCustomCss(rollbackSnapshot.pageCss, { deferUiRefresh: true });
        } catch (ePage) { console.warn('CM6GPT: rollback partial failure — page CSS restore', ePage); }
      }
      if (rollbackSnapshot.elementCustomCaptured && rollbackSnapshot.element && self.api && typeof self.api.updateElementCustomCssByDom === 'function') {
        try {
          self.api.updateElementCustomCssByDom(rollbackSnapshot.element, rollbackSnapshot.elementCustomCss, {
            syncMappedFromCustom: false,
            deferUiRefresh: true
          });
        } catch (eCustom) { console.warn('CM6GPT: rollback partial failure — element custom CSS restore', eCustom); }
      }
      if (rollbackSnapshot.elementMappedCaptured && rollbackSnapshot.element && self.api && typeof self.api.updateElementMappedSettingsByDom === 'function') {
        try {
          self.api.updateElementMappedSettingsByDom(rollbackSnapshot.element, rollbackSnapshot.elementMappedCss, {
            deferUiRefresh: true
          });
        } catch (eMapped) { console.warn('CM6GPT: rollback partial failure — element mapped settings restore', eMapped); }
      }
    });
    if (!txResult.ok) {
      this._dirty = !!dirtySnapshot.dirty;
      this._dirtySelectionId = dirtySnapshot.selectionId;
      this._dirtyContextKey = dirtySnapshot.contextKey;
      this._dirtyViewMode = dirtySnapshot.viewMode;
      var msg = txResult.error && txResult.error.message ? txResult.error.message : String(txResult.error || 'apply-transaction-failed');
      var verifyFailed = !!(txResult.tx && txResult.tx.phase === 'verify');
      if (!verifyFailed && /^Verify failed:/i.test(msg)) verifyFailed = true;
      if (verifyFailed) {
        this._emitApplyTaxonomyStatus('verify-failed', {
          auto: isAuto,
          reason: msg
        });
      }
      var rollbackStatus = this._emitApplyTaxonomyStatus('rollback-complete', {
        auto: isAuto,
        reason: msg
      });
      if (isAuto) this._lastAutoStatus = rollbackStatus;
      return false;
    }
    return !!txResult.result;
    } finally {
      this._applying = false;
      this._syncApplyButtonState();
      this._syncClassAddButtonState();
      if (isAuto && this._dirty && this._editSeq !== startEditSeq) {
        // W24: Restore dirtyContextKey from the snapshot so the re-queued
        // auto-apply can pass its consistency check.
        if (dirtySnapshot && dirtySnapshot.contextKey) {
          this._dirtyContextKey = dirtySnapshot.contextKey;
        }
        this._queueAutoApply();
      }
    }
  };

  CSSBridge.prototype._extractEditableCustomCss = function (text) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    var body = this._extractEditableBodyByDirective(text, '_cssCustom');
    if (body != null) return body;
    body = this._extractEditableBodyByComment(text, '_cssCustom');
    if (body != null) return body;

    // Backward-compatible fallback for older snapshots without explicit markers.
    var legacy = this._extractEditableCustomCssFallback(text);
    if (legacy != null) return legacy;

    return String(text || '').trim();
  };

  CSSBridge.prototype._extractEditableCustomCssOptional = function (text) {
    try {
      return {
        found: true,
        css: this._extractEditableCustomCss(text)
      };
    } catch (err) {
      var msg = err && err.message ? String(err.message) : String(err || '');
      if (/Editable CSS block markers not found/i.test(msg)) {
        return { found: true, css: String(text || '').trim() };
      }
      throw err;
    }
  };

  CSSBridge.prototype._extractEditablePageCustomCss = function (text) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    var body = this._extractEditableBodyByDirective(text, 'pageCustomCss');
    if (body != null) return body;
    body = this._extractEditableBodyByComment(text, 'pageCustomCss');
    if (body != null) return body;
    return String(text || '').trim();
  };

  CSSBridge.prototype._extractEditableMappedSettingsCss = function (text) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    var body = this._extractEditableBodyByDirective(text, 'mappedSettingsCss');
    if (body != null) return body;
    return this._extractEditableBodyByComment(text, 'mappedSettingsCss');
  };

  CSSBridge.prototype._normalizeMappedSettingsCssText = function (text) {
    return String(text == null ? '' : text)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(function (line) { return String(line || '').trim(); })
      .filter(Boolean)
      .join('\n');
  };

  CSSBridge.prototype._extractEditableGlobalClassCssBlocks = function (text) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    var out = [];
    var byRef = {};
    var order = [];
    var re = /@cm6gpt-editable-begin\s+globalClassCss\s+([A-Za-z0-9_-]+)\s*;([\s\S]*?)@cm6gpt-editable-end\s+globalClassCss\s+\1\s*;/g;
    var m;
    while ((m = re.exec(text))) {
      var ref = String(m[1] || '').trim();
      if (!ref) continue;
      var body = String(m[2] || '').replace(/^\n+/, '').replace(/\s+$/, '');
      if (!hasOwn(byRef, ref)) order.push(ref);
      byRef[ref] = body;
    }
    re = /\/\*\s*@cm6gpt-editable-begin\s+globalClassCss\s+([A-Za-z0-9_-]+)\s*\*\/([\s\S]*?)\/\*\s*@cm6gpt-editable-end\s+globalClassCss\s+\1\s*\*\//g;
    var m;
    while ((m = re.exec(text))) {
      ref = String(m[1] || '').trim();
      if (!ref) continue;
      body = String(m[2] || '').replace(/^\n+/, '').replace(/\s+$/, '');
      if (!hasOwn(byRef, ref)) order.push(ref);
      byRef[ref] = body;
    }
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      out.push({ ref: key, css: byRef[key] });
    }
    return out;
  };

  CSSBridge.prototype._assertLiteGlobalClassBlocksWritable = function (blocks, ctx) {
    blocks = Array.isArray(blocks) ? blocks : [];
    if (!blocks.length) return;
    if (!ctx || ctx.mode !== 'element' || !ctx.element || String(ctx.scope || 'self') !== 'self') {
      throw new Error('Global class blocks are unavailable outside Self scope in CM6GPT Lite');
    }
    if (!this._isClassOnlyFilter(this.propertyFilter)) {
      throw new Error('Global class blocks are unavailable outside the Class target in CM6GPT Lite');
    }
    if (blocks.length > 1) {
      throw new Error('Only the active global class block is editable in CM6GPT Lite');
    }
    var classTarget = this._getPrimaryGlobalClassTarget(ctx);
    var primaryRef = String(classTarget && classTarget.ref || '').trim();
    if (!primaryRef || !classTarget || classTarget.kind !== 'global') {
      throw new Error('Global class block unavailable: selected element has no active global class target');
    }
    var blockRef = String((blocks[0] && blocks[0].ref) || '').trim();
    if (!blockRef || blockRef !== String(primaryRef).trim()) {
      throw new Error('Global class block target does not match the active global class target in CM6GPT Lite');
    }
  };

  CSSBridge.prototype._escapeRegExp = function (value) {
    return String(value == null ? '' : value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  CSSBridge.prototype._extractEditableBodyByDirective = function (text, key) {
    key = String(key || '').trim();
    if (!key) return null;
    var escKey = this._escapeRegExp(key);
    var re = new RegExp('@cm6gpt-editable-begin\\s+' + escKey + '\\s*;([\\s\\S]*?)@cm6gpt-editable-end\\s+' + escKey + '\\s*;');
    var m = re.exec(String(text || ''));
    if (!m) return null;
    return String(m[1] || '').replace(/^\n+/, '').replace(/\s+$/, '');
  };

  CSSBridge.prototype._extractEditableBodyByComment = function (text, key) {
    key = String(key || '').trim();
    if (!key) return null;
    var escKey = this._escapeRegExp(key);
    var re = new RegExp('/\\*\\s*@cm6gpt-editable-begin\\s+' + escKey + '\\s*\\*/([\\s\\S]*?)/\\*\\s*@cm6gpt-editable-end\\s+' + escKey + '\\s*\\*/');
    var m = re.exec(String(text || ''));
    if (!m) return null;
    return String(m[1] || '').replace(/^\n+/, '').replace(/\s+$/, '');
  };

  CSSBridge.prototype._extractWriteBodyWithoutMarkers = function (text, preferredKey) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    preferredKey = String(preferredKey || '').trim();
    if (preferredKey) {
      var preferredBody = this._extractEditableBodyByDirective(text, preferredKey);
      if (preferredBody != null) return preferredBody.trim();
      preferredBody = this._extractEditableBodyByComment(text, preferredKey);
      if (preferredBody != null) return preferredBody.trim();
    }
    var lines = text.split('\n');
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '');
      var trimmed = line.trim();
      if (/^@cm6gpt-editable-(begin|end)\b/i.test(trimmed)) continue;
      if (/^\/\*\s*@cm6gpt-editable-(begin|end)\b[\s\S]*\*\/$/i.test(trimmed)) continue;
      kept.push(line);
    }
    return kept.join('\n').trim();
  };

  CSSBridge.prototype._applyEditableGlobalClassCssFromSource = function (source, ctx) {
    var summary = {
      supported: false,
      attempted: false,
      blockCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      reason: ''
    };
    if (!this.api || typeof this.api.updateGlobalClassCustomCss !== 'function') {
      summary.reason = 'api-missing';
      return summary;
    }
    summary.supported = true;

    var blocks = this._extractEditableGlobalClassCssBlocks(source);
    summary.blockCount = blocks.length;
    if (!blocks.length) {
      summary.reason = 'no-editable-global-class-blocks';
      return summary;
    }

    this._assertLiteGlobalClassBlocksWritable(blocks, ctx);
    summary.attempted = true;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var ref = String(block && block.ref || '').trim();
      if (!ref) continue;

      var res = null;
      try {
        res = this.api.updateGlobalClassCustomCss(ref, block.css, { deferUiRefresh: true });
      } catch (e) {
        res = { ok: false, reason: e && e.message ? e.message : String(e) };
      }

      if (!res || !res.ok) {
        summary.failedCount++;
        continue;
      }

      if (res.changed) {
        summary.changedCount++;
      } else {
        summary.unchangedCount++;
      }
    }

    if (summary.failedCount > 0) {
      summary.reason = summary.changedCount > 0 ? 'partial-failure' : 'failed';
    } else {
      summary.reason = summary.changedCount > 0 ? 'updated' : 'already-synced';
    }
    return summary;
  };

  CSSBridge.prototype._parseClassLifecycleCommands = function (text) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    var out = [];
    var re = /^\s*\/\*\s*@cm6gpt-class\s+(detach|delete-global|delete-global-force)\s+([A-Za-z0-9_-]+)\s*\*\/\s*$/gm;
    var m;
    while ((m = re.exec(text))) {
      out.push({
        op: String(m[1] || '').toLowerCase(),
        target: String(m[2] || '').trim(),
        raw: String(m[0] || '').trim()
      });
      if (out.length > 8) break;
    }
    return out;
  };

  CSSBridge.prototype._runClassLifecycleCommandsFromSource = function (source, ctx) {
    if (!this.api || !ctx || ctx.mode !== 'element' || !ctx.element) return { ran: false };
    var commands = this._parseClassLifecycleCommands(source);
    if (!commands.length) return { ran: false };
    throw new Error('Class lifecycle commands are unavailable in CM6GPT Lite');
  };

  CSSBridge.prototype._normalizeEditableCustomCssForElement = function (cssText, ctx) {
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!raw) return { css: '', autoWrapped: false };
    var emptyRootRule = this._stripEmptyRootSelectorSkeleton(raw, ctx);
    if (emptyRootRule !== null) return { css: '', autoWrapped: false };
    if (/[{}]/.test(raw)) return { css: raw, autoWrapped: false };
    if (!this._looksLikeDeclarationList(raw)) return { css: raw, autoWrapped: false };

    var rootSelector = this._getBricksRootSelectorForElement(ctx && ctx.element, ctx && ctx.id);
    if (!rootSelector) return { css: raw, autoWrapped: false };

    var body = raw.split('\n').map(function (line) { return line.trim(); }).filter(Boolean).join('\n  ');
    return {
      css: rootSelector + ' {\n  ' + body + '\n}',
      autoWrapped: true
    };
  };

  CSSBridge.prototype._normalizeEditableCustomCssForPage = function (cssText) {
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n');
    raw = this._stripCssComments(raw).trim();
    return { css: raw, autoWrapped: false };
  };

  CSSBridge.prototype._stripCssComments = function (cssText) {
    var text = String(cssText == null ? '' : cssText);
    if (!text) return '';
    var out = '';
    var inComment = false;
    var quote = '';
    var escaped = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var next = i + 1 < text.length ? text.charAt(i + 1) : '';

      if (inComment) {
        if (ch === '*' && next === '/') {
          inComment = false;
          i++;
          continue;
        }
        if (ch === '\n' || ch === '\r') out += ch;
        continue;
      }

      if (quote) {
        out += ch;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quote) quote = '';
        continue;
      }

      if (ch === '/' && next === '*') {
        inComment = true;
        i++;
        continue;
      }

      if (ch === '"' || ch === '\'') {
        quote = ch;
        out += ch;
        continue;
      }

      out += ch;
    }

    return out.replace(/\n{3,}/g, '\n\n');
  };

  CSSBridge.prototype._normalizeCssTextForCompare = function (cssText) {
    return String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
  };

  CSSBridge.prototype._capturePageRenderOverride = function (ctx, sourceCss, appliedPageCss) {
    if (!ctx || ctx.mode !== 'page') {
      this._clearPageRenderOverride();
      return;
    }
    this._pageRenderOverride = {
      ctxKey: this._contextKey(ctx),
      viewMode: String(this.viewMode || ''),
      lensMode: this._normalizeCssLensMode(this.cssLensMode),
      filterKey: this._propertyFilterKey(this.propertyFilter),
      sourceCss: String(sourceCss == null ? '' : sourceCss).replace(/\r\n/g, '\n'),
      appliedPageCss: this._normalizeCssTextForCompare(this._stripCssComments(appliedPageCss))
    };
  };

  CSSBridge.prototype._captureElementRenderOverride = function (ctx, sourceCss, appliedElementCss) {
    if (!ctx || ctx.mode !== 'element' || String(ctx.scope || 'self') === 'children' || !ctx.element) {
      this._elementRenderOverride = null;
      return;
    }
    var currentCtxKey = this._contextKey(ctx);
    var renderedCss = appliedElementCss;
    if (renderedCss == null) {
      renderedCss = this._buildElementCanonicalSnapshot(ctx.element, ctx.id, {
        contextInfoKey: currentCtxKey
      });
    }
    this._elementRenderOverride = {
      ctxKey: currentCtxKey,
      viewMode: String(this.viewMode || ''),
      lensMode: this._normalizeCssLensMode(this.cssLensMode),
      filterKey: this._propertyFilterKey(this.propertyFilter),
      sourceCss: String(sourceCss == null ? '' : sourceCss).replace(/\r\n/g, '\n'),
      appliedElementCss: this._normalizeCssTextForCompare(this._stripCssComments(renderedCss))
    };
  };

  CSSBridge.prototype._formatCssDeclarationLines = function (bodyText) {
    bodyText = String(bodyText == null ? '' : bodyText).replace(/\r\n/g, '\n').trim();
    if (!bodyText) return [];

    var chunks = [];
    if (this.api && typeof this.api._splitCssDeclarations === 'function') {
      try {
        chunks = this.api._splitCssDeclarations(bodyText);
      } catch (eSplit) { _warn('_formatCssDeclarationLines', eSplit); }
    }
    if (!chunks || !chunks.length) {
      var buf = '';
      var quote = '';
      var esc = false;
      var parenDepth = 0;
      for (var ci = 0; ci < bodyText.length; ci++) {
        var ch = bodyText.charAt(ci);
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
          if (buf.trim()) chunks.push(buf.trim());
          buf = '';
          continue;
        }
        buf += ch;
      }
      if (buf.trim()) chunks.push(buf.trim());
      if (!chunks.length) {
        chunks = bodyText.split('\n');
      }
    }

    var out = [];
    for (var i = 0; i < chunks.length; i++) {
      var line = String(chunks[i] == null ? '' : chunks[i]).trim();
      if (!line) continue;
      if (line.charAt(0) === '@' || line.indexOf('{') >= 0 || line.indexOf('}') >= 0) {
        out.push(line);
        continue;
      }
      if (!/;\s*$/.test(line)) line += ';';
      out.push(line);
    }
    return out;
  };

  CSSBridge.prototype._formatCssRuleBodyText = function (bodyText) {
    var lines = this._formatCssDeclarationLines(bodyText);
    if (!lines.length) return String(bodyText == null ? '' : bodyText).trim();
    return lines.join('\n');
  };

  CSSBridge.prototype._extractCssRuleBodyText = function (cssText) {
    cssText = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!cssText) return '';
    var openIdx = cssText.indexOf('{');
    var closeIdx = cssText.lastIndexOf('}');
    if (openIdx < 0 || closeIdx <= openIdx) return cssText;
    return cssText.slice(openIdx + 1, closeIdx).trim();
  };

  CSSBridge.prototype._formatCssRuleText = function (selector, bodyText) {
    selector = String(selector || '').trim();
    if (!selector) return '';
    bodyText = this._formatCssRuleBodyText(bodyText);
    if (!bodyText) return this._buildEmptyRuleForSelector(selector);
    return selector + ' {\n' + this._indentCssBlock(bodyText, '  ') + '\n}';
  };

  CSSBridge.prototype._rewriteCssRuleSelector = function (cssText, nextSelector) {
    nextSelector = String(nextSelector || '').trim();
    if (!nextSelector) return '';
    return this._formatCssRuleText(nextSelector, this._extractCssRuleBodyText(cssText));
  };

  CSSBridge.prototype._replaceFirstCssRuleForSelector = function (cssText, selector, replacementCss) {
    cssText = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n');
    selector = String(selector || '').trim();
    replacementCss = String(replacementCss == null ? '' : replacementCss).replace(/\r\n/g, '\n').trim();
    if (!cssText || !selector || !replacementCss) return cssText;
    var escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp(escSel + '\\s*\\{([\\s\\S]*?)\\}');
    if (!re.test(cssText)) return cssText;
    return cssText.replace(re, replacementCss);
  };

  CSSBridge.prototype._getPageParitySelectionContext = function () {
    if (!this.api) return null;
    var ctx = null;
    if (typeof this.api.getScopedSelectionContext === 'function') {
      try { ctx = this.api.getScopedSelectionContext('self'); } catch (eScoped) { _warn('_getPageParitySelectionContext', eScoped);  ctx = null; }
      if (ctx && ctx.mode === 'element' && ctx.element) return ctx;
    }
    if (typeof this.api.getSelectionContext !== 'function') return null;
    try { ctx = this.api.getSelectionContext(); } catch (eCtx) { _warn('_getPageParitySelectionContext', eCtx);  ctx = null; }
    if (!ctx || ctx.mode !== 'element' || !ctx.element) return null;
    return ctx;
  };

  CSSBridge.prototype._getPageParitySelectorState = function () {
    var baseCtx = this._getPageParitySelectionContext();
    if (!baseCtx || !baseCtx.element) return null;

    var filter = this._normalizePropertyFilter(this.propertyFilter);
    var rootSelector = this._getBricksRootSelectorForElement(baseCtx.element, baseCtx.id, {
      propertyFilter: { class: false, id: true }
    });
    var targetSelector = rootSelector;

    if (filter.class && !filter.id) {
      var classTarget = this._getPrimaryGlobalClassTarget(baseCtx);
      if (classTarget && classTarget.label) {
        targetSelector = String(classTarget.label || '').trim() || targetSelector;
      }
    }

    if (!targetSelector) targetSelector = rootSelector;
    if (!targetSelector || !rootSelector) return null;
    return {
      ctx: baseCtx,
      rootSelector: rootSelector,
      targetSelector: targetSelector
    };
  };

  CSSBridge.prototype._syncPageCssIntoSelectedElementUi = function (pageCss) {
    var state = this._getPageParitySelectorState();
    if (!state || !state.ctx || !state.ctx.element) return null;
    if (!this.api || typeof this.api.syncActiveSelectionUiFromCssPreviewByDom !== 'function') return null;

    var extractedRule = this._extractFirstCssRuleForSelector(pageCss, state.targetSelector);
    if (!extractedRule && state.targetSelector !== state.rootSelector) {
      extractedRule = this._extractFirstCssRuleForSelector(pageCss, state.rootSelector);
    }
    if (!extractedRule) return null;

    var rootRule = state.targetSelector === state.rootSelector
      ? extractedRule
      : this._rewriteCssRuleSelector(extractedRule, state.rootSelector);
    if (!rootRule) return null;

    try {
      return this.api.syncActiveSelectionUiFromCssPreviewByDom(state.ctx.element, rootRule, {
        deferUiRefresh: true,
        sourceSelector: state.targetSelector
      });
    } catch (eSync) {
      return {
        ok: false,
        changed: false,
        reason: eSync && eSync.message ? eSync.message : String(eSync)
      };
    }
  };

  CSSBridge.prototype._buildPageSelectionParityRenderOverride = function (ctx, cssText) {
    if (!ctx || ctx.mode !== 'page') return null;
    if (this._dirty || this._applying) return null;

    var state = this._getPageParitySelectorState();
    if (!state) return null;

    var currentPageCss = this._buildPageWriteSnapshot();
    var existingTargetRule = this._extractFirstCssRuleForSelector(currentPageCss, state.targetSelector);
    if (!existingTargetRule) return null;

    var selectedWriteCss = this._buildElementWriteSnapshot(state.ctx.element, state.ctx.id);
    if (!selectedWriteCss) return null;

    var targetWriteCss = state.targetSelector === state.rootSelector
      ? selectedWriteCss
      : this._rewriteCssRuleSelector(selectedWriteCss, state.targetSelector);
    if (!targetWriteCss) return null;

    var summaryTargetRule = this._extractFirstCssRuleForSelector(cssText, state.targetSelector);
    if (!summaryTargetRule) return null;
    if (
      this._normalizeCssTextForCompare(this._stripCssComments(summaryTargetRule))
      === this._normalizeCssTextForCompare(this._stripCssComments(targetWriteCss))
    ) {
      return null;
    }

    return this._replaceFirstCssRuleForSelector(cssText, state.targetSelector, targetWriteCss);
  };

  CSSBridge.prototype._resolvePageRenderOverrideCss = function (ctx, filterKey) {
    var override = this._pageRenderOverride;
    if (!override) return null;
    if (!ctx || ctx.mode !== 'page') {
      this._clearPageRenderOverride();
      return null;
    }
    var currentCtxKey = this._contextKey(ctx);
    var currentViewMode = String(this.viewMode || '');
    var currentLensMode = this._normalizeCssLensMode(this.cssLensMode);
    var currentFilterKey = String(filterKey || '');
    if (
      override.ctxKey !== currentCtxKey ||
      override.viewMode !== currentViewMode ||
      override.lensMode !== currentLensMode ||
      override.filterKey !== currentFilterKey
    ) {
      this._clearPageRenderOverride();
      return null;
    }
    var currentPageCss = this._normalizeCssTextForCompare(this._stripCssComments(this._buildPageWriteSnapshot()));
    if (currentPageCss !== String(override.appliedPageCss || '')) {
      this._clearPageRenderOverride();
      return null;
    }
    return String(override.sourceCss || '');
  };

  CSSBridge.prototype._resolveElementRenderOverrideCss = function (ctx, filterKey) {
    var override = this._elementRenderOverride;
    if (!override) return null;
    if (!ctx || ctx.mode !== 'element' || String(ctx.scope || 'self') === 'children' || !ctx.element) {
      this._elementRenderOverride = null;
      return null;
    }
    var currentCtxKey = this._contextKey(ctx);
    var currentViewMode = String(this.viewMode || '');
    var currentLensMode = this._normalizeCssLensMode(this.cssLensMode);
    var currentFilterKey = String(filterKey || '');
    if (
      override.ctxKey !== currentCtxKey ||
      override.viewMode !== currentViewMode ||
      override.lensMode !== currentLensMode ||
      override.filterKey !== currentFilterKey
    ) {
      this._elementRenderOverride = null;
      return null;
    }
    var currentElementCss = this._normalizeCssTextForCompare(
      this._stripCssComments(
        this._buildElementCanonicalSnapshot(ctx.element, ctx.id, {
          contextInfoKey: currentCtxKey
        })
      )
    );
    if (currentElementCss !== String(override.appliedElementCss || '')) {
      this._elementRenderOverride = null;
      return null;
    }
    return String(override.sourceCss || '');
  };

  CSSBridge.prototype._buildSyncedCustomCssSnapshot = function (customCss, mappedCss, rootSelector) {
    var rawCustom = String(customCss == null ? '' : customCss).replace(/\r\n/g, '\n').trim();
    var rawMapped = String(mappedCss == null ? '' : mappedCss).replace(/\r\n/g, '\n').trim();
    var root = String(rootSelector || '').trim();
    if (!rawMapped) return rawCustom;

    var mappedDeclText = String(rawMapped || '').trim();
    if (!mappedDeclText) return rawCustom;

    var self = this;
    var parseDeclEntries = function (text) {
      var src = String(text == null ? '' : text);
      var chunks = [];
      if (self.api && typeof self.api._splitCssDeclarations === 'function') {
        try {
          chunks = self.api._splitCssDeclarations(src);
        } catch (eSplit) { _warn('parseDeclEntries', eSplit); }
      }
      if (!chunks || !chunks.length) {
        chunks = src.split('\n');
      }
      var entries = [];
      for (var i = 0; i < chunks.length; i++) {
        var line = String(chunks[i] || '').trim();
        if (!line) continue;
        if (/^\/\*/.test(line) || /^\*\//.test(line)) continue;
        if (line.indexOf('{') >= 0 || line.indexOf('}') >= 0) continue;
        if (/^@/.test(line)) continue;
        var colonIdx = line.indexOf(':');
        if (colonIdx < 1) continue;
        var propRaw = String(line.slice(0, colonIdx) || '').trim();
        var propKey = propRaw.toLowerCase();
        var value = String(line.slice(colonIdx + 1) || '').trim().replace(/;$/, '').trim();
        if (!propKey) continue;
        if (!value && value !== '0') continue;
        entries.push({
          propRaw: propRaw,
          propKey: propKey,
          value: value
        });
      }
      return entries;
    };

    var expandGapRenderValue = function (rawValue) {
      var raw = String(rawValue == null ? '' : rawValue).trim();
      raw = raw.replace(/\s*!important\s*$/i, '').trim();
      if (!raw) return null;
      if (/^(inherit|initial|unset|revert|revert-layer)$/i.test(raw)) {
        return { row: raw, col: raw };
      }
      if (self.api && typeof self.api._expandTwoValueCssShorthandValues === 'function') {
        try {
          var viaApi = self.api._expandTwoValueCssShorthandValues(raw);
          if (viaApi && viaApi.start && viaApi.end) {
            return { row: String(viaApi.start), col: String(viaApi.end) };
          }
        } catch (eGapApi) { _warn('expandGapRenderValue', eGapApi); }
      }
      var values = raw.split(/\s+/).filter(Boolean);
      if (!values.length) return null;
      if (values.length === 1) return { row: values[0], col: values[0] };
      return { row: values[0], col: values[1] };
    };

    var compactMappedEntries = function (entries) {
      entries = Array.isArray(entries) ? entries.slice() : [];
      if (!entries.length) return entries;

      var entryByProp = {};
      for (var i = 0; i < entries.length; i++) {
        entryByProp[entries[i].propKey] = entries[i];
      }

      var gapEntry = entryByProp.gap || entryByProp['grid-gap'] || null;
      if (!gapEntry) return entries;

      var expandedGap = expandGapRenderValue(gapEntry.value);
      if (!expandedGap) return entries;

      return entries.filter(function (entry) {
        if (!entry || !entry.propKey) return false;
        if (entry.propKey === 'row-gap') {
          return String(entry.value || '').trim() !== String(expandedGap.row || '').trim();
        }
        if (entry.propKey === 'column-gap') {
          return String(entry.value || '').trim() !== String(expandedGap.col || '').trim();
        }
        return true;
      });
    };

    var mergeDeclLinesPreserveOrder = function (baseText, incomingText) {
      var baseEntries = parseDeclEntries(baseText);
      var incomingEntries = compactMappedEntries(parseDeclEntries(incomingText));
      if (!incomingEntries.length) {
        return baseEntries.map(function (entry) {
          return entry.propRaw + ': ' + entry.value + ';';
        });
      }

      var incomingByProp = {};
      for (var i = 0; i < incomingEntries.length; i++) {
        incomingByProp[incomingEntries[i].propKey] = incomingEntries[i];
      }

      for (var j = 0; j < baseEntries.length; j++) {
        var baseEntry = baseEntries[j];
        var mapped = incomingByProp[baseEntry.propKey];
        if (!mapped) continue;
        baseEntry.value = mapped.value;
        delete incomingByProp[baseEntry.propKey];
      }

      for (i = 0; i < incomingEntries.length; i++) {
        var pending = incomingByProp[incomingEntries[i].propKey];
        if (!pending) continue;
        baseEntries.push({
          propRaw: pending.propRaw,
          propKey: pending.propKey,
          value: pending.value
        });
        delete incomingByProp[incomingEntries[i].propKey];
      }

      return baseEntries.map(function (entry) {
        return entry.propRaw + ': ' + entry.value + ';';
      });
    };

    var formatRule = function (selector, lines) {
      selector = String(selector || '').trim();
      if (!selector) return '';
      lines = Array.isArray(lines) ? lines.filter(Boolean) : [];
      if (!lines.length) return selector + ' {\n\n}';
      return selector + ' {\n  ' + lines.join('\n  ') + '\n}';
    };

    var base = rawCustom;
    var mappedLines = mergeDeclLinesPreserveOrder('', mappedDeclText);
    if (!mappedLines.length) return base || rawCustom;

    if (!root) {
      if (!base) return mappedLines.join('\n');
      if (this._looksLikeDeclarationList(base)) {
        return mergeDeclLinesPreserveOrder(base, mappedDeclText).join('\n');
      }
      return (base + '\n' + mappedLines.join('\n')).trim();
    }

    if (!base) {
      return formatRule(root, mappedLines);
    }

    if (base.indexOf('{') === -1 && this._looksLikeDeclarationList(base)) {
      return formatRule(root, mergeDeclLinesPreserveOrder(base, mappedDeclText));
    }

    var escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var rootOnlyRe = new RegExp('^\\s*' + escapedRoot + '\\s*\\{([\\s\\S]*)\\}\\s*$');
    var rootOnlyMatch = rootOnlyRe.exec(base);
    if (rootOnlyMatch) {
      return formatRule(root, mergeDeclLinesPreserveOrder(rootOnlyMatch[1] || '', mappedDeclText));
    }

    var rootRuleRe = new RegExp(escapedRoot + '\\s*\\{([\\s\\S]*?)\\}');
    var rootRuleMatch = rootRuleRe.exec(base);
    if (rootRuleMatch) {
      var replacement = formatRule(root, mergeDeclLinesPreserveOrder(rootRuleMatch[1] || '', mappedDeclText));
      return base.slice(0, rootRuleMatch.index) + replacement + base.slice(rootRuleMatch.index + rootRuleMatch[0].length);
    }

    return (base + '\n\n' + formatRule(root, mappedLines)).trim();
  };

  CSSBridge.prototype._extractFirstCssRuleForSelector = function (cssText, selector) {
    cssText = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n');
    selector = String(selector || '').trim();
    if (!cssText || !selector) return '';
    var escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp(escSel + '\\s*\\{([\\s\\S]*?)\\}', 'g');
    var m;
    while ((m = re.exec(cssText))) {
      var body = String(m[1] || '').trim();
      if (!body) continue;
      var formatted = this._formatCssRuleText(selector, body);
      if (!formatted) continue;
      return formatted;
    }
    return '';
  };

  CSSBridge.prototype._isEditablePageCustomCssReadyForAutoApply = function (cssText) {
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!raw) return { ok: true };

    if (!this._hasBalancedCssDelimiters(raw)) {
      return { ok: false, reason: 'incomplete CSS (unclosed quote/bracket/function)' };
    }

    // Page CSS should contain full rules / at-rules. If it's only a partial declaration, wait.
    if (!/[{}]/.test(raw)) {
      if (this._looksLikeDeclarationList(raw)) {
        if (!this._looksLikeCompleteDeclarationList(raw)) {
          return { ok: false, reason: 'incomplete declaration value (typing...)' };
        }
        return { ok: false, reason: 'page CSS expects full rule (e.g. body { ... })' };
      }
      return { ok: false, reason: 'incomplete rule (typing...)' };
    }

    var blockCheck = this._hasObviousIncompleteDeclarationInRuleBlock(raw);
    if (!blockCheck.ok) return blockCheck;
    return { ok: true };
  };

  CSSBridge.prototype._isEditableCustomCssReadyForAutoApply = function (cssText, ctx) {
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!raw) return { ok: true };
    if (this._stripEmptyRootSelectorSkeleton(raw, ctx) !== null) return { ok: true };

    if (!this._hasBalancedCssDelimiters(raw)) {
      return { ok: false, reason: 'incomplete CSS (unclosed quote/bracket/function)' };
    }

    if (!/[{}]/.test(raw)) {
      if (!this._looksLikeDeclarationList(raw)) {
        return { ok: false, reason: 'incomplete declaration (typing...)' };
      }
      if (!this._looksLikeCompleteDeclarationList(raw)) {
        return { ok: false, reason: 'incomplete declaration value (typing...)' };
      }
      return { ok: true };
    }

    var blockCheck = this._hasObviousIncompleteDeclarationInRuleBlock(raw);
    if (!blockCheck.ok) return blockCheck;
    return { ok: true };
  };

  CSSBridge.prototype._isEditableMappedSettingsCssReadyForAutoApply = function (cssText) {
    var raw = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!raw) return { ok: true };
    if (!this._hasBalancedCssDelimiters(raw)) {
      return { ok: false, reason: 'incomplete mapped CSS (unclosed quote/bracket/function)' };
    }
    if (/[{}]/.test(raw)) {
      if (this.api && typeof this.api.validateMappedSettingsCssInput === 'function') {
        return this.api.validateMappedSettingsCssInput(raw);
      }
      return { ok: false, reason: 'mapped settings block supports declarations + @bricks-breakpoint blocks only' };
    }
    if (!this._looksLikeDeclarationList(raw)) {
      return { ok: false, reason: 'incomplete mapped declaration (typing...)' };
    }
    if (!this._looksLikeCompleteDeclarationList(raw)) {
      return { ok: false, reason: 'incomplete mapped declaration value (typing...)' };
    }
    return { ok: true };
  };

  CSSBridge.prototype._hasBalancedCssDelimiters = function (cssText) {
    var s = String(cssText || '');
    var paren = 0;
    var bracket = 0;
    var brace = 0;
    var quote = '';
    var esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
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
      if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket--;
      else if (ch === '{') brace++;
      else if (ch === '}') brace--;
      if (paren < 0 || bracket < 0 || brace < 0) return false;
    }
    return !quote && paren === 0 && bracket === 0 && brace === 0;
  };

  CSSBridge.prototype._looksLikeCompleteDeclarationList = function (cssText) {
    var lines = String(cssText || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '').trim();
      if (!line) continue;
      if (/^\/\*/.test(line) || /^\*\//.test(line)) continue;
      if (!/^(--[\w-]+|[\w-]+)\s*:/.test(line)) return false;
      if (!this._isLikelyCompleteDeclarationLine(line)) return false;
    }
    return true;
  };

  CSSBridge.prototype._hasObviousIncompleteDeclarationInRuleBlock = function (cssText) {
    var lines = String(cssText || '').split('\n');
    var depth = 0;
    for (var i = 0; i < lines.length; i++) {
      var rawLine = String(lines[i] || '');
      var line = rawLine.trim();
      if (!line) continue;
      if (/^\/\*/.test(line) || /^\*\//.test(line)) continue;

      var openCount = (line.match(/\{/g) || []).length;
      var closeCount = (line.match(/\}/g) || []).length;
      var declarationDepth = depth;

      if (declarationDepth > 0) {
        var braceOnly = /^[{}]+$/.test(line);
        var nestedStart = /\{\s*$/.test(line);
        if (!braceOnly && !nestedStart && line.indexOf(':') !== -1) {
          if (!this._isLikelyCompleteDeclarationLine(line)) {
            return { ok: false, reason: 'incomplete declaration value (typing...)' };
          }
        } else if (!braceOnly && !nestedStart && line.indexOf(':') === -1) {
          return { ok: false, reason: 'incomplete declaration (typing...)' };
        }
      }

      depth += openCount - closeCount;
      if (depth < 0) {
        return { ok: false, reason: 'invalid CSS block structure' };
      }
    }
    return { ok: true };
  };

  CSSBridge.prototype._isLikelyCompleteDeclarationLine = function (line) {
    line = String(line || '').trim();
    var colonIdx = line.indexOf(':');
    if (colonIdx <= 0) return false;
    var prop = line.slice(0, colonIdx).trim();
    if (!prop) return false;
    var value = line.slice(colonIdx + 1).trim();
    if (!value) return false;
    value = value.replace(/;$/, '').trim();
    if (!value) return false;
    if (/[:#,(\-]$/.test(value)) return false;
    return true;
  };

  CSSBridge.prototype._looksLikeDeclarationList = function (cssText) {
    var lines = String(cssText || '').split('\n');
    var meaningful = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '').trim();
      if (!line) continue;
      if (/^\/\*/.test(line) || /^\*\//.test(line)) continue;
      if (/^@/.test(line)) return false;
      // CSS property declarations incl. custom properties.
      if (!/^(--[\w-]+|[\w-]+)\s*:/.test(line)) return false;
      meaningful++;
    }
    return meaningful > 0;
  };

  CSSBridge.prototype._escapeCssIdentifier = function (value) {
    value = String(value == null ? '' : value);
    if (!value) return '';
    if (w.CSS && typeof w.CSS.escape === 'function') {
      try { return w.CSS.escape(value); } catch (e) { _warn('_escapeCssIdentifier', e); }
    }
    var escaped = value.replace(/[^A-Za-z0-9_-]/g, '\\$&');
    if (/^[0-9]/.test(escaped)) {
      escaped = '\\3' + escaped.charAt(0) + ' ' + escaped.slice(1);
    }
    return escaped;
  };

  CSSBridge.prototype._getBricksRootSelectorCandidates = function (el, id) {
    var out = [];
    var seen = {};
    if (!el) return out;

    var domId = '';
    try { domId = String(el.getAttribute('data-id') || ''); } catch (e) { _warn('_getBricksRootSelectorCandidates', e);  domId = ''; }
    var fallbackId = domId || String(id || '');
    if (fallbackId) {
      var idSelector = BRICKS_ELEMENT_PREFIX + fallbackId;
      out.push(idSelector);
      seen[idSelector] = true;
    }

    var userClasses = this._getUserClasses(el);
    if (userClasses.length) {
      for (var c = 0; c < userClasses.length; c++) {
        var classSelector = '.' + this._escapeCssIdentifier(userClasses[c]);
        if (classSelector && !seen[classSelector]) {
          out.push(classSelector);
          seen[classSelector] = true;
        }
      }
    }

    return out;
  };

  CSSBridge.prototype._getBricksRootSelectorForElement = function (el, id, opts) {
    var selectors = this._getBricksRootSelectorCandidates(el, id);
    if (!selectors.length) return '';
    var filter = this._normalizePropertyFilter(
      opts && opts.propertyFilter ? opts.propertyFilter : this.propertyFilter
    );

    if (filter.class && !filter.id) {
      for (var i = 0; i < selectors.length; i++) {
        if (selectors[i] && selectors[i].charAt(0) === '.') return selectors[i];
      }
    }
    for (var j = 0; j < selectors.length; j++) {
      if (selectors[j] && selectors[j].charAt(0) === '#') return selectors[j];
    }
    return selectors[0];
  };

  CSSBridge.prototype._stripEmptyRootSelectorSkeleton = function (raw, ctx) {
    var rootSelectors = this._getBricksRootSelectorCandidates(ctx && ctx.element, ctx && ctx.id);
    if (!rootSelectors.length) return null;
    var trimmed = String(raw || '').trim();
    for (var i = 0; i < rootSelectors.length; i++) {
      var escaped = rootSelectors[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('^' + escaped + '\\s*\\{\\s*\\}$');
      if (re.test(trimmed)) return '';
    }
    return null;
  };

  CSSBridge.prototype._stripEmptySelectorSkeleton = function (raw, selector) {
    var trimmed = String(raw || '').trim();
    selector = String(selector || '').trim();
    if (!selector) return null;
    var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('^' + escaped + '\\s*\\{\\s*\\}$');
    if (re.test(trimmed)) return '';
    return null;
  };

  CSSBridge.prototype._buildEmptyRuleForSelector = function (selector) {
    selector = String(selector || '').trim();
    if (!selector) return '';
    return selector + ' {\n\n}';
  };

  CSSBridge.prototype._selectorMatchesStateFocus = function (selector) {
    selector = String(selector || '').trim();
    if (!selector) return false;
    return /:(?:hover|focus|focus-within|focus-visible|active|visited|link|target|checked|disabled|enabled|required|optional|valid|invalid|placeholder-shown)\b/i.test(selector)
      || /::?(?:before|after|first-letter|first-line|placeholder|selection|marker|backdrop)\b/i.test(selector);
  };

  CSSBridge.prototype._filterSnapshotByStateBreakpoint = function (cssText, filter) {
    cssText = String(cssText == null ? '' : cssText).replace(/\r\n/g, '\n').trim();
    if (!cssText) return cssText;
    filter = this._normalizePropertyFilter(filter || this.propertyFilter);
    var wantState = !!filter.state;
    var wantBreakpoint = !!filter.breakpoint;
    if (!wantState && !wantBreakpoint) return cssText;

    var self = this;
    var lines = cssText.split('\n');
    var out = [];
    var block = [];
    var header = '';
    var depth = 0;

    function countChar(line, ch) {
      var total = 0;
      for (var i = 0; i < line.length; i++) {
        if (line.charAt(i) === ch) total++;
      }
      return total;
    }

    function shouldKeepBlock(blockHeader) {
      blockHeader = String(blockHeader || '').trim();
      if (!blockHeader) return false;
      var isBreakpointBlock = /^@bricks-breakpoint\b/i.test(blockHeader) || /^@media\b/i.test(blockHeader);
      var isStateBlock = self._selectorMatchesStateFocus(blockHeader);
      if (wantBreakpoint && isBreakpointBlock) return true;
      if (wantState && isStateBlock) return true;
      return false;
    }

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      var line = lines[lineIndex];
      var opens = countChar(line, '{');
      var closes = countChar(line, '}');
      if (depth === 0 && opens > 0) {
        block = [line];
        header = String(line.split('{')[0] || '').trim();
        depth = opens - closes;
        if (depth <= 0) {
          if (shouldKeepBlock(header)) out.push(line);
          block = [];
          header = '';
          depth = 0;
        }
        continue;
      }
      if (depth > 0) {
        block.push(line);
        depth += (opens - closes);
        if (depth <= 0) {
          if (shouldKeepBlock(header)) {
            if (out.length && out[out.length - 1] !== '') out.push('');
            for (var bi = 0; bi < block.length; bi++) out.push(block[bi]);
          }
          block = [];
          header = '';
          depth = 0;
        }
      }
    }

    if (!out.length) {
      return '/* CM6GPT: no state/breakpoint blocks matched current filter */';
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  CSSBridge.prototype._buildElementMinimalEditableSnapshot = function (el, id, opts) {
    if (!el) return '/* CM6GPT: no selected element */';
    opts = opts || {};

    var resolvedId = String(id || '');
    if (!resolvedId) {
      resolvedId = this._resolveElementIdFromDom(el, '');
    }

    var propertyFilter = this._normalizePropertyFilter(
      opts && opts.propertyFilter ? opts.propertyFilter : this.propertyFilter
    );

    var model = opts.model || null;
    if (!model && this.api && typeof this.api.getElementModelByDom === 'function') {
      var resolved = this.api.getElementModelByDom(el);
      if (resolved && resolved.model) model = resolved.model;
      if (!resolvedId && resolved && resolved.id) {
        resolvedId = String(resolved.id || '');
      }
    }

    var analysis = opts.analysis || null;
    if (!analysis && this.api && typeof this.api.getElementAnalysisById === 'function') {
      analysis = this.api.getElementAnalysisById(resolvedId, el);
    }

    var domDataId = '';
    var domScriptId = '';
    var domComponentId = '';
    var domComponentInstanceId = '';
    if (el && typeof el.getAttribute === 'function') {
      domDataId = String(el.getAttribute('data-id') || '');
      domScriptId = String(el.getAttribute('data-script-id') || '');
      domComponentId = String(el.getAttribute('data-component') || '');
      domComponentInstanceId = String(el.getAttribute('data-component-instance') || '');
    }

    // Minimal lens should still mirror editable Bricks CSS sources (mapped/native + custom),
    // only with a compact selector-focused output.
    var synced = this._buildElementCanonicalSnapshotCompact({
      el: el,
      id: resolvedId,
      selector: this._selectorFor(el, resolvedId),
      analysis: analysis,
      model: model,
      propertyFilter: propertyFilter,
      contextInfoKey: String(opts.contextInfoKey || ('element:' + resolvedId)),
      domDataId: domDataId,
      domScriptId: domScriptId,
      domComponentId: domComponentId,
      domComponentInstanceId: domComponentInstanceId
    });
    if (String(synced || '').trim()) {
      return String(synced || '').trim();
    }

    var includeClassBlocks = !!propertyFilter.class;
    var includeIdBlocks = !!propertyFilter.id;

    var selectors = [];
    var seen = {};
    var addSelector = function (sel) {
      sel = String(sel || '').trim();
      if (!sel || seen[sel]) return;
      seen[sel] = true;
      selectors.push(sel);
    };

    var userClasses = this._getUserClasses(el);
    if (includeClassBlocks && userClasses.length) {
      for (var uc = 0; uc < userClasses.length; uc++) {
        addSelector('.' + this._escapeCssIdentifier(userClasses[uc]));
      }
    }

    if (includeIdBlocks) {
      var idSelector = this._getBricksRootSelectorForElement(el, resolvedId, {
        propertyFilter: { class: false, id: true }
      });
      addSelector(idSelector);
    }

    if (!selectors.length) {
      addSelector(this._selectorFor(el, resolvedId));
    }

    var inlineDecls = [];
    var inlineStyle = (el.getAttribute && el.getAttribute('style')) || '';
    if (String(inlineStyle || '').trim()) {
      String(inlineStyle).split(';').forEach(function (decl) {
        var d = String(decl || '').trim();
        if (!d) return;
        if (d.charAt(d.length - 1) !== ';') d += ';';
        inlineDecls.push(d);
      });
    }

    var out = [];
    for (var i = 0; i < selectors.length; i++) {
      out.push(selectors[i] + ' {');
      if (i === 0 && inlineDecls.length) {
        for (var j = 0; j < inlineDecls.length; j++) {
          out.push('  ' + inlineDecls[j]);
        }
      } else {
        out.push('');
      }
      out.push('}');
      if (i < selectors.length - 1) out.push('');
    }

    if (!out.length) {
      return this._filterSnapshotByStateBreakpoint(
        this._buildEmptyRuleForSelector(BRICKS_ELEMENT_PREFIX + String(resolvedId || 'selected')),
        propertyFilter
      );
    }

    return this._filterSnapshotByStateBreakpoint(out.join('\n'), propertyFilter);
  };

  CSSBridge.prototype._buildChildrenScopeMinimalSnapshot = function (ctx) {
    var entries = this._collectChildrenScopeEntries(ctx);
    if (!entries.length) return '/* CM6GPT: selected element has no direct Bricks children */';
    var duplicateMessage = this._getChildrenScopeDuplicateChildIdsMessage(entries);
    if (duplicateMessage) {
      return '/* CM6GPT: ' + duplicateMessage + ' prevent safe children scope editing */';
    }
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var childEntry = entries[i];
      var childCss = this._buildElementMinimalEditableSnapshot(childEntry.element, childEntry.childId, {
        propertyFilter: this.propertyFilter
      });
      if (String(childCss || '').trim()) out.push(childCss);
    }
    return out.length ? out.join('\n\n') : '/* CM6GPT: no child selectors available */';
  };

  CSSBridge.prototype._buildPageMinimalEmptyState = function (scopeRoots, tokenState) {
    scopeRoots = Array.isArray(scopeRoots) ? scopeRoots : [];
    tokenState = tokenState || {};
    var propertyFilter = this._normalizePropertyFilter(
      tokenState.propertyFilter || this.propertyFilter
    );
    var anchorNodes = Array.isArray(tokenState.anchorNodes) ? tokenState.anchorNodes : [];
    if (!scopeRoots.length || !anchorNodes.length) {
      return '/* No page elements found */';
    }
    var classTokens = Array.isArray(tokenState.classTokens) ? tokenState.classTokens : [];
    var preferredIdTokens = Array.isArray(tokenState.preferredIdTokens) ? tokenState.preferredIdTokens : [];
    if (propertyFilter.class && !propertyFilter.id && !classTokens.length) {
      return '/* No class found in any page elements */';
    }
    if (propertyFilter.id && !propertyFilter.class && !preferredIdTokens.length) {
      return '/* No ID found in any page elements */';
    }
    return '';
  };

  CSSBridge.prototype._buildPageMinimalSummary = function () {
    var out = [];
    var seen = {};
    var scopeRoots = this._getPageScopeRoots();
    var tokenState = this._collectPageLensTokens(scopeRoots);
    var visibleTokenState = this._collectPageLensTokens(scopeRoots, {
      propertyFilter: this.propertyFilter,
      includeAllTokens: true
    });
    var pageCustomCss = String(this._buildPageWriteSnapshot() || '').trim();
    var pageCustomBlocks = this._collectPageRelevantBlocksFromCssText(pageCustomCss, {
      scopeRoots: scopeRoots,
      tokenState: visibleTokenState,
      propertyFilter: this.propertyFilter,
      ignorePropertyFilter: true
    });
    var editablePageCss = [];
    for (var p = 0; p < pageCustomBlocks.length; p++) {
      var pageCss = String(pageCustomBlocks[p] && pageCustomBlocks[p].css ? pageCustomBlocks[p].css : '').trim();
      if (!pageCss) continue;
      var pageDedupeKey = pageCss.replace(/\s+/g, ' ').trim();
      if (pageDedupeKey && seen[pageDedupeKey]) continue;
      if (pageDedupeKey) seen[pageDedupeKey] = true;
      editablePageCss.push(pageCss);
    }

    var editableCssText = editablePageCss.join('\n\n').trim();
    if (editableCssText) out.push(editableCssText);

    var stubBlocks = this._buildPageScopeSelectorStubBlocks(editableCssText, {
      scopeRoots: scopeRoots,
      tokenState: tokenState
    });
    for (var i = 0; i < stubBlocks.length; i++) {
      var css = String(stubBlocks[i] || '').trim();
      if (!css) continue;
      var dedupeKey = css.replace(/\s+/g, ' ').trim();
      if (dedupeKey && seen[dedupeKey]) continue;
      if (dedupeKey) seen[dedupeKey] = true;
      out.push(css);
    }

    var summary = out.join('\n\n').trim();
    if (summary) return summary;
    return this._buildPageMinimalEmptyState(scopeRoots, tokenState);
  };

  CSSBridge.prototype._extractEditableCustomCssFallback = function (text) {
    var marker = '/* settings._cssCustom */';
    var idx = text.indexOf(marker);
    if (idx < 0) return null;
    var start = idx + marker.length;
    var tail = text.slice(start).replace(/^\s*\n/, '');
    var sentinels = [
      '\n@bricks-query-loop',
      '\n/* settings._conditions',
      '\n/* Special/advanced keys detected',
      '\n/* Notes */'
    ];
    var end = tail.length;
    for (var i = 0; i < sentinels.length; i++) {
      var sidx = tail.indexOf(sentinels[i]);
      if (sidx >= 0 && sidx < end) end = sidx;
    }
    return tail.slice(0, end).replace(/\s+$/, '');
  };

  CSSBridge.prototype._buildElementComputedSnapshot = function (el, id) {
    if (!el) return '/* CM6GPT: no selected element */';

    var out = [];
    var selector = this._selectorFor(el, id);
    out.push('/* CM6GPT CSS — Computed Snapshot (read-only) */');
    out.push('/* Source: selected Bricks element #' + (id || '?') + ' */');
    out.push('/* View: Computed (diagnostic, final rendered values) */');
    out.push('');
    out.push(selector + ' {');

    var inlineStyle = (el.getAttribute && el.getAttribute('style')) || '';
    if (inlineStyle.trim()) {
      out.push('  /* inline style */');
      inlineStyle.split(';').forEach(function (decl) {
        var d = String(decl || '').trim();
        if (!d) return;
        out.push('  ' + d + ';');
      });
      out.push('');
    }

    var doc = this.api.getIframeDocument();
    var computed = null;
    try {
      computed = doc && doc.defaultView && doc.defaultView.getComputedStyle ? doc.defaultView.getComputedStyle(el) : null;
    } catch (e) { _warn('_buildElementComputedSnapshot', e); 
      computed = null;
    }

    var keys = [
      'display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'gap', 'row-gap', 'column-gap',
      'flex-direction', 'justify-content', 'align-items', 'flex-wrap',
      'grid-template-columns', 'grid-template-rows',
      'color', 'background-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left',
      'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'
    ];

    if (computed) {
      out.push('  /* computed snapshot (selected subset) */');
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var val = computed.getPropertyValue(key);
        if (!val) continue;
        var trimmed = String(val).trim();
        if (!trimmed) continue;
        out.push('  ' + key + ': ' + trimmed + ';');
      }
    } else {
      out.push('  /* computed style unavailable */');
    }

    out.push('}');
    out.push('');
    out.push('/* Notes */');
    out.push('/* - Computed = final rendered values (Bricks defaults + theme + inherited + browser defaults). */');
    out.push('/* - This is NOT the canonical Bricks settings source. */');
    return out.join('\n');
  };

  CSSBridge.prototype._buildElementAuthoredSnapshot = function (el, id) {
    if (!el) return '/* CM6GPT: no selected element */';

    var out = [];
    var selector = this._selectorFor(el, id);
    var userClasses = this._getUserClasses(el);
    var runtimeClasses = this._getRuntimeClasses(el);
    var inlineStyle = (el.getAttribute && el.getAttribute('style')) || '';
    var attrs = this._getInterestingAttributes(el);

    out.push('/* CM6GPT CSS — Authored Snapshot (read-only) */');
    out.push('/* Source: selected Bricks element #' + (id || '?') + ' */');
    out.push('/* View: Authored (inline + matched same-origin stylesheet rules) */');
    out.push('');
    out.push('/* Identity */');
    out.push('/* selector: ' + selector + ' */');
    out.push('/* tag: <' + String((el.tagName || '').toLowerCase() || 'div') + '> */');
    out.push('/* id: ' + (el.id || '(none)') + ' */');
    out.push('/* user classes: ' + (userClasses.length ? userClasses.join(' ') : '(none)') + ' */');
    if (runtimeClasses.length) {
      out.push('/* builder/runtime classes hidden from selector: ' + runtimeClasses.slice(0, 8).join(' ') + (runtimeClasses.length > 8 ? ' …' : '') + ' */');
    }
    if (attrs.length) {
      out.push('/* attrs: ' + attrs.join(', ') + ' */');
    }
    out.push('');

    out.push(selector + ' {');
    if (inlineStyle.trim()) {
      out.push('  /* inline style (authored on element) */');
      inlineStyle.split(';').forEach(function (decl) {
        var d = String(decl || '').trim();
        if (!d) return;
        out.push('  ' + d + ';');
      });
    } else {
      out.push('  /* no inline style on selected DOM node */');
    }
    out.push('}');
    out.push('');

    var matches = this._collectMatchingAuthoredRules(el);
    if (matches.length) {
      out.push('/* Matched authored rules (same-origin stylesheets only) */');
      out.push('/* Note: this can include theme/global CSS, not just this Bricks element settings. */');
      out.push('');
      for (var i = 0; i < matches.length; i++) {
        out.push(matches[i]);
        out.push('');
      }
    } else {
      out.push('/* No matching same-origin stylesheet rules found for this element. */');
      out.push('/* This can happen when styles come from computed defaults or inaccessible stylesheets. */');
    }

    return out.join('\n');
  };

  CSSBridge.prototype._buildElementCanonicalSnapshot = function (el, id, opts) {
    opts = opts || {};
    if (!el) return '/* CM6GPT: no selected element */';

    var selector = this._selectorFor(el, id);
    var domDataId = el.getAttribute ? (el.getAttribute('data-id') || '') : '';
    var domScriptId = el.getAttribute ? (el.getAttribute('data-script-id') || '') : '';
    var domComponentId = el.getAttribute ? (el.getAttribute('data-component') || '') : '';
    var domComponentInstanceId = el.getAttribute ? (el.getAttribute('data-component-instance') || '') : '';
    var analysis = this.api && typeof this.api.getElementAnalysisById === 'function'
      ? this.api.getElementAnalysisById(id, el)
      : null;
    var model = analysis && analysis.model ? analysis.model : null;
    var vueState = null;
    if (!model) {
      vueState = this.api && typeof this.api.getVueState === 'function' ? this.api.getVueState() : null;
      model = this._findElementModelById(vueState, id);
    }

    // Compact canonical is the only live runtime path; keep the legacy fallback
    // parser separate for older persisted snapshots.
    return this._buildElementCanonicalSnapshotCompact({
      el: el,
      id: id,
      selector: selector,
      model: model,
      analysis: analysis,
      propertyFilter: this.propertyFilter,
      domDataId: domDataId,
      domScriptId: domScriptId,
      domComponentId: domComponentId,
      domComponentInstanceId: domComponentInstanceId,
      contextInfoKey: String(opts.contextInfoKey || '')
    });
  };

  CSSBridge.prototype._buildElementCanonicalSnapshotCompact = function (opts) {
    opts = opts || {};
    var el = opts.el;
    if (!el) return '/* CM6GPT: no selected element */';

    var id = String(opts.id || '');
    var selector = String(opts.selector || this._selectorFor(el, id));
    var analysis = opts.analysis || null;
    var model = opts.model || null;
    var propertyFilter = this._normalizePropertyFilter(opts.propertyFilter || this.propertyFilter);
    var includeClassBlocks = !!propertyFilter.class;
    var includeIdBlocks = !!propertyFilter.id;
    var classOnlyMode = includeClassBlocks && !includeIdBlocks;
    var contextInfoKey = String(opts.contextInfoKey || ('element:' + id));
    var domDataId = String(opts.domDataId || '');
    var domScriptId = String(opts.domScriptId || '');
    var domComponentId = String(opts.domComponentId || '');
    var domComponentInstanceId = String(opts.domComponentInstanceId || '');
    var out = [];

    var settings = model && isObject(model.settings) ? model.settings : {};
    var lifecycle = this.api && typeof this.api.getElementClassLifecycleByDom === 'function'
      ? this.api.getElementClassLifecycleByDom(el)
      : null;
    var nativePreview = this.api && typeof this.api.getNativeGeneratedCssPreviewByDom === 'function'
      ? this.api.getNativeGeneratedCssPreviewByDom(el)
      : null;

    this._setCanonicalInfoCache(this._buildElementCanonicalInfoText({
      el: el,
      id: id,
      selector: selector,
      analysis: analysis,
      model: model,
      propertyFilter: propertyFilter,
      domDataId: domDataId,
      domScriptId: domScriptId,
      domComponentId: domComponentId,
      domComponentInstanceId: domComponentInstanceId,
      lifecycle: lifecycle,
      nativePreview: nativePreview
    }), contextInfoKey);

    var classBlockCount = 0;
    var userClasses = this._getUserClasses(el);
    var renderedClassSelectors = {};
    var activeClassTarget = includeClassBlocks
      ? this._describePrimaryGlobalClassTargetFromLifecycle(lifecycle)
      : null;
    if (includeClassBlocks && lifecycle && lifecycle.ok) {
      if (activeClassTarget && activeClassTarget.kind === 'global') {
        var gRef = String(activeClassTarget.ref || '');
        var gName = String(activeClassTarget.name || '');
        var gId = String(activeClassTarget.id || '');
        var editableRef = String(gId || gName || gRef || '').trim();
        if (editableRef) {
          var gCustomCss = '';
          var gCustomInfo = this.api && typeof this.api.getGlobalClassCustomCss === 'function'
            ? this.api.getGlobalClassCustomCss(editableRef)
            : null;
          if (gCustomInfo && gCustomInfo.ok && typeof gCustomInfo.css === 'string') {
            gCustomCss = gCustomInfo.css.trim();
          }
          var gMappedCss = '';
          var gMappedInfo = this.api && typeof this.api.getGlobalClassMappedSettingsCss === 'function'
            ? this.api.getGlobalClassMappedSettingsCss(editableRef)
            : null;
          if (gMappedInfo && gMappedInfo.ok && typeof gMappedInfo.css === 'string') {
            gMappedCss = gMappedInfo.css.trim();
          }
          var gRootSelector = gName ? ('.' + this._escapeCssIdentifier(gName)) : '';
          var gWriteCss = this._buildSyncedCustomCssSnapshot(
            gCustomCss,
            gMappedCss,
            gRootSelector
          );
          if (!gWriteCss && gRootSelector && this.api && typeof this.api.getNativeGeneratedCssPreviewForGlobalClass === 'function') {
            var gPreview = this.api.getNativeGeneratedCssPreviewForGlobalClass(editableRef);
            if (gPreview && gPreview.ok && gPreview.css) {
              gWriteCss = this._extractFirstCssRuleForSelector(String(gPreview.css || ''), gRootSelector);
            }
          }
          if (!gWriteCss && gRootSelector) {
            gWriteCss = this._buildEmptyRuleForSelector(gRootSelector);
          }

          if (gWriteCss) {
            out.push(gWriteCss);
            if (gRootSelector) renderedClassSelectors[gRootSelector] = true;
            classBlockCount++;
          }
        }
      } else if (activeClassTarget && activeClassTarget.kind === 'local' && activeClassTarget.name) {
        var localTargetSelector = '.' + this._escapeCssIdentifier(activeClassTarget.name);
        var localTargetCss = '';
        if (typeof settings._cssCustom === 'string' && settings._cssCustom.trim()) {
          localTargetCss = this._extractFirstCssRuleForSelector(String(settings._cssCustom || ''), localTargetSelector);
        }
        if (!localTargetCss && nativePreview && nativePreview.ok && nativePreview.css) {
          localTargetCss = this._extractFirstCssRuleForSelector(String(nativePreview.css || ''), localTargetSelector);
        }
        if (!localTargetCss) {
          localTargetCss = this._buildEmptyRuleForSelector(localTargetSelector);
        }
        if (localTargetCss) {
          out.push(localTargetCss);
          renderedClassSelectors[localTargetSelector] = true;
          classBlockCount++;
        }
      }
    }

    if (
      classOnlyMode &&
      includeClassBlocks &&
      userClasses.length &&
      (!activeClassTarget || !activeClassTarget.ref)
    ) {
      var primaryUserClass = String(userClasses[0] || '').trim();
      var userClassSelector = primaryUserClass ? ('.' + this._escapeCssIdentifier(primaryUserClass)) : '';
      if (userClassSelector && !renderedClassSelectors[userClassSelector]) {
        if (out.length && out[out.length - 1] !== '') out.push('');
        out.push(this._buildEmptyRuleForSelector(userClassSelector));
        renderedClassSelectors[userClassSelector] = true;
        classBlockCount++;
      }
    }

    if (classOnlyMode && !classBlockCount) {
      var classFallbackSelector = this._getBricksRootSelectorForElement(el, id, {
        propertyFilter: { class: true, id: false }
      });
      if (classFallbackSelector && classFallbackSelector.charAt(0) === '.') {
        out.push(this._buildEmptyRuleForSelector(classFallbackSelector));
      } else {
        // If there is no user class on the node, never return an empty editor.
        // Fallback to ID/root selector so users always get an editable block.
        var idFallbackSelector = this._getBricksRootSelectorForElement(el, id, {
          propertyFilter: { class: false, id: true }
        }) || selector;
        if (idFallbackSelector) {
          out.push(this._buildEmptyRuleForSelector(idFallbackSelector));
        }
      }
    }

    if (classOnlyMode) {
      return this._filterSnapshotByStateBreakpoint(out.join('\n').trim(), propertyFilter);
    }

    var mappedSettingsInfo = this.api && typeof this.api.getElementMappedSettingsCssByDom === 'function'
      ? this.api.getElementMappedSettingsCssByDom(el)
      : null;
    if (includeIdBlocks) {
      var rootHelperSelector = this._getBricksRootSelectorForElement(el, id);
      var writeCustomCss = (model && typeof settings._cssCustom === 'string' && settings._cssCustom.trim())
        ? settings._cssCustom.trim()
        : '';
      writeCustomCss = this._buildSyncedCustomCssSnapshot(
        writeCustomCss,
        mappedSettingsInfo && mappedSettingsInfo.ok && mappedSettingsInfo.css ? String(mappedSettingsInfo.css || '').trim() : '',
        rootHelperSelector
      );
      if (!writeCustomCss && this.api && typeof this.api.getNativeGeneratedCssPreviewByDom === 'function') {
        var nativePreviewId = this.api.getNativeGeneratedCssPreviewByDom(el);
        var previewSelector = rootHelperSelector || (this._getBricksRootSelectorCandidates(el, id)[0] || '');
        if (nativePreviewId && nativePreviewId.ok && nativePreviewId.css && previewSelector) {
          writeCustomCss = this._extractFirstCssRuleForSelector(String(nativePreviewId.css || ''), previewSelector);
        }
      }
      if (!writeCustomCss) {
        var fallbackSelector = rootHelperSelector || (this._getBricksRootSelectorCandidates(el, id)[0] || selector || '');
        if (fallbackSelector) {
          writeCustomCss = this._buildEmptyRuleForSelector(fallbackSelector);
        }
      }
      if (writeCustomCss) {
        out.push(writeCustomCss);
      }
    }

    return this._filterSnapshotByStateBreakpoint(out.join('\n'), propertyFilter);
  };

  CSSBridge.prototype._appendEditableBlock = function (out, key, body, emptyPlaceholder) {
    out.push('@cm6gpt-editable-begin ' + key + ';');
    if (typeof body === 'string' && body.trim()) {
      out.push(body.trim());
    } else if (emptyPlaceholder) {
      out.push(String(emptyPlaceholder));
    }
    out.push('@cm6gpt-editable-end ' + key + ';');
    out.push('');
  };

  CSSBridge.prototype._buildElementWriteSnapshot = function (el, id) {
    if (!el) return '/* CM6GPT: no selected element */';
    var resolved = this.api && typeof this.api.getElementModelByDom === 'function'
      ? this.api.getElementModelByDom(el)
      : null;
    var model = resolved && resolved.model ? resolved.model : null;
    var settings = model && isObject(model.settings) ? model.settings : {};
    var mappedSettingsInfo = this.api && typeof this.api.getElementMappedSettingsCssByDom === 'function'
      ? this.api.getElementMappedSettingsCssByDom(el)
      : null;
    var rootHelperSelector = this._getBricksRootSelectorForElement(el, id);
    var writeCustomCss = (typeof settings._cssCustom === 'string' && settings._cssCustom.trim())
      ? settings._cssCustom.trim()
      : '';
    writeCustomCss = this._extractWriteBodyWithoutMarkers(writeCustomCss, '_cssCustom');
    if (this._stripEmptyRootSelectorSkeleton(writeCustomCss, { element: el, id: id }) !== null) {
      writeCustomCss = '';
    }
    writeCustomCss = this._buildSyncedCustomCssSnapshot(
      writeCustomCss,
      mappedSettingsInfo && mappedSettingsInfo.ok && mappedSettingsInfo.css ? String(mappedSettingsInfo.css || '').trim() : '',
      rootHelperSelector
    );
    return String(writeCustomCss || '').trim();
  };

  CSSBridge.prototype._buildPageWriteSnapshot = function () {
    var pageCustomCss = this.api && typeof this.api.getPageCustomCss === 'function'
      ? String(this.api.getPageCustomCss() || '')
      : '';
    return this._extractWriteBodyWithoutMarkers(pageCustomCss, 'pageCustomCss');
  };

  CSSBridge.prototype._createCssParseDocument = function () {
    var iframeDoc = this.api && typeof this.api.getIframeDocument === 'function'
      ? this.api.getIframeDocument()
      : null;
    var impl = iframeDoc && iframeDoc.implementation;
    if (impl && typeof impl.createHTMLDocument === 'function') {
      try {
        return impl.createHTMLDocument('cm6gpt-css-parse');
      } catch (e0) { _warn('_createCssParseDocument', e0); }
    }
    if (typeof document !== 'undefined' && document && document.implementation && typeof document.implementation.createHTMLDocument === 'function') {
      try {
        return document.implementation.createHTMLDocument('cm6gpt-css-parse');
      } catch (e1) { _warn('_createCssParseDocument', e1); }
    }
    return null;
  };

  CSSBridge.prototype._parseCssTextToTopLevelRules = function (cssText) {
    cssText = String(cssText || '').trim();
    if (!cssText) return [];
    var parseDoc = this._createCssParseDocument();
    if (!parseDoc || !parseDoc.createElement || !parseDoc.head) return [];

    var style = parseDoc.createElement('style');
    try {
      style.setAttribute('type', 'text/css');
      style.textContent = cssText;
      parseDoc.head.appendChild(style);
    } catch (e0) { _warn('_parseCssTextToTopLevelRules', e0); 
      return [];
    }

    var rules = [];
    try {
      rules = style.sheet && style.sheet.cssRules
        ? Array.prototype.slice.call(style.sheet.cssRules)
        : [];
    } catch (e1) { _warn('_parseCssTextToTopLevelRules', e1); 
      rules = [];
    }

    try {
      removeDomNode(style);
    } catch (e2) { _warn('_parseCssTextToTopLevelRules', e2); }

    return rules;
  };

  CSSBridge.prototype._rulesToTopLevelCssBlocks = function (rules) {
    rules = Array.isArray(rules) ? rules : [];
    var out = [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule) continue;
      var css = String(rule.cssText || '').trim();
      if (!css) css = this._formatCssRuleWithGroups(rule, []);
      css = String(css || '').trim();
      if (!css) continue;
      out.push({
        rule: rule,
        css: css
      });
    }
    return out;
  };

  CSSBridge.prototype._getPageScopeRoots = function () {
    var root = this.api && typeof this.api.getBuilderRoot === 'function'
      ? this.api.getBuilderRoot()
      : null;
    if (!root && this.api && typeof this.api.getSelectionContext === 'function') {
      var ctx = null;
      try { ctx = this.api.getSelectionContext(); } catch (e0) { _warn('_getPageScopeRoots', e0);  ctx = null; }
      root = ctx && ctx.mode === 'page' && ctx.element ? ctx.element : null;
    }
    return root ? [root] : [];
  };

  CSSBridge.prototype._getPageScopeAnchorNodes = function (scopeRoots) {
    scopeRoots = Array.isArray(scopeRoots) ? scopeRoots : [];
    var selector = '[data-id], [data-script-id], [data-component-instance], [data-component]';
    var out = [];
    var seenNode = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

    function push(node) {
      if (!node || node.nodeType !== 1) return;
      if (seenNode) {
        if (seenNode.has(node)) return;
        seenNode.add(node);
      } else if (out.indexOf(node) !== -1) {
        return;
      }
      out.push(node);
    }

    for (var i = 0; i < scopeRoots.length; i++) {
      var root = scopeRoots[i];
      if (!root || root.nodeType !== 1) continue;
      if (root.matches && root.matches(selector)) push(root);
      var nodes = root.querySelectorAll ? root.querySelectorAll(selector) : [];
      for (var n = 0; n < nodes.length; n++) push(nodes[n]);
    }

    return out;
  };

  CSSBridge.prototype._splitSelectorList = function (value) {
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
  };

  CSSBridge.prototype._collectPageLensTokens = function (scopeRoots, opts) {
    opts = opts || {};
    scopeRoots = Array.isArray(scopeRoots) ? scopeRoots : [];
    var includeAllTokens = !!opts.includeAllTokens;
    var propertyFilter = this._normalizePropertyFilter(
      opts.propertyFilter || this.propertyFilter
    );
    var anchorNodes = this._getPageScopeAnchorNodes(scopeRoots);
    var self = this;
    var classTokens = [];
    var idTokens = [];
    var bricksIdTokens = [];
    var preferredIdTokens = [];
    var allTokens = [];
    var seenClass = {};
    var seenId = {};
    var seenBricksId = {};
    var seenPreferredId = {};

    function addToken(list, seen, token, maxCount) {
      token = String(token || '').trim();
      if (!token || seen[token]) return;
      if (maxCount > 0 && list.length >= maxCount) return;
      seen[token] = true;
      list.push(token);
      allTokens.push(token);
    }

    function visit(el) {
      if (!el || el.nodeType !== 1) return;

      var userClasses = self._getUserClasses(el);
      for (var i = 0; i < userClasses.length; i++) {
        addToken(classTokens, seenClass, '.' + self._escapeCssIdentifier(userClasses[i]), 256);
      }

      var domId = String(el.id || '').trim();
      if (domId && !/^brxe-/.test(domId) && !/^brx-/.test(domId)) {
        addToken(idTokens, seenId, '#' + self._escapeCssIdentifier(domId), 128);
      }

      var resolvedId = self._resolveElementIdFromDom(el, '');
      if (resolvedId) {
        addToken(bricksIdTokens, seenBricksId, '#brxe-' + self._escapeCssIdentifier(resolvedId), 256);
      }

      var preferredIdToken = self._getBricksRootSelectorForElement(el, resolvedId, {
        propertyFilter: { class: false, id: true }
      });
      if (preferredIdToken && preferredIdToken.charAt(0) === '#') {
        addToken(preferredIdTokens, seenPreferredId, preferredIdToken, 256);
      }
    }

    for (var r = 0; r < anchorNodes.length; r++) {
      visit(anchorNodes[r]);
    }

    if (includeAllTokens) {
      allTokens = classTokens.concat(idTokens, bricksIdTokens).filter(function (token, index, list) {
        return token && list.indexOf(token) === index;
      });
    } else if (propertyFilter.class && !propertyFilter.id) {
      allTokens = classTokens.slice();
    } else if (propertyFilter.id && !propertyFilter.class) {
      allTokens = idTokens.concat(bricksIdTokens);
    }

    return {
      anchorNodes: anchorNodes,
      propertyFilter: propertyFilter,
      classTokens: classTokens,
      idTokens: idTokens,
      bricksIdTokens: bricksIdTokens,
      pageIdTokens: idTokens.concat(bricksIdTokens),
      preferredIdTokens: preferredIdTokens,
      allTokens: allTokens
    };
  };

  CSSBridge.prototype._selectorContainsPageToken = function (selectorText, tokenState) {
    selectorText = String(selectorText || '');
    var tokens = tokenState && Array.isArray(tokenState.allTokens) ? tokenState.allTokens : [];
    if (!selectorText || !tokens.length) return false;
    for (var i = 0; i < tokens.length; i++) {
      if (selectorText.indexOf(tokens[i]) !== -1) return true;
    }
    return false;
  };

  CSSBridge.prototype._selectorViolatesPagePropertyFilter = function (selectorText, state) {
    state = state || {};
    selectorText = String(selectorText || '').trim();
    if (!selectorText) return false;
    if (state.ignorePropertyFilter) return false;
    var propertyFilter = this._normalizePropertyFilter(
      state.propertyFilter || (state.tokenState && state.tokenState.propertyFilter) || this.propertyFilter
    );
    if (!(propertyFilter.class && !propertyFilter.id)) return false;
    var pageIdTokens = state.tokenState && Array.isArray(state.tokenState.pageIdTokens)
      ? state.tokenState.pageIdTokens
      : [];
    for (var i = 0; i < pageIdTokens.length; i++) {
      if (pageIdTokens[i] && selectorText.indexOf(pageIdTokens[i]) !== -1) return true;
    }
    return false;
  };

  CSSBridge.prototype._getRelevantPageSelectors = function (selectorText, state) {
    state = state || {};
    var selectorItems = this._splitSelectorList(selectorText);
    var out = [];
    for (var i = 0; i < selectorItems.length; i++) {
      var selector = String(selectorItems[i] || '').trim();
      if (!selector) continue;
      if (!this._selectorContainsPageToken(selector, state.tokenState)) continue;
      if (this._isKnownGlobalNoiseSelector(selector)) continue;
      if (this._selectorViolatesPagePropertyFilter(selector, state)) continue;
      if (!this._selectorMatchesScopeRoots(selector, state.scopeRoots)) continue;
      out.push(selector);
    }
    return out;
  };

  CSSBridge.prototype._selectorQueryCandidates = function (selectorText) {
    selectorText = String(selectorText || '').trim();
    if (!selectorText) return [];
    var out = [];

    function push(value) {
      value = String(value || '').trim();
      if (!value || out.indexOf(value) !== -1) return;
      out.push(value);
    }

    var noPseudoElements = selectorText.replace(/::[a-z-]+|:(?:before|after|first-letter|first-line|marker|placeholder|selection)\b/gi, '');
    var noInteractionPseudos = noPseudoElements.replace(
      /:(?:hover|focus|focus-visible|focus-within|active|visited|link|checked|disabled|enabled|target|required|optional|invalid|valid|user-invalid|autofill|read-only|read-write|placeholder-shown|fullscreen)\b/gi,
      ''
    );

    push(selectorText);
    push(noPseudoElements);
    push(noInteractionPseudos);
    return out;
  };

  CSSBridge.prototype._selectorMatchesScopeRoots = function (selectorText, scopeRoots) {
    scopeRoots = Array.isArray(scopeRoots) ? scopeRoots : [];
    var selectors = this._selectorQueryCandidates(selectorText);
    if (!selectors.length || !scopeRoots.length) return false;
    for (var i = 0; i < scopeRoots.length; i++) {
      var root = scopeRoots[i];
      if (!root || root.nodeType !== 1) continue;
      for (var s = 0; s < selectors.length; s++) {
        var selector = selectors[s];
        try {
          if (typeof root.matches === 'function' && root.matches(selector)) return true;
        } catch (e0) { _warn('_selectorMatchesScopeRoots', e0); }
        try {
          if (typeof root.querySelector === 'function' && root.querySelector(selector)) return true;
        } catch (e1) { _warn('_selectorMatchesScopeRoots', e1); }
      }
    }
    return false;
  };

  CSSBridge.prototype._isKnownGlobalNoiseSheet = function (sheet, idx) {
    var label = String(this._sheetLabel(sheet, idx) || '').toLowerCase();
    var ownerText = '';
    try {
      ownerText = String(sheet && sheet.ownerNode && sheet.ownerNode.textContent ? sheet.ownerNode.textContent : '').toLowerCase();
    } catch (e) { _warn('_isKnownGlobalNoiseSheet', e); 
      ownerText = '';
    }
    var haystack = label + '\n' + ownerText.slice(0, 2200);
    return (
      haystack.indexOf('wp-block-library') !== -1 ||
      haystack.indexOf('wp-emoji') !== -1 ||
      haystack.indexOf('emoji-styles-inline-css') !== -1 ||
      haystack.indexOf('wp-img-auto-sizes') !== -1 ||
      haystack.indexOf('wp-smiley') !== -1 ||
      haystack.indexOf('/wp-includes/') !== -1
    );
  };

  CSSBridge.prototype._isKnownGlobalNoiseSelector = function (selectorText) {
    var raw = String(selectorText || '').trim();
    var text = raw.toLowerCase();
    if (!text) return true;
    return (
      /^:where\(/.test(text) ||
      /^html\s*:where\(/.test(text) ||
      /^img:is\(\[sizes=auto/i.test(raw) ||
      /\.wp-element-button\b/.test(text) ||
      /\.screen-reader-text\b/.test(text) ||
      /\.aligncenter\b/.test(text) ||
      /\.items-justified-/.test(text) ||
      /\.has-(?:very-|vivid-|purple-|hazy-|subdued-|atomic-|nightshade-|midnight)/.test(text) ||
      /\.has-(?:regular|larger|normal|huge)-font-size\b/.test(text) ||
      /\.has-text-align-(?:center|left|right)\b/.test(text) ||
      /\.has-fit-text\b/.test(text) ||
      /#end-resizable-editor-section\b/.test(text) ||
      /img\.wp-smiley\b/.test(text) ||
      /img\.emoji\b/.test(text)
    );
  };

  CSSBridge.prototype._sheetHasPageTokenMatch = function (rules, scopeRoots, tokenState) {
    if (!rules || !rules.length) return false;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule) continue;
      var isStyleRule = !!rule.selectorText && !!rule.style;
      var isGroupRule = !!rule.cssRules && !isStyleRule;
      if (isStyleRule) {
        if (this._getRelevantPageSelectors(rule.selectorText, {
          scopeRoots: scopeRoots,
          tokenState: tokenState
        }).length) return true;
        continue;
      }
      if (isGroupRule && this._sheetHasPageTokenMatch(rule.cssRules, scopeRoots, tokenState)) {
        return true;
      }
    }
    return false;
  };

  CSSBridge.prototype._getCssRuleHead = function (rule) {
    if (!rule) return '';
    if (rule.cssText) {
      var head = String(rule.cssText || '').split('{')[0].trim();
      if (head) return head;
    }
    if (rule.conditionText) return '@group ' + rule.conditionText;
    if (rule.name) return '@keyframes ' + rule.name;
    return '';
  };

  CSSBridge.prototype._indentCssBlock = function (text, prefix) {
    text = String(text || '');
    prefix = String(prefix || '  ');
    return text.split('\n').map(function (line) {
      return line ? (prefix + line) : line;
    }).join('\n');
  };

  CSSBridge.prototype._formatCssRuleWithGroups = function (rule, groupStack) {
    var css = String(rule && rule.cssText ? rule.cssText : '').trim();
    if (!css) return '';
    groupStack = Array.isArray(groupStack) ? groupStack : [];
    for (var i = groupStack.length - 1; i >= 0; i--) {
      css = groupStack[i] + ' {\n' + this._indentCssBlock(css, '  ') + '\n}';
    }
    return css;
  };

  CSSBridge.prototype._extractStyleRuleBodyText = function (rule) {
    if (!rule) return '';
    var body = rule.style && typeof rule.style.cssText === 'string'
      ? String(rule.style.cssText || '').trim()
      : '';
    if (body) return this._formatCssRuleBodyText(body);
    var cssText = String(rule.cssText || '');
    var openIdx = cssText.indexOf('{');
    var closeIdx = cssText.lastIndexOf('}');
    if (openIdx < 0 || closeIdx <= openIdx) return '';
    return this._formatCssRuleBodyText(cssText.slice(openIdx + 1, closeIdx).trim());
  };

  CSSBridge.prototype._formatFilteredStyleRuleWithGroups = function (rule, selectorList, groupStack) {
    selectorList = Array.isArray(selectorList) ? selectorList.filter(Boolean) : [];
    if (!selectorList.length) return '';
    var body = this._extractStyleRuleBodyText(rule);
    if (!body) return '';
    var css = selectorList.join(', ') + ' {\n' + this._indentCssBlock(body, '  ') + '\n}';
    groupStack = Array.isArray(groupStack) ? groupStack : [];
    for (var i = groupStack.length - 1; i >= 0; i--) {
      css = groupStack[i] + ' {\n' + this._indentCssBlock(css, '  ') + '\n}';
    }
    return css;
  };

  CSSBridge.prototype._extractAnimationNamesFromStyleRule = function (rule) {
    var out = [];
    var seen = {};

    function add(name) {
      name = String(name || '').trim().replace(/^["']|["']$/g, '');
      if (!name || seen[name]) return;
      if (/^(?:none|initial|inherit|unset|revert|revert-layer)$/i.test(name)) return;
      seen[name] = true;
      out.push(name);
    }

    if (!rule || !rule.style) return out;
    var explicit = String(rule.style.getPropertyValue('animation-name') || '').trim();
    if (explicit) {
      explicit.split(',').forEach(add);
    }

    var shorthand = String(rule.style.getPropertyValue('animation') || '').trim();
    if (!shorthand) return out;
    var keywordRe = /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|infinite|normal|reverse|alternate|alternate-reverse|forwards|backwards|both|running|paused)$/i;
    shorthand.split(',').forEach(function (part) {
      var tokens = String(part || '').trim().split(/\s+/);
      for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || '').trim();
        if (!token) continue;
        if (/^[\d.]+m?s$/i.test(token)) continue;
        if (/^\d+$/.test(token)) continue;
        if (keywordRe.test(token)) continue;
        if (/^(?:cubic-bezier|steps|frames|var)\(/i.test(token)) continue;
        add(token);
        break;
      }
    });

    return out;
  };

  CSSBridge.prototype._collectPageRelevantBlocksFromRules = function (rules, state, groupStack) {
    if (!rules || !rules.length || !state) return;
    groupStack = Array.isArray(groupStack) ? groupStack : [];

    for (var i = 0; i < rules.length; i++) {
      if (state.maxBlocks > 0 && state.blocks.length >= state.maxBlocks) return;
      if (state.maxBytes > 0 && state.bytes >= state.maxBytes) return;

      var rule = rules[i];
      if (!rule) continue;
      var isStyleRule = !!rule.selectorText && !!rule.style;
      var isGroupRule = !!rule.cssRules && !isStyleRule;
      var head = this._getCssRuleHead(rule);

      if (isStyleRule) {
        var selectorText = String(rule.selectorText || '').trim();
        var relevantSelectors = this._getRelevantPageSelectors(selectorText, state);
        if (!relevantSelectors.length) continue;

        var block = this._formatFilteredStyleRuleWithGroups(rule, relevantSelectors, groupStack);
        if (!block) continue;
        var dedupeKey = block.replace(/\s+/g, ' ').trim();
        if (dedupeKey && state.seen[dedupeKey]) continue;
        if (state.maxBytes > 0 && (state.bytes + block.length) > state.maxBytes) continue;
        if (dedupeKey) state.seen[dedupeKey] = true;
        state.blocks.push({ css: block, bytes: block.length });
        state.bytes += block.length;

        var animationNames = this._extractAnimationNamesFromStyleRule(rule);
        for (var n = 0; n < animationNames.length; n++) {
          state.keyframesWanted[animationNames[n]] = true;
        }
        continue;
      }

      if (isGroupRule) {
        if (head) groupStack.push(head);
        this._collectPageRelevantBlocksFromRules(rule.cssRules, state, groupStack);
        if (head) groupStack.pop();
      }
    }
  };

  CSSBridge.prototype._collectPageRelevantKeyframesFromRules = function (rules, state, groupStack) {
    if (!rules || !rules.length || !state) return;
    groupStack = Array.isArray(groupStack) ? groupStack : [];

    for (var i = 0; i < rules.length; i++) {
      if (state.maxBlocks > 0 && state.blocks.length >= state.maxBlocks) return;
      if (state.maxBytes > 0 && state.bytes >= state.maxBytes) return;

      var rule = rules[i];
      if (!rule) continue;
      var isStyleRule = !!rule.selectorText && !!rule.style;
      var isGroupRule = !!rule.cssRules && !isStyleRule;
      var head = this._getCssRuleHead(rule);
      var isKeyframesRule = !isStyleRule && !!rule.cssRules && /^@(?:-\w+-)?keyframes\b/i.test(head);

      if (isKeyframesRule) {
        var keyframeName = String(rule.name || '').trim();
        if (!keyframeName || !state.keyframesWanted[keyframeName] || state.keyframesAdded[keyframeName]) continue;
        var block = this._formatCssRuleWithGroups(rule, groupStack);
        if (!block) continue;
        var dedupeKey = block.replace(/\s+/g, ' ').trim();
        if (dedupeKey && state.seen[dedupeKey]) {
          state.keyframesAdded[keyframeName] = true;
          continue;
        }
        if (state.maxBytes > 0 && (state.bytes + block.length) > state.maxBytes) continue;
        if (dedupeKey) state.seen[dedupeKey] = true;
        state.keyframesAdded[keyframeName] = true;
        state.blocks.push({ css: block, bytes: block.length });
        state.bytes += block.length;
        continue;
      }

      if (isGroupRule) {
        if (head) groupStack.push(head);
        this._collectPageRelevantKeyframesFromRules(rule.cssRules, state, groupStack);
        if (head) groupStack.pop();
      }
    }
  };

  CSSBridge.prototype._collectPageRelevantStyleBlocks = function (opts) {
    opts = opts || {};
    var doc = this.api && typeof this.api.getIframeDocument === 'function'
      ? this.api.getIframeDocument()
      : null;
    if (!doc || !doc.styleSheets) return [];

    var scopeRoots = this._getPageScopeRoots();
    if (!scopeRoots.length) return [];

    var tokenState = this._collectPageLensTokens(scopeRoots, {
      propertyFilter: opts.propertyFilter || this.propertyFilter
    });
    var maxBlocks = Number(opts.maxBlocks || 0);
    var maxBytes = Number(opts.maxBytes || (this.maxStyleKb * 1024));
    var out = [];
    var totalBytes = 0;
    var seen = {};

    for (var i = 0; i < doc.styleSheets.length; i++) {
      if (maxBlocks > 0 && out.length >= maxBlocks) break;
      if (maxBytes > 0 && totalBytes >= maxBytes) break;

      var sheet = doc.styleSheets[i];
      var rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) { _warn('_collectPageRelevantStyleBlocks', e); 
        rules = null;
      }
      if (!rules || !rules.length) continue;
      if (this._isKnownGlobalNoiseSheet(sheet, i + 1)) continue;

      var sheetRelevant = this._sheetHasPageTokenMatch(rules, scopeRoots, tokenState);
      if (!sheetRelevant) continue;

      var state = {
        scopeRoots: scopeRoots,
        tokenState: tokenState,
        propertyFilter: tokenState.propertyFilter,
        sheetRelevant: sheetRelevant,
        blocks: [],
        bytes: 0,
        seen: seen,
        maxBlocks: maxBlocks > 0 ? Math.max(0, maxBlocks - out.length) : 0,
        maxBytes: maxBytes > 0 ? Math.max(0, maxBytes - totalBytes) : 0,
        keyframesWanted: {},
        keyframesAdded: {}
      };

      this._collectPageRelevantBlocksFromRules(rules, state, []);
      this._collectPageRelevantKeyframesFromRules(rules, state, []);

      for (var b = 0; b < state.blocks.length; b++) {
        if (maxBlocks > 0 && out.length >= maxBlocks) break;
        if (maxBytes > 0 && totalBytes >= maxBytes) break;
        out.push(state.blocks[b]);
        totalBytes += Number(state.blocks[b].bytes || 0);
      }
    }

    return out;
  };

  CSSBridge.prototype._collectPageRelevantBlocksFromCssText = function (cssText, opts) {
    opts = opts || {};
    cssText = String(cssText || '').trim();
    if (!cssText) return [];

    var rules = this._parseCssTextToTopLevelRules(cssText);
    if (!rules.length) return [];

    var scopeRoots = Array.isArray(opts.scopeRoots) ? opts.scopeRoots : this._getPageScopeRoots();
    if (!scopeRoots.length) return [];

    var tokenState = opts.tokenState || this._collectPageLensTokens(scopeRoots, {
      propertyFilter: opts.propertyFilter || this.propertyFilter
    });
    var maxBlocks = Number(opts.maxBlocks || 0);
    var maxBytes = Number(opts.maxBytes || (this.maxStyleKb * 1024));
    var state = {
      scopeRoots: scopeRoots,
      tokenState: tokenState,
      propertyFilter: tokenState.propertyFilter,
      ignorePropertyFilter: !!opts.ignorePropertyFilter,
      sheetRelevant: true,
      blocks: [],
      bytes: 0,
      seen: {},
      maxBlocks: maxBlocks,
      maxBytes: maxBytes,
      keyframesWanted: {},
      keyframesAdded: {}
    };

    this._collectPageRelevantBlocksFromRules(rules, state, []);
    this._collectPageRelevantKeyframesFromRules(rules, state, []);
    return state.blocks;
  };

  CSSBridge.prototype._buildPageScopeSelectorStubBlocks = function (existingCssText, opts) {
    opts = opts || {};
    existingCssText = String(existingCssText || '').trim();
    var scopeRoots = Array.isArray(opts.scopeRoots) ? opts.scopeRoots : this._getPageScopeRoots();
    if (!scopeRoots.length) return [];

    var tokenState = opts.tokenState || this._collectPageLensTokens(scopeRoots, {
      propertyFilter: opts.propertyFilter || this.propertyFilter
    });
    var propertyFilter = this._normalizePropertyFilter(
      opts.propertyFilter || tokenState.propertyFilter || this.propertyFilter
    );
    var selectors = [];
    if (propertyFilter.class && !propertyFilter.id) {
      selectors = Array.isArray(tokenState.classTokens) ? tokenState.classTokens.slice() : [];
    } else if (propertyFilter.id && !propertyFilter.class) {
      selectors = Array.isArray(tokenState.preferredIdTokens) ? tokenState.preferredIdTokens.slice() : [];
    }
    var out = [];
    var seen = {};

    for (var i = 0; i < selectors.length; i++) {
      var selector = String(selectors[i] || '').trim();
      if (!selector) continue;
      if (seen[selector]) continue;
      seen[selector] = true;
      if (existingCssText && this._extractFirstCssRuleForSelector(existingCssText, selector)) continue;
      out.push(this._buildEmptyRuleForSelector(selector));
    }

    return out;
  };

  CSSBridge.prototype._isTopLevelPageCssRuleVisible = function (rule, state) {
    if (!rule || !state) return false;
    var isStyleRule = !!rule.selectorText && !!rule.style;
    if (isStyleRule) {
      return this._getRelevantPageSelectors(rule.selectorText, state).length > 0;
    }

    var head = this._getCssRuleHead(rule);
    var isKeyframesRule = !!rule.cssRules && /^@(?:-\w+-)?keyframes\b/i.test(head);
    if (isKeyframesRule) {
      var keyframeName = String(rule.name || '').trim();
      return !!(keyframeName && state.keyframesWanted && state.keyframesWanted[keyframeName]);
    }

    if (rule.cssRules) {
      return this._sheetHasPageTokenMatch(rule.cssRules, state.scopeRoots, state.tokenState);
    }

    return false;
  };

  CSSBridge.prototype._mergePageScopedEditableCssWithCurrentPageCss = function (editedCss) {
    editedCss = String(editedCss || '').trim();
    if (this._normalizeCssLensMode(this.cssLensMode) !== 'minimal') {
      return editedCss;
    }

    var currentRaw = String(this._buildPageWriteSnapshot() || '').trim();
    if (!currentRaw) return editedCss;

    var scopeRoots = this._getPageScopeRoots();
    if (!scopeRoots.length) return editedCss || currentRaw;

    var currentRules = this._parseCssTextToTopLevelRules(currentRaw);
    if (!currentRules.length) {
      throw new Error('Page CSS lens apply blocked: unable to safely parse current pageCustomCss. Switch to Global CSS to edit the full page CSS.');
    }

    var currentBlocks = this._rulesToTopLevelCssBlocks(currentRules);
    if (!currentBlocks.length) {
      throw new Error('Page CSS lens apply blocked: unable to safely segment current pageCustomCss. Switch to Global CSS to edit the full page CSS.');
    }

    var state = {
      scopeRoots: scopeRoots,
      tokenState: this._collectPageLensTokens(scopeRoots, {
        propertyFilter: this.propertyFilter,
        includeAllTokens: true
      }),
      propertyFilter: this.propertyFilter,
      ignorePropertyFilter: true,
      sheetRelevant: true,
      blocks: [],
      bytes: 0,
      seen: {},
      maxBlocks: 0,
      maxBytes: 0,
      keyframesWanted: {},
      keyframesAdded: {}
    };
    this._collectPageRelevantBlocksFromRules(currentRules, state, []);
    this._collectPageRelevantKeyframesFromRules(currentRules, state, []);

    var visibleIndexMap = {};
    var visibleIndexes = [];
    for (var i = 0; i < currentBlocks.length; i++) {
      if (!this._isTopLevelPageCssRuleVisible(currentBlocks[i].rule, state)) continue;
      visibleIndexes.push(i);
      visibleIndexMap[i] = true;
    }

    var editedBlocks = [];
    if (editedCss) {
      editedBlocks = this._rulesToTopLevelCssBlocks(this._parseCssTextToTopLevelRules(editedCss));
      if (!editedBlocks.length) editedBlocks = [{ css: editedCss }];
    }

    var merged = [];
    if (!visibleIndexes.length) {
      for (i = 0; i < currentBlocks.length; i++) {
        if (currentBlocks[i] && currentBlocks[i].css) merged.push(currentBlocks[i].css);
      }
      for (i = 0; i < editedBlocks.length; i++) {
        if (editedBlocks[i] && editedBlocks[i].css) merged.push(String(editedBlocks[i].css || '').trim());
      }
      return merged.join('\n\n').trim();
    }

    if (editedBlocks.length === visibleIndexes.length) {
      var replaceCursor = 0;
      for (i = 0; i < currentBlocks.length; i++) {
        if (visibleIndexMap[i]) {
          var replacement = editedBlocks[replaceCursor++];
          if (replacement && replacement.css) merged.push(String(replacement.css || '').trim());
          continue;
        }
        if (currentBlocks[i] && currentBlocks[i].css) merged.push(currentBlocks[i].css);
      }
      return merged.join('\n\n').trim();
    }

    var firstVisibleIndex = visibleIndexes[0];
    for (i = 0; i < currentBlocks.length; i++) {
      if (i === firstVisibleIndex) {
        for (var e = 0; e < editedBlocks.length; e++) {
          if (editedBlocks[e] && editedBlocks[e].css) merged.push(String(editedBlocks[e].css || '').trim());
        }
      }
      if (visibleIndexMap[i]) continue;
      if (currentBlocks[i] && currentBlocks[i].css) merged.push(currentBlocks[i].css);
    }

    return merged.join('\n\n').trim();
  };

  CSSBridge.prototype._collectPageStyleBlocks = function (opts) {
    opts = opts || {};
    var doc = this.api && typeof this.api.getIframeDocument === 'function'
      ? this.api.getIframeDocument()
      : null;
    if (!doc) return [];

    var maxBlocks = Number(opts.maxBlocks || 0);
    var maxBytes = this.maxStyleKb * 1024;
    var styles = Array.prototype.slice.call(doc.querySelectorAll('head style'));
    var out = [];
    var consumedBytes = 0;
    var seen = {};

    for (var i = 0; i < styles.length; i++) {
      if (maxBlocks > 0 && out.length >= maxBlocks) break;
      var css = String(styles[i] && styles[i].textContent ? styles[i].textContent : '').trim();
      if (!css) continue;
      var dedupeKey = css.replace(/\s+/g, ' ').trim();
      if (dedupeKey && seen[dedupeKey]) continue;
      if ((consumedBytes + css.length) > maxBytes) continue;
      if (dedupeKey) seen[dedupeKey] = true;
      out.push({
        css: css,
        bytes: css.length
      });
      consumedBytes += css.length;
    }

    return out;
  };

  CSSBridge.prototype._buildPageSummary = function () {
    var doc = this.api.getIframeDocument();
    if (!doc) return '/* CM6GPT: iframe not available */';

    var out = [];
    out.push('/* CM6GPT CSS — Computed View Page Summary (read-only) */');
    out.push('/* Select a Bricks element to see element-level computed snapshot. */');
    out.push('');

    var styles = Array.prototype.slice.call(doc.querySelectorAll('head style'));
    var totalBytes = 0;
    var blocks = this._collectPageStyleBlocks({ maxBlocks: 3 });

    for (var i = 0; i < styles.length; i++) {
      totalBytes += String(styles[i] && styles[i].textContent ? styles[i].textContent : '').length;
    }

    for (var j = 0; j < blocks.length; j++) {
      out.push('/* <style> block #' + (j + 1) + ' (' + blocks[j].bytes + ' chars) */');
      out.push(blocks[j].css);
      out.push('');
    }

    if (!styles.length) {
      out.push('/* No <style> blocks found in iframe head */');
      return out.join('\n');
    }

    out.push('/* Summary */');
    out.push('/* style tags: ' + styles.length + ' */');
    out.push('/* total chars: ' + totalBytes + ' */');
    if (blocks.length < styles.length) {
      out.push('/* shown blocks: ' + blocks.length + ' (truncated for panel safety) */');
    }
    return out.join('\n');
  };

  CSSBridge.prototype._buildPageAuthoredSummary = function () {
    var doc = this.api.getIframeDocument();
    if (!doc) return '/* CM6GPT: iframe not available */';

    var out = [];
    out.push('/* CM6GPT CSS — Authored View Page Summary (read-only) */');
    out.push('/* Select a Bricks element to see matched authored CSS rules. */');
    out.push('');

    var sheets = doc.styleSheets || [];
    out.push('/* stylesheets detected: ' + sheets.length + ' */');
    for (var i = 0; i < Math.min(12, sheets.length); i++) {
      var sheet = sheets[i];
      var label = this._sheetLabel(sheet, i + 1);
      var countText = '?';
      try {
        countText = String(sheet.cssRules ? sheet.cssRules.length : 0);
      } catch (e) { _warn('_buildPageAuthoredSummary', e); 
        countText = 'inaccessible';
      }
      out.push('/* - ' + label + ' · rules: ' + countText + ' */');
    }
    if (sheets.length > 12) {
      out.push('/* - … (' + (sheets.length - 12) + ' more stylesheets) */');
    }
    return out.join('\n');
  };

  CSSBridge.prototype._buildPageCanonicalSummary = function () {
    var pageCustomCss = this._buildPageWriteSnapshot();
    this._setCanonicalInfoCache(this._buildPageCanonicalInfoText(), 'page');
    return String(this._stripCssComments(pageCustomCss) || '').trim();
  };

  // ── Page Live Inspector ──────────────────────────────────────────────
  // Read-only aggregation of per-element CSS on the page.
  // Uses Bricks native CSS generator (includes defaults) + _cssCustom.
  // Respects property filter (class/ID toggle).
  // Auto-refreshes on dom:changed and selection:changed.

  CSSBridge.prototype._buildPageLiveInspectorSummary = function () {
    var self = this;
    var blocks = [];
    var seen = {};
    var scopeRoots = this._getPageScopeRoots();
    var propertyFilter = this._normalizePropertyFilter(this.propertyFilter);
    var tokenState = this._collectPageLensTokens(scopeRoots, {
      propertyFilter: propertyFilter
    });
    var anchorNodes = tokenState.anchorNodes || [];
    // useClassSelector removed — filter logic moved into the loop
    var hasNativePreview = !!(this.api && typeof this.api.getNativeGeneratedCssPreviewByDom === 'function');
    var hasMappedSettings = !!(this.api && typeof this.api.getElementMappedSettingsCssByDom === 'function');

    for (var i = 0; i < anchorNodes.length; i++) {
      var node = anchorNodes[i];
      if (!node || node.nodeType !== 1) continue;

      // Skip scope roots (builder root / body)
      var isRoot = false;
      for (var r = 0; r < scopeRoots.length; r++) {
        if (node === scopeRoots[r]) { isRoot = true; break; }
      }
      if (isRoot) continue;

      var resolvedId = this._resolveElementIdFromDom(node, '');
      if (!resolvedId) continue;
      var idSelector = '#brxe-' + resolvedId;

      // Determine display selector based on filter
      var userClasses = this._getUserClasses(node);
      var classOnlyFilter = !!(propertyFilter.class && !propertyFilter.id);
      var bothFilter = !!(propertyFilter.class && propertyFilter.id);

      // Class-only filter: skip elements without user classes
      if (classOnlyFilter && !userClasses.length) continue;

      var displaySelector = idSelector;
      if (classOnlyFilter || (bothFilter && userClasses.length)) {
        displaySelector = '.' + this._escapeCssIdentifier(userClasses[0]);
      }
      if (seen[displaySelector]) continue;
      seen[displaySelector] = true;

      var cssBlock = '';

      // Strategy 1: Bricks native CSS generator (includes all defaults)
      if (hasNativePreview) {
        var preview = this.api.getNativeGeneratedCssPreviewByDom(node);
        if (preview && preview.ok && preview.css) {
          // Native preview may have rules for both #brxe-id and .class selectors
          var nativeDecls = self._extractDeclarationsFromNativeCssPreview(preview.css, idSelector);
          // Also try extracting by class selector — only when class filter is active
          if (!nativeDecls.length && userClasses.length && propertyFilter.class) {
            for (var uc = 0; uc < userClasses.length && !nativeDecls.length; uc++) {
              nativeDecls = self._extractDeclarationsFromNativeCssPreview(
                preview.css, '.' + self._escapeCssIdentifier(userClasses[uc])
              );
            }
          }
          if (nativeDecls.length) {
            cssBlock = displaySelector + ' {\n' + nativeDecls.map(function (d) {
              return '  ' + d + (!/;\s*$/.test(d) ? ';' : '');
            }).join('\n') + '\n}';
          }
        }
      }

      // Strategy 2: Element's own mapped settings (only explicit GUI values)
      if (!cssBlock && hasMappedSettings) {
        var mapped = this.api.getElementMappedSettingsCssByDom(node);
        if (mapped && mapped.ok && mapped.css) {
          var mappedDecls = String(mapped.css || '').trim().split('\n')
            .map(function (l) { return l.trim(); })
            .filter(function (l) { return l && !/^@bricks-breakpoint/i.test(l) && l !== '{' && l !== '}'; });
          if (mappedDecls.length) {
            cssBlock = displaySelector + ' {\n' + mappedDecls.map(function (d) {
              return '  ' + d + (!/;\s*$/.test(d) ? ';' : '');
            }).join('\n') + '\n}';
          }
        }
      }

      // Strategy 3: Global class CSS (only when class filter is active)
      if (!cssBlock && userClasses.length && self.api && propertyFilter.class) {
        var hasGlobalClassCss = typeof self.api.getGlobalClassCustomCss === 'function';
        var hasGlobalClassMapped = typeof self.api.getGlobalClassMappedSettingsCss === 'function';
        var hasGlobalClassPreview = typeof self.api.getNativeGeneratedCssPreviewForGlobalClass === 'function';
        for (var gc = 0; gc < userClasses.length && !cssBlock; gc++) {
          var gcRef = userClasses[gc];
          var gcDecls = [];
          // Try global class mapped settings
          if (hasGlobalClassMapped) {
            var gcMapped = self.api.getGlobalClassMappedSettingsCss(gcRef);
            if (gcMapped && gcMapped.ok && gcMapped.css) {
              gcDecls = String(gcMapped.css || '').trim().split('\n')
                .map(function (l) { return l.trim(); })
                .filter(function (l) { return l && !/^@bricks-breakpoint/i.test(l) && l !== '{' && l !== '}'; });
            }
          }
          // Try global class custom CSS
          if (!gcDecls.length && hasGlobalClassCss) {
            var gcCustom = self.api.getGlobalClassCustomCss(gcRef);
            if (gcCustom && gcCustom.ok && gcCustom.css) {
              var gcClassSelector = '.' + self._escapeCssIdentifier(gcRef);
              var extracted = self._extractFirstCssRuleForSelector(gcCustom.css, gcClassSelector);
              if (extracted) {
                cssBlock = extracted;
              }
            }
          }
          // Try native generated preview for global class
          if (!gcDecls.length && !cssBlock && hasGlobalClassPreview) {
            var gcPreview = self.api.getNativeGeneratedCssPreviewForGlobalClass(gcRef);
            if (gcPreview && gcPreview.ok && gcPreview.css) {
              var gcPrevSelector = '.' + self._escapeCssIdentifier(gcRef);
              gcDecls = self._extractDeclarationsFromNativeCssPreview(gcPreview.css, gcPrevSelector);
            }
          }
          if (gcDecls.length && !cssBlock) {
            cssBlock = displaySelector + ' {\n' + gcDecls.map(function (d) {
              return '  ' + d + (!/;\s*$/.test(d) ? ';' : '');
            }).join('\n') + '\n}';
          }
        }
      }

      if (cssBlock) {
        blocks.push(cssBlock);
      } else {
        // Show empty stub so element IDs are always visible
        blocks.push(displaySelector + ' {\n}');
      }
    }

    this._setCanonicalInfoCache(this._buildPageCanonicalInfoText(), 'page');

    if (!blocks.length) {
      return '/* No elements found on this page */';
    }

    return blocks.join('\n\n');
  };

  CSSBridge.prototype._extractDeclarationsFromNativeCssPreview = function (cssText, rootSelector) {
    cssText = String(cssText || '').trim();
    rootSelector = String(rootSelector || '').trim();
    if (!cssText) return [];

    var declarations = [];
    // Parse CSS rules — extract declarations from the root selector block
    var re = /([^{]*)\{([^}]*)\}/g;
    var match;
    while ((match = re.exec(cssText)) !== null) {
      var sel = String(match[1] || '').trim();
      var body = String(match[2] || '').trim();
      if (!body) continue;

      // Match root selector: exact match, or contains the root selector
      var isRootRule = (sel === rootSelector) ||
        (rootSelector && sel.indexOf(rootSelector) !== -1 && !/[>~+\s]/.test(sel.replace(rootSelector, '').trim()));

      if (isRootRule) {
        var parts = body.split(';');
        for (var p = 0; p < parts.length; p++) {
          var decl = parts[p].trim();
          if (decl && /^[a-z-]+\s*:/i.test(decl)) {
            declarations.push(decl);
          }
        }
      }
    }
    return declarations;
  };

  CSSBridge.prototype._extractInlineDeclarationsFromCustomCss = function (cssCustom, rootSelector) {
    cssCustom = String(cssCustom || '').trim();
    rootSelector = String(rootSelector || '').trim();
    if (!cssCustom) return [];

    // Bare declarations (no selector/braces)
    if (/^[a-z-]+\s*:/i.test(cssCustom) && cssCustom.indexOf('{') === -1) {
      return cssCustom.split(';').map(function (d) { return d.trim(); }).filter(Boolean);
    }

    // Extract declarations from root selector block
    var declarations = [];
    var re = /([^{]+)\{([^}]*)\}/g;
    var match;
    while ((match = re.exec(cssCustom)) !== null) {
      var sel = String(match[1] || '').trim();
      var body = String(match[2] || '').trim();
      if (sel === rootSelector || sel === '&' || sel === '%root%' || sel === 'root') {
        var parts = body.split(';').map(function (d) { return d.trim(); }).filter(Boolean);
        for (var p = 0; p < parts.length; p++) declarations.push(parts[p]);
      }
    }
    return declarations;
  };

  CSSBridge.prototype._resolveElementIdFromDom = function (el, fallbackId) {
    var fallback = this._normalizeContextIdToken(fallbackId);
    if (!el) return fallback;
    var domId = '';
    if (el.getAttribute) {
      domId = this._normalizeContextIdToken(el.getAttribute('data-id') || el.getAttribute('id') || '');
    }
    if (!domId && this.api && typeof this.api.getElementModelByDom === 'function') {
      var resolved = this.api.getElementModelByDom(el);
      if (resolved && resolved.id) domId = this._normalizeContextIdToken(resolved.id || '');
    }
    return domId || fallback;
  };

  CSSBridge.prototype._buildChildrenScopeSnapshot = function (ctx, opts) {
    opts = opts || {};
    var viewMode = 'canonical';
    var entries = this._collectChildrenScopeEntries(ctx);
    if (!entries.length) {
      return '/* CM6GPT: selected element has no direct Bricks children */';
    }
    var duplicateMessage = this._getChildrenScopeDuplicateChildIdsMessage(entries);
    if (duplicateMessage) {
      return '/* CM6GPT: ' + duplicateMessage + ' prevent safe children scope editing */';
    }

    var out = [];
    out.push('/* CM6GPT CSS — ' + this._modeLabel(viewMode) + ' Children Scope */');
    out.push('/* Source: direct Bricks children of #' + String((ctx && ctx.id) || '?') + ' <' + String((ctx && ctx.tag) || 'div') + '> */');
    out.push('/* Keep @cm6gpt-child-begin/@cm6gpt-child-end markers to apply child-specific edits safely. */');
    out.push('');

    var key = this._contextKey(ctx);

    for (var i = 0; i < entries.length; i++) {
      var childEntry = entries[i];
      var childEl = childEntry.element;
      var childId = childEntry.childId;
      var childTag = String((childEl.tagName || '').toLowerCase() || 'div');
      var childSource = '';
      childSource = this._buildElementCanonicalSnapshot(childEl, childId, { contextInfoKey: 'children-item:' + childId });

      out.push('/* child #' + childEntry.ordinal + ' · #' + childId + ' <' + childTag + '> */');
      out.push('@cm6gpt-child-begin ' + childId + ';');
      out.push(String(childSource || '').trim());
      out.push('@cm6gpt-child-end ' + childId + ';');
      out.push('');
    }

    this._setCanonicalInfoCache(this._buildChildrenCanonicalInfoText(ctx), key);
    return out.join('\n').trim();
  };

  CSSBridge.prototype._extractChildrenScopeBlocks = function (text) {
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    var out = [];
    var byId = {};
    var order = [];
    var re = /@cm6gpt-child-begin\s+([A-Za-z0-9_-]+)\s*;([\s\S]*?)@cm6gpt-child-end\s+\1\s*;/g;
    var m;
    while ((m = re.exec(text))) {
      var id = String(m[1] || '').trim();
      if (!id) continue;
      var body = String(m[2] || '').replace(/^\n+/, '').replace(/\s+$/, '');
      if (!hasOwn(byId, id)) order.push(id);
      byId[id] = body;
    }
    re = /\/\*\s*@cm6gpt-child-begin\s+([A-Za-z0-9_-]+)\s*\*\/([\s\S]*?)\/\*\s*@cm6gpt-child-end\s+\1\s*\*\//g;
    while ((m = re.exec(text))) {
      id = String(m[1] || '').trim();
      if (!id) continue;
      body = String(m[2] || '').replace(/^\n+/, '').replace(/\s+$/, '');
      if (!hasOwn(byId, id)) order.push(id);
      byId[id] = body;
    }
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      out.push({ id: key, css: byId[key] });
    }
    return out;
  };

  CSSBridge.prototype._applySingleChildCssBlock = function (source, childCtx) {
    if (!childCtx || !childCtx.element) throw new Error('missing-child-context');
    var analysis = this.api && typeof this.api.getElementAnalysisById === 'function'
      ? this.api.getElementAnalysisById(childCtx.id, childCtx.element)
      : null;
    var gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);
    var opPolicy = this._resolveApplyOperationPolicy(gate);
    if (opPolicy.level === 'blocked') {
      throw new Error(this._formatApplyOperationBlockedReason(opPolicy));
    }

    var mappedSettingsCss = this._extractEditableMappedSettingsCss(source);
    var hasGlobalClassBlocks = this._extractEditableGlobalClassCssBlocks(source).length > 0;
    var customExtract = this._extractEditableCustomCssOptional(source);
    var hasCustomBlock = !!customExtract.found;
    if (!hasCustomBlock && mappedSettingsCss == null && !hasGlobalClassBlocks) {
      throw new Error('No editable CSS block found');
    }

    var changed = false;
    var mappedCount = 0;
    var globalClassChanged = 0;

    if (hasCustomBlock) {
      if (!this.api || typeof this.api.updateElementCustomCssByDom !== 'function') {
        throw new Error('element-css-write-helper-missing');
      }
      var normalizedCss = this._normalizeEditableCustomCssForElement(customExtract.css, childCtx);
      var res = this.api.updateElementCustomCssByDom(childCtx.element, normalizedCss.css, {
        syncMappedFromCustom: true
      });
      if (!res || !res.ok) {
        throw new Error(res && (res.reason || (res.css && res.css.reason)) ? (res.reason || res.css.reason) : 'child-css-state-write-failed');
      }
      changed = changed || !!res.changed;
      if (res.mapped && res.mapped.changed) {
        mappedCount += (Array.isArray(res.mapped.writes) ? res.mapped.writes.length : 0);
        mappedCount += (Array.isArray(res.mapped.deletes) ? res.mapped.deletes.length : 0);
      }
    }

    if (mappedSettingsCss != null) {
      if (!this.api || typeof this.api.updateElementMappedSettingsByDom !== 'function') {
        throw new Error('mapped-settings-helper-missing');
      }
      var mappedRes = this.api.updateElementMappedSettingsByDom(childCtx.element, mappedSettingsCss);
      if (!mappedRes || !mappedRes.ok) {
        throw new Error(mappedRes && mappedRes.reason ? mappedRes.reason : 'mapped-settings-write-failed');
      }
      changed = changed || !!mappedRes.changed;
      if (mappedRes.mapped && mappedRes.mapped.changed) {
        mappedCount += (Array.isArray(mappedRes.mapped.writes) ? mappedRes.mapped.writes.length : 0);
        mappedCount += (Array.isArray(mappedRes.mapped.deletes) ? mappedRes.mapped.deletes.length : 0);
      }
    }

    if (hasGlobalClassBlocks) {
      var globalClassApply = this._applyEditableGlobalClassCssFromSource(source, childCtx);
      globalClassChanged += Number(globalClassApply && globalClassApply.changedCount || 0);
      if (globalClassApply && globalClassApply.failedCount > 0) {
        throw new Error('global-class-write-failed');
      }
      changed = changed || (globalClassChanged > 0);
    }

    return {
      changed: changed,
      mappedCount: mappedCount,
      globalClassChanged: globalClassChanged
    };
  };

  CSSBridge.prototype._captureChildrenScopeRollbackSnapshot = function (ctx, source) {
    var snapshot = {
      rootId: String((ctx && ctx.id) || ''),
      children: [],
      globalClasses: []
    };
    var entries = this._collectChildrenScopeEntries(ctx);
    for (var i = 0; i < entries.length; i++) {
      var childEl = entries[i].element;
      var childId = entries[i].childId;
      var entry = {
        id: childId,
        element: childEl,
        customCaptured: false,
        customCss: '',
        mappedCaptured: false,
        mappedCss: ''
      };
      if (this.api && typeof this.api.getElementModelByDom === 'function') {
        try {
          var resolved = this.api.getElementModelByDom(childEl);
          var model = resolved && resolved.model ? resolved.model : null;
          var settings = model && model.settings && typeof model.settings === 'object'
            ? model.settings
            : null;
          entry.customCss = settings && typeof settings._cssCustom === 'string'
            ? settings._cssCustom
            : '';
          entry.customCaptured = !!model;
        } catch (eModel) { _warn('_captureChildrenScopeRollbackSnapshot', eModel); }
      }
      if (this.api && typeof this.api.getElementMappedSettingsCssByDom === 'function') {
        try {
          var mappedInfo = this.api.getElementMappedSettingsCssByDom(childEl);
          if (mappedInfo && mappedInfo.ok) {
            entry.mappedCss = mappedInfo.css != null ? String(mappedInfo.css) : '';
            entry.mappedCaptured = true;
          }
        } catch (eMapped) { _warn('_captureChildrenScopeRollbackSnapshot', eMapped); }
      }
      snapshot.children.push(entry);
    }

    var classBlocks = this._extractEditableGlobalClassCssBlocks(source);
    var seenClassRefs = {};
    for (var b = 0; b < classBlocks.length; b++) {
      var block = classBlocks[b];
      var ref = String(block && block.ref || '').trim();
      if (!ref || seenClassRefs[ref]) continue;
      seenClassRefs[ref] = true;
      var classSnapshot = {
        ref: ref,
        captured: false,
        css: ''
      };
      if (this.api && typeof this.api.getGlobalClassCustomCss === 'function') {
        try {
          var classInfo = this.api.getGlobalClassCustomCss(ref);
          if (classInfo && classInfo.ok) {
            classSnapshot.captured = true;
            classSnapshot.css = classInfo.css != null ? String(classInfo.css) : '';
          }
        } catch (eClass) { _warn('_captureChildrenScopeRollbackSnapshot', eClass); }
      }
      snapshot.globalClasses.push(classSnapshot);
    }

    return snapshot;
  };

  CSSBridge.prototype._restoreChildrenScopeRollbackSnapshot = function (snapshot) {
    snapshot = snapshot || {};
    var children = Array.isArray(snapshot.children) ? snapshot.children : [];
    for (var i = children.length - 1; i >= 0; i--) {
      var item = children[i];
      if (!item || !item.element) continue;
      if (item.customCaptured && this.api && typeof this.api.updateElementCustomCssByDom === 'function') {
        try {
          this.api.updateElementCustomCssByDom(item.element, item.customCss, {
            syncMappedFromCustom: false,
            deferUiRefresh: true
          });
        } catch (eCustom) { _warn('_restoreChildrenScopeRollbackSnapshot', eCustom); }
      }
      if (item.mappedCaptured && this.api && typeof this.api.updateElementMappedSettingsByDom === 'function') {
        try {
          this.api.updateElementMappedSettingsByDom(item.element, item.mappedCss, {
            deferUiRefresh: true
          });
        } catch (eMapped) { _warn('_restoreChildrenScopeRollbackSnapshot', eMapped); }
      }
    }

    var classSnapshots = Array.isArray(snapshot.globalClasses) ? snapshot.globalClasses : [];
    for (var c = classSnapshots.length - 1; c >= 0; c--) {
      var classItem = classSnapshots[c];
      if (!classItem || !classItem.captured || !classItem.ref) continue;
      if (!this.api || typeof this.api.updateGlobalClassCustomCss !== 'function') continue;
      try {
        this.api.updateGlobalClassCustomCss(classItem.ref, classItem.css, { deferUiRefresh: true });
      } catch (eClass) { _warn('_restoreChildrenScopeRollbackSnapshot', eClass); }
    }

    try {
      if (this.api && typeof this.api._touchBuilderUi === 'function') {
        this.api._touchBuilderUi();
      }
      var rootId = String(snapshot.rootId || '');
      if (rootId && this.api && typeof this.api.renderElementInBuilder === 'function') {
        this.api.renderElementInBuilder(rootId);
      }
    } catch (eRender) { _warn('_restoreChildrenScopeRollbackSnapshot', eRender); }
  };

  CSSBridge.prototype._applyChildrenScopeCss = function (source, ctx, options) {
    options = options || {};
    var ctxKey = this._contextKey(ctx);
    var currentChildrenSignature = this._getChildrenScopeIdentitySignature(ctx);
    if (
      ctxKey &&
      this._lastRenderedContextKey === ctxKey &&
      this._lastRenderedChildrenScopeSignature &&
      currentChildrenSignature &&
      this._lastRenderedChildrenScopeSignature !== currentChildrenSignature
    ) {
      throw new Error('Children scope apply blocked: child identity/order changed since snapshot render; refresh panel before applying');
    }
    var entries = this._collectChildrenScopeEntries(ctx);
    var realChildCount = entries.length;
    if (!realChildCount) {
      throw new Error('Children scope: selected element has no direct Bricks children');
    }
    var duplicateChildIds = this._getChildrenScopeDuplicateChildIds(entries);
    if (duplicateChildIds.length) {
      throw new Error('Children scope apply blocked: duplicate child ids in current context (' + duplicateChildIds.join(', ') + ')');
    }

    var blocks = this._extractChildrenScopeBlocks(source);
    var byId = {};
    for (var b = 0; b < blocks.length; b++) {
      var entry = blocks[b];
      if (!entry || !entry.id) continue;
      byId[String(entry.id)] = String(entry.css || '');
    }
    var useSingleFallback = blocks.length === 0 && realChildCount === 1;
    if (!useSingleFallback && blocks.length === 0 && realChildCount > 1) {
      throw new Error('Children scope apply requires @cm6gpt-child-begin <id>; ... @cm6gpt-child-end <id>; blocks');
    }

    var summary = {
      attempted: 0,
      changed: 0,
      unchanged: 0,
      failed: 0,
      mappedCount: 0,
      globalClassChanged: 0,
      errors: []
    };

    for (var i = 0; i < entries.length; i++) {
      var childEl = entries[i].element;
      var childId = entries[i].childId;
      var childSource = useSingleFallback ? String(source || '') : byId[childId];
      if (childSource == null) continue;
      summary.attempted++;
      try {
        var childCtx = {
          mode: 'element',
          scope: 'self',
          id: childId,
          tag: String((childEl.tagName || '').toLowerCase() || 'div'),
          element: childEl,
          elements: [childEl]
        };
        var applied = this._applySingleChildCssBlock(childSource, childCtx);
        summary.mappedCount += Number(applied.mappedCount || 0);
        summary.globalClassChanged += Number(applied.globalClassChanged || 0);
        if (applied.changed) summary.changed++;
        else summary.unchanged++;
      } catch (err) { _warn('_applyChildrenScopeCss', err); 
        summary.failed++;
        var msg = err && err.message ? String(err.message) : String(err || 'child-apply-failed');
        summary.errors.push('#' + childId + ': ' + msg);
      }
    }

    if (!summary.attempted) {
      throw new Error('Children scope apply: no matching child blocks for current selection');
    }
    return summary;
  };

  CSSBridge.prototype._getUserClasses = function (el) {
    return Array.prototype.slice.call(el && el.classList ? el.classList : []).filter(function (name) {
      return !!name && !CSSBridge.prototype._isBuilderRuntimeClass(name);
    });
  };

  CSSBridge.prototype._getRuntimeClasses = function (el) {
    return Array.prototype.slice.call(el && el.classList ? el.classList : []).filter(function (name) {
      return !!name && CSSBridge.prototype._isBuilderRuntimeClass(name);
    });
  };

  // MAINTENANCE NOTE: This list of Bricks builder runtime class prefixes must be
  // updated whenever Bricks introduces new runtime/internal class prefixes.
  // Last verified against: Bricks 2.2.x (2026-04).
  CSSBridge.prototype._isBuilderRuntimeClass = function (name) {
    if (!name) return true;
    return (
      /^brxe-/.test(name) ||
      /^brx-/.test(name) ||
      /^brxc-/.test(name) ||
      /^bricks-/.test(name) ||
      /^is-active-/.test(name) ||
      /^is-hover-/.test(name) ||
      /^sortable/.test(name) ||
      /^ui-/.test(name) ||
      /^vue-/.test(name) ||
      /^selected$/.test(name) ||
      /^active$/.test(name)
    );
  };

  CSSBridge.prototype._selectorFor = function (el, id) {
    var tag = (el.tagName || 'div').toLowerCase();
    var classes = this._getUserClasses(el);
    if (el.id && !/^brxe-/.test(el.id) && !/^brx-/.test(el.id)) {
      return tag + '#' + el.id;
    }
    if (classes.length) {
      return tag + '.' + classes.slice(0, 4).join('.');
    }
    if (id) {
      return tag + '[data-bid="' + String(id).replace(/"/g, '\\"') + '"]';
    }
    return tag;
  };

  CSSBridge.prototype._getInterestingAttributes = function (el) {
    if (!el || !el.attributes) return [];
    var out = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr && attr.name ? String(attr.name) : '';
      if (!name) continue;
      if (name === 'class' || name === 'style' || name === 'data-id') continue;
      if (name === 'id') continue;
      if (/^data-brx/.test(name) || /^data-v-/.test(name)) continue;
      if (/^aria-/.test(name) || /^role$/.test(name) || /^data-/.test(name) || /^item/.test(name)) {
        out.push(name + (attr.value ? '=' + JSON.stringify(attr.value) : ''));
      }
    }
    return out;
  };

  CSSBridge.prototype._collectMatchingAuthoredRules = function (el) {
    var doc = this.api.getIframeDocument();
    if (!doc || !doc.styleSheets) return [];

    var out = [];
    var stats = { count: 0, chars: 0, maxCount: 24, maxChars: 24000 };

    for (var i = 0; i < doc.styleSheets.length; i++) {
      if (stats.count >= stats.maxCount || stats.chars >= stats.maxChars) break;
      var sheet = doc.styleSheets[i];
      var rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) { _warn('_collectMatchingAuthoredRules', e); 
        continue;
      }
      if (!rules) continue;
      this._walkRulesForMatches(rules, el, out, stats, this._sheetLabel(sheet, i + 1), []);
    }

    return out;
  };

  CSSBridge.prototype._walkRulesForMatches = function (rules, el, out, stats, sheetLabel, groupStack) {
    if (!rules || !rules.length) return;
    groupStack = groupStack || [];

    for (var i = 0; i < rules.length; i++) {
      if (stats.count >= stats.maxCount || stats.chars >= stats.maxChars) return;
      var rule = rules[i];
      if (!rule) continue;

      var type = Number(rule.type || 0);
      var isStyleRule = !!rule.selectorText && !!rule.style;
      var isGroupRule = !!rule.cssRules && !isStyleRule;

      if (isStyleRule) {
        if (!this._ruleMatchesElement(rule, el)) continue;
        var block = this._formatMatchedRule(rule, sheetLabel, groupStack);
        if (!block) continue;
        stats.count++;
        stats.chars += block.length;
        out.push(block);
        continue;
      }

      if (isGroupRule && (type === 4 || type === 12 || type === 25 || type === 3 || !type)) {
        var label = this._groupRuleLabel(rule);
        if (label) groupStack.push(label);
        this._walkRulesForMatches(rule.cssRules, el, out, stats, sheetLabel, groupStack);
        if (label) groupStack.pop();
      }
    }
  };

  CSSBridge.prototype._ruleMatchesElement = function (rule, el) {
    if (!rule || !rule.selectorText || !el || typeof el.matches !== 'function') return false;
    try {
      return !!el.matches(rule.selectorText);
    } catch (e) { _warn('_ruleMatchesElement', e); 
      return false;
    }
  };

  CSSBridge.prototype._formatMatchedRule = function (rule, sheetLabel, groupStack) {
    if (!rule || !rule.selectorText || !rule.style) return '';

    var out = [];
    out.push('/* Match from: ' + sheetLabel + ' */');
    if (groupStack && groupStack.length) {
      out.push('/* Context: ' + groupStack.join(' > ') + ' */');
    }
    out.push(rule.selectorText + ' {');

    var style = rule.style;
    if (!style.length) {
      out.push('  /* empty rule */');
    } else {
      for (var i = 0; i < style.length; i++) {
        var name = style[i];
        var val = style.getPropertyValue(name);
        var priority = style.getPropertyPriority(name);
        out.push('  ' + name + ': ' + String(val || '').trim() + (priority ? ' !important' : '') + ';');
      }
    }
    out.push('}');

    return out.join('\n');
  };

  CSSBridge.prototype._groupRuleLabel = function (rule) {
    if (!rule) return '';
    if (rule.conditionText) return '@' + (rule.constructor && rule.constructor.name ? rule.constructor.name.replace(/Rule$/, '').toLowerCase() : 'group') + ' ' + rule.conditionText;
    if (rule.name) return '@layer ' + rule.name;
    if (rule.cssText) {
      var head = String(rule.cssText).split('{')[0].trim();
      return head || '@group';
    }
    return '@group';
  };

  CSSBridge.prototype._sheetLabel = function (sheet, idx) {
    if (!sheet) return 'stylesheet #' + idx;
    var href = sheet.href ? String(sheet.href) : '';
    if (href) return href;
    var owner = sheet.ownerNode;
    if (owner && owner.tagName) {
      return '<' + owner.tagName.toLowerCase() + '> #' + idx;
    }
    return 'inline stylesheet #' + idx;
  };

  CSSBridge.prototype._findElementModelById = function (root, targetId) {
    targetId = String(targetId || '');
    if (!root || !targetId) return null;

    var commonCandidates = [];
    try {
      if (root.elements) commonCandidates.push(root.elements);
      if (root.content) commonCandidates.push(root.content);
      if (root.pageData) commonCandidates.push(root.pageData);
      if (root.pageData && root.pageData.elements) commonCandidates.push(root.pageData.elements);
      if (root.builderStates) commonCandidates.push(root.builderStates);
    } catch (e) { _warn('_findElementModelById', e); }

    for (var c = 0; c < commonCandidates.length; c++) {
      var quick = this._findElementModelByIdDeep(commonCandidates[c], targetId, 3000);
      if (quick) return quick;
    }

    return this._findElementModelByIdDeep(root, targetId, 5000);
  };

  CSSBridge.prototype._findElementModelByIdDeep = function (root, targetId, maxNodes) {
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
      } catch (e) { _warn('_findElementModelByIdDeep', e); }

      if (Array.isArray(node)) {
        for (var i = node.length - 1; i >= 0; i--) stack.push(node[i]);
        continue;
      }

      var keys = [];
      try {
        keys = Object.keys(node);
      } catch (e2) { _warn('_findElementModelByIdDeep', e2); 
        keys = [];
      }

      for (var k = keys.length - 1; k >= 0; k--) {
        var key = keys[k];
        if (key === 'el' || key === '$el' || key === 'parentNode' || key === 'ownerDocument') continue;
        var child;
        // W29: Vue/Proxy objects may throw on property access via traps.
        try { child = node[key]; } catch (e3) { _warn('_findElementModelByIdDeep', e3);  child = null; }
        if (!child) continue;
        try {
          if (typeof Node !== 'undefined' && child instanceof Node) continue;
        } catch (eProxy) { _warn('_findElementModelByIdDeep', eProxy);  continue; }
        if (typeof child === 'object' || typeof child === 'function') stack.push(child);
      }
    }

    return null;
  };

  CSSBridge.prototype._fmtValue = function (value) {
    var str;
    if (typeof value === 'string') {
      str = JSON.stringify(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      str = String(value);
    } else if (value == null) {
      str = 'null';
    } else {
      try {
        str = JSON.stringify(value);
      } catch (e) {
        try { str = String(value); } catch (e2) { _warn('_fmtValue', e2);  str = '[unserializable]'; }
      }
    }

    if (str.length > 180) {
      str = str.slice(0, 177) + '...';
    }
    return str;
  };

  CSSBridge.prototype.destroy = function () {
    this._clearHoverPreview();
    this._clearPendingPageSelectionTimer();
    this._clearPendingTypingRefreshTimer();
    if (this._refreshDebounced && typeof this._refreshDebounced.cancel === 'function') {
      this._refreshDebounced.cancel();
    }
    if (this._autoApplyDebounced && typeof this._autoApplyDebounced.cancel === 'function') {
      this._autoApplyDebounced.cancel();
    }
    this._unsubs.forEach(function (u) {
      try { if (typeof u === 'function') u(); } catch (e) { _warn('destroy', e); }
    });
    this._unsubs = [];
  };

  ns.cssBridgeInternals = ns.cssBridgeInternals || {};
  ns.cssBridgeInternals.createManagedTimeout = createManagedTimeout;
  ns.CSSBridge = CSSBridge;
})(window);
