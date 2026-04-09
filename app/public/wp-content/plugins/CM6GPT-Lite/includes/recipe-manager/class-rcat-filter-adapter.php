<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Adapter for normalizing CSS values from various filter formats.
 *
 * @since 0.1.1-lite
 */
class CM6GPT_Lite_Recipe_Filter_Adapter {

    /**
     * Normalize a CSS value from mixed input formats into a trimmed string.
     *
     * Accepts arrays with known keys (contentCss, css, content, snippet) or scalar values.
     *
     * @since 0.1.1-lite
     * @param mixed $value Raw CSS value — array with known keys or scalar.
     * @return string Trimmed CSS string, or empty string if input is not usable.
     */
    public function normalize_css( $value ): string {
        if ( is_array( $value ) ) {
            $value = $value['contentCss'] ?? $value['css'] ?? $value['content'] ?? $value['snippet'] ?? '';
        }
        if ( ! is_scalar( $value ) ) {
            return '';
        }
        return trim( (string) $value );
    }
}

if ( ! class_exists( 'RCAT_Filter_Adapter', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Filter_Adapter', 'RCAT_Filter_Adapter' );
}
