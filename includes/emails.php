<?php
/**
 * Shared email branding + templates. One place for the restaurant's email look
 * (logo, accent, footer, sender) and the editable subject/intro of each
 * transactional email. The structured "core info" (order lines, booking
 * details) is always rendered by the calling module and wrapped in the branded
 * shell here — so venues can rebrand + reword freely without breaking the facts.
 *
 * @package DineKit
 */

namespace DineKit\Emails;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_email';

/**
 * Editable templates: key => { subject, intro } with default copy. Placeholders
 * {name} {number} {site} {date} {time} are filled at send time.
 *
 * @return array<string,array{label:string,subject:string,intro:string}>
 */
function template_defaults() {
	return array(
		'order_confirmation'   => array(
			'label'   => __( 'Order — confirmation', 'dinekit' ),
			'subject' => __( 'Order #{number} confirmed — {site}', 'dinekit' ),
			'intro'   => __( 'Thanks {name} — we’ve got your order and we’ll have it ready for collection.', 'dinekit' ),
		),
		'order_cancelled'      => array(
			'label'   => __( 'Order — cancelled', 'dinekit' ),
			'subject' => __( 'Your order #{number} was cancelled — {site}', 'dinekit' ),
			'intro'   => __( 'Sorry {name} — we couldn’t take your order this time. Any payment has been refunded.', 'dinekit' ),
		),
		'booking_confirmation' => array(
			'label'   => __( 'Booking — confirmation', 'dinekit' ),
			'subject' => __( 'Your booking at {site} is confirmed', 'dinekit' ),
			'intro'   => __( 'Thanks {name}, your table is booked for {date} at {time}. We look forward to seeing you!', 'dinekit' ),
		),
		'booking_cancelled'    => array(
			'label'   => __( 'Booking — cancelled', 'dinekit' ),
			'subject' => __( 'Your booking at {site} was cancelled', 'dinekit' ),
			'intro'   => __( 'Hi {name}, your booking for {date} at {time} has been cancelled. Any deposit has been refunded.', 'dinekit' ),
		),
	);
}

/**
 * Merged settings (branding + template overrides).
 *
 * @return array<string,mixed>
 */
function get() {
	$defaults = array(
		'accent'    => '#4f46e5',
		'logo'      => '',
		'footer'    => '',
		'from_name' => (string) get_bloginfo( 'name' ),
		'reply_to'  => (string) get_option( 'admin_email' ),
		'templates' => array(),
	);
	$stored   = get_option( OPTION );
	$s        = is_array( $stored ) ? wp_parse_args( $stored, $defaults ) : $defaults;
	// Merge each template over its default so new templates appear automatically.
	$tpl = array();
	foreach ( template_defaults() as $key => $def ) {
		$over        = isset( $s['templates'][ $key ] ) && is_array( $s['templates'][ $key ] ) ? $s['templates'][ $key ] : array();
		$tpl[ $key ] = array(
			'label'   => $def['label'],
			'subject' => isset( $over['subject'] ) && '' !== $over['subject'] ? (string) $over['subject'] : $def['subject'],
			'intro'   => isset( $over['intro'] ) && '' !== $over['intro'] ? (string) $over['intro'] : $def['intro'],
		);
	}
	$s['templates'] = $tpl;
	return $s;
}

/**
 * Save branding + template overrides (sanitized).
 *
 * @param array<string,mixed> $data Incoming.
 * @return array<string,mixed>
 */
function save( $data ) {
	$current = get();
	if ( isset( $data['accent'] ) ) {
		$hex = sanitize_hex_color( (string) $data['accent'] );
		if ( $hex ) {
			$current['accent'] = $hex;
		}
	}
	if ( isset( $data['logo'] ) ) {
		$current['logo'] = esc_url_raw( (string) $data['logo'] );
	}
	if ( isset( $data['footer'] ) ) {
		$current['footer'] = sanitize_text_field( (string) $data['footer'] );
	}
	if ( isset( $data['from_name'] ) ) {
		$current['from_name'] = sanitize_text_field( (string) $data['from_name'] );
	}
	if ( isset( $data['reply_to'] ) ) {
		$email               = sanitize_email( (string) $data['reply_to'] );
		$current['reply_to'] = is_email( $email ) ? $email : '';
	}
	if ( isset( $data['templates'] ) && is_array( $data['templates'] ) ) {
		$save_tpl = array();
		foreach ( template_defaults() as $key => $def ) {
			if ( ! isset( $data['templates'][ $key ] ) || ! is_array( $data['templates'][ $key ] ) ) {
				continue;
			}
			$in               = $data['templates'][ $key ];
			$save_tpl[ $key ] = array(
				'subject' => sanitize_text_field( (string) ( $in['subject'] ?? '' ) ),
				'intro'   => sanitize_textarea_field( (string) ( $in['intro'] ?? '' ) ),
			);
		}
		// Store raw overrides (not merged) so future default changes flow through.
		$stored              = get_option( OPTION );
		$stored              = is_array( $stored ) ? $stored : array();
		$stored['templates'] = $save_tpl;
		$branding            = array_intersect_key( $current, array_flip( array( 'accent', 'logo', 'footer', 'from_name', 'reply_to' ) ) );
		update_option( OPTION, array_merge( $stored, $branding ) );
		return get();
	}
	$stored = get_option( OPTION );
	$stored = is_array( $stored ) ? $stored : array();
	update_option( OPTION, array_merge( $stored, array_intersect_key( $current, array_flip( array( 'accent', 'logo', 'footer', 'from_name', 'reply_to' ) ) ) ) );
	return get();
}

/**
 * Fill {placeholders} in a string.
 *
 * @param string               $text Text with placeholders.
 * @param array<string,string> $vars Replacements.
 * @return string
 */
function fill( $text, $vars ) {
	foreach ( $vars as $k => $v ) {
		$text = str_replace( '{' . $k . '}', (string) $v, $text );
	}
	return (string) $text;
}

/**
 * Resolve a template's subject + intro with placeholders filled.
 *
 * @param string               $key  Template key.
 * @param array<string,string> $vars Replacements.
 * @return array{subject:string,intro:string}
 */
function template( $key, $vars = array() ) {
	$s   = get();
	$tpl = isset( $s['templates'][ $key ] ) ? $s['templates'][ $key ] : array(
		'subject' => '',
		'intro'   => '',
	);
	return array(
		'subject' => fill( $tpl['subject'], $vars ),
		'intro'   => fill( $tpl['intro'], $vars ),
	);
}

/**
 * wp_mail headers (HTML + optional From / Reply-To from branding).
 *
 * @return string[]
 */
function headers() {
	$s       = get();
	$headers = array( 'Content-Type: text/html; charset=UTF-8' );
	$from    = trim( (string) $s['from_name'] );
	$admin   = (string) get_option( 'admin_email' );
	if ( '' !== $from && is_email( $admin ) ) {
		$headers[] = 'From: ' . wp_specialchars_decode( $from, ENT_QUOTES ) . ' <' . $admin . '>';
	}
	if ( ! empty( $s['reply_to'] ) && is_email( $s['reply_to'] ) ) {
		$headers[] = 'Reply-To: ' . $s['reply_to'];
	}
	return $headers;
}

/**
 * Wrap inner HTML in the branded shell (accent header with logo/name + footer).
 *
 * @param string $inner Inner HTML (the message + core details).
 * @param string $intro Optional intro paragraph shown above the inner content.
 * @return string
 */
function shell( $inner, $intro = '' ) {
	$s      = get();
	$accent = (string) $s['accent'];
	$site   = get_bloginfo( 'name' );
	$header = '';
	if ( ! empty( $s['logo'] ) ) {
		$header = '<img src="' . esc_url( $s['logo'] ) . '" alt="' . esc_attr( $site ) . '" style="max-height:48px;max-width:200px">';
	} else {
		$header = '<span style="font-size:20px;font-weight:800;color:#fff">' . esc_html( $site ) . '</span>';
	}

	$html  = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">';
	$html .= '<div style="background:' . esc_attr( $accent ) . ';padding:18px 22px">' . $header . '</div>';
	$html .= '<div style="padding:22px;color:#0f172a">';
	if ( '' !== $intro ) {
		$html .= '<p style="font-size:15px;color:#334155;margin:0 0 16px">' . esc_html( $intro ) . '</p>';
	}
	$html  .= $inner;
	$html  .= '</div>';
	$footer = trim( (string) $s['footer'] );
	if ( '' !== $footer ) {
		$html .= '<div style="padding:14px 22px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">' . esc_html( $footer ) . '</div>';
	}
	$html .= '</div>';
	return $html;
}

/**
 * Render a preview of a template (subject + full branded HTML) with sample data,
 * for the admin editor.
 *
 * @param string $key Template key.
 * @return array{subject:string,html:string}
 */
function preview( $key ) {
	$vars = array(
		'name'   => __( 'Alex Taylor', 'dinekit' ),
		'number' => '1042',
		'site'   => (string) get_bloginfo( 'name' ),
		'date'   => date_i18n( (string) get_option( 'date_format', 'j M Y' ) ),
		'time'   => '19:30',
	);
	$t    = template( $key, $vars );
	if ( 0 === strpos( $key, 'order' ) ) {
		$inner  = '<p style="font-size:14px;color:#64748b;margin:0 0 12px">' . esc_html__( 'Order #1042', 'dinekit' ) . '</p>';
		$inner .= '<table style="width:100%;border-collapse:collapse;font-size:14px">';
		$inner .= '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><strong>1× ' . esc_html__( 'Margherita Pizza', 'dinekit' ) . '</strong></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">£9.50</td></tr>';
		$inner .= '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><strong>2× ' . esc_html__( 'Garlic Bread', 'dinekit' ) . '</strong></td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">£7.00</td></tr>';
		$inner .= '<tr><td style="padding:8px 10px;font-weight:800">' . esc_html__( 'Total', 'dinekit' ) . '</td><td style="padding:8px 10px;text-align:right;font-weight:800">£16.50</td></tr></table>';
	} else {
		$rows  = array(
			__( 'Name', 'dinekit' )   => $vars['name'],
			__( 'Date', 'dinekit' )   => $vars['date'],
			__( 'Time', 'dinekit' )   => $vars['time'],
			__( 'Guests', 'dinekit' ) => '2',
		);
		$inner = '<table style="width:100%;border-collapse:collapse;font-size:14px">';
		foreach ( $rows as $label => $value ) {
			$inner .= '<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:110px">' . esc_html( $label ) . '</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">' . esc_html( $value ) . '</td></tr>';
		}
		$inner .= '</table>';
	}
	return array(
		'subject' => $t['subject'],
		'html'    => shell( $inner, $t['intro'] ),
	);
}

/**
 * Send a branded HTML email.
 *
 * @param string $to      Recipient.
 * @param string $subject Subject.
 * @param string $inner   Inner HTML (core details).
 * @param string $intro   Optional intro paragraph.
 * @return bool
 */
function send( $to, $subject, $inner, $intro = '' ) {
	if ( ! is_email( $to ) ) {
		return false;
	}
	return (bool) wp_mail( $to, $subject, shell( $inner, $intro ), headers() );
}
