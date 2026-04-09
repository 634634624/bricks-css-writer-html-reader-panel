<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Recipe CRUD operations delegating to injected dependencies.
 *
 * @since 0.1.1-lite
 */
class CM6GPT_Lite_Recipe_Operations {

    private $deps = [];

    /**
     * Initialize with dependency callables for storage and parsing.
     *
     * @since 0.1.1-lite
     * @param array $deps Associative array of callable dependencies keyed by name.
     */
    public function __construct( array $deps = [] ) {
        $this->deps = CM6GPT_Lite_Recipe_Callback_Guards::require_map(
            $deps,
            [
                'get',
                'put',
                'block',
                'unblock',
                'blocked',
                'clear_blocked',
                'update_blocked',
                'payload',
                'set_active_preset',
                'normalize_recipe_css',
                'unique_id',
                'parse',
                'sanitize_recipe',
            ],
            __CLASS__
        );
    }

    /**
     * Invoke a named dependency callable with the given arguments.
     *
     * @since 0.1.1-lite
     * @param string $name Dependency key.
     * @param mixed  ...$args Arguments forwarded to the callable.
     * @return mixed Callable return value, or WP_Error if dependency is missing.
     */
    private function run( string $name, ...$args ) {
        $callable = $this->deps[ $name ];
        return call_user_func_array( $callable, $args );
    }

    /**
     * Save (create or update) a single recipe definition.
     *
     * Receives pre-sanitized data from the Recipe Catalog admin controller.
     * Do NOT re-sanitize string fields already cleaned by the controller boundary.
     * CSS field receives domain-specific treatment only (wp_strip_all_tags).
     *
     * @since 0.1.1-lite
     * @param array $request Pre-sanitized request fields including id, old_id, label, category, css, etc.
     * @return array|\WP_Error Updated AJAX payload or error.
     */
    public function save( array $request ) {
        $old = (string) ( $request['old_id'] ?? '' );
        $id  = (string) ( $request['id'] ?? '' );
        if ( ! $id ) {
            return new \WP_Error( 'missing_id', 'Missing ID' );
        }

        $recipes = $this->run( 'get' );
        $existing_recipe = [];
        if ( $old && isset( $recipes[ $old ] ) && is_array( $recipes[ $old ] ) ) {
            $existing_recipe = $recipes[ $old ];
        } elseif ( isset( $recipes[ $id ] ) && is_array( $recipes[ $id ] ) ) {
            $existing_recipe = $recipes[ $id ];
        }
        $raw_category = (string) ( $request['category'] ?? '' );
        if ( '' === trim( $raw_category ) ) {
            return new \WP_Error( 'missing_category', 'Category is required' );
        }

        $raw_preset = (string) ( $request['preset'] ?? '' );
        if ( '' === trim( $raw_preset ) && ! empty( $existing_recipe['preset'] ) ) {
            $raw_preset = (string) $existing_recipe['preset'];
        }
        $raw_preset_label = (string) ( $request['presetLabel'] ?? '' );
        if ( '' === trim( $raw_preset_label ) && ! empty( $existing_recipe['presetLabel'] ) ) {
            $raw_preset_label = (string) $existing_recipe['presetLabel'];
        }

        // CSS is not run through sanitize_text_field() by the controller (it would strip valid CSS syntax).
        // Apply domain-specific treatment: strip HTML tags only.
        $raw_css = wp_strip_all_tags( $request['css'] ?? '' );

        $raw_recipe = [
            'label'       => (string) ( $request['label'] ?? $id ),
            'category'    => $raw_category,
            'description' => (string) ( $request['description'] ?? '' ),
            'css'         => $this->run( 'normalize_recipe_css', $raw_css ),
            'preset'      => $raw_preset,
            'presetLabel' => $raw_preset_label,
        ];

        $sanitized = $this->run( 'sanitize_recipe', $id, $raw_recipe, $raw_category );
        if ( ! is_array( $sanitized ) ) {
            return new \WP_Error( 'invalid_recipe', 'Recipe rejected by cleanup rules (check ID/CSS/category).' );
        }
        $id = (string) ( $sanitized['id'] ?? '' );
        $recipe = is_array( $sanitized['recipe'] ?? null ) ? $sanitized['recipe'] : [];
        if ( '' === $id || empty( $recipe ) ) {
            return new \WP_Error( 'invalid_recipe', 'Recipe rejected by cleanup rules (check ID/CSS/category).' );
        }

        $requested_id = $id;
        if ( $old && $old !== $id ) {
            unset( $recipes[ $old ] );
        }
        if ( isset( $recipes[ $id ] ) && ( ! $old || $old !== $id ) ) {
            $id = $this->run( 'unique_id', $id, $recipes );
        }

        $recipes[ $id ] = $recipe;
        $persist_result = $this->run( 'put', $recipes );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        return $this->run(
            'payload',
            [
                'saved_id'           => $id,
                'requested_id'       => $requested_id,
                'collision_resolved' => $id !== $requested_id,
            ]
        );
    }

    /**
     * Delete a recipe by ID and add it to the blocked list.
     *
     * @since 0.1.1-lite
     * @param array $request Pre-sanitized request fields containing the recipe id.
     * @return array|\WP_Error Updated AJAX payload or error.
     */
    public function delete( array $request ) {
        $id = (string) ( $request['id'] ?? '' );
        if ( '' === $id ) {
            return new \WP_Error( 'missing_id', 'Missing ID' );
        }
        $recipes = $this->run( 'get' );
        unset( $recipes[ $id ] );
        $persist_result = $this->run( 'put', $recipes );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        $this->run( 'block', $id );
        return $this->run( 'payload' );
    }

    /**
     * Duplicate an existing recipe under a new ID with a "-copy" suffix.
     *
     * @since 0.1.1-lite
     * @param array $request Pre-sanitized request fields containing the source recipe id.
     * @return array|\WP_Error Updated AJAX payload with new_id, or error.
     */
    public function duplicate( array $request ) {
        $id = (string) ( $request['id'] ?? '' );
        $recipes = $this->run( 'get' );
        if ( ! isset( $recipes[ $id ] ) ) {
            return new \WP_Error( 'not_found', 'Not found' );
        }
        $new_id = $id . '-copy';
        $i = 2;
        while ( isset( $recipes[ $new_id ] ) && $i < 1000 ) {
            $new_id = $id . '-copy-' . $i++;
        }
        $recipes[ $new_id ] = $recipes[ $id ];
        $recipes[ $new_id ]['label'] = ( $recipes[ $id ]['label'] ?? $id ) . ' (copy)';
        $persist_result = $this->run( 'put', $recipes );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        return $this->run( 'payload', [ 'new_id' => $new_id ] );
    }

    /**
     * Move a recipe to a different category.
     *
     * @since 0.1.1-lite
     * @param array $request Pre-sanitized request fields containing id and target category.
     * @return array|\WP_Error Updated AJAX payload or error.
     */
    public function move( array $request ) {
        $id  = (string) ( $request['id'] ?? '' );
        $cat = (string) ( $request['category'] ?? '' );
        $recipes = $this->run( 'get' );
        if ( ! isset( $recipes[ $id ] ) ) {
            return new \WP_Error( 'not_found', 'Not found' );
        }
        $recipes[ $id ]['category'] = $cat;
        $persist_result = $this->run( 'put', $recipes );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        return $this->run( 'payload' );
    }

    /**
     * Bulk import recipes from CSS text with merge or replace mode.
     *
     * Note: 'text' field is intentionally NOT sanitized via sanitize_text_field() as it
     * contains raw CSS. The controller passes it through wp_unslash() only; we apply
     * wp_check_invalid_utf8() here as domain-specific treatment.
     *
     * @since 0.1.1-lite
     * @param array $request Pre-sanitized fields: text (raw CSS), mode (merge|replace), preset, presetLabel, category.
     * @return array|\WP_Error Updated AJAX payload with imported count, or error.
     */
    public function bulk_import( array $request ) {
        if ( mb_strlen( $request['text'] ?? '' ) > 5 * 1024 * 1024 ) {
            return new \WP_Error( 'too_large', 'Import text exceeds 5 MB limit.' );
        }
        $text = wp_check_invalid_utf8( $request['text'] ?? '' );
        $parsed = $this->run( 'parse', $text );
        $import_preset       = (string) ( $request['preset'] ?? '' );
        $import_preset_label = (string) ( $request['presetLabel'] ?? '' );
        $import_category     = (string) ( $request['category'] ?? '' );
        $normalized = [];
        foreach ( $parsed as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            // Recipe category from parsed CSS is untrusted (not from the controller boundary) — sanitize here.
            $fallback_category = $import_category ?: sanitize_text_field( (string) ( $recipe['category'] ?? 'Imported Recipes' ) );
            $sanitized = $this->run(
                'sanitize_recipe',
                (string) $id,
                $recipe,
                $fallback_category
            );
            if ( ! is_array( $sanitized ) ) {
                continue;
            }

            $next_id = (string) ( $sanitized['id'] ?? '' );
            $next_recipe = is_array( $sanitized['recipe'] ?? null ) ? $sanitized['recipe'] : [];
            if ( '' === $next_id || empty( $next_recipe ) ) {
                continue;
            }

            // Apply preset from import UI
            if ( '' !== $import_preset ) {
                $next_recipe['preset']      = $import_preset;
                $next_recipe['presetLabel'] = '' !== $import_preset_label ? $import_preset_label : $import_preset;
            }
            // Apply category from import UI
            if ( '' !== $import_category ) {
                $next_recipe['category'] = $import_category;
            }

            if ( isset( $normalized[ $next_id ] ) ) {
                $next_id = $this->run( 'unique_id', $next_id, $normalized );
            }
            $normalized[ $next_id ] = $next_recipe;
        }
        $mode = $request['mode'] ?? 'merge';

        if ( 'replace' === $mode ) {
            $recipes = $normalized;
            $this->run( 'clear_blocked' );
        } else {
            $recipes = $this->run( 'get' );
            foreach ( $normalized as $id => $recipe ) {
                $recipes[ $id ] = $recipe;
            }
            $this->run( 'unblock', array_keys( $normalized ) );
        }

        $persist_result = $this->run( 'put', $recipes );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        return $this->run( 'payload', [ 'count' => count( $normalized ) ] );
    }

    /**
     * Delete all recipes and add their IDs to the blocked list.
     *
     * @since 0.1.1-lite
     * @return array Updated AJAX payload.
     */
    public function delete_all() {
        $ids = array_keys( $this->run( 'get' ) );
        $blocked = array_values(
            array_unique(
                array_merge(
                    $this->run( 'blocked' ),
                    $ids
                )
            )
        );
        $this->run( 'update_blocked', $blocked );
        $persist_result = $this->run( 'put', [] );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        return $this->run( 'payload' );
    }

    /**
     * Set the active preset profile by key.
     *
     * @since 0.1.1-lite
     * @param array $request Pre-sanitized request fields containing key or presetKey.
     * @return mixed Result from the preset manager.
     */
    public function set_active_preset( array $request ) {
        $key = (string) ( $request['key'] ?? $request['presetKey'] ?? 'all' );
        return $this->run( 'set_active_preset', $key );
    }
}

if ( ! class_exists( 'RCAT_Recipe_Operations', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Operations', 'RCAT_Recipe_Operations' );
}
