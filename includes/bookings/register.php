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

	// Stripe.js — the single external script DineKit loads, and only on a payable
	// surface. Stripe requires it be served from their domain (PCI SAQ-A); it must
	// not be bundled. Shared by bookings + ordering, so guard against re-register.
	if ( ! wp_script_is( 'dinekit-stripe', 'registered' ) ) {
		wp_register_script( 'dinekit-stripe', 'https://js.stripe.com/v3/', array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion,WordPress.WP.EnqueuedResourceParameters.NotInFooter -- Stripe requires their unversioned URL.
	}

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
		'dk_seats'     => array(
			'default' => 2,
			'desc'    => __( 'Number of seats at the table.', 'dinekit' ),
		),
		'dk_min_party' => array(
			'default' => 1,
			'desc'    => __( 'Smallest party this table takes.', 'dinekit' ),
		),
		'dk_max_party' => array(
			'default' => 2,
			'desc'    => __( 'Largest party this table takes.', 'dinekit' ),
		),
		'dk_pos_x'     => array(
			'default' => 40,
			'desc'    => __( 'Floor-plan X position (px).', 'dinekit' ),
		),
		'dk_pos_y'     => array(
			'default' => 40,
			'desc'    => __( 'Floor-plan Y position (px).', 'dinekit' ),
		),
		'dk_rotation'  => array(
			'default' => 0,
			'desc'    => __( 'Rotation on the floor plan (degrees).', 'dinekit' ),
		),
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

	// Table availability status: 'active' or 'maintenance' (out of service).
	register_post_meta(
		'dk_table',
		'dk_status',
		array(
			'type'              => 'string',
			'description'       => __( 'Table status: active or maintenance.', 'dinekit' ),
			'single'            => true,
			'default'           => 'active',
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
		'dk_date'             => 'string',  // Y-m-d.
		'dk_time'             => 'string',  // H:i.
		'dk_party'            => 'integer', // Number of guests.
		'dk_table_id'         => 'integer', // Assigned table (0 = unassigned).
		'dk_combo_id'         => 'integer', // Assigned table combination (0 = none).
		'dk_name'             => 'string',
		'dk_email'            => 'string',
		'dk_phone'            => 'string',
		'dk_notes'            => 'string',
		'dk_status'           => 'string',  // pending | confirmed | seated | completed | cancelled | no_show | provisional.
		'dk_source'           => 'string',  // online | admin | phone.
		'dk_deposit_required' => 'integer', // 1 when the party triggers a deposit rule.
		'dk_deposit_pi'       => 'string',  // Stripe PaymentIntent id for the deposit.
		'dk_deposit_paid'     => 'integer', // 1 once the deposit is paid (set by webhook).
		'dk_deposit_amount'   => 'integer', // Deposit due, in pence (stored at intent time).
		'dk_archived'         => 'integer', // 1 = archived (never hard-deleted).
		'dk_refund_due'       => 'integer', // 1 = a deposit refund is owed but failed automatically.
		'dk_history'          => 'string',  // JSON: [{t,e}] audit trail.
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
	foreach ( array(
		'dk_combo_min' => 2,
		'dk_combo_max' => 4,
	) as $key => $default ) {
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
 * Append an event to a booking's history audit trail (oldest first).
 *
 * @param int    $id    Booking id.
 * @param string $event Human-readable event.
 * @return void
 */
function log_event( $id, $event ) {
	$log = json_decode( (string) get_post_meta( $id, 'dk_history', true ), true );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	$log[] = array(
		't' => current_time( 'c' ),
		'e' => (string) $event,
	);
	if ( count( $log ) > 100 ) {
		$log = array_slice( $log, -100 );
	}
	update_post_meta( $id, 'dk_history', wp_json_encode( $log ) );
}

/**
 * When a booking with a paid deposit is cancelled, refund it via Stripe and
 * flag the guest for notification. No-op if there's no paid deposit.
 *
 * @param int $id Booking id.
 * @return void
 */
function refund_deposit( $id ) {
	if ( '1' !== (string) get_post_meta( $id, 'dk_deposit_paid', true ) ) {
		return;
	}
	$pi = (string) get_post_meta( $id, 'dk_deposit_pi', true );
	if ( '' === $pi ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/payments.php';
	$res = \DineKit\Payments\stripe_post( 'refunds', array( 'payment_intent' => $pi ) );
	if ( is_wp_error( $res ) ) {
		update_post_meta( $id, 'dk_refund_due', 1 );
		log_event( $id, sprintf( /* translators: %s: error message. */ __( 'Deposit refund failed (needs manual action): %s', 'dinekit' ), $res->get_error_message() ) );
		return;
	}
	update_post_meta( $id, 'dk_deposit_paid', 0 );
	update_post_meta( $id, 'dk_refund_due', 0 );
	log_event( $id, __( 'Deposit refunded — please let the guest know', 'dinekit' ) );
}

/**
 * Manage permission for booking data.
 *
 * @return bool
 */
function can_manage() {
	return current_user_can( 'manage_options' );
}
