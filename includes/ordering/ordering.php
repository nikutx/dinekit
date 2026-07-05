<?php
/**
 * Ordering module — commission-free takeaway/collection orders.
 *
 * Orders are dinekit_order posts. Line totals are ALWAYS recomputed server-side from
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
 * @param int $menu_id Optional dinekit_menu term id to limit to.
 * @return array<int,array<string,mixed>>
 */
function orderable_menu( $menu_id = 0 ) {
	$args = array(
		'post_type'      => 'dinekit_menu_item',
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
				'taxonomy' => 'dinekit_menu',
				'field'    => 'term_id',
				'terms'    => (int) $menu_id,
			),
		);
	}
	$query = new \WP_Query( $args );

	$sections    = array();
	$unsectioned = array();
	foreach ( $query->posts as $post ) {
		$prices = get_post_meta( $post->ID, 'dinekit_prices', true );
		$prices = is_array( $prices ) ? array_values( $prices ) : array();
		if ( empty( $prices ) ) {
			continue;
		}
		$mods     = get_post_meta( $post->ID, 'dinekit_modifiers', true );
		$thumb_id = get_post_thumbnail_id( $post );
		$item     = array(
			'id'        => (int) $post->ID,
			'title'     => $post->post_title,
			'desc'      => wp_strip_all_tags( (string) $post->post_content ),
			'prices'    => $prices,
			'modifiers' => is_array( $mods ) ? array_values( $mods ) : array(),
			'image'     => $thumb_id ? array( 'thumb' => (string) wp_get_attachment_image_url( $thumb_id, 'medium' ) ) : null,
			// 86'd (out of stock) — staff can see + toggle it; the public feed
			// filters these out before rendering the order page.
			'available' => 'out' !== (string) get_post_meta( $post->ID, 'dinekit_stock', true ),
		);

		$terms = get_the_terms( $post, 'dinekit_section' );
		if ( is_array( $terms ) && $terms ) {
			$sec = $terms[0];
			if ( ! isset( $sections[ $sec->term_id ] ) ) {
				$sections[ $sec->term_id ] = array(
					'id'    => (int) $sec->term_id,
					'name'  => $sec->name,
					'order' => (int) get_term_meta( $sec->term_id, 'dinekit_order', true ),
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
		'open'             => __( 'Open tab', 'dinekit' ),
		'sent'             => __( 'Sent to kitchen', 'dinekit' ),
		'new'              => __( 'New', 'dinekit' ),
		'preparing'        => __( 'Preparing', 'dinekit' ),
		'ready'            => __( 'Ready', 'dinekit' ),
		'out_for_delivery' => __( 'Out for delivery', 'dinekit' ),
		'delivered'        => __( 'Delivered', 'dinekit' ),
		'completed'        => __( 'Completed', 'dinekit' ),
		'cancelled'        => __( 'Cancelled', 'dinekit' ),
	);
}

/**
 * Register the order post type + meta.
 *
 * @return void
 */
function register() {
	register_post_type(
		'dinekit_order',
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
		'dinekit_order_number'     => 'integer',
		'dinekit_order_items'      => 'string',  // JSON of recomputed lines.
		'dinekit_order_total'      => 'string',  // Decimal string.
		'dinekit_order_status'     => 'string',
		'dinekit_order_name'       => 'string',
		'dinekit_order_email'      => 'string',
		'dinekit_order_phone'      => 'string',
		'dinekit_order_notes'      => 'string',
		'dinekit_order_when'       => 'string',  // 'asap' or H:i.
		'dinekit_order_payment'    => 'string',  // unpaid | pending | authorized | paid | refunded | released | on_collection.
		'dinekit_order_source'     => 'string',
		'dinekit_order_pi'         => 'string',  // Stripe PaymentIntent id.
		'dinekit_order_archived'   => 'integer', // 1 = archived (never hard-deleted).
		'dinekit_order_history'    => 'string',  // JSON: [{t:ISO, e:event}] audit trail.
		'dinekit_order_refund_due' => 'integer', // 1 = a refund is owed but failed automatically.
		'dinekit_order_email_log'  => 'string',  // JSON: [{t,to,type,ok}] email sends.
		'dinekit_order_printed'    => 'string',  // ISO time the ticket was last printed.
		'dinekit_order_fulfilment' => 'string',  // collection | delivery.
		'dinekit_order_address'    => 'string',  // Delivery address (when delivery).
		'dinekit_order_fee'        => 'string',  // Delivery fee (decimal string).
		'dinekit_order_channel'    => 'string',  // online | takeaway | dine_in | delivery (POS).
		'dinekit_order_table_id'   => 'integer', // Dine-in table (POS); reuses dinekit_table.
		'dinekit_order_covers'     => 'integer', // Dine-in party size (POS).
		'dinekit_order_tenders'    => 'string',  // JSON: [{type,amount,t}] payments taken (POS).
		'dinekit_order_service'    => 'string',  // Service charge (decimal string).
		'dinekit_order_tip'        => 'string',  // Tip (decimal string).
		'dinekit_order_discount'   => 'string',  // Discount (decimal string).
		'dinekit_order_pay_token'  => 'string',  // Public pay-by-QR token.
	);
	foreach ( $meta as $key => $type ) {
		register_post_meta(
			'dinekit_order',
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
		'enabled'          => true,
		'auto_accept'      => false, // false = receive & hold (accept/reject); true = auto-accept on arrival.
		'prep_mins'        => 30,    // Minimum lead time before collection.
		'min_order'        => 0,     // Minimum order value (0 = none).
		'emails_enabled'   => true,  // Send customer + kitchen order emails.
		'notify_email'     => '',    // Kitchen recipient (empty = site admin).
		'printer_email'    => '',    // Email-to-print device address (auto-print tickets).
		// Delivery (non-tracked). Live driver/Maps tracking is a later expansion.
		'delivery_enabled' => false, // Offer delivery alongside collection.
		'delivery_fee'     => 0,     // Flat delivery fee.
		'delivery_min'     => 0,     // Minimum food subtotal for delivery (0 = none).
		'delivery_mins'    => 45,    // Estimated delivery lead time.
		'delivery_area'    => '',    // Free-text note about the delivery area/zones.
	);
	$stored   = get_option( SETTINGS, array() );
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
	if ( isset( $data['auto_accept'] ) ) {
		$current['auto_accept'] = (bool) $data['auto_accept'];
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
	if ( isset( $data['printer_email'] ) ) {
		$pemail                   = sanitize_email( (string) $data['printer_email'] );
		$current['printer_email'] = is_email( $pemail ) ? $pemail : '';
	}
	if ( isset( $data['delivery_enabled'] ) ) {
		$current['delivery_enabled'] = (bool) $data['delivery_enabled'];
	}
	if ( isset( $data['delivery_fee'] ) ) {
		$current['delivery_fee'] = max( 0, (float) $data['delivery_fee'] );
	}
	if ( isset( $data['delivery_min'] ) ) {
		$current['delivery_min'] = max( 0, (float) $data['delivery_min'] );
	}
	if ( isset( $data['delivery_mins'] ) ) {
		$current['delivery_mins'] = max( 0, min( 480, absint( $data['delivery_mins'] ) ) );
	}
	if ( isset( $data['delivery_area'] ) ) {
		$current['delivery_area'] = sanitize_text_field( (string) $data['delivery_area'] );
	}
	update_option( SETTINGS, $current );
	return $current;
}

/**
 * Append an event to an order's history audit trail (oldest first).
 *
 * @param int    $id    Order id.
 * @param string $event Human-readable event.
 * @return void
 */
function log_event( $id, $event ) {
	$log = json_decode( (string) get_post_meta( $id, 'dinekit_order_history', true ), true );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	$log[] = array(
		't' => current_time( 'c' ),
		'e' => (string) $event,
	);
	if ( count( $log ) > 100 ) {
		$log = array_slice( $log, -100 );
	}
	update_post_meta( $id, 'dinekit_order_history', wp_json_encode( $log ) );
}

/**
 * Capture an authorized PaymentIntent hold when an order is accepted. No-op
 * unless the order is currently holding an authorized card (receive-and-hold
 * mode); immediately-charged and cash orders are left untouched.
 *
 * @param int $id Order id.
 * @return void
 */
function capture_payment( $id ) {
	$pi  = (string) get_post_meta( $id, 'dinekit_order_pi', true );
	$pay = (string) get_post_meta( $id, 'dinekit_order_payment', true );
	// 'authorized' = webhook confirmed the hold; 'pending' = hold placed but the
	// webhook may not have landed yet — capture is safe either way (Stripe errors
	// harmlessly if there's nothing to capture).
	if ( '' === $pi || ! in_array( $pay, array( 'authorized', 'pending' ), true ) ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/payments.php';
	$res = \DineKit\Payments\stripe_post( 'payment_intents/' . rawurlencode( $pi ) . '/capture', array() );
	if ( is_wp_error( $res ) ) {
		log_event( $id, sprintf( /* translators: %s: error message. */ __( 'Card capture failed: %s', 'dinekit' ), $res->get_error_message() ) );
		return;
	}
	update_post_meta( $id, 'dinekit_order_payment', 'paid' );
	log_event( $id, __( 'Card captured — payment taken', 'dinekit' ) );
}

/**
 * On reject/cancel: release the hold if the card was only authorized (customer
 * never charged), or refund if it was already captured. Flags that the customer
 * should be notified of a refund.
 *
 * @param int $id Order id.
 * @return void
 */
function release_or_refund( $id ) {
	$pi  = (string) get_post_meta( $id, 'dinekit_order_pi', true );
	$pay = (string) get_post_meta( $id, 'dinekit_order_payment', true );
	if ( '' === $pi ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/payments.php';

	if ( 'authorized' === $pay || 'pending' === $pay ) {
		$res = \DineKit\Payments\stripe_post( 'payment_intents/' . rawurlencode( $pi ) . '/cancel', array() );
		if ( ! is_wp_error( $res ) ) {
			update_post_meta( $id, 'dinekit_order_payment', 'released' );
			log_event( $id, __( 'Hold released — customer was not charged', 'dinekit' ) );
		} else {
			log_event( $id, sprintf( /* translators: %s: error message. */ __( 'Hold release failed: %s', 'dinekit' ), $res->get_error_message() ) );
		}
		return;
	}

	if ( 'paid' === $pay ) {
		$res = \DineKit\Payments\stripe_post( 'refunds', array( 'payment_intent' => $pi ) );
		if ( ! is_wp_error( $res ) ) {
			update_post_meta( $id, 'dinekit_order_payment', 'refunded' );
			update_post_meta( $id, 'dinekit_order_refund_due', 0 );
			log_event( $id, __( 'Refunded — please let the customer know', 'dinekit' ) );
		} else {
			update_post_meta( $id, 'dinekit_order_refund_due', 1 );
			log_event( $id, sprintf( /* translators: %s: error message. */ __( 'Refund failed (needs manual action): %s', 'dinekit' ), $res->get_error_message() ) );
		}
	}
}

/**
 * Record an email send attempt against an order (so failures are visible in the
 * admin rather than lost).
 *
 * @param int    $id   Order id.
 * @param string $to   Recipient.
 * @param string $type What was sent (e.g. 'confirmation', 'kitchen').
 * @param bool   $ok   Whether wp_mail reported success.
 * @return void
 */
function log_email( $id, $to, $type, $ok ) {
	$log = json_decode( (string) get_post_meta( $id, 'dinekit_order_email_log', true ), true );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	$log[] = array(
		't'    => current_time( 'c' ),
		'to'   => (string) $to,
		'type' => (string) $type,
		'ok'   => $ok ? 1 : 0,
	);
	if ( count( $log ) > 50 ) {
		$log = array_slice( $log, -50 );
	}
	update_post_meta( $id, 'dinekit_order_email_log', wp_json_encode( $log ) );
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
		if ( ! $post || 'dinekit_menu_item' !== $post->post_type || 'publish' !== $post->post_status ) {
			continue;
		}
		$qty = max( 1, min( 20, isset( $line['qty'] ) ? (int) $line['qty'] : 1 ) );

		$prices = get_post_meta( $item_id, 'dinekit_prices', true );
		$prices = is_array( $prices ) ? $prices : array();
		$pidx   = isset( $line['priceIndex'] ) ? (int) $line['priceIndex'] : 0;
		$row    = $prices[ $pidx ] ?? ( $prices[0] ?? array() );
		$unit   = isset( $row['amount'] ) ? (float) $row['amount'] : 0.0;
		$plabel = isset( $row['label'] ) ? (string) $row['label'] : '';

		$mods    = get_post_meta( $item_id, 'dinekit_modifiers', true );
		$mods    = is_array( $mods ) ? $mods : array();
		$chosen  = array();
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
			'station'    => 'bar' === get_post_meta( $item_id, 'dinekit_station', true ) ? 'bar' : 'kitchen',
			// POS per-line metadata (no effect on price); carried through so tabs
			// keep seat/course and which round has been fired to the kitchen.
			'seat'       => isset( $line['seat'] ) ? (int) $line['seat'] : 0,
			'course'     => isset( $line['course'] ) ? sanitize_text_field( (string) $line['course'] ) : '',
			'fired'      => ! empty( $line['fired'] ),
		);
	}

	return array(
		'items' => $items,
		'total' => round( $total, 2 ),
	);
}

/**
 * The orderable menu with 86'd (unavailable) items removed + empty sections
 * dropped — for the public order page (customers never see out-of-stock items).
 *
 * @param int $menu_id Optional menu term id.
 * @return array<int,array<string,mixed>>
 */
function orderable_menu_public( $menu_id = 0 ) {
	$out = array();
	foreach ( orderable_menu( $menu_id ) as $sec ) {
		$items = array_values(
			array_filter(
				$sec['items'],
				static function ( $i ) {
					return ! empty( $i['available'] );
				}
			)
		);
		if ( $items ) {
			$sec['items'] = $items;
			$out[]        = $sec;
		}
	}
	return $out;
}

/**
 * Grand total of an order = food subtotal + service + tip − discount.
 *
 * @param int $order_id Order id.
 * @return float
 */
function grand_total( $order_id ) {
	return round(
		(float) get_post_meta( $order_id, 'dinekit_order_total', true )
		+ (float) get_post_meta( $order_id, 'dinekit_order_service', true )
		+ (float) get_post_meta( $order_id, 'dinekit_order_tip', true )
		- (float) get_post_meta( $order_id, 'dinekit_order_discount', true ),
		2
	);
}

/**
 * Record a payment (tender) against an order and auto-close the tab once the
 * balance is covered. Shared by the POS tender action and the pay-by-QR webhook.
 *
 * @param int    $order_id Order id.
 * @param string $type     Tender type (cash|card|voucher|comp|account).
 * @param float  $amount   Amount.
 * @param string $via      Optional channel note (e.g. 'qr').
 * @return void
 */
function add_tender( $order_id, $type, $amount, $via = '' ) {
	$amount = round( (float) $amount, 2 );
	if ( $amount <= 0 ) {
		return;
	}
	$tenders   = json_decode( (string) get_post_meta( $order_id, 'dinekit_order_tenders', true ), true );
	$tenders   = is_array( $tenders ) ? $tenders : array();
	$tender    = array(
		'type'   => $type,
		'amount' => $amount,
		't'      => current_time( 'c' ),
	);
	if ( '' !== $via ) {
		$tender['via'] = $via;
	}
	$tenders[] = $tender;
	update_post_meta( $order_id, 'dinekit_order_tenders', wp_json_encode( $tenders ) );
	/* translators: 1: tender type, 2: amount. */
	log_event( $order_id, sprintf( __( 'Payment taken: %1$s %2$s', 'dinekit' ), $type, number_format( $amount, 2 ) ) );

	$paid = 0.0;
	foreach ( $tenders as $t ) {
		$paid += (float) $t['amount'];
	}
	if ( round( $paid - grand_total( $order_id ), 2 ) >= 0 ) {
		update_post_meta( $order_id, 'dinekit_order_payment', 'paid' );
		update_post_meta( $order_id, 'dinekit_order_status', 'completed' );
		log_event( $order_id, __( 'Tab settled & closed', 'dinekit' ) );
	}
}
