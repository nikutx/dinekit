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

	// Nightly self-healing: yesterday's leftovers (a tab nobody settled, a
	// booking nobody completed, a cleaning flag nobody tapped) must never
	// light today's floor. Real services forget things — the software tidies.
	add_action( 'init', __NAMESPACE__ . '\\schedule_sweep' );
	add_action( 'dinekit_daily_sweep', __NAMESPACE__ . '\\sweep_stale_service' );
}

/**
 * Keep the daily sweep scheduled.
 *
 * @return void
 */
function schedule_sweep() {
	if ( ! wp_next_scheduled( 'dinekit_daily_sweep' ) ) {
		wp_schedule_event( time() + 600, 'daily', 'dinekit_daily_sweep' );
	}
}

/**
 * Close out anything left over from previous days: open dine-in tabs become
 * completed (logged as auto-closed), seated bookings from past days complete,
 * and cleaning flags older than 12 hours clear. Today's live service is
 * never touched.
 *
 * @return void
 */
function sweep_stale_service() {
	$today = current_time( 'Y-m-d' );

	// Dine-in tabs from previous days still "open" on the floor.
	$orders = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- bounded nightly sweep.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'date_query'     => array(
				array(
					'before' => $today . ' 00:00:00',
				),
			),
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- daily cron, bounded set.
				array(
					'key'   => 'dinekit_order_channel',
					'value' => 'dine_in',
				),
			),
		)
	);
	foreach ( $orders as $oid ) {
		$status = (string) get_post_meta( $oid, 'dinekit_order_status', true );
		if ( ! in_array( $status, array( 'completed', 'cancelled' ), true ) ) {
			update_post_meta( $oid, 'dinekit_order_status', 'completed' );
			log_event( $oid, __( 'Auto-closed by the nightly sweep — left open from a previous day', 'dinekit' ) );
		}
	}

	// Seated bookings from previous days.
	$bookings = get_posts(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 500, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- bounded nightly sweep.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- daily cron, bounded set.
				array(
					'key'   => 'dinekit_status',
					'value' => 'seated',
				),
				array(
					'key'     => 'dinekit_date',
					'value'   => $today,
					'compare' => '<',
				),
			),
		)
	);
	foreach ( $bookings as $bid ) {
		update_post_meta( $bid, 'dinekit_status', 'completed' );
	}

	// Cleaning flags nobody tapped (older than 12h).
	$tables = get_posts(
		array(
			'post_type'      => 'dinekit_table',
			'post_status'    => 'publish',
			'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- bounded nightly sweep.
			'no_found_rows'  => true,
			'fields'         => 'ids',
		)
	);
	foreach ( $tables as $tid ) {
		$since = (string) get_post_meta( $tid, 'dinekit_cleaning', true );
		if ( '' !== $since && strtotime( $since ) < strtotime( current_time( 'mysql' ) ) - 12 * HOUR_IN_SECONDS ) {
			delete_post_meta( $tid, 'dinekit_cleaning' );
		}
	}
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
	require_once DINEKIT_DIR . 'includes/items.php';
	// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
	$args['meta_query'] = \DineKit\Items\exclude_archived_meta_query();
	$query              = new \WP_Query( $args );

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
		'served'           => __( 'Served', 'dinekit' ),
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
		'dinekit_order_number'       => 'integer',
		'dinekit_order_items'        => 'string',  // JSON of recomputed lines.
		'dinekit_order_total'        => 'string',  // Decimal string.
		'dinekit_order_status'       => 'string',
		'dinekit_order_name'         => 'string',
		'dinekit_order_email'        => 'string',
		'dinekit_order_phone'        => 'string',
		'dinekit_order_notes'        => 'string',
		'dinekit_order_when'         => 'string',  // 'asap' or H:i.
		'dinekit_order_when_date'    => 'string',  // Y-m-d when scheduled for a future day ('' = today).
		'dinekit_order_checked'      => 'string',  // ISO time the floor last checked the table.
		'dinekit_order_slot'         => 'string',  // Kitchen capacity slot key (Y-m-d H:i bucket).
		'dinekit_order_payment'      => 'string',  // unpaid | pending | authorized | paid | refunded | released | on_collection.
		'dinekit_order_source'       => 'string',
		'dinekit_order_pi'           => 'string',  // Stripe PaymentIntent id.
		'dinekit_order_archived'     => 'integer', // 1 = archived (never hard-deleted).
		'dinekit_order_history'      => 'string',  // JSON: [{t:ISO, e:event}] audit trail.
		'dinekit_order_refund_due'   => 'integer', // 1 = a refund is owed but failed automatically.
		'dinekit_order_email_log'    => 'string',  // JSON: [{t,to,type,ok}] email sends.
		'dinekit_order_printed'      => 'string',  // ISO time the ticket was last printed.
		'dinekit_order_fulfilment'   => 'string',  // collection | delivery.
		'dinekit_order_address'      => 'string',  // Delivery address (when delivery).
		'dinekit_order_fee'          => 'string',  // Delivery fee (decimal string).
		'dinekit_order_channel'      => 'string',  // online | takeaway | dine_in | delivery (POS).
		'dinekit_order_table_id'     => 'integer', // Dine-in table (POS); reuses dinekit_table.
		'dinekit_order_covers'       => 'integer', // Dine-in party size (POS).
		'dinekit_order_tenders'      => 'string',  // JSON: [{type,amount,t}] payments taken (POS).
		'dinekit_order_service'      => 'string',  // Service charge (decimal string).
		'dinekit_order_tip'          => 'string',  // Tip (decimal string).
		'dinekit_order_discount'     => 'string',  // Discount (decimal string).
		'dinekit_order_pay_token'    => 'string',  // Public pay-by-QR token.
		'dinekit_order_member'       => 'integer', // Loyalty member on the tab.
		'dinekit_order_redeem'       => 'integer', // Points redeemed on this order.
		'dinekit_order_loyalty_done' => 'integer', // 1 once points have been awarded.
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
		// Trading window. Opening Hours is the single source of truth: by default we
		// take orders whenever the venue is open, right up to closing time.
		'hours_gate'       => true,  // Refuse orders when Opening Hours say closed.
		'last_orders_mins' => 0,     // Stop taking orders N mins before close (0 = until close).
		'prep_mins'        => 30,    // Minimum lead time before collection.
		'min_order'        => 0,     // Minimum order value (0 = none).
		'slot_mins'        => 15,    // Kitchen time-slot length, minutes (for capacity throttling).
		'slot_max'         => 0,     // Max orders per slot (0 = unlimited / off).
		'preorder_days'    => 0,     // Days ahead a diner may schedule an order (0 = today only).
		'kds_lead_mins'    => 60,    // Show a TIMED order on the kitchen screen N min before its slot (0 = all day).
		'emails_enabled'   => true,  // Send customer + kitchen order emails.
		'notify_email'     => '',    // Kitchen recipient (empty = site admin).
		'printer_email'    => '',    // Email-to-print device address (auto-print tickets).
		// Delivery (non-tracked). Live driver/Maps tracking is a later expansion.
		'delivery_enabled' => false, // Offer delivery alongside collection.
		'delivery_fee'     => 0,     // Flat delivery fee.
		'delivery_min'     => 0,     // Minimum food subtotal for delivery (0 = none).
		'delivery_mins'    => 45,    // Estimated delivery lead time.
		'delivery_area'    => '',    // Free-text note about the delivery area/zones.
		'table_qr_pay'     => false, // Table QR orders: false = add to tab (pay later), true = pay upfront.
		'service_pct'      => 12.5,  // Default dine-in service charge %, editable at the till (saves back here).
	);
	$stored   = get_option( SETTINGS, array() );
	return is_array( $stored ) ? array_merge( $defaults, $stored ) : $defaults;
}

/**
 * Are we currently accepting orders? Opening Hours decide whether the venue is
 * trading; `last_orders_mins` pulls the shutter down early. Both admin (kitchen
 * board) and the public checkout ask this, so there's one answer, not two.
 *
 * @return array{accepting:bool,reason:string,message:string}
 */
function accepting_orders() {
	$s = namespace\get_settings();

	if ( empty( $s['enabled'] ) ) {
		return array(
			'accepting' => false,
			'reason'    => 'disabled',
			'message'   => __( 'Online ordering is currently unavailable.', 'dinekit' ),
		);
	}
	if ( empty( $s['hours_gate'] ) ) {
		return array(
			'accepting' => true,
			'reason'    => '',
			'message'   => '',
		);
	}

	require_once DINEKIT_DIR . 'includes/hours.php';
	$status = \DineKit\Hours\status();

	if ( empty( $status['open'] ) ) {
		return array(
			'accepting' => false,
			'reason'    => 'closed',
			'message'   => __( 'We’re closed right now, so we can’t take your order.', 'dinekit' ),
		);
	}

	$cutoff_mins = (int) $s['last_orders_mins'];
	if ( $cutoff_mins > 0 && ! empty( $status['until_ts'] ) ) {
		$cutoff_ts = (int) $status['until_ts'] - ( $cutoff_mins * MINUTE_IN_SECONDS );
		if ( time() >= $cutoff_ts ) {
			return array(
				'accepting' => false,
				'reason'    => 'last_orders',
				'message'   => sprintf(
					/* translators: %s: last-orders time, e.g. "21:30". */
					__( 'Last orders were at %s. We’re no longer taking orders tonight.', 'dinekit' ),
					wp_date( 'H:i', $cutoff_ts )
				),
			);
		}
	}

	return array(
		'accepting' => true,
		'reason'    => '',
		'message'   => '',
	);
}

/**
 * The kitchen time-slot key for a requested fulfilment time. Orders are bucketed
 * into slots of `slot_mins`; ASAP orders land in the slot `prep_mins` out (when
 * the food will actually be ready). The returned key is a stable string used to
 * count how many orders target the same slot.
 *
 * @param string $when 'asap' or 'HH:MM'.
 * @param string $date Optional Y-m-d for a scheduled future-day order; '' = today.
 * @return string Slot key, e.g. "2026-07-27 19:15".
 */
function slot_key( $when, $date = '' ) {
	$s    = namespace\get_settings();
	$mins = max( 5, (int) $s['slot_mins'] );
	// phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested -- relative slot bucketing, not an absolute/UTC time.
	$now = current_time( 'timestamp' );
	$day = preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $date ) ? $date : wp_date( 'Y-m-d' );
	if ( 'asap' === $when || ! preg_match( '/^\d{1,2}:\d{2}$/', (string) $when ) ) {
		// ASAP only makes sense today; a future day without a time lands on noon
		// so the key is at least stable (the REST layer rejects that combo anyway).
		$target = wp_date( 'Y-m-d' ) === $day ? $now + ( (int) $s['prep_mins'] * 60 ) : strtotime( $day . ' 12:00:00' );
	} else {
		$target = strtotime( $day . ' ' . $when . ':00' );
		if ( ! $target ) {
			$target = $now;
		}
	}
	$bucket = (int) floor( $target / ( $mins * 60 ) ) * ( $mins * 60 );
	return gmdate( 'Y-m-d H:i', $bucket );
}

/**
 * Which of the given fulfilment times are already at capacity.
 *
 * Answers the public order form's "don't offer a slot the kitchen can't take"
 * question. The CLIENT sends its candidate times and we map them through
 * slot_key() here — deliberately, so the bucketing rule lives in exactly one
 * place. Duplicating it in JS would drift the moment slot_mins changed.
 *
 * One query for the whole day rather than one per slot: a public endpoint that
 * fired 40 meta queries per checkout render would be a gift to anyone looking
 * for a cheap way to load the site.
 *
 * @param string[] $times Candidate times ('asap' or 'HH:MM').
 * @param string   $date  Optional Y-m-d for a scheduled day; '' = today.
 * @return string[] The subset that is full. Empty when the throttle is off.
 */
function full_slots( $times, $date = '' ) {
	$s   = namespace\get_settings();
	$max = (int) $s['slot_max'];
	if ( $max <= 0 ) {
		return array();
	}
	$counts = namespace\slot_counts_for_day( $date );
	$full   = array();
	foreach ( (array) $times as $when ) {
		$key = namespace\slot_key( $when, $date );
		if ( isset( $counts[ $key ] ) && $counts[ $key ] >= $max ) {
			$full[] = $when;
		}
	}
	return $full;
}

/**
 * The venue's open periods on a given date, honouring holiday overrides —
 * the Opening Hours week template projected onto a calendar day.
 *
 * @param string $date Y-m-d.
 * @return array<int,array{open:string,close:string}>
 */
function periods_for_date( $date ) {
	require_once DINEKIT_DIR . 'includes/hours.php';
	$data = \DineKit\Hours\get();
	foreach ( (array) $data['holidays'] as $holiday ) {
		if ( isset( $holiday['date'] ) && $holiday['date'] === $date ) {
			return ! empty( $holiday['closed'] ) ? array() : (array) $holiday['periods'];
		}
	}
	$ts = strtotime( $date . ' 12:00:00' );
	if ( ! $ts ) {
		return array();
	}
	$day_key = strtolower( substr( gmdate( 'D', $ts ), 0, 3 ) );
	return isset( $data['week'][ $day_key ] ) ? (array) $data['week'][ $day_key ] : array();
}

/**
 * Is the venue open at a specific date + time (per Opening Hours)?
 *
 * @param string $date Y-m-d.
 * @param string $time HH:MM.
 * @return bool
 */
function open_at( $date, $time ) {
	foreach ( namespace\periods_for_date( $date ) as $p ) {
		if ( isset( $p['open'], $p['close'] ) && $time >= $p['open'] && $time < $p['close'] ) {
			return true;
		}
	}
	return false;
}

/**
 * Live order counts per slot key for a day, as slot_key => count.
 *
 * @param string $date Y-m-d; defaults to today in site time.
 * @return array<string,int>
 */
function slot_counts_for_day( $date = '' ) {
	$date   = '' !== $date ? $date : wp_date( 'Y-m-d' );
	$ids    = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 500, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- one day's orders.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'     => 'dinekit_order_slot',
					'value'   => $date,
					'compare' => 'LIKE',
				),
			),
		)
	);
	$counts = array();
	foreach ( $ids as $id ) {
		if ( 'cancelled' === (string) get_post_meta( $id, 'dinekit_order_status', true ) ) {
			continue;
		}
		$key = (string) get_post_meta( $id, 'dinekit_order_slot', true );
		if ( '' !== $key ) {
			$counts[ $key ] = isset( $counts[ $key ] ) ? $counts[ $key ] + 1 : 1;
		}
	}
	return $counts;
}

/**
 * How many live (non-cancelled) orders already target a given slot key.
 *
 * @param string $slot_key Slot key from slot_key().
 * @return int
 */
function slot_count( $slot_key ) {
	$ids = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- one slot's orders.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'   => 'dinekit_order_slot',
					'value' => $slot_key,
				),
			),
		)
	);
	$n   = 0;
	foreach ( $ids as $id ) {
		if ( 'cancelled' !== (string) get_post_meta( $id, 'dinekit_order_status', true ) ) {
			++$n;
		}
	}
	return $n;
}

/**
 * Save ordering settings.
 *
 * @param array<string,mixed> $data Incoming.
 * @return array<string,mixed>
 */
function save_settings( $data ) {
	$current = namespace\get_settings();
	if ( isset( $data['enabled'] ) ) {
		$current['enabled'] = (bool) $data['enabled'];
	}
	if ( isset( $data['auto_accept'] ) ) {
		$current['auto_accept'] = (bool) $data['auto_accept'];
	}
	if ( isset( $data['table_qr_pay'] ) ) {
		$current['table_qr_pay'] = (bool) $data['table_qr_pay'];
	}
	if ( isset( $data['hours_gate'] ) ) {
		$current['hours_gate'] = (bool) $data['hours_gate'];
	}
	if ( isset( $data['last_orders_mins'] ) ) {
		$current['last_orders_mins'] = max( 0, min( 480, absint( $data['last_orders_mins'] ) ) );
	}
	if ( isset( $data['prep_mins'] ) ) {
		$current['prep_mins'] = max( 0, min( 480, absint( $data['prep_mins'] ) ) );
	}
	if ( isset( $data['min_order'] ) ) {
		$current['min_order'] = max( 0, (float) $data['min_order'] );
	}
	if ( isset( $data['slot_mins'] ) ) {
		$current['slot_mins'] = max( 5, min( 120, absint( $data['slot_mins'] ) ) );
	}
	if ( isset( $data['slot_max'] ) ) {
		$current['slot_max'] = max( 0, min( 500, absint( $data['slot_max'] ) ) );
	}
	if ( isset( $data['preorder_days'] ) ) {
		$current['preorder_days'] = max( 0, min( 14, absint( $data['preorder_days'] ) ) );
	}
	if ( isset( $data['kds_lead_mins'] ) ) {
		$current['kds_lead_mins'] = max( 0, min( 1440, absint( $data['kds_lead_mins'] ) ) );
	}
	if ( isset( $data['service_pct'] ) ) {
		$current['service_pct'] = max( 0, min( 100, (float) $data['service_pct'] ) );
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
	update_post_meta( $id, 'dinekit_order_history', wp_slash( wp_json_encode( $log ) ) );
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
 * Partial refund: refund only the selected line items (e.g. one dish sent back),
 * not the whole order. The amount is recomputed server-side from those lines'
 * totals — never trusted from the client — the lines are marked refunded so they
 * can't be refunded twice, and the payment lands on 'part_refunded' (or
 * 'refunded' once every line has been). Card → a partial Stripe refund; cash /
 * no-PI → recorded for the books.
 *
 * @param int   $id      Order id.
 * @param int[] $indexes Line indexes to refund.
 * @return float The amount refunded (0 if nothing eligible).
 */
function refund_lines( $id, $indexes ) {
	$items = json_decode( (string) get_post_meta( $id, 'dinekit_order_items', true ), true );
	if ( ! is_array( $items ) ) {
		return 0.0;
	}
	$amount = 0.0;
	$labels = array();
	foreach ( $indexes as $i ) {
		$i = (int) $i;
		if ( isset( $items[ $i ] ) && empty( $items[ $i ]['refunded'] ) ) {
			$amount                 += (float) ( $items[ $i ]['lineTotal'] ?? 0 );
			$items[ $i ]['refunded'] = true;
			$labels[]                = ( $items[ $i ]['qty'] ?? 1 ) . '× ' . ( $items[ $i ]['title'] ?? __( 'item', 'dinekit' ) );
		}
	}
	$amount = round( $amount, 2 );
	if ( $amount <= 0 ) {
		return 0.0;
	}
	update_post_meta( $id, 'dinekit_order_items', wp_slash( wp_json_encode( $items ) ) );

	$pi  = (string) get_post_meta( $id, 'dinekit_order_pi', true );
	$pay = (string) get_post_meta( $id, 'dinekit_order_payment', true );
	$ok  = true;
	if ( '' !== $pi && 'paid' === $pay ) {
		require_once DINEKIT_DIR . 'includes/payments.php';
		$res = \DineKit\Payments\stripe_post(
			'refunds',
			array(
				'payment_intent' => $pi,
				'amount'         => (int) round( $amount * 100 ),
			)
		);
		$ok  = ! is_wp_error( $res );
		if ( ! $ok ) {
			update_post_meta( $id, 'dinekit_order_refund_due', 1 );
			log_event( $id, sprintf( /* translators: %s: error message. */ __( 'Partial refund failed (needs manual action): %s', 'dinekit' ), $res->get_error_message() ) );
		}
	}

	$refunded = round( (float) get_post_meta( $id, 'dinekit_order_refunded', true ) + $amount, 2 );
	update_post_meta( $id, 'dinekit_order_refunded', $refunded );

	$all_refunded = true;
	foreach ( $items as $li ) {
		if ( empty( $li['refunded'] ) ) {
			$all_refunded = false;
			break;
		}
	}
	if ( $ok ) {
		update_post_meta( $id, 'dinekit_order_payment', $all_refunded ? 'refunded' : 'part_refunded' );
	}
	log_event(
		$id,
		sprintf(
			/* translators: 1: amount, 2: item list. */
			__( 'Refunded %1$s (%2$s)', 'dinekit' ),
			number_format( $amount, 2 ),
			implode( ', ', $labels )
		)
	);
	return $amount;
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
	update_post_meta( $id, 'dinekit_order_email_log', wp_slash( wp_json_encode( $log ) ) );
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
 * Normalise a client-supplied line uid, or mint one when absent/invalid.
 *
 * @param string $uid Raw uid.
 * @return string
 */
function line_uid( $uid ) {
	$uid = substr( preg_replace( '/[^A-Za-z0-9_-]/', '', $uid ), 0, 48 );
	return '' !== $uid ? $uid : 'l' . wp_generate_password( 12, false );
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
		// 86'd items can't be ordered by anyone (public, POS, or table QR).
		if ( 'out' === (string) get_post_meta( $item_id, 'dinekit_stock', true ) ) {
			continue;
		}
		// Nor can archived ones — the id may still be sitting in a stale cart.
		require_once DINEKIT_DIR . 'includes/items.php';
		if ( \DineKit\Items\is_archived( $item_id ) ) {
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
			// Stable line id: void/edit actions target this, not an index that a
			// second tablet's mid-outage edit could shift. Client-supplied so an
			// offline-queued void refers to the same id its queued add created.
			'uid'        => line_uid( isset( $line['uid'] ) ? (string) $line['uid'] : '' ),
		);
	}

	return array(
		'items' => $items,
		'total' => round( $total, 2 ),
	);
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
function add_tender( $order_id, $type, $amount, $via = '', $ref = '' ) {
	$amount = round( (float) $amount, 2 );
	if ( $amount <= 0 ) {
		return;
	}
	$tenders = json_decode( (string) get_post_meta( $order_id, 'dinekit_order_tenders', true ), true );
	$tenders = is_array( $tenders ) ? $tenders : array();
	// Idempotency: a cash tender queued offline carries a stable ref. If a tender
	// with that ref is already recorded (queue replayed), do nothing — never
	// record a payment twice or settle the tab a second time.
	if ( '' !== $ref ) {
		foreach ( $tenders as $t ) {
			if ( isset( $t['ref'] ) && $t['ref'] === $ref ) {
				return;
			}
		}
	}
	$tender = array(
		'type'   => $type,
		'amount' => $amount,
		't'      => current_time( 'c' ),
	);
	if ( '' !== $via ) {
		$tender['via'] = $via;
	}
	if ( '' !== $ref ) {
		$tender['ref'] = $ref;
	}
	$tenders[] = $tender;
	update_post_meta( $order_id, 'dinekit_order_tenders', wp_slash( wp_json_encode( $tenders ) ) );
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
		// Award loyalty points to any member on the tab.
		$member = (int) get_post_meta( $order_id, 'dinekit_order_member', true );
		if ( $member ) {
			require_once DINEKIT_DIR . 'includes/loyalty.php';
			\DineKit\Loyalty\award( $order_id, $member );
		}
		flag_table_for_bussing( $order_id );
		complete_linked_booking( $order_id );
	}
}

/**
 * Mark a settled dine-in table as needing bussing, so it shows on the live floor
 * as "needs clearing" until staff tap it ready.
 *
 * Called from wherever a tab actually becomes settled. That is `add_tender()` —
 * which every till payment routes through (cash, card, Terminal, voucher, comp,
 * pay-by-QR) — as well as the explicit `close` action. Stamping it only in
 * `close` left the flag unreachable from the POS, because settling a bill
 * completes the order via `add_tender()` and never calls `close`.
 *
 * @param int $order_id Order id.
 * @return void
 */
function flag_table_for_bussing( $order_id ) {
	$channel = (string) get_post_meta( $order_id, 'dinekit_order_channel', true );
	$table   = (int) get_post_meta( $order_id, 'dinekit_order_table_id', true );
	if ( 'dine_in' !== $channel || ! $table || 'dinekit_table' !== get_post_type( $table ) ) {
		return;
	}
	update_post_meta( $table, 'dinekit_cleaning', current_time( 'mysql' ) );
}

/**
 * Tie a new dine-in tab to the booking diary, so every screen reads the same
 * venue: if a booking is due/seated on this table it is marked seated and
 * linked; if the table was free, the till books a walk-in into the diary
 * (same as the host's Walk-in button) — the floor plan, timeline and list all
 * see the table taken the moment an order is started on it.
 *
 * @param int $order_id Order id (dine-in tab).
 * @return void
 */
function link_booking_for_tab( $order_id ) {
	$channel = (string) get_post_meta( $order_id, 'dinekit_order_channel', true );
	$table   = (int) get_post_meta( $order_id, 'dinekit_order_table_id', true );
	if ( 'dine_in' !== $channel || ! $table || 'dinekit_table' !== get_post_type( $table ) ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$bs    = \DineKit\Bookings\Settings\get();
	$turn  = max( 15, (int) ( isset( $bs['turn_time'] ) ? $bs['turn_time'] : 120 ) );
	$today = current_time( 'Y-m-d' );
	$now   = current_time( 'H:i' );

	$ids    = get_posts(
		array(
			'post_type'   => 'dinekit_booking',
			'post_status' => 'publish',
			'numberposts' => -1,
			'fields'      => 'ids',
			'meta_query'  => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- small per-day set, POS action.
				array(
					'key'   => 'dinekit_date',
					'value' => $today,
				),
				array(
					'key'   => 'dinekit_table_id',
					'value' => $table,
				),
			),
		)
	);
	$linked = 0;
	foreach ( $ids as $bid ) {
		$status = (string) get_post_meta( $bid, 'dinekit_status', true );
		if ( in_array( $status, array( 'cancelled', 'no_show', 'completed' ), true ) ) {
			continue;
		}
		if ( 'seated' === $status ) {
			$linked = $bid;
			break;
		}
		// A reservation due about now (arrived up to 30 min early, or within
		// its turn): starting the tab IS the arrival — mark it seated.
		$mins_in = ( strtotime( $today . ' ' . $now ) - strtotime( $today . ' ' . (string) get_post_meta( $bid, 'dinekit_time', true ) ) ) / 60;
		if ( $mins_in >= -30 && $mins_in <= $turn && ! $linked ) {
			$linked = $bid;
		}
	}
	if ( $linked ) {
		update_post_meta( $linked, 'dinekit_status', 'seated' );
		if ( '' === (string) get_post_meta( $linked, 'dinekit_seated_at', true ) ) {
			update_post_meta( $linked, 'dinekit_seated_at', current_time( 'c' ) );
		}
		update_post_meta( $order_id, 'dinekit_order_booking', (int) $linked );
		return;
	}

	// No booking → auto-book a seated walk-in on the diary's usual 15-min grid.
	// Party defaults to the table's seat count when the till didn't say: the
	// whole table is blocked either way, and that's what availability reads.
	$covers = (int) get_post_meta( $order_id, 'dinekit_order_covers', true );
	if ( $covers <= 0 ) {
		$covers = (int) get_post_meta( $table, 'dinekit_seats', true );
	}
	$name = (string) get_post_meta( $order_id, 'dinekit_order_name', true );
	$slot = gmdate( 'H:i', (int) ( floor( strtotime( $today . ' ' . $now ) / 900 ) * 900 ) );
	$bid  = wp_insert_post(
		array(
			'post_type'   => 'dinekit_booking',
			'post_status' => 'publish',
			'post_title'  => sprintf( '%s — %s %s (%dp)', '' !== $name ? $name : __( 'Walk-in', 'dinekit' ), $today, $slot, max( 1, $covers ) ),
		),
		true
	);
	if ( is_wp_error( $bid ) ) {
		return;
	}
	update_post_meta( $bid, 'dinekit_date', $today );
	update_post_meta( $bid, 'dinekit_time', $slot );
	update_post_meta( $bid, 'dinekit_party', max( 1, $covers ) );
	update_post_meta( $bid, 'dinekit_table_id', $table );
	update_post_meta( $bid, 'dinekit_combo_id', 0 );
	update_post_meta( $bid, 'dinekit_name', '' !== $name ? $name : __( 'Walk-in', 'dinekit' ) );
	update_post_meta( $bid, 'dinekit_status', 'seated' );
	update_post_meta( $bid, 'dinekit_seated_at', current_time( 'c' ) );
	update_post_meta( $bid, 'dinekit_source', 'pos' );
	update_post_meta( $order_id, 'dinekit_order_booking', (int) $bid );
	log_event( $order_id, __( 'Walk-in booked into the diary from the till', 'dinekit' ) );
}

/**
 * Settling the tab ends the sitting: the linked (or seated) booking on the
 * table completes, freeing it in the diary and on every screen.
 *
 * @param int $order_id Order id.
 * @return void
 */
function complete_linked_booking( $order_id ) {
	$bid = (int) get_post_meta( $order_id, 'dinekit_order_booking', true );
	if ( ( ! $bid || 'dinekit_booking' !== get_post_type( $bid ) ) ) {
		// Tabs opened before the diary link existed: fall back to the seated
		// booking on this table today, if there is exactly one candidate.
		$table = (int) get_post_meta( $order_id, 'dinekit_order_table_id', true );
		if ( ! $table ) {
			return;
		}
		$ids = get_posts(
			array(
				'post_type'   => 'dinekit_booking',
				'post_status' => 'publish',
				'numberposts' => -1,
				'fields'      => 'ids',
				'meta_query'  => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- small per-day set, POS action.
					array(
						'key'   => 'dinekit_date',
						'value' => current_time( 'Y-m-d' ),
					),
					array(
						'key'   => 'dinekit_table_id',
						'value' => $table,
					),
					array(
						'key'   => 'dinekit_status',
						'value' => 'seated',
					),
				),
			)
		);
		$bid = count( $ids ) === 1 ? (int) $ids[0] : 0;
	}
	if ( $bid && 'seated' === (string) get_post_meta( $bid, 'dinekit_status', true ) ) {
		update_post_meta( $bid, 'dinekit_status', 'completed' );
	}
}

/**
 * Reopen a settled dine-in tab (manager fix-up: settled by mistake, or a
 * mis-keyed payment removed). The sitting is live again everywhere: the tab
 * returns to the floor, the linked booking un-completes back to seated, and
 * the table comes off the "needs bussing" pile.
 *
 * @param int $order_id Order id.
 * @return void
 */
function reopen_tab( $order_id ) {
	update_post_meta( $order_id, 'dinekit_order_status', 'served' );
	$bid = (int) get_post_meta( $order_id, 'dinekit_order_booking', true );
	if ( $bid && 'completed' === (string) get_post_meta( $bid, 'dinekit_status', true ) ) {
		update_post_meta( $bid, 'dinekit_status', 'seated' );
	}
	$table = (int) get_post_meta( $order_id, 'dinekit_order_table_id', true );
	if ( $table && 'dinekit_table' === get_post_type( $table ) ) {
		delete_post_meta( $table, 'dinekit_cleaning' );
	}
}
