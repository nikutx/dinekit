<?php
/**
 * Bookings REST API (dinekit/v1/bookings/...).
 *
 * Floor plan (areas + tables), bookings CRUD + status, and availability.
 *
 * @package DineKit
 */

namespace DineKit\Bookings\Rest;

use DineKit\Bookings\Availability;
use DineKit\Bookings;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Manage permission.
 *
 * @return bool
 */
function can_manage() {
	return current_user_can( 'manage_options' );
}

/**
 * Register routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';

	register_rest_route(
		$ns,
		'/bookings/floor',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_floor',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);

	register_rest_route(
		$ns,
		'/bookings/areas',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_area',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/bookings/areas/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_area',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_area',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);

	register_rest_route(
		$ns,
		'/bookings/tables',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_table',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/bookings/tables/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_table',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_table',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);

	register_rest_route(
		$ns,
		'/bookings/combos',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_combo',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/bookings/combos/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_combo',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_combo',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);

	register_rest_route(
		$ns,
		'/bookings/availability',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_availability',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);

	register_rest_route(
		$ns,
		'/bookings/list',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\list_bookings',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);

	register_rest_route(
		$ns,
		'/bookings',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_booking',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/bookings/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_booking',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_booking',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);

	// Admin booking settings.
	register_rest_route(
		$ns,
		'/bookings/settings',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_settings',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\save_settings',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);

	register_rest_route(
		$ns,
		'/guests',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\list_guests',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);

	// --- Public (diner-facing) endpoints ---
	// Intentionally public: a diner requesting a table is unauthenticated.
	// Abuse is handled in the handlers (honeypot, rate limit, strict validation).
	register_rest_route(
		$ns,
		'/book/check',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\public_check',
			'permission_callback' => '__return_true',
		)
	);
	register_rest_route(
		$ns,
		'/book',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\public_book',
			'permission_callback' => '__return_true',
		)
	);
}

/* -------------------------------------------------------------------------- */
/* Floor plan                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * GET /bookings/floor.
 *
 * @return \WP_REST_Response
 */
function get_floor() {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';

	$areas      = array();
	$area_terms = get_terms(
		array(
			'taxonomy'   => 'dk_area',
			'hide_empty' => false,
		)
	);
	if ( is_array( $area_terms ) ) {
		foreach ( $area_terms as $term ) {
			$areas[] = array(
				'id'   => (int) $term->term_id,
				'name' => $term->name,
			);
		}
	}

	return rest_ensure_response(
		array(
			'areas'  => $areas,
			'tables' => Availability\all_tables(),
			'combos' => Availability\all_combos(),
		)
	);
}

/**
 * Serialize a combo post.
 *
 * @param int $id Combo id.
 * @return array<string,mixed>
 */
function combo_response( $id ) {
	$post = get_post( $id );
	$ids  = array_filter( array_map( 'intval', explode( ',', (string) get_post_meta( $id, 'dk_combo_tables', true ) ) ) );
	return array(
		'id'       => (int) $id,
		'name'     => $post->post_title,
		'tables'   => array_values( $ids ),
		'min'      => (int) get_post_meta( $id, 'dk_combo_min', true ) ?: 2,
		'max'      => (int) get_post_meta( $id, 'dk_combo_max', true ) ?: 4,
		'priority' => (int) $post->menu_order,
	);
}

/**
 * Build a default combo name from its member tables, e.g. "T1 + T2".
 *
 * @param int[] $ids Table ids.
 * @return string
 */
function combo_name_from_tables( $ids ) {
	$names = array();
	foreach ( $ids as $id ) {
		$title = get_the_title( (int) $id );
		if ( $title ) {
			$names[] = $title;
		}
	}
	return $names ? implode( ' + ', $names ) : __( 'Combination', 'dinekit' );
}

/**
 * Apply combo fields from a request.
 *
 * @param int              $id      Combo id.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_combo_fields( $id, $request ) {
	$tables = $request->get_param( 'tables' );
	if ( null !== $tables && is_array( $tables ) ) {
		$ids = array_values( array_unique( array_filter( array_map( 'absint', $tables ) ) ) );
		update_post_meta( $id, 'dk_combo_tables', implode( ',', $ids ) );
		// Auto-name unless the caller supplied one.
		if ( null === $request->get_param( 'name' ) ) {
			wp_update_post(
				array(
					'ID'         => $id,
					'post_title' => combo_name_from_tables( $ids ),
				)
			);
		}
	}
	if ( null !== $request->get_param( 'name' ) ) {
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => sanitize_text_field( (string) $request->get_param( 'name' ) ),
			)
		);
	}
	foreach ( array( 'min' => 'dk_combo_min', 'max' => 'dk_combo_max' ) as $param => $meta ) {
		if ( null !== $request->get_param( $param ) ) {
			update_post_meta( $id, $meta, absint( $request->get_param( $param ) ) );
		}
	}
	if ( null !== $request->get_param( 'priority' ) ) {
		wp_update_post(
			array(
				'ID'         => $id,
				'menu_order' => (int) $request->get_param( 'priority' ),
			)
		);
	}
}

/**
 * POST /bookings/combos.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_combo( $request ) {
	$tables = array_values( array_unique( array_filter( array_map( 'absint', (array) $request->get_param( 'tables' ) ) ) ) );
	if ( count( $tables ) < 2 ) {
		return new \WP_Error( 'dinekit_combo_tables', __( 'A combination needs at least two tables.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$id = wp_insert_post(
		array(
			'post_type'   => 'dk_table_combo',
			'post_status' => 'publish',
			'post_title'  => combo_name_from_tables( $tables ),
			'menu_order'  => (int) $request->get_param( 'priority' ),
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	update_post_meta( $id, 'dk_combo_min', 2 );
	update_post_meta( $id, 'dk_combo_max', 4 );
	apply_combo_fields( $id, $request );
	return rest_ensure_response( combo_response( $id ) );
}

/**
 * PATCH /bookings/combos/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_combo( $request ) {
	$id = (int) $request['id'];
	apply_combo_fields( $id, $request );
	return rest_ensure_response( combo_response( $id ) );
}

/**
 * DELETE /bookings/combos/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_combo( $request ) {
	wp_delete_post( (int) $request['id'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * POST /bookings/areas.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_area( $request ) {
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	if ( '' === $name ) {
		return new \WP_Error( 'dinekit_area_name', __( 'A name is required.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$result = wp_insert_term( $name, 'dk_area' );
	if ( is_wp_error( $result ) ) {
		return $result;
	}
	$term = get_term( (int) $result['term_id'], 'dk_area' );
	return rest_ensure_response(
		array(
			'id'   => (int) $term->term_id,
			'name' => $term->name,
		)
	);
}

/**
 * PATCH /bookings/areas/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function update_area( $request ) {
	$id   = (int) $request['id'];
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$result = wp_update_term( $id, 'dk_area', array( 'name' => $name ) );
	if ( is_wp_error( $result ) ) {
		return $result;
	}
	$term = get_term( $id, 'dk_area' );
	return rest_ensure_response(
		array(
			'id'   => (int) $term->term_id,
			'name' => $term->name,
		)
	);
}

/**
 * DELETE /bookings/areas/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_area( $request ) {
	wp_delete_term( (int) $request['id'], 'dk_area' );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * Serialize a table post.
 *
 * @param int $id Table id.
 * @return array<string,mixed>
 */
function table_response( $id ) {
	$post  = get_post( $id );
	$seats = (int) get_post_meta( $id, 'dk_seats', true );
	$areas = get_the_terms( $post, 'dk_area' );
	$area  = ( is_array( $areas ) && $areas ) ? $areas[0] : null;
	$shape = (string) get_post_meta( $id, 'dk_shape', true );
	return array(
		'id'       => (int) $id,
		'name'     => $post->post_title,
		'seats'    => $seats ? $seats : 2,
		'min'      => (int) get_post_meta( $id, 'dk_min_party', true ) ?: 1,
		'max'      => (int) get_post_meta( $id, 'dk_max_party', true ) ?: ( $seats ? $seats : 2 ),
		'areaId'   => $area ? (int) $area->term_id : 0,
		'area'     => $area ? $area->name : '',
		'order'    => (int) $post->menu_order,
		'x'        => (int) get_post_meta( $id, 'dk_pos_x', true ),
		'y'        => (int) get_post_meta( $id, 'dk_pos_y', true ),
		'rotation' => (int) get_post_meta( $id, 'dk_rotation', true ),
		'shape'    => $shape ? $shape : 'round',
	);
}

/**
 * Apply table fields from a request.
 *
 * @param int              $id      Table id.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_table_fields( $id, $request ) {
	if ( null !== $request->get_param( 'name' ) ) {
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => sanitize_text_field( (string) $request->get_param( 'name' ) ),
			)
		);
	}
	$int_fields = array(
		'seats'    => 'dk_seats',
		'min'      => 'dk_min_party',
		'max'      => 'dk_max_party',
		'x'        => 'dk_pos_x',
		'y'        => 'dk_pos_y',
		'rotation' => 'dk_rotation',
	);
	foreach ( $int_fields as $param => $meta ) {
		if ( null !== $request->get_param( $param ) ) {
			update_post_meta( $id, $meta, absint( $request->get_param( $param ) ) );
		}
	}
	if ( null !== $request->get_param( 'shape' ) ) {
		update_post_meta( $id, 'dk_shape', sanitize_key( (string) $request->get_param( 'shape' ) ) );
	}
	if ( null !== $request->get_param( 'area' ) ) {
		$area = (int) $request->get_param( 'area' );
		wp_set_object_terms( $id, $area > 0 ? array( $area ) : array(), 'dk_area' );
	}
}

/**
 * POST /bookings/tables.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_table( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$id   = wp_insert_post(
		array(
			'post_type'   => 'dk_table',
			'post_status' => 'publish',
			'post_title'  => '' !== $name ? $name : __( 'Table', 'dinekit' ),
			'menu_order'  => (int) $request->get_param( 'order' ),
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	// Sensible defaults then overrides.
	update_post_meta( $id, 'dk_seats', 2 );
	update_post_meta( $id, 'dk_min_party', 1 );
	update_post_meta( $id, 'dk_max_party', 2 );
	apply_table_fields( $id, $request );
	return rest_ensure_response( table_response( $id ) );
}

/**
 * PATCH /bookings/tables/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_table( $request ) {
	$id = (int) $request['id'];
	apply_table_fields( $id, $request );
	return rest_ensure_response( table_response( $id ) );
}

/**
 * DELETE /bookings/tables/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_table( $request ) {
	wp_delete_post( (int) $request['id'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/* -------------------------------------------------------------------------- */
/* Availability + bookings                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /bookings/availability?date&time&party.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function get_availability( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';
	$date  = sanitize_text_field( (string) $request->get_param( 'date' ) );
	$time  = sanitize_text_field( (string) $request->get_param( 'time' ) );
	$party  = absint( $request->get_param( 'party' ) );
	$free   = Availability\available_tables( $date, $time, $party );
	$combos = Availability\available_combos( $date, $time, $party );
	return rest_ensure_response(
		array(
			'available' => ! empty( $free ) || ! empty( $combos ),
			'tables'    => $free,
			'combos'    => $combos,
		)
	);
}

/**
 * Serialize a booking.
 *
 * @param int $id Booking id.
 * @return array<string,mixed>
 */
function booking_response( $id ) {
	$table_id = (int) get_post_meta( $id, 'dk_table_id', true );
	$combo_id = (int) get_post_meta( $id, 'dk_combo_id', true );
	return array(
		'id'      => (int) $id,
		'date'    => (string) get_post_meta( $id, 'dk_date', true ),
		'time'    => (string) get_post_meta( $id, 'dk_time', true ),
		'party'   => (int) get_post_meta( $id, 'dk_party', true ),
		'tableId' => $table_id,
		'comboId' => $combo_id,
		'table'   => $combo_id ? get_the_title( $combo_id ) : ( $table_id ? get_the_title( $table_id ) : '' ),
		'name'    => (string) get_post_meta( $id, 'dk_name', true ),
		'email'   => (string) get_post_meta( $id, 'dk_email', true ),
		'phone'   => (string) get_post_meta( $id, 'dk_phone', true ),
		'notes'   => (string) get_post_meta( $id, 'dk_notes', true ),
		'status'  => (string) get_post_meta( $id, 'dk_status', true ),
		'source'  => (string) get_post_meta( $id, 'dk_source', true ),
	);
}

/**
 * GET /bookings/list?from&to&status.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function list_bookings( $request ) {
	$from = sanitize_text_field( (string) $request->get_param( 'from' ) );
	$to   = sanitize_text_field( (string) $request->get_param( 'to' ) );

	$meta_query = array();
	if ( $from && $to ) {
		$meta_query[] = array(
			'key'     => 'dk_date',
			'value'   => array( $from, $to ),
			'compare' => 'BETWEEN',
			'type'    => 'DATE',
		);
	} elseif ( $from ) {
		$meta_query[] = array(
			'key'   => 'dk_date',
			'value' => $from,
		);
	}

	$query = new \WP_Query(
		array(
			'post_type'      => 'dk_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'meta_query'     => $meta_query, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
		)
	);

	$bookings = array();
	foreach ( $query->posts as $post ) {
		$bookings[] = booking_response( $post->ID );
	}
	// Sort by date then time.
	usort(
		$bookings,
		function ( $a, $b ) {
			return strcmp( $a['date'] . $a['time'], $b['date'] . $b['time'] );
		}
	);
	return rest_ensure_response( $bookings );
}

/**
 * POST /bookings — create (admin manual entry).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_booking( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';

	$date  = sanitize_text_field( (string) $request->get_param( 'date' ) );
	$time  = sanitize_text_field( (string) $request->get_param( 'time' ) );
	$party = max( 1, absint( $request->get_param( 'party' ) ) );
	$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );

	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) || ! preg_match( '/^\d{1,2}:\d{2}$/', $time ) ) {
		return new \WP_Error( 'dinekit_booking_when', __( 'A valid date and time are required.', 'dinekit' ), array( 'status' => 400 ) );
	}

	// Table/combo: explicit, or auto-assign — prefer a single table that fits,
	// fall back to a table combination for larger parties.
	$table_id = (int) $request->get_param( 'tableId' );
	$combo_id = (int) $request->get_param( 'comboId' );
	if ( ! $table_id && ! $combo_id ) {
		$free = Availability\available_tables( $date, $time, $party );
		if ( $free ) {
			$table_id = (int) $free[0]['id'];
		} else {
			$combos   = Availability\available_combos( $date, $time, $party );
			$combo_id = $combos ? (int) $combos[0]['id'] : 0;
		}
	}

	$status = (string) $request->get_param( 'status' );
	if ( ! array_key_exists( $status, Bookings\statuses() ) ) {
		$status = 'confirmed';
	}

	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dk_booking',
			'post_status' => 'publish',
			'post_title'  => sprintf( '%s — %s %s (%dp)', $name ? $name : __( 'Booking', 'dinekit' ), $date, $time, $party ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	update_post_meta( $post_id, 'dk_date', $date );
	update_post_meta( $post_id, 'dk_time', $time );
	update_post_meta( $post_id, 'dk_party', $party );
	update_post_meta( $post_id, 'dk_table_id', $table_id );
	update_post_meta( $post_id, 'dk_combo_id', $combo_id );
	update_post_meta( $post_id, 'dk_name', $name );
	update_post_meta( $post_id, 'dk_email', sanitize_email( (string) $request->get_param( 'email' ) ) );
	update_post_meta( $post_id, 'dk_phone', sanitize_text_field( (string) $request->get_param( 'phone' ) ) );
	update_post_meta( $post_id, 'dk_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dk_status', $status );
	update_post_meta( $post_id, 'dk_source', 'admin' );

	require_once DINEKIT_DIR . 'includes/bookings/emails.php';
	\DineKit\Bookings\Emails\new_booking( $post_id, false );

	return rest_ensure_response( booking_response( $post_id ) );
}

/**
 * PATCH /bookings/:id — update fields/status/table.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_booking( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';
	$id  = (int) $request['id'];
	$map = array(
		'date'    => 'dk_date',
		'time'    => 'dk_time',
		'party'   => 'dk_party',
		'tableId' => 'dk_table_id',
		'comboId' => 'dk_combo_id',
		'name'    => 'dk_name',
		'email'   => 'dk_email',
		'phone'   => 'dk_phone',
		'notes'   => 'dk_notes',
		'status'  => 'dk_status',
	);
	$old_status = (string) get_post_meta( $id, 'dk_status', true );
	$new_status = $old_status;

	foreach ( $map as $param => $meta ) {
		$value = $request->get_param( $param );
		if ( null === $value ) {
			continue;
		}
		if ( in_array( $param, array( 'party', 'tableId', 'comboId' ), true ) ) {
			update_post_meta( $id, $meta, absint( $value ) );
		} elseif ( 'email' === $param ) {
			update_post_meta( $id, $meta, sanitize_email( (string) $value ) );
		} elseif ( 'status' === $param && array_key_exists( (string) $value, Bookings\statuses() ) ) {
			update_post_meta( $id, $meta, (string) $value );
			$new_status = (string) $value;
		} elseif ( ! in_array( $param, array( 'status' ), true ) ) {
			update_post_meta( $id, $meta, sanitize_text_field( (string) $value ) );
		}
	}

	// Email the diner when a booking is freshly confirmed or cancelled.
	if ( $new_status !== $old_status && in_array( $new_status, array( 'confirmed', 'cancelled' ), true ) ) {
		require_once DINEKIT_DIR . 'includes/bookings/emails.php';
		\DineKit\Bookings\Emails\status_changed( $id, $new_status );
	}

	return rest_ensure_response( booking_response( $id ) );
}

/**
 * DELETE /bookings/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_booking( $request ) {
	wp_delete_post( (int) $request['id'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/* -------------------------------------------------------------------------- */
/* Guest CRM (admin)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a comma-separated list of allergen/dietary term ids to their names.
 *
 * @param string $csv      Comma ids.
 * @param string $taxonomy Taxonomy.
 * @return string[]
 */
function term_names( $csv, $taxonomy ) {
	$names = array();
	foreach ( array_filter( array_map( 'intval', explode( ',', (string) $csv ) ) ) as $id ) {
		$term = get_term( $id, $taxonomy );
		if ( $term && ! is_wp_error( $term ) ) {
			$names[] = $term->name;
		}
	}
	return $names;
}

/**
 * GET /guests — a directory of diners aggregated from bookings + event
 * pre-orders (keyed by email, or name when no email), with visit counts and
 * their accumulated allergies/dietary needs.
 *
 * @return \WP_REST_Response
 */
function list_guests() {
	$map = array();
	$key = static function ( $email, $name ) {
		$email = strtolower( trim( (string) $email ) );
		return '' !== $email ? 'e:' . $email : 'n:' . strtolower( trim( (string) $name ) );
	};
	$blank = static function ( $name, $email ) {
		return array(
			'name'      => $name,
			'email'     => $email,
			'phone'     => '',
			'visits'    => 0,
			'cancelled' => 0,
			'dates'     => array(),
			'allergens' => array(),
			'dietary'   => array(),
		);
	};

	// Bookings.
	$bookings = get_posts(
		array(
			'post_type'      => 'dk_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 2000,
			'no_found_rows'  => true,
		)
	);
	foreach ( $bookings as $post ) {
		$email = (string) get_post_meta( $post->ID, 'dk_email', true );
		$name  = (string) get_post_meta( $post->ID, 'dk_name', true );
		if ( '' === trim( $email ) && '' === trim( $name ) ) {
			continue;
		}
		$k = $key( $email, $name );
		if ( ! isset( $map[ $k ] ) ) {
			$map[ $k ] = $blank( $name, strtolower( trim( $email ) ) );
		}
		$status = (string) get_post_meta( $post->ID, 'dk_status', true );
		if ( in_array( $status, array( 'cancelled', 'no_show' ), true ) ) {
			++$map[ $k ]['cancelled'];
		} else {
			++$map[ $k ]['visits'];
			$date = (string) get_post_meta( $post->ID, 'dk_date', true );
			if ( '' !== $date ) {
				$map[ $k ]['dates'][] = $date;
			}
		}
		if ( '' !== $name ) {
			$map[ $k ]['name'] = $name;
		}
		$phone = (string) get_post_meta( $post->ID, 'dk_phone', true );
		if ( '' !== $phone ) {
			$map[ $k ]['phone'] = $phone;
		}
	}

	// Event guests — merge their allergen/dietary flags.
	$guests = get_posts(
		array(
			'post_type'      => 'dk_guest',
			'post_status'    => 'publish',
			'posts_per_page' => 2000,
			'no_found_rows'  => true,
		)
	);
	foreach ( $guests as $g ) {
		$email = (string) get_post_meta( $g->ID, 'dk_guest_email', true );
		$name  = $g->post_title;
		$k     = $key( $email, $name );
		if ( ! isset( $map[ $k ] ) ) {
			$map[ $k ] = $blank( $name, strtolower( trim( $email ) ) );
		}
		foreach ( term_names( get_post_meta( $g->ID, 'dk_guest_allergens', true ), 'dk_allergen' ) as $a ) {
			$map[ $k ]['allergens'][ $a ] = true;
		}
		foreach ( term_names( get_post_meta( $g->ID, 'dk_guest_dietary', true ), 'dk_dietary' ) as $d ) {
			$map[ $k ]['dietary'][ $d ] = true;
		}
	}

	$today = current_time( 'Y-m-d' );
	$out   = array();
	foreach ( $map as $p ) {
		sort( $p['dates'] );
		$last = '';
		$next = '';
		foreach ( $p['dates'] as $d ) {
			if ( $d < $today ) {
				$last = $d;
			} elseif ( '' === $next ) {
				$next = $d;
			}
		}
		$out[] = array(
			'name'      => $p['name'],
			'email'     => $p['email'],
			'phone'     => $p['phone'],
			'visits'    => $p['visits'],
			'cancelled' => $p['cancelled'],
			'lastVisit' => $last,
			'nextVisit' => $next,
			'allergens' => array_keys( $p['allergens'] ),
			'dietary'   => array_keys( $p['dietary'] ),
		);
	}
	usort(
		$out,
		static function ( $a, $b ) {
			return $b['visits'] <=> $a['visits'];
		}
	);
	return rest_ensure_response( $out );
}

/* -------------------------------------------------------------------------- */
/* Booking settings (admin)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /bookings/settings.
 *
 * @return \WP_REST_Response
 */
function get_settings() {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	return rest_ensure_response( \DineKit\Bookings\Settings\get() );
}

/**
 * POST /bookings/settings.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_settings( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	return rest_ensure_response( \DineKit\Bookings\Settings\save( (array) $request->get_json_params() ) );
}

/* -------------------------------------------------------------------------- */
/* Public (diner-facing) booking                                              */
/* -------------------------------------------------------------------------- */

/**
 * Validate a requested date/time/party against the booking rules.
 *
 * @param string               $date  Y-m-d.
 * @param string               $time  H:i.
 * @param int                  $party Party size.
 * @param array<string,mixed>  $cfg   Booking settings.
 * @return string Empty string if valid, else a short reason code.
 */
function validate_when( $date, $time, $party, $cfg ) {
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) || ! preg_match( '/^\d{1,2}:\d{2}$/', $time ) ) {
		return 'invalid';
	}
	if ( $party < 1 || $party > (int) $cfg['max_party'] ) {
		return 'party';
	}
	$ts = strtotime( $date . ' ' . $time . ':00' );
	if ( ! $ts ) {
		return 'invalid';
	}
	$now = (int) current_time( 'timestamp' );
	if ( $ts < $now + (int) $cfg['min_notice'] * HOUR_IN_SECONDS ) {
		return 'notice';
	}
	if ( $ts > $now + (int) $cfg['max_days_ahead'] * DAY_IN_SECONDS ) {
		return 'toofar';
	}
	return '';
}

/**
 * GET /book/check — is a slot available for a party? (No table details leaked.)
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function public_check( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$cfg   = \DineKit\Bookings\Settings\get();
	$date  = sanitize_text_field( (string) $request->get_param( 'date' ) );
	$time  = sanitize_text_field( (string) $request->get_param( 'time' ) );
	$party = absint( $request->get_param( 'party' ) );

	$reason = validate_when( $date, $time, $party, $cfg );
	if ( '' !== $reason ) {
		return rest_ensure_response( array( 'available' => false, 'reason' => $reason ) );
	}

	$free      = Availability\available_tables( $date, $time, $party );
	$combos    = Availability\available_combos( $date, $time, $party );
	$available = ! empty( $free ) || ! empty( $combos );

	// Kitchen pacing: even if tables are free, the hour may be at its covers cap.
	if ( $available && ! Availability\within_hour_capacity( $date, $time, $party, (int) $cfg['covers_per_hour'] ) ) {
		$available = false;
	}

	return rest_ensure_response(
		array(
			'available' => $available,
			'deposit'   => \DineKit\Bookings\Settings\needs_deposit( $party ),
			// Full, but the guest can still be penciled in on the waitlist.
			'waitlist'  => ! $available && ! empty( $cfg['allow_waitlist'] ),
		)
	);
}

/**
 * POST /book — create a booking request from a diner.
 *
 * Public by design; guarded by a honeypot, per-IP rate limiting and strict
 * server-side validation + availability checks.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function public_book( $request ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$cfg = \DineKit\Bookings\Settings\get();

	if ( empty( $cfg['online_enabled'] ) ) {
		return new \WP_Error( 'dinekit_booking_off', __( 'Online booking is currently closed.', 'dinekit' ), array( 'status' => 403 ) );
	}

	// Honeypot: a filled hidden field means a bot — look successful, create nothing.
	if ( '' !== trim( (string) $request->get_param( 'hp' ) ) ) {
		return rest_ensure_response( array( 'ok' => true, 'status' => 'pending', 'message' => __( 'Thanks!', 'dinekit' ) ) );
	}

	// Per-IP rate limit.
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'na';
	$rl   = 'dinekit_book_rl_' . md5( $ip );
	$hits = (int) get_transient( $rl );
	if ( $hits >= 6 ) {
		return new \WP_Error( 'dinekit_booking_rl', __( 'Too many attempts — please try again a little later.', 'dinekit' ), array( 'status' => 429 ) );
	}
	set_transient( $rl, $hits + 1, HOUR_IN_SECONDS );

	$date  = sanitize_text_field( (string) $request->get_param( 'date' ) );
	$time  = sanitize_text_field( (string) $request->get_param( 'time' ) );
	$party = absint( $request->get_param( 'party' ) );
	$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$email = sanitize_email( (string) $request->get_param( 'email' ) );
	$phone = sanitize_text_field( (string) $request->get_param( 'phone' ) );
	$notes = sanitize_textarea_field( (string) $request->get_param( 'notes' ) );

	if ( '' !== validate_when( $date, $time, $party, $cfg ) ) {
		return new \WP_Error( 'dinekit_booking_when', __( 'Please choose a valid date, time and party size.', 'dinekit' ), array( 'status' => 400 ) );
	}
	if ( '' === $name || ! is_email( $email ) ) {
		return new \WP_Error( 'dinekit_booking_who', __( 'Please enter your name and a valid email address.', 'dinekit' ), array( 'status' => 400 ) );
	}

	// Is the slot full — over the covers cap, or no table/combo fits? If so and
	// a waitlist is allowed, pencil the guest in (provisional, no table) rather
	// than turning them away.
	$over_capacity = ! Availability\within_hour_capacity( $date, $time, $party, (int) $cfg['covers_per_hour'] );
	$table_id      = 0;
	$combo_id      = 0;
	if ( ! $over_capacity ) {
		$free     = Availability\available_tables( $date, $time, $party );
		$table_id = $free ? (int) $free[0]['id'] : 0;
		if ( ! $table_id ) {
			$combos   = Availability\available_combos( $date, $time, $party );
			$combo_id = $combos ? (int) $combos[0]['id'] : 0;
		}
	}

	$full       = $over_capacity || ( ! $table_id && ! $combo_id );
	$waitlisted = false;
	if ( $full ) {
		if ( empty( $cfg['allow_waitlist'] ) ) {
			return new \WP_Error( 'dinekit_booking_full', __( 'Sorry, we’re fully booked at that time. Please try another time.', 'dinekit' ), array( 'status' => 409 ) );
		}
		$waitlisted = true;
		$status     = 'provisional';
	} else {
		$status = ! empty( $cfg['auto_confirm'] ) ? 'confirmed' : 'pending';
	}
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dk_booking',
			'post_status' => 'publish',
			'post_title'  => sprintf( '%s — %s %s (%dp)', $name, $date, $time, $party ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return new \WP_Error( 'dinekit_booking_save', __( 'Could not save your booking. Please try again.', 'dinekit' ), array( 'status' => 500 ) );
	}

	update_post_meta( $post_id, 'dk_date', $date );
	update_post_meta( $post_id, 'dk_time', $time );
	update_post_meta( $post_id, 'dk_party', $party );
	update_post_meta( $post_id, 'dk_table_id', $table_id );
	update_post_meta( $post_id, 'dk_combo_id', $combo_id );
	update_post_meta( $post_id, 'dk_name', $name );
	update_post_meta( $post_id, 'dk_email', $email );
	update_post_meta( $post_id, 'dk_phone', $phone );
	update_post_meta( $post_id, 'dk_notes', $notes );
	update_post_meta( $post_id, 'dk_status', $status );
	update_post_meta( $post_id, 'dk_source', 'online' );
	if ( \DineKit\Bookings\Settings\needs_deposit( $party ) ) {
		update_post_meta( $post_id, 'dk_deposit_required', 1 );
	}

	require_once DINEKIT_DIR . 'includes/bookings/emails.php';
	\DineKit\Bookings\Emails\new_booking( $post_id );

	if ( $waitlisted ) {
		$message = __( 'You’re on the waitlist — we’ll be in touch if a table frees up.', 'dinekit' );
	} elseif ( 'confirmed' === $status ) {
		$message = __( 'Your table is booked — see you then!', 'dinekit' );
	} else {
		$message = __( 'Thanks! Your booking request has been sent — we’ll confirm shortly.', 'dinekit' );
	}

	return rest_ensure_response(
		array(
			'ok'       => true,
			'status'   => $status,
			'waitlist' => $waitlisted,
			'deposit'  => \DineKit\Bookings\Settings\needs_deposit( $party ),
			'message'  => $message,
		)
	);
}
