// Offline mirror of the order maths, for the POS pad only.
//
// The server is and stays the authority on money: every queued write is replayed
// through the same REST routes, and `Ordering\recompute()` prices it again from
// the database. This module exists purely so the pad can keep SHOWING a correct
// running total while the line is down — it must mirror recompute() faithfully
// (see includes/ordering/ordering.php), but nothing here is ever trusted.
//
// Anything folded in locally is marked `unsynced` so the UI can flag it and the
// replay can clear it.

const round2 = ( n ) => Math.round( ( Number( n ) || 0 ) * 100 ) / 100;
const fixed2 = ( n ) => round2( n ).toFixed( 2 );

// id → menu item, built from the /pos/menu payload the pad already holds.
export function indexMenu( sections ) {
	const map = new Map();
	( sections || [] ).forEach( ( sec ) => {
		( sec.items || [] ).forEach( ( item ) => map.set( Number( item.id ), item ) );
	} );
	return map;
}

// Price one pad line the way recompute() would. Returns null for an item we
// can't price offline (unknown or 86'd) — the caller refuses the line rather
// than guessing, because a wrong price on a bill is worse than a blocked tap.
export function mirrorLine( menuIndex, line ) {
	const item = menuIndex.get( Number( line.itemId ) );
	if ( ! item || item.available === false ) {
		return null;
	}
	const qty = Math.max( 1, Math.min( 20, Number( line.qty ) || 1 ) );
	const prices = item.prices || [];
	const row = prices[ Number( line.priceIndex ) || 0 ] || prices[ 0 ] || {};
	let unit = Number( row.amount ) || 0;

	const mods = item.modifiers || [];
	const chosen = [];
	const removed = [];

	Object.keys( line.choices || {} ).forEach( ( gi ) => {
		const group = mods[ Number( gi ) ];
		if ( ! group || 'choose' !== group.type ) {
			return;
		}
		( line.choices[ gi ] || [] ).forEach( ( oi ) => {
			const opt = ( group.options || [] )[ Number( oi ) ];
			if ( opt ) {
				unit += Number( opt.price ) || 0;
				chosen.push( { group: group.name, label: opt.label, price: Number( opt.price ) || 0 } );
			}
		} );
	} );
	Object.keys( line.removed || {} ).forEach( ( gi ) => {
		const group = mods[ Number( gi ) ];
		if ( ! group || 'remove' !== group.type ) {
			return;
		}
		( line.removed[ gi ] || [] ).forEach( ( oi ) => {
			const opt = ( group.options || [] )[ Number( oi ) ];
			if ( opt ) {
				removed.push( opt.label );
			}
		} );
	} );

	return {
		itemId: Number( item.id ),
		title: item.title,
		qty,
		priceLabel: row.label || '',
		unit: round2( unit ),
		lineTotal: round2( unit * qty ),
		chosen,
		removed,
		station: 'bar' === item.station ? 'bar' : 'kitchen',
		seat: Number( line.seat ) || 0,
		course: line.course || '',
		fired: !! line.fired,
		uid: line.uid || '',
		unsynced: true,
	};
}

// Recompute the derived money fields after a local change, exactly as
// order_response() does on the server.
export function recalc( order ) {
	const food = ( order.items || [] ).reduce( ( sum, li ) => sum + ( Number( li.lineTotal ) || 0 ), 0 );
	const service = Number( order.service ) || 0;
	const tip = Number( order.tip ) || 0;
	const discount = Number( order.discount ) || 0;
	const grand = round2( food + service + tip - discount );
	const paid = ( order.tenders || [] ).reduce( ( sum, t ) => sum + ( Number( t.amount ) || 0 ), 0 );
	return {
		...order,
		total: fixed2( food ),
		service: fixed2( service ),
		tip: fixed2( tip ),
		discount: fixed2( discount ),
		grandTotal: fixed2( grand ),
		paid: fixed2( paid ),
		balance: fixed2( grand - paid ),
	};
}

// A tab that exists only on this tablet so far. Shaped like order_response() so
// every pad component renders it without knowing the difference.
export function localOrder( { tempId, channel, tableId, tableName, items } ) {
	return recalc( {
		id: tempId,
		number: 0,
		items: items || [],
		status: 'dine_in' === channel ? 'open' : 'new',
		name: 'Walk-in',
		email: '',
		phone: '',
		notes: '',
		when: 'asap',
		payment: 'unpaid',
		source: 'staff',
		fulfilment: 'collection',
		address: '',
		fee: '0.00',
		channel,
		tableId: tableId || 0,
		table: tableName || '',
		covers: 0,
		tenders: [],
		service: '0.00',
		tip: '0.00',
		discount: '0.00',
		payUrl: '',
		memberId: 0,
		memberName: '',
		memberPoints: 0,
		redeem: 0,
		pi: '',
		archived: false,
		refundDue: false,
		printed: '',
		history: [],
		emailLog: [],
		placed: new Date().toISOString(),
		unsynced: true,
	} );
}

export const fold = {
	addLines: ( order, lines ) => recalc( { ...order, items: [ ...( order.items || [] ), ...lines ], unsynced: true } ),

	// Fire stamps the round the same way the server does, so the pad's timing
	// strip and per-round grouping keep working offline.
	fire: ( order ) => {
		const firedAt = new Date().toISOString();
		return recalc( {
			...order,
			status: 'dine_in' === order.channel ? 'sent' : order.status,
			items: ( order.items || [] ).map( ( li ) =>
				( li.fired ? li : { ...li, fired: true, firedAt, kstage: 'new' } )
			),
			unsynced: true,
		} );
	},

	voidLine: ( order, idx ) =>
		recalc( { ...order, items: ( order.items || [] ).filter( ( li, i ) => i !== idx ), unsynced: true } ),

	setCharges: ( order, patch ) => recalc( { ...order, ...patch, unsynced: true } ),

	// Cash only — card tenders never reach this path.
	tender: ( order, type, amount, ref ) => {
		const next = recalc( {
			...order,
			tenders: [ ...( order.tenders || [] ), { type, amount: round2( amount ), ref, at: new Date().toISOString() } ],
			unsynced: true,
		} );
		if ( Number( next.balance ) <= 0 ) {
			next.status = 'completed';
		}
		return next;
	},
};

// Does this order (or any of its lines) still have writes waiting to sync?
export function isUnsynced( order ) {
	if ( ! order ) {
		return false;
	}
	return !! order.unsynced || ( order.items || [] ).some( ( li ) => li.unsynced );
}
