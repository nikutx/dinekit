<?php
/**
 * Leaving questionnaire — one polite question when DineKit is deactivated.
 *
 * Clicking Deactivate on the Plugins screen opens a small dialog asking why,
 * with an offer of help. It exists so a free plugin can learn what it's getting
 * wrong across many venues, and so someone who's stuck can be rescued instead of
 * lost.
 *
 * Privacy, and the rules this follows:
 *
 * - NOTHING is sent unless the owner picks an answer and presses send. "Skip"
 *   deactivates with no request at all, and if this JavaScript fails to load or
 *   errors, the normal WordPress deactivate link still works untouched. The
 *   questionnaire can never trap someone in the plugin.
 * - The dialog lists exactly what will be sent before it's sent, and the
 *   submission itself is the consent.
 * - It's anonymous. The site address and an email address are attached ONLY if
 *   the owner ticks "you can email me about this".
 * - The payload is assembled server-side from this site's own data, so what's
 *   listed in the dialog is what actually leaves.
 *
 * Disclosed in readme.txt "External services".
 *
 * @package DineKit
 */

namespace DineKit\Leaving;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook registration.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
	add_action( 'admin_enqueue_scripts', __NAMESPACE__ . '\\enqueue' );
	add_action( 'admin_footer', __NAMESPACE__ . '\\render_dialog' );
}

/**
 * Only someone who could deactivate the plugin can answer for this site.
 *
 * @return bool
 */
function can_answer() {
	return current_user_can( 'activate_plugins' );
}

/**
 * Is this the Plugins screen, for a user who can deactivate?
 *
 * @return bool
 */
function on_plugins_screen() {
	if ( ! can_answer() || ! function_exists( 'get_current_screen' ) ) {
		return false;
	}
	$screen = get_current_screen();
	return $screen && 'plugins' === $screen->id;
}

/**
 * The answers offered, in the order shown. `help` turns the answer into a
 * rescue: the ones we can actually do something about invite a reply.
 *
 * @return array<int,array<string,string>>
 */
function reasons() {
	return array(
		array(
			'key'   => 'temporary',
			'label' => __( 'Just switching it off for a bit', 'dinekit' ),
			'help'  => '',
		),
		array(
			'key'   => 'missing_feature',
			'label' => __( 'It’s missing something my venue needs', 'dinekit' ),
			'help'  => __( 'Which feature? DineKit is built from requests like this — the last release came almost entirely from one restaurant’s notes.', 'dinekit' ),
		),
		array(
			'key'   => 'not_working',
			'label' => __( 'I couldn’t get it working', 'dinekit' ),
			'help'  => __( 'What went wrong? Tick the box below and we’ll reply personally — most of these turn out to be a five-minute fix.', 'dinekit' ),
		),
		array(
			'key'   => 'hard_to_use',
			'label' => __( 'It felt too complicated', 'dinekit' ),
			'help'  => __( 'Where did it lose you? Even one sentence helps us simplify the right screen.', 'dinekit' ),
		),
		array(
			'key'   => 'not_what_expected',
			'label' => __( 'It wasn’t what I expected', 'dinekit' ),
			'help'  => __( 'What were you hoping for?', 'dinekit' ),
		),
		array(
			'key'   => 'found_better',
			'label' => __( 'I found something better', 'dinekit' ),
			'help'  => __( 'Which one? Genuinely useful to know — no hard feelings.', 'dinekit' ),
		),
		array(
			'key'   => 'no_longer_needed',
			'label' => __( 'I don’t need it any more', 'dinekit' ),
			'help'  => '',
		),
		array(
			'key'   => 'other',
			'label' => __( 'Something else', 'dinekit' ),
			'help'  => '',
		),
	);
}

/**
 * A rough picture of how far this venue got, so an answer like "missing a
 * feature" can be read against a real setup rather than in the dark. Counts
 * only — never any content.
 *
 * @return array<string,int>
 */
function usage_snapshot() {
	$dishes = wp_count_posts( 'dinekit_menu_item' );
	$orders = wp_count_posts( 'dinekit_order' );
	$menus  = wp_count_terms(
		array(
			'taxonomy'   => 'dinekit_menu',
			'hide_empty' => false,
		)
	);

	return array(
		'menus'    => is_wp_error( $menus ) ? 0 : max( 0, (int) $menus ),
		'dishes'   => isset( $dishes->publish ) ? (int) $dishes->publish : 0,
		'orders'   => $orders ? (int) array_sum( (array) $orders ) : 0,
		'bookings' => (int) wp_count_posts( 'dinekit_booking' )->publish,
	);
}

/**
 * Days since this site first activated DineKit.
 *
 * @return int
 */
function install_days() {
	$activated = (int) get_option( 'dinekit_activated_at', 0 );
	if ( ! $activated ) {
		return 0;
	}
	return max( 0, (int) floor( ( time() - $activated ) / DAY_IN_SECONDS ) );
}

/**
 * REST routes.
 *
 * @return void
 */
function register_routes() {
	register_rest_route(
		'dinekit/v1',
		'/leaving',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\submit',
			'permission_callback' => __NAMESPACE__ . '\\can_answer',
		)
	);
}

/**
 * POST /leaving — forward the owner's answer to the Web Level Up hub.
 *
 * Called only from the dialog's send button. The site's own details are
 * gathered here rather than trusted from the browser.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function submit( $request ) {
	require_once DINEKIT_DIR . 'includes/support.php';

	$valid  = wp_list_pluck( reasons(), 'key' );
	$reason = sanitize_key( (string) $request->get_param( 'reason' ) );
	if ( ! in_array( $reason, $valid, true ) ) {
		return new \WP_Error( 'dinekit_bad_reason', __( 'Please choose an answer.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$payload = array(
		'plugin_slug'    => 'dinekit',
		'plugin_version' => DINEKIT_VERSION,
		'event'          => 'deactivate',
		'reason'         => $reason,
		'comment'        => sanitize_textarea_field( (string) $request->get_param( 'comment' ) ),
		'wp_version'     => get_bloginfo( 'version' ),
		'php_version'    => PHP_VERSION,
		'locale'         => get_locale(),
		'install_days'   => install_days(),
		'usage'          => usage_snapshot(),
	);

	// Contact details travel only with an explicit yes.
	$email = sanitize_email( (string) $request->get_param( 'contact_email' ) );
	if ( $request->get_param( 'contact' ) && is_email( $email ) ) {
		$payload['contact_email'] = $email;
		$payload['site_url']      = home_url();
	}

	$response = wp_remote_post(
		\DineKit\Support\hub_url() . '/wp-json/wlu-com/v1/public/feedback',
		array(
			'timeout' => 10,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( $payload ),
		)
	);

	if ( is_wp_error( $response ) ) {
		return new \WP_Error( 'dinekit_leaving_failed', $response->get_error_message(), array( 'status' => 502 ) );
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	if ( $code < 200 || $code > 299 ) {
		return new \WP_Error( 'dinekit_leaving_failed', __( 'Could not send your answer.', 'dinekit' ), array( 'status' => 502 ) );
	}

	return rest_ensure_response( array( 'sent' => true ) );
}

/**
 * Load the dialog's script on the Plugins screen only.
 *
 * @return void
 */
function enqueue() {
	if ( ! on_plugins_screen() ) {
		return;
	}

	wp_enqueue_script(
		'dinekit-leaving',
		DINEKIT_URL . 'assets/js/dinekit-leaving.js',
		array(),
		DINEKIT_VERSION,
		true
	);
	wp_localize_script(
		'dinekit-leaving',
		'DINEKIT_LEAVING',
		array(
			'plugin'  => plugin_basename( DINEKIT_FILE ),
			'restUrl' => esc_url_raw( rest_url( 'dinekit/v1/leaving' ) ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
		)
	);
}

/**
 * The dialog markup, printed once on the Plugins screen. Hidden until the
 * script shows it — and if the script never runs, this is inert and the normal
 * deactivate link behaves exactly as WordPress intended.
 *
 * @return void
 */
function render_dialog() {
	if ( ! on_plugins_screen() ) {
		return;
	}

	$current_user = wp_get_current_user();
	$usage        = usage_snapshot();
	?>
	<div class="dinekit-lv" id="dinekit-lv" hidden>
		<div class="dinekit-lv__backdrop" data-dinekit-lv-cancel></div>
		<div class="dinekit-lv__panel" role="dialog" aria-modal="true" aria-labelledby="dinekit-lv-title">
			<h2 id="dinekit-lv-title"><?php esc_html_e( 'Before you go — can we help?', 'dinekit' ); ?></h2>
			<p class="dinekit-lv__lead">
				<?php esc_html_e( 'DineKit is free and built from what restaurants tell us. If you have ten seconds, telling us why helps us fix it for the next venue. Answering is entirely optional.', 'dinekit' ); ?>
			</p>

			<div class="dinekit-lv__reasons">
				<?php foreach ( reasons() as $reason ) : ?>
					<label class="dinekit-lv__reason">
						<input type="radio" name="dinekit-lv-reason" value="<?php echo esc_attr( $reason['key'] ); ?>" data-help="<?php echo esc_attr( $reason['help'] ); ?>">
						<span><?php echo esc_html( $reason['label'] ); ?></span>
					</label>
				<?php endforeach; ?>
			</div>

			<div class="dinekit-lv__detail" hidden>
				<p class="dinekit-lv__help" id="dinekit-lv-help"></p>
				<textarea id="dinekit-lv-comment" rows="3" placeholder="<?php esc_attr_e( 'Anything you want to add (optional)', 'dinekit' ); ?>"></textarea>
				<label class="dinekit-lv__contact">
					<input type="checkbox" id="dinekit-lv-contact">
					<span><?php esc_html_e( 'You can email me about this', 'dinekit' ); ?></span>
				</label>
				<input type="email" id="dinekit-lv-email" value="<?php echo esc_attr( $current_user->user_email ); ?>" hidden>
			</div>

			<details class="dinekit-lv__what">
				<summary><?php esc_html_e( 'What gets sent', 'dinekit' ); ?></summary>
				<ul>
					<li><?php esc_html_e( 'Your answer above, and anything you type in the box.', 'dinekit' ); ?></li>
					<li>
						<?php
						printf(
							/* translators: 1: DineKit version, 2: WordPress version, 3: PHP version */
							esc_html__( 'Version numbers: DineKit %1$s, WordPress %2$s, PHP %3$s.', 'dinekit' ),
							esc_html( DINEKIT_VERSION ),
							esc_html( get_bloginfo( 'version' ) ),
							esc_html( PHP_VERSION )
						);
						?>
					</li>
					<li>
						<?php
						printf(
							/* translators: 1: days installed, 2: menu count, 3: dish count, 4: order count, 5: booking count */
							esc_html__( 'How far you got: %1$d days installed, %2$d menus, %3$d dishes, %4$d orders, %5$d bookings. Counts only — never your menu content, your customers or your takings.', 'dinekit' ),
							(int) install_days(),
							(int) $usage['menus'],
							(int) $usage['dishes'],
							(int) $usage['orders'],
							(int) $usage['bookings']
						);
						?>
					</li>
					<li><?php esc_html_e( 'Your email address and site address — only if you tick the box above.', 'dinekit' ); ?></li>
				</ul>
				<p><?php esc_html_e( 'It goes to Web Level Up, who make DineKit. Nothing is sent if you skip.', 'dinekit' ); ?></p>
			</details>

			<p class="dinekit-lv__error" id="dinekit-lv-error" hidden></p>

			<div class="dinekit-lv__actions">
				<button type="button" class="button button-primary" id="dinekit-lv-send" disabled>
					<?php esc_html_e( 'Send &amp; deactivate', 'dinekit' ); ?>
				</button>
				<button type="button" class="button" id="dinekit-lv-skip">
					<?php esc_html_e( 'Skip &amp; deactivate', 'dinekit' ); ?>
				</button>
				<button type="button" class="button-link dinekit-lv__cancel" data-dinekit-lv-cancel>
					<?php esc_html_e( 'Cancel', 'dinekit' ); ?>
				</button>
			</div>
		</div>
	</div>
	<style>
		.dinekit-lv{position:fixed;inset:0;z-index:100050;display:flex;align-items:center;justify-content:center}
		.dinekit-lv[hidden]{display:none}
		.dinekit-lv__backdrop{position:absolute;inset:0;background:rgba(24,24,27,.55)}
		.dinekit-lv__panel{position:relative;background:#fff;border-radius:10px;max-width:540px;width:calc(100% - 32px);max-height:90vh;overflow:auto;padding:24px;box-shadow:0 12px 32px rgba(24,24,27,.22)}
		.dinekit-lv__panel h2{margin:0 0 6px;font-size:19px}
		.dinekit-lv__lead{margin:0 0 16px;color:#50575e}
		.dinekit-lv__reason{display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer}
		.dinekit-lv__reason:hover{background:#f6f7f7}
		.dinekit-lv__reason input{margin-top:3px}
		.dinekit-lv__detail{margin-top:12px}
		.dinekit-lv__help{margin:0 0 8px;color:#3c434a}
		.dinekit-lv__detail textarea{width:100%}
		.dinekit-lv__contact{display:flex;align-items:center;gap:8px;margin-top:10px;color:#3c434a}
		.dinekit-lv__detail input[type=email]{width:100%;margin-top:8px}
		.dinekit-lv__what{margin-top:16px;color:#50575e;font-size:13px}
		.dinekit-lv__what summary{cursor:pointer}
		.dinekit-lv__what ul{margin:8px 0 0 18px;list-style:disc}
		.dinekit-lv__error{color:#b32d2e;margin:12px 0 0}
		.dinekit-lv__actions{display:flex;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}
		.dinekit-lv__cancel{margin-left:auto;color:#50575e;text-decoration:underline;cursor:pointer}
	</style>
	<?php
}
