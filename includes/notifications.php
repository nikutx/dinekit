<?php
/**
 * Notification center feed — "what needs me right now".
 *
 * A single, cheap aggregate of the things a restaurant actually has to ACT on:
 * new orders to accept, bookings to confirm, the waitlist, and pending holiday
 * requests. Surfaced as a bell in the top bar on every screen, each item a
 * one-click jump to the exact view that resolves it.
 *
 * Read-only and entirely local — no custom tables, no external calls. Every
 * bucket is gated by the viewer's own permission, so staff only ever see the
 * actions they're allowed to take.
 *
 * @package DineKit
 */

namespace DineKit\Notifications;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook registration.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Anyone who can open the dashboard can see their own notifications.
 *
 * @return bool
 */
function can_use() {
	require_once DINEKIT_DIR . 'includes/access.php';
	return \DineKit\Access\can( 'access' );
}

/**
 * Does the current user hold a given DineKit capability?
 *
 * @param string $cap Capability key (orders, bookings, staff…).
 * @return bool
 */
function can( $cap ) {
	require_once DINEKIT_DIR . 'includes/access.php';
	return \DineKit\Access\can( $cap );
}

/**
 * Register REST routes.
 *
 * @return void
 */
function register_routes() {
	register_rest_route(
		'dinekit/v1',
		'/notifications',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_get',
			'permission_callback' => __NAMESPACE__ . '\\can_use',
		)
	);
}

/**
 * Count published posts of a type matching a meta filter, without loading them.
 *
 * @param string                     $post_type Post type.
 * @param array<int,array<string,mixed>> $meta  meta_query rows (AND-combined).
 * @return int
 */
function count_where( $post_type, $meta ) {
	$args = array(
		'post_type'      => $post_type,
		'post_status'    => 'publish',
		'posts_per_page' => 1,
		'fields'         => 'ids',
		'no_found_rows'  => false,
	);
	if ( ! empty( $meta ) ) {
		$args['meta_query'] = array_merge( array( 'relation' => 'AND' ), $meta ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
	}
	$query = new \WP_Query( $args );
	return (int) $query->found_posts;
}

/**
 * GET /notifications — the actionable feed for this user.
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	$today = current_time( 'Y-m-d' );
	$items = array();

	// New orders waiting to be accepted.
	if ( can( 'orders' ) ) {
		$orders = count_where(
			'dinekit_order',
			array(
				array(
					'key'   => 'dinekit_order_status',
					'value' => 'new',
				),
			)
		);
		if ( $orders > 0 ) {
			$items[] = array(
				'key'   => 'orders',
				'count' => $orders,
				'label' => sprintf(
					/* translators: %d: number of orders. */
					_n( '%d order to accept', '%d orders to accept', $orders, 'dinekit' ),
					$orders
				),
				'view'  => 'orders',
				'tone'  => 'accent',
			);
		}
	}

	// Upcoming bookings still to be confirmed, and the waitlist.
	if ( can( 'bookings' ) ) {
		$date_upcoming = array(
			'key'     => 'dinekit_date',
			'value'   => $today,
			'compare' => '>=',
			'type'    => 'DATE',
		);

		$pending = count_where(
			'dinekit_booking',
			array(
				array(
					'key'   => 'dinekit_status',
					'value' => 'pending',
				),
				$date_upcoming,
			)
		);
		if ( $pending > 0 ) {
			$items[] = array(
				'key'   => 'bookings',
				'count' => $pending,
				'label' => sprintf(
					/* translators: %d: number of bookings. */
					_n( '%d booking to confirm', '%d bookings to confirm', $pending, 'dinekit' ),
					$pending
				),
				'view'  => 'bookings',
				'tone'  => 'amber',
			);
		}

		$waitlist = count_where(
			'dinekit_booking',
			array(
				array(
					'key'   => 'dinekit_status',
					'value' => 'provisional',
				),
				$date_upcoming,
			)
		);
		if ( $waitlist > 0 ) {
			$items[] = array(
				'key'   => 'waitlist',
				'count' => $waitlist,
				'label' => sprintf(
					/* translators: %d: number of waitlisted parties. */
					_n( '%d party on the waitlist', '%d parties on the waitlist', $waitlist, 'dinekit' ),
					$waitlist
				),
				'view'  => 'bookings',
				'tone'  => 'neutral',
			);
		}
	}

	// Staff holiday requests awaiting a decision.
	if ( can( 'staff' ) ) {
		$leave = count_where(
			'dinekit_leave',
			array(
				array(
					'key'   => 'dinekit_leave_status',
					'value' => 'pending',
				),
			)
		);
		if ( $leave > 0 ) {
			$items[] = array(
				'key'   => 'leave',
				'count' => $leave,
				'label' => sprintf(
					/* translators: %d: number of holiday requests. */
					_n( '%d holiday request to review', '%d holiday requests to review', $leave, 'dinekit' ),
					$leave
				),
				'view'  => 'staff',
				'tone'  => 'violet',
			);
		}
	}

	// A reply from DineKit support (cached locally by the support cron — the
	// bell itself never calls the hub).
	require_once DINEKIT_DIR . 'includes/support.php';
	if ( \DineKit\Support\can_use() ) {
		$replies = \DineKit\Support\unread_count();
		if ( $replies > 0 ) {
			$items[] = array(
				'key'   => 'support',
				'count' => $replies,
				'label' => sprintf(
					/* translators: %d: number of support requests with a new reply. */
					_n( 'Support replied to your request', 'Support replied to %d of your requests', $replies, 'dinekit' ),
					$replies
				),
				'view'  => 'support',
				'tone'  => 'green',
			);
		}
	}

	$total = 0;
	foreach ( $items as $item ) {
		$total += (int) $item['count'];
	}

	return rest_ensure_response(
		array(
			'items' => $items,
			'total' => $total,
		)
	);
}
