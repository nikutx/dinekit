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
 * Default sitting length in minutes (filterable).
 *
 * @return int
 */
function duration() {
	return (int) apply_filters( 'dinekit_booking_duration', 120 );
}

/**
 * Buffer between sittings on the same table, in minutes (filterable).
 *
 * @return int
 */
function buffer() {
	return (int) apply_filters( 'dinekit_booking_buffer', 0 );
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
 * All tables with their capacity + area.
 *
 * @return array<int,array<string,mixed>>
 */
function all_tables() {
	$posts = get_posts(
		array(
			'post_type'   => 'dk_table',
			'post_status' => 'publish',
			'numberposts' => 300,
			'orderby'     => 'menu_order',
			'order'       => 'ASC',
		)
	);

	$tables = array();
	foreach ( $posts as $post ) {
		$seats = (int) get_post_meta( $post->ID, 'dk_seats', true );
		$min   = (int) get_post_meta( $post->ID, 'dk_min_party', true );
		$max   = (int) get_post_meta( $post->ID, 'dk_max_party', true );
		$areas = get_the_terms( $post, 'dk_area' );
		$area  = ( is_array( $areas ) && $areas ) ? $areas[0] : null;

		$shape = (string) get_post_meta( $post->ID, 'dk_shape', true );

		$tables[] = array(
			'id'       => (int) $post->ID,
			'name'     => $post->post_title,
			'seats'    => $seats ? $seats : 2,
			'min'      => $min ? $min : 1,
			'max'      => $max ? $max : ( $seats ? $seats : 2 ),
			'areaId'   => $area ? (int) $area->term_id : 0,
			'area'     => $area ? $area->name : '',
			'order'    => (int) $post->menu_order,
			'x'        => (int) get_post_meta( $post->ID, 'dk_pos_x', true ),
			'y'        => (int) get_post_meta( $post->ID, 'dk_pos_y', true ),
			'rotation' => (int) get_post_meta( $post->ID, 'dk_rotation', true ),
			'shape'    => $shape ? $shape : 'round',
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
			'post_type'      => 'dk_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'   => 'dk_date',
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
		$status = (string) get_post_meta( $post->ID, 'dk_status', true );
		if ( ! in_array( $status, occupying_statuses(), true ) ) {
			continue;
		}
		$out[] = array(
			'id'       => (int) $post->ID,
			'table_id' => (int) get_post_meta( $post->ID, 'dk_table_id', true ),
			'combo_id' => (int) get_post_meta( $post->ID, 'dk_combo_id', true ),
			'time'     => (string) get_post_meta( $post->ID, 'dk_time', true ),
			'party'    => (int) get_post_meta( $post->ID, 'dk_party', true ),
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
			'post_type'   => 'dk_table_combo',
			'post_status' => 'publish',
			'numberposts' => 200,
			'orderby'     => 'menu_order',
			'order'       => 'ASC',
		)
	);

	$combos = array();
	foreach ( $posts as $post ) {
		$ids = array_filter( array_map( 'intval', explode( ',', (string) get_post_meta( $post->ID, 'dk_combo_tables', true ) ) ) );
		$combos[] = array(
			'id'       => (int) $post->ID,
			'name'     => $post->post_title,
			'tables'   => array_values( $ids ),
			'min'      => (int) get_post_meta( $post->ID, 'dk_combo_min', true ) ?: 2,
			'max'      => (int) get_post_meta( $post->ID, 'dk_combo_max', true ) ?: 4,
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
		if ( $party < $table['min'] || $party > $table['max'] ) {
			continue; // Party doesn't fit this table.
		}
		if ( empty( $occupied[ $table['id'] ] ) ) {
			$free[] = $table;
		}
	}
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
			if ( ! isset( $by_id[ $tid ] ) || ! empty( $occupied[ $tid ] ) ) {
				$all_free = false;
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
	return $free;
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
	foreach ( available_tables( $date, $time, 1, $exclude_id ) as $table ) {
		if ( $table['id'] === (int) $table_id ) {
			return true;
		}
	}
	return false;
}
