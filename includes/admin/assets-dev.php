<?php
/**
 * Vite dev-server enqueue (HMR). Development only — excluded from the shipped
 * plugin zip via .distignore / build-zip.js.
 *
 * @package DineKit
 */

namespace DineKit\Admin\AssetsDev;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue the Vite client, React refresh preamble and the app entry as ES
 * modules pointing at the running dev server.
 *
 * @param string $origin Dev server origin, e.g. http://dinekit-dev.local:5174.
 * @return void
 */
function enqueue_vite( $origin ) {
	add_filter(
		'script_loader_tag',
		function ( $tag, $handle, $src ) use ( $origin ) {
			if ( 'dinekit-vite-preamble' === $handle ) {
				return '<script type="module">' .
					'import RefreshRuntime from "' . esc_url( $origin ) . '/@react-refresh";' .
					'RefreshRuntime.injectIntoGlobalHook(window);' .
					'window.$RefreshReg$=()=>{};' .
					'window.$RefreshSig$=()=>(type)=>type;' .
					'window.__vite_plugin_react_preamble_installed__=true;' .
					'</script>';
			}
			if ( in_array( $handle, array( 'dinekit-vite-client', 'dinekit-app' ), true ) ) {
				return '<script type="module" src="' . esc_url( $src ) . '"></script>';
			}
			return $tag;
		},
		10,
		3
	);

	wp_enqueue_script( 'dinekit-vite-preamble', $origin . '/@react-refresh', array(), null, false ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
	wp_enqueue_script( 'dinekit-vite-client', $origin . '/@vite/client', array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
	wp_enqueue_script( 'dinekit-app', $origin . '/src/main.jsx', array( 'wp-element' ), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
}
