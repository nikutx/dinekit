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
		'accent'           => '',       // '' = use the template's accent; a hex overrides it.
		'currency'         => '£',
		'currencyPosition' => 'before', // before | after.
		'businessType'     => 'both',   // dinein | takeaway | both — gates features.
		// Menu look. `template` picks the flavour (see templates()); the colours
		// below are OPTIONAL overrides — empty means "use the template's".
		'template'         => 'maison', // One of the flavours from templates().
		'menu_ink'         => '',       // Body text.
		'menu_muted'       => '',       // Secondary text.
		'menu_line'        => '',       // Borders/rules.
		'menu_bg'          => '',       // Menu background.
		'menu_radius'      => 12,       // Corner radius, px.
	);
}

/**
 * Valid menu templates.
 *
 * @return string[]
 */
function templates() {
	return array( 'maison', 'counter', 'noir', 'bistro', 'fresh', 'mono' );
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
	$accent = ( '' !== $accent_override && preg_match( '/^#[0-9a-fA-F]{6}$/', $accent_override ) ) ? $accent_override : (string) $s['accent'];
	// Radius is structural (always applies); colours are emitted only when the
	// venue overrides them, so the chosen template's palette shows through.
	$vars     = array( '--dinekit-radius' => (int) $s['menu_radius'] . 'px' );
	$optional = array(
		'--dinekit-accent' => $accent,
		'--dinekit-ink'    => (string) $s['menu_ink'],
		'--dinekit-muted'  => (string) $s['menu_muted'],
		'--dinekit-line'   => (string) $s['menu_line'],
		'--dinekit-bg'     => (string) $s['menu_bg'],
	);
	foreach ( $optional as $name => $value ) {
		if ( '' !== $value ) {
			$vars[ $name ] = $value;
		}
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

	// Accent: a hex sets an override, empty string clears it (back to template).
	if ( isset( $input['accent'] ) ) {
		$a               = trim( (string) $input['accent'] );
		$clean['accent'] = ( '' === $a || preg_match( '/^#[0-9a-fA-F]{6}$/', $a ) ) ? strtolower( $a ) : $clean['accent'];
	}
	if ( isset( $input['template'] ) && in_array( (string) $input['template'], templates(), true ) ) {
		$clean['template'] = (string) $input['template'];
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

	// Menu colour overrides (#rrggbb, or empty to fall back to the template).
	foreach ( array( 'menu_ink', 'menu_muted', 'menu_line' ) as $key ) {
		if ( isset( $input[ $key ] ) ) {
			$v             = trim( (string) $input[ $key ] );
			$clean[ $key ] = ( '' === $v || preg_match( '/^#[0-9a-fA-F]{6}$/', $v ) ) ? strtolower( $v ) : $clean[ $key ];
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
