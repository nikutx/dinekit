<?php
/**
 * Dish archiving + usage lookup.
 *
 * Dishes are never hard-deleted. Past orders snapshot a dish's title and price
 * into `dinekit_order_items`, and Reports groups top dishes by that title, so
 * history survives on its own — but the dish post itself is still worth keeping:
 * it can be restored, and an accidental delete is otherwise unrecoverable.
 *
 * Archiving sets `dinekit_item_archived` = 1, which hides the dish from the menu
 * builder, the public menu and ordering. It is fully reversible. This mirrors the
 * `dinekit_order_archived` flag used for orders (archive, never delete).
 *
 * @package DineKit
 */

namespace DineKit\Items;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const META = 'dinekit_item_archived';

/**
 * Is this dish archived?
 *
 * @param int $item_id Dish post id.
 * @return bool
 */
function is_archived( $item_id ) {
	return '1' === (string) get_post_meta( (int) $item_id, META, true );
}

/**
 * Archive or restore a dish.
 *
 * @param int  $item_id  Dish post id.
 * @param bool $archived True to archive, false to restore.
 * @return bool True on success.
 */
function set_archived( $item_id, $archived = true ) {
	$item_id = (int) $item_id;
	$post    = get_post( $item_id );
	if ( ! $post || 'dinekit_menu_item' !== $post->post_type ) {
		return false;
	}
	if ( $archived ) {
		update_post_meta( $item_id, META, 1 );
	} else {
		delete_post_meta( $item_id, META );
	}
	return true;
}

/**
 * A meta_query fragment excluding archived dishes. Meta is absent on dishes that
 * have never been archived, so NOT EXISTS is required alongside the '0' check.
 *
 * @return array<int,array<string,mixed>>
 */
function exclude_archived_meta_query() {
	return array(
		'relation' => 'OR',
		array(
			'key'     => META,
			'compare' => 'NOT EXISTS',
		),
		array(
			'key'     => META,
			'value'   => '1',
			'compare' => '!=',
		),
	);
}

/**
 * Order statuses that mean "this order is still being worked on". Archiving a
 * dish that appears on one of these is allowed, but the owner should be warned.
 *
 * @return string[]
 */
function live_order_statuses() {
	// Everything except completed/cancelled — see Ordering\statuses().
	return array( 'open', 'sent', 'new', 'preparing', 'ready', 'out_for_delivery', 'delivered' );
}

/**
 * How many orders reference this dish? Line items are a JSON snapshot, so this is
 * only about *warning the owner* — an archived dish never corrupts an order.
 *
 * Scanning every order forever would be unbounded, so we look at the most recent
 * SCAN_LIMIT. `capped` says the `total` is a floor, not an exact figure; `live`
 * is always exact, because a live order is by definition a recent one.
 *
 * @param int $item_id Dish post id.
 * @return array{live:int,total:int,capped:bool,liveNumbers:array<int,string>}
 */
function usage( $item_id ) {
	$item_id = (int) $item_id;
	$live    = 0;
	$total   = 0;
	$numbers = array();

	$scan_limit = 500;
	$order_ids  = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'any',
			'posts_per_page' => $scan_limit, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page
			'orderby'        => 'date',
			'order'          => 'DESC',
			'fields'         => 'ids',
			'no_found_rows'  => true,
		)
	);

	$live_statuses = live_order_statuses();

	foreach ( $order_ids as $order_id ) {
		$lines = json_decode( (string) get_post_meta( $order_id, 'dinekit_order_items', true ), true );
		if ( ! is_array( $lines ) ) {
			continue;
		}
		$uses = false;
		foreach ( $lines as $line ) {
			if ( isset( $line['itemId'] ) && (int) $line['itemId'] === $item_id ) {
				$uses = true;
				break;
			}
		}
		if ( ! $uses ) {
			continue;
		}
		++$total;

		$status = (string) get_post_meta( $order_id, 'dinekit_order_status', true );
		if ( in_array( $status, $live_statuses, true ) ) {
			++$live;
			$number = (string) get_post_meta( $order_id, 'dinekit_order_number', true );
			if ( '' !== $number && count( $numbers ) < 5 ) {
				$numbers[] = $number;
			}
		}
	}

	return array(
		'live'        => $live,
		'total'       => $total,
		// We only looked at the newest $scan_limit orders, so `total` may undercount
		// a long history. Say so rather than quietly reporting a wrong number.
		'capped'      => count( $order_ids ) >= $scan_limit,
		'liveNumbers' => $numbers,
	);
}
