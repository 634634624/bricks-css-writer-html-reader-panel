<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CM6GPT_Lite_Recipe_Preset_Manager — preset/profile management for the Recipe Catalog.
 *
 * Extracted from the Recipe Catalog facade (decomposition step 3/3).
 * This class is the single source of truth for:
 *  - Recipe preset key normalization
 *  - Recipe preset label generation
 *  - Preset metadata enrichment
 *  - Preset adoption logic
 *  - Profile state persistence
 *  - Managed preset profile building (8 collectors)
 *  - Runtime preset policy generation
 *  - Active preset switching
 *
 * @since 0.2.0-lite
 */
class CM6GPT_Lite_Recipe_Preset_Manager {

    /**
     * Callbacks injected by the parent Recipe Catalog facade.
     *
     * Expected keys:
     *  - clean_utf8_text      fn( string ): string
     *  - auto_import          fn(): array
     *  - repo_get_profiles    fn(): array
     *  - repo_put_profiles    fn( array ): void
     *  - is_vertical_recipe   fn( string $id, array $recipe ): bool
     *
     * @var array<string, callable>
     */
    private array $callbacks;

    /**
     * @since 0.2.0-lite
     *
     * @param array<string, callable> $callbacks Dependency callbacks from the Recipe Catalog facade.
     */
    public function __construct( array $callbacks = [] ) {
        $this->callbacks = CM6GPT_Lite_Recipe_Callback_Guards::require_map(
            $callbacks,
            [ 'clean_utf8_text', 'auto_import', 'repo_get_profiles', 'repo_put_profiles', 'is_vertical_recipe' ],
            __CLASS__
        );
    }

    /* ══════════════════════ Helpers (delegated) ══════════════════════ */

    /**
     * @since 0.2.0-lite
     */
    private function clean_utf8_text( string $value ): string {
        return (string) ( $this->callbacks['clean_utf8_text'] )( $value );
    }

    /**
     * @since 0.2.0-lite
     */
    private function get_preset_profile_state_raw(): array {
        $state = ( $this->callbacks['repo_get_profiles'] )();
        return is_array( $state ) ? $state : [];
    }

    /**
     * @since 0.2.0-lite
     */
    private function put_preset_profile_state( array $state ) {
        return ( $this->callbacks['repo_put_profiles'] )( $state );
    }

    /**
     * @since 0.2.0-lite
     */
    private function auto_import(): array {
        return (array) ( $this->callbacks['auto_import'] )();
    }

    /* ══════════════════════ Preset Key Normalization ══════════════════════ */

    /**
     * Normalize a raw preset key to a canonical slug.
     *
     * This is the single source of truth (fixes A-7 duplication).
     *
     * @since 0.2.0-lite
     *
     * @param string $value    Raw preset key.
     * @param string $fallback Fallback key when empty (default 'shared').
     * @return string Normalized preset key.
     */
    public function normalize_recipe_preset( string $value, string $fallback = 'shared' ): string {
        $preset = strtolower( trim( $this->clean_utf8_text( $value ) ) );
        $preset = preg_replace( '/[\s-]+/', '_', $preset );
        $preset = is_string( $preset ) ? $preset : '';
        $preset = preg_replace( '/[^a-z0-9_]/', '_', $preset );
        $preset = is_string( $preset ) ? $preset : '';
        $preset = preg_replace( '/_+/', '_', $preset );
        $preset = is_string( $preset ) ? trim( $preset, '_' ) : '';
        if ( '' === $preset ) {
            $preset = strtolower( trim( $fallback ) );
        }
        return '' !== $preset ? $preset : 'shared';
    }

    /* ══════════════════════ Preset Label Map ══════════════════════ */

    /**
     * Canonical map of preset keys to human-readable labels.
     *
     * @since 0.2.0-lite
     *
     * @return array<string, string>
     */
    public function recipe_preset_label_map(): array {
        return [
            'all'                    => 'All Recipes',
            'shared'                 => 'Shared Library',
            'all_classes'            => 'All Classes Import',
            'css_recipes'            => 'Legacy CSS Bundle 1',
            'css_recipes_part_2'     => 'Legacy CSS Bundle 2',
            'css_recipes_part_3'     => 'Legacy CSS Bundle 3',
            'layout'                 => 'Layout Bundle',
            'extra'                  => 'Extra Bundle',
            'vertical_affiliate'     => 'Vertical Affiliate Bundle',
            'desktop_first'          => 'Desktop First Bundle',
            'mobile_first_intrinsic' => 'Mobile First Intrinsic Bundle',
            'qminimal'               => 'QMinimal',
            'qminimal_framework'     => 'QMinimal-Framework',
            'general_full'           => 'General Full',
            'vertical_full'          => 'Vertical Affiliate Full',
            'general_mini'           => 'General Mini',
            'vertical_mini'          => 'Vertical Affiliate Mini',
            'general_nano'           => 'General Nano',
            'vertical_nano'          => 'Vertical Affiliate Nano',
        ];
    }

    /**
     * Legacy label aliases for backwards compatibility.
     *
     * @since 0.2.0-lite
     *
     * @return array<string, string>
     */
    public function legacy_recipe_preset_label_aliases(): array {
        return [
            'shared' => 'Shared Library',
            'shared library' => 'Shared Library',
            'all classes' => 'All Classes Import',
            'all classes import' => 'All Classes Import',
            'css recipes' => 'Legacy CSS Bundle 1',
            'css recipes part 2' => 'Legacy CSS Bundle 2',
            'css recipes part 3' => 'Legacy CSS Bundle 3',
            'legacy css bundle 1' => 'Legacy CSS Bundle 1',
            'legacy css bundle 2' => 'Legacy CSS Bundle 2',
            'legacy css bundle 3' => 'Legacy CSS Bundle 3',
            'layout' => 'Layout Bundle',
            'layout bundle' => 'Layout Bundle',
            'extra' => 'Extra Bundle',
            'extra bundle' => 'Extra Bundle',
            'vertical affiliate' => 'Vertical Affiliate Bundle',
            'vertical affiliate bundle' => 'Vertical Affiliate Bundle',
            'desktop first' => 'Desktop First Bundle',
            'desktop first bundle' => 'Desktop First Bundle',
            'mobile first intrinsic' => 'Mobile First Intrinsic Bundle',
            'mobile first intrinsic bundle' => 'Mobile First Intrinsic Bundle',
        ];
    }

    /**
     * Build a human-readable label for a preset key.
     *
     * This is the single source of truth (fixes A-7 duplication).
     *
     * @since 0.2.0-lite
     *
     * @param string $preset Preset key (will be normalized).
     * @return string Human-readable label.
     */
    public function default_recipe_preset_label( string $preset ): string {
        $preset = $this->normalize_recipe_preset( $preset, 'shared' );
        $labels = $this->recipe_preset_label_map();
        if ( isset( $labels[ $preset ] ) ) {
            return $labels[ $preset ];
        }

        $parts = preg_split( '/[_\s]+/', $preset );
        if ( ! is_array( $parts ) ) {
            $parts = [ $preset ];
        }
        $upper_tokens = [
            'css'    => 'CSS',
            'qc'     => 'QC',
            'btcc'   => 'BTCC',
            'cm6gpt' => 'CM6GPT',
        ];
        $parts = array_map(
            static function( $part ) use ( $upper_tokens ) {
                $part = strtolower( trim( (string) $part ) );
                if ( '' === $part ) {
                    return '';
                }
                if ( isset( $upper_tokens[ $part ] ) ) {
                    return $upper_tokens[ $part ];
                }
                if ( ctype_digit( $part ) ) {
                    return $part;
                }
                return ucfirst( $part );
            },
            $parts
        );
        $parts = array_values( array_filter( $parts, static function( $part ) {
            return '' !== $part;
        } ) );
        return ! empty( $parts ) ? implode( ' ', $parts ) : 'Shared';
    }

    /**
     * Normalize a preset label: resolve legacy aliases, fall back to default.
     *
     * @since 0.2.0-lite
     *
     * @param string $preset Preset key.
     * @param string $value  Raw label.
     * @return string Normalized label.
     */
    public function normalize_recipe_preset_label( string $preset, string $value = '' ): string {
        $label = trim( $this->clean_utf8_text( $value ) );
        if ( '' !== $label ) {
            $label = preg_replace( '/\s+/', ' ', $label ) ?: $label;
            $alias_key = preg_replace( '/[\s_-]+/', ' ', strtolower( $label ) );
            $alias_key = is_string( $alias_key ) ? trim( $alias_key ) : strtolower( $label );
            $aliases = $this->legacy_recipe_preset_label_aliases();
            if ( isset( $aliases[ $alias_key ] ) ) {
                return $aliases[ $alias_key ];
            }
            if ( strtolower( str_replace( '_', ' ', $this->normalize_recipe_preset( $preset, 'shared' ) ) ) === $alias_key ) {
                return $this->default_recipe_preset_label( $preset );
            }
            return $label;
        }
        return $this->default_recipe_preset_label( $preset );
    }

    /* ══════════════════════ Preset Metadata ══════════════════════ */

    /**
     * Ensure a recipe array carries valid preset + presetLabel fields.
     *
     * @since 0.2.0-lite
     *
     * @param array  $recipe          Recipe array.
     * @param string $fallback_preset Fallback preset key.
     * @param string $fallback_label  Fallback label.
     * @return array Recipe with normalized preset metadata.
     */
    public function ensure_recipe_preset_metadata( array $recipe, string $fallback_preset = 'shared', string $fallback_label = '' ): array {
        $next = $recipe;
        $preset = $this->normalize_recipe_preset(
            (string) ( $recipe['preset'] ?? '' ),
            $fallback_preset
        );
        $label = $this->normalize_recipe_preset_label(
            $preset,
            (string) ( $recipe['presetLabel'] ?? $fallback_label )
        );
        $next['preset'] = $preset;
        $next['presetLabel'] = $label;
        return $next;
    }

    /**
     * Determine whether a candidate recipe's preset should override the existing one.
     *
     * @since 0.2.0-lite
     *
     * @param array $existing  Current recipe.
     * @param array $candidate New candidate recipe.
     * @return bool
     */
    public function should_adopt_candidate_preset( array $existing, array $candidate ): bool {
        $candidate_raw = trim( (string) ( $candidate['preset'] ?? '' ) );
        if ( '' === $candidate_raw ) {
            return false;
        }

        $candidate_preset = $this->normalize_recipe_preset( $candidate_raw, 'shared' );
        if ( 'shared' === $candidate_preset ) {
            return false;
        }

        $existing_raw = trim( (string) ( $existing['preset'] ?? '' ) );
        if ( '' === $existing_raw ) {
            return true;
        }

        $existing_preset = $this->normalize_recipe_preset( $existing_raw, 'shared' );
        return 'shared' === $existing_preset;
    }

    /* ══════════════════════ Profile Key / ID Normalization ══════════════════════ */

    /**
     * Normalize a preset profile key.
     *
     * @since 0.2.0-lite
     *
     * @param string $value    Raw key.
     * @param string $fallback Fallback (default 'all').
     * @return string
     */
    public function normalize_preset_profile_key( string $value, string $fallback = 'all' ): string {
        return $this->normalize_recipe_preset( $value, $fallback );
    }

    /**
     * Filter and normalize recipe IDs so only existing recipes are kept.
     *
     * @since 0.2.0-lite
     *
     * @param array $ids     Raw ID list.
     * @param array $recipes Recipe collection to validate against.
     * @return array Sorted, unique, validated ID list.
     */
    public function normalize_preset_recipe_ids( array $ids, array $recipes ): array {
        $normalized = [];
        foreach ( $ids as $id ) {
            $id = trim( (string) $id );
            if ( '' === $id || ! isset( $recipes[ $id ] ) ) {
                continue;
            }
            if ( in_array( $id, $normalized, true ) ) {
                continue;
            }
            $normalized[] = $id;
        }
        sort( $normalized, SORT_STRING );
        return array_values( $normalized );
    }

    /* ══════════════════════ Recipe Classification ══════════════════════ */

    /**
     * Detect whether a recipe belongs to the vertical/affiliate vertical.
     *
     * Delegates to the sanitizer callback so the classification logic stays in one place.
     *
     * @since 0.2.0-lite
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe data.
     * @return bool
     */
    public function is_vertical_recipe( string $id, array $recipe ): bool {
        $cb = $this->callbacks['is_vertical_recipe'];
        return (bool) $cb( $id, $recipe );
    }

    /**
     * @since 0.2.0-lite
     */
    private function recipe_matches_qminimal_profile( string $id, array $recipe ): bool {
        $haystack = strtolower(
            implode(
                ' ',
                [
                    $id,
                    (string) ( $recipe['label'] ?? '' ),
                    (string) ( $recipe['category'] ?? '' ),
                    (string) ( $recipe['description'] ?? '' ),
                ]
            )
        );

        if ( str_contains( $haystack, 'auto-grid' ) ) {
            return true;
        }

        $category = strtolower( trim( (string) ( $recipe['category'] ?? '' ) ) );
        return (bool) preg_match( '/\blayout\s*>\s*auto-grid\b/', $category );
    }

    /* ══════════════════════ Preset Profile Collectors ══════════════════════ */

    /**
     * Collect recipe IDs matching the QMinimal profile (auto-grid based).
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_qminimal_recipe_ids( array $recipes ): array {
        $ids = [];
        foreach ( $recipes as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            $id = (string) $id;
            if ( '' === $id ) {
                continue;
            }
            if ( ! $this->recipe_matches_qminimal_profile( $id, $recipe ) ) {
                continue;
            }
            $ids[] = $id;
        }
        sort( $ids, SORT_STRING );
        return array_values( array_unique( $ids ) );
    }

    /**
     * QMinimal-Framework: fixed set of design-system layer recipes.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_qminimal_framework_ids( array $recipes ): array {
        $framework_ids = [
            'sunken', 'surface', 'raised', 'overlay',
            'sunken-dark', 'surface-dark', 'raised-dark', 'overlay-dark',
            'tone-primary', 'tone-secondary', 'tone-tertiary',
            'tone-info', 'tone-success', 'tone-warning', 'tone-error',
            'flex-center', 'flex-between', 'flex-start', 'flex-end', 'flex-stack',
            'grid-fit', 'grid-fill',
            'section-dark',
            'hover-lift',
            'backdrop',
            'sticky-top',
            'sr-only',
            'line-clamp', 'truncate',
        ];
        $existing = array_keys( $recipes );
        $ids = array_intersect( $framework_ids, $existing );
        sort( $ids, SORT_STRING );
        return array_values( $ids );
    }

    /**
     * General Full: every recipe EXCEPT vertical-specific ones.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_general_full_ids( array $recipes ): array {
        $ids = [];
        foreach ( $recipes as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            $id = (string) $id;
            if ( '' === $id ) {
                continue;
            }
            if ( $this->is_vertical_recipe( $id, $recipe ) ) {
                continue;
            }
            $ids[] = $id;
        }
        sort( $ids, SORT_STRING );
        return array_values( array_unique( $ids ) );
    }

    /**
     * Vertical Full: ALL recipes (general + vertical).
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_vertical_full_ids( array $recipes ): array {
        $ids = array_keys( $recipes );
        $ids = array_filter( $ids, static function( $id ) use ( $recipes ) {
            return is_array( $recipes[ $id ] ) && '' !== trim( (string) $id );
        });
        $ids = array_map( 'strval', $ids );
        sort( $ids, SORT_STRING );
        return array_values( array_unique( $ids ) );
    }

    /**
     * Checks whether a recipe belongs to the "mini" tier.
     *
     * @since 0.2.0-lite
     *
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe data.
     * @return bool
     */
    public function is_mini_tier_recipe( string $id, array $recipe ): bool {
        $category = strtolower( trim( (string) ( $recipe['category'] ?? '' ) ) );
        $haystack = strtolower( $id . ' ' . (string) ( $recipe['label'] ?? '' ) . ' ' . $category );

        if ( str_contains( $category, 'auto-grid' ) ) {
            return true;
        }
        if ( str_contains( $category, 'layout > flex' ) ) {
            return true;
        }
        if ( str_contains( $category, 'layout > grid' ) ) {
            return true;
        }
        if ( str_contains( $category, 'every layout > stack' ) ) {
            return true;
        }
        if ( str_contains( $category, 'every layout > cluster' ) ) {
            return true;
        }
        if ( str_contains( $category, 'every layout > switcher' ) ) {
            return true;
        }
        if ( str_contains( $category, 'every layout > sidebar' ) ) {
            return true;
        }
        if ( str_contains( $category, 'color > background' ) ) {
            return true;
        }
        if ( str_contains( $category, 'color > text' ) ) {
            return true;
        }
        if ( str_contains( $category, 'spacing > padding' ) ) {
            return true;
        }
        if ( str_contains( $category, 'spacing > margin' ) ) {
            return true;
        }
        if ( str_contains( $category, 'typography > size' ) ) {
            return true;
        }
        if ( str_contains( $category, 'typography > weight' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'card' ) && ! str_contains( $haystack, 'example' ) ) {
            return true;
        }
        if ( str_contains( $category, 'effects > shadow' ) ) {
            return true;
        }
        if ( str_contains( $category, 'effects > radius' ) ) {
            return true;
        }
        if ( str_contains( $category, 'interaction' ) ) {
            return true;
        }
        if ( str_contains( $category, 'state/pseudo > pseudo-class' ) ) {
            return true;
        }
        if ( str_contains( $category, 'responsive > container query' ) ) {
            return true;
        }
        if ( str_contains( $category, 'responsive > media' ) ) {
            return true;
        }
        if ( str_contains( $category, 'layout > width/height' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'schema' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'debug' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'a11y' ) || str_contains( $haystack, 'focus-ring' ) ) {
            return true;
        }

        return false;
    }

    /**
     * General Mini: practical daily-use subset of general recipes.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_general_mini_ids( array $recipes ): array {
        $ids = [];
        foreach ( $recipes as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            $id = (string) $id;
            if ( '' === $id ) {
                continue;
            }
            if ( $this->is_vertical_recipe( $id, $recipe ) ) {
                continue;
            }
            if ( ! $this->is_mini_tier_recipe( $id, $recipe ) ) {
                continue;
            }
            $ids[] = $id;
        }
        sort( $ids, SORT_STRING );
        return array_values( array_unique( $ids ) );
    }

    /**
     * Vertical Mini: general-mini + key vertical recipes.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_vertical_mini_ids( array $recipes ): array {
        $general_mini = $this->collect_general_mini_ids( $recipes );
        $vertical_mini_extra = [];

        $vertical_mini_keywords = [
            'example-review', 'example-card', 'example-cta', 'bonus-card', 'odds-display',
            
            'top-examples', 'quick-stats', 'pros-box', 'cons-box',
        ];

        foreach ( $recipes as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            $id = (string) $id;
            if ( '' === $id ) {
                continue;
            }
            if ( ! $this->is_vertical_recipe( $id, $recipe ) ) {
                continue;
            }

            $id_lower = strtolower( $id );
            foreach ( $vertical_mini_keywords as $kw ) {
                if ( str_contains( $id_lower, $kw ) ) {
                    $vertical_mini_extra[] = $id;
                    break;
                }
            }
        }

        $merged = array_unique( array_merge( $general_mini, $vertical_mini_extra ) );
        sort( $merged, SORT_STRING );
        return array_values( $merged );
    }

    /**
     * Checks whether a recipe belongs to the "nano" tier — absolute essentials only.
     *
     * @since 0.2.0-lite
     *
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe data.
     * @return bool
     */
    public function is_nano_tier_recipe( string $id, array $recipe ): bool {
        $category = strtolower( trim( (string) ( $recipe['category'] ?? '' ) ) );
        $haystack = strtolower( $id . ' ' . (string) ( $recipe['label'] ?? '' ) );

        if ( str_contains( $category, 'auto-grid' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'bg-dark' ) || str_contains( $haystack, 'dark-bg' ) ) {
            return true;
        }
        if ( preg_match( '/\bcard[-_]?(shell|base|review)\b/', $haystack ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'focus-ring' ) || str_contains( $haystack, 'focus_ring' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'hover-lift' ) || str_contains( $haystack, 'hover_lift' ) ) {
            return true;
        }
        if ( str_contains( $haystack, 'debug' ) ) {
            return true;
        }
        if ( str_contains( $category, 'every layout > stack' ) ) {
            return true;
        }

        return false;
    }

    /**
     * General Nano: absolute minimum (~10-15 recipes).
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs (hard-capped at 15).
     */
    public function collect_general_nano_ids( array $recipes ): array {
        $ids = [];
        foreach ( $recipes as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            $id = (string) $id;
            if ( '' === $id ) {
                continue;
            }
            if ( $this->is_vertical_recipe( $id, $recipe ) ) {
                continue;
            }
            if ( ! $this->is_nano_tier_recipe( $id, $recipe ) ) {
                continue;
            }
            $ids[] = $id;
        }
        sort( $ids, SORT_STRING );
        $ids = array_values( array_unique( $ids ) );

        if ( count( $ids ) > 15 ) {
            $ids = array_slice( $ids, 0, 15 );
        }
        return $ids;
    }

    /**
     * Vertical Nano: general-nano + 3-5 vertical essentials.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Sorted recipe IDs.
     */
    public function collect_vertical_nano_ids( array $recipes ): array {
        $general_nano = $this->collect_general_nano_ids( $recipes );
        $vertical_nano_extra = [];

        $vertical_nano_keywords = [  ];

        foreach ( $recipes as $id => $recipe ) {
            if ( ! is_array( $recipe ) ) {
                continue;
            }
            $id = (string) $id;
            if ( '' === $id ) {
                continue;
            }
            if ( ! $this->is_vertical_recipe( $id, $recipe ) ) {
                continue;
            }

            $id_lower = strtolower( $id );
            foreach ( $vertical_nano_keywords as $kw ) {
                if ( str_contains( $id_lower, $kw ) ) {
                    $vertical_nano_extra[] = $id;
                    break;
                }
            }
            if ( count( $vertical_nano_extra ) >= 5 ) {
                break;
            }
        }

        $merged = array_unique( array_merge( $general_nano, $vertical_nano_extra ) );
        sort( $merged, SORT_STRING );
        return array_values( $merged );
    }

    /* ══════════════════════ Managed Preset Profile Building ══════════════════════ */

    /**
     * Build the 8 managed preset profiles from recipe data.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array<string, array> Keyed by profile slug.
     */
    public function build_managed_preset_profiles( array $recipes ): array {
        return [
            'qminimal' => [
                'key'         => 'qminimal',
                'label'       => 'QMinimal',
                'description' => 'Managed preset profile seeded from Auto-Grid recipes only.',
                'managed'     => true,
                'managedRule' => 'auto-grid',
                'recipeIds'   => $this->collect_qminimal_recipe_ids( $recipes ),
            ],
            'qminimal_framework' => [
                'key'         => 'qminimal_framework',
                'label'       => 'QMinimal-Framework',
                'description' => 'Design system layers: elevation, tone alerts, flex, grid, dark section, interaction, overlay, position, a11y, text utilities.',
                'managed'     => true,
                'managedRule' => 'qminimal-framework',
                'recipeIds'   => $this->collect_qminimal_framework_ids( $recipes ),
            ],
            'general_full' => [
                'key'         => 'general_full',
                'label'       => 'General Full',
                'description' => 'All recipes except vertical/example/affiliate specific ones.',
                'managed'     => true,
                'managedRule' => 'all-general',
                'recipeIds'   => $this->collect_general_full_ids( $recipes ),
            ],
            'vertical_full' => [
                'key'         => 'vertical_full',
                'label'       => 'Vertical Affiliate Full',
                'description' => 'Complete recipe catalog including all general and vertical-specific recipes.',
                'managed'     => true,
                'managedRule' => 'all-vertical',
                'recipeIds'   => $this->collect_vertical_full_ids( $recipes ),
            ],
            'general_mini' => [
                'key'         => 'general_mini',
                'label'       => 'General Mini',
                'description' => 'Practical daily-use subset: layout, visual, component, utility, a11y, interaction.',
                'managed'     => true,
                'managedRule' => 'mini-general',
                'recipeIds'   => $this->collect_general_mini_ids( $recipes ),
            ],
            'vertical_mini' => [
                'key'         => 'vertical_mini',
                'label'       => 'Vertical Affiliate Mini',
                'description' => 'Daily-use general recipes plus key vertical components (example cards, CTAs, odds, ratings).',
                'managed'     => true,
                'managedRule' => 'mini-vertical',
                'recipeIds'   => $this->collect_vertical_mini_ids( $recipes ),
            ],
            'general_nano' => [
                'key'         => 'general_nano',
                'label'       => 'General Nano',
                'description' => 'Absolute minimum (~10-15 recipes) for quick prototyping. Grid, card, focus, hover, debug.',
                'managed'     => true,
                'managedRule' => 'nano-general',
                'recipeIds'   => $this->collect_general_nano_ids( $recipes ),
            ],
            'vertical_nano' => [
                'key'         => 'vertical_nano',
                'label'       => 'Vertical Affiliate Nano',
                'description' => 'Minimal general recipes plus 3-5 essential vertical components.',
                'managed'     => true,
                'managedRule' => 'nano-vertical',
                'recipeIds'   => $this->collect_vertical_nano_ids( $recipes ),
            ],
        ];
    }

    /**
     * Normalize a single preset profile definition.
     *
     * @since 0.2.0-lite
     *
     * @param string $key     Profile key.
     * @param array  $profile Raw profile data.
     * @param array  $recipes Full recipe collection.
     * @return array|null Normalized profile or null if invalid.
     */
    public function normalize_preset_profile_definition( string $key, array $profile, array $recipes ) {
        $normalized_key = $this->normalize_preset_profile_key(
            (string) ( $profile['key'] ?? $key ),
            $key
        );
        if ( '' === $normalized_key || 'all' === $normalized_key ) {
            return null;
        }

        $managed_rule = strtolower(
            trim(
                (string) ( $profile['managedRule'] ?? $profile['managed_rule'] ?? '' )
            )
        );
        $managed = ! empty( $profile['managed'] ) || '' !== $managed_rule;
        if ( $managed && '' === $managed_rule && 'qminimal' === $normalized_key ) {
            $managed_rule = 'auto-grid';
        }

        $managed_rule_collectors = [
            'auto-grid'            => 'collect_qminimal_recipe_ids',
            'qminimal-framework'   => 'collect_qminimal_framework_ids',
            'all-general'          => 'collect_general_full_ids',
            'all-vertical'         => 'collect_vertical_full_ids',
            'mini-general'         => 'collect_general_mini_ids',
            'mini-vertical'        => 'collect_vertical_mini_ids',
            'nano-general'         => 'collect_general_nano_ids',
            'nano-vertical'        => 'collect_vertical_nano_ids',
        ];

        if ( $managed && isset( $managed_rule_collectors[ $managed_rule ] ) ) {
            $collector = $managed_rule_collectors[ $managed_rule ];
            $recipe_ids = $this->$collector( $recipes );
        } else {
            $raw_recipe_ids = isset( $profile['recipeIds'] ) && is_array( $profile['recipeIds'] )
                ? $profile['recipeIds']
                : [];
            $recipe_ids = $this->normalize_preset_recipe_ids( $raw_recipe_ids, $recipes );
        }

        return [
            'key'         => $normalized_key,
            'label'       => $this->normalize_recipe_preset_label(
                $normalized_key,
                (string) ( $profile['label'] ?? '' )
            ),
            'description' => trim( preg_replace( '/\s+/', ' ', (string) ( $profile['description'] ?? '' ) ) ),
            'managed'     => $managed,
            'managedRule' => $managed_rule,
            'recipeIds'   => $recipe_ids,
        ];
    }

    /* ══════════════════════ Profile State ══════════════════════ */

    /**
     * Get the fully resolved preset profile state (merges managed defaults + user overrides).
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array State with 'version', 'activePresetKey', 'profiles'.
     */
    public function get_preset_profile_state( array $recipes ): array {
        $raw = $this->get_preset_profile_state_raw();
        $raw_profiles = isset( $raw['profiles'] ) && is_array( $raw['profiles'] )
            ? $raw['profiles']
            : [];

        $profiles = [];
        $managed_defaults = $this->build_managed_preset_profiles( $recipes );

        foreach ( $managed_defaults as $managed_key => $managed_profile ) {
            if ( isset( $raw_profiles[ $managed_key ] ) && is_array( $raw_profiles[ $managed_key ] ) ) {
                $override = $raw_profiles[ $managed_key ];
                if ( isset( $override['label'] ) ) {
                    $managed_profile['label'] = (string) $override['label'];
                }
                if ( isset( $override['description'] ) ) {
                    $managed_profile['description'] = (string) $override['description'];
                }
            }
            $normalized = $this->normalize_preset_profile_definition( $managed_key, $managed_profile, $recipes );
            if ( is_array( $normalized ) ) {
                $profiles[ $managed_key ] = $normalized;
            }
        }

        foreach ( $raw_profiles as $raw_key => $raw_profile ) {
            if ( ! is_array( $raw_profile ) ) {
                continue;
            }
            $raw_key = (string) $raw_key;
            if ( isset( $managed_defaults[ $raw_key ] ) ) {
                continue;
            }
            $normalized = $this->normalize_preset_profile_definition( $raw_key, $raw_profile, $recipes );
            if ( ! is_array( $normalized ) ) {
                continue;
            }
            $profiles[ $normalized['key'] ] = $normalized;
        }

        uasort(
            $profiles,
            static function( array $left, array $right ): int {
                return strcasecmp(
                    (string) ( $left['label'] ?? '' ),
                    (string) ( $right['label'] ?? '' )
                );
            }
        );

        $active_key = $this->normalize_preset_profile_key(
            (string) ( $raw['activePresetKey'] ?? '' ),
            'all'
        );
        if ( 'all' !== $active_key && ! isset( $profiles[ $active_key ] ) ) {
            $active_key = 'all';
        }

        $state = [
            'version'         => 1,
            'activePresetKey' => $active_key,
            'profiles'        => $profiles,
        ];

        if ( wp_json_encode( $raw ) !== wp_json_encode( $state ) ) {
            $persist_result = $this->put_preset_profile_state( $state );
            if ( is_wp_error( $persist_result ) ) {
                return $state;
            }
        }

        return $state;
    }

    /* ══════════════════════ Runtime Preset Policy ══════════════════════ */

    /**
     * Build the runtime preset policy array from recipes.
     *
     * @since 0.2.0-lite
     *
     * @param array $recipes Full recipe collection.
     * @return array Policy with mode, locked, activePresetKey, allowedRecipeIds, presets.
     */
    public function build_runtime_preset_policy_from_recipes( array $recipes ): array {
        $state = $this->get_preset_profile_state( $recipes );
        $active_key = (string) ( $state['activePresetKey'] ?? 'all' );
        $active_label = 'All Recipes';
        $allowed_ids = [];
        $presets = [
            [
                'key'         => 'all',
                'label'       => 'All Recipes',
                'count'       => count( $recipes ),
                'managed'     => true,
                'active'      => 'all' === $active_key,
                'description' => 'No recipe filtering. Full runtime catalog.',
            ],
        ];

        foreach ( $state['profiles'] as $profile ) {
            if ( ! is_array( $profile ) ) {
                continue;
            }
            $key = (string) ( $profile['key'] ?? '' );
            if ( '' === $key ) {
                continue;
            }
            $count = isset( $profile['recipeIds'] ) && is_array( $profile['recipeIds'] )
                ? count( $profile['recipeIds'] )
                : 0;
            if ( $key === $active_key ) {
                $active_label = (string) ( $profile['label'] ?? $key );
                $allowed_ids = isset( $profile['recipeIds'] ) && is_array( $profile['recipeIds'] )
                    ? array_values( $profile['recipeIds'] )
                    : [];
            }
            $presets[] = [
                'key'         => $key,
                'label'       => (string) ( $profile['label'] ?? $key ),
                'count'       => $count,
                'managed'     => ! empty( $profile['managed'] ),
                'active'      => $key === $active_key,
                'description' => (string) ( $profile['description'] ?? '' ),
            ];
        }

        return [
            'mode'             => 'admin-locked',
            'locked'           => true,
            'activePresetKey'  => $active_key,
            'activePresetLabel'=> $active_label,
            'allowedRecipeIds' => 'all' === $active_key ? [] : array_values( $allowed_ids ),
            'presets'          => $presets,
        ];
    }

    /**
     * Build the preset-only AJAX payload.
     *
     * @since 0.2.0-lite
     *
     * @param array $extra Extra data to merge.
     * @return array
     */
    public function build_preset_ajax_payload( array $extra = [] ): array {
        $recipes = $this->auto_import();
        return array_merge(
            [
                'presetPolicy' => $this->build_runtime_preset_policy_from_recipes( $recipes ),
            ],
            $extra
        );
    }

    /**
     * Set the active preset and return the updated preset AJAX payload.
     *
     * @since 0.2.0-lite
     *
     * @param string $key Preset key to activate.
     * @return array|\WP_Error Updated payload or error.
     */
    public function set_active_preset( string $key ) {
        $recipes = $this->auto_import();
        $state = $this->get_preset_profile_state( $recipes );
        $normalized_key = $this->normalize_preset_profile_key( $key, 'all' );
        if ( 'all' !== $normalized_key && ! isset( $state['profiles'][ $normalized_key ] ) ) {
            return new \WP_Error( 'invalid_preset', 'Unknown preset profile.' );
        }
        $state['activePresetKey'] = $normalized_key;
        $persist_result = $this->put_preset_profile_state( $state );
        if ( is_wp_error( $persist_result ) ) {
            return $persist_result;
        }
        return $this->build_preset_ajax_payload();
    }
}

if ( ! class_exists( 'RCAT_Preset_Manager', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Preset_Manager', 'RCAT_Preset_Manager' );
}
