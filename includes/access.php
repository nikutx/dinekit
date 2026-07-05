<?php
/**
 * Access control — a role → permission matrix for DineKit. Full WordPress admins
 * (manage_options) always have every permission; other users get permissions via
 * the DineKit role of the staff record linked to their WP account (see the staff
 * logins feature). Stored in one option, no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Access;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION     = 'dinekit_access';
const STAFF_ROLE = 'dinekit_staff';
const PAGE_CAP   = 'dinekit_access';

/**
 * Boot the REST routes + the capability filter.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
	// Grant the DineKit page capability to existing admin/editor users
	// dynamically, so switching the menu to a custom cap regresses nobody and
	// we never have to write caps onto the built-in roles.
	add_filter( 'user_has_cap', __NAMESPACE__ . '\\grant_page_cap' );
}

/**
 * Dynamically grant the DineKit page capability to full admins and editors
 * (who could already reach the menu via edit_others_posts). Staff accounts get
 * it from their dedicated role instead.
 *
 * @param array<string,bool> $allcaps The user's capabilities.
 * @return array<string,bool>
 */
function grant_page_cap( $allcaps ) {
	if ( ! empty( $allcaps['manage_options'] ) || ! empty( $allcaps['edit_others_posts'] ) ) {
		$allcaps[ PAGE_CAP ] = true;
	}
	return $allcaps;
}

/**
 * Ensure the minimal "DineKit Staff" WP role exists (wp-admin access limited to
 * the DineKit screen). Idempotent — safe to call on activation + upgrade.
 *
 * @return void
 */
function ensure_roles() {
	$role = get_role( STAFF_ROLE );
	if ( ! $role ) {
		add_role(
			STAFF_ROLE,
			__( 'DineKit Staff', 'dinekit' ),
			array(
				'read'      => true,
				PAGE_CAP    => true,
			)
		);
	} else {
		$role->add_cap( PAGE_CAP );
	}
}

/**
 * The current user's effective DineKit permissions, for the admin SPA to filter
 * its navigation. Server-side checks still enforce everything.
 *
 * @return array<string,bool>
 */
function caps_for_spa() {
	$caps = array(
		'owner'  => current_user_can( 'manage_options' ),
		'menu'   => current_user_can( 'edit_others_posts' ), // menu builder + design.
		'access' => can_access(),
	);
	foreach ( array_keys( permissions() ) as $perm ) {
		$caps[ $perm ] = can( $perm );
	}
	return $caps;
}

/**
 * The permissions the matrix controls (key => human label).
 *
 * @return array<string,string>
 */
function permissions() {
	return array(
		'orders'   => __( 'Orders', 'dinekit' ),
		'refunds'  => __( 'Issue refunds / void paid', 'dinekit' ),
		'bookings' => __( 'Bookings & floor', 'dinekit' ),
		'events'   => __( 'Events & pre-orders', 'dinekit' ),
		'staff'    => __( 'Staff & rotas', 'dinekit' ),
		'settings' => __( 'Settings, integrations & emails', 'dinekit' ),
	);
}

/**
 * Default permissions per DineKit role. Managers run the floor; front-of-house
 * handle orders + bookings; kitchen sees orders; refunds default to managers
 * only. The site owner (WP admin) always has everything regardless.
 *
 * @return array<string,string[]>
 */
function default_matrix() {
	return array(
		'manager'   => array( 'orders', 'refunds', 'bookings', 'events', 'staff', 'settings' ),
		'server'    => array( 'orders', 'bookings' ),
		'host'      => array( 'orders', 'bookings' ),
		'runner'    => array( 'orders' ),
		'bartender' => array( 'orders' ),
		'chef'      => array( 'orders' ),
		'kitchen'   => array( 'orders' ),
		'kp'        => array(),
		'driver'    => array( 'orders' ),
		'other'     => array(),
	);
}

/**
 * The current matrix (stored, falling back to defaults).
 *
 * @return array<string,string[]>
 */
function get_matrix() {
	$stored = get_option( OPTION );
	if ( ! is_array( $stored ) ) {
		return default_matrix();
	}
	return array_merge( default_matrix(), $stored );
}

/**
 * Sanitize + save the matrix. Only known roles + permissions are kept.
 *
 * @param array<string,mixed> $input Role => list of granted permission keys.
 * @return array<string,string[]>
 */
function save_matrix( $input ) {
	$roles = array_keys( default_matrix() );
	$perms = array_keys( permissions() );
	$clean = array();
	foreach ( $roles as $role ) {
		$granted        = isset( $input[ $role ] ) && is_array( $input[ $role ] ) ? array_map( 'strval', $input[ $role ] ) : array();
		$clean[ $role ] = array_values( array_intersect( $perms, $granted ) );
	}
	update_option( OPTION, $clean );
	return $clean;
}

/**
 * The DineKit role of the staff record linked to a WP user (empty if none).
 * Cached per request. Populated once staff accounts are linked to WP users.
 *
 * @param int $user_id WP user id (0 = current).
 * @return string
 */
function user_role( $user_id = 0 ) {
	static $cache = array();
	$user_id = $user_id ? (int) $user_id : get_current_user_id();
	if ( isset( $cache[ $user_id ] ) ) {
		return $cache[ $user_id ];
	}
	$role = '';
	if ( $user_id ) {
		$found = get_posts(
			array(
				'post_type'      => 'dinekit_staff',
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'no_found_rows'  => true,
				'fields'         => 'ids',
				'meta_key'       => 'dinekit_staff_user', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $user_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		if ( $found ) {
			$role = (string) get_post_meta( $found[0], 'dinekit_role', true );
		}
	}
	$cache[ $user_id ] = $role;
	return $role;
}

/**
 * Whether a user holds a DineKit permission. Full admins always pass.
 *
 * @param string $perm    Permission key.
 * @param int    $user_id WP user id (0 = current).
 * @return bool
 */
function can( $perm, $user_id = 0 ) {
	$user_id = $user_id ? (int) $user_id : get_current_user_id();
	if ( user_can( $user_id, 'manage_options' ) ) {
		return true;
	}
	$role = user_role( $user_id );
	if ( '' === $role ) {
		return false;
	}
	$matrix = get_matrix();
	return isset( $matrix[ $role ] ) && in_array( $perm, (array) $matrix[ $role ], true );
}

/**
 * Whether a user may use the DineKit admin at all (has any permission).
 *
 * @param int $user_id WP user id (0 = current).
 * @return bool
 */
function can_access( $user_id = 0 ) {
	$user_id = $user_id ? (int) $user_id : get_current_user_id();
	if ( user_can( $user_id, 'manage_options' ) ) {
		return true;
	}
	$role = user_role( $user_id );
	if ( '' === $role ) {
		return false;
	}
	$matrix = get_matrix();
	return ! empty( $matrix[ $role ] );
}

/**
 * Register the /access routes.
 *
 * @return void
 */
function register_routes() {
	register_rest_route(
		'dinekit/v1',
		'/access',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_get',
				'permission_callback' => __NAMESPACE__ . '\\can_view_cb',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\rest_save',
				'permission_callback' => __NAMESPACE__ . '\\can_edit_cb',
			),
		)
	);
}

/**
 * Who can view the matrix (managers with the staff permission).
 *
 * @return bool
 */
function can_view_cb() {
	return can( 'staff' );
}

/**
 * Who can change the matrix — the site owner only. Deciding "who can do what"
 * (incl. who can issue refunds) is deliberately restricted to full admins.
 *
 * @return bool
 */
function can_edit_cb() {
	return current_user_can( 'manage_options' );
}

/**
 * GET /access — permissions catalogue, roles and the current matrix.
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	require_once DINEKIT_DIR . 'includes/staff.php';
	return rest_ensure_response(
		array(
			'permissions' => permissions(),
			'roles'       => \DineKit\Staff\roles(),
			'matrix'      => get_matrix(),
		)
	);
}

/**
 * POST /access — save the matrix.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_save( $request ) {
	$body   = (array) $request->get_json_params();
	$matrix = isset( $body['matrix'] ) && is_array( $body['matrix'] ) ? $body['matrix'] : array();
	$saved  = save_matrix( $matrix );
	require_once DINEKIT_DIR . 'includes/activity.php';
	\DineKit\Activity\log( 'access', __( 'Updated access-control permissions', 'dinekit' ) );
	return rest_ensure_response(
		array(
			'permissions' => permissions(),
			'roles'       => \DineKit\Staff\roles(),
			'matrix'      => $saved,
		)
	);
}
