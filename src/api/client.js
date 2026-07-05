// Thin REST client for the dinekit/v1 API. Reads config injected by PHP
// (window.DINEKIT) — restUrl + nonce.
import { saveBus } from '../lib/saveBus';

const cfg = window.DINEKIT || {};

async function request( method, path, body ) {
	// Any write drives the global save-status pill so nothing saves silently.
	const mutating = method !== 'GET' && method !== 'HEAD';
	if ( mutating ) {
		saveBus.begin();
	}
	let ok = false;
	try {
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

		ok = true;
		if ( res.status === 204 ) {
			return null;
		}
		return await res.json();
	} finally {
		if ( mutating ) {
			saveBus.finish( ok );
		}
	}
}

export const api = {
	config: cfg,
	getState: () => request( 'GET', 'state' ),
	getDashboard: () => request( 'GET', 'dashboard' ),
	getReports: ( { from, to } = {} ) => {
		const q = new URLSearchParams();
		if ( from ) {
			q.set( 'from', from );
		}
		if ( to ) {
			q.set( 'to', to );
		}
		const s = q.toString();
		return request( 'GET', 'reports' + ( s ? '?' + s : '' ) );
	},
	getServiceSheet: ( date ) => request( 'GET', 'reports/service-sheet?date=' + encodeURIComponent( date ) ),
	saveGuestProfile: ( data ) => request( 'POST', 'guests/profile', data ),
	createItem: ( data ) => request( 'POST', 'items', data ),
	updateItem: ( id, data ) => request( 'PATCH', `items/${ id }`, data ),
	deleteItem: ( id ) => request( 'DELETE', `items/${ id }` ),
	duplicateItem: ( id ) => request( 'POST', `items/${ id }/duplicate` ),
	duplicateSection: ( id ) => request( 'POST', `sections/${ id }/duplicate` ),
	createTerm: ( tax, name ) => request( 'POST', `terms/${ tax }`, { name } ),
	updateTerm: ( tax, id, name ) => request( 'PATCH', `terms/${ tax }/${ id }`, { name } ),
	deleteTerm: ( tax, id ) => request( 'DELETE', `terms/${ tax }/${ id }` ),
	saveOrder: ( payload ) => request( 'POST', 'order', payload ),
	getHours: () => request( 'GET', 'hours' ),
	saveHours: ( hours ) => request( 'POST', 'hours', hours ),
	getQr: ( url ) => request( 'GET', 'qr?url=' + encodeURIComponent( url ) ),
	setup: ( name ) => request( 'POST', 'setup', { name } ),
	runWizard: ( data ) => request( 'POST', 'wizard', data ),
	createMenuPage: () => request( 'POST', 'menu-page' ),
	createSetupPage: ( type ) => request( 'POST', 'setup-page', { type } ),
	getPreview: ( params ) => request( 'GET', 'preview?' + new URLSearchParams( params ).toString() ),
	getSettings: () => request( 'GET', 'settings' ),
	saveSettings: ( settings ) => request( 'POST', 'settings', settings ),
	getAccess: () => request( 'GET', 'access' ),
	saveAccess: ( matrix ) => request( 'POST', 'access', { matrix } ),
	getIntegrations: () => request( 'GET', 'integrations' ),
	saveIntegrations: ( data ) => request( 'POST', 'integrations', data ),
	testStripe: () => request( 'POST', 'integrations/test' ),
	registerStripeWebhook: () => request( 'POST', 'integrations/webhook' ),
	getEmails: () => request( 'GET', 'emails' ),
	saveEmails: ( data ) => request( 'POST', 'emails', data ),
	previewEmail: ( key ) => request( 'POST', 'emails/preview', { key } ),
	saveMenuSchedule: ( id, schedule ) => request( 'POST', `menus/${ id }/schedule`, schedule ),
	duplicateMenu: ( id ) => request( 'POST', `menus/${ id }/duplicate` ),
	getMenuUsed: ( id ) => request( 'GET', `menus/${ id }/used` ),

	// Bookings — floor plan (areas + tables).
	getFloor: () => request( 'GET', 'bookings/floor' ),
	createArea: ( name ) => request( 'POST', 'bookings/areas', { name } ),
	updateArea: ( id, name ) => request( 'PATCH', `bookings/areas/${ id }`, { name } ),
	deleteArea: ( id ) => request( 'DELETE', `bookings/areas/${ id }` ),
	createTable: ( data ) => request( 'POST', 'bookings/tables', data ),
	updateTable: ( id, data ) => request( 'PATCH', `bookings/tables/${ id }`, data ),
	deleteTable: ( id ) => request( 'DELETE', `bookings/tables/${ id }` ),
	createCombo: ( data ) => request( 'POST', 'bookings/combos', data ),
	updateCombo: ( id, data ) => request( 'PATCH', `bookings/combos/${ id }`, data ),
	deleteCombo: ( id ) => request( 'DELETE', `bookings/combos/${ id }` ),

	// Bookings — availability + diary.
	getAvailability: ( { date, time, party } ) =>
		request( 'GET', 'bookings/availability?' + new URLSearchParams( { date, time, party } ).toString() ),
	listBookings: ( { from, to } = {} ) => {
		const q = new URLSearchParams();
		if ( from ) {
			q.set( 'from', from );
		}
		if ( to ) {
			q.set( 'to', to );
		}
		const s = q.toString();
		return request( 'GET', 'bookings/list' + ( s ? '?' + s : '' ) );
	},
	createBooking: ( data ) => request( 'POST', 'bookings', data ),
	updateBooking: ( id, data ) => request( 'PATCH', `bookings/${ id }`, data ),
	deleteBooking: ( id ) => request( 'DELETE', `bookings/${ id }` ),
	getServiceWindow: ( date ) => request( 'GET', 'bookings/service?date=' + encodeURIComponent( date ) ),
	getBookingSettings: () => request( 'GET', 'bookings/settings' ),
	saveBookingSettings: ( data ) => request( 'POST', 'bookings/settings', data ),
	getGuests: () => request( 'GET', 'guests' ),
	// Staff & labour.
	getStaff: () => request( 'GET', 'staff' ),
	createStaff: ( data ) => request( 'POST', 'staff', data ),
	updateStaff: ( id, data ) => request( 'PATCH', `staff/${ id }`, data ),
	deleteStaff: ( id ) => request( 'DELETE', `staff/${ id }` ),
	staffLogin: ( id, data ) => request( 'POST', `staff/${ id }/login`, data ),
	getStaffSettings: () => request( 'GET', 'staff/settings' ),
	saveStaffSettings: ( data ) => request( 'POST', 'staff/settings', data ),
	getShifts: ( { from, to } ) => request( 'GET', 'shifts?' + new URLSearchParams( { from, to } ).toString() ),
	createShift: ( data ) => request( 'POST', 'shifts', data ),
	updateShift: ( id, data ) => request( 'PATCH', `shifts/${ id }`, data ),
	deleteShift: ( id ) => request( 'DELETE', `shifts/${ id }` ),
	getStaffOps: ( date ) => request( 'GET', 'staff/ops?date=' + encodeURIComponent( date ) ),
	getLeave: () => request( 'GET', 'leave' ),
	createLeave: ( data ) => request( 'POST', 'leave', data ),
	updateLeave: ( id, data ) => request( 'PATCH', `leave/${ id }`, data ),
	deleteLeave: ( id ) => request( 'DELETE', `leave/${ id }` ),

	getReviews: () => request( 'GET', 'reviews' ),
	saveReviews: ( data ) => request( 'POST', 'reviews', data ),
	requestReview: ( bookingId ) => request( 'POST', `reviews/request/${ bookingId }` ),
	getFeedback: () => request( 'GET', 'reviews/feedback' ),

	// Ordering (admin board).
	getOrders: ( archived ) => request( 'GET', 'orders' + ( archived ? '?archived=1' : '' ) ),
	createOrder: ( data ) => request( 'POST', 'orders', data ),
	updateOrder: ( id, data ) => request( 'PATCH', `orders/${ id }`, data ),
	deleteOrder: ( id ) => request( 'DELETE', `orders/${ id }` ),
	getOrderSettings: () => request( 'GET', 'orders/settings' ),
	saveOrderSettings: ( data ) => request( 'POST', 'orders/settings', data ),

	// Events + guest pre-orders.
	getEvents: () => request( 'GET', 'events' ),
	createEvent: ( data ) => request( 'POST', 'events', data ),
	getEvent: ( id ) => request( 'GET', `events/${ id }` ),
	updateEvent: ( id, data ) => request( 'PATCH', `events/${ id }`, data ),
	deleteEvent: ( id ) => request( 'DELETE', `events/${ id }` ),
	deleteGuest: ( eventId, guestId ) => request( 'DELETE', `events/${ eventId }/guests/${ guestId }` ),
	getPages: async () => {
		const res = await fetch( cfg.restRoot + 'wp/v2/pages?per_page=100&status=publish&_fields=id,link,title', {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce },
		} );
		return res.ok ? res.json() : [];
	},
};
