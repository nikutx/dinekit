<?php
/**
 * Order notification emails — customer confirmation + kitchen alert. Sent via
 * wp_mail (HTML, escaped). Transactional (the customer just placed the order).
 *
 * @package DineKit
 */

namespace DineKit\Ordering\Emails;

use DineKit\Ordering;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Are order emails on?
 *
 * @return bool
 */
function enabled() {
	$s = Ordering\get_settings();
	return ! empty( $s['emails_enabled'] );
}

/**
 * Kitchen recipient (falls back to the site admin).
 *
 * @return string
 */
function admin_recipient() {
	$s = Ordering\get_settings();
	return ! empty( $s['notify_email'] ) && is_email( $s['notify_email'] )
		? $s['notify_email']
		: (string) get_option( 'admin_email' );
}

/**
 * Currency formatter using the plugin's settings.
 *
 * @param float $n Amount.
 * @return string
 */
function money( $n ) {
	require_once DINEKIT_DIR . 'includes/settings.php';
	$s      = \DineKit\Settings\get();
	$value  = number_format( (float) $n, 2 );
	$symbol = (string) $s['currency'];
	return 'after' === $s['currencyPosition'] ? $value . $symbol : $symbol . $value;
}

/**
 * Gather an order's details for an email.
 *
 * @param int $id Order id.
 * @return array<string,mixed>
 */
function order_data( $id ) {
	$items = json_decode( (string) get_post_meta( $id, 'dk_order_items', true ), true );
	return array(
		'number' => (int) get_post_meta( $id, 'dk_order_number', true ),
		'items'  => is_array( $items ) ? $items : array(),
		'total'  => (float) get_post_meta( $id, 'dk_order_total', true ),
		'name'   => (string) get_post_meta( $id, 'dk_order_name', true ),
		'email'  => (string) get_post_meta( $id, 'dk_order_email', true ),
		'phone'  => (string) get_post_meta( $id, 'dk_order_phone', true ),
		'when'   => (string) get_post_meta( $id, 'dk_order_when', true ),
		'notes'  => (string) get_post_meta( $id, 'dk_order_notes', true ),
	);
}

/**
 * The order's core details as HTML (items + total + collection + notes). The
 * branded shell + intro are added by the shared email module, so venues can
 * rebrand + reword without breaking these facts.
 *
 * @param array<string,mixed> $d Order data.
 * @return string
 */
function order_inner( $d ) {
	$when = 'asap' === $d['when'] ? __( 'As soon as possible', 'dinekit' ) : $d['when'];
	/* translators: %d: order number. */
	$html  = '<p style="font-size:14px;color:#64748b;margin:0 0 12px">' . esc_html( sprintf( __( 'Order #%d', 'dinekit' ), $d['number'] ) ) . '</p>';
	$html .= '<table style="width:100%;border-collapse:collapse;font-size:14px">';
	foreach ( $d['items'] as $line ) {
		$mods = array();
		foreach ( (array) ( $line['chosen'] ?? array() ) as $c ) {
			$mods[] = $c['label'];
		}
		foreach ( (array) ( $line['removed'] ?? array() ) as $r ) {
			$mods[] = 'no ' . $r;
		}
		$name  = $line['qty'] . '× ' . $line['title'] . ( ! empty( $line['priceLabel'] ) ? ' (' . $line['priceLabel'] . ')' : '' );
		$html .= '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">' .
			'<strong>' . esc_html( $name ) . '</strong>' .
			( $mods ? '<br><span style="color:#64748b;font-size:13px">' . esc_html( implode( ', ', $mods ) ) . '</span>' : '' ) .
			'</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">' . esc_html( money( $line['lineTotal'] ) ) . '</td></tr>';
	}
	$html .= '<tr><td style="padding:8px 10px;font-weight:800">' . esc_html__( 'Total', 'dinekit' ) . '</td>' .
		'<td style="padding:8px 10px;text-align:right;font-weight:800">' . esc_html( money( $d['total'] ) ) . '</td></tr>';
	$html .= '</table>';
	$html .= '<p style="font-size:14px;margin:14px 0 0"><strong>' . esc_html__( 'Collection:', 'dinekit' ) . '</strong> ' . esc_html( $when ) . '</p>';
	if ( $d['notes'] ) {
		$html .= '<p style="font-size:13px;color:#64748b;margin:6px 0 0">' . esc_html( $d['notes'] ) . '</p>';
	}
	return $html;
}

/**
 * Template placeholders for an order.
 *
 * @param array<string,mixed> $d Order data.
 * @return array<string,string>
 */
function order_vars( $d ) {
	return array(
		'name'   => (string) $d['name'],
		'number' => (string) $d['number'],
		'site'   => (string) get_bloginfo( 'name' ),
	);
}

/**
 * Notify the customer + kitchen about a new order, logging each send.
 *
 * @param int $id Order id.
 * @return void
 */
function new_order( $id ) {
	if ( ! enabled() ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/emails.php';
	$d     = order_data( $id );
	$inner = order_inner( $d );

	if ( is_email( $d['email'] ) ) {
		$t  = \DineKit\Emails\template( 'order_confirmation', order_vars( $d ) );
		$ok = \DineKit\Emails\send( $d['email'], $t['subject'], $inner, $t['intro'] );
		Ordering\log_email( $id, $d['email'], 'confirmation', $ok );
	}

	/* translators: %d: order number. */
	$subject = sprintf( __( 'New order #%d', 'dinekit' ), $d['number'] );
	$to      = admin_recipient();
	$ok      = \DineKit\Emails\send( $to, $subject, $inner, __( 'A new order has come in:', 'dinekit' ) );
	Ordering\log_email( $id, $to, 'kitchen', $ok );
}

/**
 * Email the customer that their order was cancelled (with any refund note).
 *
 * @param int $id Order id.
 * @return void
 */
function cancelled( $id ) {
	if ( ! enabled() ) {
		return;
	}
	require_once DINEKIT_DIR . 'includes/emails.php';
	$d = order_data( $id );
	if ( ! is_email( $d['email'] ) ) {
		return;
	}
	$t  = \DineKit\Emails\template( 'order_cancelled', order_vars( $d ) );
	$ok = \DineKit\Emails\send( $d['email'], $t['subject'], order_inner( $d ), $t['intro'] );
	Ordering\log_email( $id, $d['email'], 'cancelled', $ok );
}

/**
 * Resend the customer confirmation (admin "resend receipt"). Logs the result.
 *
 * @param int $id Order id.
 * @return bool True if sent.
 */
function resend_confirmation( $id ) {
	require_once DINEKIT_DIR . 'includes/emails.php';
	$d = order_data( $id );
	if ( ! is_email( $d['email'] ) ) {
		Ordering\log_email( $id, $d['email'], 'resend', false );
		return false;
	}
	$t  = \DineKit\Emails\template( 'order_confirmation', order_vars( $d ) );
	$ok = \DineKit\Emails\send( $d['email'], $t['subject'], order_inner( $d ), $t['intro'] );
	Ordering\log_email( $id, $d['email'], 'resend', $ok );
	return $ok;
}
