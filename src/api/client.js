// Thin REST client for the dinekit/v1 API. Reads config injected by PHP
// (window.DINEKIT) — restUrl + nonce.
import { saveBus } from '../lib/saveBus';
import { offlineQueue } from '../lib/offlineQueue';

const cfg = window.DINEKIT || {};

// The ONLY writes that may be held in the offline queue. Deliberately an
// allowlist rather than a denylist: a new endpoint is un-queueable until someone
// decides it is safe to replay. Everything here either sets an absolute value or
// carries an idempotency ref the server dedups on (see the Phase A notes in
// includes/ordering/rest.php), so a replay can never double-apply.
//
// Card / Stripe / refund paths are absent BY DESIGN — real money movement needs
// a live authorisation and must fail loudly instead of being deferred.
const QUEUE_ACTIONS = [ 'fire', 'void_line', 'set_charges', 'transfer' ];

function queueEntry( method, path, body ) {
	const clean = path.replace( /^\//, '' );
	const data = body || {};

	// Open a tab / start a takeaway order.
	if ( 'POST' === method && 'orders' === clean ) {
		const queueable = [ 'dine_in', 'takeaway' ].includes( data.channel ) && !! data.clientRef;
		return queueable ? { method, path: clean, body: data, createsTemp: data.tempId } : null;
	}

	// Add a round to an existing (or offline-created) tab.
	const lines = clean.match( /^orders\/(-?\d+)\/lines$/ );
	if ( 'POST' === method && lines && data.ref ) {
		const id = Number( lines[ 1 ] );
		return { method, path: clean, body: data, tempId: offlineQueue.isTempId( id ) ? id : 0 };
	}

	const patch = clean.match( /^orders\/(-?\d+)$/ );
	if ( 'PATCH' === method && patch && data.ref ) {
		const cashTender = 'tender' === data.action && 'cash' === data.tenderType;
		if ( ! QUEUE_ACTIONS.includes( data.action ) && ! cashTender ) {
			return null;
		}
		const id = Number( patch[ 1 ] );
		return { method, path: clean, body: data, tempId: offlineQueue.isTempId( id ) ? id : 0 };
	}

	return null;
}

// True when a write was deferred to the offline queue rather than failing. Call
// sites use this to fold the change in locally instead of surfacing an error.
export const isQueued = ( e ) => !! ( e && e.queued );

async function request( method, path, body ) {
	// Any write drives the global save-status pill so nothing saves silently.
	const mutating = method !== 'GET' && method !== 'HEAD';
	if ( mutating ) {
		saveBus.begin();
	}
	let ok = false;
	try {
		let res;
		try {
			res = await fetch( cfg.restUrl + path.replace( /^\//, '' ), {
				method,
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': cfg.nonce,
				},
				body: body ? JSON.stringify( body ) : undefined,
			} );
		} catch ( netErr ) {
			// fetch() rejects ONLY on a network-level failure (connection dropped,
			// DNS, CORS) — an HTTP 500 still resolves with res.ok === false. That
			// distinction is exactly what makes queueing safe here: we defer a write
			// the server never saw an answer for, never one it actively rejected.
			const entry = queueEntry( method, path, body );
			if ( ! entry ) {
				throw netErr;
			}
			await offlineQueue.enqueue( entry );
			// It IS saved — on this device — so the save pill stays green and the
			// offline banner + unsynced marks carry the real state.
			ok = true;
			const queued = new Error( 'Saved on this device — waiting to sync.' );
			queued.queued = true;
			queued.entry = entry;
			throw queued;
		}

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
	deleteItem: ( id ) => request( 'DELETE', `items/${ id }` ), // archives, never deletes
	// Bin a dish that was opened and closed without anything typed into it. The
	// server re-checks that it really is blank and archives it instead if not.
	discardItem: ( id ) => request( 'DELETE', `items/${ id }?force=1` ),
	restoreItem: ( id ) => request( 'POST', `items/${ id }/restore` ),
	itemUsage: ( id ) => request( 'GET', `items/${ id }/usage` ),
	duplicateItem: ( id ) => request( 'POST', `items/${ id }/duplicate` ),
	duplicateSection: ( id ) => request( 'POST', `sections/${ id }/duplicate` ),
	createTerm: ( tax, name, extra = {} ) => request( 'POST', `terms/${ tax }`, { name, ...extra } ),
	updateTerm: ( tax, id, name, extra = {} ) => request( 'PATCH', `terms/${ tax }/${ id }`, { name, ...extra } ),
	deleteTerm: ( tax, id ) => request( 'DELETE', `terms/${ tax }/${ id }` ),
	saveOrder: ( payload ) => request( 'POST', 'order', payload ),
	exportMenu: () => request( 'GET', 'menu/export' ),
	importMenu: ( csv ) => request( 'POST', 'menu/import', { csv } ),
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
	getActivity: ( action ) => request( 'GET', 'activity' + ( action ? '?action=' + encodeURIComponent( action ) : '' ) ),
	getIntegrations: () => request( 'GET', 'integrations' ),
	saveIntegrations: ( data ) => request( 'POST', 'integrations', data ),
	// SMS (bring-your-own Twilio).
	getSms: () => request( 'GET', 'sms' ),
	saveSms: ( data ) => request( 'POST', 'sms', data ),
	testSms: ( to ) => request( 'POST', 'sms/test', { to } ),
	getSmsStatus: () => request( 'GET', 'sms/status' ),
	smsTableReady: ( bookingId ) => request( 'POST', `sms/table-ready/${ bookingId }` ),
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
	getAreaImpact: ( id ) => request( 'GET', `bookings/areas/${ id }/impact` ),
	// moveTo: target area id to re-home tables, 0 = Unzoned, -1 = void tables too.
	// reassign: { [bookingId]: targetTableId } for upcoming bookings on voided tables.
	deleteArea: ( id, moveTo = 0, reassign = {} ) => request( 'DELETE', `bookings/areas/${ id }`, { moveTo, reassign } ),
	restoreArea: ( id ) => request( 'POST', `bookings/areas/${ id }/restore` ),
	createTable: ( data ) => request( 'POST', 'bookings/tables', data ),
	updateTable: ( id, data ) => request( 'PATCH', `bookings/tables/${ id }`, data ),
	getTableImpact: ( id ) => request( 'GET', `bookings/tables/${ id }/impact` ),
	deleteTable: ( id, reassign = {} ) => request( 'DELETE', `bookings/tables/${ id }`, { reassign } ),
	restoreTable: ( id ) => request( 'POST', `bookings/tables/${ id }/restore` ),
	getFloorHistory: () => request( 'GET', 'bookings/history' ),
	createCombo: ( data ) => request( 'POST', 'bookings/combos', data ),
	updateCombo: ( id, data ) => request( 'PATCH', `bookings/combos/${ id }`, data ),
	deleteCombo: ( id ) => request( 'DELETE', `bookings/combos/${ id }` ),

	// Bookings — availability + diary.
	getAvailability: ( { date, time, party, exclude } ) =>
		request( 'GET', 'bookings/availability?' + new URLSearchParams(
			exclude ? { date, time, party, exclude } : { date, time, party }
		).toString() ),
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
	getGuestIntel: ( { email = '', phone = '', name = '' } = {} ) => {
		const q = new URLSearchParams();
		if ( email ) q.set( 'email', email );
		if ( phone ) q.set( 'phone', phone );
		if ( name ) q.set( 'name', name );
		return request( 'GET', 'guests/intel?' + q.toString() );
	},
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
	// POS (in-house order taking).
	getPosMenu: ( menu ) => request( 'GET', 'pos/menu' + ( menu ? '?menu=' + menu : '' ) ),
	// `ref` is the idempotency key for this batch — always sent, so a reply lost
	// mid-drop can't become a duplicate round when the queue replays.
	addOrderLines: ( id, items, ref ) => request( 'POST', `orders/${ id }/lines`, ref ? { items, ref } : { items } ),
	tableHistory: ( tableId ) => request( 'GET', `orders/table/${ tableId }/history` ),
	setItemStock: ( itemId, out ) => request( 'POST', 'pos/item-stock', { itemId, out } ),
	payStatus: ( token ) => request( 'GET', 'pay/' + encodeURIComponent( token ) ),
	// POS cash management.
	getCash: () => request( 'GET', 'cash' ),
	openCash: ( float ) => request( 'POST', 'cash/open', { float } ),
	cashMovement: ( data ) => request( 'POST', 'cash/movement', data ),
	closeCash: ( counted ) => request( 'POST', 'cash/close', { counted } ),
	// POS card reader (Stripe Terminal, server-driven).
	getTerminal: () => request( 'GET', 'terminal' ),
	terminalReaders: () => request( 'GET', 'terminal/readers' ),
	pairReader: ( readerId, readerName ) => request( 'POST', 'terminal/reader', { readerId, readerName } ),
	terminalCharge: ( orderId, amount ) => request( 'POST', 'terminal/charge', { orderId, amount } ),
	// POS loyalty.
	searchMembers: ( q ) => request( 'GET', 'members?q=' + encodeURIComponent( q ) ),
	createMember: ( data ) => request( 'POST', 'members', data ),
	getTableQr: () => request( 'GET', 'pos/table-qr' ),
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
	updateGuest: ( eventId, guestId, data ) => request( 'PATCH', `events/${ eventId }/guests/${ guestId }`, data ),
	getPages: async () => {
		const res = await fetch( cfg.restRoot + 'wp/v2/pages?per_page=100&status=publish&_fields=id,link,title', {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce },
		} );
		return res.ok ? res.json() : [];
	},

	// Live-sync heartbeat — one tiny call the poller uses to know which screens
	// changed. Cache-busted so no layer pins a stale counter.
	getSync: () => request( 'GET', `sync?_cb=${ Date.now() }` ),

	// Notification center feed (local, actionable items).
	getNotifications: () => request( 'GET', 'notifications' ),

	// wordpress.org review prompt.
	getReviewAsk: () => request( 'GET', 'review-ask' ),
	actReviewAsk: ( action ) => request( 'POST', 'review-ask', { action } ),

	// Direct support (proxied server-side to the Web Level Up hub). Support reads
	// are live ticket data, so every GET carries a unique cache-buster — no browser
	// or site cache should ever pin a stale copy from before the latest reply.
	getSupportMeta: () => request( 'GET', `support/meta?_cb=${ Date.now() }` ),
	getSupportTickets: () => request( 'GET', `support/tickets?_cb=${ Date.now() }` ),
	createSupportTicket: ( data ) => request( 'POST', 'support/tickets', data ),
	getSupportTicket: ( id ) => request( 'GET', `support/tickets/${ id }?_cb=${ Date.now() }` ),
	replySupportTicket: ( id, message, attachments ) => request( 'POST', `support/tickets/${ id }/reply`, { message, attachments } ),
	closeSupportTicket: ( id ) => request( 'POST', `support/tickets/${ id }/close` ),
	// Upload a support screenshot to THIS site's own media library; we send the
	// hub only the resulting URL, so storage stays on the restaurant's side.
	uploadSupportImage: async ( file ) => {
		const fd = new FormData();
		fd.append( 'file', file, file.name || 'screenshot.png' );
		const res = await fetch( cfg.restRoot + 'wp/v2/media', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce },
			body: fd,
		} );
		if ( ! res.ok ) {
			throw new Error( 'Upload failed' );
		}
		return res.json();
	},
};
