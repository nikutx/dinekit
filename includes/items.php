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
 * Is this dish still completely blank — nothing typed, nothing chosen?
 *
 * Opening "Add dish" creates the post up front so the editor has somewhere to
 * autosave to. If the owner closes it again without entering anything, that
 * post is litter (and, being published, litter that shows on the public menu),
 * so the editor asks for it to be binned. The client decides when to ask; this
 * is the guard that decides whether it's allowed — never trust the caller with
 * a permanent delete.
 *
 * Deliberately strict: ANY sign of intent (a character of a name, a price, a
 * photo, an allergen) makes the dish worth keeping, and it gets archived the
 * normal way instead.
 *
 * @param int $item_id Dish post id.
 * @return bool True when the dish holds no owner-entered data at all.
 */
function is_blank( $item_id ) {
	$post = get_post( (int) $item_id );
	if ( ! $post || 'dinekit_menu_item' !== $post->post_type ) {
		return false;
	}

	// create_item() titles a nameless dish "New item" — that's our placeholder,
	// not something the owner typed.
	$title = trim( (string) $post->post_title );
	if ( '' !== $title && __( 'New item', 'dinekit' ) !== $title ) {
		return false;
	}
	if ( '' !== trim( wp_strip_all_tags( (string) $post->post_content ) ) ) {
		return false;
	}
	if ( get_post_thumbnail_id( $post ) ) {
		return false;
	}

	// Any non-empty meta the owner could have set.
	$meta_keys = array( 'dinekit_prices', 'dinekit_modifiers', 'dinekit_badge', 'dinekit_calories', 'dinekit_cost', 'dinekit_allergen_sources', 'dinekit_stock' );
	// Empty for these means: no array entries, no characters, and none of the
	// "nothing here" encodings meta picks up ('0' from a cleared number field,
	// '[]'/'{}' from a JSON blob that was written then emptied).
	$empty_scalars = array( '', '0', '[]', '{}', 'null', 'false' );
	foreach ( $meta_keys as $key ) {
		$value = get_post_meta( $post->ID, $key, true );
		if ( is_array( $value ) ) {
			if ( array() !== $value ) {
				return false;
			}
			continue;
		}
		if ( ! in_array( trim( (string) $value ), $empty_scalars, true ) ) {
			return false;
		}
	}

	// Allergens/dietary tags are a choice; sections/menus are not (the dish was
	// created inside one), so those don't count as data.
	foreach ( array( 'dinekit_allergen', 'dinekit_dietary' ) as $taxonomy ) {
		$terms = get_the_terms( $post, $taxonomy );
		if ( is_array( $terms ) && $terms ) {
			return false;
		}
	}

	// Paranoia: a blank dish can't be on an order, but never destroy a post that
	// order history points at.
	$used = usage( $post->ID );
	return 0 === (int) $used['total'];
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
