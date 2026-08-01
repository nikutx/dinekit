import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Typography, Button, IconButton, Chip, CircularProgress, Tooltip } from '../ui';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useSyncRevision } from '../lib/useSync';

// The kitchen flow, left → right. Tapping a card's button advances it; from
// "ready" it leaves the board (completed).
const COLUMNS = [
	{ key: 'new', label: 'New', next: 'preparing', action: 'Start', fg: '#b45309', bg: '#fffbeb', bar: tokens.amber || '#f59e0b' },
	{ key: 'preparing', label: 'Preparing', next: 'ready', action: 'Ready', fg: tokens.accentDark || '#4f46e5', bg: tokens.accentSoft || '#eef2ff', bar: tokens.accent },
	{ key: 'ready', label: 'Ready', next: 'done', action: 'Done', fg: '#166534', bg: '#f0fdf4', bar: tokens.green || '#16a34a' },
];

const POLL_MS = 60000; // safety net only — live updates come from the sync heartbeat.

function minutesSince( iso ) {
	if ( ! iso ) {
		return 0;
	}
	const t = new Date( iso.replace( ' ', 'T' ) ).getTime();
	if ( Number.isNaN( t ) ) {
		return 0;
	}
	return Math.max( 0, Math.floor( ( Date.now() - t ) / 60000 ) );
}

// Timer colour escalates the longer a ticket waits.
function timerTone( mins ) {
	if ( mins >= 15 ) {
		return { fg: '#fff', bg: '#dc2626' };
	}
	if ( mins >= 8 ) {
		return { fg: '#7c2d12', bg: '#fed7aa' };
	}
	return { fg: tokens.muted, bg: tokens.soft };
}

function typeMeta( o ) {
	if ( o.table ) {
		return { icon: <TableRestaurantIcon sx={ { fontSize: 15 } } />, label: o.table };
	}
	if ( o.fulfilment === 'delivery' ) {
		return { icon: <TwoWheelerIcon sx={ { fontSize: 15 } } />, label: 'Delivery' };
	}
	return { icon: <ShoppingBagIcon sx={ { fontSize: 15 } } />, label: 'Collection' };
}

function itemLine( li ) {
	const extra = ( li.chosen || [] ).map( ( c ) => c.label ).concat( ( li.removed || [] ).map( ( r ) => `no ${ r }` ) );
	return { qty: li.qty, title: li.title, extra };
}

// Build the Kitchen Display tickets. A dine-in tab shows ONE ticket per fired
// round (grouped by firedAt), each moving through the columns on its own — so
// firing a new round never disturbs an earlier one that's already Preparing or
// Ready. Online/collection/delivery orders are a single ticket driven by the
// order's own status, as before.
function buildTickets( orders ) {
	const out = [];
	( orders || [] ).forEach( ( o ) => {
		if ( 'dine_in' === o.channel ) {
			const rounds = {};
			( o.items || [] ).forEach( ( li ) => {
				if ( ! li.fired || ( li.kstage || 'new' ) === 'done' ) {
					return;
				}
				// Group by the unique round id (fall back to firedAt for old rounds).
				const k = String( li.firedId || li.firedAt || 'r' );
				( rounds[ k ] = rounds[ k ] || [] ).push( li );
			} );
			Object.keys( rounds ).forEach( ( k ) => {
				const lines = rounds[ k ];
				out.push( {
					id: o.id + '|' + k, orderId: o.id, number: o.number, dineIn: true,
					round: k, stage: lines[ 0 ].kstage || 'new', lines,
					// Legacy lines fired before round ids carry no firedAt — fall back
					// to the order's own age so the clock never lies with "0m".
					table: o.table, fulfilment: o.fulfilment, notes: o.notes, placed: lines[ 0 ].firedAt || o.placed || null,
				} );
			} );
		} else {
			const st = 'sent' === o.status ? 'new' : o.status;
			if ( [ 'new', 'preparing', 'ready' ].includes( st ) ) {
				out.push( {
					id: o.id + '|all', orderId: o.id, number: o.number, dineIn: false,
					firedAt: null, stage: st, lines: o.items || [],
					table: o.table, fulfilment: o.fulfilment, notes: o.notes, placed: o.placed,
					forTime: /^\d{1,2}:\d{2}$/.test( o.when || '' ) ? o.when : '',
				} );
			}
		}
	} );
	return out;
}

export default function KitchenView() {
	const [ orders, setOrders ] = useState( null );
	// A timed order joins the board this many minutes before its slot (0 = all
	// day). Keeps a 19:00 collection from squatting on the pass since noon.
	const kdsLead = useRef( 60 );
	const [ busy, setBusy ] = useState( {} ); // id → true while advancing
	const [ isFull, setIsFull ] = useState( false );
	const [ , setTick ] = useState( 0 ); // forces timers to re-render
	const timer = useRef( null );
	const ticker = useRef( null );
	const rootRef = useRef( null );

	const load = async () => {
		try {
			const list = await api.getOrders();
			// 'sent' = a dine-in round just fired from Take Order; it belongs on the
			// board next to new online orders (both are waiting to be cooked).
			// Scheduled pre-orders stay off the kitchen screen until their day —
		// tomorrow's breakfast must not sit in today's NEW column all night.
		const today = new Date();
		const pad2 = ( n ) => ( n < 10 ? '0' : '' ) + n;
		const iso = today.getFullYear() + '-' + pad2( today.getMonth() + 1 ) + '-' + pad2( today.getDate() );
		// A concrete-time order (today's 19:00 collection, a graduated
		// pre-order) stays off the pass until kds_lead_mins before its slot —
		// the 60s safety poll surfaces it once the window opens.
		const dueSoon = ( o ) => {
			if ( kdsLead.current <= 0 || o.channel === 'dine_in' || ! /^\d{1,2}:\d{2}$/.test( o.when || '' ) ) {
				return true; // ASAP + dine-in rounds always show.
			}
			const target = new Date( ( o.whenDate || iso ) + 'T' + ( o.when.length === 4 ? '0' : '' ) + o.when + ':00' ).getTime();
			return Number.isNaN( target ) || target - Date.now() <= kdsLead.current * 60000;
		};
		setOrders( ( list || [] ).filter( ( o ) => [ 'new', 'sent', 'preparing', 'ready' ].includes( o.status ) && ! o.archived && ! ( o.whenDate && o.whenDate > iso ) && dueSoon( o ) ) );
		} catch ( e ) {
			// Keep the last board on a transient error rather than blanking the kitchen.
		}
	};

	// Refetch the board the instant an order changes on any tablet (via the sync
	// heartbeat), not on a fixed timer. POLL_MS is now just a safety net in case a
	// heartbeat is ever missed.
	const ordersRev = useSyncRevision( 'orders' );
	useEffect( () => {
		load();
	}, [ ordersRev ] );

	useEffect( () => {
		api.getOrderSettings()
			.then( ( s ) => { if ( s && s.kds_lead_mins != null ) { kdsLead.current = Number( s.kds_lead_mins ) || 0; load(); } } )
			.catch( () => {} ); // scoped kitchen logins keep the 60-min default
		timer.current = window.setInterval( load, POLL_MS );
		ticker.current = window.setInterval( () => setTick( ( n ) => n + 1 ), 20000 );
		const onFs = () => setIsFull( !! document.fullscreenElement );
		document.addEventListener( 'fullscreenchange', onFs );
		return () => {
			window.clearInterval( timer.current );
			window.clearInterval( ticker.current );
			document.removeEventListener( 'fullscreenchange', onFs );
		};
	}, [] );

	const toggleFull = () => {
		if ( document.fullscreenElement ) {
			document.exitFullscreen && document.exitFullscreen();
		} else if ( rootRef.current && rootRef.current.requestFullscreen ) {
			// Fullscreen just the board — a kitchen TV shows only the tickets, not wp-admin.
			rootRef.current.requestFullscreen();
		}
	};

	// Advance one ticket a column right. A dine-in round advances on its own via
	// `kitchen_stage` (the backend only flips the tab to 'served' once no round is
	// still cooking — so the bill stays open + payable at the till, not
	// 'completed'). Online/collection orders advance the whole order; "Done"
	// completes them.
	const advance = async ( t, next ) => {
		setBusy( ( b ) => ( { ...b, [ t.id ]: true } ) );
		try {
			if ( t.dineIn ) {
				await api.updateOrder( t.orderId, { action: 'kitchen_stage', round: t.round, stage: next } );
			} else {
				await api.updateOrder( t.orderId, { status: next === 'done' ? 'completed' : next } );
			}
		} catch ( e ) {
			// fall through to reload
		} finally {
			setBusy( ( b ) => { const n = { ...b }; delete n[ t.id ]; return n; } );
			load(); // Reconcile the board (a round may have merged/left).
		}
	};

	const byColumn = useMemo( () => {
		const map = { new: [], preparing: [], ready: [] };
		buildTickets( orders ).forEach( ( t ) => { if ( map[ t.stage ] ) { map[ t.stage ].push( t ); } } );
		// Oldest first — cook in the order rounds arrived.
		Object.values( map ).forEach( ( arr ) => arr.sort( ( a, b ) => String( a.placed ).localeCompare( String( b.placed ) ) ) );
		return map;
	}, [ orders ] );

	const total = byColumn.new.length + byColumn.preparing.length + byColumn.ready.length;

	return (
		<Box
			ref={ rootRef }
			sx={ {
				minHeight: 'calc(100vh - 120px)',
				display: 'flex',
				flexDirection: 'column',
				// When fullscreened (kitchen TV), fill the screen with its own surface.
				...( isFull ? { bgcolor: tokens.bg, p: 3, minHeight: '100vh', overflow: 'auto' } : {} ),
			} }
		>
			{ /* Header bar */ }
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2, flexWrap: 'wrap', gap: 1 } }>
				<Stack direction="row" alignItems="center" spacing={ 1.5 }>
					<RestaurantIcon sx={ { color: tokens.accent, fontSize: 26 } } />
					<Typography variant="h5">Kitchen Display</Typography>
					<Chip
						label={ `${ total } active` }
						size="small"
						sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark || tokens.accent, fontWeight: 700 } }
					/>
				</Stack>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Typography sx={ { fontSize: 12.5, color: tokens.muted2 } }>Auto-refreshing</Typography>
					<Tooltip title="Refresh now">
						<IconButton size="small" onClick={ load } sx={ { color: tokens.muted } }><RefreshIcon fontSize="small" /></IconButton>
					</Tooltip>
					<Button
						size="small"
						variant="outlined"
						startIcon={ isFull ? <FullscreenExitIcon /> : <FullscreenIcon /> }
						onClick={ toggleFull }
					>
						{ isFull ? 'Exit full screen' : 'Full screen' }
					</Button>
				</Stack>
			</Stack>

			{ orders === null ? (
				<Box sx={ { display: 'flex', justifyContent: 'center', py: 10 } }><CircularProgress /></Box>
			) : (
				<Box
					sx={ {
						flex: 1,
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
						gap: 2,
						alignItems: 'start',
					} }
				>
					{ COLUMNS.map( ( col ) => {
						const list = byColumn[ col.key ];
						return (
							<Box key={ col.key } sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '14px', overflow: 'hidden', minHeight: 120 } }>
								<Box sx={ { px: 2, py: 1.25, bgcolor: col.bg, borderBottom: `2px solid ${ col.bar }`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }>
									<Typography sx={ { fontWeight: 800, fontSize: 14, color: col.fg, textTransform: 'uppercase', letterSpacing: '0.03em' } }>{ col.label }</Typography>
									<Typography sx={ { fontWeight: 800, fontSize: 14, color: col.fg } }>{ list.length }</Typography>
								</Box>
								<Stack spacing={ 1.5 } sx={ { p: 1.5 } }>
									{ list.length === 0 ? (
										<Typography sx={ { fontSize: 13, color: tokens.muted2, textAlign: 'center', py: 3 } }>—</Typography>
									) : (
										list.map( ( tk ) => {
											const mins = minutesSince( tk.placed );
											const tone = timerTone( mins );
											const t = typeMeta( tk );
											return (
												<Box key={ tk.id } sx={ { border: `1px solid ${ tokens.border }`, borderLeft: `4px solid ${ col.bar }`, borderRadius: '10px', bgcolor: tokens.bg, overflow: 'hidden' } }>
													<Box sx={ { px: 1.5, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 } }>
														<Stack direction="row" alignItems="center" spacing={ 0.75 } sx={ { minWidth: 0 } }>
															<Typography sx={ { fontWeight: 800, fontSize: 16 } }>#{ tk.number }</Typography>
															<Stack direction="row" alignItems="center" spacing={ 0.4 } sx={ { color: tokens.muted } }>
																{ t.icon }
																<Typography sx={ { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 } }>{ t.label }</Typography>
															</Stack>
															{ tk.forTime && (
																<Box sx={ { px: 0.7, py: 0.1, borderRadius: 999, bgcolor: '#fef3c7', color: '#92400e', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' } }>
																	⏰ for { tk.forTime }
																</Box>
															) }
														</Stack>
														<Box sx={ { px: 0.9, py: 0.2, borderRadius: 999, bgcolor: tone.bg, color: tone.fg, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' } }>
															{ mins }m
														</Box>
													</Box>
													<Stack spacing={ 0.4 } sx={ { px: 1.5, pb: 1 } }>
														{ tk.lines.map( ( li, i ) => {
															const line = itemLine( li );
															return (
																<Box key={ i }>
																	<Typography sx={ { fontSize: 14, fontWeight: 600, lineHeight: 1.35 } }>
																		<Box component="span" sx={ { color: tokens.accent, fontWeight: 800 } }>{ line.qty }× </Box>
																		{ line.title }
																	</Typography>
																	{ line.extra.length > 0 && (
																		<Typography sx={ { fontSize: 12.5, color: tokens.muted, pl: 2 } }>{ line.extra.join( ', ' ) }</Typography>
																	) }
																</Box>
															);
														} ) }
														{ tk.notes && (
															<Box sx={ { mt: 0.5, px: 1, py: 0.6, bgcolor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px' } }>
																<Typography sx={ { fontSize: 12.5, color: '#92400e', fontWeight: 600 } }>📝 { tk.notes }</Typography>
															</Box>
														) }
													</Stack>
													<Button
														fullWidth
														onClick={ () => advance( tk, col.next ) }
														disabled={ !! busy[ tk.id ] }
														sx={ {
															borderRadius: 0,
															py: 1,
															fontWeight: 800,
															fontSize: 13.5,
															color: '#fff',
															bgcolor: col.bar,
															'&:hover': { bgcolor: col.fg },
														} }
													>
														{ busy[ tk.id ] ? <CircularProgress size={ 16 } color="inherit" /> : col.action }
													</Button>
												</Box>
											);
										} )
									) }
								</Stack>
							</Box>
						);
					} ) }
				</Box>
			) }
		</Box>
	);
}
