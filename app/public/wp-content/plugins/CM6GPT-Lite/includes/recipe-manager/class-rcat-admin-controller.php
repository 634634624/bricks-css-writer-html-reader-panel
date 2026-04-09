<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * AJAX route controller for the Recipe Manager admin operations.
 *
 * @since 0.1.1-lite
 */
class CM6GPT_Lite_Recipe_Admin_Controller {

    private $manager;

    /**
     * Initialize the controller with a recipe manager instance.
     *
     * @since 0.1.1-lite
     * @param CM6GPT_Lite_Recipe_Manager|Recipe_Catalog $manager Recipe Catalog facade that handles business logic.
     */
    public function __construct( $manager ) {
        $this->manager = $manager;
    }

    /**
     * Register all wp_ajax action hooks for recipe CRUD operations.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function register(): void {
        $routes = [
            'save' => [ $this, 'ajax_save' ],
            'delete' => [ $this, 'ajax_delete' ],
            'duplicate' => [ $this, 'ajax_duplicate' ],
            'move' => [ $this, 'ajax_move' ],
            'bulk_import' => [ $this, 'ajax_bulk_import' ],
            'delete_all' => [ $this, 'ajax_delete_all' ],
            'set_active_preset' => [ $this, 'ajax_set_active_preset' ],
        ];

        foreach ( $this->ajax_action_prefixes() as $prefix ) {
            foreach ( $routes as $action => $handler ) {
                add_action( "wp_ajax_{$prefix}{$action}", $handler );
            }
        }
    }

    /**
     * Get the accepted AJAX action prefixes during the naming-cleanup transition.
     *
     * @since 0.2.0-lite
     * @return array<int, string>
     */
    private function ajax_action_prefixes(): array {
        return [
            'cm6gpt_lite_recipe_catalog_',
            'rcat_',
        ];
    }

    /**
     * Validate either the canonical or legacy AJAX nonce action.
     *
     * @since 0.2.0-lite
     * @return bool
     */
    private function has_valid_ajax_nonce(): bool {
        $nonce = sanitize_text_field( wp_unslash( $_POST['_ajax_nonce'] ?? '' ) );
        if ( '' === $nonce ) {
            return false;
        }

        return (bool) wp_verify_nonce( $nonce, 'cm6gpt_lite_recipe_catalog' ) || (bool) wp_verify_nonce( $nonce, 'rcat' );
    }

    /**
     * Verify nonce and capability for an AJAX request.
     *
     * @since 0.1.1-lite
     * @return bool True if authorized; sends JSON error and dies otherwise.
     */
    private function guard_ajax_request(): bool {
        if ( ! $this->has_valid_ajax_nonce() ) {
            wp_send_json_error( 'Session expired. Reload the page and try again.', 403 );
            return false; // @codeCoverageIgnore — wp_send_json_error() exits, kept for static analysis
        }
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized', 403 );
            return false; // @codeCoverageIgnore — wp_send_json_error() exits, kept for static analysis
        }
        return true;
    }

    /**
     * Send an operation result as a JSON response.
     *
     * @since 0.1.1-lite
     * @param array|\WP_Error $result Operation result or error.
     * @return void
     */
    private function send_result( $result ): void {
        if ( is_wp_error( $result ) ) {
            wp_send_json_error( $result->get_error_message() );
            return;
        }
        wp_send_json_success( is_array( $result ) ? $result : [] );
    }

    /**
     * Extract and sanitize only the expected fields from $_POST for each operation.
     *
     * This is the SINGLE sanitization boundary for all recipe AJAX input.
     * Operations layer receives pre-sanitized data and should NOT re-sanitize.
     *
     * @since 0.2.0-lite
     * @return array{id: string, old_id: string, label: string, css: string, category: string, description: string, preset: string, presetLabel: string}
     */
    private function extract_recipe_fields(): array {
        return [
            'id'          => sanitize_text_field( wp_unslash( $_POST['id'] ?? '' ) ),
            'old_id'      => sanitize_text_field( wp_unslash( $_POST['old_id'] ?? '' ) ),
            'label'       => sanitize_text_field( wp_unslash( $_POST['label'] ?? '' ) ),
            'category'    => sanitize_text_field( wp_unslash( $_POST['category'] ?? '' ) ),
            'description' => sanitize_text_field( wp_unslash( $_POST['description'] ?? '' ) ),
            // SECURITY: CSS content intentionally bypasses sanitize_text_field() which would strip
            // valid CSS syntax. wp_strip_all_tags() applied downstream in operations layer.
            // Safe: CSS only rendered in admin contexts behind manage_options capability.
            'css'         => wp_unslash( $_POST['css'] ?? '' ), // Sanitized further in operations
            'preset'      => sanitize_text_field( wp_unslash( $_POST['preset'] ?? '' ) ),
            'presetLabel' => sanitize_text_field( wp_unslash( $_POST['presetLabel'] ?? '' ) ),
        ];
    }

    /**
     * Handle AJAX save (create or update) recipe request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_save() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $this->send_result( $this->manager->operation_save( $this->extract_recipe_fields() ) );
    }

    /**
     * Handle AJAX delete recipe request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_delete() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $this->send_result( $this->manager->operation_delete( $this->extract_recipe_fields() ) );
    }

    /**
     * Handle AJAX duplicate recipe request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_duplicate() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $this->send_result( $this->manager->operation_duplicate( $this->extract_recipe_fields() ) );
    }

    /**
     * Handle AJAX move recipe to another category request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_move() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $this->send_result( $this->manager->operation_move( $this->extract_recipe_fields() ) );
    }

    /**
     * Handle AJAX bulk import recipes request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_bulk_import() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $fields = [
            'text'        => wp_unslash( $_POST['text'] ?? '' ),
            'mode'        => sanitize_text_field( wp_unslash( $_POST['mode'] ?? 'merge' ) ),
            'preset'      => sanitize_text_field( wp_unslash( $_POST['preset'] ?? '' ) ),
            'presetLabel' => sanitize_text_field( wp_unslash( $_POST['presetLabel'] ?? '' ) ),
            'category'    => sanitize_text_field( wp_unslash( $_POST['category'] ?? '' ) ),
        ];
        $this->send_result( $this->manager->operation_bulk_import( $fields ) );
    }
    /**
     * Handle AJAX delete all recipes request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_delete_all() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $this->send_result( $this->manager->operation_delete_all() );
    }

    /**
     * Handle AJAX set active preset request.
     *
     * @since 0.1.1-lite
     * @return void
     */
    public function ajax_set_active_preset() {
        if ( ! $this->guard_ajax_request() ) {
            return;
        }
        $fields = [
            'key' => sanitize_text_field( wp_unslash( $_POST['key'] ?? '' ) ),
        ];
        $this->send_result( $this->manager->operation_set_active_preset( $fields ) );
    }
}

if ( ! class_exists( 'RCAT_Admin_Controller', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Admin_Controller', 'RCAT_Admin_Controller' );
}
