<?php
/**
 * Cash management for the POS — a drawer session with an opening float, cash
 * movements (pay in/out, no-sale) and X/Z reports. State lives in two options
 * (current session + a capped history of Z reports); no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Cash;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SESSION = 'dinekit_cash_session';
const HISTORY = 'dinekit_cash_z_reports';

/**
 * Boot: REST routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * The current (open) drawer session, or null.
 *
 * @return array<string,mixed>|null
 */
function session() {
	$s = get_option( SESSION );
	return ( is_array( $s ) && ! empty( $s['open'] ) ) ? $s : null;
}

/**
 * Sum of cash tenders taken across orders since a timestamp.
 *
 * @param string $since ISO8601 timestamp.
 * @return float
 */
function cash_sales_since( $since ) {
	$ids = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'fields'         => 'ids',
		)
	);
	$sum = 0.0;
	foreach ( $ids as $pid ) {
		$tenders = json_decode( (string) get_post_meta( $pid, 'dinekit_order_tenders', true ), true );
		foreach ( is_array( $tenders ) ? $tenders : array() as $t ) {
			if ( 'cash' === ( $t['type'] ?? '' ) && (string) ( $t['t'] ?? '' ) >= $since ) {
				$sum += (float) $t['amount'];
			}
		}
	}
	return round( $sum, 2 );
}

/**
 * Build an X/Z report for the open session.
 *
 * @param float|null $counted Counted drawer cash (for variance), or null.
 * @return array<string,mixed>
 */
function report( $counted = null ) {
	$s = session();
	if ( ! $s ) {
		return array( 'open' => false );
	}
	$moves    = is_array( $s['movements'] ) ? $s['movements'] : array();
	$pay_in   = 0.0;
	$pay_out  = 0.0;
	$no_sales = 0;
	foreach ( $moves as $m ) {
		if ( 'in' === $m['type'] ) {
			$pay_in += (float) $m['amount'];
		} elseif ( 'out' === $m['type'] ) {
			$pay_out += (float) $m['amount'];
		} elseif ( 'nosale' === $m['type'] ) {
			++$no_sales;
		}
	}
	$float     = (float) $s['float'];
	$cash_sale = cash_sales_since( (string) $s['since'] );
	$expected  = round( $float + $cash_sale + $pay_in - $pay_out, 2 );
	$out       = array(
		'open'      => true,
		'since'     => (string) $s['since'],
		'openedBy'  => (string) $s['openedBy'],
		'float'     => round( $float, 2 ),
		'cashSales' => $cash_sale,
		'payIns'    => round( $pay_in, 2 ),
		'payOuts'   => round( $pay_out, 2 ),
		'noSales'   => $no_sales,
		'expected'  => $expected,
		'movements' => $moves,
	);
	if ( null !== $counted ) {
		$out['counted']  = round( (float) $counted, 2 );
		$out['variance'] = round( (float) $counted - $expected, 2 );
	}
	return $out;
}

/**
 * Register REST routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';
	require_once DINEKIT_DIR . 'includes/access.php';
	$ops = static function () {
		return \DineKit\Access\can( 'orders' );
	};
	$mgr = static function () {
		return \DineKit\Access\can( 'settings' );
	};
	register_rest_route(
		$ns,
		'/cash',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_get',
			'permission_callback' => $ops,
		)
	);
	register_rest_route(
		$ns,
		'/cash/open',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_open',
			'permission_callback' => $ops,
		)
	);
	register_rest_route(
		$ns,
		'/cash/movement',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_movement',
			'permission_callback' => $ops,
		)
	);
	register_rest_route(
		$ns,
		'/cash/close',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_close',
			'permission_callback' => $mgr,
		)
	);
	register_rest_route(
		$ns,
		'/cash/reports',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_reports',
			'permission_callback' => $mgr,
		)
	);
}

/**
 * Current logged-in staff display name.
 *
 * @return string
 */
function who() {
	$u = wp_get_current_user();
	return $u && $u->exists() ? $u->display_name : '';
}

/**
 * GET /cash — the live X report (or {open:false}).
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	return rest_ensure_response( report() );
}

/**
 * POST /cash/open — start a drawer session with an opening float.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_open( $request ) {
	if ( session() ) {
		return new \WP_Error( 'dinekit_cash_open', __( 'A drawer session is already open.', 'dinekit' ), array( 'status' => 400 ) );
	}
	update_option(
		SESSION,
		array(
			'open'      => true,
			'since'     => current_time( 'c' ),
			'openedBy'  => who(),
			'float'     => round( (float) $request->get_param( 'float' ), 2 ),
			'movements' => array(),
		),
		false
	);
	return rest_ensure_response( report() );
}

/**
 * POST /cash/movement — pay in / pay out / no-sale.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_movement( $request ) {
	$s = session();
	if ( ! $s ) {
		return new \WP_Error( 'dinekit_cash_none', __( 'Open the drawer first.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$type             = sanitize_key( (string) $request->get_param( 'type' ) );
	$type             = in_array( $type, array( 'in', 'out', 'nosale' ), true ) ? $type : 'in';
	$s['movements'][] = array(
		'type'   => $type,
		'amount' => 'nosale' === $type ? 0 : round( (float) $request->get_param( 'amount' ), 2 ),
		'reason' => sanitize_text_field( (string) $request->get_param( 'reason' ) ),
		't'      => current_time( 'c' ),
		'by'     => who(),
	);
	update_option( SESSION, $s, false );
	return rest_ensure_response( report() );
}

/**
 * POST /cash/close — Z report: archive + reset the drawer.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_close( $request ) {
	if ( ! session() ) {
		return new \WP_Error( 'dinekit_cash_none', __( 'No drawer session is open.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$z             = report( (float) $request->get_param( 'counted' ) );
	$z['closedAt'] = current_time( 'c' );
	$z['closedBy'] = who();

	$history = get_option( HISTORY );
	$history = is_array( $history ) ? $history : array();
	array_unshift( $history, $z );
	update_option( HISTORY, array_slice( $history, 0, 50 ), false );
	delete_option( SESSION );

	return rest_ensure_response( $z );
}

/**
 * GET /cash/reports — recent Z reports.
 *
 * @return \WP_REST_Response
 */
function rest_reports() {
	$history = get_option( HISTORY );
	return rest_ensure_response( is_array( $history ) ? $history : array() );
}
