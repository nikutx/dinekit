<?php
/**
 * Admin asset loader for the DineKit React app.
 *
 * Dev mode (Local site + assets-dev.php present) streams from the Vite dev
 * server for HMR. Production loads the compiled build in dist/. The dev file
 * is excluded from the shipped zip, so production always takes the safe path.
 *
 * @package DineKit
 */

namespace DineKit\Admin\Assets;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The Vite dev server origin (host derived from the site, so it adapts to
 * whatever *.local domain this machine's Local install uses).
 *
 * @return string
 */
function dev_origin() {
	$host = wp_parse_url( site_url(), PHP_URL_HOST );
	if ( ! $host ) {
		$host = 'dinekit-dev.local';
	}
	return 'http://' . $host . ':5174';
}

/**
 * Are we in Vite dev mode (HMR)? Opt-in only: define( 'DINEKIT_DEV', true ) in
 * wp-config and run `npm run dev`. Otherwise the compiled dist/ build loads, so
 * the app works on any site with no dev server running. The dev helper file is
 * stripped from production zips, so shipped installs can never enter dev mode.
 *
 * @return bool
 */
function is_dev() {
	return defined( 'DINEKIT_DEV' ) && DINEKIT_DEV && is_readable( __DIR__ . '/assets-dev.php' );
}

/**
 * Enqueue the app on the DineKit screen only.
 *
 * @param string $hook Current admin page hook suffix.
 * @return void
 */
function enqueue( $hook ) {
	if ( 'toplevel_page_dinekit' !== $hook ) {
		return;
	}

	// The item editor uses the WP media library for photos.
	wp_enqueue_media();

	// Inter (variable) — the admin app's typeface. Bundled with the plugin,
	// never fetched from a CDN.
	wp_register_style( 'dinekit-inter', false, array(), DINEKIT_VERSION );
	wp_enqueue_style( 'dinekit-inter' );
	wp_add_inline_style(
		'dinekit-inter',
		'@font-face{font-family:"InterVariable";src:url(' . esc_url( DINEKIT_URL . 'assets/fonts/inter-var.woff2' ) . ') format("woff2");font-weight:100 900;font-style:normal;font-display:swap}' .
		'#dinekit-root{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;font-feature-settings:"cv11","ss01"}'
	);

	if ( is_dev() ) {
		require_once __DIR__ . '/assets-dev.php';
		\DineKit\Admin\AssetsDev\enqueue_vite( dev_origin() );
	} else {
		$js = DINEKIT_DIR . 'dist/main.js';
		if ( is_readable( $js ) ) {
			// The Vite bundle is self-contained (its own React) — no wp-element
			// dependency, which avoids loading a second React on the page.
			wp_enqueue_script( 'dinekit-app', DINEKIT_URL . 'dist/main.js', array(), DINEKIT_VERSION, true );
		}
		$css = DINEKIT_DIR . 'dist/main.css';
		if ( is_readable( $css ) ) {
			wp_enqueue_style( 'dinekit-app', DINEKIT_URL . 'dist/main.css', array(), DINEKIT_VERSION );
		}
	}

	// Full-screen SPA: hide the default WP page chrome on our screen.
	wp_register_style( 'dinekit-admin-chrome', false, array(), DINEKIT_VERSION );
	wp_enqueue_style( 'dinekit-admin-chrome' );
	wp_add_inline_style(
		'dinekit-admin-chrome',
		'#wpcontent{padding-left:0}.dinekit-screen #wpbody-content>.wrap{margin:0}.dinekit-screen #wpfooter{display:none}.dinekit-screen #wpbody-content{padding-bottom:0}'
	);

	// Stripe mode (test/live) so the admin can deep-link to the right dashboard.
	$stripe_mode = 'test';
	if ( is_readable( DINEKIT_DIR . 'includes/integrations.php' ) ) {
		require_once DINEKIT_DIR . 'includes/integrations.php';
		$stripe_mode = 'live' === \DineKit\Integrations\raw()['stripe']['mode'] ? 'live' : 'test';
	}

	// The current user's effective DineKit permissions, so the SPA can hide nav
	// it can't use (server-side checks still enforce everything).
	require_once DINEKIT_DIR . 'includes/access.php';

	// Config for the app (REST base + nonce + i18n locale).
	wp_register_script( 'dinekit-config', false, array(), DINEKIT_VERSION, false );
	wp_enqueue_script( 'dinekit-config' );
	wp_add_inline_script(
		'dinekit-config',
		'window.DINEKIT = ' . wp_json_encode(
			array(
				'restUrl'    => esc_url_raw( rest_url( 'dinekit/v1/' ) ),
				'restRoot'   => esc_url_raw( rest_url() ),
				'nonce'      => wp_create_nonce( 'wp_rest' ),
				'adminUrl'   => esc_url_raw( admin_url() ),
				'pluginUrl'  => esc_url_raw( DINEKIT_URL ),
				'version'    => DINEKIT_VERSION,
				'canManage'  => current_user_can( 'manage_categories' ),
				'stripeMode' => $stripe_mode,
				'caps'       => \DineKit\Access\caps_for_spa(),
			)
		) . ';',
		'before'
	);
}
