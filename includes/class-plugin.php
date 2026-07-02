<?php
/**
 * Plugin service container / loader.
 *
 * @package DineKit
 */

namespace DineKit;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Main plugin class. Lightweight loader — each module is a plain PHP file
 * with namespaced functions, required and hooked here. Defensive by design:
 * a missing module file is skipped, never fatal.
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Get (and boot) the plugin instance.
	 *
	 * @return Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
			self::$instance->boot();
		}
		return self::$instance;
	}

	/**
	 * Require a module file if it exists.
	 *
	 * @param string $relative Path relative to includes/.
	 * @return bool Whether the file was loaded.
	 */
	private function load( $relative ) {
		$file = DINEKIT_DIR . 'includes/' . $relative;
		if ( is_readable( $file ) ) {
			require_once $file;
			return true;
		}
		return false;
	}

	/**
	 * Boot modules and register hooks.
	 *
	 * @return void
	 */
	private function boot() {
		// Translations load automatically on wp.org-hosted plugins (WP 4.6+);
		// no load_plugin_textdomain() call needed.
		if ( $this->load( 'post-types.php' ) ) {
			add_action( 'init', __NAMESPACE__ . '\\PostTypes\\register' );
		}
		if ( $this->load( 'meta.php' ) ) {
			add_action( 'init', __NAMESPACE__ . '\\Meta\\register' );
		}
		if ( $this->load( 'rest.php' ) ) {
			Rest\init();
		}
		if ( $this->load( 'frontend/frontend.php' ) ) {
			Frontend\init();
		}
		if ( $this->load( 'bookings/register.php' ) ) {
			Bookings\init();
		}
		if ( is_admin() ) {
			if ( $this->load( 'admin/admin.php' ) ) {
				Admin\init();
			}
			if ( $this->load( 'admin/app-page.php' ) ) {
				Admin\App\init();
			}
		}

		// Upgrade routine (option-based, cheap).
		add_action( 'admin_init', array( $this, 'maybe_upgrade' ) );
	}

	/**
	 * Run one-time upgrade tasks when the stored version is stale.
	 *
	 * @return void
	 */
	public function maybe_upgrade() {
		$stored = get_option( 'dinekit_version' );
		if ( DINEKIT_VERSION === $stored ) {
			return;
		}
		try {
			PostTypes\seed_allergens();
			PostTypes\seed_dietary();
			update_option( 'dinekit_version', DINEKIT_VERSION );
		} catch ( \Throwable $e ) {
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'DineKit upgrade: ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}

	/**
	 * Private constructor (singleton).
	 */
	private function __construct() {}
}
