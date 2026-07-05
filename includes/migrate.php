<?php
/**
 * One-time data migration: rename the legacy `dk_` prefix to `dinekit_` on
 * existing installs. wp.org requires prefixes of 4+ characters, so the post
 * types, taxonomies and meta keys were renamed in the code; this migrates the
 * data already stored under the old names so nothing is lost on upgrade.
 *
 * Runs once, gated by an option flag. Fresh installs have no `dk_` data, so it
 * is a no-op there (it just sets the flag). Direct DB writes are required for a
 * bulk rename of post_type / taxonomy / meta_key columns — there is no WP API
 * for it — and are scoped to this plugin's own rows.
 *
 * @package DineKit
 */

namespace DineKit\Migrate;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const FLAG = 'dinekit_prefix_migrated';

/**
 * Run the prefix migration exactly once.
 *
 * @return void
 */
function maybe_run() {
	if ( get_option( FLAG ) ) {
		return;
	}
	run();
	update_option( FLAG, 1 );
}

/**
 * Rename every `dk_*` post type, taxonomy and meta key to `dinekit_*`.
 * Idempotent: re-running finds nothing left to change.
 *
 * @return void
 */
function run() {
	global $wpdb;

	// 1. Post types (dk_menu_item → dinekit_menu_item, etc.).
	$types = array( 'menu_item', 'table', 'booking', 'table_combo', 'event', 'guest', 'order', 'staff', 'shift', 'leave' );
	foreach ( $types as $t ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- One-time bulk column rename; no WP API exists.
		$wpdb->update( $wpdb->posts, array( 'post_type' => 'dinekit_' . $t ), array( 'post_type' => 'dk_' . $t ) );
	}

	// 2. Taxonomies (dk_menu → dinekit_menu, etc.). Term relationships key on
	// term_taxonomy_id, which is unchanged, so object assignments are preserved.
	$taxes = array( 'menu', 'section', 'dietary', 'allergen', 'area' );
	foreach ( $taxes as $tx ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- One-time bulk column rename; no WP API exists.
		$wpdb->update( $wpdb->term_taxonomy, array( 'taxonomy' => 'dinekit_' . $tx ), array( 'taxonomy' => 'dk_' . $tx ) );
	}

	$dk_like      = $wpdb->esc_like( 'dk_' ) . '%';
	$dinekit_like = $wpdb->esc_like( 'dinekit_' ) . '%';

	// 3. Post meta keys on this plugin's (now-renamed) posts only.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table names interpolated from $wpdb; values are prepared.
	$wpdb->query(
		$wpdb->prepare(
			"UPDATE {$wpdb->postmeta} SET meta_key = CONCAT( 'dinekit_', SUBSTRING( meta_key, 4 ) ) WHERE meta_key LIKE %s AND post_id IN ( SELECT ID FROM {$wpdb->posts} WHERE post_type LIKE %s )",
			$dk_like,
			$dinekit_like
		)
	);

	// 4. Term meta keys on this plugin's (now-renamed) taxonomy terms only.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table names interpolated from $wpdb; values are prepared.
	$wpdb->query(
		$wpdb->prepare(
			"UPDATE {$wpdb->termmeta} SET meta_key = CONCAT( 'dinekit_', SUBSTRING( meta_key, 4 ) ) WHERE meta_key LIKE %s AND term_id IN ( SELECT term_id FROM {$wpdb->term_taxonomy} WHERE taxonomy LIKE %s )",
			$dk_like,
			$dinekit_like
		)
	);

	// Stored data changed underneath the object cache — clear it so nothing
	// serves stale post types / meta.
	wp_cache_flush();
}
