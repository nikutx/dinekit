<?php
/**
 * Events module — ticketed sittings / set-menu events with per-guest pre-orders.
 *
 * An event links to a menu (the set menu). Guests open a share link, pick one
 * dish per course and flag their allergens/dietary needs; the kitchen gets a
 * consolidated prep sheet. Everything is CPT/meta — no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Events;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boot the module.
 *
 * @return void
 */
function init() {
	add_action( 'init', __NAMESPACE__ . '\\register' );
	add_action( 'init', __NAMESPACE__ . '\\register_frontend' );
	add_shortcode( 'dinekit_event', __NAMESPACE__ . '\\event_shortcode' );
	require_once DINEKIT_DIR . 'includes/events/rest.php';
	Rest\init();
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
 * Register the event + guest post types and their meta.
 *
 * @return void
 */
function register() {
	register_post_type(
		'dk_event',
		array(
			'labels'       => array(
				'name'          => __( 'Events', 'dinekit' ),
				'singular_name' => __( 'Event', 'dinekit' ),
			),
			'description'  => __( 'DineKit set-menu events with pre-orders.', 'dinekit' ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_menu' => false,
			'show_in_rest' => false,
			'supports'     => array( 'title', 'page-attributes' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'map_meta_cap' => true,
		)
	);

	register_post_type(
		'dk_guest',
		array(
			'labels'       => array(
				'name'          => __( 'Event guests', 'dinekit' ),
				'singular_name' => __( 'Event guest', 'dinekit' ),
			),
			'description'  => __( 'Per-guest pre-orders for DineKit events.', 'dinekit' ),
			'public'       => false,
			'show_ui'      => false,
			'show_in_menu' => false,
			'show_in_rest' => false,
			'supports'     => array( 'title' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'map_meta_cap' => true,
		)
	);

	$event_meta = array(
		'dk_event_date'     => 'string',
		'dk_event_time'     => 'string',
		'dk_event_menu'     => 'integer', // Linked dk_menu term id.
		'dk_event_capacity' => 'integer', // Max guests (0 = unlimited).
		'dk_event_deadline' => 'string',  // Order-by date (Y-m-d).
		'dk_event_token'    => 'string',
		'dk_event_price'    => 'integer',
		'dk_event_status'   => 'string',  // draft | published.
		'dk_event_intro'    => 'string',
	);
	foreach ( $event_meta as $key => $type ) {
		register_post_meta(
			'dk_event',
			$key,
			array(
				'type'              => $type,
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'integer' === $type ? 'absint' : 'sanitize_text_field',
				'auth_callback'     => __NAMESPACE__ . '\\can_manage',
			)
		);
	}

	$guest_meta = array(
		'dk_guest_event'      => 'integer',
		'dk_guest_email'      => 'string',
		'dk_guest_selections' => 'string', // JSON: { sectionId: itemId }.
		'dk_guest_allergens'  => 'string', // Comma term ids.
		'dk_guest_dietary'    => 'string', // Comma term ids.
		'dk_guest_notes'      => 'string',
	);
	foreach ( $guest_meta as $key => $type ) {
		register_post_meta(
			'dk_guest',
			$key,
			array(
				'type'              => $type,
				'single'            => true,
				'show_in_rest'      => false,
				'sanitize_callback' => 'integer' === $type ? 'absint' : 'sanitize_text_field',
				'auth_callback'     => __NAMESPACE__ . '\\can_manage',
			)
		);
	}
}

/**
 * Register the public event page assets.
 *
 * @return void
 */
function register_frontend() {
	wp_register_style( 'dinekit-event', DINEKIT_URL . 'assets/css/booking.css', array(), DINEKIT_VERSION );
	wp_register_script( 'dinekit-event', DINEKIT_URL . 'assets/js/dinekit-event.js', array(), DINEKIT_VERSION, true );
}

/**
 * A fresh, unique share token.
 *
 * @return string
 */
function make_token() {
	return strtolower( wp_generate_password( 20, false, false ) );
}

/**
 * URL of the page that hosts the [dinekit_event] shortcode — found or created
 * on demand, so share links always resolve.
 *
 * @return string
 */
function events_page_url() {
	$page_id = (int) get_option( 'dinekit_events_page' );
	if ( $page_id && 'publish' === get_post_status( $page_id ) ) {
		return (string) get_permalink( $page_id );
	}

	$found = get_posts(
		array(
			'post_type'        => 'page',
			'post_status'      => 'publish',
			'posts_per_page'   => 1,
			'no_found_rows'    => true,
			's'                => '[dinekit_event]',
			'suppress_filters' => true,
		)
	);
	if ( $found ) {
		update_option( 'dinekit_events_page', $found[0]->ID );
		return (string) get_permalink( $found[0]->ID );
	}

	$id = wp_insert_post(
		array(
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => __( 'Event pre-order', 'dinekit' ),
			'post_content' => '[dinekit_event]',
		)
	);
	if ( $id && ! is_wp_error( $id ) ) {
		update_option( 'dinekit_events_page', $id );
		return (string) get_permalink( $id );
	}
	return home_url( '/' );
}

/**
 * Find an event by its share token.
 *
 * @param string $token Token.
 * @return \WP_Post|null
 */
function event_by_token( $token ) {
	if ( '' === $token ) {
		return null;
	}
	$posts = get_posts(
		array(
			'post_type'      => 'dk_event',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'meta_key'       => 'dk_event_token',
			'meta_value'     => sanitize_text_field( $token ),
		)
	);
	return $posts ? $posts[0] : null;
}

/**
 * Build the courses (sections + their items) for a linked menu.
 *
 * @param int $menu_id dk_menu term id.
 * @return array<int,array<string,mixed>>
 */
function courses( $menu_id ) {
	require_once DINEKIT_DIR . 'includes/post-types.php';

	$query = new \WP_Query(
		array(
			'post_type'      => 'dk_menu_item',
			'post_status'    => 'publish',
			'posts_per_page' => 300,
			'no_found_rows'  => true,
			'orderby'        => 'menu_order',
			'order'          => 'ASC',
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
			'tax_query'      => array(
				array(
					'taxonomy' => 'dk_menu',
					'field'    => 'term_id',
					'terms'    => (int) $menu_id,
				),
			),
		)
	);

	$sections = array();
	foreach ( $query->posts as $post ) {
		$terms = get_the_terms( $post, 'dk_section' );
		if ( ! is_array( $terms ) ) {
			continue;
		}
		foreach ( $terms as $term ) {
			if ( ! isset( $sections[ $term->term_id ] ) ) {
				$sections[ $term->term_id ] = array(
					'id'    => (int) $term->term_id,
					'name'  => $term->name,
					'order' => (int) get_term_meta( $term->term_id, 'dk_order', true ),
					'items' => array(),
				);
			}
			$sections[ $term->term_id ]['items'][] = array(
				'id'    => (int) $post->ID,
				'title' => $post->post_title,
			);
		}
	}

	$list = array_values( $sections );
	usort(
		$list,
		function ( $a, $b ) {
			return $a['order'] <=> $b['order'];
		}
	);
	return $list;
}

/**
 * [dinekit_event] — renders the guest pre-order page for ?dkevent=TOKEN.
 *
 * @param array<string,string>|string $atts Attributes.
 * @return string
 */
function event_shortcode( $atts ) {
	require_once DINEKIT_DIR . 'includes/events/form.php';
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- public read-only page keyed by an unguessable token.
	$token = isset( $_GET['dkevent'] ) ? sanitize_text_field( wp_unslash( $_GET['dkevent'] ) ) : '';
	return Form\render( $token );
}
