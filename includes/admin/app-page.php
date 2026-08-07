<?php
/**
 * DineKit admin menu page — the single mount point for the React SPA.
 *
 * @package DineKit
 */

namespace DineKit\Admin\App;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook the admin page and its assets.
 *
 * @return void
 */
function init() {
	add_action( 'admin_menu', __NAMESPACE__ . '\\register_page' );
	add_action( 'admin_enqueue_scripts', __NAMESPACE__ . '\\load_assets' );
	add_filter( 'admin_body_class', __NAMESPACE__ . '\\body_class' );
	add_action( 'current_screen', __NAMESPACE__ . '\\help_tab' );
	add_action( 'current_screen', __NAMESPACE__ . '\\disable_emoji_swap' );
}

/**
 * Keep WP's twemoji swapper off the DineKit screen.
 *
 * Core replaces emoji characters (⭐, 📝, ⏰…) with <img> elements INSIDE
 * React-managed DOM; the next React reconciliation of that node then throws
 * NotFoundError (removeChild) and white-screens the app. The SPA renders
 * native emoji fine, so on this one screen the swapper must not run.
 *
 * @param \WP_Screen $screen Current screen.
 * @return void
 */
function disable_emoji_swap( $screen ) {
	if ( ! $screen || 'toplevel_page_dinekit' !== $screen->id ) {
		return;
	}
	remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
	remove_action( 'admin_print_styles', 'print_emoji_styles' );
}

/**
 * Add a "Want it set up for you?" help tab on the DineKit screen (subtle WLU
 * lead hook — the credit itself stays off by default in v1).
 *
 * @param \WP_Screen $screen Current screen.
 * @return void
 */
function help_tab( $screen ) {
	if ( ! $screen || 'toplevel_page_dinekit' !== $screen->id ) {
		return;
	}
	$screen->add_help_tab(
		array(
			'id'      => 'dinekit-help-setup',
			'title'   => __( 'Want it set up for you?', 'dinekit' ),
			'content' => '<p>' . esc_html__( 'Short on time? Web Level Up can build and style your whole menu for you.', 'dinekit' ) . '</p>' .
				'<p><a href="https://weblevelup.co.uk/dinekit" target="_blank" rel="noopener">' .
				esc_html__( 'Get done-for-you setup →', 'dinekit' ) . '</a></p>',
		)
	);
}

/**
 * Register the top-level DineKit menu (the CPT menu is hidden in favour of it).
 *
 * @return void
 */
function register_page() {
	add_menu_page(
		__( 'DineKit', 'dinekit' ),
		__( 'DineKit', 'dinekit' ),
		'dinekit_access', // Admins/editors get this dynamically; staff via their role.
		'dinekit',
		__NAMESPACE__ . '\\render',
		'dashicons-food',
		26
	);

	// The app's main destinations, mirrored as native WP submenu links so
	// DineKit navigates like every other plugin. Each slug after the first is
	// the page slug plus a hash route: WordPress prints it verbatim, so from
	// anywhere in wp-admin the link loads the app on the right screen — and
	// from inside the app only the hash changes, which is instant. A curated
	// set, not every screen: the app's own sidebar remains the full map.
	$destinations = array(
		array( __( 'Dashboard', 'dinekit' ), 'dinekit' ),
		array( __( 'Bookings', 'dinekit' ), 'dinekit#/bookings' ),
		array( __( 'Orders', 'dinekit' ), 'dinekit#/orders' ),
		array( __( 'Take Order', 'dinekit' ), 'dinekit#/pos' ),
		array( __( 'Kitchen Display', 'dinekit' ), 'dinekit#/kds' ),
		array( __( 'Menu Builder', 'dinekit' ), 'dinekit#/builder' ),
		array( __( 'Design Studio', 'dinekit' ), 'dinekit#/design' ),
		array( __( 'Guests', 'dinekit' ), 'dinekit#/guests' ),
		array( __( 'Staff', 'dinekit' ), 'dinekit#/staff' ),
		array( __( 'Settings', 'dinekit' ), 'dinekit#/settings' ),
	);
	foreach ( $destinations as $dest ) {
		// Every entry registers the render callback: WordPress only builds an
		// admin.php?page=… link for slugs with a page hook. The browser keeps
		// the #route client-side, so the server always loads page=dinekit.
		add_submenu_page( 'dinekit', $dest[0], $dest[0], 'dinekit_access', $dest[1], __NAMESPACE__ . '\\render' );
	}
}

/**
 * Delegate asset loading to the dev/prod-aware loader.
 *
 * @param string $hook Current admin page hook suffix.
 * @return void
 */
function load_assets( $hook ) {
	require_once __DIR__ . '/assets.php';
	\DineKit\Admin\Assets\enqueue( $hook );
}

/**
 * Tag our screen so the chrome-hiding CSS can scope to it.
 *
 * @param string $classes Space-separated body classes.
 * @return string
 */
function body_class( $classes ) {
	$screen = get_current_screen();
	if ( $screen && 'toplevel_page_dinekit' === $screen->id ) {
		$classes .= ' dinekit-screen';
	}
	return $classes;
}

/**
 * Render the SPA mount point.
 *
 * @return void
 */
function render() {
	echo '<div class="wrap"><div id="dinekit-root"></div></div>';
}
