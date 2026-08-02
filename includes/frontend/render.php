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
		'menu'              => 0,      // dinekit_menu term id, 0 = all items.
		'sections'          => array(), // dinekit_section term ids, empty = all sections.
		'layout'            => 'list', // list | grid | chalkboard.
		'columns'           => 0,      // 0 = layout default; 1–4 forces a column count.
		'show_images'       => true,
		'show_allergens'    => true,
		'order_link'        => true,   // "Order online" bridge button (auto-hides when ordering is off).
		'show_dietary'      => true,
		'show_matrix'       => true,
		'show_filter'       => true,
		'filter_style'      => 'chips',  // chips | dropdown.
		'allergen_display'  => 'icons',  // icons | text | codes.
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
			'taxonomy' => 'dinekit_menu',
			'terms'    => (int) $args['menu'],
		);
	}

	require_once DINEKIT_DIR . 'includes/items.php';
	$query = new \WP_Query(
		array(
			'post_type'      => 'dinekit_menu_item',
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'orderby'        => array(
				'menu_order' => 'ASC',
				'title'      => 'ASC',
			),
			'tax_query'      => $tax_query, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
			'meta_query'     => \DineKit\Items\exclude_archived_meta_query(), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
			'no_found_rows'  => true,
		)
	);

	// Sections are per-menu: when rendering a specific menu, only that menu's
	// own sections (plus shared/legacy ones) group its dishes. A dish whose
	// only sections belong to OTHER menus shows loose here — that's the
	// "simple flat menu" case working as intended.
	$menu_id = (int) $args['menu'];

	$by_section = array();
	$loose      = array();
	foreach ( $query->posts as $post ) {
		$terms  = get_the_terms( $post, 'dinekit_section' );
		$placed = false;
		if ( is_array( $terms ) && $terms ) {
			foreach ( $terms as $term ) {
				if ( $menu_id && ! PostTypes\section_allowed_in_menu( $term->term_id, $menu_id ) ) {
					continue;
				}
				$by_section[ $term->term_id ][] = $post;
				$placed                         = true;
				break; // An item shows once, under its first section in this menu.
			}
		}
		if ( ! $placed ) {
			$loose[] = $post;
		}
	}

	$want     = array_map( 'intval', (array) $args['sections'] );
	$sections = array();
	foreach ( PostTypes\ordered_terms( 'dinekit_section' ) as $term ) {
		if ( $menu_id && ! PostTypes\section_allowed_in_menu( $term->term_id, $menu_id ) ) {
			continue;
		}
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
	$args = wp_parse_args( $args, defaults() );

	// A specific menu scheduled for the future shows a "coming soon" teaser.
	if ( ! empty( $args['menu'] ) ) {
		require_once DINEKIT_DIR . 'includes/menus.php';
		$menu_status = \DineKit\Menus\status( (int) $args['menu'] );
		if ( 'coming' === $menu_status['state'] ) {
			$term  = get_term( (int) $args['menu'], 'dinekit_menu' );
			$style = \DineKit\Settings\menu_style_vars( isset( $args['accent'] ) ? (string) $args['accent'] : '' );
			return '<div class="dinekit-menu dinekit-coming"' . ( $style ? ' style="' . esc_attr( $style ) . '"' : '' ) . '>' .
				'<div class="dinekit-coming__card">' .
				'<span class="dinekit-coming__badge">' . esc_html__( 'Coming soon', 'dinekit' ) . '</span>' .
				'<h3 class="dinekit-coming__title">' . esc_html( $term ? $term->name : '' ) . '</h3>' .
				'<p class="dinekit-coming__when">' . esc_html( $menu_status['label'] ) . '</p>' .
				'</div></div>';
		}
	}

	$structure = build_structure( $args );

	if ( empty( $structure['sections'] ) && empty( $structure['loose'] ) ) {
		return '<div class="dinekit-menu dinekit-menu--empty"><p>' .
			esc_html__( 'No menu items to show yet.', 'dinekit' ) . '</p></div>';
	}

	$allergen_map = allergen_map();
	$layout       = in_array( $args['layout'], array( 'list', 'grid', 'chalkboard' ), true ) ? $args['layout'] : 'list';
	$columns      = max( 0, min( 4, (int) $args['columns'] ) );
	$col_class    = $columns > 0 ? ' dinekit-menu--cols-' . $columns : '';
	$filter_style = in_array( $args['filter_style'], array( 'chips', 'dropdown' ), true ) ? $args['filter_style'] : 'chips';
	// Normalised once and read back inside render_item().
	$args['allergen_display'] = in_array( $args['allergen_display'], array( 'icons', 'text', 'codes' ), true ) ? $args['allergen_display'] : 'icons';
	$template                 = ! empty( $args['template'] ) ? (string) $args['template'] : \DineKit\Settings\get()['template'];
	$template                 = in_array( $template, \DineKit\Settings\templates(), true ) ? $template : 'maison';
	$tpl_class                = ' dinekit-menu--tpl-' . $template;

	$groups = $structure['sections'];
	if ( $structure['loose'] ) {
		$groups[] = array(
			'term'  => null,
			'items' => $structure['loose'],
		);
	}

	ob_start();
	?>
	<?php $style = \DineKit\Settings\menu_style_vars( isset( $args['accent'] ) ? (string) $args['accent'] : '' ); ?>
	<div
		class="dinekit-menu dinekit-menu--<?php echo esc_attr( $layout ); ?><?php echo esc_attr( $col_class ); ?><?php echo esc_attr( $tpl_class ); ?>"
		<?php echo $style ? 'style="' . esc_attr( $style ) . '"' : ''; ?>
	>
		<?php
		if ( ! empty( $args['order_link'] ) ) {
			echo render_order_cta(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
		if ( $args['show_filter'] ) {
			echo render_filter_bar( $groups, $allergen_map, $filter_style ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
		?>
		<div class="dinekit-menu__items">
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
		<p class="dinekit-filter__empty" hidden><?php esc_html_e( 'No dishes match your filters.', 'dinekit' ); ?></p>
		</div>

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
	$prices = get_post_meta( $post->ID, 'dinekit_prices', true );
	$prices = is_array( $prices ) ? $prices : array();
	$badge  = (string) get_post_meta( $post->ID, 'dinekit_badge', true );
	// 86'd / out of stock: keep the dish visible (SEO + popular items stay on the
	// menu) but mark it so staff/diners know it can't be ordered right now.
	$out = 'out' === (string) get_post_meta( $post->ID, 'dinekit_stock', true );

	// Slugs used by the diner-facing filter (get_the_terms returns false, not
	// an empty array, when there are none).
	$diet_terms     = get_the_terms( $post, 'dinekit_dietary' );
	$allergen_terms = get_the_terms( $post, 'dinekit_allergen' );
	$diet_slugs     = is_array( $diet_terms ) ? wp_list_pluck( $diet_terms, 'slug' ) : array();
	$allergen_slugs = is_array( $allergen_terms ) ? wp_list_pluck( $allergen_terms, 'slug' ) : array();

	// "May contain" traces — term ids stored on the item, minus anything the
	// dish already CONTAINS. Their slugs join data-allergens so the diner's
	// "avoid" filter treats a trace as a hit (safety-first).
	$contains_ids = is_array( $allergen_terms ) ? wp_list_pluck( $allergen_terms, 'term_id' ) : array();
	$trace_ids    = trace_ids( $post->ID, $contains_ids, $allergen_map );
	$trace_slugs  = array();
	foreach ( $trace_ids as $tid ) {
		$trace_slugs[] = $allergen_map[ $tid ]['slug'];
	}

	ob_start();
	?>
	<li
		class="dinekit-item<?php echo $out ? ' dinekit-item--unavailable' : ''; ?>"
		data-dietary="<?php echo esc_attr( implode( ' ', $diet_slugs ) ); ?>"
		data-allergens="<?php echo esc_attr( implode( ' ', array_merge( $allergen_slugs, $trace_slugs ) ) ); ?>"
	>
		<?php if ( $args['show_images'] && has_post_thumbnail( $post ) ) : ?>
			<div class="dinekit-item__media">
				<?php
				echo get_the_post_thumbnail(
					$post,
					'medium',
					array(
						'loading' => 'lazy',
						'class'   => 'dinekit-item__img',
					)
				); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped 
				?>
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
				<?php if ( $out ) : ?>
					<span class="dinekit-item__unavailable"><?php esc_html_e( 'Currently unavailable', 'dinekit' ); ?></span>
				<?php endif; ?>
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

			<?php
			$dinekit_kcal = (int) get_post_meta( $post->ID, 'dinekit_calories', true );
			if ( $dinekit_kcal > 0 ) :
				?>
				<p class="dinekit-item__kcal">
					<?php
					/* translators: %d: calorie count. */
					echo esc_html( sprintf( __( '%d kcal', 'dinekit' ), $dinekit_kcal ) );
					?>
				</p>
			<?php endif; ?>

			<div class="dinekit-item__tags">
				<?php
				if ( $args['show_dietary'] ) {
					$dietary = get_the_terms( $post, 'dinekit_dietary' );
					if ( is_array( $dietary ) ) {
						foreach ( $dietary as $d ) {
							printf( '<span class="dinekit-diet">%s</span>', esc_html( $d->name ) );
						}
					}
				}
				if ( $args['show_allergens'] ) {
					$allergens = get_the_terms( $post, 'dinekit_allergen' );
					if ( is_array( $allergens ) ) {
						$src_sel  = json_decode( (string) get_post_meta( $post->ID, 'dinekit_allergen_sources', true ), true );
						$src_opts = \DineKit\PostTypes\allergen_sources();
						if ( ! is_array( $src_sel ) ) {
							$src_sel = array();
						}
						echo '<span class="dinekit-allergens">';
						// Icons alone are ambiguous to a first-time diner — a tiny
						// "Allergens" prefix gives the row meaning at a glance (the
						// text/codes modes carry their own words already).
						if ( 'icons' === $args['allergen_display'] ) {
							echo '<span class="dinekit-allergens__label">' . esc_html__( 'Allergens', 'dinekit' ) . '</span>';
						}
						foreach ( $allergens as $a ) {
							$data = isset( $allergen_map[ $a->term_id ] ) ? $allergen_map[ $a->term_id ] : null;
							if ( ! $data ) {
								continue;
							}
							// Natasha's Law: append the specific source(s) — "gluten (wheat, barley)".
							$label = $data['name'];
							if ( ! empty( $src_sel[ $a->slug ] ) && isset( $src_opts[ $a->slug ] ) ) {
								$names = array();
								foreach ( (array) $src_sel[ $a->slug ] as $k ) {
									if ( isset( $src_opts[ $a->slug ][ $k ] ) ) {
										$names[] = $src_opts[ $a->slug ][ $k ];
									}
								}
								if ( $names ) {
									$label .= ' (' . implode( ', ', $names ) . ')';
								}
							}
							$display = $args['allergen_display'];
							if ( 'icons' === $display && $data['icon'] ) {
								printf(
									'<img class="dinekit-allergen-icon" src="%s" alt="%s" title="%s" width="18" height="18" loading="lazy" />',
									esc_url( $data['icon'] ),
									esc_attr( $label ),
									esc_attr( $label )
								);
							} elseif ( 'codes' === $display ) {
								// A short letter code (first three letters of the base name) — the
								// compact convention many non-UK menus use.
								$code = strtoupper( substr( (string) preg_replace( '/[^\p{L}]/u', '', $data['name'] ), 0, 3 ) );
								printf( '<span class="dinekit-allergen-text dinekit-allergen-code" title="%s">%s</span>', esc_attr( $label ), esc_html( $code ) );
							} else {
								printf( '<span class="dinekit-allergen-text" title="%s">%s</span>', esc_attr( $label ), esc_html( $label ) );
							}
						}
						echo '</span>';
					}
				}
				if ( $args['show_allergens'] && $trace_ids ) {
					echo render_traces( $trace_ids, $allergen_map, $args['allergen_display'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				}
				?>
			</div>
		</div>
	</li>
	<?php
	return (string) ob_get_clean();
}

/**
 * Render the diner-facing filter bar: "show only" dietary chips and "avoid"
 * allergen chips, built from the terms actually used in this menu. Returns ''
 * when there is nothing to filter by.
 *
 * @param array<int,array>  $groups       Section groups.
 * @param array<int,array>  $allergen_map Allergen term data keyed by id.
 * @return string
 */
function render_filter_bar( $groups, $allergen_map, $style = 'chips' ) {
	$diet_used     = array();
	$allergen_used = array();
	foreach ( $groups as $group ) {
		foreach ( $group['items'] as $post ) {
			$diet_terms = get_the_terms( $post, 'dinekit_dietary' );
			if ( is_array( $diet_terms ) ) {
				foreach ( $diet_terms as $term ) {
					$diet_used[ $term->slug ] = $term->name;
				}
			}
			$allergen_terms = get_the_terms( $post, 'dinekit_allergen' );
			if ( is_array( $allergen_terms ) ) {
				foreach ( wp_list_pluck( $allergen_terms, 'term_id' ) as $id ) {
					if ( isset( $allergen_map[ $id ] ) ) {
						$allergen_used[ $allergen_map[ $id ]['slug'] ] = $allergen_map[ $id ]['name'];
					}
				}
			}
		}
	}

	if ( empty( $diet_used ) && empty( $allergen_used ) ) {
		return '';
	}
	ksort( $diet_used );
	ksort( $allergen_used );

	$dropdown = ( 'dropdown' === $style );
	ob_start();
	?>
	<div class="dinekit-filter<?php echo $dropdown ? ' dinekit-filter--dropdown' : ''; ?>" data-dinekit-filter
		data-count-tpl="<?php /* translators: 1: dishes shown, 2: total dishes. */ echo esc_attr( __( 'Showing %1$s of %2$s dishes', 'dinekit' ) ); ?>">
		<?php if ( $dropdown ) : ?>
			<?php
			// Icon lookup by slug for the allergen rows.
			$icon_by_slug = array();
			foreach ( $allergen_map as $data ) {
				if ( ! empty( $data['icon'] ) ) {
					$icon_by_slug[ $data['slug'] ] = $data['icon'];
				}
			}
			?>
			<?php if ( $diet_used ) : ?>
				<div class="dinekit-filter__dd" data-dd>
					<button type="button" class="dinekit-filter__ddbtn" aria-haspopup="true" aria-expanded="false"
						data-dd-label="<?php echo esc_attr( __( 'Show only', 'dinekit' ) ); ?>">
						<?php esc_html_e( 'Show only', 'dinekit' ); ?><span class="dinekit-filter__ddcount" hidden></span><span class="dinekit-filter__ddcaret" aria-hidden="true">▾</span>
					</button>
					<div class="dinekit-filter__panel" hidden>
						<?php foreach ( $diet_used as $slug => $name ) : ?>
							<label class="dinekit-filter__option">
								<input type="checkbox" value="<?php echo esc_attr( $slug ); ?>" data-diet-check />
								<span><?php echo esc_html( $name ); ?></span>
							</label>
						<?php endforeach; ?>
					</div>
				</div>
			<?php endif; ?>
			<?php if ( $allergen_used ) : ?>
				<div class="dinekit-filter__dd" data-dd>
					<button type="button" class="dinekit-filter__ddbtn dinekit-filter__ddbtn--avoid" aria-haspopup="true" aria-expanded="false"
						data-dd-label="<?php echo esc_attr( __( 'Avoid allergens', 'dinekit' ) ); ?>">
						<?php esc_html_e( 'Avoid allergens', 'dinekit' ); ?><span class="dinekit-filter__ddcount" hidden></span><span class="dinekit-filter__ddcaret" aria-hidden="true">▾</span>
					</button>
					<div class="dinekit-filter__panel" hidden>
						<?php foreach ( $allergen_used as $slug => $name ) : ?>
							<label class="dinekit-filter__option">
								<input type="checkbox" value="<?php echo esc_attr( $slug ); ?>" data-allergen-check />
								<?php if ( isset( $icon_by_slug[ $slug ] ) ) : ?>
									<img class="dinekit-filter__opticon" src="<?php echo esc_url( $icon_by_slug[ $slug ] ); ?>" alt="" width="16" height="16" loading="lazy" />
								<?php endif; ?>
								<span><?php echo esc_html( $name ); ?></span>
							</label>
						<?php endforeach; ?>
					</div>
				</div>
			<?php endif; ?>
			<button type="button" class="dinekit-filter__clear" hidden><?php esc_html_e( 'Clear filters', 'dinekit' ); ?></button>
		<?php else : ?>
			<?php if ( $diet_used ) : ?>
				<div class="dinekit-filter__group">
					<span class="dinekit-filter__label"><?php esc_html_e( 'Show only', 'dinekit' ); ?></span>
					<?php foreach ( $diet_used as $slug => $name ) : ?>
						<button type="button" class="dinekit-filter__chip" data-diet="<?php echo esc_attr( $slug ); ?>">
							<?php echo esc_html( $name ); ?>
						</button>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>

			<?php if ( $allergen_used ) : ?>
				<div class="dinekit-filter__group">
					<span class="dinekit-filter__label"><?php esc_html_e( 'Avoid', 'dinekit' ); ?></span>
					<?php foreach ( $allergen_used as $slug => $name ) : ?>
						<button type="button" class="dinekit-filter__chip dinekit-filter__chip--avoid" data-allergen="<?php echo esc_attr( $slug ); ?>">
							<?php echo esc_html( $name ); ?>
						</button>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>

			<button type="button" class="dinekit-filter__clear" hidden><?php esc_html_e( 'Clear filters', 'dinekit' ); ?></button>
		<?php endif; ?>
		<span class="dinekit-filter__count" data-filter-count aria-live="polite" hidden></span>
	</div>
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
		$label = isset( $row['label'] ) ? trim( (string) $row['label'] ) : '';
		$out[] = $label
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
			'taxonomy'   => 'dinekit_allergen',
			'hide_empty' => false,
		)
	);
	if ( is_array( $terms ) ) {
		foreach ( $terms as $term ) {
			$icon                  = DINEKIT_DIR . 'assets/icons/' . $term->slug . '.svg';
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
 * The browsing-menu → ordering-page bridge: an "Order online" button shown
 * only when online ordering is actually ON and a published ordering page
 * exists — a hungry visitor on the menu page should never have to hunt for
 * the way to order. Opt out per menu with order_link="no".
 *
 * @return string
 */
function render_order_cta() {
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	$settings = \DineKit\Ordering\get_settings();
	if ( empty( $settings['enabled'] ) ) {
		return '';
	}
	require_once DINEKIT_DIR . 'includes/sample.php';
	$page = \DineKit\Sample\find_page( 'order' );
	if ( ! $page || 'publish' !== $page['status'] || '' === $page['url'] ) {
		return '';
	}
	// Don't render the bridge on the ordering page itself (both surfaces on
	// one page is a valid setup — a self-link would just be noise).
	if ( get_the_ID() && (int) get_the_ID() === (int) $page['id'] ) {
		return '';
	}
	return '<div class="dinekit-menu__ordercta"><a class="dinekit-ordercta" href="' . esc_url( $page['url'] ) . '">'
		. esc_html__( 'Order online', 'dinekit' ) . ' &rarr;</a></div>';
}

/**
 * "May contain" allergen term ids for an item — validated against the live
 * allergen map and de-duplicated against what the dish already contains.
 *
 * @param int              $post_id      Item id.
 * @param int[]            $contains_ids Term ids the dish CONTAINS.
 * @param array<int,array> $allergen_map Allergen data keyed by term id.
 * @return int[]
 */
function trace_ids( $post_id, $contains_ids, $allergen_map ) {
	$raw = json_decode( (string) get_post_meta( $post_id, 'dinekit_allergen_traces', true ), true );
	if ( ! is_array( $raw ) ) {
		return array();
	}
	$ids = array();
	foreach ( $raw as $id ) {
		$id = (int) $id;
		if ( isset( $allergen_map[ $id ] ) && ! in_array( $id, $contains_ids, true ) && ! in_array( $id, $ids, true ) ) {
			$ids[] = $id;
		}
	}
	return $ids;
}

/**
 * Render the "may contain / traces" badges for one dish, matching the chosen
 * allergen display mode. Traces read visually quieter than "contains" so the
 * two are never confused.
 *
 * @param int[]            $trace_ids    Trace term ids.
 * @param array<int,array> $allergen_map Allergen data.
 * @param string           $display      icons | text | codes.
 * @return string
 */
function render_traces( $trace_ids, $allergen_map, $display ) {
	$out = '<span class="dinekit-allergens dinekit-allergens--trace">';
	if ( 'icons' === $display ) {
		$out .= '<span class="dinekit-trace-label">' . esc_html__( 'may contain', 'dinekit' ) . '</span>';
		foreach ( $trace_ids as $id ) {
			$data = $allergen_map[ $id ];
			/* translators: %s: allergen name. */
			$title = sprintf( __( 'May contain %s', 'dinekit' ), $data['name'] );
			if ( $data['icon'] ) {
				$out .= sprintf(
					'<img class="dinekit-allergen-icon dinekit-allergen-icon--trace" src="%s" alt="%s" title="%s" width="18" height="18" loading="lazy" />',
					esc_url( $data['icon'] ),
					esc_attr( $title ),
					esc_attr( $title )
				);
			} else {
				$out .= sprintf( '<span class="dinekit-allergen-text dinekit-allergen-text--trace" title="%s">%s</span>', esc_attr( $title ), esc_html( $data['name'] ) );
			}
		}
	} elseif ( 'codes' === $display ) {
		foreach ( $trace_ids as $id ) {
			$data = $allergen_map[ $id ];
			$code = strtoupper( substr( (string) preg_replace( '/[^\p{L}]/u', '', $data['name'] ), 0, 3 ) );
			/* translators: %s: allergen name. */
			$title = sprintf( __( 'May contain %s', 'dinekit' ), $data['name'] );
			$out  .= sprintf( '<span class="dinekit-allergen-text dinekit-allergen-code dinekit-allergen-text--trace" title="%s">%s*</span>', esc_attr( $title ), esc_html( $code ) );
		}
	} else {
		$names = array();
		foreach ( $trace_ids as $id ) {
			$names[] = $allergen_map[ $id ]['name'];
		}
		$out .= sprintf(
			'<span class="dinekit-allergen-text dinekit-allergen-text--trace">%s</span>',
			/* translators: %s: comma-separated allergen names. */
			esc_html( sprintf( __( 'May contain: %s', 'dinekit' ), implode( ', ', $names ) ) )
		);
	}
	return $out . '</span>';
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
							$terms  = get_the_terms( $post, 'dinekit_allergen' );
							$ids    = is_array( $terms ) ? wp_list_pluck( $terms, 'term_id' ) : array();
							$traces = trace_ids( $post->ID, $ids, $allergen_map );
							?>
							<tr>
								<th scope="row"><?php echo esc_html( get_the_title( $post ) ); ?></th>
								<?php foreach ( $allergen_map as $term_id => $data ) : ?>
									<?php if ( in_array( $term_id, $ids, true ) ) : ?>
										<td class="is-yes">&#10003;</td>
									<?php elseif ( in_array( $term_id, $traces, true ) ) : ?>
										<td class="is-may" title="<?php esc_attr_e( 'May contain (traces)', 'dinekit' ); ?>">&#177;</td>
									<?php else : ?>
										<td></td>
									<?php endif; ?>
								<?php endforeach; ?>
							</tr>
						<?php endforeach; ?>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
		<p class="dinekit-matrix__note"><?php esc_html_e( '✓ contains · ± may contain (traces)', 'dinekit' ); ?></p>
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
	require_once DINEKIT_DIR . 'includes/settings.php';
	require_once DINEKIT_DIR . 'includes/localisation.php';
	$settings      = \DineKit\Settings\get();
	$currency_code = \DineKit\L10n\currency_code( (string) $settings['country'], (string) $settings['currency'] );

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
			$prices = get_post_meta( $post->ID, 'dinekit_prices', true );
			if ( is_array( $prices ) && $prices ) {
				$first  = reset( $prices );
				$amount = isset( $first['amount'] ) ? preg_replace( '/[^0-9.]/', '', (string) $first['amount'] ) : '';
				if ( '' !== $amount ) {
					$offer = array(
						'@type' => 'Offer',
						'price' => $amount,
					);
					// Report the venue's real currency, not a UK default.
					if ( '' !== $currency_code ) {
						$offer['priceCurrency'] = $currency_code;
					}
					$node['offers'] = $offer;
				}
			}
			$items[] = $node;
		}
		$section_node = array(
			'@type'       => 'MenuSection',
			'name'        => $group['term'] ? $group['term']->name : __( 'Menu', 'dinekit' ),
			'hasMenuItem' => $items,
		);
		$sections[]   = $section_node;
	}

	$data = array(
		'@context'       => 'https://schema.org',
		'@type'          => 'Menu',
		'hasMenuSection' => $sections,
	);

	// JSON_HEX_TAG hex-escapes < and > so no menu/term value can break out of
	// the <script> element (e.g. a literal </script> in a dish name).
	return '<script type="application/ld+json">' .
		wp_json_encode( $data, JSON_HEX_TAG | JSON_UNESCAPED_UNICODE ) .
		'</script>';
}
