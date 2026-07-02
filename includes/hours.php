<?php
/**
 * Opening hours: storage, open-now logic, frontend render + LocalBusiness
 * schema. Data lives in the `dinekit_hours` option (portable, no tables).
 *
 * @package DineKit
 */

namespace DineKit\Hours;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const OPTION = 'dinekit_hours';

/**
 * Ordered day keys (Mon–Sun) with their display labels.
 *
 * @return array<string,string>
 */
function days() {
	return array(
		'mon' => __( 'Monday', 'dinekit' ),
		'tue' => __( 'Tuesday', 'dinekit' ),
		'wed' => __( 'Wednesday', 'dinekit' ),
		'thu' => __( 'Thursday', 'dinekit' ),
		'fri' => __( 'Friday', 'dinekit' ),
		'sat' => __( 'Saturday', 'dinekit' ),
		'sun' => __( 'Sunday', 'dinekit' ),
	);
}

/**
 * Default hours structure.
 *
 * @return array<string,mixed>
 */
function defaults() {
	$week = array();
	foreach ( array_keys( days() ) as $key ) {
		$week[ $key ] = array(); // Empty = closed.
	}
	return array(
		'week'     => $week,
		'holidays' => array(), // [ { date:Y-m-d, closed:bool, periods:[{open,close}], note } ].
		'name'     => get_bloginfo( 'name' ),
	);
}

/**
 * Get the stored hours (merged over defaults).
 *
 * @return array<string,mixed>
 */
function get() {
	$stored = get_option( OPTION );
	if ( ! is_array( $stored ) ) {
		return defaults();
	}
	return wp_parse_args( $stored, defaults() );
}

/**
 * Sanitize + save hours.
 *
 * @param array<string,mixed> $input Raw hours.
 * @return array<string,mixed> The saved (sanitized) hours.
 */
function save( $input ) {
	$clean = defaults();

	if ( isset( $input['name'] ) ) {
		$clean['name'] = sanitize_text_field( (string) $input['name'] );
	}

	if ( isset( $input['week'] ) && is_array( $input['week'] ) ) {
		foreach ( array_keys( days() ) as $key ) {
			$clean['week'][ $key ] = isset( $input['week'][ $key ] )
				? sanitize_periods( $input['week'][ $key ] )
				: array();
		}
	}

	if ( isset( $input['holidays'] ) && is_array( $input['holidays'] ) ) {
		foreach ( $input['holidays'] as $holiday ) {
			if ( ! is_array( $holiday ) || empty( $holiday['date'] ) ) {
				continue;
			}
			$date = preg_replace( '/[^0-9\-]/', '', (string) $holiday['date'] );
			if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
				continue;
			}
			$clean['holidays'][] = array(
				'date'    => $date,
				'closed'  => ! empty( $holiday['closed'] ),
				'periods' => isset( $holiday['periods'] ) ? sanitize_periods( $holiday['periods'] ) : array(),
				'note'    => isset( $holiday['note'] ) ? sanitize_text_field( (string) $holiday['note'] ) : '',
			);
		}
	}

	update_option( OPTION, $clean );
	return $clean;
}

/**
 * Sanitize a list of {open,close} periods into HH:MM 24h strings.
 *
 * @param mixed $periods Raw periods.
 * @return array<int,array{open:string,close:string}>
 */
function sanitize_periods( $periods ) {
	if ( ! is_array( $periods ) ) {
		return array();
	}
	$clean = array();
	foreach ( $periods as $period ) {
		if ( ! is_array( $period ) ) {
			continue;
		}
		$open  = sanitize_time( isset( $period['open'] ) ? $period['open'] : '' );
		$close = sanitize_time( isset( $period['close'] ) ? $period['close'] : '' );
		if ( '' === $open || '' === $close ) {
			continue;
		}
		$clean[] = array(
			'open'  => $open,
			'close' => $close,
		);
	}
	return $clean;
}

/**
 * Normalise a time to HH:MM (24h) or '' if invalid.
 *
 * @param mixed $value Raw time.
 * @return string
 */
function sanitize_time( $value ) {
	$value = trim( (string) $value );
	if ( ! preg_match( '/^(\d{1,2}):(\d{2})$/', $value, $m ) ) {
		return '';
	}
	$h = (int) $m[1];
	$i = (int) $m[2];
	if ( $h > 23 || $i > 59 ) {
		return '';
	}
	return sprintf( '%02d:%02d', $h, $i );
}

/**
 * Current open/closed state and the next change, computed in the site timezone.
 *
 * @return array{open:bool,label:string,until:string,today_periods:array}
 */
function status() {
	$tz  = wp_timezone();
	$now = new \DateTimeImmutable( 'now', $tz );
	$data = get();

	$day_key   = strtolower( $now->format( 'D' ) ); // mon, tue...
	$day_key   = substr( $day_key, 0, 3 );
	$today_str = $now->format( 'Y-m-d' );

	// Holiday override for today?
	$periods = null;
	foreach ( $data['holidays'] as $holiday ) {
		if ( $holiday['date'] === $today_str ) {
			$periods = $holiday['closed'] ? array() : $holiday['periods'];
			break;
		}
	}
	if ( null === $periods ) {
		$periods = isset( $data['week'][ $day_key ] ) ? $data['week'][ $day_key ] : array();
	}

	$open  = false;
	$until = '';
	foreach ( $periods as $p ) {
		$start = \DateTimeImmutable::createFromFormat( 'Y-m-d H:i', $today_str . ' ' . $p['open'], $tz );
		$end   = \DateTimeImmutable::createFromFormat( 'Y-m-d H:i', $today_str . ' ' . $p['close'], $tz );
		if ( ! $start || ! $end ) {
			continue;
		}
		if ( $end <= $start ) {
			$end = $end->modify( '+1 day' ); // Over-midnight period.
		}
		if ( $now >= $start && $now < $end ) {
			$open  = true;
			$until = $end->format( 'H:i' );
			break;
		}
	}

	return array(
		'open'          => $open,
		'label'         => $open ? __( 'Open now', 'dinekit' ) : __( 'Closed now', 'dinekit' ),
		'until'         => $until,
		'today_periods' => $periods,
	);
}

/**
 * Format a period for display, e.g. "9:00 AM – 5:00 PM".
 *
 * @param array{open:string,close:string} $p Period.
 * @return string
 */
function format_period( $p ) {
	$fmt = get_option( 'time_format' ) ? get_option( 'time_format' ) : 'g:i A';
	$o   = \DateTimeImmutable::createFromFormat( 'H:i', $p['open'], wp_timezone() );
	$c   = \DateTimeImmutable::createFromFormat( 'H:i', $p['close'], wp_timezone() );
	if ( ! $o || ! $c ) {
		return '';
	}
	return $o->format( $fmt ) . ' – ' . $c->format( $fmt );
}

/**
 * Render the opening-hours table (block + shortcode).
 *
 * @param array<string,mixed> $args show_status (bool), title (string).
 * @return string
 */
function render( $args = array() ) {
	$args = wp_parse_args(
		$args,
		array(
			'show_status' => true,
			'title'       => '',
		)
	);
	$data   = get();
	$state  = status();
	$today  = strtolower( substr( ( new \DateTimeImmutable( 'now', wp_timezone() ) )->format( 'D' ), 0, 3 ) );

	ob_start();
	?>
	<div class="dinekit-hours">
		<?php if ( $args['title'] ) : ?>
			<h3 class="dinekit-hours__title"><?php echo esc_html( $args['title'] ); ?></h3>
		<?php endif; ?>

		<?php if ( $args['show_status'] ) : ?>
			<p class="dinekit-hours__status <?php echo $state['open'] ? 'is-open' : 'is-closed'; ?>">
				<span class="dinekit-hours__dot" aria-hidden="true"></span>
				<span class="dinekit-hours__state"><?php echo esc_html( $state['label'] ); ?></span>
				<?php if ( $state['open'] && $state['until'] ) : ?>
					<span class="dinekit-hours__until">
						<?php
						/* translators: %s: closing time. */
						printf( esc_html__( 'until %s', 'dinekit' ), esc_html( $state['until'] ) );
						?>
					</span>
				<?php endif; ?>
			</p>
		<?php endif; ?>

		<table class="dinekit-hours__table">
			<tbody>
				<?php foreach ( days() as $key => $label ) : ?>
					<?php $periods = isset( $data['week'][ $key ] ) ? $data['week'][ $key ] : array(); ?>
					<tr class="<?php echo $key === $today ? 'is-today' : ''; ?>">
						<th scope="row"><?php echo esc_html( $label ); ?></th>
						<td>
							<?php
							if ( empty( $periods ) ) {
								echo '<span class="dinekit-hours__closed">' . esc_html__( 'Closed', 'dinekit' ) . '</span>';
							} else {
								$parts = array();
								foreach ( $periods as $p ) {
									$parts[] = esc_html( format_period( $p ) );
								}
								echo implode( ', ', $parts ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
							}
							?>
						</td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	</div>
	<?php
	echo schema_jsonld( $data ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	return (string) ob_get_clean();
}

/**
 * LocalBusiness openingHoursSpecification JSON-LD.
 *
 * @param array<string,mixed> $data Hours data.
 * @return string
 */
function schema_jsonld( $data ) {
	$map  = array(
		'mon' => 'Monday',
		'tue' => 'Tuesday',
		'wed' => 'Wednesday',
		'thu' => 'Thursday',
		'fri' => 'Friday',
		'sat' => 'Saturday',
		'sun' => 'Sunday',
	);
	$spec = array();
	foreach ( $map as $key => $schema_day ) {
		$periods = isset( $data['week'][ $key ] ) ? $data['week'][ $key ] : array();
		foreach ( $periods as $p ) {
			$spec[] = array(
				'@type'     => 'OpeningHoursSpecification',
				'dayOfWeek' => $schema_day,
				'opens'     => $p['open'],
				'closes'    => $p['close'],
			);
		}
	}
	if ( empty( $spec ) ) {
		return '';
	}
	$node = array(
		'@context'                     => 'https://schema.org',
		'@type'                        => 'LocalBusiness',
		'name'                         => $data['name'] ? $data['name'] : get_bloginfo( 'name' ),
		'openingHoursSpecification'    => $spec,
	);
	return '<script type="application/ld+json">' .
		wp_json_encode( $node, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>';
}
