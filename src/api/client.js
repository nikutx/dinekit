// Thin REST client for the dinekit/v1 API. Reads config injected by PHP
// (window.DINEKIT) — restUrl + nonce.
const cfg = window.DINEKIT || {};

async function request( method, path, body ) {
	const res = await fetch( cfg.restUrl + path.replace( /^\//, '' ), {
		method,
		credentials: 'same-origin',
		headers: {
			'Content-Type': 'application/json',
			'X-WP-Nonce': cfg.nonce,
		},
		body: body ? JSON.stringify( body ) : undefined,
	} );

	if ( ! res.ok ) {
		let message = `Request failed (${ res.status })`;
		try {
			const data = await res.json();
			if ( data && data.message ) {
				message = data.message;
			}
		} catch ( e ) {
			// keep default
		}
		throw new Error( message );
	}

	if ( res.status === 204 ) {
		return null;
	}
	return res.json();
}

export const api = {
	config: cfg,
	getState: () => request( 'GET', 'state' ),
	createItem: ( data ) => request( 'POST', 'items', data ),
	updateItem: ( id, data ) => request( 'PATCH', `items/${ id }`, data ),
	deleteItem: ( id ) => request( 'DELETE', `items/${ id }` ),
	createTerm: ( tax, name ) => request( 'POST', `terms/${ tax }`, { name } ),
	updateTerm: ( tax, id, name ) => request( 'PATCH', `terms/${ tax }/${ id }`, { name } ),
	deleteTerm: ( tax, id ) => request( 'DELETE', `terms/${ tax }/${ id }` ),
	saveOrder: ( payload ) => request( 'POST', 'order', payload ),
	getHours: () => request( 'GET', 'hours' ),
	saveHours: ( hours ) => request( 'POST', 'hours', hours ),
	getQr: ( url ) => request( 'GET', 'qr?url=' + encodeURIComponent( url ) ),
	setup: ( name ) => request( 'POST', 'setup', { name } ),
	createMenuPage: () => request( 'POST', 'menu-page' ),
	getPreview: ( params ) => request( 'GET', 'preview?' + new URLSearchParams( params ).toString() ),
	getSettings: () => request( 'GET', 'settings' ),
	saveSettings: ( settings ) => request( 'POST', 'settings', settings ),
	getPages: async () => {
		const res = await fetch( cfg.restRoot + 'wp/v2/pages?per_page=100&status=publish&_fields=id,link,title', {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce },
		} );
		return res.ok ? res.json() : [];
	},
};
