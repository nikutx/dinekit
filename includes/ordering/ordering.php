<?php
/**
 * Ordering module — commission-free takeaway/collection orders.
 *
 * Orders are dk_order posts. Line totals are ALWAYS recomputed server-side from
 * the item's stored price + modifier prices — the client's numbers are never
 * trusted. CPT/meta only, no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Ordering;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SETTINGS = 'dinekit_order_settings';
const COUNTER  = 'dinekit_order_counter';

/**
 * Boot the module.
 *
 * @return void
 */
function init() {
	add_action( 'init', __NAMESPACE__ . '\\register' );
	add_action( 'init', __NAMESPACE__ . '\\register_frontend' );
	add_shortcode( 'dinekit_order', __NAMESPACE__ . '\\order_shortcode' );
	require_once DINEKIT_DIR . 'includes/ordering/rest.php';
	Rest\init();
}

/**
 * Register the ordering page assets.
 *
 * @return void
 */
function register_frontend() {
	wp_register_style( 'dinekit-order', DINEKIT_URL . 'assets/css/order.css', array(), DINEKIT_VERSION );
	wp_register_script( 'dinekit-order', DINEKIT_URL . 'assets/js/dinekit-order.js', array(), DINEKIT_VERSION, true );

	// Stripe.js (their domain, PCI SAQ-A) — shared with bookings; register once.
	if ( ! wp_script_is( 'dinekit-stripe', 'registered' ) ) {
		wp_register_script( 'dinekit-stripe', 'https://js.stripe.com/v3/', array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion,WordPress.WP.EnqueuedResourceParameters.NotInFooter -- Stripe requires their unversioned URL.
	}
}

/**
 * The orderable menu: published items (optionally within a menu) grouped by
 * section, each with prices + modifiers. Items without a price can't be ordered.
 *
 * @param int $menu_id Optional dk_menu term id to limit to.
 * @return array<int,array<string,mixed>>
 */
function orderable_menu( $menu_id = 0 ) {
	$args = array(
		'post_type'      => 'dk_menu_item',
		'post_status'    => 'publish',
		'posts_per_page' => 500,
		'orderby'        => 'menu_order',
		'order'          => 'ASC',
		'no_found_rows'  => true,
	);
	if ( $menu_id ) {
		// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		$args['tax_query'] = array(
			array(
				'taxonomy' => 'dk_menu',
				'field'    => 'term_id',
				'terms'    => (int) $menu_id,
			),
		);
	}
	$query = new \WP_Query( $args );

	$sections    = array();
	$unsectioned = array();
	foreach ( $query->posts as $post ) {
		$prices = get_post_meta( $post->ID, 'dk_prices', true );
		$prices = is_array( $prices ) ? array_values( $prices ) : array();
		if ( empty( $prices ) ) {
			continue;
		}
		$mods = get_post_meta( $post->ID, 'dk_modifiers', true );
		$item = array(
			'id'        => (int) $post->ID,
			'title'     => $post->post_title,
			'desc'      => wp_strip_all_tags( (string) $post->post_content ),
			'prices'    => $prices,
			'modifiers' => is_array( $mods ) ? array_values( $mods ) : array(),
		);

		$terms = get_the_terms( $post, 'dk_section' );
		if ( is_array( $terms ) && $terms ) {
			$sec = $terms[0];
			if ( ! isset( $sections[ $sec->term_id ] ) ) {
				$sections[ $sec->term_id ] = array(
					'id'    => (int) $sec->term_id,
					'name'  => $sec->name,
					'order' => (int) get_term_meta( $sec->term_id, 'dk_order', true ),
					'items' => array(),
				);
			}
			$sections[ $sec->term_id ]['items'][] = $item;
		} else {
			$unsectioned[] = $item;
		}
	}

	$list = array_values( $sections );
	usort(
		$list,
		static function ( $a, $b ) {
			return $a['order'] <=> $b['order'];
		}
	);
	if ( $unsectioned ) {
		$list[] = array(
			'id'    => 0,
			'name'  => __( 'More', 'dinekit' ),
			'order' => 9999,
			'items' => $unsectioned,
		);
	}
	return $list;
}

/**
 * [dinekit_order] shortcode.
 *
 * @param array<string,string>|string $atts Attributes.
 * @return string
 */
function order_shortcode( $atts ) {
	require_once DINEKIT_DIR . 'includes/ordering/form.php';
	$atts = shortcode_atts(
		array(
			'menu'    => 0,
			'heading' => __( 'Order online', 'dinekit' ),
		),
		$atts,
		'dinekit_order'
	);
	return Form\render( (int) $atts['menu'], (string) $atts['heading'] );
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
 * Order statuses.
 *
 * @return array<string,string>
 */
function statuses() {
	return array(
		'new'       => __( 'New', 'dinekit' ),
		'preparing' => __( 'Preparing', 'dinekit' ),
		'ready'     => __( 'Ready', 'dinekit' ),
		'completed' => __( 'Completed', 'dinekit' ),
		'cancelled' => __( 'Cancelled', 'dinekit' ),
	);
}

/**
 * Register the order post type + meta.
 *
 * @return void
 */
function register() {
	register_post_type(
		'dk_order',
		array(
			'labels'       => array(
				'name'          => __( 'Orders', 'dinekit' ),
				'singular_name' => __( 'Order', 'dinekit' ),
			),
			'description'  => __( 'Commission-free customer orders.', 'dinekit' ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_menu' => false,
			'show_in_rest' => false,
			'supports'     => array( 'title' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'map_meta_cap' => true,
		)
	);

	$meta = array(
		'dk_order_number'  => 'integer',
		'dk_order_items'   => 'string',  // JSON of recomputed lines.
		'dk_order_total'   => 'string',  // Decimal string.
		'dk_order_status'  => 'string',
		'dk_order_name'    => 'string',
		'dk_order_email'   => 'string',
		'dk_order_phone'   => 'string',
		'dk_order_notes'   => 'string',
		'dk_order_when'    => 'string',  // 'asap' or H:i.
		'dk_order_payment' => 'string',  // unpaid | paid | on_collection.
		'dk_order_source'  => 'string',
	);
	foreach ( $meta as $key => $type ) {
		register_post_meta(
			'dk_order',
			$key,
			array(
				'type'              => $type,
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'integer' === $type ? 'absint' : 'sanitize_text_field',
				'auth_callback'     => __NAMESPACE__ . '\\can_manage',
			)
		);
	}
}

/**
 * Ordering settings (merged over defaults).
 *
 * @return array<string,mixed>
 */
function get_settings() {
	$defaults = array(
		'enabled'        => true,
		'prep_mins'      => 30,   // Minimum lead time before collection.
		'min_order'      => 0,    // Minimum order value (0 = none).
		'emails_enabled' => true, // Send customer + kitchen order emails.
		'notify_email'   => '',   // Kitchen recipient (empty = site admin).
	);
	$stored = get_option( SETTINGS, array() );
	return is_array( $stored ) ? array_merge( $defaults, $stored ) : $defaults;
}

/**
 * Save ordering settings.
 *
 * @param array<string,mixed> $data Incoming.
 * @return array<string,mixed>
 */
function save_settings( $data ) {
	$current = get_settings();
	if ( isset( $data['enabled'] ) ) {
		$current['enabled'] = (bool) $data['enabled'];
	}
	if ( isset( $data['prep_mins'] ) ) {
		$current['prep_mins'] = max( 0, min( 480, absint( $data['prep_mins'] ) ) );
	}
	if ( isset( $data['min_order'] ) ) {
		$current['min_order'] = max( 0, (float) $data['min_order'] );
	}
	if ( isset( $data['emails_enabled'] ) ) {
		$current['emails_enabled'] = (bool) $data['emails_enabled'];
	}
	if ( isset( $data['notify_email'] ) ) {
		$email                   = sanitize_email( (string) $data['notify_email'] );
		$current['notify_email'] = is_email( $email ) ? $email : '';
	}
	update_option( SETTINGS, $current );
	return $current;
}

/**
 * The next sequential order number.
 *
 * @return int
 */
function next_number() {
	$n = (int) get_option( COUNTER, 1000 ) + 1;
	update_option( COUNTER, $n );
	return $n;
}

/**
 * Recompute order lines from stored item/modifier data — the authoritative
 * price. Never trusts client-supplied prices.
 *
 * Each incoming line: { itemId, qty, priceIndex, choices:{gi:[oi]}, removed:{gi:[oi]} }.
 *
 * @param array<int,array<string,mixed>> $lines Raw client lines.
 * @return array{items:array<int,array<string,mixed>>,total:float}
 */
function recompute( $lines ) {
	$items = array();
	$total = 0.0;

	foreach ( (array) $lines as $line ) {
		$item_id = isset( $line['itemId'] ) ? (int) $line['itemId'] : 0;
		$post    = get_post( $item_id );
		if ( ! $post || 'dk_menu_item' !== $post->post_type || 'publish' !== $post->post_status ) {
			continue;
		}
		$qty = max( 1, min( 20, isset( $line['qty'] ) ? (int) $line['qty'] : 1 ) );

		$prices = get_post_meta( $item_id, 'dk_prices', true );
		$prices = is_array( $prices ) ? $prices : array();
		$pidx   = isset( $line['priceIndex'] ) ? (int) $line['priceIndex'] : 0;
		$row    = $prices[ $pidx ] ?? ( $prices[0] ?? array() );
		$unit   = isset( $row['amount'] ) ? (float) $row['amount'] : 0.0;
		$plabel = isset( $row['label'] ) ? (string) $row['label'] : '';

		$mods   = get_post_meta( $item_id, 'dk_modifiers', true );
		$mods   = is_array( $mods ) ? $mods : array();
		$chosen = array();
		$removed = array();

		if ( isset( $line['choices'] ) && is_array( $line['choices'] ) ) {
			foreach ( $line['choices'] as $gi => $opt_idxs ) {
				$gi = (int) $gi;
				if ( ! isset( $mods[ $gi ] ) || 'choose' !== $mods[ $gi ]['type'] ) {
					continue;
				}
				foreach ( (array) $opt_idxs as $oi ) {
					$opt = $mods[ $gi ]['options'][ (int) $oi ] ?? null;
					if ( $opt ) {
						$unit    += (float) $opt['price'];
						$chosen[] = array(
							'group' => $mods[ $gi ]['name'],
							'label' => $opt['label'],
							'price' => (float) $opt['price'],
						);
					}
				}
			}
		}
		if ( isset( $line['removed'] ) && is_array( $line['removed'] ) ) {
			foreach ( $line['removed'] as $gi => $opt_idxs ) {
				$gi = (int) $gi;
				if ( ! isset( $mods[ $gi ] ) || 'remove' !== $mods[ $gi ]['type'] ) {
					continue;
				}
				foreach ( (array) $opt_idxs as $oi ) {
					$opt = $mods[ $gi ]['options'][ (int) $oi ] ?? null;
					if ( $opt ) {
						$removed[] = $opt['label'];
					}
				}
			}
		}

		$line_total = round( $unit * $qty, 2 );
		$total     += $line_total;
		$items[]    = array(
			'itemId'     => $item_id,
			'title'      => $post->post_title,
			'qty'        => $qty,
			'priceLabel' => $plabel,
			'unit'       => round( $unit, 2 ),
			'lineTotal'  => $line_total,
			'chosen'     => $chosen,
			'removed'    => $removed,
		);
	}

	return array(
		'items' => $items,
		'total' => round( $total, 2 ),
	);
}
