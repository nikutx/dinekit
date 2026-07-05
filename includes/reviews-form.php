<?php
/**
 * Public first-party feedback page for the [dinekit_feedback] shortcode.
 * Shows a private star + comment form AND the same public-review links to every
 * diner (no gating). assets/js/dinekit-feedback.js posts to the public endpoint.
 *
 * @package DineKit
 */

namespace DineKit\Reviews\Form;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Render the feedback page for a token.
 *
 * @param string $token Feedback token.
 * @return string
 */
function render( $token ) {
	require_once DINEKIT_DIR . 'includes/reviews.php';
	$booking = \DineKit\Reviews\booking_by_token( $token );
	if ( ! $booking ) {
		return '<div class="dinekit-booking dinekit-booking--off"><p>' .
			esc_html__( 'This feedback link is not valid.', 'dinekit' ) . '</p></div>';
	}

	wp_enqueue_style( 'dinekit-booking' );
	wp_enqueue_script( 'dinekit-feedback' );

	$cfg       = \DineKit\Reviews\get();
	$site      = get_bloginfo( 'name' );
	$submitted = '' !== (string) get_post_meta( $booking->ID, 'dinekit_fb_at', true );

	$config = wp_json_encode(
		array(
			'restUrl' => esc_url_raw( rest_url( 'dinekit/v1/' ) ),
			'token'   => $token,
			'nonce'   => wp_create_nonce( 'wp_rest' ),
			'i18n'    => array(
				'thanks'       => __( 'Thank you — your feedback is in.', 'dinekit' ),
				'needRating'   => __( 'Please choose a star rating.', 'dinekit' ),
				'genericError' => __( 'Sorry, something went wrong. Please try again.', 'dinekit' ),
				'networkError' => __( 'Network error — please try again.', 'dinekit' ),
				'alsoPublic'   => __( 'Happy to share it publicly? It really helps us:', 'dinekit' ),
			),
		),
		JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
	);

	// Public-review links block — identical for everyone, shown before and after.
	$links = '';
	if ( '' !== $cfg['google_url'] || '' !== $cfg['tripadvisor_url'] ) {
		$links .= '<div class="dinekit-feedback__public">';
		$links .= '<p class="dinekit-feedback__public-label">' . esc_html__( 'Leave a public review:', 'dinekit' ) . '</p>';
		if ( '' !== $cfg['google_url'] ) {
			$links .= '<a class="dinekit-feedback__link" href="' . esc_url( $cfg['google_url'] ) . '" target="_blank" rel="noopener nofollow">' . esc_html__( 'Review on Google', 'dinekit' ) . '</a>';
		}
		if ( '' !== $cfg['tripadvisor_url'] ) {
			$links .= '<a class="dinekit-feedback__link" href="' . esc_url( $cfg['tripadvisor_url'] ) . '" target="_blank" rel="noopener nofollow">' . esc_html__( 'Review on TripAdvisor', 'dinekit' ) . '</a>';
		}
		$links .= '</div>';
	}

	ob_start();
	?>
	<div class="dinekit-booking dinekit-feedback" data-dinekit-feedback="<?php echo esc_attr( $config ); ?>">
		<h3 class="dinekit-booking__heading"><?php echo esc_html( $site ); ?></h3>
		<?php if ( $submitted ) : ?>
			<p class="dinekit-booking__intro"><?php esc_html_e( 'Thanks — we’ve already got your feedback.', 'dinekit' ); ?></p>
			<?php echo $links; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from esc_* above. ?>
		<?php else : ?>
			<p class="dinekit-booking__intro"><?php echo esc_html( $cfg['message'] ); ?></p>
			<form class="dinekit-booking__form dinekit-feedback__form" novalidate>
				<div class="dinekit-feedback__stars" role="radiogroup" aria-label="<?php esc_attr_e( 'Rating', 'dinekit' ); ?>">
					<?php for ( $i = 1; $i <= 5; $i++ ) : ?>
						<label class="dinekit-feedback__star" data-star="<?php echo esc_attr( (string) $i ); ?>">
							<input type="radio" name="rating" value="<?php echo esc_attr( (string) $i ); ?>">
							<span aria-hidden="true">★</span>
							<span class="screen-reader-text"><?php echo esc_html( (string) $i ); ?></span>
						</label>
					<?php endfor; ?>
				</div>
				<label class="dinekit-booking__field dinekit-booking__field--full">
					<span><?php esc_html_e( 'Tell us more (optional)', 'dinekit' ); ?></span>
					<textarea name="comment" rows="3"></textarea>
				</label>
				<div class="dinekit-booking__hp" aria-hidden="true">
					<label><?php esc_html_e( 'Leave empty', 'dinekit' ); ?><input type="text" name="hp" tabindex="-1" autocomplete="off"></label>
				</div>
				<button type="submit" class="dinekit-booking__submit"><?php esc_html_e( 'Send feedback', 'dinekit' ); ?></button>
				<p class="dinekit-booking__result" role="alert"></p>
			</form>
			<?php echo $links; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from esc_* above. ?>
		<?php endif; ?>
	</div>
	<?php
	return trim( (string) ob_get_clean() );
}
