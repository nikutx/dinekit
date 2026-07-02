<?php
/**
 * DineKit REST API (dinekit/v1) — the backend for the React admin app.
 *
 * Endpoints:
 * - GET    /state                 Full builder state (menus, sections, dietary, allergens, items).
 * - POST   /items                 Create a menu item.
 * - PATCH  /items/:id             Update any subset of an item's fields.
 * - DELETE /items/:id             Trash an item.
 * - POST   /terms/:tax            Create a term (dk_menu, dk_section, dk_dietary).
 * - PATCH  /terms/:tax/:id        Rename a term.
 * - DELETE /terms/:tax/:id        Delete a term.
 * - POST   /order                 Persist menu/section/item ordering.
 *
 * @package DineKit
 */

namespace DineKit\Rest;

use DineKit\Meta;
use DineKit\PostTypes;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook REST routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Taxonomies the app may manage directly (allergens are fixed by law).
 *
 * @return string[]
 */
function managed_taxonomies() {
	return array( 'dk_menu', 'dk_section', 'dk_dietary' );
}

/**
 * Register all routes.
 *
 * @return void
 */
function register_routes() {
	register_rest_route(
		'dinekit/v1',
		'/state',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_state',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/items',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_item',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/items/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_item',
				'permission_callback' => __NAMESPACE__ . '\\can_edit_item',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_item',
				'permission_callback' => __NAMESPACE__ . '\\can_edit_item',
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/terms/(?P<tax>[a-z_]+)',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_term',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_terms',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/terms/(?P<tax>[a-z_]+)/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_term',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_terms',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_term',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_terms',
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/order',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\save_order',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/preview',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_preview',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/menu-page',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_menu_page',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/setup',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\run_setup',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			'args'                => array(
				'name' => array( 'type' => 'string' ),
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/qr',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_qr',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
			'args'                => array(
				'url' => array( 'type' => 'string' ),
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/hours',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_hours',
				'permission_callback' => __NAMESPACE__ . '\\can_edit',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\save_hours',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			),
		)
	);
}

/**
 * Settings-level permission (hours, options).
 *
 * @return bool
 */
function can_manage_settings() {
	return current_user_can( 'manage_options' );
}

/**
 * GET /preview — rendered menu HTML + stylesheet URL for the admin preview.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function get_preview( $request ) {
	require_once DINEKIT_DIR . 'includes/frontend/render.php';
	$truthy = static function ( $v ) {
		return null === $v || in_array( (string) $v, array( '1', 'true', 'yes', 'on' ), true );
	};
	$html = \DineKit\Render\menu(
		array(
			'layout'         => (string) $request->get_param( 'layout' ),
			'columns'        => (int) $request->get_param( 'columns' ),
			'show_images'    => $truthy( $request->get_param( 'images' ) ),
			'show_allergens' => $truthy( $request->get_param( 'allergens' ) ),
			'show_dietary'   => $truthy( $request->get_param( 'dietary' ) ),
			'show_matrix'    => $truthy( $request->get_param( 'matrix' ) ),
		)
	);
	return rest_ensure_response(
		array(
			'html'   => $html,
			'cssUrl' => esc_url_raw( DINEKIT_URL . 'assets/css/menu.css?ver=' . DINEKIT_VERSION ),
		)
	);
}

/**
 * POST /menu-page — create (or find) a page that displays the menu.
 *
 * @return \WP_REST_Response
 */
function create_menu_page() {
	require_once DINEKIT_DIR . 'includes/sample.php';
	return rest_ensure_response( \DineKit\Sample\ensure_menu_page() );
}

/**
 * POST /setup — first-run: set name, seed sample menu, ensure a menu page.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function run_setup( $request ) {
	require_once DINEKIT_DIR . 'includes/sample.php';
	$name   = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$result = \DineKit\Sample\run_setup( $name );
	return rest_ensure_response( $result );
}

/**
 * GET /qr — QR code (SVG) for a URL.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function get_qr( $request ) {
	require_once DINEKIT_DIR . 'includes/qr.php';
	$url = esc_url_raw( (string) $request->get_param( 'url' ) );
	if ( '' === $url ) {
		return new \WP_Error( 'dinekit_qr_url', __( 'A URL is required.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$matrix = \DineKit\QR\encode( $url );
	if ( null === $matrix ) {
		return new \WP_Error( 'dinekit_qr_len', __( 'That URL is too long for a QR code.', 'dinekit' ), array( 'status' => 400 ) );
	}
	return rest_ensure_response(
		array(
			'url' => $url,
			'svg' => \DineKit\QR\to_svg( $matrix, 8, 4 ),
		)
	);
}

/**
 * GET /hours — stored hours + computed open-now status + day labels.
 *
 * @return \WP_REST_Response
 */
function get_hours() {
	require_once DINEKIT_DIR . 'includes/hours.php';
	return rest_ensure_response(
		array(
			'hours'  => \DineKit\Hours\get(),
			'status' => \DineKit\Hours\status(),
			'days'   => \DineKit\Hours\days(),
		)
	);
}

/**
 * POST /hours — save hours.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_hours( $request ) {
	require_once DINEKIT_DIR . 'includes/hours.php';
	$saved = \DineKit\Hours\save( (array) $request->get_json_params() );
	return rest_ensure_response(
		array(
			'hours'  => $saved,
			'status' => \DineKit\Hours\status(),
		)
	);
}

/**
 * General permission: menu editors.
 *
 * @return bool
 */
function can_edit() {
	return current_user_can( 'edit_posts' );
}

/**
 * Per-item permission.
 *
 * @param \WP_REST_Request $request Request.
 * @return bool
 */
function can_edit_item( $request ) {
	$post_id = (int) $request['id'];
	return $post_id > 0
		&& 'dk_menu_item' === get_post_type( $post_id )
		&& current_user_can( 'edit_post', $post_id );
}

/**
 * Term management permission (also validates the taxonomy).
 *
 * @param \WP_REST_Request $request Request.
 * @return bool
 */
function can_manage_terms( $request ) {
	return in_array( (string) $request['tax'], managed_taxonomies(), true )
		&& current_user_can( 'manage_categories' );
}

/**
 * Serialize a term.
 *
 * @param \WP_Term $term Term.
 * @return array<string,mixed>
 */
function term_response( $term ) {
	return array(
		'id'    => (int) $term->term_id,
		'name'  => $term->name,
		'slug'  => $term->slug,
		'count' => (int) $term->count,
	);
}

/**
 * Serialize a menu item.
 *
 * @param int|\WP_Post $post Post or ID.
 * @return array<string,mixed>|null
 */
function item_response( $post ) {
	$post = get_post( $post );
	if ( ! $post || 'dk_menu_item' !== $post->post_type ) {
		return null;
	}

	$prices = get_post_meta( $post->ID, 'dk_prices', true );
	if ( ! is_array( $prices ) ) {
		$prices = array();
	}

	$term_ids = static function ( $taxonomy ) use ( $post ) {
		$terms = get_the_terms( $post, $taxonomy );
		if ( ! is_array( $terms ) ) {
			return array();
		}
		return array_map(
			static function ( $term ) {
				return (int) $term->term_id;
			},
			$terms
		);
	};

	$image    = null;
	$thumb_id = (int) get_post_thumbnail_id( $post );
	if ( $thumb_id ) {
		$image = array(
			'id'    => $thumb_id,
			'thumb' => (string) wp_get_attachment_image_url( $thumb_id, 'thumbnail' ),
			'url'   => (string) wp_get_attachment_image_url( $thumb_id, 'large' ),
		);
	}

	return array(
		'id'          => (int) $post->ID,
		'title'       => $post->post_title,
		'description' => (string) $post->post_content,
		'status'      => $post->post_status,
		'order'       => (int) $post->menu_order,
		'prices'      => array_values( $prices ),
		'badge'       => (string) get_post_meta( $post->ID, 'dk_badge', true ),
		'sections'    => $term_ids( 'dk_section' ),
		'menus'       => $term_ids( 'dk_menu' ),
		'dietary'     => $term_ids( 'dk_dietary' ),
		'allergens'   => $term_ids( 'dk_allergen' ),
		'image'       => $image,
	);
}

/**
 * GET /state — everything the app needs at boot.
 *
 * @return \WP_REST_Response
 */
function get_state() {
	$menus = array();
	foreach ( PostTypes\ordered_terms( 'dk_menu' ) as $term ) {
		$menus[] = term_response( $term );
	}

	$sections = array();
	foreach ( PostTypes\ordered_terms( 'dk_section' ) as $term ) {
		$sections[] = term_response( $term );
	}

	$dietary       = array();
	$dietary_terms = get_terms(
		array(
			'taxonomy'   => 'dk_dietary',
			'hide_empty' => false,
		)
	);
	if ( is_array( $dietary_terms ) ) {
		foreach ( $dietary_terms as $term ) {
			$dietary[] = term_response( $term );
		}
	}

	$allergens      = array();
	$allergen_terms = get_terms(
		array(
			'taxonomy'   => 'dk_allergen',
			'hide_empty' => false,
		)
	);
	if ( is_array( $allergen_terms ) ) {
		foreach ( $allergen_terms as $term ) {
			$row         = term_response( $term );
			$icon        = DINEKIT_DIR . 'assets/icons/' . $term->slug . '.svg';
			$row['icon'] = is_readable( $icon ) ? DINEKIT_URL . 'assets/icons/' . $term->slug . '.svg' : '';
			$allergens[] = $row;
		}
	}

	$query = new \WP_Query(
		array(
			'post_type'      => 'dk_menu_item',
			'post_status'    => array( 'publish', 'draft', 'pending', 'future', 'private' ),
			'posts_per_page' => 500,
			'orderby'        => array(
				'menu_order' => 'ASC',
				'title'      => 'ASC',
			),
			'no_found_rows'  => true,
		)
	);

	$items = array();
	foreach ( $query->posts as $post ) {
		$row = item_response( $post );
		if ( null !== $row ) {
			$items[] = $row;
		}
	}

	require_once DINEKIT_DIR . 'includes/sample.php';
	$menu_page = \DineKit\Sample\find_menu_page();

	return rest_ensure_response(
		array(
			'menus'     => $menus,
			'sections'  => $sections,
			'dietary'   => $dietary,
			'allergens' => $allergens,
			'items'     => $items,
			'menuPage'  => $menu_page,
			'siteName'  => get_bloginfo( 'name' ),
		)
	);
}

/**
 * Apply request fields to an item (shared by create/update).
 *
 * @param int              $post_id Post ID.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_item_fields( $post_id, $request ) {
	$postarr = array( 'ID' => $post_id );

	if ( null !== $request->get_param( 'title' ) ) {
		$postarr['post_title'] = sanitize_text_field( (string) $request->get_param( 'title' ) );
	}
	if ( null !== $request->get_param( 'description' ) ) {
		$postarr['post_content'] = wp_kses_post( (string) $request->get_param( 'description' ) );
	}
	$status = $request->get_param( 'status' );
	if ( null !== $status && in_array( (string) $status, array( 'publish', 'draft' ), true ) ) {
		$postarr['post_status'] = (string) $status;
	}
	if ( count( $postarr ) > 1 ) {
		wp_update_post( wp_slash( $postarr ) );
	}

	if ( null !== $request->get_param( 'prices' ) ) {
		update_post_meta( $post_id, 'dk_prices', Meta\sanitize_prices( $request->get_param( 'prices' ) ) );
	}
	if ( null !== $request->get_param( 'badge' ) ) {
		update_post_meta( $post_id, 'dk_badge', sanitize_text_field( (string) $request->get_param( 'badge' ) ) );
	}

	$taxonomy_params = array(
		'sections'  => 'dk_section',
		'menus'     => 'dk_menu',
		'dietary'   => 'dk_dietary',
		'allergens' => 'dk_allergen',
	);
	foreach ( $taxonomy_params as $param => $taxonomy ) {
		$value = $request->get_param( $param );
		if ( null !== $value && is_array( $value ) ) {
			wp_set_object_terms( $post_id, array_map( 'intval', $value ), $taxonomy, false );
		}
	}

	$image = $request->get_param( 'image' );
	if ( null !== $image ) {
		$image = (int) $image;
		if ( $image > 0 && wp_attachment_is_image( $image ) ) {
			set_post_thumbnail( $post_id, $image );
		} elseif ( 0 === $image ) {
			delete_post_thumbnail( $post_id );
		}
	}
}

/**
 * POST /items — create.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_item( $request ) {
	$title = sanitize_text_field( (string) $request->get_param( 'title' ) );

	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dk_menu_item',
			'post_status' => 'publish',
			'post_title'  => '' !== $title ? $title : __( 'New item', 'dinekit' ),
			'menu_order'  => (int) $request->get_param( 'order' ),
		),
		true
	);
	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	apply_item_fields( $post_id, $request );

	return rest_ensure_response( item_response( $post_id ) );
}

/**
 * PATCH /items/:id — update any subset of fields.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_item( $request ) {
	$post_id = (int) $request['id'];
	apply_item_fields( $post_id, $request );
	return rest_ensure_response( item_response( $post_id ) );
}

/**
 * DELETE /items/:id — trash.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function delete_item( $request ) {
	$post_id = (int) $request['id'];
	$result  = wp_trash_post( $post_id );
	if ( ! $result ) {
		return new \WP_Error( 'dinekit_delete_failed', __( 'Could not delete the item.', 'dinekit' ), array( 'status' => 500 ) );
	}
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * POST /terms/:tax — create a term.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_term( $request ) {
	$taxonomy = (string) $request['tax'];
	$name     = sanitize_text_field( (string) $request->get_param( 'name' ) );
	if ( '' === $name ) {
		return new \WP_Error( 'dinekit_term_name', __( 'A name is required.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$result = wp_insert_term( $name, $taxonomy );
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	// New terms go to the end of the ordered list.
	$position = count( PostTypes\ordered_terms( $taxonomy ) );
	update_term_meta( (int) $result['term_id'], 'dk_order', $position );

	$term = get_term( (int) $result['term_id'], $taxonomy );
	return rest_ensure_response( term_response( $term ) );
}

/**
 * PATCH /terms/:tax/:id — rename.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function update_term( $request ) {
	$taxonomy = (string) $request['tax'];
	$term_id  = (int) $request['id'];
	$name     = sanitize_text_field( (string) $request->get_param( 'name' ) );
	if ( '' === $name ) {
		return new \WP_Error( 'dinekit_term_name', __( 'A name is required.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$result = wp_update_term( $term_id, $taxonomy, array( 'name' => $name ) );
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	$term = get_term( $term_id, $taxonomy );
	return rest_ensure_response( term_response( $term ) );
}

/**
 * DELETE /terms/:tax/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function delete_term( $request ) {
	$result = wp_delete_term( (int) $request['id'], (string) $request['tax'] );
	if ( is_wp_error( $result ) ) {
		return $result;
	}
	return rest_ensure_response( array( 'deleted' => (bool) $result ) );
}

/**
 * POST /order — persist ordering.
 *
 * Payload: { menus: [ids], sections: [ids], items: [{id, order}] }.
 * Term arrays set dk_order term meta; items update menu_order.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_order( $request ) {
	$updated = 0;

	$term_orders = array(
		'dk_menu'    => $request->get_param( 'menus' ),
		'dk_section' => $request->get_param( 'sections' ),
	);
	if ( current_user_can( 'manage_categories' ) ) {
		foreach ( $term_orders as $taxonomy => $ids ) {
			if ( ! is_array( $ids ) ) {
				continue;
			}
			foreach ( array_values( $ids ) as $position => $term_id ) {
				$term_id = (int) $term_id;
				if ( $term_id > 0 && term_exists( $term_id, $taxonomy ) ) {
					update_term_meta( $term_id, 'dk_order', $position );
					++$updated;
				}
			}
		}
	}

	$items = $request->get_param( 'items' );
	if ( is_array( $items ) ) {
		foreach ( $items as $row ) {
			$post_id  = isset( $row['id'] ) ? (int) $row['id'] : 0;
			$position = isset( $row['order'] ) ? (int) $row['order'] : 0;
			if ( ! $post_id || 'dk_menu_item' !== get_post_type( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
				continue;
			}
			if ( (int) get_post_field( 'menu_order', $post_id ) === $position ) {
				continue;
			}
			wp_update_post(
				array(
					'ID'         => $post_id,
					'menu_order' => $position,
				)
			);
			++$updated;
		}
	}

	return rest_ensure_response(
		array(
			'saved'   => true,
			'updated' => $updated,
		)
	);
}
