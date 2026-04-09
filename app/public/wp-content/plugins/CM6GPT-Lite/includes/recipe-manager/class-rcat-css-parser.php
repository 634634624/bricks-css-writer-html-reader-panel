<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CSS parsing, formatting, and normalization for the CM6GPT Lite Recipe Catalog.
 *
 * Extracted from the Recipe Catalog facade during the decomposition pass.
 * All CSS-related logic lives here; the manager delegates to this class.
 *
 * @since 0.2.0-lite
 */
class CM6GPT_Lite_Recipe_CSS_Parser {

    /**
     * Callbacks for operations that remain in the manager (sanitize, unique ID, preset normalization).
     *
     * @since 0.2.0-lite
     * @var array<string, callable>
     */
    private array $callbacks;

    /**
     * Initialize the CSS parser with external dependency callbacks.
     *
     * @since 0.2.0-lite
     * @param array<string, callable> $callbacks {
     *     @type callable $sanitize_recipe  fn( string $id, array $recipe, string $fallback_category ): ?array
     *     @type callable $unique_id        fn( string $candidate, array $existing ): string
     *     @type callable $normalize_preset fn( string $value, string $fallback ): string
     * }
     */
    public function __construct( array $callbacks = [] ) {
        $this->callbacks = CM6GPT_Lite_Recipe_Callback_Guards::require_map(
            $callbacks,
            [ 'sanitize_recipe', 'unique_id', 'normalize_preset' ],
            __CLASS__
        );
    }

    /* ── UTF-8 Utilities ── */

    /**
     * Sanitize a string to valid UTF-8, stripping broken bytes.
     *
     * @since 0.2.0-lite
     * @param string $value Raw text.
     * @return string Valid UTF-8 string.
     */
    public function clean_utf8_text( string $value ): string {
        if ( 1 === preg_match( '//u', $value ) ) {
            return $value;
        }
        if ( function_exists( 'mb_convert_encoding' ) ) {
            $value = (string) @mb_convert_encoding( $value, 'UTF-8', 'UTF-8' );
        }
        if ( 1 === preg_match( '//u', $value ) ) {
            return $value;
        }
        if ( function_exists( 'iconv' ) ) {
            $converted = @iconv( 'UTF-8', 'UTF-8//IGNORE', $value );
            if ( is_string( $converted ) ) {
                $value = $converted;
            }
        }
        if ( 1 !== preg_match( '//u', $value ) ) {
            $value = (string) preg_replace( '/[^\x09\x0A\x0D\x20-\x7E]/', '', $value );
        }
        return $value;
    }

    /* ── Low-Level CSS Helpers ── */

    /**
     * Strip block and single-line comments from CSS text.
     *
     * @since 0.2.0-lite
     * @param string $css Raw CSS text.
     * @return string CSS without comments.
     */
    public function strip_recipe_css_comments( string $css ): string {
        $clean = preg_replace( '/\/\*[\s\S]*?\*\//', '', $css );
        $clean = is_string( $clean ) ? $clean : $css;
        $clean = preg_replace( '/^\s*\/\/.*$/m', '', $clean );
        return is_string( $clean ) ? $clean : $css;
    }

    /**
     * Extract individual CSS declarations (property: value pairs) from CSS text.
     *
     * @since 0.2.0-lite
     * @param string $css Raw CSS text (may include selectors/braces).
     * @return array<int, array{prop: string, prop_lc: string, value: string}> Parsed declarations.
     */
    public function extract_recipe_declarations( string $css ): array {
        $css = str_replace( [ "\r\n", "\r" ], "\n", $css );
        $clean = $this->strip_recipe_css_comments( $css );
        $clean = str_replace( [ '{', '}' ], "\n", $clean );
        $lines = preg_split( '/\n/', $clean );
        if ( ! is_array( $lines ) ) {
            return [];
        }

        $decls = [];
        foreach ( $lines as $line ) {
            $line = trim( (string) $line );
            if ( '' === $line ) {
                continue;
            }
            if ( str_starts_with( $line, '@' ) || str_starts_with( $line, '//' ) ) {
                continue;
            }

            $segments = preg_split( '/;/', $line );
            if ( ! is_array( $segments ) ) {
                $segments = [ $line ];
            }
            foreach ( $segments as $segment ) {
                $segment = trim( (string) $segment );
                if ( '' === $segment ) {
                    continue;
                }
                if ( str_starts_with( $segment, '@' ) || str_contains( $segment, '{' ) || str_contains( $segment, '}' ) ) {
                    continue;
                }
                if ( ! preg_match( '/^(--[a-zA-Z0-9_-]+|[a-zA-Z_-][a-zA-Z0-9_-]*)\s*:\s*(.+)$/', $segment, $m ) ) {
                    continue;
                }
                $prop = trim( (string) ( $m[1] ?? '' ) );
                $value = trim( (string) ( $m[2] ?? '' ) );
                if ( '' === $prop || '' === $value ) {
                    continue;
                }
                $decls[] = [
                    'prop' => $prop,
                    'prop_lc' => strtolower( $prop ),
                    'value' => rtrim( $value, ';' ),
                ];
            }
        }

        return $decls;
    }

    /* ── CSS Formatting ── */

    /**
     * Pretty-print structured CSS (selectors, nesting, at-rules) with consistent indentation.
     *
     * @since 0.2.0-lite
     * @param string $css Raw CSS text.
     * @return string Formatted CSS.
     */
    public function format_structured_recipe_css( string $css ): string {
        $css = trim( str_replace( [ "\r\n", "\r" ], "\n", $css ) );
        if ( '' === $css ) {
            return '';
        }

        $css = $this->strip_recipe_css_comments( $css );
        $len = strlen( $css );
        if ( 0 === $len ) {
            return '';
        }

        $out = [];
        $buffer = '';
        $indent = 0;
        $in_string = false;
        $quote = '';
        $paren_depth = 0;

        $flush = static function( string $raw, int $level, bool $is_declaration ) use ( &$out ): void {
            $raw = trim( $raw );
            if ( '' === $raw ) {
                return;
            }
            $line = preg_replace( '/\s+/', ' ', $raw );
            $line = is_string( $line ) ? trim( $line ) : $raw;
            if ( $is_declaration && ! str_ends_with( $line, ';' ) ) {
                $line .= ';';
            }
            $out[] = str_repeat( '  ', max( 0, $level ) ) . $line;
        };

        for ( $i = 0; $i < $len; $i++ ) {
            $ch = $css[ $i ];

            if ( $in_string ) {
                $buffer .= $ch;
                if ( '\\' === $ch && $i + 1 < $len ) {
                    $i++;
                    $buffer .= $css[ $i ];
                    continue;
                }
                if ( $ch === $quote ) {
                    $in_string = false;
                    $quote = '';
                }
                continue;
            }

            if ( '"' === $ch || "'" === $ch ) {
                $in_string = true;
                $quote = $ch;
                $buffer .= $ch;
                continue;
            }

            if ( '(' === $ch ) {
                $paren_depth++;
                $buffer .= $ch;
                continue;
            }

            if ( ')' === $ch ) {
                $paren_depth = max( 0, $paren_depth - 1 );
                $buffer .= $ch;
                continue;
            }

            if ( $paren_depth > 0 ) {
                $buffer .= $ch;
                continue;
            }

            if ( '{' === $ch ) {
                $selector = trim( $buffer );
                if ( '' !== $selector ) {
                    $selector = preg_replace( '/\s+/', ' ', $selector );
                    $selector = is_string( $selector ) ? trim( $selector ) : $selector;
                    $out[] = str_repeat( '  ', max( 0, $indent ) ) . $selector . ' {';
                } else {
                    $out[] = str_repeat( '  ', max( 0, $indent ) ) . '{';
                }
                $buffer = '';
                $indent++;
                continue;
            }

            if ( ';' === $ch ) {
                $flush( $buffer, $indent, true );
                $buffer = '';
                continue;
            }

            if ( '}' === $ch ) {
                $flush( $buffer, $indent, preg_match( '/^[^@{}]+:[^{}]+$/', trim( $buffer ) ) === 1 );
                $buffer = '';
                $indent = max( 0, $indent - 1 );
                $out[] = str_repeat( '  ', $indent ) . '}';
                continue;
            }

            if ( "\n" === $ch || "\r" === $ch || "\t" === $ch ) {
                if ( '' !== $buffer && ! preg_match( '/\s$/', $buffer ) ) {
                    $buffer .= ' ';
                }
                continue;
            }

            $buffer .= $ch;
        }

        $tail = trim( $buffer );
        if ( '' !== $tail ) {
            $flush( $tail, $indent, preg_match( '/^[^@{}]+:[^{}]+$/', $tail ) === 1 );
        }

        $normalized = [];
        foreach ( $out as $line ) {
            $line = rtrim( (string) $line );
            if ( '' === $line ) {
                continue;
            }
            $normalized[] = $line;
        }
        return trim( implode( "\n", $normalized ) );
    }

    /* ── CSS Normalization ── */

    /**
     * Wrap margin declarations in a child combinator block for stack recipes.
     *
     * @since 0.2.0-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS text.
     * @return string Normalized CSS (wrapped if applicable).
     */
    public function normalize_stack_child_spacing_recipe_css( string $id, string $css ): string {
        $id_lc = strtolower( trim( $id ) );
        if ( '' === $id_lc || preg_match( '/(?:^|[-_])stack(?:[-_]|$)/', $id_lc ) !== 1 ) {
            return $css;
        }
        if ( str_contains( $css, '> * + *' ) || str_contains( $css, '& > * + *' ) ) {
            return $css;
        }
        if ( str_contains( $css, '{' ) || str_contains( $css, '}' ) || str_contains( $css, '@' ) ) {
            return $css;
        }

        $decls = $this->extract_recipe_declarations( $css );
        if ( empty( $decls ) ) {
            return $css;
        }

        $allowed = [
            'margin',
            'margin-top',
            'margin-block',
            'margin-block-start',
        ];
        $lines = [];
        foreach ( $decls as $decl ) {
            $prop_lc = (string) ( $decl['prop_lc'] ?? '' );
            $prop = trim( (string) ( $decl['prop'] ?? '' ) );
            $value = trim( (string) ( $decl['value'] ?? '' ) );
            if ( '' === $prop || '' === $value ) {
                continue;
            }
            if ( ! in_array( $prop_lc, $allowed, true ) ) {
                return $css;
            }
            $lines[] = $prop . ': ' . $value . ';';
        }
        if ( empty( $lines ) ) {
            return $css;
        }

        return "& > * + * {\n  " . implode( "\n  ", $lines ) . "\n}";
    }

    /**
     * Expand auto-grid variant recipe IDs into full grid CSS declarations.
     *
     * @since 0.2.0-lite
     * @param string $id  Recipe ID (e.g. auto-fit-200px).
     * @param string $css Raw CSS text.
     * @return string Expanded grid CSS or original CSS if not applicable.
     */
    public function normalize_auto_grid_variant_recipe_css( string $id, string $css ): string {
        $id_lc = strtolower( trim( $id ) );
        if ( preg_match( '/^auto[-_](fit|fill)[-_]([0-9]+(?:\.[0-9]+)?(?:px|rem|em|ch|vw|vh)?)$/', $id_lc, $m ) !== 1 ) {
            return $css;
        }

        $mode = (string) ( $m[1] ?? '' );
        $size = (string) ( $m[2] ?? '' );
        if ( '' === $mode || '' === $size ) {
            return $css;
        }

        $decls = $this->extract_recipe_declarations( $css );
        if ( count( $decls ) === 1 ) {
            $prop = (string) ( $decls[0]['prop_lc'] ?? '' );
            if ( in_array( $prop, [ '--col-min', '--auto-grid-min' ], true ) ) {
                $candidate = trim( (string) ( $decls[0]['value'] ?? '' ) );
                if ( '' !== $candidate ) {
                    $size = $candidate;
                }
            } else {
                return $css;
            }
        } elseif ( count( $decls ) > 0 ) {
            return $css;
        }

        if ( preg_match( '/^[0-9]+(?:\.[0-9]+)?$/', $size ) === 1 ) {
            $size .= 'px';
        }

        return implode(
            "\n",
            [
                'display: grid;',
                'gap: var(--grid-gap);',
                'grid-template-columns: repeat(auto-' . $mode . ', minmax(min(100%, ' . $size . '), 1fr));',
            ]
        );
    }

    /**
     * Expand variable-only variant recipes (auto-grid tiers, sidebar, ribbon) into full CSS.
     *
     * @since 0.2.0-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS text (expected to contain only custom property declarations).
     * @return string Expanded CSS or original CSS if not applicable.
     */
    public function normalize_variable_only_variant_recipe_css( string $id, string $css ): string {
        $id_lc = strtolower( trim( $id ) );
        if ( '' === $id_lc ) {
            return $css;
        }

        $decls = $this->extract_recipe_declarations( $css );
        if ( empty( $decls ) ) {
            return $css;
        }

        $vars = [];
        foreach ( $decls as $decl ) {
            $prop_lc = (string) ( $decl['prop_lc'] ?? '' );
            $value = trim( (string) ( $decl['value'] ?? '' ) );
            if ( '' === $prop_lc || '' === $value ) {
                continue;
            }
            if ( ! str_starts_with( $prop_lc, '--' ) ) {
                return $css;
            }
            $vars[ $prop_lc ] = $value;
        }

        if ( preg_match( '/^auto-grid(?:--|[-_])(xs|s|l|xl)$/', $id_lc, $m ) === 1 ) {
            $size_map = [
                'xs' => '8rem',
                's'  => '12rem',
                'l'  => '20rem',
                'xl' => '24rem',
            ];
            $tier = (string) ( $m[1] ?? '' );
            $size = trim( (string) ( $vars['--auto-grid-min'] ?? ( $size_map[ $tier ] ?? '16rem' ) ) );
            if ( '' === $size ) {
                $size = $size_map[ $tier ] ?? '16rem';
            }
            return implode(
                "\n",
                [
                    'display: grid;',
                    'gap: var(--grid-gap, 1.5rem);',
                    'grid-template-columns: repeat(auto-fit, minmax(min(var(--auto-grid-min, ' . $size . '), 100%), 1fr));',
                ]
            );
        }

        if ( preg_match( '/^l-sidebar(?:--|[-_])(narrow|wide)$/', $id_lc, $m ) === 1 ) {
            $tier = (string) ( $m[1] ?? '' );
            $default_width = 'narrow' === $tier ? 'var(--sidebar-narrow, 260px)' : 'var(--sidebar-wide, 340px)';
            $width = trim( (string) ( $vars['--sidebar-width'] ?? $default_width ) );
            if ( '' === $width ) {
                $width = $default_width;
            }
            return implode(
                "\n",
                [
                    'display: grid;',
                    'grid-template-columns: minmax(min(' . $width . ', 100%), auto) 1fr;',
                    'gap: var(--sidebar-layout-gap, 2rem);',
                    'align-items: start;',
                ]
            );
        }

        if ( preg_match( '/^ribbon(?:--|[-_])(new|hot|exclusive|best|limited)$/', $id_lc, $m ) === 1 ) {
            $variant = (string) ( $m[1] ?? '' );
            $bg_defaults = [
                'new'       => 'var(--success, #22C55E)',
                'hot'       => 'var(--error, #EF4444)',
                'exclusive' => 'var(--secondary, #7C3AED)',
                'best'      => 'linear-gradient(135deg, #f59e0b, #ec4899)',
                'limited'   => 'var(--warning, #F59E0B)',
            ];
            $bg = trim( (string) ( $vars['--ribbon-bg'] ?? ( $bg_defaults[ $variant ] ?? '' ) ) );
            if ( '' === $bg ) {
                return $css;
            }
            $lines = [
                'background: ' . $bg . ';',
            ];
            if ( 'limited' === $variant ) {
                $text = trim( (string) ( $vars['--ribbon-text'] ?? '#000' ) );
                if ( '' !== $text ) {
                    $lines[] = 'color: ' . $text . ';';
                }
            }
            return implode( "\n", $lines );
        }

        return $css;
    }

    /**
     * Apply all ID-based CSS normalizations in sequence.
     *
     * @since 0.2.0-lite
     * @param string $id  Recipe ID.
     * @param string $css Raw CSS text.
     * @return string Normalized CSS.
     */
    public function normalize_recipe_css_by_id( string $id, string $css ): string {
        $next = $this->normalize_auto_grid_variant_recipe_css( $id, $css );
        $next = $this->normalize_variable_only_variant_recipe_css( $id, $next );
        $next = $this->normalize_stack_child_spacing_recipe_css( $id, $next );
        return $next;
    }

    /**
     * Normalize recipe CSS: format structured blocks or deduplicate flat declarations.
     *
     * @since 0.2.0-lite
     * @param string $css Raw CSS text.
     * @return string Normalized CSS.
     */
    public function normalize_recipe_css_conflicts( string $css ): string {
        $css = trim( str_replace( [ "\r\n", "\r" ], "\n", $css ) );
        if ( '' === $css ) {
            return '';
        }

        // Keep structured recipe CSS (nested selectors, pseudo blocks, @media/@container).
        // Selectorless import uses these blocks as-is and AT injection can scope them correctly.
        if (
            str_contains( $css, '{' ) ||
            str_contains( $css, '}' ) ||
            str_contains( $css, '@media' ) ||
            str_contains( $css, '@container' ) ||
            str_contains( $css, '@supports' ) ||
            str_contains( $css, '&:' ) ||
            str_contains( $css, '::' ) ||
            str_contains( $css, '> * + *' )
        ) {
            return $this->format_structured_recipe_css( $css );
        }

        $decls = $this->extract_recipe_declarations( $css );
        if ( empty( $decls ) ) {
            return '';
        }

        $lines = [];
        foreach ( $decls as $decl ) {
            $prop = trim( (string) ( $decl['prop'] ?? '' ) );
            $value = trim( (string) ( $decl['value'] ?? '' ) );
            if ( '' === $prop || '' === $value ) {
                continue;
            }
            $lines[] = $prop . ': ' . $value . ';';
        }

        return implode( "\n", $lines );
    }

    /**
     * Generate a short human-readable summary of CSS declarations (up to 3 properties).
     *
     * @since 0.2.0-lite
     * @param string $css Raw CSS text.
     * @return string Summary sentence (e.g. "Sets display and gap.").
     */
    public function summarize_recipe_css( string $css ): string {
        $decls = $this->extract_recipe_declarations( $css );
        if ( empty( $decls ) ) {
            return 'Utility recipe.';
        }
        $props = [];
        foreach ( $decls as $decl ) {
            $prop = (string) ( $decl['prop'] ?? '' );
            if ( '' === $prop || in_array( $prop, $props, true ) ) {
                continue;
            }
            $props[] = $prop;
            if ( count( $props ) >= 3 ) {
                break;
            }
        }
        if ( empty( $props ) ) {
            return 'Utility recipe.';
        }
        if ( 1 === count( $props ) ) {
            return 'Sets ' . $props[0] . '.';
        }
        if ( 2 === count( $props ) ) {
            return 'Sets ' . $props[0] . ' and ' . $props[1] . '.';
        }
        return 'Sets ' . $props[0] . ', ' . $props[1] . ', and ' . $props[2] . '.';
    }

    /* ── Comment / ID Helpers ── */

    /**
     * Extract a category name from a CSS comment block.
     *
     * @since 0.2.0-lite
     * @param string $comment  Raw comment text (without delimiters, or with asterisks).
     * @param string $fallback Fallback category if none found.
     * @return string Extracted category or fallback.
     */
    public function extract_category_from_comment( string $comment, string $fallback ): string {
        $clean = preg_replace( '/\*+/', '', $comment );
        $clean = is_string( $clean ) ? $clean : $comment;
        $parts = preg_split( '/\r\n|\r|\n/', $clean );
        if ( ! is_array( $parts ) ) {
            return $fallback;
        }
        foreach ( $parts as $line ) {
            $line = trim( (string) $line );
            $line = trim( $line, " \t\n\r\0\x0B-_=|:." );
            if ( '' === $line ) {
                continue;
            }
            if ( preg_match( '/^[\p{Z}\p{P}\p{S}]+$/u', $line ) ) {
                continue;
            }
            if ( strlen( $line ) > 96 ) {
                $line = substr( $line, 0, 96 );
            }
            return $line;
        }
        return $fallback;
    }

    /**
     * Determine whether a line looks like a recipe ID (not CSS, not a comment, not a selector).
     *
     * @since 0.2.0-lite
     * @param string $line Single line of text.
     * @return bool True if the line matches recipe ID format.
     */
    public function is_recipe_id_line( string $line ): bool {
        $t = trim( $line );
        if ( '' === $t ) {
            return false;
        }
        if ( strlen( $t ) > 120 ) {
            return false;
        }
        if (
            str_starts_with( $t, '//' ) ||
            str_starts_with( $t, '/*' ) ||
            str_starts_with( $t, '@' ) ||
            str_starts_with( $t, '&' ) ||
            str_starts_with( $t, '>' ) ||
            str_starts_with( $t, '.' ) ||
            str_starts_with( $t, '#' ) ||
            str_starts_with( $t, ':' ) ||
            str_starts_with( $t, '--' )
        ) {
            return false;
        }
        if ( str_contains( $t, ':' ) || str_contains( $t, ';' ) || str_contains( $t, '{' ) || str_contains( $t, '}' ) ) {
            return false;
        }
        return 1 === preg_match( '/^[a-zA-Z0-9._-]+$/', $t );
    }

    /* ── Parsers ── */

    /**
     * Parse recipe text using the primary line-by-line format (ID + CSS lines, separated by blanks).
     *
     * @since 0.2.0-lite
     * @param string $text Raw text input.
     * @return array<string, array> Parsed recipes keyed by ID.
     */
    public function parse( string $text ): array {
        $text = (string) $text;
        $lines = preg_split( '/\r\n|\r|\n/', $text );
        $out = []; $cat = ''; $desc = ''; $cid = ''; $css = []; $preset = 'shared';
        $flush = function () use ( &$out, &$cid, &$css, &$cat, &$desc, &$preset ) {
            if ( $cid !== '' && count( $css ) > 0 ) {
                $recipe = [
                    'label' => $cid,
                    'category' => $cat,
                    'description' => $desc,
                    'css' => implode( "\n", $css ),
                    'preset' => $preset,
                ];
                $entry = $this->cb_sanitize_recipe( $cid, $recipe, 'Imported Recipes' );
                if ( is_array( $entry ) ) {
                    $next_id = (string) ( $entry['id'] ?? '' );
                    $next_recipe = is_array( $entry['recipe'] ?? null ) ? $entry['recipe'] : [];
                    if ( '' !== $next_id && ! empty( $next_recipe ) ) {
                        $next_id = $this->cb_unique_id( $next_id, $out );
                        $out[ $next_id ] = $next_recipe;
                    }
                }
            }
            $css = []; $cid = ''; $desc = ''; $preset = 'shared';
        };
        foreach ( $lines as $line ) {
            $t = trim( $line );
            if ( $t === '' )                                { $flush(); continue; }
            if ( preg_match( '/^\/\s+(.+)$/', $t, $m ) )   { $flush(); $cat = trim( $m[1] ); continue; }
            if ( preg_match( '/^\/\/\s*@preset\s*:\s*(.+)$/i', $t, $m ) ) {
                $preset = $this->cb_normalize_preset( (string) $m[1], 'shared' );
                continue;
            }
            if ( preg_match( '/^\/\/\s*(.*)$/', $t, $m ) )  { $desc = trim( $m[1] ); continue; }
            if ( $cid === '' )                              { $cid = $t; continue; }
            $css[] = $t;
        }
        $flush();
        if ( empty( $out ) && trim( $text ) !== '' ) {
            $out = $this->parse_selectorless_format( $text, 'Imported Recipes' );
        }
        if ( empty( $out ) && trim( $text ) !== '' ) {
            $out = $this->parse_css_blocks( (string) $text );
        }
        return $out;
    }

    /**
     * Parse selectorless recipe format (recipe IDs followed by CSS declarations, category comments).
     *
     * @since 0.2.0-lite
     * @param string $text              Raw text input.
     * @param string $fallback_category Default category for uncategorized recipes.
     * @return array<string, array> Parsed recipes keyed by ID.
     */
    public function parse_selectorless_format( string $text, string $fallback_category = 'Imported Recipes' ): array {
        $lines = preg_split( '/\r\n|\r|\n/', $text );
        if ( ! is_array( $lines ) ) {
            return [];
        }

        $out = [];
        $current_category = $fallback_category;
        $current_id = '';
        $current_css = [];
        $current_desc = '';
        $current_preset = 'shared';
        $brace_depth = 0;
        $in_comment = false;
        $comment_buffer = '';

        $flush = function() use ( &$out, &$current_id, &$current_css, &$current_category, &$current_desc, &$current_preset, &$brace_depth, $fallback_category ) {
            if ( '' !== $current_id && ! empty( $current_css ) ) {
                $recipe = [
                    'label'       => $current_id,
                    'category'    => $current_category,
                    'description' => $current_desc,
                    'css'         => trim( implode( "\n", $current_css ) ),
                    'preset'      => $current_preset,
                ];
                if ( '' !== $recipe['css'] ) {
                    $entry = $this->cb_sanitize_recipe( $current_id, $recipe, $fallback_category );
                    if ( is_array( $entry ) ) {
                        $next_id = (string) ( $entry['id'] ?? '' );
                        $next_recipe = is_array( $entry['recipe'] ?? null ) ? $entry['recipe'] : [];
                        if ( '' !== $next_id && ! empty( $next_recipe ) ) {
                            $next_id = $this->cb_unique_id( $next_id, $out );
                            $out[ $next_id ] = $next_recipe;
                        }
                    }
                }
            }
            $current_id = '';
            $current_css = [];
            $current_desc = '';
            $current_preset = 'shared';
            $brace_depth = 0;
        };

        foreach ( $lines as $line ) {
            $raw = rtrim( (string) $line, "\r" );
            $trimmed = trim( $raw );

            if ( $in_comment ) {
                $comment_buffer .= ( '' !== $comment_buffer ? "\n" : '' ) . $trimmed;
                if ( str_contains( $trimmed, '*/' ) ) {
                    $in_comment = false;
                    $current_category = $this->extract_category_from_comment( $comment_buffer, $current_category ?: $fallback_category );
                    $comment_buffer = '';
                }
                continue;
            }

            if ( preg_match( '/^\/\*(.*)\*\/$/', $trimmed, $m ) ) {
                $current_category = $this->extract_category_from_comment( (string) $m[1], $current_category ?: $fallback_category );
                continue;
            }
            if ( str_starts_with( $trimmed, '/*' ) ) {
                $in_comment = true;
                $comment_buffer = $trimmed;
                if ( str_contains( $trimmed, '*/' ) ) {
                    $in_comment = false;
                    $current_category = $this->extract_category_from_comment( $comment_buffer, $current_category ?: $fallback_category );
                    $comment_buffer = '';
                }
                continue;
            }

            if ( preg_match( '/^\/\/\s*@preset\s*:\s*(.+)$/i', $trimmed, $m ) ) {
                $current_preset = $this->cb_normalize_preset( (string) $m[1], 'shared' );
                continue;
            }

            if ( '' === $trimmed ) {
                // Keep blank lines inside selectorless recipes to avoid splitting
                // variable prelude and declaration blocks into separate recipes.
                continue;
            }

            if ( '' === $current_id ) {
                if ( preg_match( '/^\/\/\s*(.+)$/', $trimmed, $m ) ) {
                    $current_desc = trim( (string) $m[1] );
                    continue;
                }
                if ( preg_match( '/^\/\s+(.+)$/', $trimmed, $m ) ) {
                    $current_category = trim( (string) $m[1] );
                    continue;
                }
                if ( ! $this->is_recipe_id_line( $trimmed ) ) {
                    continue;
                }

                $current_id = trim( $trimmed );
                continue;
            }

            if ( $this->is_recipe_id_line( $trimmed ) && $brace_depth <= 0 ) {
                $flush();
                $current_id = trim( $trimmed );
                continue;
            }

            $current_css[] = $raw;
            $brace_depth += substr_count( $raw, '{' );
            $brace_depth -= substr_count( $raw, '}' );
            if ( $brace_depth < 0 ) {
                $brace_depth = 0;
            }
        }

        $flush();
        return $out;
    }

    /**
     * Parse CSS text as selector { declarations } blocks.
     *
     * @since 0.2.0-lite
     * @param string $text Raw CSS text.
     * @return array<string, array> Parsed recipes keyed by ID.
     */
    public function parse_css_blocks( string $text ): array {
        $out = [];
        $seen = [];
        $clean = preg_replace( '/\/\*[\s\S]*?\*\//', '', $text );
        if ( ! is_string( $clean ) ) {
            $clean = $text;
        }

        if ( ! preg_match_all( '/([^{}]+)\{([^{}]+)\}/m', $clean, $matches, PREG_SET_ORDER ) ) {
            return [];
        }

        foreach ( $matches as $m ) {
            $selectors_raw = isset( $m[1] ) ? (string) $m[1] : '';
            $css_raw       = isset( $m[2] ) ? trim( (string) $m[2] ) : '';
            if ( '' === $css_raw ) {
                continue;
            }

            $selectors = array_filter(
                array_map(
                    'trim',
                    explode( ',', $selectors_raw )
                )
            );
            if ( empty( $selectors ) ) {
                continue;
            }

            foreach ( $selectors as $selector ) {
                $id_base = sanitize_title( $selector );
                if ( '' === $id_base ) {
                    $id_base = 'imported-recipe';
                }
                $id = $id_base;
                $i  = 2;
                while ( isset( $seen[ $id ] ) ) {
                    $id = $id_base . '-' . $i;
                    $i++;
                }
                $seen[ $id ] = true;

                $decls = preg_split( '/;\s*/', $css_raw );
                $decls = array_filter( array_map( 'trim', is_array( $decls ) ? $decls : [] ) );
                $normalized_css = implode(
                    "\n",
                    array_map(
                        function( $line ) {
                            return rtrim( $line, ';' ) . ';';
                        },
                        $decls
                    )
                );
                if ( '' === trim( $normalized_css ) ) {
                    continue;
                }

                $recipe = [
                    'label'       => $selector,
                    'category'    => 'Imported CSS',
                    'description' => 'Imported from CSS file',
                    'css'         => $normalized_css,
                ];
                $entry = $this->cb_sanitize_recipe( $id, $recipe, 'Imported CSS' );
                if ( ! is_array( $entry ) ) {
                    continue;
                }
                $final_id = (string) ( $entry['id'] ?? '' );
                $final_recipe = is_array( $entry['recipe'] ?? null ) ? $entry['recipe'] : [];
                if ( '' === $final_id || empty( $final_recipe ) ) {
                    continue;
                }
                $final_id = $this->cb_unique_id( $final_id, $out );
                $out[ $final_id ] = $final_recipe;
                $seen[ $final_id ] = true;
            }
        }
        return $out;
    }

    /**
     * Parse CSS text containing simple class selectors (.classname { ... }) into recipes.
     *
     * @since 0.2.0-lite
     * @param string $text              Raw CSS text.
     * @param string $fallback_category Default category.
     * @return array<string, array> Parsed recipes keyed by ID.
     */
    public function parse_simple_class_css_blocks( string $text, string $fallback_category = 'Imported CSS' ): array {
        $out = [];
        $clean = preg_replace( '/\/\*[\s\S]*?\*\//', '', $text );
        if ( ! is_string( $clean ) ) {
            $clean = $text;
        }

        if ( ! preg_match_all( '/([^{}]+)\{([^{}]+)\}/m', $clean, $matches, PREG_SET_ORDER ) ) {
            return [];
        }

        foreach ( $matches as $m ) {
            $selectors_raw = isset( $m[1] ) ? (string) $m[1] : '';
            $css_raw       = isset( $m[2] ) ? trim( (string) $m[2] ) : '';
            if ( '' === $css_raw ) {
                continue;
            }

            $selectors = array_filter( array_map( 'trim', explode( ',', $selectors_raw ) ) );
            if ( empty( $selectors ) ) {
                continue;
            }

            foreach ( $selectors as $selector ) {
                if ( ! preg_match( '/^\.[_a-zA-Z][_a-zA-Z0-9-]*$/', $selector ) ) {
                    continue;
                }

                $id = ltrim( $selector, '.' );
                if ( '' === $id || isset( $out[ $id ] ) ) {
                    continue;
                }

                $decls = preg_split( '/;\s*/', $css_raw );
                $decls = array_filter( array_map( 'trim', is_array( $decls ) ? $decls : [] ) );
                $normalized_css = implode(
                    "\n",
                    array_map(
                        static function( $line ) {
                            return rtrim( (string) $line, ';' ) . ';';
                        },
                        $decls
                    )
                );
                if ( '' === trim( $normalized_css ) ) {
                    continue;
                }

                $recipe = [
                    'label'       => $id,
                    'category'    => $fallback_category,
                    'description' => 'Imported from CSS class selector',
                    'css'         => $normalized_css,
                ];
                $entry = $this->cb_sanitize_recipe( $id, $recipe, $fallback_category );
                if ( ! is_array( $entry ) ) {
                    continue;
                }
                $final_id = (string) ( $entry['id'] ?? '' );
                $final_recipe = is_array( $entry['recipe'] ?? null ) ? $entry['recipe'] : [];
                if ( '' === $final_id || empty( $final_recipe ) ) {
                    continue;
                }
                $final_id = $this->cb_unique_id( $final_id, $out );
                $out[ $final_id ] = $final_recipe;
            }
        }

        return $out;
    }

    /* ── Internal Callback Wrappers ── */

    /**
     * Delegate to the sanitize_recipe callback.
     *
     * @since 0.2.0-lite
     * @param string $id                Recipe ID.
     * @param array  $recipe            Recipe definition.
     * @param string $fallback_category Fallback category.
     * @return array|null Sanitized entry or null.
     */
    private function cb_sanitize_recipe( string $id, array $recipe, string $fallback_category ): ?array {
        if ( ! isset( $this->callbacks['sanitize_recipe'] ) || ! is_callable( $this->callbacks['sanitize_recipe'] ) ) {
            return [ 'id' => $id, 'recipe' => $recipe ];
        }
        $result = ( $this->callbacks['sanitize_recipe'] )( $id, $recipe, $fallback_category );
        return is_array( $result ) ? $result : null;
    }

    /**
     * Delegate to the unique_id callback.
     *
     * @since 0.2.0-lite
     * @param string $candidate Candidate recipe ID.
     * @param array  $existing  Existing recipes map.
     * @return string Unique recipe ID.
     */
    private function cb_unique_id( string $candidate, array $existing ): string {
        if ( ! isset( $this->callbacks['unique_id'] ) || ! is_callable( $this->callbacks['unique_id'] ) ) {
            return $candidate;
        }
        return (string) ( $this->callbacks['unique_id'] )( $candidate, $existing );
    }

    /**
     * Delegate to the normalize_preset callback.
     *
     * @since 0.2.0-lite
     * @param string $value    Raw preset value.
     * @param string $fallback Fallback preset.
     * @return string Normalized preset key.
     */
    private function cb_normalize_preset( string $value, string $fallback ): string {
        if ( ! isset( $this->callbacks['normalize_preset'] ) || ! is_callable( $this->callbacks['normalize_preset'] ) ) {
            return $fallback;
        }
        return (string) ( $this->callbacks['normalize_preset'] )( $value, $fallback );
    }
}

if ( ! class_exists( 'RCAT_CSS_Parser', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_CSS_Parser', 'RCAT_CSS_Parser' );
}
