<?php
/**
 * Menu (dinekit_menu) scheduling, status and duplication.
 *
 * A menu can be scheduled with a go-live date/time and optional recurring
 * availability (days + daily time window). Stored in the `dinekit_menu_schedule`
 * term meta; the creation time is stored in `dinekit_menu_created`.
 *
 * @package DineKit
 */

namespace DineKit\Menus;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Empty schedule.
 *
 * @return array<string,mixed>
 */
function default_schedule() {
	return array(
		'goLive' => '', // Y-m-d\TH:i (datetime-local); '' = live immediately.
		'days'   => array(), // mon..sun; [] = every day.
		'start'  => '', // H:i; '' = all day.
		'end'    => '', // H:i.
	);
}

/**
 * Ordered day keys.
 *
 * @return string[]
 */
function day_keys() {
	return array( 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' );
}

/**
 * Get a menu's schedule.
 *
 * @param int $term_id Menu term id.
 * @return array<string,mixed>
 */
function get_schedule( $term_id ) {
	$stored = get_term_meta( $term_id, 'dinekit_menu_schedule', true );
	if ( ! is_array( $stored ) ) {
		return default_schedule();
	}
	return wp_parse_args( $stored, default_schedule() );
}

/**
 * Sanitize + save a menu's schedule.
 *
 * @param int                 $term_id Menu term id.
 * @param array<string,mixed> $input   Raw schedule.
 * @return array<string,mixed> Saved schedule.
 */
function save_schedule( $term_id, $input ) {
	$clean = default_schedule();

	if ( isset( $input['goLive'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', (string) $input['goLive'] ) ) {
		$clean['goLive'] = (string) $input['goLive'];
	}
	if ( isset( $input['days'] ) && is_array( $input['days'] ) ) {
		$clean['days'] = array_values( array_intersect( day_keys(), array_map( 'strval', $input['days'] ) ) );
	}
	foreach ( array( 'start', 'end' ) as $key ) {
		if ( isset( $input[ $key ] ) && preg_match( '/^\d{1,2}:\d{2}$/', (string) $input[ $key ] ) ) {
			$clean[ $key ] = (string) $input[ $key ];
		}
	}

	update_term_meta( $term_id, 'dinekit_menu_schedule', $clean );
	return $clean;
}

/**
 * Compute a menu's live status.
 *
 * @param int $term_id Menu term id.
 * @return array{state:string,label:string,liveNow:bool,liveAt:string,created:int}
 */
function status( $term_id ) {
	$tz       = wp_timezone();
	$now      = new \DateTimeImmutable( 'now', $tz );
	$sched    = get_schedule( $term_id );
	$created  = (int) get_term_meta( $term_id, 'dinekit_menu_created', true );

	// Scheduled for the future?
	if ( '' !== $sched['goLive'] ) {
		$go = \DateTimeImmutable::createFromFormat( 'Y-m-d\TH:i', $sched['goLive'], $tz );
		if ( $go && $go > $now ) {
			$fmt = get_option( 'date_format' ) . ' ' . get_option( 'time_format' );
			return array(
				'state'   => 'coming',
				'label'   => sprintf(
					/* translators: %s: date/time the menu goes live. */
					__( 'Live from %s', 'dinekit' ),
					$go->format( $fmt )
				),
				'liveNow' => false,
				'liveAt'  => $sched['goLive'],
				'created' => $created,
			);
		}
	}

	// Recurring availability?
	$has_days = ! empty( $sched['days'] );
	$has_time = '' !== $sched['start'] && '' !== $sched['end'];
	if ( $has_days || $has_time ) {
		$live_now = is_live_now( $sched, $now );
		return array(
			'state'   => 'scheduled',
			'label'   => describe( $sched ),
			'liveNow' => $live_now,
			'liveAt'  => '',
			'created' => $created,
		);
	}

	return array(
		'state'   => 'live',
		'label'   => __( 'Always on', 'dinekit' ),
		'liveNow' => true,
		'liveAt'  => '',
		'created' => $created,
	);
}

/**
 * Whether a recurring schedule is active right now.
 *
 * @param array<string,mixed> $sched Schedule.
 * @param \DateTimeImmutable   $now   Current time.
 * @return bool
 */
function is_live_now( $sched, $now ) {
	if ( ! empty( $sched['days'] ) ) {
		$today = strtolower( substr( $now->format( 'D' ), 0, 3 ) );
		if ( ! in_array( $today, $sched['days'], true ) ) {
			return false;
		}
	}
	if ( '' !== $sched['start'] && '' !== $sched['end'] ) {
		$cur = $now->format( 'H:i' );
		if ( $cur < $sched['start'] || $cur > $sched['end'] ) {
			return false;
		}
	}
	return true;
}

/**
 * Human description of a recurring schedule, e.g. "Mon–Fri · 11:00–15:00".
 *
 * @param array<string,mixed> $sched Schedule.
 * @return string
 */
function describe( $sched ) {
	$labels = array(
		'mon' => __( 'Mon', 'dinekit' ),
		'tue' => __( 'Tue', 'dinekit' ),
		'wed' => __( 'Wed', 'dinekit' ),
		'thu' => __( 'Thu', 'dinekit' ),
		'fri' => __( 'Fri', 'dinekit' ),
		'sat' => __( 'Sat', 'dinekit' ),
		'sun' => __( 'Sun', 'dinekit' ),
	);
	$parts = array();
	if ( ! empty( $sched['days'] ) ) {
		$named = array();
		foreach ( day_keys() as $key ) {
			if ( in_array( $key, $sched['days'], true ) ) {
				$named[] = $labels[ $key ];
			}
		}
		$parts[] = implode( ', ', $named );
	}
	if ( '' !== $sched['start'] && '' !== $sched['end'] ) {
		$parts[] = $sched['start'] . '–' . $sched['end'];
	}
	return implode( ' · ', $parts );
}

/**
 * Duplicate a menu: a new term plus the same item→menu assignments.
 *
 * @param int $term_id Source menu term id.
 * @return array{id:int,name:string}|null
 */
function duplicate( $term_id ) {
	$source = get_term( $term_id, 'dinekit_menu' );
	if ( ! $source || is_wp_error( $source ) ) {
		return null;
	}

	/* translators: %s: source menu name. */
	$name   = sprintf( __( '%s (copy)', 'dinekit' ), $source->name );
	$result = wp_insert_term( $name, 'dinekit_menu' );
	if ( is_wp_error( $result ) ) {
		return null;
	}
	$new_id = (int) $result['term_id'];

	update_term_meta( $new_id, 'dinekit_menu_created', time() );
	$order = get_term_meta( $term_id, 'dinekit_order', true );
	update_term_meta( $new_id, 'dinekit_order', '' !== $order ? (int) $order + 1 : 0 );

	// Copy the schedule.
	update_term_meta( $new_id, 'dinekit_menu_schedule', get_schedule( $term_id ) );

	// Assign the same items to the new menu.
	$items = get_objects_in_term( $term_id, 'dinekit_menu' );
	if ( is_array( $items ) ) {
		foreach ( $items as $item_id ) {
			wp_add_object_terms( (int) $item_id, $new_id, 'dinekit_menu' );
		}
	}

	$term = get_term( $new_id, 'dinekit_menu' );
	return array(
		'id'   => $new_id,
		'name' => $term->name,
	);
}

/**
 * Pages/posts that display a given menu (block attribute or shortcode).
 *
 * @param int $term_id Menu term id.
 * @return array<int,array{title:string,url:string}>
 */
function used_on( $term_id ) {
	$found = array();
	$query = new \WP_Query(
		array(
			'post_type'      => array( 'page', 'post' ),
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'no_found_rows'  => true,
			's'              => 'dinekit',
		)
	);
	foreach ( $query->posts as $post ) {
		$content = $post->post_content;
		$needle  = 'menu="' . $term_id . '"';
		$block   = '"menu":' . $term_id;
		if ( false !== strpos( $content, $needle ) || false !== strpos( $content, $block ) ) {
			$found[] = array(
				'title' => get_the_title( $post ),
				'url'   => (string) get_permalink( $post ),
			);
		}
	}
	return $found;
}
