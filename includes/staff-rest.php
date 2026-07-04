<?php
/**
 * Staff & labour REST API (people; shifts + leave added by later slices).
 *
 * @package DineKit
 */

namespace DineKit\Staff\Rest;

use DineKit\Staff;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const COLORS = array( '#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#0284c7', '#65a30d', '#c026d3' );

/**
 * Hook routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Register routes.
 *
 * @return void
 */
function register_routes() {
	$ns   = 'dinekit/v1';
	$perm = 'DineKit\\Staff\\can_manage';

	register_rest_route(
		$ns,
		'/staff',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\list_staff',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\create_staff',
				'permission_callback' => $perm,
			),
		)
	);
	register_rest_route(
		$ns,
		'/staff/settings',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_settings',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\save_settings',
				'permission_callback' => $perm,
			),
		)
	);
	register_rest_route(
		$ns,
		'/staff/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_staff',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_staff',
				'permission_callback' => $perm,
			),
		)
	);

	// Rota / shifts.
	register_rest_route(
		$ns,
		'/shifts',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\list_shifts',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\create_shift',
				'permission_callback' => $perm,
			),
		)
	);
	register_rest_route(
		$ns,
		'/shifts/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_shift',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_shift',
				'permission_callback' => $perm,
			),
		)
	);

	register_rest_route(
		$ns,
		'/staff/ops',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_ops',
			'permission_callback' => $perm,
		)
	);

	// Holiday / leave.
	register_rest_route(
		$ns,
		'/leave',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\list_leave',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\create_leave',
				'permission_callback' => $perm,
			),
		)
	);
	register_rest_route(
		$ns,
		'/leave/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_leave',
				'permission_callback' => $perm,
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_leave',
				'permission_callback' => $perm,
			),
		)
	);
}

/**
 * Inclusive whole-day count between two Y-m-d dates.
 *
 * @param string $from Y-m-d.
 * @param string $to   Y-m-d.
 * @return float
 */
function day_span( $from, $to ) {
	$a = strtotime( $from . ' 00:00:00' );
	$b = strtotime( $to . ' 00:00:00' );
	if ( ! $a || ! $b || $b < $a ) {
		return 0.0;
	}
	return (float) ( floor( ( $b - $a ) / DAY_IN_SECONDS ) + 1 );
}

/**
 * Serialize a leave request.
 *
 * @param int $id Leave id.
 * @return array<string,mixed>
 */
function leave_response( $id ) {
	$staff_id = (int) get_post_meta( $id, 'dk_leave_staff', true );
	$status   = (string) get_post_meta( $id, 'dk_leave_status', true );
	return array(
		'id'      => (int) $id,
		'staffId' => $staff_id,
		'from'    => (string) get_post_meta( $id, 'dk_leave_from', true ),
		'to'      => (string) get_post_meta( $id, 'dk_leave_to', true ),
		'days'    => (float) get_post_meta( $id, 'dk_leave_days', true ),
		'status'  => '' !== $status ? $status : 'pending',
		'note'    => (string) get_post_meta( $id, 'dk_leave_note', true ),
	);
}

/**
 * GET /leave — all requests (newest first) + per-member balances for this year.
 *
 * @return \WP_REST_Response
 */
function list_leave() {
	require_once DINEKIT_DIR . 'includes/staff.php';
	$posts    = get_posts(
		array(
			'post_type'      => 'dk_leave',
			'post_status'    => 'publish',
			'posts_per_page' => 1000, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- bounded team leave.
			'no_found_rows'  => true,
			'fields'         => 'ids',
		)
	);
	$requests = array_map( __NAMESPACE__ . '\\leave_response', $posts );
	usort(
		$requests,
		static function ( $a, $b ) {
			return strcmp( $b['from'], $a['from'] );
		}
	);

	// Balances: allowance (dk_holiday) minus approved days taken this year.
	$year     = (int) gmdate( 'Y' );
	$balances = array();
	foreach ( Staff\all_staff() as $post ) {
		$allowance = (int) get_post_meta( $post->ID, 'dk_holiday', true );
		$taken     = 0.0;
		foreach ( $requests as $r ) {
			if ( $r['staffId'] === (int) $post->ID && 'approved' === $r['status'] && (int) substr( $r['from'], 0, 4 ) === $year ) {
				$taken += $r['days'];
			}
		}
		$balances[ (int) $post->ID ] = array(
			'allowance' => $allowance,
			'taken'     => $taken,
			'remaining' => round( $allowance - $taken, 2 ),
		);
	}

	return rest_ensure_response(
		array(
			'requests' => $requests,
			'balances' => $balances,
		)
	);
}

/**
 * Apply leave fields.
 *
 * @param int              $id      Leave id.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_leave_fields( $id, $request ) {
	if ( null !== $request->get_param( 'staffId' ) ) {
		update_post_meta( $id, 'dk_leave_staff', absint( $request->get_param( 'staffId' ) ) );
	}
	foreach ( array(
		'from' => 'dk_leave_from',
		'to'   => 'dk_leave_to',
		'note' => 'dk_leave_note',
	) as $param => $key ) {
		if ( null !== $request->get_param( $param ) ) {
			update_post_meta( $id, $key, sanitize_text_field( (string) $request->get_param( $param ) ) );
		}
	}
	if ( null !== $request->get_param( 'status' ) ) {
		$status = sanitize_key( (string) $request->get_param( 'status' ) );
		update_post_meta( $id, 'dk_leave_status', in_array( $status, array( 'pending', 'approved', 'denied' ), true ) ? $status : 'pending' );
	}
	// Days: explicit value wins (half-days), else derive from the date span.
	if ( null !== $request->get_param( 'days' ) ) {
		update_post_meta( $id, 'dk_leave_days', number_format( max( 0, (float) $request->get_param( 'days' ) ), 2, '.', '' ) );
	} else {
		$from = (string) get_post_meta( $id, 'dk_leave_from', true );
		$to   = (string) get_post_meta( $id, 'dk_leave_to', true );
		if ( '' !== $from && '' !== $to ) {
			update_post_meta( $id, 'dk_leave_days', number_format( day_span( $from, $to ), 2, '.', '' ) );
		}
	}
}

/**
 * POST /leave.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_leave( $request ) {
	$id = wp_insert_post(
		array(
			'post_type'   => 'dk_leave',
			'post_status' => 'publish',
			'post_title'  => 'leave',
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	update_post_meta( $id, 'dk_leave_status', 'pending' );
	apply_leave_fields( $id, $request );
	return rest_ensure_response( leave_response( $id ) );
}

/**
 * PATCH /leave/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_leave( $request ) {
	$id = (int) $request['id'];
	apply_leave_fields( $id, $request );
	return rest_ensure_response( leave_response( $id ) );
}

/**
 * DELETE /leave/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_leave( $request ) {
	wp_delete_post( (int) $request['id'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * Minutes past midnight for "H:i".
 *
 * @param string $t Time.
 * @return int
 */
function to_min( $t ) {
	return preg_match( '/^(\d{1,2}):(\d{2})$/', (string) $t, $m ) ? (int) $m[1] * 60 + (int) $m[2] : 0;
}

/**
 * Serialize a shift, with computed hours + labour cost from the member's rate.
 *
 * @param int $id Shift id.
 * @return array<string,mixed>
 */
function shift_response( $id ) {
	$staff_id = (int) get_post_meta( $id, 'dk_shift_staff', true );
	$start    = (string) get_post_meta( $id, 'dk_shift_start', true );
	$end      = (string) get_post_meta( $id, 'dk_shift_end', true );
	$mins     = to_min( $end ) - to_min( $start );
	if ( $mins <= 0 ) {
		$mins += 1440; // Over-midnight shift.
	}
	$hours = round( $mins / 60, 2 );
	$rate  = (float) get_post_meta( $staff_id, 'dk_rate', true );
	return array(
		'id'      => (int) $id,
		'staffId' => $staff_id,
		'date'    => (string) get_post_meta( $id, 'dk_shift_date', true ),
		'start'   => $start,
		'end'     => $end,
		'role'    => (string) get_post_meta( $id, 'dk_shift_role', true ),
		'note'    => (string) get_post_meta( $id, 'dk_shift_note', true ),
		'hours'   => $hours,
		'cost'    => round( $hours * $rate, 2 ),
	);
}

/**
 * GET /shifts?from&to — shifts within a date range (inclusive).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function list_shifts( $request ) {
	$from = sanitize_text_field( (string) $request->get_param( 'from' ) );
	$to   = sanitize_text_field( (string) $request->get_param( 'to' ) );
	$meta = array();
	if ( $from && $to ) {
		$meta[] = array(
			'key'     => 'dk_shift_date',
			'value'   => array( $from, $to ),
			'compare' => 'BETWEEN',
			'type'    => 'DATE',
		);
	}
	$posts = get_posts(
		array(
			'post_type'      => 'dk_shift',
			'post_status'    => 'publish',
			'posts_per_page' => 1000, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- one week of a venue's shifts.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => $meta, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
		)
	);
	return rest_ensure_response( array_map( __NAMESPACE__ . '\\shift_response', $posts ) );
}

/**
 * Apply shift fields.
 *
 * @param int              $id      Shift id.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_shift_fields( $id, $request ) {
	if ( null !== $request->get_param( 'staffId' ) ) {
		update_post_meta( $id, 'dk_shift_staff', absint( $request->get_param( 'staffId' ) ) );
	}
	foreach ( array(
		'date'  => 'dk_shift_date',
		'start' => 'dk_shift_start',
		'end'   => 'dk_shift_end',
		'role'  => 'dk_shift_role',
		'note'  => 'dk_shift_note',
	) as $param => $key ) {
		if ( null !== $request->get_param( $param ) ) {
			update_post_meta( $id, $key, sanitize_text_field( (string) $request->get_param( $param ) ) );
		}
	}
}

/**
 * POST /shifts.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_shift( $request ) {
	$id = wp_insert_post(
		array(
			'post_type'   => 'dk_shift',
			'post_status' => 'publish',
			'post_title'  => 'shift',
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	apply_shift_fields( $id, $request );
	return rest_ensure_response( shift_response( $id ) );
}

/**
 * PATCH /shifts/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_shift( $request ) {
	$id = (int) $request['id'];
	apply_shift_fields( $id, $request );
	return rest_ensure_response( shift_response( $id ) );
}

/**
 * DELETE /shifts/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_shift( $request ) {
	wp_delete_post( (int) $request['id'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * Serialize a staff member.
 *
 * @param int $id Staff id.
 * @return array<string,mixed>
 */
function staff_response( $id ) {
	$post  = get_post( $id );
	$role  = (string) get_post_meta( $id, 'dk_role', true );
	$area  = (string) get_post_meta( $id, 'dk_area', true );
	$color = (string) get_post_meta( $id, 'dk_color', true );
	return array(
		'id'      => (int) $id,
		'name'    => $post->post_title,
		'role'    => '' !== $role ? $role : 'server',
		'area'    => '' !== $area ? $area : 'foh',
		'email'   => (string) get_post_meta( $id, 'dk_email', true ),
		'phone'   => (string) get_post_meta( $id, 'dk_phone', true ),
		'rate'    => (string) get_post_meta( $id, 'dk_rate', true ),
		'holiday' => (int) get_post_meta( $id, 'dk_holiday', true ),
		'color'   => '' !== $color ? $color : '#4f46e5',
		'active'  => '0' !== (string) get_post_meta( $id, 'dk_active', true ),
	);
}

/**
 * GET /staff.
 *
 * @return \WP_REST_Response
 */
function list_staff() {
	require_once DINEKIT_DIR . 'includes/staff.php';
	$out = array();
	foreach ( Staff\all_staff() as $post ) {
		$out[] = staff_response( $post->ID );
	}
	return rest_ensure_response( $out );
}

/**
 * Apply staff fields from a request.
 *
 * @param int              $id      Staff id.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_staff_fields( $id, $request ) {
	require_once DINEKIT_DIR . 'includes/staff.php';
	if ( null !== $request->get_param( 'name' ) ) {
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => sanitize_text_field( (string) $request->get_param( 'name' ) ),
			)
		);
	}
	$role_keys = wp_list_pluck( Staff\roles(), 'key' );
	if ( null !== $request->get_param( 'role' ) ) {
		$role = sanitize_key( (string) $request->get_param( 'role' ) );
		if ( in_array( $role, $role_keys, true ) ) {
			update_post_meta( $id, 'dk_role', $role );
			// Keep area sensible unless explicitly overridden below.
			if ( null === $request->get_param( 'area' ) ) {
				update_post_meta( $id, 'dk_area', Staff\area_for_role( $role ) );
			}
		}
	}
	if ( null !== $request->get_param( 'area' ) ) {
		$area = sanitize_key( (string) $request->get_param( 'area' ) );
		update_post_meta( $id, 'dk_area', in_array( $area, array( 'foh', 'boh', 'both' ), true ) ? $area : 'both' );
	}
	if ( null !== $request->get_param( 'email' ) ) {
		update_post_meta( $id, 'dk_email', sanitize_email( (string) $request->get_param( 'email' ) ) );
	}
	if ( null !== $request->get_param( 'phone' ) ) {
		update_post_meta( $id, 'dk_phone', sanitize_text_field( (string) $request->get_param( 'phone' ) ) );
	}
	if ( null !== $request->get_param( 'rate' ) ) {
		update_post_meta( $id, 'dk_rate', number_format( max( 0, (float) $request->get_param( 'rate' ) ), 2, '.', '' ) );
	}
	if ( null !== $request->get_param( 'holiday' ) ) {
		update_post_meta( $id, 'dk_holiday', max( 0, min( 60, absint( $request->get_param( 'holiday' ) ) ) ) );
	}
	if ( null !== $request->get_param( 'color' ) && preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $request->get_param( 'color' ) ) ) {
		update_post_meta( $id, 'dk_color', strtolower( (string) $request->get_param( 'color' ) ) );
	}
	if ( null !== $request->get_param( 'active' ) ) {
		update_post_meta( $id, 'dk_active', $request->get_param( 'active' ) ? 1 : 0 );
	}
}

/**
 * POST /staff.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_staff( $request ) {
	require_once DINEKIT_DIR . 'includes/staff.php';
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$id   = wp_insert_post(
		array(
			'post_type'   => 'dk_staff',
			'post_status' => 'publish',
			'post_title'  => '' !== $name ? $name : __( 'New team member', 'dinekit' ),
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	// Sensible defaults, then apply request overrides.
	update_post_meta( $id, 'dk_role', 'server' );
	update_post_meta( $id, 'dk_area', 'foh' );
	update_post_meta( $id, 'dk_holiday', 28 );
	update_post_meta( $id, 'dk_active', 1 );
	update_post_meta( $id, 'dk_color', COLORS[ count( Staff\all_staff() ) % count( COLORS ) ] );
	apply_staff_fields( $id, $request );
	return rest_ensure_response( staff_response( $id ) );
}

/**
 * PATCH /staff/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_staff( $request ) {
	$id = (int) $request['id'];
	apply_staff_fields( $id, $request );
	return rest_ensure_response( staff_response( $id ) );
}

/**
 * DELETE /staff/:id (and its shifts + leave).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_staff( $request ) {
	$id = (int) $request['id'];
	foreach ( array(
		'dk_shift' => 'dk_shift_staff',
		'dk_leave' => 'dk_leave_staff',
	) as $type => $key ) {
		$rows = get_posts(
			array(
				'post_type'      => $type,
				'post_status'    => 'publish',
				'posts_per_page' => 500, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- clean up all of one member's rows.
				'no_found_rows'  => true,
				'fields'         => 'ids',
				'meta_key'       => $key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		foreach ( $rows as $row ) {
			wp_delete_post( $row, true );
		}
	}
	wp_delete_post( $id, true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * GET /staff/ops?date — the operations snapshot for a day.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function get_ops( $request ) {
	require_once DINEKIT_DIR . 'includes/staff.php';
	$date = sanitize_text_field( (string) $request->get_param( 'date' ) );
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
		$date = current_time( 'Y-m-d' );
	}
	return rest_ensure_response( Staff\ops( $date ) );
}

/**
 * GET /staff/settings — labour settings + role catalogue.
 *
 * @return \WP_REST_Response
 */
function get_settings() {
	require_once DINEKIT_DIR . 'includes/staff.php';
	return rest_ensure_response(
		array_merge(
			Staff\settings(),
			array( 'roles' => Staff\roles() )
		)
	);
}

/**
 * POST /staff/settings.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_settings( $request ) {
	require_once DINEKIT_DIR . 'includes/staff.php';
	return rest_ensure_response( Staff\save_settings( (array) $request->get_json_params() ) );
}
