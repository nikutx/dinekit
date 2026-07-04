<?php
/**
 * Integrations — bring-your-own-keys API settings (Stripe today; accounting/CRM
 * later). Keys are stored in a single option, admin-only. Secret keys are NEVER
 * returned to the browser: the client only learns whether a secret is set.
 *
 * @package DineKit
 */

namespace DineKit\Integrations;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_integrations';

/**
 * Default integration settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'stripe' => array(
			'enabled'             => false,
			'mode'                => 'test', // test | live.
			'test_publishable'    => '',
			'test_secret'         => '',
			'live_publishable'    => '',
			'live_secret'         => '',
			'test_webhook_secret' => '',
			'live_webhook_secret' => '',
		),
	);
}

/**
 * Raw stored settings (includes secrets — server-side only, never sent as-is).
 *
 * @return array<string,mixed>
 */
function raw() {
	$stored = get_option( OPTION, array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}
	$defaults         = defaults();
	$stored['stripe'] = array_merge( $defaults['stripe'], isset( $stored['stripe'] ) && is_array( $stored['stripe'] ) ? $stored['stripe'] : array() );
	return $stored;
}

/**
 * Client-safe view of the settings — publishable keys are public, secrets are
 * reduced to a boolean "is it set?".
 *
 * @return array<string,mixed>
 */
function get_public() {
	$raw = raw();
	$s   = $raw['stripe'];
	return array(
		'stripe' => array(
			'enabled'         => (bool) $s['enabled'],
			'mode'            => 'live' === $s['mode'] ? 'live' : 'test',
			'testPublishable' => (string) $s['test_publishable'],
			'livePublishable' => (string) $s['live_publishable'],
			'testSecretSet'   => '' !== (string) $s['test_secret'],
			'liveSecretSet'   => '' !== (string) $s['live_secret'],
			'testWebhookSet'  => '' !== (string) $s['test_webhook_secret'],
			'liveWebhookSet'  => '' !== (string) $s['live_webhook_secret'],
		),
	);
}

/**
 * Save Stripe settings. Publishable keys and the mode/enabled flags are always
 * applied; secret keys are only overwritten when a new non-empty value is sent
 * (so the UI never has to echo an existing secret back). Sending the literal
 * "__clear__" wipes a secret.
 *
 * @param array<string,mixed> $data Incoming settings.
 * @return array<string,mixed> Client-safe settings.
 */
function save( $data ) {
	$raw   = raw();
	$in    = isset( $data['stripe'] ) && is_array( $data['stripe'] ) ? $data['stripe'] : array();
	$strip = $raw['stripe'];

	if ( isset( $in['enabled'] ) ) {
		$strip['enabled'] = (bool) $in['enabled'];
	}
	if ( isset( $in['mode'] ) ) {
		$strip['mode'] = 'live' === $in['mode'] ? 'live' : 'test';
	}
	foreach ( array(
		'testPublishable' => 'test_publishable',
		'livePublishable' => 'live_publishable',
	) as $param => $key ) {
		if ( isset( $in[ $param ] ) ) {
			$strip[ $key ] = sanitize_text_field( (string) $in[ $param ] );
		}
	}
	$secret_map = array(
		'testSecret'        => 'test_secret',
		'liveSecret'        => 'live_secret',
		'testWebhookSecret' => 'test_webhook_secret',
		'liveWebhookSecret' => 'live_webhook_secret',
	);
	foreach ( $secret_map as $param => $key ) {
		if ( ! isset( $in[ $param ] ) ) {
			continue;
		}
		$value = (string) $in[ $param ];
		if ( '__clear__' === $value ) {
			$strip[ $key ] = '';
		} elseif ( '' !== $value ) {
			$strip[ $key ] = sanitize_text_field( $value );
		}
	}

	$raw['stripe'] = $strip;
	update_option( OPTION, $raw );
	return get_public();
}

/**
 * Whether Stripe is configured enough to take payments (used later by B10).
 *
 * @return bool
 */
function stripe_ready() {
	$s  = raw()['stripe'];
	$pk = 'live' === $s['mode'] ? $s['live_publishable'] : $s['test_publishable'];
	$sk = 'live' === $s['mode'] ? $s['live_secret'] : $s['test_secret'];
	return $s['enabled'] && '' !== $pk && '' !== $sk;
}

/**
 * The secret key for the active mode (server-side only).
 *
 * @return string
 */
function active_secret() {
	$s = raw()['stripe'];
	return (string) ( 'live' === $s['mode'] ? $s['live_secret'] : $s['test_secret'] );
}

/**
 * The publishable key for the active mode (safe to send to the browser).
 *
 * @return string
 */
function active_publishable() {
	$s = raw()['stripe'];
	return (string) ( 'live' === $s['mode'] ? $s['live_publishable'] : $s['test_publishable'] );
}

/**
 * The webhook signing secret for the active mode (server-side only).
 *
 * @return string
 */
function active_webhook_secret() {
	$s = raw()['stripe'];
	return (string) ( 'live' === $s['mode'] ? $s['live_webhook_secret'] : $s['test_webhook_secret'] );
}

/**
 * Validate the saved keys against Stripe's API — the "Test connection" action.
 * Uses the merchant's own secret key server-side; the key never reaches the
 * browser. Returns account status so the UI can confirm it's really connected.
 *
 * @return array<string,mixed>
 */
function test_connection() {
	$s    = raw()['stripe'];
	$mode = 'live' === $s['mode'] ? 'live' : 'test';
	$sk   = active_secret();
	if ( '' === $sk ) {
		return array(
			'valid' => false,
			'mode'  => $mode,
			'error' => __( 'Add and save your secret key for this mode first.', 'dinekit' ),
		);
	}

	$res = wp_remote_get(
		'https://api.stripe.com/v1/account',
		array(
			'headers' => array( 'Authorization' => 'Bearer ' . $sk ),
			'timeout' => 15,
		)
	);
	if ( is_wp_error( $res ) ) {
		return array(
			'valid' => false,
			'mode'  => $mode,
			'error' => $res->get_error_message(),
		);
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$body = json_decode( (string) wp_remote_retrieve_body( $res ), true );
	if ( 200 !== $code ) {
		return array(
			'valid' => false,
			'mode'  => $mode,
			'error' => isset( $body['error']['message'] ) ? (string) $body['error']['message'] : __( 'Stripe rejected the key.', 'dinekit' ),
		);
	}

	// The key prefix is the source of truth for live vs test.
	$is_live = ( 0 === strpos( $sk, 'sk_live' ) || 0 === strpos( $sk, 'rk_live' ) );
	$name    = '';
	if ( isset( $body['business_profile']['name'] ) && '' !== (string) $body['business_profile']['name'] ) {
		$name = (string) $body['business_profile']['name'];
	} elseif ( isset( $body['email'] ) ) {
		$name = (string) $body['email'];
	}
	return array(
		'valid'          => true,
		'mode'           => $is_live ? 'live' : 'test',
		'account'        => $name,
		'chargesEnabled' => ! empty( $body['charges_enabled'] ),
		'modeMismatch'   => ( $is_live ? 'live' : 'test' ) !== $mode,
	);
}
