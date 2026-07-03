<?php
/**
 * Public event pre-order page (server-rendered) for the [dinekit_event]
 * shortcode. Guests pick one dish per course and flag allergens/dietary needs;
 * assets/js/dinekit-event.js posts it to the public REST endpoint.
 *
 * @package DineKit
 */

namespace DineKit\Events\Form;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Render the event page for a share token.
 *
 * @param string $token Share token.
 * @return string
 */
function render( $token ) {
	require_once DINEKIT_DIR . 'includes/events/events.php';
	$event = \DineKit\Events\event_by_token( $token );

	if ( ! $event || 'published' !== get_post_meta( $event->ID, 'dk_event_status', true ) ) {
		return '<div class="dinekit-booking dinekit-booking--off"><p>' .
			esc_html__( 'This event link is not valid.', 'dinekit' ) . '</p></div>';
	}

	wp_enqueue_style( 'dinekit-event' );
	wp_enqueue_script( 'dinekit-event' );

	$menu     = (int) get_post_meta( $event->ID, 'dk_event_menu', true );
	$date     = (string) get_post_meta( $event->ID, 'dk_event_date', true );
	$time     = (string) get_post_meta( $event->ID, 'dk_event_time', true );
	$intro    = (string) get_post_meta( $event->ID, 'dk_event_intro', true );
	$deadline = (string) get_post_meta( $event->ID, 'dk_event_deadline', true );
	$courses  = $menu ? \DineKit\Events\courses( $menu ) : array();

	$closed = ( '' !== $deadline && strtotime( $deadline . ' 23:59:59' ) < (int) current_time( 'timestamp' ) );
	$cap    = (int) get_post_meta( $event->ID, 'dk_event_capacity', true );
	if ( ! $closed && $cap > 0 ) {
		$taken = count(
			get_posts(
				array(
					'post_type'      => 'dk_guest',
					'post_status'    => 'publish',
					'posts_per_page' => -1,
					'fields'         => 'ids',
					'no_found_rows'  => true,
					'meta_key'       => 'dk_guest_event', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
					'meta_value'     => (int) $event->ID, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				)
			)
		);
		if ( $taken >= $cap ) {
			$closed = true; // Event is at capacity — a submit is also blocked server-side.
		}
	}

	$config = wp_json_encode(
		array(
			'restUrl' => esc_url_raw( rest_url( 'dinekit/v1/' ) ),
			'token'   => $token,
			'nonce'   => wp_create_nonce( 'wp_rest' ),
			'i18n'    => array(
				'needName'     => __( 'Please enter your name.', 'dinekit' ),
				'submitted'    => __( 'Your choices are in', 'dinekit' ),
				'genericError' => __( 'Sorry, something went wrong. Please try again.', 'dinekit' ),
				'networkError' => __( 'Network error — please try again.', 'dinekit' ),
			),
		),
		JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
	);

	$when = trim( $date . ( $time ? ' · ' . $time : '' ) );

	ob_start();
	?>
	<div class="dinekit-booking dinekit-event" data-dinekit-event="<?php echo esc_attr( $config ); ?>">
		<h3 class="dinekit-booking__heading"><?php echo esc_html( $event->post_title ); ?></h3>
		<?php if ( '' !== $when ) : ?>
			<p class="dinekit-event__when"><?php echo esc_html( $when ); ?></p>
		<?php endif; ?>
		<?php if ( '' !== $intro ) : ?>
			<p class="dinekit-booking__intro"><?php echo esc_html( $intro ); ?></p>
		<?php endif; ?>

		<?php if ( $closed ) : ?>
			<p class="dinekit-booking__note"><?php esc_html_e( 'Orders for this event are now closed.', 'dinekit' ); ?></p>
		<?php else : ?>
			<form class="dinekit-booking__form dinekit-event__form" novalidate>
				<div class="dinekit-booking__grid">
					<label class="dinekit-booking__field">
						<span><?php esc_html_e( 'Your name', 'dinekit' ); ?></span>
						<input type="text" name="name" autocomplete="name" required>
					</label>
					<label class="dinekit-booking__field">
						<span><?php esc_html_e( 'Email (optional)', 'dinekit' ); ?></span>
						<input type="email" name="email" autocomplete="email">
					</label>
				</div>

				<?php foreach ( $courses as $course ) : ?>
					<fieldset class="dinekit-event__course" data-section="<?php echo esc_attr( (string) $course['id'] ); ?>">
						<legend><?php echo esc_html( $course['name'] ); ?></legend>
						<?php foreach ( $course['items'] as $i => $item ) : ?>
							<label class="dinekit-event__opt">
								<input type="radio" name="course_<?php echo esc_attr( (string) $course['id'] ); ?>" value="<?php echo esc_attr( (string) $item['id'] ); ?>"<?php echo 0 === $i ? ' checked' : ''; ?>>
								<span><?php echo esc_html( $item['title'] ); ?></span>
							</label>
						<?php endforeach; ?>
					</fieldset>
				<?php endforeach; ?>

				<?php
				$allergens = get_terms( array( 'taxonomy' => 'dk_allergen', 'hide_empty' => false ) );
				$dietary   = get_terms( array( 'taxonomy' => 'dk_dietary', 'hide_empty' => false ) );
				?>
				<?php if ( is_array( $allergens ) && $allergens ) : ?>
					<div class="dinekit-event__group">
						<span class="dinekit-event__group-label"><?php esc_html_e( 'Any allergies? Tick what you must avoid:', 'dinekit' ); ?></span>
						<div class="dinekit-event__chips">
							<?php foreach ( $allergens as $term ) : ?>
								<label class="dinekit-event__chip">
									<input type="checkbox" name="allergens[]" value="<?php echo esc_attr( (string) $term->term_id ); ?>">
									<span><?php echo esc_html( $term->name ); ?></span>
								</label>
							<?php endforeach; ?>
						</div>
					</div>
				<?php endif; ?>
				<?php if ( is_array( $dietary ) && $dietary ) : ?>
					<div class="dinekit-event__group">
						<span class="dinekit-event__group-label"><?php esc_html_e( 'Dietary preferences:', 'dinekit' ); ?></span>
						<div class="dinekit-event__chips">
							<?php foreach ( $dietary as $term ) : ?>
								<label class="dinekit-event__chip">
									<input type="checkbox" name="dietary[]" value="<?php echo esc_attr( (string) $term->term_id ); ?>">
									<span><?php echo esc_html( $term->name ); ?></span>
								</label>
							<?php endforeach; ?>
						</div>
					</div>
				<?php endif; ?>

				<label class="dinekit-booking__field dinekit-booking__field--full">
					<span><?php esc_html_e( 'Anything else we should know?', 'dinekit' ); ?></span>
					<textarea name="notes" rows="2"></textarea>
				</label>

				<div class="dinekit-booking__hp" aria-hidden="true">
					<label><?php esc_html_e( 'Leave empty', 'dinekit' ); ?><input type="text" name="hp" tabindex="-1" autocomplete="off"></label>
				</div>

				<button type="submit" class="dinekit-booking__submit"><?php esc_html_e( 'Submit my choices', 'dinekit' ); ?></button>
				<p class="dinekit-booking__result" aria-live="polite"></p>
			</form>
		<?php endif; ?>
	</div>
	<?php
	return trim( (string) ob_get_clean() );
}
