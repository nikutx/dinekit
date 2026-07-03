<?php
/**
 * Bookings module — data model registration (floor plan + bookings).
 *
 * Floor plan: dk_table CPT (each table) + dk_area taxonomy (zones/areas/levels),
 * with seats + party-size meta. Everything is stored in CPTs/taxonomies/meta so
 * it stays portable — no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Bookings;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook the module.
 *
 * @return void
 */
function init() {
	add_action( 'init', __NAMESPACE__ . '\\register' );
	add_action( 'init', __NAMESPACE__ . '\\register_frontend' );
	add_shortcode( 'dinekit_booking', __NAMESPACE__ . '\\booking_shortcode' );
	require_once DINEKIT_DIR . 'includes/bookings/rest.php';
	Rest\init();
}

/**
 * Register the public booking widget's assets and block.
 *
 * @return void
 */
function register_frontend() {
	wp_register_style( 'dinekit-booking', DINEKIT_URL . 'assets/css/booking.css', array(), DINEKIT_VERSION );
	wp_register_script( 'dinekit-booking', DINEKIT_URL . 'assets/js/dinekit-booking.js', array(), DINEKIT_VERSION, true );

	wp_register_script(
		'dinekit-booking-editor',
		DINEKIT_URL . 'assets/block/booking-editor.js',
		array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-server-side-render', 'wp-i18n' ),
		DINEKIT_VERSION,
		true
	);
	wp_set_script_translations( 'dinekit-booking-editor', 'dinekit', DINEKIT_DIR . 'languages' );

	if ( function_exists( 'register_block_type' ) ) {
		register_block_type(
			DINEKIT_DIR . 'blocks/booking',
			array( 'render_callback' => __NAMESPACE__ . '\\render_booking_block' )
		);
	}
}

/**
 * [dinekit_booking] shortcode.
 *
 * @param array<string,string>|string $atts Attributes.
 * @return string
 */
function booking_shortcode( $atts ) {
	require_once DINEKIT_DIR . 'includes/bookings/form.php';
	$atts = shortcode_atts(
		array(
			'heading' => __( 'Book a table', 'dinekit' ),
			'intro'   => '',
		),
		$atts,
		'dinekit_booking'
	);
	return Form\render( $atts );
}

/**
 * Render the dinekit/booking block.
 *
 * @param array<string,mixed> $attributes Block attributes.
 * @return string
 */
function render_booking_block( $attributes ) {
	require_once DINEKIT_DIR . 'includes/bookings/form.php';
	return Form\render(
		array(
			'heading' => isset( $attributes['heading'] ) ? (string) $attributes['heading'] : '',
			'intro'   => isset( $attributes['intro'] ) ? (string) $attributes['intro'] : '',
		)
	);
}

/**
 * Register the floor-plan and booking post types, taxonomies and meta.
 *
 * @return void
 */
function register() {
	// --- Tables (the floor plan) ---
	register_post_type(
		'dk_table',
		array(
			'labels'       => array(
				'name'          => __( 'Tables', 'dinekit' ),
				'singular_name' => __( 'Table', 'dinekit' ),
			),
			'description'  => __( 'Restaurant tables managed by DineKit bookings.', 'dinekit' ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_menu' => false,
			'show_in_rest' => false,
			'supports'     => array( 'title', 'page-attributes' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'map_meta_cap' => true,
		)
	);

	// --- Areas / zones / levels (groups of tables) ---
	register_taxonomy(
		'dk_area',
		'dk_table',
		array(
			'labels'            => array(
				'name'          => __( 'Areas', 'dinekit' ),
				'singular_name' => __( 'Area', 'dinekit' ),
			),
			'description'       => __( 'Zones, areas or levels, e.g. Main Restaurant, Terrace, Bar.', 'dinekit' ),
			'hierarchical'      => true,
			'public'            => false,
			'show_ui'           => false,
			'show_in_rest'      => false,
			'show_admin_column' => false,
			'rewrite'           => false,
		)
	);

	// --- Table meta: capacity, party size limits + floor-plan geometry ---
	$table_meta = array(
		'dk_seats'     => array( 'default' => 2, 'desc' => __( 'Number of seats at the table.', 'dinekit' ) ),
		'dk_min_party' => array( 'default' => 1, 'desc' => __( 'Smallest party this table takes.', 'dinekit' ) ),
		'dk_max_party' => array( 'default' => 2, 'desc' => __( 'Largest party this table takes.', 'dinekit' ) ),
		'dk_pos_x'     => array( 'default' => 40, 'desc' => __( 'Floor-plan X position (px).', 'dinekit' ) ),
		'dk_pos_y'     => array( 'default' => 40, 'desc' => __( 'Floor-plan Y position (px).', 'dinekit' ) ),
		'dk_rotation'  => array( 'default' => 0, 'desc' => __( 'Rotation on the floor plan (degrees).', 'dinekit' ) ),
	);
	foreach ( $table_meta as $key => $conf ) {
		register_post_meta(
			'dk_table',
			$key,
			array(
				'type'              => 'integer',
				'description'       => $conf['desc'],
				'single'            => true,
				'default'           => $conf['default'],
				'show_in_rest'      => false,
				'sanitize_callback' => 'absint',
				'auth_callback'     => __NAMESPACE__ . '\\can_manage',
			)
		);
	}

	// Table shape on the floor plan.
	register_post_meta(
		'dk_table',
		'dk_shape',
		array(
			'type'              => 'string',
			'description'       => __( 'Table shape: round, square, rect or bar.', 'dinekit' ),
			'single'            => true,
			'default'           => 'round',
			'show_in_rest'      => false,
			'sanitize_callback' => 'sanitize_key',
			'auth_callback'     => __NAMESPACE__ . '\\can_manage',
		)
	);

	// --- Bookings ---
	register_post_type(
		'dk_booking',
		array(
			'labels'       => array(
				'name'          => __( 'Bookings', 'dinekit' ),
				'singular_name' => __( 'Booking', 'dinekit' ),
			),
			'description'  => __( 'Table bookings managed by DineKit.', 'dinekit' ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_menu' => false,
			'show_in_rest' => false,
			'supports'     => array( 'title' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'map_meta_cap' => true,
		)
	);

	// --- Booking meta ---
	$booking_meta = array(
		'dk_date'     => 'string',  // Y-m-d.
		'dk_time'     => 'string',  // H:i.
		'dk_party'    => 'integer', // Number of guests.
		'dk_table_id' => 'integer', // Assigned table (0 = unassigned).
		'dk_combo_id' => 'integer', // Assigned table combination (0 = none).
		'dk_name'     => 'string',
		'dk_email'    => 'string',
		'dk_phone'    => 'string',
		'dk_notes'    => 'string',
		'dk_status'   => 'string',  // pending | confirmed | seated | completed | cancelled | no_show | provisional.
		'dk_source'   => 'string',  // online | admin | phone.
		'dk_deposit_required' => 'integer', // 1 when the party triggers a deposit rule.
	);
	foreach ( $booking_meta as $key => $type ) {
		register_post_meta(
			'dk_booking',
			$key,
			array(
				'type'              => $type,
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'integer' === $type ? 'absint' : 'sanitize_text_field',
				'auth_callback'     => __NAMESPACE__ . '\\can_manage',
			)
		);
	}

	// --- Table combinations (joins) ---
	// A combo groups 2+ tables into one bookable unit for larger parties, with
	// an explicit combined min/max (not summed seats) and a priority so the
	// engine sells a real large table before joining smaller ones.
	register_post_type(
		'dk_table_combo',
		array(
			'labels'       => array(
				'name'          => __( 'Table combinations', 'dinekit' ),
				'singular_name' => __( 'Table combination', 'dinekit' ),
			),
			'description'  => __( 'Joined table groups for larger parties.', 'dinekit' ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_menu' => false,
			'show_in_rest' => false,
			'supports'     => array( 'title', 'page-attributes' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'map_meta_cap' => true,
		)
	);

	// Member table IDs stored as a comma-separated list.
	register_post_meta(
		'dk_table_combo',
		'dk_combo_tables',
		array(
			'type'              => 'string',
			'single'            => true,
			'default'           => '',
			'show_in_rest'      => false,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_id_list',
			'auth_callback'     => __NAMESPACE__ . '\\can_manage',
		)
	);
	foreach ( array( 'dk_combo_min' => 2, 'dk_combo_max' => 4 ) as $key => $default ) {
		register_post_meta(
			'dk_table_combo',
			$key,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => $default,
				'show_in_rest'      => false,
				'sanitize_callback' => 'absint',
				'auth_callback'     => __NAMESPACE__ . '\\can_manage',
			)
		);
	}
}

/**
 * Sanitize a comma-separated list of positive integer IDs.
 *
 * @param string $value Raw value.
 * @return string
 */
function sanitize_id_list( $value ) {
	$ids = array_filter( array_map( 'absint', explode( ',', (string) $value ) ) );
	return implode( ',', array_unique( $ids ) );
}

/**
 * Booking statuses and their labels.
 *
 * @return array<string,string>
 */
function statuses() {
	return array(
		'pending'     => __( 'Pending', 'dinekit' ),
		'provisional' => __( 'Penciled in', 'dinekit' ),
		'confirmed'   => __( 'Confirmed', 'dinekit' ),
		'seated'      => __( 'Seated', 'dinekit' ),
		'completed'   => __( 'Completed', 'dinekit' ),
		'cancelled'   => __( 'Cancelled', 'dinekit' ),
		'no_show'     => __( 'No-show', 'dinekit' ),
	);
}

/**
 * Manage permission for booking data.
 *
 * @return bool
 */
function can_manage() {
	return current_user_can( 'manage_options' );
}
