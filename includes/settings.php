<?php
/**
 * Plugin settings: brand colour, currency and menu defaults. Stored in the
 * `dinekit_settings` option (portable, no tables).
 *
 * @package DineKit
 */

namespace DineKit\Settings;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_settings';

/**
 * Default settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'accent'           => '#b91c1c',
		'currency'         => '£',
		'currencyPosition' => 'before', // before | after.
		'businessType'     => 'both',   // dinein | takeaway | both — gates features.
	);
}

/**
 * Get settings (merged over defaults).
 *
 * @return array<string,mixed>
 */
function get() {
	$stored = get_option( OPTION );
	if ( ! is_array( $stored ) ) {
		return defaults();
	}
	return wp_parse_args( $stored, defaults() );
}

/**
 * Sanitize + save settings.
 *
 * @param array<string,mixed> $input Raw settings.
 * @return array<string,mixed> Saved settings.
 */
function save( $input ) {
	$clean = defaults();

	if ( isset( $input['accent'] ) && preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $input['accent'] ) ) {
		$clean['accent'] = strtolower( (string) $input['accent'] );
	}
	if ( isset( $input['currency'] ) ) {
		$clean['currency'] = substr( sanitize_text_field( (string) $input['currency'] ), 0, 8 );
	}
	if ( isset( $input['currencyPosition'] ) && in_array( $input['currencyPosition'], array( 'before', 'after' ), true ) ) {
		$clean['currencyPosition'] = (string) $input['currencyPosition'];
	}
	if ( isset( $input['businessType'] ) && in_array( $input['businessType'], array( 'dinein', 'takeaway', 'both' ), true ) ) {
		$clean['businessType'] = (string) $input['businessType'];
	}

	update_option( OPTION, $clean );
	return $clean;
}
