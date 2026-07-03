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
	require_once DINEKIT_DIR . 'includes/bookings/rest.php';
	Rest\init();
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
		'dk_name'     => 'string',
		'dk_email'    => 'string',
		'dk_phone'    => 'string',
		'dk_notes'    => 'string',
		'dk_status'   => 'string',  // pending | confirmed | seated | completed | cancelled | no_show | provisional.
		'dk_source'   => 'string',  // online | admin | phone.
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
