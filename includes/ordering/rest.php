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
	update_post_meta( $post_id, 'dinekit_order_items', wp_json_encode( $computed['items'] ) );
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

	// Rejecting or cancelling releases/refunds the payment — a sensitive action
	// gated by its own permission (admins always pass).
	if ( 'reject' === $action || 'cancelled' === (string) $request->get_param( 'status' ) ) {
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
		foreach ( $items as &$li ) {
			if ( empty( $li['fired'] ) ) {
				$li['fired']   = true;
				$li['firedAt'] = $now;
				++$new;
			}
		}
		unset( $li );
		if ( $new > 0 ) {
			update_post_meta( $id, 'dinekit_order_items', wp_json_encode( $items ) );
			if ( 'open' === (string) get_post_meta( $id, 'dinekit_order_status', true ) ) {
				update_post_meta( $id, 'dinekit_order_status', 'sent' );
			}
			/* translators: %d: number of items fired. */
			Ordering\log_event( $id, sprintf( _n( 'Fired %d item to the kitchen', 'Fired %d items to the kitchen', $new, 'dinekit' ), $new ) );
		}
	} elseif ( 'void_line' === $action ) {
		$idx   = (int) $request->get_param( 'line' );
		$items = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
		$items = is_array( $items ) ? $items : array();
		if ( isset( $items[ $idx ] ) ) {
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
			update_post_meta( $id, 'dinekit_order_items', wp_json_encode( $items ) );
			update_post_meta( $id, 'dinekit_order_total', number_format( $total, 2, '.', '' ) );
			/* translators: %s: item name. */
			Ordering\log_event( $id, sprintf( __( 'Removed %s from the tab', 'dinekit' ), $voided ) );
		}
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
		Ordering\add_tender( $id, $ttype, $amt );
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
	}

	$status = (string) $request->get_param( 'status' );
	if ( '' !== $status && array_key_exists( $status, $statuses ) ) {
		update_post_meta( $id, 'dinekit_order_status', $status );
		/* translators: %s: order status label. */
		Ordering\log_event( $id, sprintf( __( 'Status changed to %s', 'dinekit' ), $statuses[ $status ] ) );
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
	$existing = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
	$existing = is_array( $existing ) ? $existing : array();
	$merged   = array_merge( $existing, $computed['items'] );
	$total    = 0.0;
	foreach ( $merged as $li ) {
		$total += (float) $li['lineTotal'];
	}
	update_post_meta( $id, 'dinekit_order_items', wp_json_encode( $merged ) );
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
	// for the restaurant to accept or reject first.
	$auto = ! empty( $settings['auto_accept'] );
	update_post_meta( $post_id, 'dinekit_order_number', $number );
	update_post_meta( $post_id, 'dinekit_order_items', wp_json_encode( $computed['items'] ) );
	update_post_meta( $post_id, 'dinekit_order_total', number_format( $grand, 2, '.', '' ) );
	update_post_meta( $post_id, 'dinekit_order_status', $auto ? 'preparing' : 'new' );
	update_post_meta( $post_id, 'dinekit_order_name', $name );
	update_post_meta( $post_id, 'dinekit_order_email', $email );
	update_post_meta( $post_id, 'dinekit_order_phone', $phone );
	update_post_meta( $post_id, 'dinekit_order_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );
	update_post_meta( $post_id, 'dinekit_order_when', $when );
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
