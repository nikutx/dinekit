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
 * `dinekit_prices` is the canonical price store: an array of { label, amount }
 * rows so items can carry multiple prices (pint/half, small/large). A single
 * price is simply one row with an empty label.
 *
 * @return void
 */
function register() {
	register_post_meta(
		'dinekit_menu_item',
		'dinekit_prices',
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

	foreach ( array( 'dinekit_section', 'dinekit_menu' ) as $taxonomy ) {
		register_term_meta(
			$taxonomy,
			'dinekit_order',
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
		'dinekit_menu_item',
		'dinekit_badge',
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

	// Prep station for order-ticket routing: 'kitchen' (default) or 'bar'.
	register_post_meta(
		'dinekit_menu_item',
		'dinekit_station',
		array(
			'type'              => 'string',
			'description'       => __( 'Prep station for order tickets: kitchen or bar.', 'dinekit' ),
			'single'            => true,
			'default'           => 'kitchen',
			'show_in_rest'      => false,
			'sanitize_callback' => static function ( $v ) {
				return 'bar' === $v ? 'bar' : 'kitchen';
			},
			'auth_callback'     => __NAMESPACE__ . '\\can_edit_item',
		)
	);

	// Archived (not deleted). Dishes are never hard-deleted: past orders reference
	// them and reports read their titles. Archiving hides a dish from the builder,
	// the public menu and ordering, and is fully reversible. Mirrors the
	// `dinekit_order_archived` flag used for orders.
	register_post_meta(
		'dinekit_menu_item',
		'dinekit_item_archived',
		array(
			'type'              => 'integer',
			'description'       => __( 'Archived dishes are hidden everywhere but never deleted.', 'dinekit' ),
			'single'            => true,
			'default'           => 0,
			'show_in_rest'      => false,
			'sanitize_callback' => static function ( $v ) {
				return $v ? 1 : 0;
			},
			'auth_callback'     => __NAMESPACE__ . '\\can_edit_item',
		)
	);

	// Dish customizations: groups of options a diner can pick or remove.
	register_post_meta(
		'dinekit_menu_item',
		'dinekit_modifiers',
		array(
			'type'              => 'array',
			'description'       => __( 'Customization groups (removable ingredients + choice options).', 'dinekit' ),
			'single'            => true,
			'default'           => array(),
			'show_in_rest'      => false,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_modifiers',
			'auth_callback'     => __NAMESPACE__ . '\\can_edit_item',
		)
	);
}

/**
 * Sanitize the modifiers structure — an array of groups, each with a name, a
 * type ("remove" ingredients | "choose" options), min/max selectable, and a
 * list of options ({ label, price }). One model covers "no onions" and
 * "choose your base / sauce / toppings" for any dish.
 *
 * @param mixed $value Raw meta value.
 * @return array<int,array<string,mixed>>
 */
function sanitize_modifiers( $value ) {
	if ( ! is_array( $value ) ) {
		return array();
	}
	$clean = array();
	foreach ( $value as $group ) {
		if ( ! is_array( $group ) ) {
			continue;
		}
		$name = isset( $group['name'] ) ? sanitize_text_field( (string) $group['name'] ) : '';
		$type = ( isset( $group['type'] ) && 'remove' === $group['type'] ) ? 'remove' : 'choose';
		$min  = isset( $group['min'] ) ? absint( $group['min'] ) : 0;
		$max  = isset( $group['max'] ) ? absint( $group['max'] ) : 0;

		$options = array();
		if ( isset( $group['options'] ) && is_array( $group['options'] ) ) {
			foreach ( $group['options'] as $opt ) {
				if ( ! is_array( $opt ) ) {
					continue;
				}
				$label = isset( $opt['label'] ) ? sanitize_text_field( (string) $opt['label'] ) : '';
				if ( '' === $label ) {
					continue;
				}
				$options[] = array(
					'label' => $label,
					'price' => isset( $opt['price'] ) ? sanitize_text_field( (string) $opt['price'] ) : '',
				);
			}
		}
		if ( '' === $name && empty( $options ) ) {
			continue;
		}
		$clean[] = array(
			'name'    => $name,
			'type'    => $type,
			'min'     => $min,
			'max'     => $max,
			'options' => $options,
		);
	}
	return $clean;
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
