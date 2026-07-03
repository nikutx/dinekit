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
	$table_id = (int) get_post_meta( $id, 'dk_table_id', true );
	$combo_id = (int) get_post_meta( $id, 'dk_combo_id', true );
	$table    = $combo_id ? get_the_title( $combo_id ) : ( $table_id ? get_the_title( $table_id ) : '' );
	$date     = (string) get_post_meta( $id, 'dk_date', true );

	return array(
		'name'    => (string) get_post_meta( $id, 'dk_name', true ),
		'email'   => (string) get_post_meta( $id, 'dk_email', true ),
		'phone'   => (string) get_post_meta( $id, 'dk_phone', true ),
		'date'    => $date,
		'dateFmt' => $date ? date_i18n( (string) get_option( 'date_format', 'j M Y' ), strtotime( $date . ' 00:00:00' ) ) : '',
		'time'    => (string) get_post_meta( $id, 'dk_time', true ),
		'party'   => (int) get_post_meta( $id, 'dk_party', true ),
		'notes'   => (string) get_post_meta( $id, 'dk_notes', true ),
		'status'  => (string) get_post_meta( $id, 'dk_status', true ),
		'table'   => $table,
		'deposit' => (int) get_post_meta( $id, 'dk_deposit_required', true ),
	);
}

/**
 * Build a simple, inline-styled HTML email body.
 *
 * @param string              $lead Opening line.
 * @param array<string,mixed> $d    Booking data.
 * @param string              $foot Closing note (optional).
 * @return string
 */
function render( $lead, $d, $foot = '' ) {
	$site = get_bloginfo( 'name' );
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

	$html  = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">';
	$html .= '<h2 style="font-size:20px;margin:0 0 4px">' . esc_html( $site ) . '</h2>';
	$html .= '<p style="font-size:15px;color:#334155;margin:0 0 16px">' . esc_html( $lead ) . '</p>';
	$html .= '<table style="width:100%;border-collapse:collapse;font-size:14px">';
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
	if ( $foot ) {
		$html .= '<p style="font-size:13px;color:#64748b;margin:16px 0 0">' . esc_html( $foot ) . '</p>';
	}
	$html .= '</div>';
	return $html;
}

/**
 * Send an HTML email.
 *
 * @param string $to      Recipient.
 * @param string $subject Subject.
 * @param string $body    HTML body.
 * @return void
 */
function send( $to, $subject, $body ) {
	if ( ! is_email( $to ) ) {
		return;
	}
	wp_mail( $to, $subject, $body, array( 'Content-Type: text/html; charset=UTF-8' ) );
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
	$d    = booking_data( $id );
	$site = get_bloginfo( 'name' );

	// Diner.
	if ( is_email( $d['email'] ) ) {
		$confirmed = 'confirmed' === $d['status'];
		$lead      = $confirmed
			/* translators: %s: guest name. */
			? sprintf( __( 'Hi %s, your table is booked — see you then!', 'dinekit' ), $d['name'] )
			/* translators: %s: guest name. */
			: sprintf( __( 'Hi %s, thanks for your booking request — we’ll confirm shortly.', 'dinekit' ), $d['name'] );
		$subject = $confirmed
			/* translators: %s: site name. */
			? sprintf( __( 'Your booking at %s', 'dinekit' ), $site )
			/* translators: %s: site name. */
			: sprintf( __( 'Your booking request at %s', 'dinekit' ), $site );
		send( $d['email'], $subject, render( $lead, $d, __( 'Need to change it? Just reply to this email.', 'dinekit' ) ) );
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
	$foot = admin_url( 'admin.php?page=dinekit#/bookings' );
	send( admin_recipient(), $subject, render( __( 'A new booking has come in:', 'dinekit' ), $d, $foot ) );
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
	$d = booking_data( $id );
	if ( ! is_email( $d['email'] ) ) {
		return;
	}
	$site = get_bloginfo( 'name' );

	if ( 'confirmed' === $status ) {
		/* translators: %s: guest name. */
		$lead    = sprintf( __( 'Good news %s — your booking is confirmed.', 'dinekit' ), $d['name'] );
		/* translators: %s: site name. */
		$subject = sprintf( __( 'Booking confirmed — %s', 'dinekit' ), $site );
		send( $d['email'], $subject, render( $lead, $d, __( 'We look forward to seeing you.', 'dinekit' ) ) );
	} elseif ( 'cancelled' === $status ) {
		/* translators: %s: guest name. */
		$lead    = sprintf( __( 'Hi %s, your booking has been cancelled.', 'dinekit' ), $d['name'] );
		/* translators: %s: site name. */
		$subject = sprintf( __( 'Booking cancelled — %s', 'dinekit' ), $site );
		send( $d['email'], $subject, render( $lead, $d, __( 'If this was a mistake, please get in touch.', 'dinekit' ) ) );
	}
}
