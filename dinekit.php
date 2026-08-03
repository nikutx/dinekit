<?php
/**
 * Plugin Name:       DineKit
 * Plugin URI:        https://weblevelup.co.uk/dinekit
 * Description:       Beautiful restaurant menus with UK allergen support (Natasha's Law), QR table cards and opening hours. No dependencies, works with any theme.
 * Version:           1.2.17
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Web Level Up
 * Author URI:        https://weblevelup.co.uk/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       dinekit
 * Domain Path:       /languages
 *
 * @package DineKit
 */

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DINEKIT_VERSION', '1.2.17' );
define( 'DINEKIT_FILE', __FILE__ );
define( 'DINEKIT_DIR', plugin_dir_path( __FILE__ ) );
define( 'DINEKIT_URL', plugin_dir_url( __FILE__ ) );
define( 'DINEKIT_MIN_PHP', '7.4' );
define( 'DINEKIT_MIN_WP', '6.0' );

/**
 * Environment check. Never fatal: if the environment is unsuitable we show an
 * admin notice and load nothing, instead of white-screening the site.
 *
 * @return bool True when the environment is compatible.
 */
function dinekit_env_ok() {
	global $wp_version;
	if ( version_compare( PHP_VERSION, DINEKIT_MIN_PHP, '<' ) ) {
		return false;
	}
	if ( isset( $wp_version ) && version_compare( $wp_version, DINEKIT_MIN_WP, '<' ) ) {
		return false;
	}
	return true;
}

/**
 * Admin notice shown when the environment is incompatible.
 *
 * @return void
 */
function dinekit_env_notice() {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	printf(
		'<div class="notice notice-error"><p>%s</p></div>',
		esc_html(
			sprintf(
				/* translators: 1: required PHP version, 2: required WordPress version. */
				__( 'DineKit requires PHP %1$s+ and WordPress %2$s+. The plugin is inactive until the environment is updated.', 'dinekit' ),
				DINEKIT_MIN_PHP,
				DINEKIT_MIN_WP
			)
		)
	);
}

if ( ! dinekit_env_ok() ) {
	add_action( 'admin_notices', 'dinekit_env_notice' );
	return;
}

require_once DINEKIT_DIR . 'includes/class-plugin.php';

/**
 * Access the plugin container.
 *
 * @return \DineKit\Plugin
 */
function dinekit() {
	return \DineKit\Plugin::instance();
}

// Guarded activation: register CPTs/taxonomies, seed allergens, flush rewrites.
register_activation_hook(
	__FILE__,
	function () {
		try {
			require_once DINEKIT_DIR . 'includes/post-types.php';
			\DineKit\PostTypes\register();
			\DineKit\PostTypes\seed_allergens();
			\DineKit\PostTypes\seed_dietary();
			// Opening Hours drive booking availability and the ordering cutoff, so
			// every install starts with a real, visible week rather than a hidden one.
			require_once DINEKIT_DIR . 'includes/hours.php';
			\DineKit\Hours\seed();
			require_once DINEKIT_DIR . 'includes/access.php';
			\DineKit\Access\ensure_roles();
			flush_rewrite_rules();
			update_option( 'dinekit_version', DINEKIT_VERSION );
			if ( false === get_option( 'dinekit_activated_at' ) ) {
				update_option( 'dinekit_activated_at', time() );
			}
			// Arm the one-shot welcome redirect: straight into DineKit (the
			// wizard greets first-timers there) instead of leaving the user to
			// hunt for it in a long plugin menu. Consumed on the next admin
			// load; short-lived so it can never fire days later.
			set_transient( 'dinekit_activation_redirect', get_current_user_id(), 5 * MINUTE_IN_SECONDS );
		} catch ( \Throwable $e ) {
			// Never fatal on activation. Log for support, carry on.
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'DineKit activation: ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}
);

register_deactivation_hook(
	__FILE__,
	function () {
		wp_clear_scheduled_hook( 'dinekit_review_cron' );
		wp_clear_scheduled_hook( 'dinekit_sms_cron' );
		wp_clear_scheduled_hook( 'dinekit_support_cron' );
		wp_clear_scheduled_hook( 'dinekit_daily_sweep' );
		flush_rewrite_rules();
	}
);

// One-shot post-activation welcome: land the activating user in DineKit.
// Deliberately NOT on bulk activations (activating ten plugins must never
// hijack the screen), not on network admin, and only for the same user who
// activated with access to the app.
add_action(
	'admin_init',
	function () {
		$user = get_transient( 'dinekit_activation_redirect' );
		if ( false === $user ) {
			return;
		}
		delete_transient( 'dinekit_activation_redirect' );
		if (
			wp_doing_ajax()
			|| is_network_admin()
			|| isset( $_GET['activate-multi'] ) // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only bulk-activation detection, no action taken on the value.
			|| get_current_user_id() !== (int) $user
			|| ! current_user_can( 'manage_options' )
		) {
			return;
		}
		wp_safe_redirect( admin_url( 'admin.php?page=dinekit' ) );
		exit;
	}
);

// Boot.
add_action( 'plugins_loaded', array( '\DineKit\Plugin', 'instance' ) );
