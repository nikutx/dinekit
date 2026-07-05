<?php
/**
 * Booking availability engine.
 *
 * Given a date, time and party size, works out which tables are free — taking
 * account of each table's party-size limits, existing (active) bookings, the
 * service turn-time and an optional buffer between sittings.
 *
 * @package DineKit
 */

namespace DineKit\Bookings\Availability;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Sitting length in minutes — from booking settings ("turn time"), filterable.
 *
 * @return int
 */
function duration() {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$turn = (int) \DineKit\Bookings\Settings\get()['turn_time'];
	return (int) apply_filters( 'dinekit_booking_duration', $turn > 0 ? $turn : 120 );
}

/**
 * Buffer between sittings on the same table, in minutes — from booking
 * settings, filterable.
 *
 * @return int
 */
function buffer() {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	return (int) apply_filters( 'dinekit_booking_buffer', (int) \DineKit\Bookings\Settings\get()['buffer'] );
}

/**
 * Booking statuses that occupy a table (block availability).
 *
 * @return string[]
 */
function occupying_statuses() {
	return array( 'pending', 'provisional', 'confirmed', 'seated' );
}

/**
 * Convert "H:i" to minutes past midnight.
 *
 * @param string $time Time.
 * @return int
 */
function to_minutes( $time ) {
	if ( ! preg_match( '/^(\d{1,2}):(\d{2})$/', (string) $time, $m ) ) {
		return 0;
	}
	return ( (int) $m[1] ) * 60 + (int) $m[2];
}

/**
 * Service periods (bookable open→close windows) for a given date, taken from the
 * restaurant's Opening Hours — so a day can have separate lunch and dinner
 * services, closed days, and per-date holiday overrides. Falls back to the
 * booking-settings open/close window only when Opening Hours have never been
 * configured, so bookings still work out of the box.
 *
 * @param string $date Y-m-d.
 * @return array<int,array{open:string,close:string}>
 */
function service_periods( $date ) {
	require_once DINEKIT_DIR . 'includes/hours.php';
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$hours = \DineKit\Hours\get();

	// Has the owner set any Opening Hours at all?
	$configured = ! empty( $hours['holidays'] );
	if ( ! $configured && ! empty( $hours['week'] ) ) {
		foreach ( $hours['week'] as $periods ) {
			if ( ! empty( $periods ) ) {
				$configured = true;
				break;
			}
		}
	}

	if ( ! $configured ) {
		$s = \DineKit\Bookings\Settings\get();
		return array(
			array(
				'open'  => (string) $s['open_time'],
				'close' => (string) $s['close_time'],
			),
		);
	}

	// Per-date holiday override wins over the weekly pattern.
	if ( ! empty( $hours['holidays'] ) ) {
		foreach ( $hours['holidays'] as $holiday ) {
			if ( isset( $holiday['date'] ) && $holiday['date'] === $date ) {
				return empty( $holiday['closed'] ) ? array_values( (array) $holiday['periods'] ) : array();
			}
		}
	}

	$dt      = \DateTimeImmutable::createFromFormat( 'Y-m-d', $date, wp_timezone() );
	$day_key = $dt ? substr( strtolower( $dt->format( 'D' ) ), 0, 3 ) : '';
	return ( $day_key && isset( $hours['week'][ $day_key ] ) ) ? array_values( (array) $hours['week'][ $day_key ] ) : array();
}

/**
 * Bookable time slots (H:i) for a date — service periods sliced by the slot
 * interval, honouring min-notice lead time for today. Empty = closed that day.
 *
 * @param string $date         Y-m-d.
 * @param bool   $ignore_floor Skip the min-notice/today floor (used for validation).
 * @return string[]
 */
function slots_for( $date, $ignore_floor = false ) {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$s    = \DineKit\Bookings\Settings\get();
	$step = max( 5, (int) $s['slot_interval'] );

	$floor = -1;
	if ( ! $ignore_floor ) {
		$now = new \DateTimeImmutable( 'now', wp_timezone() );
		if ( $now->format( 'Y-m-d' ) === $date ) {
			$floor = (int) $now->format( 'H' ) * 60 + (int) $now->format( 'i' ) + (int) $s['min_notice'] * 60;
		}
	}

	$by_label = array(); // label => absolute minutes (for correct over-midnight ordering).
	foreach ( service_periods( $date ) as $p ) {
		$open  = to_minutes( $p['open'] );
		$close = to_minutes( $p['close'] );
		if ( $close <= $open ) {
			$close += 1440; // Over-midnight service (e.g. 18:00 → 01:00).
		}
		for ( $m = $open; $m <= $close; $m += $step ) {
			if ( $m < $floor ) {
				continue;
			}
			$wrapped = $m % 1440;
			$label   = sprintf( '%02d:%02d', (int) floor( $wrapped / 60 ), $wrapped % 60 );
			if ( ! isset( $by_label[ $label ] ) ) {
				$by_label[ $label ] = $m;
			}
		}
	}
	asort( $by_label );
	return array_keys( $by_label );
}

/**
 * Does a requested time fall on the service-slot grid for that date?
 *
 * @param string $date Y-m-d.
 * @param string $time H:i.
 * @return bool
 */
function time_in_service( $date, $time ) {
	return in_array( $time, slots_for( $date, true ), true );
}

/**
 * All tables with their capacity + area.
 *
 * @return array<int,array<string,mixed>>
 */
function all_tables() {
	$posts = get_posts(
		array(
			'post_type'   => 'dinekit_table',
			'post_status' => 'publish',
			'numberposts' => 300,
			'orderby'     => 'menu_order',
			'order'       => 'ASC',
		)
	);

	$tables = array();
	foreach ( $posts as $post ) {
		$seats = (int) get_post_meta( $post->ID, 'dinekit_seats', true );
		$min   = (int) get_post_meta( $post->ID, 'dinekit_min_party', true );
		$max   = (int) get_post_meta( $post->ID, 'dinekit_max_party', true );
		$areas = get_the_terms( $post, 'dinekit_area' );
		$area  = ( is_array( $areas ) && $areas ) ? $areas[0] : null;

		$shape  = (string) get_post_meta( $post->ID, 'dinekit_shape', true );
		$status = (string) get_post_meta( $post->ID, 'dinekit_status', true );

		$tables[] = array(
			'id'       => (int) $post->ID,
			'name'     => $post->post_title,
			'seats'    => $seats ? $seats : 2,
			'min'      => $min ? $min : 1,
			'max'      => $max ? $max : ( $seats ? $seats : 2 ),
			'areaId'   => $area ? (int) $area->term_id : 0,
			'area'     => $area ? $area->name : '',
			'order'    => (int) $post->menu_order,
			'x'        => (int) get_post_meta( $post->ID, 'dinekit_pos_x', true ),
			'y'        => (int) get_post_meta( $post->ID, 'dinekit_pos_y', true ),
			'rotation' => (int) get_post_meta( $post->ID, 'dinekit_rotation', true ),
			'shape'    => $shape ? $shape : 'round',
			'status'   => 'maintenance' === $status ? 'maintenance' : 'active',
		);
	}
	return $tables;
}

/**
 * Active bookings on a given date: [ { table_id, time, party, status } ].
 *
 * @param string $date Y-m-d.
 * @param int    $exclude_id Booking id to ignore (when editing).
 * @return array<int,array<string,mixed>>
 */
function bookings_on( $date, $exclude_id = 0 ) {
	$query = new \WP_Query(
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

	$out = array();
	foreach ( $query->posts as $post ) {
		if ( $exclude_id && (int) $post->ID === (int) $exclude_id ) {
			continue;
		}
		$status = (string) get_post_meta( $post->ID, 'dinekit_status', true );
		if ( ! in_array( $status, occupying_statuses(), true ) ) {
			continue;
		}
		$out[] = array(
			'id'       => (int) $post->ID,
			'table_id' => (int) get_post_meta( $post->ID, 'dinekit_table_id', true ),
			'combo_id' => (int) get_post_meta( $post->ID, 'dinekit_combo_id', true ),
			'time'     => (string) get_post_meta( $post->ID, 'dinekit_time', true ),
			'party'    => (int) get_post_meta( $post->ID, 'dinekit_party', true ),
			'status'   => $status,
		);
	}
	return $out;
}

/**
 * All table combinations (joins), priority-ordered.
 *
 * @return array<int,array<string,mixed>>
 */
function all_combos() {
	$posts = get_posts(
		array(
			'post_type'   => 'dinekit_table_combo',
			'post_status' => 'publish',
			'numberposts' => 200,
			'orderby'     => 'menu_order',
			'order'       => 'ASC',
		)
	);

	$combos = array();
	foreach ( $posts as $post ) {
		$ids = array_filter( array_map( 'intval', explode( ',', (string) get_post_meta( $post->ID, 'dinekit_combo_tables', true ) ) ) );
		$combos[] = array(
			'id'       => (int) $post->ID,
			'name'     => $post->post_title,
			'tables'   => array_values( $ids ),
			'min'      => (int) get_post_meta( $post->ID, 'dinekit_combo_min', true ) ?: 2,
			'max'      => (int) get_post_meta( $post->ID, 'dinekit_combo_max', true ) ?: 4,
			'priority' => (int) $post->menu_order,
		);
	}
	return $combos;
}

/**
 * Set of table IDs occupied in the requested slot — expands combo bookings to
 * their member tables so a booked join blocks every table it uses.
 *
 * @param string $date       Y-m-d.
 * @param string $time       H:i.
 * @param int    $exclude_id Booking id to ignore (editing).
 * @return array<int,bool> Map of table_id => true.
 */
function occupied_ids( $date, $time, $exclude_id = 0 ) {
	$bookings  = bookings_on( $date, $exclude_id );
	$dur       = duration();
	$buf       = buffer();
	$req_start = to_minutes( $time );
	$req_end   = $req_start + $dur;
	$combos    = null; // Loaded lazily only if a combo booking exists.

	$occupied = array();
	foreach ( $bookings as $booking ) {
		$b_start = to_minutes( $booking['time'] );
		$b_end   = $b_start + $dur;
		if ( ! ( $req_start < $b_end + $buf && $b_start < $req_end + $buf ) ) {
			continue; // No time overlap.
		}
		if ( ! empty( $booking['combo_id'] ) ) {
			if ( null === $combos ) {
				$combos = all_combos();
			}
			foreach ( $combos as $combo ) {
				if ( $combo['id'] === (int) $booking['combo_id'] ) {
					foreach ( $combo['tables'] as $tid ) {
						$occupied[ $tid ] = true;
					}
				}
			}
		} elseif ( ! empty( $booking['table_id'] ) ) {
			$occupied[ (int) $booking['table_id'] ] = true;
		}
	}
	return $occupied;
}

/**
 * Total covers already booked within the same clock-hour as $time.
 *
 * @param string $date       Y-m-d.
 * @param string $time       H:i.
 * @param int    $exclude_id Booking id to ignore (editing).
 * @return int
 */
function covers_in_hour( $date, $time, $exclude_id = 0 ) {
	$hour   = (int) floor( to_minutes( $time ) / 60 );
	$covers = 0;
	foreach ( bookings_on( $date, $exclude_id ) as $booking ) {
		if ( (int) floor( to_minutes( $booking['time'] ) / 60 ) === $hour ) {
			$covers += (int) $booking['party'];
		}
	}
	return $covers;
}

/**
 * Would adding this party keep the hour within the covers cap? A cap of 0 means
 * no limit. Kitchen pacing — independent of whether tables are free.
 *
 * @param string $date       Y-m-d.
 * @param string $time       H:i.
 * @param int    $party      Party size.
 * @param int    $cap        Max covers per hour (0 = unlimited).
 * @param int    $exclude_id Booking id to ignore.
 * @return bool
 */
function within_hour_capacity( $date, $time, $party, $cap, $exclude_id = 0 ) {
	$cap = (int) $cap;
	if ( $cap <= 0 ) {
		return true;
	}
	return covers_in_hour( $date, $time, $exclude_id ) + (int) $party <= $cap;
}

/**
 * Single tables free for a party at a date/time.
 *
 * @param string $date       Y-m-d.
 * @param string $time       H:i.
 * @param int    $party      Party size.
 * @param int    $exclude_id Booking id to ignore (editing).
 * @return array<int,array<string,mixed>>
 */
function available_tables( $date, $time, $party, $exclude_id = 0 ) {
	$party    = max( 1, (int) $party );
	$occupied = occupied_ids( $date, $time, $exclude_id );

	$free = array();
	foreach ( all_tables() as $table ) {
		if ( 'maintenance' === $table['status'] ) {
			continue; // Out of service — not bookable.
		}
		if ( $party < $table['min'] || $party > $table['max'] ) {
			continue; // Party doesn't fit this table.
		}
		if ( empty( $occupied[ $table['id'] ] ) ) {
			$free[] = $table;
		}
	}
	// Best-fit: smallest fitting table first, so a party of 2 doesn't take a
	// 6-top and burn capacity for a later big booking. Auto-assign uses [0].
	usort(
		$free,
		static function ( $a, $b ) {
			$by_seats = $a['seats'] <=> $b['seats'];
			return 0 !== $by_seats ? $by_seats : ( $a['order'] <=> $b['order'] );
		}
	);
	return $free;
}

/**
 * Table combinations free for a party at a date/time — only when every member
 * table is free. Priority-ordered so the "cheapest" join is offered first.
 *
 * @param string $date       Y-m-d.
 * @param string $time       H:i.
 * @param int    $party      Party size.
 * @param int    $exclude_id Booking id to ignore (editing).
 * @return array<int,array<string,mixed>>
 */
function available_combos( $date, $time, $party, $exclude_id = 0 ) {
	$party    = max( 1, (int) $party );
	$occupied = occupied_ids( $date, $time, $exclude_id );

	$by_id = array();
	foreach ( all_tables() as $t ) {
		$by_id[ $t['id'] ] = $t;
	}

	$free = array();
	foreach ( all_combos() as $combo ) {
		if ( count( $combo['tables'] ) < 2 || $party < $combo['min'] || $party > $combo['max'] ) {
			continue;
		}
		$all_free = true;
		$seats    = 0;
		foreach ( $combo['tables'] as $tid ) {
			if ( ! isset( $by_id[ $tid ] ) || ! empty( $occupied[ $tid ] ) || 'maintenance' === $by_id[ $tid ]['status'] ) {
				$all_free = false; // Missing, booked, or a member is out of service.
				break;
			}
			$seats += $by_id[ $tid ]['seats'];
		}
		if ( $all_free ) {
			$combo['seats']       = $seats;
			$combo['tableNames']  = array_map(
				static function ( $tid ) use ( $by_id ) {
					return $by_id[ $tid ]['name'];
				},
				$combo['tables']
			);
			$free[] = $combo;
		}
	}
	// Smallest adequate join first, so a party of 5 takes a 6-seat combo over an
	// 8-seat one — same best-fit principle as single tables.
	usort(
		$free,
		static function ( $a, $b ) {
			$by_seats = $a['seats'] <=> $b['seats'];
			return 0 !== $by_seats ? $by_seats : ( $a['priority'] <=> $b['priority'] );
		}
	);
	return $free;
}

/**
 * Is a slot bookable for a party — a single table or a combo is free AND the
 * hour is within its covers cap. The one source of truth for "available".
 *
 * @param string $date  Y-m-d.
 * @param string $time  H:i.
 * @param int    $party Party size.
 * @param int    $cap   Covers-per-hour cap (0 = unlimited).
 * @return bool
 */
function is_slot_available( $date, $time, $party, $cap ) {
	if ( empty( available_tables( $date, $time, $party ) ) && empty( available_combos( $date, $time, $party ) ) ) {
		return false;
	}
	return within_hour_capacity( $date, $time, $party, $cap );
}

/**
 * The next bookable slots at/after a full time, within a forward window — so a
 * diner turned away at 19:00 can be offered 19:30, 20:15, etc. instead of leaving.
 *
 * @param string $date       Y-m-d.
 * @param string $time       H:i (the requested, unavailable time).
 * @param int    $party      Party size.
 * @param int    $cap        Covers-per-hour cap.
 * @param int    $window_min Minutes to look ahead (0 = feature off).
 * @param int    $limit      Max suggestions to return.
 * @return string[]
 */
function next_available( $date, $time, $party, $cap, $window_min = 120, $limit = 3 ) {
	$window_min = (int) $window_min;
	if ( $window_min <= 0 ) {
		return array();
	}
	$target = to_minutes( $time );
	$out    = array();
	foreach ( slots_for( $date ) as $slot ) {
		$m = to_minutes( $slot );
		if ( $m <= $target ) {
			continue; // Future slots only.
		}
		if ( $m > $target + $window_min ) {
			break; // Past the look-ahead window (slots are ascending).
		}
		if ( is_slot_available( $date, $slot, $party, $cap ) ) {
			$out[] = $slot;
			if ( count( $out ) >= (int) $limit ) {
				break;
			}
		}
	}
	return $out;
}

/**
 * Is a specific table free at the given time (used on assignment)?
 *
 * @param int    $table_id   Table id.
 * @param string $date       Y-m-d.
 * @param string $time       H:i.
 * @param int    $exclude_id Booking id to ignore.
 * @return bool
 */
function table_is_free( $table_id, $date, $time, $exclude_id = 0 ) {
	// Occupancy only — party-fit is the caller's concern (a min_party 2 table
	// must still count as free when checking occupancy).
	$occupied = occupied_ids( $date, $time, $exclude_id );
	return empty( $occupied[ (int) $table_id ] );
}
