<?php
/**
 * Booking notification emails — transactional messages to the diner and the
 * restaurant. Sent via wp_mail (respects the site's mail setup). All content
 * is escaped; these fire only in response to a booking the user made.
 *
 * @package DineKit
 */

namespace DineKit\Bookings\Emails;

use DineKit\Bookings;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Are notification emails switched on?
 *
 * @return bool
 */
function enabled() {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$s = \DineKit\Bookings\Settings\get();
	return ! empty( $s['emails_enabled'] );
}

/**
 * The staff recipient (falls back to the site admin email).
 *
 * @return string
 */
function admin_recipient() {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$s = \DineKit\Bookings\Settings\get();
	return ! empty( $s['notify_email'] ) && is_email( $s['notify_email'] )
		? $s['notify_email']
		: (string) get_option( 'admin_email' );
}

/**
 * Gather a booking's details for an email.
 *
 * @param int $id Booking id.
 * @return array<string,mixed>
 */
function booking_data( $id ) {
	$table_id = (int) get_post_meta( $id, 'dinekit_table_id', true );
	$combo_id = (int) get_post_meta( $id, 'dinekit_combo_id', true );
	$table    = $combo_id ? get_the_title( $combo_id ) : ( $table_id ? get_the_title( $table_id ) : '' );
	$date     = (string) get_post_meta( $id, 'dinekit_date', true );

	return array(
		'name'    => (string) get_post_meta( $id, 'dinekit_name', true ),
		'email'   => (string) get_post_meta( $id, 'dinekit_email', true ),
		'phone'   => (string) get_post_meta( $id, 'dinekit_phone', true ),
		'date'    => $date,
		'dateFmt' => $date ? date_i18n( (string) get_option( 'date_format', 'j M Y' ), strtotime( $date . ' 00:00:00' ) ) : '',
		'time'    => (string) get_post_meta( $id, 'dinekit_time', true ),
		'party'   => (int) get_post_meta( $id, 'dinekit_party', true ),
		'notes'   => (string) get_post_meta( $id, 'dinekit_notes', true ),
		'status'  => (string) get_post_meta( $id, 'dinekit_status', true ),
		'table'   => $table,
		'deposit' => (int) get_post_meta( $id, 'dinekit_deposit_required', true ),
	);
}

/**
 * The booking's core details as HTML (no header/lead — the branded shell adds
 * those). Facts stay intact regardless of the venue's branding + wording.
 *
 * @param array<string,mixed> $d Booking data.
 * @return string
 */
function booking_inner( $d ) {
	$rows = array(
		__( 'Name', 'dinekit' )   => $d['name'],
		__( 'Date', 'dinekit' )   => $d['dateFmt'],
		__( 'Time', 'dinekit' )   => $d['time'],
		__( 'Guests', 'dinekit' ) => (string) $d['party'],
	);
	if ( $d['table'] ) {
		$rows[ __( 'Table', 'dinekit' ) ] = $d['table'];
	}
	if ( $d['phone'] ) {
		$rows[ __( 'Phone', 'dinekit' ) ] = $d['phone'];
	}
	if ( $d['notes'] ) {
		$rows[ __( 'Notes', 'dinekit' ) ] = $d['notes'];
	}

	$html = '<table style="width:100%;border-collapse:collapse;font-size:14px">';
	foreach ( $rows as $label => $value ) {
		$html .= '<tr>' .
			'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:110px">' . esc_html( $label ) . '</td>' .
			'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">' . esc_html( $value ) . '</td>' .
			'</tr>';
	}
	$html .= '</table>';
	if ( $d['deposit'] ) {
		$html .= '<p style="font-size:13px;color:#d97706;margin:14px 0 0">' . esc_html__( 'A deposit may be required for this booking.', 'dinekit' ) . '</p>';
	}
	return $html;
}

/**
 * Template placeholders for a booking.
 *
 * @param array<string,mixed> $d Booking data.
 * @return array<string,string>
 */
function booking_vars( $d ) {
	return array(
		'name' => (string) $d['name'],
		'site' => (string) get_bloginfo( 'name' ),
		'date' => (string) ( $d['dateFmt'] ? $d['dateFmt'] : $d['date'] ),
		'time' => (string) $d['time'],
	);
}

/**
 * Notify diner + staff that a new booking has come in.
 *
 * @param int  $id           Booking id.
 * @param bool $notify_staff Also alert the restaurant (false for admin-entered).
 * @return void
 */
function new_booking( $id, $notify_staff = true ) {
	if ( ! enabled() ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/emails.php';
	$d     = booking_data( $id );
	$site  = get_bloginfo( 'name' );
	$inner = booking_inner( $d );

	// Diner.
	if ( is_email( $d['email'] ) ) {
		if ( 'provisional' === $d['status'] ) {
			/* translators: %s: guest name. */
			$intro = sprintf( __( 'Hi %s, you’re on our waitlist — we’ll be in touch if a table frees up.', 'dinekit' ), $d['name'] );
			/* translators: %s: site name. */
			$subject = sprintf( __( 'You’re on the waitlist at %s', 'dinekit' ), $site );
		} elseif ( 'confirmed' === $d['status'] ) {
			$t       = \DineKit\Emails\template( 'booking_confirmation', booking_vars( $d ) );
			$intro   = $t['intro'];
			$subject = $t['subject'];
		} else {
			/* translators: %s: guest name. */
			$intro = sprintf( __( 'Hi %s, thanks for your booking request — we’ll confirm shortly.', 'dinekit' ), $d['name'] );
			/* translators: %s: site name. */
			$subject = sprintf( __( 'Your booking request at %s', 'dinekit' ), $site );
		}
		\DineKit\Emails\send( $d['email'], $subject, $inner, $intro );
	}

	// Staff.
	if ( ! $notify_staff ) {
		return;
	}
	$subject = sprintf(
		/* translators: 1: guest name, 2: date, 3: time, 4: party size. */
		__( 'New booking: %1$s — %2$s %3$s (%4$dp)', 'dinekit' ),
		$d['name'],
		$d['dateFmt'],
		$d['time'],
		$d['party']
	);
	\DineKit\Emails\send( admin_recipient(), $subject, $inner, __( 'A new booking has come in:', 'dinekit' ) );
}

/**
 * Notify the diner when a booking is confirmed or cancelled.
 *
 * @param int    $id     Booking id.
 * @param string $status New status.
 * @return void
 */
function status_changed( $id, $status ) {
	if ( ! enabled() ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/emails.php';
	$d = booking_data( $id );
	if ( ! is_email( $d['email'] ) ) {
		return;
	}
	$inner = booking_inner( $d );

	if ( 'confirmed' === $status ) {
		$t = \DineKit\Emails\template( 'booking_confirmation', booking_vars( $d ) );
		\DineKit\Emails\send( $d['email'], $t['subject'], $inner, $t['intro'] );
	} elseif ( 'cancelled' === $status ) {
		$t = \DineKit\Emails\template( 'booking_cancelled', booking_vars( $d ) );
		\DineKit\Emails\send( $d['email'], $t['subject'], $inner, $t['intro'] );
	}
}
