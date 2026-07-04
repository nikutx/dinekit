<?php
/**
 * Reviews & retention — settings for post-visit review requests and win-back.
 *
 * Compliance is baked in: DineKit asks EVERY diner the same way and shows the
 * SAME public-review link to everyone. "Review gating" (sending only happy
 * diners to public sites, or diverting unhappy ones to a private form instead)
 * is unlawful in the UK (DMCC Act / CMA), against Google policy and caught by
 * the US FTC — so it is deliberately impossible here. Private feedback runs in
 * parallel for everyone, never as a filter, and incentives never touch the
 * public-review path.
 *
 * Data lives in the `dinekit_reviews` option — portable, no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Reviews;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_reviews';

/**
 * Boot the module.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Manage permission.
 *
 * @return bool
 */
function can_manage() {
	return current_user_can( 'manage_options' );
}

/**
 * Default settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'enabled'         => false,
		'delay_hours'     => 3,     // Send this long after the visit (used by the scheduler, later).
		'google_url'      => '',    // Google "write a review" deep link (g.page/r/…).
		'tripadvisor_url' => '',   // Optional second public destination.
		'message'         => __( 'Thanks for dining with us — we’d love to hear how it went.', 'dinekit' ),
		'jog_memory'      => true,  // Remind the diner what they ordered.
		'offer'           => '',    // Win-back incentive text (e.g. "10% off your next visit").
		'low_threshold'   => 3,     // Private ratings at or below this alert the manager.
		'notify_email'    => '',    // Manager alert recipient (empty = site admin).
		'consent_note'    => __( 'We may email you once about your visit to ask for feedback. Unsubscribe any time.', 'dinekit' ),
	);
}

/**
 * Get the stored settings merged over defaults.
 *
 * @return array<string,mixed>
 */
function get() {
	$stored = get_option( OPTION );
	return is_array( $stored ) ? wp_parse_args( $stored, defaults() ) : defaults();
}

/**
 * Sanitize + save settings.
 *
 * @param array<string,mixed> $input Raw input.
 * @return array<string,mixed> The saved settings.
 */
function save( $input ) {
	$current = get();

	$current['enabled']    = ! empty( $input['enabled'] );
	$current['jog_memory'] = ! empty( $input['jog_memory'] );

	if ( isset( $input['delay_hours'] ) ) {
		$current['delay_hours'] = max( 0, min( 168, absint( $input['delay_hours'] ) ) );
	}
	if ( isset( $input['low_threshold'] ) ) {
		$current['low_threshold'] = max( 1, min( 5, absint( $input['low_threshold'] ) ) );
	}
	foreach ( array( 'google_url', 'tripadvisor_url' ) as $key ) {
		if ( isset( $input[ $key ] ) ) {
			$current[ $key ] = esc_url_raw( trim( (string) $input[ $key ] ) );
		}
	}
	if ( isset( $input['notify_email'] ) ) {
		$email                   = sanitize_email( (string) $input['notify_email'] );
		$current['notify_email'] = is_email( $email ) ? $email : '';
	}
	foreach ( array( 'message', 'offer', 'consent_note' ) as $key ) {
		if ( isset( $input[ $key ] ) ) {
			$current[ $key ] = sanitize_textarea_field( (string) $input[ $key ] );
		}
	}

	update_option( OPTION, $current );
	return $current;
}

/**
 * Register REST routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';
	register_rest_route(
		$ns,
		'/reviews',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_get',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\rest_save',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);
}

/**
 * GET /reviews.
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	return rest_ensure_response( get() );
}

/**
 * POST /reviews.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_save( $request ) {
	return rest_ensure_response( save( (array) $request->get_json_params() ) );
}
