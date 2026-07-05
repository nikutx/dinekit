<?php
/**
 * QR order-at-table — a guest scans a per-table QR, orders on their phone, and
 * the round joins that table's open dine-in tab and auto-fires to the kitchen
 * (shows on the POS + Orders board). Reuses the order page in "table mode".
 * Pay model is a setting (add-to-tab vs pay-upfront, see ordering settings).
 *
 * @package DineKit
 */

namespace DineKit\TableOrder;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boot: REST routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Ensure a table has a QR-order token; returns it.
 *
 * @param int $table_id Table id.
 * @return string
 */
function ensure_token( $table_id ) {
	$token = (string) get_post_meta( $table_id, 'dinekit_table_token', true );
	if ( '' === $token ) {
		$token = wp_generate_password( 16, false );
		update_post_meta( $table_id, 'dinekit_table_token', $token );
	}
	return $token;
}

/**
 * Find a table id by its QR token.
 *
 * @param string $token Token.
 * @return int 0 if not found.
 */
function table_by_token( $token ) {
	if ( '' === $token ) {
		return 0;
	}
	$ids = get_posts(
		array(
			'post_type'      => 'dinekit_table',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_key'       => 'dinekit_table_token', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $token, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	return $ids ? (int) $ids[0] : 0;
}

/**
 * The public order-page URL for a table (order page + ?dinekit_table=token), or
 * '' if no ordering page exists yet.
 *
 * @param int $table_id Table id.
 * @return string
 */
function table_url( $table_id ) {
	require_once DINEKIT_DIR . 'includes/sample.php';
	$page = \DineKit\Sample\find_page( 'order' );
	if ( empty( $page['url'] ) ) {
		return '';
	}
	return add_query_arg( 'dinekit_table', ensure_token( $table_id ), $page['url'] );
}

/**
 * The table's current open dine-in tab, or 0.
 *
 * @param int $table_id Table id.
 * @return int
 */
function open_tab( $table_id ) {
	$ids = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 20,
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'orderby'        => 'date',
			'order'          => 'DESC',
			'meta_key'       => 'dinekit_order_table_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => (int) $table_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	foreach ( $ids as $oid ) {
		if ( 'dine_in' !== get_post_meta( $oid, 'dinekit_order_channel', true ) ) {
			continue;
		}
		if ( '1' === (string) get_post_meta( $oid, 'dinekit_order_archived', true ) ) {
			continue;
		}
		$st = (string) get_post_meta( $oid, 'dinekit_order_status', true );
		if ( in_array( $st, array( 'open', 'sent', 'preparing', 'served', 'bill' ), true ) ) {
			return (int) $oid;
		}
	}
	return 0;
}

/**
 * Register routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';
	// Public: place a table QR order.
	register_rest_route(
		$ns,
		'/table-order/(?P<token>[A-Za-z0-9]+)',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_place',
			'permission_callback' => '__return_true',
		)
	);
	// Staff: list per-table QR order links (ensures tokens).
	register_rest_route(
		$ns,
		'/pos/table-qr',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_links',
			'permission_callback' => function () {
				require_once DINEKIT_DIR . 'includes/access.php';
				return \DineKit\Access\can( 'orders' );
			},
		)
	);
}

/**
 * POST /table-order/:token — add a round to the table's tab and fire it.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_place( $request ) {
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	$table_id = table_by_token( (string) $request['token'] );
	if ( ! $table_id ) {
		return new \WP_Error( 'dinekit_table_404', __( 'This table code is not valid.', 'dinekit' ), array( 'status' => 404 ) );
	}

	// Light per-IP rate limit against spam (physical QR, so generous).
	$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$key = 'dinekit_tqr_' . md5( $ip . '|' . $table_id );
	$n   = (int) get_transient( $key );
	if ( $n > 40 ) {
		return new \WP_Error( 'dinekit_table_rate', __( 'Too many orders — please ask a member of staff.', 'dinekit' ), array( 'status' => 429 ) );
	}
	set_transient( $key, $n + 1, HOUR_IN_SECONDS );

	$computed = \DineKit\Ordering\recompute( (array) $request->get_param( 'items' ) );
	if ( empty( $computed['items'] ) ) {
		return new \WP_Error( 'dinekit_table_empty', __( 'Please choose at least one item.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$now  = current_time( 'c' );
	$name = get_the_title( $table_id );
	$oid  = open_tab( $table_id );
	if ( ! $oid ) {
		$number = \DineKit\Ordering\next_number();
		$oid    = wp_insert_post(
			array(
				'post_type'   => 'dinekit_order',
				'post_status' => 'publish',
				/* translators: %d: order number. */
				'post_title'  => sprintf( __( 'Order #%d', 'dinekit' ), $number ),
			),
			true
		);
		if ( is_wp_error( $oid ) ) {
			return new \WP_Error( 'dinekit_table_save', __( 'Could not start the order.', 'dinekit' ), array( 'status' => 500 ) );
		}
		update_post_meta( $oid, 'dinekit_order_number', $number );
		update_post_meta( $oid, 'dinekit_order_channel', 'dine_in' );
		update_post_meta( $oid, 'dinekit_order_table_id', $table_id );
		update_post_meta( $oid, 'dinekit_order_source', 'qr' );
		/* translators: %s: table name. */
		update_post_meta( $oid, 'dinekit_order_name', sprintf( __( 'Table %s', 'dinekit' ), $name ) );
	}

	// Append the new lines, marked fired (auto-fire to the kitchen).
	$existing = json_decode( (string) get_post_meta( $oid, 'dinekit_order_items', true ), true );
	$existing = is_array( $existing ) ? $existing : array();
	foreach ( $computed['items'] as $line ) {
		$line['fired']   = true;
		$line['firedAt'] = $now;
		$existing[]      = $line;
	}
	$total = 0.0;
	foreach ( $existing as $li ) {
		$total += (float) $li['lineTotal'];
	}
	update_post_meta( $oid, 'dinekit_order_items', wp_json_encode( $existing ) );
	update_post_meta( $oid, 'dinekit_order_total', number_format( $total, 2, '.', '' ) );
	update_post_meta( $oid, 'dinekit_order_status', 'sent' );
	$count = count( $computed['items'] );
	/* translators: %d: number of items. */
	\DineKit\Ordering\log_event( $oid, sprintf( _n( 'Guest ordered %d item at the table (QR)', 'Guest ordered %d items at the table (QR)', $count, 'dinekit' ), $count ) );

	// Fire a kitchen ticket if an email printer is configured.
	$settings = \DineKit\Ordering\get_settings();
	if ( ! empty( $settings['printer_email'] ) ) {
		require_once DINEKIT_DIR . 'includes/ordering/emails.php';
		\DineKit\Ordering\Emails\printer_ticket( $oid );
	}

	return rest_ensure_response(
		array(
			'ok'     => true,
			'table'  => $name,
			'number' => (int) get_post_meta( $oid, 'dinekit_order_number', true ),
		)
	);
}

/**
 * GET /pos/table-qr — per-table order links for printing QR codes.
 *
 * @return \WP_REST_Response
 */
function rest_links() {
	$ids = get_posts(
		array(
			'post_type'      => 'dinekit_table',
			'post_status'    => 'publish',
			'posts_per_page' => 200,
			'no_found_rows'  => true,
			'orderby'        => 'menu_order title',
			'order'          => 'ASC',
			'fields'         => 'ids',
		)
	);
	$out = array();
	foreach ( $ids as $tid ) {
		$out[] = array(
			'id'   => (int) $tid,
			'name' => get_the_title( $tid ),
			'url'  => table_url( $tid ),
		);
	}
	return rest_ensure_response( $out );
}
