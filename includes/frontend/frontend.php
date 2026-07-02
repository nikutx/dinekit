<?php
/**
 * Frontend integration: the dinekit/menu block, the [dinekit_menu] shortcode
 * and the scoped stylesheet.
 *
 * @package DineKit
 */

namespace DineKit\Frontend;

use DineKit\Render;
use DineKit\Hours;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook frontend features.
 *
 * @return void
 */
function init() {
	require_once DINEKIT_DIR . 'includes/frontend/render.php';
	require_once DINEKIT_DIR . 'includes/hours.php';
	add_action( 'init', __NAMESPACE__ . '\\register' );
	add_shortcode( 'dinekit_menu', __NAMESPACE__ . '\\shortcode' );
	add_shortcode( 'dinekit_hours', __NAMESPACE__ . '\\hours_shortcode' );
}

/**
 * Register the stylesheet, the editor script and the block.
 *
 * @return void
 */
function register() {
	wp_register_style( 'dinekit-menu', DINEKIT_URL . 'assets/css/menu.css', array(), DINEKIT_VERSION );
	wp_register_script( 'dinekit-filter', DINEKIT_URL . 'assets/js/dinekit-filter.js', array(), DINEKIT_VERSION, true );

	wp_register_script(
		'dinekit-menu-editor',
		DINEKIT_URL . 'assets/block/menu-editor.js',
		array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-server-side-render', 'wp-i18n', 'wp-api-fetch' ),
		DINEKIT_VERSION,
		true
	);
	wp_set_script_translations( 'dinekit-menu-editor', 'dinekit', DINEKIT_DIR . 'languages' );

	wp_register_script(
		'dinekit-hours-editor',
		DINEKIT_URL . 'assets/block/hours-editor.js',
		array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-server-side-render', 'wp-i18n' ),
		DINEKIT_VERSION,
		true
	);
	wp_set_script_translations( 'dinekit-hours-editor', 'dinekit', DINEKIT_DIR . 'languages' );

	if ( function_exists( 'register_block_type' ) ) {
		register_block_type(
			DINEKIT_DIR . 'blocks/menu',
			array( 'render_callback' => __NAMESPACE__ . '\\render_block' )
		);
		register_block_type(
			DINEKIT_DIR . 'blocks/hours',
			array( 'render_callback' => __NAMESPACE__ . '\\render_hours_block' )
		);
	}
}

/**
 * Render the hours block.
 *
 * @param array<string,mixed> $attributes Block attributes.
 * @return string
 */
function render_hours_block( $attributes ) {
	wp_enqueue_style( 'dinekit-menu' );
	return Hours\render(
		array(
			'show_status' => ! isset( $attributes['showStatus'] ) || (bool) $attributes['showStatus'],
			'title'       => isset( $attributes['title'] ) ? (string) $attributes['title'] : '',
		)
	);
}

/**
 * [dinekit_hours] shortcode.
 *
 * @param array<string,string>|string $atts Attributes.
 * @return string
 */
function hours_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'status' => 'yes',
			'title'  => '',
		),
		$atts,
		'dinekit_hours'
	);
	wp_enqueue_style( 'dinekit-menu' );
	return Hours\render(
		array(
			'show_status' => in_array( strtolower( (string) $atts['status'] ), array( 'yes', 'true', '1', 'on' ), true ),
			'title'       => (string) $atts['title'],
		)
	);
}

/**
 * Map block attributes to renderer args and output the menu.
 *
 * @param array<string,mixed> $attributes Block attributes.
 * @return string
 */
function render_block( $attributes ) {
	wp_enqueue_style( 'dinekit-menu' );

	$show_filter = ! isset( $attributes['showFilter'] ) || (bool) $attributes['showFilter'];
	if ( $show_filter ) {
		wp_enqueue_script( 'dinekit-filter' );
	}

	$args = array(
		'menu'           => isset( $attributes['menu'] ) ? (int) $attributes['menu'] : 0,
		'sections'       => isset( $attributes['sections'] ) ? array_map( 'intval', (array) $attributes['sections'] ) : array(),
		'layout'         => isset( $attributes['layout'] ) ? (string) $attributes['layout'] : 'list',
		'columns'        => isset( $attributes['columns'] ) ? (int) $attributes['columns'] : 0,
		'show_images'    => ! isset( $attributes['showImages'] ) || (bool) $attributes['showImages'],
		'show_allergens' => ! isset( $attributes['showAllergens'] ) || (bool) $attributes['showAllergens'],
		'show_dietary'   => ! isset( $attributes['showDietary'] ) || (bool) $attributes['showDietary'],
		'show_matrix'    => ! isset( $attributes['showMatrix'] ) || (bool) $attributes['showMatrix'],
		'show_filter'    => $show_filter,
	);

	return Render\menu( $args );
}

/**
 * [dinekit_menu] shortcode handler.
 *
 * Attributes: menu, sections (comma ids), layout, images, allergens, dietary,
 * matrix (yes/no).
 *
 * @param array<string,string>|string $atts Shortcode attributes.
 * @return string
 */
function shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'menu'      => 0,
			'sections'  => '',
			'layout'    => 'list',
			'columns'   => 0,
			'images'    => 'yes',
			'allergens' => 'yes',
			'dietary'   => 'yes',
			'matrix'    => 'yes',
			'filter'    => 'yes',
		),
		$atts,
		'dinekit_menu'
	);

	wp_enqueue_style( 'dinekit-menu' );

	$truthy = static function ( $value ) {
		return in_array( strtolower( (string) $value ), array( 'yes', 'true', '1', 'on' ), true );
	};

	$sections    = array_filter( array_map( 'intval', explode( ',', (string) $atts['sections'] ) ) );
	$show_filter = $truthy( $atts['filter'] );
	if ( $show_filter ) {
		wp_enqueue_script( 'dinekit-filter' );
	}

	return Render\menu(
		array(
			'menu'           => (int) $atts['menu'],
			'sections'       => $sections,
			'layout'         => (string) $atts['layout'],
			'columns'        => (int) $atts['columns'],
			'show_images'    => $truthy( $atts['images'] ),
			'show_allergens' => $truthy( $atts['allergens'] ),
			'show_dietary'   => $truthy( $atts['dietary'] ),
			'show_matrix'    => $truthy( $atts['matrix'] ),
			'show_filter'    => $show_filter,
		)
	);
}
