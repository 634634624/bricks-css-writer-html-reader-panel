<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Static renderer for the Recipe Manager admin page.
 *
 * @since 0.1.1-lite
 */
class CM6GPT_Lite_Recipe_Admin_Page {

    /**
     * Render the Recipe Manager admin page HTML.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public static function render(): void {
        include __DIR__ . '/views/admin-page.php';
    }
}

if ( ! class_exists( 'RCAT_Admin_Page', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Admin_Page', 'RCAT_Admin_Page' );
}
