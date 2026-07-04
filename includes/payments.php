<?php
/**
 * Payments — Stripe PaymentIntents (on-site, no redirect) + a signature-verified
 * webhook. Uses the merchant's own keys via the REST API (no bundled SDK); card
 * data never touches this server (PCI SAQ-A). Fulfilment is driven by the
 * webhook, not the client return.
 *
 * @package DineKit
 */

namespace DineKit\Payments;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boot the module.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * POST to the Stripe API with the merchant's secret key (form-encoded).
 *
 * @param string              $path Endpoint path, e.g. 'payment_intents'.
 * @param array<string,mixed> $body Form fields (supports one nested level via bracket keys).
 * @return array<string,mixed>|\WP_Error Decoded JSON, or WP_Error.
 */
function stripe_post( $path, $body ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$sk = \DineKit\Integrations\active_secret();
	if ( '' === $sk ) {
		return new \WP_Error( 'dinekit_pay_nokey', __( 'Stripe is not connected.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$res = wp_remote_post(
		'https://api.stripe.com/v1/' . $path,
		array(
			'headers' => array(
				'Authorization' => 'Bearer ' . $sk,
				'Content-Type'  => 'application/x-www-form-urlencoded',
			),
			'timeout' => 20,
			'body'    => $body,
		)
	);
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
	if ( (int) wp_remote_retrieve_response_code( $res ) >= 300 ) {
		$msg = isset( $json['error']['message'] ) ? (string) $json['error']['message'] : __( 'Payment could not be started.', 'dinekit' );
		return new \WP_Error( 'dinekit_pay_api', $msg, array( 'status' => 402 ) );
	}
	return is_array( $json ) ? $json : array();
}

/**
 * Register routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';
	register_rest_route(
		$ns,
		'/payments/intent',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_intent',
			'permission_callback' => '__return_true',
		)
	);
	register_rest_route(
		$ns,
		'/stripe-webhook',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\handle_webhook',
			'permission_callback' => '__return_true', // Authenticated by Stripe signature, not WP.
		)
	);
}

/**
 * POST /payments/intent — one entry point for both payable surfaces. Dispatches
 * on the params: `booking` → a table deposit, otherwise `order` → an online
 * order. Either way the amount is computed server-side, never trusted from the
 * client.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_intent( $request ) {
	if ( absint( $request->get_param( 'booking' ) ) > 0 ) {
		return create_booking_intent( $request );
	}
	return create_order_intent( $request );
}

/**
 * The deposit due for a booking, in the smallest currency unit (pence), or 0 if
 * no deposit applies. Computed from the deposit rule × the party size.
 *
 * @param int $booking_id Booking post id.
 * @return int
 */
function booking_deposit_pence( $booking_id ) {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$party = (int) get_post_meta( $booking_id, 'dk_party', true );
	if ( ! \DineKit\Bookings\Settings\needs_deposit( $party ) ) {
		return 0;
	}
	$per = (int) \DineKit\Bookings\Settings\get()['deposit_amount']; // Whole units per guest.
	return max( 0, $per * 100 * $party );
}

/**
 * Start a PaymentIntent for a booking deposit. Amount is derived from the
 * deposit rule and the stored party size, never the client.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_booking_intent( $request ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$booking_id = absint( $request->get_param( 'booking' ) );
	if ( ! $booking_id || 'dk_booking' !== get_post_type( $booking_id ) ) {
		return new \WP_Error( 'dinekit_pay_booking', __( 'Booking not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$pence = booking_deposit_pence( $booking_id );
	if ( $pence < 1 ) {
		return new \WP_Error( 'dinekit_pay_nodep', __( 'No deposit is required for this booking.', 'dinekit' ), array( 'status' => 400 ) );
	}
	if ( '1' === (string) get_post_meta( $booking_id, 'dk_deposit_paid', true ) ) {
		return new \WP_Error( 'dinekit_pay_paid', __( 'This deposit has already been paid.', 'dinekit' ), array( 'status' => 409 ) );
	}

	$intent = stripe_post(
		'payment_intents',
		array(
			'amount'                             => $pence,
			'currency'                           => 'gbp',
			'automatic_payment_methods[enabled]' => 'true',
			'metadata[booking_id]'               => (string) $booking_id,
			'metadata[kind]'                     => 'deposit',
			'metadata[site]'                     => home_url(),
		)
	);
	if ( is_wp_error( $intent ) ) {
		return $intent;
	}

	update_post_meta( $booking_id, 'dk_deposit_pi', sanitize_text_field( (string) ( $intent['id'] ?? '' ) ) );

	return rest_ensure_response(
		array(
			'clientSecret'   => (string) ( $intent['client_secret'] ?? '' ),
			'publishableKey' => \DineKit\Integrations\active_publishable(),
			'amount'         => $pence,
		)
	);
}

/**
 * POST /payments/intent — start a PaymentIntent for an existing online order.
 * The amount is recomputed from the stored order total server-side (never
 * trusted from the client).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_order_intent( $request ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$order_id = absint( $request->get_param( 'order' ) );
	if ( ! $order_id || 'dk_order' !== get_post_type( $order_id ) ) {
		return new \WP_Error( 'dinekit_pay_order', __( 'Order not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$total = (float) get_post_meta( $order_id, 'dk_order_total', true );
	$pence = (int) round( $total * 100 );
	if ( $pence < 1 ) {
		return new \WP_Error( 'dinekit_pay_amount', __( 'This order has no payable total.', 'dinekit' ), array( 'status' => 400 ) );
	}

	// Receive-and-hold: authorize only (hold the card) and capture when the
	// restaurant accepts. Auto-accept: charge immediately.
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	$hold   = empty( \DineKit\Ordering\get_settings()['auto_accept'] );
	$params = array(
		'amount'                             => $pence,
		'currency'                           => 'gbp',
		'automatic_payment_methods[enabled]' => 'true',
		'metadata[order_id]'                 => (string) $order_id,
		'metadata[site]'                     => home_url(),
	);
	if ( $hold ) {
		$params['capture_method'] = 'manual';
	}

	$intent = stripe_post( 'payment_intents', $params );
	if ( is_wp_error( $intent ) ) {
		return $intent;
	}

	update_post_meta( $order_id, 'dk_order_pi', sanitize_text_field( (string) ( $intent['id'] ?? '' ) ) );

	return rest_ensure_response(
		array(
			'clientSecret'   => (string) ( $intent['client_secret'] ?? '' ),
			'publishableKey' => \DineKit\Integrations\active_publishable(),
			'amount'         => $pence,
			'hold'           => $hold,
		)
	);
}

/**
 * Verify a Stripe webhook signature (t=…,v1=… scheme, HMAC-SHA256 over "t.payload").
 *
 * @param string $payload    Raw request body.
 * @param string $sig_header The Stripe-Signature header.
 * @param string $secret     The endpoint signing secret (whsec_…).
 * @return bool
 */
function verify_signature( $payload, $sig_header, $secret ) {
	if ( '' === $secret || '' === $sig_header ) {
		return false;
	}
	$ts = '';
	$v1 = '';
	foreach ( explode( ',', $sig_header ) as $part ) {
		$kv = explode( '=', trim( $part ), 2 );
		if ( 2 !== count( $kv ) ) {
			continue;
		}
		if ( 't' === $kv[0] ) {
			$ts = $kv[1];
		} elseif ( 'v1' === $kv[0] ) {
			$v1 = $kv[1];
		}
	}
	if ( '' === $ts || '' === $v1 ) {
		return false;
	}
	$expected = hash_hmac( 'sha256', $ts . '.' . $payload, $secret );
	return hash_equals( $expected, $v1 );
}

/**
 * POST /stripe-webhook — fulfil on payment_intent.succeeded. Idempotent.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function handle_webhook( $request ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$payload = $request->get_body();
	$sig     = (string) $request->get_header( 'stripe_signature' );
	$secret  = \DineKit\Integrations\active_webhook_secret();

	if ( ! verify_signature( $payload, $sig, $secret ) ) {
		return new \WP_Error( 'dinekit_wh_sig', __( 'Invalid signature.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$event = json_decode( $payload, true );
	$id    = isset( $event['id'] ) ? sanitize_text_field( (string) $event['id'] ) : '';
	$type  = isset( $event['type'] ) ? (string) $event['type'] : '';

	// Idempotency — never process the same event twice.
	$processed = (array) get_option( 'dinekit_stripe_events', array() );
	if ( '' !== $id && isset( $processed[ $id ] ) ) {
		return rest_ensure_response(
			array(
				'ok'  => true,
				'dup' => true,
			)
		);
	}

	$meta       = isset( $event['data']['object']['metadata'] ) && is_array( $event['data']['object']['metadata'] ) ? $event['data']['object']['metadata'] : array();
	$order_id   = isset( $meta['order_id'] ) ? absint( $meta['order_id'] ) : 0;
	$booking_id = isset( $meta['booking_id'] ) ? absint( $meta['booking_id'] ) : 0;

	// A held (manual-capture) card fires amount_capturable_updated on authorize,
	// before it's captured — reflect that as "authorized" so the board shows it.
	if ( 'payment_intent.amount_capturable_updated' === $type && $order_id && 'dk_order' === get_post_type( $order_id ) ) {
		if ( 'paid' !== (string) get_post_meta( $order_id, 'dk_order_payment', true ) ) {
			update_post_meta( $order_id, 'dk_order_payment', 'authorized' );
		}
	}

	if ( 'payment_intent.succeeded' === $type ) {
		if ( $order_id && 'dk_order' === get_post_type( $order_id ) ) {
			update_post_meta( $order_id, 'dk_order_payment', 'paid' );
		}
		if ( $booking_id && 'dk_booking' === get_post_type( $booking_id ) ) {
			update_post_meta( $booking_id, 'dk_deposit_paid', 1 );
			// A paid deposit secures the table — promote a pending request to confirmed.
			if ( 'pending' === (string) get_post_meta( $booking_id, 'dk_status', true ) ) {
				update_post_meta( $booking_id, 'dk_status', 'confirmed' );
			}
		}
	}

	if ( '' !== $id ) {
		$processed[ $id ] = time();
		if ( count( $processed ) > 500 ) {
			$processed = array_slice( $processed, -500, null, true );
		}
		update_option( 'dinekit_stripe_events', $processed, false );
	}

	return rest_ensure_response( array( 'ok' => true ) );
}
