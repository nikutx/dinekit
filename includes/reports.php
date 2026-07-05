<?php
/**
 * Reporting — analytics over a date range (covers, revenue, top dishes, busiest
 * times, sources) and the printable pre-shift service sheet for a single day.
 * Read-only, assembled from booking/order/event data. No custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Reports;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Currency bits for the client formatter.
 *
 * @return array<string,string>
 */
function currency() {
	require_once DINEKIT_DIR . 'includes/settings.php';
	$s = \DineKit\Settings\get();
	return array(
		'currency'    => (string) $s['currency'],
		'currencyPos' => 'after' === $s['currencyPosition'] ? 'after' : 'before',
	);
}

/**
 * Bookings whose dinekit_date falls in [from, to].
 *
 * @param string $from Y-m-d.
 * @param string $to   Y-m-d.
 * @return \WP_Post[]
 */
function bookings_between( $from, $to ) {
	$q = new \WP_Query(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 2000,
			'no_found_rows'  => true,
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'     => 'dinekit_date',
					'value'   => array( $from, $to ),
					'compare' => 'BETWEEN',
					'type'    => 'DATE',
				),
			),
		)
	);
	return $q->posts;
}

/**
 * Analytics aggregate for a date range.
 *
 * @param string $from      Y-m-d.
 * @param string $to        Y-m-d (inclusive).
 * @param bool   $with_prev Also aggregate the preceding period of equal length
 *                          (one level only — the recursive call passes false).
 * @return array<string,mixed>
 */
function range_data( $from, $to, $with_prev = true ) {
	// Seed a day-by-day map so quiet days still show on the chart.
	$per_day = array();
	$start   = strtotime( $from );
	$end     = strtotime( $to );
	for ( $t = $start; $t <= $end; $t += DAY_IN_SECONDS ) {
		$per_day[ gmdate( 'Y-m-d', $t ) ] = array(
			'covers'   => 0,
			'revenue'  => 0.0,
			'orders'   => 0,
			'bookings' => 0,
		);
	}

	/* ---- Bookings ---- */
	$covers     = 0;
	$party_sum  = 0;
	$party_n    = 0;
	$confirmed  = 0;
	$no_show    = 0;
	$cancelled  = 0;
	$by_source  = array();
	$by_weekday = array_fill( 0, 7, 0 );
	$by_hour    = array();

	foreach ( bookings_between( $from, $to ) as $post ) {
		$status = (string) get_post_meta( $post->ID, 'dinekit_status', true );
		$party  = (int) get_post_meta( $post->ID, 'dinekit_party', true );
		$date   = (string) get_post_meta( $post->ID, 'dinekit_date', true );
		$source = (string) get_post_meta( $post->ID, 'dinekit_source', true );
		$source = '' !== $source ? $source : 'admin';

		if ( 'no_show' === $status ) {
			++$no_show;
			continue;
		}
		if ( 'cancelled' === $status ) {
			++$cancelled;
			continue;
		}

		++$confirmed;
		$covers    += $party;
		$party_sum += $party;
		++$party_n;
		$by_source[ $source ] = ( $by_source[ $source ] ?? 0 ) + 1;

		if ( isset( $per_day[ $date ] ) ) {
			$per_day[ $date ]['covers']   += $party;
			$per_day[ $date ]['bookings'] += 1;
		}
		$ts = strtotime( $date );
		if ( $ts ) {
			$by_weekday[ (int) gmdate( 'w', $ts ) ] += $party;
		}
		$hour = (int) substr( (string) get_post_meta( $post->ID, 'dinekit_time', true ), 0, 2 );
		if ( $hour >= 0 && $hour <= 23 ) {
			$by_hour[ $hour ] = ( $by_hour[ $hour ] ?? 0 ) + $party;
		}
	}

	/* ---- Orders (revenue + top dishes) ---- */
	$revenue     = 0.0;
	$orders_n    = 0;
	$dish_map    = array();
	$order_posts = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 2000,
			'no_found_rows'  => true,
		)
	);
	foreach ( $order_posts as $post ) {
		$date = get_post_time( 'Y-m-d', false, $post );
		if ( $date < $from || $date > $to ) {
			continue;
		}
		if ( 'cancelled' === (string) get_post_meta( $post->ID, 'dinekit_order_status', true ) ) {
			continue;
		}
		$total    = (float) get_post_meta( $post->ID, 'dinekit_order_total', true );
		$revenue += $total;
		++$orders_n;
		if ( isset( $per_day[ $date ] ) ) {
			$per_day[ $date ]['revenue'] += $total;
			$per_day[ $date ]['orders']  += 1;
		}
		$lines = json_decode( (string) get_post_meta( $post->ID, 'dinekit_order_items', true ), true );
		foreach ( (array) $lines as $line ) {
			$title = (string) ( $line['title'] ?? '' );
			if ( '' === $title ) {
				continue;
			}
			if ( ! isset( $dish_map[ $title ] ) ) {
				$dish_map[ $title ] = array(
					'title'   => $title,
					'qty'     => 0,
					'revenue' => 0.0,
				);
			}
			$dish_map[ $title ]['qty']     += (int) ( $line['qty'] ?? 1 );
			$dish_map[ $title ]['revenue'] += (float) ( $line['lineTotal'] ?? 0 );
		}
	}

	// Top dishes by quantity.
	usort(
		$dish_map,
		static function ( $a, $b ) {
			return $b['qty'] <=> $a['qty'];
		}
	);
	$top_dishes = array_slice( array_values( $dish_map ), 0, 10 );
	foreach ( $top_dishes as &$d ) {
		$d['revenue'] = number_format( $d['revenue'], 2, '.', '' );
	}
	unset( $d );

	// Shape per-day for the client (ordered array).
	$days = array();
	foreach ( $per_day as $date => $row ) {
		$days[] = array(
			'date'     => $date,
			'covers'   => $row['covers'],
			'revenue'  => number_format( $row['revenue'], 2, '.', '' ),
			'orders'   => $row['orders'],
			'bookings' => $row['bookings'],
		);
	}

	// Busiest hour.
	$busiest_hour = null;
	if ( $by_hour ) {
		ksort( $by_hour );
		arsort( $by_hour );
		$busiest_hour = (int) array_key_first( $by_hour );
	}

	$sources = array();
	arsort( $by_source );
	foreach ( $by_source as $name => $n ) {
		$sources[] = array(
			'source' => $name,
			'count'  => $n,
		);
	}

	$span_days   = max( 1, (int) round( ( $end - $start ) / DAY_IN_SECONDS ) + 1 );
	$total_seats = $confirmed + $no_show;

	// Preceding period of the same length, for the KPI delta badges.
	$prev = null;
	if ( $with_prev ) {
		$prev_to   = gmdate( 'Y-m-d', $start - DAY_IN_SECONDS );
		$prev_from = gmdate( 'Y-m-d', $start - $span_days * DAY_IN_SECONDS );
		$prev_full = range_data( $prev_from, $prev_to, false );
		$prev      = array(
			'covers'   => $prev_full['covers'],
			'bookings' => $prev_full['bookings'],
			'revenue'  => $prev_full['revenue'],
			'orders'   => $prev_full['orders'],
		);
	}

	return array_merge(
		currency(),
		array(
			'prev'         => $prev,
			'from'         => $from,
			'to'           => $to,
			'covers'       => $covers,
			'bookings'     => $confirmed,
			'avgParty'     => $party_n ? round( $party_sum / $party_n, 1 ) : 0,
			'noShow'       => $no_show,
			'cancelled'    => $cancelled,
			'noShowRate'   => $total_seats ? (int) round( ( $no_show / $total_seats ) * 100 ) : 0,
			'revenue'      => number_format( $revenue, 2, '.', '' ),
			'orders'       => $orders_n,
			'avgOrder'     => $orders_n ? number_format( $revenue / $orders_n, 2, '.', '' ) : '0.00',
			'coversPerDay' => round( $covers / $span_days, 1 ),
			'perDay'       => $days,
			'topDishes'    => $top_dishes,
			'sources'      => $sources,
			'byWeekday'    => array_values( $by_weekday ),
			'busiestHour'  => $busiest_hour,
		)
	);
}

/**
 * The pre-shift service sheet for one day: the FOH/kitchen briefing — every
 * booking with party, table, allergies, VIP flag and notes, plus the day's
 * events and an aggregated allergen alert list.
 *
 * @param string $date Y-m-d.
 * @return array<string,mixed>
 */
function service_sheet( $date ) {
	require_once DINEKIT_DIR . 'includes/guests.php';

	$covers    = 0;
	$rows      = array();
	$allergens = array();

	$posts = new \WP_Query(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'   => 'dinekit_date',
					'value' => $date,
				),
			),
		)
	);
	foreach ( $posts->posts as $post ) {
		$status = (string) get_post_meta( $post->ID, 'dinekit_status', true );
		if ( in_array( $status, array( 'cancelled', 'no_show' ), true ) ) {
			continue;
		}
		$party    = (int) get_post_meta( $post->ID, 'dinekit_party', true );
		$name     = (string) get_post_meta( $post->ID, 'dinekit_name', true );
		$email    = (string) get_post_meta( $post->ID, 'dinekit_email', true );
		$table_id = (int) get_post_meta( $post->ID, 'dinekit_table_id', true );
		$combo_id = (int) get_post_meta( $post->ID, 'dinekit_combo_id', true );
		$profile  = \DineKit\Guests\get_profile( $email, $name );

		$covers += $party;
		if ( '' !== $profile['allergens'] ) {
			foreach ( preg_split( '/[,;]+/', $profile['allergens'] ) as $a ) {
				$a = trim( $a );
				if ( '' !== $a ) {
					$allergens[ strtolower( $a ) ] = $a;
				}
			}
		}

		$rows[] = array(
			'time'      => (string) get_post_meta( $post->ID, 'dinekit_time', true ),
			'name'      => $name,
			'party'     => $party,
			'phone'     => (string) get_post_meta( $post->ID, 'dinekit_phone', true ),
			'table'     => $combo_id ? get_the_title( $combo_id ) : ( $table_id ? get_the_title( $table_id ) : '' ),
			'status'    => $status,
			'notes'     => (string) get_post_meta( $post->ID, 'dinekit_notes', true ),
			'vip'       => $profile['vip'],
			'tags'      => $profile['tags'],
			'allergens' => $profile['allergens'],
			'guestNote' => $profile['notes'],
		);
	}
	usort(
		$rows,
		static function ( $a, $b ) {
			return strcmp( $a['time'], $b['time'] );
		}
	);

	// Covers per hour, for the prep summary.
	$prep = array();
	foreach ( $rows as $r ) {
		$hour          = (int) substr( $r['time'], 0, 2 );
		$prep[ $hour ] = ( $prep[ $hour ] ?? 0 ) + $r['party'];
	}
	ksort( $prep );
	$prep_rows = array();
	foreach ( $prep as $hour => $c ) {
		$prep_rows[] = array(
			'hour'   => sprintf( '%02d:00', $hour ),
			'covers' => $c,
		);
	}

	/* ---- Events that day ---- */
	$events = array();
	foreach ( get_posts(
		array(
			'post_type'      => 'dinekit_event',
			'post_status'    => 'publish',
			'posts_per_page' => 50,
			'no_found_rows'  => true,
		)
	) as $post ) {
		if ( (string) get_post_meta( $post->ID, 'dinekit_event_date', true ) !== $date ) {
			continue;
		}
		$events[] = array(
			'name' => $post->post_title,
			'time' => (string) get_post_meta( $post->ID, 'dinekit_event_time', true ),
		);
	}

	return array(
		'date'          => $date,
		'covers'        => $covers,
		'bookings'      => count( $rows ),
		'rows'          => $rows,
		'prep'          => $prep_rows,
		'events'        => $events,
		'allergenAlert' => array_values( $allergens ),
	);
}
