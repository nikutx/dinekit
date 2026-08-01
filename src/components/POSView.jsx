import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Typography, Button, IconButton, Chip, CircularProgress, Modal, TextField, ToggleButton, ToggleButtonGroup } from '../ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import TakeoutDiningIcon from '@mui/icons-material/TakeoutDining';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import HistoryIcon from '@mui/icons-material/History';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { tokens } from '../theme';
import { api, isQueued } from '../api/client';
import FloorCanvas from './FloorCanvas';
import ConfirmDialog from './ui/ConfirmDialog';
import { useSyncRevision, useOnline } from '../lib/useSync';
import { offlineQueue } from '../lib/offlineQueue';
import { indexMenu, mirrorLine, localOrder, fold, isUnsynced } from '../lib/posOffline';
import { printDoc, esc } from '../lib/print';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

// A dine-in tab stays open (and payable) in Take Order for ANY status except the
// terminal ones — so a status change made on the Orders board or another tablet
// (e.g. the kitchen marking it 'ready') never strands the tab or blocks payment.
// Take Order and Orders are two live windows onto the same order.
const TAB_CLOSED = [ 'completed', 'cancelled' ];
const isOpenTab = ( o ) => o && 'dine_in' === o.channel && ! TAB_CLOSED.includes( o.status ) && ! o.archived;

const minsSince = ( iso ) => {
	if ( ! iso ) {
		return null;
	}
	const t = new Date( String( iso ).replace( ' ', 'T' ) ).getTime();
	return Number.isNaN( t ) ? null : Math.max( 0, Math.floor( ( Date.now() - t ) / 60000 ) );
};

// Minutes → compact "45m" / "1h 05m".
const durMins = ( m ) => {
	if ( m == null ) {
		return '';
	}
	if ( m < 60 ) {
		return `${ m }m`;
	}
	const h = Math.floor( m / 60 );
	const mm = m % 60;
	return mm ? `${ h }h ${ String( mm ).padStart( 2, '0' ) }m` : `${ h }h`;
};

// "26 Jul, 18:04" for the table's order history.
const fmtDateTime = ( iso ) => {
	if ( ! iso ) {
		return '';
	}
	const d = new Date( String( iso ).replace( ' ', 'T' ) );
	return Number.isNaN( d.getTime() ) ? '' : d.toLocaleString( [], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } );
};

// Occupied-table colour escalates with how long the tab's been open vs the turn
// time: green (fresh) → amber (≥60%) → red (over — needs turning).
const tableTone = ( mins, turnMin ) => {
	const turn = Math.max( 30, Number( turnMin ) || 120 );
	if ( mins >= turn ) {
		return { fg: tokens.red, bg: tokens.redSoft, br: tokens.red };
	}
	if ( mins >= turn * 0.6 ) {
		return { fg: tokens.amber, bg: tokens.amberSoft, br: tokens.amber };
	}
	return { fg: tokens.green, bg: tokens.greenSoft, br: tokens.green };
};

// Local HH:MM for the tab's timing strip.
const hhmm = ( iso ) => {
	if ( ! iso ) {
		return '';
	}
	const d = new Date( String( iso ).replace( ' ', 'T' ) );
	return Number.isNaN( d.getTime() ) ? '' : d.toLocaleTimeString( [], { hour: '2-digit', minute: '2-digit' } );
};

// Pull the tab's timeline out of its lines: when it opened, when each round was
// fired, when it was served, and how long from first fire to served.
const tabTiming = ( order ) => {
	if ( ! order ) {
		return null;
	}
	const items = order.items || [];
	const seen = new Set();
	const rounds = [];
	items.forEach( ( li ) => {
		if ( ! li.fired ) {
			return;
		}
		const k = String( li.firedId || li.firedAt || '' );
		if ( ! seen.has( k ) ) {
			seen.add( k );
			rounds.push( li.firedAt );
		}
	} );
	rounds.sort();
	const dones = items.filter( ( li ) => li.doneAt ).map( ( li ) => li.doneAt ).sort();
	const servedAt = dones.length ? dones[ dones.length - 1 ] : '';
	let serveMins = null;
	if ( rounds.length && servedAt ) {
		const a = new Date( String( rounds[ 0 ] ).replace( ' ', 'T' ) ).getTime();
		const b = new Date( String( servedAt ).replace( ' ', 'T' ) ).getTime();
		if ( ! Number.isNaN( a ) && ! Number.isNaN( b ) && b >= a ) {
			serveMins = Math.round( ( b - a ) / 60000 );
		}
	}
	return { opened: order.placed, rounds, servedAt, serveMins };
};

// Live service floor — the ACTUAL Floor-Plan layout (via the shared FloorCanvas)
// re-used as the table picker, so staff see at a glance who's seated, how long
// they've been sat (vs the turn time) and which tables are free to seat next.
// Switch areas with the same zone chips as the Floor Plan editor.
// Where a tab is in its lifecycle — drives the small stage word on each
// occupied floor tile (Seated → Ordered → Cooking → Served).
function tabStage( tab ) {
	const items = tab.items || [];
	if ( ! items.length ) {
		return 'Seated';
	}
	if ( items.some( ( li ) => li.fired && ( li.kstage === 'new' || li.kstage === 'preparing' ) ) ) {
		return 'Cooking';
	}
	if ( items.some( ( li ) => ! li.fired ) ) {
		return 'Ordered';
	}
	return 'Served';
}

// Minutes since the floor last touched this table: a check, the latest round
// fired, or when the tab opened — whichever is most recent.
function minsSinceTouched( tab ) {
	let last = tab.placed || '';
	( tab.items || [] ).forEach( ( li ) => {
		if ( li.firedAt && li.firedAt > last ) {
			last = li.firedAt;
		}
	} );
	if ( tab.checkedAt && tab.checkedAt > last ) {
		last = tab.checkedAt;
	}
	return last ? ( minsSince( last ) || 0 ) : 0;
}

// Minutes from now until an HH:MM later today (negative = already past).
const minsUntil = ( hm ) => {
	const d = new Date();
	const p = String( hm || '' ).split( ':' ).map( Number );
	return ( ( p[ 0 ] || 0 ) * 60 + ( p[ 1 ] || 0 ) ) - ( d.getHours() * 60 + d.getMinutes() );
};

// The table's notes, front and centre on the order pad: what the guest told
// us when booking (allergies, occasion) plus the standing service note from
// their guest profile ("tops the wine up all the time"). Open by default —
// the ✕ folds it to a slim pill for the rest of this table's session.
function PadNotes( { booking, intel } ) {
	const [ open, setOpen ] = useState( true );
	const notes = [
		booking && booking.notes ? { label: 'Booking note', text: booking.notes } : null,
		intel && intel.notes ? { label: 'Guest note', text: intel.notes } : null,
	].filter( Boolean );
	if ( ! notes.length ) {
		return null;
	}
	if ( ! open ) {
		return (
			<Chip
				label={ `📝 Notes · ${ notes.length }` }
				onClick={ () => setOpen( true ) }
				size="small"
				sx={ { mt: 0.75, height: 22, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', bgcolor: tokens.amberSoft, color: tokens.amber, border: `1px solid ${ tokens.amber }` } }
			/>
		);
	}
	return (
		<Box sx={ { mt: 0.75, px: 1.5, py: 1, borderRadius: '10px', bgcolor: tokens.amberSoft, border: `1px solid ${ tokens.amber }`, maxWidth: 680 } }>
			<Stack direction="row" alignItems="flex-start" spacing={ 1 }>
				<Box sx={ { flex: 1, minWidth: 0 } }>
					{ notes.map( ( n ) => (
						<Typography key={ n.label } sx={ { fontSize: 12.5, color: tokens.ink2, lineHeight: 1.5 } }>
							<Box component="span" sx={ { fontWeight: 700, color: tokens.amber } }>{ n.label }: </Box>
							{ n.text }
						</Typography>
					) ) }
				</Box>
				<Box
					component="button"
					type="button"
					onClick={ () => setOpen( false ) }
					title="Fold the notes away for this table"
					sx={ { border: 'none', background: 'none', cursor: 'pointer', color: tokens.amber, fontSize: 14, fontWeight: 700, p: 0, lineHeight: 1 } }
				>
					✕
				</Box>
			</Stack>
		</Box>
	);
}

function FloorPicker( { floor, zones, zone, setZone, tabFor, seatedBooking, nextBooking, openTable, markReady, turnMin, checkMins, money } ) {
	const zoneTables = ( floor.tables || [] ).filter( ( t ) => ( t.areaId || 0 ) === ( zone || 0 ) );
	const seated = zoneTables.filter( ( t ) => tabFor( t.id ) ).length;
	const dirty = zoneTables.filter( ( t ) => t.cleaning && ! tabFor( t.id ) ).length;

	// Per-table visual state for FloorCanvas.
	const renderTile = ( t ) => {
		const tab = tabFor( t.id );
		const off = 'maintenance' === t.status;
		const needsBussing = ! tab && ! off && t.cleaning;
		if ( off ) {
			return { bg: tokens.soft, border: tokens.border2, fg: tokens.muted2, sub: 'Maint.', dashed: true, disabled: true, dim: true, title: `${ t.name } · out of service` };
		}
		if ( tab ) {
			const mins = minsSince( tab.placed ) || 0;
			const tone = tableTone( mins, turnMin );
			const stage = tabStage( tab );
			const overdue = checkMins > 0 && minsSinceTouched( tab ) >= checkMins;
			if ( overdue ) {
				return { bg: tokens.redSoft, border: tokens.red, fg: tokens.red, sub: `CHECK · ${ mins }m`, raised: true, pulse: true, title: `${ t.name } · nobody has checked this table in ${ minsSinceTouched( tab ) } min — tap to open, then "Checked ✓"` };
			}
			return { bg: tone.bg, border: tone.br, fg: tone.fg, sub: `${ stage } · ${ mins }m`, raised: true, title: `${ t.name } · ${ stage.toLowerCase() } · open ${ money( tab.total ) }` };
		}
		if ( needsBussing ) {
			return { bg: tokens.skySoft, border: tokens.sky, fg: tokens.sky, sub: 'Clear ✓', dashed: true, title: `${ t.name } · needs bussing — tap when ready` };
		}
		// The diary speaks here too: a party seated from Bookings lights the
		// table even before an order is started, and a reservation due within
		// one turn warns the floor off seating a walk-in on it.
		const sb = seatedBooking( t.id );
		if ( sb ) {
			return { bg: tokens.greenSoft, border: tokens.green, fg: tokens.green, sub: 'Seated · no order', raised: true, title: `${ t.name } · ${ sb.name || 'Guest' } (party of ${ sb.party }) seated from the diary — tap to take their order` };
		}
		const nb = nextBooking( t.id );
		if ( nb ) {
			const mins = minsUntil( nb.time );
			if ( mins <= turnMin ) {
				const late = mins < 0;
				return { bg: tokens.amberSoft, border: tokens.amber, fg: tokens.amber, dashed: true, sub: late ? `Due · ${ nb.time }` : `${ nb.time } · ${ nb.party }p`, title: `${ t.name } · reserved — ${ nb.name || 'Guest' }, party of ${ nb.party } at ${ nb.time }${ late ? ` (running ${ -mins }m late)` : ` (in ${ mins }m). Not enough time for a full sitting.` }` };
			}
			return { bg: tokens.surface, border: tokens.border2, fg: tokens.ink, sub: `${ t.seats } · til ${ nb.time }`, title: `${ t.name } · ${ t.seats } seats · free until ${ nb.time } (${ nb.name || 'Guest' } · party of ${ nb.party })` };
		}
		return { bg: tokens.surface, border: tokens.border2, fg: tokens.ink, sub: `${ t.seats }`, title: `${ t.name } · ${ t.seats } seats · free` };
	};
	const onTile = ( t ) => {
		if ( 'maintenance' === t.status ) {
			return;
		}
		if ( ! tabFor( t.id ) && t.cleaning ) {
			markReady( t );
		} else {
			openTable( t );
		}
	};

	return (
		<Box>
			{ zones.length > 1 && (
				<Stack direction="row" alignItems="center" gap={ 1 } flexWrap="wrap" sx={ { mb: 1.5 } }>
					{ zones.map( ( z ) => {
						const active = z.id === ( zone || 0 );
						return (
							<Chip
								key={ z.id }
								label={ z.name }
								onClick={ () => setZone( z.id ) }
								variant={ active ? 'filled' : 'outlined' }
								sx={ {
									fontWeight: 600, borderRadius: 999, px: 0.5,
									...( active
										? { background: `linear-gradient(180deg, #5a52ea 0%, ${ tokens.accent } 100%)`, color: '#fff', boxShadow: '0 1px 2.5px rgba(79,70,229,.35)' }
										: { bgcolor: tokens.surface, color: tokens.ink2, borderColor: tokens.border2 } ),
								} }
							/>
						);
					} ) }
				</Stack>
			) }
			<Stack direction="row" spacing={ 2 } alignItems="center" sx={ { mb: 1, flexWrap: 'wrap' } }>
				<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>{ seated } of { zoneTables.length } seated{ dirty ? ` · ${ dirty } to clear` : '' }</Typography>
				<Stack direction="row" spacing={ 1.5 } alignItems="center" sx={ { flexWrap: 'wrap' } }>
					{ [ [ 'Free', tokens.muted2 ], [ 'Seated', tokens.green ], [ 'Turning soon', tokens.amber ], [ 'Reserved soon', tokens.amber, true ], [ 'Over turn', tokens.red ], [ 'Needs bussing', tokens.sky ], ...( checkMins > 0 ? [ [ 'Needs a check', tokens.red ] ] : [] ) ].map( ( [ lab, c, ring ] ) => (
						<Stack key={ lab } direction="row" spacing={ 0.5 } alignItems="center">
							<Box sx={ ring
								? { width: 10, height: 10, borderRadius: '50%', border: `2px dashed ${ c }`, background: 'transparent' }
								: { width: 10, height: 10, borderRadius: '50%', background: c } } />
							<Typography sx={ { fontSize: 11, color: tokens.muted } }>{ lab }</Typography>
						</Stack>
					) ) }
				</Stack>
			</Stack>
			{ zoneTables.length === 0 ? (
				<Card sx={ { p: 3 } }><Typography sx={ { color: tokens.muted } }>No tables in this area.</Typography></Card>
			) : (
				<FloorCanvas tables={ zoneTables } render={ renderTile } onTile={ onTile } />
			) }
		</Box>
	);
}

export default function POSView() {
	const [ loading, setLoading ] = useState( true );
	const [ floor, setFloor ] = useState( { tables: [], areas: [], combos: [] } );
	const [ sections, setSections ] = useState( [] );
	const [ orders, setOrders ] = useState( [] ); // open dine-in tabs
	const [ cur, setCur ] = useState( { symbol: '£', position: 'before' } );
	const [ active, setActive ] = useState( null ); // { tableId, tableName, order|null, takeaway? }
	const [ padGuest, setPadGuest ] = useState( null ); // { booking, intel } — who's seated at the open table
	const [ course, setCourse ] = useState( '' );
	const [ mod, setMod ] = useState( null ); // item being configured
	const [ bill, setBill ] = useState( false ); // bill/pay sheet open
	const [ cashUp, setCashUp ] = useState( false ); // cash-up sheet open
	const [ tableQr, setTableQr ] = useState( false ); // table-QR generator
	const [ moveOpen, setMoveOpen ] = useState( false ); // transfer-table picker
	const [ histOpen, setHistOpen ] = useState( false ); // this table's previous-orders panel
	const [ busy, setBusy ] = useState( false );
	const [ justFired, setJustFired ] = useState( false ); // brief "sent to kitchen ✓" flash
	const [ servicePct, setServicePct ] = useState( 12.5 ); // venue default service charge %, editable at settle
	const [ posView, setPosView ] = useState( 'floor' ); // table picker: 'floor' (live plan) | 'list'
	const [ zone, setZone ] = useState( 0 ); // selected area for the floor view
	const [ turnMin, setTurnMin ] = useState( 120 ); // cover duration → occupied-table colour thresholds
	const [ checkMins, setCheckMins ] = useState( 0 ); // flash tables untouched for N mins (0 = off)
	const [ , setPosTick ] = useState( 0 ); // 30s heartbeat so table timers tick
	const [ offlineNote, setOfflineNote ] = useState( '' ); // transient "held on this device" explainer
	const online = useOnline();
	// Prices for the offline mirror come from the menu the pad already loaded —
	// never invented, so a bill built during an outage matches the real one.
	const menuIndex = useMemo( () => indexMenu( sections ), [ sections ] );
	// Mirror of `orders` so the temp-id resolve below can read the current list
	// without making that effect depend on the list it sets.
	const ordersRef = useRef( [] );
	const caps = ( typeof window !== 'undefined' && window.DINEKIT && window.DINEKIT.caps ) || {};
	// Keep the live floor's on-table timers moving.
	useEffect( () => {
		const t = window.setInterval( () => setPosTick( ( n ) => n + 1 ), 30000 );
		return () => window.clearInterval( t );
	}, [] );

	useEffect( () => {
		Promise.all( [
			api.getFloor().catch( () => ( { tables: [], areas: [], combos: [] } ) ),
			api.getPosMenu().catch( () => ( { sections: [] } ) ),
			api.getOrders().catch( () => [] ),
			api.getState().catch( () => ( {} ) ),
		] ).then( ( [ f, m, o, s ] ) => {
			setFloor( f || { tables: [], areas: [] } );
			setSections( ( m && m.sections ) || [] );
			setOrders( ( o || [] ).filter( isOpenTab ) );
			if ( s.currency ) {
				setCur( { symbol: s.currency || '£', position: s.currencyPosition || 'before' } );
			}
			if ( s.servicePct != null ) {
				setServicePct( Number( s.servicePct ) || 0 );
			}
			// Default the floor's zone to the first area with tables.
			const firstZone = ( ( f && f.areas ) || [] ).find( ( a ) => ( ( f.tables || [] ).some( ( t ) => ( t.areaId || 0 ) === a.id ) ) );
			if ( firstZone ) {
				setZone( firstZone.id );
			}
		} ).finally( () => setLoading( false ) );
		api.getBookingSettings().then( ( bs ) => {
			if ( bs && bs.turn_time ) { setTurnMin( bs.turn_time ); }
			if ( bs && bs.check_mins != null ) { setCheckMins( Number( bs.check_mins ) || 0 ); }
		} ).catch( () => {} );
	}, [] );

	// Live-sync: when orders change on another tablet or the Orders board, refresh
	// the tab list AND the open pad so Take Order and Orders stay one dynamic view
	// of the same orders. (Baseline established on mount; this only fires on change.)
	const ordersRev = useSyncRevision( 'orders' );
	useEffect( () => {
		if ( loading ) {
			return;
		}
		api.getOrders().then( async ( all ) => {
			const list = ( all || [] ).filter( isOpenTab );
			// Tabs opened while offline are still under their temp id. Once the
			// queue has replayed, the id map tells us which real order each became
			// — until then we keep showing the local one so the table isn't blank.
			const resolved = {};
			const locals = ordersRef.current.filter( ( o ) => offlineQueue.isTempId( o.id ) );
			for ( const o of locals ) {
				// eslint-disable-next-line no-await-in-loop
				const real = await offlineQueue.resolveId( o.id );
				if ( real ) {
					resolved[ o.id ] = real;
				}
			}
			setOrders( [ ...list, ...locals.filter( ( o ) => ! resolved[ o.id ] ) ] );
			setActive( ( a ) => {
				if ( ! a || ! a.order ) {
					return a;
				}
				const id = resolved[ a.order.id ] || a.order.id;
				const fresh = ( all || [] ).find( ( o ) => o.id === id );
				return fresh ? { ...a, order: fresh } : a;
			} );
		} ).catch( () => {} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ ordersRev ] );

	useEffect( () => {
		ordersRef.current = orders;
	}, [ orders ] );

	// Today's diary, for the floor: seated parties light their table even with
	// no order yet, and upcoming reservations warn the floor before a walk-in
	// is seated on a table that's about to be needed. Live via the bookings
	// sync channel (the auto walk-in the till creates bumps it too).
	const [ dayBookings, setDayBookings ] = useState( [] );
	const bookingsRev = useSyncRevision( 'bookings' );
	useEffect( () => {
		const d = new Date();
		const p2 = ( n ) => ( n < 10 ? '0' : '' ) + n;
		const iso = d.getFullYear() + '-' + p2( d.getMonth() + 1 ) + '-' + p2( d.getDate() );
		api.listBookings( { from: iso, to: iso } )
			.then( ( rows ) => setDayBookings( ( rows || [] ).filter( ( b ) => ! [ 'cancelled', 'no_show', 'completed' ].includes( b.status ) ) ) )
			.catch( () => {} );
	}, [ bookingsRev ] );
	const comboTables = useMemo( () => {
		const m = {};
		( floor.combos || [] ).forEach( ( c ) => { m[ c.id ] = c.tables || []; } );
		return m;
	}, [ floor.combos ] );
	const bookingsOn = ( tid ) => dayBookings.filter( ( b ) => b.tableId === tid || ( b.comboId && ( comboTables[ b.comboId ] || [] ).includes( tid ) ) );
	const seatedBooking = ( tid ) => bookingsOn( tid ).find( ( b ) => 'seated' === b.status );
	const nextBooking = ( tid ) => {
		// Include bookings up to 30 min past their slot: a late party still
		// holds its table (the tile reads "Due · HH:MM") until it's released.
		const d = new Date( Date.now() - 30 * 60000 );
		const hm = ( '0' + d.getHours() ).slice( -2 ) + ':' + ( '0' + d.getMinutes() ).slice( -2 );
		return bookingsOn( tid )
			.filter( ( b ) => 'seated' !== b.status && ( b.time || '' ) >= hm )
			.sort( ( a, b ) => ( a.time || '' ).localeCompare( b.time || '' ) )[ 0 ] || null;
	};

	// The explainer is only true while we're down; drop it the moment we're back.
	useEffect( () => {
		if ( online ) {
			setOfflineNote( '' );
		}
	}, [ online ] );

	const money = ( n ) => {
		const v = Number( n || 0 ).toFixed( 2 );
		return 'after' === cur.position ? `${ v }${ cur.symbol }` : `${ cur.symbol }${ v }`;
	};
	const tabFor = ( tableId ) => orders.find( ( o ) => o.tableId === tableId );

	// Who's at this table? The diary knows: today's live booking on the open
	// pad's table gives the till the guest's name, VIP flag and allergens —
	// the same record the booking panel edits, so the two screens agree.
	useEffect( () => {
		setPadGuest( null );
		if ( ! active || ! active.tableId || active.takeaway ) {
			return;
		}
		let stale = false;
		const d = new Date();
		const p2 = ( n ) => ( n < 10 ? '0' : '' ) + n;
		const iso = d.getFullYear() + '-' + p2( d.getMonth() + 1 ) + '-' + p2( d.getDate() );
		api.listBookings( { from: iso, to: iso } ).then( ( rows ) => {
			if ( stale ) {
				return;
			}
			const live = ( rows || [] ).filter( ( b ) => ( b.tableId === active.tableId || ( b.comboId && ( comboTables[ b.comboId ] || [] ).includes( active.tableId ) ) ) && ! [ 'cancelled', 'no_show', 'completed' ].includes( b.status ) );
			// Prefer the seated party — and when the day holds more than one
			// (a lunch sitting nobody completed + tonight's), the LATEST seated
			// booking is who's actually at the table now.
			const seatedLive = live.filter( ( b ) => 'seated' === b.status ).sort( ( a, b ) => ( b.time || '' ).localeCompare( a.time || '' ) );
			const booking = seatedLive[ 0 ] || live[ 0 ];
			if ( ! booking ) {
				return;
			}
			setPadGuest( { booking, intel: null } );
			api.getGuestIntel( { email: booking.email || '', phone: booking.phone || '', name: booking.name || '' } )
				.then( ( intel ) => { if ( ! stale ) { setPadGuest( { booking, intel } ); } } )
				.catch( () => {} );
		} ).catch( () => {} );
		return () => { stale = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ active && active.tableId, active && active.takeaway ] );

	const toggleVipAtTill = async () => {
		if ( ! padGuest || ! padGuest.intel ) {
			return;
		}
		const next = { ...padGuest.intel, vip: ! padGuest.intel.vip };
		setPadGuest( { ...padGuest, intel: next } );
		try {
			await api.saveGuestProfile( {
				email: padGuest.booking.email || '',
				name: padGuest.booking.name || '',
				vip: next.vip,
				tags: next.tags || [],
				notes: next.notes || '',
				allergens: next.allergens || '',
			} );
		} catch ( e ) {
			setPadGuest( padGuest );
		}
	};

	const openTable = ( t ) => { setActive( { tableId: t.id, tableName: t.name, order: tabFor( t.id ) || null } ); setCourse( '' ); };
	// Clear a table's "needs bussing" flag once it's cleaned down and ready to seat.
	const markReady = ( t ) => {
		setFloor( ( f ) => ( { ...f, tables: ( f.tables || [] ).map( ( x ) => ( x.id === t.id ? { ...x, cleaning: '' } : x ) ) } ) );
		api.updateTable( t.id, { cleaning: 0 } ).catch( () => {} );
	};
	const openTakeaway = () => { setActive( { tableId: 0, tableName: 'Takeaway', order: null, takeaway: true } ); setCourse( '' ); };
	const back = () => setActive( null );

	// Reflect an updated/created order into both the active pad and the tab list.
	const syncOrder = ( order ) => {
		setActive( ( a ) => ( a ? { ...a, order } : a ) );
		setOrders( ( os ) => {
			const without = os.filter( ( o ) => o.id !== order.id );
			return isOpenTab( order ) ? [ ...without, order ] : without;
		} );
	};

	const addLine = async ( line ) => {
		if ( ! active ) {
			return;
		}
		// uid = stable line identity: voids target it instead of an index, so a
		// second tablet's edits (or an offline replay) can never shift the target.
		const payload = { ...line, course, uid: offlineQueue.newRef() };
		// If we're down and can't price this item from the menu already on the
		// device, refuse it up front. Queueing a line the pad can't show would
		// mean it silently materialised on the bill after reconnect.
		const mirrored = ! online ? mirrorLine( menuIndex, payload ) : null;
		if ( ! online && ! mirrored ) {
			setOfflineNote( 'That item can’t be added while offline — its price isn’t on this device.' );
			return;
		}
		setBusy( true );
		const ref = offlineQueue.newRef();
		try {
			if ( active.order ) {
				syncOrder( await api.addOrderLines( active.order.id, [ payload ], ref ) );
			} else {
				// A tab opened offline needs an id NOW so the next tap has something
				// to append to. It's negative, so it can never be mistaken for a real
				// order; the queue maps it to the real id once the create replays.
				const tempId = offlineQueue.newTempId();
				syncOrder( await api.createOrder( {
					channel: active.takeaway ? 'takeaway' : 'dine_in',
					tableId: active.tableId,
					items: [ payload ],
					clientRef: ref,
					tempId,
				} ) );
			}
		} catch ( e ) {
			if ( ! isQueued( e ) ) {
				throw e;
			}
			// Held on this device — show it priced from the menu we already have.
			// The server re-prices it for real when the queue drains.
			//
			// Recomputed here rather than reusing the pre-check: the heartbeat
			// lags the actual drop, so `online` can still be true on the write
			// that first discovers we're down.
			const priced = mirrored || mirrorLine( menuIndex, payload );
			if ( ! priced ) {
				setOfflineNote( 'That item can’t be added while offline — its price isn’t on this device.' );
			} else if ( active.order ) {
				syncOrder( fold.addLines( active.order, [ priced ] ) );
			} else {
				syncOrder( localOrder( {
					tempId: e.entry.createsTemp,
					channel: active.takeaway ? 'takeaway' : 'dine_in',
					tableId: active.tableId,
					tableName: active.tableName,
					items: [ priced ],
				} ) );
			}
		} finally {
			setBusy( false );
		}
	};

	const chooseItem = ( item ) => {
		if ( item.available === false ) {
			return;
		}
		const hasVariants = ( item.prices || [] ).length > 1;
		const hasMods = ( item.modifiers || [] ).length > 0;
		if ( hasVariants || hasMods ) {
			setMod( item );
		} else {
			addLine( { itemId: item.id, qty: 1, priceIndex: 0 } );
		}
	};

	// 86 / restock a menu item (optimistic; reverts on failure).
	const eightySix = async ( item ) => {
		const out = item.available !== false;
		const flip = ( av ) => setSections( ( secs ) => secs.map( ( s ) => ( { ...s, items: s.items.map( ( it ) => ( it.id === item.id ? { ...it, available: av } : it ) ) } ) ) );
		flip( ! out );
		try { await api.setItemStock( item.id, out ); } catch ( e ) { flip( out ); }
	};

	// Transfer the open tab to another table.
	const transfer = async ( t ) => {
		if ( ! active || ! active.order ) {
			setMoveOpen( false );
			return;
		}
		setBusy( true );
		try {
			const updated = await api.updateOrder( active.order.id, { action: 'transfer', tableId: t.id, ref: offlineQueue.newRef() } );
			setActive( ( a ) => ( { ...a, tableId: t.id, tableName: t.name, order: updated } ) );
			setOrders( ( os ) => os.map( ( o ) => ( o.id === updated.id ? updated : o ) ) );
			setMoveOpen( false );
		} catch ( e ) {
			if ( ! isQueued( e ) ) {
				throw e;
			}
			const moved = { ...active.order, tableId: t.id, table: t.name, unsynced: true };
			setActive( ( a ) => ( { ...a, tableId: t.id, tableName: t.name, order: moved } ) );
			setOrders( ( os ) => os.map( ( o ) => ( o.id === moved.id ? moved : o ) ) );
			setMoveOpen( false );
		} finally { setBusy( false ); }
	};

	// Fire confirm popup: what's about to hit the kitchen/bar + an optional
	// ticket note that prints and shows on the kitchen screen for this round.
	const [ fireOpen, setFireOpen ] = useState( false );
	const [ fireNote, setFireNote ] = useState( '' );
	const fire = async ( note = '' ) => {
		if ( ! active || ! active.order ) {
			return;
		}
		setBusy( true );
		setFireOpen( false );
		try {
			syncOrder( await api.updateOrder( active.order.id, { action: 'fire', fireNote: note, ref: offlineQueue.newRef() } ) );
			setJustFired( true );
			window.setTimeout( () => setJustFired( false ), 2500 );
		} catch ( e ) {
			if ( ! isQueued( e ) ) {
				throw e;
			}
			// The round is stamped locally so the pad's timing strip keeps working;
			// the kitchen screen only sees it once we're back on the network.
			syncOrder( fold.fire( active.order, note ) );
			setJustFired( true );
			window.setTimeout( () => setJustFired( false ), 2500 );
			setOfflineNote( 'Fired on this device — the kitchen screen will get it when the connection is back. Tell the pass.' );
		} finally {
			setBusy( false );
		}
	};
	const voidLine = async ( idx ) => {
		if ( ! active || ! active.order ) {
			return;
		}
		setBusy( true );
		try {
			const lineUid = ( ( active.order.items || [] )[ idx ] || {} ).uid || '';
			syncOrder( await api.updateOrder( active.order.id, { action: 'void_line', line: idx, lineUid, ref: offlineQueue.newRef() } ) );
		} catch ( e ) {
			if ( ! isQueued( e ) ) {
				throw e;
			}
			syncOrder( fold.voidLine( active.order, idx ) );
		} finally {
			setBusy( false );
		}
	};

	if ( loading ) {
		return (
			<Page>
				<PageHeader title="Take Order" subtitle="Take a table's order and fire it to the kitchen." />
				<Stack alignItems="center" sx={ { py: 8 } }><CircularProgress /></Stack>
			</Page>
		);
	}

	// ---- Table picker (always the base view; the order pad pops over it) ----
	const zones = ( floor.areas || [] ).map( ( a ) => ( { id: a.id, name: a.name } ) );
	if ( ( floor.tables || [] ).some( ( t ) => ! ( t.areaId || 0 ) ) ) {
		zones.push( { id: 0, name: 'Tables' } );
	}
	const lines = ( active && active.order && active.order.items ) || [];
	const total = active && active.order ? active.order.total : 0;
	const unfired = lines.filter( ( l ) => ! l.fired ).length;

	return (
		<>
			<Page>
				<PageHeader
					title="Take Order"
					subtitle="Pick a table to start or continue a tab, or take a counter order."
					actions={
						<>
							<Button variant="outlined" startIcon={ <QrCode2Icon /> } onClick={ () => setTableQr( true ) }>Table QRs</Button>
							<Button variant="outlined" startIcon={ <PointOfSaleIcon /> } onClick={ () => setCashUp( true ) }>Cash-up</Button>
							<Button variant="contained" startIcon={ <TakeoutDiningIcon /> } onClick={ openTakeaway }>Quick takeaway</Button>
						</>
					}
				/>
				{ cashUp && <CashSheet money={ money } onClose={ () => setCashUp( false ) } /> }
				{ tableQr && <TableQrSheet onClose={ () => setTableQr( false ) } /> }
				{ ( floor.tables || [] ).length > 0 && (
					<ToggleButtonGroup size="small" exclusive value={ posView } onChange={ ( e, v ) => v && setPosView( v ) } sx={ { mb: 2 } }>
						<ToggleButton value="floor"><GridViewIcon sx={ { fontSize: 16, mr: 0.5 } } />Floor</ToggleButton>
						<ToggleButton value="list"><ViewListIcon sx={ { fontSize: 16, mr: 0.5 } } />List</ToggleButton>
					</ToggleButtonGroup>
				) }
				{ ( floor.tables || [] ).length === 0 ? (
					<Card sx={ { p: 3 } }>
						<Typography sx={ { color: tokens.muted } }>No tables yet — add tables in Floor Plan first, or take a counter order with “Quick takeaway”.</Typography>
					</Card>
				) : posView === 'floor' ? (
					<FloorPicker
						floor={ floor }
						zones={ zones }
						zone={ zone }
						setZone={ setZone }
						tabFor={ tabFor }
						seatedBooking={ seatedBooking }
						nextBooking={ nextBooking }
						openTable={ openTable }
						markReady={ markReady }
						turnMin={ turnMin }
						checkMins={ checkMins }
						money={ money }
					/>
				) : zones.map( ( z ) => {
					const zt = ( floor.tables || [] ).filter( ( t ) => ( t.areaId || 0 ) === z.id );
					if ( ! zt.length ) {
						return null;
					}
					return (
						<Box key={ z.id } sx={ { mb: 3 } }>
							<Typography sx={ { fontSize: 11, fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.muted, mb: 1, px: 0.5 } }>{ z.name }</Typography>
							<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 } }>
								{ zt.map( ( t ) => {
									const tab = tabFor( t.id );
									const off = 'maintenance' === t.status;
									const sb = ! tab && ! off ? seatedBooking( t.id ) : null;
									const nb = ! tab && ! off && ! sb ? nextBooking( t.id ) : null;
									const soon = nb && minsUntil( nb.time ) <= turnMin;
									return (
										<Card
											key={ t.id }
											hover={ ! off }
											onClick={ off ? undefined : () => openTable( t ) }
											sx={ { p: 1.75, opacity: off ? 0.5 : 1, borderColor: tab ? tokens.accent : ( sb ? tokens.green : ( soon ? tokens.amber : tokens.border ) ), borderWidth: tab || sb || soon ? 2 : 1, borderStyle: soon ? 'dashed' : 'solid', cursor: off ? 'not-allowed' : 'pointer' } }
										>
											<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 0.5 } }>
												<TableRestaurantIcon sx={ { fontSize: 18, color: tab ? tokens.accent : ( sb ? tokens.green : tokens.muted2 ) } } />
												<Typography sx={ { fontWeight: 700, fontSize: 15, color: tokens.ink } }>{ t.name }</Typography>
											</Stack>
											{ tab ? (
												<Typography sx={ { fontSize: 12.5, color: tokens.accentDark, fontWeight: 600 } }>
													Open · { money( tab.total ) } · { ( tab.items || [] ).length } item{ ( tab.items || [] ).length === 1 ? '' : 's' }
												</Typography>
											) : sb ? (
												<Typography sx={ { fontSize: 12.5, color: tokens.green, fontWeight: 600 } }>
													Seated · { sb.name || 'Guest' } · { sb.party }p — no order yet
												</Typography>
											) : nb ? (
												<Typography sx={ { fontSize: 12.5, color: soon ? tokens.amber : tokens.muted, fontWeight: soon ? 600 : 400 } }>
													{ soon ? `Reserved ${ nb.time } · ${ nb.party }p` : `${ t.seats } seats · free until ${ nb.time }` }
												</Typography>
											) : (
												<Typography sx={ { fontSize: 12.5, color: off ? tokens.amber : tokens.muted } }>{ off ? 'Maintenance' : `${ t.seats } seats · free` }</Typography>
											) }
										</Card>
									);
								} ) }
							</Box>
						</Box>
					);
				} ) }
			</Page>
			{ /* ---- Order pad — centered popup over the floor (like the app's other dialogs) ---- */ }
			{ active && (
			<Modal open onClose={ back } sx={ { maxWidth: 1120, width: '96vw' } }>
			<Box className="dk-pos-order" sx={ { p: { xs: 2, md: 3 }, maxHeight: '90vh', overflowY: 'auto' } }>
			<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 2 } }>
				<IconButton onClick={ back } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } }><ArrowBackIcon /></IconButton>
				<Box sx={ { flex: 1, minWidth: 0 } }>
					<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { flexWrap: 'wrap' } }>
							<Typography variant="h5">{ active.tableName }</Typography>
							{ active.order && active.order.placed && (
								<Chip size="small" label={ `⏱ ${ durMins( minsSince( active.order.placed ) ) }` } sx={ { fontWeight: 700, fontVariantNumeric: 'tabular-nums', bgcolor: tokens.accentSoft, color: tokens.accentDark } } />
							) }
							{ isUnsynced( active.order ) && (
								<Chip size="small" icon={ <CloudOffIcon sx={ { fontSize: 14 } } /> } label="Not synced yet" sx={ { fontWeight: 700, bgcolor: tokens.amberSoft, color: tokens.amber } } />
							) }
						</Stack>
					<Typography sx={ { fontSize: 13, color: tokens.muted } }>
						{ active.order ? `Open tab · ${ money( total ) }` : ( active.takeaway ? 'New counter order' : 'New tab — add the first item' ) }
						{ active.order && ! active.takeaway && (
							<Box
								component="button"
								type="button"
								title="Record that someone checked on this table — clears the floor's 'needs a check' flash"
								onClick={ async () => { syncOrder( await api.updateOrder( active.order.id, { action: 'check' } ) ); } }
								sx={ { ml: 1, px: 1, py: 0.2, borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${ tokens.border2 }`, bgcolor: tokens.surface, color: tokens.ink2, fontFamily: 'inherit', '&:hover': { borderColor: tokens.green, color: tokens.green } } }
							>
								Checked ✓
							</Box>
						) }
					</Typography>
					{ /* Who's at the table — pulled from today's diary so the till and
					     the booking panel tell the same story. ⭐ is tappable. */ }
					{ padGuest && padGuest.booking && (
						<Stack direction="row" spacing={ 0.75 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mt: 0.5 } }>
							<Chip
								label={ `👤 ${ padGuest.booking.name || 'Guest' } · ${ padGuest.booking.party }p · booked ${ padGuest.booking.time }` }
								size="small"
								sx={ { height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: tokens.accentSoft, color: tokens.accentDark } }
							/>
							{ padGuest.intel && (
								<Chip
									label={ padGuest.intel.vip ? '⭐ VIP' : '☆ Mark VIP' }
									onClick={ toggleVipAtTill }
									size="small"
									sx={ { height: 22, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', bgcolor: padGuest.intel.vip ? tokens.amberSoft : tokens.surface, color: padGuest.intel.vip ? tokens.amber : tokens.muted, border: `1px solid ${ padGuest.intel.vip ? tokens.amber : tokens.border2 }` } }
								/>
							) }
							{ padGuest.intel && padGuest.intel.allergens && (
								<Chip label={ `⚠ ${ padGuest.intel.allergens }` } size="small" sx={ { height: 22, fontSize: 11.5, fontWeight: 700, bgcolor: tokens.redSoft, color: tokens.red } } />
							) }
							{ padGuest.intel && padGuest.intel.visits > 1 && (
								<Chip label={ `${ padGuest.intel.visits } visits` } size="small" sx={ { height: 20, fontSize: 11, bgcolor: tokens.soft, color: tokens.ink2, fontWeight: 600 } } />
							) }
						</Stack>
					) }
					{ padGuest && <PadNotes key={ active.tableId } booking={ padGuest.booking } intel={ padGuest.intel } /> }
					{ active.order && ( () => {
						const tm = tabTiming( active.order );
						if ( ! tm || ( ! tm.opened && ! tm.rounds.length ) ) {
							return null;
						}
						return (
							<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 0.25, fontVariantNumeric: 'tabular-nums' } }>
								{ [
									tm.opened ? `Opened ${ hhmm( tm.opened ) } · ${ durMins( minsSince( tm.opened ) ) } ago` : '',
									tm.rounds.length ? `${ tm.rounds.length } round${ tm.rounds.length === 1 ? '' : 's' } (last ${ hhmm( tm.rounds[ tm.rounds.length - 1 ] ) })` : '',
									tm.servedAt ? `Served · took ${ tm.serveMins } min` : ( tm.rounds.length ? `Cooking ${ durMins( minsSince( tm.rounds[ tm.rounds.length - 1 ] ) ) }` : '' ),
									'',
								].filter( Boolean ).join( '  ·  ' ) }
							</Typography>
						);
					} )() }
				</Box>
				{ active.tableId ? (
						<IconButton onClick={ () => setHistOpen( true ) } title="Previous orders for this table" sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } }><HistoryIcon /></IconButton>
					) : null }
					{ active.order && ! active.takeaway && (
					<Button variant="outlined" startIcon={ <TableRestaurantIcon /> } onClick={ () => setMoveOpen( true ) }>Move</Button>
				) }
			</Stack>

			{ histOpen && active.tableId ? (
					<TableHistorySheet
						tableId={ active.tableId }
						tableName={ active.tableName }
						money={ money }
						onClose={ () => setHistOpen( false ) }
						onChanged={ async () => {
							// A reopened tab must land straight back on the floor AND in
							// the open pad — not wait for the next heartbeat.
							try {
								const all = await api.getOrders();
								const list = ( all || [] ).filter( isOpenTab );
								setOrders( list );
								setActive( ( a ) => ( a && ! a.takeaway && ! a.order ? { ...a, order: list.find( ( o ) => o.tableId === a.tableId ) || null } : a ) );
							} catch ( e ) {}
						} }
					/>
				) : null }
				{ offlineNote ? (
					<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 2, px: 1.5, py: 1, borderRadius: 2, bgcolor: tokens.amberSoft, border: `1px solid ${ tokens.amber }`, color: tokens.amber } }>
						<CloudOffIcon sx={ { fontSize: 18 } } />
						<Typography sx={ { fontSize: 12.5, fontWeight: 600 } }>{ offlineNote }</Typography>
					</Stack>
				) : null }
				<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 2 } alignItems="flex-start">
				{ /* Menu grid */ }
				<Box sx={ { flex: 1, minWidth: 0, width: '100%' } }>
					{ sections.length > 1 && (
						<ToggleButtonGroup size="small" exclusive value={ course } onChange={ ( e, v ) => setCourse( v == null ? '' : v ) } sx={ { mb: 2, flexWrap: 'wrap' } }>
							<ToggleButton value="">All</ToggleButton>
							{ sections.map( ( s ) => <ToggleButton key={ s.id } value={ s.name }>{ s.name }</ToggleButton> ) }
						</ToggleButtonGroup>
					) }
					{ sections.length === 0 && <Typography sx={ { color: tokens.muted } }>No menu items yet — add some in Menu Builder.</Typography> }
					{ ( course ? sections.filter( ( s ) => s.name === course ) : sections ).map( ( sec ) => (
						<Box key={ sec.id } sx={ { mb: 2.5 } }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>{ sec.name }</Typography>
							<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1 } }>
								{ ( sec.items || [] ).map( ( item ) => {
									const off = item.available === false;
									return (
										<Card key={ item.id } hover={ ! off } onClick={ off ? undefined : () => chooseItem( item ) } sx={ { p: 1.25, cursor: off ? 'default' : 'pointer', position: 'relative', opacity: off ? 0.55 : 1 } }>
											<Typography sx={ { fontWeight: 600, fontSize: 13.5, color: tokens.ink, lineHeight: 1.25, pr: 3 } }>{ item.title }</Typography>
											<Typography sx={ { fontSize: 12.5, color: off ? tokens.red : tokens.accentDark, fontWeight: 700, mt: 0.5, fontVariantNumeric: 'tabular-nums' } }>
												{ off ? '86’d — out of stock' : ( ( item.prices || [] ).length > 1 ? `from ${ money( item.prices[ 0 ].amount ) }` : money( ( item.prices[ 0 ] || {} ).amount ) ) }
												{ ! off && ( item.modifiers || [] ).length > 0 ? ' · options' : '' }
											</Typography>
											<Box component="button" onClick={ ( e ) => { e.stopPropagation(); eightySix( item ); } } sx={ { position: 'absolute', top: 4, right: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: off ? tokens.green : tokens.muted2, padding: '2px 4px' } }>
												{ off ? 'Restock' : '86' }
											</Box>
										</Card>
									);
								} ) }
							</Box>
						</Box>
					) ) }
				</Box>

				{ /* Tab panel */ }
				<Box sx={ { width: { xs: '100%', md: 360 }, flexShrink: 0, position: { md: 'sticky' }, top: { md: 16 } } }>
					<Card sx={ { p: 0, overflow: 'hidden' } }>
						<Box sx={ { p: 1.75, borderBottom: `1px solid ${ tokens.border }` } }>
							<Typography sx={ { fontWeight: 700, fontSize: 15 } }>The tab</Typography>
						</Box>
						<Box sx={ { maxHeight: 420, overflowY: 'auto' } }>
							{ lines.length === 0 ? (
								<Typography sx={ { p: 2, fontSize: 13, color: tokens.muted } }>Tap items to add them to this tab.</Typography>
							) : lines.map( ( l, i ) => (
								<Stack key={ i } direction="row" alignItems="flex-start" spacing={ 1 } sx={ { px: 1.75, py: 1, borderBottom: `1px solid ${ tokens.soft }` } }>
									<Typography sx={ { fontWeight: 700, fontSize: 13, width: 22, color: tokens.muted, fontVariantNumeric: 'tabular-nums' } }>{ l.qty }×</Typography>
									<Box sx={ { flex: 1, minWidth: 0 } }>
										<Typography sx={ { fontSize: 13.5, fontWeight: 600, color: tokens.ink } }>
											{ l.title }{ l.priceLabel ? ` · ${ l.priceLabel }` : '' }
										</Typography>
										{ ( l.chosen || [] ).length > 0 && <Typography sx={ { fontSize: 11.5, color: tokens.muted } }>+ { l.chosen.map( ( c ) => c.label ).join( ', ' ) }</Typography> }
										{ ( l.removed || [] ).length > 0 && <Typography sx={ { fontSize: 11.5, color: tokens.red } }>− { l.removed.join( ', ' ) }</Typography> }
										<Stack direction="row" spacing={ 0.75 } sx={ { mt: 0.25 } }>
											{ l.course ? <Chip label={ l.course } size="small" sx={ { height: 17, fontSize: 10.5, bgcolor: tokens.soft, color: tokens.muted } } /> : null }
											<Chip label={ l.fired ? 'Fired' : 'New' } size="small" sx={ { height: 17, fontSize: 10.5, bgcolor: l.fired ? tokens.greenSoft : tokens.amberSoft, color: l.fired ? tokens.green : tokens.amber, fontWeight: 700 } } />
											{ l.unsynced ? (
												<Chip label="On this device" size="small" sx={ { height: 17, fontSize: 10.5, bgcolor: 'transparent', color: tokens.amber, fontWeight: 700, border: `1px solid ${ tokens.amber }` } } />
											) : null }
										</Stack>
									</Box>
									<Typography sx={ { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }>{ money( l.lineTotal ) }</Typography>
									{ ( ! l.fired || caps.refunds ) && (
										<IconButton size="small" disabled={ busy } onClick={ () => voidLine( i ) } sx={ { color: l.fired ? tokens.red : tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
									) }
								</Stack>
							) ) }
						</Box>
						<Box sx={ { p: 1.75, borderTop: `1px solid ${ tokens.border }` } }>
							<Stack direction="row" justifyContent="space-between" sx={ { mb: 1.5 } }>
								<Typography sx={ { fontWeight: 700, fontSize: 15 } }>Total</Typography>
								<Typography sx={ { fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' } }>{ money( total ) }</Typography>
							</Stack>
							<Button
								variant="contained"
								fullWidth
								startIcon={ <LocalFireDepartmentIcon /> }
								disabled={ busy || unfired === 0 }
								onClick={ () => { setFireNote( '' ); setFireOpen( true ); } }
								sx={ justFired ? { bgcolor: tokens.green, '&:hover': { bgcolor: tokens.green } } : undefined }
							>
								{ justFired ? 'Sent to kitchen ✓' : ( unfired > 0 ? `Fire ${ unfired } to kitchen` : 'Nothing to fire' ) }
							</Button>
							<Button
								variant="outlined"
								fullWidth
								startIcon={ <ReceiptLongIcon /> }
								disabled={ ! active.order || lines.length === 0 }
								onClick={ () => setBill( true ) }
								sx={ { mt: 1 } }
							>
								Bill &amp; pay
							</Button>
						</Box>
					</Card>
				</Box>
			</Stack>

			{ mod && (
				<ModifierSheet
					item={ mod }
					money={ money }
					onClose={ () => setMod( null ) }
					onAdd={ ( line ) => { setMod( null ); addLine( line ); } }
				/>
			) }

			{ /* Fire confirm: exactly what's about to hit the kitchen/bar, plus an
			     optional ticket note that prints and shows on the kitchen screen. */ }
			{ fireOpen && active && active.order && ( () => {
				const toFire = ( active.order.items || [] ).filter( ( li ) => ! li.fired );
				const isBar = ( li ) => 'bar' === li.station;
				const mixed = toFire.some( isBar ) && toFire.some( ( li ) => ! isBar( li ) );
				const roundTotal = toFire.reduce( ( s, li ) => s + ( parseFloat( li.lineTotal ) || 0 ), 0 );
				return (
					<Modal open onClose={ () => setFireOpen( false ) }>
						<Box sx={ { p: 2.5, width: 'min(460px, 94vw)' } }>
							<Typography variant="h6" sx={ { fontSize: 17 } }>Send to the { mixed ? 'kitchen & bar' : ( toFire.every( isBar ) ? 'bar' : 'kitchen' ) }</Typography>
							<Typography sx={ { fontSize: 12.5, color: tokens.muted, mb: 1.5 } }>
								{ active.tableName } · { toFire.length } item{ toFire.length === 1 ? '' : 's' } this round · { money( roundTotal ) }
							</Typography>
							<Stack spacing={ 0.5 } sx={ { mb: 2, maxHeight: '38vh', overflowY: 'auto' } }>
								{ toFire.map( ( li, i ) => (
									<Stack key={ i } direction="row" alignItems="center" spacing={ 1 } sx={ { px: 1, py: 0.5, borderRadius: '8px', bgcolor: tokens.soft } }>
										<Typography sx={ { fontSize: 13, fontWeight: 700, color: tokens.ink, fontVariantNumeric: 'tabular-nums' } }>{ li.qty || 1 }×</Typography>
										<Box sx={ { flex: 1, minWidth: 0 } }>
											<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink } } noWrap>{ li.title }{ li.priceLabel ? ` (${ li.priceLabel })` : '' }</Typography>
											{ !! ( ( li.chosen && li.chosen.length ) || ( li.removed && li.removed.length ) ) && (
												<Typography sx={ { fontSize: 11.5, color: tokens.muted } } noWrap>
													{ [ ...( li.chosen || [] ).map( ( c ) => c.label ), ...( li.removed || [] ).map( ( r ) => 'no ' + ( r.label || r ) ) ].join( ', ' ) }
												</Typography>
											) }
										</Box>
										{ mixed && (
											<Chip label={ isBar( li ) ? 'Bar' : 'Kitchen' } size="small" sx={ { height: 18, fontSize: 10.5, fontWeight: 700, bgcolor: isBar( li ) ? tokens.violetSoft : tokens.amberSoft, color: isBar( li ) ? tokens.violet : tokens.amber } } />
										) }
									</Stack>
								) ) }
							</Stack>
							<TextField
								label="Note for this ticket (optional)"
								placeholder="e.g. Allergy at seat 2 — nothing with nuts"
								value={ fireNote }
								onChange={ ( e ) => setFireNote( e.target.value ) }
								fullWidth
							/>
							<Typography sx={ { fontSize: 11.5, color: tokens.muted, mt: 0.5 } }>
								Prints on the ticket and shows on the kitchen screen with this round.
							</Typography>
							<Stack direction="row" justifyContent="flex-end" spacing={ 1 } sx={ { mt: 2 } }>
								<Button onClick={ () => setFireOpen( false ) } sx={ { color: tokens.muted } }>Cancel</Button>
								<Button variant="contained" startIcon={ <LocalFireDepartmentIcon /> } disabled={ busy } onClick={ () => fire( fireNote.trim() ) }>
									Fire { toFire.length } item{ toFire.length === 1 ? '' : 's' }
								</Button>
							</Stack>
						</Box>
					</Modal>
				);
			} )() }

			{ moveOpen && (
				<Modal open onClose={ () => setMoveOpen( false ) }>
					<Box sx={ { p: 3, maxHeight: '80vh', overflowY: 'auto' } }>
						<Typography variant="h6" sx={ { mb: 2 } }>Move { active.tableName } to…</Typography>
						<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 } }>
							{ ( floor.tables || [] ).filter( ( t ) => t.id !== active.tableId && 'maintenance' !== t.status ).map( ( t ) => (
								<Button key={ t.id } variant="outlined" disabled={ busy } onClick={ () => transfer( t ) }>{ t.name }</Button>
							) ) }
						</Box>
					</Box>
				</Modal>
			) }

			{ bill && active.order && (
				<BillSheet
					order={ active.order }
					money={ money }
					tableName={ active.tableName }
					onUpdate={ syncOrder }
					onClose={ () => setBill( false ) }
					onSettled={ () => { setBill( false ); back(); } }
					servicePct={ servicePct }
					onServicePct={ ( pct ) => { setServicePct( pct ); api.saveOrderSettings( { service_pct: pct } ).catch( () => {} ); } }
				/>
			) }
			</Box>
			</Modal>
			) }
		</>
	);
}

// A table's previous (settled) orders — opened from the order pad's history icon.
function TableHistorySheet( { tableId, tableName, money, onClose, onChanged } ) {
	const [ orders, setOrders ] = useState( null );
	const [ openId, setOpenId ] = useState( 0 );
	const [ confirmAmend, setConfirmAmend ] = useState( null ); // { o, ti, t } remove tender | { o, reopen } reopen tab
	const [ retypeFor, setRetypeFor ] = useState( '' ); // "orderId:tenderIndex" showing the swap-method chips
	const [ amendErr, setAmendErr ] = useState( '' );
	// Amending money is a manager action (same permission as refunds/voids).
	const canAmend = ! window.DINEKIT || ! window.DINEKIT.caps || !! window.DINEKIT.caps.refunds;
	const refresh = () => api.tableHistory( tableId ).then( ( r ) => setOrders( Array.isArray( r ) ? r : [] ) ).catch( () => {} );
	useEffect( () => {
		let live = true;
		api.tableHistory( tableId )
			.then( ( r ) => { if ( live ) { setOrders( Array.isArray( r ) ? r : [] ); } } )
			.catch( () => { if ( live ) { setOrders( [] ); } } );
		return () => { live = false; };
	}, [ tableId ] );
	const doAmend = async ( c ) => {
		setAmendErr( '' );
		try {
			if ( c.reopen ) {
				await api.updateOrder( c.o.id, { action: 'reopen' } );
			} else {
				await api.updateOrder( c.o.id, { action: 'remove_tender', tenderIndex: c.ti, tenderType: c.t.type, amount: c.t.amount } );
			}
			await refresh();
			onChanged && onChanged();
		} catch ( e ) {
			setAmendErr( e.message || 'Could not amend that order.' );
		}
	};
	// "Pressed voucher, meant cash": swap the payment's method in place —
	// the amount and the settle don't move, only the books (logged).
	const retype = async ( o, ti, t, newType ) => {
		setAmendErr( '' );
		setRetypeFor( '' );
		try {
			await api.updateOrder( o.id, { action: 'retype_tender', tenderIndex: ti, tenderType: t.type, amount: t.amount, newType } );
			await refresh();
		} catch ( e ) {
			setAmendErr( e.message || 'Could not change the payment method.' );
		}
	};
	return (
		<Modal open onClose={ onClose } sx={ { maxWidth: 620 } }>
			<Box sx={ { p: 3, maxHeight: '82vh', overflowY: 'auto' } }>
				<Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={ { mb: 2 } }>
					<Box>
						<Typography variant="h6">Previous orders</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>{ tableName } · settled tabs, most recent first</Typography>
					</Box>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>
				{ orders === null ? (
					<Stack alignItems="center" sx={ { py: 5 } }><CircularProgress /></Stack>
				) : orders.length === 0 ? (
					<Typography sx={ { color: tokens.muted, py: 2 } }>No previous orders for this table yet.</Typography>
				) : (
					<Stack spacing={ 1.25 }>
						{ orders.map( ( o ) => {
							const items = o.items || [];
							const count = items.reduce( ( n, l ) => n + ( Number( l.qty ) || 1 ), 0 );
							const tenders = ( o.tenders || [] ).map( ( t ) => t.type ).filter( Boolean );
							const open = openId === o.id;
							return (
								<Card key={ o.id } sx={ { p: 0, overflow: 'hidden' } }>
									<Box onClick={ () => setOpenId( open ? 0 : o.id ) } sx={ { p: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5 } }>
										<Box sx={ { flex: 1, minWidth: 0 } }>
											<Typography sx={ { fontWeight: 700, fontSize: 14 } }>{ fmtDateTime( o.placed ) }</Typography>
											<Typography sx={ { fontSize: 12, color: tokens.muted } }>
												#{ o.number } · { count } item{ count === 1 ? '' : 's' }{ tenders.length ? ` · ${ tenders.join( ', ' ) }` : '' }
											</Typography>
										</Box>
										<Typography sx={ { fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }>{ money( Number( o.grandTotal ) ) }</Typography>
									</Box>
									{ open && (
										<Box sx={ { px: 1.5, pb: 1.5, borderTop: `1px solid ${ tokens.border }` } }>
											{ items.map( ( l, i ) => (
												<Stack key={ i } direction="row" justifyContent="space-between" spacing={ 1 } sx={ { mt: 1 } }>
													<Typography sx={ { fontSize: 13, color: tokens.ink2 } }>
														{ Number( l.qty ) || 1 }× { l.title }{ l.priceLabel ? ` · ${ l.priceLabel }` : '' }
													</Typography>
													<Typography sx={ { fontSize: 13, color: tokens.muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 } }>{ money( Number( l.lineTotal ) || 0 ) }</Typography>
												</Stack>
											) ) }
											{ ( Number( o.service ) > 0 || Number( o.tip ) > 0 ) && (
												<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 1 } }>
													{ [ Number( o.service ) > 0 ? `Service ${ money( Number( o.service ) ) }` : '', Number( o.tip ) > 0 ? `Tip ${ money( Number( o.tip ) ) }` : '' ].filter( Boolean ).join( ' · ' ) }
												</Typography>
											) }
											{ /* The money trail + the manager's fix-up tools: a
											     mis-keyed payment comes off (the tab reopens if
											     no longer covered), or the whole tab reopens. */ }
											{ ( o.tenders || [] ).length > 0 && (
												<Box sx={ { mt: 1.25, pt: 1, borderTop: `1px dashed ${ tokens.border }` } }>
													<Typography sx={ { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tokens.muted } }>Payments</Typography>
													{ o.tenders.map( ( t, ti ) => (
														<Box key={ ti } sx={ { mt: 0.5 } }>
															<Stack direction="row" alignItems="center" spacing={ 1 }>
																<Typography sx={ { fontSize: 13, color: tokens.ink2 } }>
																	{ t.type } · { money( Number( t.amount ) ) }{ t.t ? ` · ${ fmtDateTime( t.t ) }` : '' }
																</Typography>
																<Box sx={ { flex: 1 } } />
																{ canAmend && (
																	<Button size="small" onClick={ () => setRetypeFor( retypeFor === `${ o.id }:${ ti }` ? '' : `${ o.id }:${ ti }` ) }>Change</Button>
																) }
																{ canAmend && (
																	<Button size="small" color="error" onClick={ () => setConfirmAmend( { o, ti, t } ) }>Remove</Button>
																) }
															</Stack>
															{ retypeFor === `${ o.id }:${ ti }` && (
																<Stack direction="row" spacing={ 0.75 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mt: 0.5 } }>
																	<Typography sx={ { fontSize: 12, color: tokens.muted } }>Was actually…</Typography>
																	{ [ 'cash', 'card', 'voucher', 'comp', 'account' ].filter( ( ty ) => ty !== t.type ).map( ( ty ) => (
																		<Chip key={ ty } label={ ty } size="small" onClick={ () => retype( o, ti, t, ty ) } sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: tokens.soft, color: tokens.ink2, '&:hover': { bgcolor: tokens.accentSoft, color: tokens.accentDark } } } />
																	) ) }
																</Stack>
															) }
														</Box>
													) ) }
												</Box>
											) }
											{ canAmend && (
												<Stack direction="row" justifyContent="flex-end" sx={ { mt: 1.25 } }>
													<Button size="small" variant="outlined" onClick={ () => setConfirmAmend( { o, reopen: true } ) }>Reopen this tab</Button>
												</Stack>
											) }
										</Box>
									) }
								</Card>
							);
						} ) }
					</Stack>
				) }
				{ !! amendErr && (
					<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.red, mt: 1.5 } }>{ amendErr }</Typography>
				) }
			</Box>
			<ConfirmDialog
				open={ !! confirmAmend }
				title={ confirmAmend && confirmAmend.reopen ? 'Reopen this tab?' : 'Remove this payment?' }
				message={ confirmAmend
					? ( confirmAmend.reopen
						? `Order #${ confirmAmend.o.number } goes back onto ${ tableName } as an open tab — settle it again when it's right.`
						: `The ${ confirmAmend.t.type } payment of ${ money( Number( confirmAmend.t.amount ) ) } comes off order #${ confirmAmend.o.number }. If the bill is no longer covered, the tab reopens on ${ tableName } so it can be settled correctly.` )
					: '' }
				confirmLabel={ confirmAmend && confirmAmend.reopen ? 'Reopen tab' : 'Remove payment' }
				onConfirm={ () => { const c = confirmAmend; setConfirmAmend( null ); doAmend( c ); } }
				onCancel={ () => setConfirmAmend( null ) }
			/>
		</Modal>
	);
}

// Configure variant/price + modifier choices for an item before adding to the tab.
function ModifierSheet( { item, money, onAdd, onClose } ) {
	const [ priceIndex, setPriceIndex ] = useState( 0 );
	const [ qty, setQty ] = useState( 1 );
	const [ choices, setChoices ] = useState( {} ); // groupIdx -> [optIdx]
	const [ removed, setRemoved ] = useState( {} ); // groupIdx -> [optIdx]
	const groups = item.modifiers || [];
	const variants = item.prices || [];

	const toggle = ( map, setMap, gi, oi, single ) => {
		setMap( ( m ) => {
			const cur = m[ gi ] || [];
			let next;
			if ( single ) {
				next = cur.includes( oi ) ? [] : [ oi ];
			} else {
				next = cur.includes( oi ) ? cur.filter( ( x ) => x !== oi ) : [ ...cur, oi ];
			}
			return { ...m, [ gi ]: next };
		} );
	};

	const preview = useMemo( () => {
		let unit = Number( ( variants[ priceIndex ] || variants[ 0 ] || {} ).amount || 0 );
		groups.forEach( ( g, gi ) => {
			if ( 'choose' === g.type ) {
				( choices[ gi ] || [] ).forEach( ( oi ) => { unit += Number( ( g.options[ oi ] || {} ).price || 0 ); } );
			}
		} );
		return unit * qty;
	}, [ priceIndex, qty, choices, groups, variants ] );

	const add = () => onAdd( { itemId: item.id, qty, priceIndex, choices, removed } );

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '80vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 2 } }>
					<Typography variant="h6">{ item.title }</Typography>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>

				{ variants.length > 1 && (
					<Box sx={ { mb: 2 } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Size</Typography>
						<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
							{ variants.map( ( p, i ) => (
								<Chip
									key={ i }
									label={ `${ p.label || 'Standard' } · ${ money( p.amount ) }` }
									onClick={ () => setPriceIndex( i ) }
									sx={ { fontWeight: 700, bgcolor: priceIndex === i ? tokens.accentSoft : tokens.soft, color: priceIndex === i ? tokens.accentDark : tokens.ink2, cursor: 'pointer' } }
								/>
							) ) }
						</Stack>
					</Box>
				) }

				{ groups.map( ( g, gi ) => {
					const single = 'choose' === g.type && Number( g.max ) === 1;
					const isRemove = 'remove' === g.type;
					const map = isRemove ? removed : choices;
					const setMap = isRemove ? setRemoved : setChoices;
					return (
						<Box key={ gi } sx={ { mb: 2 } }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>{ g.name }</Typography>
							<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
								{ ( g.options || [] ).map( ( opt, oi ) => {
									const on = ( map[ gi ] || [] ).includes( oi );
									return (
										<Chip
											key={ oi }
											label={ `${ isRemove ? 'No ' : '' }${ opt.label }${ ! isRemove && Number( opt.price ) ? ` +${ money( opt.price ) }` : '' }` }
											onClick={ () => toggle( map, setMap, gi, oi, single ) }
											sx={ { fontWeight: 600, bgcolor: on ? ( isRemove ? tokens.redSoft : tokens.accentSoft ) : tokens.soft, color: on ? ( isRemove ? tokens.red : tokens.accentDark ) : tokens.ink2, cursor: 'pointer' } }
										/>
									);
								} ) }
							</Stack>
						</Box>
					);
				} ) }

				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mt: 3 } }>
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<IconButton size="small" onClick={ () => setQty( ( q ) => Math.max( 1, q - 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><RemoveIcon fontSize="small" /></IconButton>
						<Typography sx={ { fontWeight: 700, width: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }>{ qty }</Typography>
						<IconButton size="small" onClick={ () => setQty( ( q ) => Math.min( 20, q + 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><AddIcon fontSize="small" /></IconButton>
					</Stack>
					<Button variant="contained" onClick={ add }>Add · { money( preview ) }</Button>
				</Stack>
			</Box>
		</Modal>
	);
}

const round2 = ( n ) => Math.round( n * 100 ) / 100;

// Settle a tab: service charge + tip, then take payment (cash w/ change, or
// card/voucher/comp settling the balance). Auto-closes when fully paid.
function BillSheet( { order, money, tableName, onUpdate, onClose, onSettled, servicePct = 12.5, onServicePct } ) {
	const [ cash, setCash ] = useState( '' );
	const [ tipInput, setTipInput ] = useState( order.tip && Number( order.tip ) ? String( order.tip ) : '' );
	const [ shares, setShares ] = useState( 1 );
	const [ sharesPaid, setSharesPaid ] = useState( 0 );
	const [ qr, setQr ] = useState( '' ); // pay-by-QR svg
	const [ payToken, setPayToken ] = useState( '' );
	const [ mode, setMode ] = useState( 'even' ); // split mode: even | item
	const [ paidIdx, setPaidIdx ] = useState( [] ); // line indexes already settled (by-item)
	const [ sel, setSel ] = useState( [] ); // currently selected line indexes (by-item)
	const [ emailTo, setEmailTo ] = useState( '' );
	const [ emailed, setEmailed ] = useState( false );
	const [ term, setTerm ] = useState( null ); // { paired, ready }
	const [ readerMsg, setReaderMsg ] = useState( '' );
	const [ memberQ, setMemberQ ] = useState( '' );
	const [ memberResults, setMemberResults ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const online = useOnline();
	const caps = ( typeof window !== 'undefined' && window.DINEKIT && window.DINEKIT.caps ) || {};

	useEffect( () => { if ( 'completed' === order.status ) { onSettled(); } }, [ order.status ] );
	useEffect( () => { api.getTerminal().then( setTerm ).catch( () => setTerm( { paired: false } ) ); }, [] );

	const food = Number( order.total );
	const svcApplied = Number( order.service ) > 0;
	const grand = Number( order.grandTotal );
	const balance = Number( order.balance );
	const cashN = Number( cash || 0 );
	const lines = order.items || [];
	const selSubtotal = round2( sel.reduce( ( s, i ) => s + Number( ( lines[ i ] || {} ).lineTotal || 0 ), 0 ) );
	// The amount the current tender settles: selected items (by-item), an even
	// share (even split), else the whole remaining balance.
	const charge = 'item' === mode
		? round2( Math.min( sel.length ? selSubtotal : balance, balance ) )
		: round2( Math.min( shares > 1 ? balance / Math.max( 1, shares - sharesPaid ) : balance, balance ) );
	const change = cashN > charge ? round2( cashN - charge ) : 0;

	const setCharges = async ( patch ) => {
		setBusy( true );
		try { onUpdate( await api.updateOrder( order.id, { action: 'set_charges', ...patch } ) ); } finally { setBusy( false ); }
	};
	const toggleService = () => setCharges( { service: svcApplied ? 0 : round2( food * ( Number( servicePct ) || 0 ) / 100 ) } );
	// Change the service % on the fly; save it back as the venue default, and
	// re-apply to this bill if service is already on.
	const changeServicePct = ( pct ) => {
		const p = Math.max( 0, Math.min( 100, Number( pct ) || 0 ) );
		if ( onServicePct ) { onServicePct( p ); }
		if ( svcApplied ) { setCharges( { service: round2( food * p / 100 ) } ); }
	};

	const tender = async ( type, amount ) => {
		if ( amount <= 0 ) {
			return;
		}
		// Cash is the one tender that still works with the line down — it's what a
		// restaurant falls back on, and the server dedups the queued ref so a
		// replay can never take the money twice. Everything else needs a live
		// authorisation, so it must fail loudly rather than be deferred.
		if ( ! online && 'cash' !== type ) {
			setReaderMsg( 'Offline — only cash can be taken until the connection is back.' );
			return;
		}
		setBusy( true );
		const ref = offlineQueue.newRef();
		try {
			let updated;
			try {
				updated = await api.updateOrder( order.id, { action: 'tender', tenderType: type, amount, ref } );
			} catch ( e ) {
				if ( ! isQueued( e ) ) {
					throw e;
				}
				updated = fold.tender( order, type, amount, ref );
				setReaderMsg( 'Cash recorded on this device — it will post to the books when you reconnect.' );
			}
			onUpdate( updated );
			if ( 'completed' === updated.status ) {
				// Settled in full → close the tab cleanly. We deliberately do NOT
				// auto-open a print window: popping a new browser tab to print on
				// every card/voucher/comp settle is jarring and reads as a crash.
				// Cash change is shown inline as it's counted, and staff can print
				// on demand with the "Print receipt" button.
				onSettled();
			} else {
				setCash( '' );
				if ( 'item' === mode ) {
					setPaidIdx( ( p ) => [ ...p, ...sel ] );
					setSel( [] );
				} else if ( shares > 1 ) {
					setSharesPaid( ( p ) => p + 1 );
				}
			}
		} catch ( e ) {
			// A non-cash tender that hits a dead line lands here (it is never
			// queued). The heartbeat may not have flipped the banner yet, so say
			// plainly what happened instead of failing silently.
			setReaderMsg( `${ type === 'cash' ? 'Payment' : 'Card payment' } didn’t go through — ${ e.message }` );
		} finally { setBusy( false ); }
	};
	// Empty cash box = exact amount; a smaller amount = a partial payment.
	const takeCash = () => tender( 'cash', cashN > 0 && cashN < charge ? round2( cashN ) : charge );

	// Card reader (Stripe Terminal): charge the reader, then poll the tab until
	// the webhook records the card tender.
	const payReader = async () => {
		setBusy( true );
		setReaderMsg( 'Follow the prompt on the reader…' );
		try {
			await api.terminalCharge( order.id, charge );
			let tries = 0;
			const iv = setInterval( async () => {
				tries++;
				try {
					const os = await api.getOrders();
					const o = ( os || [] ).find( ( x ) => x.id === order.id );
					if ( o ) {
						onUpdate( o );
						if ( 'completed' === o.status || Number( o.balance ) <= 0 ) {
							clearInterval( iv );
							setReaderMsg( '' );
							if ( 'completed' === o.status ) {
								onSettled();
							}
						}
					}
				} catch ( e ) { /* keep polling */ }
				if ( tries > 25 ) {
					clearInterval( iv );
					setReaderMsg( '' );
				}
			}, 3000 );
		} catch ( e ) {
			setReaderMsg( ( e && e.message ) || 'Could not start the reader.' );
		} finally { setBusy( false ); }
	};

	const findMembers = async () => {
		if ( ! memberQ ) {
			return;
		}
		setMemberResults( [] );
		try { setMemberResults( await api.searchMembers( memberQ ) ); } catch ( e ) { setMemberResults( [] ); }
	};
	const attachMember = async ( m ) => {
		setBusy( true );
		try { onUpdate( await api.updateOrder( order.id, { action: 'member', memberId: m.id } ) ); setMemberResults( null ); setMemberQ( '' ); } finally { setBusy( false ); }
	};
	const newMember = async () => {
		setBusy( true );
		try { const m = await api.createMember( { name: memberQ, phone: /\d/.test( memberQ ) ? memberQ : '' } ); await attachMember( m ); } finally { setBusy( false ); }
	};
	const redeem = async () => {
		const pts = Math.min( Number( order.memberPoints || 0 ), Math.floor( balance / 0.05 ) );
		if ( pts <= 0 ) {
			return;
		}
		setBusy( true );
		try { onUpdate( await api.updateOrder( order.id, { action: 'redeem', points: pts } ) ); } finally { setBusy( false ); }
	};

	const emailReceipt = async () => {
		if ( ! emailTo ) {
			return;
		}
		setBusy( true );
		try {
			await api.updateOrder( order.id, { action: 'email_receipt', email: emailTo } );
			setEmailed( true );
			setTimeout( () => setEmailed( false ), 2500 );
		} finally { setBusy( false ); }
	};

	// Pay-by-QR: mint a pay link, show its QR, and poll until the customer pays.
	const showQr = async () => {
		setBusy( true );
		try {
			const updated = await api.updateOrder( order.id, { action: 'pay_link' } );
			onUpdate( updated );
			const url = updated.payUrl || '';
			setPayToken( url ? ( new URL( url ).searchParams.get( 'dinekit_pay' ) || '' ) : '' );
			const r = await api.getQr( url );
			setQr( r.svg || '' );
		} finally { setBusy( false ); }
	};
	useEffect( () => {
		if ( ! payToken ) {
			return;
		}
		const iv = setInterval( () => {
			api.payStatus( payToken ).then( ( s ) => {
				if ( s && Number( s.balance ) <= 0 ) {
					clearInterval( iv );
					onSettled();
				}
			} ).catch( () => {} );
		}, 3000 );
		return () => clearInterval( iv );
	}, [ payToken ] );

	const printReceipt = ( o, changeGiven ) => {
		const rows = ( o.items || [] ).map( ( l ) =>
			`<tr><td>${ l.qty }× ${ esc( l.title ) }${ l.priceLabel ? ' (' + esc( l.priceLabel ) + ')' : '' }</td><td class="r">${ money( l.lineTotal ) }</td></tr>`
		).join( '' );
		const extra = [];
		if ( Number( o.service ) ) extra.push( `<tr><td>Service</td><td class="r">${ money( o.service ) }</td></tr>` );
		if ( Number( o.tip ) ) extra.push( `<tr><td>Tip</td><td class="r">${ money( o.tip ) }</td></tr>` );
		if ( Number( o.discount ) ) extra.push( `<tr><td>Discount</td><td class="r">−${ money( o.discount ) }</td></tr>` );
		const tenders = ( o.tenders || [] ).map( ( t ) => `<tr><td>${ esc( t.type ) }</td><td class="r">${ money( t.amount ) }</td></tr>` ).join( '' );
		printDoc(
			'Receipt #' + o.number,
			'<style>body{font-family:monospace;font-size:12px;max-width:300px;margin:0 auto}h2{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}td{padding:1px 0}.r{text-align:right}hr{border:none;border-top:1px dashed #000;margin:6px 0}.tot{font-weight:700;font-size:14px}</style>' +
			`<h2>Receipt</h2><div style="text-align:center">Order #${ o.number }${ o.table ? ' · ' + esc( o.table ) : '' }</div><hr>` +
			`<table>${ rows }</table><hr><table>${ extra.join( '' ) }<tr class="tot"><td>Total</td><td class="r">${ money( o.grandTotal ) }</td></tr></table>` +
			( tenders ? `<hr><table>${ tenders }${ changeGiven ? `<tr><td>Change</td><td class="r">${ money( changeGiven ) }</td></tr>` : '' }</table>` : '' ) +
			'<hr><div style="text-align:center">Thank you!</div>'
		);
	};

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '85vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 2 } }>
					<Box>
						<Typography variant="h6">Bill — { tableName }</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>Order #{ order.number }</Typography>
					</Box>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>

				{ /* Totals */ }
				<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5, mb: 2 } }>
					<Row label="Items" value={ money( food ) } />
					{ Number( order.service ) > 0 && <Row label={ `Service (${ servicePct }%)` } value={ money( order.service ) } /> }
					{ Number( order.tip ) > 0 && <Row label="Tip" value={ money( order.tip ) } /> }
					<Box sx={ { borderTop: `1px solid ${ tokens.soft }`, mt: 0.75, pt: 0.75 } }>
						<Row label="Total" value={ money( grand ) } bold />
						{ Number( order.paid ) > 0 && <Row label="Paid" value={ money( order.paid ) } /> }
						<Row label="Balance" value={ money( balance ) } bold accent />
					</Box>
				</Box>

				{ /* Charges */ }
				<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
					<Chip
						label={ svcApplied ? `Service ${ servicePct }% ✓` : `Add service ${ servicePct }%` }
						onClick={ busy ? undefined : toggleService }
						sx={ { fontWeight: 600, cursor: 'pointer', bgcolor: svcApplied ? tokens.accentSoft : tokens.soft, color: svcApplied ? tokens.accentDark : tokens.ink2 } }
					/>
					<Stack direction="row" alignItems="center" spacing={ 0.25 } sx={ { border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', px: 0.75 } }>
						<Box
							component="input"
							type="number"
							inputMode="decimal"
							aria-label="Service charge percent"
							defaultValue={ servicePct }
							key={ servicePct }
							onBlur={ ( e ) => changeServicePct( e.target.value ) }
							onKeyDown={ ( e ) => { if ( 'Enter' === e.key ) { changeServicePct( e.target.value ); } } }
							sx={ { width: 44, py: 0.5, border: 'none', fontFamily: 'inherit', fontSize: 13.5, textAlign: 'right', outline: 'none', bgcolor: 'transparent' } }
						/>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>% svc</Typography>
					</Stack>
					{ [ 5, 10, 12.5 ].map( ( pct ) => (
						<Chip key={ pct } label={ `Tip ${ pct }%` } onClick={ busy ? undefined : () => {
							// When splitting, tip is a % of THIS payer's share and adds to
							// the running tip — so each person tips their own split, even
							// with a service charge on. Otherwise it's a % of the whole bill.
							const add = round2( ( shares > 1 ? charge : food ) * pct / 100 );
							const nt = shares > 1 ? round2( ( Number( order.tip ) || 0 ) + add ) : add;
							setTipInput( String( nt ) );
							setCharges( { tip: nt } );
						} } sx={ { cursor: 'pointer', bgcolor: tokens.soft, color: tokens.ink2 } } />
					) ) }
					<Box
						component="input"
						type="number"
						inputMode="decimal"
						placeholder="Custom tip"
						value={ tipInput }
						onChange={ ( e ) => setTipInput( e.target.value ) }
						onBlur={ () => setCharges( { tip: round2( Number( tipInput ) || 0 ) } ) }
						onKeyDown={ ( e ) => { if ( 'Enter' === e.key ) { setCharges( { tip: round2( Number( tipInput ) || 0 ) } ); } } }
						sx={ { width: 100, px: 1, py: 0.5, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } }
					/>
					{ Number( order.tip ) > 0 && (
						<Chip label="Clear tip" onClick={ busy ? undefined : () => { setTipInput( '' ); setCharges( { tip: 0 } ); } } sx={ { cursor: 'pointer', bgcolor: tokens.soft, color: tokens.muted } } />
					) }
				</Stack>

				{ /* Loyalty member */ }
				<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Loyalty</Typography>
				{ order.memberId ? (
					<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
						<Chip label={ `${ order.memberName } · ${ order.memberPoints } pts` } sx={ { fontWeight: 600, bgcolor: tokens.accentSoft, color: tokens.accentDark } } />
						{ order.memberPoints > 0 && balance > 0 && Number( order.redeem ) === 0 && (
							<Button variant="outlined" disabled={ busy } onClick={ redeem }>
								Redeem { Math.min( order.memberPoints, Math.floor( balance / 0.05 ) ) } pts (−{ money( Math.min( order.memberPoints, Math.floor( balance / 0.05 ) ) * 0.05 ) })
							</Button>
						) }
						{ Number( order.redeem ) > 0 && <Typography sx={ { fontSize: 12.5, color: tokens.green } }>{ order.redeem } pts redeemed</Typography> }
					</Stack>
				) : (
					<Box sx={ { mb: 2 } }>
						<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
							<Box component="input" type="text" placeholder="Member name or phone…" value={ memberQ } onChange={ ( e ) => setMemberQ( e.target.value ) }
								sx={ { flex: 1, minWidth: 160, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
							<Button variant="outlined" disabled={ busy || ! memberQ } onClick={ findMembers }>Find</Button>
						</Stack>
						{ memberResults && (
							<Stack spacing={ 0.5 } sx={ { mt: 1 } }>
								{ memberResults.map( ( m ) => (
									<Button key={ m.id } variant="text" onClick={ () => attachMember( m ) } sx={ { justifyContent: 'flex-start' } }>{ m.name } { m.phone ? `· ${ m.phone }` : '' } · { m.points } pts</Button>
								) ) }
								<Button variant="text" disabled={ busy || ! memberQ } onClick={ newMember } sx={ { justifyContent: 'flex-start', color: tokens.accentDark } }>+ New member “{ memberQ }”</Button>
							</Stack>
						) }
					</Box>
				) }

				{ /* Payment */ }
				<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Take payment</Typography>
				<Stack direction="row" spacing={ 1 } sx={ { mb: 1.5 } }>
					<Chip label="Even split" onClick={ () => { setMode( 'even' ); setSel( [] ); } } sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: 'even' === mode ? tokens.accentSoft : tokens.soft, color: 'even' === mode ? tokens.accentDark : tokens.ink2 } } />
					<Chip label="By item" onClick={ () => setMode( 'item' ) } sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: 'item' === mode ? tokens.accentSoft : tokens.soft, color: 'item' === mode ? tokens.accentDark : tokens.ink2 } } />
				</Stack>
				{ 'even' === mode ? (
					<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1.5 } } flexWrap="wrap" useFlexGap>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>Split evenly</Typography>
						<IconButton size="small" disabled={ shares <= 1 } onClick={ () => setShares( ( s ) => Math.max( 1, s - 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><RemoveIcon fontSize="small" /></IconButton>
						<Typography sx={ { fontWeight: 700, width: 20, textAlign: 'center' } }>{ shares }</Typography>
						<IconButton size="small" onClick={ () => setShares( ( s ) => Math.min( 12, s + 1 ) ) } sx={ { border: `1px solid ${ tokens.border }` } }><AddIcon fontSize="small" /></IconButton>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>{ shares > 1 ? `${ sharesPaid }/${ shares } paid · ${ money( charge ) }/share` : 'whole bill' }</Typography>
					</Stack>
				) : (
					<Box sx={ { mb: 1.5, border: `1px solid ${ tokens.border }`, borderRadius: '10px', overflow: 'hidden' } }>
						{ lines.map( ( l, i ) => {
							const done = paidIdx.includes( i );
							const on = sel.includes( i );
							return (
								<Stack
									key={ i }
									direction="row"
									justifyContent="space-between"
									alignItems="center"
									onClick={ done ? undefined : () => setSel( ( s ) => s.includes( i ) ? s.filter( ( x ) => x !== i ) : [ ...s, i ] ) }
									sx={ { px: 1.25, py: 0.75, borderBottom: `1px solid ${ tokens.soft }`, cursor: done ? 'default' : 'pointer', bgcolor: on ? tokens.accentSoft : 'transparent', opacity: done ? 0.5 : 1 } }
								>
									<Typography sx={ { fontSize: 13, color: tokens.ink, textDecoration: done ? 'line-through' : 'none' } }>{ l.qty }× { l.title }</Typography>
									<Typography sx={ { fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ done ? 'paid' : money( l.lineTotal ) }</Typography>
								</Stack>
							);
						} ) }
						<Box sx={ { px: 1.25, py: 0.75, bgcolor: tokens.soft } }>
							<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>{ sel.length ? `Selected: ${ money( selSubtotal ) }` : 'Tap items to pay for them — or leave none to pay the remainder.' }</Typography>
						</Box>
					</Box>
				) }
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mb: 1.5 } } flexWrap="wrap" useFlexGap>
					<Box component="input" type="number" inputMode="decimal" placeholder={ charge < balance ? `Cash for ${ money( charge ) }` : 'Cash received' } value={ cash } onChange={ ( e ) => setCash( e.target.value ) }
						sx={ { width: 160, px: 1.25, py: 1, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 14, boxShadow: 'none', outline: 'none' } } />
					<Button variant="contained" disabled={ busy || balance <= 0 } onClick={ takeCash }>Take cash</Button>
					{ change > 0 && <Typography sx={ { fontWeight: 700, color: tokens.green } }>Change { money( change ) }</Typography> }
				</Stack>
				{ /* Every non-cash tender needs a live authorisation, so they're all
				     off while we're down — deliberately disabled rather than queued. */ }
				<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
					<Button variant="outlined" disabled={ busy || balance <= 0 || ! online } onClick={ () => tender( 'card', charge ) }>Card · { money( charge ) }</Button>
					<Button variant="outlined" disabled={ busy || balance <= 0 || ! online } onClick={ () => tender( 'voucher', charge ) }>Voucher</Button>
					<Button variant="outlined" disabled={ busy || balance <= 0 || ! caps.refunds || ! online } onClick={ () => tender( 'comp', balance ) }>Comp</Button>
					<Button variant="outlined" startIcon={ <QrCode2Icon /> } disabled={ busy || balance <= 0 || ! online } onClick={ showQr }>Pay by QR</Button>
					{ term && term.paired && term.ready && (
						<Button variant="outlined" startIcon={ <PointOfSaleIcon /> } disabled={ busy || balance <= 0 || ! online } onClick={ payReader }>Card reader · { money( charge ) }</Button>
					) }
					<Box sx={ { flex: 1 } } />
					<Button variant="text" onClick={ () => printReceipt( order, 0 ) }>Print receipt</Button>
				</Stack>
				{ readerMsg && <Typography sx={ { mt: 1, fontSize: 13, color: tokens.accentDark, fontWeight: 600 } }>{ readerMsg }</Typography> }
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mt: 1 } } flexWrap="wrap" useFlexGap>
					<Box component="input" type="email" placeholder="Email receipt to…" value={ emailTo } onChange={ ( e ) => setEmailTo( e.target.value ) }
						sx={ { width: 200, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
					<Button variant="text" disabled={ busy || ! emailTo } onClick={ emailReceipt }>{ emailed ? 'Sent ✓' : 'Email' }</Button>
				</Stack>

				{ qr && balance > 0 && (
					<Box sx={ { mt: 2, p: 2, border: `1px solid ${ tokens.border }`, borderRadius: '12px', textAlign: 'center' } }>
						<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink, mb: 1 } }>
							Ask the customer to scan to pay { money( balance ) }
						</Typography>
						<Box sx={ { width: 180, mx: 'auto', '& svg': { width: '100%', height: 'auto', display: 'block' } } } dangerouslySetInnerHTML={ { __html: qr } } />
						<Stack direction="row" alignItems="center" justifyContent="center" spacing={ 1 } sx={ { mt: 1 } }>
							<CircularProgress size={ 14 } />
							<Typography sx={ { fontSize: 12, color: tokens.muted } }>Waiting for payment…</Typography>
						</Stack>
					</Box>
				) }
			</Box>
		</Modal>
	);
}

// Cash drawer: open a float, record pay in/out + no-sale, and run an X/Z report.
function CashSheet( { money, onClose } ) {
	const [ rep, setRep ] = useState( null ); // null=loading, {open:false} or X report
	const [ floatIn, setFloatIn ] = useState( '' );
	const [ amt, setAmt ] = useState( '' );
	const [ reason, setReason ] = useState( '' );
	const [ counted, setCounted ] = useState( '' );
	const [ z, setZ ] = useState( null ); // final Z report after close
	const [ term, setTerm ] = useState( null ); // card reader status
	const [ readers, setReaders ] = useState( null ); // reader list when pairing
	const [ busy, setBusy ] = useState( false );

	const load = () => api.getCash().then( setRep ).catch( () => setRep( { open: false } ) );
	useEffect( () => { load(); api.getTerminal().then( setTerm ).catch( () => setTerm( { paired: false } ) ); }, [] );

	const loadReaders = () => { setReaders( [] ); api.terminalReaders().then( setReaders ).catch( () => setReaders( [] ) ); };
	const pair = async ( r ) => { setBusy( true ); try { setTerm( await api.pairReader( r ? r.id : '', r ? r.label : '' ) ); setReaders( null ); } finally { setBusy( false ); } };

	const open = async () => { setBusy( true ); try { setRep( await api.openCash( Number( floatIn || 0 ) ) ); } finally { setBusy( false ); } };
	const move = async ( type ) => {
		setBusy( true );
		try { setRep( await api.cashMovement( { type, amount: Number( amt || 0 ), reason } ) ); setAmt( '' ); setReason( '' ); } finally { setBusy( false ); }
	};
	const close = async () => { setBusy( true ); try { setZ( await api.closeCash( Number( counted || 0 ) ) ); } finally { setBusy( false ); } };

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '85vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 2 } }>
					<Typography variant="h6">Cash drawer</Typography>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>

				{ z ? (
					<Box>
						<Typography sx={ { fontWeight: 700, mb: 1 } }>Drawer closed (Z)</Typography>
						<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5 } }>
							<Row label="Expected in drawer" value={ money( z.expected ) } />
							<Row label="Counted" value={ money( z.counted ) } />
							<Row label="Variance" value={ money( z.variance ) } bold accent />
						</Box>
						<Button variant="contained" fullWidth sx={ { mt: 2 } } onClick={ onClose }>Done</Button>
					</Box>
				) : null === rep ? (
					<Stack alignItems="center" sx={ { py: 4 } }><CircularProgress /></Stack>
				) : ! rep.open ? (
					<Box>
						<Typography sx={ { fontSize: 13.5, color: tokens.muted, mb: 1.5 } }>No drawer session is open. Enter the opening float to start.</Typography>
						<Stack direction="row" spacing={ 1 }>
							<Box component="input" type="number" inputMode="decimal" placeholder="Opening float" value={ floatIn } onChange={ ( e ) => setFloatIn( e.target.value ) }
								sx={ { flex: 1, px: 1.25, py: 1, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 14, boxShadow: 'none', outline: 'none' } } />
							<Button variant="contained" disabled={ busy } onClick={ open }>Open drawer</Button>
						</Stack>
					</Box>
				) : (
					<Box>
						{ /* X report */ }
						<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5, mb: 2 } }>
							<Row label="Opening float" value={ money( rep.float ) } />
							<Row label="Cash sales" value={ money( rep.cashSales ) } />
							<Row label="Paid in" value={ money( rep.payIns ) } />
							<Row label="Paid out" value={ `−${ money( rep.payOuts ) }` } />
							<Box sx={ { borderTop: `1px solid ${ tokens.soft }`, mt: 0.75, pt: 0.75 } }>
								<Row label="Expected in drawer" value={ money( rep.expected ) } bold accent />
							</Box>
							<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.5 } }>Since { new Date( rep.since ).toLocaleString() } · { rep.noSales } no-sale{ rep.noSales === 1 ? '' : 's' }</Typography>
						</Box>

						{ /* Movements */ }
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Movement</Typography>
						<Stack direction="row" spacing={ 1 } sx={ { mb: 1 } } flexWrap="wrap" useFlexGap>
							<Box component="input" type="number" inputMode="decimal" placeholder="Amount" value={ amt } onChange={ ( e ) => setAmt( e.target.value ) }
								sx={ { width: 110, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
							<Box component="input" type="text" placeholder="Reason" value={ reason } onChange={ ( e ) => setReason( e.target.value ) }
								sx={ { flex: 1, minWidth: 120, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 13.5, boxShadow: 'none', outline: 'none' } } />
						</Stack>
						<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
							<Button variant="outlined" disabled={ busy || Number( amt ) <= 0 } onClick={ () => move( 'in' ) }>Pay in</Button>
							<Button variant="outlined" disabled={ busy || Number( amt ) <= 0 } onClick={ () => move( 'out' ) }>Pay out</Button>
							<Button variant="outlined" disabled={ busy } onClick={ () => move( 'nosale' ) }>No-sale</Button>
						</Stack>

						{ /* Close (Z) */ }
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>End of day (Z)</Typography>
						<Stack direction="row" spacing={ 1 }>
							<Box component="input" type="number" inputMode="decimal" placeholder="Counted cash" value={ counted } onChange={ ( e ) => setCounted( e.target.value ) }
								sx={ { flex: 1, px: 1.25, py: 1, border: `1px solid ${ tokens.border2 }`, borderRadius: '9px', fontFamily: 'inherit', fontSize: 14, boxShadow: 'none', outline: 'none' } } />
							<Button variant="contained" disabled={ busy } onClick={ close }>Close drawer</Button>
						</Stack>
					</Box>
				) }

				{ /* Card reader (Stripe Terminal) pairing */ }
				{ ! z && (
					<Box sx={ { mt: 2.5, pt: 2, borderTop: `1px solid ${ tokens.border }` } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 1 } }>Card reader</Typography>
						{ term && ! term.ready ? (
							<Typography sx={ { fontSize: 13, color: tokens.muted } }>Connect Stripe (Integrations) to use a card reader.</Typography>
						) : term && term.paired ? (
							<Stack direction="row" alignItems="center" spacing={ 1 }>
								<Typography sx={ { fontSize: 13.5 } }>Paired: <strong>{ term.readerName || term.readerId }</strong></Typography>
								<Box sx={ { flex: 1 } } />
								<Button variant="text" disabled={ busy } onClick={ () => pair( null ) }>Unpair</Button>
							</Stack>
						) : null === readers ? (
							<Button variant="outlined" disabled={ busy } onClick={ loadReaders }>Pair a reader</Button>
						) : readers.length === 0 ? (
							<Typography sx={ { fontSize: 13, color: tokens.muted } }>No readers found on your Stripe account. Register a WisePOS E / Reader S700 in Stripe first.</Typography>
						) : (
							<Stack spacing={ 1 }>
								{ readers.map( ( r ) => (
									<Button key={ r.id } variant="outlined" disabled={ busy } onClick={ () => pair( r ) }>{ r.label } { r.status ? `· ${ r.status }` : '' }</Button>
								) ) }
							</Stack>
						) }
					</Box>
				) }
			</Box>
		</Modal>
	);
}

// Per-table QR codes to print + stand on the tables (guests scan to order).
function TableQrSheet( { onClose } ) {
	const [ links, setLinks ] = useState( null );
	const [ qrs, setQrs ] = useState( {} ); // tableId -> svg

	useEffect( () => {
		api.getTableQr().then( ( rows ) => {
			setLinks( rows || [] );
			( rows || [] ).forEach( ( r ) => {
				if ( r.url ) {
					api.getQr( r.url ).then( ( res ) => setQrs( ( q ) => ( { ...q, [ r.id ]: res.svg } ) ) ).catch( () => {} );
				}
			} );
		} ).catch( () => setLinks( [] ) );
	}, [] );

	const printAll = () => {
		const cards = ( links || [] ).filter( ( l ) => l.url && qrs[ l.id ] ).map( ( l ) =>
			`<div class="c"><div class="t">${ esc( l.name ) }</div>${ qrs[ l.id ] }<div class="s">Scan to order</div></div>`
		).join( '' );
		printDoc(
			'<style>body{font-family:sans-serif;margin:0}.c{page-break-inside:avoid;display:inline-block;width:46%;text-align:center;margin:2%;padding:16px;border:1px solid #ddd;border-radius:12px;box-sizing:border-box}.t{font-size:20px;font-weight:700;margin-bottom:8px}.c svg{width:70%;height:auto}.s{margin-top:8px;font-weight:600;color:#555}</style>' + cards
		);
	};

	return (
		<Modal open onClose={ onClose }>
			<Box sx={ { p: 3, maxHeight: '85vh', overflowY: 'auto' } }>
				<Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={ { mb: 1 } }>
					<Box>
						<Typography variant="h6">Table ordering QR codes</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>Print one per table — guests scan to order straight to the kitchen.</Typography>
					</Box>
					<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
				</Stack>
				{ null === links ? (
					<Stack alignItems="center" sx={ { py: 4 } }><CircularProgress /></Stack>
				) : links.length === 0 ? (
					<Typography sx={ { color: tokens.muted } }>Add tables in Floor Plan first.</Typography>
				) : ! links.some( ( l ) => l.url ) ? (
					<Typography sx={ { color: tokens.muted } }>Create your online ordering page first (Orders → “Create ordering page”), then the table QR links appear here.</Typography>
				) : (
					<>
						<Button variant="contained" onClick={ printAll } sx={ { mb: 2 } }>Print all</Button>
						<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1.5 } }>
							{ links.filter( ( l ) => l.url ).map( ( l ) => (
								<Box key={ l.id } sx={ { textAlign: 'center', border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.5 } }>
									<Typography sx={ { fontWeight: 700, mb: 0.5 } }>{ l.name }</Typography>
									<Box sx={ { '& svg': { width: '100%', height: 'auto', display: 'block' } } } dangerouslySetInnerHTML={ { __html: qrs[ l.id ] || '' } } />
								</Box>
							) ) }
						</Box>
					</>
				) }
			</Box>
		</Modal>
	);
}

function Row( { label, value, bold, accent } ) {
	return (
		<Stack direction="row" justifyContent="space-between" sx={ { py: 0.25 } }>
			<Typography sx={ { fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 500, color: tokens.ink2 } }>{ label }</Typography>
			<Typography sx={ { fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 600, fontVariantNumeric: 'tabular-nums', color: accent ? tokens.accentDark : tokens.ink } }>{ value }</Typography>
		</Stack>
	);
}
