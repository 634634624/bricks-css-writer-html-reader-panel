(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});
  var config = w.CM6GPT_Lite_Config || w.CM6GPT_Config || {};

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][main]', context, err); } catch (_) { /* noop */ }
  }

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[CM6GPT]');
    try { console.log.apply(console, args); } catch (e) { _warn('log', e); }
  }

  function configBool(value, defaultValue) {
    if (typeof value === 'boolean') return value;
    if (value == null) return !!defaultValue;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      var v = value.trim().toLowerCase();
      if (v === '') return false; // WP localize_script often serializes PHP false as ""
      if (v === '0' || v === 'false' || v === 'off' || v === 'no' || v === 'null') return false;
      if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
    }
    return !!value;
  }

  function getCompatibilityReportFromConfig() {
    var report = config && config.environmentReport && typeof config.environmentReport === 'object'
      ? config.environmentReport
      : null;
    return report || null;
  }

  function formatCompatibilityStatus(report) {
    report = report || {};
    var status = String(report.status || 'ok');
    var issues = Array.isArray(report.issues) ? report.issues : [];
    var summary = String(report.summary || '').trim();
    if (summary) {
      if (status === 'error') return 'Compatibility alert · ' + summary;
      if (status === 'warning') return 'Compatibility warning · ' + summary;
      return 'Compatibility ready · ' + summary;
    }
    if (issues.length && issues[0] && issues[0].message) {
      if (status === 'error') return 'Compatibility alert · ' + String(issues[0].message);
      if (status === 'warning') return 'Compatibility warning · ' + String(issues[0].message);
    }
    return status === 'error'
      ? 'Compatibility alert · investigate current environment'
      : 'Compatibility warning · investigate current environment';
  }

  function logCompatibilityReport(report, source) {
    report = report || {};
    var status = String(report.status || 'ok');
    if (status === 'ok') return report;
    try {
      console.warn('[CM6GPT][compat][' + String(source || 'runtime') + ']', report);
    } catch (e) { _warn('logCompatibilityReport', e); }
    return report;
  }

  function formatBuilderCompatibilityStatus(report) {
    report = report || {};
    var status = String(report.status || 'ok');
    var summary = String(report.summary || '').trim();
    if (summary) {
      if (status === 'error') return 'Builder compatibility alert · ' + summary;
      if (status === 'warning') return 'Builder compatibility warning · ' + summary;
      if (status === 'pending') return 'Builder compatibility pending · ' + summary;
      return 'Builder compatibility ready · ' + summary;
    }
    if (status === 'error') return 'Builder compatibility alert · investigate current builder runtime';
    if (status === 'warning') return 'Builder compatibility warning · investigate current builder runtime';
    if (status === 'pending') return 'Builder compatibility pending · builder runtime not attached yet';
    return 'Builder compatibility ready';
  }

  function logBuilderCompatibilityReport(report, source) {
    report = report || {};
    var status = String(report.status || 'ok');
    if (status === 'ok' || status === 'pending') return report;
    try {
      console.warn('[CM6GPT][builder-compat][' + String(source || 'runtime') + ']', report);
    } catch (e) { _warn('logBuilderCompatibilityReport', e); }
    return report;
  }

  function getCompanionDiagnosticsState() {
    var state = ns.__liteCompanionDiagnosticsState;
    if (!state || typeof state !== 'object') {
      state = { coreFramework: null };
      ns.__liteCompanionDiagnosticsState = state;
      return state;
    }
    if (!Object.prototype.hasOwnProperty.call(state, 'coreFramework')) state.coreFramework = null;
    return state;
  }

  function detectCoreFrameworkConsoleDiagnostic(args) {
    var parts = [];
    if (!Array.isArray(args) || !args.length) return null;
    args.forEach(function (value) {
      if (value == null) return;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value));
        return;
      }
      if (value && typeof value.message === 'string') {
        parts.push(String(value.message));
        return;
      }
      try {
        var json = JSON.stringify(value);
        if (json) parts.push(String(json));
      } catch (_) { /* noop */ }
    });
    var joined = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!joined) return null;
    if (joined.indexOf('[Core Framework]') === -1) return null;
    if (joined.indexOf('Failed to load variables') === -1) return null;
    return {
      status: 'warning',
      companion: 'core-framework',
      code: 'core-framework-variables-load-failed',
      message: 'Core Framework variables failed to load. Lite variable autocomplete may be stale until Core Framework rebuild succeeds.',
      actionHint: 'Save changes in Core Framework and retry the builder session.',
      upstreamMessage: joined,
      source: 'console.log',
      detectedAt: new Date().toISOString()
    };
  }

  function formatCompanionDiagnosticsStatus(entry) {
    entry = entry || {};
    var status = String(entry.status || 'warning');
    var summary = String(entry.message || '').trim();
    if (summary) {
      if (status === 'error') return 'Companion alert · ' + summary;
      return 'Companion warning · ' + summary;
    }
    return status === 'error'
      ? 'Companion alert · investigate companion runtime'
      : 'Companion warning · investigate companion runtime';
  }

  function logCompanionDiagnosticsEntry(entry, source) {
    entry = entry || {};
    var status = String(entry.status || 'warning');
    if (status === 'ok') return entry;
    if (String(source || 'runtime') === 'console-hook' && String(entry.upstreamMessage || '').trim()) return entry;
    try {
      console.warn('[CM6GPT][companion][' + String(source || 'runtime') + ']', entry);
    } catch (e) { _warn('logCompanionDiagnosticsEntry', e); }
    return entry;
  }

  function installCoreFrameworkConsoleDiagnosticsHook() {
    var state = getCompanionDiagnosticsState();
    if (!w.console || typeof w.console.log !== 'function') return false;
    if (ns.__cm6gptCoreFrameworkDiagnosticsHookInstalled) return true;
    var originalLog = w.console.log;
    try {
      w.console.log = function () {
        var args = Array.prototype.slice.call(arguments);
        try {
          var entry = detectCoreFrameworkConsoleDiagnostic(args);
          var previous = state && state.coreFramework && typeof state.coreFramework === 'object'
            ? state.coreFramework
            : null;
          var nextSignature = entry ? String(entry.code || '') + '|' + String(entry.upstreamMessage || entry.message || '') : '';
          var previousSignature = previous ? String(previous.code || '') + '|' + String(previous.upstreamMessage || previous.message || '') : '';
          if (entry && nextSignature && nextSignature !== previousSignature) {
            state.coreFramework = entry;
            if (typeof ns.__cm6gptCompanionDiagnosticsNotify === 'function') {
              try { ns.__cm6gptCompanionDiagnosticsNotify(entry, 'console-hook'); } catch (notifyErr) { _warn('coreFrameworkConsoleDiagnosticsNotify', notifyErr); }
            }
          }
        } catch (hookErr) { _warn('installCoreFrameworkConsoleDiagnosticsHook', hookErr); }
        return originalLog.apply(this, args);
      };
      ns.__cm6gptCoreFrameworkDiagnosticsHookInstalled = true;
      ns.__cm6gptCoreFrameworkDiagnosticsOriginalLog = originalLog;
      return true;
    } catch (assignErr) {
      _warn('installCoreFrameworkConsoleDiagnosticsHook', assignErr);
      return false;
    }
  }

  installCoreFrameworkConsoleDiagnosticsHook();

  function isPanelModifierTypingKey(eventLike) {
    if (!eventLike) return false;
    var rawKey = String(eventLike.key || '');
    if (rawKey === 'Dead' || rawKey === 'Process') return true;
    if (eventLike.metaKey) return false;
    var hasAltGraph = false;
    try {
      hasAltGraph = !!(typeof eventLike.getModifierState === 'function' && eventLike.getModifierState('AltGraph'));
    } catch (e) { _warn('isPanelModifierTypingKey', e); 
      hasAltGraph = false;
    }
    if (hasAltGraph) return true;
    return !!(eventLike.altKey && rawKey.length === 1);
  }

  function installPanelInputShield(panelRoot) {
    if (!panelRoot || panelRoot.__cm6gptInputShieldInstalled) return;
    panelRoot.__cm6gptInputShieldInstalled = true;
    var teardowns = [];

    function isInsidePanel(node) {
      try { return !!(node && panelRoot.contains && panelRoot.contains(node)); } catch (e) { _warn('isInsidePanel', e);  return false; }
    }

    function shouldShield(e) {
      if (!e) return false;
      var panelHidden = !!(panelRoot && panelRoot.classList && panelRoot.classList.contains('cm6gpt-hidden'));
      if (panelHidden) return false;
      var target = e.target || document.activeElement;
      var panelActive = isInsidePanel(target) || isInsidePanel(document.activeElement);
      if (!panelActive) return false;

      var type = String(e.type || '').toLowerCase();
      if (type !== 'keydown' && type !== 'paste') return false;
      if (type === 'paste') return true;

      // Let regular typing/input events through (autocomplete relies on them).
      // Shield only modifier-driven shortcuts while focus stays inside panel.
      var key = String(e.key || '').toLowerCase();

      // Keep AltGr/Option text input (e.g. "@" on HU/EU layouts) untouched.
      // Without this, modifier shielding can swallow actual character typing.
      if (isPanelModifierTypingKey(e)) return false;

      if ((e.ctrlKey || e.metaKey) && (key === ' ' || key === 'spacebar')) return false;
      if (e.ctrlKey || e.metaKey || e.altKey) return true;
      if (key === 'escape') return true;
      return false;
    }

    function shield(e) {
      if (!shouldShield(e)) return;
      try { e.stopImmediatePropagation(); } catch (err) {
        try { e.stopPropagation(); } catch (err2) { _warn('shield', err2); }
      }
    }

    // Capture on window/document to beat builder-level shortcut handlers,
    // but keep regular typing/input flow untouched for CM6 autocomplete.
    ['keydown', 'paste'].forEach(function (type) {
      try { trackListener(teardowns, window, type, shield, true); } catch (e) { _warn('shield', e); }
      try { trackListener(teardowns, document, type, shield, true); } catch (e2) { _warn('shield', e2); }
    });

    function cleanupInputShield() {
      drainCleanupQueue(teardowns, function (e0) { _warn('shield', e0); });
      if (panelRoot.__cm6gptInputShieldCleanup === cleanupInputShield) {
        panelRoot.__cm6gptInputShieldCleanup = null;
      }
      panelRoot.__cm6gptInputShieldInstalled = false;
    }

    panelRoot.__cm6gptInputShieldCleanup = cleanupInputShield;
  }

  function installPanelEditorActivityHandoff(panelLike, setActiveEditorKey) {
    if (!panelLike || !panelLike.root || typeof setActiveEditorKey !== 'function') return false;
    var root = panelLike.root;

    if (typeof root.__cm6gptEditorActivityCleanup === 'function') {
      try { root.__cm6gptEditorActivityCleanup(); } catch (e0) { _warn('installPanelEditorActivityHandoff', e0); }
    }

    var teardowns = [];
    function bind(target, key) {
      if (!target || typeof target.addEventListener !== 'function') return;

      function activate() {
        try { setActiveEditorKey(key); } catch (eAct) { _warn('installPanelEditorActivityHandoff', eAct); }
      }

      try { trackListener(teardowns, target, 'focusin', activate); } catch (e1) { _warn('installPanelEditorActivityHandoff', e1); }
      try { trackListener(teardowns, target, 'mousedown', activate); } catch (e2) { _warn('installPanelEditorActivityHandoff', e2); }
    }

    bind(panelLike.htmlMount, 'html');
    bind(panelLike.cssMount, 'css');

    function cleanupEditorActivityHandoff() {
      drainCleanupQueue(teardowns, function (e3) { _warn('cleanupEditorActivityHandoff', e3); });
      if (root.__cm6gptEditorActivityCleanup === cleanupEditorActivityHandoff) {
        root.__cm6gptEditorActivityCleanup = null;
      }
      root.__cm6gptEditorActivityInstalled = false;
    }

    root.__cm6gptEditorActivityInstalled = true;
    root.__cm6gptEditorActivityCleanup = cleanupEditorActivityHandoff;
    return true;
  }

  function wrapShadowParityApplyHook(bridge, lane, runProbeDeferred) {
    if (!bridge || typeof bridge.applyFromEditor !== 'function') {
      return { ok: false, reason: 'bridge-unavailable' };
    }

    var currentApply = bridge.applyFromEditor;
    if (currentApply && currentApply.__cm6gptShadowParityWrapped) {
      return {
        ok: true,
        wrapped: false,
        reason: 'already-wrapped',
        lane: String(currentApply.__cm6gptShadowParityLane || lane || 'mixed')
      };
    }

    var normalizedLane = String(lane || 'mixed');
    function wrappedApply(options) {
      var opts = options || {};
      var ok = currentApply.apply(this, arguments);
      if (ok && typeof runProbeDeferred === 'function') {
        runProbeDeferred({
          trigger: 'post-apply',
          lane: normalizedLane,
          source: opts.source ? String(opts.source) : 'manual'
        });
      }
      return ok;
    }

    wrappedApply.__cm6gptShadowParityWrapped = true;
    wrappedApply.__cm6gptShadowParityLane = normalizedLane;
    wrappedApply.__cm6gptShadowParityOriginal = currentApply;
    bridge.applyFromEditor = wrappedApply;

    return {
      ok: true,
      wrapped: true,
      lane: normalizedLane
    };
  }

  function installPanelRuntimeCleanup(panelLike, runtimeHandle) {
    if (!panelLike || !panelLike.root) return null;
    var root = panelLike.root;

    if (typeof root.__cm6gptMainRuntimeCleanup === 'function') {
      try { root.__cm6gptMainRuntimeCleanup(); } catch (e0) { _warn('installPanelRuntimeCleanup', e0); }
    }

    runtimeHandle = runtimeHandle || {};

    function destroyRuntimePart(label, target) {
      if (!target || typeof target.destroy !== 'function') return false;
      try {
        target.destroy();
        return true;
      } catch (e1) {
        _warn(label, e1);
        return false;
      }
    }

    function cleanupMainRuntime() {
      if (cleanupMainRuntime.__done) return false;
      cleanupMainRuntime.__done = true;

      if (runtimeHandle.bootstrapKickTimeout && typeof runtimeHandle.bootstrapKickTimeout.clear === 'function') {
        try { runtimeHandle.bootstrapKickTimeout.clear(); } catch (e2) { _warn('cleanupMainRuntime', e2); }
      }
      if (runtimeHandle.shadowParityProbeTimeout && typeof runtimeHandle.shadowParityProbeTimeout.clear === 'function') {
        try { runtimeHandle.shadowParityProbeTimeout.clear(); } catch (e3) { _warn('cleanupMainRuntime', e3); }
      }

      destroyRuntimePart('cleanupMainRuntime:htmlBridge', runtimeHandle.htmlBridge);
      destroyRuntimePart('cleanupMainRuntime:cssBridge', runtimeHandle.cssBridge);
      destroyRuntimePart('cleanupMainRuntime:api', runtimeHandle.api);
      destroyRuntimePart('cleanupMainRuntime:htmlEditor', runtimeHandle.htmlEditor);
      destroyRuntimePart('cleanupMainRuntime:cssEditor', runtimeHandle.cssEditor);

      if (root.__cm6gptMainRuntimeCleanup === cleanupMainRuntime) {
        root.__cm6gptMainRuntimeCleanup = null;
      }
      root.__cm6gptMainRuntimeInstalled = false;

      var exposedGlobal = runtimeHandle.exposedGlobal || runtimeHandle;
      if (exposedGlobal && w.__CM6GPT === exposedGlobal) {
        w.__CM6GPT = null;
      }

      return true;
    }

    root.__cm6gptMainRuntimeInstalled = true;
    root.__cm6gptMainRuntimeCleanup = cleanupMainRuntime;
    return cleanupMainRuntime;
  }

  function normalizeEditorFirstMode(value, fallbackMode) {
    var fallback = String(fallbackMode == null ? '' : fallbackMode).trim().toLowerCase();
    if (fallback === 'optin' || fallback === 'opt_in') fallback = 'opt-in';
    if (fallback === 'teamdefault' || fallback === 'team_default') fallback = 'team-default';
    if (fallback === 'editorfirst' || fallback === 'full-editor' || fallback === 'primary' || fallback === 'full') fallback = 'editor-first';
    if (fallback !== 'opt-in' && fallback !== 'team-default' && fallback !== 'editor-first') fallback = 'team-default';

    var mode = String(value == null ? '' : value).trim().toLowerCase();
    if (mode === '') return fallback;
    if (mode === 'optin' || mode === 'opt_in') mode = 'opt-in';
    if (mode === 'teamdefault' || mode === 'team_default') mode = 'team-default';
    if (mode === 'editorfirst' || mode === 'full-editor' || mode === 'primary' || mode === 'full') mode = 'editor-first';
    if (mode !== 'opt-in' && mode !== 'team-default' && mode !== 'editor-first') return fallback;
    return mode;
  }

  function parseEditorFirstOptInValue(value) {
    if (typeof value === 'boolean') return value;
    if (value == null) return null;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    var raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes' || raw === 'opt-in') return true;
    if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no' || raw === 'opt-out') return false;
    return null;
  }

  function resolveEditorFirstLaunchGate(opts) {
    opts = opts || {};
    var mode = normalizeEditorFirstMode(opts.mode, opts.fallbackMode || 'team-default');
    var killSwitch = configBool(opts.killSwitch, false);
    var userOptIn = parseEditorFirstOptInValue(opts.userOptIn);
    var shouldOpenPanel = true;
    var reason = 'team-default-default-open';

    if (killSwitch) {
      shouldOpenPanel = false;
      reason = 'kill-switch-active';
    } else if (mode === 'opt-in') {
      shouldOpenPanel = userOptIn === true;
      reason = shouldOpenPanel ? 'opt-in-user-enabled' : 'opt-in-pending';
    } else if (mode === 'team-default') {
      if (userOptIn === false) {
        shouldOpenPanel = false;
        reason = 'team-default-user-opted-out';
      } else if (userOptIn === true) {
        shouldOpenPanel = true;
        reason = 'team-default-user-opted-in';
      } else {
        shouldOpenPanel = true;
        reason = 'team-default-default-open';
      }
    } else {
      shouldOpenPanel = true;
      reason = 'editor-first-default-open';
    }

    var status = '';
    if (!shouldOpenPanel) {
      if (reason === 'kill-switch-active') {
        status = 'Editor-first launch gate · disabled by kill-switch';
      } else if (reason === 'opt-in-pending') {
        status = 'Editor-first launch gate · opt-in required (use launcher or __CM6GPT.setEditorFirstOptIn(true))';
      } else if (reason === 'team-default-user-opted-out') {
        status = 'Editor-first launch gate · user opt-out active (use __CM6GPT.setEditorFirstOptIn(true))';
      } else {
        status = 'Editor-first launch gate · panel hidden';
      }
    }

    return {
      mode: mode,
      killSwitch: killSwitch,
      userOptIn: userOptIn,
      shouldOpenPanel: shouldOpenPanel,
      reason: reason,
      status: status
    };
  }

  function performManualRefreshWithFallback(opts) {
    opts = opts || {};
    var api = opts.api || null;
    var panel = opts.panel || null;
    var htmlBridge = opts.htmlBridge || null;
    var cssBridge = opts.cssBridge || null;
    var refreshPayload = opts.refreshPayload;
    var statusOnSuccess = String(opts.statusOnSuccess || '');
    var statusOnFallback = String(opts.statusOnFallback || '');
    var shouldRefreshEditors = opts.refreshEditors !== false;
    var onManualRefreshError = typeof opts.onManualRefreshError === 'function' ? opts.onManualRefreshError : null;
    var onHtmlRefreshError = typeof opts.onHtmlRefreshError === 'function' ? opts.onHtmlRefreshError : null;
    var onCssRefreshError = typeof opts.onCssRefreshError === 'function' ? opts.onCssRefreshError : null;
    var onRefreshEditorsError = typeof opts.onRefreshEditorsError === 'function' ? opts.onRefreshEditorsError : null;

    function callHook(hook, err) {
      if (!hook) return;
      try { hook(err || null); } catch (eHook) { _warn('callHook', eHook); }
    }

    function collectErrorMessages(errors) {
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
    }

    function collectReportMessages(reportLike) {
      if (!reportLike || typeof reportLike !== 'object') return [];
      var hasOwnLocal = Object.prototype.hasOwnProperty;
      var out = [];
      if (hasOwnLocal.call(reportLike, 'errors')) out = out.concat(collectErrorMessages(reportLike.errors));
      if (hasOwnLocal.call(reportLike, 'error')) out = out.concat(collectErrorMessages(reportLike.error));
      if (hasOwnLocal.call(reportLike, 'reason')) out = out.concat(collectErrorMessages(reportLike.reason));
      return out;
    }

    function isReportFailure(reportLike) {
      if (!reportLike || typeof reportLike !== 'object') return false;
      if (reportLike.ok === true) return false;
      if (reportLike.ok === false) return true;
      return collectReportMessages(reportLike).length > 0;
    }

    function hasErrorPrefix(reportOrErrors, prefix) {
      if (!prefix) return false;
      var looksLikeReport = !!(
        reportOrErrors &&
        typeof reportOrErrors === 'object' &&
        (
          Object.prototype.hasOwnProperty.call(reportOrErrors, 'errors') ||
          Object.prototype.hasOwnProperty.call(reportOrErrors, 'error') ||
          Object.prototype.hasOwnProperty.call(reportOrErrors, 'reason')
        )
      );
      var list = looksLikeReport ? collectReportMessages(reportOrErrors) : collectErrorMessages(reportOrErrors);
      for (var i = 0; i < list.length; i++) {
        var msg = String(list[i] == null ? '' : list[i]).trim();
        if (msg.indexOf(prefix) === 0) return true;
      }
      return false;
    }

    function extractRefreshReason(report, fallback) {
      function firstHardFailureError(reportLike, onlyPrefix) {
        var list = collectReportMessages(reportLike);
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
        var list = collectReportMessages(reportLike);
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
    }

    function isHardRefreshFailure(report) {
      if (!report) return false;
      if (hasErrorPrefix(report, 'manual-refresh:')) return true;
      if (report.retry && hasErrorPrefix(report.retry, 'manual-refresh-retry:')) return true;
      return false;
    }

    function isFinalRefreshFailure(apiRef, report) {
      if (apiRef && typeof apiRef.isManualRefreshFinalFailure === 'function') {
        try { return !!apiRef.isManualRefreshFinalFailure(report); } catch (eApiFinal) { _warn('isFinalRefreshFailure', eApiFinal); }
      }
      if (!isReportFailure(report)) return false;
      if (report && report.retry && report.retry.ok === true) return false;
      return true;
    }

    function resolveHardRefreshFailure(apiRef, report) {
      if (apiRef && typeof apiRef.isManualRefreshHardFailure === 'function') {
        try { return !!apiRef.isManualRefreshHardFailure(report); } catch (eApiHard) { _warn('resolveHardRefreshFailure', eApiHard); }
      }
      return isHardRefreshFailure(report);
    }

    function resolveRefreshReason(apiRef, report, fallback) {
      if (apiRef && typeof apiRef.getManualRefreshErrorReason === 'function') {
        try {
          var rawApiReason = apiRef.getManualRefreshErrorReason(report, fallback);
          var apiReason = String(rawApiReason == null ? '' : rawApiReason).trim();
          if (apiReason) return apiReason;
        } catch (eApiReason) { _warn('resolveRefreshReason', eApiReason); }
      }
      return extractRefreshReason(report, fallback);
    }

    function manualRefreshShapeTag(value) {
      if (value === null) return 'null';
      if (Array.isArray(value)) return 'array';
      return typeof value;
    }

    function normalizeThrownRefreshReason(errorLike, fallback) {
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
    }

    function isRefreshReportLike(value) {
      if (!value || typeof value !== 'object') return false;
      var owns = Object.prototype.hasOwnProperty;
      return owns.call(value, 'ok')
        || owns.call(value, 'errors')
        || owns.call(value, 'error')
        || owns.call(value, 'reason')
        || owns.call(value, 'retry');
    }

    function extractRefreshReportShape(value) {
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
    }

    function normalizeManualRefreshOutcome(apiRef, outcome) {
      if (apiRef && typeof apiRef.normalizeManualRefreshOutcome === 'function') {
        try {
          var viaApiNormalize = apiRef.normalizeManualRefreshOutcome(outcome);
          if (viaApiNormalize && typeof viaApiNormalize === 'object') outcome = viaApiNormalize;
        } catch (eApiNormalize) { _warn('normalizeManualRefreshOutcome', eApiNormalize); }
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
      var reportShape = extractRefreshReportShape(outcome);
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
        var isReportLike = isReportObject && isRefreshReportLike(outcome.report);
        if (!isReportLike) {
          var recoveredReportShape = reportShape;
          if (recoveredReportShape && isRefreshReportLike(recoveredReportShape)) {
            var recoveredOutcome = {};
            for (var recoveredKey in outcome) {
              if (owns.call(outcome, recoveredKey)) recoveredOutcome[recoveredKey] = outcome[recoveredKey];
            }
            recoveredOutcome.report = recoveredReportShape;
            outcome = recoveredOutcome;
          } else {
            var invalidOutcomeReportShape = manualRefreshShapeTag(outcome.report);
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
        var retryIsReportLike = retryIsObject && isRefreshReportLike(retryReport);
        if (!retryIsReportLike) {
          var invalidRetryShape = manualRefreshShapeTag(retryReport);
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
        var reportMessages = collectReportMessages(report);
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
        var retryFailure = isReportFailure(report.retry);
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
      var reportRetryRecovered = !!(report && report.retry && report.retry.ok === true && isReportFailure(report));
      var retryRecovered = !!outcome.retryRecovered;
      if (!retryRecovered && reportRetryRecovered) {
        retryRecovered = true;
      }
      if (retryRecovered && report && !reportRetryRecovered) {
        retryRecovered = false;
      }
      var hasExplicitFinalFailed = typeof outcome.finalFailed === 'boolean';
      var reportFinalFailed = report ? isFinalRefreshFailure(apiRef, report) : false;
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
        var reportHardFailure = report ? resolveHardRefreshFailure(apiRef, report) : false;
        if (report) {
          hardFailure = reportHardFailure;
        } else {
          hardFailure = typeof outcome.hardFailure === 'boolean'
            ? outcome.hardFailure
            : reportHardFailure;
        }
      }
      var failureReasonText = String(outcome.failureReason == null ? '' : outcome.failureReason).trim();
      if ((finalFailed || retryRecovered) && !failureReasonText) {
        failureReasonText = resolveRefreshReason(apiRef, report, finalFailed ? 'manual-refresh-failed' : 'manual-refresh-recovered');
      } else if (!finalFailed && !retryRecovered) {
        failureReasonText = '';
      }
      var failureKindText = String(outcome.failureKind == null ? '' : outcome.failureKind).trim();
      if (failureKindText && failureKindText !== 'hard' && failureKindText !== 'report') {
        failureKindText = '';
      }
      if (finalFailed) {
        var expectedKind = hardFailure ? 'hard' : 'report';
        if (failureKindText !== expectedKind) {
          failureKindText = expectedKind;
        }
      } else {
        failureKindText = '';
      }

      normalized.attempted = attempted;
      normalized.report = report;
      normalized.finalFailed = finalFailed;
      normalized.retryRecovered = retryRecovered;
      normalized.hardFailure = hardFailure;
      normalized.failureKind = failureKindText;
      normalized.failureReason = failureReasonText;
      return normalized;
    }

    function formatRefreshDiagSuffix(meta) {
      if (!meta) return '';
      if (meta.finalFailed) {
        var kind = meta.failureKind || (meta.hardFailure ? 'hard' : 'report') || 'report';
        var reason = String(meta.failureReason || 'manual-refresh-failed');
        return ' · refresh final-fail (' + kind + '): ' + reason;
      }
      if (meta.retryRecovered) {
        var retryReason = String(meta.failureReason || 'manual-refresh-recovered');
        return ' · refresh retry recovered: ' + retryReason;
      }
      return '';
    }

    function toInvalidManualRefreshReport(rawReport, prefix) {
      prefix = String(prefix == null ? '' : prefix).trim();
      if (!prefix) prefix = 'manual-refresh';
      var shape = manualRefreshShapeTag(rawReport);
      return {
        ok: false,
        errors: [prefix + ':invalid-report-shape:' + shape]
      };
    }

    function isManualRefreshOutcomeOrReportLike(value) {
      if (!value || typeof value !== 'object') return false;
      var owns = Object.prototype.hasOwnProperty;
      return owns.call(value, 'attempted')
        || owns.call(value, 'report')
        || owns.call(value, 'finalFailed')
        || owns.call(value, 'retryRecovered')
        || owns.call(value, 'hardFailure')
        || owns.call(value, 'failureKind')
        || owns.call(value, 'failureReason')
        || isRefreshReportLike(value);
    }

    function toInvalidManualRefreshOutcome(rawOutcome, prefix) {
      prefix = String(prefix == null ? '' : prefix).trim();
      if (!prefix) prefix = 'manual-refresh';
      var shape = manualRefreshShapeTag(rawOutcome);
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
    }

    function resolveManualRefreshOutcome(apiRef, payload) {
      var emptyOutcome = {
        attempted: false,
        report: null,
        finalFailed: false,
        retryRecovered: false,
        hardFailure: false,
        failureKind: '',
        failureReason: ''
      };
      if (!apiRef) return emptyOutcome;
      if (typeof apiRef.getManualRefreshOutcome === 'function') {
        try {
          var viaApi = apiRef.getManualRefreshOutcome(payload || {});
          if (isManualRefreshOutcomeOrReportLike(viaApi)) return normalizeManualRefreshOutcome(apiRef, viaApi);
          return normalizeManualRefreshOutcome(apiRef, toInvalidManualRefreshOutcome(viaApi, 'manual-refresh'));
        } catch (eApiOutcome) {
          var apiReason = normalizeThrownRefreshReason(eApiOutcome, 'manual-refresh-failed');
          return normalizeManualRefreshOutcome(apiRef, {
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

      var manualRefreshFn = null;
      if (typeof apiRef.getManualRefreshFn === 'function') {
        try { manualRefreshFn = apiRef.getManualRefreshFn(); } catch (eGetFn) { _warn('resolveManualRefreshOutcome', eGetFn); }
      }
      if (!manualRefreshFn) {
        if (typeof apiRef.requestManualRefresh === 'function') {
          manualRefreshFn = apiRef.requestManualRefresh;
        } else if (typeof apiRef._requestManualRefresh === 'function') {
          manualRefreshFn = apiRef._requestManualRefresh;
        } else if (typeof apiRef.manualRefresh === 'function') {
          manualRefreshFn = apiRef.manualRefresh;
        }
      }
      if (!manualRefreshFn) return emptyOutcome;

      try {
        var report = manualRefreshFn.call(apiRef, payload);
        if (!isRefreshReportLike(report)) {
          report = toInvalidManualRefreshReport(report, 'manual-refresh');
        }
        return normalizeManualRefreshOutcome(apiRef, {
          attempted: true,
          report: report || null
        });
      } catch (eRefresh) {
        var reason = normalizeThrownRefreshReason(eRefresh, 'manual-refresh-failed');
        return normalizeManualRefreshOutcome(apiRef, {
          attempted: true,
          report: { ok: false, errors: ['manual-refresh:' + reason] },
          finalFailed: true,
          retryRecovered: false,
          hardFailure: true,
          failureKind: 'hard',
          failureReason: reason
        });
      }
    }

    var manualRefreshAttempted = false;
    var refreshError = null;
    var refreshReport = null;
    var reportFailed = false;
    var retryRecovered = false;
    var hardFailure = false;
    var failureKind = '';
    var failureReason = '';
    var refreshOutcome = resolveManualRefreshOutcome(api, refreshPayload);
    manualRefreshAttempted = !!refreshOutcome.attempted;
    refreshReport = refreshOutcome.report || null;
    reportFailed = !!refreshOutcome.finalFailed;
    retryRecovered = !!refreshOutcome.retryRecovered;
    hardFailure = !!refreshOutcome.hardFailure;
    failureKind = String(refreshOutcome.failureKind == null ? '' : refreshOutcome.failureKind).trim();
    if (failureKind && failureKind !== 'hard' && failureKind !== 'report') {
      failureKind = '';
    }
    if (reportFailed) {
      var expectedRefreshKind = hardFailure ? 'hard' : 'report';
      if (failureKind !== expectedRefreshKind) {
        failureKind = expectedRefreshKind;
      }
    } else {
      failureKind = '';
    }
    failureReason = String(refreshOutcome.failureReason || '');
    if (reportFailed) {
      refreshError = new Error(failureReason || 'manual-refresh-failed');
      callHook(onManualRefreshError, refreshError);
    }

    if (refreshError) {
      if (htmlBridge && typeof htmlBridge.refresh === 'function') {
        try { htmlBridge.refresh(); } catch (eHtml) { _warn('resolveManualRefreshOutcome', eHtml);  callHook(onHtmlRefreshError, eHtml); }
      }
      if (cssBridge && typeof cssBridge.refresh === 'function') {
        try { cssBridge.refresh({ force: true }); } catch (eCss) { _warn('resolveManualRefreshOutcome', eCss);  callHook(onCssRefreshError, eCss); }
      }
    }

    if (shouldRefreshEditors && panel && typeof panel.refreshEditors === 'function') {
      try { panel.refreshEditors(); } catch (eEditors) { _warn('resolveManualRefreshOutcome', eEditors);  callHook(onRefreshEditorsError, eEditors); }
    }

    if (panel) {
      var refreshDiagMeta = {
        finalFailed: !!refreshError,
        retryRecovered: retryRecovered,
        hardFailure: hardFailure,
        failureKind: failureKind,
        failureReason: failureReason,
        report: refreshReport || null
      };
      var refreshDiagSuffix = '';
      if (api && typeof api.formatManualRefreshDiagSuffix === 'function') {
        try { refreshDiagSuffix = String(api.formatManualRefreshDiagSuffix(refreshDiagMeta) || ''); } catch (eDiag) { _warn('resolveManualRefreshOutcome', eDiag); }
      }
      if (!refreshDiagSuffix) refreshDiagSuffix = formatRefreshDiagSuffix(refreshDiagMeta);
      if (refreshError && statusOnFallback) {
        setPanelStatus(panel, statusOnFallback + refreshDiagSuffix, { channel: 'refresh', dedupeMs: 0 });
      } else if (!refreshError && statusOnSuccess) {
        setPanelStatus(panel, statusOnSuccess + refreshDiagSuffix, { channel: 'refresh', dedupeMs: 0 });
      }
    }

    return {
      ok: !refreshError,
      fallbackApplied: !!refreshError,
      manualRefreshAttempted: manualRefreshAttempted,
      reportFailed: reportFailed,
      retryRecovered: retryRecovered,
      hardFailure: hardFailure,
      failureKind: failureKind,
      failureReason: failureReason,
      report: refreshReport || null,
      error: refreshError && refreshError.message ? String(refreshError.message) : (refreshError ? String(refreshError) : '')
    };
  }

  ns.mainInternals = ns.mainInternals || {};
  ns.mainInternals.isPanelModifierTypingKey = isPanelModifierTypingKey;
  ns.mainInternals.installPanelInputShield = installPanelInputShield;
  ns.mainInternals.installPanelEditorActivityHandoff = installPanelEditorActivityHandoff;
  ns.mainInternals.normalizeEditorFirstMode = normalizeEditorFirstMode;
  ns.mainInternals.parseEditorFirstOptInValue = parseEditorFirstOptInValue;
  ns.mainInternals.resolveEditorFirstLaunchGate = resolveEditorFirstLaunchGate;
  ns.mainInternals.performManualRefreshWithFallback = performManualRefreshWithFallback;
  ns.mainInternals.wrapShadowParityApplyHook = wrapShadowParityApplyHook;
  ns.mainInternals.installPanelRuntimeCleanup = installPanelRuntimeCleanup;

  function getBridgeRuntimeUtils() {
    if (
      !ns.BridgeRuntimeUtils
      || typeof ns.BridgeRuntimeUtils.createManagedTimeout !== 'function'
      || typeof ns.BridgeRuntimeUtils.focusDomNode !== 'function'
      || typeof ns.BridgeRuntimeUtils.blurActiveElementWithin !== 'function'
      || typeof ns.BridgeRuntimeUtils.trackListener !== 'function'
      || typeof ns.BridgeRuntimeUtils.drainCleanupQueue !== 'function'
      || typeof ns.BridgeRuntimeUtils.escapeCssAttrSelectorValue !== 'function'
    ) {
      throw new Error('CM6GPT.BridgeRuntimeUtils lifecycle helpers missing');
    }
    return ns.BridgeRuntimeUtils;
  }

  function getBridgeStatusUx() {
    if (!ns.BridgeStatusUx || typeof ns.BridgeStatusUx.setPanelStatus !== 'function') {
      throw new Error('CM6GPT.BridgeStatusUx helper missing');
    }
    return ns.BridgeStatusUx;
  }

  var mainStatusTarget = {
    panel: null,
    statusPolicy: {
      dedupeMs: 0
    },
    _statusCache: {}
  };

  function escapeCssAttrSelectorValue(text) {
    return getBridgeRuntimeUtils().escapeCssAttrSelectorValue(text, _warn);
  }

  function createManagedTimeout(timerApi) {
    return getBridgeRuntimeUtils().createManagedTimeout(timerApi);
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

  function trackListener(cleanups, target, type, handler, options) {
    return getBridgeRuntimeUtils().trackListener(cleanups, target, type, handler, options);
  }

  function drainCleanupQueue(cleanups, onError) {
    return getBridgeRuntimeUtils().drainCleanupQueue(cleanups, onError);
  }

  function setPanelStatus(panelRef, text, opts) {
    mainStatusTarget.panel = panelRef || null;
    return getBridgeStatusUx().setPanelStatus(mainStatusTarget, text, opts || {});
  }

  ns.mainInternals.createManagedTimeout = createManagedTimeout;

  function waitForBricksReady(maxAttempts, cb, opts) {
    opts = opts || {};
    var attempts = 0;
    var delay = 100; // start at 100ms, grows exponentially
    var finished = false;
    var pollTimeout = createManagedTimeout(opts.timerApi);

    function stop() {
      if (finished) return false;
      finished = true;
      pollTimeout.clear();
      return true;
    }

    function finishReady() {
      if (!stop()) return false;
      if (typeof cb === 'function') cb();
      return true;
    }

    function poll() {
      if (finished) return;
      attempts++;
      var iframe = document.querySelector('#bricks-preview iframe') || document.getElementById('bricks-builder-iframe');
      var doc = iframe && (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document));
      // Bricks toolbar IDs are not stable across builder variants, but the sync layer
      // only requires the live preview iframe/document to be ready.
      if (iframe && doc && doc.body) {
        finishReady();
        return;
      }
      if (attempts >= maxAttempts) {
        stop();
        log('Bricks builder not ready after', attempts, 'attempts');
        return;
      }
      delay = Math.min(delay * 1.5, 2000); // cap at 2s
      pollTimeout.schedule(poll, delay);
    }
    pollTimeout.schedule(poll, delay);
    return {
      cancel: stop,
      pending: pollTimeout.pending,
      getAttempts: function () { return attempts; },
      isDone: function () { return finished; }
    };
  }

  ns.mainInternals.waitForBricksReady = waitForBricksReady;

  var _bootstrapModuleRetryTimeout = createManagedTimeout();
  var _bootstrapRetried = false;
  function bootstrap() {
    if (!ns.panel || !ns.editors || !ns.BricksAPI || !ns.HTMLBridge || !ns.CSSBridge) {
      if (!_bootstrapRetried) {
        _bootstrapRetried = true;
        log('Missing modules, scheduling one retry in 500ms');
        _bootstrapModuleRetryTimeout.schedule(bootstrap, 500);
        return;
      }
      _bootstrapModuleRetryTimeout.clear();
      log('Missing modules after retry, aborting bootstrap');
      return;
    }
    _bootstrapModuleRetryTimeout.clear();

    var htmlReadOnly = configBool(config.readOnlyHtml, true);
    var cssReadOnly = configBool(config.readOnlyCss, true);
    var htmlLiveSync = configBool(config.htmlLiveSync, false);
    var htmlLiveSyncGuarded = configBool(config.htmlLiveSyncGuarded, false);
    var htmlLiveSyncDebounceMs = Math.max(60, Number(config.htmlLiveSyncDebounceMs || 180));
    var cssLiveSync = configBool(config.cssLiveSync, false);
    var cssLiveSyncDebounceMs = Math.max(80, Number(config.cssLiveSyncDebounceMs || 180));
    var editorFirstMode = normalizeEditorFirstMode(
      config.editorFirstMode || config.editorFirstRolloutMode,
      'team-default'
    );
    var editorFirstKillSwitchConfig = configBool(config.editorFirstKillSwitch, false);
    var editorFirstRuntimeKillSwitch = false;
    var editorFirstStorageKey = String(config.editorFirstStorageKey || 'cm6gpt-editor-first-opt-in-v1').trim() || 'cm6gpt-editor-first-opt-in-v1';
    var editorFirstLaunchGate = null;
    var compatibilityReport = getCompatibilityReportFromConfig();

    var panel = ns.panel.create();
    installPanelInputShield(panel.root);
    if (compatibilityReport && String(compatibilityReport.status || 'ok') !== 'ok') {
      logCompatibilityReport(compatibilityReport, 'bootstrap');
      setPanelStatus(panel, formatCompatibilityStatus(compatibilityReport), { channel: 'compatibility', dedupeMs: 0 });
    }

    function readStoredEditorFirstOptIn(storageKey) {
      if (!storageKey) return null;
      try {
        if (!w.localStorage) return null;
        return parseEditorFirstOptInValue(w.localStorage.getItem(storageKey));
      } catch (e) { _warn('readStoredEditorFirstOptIn', e); 
        return null;
      }
    }

    function writeStoredEditorFirstOptIn(storageKey, enabled) {
      var parsed = parseEditorFirstOptInValue(enabled);
      if (!storageKey) return { ok: false, reason: 'missing-storage-key' };
      if (parsed == null) return { ok: false, reason: 'invalid-opt-in-value' };
      try {
        if (!w.localStorage) return { ok: false, reason: 'local-storage-unavailable' };
        w.localStorage.setItem(storageKey, parsed ? '1' : '0');
        return { ok: true, value: parsed };
      } catch (e) {
        return { ok: false, reason: 'local-storage-write-failed' };
      }
    }

    function clearStoredEditorFirstOptIn(storageKey) {
      if (!storageKey) return { ok: false, reason: 'missing-storage-key' };
      try {
        if (!w.localStorage) return { ok: false, reason: 'local-storage-unavailable' };
        w.localStorage.removeItem(storageKey);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'local-storage-write-failed' };
      }
    }

    function setPanelLaunchVisibility(shouldOpen, statusText) {
      var root = panel && panel.root ? panel.root : null;
      if (!root || !root.classList) return false;
      var launcher = document.getElementById('cm6gpt-launcher');
      if (shouldOpen) {
        if (panel && typeof panel.show === 'function') {
          panel.show();
        } else {
          root.classList.remove('cm6gpt-hidden');
          document.documentElement.classList.add('cm6gpt-panel-open');
          if (launcher && launcher.classList) launcher.classList.add('cm6gpt-hidden');
        }
      } else {
        root.classList.add('cm6gpt-hidden');
        document.documentElement.classList.remove('cm6gpt-panel-open');
        if (launcher && launcher.classList) launcher.classList.remove('cm6gpt-hidden');
        blurActiveElementWithin(root, document, 'setPanelLaunchVisibility');
      }
      if (statusText) {
        try { setPanelStatus(panel, String(statusText), { channel: 'launch', dedupeMs: 0 }); } catch (e1) { _warn('setPanelLaunchVisibility', e1); }
      }
      if (typeof root.__cm6gptLayoutSync === 'function') {
        try { root.__cm6gptLayoutSync(); } catch (e2) { _warn('setPanelLaunchVisibility', e2); }
      }
      if (api && typeof api.setPollingActive === 'function') {
        api.setPollingActive(!root.classList.contains('cm6gpt-hidden'));
      }
      return true;
    }

    function collectEditorFirstLaunchGateReport() {
      var gate = editorFirstLaunchGate || resolveEditorFirstLaunchGate({
        mode: editorFirstMode,
        killSwitch: editorFirstKillSwitchConfig || editorFirstRuntimeKillSwitch,
        userOptIn: readStoredEditorFirstOptIn(editorFirstStorageKey),
        fallbackMode: 'team-default'
      });
      return {
        mode: gate.mode,
        killSwitch: !!gate.killSwitch,
        runtimeKillSwitch: !!editorFirstRuntimeKillSwitch,
        configKillSwitch: !!editorFirstKillSwitchConfig,
        userOptIn: gate.userOptIn,
        shouldOpenPanel: !!gate.shouldOpenPanel,
        reason: gate.reason,
        status: gate.status || '',
        storageKey: editorFirstStorageKey,
        phase: config.phase || ''
      };
    }

    function applyEditorFirstLaunchGate(opts) {
      opts = opts || {};
      editorFirstLaunchGate = resolveEditorFirstLaunchGate({
        mode: editorFirstMode,
        killSwitch: editorFirstKillSwitchConfig || editorFirstRuntimeKillSwitch,
        userOptIn: readStoredEditorFirstOptIn(editorFirstStorageKey),
        fallbackMode: 'team-default'
      });
      var statusText = editorFirstLaunchGate.shouldOpenPanel ? '' : editorFirstLaunchGate.status;
      setPanelLaunchVisibility(editorFirstLaunchGate.shouldOpenPanel, statusText);
      if (!opts.silent) {
        log('Editor-first launch gate', collectEditorFirstLaunchGateReport());
      }
      return collectEditorFirstLaunchGateReport();
    }

    applyEditorFirstLaunchGate({ silent: true });

    var softWrapEnabled = panel && typeof panel.isSoftWrapEnabled === 'function'
      ? !!panel.isSoftWrapEnabled()
      : !!(panel && panel.root && panel.root.classList && panel.root.classList.contains('cm6gpt-wrap-on'));
    var api = new ns.BricksAPI({
      pollMs: config.pollMs || 250,
      domDebounceMs: config.domDebounceMs || 120
    });
    var builderCompatibilityReport = null;
    var companionDiagnosticsReportSignature = '';
    function normalizeBuilderCompatibilityOpts(opts) {
      var next = opts && typeof opts === 'object' ? Object.assign({}, opts) : {};
      if (!Object.prototype.hasOwnProperty.call(next, 'includeStores')) next.includeStores = true;
      return next;
    }
    function refreshBuilderCompatibilityReport(opts) {
      if (!api || typeof api.getBuilderCompatibilityReport !== 'function') return null;
      try {
        builderCompatibilityReport = api.getBuilderCompatibilityReport(normalizeBuilderCompatibilityOpts(opts));
      } catch (eBuilderCompat) {
        _warn('refreshBuilderCompatibilityReport', eBuilderCompat);
        return null;
      }
      return builderCompatibilityReport;
    }
    function maybeReportBuilderCompatibility(source, opts) {
      var report = refreshBuilderCompatibilityReport(opts);
      var status = report && report.status ? String(report.status) : 'ok';
      if (!report || status === 'ok' || status === 'pending') return report;
      logBuilderCompatibilityReport(report, source || 'runtime');
      setPanelStatus(panel, formatBuilderCompatibilityStatus(report), { channel: 'builder-compatibility', dedupeMs: 0 });
      return report;
    }
    function getCompanionDiagnosticsReport() {
      return getCompanionDiagnosticsState();
    }
    function maybeReportCompanionDiagnostics(source) {
      var state = getCompanionDiagnosticsReport();
      var entry = state && state.coreFramework && typeof state.coreFramework === 'object'
        ? state.coreFramework
        : null;
      if (!entry) return null;
      var signature = String(entry.code || '') + '|' + String(entry.upstreamMessage || entry.message || '');
      if (signature && signature === companionDiagnosticsReportSignature) return entry;
      companionDiagnosticsReportSignature = signature;
      logCompanionDiagnosticsEntry(entry, source || 'runtime');
      setPanelStatus(panel, formatCompanionDiagnosticsStatus(entry), { channel: 'companion-diagnostics', dedupeMs: 0 });
      return entry;
    }
    ns.__cm6gptCompanionDiagnosticsNotify = function (_entry, source) {
      return maybeReportCompanionDiagnostics(source || 'runtime');
    };
    maybeReportCompanionDiagnostics('bootstrap');
    refreshBuilderCompatibilityReport({ includeStores: false });
    var syncApiPollingWithPanelVisibility = function () {
      if (!api || typeof api.setPollingActive !== 'function') return;
      var isVisible = !!(panel && panel.root && panel.root.classList && !panel.root.classList.contains('cm6gpt-hidden'));
      api.setPollingActive(isVisible);
    };
    syncApiPollingWithPanelVisibility();

    if (panel && panel.root && w.MutationObserver) {
      if (typeof panel.root.__cm6gptPanelVisibilityObserverCleanup === 'function') {
        try { panel.root.__cm6gptPanelVisibilityObserverCleanup(); } catch (eObs0) { _warn('panelVisibilityObserver', eObs0); }
      }
      var panelVisibilityObserver = new MutationObserver(function () {
        syncApiPollingWithPanelVisibility();
      });
      panelVisibilityObserver.observe(panel.root, {
        attributes: true,
        attributeFilter: ['class']
      });
      function cleanupPanelVisibilityObserver() {
        try { panelVisibilityObserver.disconnect(); } catch (eObs1) { _warn('panelVisibilityObserver', eObs1); }
        if (panel.root.__cm6gptPanelVisibilityObserver === panelVisibilityObserver) {
          panel.root.__cm6gptPanelVisibilityObserver = null;
        }
        if (panel.root.__cm6gptPanelVisibilityObserverCleanup === cleanupPanelVisibilityObserver) {
          panel.root.__cm6gptPanelVisibilityObserverCleanup = null;
        }
      }
      panel.root.__cm6gptPanelVisibilityObserver = panelVisibilityObserver;
      panel.root.__cm6gptPanelVisibilityObserverCleanup = cleanupPanelVisibilityObserver;
    }
    var adminRecipes = Array.isArray(config.adminRecipes) ? config.adminRecipes : [];
    var bricksVariables = Array.isArray(config.bricksVariables) ? config.bricksVariables : [];
    var bricksVariablesFull = Array.isArray(config.bricksVariablesFull) ? config.bricksVariablesFull : [];
    var recipes = null;
    if (ns.recipes && typeof ns.recipes.createManager === 'function') {
      var mergedDefaults = Array.isArray(ns.recipes.DEFAULT_RECIPES)
        ? ns.recipes.DEFAULT_RECIPES.slice()
        : [];
      if (adminRecipes.length) {
        for (var ar = 0; ar < adminRecipes.length; ar++) {
          mergedDefaults.push(adminRecipes[ar]);
        }
      }
      recipes = ns.recipes.createManager({
        defaultRecipes: mergedDefaults,
        presetPolicy: (config && config.recipePresetPolicy && typeof config.recipePresetPolicy === 'object')
          ? config.recipePresetPolicy
          : null
      });
    }

    var htmlEditor = ns.editors.create({
      mount: panel.htmlMount,
      language: 'html',
      readOnly: htmlReadOnly,
      softWrap: softWrapEnabled,
      initialValue: '<!-- CM6GPT booting… -->'
    });

    var cssEditorOpts = {
      mount: panel.cssMount,
      language: 'css',
      readOnly: cssReadOnly,
      softWrap: softWrapEnabled,
      initialValue: '/* CM6GPT booting… */'
    };
    if (recipes) {
      cssEditorOpts.recipes = {
        manager: recipes,
        getSelectionAnalysis: function () {
          if (!api || typeof api.getSelectionAnalysis !== 'function') return null;
          return api.getSelectionAnalysis();
        },
        onStatus: function (message) {
          if (!message) return;
          setPanelStatus(panel, String(message), { channel: 'recipe', dedupeMs: 0 });
        },
        onPreview: function (preview) {
          if (!api || typeof api.setCssHoverPreviewSelector !== 'function') return;
          var alias = preview && (preview.alias || preview.recipeId)
            ? String(preview.alias || preview.recipeId)
            : '';
          var blocked = !!(preview && preview.blocked);
          var analysis = preview && preview.analysis ? preview.analysis : null;
          var mode = analysis && analysis.mode ? String(analysis.mode).toLowerCase() : '';
          var id = analysis && analysis.id ? String(analysis.id).trim() : '';

          if (mode === 'element' && id) {
            var escapedId = escapeCssAttrSelectorValue(id);
            if (!escapedId) return;
            var ghostOut = null;
            if (!blocked && typeof api.setRecipeGhostPreview === 'function') {
              try {
                ghostOut = api.setRecipeGhostPreview({
                  targetId: id,
                  alias: alias,
                  cssBody: preview && preview.recipe ? String(preview.recipe.body || '') : ''
                });
              } catch (e0) { _warn('onPreview', e0); 
                ghostOut = null;
              }
            } else if (typeof api.clearRecipeGhostPreview === 'function') {
              try { api.clearRecipeGhostPreview(); } catch (e0c) { _warn('onPreview', e0c); }
            }
            try {
              api.setCssHoverPreviewSelector('[data-id="' + escapedId + '"]', { maxMatches: 8 });
            } catch (e1) { _warn('onPreview', e1); }
            if (alias) {
              var suffix = blocked ? ' (blocked)' : '';
              if (ghostOut && ghostOut.ok) {
                setPanelStatus(panel, 'Recipe preview: @' + alias + ' -> #' + id + suffix + ' · ghost style on', { channel: 'recipe-preview', dedupeMs: 0 });
              } else {
                setPanelStatus(panel, 'Recipe preview: @' + alias + ' -> #' + id + suffix + ' · target highlight', { channel: 'recipe-preview', dedupeMs: 0 });
              }
            }
            return;
          }

          if (typeof api.clearRecipeGhostPreview === 'function') {
            try { api.clearRecipeGhostPreview(); } catch (e1g) { _warn('onPreview', e1g); }
          }
          if (typeof api.clearCssHoverPreview === 'function') {
            try { api.clearCssHoverPreview(); } catch (e2) { _warn('onPreview', e2); }
          }
          if (alias && mode === 'page') {
            setPanelStatus(panel, 'Recipe preview: @' + alias + ' -> page scope' + (blocked ? ' (blocked)' : ''), { channel: 'recipe-preview', dedupeMs: 0 });
          }
        },
        onPreviewClear: function () {
          if (!api) return;
          if (typeof api.clearRecipeGhostPreview === 'function') {
            try { api.clearRecipeGhostPreview(); } catch (e0) { _warn('onPreviewClear', e0); }
          }
          if (typeof api.clearCssHoverPreview !== 'function') return;
          try { api.clearCssHoverPreview(); } catch (e1) { _warn('onPreviewClear', e1); }
        },
        maxOptions: 32,
        cssVariables: bricksVariables,
        cssVariablesFull: bricksVariablesFull,
        onVarPreview: function (info) {
          if (!api || !info || !info.varName) return;
          var varName = String(info.varName || '').trim();
          var property = String(info.property || '').trim();
          if (!varName || !property) return;
          var doc = null;
          try { doc = api.getIframeDocument(); } catch (e) { _warn('onVarPreview', e);  doc = null; }
          if (!doc) return;
          // Build selector from current element context (use [data-id] like recipe preview)
          var elementId = '';
          try { elementId = String(api.getSelectedElementId() || '').trim(); } catch (e) { _warn('onVarPreview', e); }
          if (!elementId) return;
          var escapedId = escapeCssAttrSelectorValue(elementId);
          if (!escapedId) return;
          var selector = '[data-id="' + escapedId + '"]';
          // Inject temporary preview style
          var styleId = 'cm6gpt-var-preview-style';
          var style = null;
          try { style = doc.getElementById(styleId); } catch (e) { _warn('onVarPreview', e); }
          if (!style) {
            try {
              style = doc.createElement('style');
              style.id = styleId;
              (doc.head || doc.documentElement).appendChild(style);
            } catch (e) { _warn('onVarPreview', e);  return; }
          }
          try { style.textContent = selector + ' { ' + property + ': var(' + varName + ') !important; }'; } catch (e) { _warn('onVarPreview', e); }
          setPanelStatus(panel, 'Variable preview: ' + varName + ' on ' + property, { channel: 'var-preview', dedupeMs: 0 });
        },
        onVarPreviewClear: function () {
          var doc = null;
          try { doc = api.getIframeDocument(); } catch (e) { _warn('onVarPreviewClear', e);  doc = null; }
          if (!doc) return;
          var style = null;
          try { style = doc.getElementById('cm6gpt-var-preview-style'); } catch (e) { _warn('onVarPreviewClear', e); }
          if (style) {
            try { style.textContent = ''; } catch (e) { _warn('onVarPreviewClear', e); }
          }
        }
      };
    }

    var cssEditor = ns.editors.create(cssEditorOpts);

    var activeEditorKey = 'css';
    function setActiveEditorKey(next) {
      next = String(next || '').toLowerCase();
      if (next !== 'html' && next !== 'css') return;
      activeEditorKey = next;
      syncUndoRedoState();
    }

    function getActiveEditorForUndoRedo() {
      if (!panel || !panel.root) return cssEditor || htmlEditor || null;
      var rootNode = panel.root;
      if (rootNode.classList.contains('cm6gpt-only-html')) return htmlEditor || cssEditor || null;
      if (rootNode.classList.contains('cm6gpt-only-css')) return cssEditor || htmlEditor || null;
      if (activeEditorKey === 'html') return htmlEditor || cssEditor || null;
      return cssEditor || htmlEditor || null;
    }

    function getEditorHistoryState(editor) {
      if (!editor) return { canUndo: false, canRedo: false };
      var canUndo = false;
      var canRedo = false;
      try { canUndo = !!(typeof editor.canUndo === 'function' && editor.canUndo()); } catch (e0) { _warn('getEditorHistoryState', e0);  canUndo = false; }
      try { canRedo = !!(typeof editor.canRedo === 'function' && editor.canRedo()); } catch (e1) { _warn('getEditorHistoryState', e1);  canRedo = false; }
      return { canUndo: canUndo, canRedo: canRedo };
    }

    function syncUndoRedoState() {
      if (!panel || typeof panel.setUndoRedoState !== 'function') return;
      var activeEditor = getActiveEditorForUndoRedo();
      panel.setUndoRedoState(getEditorHistoryState(activeEditor));
    }

    installPanelEditorActivityHandoff(panel, setActiveEditorKey);

    if (htmlEditor && typeof htmlEditor.onChange === 'function') {
      htmlEditor.onChange(function () {
        setActiveEditorKey('html');
      });
    }
    if (cssEditor && typeof cssEditor.onChange === 'function') {
      cssEditor.onChange(function () {
        setActiveEditorKey('css');
      });
    }

    if (panel && typeof panel.onUndo === 'function') {
      panel.onUndo(function () {
        var activeEditor = getActiveEditorForUndoRedo();
        if (!activeEditor || typeof activeEditor.undo !== 'function') return;
        try { activeEditor.undo(); } catch (e0) { _warn('syncUndoRedoState', e0); }
        syncUndoRedoState();
      });
    }
    if (panel && typeof panel.onRedo === 'function') {
      panel.onRedo(function () {
        var activeEditor = getActiveEditorForUndoRedo();
        if (!activeEditor || typeof activeEditor.redo !== 'function') return;
        try { activeEditor.redo(); } catch (e0) { _warn('syncUndoRedoState', e0); }
        syncUndoRedoState();
      });
    }
    syncUndoRedoState();

    if (panel && typeof panel.onHtmlCopy === 'function') {
      panel.onHtmlCopy(function () {
        return htmlEditor ? htmlEditor.getValue() : '';
      });
    }
    if (panel && typeof panel.onCssCopy === 'function') {
      panel.onCssCopy(function () {
        return cssEditor ? cssEditor.getValue() : '';
      });
    }

    if (panel && typeof panel.bindRecipeManager === 'function') {
      if (recipes) {
        panel.bindRecipeManager({
          normalizedSource: true,
          list: function (opts) {
            return recipes.list(opts || {});
          },
          listRef: function (opts) {
            return typeof recipes.listRef === 'function'
              ? recipes.listRef(opts || {})
              : recipes.list(opts || {});
          },
          search: function (query) {
            return recipes.search(String(query || ''));
          },
          resolve: function (identifier, opts) {
            return recipes.resolve(identifier, opts || {});
          },
          listPresets: function () {
            return typeof recipes.listPresets === 'function' ? recipes.listPresets() : [];
          },
          getPresetState: function () {
            return typeof recipes.getPresetState === 'function'
              ? recipes.getPresetState()
              : { custom: false, enabledPresets: [], presets: [] };
          },
          setPresetEnabled: function (presetKey, enabled) {
            return typeof recipes.setPresetEnabled === 'function'
              ? recipes.setPresetEnabled(presetKey, enabled)
              : { custom: false, enabledPresets: [], presets: [] };
          },
          setEnabledPresets: function (presetKeys) {
            return typeof recipes.setEnabledPresets === 'function'
              ? recipes.setEnabledPresets(presetKeys)
              : { custom: false, enabledPresets: [], presets: [] };
          },
          resetPresetFilters: function () {
            return typeof recipes.resetPresetFilters === 'function'
              ? recipes.resetPresetFilters()
              : { custom: false, enabledPresets: [], presets: [] };
          },
          getSelectionAnalysis: function () {
            if (!api || typeof api.getSelectionAnalysis !== 'function') return null;
            return api.getSelectionAnalysis();
          },
          insert: function (alias, opts) {
            opts = opts || {};
            var analysis = opts.selectionAnalysis;
            if (!analysis && api && typeof api.getSelectionAnalysis === 'function') {
              analysis = api.getSelectionAnalysis();
            }
            var out = recipes.insertAlias(alias, {
              cssEditor: cssEditor,
              htmlEditor: htmlEditor,
              editor: cssEditor,
              selectionAnalysis: analysis,
              selectionStart: opts.selectionStart,
              selectionEnd: opts.selectionEnd,
              addTrailingNewline: opts.addTrailingNewline !== false
            });

            if (out && out.ok && out.inserted) {
              var rid = out.recipe && out.recipe.id ? out.recipe.id : String(alias || '');
              var lanes = Array.isArray(out.insertedLanes) && out.insertedLanes.length
                ? (' [' + out.insertedLanes.join('+') + ']')
                : '';
              setPanelStatus(panel, 'Recipe inserted: @' + rid + lanes, { channel: 'recipe', dedupeMs: 0 });
              if (typeof api.clearRecipeGhostPreview === 'function') {
                try { api.clearRecipeGhostPreview(); } catch (e0) { _warn('insert', e0); }
              }
              if (typeof api.clearCssHoverPreview === 'function') {
                try { api.clearCssHoverPreview(); } catch (e1) { _warn('insert', e1); }
              }
            } else if (out && !out.ok) {
              var reason = String(out.reason || 'recipe-insert-failed');
              var blockedDetail = '';
              if (Array.isArray(out.blockedReasons) && out.blockedReasons.length) {
                blockedDetail = out.blockedReasons.join(' | ');
              } else if (Array.isArray(out.blockedContexts) && out.blockedContexts.length) {
                blockedDetail = out.blockedContexts.join(', ');
              }
              setPanelStatus(panel,
                blockedDetail
                  ? ('Recipe blocked: @' + String(alias || '') + ' (' + reason + ': ' + blockedDetail + ')')
                  : ('Recipe blocked: @' + String(alias || '') + ' (' + reason + ')'),
                { channel: 'recipe', dedupeMs: 0 }
              );
            }

            return out;
          },
          import: function (payload, opts) {
            return recipes.importRecipes(payload, opts || {});
          },
          export: function (opts) {
            return recipes.exportRecipes(opts || {});
          },
          ghostPreview: function (recipe) {
            if (!api || !recipe || typeof api.setRecipeGhostPreview !== 'function') return null;
            var elementId = '';
            try { elementId = String(api.getSelectedElementId() || '').trim(); } catch (e) { _warn('ghostPreview', e); }
            if (!elementId) return null;
            var body = '';
            if (recipe && typeof recipe === 'object') {
              // Compound recipes have body: { css, html } — extract CSS lane only
              var rawBody = recipe.body;
              if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
                body = String(rawBody.css || '');
              } else {
                body = String(rawBody || '');
              }
            }
            if (!body) return null;
            try {
              return api.setRecipeGhostPreview({
                targetId: elementId,
                alias: String(recipe.id || (recipe.aliases && recipe.aliases[0]) || ''),
                cssBody: body
              });
            } catch (e0) { _warn('ghostPreview', e0);  return null; }
          },
          clearGhostPreview: function () {
            if (!api) return;
            if (typeof api.clearRecipeGhostPreview === 'function') {
              try { api.clearRecipeGhostPreview(); } catch (e0) { _warn('clearGhostPreview', e0); }
            }
            if (typeof api.clearCssHoverPreview === 'function') {
              try { api.clearCssHoverPreview(); } catch (e1) { _warn('clearGhostPreview', e1); }
            }
          },
          // F07: Recipe CRUD methods for the catalog modal
          isUserOwned: function (identifier) {
            if (!recipes || typeof recipes.isUserOwned !== 'function') return false;
            return recipes.isUserOwned(identifier);
          },
          upsert: function (recipeData) {
            if (!recipes || typeof recipes.upsert !== 'function') return { ok: false, reason: 'no-manager' };
            return recipes.upsert(recipeData);
          },
          remove: function (identifier) {
            if (!recipes || typeof recipes.remove !== 'function') return { ok: false, reason: 'no-manager' };
            return recipes.remove(identifier);
          },
          getEditorCss: function () {
            if (!cssEditor || typeof cssEditor.getValue !== 'function') return '';
            try { return cssEditor.getValue() || ''; } catch (e) { _warn('getEditorCss', e);  return ''; }
          },
          focusAfterInsert: function (insertResult) {
            var lanes = (insertResult && Array.isArray(insertResult.insertedLanes))
              ? insertResult.insertedLanes
              : [];
            var preferHtml = lanes.length === 1 && String(lanes[0] || '') === 'html';
            var target = preferHtml ? htmlEditor : cssEditor;
            if (!target || typeof target.focus !== 'function') {
              target = cssEditor || htmlEditor || null;
            }
            return focusDomNode(target, { context: 'focusAfterInsert' });
          }
        });
      } else {
        panel.bindRecipeManager(null);
      }
    }

    var htmlBridge = new ns.HTMLBridge({
      api: api,
      editor: htmlEditor,
      panel: panel,
      readOnly: htmlReadOnly,
      debounceMs: config.domDebounceMs || 120,
      liveSync: htmlLiveSync,
      liveSyncAllowGuarded: htmlLiveSyncGuarded,
      liveSyncDebounceMs: htmlLiveSyncDebounceMs
    });

    var cssBridge = new ns.CSSBridge({
      api: api,
      editor: cssEditor,
      panel: panel,
      readOnly: cssReadOnly,
      debounceMs: config.domDebounceMs || 120,
      maxStyleKb: config.cssSnapshotMaxStyleKb || 128,
      liveSync: cssLiveSync,
      liveSyncDebounceMs: cssLiveSyncDebounceMs
    });
    function safeBridgeStart(name, bridge) {
      if (!bridge || typeof bridge.start !== 'function') return false;
      try {
        bridge.start();
        return true;
      } catch (e) {
        var msg = e && e.message ? e.message : String(e);
        log(name + ' start failed:', msg);
        setPanelStatus(panel, name + ' start error · ' + msg, { channel: 'bootstrap', dedupeMs: 0 });
        if (bridge && typeof bridge.refresh === 'function') {
          try { bridge.refresh({ force: true }); } catch (e2) { _warn('safeBridgeStart', e2); }
        }
        return false;
      }
    }

    var bootstrapDiag = {
      refreshErrors: [],
      htmlErrors: [],
      cssErrors: [],
      seedHits: 0
    };

    function pushBootstrapDiag(list, err) {
      if (!Array.isArray(list)) return;
      var msg = err && err.message ? err.message : String(err || '');
      if (!msg) return;
      list.push(msg);
      if (list.length > 4) list.splice(0, list.length - 4);
    }

    function readBootFlags() {
      var htmlVal = htmlEditor && typeof htmlEditor.getValue === 'function'
        ? String(htmlEditor.getValue() || '')
        : '';
      var cssVal = cssEditor && typeof cssEditor.getValue === 'function'
        ? String(cssEditor.getValue() || '')
        : '';
      var htmlBooting = htmlVal.indexOf('CM6GPT booting') !== -1;
      var cssBooting = cssVal.indexOf('CM6GPT booting') !== -1;
      return {
        htmlBooting: htmlBooting,
        cssBooting: cssBooting,
        stillBooting: !!(htmlBooting || cssBooting)
      };
    }

    function getScopeModeSafe() {
      if (!panel || typeof panel.getScopeMode !== 'function') return 'self';
      try { return String(panel.getScopeMode() || 'self'); } catch (e) { _warn('getScopeModeSafe', e);  return 'self'; }
    }

    function getPanelModesSafe() {
      var htmlLens = 'minimal';
      var cssLens = 'minimal';
      var cssView = 'canonical';
      var layerMode = 'l2';
      var scopeMode = 'self';
      if (panel && typeof panel.getHtmlLensMode === 'function') {
        try { htmlLens = String(panel.getHtmlLensMode() || 'minimal'); } catch (e0) { _warn('getPanelModesSafe', e0); }
      }
      if (panel && typeof panel.getCssLensMode === 'function') {
        try { cssLens = String(panel.getCssLensMode() || 'minimal'); } catch (e1) { _warn('getPanelModesSafe', e1); }
      }
      if (panel && typeof panel.getLayerMode === 'function') {
        try { layerMode = String(panel.getLayerMode() || 'l2'); } catch (e2) { _warn('getPanelModesSafe', e2); }
      }
      if (panel && typeof panel.getScopeMode === 'function') {
        try { scopeMode = String(panel.getScopeMode() || 'self'); } catch (e3) { _warn('getPanelModesSafe', e3); }
      }
      return {
        htmlLens: htmlLens,
        cssLens: cssLens,
        cssView: cssView,
        layerMode: layerMode,
        scopeMode: scopeMode
      };
    }

    function normalizePanelFiltersForRecovery(opts) {
      opts = opts || {};
      var force = !!opts.force;
      var changed = false;
      var changedKeys = [];
      var before = getPanelModesSafe();

      if (force && panel && typeof panel.setHtmlLensMode === 'function' && before.htmlLens !== 'minimal') {
        try { panel.setHtmlLensMode('minimal'); changed = true; changedKeys.push('htmlLens'); } catch (e0) { _warn('normalizePanelFiltersForRecovery', e0); }
      }
      if (
        force &&
        panel &&
        typeof panel.setCssLensMode === 'function' &&
        before.cssLens !== 'minimal' &&
        before.cssLens !== 'global'
      ) {
        try { panel.setCssLensMode('minimal'); changed = true; changedKeys.push('cssLens'); } catch (e1) { _warn('normalizePanelFiltersForRecovery', e1); }
      }
      if (force && panel && typeof panel.setLayerMode === 'function' && before.layerMode !== 'l2') {
        try { panel.setLayerMode('l2'); changed = true; changedKeys.push('layerMode'); } catch (e2) { _warn('normalizePanelFiltersForRecovery', e2); }
      }
      if (
        force &&
        panel &&
        typeof panel.setScopeMode === 'function' &&
        before.scopeMode !== 'self' &&
        before.scopeMode !== 'page'
      ) {
        try { panel.setScopeMode('self'); changed = true; changedKeys.push('scopeMode'); } catch (e3) { _warn('normalizePanelFiltersForRecovery', e3); }
      }

      return {
        changed: changed,
        changedKeys: changedKeys,
        before: before,
        after: getPanelModesSafe()
      };
    }

    function seedHtmlSnapshotDirect() {
      if (!htmlEditor || typeof htmlEditor.setValue !== 'function') return false;
      if (!htmlBridge || typeof htmlBridge.serializeSelection !== 'function') return false;
      try {
        var ctx = null;
        if (htmlBridge && typeof htmlBridge._getScopedContext === 'function') {
          ctx = htmlBridge._getScopedContext();
        } else if (api && typeof api.getScopedSelectionContext === 'function') {
          ctx = api.getScopedSelectionContext(getScopeModeSafe());
        } else if (api && typeof api.getSelectionContext === 'function') {
          ctx = api.getSelectionContext();
        }
        var html = String(htmlBridge.serializeSelection(ctx) || '').trim();
        if (!html || html.indexOf('CM6GPT booting') !== -1) return false;
        htmlEditor.setValue(html, { silent: true, preserveScroll: true, preserveSelection: true });
        bootstrapDiag.seedHits += 1;
        return true;
      } catch (e) { _warn('seedHtmlSnapshotDirect', e); 
        pushBootstrapDiag(bootstrapDiag.htmlErrors, e);
        return false;
      }
    }

    function seedCssSnapshotDirect() {
      if (!cssEditor || typeof cssEditor.setValue !== 'function') return false;
      if (!api) return false;
      try {
        var ctx = null;
        if (cssBridge && typeof cssBridge._getScopedContext === 'function') {
          ctx = cssBridge._getScopedContext();
        }
        if (typeof api.getScopedSelectionContext === 'function') {
          ctx = ctx || api.getScopedSelectionContext(getScopeModeSafe());
        } else if (typeof api.getSelectionContext === 'function') {
          ctx = ctx || api.getSelectionContext();
        }
        var css = '';
        if (ctx && ctx.mode === 'page' && cssBridge) {
          var cssLensMode = typeof cssBridge._normalizeCssLensMode === 'function'
            ? String(cssBridge._normalizeCssLensMode(cssBridge.cssLensMode) || '')
            : '';
          if (cssLensMode === 'minimal' && typeof cssBridge._buildPageMinimalSummary === 'function') {
            css = String(cssBridge._buildPageMinimalSummary() || '');
          } else if (typeof cssBridge._buildPageCanonicalSummary === 'function') {
            css = String(cssBridge._buildPageCanonicalSummary() || '');
          }
        } else if (ctx && ctx.mode === 'element' && ctx.id && typeof api.getElementModelById === 'function') {
          var model = api.getElementModelById(String(ctx.id || ''));
          var settings = model && model.settings ? model.settings : null;
          css = settings && typeof settings._cssCustom === 'string' ? String(settings._cssCustom || '') : '';
          if (!css) css = '/* CM6GPT: selected element has no _cssCustom yet */';
        } else if (typeof api.getPageCustomCss === 'function') {
          css = String(api.getPageCustomCss() || '');
          if (!css) css = '/* CM6GPT: pageCustomCss is empty */';
        } else {
          css = '/* CM6GPT: CSS snapshot pending; use Refresh after selection settles */';
        }
        if (css.indexOf('CM6GPT booting') !== -1) return false;
        cssEditor.setValue(css, { silent: true, preserveScroll: true, preserveSelection: true });
        bootstrapDiag.seedHits += 1;
        return true;
      } catch (e) { _warn('seedCssSnapshotDirect', e); 
        pushBootstrapDiag(bootstrapDiag.cssErrors, e);
        return false;
      }
    }

    safeBridgeStart('HTML bridge', htmlBridge);
    safeBridgeStart('CSS bridge', cssBridge);

    var bootstrapKickTimeout = createManagedTimeout();
    function scheduleBootstrapKick(attempt, delayMs) {
      bootstrapKickTimeout.schedule(function () {
        maybeKickBootstrap(attempt);
      }, delayMs);
    }

    function maybeKickBootstrap(attempt) {
      attempt = Number(attempt || 1);
      try {
        var before = readBootFlags();
        if (!before.stillBooting) {
          bootstrapKickTimeout.clear();
          return;
        }
        if (attempt === 1) {
          normalizePanelFiltersForRecovery({ force: true });
        }

        performManualRefreshWithFallback({
          api: api,
          panel: panel,
          htmlBridge: htmlBridge,
          cssBridge: cssBridge,
          refreshPayload: { reason: 'cm6gpt-bootstrap-kick-' + attempt },
          onManualRefreshError: function (err) { pushBootstrapDiag(bootstrapDiag.refreshErrors, err); },
          onHtmlRefreshError: function (err) { pushBootstrapDiag(bootstrapDiag.htmlErrors, err); },
          onCssRefreshError: function (err) { pushBootstrapDiag(bootstrapDiag.cssErrors, err); }
        });

        var afterRefresh = readBootFlags();
        if (afterRefresh.htmlBooting) seedHtmlSnapshotDirect();
        if (afterRefresh.cssBooting) seedCssSnapshotDirect();

        var afterSeed = readBootFlags();
        if (!afterSeed.stillBooting) {
          bootstrapKickTimeout.clear();
          setPanelStatus(panel, 'Bootstrap recovery completed', { channel: 'bootstrap', dedupeMs: 0 });
          return;
        }

        if (attempt >= 6) {
          bootstrapKickTimeout.clear();
          var refreshErr = bootstrapDiag.refreshErrors.length ? (' · refresh:' + bootstrapDiag.refreshErrors[bootstrapDiag.refreshErrors.length - 1]) : '';
          var htmlErr = bootstrapDiag.htmlErrors.length ? (' · html:' + bootstrapDiag.htmlErrors[bootstrapDiag.htmlErrors.length - 1]) : '';
          var cssErr = bootstrapDiag.cssErrors.length ? (' · css:' + bootstrapDiag.cssErrors[bootstrapDiag.cssErrors.length - 1]) : '';
          setPanelStatus(
            panel,
            'Bootstrap recovery exhausted · use forceBootstrapRecovery + refresh builder' + refreshErr + htmlErr + cssErr,
            { channel: 'bootstrap', dedupeMs: 0 }
          );
          return;
        }
        // W33: Two independent timer systems coexist here:
        //   1. waitForBricksReady() — polls for iframe/document readiness (200ms interval, up to maxAttempts)
        //      and then calls bootstrap() once the builder DOM is available.
        //   2. maybeKickBootstrap() — a separate recovery timer (setTimeout chain, up to 6 attempts)
        //      that checks boot flags and tries to nudge a stalled bootstrap.
        // These are NOT coordinated: the kick timer may fire while waitForBricksReady is still
        // polling, or after it has already given up. Neither system cancels the other.
        // If fewer than 3 retries have been used, allow more time before the next kick.
        var delay = attempt < 3 ? 700 * attempt : 450 * attempt;
        scheduleBootstrapKick(attempt + 1, delay);
      } catch (e) { _warn('onCssRefreshError', e); 
        log('Bootstrap kick failed:', e && e.message ? e.message : String(e));
      }
    }

    scheduleBootstrapKick(1, 250);

    panel.onRefresh(function () {
      performManualRefreshWithFallback({
        api: api,
        panel: panel,
        htmlBridge: htmlBridge,
        cssBridge: cssBridge,
        statusOnSuccess: 'Manual refresh requested',
        statusOnFallback: 'Manual refresh fallback applied'
      });
      syncUndoRedoState();
    });

    panel.onClose(function () {
      syncApiPollingWithPanelVisibility();
      // Panel shell stays mounted for fast reopen, but hidden-state runtimes are stopped.
      log('Panel closed (hidden-state runtimes stopped)');
    });

    api.on('selection:changed', function (ctx) {
      if (!ctx) return;
      var summary = ctx.mode === 'element'
        ? ('Selected #' + ctx.id + ' <' + ctx.tag + '>')
        : 'Page mode (no active Bricks element)';
      setPanelStatus(panel, summary, { channel: 'selection', dedupeMs: 0 });
    });
    api.on('builder:ready', function () {
      maybeReportBuilderCompatibility('builder-ready', { includeStores: false });
    });

    function collectWriteSync9Report() {
      var htmlReport = (htmlBridge && typeof htmlBridge.getWriteSyncCapabilityReport === 'function')
        ? htmlBridge.getWriteSyncCapabilityReport()
        : { lane: 'html', title: 'Write/Sync 9+', threshold: 9, ready: 0, total: 0, ok: false, checks: [] };
      var cssReport = (cssBridge && typeof cssBridge.getWriteSyncCapabilityReport === 'function')
        ? cssBridge.getWriteSyncCapabilityReport()
        : { lane: 'css', title: 'Write/Sync 9+', threshold: 9, ready: 0, total: 0, ok: false, checks: [] };
      var combinedReady = Number(htmlReport.ready || 0) + Number(cssReport.ready || 0);
      var combinedTotal = Number(htmlReport.total || 0) + Number(cssReport.total || 0);

      return {
        title: 'Write/Sync 9+',
        html: htmlReport,
        css: cssReport,
        combined: {
          ready: combinedReady,
          total: combinedTotal,
          ok: !!(htmlReport.ok && cssReport.ok)
        }
      };
    }

    function collectCanonicalSnapshotReport(opts) {
      var htmlReport = (htmlBridge && typeof htmlBridge.getCanonicalSnapshotReport === 'function')
        ? htmlBridge.getCanonicalSnapshotReport(opts || {})
        : {
            lane: 'html',
            model: 'canonical-snapshot-v2',
            drift: { detected: true, reason: 'bridge-unavailable' },
            ok: false
          };
      var cssReport = (cssBridge && typeof cssBridge.getCanonicalSnapshotReport === 'function')
        ? cssBridge.getCanonicalSnapshotReport(opts || {})
        : {
            lane: 'css',
            model: 'canonical-snapshot-v2',
            drift: { detected: true, reason: 'bridge-unavailable' },
            ok: false
          };
      var lanesDrifting = [];
      if (htmlReport && htmlReport.drift && htmlReport.drift.detected) lanesDrifting.push('html');
      if (cssReport && cssReport.drift && cssReport.drift.detected) lanesDrifting.push('css');

      return {
        title: 'Canonical Snapshot v2',
        html: htmlReport,
        css: cssReport,
        combined: {
          driftDetected: lanesDrifting.length > 0,
          lanesDrifting: lanesDrifting,
          ok: lanesDrifting.length === 0
        }
      };
    }

    function collectSafeSubsetCompilerReport(opts) {
      var htmlReport = (htmlBridge && typeof htmlBridge.getSafeSubsetCompilerReport === 'function')
        ? htmlBridge.getSafeSubsetCompilerReport(opts || {})
        : {
            lane: 'html',
            compiler: 'text-native-safe-subset-v1',
            parity: { compileReady: false, losslessSubset: false },
            ok: false,
            reason: 'bridge-unavailable'
          };

      return {
        title: 'HTML Safe-Subset Compiler v1',
        html: htmlReport,
        combined: {
          compileReady: !!(htmlReport && htmlReport.parity && htmlReport.parity.compileReady),
          losslessSubset: !!(htmlReport && htmlReport.parity && htmlReport.parity.losslessSubset),
          ok: !!(htmlReport && htmlReport.ok)
        }
      };
    }

    var shadowParityTelemetry = {
      enabled: configBool(config.shadowParityTelemetryEnabled, true),
      alertsEnabled: configBool(config.shadowParityAlertsEnabled, true),
      maxEvents: Math.max(20, Number(config.shadowParityMaxEvents || 120)),
      probeDebounceMs: Math.max(0, Number(config.shadowParityProbeDebounceMs || 90)),
      alertThrottleMs: Math.max(400, Number(config.shadowParityAlertThrottleMs || 1800)),
      seq: 0,
      history: [],
      counters: {
        probes: 0,
        alerts: 0,
        ok: 0,
        mismatch: 0
      },
      lastAlertAt: 0,
      lastAlertKey: ''
    };
    var shadowParityProbeTimeout = createManagedTimeout();

    function getShadowParityContext() {
      var modes = getPanelModesSafe();
      var selection = null;
      if (api && typeof api.getSelectionContext === 'function') {
        try { selection = api.getSelectionContext(); } catch (e) { _warn('getShadowParityContext', e);  selection = null; }
      }
      return {
        phase: String(config.phase || ''),
        scopeMode: String(modes.scopeMode || ''),
        layerMode: String(modes.layerMode || ''),
        htmlLensMode: String(modes.htmlLens || ''),
        cssLensMode: String(modes.cssLens || ''),
        cssViewMode: String(modes.cssView || ''),
        selectionMode: selection && selection.mode ? String(selection.mode) : '',
        selectionId: selection && selection.id ? String(selection.id) : ''
      };
    }

    function summarizeShadowParityAnomalies(canonicalReport, writeSyncReport, safeSubsetReport) {
      var out = [];
      var lanesDrifting = canonicalReport && canonicalReport.combined && Array.isArray(canonicalReport.combined.lanesDrifting)
        ? canonicalReport.combined.lanesDrifting
        : [];
      if (canonicalReport && canonicalReport.combined && canonicalReport.combined.driftDetected) {
        out.push('drift:' + (lanesDrifting.length ? lanesDrifting.join('+') : 'unknown'));
      }
      if (!(writeSyncReport && writeSyncReport.combined && writeSyncReport.combined.ok)) {
        out.push('write-sync-gate');
      }
      var safeHtmlReport = safeSubsetReport && safeSubsetReport.html ? safeSubsetReport.html : null;
      var safeContextMode = safeHtmlReport && safeHtmlReport.context && safeHtmlReport.context.mode
        ? String(safeHtmlReport.context.mode)
        : '';
      var safeParity = safeHtmlReport && safeHtmlReport.parity
        ? safeHtmlReport.parity
        : null;
      // Safe-subset parity is meaningful on element-scoped compiler contexts.
      // In page/none contexts `compileReady=false` is expected and should not alert.
      if (safeContextMode === 'element') {
        if (!(safeParity && safeParity.compileReady)) out.push('safe-subset-compile-not-ready');
        if (safeParity && safeParity.losslessSubset === false) out.push('safe-subset-lossy');
      }
      return out;
    }

    function pushShadowParityEvent(event) {
      shadowParityTelemetry.history.push(event);
      if (shadowParityTelemetry.history.length > shadowParityTelemetry.maxEvents) {
        shadowParityTelemetry.history.splice(0, shadowParityTelemetry.history.length - shadowParityTelemetry.maxEvents);
      }
    }

    function emitShadowParityAlertIfNeeded(event) {
      if (!event || event.ok) return;
      if (!shadowParityTelemetry.alertsEnabled) return;
      if (!panel) return;

      var nowTs = Date.now ? Date.now() : +new Date();
      var alertKey = String((event.anomalies || []).join('|') || 'unknown');
      var withinWindow = (nowTs - Number(shadowParityTelemetry.lastAlertAt || 0)) < shadowParityTelemetry.alertThrottleMs;
      if (withinWindow && alertKey === shadowParityTelemetry.lastAlertKey) return;

      shadowParityTelemetry.lastAlertAt = nowTs;
      shadowParityTelemetry.lastAlertKey = alertKey;
      shadowParityTelemetry.counters.alerts += 1;

      var laneTag = event.lane ? String(event.lane) : 'mixed';
      var sourceTag = event.source ? String(event.source) : 'manual';
      setPanelStatus(panel, 'Shadow parity alert · lane:' + laneTag + ' · source:' + sourceTag + ' · ' + alertKey, { channel: 'shadow-parity', dedupeMs: 0 });
    }

    function runShadowParityProbe(opts) {
      opts = opts || {};
      if (!shadowParityTelemetry.enabled) {
        return {
          ok: true,
          skipped: true,
          reason: 'shadow-parity-disabled'
        };
      }

      var canonicalReport = collectCanonicalSnapshotReport({ live: false });
      var writeSyncReport = collectWriteSync9Report();
      var safeSubsetReport = collectSafeSubsetCompilerReport({ silent: true });
      var anomalies = summarizeShadowParityAnomalies(canonicalReport, writeSyncReport, safeSubsetReport);
      var ok = anomalies.length === 0;

      shadowParityTelemetry.seq += 1;
      shadowParityTelemetry.counters.probes += 1;
      if (ok) shadowParityTelemetry.counters.ok += 1;
      else shadowParityTelemetry.counters.mismatch += 1;

      var event = {
        id: shadowParityTelemetry.seq,
        ts: Date.now ? Date.now() : +new Date(),
        trigger: String(opts.trigger || 'manual'),
        lane: String(opts.lane || 'mixed'),
        source: String(opts.source || 'manual'),
        context: getShadowParityContext(),
        summary: {
          canonicalOk: !!(canonicalReport && canonicalReport.combined && canonicalReport.combined.ok),
          writeSyncOk: !!(writeSyncReport && writeSyncReport.combined && writeSyncReport.combined.ok),
          safeSubsetCompileReady: !!(safeSubsetReport && safeSubsetReport.combined && safeSubsetReport.combined.compileReady),
          safeSubsetLossless: !!(safeSubsetReport && safeSubsetReport.combined && safeSubsetReport.combined.losslessSubset)
        },
        anomalies: anomalies,
        ok: ok
      };

      if (opts.includeReports) {
        event.reports = {
          canonical: canonicalReport,
          writeSync: writeSyncReport,
          safeSubset: safeSubsetReport
        };
      }

      pushShadowParityEvent(event);
      emitShadowParityAlertIfNeeded(event);
      return event;
    }

    function runShadowParityProbeDeferred(meta) {
      meta = meta || {};
      if (!shadowParityTelemetry.enabled) return;
      var delay = shadowParityTelemetry.probeDebounceMs;
      shadowParityProbeTimeout.schedule(function () {
        try { runShadowParityProbe(meta); } catch (e) { _warn('runShadowParityProbeDeferred', e); }
      }, delay);
    }

    function collectShadowParityTelemetryReport(opts) {
      opts = opts || {};
      var limit = Math.max(1, Number(opts.limit || 20));
      var events = shadowParityTelemetry.history.slice(-limit);
      var anomalyCounts = {};
      for (var i = 0; i < shadowParityTelemetry.history.length; i++) {
        var ev = shadowParityTelemetry.history[i] || {};
        var anomalies = Array.isArray(ev.anomalies) ? ev.anomalies : [];
        for (var a = 0; a < anomalies.length; a++) {
          var key = String(anomalies[a] || '');
          if (!key) continue;
          anomalyCounts[key] = Number(anomalyCounts[key] || 0) + 1;
        }
      }
      var lastEvent = shadowParityTelemetry.history.length
        ? shadowParityTelemetry.history[shadowParityTelemetry.history.length - 1]
        : null;
      return {
        title: 'Shadow Parity Telemetry v1',
        enabled: !!shadowParityTelemetry.enabled,
        alertsEnabled: !!shadowParityTelemetry.alertsEnabled,
        counters: Object.assign({}, shadowParityTelemetry.counters),
        totalEvents: Number(shadowParityTelemetry.history.length || 0),
        anomalyCounts: anomalyCounts,
        lastEvent: lastEvent,
        events: opts.includeEvents === false ? [] : events
      };
    }

    function clearShadowParityTelemetry() {
      shadowParityTelemetry.history = [];
      shadowParityTelemetry.seq = 0;
      shadowParityTelemetry.counters = {
        probes: 0,
        alerts: 0,
        ok: 0,
        mismatch: 0
      };
      shadowParityTelemetry.lastAlertAt = 0;
      shadowParityTelemetry.lastAlertKey = '';
      return collectShadowParityTelemetryReport({ limit: 1 });
    }

    function setShadowParityTelemetryEnabled(enabled) {
      shadowParityTelemetry.enabled = configBool(enabled, shadowParityTelemetry.enabled);
      return {
        ok: true,
        enabled: !!shadowParityTelemetry.enabled
      };
    }

    function installShadowParityHooks() {
      wrapShadowParityApplyHook(htmlBridge, 'html', runShadowParityProbeDeferred);
      wrapShadowParityApplyHook(cssBridge, 'css', runShadowParityProbeDeferred);
    }

    installShadowParityHooks();
    runShadowParityProbeDeferred({ trigger: 'bootstrap', lane: 'mixed', source: 'bootstrap' });

    var runtimeApi = {
      config: config,
      api: api,
      panel: panel,
      htmlEditor: htmlEditor,
      cssEditor: cssEditor,
      recipes: recipes,
      htmlBridge: htmlBridge,
      cssBridge: cssBridge,
      show: function () {
        panel.show();
        try { panel.refreshEditors(); } catch (eEditors) { _warn('show', eEditors); }
        performManualRefreshWithFallback({
          api: api,
          panel: panel,
          htmlBridge: htmlBridge,
          cssBridge: cssBridge,
          refreshPayload: { reason: 'cm6gpt-show' },
          refreshEditors: false,
          statusOnFallback: 'Panel shown · refresh fallback applied'
        });
      },
      forceBootstrapRecovery: function (reason) {
        var tag = String(reason || 'manual');
        var filterReset = normalizePanelFiltersForRecovery({ force: true });
        performManualRefreshWithFallback({
          api: api,
          panel: panel,
          htmlBridge: htmlBridge,
          cssBridge: cssBridge,
          refreshPayload: { reason: 'cm6gpt-bootstrap-force-' + tag },
          onManualRefreshError: function (err) { pushBootstrapDiag(bootstrapDiag.refreshErrors, err); },
          onHtmlRefreshError: function (err) { pushBootstrapDiag(bootstrapDiag.htmlErrors, err); },
          onCssRefreshError: function (err) { pushBootstrapDiag(bootstrapDiag.cssErrors, err); }
        });
        syncUndoRedoState();
        bootstrapKickTimeout.clear();
        try { maybeKickBootstrap(1); } catch (eKick) { _warn('onCssRefreshError', eKick); }
        var htmlPreview = '';
        var cssPreview = '';
        if (htmlEditor && typeof htmlEditor.getValue === 'function') {
          try { htmlPreview = String(htmlEditor.getValue() || '').slice(0, 200); } catch (e4) { _warn('onCssRefreshError', e4); }
        }
        if (cssEditor && typeof cssEditor.getValue === 'function') {
          try { cssPreview = String(cssEditor.getValue() || '').slice(0, 200); } catch (e5) { _warn('onCssRefreshError', e5); }
        }
        return {
          ok: true,
          reason: tag,
          phase: config.phase || '',
          diag: {
            refreshErrors: bootstrapDiag.refreshErrors.slice(0),
            htmlErrors: bootstrapDiag.htmlErrors.slice(0),
            cssErrors: bootstrapDiag.cssErrors.slice(0),
            seedHits: Number(bootstrapDiag.seedHits || 0),
            filterReset: filterReset
          },
          panelModes: getPanelModesSafe(),
          htmlPreview: htmlPreview,
          cssPreview: cssPreview
        };
      },
      getSelectionAnalysis: function () {
        if (!api || typeof api.getSelectionAnalysis !== 'function') return null;
        return api.getSelectionAnalysis();
      },
      printSelectionAnalysis: function () {
        var analysis = this.getSelectionAnalysis();
        log('Selection analysis', analysis);
        return analysis;
      },
      printSelectionSignals: function () {
        var a = this.getSelectionAnalysis() || {};
        var compact = {
          id: a.id || '',
          stateFound: !!a.stateFound,
          applyGate: a.applyGate || null,
          signals: a.signals || {},
          matchedKeys: a.matchedKeys || [],
          evidence: a.evidence || []
        };
        log('Selection signals', compact);
        return compact;
      },
      inspectHtmlEditor: function () {
        var view = htmlEditor && htmlEditor._view ? htmlEditor._view() : null;
        var out = {
          configReadOnlyHtml: config.readOnlyHtml,
          normalizedReadOnlyHtml: htmlReadOnly,
          configHtmlLiveSync: config.htmlLiveSync,
          normalizedHtmlLiveSync: htmlLiveSync,
          normalizedHtmlLiveSyncGuarded: htmlLiveSyncGuarded,
          normalizedHtmlLiveSyncDebounceMs: htmlLiveSyncDebounceMs,
          configCssLiveSync: config.cssLiveSync,
          normalizedCssLiveSync: cssLiveSync,
          normalizedCssLiveSyncDebounceMs: cssLiveSyncDebounceMs,
          editorFirstMode: editorFirstMode,
          editorFirstLaunchGate: collectEditorFirstLaunchGateReport(),
          editorType: htmlEditor && htmlEditor.type,
          hasView: !!view,
          activeElementTag: document.activeElement ? document.activeElement.tagName : '',
          activeElementInPanel: !!(document.activeElement && panel.root && panel.root.contains(document.activeElement)),
          contentEditable: view && view.contentDOM ? view.contentDOM.contentEditable : null
        };
        log('HTML editor inspect', out);
        return out;
      },
      getWriteSync9Report: function () {
        return collectWriteSync9Report();
      },
      getBuilderCompatibilityReport: function (opts) {
        return refreshBuilderCompatibilityReport(opts) || null;
      },
      printBuilderCompatibilityReport: function (opts) {
        var out = refreshBuilderCompatibilityReport(opts);
        logBuilderCompatibilityReport(out || {}, 'runtime-api');
        return out || null;
      },
      getCompanionDiagnostics: function () {
        return getCompanionDiagnosticsReport();
      },
      printCompanionDiagnostics: function () {
        var out = getCompanionDiagnosticsReport();
        if (out && out.coreFramework) logCompanionDiagnosticsEntry(out.coreFramework, 'runtime-api');
        return out;
      },
      getCompatibilityReport: function () {
        return compatibilityReport ? compatibilityReport : null;
      },
      printCompatibilityReport: function () {
        logCompatibilityReport(compatibilityReport || {}, 'runtime-api');
        return compatibilityReport ? compatibilityReport : null;
      },
      getWriteSyncReport: function () {
        return collectWriteSync9Report();
      },
      printWriteSync9Report: function () {
        var out = collectWriteSync9Report();
        log('Write/Sync 9+ report', out);
        return out;
      },
      getCanonicalSnapshotReport: function (opts) {
        return collectCanonicalSnapshotReport(opts || {});
      },
      getCanonicalStateSnapshotReport: function (opts) {
        return collectCanonicalSnapshotReport(opts || {});
      },
      printCanonicalSnapshotReport: function (opts) {
        var out = collectCanonicalSnapshotReport(opts || {});
        log('Canonical snapshot report', out);
        return out;
      },
      getSafeSubsetCompilerReport: function (opts) {
        return collectSafeSubsetCompilerReport(opts || {});
      },
      printSafeSubsetCompilerReport: function (opts) {
        var out = collectSafeSubsetCompilerReport(opts || {});
        log('Safe subset compiler report', out);
        return out;
      },
      runShadowParityProbe: function (opts) {
        return runShadowParityProbe(opts || {});
      },
      getShadowParityTelemetryReport: function (opts) {
        return collectShadowParityTelemetryReport(opts || {});
      },
      printShadowParityTelemetryReport: function (opts) {
        var out = collectShadowParityTelemetryReport(opts || {});
        log('Shadow parity telemetry report', out);
        return out;
      },
      clearShadowParityTelemetry: function () {
        return clearShadowParityTelemetry();
      },
      setShadowParityTelemetryEnabled: function (enabled) {
        return setShadowParityTelemetryEnabled(enabled);
      },
      getEditorFirstLaunchGateReport: function () {
        return collectEditorFirstLaunchGateReport();
      },
      applyEditorFirstLaunchGate: function (opts) {
        return applyEditorFirstLaunchGate(opts || {});
      },
      setEditorFirstOptIn: function (enabled) {
        var write = writeStoredEditorFirstOptIn(editorFirstStorageKey, enabled);
        if (!write.ok) {
          return {
            ok: false,
            reason: write.reason || 'opt-in-write-failed',
            report: collectEditorFirstLaunchGateReport()
          };
        }
        return {
          ok: true,
          changed: true,
          report: applyEditorFirstLaunchGate()
        };
      },
      clearEditorFirstOptIn: function () {
        var out = clearStoredEditorFirstOptIn(editorFirstStorageKey);
        if (!out.ok) {
          return {
            ok: false,
            reason: out.reason || 'opt-in-clear-failed',
            report: collectEditorFirstLaunchGateReport()
          };
        }
        return {
          ok: true,
          cleared: true,
          report: applyEditorFirstLaunchGate()
        };
      },
      setEditorFirstKillSwitch: function (enabled) {
        editorFirstRuntimeKillSwitch = configBool(enabled, false);
        return {
          ok: true,
          runtimeKillSwitch: !!editorFirstRuntimeKillSwitch,
          report: applyEditorFirstLaunchGate()
        };
      },
      getRecipeCatalog: function (queryOrOpts) {
        if (!recipes) return [];
        if (typeof queryOrOpts === 'string') return recipes.search(queryOrOpts);
        return recipes.list(queryOrOpts || {});
      },
      resolveRecipe: function (alias) {
        if (!recipes) return null;
        return recipes.resolve(alias);
      },
      insertCssRecipe: function (alias, opts) {
        if (!recipes) return { ok: false, reason: 'recipes-unavailable' };
        opts = opts || {};
        var analysis = opts.selectionAnalysis;
        if (!analysis && api && typeof api.getSelectionAnalysis === 'function') {
          analysis = api.getSelectionAnalysis();
        }
        var out = recipes.insertAlias(alias, {
          cssEditor: cssEditor,
          editor: cssEditor,
          selectionAnalysis: analysis,
          selectionStart: opts.selectionStart,
          selectionEnd: opts.selectionEnd,
          addTrailingNewline: opts.addTrailingNewline !== false
        });
        if (out && out.ok && out.inserted) {
          var rid = out.recipe && out.recipe.id ? out.recipe.id : String(alias || '');
          setPanelStatus(panel, 'Recipe inserted: @' + rid, { channel: 'recipe', dedupeMs: 0 });
        }
        return out;
      },
      insertRecipe: function (alias, opts) {
        if (!recipes) return { ok: false, reason: 'recipes-unavailable' };
        opts = opts || {};
        var analysis = opts.selectionAnalysis;
        if (!analysis && api && typeof api.getSelectionAnalysis === 'function') {
          analysis = api.getSelectionAnalysis();
        }
        var out = recipes.insertAlias(alias, {
          cssEditor: cssEditor,
          htmlEditor: htmlEditor,
          editor: cssEditor,
          selectionAnalysis: analysis,
          selectionStart: opts.selectionStart,
          selectionEnd: opts.selectionEnd,
          cssSelectionStart: opts.cssSelectionStart,
          cssSelectionEnd: opts.cssSelectionEnd,
          htmlSelectionStart: opts.htmlSelectionStart,
          htmlSelectionEnd: opts.htmlSelectionEnd,
          addTrailingNewline: opts.addTrailingNewline !== false
        });
        if (out && out.ok && out.inserted) {
          var recipeId = out.recipe && out.recipe.id ? out.recipe.id : String(alias || '');
          var lanes = Array.isArray(out.insertedLanes) && out.insertedLanes.length
            ? (' [' + out.insertedLanes.join('+') + ']')
            : '';
          setPanelStatus(panel, 'Recipe inserted: @' + recipeId + lanes, { channel: 'recipe', dedupeMs: 0 });
        }
        return out;
      },
      importRecipes: function (payload, opts) {
        if (!recipes) return { ok: false, reason: 'recipes-unavailable' };
        return recipes.importRecipes(payload, opts || {});
      },
      exportRecipes: function (opts) {
        if (!recipes) return { version: 1, recipes: [] };
        return recipes.exportRecipes(opts || {});
      },
      upsertRecipe: function (recipe) {
        if (!recipes) return { ok: false, reason: 'recipes-unavailable' };
        return recipes.upsert(recipe);
      },
      removeRecipe: function (identifier) {
        if (!recipes) return { ok: false, reason: 'recipes-unavailable' };
        return recipes.remove(identifier);
      }
    };

    installPanelRuntimeCleanup(panel, {
      exposedGlobal: runtimeApi,
      api: api,
      htmlBridge: htmlBridge,
      cssBridge: cssBridge,
      htmlEditor: htmlEditor,
      cssEditor: cssEditor,
      bootstrapKickTimeout: bootstrapKickTimeout,
      shadowParityProbeTimeout: shadowParityProbeTimeout
    });

    w.__CM6GPT = runtimeApi;

    log('Bootstrapped', {
      phase: config.phase || 'phase1-readonly',
      htmlEditor: htmlEditor.type,
      cssEditor: cssEditor.type,
      readOnlyHtml: htmlReadOnly,
      readOnlyCss: cssReadOnly,
      htmlLiveSync: htmlLiveSync,
      htmlLiveSyncGuarded: htmlLiveSyncGuarded,
      htmlLiveSyncDebounceMs: htmlLiveSyncDebounceMs,
      cssLiveSync: cssLiveSync,
      cssLiveSyncDebounceMs: cssLiveSyncDebounceMs,
      editorFirstMode: editorFirstMode,
      editorFirstLaunchGate: collectEditorFirstLaunchGateReport()
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      waitForBricksReady(150, bootstrap);
    });
  } else {
    waitForBricksReady(150, bootstrap);
  }
})(window);
