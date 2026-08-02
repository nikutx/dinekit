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
		'venue_type'       => 'restaurant', // What kind of venue — drives the schema.org type (see venue_types()).
		// Localisation + the restaurant's own address (feeds LocalBusiness schema
		// and drives region-aware address labels). Country is ISO 3166-1 alpha-2.
		'country'          => '',
		'addr_street'      => '',
		'addr_city'        => '',
		'addr_postcode'    => '',
		'addr_region'      => '',
		// Menu look. `template` picks the flavour (see templates()); the colours
		// below are OPTIONAL overrides — empty means "use the template's".
		'template'         => 'signature', // One of the flavours from templates().
		'menu_ink'         => '',       // Body text.
		'menu_muted'       => '',       // Secondary text.
		'menu_line'        => '',       // Borders/rules.
		'menu_bg'          => '',       // Menu background.
		'menu_radius'      => 12,       // Corner radius, px.
		'menu_scale'       => 1.0,      // Text-size multiplier (0.85–1.3); scales the whole menu.
		// Per-element size multipliers (0.7–1.6) — set from the Design Studio by
		// clicking an element in the preview. 1 = the template's own size.
		'menu_size_title'  => 1.0,      // Section titles.
		'menu_size_name'   => 1.0,      // Dish names.
		'menu_size_desc'   => 1.0,      // Dish descriptions.
		'menu_size_price'  => 1.0,      // Prices.
	);
}

/**
 * Valid menu templates.
 *
 * @return string[]
 */
function templates() {
	return array( 'signature', 'maison', 'counter', 'noir', 'bistro', 'fresh', 'mono' );
}

/**
 * Venue types → their schema.org FoodEstablishment subtype. Google treats the
 * specific subtype better than a generic LocalBusiness in local search.
 *
 * @return array<string,string>
 */
function venue_types() {
	return array(
		'restaurant' => 'Restaurant',
		'cafe'       => 'CafeOrCoffeeShop',
		'pub'        => 'BarOrPub',
		'fast_food'  => 'FastFoodRestaurant',
		'bakery'     => 'Bakery',
		'ice_cream'  => 'IceCreamShop',
		'brewery'    => 'Brewery',
		'winery'     => 'Winery',
		'other'      => 'FoodEstablishment',
	);
}

/**
 * The schema.org type for the saved venue type.
 *
 * @return string
 */
function venue_schema_type() {
	$types = venue_types();
	$key   = (string) get()['venue_type'];
	return isset( $types[ $key ] ) ? $types[ $key ] : 'Restaurant';
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
	$vars     = array(
		'--dinekit-radius' => (int) $s['menu_radius'] . 'px',
		'--dinekit-scale'  => rtrim( rtrim( number_format( (float) $s['menu_scale'], 3, '.', '' ), '0' ), '.' ),
	);
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
	// Per-element size multipliers — only when the venue moved them off 1.
	foreach ( array( 'title', 'name', 'desc', 'price' ) as $role ) {
		$mult = (float) $s[ 'menu_size_' . $role ];
		if ( abs( $mult - 1.0 ) > 0.001 ) {
			$vars[ '--dinekit-size-' . $role ] = rtrim( rtrim( number_format( $mult, 3, '.', '' ), '0' ), '.' );
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
 * Design tokens for the online-ordering page, so it carries the venue's brand
 * (accent + corner radius) from Design & Preview. The page keeps its own
 * neutral chrome for readability; hover/tint shades derive in CSS.
 * Filterable: add_filter( 'dinekit_order_style_vars', … ).
 *
 * @return string style attribute value (no quotes), may be ''.
 */
function order_style_vars() {
	$s      = get();
	$accent = (string) $s['accent'];
	if ( '' === $accent ) {
		// No explicit brand colour set — fall back to the chosen menu
		// template's accent so both pages always match out of the box.
		$template_accents = array(
			'signature' => '#c14f24',
			'maison'    => '#7c2d3a',
			'counter'   => '#4f46e5',
			'noir'      => '#c9a26a',
			'bistro'    => '#2f5d4c',
			'fresh'     => '#0d9488',
			'mono'      => '#111111',
		);
		$template         = (string) $s['template'];
		$accent           = isset( $template_accents[ $template ] ) ? $template_accents[ $template ] : '';
	}
	$vars = array(
		'--dko-radius' => min( 20, (int) $s['menu_radius'] ) . 'px',
	);
	if ( '' !== $accent ) {
		$vars['--dko-accent'] = $accent;
	}
	/**
	 * Filter the ordering page's CSS custom properties (design tokens).
	 *
	 * @param array<string,string> $vars Map of custom property => value.
	 */
	$vars = (array) apply_filters( 'dinekit_order_style_vars', $vars );

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
	if ( isset( $input['venue_type'] ) && array_key_exists( (string) $input['venue_type'], venue_types() ) ) {
		$clean['venue_type'] = (string) $input['venue_type'];
	}

	// Country (validated against the known list) + the restaurant's address.
	if ( isset( $input['country'] ) ) {
		require_once DINEKIT_DIR . 'includes/localisation.php';
		$code             = strtoupper( sanitize_text_field( (string) $input['country'] ) );
		$clean['country'] = array_key_exists( $code, \DineKit\L10n\countries() ) ? $code : '';
	}
	foreach ( array( 'addr_street', 'addr_city', 'addr_postcode', 'addr_region' ) as $field ) {
		if ( isset( $input[ $field ] ) ) {
			$clean[ $field ] = sanitize_text_field( (string) $input[ $field ] );
		}
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
	if ( isset( $input['menu_scale'] ) ) {
		$clean['menu_scale'] = max( 0.85, min( 1.3, (float) $input['menu_scale'] ) );
	}
	foreach ( array( 'menu_size_title', 'menu_size_name', 'menu_size_desc', 'menu_size_price' ) as $size_key ) {
		if ( isset( $input[ $size_key ] ) ) {
			$clean[ $size_key ] = max( 0.7, min( 1.6, (float) $input[ $size_key ] ) );
		}
	}

	update_option( OPTION, $clean );
	return $clean;
}
