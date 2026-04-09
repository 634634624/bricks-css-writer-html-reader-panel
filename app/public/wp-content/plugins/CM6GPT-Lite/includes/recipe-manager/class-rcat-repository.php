<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @todo W17: wp_options is not ideal for large recipe datasets. Migrate to a custom table
 *       or split storage strategy in a future pass.
 */
class CM6GPT_Lite_Recipe_Repository {

    private const MAX_RECIPE_COUNT = 2500;
    private const BUNDLED_SEED_RECIPE_HEADROOM = 128;
    private const MAX_RECIPE_OPTION_BYTES = 1572864; // 1.5 MB JSON budget in wp_options.
    private const MAX_PRESET_PROFILE_COUNT = 32;
    private const MAX_PRESET_OPTION_BYTES = 262144; // 256 KB JSON budget in wp_options.

    /** @var int|null Cached bundled seed count so fresh installs never start above the write guard floor. */
    private static ?int $bundled_seed_recipe_count = null;

    private $recipes_key;
    private $blocked_key;
    private $preset_profiles_key;

    /**
     * Initialize repository with wp_options key mapping.
     *
     * @since 0.1.1-lite
     * @param array $keys Associative array mapping logical names to wp_options keys.
     */
    public function __construct( array $keys = [] ) {
        $this->recipes_key = (string) ( $keys['recipes'] ?? 'recipe_catalog_recipes' );
        $this->blocked_key = (string) ( $keys['blocked'] ?? 'recipe_catalog_blocked' );
        $this->preset_profiles_key = (string) ( $keys['preset_profiles'] ?? 'cm6gpt_lite_recipe_preset_profiles_v1' );
    }

    /**
     * Get all stored recipes from wp_options.
     *
     * @since 0.1.1-lite
     * @return array Associative array of recipe definitions keyed by recipe ID.
     */
    public function get_recipes_raw(): array {
        $recipes = get_option( $this->recipes_key, [] );
        return is_array( $recipes ) ? $recipes : [];
    }

    /**
     * Return the active wp_options storage policy for the Lite recipe manager.
     *
     * @since 0.1.1-lite
     * @return array<string,int> Limit map used by write guards.
     */
    public function get_storage_policy(): array {
        return [
            'maxRecipeCount'        => self::effective_max_recipe_count(),
            'maxRecipeOptionBytes'  => self::MAX_RECIPE_OPTION_BYTES,
            'maxPresetProfileCount' => self::MAX_PRESET_PROFILE_COUNT,
            'maxPresetOptionBytes'  => self::MAX_PRESET_OPTION_BYTES,
        ];
    }

    /**
     * Count bundled seed recipes so the Lite write guard always sits above fresh-install baseline.
     *
     * @since 0.2.0-lite
     * @return int
     */
    private static function bundled_seed_recipe_count(): int {
        if ( null !== self::$bundled_seed_recipe_count ) {
            return self::$bundled_seed_recipe_count;
        }

        $path = defined( 'CM6GPT_LITE_DIR' ) ? CM6GPT_LITE_DIR . 'data/recipe-seed.json' : '';
        if ( '' === $path || ! is_readable( $path ) ) {
            self::$bundled_seed_recipe_count = 0;
            return self::$bundled_seed_recipe_count;
        }

        $raw = file_get_contents( $path );
        if ( false === $raw || '' === trim( $raw ) ) {
            self::$bundled_seed_recipe_count = 0;
            return self::$bundled_seed_recipe_count;
        }

        $decoded = json_decode( $raw, true );
        self::$bundled_seed_recipe_count = is_array( $decoded ) ? count( $decoded ) : 0;
        return self::$bundled_seed_recipe_count;
    }

    /**
     * Return the effective Lite recipe-count ceiling for wp_options-backed storage.
     *
     * @since 0.2.0-lite
     * @return int
     */
    private static function effective_max_recipe_count(): int {
        $seed_count = self::bundled_seed_recipe_count();
        if ( $seed_count <= 0 ) {
            return self::MAX_RECIPE_COUNT;
        }

        return max(
            self::MAX_RECIPE_COUNT,
            $seed_count + self::BUNDLED_SEED_RECIPE_HEADROOM
        );
    }

    /**
     * Encode an option payload to JSON and return its byte length.
     *
     * @since 0.1.1-lite
     * @param array $value Option payload to measure.
     * @return int JSON byte length.
     */
    private function json_payload_bytes( array $value ): int {
        $json = wp_json_encode( $value );
        if ( ! is_string( $json ) ) {
            return 0;
        }
        return strlen( $json );
    }

    /**
     * Validate the recipe collection against the Lite wp_options storage policy.
     *
     * @since 0.1.1-lite
     * @param array $recipes Recipe collection keyed by recipe ID.
     * @return true|\WP_Error
     */
    private function validate_recipes_payload( array $recipes ) {
        $max_recipe_count = self::effective_max_recipe_count();

        if ( count( $recipes ) > $max_recipe_count ) {
            return new \WP_Error(
                'recipe_storage_limit',
                sprintf(
                    'Recipe catalog exceeds the Lite storage policy limit of %d recipes. Reduce the catalog or move recipe storage to a custom table.',
                    $max_recipe_count
                )
            );
        }

        $bytes = $this->json_payload_bytes( $recipes );
        if ( $bytes > self::MAX_RECIPE_OPTION_BYTES ) {
            return new \WP_Error(
                'recipe_storage_limit',
                sprintf(
                    'Recipe catalog exceeds the Lite wp_options JSON budget of %d KB. Reduce the catalog or move recipe storage to a custom table.',
                    (int) ceil( self::MAX_RECIPE_OPTION_BYTES / 1024 )
                )
            );
        }

        return true;
    }

    /**
     * Validate preset profile state against the Lite wp_options storage policy.
     *
     * @since 0.1.1-lite
     * @param array $state Preset profile state array.
     * @return true|\WP_Error
     */
    private function validate_preset_profiles_payload( array $state ) {
        $profiles = isset( $state['profiles'] ) && is_array( $state['profiles'] )
            ? $state['profiles']
            : [];

        if ( count( $profiles ) > self::MAX_PRESET_PROFILE_COUNT ) {
            return new \WP_Error(
                'preset_storage_limit',
                sprintf(
                    'Preset profile state exceeds the Lite storage policy limit of %d profiles. Reduce the preset set or move preset storage out of wp_options.',
                    self::MAX_PRESET_PROFILE_COUNT
                )
            );
        }

        $bytes = $this->json_payload_bytes( $state );
        if ( $bytes > self::MAX_PRESET_OPTION_BYTES ) {
            return new \WP_Error(
                'preset_storage_limit',
                sprintf(
                    'Preset profile state exceeds the Lite wp_options JSON budget of %d KB. Reduce preset metadata or move preset storage out of wp_options.',
                    (int) ceil( self::MAX_PRESET_OPTION_BYTES / 1024 )
                )
            );
        }

        return true;
    }

    /**
     * Persist the full recipe collection to wp_options.
     *
     * @since 0.1.1-lite
     * @param array $recipes Associative array of recipe definitions keyed by recipe ID.
     * @return true|\WP_Error
     */
    public function update_recipes( array $recipes ) {
        $validation = $this->validate_recipes_payload( $recipes );
        if ( is_wp_error( $validation ) ) {
            return $validation;
        }
        update_option( $this->recipes_key, $recipes, false );
        return true;
    }

    /**
     * Get the list of blocked recipe IDs.
     *
     * @since 0.1.1-lite
     * @return array Unique string array of blocked recipe IDs.
     */
    public function get_blocked(): array {
        $blocked = get_option( $this->blocked_key, [] );
        if ( ! is_array( $blocked ) ) {
            return [];
        }
        $blocked = array_map(
            static function( $id ) {
                return (string) $id;
            },
            $blocked
        );
        return array_values( array_unique( $blocked ) );
    }

    /**
     * Persist the blocked recipe ID list to wp_options.
     *
     * @since 0.1.1-lite
     * @param array $blocked Array of recipe IDs to block.
     * @return void
     */
    public function update_blocked( array $blocked ): void {
        $blocked = array_map(
            static function( $id ) {
                return (string) $id;
            },
            $blocked
        );
        $blocked = array_values( array_unique( $blocked ) );
        update_option( $this->blocked_key, $blocked, false );
    }

    /**
     * Add a single recipe ID to the blocked list if not already present.
     *
     * @since 0.1.1-lite
     * @param string $id Recipe ID to block.
     * @return void
     */
    public function add_blocked( string $id ): void {
        $blocked = $this->get_blocked();
        if ( ! in_array( $id, $blocked, true ) ) {
            $blocked[] = $id;
            $this->update_blocked( $blocked );
        }
    }

    /**
     * Remove one or more recipe IDs from the blocked list.
     *
     * @since 0.1.1-lite
     * @param array $ids Recipe IDs to unblock.
     * @return void
     */
    public function remove_blocked( array $ids ): void {
        $ids = array_map(
            static function( $id ) {
                return (string) $id;
            },
            $ids
        );
        $blocked = array_values( array_diff( $this->get_blocked(), $ids ) );
        $this->update_blocked( $blocked );
    }

    /**
     * Delete the entire blocked list from wp_options.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function clear_blocked(): void {
        delete_option( $this->blocked_key );
    }

    /**
     * Get the raw preset profiles state from wp_options.
     *
     * @since 0.1.1-lite
     * @return array Preset profile configuration array.
     */
    public function get_preset_profiles_raw(): array {
        $state = get_option( $this->preset_profiles_key, [] );
        return is_array( $state ) ? $state : [];
    }

    /**
     * Persist the preset profiles state to wp_options.
     *
     * @since 0.1.1-lite
     * @param array $state Preset profile configuration to store.
     * @return true|\WP_Error
     */
    public function update_preset_profiles( array $state ) {
        $validation = $this->validate_preset_profiles_payload( $state );
        if ( is_wp_error( $validation ) ) {
            return $validation;
        }
        update_option( $this->preset_profiles_key, $state, false );
        return true;
    }
}

if ( ! class_exists( 'RCAT_Repository', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Repository', 'RCAT_Repository' );
}
