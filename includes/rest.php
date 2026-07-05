<?php
/**
 * DineKit REST API (dinekit/v1) — the backend for the React admin app.
 *
 * Endpoints:
 * - GET    /state                 Full builder state (menus, sections, dietary, allergens, items).
 * - POST   /items                 Create a menu item.
 * - PATCH  /items/:id             Update any subset of an item's fields.
 * - DELETE /items/:id             Trash an item.
 * - POST   /terms/:tax            Create a term (dinekit_menu, dinekit_section, dinekit_dietary).
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
	return array( 'dinekit_menu', 'dinekit_section', 'dinekit_dietary' );
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
		'/dashboard',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_dashboard',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/reports',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_reports',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/reports/service-sheet',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\get_service_sheet',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/guests/profile',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\save_guest_profile',
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
				'permission_callback' => __NAMESPACE__ . '\\can_delete_item',
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/items/(?P<id>\d+)/duplicate',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\duplicate_item',
			'permission_callback' => __NAMESPACE__ . '\\can_duplicate_item_cb',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/sections/(?P<id>\d+)/duplicate',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\duplicate_section',
			'permission_callback' => __NAMESPACE__ . '\\can_duplicate_section_cb',
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
		'/menus/(?P<id>\d+)/schedule',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\save_menu_schedule',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_categories_cb',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/menus/(?P<id>\d+)/duplicate',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\duplicate_menu',
			'permission_callback' => __NAMESPACE__ . '\\can_duplicate_menu_cb',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/menus/(?P<id>\d+)/used',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\menu_used_on',
			'permission_callback' => __NAMESPACE__ . '\\can_edit',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/settings',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_settings',
				'permission_callback' => __NAMESPACE__ . '\\can_edit',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\save_settings',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/integrations',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_integrations',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\save_integrations',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			),
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/integrations/test',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\test_integration',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/integrations/webhook',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\register_stripe_webhook',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
		)
	);

	register_rest_route(
		'dinekit/v1',
		'/emails',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_emails',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\save_emails',
				'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			),
		)
	);
	register_rest_route(
		'dinekit/v1',
		'/emails/preview',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\preview_email',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
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
		'/setup-page',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\create_setup_page',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
			'args'                => array(
				'type' => array( 'type' => 'string' ),
			),
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
		'/wizard',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\run_wizard',
			'permission_callback' => __NAMESPACE__ . '\\can_manage_settings',
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
 * Category/term management permission.
 *
 * @return bool
 */
function can_manage_categories_cb() {
	return current_user_can( 'manage_categories' );
}

/**
 * POST /menus/:id/schedule — save a menu's schedule.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function save_menu_schedule( $request ) {
	require_once DINEKIT_DIR . 'includes/menus.php';
	$id = (int) $request['id'];
	if ( ! term_exists( $id, 'dinekit_menu' ) ) {
		return new \WP_Error( 'dinekit_no_menu', __( 'Menu not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	\DineKit\Menus\save_schedule( $id, (array) $request->get_json_params() );
	return rest_ensure_response( menu_response( get_term( $id, 'dinekit_menu' ) ) );
}

/**
 * POST /menus/:id/duplicate — clone a menu and its item assignments.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function duplicate_menu( $request ) {
	require_once DINEKIT_DIR . 'includes/menus.php';
	$result = \DineKit\Menus\duplicate( (int) $request['id'] );
	if ( null === $result ) {
		return new \WP_Error( 'dinekit_dup_failed', __( 'Could not duplicate the menu.', 'dinekit' ), array( 'status' => 500 ) );
	}
	return rest_ensure_response( menu_response( get_term( $result['id'], 'dinekit_menu' ) ) );
}

/**
 * GET /menus/:id/used — pages/posts that display this menu.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function menu_used_on( $request ) {
	require_once DINEKIT_DIR . 'includes/menus.php';
	return rest_ensure_response( \DineKit\Menus\used_on( (int) $request['id'] ) );
}

/**
 * GET /settings — plugin settings (brand colour, currency).
 *
 * @return \WP_REST_Response
 */
function get_settings() {
	require_once DINEKIT_DIR . 'includes/settings.php';
	return rest_ensure_response( \DineKit\Settings\get() );
}

/**
 * POST /settings — save plugin settings.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_settings( $request ) {
	require_once DINEKIT_DIR . 'includes/settings.php';
	return rest_ensure_response( \DineKit\Settings\save( (array) $request->get_json_params() ) );
}

/**
 * GET /integrations — bring-your-own-keys settings (secrets masked).
 *
 * @return \WP_REST_Response
 */
function get_integrations() {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	return rest_ensure_response( \DineKit\Integrations\get_public() );
}

/**
 * POST /integrations/test — validate the saved Stripe keys against the API.
 *
 * @return \WP_REST_Response
 */
function test_integration() {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	return rest_ensure_response( \DineKit\Integrations\test_connection() );
}

/**
 * POST /integrations/webhook — auto-create the Stripe webhook endpoint for the
 * active mode and capture its signing secret. Returns the refreshed public
 * settings so the UI reflects the new "webhook set" status.
 *
 * @return \WP_REST_Response
 */
function register_stripe_webhook() {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$result             = \DineKit\Integrations\register_webhook();
	$result['settings'] = \DineKit\Integrations\get_public();
	return rest_ensure_response( $result );
}

/**
 * GET /emails — branding + editable templates.
 *
 * @return \WP_REST_Response
 */
function get_emails() {
	require_once DINEKIT_DIR . 'includes/emails.php';
	return rest_ensure_response( \DineKit\Emails\get() );
}

/**
 * POST /emails — save branding + templates.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_emails( $request ) {
	require_once DINEKIT_DIR . 'includes/emails.php';
	return rest_ensure_response( \DineKit\Emails\save( (array) $request->get_json_params() ) );
}

/**
 * POST /emails/preview — rendered preview (subject + HTML) of one template.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function preview_email( $request ) {
	require_once DINEKIT_DIR . 'includes/emails.php';
	$key = sanitize_key( (string) $request->get_param( 'key' ) );
	return rest_ensure_response( \DineKit\Emails\preview( $key ) );
}

/**
 * POST /integrations — save integration keys.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_integrations( $request ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	return rest_ensure_response( \DineKit\Integrations\save( (array) $request->get_json_params() ) );
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
	$html   = \DineKit\Render\menu(
		array(
			'layout'         => (string) $request->get_param( 'layout' ),
			'columns'        => (int) $request->get_param( 'columns' ),
			'template'       => sanitize_key( (string) $request->get_param( 'template' ) ),
			'show_images'    => $truthy( $request->get_param( 'images' ) ),
			'show_allergens' => $truthy( $request->get_param( 'allergens' ) ),
			'show_dietary'   => $truthy( $request->get_param( 'dietary' ) ),
			'show_matrix'    => $truthy( $request->get_param( 'matrix' ) ),
			'show_filter'    => $truthy( $request->get_param( 'filter' ) ),
		)
	);
	return rest_ensure_response(
		array(
			'html'   => $html,
			'cssUrl' => esc_url_raw( DINEKIT_URL . 'assets/css/menu.css?ver=' . DINEKIT_VERSION ),
			'jsUrl'  => esc_url_raw( DINEKIT_URL . 'assets/js/dinekit-filter.js?ver=' . DINEKIT_VERSION ),
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
 * POST /setup-page — create (or find) a customer-facing page for a given
 * DineKit surface (menu|order|booking) and return its link.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function create_setup_page( $request ) {
	require_once DINEKIT_DIR . 'includes/sample.php';
	$type = (string) $request->get_param( 'type' );
	if ( ! in_array( $type, array( 'menu', 'order', 'booking' ), true ) ) {
		$type = 'menu';
	}
	return rest_ensure_response( \DineKit\Sample\ensure_page( $type ) );
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
 * POST /wizard — guided first-run: store name + business type, optionally seed a
 * sample menu, and (for dine-in) create a starter set of tables.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function run_wizard( $request ) {
	require_once DINEKIT_DIR . 'includes/sample.php';
	require_once DINEKIT_DIR . 'includes/settings.php';

	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$type = (string) $request->get_param( 'businessType' );
	if ( ! in_array( $type, array( 'dinein', 'takeaway', 'both' ), true ) ) {
		$type = 'both';
	}
	$seed   = (bool) $request->get_param( 'seedSample' );
	$tables = min( 50, absint( $request->get_param( 'tables' ) ) );

	// Persist the business type.
	$settings                 = \DineKit\Settings\get();
	$settings['businessType'] = $type;
	\DineKit\Settings\save( $settings );

	$result         = \DineKit\Sample\run_setup( $name, $seed );
	$result['type'] = $type;

	// Starter tables for dine-in venues.
	if ( $tables > 0 && 'takeaway' !== $type ) {
		$area    = wp_insert_term( __( 'Main Restaurant', 'dinekit' ), 'dinekit_area' );
		$area_id = is_wp_error( $area ) ? 0 : (int) $area['term_id'];
		for ( $i = 1; $i <= $tables; $i++ ) {
			$table_id = wp_insert_post(
				array(
					'post_type'   => 'dinekit_table',
					'post_status' => 'publish',
					'post_title'  => 'T' . $i,
					'menu_order'  => $i,
				)
			);
			if ( is_wp_error( $table_id ) ) {
				continue;
			}
			update_post_meta( $table_id, 'dinekit_seats', 2 );
			update_post_meta( $table_id, 'dinekit_min_party', 1 );
			update_post_meta( $table_id, 'dinekit_max_party', 2 );
			update_post_meta( $table_id, 'dinekit_pos_x', 40 + ( ( $i - 1 ) % 6 ) * 80 );
			update_post_meta( $table_id, 'dinekit_pos_y', 40 + intdiv( ( $i - 1 ) % 18, 6 ) * 90 );
			update_post_meta( $table_id, 'dinekit_shape', 'round' );
			if ( $area_id ) {
				wp_set_object_terms( $table_id, array( $area_id ), 'dinekit_area' );
			}
		}
		$result['tables'] = $tables;
	}

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
 * General permission for the menu-management surface.
 *
 * The menu is a single, restaurant-wide dataset (not per-author content), so
 * managing it — including seeing every item's draft/private state via /state —
 * is an editor-level task. edit_others_posts keeps authors/contributors out of
 * other people's items while still letting site editors run the menu.
 *
 * @return bool
 */
function can_edit() {
	return current_user_can( 'edit_others_posts' );
}

/**
 * Per-item edit permission (PATCH, duplicate).
 *
 * @param \WP_REST_Request $request Request.
 * @return bool
 */
function can_edit_item( $request ) {
	$post_id = (int) $request['id'];
	return $post_id > 0
		&& 'dinekit_menu_item' === get_post_type( $post_id )
		&& current_user_can( 'edit_post', $post_id );
}

/**
 * Per-item delete permission (DELETE). Checks the delete_post meta-cap, not
 * edit_post, so trashing is gated by the correct capability.
 *
 * @param \WP_REST_Request $request Request.
 * @return bool
 */
function can_delete_item( $request ) {
	$post_id = (int) $request['id'];
	return $post_id > 0
		&& 'dinekit_menu_item' === get_post_type( $post_id )
		&& current_user_can( 'delete_post', $post_id );
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
 * The menu-item post type's capability set (honours map_meta_cap). Falls back to
 * the default 'post' primitives if the type isn't registered yet.
 *
 * @return object
 */
function item_caps() {
	$pt = get_post_type_object( 'dinekit_menu_item' );
	if ( $pt && isset( $pt->cap ) ) {
		return $pt->cap;
	}
	return (object) array(
		'create_posts'      => 'edit_posts',
		'edit_others_posts' => 'edit_others_posts',
		'publish_posts'     => 'publish_posts',
	);
}

/**
 * Duplicating a menu re-assigns terms across existing items, so require both term
 * management AND the capability to edit those items — not manage_categories alone.
 *
 * @return bool
 */
function can_duplicate_menu_cb() {
	return current_user_can( 'manage_categories' )
		&& current_user_can( item_caps()->edit_others_posts );
}

/**
 * Duplicating a section clones item posts that inherit the source's status
 * (possibly published), so require term management plus the capability to create
 * AND publish items.
 *
 * @return bool
 */
function can_duplicate_section_cb() {
	$caps = item_caps();
	return current_user_can( 'manage_categories' )
		&& current_user_can( $caps->create_posts )
		&& current_user_can( $caps->publish_posts );
}

/**
 * Duplicating a single item creates a new (possibly published) item, so require
 * per-item edit of the source PLUS create + publish capability.
 *
 * @param \WP_REST_Request $request Request.
 * @return bool
 */
function can_duplicate_item_cb( $request ) {
	$caps = item_caps();
	return can_edit_item( $request )
		&& current_user_can( $caps->create_posts )
		&& current_user_can( $caps->publish_posts );
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
 * Serialize a dinekit_menu term with its schedule + live status.
 *
 * @param \WP_Term $term Menu term.
 * @return array<string,mixed>
 */
function menu_response( $term ) {
	require_once DINEKIT_DIR . 'includes/menus.php';
	$data             = term_response( $term );
	$data['schedule'] = \DineKit\Menus\get_schedule( (int) $term->term_id );
	$data['status']   = \DineKit\Menus\status( (int) $term->term_id );
	return $data;
}

/**
 * Serialize a menu item.
 *
 * @param int|\WP_Post $post Post or ID.
 * @return array<string,mixed>|null
 */
function item_response( $post ) {
	$post = get_post( $post );
	if ( ! $post || 'dinekit_menu_item' !== $post->post_type ) {
		return null;
	}

	$prices = get_post_meta( $post->ID, 'dinekit_prices', true );
	if ( ! is_array( $prices ) ) {
		$prices = array();
	}

	$modifiers = get_post_meta( $post->ID, 'dinekit_modifiers', true );
	if ( ! is_array( $modifiers ) ) {
		$modifiers = array();
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
		'modifiers'   => array_values( $modifiers ),
		'badge'       => (string) get_post_meta( $post->ID, 'dinekit_badge', true ),
		'station'     => 'bar' === get_post_meta( $post->ID, 'dinekit_station', true ) ? 'bar' : 'kitchen',
		'sections'    => $term_ids( 'dinekit_section' ),
		'menus'       => $term_ids( 'dinekit_menu' ),
		'dietary'     => $term_ids( 'dinekit_dietary' ),
		'allergens'   => $term_ids( 'dinekit_allergen' ),
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
	foreach ( PostTypes\ordered_terms( 'dinekit_menu' ) as $term ) {
		$menus[] = menu_response( $term );
	}

	$sections = array();
	foreach ( PostTypes\ordered_terms( 'dinekit_section' ) as $term ) {
		$sections[] = term_response( $term );
	}

	$dietary       = array();
	$dietary_terms = get_terms(
		array(
			'taxonomy'   => 'dinekit_dietary',
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
			'taxonomy'   => 'dinekit_allergen',
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
			'post_type'      => 'dinekit_menu_item',
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
	require_once DINEKIT_DIR . 'includes/settings.php';
	$menu_page = \DineKit\Sample\find_menu_page();

	return rest_ensure_response(
		array(
			'menus'        => $menus,
			'sections'     => $sections,
			'dietary'      => $dietary,
			'allergens'    => $allergens,
			'items'        => $items,
			'menuPage'     => $menu_page,
			'siteName'     => get_bloginfo( 'name' ),
			'businessType' => \DineKit\Settings\get()['businessType'],
			'onboarded'    => (bool) get_option( 'dinekit_onboarded' ),
		)
	);
}

/**
 * GET /dashboard — the home overview aggregate.
 *
 * @return \WP_REST_Response
 */
function get_dashboard() {
	require_once DINEKIT_DIR . 'includes/dashboard.php';
	return rest_ensure_response( \DineKit\Dashboard\data() );
}

/**
 * GET /reports?from&to — analytics aggregate over a date range. Defaults to the
 * last 30 days when no range is supplied.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function get_reports( $request ) {
	require_once DINEKIT_DIR . 'includes/reports.php';
	$today = current_time( 'Y-m-d' );
	$from  = sanitize_text_field( (string) $request->get_param( 'from' ) );
	$to    = sanitize_text_field( (string) $request->get_param( 'to' ) );
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $from ) ) {
		$from = gmdate( 'Y-m-d', (int) current_time( 'timestamp' ) - 29 * DAY_IN_SECONDS );
	}
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $to ) ) {
		$to = $today;
	}
	if ( $from > $to ) {
		list( $from, $to ) = array( $to, $from );
	}
	return rest_ensure_response( \DineKit\Reports\range_data( $from, $to ) );
}

/**
 * GET /reports/service-sheet?date — the pre-shift briefing for one day.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function get_service_sheet( $request ) {
	require_once DINEKIT_DIR . 'includes/reports.php';
	$date = sanitize_text_field( (string) $request->get_param( 'date' ) );
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
		$date = current_time( 'Y-m-d' );
	}
	return rest_ensure_response( \DineKit\Reports\service_sheet( $date ) );
}

/**
 * POST /guests/profile — save a diner's VIP flag, tags, notes and allergies.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_guest_profile( $request ) {
	require_once DINEKIT_DIR . 'includes/guests.php';
	$body  = (array) $request->get_json_params();
	$email = sanitize_email( (string) ( $body['email'] ?? '' ) );
	$name  = sanitize_text_field( (string) ( $body['name'] ?? '' ) );
	if ( '' === trim( $email ) && '' === trim( $name ) ) {
		return new \WP_Error( 'dinekit_guest_id', __( 'A guest email or name is required.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$profile = \DineKit\Guests\save_profile( $email, $name, $body );
	return rest_ensure_response( $profile );
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
		// Don't let a user without publish rights push an item live via the API;
		// downgrade to draft so an editor who can't publish can't publish.
		if ( 'publish' === $status && ! current_user_can( item_caps()->publish_posts ) ) {
			$status = 'draft';
		}
		$postarr['post_status'] = (string) $status;
	}
	if ( count( $postarr ) > 1 ) {
		wp_update_post( wp_slash( $postarr ) );
	}

	if ( null !== $request->get_param( 'prices' ) ) {
		update_post_meta( $post_id, 'dinekit_prices', Meta\sanitize_prices( $request->get_param( 'prices' ) ) );
	}
	if ( null !== $request->get_param( 'modifiers' ) ) {
		update_post_meta( $post_id, 'dinekit_modifiers', Meta\sanitize_modifiers( $request->get_param( 'modifiers' ) ) );
	}
	if ( null !== $request->get_param( 'badge' ) ) {
		update_post_meta( $post_id, 'dinekit_badge', sanitize_text_field( (string) $request->get_param( 'badge' ) ) );
	}
	if ( null !== $request->get_param( 'station' ) ) {
		update_post_meta( $post_id, 'dinekit_station', 'bar' === $request->get_param( 'station' ) ? 'bar' : 'kitchen' );
	}

	$taxonomy_params = array(
		'sections'  => 'dinekit_section',
		'menus'     => 'dinekit_menu',
		'dietary'   => 'dinekit_dietary',
		'allergens' => 'dinekit_allergen',
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

	// Only publish if the user can publish; otherwise the item is created as a
	// draft so no one can push content live without the publish capability.
	$status = current_user_can( 'publish_posts' ) ? 'publish' : 'draft';

	$post_id = wp_insert_post(
		array(
			'post_type'   => 'dinekit_menu_item',
			'post_status' => $status,
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
 * Clone a menu item (all fields + meta + terms). When $section_override is
 * given the clone is placed in that section only (used by section duplication);
 * otherwise it copies the source's sections and appends "(copy)" to the title.
 *
 * @param int      $src_id           Source item id.
 * @param int|null $section_override Section term id, or null.
 * @return int New item id, or 0 on failure.
 */
function clone_item( $src_id, $section_override = null ) {
	$src = get_post( $src_id );
	if ( ! $src || 'dinekit_menu_item' !== $src->post_type ) {
		return 0;
	}

	$title = ( null === $section_override )
		/* translators: %s: original dish name. */
		? sprintf( __( '%s (copy)', 'dinekit' ), $src->post_title )
		: $src->post_title;

	$new_id = wp_insert_post(
		array(
			'post_type'    => 'dinekit_menu_item',
			'post_status'  => $src->post_status,
			'post_title'   => $title,
			'post_content' => $src->post_content,
			'menu_order'   => (int) $src->menu_order + 1,
		),
		true
	);
	if ( is_wp_error( $new_id ) ) {
		return 0;
	}

	update_post_meta( $new_id, 'dinekit_prices', get_post_meta( $src_id, 'dinekit_prices', true ) );
	update_post_meta( $new_id, 'dinekit_modifiers', get_post_meta( $src_id, 'dinekit_modifiers', true ) );
	update_post_meta( $new_id, 'dinekit_badge', get_post_meta( $src_id, 'dinekit_badge', true ) );
	$thumb = get_post_thumbnail_id( $src_id );
	if ( $thumb ) {
		set_post_thumbnail( $new_id, $thumb );
	}

	foreach ( array( 'dinekit_menu', 'dinekit_dietary', 'dinekit_allergen' ) as $tax ) {
		$ids = wp_get_object_terms( $src_id, $tax, array( 'fields' => 'ids' ) );
		if ( ! is_wp_error( $ids ) ) {
			wp_set_object_terms( $new_id, array_map( 'intval', $ids ), $tax );
		}
	}

	if ( null !== $section_override ) {
		wp_set_object_terms( $new_id, array( (int) $section_override ), 'dinekit_section' );
	} else {
		$sids = wp_get_object_terms( $src_id, 'dinekit_section', array( 'fields' => 'ids' ) );
		if ( ! is_wp_error( $sids ) ) {
			wp_set_object_terms( $new_id, array_map( 'intval', $sids ), 'dinekit_section' );
		}
	}

	return (int) $new_id;
}

/**
 * POST /items/:id/duplicate — clone a dish.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function duplicate_item( $request ) {
	$new_id = clone_item( (int) $request['id'] );
	if ( ! $new_id ) {
		return new \WP_Error( 'dinekit_dup_failed', __( 'Could not duplicate the dish.', 'dinekit' ), array( 'status' => 500 ) );
	}
	return rest_ensure_response( item_response( $new_id ) );
}

/**
 * POST /sections/:id/duplicate — clone a section and its dishes.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function duplicate_section( $request ) {
	$src_id = (int) $request['id'];
	$term   = get_term( $src_id, 'dinekit_section' );
	if ( ! $term || is_wp_error( $term ) ) {
		return new \WP_Error( 'dinekit_no_section', __( 'Section not found.', 'dinekit' ), array( 'status' => 404 ) );
	}

	/* translators: %s: original section name. */
	$result = wp_insert_term( sprintf( __( '%s (copy)', 'dinekit' ), $term->name ), 'dinekit_section' );
	if ( is_wp_error( $result ) ) {
		return $result;
	}
	$new_section = (int) $result['term_id'];

	$order = get_term_meta( $src_id, 'dinekit_order', true );
	update_term_meta( $new_section, 'dinekit_order', '' !== $order ? (int) $order + 1 : 0 );

	$new_items = array();
	$members   = get_objects_in_term( $src_id, 'dinekit_section' );
	if ( is_array( $members ) ) {
		foreach ( $members as $item_id ) {
			$clone = clone_item( (int) $item_id, $new_section );
			if ( $clone ) {
				$new_items[] = item_response( $clone );
			}
		}
	}

	return rest_ensure_response(
		array(
			'section' => term_response( get_term( $new_section, 'dinekit_section' ) ),
			'items'   => $new_items,
		)
	);
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
	update_term_meta( (int) $result['term_id'], 'dinekit_order', $position );

	$term = get_term( (int) $result['term_id'], $taxonomy );
	if ( 'dinekit_menu' === $taxonomy ) {
		update_term_meta( (int) $result['term_id'], 'dinekit_menu_created', time() );
		return rest_ensure_response( menu_response( $term ) );
	}
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
 * Term arrays set dinekit_order term meta; items update menu_order.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function save_order( $request ) {
	$updated = 0;

	$term_orders = array(
		'dinekit_menu'    => $request->get_param( 'menus' ),
		'dinekit_section' => $request->get_param( 'sections' ),
	);
	if ( current_user_can( 'manage_categories' ) ) {
		foreach ( $term_orders as $taxonomy => $ids ) {
			if ( ! is_array( $ids ) ) {
				continue;
			}
			foreach ( array_values( $ids ) as $position => $term_id ) {
				$term_id = (int) $term_id;
				if ( $term_id > 0 && term_exists( $term_id, $taxonomy ) ) {
					update_term_meta( $term_id, 'dinekit_order', $position );
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
			if ( ! $post_id || 'dinekit_menu_item' !== get_post_type( $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
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
