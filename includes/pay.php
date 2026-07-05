<?php
/**
 * Pay-by-QR — a customer scans a QR at the table and settles the bill (or a
 * share) on their own phone via the Payment Element. A standalone hosted pay
 * page (no theme), plus two public REST routes. Payment is fulfilled by the
 * Stripe webhook, which records a card tender on the tab (see payments.php).
 *
 * @package DineKit
 */

namespace DineKit\Pay;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boot: public routes + the virtual pay page.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
	add_action( 'template_redirect', __NAMESPACE__ . '\\maybe_render_page' );
}

/**
 * Ensure an order has a pay-by-QR token; returns it.
 *
 * @param int $order_id Order id.
 * @return string
 */
function ensure_token( $order_id ) {
	$token = (string) get_post_meta( $order_id, 'dinekit_order_pay_token', true );
	if ( '' === $token ) {
		$token = wp_generate_password( 24, false );
		update_post_meta( $order_id, 'dinekit_order_pay_token', $token );
	}
	return $token;
}

/**
 * Find an order id by its pay token.
 *
 * @param string $token Token.
 * @return int 0 if not found.
 */
function order_by_token( $token ) {
	if ( '' === $token ) {
		return 0;
	}
	$posts = get_posts(
		array(
			'post_type'      => 'dinekit_order',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_key'       => 'dinekit_order_pay_token', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => $token, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	return $posts ? (int) $posts[0] : 0;
}

/**
 * Public status for a pay token — used by the pay page and POS polling.
 *
 * @param int $order_id Order id.
 * @return array<string,mixed>
 */
function status_payload( $order_id ) {
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	require_once DINEKIT_DIR . 'includes/integrations.php';
	require_once DINEKIT_DIR . 'includes/settings.php';
	$grand   = \DineKit\Ordering\grand_total( $order_id );
	$tenders = json_decode( (string) get_post_meta( $order_id, 'dinekit_order_tenders', true ), true );
	$paid    = 0.0;
	foreach ( is_array( $tenders ) ? $tenders : array() as $t ) {
		$paid += (float) $t['amount'];
	}
	$settings = \DineKit\Settings\get();
	$table_id = (int) get_post_meta( $order_id, 'dinekit_order_table_id', true );
	return array(
		'number'      => (int) get_post_meta( $order_id, 'dinekit_order_number', true ),
		'table'       => $table_id ? (string) get_the_title( $table_id ) : '',
		'balance'     => round( $grand - $paid, 2 ),
		'grand'       => $grand,
		'currency'    => (string) $settings['currency'],
		'currencyPos' => 'after' === $settings['currencyPosition'] ? 'after' : 'before',
		'ready'       => \DineKit\Integrations\stripe_ready(),
	);
}

/**
 * Register public routes: GET /pay/:token and POST /pay/:token/intent.
 *
 * @return void
 */
function register_routes() {
	$ns   = 'dinekit/v1';
	$args = array(
		'token' => array(
			'validate_callback' => static function ( $v ) {
				return is_string( $v ) && preg_match( '/^[A-Za-z0-9]+$/', $v );
			},
		),
	);
	register_rest_route(
		$ns,
		'/pay/(?P<token>[A-Za-z0-9]+)',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_status',
			'permission_callback' => '__return_true',
			'args'                => $args,
		)
	);
	register_rest_route(
		$ns,
		'/pay/(?P<token>[A-Za-z0-9]+)/intent',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_intent',
			'permission_callback' => '__return_true',
			'args'                => $args,
		)
	);
}

/**
 * GET /pay/:token.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_status( $request ) {
	$id = order_by_token( (string) $request['token'] );
	if ( ! $id ) {
		return new \WP_Error( 'dinekit_pay_404', __( 'This payment link is not valid.', 'dinekit' ), array( 'status' => 404 ) );
	}
	return rest_ensure_response( status_payload( $id ) );
}

/**
 * POST /pay/:token/intent — create a PaymentIntent for the balance (or a
 * requested amount, capped at the balance). Immediate capture.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_intent( $request ) {
	require_once DINEKIT_DIR . 'includes/payments.php';
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$id = order_by_token( (string) $request['token'] );
	if ( ! $id ) {
		return new \WP_Error( 'dinekit_pay_404', __( 'This payment link is not valid.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$st    = status_payload( $id );
	$req   = (float) $request->get_param( 'amount' );
	$amt   = $req > 0 ? min( $req, (float) $st['balance'] ) : (float) $st['balance'];
	$pence = (int) round( $amt * 100 );
	if ( $pence < 1 ) {
		return new \WP_Error( 'dinekit_pay_settled', __( 'This bill is already paid.', 'dinekit' ), array( 'status' => 400 ) );
	}
	$intent = \DineKit\Payments\stripe_post(
		'payment_intents',
		array(
			'amount'                             => $pence,
			'currency'                           => 'gbp',
			'automatic_payment_methods[enabled]' => 'true',
			'metadata[order_id]'                 => (string) $id,
			'metadata[pos_pay]'                  => '1',
			'metadata[site]'                     => home_url(),
		)
	);
	if ( is_wp_error( $intent ) ) {
		return $intent;
	}
	return rest_ensure_response(
		array(
			'clientSecret'   => (string) ( $intent['client_secret'] ?? '' ),
			'publishableKey' => \DineKit\Integrations\active_publishable(),
			'amount'         => $pence,
		)
	);
}

/**
 * Render the standalone hosted pay page when ?dinekit_pay=<token> is present.
 *
 * @return void
 */
function maybe_render_page() {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- public read-only page keyed by an unguessable token.
	$token = isset( $_GET['dinekit_pay'] ) ? preg_replace( '/[^A-Za-z0-9]/', '', wp_unslash( $_GET['dinekit_pay'] ) ) : '';
	if ( '' === $token ) {
		return;
	}
	$id = order_by_token( $token );
	require_once DINEKIT_DIR . 'includes/integrations.php';
	$st  = $id ? status_payload( $id ) : null;
	$sym = $st ? ( 'after' === $st['currencyPos'] ? '' : $st['currency'] ) : '';
	$cfg = wp_json_encode(
		array(
			'restUrl'     => esc_url_raw( rest_url( 'dinekit/v1/' ) ),
			'token'       => $token,
			'valid'       => (bool) $id,
			'ready'       => $st ? (bool) $st['ready'] : false,
			'balance'     => $st ? $st['balance'] : 0,
			'number'      => $st ? $st['number'] : 0,
			'table'       => $st ? $st['table'] : '',
			'currency'    => $st ? $st['currency'] : '£',
			'currencyPos' => $st ? $st['currencyPos'] : 'before',
		)
	);

	nocache_headers();
	header( 'Content-Type: text/html; charset=utf-8' );
	// Standalone page: it exits before wp_head/wp_footer, so assets must be
	// output inline rather than enqueued.
	// phpcs:disable WordPress.WP.EnqueuedResources
	?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
	<meta name="robots" content="noindex, nofollow">
	<title><?php echo esc_html( sprintf( /* translators: %s: site name. */ __( 'Pay your bill · %s', 'dinekit' ), get_bloginfo( 'name' ) ) ); ?></title>
	<script src="https://js.stripe.com/v3/"></script>
	<script>window.DINEKIT_PAY = <?php echo $cfg; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wp_json_encode output. ?>;</script>
	<link rel="stylesheet" href="<?php echo esc_url( DINEKIT_URL . 'assets/css/pay.css' ); ?>?v=<?php echo esc_attr( DINEKIT_VERSION ); ?>">
</head>
<body class="dinekit-pay-body">
	<div class="dinekit-pay-card">
		<div class="dinekit-pay-head">
			<div class="dinekit-pay-site"><?php echo esc_html( get_bloginfo( 'name' ) ); ?></div>
			<div id="dk-pay-sub" class="dinekit-pay-sub"></div>
		</div>
		<div id="dk-pay-amount" class="dinekit-pay-amount"></div>
		<div id="dk-pay-element"></div>
		<p id="dk-pay-error" class="dinekit-pay-error" role="alert"></p>
		<button id="dk-pay-btn" class="dinekit-pay-btn" type="button" disabled></button>
		<div id="dk-pay-done" class="dinekit-pay-done" hidden>
			<div class="dinekit-pay-tick">✓</div>
			<p><?php esc_html_e( 'Payment received — thank you!', 'dinekit' ); ?></p>
		</div>
		<div class="dinekit-pay-foot"><?php esc_html_e( 'Secured by Stripe', 'dinekit' ); ?></div>
	</div>
	<script src="<?php echo esc_url( DINEKIT_URL . 'assets/js/dinekit-pay.js' ); ?>?v=<?php echo esc_attr( DINEKIT_VERSION ); ?>"></script>
</body>
</html>
	<?php
	// phpcs:enable WordPress.WP.EnqueuedResources
	exit;
}
