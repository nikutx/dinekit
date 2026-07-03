<?php
/**
 * Ordering REST API — public place-order + admin order board.
 *
 * @package DineKit
 */

namespace DineKit\Ordering\Rest;

use DineKit\Ordering;

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

	// Admin order board.
	register_rest_route(
		$ns,
		'/orders',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\list_orders',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/orders/settings',
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
		'/orders/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_order',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_order',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);

	// Public: place an order. Named distinctly from the admin /orders* family so
	// route matching can't fold it into an admin-permissioned route.
	register_rest_route(
		$ns,
		'/checkout',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\place_order',
			'permission_callback' => '__return_true',
		)
	);
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Serialize an order.
 *
 * @param int $id Order id.
 * @return array<string,mixed>
 */
function order_response( $id ) {
	$post  = get_post( $id );
	$items = json_decode( (string) get_post_meta( $id, 'dk_order_items', true ), true );
	return array(
		'id'      => (int) $id,
		'number'  => (int) get_post_meta( $id, 'dk_order_number', true ),
		'items'   => is_array( $items ) ? $items : array(),
		'total'   => (string) get_post_meta( $id, 'dk_order_total', true ),
		'status'  => (string) get_post_meta( $id, 'dk_order_status', true ),
		'name'    => (string) get_post_meta( $id, 'dk_order_name', true ),
		'email'   => (string) get_post_meta( $id, 'dk_order_email', true ),
		'phone'   => (string) get_post_meta( $id, 'dk_order_phone', true ),
		'notes'   => (string) get_post_meta( $id, 'dk_order_notes', true ),
		'when'    => (string) get_post_meta( $id, 'dk_order_when', true ),
		'payment' => (string) get_post_meta( $id, 'dk_order_payment', true ),
		'placed'  => (string) get_post_time( 'c', false, $id ),
	);
}

/**
 * GET /orders.
 *
 * @return \WP_REST_Response
 */
function list_orders() {
	$posts = get_posts(
		array(
			'post_type'      => 'dk_order',
			'post_status'    => 'publish',
			'posts_per_page' => 300,
			'no_found_rows'  => true,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	$orders = array_map(
		static function ( $post ) {
			return order_response( $post->ID );
		},
		$posts
	);
	return rest_ensure_response( $orders );
}

/**
 * PATCH /orders/:id — update status.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_order( $request ) {
	$id     = (int) $request['id'];
	$status = (string) $request->get_param( 'status' );
	if ( array_key_exists( $status, Ordering\statuses() ) ) {
		update_post_meta( $id, 'dk_order_status', $status );
	}
	if ( null !== $request->get_param( 'payment' ) ) {
		update_post_meta( $id, 'dk_order_payment', sanitize_text_field( (string) $request->get_param( 'payment' ) ) );
	}
	return rest_ensure_response( order_response( $id ) );
}

/**
 * DELETE /orders/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_order( $request ) {
	wp_delete_post( (int) $request['id'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * GET /orders/settings.
 *
 * @return \WP_REST_Response
 */
function get_settings() {
	return rest_ensure_response( Ordering\get_settings() );
}

/**
 * POST /orders/settings.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_settings( $request ) {
	return rest_ensure_response( Ordering\save_settings( (array) $request->get_json_params() ) );
}

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * POST /order — place a collection order. Public; guarded by honeypot + per-IP
 * rate limit + full server-side price recomputation.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function place_order( $request ) {
	$settings = Ordering\get_settings();
	if ( empty( $settings['enabled'] ) ) {
		return new \WP_Error( 'dinekit_order_off', __( 'Online ordering is currently closed.', 'dinekit' ), array( 'status' => 403 ) );
	}

	// Honeypot.
	if ( '' !== trim( (string) $request->get_param( 'hp' ) ) ) {
		return rest_ensure_response( array( 'ok' => true, 'number' => 0 ) );
	}
	// Rate limit.
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'na';
	$rl   = 'dinekit_order_rl_' . md5( $ip );
	$hits = (int) get_transient( $rl );
	if ( $hits >= 10 ) {
		return new \WP_Error( 'dinekit_order_rl', __( 'Too many attempts — please try again shortly.', 'dinekit' ), array( 'status' => 429 ) );
	}
	set_transient( $rl, $hits + 1, HOUR_IN_SECONDS );

	// Recompute the order authoritatively.
	$computed = Ordering\recompute( (array) $request->get_param( 'items' ) );
	if ( empty( $computed['items'] ) ) {
		return new \WP_Error( 'dinekit_order_empty', __( 'Your basket is empty.', 'dinekit' ), array( 'status' => 400 ) );
	}
	if ( $settings['min_order'] > 0 && $computed['total'] < (float) $settings['min_order'] ) {
		return new \WP_Error( 'dinekit_order_min', __( 'Your order is below the minimum.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$email = sanitize_email( (string) $request->get_param( 'email' ) );
	$phone = sanitize_text_field( (string) $request->get_param( 'phone' ) );
	if ( '' === $name || ( ! is_email( $email ) && '' === $phone ) ) {
		return new \WP_Error( 'dinekit_order_who', __( 'Please enter your name and a contact email or phone.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$when = sanitize_text_field( (string) $request->get_param( 'when' ) );
	if ( 'asap' !== $when && ! preg_match( '/^\d{1,2}:\d{2}$/', $when ) ) {
		$when = 'asap';
	}

	$number  = Ordering\next_number();
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dk_order',
			'post_status' => 'publish',
			/* translators: %d: order number. */
			'post_title'  => sprintf( __( 'Order #%d', 'dinekit' ), $number ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return new \WP_Error( 'dinekit_order_save', __( 'Could not place your order. Please try again.', 'dinekit' ), array( 'status' => 500 ) );
	}

	update_post_meta( $post_id, 'dk_order_number', $number );
	update_post_meta( $post_id, 'dk_order_items', wp_json_encode( $computed['items'] ) );
	update_post_meta( $post_id, 'dk_order_total', number_format( $computed['total'], 2, '.', '' ) );
	update_post_meta( $post_id, 'dk_order_status', 'new' );
	update_post_meta( $post_id, 'dk_order_name', $name );
	update_post_meta( $post_id, 'dk_order_email', $email );
	update_post_meta( $post_id, 'dk_order_phone', $phone );
	update_post_meta( $post_id, 'dk_order_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dk_order_when', $when );
	update_post_meta( $post_id, 'dk_order_payment', 'on_collection' );
	update_post_meta( $post_id, 'dk_order_source', 'online' );

	require_once DINEKIT_DIR . 'includes/ordering/emails.php';
	\DineKit\Ordering\Emails\new_order( $post_id );

	return rest_ensure_response(
		array(
			'ok'      => true,
			'number'  => $number,
			'total'   => number_format( $computed['total'], 2, '.', '' ),
			'message' => __( 'Order placed! We’ll have it ready for collection.', 'dinekit' ),
		)
	);
}
