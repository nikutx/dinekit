<?php
/**
 * Guest profiles — persistent per-diner flags (VIP, free-text tags, service
 * notes, allergies) that ride alongside the aggregated Guest CRM. Stored in a
 * single option keyed by the same identity key the CRM uses (email when known,
 * otherwise name), so no custom tables and a clean uninstall.
 *
 * @package DineKit
 */

namespace DineKit\Guests;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_guest_profiles';

/**
 * Identity key for a diner — matches the CRM's aggregation key so a profile
 * follows the guest across every booking/event.
 *
 * @param string $email Email (may be empty).
 * @param string $name  Name (fallback when no email).
 * @return string
 */
function key( $email, $name ) {
	$email = strtolower( trim( (string) $email ) );
	return '' !== $email ? 'e:' . $email : 'n:' . strtolower( trim( (string) $name ) );
}

/**
 * All stored profiles, keyed by identity key.
 *
 * @return array<string,array<string,mixed>>
 */
function all() {
	$stored = get_option( OPTION, array() );
	return is_array( $stored ) ? $stored : array();
}

/**
 * A single normalized profile (empty defaults when unknown).
 *
 * @param string $email Email.
 * @param string $name  Name.
 * @return array<string,mixed>
 */
function get_profile( $email, $name ) {
	$all = all();
	$k   = key( $email, $name );
	$p   = isset( $all[ $k ] ) && is_array( $all[ $k ] ) ? $all[ $k ] : array();
	return array(
		'vip'       => ! empty( $p['vip'] ),
		'tags'      => isset( $p['tags'] ) && is_array( $p['tags'] ) ? array_values( $p['tags'] ) : array(),
		'notes'     => isset( $p['notes'] ) ? (string) $p['notes'] : '',
		'allergens' => isset( $p['allergens'] ) ? (string) $p['allergens'] : '',
	);
}

/**
 * Create/update a profile. An all-empty profile is removed to keep the option
 * lean.
 *
 * @param string              $email Email.
 * @param string              $name  Name.
 * @param array<string,mixed> $data  Raw incoming fields.
 * @return array<string,mixed> The stored (normalized) profile.
 */
function save_profile( $email, $name, $data ) {
	$all = all();
	$k   = key( $email, $name );

	$tags = array();
	foreach ( (array) ( $data['tags'] ?? array() ) as $tag ) {
		$tag = trim( sanitize_text_field( (string) $tag ) );
		if ( '' !== $tag && ! in_array( $tag, $tags, true ) ) {
			$tags[] = $tag;
		}
	}
	$tags = array_slice( $tags, 0, 12 );

	$profile = array(
		'vip'       => ! empty( $data['vip'] ),
		'tags'      => $tags,
		'notes'     => trim( sanitize_textarea_field( (string) ( $data['notes'] ?? '' ) ) ),
		'allergens' => trim( sanitize_text_field( (string) ( $data['allergens'] ?? '' ) ) ),
	);

	$is_empty = ! $profile['vip'] && empty( $profile['tags'] ) && '' === $profile['notes'] && '' === $profile['allergens'];
	if ( $is_empty ) {
		unset( $all[ $k ] );
	} else {
		$all[ $k ] = $profile;
	}
	update_option( OPTION, $all, false );
	return $profile;
}
