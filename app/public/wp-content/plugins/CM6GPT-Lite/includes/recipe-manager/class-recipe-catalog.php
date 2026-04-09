<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Facade over Recipe Catalog parsing, import, sanitization, persistence, and admin wiring.
 * The heavy parsing, admin-asset bootstrapping, sanitization, preset policy, and CRUD logic
 * already live in dedicated collaborators; this facade intentionally preserves the public
 * WordPress hook and call surface.
 */
class CM6GPT_Lite_Recipe_Manager {

    const OPT       = 'cm6gpt_lite_admin_recipes_v1';
    const BLOCKED   = 'cm6gpt_lite_recipe_manager_blocked_v1';
    const PRESET_PROFILES = 'cm6gpt_lite_recipe_preset_profiles_v1';
    private $repo;
    private $filter_adapter;
    private $operations;
    private CM6GPT_Lite_Recipe_CSS_Parser $css_parser;
    private CM6GPT_Lite_Recipe_Preset_Manager $preset_manager;
    private CM6GPT_Lite_Recipe_Sanitizer $sanitizer;
    private CM6GPT_Lite_Recipe_Admin_Assets $admin_assets;
    private $admin_page_config = [];
    /** @var array|null Memoized auto_import result — runs at most once per request (W8+W9). */
    private $auto_import_memo = null;

    /**
     * Initialize the recipe manager with sub-components and register hooks.
     *
     * @since 0.1.1-lite
     * @param array $config Admin page configuration overrides.
     */
    public function __construct( array $config = [] ) {
        $this->admin_page_config = wp_parse_args(
            $config,
            [
                'page_title'       => esc_html__( 'CM6GPT Lite Recipe Catalog', 'cm6gpt-lite' ),
                'menu_title'       => esc_html__( 'Recipe Catalog', 'cm6gpt-lite' ),
                'menu_slug'        => 'cm6gpt-lite-recipe-catalog',
                'legacy_menu_slug' => 'recipe-catalog',
                'parent_slug'      => '',
                'capability'       => 'manage_options',
                'icon'             => 'dashicons-editor-code',
                'position'         => 81,
            ]
        );
        $this->repo = new CM6GPT_Lite_Recipe_Repository(
            [
                'recipes' => self::OPT,
                'blocked' => self::BLOCKED,
                'preset_profiles' => self::PRESET_PROFILES,
            ]
        );
        $this->filter_adapter = new CM6GPT_Lite_Recipe_Filter_Adapter();
        $this->css_parser = new CM6GPT_Lite_Recipe_CSS_Parser(
            [
                'sanitize_recipe' => function( string $id, array $recipe, string $fallback_category = 'Imported Recipes' ) {
                    return $this->sanitize_recipe_definition( $id, $recipe, $fallback_category );
                },
                'unique_id' => function( string $candidate, array $existing ) {
                    return $this->unique_recipe_id( $candidate, $existing );
                },
                'normalize_preset' => function( string $value, string $fallback = 'shared' ) {
                    return $this->normalize_recipe_preset( $value, $fallback );
                },
            ]
        );
        $this->preset_manager = new CM6GPT_Lite_Recipe_Preset_Manager(
            [
                'clean_utf8_text'   => function( string $value ) {
                    return $this->css_parser->clean_utf8_text( $value );
                },
                'auto_import'       => function() {
                    return $this->auto_import();
                },
                'repo_get_profiles' => function() {
                    return $this->repo->get_preset_profiles_raw();
                },
                'repo_put_profiles' => function( array $state ) {
                    return $this->repo->update_preset_profiles( $state );
                },
                'is_vertical_recipe' => function( string $id, array $recipe ) {
                    return $this->sanitizer->is_vertical_recipe( $id, $recipe );
                },
            ]
        );
        $this->sanitizer = new CM6GPT_Lite_Recipe_Sanitizer(
            $this->css_parser,
            $this->filter_adapter,
            [
                'normalize_preset' => function( string $value, string $fallback = 'shared' ) {
                    return $this->normalize_recipe_preset( $value, $fallback );
                },
                'normalize_preset_label' => function( string $preset, string $value = '' ) {
                    return $this->normalize_recipe_preset_label( $preset, $value );
                },
                'compact_definition' => function( array $recipe ) {
                    return $this->compact_recipe_definition( $recipe );
                },
            ]
        );
        $this->operations = new CM6GPT_Lite_Recipe_Operations(
            [
                'get' => function() {
                    return $this->get();
                },
                'put' => function( array $recipes ) {
                    return $this->put( $recipes );
                },
                'block' => function( string $id ) {
                    $this->block( $id );
                },
                'unblock' => function( array $ids ) {
                    $this->unblock( $ids );
                },
                'blocked' => function() {
                    return $this->blocked();
                },
                'clear_blocked' => function() {
                    $this->repo->clear_blocked();
                },
                'update_blocked' => function( array $blocked ) {
                    $this->repo->update_blocked( $blocked );
                },
                'payload' => function( array $extra = [] ) {
                    return $this->build_ajax_payload( $extra );
                },
                'set_active_preset' => function( string $key ) {
                    return $this->set_active_preset( $key );
                },
                'normalize_recipe_css' => function( string $css ) {
                    return $this->normalize_recipe_css_conflicts( $css );
                },
                'unique_id' => function( string $candidate, array $existing ) {
                    return $this->unique_recipe_id( $candidate, $existing );
                },
                'parse' => function( string $text ) {
                    return $this->parse( $text );
                },
                'sanitize_recipe' => function( string $id, array $recipe, string $fallback_category = 'Imported Recipes' ) {
                    return $this->sanitize_recipe_definition( $id, $recipe, $fallback_category );
                },
            ]
        );
        $this->admin_assets = new CM6GPT_Lite_Recipe_Admin_Assets(
            $this->admin_page_config,
            [
                'auto_import' => function() {
                    return $this->auto_import();
                },
                'blocked' => function() {
                    return $this->blocked();
                },
                'build_runtime_preset_policy' => function( array $recipes ) {
                    return $this->build_runtime_preset_policy_from_recipes( $recipes );
                },
                'get_storage_policy' => function() {
                    return $this->repo->get_storage_policy();
                },
            ]
        );

        add_action( 'admin_menu', [ $this, 'add_admin_menu' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_admin_page_assets' ] );

        $admin_controller = new CM6GPT_Lite_Recipe_Admin_Controller( $this );
        $admin_controller->register();
    }

    /**
     * Public accessor for the preset manager sub-object.
     *
     * @since 0.2.0-lite
     */
    public function preset_manager(): CM6GPT_Lite_Recipe_Preset_Manager {
        return $this->preset_manager;
    }

    /**
     * Register the Recipe Manager admin menu or submenu page.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function add_admin_menu() {
        $page_title  = (string) $this->admin_page_config['page_title'];
        $menu_title  = (string) $this->admin_page_config['menu_title'];
        $capability  = (string) $this->admin_page_config['capability'];
        $menu_slug   = (string) $this->admin_page_config['menu_slug'];
        $legacy_menu_slug = trim( (string) ( $this->admin_page_config['legacy_menu_slug'] ?? '' ) );
        $parent_slug = trim( (string) $this->admin_page_config['parent_slug'] );

        if ( '' !== $parent_slug ) {
            add_submenu_page(
                $parent_slug,
                $page_title,
                $menu_title,
                $capability,
                $menu_slug,
                [ $this, 'render_page' ]
            );

            if ( '' !== $legacy_menu_slug && $legacy_menu_slug !== $menu_slug ) {
                add_submenu_page(
                    $parent_slug,
                    $page_title,
                    $menu_title,
                    $capability,
                    $legacy_menu_slug,
                    [ $this, 'render_page' ]
                );

                if ( function_exists( 'remove_submenu_page' ) ) {
                    remove_submenu_page( $parent_slug, $legacy_menu_slug );
                }
            }
            return;
        }

        add_menu_page(
            $page_title,
            $menu_title,
            $capability,
            $menu_slug,
            [ $this, 'render_page' ],
            (string) $this->admin_page_config['icon'],
            (int) $this->admin_page_config['position']
        );
    }

    /**
     * Enqueue dedicated assets for the Recipe Catalog admin SPA.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function enqueue_admin_page_assets() {
        $this->admin_assets->enqueue();
    }

    /**
     * Normalize a raw CSS value via the filter adapter.
     *
     * @since 0.1.1-lite
     * @param mixed $value Raw CSS value (array or scalar).
     * @return string Normalized CSS string.
     */
    private function normalize_filter_css( $value ): string {
        return $this->filter_adapter->normalize_css( $value );
    }

    /**
     * Clean invalid UTF-8 sequences from a text value.
     *
     * @since 0.1.1-lite
     * @param string $value Raw text.
     * @return string Cleaned UTF-8 text.
     */
    private function clean_utf8_text( string $value ): string {
        return $this->css_parser->clean_utf8_text( $value );
    }

    /**
     * Normalize a preset key to its canonical slug form.
     *
     * @since 0.1.1-lite
     * @param string $value  Raw preset key.
     * @param string $fallback Fallback value if normalization yields empty.
     * @return string Normalized preset key.
     */
    private function normalize_recipe_preset( string $value, string $fallback = 'shared' ): string {
        return $this->preset_manager->normalize_recipe_preset( $value, $fallback );
    }

    /**
     * Get the preset key-to-label mapping table.
     *
     * @since 0.1.1-lite
     * @return array Associative array of preset keys to display labels.
     */
    private function recipe_preset_label_map(): array {
        return $this->preset_manager->recipe_preset_label_map();
    }

    /**
     * Get legacy preset label alias mappings for backward compatibility.
     *
     * @since 0.1.1-lite
     * @return array Associative array of legacy aliases to canonical preset keys.
     */
    private function legacy_recipe_preset_label_aliases(): array {
        return $this->preset_manager->legacy_recipe_preset_label_aliases();
    }

    /**
     * Get the default human-readable label for a preset key.
     *
     * @since 0.1.1-lite
     * @param string $preset Preset key.
     * @return string Display label.
     */
    private function default_recipe_preset_label( string $preset ): string {
        return $this->preset_manager->default_recipe_preset_label( $preset );
    }

    /**
     * Normalize a preset label to its canonical display form.
     *
     * @since 0.1.1-lite
     * @param string $preset Preset key.
     * @param string $value  Raw label value.
     * @return string Normalized preset label.
     */
    private function normalize_recipe_preset_label( string $preset, string $value = '' ): string {
        return $this->preset_manager->normalize_recipe_preset_label( $preset, $value );
    }

    /**
     * Ensure a recipe array has valid preset and presetLabel fields.
     *
     * @since 0.1.1-lite
     * @param array  $recipe          Recipe definition.
     * @param string $fallback_preset Fallback preset key.
     * @param string $fallback_label  Fallback preset label.
     * @return array Recipe with guaranteed preset metadata.
     */
    private function ensure_recipe_preset_metadata( array $recipe, string $fallback_preset = 'shared', string $fallback_label = '' ): array {
        return $this->preset_manager->ensure_recipe_preset_metadata( $recipe, $fallback_preset, $fallback_label );
    }

    /**
     * Determine whether an existing recipe should adopt a candidate's preset.
     *
     * @since 0.1.1-lite
     * @param array $existing  Existing recipe definition.
     * @param array $candidate Candidate recipe definition from import source.
     * @return bool True if the candidate preset should replace the existing one.
     */
    private function should_adopt_candidate_preset( array $existing, array $candidate ): bool {
        return $this->preset_manager->should_adopt_candidate_preset( $existing, $candidate );
    }

    /**
     * Normalize a preset profile key to its canonical form.
     *
     * @since 0.1.1-lite
     * @param string $value    Raw profile key.
     * @param string $fallback Fallback if normalization yields empty.
     * @return string Normalized profile key.
     */
    private function normalize_preset_profile_key( string $value, string $fallback = 'all' ): string {
        return $this->preset_manager->normalize_preset_profile_key( $value, $fallback );
    }

    /**
     * Normalize and validate preset recipe IDs against the current recipe collection.
     *
     * @since 0.1.1-lite
     * @param array $ids     Raw recipe IDs from the preset.
     * @param array $recipes Current recipe collection.
     * @return array Validated and normalized recipe ID array.
     */
    private function normalize_preset_recipe_ids( array $ids, array $recipes ): array {
        return $this->preset_manager->normalize_preset_recipe_ids( $ids, $recipes );
    }

    /**
     * Check whether a recipe belongs to the vertical affiliate category.
     *
     * @since 0.1.1-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return bool True if the recipe is classified as vertical.
     */
    private function is_vertical_recipe( string $id, array $recipe ): bool {
        return $this->sanitizer->is_vertical_recipe( $id, $recipe );
    }

    /**
     * Check whether a recipe defines interactive state variants (hover, focus, etc.).
     *
     * @since 0.1.1-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return bool True if the recipe is a state definition.
     */
    private function is_state_recipe_definition( string $id, array $recipe ): bool {
        return $this->sanitizer->is_state_recipe_definition( $id, $recipe );
    }

    /**
     * Infer the semantic prefix for a recipe ID (e.g., "u-", "l-", "c-").
     *
     * @since 0.1.1-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return string Inferred prefix or empty string.
     */
    private function infer_recipe_id_prefix( string $id, array $recipe ): string {
        return $this->sanitizer->infer_recipe_id_prefix( $id, $recipe );
    }

    /**
     * Strip known semantic prefixes (u-, l-, c-, etc.) from a recipe ID.
     *
     * @since 0.1.1-lite
     * @param string $value Recipe ID.
     * @return string ID without known prefixes.
     */
    private function strip_known_recipe_prefixes( string $value ): string {
        return $this->sanitizer->strip_known_recipe_prefixes( $value );
    }

    /**
     * Expand a shorthand recipe ID to its full canonical form.
     *
     * @since 0.1.1-lite
     * @param string $value Shorthand recipe ID.
     * @return string Expanded recipe ID.
     */
    private function expand_recipe_id_shorthand( string $value ): string {
        return $this->sanitizer->expand_recipe_id_shorthand( $value );
    }

    /**
     * Prepend a variable-type prefix to a recipe ID if applicable.
     *
     * @since 0.1.1-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return string Recipe ID with variable prefix.
     */
    private function with_variable_recipe_id_prefix( string $id, array $recipe ): string {
        return $this->sanitizer->with_variable_recipe_id_prefix( $id, $recipe );
    }

    /**
     * Prepend a variable-type prefix to a recipe display label if applicable.
     *
     * @since 0.1.1-lite
     * @param string $label  Recipe display label.
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return string Label with variable prefix.
     */
    private function with_variable_recipe_label_prefix( string $label, string $id, array $recipe ): string {
        return $this->sanitizer->with_variable_recipe_label_prefix( $label, $id, $recipe );
    }

    /**
     * Generate a unique recipe ID by appending a numeric suffix if the candidate exists.
     *
     * @since 0.1.1-lite
     * @param string $candidate Desired recipe ID.
     * @param array  $existing  Current recipe collection to check against.
     * @return string Unique recipe ID.
     */
    private function unique_recipe_id( string $candidate, array $existing ): string {
        return $this->sanitizer->unique_recipe_id( $candidate, $existing );
    }

    /* ── Data access ── */

    /**
     * Get all stored recipes from the repository.
     *
     * @since 0.1.1-lite
     * @return array Associative array of recipe definitions.
     */
    private function get()   { return $this->repo->get_recipes_raw(); }

    /**
     * Persist the recipe collection after compacting.
     *
     * @since 0.1.1-lite
     * @param array $r Recipe collection to store.
     * @return true|\WP_Error
     */
    private function put($r) { return $this->repo->update_recipes( is_array( $r ) ? $this->compact_recipe_collection( $r ) : [] ); }

    /**
     * Get the list of blocked recipe IDs.
     *
     * @since 0.1.1-lite
     * @return array Blocked recipe ID list.
     */
    private function blocked(){ return $this->repo->get_blocked(); }

    /**
     * Add a recipe ID to the blocked list.
     *
     * @since 0.1.1-lite
     * @param string $id Recipe ID to block.
     * @return void
     */
    private function block($id){
        $b = $this->blocked(); $b[] = $id; $this->repo->update_blocked( array_unique( $b ) );
    }
    /**
     * Remove recipe IDs from the blocked list.
     *
     * @since 0.1.1-lite
     * @param array|string $ids Recipe ID(s) to unblock.
     * @return void
     */
    private function unblock( $ids ) {
        $b = array_diff( $this->blocked(), (array) $ids );
        $this->repo->update_blocked( array_values( $b ) );
    }

    /* ── Sanitizer delegation stubs ── */

    /**
     * Replace known problematic "etch" word patterns in text.
     *
     * @since 0.1.1-lite
     * @param string $text Input text.
     * @return string Cleaned text.
     */
    private function replace_etch_word( string $text ): string {
        return $this->sanitizer->replace_etch_word( $text );
    }

    /**
     * Remove BTCC watermark tokens from text.
     *
     * @since 0.1.1-lite
     * @param string $text Input text.
     * @return string Text without BTCC tokens.
     */
    private function remove_btcc_token( string $text ): string {
        return $this->sanitizer->remove_btcc_token( $text );
    }

    /**
     * Check whether a recipe defines CSS custom properties (variables).
     *
     * @since 0.1.1-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return bool True if the recipe is a variable definition.
     */
    private function is_variable_recipe_definition( string $id, array $recipe ): bool {
        return $this->sanitizer->is_variable_recipe_definition( $id, $recipe );
    }

    /**
     * Determine whether a recipe should be dropped during sanitization.
     *
     * @since 0.1.1-lite
     * @param string $id             Recipe ID.
     * @param array  $recipe         Recipe definition.
     * @param string $raw_css        Original CSS before normalization.
     * @param string $normalized_css CSS after normalization.
     * @return bool True if the recipe should be dropped.
     */
    private function should_drop_recipe_definition( string $id, array $recipe, string $raw_css, string $normalized_css ): bool {
        return $this->sanitizer->should_drop_recipe_definition( $id, $recipe, $raw_css, $normalized_css );
    }

    /**
     * Check whether a lowercase recipe ID is blacklisted.
     *
     * @since 0.1.1-lite
     * @param string $id_lc Lowercase recipe ID.
     * @return bool True if the ID is blacklisted.
     */
    private function is_blacklisted_recipe_id( string $id_lc ): bool {
        return $this->sanitizer->is_blacklisted_recipe_id( $id_lc );
    }

    /**
     * Check whether a category name should be rewritten to a canonical form.
     *
     * @since 0.1.1-lite
     * @param string $category Category name.
     * @return bool True if rewriting is needed.
     */
    private function should_rewrite_recipe_category( string $category ): bool {
        return $this->sanitizer->should_rewrite_recipe_category( $category );
    }

    /**
     * Infer the category for a recipe from its ID and CSS content.
     *
     * @since 0.1.1-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition.
     * @return string Inferred category name.
     */
    private function infer_recipe_category( string $id, array $recipe ): string {
        return $this->sanitizer->infer_recipe_category( $id, $recipe );
    }

    /**
     * Normalize a recipe category name to its canonical form.
     *
     * @since 0.1.1-lite
     * @param string $category Raw category name.
     * @param string $id       Recipe ID.
     * @param array  $recipe   Recipe definition.
     * @return string Normalized category.
     */
    private function normalize_recipe_category( string $category, string $id, array $recipe ): string {
        return $this->sanitizer->normalize_recipe_category( $category, $id, $recipe );
    }

    /**
     * Normalize a recipe description, cleaning tokens and inferring content.
     *
     * @since 0.1.1-lite
     * @param string $description Raw description text.
     * @param string $id          Recipe ID.
     * @param array  $recipe      Recipe definition.
     * @return string Normalized description.
     */
    private function normalize_recipe_description( string $description, string $id, array $recipe ): string {
        return $this->sanitizer->normalize_recipe_description( $description, $id, $recipe );
    }

    /**
     * Sanitize a full recipe definition, normalizing all fields.
     *
     * @since 0.1.1-lite
     * @param string $id                Recipe ID.
     * @param array  $recipe            Raw recipe definition.
     * @param string $fallback_category Fallback category if none is set.
     * @return array|null Sanitized result with 'id' and 'recipe' keys, or null if rejected.
     */
    private function sanitize_recipe_definition( string $id, array $recipe, string $fallback_category = 'Imported Recipes' ) {
        return $this->sanitizer->sanitize_recipe_definition( $id, $recipe, $fallback_category );
    }

    /* ── CSS parser delegation stubs ── */

    /**
     * Strip CSS comments from recipe CSS text.
     *
     * @since 0.1.1-lite
     * @param string $css Raw CSS.
     * @return string CSS without comments.
     */
    private function strip_recipe_css_comments( string $css ): string {
        return $this->css_parser->strip_recipe_css_comments( $css );
    }

    /**
     * Extract individual CSS declarations from a recipe CSS block.
     *
     * @since 0.1.1-lite
     * @param string $css CSS text.
     * @return array Parsed CSS declarations.
     */
    private function extract_recipe_declarations( string $css ): array {
        return $this->css_parser->extract_recipe_declarations( $css );
    }

    /**
     * Format CSS into a consistently structured, readable form.
     *
     * @since 0.1.1-lite
     * @param string $css Raw CSS text.
     * @return string Formatted CSS.
     */
    private function format_structured_recipe_css( string $css ): string {
        return $this->css_parser->format_structured_recipe_css( $css );
    }

    /**
     * Normalize stack child spacing patterns in recipe CSS.
     *
     * @since 0.1.1-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS.
     * @return string Normalized CSS.
     */
    private function normalize_stack_child_spacing_recipe_css( string $id, string $css ): string {
        return $this->css_parser->normalize_stack_child_spacing_recipe_css( $id, $css );
    }

    /**
     * Normalize auto-grid variant patterns in recipe CSS.
     *
     * @since 0.1.1-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS.
     * @return string Normalized CSS.
     */
    private function normalize_auto_grid_variant_recipe_css( string $id, string $css ): string {
        return $this->css_parser->normalize_auto_grid_variant_recipe_css( $id, $css );
    }

    /**
     * Normalize variable-only variant patterns in recipe CSS.
     *
     * @since 0.1.1-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS.
     * @return string Normalized CSS.
     */
    private function normalize_variable_only_variant_recipe_css( string $id, string $css ): string {
        return $this->css_parser->normalize_variable_only_variant_recipe_css( $id, $css );
    }

    /**
     * Apply ID-specific CSS normalization rules.
     *
     * @since 0.1.1-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS.
     * @return string Normalized CSS.
     */
    private function normalize_recipe_css_by_id( string $id, string $css ): string {
        return $this->css_parser->normalize_recipe_css_by_id( $id, $css );
    }

    /**
     * Resolve known CSS conflict patterns in recipe CSS.
     *
     * @since 0.1.1-lite
     * @param string $css Raw CSS.
     * @return string CSS with conflicts resolved.
     */
    private function normalize_recipe_css_conflicts( string $css ): string {
        return $this->css_parser->normalize_recipe_css_conflicts( $css );
    }

    /**
     * Generate a short human-readable summary of recipe CSS content.
     *
     * @since 0.1.1-lite
     * @param string $css CSS text to summarize.
     * @return string Summary description.
     */
    private function summarize_recipe_css( string $css ): string {
        return $this->css_parser->summarize_recipe_css( $css );
    }

    /* ── Compact helpers ── */

    /**
     * Compact a recipe definition to only the canonical stored fields.
     *
     * @since 0.1.1-lite
     * @param array $recipe Full recipe definition.
     * @return array Compacted recipe with only standard keys.
     */
    private function compact_recipe_definition( array $recipe ): array {
        $recipe = $this->ensure_recipe_preset_metadata(
            $recipe,
            (string) ( $recipe['preset'] ?? 'shared' ),
            (string) ( $recipe['presetLabel'] ?? '' )
        );
        return [
            'id'          => (string) ( $recipe['id'] ?? '' ),
            'label'       => (string) ( $recipe['label'] ?? '' ),
            'category'    => (string) ( $recipe['category'] ?? '' ),
            'description' => (string) ( $recipe['description'] ?? '' ),
            'css'         => (string) ( $recipe['css'] ?? '' ),
            'preset'      => (string) ( $recipe['preset'] ?? 'shared' ),
            'presetLabel' => (string) ( $recipe['presetLabel'] ?? 'Shared' ),
        ];
    }

    /**
     * Compact an entire recipe collection for storage.
     *
     * @since 0.1.1-lite
     * @param array $recipes Associative array of recipe definitions.
     * @return array Compacted recipe collection.
     */
    private function compact_recipe_collection( array $recipes ): array {
        $out = [];
        foreach ( $recipes as $id => $recipe ) {
            $source = is_array( $recipe )
                ? $recipe
                : [
                    'id'          => (string) $id,
                    'label'       => (string) $id,
                    'category'    => 'Imported Recipes',
                    'description' => '',
                    'css'         => (string) $recipe,
                ];
            $compact = $this->compact_recipe_definition( $source );
            if ( '' === (string) ( $compact['id'] ?? '' ) ) {
                $compact['id'] = (string) $id;
            }
            $out[ (string) $id ] = $compact;
        }
        return $out;
    }

    /* ── Preset runtime ── */

    /**
     * Build the runtime preset policy structure from the current recipe collection.
     *
     * @since 0.1.1-lite
     * @param array $recipes Current recipe collection.
     * @return array Preset policy with active preset, allowed IDs, and preset list.
     */
    private function build_runtime_preset_policy_from_recipes( array $recipes ): array {
        return $this->preset_manager->build_runtime_preset_policy_from_recipes( $recipes );
    }

    /**
     * Build an AJAX payload containing preset profile data.
     *
     * @since 0.1.1-lite
     * @param array $extra Additional payload fields to merge.
     * @return array Preset AJAX payload.
     */
    private function build_preset_ajax_payload( array $extra = [] ): array {
        return $this->preset_manager->build_preset_ajax_payload( $extra );
    }

    /**
     * Set the active preset profile by key.
     *
     * @since 0.1.1-lite
     * @param string $key Preset profile key.
     * @return mixed Result from preset manager.
     */
    private function set_active_preset( string $key ) {
        return $this->preset_manager->set_active_preset( $key );
    }

    /* ── Legacy-named runtime recipe accessor ── */

    /**
     * Return the persisted managed recipe collection with per-request memoization.
     *
     * Compatibility accessor only.
     * Returns the persisted plugin-owned catalog only.
     * Performs no filesystem discovery, path walking, or runtime IO.
     *
     * @since 0.1.1-lite
     * @return array Complete managed recipe collection.
     */
    private function auto_import() {
        if ( null !== $this->auto_import_memo ) {
            return $this->auto_import_memo;
        }

        $this->auto_import_memo = $this->get();
        return $this->auto_import_memo;
    }

    /* ── Parser ── */

    /**
     * Parse CSS text into a recipe map using the CSS parser.
     *
     * @since 0.1.1-lite
     * @param mixed $text Raw CSS text.
     * @return array Parsed recipe map keyed by recipe ID.
     */
    private function parse( $text ) {
        return $this->css_parser->parse( (string) $text );
    }

    /**
     * Extract a category name from a CSS comment string.
     *
     * @since 0.1.1-lite
     * @param string $comment  CSS comment text.
     * @param string $fallback Fallback category if extraction fails.
     * @return string Extracted or fallback category.
     */
    private function extract_category_from_comment( string $comment, string $fallback ): string {
        return $this->css_parser->extract_category_from_comment( $comment, $fallback );
    }

    /**
     * Check whether a text line represents a recipe ID header.
     *
     * @since 0.1.1-lite
     * @param string $line Single line of text.
     * @return bool True if the line is a recipe ID line.
     */
    private function is_recipe_id_line( string $line ): bool {
        return $this->css_parser->is_recipe_id_line( $line );
    }

    /**
     * Parse selectorless CSS format (recipe ID headers followed by declarations).
     *
     * @since 0.1.1-lite
     * @param string $text              Raw CSS text in selectorless format.
     * @param string $fallback_category Default category for parsed recipes.
     * @return array Parsed recipe map.
     */
    private function parse_selectorless_format( string $text, string $fallback_category = 'Imported Recipes' ): array {
        return $this->css_parser->parse_selectorless_format( $text, $fallback_category );
    }

    /**
     * Parse CSS text into selector-keyed block pairs.
     *
     * @since 0.1.1-lite
     * @param string $text Raw CSS text.
     * @return array Parsed CSS blocks.
     */
    private function parse_css_blocks( string $text ): array {
        return $this->css_parser->parse_css_blocks( $text );
    }

    /**
     * Parse simple class-based CSS blocks into a recipe map.
     *
     * @since 0.1.1-lite
     * @param string $text              Raw CSS text with class selectors.
     * @param string $fallback_category Default category for parsed recipes.
     * @return array Parsed recipe map.
     */
    private function parse_simple_class_css_blocks( string $text, string $fallback_category = 'Imported CSS' ): array {
        return $this->css_parser->parse_simple_class_css_blocks( $text, $fallback_category );
    }

    /* ── AJAX payload ── */

    /**
     * Build the standard AJAX response payload with recipes, blocked count, and preset policy.
     *
     * @since 0.1.1-lite
     * @param array $extra Additional fields to merge into the payload.
     * @return array AJAX payload.
     */
    public function build_ajax_payload( array $extra = [] ): array {
        $recipes = $this->auto_import();
        return array_merge(
            [
                'recipes'      => $recipes,
                'blockedCount' => count( $this->blocked() ),
                'presetPolicy' => $this->build_runtime_preset_policy_from_recipes( $recipes ),
            ],
            $extra
        );
    }

    /* ── AJAX operations ── */

    /**
     * Delegate save operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @param array $request Sanitized request fields.
     * @return array|\WP_Error Operation result.
     */
    public function operation_save( array $request = [] ) {
        return $this->operations->save( $request );
    }

    /**
     * Delegate delete operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @param array $request Sanitized request fields.
     * @return array|\WP_Error Operation result.
     */
    public function operation_delete( array $request = [] ) {
        return $this->operations->delete( $request );
    }

    /**
     * Delegate duplicate operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @param array $request Sanitized request fields.
     * @return array|\WP_Error Operation result.
     */
    public function operation_duplicate( array $request = [] ) {
        return $this->operations->duplicate( $request );
    }

    /**
     * Delegate move operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @param array $request Sanitized request fields.
     * @return array|\WP_Error Operation result.
     */
    public function operation_move( array $request = [] ) {
        return $this->operations->move( $request );
    }

    /**
     * Delegate bulk import operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @param array $request Sanitized request fields.
     * @return array|\WP_Error Operation result.
     */
    public function operation_bulk_import( array $request = [] ) {
        return $this->operations->bulk_import( $request );
    }

    /**
     * Delegate delete-all operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @return array Operation result.
     */
    public function operation_delete_all() {
        return $this->operations->delete_all();
    }

    /**
     * Delegate set-active-preset operation to the recipe operations handler.
     *
     * @since 0.1.1-lite
     * @param array $request Sanitized request fields.
     * @return mixed Operation result.
     */
    public function operation_set_active_preset( array $request = [] ) {
        return $this->operations->set_active_preset( $request );
    }

    /* ══════════════════════ Admin page ══════════════════════ */

    /**
     * Render the Recipe Manager admin page.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( esc_html__( 'You do not have permission to access this page.', 'cm6gpt-lite' ) );
        }

        CM6GPT_Lite_Recipe_Admin_Page::render();
    }

    /**
     * Get the full runtime recipe collection after auto-import.
     *
     * @since 0.1.1-lite
     * @return array Complete managed recipe collection.
     */
    public function get_runtime_recipes(): array {
        // Builder runtime reads the persisted plugin-owned catalog only.
        // Fresh installs are seeded during activation, so this accessor stays
        // layout-agnostic and free of runtime filesystem lookups.
        return $this->get();
    }

    /**
     * Get the runtime preset policy for the current recipe collection.
     *
     * @since 0.1.1-lite
     * @return array Preset policy with active preset, allowed IDs, and preset list.
     */
    public function get_runtime_preset_policy(): array {
        return $this->build_runtime_preset_policy_from_recipes( $this->get() );
    }
}

if ( ! class_exists( 'Recipe_Catalog', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Manager', 'Recipe_Catalog' );
}
