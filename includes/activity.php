<?php
/**
 * Activity log — an append-only audit trail of sensitive actions (refunds,
 * voids, order/booking lifecycle, payment config, permission changes, logins),
 * so a venue can always answer "who did this, and when". Stored as a private
 * CPT (dinekit_activity) — no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Activity;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boot: register the CPT, routes, and the login logger.
 *
 * @return void
 */
function init() {
	add_action( 'init', __NAMESPACE__ . '\\register_cpt' );
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
	add_action( 'wp_login', __NAMESPACE__ . '\\on_login', 10, 2 );
}

/**
 * The action categories (key => label) used for filtering + display.
 *
 * @return array<string,string>
 */
function categories() {
	return array(
		'refund'   => __( 'Refunds & voids', 'dinekit' ),
		'order'    => __( 'Orders', 'dinekit' ),
		'booking'  => __( 'Bookings', 'dinekit' ),
		'payments' => __( 'Payments setup', 'dinekit' ),
		'access'   => __( 'Access & staff', 'dinekit' ),
		'login'    => __( 'Sign-ins', 'dinekit' ),
	);
}

/**
 * Register the private activity CPT (no UI — surfaced via the DineKit app).
 *
 * @return void
 */
function register_cpt() {
	register_post_type(
		'dinekit_activity',
		array(
			'label'           => __( 'DineKit Activity', 'dinekit' ),
			'public'          => false,
			'show_ui'         => false,
			'show_in_rest'    => false,
			'has_archive'     => false,
			'rewrite'         => false,
			'supports'        => array( 'title' ),
			'capability_type' => 'post',
			'map_meta_cap'    => true,
		)
	);
}

/**
 * Record an action. Captures the acting user's id + name (name stored so the
 * trail survives a user being deleted). Best-effort — never throws.
 *
 * @param string $action  Category key (see categories()).
 * @param string $label   Human summary, e.g. "Refunded order #123 (£20.00)".
 * @param string $details Optional extra context.
 * @return void
 */
function log( $action, $label, $details = '' ) {
	$user = wp_get_current_user();
	$name = $user && $user->ID ? ( $user->display_name ? $user->display_name : $user->user_login ) : __( 'System', 'dinekit' );
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dinekit_activity',
			'post_status' => 'publish',
			'post_title'  => $label,
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return;
	}
	update_post_meta( $post_id, 'dinekit_act_action', sanitize_key( $action ) );
	update_post_meta( $post_id, 'dinekit_act_user', $user ? (int) $user->ID : 0 );
	update_post_meta( $post_id, 'dinekit_act_actor', $name );
	if ( '' !== $details ) {
		update_post_meta( $post_id, 'dinekit_act_details', $details );
	}
}

/**
 * Log a sign-in — only for users who can use DineKit (skips ordinary WP users).
 *
 * @param string    $login WP username.
 * @param \WP_User $user  The user.
 * @return void
 */
function on_login( $login, $user ) {
	if ( ! $user instanceof \WP_User ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/access.php';
	if ( ! \DineKit\Access\can_access( $user->ID ) ) {
		return;
	}
	// wp_get_current_user isn't set this early; log against the logging-in user.
	$name    = $user->display_name ? $user->display_name : $user->user_login;
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dinekit_activity',
			'post_status' => 'publish',
			/* translators: %s: user name. */
			'post_title'  => sprintf( __( '%s signed in', 'dinekit' ), $name ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return;
	}
	update_post_meta( $post_id, 'dinekit_act_action', 'login' );
	update_post_meta( $post_id, 'dinekit_act_user', (int) $user->ID );
	update_post_meta( $post_id, 'dinekit_act_actor', $name );
}

/**
 * Register the /activity route.
 *
 * @return void
 */
function register_routes() {
	register_rest_route(
		'dinekit/v1',
		'/activity',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_list',
			'permission_callback' => __NAMESPACE__ . '\\can_view',
		)
	);
}

/**
 * Reviewing the audit trail is a manager-level task.
 *
 * @return bool
 */
function can_view() {
	require_once DINEKIT_DIR . 'includes/access.php';
	return \DineKit\Access\can( 'staff' );
}

/**
 * GET /activity — recent entries, newest first, optionally filtered by action.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_list( $request ) {
	$action    = sanitize_key( (string) $request->get_param( 'action' ) );
	$requested = (int) $request->get_param( 'limit' );
	$limit     = min( 500, max( 1, $requested > 0 ? $requested : 200 ) );

	$args = array(
		'post_type'      => 'dinekit_activity',
		'post_status'    => 'publish',
		'posts_per_page' => $limit, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- capped audit list.
		'no_found_rows'  => true,
		'orderby'        => 'date',
		'order'          => 'DESC',
	);
	if ( '' !== $action && array_key_exists( $action, categories() ) ) {
		$args['meta_key']   = 'dinekit_act_action'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		$args['meta_value'] = $action; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
	}

	$rows = array();
	foreach ( get_posts( $args ) as $post ) {
		$rows[] = array(
			'id'      => (int) $post->ID,
			'action'  => (string) get_post_meta( $post->ID, 'dinekit_act_action', true ),
			'label'   => $post->post_title,
			'details' => (string) get_post_meta( $post->ID, 'dinekit_act_details', true ),
			'actor'   => (string) get_post_meta( $post->ID, 'dinekit_act_actor', true ),
			'userId'  => (int) get_post_meta( $post->ID, 'dinekit_act_user', true ),
			'time'    => (string) get_post_time( 'c', true, $post ),
		);
	}

	return rest_ensure_response(
		array(
			'categories' => categories(),
			'entries'    => $rows,
		)
	);
}
