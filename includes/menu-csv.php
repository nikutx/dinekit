<?php
/**
 * Menu CSV import / export — switcher-friendly bulk editing.
 *
 * Export gives one row per dish (ID, Section, Dish, Description, Price, Dietary,
 * Allergens, Calories, Cost, Available, Published, Image URL) — hidden/unpublished
 * dishes included, so a round-trip never loses the seasonal part of a menu.
 * Import upserts dishes by ID when the CSV has one (exact, survives renames),
 * falling back to (Dish within Section) across ALL statuses: existing dishes are
 * updated in place — their published/hidden state is kept unless the Published
 * column says otherwise — and new ones created; missing sections and dietary tags
 * are created; allergens are matched to existing terms only (the 14 legal ones are
 * seeded — we never invent an allergen from a spreadsheet). Nothing is ever
 * deleted by an import.
 *
 * @package DineKit
 */

namespace DineKit\MenuCsv;

use DineKit\Meta;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boot: register the REST routes.
 *
 * @return void
 */
function init() {
	add_action( 'rest_api_init', __NAMESPACE__ . '\\register_routes' );
}

/**
 * Register export/import routes (menu-management permission).
 *
 * @return void
 */
function register_routes() {
	require_once DINEKIT_DIR . 'includes/rest.php';
	$perm = 'DineKit\\Rest\\can_menu';
	register_rest_route(
		'dinekit/v1',
		'/menu/export',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\export_menu',
			'permission_callback' => $perm,
		)
	);
	register_rest_route(
		'dinekit/v1',
		'/menu/import',
		array(
			'methods'             => \WP_REST_Server::CREATABLE,
			'callback'            => __NAMESPACE__ . '\\import_menu',
			'permission_callback' => $perm,
		)
	);
}

/**
 * The export column order (also the accepted import headers, case-insensitive).
 *
 * @return string[]
 */
function columns() {
	return array( 'ID', 'Section', 'Dish', 'Description', 'Price', 'Dietary', 'Allergens', 'Calories', 'Cost', 'Available', 'Published', 'Image URL' );
}

/**
 * Format a dish's price rows as "Label:Amount|Label:Amount" (or just "Amount"
 * when there's a single unlabelled price).
 *
 * @param array<int,array{label:string,amount:string}> $prices Price rows.
 * @return string
 */
function format_prices( $prices ) {
	if ( ! is_array( $prices ) ) {
		return '';
	}
	$parts = array();
	foreach ( $prices as $row ) {
		$label  = isset( $row['label'] ) ? (string) $row['label'] : '';
		$amount = isset( $row['amount'] ) ? (string) $row['amount'] : '';
		if ( '' === $label && '' === $amount ) {
			continue;
		}
		$parts[] = '' !== $label ? $label . ':' . $amount : $amount;
	}
	return implode( '|', $parts );
}

/**
 * Parse a "Label:Amount|Amount" price string back into price rows.
 *
 * @param string $value Encoded price string.
 * @return array<int,array{label:string,amount:string}>
 */
function parse_prices( $value ) {
	$rows = array();
	foreach ( explode( '|', (string) $value ) as $part ) {
		$part = trim( $part );
		if ( '' === $part ) {
			continue;
		}
		$label  = '';
		$amount = $part;
		if ( false !== strpos( $part, ':' ) ) {
			list( $label, $amount ) = array_map( 'trim', explode( ':', $part, 2 ) );
		}
		$rows[] = array(
			'label'  => $label,
			'amount' => $amount,
		);
	}
	return Meta\sanitize_prices( $rows );
}

/**
 * Term names for a post + taxonomy, pipe-safe.
 *
 * @param \WP_Post $post     Post.
 * @param string   $taxonomy Taxonomy.
 * @return string[]
 */
function term_names( $post, $taxonomy ) {
	$terms = get_the_terms( $post, $taxonomy );
	if ( ! is_array( $terms ) ) {
		return array();
	}
	return wp_list_pluck( $terms, 'name' );
}

/**
 * Build one CSV row (RFC-4180 quoting).
 *
 * @param array<int,string> $fields Field values.
 * @return string
 */
function csv_row( $fields ) {
	$out = array();
	foreach ( $fields as $f ) {
		$f = (string) $f;
		if ( preg_match( '/[",\r\n]/', $f ) ) {
			$f = '"' . str_replace( '"', '""', $f ) . '"';
		}
		$out[] = $f;
	}
	return implode( ',', $out );
}

/**
 * GET /menu/export — the whole live menu as CSV text.
 *
 * @return \WP_REST_Response
 */
function export_menu() {
	require_once DINEKIT_DIR . 'includes/items.php';
	$query = new \WP_Query(
		array(
			'post_type'      => 'dinekit_menu_item',
			'post_status'    => array( 'publish', 'draft', 'pending', 'private' ),
			'posts_per_page' => 2000, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- full menu export.
			'orderby'        => array(
				'menu_order' => 'ASC',
				'title'      => 'ASC',
			),
			'no_found_rows'  => true,
			'meta_query'     => \DineKit\Items\exclude_archived_meta_query(), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
		)
	);

	$lines = array( csv_row( columns() ) );
	foreach ( $query->posts as $post ) {
		$secs    = term_names( $post, 'dinekit_section' );
		$stock   = (string) get_post_meta( $post->ID, 'dinekit_stock', true );
		$cal     = (int) get_post_meta( $post->ID, 'dinekit_calories', true );
		$image   = (string) get_the_post_thumbnail_url( $post->ID, 'full' );
		$lines[] = csv_row(
			array(
				(string) $post->ID,
				$secs ? $secs[0] : '',
				$post->post_title,
				(string) $post->post_content,
				format_prices( get_post_meta( $post->ID, 'dinekit_prices', true ) ),
				implode( '|', term_names( $post, 'dinekit_dietary' ) ),
				implode( '|', term_names( $post, 'dinekit_allergen' ) ),
				$cal ? (string) $cal : '',
				(string) get_post_meta( $post->ID, 'dinekit_cost', true ),
				'out' === $stock ? 'no' : 'yes',
				'publish' === $post->post_status ? 'yes' : 'no',
				$image,
			)
		);
	}

	return rest_ensure_response(
		array(
			'csv'      => implode( "\r\n", $lines ) . "\r\n",
			'filename' => 'dinekit-menu-' . gmdate( 'Y-m-d' ) . '.csv',
			'count'    => count( $lines ) - 1,
		)
	);
}

/**
 * Find (or optionally create) a term id by exact name within a taxonomy.
 *
 * @param string $taxonomy Taxonomy.
 * @param string $name     Term name.
 * @param bool   $create   Create when missing.
 * @param bool   $created  Set true (by-ref) if a term was created.
 * @return int Term id, or 0.
 */
function term_id_by_name( $taxonomy, $name, $create, &$created = false ) {
	$name = trim( $name );
	if ( '' === $name ) {
		return 0;
	}
	$term = get_term_by( 'name', $name, $taxonomy );
	if ( $term ) {
		return (int) $term->term_id;
	}
	if ( ! $create ) {
		return 0;
	}
	$res = wp_insert_term( $name, $taxonomy );
	if ( is_wp_error( $res ) ) {
		return 0;
	}
	$created = true;
	return (int) $res['term_id'];
}

/**
 * Find an existing dish by title (optionally scoped to a section).
 *
 * @param string $title      Dish title.
 * @param int    $section_id Section term id, or 0 for any.
 * @return int Post id, or 0.
 */
function find_dish( $title, $section_id ) {
	$args = array(
		'post_type'        => 'dinekit_menu_item',
		'post_status'      => array( 'publish', 'draft', 'pending', 'private' ),
		'posts_per_page'   => 1,
		'no_found_rows'    => true,
		'fields'           => 'ids',
		'title'            => $title,
		'suppress_filters' => false,
	);
	if ( $section_id ) {
		$args['tax_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
			array(
				'taxonomy' => 'dinekit_section',
				'terms'    => $section_id,
			),
		);
	}
	$q = new \WP_Query( $args );
	return $q->posts ? (int) $q->posts[0] : 0;
}

/**
 * Set a dish's photo from a URL: reuse the media-library attachment when the
 * URL is already ours, otherwise sideload the remote image once (cached per
 * request so repeated rows don't refetch).
 *
 * @param int    $post_id Dish post id.
 * @param string $url     Image URL.
 * @return void
 */
function set_dish_image( $post_id, $url ) {
	static $cache = array();

	$url = esc_url_raw( trim( $url ) );
	if ( '' === $url ) {
		return;
	}
	if ( ! isset( $cache[ $url ] ) ) {
		$att_id = attachment_url_to_postid( $url );
		if ( ! $att_id && wp_http_validate_url( $url ) ) {
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			$side   = media_sideload_image( $url, $post_id, null, 'id' );
			$att_id = is_wp_error( $side ) ? 0 : (int) $side;
		}
		$cache[ $url ] = (int) $att_id;
	}
	if ( $cache[ $url ] && (int) get_post_thumbnail_id( $post_id ) !== $cache[ $url ] ) {
		set_post_thumbnail( $post_id, $cache[ $url ] );
	}
}

/**
 * POST /menu/import — upsert dishes from CSV text. Body: { csv }.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response|\WP_Error
 */
function import_menu( $request ) {
	$csv = (string) $request->get_param( 'csv' );
	if ( '' === trim( $csv ) ) {
		return new \WP_Error( 'dinekit_csv_empty', __( 'Paste or upload a CSV first.', 'dinekit' ), array( 'status' => 400 ) );
	}

	// Parse via an in-memory stream (php://temp — not the filesystem) so quoted
	// commas/newlines are handled correctly by fgetcsv.
	$rows = array();
	$fh   = fopen( 'php://temp', 'r+' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- in-memory stream, not a file.
	fwrite( $fh, $csv ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- in-memory stream.
	rewind( $fh );
	$row = fgetcsv( $fh );
	while ( false !== $row ) {
		if ( array( null ) !== $row ) { // skip fully-blank lines
			$rows[] = $row;
		}
		$row = fgetcsv( $fh );
	}
	fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- in-memory stream.

	if ( count( $rows ) < 2 ) {
		return new \WP_Error( 'dinekit_csv_thin', __( 'The CSV needs a header row and at least one dish.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$header = array_map(
		static function ( $h ) {
			return strtolower( trim( (string) $h ) );
		},
		array_shift( $rows )
	);
	$col    = array_flip( $header );
	if ( ! isset( $col['dish'] ) ) {
		return new \WP_Error( 'dinekit_csv_header', __( 'The CSV needs a "Dish" column. Export your menu first to see the format.', 'dinekit' ), array( 'status' => 400 ) );
	}

	$created  = 0;
	$updated  = 0;
	$new_secs = 0;
	$skipped  = 0;
	$notes    = array();

	foreach ( $rows as $r ) {
		$get  = static function ( $name ) use ( $col, $r ) {
			return isset( $col[ $name ], $r[ $col[ $name ] ] ) ? trim( (string) $r[ $col[ $name ] ] ) : '';
		};
		$dish = $get( 'dish' );
		if ( '' === $dish ) {
			++$skipped;
			continue;
		}

		$section_id = 0;
		$section    = $get( 'section' );
		if ( '' !== $section ) {
			$made       = false;
			$section_id = term_id_by_name( 'dinekit_section', $section, true, $made );
			if ( $made ) {
				++$new_secs;
			}
		}

		// Published column ("yes"/"no") — optional; blank keeps things as they are.
		$pub_status = '';
		if ( isset( $col['published'] ) && '' !== $get( 'published' ) ) {
			$pub_status = in_array( strtolower( $get( 'published' ) ), array( 'no', 'n', '0', 'false', 'draft', 'hidden' ), true ) ? 'draft' : 'publish';
		}

		// Match by ID first (exact, survives renames), then by title within section.
		$existing = 0;
		if ( isset( $col['id'] ) && (int) $get( 'id' ) > 0 ) {
			$maybe = get_post( (int) $get( 'id' ) );
			if ( $maybe && 'dinekit_menu_item' === $maybe->post_type ) {
				$existing = (int) $maybe->ID;
			}
		}
		if ( ! $existing ) {
			$existing = find_dish( $dish, $section_id );
		}

		if ( $existing ) {
			$post_id = $existing;
			$update  = array(
				'ID'           => $post_id,
				'post_title'   => sanitize_text_field( $dish ),
				'post_content' => wp_kses_post( $get( 'description' ) ),
			);
			if ( '' !== $pub_status ) {
				$update['post_status'] = $pub_status;
			}
			wp_update_post( $update );
			++$updated;
		} else {
			$post_id = wp_insert_post(
				array(
					'post_type'    => 'dinekit_menu_item',
					'post_status'  => '' !== $pub_status ? $pub_status : 'publish',
					'post_title'   => sanitize_text_field( $dish ),
					'post_content' => wp_kses_post( $get( 'description' ) ),
				),
				true
			);
			if ( is_wp_error( $post_id ) ) {
				++$skipped;
				continue;
			}
			++$created;
		}

		// Section.
		if ( $section_id ) {
			wp_set_object_terms( $post_id, array( $section_id ), 'dinekit_section' );
		}
		// Prices.
		if ( isset( $col['price'] ) ) {
			update_post_meta( $post_id, 'dinekit_prices', parse_prices( $get( 'price' ) ) );
		}
		// Calories / cost.
		if ( isset( $col['calories'] ) && '' !== $get( 'calories' ) ) {
			update_post_meta( $post_id, 'dinekit_calories', max( 0, (int) $get( 'calories' ) ) );
		}
		if ( isset( $col['cost'] ) && '' !== $get( 'cost' ) ) {
			update_post_meta( $post_id, 'dinekit_cost', number_format( max( 0, (float) $get( 'cost' ) ), 2, '.', '' ) );
		}
		// Availability.
		if ( isset( $col['available'] ) ) {
			$av = strtolower( $get( 'available' ) );
			update_post_meta( $post_id, 'dinekit_stock', in_array( $av, array( 'no', 'n', '0', 'false', 'out' ), true ) ? 'out' : '' );
		}
		// Dietary (create missing) + allergens (match existing only).
		if ( isset( $col['dietary'] ) ) {
			$ids = array();
			foreach ( array_filter( array_map( 'trim', explode( '|', $get( 'dietary' ) ) ) ) as $n ) {
				$id = term_id_by_name( 'dinekit_dietary', $n, true );
				if ( $id ) {
					$ids[] = $id;
				}
			}
			wp_set_object_terms( $post_id, $ids, 'dinekit_dietary' );
		}
		if ( isset( $col['allergens'] ) ) {
			$ids = array();
			foreach ( array_filter( array_map( 'trim', explode( '|', $get( 'allergens' ) ) ) ) as $n ) {
				$id = term_id_by_name( 'dinekit_allergen', $n, false );
				if ( $id ) {
					$ids[] = $id;
				} elseif ( ! in_array( $n, $notes, true ) ) {
					$notes[] = $n;
				}
			}
			wp_set_object_terms( $post_id, $ids, 'dinekit_allergen' );
		}
		// Image URL — blank leaves the current photo alone.
		if ( isset( $col['image url'] ) && '' !== $get( 'image url' ) ) {
			set_dish_image( $post_id, $get( 'image url' ) );
		}
	}

	$summary = array(
		'created'         => $created,
		'updated'         => $updated,
		'sectionsCreated' => $new_secs,
		'skipped'         => $skipped,
	);
	if ( $notes ) {
		/* translators: %s: comma-separated list of unrecognised allergen names. */
		$summary['unknownAllergens'] = $notes;
	}
	return rest_ensure_response( $summary );
}
