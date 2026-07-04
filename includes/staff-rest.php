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
