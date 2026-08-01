import { useEffect, useState } from 'react';

// Tab/sub-view state that lives in the URL (#/view or #/view/tab) so a refresh
// or a shared link lands on the same screen. Written with replaceState so
// flipping tabs doesn't pollute the Back button; also follows hash changes
// made while the view is open (e.g. a pasted link).
export default function useHashTab( view, tabs, fallback ) {
	const read = () => {
		const seg = window.location.hash.replace( /^#\/?/, '' ).split( '/' );
		return seg[ 0 ] === view && tabs.includes( seg[ 1 ] ) ? seg[ 1 ] : fallback;
	};
	const [ tab, setTabState ] = useState( read );
	const setTab = ( v ) => {
		setTabState( v );
		window.history.replaceState(
			null,
			'',
			window.location.pathname + window.location.search + '#/' + view + ( v === fallback ? '' : '/' + v )
		);
	};
	useEffect( () => {
		const onHash = () => {
			const seg = window.location.hash.replace( /^#\/?/, '' ).split( '/' );
			if ( seg[ 0 ] === view ) {
				setTabState( tabs.includes( seg[ 1 ] ) ? seg[ 1 ] : fallback );
			}
		};
		window.addEventListener( 'hashchange', onHash );
		return () => window.removeEventListener( 'hashchange', onHash );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );
	return [ tab, setTab ];
}
