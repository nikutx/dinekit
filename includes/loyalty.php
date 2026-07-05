<?php
/**
 * Loyalty — a simple points scheme for the POS. Members (a CPT) earn points per
 * £ spent when a tab settles and can redeem points as a discount on a bill.
 * No custom tables; economics are two constants below.
 *
 * @package DineKit
 */

namespace DineKit\Loyalty;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const CPT          = 'dinekit_member';
const EARN_RATE    = 1.0;  // Points earned per £1 spent.
const REDEEM_VALUE = 0.05; // £ value of one point when redeemed (20 pts = £1).

/**
 * Boot: CPT + REST.
 *
 * @return void
 */
function init() {
	add_action( 'init', __NAMESPACE__ . '\\register_cpt' );
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Register the member CPT.
 *
 * @return void
 */
function register_cpt() {
	register_post_type(
		CPT,
		array(
			'labels'       => array( 'name' => __( 'Members', 'dinekit' ) ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_rest' => false,
			'supports'     => array( 'title' ),
		)
	);
}

/**
 * Serialize a member.
 *
 * @param int $id Member id.
 * @return array<string,mixed>
 */
function member_response( $id ) {
	return array(
		'id'     => (int) $id,
		'name'   => get_the_title( $id ),
		'phone'  => (string) get_post_meta( $id, 'dinekit_member_phone', true ),
		'email'  => (string) get_post_meta( $id, 'dinekit_member_email', true ),
		'points' => (int) get_post_meta( $id, 'dinekit_member_points', true ),
	);
}

/**
 * Adjust a member's points (never below zero).
 *
 * @param int $id    Member id.
 * @param int $delta Change (may be negative).
 * @return void
 */
function add_points( $id, $delta ) {
	$p = max( 0, (int) get_post_meta( $id, 'dinekit_member_points', true ) + (int) $delta );
	update_post_meta( $id, 'dinekit_member_points', $p );
}

/**
 * On settle: award earned points (minus any redeemed) to the tab's member. Runs
 * once per order (guarded by a flag).
 *
 * @param int $order_id  Order id.
 * @param int $member_id Member id.
 * @return void
 */
function award( $order_id, $member_id ) {
	if ( get_post_meta( $order_id, 'dinekit_order_loyalty_done', true ) ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	$earned   = (int) floor( \DineKit\Ordering\grand_total( $order_id ) * EARN_RATE );
	$redeemed = (int) get_post_meta( $order_id, 'dinekit_order_redeem', true );
	add_points( $member_id, $earned - $redeemed );
	update_post_meta( $order_id, 'dinekit_order_loyalty_done', 1 );
}

/**
 * Register REST routes (member lookup + create), gated on the orders permission.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';
	require_once DINEKIT_DIR . 'includes/access.php';
	$ops = static function () {
		return \DineKit\Access\can( 'orders' );
	};
	register_rest_route(
		$ns,
		'/members',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_search',
				'permission_callback' => $ops,
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\rest_create',
				'permission_callback' => $ops,
			),
		)
	);
}

/**
 * GET /members?q= — search by name, phone or email.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_search( $request ) {
	$q = sanitize_text_field( (string) $request->get_param( 'q' ) );
	if ( strlen( $q ) < 1 ) {
		return rest_ensure_response( array() );
	}
	$by_name = get_posts(
		array(
			'post_type'      => CPT,
			'post_status'    => 'publish',
			's'              => $q,
			'posts_per_page' => 10,
			'no_found_rows'  => true,
			'fields'         => 'ids',
		)
	);
	$by_meta = get_posts(
		array(
			'post_type'      => CPT,
			'post_status'    => 'publish',
			'posts_per_page' => 10,
			'no_found_rows'  => true,
			'fields'         => 'ids',
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
			'meta_query'     => array(
				'relation' => 'OR',
				array(
					'key'     => 'dinekit_member_phone',
					'value'   => $q,
					'compare' => 'LIKE',
				),
				array(
					'key'     => 'dinekit_member_email',
					'value'   => $q,
					'compare' => 'LIKE',
				),
			),
		)
	);
	$ids     = array_slice( array_values( array_unique( array_merge( $by_name, $by_meta ) ) ), 0, 10 );
	return rest_ensure_response( array_map( __NAMESPACE__ . '\\member_response', $ids ) );
}

/**
 * POST /members — create a member.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_create( $request ) {
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	if ( '' === $name ) {
		$name = sanitize_text_field( (string) $request->get_param( 'phone' ) );
	}
	if ( '' === $name ) {
		return new \WP_Error( 'dinekit_member_name', __( 'Enter a name or phone.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$id = wp_insert_post(
		array(
			'post_type'   => CPT,
			'post_status' => 'publish',
			'post_title'  => $name,
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return new \WP_Error( 'dinekit_member_save', __( 'Could not create the member.', 'dinekit' ), array( 'status' => 500 ) );
	}
	update_post_meta( $id, 'dinekit_member_phone', sanitize_text_field( (string) $request->get_param( 'phone' ) ) );
	update_post_meta( $id, 'dinekit_member_email', sanitize_email( (string) $request->get_param( 'email' ) ) );
	update_post_meta( $id, 'dinekit_member_points', 0 );
	return rest_ensure_response( member_response( $id ) );
}
