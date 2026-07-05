<?php
/**
 * Uninstall handler. Respects the "keep data" option: by default DineKit
 * leaves all menu content in place (uninstalling a plugin should never eat
 * a restaurant's menu). Data is only removed when the user has explicitly
 * opted in via the dinekit_delete_data_on_uninstall option.
 *
 * @package DineKit
 */

// Direct access + context guard.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Always remove plugin bookkeeping options.
delete_option( 'dinekit_version' );
delete_option( 'dinekit_activated_at' );

if ( ! get_option( 'dinekit_delete_data_on_uninstall' ) ) {
	// Keep data (default): leave CPT content, taxonomies and seed flag intact.
	return;
}

// Explicit full cleanup.
delete_option( 'dinekit_dietary_seeded' );
delete_option( 'dinekit_delete_data_on_uninstall' );
delete_option( 'dinekit_hours' );
delete_option( 'dinekit_settings' );
delete_option( 'dinekit_onboarded' );
delete_option( 'dinekit_booking_settings' );
delete_option( 'dinekit_integrations' );
delete_option( 'dinekit_events_page' );
delete_option( 'dinekit_order_settings' );
delete_option( 'dinekit_order_counter' );
delete_option( 'dinekit_guest_profiles' );
delete_option( 'dinekit_secrets_encrypted' );
delete_option( 'dinekit_stripe_events' );
delete_option( 'dinekit_feedback_page' );
delete_option( 'dinekit_reviews' );
delete_option( 'dinekit_staff' );
delete_option( 'dinekit_email' );
delete_option( 'dinekit_prefix_migrated' );
delete_option( 'dinekit_access' );
delete_option( 'dinekit_roles_ready' );

// Remove the custom staff role + the DineKit page capability we granted.
if ( function_exists( 'remove_role' ) ) {
	remove_role( 'dinekit_staff' );
}
foreach ( array( 'administrator', 'editor' ) as $dinekit_role_name ) {
	$dinekit_wp_role = get_role( $dinekit_role_name );
	if ( $dinekit_wp_role ) {
		$dinekit_wp_role->remove_cap( 'dinekit_access' );
	}
}

// Delete all DineKit posts (menu items + bookings/floor + events/guests + orders).
foreach ( array( 'dinekit_menu_item', 'dinekit_table', 'dinekit_booking', 'dinekit_table_combo', 'dinekit_event', 'dinekit_guest', 'dinekit_order' ) as $dinekit_pt ) {
	$dinekit_posts = get_posts(
		array(
			'post_type'     => $dinekit_pt,
			'post_status'   => 'any',
			'numberposts'   => -1,
			'fields'        => 'ids',
			'no_found_rows' => true,
		)
	);
	foreach ( $dinekit_posts as $dinekit_post_id ) {
		wp_delete_post( $dinekit_post_id, true );
	}
}

// Delete all terms in DineKit taxonomies. The plugin is not loaded during
// uninstall, so register each taxonomy barebones first or get_terms() errors.
foreach ( array( 'dinekit_menu', 'dinekit_section', 'dinekit_dietary', 'dinekit_allergen', 'dinekit_area' ) as $dinekit_tax ) {
	if ( ! taxonomy_exists( $dinekit_tax ) ) {
		register_taxonomy( $dinekit_tax, 'dinekit_menu_item' );
	}
	$dinekit_terms = get_terms(
		array(
			'taxonomy'   => $dinekit_tax,
			'hide_empty' => false,
			'fields'     => 'ids',
		)
	);
	if ( is_array( $dinekit_terms ) ) {
		foreach ( $dinekit_terms as $dinekit_term_id ) {
			wp_delete_term( $dinekit_term_id, $dinekit_tax );
		}
	}
}
