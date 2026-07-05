<?php
/**
 * Staff & labour — team members, roles and the labour settings that power the
 * operations dashboard. People/shifts/leave are CPT/meta; settings are one
 * option. No custom tables, per the plugin's hard rules.
 *
 * DineKit deliberately does NOT do PAYE payroll (RTI to HMRC, pensions
 * auto-enrolment) — that's specialist, regulated software. It DOES do rota,
 * roles, holiday tracking and a covers-vs-staff dashboard, and can export a
 * timesheet/holiday summary for whatever payroll the venue already uses.
 *
 * @package DineKit
 */

namespace DineKit\Staff;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_staff';

/**
 * Boot the module.
 *
 * @return void
 */
function init() {
	add_action( 'init', __NAMESPACE__ . '\\register' );
	require_once DINEKIT_DIR . 'includes/staff-rest.php';
	Rest\init();
}

/**
 * Manage permission.
 *
 * @return bool
 */
function can_manage() {
	require_once DINEKIT_DIR . 'includes/access.php';
	return \DineKit\Access\can( 'staff' );
}

/**
 * Canonical roles with their front-of-house / back-of-house default area.
 *
 * @return array<int,array{key:string,label:string,area:string}>
 */
function roles() {
	return array(
		array(
			'key'   => 'manager',
			'label' => __( 'Manager', 'dinekit' ),
			'area'  => 'both',
		),
		array(
			'key'   => 'server',
			'label' => __( 'Server / waiter', 'dinekit' ),
			'area'  => 'foh',
		),
		array(
			'key'   => 'host',
			'label' => __( 'Host / front desk', 'dinekit' ),
			'area'  => 'foh',
		),
		array(
			'key'   => 'runner',
			'label' => __( 'Runner', 'dinekit' ),
			'area'  => 'foh',
		),
		array(
			'key'   => 'bartender',
			'label' => __( 'Bartender', 'dinekit' ),
			'area'  => 'foh',
		),
		array(
			'key'   => 'chef',
			'label' => __( 'Chef', 'dinekit' ),
			'area'  => 'boh',
		),
		array(
			'key'   => 'kitchen',
			'label' => __( 'Kitchen / line', 'dinekit' ),
			'area'  => 'boh',
		),
		array(
			'key'   => 'kp',
			'label' => __( 'Kitchen porter', 'dinekit' ),
			'area'  => 'boh',
		),
		array(
			'key'   => 'driver',
			'label' => __( 'Delivery driver', 'dinekit' ),
			'area'  => 'foh',
		),
		array(
			'key'   => 'other',
			'label' => __( 'Other', 'dinekit' ),
			'area'  => 'both',
		),
	);
}

/**
 * The default area for a role key.
 *
 * @param string $role Role key.
 * @return string foh | boh | both.
 */
function area_for_role( $role ) {
	foreach ( roles() as $r ) {
		if ( $r['key'] === $role ) {
			return $r['area'];
		}
	}
	return 'both';
}

/**
 * Human label for a role key (falls back to the key itself).
 *
 * @param string $role Role key.
 * @return string
 */
function role_label( $role ) {
	foreach ( roles() as $r ) {
		if ( $r['key'] === $role ) {
			return $r['label'];
		}
	}
	return $role;
}

/**
 * Staff who are on APPROVED leave on a given date, keyed by staff id. Pending or
 * denied requests don't count — only approved leave makes someone unavailable.
 * Cached per date for the request so callers (rota list, ops) don't re-query.
 *
 * @param string $date Y-m-d.
 * @return array<int,array{from:string,to:string}>
 */
function on_leave( $date ) {
	static $cache = array();
	if ( isset( $cache[ $date ] ) ) {
		return $cache[ $date ];
	}
	$rows = get_posts(
		array(
			'post_type'      => 'dinekit_leave',
			'post_status'    => 'publish',
			'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- leave active on a single day.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				'relation' => 'AND',
				array(
					'key'   => 'dinekit_leave_status',
					'value' => 'approved',
				),
				array(
					'key'     => 'dinekit_leave_from',
					'value'   => $date,
					'compare' => '<=',
					'type'    => 'DATE',
				),
				array(
					'key'     => 'dinekit_leave_to',
					'value'   => $date,
					'compare' => '>=',
					'type'    => 'DATE',
				),
			),
		)
	);
	$map  = array();
	foreach ( $rows as $lid ) {
		$sid = (int) get_post_meta( $lid, 'dinekit_leave_staff', true );
		if ( $sid ) {
			$map[ $sid ] = array(
				'from' => (string) get_post_meta( $lid, 'dinekit_leave_from', true ),
				'to'   => (string) get_post_meta( $lid, 'dinekit_leave_to', true ),
			);
		}
	}
	$cache[ $date ] = $map;
	return $map;
}

/**
 * Whether a staff member has approved leave covering a date.
 *
 * @param int    $staff_id Staff post id.
 * @param string $date     Y-m-d.
 * @return bool
 */
function staff_on_leave( $staff_id, $date ) {
	return isset( on_leave( $date )[ (int) $staff_id ] );
}

/**
 * Register the staff/shift/leave post types + meta.
 *
 * @return void
 */
function register() {
	$common = array(
		'public'       => false,
		'show_ui'      => false,
		'show_in_menu' => false,
		'show_in_rest' => false,
		'supports'     => array( 'title' ),
		'rewrite'      => false,
		'has_archive'  => false,
		'map_meta_cap' => true,
	);
	register_post_type( 'dinekit_staff', array_merge( $common, array( 'label' => __( 'Staff', 'dinekit' ) ) ) );
	register_post_type( 'dinekit_shift', array_merge( $common, array( 'label' => __( 'Shifts', 'dinekit' ) ) ) );
	register_post_type( 'dinekit_leave', array_merge( $common, array( 'label' => __( 'Leave', 'dinekit' ) ) ) );

	$meta = array(
		'dinekit_staff' => array(
			'dinekit_role'    => 'string',
			'dinekit_area'    => 'string',
			'dinekit_email'   => 'string',
			'dinekit_phone'   => 'string',
			'dinekit_rate'    => 'string', // Hourly rate (decimal string).
			'dinekit_holiday' => 'integer', // Annual holiday allowance, days.
			'dinekit_color'   => 'string',
			'dinekit_active'  => 'integer', // 1 | 0.
		),
		'dinekit_shift' => array(
			'dinekit_shift_staff' => 'integer',
			'dinekit_shift_date'  => 'string',  // Y-m-d.
			'dinekit_shift_start' => 'string',  // H:i.
			'dinekit_shift_end'   => 'string',  // H:i.
			'dinekit_shift_role'  => 'string',
			'dinekit_shift_note'  => 'string',
		),
		'dinekit_leave' => array(
			'dinekit_leave_staff'  => 'integer',
			'dinekit_leave_from'   => 'string', // Y-m-d.
			'dinekit_leave_to'     => 'string', // Y-m-d.
			'dinekit_leave_days'   => 'string', // Decimal string (supports half days).
			'dinekit_leave_status' => 'string', // pending | approved | denied.
			'dinekit_leave_note'   => 'string',
		),
	);
	foreach ( $meta as $post_type => $fields ) {
		foreach ( $fields as $key => $type ) {
			register_post_meta(
				$post_type,
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
}

/**
 * Labour settings (merged over defaults).
 *
 * @return array<string,mixed>
 */
function settings() {
	$defaults = array(
		'covers_per_server' => 20,  // Covers one server handles per service (operator rule of thumb).
		'utilisation'       => 75,  // % of seats realistically filled per turn.
		'target_labour_pct' => 28,  // Target labour cost as a % of sales.
	);
	$stored   = get_option( OPTION );
	return is_array( $stored ) ? wp_parse_args( $stored, $defaults ) : $defaults;
}

/**
 * Save labour settings.
 *
 * @param array<string,mixed> $input Raw input.
 * @return array<string,mixed> Saved settings.
 */
function save_settings( $input ) {
	$s = settings();
	if ( isset( $input['covers_per_server'] ) ) {
		$s['covers_per_server'] = max( 1, min( 100, absint( $input['covers_per_server'] ) ) );
	}
	if ( isset( $input['utilisation'] ) ) {
		$s['utilisation'] = max( 10, min( 100, absint( $input['utilisation'] ) ) );
	}
	if ( isset( $input['target_labour_pct'] ) ) {
		$s['target_labour_pct'] = max( 1, min( 90, absint( $input['target_labour_pct'] ) ) );
	}
	update_option( OPTION, $s );
	return $s;
}

/**
 * All staff (optionally active only).
 *
 * @param bool $active_only Only active members.
 * @return \WP_Post[]
 */
function all_staff( $active_only = false ) {
	$posts = get_posts(
		array(
			'post_type'      => 'dinekit_staff',
			'post_status'    => 'publish',
			// A venue has a bounded team; we need them all for rota/dashboard.
			'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page
			'orderby'        => 'title',
			'order'          => 'ASC',
			'no_found_rows'  => true,
		)
	);
	if ( ! $active_only ) {
		return $posts;
	}
	return array_values(
		array_filter(
			$posts,
			static function ( $p ) {
				return '0' !== (string) get_post_meta( $p->ID, 'dinekit_active', true );
			}
		)
	);
}

/**
 * Operations snapshot for a day: covers booked vs capacity, and staff on vs the
 * staff the covers imply. Reuses DineKit's own bookings + floor — the edge a
 * standalone scheduler can't match.
 *
 * @param string $date Y-m-d.
 * @return array<string,mixed>
 */
function ops( $date ) {
	require_once DINEKIT_DIR . 'includes/bookings/availability.php';
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$cfg = settings();

	// Covers booked (active bookings on the day).
	$covers = 0;
	foreach ( \DineKit\Bookings\Availability\bookings_on( $date ) as $b ) {
		$covers += (int) $b['party'];
	}

	// Seats + service window + turn time drive the theoretical capacity.
	$seats = 0;
	foreach ( \DineKit\Bookings\Availability\all_tables() as $t ) {
		$seats += (int) $t['seats'];
	}
	$service_min = 0;
	foreach ( \DineKit\Bookings\Availability\service_periods( $date ) as $p ) {
		$open  = \DineKit\Bookings\Availability\to_minutes( $p['open'] );
		$close = \DineKit\Bookings\Availability\to_minutes( $p['close'] );
		if ( $close <= $open ) {
			$close += 1440;
		}
		$service_min += ( $close - $open );
	}
	$turn = max( 1, (int) \DineKit\Bookings\Settings\get()['turn_time'] );
	$util = max( 0.1, min( 1.0, (int) $cfg['utilisation'] / 100 ) );

	$theoretical  = ( $service_min > 0 ) ? (int) round( $seats * ( $service_min / $turn ) * $util ) : 0;
	$capacity_pct = $theoretical > 0 ? (int) round( $covers / $theoretical * 100 ) : 0;

	// Staff scheduled today + the servers the covers imply.
	$cps         = max( 1, (int) $cfg['covers_per_server'] );
	$required    = (int) ceil( $covers / $cps );
	$staff_on    = 0;
	$servers_on  = 0;
	$labour_cost = 0.0;
	$leave       = on_leave( $date ); // Approved leave today, keyed by staff id.
	$clashes     = array();           // Shifts scheduled on someone's approved holiday.
	$shifts      = get_posts(
		array(
			'post_type'      => 'dinekit_shift',
			'post_status'    => 'publish',
			'posts_per_page' => 500, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- one day's shifts.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_key'       => 'dinekit_shift_date', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $date, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	foreach ( $shifts as $sid ) {
		++$staff_on;
		$role = (string) get_post_meta( $sid, 'dinekit_shift_role', true );
		if ( 'boh' !== area_for_role( $role ) ) {
			++$servers_on;
		}
		$start_hm = (string) get_post_meta( $sid, 'dinekit_shift_start', true );
		$end_hm   = (string) get_post_meta( $sid, 'dinekit_shift_end', true );
		$start    = \DineKit\Bookings\Availability\to_minutes( $start_hm );
		$end      = \DineKit\Bookings\Availability\to_minutes( $end_hm );
		$mins     = $end - $start;
		if ( $mins <= 0 ) {
			$mins += 1440;
		}
		$staff_id     = (int) get_post_meta( $sid, 'dinekit_shift_staff', true );
		$labour_cost += ( $mins / 60 ) * (float) get_post_meta( $staff_id, 'dinekit_rate', true );

		// Clash: this shift falls on the member's approved holiday. They still
		// count above (if the manager leaves it, both the holiday and the shift
		// are paid) — but we surface it so it isn't a silent double-booking.
		if ( isset( $leave[ $staff_id ] ) ) {
			$clashes[] = array(
				'shiftId' => (int) $sid,
				'staffId' => $staff_id,
				'name'    => get_the_title( $staff_id ) ? get_the_title( $staff_id ) : __( 'A team member', 'dinekit' ),
				'role'    => role_label( $role ),
				'start'   => $start_hm,
				'end'     => $end_hm,
				'from'    => $leave[ $staff_id ]['from'],
				'to'      => $leave[ $staff_id ]['to'],
			);
		}
	}
	$over_under = $required > 0 ? (int) round( ( $servers_on - $required ) / $required * 100 ) : 0;

	return array(
		'date'            => $date,
		'covers'          => $covers,
		'seats'           => $seats,
		'serviceHours'    => round( $service_min / 60, 1 ),
		'turnTime'        => $turn,
		'theoretical'     => $theoretical,
		'capacityPct'     => $capacity_pct,
		'coversPerServer' => $cps,
		'required'        => $required,
		'serversOn'       => $servers_on,
		'staffOn'         => $staff_on,
		'overUnderPct'    => $over_under,
		'labourCost'      => round( $labour_cost, 2 ),
		'clashes'         => $clashes,
		'clashCount'      => count( $clashes ),
	);
}
