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
			'enabled'         => false,
			'mode'            => 'test', // test | live.
			'test_publishable' => '',
			'test_secret'     => '',
			'live_publishable' => '',
			'live_secret'     => '',
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
	$defaults          = defaults();
	$stored['stripe']  = array_merge( $defaults['stripe'], isset( $stored['stripe'] ) && is_array( $stored['stripe'] ) ? $stored['stripe'] : array() );
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
			'enabled'          => (bool) $s['enabled'],
			'mode'             => 'live' === $s['mode'] ? 'live' : 'test',
			'testPublishable'  => (string) $s['test_publishable'],
			'livePublishable'  => (string) $s['live_publishable'],
			'testSecretSet'    => '' !== (string) $s['test_secret'],
			'liveSecretSet'    => '' !== (string) $s['live_secret'],
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
	foreach ( array( 'testPublishable' => 'test_publishable', 'livePublishable' => 'live_publishable' ) as $param => $key ) {
		if ( isset( $in[ $param ] ) ) {
			$strip[ $key ] = sanitize_text_field( (string) $in[ $param ] );
		}
	}
	foreach ( array( 'testSecret' => 'test_secret', 'liveSecret' => 'live_secret' ) as $param => $key ) {
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
	$s   = raw()['stripe'];
	$pk  = 'live' === $s['mode'] ? $s['live_publishable'] : $s['test_publishable'];
	$sk  = 'live' === $s['mode'] ? $s['live_secret'] : $s['test_secret'];
	return $s['enabled'] && '' !== $pk && '' !== $sk;
}
