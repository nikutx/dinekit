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
 * Build the order email HTML body.
 *
 * @param string              $lead Opening line.
 * @param array<string,mixed> $d    Order data.
 * @return string
 */
function render( $lead, $d ) {
	$site = get_bloginfo( 'name' );
	$when = 'asap' === $d['when'] ? __( 'As soon as possible', 'dinekit' ) : $d['when'];

	$html  = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">';
	$html .= '<h2 style="font-size:20px;margin:0 0 2px">' . esc_html( $site ) . '</h2>';
	/* translators: %d: order number. */
	$html .= '<p style="font-size:14px;color:#64748b;margin:0 0 14px">' . esc_html( sprintf( __( 'Order #%d', 'dinekit' ), $d['number'] ) ) . '</p>';
	$html .= '<p style="font-size:15px;color:#334155;margin:0 0 16px">' . esc_html( $lead ) . '</p>';
	$html .= '<table style="width:100%;border-collapse:collapse;font-size:14px">';
	foreach ( $d['items'] as $line ) {
		$mods = array();
		foreach ( (array) ( $line['chosen'] ?? array() ) as $c ) {
			$mods[] = $c['label'];
		}
		foreach ( (array) ( $line['removed'] ?? array() ) as $r ) {
			$mods[] = 'no ' . $r;
		}
		$name = $line['qty'] . '× ' . $line['title'] . ( ! empty( $line['priceLabel'] ) ? ' (' . $line['priceLabel'] . ')' : '' );
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
 * Notify the customer + kitchen about a new order.
 *
 * @param int $id Order id.
 * @return void
 */
function new_order( $id ) {
	if ( ! enabled() ) {
		return;
	}
	$d    = order_data( $id );
	$site = get_bloginfo( 'name' );

	if ( is_email( $d['email'] ) ) {
		/* translators: %s: customer name. */
		$lead = sprintf( __( 'Thanks %s — we’ve got your order and we’ll have it ready for collection.', 'dinekit' ), $d['name'] );
		/* translators: 1: order number, 2: site name. */
		$subject = sprintf( __( 'Order #%1$d confirmed — %2$s', 'dinekit' ), $d['number'], $site );
		send( $d['email'], $subject, render( $lead, $d ) );
	}

	/* translators: %d: order number. */
	$subject = sprintf( __( 'New order #%d', 'dinekit' ), $d['number'] );
	send( admin_recipient(), $subject, render( __( 'A new order has come in:', 'dinekit' ), $d ) );
}
