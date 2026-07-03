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
		'edit_others_posts',
		'dinekit',
		__NAMESPACE__ . '\\render',
		'dashicons-food',
		26
	);
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
