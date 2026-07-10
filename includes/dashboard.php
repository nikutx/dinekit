<?php
/**
 * Home dashboard aggregate — today's covers/orders/revenue, alerts, the day's
 * timeline, setup progress and week trends. Read-only; assembled from the
 * booking/order/event data. No custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Dashboard;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Bookings matching a dinekit_date meta filter.
 *
 * @param array<string,mixed> $meta A single meta_query row.
 * @return \WP_Post[]
 */
function bookings_where( $meta ) {
	$query = new \WP_Query(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'meta_query'     => array( $meta ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
		)
	);
	return $query->posts;
}

/**
 * Assemble the dashboard payload.
 *
 * @return array<string,mixed>
 */
function data() {
	require_once DINEKIT_DIR . 'includes/settings.php';
	require_once DINEKIT_DIR . 'includes/sample.php';

	$today      = current_time( 'Y-m-d' );
	$now_ts     = (int) current_time( 'timestamp' );
	$week_start = gmdate( 'Y-m-d', $now_ts - 6 * DAY_IN_SECONDS );
	$settings   = \DineKit\Settings\get();
	$currency   = (string) $settings['currency'];

	/* ---- Bookings today ---- */
	$covers        = 0;
	$pending       = 0;
	$waitlist      = 0;
	$today_list    = array();
	foreach ( bookings_where( array( 'key' => 'dinekit_date', 'value' => $today ) ) as $post ) {
		$status = (string) get_post_meta( $post->ID, 'dinekit_status', true );
		$party  = (int) get_post_meta( $post->ID, 'dinekit_party', true );
		if ( 'pending' === $status ) {
			++$pending;
		}
		if ( 'provisional' === $status ) {
			++$waitlist;
		}
		if ( in_array( $status, array( 'cancelled', 'no_show' ), true ) ) {
			continue;
		}
		$covers      += $party;
		$table_id     = (int) get_post_meta( $post->ID, 'dinekit_table_id', true );
		$combo_id     = (int) get_post_meta( $post->ID, 'dinekit_combo_id', true );
		$today_list[] = array(
			'time'   => (string) get_post_meta( $post->ID, 'dinekit_time', true ),
			'name'   => (string) get_post_meta( $post->ID, 'dinekit_name', true ),
			'party'  => $party,
			'status' => $status,
			'table'  => $combo_id ? get_the_title( $combo_id ) : ( $table_id ? get_the_title( $table_id ) : '' ),
			'notes'  => (string) get_post_meta( $post->ID, 'dinekit_notes', true ),
		);
	}
	usort( $today_list, static function ( $a, $b ) { return strcmp( $a['time'], $b['time'] ); } );

	/* ---- Week covers (+ 7-day series for tile sparklines) ---- */
	$week_covers = 0;
	$series      = array();
	for ( $t = $now_ts - 6 * DAY_IN_SECONDS; $t <= $now_ts; $t += DAY_IN_SECONDS ) {
		$series[ gmdate( 'Y-m-d', $t ) ] = array( 'covers' => 0, 'revenue' => 0.0, 'orders' => 0 );
	}
	foreach ( bookings_where( array( 'key' => 'dinekit_date', 'value' => array( $week_start, $today ), 'compare' => 'BETWEEN', 'type' => 'DATE' ) ) as $post ) {
		if ( ! in_array( get_post_meta( $post->ID, 'dinekit_status', true ), array( 'cancelled', 'no_show' ), true ) ) {
			$party        = (int) get_post_meta( $post->ID, 'dinekit_party', true );
			$week_covers += $party;
			$b_date       = (string) get_post_meta( $post->ID, 'dinekit_date', true );
			if ( isset( $series[ $b_date ] ) ) {
				$series[ $b_date ]['covers'] += $party;
			}
		}
	}

	/* ---- Orders today + this week ---- */
	$orders_today  = 0;
	$revenue_today = 0.0;
	$active_orders = 0;
	$recent_orders = array();
	$order_posts   = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 200,
			'no_found_rows'  => true,
			'orderby'        => 'date',
			'order'          => 'DESC',
		)
	);
	$week_revenue = 0.0;
	foreach ( $order_posts as $post ) {
		$status = (string) get_post_meta( $post->ID, 'dinekit_order_status', true );
		$total  = (float) get_post_meta( $post->ID, 'dinekit_order_total', true );
		$date   = get_post_time( 'Y-m-d', false, $post );
		if ( 'cancelled' !== $status && $date >= $week_start ) {
			$week_revenue += $total;
			if ( isset( $series[ $date ] ) ) {
				$series[ $date ]['revenue'] += $total;
				$series[ $date ]['orders']  += 1;
			}
		}
		if ( in_array( $status, array( 'new', 'preparing', 'ready' ), true ) ) {
			++$active_orders;
		}
		if ( $date === $today && 'cancelled' !== $status ) {
			++$orders_today;
			$revenue_today += $total;
		}
		if ( count( $recent_orders ) < 6 ) {
			$recent_orders[] = array(
				'number' => (int) get_post_meta( $post->ID, 'dinekit_order_number', true ),
				'name'   => (string) get_post_meta( $post->ID, 'dinekit_order_name', true ),
				'total'  => (string) get_post_meta( $post->ID, 'dinekit_order_total', true ),
				'status' => $status,
			);
		}
	}

	/* ---- Upcoming events ---- */
	$events = array();
	foreach ( get_posts( array( 'post_type' => 'dinekit_event', 'post_status' => 'publish', 'posts_per_page' => 50, 'no_found_rows' => true ) ) as $post ) {
		if ( 'published' !== get_post_meta( $post->ID, 'dinekit_event_status', true ) ) {
			continue;
		}
		$date = (string) get_post_meta( $post->ID, 'dinekit_event_date', true );
		if ( $date && $date >= $today ) {
			$events[] = array( 'name' => $post->post_title, 'date' => $date );
		}
	}
	usort( $events, static function ( $a, $b ) { return strcmp( $a['date'], $b['date'] ); } );
	$events = array_slice( $events, 0, 4 );

	/* ---- Setup checklist ---- */
	require_once DINEKIT_DIR . 'includes/integrations.php';
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	$items       = (int) wp_count_posts( 'dinekit_menu_item' )->publish;
	$tables      = (int) wp_count_posts( 'dinekit_table' )->publish;
	$bookings    = (int) wp_count_posts( 'dinekit_booking' )->publish;
	$hours       = get_option( 'dinekit_hours' );
	$has_hours   = is_array( $hours ) && ! empty( $hours['week'] );
	$menu_page   = \DineKit\Sample\find_page( 'menu' );
	$order_page  = \DineKit\Sample\find_page( 'order' );
	$book_page   = \DineKit\Sample\find_page( 'booking' );
	$order_set   = \DineKit\Ordering\get_settings();
	$ordering_on = ! empty( $order_set['enabled'] );
	$stripe_on   = \DineKit\Integrations\stripe_ready();

	return array(
		'today'          => $today,
		'businessType'   => (string) $settings['businessType'],
		'currency'       => $currency,
		'currencyPos'    => 'after' === $settings['currencyPosition'] ? 'after' : 'before',
		'covers'         => $covers,
		'bookingsCount'  => count( $today_list ),
		'ordersToday'    => $orders_today,
		'revenueToday'   => number_format( $revenue_today, 2, '.', '' ),
		'activeOrders'   => $active_orders,
		'pendingBookings' => $pending,
		'waitlist'       => $waitlist,
		'weekCovers'     => $week_covers,
		'weekRevenue'    => number_format( $week_revenue, 2, '.', '' ),
		'sparkCovers'    => array_values( wp_list_pluck( $series, 'covers' ) ),
		'sparkOrders'    => array_values( wp_list_pluck( $series, 'orders' ) ),
		'sparkRevenue'   => array_map( 'floatval', array_values( wp_list_pluck( $series, 'revenue' ) ) ),
		'todayBookings'  => array_slice( $today_list, 0, 8 ),
		'upcomingEvents' => $events,
		'recentOrders'   => $recent_orders,
		'orderingOn'     => $ordering_on,
		'orderPageUrl'   => (string) $order_page['url'],
		'menuPageUrl'    => (string) $menu_page['url'],
		'bookPageUrl'    => (string) $book_page['url'],
		// A page only counts as done once it's actually PUBLISHED — a draft the
		// owner hasn't reviewed isn't a live page guests can visit.
		'checklist'      => array(
			'menu'      => $items > 0,
			'hours'     => $has_hours,
			'floor'     => $tables > 0,
			'booking'   => $bookings > 0,
			'page'      => isset( $menu_page['status'] ) && 'publish' === $menu_page['status'],
			'ordering'  => $ordering_on,
			'orderpage' => isset( $order_page['status'] ) && 'publish' === $order_page['status'],
			'bookpage'  => isset( $book_page['status'] ) && 'publish' === $book_page['status'],
			'stripe'    => $stripe_on,
		),
	);
}
