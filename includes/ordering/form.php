<?php
/**
 * Public ordering page — a container + embedded config; assets/js/dinekit-order.js
 * builds the menu, configurator, cart and checkout, and posts to /checkout.
 *
 * @package DineKit
 */

namespace DineKit\Ordering\Form;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Render the ordering page.
 *
 * @param int    $menu_id Optional menu to limit to.
 * @param string $heading Heading.
 * @return string
 */
function render( $menu_id = 0, $heading = '' ) {
	require_once DINEKIT_DIR . 'includes/ordering/ordering.php';
	require_once DINEKIT_DIR . 'includes/settings.php';

	$settings = \DineKit\Ordering\get_settings();
	$s        = \DineKit\Settings\get();

	wp_enqueue_style( 'dinekit-order' );
	wp_enqueue_script( 'dinekit-order' );

	if ( empty( $settings['enabled'] ) ) {
		return '<div class="dinekit-order dinekit-order--off"><p>' .
			esc_html__( 'Online ordering is currently closed.', 'dinekit' ) . '</p></div>';
	}

	$config = wp_json_encode(
		array(
			'restUrl'     => esc_url_raw( rest_url( 'dinekit/v1/' ) ),
			'nonce'       => wp_create_nonce( 'wp_rest' ),
			'currency'    => (string) $s['currency'],
			'currencyPos' => 'after' === $s['currencyPosition'] ? 'after' : 'before',
			'prepMins'    => (int) $settings['prep_mins'],
			'minOrder'    => (float) $settings['min_order'],
			'menu'        => \DineKit\Ordering\orderable_menu( $menu_id ),
			'i18n'        => array(
				'add'          => __( 'Add', 'dinekit' ),
				'addToOrder'   => __( 'Add to order', 'dinekit' ),
				'yourOrder'    => __( 'Your order', 'dinekit' ),
				'empty'        => __( 'Your basket is empty.', 'dinekit' ),
				'checkout'     => __( 'Checkout', 'dinekit' ),
				'placeOrder'   => __( 'Place order', 'dinekit' ),
				'total'        => __( 'Total', 'dinekit' ),
				'minOrder'     => __( 'Minimum order', 'dinekit' ),
				'collection'   => __( 'Collection', 'dinekit' ),
				'asap'         => __( 'As soon as possible', 'dinekit' ),
				'name'         => __( 'Name', 'dinekit' ),
				'email'        => __( 'Email', 'dinekit' ),
				'phone'        => __( 'Phone', 'dinekit' ),
				'notes'        => __( 'Notes (allergies, requests…)', 'dinekit' ),
				'back'         => __( 'Back to menu', 'dinekit' ),
				'needContact'  => __( 'Please enter your name and an email or phone.', 'dinekit' ),
				'placed'       => __( 'Order placed!', 'dinekit' ),
				'orderNumber'  => __( 'Your order number is', 'dinekit' ),
				'collectMsg'   => __( 'We’ll have it ready for collection.', 'dinekit' ),
				'genericError' => __( 'Sorry, something went wrong. Please try again.', 'dinekit' ),
				'networkError' => __( 'Network error — please try again.', 'dinekit' ),
				'remove'       => __( 'Remove', 'dinekit' ),
				'choose'       => __( 'Choose', 'dinekit' ),
				'optional'     => __( 'optional', 'dinekit' ),
			),
		),
		JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
	);

	if ( '' === $heading ) {
		$heading = __( 'Order online', 'dinekit' );
	}

	return '<div class="dinekit-order" data-dinekit-order="' . esc_attr( $config ) . '">' .
		'<h2 class="dinekit-order__heading">' . esc_html( $heading ) . '</h2>' .
		'<div class="dinekit-order__app"><p class="dinekit-order__loading">' . esc_html__( 'Loading menu…', 'dinekit' ) . '</p></div>' .
		'</div>';
}
