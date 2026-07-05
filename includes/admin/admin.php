<?php
/**
 * Admin bootstrap: list-table columns and Help tab. (Wizard lands in M5,
 * metaboxes/repeater in M2.)
 *
 * @package DineKit
 */

namespace DineKit\Admin;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook admin behaviour.
 *
 * @return void
 */
function init() {
	add_filter( 'manage_dinekit_menu_item_posts_columns', __NAMESPACE__ . '\\columns' );
	add_action( 'manage_dinekit_menu_item_posts_custom_column', __NAMESPACE__ . '\\column_content', 10, 2 );
}

/**
 * Add a Price column to the menu item list table.
 *
 * @param array<string,string> $columns Existing columns.
 * @return array<string,string>
 */
function columns( $columns ) {
	$new = array();
	foreach ( $columns as $key => $label ) {
		$new[ $key ] = $label;
		if ( 'title' === $key ) {
			$new['dinekit_price'] = __( 'Price', 'dinekit' );
		}
	}
	return $new;
}

/**
 * Render custom column content.
 *
 * @param string $column  Column key.
 * @param int    $post_id Post ID.
 * @return void
 */
function column_content( $column, $post_id ) {
	if ( 'dinekit_price' !== $column ) {
		return;
	}
	$prices = get_post_meta( $post_id, 'dinekit_prices', true );
	if ( ! is_array( $prices ) ) {
		$prices = array();
	}
	$prices = array_values( $prices );
	$parts  = array();
	foreach ( $prices as $row ) {
		$label  = isset( $row['label'] ) ? $row['label'] : '';
		$amount = isset( $row['amount'] ) ? $row['amount'] : '';
		if ( '' === $amount ) {
			continue;
		}
		$parts[] = ( '' !== $label ) ? $label . ': ' . $amount : $amount;
	}
	echo empty( $parts ) ? '&#8212;' : esc_html( implode( ' · ', $parts ) );
}
