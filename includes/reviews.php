<?php
/**
 * Reviews & retention — settings for post-visit review requests and win-back.
 *
 * Compliance is baked in: DineKit asks EVERY diner the same way and shows the
 * SAME public-review link to everyone. "Review gating" (sending only happy
 * diners to public sites, or diverting unhappy ones to a private form instead)
 * is unlawful in the UK (DMCC Act / CMA), against Google policy and caught by
 * the US FTC — so it is deliberately impossible here. Private feedback runs in
 * parallel for everyone, never as a filter, and incentives never touch the
 * public-review path.
 *
 * Data lives in the `dinekit_reviews` option — portable, no custom tables.
 *
 * @package DineKit
 */

namespace DineKit\Reviews;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_reviews';

/**
 * Boot the module.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
	add_action( 'init', __NAMESPACE__ . '\\register_frontend' );
	add_action( 'init', __NAMESPACE__ . '\\schedule_cron' );
	add_action( 'dinekit_review_cron', __NAMESPACE__ . '\\run_scheduled' );
	add_shortcode( 'dinekit_feedback', __NAMESPACE__ . '\\feedback_shortcode' );
}

/**
 * Ensure the hourly review-request cron is scheduled.
 *
 * @return void
 */
function schedule_cron() {
	if ( ! wp_next_scheduled( 'dinekit_review_cron' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', 'dinekit_review_cron' );
	}
}

/**
 * Cron worker: email a review request to recent diners whose visit finished at
 * least `delay_hours` ago and who haven't been asked yet. Soft opt-in only
 * (confirmed bookings with an email); capped per run.
 *
 * @return void
 */
function run_scheduled() {
	$cfg = get();
	if ( empty( $cfg['enabled'] ) ) {
		return;
	}
	$delay = (int) $cfg['delay_hours'] * HOUR_IN_SECONDS;
	$now   = time();
	$from  = gmdate( 'Y-m-d', $now - 7 * DAY_IN_SECONDS ); // Don't reach back further than a week.
	$to    = gmdate( 'Y-m-d', $now );

	$query = new \WP_Query(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'no_found_rows'  => true,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'     => 'dinekit_date',
					'value'   => array( $from, $to ),
					'compare' => 'BETWEEN',
					'type'    => 'DATE',
				),
			),
		)
	);

	$sent = 0;
	foreach ( $query->posts as $id ) {
		if ( $sent >= 50 ) {
			break;
		}
		if ( '' !== (string) get_post_meta( $id, 'dinekit_review_sent', true ) ) {
			continue; // Already asked.
		}
		if ( ! in_array( (string) get_post_meta( $id, 'dinekit_status', true ), array( 'confirmed', 'seated' ), true ) ) {
			continue;
		}
		$date = (string) get_post_meta( $id, 'dinekit_date', true );
		$time = (string) get_post_meta( $id, 'dinekit_time', true );
		$ts   = strtotime( $date . ' ' . ( $time ? $time : '20:00' ) . ':00' );
		if ( ! $ts || ( $ts + $delay ) > $now ) {
			continue; // Visit hasn't finished long enough ago.
		}
		if ( true === send_request( $id ) ) {
			++$sent;
		}
	}
}

/**
 * Register the public feedback page assets.
 *
 * @return void
 */
function register_frontend() {
	// The .dinekit-booking styles are registered by the bookings module (always
	// loaded); we reuse them for the feedback page and just add its script.
	wp_register_script( 'dinekit-feedback', DINEKIT_URL . 'assets/js/dinekit-feedback.js', array(), DINEKIT_VERSION, true );
}

/**
 * Manage permission.
 *
 * @return bool
 */
function can_manage() {
	return current_user_can( 'manage_options' );
}

/**
 * Default settings.
 *
 * @return array<string,mixed>
 */
function defaults() {
	return array(
		'enabled'         => false,
		'delay_hours'     => 3,     // Send this long after the visit (used by the scheduler, later).
		'google_url'      => '',    // Google "write a review" deep link (g.page/r/…).
		'tripadvisor_url' => '',   // Optional second public destination.
		'message'         => __( 'Thanks for dining with us — we’d love to hear how it went.', 'dinekit' ),
		'jog_memory'      => true,  // Remind the diner what they ordered.
		'offer'           => '',    // Win-back incentive text (e.g. "10% off your next visit").
		'low_threshold'   => 3,     // Private ratings at or below this alert the manager.
		'notify_email'    => '',    // Manager alert recipient (empty = site admin).
		'consent_note'    => __( 'We may email you once about your visit to ask for feedback. Unsubscribe any time.', 'dinekit' ),
	);
}

/**
 * Get the stored settings merged over defaults.
 *
 * @return array<string,mixed>
 */
function get() {
	$stored = get_option( OPTION );
	return is_array( $stored ) ? wp_parse_args( $stored, defaults() ) : defaults();
}

/**
 * Sanitize + save settings.
 *
 * @param array<string,mixed> $input Raw input.
 * @return array<string,mixed> The saved settings.
 */
function save( $input ) {
	$current = get();

	$current['enabled']    = ! empty( $input['enabled'] );
	$current['jog_memory'] = ! empty( $input['jog_memory'] );

	if ( isset( $input['delay_hours'] ) ) {
		$current['delay_hours'] = max( 0, min( 168, absint( $input['delay_hours'] ) ) );
	}
	if ( isset( $input['low_threshold'] ) ) {
		$current['low_threshold'] = max( 1, min( 5, absint( $input['low_threshold'] ) ) );
	}
	foreach ( array( 'google_url', 'tripadvisor_url' ) as $key ) {
		if ( isset( $input[ $key ] ) ) {
			$current[ $key ] = esc_url_raw( trim( (string) $input[ $key ] ) );
		}
	}
	if ( isset( $input['notify_email'] ) ) {
		$email                   = sanitize_email( (string) $input['notify_email'] );
		$current['notify_email'] = is_email( $email ) ? $email : '';
	}
	foreach ( array( 'message', 'offer', 'consent_note' ) as $key ) {
		if ( isset( $input[ $key ] ) ) {
			$current[ $key ] = sanitize_textarea_field( (string) $input[ $key ] );
		}
	}

	update_option( OPTION, $current );
	return $current;
}

/**
 * Register REST routes.
 *
 * @return void
 */
function register_routes() {
	$ns = 'dinekit/v1';
	register_rest_route(
		$ns,
		'/reviews',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_get',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\rest_save',
				'permission_callback' => __NAMESPACE__ . '\\can_manage',
			),
		)
	);
	// Admin: received feedback + trigger a request for a booking.
	register_rest_route(
		$ns,
		'/reviews/feedback',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_feedback_list',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	register_rest_route(
		$ns,
		'/reviews/request/(?P<id>\d+)',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\rest_request',
			'permission_callback' => __NAMESPACE__ . '\\can_manage',
		)
	);
	// Public: view a feedback prompt by token + submit a rating.
	register_rest_route(
		$ns,
		'/feedback/(?P<token>[a-z0-9]+)',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\public_feedback',
				'permission_callback' => '__return_true',
			),
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => __NAMESPACE__ . '\\public_submit',
				'permission_callback' => '__return_true',
			),
		)
	);
}

/**
 * GET /reviews.
 *
 * @return \WP_REST_Response
 */
function rest_get() {
	return rest_ensure_response( get() );
}

/**
 * POST /reviews.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_save( $request ) {
	return rest_ensure_response( save( (array) $request->get_json_params() ) );
}

/* -------------------------------------------------------------------------- */
/* Review requests + first-party feedback                                     */
/* -------------------------------------------------------------------------- */

/**
 * The per-booking feedback token (minted on first use).
 *
 * @param int $booking_id Booking id.
 * @return string
 */
function review_token( $booking_id ) {
	$t = (string) get_post_meta( $booking_id, 'dinekit_review_token', true );
	if ( '' === $t ) {
		$t = strtolower( wp_generate_password( 20, false, false ) );
		update_post_meta( $booking_id, 'dinekit_review_token', $t );
	}
	return $t;
}

/**
 * Find a booking by its feedback token.
 *
 * @param string $token Token.
 * @return \WP_Post|null
 */
function booking_by_token( $token ) {
	if ( '' === $token ) {
		return null;
	}
	$posts = get_posts(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			'meta_key'       => 'dinekit_review_token', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'     => sanitize_text_field( $token ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	return $posts ? $posts[0] : null;
}

/**
 * URL of the page hosting [dinekit_feedback] — found or created on demand.
 *
 * @return string
 */
function feedback_page_url() {
	$page_id = (int) get_option( 'dinekit_feedback_page' );
	if ( $page_id && 'publish' === get_post_status( $page_id ) ) {
		return (string) get_permalink( $page_id );
	}
	$found = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
			's'              => '[dinekit_feedback]',
		)
	);
	if ( $found ) {
		update_option( 'dinekit_feedback_page', $found[0]->ID );
		return (string) get_permalink( $found[0]->ID );
	}
	$id = wp_insert_post(
		array(
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => __( 'Your feedback', 'dinekit' ),
			'post_content' => '[dinekit_feedback]',
		)
	);
	if ( $id && ! is_wp_error( $id ) ) {
		update_option( 'dinekit_feedback_page', $id );
		return (string) get_permalink( $id );
	}
	return home_url( '/' );
}

/**
 * Send a diner their post-visit review request. Same message + same public
 * links for everyone (no gating).
 *
 * @param int $booking_id Booking id.
 * @return bool|\WP_Error
 */
function send_request( $booking_id ) {
	require_once DINEKIT_DIR . 'includes/bookings/emails.php';
	$cfg   = get();
	$email = (string) get_post_meta( $booking_id, 'dinekit_email', true );
	$name  = (string) get_post_meta( $booking_id, 'dinekit_name', true );
	if ( ! is_email( $email ) ) {
		return new \WP_Error( 'dinekit_review_email', __( 'This booking has no valid email address.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$token = review_token( $booking_id );
	$link  = add_query_arg( 'dkfb', $token, feedback_page_url() );
	$site  = get_bloginfo( 'name' );

	$html  = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">';
	$html .= '<h2 style="font-size:20px;margin:0 0 8px">' . esc_html( $site ) . '</h2>';
	/* translators: %s: guest name. */
	$html .= '<p style="font-size:15px;color:#334155;margin:0 0 6px">' . esc_html( sprintf( __( 'Hi %s,', 'dinekit' ), $name ) ) . '</p>';
	$html .= '<p style="font-size:15px;color:#334155;margin:0 0 16px">' . esc_html( $cfg['message'] ) . '</p>';
	$html .= '<p style="margin:0 0 20px"><a href="' . esc_url( $link ) . '" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">' . esc_html__( 'Share your feedback', 'dinekit' ) . '</a></p>';
	if ( '' !== trim( (string) $cfg['offer'] ) ) {
		$html .= '<p style="font-size:14px;color:#0f172a;margin:0 0 16px;padding:12px 14px;background:#eef2ff;border-radius:8px"><strong>' . esc_html__( 'Come back soon:', 'dinekit' ) . '</strong> ' . esc_html( $cfg['offer'] ) . '</p>';
	}
	$html .= '<p style="font-size:12px;color:#94a3b8;margin:16px 0 0">' . esc_html__( 'You’re receiving this because you recently booked with us. Reply STOP to unsubscribe.', 'dinekit' ) . '</p>';
	$html .= '</div>';

	/* translators: %s: site name. */
	$subject = sprintf( __( 'How was your visit to %s?', 'dinekit' ), $site );
	\DineKit\Bookings\Emails\send( $email, $subject, $html );

	update_post_meta( $booking_id, 'dinekit_review_sent', (string) time() );
	return true;
}

/**
 * POST /reviews/request/:id — staff triggers a request for a booking.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function rest_request( $request ) {
	$id     = (int) $request['id'];
	$result = send_request( $id );
	if ( is_wp_error( $result ) ) {
		return $result;
	}
	return rest_ensure_response(
		array(
			'ok'   => true,
			'link' => add_query_arg( 'dkfb', review_token( $id ), feedback_page_url() ),
		)
	);
}

/**
 * GET /feedback/:token — public feedback prompt (same public links for all).
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function public_feedback( $request ) {
	$booking = booking_by_token( (string) $request['token'] );
	if ( ! $booking ) {
		return new \WP_Error( 'dinekit_fb_missing', __( 'Feedback link not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	$cfg = get();
	return rest_ensure_response(
		array(
			'site'      => get_bloginfo( 'name' ),
			'message'   => $cfg['message'],
			'googleUrl' => $cfg['google_url'],
			'tripUrl'   => $cfg['tripadvisor_url'],
			'submitted' => '' !== (string) get_post_meta( $booking->ID, 'dinekit_fb_at', true ),
		)
	);
}

/**
 * POST /feedback/:token — a diner submits a private rating + comment. Low
 * ratings alert the manager; the public links are still returned to everyone.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function public_submit( $request ) {
	$booking = booking_by_token( (string) $request['token'] );
	if ( ! $booking ) {
		return new \WP_Error( 'dinekit_fb_missing', __( 'Feedback link not found.', 'dinekit' ), array( 'status' => 404 ) );
	}
	// Honeypot + light rate limit.
	if ( '' !== trim( (string) $request->get_param( 'hp' ) ) ) {
		return rest_ensure_response( array( 'ok' => true ) );
	}
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'na';
	$rl   = 'dinekit_fb_rl_' . md5( $ip );
	$hits = (int) get_transient( $rl );
	if ( $hits >= 20 ) {
		return new \WP_Error( 'dinekit_fb_rl', __( 'Too many attempts — please try again later.', 'dinekit' ), array( 'status' => 429 ) );
	}
	set_transient( $rl, $hits + 1, HOUR_IN_SECONDS );

	$cfg     = get();
	$rating  = max( 1, min( 5, absint( $request->get_param( 'rating' ) ) ) );
	$comment = sanitize_textarea_field( (string) $request->get_param( 'comment' ) );

	update_post_meta( $booking->ID, 'dinekit_fb_rating', $rating );
	update_post_meta( $booking->ID, 'dinekit_fb_comment', $comment );
	update_post_meta( $booking->ID, 'dinekit_fb_at', (string) time() );

	if ( $rating <= (int) $cfg['low_threshold'] ) {
		alert_manager( $booking->ID, $rating, $comment );
	}

	return rest_ensure_response(
		array(
			'ok'        => true,
			'googleUrl' => $cfg['google_url'],
			'tripUrl'   => $cfg['tripadvisor_url'],
		)
	);
}

/**
 * Email the manager about a low private rating so they can put it right.
 *
 * @param int    $booking_id Booking id.
 * @param int    $rating     Rating 1–5.
 * @param string $comment    Diner comment.
 * @return void
 */
function alert_manager( $booking_id, $rating, $comment ) {
	require_once DINEKIT_DIR . 'includes/bookings/emails.php';
	$cfg  = get();
	$to   = ! empty( $cfg['notify_email'] ) && is_email( $cfg['notify_email'] ) ? $cfg['notify_email'] : (string) get_option( 'admin_email' );
	$name = (string) get_post_meta( $booking_id, 'dinekit_name', true );
	$date = (string) get_post_meta( $booking_id, 'dinekit_date', true );

	$html  = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">';
	$html .= '<h2 style="font-size:18px;margin:0 0 8px;color:#e11d48">' . esc_html__( 'A guest left low feedback', 'dinekit' ) . '</h2>';
	$html .= '<p style="font-size:14px;margin:0 0 4px"><strong>' . esc_html( $name ) . '</strong> — ' . esc_html( $date ) . '</p>';
	/* translators: %d: star rating out of 5. */
	$html .= '<p style="font-size:14px;margin:0 0 4px">' . esc_html( sprintf( __( 'Rating: %d/5', 'dinekit' ), $rating ) ) . '</p>';
	if ( '' !== $comment ) {
		$html .= '<p style="font-size:14px;margin:8px 0 0;padding:10px 12px;background:#fff1f2;border-radius:8px">' . esc_html( $comment ) . '</p>';
	}
	$html .= '<p style="font-size:13px;color:#64748b;margin:16px 0 0">' . esc_html__( 'Reach out and make it right — a quick recovery often wins the guest back.', 'dinekit' ) . '</p>';
	$html .= '</div>';

	\DineKit\Bookings\Emails\send( $to, __( 'Low guest feedback — please follow up', 'dinekit' ), $html );
}

/**
 * GET /reviews/feedback — received feedback for the admin inbox.
 *
 * @return \WP_REST_Response
 */
function rest_feedback_list() {
	$posts = get_posts(
		array(
			'post_type'      => 'dinekit_booking',
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'no_found_rows'  => true,
			'meta_key'       => 'dinekit_fb_at', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'orderby'        => 'meta_value_num',
			'order'          => 'DESC',
		)
	);
	$out   = array();
	foreach ( $posts as $post ) {
		$out[] = array(
			'id'      => (int) $post->ID,
			'name'    => (string) get_post_meta( $post->ID, 'dinekit_name', true ),
			'date'    => (string) get_post_meta( $post->ID, 'dinekit_date', true ),
			'rating'  => (int) get_post_meta( $post->ID, 'dinekit_fb_rating', true ),
			'comment' => (string) get_post_meta( $post->ID, 'dinekit_fb_comment', true ),
		);
	}
	return rest_ensure_response( $out );
}

/**
 * [dinekit_feedback] — the public feedback page for ?dkfb=TOKEN.
 *
 * @return string
 */
function feedback_shortcode() {
	require_once DINEKIT_DIR . 'includes/reviews-form.php';
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only page keyed by an unguessable token.
	$token = isset( $_GET['dkfb'] ) ? sanitize_text_field( wp_unslash( $_GET['dkfb'] ) ) : '';
	return Form\render( $token );
}
