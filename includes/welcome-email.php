<?php
/**
 * The welcome note — one personal email to the owner after they install.
 *
 * A free plugin usually arrives with nobody attached to it. This is the
 * opposite: a short note from a person, saying replies reach them. It's sent
 * BY the restaurant's own site TO its own admin address, so nothing about the
 * site or the owner leaves — this is not a mailing list and there is no
 * signup. Replies go to a real human via Reply-To.
 *
 * Deliverability note: the From address deliberately stays on the site's own
 * domain (WordPress's default), and whatever mail setup the venue already uses
 * carries it. Putting a weblevelup.co.uk address in From would be a different
 * domain than the sending server, which SPF/DMARC treats as forgery and spam
 * filters bin.
 *
 * Reply-To points at a real person — but plenty of sites run an SMTP plugin
 * that rewrites From and can strip Reply-To, which would silently route
 * replies into the venue's own mailbox where nobody reads them. So the address
 * is written into the body as well: headers can be rewritten, the words can't.
 *
 * Guards: exactly one email per site, ever; never on local, development or
 * staging installs; sent on a short delay so it lands after the owner has had a
 * look around rather than mid-click; and switchable off entirely with the
 * `dinekit_welcome_email_enabled` filter.
 *
 * @package DineKit
 */

namespace DineKit\WelcomeEmail;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION  = 'dinekit_welcome_email';
const CRON    = 'dinekit_welcome_email';
const REPLYTO = 'petras@weblevelup.co.uk';

/**
 * Hook registration.
 *
 * @return void
 */
function init() {
	add_action( CRON, __NAMESPACE__ . '\\send' );
	add_action( 'admin_init', __NAMESPACE__ . '\\maybe_schedule' );
}

/**
 * Would sending be appropriate on this install at all?
 *
 * @return bool
 */
function eligible() {
	/**
	 * Filter: switch the welcome note off entirely.
	 *
	 * @param bool $enabled Whether to send the one-off welcome email.
	 */
	if ( ! apply_filters( 'dinekit_welcome_email_enabled', true ) ) {
		return false;
	}

	// Never write to someone's inbox from a machine that isn't a real venue's
	// site: local copies, staging clones and dev boxes all get skipped.
	$env = function_exists( 'wp_get_environment_type' ) ? wp_get_environment_type() : 'production';
	if ( in_array( $env, array( 'local', 'development', 'staging' ), true ) ) {
		return false;
	}
	$host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
	foreach ( array( '.local', 'localhost', '.test', 'staging.', 'dev.', '.dev' ) as $needle ) {
		if ( false !== strpos( $host, $needle ) ) {
			return false;
		}
	}

	return is_email( get_option( 'admin_email' ) );
}

/**
 * Queue the note once, a short while after the plugin first appears.
 *
 * The option is written as soon as it's queued, so a burst of admin loads (or a
 * deactivate/reactivate cycle) can never produce a second email.
 *
 * @return void
 */
function maybe_schedule() {
	if ( false !== get_option( OPTION, false ) || ! eligible() ) {
		return;
	}
	update_option( OPTION, 'scheduled', false );
	wp_schedule_single_event( time() + ( 20 * MINUTE_IN_SECONDS ), CRON );
}

/**
 * The note itself. First person, no marketing furniture — if it doesn't read
 * like a person typed it, it isn't worth sending.
 *
 * @param string $greeting_name First name if we can find one, else ''.
 * @return string
 */
function body( $greeting_name = '' ) {
	$hello = $greeting_name ? sprintf( 'Hi %s,', $greeting_name ) : 'Hi,';

	$lines = array(
		$hello,
		'',
		'Petras here — I built DineKit. Thanks for installing it.',
		'',
		'It\'s free, and it stays free: no subscription, no per-cover fee, and 0% commission on your orders. What you take, you keep.',
		'',
		'If anything doesn\'t work or doesn\'t make sense, just reply to this email — or write to me directly at ' . REPLYTO . '. Either way it comes to me, and I answer it myself; most things turn out to be a five-minute fix. If there\'s something your venue needs that DineKit doesn\'t do yet, tell me that too: the last few releases came almost entirely from restaurants asking.',
		'',
		'Good luck with service.',
		'',
		'Petras',
		'Web Level Up',
		home_url( '/wp-admin/admin.php?page=dinekit' ),
	);

	/**
	 * Filter: the welcome email body.
	 *
	 * @param string $body          The plain-text message.
	 * @param string $greeting_name First name used in the greeting.
	 */
	return apply_filters( 'dinekit_welcome_email_body', implode( "\n", $lines ), $greeting_name );
}

/**
 * Send it (cron callback).
 *
 * @return void
 */
function send() {
	if ( 'scheduled' !== get_option( OPTION, false ) || ! eligible() ) {
		return;
	}
	// Stamp first: a mail function that fatals must not leave this rearmed.
	update_option( OPTION, time(), false );

	$to    = (string) get_option( 'admin_email' );
	$owner = get_user_by( 'email', $to );
	$name  = $owner && $owner->first_name ? $owner->first_name : '';

	// A name, not a translatable string. The address stays on the venue's own
	// domain so SPF/DMARC pass — Reply-To is what carries the answer back.
	$domain  = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
	$headers = array(
		'From: Petras at Web Level Up <wordpress@' . $domain . '>',
		'Reply-To: Petras Newman-Predko <' . REPLYTO . '>',
	);

	wp_mail(
		$to,
		__( 'Thanks for installing DineKit — reply if you need me', 'dinekit' ),
		body( $name ),
		$headers
	);
}
