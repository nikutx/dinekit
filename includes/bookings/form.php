<?php
/**
 * Public booking widget — server-rendered form for the [dinekit_booking]
 * shortcode and the dinekit/booking block. All behaviour (slots, availability,
 * submit) is handled by assets/js/dinekit-booking.js talking to the public REST
 * endpoints. No React, no jQuery.
 *
 * @package DineKit
 */

namespace DineKit\Bookings\Form;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Render the booking form.
 *
 * @param array<string,mixed> $atts Attributes (heading, intro).
 * @return string
 */
function render( $atts = array() ) {
	require_once DINEKIT_DIR . 'includes/bookings/settings.php';
	$cfg = \DineKit\Bookings\Settings\public_config();

	wp_enqueue_style( 'dinekit-booking' );
	wp_enqueue_script( 'dinekit-booking' );

	$heading = isset( $atts['heading'] ) ? (string) $atts['heading'] : __( 'Book a table', 'dinekit' );
	$intro   = isset( $atts['intro'] ) && '' !== $atts['intro']
		? (string) $atts['intro']
		: (string) \DineKit\Bookings\Settings\get()['intro'];

	if ( empty( $cfg['onlineEnabled'] ) ) {
		return '<div class="dinekit-booking dinekit-booking--off"><p>' .
			esc_html__( 'Online booking is currently closed. Please call us to reserve a table.', 'dinekit' ) .
			'</p></div>';
	}

	// Config the front-end JS reads from a data attribute (cache-safe, supports
	// multiple instances per page).
	$config = wp_json_encode(
		array_merge(
			$cfg,
			array(
				'restUrl' => esc_url_raw( rest_url( 'dinekit/v1/' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'i18n'    => array(
					'available'     => __( 'Available', 'dinekit' ),
					'availableReq'  => __( 'Available — request it below', 'dinekit' ),
					'deposit'       => __( 'deposit applies', 'dinekit' ),
					'notAvailable'  => __( 'Not available then — try another time', 'dinekit' ),
					'closedDay'     => __( 'Sorry, we’re closed that day.', 'dinekit' ),
					'waitlistOffer' => __( 'Fully booked — you can join the waitlist', 'dinekit' ),
					'joinWaitlist'  => __( 'Join the waitlist', 'dinekit' ),
					'waitlisted'    => __( 'You’re on the waitlist', 'dinekit' ),
					'needNameEmail' => __( 'Please enter your name and a valid email.', 'dinekit' ),
					'tableBooked'   => __( 'Table booked', 'dinekit' ),
					'requestSent'   => __( 'Request sent', 'dinekit' ),
					'genericError'  => __( 'Sorry, something went wrong. Please try again.', 'dinekit' ),
					'networkError'  => __( 'Network error — please try again.', 'dinekit' ),
				),
			)
		),
		JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
	);

	$min_party     = max( 1, (int) $cfg['minParty'] );
	$default_party = min( max( 2, $min_party ), (int) $cfg['maxParty'] );
	$party_options = '';
	for ( $i = $min_party; $i <= (int) $cfg['maxParty']; $i++ ) {
		$party_options .= '<option value="' . esc_attr( (string) $i ) . '"' . ( $default_party === $i ? ' selected' : '' ) . '>' .
			/* translators: %d: number of guests. */
			esc_html( sprintf( _n( '%d guest', '%d guests', $i, 'dinekit' ), $i ) ) . '</option>';
	}

	$deposit_note = '';
	if ( (int) $cfg['depositOver'] > 0 ) {
		$deposit_note = '<p class="dinekit-booking__note">' . esc_html(
			sprintf(
				/* translators: 1: party size, 2: currency symbol, 3: amount. */
				__( 'Parties of %1$d or more may require a %2$s%3$d per person deposit.', 'dinekit' ),
				(int) $cfg['depositOver'],
				$cfg['currency'],
				(int) $cfg['depositAmount']
			)
		) . '</p>';
	}

	// Widget branding — inline CSS-var overrides + optional dark style.
	$settings   = \DineKit\Bookings\Settings\get();
	$style_vars = \DineKit\Bookings\Settings\widget_style_vars();
	$classes    = 'dinekit-booking';
	if ( 'dark' === $settings['widget_style'] ) {
		$classes .= ' dinekit-booking--dark';
	}

	ob_start();
	?>
	<div class="<?php echo esc_attr( $classes ); ?>" style="<?php echo esc_attr( $style_vars ); ?>" data-dinekit-booking="<?php echo esc_attr( $config ); ?>">
		<?php if ( '' !== $heading ) : ?>
			<h3 class="dinekit-booking__heading"><?php echo esc_html( $heading ); ?></h3>
		<?php endif; ?>
		<?php if ( '' !== $intro ) : ?>
			<p class="dinekit-booking__intro"><?php echo esc_html( $intro ); ?></p>
		<?php endif; ?>

		<form class="dinekit-booking__form" novalidate>
			<div class="dinekit-booking__grid">
				<label class="dinekit-booking__field">
					<span><?php esc_html_e( 'Date', 'dinekit' ); ?></span>
					<input type="date" name="date" required>
				</label>
				<label class="dinekit-booking__field">
					<span><?php esc_html_e( 'Time', 'dinekit' ); ?></span>
					<select name="time" required></select>
				</label>
				<label class="dinekit-booking__field">
					<span><?php esc_html_e( 'Guests', 'dinekit' ); ?></span>
					<select name="party" required><?php echo $party_options; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from esc_* above. ?></select>
				</label>
			</div>

			<p class="dinekit-booking__availability" aria-live="polite"></p>

			<div class="dinekit-booking__grid">
				<label class="dinekit-booking__field">
					<span><?php esc_html_e( 'Name', 'dinekit' ); ?></span>
					<input type="text" name="name" autocomplete="name" required>
				</label>
				<label class="dinekit-booking__field">
					<span><?php esc_html_e( 'Email', 'dinekit' ); ?></span>
					<input type="email" name="email" autocomplete="email" required>
				</label>
				<label class="dinekit-booking__field">
					<span><?php esc_html_e( 'Phone', 'dinekit' ); ?></span>
					<input type="tel" name="phone" autocomplete="tel">
				</label>
			</div>

			<label class="dinekit-booking__field dinekit-booking__field--full">
				<span><?php esc_html_e( 'Anything we should know? (allergies, occasion…)', 'dinekit' ); ?></span>
				<textarea name="notes" rows="2"></textarea>
			</label>

			<?php // Honeypot — hidden from real users, catches bots. ?>
			<div class="dinekit-booking__hp" aria-hidden="true">
				<label><?php esc_html_e( 'Leave this field empty', 'dinekit' ); ?>
					<input type="text" name="hp" tabindex="-1" autocomplete="off">
				</label>
			</div>

			<?php echo $deposit_note; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from esc_html above. ?>

			<button type="submit" class="dinekit-booking__submit">
				<?php echo empty( $cfg['autoConfirm'] ) ? esc_html__( 'Request booking', 'dinekit' ) : esc_html__( 'Book now', 'dinekit' ); ?>
			</button>
			<p class="dinekit-booking__result" aria-live="polite"></p>
		</form>
	</div>
	<?php
	return trim( (string) ob_get_clean() );
}
