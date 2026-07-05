import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Select,
	MenuItem,
	Chip,
	IconButton,
	Button,
	CircularProgress,
	Tooltip,
	ToggleButton,
	ToggleButtonGroup,
	Switch,
	TextField,
	Collapse,
	Divider,
	Snackbar,
	Drawer,
} from '../ui';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArchiveIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveIcon from '@mui/icons-material/UnarchiveOutlined';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TuneIcon from '@mui/icons-material/Tune';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LaunchIcon from '@mui/icons-material/Launch';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { tokens } from '../theme';
import { api } from '../api/client';
import { printDoc, esc } from '../lib/print';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import Card from './ui/Card';
import { ListSkeleton } from './ui/Skeletons';
import PageTour from './PageTour';

// Prominent "how customers order online" panel — the link + QR to share, or a
// one-click create if the ordering page doesn't exist yet. Makes the online
// channel discoverable (the board itself only shows orders once they arrive).
function ShareOrdering() {
	const [ url, setUrl ] = useState( null ); // null = loading, '' = none yet, string = the page URL
	const [ orderingOn, setOrderingOn ] = useState( true );
	const [ qr, setQr ] = useState( '' );
	const [ creating, setCreating ] = useState( false );
	const [ copied, setCopied ] = useState( false );

	useEffect( () => {
		api.getDashboard()
			.then( ( d ) => { setUrl( d.orderPageUrl || '' ); setOrderingOn( !! d.orderingOn ); } )
			.catch( () => setUrl( '' ) );
	}, [] );
	useEffect( () => {
		if ( url ) {
			api.getQr( url ).then( ( r ) => setQr( r.svg ) ).catch( () => {} );
		}
	}, [ url ] );

	const create = () => {
		setCreating( true );
		api.createSetupPage( 'order' )
			.then( ( r ) => setUrl( r.page || '' ) )
			.finally( () => setCreating( false ) );
	};
	const copy = () => {
		if ( url && navigator.clipboard ) {
			navigator.clipboard.writeText( url ).then( () => { setCopied( true ); setTimeout( () => setCopied( false ), 1500 ); } );
		}
	};

	if ( url === null ) {
		return null; // Don't flash while loading.
	}

	return (
		<Card sx={ { mb: 2, p: 2 } }>
			<Stack direction="row" alignItems="center" spacing={ 2 } flexWrap="wrap" useFlexGap>
				<Box sx={ { width: 40, height: 40, borderRadius: '10px', bgcolor: tokens.accentSoft, color: tokens.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }>
					<StorefrontIcon />
				</Box>
				<Box sx={ { flex: 1, minWidth: 220 } }>
					<Typography sx={ { fontWeight: 700, fontSize: 14, color: tokens.ink } }>Your online ordering page</Typography>
					<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>
						Share this link (or the QR) so customers can order takeaway &amp; delivery — orders land on the board below.
					</Typography>
				</Box>
				{ url ? (
					<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap>
						<Box sx={ { maxWidth: 340, minWidth: 0, px: 1.25, py: 0.75, border: `1px solid ${ tokens.border }`, borderRadius: '8px', bgcolor: tokens.soft, fontSize: 12.5, color: tokens.ink2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>
							{ url }
						</Box>
						<Button size="small" variant="outlined" startIcon={ <ContentCopyIcon fontSize="small" /> } onClick={ copy }>
							{ copied ? 'Copied' : 'Copy' }
						</Button>
						<Button size="small" variant="outlined" component="a" href={ url } target="_blank" startIcon={ <LaunchIcon fontSize="small" /> }>
							Preview
						</Button>
						<Tooltip title="Print a QR poster (QR Code screen)">
							<IconButton size="small" onClick={ () => { window.location.hash = '#/qr'; } } sx={ { color: tokens.muted } }>
								<QrCode2Icon />
							</IconButton>
						</Tooltip>
						{ qr && (
							<Box
								sx={ { width: 44, height: 44, '& svg': { width: '100%', height: '100%', display: 'block' } } }
								dangerouslySetInnerHTML={ { __html: qr } }
							/>
						) }
					</Stack>
				) : (
					<Button variant="contained" disabled={ creating } onClick={ create }>
						{ creating ? 'Creating…' : 'Create ordering page' }
					</Button>
				) }
			</Stack>
			{ url && ! orderingOn && (
				<Typography sx={ { mt: 1, fontSize: 12.5, color: tokens.amber, fontWeight: 600 } }>
					⚠ Online ordering is currently off — turn it on via the gear (Ordering settings) so customers can check out.
				</Typography>
			) }
		</Card>
	);
}

const O_STATUS = [
	{ key: 'open', label: 'Open tab', fg: tokens.violet, bg: tokens.violetSoft },
	{ key: 'sent', label: 'Sent to kitchen', fg: tokens.accentDark, bg: tokens.accentSoft },
	{ key: 'new', label: 'New', fg: tokens.accentDark, bg: tokens.accentSoft },
	{ key: 'preparing', label: 'Preparing', fg: tokens.amber, bg: tokens.amberSoft },
	{ key: 'ready', label: 'Ready', fg: tokens.green, bg: tokens.greenSoft },
	{ key: 'out_for_delivery', label: 'Out for delivery', fg: tokens.violet, bg: tokens.violetSoft },
	{ key: 'delivered', label: 'Delivered', fg: tokens.muted, bg: tokens.soft },
	{ key: 'completed', label: 'Completed', fg: tokens.muted, bg: tokens.soft },
	{ key: 'cancelled', label: 'Cancelled', fg: tokens.red, bg: tokens.redSoft },
];
const meta = ( k ) => O_STATUS.find( ( s ) => s.key === k ) || O_STATUS[ 0 ];

// Payment status → label + tint for the card chip.
const PAYMENT = {
	paid: { label: 'Paid', fg: tokens.green, bg: tokens.greenSoft },
	authorized: { label: 'Card held', fg: tokens.amber, bg: tokens.amberSoft },
	pending: { label: 'Awaiting payment', fg: tokens.muted, bg: tokens.soft },
	refunded: { label: 'Refunded', fg: tokens.red, bg: tokens.redSoft },
	released: { label: 'Hold released', fg: tokens.muted, bg: tokens.soft },
	on_collection: { label: 'Pay on collection', fg: tokens.muted2, bg: tokens.soft },
	unpaid: { label: 'Unpaid', fg: tokens.muted2, bg: tokens.soft },
};

// Group orders (already newest-first) under Today / Yesterday / date headings.
const dayLabel = ( iso ) => {
	if ( ! iso ) {
		return 'Earlier';
	}
	const d = new Date( iso );
	const now = new Date();
	const y = new Date( now );
	y.setDate( now.getDate() - 1 );
	const same = ( a, b ) => a.toDateString() === b.toDateString();
	if ( same( d, now ) ) {
		return 'Today';
	}
	if ( same( d, y ) ) {
		return 'Yesterday';
	}
	return d.toLocaleDateString( undefined, { weekday: 'short', day: 'numeric', month: 'short' } );
};
const groupByDay = ( list ) => {
	const groups = [];
	let last = null;
	list.forEach( ( o ) => {
		const label = dayLabel( o.placed );
		if ( ! last || last.label !== label ) {
			last = { label, orders: [] };
			groups.push( last );
		}
		last.orders.push( o );
	} );
	return groups;
};

export default function OrdersView() {
	const [ orders, setOrders ] = useState( [] );
	const [ archived, setArchived ] = useState( null ); // Loaded lazily when the tab opens.
	const [ loading, setLoading ] = useState( true );
	const [ tab, setTab ] = useState( 'active' );
	const [ cur, setCur ] = useState( { symbol: '£', position: 'before' } );
	const [ settingsOpen, setSettingsOpen ] = useState( false );
	const [ adding, setAdding ] = useState( false );
	const [ detail, setDetail ] = useState( null ); // Order shown in the detail drawer.

	useEffect( () => {
		Promise.all( [ api.getOrders(), api.getSettings() ] )
			.then( ( [ list, settings ] ) => {
				setOrders( list || [] );
				setCur( { symbol: settings.currency || '£', position: settings.currencyPosition || 'before' } );
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	useEffect( () => {
		if ( tab === 'archived' && archived === null ) {
			api.getOrders( true ).then( ( list ) => setArchived( list || [] ) );
		}
	}, [ tab, archived ] );

	const money = ( n ) => {
		const v = Number( n || 0 ).toFixed( 2 );
		return cur.position === 'after' ? `${ v }${ cur.symbol }` : `${ cur.symbol }${ v }`;
	};

	const patchLocal = ( id, changes ) =>
		setOrders( ( os ) => os.map( ( o ) => ( o.id === id ? { ...o, ...changes } : o ) ) );

	const setStatus = ( id, status ) => {
		patchLocal( id, { status } );
		api.updateOrder( id, { status } );
	};
	const accept = ( id ) => {
		patchLocal( id, { status: 'preparing' } );
		api.updateOrder( id, { action: 'accept' } ).then( ( o ) => o && patchLocal( id, o ) );
	};
	const reject = ( id ) => {
		patchLocal( id, { status: 'cancelled' } );
		api.updateOrder( id, { action: 'reject' } ).then( ( o ) => o && patchLocal( id, o ) );
	};
	const archive = ( id ) => {
		setOrders( ( os ) => os.filter( ( o ) => o.id !== id ) );
		setArchived( ( a ) => ( a === null ? a : null ) ); // Force reload next time the tab opens.
		api.updateOrder( id, { archived: true } );
	};
	const restore = ( id ) => {
		setArchived( ( a ) => ( a || [] ).filter( ( o ) => o.id !== id ) );
		api.updateOrder( id, { archived: false } ).then( () => api.getOrders().then( ( l ) => setOrders( l || [] ) ) );
	};
	const resend = ( id ) => {
		api.updateOrder( id, { action: 'resend' } ).then( ( o ) => {
			if ( o ) {
				patchLocal( id, o );
				setDetail( ( d ) => ( d && d.id === id ? o : d ) );
			}
		} );
	};

	const filtered = useMemo( () => {
		if ( tab === 'archived' ) {
			return archived || [];
		}
		if ( tab === 'active' ) {
			return orders.filter( ( o ) => [ 'open', 'sent', 'new', 'preparing', 'ready', 'out_for_delivery' ].includes( o.status ) );
		}
		if ( tab === 'done' ) {
			return orders.filter( ( o ) => [ 'completed', 'cancelled', 'delivered' ].includes( o.status ) );
		}
		return orders;
	}, [ orders, archived, tab ] );

	const groups = useMemo( () => groupByDay( filtered ), [ filtered ] );
	const activeCount = orders.filter( ( o ) => [ 'open', 'sent', 'new', 'preparing', 'ready', 'out_for_delivery' ].includes( o.status ) ).length;

	const markPrinted = ( id, station ) => {
		patchLocal( id, { printed: new Date().toISOString() } );
		api.updateOrder( id, { action: 'printed', station } ).then( ( o ) => o && patchLocal( id, o ) );
	};

	// Print a kitchen/bar ticket. `station` = 'kitchen' | 'bar' | 'all'; items are
	// grouped by their prep station so each pass only gets what it makes.
	const printTicket = ( o, station = 'all' ) => {
		const stationOf = ( li ) => ( li.station === 'bar' ? 'bar' : 'kitchen' );
		const wanted = o.items.filter( ( li ) => station === 'all' || stationOf( li ) === station );
		if ( ! wanted.length ) {
			return;
		}
		const line = ( li ) => {
			let s = '<div class="dinekit-row"><span><strong>' + li.qty + '×</strong> ' + esc( li.title ) +
				( li.priceLabel ? ' (' + esc( li.priceLabel ) + ')' : '' ) + '</span></div>';
			const mods = li.chosen.map( ( c ) => c.label ).concat( ( li.removed || [] ).map( ( r ) => 'no ' + r ) );
			if ( mods.length ) {
				s += '<div style="font-size:13px;color:#64748b;padding:2px 0 6px 16px">' + esc( mods.join( ', ' ) ) + '</div>';
			}
			return s;
		};
		let body = '<h1>Order #' + o.number + '</h1>';
		body += '<p class="dinekit-sub">' + esc( o.name ) + ( o.phone ? ' · ' + esc( o.phone ) : '' ) +
			' · ' + ( o.when === 'asap' ? 'ASAP' : esc( o.when ) ) + '</p>';
		const stations = station === 'all' ? [ 'kitchen', 'bar' ] : [ station ];
		stations.forEach( ( st ) => {
			const rows = wanted.filter( ( li ) => stationOf( li ) === st );
			if ( ! rows.length ) {
				return;
			}
			if ( station === 'all' && wanted.some( ( li ) => stationOf( li ) !== st ) ) {
				body += '<h2 style="font-size:15px;text-transform:uppercase;letter-spacing:.06em;margin:14px 0 4px">' + ( st === 'bar' ? 'Bar' : 'Kitchen' ) + '</h2>';
			}
			rows.forEach( ( li ) => { body += line( li ); } );
		} );
		if ( o.notes ) {
			body += '<p class="dinekit-flag">“' + esc( o.notes ) + '”</p>';
		}
		printDoc( 'Order #' + o.number + ( station === 'all' ? '' : ' · ' + station ), body );
		markPrinted( o.id, station );
	};

	if ( loading ) {
		return (
			<Page>
				<PageHeader
					title="Orders"
					subtitle="Commission-free takeaway orders from your own site — you keep 100%."
				/>
				<ListSkeleton rows={ 5 } />
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title="Orders"
				subtitle="Takeaway, collection & delivery — from your online page or taken by phone. You keep 100%, no commission."
				actions={
					<>
						<Chip
							icon={ <ReceiptLongIcon sx={ { fontSize: 14 } } /> }
							label={ `${ activeCount } active` }
							size="small"
							sx={ { height: 22, fontSize: 12, bgcolor: activeCount ? tokens.accentSoft : tokens.soft, color: activeCount ? tokens.accentDark : tokens.muted, fontWeight: 600 } }
						/>
						<Tooltip title="Ordering settings & the public page">
							<IconButton
								onClick={ () => setSettingsOpen( ( v ) => ! v ) }
								sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, color: settingsOpen ? tokens.accent : tokens.muted } }
							>
								<TuneIcon />
							</IconButton>
						</Tooltip>
						<Button variant="contained" startIcon={ <AddIcon /> } onClick={ () => setAdding( ( v ) => ! v ) }>
							New order
						</Button>
					</>
				}
			/>

			<PageTour
				id="orders"
				title="Commission-free takeaway orders"
				points={ [
					'Orders from your site land here live; move them New → Preparing → Ready → Completed.',
					'“New order” takes a phone/walk-in order; print a kitchen ticket from each card.',
					'The gear opens ordering settings & the public order page. You keep 100% — no commission.',
				] }
			/>

			<ShareOrdering />

			<Collapse in={ settingsOpen } unmountOnExit>
				<OrderSettings />
			</Collapse>

			<Collapse in={ adding } unmountOnExit>
				<NewOrder
					money={ money }
					onCancel={ () => setAdding( false ) }
					onCreated={ ( order ) => { setOrders( ( os ) => [ order, ...os ] ); setAdding( false ); setTab( 'active' ); } }
				/>
			</Collapse>

			<ToggleButtonGroup size="small" exclusive value={ tab } onChange={ ( e, v ) => v && setTab( v ) } sx={ { mb: 2 } }>
				<ToggleButton value="active">Active</ToggleButton>
				<ToggleButton value="done">Completed</ToggleButton>
				<ToggleButton value="all">All</ToggleButton>
				<ToggleButton value="archived">Archived</ToggleButton>
			</ToggleButtonGroup>

			{ filtered.length === 0 ? (
				<EmptyState
					icon={ <ReceiptLongIcon /> }
					title={ tab === 'archived' ? 'Nothing archived' : 'No orders here' }
					description={ tab === 'archived' ? 'Archived orders are kept here as a permanent record.' : 'Orders placed on your site land here in real time.' }
				/>
			) : (
				<Stack spacing={ 3 }>
					{ groups.map( ( g ) => (
						<Box key={ g.label }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.muted2, mb: 1 } }>
								{ g.label } · { g.orders.length }
							</Typography>
							<Stack spacing={ 1.5 }>
								{ g.orders.map( ( o ) => {
									const m = meta( o.status );
									const pay = PAYMENT[ o.payment ] || null;
									const isNew = o.status === 'new';
									return (
										<Card key={ o.id } hover sx={ { p: 2, ...( isNew ? { borderColor: tokens.accent, boxShadow: `0 0 0 1px ${ tokens.accent }22` } : {} ) } }>
											<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 1 } }>
												<Typography sx={ { fontWeight: 650, fontSize: 15, fontVariantNumeric: 'tabular-nums' } }>#{ o.number }</Typography>
												<Typography sx={ { fontSize: 13, color: tokens.muted } } noWrap>
													{ o.name }{ o.phone ? ` · ${ o.phone }` : '' } · { o.when === 'asap' ? 'ASAP' : o.when }
												</Typography>
												{ pay && (
													<Chip label={ pay.label } size="small" sx={ { height: 20, fontSize: 11, fontWeight: 600, color: pay.fg, bgcolor: pay.bg } } />
												) }
												{ o.printed && (
													<Chip label="Printed" size="small" sx={ { height: 20, fontSize: 11, fontWeight: 600, color: tokens.muted, bgcolor: tokens.soft } } />
												) }
												{ o.fulfilment === 'delivery' && o.channel !== 'dine_in' && (
													<Chip label="Delivery" size="small" sx={ { height: 20, fontSize: 11, fontWeight: 700, color: tokens.violet, bgcolor: tokens.violetSoft } } />
												) }
												{ o.channel === 'dine_in' && (
													<Chip label={ o.table ? `Dine-in · ${ o.table }` : 'Dine-in' } size="small" sx={ { height: 20, fontSize: 11, fontWeight: 700, color: tokens.accentDark, bgcolor: tokens.accentSoft } } />
												) }
												<Box sx={ { flex: 1 } } />
												<Typography sx={ { fontWeight: 650, fontVariantNumeric: 'tabular-nums', textAlign: 'right' } }>{ money( o.total ) }</Typography>
												{ tab !== 'archived' && (
													<Select
														value={ o.status }
														onChange={ ( e ) => setStatus( o.id, e.target.value ) }
														size="small"
														renderValue={ ( v ) => {
															const sm = meta( v );
															return (
																<Stack direction="row" spacing={ 0.75 } alignItems="center" component="span">
																	<Box component="span" sx={ { width: 7, height: 7, borderRadius: '50%', bgcolor: sm.fg, flexShrink: 0 } } />
																	{ sm.label }
																</Stack>
															);
														} }
														sx={ { minWidth: 130, fontWeight: 600, fontSize: 13, color: m.fg, bgcolor: m.bg, borderRadius: '8px', '& fieldset': { border: 'none' } } }
													>
														{ O_STATUS.map( ( s ) => (
															<MenuItem key={ s.key } value={ s.key } sx={ { fontSize: 13, fontWeight: 600 } }>
																<Box component="span" sx={ { width: 7, height: 7, borderRadius: '50%', bgcolor: s.fg, display: 'inline-block', mr: 1, flexShrink: 0 } } />
																{ s.label }
															</MenuItem>
														) ) }
													</Select>
												) }
												<Tooltip title="Details">
													<IconButton size="small" onClick={ () => setDetail( o ) } sx={ { color: tokens.muted } }><InfoOutlinedIcon fontSize="small" /></IconButton>
												</Tooltip>
												<Tooltip title="Print ticket">
													<IconButton size="small" onClick={ () => printTicket( o ) } sx={ { color: tokens.muted } }><PrintIcon fontSize="small" /></IconButton>
												</Tooltip>
												{ tab === 'archived' ? (
													<Tooltip title="Restore from archive">
														<IconButton size="small" onClick={ () => restore( o.id ) } sx={ { color: tokens.muted } }><UnarchiveIcon fontSize="small" /></IconButton>
													</Tooltip>
												) : (
													<Tooltip title="Archive (kept on record)">
														<IconButton size="small" onClick={ () => archive( o.id ) } sx={ { color: tokens.muted2 } }><ArchiveIcon fontSize="small" /></IconButton>
													</Tooltip>
												) }
											</Stack>

											{ isNew && tab !== 'archived' && (
												<Stack direction="row" spacing={ 1 } sx={ { mb: 1.25 } }>
													<Button size="small" variant="contained" onClick={ () => accept( o.id ) } sx={ { py: 0.4 } }>Accept</Button>
													<Button size="small" variant="outlined" color="error" onClick={ () => reject( o.id ) } sx={ { py: 0.4 } }>Reject</Button>
												</Stack>
											) }

											<Typography sx={ { fontSize: 12.5, color: tokens.muted, lineHeight: 1.6 } }>
												{ o.items.map( ( li ) => {
													const extra = [ li.priceLabel ]
														.concat( li.chosen.map( ( c ) => c.label ) )
														.concat( ( li.removed || [] ).map( ( r ) => `no ${ r }` ) )
														.filter( Boolean );
													return `${ li.qty }× ${ li.title }${ extra.length ? ` (${ extra.join( ', ' ) })` : '' }`;
												} ).join( '  ·  ' ) }
											</Typography>
											{ o.fulfilment === 'delivery' && o.address && <Typography sx={ { fontSize: 12.5, color: tokens.violet, mt: 0.5, fontWeight: 600 } }>🛵 { o.address }</Typography> }
											{ o.notes && <Typography sx={ { fontSize: 12.5, color: tokens.ink2, mt: 0.5, fontStyle: 'italic' } }>“{ o.notes }”</Typography> }
										</Card>
									);
								} ) }
							</Stack>
						</Box>
					) ) }
				</Stack>
			) }
			<Drawer anchor="right" open={ !! detail } onClose={ () => setDetail( null ) } disableEnforceFocus sx={ { zIndex: 100000 } } PaperProps={ { sx: { width: { xs: '100%', sm: 460 } } } }>
				{ detail && <OrderDetail order={ detail } money={ money } onClose={ () => setDetail( null ) } onResend={ () => resend( detail.id ) } onCancel={ () => { reject( detail.id ); setDetail( null ); } } onPrint={ ( st ) => printTicket( detail, st ) } /> }
			</Drawer>
		</Page>
	);
}

// Staff order builder — phone/walk-in orders. Amount is recomputed server-side.
function NewOrder( { money, onCreated, onCancel } ) {
	const [ menu, setMenu ] = useState( [] );
	const [ lines, setLines ] = useState( [] );
	const [ pick, setPick ] = useState( '' );
	const [ name, setName ] = useState( '' );
	const [ phone, setPhone ] = useState( '' );
	const [ notes, setNotes ] = useState( '' );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		api.getState().then( ( s ) => {
			// Only items with at least one price are orderable.
			const priced = ( s.items || [] )
				.filter( ( it ) => ( it.prices || [] ).length > 0 && it.title )
				.map( ( it ) => ( { id: it.id, title: it.title, unit: Number( it.prices[ 0 ].amount ) || 0 } ) );
			setMenu( priced );
		} );
	}, [] );

	const addLine = ( id ) => {
		const it = menu.find( ( m ) => m.id === id );
		if ( ! it ) {
			return;
		}
		setLines( ( ls ) => {
			const existing = ls.find( ( l ) => l.id === id );
			return existing
				? ls.map( ( l ) => ( l.id === id ? { ...l, qty: l.qty + 1 } : l ) )
				: [ ...ls, { id, title: it.title, unit: it.unit, qty: 1 } ];
		} );
		setPick( '' );
	};
	const setQty = ( id, d ) => setLines( ( ls ) => ls.map( ( l ) => ( l.id === id ? { ...l, qty: Math.max( 1, l.qty + d ) } : l ) ).filter( ( l ) => l.qty > 0 ) );
	const removeLine = ( id ) => setLines( ( ls ) => ls.filter( ( l ) => l.id !== id ) );
	const total = lines.reduce( ( s, l ) => s + l.unit * l.qty, 0 );

	const create = async () => {
		if ( ! lines.length ) {
			setError( 'Add at least one item.' );
			return;
		}
		setSaving( true );
		setError( '' );
		try {
			const order = await api.createOrder( {
				items: lines.map( ( l ) => ( { itemId: l.id, qty: l.qty } ) ),
				name,
				phone,
				notes,
				when: 'asap',
				payment: 'unpaid',
			} );
			onCreated( order );
		} catch ( e ) {
			setError( e.message || 'Could not create the order.' );
		} finally {
			setSaving( false );
		}
	};

	return (
		<Card sx={ { p: 2.5, mb: 2 } }>
			<Typography variant="subtitle2" sx={ { color: tokens.ink, mb: 1.5 } }>New order (phone / walk-in)</Typography>
			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mb: 1.5 } }>
				<Select
					size="small"
					displayEmpty
					value={ pick }
					onChange={ ( e ) => addLine( e.target.value ) }
					sx={ { minWidth: 260 } }
					renderValue={ () => 'Add an item…' }
				>
					{ menu.length === 0 && <MenuItem value="" disabled>No priced items yet</MenuItem> }
					{ menu.map( ( m ) => (
						<MenuItem key={ m.id } value={ m.id }>{ m.title } · { money( m.unit ) }</MenuItem>
					) ) }
				</Select>
				<TextField size="small" label="Customer name" value={ name } onChange={ ( e ) => setName( e.target.value ) } sx={ { width: 200 } } />
				<TextField size="small" label="Phone" value={ phone } onChange={ ( e ) => setPhone( e.target.value ) } sx={ { width: 160 } } />
			</Stack>

			{ lines.length > 0 && (
				<Stack spacing={ 0.75 } sx={ { mb: 1.5 } }>
					{ lines.map( ( l ) => (
						<Stack key={ l.id } direction="row" alignItems="center" spacing={ 1 } sx={ { bgcolor: tokens.soft, borderRadius: 2, px: 1.5, py: 0.75 } }>
							<Typography sx={ { flex: 1, fontSize: 14 } }>{ l.title }</Typography>
							<IconButton size="small" onClick={ () => setQty( l.id, -1 ) }>−</IconButton>
							<Typography sx={ { width: 24, textAlign: 'center', fontWeight: 700 } }>{ l.qty }</Typography>
							<IconButton size="small" onClick={ () => setQty( l.id, 1 ) }>+</IconButton>
							<Typography sx={ { width: 70, textAlign: 'right', fontWeight: 650 } }>{ money( l.unit * l.qty ) }</Typography>
							<IconButton size="small" onClick={ () => removeLine( l.id ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
						</Stack>
					) ) }
				</Stack>
			) }

			<TextField size="small" fullWidth label="Notes (optional)" value={ notes } onChange={ ( e ) => setNotes( e.target.value ) } sx={ { mb: 1.5 } } />
			{ error && <Typography sx={ { color: tokens.red, fontSize: 13, mb: 1 } }>{ error }</Typography> }
			<Stack direction="row" alignItems="center" spacing={ 2 }>
				<Typography sx={ { fontWeight: 700, fontSize: 16 } }>Total: { money( total ) }</Typography>
				<Box sx={ { flex: 1 } } />
				<Button onClick={ onCancel } sx={ { color: tokens.muted } }>Cancel</Button>
				<Button variant="contained" onClick={ create } disabled={ saving || lines.length === 0 }>
					{ saving ? 'Creating…' : 'Create order' }
				</Button>
			</Stack>
		</Card>
	);
}

function OrderSettings() {
	const [ cfg, setCfg ] = useState( null );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ copied, setCopied ] = useState( false );
	const debounce = useRef( null );

	useEffect( () => {
		api.getOrderSettings().then( setCfg );
	}, [] );

	const patch = ( p ) => {
		const next = { ...cfg, ...p };
		setCfg( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveOrderSettings( next ).then( () => setSaveState( 'saved' ) ).catch( () => setSaveState( 'error' ) );
		}, 500 );
	};

	if ( ! cfg ) {
		return <Box sx={ { display: 'flex', justifyContent: 'center', py: 3 } }><CircularProgress size={ 22 } /></Box>;
	}

	const copyShortcode = () => {
		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( '[dinekit_order]' ).then( () => setCopied( true ) );
		}
	};

	return (
		<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2.5, mb: 2 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<Typography variant="subtitle2" sx={ { color: tokens.ink } }>Ordering settings</Typography>
				<Typography sx={ { fontSize: 12, color: tokens.muted, minWidth: 50 } }>
					{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
				</Typography>
			</Stack>

			<Stack direction="row" spacing={ 3 } flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.enabled } onChange={ ( e ) => patch( { enabled: e.target.checked } ) } />
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Accept online orders</Typography>
				</Stack>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.emails_enabled } onChange={ ( e ) => patch( { emails_enabled: e.target.checked } ) } />
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Email notifications</Typography>
				</Stack>
				<Tooltip title="On: orders go straight to the kitchen. Off: you accept or reject each order first (recommended when a card is held)." placement="top">
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<Switch checked={ !! cfg.auto_accept } onChange={ ( e ) => patch( { auto_accept: e.target.checked } ) } />
						<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Auto-accept orders</Typography>
					</Stack>
				</Tooltip>
				<Tooltip title="Off: table-QR orders join the table's tab and are paid at the end. On: guests pay by card upfront each time." placement="top">
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<Switch checked={ !! cfg.table_qr_pay } onChange={ ( e ) => patch( { table_qr_pay: e.target.checked } ) } />
						<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Table QR: pay upfront</Typography>
					</Stack>
				</Tooltip>
			</Stack>

			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				<TextField
					label="Prep time (min)" type="number" size="small"
					value={ cfg.prep_mins }
					onChange={ ( e ) => patch( { prep_mins: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) }
					helperText="Earliest collection"
					sx={ { width: 150 } }
				/>
				<TextField
					label="Min order" type="number" size="small"
					value={ cfg.min_order }
					onChange={ ( e ) => patch( { min_order: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) }
					helperText="0 = none"
					sx={ { width: 130 } }
				/>
				<TextField
					label="Kitchen email" type="email" size="small"
					placeholder="Defaults to site admin"
					value={ cfg.notify_email }
					onChange={ ( e ) => patch( { notify_email: e.target.value } ) }
					sx={ { width: 240 } }
				/>
			</Stack>

			<Divider sx={ { my: 2 } } />
			<Typography sx={ { fontSize: 14, fontWeight: 700, mb: 0.5 } }>Kitchen printer</Typography>
			<Typography sx={ { fontSize: 12.5, color: tokens.muted2, mb: 1.5 } }>
				Auto-print tickets to a network thermal printer with its own email address. When an order is accepted (or auto-accepted), DineKit emails a plain ticket the printer prints itself — no computer needed. Works with email-to-print printers such as <strong>Epson TM-m30 (Epson Connect)</strong> or <strong>Star mC-Print</strong>; find the printer’s address in its Epson Connect / Star CloudPRNT setup.
			</Typography>
			<TextField
				label="Printer email" type="email" size="small"
				placeholder="e.g. abc123@print.epsonconnect.com"
				value={ cfg.printer_email || '' }
				onChange={ ( e ) => patch( { printer_email: e.target.value } ) }
				helperText="Leave blank to print manually from the order card."
				sx={ { width: 320 } }
			/>

			<Divider sx={ { my: 2 } } />
			<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: cfg.delivery_enabled ? 1.5 : 0 } }>
				<Switch checked={ !! cfg.delivery_enabled } onChange={ ( e ) => patch( { delivery_enabled: e.target.checked } ) } />
				<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Offer delivery</Typography>
				<Typography sx={ { fontSize: 12.5, color: tokens.muted2 } }>Diners choose collection or delivery at checkout (no live tracking yet).</Typography>
			</Stack>
			{ cfg.delivery_enabled && (
				<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
					<TextField label="Delivery fee" type="number" size="small" value={ cfg.delivery_fee } onChange={ ( e ) => patch( { delivery_fee: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) } sx={ { width: 130 } } />
					<TextField label="Delivery min" type="number" size="small" value={ cfg.delivery_min } onChange={ ( e ) => patch( { delivery_min: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) } helperText="0 = none" sx={ { width: 130 } } />
					<TextField label="Delivery time (min)" type="number" size="small" value={ cfg.delivery_mins } onChange={ ( e ) => patch( { delivery_mins: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) } sx={ { width: 150 } } />
					<TextField label="Delivery area (note)" size="small" placeholder="e.g. within 3 miles" value={ cfg.delivery_area } onChange={ ( e ) => patch( { delivery_area: e.target.value } ) } sx={ { width: 240 } } />
				</Stack>
			) }

			<Divider sx={ { my: 2 } } />
			<Stack direction="row" alignItems="center" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				<Typography sx={ { fontSize: 13, color: tokens.muted } }>
					Add the ordering page anywhere with this shortcode:
				</Typography>
				<Chip
					label="[dinekit_order]"
					onClick={ copyShortcode }
					onDelete={ copyShortcode }
					deleteIcon={ <ContentCopyIcon /> }
					sx={ { fontFamily: 'monospace', fontWeight: 600, bgcolor: tokens.soft } }
				/>
			</Stack>
			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
				Card payment runs on your own Stripe (0% commission) — connect it in Integrations. With
				auto-accept off, a customer's card is held and only charged when you accept.
			</Typography>
			<Snackbar open={ copied } autoHideDuration={ 1800 } onClose={ () => setCopied( false ) } message="Shortcode copied" anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } } />
		</Box>
	);
}

function DSection( { title, action, children } ) {
	return (
		<Box sx={ { mb: 2.5 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 0.75 } }>
				<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted2 } }>{ title }</Typography>
				{ action || null }
			</Stack>
			{ children }
		</Box>
	);
}

function DRow( { label, value, mono } ) {
	return (
		<Stack direction="row" justifyContent="space-between" sx={ { py: 0.25 } }>
			<Typography sx={ { color: tokens.muted, fontSize: 13.5 } }>{ label }</Typography>
			<Typography sx={ { color: tokens.ink, fontSize: 13.5, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all', textAlign: 'right', ml: 2 } }>{ value }</Typography>
		</Stack>
	);
}

// Full order detail: customer, items, payment (+Stripe id), receipt email log
// with resend, and the status/payment history trail.
function OrderDetail( { order, money, onClose, onResend, onCancel, onPrint } ) {
	const m = O_STATUS.find( ( s ) => s.key === order.status ) || O_STATUS[ 0 ];
	const pay = PAYMENT[ order.payment ];
	const fmt = ( iso ) => { try { return new Date( iso ).toLocaleString(); } catch ( e ) { return iso; } };
	const hasBar = ( order.items || [] ).some( ( li ) => li.station === 'bar' );
	const hasKitchen = ( order.items || [] ).some( ( li ) => li.station !== 'bar' );
	// Manager override: cancel + refund/release even after an order was accepted.
	const canCancel = ! [ 'cancelled', 'completed' ].includes( order.status );
	const refundable = [ 'paid', 'authorized', 'pending' ].includes( order.payment );
	return (
		<Box sx={ { p: 3 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<Typography variant="h6" sx={ { fontSize: 18 } }>Order #{ order.number }</Typography>
				<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
			</Stack>
			<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } }>
				<Chip label={ m.label } size="small" sx={ { fontWeight: 600, color: m.fg, bgcolor: m.bg } } />
				{ pay && <Chip label={ pay.label } size="small" sx={ { fontWeight: 600, color: pay.fg, bgcolor: pay.bg } } /> }
			</Stack>

			{ canCancel && (
				<Button
					size="small"
					variant="outlined"
					color="error"
					onClick={ () => {
						if ( window.confirm( refundable ? 'Cancel this order and refund/release the payment?' : 'Cancel this order?' ) ) {
							onCancel();
						}
					} }
					sx={ { mb: 2 } }
				>
					{ refundable ? 'Cancel & refund' : 'Cancel order' }
				</Button>
			) }

			{ order.refundDue && (
				<Box sx={ { mb: 2, p: 1.5, borderRadius: 2, bgcolor: tokens.redSoft } }>
					<Typography sx={ { fontSize: 13, color: tokens.red, fontWeight: 600 } }>A refund is owed but could not be processed automatically — refund the customer in Stripe.</Typography>
				</Box>
			) }

			<DSection title="Customer">
				<DRow label="Name" value={ order.name || '—' } />
				{ order.phone && <DRow label="Phone" value={ order.phone } /> }
				{ order.email && <DRow label="Email" value={ order.email } /> }
				<DRow label="Collection" value={ order.when === 'asap' ? 'ASAP' : order.when } />
				{ order.source && <DRow label="Source" value={ order.source } /> }
			</DSection>

			<DSection title="Items">
				<Stack spacing={ 0.75 }>
					{ order.items.map( ( li, i ) => {
						const extra = [ li.priceLabel ].concat( ( li.chosen || [] ).map( ( c ) => c.label ) ).concat( ( li.removed || [] ).map( ( r ) => `no ${ r }` ) ).filter( Boolean );
						return (
							<Stack key={ i } direction="row" justifyContent="space-between" spacing={ 2 }>
								<Typography sx={ { fontSize: 13.5 } }>{ li.qty }× { li.title }{ extra.length ? ` (${ extra.join( ', ' ) })` : '' }</Typography>
								<Typography sx={ { fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap' } }>{ money( li.lineTotal ) }</Typography>
							</Stack>
						);
					} ) }
					<Divider sx={ { my: 0.5 } } />
					<Stack direction="row" justifyContent="space-between" sx={ { fontWeight: 700 } }>
						<span>Total</span><span>{ money( order.total ) }</span>
					</Stack>
				</Stack>
			</DSection>

			{ order.notes && (
				<DSection title="Notes">
					<Typography sx={ { fontSize: 13, fontStyle: 'italic', color: tokens.ink2 } }>“{ order.notes }”</Typography>
				</DSection>
			) }

			<DSection title="Payment">
				<DRow label="Status" value={ pay ? pay.label : ( order.payment || '—' ) } />
				{ order.pi && (
					<DRow
						label="Stripe"
						mono
						value={
							<Box
								component="a"
								href={ `https://dashboard.stripe.com/${ api.config.stripeMode === 'live' ? '' : 'test/' }payments/${ order.pi }` }
								target="_blank"
								rel="noopener"
								sx={ { color: tokens.accent, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } } }
							>
								{ order.pi } ↗
							</Box>
						}
					/>
				) }
			</DSection>

			<DSection title="Tickets">
				<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
					<Button size="small" variant="outlined" onClick={ () => onPrint( 'all' ) }>Print ticket</Button>
					{ hasKitchen && hasBar && <Button size="small" variant="outlined" onClick={ () => onPrint( 'kitchen' ) }>Kitchen only</Button> }
					{ hasBar && <Button size="small" variant="outlined" onClick={ () => onPrint( 'bar' ) }>Bar only</Button> }
				</Stack>
				{ order.printed && <Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 0.75 } }>Last printed { fmt( order.printed ) }</Typography> }
			</DSection>

			<DSection title="Receipt email" action={ order.email ? <Button size="small" startIcon={ <ReplayIcon /> } onClick={ onResend }>Resend</Button> : null }>
				{ ( order.emailLog || [] ).length === 0 ? (
					<Typography sx={ { fontSize: 13, color: tokens.muted } }>No emails sent yet.</Typography>
				) : (
					<Stack spacing={ 0.5 }>
						{ order.emailLog.map( ( e, i ) => (
							<Stack key={ i } direction="row" alignItems="center" spacing={ 1 } sx={ { color: tokens.muted } }>
								{ e.ok ? <CheckCircleIcon sx={ { fontSize: 15, color: tokens.green } } /> : <ErrorOutlineIcon sx={ { fontSize: 15, color: tokens.red } } /> }
								<Typography sx={ { fontSize: 12.5 } }>{ e.type } → { e.to || '—' }</Typography>
								<Box sx={ { flex: 1 } } />
								<Typography sx={ { fontSize: 12 } }>{ fmt( e.t ) }</Typography>
							</Stack>
						) ) }
					</Stack>
				) }
			</DSection>

			<DSection title="History">
				<Stack spacing={ 0.5 }>
					{ ( order.history || [] ).map( ( h, i ) => (
						<Stack key={ i } direction="row" spacing={ 1 }>
							<Typography sx={ { color: tokens.muted2, minWidth: 130, fontSize: 12 } }>{ fmt( h.t ) }</Typography>
							<Typography sx={ { color: tokens.ink2, fontSize: 12.5 } }>{ h.e }</Typography>
						</Stack>
					) ) }
				</Stack>
			</DSection>
		</Box>
	);
}
