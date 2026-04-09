(function(){
const D = window.CM6GPTLiteRecipeCatalog || window.RCAT;
const LOG_PREFIX = '[CM6GPT-Lite][RecipeCatalog]';
const CM6GPT_NS = window.CM6GPT = window.CM6GPT || {};
if (!D || typeof D !== 'object') {
  console.error(LOG_PREFIX + ' Missing admin bootstrap payload.');
  return;
}
if (!window.CM6GPTLiteRecipeCatalog) {
  window.CM6GPTLiteRecipeCatalog = D;
}

const clientConfig = D.cfg && typeof D.cfg === 'object' ? D.cfg : {};
const storageKeys = clientConfig.storageKeys && typeof clientConfig.storageKeys === 'object' ? clientConfig.storageKeys : {};
const legacyStorageKeys = clientConfig.legacyStorageKeys && typeof clientConfig.legacyStorageKeys === 'object' ? clientConfig.legacyStorageKeys : {};
const domIds = clientConfig.domIds && typeof clientConfig.domIds === 'object' ? clientConfig.domIds : {};
const legacyDomIds = clientConfig.legacyDomIds && typeof clientConfig.legacyDomIds === 'object' ? clientConfig.legacyDomIds : {};
const ACTIVE_TAB_STORAGE_KEY = typeof storageKeys.activeTab === 'string' && storageKeys.activeTab ? storageKeys.activeTab : 'cm6gpt_lite_recipe_catalog_tab_v1';
const OPEN_CATEGORIES_STORAGE_KEY = typeof storageKeys.openCategories === 'string' && storageKeys.openCategories ? storageKeys.openCategories : 'cm6gpt_lite_recipe_catalog_open_categories_v1';
const LEGACY_ACTIVE_TAB_STORAGE_KEY = typeof legacyStorageKeys.activeTab === 'string' && legacyStorageKeys.activeTab ? legacyStorageKeys.activeTab : 'rcat_tab';
const LEGACY_OPEN_CATEGORIES_STORAGE_KEY = typeof legacyStorageKeys.openCategories === 'string' && legacyStorageKeys.openCategories ? legacyStorageKeys.openCategories : 'rcat_c';
const AJAX_ACTION_PREFIX = typeof clientConfig.ajaxActionPrefix === 'string' && clientConfig.ajaxActionPrefix ? clientConfig.ajaxActionPrefix : 'cm6gpt_lite_recipe_catalog_';
const DOM_ID_APP = typeof domIds.app === 'string' && domIds.app ? domIds.app : 'cm6gpt-lite-recipe-catalog-app';
const DOM_ID_TOASTS = typeof domIds.toasts === 'string' && domIds.toasts ? domIds.toasts : 'cm6gpt-lite-recipe-catalog-toasts';
const LEGACY_DOM_ID_APP = typeof legacyDomIds.app === 'string' && legacyDomIds.app ? legacyDomIds.app : 'rcat-app';
const LEGACY_DOM_ID_TOASTS = typeof legacyDomIds.toasts === 'string' && legacyDomIds.toasts ? legacyDomIds.toasts : 'rcat-toasts';
const ADMIN_VIEWS_GLOBAL = typeof clientConfig.adminViewsGlobal === 'string' && clientConfig.adminViewsGlobal ? clientConfig.adminViewsGlobal : 'CM6GPTLiteRecipeCatalogAdminViews';
const LEGACY_ADMIN_VIEWS_GLOBAL = typeof clientConfig.legacyAdminViewsGlobal === 'string' && clientConfig.legacyAdminViewsGlobal ? clientConfig.legacyAdminViewsGlobal : 'CM6GPTLiteRCATAdminViews';
const CATEGORY_DATALIST_ID = 'cm6gpt-lite-recipe-catalog-categories';
const PRESET_DATALIST_ID = 'cm6gpt-lite-recipe-catalog-presets';
const IMPORT_CATEGORY_DATALIST_ID = 'cm6gpt-lite-recipe-catalog-import-categories';
const UI = {
  topbar: 'cm6gpt-lite-recipe-catalog__topbar',
  topbarLeft: 'cm6gpt-lite-recipe-catalog__topbar-left',
  topbarRight: 'cm6gpt-lite-recipe-catalog__topbar-right',
  tabs: 'cm6gpt-lite-recipe-catalog__tabs',
  tab: 'cm6gpt-lite-recipe-catalog__tab',
  searchWrap: 'cm6gpt-lite-recipe-catalog__search-wrap',
  search: 'cm6gpt-lite-recipe-catalog__search',
  stats: 'cm6gpt-lite-recipe-catalog__stats',
  stat: 'cm6gpt-lite-recipe-catalog__stat',
  presetNote: 'cm6gpt-lite-recipe-catalog__preset-note',
  presetGrid: 'cm6gpt-lite-recipe-catalog__preset-grid',
  presetCard: 'cm6gpt-lite-recipe-catalog__preset-card',
  presetHeader: 'cm6gpt-lite-recipe-catalog__preset-header',
  presetMain: 'cm6gpt-lite-recipe-catalog__preset-main',
  presetTitleRow: 'cm6gpt-lite-recipe-catalog__preset-title-row',
  presetActions: 'cm6gpt-lite-recipe-catalog__preset-actions'
};

function cx(){
  return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
}

function getById(primaryId, legacyId){
  return document.getElementById(primaryId) || document.getElementById(legacyId);
}

function storageRead(key){
  try {
    if (!window.localStorage) return '';
    const value = window.localStorage.getItem(key);
    return typeof value === 'string' ? value : '';
  } catch (e) {
    return '';
  }
}

function storageWrite(key, value){
  try {
    if (!window.localStorage) return false;
    window.localStorage.setItem(key, String(value));
    return true;
  } catch (e) {
    return false;
  }
}

function storageRemove(key){
  try {
    if (!key || !window.localStorage) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

function storageReadFirst(keys){
  const list = Array.isArray(keys) ? keys : [keys];
  for (let i = 0; i < list.length; i++) {
    const value = storageRead(list[i]);
    if (value) return value;
  }
  return '';
}

function storageWriteCanonical(key, value, legacyKeys){
  const wrote = storageWrite(key, value);
  const list = Array.isArray(legacyKeys) ? legacyKeys : [legacyKeys];
  list.forEach(function(legacyKey){
    if (legacyKey && legacyKey !== key) storageRemove(legacyKey);
  });
  return wrote;
}

function storageReadObject(key, fallback){
  const base = (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) ? fallback : {};
  const raw = storageReadFirst(key);
  if (!raw) return { ...base };
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : { ...base };
  } catch (e) {
    return { ...base };
  }
}

function getBridgeRuntimeUtils() {
  if (
    !CM6GPT_NS.BridgeRuntimeUtils
    || typeof CM6GPT_NS.BridgeRuntimeUtils.createManagedTimeout !== 'function'
    || typeof CM6GPT_NS.BridgeRuntimeUtils.copyTextWithFallback !== 'function'
    || typeof CM6GPT_NS.BridgeRuntimeUtils.focusDomNode !== 'function'
    || typeof CM6GPT_NS.BridgeRuntimeUtils.trackListener !== 'function'
    || typeof CM6GPT_NS.BridgeRuntimeUtils.drainCleanupQueue !== 'function'
  ) {
    throw new Error('CM6GPT.BridgeRuntimeUtils lifecycle helpers missing');
  }
  return CM6GPT_NS.BridgeRuntimeUtils;
}

function getTimerApi(timerApi){
  if (timerApi && typeof timerApi.setTimeout === 'function' && typeof timerApi.clearTimeout === 'function') {
    return timerApi;
  }
  return {
    setTimeout: typeof setTimeout === 'function' ? setTimeout : function () { return null; },
    clearTimeout: typeof clearTimeout === 'function' ? clearTimeout : function () {}
  };
}

function createManagedTimeout(timerApi){
  return getBridgeRuntimeUtils().createManagedTimeout(getTimerApi(timerApi));
}

function copyTextWithFallback(text, opts){
  return getBridgeRuntimeUtils().copyTextWithFallback(text, opts);
}

function focusDomNode(node, opts){
  return getBridgeRuntimeUtils().focusDomNode(node, opts);
}

function createAdminRuntime(timerApi){
  const api = getTimerApi(timerApi);
  const listenerCleanups = [];
  const pendingTimers = new Set();
  const cleanupFns = [];
  let destroyed = false;

  function bind(target, type, handler, options){
    return getBridgeRuntimeUtils().trackListener(listenerCleanups, target, type, handler, options);
  }

  function defer(callback, delay){
    if (destroyed) return null;
    const timerId = api.setTimeout(function () {
      pendingTimers.delete(timerId);
      if (typeof callback === 'function') callback();
    }, Number(delay || 0));
    pendingTimers.add(timerId);
    return timerId;
  }

  function clearDeferred(timerId){
    if (timerId === null || typeof timerId === 'undefined' || !pendingTimers.has(timerId)) return false;
    api.clearTimeout(timerId);
    pendingTimers.delete(timerId);
    return true;
  }

  return {
    bind: bind,
    defer: defer,
    clearDeferred: clearDeferred,
    createManagedTimeout: function () {
      return createManagedTimeout({
        setTimeout: defer,
        clearTimeout: clearDeferred
      });
    },
    onCleanup: function (callback) {
      if (typeof callback === 'function') cleanupFns.push(callback);
      return callback;
    },
    isDestroyed: function () {
      return destroyed;
    },
    destroy: function () {
      if (destroyed) return false;
      destroyed = true;
      getBridgeRuntimeUtils().drainCleanupQueue(listenerCleanups);
      pendingTimers.forEach(function (timerId) {
        api.clearTimeout(timerId);
      });
      pendingTimers.clear();
      getBridgeRuntimeUtils().drainCleanupQueue(cleanupFns);
      return true;
    }
  };
}

CM6GPT_NS.recipeCatalogAdminInternals = CM6GPT_NS.recipeCatalogAdminInternals || {};
CM6GPT_NS.recipeCatalogAdminInternals.createManagedTimeout = createManagedTimeout;
CM6GPT_NS.recipeCatalogAdminInternals.createAdminRuntime = createAdminRuntime;

let allRecipes = D.r || {};
let presetPolicy = D.p || {};
let recipes = filterRecipesByActivePreset(allRecipes, presetPolicy);
let openC = storageReadObject([OPEN_CATEGORIES_STORAGE_KEY, LEGACY_OPEN_CATEGORIES_STORAGE_KEY], {});
let editId = null, editD = null, searchQ = '', panel = null, dragId = null;
const PAGE_SIZE = 50;
let catPage = {}; // tracks how many items shown per category
let blockedCount = D.b || 0;
const storedTab = storageReadFirst([ACTIVE_TAB_STORAGE_KEY, LEGACY_ACTIVE_TAB_STORAGE_KEY]) || 'recipes';
let currentTab = ['recipes','presets','import','export','guide'].indexOf(storedTab) !== -1 ? storedTab : 'recipes';
const app = getById(DOM_ID_APP, LEGACY_DOM_ID_APP);
if (!app) {
  console.error(LOG_PREFIX + ' ' + ((D.i18n && D.i18n.missing_admin_mount_node) || 'Missing #cm6gpt-lite-recipe-catalog-app mount node.'));
  return;
}
if (app.__cm6gptLiteRecipeCatalogRuntime && typeof app.__cm6gptLiteRecipeCatalogRuntime.destroy === 'function') {
  app.__cm6gptLiteRecipeCatalogRuntime.destroy();
}
const runtime = createAdminRuntime(window);
const searchRenderTimeout = runtime.createManagedTimeout();
const dragResetTimeout = runtime.createManagedTimeout();
app.__cm6gptLiteRecipeCatalogRuntime = runtime;
runtime.onCleanup(function () {
  if (app.__cm6gptLiteRecipeCatalogRuntime === runtime) {
    app.__cm6gptLiteRecipeCatalogRuntime = null;
  }
  const toastRoot = getById(DOM_ID_TOASTS, LEGACY_DOM_ID_TOASTS);
  if (!toastRoot || typeof toastRoot.querySelectorAll !== 'function') return;
  toastRoot.querySelectorAll('.toast').forEach(function (node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  });
});

/* ── SVG Icons ── */
const ICO = {
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
  empty: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M13 2v7h7"/></svg>',
  // Guide tab — Lucide icons
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  penTool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
  chefHat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/></svg>',
  variable: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21s-4-3-4-9 4-9 4-9"/><path d="M16 3s4 3 4 9-4 9-4 9"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  fileCode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>',
  refreshCw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
};

const adminViewsFactory = window[ADMIN_VIEWS_GLOBAL] && typeof window[ADMIN_VIEWS_GLOBAL].create === 'function'
  ? window[ADMIN_VIEWS_GLOBAL]
  : window[LEGACY_ADMIN_VIEWS_GLOBAL] && typeof window[LEGACY_ADMIN_VIEWS_GLOBAL].create === 'function'
    ? window[LEGACY_ADMIN_VIEWS_GLOBAL]
    : null;

const adminViews = adminViewsFactory
  ? adminViewsFactory.create({
      i18n: D.i18n || {},
      sourceLabelMap: D.slm || {},
      icons: ICO,
      escapeHtml: function(value){ const d = document.createElement('div'); d.textContent = String(value ?? ''); return d.innerHTML; },
      escapeAttr: function(value){ const d = document.createElement('div'); d.textContent = String(value ?? ''); return d.innerHTML.replace(/"/g, '&quot;'); }
    })
  : null;

function t(key, replacements, fallback){
  if (adminViews && typeof adminViews.t === 'function') {
    return adminViews.t(key, replacements, fallback);
  }
  var template = typeof fallback === 'string' ? fallback : String(key || '');
  if (!replacements || typeof replacements !== 'object') return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, name){
    return Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match;
  });
}

/* ── Preset-based recipe filtering ── */
function filterRecipesByActivePreset(all, policy) {
  if (!policy || !policy.allowedRecipeIds || !policy.allowedRecipeIds.length) return all;
  var allowed = {};
  for (var i = 0; i < policy.allowedRecipeIds.length; i++) allowed[policy.allowedRecipeIds[i]] = true;
  var out = {};
  Object.keys(all).forEach(function(id) { if (allowed[id]) out[id] = all[id]; });
  return out;
}

/* ── Helpers ── */
const esc = s => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };
const ea = s => esc(s).replace(/"/g,'&quot;');

function highlightCss(raw){
  if(!raw) return '';
  let h = esc(raw);
  // 1) comments
  h = h.replace(/(\/\*[\s\S]*?\*\/)/g,'<span class="css-comment">$1</span>');
  // 2) @rules
  h = h.replace(/(@[\w-]+)/g,'<span class="css-at">$1</span>');
  // 3) strings
  h = h.replace(/(&quot;[^&]*?&quot;|&#039;[^&]*?&#039;|"[^"]*?"|'[^']*?')/g,'<span class="css-str">$1</span>');
  // 4) full declaration: property: value;
  //    capture property name, colon, then everything up to ; or } or end
  h = h.replace(/([\w-]+)(\s*:\s*)((?:(?!<span)[^;{}])*)(;?)/g, function(m,prop,colon,val,semi){
    // skip if already inside a span (from comments/strings)
    if(m.indexOf('css-comment')!==-1||m.indexOf('css-at')!==-1) return m;
    // highlight numbers+units inside the value
    var v = val;
    v = v.replace(/\b(\d+\.?\d*)(px|em|rem|%|vh|vw|vmin|vmax|fr|ms|s|deg|ch|ex|cm|mm|in|pt|pc)\b/g,
      '<span class="css-num">$1</span><span class="css-unit">$2</span>');
    v = v.replace(/(#[0-9a-fA-F]{3,8})\b/g,'<span class="css-num">$1</span>');
    return '<span class="css-prop">'+prop+'</span>'+colon+'<span class="css-val">'+v+'</span>'+(semi?';':'');
  });
  // 5) braces
  h = h.replace(/([{}])/g,'<span class="css-brace">$1</span>');
  return h;
}

function applyData(d){
  if(!d) return;
  if(d.recipes) allRecipes = d.recipes;
  if(typeof d.blockedCount !== 'undefined') blockedCount = d.blockedCount;
  if(d.presetPolicy && typeof d.presetPolicy === 'object') presetPolicy = d.presetPolicy;
  recipes = filterRecipesByActivePreset(allRecipes, presetPolicy);
}

function toast(m,type){
  if (runtime.isDestroyed()) return;
  const c=getById(DOM_ID_TOASTS, LEGACY_DOM_ID_TOASTS);
  if(!c) return;
  const e=document.createElement('div');
  e.className='toast'+(type==='w'?' w':type==='e'?' e':'');
  e.textContent=m;c.appendChild(e);
  runtime.defer(function () {
    if (runtime.isDestroyed() || !e.parentNode) return;
    e.classList.add('fade');
    runtime.defer(function () {
      if (e.parentNode) e.parentNode.removeChild(e);
    }, 250);
  }, 2500);
}

function validDraft(d, fallbackId){
  const id=String(d?.id||fallbackId||'').trim();
  const category=String(d?.category||'').trim();
  const css=String(d?.css||'').trim();
  if(!id){ toast(t('id_required', null, 'ID is required'),'e'); return false; }
  if(/^c[-_]/i.test(id)||/^v[-_]/i.test(id)){ toast(t('id_prefix_invalid', null, 'ID cannot start with c- or v-'),'e'); return false; }
  if(/btcc/i.test(id)){ toast(t('id_btcc_invalid', null, 'ID cannot contain "btcc"'),'e'); return false; }
  if(!category){ toast(t('category_required', null, 'Category is required'),'e'); return false; }
  if(!css){ toast(t('css_required', null, 'CSS is required'),'e'); return false; }
  return true;
}

async function ax(a,d){
  if (runtime.isDestroyed()) return null;
  const fd=new FormData(); fd.append('action',AJAX_ACTION_PREFIX+a); fd.append('_ajax_nonce',D.n);
  if(d) Object.entries(d).forEach(([k,v])=>fd.append(k,v));

  let r, raw;
  try {
    r = await fetch(D.u,{method:'POST',body:fd});
    raw = await r.text();
  } catch (e) {
    if (runtime.isDestroyed()) return null;
    toast(t('request_failed_connection', null, 'Request failed. Check your connection and try again.'),'e');
    return null;
  }
  if (runtime.isDestroyed()) return null;

  const trimmed = String(raw || '').trim();
  if ('-1' === trimmed) {
    toast(t('session_expired_reload', null, 'Session expired. Reload the page and try again.'),'e');
    return null;
  }

  let j = null;
  try {
    j = JSON.parse(trimmed);
  } catch (e) {
    j = null;
  }

  if (!j || typeof j !== 'object') {
    if (runtime.isDestroyed()) return null;
    toast(r && !r.ok ? 'Request failed ('+r.status+').' : t('unexpected_server_response', null, 'Unexpected server response. Reload and try again.'),'e');
    return null;
  }
  if (runtime.isDestroyed()) return null;
  if(!j.success){toast(j.data||t('generic_error', null, 'Error'),'e');return null;}
  if (runtime.isDestroyed()) return null;
  return j.data;
}

function cats(){ const s=new Set(); Object.values(recipes).forEach(r=>{if(r.category)s.add(r.category)}); return [...s].sort(); }

function grp(q){
  const g={}, ql=(q||'').toLowerCase();
  Object.entries(recipes).forEach(([id,r])=>{
    if(ql&&!id.toLowerCase().includes(ql)&&!(r.label||'').toLowerCase().includes(ql)&&!(r.css||'').toLowerCase().includes(ql)&&!(r.description||'').toLowerCase().includes(ql))return;
    const c=r.category||'Uncategorized'; if(!g[c])g[c]={}; g[c][id]=r;
  });
  return g;
}

function normalizePresetKey(value){
  return String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z0-9_]/g,'').replace(/_+/g,'_').replace(/^_+|_+$/g,'') || 'all';
}

function getPresetEntries(){
  const arr = Array.isArray(presetPolicy && presetPolicy.presets) ? presetPolicy.presets : [];
  return arr
    .filter(function(entry){ return entry && typeof entry === 'object'; })
    .map(function(entry){
      return {
        key: normalizePresetKey(entry.key || entry.preset || 'all'),
        label: String(entry.label || entry.presetLabel || entry.key || 'All Recipes').trim() || 'All Recipes',
        count: Math.max(0, Number(entry.count || 0) || 0),
        managed: !!entry.managed,
        active: !!entry.active,
        description: String(entry.description || '').trim()
      };
    });
}

function getActivePresetKey(){
  return normalizePresetKey((presetPolicy && presetPolicy.activePresetKey) || 'all');
}

function getActivePresetLabel(){
  const entries = getPresetEntries();
  const activeKey = getActivePresetKey();
  const active = entries.find(function(entry){ return entry.key === activeKey || entry.active; });
  if(active && active.label) return active.label;
  return String((presetPolicy && presetPolicy.activePresetLabel) || 'All Recipes').trim() || 'All Recipes';
}

/* ── Actions ── */
async function doDelete(id){ if(!confirm(t('delete_entry_confirm',{label: recipes[id]?.label||id},'Delete entry "{label}"?')))return; const d=await ax('delete',{id}); if(d && !runtime.isDestroyed()){applyData(d);toast(t('entry_deleted',null,'Entry deleted'));render();} }
async function doDup(id){ const d=await ax('duplicate',{id}); if(d && !runtime.isDestroyed()){applyData(d);toast(t('entry_copied',{id:d.new_id},'Entry copied -> {id}'));editId=d.new_id;editD={...recipes[d.new_id]};render();} }
async function doMove(id,cat){ const d=await ax('move',{id,category:cat}); if(d && !runtime.isDestroyed()){applyData(d);toast(t('entry_moved',{category:cat},'Entry moved -> {category}'));render();} }
async function doSetActivePreset(key){
  key = normalizePresetKey(key || 'all');
  const d = await ax('set_active_preset',{key:key});
  if(d && !runtime.isDestroyed()){
    applyData(d);
    toast(t('active_preset_updated',{label:getActivePresetLabel()},'Active preset updated -> {label}'));
    render();
  }
}

async function doSave(){
  if(!editId||!editD)return;
  const nw=editId==='__new__';
  const nid=editD.id||editId;
  if(!validDraft(editD, nid)) return;
  const d=await ax('save',{
    old_id:nw?'':editId, id:nid, label:editD.label||nid,
    category:editD.category||'', description:editD.description||'',
    css:editD.css||'', preset:editD.preset||'shared', presetLabel:editD.presetLabel||''
  });
  if(d && !runtime.isDestroyed()){
    applyData(d);
    editId=null;editD=null;
    if(d.saved_id && String(d.saved_id) !== String(nid)){
      toast(t('entry_saved_as',{id:d.saved_id},'Entry saved as -> {id}'),'w');
    } else {
      toast(t('entry_saved',null,'Entry saved'));
    }
    render();
  }
}

async function doImport(){
  const ta=app.querySelector('#imp-text');
  if(!ta||!ta.value.trim()){toast(t('paste_entries_first',null,'Paste entries first'),'e');return;}
  let preset = (app.querySelector('#imp-preset')||{}).value || 'shared';
  if(preset === '__new__'){
    preset = prompt(t('new_source_label_prompt',null,'New recipe source label (e.g. "legacy_css_bundle_2"):'));
    if(!preset){toast(t('import_cancelled_no_source_label',null,'Import cancelled - no source label'),'e');return;}
    preset = preset.trim().toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z0-9_]/g,'');
    if(!preset){toast(t('invalid_source_label',null,'Invalid source label'),'e');return;}
  }
  const category = (app.querySelector('#imp-category')||{}).value || 'Imported Recipes';
  const d=await ax('bulk_import',{text:ta.value,mode:'merge',preset:preset,presetLabel:preset.replace(/_/g,' ').replace(/\b\w/g,function(l){return l.toUpperCase();}),category:category});
  if(d){applyData(d);panel=null;toast(t('import_summary',{count:(d.count||0),preset:preset},'{count} entries imported with source "{preset}"'));render();}
}

function loadImportFile(){
  const fileInput=app.querySelector('#imp-file'), ta=app.querySelector('#imp-text');
  if(!fileInput||!ta){toast(t('open_import_first',null,'Open Import first'),'e');return;}
  if(!fileInput.files||!fileInput.files.length){toast(t('select_import_file_first',null,'Select an import file first'),'e');return;}
  const file=fileInput.files[0], reader=new FileReader();
  reader.onload=()=>{if(runtime.isDestroyed())return; ta.value=String(reader.result||'');toast(t('import_file_loaded',{name:(file.name||'file')},'Import file loaded: {name}'));};
  reader.onerror=()=>{if(runtime.isDestroyed())return; toast(t('import_file_read_failed',null,'Import file read failed'),'e');};
  reader.readAsText(file);
}

async function doDeleteAll(){ if(!confirm(t('clear_catalog_confirm',{count:Object.keys(allRecipes).length},'Clear catalog and remove all {count} entries?')))return; const d=await ax('delete_all'); if(d && !runtime.isDestroyed()){applyData(d);toast(t('catalog_cleared',null,'Catalog cleared'));render();} }
/* ── Export text ── */
function expTxt(){
  const g={}; Object.entries(allRecipes).forEach(([id,r])=>{const c=r.category||'Uncategorized';if(!g[c])g[c]={};g[c][id]=r});
  let o=''; Object.keys(g).sort().forEach(c=>{
    if(o) o+='\n'; o+='/ '+c+'\n';
    Object.entries(g[c]).forEach(([id,r])=>{
      if(r.description) o+='// '+r.description+'\n';
      o+=id+'\n'+r.css+'\n\n';
    });
  });
  return o.trimEnd();
}

/* ════ RENDER ════ */
function render(){
  if (runtime.isDestroyed()) return;
  const total = Object.keys(recipes).length;
  let h = '';

  // ── Topbar ──
  h += '<div class="'+cx(UI.topbar, 'rcat-topbar')+'">';
  var allTotal = Object.keys(allRecipes).length;
  h += '<div class="'+cx(UI.topbarLeft, 'rcat-topbar-left')+'"><h1>'+esc(t('topbar_title', null, 'CM6GPT Lite Recipe Catalog'))+'</h1><span class="badge">'+total+(total !== allTotal ? ' / '+allTotal : '')+'</span></div>';
  h += '<div class="'+cx(UI.topbarRight, 'rcat-topbar-right')+'">';
  h += '<span class="badge">'+esc(t('active_preset_badge',{label:getActivePresetLabel()},'Active preset: {label}'))+'</span>';
  h += '</div></div>';

  // ── Tabs ──
  h += '<div class="'+cx(UI.tabs, 'rcat-tabs')+'">';
  h += '<button class="'+cx(UI.tab, 'rcat-tab', currentTab==='recipes' ? 'active' : '')+'" data-a="tab" data-t="recipes">'+esc(t('tab_catalog', null, 'Catalog'))+' <span class="cnt">'+total+'</span></button>';
  h += '<button class="'+cx(UI.tab, 'rcat-tab', currentTab==='presets' ? 'active' : '')+'" data-a="tab" data-t="presets">'+esc(t('tab_presets', null, 'Presets'))+'</button>';
  h += '<button class="'+cx(UI.tab, 'rcat-tab', currentTab==='import' ? 'active' : '')+'" data-a="tab" data-t="import">'+esc(t('tab_import', null, 'Import'))+'</button>';
  h += '<button class="'+cx(UI.tab, 'rcat-tab', currentTab==='export' ? 'active' : '')+'" data-a="tab" data-t="export">'+esc(t('tab_export', null, 'Export'))+'</button>';
  h += '<button class="'+cx(UI.tab, 'rcat-tab', currentTab==='guide' ? 'active' : '')+'" data-a="tab" data-t="guide">'+ICO.book+' '+esc(t('tab_guide', null, 'Guide'))+'</button>';
  h += '</div>';

  // ── Tab content ──
  // SECURITY: All data passed through esc() (textContent-based entity encoding, line 470)
  // before regex syntax highlighting adds only hardcoded span tags.
  // No user-controlled data enters without esc() gate.
  if(currentTab === 'recipes') h += renderRecipesTab(total);
  else if(currentTab === 'presets') h += renderPresetsTab();
  else if(currentTab === 'import') h += renderImportTab();
  else if(currentTab === 'export') h += renderExportTab();
  else if(currentTab === 'guide') h += renderGuideTab();

  app.innerHTML = h;
  if(currentTab === 'recipes') setupDD();
}

function renderRecipesTab(total){
  const g = grp(searchQ), cs = Object.keys(g).sort();
  const isSearch = searchQ.length > 0;
  let h = '';

  // Toolbar
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  h += '<div style="display:flex;gap:8px;align-items:center">';
  h += '<div class="'+cx(UI.searchWrap, 'rcat-search-wrap')+'"><input type="text" class="'+cx(UI.search, 'rcat-search')+'" placeholder="'+ea(t('search_entries_placeholder', null, 'Search entries...'))+'" value="'+ea(searchQ)+'" data-a="search"></div>';
  h += '</div>';
  h += '<div style="display:flex;gap:8px">';
  h += '<button class="btn btn-primary btn-sm" data-a="pnl" data-p="add">'+esc(t('add_entry_button', null, '+ Add'))+'</button>';
  if(total>0) h += '<button class="btn btn-danger btn-sm" data-a="del-all">'+esc(t('clear_catalog_button', null, 'Clear Catalog'))+'</button>';
  h += '</div></div>';

  // Stats
  h += '<div class="'+cx(UI.stats, 'rcat-stats')+'">';
  h += '<div class="'+cx(UI.stat, 'rcat-stat')+'"><b>'+total+'</b> '+esc(t('entries_label', null, 'entries'))+'</div>';
  h += '<div class="'+cx(UI.stat, 'rcat-stat')+'"><b>'+cs.length+'</b> '+esc(t('categories_label', null, 'categories'))+(isSearch ? esc(t('categories_filtered_suffix', null, ' (filtered)')) : '')+'</div>';
  h += '</div>';
  h += '<p style="margin:10px 0 0;font-size:13px;color:var(--tx-2)">Category and tags describe <b>what a recipe does</b>. Recipe source labels describe <b>where the recipe came from</b> (for example an older import bundle like Legacy CSS Bundle 2). Runtime presets are managed separately in the <b>Presets</b> tab.</p>';

  // Add panel
  if(panel==='add'||editId==='__new__') h += pnlAdd();

  // Accordions — collapsed by default, paginated rows
  if(cs.length===0&&total===0){
    h += '<div class="emp">'+ICO.empty+'<br>'+t('no_entries_yet_html', null, 'No entries yet.<br>Click <b>+ Add</b> to create one or switch to <b>Import</b>.')+'</div>';
  } else if(cs.length===0){
    h += '<div class="emp">'+t('no_entries_match_html',{query:esc(searchQ)},'No entries match "<b>{query}</b>"')+'</div>';
  } else {
    cs.forEach(function(cat){
      var items=g[cat], ids=Object.keys(items);
      // Default: collapsed unless user explicitly opened or searching
      var isO = isSearch ? true : (openC[cat] === true);
      h += '<div class="acc">';
      h += '<div class="acc-h'+(isO?' open':'')+'" data-a="toggle" data-cat="'+ea(cat)+'">';
      h += ICO.chevron+'<span>'+esc(cat)+'</span>';
      h += '<span class="acc-ct"><span class="badge-count">'+ids.length+'</span></span></div>';
      h += '<div class="acc-b'+(isO?' open':'')+'">';
      if(isO){
        // Only render visible page of items
        var limit = catPage[cat] || PAGE_SIZE;
        var shown = Math.min(ids.length, limit);
        for(var i=0;i<shown;i++){
          var id=ids[i];
          h += (editId===id) ? editForm(id) : row(id,items[id],cat);
        }
        if(shown < ids.length){
          var remaining = ids.length - shown;
          h += '<div style="padding:8px 16px;text-align:center;border-top:1px solid var(--brd,#1a1a1a)">';
          h += '<button class="btn btn-sm" data-a="load-more" data-cat="'+ea(cat)+'" data-next="'+(shown+PAGE_SIZE)+'">Load '+Math.min(remaining,PAGE_SIZE)+' more ('+remaining+' remaining)</button>';
          h += '</div>';
        }
      }
      h += '</div></div>';
    });
  }
  return h;
}

function renderPresetsTab(){
  const presets = getPresetEntries();
  const activeKey = getActivePresetKey();
  let h = '';

  h += '<div class="'+cx(UI.stats, 'rcat-stats')+'">';
  h += '<div class="'+cx(UI.stat, 'rcat-stat', 'ok')+'"><b>'+esc(getActivePresetLabel())+'</b> '+esc(t('active_in_editor_suffix', null, 'active in editor'))+'</div>';
  h += '<div class="'+cx(UI.stat, 'rcat-stat')+'"><b>'+presets.length+'</b> '+esc(t('runtime_preset_profiles_suffix', null, 'runtime preset profiles'))+'</div>';
  h += '</div>';
  h += '<p class="'+cx(UI.presetNote, 'rcat-preset-note')+'">A <b>preset</b> itt teljes runtime recipe-profilt jelent. Amit itt aktívra állítasz, az szinkronizálódik a Bricks editor Recipe Catalog nézetébe és az autocomplete-be is. Az editor oldalon presetet váltani nem lehet.</p>';

  if(!presets.length){
    h += '<div class="emp">'+esc(t('no_runtime_preset_profiles', null, 'No runtime preset profiles available.'))+'</div>';
    return h;
  }

  h += '<div class="'+cx(UI.presetGrid, 'rcat-preset-grid')+'">';
  presets.forEach(function(entry){
    const isActive = entry.key === activeKey || entry.active;
    h += '<div class="'+cx(UI.presetCard, 'rcat-preset-card', isActive ? 'is-active' : '')+'">';
    h += '<div class="'+cx(UI.presetHeader, 'rcat-preset-header')+'">';
    h += '<div class="'+cx(UI.presetMain, 'rcat-preset-main')+'">';
    h += '<div class="'+cx(UI.presetTitleRow, 'rcat-preset-title-row')+'">';
    h += '<h3>'+esc(entry.label)+'</h3>';
    if(entry.managed) h += '<span class="badge">'+esc(t('managed_badge', null, 'Managed'))+'</span>';
    if(isActive) h += '<span class="badge" style="background:var(--green-s);color:var(--green)">'+esc(t('active_button', null, 'Active'))+'</span>';
    h += '</div>';
    if(entry.description) h += '<p>'+esc(entry.description)+'</p>';
    h += '</div>';
    h += '<div class="'+cx(UI.presetActions, 'rcat-preset-actions')+'">';
    h += '<span class="badge-count">'+entry.count+' '+esc(t('recipes_label', null, 'recipes'))+'</span>';
    if(isActive){
      h += '<button class="btn btn-sm" disabled aria-disabled="true">'+esc(t('active_button', null, 'Active'))+'</button>';
    } else {
      h += '<button class="btn btn-primary btn-sm" data-a="set-active-preset" data-key="'+ea(entry.key)+'">'+esc(t('set_active_button', null, 'Set Active'))+'</button>';
    }
    h += '</div></div></div>';
  });
  h += '</div>';
  return h;
}

function renderImportTab(){
  if (adminViews && typeof adminViews.renderImportTab === 'function') {
    return adminViews.renderImportTab({
      presetOptions: getPresetList(),
      categories: cats()
    });
  }
  return '';
}

function getPresetList(){
  const labelMap = new Map();
  Object.values(recipes).forEach(function(r){
    const key = String(r && r.preset || '').trim();
    if(!key || key === 'shared') return;
    if(labelMap.has(key)) return;
    labelMap.set(key, formatSourceLabel(key, r && (r.presetLabel || '')));
  });
  return [...labelMap.entries()]
    .sort(function(a,b){ return String(a[1] || '').localeCompare(String(b[1] || '')); })
    .map(function(entry){
      return { value: entry[0], label: entry[1] };
    });
}

const formatSourceLabel = adminViews && typeof adminViews.formatSourceLabel === 'function'
  ? adminViews.formatSourceLabel
  : function(value, label){ return String(label || value || ''); };

function renderExportTab(){
  if (adminViews && typeof adminViews.renderExportTab === 'function') {
    return adminViews.renderExportTab({ exportText: expTxt() });
  }
  return '';
}

function renderGuideTab(){
  if (adminViews && typeof adminViews.renderGuideTab === 'function') {
    return adminViews.renderGuideTab();
  }
  return '';
}

/* ── Recipe row ── */
function row(id,r,cat){
  const cs=cats().filter(c=>c!==cat);
  let h='<div class="rw" draggable="true" data-id="'+ea(id)+'">';
  h+='<div class="rw-grip" title="'+ea(t('move_entry_placeholder', null, 'Move entry...'))+'">'+ICO.grip+'</div>';
  h+='<div class="rw-info">';
  h+='<div class="rw-name">'+esc(r.label||id);
  if(r.preset&&r.preset!=='shared') h+=' <span class="badge" style="font-size:10px;padding:2px 8px;margin-left:4px">'+esc(t('entry_source_prefix',{label:formatSourceLabel(r.preset, r.presetLabel||'')},'Source: {label}'))+'</span>';
  h+='</div>';
  if(r.description) h+='<div class="rw-desc">'+esc(r.description)+'</div>';
  h+='<div class="rw-css">'+highlightCss(r.css)+'</div>';
  h+='</div>';
  h+='<div class="rw-acts">';
  h+='<button class="btn btn-sm" data-a="edit" data-id="'+ea(id)+'">'+esc(t('edit_entry_button', null, 'Edit Entry'))+'</button>';
  h+='<button class="btn btn-sm" data-a="dup" data-id="'+ea(id)+'">'+esc(t('copy_entry_button', null, 'Copy'))+'</button>';
  h+='<select data-a="mv" data-id="'+ea(id)+'"><option value="">'+esc(t('move_entry_placeholder', null, 'Move entry...'))+'</option>';
  cs.forEach(c=>{h+='<option value="'+ea(c)+'">'+esc(c)+'</option>';});
  h+='<option value="__new__">'+esc(t('new_catalog_category_option', null, '+ New catalog category'))+'</option></select>';
  h+='<button class="btn btn-sm btn-danger" data-a="del" data-id="'+ea(id)+'" title="'+ea(t('delete_entry_title', null, 'Delete entry'))+'">&#10005;</button>';
  h+='</div></div>';
  return h;
}

function editForm(id){
  const d=editD||recipes[id]||{};
  const presetOptions = getPresetList();
  let h='<div class="ef"><div class="ef-grid">';
  h+='<div><label>'+esc(t('entry_id_label', null, 'Entry ID'))+'</label><input data-f="id" value="'+ea(d.id||id)+'"></div>';
  h+='<div><label>'+esc(t('entry_label_label', null, 'Label'))+'</label><input data-f="label" value="'+ea(d.label||'')+'"></div>';
  h+='<div><label>'+esc(t('entry_category_label', null, 'Category'))+'</label><input data-f="category" value="'+ea(d.category||'')+'" list="'+CATEGORY_DATALIST_ID+'"></div>';
  h+='<datalist id="'+CATEGORY_DATALIST_ID+'">'+cats().map(function(c){return '<option value="'+ea(c)+'">';}).join('')+'</datalist>';
  h+='<div><label>'+esc(t('entry_source_label_field', null, 'Recipe Source Label'))+'</label><input data-f="preset" value="'+ea(d.preset||'shared')+'" list="'+PRESET_DATALIST_ID+'" placeholder="shared"></div>';
  h+='<datalist id="'+PRESET_DATALIST_ID+'"><option value="shared">'+presetOptions.map(function(p){return '<option value="'+ea(p.value)+'" label="'+ea(p.label)+'">';}).join('')+'</datalist>';
  h+='<div><label>'+esc(t('entry_notes_label', null, 'Notes'))+'</label><input data-f="description" value="'+ea(d.description||'')+'"></div>';
  h+='</div><div class="ef-grid ef-full" style="margin-top:8px">';
  h+='<div><label>'+esc(t('entry_css_body_label', null, 'CSS Body (declarations only)'))+'</label><textarea data-f="css" rows="6">'+esc(d.css||'')+'</textarea></div>';
  h+='</div><div class="ef-btns">';
  h+='<button class="btn btn-primary" data-a="save">'+esc(t('save_entry_button', null, 'Save Entry'))+'</button>';
  h+='<button class="btn" data-a="cancel">'+esc(t('cancel_button', null, 'Cancel'))+'</button>';
  h+='</div></div>';
  return h;
}

function pnlAdd(){
  if(editId!=='__new__'){editId='__new__';editD={id:'',label:'',category:'',description:'',css:''};}
  return '<div class="pnl"><div class="pnl-header"><h2>'+esc(t('new_entry_title', null, 'New Entry'))+'</h2><button class="btn btn-sm" data-a="pnl-x">'+esc(t('close_button', null, 'Close'))+'</button></div>'+editForm('__new__')+'</div>';
}

/* ── Event delegation ── */
function handleAppClick(e){
  const b=e.target.closest('[data-a]'); if(!b)return; const a=b.dataset.a, id=b.dataset.id;

  if(a==='tab'){
    currentTab=b.dataset.t;storageWriteCanonical(ACTIVE_TAB_STORAGE_KEY,currentTab,[LEGACY_ACTIVE_TAB_STORAGE_KEY]);
    editId=null;editD=null;panel=null;render();return;
  }
  if(a==='toggle'){if(dragId)return;var c=b.dataset.cat;openC[c]=b.classList.contains('open')?false:true;storageWriteCanonical(OPEN_CATEGORIES_STORAGE_KEY,JSON.stringify(openC),[LEGACY_OPEN_CATEGORIES_STORAGE_KEY]);if(openC[c]){render();}else{b.classList.remove('open');var bd=b.nextElementSibling;if(bd)bd.classList.remove('open');}return;}
  if(a==='load-more'){catPage[b.dataset.cat]=parseInt(b.dataset.next,10)||PAGE_SIZE;render();return;}
  if(a==='edit'){editId=id;editD={...recipes[id],id};panel=null;render();}
  if(a==='del')doDelete(id);
  if(a==='dup')doDup(id);
  if(a==='save'){app.querySelectorAll('.ef [data-f]').forEach(el=>{editD[el.dataset.f]=el.value});doSave();}
  if(a==='cancel'){editId=null;editD=null;if(panel==='add')panel=null;render();}
  if(a==='pnl'){const p=b.dataset.p;panel=panel===p?null:p;if(p==='add'){editId='__new__';editD={id:'',label:'',category:'',description:'',css:''};}else{editId=null;editD=null;}render();}
  if(a==='pnl-x'){panel=null;editId=null;editD=null;render();}
  if(a==='load-file')loadImportFile();
  if(a==='do-imp')doImport();
  if(a==='set-active-preset')doSetActivePreset(b.dataset.key);
  if(a==='del-all')doDeleteAll();
  if(a==='copy-export'){
    const ta=app.querySelector('.pnl textarea[readonly]');
    if(ta){
      copyTextWithFallback(ta.value, {
        navigator: window.navigator || null,
        document: document,
        window: window,
        allowPrompt: false
      }).then(function(result){
        if(runtime.isDestroyed()) return;
        if(result && result.status === 'copied'){
          toast(t('catalog_snapshot_copied', null, 'Catalog snapshot copied'));
          return;
        }
        toast(t('catalog_snapshot_copy_unavailable', null, 'Catalog snapshot copy is unavailable on this browser.'), 'w');
      });
    }
  }
}

function handleAppInput(e){
  if(e.target.dataset.a==='search'){
    const selectionStart = typeof e.target.selectionStart === 'number' ? e.target.selectionStart : null;
    searchQ=e.target.value;
    searchRenderTimeout.schedule(function () {
      if (runtime.isDestroyed()) return;
      render();
      const i=app.querySelector('.cm6gpt-lite-recipe-catalog__search, .rcat-search');
      if(i){
        if (focusDomNode(i, { context: 'handleAppInput' })) {
          if (selectionStart !== null) i.selectionStart=i.selectionEnd=selectionStart;
        }
      }
    },200);
  }
  if(e.target.id==='imp-text'){
    var cnt=app.querySelector('#imp-count');
    if(cnt){
      var lines=e.target.value.split('\n'), ids=0;
      for(var li=0;li<lines.length;li++){var ln=lines[li].trim();if(ln&&!ln.startsWith('/')&&!ln.startsWith('//')&&!ln.includes(':')&&/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(ln))ids++;}
      cnt.textContent=ids
        ? t(ids > 1 ? 'many_recipes_detected' : 'one_recipe_detected', { count: ids }, ids > 1 ? '{count} recipes detected' : '{count} recipe detected')
        : '';
    }
  }
}

function handleAppChange(e){
  if(e.target.dataset.a==='mv'){const id=e.target.dataset.id;let c=e.target.value;if(!c)return;if(c==='__new__'){c=prompt(t('new_category_prompt', null, 'New catalog category name:'));if(!c){e.target.value='';return;}}doMove(id,c);}
  if(e.target.id==='imp-file')loadImportFile();
  if(e.target.id==='imp-preset'&&e.target.value==='__new__'){
    var np=prompt(t('new_source_label_prompt', null, 'New recipe source label (e.g. "legacy_css_bundle_2"):'));
    if(np){np=np.trim().toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z0-9_]/g,'');if(np){var o=document.createElement('option');o.value=np;o.textContent=np.replace(/_/g,' ').replace(/\b\w/g,function(l){return l.toUpperCase();});e.target.insertBefore(o,e.target.querySelector('option[value="__new__"]'));e.target.value=np;}else{e.target.value='shared';}}else{e.target.value='shared';}
  }
}

/* ── Drag & Drop ── */
function setupDD(){
  app.querySelectorAll('.rw[draggable]').forEach(el=>{
    el.addEventListener('dragstart',e=>{dragId=el.dataset.id;el.classList.add('drag');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);});
    el.addEventListener('dragend',()=>{el.classList.remove('drag');dragResetTimeout.schedule(function () { dragId=null; },50);app.querySelectorAll('.drop').forEach(x=>x.classList.remove('drop'));});
  });
  app.querySelectorAll('.acc-h').forEach(el=>{
    el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('drop');});
    el.addEventListener('dragleave',()=>el.classList.remove('drop'));
    el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('drop');const id=e.dataTransfer.getData('text/plain'),cat=el.dataset.cat;if(id&&cat&&recipes[id]&&recipes[id].category!==cat)doMove(id,cat);});
  });
}

/* ── Keyboard shortcut ── */
function handleDocumentKeydown(e){
  if((e.metaKey||e.ctrlKey)&&e.key==='s'){
    e.preventDefault();
    if(editId&&editD){app.querySelectorAll('.ef [data-f]').forEach(el=>{editD[el.dataset.f]=el.value});doSave();}
  }
}

runtime.bind(app,'click',handleAppClick);
runtime.bind(app,'input',handleAppInput);
runtime.bind(app,'change',handleAppChange);
runtime.bind(document,'keydown',handleDocumentKeydown);

/* ── Init ── */
render();
})();
