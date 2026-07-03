import { useCallback, useEffect, useState } from 'react';

// Lightweight hash router so the admin app is deep-linkable and survives a
// refresh. URLs look like admin.php?page=dinekit#/design or
// #/builder/item/8 (a specific dish open in the editor).
const VALID_VIEWS = [ 'builder', 'design', 'qr', 'hours', 'bookings', 'floor', 'events', 'integrations', 'settings' ];

function parse() {
	const raw = window.location.hash.replace( /^#\/?/, '' );
	const [ view, sub, subId ] = raw.split( '/' );
	return {
		view: VALID_VIEWS.includes( view ) ? view : 'builder',
		itemId: 'item' === sub && subId ? parseInt( subId, 10 ) || null : null,
	};
}

export function useRoute() {
	const [ route, setRoute ] = useState( parse );

	useEffect( () => {
		const onChange = () => setRoute( parse() );
		window.addEventListener( 'hashchange', onChange );

		// Reflect the initial view in the URL so it's shareable from the start.
		if ( ! window.location.hash ) {
			window.history.replaceState(
				null,
				'',
				window.location.pathname + window.location.search + '#/builder'
			);
		}
		return () => window.removeEventListener( 'hashchange', onChange );
	}, [] );

	const navigate = useCallback( ( view, itemId ) => {
		window.location.hash = itemId ? `#/${ view }/item/${ itemId }` : `#/${ view }`;
	}, [] );

	return { view: route.view, itemId: route.itemId, navigate };
}
