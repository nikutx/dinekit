<?php
/**
 * Frontend menu renderer — shared by the block and the shortcode.
 *
 * Pure PHP output, scoped `.dinekit-` markup, no theme assumptions. Emits
 * schema.org Menu JSON-LD alongside the visible menu.
 *
 * @package DineKit
 */

namespace DineKit\Render;

use DineKit\PostTypes;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Default render arguments.
 *
 * @return array<string,mixed>
 */
function defaults() {
	require_once DINEKIT_DIR . 'includes/settings.php';
	$settings = \DineKit\Settings\get();
	return array(
		'menu'              => 0,      // dk_menu term id, 0 = all items.
		'sections'          => array(), // dk_section term ids, empty = all sections.
		'layout'            => 'list', // list | grid | chalkboard.
		'columns'           => 0,      // 0 = layout default; 1–4 forces a column count.
		'show_images'       => true,
		'show_allergens'    => true,
		'show_dietary'      => true,
		'show_matrix'       => true,
		'currency'          => $settings['currency'],
		'currency_position' => $settings['currencyPosition'],
		'accent'            => $settings['accent'],
	);
}

/**
 * Build the ordered menu structure: sections each holding their items.
 *
 * @param array<string,mixed> $args Render args.
 * @return array{sections:array<int,array<string,mixed>>,loose:array<int,\WP_Post>}
 */
function build_structure( $args ) {
	$tax_query = array();
	if ( $args['menu'] ) {
		$tax_query[] = array(
			'taxonomy' => 'dk_menu',
			'terms'    => (int) $args['menu'],
		);
	}

	$query = new \WP_Query(
		array(
			'post_type'      => 'dk_menu_item',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'orderby'        => array(
				'menu_order' => 'ASC',
				'title'      => 'ASC',
			),
			'tax_query'      => $tax_query, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
			'no_found_rows'  => true,
		)
	);

	$by_section = array();
	$loose      = array();
	foreach ( $query->posts as $post ) {
		$terms = get_the_terms( $post, 'dk_section' );
		if ( is_array( $terms ) && $terms ) {
			$placed = false;
			foreach ( $terms as $term ) {
				$by_section[ $term->term_id ][] = $post;
				$placed                         = true;
				break; // An item shows once, under its first section.
			}
			if ( ! $placed ) {
				$loose[] = $post;
			}
		} else {
			$loose[] = $post;
		}
	}

	$want     = array_map( 'intval', (array) $args['sections'] );
	$sections = array();
	foreach ( PostTypes\ordered_terms( 'dk_section' ) as $term ) {
		if ( $want && ! in_array( (int) $term->term_id, $want, true ) ) {
			continue;
		}
		if ( empty( $by_section[ $term->term_id ] ) ) {
			continue;
		}
		$sections[] = array(
			'term'  => $term,
			'items' => $by_section[ $term->term_id ],
		);
	}

	return array(
		'sections' => $sections,
		'loose'    => $want ? array() : $loose,
	);
}

/**
 * Render a menu to HTML.
 *
 * @param array<string,mixed> $args Render args (merged over defaults()).
 * @return string
 */
function menu( $args = array() ) {
	$args      = wp_parse_args( $args, defaults() );
	$structure = build_structure( $args );

	if ( empty( $structure['sections'] ) && empty( $structure['loose'] ) ) {
		return '<div class="dinekit-menu dinekit-menu--empty"><p>' .
			esc_html__( 'No menu items to show yet.', 'dinekit' ) . '</p></div>';
	}

	$allergen_map = allergen_map();
	$layout       = in_array( $args['layout'], array( 'list', 'grid', 'chalkboard' ), true ) ? $args['layout'] : 'list';
	$columns      = max( 0, min( 4, (int) $args['columns'] ) );
	$col_class    = $columns > 0 ? ' dinekit-menu--cols-' . $columns : '';

	$groups = $structure['sections'];
	if ( $structure['loose'] ) {
		$groups[] = array(
			'term'  => null,
			'items' => $structure['loose'],
		);
	}

	ob_start();
	?>
	<?php $accent = isset( $args['accent'] ) && preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $args['accent'] ) ? $args['accent'] : ''; ?>
	<div
		class="dinekit-menu dinekit-menu--<?php echo esc_attr( $layout ); ?><?php echo esc_attr( $col_class ); ?>"
		<?php echo $accent ? 'style="--dinekit-accent:' . esc_attr( $accent ) . '"' : ''; ?>
	>
		<?php foreach ( $groups as $group ) : ?>
			<section class="dinekit-section">
				<?php if ( $group['term'] ) : ?>
					<h3 class="dinekit-section__title"><?php echo esc_html( $group['term']->name ); ?></h3>
					<?php
					$desc = term_description( $group['term']->term_id );
					if ( $desc ) :
						?>
						<p class="dinekit-section__desc"><?php echo esc_html( wp_strip_all_tags( $desc ) ); ?></p>
					<?php endif; ?>
				<?php endif; ?>

				<ul class="dinekit-items">
					<?php
					foreach ( $group['items'] as $post ) {
						echo render_item( $post, $args, $allergen_map ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					}
					?>
				</ul>
			</section>
		<?php endforeach; ?>

		<?php
		if ( $args['show_allergens'] ) {
			echo render_legend( $allergen_map ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			if ( $args['show_matrix'] ) {
				echo render_matrix( $groups, $allergen_map ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			}
		}
		?>
	</div>
	<?php
	echo schema_jsonld( $groups, $args ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

	return (string) ob_get_clean();
}

/**
 * Render a single item.
 *
 * @param \WP_Post            $post         Item.
 * @param array<string,mixed> $args         Render args.
 * @param array<int,array>    $allergen_map Allergen term data keyed by id.
 * @return string
 */
function render_item( $post, $args, $allergen_map ) {
	$prices = get_post_meta( $post->ID, 'dk_prices', true );
	$prices = is_array( $prices ) ? $prices : array();
	$badge  = (string) get_post_meta( $post->ID, 'dk_badge', true );

	ob_start();
	?>
	<li class="dinekit-item">
		<?php if ( $args['show_images'] && has_post_thumbnail( $post ) ) : ?>
			<div class="dinekit-item__media">
				<?php echo get_the_post_thumbnail( $post, 'medium', array( 'loading' => 'lazy', 'class' => 'dinekit-item__img' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
			</div>
		<?php endif; ?>

		<div class="dinekit-item__body">
			<div class="dinekit-item__head">
				<h4 class="dinekit-item__name">
					<?php echo esc_html( get_the_title( $post ) ); ?>
					<?php if ( $badge ) : ?>
						<span class="dinekit-badge"><?php echo esc_html( $badge ); ?></span>
					<?php endif; ?>
				</h4>
				<span class="dinekit-item__leader" aria-hidden="true"></span>
				<?php if ( $prices ) : ?>
					<span class="dinekit-item__prices">
						<?php echo wp_kses_post( price_html( $prices, $args['currency'], isset( $args['currency_position'] ) ? $args['currency_position'] : 'before' ) ); ?>
					</span>
				<?php endif; ?>
			</div>

			<?php if ( $post->post_content ) : ?>
				<p class="dinekit-item__desc"><?php echo esc_html( wp_strip_all_tags( $post->post_content ) ); ?></p>
			<?php endif; ?>

			<div class="dinekit-item__tags">
				<?php
				if ( $args['show_dietary'] ) {
					$dietary = get_the_terms( $post, 'dk_dietary' );
					if ( is_array( $dietary ) ) {
						foreach ( $dietary as $d ) {
							printf( '<span class="dinekit-diet">%s</span>', esc_html( $d->name ) );
						}
					}
				}
				if ( $args['show_allergens'] ) {
					$allergens = get_the_terms( $post, 'dk_allergen' );
					if ( is_array( $allergens ) ) {
						echo '<span class="dinekit-allergens">';
						foreach ( $allergens as $a ) {
							$data = isset( $allergen_map[ $a->term_id ] ) ? $allergen_map[ $a->term_id ] : null;
							if ( ! $data ) {
								continue;
							}
							if ( $data['icon'] ) {
								printf(
									'<img class="dinekit-allergen-icon" src="%s" alt="%s" title="%s" width="18" height="18" loading="lazy" />',
									esc_url( $data['icon'] ),
									esc_attr( $data['name'] ),
									esc_attr( $data['name'] )
								);
							} else {
								printf( '<span class="dinekit-allergen-text" title="%1$s">%1$s</span>', esc_attr( $data['name'] ) );
							}
						}
						echo '</span>';
					}
				}
				?>
			</div>
		</div>
	</li>
	<?php
	return (string) ob_get_clean();
}

/**
 * Format the price row(s) as HTML.
 *
 * @param array<int,array{label:string,amount:string}> $prices   Prices.
 * @param string                                        $currency Currency symbol.
 * @param string                                        $position Symbol position: before | after.
 * @return string
 */
function price_html( $prices, $currency, $position = 'before' ) {
	$out = array();
	foreach ( $prices as $row ) {
		$amount = isset( $row['amount'] ) ? trim( (string) $row['amount'] ) : '';
		if ( '' === $amount ) {
			continue;
		}
		// Add the currency symbol only if the amount is bare digits.
		if ( preg_match( '/^[0-9]/', $amount ) ) {
			$display = ( 'after' === $position ) ? $amount . $currency : $currency . $amount;
		} else {
			$display = $amount;
		}
		$label   = isset( $row['label'] ) ? trim( (string) $row['label'] ) : '';
		$out[]   = $label
			? '<span class="dinekit-price"><span class="dinekit-price__label">' . esc_html( $label ) . '</span> ' . esc_html( $display ) . '</span>'
			: '<span class="dinekit-price">' . esc_html( $display ) . '</span>';
	}
	return implode( '', $out );
}

/**
 * Allergen term data keyed by term id: name + icon URL.
 *
 * @return array<int,array{name:string,slug:string,icon:string}>
 */
function allergen_map() {
	$map   = array();
	$terms = get_terms(
		array(
			'taxonomy'   => 'dk_allergen',
			'hide_empty' => false,
		)
	);
	if ( is_array( $terms ) ) {
		foreach ( $terms as $term ) {
			$icon         = DINEKIT_DIR . 'assets/icons/' . $term->slug . '.svg';
			$map[ $term->term_id ] = array(
				'name' => $term->name,
				'slug' => $term->slug,
				'icon' => is_readable( $icon ) ? DINEKIT_URL . 'assets/icons/' . $term->slug . '.svg' : '',
			);
		}
	}
	return $map;
}

/**
 * Render the allergen legend (only allergens actually used are worth showing,
 * but we show the full set for clarity/compliance).
 *
 * @param array<int,array> $allergen_map Allergen data.
 * @return string
 */
function render_legend( $allergen_map ) {
	if ( empty( $allergen_map ) ) {
		return '';
	}
	ob_start();
	?>
	<div class="dinekit-legend">
		<span class="dinekit-legend__title"><?php esc_html_e( 'Allergen key', 'dinekit' ); ?></span>
		<ul class="dinekit-legend__list">
			<?php foreach ( $allergen_map as $data ) : ?>
				<li class="dinekit-legend__item">
					<?php if ( $data['icon'] ) : ?>
						<img src="<?php echo esc_url( $data['icon'] ); ?>" alt="" width="16" height="16" loading="lazy" />
					<?php endif; ?>
					<span><?php echo esc_html( $data['name'] ); ?></span>
				</li>
			<?php endforeach; ?>
		</ul>
	</div>
	<?php
	return (string) ob_get_clean();
}

/**
 * Render the printable allergen matrix (items × 14 allergens).
 *
 * @param array<int,array>  $groups       Section groups.
 * @param array<int,array>  $allergen_map Allergen data.
 * @return string
 */
function render_matrix( $groups, $allergen_map ) {
	if ( empty( $allergen_map ) ) {
		return '';
	}
	ob_start();
	?>
	<details class="dinekit-matrix">
		<summary><?php esc_html_e( 'Full allergen matrix (printable)', 'dinekit' ); ?></summary>
		<div class="dinekit-matrix__scroll">
			<table class="dinekit-matrix__table">
				<thead>
					<tr>
						<th scope="col"><?php esc_html_e( 'Dish', 'dinekit' ); ?></th>
						<?php foreach ( $allergen_map as $data ) : ?>
							<th scope="col" title="<?php echo esc_attr( $data['name'] ); ?>">
								<?php echo esc_html( $data['name'] ); ?>
							</th>
						<?php endforeach; ?>
					</tr>
				</thead>
				<tbody>
					<?php
					foreach ( $groups as $group ) :
						foreach ( $group['items'] as $post ) :
							$ids = wp_list_pluck( (array) get_the_terms( $post, 'dk_allergen' ), 'term_id' );
							?>
							<tr>
								<th scope="row"><?php echo esc_html( get_the_title( $post ) ); ?></th>
								<?php foreach ( $allergen_map as $term_id => $data ) : ?>
									<td class="<?php echo in_array( $term_id, $ids, true ) ? 'is-yes' : ''; ?>">
										<?php echo in_array( $term_id, $ids, true ) ? '&#10003;' : ''; ?>
									</td>
								<?php endforeach; ?>
							</tr>
						<?php endforeach; ?>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	</details>
	<?php
	return (string) ob_get_clean();
}

/**
 * Build the schema.org Menu JSON-LD block.
 *
 * @param array<int,array>    $groups Section groups.
 * @param array<string,mixed> $args   Render args.
 * @return string
 */
function schema_jsonld( $groups, $args ) {
	$sections = array();
	foreach ( $groups as $group ) {
		$items = array();
		foreach ( $group['items'] as $post ) {
			$node = array(
				'@type' => 'MenuItem',
				'name'  => get_the_title( $post ),
			);
			if ( $post->post_content ) {
				$node['description'] = wp_strip_all_tags( $post->post_content );
			}
			$prices = get_post_meta( $post->ID, 'dk_prices', true );
			if ( is_array( $prices ) && $prices ) {
				$first  = reset( $prices );
				$amount = isset( $first['amount'] ) ? preg_replace( '/[^0-9.]/', '', (string) $first['amount'] ) : '';
				if ( '' !== $amount ) {
					$node['offers'] = array(
						'@type'         => 'Offer',
						'price'         => $amount,
						'priceCurrency' => 'GBP',
					);
				}
			}
			$items[] = $node;
		}
		$section_node = array(
			'@type'       => 'MenuSection',
			'name'        => $group['term'] ? $group['term']->name : __( 'Menu', 'dinekit' ),
			'hasMenuItem' => $items,
		);
		$sections[] = $section_node;
	}

	$data = array(
		'@context'       => 'https://schema.org',
		'@type'          => 'Menu',
		'hasMenuSection' => $sections,
	);

	return '<script type="application/ld+json">' .
		wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) .
		'</script>';
}
