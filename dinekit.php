<?php
/**
 * Plugin Name:       DineKit
 * Plugin URI:        https://weblevelup.co.uk/dinekit
 * Description:       Beautiful restaurant menus with UK allergen support (Natasha's Law), QR table cards and opening hours. No dependencies, works with any theme.
 * Version:           1.1.0
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

define( 'DINEKIT_VERSION', '1.1.0' );
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
			require_once DINEKIT_DIR . 'includes/access.php';
			\DineKit\Access\ensure_roles();
			flush_rewrite_rules();
			update_option( 'dinekit_version', DINEKIT_VERSION );
			if ( false === get_option( 'dinekit_activated_at' ) ) {
				update_option( 'dinekit_activated_at', time() );
			}
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
		flush_rewrite_rules();
	}
);

// Boot.
add_action( 'plugins_loaded', array( '\DineKit\Plugin', 'instance' ) );
