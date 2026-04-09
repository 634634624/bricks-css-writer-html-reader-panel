<?php
/**
 * CM6GPT Lite Uninstall Handler.
 *
 * Cleans up all plugin data from wp_options on deletion.
 *
 * @package CM6GPT_Lite
 * @since   0.1.1-lite
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$cm6gpt_lite_option_keys = [
	'cm6gpt_lite_admin_recipes_v1',
	'cm6gpt_lite_recipe_manager_blocked_v1',
	'cm6gpt_lite_recipe_preset_profiles_v1',
	'recipe_catalog_recipes',
	'recipe_catalog_blocked',
	'cm6gpt_lite_recipe_manager_local_sources_cache_v1',
];

foreach ( $cm6gpt_lite_option_keys as $option_key ) {
	delete_option( $option_key );
}
