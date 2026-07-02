<?php
/**
 * Post meta registration for menu items.
 *
 * @package DineKit
 */

namespace DineKit\Meta;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register menu item meta.
 *
 * `dk_prices` is the canonical price store: an array of { label, amount }
 * rows so items can carry multiple prices (pint/half, small/large). A single
 * price is simply one row with an empty label.
 *
 * @return void
 */
function register() {
	register_post_meta(
		'dk_menu_item',
		'dk_prices',
		array(
			'type'              => 'array',
			'description'       => __( 'Item prices (label + amount rows).', 'dinekit' ),
			'single'            => true,
			'default'           => array(),
			'show_in_rest'      => array(
				'schema' => array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => array(
							'label'  => array( 'type' => 'string' ),
							'amount' => array( 'type' => 'string' ),
						),
					),
				),
			),
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_prices',
			'auth_callback'     => __NAMESPACE__ . '\\can_edit_item',
		)
	);

	foreach ( array( 'dk_section', 'dk_menu' ) as $taxonomy ) {
		register_term_meta(
			$taxonomy,
			'dk_order',
			array(
				'type'              => 'integer',
				'description'       => __( 'Display order within DineKit menus.', 'dinekit' ),
				'single'            => true,
				'default'           => 0,
				'show_in_rest'      => true,
				'sanitize_callback' => 'absint',
			)
		);
	}

	register_post_meta(
		'dk_menu_item',
		'dk_badge',
		array(
			'type'              => 'string',
			'description'       => __( 'Optional badge, e.g. New, Popular, Chef\'s Special.', 'dinekit' ),
			'single'            => true,
			'default'           => '',
			'show_in_rest'      => true,
			'sanitize_callback' => 'sanitize_text_field',
			'auth_callback'     => __NAMESPACE__ . '\\can_edit_item',
		)
	);
}

/**
 * Sanitize the prices array.
 *
 * @param mixed $value Raw meta value.
 * @return array<int,array{label:string,amount:string}>
 */
function sanitize_prices( $value ) {
	if ( ! is_array( $value ) ) {
		return array();
	}
	$clean = array();
	foreach ( $value as $row ) {
		if ( ! is_array( $row ) ) {
			continue;
		}
		$label  = isset( $row['label'] ) ? sanitize_text_field( (string) $row['label'] ) : '';
		$amount = isset( $row['amount'] ) ? sanitize_text_field( (string) $row['amount'] ) : '';
		if ( '' === $label && '' === $amount ) {
			continue;
		}
		$clean[] = array(
			'label'  => $label,
			'amount' => $amount,
		);
	}
	return $clean;
}

/**
 * Meta edit permission check.
 *
 * @return bool
 */
function can_edit_item() {
	return current_user_can( 'edit_posts' );
}
