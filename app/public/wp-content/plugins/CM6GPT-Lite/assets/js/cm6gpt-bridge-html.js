(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][bridge-html]', context, err); } catch (_) { /* noop */ }
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  var hasOwn = ns.hasOwn || function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function getBridgeTiming() {
    if (!ns.BridgeTiming || typeof ns.BridgeTiming.debounce !== 'function') {
      throw new Error('CM6GPT.BridgeTiming helper missing');
    }
    return ns.BridgeTiming;
  }

  function getBridgeGateUx() {
    if (!ns.BridgeGateUx || typeof ns.BridgeGateUx.normalizeGateForUx !== 'function') {
      throw new Error('CM6GPT.BridgeGateUx helper missing');
    }
    return ns.BridgeGateUx;
  }

  function getBridgeAnalysisLens() {
    if (!ns.BridgeAnalysisLens || typeof ns.BridgeAnalysisLens.readSummary !== 'function') {
      throw new Error('CM6GPT.BridgeAnalysisLens helper missing');
    }
    return ns.BridgeAnalysisLens;
  }

  function getBridgeStatusUx() {
    if (!ns.BridgeStatusUx || typeof ns.BridgeStatusUx.setPanelStatus !== 'function') {
      throw new Error('CM6GPT.BridgeStatusUx helper missing');
    }
    return ns.BridgeStatusUx;
  }

  function getBridgeFacadeUtils() {
    if (!ns.BridgeFacadeUtils || typeof ns.BridgeFacadeUtils.installStatusApplyFacade !== 'function') {
      throw new Error('CM6GPT.BridgeFacadeUtils helper missing');
    }
    return ns.BridgeFacadeUtils;
  }

  function getBridgeScopeContext() {
    if (!ns.BridgeScopeContext || typeof ns.BridgeScopeContext.getScopedContext !== 'function') {
      throw new Error('CM6GPT.BridgeScopeContext helper missing');
    }
    return ns.BridgeScopeContext;
  }

  function getBridgeApplyPolicy() {
    if (!ns.BridgeApplyPolicy || typeof ns.BridgeApplyPolicy.resolve !== 'function') {
      throw new Error('CM6GPT.BridgeApplyPolicy helper missing');
    }
    return ns.BridgeApplyPolicy;
  }

  function getBridgeRuntimeUtils() {
    if (
      !ns.BridgeRuntimeUtils
      || typeof ns.BridgeRuntimeUtils.runApplyTransaction !== 'function'
      || typeof ns.BridgeRuntimeUtils.createManagedTimeout !== 'function'
      || typeof ns.BridgeRuntimeUtils.escapeCssAttrSelectorValue !== 'function'
    ) {
      throw new Error('CM6GPT.BridgeRuntimeUtils helper missing');
    }
    return ns.BridgeRuntimeUtils;
  }

  function escapeCssAttrSelectorValue(text) {
    return getBridgeRuntimeUtils().escapeCssAttrSelectorValue(text, _warn);
  }

  function createManagedTimeout(timerApi) {
    return getBridgeRuntimeUtils().createManagedTimeout(timerApi);
  }

  function getBridgeCanonicalReport() {
    if (!ns.BridgeCanonicalReport || typeof ns.BridgeCanonicalReport.buildReport !== 'function') {
      throw new Error('CM6GPT.BridgeCanonicalReport helper missing');
    }
    return ns.BridgeCanonicalReport;
  }

  function getBridgeManualRefresh() {
    if (!ns.BridgeManualRefresh || typeof ns.BridgeManualRefresh.requestReport !== 'function') {
      throw new Error('CM6GPT.BridgeManualRefresh helper missing');
    }
    return ns.BridgeManualRefresh;
  }

  function HTMLBridge(opts) {
    opts = opts || {};
    this.api = opts.api;
    this.editor = opts.editor;
    this.panel = opts.panel;
    this.readOnly = opts.readOnly !== false;
    this.liveSync = {
      enabled: opts.liveSync !== false,
      debounceMs: Math.max(60, Number(opts.liveSyncDebounceMs || 180)),
      allowGuarded: !!opts.liveSyncAllowGuarded,
      classDebounceMs: Math.max(700, Number(opts.liveSyncClassDebounceMs || 800)),
      // Page-mode edits should feel close to element-mode live sync, while class edits
      // still get delayed later by the class-specific idle guard.
      pageDebounceMs: Math.max(60, Number(opts.liveSyncPageDebounceMs || opts.liveSyncDebounceMs || 180))
    };
    this.scopeMode = this._normalizeScopeMode(
      opts.scopeMode || (this.panel && typeof this.panel.getScopeMode === 'function' ? this.panel.getScopeMode() : 'self')
    );
    this.layerMode = this._normalizeLayerMode(
      opts.layerMode || (this.panel && typeof this.panel.getLayerMode === 'function' ? this.panel.getLayerMode() : 'l2')
    );
    this.htmlLensMode = this._normalizeHtmlLensMode(
      opts.htmlLensMode || (this.panel && typeof this.panel.getHtmlLensMode === 'function' ? this.panel.getHtmlLensMode() : 'all')
    );
    this._lastHtml = null;
    this._dirty = false;
    this._dirtySelectionId = '';
    this._dirtyContextMode = '';
    this._editSeq = 0;
    this._lastEditAt = 0;
    this._lastEditSelectionId = '';
    this._applying = false;
    this._lastAutoStatus = '';
    this.statusPolicy = {
      dedupeMs: Math.max(120, Number(opts.statusDedupeMs || 260)),
      autoThrottleMs: Math.max(420, Number(opts.statusAutoThrottleMs || 900))
    };
    this._statusCache = {};
    this._hoverPreviewBricksId = '';
    this._ignorePageSelectionUntil = 0;
    this._pendingPageSelectionTimer = createManagedTimeout(opts.timerApi);
    this._lastRenderedContextKey = '';
    this._lastRenderedLayerMode = '';
    this._lastRenderedHtmlLensMode = '';
    this._unsubs = [];
    this._refreshDebounced = getBridgeTiming().debounce(this.refresh.bind(this), Number(opts.debounceMs || 120));
    this._autoApplyDebounced = getBridgeTiming().debounce(this._runAutoApply.bind(this), this.liveSync.debounceMs);
    this._autoApplyClassDebounced = getBridgeTiming().debounce(this._runAutoApply.bind(this), this.liveSync.classDebounceMs);
    this._autoApplyPageDebounced = getBridgeTiming().debounce(this._runAutoApply.bind(this), this.liveSync.pageDebounceMs);
    this.fullStructureSync = opts.fullStructureSync !== false;
  }

  getBridgeFacadeUtils().installStatusApplyFacade(HTMLBridge.prototype, {
    kind: 'HTML',
    lane: 'html',
    getStatusUx: getBridgeStatusUx,
    getApplyPolicy: getBridgeApplyPolicy,
    getRuntimeUtils: getBridgeRuntimeUtils
  });

  HTMLBridge.prototype.start = function () {
    var self = this;
    if (!this.api || !this.editor) return;

    this._unsubs.push(this.api.on('builder:ready', function () { self.refresh({ force: true }); }));
    this._unsubs.push(this.api.on('dom:changed', function () { self._refreshDebounced(); }));
    this._unsubs.push(this.api.on('selection:changed', function (ctx) {
      self._clearHoverPreview();
      var nowTs = Date.now ? Date.now() : +new Date();
      var shouldDelayPageSelection = false;
      var scopeSelf = self._normalizeScopeMode(self.scopeMode) === 'self';
      if (scopeSelf && ctx && ctx.mode === 'page' && String(self._lastRenderedContextKey || '') !== 'page') {
        if (self._applying) return;
        if (self._ignorePageSelectionUntil && nowTs < self._ignorePageSelectionUntil) return;
        var selectedId = self.api && typeof self.api.getSelectedElementId === 'function'
          ? String(self.api.getSelectedElementId() || '')
          : '';
        if (selectedId) return;
        var doc = (typeof document !== 'undefined') ? document : null;
        var panelRoot = self.panel && self.panel.root;
        var activeEl = doc && doc.activeElement ? doc.activeElement : null;
        var panelFocused = !!(panelRoot && panelRoot.contains && activeEl && panelRoot.contains(activeEl));
        var quietMs = Math.max(320, Number((self.liveSync && self.liveSync.debounceMs) || 180) + 260);
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
          if (self._autoApplyClassDebounced && typeof self._autoApplyClassDebounced.cancel === 'function') {
            self._autoApplyClassDebounced.cancel();
          }
          if (self._autoApplyPageDebounced && typeof self._autoApplyPageDebounced.cancel === 'function') {
            self._autoApplyPageDebounced.cancel();
          }
          self._updateSelectionMeta(liveCtx);
          self._dirty = false;
          self._dirtySelectionId = '';
          self._dirtyContextMode = '';
          self._lastAutoStatus = '';
          self._lastEditSelectionId = '';
          self._statusCache = {};
          self.refresh({ force: true });
        }, 220);
        return;
      }
      self._clearPendingPageSelectionTimer();
      if (self._autoApplyDebounced && typeof self._autoApplyDebounced.cancel === 'function') {
        self._autoApplyDebounced.cancel();
      }
      if (self._autoApplyClassDebounced && typeof self._autoApplyClassDebounced.cancel === 'function') {
        self._autoApplyClassDebounced.cancel();
      }
      if (self._autoApplyPageDebounced && typeof self._autoApplyPageDebounced.cancel === 'function') {
        self._autoApplyPageDebounced.cancel();
      }
      self._updateSelectionMeta(ctx);
      self._dirty = false;
      self._dirtySelectionId = '';
      self._dirtyContextMode = '';
      self._lastAutoStatus = '';
      self._lastEditSelectionId = '';
      self._statusCache = {};
      self.refresh({ force: true });
    }));

    if (this.panel && typeof this.panel.onScopeModeChange === 'function') {
      this.panel.onScopeModeChange(function (mode) {
        self.setScopeMode(mode);
      });
    }
    if (this.panel && typeof this.panel.onLayerModeChange === 'function') {
      this.panel.onLayerModeChange(function (mode) {
        self.setLayerMode(mode);
      });
    }
    if (this.panel && typeof this.panel.onHtmlLensModeChange === 'function') {
      this.panel.onHtmlLensModeChange(function (mode) {
        self.setHtmlLensMode(mode);
      });
    }

    if (typeof this.editor.onChange === 'function') {
      this.editor.onChange(function () {
        if (self.readOnly) {
          self._setPanelStatus('HTML editor is read-only in Phase 1 (CM6 adapter active, sync write path not yet migrated)', { channel: 'edit' });
          return;
        }
        var ctx = self._getScopedContext();
        var analysis = ctx && ctx.mode === 'element' ? self._getAnalysis(ctx) : null;
        self._editSeq++;
        self._lastEditAt = Date.now ? Date.now() : +new Date();
        self._dirty = true;
        self._dirtySelectionId = ctx && ctx.mode === 'element' ? String(ctx.id || '') : '';
        self._dirtyContextMode = ctx && ctx.mode ? String(ctx.mode) : '';
        self._lastEditSelectionId = self._dirtySelectionId;
        self._syncApplyButtonState(ctx, analysis);

        if (self._canAutoApply(ctx, analysis)) {
          if (ctx && ctx.mode === 'page') {
            self._queueAutoApplyPage();
            self._setPanelStatus('HTML edited · Page live sync queued (' + self.liveSync.pageDebounceMs + 'ms idle)', { channel: 'edit' });
          } else {
            self._queueAutoApply();
            self._setPanelStatus('HTML edited · Live sync queued (' + self.liveSync.debounceMs + 'ms)', { channel: 'edit' });
          }
          return;
        }

        var gate = analysis && analysis.applyGate ? self._normalizeGateForUx(analysis.applyGate) : null;
        if (self._isAuthorLayer()) {
          self._setPanelStatus('HTML edited (unsaved) · L1 Author read layer · switch to L2 to apply', { channel: 'edit' });
        } else if (gate && gate.level === 'guarded' && !self.liveSync.allowGuarded) {
          self._setPanelStatus('HTML edited (unsaved) · gate:guarded · live sync allow-only · use Apply HTML', { channel: 'edit' });
        } else if (gate && gate.level === 'blocked') {
          self._setPanelStatus('HTML edited (unsaved) · gate:blocked · Apply HTML disabled by guard', { channel: 'edit' });
        } else {
          self._setPanelStatus('HTML edited (unsaved) · gate:allow · Use Apply HTML to sync', { channel: 'edit' });
        }
      });
    }

    if (typeof this.editor.onHover === 'function') {
      this.editor.onHover(function (payload) {
        self._handleEditorHoverPreview(payload);
      });
    }

    try {
      this._updateSelectionMeta(this._getScopedContext());
    } catch (metaErr) {
      this._setPanelStatus('HTML meta init warning · ' + (metaErr && metaErr.message ? metaErr.message : String(metaErr)), { channel: 'init' });
    }
    try {
      this.refresh();
    } catch (refreshErr) {
      this._setPanelStatus('HTML snapshot init warning · ' + (refreshErr && refreshErr.message ? refreshErr.message : String(refreshErr)), { channel: 'init' });
    }
  };

  HTMLBridge.prototype._normalizeScopeMode = function (mode) {
    var next = getBridgeScopeContext().normalizeScopeMode(mode);
    return next === 'page' ? 'page' : 'self';
  };

  HTMLBridge.prototype._normalizeLayerMode = function (mode) {
    return getBridgeScopeContext().normalizeLayerMode(mode);
  };

  HTMLBridge.prototype._layerModeLabel = function (mode, human) {
    return getBridgeScopeContext().layerModeLabel(this, mode, human);
  };

  HTMLBridge.prototype._isAuthorLayer = function () {
    return getBridgeScopeContext().isAuthorLayer(this);
  };

  HTMLBridge.prototype._normalizeHtmlLensMode = function (mode) {
    void mode;
    return 'minimal';
  };

  HTMLBridge.prototype._analysisLensModeLabel = function (mode, human) {
    return getBridgeAnalysisLens().modeLabel(mode, human);
  };

  HTMLBridge.prototype._normalizeGateLevel = function (level) {
    return getBridgeGateUx().normalizeGateLevel(level);
  };

  HTMLBridge.prototype._normalizeGuardReasonText = function (reason) {
    return getBridgeGateUx().normalizeGuardReasonText(reason);
  };

  HTMLBridge.prototype._normalizeGateForUx = function (gate) {
    return getBridgeGateUx().normalizeGateForUx(gate);
  };

  HTMLBridge.prototype._analysisLensReadGroups = function (analysis, lensMode) {
    lensMode = this._normalizeHtmlLensMode(lensMode || this.htmlLensMode);
    return getBridgeAnalysisLens().readGroups(analysis, lensMode);
  };

  HTMLBridge.prototype._analysisLensReadSummary = function (analysis, opts) {
    opts = opts || {};
    var lensMode = hasOwn(opts, 'lensMode') ? opts.lensMode : this.htmlLensMode;
    return getBridgeAnalysisLens().readSummary(analysis, {
      lensMode: this._normalizeHtmlLensMode(lensMode),
      separator: opts.separator
    });
  };

  HTMLBridge.prototype._getHtmlLensState = function (ctx, analysis) {
    var mode = this._normalizeHtmlLensMode(this.htmlLensMode);
    if (mode === 'all' || mode === 'minimal') {
      return { active: false, mode: mode, hasMatch: true };
    }
    if (!ctx || ctx.mode === 'page') {
      return { active: true, mode: mode, hasMatch: false };
    }
    if (ctx.mode !== 'element') {
      return { active: true, mode: mode, hasMatch: false };
    }
    var resolvedAnalysis = analysis || null;
    if (!resolvedAnalysis) {
      try {
        resolvedAnalysis = this._getAnalysis(ctx);
      } catch (e) { _warn('_getHtmlLensState', e); 
        resolvedAnalysis = null;
      }
    }
    var hasMatch = false;
    try {
      hasMatch = this._analysisLensEntries(resolvedAnalysis, mode).length > 0;
    } catch (e1) { _warn('_getHtmlLensState', e1); 
      hasMatch = false;
    }
    return {
      active: true,
      mode: mode,
      hasMatch: hasMatch
    };
  };

  HTMLBridge.prototype._getScopedContext = function () {
    return getBridgeScopeContext().getScopedContext(this);
  };

  HTMLBridge.prototype._contextKey = function (ctx) {
    if (!ctx) return 'none';
    if (ctx.mode === 'page') return 'page';
    if (ctx.mode !== 'element') return String(ctx.mode || 'unknown');
    var scope = this._normalizeScopeMode(ctx.scope);
    return 'element:' + String(scope || 'self') + ':' + String(ctx.id || '');
  };

  HTMLBridge.prototype._isHtmlEditorLikelyFocused = function () {
    var doc = (typeof document !== 'undefined') ? document : null;
    if (!doc) return false;
    var activeEl = doc.activeElement;
    if (!activeEl) return false;
    var panelRoot = this.panel && this.panel.root;
    if (!panelRoot || !panelRoot.contains || !panelRoot.contains(activeEl)) return false;
    var htmlMount = this.panel && this.panel.htmlMount;
    if (htmlMount && htmlMount.contains) {
      return !!htmlMount.contains(activeEl);
    }
    return true;
  };

  HTMLBridge.prototype._shouldPreserveEditorViewOnRefresh = function (ctx, ctxKey) {
    if (!this._isHtmlEditorLikelyFocused()) return false;
    ctxKey = ctxKey || this._contextKey(ctx);
    if (ctxKey && ctxKey === String(this._lastRenderedContextKey || '')) return true;

    if (this._dirty) {
      if (ctx && ctx.mode === 'element' && String(ctx.id || '') === String(this._dirtySelectionId || '')) return true;
      if (ctx && ctx.mode === 'page' && String(this._dirtyContextMode || '') === 'page') return true;
    }

    var nowTs = Date.now ? Date.now() : +new Date();
    var quietMs = Math.max(320, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 260);
    return !!this._lastEditAt && (nowTs - this._lastEditAt) < quietMs;
  };

  HTMLBridge.prototype._clearPendingPageSelectionTimer = function () {
    if (!this._pendingPageSelectionTimer || typeof this._pendingPageSelectionTimer.clear !== 'function') return false;
    return this._pendingPageSelectionTimer.clear();
  };

  HTMLBridge.prototype._cancelPendingAutoApply = function () {
    if (this._autoApplyDebounced && typeof this._autoApplyDebounced.cancel === 'function') {
      this._autoApplyDebounced.cancel();
    }
    if (this._autoApplyClassDebounced && typeof this._autoApplyClassDebounced.cancel === 'function') {
      this._autoApplyClassDebounced.cancel();
    }
    if (this._autoApplyPageDebounced && typeof this._autoApplyPageDebounced.cancel === 'function') {
      this._autoApplyPageDebounced.cancel();
    }
  };

  HTMLBridge.prototype._clearDirtyEditState = function () {
    this._dirty = false;
    this._dirtySelectionId = '';
    this._dirtyContextMode = '';
    this._lastAutoStatus = '';
    this._lastEditSelectionId = '';
    this._statusCache = {};
  };

  HTMLBridge.prototype._invalidatePendingEditState = function () {
    this._clearPendingPageSelectionTimer();
    this._cancelPendingAutoApply();
    this._clearDirtyEditState();
  };

  HTMLBridge.prototype.setScopeMode = function (mode) {
    var next = this._normalizeScopeMode(mode);
    if (next === this.scopeMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.scopeMode = next;
    this._updateSelectionMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  HTMLBridge.prototype.setLayerMode = function (mode) {
    var next = this._normalizeLayerMode(mode);
    if (next === this.layerMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.layerMode = next;
    this._updateSelectionMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  HTMLBridge.prototype.setHtmlLensMode = function (mode) {
    var next = this._normalizeHtmlLensMode(mode);
    if (next === this.htmlLensMode) return;
    this._invalidatePendingEditState();
    this._clearHoverPreview();
    this.htmlLensMode = next;
    this._updateSelectionMeta(this._getScopedContext());
    this.refresh({ force: true });
  };

  HTMLBridge.prototype._extractHoverBricksIdFromLine = function (lineText) {
    var line = String(lineText == null ? '' : lineText).trim();
    if (!line || line.length > 600) return '';
    if (/^<!--/.test(line) || /^\/\*/.test(line)) return '';

    var match = line.match(/\bdata-bid\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    if (!match) return '';

    var bid = String(match[1] || match[2] || '').trim();
    if (!bid || bid.length > 200) return '';
    return bid;
  };

  HTMLBridge.prototype._buildHoverSelectorForBricksId = function (bricksId) {
    var bid = String(bricksId == null ? '' : bricksId).trim();
    if (!bid) return '';
    var escaped = escapeCssAttrSelectorValue(bid);
    if (!escaped) return '';
    return '[data-id="' + escaped + '"]';
  };

  HTMLBridge.prototype._clearHoverPreview = function () {
    this._hoverPreviewBricksId = '';
    if (!this.api || typeof this.api.clearCssHoverPreview !== 'function') return;
    try { this.api.clearCssHoverPreview(); } catch (e) { _warn('_clearHoverPreview', e); }
  };

  HTMLBridge.prototype._handleEditorHoverPreview = function (payload) {
    if (!this.api || typeof this.api.setCssHoverPreviewSelector !== 'function') return;
    if (!payload || payload.kind === 'leave') {
      this._clearHoverPreview();
      return;
    }

    var bid = this._extractHoverBricksIdFromLine(payload.lineText || '');
    if (!bid) {
      this._clearHoverPreview();
      return;
    }

    if (bid === this._hoverPreviewBricksId) return;

    var ctx = this._getScopedContext();
    if (!ctx || !ctx.element) {
      this._clearHoverPreview();
      return;
    }

    var selector = this._buildHoverSelectorForBricksId(bid);
    if (!selector) {
      this._clearHoverPreview();
      return;
    }

    this._hoverPreviewBricksId = bid;
    try {
      var out = this.api.setCssHoverPreviewSelector(selector, { maxMatches: 8 });
      if (!out || !out.ok) this._clearHoverPreview();
    } catch (e) { _warn('_handleEditorHoverPreview', e); 
      this._clearHoverPreview();
    }
  };

  HTMLBridge.prototype._contextSemanticLabelForTag = function (tagName) {
    tagName = String(tagName || '').trim().toLowerCase();
    if (!tagName) return 'element';
    if (tagName === 'div') return 'container';
    if (tagName === 'span') return 'inline';
    if (tagName === 'a') return 'link';
    if (tagName === 'ul' || tagName === 'ol') return 'list';
    if (tagName === 'li') return 'item';
    if (/^h[1-6]$/.test(tagName)) return 'heading';
    return tagName;
  };

  HTMLBridge.prototype._updateSelectionMeta = function (ctx) {
    ctx = ctx || this._getScopedContext();
    if (!ctx) return;
    if (!this.panel) return;
    var analysis = ctx.mode === 'element' ? this._getAnalysis(ctx) : null;
    var gate = analysis && analysis.applyGate ? this._normalizeGateForUx(analysis.applyGate) : null;
    if (this.panel.setPaneGate) {
      this.panel.setPaneGate('html', gate);
    }
    this._syncApplyButtonState(ctx, analysis);
    var tagName = String(ctx.tag || ((ctx.element && ctx.element.tagName) ? ctx.element.tagName : '') || 'div').trim().toLowerCase();
    var semanticLabel = this._contextSemanticLabelForTag(tagName);
    var scopeLabel = (ctx.scope && ctx.scope !== 'self') ? (' · ' + ctx.scope) : '';
    var label = ctx.mode === 'element'
      ? ('Element #' + ctx.id + scopeLabel + ' · ' + semanticLabel + (tagName && tagName !== semanticLabel ? (' · <' + tagName + '>') : ''))
      : 'Page mode';
    if (this.panel.setSelectionInfo) this.panel.setSelectionInfo(label);
    if (this.panel.setPaneMeta) {
      this.panel.setPaneMeta(
        'html',
        ctx.mode === 'element'
          ? {
              mode: 'element',
              id: String(ctx.id || ''),
              tag: tagName || 'div',
              semantic: semanticLabel,
              scope: String(ctx.scope || '')
            }
          : {
              mode: 'page',
              semantic: 'page',
              summary: 'full page snapshot'
            }
      );
    }
  };

  HTMLBridge.prototype._getWriteSyncCapabilityChecks = function (ctx, analysis) {
    ctx = ctx || this._getScopedContext();
    if (!analysis && ctx && ctx.mode === 'element') {
      try {
        analysis = this._getAnalysis(ctx);
      } catch (e) { _warn('_getWriteSyncCapabilityChecks', e); 
        analysis = null;
      }
    }

    var hasContextApi = !!(this.api && (
      typeof this.api.getScopedSelectionContext === 'function' ||
      typeof this.api.getSelectionContext === 'function'
    ));
    var contextReady = !!(ctx && (ctx.mode === 'page' || (ctx.mode === 'element' && ctx.element)));
    var gate = analysis && analysis.applyGate ? this._normalizeGateForUx(analysis.applyGate) : null;
    var gateCompatible = !gate || gate.level !== 'blocked' || !!this._canFullStructureSync(ctx);

    return [
      {
        key: 'editorWritable',
        label: 'Editor writable',
        ready: !this.readOnly && !!(this.editor && typeof this.editor.getValue === 'function')
      },
      {
        key: 'contextApi',
        label: 'Context API',
        ready: hasContextApi
      },
      {
        key: 'contextReady',
        label: 'Scoped context ready',
        ready: contextReady
      },
      {
        key: 'applyEntry',
        label: 'Apply entrypoint',
        ready: typeof this.applyFromEditor === 'function'
      },
      {
        key: 'parser',
        label: 'HTML parser path',
        ready: typeof this._parseEditorRoots === 'function' && typeof this._parseEditorRoot === 'function'
      },
      {
        key: 'safeSubsetSync',
        label: 'Safe subset sync helper',
        ready: !!(this.api && (
          typeof this.api.updateElementSafeSubsetStateByDom === 'function' ||
          typeof this.api.updateElementTextSettingByDom === 'function'
        ))
      },
      {
        key: 'fullStructureSync',
        label: 'Full structure sync helper',
        ready: !!this._canFullStructureSync(ctx)
      },
      {
        key: 'gateCompatible',
        label: 'Gate compatible',
        ready: gateCompatible
      },
      {
        key: 'manualRefresh',
        label: 'Manual refresh hook',
        ready: this._hasManualRefreshSupport()
      },
      {
        key: 'liveSyncPipeline',
        label: 'Live sync pipeline',
        ready: !!(this.liveSync && this.liveSync.enabled && this._autoApplyDebounced)
      }
    ];
  };

  HTMLBridge.prototype.getWriteSyncCapabilityReport = function (ctx, analysis) {
    var checks = this._getWriteSyncCapabilityChecks(ctx, analysis);
    var ready = 0;
    for (var i = 0; i < checks.length; i++) {
      if (checks[i] && checks[i].ready) ready++;
    }
    var total = checks.length;
    return {
      lane: 'html',
      title: 'Write/Sync 9+',
      threshold: 9,
      ready: ready,
      total: total,
      ok: ready >= 9,
      checks: checks
    };
  };

  HTMLBridge.prototype._formatWriteSyncCapabilityBadge = function (report) {
    return getBridgeRuntimeUtils().formatWriteSyncCapabilityBadge(this, report);
  };

  HTMLBridge.prototype._normalizeSnapshotText = function (value) {
    return getBridgeRuntimeUtils().normalizeSnapshotText(value);
  };

  HTMLBridge.prototype.getCanonicalSnapshotReport = function (opts) {
    opts = opts || {};
    var canonicalReport = getBridgeCanonicalReport();
    var ctx = opts.ctx || this._getScopedContext();
    var ctxKey = this._contextKey(ctx);
    var contextState = canonicalReport.buildLaneContextState({
      ctx: ctx,
      ctxKey: ctxKey,
      dirty: this._dirty,
      applying: this._applying
    });
    var comparableSnapshotState = contextState.comparableSnapshotState;
    var editorRaw = this.editor && typeof this.editor.getValue === 'function'
      ? String(this.editor.getValue() || '')
      : '';
    var renderedRaw = String(this._lastHtml || '');
    var liveRaw = '';
    var liveAvailable = false;
    var liveError = '';

    if (opts.live !== false && comparableSnapshotState) {
      try {
        liveRaw = String(this.serializeSelection(ctx) || '');
        liveAvailable = true;
      } catch (e) { _warn('getCanonicalSnapshotReport', e); 
        liveError = e && e.message ? String(e.message) : String(e || 'unknown-live-serialization-error');
      }
    }

    var editorNormalized = this._normalizeSnapshotText(editorRaw);
    var renderedNormalized = this._normalizeSnapshotText(renderedRaw);
    var liveNormalized = liveAvailable ? this._normalizeSnapshotText(liveRaw) : '';
    var lensMode = String(this._normalizeHtmlLensMode(this.htmlLensMode) || '');
    var hashVerify = this._hashVerifyText.bind(this);
    return canonicalReport.buildEvaluatedLaneReport({
      lane: 'html',
      ctx: ctx,
      ctxKey: ctxKey,
      stateSpecs: [
        { key: 'dirty', type: 'boolean', value: this._dirty },
        { key: 'applying', type: 'boolean', value: this._applying },
        { key: 'layerMode', type: 'string', value: this.layerMode },
        { key: 'htmlLensMode', type: 'string', value: lensMode },
        { key: 'lastRenderedContextKey', type: 'string', value: this._lastRenderedContextKey },
        { key: 'lastRenderedLayerMode', type: 'string', value: this._lastRenderedLayerMode },
        { key: 'lastRenderedHtmlLensMode', type: 'string', value: this._lastRenderedHtmlLensMode }
      ],
      snapshots: {
        editorRaw: editorRaw,
        editorNormalized: editorNormalized,
        renderedRaw: renderedRaw,
        renderedNormalized: renderedNormalized,
        hashFn: hashVerify,
        live: {
          available: liveAvailable,
          error: liveError,
          raw: liveRaw,
          normalized: liveNormalized,
          hashFn: hashVerify
        }
      },
      dirty: !!this._dirty,
      applying: !!this._applying,
      contextState: contextState,
      compareSpecs: [
        { key: 'editorVsRendered', enabled: comparableSnapshotState, left: editorNormalized, right: renderedNormalized },
        { key: 'editorVsLive', enabled: comparableSnapshotState && liveAvailable, left: editorNormalized, right: liveNormalized },
        { key: 'renderedVsLive', enabled: comparableSnapshotState && liveAvailable, left: renderedNormalized, right: liveNormalized }
      ],
      alignmentSpecs: [
        { key: 'contextAligned', reason: 'render-context-stale', strict: true, lastValue: this._lastRenderedContextKey || '', currentValue: ctxKey || '' },
        { key: 'layerAligned', reason: 'render-layer-stale', strict: false, lastValue: this._lastRenderedLayerMode, currentValue: this.layerMode || '' },
        { key: 'lensAligned', reason: 'render-lens-stale', strict: false, lastValue: this._lastRenderedHtmlLensMode, currentValue: lensMode }
      ],
      mismatchFlagSpecs: [
        { key: 'liveSerializationError', value: liveError },
        { key: 'editorVsLiveMismatch', value: liveAvailable && comparableSnapshotState && editorNormalized !== liveNormalized },
        { key: 'renderedVsLiveMismatch', value: liveAvailable && comparableSnapshotState && renderedNormalized !== liveNormalized },
        { key: 'editorVsRenderedMismatch', value: !liveAvailable && comparableSnapshotState && editorNormalized !== renderedNormalized }
      ],
      mismatchSpecs: [
        { key: 'liveSerializationError', reason: 'live-serialization-error' },
        { key: 'editorVsLiveMismatch', reason: 'editor-vs-live-mismatch' },
        { key: 'renderedVsLiveMismatch', reason: 'rendered-vs-live-mismatch' },
        { key: 'editorVsRenderedMismatch', reason: 'editor-vs-rendered-mismatch' }
      ]
    });
  };

  HTMLBridge.prototype.refresh = function (opts) {
    opts = opts || {};
    var force = !!opts.force;
    if (!this.api || !this.editor) return;
    var ctx = this._getScopedContext();
    if (!ctx) return;
    var ctxKey = this._contextKey(ctx);
    if (!force && !this.readOnly && !this._applying && this._dirty && ctx) {
      if (ctx.mode === 'element' && String(ctx.id || '') === this._dirtySelectionId) return;
      if (ctx.mode === 'page' && this._dirtyContextMode === 'page') return;
    }
    if (!force && !this.readOnly && !this._applying && this._shouldDeferRefreshWhileTyping(ctx)) {
      return;
    }
    var html = this.serializeSelection(ctx);
    if (html === this._lastHtml) {
      this._lastRenderedContextKey = ctxKey;
      this._lastRenderedLayerMode = String(this.layerMode || '');
      this._lastRenderedHtmlLensMode = String(this._normalizeHtmlLensMode(this.htmlLensMode) || '');
      this._updateSelectionMeta(ctx);
      return;
    }
    this._lastHtml = html;
    var preserveView = this._shouldPreserveEditorViewOnRefresh(ctx, ctxKey);
    this.editor.setValue(html, {
      silent: true,
      preserveScroll: preserveView,
      preserveSelection: preserveView
    });
    this._lastRenderedContextKey = ctxKey;
    this._lastRenderedLayerMode = String(this.layerMode || '');
    this._lastRenderedHtmlLensMode = String(this._normalizeHtmlLensMode(this.htmlLensMode) || '');
    this._dirty = false;
    this._dirtySelectionId = '';
    this._syncApplyButtonState(ctx, this._getAnalysis(ctx));
    var scopeText = (ctx.scope && ctx.scope !== 'self') ? (' · ' + ctx.scope) : '';
    this._setPanelStatus('HTML snapshot refreshed (' + (ctx.mode === 'element' ? ('#' + ctx.id + scopeText) : 'page') + ')', {
      channel: 'refresh',
      dedupeMs: Math.max(420, Number(this.statusPolicy && this.statusPolicy.dedupeMs))
    });
  };

  HTMLBridge.prototype._queueAutoApply = function () {
    if (this.readOnly) return;
    if (!this.liveSync || !this.liveSync.enabled) return;
    if (!this._autoApplyDebounced) return;
    this._autoApplyDebounced();
  };

  HTMLBridge.prototype._queueAutoApplyClass = function () {
    if (this.readOnly) return;
    if (!this.liveSync || !this.liveSync.enabled) return;
    if (!this._autoApplyClassDebounced) return;
    this._autoApplyClassDebounced();
  };

  HTMLBridge.prototype._queueAutoApplyPage = function () {
    if (this.readOnly) return;
    if (!this.liveSync || !this.liveSync.enabled) return;
    if (!this._autoApplyPageDebounced) return;
    this._autoApplyPageDebounced();
  };

  HTMLBridge.prototype._canFullStructureSync = function (ctx) {
    if (this.readOnly) return false;
    if (!this.fullStructureSync) return false;
    if (!this.api || typeof this.api.syncHtmlStructureFromParsed !== 'function') return false;
    if (!ctx || (ctx.mode !== 'element' && ctx.mode !== 'page')) return false;
    if (ctx.mode === 'element') return !!ctx.id;
    return true;
  };

  HTMLBridge.prototype._buildEmptyStructureRootsForScope = function (ctx) {
    if (!ctx) return [];
    if (ctx.mode === 'page') return [];

    var scope = String(ctx.scope || 'self').toLowerCase();
    if (scope === 'children') return [];

    if (ctx.mode !== 'element') return [];

    var rootId = String(ctx.id || '').trim();
    if (!rootId) return [];

    var tag = String(ctx.tag || ((ctx.element && ctx.element.tagName) ? ctx.element.tagName : '') || 'div')
      .trim()
      .toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) tag = 'div';

    // Keep full-structure sync operational when editor content is intentionally empty.
    // For self/parent scopes we preserve the selected root anchor and let sync clear subtree + subset state.
    var node = null;
    try {
      if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
        node = document.createElement(tag);
        node.setAttribute('data-bid', rootId);
      }
    } catch (e) { _warn('_buildEmptyStructureRootsForScope', e); 
      node = null;
    }

    if (!node) {
      var attrMap = { 'data-bid': rootId };
      node = {
        nodeType: 1,
        tagName: String(tag || 'div').toUpperCase(),
        childNodes: [],
        attributes: [
          { name: 'data-bid', value: rootId }
        ],
        classList: [],
        innerHTML: '',
        getAttribute: function (name) {
          name = String(name || '').toLowerCase();
          if (!name) return '';
          return Object.prototype.hasOwnProperty.call(attrMap, name) ? String(attrMap[name]) : '';
        },
        setAttribute: function (name, value) {
          name = String(name || '').toLowerCase();
          if (!name) return;
          attrMap[name] = String(value == null ? '' : value);
          this.attributes = Object.keys(attrMap).map(function (k) {
            return { name: k, value: String(attrMap[k]) };
          });
        }
      };
    }

    return [node];
  };

  HTMLBridge.prototype._resolveStructureRootsForApply = function (sourceText, ctx) {
    sourceText = String(sourceText == null ? '' : sourceText);
    if (!sourceText.trim()) {
      return this._buildEmptyStructureRootsForScope(ctx);
    }
    return this._parseEditorRoots(sourceText);
  };

  HTMLBridge.prototype._shouldDeferRefreshWhileTyping = function (ctx) {
    if (!ctx || (ctx.mode !== 'element' && ctx.mode !== 'page')) return false;
    var doc = (typeof document !== 'undefined') ? document : null;
    if (!doc) return false;
    var panelRoot = this.panel && this.panel.root;
    if (!panelRoot || !panelRoot.contains) return false;
    var active = doc.activeElement;
    if (!active || !panelRoot.contains(active)) return false;
    var nowTs = Date.now ? Date.now() : +new Date();
    var quietMs = Math.max(250, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 220);
    var recentTyping = !!this._lastEditAt && (nowTs - this._lastEditAt) < quietMs;
    if (!recentTyping) return false;

    if (ctx.mode === 'element') {
      var selectedId = String(ctx.id || '');
      if (!selectedId || selectedId !== String(this._lastEditSelectionId || '')) return false;
      return true;
    }

    // While typing on element mode, ignore transient page refresh jumps.
    if (String(this._dirtyContextMode || '') === 'page') return true;
    if (String(this._lastEditSelectionId || '')) return true;
    return false;
  };

  HTMLBridge.prototype._canAutoApply = function (ctx, analysis) {
    if (this.readOnly) return false;
    if (this._isAuthorLayer()) return false;
    if (!this.liveSync || !this.liveSync.enabled) return false;
    if (!ctx || !ctx.element) return false;
    var lensState = this._getHtmlLensState(ctx, analysis);
    if (lensState.active && !lensState.hasMatch) return false;
    if (ctx.mode === 'page') return true;
    if (ctx.mode !== 'element') return false;

    var gate = analysis && analysis.applyGate ? analysis.applyGate : null;
    var fullSyncCapable = this._canFullStructureSync(ctx) && (!gate || gate.htmlApplyStructureAllowed !== false);
    if (gate && gate.level === 'blocked') return false;
    if (gate && gate.htmlApplySafeSubsetAllowed === false && !fullSyncCapable) return false;
    if (gate && gate.level === 'guarded' && !this.liveSync.allowGuarded && !fullSyncCapable) return false;
    return true;
  };

  HTMLBridge.prototype._runAutoApply = function () {
    if (!this._dirty || this._applying) return false;
    var ctx = this._getScopedContext();
    if (!ctx || !ctx.element) return false;
    if (ctx.mode === 'element') {
      if (!this._dirtySelectionId || String(ctx.id || '') !== this._dirtySelectionId) return false;
    } else if (ctx.mode === 'page') {
      if (this._dirtyContextMode !== 'page') return false;
    } else {
      return false;
    }

    var analysis = ctx.mode === 'element' ? this._getAnalysis(ctx) : null;
    if (!this._canAutoApply(ctx, analysis)) return false;
    return this.applyFromEditor({ source: 'auto' });
  };

  HTMLBridge.prototype._armIgnorePageSelectionWindow = function (ctx) {
    if (!this._hasManualRefreshSupport()) return;
    if (!ctx || ctx.mode !== 'element') return;
    var baseNow = Date.now ? Date.now() : +new Date();
    this._ignorePageSelectionUntil = baseNow + Math.max(450, Number((this.liveSync && this.liveSync.debounceMs) || 180) + 320);
  };

  HTMLBridge.prototype._isActivelyTypingInPanel = function (ctx) {
    if (!ctx || (ctx.mode !== 'element' && ctx.mode !== 'page')) return false;
    var panelRoot = this.panel && this.panel.root;
    if (!panelRoot || !panelRoot.contains) return false;
    var active = document.activeElement;
    if (!active || !panelRoot.contains(active)) return false;
    if (ctx.mode === 'page') {
      return String(this._dirtyContextMode || '') === 'page';
    }
    var selectedId = String(ctx.id || '');
    if (!selectedId || selectedId !== String(this._lastEditSelectionId || '')) return false;
    return true;
  };

  HTMLBridge.prototype._shouldDelayAutoApplyForClassChanges = function (ctx, plan) {
    if (!plan || !plan.changed || !plan.changed.classOps) return false;
    if (!this._isActivelyTypingInPanel(ctx)) return false;
    var nowTs = Date.now ? Date.now() : +new Date();
    var quietMs = Math.max(this.liveSync.classDebounceMs - 80, 600);
    return !!this._lastEditAt && (nowTs - this._lastEditAt) < quietMs;
  };

  HTMLBridge.prototype._clonePlainData = function (value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) { _warn('_clonePlainData', e); 
      return null;
    }
  };

  HTMLBridge.prototype._isAdvancedGuardedContext = function (analysis, gate) {
    var signals = analysis && analysis.signals ? analysis.signals : {};
    if (
      signals.component ||
      signals.slot ||
      signals.variant ||
      signals.queryLoop ||
      signals.conditions ||
      signals.wpml ||
      signals.dynamicData
    ) return true;
    var contexts = gate && gate.diagnostics && Array.isArray(gate.diagnostics.contexts)
      ? gate.diagnostics.contexts
      : [];
    for (var i = 0; i < contexts.length; i++) {
      var item = contexts[i] || {};
      var key = String(item.key || '').trim();
      if (!key) continue;
      if (
        key !== 'component' &&
        key !== 'slot' &&
        key !== 'variant' &&
        key !== 'queryLoop' &&
        key !== 'conditions' &&
        key !== 'wpml' &&
        key !== 'dynamicData'
      ) continue;
      if (item.htmlApplyStructureAllowed === false || item.htmlApplySafeSubsetAllowed === false) return true;
    }
    return false;
  };

  HTMLBridge.prototype._captureStateRollbackSnapshot = function (node) {
    if (!this.api || typeof this.api.getElementModelByDom !== 'function') return null;
    var resolved = null;
    try {
      resolved = this.api.getElementModelByDom(node);
    } catch (e0) { _warn('_captureStateRollbackSnapshot', e0); 
      resolved = null;
    }
    if (!resolved || !resolved.model || typeof resolved.model !== 'object') return null;
    var model = resolved.model;
    var snapshotSettings = this._clonePlainData(model && model.settings && typeof model.settings === 'object' ? model.settings : {});
    if (!snapshotSettings || typeof snapshotSettings !== 'object') snapshotSettings = {};
    return {
      id: String(resolved.id || model.id || ''),
      model: model,
      settings: snapshotSettings
    };
  };

  HTMLBridge.prototype._restoreStateRollbackSnapshot = function (snapshot) {
    if (!snapshot || !snapshot.model || typeof snapshot.model !== 'object') return false;
    var restored = this._clonePlainData(snapshot.settings || {});
    if (!restored || typeof restored !== 'object') restored = {};
    try {
      snapshot.model.settings = restored;
    } catch (eAssign) { _warn('_restoreStateRollbackSnapshot', eAssign); 
      return false;
    }
    if (this.api && typeof this.api.refreshActiveSelectionUiFromCanonical === 'function') {
      try { this.api.refreshActiveSelectionUiFromCanonical(snapshot.id || '', snapshot.model); } catch (e0) { _warn('_restoreStateRollbackSnapshot', e0); }
    }
    if (this.api && typeof this.api.reconcileActiveClassUi === 'function') {
      try { this.api.reconcileActiveClassUi({ model: snapshot.model }); } catch (e1) { _warn('_restoreStateRollbackSnapshot', e1); }
    }
    return true;
  };

  HTMLBridge.prototype._looksLikeAdvancedGuardStateKey = function (value) {
    value = String(value || '');
    if (!value) return false;
    return /(^|[._:-])(component|slot|variant|query|queryloop|query-loop|query_loop|hasloop|has-loop|has_loop|loopquery|loop-query|loop_query|condition|conditions|conditional|dynamic|dynamicdata|dynamic-data|dynamic_data|wpml)(?=$|[._:-])/i.test(value);
  };

  HTMLBridge.prototype._stableStringify = function (value) {
    if (value == null) return 'null';
    var type = typeof value;
    if (type === 'string') return JSON.stringify(value);
    if (type === 'number' || type === 'boolean') return JSON.stringify(value);
    if (type !== 'object') return JSON.stringify(String(value));

    if (Array.isArray(value)) {
      var arrParts = [];
      for (var i = 0; i < value.length; i++) arrParts.push(this._stableStringify(value[i]));
      return '[' + arrParts.join(',') + ']';
    }

    var keys = Object.keys(value).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      parts.push(JSON.stringify(key) + ':' + this._stableStringify(value[key]));
    }
    return '{' + parts.join(',') + '}';
  };

  HTMLBridge.prototype._buildAdvancedGuardFingerprint = function (settings) {
    var root = settings && typeof settings === 'object' ? settings : {};
    var tokens = [];
    var seen = [];
    var self = this;

    function walk(node, path, depth) {
      if (depth > 8) return;
      if (node == null) return;
      var type = typeof node;
      if (type !== 'object') return;
      if (seen.indexOf(node) !== -1) return;
      seen.push(node);

      if (Array.isArray(node)) {
        for (var ai = 0; ai < node.length; ai++) {
          walk(node[ai], path + '[' + ai + ']', depth + 1);
        }
        return;
      }

      var keys = Object.keys(node).sort();
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var nextPath = path ? (path + '.' + key) : key;
        var value = node[key];
        if (self._looksLikeAdvancedGuardStateKey(key)) {
          tokens.push(nextPath + '=' + self._stableStringify(value));
        }
        walk(value, nextPath, depth + 1);
      }
    }

    walk(root, 'settings', 0);
    tokens.sort();
    return this._hashVerifyText(tokens.join('||'));
  };

  HTMLBridge.prototype._syncBuilderStateFromPlan = function (plan, ctx, opts) {
    opts = opts || {};
    var out = {
      supported: false,
      attempted: 0,
      changed: 0,
      skipped: 0,
      failed: 0,
      reasons: [],
      fields: {
        textAttempted: 0,
        textChanged: 0,
        idAttempted: 0,
        idChanged: 0,
        attrsAttempted: 0,
        attrsChanged: 0,
        classAttempted: 0,
        classUnsupported: 0
      },
      advancedGuard: {
        enabled: !!opts.advancedGuarded,
        checked: 0,
        changed: 0,
        unsupported: 0,
        restoreFailed: 0
      }
    };
    if (!this.api || typeof this.api.updateElementSafeSubsetStateByDom !== 'function') {
      if (!this.api || typeof this.api.updateElementTextSettingByDom !== 'function') return out;
    }
    out.supported = true;
    if (!plan || !Array.isArray(plan.pairs) || !plan.pairs.length) return out;
    var stateRollbackStack = Array.isArray(opts.stateRollbackStack) ? opts.stateRollbackStack : null;
    var rollbackSeen = {};

    var touchedIds = {};
    for (var i = 0; i < plan.pairs.length; i++) {
      var pair = plan.pairs[i];
      if (!pair || !pair.actual || !pair.expected || !pair.original) continue;

      var expectedText = String(pair.expected.text || '');
      var originalText = String(pair.original.text || '');
      var textChanged = expectedText !== originalText;
      var idChanged = String(pair.expected.idRaw || '') !== String(pair.original.idRaw || '');
      var attrsChanged = !this._sameStringMap(pair.original.attrs || {}, pair.expected.attrs || {});
      var currentUserClasses = this._splitUserClassesFromRawClass(pair.original.rawClassAttr);
      var classChanged = !this._sameStringArray(currentUserClasses, pair.expected.userClasses || []);
      if (!textChanged && !idChanged && !attrsChanged && !classChanged) continue;

      out.attempted++;

      if (textChanged) out.fields.textAttempted++;
      if (idChanged) out.fields.idAttempted++;
      if (attrsChanged) out.fields.attrsAttempted++;
      if (classChanged) out.fields.classAttempted++;

      var preStateSnapshot = null;
      var preAdvancedFingerprint = '';
      if (stateRollbackStack || out.advancedGuard.enabled) {
        preStateSnapshot = this._captureStateRollbackSnapshot(pair.actual);
      }
      if (preStateSnapshot && stateRollbackStack) {
        var rollbackKey = preStateSnapshot.id || ('pair-' + i);
        if (!rollbackSeen[rollbackKey]) {
          rollbackSeen[rollbackKey] = true;
          stateRollbackStack.push(preStateSnapshot);
        }
      }
      if (out.advancedGuard.enabled) {
        out.advancedGuard.checked++;
        if (preStateSnapshot) {
          preAdvancedFingerprint = this._buildAdvancedGuardFingerprint(preStateSnapshot.settings);
        } else {
          out.advancedGuard.unsupported++;
        }
      }

      var res;
      if (typeof this.api.updateElementSafeSubsetStateByDom === 'function') {
        res = this.api.updateElementSafeSubsetStateByDom(pair.actual, {
          text: expectedText,
          idRaw: pair.expected.idRaw,
          attrs: pair.expected.attrs || {},
          originalUserClasses: currentUserClasses,
          userClasses: pair.expected.userClasses || [],
          classChanged: classChanged
        }, { deferUiRefresh: true }) || {};
      } else {
        // Backward-compatible fallback (older BricksAPI versions): text only.
        res = this.api.updateElementTextSettingByDom(pair.actual, expectedText, { deferUiRefresh: true }) || {};
      }

      var advancedMismatch = false;
      if (out.advancedGuard.enabled && preStateSnapshot) {
        var postStateSnapshot = this._captureStateRollbackSnapshot(pair.actual);
        var postAdvancedFingerprint = postStateSnapshot
          ? this._buildAdvancedGuardFingerprint(postStateSnapshot.settings)
          : '';
        if (preAdvancedFingerprint !== postAdvancedFingerprint) {
          advancedMismatch = true;
          out.advancedGuard.changed++;
          if (!this._restoreStateRollbackSnapshot(preStateSnapshot)) {
            out.advancedGuard.restoreFailed++;
          }
          var advancedReason = 'advanced-guard-mismatch' + (preStateSnapshot.id ? (':' + preStateSnapshot.id) : '');
          if (out.reasons.indexOf(advancedReason) === -1) out.reasons.push(advancedReason);
        }
      }
      if (advancedMismatch) {
        out.failed++;
        continue;
      }

      if (res.ok && res.changed) {
        out.changed++;
        if (res.id) touchedIds[String(res.id)] = true;
        if (res.text && res.text.changed) out.fields.textChanged++;
        if (res.cssId && res.cssId.changed) out.fields.idChanged++;
        if (res.attrs && res.attrs.changed) out.fields.attrsChanged++;
      } else if (res.ok && !res.changed) {
        out.skipped++;
      } else {
        out.failed++;
        if (res.reason && out.reasons.indexOf(String(res.reason)) === -1) {
          out.reasons.push(String(res.reason));
        }
      }

      if (res && res.classes && res.classes.attempted && !res.classes.supported) {
        out.fields.classUnsupported++;
      }
      if (res && res.attrs && Array.isArray(res.attrs.unsupported) && res.attrs.unsupported.length) {
        for (var u = 0; u < res.attrs.unsupported.length; u++) {
          var reason = 'attr-unsupported:' + String(res.attrs.unsupported[u]);
          if (out.reasons.indexOf(reason) === -1) out.reasons.push(reason);
        }
      }
      if (res && !res.text && textChanged && typeof this.api.updateElementSafeSubsetStateByDom !== 'function') {
        // Legacy text-only fallback path result shape.
        if (res.changed) out.fields.textChanged++;
      }
    }

    if (out.changed > 0) {
      var shouldNotifyGlobalClasses = out.fields.classAttempted > 0;
      if (shouldNotifyGlobalClasses && typeof this.api.notifyGlobalClassesChanged === 'function') {
        try { this.api.notifyGlobalClassesChanged(); } catch (eG) { _warn('_syncBuilderStateFromPlan', eG); }
      }
      var shouldNotifyContentSettings =
        (out.fields.classAttempted > 0) ||
        (out.fields.idAttempted > 0) ||
        (out.fields.attrsAttempted > 0);
      if (shouldNotifyContentSettings && typeof this.api.notifyContentSettingsChanged === 'function') {
        try { this.api.notifyContentSettingsChanged(); } catch (e0) { _warn('_syncBuilderStateFromPlan', e0); }
      }
      if (typeof this.api._touchBuilderUi === 'function') {
        try { this.api._touchBuilderUi(); } catch (e) { _warn('_syncBuilderStateFromPlan', e); }
      }
      var renderId = (ctx && ctx.id) || Object.keys(touchedIds)[0] || '';
      if (renderId && typeof this.api.renderElementInBuilder === 'function') {
        try { this.api.renderElementInBuilder(renderId); } catch (e2) { _warn('_syncBuilderStateFromPlan', e2); }
      }
    }

    return out;
  };

  HTMLBridge.prototype.serializeSelection = function (ctx) {
    ctx = ctx || this._getScopedContext();
    if (!ctx || !ctx.element) {
      return '<!-- CM6GPT: No Bricks canvas/selection available yet -->';
    }

    var lensMode = this._normalizeHtmlLensMode(this.htmlLensMode);
    var useFilteredLens = (lensMode !== 'all' && lensMode !== 'minimal');

    if (ctx.mode === 'element' && ctx.scope === 'children') {
      var children = Array.isArray(ctx.elements) ? ctx.elements : [];
      if (!children.length) {
        return '<!-- CM6GPT: selected element has no direct Bricks children -->';
      }
      var parentAnalysis = this._getAnalysis(ctx);
      if (useFilteredLens && !this._analysisLensEntries(parentAnalysis, lensMode).length) {
        return '<!-- CM6GPT Lens (' + this._sanitizeCommentText(this._analysisLensModeLabel(lensMode, true)) + '): no match on current selection -->';
      }
      var childrenHeader = useFilteredLens ? this._buildAnalysisHeaderComments(parentAnalysis) : '';
      var childOut = [];
      for (var ci = 0; ci < children.length; ci++) {
        childOut.push(this._serializeNode(children[ci], 0));
      }
      var childrenHtml = childOut.join('\n');
      return childrenHeader ? (childrenHeader + '\n' + childrenHtml) : childrenHtml;
    }

    if (ctx.mode === 'element') {
      var analysis = this._getAnalysis(ctx);
      if (useFilteredLens && !this._analysisLensEntries(analysis, lensMode).length) {
        return '<!-- CM6GPT Lens (' + this._sanitizeCommentText(this._analysisLensModeLabel(lensMode, true)) + '): no match on current selection -->';
      }
      var nodeHtml = this._serializeNode(ctx.element, 0);
      var header = useFilteredLens ? this._buildAnalysisHeaderComments(analysis) : '';
      return header ? (header + '\n' + nodeHtml) : nodeHtml;
    }

    if (ctx.mode === 'page' && useFilteredLens) {
      return '';
    }

    return this._serializePageScope(ctx);
  };

  HTMLBridge.prototype._resolvePageScopeNodes = function (ctx) {
    var root = ctx && ctx.element ? ctx.element : null;
    var nodes = Array.isArray(ctx && ctx.elements) ? ctx.elements.filter(function (node) {
      return !!(node && node.nodeType === 1);
    }) : [];
    if (nodes.length) return nodes;

    // Page roots can temporarily lose direct Bricks markers behind runtime wrappers.
    // Reuse the API's scoped-children fallback before treating the page as empty.
    if (this.api && typeof this.api.getScopedChildrenNodes === 'function' && root) {
      try {
        nodes = this.api.getScopedChildrenNodes(root, {});
      } catch (e0) { _warn('_resolvePageScopeNodes', e0); 
        nodes = [];
      }
      nodes = Array.isArray(nodes) ? nodes.filter(function (node) {
        return !!(node && node.nodeType === 1);
      }) : [];
      if (nodes.length) return nodes;
    }

    if (this.api && typeof this.api.getTopLevelBricksNodes === 'function' && root) {
      try {
        nodes = this.api.getTopLevelBricksNodes(root);
      } catch (e1) { _warn('_resolvePageScopeNodes', e1); 
        nodes = [];
      }
      nodes = Array.isArray(nodes) ? nodes.filter(function (node) {
        return !!(node && node.nodeType === 1);
      }) : [];
      if (nodes.length) return nodes;
    }

    if (!root || !root.children || !root.children.length) return [];
    var selector = '[data-id], [data-script-id], [data-component-instance], [data-component]';
    return Array.prototype.slice.call(root.children || []).filter(function (node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.matches && node.matches(selector)) return true;
      return !!(node.querySelector && node.querySelector(selector));
    });
  };

  HTMLBridge.prototype._serializePageScope = function (ctx) {
    var nodes = this._resolvePageScopeNodes(ctx);
    if (!nodes.length) {
      return '';
    }

    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      out.push(this._serializeNode(nodes[i], 0, {
        hideInternalIds: true,
        hideElementIds: true
      }));
    }
    return out.join('\n');
  };

  HTMLBridge.prototype._serializeNode = function (node, depth, opts) {
    if (!node || node.nodeType !== 1) return '';
    opts = opts || {};
    var indent = new Array(depth + 1).join('  ');
    var tag = (node.tagName || 'div').toLowerCase();
    var attrs = this._buildAttrString(node, opts);
    var bricksSelector = '[data-id], [data-script-id], [data-component-instance], [data-component]';
    var hasBricksMarker = function (el) {
      if (!el || !el.getAttribute) return false;
      return !!(
        el.getAttribute('data-id') ||
        el.getAttribute('data-script-id') ||
        el.getAttribute('data-component-instance') ||
        el.getAttribute('data-component')
      );
    };

    var childNodes = Array.prototype.slice.call(node.childNodes || []);
    var meaningfulChildren = [];
    var inlineText = [];
    for (var i = 0; i < childNodes.length; i++) {
      var child = childNodes[i];
      if (child.nodeType === 1) {
        if (hasBricksMarker(child)) {
          meaningfulChildren.push(child);
        } else if (child.querySelector && child.querySelector(bricksSelector)) {
          meaningfulChildren.push(child);
        }
      } else if (child.nodeType === 3) {
        var text = String(child.textContent || '').trim();
        if (text) inlineText.push(text);
      }
    }

    if (!meaningfulChildren.length && inlineText.length && inlineText.join(' ').length < 120) {
      return indent + '<' + tag + attrs + '>' + escapeHtml(inlineText.join(' ')) + '</' + tag + '>';
    }

    if (!meaningfulChildren.length && !inlineText.length && this._isSelfClosing(tag)) {
      return indent + '<' + tag + attrs + ' />';
    }

    var out = [indent + '<' + tag + attrs + '>'];
    if (inlineText.length) {
      out.push(indent + '  ' + escapeHtml(inlineText.join(' ')));
    }

    for (var j = 0; j < meaningfulChildren.length; j++) {
      var childNode = meaningfulChildren[j];
      if (childNode.nodeType !== 1) continue;
      if (hasBricksMarker(childNode)) {
        out.push(this._serializeNode(childNode, depth + 1, opts));
      } else {
        var currentNode = node;
        var nested = Array.prototype.slice.call(childNode.querySelectorAll(bricksSelector)).filter(function (candidate) {
          var nearestBricksAncestor = candidate.parentElement && candidate.parentElement.closest
            ? candidate.parentElement.closest(bricksSelector)
            : null;
          return nearestBricksAncestor === currentNode;
        });
        for (var k = 0; k < nested.length; k++) {
          out.push(this._serializeNode(nested[k], depth + 1, opts));
        }
      }
    }

    out.push(indent + '</' + tag + '>');
    return out.join('\n');
  };

  HTMLBridge.prototype._isSelfClosing = function (tag) {
    return /^(img|br|hr|input|meta|link|source)$/.test(tag);
  };

  HTMLBridge.prototype._buildAttrString = function (node, opts) {
    opts = opts || {};
    var parts = [];
    var minimalLens = this._normalizeHtmlLensMode(this.htmlLensMode) === 'minimal';
    var bid = node.getAttribute('data-id');
    if (bid && !minimalLens && !opts.hideInternalIds) parts.push(' data-bid="' + escapeAttr(bid) + '"');

    var self = this;
    var classes = Array.prototype.slice.call(node.classList || []).filter(function (name) {
      return name && !self._isSystemClass(name);
    });
    if (!classes.length && minimalLens) {
      // Minimal mode should still show a stable class anchor even on nodes that only have Bricks/system classes.
      var fallbackClasses = Array.prototype.slice.call(node.classList || []).filter(function (name) {
        name = String(name || '');
        if (!name) return false;
        if (/^selected$/.test(name)) return false;
        if (/^is-active-/.test(name)) return false;
        return true;
      });
      if (fallbackClasses.length) {
        classes = [fallbackClasses[0]];
      }
    }
    if (classes.length) {
      parts.push(' class="' + escapeAttr(classes.join(' ')) + '"');
    }

    if (!opts.hideElementIds && node.id && !/^brxe-/.test(node.id)) {
      parts.push(' id="' + escapeAttr(node.id) + '"');
    }

    // L1 Author and Minimal lens keep rendering compact and read-focused.
    if (this._isAuthorLayer() || minimalLens) {
      return parts.join('');
    }

    var keepAttr = function (attrName, attrValue) {
      return self._isManagedAttrName(attrName, 'actual', attrValue);
    };

    Array.prototype.forEach.call(node.attributes || [], function (attr) {
      if (!keepAttr(attr.name, attr.value)) return;
      if (attr.name === 'class' || attr.name === 'id') return;
      if (attr.value === '' && /^(itemscope|contenteditable)$/i.test(attr.name)) {
        parts.push(' ' + attr.name);
        return;
      }
      parts.push(' ' + attr.name + '="' + escapeAttr(attr.value) + '"');
    });

    return parts.join('');
  };

  HTMLBridge.prototype._getAnalysis = function (ctx) {
    if (!this.api || !ctx || ctx.mode !== 'element') return null;
    if (typeof this.api.getElementAnalysisById === 'function') {
      return this.api.getElementAnalysisById(ctx.id, ctx.element);
    }
    return null;
  };

  HTMLBridge.prototype._analysisSignalLabel = function (analysis) {
    if (!analysis || !analysis.signals) return '';
    var order = ['component', 'slot', 'variant', 'queryLoop', 'dynamicData', 'wpml', 'schema', 'conditions'];
    var map = {
      component: 'component',
      slot: 'slot',
      variant: 'variant',
      queryLoop: 'query-loop',
      dynamicData: 'dynamic',
      wpml: 'wpml',
      schema: 'schema',
      conditions: 'conditions'
    };
    var labels = [];
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      if (analysis.signals[key]) labels.push(map[key] || key);
    }
    return labels.slice(0, 3).join(',');
  };

  HTMLBridge.prototype._analysisLensEntries = function (analysis, lensMode) {
    if (!analysis || !analysis.signals) return [];
    lensMode = this._normalizeHtmlLensMode(lensMode || this.htmlLensMode);
    var order = ['component', 'slot', 'variant', 'queryLoop', 'dynamicData', 'schema', 'conditions', 'wpml'];
    var map = {
      component: { short: 'component', label: 'Component' },
      slot: { short: 'slot', label: 'Slot' },
      variant: { short: 'variant', label: 'Variant' },
      queryLoop: { short: 'query-loop', label: 'Query Loop' },
      dynamicData: { short: 'dynamic', label: 'Dynamic Data' },
      schema: { short: 'schema', label: 'Schema' },
      conditions: { short: 'conditions', label: 'Conditions' },
      wpml: { short: 'wpml', label: 'WPML' }
    };
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      if (!analysis.signals[key]) continue;
      if (lensMode !== 'all') {
        if (lensMode === 'component') {
          if (key !== 'component' && key !== 'slot' && key !== 'variant') continue;
        } else if (key !== lensMode) {
          continue;
        }
      }
      out.push({
        key: key,
        short: map[key] ? map[key].short : key,
        label: map[key] ? map[key].label : key
      });
    }
    return out;
  };

  HTMLBridge.prototype._analysisLensSummary = function (analysis, opts) {
    opts = opts || {};
    var max = Math.max(1, Number(opts.max || 8));
    var human = !!opts.human;
    var separator = String(opts.separator || ', ');
    var lensMode = hasOwn(opts, 'lensMode') ? opts.lensMode : this.htmlLensMode;
    var entries = this._analysisLensEntries(analysis, lensMode);
    if (!entries.length) return '';
    var list = entries.slice(0, max).map(function (entry) {
      return human ? entry.label : entry.short;
    });
    var out = list.join(separator);
    if (entries.length > max) out += separator + '+ ' + (entries.length - max) + ' more';
    return out;
  };

  HTMLBridge.prototype._sanitizeCommentText = function (text) {
    return String(text == null ? '' : text)
      .replace(/--/g, '- -')
      .replace(/\s+/g, ' ')
      .trim();
  };

  HTMLBridge.prototype._buildAnalysisHeaderComments = function (analysis) {
    if (!analysis || !analysis.applyGate) return '';
    var lines = [];
    lines.push('<!-- CM6GPT Layer: ' + this._sanitizeCommentText(this._layerModeLabel(this.layerMode, true)) + ' -->');
    var gate = this._normalizeGateForUx(analysis.applyGate || {});
    var sig = this._analysisSignalLabel(analysis);
    var lensMode = this._normalizeHtmlLensMode(this.htmlLensMode);
    var lensModeLabel = this._analysisLensModeLabel(lensMode, true);
    var lenses = this._analysisLensSummary(analysis, { max: 8, human: true, separator: ' | ', lensMode: lensMode });
    if (lenses) {
      lines.push('<!-- CM6GPT Lenses (' + this._sanitizeCommentText(lensModeLabel) + '): ' + this._sanitizeCommentText(lenses) + ' -->');
    } else if (lensMode !== 'all' && lensMode !== 'minimal') {
      lines.push('<!-- CM6GPT Lens (' + this._sanitizeCommentText(lensModeLabel) + '): no match -->');
    }
    if (gate.level !== 'allow') {
      lines.push('<!-- CM6GPT Apply Gate: ' + this._sanitizeCommentText('gate:' + gate.level + (sig ? (' · ' + sig) : '')) + ' -->');
      if (Array.isArray(gate.reasons)) {
        for (var i = 0; i < Math.min(gate.reasons.length, 3); i++) {
          lines.push('<!-- reason: ' + this._sanitizeCommentText(gate.reasons[i]) + ' -->');
        }
      }
      if (Array.isArray(analysis.evidence) && analysis.evidence.length) {
        for (i = 0; i < Math.min(analysis.evidence.length, 3); i++) {
          lines.push('<!-- evidence: ' + this._sanitizeCommentText(analysis.evidence[i]) + ' -->');
        }
      }
    } else if (sig) {
      lines.push('<!-- CM6GPT Signals: ' + this._sanitizeCommentText(sig) + ' -->');
    }
    return lines.join('\n');
  };

  HTMLBridge.prototype._syncApplyButtonState = function (ctx, analysis) {
    if (!this.panel || !this.panel.setHtmlApplyState) return;
    if (this.readOnly) {
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: false,
        title: 'HTML editor is read-only in this phase',
        renameEnabled: false
      });
      return;
    }
    if (this._isAuthorLayer()) {
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: this._applying,
        title: 'L1 Author is read-focused. Switch to L2 Structure + Attrs to apply HTML sync.',
        renameEnabled: false
      });
      return;
    }
    ctx = ctx || this._getScopedContext();
    if (!analysis && ctx && ctx.mode === 'element') {
      try {
        analysis = this._getAnalysis(ctx);
      } catch (e) { _warn('_syncApplyButtonState', e); 
        analysis = null;
      }
    }
    if (!ctx) {
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Bricks builder context not ready',
        renameEnabled: false
      });
      return;
    }

    var lensState = this._getHtmlLensState(ctx, analysis);
    if (lensState.active && !lensState.hasMatch) {
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: this._applying,
        renameEnabled: false,
        title: 'Lens filter "' + this._analysisLensModeLabel(lensState.mode, true) + '" has no match in current context'
      });
      return;
    }

    if (ctx.mode === 'page') {
      this.panel.setHtmlApplyState({
        enabled: true,
        busy: this._applying,
        title: 'Page mode HTML full structure sync (auto on idle + manual Apply fallback)',
        renameEnabled: true,
        renameTitle: 'Bulk rename available in Page mode (Prefix bulk / BEM strict). Single rename requires selected element in Self scope.'
      });
      return;
    }

    if (ctx.mode !== 'element') {
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: this._applying,
        title: 'Select a Bricks element to enable Apply HTML',
        renameEnabled: false
      });
      return;
    }

    var gate = analysis && analysis.applyGate ? this._normalizeGateForUx(analysis.applyGate) : null;
    var opPolicy = this._resolveApplyOperationPolicy(gate);
    var fullSyncCapable = this._canFullStructureSync(ctx) && !!opPolicy.htmlApplyStructureAllowed;
    var gatePolicySummary = gate && gate.diagnostics && gate.diagnostics.summary
      ? String(gate.diagnostics.summary)
      : '';
    var renameSelfScope = String(ctx.scope || 'self') === 'self';
    var renameEnabled = true;
    var renameTitle = renameSelfScope
      ? 'Rename class on selected element (single) + bulk modes'
      : 'Bulk rename available in current scope. Single rename requires Self scope on selected element.';
    if (opPolicy.level === 'blocked') {
      var blockedReason = this._formatApplyOperationBlockedReason(opPolicy);
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: this._applying,
        renameEnabled: renameEnabled,
        renameTitle: renameTitle,
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
    if (!opPolicy.htmlApplySafeSubsetAllowed && !fullSyncCapable) {
      var blockedReason = this._formatApplyOperationBlockedReason(opPolicy);
      this.panel.setHtmlApplyState({
        enabled: false,
        busy: this._applying,
        renameEnabled: renameEnabled,
        renameTitle: renameTitle,
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

    this.panel.setHtmlApplyState({
      enabled: true,
      busy: this._applying,
      renameEnabled: renameEnabled,
      renameTitle: renameTitle,
      title: gate && gate.reasons && gate.reasons.length
        ? (
          'Gate: ' + gate.level + '\n' +
          (fullSyncCapable ? 'Full structure sync enabled\n' : 'Safe subset only\n') +
          (gatePolicySummary ? (gatePolicySummary + '\n') : '') +
          gate.reasons.slice(0, 4).join('\n')
        )
        : ((ctx.scope === 'children')
          ? (fullSyncCapable
            ? 'Apply full HTML sync to direct children of selected element (insert/delete/reorder + attrs + text)'
            : 'Apply safe subset HTML changes to direct children of selected element')
          : (fullSyncCapable
            ? 'Apply full HTML sync (insert/delete/reorder + attrs + text)'
            : 'Apply safe subset HTML changes (attrs + text, no structure changes)'))
    });
  };

  HTMLBridge.prototype.applyFromEditor = function (options) {
    options = options || {};
    var source = options.source === 'auto' ? 'auto' : 'manual';
    var isAuto = source === 'auto';
    // Lite version: HTML lane is read-only — early exit
    if (!isAuto) this._setPanelStatus('HTML Apply unavailable: CM6GPT Lite HTML lane is read-only', { channel: 'apply' });
    return false;
    // NOTE: Full HTML apply logic below is retained for future non-Lite activation.
    // eslint-disable-next-line no-unreachable
    var startEditSeq = this._editSeq;
    if (this.readOnly) {
      if (!isAuto) this._setPanelStatus('HTML Apply unavailable: CM6GPT Lite HTML lane is read-only', { channel: 'apply' });
      return false;
    }
    if (this._isAuthorLayer()) {
      if (!isAuto) this._setPanelStatus('HTML Apply unavailable in L1 Author layer · switch to L2', { channel: 'apply' });
      return false;
    }
    if (!this.api || !this.editor) return false;

    var ctx = this._getScopedContext();
    if (!ctx || !ctx.element) {
      if (!isAuto) this._setPanelStatus('HTML Apply unavailable: no Bricks canvas context', { channel: 'apply' });
      return false;
    }

    var isElementMode = ctx.mode === 'element';
    var isPageMode = ctx.mode === 'page';
    if (!isElementMode && !isPageMode) {
      if (!isAuto) this._setPanelStatus('HTML Apply unavailable in this mode', { channel: 'apply' });
      return false;
    }

    var analysis = null;
    if (isElementMode) {
      try {
        analysis = this._getAnalysis(ctx);
      } catch (analysisErr) {
        if (!isAuto) this._setPanelStatus('HTML Apply unavailable: analysis lookup failed', { channel: 'apply' });
        return false;
      }
    }
    var lensState = this._getHtmlLensState(ctx, analysis);
    if (lensState.active && !lensState.hasMatch) {
      if (!isAuto) this._setPanelStatus('HTML Apply unavailable: lens "' + this._analysisLensModeLabel(lensState.mode, true) + '" has no match in current context', { channel: 'apply' });
      return false;
    }
    var gate = analysis && analysis.applyGate ? this._normalizeGateForUx(analysis.applyGate) : null;
    var opPolicy = this._resolveApplyOperationPolicy(gate);
    var canFullStructureSync = this._canFullStructureSync(ctx) && !!opPolicy.htmlApplyStructureAllowed;
    if (opPolicy.level === 'blocked') {
      if (!isAuto) this._emitApplyTaxonomyStatus('apply-blocked', {
        reason: 'gate:blocked · ' + this._formatApplyOperationBlockedReason(opPolicy)
      });
      return false;
    }
    if (!opPolicy.htmlApplySafeSubsetAllowed && !canFullStructureSync) {
      if (!isAuto) this._emitApplyTaxonomyStatus('apply-blocked', {
        reason: 'gate:blocked · ' + this._formatApplyOperationBlockedReason(opPolicy)
      });
      return false;
    }

    if (this._applying) return false;
    this._applying = true;
    this._syncApplyButtonState(ctx, analysis);

    try {
    var self = this;
    var rollbackStack = [];
    var stateRollbackStack = [];
    var dirtySnapshot = {
      dirty: !!this._dirty,
      selectionId: String(this._dirtySelectionId || ''),
      contextMode: String(this._dirtyContextMode || '')
    };
    var txResult = this._runApplyTransaction({
      source: source,
      mode: ctx && ctx.mode ? ctx.mode : '',
      scope: ctx && ctx.scope ? ctx.scope : ''
    }, function (tx) {
      tx.enter('prepare');
      var sourceText = self.editor.getValue ? self.editor.getValue() : '';
      if (canFullStructureSync && (isElementMode || isPageMode)) {
        tx.enter('apply');
        var parsedStructureRoots = self._resolveStructureRootsForApply(sourceText, ctx);
        var fullSync = self.api.syncHtmlStructureFromParsed(ctx, parsedStructureRoots, {
          deferUiRefresh: true,
          source: source,
          lensMode: self.htmlLensMode
        }) || null;
        if (!fullSync || !fullSync.ok) {
          throw new Error((fullSync && fullSync.reason) ? String(fullSync.reason) : 'full-structure-sync-failed');
        }

        tx.enter('verify');
        self._dirty = false;
        self._dirtySelectionId = '';
        self._dirtyContextMode = '';
        self._lastAutoStatus = '';

        tx.enter('commit');
        var fullStats = fullSync && fullSync.stats ? fullSync.stats : {};
        var fullChanged = !!(fullSync && fullSync.changed);
        var fullSyncStatus = '';
        if (fullChanged) {
          var fullSyncDetail =
            (Number(fullStats.updatedNodes || 0) + Number(fullStats.createdNodes || 0) + Number(fullStats.deletedNodes || 0)) +
            ' node op(s) · ' +
            Number(fullStats.createdNodes || 0) + ' created · ' +
            Number(fullStats.deletedNodes || 0) + ' deleted · ' +
            Number(fullStats.reorderedParents || 0) + ' reorder · ' +
            Number(fullStats.attrOps || 0) + ' attr op(s) · ' +
            Number(fullStats.textOps || 0) + ' text op(s) · ' +
            Number(fullStats.semanticOps || 0) + ' semantic tag op(s)' +
            (gate ? (' · gate:' + gate.level) : '');
          fullSyncStatus = self._formatApplyTaxonomyStatus('apply-ok', {
            auto: isAuto,
            reason: fullSyncDetail
          });
        } else {
          fullSyncStatus = self._formatApplyTaxonomyStatus('apply-ok', {
            auto: isAuto,
            reason: 'no changes'
          });
        }
        try {
          if (isAuto) self._setAutoStatus(fullSyncStatus);
          else self._setPanelStatus(fullSyncStatus, { channel: 'apply' });
        } catch (eStatus) { _warn('applyFromEditor', eStatus); }
        try {
          if (self.panel && typeof self.panel.flashAction === 'function') {
            var fullActionText = '';
            var fullActionKind = 'ok';
            if (fullChanged) {
              fullActionText = isAuto ? 'HTML full sync live applied' : 'HTML full sync applied';
              if (gate && gate.level !== 'allow') fullActionText += ' · gate:' + gate.level;
            } else if (!isAuto) {
              fullActionText = 'HTML apply: no changes';
              fullActionKind = 'info';
            }
            if (fullActionText) {
              self.panel.flashAction(fullActionText, {
                kind: fullActionKind,
                ttlMs: isAuto ? 900 : 1400
              });
            }
          }
        } catch (eFlash) { _warn('applyFromEditor', eFlash); }

        try {
          self._armIgnorePageSelectionWindow(ctx);
          var fullRefreshOutcome = self._requestManualRefreshReport({ includeSelection: false, reason: 'html-apply-structure' });
          if (fullRefreshOutcome.finalFailed) {
            try { self.refresh({ force: true }); } catch (eRefreshFallback) { _warn('applyFromEditor', eRefreshFallback); }
          } else if (!fullRefreshOutcome.attempted) {
            self.refresh({ force: true });
          }
        } catch (eRefresh) {
          try { self.refresh({ force: true }); } catch (eRefresh2) { _warn('applyFromEditor', eRefresh2); }
        }
        return true;
      }

      tx.enter('apply');
      var plan;
      if (isElementMode && ctx.scope === 'children') {
        var parsedChildrenRoots = self._parseEditorRoots(sourceText);
        var actualChildrenRoots = Array.isArray(ctx.elements) ? ctx.elements : [];
        plan = self._buildSafeSubsetCollectionApplyPlan(ctx.element, actualChildrenRoots, parsedChildrenRoots, 'Children');
      } else if (isElementMode) {
        var parsedRoot = self._parseEditorRoot(sourceText);
        plan = self._buildSafeSubsetApplyPlan(ctx.element, parsedRoot);
      } else {
        var parsedRoots = self._parseEditorRoots(sourceText);
        plan = self._buildSafeSubsetPageApplyPlan(ctx.element, parsedRoots);
      }

      if (isAuto && self._shouldDelayAutoApplyForClassChanges(ctx, plan)) {
        self._setAutoStatus('HTML class edit queued · Live sync waits for idle (' + self.liveSync.classDebounceMs + 'ms) to avoid caret jump');
        self._queueAutoApplyClass();
        return false;
      }

      if (!plan.pairs.length) {
        throw new Error('No Bricks nodes found in parsed HTML');
      }

      for (var i = 0; i < plan.pairs.length; i++) {
        var pair = plan.pairs[i];
        rollbackStack.push({
          node: pair.actual,
          original: pair.original
        });
        self._applyNodeState(pair.actual, pair.expected);
      }

      var stateSync = self._syncBuilderStateFromPlan(plan, ctx, {
        stateRollbackStack: stateRollbackStack,
        advancedGuarded: self._isAdvancedGuardedContext(analysis, gate)
      });

      tx.enter('verify');
      var verify = self._verifyApplyPlan(plan);
      if (!verify.ok) {
        throw new Error('Verify failed: ' + verify.reason);
      }
      if (stateSync && stateSync.advancedGuard && stateSync.advancedGuard.changed) {
        throw new Error('Verify failed: advanced-guard-mismatch');
      }

      self._dirty = false;
      self._dirtySelectionId = '';
      self._dirtyContextMode = '';
      self._lastAutoStatus = '';
      var stateSyncSummary = '';
      if (stateSync && stateSync.supported && stateSync.attempted) {
        stateSyncSummary =
          ' · state sync ' + stateSync.changed + '/' + stateSync.attempted +
          ' (t:' + stateSync.fields.textChanged + '/' + stateSync.fields.textAttempted +
          ' id:' + stateSync.fields.idChanged + '/' + stateSync.fields.idAttempted +
          ' a:' + stateSync.fields.attrsChanged + '/' + stateSync.fields.attrsAttempted + ')';
        if (stateSync.fields.classAttempted && stateSync.fields.classUnsupported) {
          stateSyncSummary += ' · class-map pending';
        }
        if (stateSync.failed) {
          stateSyncSummary += ' · state-sync warn';
        }
      }

      tx.enter('commit');
      var htmlApplyDetail =
        plan.pairs.length + ' node(s) · ' +
        plan.changed.nodes + ' changed · ' +
        plan.changed.attrOps + ' attr op(s) · ' +
        plan.changed.textOps + ' text op(s)' +
        stateSyncSummary +
        (gate ? (' · gate:' + gate.level) : '');
      var htmlApplyStatus = self._formatApplyTaxonomyStatus('apply-ok', {
        auto: isAuto,
        reason: htmlApplyDetail
      });
      if (isAuto) self._setAutoStatus(htmlApplyStatus);
      else self._setPanelStatus(htmlApplyStatus, { channel: 'apply' });
      if (self.panel && typeof self.panel.flashAction === 'function') {
        var htmlChanged = !!(plan && plan.changed && (plan.changed.nodes || plan.changed.attrOps || plan.changed.textOps));
        var htmlActionText = '';
        var htmlActionKind = 'ok';
        if (htmlChanged) {
          htmlActionText = isAuto
            ? (ctx.mode === 'page' ? 'Page HTML live synced' : 'HTML live synced')
            : (ctx.mode === 'page' ? 'Page HTML applied' : 'HTML applied');
          if (stateSync && stateSync.supported && stateSync.changed) {
            htmlActionText += ' · Bricks state synced';
          }
          if (gate && gate.level !== 'allow') htmlActionText += ' · gate:' + gate.level;
        } else if (!isAuto) {
          htmlActionText = 'HTML apply: no changes';
          htmlActionKind = 'info';
        }
        if (htmlActionText) {
          self.panel.flashAction(htmlActionText, {
            kind: htmlActionKind,
            ttlMs: isAuto ? 900 : 1400
          });
        }
      }

      self._armIgnorePageSelectionWindow(ctx);
      var safeSubsetRefreshOutcome = self._requestManualRefreshReport({ includeSelection: false, reason: 'html-apply' });
      if (safeSubsetRefreshOutcome.finalFailed) {
        if (safeSubsetRefreshOutcome.hardFailure) {
          throw new Error(self._manualRefreshErrorReason(safeSubsetRefreshOutcome.report, 'manual-refresh-failed'));
        }
        self.refresh({ force: true });
      } else if (!safeSubsetRefreshOutcome.attempted) {
        self.refresh({ force: true });
      }
      return true;
    }, function () {
      for (var r = rollbackStack.length - 1; r >= 0; r--) {
        var item = rollbackStack[r];
        try { self._applyNodeState(item.node, item.original); } catch (e) { _warn('applyFromEditor', e); }
      }
      for (var s = stateRollbackStack.length - 1; s >= 0; s--) {
        try { self._restoreStateRollbackSnapshot(stateRollbackStack[s]); } catch (e2) { _warn('applyFromEditor', e2); }
      }
      if (stateRollbackStack.length) {
        try {
          if (self.api && typeof self.api._touchBuilderUi === 'function') {
            self.api._touchBuilderUi();
          }
          var rollbackRenderId = (ctx && ctx.id) || (stateRollbackStack[0] && stateRollbackStack[0].id) || '';
          if (rollbackRenderId && self.api && typeof self.api.renderElementInBuilder === 'function') {
            self.api.renderElementInBuilder(rollbackRenderId);
          }
        } catch (e3) { _warn('applyFromEditor', e3); }
      }
    });
    if (!txResult.ok) {
      this._dirty = !!dirtySnapshot.dirty;
      this._dirtySelectionId = dirtySnapshot.selectionId;
      this._dirtyContextMode = dirtySnapshot.contextMode;
      var msg = (txResult.error && txResult.error.message) ? txResult.error.message : String(txResult.error || 'apply-transaction-failed');
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
      if (isAuto && this._dirty && this._editSeq !== startEditSeq) {
        if (this._dirtyContextMode === 'page') {
          this._queueAutoApplyPage();
        } else {
          this._queueAutoApply();
        }
      }
    }
  };

  HTMLBridge.prototype._hasManualRefreshSupport = function () {
    return getBridgeManualRefresh().hasSupport(this);
  };

  HTMLBridge.prototype._getManualRefreshFn = function () {
    return getBridgeManualRefresh().getFn(this);
  };

  HTMLBridge.prototype._isManualRefreshFinalFailure = function (report) {
    return getBridgeManualRefresh().isFinalFailure(this, report);
  };

  HTMLBridge.prototype._manualRefreshErrorMessages = function (errors) {
    return getBridgeManualRefresh().errorMessages(errors);
  };

  HTMLBridge.prototype._manualRefreshReportErrorMessages = function (reportLike) {
    return getBridgeManualRefresh().reportErrorMessages(this, reportLike);
  };

  HTMLBridge.prototype._manualRefreshShapeTag = function (value) {
    return getBridgeManualRefresh().shapeTag(value);
  };

  HTMLBridge.prototype._normalizeManualRefreshThrowReason = function (errorLike, fallback) {
    return getBridgeManualRefresh().normalizeThrowReason(errorLike, fallback);
  };

  HTMLBridge.prototype._isManualRefreshReportLike = function (value) {
    return getBridgeManualRefresh().isReportLike(value);
  };

  HTMLBridge.prototype._extractManualRefreshReportShape = function (value) {
    return getBridgeManualRefresh().extractReportShape(value);
  };

  HTMLBridge.prototype._isManualRefreshReportFailure = function (reportLike) {
    return getBridgeManualRefresh().isReportFailure(this, reportLike);
  };

  HTMLBridge.prototype._isManualRefreshHardFailure = function (report) {
    return getBridgeManualRefresh().isHardFailure(this, report);
  };

  HTMLBridge.prototype._manualRefreshErrorReason = function (report, fallback) {
    return getBridgeManualRefresh().errorReason(this, report, fallback);
  };

  HTMLBridge.prototype._formatManualRefreshDiagSuffix = function (outcome) {
    return getBridgeManualRefresh().formatDiagSuffix(this, outcome);
  };

  HTMLBridge.prototype._normalizeManualRefreshOutcome = function (outcome) {
    return getBridgeManualRefresh().normalizeOutcome(this, outcome);
  };

  HTMLBridge.prototype._isManualRefreshOutcomeOrReportLike = function (value) {
    return getBridgeManualRefresh().isOutcomeOrReportLike(this, value);
  };

  HTMLBridge.prototype._invalidManualRefreshOutcome = function (rawOutcome, prefix) {
    return getBridgeManualRefresh().invalidOutcome(this, rawOutcome, prefix);
  };

  HTMLBridge.prototype._requestManualRefreshReport = function (payload) {
    return getBridgeManualRefresh().requestReport(this, payload);
  };

  HTMLBridge.prototype._normalizeClassRenameToken = function (raw, opts) {
    opts = opts || {};
    var token = String(raw == null ? '' : raw).trim();
    if (!token) return '';
    token = token.replace(/^[.#]+/, '');
    token = token.split(/\s+/)[0] || '';
    token = token.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-');
    token = token.replace(/^-+/, '').replace(/-+$/, '');
    if (!token) return '';
    if (opts.forNew && !/^[A-Za-z_]/.test(token)) token = 'c-' + token;
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) return '';
    return token;
  };

  HTMLBridge.prototype._collectEditableClassTokensFromSource = function (sourceText) {
    sourceText = String(sourceText || '');
    var out = [];
    var seen = {};
    var re = /(class\s*=\s*)(\"([^\"]*)\"|'([^']*)')/gi;
    var m;
    while ((m = re.exec(sourceText))) {
      var raw = m[3] != null ? m[3] : m[4];
      var tokens = String(raw || '').trim() ? String(raw || '').trim().split(/\s+/) : [];
      for (var i = 0; i < tokens.length; i++) {
        var token = String(tokens[i] || '').trim();
        if (!token || this._isSystemClass(token) || seen[token]) continue;
        seen[token] = true;
        out.push(token);
      }
    }
    return out;
  };

  HTMLBridge.prototype._classTokenMatchesPrefixRename = function (token, prefix) {
    token = String(token || '').trim();
    prefix = String(prefix || '').trim();
    if (!token || !prefix) return false;
    if (token === prefix) return true;
    if (token.indexOf(prefix) !== 0) return false;
    var next = token.charAt(prefix.length);
    return next === '_' || next === '-';
  };

  HTMLBridge.prototype._renameClassTokensByPrefixInHtml = function (sourceText, oldPrefix, newPrefix) {
    sourceText = String(sourceText || '');
    oldPrefix = String(oldPrefix || '').trim();
    newPrefix = String(newPrefix || '').trim();
    if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) {
      return { html: sourceText, changedCount: 0, touchedAttrs: 0 };
    }

    var changedCount = 0;
    var touchedAttrs = 0;
    var re = /(class\s*=\s*)(\"([^\"]*)\"|'([^']*)')/gi;
    var html = sourceText.replace(re, function (full, prefixAttr, _quoted, doubleVal, singleVal) {
      var quote = doubleVal != null ? '"' : '\'';
      var raw = doubleVal != null ? doubleVal : singleVal;
      var parts = String(raw || '').trim() ? String(raw || '').trim().split(/\s+/) : [];
      if (!parts.length) return full;

      var next = [];
      var seen = {};
      var localChanged = 0;
      for (var i = 0; i < parts.length; i++) {
        var token = String(parts[i] || '').trim();
        if (!token) continue;
        if (this._classTokenMatchesPrefixRename(token, oldPrefix)) {
          token = newPrefix + token.slice(oldPrefix.length);
          localChanged++;
        }
        if (!token || seen[token]) continue;
        seen[token] = true;
        next.push(token);
      }
      if (!localChanged) return full;
      changedCount += localChanged;
      touchedAttrs++;
      return String(prefixAttr || 'class=') + quote + next.join(' ') + quote;
    }.bind(this));

    return { html: html, changedCount: changedCount, touchedAttrs: touchedAttrs };
  };

  HTMLBridge.prototype._normalizeBemOptionalPart = function (raw) {
    var token = String(raw == null ? '' : raw).trim().toLowerCase();
    token = token.replace(/[^a-z0-9_-]/g, '-').replace(/_+/g, '-').replace(/-+/g, '-');
    token = token.replace(/^-+/, '').replace(/-+$/, '');
    if (!token) return '';
    if (!/^[a-z]/.test(token)) token = 'e-' + token;
    return token;
  };

  HTMLBridge.prototype._normalizeBemPart = function (raw, fallback) {
    var token = this._normalizeBemOptionalPart(raw);
    if (!token) token = this._normalizeBemOptionalPart(fallback);
    if (!token) token = 'item';
    return token;
  };

  HTMLBridge.prototype._defaultBemElementTokenForTag = function (tagName) {
    tagName = String(tagName || '').toLowerCase();
    if (!tagName) return 'item';
    if (tagName === 'div') return 'container';
    if (tagName === 'section') return 'section';
    if (tagName === 'article') return 'article';
    if (tagName === 'aside') return 'aside';
    if (tagName === 'header') return 'header';
    if (tagName === 'footer') return 'footer';
    if (tagName === 'main') return 'main';
    if (tagName === 'nav') return 'nav';
    if (tagName === 'ul' || tagName === 'ol') return 'list';
    if (tagName === 'li') return 'item';
    if (/^h[1-6]$/.test(tagName)) return 'heading';
    if (tagName === 'p' || tagName === 'span') return 'text';
    if (tagName === 'a') return 'link';
    if (tagName === 'img') return 'image';
    if (tagName === 'button') return 'button';
    if (tagName === 'form') return 'form';
    if (tagName === 'input') return 'input';
    if (tagName === 'textarea') return 'textarea';
    if (tagName === 'select') return 'select';
    if (tagName === 'option') return 'option';
    if (tagName === 'figure') return 'figure';
    if (tagName === 'figcaption') return 'caption';
    if (tagName === 'video') return 'video';
    if (tagName === 'table') return 'table';
    if (tagName === 'thead') return 'table-head';
    if (tagName === 'tbody') return 'table-body';
    if (tagName === 'tfoot') return 'table-foot';
    if (tagName === 'tr') return 'row';
    if (tagName === 'td') return 'cell';
    if (tagName === 'th') return 'head-cell';
    return this._normalizeBemPart(tagName, 'item');
  };

  HTMLBridge.prototype._extractBemCandidateFromClassToken = function (token, blockName, oldHint) {
    token = String(token || '').trim();
    blockName = String(blockName || '').trim();
    oldHint = String(oldHint || '').trim();
    if (!token) return '';
    var base = token;
    var idx = base.indexOf('__');
    if (idx >= 0) {
      base = base.slice(idx + 2);
    } else {
      idx = base.indexOf('--');
      if (idx >= 0) base = base.slice(0, idx);
    }
    if (oldHint && base.indexOf(oldHint + '-') === 0) base = base.slice(oldHint.length + 1);
    if (oldHint && base.indexOf(oldHint + '_') === 0) base = base.slice(oldHint.length + 1);
    if (blockName && base.indexOf(blockName + '-') === 0) base = base.slice(blockName.length + 1);
    if (blockName && base.indexOf(blockName + '_') === 0) base = base.slice(blockName.length + 1);
    return this._normalizeBemOptionalPart(base);
  };

  HTMLBridge.prototype._inferBemElementToken = function (node, blockName, oldHint) {
    var classes = this._getEditableUserClasses(node);
    var best = '';
    for (var i = 0; i < classes.length; i++) {
      var c = String(classes[i] || '').trim();
      if (!c || c === blockName) continue;
      var candidate = this._extractBemCandidateFromClassToken(c, blockName, oldHint);
      if (!candidate) continue;
      if (!best) {
        best = candidate;
        continue;
      }
      if (best === candidate) continue;
      if (candidate.indexOf(best + '-') === 0 || candidate.indexOf(best + '_') === 0) continue;
      if (best.indexOf(candidate + '-') === 0 || best.indexOf(candidate + '_') === 0) {
        best = candidate;
      }
    }
    if (best) return best;
    return this._normalizeBemPart('', this._defaultBemElementTokenForTag((node && node.tagName) || ''));
  };

  HTMLBridge.prototype._extractBemModifierFromClassToken = function (token, elementToken, blockName, oldHint) {
    var self = this;
    token = String(token || '').trim();
    elementToken = this._normalizeBemOptionalPart(elementToken || '');
    blockName = this._normalizeBemOptionalPart(blockName || '');
    oldHint = this._normalizeBemOptionalPart(oldHint || '');
    if (!token) return '';

    var lowered = token.toLowerCase();
    var explicitMod = lowered.match(/--([a-z0-9_-]+)$/);
    if (explicitMod && explicitMod[1]) {
      return this._normalizeBemOptionalPart(explicitMod[1]);
    }

    lowered = lowered.replace(/^(is|has|with|no)-/, '');
    var work = lowered;

    function stripPrefix(prefix) {
      if (!prefix) return;
      if (work === prefix) {
        work = '';
        return;
      }
      if (work.indexOf(prefix + '__') === 0) {
        work = work.slice(prefix.length + 2);
        return;
      }
      if (work.indexOf(prefix + '-') === 0 || work.indexOf(prefix + '_') === 0) {
        work = work.slice(prefix.length + 1);
      }
    }

    stripPrefix(blockName);
    if (oldHint && oldHint !== blockName) stripPrefix(oldHint);

    if (work.indexOf('__') >= 0) {
      var bemTail = work.split('__');
      work = bemTail[bemTail.length - 1] || '';
    }

    var tailMod = work.match(/^(?:[a-z0-9_-]+)--([a-z0-9_-]+)$/);
    if (tailMod && tailMod[1]) {
      return this._normalizeBemOptionalPart(tailMod[1]);
    }

    if (elementToken) {
      if (work === elementToken) return '';
      if (work.indexOf(elementToken + '-') === 0 || work.indexOf(elementToken + '_') === 0) {
        work = work.slice(elementToken.length + 1);
      }
      if (work.indexOf(elementToken + '--') === 0) {
        work = work.slice(elementToken.length + 2);
      }
    }

    var mod = self._normalizeBemOptionalPart(work);
    if (!mod) return '';
    if (mod === elementToken || mod === blockName || mod === oldHint) return '';
    return mod;
  };

  HTMLBridge.prototype._buildStrictBemClassList = function (previousUserClasses, blockName, elementToken, oldHint, isBlockRoot) {
    previousUserClasses = Array.isArray(previousUserClasses) ? previousUserClasses : [];
    blockName = this._normalizeBemPart(blockName || '', 'block');
    elementToken = this._normalizeBemPart(elementToken || '', this._defaultBemElementTokenForTag('div'));
    oldHint = this._normalizeBemOptionalPart(oldHint || '');

    var baseClass = isBlockRoot ? blockName : (blockName + '__' + elementToken);
    var out = [baseClass];
    var seenMods = {};
    for (var i = 0; i < previousUserClasses.length; i++) {
      var token = String(previousUserClasses[i] || '').trim();
      if (!token) continue;
      var mod = this._extractBemModifierFromClassToken(token, elementToken, blockName, oldHint);
      if (!mod || seenMods[mod]) continue;
      seenMods[mod] = true;
      out.push(baseClass + '--' + mod);
    }
    return out;
  };

  HTMLBridge.prototype._generateBemBulkHtml = function (sourceText, blockName, oldHint) {
    sourceText = String(sourceText || '');
    blockName = this._normalizeClassRenameToken(blockName, { forNew: true });
    blockName = this._normalizeBemPart(blockName, 'block');
    oldHint = this._normalizeClassRenameToken(oldHint, { forNew: false });
    oldHint = this._normalizeBemOptionalPart(oldHint);
    if (!blockName) return { html: sourceText, changedCount: 0, touchedAttrs: 0, generatedCount: 0 };
    if (typeof DOMParser !== 'function') {
      return { html: sourceText, changedCount: 0, touchedAttrs: 0, generatedCount: 0 };
    }

    var parser = new DOMParser();
    var doc = parser.parseFromString(sourceText, 'text/html');
    var roots = Array.prototype.slice.call(doc.body.childNodes || []).filter(function (n) { return n && n.nodeType === 1; });
    if (!roots.length) return { html: sourceText, changedCount: 0, touchedAttrs: 0, generatedCount: 0 };

    var changedCount = 0;
    var touchedAttrs = 0;
    var generatedCount = 0;
    var singleRoot = roots.length === 1;
    var self = this;

    function applyNode(node, depth) {
      if (!node || node.nodeType !== 1) return;
      var previousUser = self._getEditableUserClasses(node);
      var systemClasses = [];
      var currentClasses = Array.prototype.slice.call(node.classList || []);
      for (var i = 0; i < currentClasses.length; i++) {
        if (self._isSystemClass(currentClasses[i])) systemClasses.push(String(currentClasses[i] || '').trim());
      }

      var isBlockRoot = depth === 0 && singleRoot;
      var elementToken = self._inferBemElementToken(node, blockName, oldHint);
      var strictBemClasses = self._buildStrictBemClassList(previousUser, blockName, elementToken, oldHint, isBlockRoot);

      var nextClasses = systemClasses.slice();
      for (i = 0; i < strictBemClasses.length; i++) {
        var bemClass = String(strictBemClasses[i] || '').trim();
        if (!bemClass || nextClasses.indexOf(bemClass) !== -1) continue;
        nextClasses.push(bemClass);
      }
      var nextAttr = nextClasses.join(' ').trim();
      var currentAttr = String(node.getAttribute('class') || '').trim();
      if (currentAttr !== nextAttr) {
        touchedAttrs++;
        changedCount += Math.max(1, previousUser.length || 0);
        if (!previousUser.length) generatedCount++;
        if (nextAttr) node.setAttribute('class', nextAttr);
        else node.removeAttribute('class');
      }

      var children = Array.prototype.slice.call(node.children || []);
      for (var c = 0; c < children.length; c++) applyNode(children[c], depth + 1);
    }

    for (var r = 0; r < roots.length; r++) applyNode(roots[r], 0);
    if (!touchedAttrs) return { html: sourceText, changedCount: 0, touchedAttrs: 0, generatedCount: 0 };

    var out = [];
    for (r = 0; r < roots.length; r++) {
      var rootNode = roots[r];
      if (!rootNode || rootNode.nodeType !== 1) continue;
      out.push(String(rootNode.outerHTML || this._serializeNode(rootNode, 0)));
    }
    return {
      html: out.join('\n'),
      changedCount: changedCount,
      touchedAttrs: touchedAttrs,
      generatedCount: generatedCount
    };
  };

  HTMLBridge.prototype._renameClassOnSelectedElement = function (ctx, oldClass, newClass) {
    if (!ctx || ctx.mode !== 'element' || String(ctx.scope || 'self') !== 'self' || !ctx.element) {
      this._setPanelStatus('Class rename: switch to Self scope on selected element', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (!this.api || typeof this.api.updateElementSafeSubsetStateByDom !== 'function') {
      this._setPanelStatus('Class rename unavailable: Bricks API state sync helper missing', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    var current = this._getEditableUserClasses(ctx.element);
    if (!current.length) {
      this._setPanelStatus('Selected element has no editable class to rename', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (current.indexOf(oldClass) === -1) {
      this._setPanelStatus('Class not found on selected element: .' + oldClass, { channel: 'class', dedupeMs: 0 });
      return false;
    }

    var seen = {};
    var next = [];
    for (var i = 0; i < current.length; i++) {
      var token = current[i] === oldClass ? newClass : current[i];
      if (!token || seen[token]) continue;
      seen[token] = true;
      next.push(token);
    }
    if (this._sameStringArray(current, next)) {
      this._setPanelStatus('Class rename: no changes', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    var res = this.api.updateElementSafeSubsetStateByDom(ctx.element, {
      originalUserClasses: current,
      userClasses: next,
      classChanged: true
    }, { deferUiRefresh: true }) || {};

    if (!res.ok) {
      this._setPanelStatus('Class rename failed: ' + String(res.reason || 'state-sync-failed'), { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (typeof this.api.activateClassUiByName === 'function') {
      try {
        this.api.activateClassUiByName(newClass, {
          model: (typeof this.api.getElementModelByDom === 'function' ? this.api.getElementModelByDom(ctx.element).model : null),
          deferUiRefresh: true
        });
      } catch (eActive) { _warn('_renameClassOnSelectedElement', eActive); }
    }

    if (typeof this.api.notifyGlobalClassesChanged === 'function') {
      try { this.api.notifyGlobalClassesChanged(); } catch (e0) { _warn('_renameClassOnSelectedElement', e0); }
    }
    if (typeof this.api.notifyContentSettingsChanged === 'function') {
      try { this.api.notifyContentSettingsChanged(); } catch (e1) { _warn('_renameClassOnSelectedElement', e1); }
    }
    if (typeof this.api._touchBuilderUi === 'function') {
      try { this.api._touchBuilderUi(); } catch (e2) { _warn('_renameClassOnSelectedElement', e2); }
    }
    var renderId = String((res && res.id) || (ctx && ctx.id) || '');
    if (renderId && typeof this.api.renderElementInBuilder === 'function') {
      try { this.api.renderElementInBuilder(renderId); } catch (e3) { _warn('_renameClassOnSelectedElement', e3); }
    }
    var refreshOutcome = null;
    var refreshFailed = false;
    try {
      this._armIgnorePageSelectionWindow(ctx);
      refreshOutcome = this._requestManualRefreshReport({ includeSelection: false, reason: 'html-class-rename' });
      refreshFailed = !!refreshOutcome.finalFailed;
    } catch (e4) { _warn('_renameClassOnSelectedElement', e4); 
      refreshFailed = true;
    }

    this._dirty = false;
    this._dirtySelectionId = '';
    this._dirtyContextMode = '';
    this._lastAutoStatus = '';

    if (this.panel && typeof this.panel.flashAction === 'function') {
      this.panel.flashAction('Class renamed: .' + oldClass + ' -> .' + newClass, { kind: 'ok', ttlMs: 1200 });
    }
    if (refreshFailed) {
      this._setPanelStatus('Class renamed · refresh fallback applied' + this._formatManualRefreshDiagSuffix(refreshOutcome), { channel: 'class', dedupeMs: 0 });
    } else {
      this._setPanelStatus('Class renamed and synced: .' + oldClass + ' -> .' + newClass + this._formatManualRefreshDiagSuffix(refreshOutcome), { channel: 'class', dedupeMs: 0 });
    }
    this.refresh({ force: true });
    return true;
  };

  HTMLBridge.prototype.renameClassFromPanel = function (options) {
    options = options || {};
    var mode = String(options.mode || 'single').toLowerCase();
    var isBemBulkMode = mode === 'bem-bulk';
    var isPrefixBulkMode = mode === 'prefix-bulk';
    var isBulkMode = isBemBulkMode || isPrefixBulkMode;
    void isBemBulkMode;
    void isPrefixBulkMode;
    void isBulkMode;
    this._setPanelStatus('Class rename unavailable: CM6GPT Lite HTML lane is read-only', { channel: 'class', dedupeMs: 0 });
    return false;
    if (this.readOnly) {
      this._setPanelStatus('Class rename unavailable: CM6GPT Lite HTML lane is read-only', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (this._isAuthorLayer()) {
      this._setPanelStatus('Class rename unavailable in L1 Author layer · switch to L2', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (!this.editor || typeof this.editor.getValue !== 'function') return false;
    var ctx = this._getScopedContext();
    if (!ctx) {
      this._setPanelStatus('Class rename unavailable: Bricks selection context missing', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    if (isBulkMode) {
      var bulkContextReady = ctx.mode === 'page' || (ctx.mode === 'element' && !!ctx.element);
      if (!bulkContextReady) {
        this._setPanelStatus('Bulk rename unavailable: select a Bricks element or switch to Page mode', { channel: 'class', dedupeMs: 0 });
        return false;
      }
    } else if (!ctx.element || ctx.mode !== 'element' || String(ctx.scope || 'self') !== 'self') {
      this._setPanelStatus('Single rename requires selected element in Self scope (bulk modes work in other scopes)', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    var sourceText = String(this.editor.getValue ? this.editor.getValue() : '');
    if (isBemBulkMode) {
      var blockRaw = hasOwn(options, 'newClass') && String(options.newClass == null ? '' : options.newClass).trim()
        ? options.newClass
        : options.oldClass;
      var blockName = this._normalizeClassRenameToken(blockRaw, { forNew: true });
      if (!blockName) {
        this._setPanelStatus('BEM strict: invalid block name', { channel: 'class', dedupeMs: 0 });
        return false;
      }
      var oldHintRaw = hasOwn(options, 'oldClass') ? options.oldClass : '';
      var oldHint = '';
      if (String(oldHintRaw == null ? '' : oldHintRaw).trim()) {
        oldHint = this._normalizeClassRenameToken(oldHintRaw, { forNew: false });
      }
      var bem = this._generateBemBulkHtml(sourceText, blockName, oldHint);
      if (!bem.changedCount || String(bem.html || '') === sourceText) {
        this._setPanelStatus('BEM strict: no class changes in current HTML scope', { channel: 'class', dedupeMs: 0 });
        return false;
      }
      if (this.editor && typeof this.editor.setValue === 'function') {
        this.editor.setValue(String(bem.html || ''), { preserveScroll: true, preserveSelection: true });
      }
      var bemApplied = this.applyFromEditor({ source: 'manual' });
      if (!bemApplied) return false;
      if (this.panel && typeof this.panel.flashAction === 'function') {
        this.panel.flashAction(
          'BEM strict: .' + blockName + ' (' + bem.touchedAttrs + ' node, +' + bem.generatedCount + ' generated)',
          { kind: 'ok', ttlMs: 1500 }
        );
      }
      this._setPanelStatus(
        'BEM strict synced: .' + blockName + ' · ' + bem.touchedAttrs + ' node updated · ' + bem.generatedCount + ' class generated',
        { channel: 'class', dedupeMs: 0 }
      );
      return true;
    }

    var available = this._collectEditableClassTokensFromSource(sourceText);
    if (!available.length) {
      if (/\bclass\s*=/i.test(sourceText)) {
        this._setPanelStatus('No editable user classes in current HTML scope (only Bricks/system classes like brxe-*, brx-*, bricks-*). Use BEM strict to generate user classes.', { channel: 'class', dedupeMs: 0 });
      } else {
        this._setPanelStatus('No classes found in current HTML scope', { channel: 'class', dedupeMs: 0 });
      }
      return false;
    }

    var defaultOld = available[0];
    if (ctx.mode === 'element' && String(ctx.scope || 'self') === 'self' && ctx.element) {
      var selectedClasses = this._getEditableUserClasses(ctx.element);
      if (selectedClasses.length) defaultOld = selectedClasses[0];
    }

    var oldRaw = defaultOld;
    if (hasOwn(options, 'oldClass')) {
      var providedOld = String(options.oldClass == null ? '' : options.oldClass).trim();
      if (providedOld) oldRaw = options.oldClass;
    }
    var oldClass = this._normalizeClassRenameToken(oldRaw, { forNew: false });
    if (!oldClass) {
      this._setPanelStatus('Invalid source class name (rename menu: old class)', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    var newRaw = hasOwn(options, 'newClass') ? options.newClass : '';
    var newClass = this._normalizeClassRenameToken(newRaw, { forNew: true });
    if (!newClass) {
      this._setPanelStatus('Invalid target class name (rename menu: new class)', { channel: 'class', dedupeMs: 0 });
      return false;
    }
    if (oldClass === newClass) {
      this._setPanelStatus('Class rename skipped: source and target are identical', { channel: 'class', dedupeMs: 0 });
      return false;
    }

    if (isPrefixBulkMode) {
      var hasPrefixMatch = false;
      for (var i = 0; i < available.length; i++) {
        if (this._classTokenMatchesPrefixRename(available[i], oldClass)) {
          hasPrefixMatch = true;
          break;
        }
      }
      if (!hasPrefixMatch) {
        this._setPanelStatus('Prefix bulk rename: source prefix not found in current HTML scope (.' + oldClass + '*)', { channel: 'class', dedupeMs: 0 });
        return false;
      }

      var renamed = this._renameClassTokensByPrefixInHtml(sourceText, oldClass, newClass);
      if (!renamed.changedCount || String(renamed.html || '') === sourceText) {
        this._setPanelStatus('Prefix bulk rename: no class token starts with .' + oldClass, { channel: 'class', dedupeMs: 0 });
        return false;
      }

      if (this.editor && typeof this.editor.setValue === 'function') {
        this.editor.setValue(String(renamed.html || ''), { preserveScroll: true, preserveSelection: true });
      }
      var applied = this.applyFromEditor({ source: 'manual' });
      if (!applied) return false;

      if (this.panel && typeof this.panel.flashAction === 'function') {
        this.panel.flashAction(
          'Prefix bulk rename: .' + oldClass + '* -> .' + newClass + '* (' + renamed.changedCount + ')',
          { kind: 'ok', ttlMs: 1400 }
        );
      }
      this._setPanelStatus(
        'Prefix bulk rename synced: .' + oldClass + '* -> .' + newClass + '* (' + renamed.changedCount + ' token)',
        { channel: 'class', dedupeMs: 0 }
      );
      return true;
    }

    if (available.indexOf(oldClass) === -1) {
      this._setPanelStatus('Source class not found in current HTML scope: .' + oldClass, { channel: 'class', dedupeMs: 0 });
      return false;
    }

    return this._renameClassOnSelectedElement(ctx, oldClass, newClass);
  };

  HTMLBridge.prototype._parseEditorRoot = function (htmlText) {
    var roots = this._parseEditorRoots(htmlText);
    if (roots.length > 1) {
      throw new Error('Safe subset Apply HTML currently requires exactly 1 root element');
    }
    return roots[0];
  };

  HTMLBridge.prototype._parseEditorRoots = function (htmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(htmlText || ''), 'text/html');
    var elementChildren = Array.prototype.slice.call(doc.body.childNodes || []).filter(function (n) {
      return n && n.nodeType === 1;
    });
    if (!elementChildren.length) {
      throw new Error('No root element found in HTML editor');
    }
    return elementChildren;
  };

  HTMLBridge.prototype._buildSafeSubsetApplyPlan = function (actualRoot, parsedRoot) {
    if (!actualRoot || !parsedRoot) throw new Error('Missing actual or parsed root');

    this._assertNoUntrackedElements(parsedRoot);

    var actualRootBid = String(actualRoot.getAttribute('data-id') || '');
    var parsedRootBid = String(parsedRoot.getAttribute('data-bid') || '');
    if (!actualRootBid) {
      throw new Error('Root data-bid mismatch (selected=' + (actualRootBid || '?') + ', parsed=' + (parsedRootBid || '?') + ')');
    }
    // UX hardening: users often paste example snippets with placeholder/old data-bid.
    // For the root node we can safely normalize to the currently selected Bricks node ID.
    if (!parsedRootBid || parsedRootBid !== actualRootBid) {
      try {
        parsedRoot.setAttribute('data-bid', actualRootBid);
        parsedRootBid = actualRootBid;
      } catch (e) { _warn('_buildSafeSubsetApplyPlan', e); }
    }
    if (parsedRootBid !== actualRootBid) {
      throw new Error('Root data-bid mismatch (selected=' + (actualRootBid || '?') + ', parsed=' + (parsedRootBid || '?') + ')');
    }

    var parsedNodes = this._collectParsedBricksNodes(parsedRoot);
    var actualNodes = this._collectActualBricksNodes(actualRoot);
    if (parsedNodes.length !== actualNodes.length) {
      throw new Error('Structure changed: Bricks node count mismatch (' + parsedNodes.length + ' vs ' + actualNodes.length + ')');
    }

    var changedNodes = 0;
    var changedAttrOps = 0;
    var changedTextOps = 0;
    var changedClassOps = 0;
    var changedIdOps = 0;
    var changedManagedAttrOps = 0;
    var pairs = [];

    for (var i = 0; i < parsedNodes.length; i++) {
      var p = parsedNodes[i];
      var a = actualNodes[i];
      var pBid = String(p.getAttribute('data-bid') || '');
      var aBid = String(a.getAttribute('data-id') || '');
      if (!pBid || !aBid || pBid !== aBid) {
        throw new Error('Structure changed: node order/id mismatch at index ' + i);
      }
      if ((p.tagName || '').toLowerCase() !== (a.tagName || '').toLowerCase()) {
        throw new Error('Tag change not allowed in safe subset apply (index ' + i + ')');
      }

      var expected = this._captureDesiredNodeState(p);
      var original = this._captureActualNodeState(a);
      var diff = this._countNodeStateChanges(original, expected);
      if (diff.nodeChanged) changedNodes++;
      changedAttrOps += diff.attrOps;
      changedTextOps += diff.textOps;
      changedClassOps += diff.classOps || 0;
      changedIdOps += diff.idOps || 0;
      changedManagedAttrOps += diff.managedAttrOps || 0;

      pairs.push({
        actual: a,
        parsed: p,
        expected: expected,
        original: original
      });
    }

    return {
      actualRoot: actualRoot,
      parsedRoot: parsedRoot,
      pairs: pairs,
      changed: {
        nodes: changedNodes,
        attrOps: changedAttrOps,
        textOps: changedTextOps,
        classOps: changedClassOps,
        idOps: changedIdOps,
        managedAttrOps: changedManagedAttrOps
      }
    };
  };

  HTMLBridge.prototype._buildSafeSubsetPageApplyPlan = function (actualPageRoot, parsedRoots) {
    if (!actualPageRoot) throw new Error('Missing page root');
    parsedRoots = this._normalizePageParsedRoots(parsedRoots);
    if (!parsedRoots.length) throw new Error('No root elements found in HTML editor');

    var actualRoots = this.api && typeof this.api.getTopLevelBricksNodes === 'function'
      ? this.api.getTopLevelBricksNodes(actualPageRoot)
      : [];

    if (!actualRoots.length) {
      throw new Error('No top-level Bricks nodes found in page root');
    }

    if (parsedRoots.length !== actualRoots.length) {
      throw new Error('Page structure changed: top-level Bricks node count mismatch (' + parsedRoots.length + ' vs ' + actualRoots.length + ')');
    }

    var changedNodes = 0;
    var changedAttrOps = 0;
    var changedTextOps = 0;
    var changedClassOps = 0;
    var changedIdOps = 0;
    var changedManagedAttrOps = 0;
    var pairs = [];

    for (var i = 0; i < parsedRoots.length; i++) {
      var pRoot = parsedRoots[i];
      var aRoot = actualRoots[i];
      if (!pRoot || !aRoot) {
        throw new Error('Page structure changed: root mismatch at index ' + i);
      }

      this._assertNoUntrackedElements(pRoot);

      var aBid = String(aRoot.getAttribute('data-id') || '');
      var pBid = String(pRoot.getAttribute('data-bid') || '');
      if (!aBid) {
        throw new Error('Page structure changed: missing top-level actual data-id at index ' + i);
      }
      if (!pBid || pBid !== aBid) {
        try {
          pRoot.setAttribute('data-bid', aBid);
          pBid = aBid;
        } catch (e) { _warn('_buildSafeSubsetPageApplyPlan', e); }
      }
      if (!pBid || pBid !== aBid) {
        throw new Error('Page structure changed: top-level data-bid mismatch at index ' + i + ' (' + (pBid || '?') + ' vs ' + aBid + ')');
      }
      if ((pRoot.tagName || '').toLowerCase() !== (aRoot.tagName || '').toLowerCase()) {
        throw new Error('Page structure changed: top-level tag mismatch at index ' + i);
      }

      var subPlan = this._buildSafeSubsetApplyPlan(aRoot, pRoot);
      changedNodes += subPlan.changed.nodes || 0;
      changedAttrOps += subPlan.changed.attrOps || 0;
      changedTextOps += subPlan.changed.textOps || 0;
      changedClassOps += subPlan.changed.classOps || 0;
      changedIdOps += subPlan.changed.idOps || 0;
      changedManagedAttrOps += subPlan.changed.managedAttrOps || 0;

      for (var p = 0; p < subPlan.pairs.length; p++) {
        pairs.push(subPlan.pairs[p]);
      }
    }

    return {
      actualRoot: actualPageRoot,
      parsedRoots: parsedRoots,
      pairs: pairs,
      changed: {
        nodes: changedNodes,
        attrOps: changedAttrOps,
        textOps: changedTextOps,
        classOps: changedClassOps,
        idOps: changedIdOps,
        managedAttrOps: changedManagedAttrOps
      }
    };
  };

  HTMLBridge.prototype._normalizePageParsedRoots = function (parsedRoots) {
    parsedRoots = Array.isArray(parsedRoots) ? parsedRoots.filter(function (node) {
      return !!(node && node.nodeType === 1);
    }) : [];
    if (parsedRoots.length !== 1) return parsedRoots;

    var root = parsedRoots[0];
    if (!root || !root.querySelectorAll) return parsedRoots;
    if (root.hasAttribute && root.hasAttribute('data-bid')) return parsedRoots;

    var extracted = this._collectTopLevelParsedPageRoots(root);
    return extracted.length ? extracted : parsedRoots;
  };

  HTMLBridge.prototype._collectTopLevelParsedPageRoots = function (root) {
    if (!root || !root.querySelectorAll) return [];
    var selector = '[data-bid]';
    var nodes = Array.prototype.slice.call(root.querySelectorAll(selector) || []);
    return nodes.filter(function (node) {
      if (!node || node.nodeType !== 1) return false;
      var parent = node.parentElement && node.parentElement.closest
        ? node.parentElement.closest(selector)
        : null;
      return !parent;
    });
  };

  HTMLBridge.prototype._buildSafeSubsetCollectionApplyPlan = function (actualContainerRoot, actualRoots, parsedRoots, label) {
    label = String(label || 'Collection');
    if (!actualContainerRoot) throw new Error('Missing collection root');
    parsedRoots = Array.isArray(parsedRoots) ? parsedRoots : [];
    actualRoots = Array.isArray(actualRoots) ? actualRoots : [];
    if (!parsedRoots.length) throw new Error('No root elements found in HTML editor');
    if (!actualRoots.length) throw new Error(label + ' structure changed: no target Bricks nodes found');
    if (parsedRoots.length !== actualRoots.length) {
      throw new Error(label + ' structure changed: Bricks node count mismatch (' + parsedRoots.length + ' vs ' + actualRoots.length + ')');
    }

    var changedNodes = 0;
    var changedAttrOps = 0;
    var changedTextOps = 0;
    var changedClassOps = 0;
    var changedIdOps = 0;
    var changedManagedAttrOps = 0;
    var pairs = [];

    for (var i = 0; i < parsedRoots.length; i++) {
      var pRoot = parsedRoots[i];
      var aRoot = actualRoots[i];
      if (!pRoot || !aRoot) {
        throw new Error(label + ' structure changed: root mismatch at index ' + i);
      }

      this._assertNoUntrackedElements(pRoot);

      var aBid = String(aRoot.getAttribute('data-id') || '');
      var pBid = String(pRoot.getAttribute('data-bid') || '');
      if (!aBid) {
        throw new Error(label + ' structure changed: missing actual data-id at index ' + i);
      }
      if (!pBid || pBid !== aBid) {
        try {
          pRoot.setAttribute('data-bid', aBid);
          pBid = aBid;
        } catch (e) { _warn('_buildSafeSubsetCollectionApplyPlan', e); }
      }
      if (!pBid || pBid !== aBid) {
        throw new Error(label + ' structure changed: data-bid mismatch at index ' + i + ' (' + (pBid || '?') + ' vs ' + aBid + ')');
      }
      if ((pRoot.tagName || '').toLowerCase() !== (aRoot.tagName || '').toLowerCase()) {
        throw new Error(label + ' structure changed: tag mismatch at index ' + i);
      }

      var subPlan = this._buildSafeSubsetApplyPlan(aRoot, pRoot);
      changedNodes += subPlan.changed.nodes || 0;
      changedAttrOps += subPlan.changed.attrOps || 0;
      changedTextOps += subPlan.changed.textOps || 0;
      changedClassOps += subPlan.changed.classOps || 0;
      changedIdOps += subPlan.changed.idOps || 0;
      changedManagedAttrOps += subPlan.changed.managedAttrOps || 0;

      for (var p = 0; p < subPlan.pairs.length; p++) {
        pairs.push(subPlan.pairs[p]);
      }
    }

    return {
      actualRoot: actualContainerRoot,
      parsedRoots: parsedRoots,
      pairs: pairs,
      changed: {
        nodes: changedNodes,
        attrOps: changedAttrOps,
        textOps: changedTextOps,
        classOps: changedClassOps,
        idOps: changedIdOps,
        managedAttrOps: changedManagedAttrOps
      }
    };
  };

  HTMLBridge.prototype._assertNoUntrackedElements = function (parsedRoot) {
    var all = Array.prototype.slice.call(parsedRoot.querySelectorAll('*') || []);
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      if (!node.hasAttribute || !node.hasAttribute('data-bid')) {
        throw new Error('Structure change not allowed: nested non-Bricks elements are not supported in safe subset apply');
      }
    }
    if (!parsedRoot.hasAttribute || !parsedRoot.hasAttribute('data-bid')) {
      throw new Error('Root element must include data-bid');
    }
  };

  HTMLBridge.prototype._collectParsedBricksNodes = function (root) {
    var out = [];
    if (root && root.nodeType === 1 && root.hasAttribute('data-bid')) out.push(root);
    var descendants = root ? root.querySelectorAll('[data-bid]') : [];
    for (var i = 0; i < descendants.length; i++) out.push(descendants[i]);
    return out;
  };

  HTMLBridge.prototype._collectActualBricksNodes = function (root) {
    var out = [];
    if (root && root.nodeType === 1 && root.hasAttribute('data-id')) out.push(root);
    var descendants = root ? root.querySelectorAll('[data-id]') : [];
    for (var i = 0; i < descendants.length; i++) out.push(descendants[i]);
    return out;
  };

  HTMLBridge.prototype._captureDesiredNodeState = function (node) {
    return {
      classMode: 'merge-user',
      userClasses: this._getEditableUserClasses(node),
      idRaw: this._normalizeAttrRaw(node.getAttribute('id')),
      attrs: this._collectManagedAttrs(node, 'parsed'),
      unsupportedAttrs: this._collectUnsupportedParsedAttrs(node),
      text: this._getDirectMeaningfulText(node)
    };
  };

  HTMLBridge.prototype._captureActualNodeState = function (node) {
    return {
      classMode: 'raw',
      rawClassAttr: this._normalizeAttrRaw(node.getAttribute('class')),
      idRaw: this._normalizeAttrRaw(node.getAttribute('id')),
      attrs: this._collectManagedAttrs(node, 'actual'),
      text: this._getDirectMeaningfulText(node)
    };
  };

  HTMLBridge.prototype._normalizeAttrRaw = function (value) {
    return value == null ? null : String(value);
  };

  HTMLBridge.prototype._countNodeStateChanges = function (original, expected) {
    var attrOps = 0;
    var textOps = 0;
    var classOps = 0;
    var idOps = 0;
    var managedAttrOps = 0;
    var nodeChanged = false;

    var currentUser = original.classMode === 'raw'
      ? this._splitUserClassesFromRawClass(original.rawClassAttr)
      : (original.userClasses || []);
    if (!this._sameStringArray(currentUser, expected.userClasses || [])) {
      attrOps++;
      classOps++;
      nodeChanged = true;
    }

    if ((original.idRaw || null) !== (expected.idRaw || null)) {
      attrOps++;
      idOps++;
      nodeChanged = true;
    }

    var keys = this._unionKeys(original.attrs, expected.attrs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var a = hasOwn(original.attrs, k) ? original.attrs[k] : null;
      var b = hasOwn(expected.attrs, k) ? expected.attrs[k] : null;
      if (a !== b) {
        attrOps++;
        managedAttrOps++;
        nodeChanged = true;
      }
    }

    if ((original.text || '') !== (expected.text || '')) {
      textOps++;
      nodeChanged = true;
    }

    return {
      nodeChanged: nodeChanged,
      attrOps: attrOps,
      textOps: textOps,
      classOps: classOps,
      idOps: idOps,
      managedAttrOps: managedAttrOps
    };
  };

  HTMLBridge.prototype._collectUnsupportedParsedAttrs = function (node) {
    var out = [];
    var seen = {};
    var attrs = Array.prototype.slice.call((node && node.attributes) || []);
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var name = String(attr && attr.name || '').toLowerCase();
      if (!name || seen[name]) continue;
      if (this._isManagedAttrName(name, 'parsed', attr && attr.value)) continue;
      seen[name] = true;
      out.push(name);
    }
    out.sort();
    return out;
  };

  HTMLBridge.prototype._summarizeSafeSubsetPlan = function (plan) {
    plan = plan || {};
    var pairs = Array.isArray(plan.pairs) ? plan.pairs : [];
    var unsupportedNameMap = {};
    var classNodes = 0;
    var idNodes = 0;
    var attrsNodes = 0;
    var textNodes = 0;

    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i] || {};
      var original = pair.original || {};
      var expected = pair.expected || {};
      var currentUser = original.classMode === 'raw'
        ? this._splitUserClassesFromRawClass(original.rawClassAttr)
        : (original.userClasses || []);

      if (!this._sameStringArray(currentUser, expected.userClasses || [])) classNodes++;
      if ((original.idRaw || null) !== (expected.idRaw || null)) idNodes++;
      if (!this._sameStringMap(original.attrs || {}, expected.attrs || {})) attrsNodes++;
      if ((original.text || '') !== (expected.text || '')) textNodes++;

      var unsupported = Array.isArray(expected.unsupportedAttrs) ? expected.unsupportedAttrs : [];
      for (var u = 0; u < unsupported.length; u++) {
        var key = String(unsupported[u] || '').toLowerCase();
        if (!key) continue;
        unsupportedNameMap[key] = true;
      }
    }

    var unsupportedNames = Object.keys(unsupportedNameMap).sort();
    return {
      pairCount: pairs.length,
      changedNodes: Number(plan.changed && plan.changed.nodes || 0),
      fields: {
        class: { supported: true, changedNodes: classNodes, changedOps: Number(plan.changed && plan.changed.classOps || 0) },
        id: { supported: true, changedNodes: idNodes, changedOps: Number(plan.changed && plan.changed.idOps || 0) },
        attrs: { supported: true, changedNodes: attrsNodes, changedOps: Number(plan.changed && plan.changed.managedAttrOps || 0) },
        text: { supported: true, changedNodes: textNodes, changedOps: Number(plan.changed && plan.changed.textOps || 0) }
      },
      unsupportedButSafe: {
        detected: unsupportedNames.length > 0,
        count: unsupportedNames.length,
        names: unsupportedNames
      }
    };
  };

  HTMLBridge.prototype.getSafeSubsetCompilerReport = function (opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    var ctx = opts.ctx || this._getScopedContext();
    var sourceText = hasOwn(opts, 'sourceText')
      ? String(opts.sourceText == null ? '' : opts.sourceText)
      : (this.editor && typeof this.editor.getValue === 'function' ? String(this.editor.getValue() || '') : '');
    var ctxKey = this._contextKey(ctx);
    var analysis = null;
    var gate = null;
    var report = {
      lane: 'html',
      compiler: 'text-native-safe-subset-v1',
      context: {
        key: ctxKey,
        mode: ctx && ctx.mode ? String(ctx.mode) : 'none',
        scope: ctx && ctx.scope ? String(ctx.scope) : ''
      },
      source: {
        length: sourceText.length
      },
      gate: null,
      summary: null,
      parity: {
        compileReady: false,
        losslessSubset: false
      },
      ok: false,
      reason: ''
    };

    if (!ctx) {
      report.reason = 'missing-context';
      return report;
    }

    try {
      if (ctx.mode === 'element') {
        analysis = this._getAnalysis(ctx);
      }
      gate = this._normalizeGateForUx(analysis && analysis.applyGate ? analysis.applyGate : null);
    } catch (analysisErr) { if (!silent) _warn('getSafeSubsetCompilerReport', analysisErr);
      report.reason = 'analysis-lookup-failed';
      report.error = analysisErr && analysisErr.message ? String(analysisErr.message) : String(analysisErr || '');
      return report;
    }

    report.gate = gate
      ? {
          level: String(gate.level || 'allow'),
          policyMode: String(gate.policyMode || ''),
          safeSubsetAllowed: gate.htmlApplySafeSubsetAllowed !== false,
          structureAllowed: gate.htmlApplyStructureAllowed !== false,
          reasons: Array.isArray(gate.reasons) ? gate.reasons.slice(0) : []
        }
      : null;

    var parseRoots = null;
    try {
      parseRoots = this._resolveStructureRootsForApply(sourceText, ctx);
    } catch (parseErr) { if (!silent) _warn('getSafeSubsetCompilerReport', parseErr);
      report.reason = 'parse-failed';
      report.error = parseErr && parseErr.message ? String(parseErr.message) : String(parseErr || '');
      return report;
    }

    var plan = null;
    try {
      if (ctx.mode === 'page') {
        plan = this._buildSafeSubsetPageApplyPlan(ctx.element, parseRoots);
      } else if (ctx.mode === 'element' && String(ctx.scope || 'self') === 'children') {
        plan = this._buildSafeSubsetCollectionApplyPlan(ctx.element, parseRoots);
      } else if (ctx.mode === 'element') {
        if (!parseRoots || !parseRoots.length) throw new Error('No root element found in HTML editor');
        plan = this._buildSafeSubsetApplyPlan(ctx.element, parseRoots[0]);
      } else {
        throw new Error('Unsupported context mode: ' + String(ctx.mode || 'unknown'));
      }
    } catch (planErr) { if (!silent) _warn('getSafeSubsetCompilerReport', planErr);
      report.reason = 'compile-failed';
      report.error = planErr && planErr.message ? String(planErr.message) : String(planErr || '');
      return report;
    }

    var summary = this._summarizeSafeSubsetPlan(plan);
    report.summary = summary;
    report.parity.compileReady = true;
    report.parity.losslessSubset = !summary.unsupportedButSafe.detected;
    report.ok = true;
    report.reason = 'ok';
    return report;
  };

  HTMLBridge.prototype._verifyApplyPlan = function (plan) {
    var expectedOrder = [];
    var expectedSignatures = [];
    var currentSignatures = [];
    for (var i = 0; i < plan.pairs.length; i++) {
      var pair = plan.pairs[i];
      var nodeId = String(pair.actual && pair.actual.getAttribute ? (pair.actual.getAttribute('data-id') || '') : '');
      if (nodeId) expectedOrder.push(nodeId);
      var current = {
        userClasses: this._getEditableUserClasses(pair.actual),
        idRaw: this._normalizeAttrRaw(pair.actual.getAttribute('id')),
        attrs: this._collectManagedAttrs(pair.actual, 'actual'),
        text: this._getDirectMeaningfulText(pair.actual)
      };
      var expected = {
        userClasses: pair.expected.userClasses || [],
        idRaw: pair.expected.idRaw || null,
        attrs: pair.expected.attrs || {},
        text: pair.expected.text || ''
      };
      if (!this._sameStringArray(current.userClasses, expected.userClasses)) {
        return { ok: false, reason: 'user class verify mismatch at #' + (pair.actual.getAttribute('data-id') || '?') };
      }
      if ((current.idRaw || null) !== (expected.idRaw || null)) {
        return { ok: false, reason: 'id verify mismatch at #' + (pair.actual.getAttribute('data-id') || '?') };
      }
      if (!this._sameStringMap(current.attrs, expected.attrs)) {
        return { ok: false, reason: 'attr verify mismatch at #' + (pair.actual.getAttribute('data-id') || '?') };
      }
      if ((current.text || '') !== (expected.text || '')) {
        return { ok: false, reason: 'text verify mismatch at #' + (pair.actual.getAttribute('data-id') || '?') };
      }
      currentSignatures.push(nodeId + '|' + this._buildVerifyAttrTextSignature(current));
      expectedSignatures.push(nodeId + '|' + this._buildVerifyAttrTextSignature(expected));
    }

    if (plan && plan.actualRoot && expectedOrder.length) {
      var expectedSet = {};
      for (var o = 0; o < expectedOrder.length; o++) expectedSet[expectedOrder[o]] = true;
      var currentOrder = [];
      var currentNodes = this._collectActualBricksNodes(plan.actualRoot);
      for (var n = 0; n < currentNodes.length; n++) {
        var currentId = String(currentNodes[n] && currentNodes[n].getAttribute ? (currentNodes[n].getAttribute('data-id') || '') : '');
        if (currentId && expectedSet[currentId]) currentOrder.push(currentId);
      }
      if (!this._sameStringArray(currentOrder, expectedOrder)) {
        return { ok: false, reason: 'node order verify mismatch' };
      }
    }

    var currentHash = this._hashVerifyText(currentSignatures.join('||'));
    var expectedHash = this._hashVerifyText(expectedSignatures.join('||'));
    if (currentHash !== expectedHash) {
      return { ok: false, reason: 'attrs/text hash verify mismatch' };
    }
    return { ok: true };
  };

  HTMLBridge.prototype._buildVerifyAttrTextSignature = function (state) {
    state = state || {};
    var attrs = state.attrs || {};
    var keys = Object.keys(attrs).sort();
    var attrParts = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = hasOwn(attrs, key) ? attrs[key] : null;
      attrParts.push(key + '=' + String(val == null ? '' : val));
    }
    return attrParts.join('&') + '||' + String(state.text == null ? '' : state.text);
  };

  HTMLBridge.prototype._hashVerifyText = function (value) {
    return getBridgeCanonicalReport().hashText(value);
  };

  HTMLBridge.prototype._applyNodeState = function (node, state) {
    if (!node || !state) return;

    if (state.classMode === 'raw') {
      this._setAttrRaw(node, 'class', state.rawClassAttr);
    } else {
      this._applyMergedUserClasses(node, state.userClasses || []);
    }

    this._setAttrRaw(node, 'id', state.idRaw);

    var current = this._collectManagedAttrs(node, 'actual');
    var desired = state.attrs || {};
    var keys = this._unionKeys(current, desired);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var next = hasOwn(desired, key) ? desired[key] : null;
      this._setAttrRaw(node, key, next);
    }

    this._setDirectMeaningfulText(node, state.text || '');
  };

  HTMLBridge.prototype._unionKeys = function (a, b) {
    var out = {};
    var key;
    a = a || {};
    b = b || {};
    for (key in a) if (hasOwn(a, key)) out[key] = true;
    for (key in b) if (hasOwn(b, key)) out[key] = true;
    return Object.keys(out).sort();
  };

  HTMLBridge.prototype._sameStringArray = function (a, b) {
    a = a || [];
    b = b || [];
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (String(a[i]) !== String(b[i])) return false;
    return true;
  };

  HTMLBridge.prototype._sameStringMap = function (a, b) {
    var keys = this._unionKeys(a || {}, b || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var av = hasOwn(a || {}, k) ? (a || {})[k] : null;
      var bv = hasOwn(b || {}, k) ? (b || {})[k] : null;
      if (av !== bv) return false;
    }
    return true;
  };

  HTMLBridge.prototype._setAttrRaw = function (node, name, rawValue) {
    if (!node || !name) return;
    if (rawValue == null) {
      node.removeAttribute(name);
      return;
    }
    if (rawValue === '' && !this._isEmptyStringAttributeAllowed(name)) {
      node.removeAttribute(name);
      return;
    }
    node.setAttribute(name, String(rawValue));
  };

  HTMLBridge.prototype._isEmptyStringAttributeAllowed = function (name) {
    name = String(name || '').toLowerCase();
    return name === 'itemscope';
  };

  HTMLBridge.prototype._applyMergedUserClasses = function (node, userClasses) {
    var existing = Array.prototype.slice.call(node.classList || []);
    var preserved = [];
    for (var i = 0; i < existing.length; i++) {
      if (this._isSystemClass(existing[i])) preserved.push(existing[i]);
    }
    var cleanUser = [];
    for (i = 0; i < userClasses.length; i++) {
      var c = String(userClasses[i] || '').trim();
      if (!c || this._isSystemClass(c)) continue;
      if (cleanUser.indexOf(c) === -1) cleanUser.push(c);
    }
    var finalClasses = preserved.concat(cleanUser);
    if (finalClasses.length) {
      node.setAttribute('class', finalClasses.join(' '));
    } else {
      node.removeAttribute('class');
    }
  };

  HTMLBridge.prototype._splitUserClassesFromRawClass = function (rawClassAttr) {
    if (!rawClassAttr) return [];
    var parts = String(rawClassAttr).split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (this._isSystemClass(parts[i])) continue;
      out.push(parts[i]);
    }
    return out;
  };

  HTMLBridge.prototype._getEditableUserClasses = function (node) {
    var classes = Array.prototype.slice.call(node.classList || []);
    var out = [];
    for (var i = 0; i < classes.length; i++) {
      var c = String(classes[i] || '');
      if (!c || this._isSystemClass(c)) continue;
      out.push(c);
    }
    return out;
  };

  HTMLBridge.prototype._isSystemClass = function (name) {
    name = String(name || '');
    if (!name) return false;
    if (/^brxe-/.test(name)) return true;
    if (/^brx-/.test(name)) return true;
    if (/^brxc-/.test(name)) return true;
    if (/^bricks-/.test(name)) return true;
    if (/^is-active-/.test(name)) return true;
    if (/^selected$/.test(name)) return true;
    return false;
  };

  HTMLBridge.prototype._collectManagedAttrs = function (node, mode) {
    var out = {};
    var attrs = Array.prototype.slice.call(node.attributes || []);
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var name = String(attr && attr.name || '');
      if (!this._isManagedAttrName(name, mode, attr && attr.value)) continue;
      out[name] = String(attr.value || '');
    }
    return out;
  };

  HTMLBridge.prototype._isManagedAttrName = function (name, mode, value) {
    name = String(name || '').toLowerCase();
    value = String(value == null ? '' : value);
    if (!name) return false;
    if (name === 'class' || name === 'id' || name === 'style') return false;
    if (name === 'data-id' || name === 'data-bid') return false;
    if (this._isBuilderDataAttr(name)) return false;
    if (name === 'contenteditable' || name === 'tabindex') return false;
    if (mode === 'parsed' && (name === 'data-script-id' || name === 'data-parent-id')) return false;
    if (/^aria-/.test(name)) return true;
    if (/^data-/.test(name)) return true;
    if (/^(role|itemscope|itemtype|itemprop|itemid|itemref|title|href|src|alt|target|rel|name|placeholder|type|value)$/i.test(name)) return true;
    return false;
  };

  HTMLBridge.prototype._isBuilderDataAttr = function (name) {
    if (!/^data-/.test(name)) return false;
    if (/^data-brx/i.test(name)) return true;
    if (/^data-v-/i.test(name)) return true;
    if (/^data-(script-id|parent-id|index|controls|placeholder)$/.test(name)) return true;
    if (/^data-parent-component$/.test(name)) return true;
    if (/^data-component(-instance)?$/.test(name)) return true;
    return false;
  };

  HTMLBridge.prototype._getDirectMeaningfulText = function (node) {
    if (!node || !node.childNodes) return '';
    var chunks = [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (!child || child.nodeType !== 3) continue;
      var text = String(child.textContent || '').trim();
      if (text) chunks.push(text);
    }
    return chunks.join(' ');
  };

  HTMLBridge.prototype._setDirectMeaningfulText = function (node, text) {
    if (!node) return;
    var normalized = String(text || '').trim();
    var childNodes = Array.prototype.slice.call(node.childNodes || []);
    for (var i = 0; i < childNodes.length; i++) {
      if (childNodes[i] && childNodes[i].nodeType === 3) {
        try { node.removeChild(childNodes[i]); } catch (e) { _warn('_setDirectMeaningfulText', e); }
      }
    }
    if (!normalized) return;
    var textNode = node.ownerDocument.createTextNode(normalized);
    var firstElementChild = null;
    for (i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i] && node.childNodes[i].nodeType === 1) {
        firstElementChild = node.childNodes[i];
        break;
      }
    }
    if (firstElementChild) {
      node.insertBefore(textNode, firstElementChild);
    } else {
      node.appendChild(textNode);
    }
  };

  HTMLBridge.prototype.destroy = function () {
    this._clearHoverPreview();
    this._clearPendingPageSelectionTimer();
    if (this._refreshDebounced && typeof this._refreshDebounced.cancel === 'function') {
      this._refreshDebounced.cancel();
    }
    if (this._autoApplyDebounced && typeof this._autoApplyDebounced.cancel === 'function') {
      this._autoApplyDebounced.cancel();
    }
    if (this._autoApplyClassDebounced && typeof this._autoApplyClassDebounced.cancel === 'function') {
      this._autoApplyClassDebounced.cancel();
    }
    if (this._autoApplyPageDebounced && typeof this._autoApplyPageDebounced.cancel === 'function') {
      this._autoApplyPageDebounced.cancel();
    }
    this._unsubs.forEach(function (u) {
      try { if (typeof u === 'function') u(); } catch (e) { _warn('destroy', e); }
    });
    this._unsubs = [];
  };

  ns.htmlBridgeInternals = ns.htmlBridgeInternals || {};
  ns.htmlBridgeInternals.createManagedTimeout = createManagedTimeout;
  ns.HTMLBridge = HTMLBridge;
})(window);
