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
delete_option( 'dinekit_onboarded' );

// Remove per-item meta is handled by wp_delete_post below.

// Delete all menu items.
$dinekit_items = get_posts(
	array(
		'post_type'     => 'dk_menu_item',
		'post_status'   => 'any',
		'numberposts'   => -1,
		'fields'        => 'ids',
		'no_found_rows' => true,
	)
);
foreach ( $dinekit_items as $dinekit_item_id ) {
	wp_delete_post( $dinekit_item_id, true );
}

// Delete all terms in DineKit taxonomies. The plugin is not loaded during
// uninstall, so register each taxonomy barebones first or get_terms() errors.
foreach ( array( 'dk_menu', 'dk_section', 'dk_dietary', 'dk_allergen' ) as $dinekit_tax ) {
	if ( ! taxonomy_exists( $dinekit_tax ) ) {
		register_taxonomy( $dinekit_tax, 'dk_menu_item' );
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
