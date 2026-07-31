<?php
/**
 * GDPR / privacy integration — personal-data exporters and erasers for every
 * place DineKit stores diner or member PII (bookings, orders, event guests,
 * loyalty members, guest profiles, staff records), plus suggested privacy-
 * policy text.
 *
 * Erasure honours the data-integrity hard rule: bookings and orders are never
 * hard-deleted — their personal fields are anonymised in place so financial
 * and capacity records survive without identifying anyone.
 *
 * @package DineKit
 */

namespace DineKit\Privacy;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const PER_PAGE = 50;

/**
 * Hook everything up.
 *
 * @return void
 */
function init() {
	add_filter( 'wp_privacy_personal_data_exporters', __NAMESPACE__ . '\\register_exporters' );
	add_filter( 'wp_privacy_personal_data_erasers', __NAMESPACE__ . '\\register_erasers' );
	add_action( 'admin_init', __NAMESPACE__ . '\\add_policy_content' );
}

/**
 * Register one exporter per data store.
 *
 * @param array<string,array<string,mixed>> $exporters Registered exporters.
 * @return array<string,array<string,mixed>>
 */
function register_exporters( $exporters ) {
	$exporters['dinekit-bookings']      = array(
		'exporter_friendly_name' => __( 'DineKit bookings', 'dinekit' ),
		'callback'               => __NAMESPACE__ . '\\export_bookings',
	);
	$exporters['dinekit-orders']        = array(
		'exporter_friendly_name' => __( 'DineKit orders', 'dinekit' ),
		'callback'               => __NAMESPACE__ . '\\export_orders',
	);
	$exporters['dinekit-event-guests']  = array(
		'exporter_friendly_name' => __( 'DineKit event guests', 'dinekit' ),
		'callback'               => __NAMESPACE__ . '\\export_event_guests',
	);
	$exporters['dinekit-loyalty']       = array(
		'exporter_friendly_name' => __( 'DineKit loyalty members', 'dinekit' ),
		'callback'               => __NAMESPACE__ . '\\export_members',
	);
	$exporters['dinekit-guest-profile'] = array(
		'exporter_friendly_name' => __( 'DineKit guest profile', 'dinekit' ),
		'callback'               => __NAMESPACE__ . '\\export_guest_profile',
	);
	$exporters['dinekit-staff']         = array(
		'exporter_friendly_name' => __( 'DineKit staff records', 'dinekit' ),
		'callback'               => __NAMESPACE__ . '\\export_staff',
	);
	return $exporters;
}

/**
 * Register one eraser per data store.
 *
 * @param array<string,array<string,mixed>> $erasers Registered erasers.
 * @return array<string,array<string,mixed>>
 */
function register_erasers( $erasers ) {
	$erasers['dinekit-bookings']      = array(
		'eraser_friendly_name' => __( 'DineKit bookings', 'dinekit' ),
		'callback'             => __NAMESPACE__ . '\\erase_bookings',
	);
	$erasers['dinekit-orders']        = array(
		'eraser_friendly_name' => __( 'DineKit orders', 'dinekit' ),
		'callback'             => __NAMESPACE__ . '\\erase_orders',
	);
	$erasers['dinekit-event-guests']  = array(
		'eraser_friendly_name' => __( 'DineKit event guests', 'dinekit' ),
		'callback'             => __NAMESPACE__ . '\\erase_event_guests',
	);
	$erasers['dinekit-loyalty']       = array(
		'eraser_friendly_name' => __( 'DineKit loyalty members', 'dinekit' ),
		'callback'             => __NAMESPACE__ . '\\erase_members',
	);
	$erasers['dinekit-guest-profile'] = array(
		'eraser_friendly_name' => __( 'DineKit guest profile', 'dinekit' ),
		'callback'             => __NAMESPACE__ . '\\erase_guest_profile',
	);
	$erasers['dinekit-staff']         = array(
		'eraser_friendly_name' => __( 'DineKit staff records', 'dinekit' ),
		'callback'             => __NAMESPACE__ . '\\erase_staff',
	);
	return $erasers;
}

/**
 * Page of post ids of a type whose email meta matches the requester.
 *
 * @param string $post_type Post type.
 * @param string $meta_key  Email meta key.
 * @param string $email     Requester email.
 * @param int    $page      1-based page.
 * @return int[]
 */
function find_ids( $post_type, $meta_key, $email, $page ) {
	$query = new \WP_Query(
		array(
			'post_type'      => $post_type,
			'post_status'    => 'any',
			'posts_per_page' => PER_PAGE,
			'paged'          => max( 1, (int) $page ),
			'fields'         => 'ids',
			'orderby'        => 'ID',
			'order'          => 'ASC',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- Privacy requests are rare, admin-initiated background jobs.
				array(
					'key'   => $meta_key,
					'value' => $email,
				),
			),
		)
	);
	return array_map( 'intval', $query->posts );
}

/**
 * Helper — one export item row.
 *
 * @param string $name  Field label.
 * @param mixed  $value Field value.
 * @return array<string,string>
 */
function row( $name, $value ) {
	return array(
		'name'  => $name,
		'value' => (string) $value,
	);
}

/**
 * Exporter — bookings (incl. waitlist and archived).
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function export_bookings( $email, $page = 1 ) {
	$ids  = find_ids( 'dinekit_booking', 'dinekit_email', $email, $page );
	$data = array();
	foreach ( $ids as $id ) {
		$items  = array(
			row( __( 'Name', 'dinekit' ), get_post_meta( $id, 'dinekit_name', true ) ),
			row( __( 'Email', 'dinekit' ), get_post_meta( $id, 'dinekit_email', true ) ),
			row( __( 'Phone', 'dinekit' ), get_post_meta( $id, 'dinekit_phone', true ) ),
			row( __( 'Date', 'dinekit' ), get_post_meta( $id, 'dinekit_date', true ) ),
			row( __( 'Time', 'dinekit' ), get_post_meta( $id, 'dinekit_time', true ) ),
			row( __( 'Party size', 'dinekit' ), get_post_meta( $id, 'dinekit_party', true ) ),
			row( __( 'Status', 'dinekit' ), get_post_meta( $id, 'dinekit_status', true ) ),
			row( __( 'Notes', 'dinekit' ), get_post_meta( $id, 'dinekit_notes', true ) ),
			row( __( 'Allergies / dietary', 'dinekit' ), get_post_meta( $id, 'dinekit_guest_allergens', true ) ),
		);
		$data[] = array(
			'group_id'    => 'dinekit-bookings',
			'group_label' => __( 'Restaurant bookings', 'dinekit' ),
			'item_id'     => 'dinekit-booking-' . $id,
			'data'        => array_values( array_filter( $items, __NAMESPACE__ . '\\has_value' ) ),
		);
	}
	return array(
		'data' => $data,
		'done' => count( $ids ) < PER_PAGE,
	);
}

/**
 * Exporter — orders.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function export_orders( $email, $page = 1 ) {
	$ids  = find_ids( 'dinekit_order', 'dinekit_order_email', $email, $page );
	$data = array();
	foreach ( $ids as $id ) {
		$items  = array(
			row( __( 'Order number', 'dinekit' ), get_post_meta( $id, 'dinekit_order_number', true ) ),
			row( __( 'Placed', 'dinekit' ), get_post( $id ) ? get_post( $id )->post_date : '' ),
			row( __( 'Name', 'dinekit' ), get_post_meta( $id, 'dinekit_order_name', true ) ),
			row( __( 'Email', 'dinekit' ), get_post_meta( $id, 'dinekit_order_email', true ) ),
			row( __( 'Phone', 'dinekit' ), get_post_meta( $id, 'dinekit_order_phone', true ) ),
			row( __( 'Delivery address', 'dinekit' ), get_post_meta( $id, 'dinekit_order_address', true ) ),
			row( __( 'Notes', 'dinekit' ), get_post_meta( $id, 'dinekit_order_notes', true ) ),
			row( __( 'Fulfilment', 'dinekit' ), get_post_meta( $id, 'dinekit_order_fulfilment', true ) ),
			row( __( 'Status', 'dinekit' ), get_post_meta( $id, 'dinekit_order_status', true ) ),
			row( __( 'Emails sent to you', 'dinekit' ), email_log_summary( $id ) ),
		);
		$data[] = array(
			'group_id'    => 'dinekit-orders',
			'group_label' => __( 'Restaurant orders', 'dinekit' ),
			'item_id'     => 'dinekit-order-' . $id,
			'data'        => array_values( array_filter( $items, __NAMESPACE__ . '\\has_value' ) ),
		);
	}
	return array(
		'data' => $data,
		'done' => count( $ids ) < PER_PAGE,
	);
}

/**
 * Exporter — event guests.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function export_event_guests( $email, $page = 1 ) {
	$ids  = find_ids( 'dinekit_guest', 'dinekit_guest_email', $email, $page );
	$data = array();
	foreach ( $ids as $id ) {
		$selections = get_post_meta( $id, 'dinekit_guest_selections', true );
		$items      = array(
			row( __( 'Name', 'dinekit' ), get_post_meta( $id, 'dinekit_guest_name', true ) ),
			row( __( 'Email', 'dinekit' ), get_post_meta( $id, 'dinekit_guest_email', true ) ),
			row( __( 'Notes', 'dinekit' ), get_post_meta( $id, 'dinekit_guest_notes', true ) ),
			row( __( 'Allergies', 'dinekit' ), get_post_meta( $id, 'dinekit_guest_allergens', true ) ),
			row( __( 'Dietary', 'dinekit' ), get_post_meta( $id, 'dinekit_guest_dietary', true ) ),
			row( __( 'Menu selections', 'dinekit' ), is_string( $selections ) ? $selections : wp_json_encode( $selections ) ),
		);
		$data[]     = array(
			'group_id'    => 'dinekit-event-guests',
			'group_label' => __( 'Event guest records', 'dinekit' ),
			'item_id'     => 'dinekit-guest-' . $id,
			'data'        => array_values( array_filter( $items, __NAMESPACE__ . '\\has_value' ) ),
		);
	}
	return array(
		'data' => $data,
		'done' => count( $ids ) < PER_PAGE,
	);
}

/**
 * Exporter — loyalty members.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function export_members( $email, $page = 1 ) {
	$ids  = find_ids( 'dinekit_member', 'dinekit_member_email', $email, $page );
	$data = array();
	foreach ( $ids as $id ) {
		$post   = get_post( $id );
		$items  = array(
			row( __( 'Name', 'dinekit' ), $post ? $post->post_title : '' ),
			row( __( 'Email', 'dinekit' ), get_post_meta( $id, 'dinekit_member_email', true ) ),
			row( __( 'Phone', 'dinekit' ), get_post_meta( $id, 'dinekit_member_phone', true ) ),
			row( __( 'Loyalty points', 'dinekit' ), get_post_meta( $id, 'dinekit_member_points', true ) ),
		);
		$data[] = array(
			'group_id'    => 'dinekit-loyalty',
			'group_label' => __( 'Loyalty membership', 'dinekit' ),
			'item_id'     => 'dinekit-member-' . $id,
			'data'        => array_values( array_filter( $items, __NAMESPACE__ . '\\has_value' ) ),
		);
	}
	return array(
		'data' => $data,
		'done' => count( $ids ) < PER_PAGE,
	);
}

/**
 * Exporter — the persistent guest profile (VIP flag, tags, service notes,
 * allergies) stored in the dinekit_guest_profiles option.
 *
 * @param string $email Requester email.
 * @return array<string,mixed>
 */
function export_guest_profile( $email ) {
	$data = array();
	require_once DINEKIT_DIR . 'includes/guests.php';
	if ( function_exists( 'DineKit\\Guests\\get_profile' ) ) {
		$profile  = \DineKit\Guests\get_profile( $email, '' );
		$is_empty = empty( $profile['vip'] ) && empty( $profile['tags'] ) && '' === $profile['notes'] && '' === $profile['allergens'];
		if ( ! $is_empty ) {
			$data[] = array(
				'group_id'    => 'dinekit-guest-profile',
				'group_label' => __( 'Guest profile', 'dinekit' ),
				'item_id'     => 'dinekit-guest-profile',
				'data'        => array_values(
					array_filter(
						array(
							row( __( 'VIP', 'dinekit' ), $profile['vip'] ? __( 'Yes', 'dinekit' ) : '' ),
							row( __( 'Tags', 'dinekit' ), implode( ', ', $profile['tags'] ) ),
							row( __( 'Service notes', 'dinekit' ), $profile['notes'] ),
							row( __( 'Allergies', 'dinekit' ), $profile['allergens'] ),
						),
						__NAMESPACE__ . '\\has_value'
					)
				),
			);
		}
	}
	return array(
		'data' => $data,
		'done' => true,
	);
}

/**
 * Exporter — staff records (employment data held about the requester).
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function export_staff( $email, $page = 1 ) {
	$ids  = find_ids( 'dinekit_staff', 'dinekit_email', $email, $page );
	$data = array();
	foreach ( $ids as $id ) {
		$post   = get_post( $id );
		$items  = array(
			row( __( 'Name', 'dinekit' ), $post ? $post->post_title : '' ),
			row( __( 'Email', 'dinekit' ), get_post_meta( $id, 'dinekit_email', true ) ),
			row( __( 'Phone', 'dinekit' ), get_post_meta( $id, 'dinekit_phone', true ) ),
			row( __( 'Role', 'dinekit' ), get_post_meta( $id, 'dinekit_role', true ) ),
		);
		$data[] = array(
			'group_id'    => 'dinekit-staff',
			'group_label' => __( 'Staff record', 'dinekit' ),
			'item_id'     => 'dinekit-staff-' . $id,
			'data'        => array_values( array_filter( $items, __NAMESPACE__ . '\\has_value' ) ),
		);
	}
	return array(
		'data' => $data,
		'done' => count( $ids ) < PER_PAGE,
	);
}

/**
 * Eraser — bookings. Anonymises personal fields in place; the booking itself
 * (date, party size, status) is retained for capacity records.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function erase_bookings( $email, $page = 1 ) {
	$ids = find_ids( 'dinekit_booking', 'dinekit_email', $email, $page );
	foreach ( $ids as $id ) {
		update_post_meta( $id, 'dinekit_name', wp_privacy_anonymize_data( 'text', (string) get_post_meta( $id, 'dinekit_name', true ) ) );
		update_post_meta( $id, 'dinekit_email', '' );
		update_post_meta( $id, 'dinekit_phone', '' );
		update_post_meta( $id, 'dinekit_notes', '' );
		update_post_meta( $id, 'dinekit_guest_allergens', '' );
	}
	return array(
		'items_removed'  => count( $ids ),
		'items_retained' => 0,
		'messages'       => count( $ids ) < PER_PAGE && $ids
			? array( __( 'Booking records were kept for capacity history, with all personal details removed.', 'dinekit' ) )
			: array(),
		'done'           => count( $ids ) < PER_PAGE,
	);
}

/**
 * Eraser — orders. Anonymises personal fields; financial records (items,
 * totals, payments) are retained without identifiers, per the data-integrity
 * rule and standard accounting-retention practice.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function erase_orders( $email, $page = 1 ) {
	$ids = find_ids( 'dinekit_order', 'dinekit_order_email', $email, $page );
	foreach ( $ids as $id ) {
		update_post_meta( $id, 'dinekit_order_name', wp_privacy_anonymize_data( 'text', (string) get_post_meta( $id, 'dinekit_order_name', true ) ) );
		update_post_meta( $id, 'dinekit_order_email', '' );
		update_post_meta( $id, 'dinekit_order_phone', '' );
		update_post_meta( $id, 'dinekit_order_address', '' );
		update_post_meta( $id, 'dinekit_order_notes', '' );
		// Strip the recipient address out of the email send log.
		$log = json_decode( (string) get_post_meta( $id, 'dinekit_order_email_log', true ), true );
		if ( is_array( $log ) ) {
			foreach ( $log as $i => $entry ) {
				if ( isset( $entry['to'] ) ) {
					$log[ $i ]['to'] = wp_privacy_anonymize_data( 'email', (string) $entry['to'] );
				}
			}
			update_post_meta( $id, 'dinekit_order_email_log', wp_json_encode( $log ) );
		}
	}
	return array(
		'items_removed'  => count( $ids ),
		'items_retained' => 0,
		'messages'       => count( $ids ) < PER_PAGE && $ids
			? array( __( 'Order financial records (items, totals, payments) were kept for accounting, with all personal details removed.', 'dinekit' ) )
			: array(),
		'done'           => count( $ids ) < PER_PAGE,
	);
}

/**
 * Eraser — event guests. Identity and health data are removed; the seat and
 * its menu selections stay so event catering counts remain correct.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function erase_event_guests( $email, $page = 1 ) {
	$ids = find_ids( 'dinekit_guest', 'dinekit_guest_email', $email, $page );
	foreach ( $ids as $id ) {
		update_post_meta( $id, 'dinekit_guest_name', wp_privacy_anonymize_data( 'text', (string) get_post_meta( $id, 'dinekit_guest_name', true ) ) );
		update_post_meta( $id, 'dinekit_guest_email', '' );
		update_post_meta( $id, 'dinekit_guest_notes', '' );
		update_post_meta( $id, 'dinekit_guest_allergens', '' );
		update_post_meta( $id, 'dinekit_guest_dietary', '' );
	}
	return array(
		'items_removed'  => count( $ids ),
		'items_retained' => 0,
		'messages'       => array(),
		'done'           => count( $ids ) < PER_PAGE,
	);
}

/**
 * Eraser — loyalty members. Erasing identity closes the membership; the
 * points balance is meaningless without it.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function erase_members( $email, $page = 1 ) {
	$ids = find_ids( 'dinekit_member', 'dinekit_member_email', $email, $page );
	foreach ( $ids as $id ) {
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => wp_privacy_anonymize_data( 'text', get_the_title( $id ) ),
			)
		);
		update_post_meta( $id, 'dinekit_member_email', '' );
		update_post_meta( $id, 'dinekit_member_phone', '' );
	}
	return array(
		'items_removed'  => count( $ids ),
		'items_retained' => 0,
		'messages'       => array(),
		'done'           => count( $ids ) < PER_PAGE,
	);
}

/**
 * Eraser — guest profile option entry.
 *
 * @param string $email Requester email.
 * @return array<string,mixed>
 */
function erase_guest_profile( $email ) {
	$removed = 0;
	require_once DINEKIT_DIR . 'includes/guests.php';
	if ( function_exists( 'DineKit\\Guests\\key' ) ) {
		$all = \DineKit\Guests\all();
		$k   = \DineKit\Guests\key( $email, '' );
		if ( isset( $all[ $k ] ) ) {
			unset( $all[ $k ] );
			update_option( 'dinekit_guest_profiles', $all, false );
			$removed = 1;
		}
	}
	return array(
		'items_removed'  => $removed,
		'items_retained' => 0,
		'messages'       => array(),
		'done'           => true,
	);
}

/**
 * Eraser — staff records are employment records with statutory retention
 * duties, so they are flagged as retained rather than silently wiped; the
 * restaurant removes staff via the Staff screen when appropriate.
 *
 * @param string $email Requester email.
 * @param int    $page  Page.
 * @return array<string,mixed>
 */
function erase_staff( $email, $page = 1 ) {
	$ids = find_ids( 'dinekit_staff', 'dinekit_email', $email, $page );
	return array(
		'items_removed'  => 0,
		'items_retained' => count( $ids ),
		'messages'       => $ids
			? array( __( 'Staff employment records are retained for statutory purposes. An administrator can archive or remove them from the Staff screen.', 'dinekit' ) )
			: array(),
		'done'           => count( $ids ) < PER_PAGE,
	);
}

/**
 * Suggested privacy-policy text (Settings → Privacy → Policy Guide).
 *
 * @return void
 */
function add_policy_content() {
	if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
		return;
	}
	$content =
		'<p>' . __( 'When you book a table, place an order, join an event or our loyalty scheme, we store the details you give us — your name, contact details, party size, delivery address, dietary requirements and allergies, and any notes — on this website so we can provide the service you asked for.', 'dinekit' ) . '</p>' .
		'<p>' . __( 'Allergy and dietary information is stored so the kitchen can prepare your food safely.', 'dinekit' ) . '</p>' .
		'<p>' . __( 'If card payments are enabled, they are processed by Stripe; your card details never touch this website. See the Stripe privacy policy for how Stripe handles payment data.', 'dinekit' ) . '</p>' .
		'<p>' . __( 'This data stays on this website and is not sent anywhere else. On an erasure request, personal details are removed from bookings and orders while anonymised financial records are kept for accounting.', 'dinekit' ) . '</p>';
	wp_add_privacy_policy_content( 'DineKit', wp_kses_post( $content ) );
}

/**
 * Keep only rows that actually have a value.
 *
 * @param array<string,string> $item Row.
 * @return bool
 */
function has_value( $item ) {
	return '' !== trim( (string) $item['value'] );
}

/**
 * Human summary of the order email log for export.
 *
 * @param int $order_id Order id.
 * @return string
 */
function email_log_summary( $order_id ) {
	$log = json_decode( (string) get_post_meta( $order_id, 'dinekit_order_email_log', true ), true );
	if ( ! is_array( $log ) || ! $log ) {
		return '';
	}
	$lines = array();
	foreach ( $log as $entry ) {
		$lines[] = trim(
			sprintf(
				'%s %s → %s',
				isset( $entry['t'] ) ? (string) $entry['t'] : '',
				isset( $entry['type'] ) ? (string) $entry['type'] : '',
				isset( $entry['to'] ) ? (string) $entry['to'] : ''
			)
		);
	}
	return implode( '; ', $lines );
}
