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
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\list_orders',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\create_order',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
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
	$items    = json_decode( (string) get_post_meta( $id, 'dk_order_items', true ), true );
	$history  = json_decode( (string) get_post_meta( $id, 'dk_order_history', true ), true );
	$emaillog = json_decode( (string) get_post_meta( $id, 'dk_order_email_log', true ), true );
	return array(
		'id'        => (int) $id,
		'number'    => (int) get_post_meta( $id, 'dk_order_number', true ),
		'items'     => is_array( $items ) ? $items : array(),
		'total'     => (string) get_post_meta( $id, 'dk_order_total', true ),
		'status'    => (string) get_post_meta( $id, 'dk_order_status', true ),
		'name'      => (string) get_post_meta( $id, 'dk_order_name', true ),
		'email'     => (string) get_post_meta( $id, 'dk_order_email', true ),
		'phone'     => (string) get_post_meta( $id, 'dk_order_phone', true ),
		'notes'     => (string) get_post_meta( $id, 'dk_order_notes', true ),
		'when'      => (string) get_post_meta( $id, 'dk_order_when', true ),
		'payment'   => (string) get_post_meta( $id, 'dk_order_payment', true ),
		'source'    => (string) get_post_meta( $id, 'dk_order_source', true ),
		'pi'        => (string) get_post_meta( $id, 'dk_order_pi', true ),
		'archived'  => '1' === (string) get_post_meta( $id, 'dk_order_archived', true ),
		'refundDue' => '1' === (string) get_post_meta( $id, 'dk_order_refund_due', true ),
		'history'   => is_array( $history ) ? $history : array(),
		'emailLog'  => is_array( $emaillog ) ? $emaillog : array(),
		'placed'    => (string) get_post_time( 'c', false, $id ),
	);
}

/**
 * POST /orders — staff creates an order manually (phone/walk-in). Amount is
 * recomputed server-side; no rate-limit/honeypot (admin-only).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_order( $request ) {
	$computed = Ordering\recompute( (array) $request->get_param( 'items' ) );
	if ( empty( $computed['items'] ) ) {
		return new \WP_Error( 'dinekit_order_empty', __( 'Add at least one item.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	if ( '' === $name ) {
		$name = __( 'Walk-in', 'dinekit' );
	}
	$when = sanitize_text_field( (string) $request->get_param( 'when' ) );
	if ( 'asap' !== $when && ! preg_match( '/^\d{1,2}:\d{2}$/', $when ) ) {
		$when = 'asap';
	}
	$payment = (string) $request->get_param( 'payment' );
	$payment = in_array( $payment, array( 'paid', 'unpaid', 'on_collection' ), true ) ? $payment : 'unpaid';

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
		return new \WP_Error( 'dinekit_order_save', __( 'Could not create the order.', 'dinekit' ), array( 'status' => 500 ) );
	}

	update_post_meta( $post_id, 'dk_order_number', $number );
	update_post_meta( $post_id, 'dk_order_items', wp_json_encode( $computed['items'] ) );
	update_post_meta( $post_id, 'dk_order_total', number_format( $computed['total'], 2, '.', '' ) );
	update_post_meta( $post_id, 'dk_order_status', 'new' );
	update_post_meta( $post_id, 'dk_order_name', $name );
	update_post_meta( $post_id, 'dk_order_email', sanitize_email( (string) $request->get_param( 'email' ) ) );
	update_post_meta( $post_id, 'dk_order_phone', sanitize_text_field( (string) $request->get_param( 'phone' ) ) );
	update_post_meta( $post_id, 'dk_order_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dk_order_when', $when );
	update_post_meta( $post_id, 'dk_order_payment', $payment );
	update_post_meta( $post_id, 'dk_order_source', 'staff' );
	Ordering\log_event( $post_id, __( 'Order created by staff', 'dinekit' ) );

	return rest_ensure_response( order_response( $post_id ) );
}

/**
 * GET /orders — active by default; `?archived=1` returns the archive.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function list_orders( $request ) {
	$archived = '1' === (string) $request->get_param( 'archived' );
	$posts    = get_posts(
		array(
			'post_type'      => 'dk_order',
			'post_status'    => 'publish',
			'posts_per_page' => 300,
			'no_found_rows'  => true,
			'orderby'        => 'date',
			'order'          => 'DESC',
			// Archived orders are kept forever (never hard-deleted) but hidden by default.
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				'relation' => 'OR',
				array(
					'key'     => 'dk_order_archived',
					'value'   => '1',
					'compare' => $archived ? '=' : '!=',
				),
				$archived ? array(
					'key'     => 'dk_order_archived',
					'value'   => 'x', // Never matches — archived view only wants the =1 branch.
					'compare' => '=',
				) : array(
					'key'     => 'dk_order_archived',
					'compare' => 'NOT EXISTS',
				),
			),
		)
	);
	$orders   = array_map(
		static function ( $post ) {
			return order_response( $post->ID );
		},
		$posts
	);
	return rest_ensure_response( $orders );
}

/**
 * PATCH /orders/:id — accept/reject, change status/payment, or archive. Every
 * change is written to the order's history trail.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function update_order( $request ) {
	$id = (int) $request['id'];
	if ( 'dk_order' !== get_post_type( $id ) ) {
		return new \WP_Error( 'dinekit_order_404', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$action   = (string) $request->get_param( 'action' );
	$statuses = Ordering\statuses();

	if ( 'accept' === $action ) {
		update_post_meta( $id, 'dk_order_status', 'preparing' );
		Ordering\log_event( $id, __( 'Accepted', 'dinekit' ) );
		Ordering\capture_payment( $id ); // Captures an authorized hold when present (no-op otherwise).
	} elseif ( 'reject' === $action ) {
		update_post_meta( $id, 'dk_order_status', 'cancelled' );
		Ordering\log_event( $id, __( 'Rejected & cancelled', 'dinekit' ) );
		Ordering\release_or_refund( $id ); // Releases the hold, or refunds if already captured.
	} elseif ( 'resend' === $action ) {
		require_once DINEKIT_DIR . 'includes/ordering/emails.php';
		$sent = Ordering\Emails\resend_confirmation( $id );
		Ordering\log_event( $id, $sent ? __( 'Receipt re-sent to customer', 'dinekit' ) : __( 'Receipt resend failed', 'dinekit' ) );
	}

	$status = (string) $request->get_param( 'status' );
	if ( '' !== $status && array_key_exists( $status, $statuses ) ) {
		update_post_meta( $id, 'dk_order_status', $status );
		/* translators: %s: order status label. */
		Ordering\log_event( $id, sprintf( __( 'Status changed to %s', 'dinekit' ), $statuses[ $status ] ) );
	}

	if ( null !== $request->get_param( 'payment' ) ) {
		$pay = sanitize_text_field( (string) $request->get_param( 'payment' ) );
		update_post_meta( $id, 'dk_order_payment', $pay );
		/* translators: %s: payment status. */
		Ordering\log_event( $id, sprintf( __( 'Payment marked %s', 'dinekit' ), $pay ) );
	}

	if ( null !== $request->get_param( 'archived' ) ) {
		$arch = (bool) $request->get_param( 'archived' );
		update_post_meta( $id, 'dk_order_archived', $arch ? 1 : 0 );
		Ordering\log_event( $id, $arch ? __( 'Archived', 'dinekit' ) : __( 'Restored from archive', 'dinekit' ) );
	}

	return rest_ensure_response( order_response( $id ) );
}

/**
 * DELETE /orders/:id — orders are financial records, so this ARCHIVES rather
 * than hard-deleting (nothing is ever lost).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function delete_order( $request ) {
	$id = (int) $request['id'];
	if ( 'dk_order' !== get_post_type( $id ) ) {
		return new \WP_Error( 'dinekit_order_404', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	update_post_meta( $id, 'dk_order_archived', 1 );
	Ordering\log_event( $id, __( 'Archived', 'dinekit' ) );
	return rest_ensure_response( order_response( $id ) );
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
		return rest_ensure_response(
			array(
				'ok'     => true,
				'number' => 0,
			)
		);
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

	// Auto-accept sends it straight to the kitchen; otherwise it's held as "new"
	// for the restaurant to accept or reject first.
	$auto = ! empty( $settings['auto_accept'] );
	update_post_meta( $post_id, 'dk_order_number', $number );
	update_post_meta( $post_id, 'dk_order_items', wp_json_encode( $computed['items'] ) );
	update_post_meta( $post_id, 'dk_order_total', number_format( $computed['total'], 2, '.', '' ) );
	update_post_meta( $post_id, 'dk_order_status', $auto ? 'preparing' : 'new' );
	update_post_meta( $post_id, 'dk_order_name', $name );
	update_post_meta( $post_id, 'dk_order_email', $email );
	update_post_meta( $post_id, 'dk_order_phone', $phone );
	update_post_meta( $post_id, 'dk_order_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dk_order_when', $when );
	update_post_meta( $post_id, 'dk_order_source', 'online' );
	Ordering\log_event( $post_id, __( 'Order received online', 'dinekit' ) );
	if ( $auto ) {
		Ordering\log_event( $post_id, __( 'Auto-accepted', 'dinekit' ) );
	}

	// When Stripe is connected and there's something to charge, hold the order as
	// awaiting payment (the webhook flips it to 'paid'); otherwise pay-on-collection.
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$pay = \DineKit\Integrations\stripe_ready() && $computed['total'] > 0;
	update_post_meta( $post_id, 'dk_order_payment', $pay ? 'pending' : 'on_collection' );

	require_once DINEKIT_DIR . 'includes/ordering/emails.php';
	\DineKit\Ordering\Emails\new_order( $post_id );

	return rest_ensure_response(
		array(
			'ok'      => true,
			'id'      => $pay ? $post_id : 0,
			'pay'     => $pay,
			'number'  => $number,
			'total'   => number_format( $computed['total'], 2, '.', '' ),
			'message' => $pay
				? __( 'Almost there — please pay to confirm your order.', 'dinekit' )
				: __( 'Order placed! We’ll have it ready for collection.', 'dinekit' ),
		)
	);
}
