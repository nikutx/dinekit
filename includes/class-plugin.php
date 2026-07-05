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

		// Access control (role → permission matrix). Loaded early so module
		// permission callbacks can consult it.
		if ( $this->load( 'access.php' ) ) {
			Access\init();
		}
		// Activity log (audit trail). Loaded early so any module can log().
		if ( $this->load( 'activity.php' ) ) {
			Activity\init();
		}
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
		if ( $this->load( 'events/events.php' ) ) {
			Events\init();
		}
		if ( $this->load( 'ordering/ordering.php' ) ) {
			Ordering\init();
		}
		if ( $this->load( 'reviews.php' ) ) {
			Reviews\init();
		}
		if ( $this->load( 'payments.php' ) ) {
			Payments\init();
		}
		if ( $this->load( 'pay.php' ) ) {
			Pay\init();
		}
		if ( $this->load( 'cash.php' ) ) {
			Cash\init();
		}
		if ( $this->load( 'terminal.php' ) ) {
			Terminal\init();
		}
		if ( $this->load( 'staff.php' ) ) {
			Staff\init();
		}
		if ( is_admin() ) {
			if ( $this->load( 'admin/admin.php' ) ) {
				Admin\init();
			}
			if ( $this->load( 'admin/app-page.php' ) ) {
				Admin\App\init();
			}
		}

		// Cache-bust our own JS/CSS by file mtime so every deploy is picked up even
		// behind aggressive host/CDN static caches — no manual version bumps.
		add_filter( 'style_loader_src', array( $this, 'cache_bust_asset' ) );
		add_filter( 'script_loader_src', array( $this, 'cache_bust_asset' ) );

		// Upgrade routine (option-based, cheap).
		add_action( 'admin_init', array( $this, 'maybe_upgrade' ) );
	}

	/**
	 * Append the file's modification time as the asset version, for DineKit's own
	 * assets only. Ensures updated CSS/JS bypass stale caches after a deploy.
	 *
	 * @param string $src Asset URL.
	 * @return string
	 */
	public function cache_bust_asset( $src ) {
		if ( ! is_string( $src ) || 0 !== strpos( $src, DINEKIT_URL ) ) {
			return $src;
		}
		$rel  = preg_replace( '/\?.*$/', '', substr( $src, strlen( DINEKIT_URL ) ) );
		$path = DINEKIT_DIR . $rel;
		if ( is_readable( $path ) ) {
			$src = add_query_arg( 'ver', (string) filemtime( $path ), $src );
		}
		return $src;
	}

	/**
	 * Run one-time upgrade tasks when the stored version is stale.
	 *
	 * @return void
	 */
	public function maybe_upgrade() {
		// One-time: encrypt any plaintext integration secrets already in the DB.
		// Keyed by its own flag so it runs even when the version is unchanged.
		if ( ! get_option( 'dinekit_secrets_encrypted' ) ) {
			try {
				require_once DINEKIT_DIR . 'includes/integrations.php';
				Integrations\encrypt_existing();
				update_option( 'dinekit_secrets_encrypted', 1 );
			} catch ( \Throwable $e ) {
				if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					error_log( 'DineKit secret migration: ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
				}
			}
		}

		// One-time: ensure the staff WP role exists on already-active installs.
		if ( ! get_option( 'dinekit_roles_ready' ) ) {
			try {
				require_once DINEKIT_DIR . 'includes/access.php';
				Access\ensure_roles();
				update_option( 'dinekit_roles_ready', 1 );
			} catch ( \Throwable $e ) {
				if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					error_log( 'DineKit roles: ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
				}
			}
		}

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
