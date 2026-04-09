(function(){
  var IMPORT_CATEGORY_DATALIST_ID = 'cm6gpt-lite-recipe-catalog-import-categories';

  function fallbackEsc(value){
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function createI18n(messages){
    messages = messages && typeof messages === 'object' ? messages : {};
    return function t(key, replacements, fallback){
      var template = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : fallback;
      if (typeof template !== 'string') template = String(key || '');
      if (!replacements || typeof replacements !== 'object') return template;
      return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, name){
        return Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match;
      });
    };
  }

  function create(opts){
    opts = opts || {};
    var icons = opts.icons || {};
    var esc = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : fallbackEsc;
    var ea = typeof opts.escapeAttr === 'function' ? opts.escapeAttr : function(value){
      return esc(value).replace(/"/g, '&quot;');
    };
    var t = createI18n(opts.i18n);
    var sourceLabelMap = opts.sourceLabelMap && typeof opts.sourceLabelMap === 'object' ? opts.sourceLabelMap : {};

    function formatSourceLabel(value, label){
      var rawLabel = String(label || '').trim();
      var key = String(value || '').trim();
      var normalizedKey = key.toLowerCase();
      var normalizedLabel = rawLabel.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
      var legacyLookup = {
        'shared': sourceLabelMap.shared || 'Shared Library',
        'all classes': sourceLabelMap.all_classes || 'All Classes Import',
        'css recipes': sourceLabelMap.css_recipes || 'Legacy CSS Bundle 1',
        'css recipes part 2': sourceLabelMap.css_recipes_part_2 || 'Legacy CSS Bundle 2',
        'css recipes part 3': sourceLabelMap.css_recipes_part_3 || 'Legacy CSS Bundle 3',
        'layout': sourceLabelMap.layout || 'Layout Bundle',
        'extra': sourceLabelMap.extra || 'Extra Bundle',
        'vertical affiliate': sourceLabelMap.vertical_affiliate || 'Vertical Affiliate Bundle',
        'desktop first': sourceLabelMap.desktop_first || 'Desktop First Bundle',
        'mobile first intrinsic': sourceLabelMap.mobile_first_intrinsic || 'Mobile First Intrinsic Bundle'
      };

      if (Object.prototype.hasOwnProperty.call(sourceLabelMap, normalizedKey)) return sourceLabelMap[normalizedKey];
      if (Object.prototype.hasOwnProperty.call(legacyLookup, normalizedLabel)) return legacyLookup[normalizedLabel];
      if (rawLabel) return rawLabel;
      if (!key) return sourceLabelMap.shared || 'Shared Library';
      return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
    }

    function renderImportTab(context){
      context = context || {};
      var presetOptions = Array.isArray(context.presetOptions) ? context.presetOptions : [];
      var categories = Array.isArray(context.categories) ? context.categories : [];
      var h = '<div class="pnl">';
      h += '<div class="pnl-header"><h2>'+esc(t('import_title', null, 'Bulk Import with Recipe Source Label'))+'</h2></div>';
      h += '<p style="margin:0 0 12px;font-size:13px;color:var(--tx-2)">Paste CSS recipes in selectorless format. All imported entries get the selected recipe source label. Category and tags stay semantic; the source label only tracks origin/provenance. Runtime preset profiles are managed separately in the Presets tab.</p>';
      h += '<div class="fmt">/ Layout > Grid\n// Two-column utility for cards\ncards-grid\ndisplay: grid;\ngrid-template-columns: repeat(2, minmax(0, 1fr));\ngap: var(--space-m);</div>';
      h += '<div style="display:flex;gap:8px;align-items:end;margin-bottom:12px;flex-wrap:wrap">';
      h += '<div style="flex:1;min-width:200px"><label style="display:block;font-size:11px;font-weight:600;color:var(--tx-2);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">'+esc(t('import_source_label', null, 'Recipe Source Label'))+'</label>';
      h += '<select id="imp-preset" style="width:100%;padding:8px 12px;border:1px solid var(--brd);border-radius:var(--radius-xs);background:var(--inp);color:var(--tx);font-size:13px;outline:none">';
      h += '<option value="shared">'+esc(t('shared_source_no_label', null, 'Shared source (no label)'))+'</option>';
      presetOptions.forEach(function(option){
        h += '<option value="'+ea(option.value)+'">'+esc(option.label)+'</option>';
      });
      h += '<option value="__new__">'+esc(t('create_new_source_label', null, '+ Create new source label...'))+'</option>';
      h += '</select></div>';
      h += '<div style="flex:1;min-width:200px"><label style="display:block;font-size:11px;font-weight:600;color:var(--tx-2);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">'+esc(t('import_category_label', null, 'Category'))+'</label>';
      h += '<input id="imp-category" style="width:100%;padding:8px 12px;border:1px solid var(--brd);border-radius:var(--radius-xs);background:var(--inp);color:var(--tx);font-size:13px;outline:none;box-sizing:border-box" value="Imported Recipes" placeholder="'+ea(t('import_category_placeholder', null, 'Category for imported entries'))+'" list="'+IMPORT_CATEGORY_DATALIST_ID+'"></div>';
      h += '<datalist id="'+IMPORT_CATEGORY_DATALIST_ID+'">'+categories.map(function(category){ return '<option value="'+ea(category)+'">'; }).join('')+'</datalist>';
      h += '</div>';
      h += '<div class="file-row"><input type="file" id="imp-file" accept=".txt,.css,.md,.recipe,text/plain,text/css"><button class="btn btn-sm" data-a="load-file">'+esc(t('load_catalog_file_button', null, 'Load Catalog File'))+'</button></div>';
      h += '<textarea id="imp-text" placeholder="Paste entries in selectorless format...\n\nExample:\ncard-grid\ndisplay: grid;\ngrid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\ngap: 1.5rem;\n\ncontent-box\npadding: 1.5rem;\nborder-radius: 0.75rem;\nbackground: var(--surface);" style="min-height:320px"></textarea>';
      h += '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">';
      h += '<button class="btn btn-primary" data-a="do-imp">'+esc(t('import_all_recipes_button', null, 'Import All Recipes'))+'</button>';
      h += '<span id="imp-count" style="font-size:12px;color:var(--tx-3)"></span>';
      h += '</div>';
      h += '</div>';
      return h;
    }

    function renderExportTab(context){
      context = context || {};
      var exportText = String(context.exportText || '');
      var h = '<div class="pnl">';
      h += '<div class="pnl-header"><h2>'+esc(t('export_title', null, 'Catalog Export'))+'</h2><button class="btn btn-sm" data-a="copy-export">'+esc(t('copy_catalog_snapshot', null, 'Copy Catalog Snapshot'))+'</button></div>';
      h += '<textarea readonly onclick="this.select()">'+esc(exportText)+'</textarea>';
      h += '<p style="margin:8px 0 0;font-size:13px;color:var(--tx-2)">'+esc(t('export_readonly_note', null, 'Read-only snapshot of the current catalog.'))+'</p>';
      h += '</div>';
      return h;
    }

    function guideSection(icon, title, body, open){
      return '<details class="guide-acc"'+(open ? ' open' : '')+'>'
        +'<summary class="guide-acc-h"><span class="guide-ico">'+icon+'</span><span>'+title+'</span>'+(icons.chevron || '')+'</summary>'
        +'<div class="guide-acc-b">'+body+'</div></details>';
    }

    function renderGuideTab(){
      var h = '<div class="guide-wrap">';
      h += '<div class="guide-section-title">'+(icons.book || '')+' User Guide</div>';
      h += '<p class="guide-intro">Everything you need to know to use CM6GPT Lite in the Bricks Builder.</p>';
      h += guideSection(icons.zap || '', 'What is CM6GPT Lite?',
        '<p>CM6GPT Lite is a <b>CSS writing panel</b> that docks to the bottom of the Bricks Builder editor. '
        +'It gives you a full-featured code editor (CodeMirror 6) with syntax highlighting, autocomplete, and live sync - '
        +'so you can write CSS directly on any selected element without leaving the visual editor.</p>'
        +'<p>It also includes a read-only <b>HTML inspector</b> that shows the structure of the selected element.</p>'
        +'<div class="guide-features">'
        +'<div class="guide-feat">'+(icons.penTool || '')+' <b>CSS Editor</b> - write CSS with syntax highlighting</div>'
        +'<div class="guide-feat">'+(icons.layers || '')+' <b>Live Sync</b> - changes apply instantly to the element</div>'
        +'<div class="guide-feat">'+(icons.chefHat || '')+' <b>Recipe Catalog</b> - insert reusable CSS snippets</div>'
        +'<div class="guide-feat">'+(icons.variable || '')+' <b>Variable Autocomplete</b> - your Bricks variables, auto-detected</div>'
        +'</div>', true);
      h += guideSection(icons.penTool || '', 'CSS Editor',
        '<p>The CSS editor is the main writing area. When you select an element in Bricks, the editor automatically loads its CSS.</p>'
        +'<h4>Write Targets</h4>'
        +'<table class="guide-tbl"><tbody>'
        +'<tr><td><code>class</code></td><td>Writes CSS to the element\'s class selector (default). Best for reusable styles.</td></tr>'
        +'<tr><td><code>id</code></td><td>Writes CSS to the element\'s unique ID selector. Best for one-off overrides.</td></tr>'
        +'</tbody></table>'
        +'<p>Click the <b>target chips</b> in the context row (above the editor) to switch between class and ID.</p>');
      h += guideSection(icons.chefHat || '', 'Recipe Catalog - Insert Reusable CSS',
        '<p>Recipes are pre-built CSS snippets that you can insert into the editor with a single action.</p>'
        +'<div class="guide-steps">'
        +'<div class="guide-step"><span class="guide-step-n">1</span> Type <b><code>@</code></b> in the editor - the autocomplete dropdown appears with matching recipes.</div>'
        +'<div class="guide-step"><span class="guide-step-n">2</span> Keep typing the recipe name to filter.</div>'
        +'<div class="guide-step"><span class="guide-step-n">3</span> Press <b>Enter</b> or <b>Tab</b> to insert the recipe CSS at the cursor.</div>'
        +'</div>');
      h += guideSection(icons.variable || '', 'Variable Autocomplete',
        '<p>CM6GPT Lite automatically detects all your <b>Bricks global CSS variables</b> and makes them available for autocomplete.</p>'
        +'<div class="guide-steps">'
        +'<div class="guide-step"><span class="guide-step-n">1</span> Type <b><code>$</code></b> followed by the variable name.</div>'
        +'<div class="guide-step"><span class="guide-step-n">2</span> The autocomplete dropdown shows matching variables with their values.</div>'
        +'<div class="guide-step"><span class="guide-step-n">3</span> Press <b>Enter</b> or <b>Tab</b> to insert the full <code>var(--name)</code> syntax automatically.</div>'
        +'</div>');
      h += guideSection(icons.keyboard || '', 'Keyboard Shortcuts',
        '<table class="guide-tbl"><tbody>'
        +'<tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>'
        +'<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Redo</td></tr>'
        +'<tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd></td><td>Copy / Cut / Paste</td></tr>'
        +'<tr><td><kbd>Ctrl</kbd>+<kbd>Space</kbd></td><td>Trigger autocomplete manually</td></tr>'
        +'</tbody></table>');
      h += guideSection(icons.alertTriangle || '', 'Limitations & Good to Know',
        '<ul class="guide-list">'
        +'<li><b>CSS only</b> - the editor writes CSS declarations. Full selectors and nested rules belong to page-level scope.</li>'
        +'<li><b>One element at a time</b> - live sync targets the currently selected Bricks element.</li>'
        +'<li><b>Bricks Builder only</b> - the panel appears only inside the Bricks visual editor.</li>'
        +'<li><b>Recipe presets are admin-managed</b> - the active preset is set from the admin page.</li>'
        +'</ul>');
      h += '<div class="guide-section-title" style="margin-top:32px">'+(icons.cpu || '')+' Technical Reference</div>';
      h += '<p class="guide-intro">How things work under the hood - for developers and advanced users.</p>';
      h += guideSection(icons.fileCode || '', 'How Recipes Work',
        '<p>Recipes are stored as a flat key-value map in a single WordPress option (<code>cm6gpt_lite_admin_recipes_v1</code>).</p>'
        +'<p>Presets are managed profiles stored in <code>cm6gpt_lite_recipe_preset_profiles_v1</code>.</p>');
      h += guideSection(icons.refreshCw || '', 'How Live Sync Works',
        '<div class="guide-steps">'
        +'<div class="guide-step"><span class="guide-step-n">1</span> Keystroke - editor changes trigger a debounced callback.</div>'
        +'<div class="guide-step"><span class="guide-step-n">2</span> Bridge - the CSS bridge reads content and current target/scope.</div>'
        +'<div class="guide-step"><span class="guide-step-n">3</span> Bricks API - writes CSS into the element model.</div>'
        +'<div class="guide-step"><span class="guide-step-n">4</span> Re-render - Bricks re-renders the element with updated CSS.</div>'
        +'</div>');
      h += '</div>';
      return h;
    }

    return {
      t: t,
      formatSourceLabel: formatSourceLabel,
      renderImportTab: renderImportTab,
      renderExportTab: renderExportTab,
      renderGuideTab: renderGuideTab
    };
  }

  window.CM6GPTLiteRecipeCatalogAdminViews = {
    create: create
  };
  window.CM6GPTLiteRCATAdminViews = window.CM6GPTLiteRecipeCatalogAdminViews;
})();
