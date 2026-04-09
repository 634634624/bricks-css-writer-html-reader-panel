<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue and bootstrap the Recipe Catalog admin SPA assets.
 *
 * @since 0.2.0-lite
 */
class CM6GPT_Lite_Recipe_Admin_Assets {

	/** @var array<string, mixed> */
	private array $admin_page_config;

	/** @var array<string, callable> */
	private array $callbacks;

	private const AJAX_ACTION_PREFIX             = 'cm6gpt_lite_recipe_catalog_';
	private const LEGACY_AJAX_ACTION_PREFIX      = 'rcat_';
	private const NONCE_ACTION                   = 'cm6gpt_lite_recipe_catalog';
	private const LEGACY_NONCE_ACTION            = 'rcat';
	private const STORAGE_KEY_ACTIVE_TAB         = 'cm6gpt_lite_recipe_catalog_tab_v1';
	private const STORAGE_KEY_OPEN_CATEGORIES    = 'cm6gpt_lite_recipe_catalog_open_categories_v1';
	private const LEGACY_STORAGE_KEY_ACTIVE_TAB  = 'rcat_tab';
	private const LEGACY_STORAGE_KEY_OPEN_CATEGORIES = 'rcat_c';

	/**
	 * @since 0.2.0-lite
	 *
	 * @param array<string, mixed>    $admin_page_config Admin page configuration.
	 * @param array<string, callable> $callbacks         Required data providers.
	 */
	public function __construct( array $admin_page_config, array $callbacks ) {
		$this->admin_page_config = $admin_page_config;
		$this->callbacks         = CM6GPT_Lite_Recipe_Callback_Guards::require_map(
			$callbacks,
			[ 'auto_import', 'blocked', 'build_runtime_preset_policy', 'get_storage_policy' ],
			__CLASS__
		);
	}

	/**
	 * Enqueue dedicated assets for the Recipe Catalog admin SPA.
	 *
	 * @since 0.2.0-lite
	 * @return void
	 */
	public function enqueue(): void {
		if ( ! $this->is_recipe_manager_admin_request() ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$style_rel   = 'assets/css/cm6gpt-rcat-admin.css';
		$helper_rel  = 'assets/js/cm6gpt-rcat-admin-views.js';
		$shared_rel  = 'assets/js/cm6gpt-bridge-shared.js';
		$script_rel  = 'assets/js/cm6gpt-rcat-admin.js';
		$style_path  = CM6GPT_LITE_DIR . $style_rel;
		$helper_path = CM6GPT_LITE_DIR . $helper_rel;
		$shared_path = CM6GPT_LITE_DIR . $shared_rel;
		$script_path = CM6GPT_LITE_DIR . $script_rel;
		$style_ver   = file_exists( $style_path ) ? (string) filemtime( $style_path ) : CM6GPT_LITE_VERSION;
		$helper_ver  = file_exists( $helper_path ) ? (string) filemtime( $helper_path ) : CM6GPT_LITE_VERSION;
		$shared_ver  = file_exists( $shared_path ) ? (string) filemtime( $shared_path ) : CM6GPT_LITE_VERSION;
		$script_ver  = file_exists( $script_path ) ? (string) filemtime( $script_path ) : CM6GPT_LITE_VERSION;

		wp_enqueue_style(
			'cm6gpt-lite-recipe-catalog-admin-style',
			CM6GPT_LITE_URL . $style_rel,
			[],
			$style_ver
		);

		wp_enqueue_script(
			'cm6gpt-lite-recipe-catalog-admin-views',
			CM6GPT_LITE_URL . $helper_rel,
			[],
			$helper_ver,
			true
		);

		wp_enqueue_script(
			'cm6gpt-lite-bridge-shared',
			CM6GPT_LITE_URL . $shared_rel,
			[],
			$shared_ver,
			true
		);

		wp_enqueue_script(
			'cm6gpt-lite-recipe-catalog-admin',
			CM6GPT_LITE_URL . $script_rel,
			[ 'cm6gpt-lite-recipe-catalog-admin-views', 'cm6gpt-lite-bridge-shared' ],
			$script_ver,
			true
		);

		wp_add_inline_script(
			'cm6gpt-lite-recipe-catalog-admin',
			'window.CM6GPTLiteRecipeCatalog = ' . wp_json_encode( $this->build_bootstrap() ) . '; window.RCAT = window.CM6GPTLiteRecipeCatalog;',
			'before'
		);
	}

	/**
	 * Check whether the current admin request targets this recipe manager page.
	 *
	 * @since 0.2.0-lite
	 * @return bool
	 */
	private function is_recipe_manager_admin_request(): bool {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only screen detection
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';

		$menu_slug        = sanitize_key( (string) ( $this->admin_page_config['menu_slug'] ?? '' ) );
		$legacy_menu_slug = sanitize_key( (string) ( $this->admin_page_config['legacy_menu_slug'] ?? '' ) );

		return '' !== $page && in_array(
			$page,
			array_values(
				array_filter(
					array_unique( [ $menu_slug, $legacy_menu_slug ] ),
					static function( string $slug ): bool {
						return '' !== $slug;
					}
				)
			),
			true
		);
	}

	/**
	 * Build the small bootstrap payload consumed by the admin SPA.
	 *
	 * @since 0.2.0-lite
	 * @return array<string, mixed>
	 */
	private function build_bootstrap(): array {
		$recipes = ( $this->callbacks['auto_import'] )();
		$recipes = is_array( $recipes ) ? $recipes : [];
		$blocked = ( $this->callbacks['blocked'] )();
		$blocked = is_array( $blocked ) ? $blocked : [];

		return [
			'r'   => $recipes,
			'n'   => wp_create_nonce( self::NONCE_ACTION ),
			'u'   => admin_url( 'admin-ajax.php' ),
			'b'   => count( $blocked ),
			'p'   => ( $this->callbacks['build_runtime_preset_policy'] )( $recipes ),
			'cfg' => $this->build_client_config(),
			'i18n' => $this->build_i18n(),
			'slm' => $this->build_source_label_map(),
		];
	}

	/**
	 * Build canonical and legacy client identifiers for the admin SPA.
	 *
	 * @since 0.2.0-lite
	 * @return array<string, mixed>
	 */
	private function build_client_config(): array {
		$storage_policy = ( $this->callbacks['get_storage_policy'] )();
		$storage_policy = is_array( $storage_policy ) ? $storage_policy : [];

		return [
			'menuSlug'               => (string) ( $this->admin_page_config['menu_slug'] ?? '' ),
			'legacyMenuSlug'         => (string) ( $this->admin_page_config['legacy_menu_slug'] ?? '' ),
			'ajaxActionPrefix'       => self::AJAX_ACTION_PREFIX,
			'legacyAjaxActionPrefix' => self::LEGACY_AJAX_ACTION_PREFIX,
			'nonceAction'            => self::NONCE_ACTION,
			'legacyNonceAction'      => self::LEGACY_NONCE_ACTION,
			'storageKeys'            => [
				'activeTab'      => self::STORAGE_KEY_ACTIVE_TAB,
				'openCategories' => self::STORAGE_KEY_OPEN_CATEGORIES,
			],
			'legacyStorageKeys'      => [
				'activeTab'      => self::LEGACY_STORAGE_KEY_ACTIVE_TAB,
				'openCategories' => self::LEGACY_STORAGE_KEY_OPEN_CATEGORIES,
			],
			'domIds'                 => [
				'wrap'   => 'cm6gpt-lite-recipe-catalog-wrap',
				'app'    => 'cm6gpt-lite-recipe-catalog-app',
				'toasts' => 'cm6gpt-lite-recipe-catalog-toasts',
			],
			'legacyDomIds'           => [
				'wrap'   => 'rcat-wrap',
				'app'    => 'rcat-app',
				'toasts' => 'rcat-toasts',
			],
			'adminViewsGlobal'       => 'CM6GPTLiteRecipeCatalogAdminViews',
			'legacyAdminViewsGlobal' => 'CM6GPTLiteRCATAdminViews',
			'storagePolicy'          => $storage_policy,
		];
	}

	/**
	 * Build translated admin-SPA UI strings.
	 *
	 * @since 0.2.0-lite
	 * @return array<string, string>
	 */
	private function build_i18n(): array {
		return [
			'missing_admin_bootstrap_payload' => __( 'Missing admin bootstrap payload.', 'cm6gpt-lite' ),
			'missing_admin_mount_node'        => __( 'Missing #cm6gpt-lite-recipe-catalog-app mount node.', 'cm6gpt-lite' ),
			'request_failed_connection'       => __( 'Request failed. Check your connection and try again.', 'cm6gpt-lite' ),
			'session_expired_reload'          => __( 'Session expired. Reload the page and try again.', 'cm6gpt-lite' ),
			'unexpected_server_response'      => __( 'Unexpected server response. Reload and try again.', 'cm6gpt-lite' ),
			'generic_error'                   => __( 'Error', 'cm6gpt-lite' ),
			'id_required'                     => __( 'ID is required', 'cm6gpt-lite' ),
			'id_prefix_invalid'               => __( 'ID cannot start with c- or v-', 'cm6gpt-lite' ),
			'id_btcc_invalid'                 => __( 'ID cannot contain "btcc"', 'cm6gpt-lite' ),
			'category_required'               => __( 'Category is required', 'cm6gpt-lite' ),
			'css_required'                    => __( 'CSS is required', 'cm6gpt-lite' ),
			'delete_entry_confirm'            => __( 'Delete entry "{label}"?', 'cm6gpt-lite' ),
			'entry_deleted'                   => __( 'Entry deleted', 'cm6gpt-lite' ),
			'entry_copied'                    => __( 'Entry copied -> {id}', 'cm6gpt-lite' ),
			'entry_moved'                     => __( 'Entry moved -> {category}', 'cm6gpt-lite' ),
			'active_preset_updated'           => __( 'Active preset updated -> {label}', 'cm6gpt-lite' ),
			'paste_entries_first'             => __( 'Paste entries first', 'cm6gpt-lite' ),
			'import_cancelled_no_source_label'=> __( 'Import cancelled - no source label', 'cm6gpt-lite' ),
			'invalid_source_label'            => __( 'Invalid source label', 'cm6gpt-lite' ),
			'import_summary'                  => __( '{count} entries imported with source "{preset}"', 'cm6gpt-lite' ),
			'open_import_first'               => __( 'Open Import first', 'cm6gpt-lite' ),
			'select_import_file_first'        => __( 'Select an import file first', 'cm6gpt-lite' ),
			'import_file_loaded'              => __( 'Import file loaded: {name}', 'cm6gpt-lite' ),
			'import_file_read_failed'         => __( 'Import file read failed', 'cm6gpt-lite' ),
			'clear_catalog_confirm'           => __( 'Clear catalog and remove all {count} entries?', 'cm6gpt-lite' ),
			'catalog_cleared'                 => __( 'Catalog cleared', 'cm6gpt-lite' ),
			'entry_saved_as'                  => __( 'Entry saved as -> {id}', 'cm6gpt-lite' ),
			'entry_saved'                     => __( 'Entry saved', 'cm6gpt-lite' ),
			'catalog_snapshot_copied'         => __( 'Catalog snapshot copied', 'cm6gpt-lite' ),
			'new_source_label_prompt'         => __( 'New recipe source label (e.g. "legacy_css_bundle_2"):', 'cm6gpt-lite' ),
			'new_category_prompt'             => __( 'New catalog category name:', 'cm6gpt-lite' ),
			'topbar_title'                    => __( 'CM6GPT Lite Recipe Catalog', 'cm6gpt-lite' ),
			'active_preset_badge'             => __( 'Active preset: {label}', 'cm6gpt-lite' ),
			'tab_catalog'                     => __( 'Catalog', 'cm6gpt-lite' ),
			'tab_presets'                     => __( 'Presets', 'cm6gpt-lite' ),
			'tab_import'                      => __( 'Import', 'cm6gpt-lite' ),
			'tab_export'                      => __( 'Export', 'cm6gpt-lite' ),
			'tab_guide'                       => __( 'Guide', 'cm6gpt-lite' ),
			'search_entries_placeholder'      => __( 'Search entries...', 'cm6gpt-lite' ),
			'add_entry_button'                => __( '+ Add', 'cm6gpt-lite' ),
			'clear_catalog_button'            => __( 'Clear Catalog', 'cm6gpt-lite' ),
			'entries_label'                   => __( 'entries', 'cm6gpt-lite' ),
			'categories_label'                => __( 'categories', 'cm6gpt-lite' ),
			'recipes_label'                   => __( 'recipes', 'cm6gpt-lite' ),
			'entries_stat'                    => __( '{count} entries', 'cm6gpt-lite' ),
			'categories_stat'                 => __( '{count} categories', 'cm6gpt-lite' ),
			'categories_filtered_suffix'      => __( ' (filtered)', 'cm6gpt-lite' ),
			'no_entries_yet_html'             => __( 'No entries yet.<br>Click <b>+ Add</b> to create one or switch to <b>Import</b>.', 'cm6gpt-lite' ),
			'no_entries_match_html'           => __( 'No entries match "<b>{query}</b>"', 'cm6gpt-lite' ),
			'presets_active_in_editor'        => __( '{label} active in editor', 'cm6gpt-lite' ),
			'runtime_preset_profiles'         => __( '{count} runtime preset profiles', 'cm6gpt-lite' ),
			'active_in_editor_suffix'         => __( 'active in editor', 'cm6gpt-lite' ),
			'runtime_preset_profiles_suffix'  => __( 'runtime preset profiles', 'cm6gpt-lite' ),
			'no_runtime_preset_profiles'      => __( 'No runtime preset profiles available.', 'cm6gpt-lite' ),
			'managed_badge'                   => __( 'Managed', 'cm6gpt-lite' ),
			'active_button'                   => __( 'Active', 'cm6gpt-lite' ),
			'set_active_button'               => __( 'Set Active', 'cm6gpt-lite' ),
			'import_title'                    => __( 'Bulk Import with Recipe Source Label', 'cm6gpt-lite' ),
			'import_source_label'             => __( 'Recipe Source Label', 'cm6gpt-lite' ),
			'shared_source_no_label'          => __( 'Shared source (no label)', 'cm6gpt-lite' ),
			'create_new_source_label'         => __( '+ Create new source label...', 'cm6gpt-lite' ),
			'import_category_label'           => __( 'Category', 'cm6gpt-lite' ),
			'import_category_placeholder'     => __( 'Category for imported entries', 'cm6gpt-lite' ),
			'load_catalog_file_button'        => __( 'Load Catalog File', 'cm6gpt-lite' ),
			'import_all_recipes_button'       => __( 'Import All Recipes', 'cm6gpt-lite' ),
			'export_title'                    => __( 'Catalog Export', 'cm6gpt-lite' ),
			'copy_catalog_snapshot'           => __( 'Copy Catalog Snapshot', 'cm6gpt-lite' ),
			'export_readonly_note'            => __( 'Read-only snapshot of the current catalog.', 'cm6gpt-lite' ),
			'entry_source_prefix'             => __( 'Source: {label}', 'cm6gpt-lite' ),
			'edit_entry_button'               => __( 'Edit Entry', 'cm6gpt-lite' ),
			'copy_entry_button'               => __( 'Copy', 'cm6gpt-lite' ),
			'move_entry_placeholder'          => __( 'Move entry...', 'cm6gpt-lite' ),
			'new_catalog_category_option'     => __( '+ New catalog category', 'cm6gpt-lite' ),
			'delete_entry_title'              => __( 'Delete entry', 'cm6gpt-lite' ),
			'entry_id_label'                  => __( 'Entry ID', 'cm6gpt-lite' ),
			'entry_label_label'               => __( 'Label', 'cm6gpt-lite' ),
			'entry_category_label'            => __( 'Category', 'cm6gpt-lite' ),
			'entry_source_label_field'        => __( 'Recipe Source Label', 'cm6gpt-lite' ),
			'entry_notes_label'               => __( 'Notes', 'cm6gpt-lite' ),
			'entry_css_body_label'            => __( 'CSS Body (declarations only)', 'cm6gpt-lite' ),
			'save_entry_button'               => __( 'Save Entry', 'cm6gpt-lite' ),
			'cancel_button'                   => __( 'Cancel', 'cm6gpt-lite' ),
			'new_entry_title'                 => __( 'New Entry', 'cm6gpt-lite' ),
			'close_button'                    => __( 'Close', 'cm6gpt-lite' ),
			'one_recipe_detected'             => __( '{count} recipe detected', 'cm6gpt-lite' ),
			'many_recipes_detected'           => __( '{count} recipes detected', 'cm6gpt-lite' ),
		];
	}

	/**
	 * Build the localized fixed source-label map used by the admin SPA.
	 *
	 * @since 0.2.0-lite
	 * @return array<string, string>
	 */
	private function build_source_label_map(): array {
		return [
			'shared'                 => __( 'Shared Library', 'cm6gpt-lite' ),
			'all_classes'            => __( 'All Classes Import', 'cm6gpt-lite' ),
			'css_recipes'            => __( 'Legacy CSS Bundle 1', 'cm6gpt-lite' ),
			'css_recipes_part_2'     => __( 'Legacy CSS Bundle 2', 'cm6gpt-lite' ),
			'css_recipes_part_3'     => __( 'Legacy CSS Bundle 3', 'cm6gpt-lite' ),
			'layout'                 => __( 'Layout Bundle', 'cm6gpt-lite' ),
			'extra'                  => __( 'Extra Bundle', 'cm6gpt-lite' ),
			'vertical_affiliate'     => __( 'Vertical Affiliate Bundle', 'cm6gpt-lite' ),
			'desktop_first'          => __( 'Desktop First Bundle', 'cm6gpt-lite' ),
			'mobile_first_intrinsic' => __( 'Mobile First Intrinsic Bundle', 'cm6gpt-lite' ),
			'qminimal'               => __( 'QMinimal', 'cm6gpt-lite' ),
			'qminimal_framework'     => __( 'QMinimal-Framework', 'cm6gpt-lite' ),
		];
	}

}

if ( ! class_exists( 'RCAT_Admin_Assets', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Admin_Assets', 'RCAT_Admin_Assets' );
}
