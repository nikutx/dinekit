<?php
/**
 * Post type + taxonomy registration and term seeding.
 *
 * @package DineKit
 */

namespace DineKit\PostTypes;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the menu item CPT and its taxonomies.
 *
 * @return void
 */
function register() {
	register_post_type(
		'dk_menu_item',
		array(
			'labels'        => array(
				'name'               => __( 'Menu Items', 'dinekit' ),
				'singular_name'      => __( 'Menu Item', 'dinekit' ),
				'add_new'            => __( 'Add Menu Item', 'dinekit' ),
				'add_new_item'       => __( 'Add New Menu Item', 'dinekit' ),
				'edit_item'          => __( 'Edit Menu Item', 'dinekit' ),
				'new_item'           => __( 'New Menu Item', 'dinekit' ),
				'view_item'          => __( 'View Menu Item', 'dinekit' ),
				'search_items'       => __( 'Search Menu Items', 'dinekit' ),
				'not_found'          => __( 'No menu items found.', 'dinekit' ),
				'not_found_in_trash' => __( 'No menu items found in Trash.', 'dinekit' ),
				'menu_name'          => __( 'DineKit', 'dinekit' ),
			),
			'description'   => __( 'Restaurant menu items managed by DineKit.', 'dinekit' ),
			'public'        => false,
			'show_ui'       => true,
			// Hidden from the menu: the DineKit React app is the primary UI.
			'show_in_menu'  => false,
			'show_in_rest'  => true,
			'menu_icon'     => 'dashicons-food',
			'menu_position' => 26,
			'supports'      => array( 'title', 'editor', 'thumbnail', 'page-attributes', 'custom-fields' ),
			'rewrite'       => false,
			'has_archive'   => false,
			'map_meta_cap'  => true,
		)
	);

	register_taxonomy(
		'dk_menu',
		'dk_menu_item',
		array(
			'labels'            => array(
				'name'          => __( 'Menus', 'dinekit' ),
				'singular_name' => __( 'Menu', 'dinekit' ),
				'add_new_item'  => __( 'Add New Menu', 'dinekit' ),
				'search_items'  => __( 'Search Menus', 'dinekit' ),
			),
			'description'       => __( 'Top-level menus, e.g. Lunch, Dinner, Drinks.', 'dinekit' ),
			'hierarchical'      => true,
			'public'            => false,
			'show_ui'           => true,
			'show_in_rest'      => true,
			'show_admin_column' => true,
			'rewrite'           => false,
		)
	);

	register_taxonomy(
		'dk_section',
		'dk_menu_item',
		array(
			'labels'            => array(
				'name'          => __( 'Sections', 'dinekit' ),
				'singular_name' => __( 'Section', 'dinekit' ),
				'add_new_item'  => __( 'Add New Section', 'dinekit' ),
				'search_items'  => __( 'Search Sections', 'dinekit' ),
			),
			'description'       => __( 'Menu sections, e.g. Starters, Mains, Desserts.', 'dinekit' ),
			'hierarchical'      => true,
			'public'            => false,
			'show_ui'           => true,
			'show_in_rest'      => true,
			'show_admin_column' => true,
			'rewrite'           => false,
		)
	);

	register_taxonomy(
		'dk_dietary',
		'dk_menu_item',
		array(
			'labels'            => array(
				'name'          => __( 'Dietary Labels', 'dinekit' ),
				'singular_name' => __( 'Dietary Label', 'dinekit' ),
				'add_new_item'  => __( 'Add New Dietary Label', 'dinekit' ),
				'search_items'  => __( 'Search Dietary Labels', 'dinekit' ),
			),
			'description'       => __( 'Dietary suitability, e.g. Vegan, Vegetarian, Gluten Free.', 'dinekit' ),
			'hierarchical'      => false,
			'public'            => false,
			'show_ui'           => true,
			'show_in_rest'      => true,
			'show_admin_column' => true,
			'rewrite'           => false,
		)
	);

	register_taxonomy(
		'dk_allergen',
		'dk_menu_item',
		array(
			'labels'            => array(
				'name'          => __( 'Allergens', 'dinekit' ),
				'singular_name' => __( 'Allergen', 'dinekit' ),
				'add_new_item'  => __( 'Add New Allergen', 'dinekit' ),
				'search_items'  => __( 'Search Allergens', 'dinekit' ),
			),
			'description'       => __( 'The 14 UK regulated allergens (Natasha\'s Law), pre-seeded by DineKit.', 'dinekit' ),
			'hierarchical'      => false,
			'public'            => false,
			'show_ui'           => true,
			'show_in_rest'      => true,
			'show_admin_column' => true,
			'rewrite'           => false,
		)
	);
}

/**
 * Terms of a taxonomy ordered by the `dk_order` term meta, then name.
 *
 * @param string $taxonomy   Taxonomy slug.
 * @param bool   $hide_empty Whether to hide unused terms.
 * @return \WP_Term[]
 */
function ordered_terms( $taxonomy, $hide_empty = false ) {
	$terms = get_terms(
		array(
			'taxonomy'   => $taxonomy,
			'hide_empty' => $hide_empty,
		)
	);
	if ( is_wp_error( $terms ) || ! is_array( $terms ) ) {
		return array();
	}
	usort(
		$terms,
		function ( $a, $b ) {
			$order_a = get_term_meta( $a->term_id, 'dk_order', true );
			$order_b = get_term_meta( $b->term_id, 'dk_order', true );
			$order_a = ( '' === $order_a ) ? PHP_INT_MAX : (int) $order_a;
			$order_b = ( '' === $order_b ) ? PHP_INT_MAX : (int) $order_b;
			if ( $order_a === $order_b ) {
				return strcasecmp( $a->name, $b->name );
			}
			return $order_a <=> $order_b;
		}
	);
	return $terms;
}

/**
 * The 14 UK regulated allergens.
 *
 * Keys are stable slugs (used for icon filenames); values are display names.
 *
 * @return array<string,string>
 */
function uk_allergens() {
	return array(
		'celery'      => __( 'Celery', 'dinekit' ),
		'gluten'      => __( 'Cereals containing gluten', 'dinekit' ),
		'crustaceans' => __( 'Crustaceans', 'dinekit' ),
		'eggs'        => __( 'Eggs', 'dinekit' ),
		'fish'        => __( 'Fish', 'dinekit' ),
		'lupin'       => __( 'Lupin', 'dinekit' ),
		'milk'        => __( 'Milk', 'dinekit' ),
		'molluscs'    => __( 'Molluscs', 'dinekit' ),
		'mustard'     => __( 'Mustard', 'dinekit' ),
		'nuts'        => __( 'Tree nuts', 'dinekit' ),
		'peanuts'     => __( 'Peanuts', 'dinekit' ),
		'sesame'      => __( 'Sesame', 'dinekit' ),
		'soya'        => __( 'Soya', 'dinekit' ),
		'sulphites'   => __( 'Sulphur dioxide / sulphites', 'dinekit' ),
	);
}

/**
 * Default dietary labels seeded on activation (editable/deletable by the user).
 *
 * @return array<string,string>
 */
function default_dietary() {
	return array(
		'vegan'       => __( 'Vegan', 'dinekit' ),
		'vegetarian'  => __( 'Vegetarian', 'dinekit' ),
		'gluten-free' => __( 'Gluten Free', 'dinekit' ),
		'halal'       => __( 'Halal', 'dinekit' ),
		'spicy'       => __( 'Spicy', 'dinekit' ),
	);
}

/**
 * Seed the 14 UK allergen terms. Idempotent — safe to run on every upgrade.
 *
 * Registers taxonomies first if called outside init (e.g. activation hook).
 *
 * @return void
 */
function seed_allergens() {
	if ( ! taxonomy_exists( 'dk_allergen' ) ) {
		register();
	}
	foreach ( uk_allergens() as $slug => $name ) {
		if ( ! term_exists( $slug, 'dk_allergen' ) ) {
			$result = wp_insert_term( $name, 'dk_allergen', array( 'slug' => $slug ) );
			if ( ! is_wp_error( $result ) && isset( $result['term_id'] ) ) {
				// Mark as a DineKit-seeded core allergen (icons keyed off slug).
				update_term_meta( $result['term_id'], 'dk_core_allergen', 1 );
			}
		}
	}
}

/**
 * Seed default dietary labels. Idempotent; only runs the very first time so
 * user deletions are respected on later upgrades.
 *
 * @return void
 */
function seed_dietary() {
	if ( ! taxonomy_exists( 'dk_dietary' ) ) {
		register();
	}
	if ( get_option( 'dinekit_dietary_seeded' ) ) {
		return;
	}
	foreach ( default_dietary() as $slug => $name ) {
		if ( ! term_exists( $slug, 'dk_dietary' ) ) {
			wp_insert_term( $name, 'dk_dietary', array( 'slug' => $slug ) );
		}
	}
	update_option( 'dinekit_dietary_seeded', 1 );
}
