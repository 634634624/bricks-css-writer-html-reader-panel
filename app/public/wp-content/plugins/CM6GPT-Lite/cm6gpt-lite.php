<?php
/**
 * Plugin Name: CM6GPT Lite
 * Plugin URI:  https://github.com/user/cm6gpt-lite
 * Description: Minimal-scope Bricks Builder CSS writer plus HTML reader derived from CM6GPT.
 * Version:     0.1.1-lite
 * Author:      Bricks Upgraded
 * Author URI:  https://bricksupgraded.com
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: cm6gpt-lite
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CM6GPT_LITE_VERSION', '0.1.1-lite' );
define( 'CM6GPT_LITE_MIN_WORDPRESS_VERSION', '6.0' );
define( 'CM6GPT_LITE_MIN_PHP_VERSION', '8.0' );
define( 'CM6GPT_LITE_LAST_VERIFIED_BRICKS_VERSION', '2.2.x' );
define( 'CM6GPT_LITE_LAST_VERIFIED_CORE_FRAMEWORK_VERSION', '1.10.x' );
define( 'CM6GPT_LITE_DIR', plugin_dir_path( __FILE__ ) );
define( 'CM6GPT_LITE_URL', plugin_dir_url( __FILE__ ) );

final class CM6GPT_Lite_Plugin {
	const ADMIN_MENU_SLUG       = 'cm6gpt-lite-admin';
	const RECIPE_MANAGER_SLUG   = 'cm6gpt-lite-recipe-catalog';
	const LEGACY_RECIPE_MANAGER_SLUG = 'recipe-catalog';
	const ADMIN_RECIPES_OPTION  = 'cm6gpt_lite_admin_recipes_v1';

	/**
	 * Embedded recipe manager instance.
	 *
	 * @var CM6GPT_Lite_Recipe_Manager|Recipe_Catalog|null
	 */
	private $recipe_manager = null;

	/**
	 * Singleton.
	 *
	 * @var CM6GPT_Lite_Plugin|null
	 */
	private static $instance = null;

	/** @var array<string,bool> */
	private array $diagnostic_event_cache = [];

	/**
	 * Get instance.
	 *
	 * @return CM6GPT_Lite_Plugin
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		register_activation_hook( __FILE__, [ $this, 'activate' ] );
		register_deactivation_hook( __FILE__, [ $this, 'deactivate' ] );
		add_action( 'init', [ $this, 'load_textdomain' ] );
		add_action( 'wp_enqueue_scripts', [ $this, 'maybe_enqueue_assets' ], 999 );
		add_action( 'admin_enqueue_scripts', [ $this, 'maybe_enqueue_assets' ], 999 );
		add_action( 'bricks/builder/enqueue_scripts', [ $this, 'enqueue_assets' ], 999 );
		add_action( 'admin_menu', [ $this, 'register_admin_page' ] );
		add_action( 'admin_notices', [ $this, 'render_admin_compatibility_notice' ] );
		$this->bootstrap_recipe_manager();
	}

	/**
	 * Return whether a Bricks version stays inside the last verified Lite support window.
	 *
	 * @since 0.1.1-lite
	 * @param string $version Bricks version string.
	 * @return bool
	 */
	private static function is_last_verified_bricks_version( string $version ): bool {
		return 1 === preg_match( '/^2\.2(?:\.|$)/', trim( $version ) );
	}

	/**
	 * Return whether a Core Framework version stays inside the last verified Lite support window.
	 *
	 * @since 0.1.1-lite
	 * @param string $version Core Framework version string.
	 * @return bool
	 */
	private static function is_last_verified_core_framework_version( string $version ): bool {
		return 1 === preg_match( '/^1\.10(?:\.|$)/', trim( $version ) );
	}

	/**
	 * Build a structured compatibility report from a normalized environment snapshot.
	 *
	 * @since 0.1.1-lite
	 * @param array<string,mixed> $snapshot Environment snapshot.
	 * @return array<string,mixed>
	 */
	private static function build_runtime_environment_report_from_snapshot( array $snapshot ): array {
		$wordpress_version = trim( (string) ( $snapshot['wordpressVersion'] ?? '' ) );
		$php_version       = trim( (string) ( $snapshot['phpVersion'] ?? '' ) );
		$bricks_version    = trim( (string) ( $snapshot['bricksVersion'] ?? '' ) );
		$bricks_detected   = ! empty( $snapshot['bricksDetected'] ) || '' !== $bricks_version;
		$core_framework_version = trim( (string) ( $snapshot['coreFrameworkVersion'] ?? '' ) );
		$core_framework_detected = ! empty( $snapshot['coreFrameworkDetected'] ) || '' !== $core_framework_version;
		$core_framework_functions_api = ! empty( $snapshot['coreFrameworkFunctionsApi'] );
		$core_framework_bricks_api    = ! empty( $snapshot['coreFrameworkBricksApi'] );
		$debug             = isset( $snapshot['debug'] ) && is_array( $snapshot['debug'] )
			? $snapshot['debug']
			: [];
		$issues            = [];

		if ( '' !== $wordpress_version && version_compare( $wordpress_version, CM6GPT_LITE_MIN_WORDPRESS_VERSION, '<' ) ) {
			$issues[] = [
				'code'     => 'wordpress-too-old',
				'severity' => 'error',
				'message'  => sprintf(
					'WordPress %s is below the Lite minimum of %s.',
					$wordpress_version,
					CM6GPT_LITE_MIN_WORDPRESS_VERSION
				),
				'actual'   => $wordpress_version,
				'expected' => CM6GPT_LITE_MIN_WORDPRESS_VERSION,
			];
		}

		if ( '' !== $php_version && version_compare( $php_version, CM6GPT_LITE_MIN_PHP_VERSION, '<' ) ) {
			$issues[] = [
				'code'     => 'php-too-old',
				'severity' => 'error',
				'message'  => sprintf(
					'PHP %s is below the Lite minimum of %s.',
					$php_version,
					CM6GPT_LITE_MIN_PHP_VERSION
				),
				'actual'   => $php_version,
				'expected' => CM6GPT_LITE_MIN_PHP_VERSION,
			];
		}

		if ( ! $bricks_detected ) {
			$issues[] = [
				'code'     => 'bricks-missing',
				'severity' => 'error',
				'message'  => 'Bricks Builder was not detected. Lite builder runtime support is unavailable without Bricks.',
				'actual'   => '',
				'expected' => 'Bricks Builder active',
			];
		} elseif ( '' !== $bricks_version && ! self::is_last_verified_bricks_version( $bricks_version ) ) {
			$issues[] = [
				'code'     => 'bricks-version-drift',
				'severity' => 'warning',
				'message'  => sprintf(
					'Bricks %s is outside the last verified Lite support window (%s).',
					$bricks_version,
					CM6GPT_LITE_LAST_VERIFIED_BRICKS_VERSION
				),
				'actual'   => $bricks_version,
				'expected' => CM6GPT_LITE_LAST_VERIFIED_BRICKS_VERSION,
			];
		}

		if ( $core_framework_detected && '' === $core_framework_version ) {
			$issues[] = [
				'code'     => 'core-framework-version-unknown',
				'severity' => 'warning',
				'message'  => 'Core Framework was detected but no version constant was available for Lite diagnostics.',
				'actual'   => '',
				'expected' => CM6GPT_LITE_LAST_VERIFIED_CORE_FRAMEWORK_VERSION,
			];
		} elseif ( '' !== $core_framework_version && ! self::is_last_verified_core_framework_version( $core_framework_version ) ) {
			$issues[] = [
				'code'     => 'core-framework-version-drift',
				'severity' => 'warning',
				'message'  => sprintf(
					'Core Framework %s is outside the last verified Lite support window (%s).',
					$core_framework_version,
					CM6GPT_LITE_LAST_VERIFIED_CORE_FRAMEWORK_VERSION
				),
				'actual'   => $core_framework_version,
				'expected' => CM6GPT_LITE_LAST_VERIFIED_CORE_FRAMEWORK_VERSION,
			];
		}

		if ( $core_framework_detected && ! $core_framework_bricks_api ) {
			$issues[] = [
				'code'     => 'core-framework-bricks-api-missing',
				'severity' => 'warning',
				'message'  => 'Core Framework is active but the CoreFrameworkBricks() helper was not detected for Lite diagnostics.',
				'actual'   => 'missing',
				'expected' => 'CoreFrameworkBricks() available',
			];
		}

		$status = 'ok';
		foreach ( $issues as $issue ) {
			$severity = (string) ( $issue['severity'] ?? '' );
			if ( 'error' === $severity ) {
				$status = 'error';
				break;
			}
			if ( 'warning' === $severity ) {
				$status = 'warning';
			}
		}

		$summary = 'Environment stays inside the current Lite support boundary.';
		if ( ! empty( $issues ) ) {
			$messages = array_filter(
				array_map(
					static function( array $issue ): string {
						return (string) ( $issue['message'] ?? '' );
					},
					$issues
				)
			);
			if ( ! empty( $messages ) ) {
				$summary = implode( ' | ', $messages );
			}
		}

		return [
			'status'       => $status,
			'summary'      => $summary,
			'issues'       => $issues,
			'versions'     => [
				'wordpress'     => $wordpress_version,
				'php'           => $php_version,
				'bricks'        => $bricks_version,
				'coreFramework' => $core_framework_version,
			],
			'requirements' => [
				'wordpressMin'            => CM6GPT_LITE_MIN_WORDPRESS_VERSION,
				'phpMin'                  => CM6GPT_LITE_MIN_PHP_VERSION,
				'bricksRequired'          => true,
				'lastVerifiedBricks'      => CM6GPT_LITE_LAST_VERIFIED_BRICKS_VERSION,
				'lastVerifiedCoreFramework' => CM6GPT_LITE_LAST_VERIFIED_CORE_FRAMEWORK_VERSION,
			],
			'companions'   => [
				'coreFramework' => [
					'detected'     => $core_framework_detected,
					'version'      => $core_framework_version,
					'functionsApi' => $core_framework_functions_api,
					'bricksApi'    => $core_framework_bricks_api,
				],
			],
			'debug'        => [
				'enabled'       => ! empty( $debug['enabled'] ),
				'wpDebug'       => ! empty( $debug['wpDebug'] ),
				'wpDebugLog'    => ! empty( $debug['wpDebugLog'] ),
				'liteDebug'     => ! empty( $debug['liteDebug'] ),
				'runtimeApi'    => (string) ( $debug['runtimeApi'] ?? '__CM6GPT' ),
				'serverLog'     => (string) ( $debug['serverLog'] ?? 'error_log' ),
			],
		];
	}

	/**
	 * Return whether Lite server-side diagnostics are enabled.
	 *
	 * @since 0.1.1-lite
	 * @return bool
	 */
	private function is_debug_enabled(): bool {
		return ( defined( 'CM6GPT_LITE_DEBUG' ) && CM6GPT_LITE_DEBUG )
			|| ( defined( 'WP_DEBUG' ) && WP_DEBUG );
	}

	/**
	 * Build the runtime debug settings snapshot.
	 *
	 * @since 0.1.1-lite
	 * @return array<string,mixed>
	 */
	private function get_debug_config(): array {
		return [
			'enabled'    => $this->is_debug_enabled(),
			'wpDebug'    => defined( 'WP_DEBUG' ) && WP_DEBUG,
			'wpDebugLog' => defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG,
			'liteDebug'  => defined( 'CM6GPT_LITE_DEBUG' ) && CM6GPT_LITE_DEBUG,
			'runtimeApi' => '__CM6GPT',
			'serverLog'  => 'error_log',
		];
	}

	/**
	 * Build the current runtime environment and compatibility report.
	 *
	 * @since 0.1.1-lite
	 * @return array<string,mixed>
	 */
	private function get_runtime_environment_report(): array {
		return self::build_runtime_environment_report_from_snapshot(
			[
				'wordpressVersion' => function_exists( 'get_bloginfo' ) ? (string) get_bloginfo( 'version' ) : '',
				'phpVersion'       => PHP_VERSION,
				'bricksVersion'    => defined( 'BRICKS_VERSION' ) ? (string) BRICKS_VERSION : '',
				'bricksDetected'   => defined( 'BRICKS_VERSION' ),
				'coreFrameworkVersion' => defined( 'CORE_FRAMEWORK_VERSION' ) ? (string) CORE_FRAMEWORK_VERSION : '',
				'coreFrameworkDetected' => defined( 'CORE_FRAMEWORK_VERSION' ) || function_exists( 'CoreFramework' ) || function_exists( 'CoreFrameworkBricks' ),
				'coreFrameworkFunctionsApi' => function_exists( 'CoreFramework' ),
				'coreFrameworkBricksApi' => function_exists( 'CoreFrameworkBricks' ),
				'debug'            => $this->get_debug_config(),
			]
		);
	}

	/**
	 * Emit a structured compatibility log once per request/source when diagnostics are enabled.
	 *
	 * @since 0.1.1-lite
	 * @param string                 $source Report source tag.
	 * @param array<string,mixed>|null $report Optional prebuilt report.
	 * @return void
	 */
	private function maybe_log_environment_report( string $source, ?array $report = null ): void {
		$report = is_array( $report ) ? $report : $this->get_runtime_environment_report();
		$status = (string) ( $report['status'] ?? 'ok' );

		if ( 'ok' === $status || ! $this->is_debug_enabled() ) {
			return;
		}

		$issue_codes = [];
		if ( ! empty( $report['issues'] ) && is_array( $report['issues'] ) ) {
			foreach ( $report['issues'] as $issue ) {
				if ( is_array( $issue ) && ! empty( $issue['code'] ) ) {
					$issue_codes[] = (string) $issue['code'];
				}
			}
		}

		$cache_key = $source . '|' . $status . '|' . implode( ',', $issue_codes );
		if ( isset( $this->diagnostic_event_cache[ $cache_key ] ) ) {
			return;
		}
		$this->diagnostic_event_cache[ $cache_key ] = true;

		$payload = [
			'source'       => $source,
			'status'       => $status,
			'summary'      => (string) ( $report['summary'] ?? '' ),
			'versions'     => isset( $report['versions'] ) && is_array( $report['versions'] ) ? $report['versions'] : [],
			'requirements' => isset( $report['requirements'] ) && is_array( $report['requirements'] ) ? $report['requirements'] : [],
			'companions'   => isset( $report['companions'] ) && is_array( $report['companions'] ) ? $report['companions'] : [],
			'issues'       => isset( $report['issues'] ) && is_array( $report['issues'] ) ? $report['issues'] : [],
		];

		$json = function_exists( 'wp_json_encode' ) ? wp_json_encode( $payload ) : json_encode( $payload );
		if ( ! is_string( $json ) || '' === $json ) {
			$json = 'compatibility report encoding failed';
		}

		error_log( '[CM6GPT Lite][' . strtoupper( $status ) . '] ' . $json );
	}

	/**
	 * Check whether the current admin request targets a Lite-owned admin screen.
	 *
	 * @since 0.1.1-lite
	 * @return bool
	 */
	private function is_lite_admin_request(): bool {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only screen detection
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		return in_array(
			$page,
			[
				self::ADMIN_MENU_SLUG,
				self::RECIPE_MANAGER_SLUG,
				self::LEGACY_RECIPE_MANAGER_SLUG,
			],
			true
		);
	}

	/**
	 * Render an admin compatibility notice on Lite-owned screens when drift/blockers exist.
	 *
	 * @since 0.1.1-lite
	 * @return void
	 */
	public function render_admin_compatibility_notice(): void {
		if ( ! $this->is_lite_admin_request() || ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$report = $this->get_runtime_environment_report();
		$status = (string) ( $report['status'] ?? 'ok' );
		if ( 'ok' === $status ) {
			return;
		}

		$this->maybe_log_environment_report( 'admin-notice', $report );

		$notice_class = 'error' === $status ? 'notice notice-error' : 'notice notice-warning';
		$summary      = (string) ( $report['summary'] ?? '' );
		$debug        = isset( $report['debug'] ) && is_array( $report['debug'] ) ? $report['debug'] : [];
		$debug_hint   = ! empty( $debug['enabled'] )
			? 'Diagnostics are enabled and will be written to error_log.'
			: 'Enable CM6GPT_LITE_DEBUG or WP_DEBUG to capture server-side diagnostics in error_log.';

		printf(
			'<div class="%1$s"><p><strong>%2$s</strong> %3$s %4$s</p></div>',
			esc_attr( $notice_class ),
			esc_html__( 'CM6GPT Lite compatibility:', 'cm6gpt-lite' ),
			esc_html( $summary ),
			esc_html( $debug_hint )
		);
	}

	/**
	 * Run on plugin activation.
	 *
	 * Sets default options if they do not exist yet.
	 *
	 * @since 0.1.1-lite
	 * @return void
	 */
	public function activate(): void {
		if ( false === get_option( 'cm6gpt_lite_admin_recipes_v1' ) ) {
			update_option( 'cm6gpt_lite_admin_recipes_v1', $this->load_bundled_recipe_seed(), false );
		}
		if ( false === get_option( 'cm6gpt_lite_recipe_manager_blocked_v1' ) ) {
			update_option( 'cm6gpt_lite_recipe_manager_blocked_v1', [], false );
		}
		if ( false === get_option( 'cm6gpt_lite_recipe_preset_profiles_v1' ) ) {
			update_option( 'cm6gpt_lite_recipe_preset_profiles_v1', [], false );
		}
	}

	/**
	 * Run on plugin deactivation.
	 *
	 * Lite no longer maintains filesystem-discovery caches on deactivation.
	 *
	 * @since 0.1.1-lite
	 * @return void
	 */
	public function deactivate(): void {
		// No-op: runtime state is stored in plugin-owned options and preserved until uninstall.
	}

	/**
	 * Get the bundled recipe seed file path.
	 *
	 * @since 0.1.1-lite
	 * @return string
	 */
	private function bundled_recipe_seed_path(): string {
		return CM6GPT_LITE_DIR . 'data/recipe-seed.json';
	}

	/**
	 * Load the bundled recipe seed for first-install activation seeding.
	 *
	 * The seed is only used when the recipes option does not exist yet.
	 * Existing sites keep their stored recipe collection untouched.
	 *
	 * @since 0.1.1-lite
	 * @return array
	 */
	private function load_bundled_recipe_seed(): array {
		$path = $this->bundled_recipe_seed_path();
		if ( ! is_readable( $path ) ) {
			return [];
		}

		$raw = file_get_contents( $path );
		if ( false === $raw || '' === trim( $raw ) ) {
			return [];
		}

		$decoded = json_decode( $raw, true );
		return is_array( $decoded ) ? $decoded : [];
	}

	/**
	 * Load plugin text domain for translations.
	 *
	 * @since 0.1.1-lite
	 * @return void
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain(
			'cm6gpt-lite',
			false,
			dirname( plugin_basename( __FILE__ ) ) . '/languages'
		);
	}

	/**
	 * Boot embedded Lite recipe manager.
	 *
	 * @return void
	 */
	private function bootstrap_recipe_manager() {
		if ( ! class_exists( 'CM6GPT_Lite_Recipe_Manager' ) && ! class_exists( 'Recipe_Catalog' ) ) {
			$base = CM6GPT_LITE_DIR . 'includes/recipe-manager/';
			require_once $base . 'class-rcat-callback-guards.php';
			require_once $base . 'class-rcat-repository.php';
			require_once $base . 'class-rcat-filter-adapter.php';
			require_once $base . 'class-rcat-css-parser.php';
			require_once $base . 'class-rcat-preset-manager.php';
			require_once $base . 'class-rcat-recipe-sanitizer.php';
			require_once $base . 'class-rcat-recipe-operations.php';
			require_once $base . 'class-rcat-admin-page.php';
			require_once $base . 'class-rcat-admin-assets.php';
			require_once $base . 'class-rcat-admin-controller.php';
			require_once $base . 'class-recipe-catalog.php';
		}

		$manager_class = class_exists( 'CM6GPT_Lite_Recipe_Manager' ) ? 'CM6GPT_Lite_Recipe_Manager' : 'Recipe_Catalog';
		$this->recipe_manager = new $manager_class( $this->recipe_manager_config() );
	}

	/**
	 * Shared embedded recipe manager config.
	 *
	 * @return array<string, string>
	 */
	private function recipe_manager_config() {
		return [
			'page_title'       => esc_html__( 'CM6GPT Lite Recipe Catalog', 'cm6gpt-lite' ),
			'menu_title'       => esc_html__( 'Recipe Catalog', 'cm6gpt-lite' ),
			'menu_slug'        => self::RECIPE_MANAGER_SLUG,
			'legacy_menu_slug' => self::LEGACY_RECIPE_MANAGER_SLUG,
			'parent_slug'      => self::ADMIN_MENU_SLUG,
			'capability'       => 'manage_options',
		];
	}

	/**
	 * Detect Bricks Builder page.
	 *
	 * @return bool
	 */
	private function is_bricks_builder() {
		// Auth note: this method is only called from maybe_enqueue_assets(),
		// which delegates to enqueue_assets() where current_user_can('edit_posts') is checked.
		if ( isset( $_GET['bricks'] ) && 'run' === $_GET['bricks'] ) {
			return true;
		}

		if ( defined( 'BRICKS_IS_BUILDER' ) && BRICKS_IS_BUILDER ) {
			return true;
		}

		if ( function_exists( 'bricks_is_builder' ) && bricks_is_builder() ) {
			return true;
		}

		return false;
	}

	/**
	 * Enqueue on generic hooks only when builder is active.
	 *
	 * @return void
	 */
	public function maybe_enqueue_assets() {
		if ( ! $this->is_bricks_builder() ) {
			return;
		}

		$this->enqueue_assets();
	}

	/**
	 * Enqueue CM6GPT Lite assets.
	 *
	 * @return void
	 */
	public function enqueue_assets() {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return;
		}

		$environment_report = $this->get_runtime_environment_report();
		$this->maybe_log_environment_report( 'builder-bootstrap', $environment_report );

		$bundle_path = CM6GPT_LITE_DIR . 'assets/js/vendor/codemirror-bundle.js';
		$bundle_ver  = file_exists( $bundle_path ) ? (string) filemtime( $bundle_path ) : CM6GPT_LITE_VERSION;

		wp_enqueue_style(
			'cm6gpt-lite-panel',
			CM6GPT_LITE_URL . 'assets/css/cm6gpt-panel.css',
			[],
			CM6GPT_LITE_VERSION
		);

		wp_enqueue_script(
			'cm6gpt-lite-cm6-bundle',
			CM6GPT_LITE_URL . 'assets/js/vendor/codemirror-bundle.js',
			[],
			$bundle_ver,
			true
		);

		$files = [
			'cm6gpt-lite-panel'         => 'assets/js/cm6gpt-panel.js',
			'cm6gpt-lite-editors'       => 'assets/js/cm6gpt-editors.js',
			'cm6gpt-lite-recipes'       => 'assets/js/cm6gpt-recipes.js',
			'cm6gpt-lite-css-map'       => 'assets/js/cm6gpt-css-map.generated.js',
			'cm6gpt-lite-bricks-api'    => 'assets/js/cm6gpt-bricks-api.js',
			'cm6gpt-lite-bridge-shared' => 'assets/js/cm6gpt-bridge-shared.js',
			'cm6gpt-lite-html-bridge'   => 'assets/js/cm6gpt-bridge-html.js',
			'cm6gpt-lite-css-bridge'    => 'assets/js/cm6gpt-bridge-css.js',
			'cm6gpt-lite-main'          => 'assets/js/cm6gpt-main.js',
		];

		wp_enqueue_script( 'cm6gpt-lite-panel', CM6GPT_LITE_URL . $files['cm6gpt-lite-panel'], [ 'cm6gpt-lite-bridge-shared' ], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-editors', CM6GPT_LITE_URL . $files['cm6gpt-lite-editors'], [ 'cm6gpt-lite-cm6-bundle', 'cm6gpt-lite-bridge-shared' ], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-recipes', CM6GPT_LITE_URL . $files['cm6gpt-lite-recipes'], [], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-css-map', CM6GPT_LITE_URL . $files['cm6gpt-lite-css-map'], [], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-bricks-api', CM6GPT_LITE_URL . $files['cm6gpt-lite-bricks-api'], [ 'cm6gpt-lite-css-map', 'cm6gpt-lite-bridge-shared' ], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-bridge-shared', CM6GPT_LITE_URL . $files['cm6gpt-lite-bridge-shared'], [], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-html-bridge', CM6GPT_LITE_URL . $files['cm6gpt-lite-html-bridge'], [ 'cm6gpt-lite-bricks-api', 'cm6gpt-lite-editors', 'cm6gpt-lite-bridge-shared' ], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script( 'cm6gpt-lite-css-bridge', CM6GPT_LITE_URL . $files['cm6gpt-lite-css-bridge'], [ 'cm6gpt-lite-bricks-api', 'cm6gpt-lite-editors', 'cm6gpt-lite-bridge-shared' ], CM6GPT_LITE_VERSION, true );
		wp_enqueue_script(
			'cm6gpt-lite-main',
			CM6GPT_LITE_URL . $files['cm6gpt-lite-main'],
			[ 'cm6gpt-lite-panel', 'cm6gpt-lite-editors', 'cm6gpt-lite-recipes', 'cm6gpt-lite-bricks-api', 'cm6gpt-lite-bridge-shared', 'cm6gpt-lite-html-bridge', 'cm6gpt-lite-css-bridge' ],
			CM6GPT_LITE_VERSION,
			true
		);

		$config = [
			'version'                => CM6GPT_LITE_VERSION,
			'postId'                 => (int) get_the_ID(),
			'nonce'                  => wp_create_nonce( 'cm6gpt_lite_nonce' ),
			'builderDetectedByPhp'   => true,
			'phase'                  => 'phaseL0-lite-shell-scaffold',
			'readOnlyHtml'           => true,
			'readOnlyCss'            => false,
			'htmlLiveSync'           => false,
			'htmlLiveSyncGuarded'    => false,
			'htmlLiveSyncDebounceMs' => 180,
			'cssLiveSync'            => true,
			'cssLiveSyncDebounceMs'  => 80,
			'editorFirstMode'        => 'editor-first',
			'editorFirstKillSwitch'  => false,
			'editorFirstStorageKey'  => 'cm6gpt-lite-editor-first-opt-in-v1',
			'pollMs'                 => 250,
			'domDebounceMs'          => 120,
			'cssSnapshotMaxStyleKb'  => 128,
			'editorTheme'            => 'github-dark',
			'adminRecipes'           => $this->get_admin_recipes(),
			'recipePresetPolicy'     => $this->get_recipe_preset_policy(),
			'environmentReport'      => $environment_report,
		];

		$bricks_vars = $this->get_bricks_variables();

		$config['bricksVariables']     = array_column( $bricks_vars, 'name' );
		$config['bricksVariablesFull'] = $bricks_vars;

		wp_add_inline_script(
			'cm6gpt-lite-main',
			'var CM6GPT_Lite_Config = ' . wp_json_encode( $config ) . ';',
			'before'
		);
	}

	/**
	 * Register CM6GPT Lite admin page.
	 *
	 * @return void
	 */
	public function register_admin_page() {
		add_menu_page(
			esc_html__( 'CM6GPT Lite', 'cm6gpt-lite' ),
			esc_html__( 'CM6GPT Lite', 'cm6gpt-lite' ),
			'manage_options',
			self::ADMIN_MENU_SLUG,
			[ $this, 'render_admin_page' ],
			'dashicons-editor-code',
			81
		);
	}

	/**
	 * Render admin page.
	 *
	 * @return void
	 */
	public function render_admin_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'cm6gpt-lite' ) );
		}

		$tab                = $this->get_admin_tab();
		$recipes            = $this->get_admin_recipes();
		$bricks_vars        = $this->get_bricks_variables();
		$environment_report = $this->get_runtime_environment_report();
		$this->maybe_log_environment_report( 'admin-dashboard', $environment_report );
		wp_enqueue_style(
			'cm6gpt-lite-admin',
			plugin_dir_url( __FILE__ ) . 'assets/css/cm6gpt-admin.css',
			[],
			filemtime( plugin_dir_path( __FILE__ ) . 'assets/css/cm6gpt-admin.css' )
		);
		?>

		<div id="cm6lt-dash">
		<div class="cm6lt-inner">

			<!-- Hero -->
			<div class="cm6lt-hero">
				<div class="cm6lt-hero-left">
					<div class="cm6lt-logo-row">
						<div class="cm6lt-logo-icon">
							<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
						</div>
						<h1><?php esc_html_e( 'CM6GPT Lite', 'cm6gpt-lite' ); ?></h1>
					</div>
					<p class="cm6lt-hero-desc">
						<?php esc_html_e( 'Minimal Bricks Builder CSS editor panel with recipe catalog, autocomplete, and real-time CSS sync. Cyberpunk terminal interface.', 'cm6gpt-lite' ); ?>
					</p>
				</div>
				<div class="cm6lt-hero-right">
					<span class="cm6lt-badge cm6lt-badge--active"><?php esc_html_e( 'Active', 'cm6gpt-lite' ); ?></span>
					<span class="cm6lt-badge cm6lt-badge--version">v<?php echo esc_html( CM6GPT_LITE_VERSION ); ?></span>
				</div>
			</div>

			<!-- Tabs -->
			<nav class="cm6lt-tabs">
				<a href="<?php echo esc_url( $this->admin_page_url( 'manager' ) ); ?>" class="cm6lt-tab <?php echo 'manager' === $tab ? 'is-active' : ''; ?>"><?php esc_html_e( 'Dashboard', 'cm6gpt-lite' ); ?></a>
				<a href="<?php echo esc_url( $this->admin_page_url( 'docs' ) ); ?>" class="cm6lt-tab <?php echo 'docs' === $tab ? 'is-active' : ''; ?>"><?php esc_html_e( 'Documentation', 'cm6gpt-lite' ); ?></a>
			</nav>

			<?php if ( 'docs' === $tab ) : ?>
				<?php $this->render_admin_docs_tab(); ?>
			<?php else : ?>
				<?php $this->render_admin_recipe_manager_tab( $recipes, $bricks_vars, $environment_report ); ?>
			<?php endif; ?>

			<!-- Footer -->
			<div class="cm6lt-footer">
				<p>
					<?php
					printf(
						'%s &middot; %s',
						esc_html( sprintf( __( 'CM6GPT Lite v%s', 'cm6gpt-lite' ), CM6GPT_LITE_VERSION ) ),
						esc_html__( 'Cyberpunk CSS Editor for Bricks Builder', 'cm6gpt-lite' )
					);
					?>
				</p>
			</div>

		</div>
		</div>
		<?php
	}

	/**
	 * Render recipe manager overview tab.
	 *
	 * @param array $recipes Stored admin recipes.
	 * @param array $bricks_vars Bricks variable records.
	 * @return void
	 */
	private function render_admin_recipe_manager_tab( $recipes, $bricks_vars, array $environment_report = [] ) {
		$manager_url              = $this->recipe_manager_admin_url();
		$var_count                = count( $bricks_vars );
		$bricks_ver               = defined( 'BRICKS_VERSION' ) ? BRICKS_VERSION : 'N/A';
		$preset_policy = $this->get_recipe_preset_policy();
		$active_preset_label = isset( $preset_policy['activePresetLabel'] )
			? (string) $preset_policy['activePresetLabel']
			: esc_html__( 'All Recipes', 'cm6gpt-lite' );
		$compatibility_status_map = [
			'ok'      => esc_html__( 'Ready', 'cm6gpt-lite' ),
			'warning' => esc_html__( 'Investigate', 'cm6gpt-lite' ),
			'error'   => esc_html__( 'Blocking', 'cm6gpt-lite' ),
		];
		$compatibility_status     = $compatibility_status_map[ (string) ( $environment_report['status'] ?? 'ok' ) ] ?? esc_html__( 'Unknown', 'cm6gpt-lite' );
		$compatibility_summary    = trim( (string) ( $environment_report['summary'] ?? '' ) );
		if ( '' === $compatibility_summary ) {
			$compatibility_summary = esc_html__( 'No compatibility issues detected.', 'cm6gpt-lite' );
		}
		$debug_config = isset( $environment_report['debug'] ) && is_array( $environment_report['debug'] )
			? $environment_report['debug']
			: [];
		$compatibility_versions = isset( $environment_report['versions'] ) && is_array( $environment_report['versions'] )
			? $environment_report['versions']
			: [];
		$companion_plugins = isset( $environment_report['companions'] ) && is_array( $environment_report['companions'] )
			? $environment_report['companions']
			: [];
		$core_framework = isset( $companion_plugins['coreFramework'] ) && is_array( $companion_plugins['coreFramework'] )
			? $companion_plugins['coreFramework']
			: [];
		$debug_label  = ! empty( $debug_config['enabled'] )
			? esc_html__( 'Enabled', 'cm6gpt-lite' )
			: esc_html__( 'Disabled', 'cm6gpt-lite' );
		$server_log_label = ! empty( $debug_config['wpDebugLog'] )
			? esc_html__( 'WP_DEBUG_LOG + error_log', 'cm6gpt-lite' )
			: esc_html__( 'error_log', 'cm6gpt-lite' );
		$core_framework_label = ! empty( $core_framework['detected'] )
			? ( trim( (string) ( $compatibility_versions['coreFramework'] ?? '' ) ) !== ''
				? trim( (string) ( $compatibility_versions['coreFramework'] ?? '' ) )
				: esc_html__( 'Detected (version unknown)', 'cm6gpt-lite' ) )
			: esc_html__( 'Not detected', 'cm6gpt-lite' );
		$core_framework_bricks_api_label = ! empty( $core_framework['detected'] )
			? ( ! empty( $core_framework['bricksApi'] )
				? esc_html__( 'Present', 'cm6gpt-lite' )
				: esc_html__( 'Missing', 'cm6gpt-lite' ) )
			: esc_html__( 'Not detected', 'cm6gpt-lite' );

		// Use active preset recipe count, not total catalog count.
		$recipe_count = count( $recipes );
		if ( ! empty( $preset_policy['presets'] ) && is_array( $preset_policy['presets'] ) ) {
			foreach ( $preset_policy['presets'] as $p ) {
				if ( ! empty( $p['active'] ) && isset( $p['count'] ) ) {
					$recipe_count = (int) $p['count'];
					break;
				}
			}
		}

		// Get a builder URL for quick link.
		$pages      = get_pages( [ 'number' => 1 ] );
		$editor_url = ! empty( $pages ) ? get_permalink( $pages[0]->ID ) . '?bricks=run' : admin_url();
		?>
		<!-- Stats -->
		<div class="cm6lt-sh"><h2><?php esc_html_e( 'Overview', 'cm6gpt-lite' ); ?></h2><div class="cm6lt-sh-line"></div></div>
		<div class="cm6lt-stat-grid">
			<div class="cm6lt-stat-item">
				<div class="cm6lt-stat-num"><?php echo esc_html( (string) $recipe_count ); ?></div>
				<div class="cm6lt-stat-label"><?php esc_html_e( 'Recipes', 'cm6gpt-lite' ); ?></div>
			</div>
			<div class="cm6lt-stat-item">
				<div class="cm6lt-stat-num"><?php echo esc_html( (string) $var_count ); ?></div>
				<div class="cm6lt-stat-label"><?php esc_html_e( 'Variables', 'cm6gpt-lite' ); ?></div>
			</div>
			<div class="cm6lt-stat-item">
				<div class="cm6lt-stat-num" style="color:var(--cyan);"><?php echo esc_html( $bricks_ver ); ?></div>
				<div class="cm6lt-stat-label"><?php esc_html_e( 'Bricks', 'cm6gpt-lite' ); ?></div>
			</div>
		</div>

		<!-- Features -->
		<div class="cm6lt-sh"><h2><?php esc_html_e( 'Features', 'cm6gpt-lite' ); ?></h2><div class="cm6lt-sh-line"></div></div>
		<div class="cm6lt-grid-3">
			<div class="cm6lt-card">
				<div class="cm6lt-card-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
				</div>
				<h3><?php esc_html_e( 'CSS Editor', 'cm6gpt-lite' ); ?></h3>
				<p><?php esc_html_e( 'CodeMirror 6 editor with real-time CSS sync to Bricks element custom CSS.', 'cm6gpt-lite' ); ?></p>
			</div>
			<div class="cm6lt-card">
				<div class="cm6lt-card-icon" style="background:var(--pink-a);color:var(--pink);">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
				</div>
				<h3><?php esc_html_e( 'Recipe Catalog', 'cm6gpt-lite' ); ?></h3>
				<p><?php echo esc_html( sprintf( __( '%s CSS recipes with admin-locked preset profiles, search, and autocomplete integration.', 'cm6gpt-lite' ), (string) $recipe_count ) ); ?></p>
			</div>
			<div class="cm6lt-card">
				<div class="cm6lt-card-icon" style="background:var(--green-a);color:var(--green);">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
				</div>
				<h3><?php esc_html_e( 'Live Sync', 'cm6gpt-lite' ); ?></h3>
				<p><?php esc_html_e( 'Write-target sync to Bricks custom CSS fields with auto-apply and manual refresh.', 'cm6gpt-lite' ); ?></p>
			</div>
		</div>

		<!-- System Info -->
		<div class="cm6lt-sh"><h2><?php esc_html_e( 'System', 'cm6gpt-lite' ); ?></h2><div class="cm6lt-sh-line"></div></div>
		<div class="cm6lt-grid">
			<div class="cm6lt-info-box">
				<h3><?php esc_html_e( 'Environment', 'cm6gpt-lite' ); ?></h3>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'WordPress', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( get_bloginfo( 'version' ) ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'PHP', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( PHP_VERSION ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Bricks Builder', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $bricks_ver ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Core Framework', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $core_framework_label ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Memory Limit', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( ini_get( 'memory_limit' ) ); ?></span></div>
			</div>
			<div class="cm6lt-info-box">
				<h3><?php esc_html_e( 'Plugin', 'cm6gpt-lite' ); ?></h3>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Version', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( CM6GPT_LITE_VERSION ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Recipe Store', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( self::ADMIN_RECIPES_OPTION ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Active Preset', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $active_preset_label ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Variables Store', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value">bricks_global_variables</span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Recipe Count', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( (string) $recipe_count ); ?></span></div>
			</div>
			<div class="cm6lt-info-box">
				<h3><?php esc_html_e( 'Compatibility', 'cm6gpt-lite' ); ?></h3>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Status', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $compatibility_status ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'WP / PHP Minimum', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( CM6GPT_LITE_MIN_WORDPRESS_VERSION . ' / ' . CM6GPT_LITE_MIN_PHP_VERSION ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Last Verified Bricks', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( CM6GPT_LITE_LAST_VERIFIED_BRICKS_VERSION ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Last Verified Core Framework', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( CM6GPT_LITE_LAST_VERIFIED_CORE_FRAMEWORK_VERSION ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'CF Bricks API', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $core_framework_bricks_api_label ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Debug Logging', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $debug_label ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Server Log', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value"><?php echo esc_html( $server_log_label ); ?></span></div>
				<div class="cm6lt-info-row"><span class="cm6lt-info-label"><?php esc_html_e( 'Runtime API', 'cm6gpt-lite' ); ?></span><span class="cm6lt-info-value">__CM6GPT</span></div>
				<p><?php echo esc_html( $compatibility_summary ); ?></p>
			</div>
		</div>

		<!-- Quick Links -->
		<div class="cm6lt-sh"><h2><?php esc_html_e( 'Quick Links', 'cm6gpt-lite' ); ?></h2><div class="cm6lt-sh-line"></div></div>
		<div class="cm6lt-links">
			<a href="<?php echo esc_url( $manager_url ); ?>" class="cm6lt-link">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
				<?php esc_html_e( 'Recipe Catalog', 'cm6gpt-lite' ); ?>
			</a>
			<a href="<?php echo esc_url( $editor_url ); ?>" class="cm6lt-link" target="_blank">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
				<?php esc_html_e( 'Open Bricks Editor', 'cm6gpt-lite' ); ?>
			</a>
		</div>
		<?php
	}

	/**
	 * Render documentation tab.
	 *
	 * @return void
	 */
	private function render_admin_docs_tab() {
		$sections = [
			[
				'title' => __( 'What This Plugin Does', 'cm6gpt-lite' ),
				'lines' => [
					__( 'CM6GPT Lite adds a minimal Bricks Builder panel with a CSS writer and a read-only HTML reader.', 'cm6gpt-lite' ),
					__( 'The CSS lane is the only write lane; the HTML lane is for inspection and copy-only workflows.', 'cm6gpt-lite' ),
					__( 'It keeps scope small on purpose so the Lite runtime stays easier to reason about and maintain.', 'cm6gpt-lite' ),
				],
			],
			[
				'title' => __( 'Recipe Catalog', 'cm6gpt-lite' ),
				'lines' => [
					__( 'Built-in defaults and admin recipes are loaded as CSS-side Lite catalog entries.', 'cm6gpt-lite' ),
					__( 'Active preset profiles are admin-locked and sync into the editor recipe catalog plus autocomplete.', 'cm6gpt-lite' ),
					__( 'The editor can browse the active preset, but preset switching is managed only from the admin Recipe Catalog screen.', 'cm6gpt-lite' ),
				],
			],
			[
				'title' => __( 'Launch Scope', 'cm6gpt-lite' ),
				'lines' => [
					__( 'Supported writer scope: CSS in Lite-safe flows only; HTML apply and rename stay out of scope.', 'cm6gpt-lite' ),
					__( 'Bricks variables are mirrored from `bricks_global_variables` into CSS autocomplete.', 'cm6gpt-lite' ),
					__( 'The overview dashboard is read-only, while the dedicated Recipe Catalog admin screen owns runtime preset selection.', 'cm6gpt-lite' ),
				],
			],
		];
		?>
		<div class="cm6lt-sh"><h2><?php esc_html_e( 'Documentation', 'cm6gpt-lite' ); ?></h2><div class="cm6lt-sh-line"></div></div>
		<div class="cm6lt-docs">
			<?php foreach ( $sections as $idx => $section ) : ?>
				<details class="cm6lt-docs-item" <?php echo 0 === $idx ? 'open' : ''; ?>>
					<summary>
						<span class="cm6lt-docs-left">
							<span class="cm6lt-docs-num"><?php echo esc_html( (string) ( $idx + 1 ) ); ?></span>
							<span class="cm6lt-docs-title"><?php echo esc_html( $section['title'] ); ?></span>
						</span>
						<span class="cm6lt-docs-toggle"></span>
					</summary>
					<div class="cm6lt-docs-body">
						<ul>
							<?php foreach ( $section['lines'] as $line ) : ?>
								<li><?php echo esc_html( $line ); ?></li>
							<?php endforeach; ?>
						</ul>
					</div>
				</details>
			<?php endforeach; ?>
		</div>
		<?php
	}

	/**
	 * Read active admin tab.
	 *
	 * @return string
	 */
	private function get_admin_tab() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only tab switch with strict allowlist
		$tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'manager';
		return in_array( $tab, [ 'manager', 'docs' ], true ) ? $tab : 'manager';
	}

	/**
	 * Build admin page URL.
	 *
	 * @param string $tab Tab key.
	 * @return string
	 */
	private function admin_page_url( $tab ) {
		return add_query_arg(
			[
				'page' => self::ADMIN_MENU_SLUG,
				'tab'  => in_array( $tab, [ 'manager', 'docs' ], true ) ? $tab : 'manager',
			],
			admin_url( 'admin.php' )
		);
	}

	/**
	 * Build Lite recipe manager URL.
	 *
	 * @return string
	 */
	private function recipe_manager_admin_url() {
		return add_query_arg(
			[
				'page' => self::RECIPE_MANAGER_SLUG,
			],
			admin_url( 'admin.php' )
		);
	}

	/**
	 * Get runtime recipe preset policy from the embedded manager.
	 *
	 * @return array
	 */
	private function get_recipe_preset_policy() {
		if ( $this->recipe_manager && method_exists( $this->recipe_manager, 'get_runtime_preset_policy' ) ) {
			$policy = $this->recipe_manager->get_runtime_preset_policy();
			if ( is_array( $policy ) ) {
				return $policy;
			}
		}

		return [
			'mode'             => 'admin-locked',
			'locked'           => true,
			'activePresetKey'  => 'all',
			'activePresetLabel'=> 'All Recipes',
			'allowedRecipeIds' => [],
			'presets'          => [],
		];
	}

	/**
	 * Get normalized admin recipes from option.
	 *
	 * @return array
	 */
	private function get_admin_recipes() {
		$raw = null;
		if ( $this->recipe_manager && method_exists( $this->recipe_manager, 'get_runtime_recipes' ) ) {
			$raw = $this->recipe_manager->get_runtime_recipes();
		}
		if ( ! is_array( $raw ) ) {
			$raw = get_option( self::ADMIN_RECIPES_OPTION, [] );
		}
		if ( ! is_array( $raw ) ) {
			return [];
		}

		$out = [];
		foreach ( $raw as $item ) {
			$normalized = $this->normalize_recipe_record( $item );
			if ( $normalized ) {
				$out[] = $normalized;
			}
		}

		return $out;
	}

	/**
	 * Normalize recipe record.
	 *
	 * @param mixed $input Raw recipe.
	 * @return array|null
	 */
	private function normalize_recipe_record( $input ) {
		if ( ! is_array( $input ) ) {
			return null;
		}

		$id = '';
		if ( isset( $input['id'] ) ) {
			$id = $this->normalize_recipe_alias( $input['id'] );
		}
		if ( '' === $id && isset( $input['label'] ) ) {
			$id = $this->normalize_recipe_alias( $input['label'] );
		}
		if ( '' === $id && isset( $input['__cm6gpt_map_key'] ) ) {
			$id = $this->normalize_recipe_alias( $input['__cm6gpt_map_key'] );
		}

		$aliases_raw = [];
		if ( isset( $input['aliases'] ) && is_array( $input['aliases'] ) ) {
			$aliases_raw = $input['aliases'];
		}
		if ( isset( $input['alias'] ) ) {
			$aliases_raw[] = $input['alias'];
		}
		if ( '' !== $id ) {
			$aliases_raw[] = $id;
		}

		$aliases = [];
		foreach ( $aliases_raw as $alias_raw ) {
			$alias = $this->normalize_recipe_alias( $alias_raw );
			if ( '' === $alias ) {
				continue;
			}
			if ( ! in_array( $alias, $aliases, true ) ) {
				$aliases[] = $alias;
			}
		}

		if ( '' === $id && ! empty( $aliases ) ) {
			$id = $aliases[0];
		}
		if ( '' === $id ) {
			return null;
		}
		if ( ! in_array( $id, $aliases, true ) ) {
			array_unshift( $aliases, $id );
		}

		$legacy_css  = trim( (string) ( isset( $input['css'] ) ? $input['css'] : '' ) );
		$legacy_html = trim( (string) ( isset( $input['html'] ) ? $input['html'] : '' ) );

		$type = $this->normalize_recipe_type( isset( $input['type'] ) ? $input['type'] : '' );
		if ( '' === $type ) {
			if ( '' !== $legacy_css && '' !== $legacy_html ) {
				$type = 'compound';
			} elseif ( '' !== $legacy_html ) {
				$type = 'html-snippet';
			} else {
				$type = 'css-snippet';
			}
		}

		$body = null;
		if ( 'compound' === $type ) {
			$compound = isset( $input['body'] ) && is_array( $input['body'] )
				? $input['body']
				: [
					'css'  => '' !== $legacy_css ? $legacy_css : ( isset( $input['cssBody'] ) ? $input['cssBody'] : '' ),
					'html' => '' !== $legacy_html ? $legacy_html : ( isset( $input['htmlBody'] ) ? $input['htmlBody'] : '' ),
				];
			$css  = trim( (string) ( isset( $compound['css'] ) ? $compound['css'] : '' ) );
			$html = trim( (string) ( isset( $compound['html'] ) ? $compound['html'] : '' ) );
			if ( '' === $css && '' === $html ) {
				return null;
			}
			$body = [
				'css'  => $css,
				'html' => $html,
			];
		} else {
			$text = trim( (string) ( isset( $input['body'] ) ? $input['body'] : '' ) );
			if ( '' === $text ) {
				if ( 'html-snippet' === $type && '' !== $legacy_html ) {
					$text = $legacy_html;
				} elseif ( 'css-snippet' === $type && '' !== $legacy_css ) {
					$text = $legacy_css;
				}
			}
			if ( '' === $text ) {
				return null;
			}
			$body = $text;
		}

		$category = strtolower( trim( (string) ( isset( $input['category'] ) ? $input['category'] : '' ) ) );
		$category = preg_replace( '/[^a-z0-9._:-]/', '-', $category );
		$category = trim( preg_replace( '/-+/', '-', $category ), '-' );
		if ( '' === $category ) {
			$category = 'misc';
		}

		$description = trim( wp_strip_all_tags( (string) ( isset( $input['description'] ) ? $input['description'] : '' ) ) );

		$tags = [];
		if ( isset( $input['tags'] ) && is_array( $input['tags'] ) ) {
			foreach ( $input['tags'] as $tag_raw ) {
				$tag = strtolower( trim( (string) $tag_raw ) );
				$tag = preg_replace( '/[^a-z0-9._:-]/', '-', $tag );
				$tag = trim( preg_replace( '/-+/', '-', $tag ), '-' );
				if ( '' === $tag ) {
					continue;
				}
				if ( ! in_array( $tag, $tags, true ) ) {
					$tags[] = $tag;
				}
			}
		}

		$blocked_contexts = [];
		if ( isset( $input['blockedContexts'] ) && is_array( $input['blockedContexts'] ) ) {
			foreach ( $input['blockedContexts'] as $ctx_raw ) {
				$ctx = $this->normalize_context_name( $ctx_raw );
				if ( '' === $ctx ) {
					continue;
				}
				if ( ! in_array( $ctx, $blocked_contexts, true ) ) {
					$blocked_contexts[] = $ctx;
				}
			}
		}

		$preset = '';
		if ( isset( $input['preset'] ) ) {
			$preset = $this->normalize_recipe_preset( $input['preset'] );
		}
		if ( '' === $preset ) {
			$preset = 'shared';
		}
		$preset_label = '';
		if ( isset( $input['presetLabel'] ) ) {
			$preset_label = trim( (string) $input['presetLabel'] );
		}
		if ( '' === $preset_label ) {
			$preset_label = $this->default_recipe_preset_label( $preset );
		}

		return [
			'id'                => $id,
			'type'              => $type,
			'aliases'           => $aliases,
			'category'          => $category,
			'description'       => $description,
			'body'              => $body,
			'tags'              => $tags,
			'blockedContexts'   => $blocked_contexts,
			'requiresSelection' => ! empty( $input['requiresSelection'] ),
			'safeSubsetOnly'    => ! empty( $input['safeSubsetOnly'] ),
			'preset'            => $preset,
			'presetLabel'       => $preset_label,
		];
	}

	/**
	 * Normalize recipe alias.
	 *
	 * @param mixed $value Alias.
	 * @return string
	 */
	private function normalize_recipe_alias( $value ) {
		$alias = strtolower( trim( (string) $value ) );
		if ( '' === $alias ) {
			return '';
		}
		if ( '@' === substr( $alias, 0, 1 ) ) {
			$alias = substr( $alias, 1 );
		}
		$alias = preg_replace( '/\s+/', '-', $alias );
		$alias = preg_replace( '/[^a-z0-9._:-]/', '-', $alias );
		$alias = preg_replace( '/-+/', '-', $alias );
		return trim( $alias, '-' );
	}

	/**
	 * Normalize recipe type.
	 *
	 * @param mixed $value Type.
	 * @return string
	 */
	private function normalize_recipe_type( $value ) {
		$type = strtolower( trim( (string) $value ) );
		if ( in_array( $type, [ 'css', 'css-snippet', 'csssnippet', 'snippet' ], true ) ) {
			return 'css-snippet';
		}
		if ( in_array( $type, [ 'html', 'html-snippet', 'htmlsnippet' ], true ) ) {
			return 'html-snippet';
		}
		if ( 'compound' === $type ) {
			return 'compound';
		}
		return '';
	}

	/**
	 * Normalize recipe preset key.
	 *
	 * Delegates to the Recipe Catalog preset manager (single source of truth — A-7).
	 *
	 * @since 0.2.0-lite
	 *
	 * @param mixed $value Raw preset key.
	 * @return string
	 */
	private function normalize_recipe_preset( $value ) {
		if ( $this->recipe_manager ) {
			return $this->recipe_manager->preset_manager()->normalize_recipe_preset( (string) $value, '' );
		}
		// Minimal inline fallback if recipe_manager is not yet initialized.
		$preset = strtolower( trim( (string) $value ) );
		$preset = preg_replace( '/[\s-]+/', '_', $preset );
		$preset = is_string( $preset ) ? $preset : '';
		$preset = preg_replace( '/[^a-z0-9_]/', '_', $preset );
		$preset = is_string( $preset ) ? $preset : '';
		$preset = preg_replace( '/_+/', '_', $preset );
		$preset = is_string( $preset ) ? trim( $preset, '_' ) : '';
		return is_string( $preset ) && '' !== $preset ? $preset : '';
	}

	/**
	 * Build readable preset label.
	 *
	 * Delegates to the Recipe Catalog preset manager (single source of truth — A-7).
	 *
	 * @since 0.2.0-lite
	 *
	 * @param string $preset Preset key.
	 * @return string
	 */
	private function default_recipe_preset_label( $preset ) {
		if ( $this->recipe_manager ) {
			return $this->recipe_manager->preset_manager()->default_recipe_preset_label( (string) $preset );
		}
		return 'Shared';
	}

	/**
	 * Normalize recipe context name.
	 *
	 * @param mixed $value Context.
	 * @return string
	 */
	private function normalize_context_name( $value ) {
		$ctx = strtolower( trim( (string) $value ) );
		$ctx = preg_replace( '/[_\s]+/', '-', $ctx );
		if ( in_array( $ctx, [ 'query', 'queryloop', 'query-loop', 'loop' ], true ) ) {
			return 'query-loop';
		}
		if ( in_array( $ctx, [ 'dynamic', 'dynamic-data', 'dynamicdata' ], true ) ) {
			return 'dynamic-data';
		}
		if ( in_array( $ctx, [ 'condition', 'conditions' ], true ) ) {
			return 'conditions';
		}
		if ( in_array( $ctx, [ 'component', 'slot', 'variant', 'schema', 'wpml' ], true ) ) {
			return $ctx;
		}
		return $ctx;
	}

	/**
	 * Get Bricks variables (name + value).
	 *
	 * @return array
	 */
	private function get_bricks_variables() {
		$raw = get_option( 'bricks_global_variables', [] );
		if ( ! is_array( $raw ) ) {
			return [];
		}

		$out  = [];
		$seen = [];
		$this->collect_bricks_variables_recursive( $raw, $out, $seen );

		usort(
			$out,
			static function ( $a, $b ) {
				return strcmp( (string) $a['name'], (string) $b['name'] );
			}
		);

		return $out;
	}

	/**
	 * Build Bricks variable name list.
	 *
	 * @return array
	 */
	private function get_bricks_variable_names() {
		$vars  = $this->get_bricks_variables();
		$names = [];
		foreach ( $vars as $var ) {
			if ( ! empty( $var['name'] ) ) {
				$names[] = (string) $var['name'];
			}
		}
		return $names;
	}

	/**
	 * Collect Bricks variables recursively.
	 *
	 * @param array $input Source data.
	 * @param array $out Output rows.
	 * @param array $seen Seen variable names.
	 * @return void
	 */
	private function collect_bricks_variables_recursive( $input, &$out, &$seen, $depth = 0 ) {
		if ( $depth > 10 ) {
			return;
		}
		foreach ( $input as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}

			if ( isset( $item['name'] ) ) {
				$name = $this->normalize_css_variable_name( $item['name'] );
				if ( '' !== $name && ! $this->is_core_bricks_variable_name( $name ) && ! isset( $seen[ $name ] ) ) {
					$value       = isset( $item['value'] ) ? $item['value'] : '';
					$seen[ $name ] = true;
					$out[]       = [
						'name'  => $name,
						'value' => is_scalar( $value ) ? (string) $value : wp_json_encode( $value ),
					];
				}
			}

			foreach ( $item as $nested ) {
				if ( is_array( $nested ) ) {
					$this->collect_bricks_variables_recursive( $nested, $out, $seen, $depth + 1 );
				}
			}
		}
	}

	/**
	 * Normalize CSS variable name.
	 *
	 * @param mixed $value Raw name.
	 * @return string
	 */
	private function normalize_css_variable_name( $value ) {
		$name = trim( (string) $value );
		if ( '' === $name ) {
			return '';
		}
		if ( 0 === strpos( $name, '--' ) ) {
			$name = substr( $name, 2 );
		}
		$name = strtolower( $name );
		$name = preg_replace( '/[^a-z0-9_-]/', '-', $name );
		$name = preg_replace( '/-+/', '-', $name );
		$name = trim( $name, '-' );
		if ( '' === $name ) {
			return '';
		}
		return '--' . $name;
	}

	/**
	 * Detect Bricks core/default variable names we want to ignore in autocomplete.
	 *
	 * @param string $name CSS variable name with leading --.
	 * @return bool
	 */
	private function is_core_bricks_variable_name( $name ) {
		$name = strtolower( ltrim( (string) $name, '-' ) );
		if ( '' === $name ) {
			return false;
		}

		if ( 1 === preg_match( '/^(brx|brxe|bricks|brick)(-|_)/', $name ) ) {
			return true;
		}
		if ( false !== strpos( $name, '-brx-' ) || false !== strpos( $name, '-bricks-' ) ) {
			return true;
		}

		return false;
	}
}

CM6GPT_Lite_Plugin::get_instance();
