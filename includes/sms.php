<?php
/**
 * SMS notifications — bring-your-own Twilio.
 *
 * The venue supplies its OWN Twilio credentials (account SID, auth token,
 * sending number); DineKit talks only to the Twilio Messages API on the
 * venue's behalf, disclosed in readme "External services". Nothing is sent
 * unless the venue enables SMS and a trigger fires. The auth token is
 * encrypted at rest with the same AES scheme as the Stripe keys.
 *
 * Triggers (each its own opt-in toggle, all off by default):
 * - booking confirmed        → confirmation text
 * - booking reminder         → hourly cron, N hours before the booking
 * - waitlist "table ready"   → a button on the booking panel (staff-fired)
 * - order ready (collection) → when the kitchen marks the order ready
 *
 * @package DineKit
 */

namespace DineKit\SMS;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_sms';
const CRON   = 'dinekit_sms_cron';

/**
 * Hook everything up.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
	add_action( CRON, __NAMESPACE__ . '\\run_reminders' );
	// Keep the hourly reminder tick scheduled while reminders are on; the save
	// path (un)schedules too, so this is only self-healing.
	add_action(
		'init',
		static function () {
			$s = namespace\get_settings();
			if ( ! empty( $s['enabled'] ) && ! empty( $s['remind'] ) && ! wp_next_scheduled( CRON ) ) {
				wp_schedule_event( time() + 300, 'hourly', CRON );
			}
		}
	);
}

/**
 * Default settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'sid'          => '',    // Twilio account SID (AC…) — or an API key SID (SK…), which the new console pushes people toward.
		'account_sid'  => '',    // When sid is an API key: the owning account SID, resolved once via the API.
		'token'        => '',    // Auth token (for AC…) or the API key's secret (for SK…) — stored encrypted (dkenc1: prefix).
		'from'         => '',    // The venue's Twilio number, E.164.
		'cc'           => '',    // Default country dial code for local numbers ('' = derive from venue country).
		'enabled'      => false, // Master switch.
		'confirm'      => false, // Text when a booking is confirmed.
		'remind'       => false, // Reminder text N hours before the booking.
		'remind_hours' => 3,     // Lead time for reminders.
		'waitlist'     => true,  // Allow the "your table is ready" button.
		'order_ready'  => false, // Text when a collection order is marked ready.
		'sent_total'   => 0,     // Lifetime send counter.
		'sent_month'   => '',    // "YYYY-MM|count" — this month's counter (trial budgeting).
	);
}

/**
 * Stored settings merged over defaults (token stays encrypted here).
 *
 * @return array<string,mixed>
 */
function get_settings() {
	$stored = get_option( OPTION, array() );
	return is_array( $stored ) ? array_merge( defaults(), $stored ) : defaults();
}

/**
 * Save settings. The token is only overwritten when a new one is supplied, so
 * the UI never needs to echo the secret back.
 *
 * @param array<string,mixed> $input Raw input.
 * @return array<string,mixed> Saved settings.
 */
function save_settings( $input ) {
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$s = namespace\get_settings();

	if ( isset( $input['sid'] ) ) {
		$sid = sanitize_text_field( (string) $input['sid'] );
		// AC… = classic account SID; SK… = an API key from the console's
		// "Create API key" wizard — both are accepted (the owning account is
		// resolved automatically for SK keys).
		if ( preg_match( '/^(AC|SK)[a-fA-F0-9]{32}$/', $sid ) || '' === $sid ) {
			if ( $sid !== $s['sid'] ) {
				$s['account_sid'] = '';
			}
			$s['sid'] = $sid;
		}
	}
	if ( isset( $input['token'] ) && '' !== trim( (string) $input['token'] ) ) {
		$s['token'] = \DineKit\Integrations\encrypt_secret( sanitize_text_field( (string) $input['token'] ) );
	}
	if ( isset( $input['from'] ) ) {
		$s['from'] = preg_replace( '/[^0-9+]/', '', (string) $input['from'] );
	}
	if ( isset( $input['cc'] ) ) {
		$s['cc'] = preg_replace( '/\D/', '', (string) $input['cc'] );
	}
	foreach ( array( 'enabled', 'confirm', 'remind', 'waitlist', 'order_ready' ) as $flag ) {
		if ( isset( $input[ $flag ] ) ) {
			$s[ $flag ] = (bool) $input[ $flag ];
		}
	}
	if ( isset( $input['remind_hours'] ) ) {
		$s['remind_hours'] = max( 1, min( 48, absint( $input['remind_hours'] ) ) );
	}
	update_option( OPTION, $s, false );

	// Reminders on → make sure the hourly tick exists; off → remove it.
	if ( ! empty( $s['enabled'] ) && ! empty( $s['remind'] ) ) {
		if ( ! wp_next_scheduled( CRON ) ) {
			wp_schedule_event( time() + 300, 'hourly', CRON );
		}
	} else {
		wp_clear_scheduled_hook( CRON );
	}
	return $s;
}

/**
 * Ready to send? (Master switch + full credentials.)
 *
 * @return bool
 */
function configured() {
	$s = namespace\get_settings();
	return ! empty( $s['enabled'] ) && '' !== $s['sid'] && '' !== $s['token'] && '' !== $s['from'];
}

/**
 * The default dial code: the explicit setting, else derived from the venue's
 * country, else UK (DineKit's home market).
 *
 * @return string Digits only, e.g. "44".
 */
function dial_code() {
	$s = namespace\get_settings();
	if ( '' !== $s['cc'] ) {
		return $s['cc'];
	}
	require_once DINEKIT_DIR . 'includes/settings.php';
	$map     = array(
		'GB' => '44',
		'IE' => '353',
		'US' => '1',
		'CA' => '1',
		'AU' => '61',
		'NZ' => '64',
		'FR' => '33',
		'DE' => '49',
		'ES' => '34',
		'IT' => '39',
		'NL' => '31',
		'PT' => '351',
		'PL' => '48',
		'LT' => '370',
	);
	$country = (string) \DineKit\Settings\get()['country'];
	return isset( $map[ $country ] ) ? $map[ $country ] : '44';
}

/**
 * Normalise a phone number to E.164 using the venue's dial code for local
 * formats ("07700 900123" → "+447700900123"). Returns '' when hopeless.
 *
 * @param string $raw Raw phone as typed by a guest.
 * @return string
 */
function normalize_phone( $raw ) {
	$raw    = trim( (string) $raw );
	$plus   = 0 === strpos( $raw, '+' );
	$digits = preg_replace( '/\D/', '', $raw );
	if ( strlen( $digits ) < 7 || strlen( $digits ) > 15 ) {
		return '';
	}
	if ( $plus ) {
		return '+' . $digits;
	}
	if ( 0 === strpos( $digits, '00' ) ) {
		return '+' . substr( $digits, 2 );
	}
	$cc = dial_code();
	if ( 0 === strpos( $digits, '0' ) ) {
		return '+' . $cc . substr( $digits, 1 );
	}
	// Already carries a country code? (Longer than a national number and
	// starting with the venue's own code is the common paste format.)
	if ( 0 === strpos( $digits, $cc ) && strlen( $digits ) > 10 ) {
		return '+' . $digits;
	}
	return '+' . $cc . $digits;
}

/**
 * Last-3-digits mask for logs — never store a full number in the audit trail.
 *
 * @param string $e164 Normalised number.
 * @return string
 */
function mask( $e164 ) {
	return '…' . substr( (string) $e164, -3 );
}

/**
 * The account SID to build API URLs with. A classic AC… SID is itself; an
 * API key (SK…) authenticates fine but the URL still needs the OWNING
 * account — ask Twilio once (GET /Accounts with the key) and cache it.
 *
 * @param array<string,mixed> $s     Settings.
 * @param string              $token Decrypted token/secret.
 * @return string|\WP_Error Account SID (AC…).
 */
function resolve_account_sid( $s, $token ) {
	if ( 0 === strpos( (string) $s['sid'], 'AC' ) ) {
		return (string) $s['sid'];
	}
	if ( '' !== (string) $s['account_sid'] ) {
		return (string) $s['account_sid'];
	}
	$response = wp_remote_get(
		'https://api.twilio.com/2010-04-01/Accounts.json?PageSize=1',
		array(
			'timeout' => 15,
			'headers' => array(
				'Authorization' => 'Basic ' . base64_encode( $s['sid'] . ':' . $token ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- HTTP Basic auth encoding, not obfuscation.
			),
		)
	);
	if ( is_wp_error( $response ) ) {
		return $response;
	}
	$data    = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	$account = is_array( $data ) && ! empty( $data['accounts'][0]['sid'] ) ? (string) $data['accounts'][0]['sid'] : '';
	if ( 0 !== strpos( $account, 'AC' ) ) {
		return new \WP_Error( 'dinekit_sms_key', __( 'Twilio didn’t accept that API key — check the key SID and secret, or use the account’s Auth token instead.', 'dinekit' ) );
	}
	$saved                = namespace\get_settings();
	$saved['account_sid'] = $account;
	update_option( OPTION, $saved, false );
	return $account;
}

/**
 * Send one SMS through the venue's Twilio account.
 *
 * @param string $to      Destination (any format — normalised here).
 * @param string $body    Message text.
 * @param string $context Short label for the activity log ("booking confirm").
 * @return true|\WP_Error
 */
function send( $to, $body, $context = '' ) {
	if ( ! configured() ) {
		return new \WP_Error( 'dinekit_sms_off', __( 'SMS is not enabled or not fully configured.', 'dinekit' ) );
	}
	$e164 = normalize_phone( $to );
	if ( '' === $e164 ) {
		return new \WP_Error( 'dinekit_sms_phone', __( 'That phone number doesn’t look valid.', 'dinekit' ) );
	}

	require_once DINEKIT_DIR . 'includes/integrations.php';
	$s     = namespace\get_settings();
	$token = \DineKit\Integrations\decrypt_secret( $s['token'] );

	// The Messages URL needs the ACCOUNT SID even when authenticating with an
	// API key (SK…) — resolve and cache the owning account on first use.
	$account = resolve_account_sid( $s, $token );
	if ( is_wp_error( $account ) ) {
		return $account;
	}

	$response = wp_remote_post(
		'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode( $account ) . '/Messages.json',
		array(
			'timeout' => 15,
			'headers' => array(
				'Authorization' => 'Basic ' . base64_encode( $s['sid'] . ':' . $token ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- HTTP Basic auth encoding, not obfuscation.
			),
			'body'    => array(
				'To'   => $e164,
				'From' => $s['from'],
				'Body' => (string) $body,
			),
		)
	);
	if ( is_wp_error( $response ) ) {
		return $response;
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	if ( $code < 200 || $code >= 300 ) {
		// Twilio's raw errors are cryptic ("Authenticate") — translate the ones
		// venues actually hit into instructions they can act on.
		$tw_code = is_array( $data ) && isset( $data['code'] ) ? (int) $data['code'] : 0;
		if ( 20003 === $tw_code ) {
			$msg = __( 'Twilio rejected the sign-in. The two fields must match: an Account SID (AC…) goes with the account’s Auth Token, while an API key SID (SK…) goes with that key’s Client Secret — they can’t be mixed. Both live on Twilio’s “API keys & tokens” page.', 'dinekit' );
		} elseif ( 21608 === $tw_code ) {
			$msg = __( 'Sent to Twilio OK, but on a trial account texts only reach numbers you’ve verified: Twilio console → Phone Numbers → Verified Caller IDs.', 'dinekit' );
		} elseif ( 21606 === $tw_code || 21659 === $tw_code ) {
			$msg = __( 'Your “from” number isn’t an SMS-capable number on this Twilio account. Check Twilio console → Phone Numbers → Manage → Active numbers and copy it exactly.', 'dinekit' );
		} else {
			$msg = is_array( $data ) && ! empty( $data['message'] ) ? (string) $data['message'] : sprintf( 'Twilio returned HTTP %d.', $code );
		}
		return new \WP_Error( 'dinekit_sms_fail', $msg );
	}

	// Count it (total + per-month, handy against a trial budget) and audit it.
	$month           = wp_date( 'Y-m' );
	$parts           = explode( '|', (string) $s['sent_month'] );
	$mcnt            = ( isset( $parts[0] ) && $parts[0] === $month ) ? (int) $parts[1] : 0;
	$s               = namespace\get_settings();
	$s['sent_total'] = (int) $s['sent_total'] + 1;
	$s['sent_month'] = $month . '|' . ( $mcnt + 1 );
	update_option( OPTION, $s, false );

	require_once DINEKIT_DIR . 'includes/activity.php';
	/* translators: 1: masked phone number, 2: what triggered the text. */
	\DineKit\Activity\log( 'sms', sprintf( __( 'SMS sent to %1$s (%2$s)', 'dinekit' ), mask( $e164 ), $context ? $context : 'manual' ) );
	return true;
}

/* -------------------------------------------------------------------------- */
/* Triggers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Booking confirmed → confirmation text (once per booking).
 *
 * @param int $booking_id Booking id.
 * @return void
 */
function booking_confirmed( $booking_id ) {
	$s = namespace\get_settings();
	if ( ! configured() || empty( $s['confirm'] ) ) {
		return;
	}
	if ( 'confirmed' !== (string) get_post_meta( $booking_id, 'dinekit_status', true ) ) {
		return;
	}
	if ( get_post_meta( $booking_id, 'dinekit_sms_confirmed', true ) ) {
		return;
	}
	$phone = (string) get_post_meta( $booking_id, 'dinekit_phone', true );
	if ( '' === trim( $phone ) ) {
		return;
	}
	$date = (string) get_post_meta( $booking_id, 'dinekit_date', true );
	$time = (string) get_post_meta( $booking_id, 'dinekit_time', true );
	$body = sprintf(
		/* translators: 1: venue name, 2: party size, 3: date, 4: time. */
		__( '%1$s: your table for %2$d on %3$s at %4$s is confirmed. See you then!', 'dinekit' ),
		get_bloginfo( 'name' ),
		max( 1, (int) get_post_meta( $booking_id, 'dinekit_party', true ) ),
		date_i18n( 'D j M', strtotime( $date . ' 12:00:00' ) ),
		$time
	);
	if ( true === send( $phone, $body, 'booking confirmation' ) ) {
		update_post_meta( $booking_id, 'dinekit_sms_confirmed', 1 );
		\DineKit\Bookings\log_event( $booking_id, __( 'Confirmation SMS sent', 'dinekit' ) );
	}
}

/**
 * Hourly cron: text a reminder for confirmed bookings starting within the
 * configured lead time (each booking reminded once, capped per run so a
 * misconfigured install can't torch an SMS budget).
 *
 * @return void
 */
function run_reminders() {
	$s = namespace\get_settings();
	if ( ! configured() || empty( $s['remind'] ) ) {
		return;
	}
	$today    = wp_date( 'Y-m-d' );
	$tomorrow = wp_date( 'Y-m-d', strtotime( '+1 day' ) );
	// phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested -- comparing against site-local booking times.
	$now_ts = current_time( 'timestamp' );
	$max_ts = $now_ts + ( (int) $s['remind_hours'] * HOUR_IN_SECONDS );

	$ids  = get_posts(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 200, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- two days of bookings.
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- hourly cron, not a request path.
				array(
					'key'     => 'dinekit_date',
					'value'   => array( $today, $tomorrow ),
					'compare' => 'IN',
				),
			),
		)
	);
	$sent = 0;
	foreach ( $ids as $bid ) {
		if ( $sent >= 25 ) {
			break; // Budget guard per run.
		}
		if ( 'confirmed' !== (string) get_post_meta( $bid, 'dinekit_status', true ) ) {
			continue;
		}
		if ( get_post_meta( $bid, 'dinekit_sms_reminded', true ) ) {
			continue;
		}
		$phone = (string) get_post_meta( $bid, 'dinekit_phone', true );
		if ( '' === trim( $phone ) ) {
			continue;
		}
		$date  = (string) get_post_meta( $bid, 'dinekit_date', true );
		$time  = (string) get_post_meta( $bid, 'dinekit_time', true );
		$at_ts = strtotime( $date . ' ' . $time . ':00' );
		if ( ! $at_ts || $at_ts < $now_ts || $at_ts > $max_ts ) {
			continue; // Not inside the reminder window yet (or already started).
		}
		$body = sprintf(
			/* translators: 1: venue name, 2: party size, 3: time. */
			__( '%1$s: reminder — your table for %2$d is at %3$s today. See you soon!', 'dinekit' ),
			get_bloginfo( 'name' ),
			max( 1, (int) get_post_meta( $bid, 'dinekit_party', true ) ),
			$time
		);
		if ( true === send( $phone, $body, 'booking reminder' ) ) {
			update_post_meta( $bid, 'dinekit_sms_reminded', 1 );
			\DineKit\Bookings\log_event( $bid, __( 'Reminder SMS sent', 'dinekit' ) );
			++$sent;
		}
	}
}

/**
 * Waitlist / walk-in queue: "your table is ready" — staff-fired, repeatable.
 *
 * @param int $booking_id Booking id.
 * @return true|\WP_Error
 */
function table_ready( $booking_id ) {
	$s = namespace\get_settings();
	if ( empty( $s['waitlist'] ) ) {
		return new \WP_Error( 'dinekit_sms_off', __( 'The table-ready text is turned off in SMS settings.', 'dinekit' ) );
	}
	$phone = (string) get_post_meta( $booking_id, 'dinekit_phone', true );
	if ( '' === trim( $phone ) ) {
		return new \WP_Error( 'dinekit_sms_phone', __( 'This booking has no phone number.', 'dinekit' ) );
	}
	$body = sprintf(
		/* translators: %s: venue name. */
		__( '%s: good news — your table is ready! Please come to the host stand.', 'dinekit' ),
		get_bloginfo( 'name' )
	);
	$sent = send( $phone, $body, 'table ready' );
	if ( true === $sent ) {
		\DineKit\Bookings\log_event( $booking_id, __( '“Table ready” SMS sent', 'dinekit' ) );
	}
	return $sent;
}

/**
 * Collection order marked ready → "come and get it" (once per order).
 *
 * @param int $order_id Order id.
 * @return void
 */
function order_ready( $order_id ) {
	$s = namespace\get_settings();
	if ( ! configured() || empty( $s['order_ready'] ) ) {
		return;
	}
	if ( 'delivery' === (string) get_post_meta( $order_id, 'dinekit_order_fulfilment', true ) ) {
		return;
	}
	if ( get_post_meta( $order_id, 'dinekit_order_sms_ready', true ) ) {
		return;
	}
	$phone = (string) get_post_meta( $order_id, 'dinekit_order_phone', true );
	if ( '' === trim( $phone ) ) {
		return;
	}
	$body = sprintf(
		/* translators: 1: venue name, 2: order number. */
		__( '%1$s: order #%2$d is ready for collection.', 'dinekit' ),
		get_bloginfo( 'name' ),
		(int) get_post_meta( $order_id, 'dinekit_order_number', true )
	);
	if ( true === send( $phone, $body, 'order ready' ) ) {
		update_post_meta( $order_id, 'dinekit_order_sms_ready', 1 );
		\DineKit\Ordering\log_event( $order_id, __( '“Ready for collection” SMS sent', 'dinekit' ) );
	}
}

/* -------------------------------------------------------------------------- */
/* REST                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Routes.
 *
 * @return void
 */
function register_routes() {
	register_rest_route(
		'dinekit/v1',
		'/sms',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_get',
				'permission_callback' => '\\DineKit\\Rest\\can_manage_settings',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\rest_save',
				'permission_callback' => '\\DineKit\\Rest\\can_manage_settings',
			),
		)
	);
	register_rest_route(
		'dinekit/v1',
		'/sms/test',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_test',
			'permission_callback' => '\\DineKit\\Rest\\can_manage_settings',
		)
	);
	register_rest_route(
		'dinekit/v1',
		'/sms/status',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_status',
			'permission_callback' => '\\DineKit\\Rest\\can_edit',
		)
	);
	register_rest_route(
		'dinekit/v1',
		'/sms/table-ready/(?P<id>\d+)',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_table_ready',
			'permission_callback' => '\\DineKit\\Rest\\can_edit',
		)
	);
}

/**
 * GET /sms — settings for the admin card (secret never echoed back).
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	$s     = namespace\get_settings();
	$parts = explode( '|', (string) $s['sent_month'] );
	return rest_ensure_response(
		array(
			'sid'          => $s['sid'],
			'tokenSet'     => '' !== $s['token'],
			'from'         => $s['from'],
			'cc'           => '' !== $s['cc'] ? $s['cc'] : dial_code(),
			'enabled'      => (bool) $s['enabled'],
			'confirm'      => (bool) $s['confirm'],
			'remind'       => (bool) $s['remind'],
			'remind_hours' => (int) $s['remind_hours'],
			'waitlist'     => (bool) $s['waitlist'],
			'order_ready'  => (bool) $s['order_ready'],
			'sentTotal'    => (int) $s['sent_total'],
			'sentMonth'    => isset( $parts[0] ) && wp_date( 'Y-m' ) === $parts[0] ? (int) $parts[1] : 0,
		)
	);
}

/**
 * POST /sms — save settings.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_save( $request ) {
	save_settings( (array) $request->get_json_params() );
	return rest_get();
}

/**
 * POST /sms/test { to } — a real send, so the venue can prove the pipes work.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_test( $request ) {
	$to   = (string) $request->get_param( 'to' );
	$sent = send(
		$to,
		sprintf(
			/* translators: %s: venue name. */
			__( '%s: test message from DineKit — your SMS setup works. 🎉', 'dinekit' ),
			get_bloginfo( 'name' )
		),
		'test'
	);
	if ( true !== $sent ) {
		return $sent;
	}
	return rest_ensure_response( array( 'ok' => true ) );
}

/**
 * GET /sms/status — the light "can the floor use SMS?" answer.
 *
 * @return \WP_REST_Response
 */
function rest_status() {
	$s = namespace\get_settings();
	return rest_ensure_response(
		array(
			'configured' => configured(),
			'waitlist'   => configured() && ! empty( $s['waitlist'] ),
		)
	);
}

/**
 * POST /sms/table-ready/:id.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_table_ready( $request ) {
	$id = (int) $request['id'];
	if ( 'dinekit_booking' !== get_post_type( $id ) ) {
		return new \WP_Error( 'dinekit_booking_404', __( 'Booking not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$sent = table_ready( $id );
	if ( true !== $sent ) {
		return $sent;
	}
	return rest_ensure_response( array( 'ok' => true ) );
}
