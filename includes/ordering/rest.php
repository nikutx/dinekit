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
	require_once DINEKIT_DIR . 'includes/access.php';
	return \DineKit\Access\can( 'orders' );
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

	// POS: the order-taking item grid (authenticated staff), and appending lines
	// to an open dine-in tab.
	register_rest_route(
		$ns,
		'/pos/menu',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\pos_menu',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/orders/(?P<id>\d+)/lines',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\add_lines',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	// POS: a single table's past (settled) orders, for the order-pad history panel.
	register_rest_route(
		$ns,
		'/orders/table/(?P<id>\d+)/history',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\table_history',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/pos/item-stock',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\set_item_stock',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
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

	// Public: which fulfilment times are already full. Same naming rule as
	// /checkout — anything starting "orders" inherits the admin permission.
	register_rest_route(
		$ns,
		'/checkout-slots',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\checkout_slots',
			'permission_callback' => '__return_true',
		)
	);
}

/**
 * GET /checkout-slots?times=asap,19:00,19:15 — the subset that is at capacity.
 *
 * Public and read-only. It reveals only whether a slot is full (never counts or
 * order details), which is the same thing the diner would learn by trying to
 * check out. Input is capped and format-validated so it can't be used to make
 * the site do arbitrary work.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function checkout_slots( $request ) {
	$raw   = (string) $request->get_param( 'times' );
	$times = array_filter(
		array_map( 'trim', explode( ',', $raw ) ),
		static function ( $t ) {
			return 'asap' === $t || preg_match( '/^\d{1,2}:\d{2}$/', $t );
		}
	);
	$times = array_slice( array_values( $times ), 0, 60 );

	// Optional scheduled day (pre-orders): capacity is counted against THAT
	// day, and the response carries the day's open periods so the picker can
	// offer only times the venue actually trades.
	$settings = Ordering\get_settings();
	$date     = sanitize_text_field( (string) $request->get_param( 'date' ) );
	$max_day  = wp_date( 'Y-m-d', strtotime( '+' . (int) $settings['preorder_days'] . ' days' ) );
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) || $date <= wp_date( 'Y-m-d' ) || $date > $max_day ) {
		$date = '';
	}
	$out = array(
		'full' => $times ? array_values( Ordering\full_slots( $times, $date ) ) : array(),
	);
	if ( '' !== $date ) {
		$out['periods'] = Ordering\periods_for_date( $date );
	}
	return rest_ensure_response( $out );
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
	$items     = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
	$history   = json_decode( (string) get_post_meta( $id, 'dinekit_order_history', true ), true );
	$emaillog  = json_decode( (string) get_post_meta( $id, 'dinekit_order_email_log', true ), true );
	$channel   = (string) get_post_meta( $id, 'dinekit_order_channel', true );
	$table_id  = (int) get_post_meta( $id, 'dinekit_order_table_id', true );
	$pay_token = (string) get_post_meta( $id, 'dinekit_order_pay_token', true );
	$member_id = (int) get_post_meta( $id, 'dinekit_order_member', true );
	$tenders   = json_decode( (string) get_post_meta( $id, 'dinekit_order_tenders', true ), true );
	$tenders   = is_array( $tenders ) ? $tenders : array();
	$food      = (float) get_post_meta( $id, 'dinekit_order_total', true );
	$service   = (float) get_post_meta( $id, 'dinekit_order_service', true );
	$tip       = (float) get_post_meta( $id, 'dinekit_order_tip', true );
	$discount  = (float) get_post_meta( $id, 'dinekit_order_discount', true );
	$grand     = round( $food + $service + $tip - $discount, 2 );
	$paid      = 0.0;
	foreach ( $tenders as $t ) {
		$paid += (float) $t['amount'];
	}
	return array(
		'id'           => (int) $id,
		'number'       => (int) get_post_meta( $id, 'dinekit_order_number', true ),
		'items'        => is_array( $items ) ? $items : array(),
		'total'        => (string) get_post_meta( $id, 'dinekit_order_total', true ),
		'status'       => (string) get_post_meta( $id, 'dinekit_order_status', true ),
		'name'         => (string) get_post_meta( $id, 'dinekit_order_name', true ),
		'email'        => (string) get_post_meta( $id, 'dinekit_order_email', true ),
		'phone'        => (string) get_post_meta( $id, 'dinekit_order_phone', true ),
		'notes'        => (string) get_post_meta( $id, 'dinekit_order_notes', true ),
		'when'         => (string) get_post_meta( $id, 'dinekit_order_when', true ),
		'whenDate'     => (string) get_post_meta( $id, 'dinekit_order_when_date', true ),
		'payment'      => (string) get_post_meta( $id, 'dinekit_order_payment', true ),
		'source'       => (string) get_post_meta( $id, 'dinekit_order_source', true ),
		'fulfilment'   => 'delivery' === get_post_meta( $id, 'dinekit_order_fulfilment', true ) ? 'delivery' : 'collection',
		'address'      => (string) get_post_meta( $id, 'dinekit_order_address', true ),
		'fee'          => (string) get_post_meta( $id, 'dinekit_order_fee', true ),
		'channel'      => '' !== $channel ? $channel : 'online',
		'tableId'      => $table_id,
		'table'        => $table_id ? (string) get_the_title( $table_id ) : '',
		'covers'       => (int) get_post_meta( $id, 'dinekit_order_covers', true ),
		'tenders'      => $tenders,
		'service'      => number_format( $service, 2, '.', '' ),
		'tip'          => number_format( $tip, 2, '.', '' ),
		'discount'     => number_format( $discount, 2, '.', '' ),
		'grandTotal'   => number_format( $grand, 2, '.', '' ),
		'paid'         => number_format( $paid, 2, '.', '' ),
		'balance'      => number_format( round( $grand - $paid, 2 ), 2, '.', '' ),
		'payUrl'       => '' !== $pay_token ? add_query_arg( 'dinekit_pay', $pay_token, home_url( '/' ) ) : '',
		'memberId'     => $member_id,
		'memberName'   => $member_id ? (string) get_the_title( $member_id ) : '',
		'memberPoints' => $member_id ? (int) get_post_meta( $member_id, 'dinekit_member_points', true ) : 0,
		'redeem'       => (int) get_post_meta( $id, 'dinekit_order_redeem', true ),
		'pi'           => (string) get_post_meta( $id, 'dinekit_order_pi', true ),
		'archived'     => '1' === (string) get_post_meta( $id, 'dinekit_order_archived', true ),
		'refundDue'    => '1' === (string) get_post_meta( $id, 'dinekit_order_refund_due', true ),
		'printed'      => (string) get_post_meta( $id, 'dinekit_order_printed', true ),
		'history'      => is_array( $history ) ? $history : array(),
		'emailLog'     => is_array( $emaillog ) ? $emaillog : array(),
		'placed'       => (string) get_post_time( 'c', false, $id ),
		'checkedAt'    => (string) get_post_meta( $id, 'dinekit_order_checked', true ),
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
	// Idempotency: a client that queued this order offline sends a stable
	// clientRef. If we've already created an order for that ref (e.g. the tablet
	// reconnected and replayed the queue), return the existing one instead of
	// minting a duplicate.
	$client_ref = sanitize_text_field( (string) $request->get_param( 'clientRef' ) );
	if ( '' !== $client_ref ) {
		$existing = find_order_by_client_ref( $client_ref );
		if ( $existing ) {
			return rest_ensure_response( order_response( $existing ) );
		}
	}
	$channel  = (string) $request->get_param( 'channel' );
	$channel  = in_array( $channel, array( 'online', 'takeaway', 'dine_in', 'delivery' ), true ) ? $channel : 'takeaway';
	$dine_in  = 'dine_in' === $channel;
	$computed = Ordering\recompute( (array) $request->get_param( 'items' ) );
	// A dine-in tab may be opened empty (items added as the meal goes); every
	// other channel needs at least one line.
	if ( empty( $computed['items'] ) && ! $dine_in ) {
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
			'post_type'   => 'dinekit_order',
			'post_status' => 'publish',
			/* translators: %d: order number. */
			'post_title'  => sprintf( __( 'Order #%d', 'dinekit' ), $number ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return new \WP_Error( 'dinekit_order_save', __( 'Could not create the order.', 'dinekit' ), array( 'status' => 500 ) );
	}

	update_post_meta( $post_id, 'dinekit_order_number', $number );
	update_post_meta( $post_id, 'dinekit_order_items', wp_slash( wp_json_encode( $computed['items'] ) ) );
	update_post_meta( $post_id, 'dinekit_order_total', number_format( $computed['total'], 2, '.', '' ) );
	update_post_meta( $post_id, 'dinekit_order_status', $dine_in ? 'open' : 'new' );
	update_post_meta( $post_id, 'dinekit_order_channel', $channel );
	if ( $dine_in ) {
		update_post_meta( $post_id, 'dinekit_order_table_id', (int) $request->get_param( 'tableId' ) );
		update_post_meta( $post_id, 'dinekit_order_covers', max( 0, (int) $request->get_param( 'covers' ) ) );
	}
	update_post_meta( $post_id, 'dinekit_order_name', $name );
	update_post_meta( $post_id, 'dinekit_order_email', sanitize_email( (string) $request->get_param( 'email' ) ) );
	update_post_meta( $post_id, 'dinekit_order_phone', sanitize_text_field( (string) $request->get_param( 'phone' ) ) );
	update_post_meta( $post_id, 'dinekit_order_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dinekit_order_when', $when );
	update_post_meta( $post_id, 'dinekit_order_payment', $payment );
	update_post_meta( $post_id, 'dinekit_order_source', 'staff' );
	if ( '' !== $client_ref ) {
		update_post_meta( $post_id, 'dinekit_order_client_ref', $client_ref );
	}
	Ordering\log_event( $post_id, __( 'Order created by staff', 'dinekit' ) );
	if ( $dine_in ) {
		// Opening a tab seats the table in the diary too (marks a due booking
		// seated, or books a walk-in) — every screen reads the same floor.
		// After the name/covers meta above so the diary entry carries them.
		Ordering\link_booking_for_tab( $post_id );
	}

	return rest_ensure_response( order_response( $post_id ) );
}

/**
 * Find an existing order by its client idempotency ref (offline-queue replay).
 *
 * @param string $ref Client-supplied stable ref.
 * @return int Order post id, or 0 if none.
 */
function find_order_by_client_ref( $ref ) {
	if ( '' === $ref ) {
		return 0;
	}
	$ids = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'any',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'   => 'dinekit_order_client_ref',
					'value' => $ref,
				),
			),
		)
	);
	return $ids ? (int) $ids[0] : 0;
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
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 300,
			'no_found_rows'  => true,
			'orderby'        => 'date',
			'order'          => 'DESC',
			// Archived orders are kept forever (never hard-deleted) but hidden by default.
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				'relation' => 'OR',
				array(
					'key'     => 'dinekit_order_archived',
					'value'   => '1',
					'compare' => $archived ? '=' : '!=',
				),
				$archived ? array(
					'key'     => 'dinekit_order_archived',
					'value'   => 'x', // Never matches — archived view only wants the =1 branch.
					'compare' => '=',
				) : array(
					'key'     => 'dinekit_order_archived',
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
 * GET /orders/table/:id/history — a single table's settled (closed) orders,
 * newest first, for the order-pad history panel.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function table_history( $request ) {
	$table_id = (int) $request['id'];
	if ( ! $table_id ) {
		return rest_ensure_response( array() );
	}
	// TODAY only: mid-service the till cares about this service's tabs (fix a
	// payment, check what the last party had) — the full archive lives on the
	// Orders screen, not the order pad.
	$today  = current_time( 'Y-m-d' );
	$posts  = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 30,
			'no_found_rows'  => true,
			'orderby'        => 'date',
			'order'          => 'DESC',
			'date_query'     => array(
				array(
					'after'     => $today . ' 00:00:00',
					'inclusive' => true,
				),
			),
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				'relation' => 'AND',
				array(
					'key'   => 'dinekit_order_table_id',
					'value' => $table_id,
				),
				array(
					'key'   => 'dinekit_order_status',
					'value' => 'completed',
				),
			),
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
 * PATCH /orders/:id — accept/reject, change status/payment, or archive. Every
 * change is written to the order's history trail.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function update_order( $request ) {
	$id = (int) $request['id'];
	if ( 'dinekit_order' !== get_post_type( $id ) ) {
		return new \WP_Error( 'dinekit_order_404', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$action   = (string) $request->get_param( 'action' );
	$statuses = Ordering\statuses();

	// Idempotency: a write queued while the tablet was offline carries a stable
	// ref that was also sent on the original (unanswered) attempt. If we already
	// applied that ref, return the order untouched rather than doing it twice —
	// without this, replaying a `void_line` would remove a second line and a
	// `fire` would open a second kitchen round.
	$action_ref = sanitize_text_field( (string) $request->get_param( 'ref' ) );
	if ( '' !== $action_ref ) {
		$applied_refs = json_decode( (string) get_post_meta( $id, 'dinekit_order_applied_refs', true ), true );
		$applied_refs = is_array( $applied_refs ) ? $applied_refs : array();
		if ( in_array( $action_ref, $applied_refs, true ) ) {
			return rest_ensure_response( order_response( $id ) );
		}
		$applied_refs[] = $action_ref;
		update_post_meta( $id, 'dinekit_order_applied_refs', wp_slash( wp_json_encode( array_slice( $applied_refs, -200 ) ) ) );
	}

	// Rejecting or cancelling releases/refunds the payment — a sensitive action
	// gated by its own permission (admins always pass).
	if ( 'reject' === $action || 'refund' === $action || 'cancelled' === (string) $request->get_param( 'status' ) ) {
		require_once DINEKIT_DIR . 'includes/access.php';
		if ( ! \DineKit\Access\can( 'refunds' ) ) {
			return new \WP_Error( 'dinekit_no_refund', __( 'You do not have permission to void or refund orders.', 'dinekit' ), array( 'status' => 403 ) );
		}
	}

	require_once DINEKIT_DIR . 'includes/activity.php';
	$num = (int) get_post_meta( $id, 'dinekit_order_number', true );

	if ( 'accept' === $action ) {
		update_post_meta( $id, 'dinekit_order_status', 'preparing' );
		Ordering\log_event( $id, __( 'Accepted', 'dinekit' ) );
		Ordering\capture_payment( $id ); // Captures an authorized hold when present (no-op otherwise).
		require_once DINEKIT_DIR . 'includes/ordering/emails.php';
		Ordering\Emails\printer_ticket( $id ); // Auto-print the kitchen ticket on accept.
		/* translators: %d: order number. */
		\DineKit\Activity\log( 'order', sprintf( __( 'Accepted order #%d', 'dinekit' ), $num ) );
	} elseif ( 'reject' === $action ) {
		update_post_meta( $id, 'dinekit_order_status', 'cancelled' );
		Ordering\log_event( $id, __( 'Rejected & cancelled', 'dinekit' ) );
		Ordering\release_or_refund( $id ); // Releases the hold, or refunds if already captured.
		require_once DINEKIT_DIR . 'includes/ordering/emails.php';
		Ordering\Emails\cancelled( $id );
		/* translators: %d: order number. */
		\DineKit\Activity\log( 'refund', sprintf( __( 'Rejected & refunded order #%d', 'dinekit' ), $num ) );
	} elseif ( 'refund' === $action ) {
		// Refund a served/completed order (e.g. a post-meal issue) without
		// cancelling it. A `lines` list refunds just those items (partial);
		// otherwise the whole order is refunded.
		$lines_in = $request->get_param( 'lines' );
		if ( is_array( $lines_in ) && ! empty( $lines_in ) ) {
			$amount = Ordering\refund_lines( $id, array_map( 'intval', $lines_in ) );
			if ( $amount > 0 ) {
				/* translators: 1: amount, 2: order number. */
				\DineKit\Activity\log( 'refund', sprintf( __( 'Partially refunded %1$s on order #%2$d', 'dinekit' ), number_format( $amount, 2 ), $num ) );
			}
		} else {
			// Releases an uncaptured hold or refunds a captured payment.
			Ordering\release_or_refund( $id );
			// Cash / non-Stripe payment has nothing to call an API for — record the
			// manual refund so the order + books reflect it.
			if ( '' === (string) get_post_meta( $id, 'dinekit_order_pi', true ) && 'paid' === (string) get_post_meta( $id, 'dinekit_order_payment', true ) ) {
				update_post_meta( $id, 'dinekit_order_payment', 'refunded' );
			}
			Ordering\log_event( $id, __( 'Refunded', 'dinekit' ) );
			/* translators: %d: order number. */
			\DineKit\Activity\log( 'refund', sprintf( __( 'Refunded order #%d', 'dinekit' ), $num ) );
		}
	} elseif ( 'resend' === $action ) {
		require_once DINEKIT_DIR . 'includes/ordering/emails.php';
		$sent = Ordering\Emails\resend_confirmation( $id );
		Ordering\log_event( $id, $sent ? __( 'Receipt re-sent to customer', 'dinekit' ) : __( 'Receipt resend failed', 'dinekit' ) );
	} elseif ( 'printed' === $action ) {
		update_post_meta( $id, 'dinekit_order_printed', current_time( 'c' ) );
		$station = sanitize_key( (string) $request->get_param( 'station' ) );
		/* translators: %s: station name (kitchen/bar/all). */
		Ordering\log_event( $id, sprintf( __( 'Ticket printed (%s)', 'dinekit' ), '' !== $station ? $station : 'all' ) );
	} elseif ( 'fire' === $action ) {
		// Dine-in: commit the not-yet-fired lines as a round to the kitchen.
		$items = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
		$items = is_array( $items ) ? $items : array();
		$new   = 0;
		$now   = current_time( 'c' );
		// A unique id for THIS round — never the timestamp alone, which only has
		// second precision, so two rounds fired in the same second would otherwise
		// merge into one Kitchen Display ticket.
		$round_id = uniqid( 'r', true );
		// Optional ticket note for THIS round ("no rush", "allergy at seat 2")
		// — rides on the round's lines, shows on the KDS ticket and prints.
		$fnote = sanitize_text_field( (string) $request->get_param( 'fireNote' ) );
		foreach ( $items as &$li ) {
			if ( empty( $li['fired'] ) ) {
				$li['fired']   = true;
				$li['firedAt'] = $now;
				$li['firedId'] = $round_id; // groups this round's lines on the KDS.
				$li['kstage']  = 'new'; // a fresh round starts in the kitchen's "New" column.
				if ( '' !== $fnote ) {
					$li['fnote'] = $fnote;
				}
				++$new;
			}
		}
		unset( $li );
		if ( $new > 0 ) {
			update_post_meta( $id, 'dinekit_order_items', wp_slash( wp_json_encode( $items ) ) );
			// There's a new active round, so keep the tab on the board. Each round's
			// own kstage (not the order status) decides its column, so an earlier
			// round stays where it is (e.g. still "Ready") when a new one fires.
			update_post_meta( $id, 'dinekit_order_status', 'sent' );
			/* translators: %d: number of items fired. */
			Ordering\log_event( $id, sprintf( _n( 'Fired %d item to the kitchen', 'Fired %d items to the kitchen', $new, 'dinekit' ), $new ) . ( '' !== $fnote ? ' — “' . $fnote . '”' : '' ) );
		}
	} elseif ( 'kitchen_stage' === $action ) {
		// Advance ONE fired round (identified by its firedAt) through the kitchen —
		// new → preparing → ready → done — independently of the tab's other rounds.
		$round = (string) $request->get_param( 'round' );
		$stage = sanitize_key( (string) $request->get_param( 'stage' ) );
		if ( ! in_array( $stage, array( 'new', 'preparing', 'ready', 'done' ), true ) ) {
			$stage = 'new';
		}
		$items = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
		$items = is_array( $items ) ? $items : array();
		$hit   = false;
		foreach ( $items as &$li ) {
			// Match by the unique round id; fall back to firedAt for pre-existing
			// rounds fired before round ids were stored.
			$lid = isset( $li['firedId'] ) ? (string) $li['firedId'] : (string) ( isset( $li['firedAt'] ) ? $li['firedAt'] : '' );
			if ( ! empty( $li['fired'] ) && $lid === $round && ( isset( $li['kstage'] ) ? $li['kstage'] : 'new' ) !== 'done' ) {
				$li['kstage'] = $stage;
				$hit          = true;
				if ( 'done' === $stage && empty( $li['doneAt'] ) ) {
					$li['doneAt'] = current_time( 'c' ); // served — for the tab's time-to-serve.
				}
			}
		}
		unset( $li );
		// Legacy rounds: lines fired before round ids existed have NO firedId or
		// firedAt, so the board sends the 'r' fallback key and nothing above can
		// match — the Start button would silently do nothing. Advance those
		// lines as one round (and stamp ids so next time they match normally).
		if ( ! $hit ) {
			$legacy_id = 'legacy-' . $id;
			foreach ( $items as &$li ) {
				if ( ! empty( $li['fired'] ) && empty( $li['firedId'] ) && empty( $li['firedAt'] ) && ( isset( $li['kstage'] ) ? $li['kstage'] : 'new' ) !== 'done' ) {
					$li['firedId'] = $legacy_id;
					$li['kstage']  = $stage;
					if ( 'done' === $stage && empty( $li['doneAt'] ) ) {
						$li['doneAt'] = current_time( 'c' );
					}
				}
			}
			unset( $li );
		}
		update_post_meta( $id, 'dinekit_order_items', wp_slash( wp_json_encode( $items ) ) );
		// Tab status for the till: it drops to 'served'/'completed' only once NO
		// round is still cooking; otherwise it stays on the board.
		$active = false;
		foreach ( $items as $li ) {
			if ( ! empty( $li['fired'] ) && ( isset( $li['kstage'] ) ? $li['kstage'] : 'new' ) !== 'done' ) {
				$active = true;
				break;
			}
		}
		if ( $active ) {
			update_post_meta( $id, 'dinekit_order_status', 'sent' );
		} else {
			$chan = (string) get_post_meta( $id, 'dinekit_order_channel', true );
			update_post_meta( $id, 'dinekit_order_status', 'dine_in' === $chan ? 'served' : 'completed' );
		}
	} elseif ( 'void_line' === $action ) {
		$idx   = (int) $request->get_param( 'line' );
		$uid   = sanitize_text_field( (string) $request->get_param( 'lineUid' ) );
		$items = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
		$items = is_array( $items ) ? $items : array();
		if ( '' !== $uid ) {
			// Prefer the stable line id: an index can shift if another tablet
			// edited the tab (e.g. mid-outage) — a uid can't hit the wrong line.
			// If the uid is gone, the line was already voided → idempotent no-op.
			$idx = -1;
			foreach ( $items as $i => $li ) {
				if ( isset( $li['uid'] ) && $li['uid'] === $uid ) {
					$idx = $i;
					break;
				}
			}
		}
		if ( $idx >= 0 && isset( $items[ $idx ] ) ) {
			// Voiding a line already fired to the kitchen is a manager action.
			if ( ! empty( $items[ $idx ]['fired'] ) ) {
				require_once DINEKIT_DIR . 'includes/access.php';
				if ( ! \DineKit\Access\can( 'refunds' ) ) {
					return new \WP_Error( 'dinekit_no_void', __( 'You do not have permission to void a fired item.', 'dinekit' ), array( 'status' => 403 ) );
				}
			}
			$voided = (string) $items[ $idx ]['title'];
			array_splice( $items, $idx, 1 );
			$total = 0.0;
			foreach ( $items as $li ) {
				$total += (float) $li['lineTotal'];
			}
			update_post_meta( $id, 'dinekit_order_items', wp_slash( wp_json_encode( $items ) ) );
			update_post_meta( $id, 'dinekit_order_total', number_format( $total, 2, '.', '' ) );
			/* translators: %s: item name. */
			Ordering\log_event( $id, sprintf( __( 'Removed %s from the tab', 'dinekit' ), $voided ) );
		}
	} elseif ( 'check' === $action ) {
		// Floor staff checked in on the table — resets the "needs a check" timer.
		update_post_meta( $id, 'dinekit_order_checked', current_time( 'c' ) );
		Ordering\log_event( $id, __( 'Table checked', 'dinekit' ) );
	} elseif ( 'set_charges' === $action ) {
		foreach ( array( 'service', 'tip', 'discount' ) as $k ) {
			if ( null !== $request->get_param( $k ) ) {
				update_post_meta( $id, 'dinekit_order_' . $k, number_format( max( 0, (float) $request->get_param( $k ) ), 2, '.', '' ) );
			}
		}
		Ordering\log_event( $id, __( 'Service/tip/discount updated', 'dinekit' ) );
	} elseif ( 'tender' === $action ) {
		$ttype = sanitize_key( (string) $request->get_param( 'tenderType' ) );
		$ttype = in_array( $ttype, array( 'cash', 'card', 'voucher', 'comp', 'account' ), true ) ? $ttype : 'cash';
		// Comping (writing off) a bill is a manager action — gate it like refunds.
		if ( 'comp' === $ttype ) {
			require_once DINEKIT_DIR . 'includes/access.php';
			if ( ! \DineKit\Access\can( 'refunds' ) ) {
				return new \WP_Error( 'dinekit_no_comp', __( 'You do not have permission to comp a bill.', 'dinekit' ), array( 'status' => 403 ) );
			}
		}
		$amt = round( (float) $request->get_param( 'amount' ), 2 );
		Ordering\add_tender( $id, $ttype, $amt, '', sanitize_text_field( (string) $request->get_param( 'ref' ) ) );
		require_once DINEKIT_DIR . 'includes/settings.php';
		$sym = isset( \DineKit\Settings\get()['currency'] ) ? \DineKit\Settings\get()['currency'] : '£';
		/* translators: 1: order number, 2: currency symbol, 3: amount, 4: tender type. */
		\DineKit\Activity\log( 'order', sprintf( __( 'Order #%1$d — %2$s%3$s taken (%4$s)', 'dinekit' ), $num, $sym, number_format_i18n( $amt, 2 ), $ttype ) );
	} elseif ( 'remove_tender' === $action ) {
		// Manager fix-up: a mis-keyed payment (wrong cash amount, wrong button)
		// comes OFF the order so it can be settled again correctly. Same gate
		// as refunds/voids. If the order drops below fully-paid, a settled
		// dine-in tab reopens on the floor.
		require_once DINEKIT_DIR . 'includes/access.php';
		if ( ! \DineKit\Access\can( 'refunds' ) ) {
			return new \WP_Error( 'dinekit_no_amend', __( 'You do not have permission to amend payments.', 'dinekit' ), array( 'status' => 403 ) );
		}
		$tenders = json_decode( (string) get_post_meta( $id, 'dinekit_order_tenders', true ), true );
		$tenders = is_array( $tenders ) ? $tenders : array();
		$tidx    = (int) $request->get_param( 'tenderIndex' );
		if ( isset( $tenders[ $tidx ] ) ) {
			$t = $tenders[ $tidx ];
			// Stale-screen guard: what the till showed must match what's stored.
			if ( sanitize_key( (string) $request->get_param( 'tenderType' ) ) !== (string) $t['type'] || round( (float) $request->get_param( 'amount' ), 2 ) !== round( (float) $t['amount'], 2 ) ) {
				return new \WP_Error( 'dinekit_amend_stale', __( 'That payment list is out of date — reopen it and try again.', 'dinekit' ), array( 'status' => 409 ) );
			}
			array_splice( $tenders, $tidx, 1 );
			update_post_meta( $id, 'dinekit_order_tenders', wp_slash( wp_json_encode( $tenders ) ) );
			/* translators: 1: tender type, 2: amount. */
			Ordering\log_event( $id, sprintf( __( 'Payment removed by manager: %1$s %2$s', 'dinekit' ), $t['type'], number_format( (float) $t['amount'], 2 ) ) );
			$paid = 0.0;
			foreach ( $tenders as $x ) {
				$paid += (float) $x['amount'];
			}
			if ( round( $paid - Ordering\grand_total( $id ), 2 ) < 0 ) {
				update_post_meta( $id, 'dinekit_order_payment', 'unpaid' );
				if ( 'dine_in' === (string) get_post_meta( $id, 'dinekit_order_channel', true ) && 'completed' === (string) get_post_meta( $id, 'dinekit_order_status', true ) ) {
					Ordering\reopen_tab( $id );
					Ordering\log_event( $id, __( 'Tab reopened — balance outstanding', 'dinekit' ) );
				}
			}
		}
	} elseif ( 'cancel_tab' === $action ) {
		// The accidental-open escape hatch: a tab with nothing fired and
		// nothing paid can be walked back entirely — the tab cancels, the
		// auto-booked walk-in cancels (a REAL booking it seated returns to
		// confirmed), and the table frees with no bussing: nothing happened.
		if ( 'dine_in' !== (string) get_post_meta( $id, 'dinekit_order_channel', true ) ) {
			return new \WP_Error( 'dinekit_not_tab', __( 'Only dine-in tabs can be cancelled this way.', 'dinekit' ), array( 'status' => 400 ) );
		}
		$tenders = json_decode( (string) get_post_meta( $id, 'dinekit_order_tenders', true ), true );
		if ( is_array( $tenders ) && count( $tenders ) > 0 ) {
			return new \WP_Error( 'dinekit_tab_paid', __( 'Money has been taken on this tab — settle or amend it instead.', 'dinekit' ), array( 'status' => 400 ) );
		}
		$items = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
		foreach ( (array) $items as $li ) {
			if ( ! empty( $li['fired'] ) ) {
				return new \WP_Error( 'dinekit_tab_fired', __( 'The kitchen already has part of this tab — void the lines instead.', 'dinekit' ), array( 'status' => 400 ) );
			}
		}
		update_post_meta( $id, 'dinekit_order_status', 'cancelled' );
		Ordering\log_event( $id, __( 'Tab cancelled — opened by mistake, nothing fired or paid', 'dinekit' ) );
		$bid = (int) get_post_meta( $id, 'dinekit_order_booking', true );
		if ( $bid && 'dinekit_booking' === get_post_type( $bid ) && 'seated' === (string) get_post_meta( $bid, 'dinekit_status', true ) ) {
			if ( 'pos' === (string) get_post_meta( $bid, 'dinekit_source', true ) ) {
				update_post_meta( $bid, 'dinekit_status', 'cancelled' );
			} else {
				update_post_meta( $bid, 'dinekit_status', 'confirmed' );
			}
		}
	} elseif ( 'retype_tender' === $action ) {
		// Manager fix-up for "pressed voucher, meant cash": swap a payment's
		// METHOD in place. The amount and the settle are untouched — the tab
		// stays closed, only the books change (and the change is logged).
		require_once DINEKIT_DIR . 'includes/access.php';
		if ( ! \DineKit\Access\can( 'refunds' ) ) {
			return new \WP_Error( 'dinekit_no_amend', __( 'You do not have permission to amend payments.', 'dinekit' ), array( 'status' => 403 ) );
		}
		$new = sanitize_key( (string) $request->get_param( 'newType' ) );
		if ( ! in_array( $new, array( 'cash', 'card', 'voucher', 'comp', 'account' ), true ) ) {
			return new \WP_Error( 'dinekit_bad_type', __( 'Unknown payment method.', 'dinekit' ), array( 'status' => 400 ) );
		}
		$tenders = json_decode( (string) get_post_meta( $id, 'dinekit_order_tenders', true ), true );
		$tenders = is_array( $tenders ) ? $tenders : array();
		$tidx    = (int) $request->get_param( 'tenderIndex' );
		if ( isset( $tenders[ $tidx ] ) ) {
			$t = $tenders[ $tidx ];
			// Stale-screen guard: what the till showed must match what's stored.
			if ( sanitize_key( (string) $request->get_param( 'tenderType' ) ) !== (string) $t['type'] || round( (float) $request->get_param( 'amount' ), 2 ) !== round( (float) $t['amount'], 2 ) ) {
				return new \WP_Error( 'dinekit_amend_stale', __( 'That payment list is out of date — reopen it and try again.', 'dinekit' ), array( 'status' => 409 ) );
			}
			if ( $new !== (string) $t['type'] ) {
				$tenders[ $tidx ]['type'] = $new;
				update_post_meta( $id, 'dinekit_order_tenders', wp_slash( wp_json_encode( $tenders ) ) );
				/* translators: 1: old tender type, 2: new tender type, 3: amount. */
				Ordering\log_event( $id, sprintf( __( 'Payment method changed by manager: %1$s → %2$s (%3$s)', 'dinekit' ), $t['type'], $new, number_format( (float) $t['amount'], 2 ) ) );
			}
		}
	} elseif ( 'reopen' === $action ) {
		// Manager fix-up: a tab settled/closed by mistake goes back on the floor.
		require_once DINEKIT_DIR . 'includes/access.php';
		if ( ! \DineKit\Access\can( 'refunds' ) ) {
			return new \WP_Error( 'dinekit_no_amend', __( 'You do not have permission to reopen a settled tab.', 'dinekit' ), array( 'status' => 403 ) );
		}
		if ( 'dine_in' !== (string) get_post_meta( $id, 'dinekit_order_channel', true ) ) {
			return new \WP_Error( 'dinekit_not_tab', __( 'Only dine-in tabs can be reopened.', 'dinekit' ), array( 'status' => 400 ) );
		}
		Ordering\reopen_tab( $id );
		Ordering\log_event( $id, __( 'Tab reopened by manager', 'dinekit' ) );
	} elseif ( 'pay_link' === $action ) {
		require_once DINEKIT_DIR . 'includes/pay.php';
		\DineKit\Pay\ensure_token( $id );
	} elseif ( 'email_receipt' === $action ) {
		require_once DINEKIT_DIR . 'includes/ordering/emails.php';
		$to = sanitize_email( (string) $request->get_param( 'email' ) );
		if ( is_email( $to ) ) {
			Ordering\Emails\receipt( $id, $to );
			Ordering\log_event( $id, __( 'Receipt emailed', 'dinekit' ) );
		}
	} elseif ( 'transfer' === $action ) {
		$tid = (int) $request->get_param( 'tableId' );
		update_post_meta( $id, 'dinekit_order_table_id', $tid );
		/* translators: %s: table name. */
		Ordering\log_event( $id, sprintf( __( 'Moved to %s', 'dinekit' ), $tid ? get_the_title( $tid ) : __( 'no table', 'dinekit' ) ) );
	} elseif ( 'reopen' === $action ) {
		require_once DINEKIT_DIR . 'includes/access.php';
		if ( ! \DineKit\Access\can( 'refunds' ) ) {
			return new \WP_Error( 'dinekit_no_reopen', __( 'You do not have permission to reopen a closed bill.', 'dinekit' ), array( 'status' => 403 ) );
		}
		update_post_meta( $id, 'dinekit_order_status', 'open' );
		Ordering\log_event( $id, __( 'Tab reopened', 'dinekit' ) );
	} elseif ( 'member' === $action ) {
		update_post_meta( $id, 'dinekit_order_member', (int) $request->get_param( 'memberId' ) );
	} elseif ( 'redeem' === $action ) {
		require_once DINEKIT_DIR . 'includes/loyalty.php';
		$member = (int) get_post_meta( $id, 'dinekit_order_member', true );
		if ( $member ) {
			$have    = (int) get_post_meta( $member, 'dinekit_member_points', true );
			$balance = Ordering\grand_total( $id );
			foreach ( (array) json_decode( (string) get_post_meta( $id, 'dinekit_order_tenders', true ), true ) as $t ) {
				$balance -= (float) $t['amount'];
			}
			$max_by_bal = (int) floor( max( 0, $balance ) / \DineKit\Loyalty\REDEEM_VALUE );
			$pts        = min( (int) $request->get_param( 'points' ), $have, $max_by_bal );
			if ( $pts > 0 ) {
				update_post_meta( $id, 'dinekit_order_redeem', $pts );
				update_post_meta( $id, 'dinekit_order_discount', number_format( $pts * \DineKit\Loyalty\REDEEM_VALUE, 2, '.', '' ) );
				/* translators: %d: points redeemed. */
				Ordering\log_event( $id, sprintf( __( 'Redeemed %d loyalty points', 'dinekit' ), $pts ) );
			}
		}
	} elseif ( 'close' === $action ) {
		update_post_meta( $id, 'dinekit_order_status', 'completed' );
		Ordering\log_event( $id, __( 'Tab closed', 'dinekit' ) );
		// Shared with the settle path in add_tender() so the two can't drift.
		Ordering\flag_table_for_bussing( $id );
		Ordering\complete_linked_booking( $id );
	}

	$status = (string) $request->get_param( 'status' );
	if ( '' !== $status && array_key_exists( $status, $statuses ) ) {
		update_post_meta( $id, 'dinekit_order_status', $status );
		/* translators: %s: order status label. */
		Ordering\log_event( $id, sprintf( __( 'Status changed to %s', 'dinekit' ), $statuses[ $status ] ) );
		// Collection order ready → optional "come and get it" SMS (BYO Twilio;
		// the module guards toggle/config/phone and sends once per order).
		if ( 'ready' === $status ) {
			require_once DINEKIT_DIR . 'includes/sms.php';
			\DineKit\SMS\order_ready( $id );
		}
		// When the kitchen finishes a round (Ready → Done → served/completed), mark
		// the lines it just made as done. That way, if a LATER round is fired for
		// the same tab, the Kitchen Display shows only the NEW items — not the ones
		// it already cooked.
		if ( in_array( $status, array( 'served', 'completed' ), true ) ) {
			$kitems = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
			if ( is_array( $kitems ) ) {
				$touched = false;
				foreach ( $kitems as &$kl ) {
					if ( ! empty( $kl['fired'] ) && ( isset( $kl['kstage'] ) ? $kl['kstage'] : 'new' ) !== 'done' ) {
						$kl['kstage'] = 'done';
						if ( empty( $kl['doneAt'] ) ) {
							$kl['doneAt'] = current_time( 'c' );
						}
						$touched = true;
					}
				}
				unset( $kl );
				if ( $touched ) {
					update_post_meta( $id, 'dinekit_order_items', wp_slash( wp_json_encode( $kitems ) ) );
				}
			}
		}
		// Cancelling (incl. a manager overriding an already-accepted order) must
		// refund/release the payment — not just via the Reject action.
		if ( 'cancelled' === $status && 'reject' !== $action ) {
			Ordering\release_or_refund( $id );
			require_once DINEKIT_DIR . 'includes/ordering/emails.php';
			Ordering\Emails\cancelled( $id );
			/* translators: %d: order number. */
			\DineKit\Activity\log( 'refund', sprintf( __( 'Cancelled & refunded order #%d', 'dinekit' ), $num ) );
		}
	}

	if ( null !== $request->get_param( 'payment' ) ) {
		$pay = sanitize_text_field( (string) $request->get_param( 'payment' ) );
		update_post_meta( $id, 'dinekit_order_payment', $pay );
		/* translators: %s: payment status. */
		Ordering\log_event( $id, sprintf( __( 'Payment marked %s', 'dinekit' ), $pay ) );
	}

	if ( null !== $request->get_param( 'archived' ) ) {
		$arch = (bool) $request->get_param( 'archived' );
		update_post_meta( $id, 'dinekit_order_archived', $arch ? 1 : 0 );
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
	if ( 'dinekit_order' !== get_post_type( $id ) ) {
		return new \WP_Error( 'dinekit_order_404', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	update_post_meta( $id, 'dinekit_order_archived', 1 );
	Ordering\log_event( $id, __( 'Archived', 'dinekit' ) );
	return rest_ensure_response( order_response( $id ) );
}

/**
 * GET /pos/menu — the orderable item grid for staff order-taking (authenticated).
 * Thin wrapper over the same feed the public order page uses.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function pos_menu( $request ) {
	$menu_id = (int) $request->get_param( 'menu' );
	return rest_ensure_response(
		array(
			'sections' => Ordering\orderable_menu( $menu_id ),
		)
	);
}

/**
 * POST /pos/item-stock — 86 a menu item (mark out of stock) or restock it.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function set_item_stock( $request ) {
	$item_id = (int) $request->get_param( 'itemId' );
	if ( 'dinekit_menu_item' !== get_post_type( $item_id ) ) {
		return new \WP_Error( 'dinekit_item_404', __( 'Item not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$out = (bool) $request->get_param( 'out' );
	update_post_meta( $item_id, 'dinekit_stock', $out ? 'out' : 'in' );
	return rest_ensure_response(
		array(
			'itemId'    => $item_id,
			'available' => ! $out,
		)
	);
}

/**
 * POST /orders/:id/lines — append lines to an open tab (dine-in). Prices are
 * recomputed server-side; new lines are unfired until the round is fired.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function add_lines( $request ) {
	$id = (int) $request['id'];
	if ( 'dinekit_order' !== get_post_type( $id ) ) {
		return new \WP_Error( 'dinekit_order_404', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$computed = Ordering\recompute( (array) $request->get_param( 'items' ) );
	if ( empty( $computed['items'] ) ) {
		return new \WP_Error( 'dinekit_order_empty', __( 'Add at least one item.', 'dinekit' ), array( 'status' => 400 ) );
	}
	// Idempotency: a queued-offline batch carries a stable ref. If this batch was
	// already applied (queue replayed), don't append the lines a second time.
	$batch_ref = sanitize_text_field( (string) $request->get_param( 'ref' ) );
	if ( '' !== $batch_ref ) {
		$applied = json_decode( (string) get_post_meta( $id, 'dinekit_order_applied_refs', true ), true );
		$applied = is_array( $applied ) ? $applied : array();
		if ( in_array( $batch_ref, $applied, true ) ) {
			return rest_ensure_response( order_response( $id ) );
		}
		$applied[] = $batch_ref;
		update_post_meta( $id, 'dinekit_order_applied_refs', wp_slash( wp_json_encode( array_slice( $applied, -200 ) ) ) );
	}
	$existing = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
	$existing = is_array( $existing ) ? $existing : array();
	$merged   = array_merge( $existing, $computed['items'] );
	$total    = 0.0;
	foreach ( $merged as $li ) {
		$total += (float) $li['lineTotal'];
	}
	update_post_meta( $id, 'dinekit_order_items', wp_slash( wp_json_encode( $merged ) ) );
	update_post_meta( $id, 'dinekit_order_total', number_format( $total, 2, '.', '' ) );
	$n = count( $computed['items'] );
	/* translators: %d: number of items added. */
	Ordering\log_event( $id, sprintf( _n( 'Added %d item to the tab', 'Added %d items to the tab', $n, 'dinekit' ), $n ) );
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

	// Scheduled pre-order for a future day? Validated hard: within the
	// configured window, a concrete time (not ASAP), and the venue must be
	// open at that date+time per Opening Hours.
	$when_date = sanitize_text_field( (string) $request->get_param( 'whenDate' ) );
	if ( wp_date( 'Y-m-d' ) === $when_date ) {
		$when_date = ''; // "Today" is just a normal order.
	}
	if ( '' !== $when_date ) {
		$max_day = wp_date( 'Y-m-d', strtotime( '+' . (int) $settings['preorder_days'] . ' days' ) );
		if (
			(int) $settings['preorder_days'] <= 0
			|| ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $when_date )
			|| $when_date < wp_date( 'Y-m-d' )
			|| $when_date > $max_day
		) {
			return new \WP_Error( 'dinekit_order_day', __( 'That day isn’t available for pre-orders.', 'dinekit' ), array( 'status' => 400 ) );
		}
	}

	// Trading window (ordering enabled + Opening Hours + last-orders cutoff).
	// Enforced server-side: the public JS also hides checkout, but that's cosmetic.
	// A valid FUTURE-day pre-order skips the "are we open right now" gate — that's
	// the whole point of scheduling — but still requires ordering to be enabled
	// and the venue to be open at the scheduled time (checked below).
	if ( '' === $when_date ) {
		$gate = Ordering\accepting_orders();
		if ( empty( $gate['accepting'] ) ) {
			return new \WP_Error( 'dinekit_order_off', $gate['message'], array( 'status' => 403 ) );
		}
	} elseif ( empty( $settings['enabled'] ) ) {
		return new \WP_Error( 'dinekit_order_off', __( 'Online ordering is currently unavailable.', 'dinekit' ), array( 'status' => 403 ) );
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

	// Fulfilment: collection (default) or delivery (when enabled). Delivery needs
	// an address, may have its own minimum, and adds a flat fee to the total.
	$fulfilment = ( 'delivery' === $request->get_param( 'fulfilment' ) && ! empty( $settings['delivery_enabled'] ) ) ? 'delivery' : 'collection';
	$address    = '';
	$fee        = 0.0;
	if ( 'delivery' === $fulfilment ) {
		$address = sanitize_textarea_field( (string) $request->get_param( 'address' ) );
		if ( '' === trim( $address ) ) {
			return new \WP_Error( 'dinekit_order_addr', __( 'Please enter a delivery address.', 'dinekit' ), array( 'status' => 400 ) );
		}
		if ( $settings['delivery_min'] > 0 && $computed['total'] < (float) $settings['delivery_min'] ) {
			return new \WP_Error( 'dinekit_order_dmin', __( 'Your order is below the delivery minimum.', 'dinekit' ), array( 'status' => 400 ) );
		}
		$fee = (float) $settings['delivery_fee'];
	}
	$grand = $computed['total'] + $fee;

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
	if ( '' !== $when_date ) {
		if ( 'asap' === $when ) {
			return new \WP_Error( 'dinekit_order_when', __( 'Please choose a time for your pre-order.', 'dinekit' ), array( 'status' => 400 ) );
		}
		if ( ! Ordering\open_at( $when_date, $when ) ) {
			return new \WP_Error( 'dinekit_order_when', __( 'We’re closed at that time — please choose another.', 'dinekit' ), array( 'status' => 400 ) );
		}
	}

	// Slot capacity: throttle how many orders target the same kitchen time slot so
	// a rush doesn't swamp the pass. Rejected before any order/payment is created.
	$slot = Ordering\slot_key( $when, $when_date );
	if ( (int) $settings['slot_max'] > 0 && Ordering\slot_count( $slot ) >= (int) $settings['slot_max'] ) {
		return new \WP_Error( 'dinekit_slot_full', __( 'That time slot is fully booked — please choose another time.', 'dinekit' ), array( 'status' => 409 ) );
	}

	$number  = Ordering\next_number();
	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dinekit_order',
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
	// for the restaurant to accept or reject first. A future-day pre-order is
	// ALWAYS held — auto-accept would put tomorrow's food on today's kitchen
	// screen; the KDS also hides it until its day.
	$auto = ! empty( $settings['auto_accept'] ) && '' === $when_date;
	update_post_meta( $post_id, 'dinekit_order_number', $number );
	update_post_meta( $post_id, 'dinekit_order_items', wp_slash( wp_json_encode( $computed['items'] ) ) );
	update_post_meta( $post_id, 'dinekit_order_total', number_format( $grand, 2, '.', '' ) );
	update_post_meta( $post_id, 'dinekit_order_status', $auto ? 'preparing' : 'new' );
	update_post_meta( $post_id, 'dinekit_order_name', $name );
	update_post_meta( $post_id, 'dinekit_order_email', $email );
	update_post_meta( $post_id, 'dinekit_order_phone', $phone );
	update_post_meta( $post_id, 'dinekit_order_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dinekit_order_when', $when );
	update_post_meta( $post_id, 'dinekit_order_when_date', $when_date );
	update_post_meta( $post_id, 'dinekit_order_slot', $slot );
	update_post_meta( $post_id, 'dinekit_order_source', 'online' );
	update_post_meta( $post_id, 'dinekit_order_fulfilment', $fulfilment );
	update_post_meta( $post_id, 'dinekit_order_address', $address );
	update_post_meta( $post_id, 'dinekit_order_fee', number_format( $fee, 2, '.', '' ) );
	// Table QR order with pay-upfront: tag it dine-in for that table + fire to the
	// kitchen (fulfilment/delivery don't apply).
	$table_token = sanitize_text_field( (string) $request->get_param( 'tableToken' ) );
	if ( '' !== $table_token ) {
		require_once DINEKIT_DIR . 'includes/table-order.php';
		$tqr = \DineKit\TableOrder\table_by_token( $table_token );
		if ( $tqr ) {
			update_post_meta( $post_id, 'dinekit_order_channel', 'dine_in' );
			update_post_meta( $post_id, 'dinekit_order_table_id', $tqr );
			update_post_meta( $post_id, 'dinekit_order_source', 'qr' );
			update_post_meta( $post_id, 'dinekit_order_status', 'sent' );
		}
	}
	Ordering\log_event( $post_id, __( 'Order received online', 'dinekit' ) );
	if ( $auto ) {
		Ordering\log_event( $post_id, __( 'Auto-accepted', 'dinekit' ) );
	}

	// When Stripe is connected and there's something to charge, hold the order as
	// awaiting payment (the webhook flips it to 'paid'); otherwise pay-on-collection.
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$pay = \DineKit\Integrations\stripe_ready() && $grand > 0;
	update_post_meta( $post_id, 'dinekit_order_payment', $pay ? 'pending' : 'on_collection' );

	require_once DINEKIT_DIR . 'includes/ordering/emails.php';
	\DineKit\Ordering\Emails\new_order( $post_id );
	// Auto-accepted orders are confirmed on arrival — print the kitchen ticket
	// now. Held orders print when a staff member accepts them (see update_order).
	if ( $auto ) {
		\DineKit\Ordering\Emails\printer_ticket( $post_id );
	}

	return rest_ensure_response(
		array(
			'ok'      => true,
			'id'      => $pay ? $post_id : 0,
			'pay'     => $pay,
			'number'  => $number,
			'total'   => number_format( $grand, 2, '.', '' ),
			'message' => $pay
				? __( 'Almost there — please pay to confirm your order.', 'dinekit' )
				: ( 'delivery' === $fulfilment
					? __( 'Order placed! We’ll deliver it to you.', 'dinekit' )
					: __( 'Order placed! We’ll have it ready for collection.', 'dinekit' ) ),
		)
	);
}
