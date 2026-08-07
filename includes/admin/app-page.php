<?php
/**
 * DineKit admin menu page — the single mount point for the React SPA.
 *
 * @package DineKit
 */

namespace DineKit\Admin\App;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hook the admin page and its assets.
 *
 * @return void
 */
function init() {
	add_action( 'admin_menu', __NAMESPACE__ . '\\register_page' );
	add_action( 'admin_enqueue_scripts', __NAMESPACE__ . '\\load_assets' );
	add_filter( 'admin_body_class', __NAMESPACE__ . '\\body_class' );
	add_action( 'current_screen', __NAMESPACE__ . '\\help_tab' );
	add_action( 'current_screen', __NAMESPACE__ . '\\disable_emoji_swap' );
	add_action( 'admin_print_footer_scripts', __NAMESPACE__ . '\\menu_chrome' );
}

/**
 * Keep WP's twemoji swapper off the DineKit screen.
 *
 * Core replaces emoji characters (⭐, 📝, ⏰…) with <img> elements INSIDE
 * React-managed DOM; the next React reconciliation of that node then throws
 * NotFoundError (removeChild) and white-screens the app. The SPA renders
 * native emoji fine, so on this one screen the swapper must not run.
 *
 * @param \WP_Screen $screen Current screen.
 * @return void
 */
function disable_emoji_swap( $screen ) {
	if ( ! $screen || 'toplevel_page_dinekit' !== $screen->id ) {
		return;
	}
	remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
	remove_action( 'admin_print_styles', 'print_emoji_styles' );
}

/**
 * Add a "Want it set up for you?" help tab on the DineKit screen (subtle WLU
 * lead hook — the credit itself stays off by default in v1).
 *
 * @param \WP_Screen $screen Current screen.
 * @return void
 */
function help_tab( $screen ) {
	if ( ! $screen || 'toplevel_page_dinekit' !== $screen->id ) {
		return;
	}
	$screen->add_help_tab(
		array(
			'id'      => 'dinekit-help-setup',
			'title'   => __( 'Want it set up for you?', 'dinekit' ),
			'content' => '<p>' . esc_html__( 'Short on time? Web Level Up can build and style your whole menu for you.', 'dinekit' ) . '</p>' .
				'<p><a href="https://weblevelup.co.uk/dinekit" target="_blank" rel="noopener">' .
				esc_html__( 'Get done-for-you setup →', 'dinekit' ) . '</a></p>',
		)
	);
}

/**
 * Register the top-level DineKit menu (the CPT menu is hidden in favour of it).
 *
 * @return void
 */
function register_page() {
	add_menu_page(
		__( 'DineKit', 'dinekit' ),
		__( 'DineKit', 'dinekit' ),
		'dinekit_access', // Admins/editors get this dynamically; staff via their role.
		'dinekit',
		__NAMESPACE__ . '\\render',
		'dashicons-food',
		26
	);

	// EVERY app screen, mirrored as native WP submenu links, so inside
	// wp-admin this submenu IS the navigation (the app hides its own rail
	// there — one menu, not two; the rail still runs the standalone app).
	// Each slug after the first is the page slug plus a hash route:
	// WordPress prints it verbatim, so from anywhere in wp-admin the link
	// loads the app on the right screen — and from inside the app only the
	// hash changes, which is instant.
	foreach ( screens() as $screen ) {
		// Every entry registers the render callback: WordPress only builds an
		// admin.php?page=… link for slugs with a page hook. The browser keeps
		// the #route client-side, so the server always loads page=dinekit.
		$slug = 'home' === $screen['route'] ? 'dinekit' : 'dinekit#/' . $screen['route'];
		add_submenu_page( 'dinekit', $screen['label'], $screen['label'], 'dinekit_access', $slug, __NAMESPACE__ . '\\render' );
	}
}

/**
 * The app screens the CURRENT USER may open — same order, labels, business-type
 * gating and permission rules as the app's own navigation, so the WP submenu
 * and the standalone app can never disagree about what exists.
 *
 * `sep` marks where the app draws a group line (Front of house / Menu / Setup);
 * `icon` is a dashicons class painted into the submenu by menu_chrome().
 *
 * @return array<int,array{route:string,label:string,icon:string,sep?:bool}>
 */
function screens() {
	require_once DINEKIT_DIR . 'includes/access.php';
	require_once DINEKIT_DIR . 'includes/settings.php';

	$type  = (string) \DineKit\Settings\get()['businessType'];
	$owner = current_user_can( 'manage_options' );
	$menu  = $owner || current_user_can( 'edit_others_posts' );

	$all = array(
		array(
			'route' => 'home',
			'label' => __( 'Home', 'dinekit' ),
			'icon'  => 'dashicons-dashboard',
			'can'   => \DineKit\Access\can_access(),
		),
		array(
			'route' => 'reports',
			'label' => __( 'Reports', 'dinekit' ),
			'icon'  => 'dashicons-chart-bar',
			'can'   => \DineKit\Access\can_access(),
		),
		array(
			'route' => 'bookings',
			'label' => __( 'Bookings', 'dinekit' ),
			'icon'  => 'dashicons-calendar-alt',
			'can'   => 'takeaway' !== $type && \DineKit\Access\can( 'bookings' ),
			'sep'   => true,
		),
		array(
			'route' => 'floor',
			'label' => __( 'Floor Plan', 'dinekit' ),
			'icon'  => 'dashicons-grid-view',
			'can'   => 'takeaway' !== $type && \DineKit\Access\can( 'bookings' ),
		),
		array(
			'route' => 'orders',
			'label' => __( 'Orders', 'dinekit' ),
			'icon'  => 'dashicons-list-view',
			'can'   => 'dinein' !== $type && \DineKit\Access\can( 'orders' ),
		),
		array(
			'route' => 'kds',
			'label' => __( 'Kitchen Display', 'dinekit' ),
			'icon'  => 'dashicons-food',
			'can'   => \DineKit\Access\can( 'orders' ),
		),
		array(
			'route' => 'pos',
			'label' => __( 'Take Order', 'dinekit' ),
			'icon'  => 'dashicons-cart',
			'can'   => \DineKit\Access\can( 'orders' ),
		),
		array(
			'route' => 'events',
			'label' => __( 'Events', 'dinekit' ),
			'icon'  => 'dashicons-tickets-alt',
			'can'   => \DineKit\Access\can( 'events' ),
		),
		array(
			'route' => 'guests',
			'label' => __( 'Guests', 'dinekit' ),
			'icon'  => 'dashicons-groups',
			'can'   => \DineKit\Access\can( 'bookings' ),
		),
		array(
			'route' => 'reviews',
			'label' => __( 'Reviews', 'dinekit' ),
			'icon'  => 'dashicons-star-filled',
			'can'   => \DineKit\Access\can( 'settings' ),
		),
		array(
			'route' => 'staff',
			'label' => __( 'Staff', 'dinekit' ),
			'icon'  => 'dashicons-id',
			'can'   => \DineKit\Access\can( 'staff' ),
		),
		array(
			'route' => 'builder',
			'label' => __( 'Menu Builder', 'dinekit' ),
			'icon'  => 'dashicons-menu-alt',
			'can'   => $menu,
			'sep'   => true,
		),
		array(
			'route' => 'design',
			'label' => __( 'Design & Preview', 'dinekit' ),
			'icon'  => 'dashicons-admin-appearance',
			'can'   => $menu,
		),
		array(
			'route' => 'qr',
			'label' => __( 'QR Code', 'dinekit' ),
			'icon'  => 'dashicons-screenoptions',
			'can'   => $menu,
		),
		array(
			'route' => 'hours',
			'label' => __( 'Opening Hours', 'dinekit' ),
			'icon'  => 'dashicons-clock',
			'can'   => $menu,
			'sep'   => true,
		),
		array(
			'route' => 'integrations',
			'label' => __( 'Integrations', 'dinekit' ),
			'icon'  => 'dashicons-admin-plugins',
			'can'   => \DineKit\Access\can( 'settings' ),
		),
		array(
			'route' => 'emails',
			'label' => __( 'Emails', 'dinekit' ),
			'icon'  => 'dashicons-email-alt',
			'can'   => \DineKit\Access\can( 'settings' ),
		),
		array(
			'route' => 'access',
			'label' => __( 'Access Control', 'dinekit' ),
			'icon'  => 'dashicons-lock',
			'can'   => $owner,
		),
		array(
			'route' => 'activity',
			'label' => __( 'Activity', 'dinekit' ),
			'icon'  => 'dashicons-backup',
			'can'   => \DineKit\Access\can( 'staff' ),
		),
		array(
			'route' => 'settings',
			'label' => __( 'Settings', 'dinekit' ),
			'icon'  => 'dashicons-admin-generic',
			'can'   => \DineKit\Access\can( 'settings' ),
		),
		array(
			'route' => 'support',
			'label' => __( 'Support', 'dinekit' ),
			'icon'  => 'dashicons-sos',
			'can'   => \DineKit\Access\can_access(),
		),
	);

	return array_values( array_filter( $all, fn( $s ) => $s['can'] ) );
}

/**
 * Paint the DineKit submenu: a dashicon per entry and a hairline where the app
 * draws its group breaks. WordPress submenus carry no icon support of their
 * own, so a few footer lines decorate the links by their hash — class names,
 * not glyph codepoints, so nothing breaks if dashicons renumber. Runs on every
 * admin screen (the menu shows everywhere) and exits fast when absent.
 *
 * @return void
 */
function menu_chrome() {
	$map  = array( 'home' => 'dashicons-dashboard' );
	$seps = array();
	foreach ( screens() as $screen ) {
		$map[ $screen['route'] ] = $screen['icon'];
		if ( ! empty( $screen['sep'] ) ) {
			$seps[] = $screen['route'];
		}
	}
	?>
	<style>
		#toplevel_page_dinekit .wp-submenu a .dashicons {
			font-size: 16px;
			width: 16px;
			height: 16px;
			line-height: 1.2;
			margin-right: 7px;
			vertical-align: text-bottom;
			opacity: 0.75;
		}
		#toplevel_page_dinekit .wp-submenu li.dinekit-sep {
			border-top: 1px solid rgba(255, 255, 255, 0.12);
			margin-top: 4px;
			padding-top: 4px;
		}
	</style>
	<script>
		( function () {
			var menu = document.getElementById( 'toplevel_page_dinekit' );
			if ( ! menu ) {
				return;
			}
			var icons = <?php echo wp_json_encode( $map ); ?>;
			var seps = <?php echo wp_json_encode( $seps ); ?>;
			menu.querySelectorAll( '.wp-submenu li a' ).forEach( function ( a ) {
				var hash = ( a.getAttribute( 'href' ) || '' ).split( '#/' )[ 1 ];
				var route = hash || 'home';
				if ( icons[ route ] && ! a.querySelector( '.dashicons' ) ) {
					var i = document.createElement( 'span' );
					i.className = 'dashicons ' + icons[ route ];
					i.setAttribute( 'aria-hidden', 'true' );
					a.insertBefore( i, a.firstChild );
				}
				if ( seps.indexOf( route ) !== -1 ) {
					a.parentElement.classList.add( 'dinekit-sep' );
				}
			} );
		}() );
	</script>
	<?php
}

/**
 * Delegate asset loading to the dev/prod-aware loader.
 *
 * @param string $hook Current admin page hook suffix.
 * @return void
 */
function load_assets( $hook ) {
	require_once __DIR__ . '/assets.php';
	\DineKit\Admin\Assets\enqueue( $hook );
}

/**
 * Tag our screen so the chrome-hiding CSS can scope to it.
 *
 * @param string $classes Space-separated body classes.
 * @return string
 */
function body_class( $classes ) {
	$screen = get_current_screen();
	if ( $screen && 'toplevel_page_dinekit' === $screen->id ) {
		$classes .= ' dinekit-screen';
	}
	return $classes;
}

/**
 * Render the SPA mount point.
 *
 * @return void
 */
function render() {
	echo '<div class="wrap"><div id="dinekit-root"></div></div>';
}
