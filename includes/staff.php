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
	return current_user_can( 'manage_options' );
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
	register_post_type( 'dk_staff', array_merge( $common, array( 'label' => __( 'Staff', 'dinekit' ) ) ) );
	register_post_type( 'dk_shift', array_merge( $common, array( 'label' => __( 'Shifts', 'dinekit' ) ) ) );
	register_post_type( 'dk_leave', array_merge( $common, array( 'label' => __( 'Leave', 'dinekit' ) ) ) );

	$meta = array(
		'dk_staff' => array(
			'dk_role'    => 'string',
			'dk_area'    => 'string',
			'dk_email'   => 'string',
			'dk_phone'   => 'string',
			'dk_rate'    => 'string', // Hourly rate (decimal string).
			'dk_holiday' => 'integer', // Annual holiday allowance, days.
			'dk_color'   => 'string',
			'dk_active'  => 'integer', // 1 | 0.
		),
		'dk_shift' => array(
			'dk_shift_staff' => 'integer',
			'dk_shift_date'  => 'string',  // Y-m-d.
			'dk_shift_start' => 'string',  // H:i.
			'dk_shift_end'   => 'string',  // H:i.
			'dk_shift_role'  => 'string',
			'dk_shift_note'  => 'string',
		),
		'dk_leave' => array(
			'dk_leave_staff'  => 'integer',
			'dk_leave_from'   => 'string', // Y-m-d.
			'dk_leave_to'     => 'string', // Y-m-d.
			'dk_leave_days'   => 'string', // Decimal string (supports half days).
			'dk_leave_status' => 'string', // pending | approved | denied.
			'dk_leave_note'   => 'string',
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
			'post_type'      => 'dk_staff',
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
				return '0' !== (string) get_post_meta( $p->ID, 'dk_active', true );
			}
		)
	);
}
