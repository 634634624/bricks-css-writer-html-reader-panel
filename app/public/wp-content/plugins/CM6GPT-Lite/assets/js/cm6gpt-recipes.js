(function (w) {
  'use strict';

  var ns = (w.CM6GPT = w.CM6GPT || {});
  var STORAGE_VERSION = 1;
  var DEFAULT_STORAGE_KEY = 'cm6gpt:recipes:v1';

  /** @private Log warnings with module prefix. */
  function _warn(context, err) {
    try { console.warn('[CM6GPT][recipes]', context, err); } catch (_) { /* noop */ }
  }

  var DEFAULT_RECIPES = [
    {
      id: 'auto-grid-5',
      type: 'css-snippet',
      aliases: ['auto-grid-5'],
      category: 'layout',
      description: 'Responsive 5-column auto-fit grid with even gaps.',
      body: 'display: grid;\ngrid-template-columns: repeat(5, minmax(0, 1fr));\ngap: 1rem;',
      tags: ['grid', 'layout', 'columns'],
      blockedContexts: []
    },
    {
      id: 'bg-dark',
      type: 'css-snippet',
      aliases: ['bg-dark'],
      category: 'visual',
      description: 'Dark background with high-contrast foreground.',
      body: 'background: #0f172a;\ncolor: #f8fafc;',
      tags: ['background', 'contrast'],
      blockedContexts: []
    },
    {
      id: 'card-review',
      type: 'css-snippet',
      aliases: ['card-review'],
      category: 'component',
      description: 'Balanced card shell for quick content blocks.',
      body: 'padding: 1rem;\nborder-radius: 0.75rem;\nbackground: #111827;\ncolor: #f9fafb;',
      tags: ['card', 'surface'],
      blockedContexts: []
    },
    {
      id: 'schema-review',
      type: 'css-snippet',
      aliases: ['schema-review'],
      category: 'utility',
      description: 'Visual helper style for schema/debug sections.',
      body: 'outline: 1px dashed rgba(59, 130, 246, 0.6);\noutline-offset: 2px;',
      tags: ['schema', 'debug'],
      blockedContexts: ['query-loop']
    },
    {
      id: 'a11y-tabs',
      type: 'css-snippet',
      aliases: ['a11y-tabs'],
      category: 'a11y',
      description: 'Tab focus ring defaults tuned for keyboard navigation.',
      body: 'outline: 2px solid #2563eb;\noutline-offset: 2px;',
      tags: ['a11y', 'focus'],
      blockedContexts: []
    },
    {
      id: 'hover-lift',
      type: 'css-snippet',
      aliases: ['hover-lift'],
      category: 'interaction',
      description: 'Subtle lift animation for hover-capable surfaces.',
      body: 'transition: transform 160ms ease, box-shadow 160ms ease;\nwill-change: transform;\n&:hover { transform: translateY(-2px); }',
      tags: ['hover', 'motion'],
      blockedContexts: []
    },
    {
      id: 'focus-ring',
      type: 'css-snippet',
      aliases: ['focus-ring'],
      category: 'a11y',
      description: 'Consistent focus-visible ring utility.',
      body: '&:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }',
      tags: ['focus', 'a11y'],
      blockedContexts: []
    }
  ];

  var hasOwn = ns.hasOwn || function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toStringSafe(value) {
    return String(value == null ? '' : value);
  }

  function normalizeAlias(value) {
    var s = toStringSafe(value).trim().toLowerCase();
    if (!s) return '';
    if (s.charAt(0) === '@') s = s.slice(1);
    s = s.replace(/\s+/g, '-');
    return s.replace(/[^a-z0-9._:-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function normalizeTag(value) {
    return toStringSafe(value).trim().toLowerCase();
  }

  function normalizePresetKey(value) {
    var raw = normalizeTag(value).replace(/[\s-]+/g, '_');
    if (!raw) return 'shared';
    raw = raw.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return raw || 'shared';
  }

  function defaultPresetLabel(presetKey) {
    var key = normalizePresetKey(presetKey);
    var labels = {
      all: 'All Recipes',
      shared: 'Shared',
      all_classes: 'All Classes',
      css_recipes: 'CSS Recipes',
      css_recipes_part_2: 'CSS Recipes Part 2',
      css_recipes_part_3: 'CSS Recipes Part 3',
      layout: 'Layout',
      extra: 'Extra',
      vertical_affiliate: 'Vertical Affiliate',
      desktop_first: 'Desktop First',
      mobile_first_intrinsic: 'Mobile First Intrinsic',
      qminimal: 'QMinimal',
      qminimal_framework: 'QMinimal-Framework'
    };
    if (hasOwn(labels, key)) return labels[key];
    return key
      .split(/[_\s]+/)
      .filter(Boolean)
      .map(function (part) {
        if (part === 'css') return 'CSS';
        if (part === 'qc') return 'QC';
        if (part === 'btcc') return 'BTCC';
        if (part === 'cm6gpt') return 'CM6GPT';
        if (/^\d+$/.test(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ') || 'Shared';
  }

  function normalizePresetLabel(value, presetKey) {
    var label = toStringSafe(value).trim();
    if (label) return label.replace(/\s+/g, ' ');
    return defaultPresetLabel(presetKey);
  }

  function normalizePresetPolicy(input) {
    var raw = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    var mode = normalizeTag(raw.mode || '');
    var locked = !!raw.locked || mode === 'admin-locked';
    var activePresetKey = normalizePresetKey(raw.activePresetKey || 'all');
    var activePresetLabel = normalizePresetLabel(raw.activePresetLabel || '', activePresetKey);
    var allowedRecipeIds = uniqueStrings(raw.allowedRecipeIds, normalizeAlias);
    var allowedRecipeIdMap = {};
    for (var i = 0; i < allowedRecipeIds.length; i++) {
      allowedRecipeIdMap[allowedRecipeIds[i]] = true;
    }

    var presets = toArray(raw.presets).map(function (entry) {
      if (!entry || typeof entry !== 'object') return null;
      var key = normalizePresetKey(entry.key || entry.preset || '');
      if (!key) return null;
      return {
        key: key,
        label: normalizePresetLabel(entry.label || entry.presetLabel || '', key),
        count: Math.max(0, Number(entry.count || 0) || 0),
        managed: !!entry.managed,
        active: !!entry.active,
        description: toStringSafe(entry.description || '').trim()
      };
    }).filter(Boolean);

    var foundActive = false;
    for (var p = 0; p < presets.length; p++) {
      if (presets[p].key !== activePresetKey) continue;
      presets[p].active = true;
      activePresetLabel = presets[p].label || activePresetLabel;
      foundActive = true;
    }

    if (locked && !foundActive) {
      presets.unshift({
        key: activePresetKey,
        label: activePresetLabel,
        count: activePresetKey === 'all' ? 0 : allowedRecipeIds.length,
        managed: true,
        active: true,
        description: ''
      });
    }

    return {
      mode: locked ? (mode || 'admin-locked') : '',
      locked: locked,
      activePresetKey: activePresetKey || 'all',
      activePresetLabel: activePresetLabel,
      allowedRecipeIds: allowedRecipeIds,
      allowedRecipeIdMap: allowedRecipeIdMap,
      presets: presets
    };
  }

  function normalizeGateLevel(value) {
    var raw = normalizeTag(value);
    if (raw === 'guard') return 'guarded';
    if (raw === 'allow' || raw === 'guarded' || raw === 'blocked') return raw;
    return '';
  }

  function normalizeRecipeType(value) {
    var raw = normalizeTag(value);
    if (raw === 'css' || raw === 'css-snippet' || raw === 'csssnippet' || raw === 'snippet') return 'css-snippet';
    if (raw === 'html' || raw === 'html-snippet' || raw === 'htmlsnippet') return 'html-snippet';
    if (raw === 'compound') return 'compound';
    return '';
  }

  function normalizeRecipeTypeWithDefault(value, fallback) {
    var out = normalizeRecipeType(value);
    if (out) return out;
    return normalizeRecipeType(fallback) || 'css-snippet';
  }

  function normalizeRecipeBody(type, inputBody) {
    var recipeType = normalizeRecipeTypeWithDefault(type, 'css-snippet');
    if (recipeType === 'compound') {
      var bodyObj = (inputBody && typeof inputBody === 'object' && !Array.isArray(inputBody)) ? inputBody : {};
      var cssBody = toStringSafe(bodyObj.css || '').trim();
      var htmlBody = toStringSafe(bodyObj.html || '').trim();
      if (!cssBody && !htmlBody) return null;
      return {
        css: cssBody,
        html: htmlBody
      };
    }

    var textBody = toStringSafe(inputBody || '').trim();
    if (!textBody) return null;
    return textBody;
  }

  function normalizeContextName(value) {
    var raw = normalizeTag(value).replace(/[_\s]+/g, '-');
    if (!raw) return '';
    if (raw === 'query' || raw === 'queryloop' || raw === 'query-loop' || raw === 'loop') return 'query-loop';
    if (raw === 'dynamic' || raw === 'dynamic-data' || raw === 'dynamicdata') return 'dynamic-data';
    if (raw === 'wpml') return 'wpml';
    if (raw === 'condition' || raw === 'conditions') return 'conditions';
    if (raw === 'component' || raw === 'slot' || raw === 'variant' || raw === 'schema') return raw;
    return raw;
  }

  function contextToSignalKey(value) {
    var key = normalizeContextName(value);
    if (key === 'query-loop') return 'queryLoop';
    if (key === 'dynamic-data') return 'dynamicData';
    if (key === 'conditions') return 'conditions';
    if (key === 'component') return 'component';
    if (key === 'slot') return 'slot';
    if (key === 'variant') return 'variant';
    if (key === 'schema') return 'schema';
    if (key === 'wpml') return 'wpml';
    return '';
  }

  function uniqueStrings(input, normalizeFn) {
    var out = [];
    var seen = {};
    var arr = toArray(input);
    for (var i = 0; i < arr.length; i++) {
      var raw = arr[i];
      var next = normalizeFn ? normalizeFn(raw) : toStringSafe(raw).trim();
      if (!next) continue;
      if (seen[next]) continue;
      seen[next] = true;
      out.push(next);
    }
    return out;
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) { _warn('clone', e); 
      return value;
    }
  }

  function normalizeRecipe(input) {
    if (!input || typeof input !== 'object') return null;

    var id = normalizeAlias(input.id || (toArray(input.aliases)[0] || ''));
    var aliases = uniqueStrings(
      toArray(input.aliases).concat(input.alias ? [input.alias] : []).concat(id ? [id] : []),
      normalizeAlias
    );
    if (!id && aliases.length) id = aliases[0];
    if (!id) return null;

    if (aliases.indexOf(id) === -1) aliases.unshift(id);

    var recipeType = normalizeRecipeTypeWithDefault(input.type, 'css-snippet');
    var rawBody = input.body;
    if (recipeType === 'compound' && (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody))) {
      rawBody = {
        css: input.cssBody,
        html: input.htmlBody
      };
    }
    var body = normalizeRecipeBody(recipeType, rawBody);
    if (!body) return null;

    return {
      id: id,
      type: recipeType,
      aliases: aliases,
      category: normalizeTag(input.category || 'misc') || 'misc',
      description: toStringSafe(input.description || '').trim(),
      body: body,
      tags: uniqueStrings(input.tags, normalizeTag),
      blockedContexts: uniqueStrings(input.blockedContexts, normalizeContextName),
      preset: normalizePresetKey(input.preset || input.presetKey || 'shared'),
      presetLabel: normalizePresetLabel(input.presetLabel || input.preset_label || '', input.preset || input.presetKey || 'shared'),
      requiresSelection: !!input.requiresSelection,
      safeSubsetOnly: !!input.safeSubsetOnly
    };
  }

  function parseImportPayload(payload) {
    if (!payload) return [];
    var raw = payload;
    if (typeof payload === 'string') {
      try { raw = JSON.parse(payload); } catch (e) { console.warn('CM6GPT: localStorage recipe data corrupted, resetting to empty', e); return []; }
    }
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray(raw.recipes)) return raw.recipes;
    if (raw && typeof raw === 'object' && raw.id) return [raw];
    return [];
  }

  function safeStorageRead(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      return storage.getItem(key);
    } catch (e) { _warn('safeStorageRead', e); 
      return null;
    }
  }

  function safeStorageWrite(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) { _warn('safeStorageWrite', e); 
      return false;
    }
  }

  function getDefaultStorage() {
    try {
      if (typeof w.localStorage !== 'undefined') return w.localStorage;
    } catch (e) { _warn('getDefaultStorage', e); }
    return null;
  }

  function insertIntoEditor(editor, text, opts) {
    opts = opts || {};
    if (!editor) return { ok: true, inserted: false, reason: 'no-editor', text: text };

    var insertText = toStringSafe(text);
    if (!insertText) return { ok: true, inserted: false, reason: 'empty-text', text: '' };

    if (opts.addTrailingNewline && insertText && !/\n$/.test(insertText)) {
      insertText += '\n';
    }

    var cmView = null;
    if (editor && typeof editor._view === 'function') {
      try { cmView = editor._view(); } catch (e0) { _warn('insertIntoEditor', e0);  cmView = null; }
    }
    if (cmView && cmView.state && cmView.dispatch && cmView.state.doc) {
      var sel = cmView.state.selection && cmView.state.selection.main ? cmView.state.selection.main : null;
      var from = Number(sel && (sel.from != null ? sel.from : sel.anchor) || 0);
      var to = Number(sel && (sel.to != null ? sel.to : sel.head) || from);
      if (!isFinite(from) || from < 0) from = 0;
      if (!isFinite(to) || to < from) to = from;

      cmView.dispatch({
        changes: { from: from, to: to, insert: insertText },
        selection: { anchor: from + insertText.length },
        userEvent: 'input.paste'
      });

      if (typeof editor.focus === 'function') {
        try { editor.focus(); } catch (e1) { _warn('insertIntoEditor', e1); }
      }

      return {
        ok: true,
        inserted: true,
        from: from,
        to: to,
        text: insertText
      };
    }

    if (typeof editor.getValue === 'function' && typeof editor.setValue === 'function') {
      var current = toStringSafe(editor.getValue());
      var start = isFinite(opts.selectionStart) ? Number(opts.selectionStart) : current.length;
      var end = isFinite(opts.selectionEnd) ? Number(opts.selectionEnd) : start;
      if (start < 0) start = 0;
      if (end < start) end = start;
      if (start > current.length) start = current.length;
      if (end > current.length) end = current.length;

      var next = current.slice(0, start) + insertText + current.slice(end);
      editor.setValue(next, { preserveScroll: true });
      if (typeof editor.focus === 'function') {
        try { editor.focus(); } catch (e2) { _warn('insertIntoEditor', e2); }
      }
      return {
        ok: true,
        inserted: true,
        from: start,
        to: end,
        text: insertText
      };
    }

    return { ok: false, inserted: false, reason: 'editor-not-insertable', text: insertText };
  }

  function isEditorInsertable(editor) {
    if (!editor) return false;
    if (typeof editor._view === 'function') {
      var cmView = null;
      try { cmView = editor._view(); } catch (e0) { _warn('isEditorInsertable', e0);  cmView = null; }
      if (cmView && cmView.state && cmView.dispatch && cmView.state.doc) return true;
    }
    return typeof editor.getValue === 'function' && typeof editor.setValue === 'function';
  }

  function resolveEditorForLane(opts, lane) {
    opts = opts || {};
    if (lane === 'css') return opts.cssEditor || opts.editor || null;
    if (lane === 'html') return opts.htmlEditor || null;
    return null;
  }

  function getRecipeBodyForLane(recipe, lane) {
    var type = normalizeRecipeTypeWithDefault(recipe && recipe.type, 'css-snippet');
    if (type === 'compound') {
      var compoundBody = (recipe && recipe.body && typeof recipe.body === 'object') ? recipe.body : {};
      return toStringSafe(compoundBody[lane] || '').trim();
    }
    if (type === 'css-snippet' && lane === 'css') return toStringSafe(recipe && recipe.body || '').trim();
    if (type === 'html-snippet' && lane === 'html') return toStringSafe(recipe && recipe.body || '').trim();
    return '';
  }

  function buildRecipeInsertSteps(recipe, opts) {
    opts = opts || {};
    var type = normalizeRecipeTypeWithDefault(recipe && recipe.type, 'css-snippet');
    var steps = [];

    function addLane(lane, bodyText, missingReason) {
      var editor = resolveEditorForLane(opts, lane);
      if (!bodyText) return { ok: true };
      if (!editor) return { ok: false, reason: missingReason };
      if (!isEditorInsertable(editor)) return { ok: false, reason: lane + '-editor-not-insertable' };
      steps.push({
        lane: lane,
        editor: editor,
        text: bodyText,
        selectionStart: isFinite(opts[lane + 'SelectionStart']) ? Number(opts[lane + 'SelectionStart']) : opts.selectionStart,
        selectionEnd: isFinite(opts[lane + 'SelectionEnd']) ? Number(opts[lane + 'SelectionEnd']) : opts.selectionEnd
      });
      return { ok: true };
    }

    if (type === 'css-snippet') {
      var cssText = getRecipeBodyForLane(recipe, 'css');
      if (!cssText) return { ok: false, reason: 'empty-css-body', type: type, steps: [] };
      var cssLane = addLane('css', cssText, 'css-editor-missing');
      if (!cssLane.ok) return { ok: false, reason: cssLane.reason, type: type, steps: [] };
      return { ok: true, reason: 'ready', type: type, steps: steps };
    }

    if (type === 'html-snippet') {
      var htmlText = getRecipeBodyForLane(recipe, 'html');
      if (!htmlText) return { ok: false, reason: 'empty-html-body', type: type, steps: [] };
      var htmlLane = addLane('html', htmlText, 'html-editor-missing');
      if (!htmlLane.ok) return { ok: false, reason: htmlLane.reason, type: type, steps: [] };
      return { ok: true, reason: 'ready', type: type, steps: steps };
    }

    var compoundCss = getRecipeBodyForLane(recipe, 'css');
    var compoundHtml = getRecipeBodyForLane(recipe, 'html');
    if (!compoundCss && !compoundHtml) return { ok: false, reason: 'empty-compound-body', type: type, steps: [] };

    var compoundCssLane = addLane('css', compoundCss, 'css-editor-missing');
    if (!compoundCssLane.ok) return { ok: false, reason: compoundCssLane.reason, type: type, steps: [] };
    var compoundHtmlLane = addLane('html', compoundHtml, 'html-editor-missing');
    if (!compoundHtmlLane.ok) return { ok: false, reason: compoundHtmlLane.reason, type: type, steps: [] };

    return { ok: true, reason: 'ready', type: type, steps: steps };
  }

  function createManager(opts) {
    opts = opts || {};
    var storageKey = toStringSafe(opts.storageKey || DEFAULT_STORAGE_KEY).trim() || DEFAULT_STORAGE_KEY;
    var presetStorageKey = storageKey + ':preset-state:v1';
    var storage = opts.storage || getDefaultStorage();
    var presetPolicy = normalizePresetPolicy(opts.presetPolicy || null);

    var includeDefaultRecipes = opts.includeDefaultRecipes !== false;
    var defaultSource = Array.isArray(opts.defaultRecipes) ? opts.defaultRecipes : DEFAULT_RECIPES;
    var defaultCatalog = includeDefaultRecipes
      ? toArray(defaultSource).map(normalizeRecipe).filter(Boolean)
      : [];
    var userCatalog = [];

    var cache = {
      dirty: true,
      byId: {},
      aliasToId: {},
      merged: [],
      presets: []
    };
    var presetState = hasLockedPresetPolicy()
      ? { custom: false, enabledPresets: [] }
      : readPresetState();

    function hasLockedPresetPolicy() {
      return !!(presetPolicy && presetPolicy.locked);
    }

    function hasLockedPresetRestriction() {
      return hasLockedPresetPolicy() && normalizePresetKey(presetPolicy.activePresetKey || 'all') !== 'all';
    }

    function isRecipeAllowedByLockedPolicy(recipe) {
      if (!hasLockedPresetPolicy()) return true;
      if (!hasLockedPresetRestriction()) return true;
      var id = normalizeAlias(recipe && recipe.id || '');
      if (!id) return false;
      // Always allow user-owned recipes regardless of locked policy
      if (findUserIndex(id) >= 0) return true;
      return !!presetPolicy.allowedRecipeIdMap[id];
    }

    function markDirty() {
      cache.dirty = true;
      invalidateEnabledPresetMapCache();
    }

    function readStorage() {
      var raw = safeStorageRead(storage, storageKey);
      if (!raw) return [];
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.recipes)) return parsed.recipes;
      } catch (e) { _warn('readStorage', e); }
      return [];
    }

    function persistStorage() {
      var payload = {
        version: STORAGE_VERSION,
        recipes: clone(userCatalog)
      };
      safeStorageWrite(storage, storageKey, JSON.stringify(payload));
    }

    function readPresetState() {
      var raw = safeStorageRead(storage, presetStorageKey);
      if (!raw) return { custom: false, enabledPresets: [] };
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.custom === true) {
          return {
            custom: true,
            enabledPresets: uniqueStrings(parsed.enabledPresets, normalizePresetKey)
          };
        }
      } catch (e) { _warn('readPresetState', e); }
      return { custom: false, enabledPresets: [] };
    }

    function persistPresetState() {
      if (hasLockedPresetPolicy()) return false;
      var payload = presetState && presetState.custom
        ? {
            version: STORAGE_VERSION,
            custom: true,
            enabledPresets: uniqueStrings(presetState.enabledPresets, normalizePresetKey)
          }
        : {
            version: STORAGE_VERSION,
            custom: false,
            enabledPresets: []
          };
      safeStorageWrite(storage, presetStorageKey, JSON.stringify(payload));
    }

    function rebuildCache() {
      if (!cache.dirty) return;
      var byId = {};
      var order = [];

      function absorb(recipe) {
        if (!recipe || !recipe.id) return;
        if (!hasOwn(byId, recipe.id)) order.push(recipe.id);
        byId[recipe.id] = recipe;
      }

      for (var i = 0; i < defaultCatalog.length; i++) absorb(defaultCatalog[i]);
      for (i = 0; i < userCatalog.length; i++) absorb(userCatalog[i]);

      var merged = [];
      var aliasToId = {};
      var presetByKey = {};
      for (i = 0; i < order.length; i++) {
        var id = order[i];
        var recipe = byId[id];
        if (!recipe) continue;
        merged.push(recipe);

        var aliases = toArray(recipe.aliases);
        for (var a = 0; a < aliases.length; a++) {
          var alias = normalizeAlias(aliases[a]);
          if (!alias) continue;
          if (!hasOwn(aliasToId, alias)) aliasToId[alias] = id;
        }
        if (!hasOwn(aliasToId, recipe.id)) aliasToId[recipe.id] = recipe.id;

        var presetKey = normalizePresetKey(recipe.preset || 'shared');
        if (!hasOwn(presetByKey, presetKey)) {
          presetByKey[presetKey] = {
            key: presetKey,
            label: normalizePresetLabel(recipe.presetLabel || '', presetKey),
            count: 0
          };
        }
        presetByKey[presetKey].count += 1;
      }

      var presetKeys = Object.keys(presetByKey).sort(function (a, b) {
        if (a === 'shared' && b !== 'shared') return -1;
        if (b === 'shared' && a !== 'shared') return 1;
        return presetByKey[a].label.localeCompare(presetByKey[b].label);
      });
      var presets = [];
      for (i = 0; i < presetKeys.length; i++) {
        presets.push(presetByKey[presetKeys[i]]);
      }

      cache.byId = byId;
      cache.aliasToId = aliasToId;
      cache.merged = merged;
      cache.presets = presets;
      cache.dirty = false;
    }

    function getMergedCatalogRef() {
      rebuildCache();
      return cache.merged || [];
    }

    function getMergedCatalog() {
      return clone(getMergedCatalogRef());
    }

    function resolveRecipeByAlias(alias) {
      var key = normalizeAlias(alias);
      if (!key) return null;
      rebuildCache();
      var id = cache.aliasToId[key] || '';
      if (!id || !hasOwn(cache.byId, id)) return null;
      return clone(cache.byId[id]);
    }

    function getPresetCatalogRef() {
      rebuildCache();
      return cache.presets || [];
    }

    function getPresetCatalog() {
      return clone(getPresetCatalogRef());
    }

    function listCatalog(optsList, cloneResults) {
      optsList = optsList || {};
      var query = toStringSafe(optsList.query || optsList.q || '').trim().toLowerCase();
      var types = toArray(optsList.types).concat(optsList.type ? [optsList.type] : []).map(normalizeRecipeType).filter(Boolean);
      var category = normalizeTag(optsList.category || '');
      var tags = toArray(optsList.tags).map(normalizeTag).filter(Boolean);
      var hideBlocked = !!optsList.hideBlocked;
      var ignorePresetFilters = !!optsList.ignorePresetFilters;

      var needsFilter = query || types.length || category || tags.length || hideBlocked || hasLockedPresetRestriction() || (presetState.custom && !ignorePresetFilters);

      if (!needsFilter) {
        return cloneResults ? getMergedCatalog() : getMergedCatalogRef();
      }

      var all = getMergedCatalogRef();
      var enabledMap = ignorePresetFilters ? { __all: true } : getEnabledPresetMap();
      var filtered = [];
      for (var i = 0; i < all.length; i++) {
        var recipe = all[i];
        if (!isRecipeAllowedByLockedPolicy(recipe)) continue;
        if (!isRecipePresetEnabledWithMap(recipe, enabledMap)) continue;
        if (types.length && types.indexOf(normalizeRecipeTypeWithDefault(recipe.type, 'css-snippet')) === -1) continue;
        if (category && normalizeTag(recipe.category) !== category) continue;
        if (hideBlocked && toArray(recipe.blockedContexts).length) continue;
        if (!matchesTagFilter(recipe, tags)) continue;
        if (query && recipeToHaystack(recipe).indexOf(query) === -1) continue;
        filtered.push(recipe);
      }
      return cloneResults ? clone(filtered) : filtered;
    }

    var _enabledPresetMapCache = null;
    var _enabledPresetMapStateRef = null;

    function invalidateEnabledPresetMapCache() {
      _enabledPresetMapCache = null;
      _enabledPresetMapStateRef = null;
    }

    function getEnabledPresetKeys() {
      var presets = getPresetCatalogRef();
      if (!presetState || !presetState.custom) {
        return presets.map(function (entry) { return entry.key; });
      }
      var enabled = uniqueStrings(presetState.enabledPresets, normalizePresetKey);
      return presets
        .map(function (entry) { return entry.key; })
        .filter(function (key) { return enabled.indexOf(key) !== -1; });
    }

    function getEnabledPresetMap() {
      if (hasLockedPresetPolicy()) return { __all: true };
      if (!presetState || !presetState.custom) return { __all: true };
      // Cache: reuse if presetState reference hasn't changed
      if (_enabledPresetMapCache && _enabledPresetMapStateRef === presetState) {
        return _enabledPresetMapCache;
      }
      var enabledKeys = getEnabledPresetKeys();
      var out = {};
      for (var i = 0; i < enabledKeys.length; i++) out[enabledKeys[i]] = true;
      _enabledPresetMapCache = out;
      _enabledPresetMapStateRef = presetState;
      return out;
    }

    function isRecipePresetEnabled(recipe, optsFilter) {
      if (!isRecipeAllowedByLockedPolicy(recipe)) return false;
      if (optsFilter && optsFilter.ignorePresetFilters) return true;
      var enabledMap = getEnabledPresetMap();
      if (enabledMap.__all) return true;
      return !!enabledMap[normalizePresetKey(recipe && recipe.preset || 'shared')];
    }

    function isRecipePresetEnabledWithMap(recipe, enabledMap) {
      if (!isRecipeAllowedByLockedPolicy(recipe)) return false;
      if (enabledMap.__all) return true;
      return !!enabledMap[normalizePresetKey(recipe && recipe.preset || 'shared')];
    }

    function getPresetStateSnapshot() {
      if (hasLockedPresetPolicy()) {
        return {
          locked: true,
          mode: presetPolicy.mode || 'admin-locked',
          custom: normalizePresetKey(presetPolicy.activePresetKey || 'all') !== 'all',
          enabledPresets: [normalizePresetKey(presetPolicy.activePresetKey || 'all')],
          activePresetKey: normalizePresetKey(presetPolicy.activePresetKey || 'all'),
          activePresetLabel: toStringSafe(presetPolicy.activePresetLabel || '').trim() || 'All Recipes',
          presets: presetPolicy.presets.map(function (entry) {
            return {
              key: entry.key,
              label: entry.label,
              count: entry.count,
              enabled: !!entry.active,
              active: !!entry.active,
              managed: !!entry.managed,
              description: entry.description
            };
          })
        };
      }
      var presets = getPresetCatalogRef();
      var enabledMap = getEnabledPresetMap();
      var enabledPresets = [];
      var mapped = presets.map(function (entry) {
        var enabled = !!(enabledMap.__all || enabledMap[entry.key]);
        if (enabled) enabledPresets.push(entry.key);
        return {
          key: entry.key,
          label: entry.label,
          count: entry.count,
          enabled: enabled
        };
      });
      return {
        locked: false,
        custom: !!(presetState && presetState.custom),
        enabledPresets: enabledPresets,
        activePresetKey: 'all',
        activePresetLabel: 'All Recipes',
        presets: mapped
      };
    }

    function applyEnabledPresetKeys(presetKeys, forceCustom) {
      if (hasLockedPresetPolicy()) return getPresetStateSnapshot();
      var presets = getPresetCatalogRef();
      var allKeys = presets.map(function (entry) { return entry.key; });
      var next = uniqueStrings(presetKeys, normalizePresetKey).filter(function (key) {
        return allKeys.indexOf(key) !== -1;
      });
      if (!forceCustom && next.length === allKeys.length) {
        presetState = { custom: false, enabledPresets: [] };
      } else {
        presetState = { custom: true, enabledPresets: next };
      }
      invalidateEnabledPresetMapCache();
      persistPresetState();
      return getPresetStateSnapshot();
    }

    function updatePresetEnabled(presetKey, enabled) {
      if (hasLockedPresetPolicy()) return getPresetStateSnapshot();
      var state = getPresetStateSnapshot();
      var totalPresets = getPresetCatalogRef().length;
      var next = state.enabledPresets.slice();
      presetKey = normalizePresetKey(presetKey);
      if (enabled) {
        if (next.indexOf(presetKey) === -1) next.push(presetKey);
      } else {
        next = next.filter(function (key) { return key !== presetKey; });
      }
      return applyEnabledPresetKeys(next, next.length !== totalPresets);
    }

    function findUserIndex(identifier) {
      identifier = normalizeAlias(identifier);
      if (!identifier) return -1;
      for (var i = 0; i < userCatalog.length; i++) {
        var r = userCatalog[i];
        if (!r) continue;
        if (normalizeAlias(r.id) === identifier) return i;
        var aliases = toArray(r.aliases);
        for (var a = 0; a < aliases.length; a++) {
          if (normalizeAlias(aliases[a]) === identifier) return i;
        }
      }
      return -1;
    }

    function recipeToHaystack(recipe) {
      var parts = [];
      parts.push(toStringSafe(recipe.id));
      parts = parts.concat(toArray(recipe.aliases));
      parts.push(toStringSafe(recipe.type));
      parts.push(toStringSafe(recipe.category));
      parts.push(toStringSafe(recipe.description));
      parts.push(toStringSafe(recipe.preset));
      parts.push(toStringSafe(recipe.presetLabel));
      parts = parts.concat(toArray(recipe.tags));
      return parts.join(' ').toLowerCase();
    }

    function matchesTagFilter(recipe, tagFilter) {
      if (!tagFilter.length) return true;
      var tags = {};
      var list = toArray(recipe.tags);
      for (var i = 0; i < list.length; i++) {
        tags[normalizeTag(list[i])] = true;
      }
      for (i = 0; i < tagFilter.length; i++) {
        if (!tags[tagFilter[i]]) return false;
      }
      return true;
    }

    function normalizeRecipeInputList(input) {
      var parsed = parseImportPayload(input);
      var out = [];
      for (var i = 0; i < parsed.length; i++) {
        var normalized = normalizeRecipe(parsed[i]);
        if (!normalized) continue;
        out.push(normalized);
      }
      return out;
    }

    var initialUserRecipes = normalizeRecipeInputList(readStorage());
    if (initialUserRecipes.length) {
      userCatalog = initialUserRecipes;
      markDirty();
    }

    return {
      storageKey: storageKey,
      list: function (optsList) {
        return listCatalog(optsList, true);
      },
      listRef: function (optsList) {
        return listCatalog(optsList, false);
      },
      search: function (query, optsSearch) {
        optsSearch = optsSearch || {};
        optsSearch.query = query;
        return this.list(optsSearch);
      },
      resolve: function (alias, optsResolve) {
        var recipe = resolveRecipeByAlias(alias);
        if (!recipe) return null;
        if (!isRecipePresetEnabled(recipe, optsResolve || {})) return null;
        return recipe;
      },
      canUseInAnalysis: function (recipeOrAlias, selectionAnalysis) {
        var recipe = typeof recipeOrAlias === 'string'
          ? resolveRecipeByAlias(recipeOrAlias)
          : normalizeRecipe(recipeOrAlias);
        if (!recipe) return { ok: false, reason: 'recipe-not-found', blockedContexts: [] };

        var analysis = selectionAnalysis && typeof selectionAnalysis === 'object' ? selectionAnalysis : {};
        var signals = analysis && analysis.signals && typeof analysis.signals === 'object' ? analysis.signals : {};
        var applyGate = analysis && analysis.applyGate && typeof analysis.applyGate === 'object'
          ? analysis.applyGate
          : {};
        var gateLevel = normalizeGateLevel(applyGate.level || '');
        var gateReasons = toArray(applyGate.reasons).map(function (line) {
          return toStringSafe(line || '').trim();
        }).filter(Boolean);

        var blocked = [];
        var blockedReasons = [];
        var blockedContexts = toArray(recipe.blockedContexts);
        for (var i = 0; i < blockedContexts.length; i++) {
          var ctx = normalizeContextName(blockedContexts[i]);
          var signalKey = contextToSignalKey(ctx);
          if (!signalKey) continue;
          if (signals[signalKey]) {
            blocked.push(ctx);
            blockedReasons.push('context blocked: ' + ctx);
          }
        }

        var mode = normalizeTag(analysis.mode || '');
        var hasElementSelection = mode === 'element' && !!toStringSafe(analysis.id || '').trim();
        if (recipe.requiresSelection && !hasElementSelection) {
          blocked.push('requires-selection');
          blockedReasons.push('requires active element selection');
        }

        if (recipe.safeSubsetOnly) {
          var safeSubsetAllowed = applyGate.htmlApplySafeSubsetAllowed !== false;
          if (!safeSubsetAllowed || gateLevel === 'blocked') {
            blocked.push('safe-subset-only');
            if (gateReasons.length) {
              blockedReasons.push('safe subset only recipe blocked by apply gate: ' + gateReasons[0]);
            } else {
              blockedReasons.push('safe subset only recipe blocked by apply gate');
            }
          }
        }

        if (blocked.length) {
          return {
            ok: false,
            reason: 'blocked-context',
            recipe: clone(recipe),
            blockedContexts: uniqueStrings(blocked, normalizeContextName),
            blockedReasons: uniqueStrings(blockedReasons, function (line) {
              return toStringSafe(line || '').trim();
            })
          };
        }

        return {
          ok: true,
          reason: 'allowed',
          recipe: clone(recipe),
          blockedContexts: [],
          blockedReasons: []
        };
      },
      insertAlias: function (alias, optsInsert) {
        optsInsert = optsInsert || {};
        var recipe = resolveRecipeByAlias(alias);
        if (!recipe) return { ok: false, reason: 'recipe-not-found', alias: normalizeAlias(alias) };
        if (!isRecipePresetEnabled(recipe)) {
          return {
            ok: false,
            reason: 'recipe-disabled-by-preset',
            alias: normalizeAlias(alias),
            recipe: clone(recipe)
          };
        }
        var gate = this.canUseInAnalysis(recipe, optsInsert.selectionAnalysis || null);
        if (!gate.ok) return gate;

        var plan = buildRecipeInsertSteps(recipe, optsInsert);
        if (!plan.ok) {
          return {
            ok: false,
            reason: plan.reason || 'insert-plan-failed',
            recipe: clone(recipe),
            recipeType: plan.type || normalizeRecipeTypeWithDefault(recipe.type, 'css-snippet')
          };
        }

        var insertions = [];
        for (var i = 0; i < plan.steps.length; i++) {
          var step = plan.steps[i];
          var inserted = insertIntoEditor(step.editor, step.text, {
            selectionStart: step.selectionStart,
            selectionEnd: step.selectionEnd,
            addTrailingNewline: optsInsert.addTrailingNewline !== false
          });
          if (!inserted.ok) {
            return {
              ok: false,
              reason: inserted.reason || 'insert-failed',
              recipe: clone(recipe),
              recipeType: plan.type,
              lane: step.lane,
              insertions: clone(insertions)
            };
          }
          insertions.push({
            lane: step.lane,
            inserted: !!inserted.inserted,
            from: inserted.from,
            to: inserted.to,
            text: toStringSafe(inserted.text || '')
          });
        }

        var insertedLanes = [];
        for (i = 0; i < insertions.length; i++) {
          if (insertions[i].inserted) insertedLanes.push(insertions[i].lane);
        }
        var primary = insertions.length ? insertions[0] : null;

        return {
          ok: true,
          reason: insertedLanes.length ? 'inserted' : 'resolved-only',
          recipe: clone(recipe),
          recipeType: plan.type,
          inserted: insertedLanes.length > 0,
          insertedLanes: insertedLanes,
          insertions: insertions,
          text: primary ? toStringSafe(primary.text || '') : '',
          from: primary ? primary.from : undefined,
          to: primary ? primary.to : undefined
        };
      },
      isUserOwned: function (identifier) {
        return findUserIndex(identifier) >= 0;
      },
      upsert: function (recipeInput) {
        var recipe = normalizeRecipe(recipeInput);
        if (!recipe) return { ok: false, reason: 'invalid-recipe' };
        var idx = findUserIndex(recipe.id);
        if (idx >= 0) userCatalog[idx] = recipe;
        else userCatalog.push(recipe);
        markDirty();
        persistStorage();
        return { ok: true, recipe: clone(recipe), total: getMergedCatalog().length };
      },
      remove: function (identifier) {
        var idx = findUserIndex(identifier);
        if (idx < 0) return { ok: false, reason: 'not-found' };
        var removed = userCatalog.splice(idx, 1)[0] || null;
        markDirty();
        persistStorage();
        return { ok: true, recipe: clone(removed), total: getMergedCatalog().length };
      },
      importRecipes: function (payload, optsImport) {
        optsImport = optsImport || {};
        var rawParsed = parseImportPayload(payload);
        var rawCount = rawParsed.length;
        var incoming = normalizeRecipeInputList(payload);
        var dropped = rawCount - incoming.length;
        if (!incoming.length) return { ok: false, reason: 'no-valid-recipes', imported: 0, dropped: dropped };

        if (optsImport.mode === 'replace') {
          userCatalog = [];
        }

        for (var i = 0; i < incoming.length; i++) {
          var recipe = incoming[i];
          var idx = findUserIndex(recipe.id);
          if (idx >= 0) userCatalog[idx] = recipe;
          else userCatalog.push(recipe);
        }

        markDirty();
        persistStorage();

        return {
          ok: true,
          reason: 'imported',
          imported: incoming.length,
          dropped: dropped,
          total: getMergedCatalog().length
        };
      },
      exportRecipes: function (optsExport) {
        optsExport = optsExport || {};
        var includeDefaults = !!optsExport.includeDefaults;
        var payload = {
          version: STORAGE_VERSION,
          recipes: includeDefaults ? getMergedCatalog() : clone(userCatalog)
        };
        if (optsExport.asString) return JSON.stringify(payload, null, 2);
        return payload;
      },
      resetCustom: function () {
        userCatalog = [];
        markDirty();
        persistStorage();
        return { ok: true, total: getMergedCatalog().length };
      },
      getStorageSnapshot: function () {
        var presetSnapshot = getPresetStateSnapshot();
        return {
          storageKey: storageKey,
          presetStorageKey: presetStorageKey,
          userCount: userCatalog.length,
          totalCount: getMergedCatalog().length,
          presetLocked: !!presetSnapshot.locked,
          activePresetKey: presetSnapshot.activePresetKey || 'all',
          activePresetLabel: presetSnapshot.activePresetLabel || 'All Recipes',
          enabledPresets: presetSnapshot.enabledPresets,
          presetCustom: presetSnapshot.custom
        };
      },
      listPresets: function () {
        return getPresetStateSnapshot().presets;
      },
      getPresetState: function () {
        return getPresetStateSnapshot();
      },
      setPresetEnabled: function (presetKey, enabled) {
        return updatePresetEnabled(presetKey, enabled !== false);
      },
      setEnabledPresets: function (presetKeys) {
        return applyEnabledPresetKeys(presetKeys, false);
      },
      resetPresetFilters: function () {
        if (hasLockedPresetPolicy()) return getPresetStateSnapshot();
        presetState = { custom: false, enabledPresets: [] };
        invalidateEnabledPresetMapCache();
        persistPresetState();
        return getPresetStateSnapshot();
      }
    };
  }

  ns.recipes = {
    DEFAULT_STORAGE_KEY: DEFAULT_STORAGE_KEY,
    DEFAULT_RECIPES: clone(DEFAULT_RECIPES),
    normalizeAlias: normalizeAlias,
    createManager: createManager
  };
})(window);
