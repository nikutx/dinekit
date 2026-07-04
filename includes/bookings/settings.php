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
		'online_enabled'  => true,
		'auto_confirm'    => false, // false = requests (pending); true = instant confirm.
		'allow_waitlist'  => true,  // Offer a waitlist / penciled-in slot when full.
		'min_party'       => 1,
		'max_party'       => 8,
		'min_notice'      => 2,     // Hours of lead time required.
		'max_days_ahead'  => 90,
		'slot_interval'   => 30,    // Minutes between selectable times.
		'open_time'       => '12:00',
		'close_time'      => '22:00',
		'turn_time'       => 120,   // Minutes a table is held per sitting.
		'buffer'          => 0,     // Minutes between sittings on the same table.
		'deposit_over'    => 0,     // Party >= this needs a deposit (0 = off).
		'deposit_amount'  => 0,     // Per guest; display only until Stripe (B10).
		'covers_per_hour' => 0,    // Max covers booked within a clock-hour (0 = unlimited).
		'intro'           => '',    // Optional blurb shown above the form.
		'emails_enabled'  => true,  // Send diner + staff notification emails.
		'notify_email'    => '',    // Staff recipient (empty = site admin email).
		// Widget appearance — emitted as CSS custom properties on the public form.
		'widget_accent'   => '#4f46e5', // Brand accent (buttons, focus, links).
		'widget_radius'   => 16,        // Card corner radius, px.
		'widget_style'    => 'light',   // light | dark.
		'widget_font'     => 'system',  // system | inherit (use the theme's font).
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

	$bools = array( 'online_enabled', 'auto_confirm', 'emails_enabled', 'allow_waitlist' );
	foreach ( $bools as $key ) {
		if ( isset( $data[ $key ] ) ) {
			$current[ $key ] = (bool) $data[ $key ];
		}
	}

	if ( isset( $data['notify_email'] ) ) {
		$email                   = sanitize_email( (string) $data['notify_email'] );
		$current['notify_email'] = is_email( $email ) ? $email : '';
	}

	$ints = array(
		'min_party'       => array( 1, 50 ),
		'max_party'       => array( 1, 100 ),
		'min_notice'      => array( 0, 720 ),
		'max_days_ahead'  => array( 1, 730 ),
		'slot_interval'   => array( 15, 240 ),
		'turn_time'       => array( 15, 480 ),
		'buffer'          => array( 0, 120 ),
		'deposit_over'    => array( 0, 100 ),
		'deposit_amount'  => array( 0, 100000 ),
		'covers_per_hour' => array( 0, 1000 ),
		'widget_radius'   => array( 0, 32 ),
	);
	foreach ( $ints as $key => $range ) {
		if ( isset( $data[ $key ] ) ) {
			$current[ $key ] = max( $range[0], min( $range[1], absint( $data[ $key ] ) ) );
		}
	}
	// A party floor above the ceiling would make every request invalid.
	if ( $current['min_party'] > $current['max_party'] ) {
		$current['min_party'] = $current['max_party'];
	}

	if ( isset( $data['widget_accent'] ) ) {
		$hex = sanitize_hex_color( (string) $data['widget_accent'] );
		if ( $hex ) {
			$current['widget_accent'] = $hex;
		}
	}
	if ( isset( $data['widget_style'] ) && in_array( (string) $data['widget_style'], array( 'light', 'dark' ), true ) ) {
		$current['widget_style'] = (string) $data['widget_style'];
	}
	if ( isset( $data['widget_font'] ) && in_array( (string) $data['widget_font'], array( 'system', 'inherit' ), true ) ) {
		$current['widget_font'] = (string) $data['widget_font'];
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
		'allowWaitlist' => (bool) $s['allow_waitlist'],
		'minParty'      => (int) $s['min_party'],
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
 * Darken a #rrggbb color by a factor (0–1) — used for the widget's hover shade.
 *
 * @param string $hex    Color.
 * @param float  $factor Amount to darken (0.15 = 15%).
 * @return string
 */
function darken( $hex, $factor = 0.15 ) {
	$hex = ltrim( (string) $hex, '#' );
	if ( 3 === strlen( $hex ) ) {
		$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
	}
	if ( 6 !== strlen( $hex ) ) {
		return '#4338ca';
	}
	$out = '#';
	foreach ( str_split( $hex, 2 ) as $part ) {
		$out .= str_pad( dechex( (int) round( hexdec( $part ) * ( 1 - $factor ) ) ), 2, '0', STR_PAD_LEFT );
	}
	return $out;
}

/**
 * "r, g, b" channels of a #rrggbb color — used to build the focus-ring rgba().
 *
 * @param string $hex Color.
 * @return string
 */
function rgb_channels( $hex ) {
	$hex = ltrim( (string) $hex, '#' );
	if ( 3 === strlen( $hex ) ) {
		$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
	}
	if ( 6 !== strlen( $hex ) ) {
		return '79, 70, 229';
	}
	$parts = array_map( 'hexdec', str_split( $hex, 2 ) );
	return implode( ', ', $parts );
}

/**
 * Inline CSS custom-property overrides for the widget root, from the branding
 * settings. Returns '' when everything is still at its default.
 *
 * @return string style attribute value (no quotes).
 */
function widget_style_vars() {
	$s    = get();
	$vars = array(
		'--dkb-accent'      => (string) $s['widget_accent'],
		'--dkb-accent-dark' => darken( (string) $s['widget_accent'] ),
		'--dkb-accent-rgb'  => rgb_channels( (string) $s['widget_accent'] ),
		'--dkb-radius'      => (int) $s['widget_radius'] . 'px',
	);
	if ( 'inherit' === $s['widget_font'] ) {
		$vars['--dkb-font'] = 'inherit';
	}
	$css = '';
	foreach ( $vars as $name => $value ) {
		$css .= $name . ':' . $value . ';';
	}
	return $css;
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
