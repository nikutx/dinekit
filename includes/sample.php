<?php
/**
 * Sample content + first-run setup. Seeds a realistic starter menu and a page
 * so a new user reaches a published menu in well under three minutes.
 *
 * @package DineKit
 */

namespace DineKit\Sample;

use DineKit\PostTypes;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Look up allergen/dietary term ids by slug.
 *
 * @param string   $taxonomy Taxonomy.
 * @param string[] $slugs    Slugs.
 * @return int[]
 */
function term_ids( $taxonomy, $slugs ) {
	$ids = array();
	foreach ( $slugs as $slug ) {
		$term = get_term_by( 'slug', $slug, $taxonomy );
		if ( $term ) {
			$ids[] = (int) $term->term_id;
		}
	}
	return $ids;
}

/**
 * Create a section term and return its id (reusing an existing one by name).
 *
 * @param string $name  Section name.
 * @param int    $order Display order.
 * @return int
 */
function make_section( $name, $order ) {
	$existing = get_term_by( 'name', $name, 'dk_section' );
	if ( $existing ) {
		return (int) $existing->term_id;
	}
	$result = wp_insert_term( $name, 'dk_section' );
	if ( is_wp_error( $result ) ) {
		return 0;
	}
	update_term_meta( (int) $result['term_id'], 'dk_order', $order );
	return (int) $result['term_id'];
}

/**
 * Create a menu item.
 *
 * @param array<string,mixed> $item Item spec.
 * @return void
 */
function make_item( $item ) {
	$post_id = wp_insert_post(
		array(
			'post_type'    => 'dk_menu_item',
			'post_status'  => 'publish',
			'post_title'   => $item['title'],
			'post_content' => isset( $item['desc'] ) ? $item['desc'] : '',
			'menu_order'   => isset( $item['order'] ) ? (int) $item['order'] : 0,
		)
	);
	if ( is_wp_error( $post_id ) || ! $post_id ) {
		return;
	}
	if ( ! empty( $item['section'] ) ) {
		wp_set_object_terms( $post_id, array( (int) $item['section'] ), 'dk_section' );
	}
	if ( ! empty( $item['prices'] ) ) {
		update_post_meta( $post_id, 'dk_prices', $item['prices'] );
	}
	if ( ! empty( $item['badge'] ) ) {
		update_post_meta( $post_id, 'dk_badge', $item['badge'] );
	}
	if ( ! empty( $item['allergens'] ) ) {
		wp_set_object_terms( $post_id, $item['allergens'], 'dk_allergen' );
	}
	if ( ! empty( $item['dietary'] ) ) {
		wp_set_object_terms( $post_id, $item['dietary'], 'dk_dietary' );
	}
}

/**
 * Seed the sample menu (only if there are no items yet).
 *
 * @return void
 */
function seed_menu() {
	$count = (int) wp_count_posts( 'dk_menu_item' )->publish;
	if ( $count > 0 ) {
		return;
	}

	$starters = make_section( __( 'Starters', 'dinekit' ), 0 );
	$mains    = make_section( __( 'Mains', 'dinekit' ), 1 );
	$desserts = make_section( __( 'Desserts', 'dinekit' ), 2 );

	$gluten = term_ids( 'dk_allergen', array( 'gluten' ) );
	$milk   = term_ids( 'dk_allergen', array( 'milk' ) );
	$fish   = term_ids( 'dk_allergen', array( 'fish' ) );
	$eggs   = term_ids( 'dk_allergen', array( 'eggs' ) );
	$veg    = term_ids( 'dk_dietary', array( 'vegetarian' ) );

	$items = array(
		array(
			'title'     => __( 'Soup of the Day', 'dinekit' ),
			'desc'      => __( 'Freshly made, served with warm sourdough.', 'dinekit' ),
			'section'   => $starters,
			'order'     => 0,
			'prices'    => array( array( 'label' => '', 'amount' => '6.50' ) ),
			'allergens' => array_merge( $gluten, $milk ),
			'dietary'   => $veg,
		),
		array(
			'title'     => __( 'Crispy Calamari', 'dinekit' ),
			'desc'      => __( 'Lightly fried, lemon & garlic aioli.', 'dinekit' ),
			'section'   => $starters,
			'order'     => 1,
			'prices'    => array( array( 'label' => '', 'amount' => '8.00' ) ),
			'allergens' => array_merge( $fish, $gluten, $eggs ),
		),
		array(
			'title'     => __( 'Beer-battered Fish & Chips', 'dinekit' ),
			'desc'      => __( 'Hand-cut chips, mushy peas, tartare sauce.', 'dinekit' ),
			'section'   => $mains,
			'order'     => 0,
			'prices'    => array(
				array( 'label' => __( 'Regular', 'dinekit' ), 'amount' => '14.50' ),
				array( 'label' => __( 'Large', 'dinekit' ), 'amount' => '17.00' ),
			),
			'badge'     => __( 'Popular', 'dinekit' ),
			'allergens' => array_merge( $fish, $gluten ),
		),
		array(
			'title'     => __( 'Wild Mushroom Risotto', 'dinekit' ),
			'desc'      => __( 'Arborio rice, parmesan, truffle oil.', 'dinekit' ),
			'section'   => $mains,
			'order'     => 1,
			'prices'    => array( array( 'label' => '', 'amount' => '13.00' ) ),
			'allergens' => $milk,
			'dietary'   => $veg,
		),
		array(
			'title'     => __( 'Sticky Toffee Pudding', 'dinekit' ),
			'desc'      => __( 'Butterscotch sauce, clotted cream.', 'dinekit' ),
			'section'   => $desserts,
			'order'     => 0,
			'prices'    => array( array( 'label' => '', 'amount' => '6.00' ) ),
			'badge'     => __( 'Chef’s Special', 'dinekit' ),
			'allergens' => array_merge( $gluten, $milk, $eggs ),
			'dietary'   => $veg,
		),
	);

	foreach ( $items as $item ) {
		make_item( $item );
	}
}

/**
 * Config for the three customer-facing page types DineKit can auto-create.
 * Each entry knows the block + shortcode to detect, the default page title,
 * and the content to insert when creating a fresh page.
 *
 * @param string $type One of menu|order|booking.
 * @return array{block:string,shortcode:string,title:string,content:string}|null
 */
function page_type( $type ) {
	$types = array(
		'menu'    => array(
			'block'     => 'dinekit/menu',
			'shortcode' => '[dinekit_menu',
			'title'     => __( 'Menu', 'dinekit' ),
			'content'   => '<!-- wp:dinekit/menu /-->',
		),
		'order'   => array(
			'block'     => 'dinekit/order',
			'shortcode' => '[dinekit_order',
			'title'     => __( 'Order Online', 'dinekit' ),
			'content'   => '[dinekit_order]',
		),
		'booking' => array(
			'block'     => 'dinekit/booking',
			'shortcode' => '[dinekit_booking',
			'title'     => __( 'Book a Table', 'dinekit' ),
			'content'   => '[dinekit_booking]',
		),
	);
	return isset( $types[ $type ] ) ? $types[ $type ] : null;
}

/**
 * Find a published page that already shows a given DineKit surface (block or
 * shortcode).
 *
 * @param string $type One of menu|order|booking.
 * @return array{url:string,title:string,id:int}|null
 */
function find_page( $type = 'menu' ) {
	$cfg = page_type( $type );
	if ( ! $cfg ) {
		return null;
	}
	$pages = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'no_found_rows'  => true,
		)
	);
	foreach ( $pages as $page ) {
		if ( has_block( $cfg['block'], $page ) || false !== strpos( $page->post_content, $cfg['shortcode'] ) ) {
			return array(
				'url'   => (string) get_permalink( $page ),
				'title' => get_the_title( $page ),
				'id'    => (int) $page->ID,
			);
		}
	}
	return null;
}

/**
 * Ensure a published page for a given DineKit surface exists; return it.
 *
 * @param string $type One of menu|order|booking.
 * @return array{url:string,title:string,id:int}
 */
function ensure_page( $type = 'menu' ) {
	$cfg = page_type( $type );
	if ( ! $cfg ) {
		return array(
			'url'   => '',
			'title' => '',
			'id'    => 0,
		);
	}
	$found = find_page( $type );
	if ( $found ) {
		return $found;
	}
	$page_id = wp_insert_post(
		array(
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => $cfg['title'],
			'post_content' => $cfg['content'],
		)
	);
	if ( is_wp_error( $page_id ) ) {
		return array(
			'url'   => '',
			'title' => '',
			'id'    => 0,
		);
	}
	return array(
		'url'   => (string) get_permalink( $page_id ),
		'title' => get_the_title( $page_id ),
		'id'    => (int) $page_id,
	);
}

/**
 * Find a published page that already shows the DineKit menu.
 *
 * @return array{url:string,title:string,id:int}|null
 */
function find_menu_page() {
	return find_page( 'menu' );
}

/**
 * Ensure a published "Menu" page with the DineKit block exists; return it.
 *
 * @return array{url:string,title:string,id:int}
 */
function ensure_menu_page() {
	return ensure_page( 'menu' );
}

/**
 * Run first-run setup: name, (optional) sample menu, menu page.
 *
 * @param string $name Restaurant name.
 * @param bool   $seed Seed the sample menu (false = start blank).
 * @return array{page:string}
 */
function run_setup( $name, $seed = true ) {
	if ( '' !== $name ) {
		require_once DINEKIT_DIR . 'includes/hours.php';
		$hours         = \DineKit\Hours\get();
		$hours['name'] = $name;
		\DineKit\Hours\save( $hours );
	}

	if ( $seed ) {
		seed_menu();
	}
	$page = ensure_menu_page();
	update_option( 'dinekit_onboarded', 1 );

	return array( 'page' => $page['url'] );
}
