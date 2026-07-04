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
		// Menu appearance — emitted as --dinekit-* custom properties (see render).
		'menu_ink'         => '#1f2937', // Body text.
		'menu_muted'       => '#6b7280', // Secondary text.
		'menu_line'        => '#e5e7eb', // Borders/rules.
		'menu_bg'          => '',        // Menu background ('' = transparent).
		'menu_radius'      => 12,        // Corner radius, px.
	);
}

/**
 * Front-end menu CSS custom-property declarations, from the saved colours.
 * Filterable so developers can override any token: add_filter( 'dinekit_menu_style_vars', … ).
 *
 * @param string $accent_override Optional per-shortcode accent (#rrggbb) or ''.
 * @return string style attribute value (no quotes), may be ''.
 */
function menu_style_vars( $accent_override = '' ) {
	$s      = get();
	$accent = ( '' !== $accent_override && preg_match( '/^#[0-9a-fA-F]{6}$/', $accent_override ) ) ? $accent_override : $s['accent'];
	$vars   = array(
		'--dinekit-accent' => $accent,
		'--dinekit-ink'    => $s['menu_ink'],
		'--dinekit-muted'  => $s['menu_muted'],
		'--dinekit-line'   => $s['menu_line'],
		'--dinekit-radius' => (int) $s['menu_radius'] . 'px',
	);
	if ( '' !== (string) $s['menu_bg'] ) {
		$vars['--dinekit-bg'] = (string) $s['menu_bg'];
	}
	/**
	 * Filter the menu's CSS custom properties (design tokens).
	 *
	 * @param array<string,string> $vars Map of custom property => value.
	 */
	$vars = (array) apply_filters( 'dinekit_menu_style_vars', $vars );

	$css = '';
	foreach ( $vars as $name => $value ) {
		$css .= sanitize_key( ltrim( $name, '-' ) ) ? $name . ':' . $value . ';' : '';
	}
	return $css;
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

	// Menu appearance colours (#rrggbb) + radius.
	foreach ( array( 'menu_ink', 'menu_muted', 'menu_line' ) as $key ) {
		if ( isset( $input[ $key ] ) && preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $input[ $key ] ) ) {
			$clean[ $key ] = strtolower( (string) $input[ $key ] );
		}
	}
	if ( isset( $input['menu_bg'] ) ) {
		$bg               = trim( (string) $input['menu_bg'] );
		$clean['menu_bg'] = ( '' === $bg || preg_match( '/^#[0-9a-fA-F]{6}$/', $bg ) ) ? strtolower( $bg ) : $clean['menu_bg'];
	}
	if ( isset( $input['menu_radius'] ) ) {
		$clean['menu_radius'] = max( 0, min( 40, absint( $input['menu_radius'] ) ) );
	}

	update_option( OPTION, $clean );
	return $clean;
}
