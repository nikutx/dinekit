<?php
/**
 * Events REST API (dinekit/v1/events + public dinekit/v1/event/{token}).
 *
 * @package DineKit
 */

namespace DineKit\Events\Rest;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook routes.
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
 * Register routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';

	register_rest_route(
		$ns,
		'/events',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\list_events',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\create_event',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);
	register_rest_route(
		$ns,
		'/events/(?P<id>\d+)',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\get_event',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\update_event',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::DELETABLE,
				'callback'            => __NAMESPACE__ . '\\delete_event',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);
	register_rest_route(
		$ns,
		'/events/(?P<id>\d+)/guests/(?P<gid>\d+)',
		array(
			'methods'             => \WP_REST_Server::DELETABLE,
			'callback'            => __NAMESPACE__ . '\\delete_guest',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);

	// Public: view an event by token + submit a guest pre-order.
	register_rest_route(
		$ns,
		'/event/(?P<token>[a-z0-9]+)',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\public_event',
			'permission_callback' => '__return_true',
		)
	);
	register_rest_route(
		$ns,
		'/event/(?P<token>[a-z0-9]+)/guest',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\public_submit',
			'permission_callback' => '__return_true',
		)
	);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Guests of an event.
 *
 * @param int $event_id Event id.
 * @return \WP_Post[]
 */
function guests_of( $event_id ) {
	return get_posts(
		array(
			'post_type'      => 'dk_guest',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'meta_key'       => 'dk_guest_event',
			'meta_value'     => (int) $event_id,
		)
	);
}

/**
 * Serialize an event for the admin.
 *
 * @param int $id Event id.
 * @return array<string,mixed>
 */
function event_response( $id ) {
	$post  = get_post( $id );
	$token = (string) get_post_meta( $id, 'dk_event_token', true );
	return array(
		'id'         => (int) $id,
		'name'       => $post->post_title,
		'date'       => (string) get_post_meta( $id, 'dk_event_date', true ),
		'time'       => (string) get_post_meta( $id, 'dk_event_time', true ),
		'menu'       => (int) get_post_meta( $id, 'dk_event_menu', true ),
		'capacity'   => (int) get_post_meta( $id, 'dk_event_capacity', true ),
		'deadline'   => (string) get_post_meta( $id, 'dk_event_deadline', true ),
		'price'      => (int) get_post_meta( $id, 'dk_event_price', true ),
		'status'     => (string) get_post_meta( $id, 'dk_event_status', true ) ?: 'draft',
		'intro'      => (string) get_post_meta( $id, 'dk_event_intro', true ),
		'token'      => $token,
		'shareUrl'   => \DineKit\Events\events_page_url() ? add_query_arg( 'dkevent', $token, \DineKit\Events\events_page_url() ) : '',
		'guestCount' => count( guests_of( $id ) ),
	);
}

/**
 * Serialize a guest.
 *
 * @param \WP_Post $post Guest post.
 * @return array<string,mixed>
 */
function guest_response( $post ) {
	$sel = json_decode( (string) get_post_meta( $post->ID, 'dk_guest_selections', true ), true );
	$ids = static function ( $key ) use ( $post ) {
		return array_values( array_filter( array_map( 'intval', explode( ',', (string) get_post_meta( $post->ID, $key, true ) ) ) ) );
	};
	return array(
		'id'         => (int) $post->ID,
		'name'       => $post->post_title,
		'email'      => (string) get_post_meta( $post->ID, 'dk_guest_email', true ),
		'selections' => is_array( $sel ) ? $sel : array(),
		'allergens'  => $ids( 'dk_guest_allergens' ),
		'dietary'    => $ids( 'dk_guest_dietary' ),
		'notes'      => (string) get_post_meta( $post->ID, 'dk_guest_notes', true ),
	);
}

/**
 * Build the consolidated kitchen prep sheet for an event.
 *
 * @param int $event_id Event id.
 * @return array<string,mixed>
 */
function prep_sheet( $event_id ) {
	$guests      = guests_of( $event_id );
	$item_counts = array();
	$allergens   = array();

	foreach ( $guests as $g ) {
		$sel = json_decode( (string) get_post_meta( $g->ID, 'dk_guest_selections', true ), true );
		if ( is_array( $sel ) ) {
			foreach ( $sel as $item_id ) {
				$item_id = (int) $item_id;
				if ( $item_id ) {
					$item_counts[ $item_id ] = ( $item_counts[ $item_id ] ?? 0 ) + 1;
				}
			}
		}
		$aids = array_filter( array_map( 'intval', explode( ',', (string) get_post_meta( $g->ID, 'dk_guest_allergens', true ) ) ) );
		foreach ( $aids as $aid ) {
			$term = get_term( $aid, 'dk_allergen' );
			if ( $term && ! is_wp_error( $term ) ) {
				$allergens[ $aid ]['name']      = $term->name;
				$allergens[ $aid ]['guests'][]  = $g->post_title;
			}
		}
	}

	$items = array();
	foreach ( $item_counts as $item_id => $count ) {
		$items[] = array(
			'id'    => $item_id,
			'title' => wp_specialchars_decode( get_the_title( $item_id ), ENT_QUOTES ),
			'count' => $count,
		);
	}
	usort( $items, fn( $a, $b ) => $b['count'] <=> $a['count'] );

	return array(
		'totalGuests' => count( $guests ),
		'items'       => $items,
		'allergens'   => array_values( $allergens ),
	);
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * GET /events.
 *
 * @return \WP_REST_Response
 */
function list_events() {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$posts  = get_posts(
		array(
			'post_type'      => 'dk_event',
			'post_status'    => 'publish',
			'posts_per_page' => 200,
			'no_found_rows'  => true,
			'orderby'        => 'meta_value',
			'meta_key'       => 'dk_event_date', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'order'          => 'ASC',
		)
	);
	$events = array();
	foreach ( $posts as $post ) {
		$events[] = event_response( $post->ID );
	}
	return rest_ensure_response( $events );
}

/**
 * Apply event fields from a request.
 *
 * @param int              $id      Event id.
 * @param \WP_REST_Request $request Request.
 * @return void
 */
function apply_event_fields( $id, $request ) {
	if ( null !== $request->get_param( 'name' ) ) {
		wp_update_post( array( 'ID' => $id, 'post_title' => sanitize_text_field( (string) $request->get_param( 'name' ) ) ) );
	}
	$map = array(
		'date'     => array( 'dk_event_date', 'text' ),
		'time'     => array( 'dk_event_time', 'text' ),
		'deadline' => array( 'dk_event_deadline', 'text' ),
		'status'   => array( 'dk_event_status', 'text' ),
		'intro'    => array( 'dk_event_intro', 'text' ),
		'menu'     => array( 'dk_event_menu', 'int' ),
		'capacity' => array( 'dk_event_capacity', 'int' ),
		'price'    => array( 'dk_event_price', 'int' ),
	);
	foreach ( $map as $param => $conf ) {
		$value = $request->get_param( $param );
		if ( null === $value ) {
			continue;
		}
		update_post_meta( $id, $conf[0], 'int' === $conf[1] ? absint( $value ) : sanitize_text_field( (string) $value ) );
	}
}

/**
 * POST /events.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function create_event( $request ) {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	$id   = wp_insert_post(
		array(
			'post_type'   => 'dk_event',
			'post_status' => 'publish',
			'post_title'  => '' !== $name ? $name : __( 'New event', 'dinekit' ),
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return $id;
	}
	update_post_meta( $id, 'dk_event_token', \DineKit\Events\make_token() );
	update_post_meta( $id, 'dk_event_status', 'draft' );
	update_post_meta( $id, 'dk_event_capacity', 0 );
	apply_event_fields( $id, $request );
	return rest_ensure_response( event_response( $id ) );
}

/**
 * GET /events/:id — event + guests + prep sheet + its menu courses.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function get_event( $request ) {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$id       = (int) $request['id'];
	$menu     = (int) get_post_meta( $id, 'dk_event_menu', true );
	$response = event_response( $id );
	$response['courses'] = $menu ? \DineKit\Events\courses( $menu ) : array();
	$response['guests']  = array_map( __NAMESPACE__ . '\\guest_response', guests_of( $id ) );
	$response['prep']    = prep_sheet( $id );
	return rest_ensure_response( $response );
}

/**
 * PATCH /events/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function update_event( $request ) {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$id = (int) $request['id'];
	apply_event_fields( $id, $request );
	return rest_ensure_response( event_response( $id ) );
}

/**
 * DELETE /events/:id (and its guests).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_event( $request ) {
	$id = (int) $request['id'];
	foreach ( guests_of( $id ) as $g ) {
		wp_delete_post( $g->ID, true );
	}
	wp_delete_post( $id, true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/**
 * DELETE /events/:id/guests/:gid.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function delete_guest( $request ) {
	wp_delete_post( (int) $request['gid'], true );
	return rest_ensure_response( array( 'deleted' => true ) );
}

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /event/:token — public event + courses + allergen/dietary options.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function public_event( $request ) {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$event = \DineKit\Events\event_by_token( (string) $request['token'] );
	if ( ! $event || 'published' !== get_post_meta( $event->ID, 'dk_event_status', true ) ) {
		return new \WP_Error( 'dinekit_event_missing', __( 'Event not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$menu     = (int) get_post_meta( $event->ID, 'dk_event_menu', true );
	$deadline = (string) get_post_meta( $event->ID, 'dk_event_deadline', true );

	return rest_ensure_response(
		array(
			'name'     => $event->post_title,
			'date'     => (string) get_post_meta( $event->ID, 'dk_event_date', true ),
			'time'     => (string) get_post_meta( $event->ID, 'dk_event_time', true ),
			'intro'    => (string) get_post_meta( $event->ID, 'dk_event_intro', true ),
			'deadline' => $deadline,
			'closed'   => deadline_passed( $deadline ) || full( $event->ID ),
			'courses'  => $menu ? \DineKit\Events\courses( $menu ) : array(),
			'allergens' => taxonomy_options( 'dk_allergen' ),
			'dietary'   => taxonomy_options( 'dk_dietary' ),
		)
	);
}

/**
 * Has an event's order deadline passed?
 *
 * @param string $deadline Y-m-d.
 * @return bool
 */
function deadline_passed( $deadline ) {
	if ( '' === $deadline ) {
		return false;
	}
	return strtotime( $deadline . ' 23:59:59' ) < (int) current_time( 'timestamp' );
}

/**
 * Is an event at capacity?
 *
 * @param int $event_id Event id.
 * @return bool
 */
function full( $event_id ) {
	$cap = (int) get_post_meta( $event_id, 'dk_event_capacity', true );
	return $cap > 0 && count( guests_of( $event_id ) ) >= $cap;
}

/**
 * Simple {id,name} list for a taxonomy.
 *
 * @param string $taxonomy Taxonomy.
 * @return array<int,array<string,mixed>>
 */
function taxonomy_options( $taxonomy ) {
	$terms = get_terms( array( 'taxonomy' => $taxonomy, 'hide_empty' => false ) );
	$out   = array();
	if ( is_array( $terms ) ) {
		foreach ( $terms as $t ) {
			$out[] = array( 'id' => (int) $t->term_id, 'name' => $t->name );
		}
	}
	return $out;
}

/**
 * POST /event/:token/guest — a guest submits their pre-order.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function public_submit( $request ) {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$event = \DineKit\Events\event_by_token( (string) $request['token'] );
	if ( ! $event || 'published' !== get_post_meta( $event->ID, 'dk_event_status', true ) ) {
		return new \WP_Error( 'dinekit_event_missing', __( 'Event not found.', 'dinekit' ), array( 'status' => 404 ) );
	}

	// Honeypot.
	if ( '' !== trim( (string) $request->get_param( 'hp' ) ) ) {
		return rest_ensure_response( array( 'ok' => true ) );
	}
	// Rate limit per IP.
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'na';
	$rl   = 'dinekit_guest_rl_' . md5( $ip );
	$hits = (int) get_transient( $rl );
	if ( $hits >= 15 ) {
		return new \WP_Error( 'dinekit_guest_rl', __( 'Too many attempts — please try again later.', 'dinekit' ), array( 'status' => 429 ) );
	}
	set_transient( $rl, $hits + 1, HOUR_IN_SECONDS );

	$deadline = (string) get_post_meta( $event->ID, 'dk_event_deadline', true );
	if ( deadline_passed( $deadline ) || full( $event->ID ) ) {
		return new \WP_Error( 'dinekit_event_closed', __( 'Sorry, this event is closed for orders.', 'dinekit' ), array( 'status' => 409 ) );
	}

	$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
	if ( '' === $name ) {
		return new \WP_Error( 'dinekit_guest_name', __( 'Please enter your name.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$sel_in = (array) $request->get_param( 'selections' );
	$sel    = array();
	foreach ( $sel_in as $section => $item ) {
		$sel[ (int) $section ] = (int) $item;
	}
	$to_ids = static function ( $value ) {
		return implode( ',', array_filter( array_map( 'absint', (array) $value ) ) );
	};

	$gid = wp_insert_post(
		array(
			'post_type'   => 'dk_guest',
			'post_status' => 'publish',
			'post_title'  => $name,
		),
		true
	);
	if ( is_wp_error( $gid ) ) {
		return new \WP_Error( 'dinekit_guest_save', __( 'Could not save your choices. Please try again.', 'dinekit' ), array( 'status' => 500 ) );
	}

	update_post_meta( $gid, 'dk_guest_event', (int) $event->ID );
	update_post_meta( $gid, 'dk_guest_email', sanitize_email( (string) $request->get_param( 'email' ) ) );
	update_post_meta( $gid, 'dk_guest_selections', wp_json_encode( $sel ) );
	update_post_meta( $gid, 'dk_guest_allergens', $to_ids( $request->get_param( 'allergens' ) ) );
	update_post_meta( $gid, 'dk_guest_dietary', $to_ids( $request->get_param( 'dietary' ) ) );
	update_post_meta( $gid, 'dk_guest_notes', sanitize_textarea_field( (string) $request->get_param( 'notes' ) ) );

	return rest_ensure_response(
		array(
			'ok'      => true,
			'message' => __( 'Thanks! Your choices are in.', 'dinekit' ),
		)
	);
}
