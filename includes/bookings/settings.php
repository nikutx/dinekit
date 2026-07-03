<?php
/**
 * Booking settings — the rules that drive the public booking widget
 * (max party, notice, slot times, deposit trigger, confirm mode).
 *
 * @package DineKit
 */

namespace DineKit\Bookings\Settings;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_booking_settings';

/**
 * Default booking settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'online_enabled' => true,
		'auto_confirm'   => false, // false = requests (pending); true = instant confirm.
		'max_party'      => 8,
		'min_notice'     => 2,     // Hours of lead time required.
		'max_days_ahead' => 90,
		'slot_interval'  => 30,    // Minutes between selectable times.
		'open_time'      => '12:00',
		'close_time'     => '22:00',
		'deposit_over'   => 0,     // Party >= this needs a deposit (0 = off).
		'deposit_amount' => 0,     // Per guest; display only until Stripe (B10).
		'intro'          => '',    // Optional blurb shown above the form.
		'emails_enabled' => true,  // Send diner + staff notification emails.
		'notify_email'   => '',    // Staff recipient (empty = site admin email).
	);
}

/**
 * Get merged settings.
 *
 * @return array<string,mixed>
 */
function get() {
	$stored = get_option( OPTION, array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}
	return array_merge( defaults(), $stored );
}

/**
 * Save settings (sanitized).
 *
 * @param array<string,mixed> $data Incoming.
 * @return array<string,mixed>
 */
function save( $data ) {
	$current = get();

	$bools = array( 'online_enabled', 'auto_confirm', 'emails_enabled' );
	foreach ( $bools as $key ) {
		if ( isset( $data[ $key ] ) ) {
			$current[ $key ] = (bool) $data[ $key ];
		}
	}

	if ( isset( $data['notify_email'] ) ) {
		$email = sanitize_email( (string) $data['notify_email'] );
		$current['notify_email'] = is_email( $email ) ? $email : '';
	}

	$ints = array(
		'max_party'      => array( 1, 100 ),
		'min_notice'     => array( 0, 720 ),
		'max_days_ahead' => array( 1, 730 ),
		'slot_interval'  => array( 15, 240 ),
		'deposit_over'   => array( 0, 100 ),
		'deposit_amount' => array( 0, 100000 ),
	);
	foreach ( $ints as $key => $range ) {
		if ( isset( $data[ $key ] ) ) {
			$current[ $key ] = max( $range[0], min( $range[1], absint( $data[ $key ] ) ) );
		}
	}

	foreach ( array( 'open_time', 'close_time' ) as $key ) {
		if ( isset( $data[ $key ] ) && preg_match( '/^\d{1,2}:\d{2}$/', (string) $data[ $key ] ) ) {
			$current[ $key ] = (string) $data[ $key ];
		}
	}
	if ( isset( $data['intro'] ) ) {
		$current['intro'] = sanitize_text_field( (string) $data['intro'] );
	}

	update_option( OPTION, $current );
	return $current;
}

/**
 * Currency symbol from the plugin's general settings (fallback £).
 *
 * @return string
 */
function currency() {
	if ( is_readable( DINEKIT_DIR . 'includes/settings.php' ) ) {
		require_once DINEKIT_DIR . 'includes/settings.php';
		if ( function_exists( '\\DineKit\\Settings\\get' ) ) {
			$s = \DineKit\Settings\get();
			if ( ! empty( $s['currency'] ) ) {
				return (string) $s['currency'];
			}
		}
	}
	return '£';
}

/**
 * The subset of settings safe to expose to the public booking widget.
 *
 * @return array<string,mixed>
 */
function public_config() {
	$s = get();
	return array(
		'onlineEnabled' => (bool) $s['online_enabled'],
		'autoConfirm'   => (bool) $s['auto_confirm'],
		'maxParty'      => (int) $s['max_party'],
		'minNotice'     => (int) $s['min_notice'],
		'maxDaysAhead'  => (int) $s['max_days_ahead'],
		'slotInterval'  => (int) $s['slot_interval'],
		'openTime'      => (string) $s['open_time'],
		'closeTime'     => (string) $s['close_time'],
		'depositOver'   => (int) $s['deposit_over'],
		'depositAmount' => (int) $s['deposit_amount'],
		'currency'      => currency(),
	);
}

/**
 * Whether a party of the given size needs a deposit.
 *
 * @param int $party Party size.
 * @return bool
 */
function needs_deposit( $party ) {
	$s = get();
	return $s['deposit_over'] > 0 && (int) $party >= (int) $s['deposit_over'];
}
