<?php
/**
 * Stripe Terminal (server-driven) — in-person card via a smart reader (WisePOS E
 * / Reader S700). Our PHP drives the reader over the Stripe API (api.stripe.com
 * only — no SDK, no broker, fits the standalone/no-phone-home rules). A
 * card_present PaymentIntent is processed on the paired reader; the existing
 * pos_pay webhook branch records a card tender on the tab and auto-closes it.
 *
 * @package DineKit
 */

namespace DineKit\Terminal;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_terminal';

/**
 * Boot: REST routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Terminal settings (paired reader).
 *
 * @return array<string,string>
 */
function settings() {
	$o = get_option( OPTION );
	return array(
		'readerId'   => is_array( $o ) && isset( $o['readerId'] ) ? (string) $o['readerId'] : '',
		'readerName' => is_array( $o ) && isset( $o['readerName'] ) ? (string) $o['readerName'] : '',
	);
}

/**
 * GET the Stripe API with the merchant's secret key (Terminal reader lists).
 *
 * @param string $path Endpoint path.
 * @return array<string,mixed>|\WP_Error
 */
function stripe_get( $path ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$sk = \DineKit\Integrations\active_secret();
	if ( '' === $sk ) {
		return new \WP_Error( 'dinekit_term_nokey', __( 'Stripe is not connected.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$res = wp_remote_get(
		'https://api.stripe.com/v1/' . $path,
		array(
			'timeout' => 20,
			'headers' => array( 'Authorization' => 'Bearer ' . $sk ),
		)
	);
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$body = json_decode( (string) wp_remote_retrieve_body( $res ), true );
	return is_array( $body ) ? $body : array();
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
		'/terminal',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_get',
			'permission_callback' => $ops,
		)
	);
	register_rest_route(
		$ns,
		'/terminal/connection-token',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_connection_token',
			'permission_callback' => $ops,
		)
	);
	register_rest_route(
		$ns,
		'/terminal/readers',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_readers',
			'permission_callback' => $mgr,
		)
	);
	register_rest_route(
		$ns,
		'/terminal/reader',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_save_reader',
			'permission_callback' => $mgr,
		)
	);
	register_rest_route(
		$ns,
		'/terminal/charge',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_charge',
			'permission_callback' => $ops,
		)
	);
}

/**
 * GET /terminal — paired reader + readiness.
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$s = settings();
	return rest_ensure_response(
		array(
			'paired'     => '' !== $s['readerId'],
			'readerId'   => $s['readerId'],
			'readerName' => $s['readerName'],
			'ready'      => \DineKit\Integrations\stripe_ready(),
		)
	);
}

/**
 * POST /terminal/connection-token.
 *
 * @return \WP_REST_Response|\WP_Error
 */
function rest_connection_token() {
	require_once DINEKIT_DIR . 'includes/payments.php';
	$tok = \DineKit\Payments\stripe_post( 'terminal/connection_tokens', array() );
	if ( is_wp_error( $tok ) ) {
		return $tok;
	}
	return rest_ensure_response( array( 'secret' => (string) ( $tok['secret'] ?? '' ) ) );
}

/**
 * GET /terminal/readers — list registered readers.
 *
 * @return \WP_REST_Response|\WP_Error
 */
function rest_readers() {
	$res = stripe_get( 'terminal/readers' );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$readers = array();
	foreach ( (array) ( $res['data'] ?? array() ) as $r ) {
		$readers[] = array(
			'id'     => (string) ( $r['id'] ?? '' ),
			'label'  => (string) ( $r['label'] ?? ( $r['device_type'] ?? 'Reader' ) ),
			'status' => (string) ( $r['status'] ?? '' ),
		);
	}
	return rest_ensure_response( $readers );
}

/**
 * POST /terminal/reader — pair a reader.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_save_reader( $request ) {
	update_option(
		OPTION,
		array(
			'readerId'   => sanitize_text_field( (string) $request->get_param( 'readerId' ) ),
			'readerName' => sanitize_text_field( (string) $request->get_param( 'readerName' ) ),
		),
		false
	);
	return rest_ensure_response( rest_get()->get_data() );
}

/**
 * POST /terminal/charge — create a card_present PaymentIntent for a POS tab and
 * process it on the paired reader. Fulfilment is webhook-driven (pos_pay →
 * records a card tender + auto-closes).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_charge( $request ) {
	require_once DINEKIT_DIR . 'includes/payments.php';
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	$order_id = (int) $request->get_param( 'orderId' );
	if ( 'dinekit_order' !== get_post_type( $order_id ) ) {
		return new \WP_Error( 'dinekit_term_404', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$reader = settings()['readerId'];
	if ( '' === $reader ) {
		return new \WP_Error( 'dinekit_term_noreader', __( 'No card reader is paired. Pair one first.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$grand = \DineKit\Ordering\grand_total( $order_id );
	$paid  = 0.0;
	foreach ( (array) json_decode( (string) get_post_meta( $order_id, 'dinekit_order_tenders', true ), true ) as $t ) {
		$paid += (float) $t['amount'];
	}
	$req   = (float) $request->get_param( 'amount' );
	$amt   = $req > 0 ? min( $req, $grand - $paid ) : ( $grand - $paid );
	$pence = (int) round( $amt * 100 );
	if ( $pence < 1 ) {
		return new \WP_Error( 'dinekit_term_amount', __( 'Nothing left to pay.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$intent = \DineKit\Payments\stripe_post(
		'payment_intents',
		array(
			'amount'                 => $pence,
			'currency'               => 'gbp',
			'payment_method_types[]' => 'card_present',
			'capture_method'         => 'automatic',
			'metadata[order_id]'     => (string) $order_id,
			'metadata[pos_pay]'      => '1',
			'metadata[site]'         => home_url(),
		)
	);
	if ( is_wp_error( $intent ) ) {
		return $intent;
	}
	$process = \DineKit\Payments\stripe_post(
		'terminal/readers/' . rawurlencode( $reader ) . '/process_payment_intent',
		array( 'payment_intent' => (string) ( $intent['id'] ?? '' ) )
	);
	if ( is_wp_error( $process ) ) {
		return $process;
	}
	return rest_ensure_response(
		array(
			'ok'     => true,
			'amount' => $pence,
			'status' => (string) ( $process['action']['status'] ?? 'in_progress' ),
		)
	);
}
