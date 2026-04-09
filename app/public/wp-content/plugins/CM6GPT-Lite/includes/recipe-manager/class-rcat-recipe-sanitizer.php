<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Recipe sanitization, ID generation, category inference, and vertical detection.
 *
 * Extracted from the Recipe Catalog facade (decomposition step 2/3) to enforce
 * single-responsibility. Every method that transforms, validates, classifies, or
 * normalizes an individual recipe definition lives here.
 *
 * A-2 fix: vertical ID prefixes are now defined in a single canonical method
 * (`vertical_id_prefixes()`) instead of being duplicated across is_vertical_recipe()
 * and auto_import().
 *
 * @since 0.2.0-lite
 */
class CM6GPT_Lite_Recipe_Sanitizer {

    /** @var CM6GPT_Lite_Recipe_CSS_Parser */
    private CM6GPT_Lite_Recipe_CSS_Parser $css_parser;

    /** @var CM6GPT_Lite_Recipe_Filter_Adapter */
    private CM6GPT_Lite_Recipe_Filter_Adapter $filter_adapter;

    /**
     * Callbacks into the parent recipe manager for preset/compact logic.
     *
     * Expected keys:
     *   - 'normalize_preset'       : fn( string $value, string $fallback ): string
     *   - 'normalize_preset_label' : fn( string $preset, string $value ): string
     *   - 'compact_definition'     : fn( array $recipe ): array
     *
     * @var array<string, callable>
     */
    private array $callbacks;

    /**
     * @since 0.2.0-lite
     *
     * @param CM6GPT_Lite_Recipe_CSS_Parser     $css_parser
     * @param CM6GPT_Lite_Recipe_Filter_Adapter $filter_adapter
     * @param array<string, callable> $callbacks  See property docblock for expected keys.
     */
    public function __construct(
        CM6GPT_Lite_Recipe_CSS_Parser $css_parser,
        CM6GPT_Lite_Recipe_Filter_Adapter $filter_adapter,
        array $callbacks = []
    ) {
        $this->css_parser     = $css_parser;
        $this->filter_adapter = $filter_adapter;
        $this->callbacks      = CM6GPT_Lite_Recipe_Callback_Guards::require_map(
            $callbacks,
            [ 'normalize_preset', 'normalize_preset_label', 'compact_definition' ],
            __CLASS__
        );
    }

    /* ──────────────────────────────────────────────
     *  A-2 fix: single source of truth for vertical ID prefixes
     * ────────────────────────────────────────────── */

    /**
     * Canonical list of ID prefixes that identify a recipe as vertical/affiliate.
     *
     * This is the **single source of truth** — every vertical-prefix check in the
     * plugin must call this method instead of maintaining its own array.
     *
     * @since 0.2.0-lite
     * @return string[]
     */
    public function vertical_id_prefixes(): array {
        return [];
    }

    /**
     * Category strings that indicate a vertical/affiliate recipe.
     *
     * @since 0.2.0-lite
     * @return string[] Lowercased category values.
     */
    public function vertical_categories(): array {
        return [];
    }

    /**
     * Keyword tokens that identify vertical recipes when found in ID+label.
     *
     * @since 0.2.0-lite
     * @return string[]
     */
    public function vertical_keywords(): array {
        return [];
    }

    /* ──────────────────────────────────────────────
     *  Vertical detection
     * ────────────────────────────────────────────── */

    /**
     * Determine whether a recipe is vertical/affiliate-specific.
     *
     * Centralizes prefix, category, preset, and keyword checks.
     *
     * @since 0.2.0-lite
     *
     * @param string $id     Recipe ID.
     * @param array  $recipe Recipe definition array.
     * @return bool
     */
    public function is_vertical_recipe( string $id, array $recipe ): bool {
        $id_lower = strtolower( $id );

        // 1. ID prefix match
        foreach ( $this->vertical_id_prefixes() as $prefix ) {
            if ( str_starts_with( $id_lower, $prefix ) ) {
                return true;
            }
        }

        // 2. Category match
        $cat_lower = strtolower( trim( (string) ( $recipe['category'] ?? '' ) ) );
        if ( in_array( $cat_lower, $this->vertical_categories(), true ) ) {
            return true;
        }

        // 3. Preset already tagged as vertical
        $preset = strtolower( trim( (string) ( $recipe['preset'] ?? '' ) ) );
        if ( 'vertical_affiliate' === $preset || 'vertical affiliate' === str_replace( '_', ' ', $preset ) ) {
            return true;
        }

        // 4. Keyword scan in ID + label (conservative — only strong vertical-specific terms)
        $haystack = strtolower( $id . ' ' . (string) ( $recipe['label'] ?? '' ) );
        foreach ( $this->vertical_keywords() as $kw ) {
            if ( str_contains( $haystack, $kw ) ) {
                return true;
            }
        }

        return false;
    }

    /* ──────────────────────────────────────────────
     *  Text cleanup
     * ────────────────────────────────────────────── */

    /**
     * Replace the "etch" brand word with the neutral "Snippy".
     *
     * @since 0.2.0-lite
     */
    public function replace_etch_word( string $text ): string {
        $out = preg_replace( '/\betch\b/iu', 'Snippy', $text );
        return is_string( $out ) ? $out : $text;
    }

    /**
     * Remove the "btcc" token from text and collapse resulting duplicate separators.
     *
     * @since 0.2.0-lite
     */
    public function remove_btcc_token( string $text ): string {
        $clean = preg_replace( '/\bbtcc\b/iu', '', $text );
        if ( ! is_string( $clean ) ) {
            return $text;
        }
        $clean = preg_replace( '/([._-]){2,}/', '$1', $clean );
        $clean = is_string( $clean ) ? $clean : $text;
        return trim( $clean );
    }

    /* ──────────────────────────────────────────────
     *  Recipe type detection
     * ────────────────────────────────────────────── */

    /**
     * Whether a recipe is a CSS custom-property (variable) definition.
     *
     * @since 0.2.0-lite
     */
    public function is_variable_recipe_definition( string $id, array $recipe ): bool {
        $raw_id = strtolower( trim( $id ) );
        if ( '' !== $raw_id && ( str_starts_with( $raw_id, '--' ) || str_starts_with( $raw_id, 'v-' ) || str_starts_with( $raw_id, 'v_' ) ) ) {
            return true;
        }

        $css = (string) ( $recipe['css'] ?? $recipe['contentCss'] ?? '' );
        $decls = $this->css_parser->extract_recipe_declarations( $css );
        if ( empty( $decls ) ) {
            return false;
        }

        $custom = 0;
        foreach ( $decls as $decl ) {
            $prop = (string) ( $decl['prop'] ?? '' );
            if ( str_starts_with( $prop, '--' ) ) {
                $custom++;
            }
        }
        return $custom > 0 && $custom === count( $decls );
    }

    /**
     * Whether a recipe is a container-query definition.
     *
     * @since 0.2.0-lite
     */
    public function is_query_recipe_definition( string $id, array $recipe ): bool {
        $raw_id = strtolower( trim( $id ) );
        if ( '' !== $raw_id && ( str_starts_with( $raw_id, 'qc-' ) || str_starts_with( $raw_id, 'cq-' ) ) ) {
            return true;
        }

        $haystack = strtolower( implode( ' ', [
            $id,
            (string) ( $recipe['label'] ?? '' ),
            (string) ( $recipe['category'] ?? '' ),
            (string) ( $recipe['description'] ?? '' ),
            (string) ( $recipe['css'] ?? '' ),
            (string) ( $recipe['contentCss'] ?? '' ),
        ] ) );

        $tokens = [
            '@container',
            'container:',
            'container-type',
            'container-name',
            'cqmin',
            'cqmax',
            'cqi',
            'cq-',
            'qc-',
            'contain-',
            'container quer',
            'intrinsic design',
        ];
        foreach ( $tokens as $token ) {
            if ( str_contains( $haystack, $token ) ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether a recipe is a state/pseudo-class definition.
     *
     * @since 0.2.0-lite
     */
    public function is_state_recipe_definition( string $id, array $recipe ): bool {
        $raw_id = strtolower( trim( $id ) );
        if ( '' !== $raw_id && str_starts_with( $raw_id, 'st-' ) ) {
            return true;
        }

        $meta = strtolower( implode( ' ', [
            $id,
            (string) ( $recipe['label'] ?? '' ),
            (string) ( $recipe['category'] ?? '' ),
            (string) ( $recipe['description'] ?? '' ),
        ] ) );
        $meta_tokens = [
            'state',
            'interaction',
            'hover',
            'focus',
            'active',
            'disabled',
            'visited',
            'checked',
            'before',
            'after',
            'focus-ring',
        ];
        foreach ( $meta_tokens as $token ) {
            if ( str_contains( $meta, $token ) ) {
                return true;
            }
        }

        $css = strtolower( (string) ( $recipe['css'] ?? $recipe['contentCss'] ?? '' ) );
        if ( '' === trim( $css ) ) {
            return false;
        }
        if ( preg_match( '/::?(?:before|after|hover|focus|focus-visible|focus-within|active|visited|disabled|checked|target|placeholder|selection|backdrop)\b/', $css ) ) {
            return true;
        }

        return false;
    }

    /* ──────────────────────────────────────────────
     *  ID generation & normalization
     * ────────────────────────────────────────────── */

    /**
     * Infer the recipe ID prefix from content analysis.
     *
     * @since 0.2.0-lite
     */
    public function infer_recipe_id_prefix( string $id, array $recipe ): string {
        if ( $this->is_query_recipe_definition( $id, $recipe ) ) {
            return 'qc';
        }
        if ( $this->is_state_recipe_definition( $id, $recipe ) ) {
            return 'st';
        }
        return '';
    }

    /**
     * Strip known recipe ID prefixes (c-, v-, qc-, st-, u-, l-, g-, q-, cq-, state-).
     *
     * @since 0.2.0-lite
     */
    public function strip_known_recipe_prefixes( string $value ): string {
        $out = trim( $value );
        if ( '' === $out ) {
            return $out;
        }

        $out = (string) preg_replace( '/^(?:c|v|qc|st|u|l|g|q|cq|state)[-_]+/i', '', $out );
        return ltrim( $out, "-_" );
    }

    /**
     * Expand shorthand spacing IDs (e.g. "ml" → "margin-left").
     *
     * @since 0.2.0-lite
     */
    public function expand_recipe_id_shorthand( string $value ): string {
        $map = [
            'ml' => 'margin-left',
            'mr' => 'margin-right',
            'mt' => 'margin-top',
            'mb' => 'margin-bottom',
            'mx' => 'margin-inline',
            'my' => 'margin-block',
            'pl' => 'padding-left',
            'pr' => 'padding-right',
            'pt' => 'padding-top',
            'pb' => 'padding-bottom',
            'px' => 'padding-inline',
            'py' => 'padding-block',
        ];

        if ( preg_match( '/^([a-z]{2})([-_.].*)?$/', $value, $m ) ) {
            $head = strtolower( (string) ( $m[1] ?? '' ) );
            if ( isset( $map[ $head ] ) ) {
                $tail = (string) ( $m[2] ?? '' );
                return $map[ $head ] . $tail;
            }
        }

        return $value;
    }

    /**
     * Apply a semantic ID prefix (qc-, st-, or inferred) and normalize the ID string.
     *
     * @since 0.2.0-lite
     */
    public function with_variable_recipe_id_prefix( string $id, array $recipe ): string {
        $trimmed = trim( (string) $id );
        if ( '' === $trimmed ) {
            $trimmed = trim( (string) ( $recipe['label'] ?? '' ) );
        }
        if ( '' === $trimmed ) {
            return '';
        }

        if ( $this->is_variable_recipe_definition( $trimmed, $recipe ) ) {
            return '';
        }

        $prefix = '';
        if ( preg_match( '/^(?:qc|cq)[-_]+/i', $trimmed ) ) {
            $prefix = 'qc';
        } elseif ( preg_match( '/^st[-_]+/i', $trimmed ) ) {
            $prefix = 'st';
        } else {
            $prefix = $this->infer_recipe_id_prefix( $trimmed, $recipe );
        }

        $candidate = ltrim( $trimmed, ". \t\n\r\0\x0B" );
        $candidate = $this->strip_known_recipe_prefixes( (string) $candidate );
        $candidate = strtolower( $this->replace_etch_word( $candidate ) );
        $candidate = strtolower( $this->remove_btcc_token( $candidate ) );
        $candidate = $this->expand_recipe_id_shorthand( $candidate );
        $candidate = (string) preg_replace( '/[^a-z0-9._-]+/', '-', $candidate );
        $candidate = (string) preg_replace( '/-{2,}/', '-', $candidate );
        $candidate = (string) preg_replace( '/_{2,}/', '_', $candidate );
        $candidate = trim( $candidate, "-_." );
        if ( '' === $candidate ) {
            $candidate = 'recipe';
        }

        if ( '' !== $prefix ) {
            return $prefix . '-' . $candidate;
        }
        return $candidate;
    }

    /**
     * Apply a semantic label prefix and normalize the label string.
     *
     * @since 0.2.0-lite
     */
    public function with_variable_recipe_label_prefix( string $label, string $id, array $recipe ): string {
        $trimmed = trim( $label );
        if ( '' === $trimmed ) {
            $trimmed = $id;
        }
        $trimmed = $this->remove_btcc_token( $this->replace_etch_word( $trimmed ) );
        $trimmed = (string) preg_replace( '/^\s*(?:c|v)[-_]+/i', '', $trimmed );
        if ( '' === $trimmed ) {
            return trim( (string) $id );
        }
        if ( 1 !== preg_match( '/^[A-Za-z0-9._-]+$/', $trimmed ) ) {
            return trim( preg_replace( '/\s+/', ' ', $trimmed ) );
        }

        $candidate = strtolower( ltrim( $trimmed, ". \t\n\r\0\x0B" ) );
        $candidate = $this->strip_known_recipe_prefixes( $candidate );
        $candidate = $this->expand_recipe_id_shorthand( $candidate );
        $candidate = (string) preg_replace( '/[^a-z0-9._-]+/', '-', $candidate );
        $candidate = (string) preg_replace( '/-{2,}/', '-', $candidate );
        $candidate = trim( $candidate, "-_." );
        if ( '' === $candidate ) {
            $candidate = trim( (string) $id );
        }

        if ( preg_match( '/^(qc|st)[-_]/', strtolower( (string) $id ), $m ) ) {
            return strtolower( (string) $m[1] ) . '-' . $candidate;
        }

        return $candidate;
    }

    /**
     * Generate a unique recipe ID, appending a numeric suffix if needed.
     *
     * @since 0.2.0-lite
     *
     * @param string $candidate Desired ID.
     * @param array  $existing  Existing recipe map (keyed by ID).
     * @return string Unique ID.
     */
    public function unique_recipe_id( string $candidate, array $existing ): string {
        $id = trim( $candidate );
        if ( '' === $id ) {
            $id = 'recipe';
        }
        if ( ! isset( $existing[ $id ] ) ) {
            return $id;
        }
        $i = 2;
        while ( isset( $existing[ $id . '-' . $i ] ) ) {
            $i++;
        }
        return $id . '-' . $i;
    }

    /* ──────────────────────────────────────────────
     *  Category inference & normalization
     * ────────────────────────────────────────────── */

    /**
     * Whether a category is too generic and should be rewritten via inference.
     *
     * @since 0.2.0-lite
     */
    public function should_rewrite_recipe_category( string $category ): bool {
        $cat = strtolower( trim( $category ) );
        if ( '' === $cat ) {
            return true;
        }
        $generic = [
            'uncategorized',
            'external',
            'imported recipes',
            'imported css',
            'css recipes',
            'css recipes part 2',
            'css recipes part 3',
            'layout',
            'extra',
            'all classes',
            'vertical',
            'recipes from php filter',
            'community recipes',
            'acss recipes',
            'custom',
            'utility',
            'general',
            'utility > general',
            'general > utility',
            'general > utilities',
        ];
        if ( in_array( $cat, $generic, true ) ) {
            return true;
        }
        return ! str_contains( $category, '>' );
    }

    /**
     * Infer a recipe category from its ID, CSS declarations, and metadata.
     *
     * @since 0.2.0-lite
     */
    public function infer_recipe_category( string $id, array $recipe ): string {
        $css = (string) ( $recipe['css'] ?? '' );
        $haystack = strtolower(
            implode(
                ' ',
                [
                    $id,
                    (string) ( $recipe['label'] ?? '' ),
                    (string) ( $recipe['description'] ?? '' ),
                    $css,
                ]
            )
        );
        $decls = $this->css_parser->extract_recipe_declarations( $css );
        $props = [];
        foreach ( $decls as $decl ) {
            $props[] = (string) ( $decl['prop_lc'] ?? '' );
        }
        $prop_set = array_fill_keys( $props, true );
        $has_prop = static function( array $keys ) use ( $prop_set ): bool {
            foreach ( $keys as $k ) {
                if ( isset( $prop_set[ $k ] ) ) {
                    return true;
                }
            }
            return false;
        };

        if ( preg_match( '/::(?:before|after|marker|placeholder|selection|backdrop)\b/', $haystack ) ) {
            return 'State/Pseudo > Pseudo-element';
        }
        if ( preg_match( '/:(?:hover|focus|focus-visible|focus-within|active|visited|disabled|checked|target)\b/', $haystack ) ) {
            return 'State/Pseudo > Pseudo-class';
        }
        if ( preg_match( '/:(?:where|is|not|has)\s*\(/', $haystack ) ) {
            return 'State/Pseudo > Selector Logic';
        }
        if ( str_contains( $haystack, '@supports' ) ) {
            return 'Responsive > Supports';
        }
        if ( str_contains( $haystack, '@scope' ) ) {
            return 'Responsive > Scope';
        }
        if ( str_contains( $haystack, '@container' ) || str_contains( $haystack, 'cqi' ) || str_contains( $haystack, 'cqmin' ) || str_contains( $haystack, 'cqmax' ) || str_contains( $haystack, 'container-type' ) ) {
            return 'Responsive > Container Query';
        }
        if ( str_contains( $haystack, '@media' ) ) {
            return 'Responsive > Media';
        }

        if ( preg_match( '/(?:^|[\s_-])stack(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Stack';
        }
        if ( preg_match( '/(?:^|[\s_-])cluster(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Cluster';
        }
        if ( preg_match( '/(?:^|[\s_-])switcher(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Switcher';
        }
        if ( preg_match( '/(?:^|[\s_-])(?:with-sidebar|sidebar)(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Sidebar';
        }
        if ( preg_match( '/(?:^|[\s_-])center(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Center';
        }
        if ( preg_match( '/(?:^|[\s_-])cover(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Cover';
        }
        if ( preg_match( '/(?:^|[\s_-])frame(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Frame';
        }
        if ( preg_match( '/(?:^|[\s_-])reel(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Reel';
        }
        if ( preg_match( '/(?:^|[\s_-])imposter(?:[\s_-]|$)/', $haystack ) ) {
            return 'Every Layout > Imposter';
        }

        if ( str_contains( $haystack, 'auto-fit' ) || str_contains( $haystack, 'auto-fill' ) || str_contains( $haystack, 'grid-auto' ) ) {
            return 'Layout > Auto-Grid';
        }
        if ( str_contains( $haystack, 'display: grid' ) || $has_prop( [ 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows' ] ) ) {
            if ( str_contains( $haystack, 'auto-fit' ) || str_contains( $haystack, 'auto-fill' ) || str_contains( $haystack, 'minmax(' ) ) {
                return 'Layout > Auto-Grid';
            }
            return 'Layout > Grid';
        }
        if ( str_contains( $haystack, 'display: flex' ) || $has_prop( [ 'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'justify-content', 'align-items', 'align-content', 'place-content' ] ) ) {
            return 'Layout > Flex';
        }
        if ( str_contains( $haystack, '> * + *' ) || str_contains( $haystack, '& > * + *' ) ) {
            return 'Every Layout > Stack';
        }
        if ( $has_prop( [ 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio', 'inline-size', 'block-size' ] ) ) {
            return 'Layout > Width/Height';
        }
        if ( $has_prop( [ 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block' ] ) ) {
            return 'Spacing > Margin';
        }
        if ( $has_prop( [ 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block' ] ) ) {
            return 'Spacing > Padding';
        }
        if ( $has_prop( [ 'font-size', 'line-height', 'letter-spacing', 'word-spacing', 'text-wrap' ] ) ) {
            return 'Typography > Size';
        }
        if ( $has_prop( [ 'font-weight' ] ) ) {
            return 'Typography > Weight';
        }
        if ( $has_prop( [ 'background', 'background-color', 'background-image' ] ) ) {
            return 'Color > Background';
        }
        if ( $has_prop( [ 'border-color', 'outline-color', 'stroke', 'stroke-color' ] ) ) {
            return 'Color > Border';
        }
        if ( $has_prop( [ 'color', 'fill' ] ) ) {
            return 'Color > Text';
        }
        if ( $has_prop( [ 'box-shadow', 'filter', 'backdrop-filter' ] ) ) {
            return 'Effects > Shadow';
        }
        if ( $has_prop( [ 'border-radius' ] ) ) {
            return 'Effects > Radius';
        }
        if ( $has_prop( [ 'transition', 'transform', 'animation', 'cursor' ] ) ) {
            return 'Interaction > Hover/Focus/Active';
        }

        return 'Utility > General';
    }

    /**
     * Normalize a recipe category: clean up text, rewrite generic categories via inference.
     *
     * @since 0.2.0-lite
     */
    public function normalize_recipe_category( string $category, string $id, array $recipe ): string {
        $category = $this->replace_etch_word( $category );
        $category = trim( preg_replace( '/\s+/', ' ', (string) $category ) );
        $category = $this->remove_btcc_token( $category );
        if ( $this->should_rewrite_recipe_category( $category ) ) {
            $category = $this->infer_recipe_category( $id, $recipe );
        }
        $category = preg_replace( '/\s*>\s*/', ' > ', (string) $category );
        return '' !== trim( (string) $category ) ? trim( (string) $category ) : 'Utility > General';
    }

    /**
     * Normalize a recipe description: clean up text, replace generic boilerplate with a CSS summary.
     *
     * @since 0.2.0-lite
     */
    public function normalize_recipe_description( string $description, string $id, array $recipe ): string {
        $description = trim( $this->replace_etch_word( $description ) );
        $description = trim( $this->remove_btcc_token( $description ) );
        $generic = [
            "the php recipes can't be modified from here and are set as read-only",
            "the acss recipe can't be modified and are set as read-only",
        ];
        if ( '' === $description || in_array( strtolower( $description ), $generic, true ) ) {
            $description = $this->css_parser->summarize_recipe_css( (string) ( $recipe['css'] ?? '' ) );
        }
        $description = preg_replace( '/\s+/', ' ', $description );
        return trim( (string) $description );
    }

    /* ──────────────────────────────────────────────
     *  Drop / blacklist checks
     * ────────────────────────────────────────────── */

    /**
     * Whether a recipe ID is on the blacklist (e.g. mega-media-wrapper).
     *
     * @since 0.2.0-lite
     */
    public function is_blacklisted_recipe_id( string $id_lc ): bool {
        $tokens = apply_filters(
            'rcat/cleanup_recipe_blacklist_tokens',
            [
                'media-wrapper-mega',
                'mega-media-wrapper',
                'responsive-media-wrapper',
            ]
        );

        foreach ( (array) $tokens as $token ) {
            $token = strtolower( trim( (string) $token ) );
            if ( '' !== $token && str_contains( $id_lc, $token ) ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether a recipe definition should be dropped entirely (variable-only, font-face, blacklisted, etc.).
     *
     * @since 0.2.0-lite
     */
    public function should_drop_recipe_definition( string $id, array $recipe, string $raw_css, string $normalized_css ): bool {
        $id_lc = strtolower( trim( $id ) );
        if ( '' === $id_lc ) {
            return true;
        }

        if ( str_starts_with( $id_lc, 'v-' ) || str_starts_with( $id_lc, 'v_' ) || str_starts_with( $id_lc, '--' ) ) {
            return true;
        }
        if ( $this->is_variable_recipe_definition( $id, $recipe ) ) {
            return true;
        }

        $css_lc = strtolower( $raw_css );
        if ( str_contains( $css_lc, '@font-face' ) ) {
            return true;
        }
        if ( '' === trim( $normalized_css ) ) {
            return true;
        }

        if ( preg_match( '/^(?:html|body|h[1-6]|p|a|ul|ol|li|img|svg|button|input|textarea|select|table|thead|tbody|tr|td|th)$/', $id_lc ) ) {
            return true;
        }

        if ( $this->is_blacklisted_recipe_id( $id_lc ) ) {
            return true;
        }

        if ( str_contains( $css_lc, '@media' ) ) {
            $decl_count = count( $this->css_parser->extract_recipe_declarations( $raw_css ) );
            if ( $decl_count >= 36 && preg_match( '/(?:grid-(?:column|row)|span|order|media-wrapper)/i', $raw_css ) ) {
                return true;
            }
        }

        return false;
    }

    /* ──────────────────────────────────────────────
     *  Main sanitization entry point
     * ────────────────────────────────────────────── */

    /**
     * Sanitize and normalize a raw recipe definition.
     *
     * Returns `null` when the recipe should be dropped, or an array with
     * `'id'` and `'recipe'` keys on success.
     *
     * @since 0.2.0-lite
     *
     * @param string $id                Recipe ID (raw).
     * @param array  $recipe            Raw recipe definition.
     * @param string $fallback_category Fallback category when none is provided.
     * @return array{id: string, recipe: array}|null
     */
    public function sanitize_recipe_definition( string $id, array $recipe, string $fallback_category = 'Imported Recipes' ) {
        $source_id = $this->css_parser->clean_utf8_text( trim( $id ) );
        $source_id = '' !== $source_id ? $source_id : (string) ( $recipe['id'] ?? $recipe['label'] ?? '' );
        $source_id = trim( $this->css_parser->clean_utf8_text( $source_id ) );
        if ( '' === $source_id ) {
            return null;
        }

        $label = $this->css_parser->clean_utf8_text( (string) ( $recipe['label'] ?? $source_id ) );
        $category = $this->css_parser->clean_utf8_text( (string) ( $recipe['category'] ?? '' ) );
        $description = $this->css_parser->clean_utf8_text( (string) ( $recipe['description'] ?? $recipe['message'] ?? '' ) );
        $raw_css = $this->css_parser->clean_utf8_text( $this->filter_adapter->normalize_css( $recipe['css'] ?? $recipe['contentCss'] ?? '' ) );
        $normalized_css = $this->css_parser->normalize_recipe_css_conflicts( $raw_css );
        $normalized_css = $this->css_parser->normalize_recipe_css_by_id( $source_id, $normalized_css );
        $normalized_css = $this->css_parser->normalize_recipe_css_conflicts( $normalized_css );

        $normalize_preset = $this->callbacks['normalize_preset'] ?? static fn( string $v, string $f ) => $f;
        $normalize_preset_label = $this->callbacks['normalize_preset_label'] ?? static fn( string $p, string $v ) => $v;
        $compact_definition = $this->callbacks['compact_definition'] ?? static fn( array $r ) => $r;

        $preset = $normalize_preset(
            (string) ( $recipe['preset'] ?? '' ),
            'shared'
        );
        $preset_label = $normalize_preset_label(
            $preset,
            (string) ( $recipe['presetLabel'] ?? '' )
        );
        $candidate = [
            'label'       => $this->replace_etch_word( $label ),
            'category'    => '' !== trim( $category ) ? $this->replace_etch_word( $category ) : $fallback_category,
            'description' => $this->replace_etch_word( $description ),
            'css'         => $normalized_css,
            'preset'      => $preset,
            'presetLabel' => $preset_label,
        ];

        if ( $this->should_drop_recipe_definition( $source_id, $candidate, $raw_css, $normalized_css ) ) {
            return null;
        }

        $next_id = $this->with_variable_recipe_id_prefix( $source_id, $candidate );
        if ( '' === $next_id ) {
            return null;
        }
        $candidate['id'] = $next_id;
        $candidate['label'] = $this->with_variable_recipe_label_prefix(
            (string) ( $candidate['label'] ?? $next_id ),
            $next_id,
            $candidate
        );
        $candidate['category'] = $this->normalize_recipe_category(
            (string) ( $candidate['category'] ?? '' ),
            $next_id,
            $candidate
        );
        $candidate['description'] = $this->normalize_recipe_description(
            (string) ( $candidate['description'] ?? '' ),
            $next_id,
            $candidate
        );

        return [
            'id' => $next_id,
            'recipe' => $compact_definition( $candidate ),
        ];
    }
}

if ( ! class_exists( 'RCAT_Recipe_Sanitizer', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Sanitizer', 'RCAT_Recipe_Sanitizer' );
}
