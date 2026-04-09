(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});
  var mountedEditors = [];
  var varTooltipRuntime = null;
  var varTooltipUsers = 0;

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][editors]', context, err); } catch (_) { /* noop */ }
  }

  function hasDocumentDom() {
    return (
      typeof document !== 'undefined' &&
      !!document &&
      typeof document.addEventListener === 'function' &&
      typeof document.createElement === 'function' &&
      typeof document.contains === 'function'
    );
  }

  function getBridgeRuntimeUtils() {
    if (
      !ns.BridgeRuntimeUtils
      || typeof ns.BridgeRuntimeUtils.createManagedTimeout !== 'function'
      || typeof ns.BridgeRuntimeUtils.createManagedAnimationFrame !== 'function'
      || typeof ns.BridgeRuntimeUtils.trackListener !== 'function'
      || typeof ns.BridgeRuntimeUtils.drainCleanupQueue !== 'function'
      || typeof ns.BridgeRuntimeUtils.removeDomNode !== 'function'
      || typeof ns.BridgeRuntimeUtils.removeValueFromArray !== 'function'
    ) {
      throw new Error('CM6GPT.BridgeRuntimeUtils lifecycle helpers missing');
    }
    return ns.BridgeRuntimeUtils;
  }

  function removeValueFromArray(list, value) {
    return getBridgeRuntimeUtils().removeValueFromArray(list, value);
  }

  function createManagedTimeout(timerApi) {
    return getBridgeRuntimeUtils().createManagedTimeout(timerApi);
  }

  function createManagedAnimationFrame(frameApi) {
    return getBridgeRuntimeUtils().createManagedAnimationFrame(frameApi);
  }

  function removeDomNode(node) {
    return getBridgeRuntimeUtils().removeDomNode(node, _warn);
  }

  function trackListener(cleanups, target, type, handler, options) {
    return getBridgeRuntimeUtils().trackListener(cleanups, target, type, handler, options);
  }

  function drainCleanupQueue(cleanups, onError) {
    return getBridgeRuntimeUtils().drainCleanupQueue(cleanups, onError);
  }

  function ensureVarTooltipRuntime() {
    if (!hasDocumentDom()) return null;
    if (varTooltipRuntime) return varTooltipRuntime;

    var tip = null;
    var hideTimer = null;
    var lastLi = null;
    var teardowns = [];

    function clearHideTimer() {
      if (!hideTimer) return false;
      clearTimeout(hideTimer);
      hideTimer = null;
      return true;
    }

    function getTip() {
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'cm6gpt-var-float-tooltip';
        (document.body || document.documentElement).appendChild(tip);
      }
      return tip;
    }

    function show(text, anchorRect) {
      var t = getTip();
      t.textContent = text;
      t.style.display = 'block';
      var left = anchorRect.right + 8;
      var top = anchorRect.top;
      if (left + 320 > (window.innerWidth || document.documentElement.clientWidth)) {
        left = anchorRect.left - 328;
        if (left < 4) left = 4;
      }
      t.style.top = top + 'px';
      t.style.left = left + 'px';
      clearHideTimer();
    }

    function hide() {
      lastLi = null;
      clearHideTimer();
      hideTimer = setTimeout(function () {
        hideTimer = null;
        if (tip) tip.style.display = 'none';
      }, 60);
    }

    function onDocumentMouseOver(e) {
      if (!e || !e.target || !e.target.closest) return;
      var li = e.target.closest('.cm-tooltip-autocomplete li');
      if (!li) return;
      if (li === lastLi) {
        clearHideTimer();
        return;
      }
      lastLi = li;
      var wrap = li.querySelector('.cm6gpt-var-swatch-wrap');
      if (!wrap) {
        hide();
        return;
      }
      var val = wrap.dataset.varValue || '';
      if (!val) {
        hide();
        return;
      }
      show(val, li.getBoundingClientRect());
    }

    function onDocumentMouseOut(e) {
      if (!e || !e.target || !e.target.closest) return;
      var li = e.target.closest('.cm-tooltip-autocomplete li');
      if (!li) return;
      var relLi = e.relatedTarget && e.relatedTarget.closest
        ? e.relatedTarget.closest('.cm-tooltip-autocomplete li')
        : null;
      if (relLi) return;
      hide();
    }

    trackListener(teardowns, document, 'mouseover', onDocumentMouseOver, true);
    trackListener(teardowns, document, 'mouseout', onDocumentMouseOut, true);

    varTooltipRuntime = {
      hasTip: function () { return !!tip; },
      destroy: function () {
        clearHideTimer();
        lastLi = null;
        drainCleanupQueue(teardowns, function (err) { _warn('destroyVarTooltipRuntime', err); });
        if (tip) {
          try { tip.style.display = 'none'; } catch (e2) { _warn('destroyVarTooltipRuntime', e2); }
          removeDomNode(tip);
          tip = null;
        }
        varTooltipRuntime = null;
      }
    };
    return varTooltipRuntime;
  }

  function retainVarTooltipRuntime(enabled) {
    if (!enabled) return varTooltipUsers;
    varTooltipUsers += 1;
    ensureVarTooltipRuntime();
    return varTooltipUsers;
  }

  function releaseVarTooltipRuntime(enabled) {
    if (!enabled) return varTooltipUsers;
    varTooltipUsers = Math.max(0, varTooltipUsers - 1);
    if (!varTooltipUsers && varTooltipRuntime && typeof varTooltipRuntime.destroy === 'function') {
      varTooltipRuntime.destroy();
    }
    return varTooltipUsers;
  }

  // W38: Prune destroyed editors from mountedEditors to prevent memory leaks.
  // An editor is considered destroyed if its mount DOM element is no longer in the document.
  function pruneDestroyedEditors() {
    if (!hasDocumentDom()) return;
    for (var i = mountedEditors.length - 1; i >= 0; i--) {
      var ed = mountedEditors[i];
      if (ed && ed._mount && !document.contains(ed._mount)) {
        try {
          if (typeof ed.destroy === 'function') {
            ed.destroy();
          } else if (typeof ed._view === 'function') {
            var liveView = ed._view();
            if (liveView && typeof liveView.destroy === 'function') liveView.destroy();
          }
        } catch (e) { _warn('pruneDestroyedEditors', e); }
        removeValueFromArray(mountedEditors, ed);
      }
    }
  }
  var DEFAULT_THEME_NAME = 'github-dark';
  var EDITOR_THEME_PRESETS = {
    'github-neon': {
      ui: {
        bg: '#0b1220',
        fg: '#e6edf3',
        content: '#f8fbff',
        cursor: '#58a6ff',
        gutterBg: '#090f1a',
        gutterFg: '#8da2b8',
        gutterActive: '#e6edf3',
        activeLine: 'rgba(255, 255, 255, 0.045)',
        selection: 'rgba(88, 166, 255, 0.28)'
      },
      syntax: {
        comment: '#8b949e',
        keyword: '#ff7bff',
        string: '#7ee7ff',
        number: '#ffb86b',
        regex: '#7ee787',
        tag: '#7ee787',
        attrName: '#ffd866',
        attrValue: '#7ee7ff',
        property: '#79c0ff',
        type: '#d2a8ff',
        variable: '#f0f6fc',
        namespace: '#79c0ff',
        punctuation: '#c9d1d9',
        meta: '#ff9bf6',
        invalid: '#f85149',
        operator: '#ff9e64',
        function: '#4dd0e1',
        constant: '#ffa657'
      }
    },
    'github-dark': {
      ui: {
        bg: '#161b22',
        fg: '#c9d1d9',
        content: '#e6edf3',
        cursor: '#58a6ff',
        gutterBg: '#10151c',
        gutterFg: '#9aa7b4',
        gutterActive: '#e6edf3',
        activeLine: 'rgba(240, 246, 252, 0.055)',
        selection: 'rgba(56, 139, 253, 0.30)'
      },
      syntax: {
        comment: '#8b949e',
        keyword: '#ff7b72',
        string: '#a5d6ff',
        number: '#ffa657',
        regex: '#7ee787',
        tag: '#7ee787',
        attrName: '#ffd866',
        attrValue: '#a5d6ff',
        property: '#79c0ff',
        type: '#d2a8ff',
        variable: '#e6edf3',
        namespace: '#79c0ff',
        punctuation: '#c9d1d9',
        meta: '#d2a8ff',
        invalid: '#f85149',
        operator: '#ffa657',
        function: '#79c0ff',
        constant: '#ffa657'
      }
    }
  };

  function cloneArray(arr) {
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function isUndoShortcut(eventLike) {
    if (!eventLike) return false;
    var key = String(eventLike.key || '').toLowerCase();
    if (key !== 'z') return false;
    if (!!eventLike.altKey) return false;
    return !!(eventLike.ctrlKey || eventLike.metaKey) && !eventLike.shiftKey;
  }

  function isRedoShortcut(eventLike) {
    if (!eventLike) return false;
    var key = String(eventLike.key || '').toLowerCase();
    if (eventLike.altKey) return false;
    if ((eventLike.ctrlKey || eventLike.metaKey) && eventLike.shiftKey && key === 'z') return true;
    return !!eventLike.ctrlKey && !eventLike.metaKey && !eventLike.shiftKey && key === 'y';
  }

  function pickDefined(arr) {
    return cloneArray(arr).filter(function (x) { return !!x; });
  }

  function makeRule(tagsOrTag, styles) {
    var tagsList = Array.isArray(tagsOrTag) ? pickDefined(tagsOrTag) : pickDefined([tagsOrTag]);
    if (!tagsList.length) return null;
    var out = { tag: tagsList.length === 1 ? tagsList[0] : tagsList };
    Object.keys(styles || {}).forEach(function (k) {
      out[k] = styles[k];
    });
    return out;
  }

  function resolveThemePreset(name) {
    if (name && EDITOR_THEME_PRESETS[name]) return EDITOR_THEME_PRESETS[name];
    return EDITOR_THEME_PRESETS[DEFAULT_THEME_NAME];
  }

  function getConfiguredThemeName() {
    var cfg = w.CM6GPT_Lite_Config || w.CM6GPT_Config || {};
    if (cfg && typeof cfg.editorTheme === 'string' && cfg.editorTheme) {
      return cfg.editorTheme;
    }
    return DEFAULT_THEME_NAME;
  }

  function buildSyntaxThemeExtension(C, preset) {
    if (!C || !C.HighlightStyle || !C.syntaxHighlighting || !C.tags || !preset || !preset.syntax) {
      return [];
    }

    var t = C.tags;
    var s = preset.syntax;
    var special = typeof t.special === 'function' ? t.special : null;

    var tagNameVariants = [t.tagName];
    if (special) {
      try { tagNameVariants.push(special(t.tagName)); } catch (e) { _warn('buildSyntaxThemeExtension', e); }
    }

    var attributeNameVariants = [t.attributeName];
    if (special) {
      try { attributeNameVariants.push(special(t.attributeName)); } catch (e) { _warn('buildSyntaxThemeExtension', e); }
    }

    var rules = [
      makeRule([t.comment, t.lineComment, t.blockComment, t.docComment], { color: s.comment, fontStyle: 'italic' }),
      makeRule([t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier], { color: s.keyword }),
      makeRule([t.string, t.docString, t.character, t.attributeValue, t.url], { color: s.string }),
      makeRule([t.number, t.integer, t.float, t.bool, t.null, t.atom, t.unit, t.literal], { color: s.number }),
      makeRule([t.regexp, t.escape], { color: s.regex }),
      makeRule(tagNameVariants, { color: s.tag }),
      makeRule(attributeNameVariants, { color: s.attrName }),
      makeRule([t.propertyName], { color: s.property }),
      makeRule([t.typeName, t.className], { color: s.type }),
      makeRule([t.variableName, t.name, t.local], { color: s.variable }),
      makeRule([t.namespace, t.labelName], { color: s.namespace }),
      makeRule([t.function, t.macroName], { color: s.function }),
      makeRule([t.constant, t.standard], { color: s.constant }),
      makeRule([t.operator, t.logicOperator, t.arithmeticOperator, t.compareOperator, t.bitwiseOperator, t.definitionOperator, t.updateOperator, t.typeOperator, t.controlOperator, t.derefOperator], { color: s.operator }),
      makeRule([t.punctuation, t.separator, t.bracket, t.paren, t.squareBracket, t.angleBracket, t.brace, t.contentSeparator], { color: s.punctuation }),
      makeRule([t.meta, t.documentMeta, t.processingInstruction, t.annotation], { color: s.meta }),
      makeRule([t.invalid], { color: s.invalid, textDecoration: 'underline' })
    ].filter(Boolean);

    if (!rules.length) return [];

    return [C.syntaxHighlighting(C.HighlightStyle.define(rules))];
  }

  function normalizeRecipeAliasToken(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    if (!s) return '';
    if (s.charAt(0) === '@') s = s.slice(1);
    s = s.replace(/\s+/g, '-');
    return s.replace(/[^a-z0-9._:-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function getRecipePrimaryAlias(recipe) {
    if (!recipe || typeof recipe !== 'object') return '';
    var aliases = Array.isArray(recipe.aliases) ? recipe.aliases : [];
    var raw = aliases.length ? aliases[0] : (recipe.id || '');
    return normalizeRecipeAliasToken(raw);
  }

  function recipeMatchBefore(context) {
    if (!context) return null;
    if (typeof context.matchBefore === 'function') {
      return context.matchBefore(/@[\w.:-]*/);
    }
    return null;
  }

  function formatBlockedContexts(gate) {
    if (!gate || typeof gate !== 'object') return '';
    if (Array.isArray(gate.blockedReasons) && gate.blockedReasons.length) {
      return gate.blockedReasons.map(function (line) { return String(line || '').trim(); }).filter(Boolean).join(' | ');
    }
    if (!Array.isArray(gate.blockedContexts) || !gate.blockedContexts.length) return '';
    return gate.blockedContexts.join(', ');
  }

  function buildRecipeTargetHint(analysis) {
    if (!analysis || typeof analysis !== 'object') return 'selected context';
    var mode = String(analysis.mode || '').toLowerCase();
    if (mode === 'page') return 'page scope (full page snapshot)';

    var id = String(analysis.id || '').trim();
    var signals = analysis && typeof analysis.signals === 'object' ? analysis.signals : {};
    var flags = [];
    if (signals.component) flags.push('component');
    if (signals.slot) flags.push('slot');
    if (signals.variant) flags.push('variant');
    if (signals.queryLoop) flags.push('query-loop');
    if (signals.dynamicData) flags.push('dynamic');
    if (signals.schema) flags.push('schema');
    if (signals.conditions) flags.push('conditions');
    if (signals.wpml) flags.push('wpml');

    var target = id ? ('element #' + id) : 'selected element';
    if (flags.length) target += ' · signals: ' + flags.join('+');
    return target;
  }

  function buildRecipeInfoText(recipe, alias, gate, analysis) {
    var label = '@' + String(alias || '');
    var category = String((recipe && recipe.category) || '').trim();
    var blockedText = formatBlockedContexts(gate);
    if (gate && gate.ok === false) {
      return label + ' · blocked' + (blockedText ? (' · ' + blockedText) : '');
    }
    if (category) return label + ' · ' + category;
    return label + ' · ' + buildRecipeTargetHint(analysis);
  }

  function buildRecipeInfoNode(text) {
    var value = String(text || '').trim();
    var node = document.createElement('div');
    node.className = 'cm6gpt-recipe-info';
    node.style.whiteSpace = 'normal';
    node.style.maxWidth = '18rem';
    node.style.lineHeight = '1.3';
    node.textContent = value;
    return node;
  }

  function createRecipeCompletionSource(config) {
    config = config || {};
    var manager = config.manager || null;
    var getSelectionAnalysis = typeof config.getSelectionAnalysis === 'function'
      ? config.getSelectionAnalysis
      : null;
    var onStatus = typeof config.onStatus === 'function'
      ? config.onStatus
      : null;
    var onPreview = typeof config.onPreview === 'function'
      ? config.onPreview
      : null;
    var onPreviewClear = typeof config.onPreviewClear === 'function'
      ? config.onPreviewClear
      : null;
    var maxOptions = Math.max(1, Number(config.maxOptions || 30));
    var lastPreviewKey = '';

    if (!manager || typeof manager.list !== 'function' || typeof manager.resolve !== 'function') {
      return null;
    }

    function getCurrentAnalysis() {
      if (!getSelectionAnalysis) return null;
      try { return getSelectionAnalysis(); } catch (e) { _warn('getCurrentAnalysis', e);  return null; }
    }

    function canUseRecipe(recipe) {
      if (!manager || typeof manager.canUseInAnalysis !== 'function') return { ok: true, blockedContexts: [] };
      try {
        return manager.canUseInAnalysis(recipe, getCurrentAnalysis()) || { ok: true, blockedContexts: [] };
      } catch (e) {
        return { ok: true, blockedContexts: [] };
      }
    }

    function emitStatus(message) {
      if (!onStatus || !message) return;
      try { onStatus(String(message)); } catch (e) { _warn('emitStatus', e); }
    }

    function clearPreview() {
      if (!onPreviewClear) return;
      if (!lastPreviewKey) return;
      lastPreviewKey = '';
      try { onPreviewClear(); } catch (e) { _warn('clearPreview', e); }
    }

    function emitPreview(recipe, alias, gate, analysis) {
      if (!onPreview) return;
      var recipeId = recipe && recipe.id ? String(recipe.id) : String(alias || '');
      var blocked = !!(gate && gate.ok === false);
      var blockedContexts = gate && Array.isArray(gate.blockedContexts) ? gate.blockedContexts.slice(0) : [];
      var key = recipeId + '|' + (analysis && analysis.mode ? String(analysis.mode) : 'none') + '|' + (analysis && analysis.id ? String(analysis.id) : '');
      if (blocked && blockedContexts.length) key += '|' + blockedContexts.join(',');
      if (key === lastPreviewKey) return;
      lastPreviewKey = key;
      try {
        onPreview({
          alias: String(alias || ''),
          recipeId: recipeId,
          recipe: recipe || null,
          blocked: blocked,
          blockedContexts: blockedContexts,
          analysis: analysis || null,
          targetHint: buildRecipeTargetHint(analysis)
        });
      } catch (e) { _warn('emitPreview', e); }
    }

    return function recipeAutocompleteSource(context) {
      var match = recipeMatchBefore(context);
      if (!match) {
        clearPreview();
        return null;
      }
      if (match.from === match.to && !context.explicit) {
        clearPreview();
        return null;
      }

      var doc = context && context.state && context.state.doc ? context.state.doc : null;
      if (doc && typeof doc.sliceString === 'function' && match.from > 0) {
        var prev = '';
        try { prev = String(doc.sliceString(match.from - 1, match.from) || ''); } catch (e) { _warn('recipeAutocompleteSource', e);  prev = ''; }
        if (/[a-z0-9_.:-]/i.test(prev)) {
          clearPreview();
          return null;
        }
      }

      var raw = String(match.text || '');
      var query = normalizeRecipeAliasToken(raw);
      var listed = [];
      try {
        listed = query && typeof manager.search === 'function'
          ? manager.search(query, { types: ['css-snippet'] })
          : manager.list({ types: ['css-snippet'] });
      } catch (e2) { _warn('recipeAutocompleteSource', e2); 
        listed = [];
      }
      if (!Array.isArray(listed) || !listed.length) {
        clearPreview();
        return null;
      }
      var analysis = getCurrentAnalysis();

      var options = [];
      for (var i = 0; i < listed.length; i++) {
        if (options.length >= maxOptions) break;
        var recipe = listed[i];
        var alias = getRecipePrimaryAlias(recipe);
        if (!alias) continue;
        var label = '@' + alias;
        var gate = canUseRecipe(recipe);
        var blocked = !!(gate && gate.ok === false);
        var blockedLabel = formatBlockedContexts(gate);

        options.push({
          label: label,
          type: 'keyword',
          detail: blocked ? 'blocked' : '',
          info: (function (infoText, previewRecipe, recipeAlias, previewGate, previewAnalysis) {
            return function (_completion) {
              emitPreview(previewRecipe, recipeAlias, previewGate, previewAnalysis);
              return buildRecipeInfoNode(infoText);
            };
          })(buildRecipeInfoText(recipe, alias, gate, analysis), recipe, alias, gate, analysis),
          apply: (function (recipeAlias, recipeId, isBlocked, blockedText) {
            return function (view, _completion, from, to) {
              if (!manager || typeof manager.resolve !== 'function') return;
              var liveRecipe = null;
              try { liveRecipe = manager.resolve(recipeAlias); } catch (e3) { _warn('recipeAutocompleteSource', e3);  liveRecipe = null; }
              if (!liveRecipe) return;
              var liveType = String(liveRecipe.type || 'css-snippet').toLowerCase();
              var insertText = '';
              if (liveType === 'css-snippet') {
                insertText = String(liveRecipe.body || '');
              } else if (liveType === 'compound') {
                var compoundBody = (liveRecipe && liveRecipe.body && typeof liveRecipe.body === 'object')
                  ? liveRecipe.body
                  : {};
                insertText = String(compoundBody.css || '');
              } else {
                insertText = '';
              }
              if (!insertText) {
                emitStatus('Recipe blocked: @' + recipeAlias + ' (no CSS lane)');
                clearPreview();
                return;
              }

              var liveGate = canUseRecipe(liveRecipe);
              if (isBlocked || (liveGate && liveGate.ok === false)) {
                var blockedNow = formatBlockedContexts(liveGate) || blockedText || 'blocked context';
                emitStatus('Recipe blocked: @' + recipeAlias + ' (' + blockedNow + ')');
                clearPreview();
                return;
              }

              if (!/\n$/.test(insertText)) insertText += '\n';
              try {
                view.dispatch({
                  changes: { from: from, to: to, insert: insertText },
                  selection: { anchor: from + insertText.length }
                });
                emitStatus('Recipe inserted: @' + (recipeId || recipeAlias));
                clearPreview();
              } catch (e4) { _warn('recipeAutocompleteSource', e4); }
            };
          })(alias, String(recipe.id || alias), blocked, blockedLabel)
        });
      }

      if (!options.length) {
        clearPreview();
        return null;
      }
      return {
        from: match.from,
        to: match.to,
        options: options,
        validFor: /^@[\w.:-]*$/
      };
    };
  }

  var CSS_FALLBACK_PROPERTY_LIST = [
    'align-content',
    'align-items',
    'align-self',
    'animation',
    'background',
    'background-color',
    'border',
    'border-radius',
    'bottom',
    'box-shadow',
    'color',
    'cursor',
    'display',
    'filter',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-grow',
    'flex-shrink',
    'font',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'gap',
    'grid',
    'grid-template-columns',
    'height',
    'justify-content',
    'left',
    'letter-spacing',
    'line-height',
    'margin',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'margin-top',
    'max-width',
    'min-height',
    'min-width',
    'opacity',
    'overflow',
    'padding',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'position',
    'right',
    'text-align',
    'text-decoration',
    'text-transform',
    'top',
    'transform',
    'transition',
    'visibility',
    'white-space',
    'width',
    'z-index'
  ];

  // F02: CSS property → common value suggestions
  var CSS_PROPERTY_VALUES = {
    'display': ['flex', 'grid', 'block', 'inline-block', 'inline-flex', 'none', 'contents', 'inline', 'table'],
    'position': ['relative', 'absolute', 'fixed', 'sticky', 'static'],
    'overflow': ['hidden', 'auto', 'scroll', 'visible', 'clip'],
    'overflow-x': ['hidden', 'auto', 'scroll', 'visible', 'clip'],
    'overflow-y': ['hidden', 'auto', 'scroll', 'visible', 'clip'],
    'flex-direction': ['row', 'column', 'row-reverse', 'column-reverse'],
    'justify-content': ['center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch'],
    'align-items': ['center', 'flex-start', 'flex-end', 'stretch', 'baseline'],
    'align-content': ['center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'stretch'],
    'align-self': ['auto', 'center', 'flex-start', 'flex-end', 'stretch', 'baseline'],
    'text-align': ['left', 'center', 'right', 'justify'],
    'cursor': ['pointer', 'default', 'grab', 'grabbing', 'not-allowed', 'text', 'move', 'crosshair', 'none'],
    'pointer-events': ['none', 'auto', 'all'],
    'visibility': ['visible', 'hidden', 'collapse'],
    'flex-wrap': ['wrap', 'nowrap', 'wrap-reverse'],
    'white-space': ['nowrap', 'normal', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
    'object-fit': ['cover', 'contain', 'fill', 'none', 'scale-down'],
    'text-transform': ['uppercase', 'lowercase', 'capitalize', 'none'],
    'text-decoration': ['none', 'underline', 'line-through', 'overline'],
    'font-weight': ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal', 'lighter', 'bolder'],
    'font-style': ['normal', 'italic', 'oblique'],
    'flex': ['1', '0', 'auto', 'none', '1 1 auto', '0 0 auto', '1 0 0'],
    'flex-grow': ['0', '1'],
    'flex-shrink': ['0', '1'],
    'flex-basis': ['auto', '0', '100%'],
    'opacity': ['0', '0.5', '1'],
    'z-index': ['auto', '0', '1', '10', '100', '999', '9999']
  };

  function normalizeCssVariableName(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (raw.indexOf('var(') === 0) {
      var varMatch = /var\(\s*(--[a-zA-Z0-9_-]+)/.exec(raw);
      raw = varMatch && varMatch[1] ? varMatch[1] : raw;
    }
    if (raw.indexOf('--') !== 0) raw = '--' + raw;
    raw = raw.toLowerCase();
    raw = '--' + raw.slice(2).replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return raw === '--' ? '' : raw;
  }

  function collectCssVariableNames(input) {
    var out = [];
    var seen = {};
    var list = Array.isArray(input) ? input : [];
    for (var i = 0; i < list.length; i++) {
      var normalized = normalizeCssVariableName(list[i]);
      if (!normalized || seen[normalized]) continue;
      seen[normalized] = true;
      out.push(normalized);
    }
    return out;
  }

  // ── Variable value map: { '--primary-10': '#1a2b3c', ... } ──
  function buildCssVariableValueMap(fullVars) {
    var map = Object.create(null);
    if (!Array.isArray(fullVars)) return map;
    for (var i = 0; i < fullVars.length; i++) {
      var entry = fullVars[i];
      if (!entry || typeof entry !== 'object') continue;
      var name = normalizeCssVariableName(entry.name);
      if (!name) continue;
      var val = entry.value;
      map[name] = (val == null ? '' : String(val)).trim();
    }
    return map;
  }

  function isColorValue(val) {
    if (!val) return false;
    var v = String(val).trim();
    return /^#([0-9a-f]{3,8})$/i.test(v) ||
           /^rgba?\s*\(/.test(v) ||
           /^hsla?\s*\(/.test(v);
  }

  // Parse CSS property name from the current line at cursor position.
  // E.g. "  background-color: var(--x" -> "background-color"
  function parseCssPropertyAtPos(state, pos) {
    if (!state || !state.doc || typeof state.doc.lineAt !== 'function') return '';
    var line;
    try { line = state.doc.lineAt(pos); } catch (e) { _warn('parseCssPropertyAtPos', e);  return ''; }
    if (!line || typeof line.from !== 'number') return '';
    var text = '';
    try { text = String(state.doc.sliceString(line.from, pos) || ''); } catch (e) { _warn('parseCssPropertyAtPos', e);  return ''; }
    var m = /([a-zA-Z-]+)\s*:\s*[^;]*$/.exec(text);
    return m ? m[1].toLowerCase() : '';
  }

  // Build info DOM node for variable completion tooltip
  function buildVarInfoNode(varName, value) {
    var node = document.createElement('div');
    node.className = 'cm6gpt-var-info';
    if (isColorValue(value)) {
      var swatch = document.createElement('span');
      swatch.className = 'cm6gpt-var-info-swatch';
      swatch.style.backgroundColor = value;
      node.appendChild(swatch);
    }
    var text = document.createElement('span');
    text.textContent = value || '(empty)';
    node.appendChild(text);
    return node;
  }

  function createFallbackCssPropertyCompletionSource(opts) {
    opts = opts || {};
    var maxOptions = 1000;
    var variableNames = collectCssVariableNames(opts.cssVariables || opts.variables || []);
    var varValueMap = opts.variableValueMap || Object.create(null);
    var onVarPreview = typeof opts.onVarPreview === 'function' ? opts.onVarPreview : null;
    var onVarPreviewClear = typeof opts.onVarPreviewClear === 'function' ? opts.onVarPreviewClear : null;
    var lastVarPreviewKey = '';

    function clearVarPreview() {
      if (!onVarPreviewClear || !lastVarPreviewKey) return;
      lastVarPreviewKey = '';
      try { onVarPreviewClear(); } catch (e) { _warn('clearVarPreview', e); }
    }

    function emitVarPreview(varName, cursorState, cursorPos) {
      if (!onVarPreview) return;
      var property = parseCssPropertyAtPos(cursorState, cursorPos);
      var key = varName + '|' + property;
      if (key === lastVarPreviewKey) return;
      lastVarPreviewKey = key;
      try { onVarPreview({ varName: varName, property: property }); } catch (e) { _warn('emitVarPreview', e); }
    }

    return function fallbackCssPropertySource(context) {
      if (!context || !context.state || !context.state.doc || typeof context.matchBefore !== 'function') {
        clearVarPreview();
        return null;
      }
      var match = context.matchBefore(/[a-zA-Z-]*/);
      if (!match) { clearVarPreview(); return null; }
      var query = String(match.text || '').toLowerCase();

      var line = null;
      var linePrefix = '';
      try {
        if (typeof context.state.doc.lineAt === 'function') {
          line = context.state.doc.lineAt(context.pos);
        }
      } catch (e0) { _warn('fallbackCssPropertySource', e0); 
        line = null;
      }
      if (line && typeof line.from === 'number' && typeof context.state.doc.sliceString === 'function') {
        try {
          linePrefix = String(context.state.doc.sliceString(line.from, context.pos) || '');
        } catch (e0a) { _warn('fallbackCssPropertySource', e0a); 
          linePrefix = '';
        }
      }

      if (variableNames.length && linePrefix) {
        var variableQuery = '';
        var variableFrom = context.pos;
        var variableMode = '';

        var inVarFn = /var\(\s*(--[a-zA-Z0-9_-]*)$/i.exec(linePrefix);
        if (inVarFn && typeof inVarFn[1] === 'string') {
          variableMode = 'var-fn';
          variableQuery = String(inVarFn[1] || '').toLowerCase();
          variableFrom = context.pos - inVarFn[1].length;
        } else {
          var bareVar = /(--[a-zA-Z0-9_-]*)$/i.exec(linePrefix);
          if (bareVar && typeof bareVar[1] === 'string') {
            variableMode = 'bare';
            variableQuery = String(bareVar[1] || '').toLowerCase();
            variableFrom = context.pos - bareVar[1].length;
          }
        }

        if (variableMode) {
          var capturedState = context.state;
          var capturedPos = context.pos;
          // F06: Detect if current property only accepts colors
          var currentPropVar = parseCssPropertyAtPos(capturedState, capturedPos);
          var colorOnlyVar = !!(currentPropVar && COLOR_ONLY_PROPERTIES[currentPropVar]);
          var variableOptions = [];
          for (var v = 0; v < variableNames.length; v++) {
            var varName = variableNames[v];
            if (variableQuery && varName.indexOf(variableQuery) !== 0) continue;
            var varVal = varValueMap[varName] || '';
            // F06: Boost color variables when in a color-only property context
            var varBoost = 0;
            if (colorOnlyVar) {
              varBoost = isLikelyColorVariable(varName, varVal) ? 1 : -99;
            }
            variableOptions.push({
              label: varName,
              type: 'variable',
              boost: varBoost,
              _varValue: varVal,
              info: (function (vn, vv, st, ps) {
                return function () {
                  emitVarPreview(vn, st, ps);
                  return buildVarInfoNode(vn, vv);
                };
              })(varName, varVal, capturedState, capturedPos)
            });
            if (variableOptions.length >= maxOptions) break;
          }
          if (variableOptions.length) {
            return {
              from: variableFrom,
              to: context.pos,
              options: variableOptions,
              validFor: /^--[a-zA-Z0-9_-]*$/
            };
          }
        }
      }

      if (line && typeof line.from === 'number' && typeof context.state.doc.sliceString === 'function') {
        try {
          var before = String(context.state.doc.sliceString(line.from, match.from) || '');
          var colonAt = before.lastIndexOf(':');
          var semiAt = before.lastIndexOf(';');
          if (colonAt > semiAt) {
            // F02: We are after a colon — offer property value completions
            // Use a wider match that includes digits for value context (e.g. opacity: 0, z-index: 10)
            clearVarPreview();
            var propName = parseCssPropertyAtPos(context.state, context.pos);
            var valueList = propName ? CSS_PROPERTY_VALUES[propName] : null;
            if (valueList && valueList.length) {
              var valueMatch = context.matchBefore(/[a-zA-Z0-9.%-]*/);
              var valueFrom = valueMatch ? valueMatch.from : context.pos;
              var valueTo = valueMatch ? valueMatch.to : context.pos;
              var valueQuery = valueMatch ? String(valueMatch.text || '').toLowerCase() : '';
              var valueOptions = [];
              for (var vi = 0; vi < valueList.length; vi++) {
                var v = valueList[vi];
                if (valueQuery && v.indexOf(valueQuery) !== 0) continue;
                valueOptions.push({ label: v, type: 'keyword' });
              }
              if (valueOptions.length) {
                return {
                  from: valueFrom,
                  to: valueTo,
                  options: valueOptions,
                  validFor: /^[a-zA-Z0-9 .%_-]*$/
                };
              }
            }
            return null;
          }
        } catch (e1) { _warn('fallbackCssPropertySource', e1); }
      }

      // CSS property name fallback — skip if empty match (no typed prefix) unless explicit
      if (match.from === match.to && !context.explicit) { clearVarPreview(); return null; }
      clearVarPreview();
      var options = [];
      for (var i = 0; i < CSS_FALLBACK_PROPERTY_LIST.length; i++) {
        var prop = CSS_FALLBACK_PROPERTY_LIST[i];
        if (query && prop.indexOf(query) !== 0) continue;
        options.push({
          label: prop,
          type: 'property'
        });
        if (options.length >= maxOptions) break;
      }
      if (!options.length) return null;

      return {
        from: match.from,
        to: match.to,
        options: options,
        validFor: /^[a-zA-Z-]*$/
      };
    };
  }

  function gatherLanguageAutocompleteSources(context) {
    if (!context || !context.state || typeof context.state.languageDataAt !== 'function') return [];
    var data = [];
    try {
      data = context.state.languageDataAt('autocomplete', context.pos) || [];
    } catch (e) { _warn('gatherLanguageAutocompleteSources', e); 
      data = [];
    }
    if (!Array.isArray(data) || !data.length) return [];
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var entry = data[i];
      if (!entry) continue;
      if (typeof entry === 'function') {
        out.push(entry);
        continue;
      }
      if (entry && typeof entry === 'object' && Array.isArray(entry.options)) {
        (function (staticEntry) {
          out.push(function () { return staticEntry; });
        })(entry);
      }
    }
    return out;
  }

  function normalizeCompletionRange(result, context) {
    var pos = context && typeof context.pos === 'number' ? context.pos : 0;
    var from = (result && typeof result.from === 'number') ? result.from : pos;
    var to = (result && typeof result.to === 'number') ? result.to : pos;
    return { from: from, to: to };
  }

  function choosePreferredCompletionResult(results, context) {
    if (!Array.isArray(results) || !results.length) return null;
    if (results.length === 1) return results[0];
    var pos = context && typeof context.pos === 'number' ? context.pos : 0;
    var best = null;
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      if (!item || !Array.isArray(item.options) || !item.options.length) continue;
      var range = normalizeCompletionRange(item, context);
      var score = (range.from * 1000) + Math.min(999, item.options.length);
      if (!best || score > best.score) best = { score: score, result: item };
    }
    return best ? best.result : results[0];
  }

  function mergeCompletionResults(results, context) {
    var clean = [];
    for (var i = 0; i < results.length; i++) {
      var entry = results[i];
      if (!entry || !Array.isArray(entry.options) || !entry.options.length) continue;
      clean.push(entry);
    }
    if (!clean.length) return null;
    if (clean.length === 1) return clean[0];

    var firstRange = normalizeCompletionRange(clean[0], context);
    var sameRange = true;
    for (var j = 1; j < clean.length; j++) {
      var r = normalizeCompletionRange(clean[j], context);
      if (r.from !== firstRange.from || r.to !== firstRange.to) {
        sameRange = false;
        break;
      }
    }
    if (!sameRange) {
      return choosePreferredCompletionResult(clean, context);
    }

    var seen = Object.create(null);
    var merged = [];
    for (var k = 0; k < clean.length; k++) {
      var options = clean[k].options;
      for (var x = 0; x < options.length; x++) {
        var opt = options[x];
        if (!opt || typeof opt !== 'object') continue;
        var key = String(opt.label || '') + '|' + String(opt.type || '') + '|' + String(opt.detail || '');
        if (seen[key]) continue;
        seen[key] = true;
        merged.push(opt);
      }
    }
    if (!merged.length) return null;
    return {
      from: firstRange.from,
      to: firstRange.to,
      options: merged
    };
  }

  // F06: Properties where only color variables are relevant
  var COLOR_ONLY_PROPERTIES = {
    'background-color': true, 'color': true, 'border-color': true,
    'border-top-color': true, 'border-right-color': true,
    'border-bottom-color': true, 'border-left-color': true,
    'outline-color': true, 'text-decoration-color': true,
    'accent-color': true, 'fill': true, 'stroke': true,
    'caret-color': true, 'column-rule-color': true
  };

  // F06: Check if a variable name looks like a color variable by naming convention
  var COLOR_VAR_NAME_PATTERN = /^--(color|bg|text|accent|fill|stroke|border[a-z-]*color)/i;

  function isLikelyColorVariable(varName, varVal) {
    if (varVal && isColorValue(varVal)) return true;
    if (varName && COLOR_VAR_NAME_PATTERN.test(varName)) return true;
    return false;
  }

  // ── $ prefix variable completion: $space-xl -> var(--space-xl) ──
  function createDollarVarCompletionSource(opts) {
    opts = opts || {};
    var variableNames = collectCssVariableNames(opts.cssVariables || []);
    var varValueMap = opts.variableValueMap || Object.create(null);
    var onVarPreview = typeof opts.onVarPreview === 'function' ? opts.onVarPreview : null;
    var onVarPreviewClear = typeof opts.onVarPreviewClear === 'function' ? opts.onVarPreviewClear : null;
    var lastVarPreviewKey = '';
    var maxOptions = 1000;
    if (!variableNames.length) return null;

    function clearVarPreview() {
      if (!onVarPreviewClear || !lastVarPreviewKey) return;
      lastVarPreviewKey = '';
      try { onVarPreviewClear(); } catch (e) { _warn('clearVarPreview', e); }
    }

    function emitVarPreview(varName, cursorState, cursorPos) {
      if (!onVarPreview) return;
      var property = parseCssPropertyAtPos(cursorState, cursorPos);
      var key = varName + '|' + property;
      if (key === lastVarPreviewKey) return;
      lastVarPreviewKey = key;
      try { onVarPreview({ varName: varName, property: property }); } catch (e) { _warn('emitVarPreview', e); }
    }

    return function dollarVarSource(context) {
      if (!context || typeof context.matchBefore !== 'function') { clearVarPreview(); return null; }
      var match = context.matchBefore(/\$[a-zA-Z0-9_-]*/);
      if (!match) { clearVarPreview(); return null; }
      // Must start with $ -- the trigger character
      var raw = String(match.text || '');
      if (raw.charAt(0) !== '$') { clearVarPreview(); return null; }
      var query = raw.slice(1).toLowerCase(); // strip $
      var bareQuery = query ? ('--' + query) : '--';

      var capturedState = context.state;
      var capturedPos = context.pos;
      // F06: Detect if current property only accepts colors
      var currentProp = parseCssPropertyAtPos(capturedState, capturedPos);
      var colorOnly = !!(currentProp && COLOR_ONLY_PROPERTIES[currentProp]);
      var options = [];
      for (var i = 0; i < variableNames.length; i++) {
        var varName = variableNames[i];
        // Match: starts with --query or contains -query anywhere
        if (query && varName.indexOf(bareQuery) !== 0 && varName.indexOf('-' + query) < 0) continue;
        var varVal = varValueMap[varName] || '';
        // F06: Boost color variables when in a color-only property context
        var boost = 0;
        if (colorOnly) {
          boost = isLikelyColorVariable(varName, varVal) ? 1 : -99;
        }
        options.push({
          label: '$' + varName.slice(2), // show as $space-xl
          detail: 'var(' + varName + ')',
          apply: 'var(' + varName + ')',
          type: 'variable',
          boost: boost,
          _varValue: varVal,
          info: (function (vn, vv, st, ps) {
            return function () {
              emitVarPreview(vn, st, ps);
              return buildVarInfoNode(vn, vv);
            };
          })(varName, varVal, capturedState, capturedPos)
        });
        if (options.length >= maxOptions) break;
      }
      if (!options.length) { clearVarPreview(); return null; }

      return {
        from: match.from,
        to: match.to,
        options: options,
        validFor: /^\$[a-zA-Z0-9_-]*$/
      };
    };
  }

  function createCombinedCssCompletionSource(recipeSource, fallbackCssSource, dollarVarSource) {
    return function combinedCssCompletionSource(context) {
      var sources = [];
      if (typeof recipeSource === 'function') sources.push(recipeSource);
      if (typeof dollarVarSource === 'function') sources.push(dollarVarSource);
      var langSources = gatherLanguageAutocompleteSources(context);
      for (var i = 0; i < langSources.length; i++) {
        if (langSources[i] !== combinedCssCompletionSource) sources.push(langSources[i]);
      }
      if (typeof fallbackCssSource === 'function') sources.push(fallbackCssSource);
      if (!sources.length) return null;

      var syncResults = [];
      var pending = [];
      for (var j = 0; j < sources.length; j++) {
        var source = sources[j];
        if (typeof source !== 'function') continue;
        try {
          var out = source(context);
          if (out && typeof out.then === 'function') {
            pending.push(out.catch(function () { return null; }));
          } else {
            syncResults.push(out || null);
          }
        } catch (e) { _warn('combinedCssCompletionSource', e); }
      }

      if (!pending.length) {
        return mergeCompletionResults(syncResults, context);
      }
      return Promise.all(pending).then(function (asyncResults) {
        var mergedInputs = syncResults.concat(asyncResults || []);
        return mergeCompletionResults(mergedInputs, context);
      });
    };
  }

  function buildRecipeAutocompleteExtension(C, opts) {
    if (!opts || opts.language !== 'css') return null;
    if (!C || typeof C.autocompletion !== 'function') return null;

    var recipeCfg = opts.recipes || null;
    var source = createRecipeCompletionSource({
      manager: recipeCfg && recipeCfg.manager,
      getSelectionAnalysis: recipeCfg && recipeCfg.getSelectionAnalysis,
      onStatus: recipeCfg && recipeCfg.onStatus,
      onPreview: recipeCfg && recipeCfg.onPreview,
      onPreviewClear: recipeCfg && recipeCfg.onPreviewClear,
      maxOptions: recipeCfg && recipeCfg.maxOptions
    });
    var cssVariables = recipeCfg && recipeCfg.cssVariables;
    var cssVariablesFull = recipeCfg && recipeCfg.cssVariablesFull;
    var varValueMap = buildCssVariableValueMap(cssVariablesFull || []);
    var onVarPreview = recipeCfg && typeof recipeCfg.onVarPreview === 'function' ? recipeCfg.onVarPreview : null;
    var onVarPreviewClear = recipeCfg && typeof recipeCfg.onVarPreviewClear === 'function' ? recipeCfg.onVarPreviewClear : null;

    var fallbackCssSource = createFallbackCssPropertyCompletionSource({
      maxOptions: recipeCfg && recipeCfg.fallbackCssMaxOptions,
      cssVariables: cssVariables,
      variableValueMap: varValueMap,
      onVarPreview: onVarPreview,
      onVarPreviewClear: onVarPreviewClear
    });
    var dollarVar = createDollarVarCompletionSource({
      cssVariables: cssVariables,
      maxOptions: recipeCfg && recipeCfg.fallbackCssMaxOptions,
      variableValueMap: varValueMap,
      onVarPreview: onVarPreview,
      onVarPreviewClear: onVarPreviewClear
    });
    var combinedSource = createCombinedCssCompletionSource(source, fallbackCssSource, dollarVar);

    // F03: Parse a CSS value string to approximate pixel width for the bar preview
    function parseToPixels(val) {
      var m = /^(-?\d+\.?\d*)\s*(px|rem|em|%|vw|vh|dvh|svh|lvh|ch|pt)?$/i.exec(String(val || '').trim());
      if (!m) return -1;
      var num = parseFloat(m[1]);
      if (isNaN(num) || num < 0) return -1;
      var unit = String(m[2] || 'px').toLowerCase();
      if (unit === 'rem' || unit === 'em') return num * 16;
      if (unit === 'pt') return num * (4 / 3);
      if (unit === 'px') return num;
      if (unit === 'ch' || unit === 'ex') return num * 8; // approximate: 1ch ≈ 8px
      if (unit === '%' || unit === 'vw' || unit === 'vh' || unit === 'dvh' || unit === 'svh' || unit === 'lvh') return num * 0.6;
      return -1;
    }

    // addToOptions: render color swatch / size bar + value for variable completion items
    var addToOptions = [{
      render: function (completion) {
        if (!completion || completion.type !== 'variable') return null;
        var val = completion._varValue || '';
        if (!val) return null;
        var wrap = document.createElement('span');
        wrap.className = 'cm6gpt-var-swatch-wrap';
        wrap.dataset.varValue = val;
        if (isColorValue(val)) {
          var swatch = document.createElement('span');
          swatch.className = 'cm6gpt-var-swatch';
          swatch.style.backgroundColor = val;
          wrap.appendChild(swatch);
        } else {
          // F03: Render proportional bar for numeric (spacing/size) values
          var px = parseToPixels(val);
          if (px >= 0) {
            var barWidth = Math.max(2, Math.min(px, 60));
            var bar = document.createElement('span');
            bar.className = 'cm6gpt-var-bar';
            bar.style.width = barWidth + 'px';
            wrap.appendChild(bar);
          }
        }
        // F14: Store variable data for hover preview delegation
        wrap.dataset.varName = String(completion.label || '');
        var valSpan = document.createElement('span');
        valSpan.className = 'cm6gpt-var-val';
        valSpan.textContent = val;
        wrap.appendChild(valSpan);
        return wrap;
      },
      position: 60
    }];

    var autocompletionExt = C.autocompletion({
      override: [combinedSource],
      activateOnTyping: true,
      icons: false,
      addToOptions: addToOptions
    });

    // F14: Variable canvas preview on mouse hover over autocomplete list items
    var varHoverDebounce = createManagedTimeout();
    var _varHoveredName = '';
    var _varPreviewActive = false;
    var varHoverExt = null;

    function clearHoveredVarPreview(emitClear) {
      _varHoveredName = '';
      var hadPendingPreview = varHoverDebounce.clear();
      if (!emitClear || !onVarPreviewClear || (!_varPreviewActive && !hadPendingPreview)) return false;
      _varPreviewActive = false;
      try { onVarPreviewClear(); } catch (e0) { _warn('clearHoveredVarPreview', e0); }
      return true;
    }

    if (C.EditorView && typeof C.EditorView.domEventHandlers === 'function' && onVarPreview) {
      varHoverExt = C.EditorView.domEventHandlers({
        mouseover: function (e, view) {
          if (!e || !e.target || !onVarPreview) return false;
          var li = e.target.closest ? e.target.closest('.cm-tooltip-autocomplete li') : null;
          if (!li) return false;
          var swatchWrap = li.querySelector('.cm6gpt-var-swatch-wrap[data-var-name]');
          if (!swatchWrap) return false;
          var varName = swatchWrap.dataset.varName || '';
          if (!varName || varName === _varHoveredName) return false;
          _varHoveredName = varName;
          var capturedName = varName;
          varHoverDebounce.schedule(function () {
            if (_varHoveredName !== capturedName) return;
            var property = '';
            try { property = parseCssPropertyAtPos(view.state, view.state.selection.main.head); } catch (e0) { _warn('mouseover', e0); }
            // Normalize: $var-name -> --var-name for the preview callback
            var previewVarName = capturedName;
            if (previewVarName.charAt(0) === '$') previewVarName = '--' + previewVarName.slice(1);
            if (previewVarName.indexOf('--') !== 0) previewVarName = '--' + previewVarName;
            _varPreviewActive = true;
            try { onVarPreview({ varName: previewVarName, property: property }); } catch (e1) { _warn('mouseover', e1); }
          }, 30);
          return false; // don't consume the event
        },
        mouseout: function (e) {
          if (!e || !onVarPreviewClear) return false;
          var li = e.target && e.target.closest ? e.target.closest('.cm-tooltip-autocomplete li') : null;
          var relLi = e.relatedTarget && e.relatedTarget.closest
            ? e.relatedTarget.closest('.cm-tooltip-autocomplete li')
            : null;
          // Only clear if leaving the list or moving to a different item
          if (li && relLi && li === relLi) return false;
          if (!li && !relLi) return false; // not in autocomplete area
          clearHoveredVarPreview(true);
          return false;
        }
      });
    }

    var recipeAutocompleteExt = varHoverExt ? [autocompletionExt, varHoverExt] : autocompletionExt;
    if (recipeAutocompleteExt && (typeof recipeAutocompleteExt === 'object' || typeof recipeAutocompleteExt === 'function')) {
      recipeAutocompleteExt.cm6gptCleanup = function () {
        clearHoveredVarPreview(true);
      };
    }
    return recipeAutocompleteExt;
  }

  function getSelectedCompletionItem(view) {
    if (!view || !view.dom || typeof view.dom.querySelector !== 'function') return null;
    var selected = view.dom.querySelector('.cm-tooltip-autocomplete [aria-selected="true"]')
      || view.dom.querySelector('.cm-tooltip-autocomplete .cm-completionSelected');
    if (!selected) return null;
    if (selected.matches && selected.matches('li, [role="option"]')) return selected;
    return selected.closest ? selected.closest('li, [role="option"]') : selected;
  }

  function acceptSelectedCompletionFromDom(view) {
    var selected = getSelectedCompletionItem(view);
    if (!selected) return false;
    try {
      selected.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: w
      }));
    } catch (e0) { _warn('acceptSelectedCompletionFromDom', e0); }
    try {
      selected.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: w
      }));
    } catch (e1) { _warn('acceptSelectedCompletionFromDom', e1); }
    try {
      if (typeof selected.click === 'function') {
        selected.click();
        return true;
      }
    } catch (e2) { _warn('acceptSelectedCompletionFromDom', e2); }
    return false;
  }

  function createFallbackEditor(opts) {
    var mount = opts.mount;
    var textarea = document.createElement('textarea');
    textarea.className = 'cm6gpt-fallback';
    textarea.spellcheck = false;
    textarea.readOnly = !!opts.readOnly;
    textarea.value = String(opts.initialValue == null ? '' : opts.initialValue);
    mount.innerHTML = '';
    mount.appendChild(textarea);
    var wrapEnabled = opts.softWrap !== false;

    var changeCbs = [];
    var hoverCbs = [];
    var suppress = false;
    var undoStack = [];
    var redoStack = [];
    var historyValue = textarea.value;

    function emitChange(value, source) {
      changeCbs.forEach(function (cb) {
        try { cb(value, { source: source || 'fallback' }); } catch (e) { _warn('emitChange', e); }
      });
    }

    function applyHistoryValue(next, source) {
      suppress = true;
      textarea.value = String(next == null ? '' : next);
      suppress = false;
      historyValue = textarea.value;
      emitChange(historyValue, source || 'history');
    }

    function runUndo() {
      if (!undoStack.length) return false;
      var current = textarea.value;
      var prev = undoStack.pop();
      redoStack.push(current);
      if (redoStack.length > 500) redoStack.shift();
      applyHistoryValue(prev, 'undo');
      return true;
    }

    function runRedo() {
      if (!redoStack.length) return false;
      var current = textarea.value;
      var next = redoStack.pop();
      undoStack.push(current);
      if (undoStack.length > 500) undoStack.shift();
      applyHistoryValue(next, 'redo');
      return true;
    }

    function emitHover(payload) {
      for (var i = 0; i < hoverCbs.length; i++) {
        try { hoverCbs[i](payload || null); } catch (e) { _warn('emitHover', e); }
      }
    }

    function applyFallbackWrap(flag) {
      var on = !!flag;
      textarea.style.whiteSpace = on ? 'pre-wrap' : 'pre';
      textarea.style.overflowX = on ? 'hidden' : 'auto';
      textarea.style.wordBreak = on ? 'break-word' : 'normal';
      textarea.style.overflowWrap = on ? 'anywhere' : 'normal';
    }

    applyFallbackWrap(wrapEnabled);

    textarea.addEventListener('input', function () {
      if (suppress) return;
      var value = textarea.value;
      if (value !== historyValue) {
        undoStack.push(historyValue);
        if (undoStack.length > 500) undoStack.shift();
        redoStack = [];
        historyValue = value;
      }
      emitChange(value, 'fallback');
    });
    textarea.addEventListener('keydown', function (e) {
      if (!e) return;
      if (isUndoShortcut(e)) {
        if (!runUndo()) return;
        try { e.preventDefault(); } catch (e0) { _warn('applyFallbackWrap', e0); }
        try { e.stopImmediatePropagation(); } catch (e1) {
          try { e.stopPropagation(); } catch (e2) { _warn('applyFallbackWrap', e2); }
        }
        return;
      }
      if (isRedoShortcut(e)) {
        if (!runRedo()) return;
        try { e.preventDefault(); } catch (e3) { _warn('applyFallbackWrap', e3); }
        try { e.stopImmediatePropagation(); } catch (e4) {
          try { e.stopPropagation(); } catch (e5) { _warn('applyFallbackWrap', e5); }
        }
      }
    }, true);
    textarea.addEventListener('mouseleave', function () {
      emitHover({ kind: 'leave' });
    });

    var destroyed = false;
    var editor = {
      type: 'fallback-textarea',
      getValue: function () { return textarea.value; },
      setValue: function (value, options) {
        options = options || {};
        var preserveScroll = !!options.preserveScroll;
        var preserveSelection = !!options.preserveSelection;
        var prevScrollTop = preserveScroll ? textarea.scrollTop : 0;
        var prevScrollLeft = preserveScroll ? textarea.scrollLeft : 0;
        var prevSelStart = preserveSelection ? Number(textarea.selectionStart || 0) : 0;
        var prevSelEnd = preserveSelection ? Number(textarea.selectionEnd || 0) : 0;
        suppress = !!options.silent;
        textarea.value = String(value == null ? '' : value);
        suppress = false;
        if (preserveScroll) {
          try {
            textarea.scrollTop = prevScrollTop;
            textarea.scrollLeft = prevScrollLeft;
          } catch (e) { _warn('setValue', e); }
        }
        if (preserveSelection) {
          try {
            var maxLen = textarea.value.length;
            var nextStart = Math.max(0, Math.min(maxLen, prevSelStart));
            var nextEnd = Math.max(0, Math.min(maxLen, prevSelEnd));
            textarea.setSelectionRange(nextStart, nextEnd);
          } catch (e2) { _warn('setValue', e2); }
        }
        historyValue = textarea.value;
        if (options.resetHistory) {
          undoStack = [];
          redoStack = [];
        }
      },
      onChange: function (cb) { if (typeof cb === 'function') changeCbs.push(cb); },
      onHover: function (cb) { if (typeof cb === 'function') hoverCbs.push(cb); },
      setReadOnly: function (flag) { textarea.readOnly = !!flag; },
      setSoftWrap: function (flag) {
        wrapEnabled = !!flag;
        applyFallbackWrap(wrapEnabled);
      },
      undo: runUndo,
      redo: runRedo,
      canUndo: function () { return undoStack.length > 0; },
      canRedo: function () { return redoStack.length > 0; },
      focus: function () { textarea.focus(); },
      refresh: function () {},
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        removeValueFromArray(mountedEditors, editor);
        mount.innerHTML = '';
      },
      _mount: mount
    };

    pruneDestroyedEditors();
    mountedEditors.push(editor);
    return editor;
  }

  function createCM6Editor(opts) {
    var C = w.CodeMirrorBundle || {};
    var EditorState = C.EditorState;
    var EditorView = C.EditorView;
    var basicSetup = C.basicSetup;
    var lang = opts.language === 'css' ? C.css : C.html;
    var Compartment = C.Compartment;
    var themeName = (opts && opts.themeName) || getConfiguredThemeName();
    var themePreset = resolveThemePreset(themeName);
    var ui = themePreset.ui || EDITOR_THEME_PRESETS[DEFAULT_THEME_NAME].ui;

    if (!EditorState || !EditorView || !basicSetup || typeof lang !== 'function') {
      return createFallbackEditor(opts);
    }

    var mount = opts.mount;
    mount.innerHTML = '';

    var suppress = false;
    var changeCbs = [];
    var hoverCbs = [];
    var holder = { view: null };
    var wrapCompartment = (Compartment && EditorView && EditorView.lineWrapping) ? new Compartment() : null;
    var wrapEnabled = opts.softWrap !== false;

    // --- CM6 built-in history: extract undo/redo commands from historyKeymap ---
    var undoCmd = null;
    var redoCmd = null;
    var addToHistoryAnnotation = null;
    if (C.historyKeymap && Array.isArray(C.historyKeymap)) {
      for (var ki = 0; ki < C.historyKeymap.length; ki++) {
        var binding = C.historyKeymap[ki];
        if (!binding) continue;
        if (binding.key === 'Mod-z' && typeof binding.run === 'function' && !undoCmd) {
          undoCmd = binding.run;
        }
        if ((binding.key === 'Mod-y' || binding.key === 'Mod-Shift-z') && typeof binding.run === 'function' && !redoCmd) {
          redoCmd = binding.run;
        }
      }
    }

    var syntaxThemeExt = buildSyntaxThemeExtension(C, themePreset);

    var theme = EditorView.theme({
      '&': {
        height: '100%',
        color: ui.fg,
        backgroundColor: ui.bg,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 'var(--cm6gpt-editor-font-size, 12px)'
      },
      '.cm-scroller': { overflow: 'auto' },
      '.cm-content': {
        caretColor: ui.cursor,
        lineHeight: '1.5',
        color: ui.content
      },
      '.cm-line': {
        color: ui.content
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: ui.cursor },
      '.cm-activeLine': { backgroundColor: ui.activeLine },
      '.cm-selectionBackground': { backgroundColor: ui.selection + ' !important' },
      '.cm-gutters': {
        backgroundColor: ui.gutterBg,
        color: ui.gutterFg,
        border: 'none'
      },
      '.cm-activeLineGutter': {
        color: ui.gutterActive
      }
    }, { dark: true });

    var readOnlyCompartment = Compartment ? new Compartment() : null;
    var editableCompartment = (Compartment && EditorView && EditorView.editable) ? new Compartment() : null;
    var isReadOnly = !!opts.readOnly;
    var readOnlyExt = readOnlyCompartment
      ? readOnlyCompartment.of(EditorState.readOnly.of(isReadOnly))
      : EditorState.readOnly.of(isReadOnly);
    var editableExt = editableCompartment
      ? editableCompartment.of(EditorView.editable.of(!isReadOnly))
      : ((EditorView && EditorView.editable && typeof EditorView.editable.of === 'function')
        ? EditorView.editable.of(!isReadOnly)
        : null);
    var updateExt = EditorView.updateListener.of(function (update) {
      if (!update.docChanged || suppress) return;
      var value = update.state.doc.toString();
      changeCbs.forEach(function (cb) {
        try { cb(value, { source: 'cm6' }); } catch (e) { _warn('createCM6Editor', e); }
      });
    });
    var recipeAutocompleteExt = buildRecipeAutocompleteExtension(C, opts);
    var recipeAutocompleteCleanup = recipeAutocompleteExt && typeof recipeAutocompleteExt.cm6gptCleanup === 'function'
      ? recipeAutocompleteExt.cm6gptCleanup
      : null;
    var hoverFrame = createManagedAnimationFrame(w);
    var hoverPoint = null;
    var lastHoverLineKey = '';
    var captureKeyEvents = ['keydown', 'keypress', 'keyup'];
    var usesVarTooltip = opts.language === 'css';

    function resolveWrapExt(flag) {
      if (!(EditorView && EditorView.lineWrapping)) return [];
      return flag ? [EditorView.lineWrapping] : [];
    }

    var state = EditorState.create({
      doc: String(opts.initialValue || ''),
      extensions: [
        basicSetup,
        lang(),
        syntaxThemeExt,
        theme,
        readOnlyExt,
        editableExt,
        recipeAutocompleteExt,
        wrapCompartment
          ? wrapCompartment.of(resolveWrapExt(wrapEnabled))
          : (wrapEnabled && EditorView.lineWrapping ? EditorView.lineWrapping : null),
        updateExt
      ].filter(Boolean)
    });

    holder.view = new EditorView({
      state: state,
      parent: mount
    });

    // Extract Transaction.addToHistory annotation from the live state
    // so we can mark setValue dispatches as non-history
    try {
      var dummyTx = state.update({});
      if (dummyTx && dummyTx.constructor && dummyTx.constructor.addToHistory) {
        addToHistoryAnnotation = dummyTx.constructor.addToHistory;
      }
    } catch (eAnnotation) { _warn('resolveWrapExt', eAnnotation); }

    function emitHover(payload) {
      for (var i = 0; i < hoverCbs.length; i++) {
        try { hoverCbs[i](payload || null); } catch (e) { _warn('emitHover', e); }
      }
    }

    function flushHover() {
      if (!hoverPoint || !holder.view || typeof holder.view.posAtCoords !== 'function') return;
      var pos = null;
      try {
        pos = holder.view.posAtCoords({ x: hoverPoint.x, y: hoverPoint.y });
      } catch (e) { _warn('flushHover', e); 
        pos = null;
      }
      if (typeof pos !== 'number' || pos < 0) {
        if (lastHoverLineKey) {
          lastHoverLineKey = '';
          emitHover({ kind: 'leave' });
        }
        return;
      }
      var line = null;
      try {
        line = holder.view.state.doc.lineAt(pos);
      } catch (e2) { _warn('flushHover', e2); 
        line = null;
      }
      if (!line) return;
      var text = String(line.text || '');
      var lineKey = String(line.from) + ':' + text;
      if (lineKey === lastHoverLineKey) return;
      lastHoverLineKey = lineKey;
      emitHover({
        kind: 'line',
        lineText: text,
        lineNumber: Number(line.number || 0),
        lineFrom: Number(line.from || 0),
        lineTo: Number(line.to || 0),
        pos: Number(pos || 0),
        clientX: Number(hoverPoint.x || 0),
        clientY: Number(hoverPoint.y || 0)
      });
    }

    function queueHoverFlush(clientX, clientY) {
      hoverPoint = { x: Number(clientX || 0), y: Number(clientY || 0) };
      hoverFrame.schedule(flushHover);
    }

    // --- CM6 built-in history undo/redo ---
    function runUndo() {
      if (!holder.view || !undoCmd) return false;
      return undoCmd(holder.view);
    }

    function runRedo() {
      if (!holder.view || !redoCmd) return false;
      return redoCmd(holder.view);
    }

    // Prevent Bricks builder global shortcuts/handlers from eating keystrokes while typing in CM6.
    // Only block keyboard events (keydown/keypress/keyup) — Bricks intercepts these for shortcuts.
    // Allow beforeinput/input/paste to propagate so CM6 can handle Enter, text input, etc.
    function onMountKeyCapture(e) {
      if (!e) return;
      try { e.stopPropagation(); } catch (err) { _warn('runRedo', err); }
    }

    captureKeyEvents.forEach(function (evtName) {
      mount.addEventListener(evtName, onMountKeyCapture, true);
    });

    function onMountKeydown(e) {
      if (!e) return;
      if (isUndoShortcut(e)) {
        runUndo();
        try { e.preventDefault(); } catch (eUndo0) { _warn('runRedo', eUndo0); }
        try { e.stopImmediatePropagation(); } catch (eUndo1) {
          try { e.stopPropagation(); } catch (eUndo2) { _warn('runRedo', eUndo2); }
        }
        return;
      }
      if (isRedoShortcut(e)) {
        runRedo();
        try { e.preventDefault(); } catch (eRedo0) { _warn('runRedo', eRedo0); }
        try { e.stopImmediatePropagation(); } catch (eRedo1) {
          try { e.stopPropagation(); } catch (eRedo2) { _warn('runRedo', eRedo2); }
        }
        return;
      }
      var key = String(e.key || '');
      if (key !== 'Tab' && key !== 'Enter') return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!acceptSelectedCompletionFromDom(holder.view)) return;
      try { e.preventDefault(); } catch (e0) { _warn('runRedo', e0); }
      try { e.stopImmediatePropagation(); } catch (e1) {
        try { e.stopPropagation(); } catch (e2) { _warn('runRedo', e2); }
      }
    }

    mount.addEventListener('keydown', onMountKeydown, true);

    function onEditorMouseMove(e) {
      if (!e) return;
      queueHoverFlush(e.clientX, e.clientY);
    }

    function onEditorMouseLeave() {
      hoverPoint = null;
      hoverFrame.clear();
      if (!lastHoverLineKey) return;
      lastHoverLineKey = '';
      emitHover({ kind: 'leave' });
    }

    mount.addEventListener('mousemove', onEditorMouseMove, true);
    mount.addEventListener('mouseleave', onEditorMouseLeave, true);

    function mapPosByDiff(oldText, newText, pos) {
      oldText = String(oldText == null ? '' : oldText);
      newText = String(newText == null ? '' : newText);
      pos = Number(pos || 0);

      var oldLen = oldText.length;
      var newLen = newText.length;
      if (oldText === newText) return Math.max(0, Math.min(newLen, pos));

      var prefix = 0;
      var maxPrefix = Math.min(oldLen, newLen);
      while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
        prefix++;
      }

      var suffix = 0;
      var maxSuffix = Math.min(oldLen - prefix, newLen - prefix);
      while (
        suffix < maxSuffix &&
        oldText.charCodeAt(oldLen - 1 - suffix) === newText.charCodeAt(newLen - 1 - suffix)
      ) {
        suffix++;
      }

      var oldMidStart = prefix;
      var oldMidEnd = oldLen - suffix;
      var newMidEnd = newLen - suffix;
      var delta = newMidEnd - oldMidEnd;

      if (pos <= oldMidStart) return pos;
      if (pos >= oldMidEnd) return Math.max(0, Math.min(newLen, pos + delta));

      var oldSpan = Math.max(1, oldMidEnd - oldMidStart);
      var newSpan = Math.max(0, newMidEnd - oldMidStart);
      var rel = (pos - oldMidStart) / oldSpan;
      var mapped = oldMidStart + Math.round(rel * newSpan);
      return Math.max(0, Math.min(newLen, mapped));
    }

    var destroyed = false;
    var editor = {
      type: 'cm6',
      getValue: function () {
        return holder.view ? holder.view.state.doc.toString() : '';
      },
      setValue: function (value, options) {
        if (!holder.view) return;
        options = options || {};
        var next = String(value == null ? '' : value);
        var current = holder.view.state.doc.toString();
        if (next === current) return;
        var preserveScroll = !!options.preserveScroll;
        var preserveSelection = !!options.preserveSelection;
        var scrollTop = 0;
        var scrollLeft = 0;
        var prevSelection = null;
        if (preserveScroll && holder.view.scrollDOM) {
          try {
            scrollTop = holder.view.scrollDOM.scrollTop;
            scrollLeft = holder.view.scrollDOM.scrollLeft;
          } catch (e0) { _warn('setValue', e0); }
        }
        if (preserveSelection) {
          try {
            prevSelection = holder.view.state.selection.main;
          } catch (eSel) { _warn('setValue', eSel); 
            prevSelection = null;
          }
        }
        suppress = !!options.silent;
        try {
          var tx = {
            changes: { from: 0, to: current.length, insert: next }
          };
          if (prevSelection) {
            var maxLen = next.length;
            var oldAnchor = Math.max(0, Math.min(current.length, Number(prevSelection.anchor || 0)));
            var oldHead = Math.max(0, Math.min(current.length, Number(prevSelection.head || 0)));
            var anchor = mapPosByDiff(current, next, oldAnchor);
            var head = mapPosByDiff(current, next, oldHead);
            anchor = Math.max(0, Math.min(maxLen, anchor));
            head = Math.max(0, Math.min(maxLen, head));
            tx.selection = { anchor: anchor, head: head };
          }
          // When silent (context switch), mark as non-history so CM6
          // doesn't record this as an undoable change
          if (options.silent && addToHistoryAnnotation) {
            tx.annotations = addToHistoryAnnotation.of(false);
          }
          holder.view.dispatch(tx);
          if (preserveScroll && holder.view.scrollDOM) {
            try {
              holder.view.scrollDOM.scrollTop = scrollTop;
              holder.view.scrollDOM.scrollLeft = scrollLeft;
            } catch (e1) { _warn('setValue', e1); }
          }
        } finally {
          suppress = false;
        }
      },
      onChange: function (cb) { if (typeof cb === 'function') changeCbs.push(cb); },
      onHover: function (cb) { if (typeof cb === 'function') hoverCbs.push(cb); },
      setReadOnly: function (flag) {
        var next = !!flag;
        if (next === isReadOnly) return;
        isReadOnly = next;
        if (!holder.view) return;
        var effects = [];
        if (readOnlyCompartment) {
          effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(next)));
        }
        if (editableCompartment) {
          effects.push(editableCompartment.reconfigure(EditorView.editable.of(!next)));
        }
        if (effects.length) {
          try { holder.view.dispatch({ effects: effects }); } catch (e) { _warn('setReadOnly', e); }
        }
      },
      setSoftWrap: function (flag) {
        wrapEnabled = !!flag;
        if (!holder.view) return;
        if (wrapCompartment) {
          try {
            holder.view.dispatch({
              effects: wrapCompartment.reconfigure(resolveWrapExt(wrapEnabled))
            });
          } catch (e) { _warn('setSoftWrap', e); }
        } else if (holder.view.scrollDOM) {
          try { holder.view.scrollDOM.style.overflowX = wrapEnabled ? 'hidden' : 'auto'; } catch (e2) { _warn('setSoftWrap', e2); }
        }
      },
      undo: runUndo,
      redo: runRedo,
      canUndo: function () {
        if (!holder.view) return false;
        try {
          var vals = holder.view.state.values;
          for (var vi = 0; vi < vals.length; vi++) {
            var v = vals[vi];
            if (v && v.done && Array.isArray(v.done)) return v.done.length > 0;
          }
        } catch (e) { _warn('canUndo', e); }
        return false;
      },
      canRedo: function () {
        if (!holder.view) return false;
        try {
          var vals = holder.view.state.values;
          for (var vi = 0; vi < vals.length; vi++) {
            var v = vals[vi];
            if (v && v.undone && Array.isArray(v.undone)) return v.undone.length > 0;
          }
        } catch (e) { _warn('canRedo', e); }
        return false;
      },
      focus: function () { if (holder.view) holder.view.focus(); },
      refresh: function () {
        if (!holder.view) return;
        try { holder.view.requestMeasure(); } catch (e) { _warn('refresh', e); }
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        removeValueFromArray(mountedEditors, editor);
        releaseVarTooltipRuntime(usesVarTooltip);
        captureKeyEvents.forEach(function (evtName) {
          mount.removeEventListener(evtName, onMountKeyCapture, true);
        });
        if (recipeAutocompleteCleanup) {
          try { recipeAutocompleteCleanup(); } catch (e0) { _warn('recipeAutocompleteCleanup', e0); }
        }
        mount.removeEventListener('keydown', onMountKeydown, true);
        mount.removeEventListener('mousemove', onEditorMouseMove, true);
        mount.removeEventListener('mouseleave', onEditorMouseLeave, true);
        hoverFrame.clear();
        if (!holder.view) return;
        holder.view.destroy();
        holder.view = null;
      },
      _view: function () { return holder.view; },
      _mount: mount
    };

    pruneDestroyedEditors();
    mountedEditors.push(editor);
    retainVarTooltipRuntime(usesVarTooltip);
    return editor;
  }

  ns.editors = {
    _createRecipeCompletionSourceForTest: createRecipeCompletionSource,
    _createFallbackCssPropertyCompletionSourceForTest: createFallbackCssPropertyCompletionSource,
    _pruneDestroyedEditorsForTest: pruneDestroyedEditors,
    _getMountedEditorCountForTest: function () { return mountedEditors.length; },
    _getVarTooltipUsersForTest: function () { return varTooltipUsers; },
    _hasVarTooltipForTest: function () { return !!(varTooltipRuntime && varTooltipRuntime.hasTip && varTooltipRuntime.hasTip()); },
    getAvailableThemes: function () {
      return Object.keys(EDITOR_THEME_PRESETS);
    },
    create: function (opts) {
      opts = opts || {};
      if (!opts.mount) throw new Error('CM6GPT editor requires mount');
      return createCM6Editor(opts);
    },
    refreshMountedEditors: function () {
      mountedEditors.forEach(function (editor) {
        if (editor && typeof editor.refresh === 'function') {
          try { editor.refresh(); } catch (e) { _warn('refreshMountedEditors', e); }
        }
      });
    },
    setSoftWrapForMounted: function (flag) {
      mountedEditors.forEach(function (editor) {
        if (editor && typeof editor.setSoftWrap === 'function') {
          try { editor.setSoftWrap(!!flag); } catch (e) { _warn('setSoftWrapForMounted', e); }
        }
      });
    }
  };
})(window);
