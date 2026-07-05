<?php
/**
 * Integrations — bring-your-own-keys API settings (Stripe today; accounting/CRM
 * later). Keys are stored in a single option, admin-only. Secret keys are NEVER
 * returned to the browser: the client only learns whether a secret is set.
 *
 * @package DineKit
 */

namespace DineKit\Integrations;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_integrations';

/**
 * Default integration settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'stripe' => array(
			'enabled'             => false,
			'mode'                => 'test', // test | live.
			'test_publishable'    => '',
			'test_secret'         => '',
			'live_publishable'    => '',
			'live_secret'         => '',
			'test_webhook_secret' => '',
			'live_webhook_secret' => '',
			'test_webhook_id'     => '', // Stripe webhook endpoint id (for clean re-registration).
			'live_webhook_id'     => '',
		),
	);
}

const ENC_PREFIX = 'dkenc1:';

/**
 * The stripe fields that hold secrets and must be encrypted at rest.
 *
 * @return string[]
 */
function secret_keys() {
	return array( 'test_secret', 'live_secret', 'test_webhook_secret', 'live_webhook_secret' );
}

/**
 * 32-byte encryption key derived from the site's secret salts (which live in
 * wp-config.php, not the database) — so a leaked DB dump alone can't reveal the
 * Stripe secrets. If the salts change the secrets become unreadable and must be
 * re-entered; that is the accepted trade-off for at-rest protection.
 *
 * @return string Raw 32-byte key.
 */
function enc_key() {
	$salt  = defined( 'AUTH_KEY' ) ? AUTH_KEY : '';
	$salt .= defined( 'SECURE_AUTH_KEY' ) ? SECURE_AUTH_KEY : wp_salt( 'secure_auth' );
	return hash( 'sha256', 'dinekit-integrations|' . $salt, true );
}

/**
 * Encrypt a secret for storage. Empty stays empty; if OpenSSL is unavailable the
 * value is stored as-is (no worse than before). Output is prefixed so we can tell
 * encrypted values from legacy plaintext on read.
 *
 * @param string $plain Plaintext secret.
 * @return string
 */
function encrypt_secret( $plain ) {
	$plain = (string) $plain;
	if ( '' === $plain || ! function_exists( 'openssl_encrypt' ) ) {
		return $plain;
	}
	$iv = openssl_random_pseudo_bytes( 16 );
	$ct = openssl_encrypt( $plain, 'aes-256-cbc', enc_key(), OPENSSL_RAW_DATA, $iv );
	if ( false === $ct ) {
		return $plain;
	}
	return ENC_PREFIX . base64_encode( $iv . $ct ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Encoding binary ciphertext for text storage, not obfuscation.
}

/**
 * Decrypt a stored secret. Values without the marker are legacy plaintext and
 * returned unchanged (so existing installs keep working). A failed decrypt
 * returns '' — the UI then simply shows the key as unset for re-entry.
 *
 * @param string $stored Stored value.
 * @return string
 */
function decrypt_secret( $stored ) {
	$stored = (string) $stored;
	if ( 0 !== strpos( $stored, ENC_PREFIX ) ) {
		return $stored;
	}
	if ( ! function_exists( 'openssl_decrypt' ) ) {
		return '';
	}
	$raw = base64_decode( substr( $stored, strlen( ENC_PREFIX ) ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Decoding stored binary ciphertext, not obfuscation.
	if ( false === $raw || strlen( $raw ) <= 16 ) {
		return '';
	}
	$iv = substr( $raw, 0, 16 );
	$ct = substr( $raw, 16 );
	$pt = openssl_decrypt( $ct, 'aes-256-cbc', enc_key(), OPENSSL_RAW_DATA, $iv );
	return false === $pt ? '' : $pt;
}

/**
 * Raw stored settings with secrets decrypted (server-side only, never sent
 * as-is). Legacy plaintext secrets pass through untouched.
 *
 * @return array<string,mixed>
 */
function raw() {
	$stored = get_option( OPTION, array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}
	$defaults         = defaults();
	$stored['stripe'] = array_merge( $defaults['stripe'], isset( $stored['stripe'] ) && is_array( $stored['stripe'] ) ? $stored['stripe'] : array() );
	foreach ( secret_keys() as $k ) {
		$stored['stripe'][ $k ] = decrypt_secret( (string) $stored['stripe'][ $k ] );
	}
	return $stored;
}

/**
 * Persist settings whose secrets are currently in plaintext form (as returned
 * by raw()), encrypting every secret field before writing. Use this anywhere
 * that mutates the raw() array and saves it, so encryption is never bypassed.
 *
 * @param array<string,mixed> $raw Settings with plaintext secrets.
 * @return void
 */
function store( $raw ) {
	if ( isset( $raw['stripe'] ) && is_array( $raw['stripe'] ) ) {
		foreach ( secret_keys() as $k ) {
			$raw['stripe'][ $k ] = encrypt_secret( isset( $raw['stripe'][ $k ] ) ? (string) $raw['stripe'][ $k ] : '' );
		}
	}
	update_option( OPTION, $raw );
}

/**
 * One-time migration: encrypt any plaintext secrets already in the database.
 * Safe to call repeatedly (already-encrypted or empty values are skipped).
 *
 * @return void
 */
function encrypt_existing() {
	if ( ! function_exists( 'openssl_encrypt' ) ) {
		return;
	}
	$stored = get_option( OPTION );
	if ( ! is_array( $stored ) || empty( $stored['stripe'] ) || ! is_array( $stored['stripe'] ) ) {
		return;
	}
	$changed = false;
	foreach ( secret_keys() as $k ) {
		$val = isset( $stored['stripe'][ $k ] ) ? (string) $stored['stripe'][ $k ] : '';
		if ( '' !== $val && 0 !== strpos( $val, ENC_PREFIX ) ) {
			$stored['stripe'][ $k ] = encrypt_secret( $val );
			$changed                = true;
		}
	}
	if ( $changed ) {
		update_option( OPTION, $stored );
	}
}

/**
 * Client-safe view of the settings — publishable keys are public, secrets are
 * reduced to a boolean "is it set?".
 *
 * @return array<string,mixed>
 */
function get_public() {
	$raw = raw();
	$s   = $raw['stripe'];
	$url = webhook_url();
	return array(
		'stripe' => array(
			'enabled'         => (bool) $s['enabled'],
			'mode'            => 'live' === $s['mode'] ? 'live' : 'test',
			'testPublishable' => (string) $s['test_publishable'],
			'livePublishable' => (string) $s['live_publishable'],
			'testSecretSet'   => '' !== (string) $s['test_secret'],
			'liveSecretSet'   => '' !== (string) $s['live_secret'],
			'testWebhookSet'  => '' !== (string) $s['test_webhook_secret'],
			'liveWebhookSet'  => '' !== (string) $s['live_webhook_secret'],
			'webhookUrl'      => $url,
			'webhookable'     => is_public_https( $url ),
		),
	);
}

/**
 * The URL Stripe should call for webhook events on this site.
 *
 * @return string
 */
function webhook_url() {
	return rest_url( 'dinekit/v1/stripe-webhook' );
}

/**
 * Whether a URL is a public HTTPS endpoint Stripe can actually reach — Stripe
 * rejects http and non-routable hosts (localhost, *.local/.test dev sites), so
 * auto-registration is only offered when the site is genuinely public.
 *
 * @param string $url Candidate URL.
 * @return bool
 */
function is_public_https( $url ) {
	$host = wp_parse_url( $url, PHP_URL_HOST );
	if ( 'https' !== wp_parse_url( $url, PHP_URL_SCHEME ) || ! is_string( $host ) || '' === $host ) {
		return false;
	}
	$host = strtolower( $host );
	if ( in_array( $host, array( 'localhost', '127.0.0.1', '::1' ), true ) ) {
		return false;
	}
	foreach ( array( '.local', '.test', '.localhost', '.invalid', '.example' ) as $suffix ) {
		if ( substr( $host, -strlen( $suffix ) ) === $suffix ) {
			return false;
		}
	}
	// Bare private IPv4 ranges are also unreachable from Stripe.
	if ( filter_var( $host, FILTER_VALIDATE_IP ) && ! filter_var( $host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
		return false;
	}
	return true;
}

/**
 * Save Stripe settings. Publishable keys and the mode/enabled flags are always
 * applied; secret keys are only overwritten when a new non-empty value is sent
 * (so the UI never has to echo an existing secret back). Sending the literal
 * "__clear__" wipes a secret.
 *
 * @param array<string,mixed> $data Incoming settings.
 * @return array<string,mixed> Client-safe settings.
 */
function save( $data ) {
	$raw   = raw();
	$in    = isset( $data['stripe'] ) && is_array( $data['stripe'] ) ? $data['stripe'] : array();
	$strip = $raw['stripe'];

	if ( isset( $in['enabled'] ) ) {
		$strip['enabled'] = (bool) $in['enabled'];
	}
	if ( isset( $in['mode'] ) ) {
		$strip['mode'] = 'live' === $in['mode'] ? 'live' : 'test';
	}
	foreach ( array(
		'testPublishable' => 'test_publishable',
		'livePublishable' => 'live_publishable',
	) as $param => $key ) {
		if ( isset( $in[ $param ] ) ) {
			$strip[ $key ] = sanitize_text_field( (string) $in[ $param ] );
		}
	}
	$secret_map = array(
		'testSecret'        => 'test_secret',
		'liveSecret'        => 'live_secret',
		'testWebhookSecret' => 'test_webhook_secret',
		'liveWebhookSecret' => 'live_webhook_secret',
	);
	foreach ( $secret_map as $param => $key ) {
		if ( ! isset( $in[ $param ] ) ) {
			continue;
		}
		$value = (string) $in[ $param ];
		if ( '__clear__' === $value ) {
			$strip[ $key ] = '';
		} elseif ( '' !== $value ) {
			$strip[ $key ] = sanitize_text_field( $value );
		}
	}

	// Persist with secrets encrypted at rest (publishable keys stay plain).
	$raw['stripe'] = $strip;
	store( $raw );
	return get_public();
}

/**
 * Whether Stripe is configured enough to take payments (used later by B10).
 *
 * @return bool
 */
function stripe_ready() {
	$s  = raw()['stripe'];
	$pk = 'live' === $s['mode'] ? $s['live_publishable'] : $s['test_publishable'];
	$sk = 'live' === $s['mode'] ? $s['live_secret'] : $s['test_secret'];
	return $s['enabled'] && '' !== $pk && '' !== $sk;
}

/**
 * The secret key for the active mode (server-side only).
 *
 * @return string
 */
function active_secret() {
	$s = raw()['stripe'];
	return (string) ( 'live' === $s['mode'] ? $s['live_secret'] : $s['test_secret'] );
}

/**
 * The publishable key for the active mode (safe to send to the browser).
 *
 * @return string
 */
function active_publishable() {
	$s = raw()['stripe'];
	return (string) ( 'live' === $s['mode'] ? $s['live_publishable'] : $s['test_publishable'] );
}

/**
 * The webhook signing secret for the active mode (server-side only).
 *
 * @return string
 */
function active_webhook_secret() {
	$s = raw()['stripe'];
	return (string) ( 'live' === $s['mode'] ? $s['live_webhook_secret'] : $s['test_webhook_secret'] );
}

/**
 * Validate the saved keys against Stripe's API — the "Test connection" action.
 * Uses the merchant's own secret key server-side; the key never reaches the
 * browser. Returns account status so the UI can confirm it's really connected.
 *
 * @return array<string,mixed>
 */
function test_connection() {
	$s    = raw()['stripe'];
	$mode = 'live' === $s['mode'] ? 'live' : 'test';
	$sk   = active_secret();
	if ( '' === $sk ) {
		return array(
			'valid' => false,
			'mode'  => $mode,
			'error' => __( 'Add and save your secret key for this mode first.', 'dinekit' ),
		);
	}

	$res = wp_remote_get(
		'https://api.stripe.com/v1/account',
		array(
			'headers' => array( 'Authorization' => 'Bearer ' . $sk ),
			'timeout' => 15,
		)
	);
	if ( is_wp_error( $res ) ) {
		return array(
			'valid' => false,
			'mode'  => $mode,
			'error' => $res->get_error_message(),
		);
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$body = json_decode( (string) wp_remote_retrieve_body( $res ), true );
	if ( 200 !== $code ) {
		return array(
			'valid' => false,
			'mode'  => $mode,
			'error' => isset( $body['error']['message'] ) ? (string) $body['error']['message'] : __( 'Stripe rejected the key.', 'dinekit' ),
		);
	}

	// The key prefix is the source of truth for live vs test.
	$is_live = ( 0 === strpos( $sk, 'sk_live' ) || 0 === strpos( $sk, 'rk_live' ) );
	$name    = '';
	if ( isset( $body['business_profile']['name'] ) && '' !== (string) $body['business_profile']['name'] ) {
		$name = (string) $body['business_profile']['name'];
	} elseif ( isset( $body['email'] ) ) {
		$name = (string) $body['email'];
	}
	return array(
		'valid'          => true,
		'mode'           => $is_live ? 'live' : 'test',
		'account'        => $name,
		'chargesEnabled' => ! empty( $body['charges_enabled'] ),
		'modeMismatch'   => ( $is_live ? 'live' : 'test' ) !== $mode,
	);
}

/**
 * Minimal Stripe API request using the active-mode secret key (no SDK). Handles
 * GET / POST (form-encoded) / DELETE.
 *
 * @param string              $method HTTP method.
 * @param string              $path   API path, e.g. 'webhook_endpoints'.
 * @param array<string,mixed> $body   Form fields (POST only).
 * @return array{code:int,json:array<string,mixed>}|\WP_Error
 */
function stripe_request( $method, $path, $body = array() ) {
	$sk = active_secret();
	if ( '' === $sk ) {
		return new \WP_Error( 'dinekit_stripe_nokey', __( 'Add and save your secret key for this mode first.', 'dinekit' ) );
	}
	$args = array(
		'method'  => $method,
		'headers' => array( 'Authorization' => 'Bearer ' . $sk ),
		'timeout' => 20,
	);
	if ( ! empty( $body ) ) {
		$args['headers']['Content-Type'] = 'application/x-www-form-urlencoded';
		$args['body']                    = $body;
	}
	$res = wp_remote_request( 'https://api.stripe.com/v1/' . $path, $args );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
	return array(
		'code' => (int) wp_remote_retrieve_response_code( $res ),
		'json' => is_array( $json ) ? $json : array(),
	);
}

/**
 * Auto-register (or refresh) the Stripe webhook endpoint for the active mode and
 * capture its signing secret — so the merchant never has to create a webhook or
 * copy a whsec_ by hand. Any previous DineKit endpoint pointing at this site is
 * removed first so the stored secret always matches the live endpoint.
 *
 * @return array<string,mixed>
 */
function register_webhook() {
	$raw  = raw();
	$s    = $raw['stripe'];
	$mode = 'live' === $s['mode'] ? 'live' : 'test';
	$url  = webhook_url();

	if ( '' === active_secret() ) {
		return array(
			'ok'    => false,
			'error' => __( 'Add and save your secret key for this mode first.', 'dinekit' ),
		);
	}
	if ( ! is_public_https( $url ) ) {
		return array(
			'ok'    => false,
			'error' => __( 'Stripe can only send webhooks to a public HTTPS address. This looks like a local/dev site — deploy to your live domain, then run this there.', 'dinekit' ),
			'url'   => $url,
		);
	}

	// Remove any prior DineKit endpoint(s) for this exact URL — the signing
	// secret is only returned at creation, so we always recreate to stay in sync.
	$existing = stripe_request( 'GET', 'webhook_endpoints?limit=100' );
	if ( ! is_wp_error( $existing ) && 200 === $existing['code'] ) {
		foreach ( (array) ( $existing['json']['data'] ?? array() ) as $ep ) {
			if ( isset( $ep['url'], $ep['id'] ) && $ep['url'] === $url ) {
				stripe_request( 'DELETE', 'webhook_endpoints/' . rawurlencode( (string) $ep['id'] ) );
			}
		}
	}

	$create = stripe_request(
		'POST',
		'webhook_endpoints',
		array(
			'url'            => $url,
			'enabled_events' => array( 'payment_intent.succeeded', 'payment_intent.amount_capturable_updated', 'payment_intent.payment_failed' ),
			'description'    => 'DineKit — ' . home_url(),
			'metadata'       => array( 'dinekit' => '1' ),
		)
	);
	if ( is_wp_error( $create ) ) {
		return array(
			'ok'    => false,
			'error' => $create->get_error_message(),
		);
	}
	if ( 200 !== $create['code'] && 201 !== $create['code'] ) {
		return array(
			'ok'    => false,
			'error' => isset( $create['json']['error']['message'] ) ? (string) $create['json']['error']['message'] : __( 'Stripe could not create the webhook.', 'dinekit' ),
		);
	}

	$secret = (string) ( $create['json']['secret'] ?? '' );
	$id     = (string) ( $create['json']['id'] ?? '' );
	if ( '' === $secret ) {
		return array(
			'ok'    => false,
			'error' => __( 'Stripe created the webhook but returned no signing secret.', 'dinekit' ),
		);
	}

	$raw['stripe'][ $mode . '_webhook_secret' ] = $secret;
	$raw['stripe'][ $mode . '_webhook_id' ]     = $id;
	store( $raw );

	// Best-effort: register this domain so Apple Pay / Google Pay can appear in
	// the Payment Element. Non-fatal — wallets are a bonus, not required.
	$wallets = register_payment_domain();

	return array(
		'ok'      => true,
		'mode'    => $mode,
		'url'     => $url,
		'events'  => 2,
		'wallets' => $wallets,
	);
}

/**
 * Register this site's domain with Stripe so Apple Pay / Google Pay can render
 * in the Payment Element. Stripe manages the Apple Pay domain-association file
 * automatically for Elements integrations, so no local well-known file is
 * needed. Idempotent: if the domain already exists we fetch and return its
 * status instead of erroring. Requires a secret key + a public HTTPS host, so
 * it no-ops on local/dev sites.
 *
 * @return array<string,mixed>
 */
function register_payment_domain() {
	$host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
	if ( '' === active_secret() || '' === $host || ! is_public_https( 'https://' . $host . '/' ) ) {
		return array( 'ok' => false );
	}

	$res = stripe_request( 'POST', 'payment_method_domains', array( 'domain_name' => $host ) );
	if ( is_wp_error( $res ) ) {
		return array(
			'ok'    => false,
			'error' => $res->get_error_message(),
		);
	}

	// If it already exists, Stripe returns 400 — look it up and use that record.
	if ( ! in_array( (int) $res['code'], array( 200, 201 ), true ) ) {
		$list = stripe_request( 'GET', 'payment_method_domains?domain_name=' . rawurlencode( $host ) . '&limit=1' );
		if ( ! is_wp_error( $list ) && 200 === (int) $list['code'] && ! empty( $list['json']['data'][0] ) ) {
			$res = array(
				'code' => 200,
				'json' => $list['json']['data'][0],
			);
		} else {
			$msg = isset( $res['json']['error']['message'] ) ? (string) $res['json']['error']['message'] : __( 'Stripe could not register the domain.', 'dinekit' );
			return array(
				'ok'    => false,
				'error' => $msg,
			);
		}
	}

	$json = isset( $res['json'] ) && is_array( $res['json'] ) ? $res['json'] : array();
	return array(
		'ok'     => true,
		'domain' => $host,
		'apple'  => isset( $json['apple_pay']['status'] ) ? (string) $json['apple_pay']['status'] : '',
		'google' => isset( $json['google_pay']['status'] ) ? (string) $json['google_pay']['status'] : '',
	);
}
