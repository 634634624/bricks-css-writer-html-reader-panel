// W40 NOTE: Utility functions (hasOwn, isObject, debounce) are intentionally duplicated
// across cm6gpt-main.js, cm6gpt-bricks-api.js, cm6gpt-editors.js, cm6gpt-bridge-shared.js,
// and other IIFE modules. Each IIFE is self-contained and shares no scope, so duplication
// is required for the current build system. If we move to a bundled build (e.g. rollup/webpack),
// these should be extracted into a shared utility module.
(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][bridge-shared]', context, err); } catch (_) { /* noop */ }
  }

  var gateUx = (ns.BridgeGateUx = ns.BridgeGateUx || {});
  var analysisLens = (ns.BridgeAnalysisLens = ns.BridgeAnalysisLens || {});
  var statusUx = (ns.BridgeStatusUx = ns.BridgeStatusUx || {});
  var applyPolicy = (ns.BridgeApplyPolicy = ns.BridgeApplyPolicy || {});
  var bridgeFacade = (ns.BridgeFacadeUtils = ns.BridgeFacadeUtils || {});
  var manualRefresh = (ns.BridgeManualRefresh = ns.BridgeManualRefresh || {});
  var runtimeUtils = (ns.BridgeRuntimeUtils = ns.BridgeRuntimeUtils || {});
  var scopeContext = (ns.BridgeScopeContext = ns.BridgeScopeContext || {});
  var timing = (ns.BridgeTiming = ns.BridgeTiming || {});
  var canonicalReport = (ns.BridgeCanonicalReport = ns.BridgeCanonicalReport || {});
  canonicalReport.MODEL = 'canonical-snapshot-v2';
  canonicalReport.LANES = {
    html: true,
    css: true
  };
  canonicalReport.COMPARE_KEYS = {
    editorVsRendered: true,
    editorVsLive: true,
    renderedVsLive: true,
    contextAligned: true,
    layerAligned: true,
    lensAligned: true,
    viewAligned: true,
    filterAligned: true
  };
  canonicalReport.STATE_KEYS = {
    dirty: true,
    applying: true,
    layerMode: true,
    htmlLensMode: true,
    lastRenderedContextKey: true,
    lastRenderedLayerMode: true,
    lastRenderedHtmlLensMode: true,
    viewMode: true,
    propertyFilterKey: true,
    lastRenderedViewMode: true,
    lastRenderedPropertyFilterKey: true,
    transientState: true,
    hasContext: true,
    validContext: true,
    comparableContext: true,
    comparableSnapshotState: true
  };
  canonicalReport.STATE_VALUE_TYPES = {
    dirty: 'boolean',
    applying: 'boolean',
    layerMode: 'string',
    htmlLensMode: 'string',
    lastRenderedContextKey: 'string',
    lastRenderedLayerMode: 'string',
    lastRenderedHtmlLensMode: 'string',
    viewMode: 'string',
    propertyFilterKey: 'string',
    lastRenderedViewMode: 'string',
    lastRenderedPropertyFilterKey: 'string',
    transientState: 'boolean',
    hasContext: 'boolean',
    validContext: 'boolean',
    comparableContext: 'boolean',
    comparableSnapshotState: 'boolean'
  };
  canonicalReport.PROPERTY_FILTER_SEGMENTS = ['class', 'id', 'state', 'breakpoint'];
  canonicalReport.CONTEXT_KEY_PREFIXES = ['element:', 'parent:', 'children:'];
  canonicalReport.DRIFT_REASONS = {
    'pending-edit': true,
    'apply-in-progress': true,
    'no-context': true,
    'invalid-context': true,
    'render-context-stale': true,
    'render-layer-stale': true,
    'render-lens-stale': true,
    'render-view-stale': true,
    'render-filter-stale': true,
    'live-serialization-error': true,
    'editor-vs-live-mismatch': true,
    'rendered-vs-live-mismatch': true,
    'editor-vs-rendered-mismatch': true
  };
  canonicalReport.MISMATCH_KEYS = {
    liveSerializationError: true,
    editorVsLiveMismatch: true,
    renderedVsLiveMismatch: true,
    editorVsRenderedMismatch: true
  };

  /**
   * Shared utility: safe hasOwnProperty check.
   * @param {Object} obj
   * @param {string} key
   * @returns {boolean}
   */
  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /**
   * Shared utility: check if value is a non-null object (not array).
   * @param {*} v
   * @returns {boolean}
   */
  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  ns.hasOwn = hasOwn;
  ns.isObject = isObject;

  timing.debounce = function (fn, ms) {
    var waitMs = Math.max(0, Number(ms) || 0);
    var timerId = null;
    var wrapped = function () {
      clearTimeout(timerId);
      var args = arguments;
      timerId = setTimeout(function () {
        timerId = null;
        fn.apply(null, args);
      }, waitMs);
    };
    wrapped.cancel = function () {
      clearTimeout(timerId);
      timerId = null;
    };
    return wrapped;
  };

  canonicalReport.hashText = function (value) {
    var text = String(value == null ? '' : value);
    var hash = 5381;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash) + text.charCodeAt(i);
      hash = hash & 0xFFFFFFFF;
    }
    return String(hash >>> 0);
  };

  canonicalReport.isValidContext = function (ctx) {
    return !!(ctx && (ctx.mode === 'page' || ctx.mode === 'element'));
  };

  canonicalReport.resolveContextState = function (ctx, transientState, ctxKey) {
    var validContext = canonicalReport.isValidContext(ctx);
    if (validContext && ctxKey !== undefined) {
      var mode = canonicalReport.normalizeContextMode(ctx);
      validContext = !!canonicalReport.normalizeContextKey(ctxKey, mode);
    }
    var comparableContext = !!(ctx && validContext);
    return {
      hasContext: !!ctx,
      validContext: validContext,
      comparableContext: comparableContext,
      comparableSnapshotState: comparableContext && !transientState
    };
  };

  canonicalReport.buildLaneContextState = function (opts) {
    opts = opts || {};
    var transientState = hasOwn(opts, 'transientState')
      ? !!opts.transientState
      : !!(opts.dirty || opts.applying);
    var resolved = canonicalReport.resolveContextState(opts.ctx, transientState, opts.ctxKey);
    resolved.transientState = transientState;
    return resolved;
  };

  canonicalReport.compareOrNull = function (enabled, left, right) {
    if (!enabled) return null;
    return String(left == null ? '' : left) === String(right == null ? '' : right);
  };

  canonicalReport.buildComparisonMap = function (specs) {
    var comparisons = {};
    var list = Array.isArray(specs) ? specs : [];
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      if (!spec) continue;
      var key = canonicalReport.normalizeCompareKey(spec.key);
      if (!key) continue;
      comparisons[key] = canonicalReport.compareOrNull(spec.enabled, spec.left, spec.right);
    }
    return comparisons;
  };

  canonicalReport.normalizeAlignmentValue = function (key, value) {
    key = canonicalReport.normalizeCompareKey(key);
    if (key === 'contextAligned') return canonicalReport.normalizeStoredContextKey(value);
    return String(value == null ? '' : value);
  };

  canonicalReport.strictAlignmentFlag = function (key, comparableContext, lastValue, currentValue) {
    return !!comparableContext
      && canonicalReport.normalizeAlignmentValue(key, lastValue) === canonicalReport.normalizeAlignmentValue(key, currentValue);
  };

  canonicalReport.permissiveAlignmentFlag = function (key, comparableContext, lastValue, currentValue) {
    var normalizedLast = canonicalReport.normalizeAlignmentValue(key, lastValue);
    var normalizedCurrent = canonicalReport.normalizeAlignmentValue(key, currentValue);
    return !!comparableContext && (!normalizedLast || normalizedLast === normalizedCurrent);
  };

  canonicalReport.buildAlignmentMap = function (comparableContext, specs) {
    var alignments = {};
    var list = Array.isArray(specs) ? specs : [];
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      if (!spec) continue;
      var key = canonicalReport.normalizeCompareKey(spec.key);
      if (!key) continue;
      if (spec.strict) {
        alignments[key] = canonicalReport.strictAlignmentFlag(key, comparableContext, spec.lastValue, spec.currentValue);
      } else {
        alignments[key] = canonicalReport.permissiveAlignmentFlag(key, comparableContext, spec.lastValue, spec.currentValue);
      }
    }
    return alignments;
  };

  canonicalReport.mergeRecords = function () {
    var merged = {};
    for (var i = 0; i < arguments.length; i++) {
      var record = canonicalReport.normalizeRecord(arguments[i]);
      for (var key in record) {
        if (!hasOwn(record, key)) continue;
        merged[key] = record[key];
      }
    }
    return merged;
  };

  canonicalReport.buildAlignmentEntries = function (values, specs) {
    var entries = [];
    var list = Array.isArray(specs) ? specs : [];
    var normalized = canonicalReport.normalizeRecord(values);
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      if (!spec) continue;
      var key = canonicalReport.normalizeCompareKey(spec.key);
      var reason = canonicalReport.normalizeDriftReason(spec.reason);
      if (!key || !reason || !hasOwn(normalized, key)) continue;
      entries.push({
        ok: normalized[key],
        reason: reason
      });
    }
    return entries;
  };

  canonicalReport.buildMismatchEntries = function (values, specs) {
    var entries = [];
    var list = Array.isArray(specs) ? specs : [];
    var normalized = canonicalReport.normalizeRecord(values);
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      if (!spec) continue;
      var key = canonicalReport.normalizeMismatchKey(spec.key);
      var reason = canonicalReport.normalizeDriftReason(spec.reason);
      if (!key || !reason || !hasOwn(normalized, key)) continue;
      entries.push({
        when: normalized[key] === true,
        reason: reason
      });
    }
    return entries;
  };

  canonicalReport.buildFlagMap = function (specs) {
    var flags = {};
    var list = Array.isArray(specs) ? specs : [];
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      if (!spec) continue;
      var key = canonicalReport.normalizeMismatchKey(spec.key);
      if (!key) continue;
      flags[key] = !!spec.value;
    }
    return flags;
  };

  canonicalReport.buildStateMap = function (specs) {
    var state = {};
    var list = Array.isArray(specs) ? specs : [];
    for (var i = 0; i < list.length; i++) {
      var spec = list[i];
      if (!spec) continue;
      var key = canonicalReport.normalizeStateKey(spec.key);
      if (!key) continue;
      var value = spec.value;
      if (spec.type === 'boolean') {
        value = !!spec.value;
      } else if (spec.type === 'string' && value != null) {
        value = String(spec.value == null ? '' : spec.value);
      }
      value = canonicalReport.normalizeStateEntry(key, value);
      if (typeof value === 'undefined') continue;
      state[key] = value;
    }
    return state;
  };

  canonicalReport.normalizeStateMap = function (value) {
    var state = canonicalReport.normalizeRecord(value);
    var normalized = {};
    for (var key in state) {
      if (!hasOwn(state, key)) continue;
      key = canonicalReport.normalizeStateKey(key);
      if (!key) continue;
      var entry = canonicalReport.normalizeStateEntry(key, state[key]);
      if (typeof entry === 'undefined') continue;
      normalized[key] = entry;
    }
    return normalized;
  };

  canonicalReport.normalizeStateKey = function (value) {
    var key = String(value == null ? '' : value);
    return hasOwn(canonicalReport.STATE_KEYS, key) ? key : '';
  };

  canonicalReport.normalizeStateEntry = function (key, value) {
    key = canonicalReport.normalizeStateKey(key);
    if (!key) return undefined;
    if (value == null) return null;
    var expectedType = canonicalReport.STATE_VALUE_TYPES[key];
    if (expectedType === 'boolean') return !!value;
    if (expectedType === 'string') {
      if (key === 'layerMode' || key === 'lastRenderedLayerMode') {
        return scopeContext.normalizeLayerMode(value);
      }
      if (key === 'htmlLensMode' || key === 'lastRenderedHtmlLensMode') {
        return analysisLens.normalizeMode(value);
      }
      if (key === 'viewMode' || key === 'lastRenderedViewMode') {
        value = String(value || '').toLowerCase();
        if (value === 'computed' || value === 'authored' || value === 'canonical') return value;
        return 'canonical';
      }
      if (key === 'propertyFilterKey') {
        return canonicalReport.normalizePropertyFilterKey(value, { allowEmpty: false });
      }
      if (key === 'lastRenderedPropertyFilterKey') {
        return canonicalReport.normalizePropertyFilterKey(value, { allowEmpty: true });
      }
      if (key === 'lastRenderedContextKey') {
        return canonicalReport.normalizeStoredContextKey(value);
      }
      return String(value);
    }
    if (typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  };

  canonicalReport.normalizePropertyFilterKey = function (value, opts) {
    opts = opts || {};
    var allowEmpty = !!opts.allowEmpty;
    var filter = null;
    var normalized = [];
    var i;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      filter = {
        class: !!value.class,
        id: !!value.id,
        state: !!value.state,
        breakpoint: !!value.breakpoint
      };
    } else if (value != null) {
      var text = String(value).trim().toLowerCase();
      if (!text) return allowEmpty ? '' : 'class|||';
      if (text.indexOf('|') !== -1) {
        var parts = text.split('|');
        if (parts.length !== canonicalReport.PROPERTY_FILTER_SEGMENTS.length) {
          return allowEmpty ? '' : 'class|||';
        }
        filter = {};
        for (i = 0; i < canonicalReport.PROPERTY_FILTER_SEGMENTS.length; i++) {
          var segment = canonicalReport.PROPERTY_FILTER_SEGMENTS[i];
          var part = String(parts[i] || '').trim();
          if (part && part !== segment) {
            return allowEmpty ? '' : 'class|||';
          }
          filter[segment] = part === segment;
        }
      } else {
        filter = {
          class: text === 'class',
          id: text === 'id',
          state: text === 'state',
          breakpoint: text === 'breakpoint'
        };
        if (!filter.class && !filter.id && !filter.state && !filter.breakpoint) {
          return allowEmpty ? '' : 'class|||';
        }
      }
    }

    if (!filter) return allowEmpty ? '' : 'class|||';
    if (!filter.class && !filter.id && !filter.state && !filter.breakpoint) {
      if (allowEmpty) return '';
      filter.class = true;
    }
    for (i = 0; i < canonicalReport.PROPERTY_FILTER_SEGMENTS.length; i++) {
      var keyName = canonicalReport.PROPERTY_FILTER_SEGMENTS[i];
      normalized.push(filter[keyName] ? keyName : '');
    }
    return normalized.join('|');
  };

  canonicalReport.buildContextStateMap = function (value) {
    var contextState = canonicalReport.normalizeRecord(value);
    return {
      transientState: !!contextState.transientState,
      hasContext: !!contextState.hasContext,
      validContext: !!contextState.validContext,
      comparableContext: !!contextState.comparableContext,
      comparableSnapshotState: !!contextState.comparableSnapshotState
    };
  };

  canonicalReport.buildLaneStatePayload = function (opts) {
    opts = opts || {};
    var laneState = Array.isArray(opts.stateSpecs)
      ? canonicalReport.buildStateMap(opts.stateSpecs)
      : canonicalReport.normalizeStateMap(opts.state);
    if (!hasOwn(opts, 'contextState')) return laneState;
    return canonicalReport.mergeRecords(
      laneState,
      canonicalReport.buildContextStateMap(opts.contextState)
    );
  };

  canonicalReport.buildSnapshotPayload = function (opts) {
    opts = opts || {};
    var hashFn = typeof opts.hashFn === 'function' ? opts.hashFn : null;
    var payload = {
      editor: canonicalReport.buildSnapshot(opts.editorRaw, opts.editorNormalized, hashFn),
      rendered: canonicalReport.buildSnapshot(opts.renderedRaw, opts.renderedNormalized, hashFn)
    };
    if (hasOwn(opts, 'live')) {
      payload.live = canonicalReport.buildLiveSnapshot(opts.live);
    }
    return payload;
  };

  canonicalReport.buildLaneEvaluation = function (opts) {
    opts = opts || {};
    var contextState = canonicalReport.normalizeRecord(opts.contextState);
    var comparableSnapshotState = hasOwn(contextState, 'comparableSnapshotState')
      ? !!contextState.comparableSnapshotState
      : !!opts.comparableSnapshotState;
    var compareSpecs = Array.isArray(opts.compareSpecs)
      ? opts.compareSpecs.map(function (spec) {
          var normalizedSpec = canonicalReport.normalizeRecord(spec);
          var key = canonicalReport.normalizeCompareKey(normalizedSpec.key);
          if (!key) return normalizedSpec;
          normalizedSpec.key = key;
          normalizedSpec.enabled = comparableSnapshotState && !!normalizedSpec.enabled;
          return normalizedSpec;
        })
      : opts.compareSpecs;
    var mismatchValues = Array.isArray(opts.mismatchFlagSpecs)
      ? (comparableSnapshotState ? canonicalReport.buildFlagMap(opts.mismatchFlagSpecs) : {})
      : canonicalReport.normalizeRecord(opts.mismatchValues);
    return canonicalReport.buildDriftEvaluation({
      dirty: !!opts.dirty,
      applying: !!opts.applying,
      hasContext: hasOwn(contextState, 'hasContext') ? !!contextState.hasContext : !!opts.hasContext,
      validContext: hasOwn(contextState, 'validContext') ? !!contextState.validContext : !!opts.validContext,
      comparableContext: hasOwn(contextState, 'comparableContext') ? !!contextState.comparableContext : !!opts.comparableContext,
      compareSpecs: compareSpecs,
      alignmentSpecs: opts.alignmentSpecs,
      mismatchValues: mismatchValues,
      mismatchSpecs: opts.mismatchSpecs
    });
  };

  canonicalReport.buildDriftEvaluation = function (opts) {
    opts = opts || {};
    var compare = canonicalReport.mergeRecords(
      canonicalReport.buildComparisonMap(opts.compareSpecs),
      canonicalReport.buildAlignmentMap(!!opts.comparableContext, opts.alignmentSpecs)
    );
    var driftReason = canonicalReport.normalizeDriftReason(canonicalReport.resolveDriftReason({
      dirty: !!opts.dirty,
      applying: !!opts.applying,
      hasContext: !!opts.hasContext,
      validContext: !!opts.validContext,
      alignments: canonicalReport.buildAlignmentEntries(compare, opts.alignmentSpecs),
      mismatches: canonicalReport.buildMismatchEntries(opts.mismatchValues, opts.mismatchSpecs)
    }));
    return {
      compare: compare,
      driftReason: driftReason,
      driftDetected: !!driftReason
    };
  };

  canonicalReport.normalizeRecord = function (value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    var normalized = {};
    for (var key in value) {
      if (!hasOwn(value, key)) continue;
      normalized[key] = value[key];
    }
    return normalized;
  };

  canonicalReport.normalizeCompareMap = function (value) {
    var compare = canonicalReport.normalizeRecord(value);
    var normalized = {};
    for (var key in compare) {
      if (!hasOwn(compare, key)) continue;
      if (!hasOwn(canonicalReport.COMPARE_KEYS, key)) continue;
      normalized[key] = compare[key] == null ? null : !!compare[key];
    }
    return normalized;
  };

  canonicalReport.normalizeCompareKey = function (value) {
    var key = String(value == null ? '' : value);
    return hasOwn(canonicalReport.COMPARE_KEYS, key) ? key : '';
  };

  canonicalReport.normalizeLane = function (value) {
    var lane = String(value == null ? '' : value);
    return hasOwn(canonicalReport.LANES, lane) ? lane : '';
  };

  canonicalReport.normalizeModel = function (value) {
    var model = String(value == null ? '' : value);
    return model === canonicalReport.MODEL ? model : canonicalReport.MODEL;
  };

  canonicalReport.normalizeDriftReason = function (value) {
    var reason = String(value == null ? '' : value);
    return hasOwn(canonicalReport.DRIFT_REASONS, reason) ? reason : '';
  };

  canonicalReport.normalizeMismatchKey = function (value) {
    var key = String(value == null ? '' : value);
    return hasOwn(canonicalReport.MISMATCH_KEYS, key) ? key : '';
  };

  canonicalReport.normalizeChildrenContextKey = function (value) {
    if (value == null) return '';
    var text = String(value);
    if (text.indexOf('children:') !== 0) return '';
    var body = text.slice('children:'.length);
    if (!body || /\s/.test(body)) return '';
    var colonIndex = body.indexOf(':');
    if (colonIndex < 0) return 'children:' + body;
    var parentId = body.slice(0, colonIndex);
    var childPart = body.slice(colonIndex + 1);
    if (!parentId || /\s/.test(parentId)) return '';
    if (!childPart) return 'children:' + parentId;
    var childIds = childPart.split(',');
    var dedupedChildIds = [];
    var seenChildIds = {};
    for (var i = 0; i < childIds.length; i++) {
      if (!childIds[i]) continue;
      if (/\s/.test(childIds[i])) return '';
      if (seenChildIds[childIds[i]]) continue;
      seenChildIds[childIds[i]] = true;
      dedupedChildIds.push(childIds[i]);
    }
    return dedupedChildIds.length
      ? ('children:' + parentId + ':' + dedupedChildIds.join(','))
      : ('children:' + parentId);
  };

  canonicalReport.normalizeElementContextKey = function (value) {
    if (value == null) return '';
    var type = typeof value;
    if (type !== 'string' && type !== 'boolean' && !(type === 'number' && Number.isFinite(value))) {
      return '';
    }
    var key = String(value);
    if (key.indexOf('children:') === 0) return canonicalReport.normalizeChildrenContextKey(key);
    if (key.indexOf('parent:') === 0) {
      var parentId = key.slice('parent:'.length);
      return parentId && !/\s/.test(parentId) ? key : '';
    }
    if (key.indexOf('element:') === 0) {
      if (/\s/.test(key)) return '';
      var body = key.slice('element:'.length);
      if (!body) return '';
      var scopeSep = body.indexOf(':');
      if (scopeSep < 0) return 'element:' + body;
      var scope = body.slice(0, scopeSep);
      var elementId = body.slice(scopeSep + 1);
      if ((scope !== 'self' && scope !== 'parent' && scope !== 'children') || !elementId || elementId.indexOf(':') !== -1) return '';
      return 'element:' + scope + ':' + elementId;
    }
    return '';
  };

  canonicalReport.normalizeStoredContextKey = function (value) {
    if (typeof value !== 'string') return '';
    var key = String(value || '');
    if (!key) return '';
    if (key === 'page' || key === 'none') return key;
    var normalizedElementKey = canonicalReport.normalizeElementContextKey(key);
    if (normalizedElementKey) return normalizedElementKey;
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) return key;
    return '';
  };

  canonicalReport.normalizeDiagnosticContextKey = function (value) {
    if (typeof value !== 'string') return '';
    var key = String(value || '');
    if (!key) return '';
    if (key === 'page' || key === 'none') return '';
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(key) ? key : '';
  };

  canonicalReport.normalizeContextKey = function (value, mode) {
    var key = '';
    if (value != null) {
      var type = typeof value;
      if (type === 'string' || type === 'boolean') {
        key = String(value);
      } else if (type === 'number' && Number.isFinite(value)) {
        key = String(value);
      }
    }

    if (mode === 'page') return 'page';
    if (mode === 'none') return 'none';
    if (mode === 'element') return canonicalReport.normalizeElementContextKey(key);
    if (mode === 'invalid') return canonicalReport.normalizeDiagnosticContextKey(key);
    return canonicalReport.normalizeStoredContextKey(key);
  };

  canonicalReport.normalizeContextMode = function (ctx) {
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return 'none';
    if (ctx.mode === 'page' || ctx.mode === 'element') return String(ctx.mode);
    return 'invalid';
  };

  canonicalReport.normalizeContextScope = function (ctx, mode) {
    if (mode !== 'page' && mode !== 'element') return '';
    if (mode === 'page') return 'page';
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return 'self';
    return scopeContext.normalizeScopeMode(ctx.scope);
  };

  canonicalReport.buildContext = function (ctx, ctxKey) {
    var mode = canonicalReport.normalizeContextMode(ctx);
    return {
      key: canonicalReport.normalizeContextKey(ctxKey, mode),
      mode: mode,
      scope: canonicalReport.normalizeContextScope(ctx, mode)
    };
  };

  canonicalReport.normalizeSnapshot = function (value) {
    var snapshot = canonicalReport.normalizeRecord(value);
    return {
      rawLength: Math.max(0, Number(snapshot.rawLength) || 0),
      normalizedLength: Math.max(0, Number(snapshot.normalizedLength) || 0),
      hash: String(snapshot.hash || '')
    };
  };

  canonicalReport.buildSnapshot = function (raw, normalized, hashFn) {
    var rawText = String(raw == null ? '' : raw);
    var normalizedText = String(normalized == null ? '' : normalized);
    var hash = typeof hashFn === 'function'
      ? String(hashFn(normalizedText) || '')
      : canonicalReport.hashText(normalizedText);
    return {
      rawLength: rawText.length,
      normalizedLength: normalizedText.length,
      hash: hash
    };
  };

  canonicalReport.buildLiveSnapshot = function (opts) {
    opts = opts || {};
    var available = !!opts.available;
    var error = String(opts.error || '');
    if (!available) {
      return {
        available: false,
        error: error,
        rawLength: 0,
        normalizedLength: 0,
        hash: ''
      };
    }
    return {
      available: true,
      error: error,
      rawLength: String(opts.raw == null ? '' : opts.raw).length,
      normalizedLength: String(opts.normalized == null ? '' : opts.normalized).length,
      hash: canonicalReport.buildSnapshot('', opts.normalized, opts.hashFn).hash
    };
  };

  canonicalReport.normalizeLiveSnapshot = function (value) {
    var snapshot = canonicalReport.normalizeRecord(value);
    var available = !!snapshot.available;
    return {
      available: available,
      error: String(snapshot.error || ''),
      rawLength: available ? Math.max(0, Number(snapshot.rawLength) || 0) : 0,
      normalizedLength: available ? Math.max(0, Number(snapshot.normalizedLength) || 0) : 0,
      hash: available ? String(snapshot.hash || '') : ''
    };
  };

  canonicalReport.resolveDriftReason = function (opts) {
    opts = opts || {};
    if (opts.dirty) return 'pending-edit';
    if (opts.applying) return 'apply-in-progress';
    if (!opts.hasContext) return 'no-context';
    if (!opts.validContext) return 'invalid-context';

    var alignments = Array.isArray(opts.alignments) ? opts.alignments : [];
    for (var i = 0; i < alignments.length; i++) {
      var alignment = alignments[i];
      if (!alignment || alignment.ok !== false) continue;
      var reason = String(alignment.reason || '');
      if (reason) return reason;
    }

    var mismatches = Array.isArray(opts.mismatches) ? opts.mismatches : [];
    for (var j = 0; j < mismatches.length; j++) {
      var mismatch = mismatches[j];
      if (!mismatch || mismatch.when !== true) continue;
      var mismatchReason = String(mismatch.reason || '');
      if (mismatchReason) return mismatchReason;
    }

    return '';
  };

  canonicalReport.buildReport = function (opts) {
    opts = opts || {};
    var driftReason = canonicalReport.normalizeDriftReason(opts.driftReason);
    var driftDetected = !!opts.driftDetected || !!driftReason;
    var report = {
      lane: canonicalReport.normalizeLane(opts.lane),
      model: canonicalReport.normalizeModel(opts.model),
      context: canonicalReport.buildContext(opts.ctx || null, opts.ctxKey),
      state: canonicalReport.normalizeStateMap(opts.state),
      editor: canonicalReport.normalizeSnapshot(opts.editor || canonicalReport.buildSnapshot('', '', null)),
      rendered: canonicalReport.normalizeSnapshot(opts.rendered || canonicalReport.buildSnapshot('', '', null)),
      compare: canonicalReport.normalizeCompareMap(opts.compare),
      drift: {
        detected: driftDetected,
        reason: driftReason
      },
      ok: !driftDetected
    };
    if (hasOwn(opts, 'live')) report.live = canonicalReport.normalizeLiveSnapshot(opts.live);
    return report;
  };

  canonicalReport.buildLaneReport = function (opts) {
    opts = opts || {};
    var snapshots = canonicalReport.buildSnapshotPayload(opts.snapshots);
    var reportOpts = {
      lane: opts.lane,
      model: opts.model,
      ctx: opts.ctx,
      ctxKey: opts.ctxKey,
      state: canonicalReport.buildLaneStatePayload({
        stateSpecs: opts.stateSpecs,
        state: opts.state,
        contextState: opts.contextState
      }),
      editor: snapshots.editor,
      rendered: snapshots.rendered,
      compare: opts.compare,
      driftDetected: opts.driftDetected,
      driftReason: opts.driftReason
    };
    if (hasOwn(snapshots, 'live')) reportOpts.live = snapshots.live;
    return canonicalReport.buildReport(reportOpts);
  };

  canonicalReport.buildEvaluatedLaneReport = function (opts) {
    opts = opts || {};
    var evaluationInput = hasOwn(opts, 'evaluation') ? opts.evaluation : opts;
    var evaluation = canonicalReport.buildLaneEvaluation(evaluationInput);
    return canonicalReport.buildLaneReport({
      lane: opts.lane,
      model: opts.model,
      ctx: opts.ctx,
      ctxKey: opts.ctxKey,
      stateSpecs: opts.stateSpecs,
      state: opts.state,
      contextState: hasOwn(opts, 'contextState')
        ? opts.contextState
        : evaluationInput.contextState,
      snapshots: opts.snapshots,
      compare: evaluation.compare,
      driftDetected: evaluation.driftDetected,
      driftReason: evaluation.driftReason
    });
  };

  gateUx.normalizeGateLevel = function (level) {
    level = String(level || '').toLowerCase();
    if (level === 'blocked' || level === 'guarded') return level;
    return 'allow';
  };

  gateUx.normalizeGuardReasonText = function (reason) {
    var raw = String(reason || '').trim();
    if (!raw) return 'guarded context';
    var lower = raw.toLowerCase();
    if (lower.indexOf('slot context') !== -1 || (lower.indexOf('slot') !== -1 && lower.indexOf('context') !== -1)) {
      return 'slot context (guarded)';
    }
    if (lower.indexOf('component context') !== -1 || (lower.indexOf('component') !== -1 && lower.indexOf('context') !== -1)) {
      return 'component context (guarded)';
    }
    if (lower.indexOf('variant context') !== -1 || (lower.indexOf('variant') !== -1 && lower.indexOf('context') !== -1)) {
      return 'variant context (guarded)';
    }
    if (lower.indexOf('query loop') !== -1 || (lower.indexOf('query') !== -1 && lower.indexOf('loop') !== -1)) {
      if (lower.indexOf('key/text hints only') !== -1 || lower.indexOf('full-structure apply kept until confirmed') !== -1) {
        return 'query loop hint (allow)';
      }
      if (lower.indexOf('hints detected') !== -1) {
        return 'query loop hint (guarded)';
      }
      return 'query loop context (guarded)';
    }
    if (lower.indexOf('dynamic data hints detected') !== -1) {
      return 'dynamic data hint (guarded)';
    }
    if (lower.indexOf('dynamic data key/text hints only') !== -1) {
      return 'dynamic data hint (allow)';
    }
    if (lower.indexOf('dynamic data markers detected') !== -1 || lower.indexOf('dynamic data context') !== -1) {
      return 'dynamic data context (blocked)';
    }
    if (lower.indexOf('conditions metadata present') !== -1) {
      return 'conditions context (guarded)';
    }
    if (lower.indexOf('conditions key/text hints only') !== -1) {
      return 'conditions hint (allow)';
    }
    if (lower.indexOf('conditions hints detected') !== -1) {
      if (lower.indexOf('full-structure apply kept until confirmed') !== -1) {
        return 'conditions hint (allow)';
      }
      return 'conditions hint (guarded)';
    }
    if (lower.indexOf('wpml hints detected') !== -1) {
      return 'wpml hint (guarded)';
    }
    if (lower.indexOf('wpml key/text hints only') !== -1) {
      return 'wpml hint (allow)';
    }
    if (lower.indexOf('wpml-related markers detected') !== -1 || lower.indexOf('wpml context') !== -1) {
      return 'wpml context (blocked)';
    }
    if (lower.indexOf('schema key hints only') !== -1) {
      return 'schema hint (allow)';
    }
    if (lower.indexOf('schema markers detected') !== -1 || lower.indexOf('schema context') !== -1) {
      return 'schema context (blocked)';
    }
    if (lower.indexOf('attr-unsupported:') === 0) {
      return 'unsupported attribute: ' + raw.slice('attr-unsupported:'.length);
    }
    return raw.replace(/\s+/g, ' ');
  };

  gateUx.normalizeGateForUx = function (gate) {
    var level = gateUx.normalizeGateLevel(gate && gate.level);
    var allowSafeSubset = !(gate && gate.htmlApplySafeSubsetAllowed === false);
    var allowStructure = !(gate && gate.htmlApplyStructureAllowed === false);
    if (level === 'blocked') allowSafeSubset = false;
    if (level === 'blocked') allowStructure = false;
    var diagnostics = gate && gate.diagnostics && typeof gate.diagnostics === 'object'
      ? gate.diagnostics
      : null;
    var policyMode = diagnostics && diagnostics.mode
      ? String(diagnostics.mode)
      : (
        (!allowSafeSubset && !allowStructure)
          ? 'blocked'
          : (allowSafeSubset && !allowStructure ? 'safe-subset-only' : 'allow-all')
      );
    var inReasons = gate && Array.isArray(gate.reasons) ? gate.reasons : [];
    var reasons = [];
    for (var i = 0; i < inReasons.length; i++) {
      var normalized = gateUx.normalizeGuardReasonText(inReasons[i]);
      if (!normalized) continue;
      if (reasons.indexOf(normalized) === -1) reasons.push(normalized);
    }
    return {
      level: level,
      reasons: reasons,
      htmlApplySafeSubsetAllowed: allowSafeSubset,
      htmlApplyStructureAllowed: allowStructure,
      diagnostics: diagnostics,
      policyMode: policyMode
    };
  };

  analysisLens.normalizeMode = function (mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === 'minimal' || mode === 'edit' || mode === 'plain') return 'minimal';
    if (mode === 'component' || mode === 'slot' || mode === 'variant') return mode;
    if (mode === 'queryloop' || mode === 'query-loop' || mode === 'query') return 'queryLoop';
    if (mode === 'dynamicdata' || mode === 'dynamic') return 'dynamicData';
    if (mode === 'schema' || mode === 'conditions' || mode === 'wpml') return mode;
    return 'all';
  };

  analysisLens.modeLabel = function (mode, human) {
    mode = analysisLens.normalizeMode(mode);
    human = !!human;
    var map = {
      minimal: human ? 'Minimal' : 'minimal',
      all: human ? 'All' : 'all',
      component: human ? 'Component(+Slot/Variant)' : 'component',
      slot: human ? 'Slot' : 'slot',
      variant: human ? 'Variant' : 'variant',
      queryLoop: human ? 'Query Loop' : 'query-loop',
      dynamicData: human ? 'Dynamic Data' : 'dynamic',
      schema: human ? 'Schema' : 'schema',
      conditions: human ? 'Conditions' : 'conditions',
      wpml: human ? 'WPML' : 'wpml'
    };
    return map[mode] || (human ? 'All' : 'all');
  };

  analysisLens.readGroups = function (analysis, lensMode) {
    var signals = analysis && analysis.signals ? analysis.signals : {};
    lensMode = analysisLens.normalizeMode(lensMode);
    var groups = [];

    var csvValues = [];
    if (signals.component) csvValues.push('component');
    if (signals.slot) csvValues.push('slot');
    if (signals.variant) csvValues.push('variant');
    groups.push({
      key: 'componentFamily',
      label: 'component/slot/variant',
      values: csvValues,
      modes: { all: true, component: true, slot: true, variant: true }
    });

    groups.push({
      key: 'query',
      label: 'query',
      values: signals.queryLoop ? ['query-loop'] : [],
      modes: { all: true, queryLoop: true }
    });

    groups.push({
      key: 'dynamic',
      label: 'dynamic',
      values: signals.dynamicData ? ['dynamic'] : [],
      modes: { all: true, dynamicData: true }
    });

    groups.push({
      key: 'schema',
      label: 'schema',
      values: signals.schema ? ['schema'] : [],
      modes: { all: true, schema: true }
    });

    var condWpmlValues = [];
    if (signals.conditions) condWpmlValues.push('conditions');
    if (signals.wpml) condWpmlValues.push('wpml');
    groups.push({
      key: 'conditionsWpml',
      label: 'conditions/wpml',
      values: condWpmlValues,
      modes: { all: true, conditions: true, wpml: true }
    });

    return groups.filter(function (group) {
      return !!group.modes[lensMode];
    });
  };

  analysisLens.readSummary = function (analysis, opts) {
    opts = opts || {};
    var separator = String(opts.separator || ' · ');
    var groups = analysisLens.readGroups(analysis, opts.lensMode);
    if (!groups.length) return '';
    return groups.map(function (group) {
      var value = group.values && group.values.length ? group.values.join('+') : 'none';
      return group.label + '=' + value;
    }).join(separator);
  };

  analysisLens.hasMatch = function (analysis, lensMode) {
    var groups = analysisLens.readGroups(analysis, lensMode);
    for (var i = 0; i < groups.length; i++) {
      if (groups[i] && Array.isArray(groups[i].values) && groups[i].values.length) return true;
    }
    return false;
  };

  scopeContext.normalizeScopeMode = function (mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === 'children' || mode === 'parent' || mode === 'page') return mode;
    return 'self';
  };

  scopeContext.normalizeLayerMode = function (mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === 'l1' || mode === 'author') return 'l1';
    return 'l2';
  };

  scopeContext.layerModeLabel = function (target, mode, human) {
    mode = scopeContext.normalizeLayerMode(mode || (target && target.layerMode));
    human = !!human;
    if (mode === 'l1') return human ? 'L1 Author' : 'l1';
    return human ? 'L2 Structure+Attrs' : 'l2';
  };

  scopeContext.isAuthorLayer = function (target) {
    return scopeContext.normalizeLayerMode(target && target.layerMode) === 'l1';
  };

  scopeContext.getScopedContext = function (target) {
    var api = target && target.api ? target.api : null;
    if (api && typeof api.getScopedSelectionContext === 'function') {
      return api.getScopedSelectionContext(target && target.scopeMode);
    }
    var ctx = api && typeof api.getSelectionContext === 'function'
      ? api.getSelectionContext()
      : null;
    if (!ctx) return null;
    ctx.scope = scopeContext.normalizeScopeMode(target && target.scopeMode);
    if (!Array.isArray(ctx.elements)) {
      ctx.elements = ctx.element ? [ctx.element] : [];
    }
    return ctx;
  };

  runtimeUtils.createManagedTimeout = function (timerApi) {
    timerApi = timerApi || {};
    var setManagedTimeout = typeof timerApi.setTimeout === 'function' ? timerApi.setTimeout : setTimeout;
    var clearManagedTimeout = typeof timerApi.clearTimeout === 'function' ? timerApi.clearTimeout : clearTimeout;
    var activeId = 0;

    function clear() {
      if (!activeId) return false;
      clearManagedTimeout(activeId);
      activeId = 0;
      return true;
    }

    function schedule(callback, delay) {
      if (typeof callback !== 'function') return 0;
      clear();
      activeId = setManagedTimeout(function () {
        var fn = callback;
        activeId = 0;
        fn();
      }, delay);
      return activeId;
    }

    function pending() {
      return !!activeId;
    }

    return {
      schedule: schedule,
      clear: clear,
      pending: pending
    };
  };

  runtimeUtils.createManagedAnimationFrame = function (frameApi) {
    frameApi = frameApi || {};
    var requestManagedFrame = typeof frameApi.requestAnimationFrame === 'function'
      ? frameApi.requestAnimationFrame
      : function (callback) { return setTimeout(callback, 16); };
    var cancelManagedFrame = typeof frameApi.cancelAnimationFrame === 'function'
      ? frameApi.cancelAnimationFrame
      : clearTimeout;
    var activeId = 0;

    function clear() {
      if (!activeId) return false;
      cancelManagedFrame(activeId);
      activeId = 0;
      return true;
    }

    function schedule(callback) {
      if (typeof callback !== 'function') return activeId;
      if (activeId) return activeId;
      activeId = requestManagedFrame(function () {
        var fn = callback;
        activeId = 0;
        fn();
      });
      return activeId;
    }

    function pending() {
      return !!activeId;
    }

    return {
      schedule: schedule,
      clear: clear,
      pending: pending
    };
  };

  runtimeUtils.trackListener = function (cleanups, target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') {
      return function () { return false; };
    }

    target.addEventListener(type, handler, options);

    var active = true;
    var cleanup = function () {
      if (!active || !target || typeof target.removeEventListener !== 'function') return false;
      active = false;
      target.removeEventListener(type, handler, options);
      return true;
    };

    if (cleanups && typeof cleanups.push === 'function') cleanups.push(cleanup);
    return cleanup;
  };

  runtimeUtils.drainCleanupQueue = function (cleanups, onError) {
    var drained = 0;
    if (!cleanups || typeof cleanups.pop !== 'function') return drained;

    while (cleanups.length) {
      var cleanup = cleanups.pop();
      drained += 1;
      if (typeof cleanup !== 'function') continue;
      try {
        cleanup();
      } catch (err) {
        if (typeof onError === 'function') onError(err, cleanup);
      }
    }

    return drained;
  };

  runtimeUtils.removeDomNode = function (node, onError) {
    if (!node) return false;
    try {
      if (node.parentNode && typeof node.parentNode.removeChild === 'function') {
        node.parentNode.removeChild(node);
        return true;
      }
    } catch (err0) {
      if (typeof onError === 'function') onError('removeDomNode', err0);
    }
    try {
      if (typeof node.remove === 'function') {
        node.remove();
        return true;
      }
    } catch (err1) {
      if (typeof onError === 'function') onError('removeDomNode', err1);
    }
    return false;
  };

  runtimeUtils.copyTextWithFallback = function (text, opts) {
    opts = opts || {};
    var value = String(text == null ? '' : text);
    var nav = opts.navigator || null;
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var promptLabel = typeof opts.promptLabel === 'string' && opts.promptLabel
      ? opts.promptLabel
      : 'Copy text';
    var allowPrompt = opts.allowPrompt !== false;
    var warn = typeof opts.warn === 'function' ? opts.warn : function () {};

    function tryExecCommandCopy() {
      if (!doc || !doc.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') {
        return false;
      }

      var ta = null;
      var copied = false;
      try {
        ta = doc.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'readonly');
        ta.setAttribute('aria-hidden', 'true');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        doc.body.appendChild(ta);
        if (typeof ta.focus === 'function') ta.focus();
        if (typeof ta.select === 'function') ta.select();
        if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, value.length);
        copied = !!doc.execCommand('copy');
      } catch (err) {
        warn('copyTextWithFallback.execCommand', err);
        copied = false;
      } finally {
        try {
          if (ta && doc.body && typeof doc.body.removeChild === 'function') {
            doc.body.removeChild(ta);
          }
        } catch (cleanupErr) {
          warn('copyTextWithFallback.execCommand.cleanup', cleanupErr);
        }
      }
      return copied;
    }

    function tryPromptFallback() {
      if (!allowPrompt || !win || typeof win.prompt !== 'function') return false;
      try {
        win.prompt(promptLabel, value);
        return true;
      } catch (err) {
        warn('copyTextWithFallback.prompt', err);
        return false;
      }
    }

    function fallbackResult() {
      if (tryExecCommandCopy()) return { status: 'copied', method: 'execCommand' };
      if (tryPromptFallback()) return { status: 'prompt', method: 'prompt' };
      return { status: 'unavailable', method: 'none' };
    }

    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        var maybePromise = nav.clipboard.writeText(value);
        if (maybePromise && typeof maybePromise.then === 'function') {
          return maybePromise.then(
            function () {
              return { status: 'copied', method: 'clipboard' };
            },
            function (err) {
              warn('copyTextWithFallback.clipboard', err);
              return fallbackResult();
            }
          );
        }
        return Promise.resolve({ status: 'copied', method: 'clipboard' });
      } catch (err) {
        warn('copyTextWithFallback.clipboard', err);
        return Promise.resolve(fallbackResult());
      }
    }

    return Promise.resolve(fallbackResult());
  };

  runtimeUtils.focusDomNode = function (node, opts, onError) {
    opts = opts || {};
    if (!node || typeof node.focus !== 'function') return false;
    var context = typeof opts.context === 'string' && opts.context
      ? opts.context
      : 'focusDomNode';

    if (opts.preventScroll === true) {
      try {
        node.focus({ preventScroll: true });
        return true;
      } catch (preventScrollErr) {
        try {
          node.focus();
          return true;
        } catch (fallbackErr) {
          if (typeof onError === 'function') onError(context, fallbackErr);
          return false;
        }
      }
    }

    try {
      node.focus();
      return true;
    } catch (err) {
      if (typeof onError === 'function') onError(context, err);
      return false;
    }
  };

  runtimeUtils.blurActiveElementWithin = function (root, opts, onError) {
    opts = opts || {};
    var context = typeof opts.context === 'string' && opts.context
      ? opts.context
      : 'blurActiveElementWithin';
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var active = opts.activeElement || (doc ? doc.activeElement : null);
    if (!root || !active || typeof root.contains !== 'function' || !root.contains(active) || typeof active.blur !== 'function') {
      return false;
    }
    try {
      active.blur();
      return true;
    } catch (err) {
      if (typeof onError === 'function') onError(context, err);
      return false;
    }
  };

  runtimeUtils.removeValueFromArray = function (list, value) {
    if (!Array.isArray(list) || !list.length) return false;
    var idx = list.indexOf(value);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  };

  runtimeUtils.escapeCssAttrSelectorValue = function (text, onError) {
    var raw = String(text == null ? '' : text);
    if (!raw) return '';
    try {
      if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
        return CSS.escape(raw);
      }
    } catch (err) {
      if (typeof onError === 'function') onError('escapeCssAttrSelectorValue', err);
    }
    return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  };

  runtimeUtils.runApplyTransaction = function (target, lane, meta, runFn, rollbackFn) {
    lane = String(lane || '').trim().toLowerCase() === 'css' ? 'css' : 'html';
    var tx = {
      lane: lane,
      source: meta && meta.source ? String(meta.source) : 'manual',
      mode: meta && meta.mode ? String(meta.mode) : '',
      scope: meta && meta.scope ? String(meta.scope) : '',
      phase: 'init',
      phases: [],
      startedAt: target && typeof target._nowTs === 'function' ? target._nowTs() : statusUx.nowTs(),
      finishedAt: 0,
      durationMs: 0,
      ok: false,
      error: ''
    };
    tx.enter = function (phase) {
      var normalized = String(phase == null ? '' : phase).trim();
      if (!normalized) return;
      tx.phase = normalized;
      tx.phases.push(normalized);
    };

    try {
      if (typeof runFn !== 'function') throw new Error('transaction-runner-missing');
      var result = runFn(tx);
      tx.ok = true;
      tx.finishedAt = target && typeof target._nowTs === 'function' ? target._nowTs() : statusUx.nowTs();
      tx.durationMs = Math.max(0, Number(tx.finishedAt) - Number(tx.startedAt));
      if (target) target._lastApplyTransaction = tx;
      return { ok: true, result: result, tx: tx };
    } catch (err) {
      tx.ok = false;
      tx.error = err && err.message ? String(err.message) : String(err);
      if (tx.phase !== 'rollback') tx.enter('rollback');
      if (typeof rollbackFn === 'function') {
        try {
          rollbackFn(err, tx);
        } catch (rollbackErr) {
          tx.rollbackError = rollbackErr && rollbackErr.message
            ? String(rollbackErr.message)
            : String(rollbackErr);
        }
      }
      tx.finishedAt = target && typeof target._nowTs === 'function' ? target._nowTs() : statusUx.nowTs();
      tx.durationMs = Math.max(0, Number(tx.finishedAt) - Number(tx.startedAt));
      if (target) target._lastApplyTransaction = tx;
      return { ok: false, error: err, tx: tx };
    }
  };

  runtimeUtils.formatWriteSyncCapabilityBadge = function (target, report) {
    if (!report && target && typeof target.getWriteSyncCapabilityReport === 'function') {
      report = target.getWriteSyncCapabilityReport();
    }
    report = report || {};
    return 'ws9+: ' + Number(report.ready || 0) + '/' + Number(report.total || 0);
  };

  runtimeUtils.normalizeSnapshotText = function (value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  };

  manualRefresh.hasSupport = function (target) {
    var api = target && target.api ? target.api : null;
    if (!api) return false;
    if (typeof api.hasManualRefreshSupport === 'function') {
      try {
        var viaApiSupport = api.hasManualRefreshSupport();
        if (typeof viaApiSupport === 'boolean') return viaApiSupport;
      } catch (eApiSupport) { _warn('hasSupport', eApiSupport); }
    }
    if (typeof api.getManualRefreshOutcome === 'function') return true;
    return !!manualRefresh.getFn(target);
  };

  manualRefresh.getFn = function (target) {
    var api = target && target.api ? target.api : null;
    if (!api) return null;
    if (typeof api.getManualRefreshFn === 'function') {
      try {
        var viaApiFn = api.getManualRefreshFn();
        if (typeof viaApiFn === 'function') return viaApiFn;
      } catch (eApiFn) { _warn('getFn', eApiFn); }
    }
    if (typeof api.requestManualRefresh === 'function') return api.requestManualRefresh;
    if (typeof api._requestManualRefresh === 'function') return api._requestManualRefresh;
    if (typeof api.manualRefresh === 'function') return api.manualRefresh;
    return null;
  };

  manualRefresh.isFinalFailure = function (target, report) {
    if (target && target.api && typeof target.api.isManualRefreshFinalFailure === 'function') {
      try { return !!target.api.isManualRefreshFinalFailure(report); } catch (eApi) { _warn('isFinalFailure', eApi); }
    }
    if (!manualRefresh.isReportFailure(target, report)) return false;
    if (report && report.retry && report.retry.ok === true) return false;
    return true;
  };

  manualRefresh.errorMessages = function (errors) {
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

  manualRefresh.reportErrorMessages = function (target, reportLike) {
    if (!reportLike || typeof reportLike !== 'object') return [];
    var hasOwnLocal = Object.prototype.hasOwnProperty;
    var out = [];
    if (hasOwnLocal.call(reportLike, 'errors')) out = out.concat(manualRefresh.errorMessages(reportLike.errors));
    if (hasOwnLocal.call(reportLike, 'error')) out = out.concat(manualRefresh.errorMessages(reportLike.error));
    if (hasOwnLocal.call(reportLike, 'reason')) out = out.concat(manualRefresh.errorMessages(reportLike.reason));
    return out;
  };

  manualRefresh.shapeTag = function (value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  manualRefresh.normalizeThrowReason = function (errorLike, fallback) {
    fallback = String(fallback == null ? '' : fallback).trim();
    if (!fallback) fallback = 'manual-refresh-failed';
    var reason = '';
    if (errorLike && typeof errorLike === 'object' && Object.prototype.hasOwnProperty.call(errorLike, 'message')) {
      reason = String(errorLike.message == null ? '' : errorLike.message);
    }
    if (!reason) reason = String(errorLike == null ? '' : errorLike);
    reason = String(reason == null ? '' : reason).trim();
    if (!reason || reason === '[object Object]' || /^[A-Za-z]*Error$/.test(reason)) reason = fallback;
    return reason;
  };

  manualRefresh.isReportLike = function (value) {
    if (!value || typeof value !== 'object') return false;
    var owns = Object.prototype.hasOwnProperty;
    return owns.call(value, 'ok')
      || owns.call(value, 'errors')
      || owns.call(value, 'error')
      || owns.call(value, 'reason')
      || owns.call(value, 'retry');
  };

  manualRefresh.extractReportShape = function (value) {
    if (!value || typeof value !== 'object') return null;
    var owns = Object.prototype.hasOwnProperty;
    var out = {};
    var found = false;
    if (owns.call(value, 'ok')) {
      out.ok = value.ok;
      found = true;
    }
    if (owns.call(value, 'errors')) {
      out.errors = value.errors;
      found = true;
    }
    if (owns.call(value, 'error')) {
      out.error = value.error;
      found = true;
    }
    if (owns.call(value, 'reason')) {
      out.reason = value.reason;
      found = true;
    }
    if (owns.call(value, 'retry')) {
      out.retry = value.retry;
      found = true;
    }
    return found ? out : null;
  };

  manualRefresh.isReportFailure = function (target, reportLike) {
    if (!reportLike || typeof reportLike !== 'object') return false;
    if (reportLike.ok === true) return false;
    if (reportLike.ok === false) return true;
    return manualRefresh.reportErrorMessages(target, reportLike).length > 0;
  };

  manualRefresh.isHardFailure = function (target, report) {
    if (target && target.api && typeof target.api.isManualRefreshHardFailure === 'function') {
      try { return !!target.api.isManualRefreshHardFailure(report); } catch (eApi) { _warn('isHardFailure', eApi); }
    }

    function hasPrefix(reportLike, prefix) {
      if (!prefix) return false;
      var list = manualRefresh.reportErrorMessages(target, reportLike);
      for (var i = 0; i < list.length; i++) {
        var msg = String(list[i] == null ? '' : list[i]).trim();
        if (msg.indexOf(prefix) === 0) return true;
      }
      return false;
    }

    if (!report) return false;
    if (hasPrefix(report, 'manual-refresh:')) return true;
    if (report.retry && hasPrefix(report.retry, 'manual-refresh-retry:')) return true;
    return false;
  };

  manualRefresh.errorReason = function (target, report, fallback) {
    function firstHardFailureError(reportLike, onlyPrefix) {
      var list = manualRefresh.reportErrorMessages(target, reportLike);
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
      var list = manualRefresh.reportErrorMessages(target, reportLike);
      for (var i = 0; i < list.length; i++) {
        var msg = String(list[i] == null ? '' : list[i]).trim();
        if (msg) return msg;
      }
      return '';
    }

    if (target && target.api && typeof target.api.getManualRefreshErrorReason === 'function') {
      try {
        var apiReasonRaw = target.api.getManualRefreshErrorReason(report, fallback);
        var apiReason = String(apiReasonRaw == null ? '' : apiReasonRaw).trim();
        if (apiReason) return apiReason;
      } catch (eApi) { _warn('errorReason', eApi); }
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

  manualRefresh.formatDiagSuffix = function (target, outcome) {
    if (target && target.api && typeof target.api.formatManualRefreshDiagSuffix === 'function') {
      try { return String(target.api.formatManualRefreshDiagSuffix(outcome || {}) || ''); } catch (eApi) { _warn('formatDiagSuffix', eApi); }
    }
    if (!outcome) return '';
    if (outcome.finalFailed) {
      var kind = outcome.failureKind || (outcome.hardFailure ? 'hard' : 'report') || 'report';
      var reason = String(outcome.failureReason || manualRefresh.errorReason(target, outcome.report, 'manual-refresh-failed'));
      return ' · refresh final-fail (' + kind + '): ' + reason;
    }
    if (outcome.retryRecovered) {
      var retryReason = String(outcome.failureReason || manualRefresh.errorReason(target, outcome.report, 'manual-refresh-recovered'));
      return ' · refresh retry recovered: ' + retryReason;
    }
    return '';
  };

  manualRefresh.normalizeOutcome = function (target, outcome) {
    if (target && target.api && typeof target.api.normalizeManualRefreshOutcome === 'function') {
      try {
        var viaApiNormalize = target.api.normalizeManualRefreshOutcome(outcome);
        if (viaApiNormalize && typeof viaApiNormalize === 'object') outcome = viaApiNormalize;
      } catch (eApiNormalize) { _warn('normalizeOutcome', eApiNormalize); }
    }
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
    var owns = Object.prototype.hasOwnProperty;
    var looksLikeOutcome = owns.call(outcome, 'attempted')
      || owns.call(outcome, 'report')
      || owns.call(outcome, 'finalFailed')
      || owns.call(outcome, 'retryRecovered')
      || owns.call(outcome, 'hardFailure')
      || owns.call(outcome, 'failureKind')
      || owns.call(outcome, 'failureReason');
    var reportShape = manualRefresh.extractReportShape(outcome);
    var looksLikeReport = !!reportShape;
    if (!looksLikeOutcome && looksLikeReport) {
      outcome = {
        attempted: true,
        report: reportShape
      };
    } else if (looksLikeOutcome && reportShape && (!owns.call(outcome, 'report') || outcome.report == null)) {
      var mergedOutcome = {};
      for (var key in outcome) {
        if (owns.call(outcome, key)) mergedOutcome[key] = outcome[key];
      }
      mergedOutcome.report = reportShape;
      outcome = mergedOutcome;
    }
    if (owns.call(outcome, 'report') && outcome.report !== null) {
      var isReportObject = typeof outcome.report === 'object';
      var isReportLike = isReportObject && manualRefresh.isReportLike(outcome.report);
      if (!isReportLike) {
        var recoveredReportShape = reportShape;
        if (recoveredReportShape && manualRefresh.isReportLike(recoveredReportShape)) {
          var recoveredOutcome = {};
          for (var recoveredKey in outcome) {
            if (owns.call(outcome, recoveredKey)) recoveredOutcome[recoveredKey] = outcome[recoveredKey];
          }
          recoveredOutcome.report = recoveredReportShape;
          outcome = recoveredOutcome;
        } else {
          var invalidOutcomeReportShape = manualRefresh.shapeTag(outcome.report);
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
    if (report && typeof report === 'object' && owns.call(report, 'retry')) {
      var retryReport = report.retry;
      var retryIsObject = !!retryReport && typeof retryReport === 'object';
      var retryIsReportLike = retryIsObject && manualRefresh.isReportLike(retryReport);
      if (!retryIsReportLike) {
        var invalidRetryShape = manualRefresh.shapeTag(retryReport);
        var invalidRetryReason = 'manual-refresh-retry:invalid-report-shape:' + invalidRetryShape;
        var normalizedReport = {};
        for (var reportKey in report) {
          if (owns.call(report, reportKey)) normalizedReport[reportKey] = report[reportKey];
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
      var reportMessages = manualRefresh.reportErrorMessages(target, report);
      if (reportMessages.length > 0) {
        var failClosedReport = {};
        for (var failClosedKey in report) {
          if (owns.call(report, failClosedKey)) failClosedReport[failClosedKey] = report[failClosedKey];
        }
        failClosedReport.ok = false;
        report = failClosedReport;
      }
    }
    if (report && typeof report === 'object' && report.ok === true && report.retry && typeof report.retry === 'object') {
      var retryFailure = manualRefresh.isReportFailure(target, report.retry);
      if (retryFailure) {
        var retryFailClosedReport = {};
        for (var retryFailClosedKey in report) {
          if (owns.call(report, retryFailClosedKey)) retryFailClosedReport[retryFailClosedKey] = report[retryFailClosedKey];
        }
        retryFailClosedReport.ok = false;
        report = retryFailClosedReport;
      }
    }
    var attempted = !!outcome.attempted || !!report;
    var reportRetryRecovered = !!(report && report.retry && report.retry.ok === true && manualRefresh.isReportFailure(target, report));
    var retryRecovered = !!outcome.retryRecovered;
    if (!retryRecovered && reportRetryRecovered) {
      retryRecovered = true;
    }
    if (retryRecovered && report && !reportRetryRecovered) {
      retryRecovered = false;
    }
    var hasExplicitFinalFailed = typeof outcome.finalFailed === 'boolean';
    var reportFinalFailed = report ? manualRefresh.isFinalFailure(target, report) : false;
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
      var reportHardFailure = report ? manualRefresh.isHardFailure(target, report) : false;
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
      failureReason = manualRefresh.errorReason(target, report, finalFailed ? 'manual-refresh-failed' : 'manual-refresh-recovered');
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

  manualRefresh.isOutcomeOrReportLike = function (target, value) {
    if (!value || typeof value !== 'object') return false;
    var owns = Object.prototype.hasOwnProperty;
    return owns.call(value, 'attempted')
      || owns.call(value, 'report')
      || owns.call(value, 'finalFailed')
      || owns.call(value, 'retryRecovered')
      || owns.call(value, 'hardFailure')
      || owns.call(value, 'failureKind')
      || owns.call(value, 'failureReason')
      || manualRefresh.isReportLike(value);
  };

  manualRefresh.invalidOutcome = function (target, rawOutcome, prefix) {
    prefix = String(prefix == null ? '' : prefix).trim();
    if (!prefix) prefix = 'manual-refresh';
    var shape = manualRefresh.shapeTag(rawOutcome);
    var reason = prefix + ':invalid-outcome-shape:' + shape;
    return {
      attempted: true,
      report: { ok: false, errors: [reason] },
      finalFailed: true,
      retryRecovered: false,
      hardFailure: true,
      failureKind: 'hard',
      failureReason: reason
    };
  };

  manualRefresh.requestReport = function (target, payload) {
    if (target && target.api && typeof target.api.getManualRefreshOutcome === 'function') {
      try {
        var viaApi = target.api.getManualRefreshOutcome(payload || {});
        if (manualRefresh.isOutcomeOrReportLike(target, viaApi)) return manualRefresh.normalizeOutcome(target, viaApi);
        return manualRefresh.normalizeOutcome(target, manualRefresh.invalidOutcome(target, viaApi, 'manual-refresh'));
      } catch (eApiOutcome) {
        var apiReason = manualRefresh.normalizeThrowReason(eApiOutcome, 'manual-refresh-failed');
        return manualRefresh.normalizeOutcome(target, {
          attempted: true,
          report: { ok: false, errors: ['manual-refresh:' + apiReason] },
          finalFailed: true,
          retryRecovered: false,
          hardFailure: true,
          failureKind: 'hard',
          failureReason: apiReason
        });
      }
    }
    var fn = manualRefresh.getFn(target);
    if (!fn || !target || !target.api) {
      return manualRefresh.normalizeOutcome(target, {});
    }
    var report = null;
    try {
      report = fn.call(target.api, payload || {});
    } catch (eRefresh) {
      var reason = manualRefresh.normalizeThrowReason(eRefresh, 'manual-refresh-failed');
      return manualRefresh.normalizeOutcome(target, {
        attempted: true,
        report: { ok: false, errors: ['manual-refresh:' + reason] },
        finalFailed: true,
        retryRecovered: false,
        hardFailure: true,
        failureKind: 'hard',
        failureReason: reason
      });
    }
    if (!manualRefresh.isReportLike(report)) {
      var invalidReportType = manualRefresh.shapeTag(report);
      return manualRefresh.normalizeOutcome(target, {
        attempted: true,
        report: { ok: false, errors: ['manual-refresh:invalid-report-shape:' + invalidReportType] },
        finalFailed: true,
        retryRecovered: false,
        hardFailure: true,
        failureKind: 'hard',
        failureReason: 'manual-refresh:invalid-report-shape:' + invalidReportType
      });
    }
    return manualRefresh.normalizeOutcome(target, {
      attempted: true,
      report: report || null
    });
  };

  statusUx.nowTs = function () {
    return Date.now ? Date.now() : +new Date();
  };

  statusUx.normalizeStatusChannel = function (channel) {
    if (channel == null) return 'default';
    var normalized = String(channel).trim();
    return normalized || 'default';
  };

  statusUx.setPanelStatus = function (target, text, opts) {
    if (!target || !target.panel || typeof target.panel.setStatus !== 'function') return false;
    opts = opts || {};
    var channel = statusUx.normalizeStatusChannel(opts.channel);
    var policyDedupeMs = Number(target.statusPolicy && target.statusPolicy.dedupeMs);
    if (!isFinite(policyDedupeMs) || policyDedupeMs < 0) policyDedupeMs = 0;
    var dedupeMs = Object.prototype.hasOwnProperty.call(opts, 'dedupeMs') ? Number(opts.dedupeMs) : policyDedupeMs;
    if (!isFinite(dedupeMs)) dedupeMs = policyDedupeMs;
    if (dedupeMs < 0) dedupeMs = 0;
    var nowTs = target && typeof target._nowTs === 'function' ? target._nowTs() : statusUx.nowTs();
    var normalized = String(text == null ? '' : text);
    target._statusCache = target._statusCache || {};
    var last = target._statusCache[channel] || { text: '', ts: 0 };
    if (last.text === normalized && (nowTs - Number(last.ts || 0)) < dedupeMs) return false;
    target.panel.setStatus(normalized);
    target._statusCache[channel] = { text: normalized, ts: nowTs };
    return true;
  };

  statusUx.setAutoStatus = function (target, text) {
    return statusUx.setPanelStatus(target, text, {
      channel: 'auto',
      dedupeMs: Number(target && target.statusPolicy && target.statusPolicy.autoThrottleMs)
    });
  };

  statusUx.formatApplyTaxonomyStatus = function (kind, code, opts) {
    opts = opts || {};
    kind = String(kind || '').trim().toUpperCase() === 'CSS' ? 'CSS' : 'HTML';
    code = String(code == null ? '' : code).trim().toLowerCase();
    if (!code) code = 'apply-ok';
    var isAuto = !!opts.auto;
    var reason = String(opts.reason == null ? '' : opts.reason).trim();
    var manualBase = {
      'apply-ok': kind + ' Apply OK',
      'apply-blocked': kind + ' Apply blocked',
      'verify-failed': kind + ' Apply verify failed',
      'rollback-complete': kind + ' Apply aborted · rollback complete'
    };
    var autoBase = {
      'apply-ok': kind + ' Live Sync OK',
      'apply-blocked': kind + ' Live Sync blocked',
      'verify-failed': kind + ' Live Sync verify failed',
      'rollback-complete': kind + ' Live Sync waiting · rollback complete'
    };
    var map = isAuto ? autoBase : manualBase;
    var text = map[code] || (isAuto ? (kind + ' Live Sync') : (kind + ' Apply'));
    if (reason) text += ' · ' + reason;
    text += ' · code:' + code;
    return text;
  };

  statusUx.emitApplyTaxonomyStatus = function (target, kind, code, opts) {
    var text = statusUx.formatApplyTaxonomyStatus(kind, code, opts || {});
    if (opts && opts.auto) statusUx.setAutoStatus(target, text);
    else statusUx.setPanelStatus(target, text, { channel: 'apply' });
    return text;
  };

  bridgeFacade.installStatusApplyFacade = function (proto, opts) {
    if (!proto || (typeof proto !== 'object' && typeof proto !== 'function')) return false;

    opts = opts || {};
    var kind = String(opts.kind || '').trim().toUpperCase() === 'CSS' ? 'CSS' : 'HTML';
    var lane = String(opts.lane || '').trim().toLowerCase() === 'css' ? 'css' : 'html';
    var getStatusUx = typeof opts.getStatusUx === 'function'
      ? opts.getStatusUx
      : function () { return statusUx; };
    var getApplyPolicy = typeof opts.getApplyPolicy === 'function'
      ? opts.getApplyPolicy
      : function () { return applyPolicy; };
    var getRuntimeUtils = typeof opts.getRuntimeUtils === 'function'
      ? opts.getRuntimeUtils
      : function () { return runtimeUtils; };

    proto._nowTs = function () {
      return getStatusUx().nowTs();
    };

    proto._normalizeStatusChannel = function (channel) {
      return getStatusUx().normalizeStatusChannel(channel);
    };

    proto._setPanelStatus = function (text, innerOpts) {
      return getStatusUx().setPanelStatus(this, text, innerOpts);
    };

    proto._setAutoStatus = function (text) {
      return getStatusUx().setAutoStatus(this, text);
    };

    proto._formatApplyTaxonomyStatus = function (code, innerOpts) {
      return getStatusUx().formatApplyTaxonomyStatus(kind, code, innerOpts);
    };

    proto._emitApplyTaxonomyStatus = function (code, innerOpts) {
      return getStatusUx().emitApplyTaxonomyStatus(this, kind, code, innerOpts);
    };

    proto._knownApplyOperationContexts = function () {
      return getApplyPolicy().knownContexts();
    };

    proto._resolveApplyOperationPolicy = function (gate) {
      return getApplyPolicy().resolve(gate);
    };

    proto._formatApplyOperationBlockedReason = function (policy) {
      return getApplyPolicy().formatBlockedReason(policy);
    };

    proto._runApplyTransaction = function (meta, runFn, rollbackFn) {
      return getRuntimeUtils().runApplyTransaction(this, lane, meta, runFn, rollbackFn);
    };

    return true;
  };

  applyPolicy.knownContexts = function () {
    return {
      component: true,
      slot: true,
      variant: true,
      queryLoop: true,
      conditions: true,
      wpml: true,
      dynamicData: true
    };
  };

  applyPolicy.resolve = function (gate) {
    var normalizedGate = gateUx.normalizeGateForUx(gate || {});
    var knownContexts = applyPolicy.knownContexts();
    var contextPolicy = {};
    var unknownContexts = [];
    var contexts = normalizedGate && normalizedGate.diagnostics && Array.isArray(normalizedGate.diagnostics.contexts)
      ? normalizedGate.diagnostics.contexts
      : [];
    for (var i = 0; i < contexts.length; i++) {
      var item = contexts[i] || {};
      var key = String(item.key || '').trim();
      if (!key) continue;
      var allowSafe = !(item.htmlApplySafeSubsetAllowed === false);
      var allowStructure = !(item.htmlApplyStructureAllowed === false);
      if (!Object.prototype.hasOwnProperty.call(knownContexts, key)) {
        if (unknownContexts.indexOf(key) === -1) unknownContexts.push(key);
        contextPolicy[key] = {
          known: false,
          htmlApplySafeSubsetAllowed: false,
          htmlApplyStructureAllowed: false,
          mode: 'blocked-unknown'
        };
        continue;
      }
      contextPolicy[key] = {
        known: true,
        htmlApplySafeSubsetAllowed: allowSafe,
        htmlApplyStructureAllowed: allowStructure,
        mode: (!allowSafe && !allowStructure)
          ? 'blocked'
          : (allowSafe && !allowStructure ? 'safe-subset-only' : 'allow-all')
      };
    }

    var level = gateUx.normalizeGateLevel(normalizedGate && normalizedGate.level);
    var allowSafeSubset = !!(normalizedGate && normalizedGate.htmlApplySafeSubsetAllowed !== false);
    var allowStructure = !!(normalizedGate && normalizedGate.htmlApplyStructureAllowed !== false);
    if (unknownContexts.length) {
      level = 'blocked';
      allowSafeSubset = false;
      allowStructure = false;
    } else if (level === 'blocked') {
      allowSafeSubset = false;
      allowStructure = false;
    }

    return {
      level: level,
      htmlApplySafeSubsetAllowed: allowSafeSubset,
      htmlApplyStructureAllowed: allowStructure,
      unknownContexts: unknownContexts,
      contextPolicy: contextPolicy,
      gate: normalizedGate
    };
  };

  applyPolicy.formatBlockedReason = function (policy) {
    policy = policy || {};
    var reasons = [];
    if (Array.isArray(policy.unknownContexts) && policy.unknownContexts.length) {
      reasons.push('unknown-context=' + policy.unknownContexts.join(','));
    }
    var gate = policy.gate || {};
    if (gate.reasons && gate.reasons.length) {
      reasons.push(String(gate.reasons[0] || '').trim());
    }
    if (!reasons.length) reasons.push('operation-policy blocked');
    return reasons.join(' · ');
  };
})(window);
