import React, { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog';
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
	Checkbox,
	Modal,
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
import { copyToClipboard } from '../lib/clipboard';
import { api } from '../api/client';
import { useSyncRevision } from '../lib/useSync';
import { useToast } from './Toast';
import { printDoc, esc } from '../lib/print';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import Card from './ui/Card';
import { ListSkeleton } from './ui/Skeletons';
import PageTour from './PageTour';
import useHashTab from '../lib/useHashTab';

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
		if ( url ) {
			copyToClipboard( url ).then( () => { setCopied( true ); setTimeout( () => setCopied( false ), 1500 ); } );
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
	part_refunded: { label: 'Part-refunded', fg: tokens.amber, bg: tokens.amberSoft },
	released: { label: 'Hold released', fg: tokens.muted, bg: tokens.soft },
	on_collection: { label: 'Pay on collection', fg: tokens.muted2, bg: tokens.soft },
	unpaid: { label: 'Unpaid', fg: tokens.muted2, bg: tokens.soft },
};

// Group orders (already newest-first) under Today / Yesterday / date headings.
const todayIso = () => {
	const d = new Date();
	const p = ( n ) => ( n < 10 ? '0' : '' ) + n;
	return d.getFullYear() + '-' + p( d.getMonth() + 1 ) + '-' + p( d.getDate() );
};
// "Sat 2 Aug" for a scheduled pre-order's day.
const fmtWhenDate = ( iso ) => new Date( iso + 'T12:00:00' ).toLocaleDateString( undefined, { weekday: 'short', day: 'numeric', month: 'short' } );

// Where an order came from — one stream, clear provenance. Keys line up with
// the server's source/channel stamps (online checkout, table QR, till tab,
// staff-entered phone/counter order).
const CHANNELS = [
	{ key: 'online', label: '🌐 Online', chip: 'Online', fg: '#4f46e5', bg: '#eef2ff' },
	{ key: 'qr', label: '📱 QR table', chip: 'QR table', fg: '#0369a1', bg: '#e0f2fe' },
	{ key: 'till', label: '🍽 Till tabs', chip: 'Till', fg: '#92400e', bg: '#fef3c7' },
	{ key: 'phone', label: '📞 Phone / counter', chip: 'Phone', fg: '#065f46', bg: '#d1fae5' },
];
const orderChannel = ( o ) => {
	if ( o.source === 'online' ) {
		return 'online';
	}
	if ( o.source === 'qr' ) {
		return 'qr';
	}
	if ( o.channel === 'dine_in' ) {
		return 'till';
	}
	return 'phone';
};
const channelMeta = ( key ) => CHANNELS.find( ( c ) => c.key === key );

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
	// Pre-orders live under the day the KITCHEN needs them, not the day they
	// were placed — a "for tomorrow" order sitting inside "Today · 10" is how
	// something gets cooked a day early in a rush. Future days get their own
	// unmissable "📅 Scheduled — …" groups pinned on top (soonest first); on
	// its actual day a pre-order flows into "Today" like any other order.
	const today = todayIso();
	const scheduled = {};
	const groups = [];
	let last = null;
	list.forEach( ( o ) => {
		if ( o.whenDate && o.whenDate > today ) {
			( scheduled[ o.whenDate ] = scheduled[ o.whenDate ] || [] ).push( o );
			return;
		}
		const label = dayLabel( o.whenDate === today ? o.whenDate + 'T12:00:00' : o.placed );
		if ( ! last || last.label !== label ) {
			last = { label, orders: [] };
			groups.push( last );
		}
		last.orders.push( o );
	} );
	const tmr = ( () => {
		const d = new Date( today + 'T12:00:00' );
		d.setDate( d.getDate() + 1 );
		const p = ( n ) => ( n < 10 ? '0' : '' ) + n;
		return d.getFullYear() + '-' + p( d.getMonth() + 1 ) + '-' + p( d.getDate() );
	} )();
	const future = Object.keys( scheduled ).sort().map( ( iso ) => ( {
		label: `📅 Scheduled — ${ iso === tmr ? 'tomorrow' : fmtWhenDate( iso ) }`,
		scheduled: true,
		orders: scheduled[ iso ].sort( ( a, b ) => ( a.when || '' ) < ( b.when || '' ) ? -1 : 1 ),
	} ) );
	return [ ...future, ...groups ];
};

export default function OrdersView() {
	const [ orders, setOrders ] = useState( [] );
	const [ archived, setArchived ] = useState( null ); // Loaded lazily when the tab opens.
	const [ loading, setLoading ] = useState( true );
	const [ tab, setTab ] = useHashTab( 'orders', [ 'active', 'done', 'all', 'archived' ], 'active' ); // URL-backed so refresh keeps the tab
	const [ cur, setCur ] = useState( { symbol: '£', position: 'before' } );
	const [ settingsOpen, setSettingsOpen ] = useState( false );
	const [ adding, setAdding ] = useState( false );
	const [ detail, setDetail ] = useState( null ); // Order shown in the detail drawer.

	const toast = useToast();
	const knownIds = useRef( null ); // ids seen so far — announces genuinely NEW arrivals

	useEffect( () => {
		Promise.all( [ api.getOrders(), api.getSettings() ] )
			.then( ( [ list, settings ] ) => {
				setOrders( list || [] );
				knownIds.current = new Set( ( list || [] ).map( ( o ) => o.id ) );
				setCur( { symbol: settings.currency || '£', position: settings.currencyPosition || 'before' } );
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	// LIVE board: the sync heartbeat says "orders changed somewhere" → refetch,
	// and announce anything genuinely new so the person watching doesn't have
	// to spot a list getting longer.
	const ordersRev = useSyncRevision( 'orders' );
	useEffect( () => {
		if ( ordersRev === 0 || knownIds.current === null ) {
			return; // First load handles itself.
		}
		api.getOrders().then( ( list ) => {
			const next = list || [];
			const fresh = next.filter( ( o ) => ! knownIds.current.has( o.id ) );
			setOrders( next );
			knownIds.current = new Set( next.map( ( o ) => o.id ) );
			fresh.slice( 0, 3 ).forEach( ( o ) => {
				const cm = channelMeta( orderChannel( o ) );
				toast.info(
					`New ${ cm ? cm.chip.toLowerCase() : '' } order #${ o.number }`,
					o.whenDate ? `Pre-order for ${ fmtWhenDate( o.whenDate ) } · ${ o.when }` : ( o.items || [] ).length + ' item' + ( ( o.items || [] ).length === 1 ? '' : 's' )
				);
			} );
		} ).catch( () => {} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ ordersRev ] );

	// The browser tab itself reports the live workload — a glance at a
	// background tab answers "anything waiting?".
	const activeForTitle = orders.filter( ( o ) => [ 'new', 'preparing', 'ready' ].includes( o.status ) ).length;
	useEffect( () => {
		const base = document.title.replace( /^\(\d+\)\s*/, '' );
		document.title = activeForTitle > 0 ? `(${ activeForTitle }) ${ base }` : base;
		return () => { document.title = document.title.replace( /^\(\d+\)\s*/, '' ); };
	}, [ activeForTitle ] );

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
	const refund = ( id, lines ) => {
		const body = lines && lines.length ? { action: 'refund', lines } : { action: 'refund' };
		api.updateOrder( id, body ).then( ( o ) => o && patchLocal( id, o ) );
	};

	// History tabs are day-scoped: Completed/All/Archived would otherwise grow
	// into an endless scroll. Active is never scoped — live work is live work.
	// Defaults: All opens on yesterday (today's story lives in Active +
	// Completed), Completed/Archived on today. 'all' = no day filter.
	const isoDayOffset = ( n ) => {
		const d = new Date();
		d.setDate( d.getDate() + n );
		const p = ( x ) => ( x < 10 ? '0' : '' ) + x;
		return d.getFullYear() + '-' + p( d.getMonth() + 1 ) + '-' + p( d.getDate() );
	};
	const [ dayFilter, setDayFilter ] = useState( { done: isoDayOffset( 0 ), all: isoDayOffset( -1 ), archived: isoDayOffset( 0 ) } );
	const dayScoped = [ 'done', 'all', 'archived' ].includes( tab );
	const curDay = dayFilter[ tab ];
	const setDay = ( v ) => setDayFilter( ( f ) => ( { ...f, [ tab ]: v } ) );
	const stepDay = ( n ) => {
		const base = curDay && curDay !== 'all' ? curDay : isoDayOffset( 0 );
		const d = new Date( base + 'T12:00:00' );
		d.setDate( d.getDate() + n );
		const p = ( x ) => ( x < 10 ? '0' : '' ) + x;
		setDay( d.getFullYear() + '-' + p( d.getMonth() + 1 ) + '-' + p( d.getDate() ) );
	};
	// The day an order belongs to on the board: its scheduled day when it has
	// one, else the day it was placed — matches the group headings.
	const effectiveDay = ( o ) => o.whenDate || String( o.placed || '' ).slice( 0, 10 );

	// Channel focus: one stream stays one stream, but "just the website
	// orders" is one tap. Remembered per device (a front-desk tablet can live
	// on Online while the till lives on All).
	const [ channel, setChannel ] = useState( () => {
		try {
			return window.localStorage.getItem( 'dinekit_orders_channel' ) || 'all';
		} catch ( e ) {
			return 'all';
		}
	} );
	const pickChannel = ( v ) => {
		setChannel( v );
		try {
			window.localStorage.setItem( 'dinekit_orders_channel', v );
		} catch ( e ) { /* private mode — fine, just not remembered */ }
	};

	const filtered = useMemo( () => {
		let list;
		if ( tab === 'archived' ) {
			list = archived || [];
		} else if ( tab === 'active' ) {
			list = orders.filter( ( o ) => [ 'open', 'sent', 'new', 'preparing', 'ready', 'out_for_delivery' ].includes( o.status ) );
		} else if ( tab === 'done' ) {
			list = orders.filter( ( o ) => [ 'completed', 'cancelled', 'delivered' ].includes( o.status ) );
		} else {
			list = orders;
		}
		if ( dayScoped && curDay && curDay !== 'all' ) {
			list = list.filter( ( o ) => effectiveDay( o ) === curDay );
		}
		return channel === 'all' ? list : list.filter( ( o ) => orderChannel( o ) === channel );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ orders, archived, tab, channel, dayScoped, curDay ] );

	// Live per-channel counts for the current status tab (pre-channel-filter).
	const channelCounts = useMemo( () => {
		const base = tab === 'archived' ? ( archived || [] )
			: tab === 'active' ? orders.filter( ( o ) => [ 'open', 'sent', 'new', 'preparing', 'ready', 'out_for_delivery' ].includes( o.status ) )
				: tab === 'done' ? orders.filter( ( o ) => [ 'completed', 'cancelled', 'delivered' ].includes( o.status ) )
					: orders;
		const counts = { all: base.length };
		CHANNELS.forEach( ( c ) => { counts[ c.key ] = 0; } );
		base.forEach( ( o ) => { counts[ orderChannel( o ) ]++; } );
		return counts;
	}, [ orders, archived, tab ] );

	const groups = useMemo( () => groupByDay( filtered ), [ filtered ] );

	// Scheduled groups fold away during service — EXCEPT while one still holds
	// an unaccepted order (hiding a "New" pre-order is how it never gets
	// accepted). A manual toggle wins either way.
	const [ schedOpen, setSchedOpen ] = useState( {} ); // label → true/false override
	const schedExpanded = ( g ) => {
		if ( schedOpen[ g.label ] !== undefined ) {
			return schedOpen[ g.label ];
		}
		return g.orders.some( ( o ) => o.status === 'new' ); // needs action → open
	};
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
			' · ' + ( o.whenDate ? esc( fmtWhenDate( o.whenDate ) ) + ' · ' + esc( o.when ) : ( o.when === 'asap' ? 'ASAP' : esc( o.when ) ) ) + '</p>';
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
		// Round ticket notes typed at fire time ("no rush", "allergy seat 2").
		[ ...new Set( wanted.map( ( li ) => li.fnote ).filter( Boolean ) ) ].forEach( ( n ) => {
			body += '<p class="dinekit-flag">🔥 ' + esc( n ) + '</p>';
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

			<Modal open={ adding } onClose={ () => setAdding( false ) } sx={ { maxWidth: 1060, width: '96vw' } }>
				{ adding && (
					<NewOrder
						money={ money }
						onCancel={ () => setAdding( false ) }
						onCreated={ ( order ) => { setOrders( ( os ) => [ order, ...os ] ); setAdding( false ); setTab( 'active' ); } }
					/>
				) }
			</Modal>

			<ToggleButtonGroup size="small" exclusive value={ tab } onChange={ ( e, v ) => v && setTab( v ) } sx={ { mb: 1.25 } }>
				<ToggleButton value="active">Active</ToggleButton>
				<ToggleButton value="done">Completed</ToggleButton>
				<ToggleButton value="all">All</ToggleButton>
				<ToggleButton value="archived">Archived</ToggleButton>
			</ToggleButtonGroup>

			{ /* Day navigator for the history tabs — step, jump or open the floodgates. */ }
			{ dayScoped && (
				<Stack direction="row" spacing={ 0.75 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mb: 1.25 } }>
					<IconButton size="small" onClick={ () => stepDay( -1 ) } disabled={ curDay === 'all' } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } } title="Previous day">
						<Typography component="span" sx={ { fontSize: 14, lineHeight: 1 } }>◀</Typography>
					</IconButton>
					<TextField
						type="date"
						size="small"
						value={ curDay === 'all' ? '' : ( curDay || '' ) }
						onChange={ ( e ) => setDay( e.target.value || 'all' ) }
						sx={ { width: 170 } }
					/>
					<IconButton size="small" onClick={ () => stepDay( 1 ) } disabled={ curDay === 'all' } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } } title="Next day">
						<Typography component="span" sx={ { fontSize: 14, lineHeight: 1 } }>▶</Typography>
					</IconButton>
					{ [ [ 'Today', isoDayOffset( 0 ) ], [ 'Yesterday', isoDayOffset( -1 ) ], [ 'All days', 'all' ] ].map( ( [ lab, v ] ) => (
						<Chip
							key={ lab }
							label={ lab }
							size="small"
							onClick={ () => setDay( v ) }
							sx={ { fontWeight: 700, cursor: 'pointer', bgcolor: curDay === v ? tokens.accentSoft : tokens.surface, color: curDay === v ? tokens.accentDark : tokens.muted, border: `1px solid ${ curDay === v ? tokens.accentDark : tokens.border2 }` } }
						/>
					) ) }
					<Typography sx={ { fontSize: 12.5, color: tokens.muted2 } }>
						{ filtered.length } order{ filtered.length === 1 ? '' : 's' }{ curDay !== 'all' && curDay ? ` on ${ fmtWhenDate( curDay ) }` : ' in total' }
					</Typography>
				</Stack>
			) }

			{ /* Where from? One stream, but any channel is one tap away. */ }
			<Stack direction="row" spacing={ 0.75 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
				<Chip
					label={ `All channels · ${ channelCounts.all }` }
					onClick={ () => pickChannel( 'all' ) }
					size="small"
					sx={ { fontWeight: 700, cursor: 'pointer', bgcolor: channel === 'all' ? tokens.ink : tokens.surface, color: channel === 'all' ? '#fff' : tokens.ink2, border: `1px solid ${ channel === 'all' ? tokens.ink : tokens.border2 }` } }
				/>
				{ CHANNELS.map( ( c ) => (
					<Chip
						key={ c.key }
						label={ `${ c.label } · ${ channelCounts[ c.key ] || 0 }` }
						onClick={ () => pickChannel( c.key ) }
						size="small"
						sx={ { fontWeight: 700, cursor: 'pointer', bgcolor: channel === c.key ? c.bg : tokens.surface, color: channel === c.key ? c.fg : tokens.muted, border: `1px solid ${ channel === c.key ? c.fg : tokens.border2 }` } }
					/>
				) ) }
			</Stack>

			{ filtered.length === 0 ? (
				<EmptyState
					icon={ <ReceiptLongIcon /> }
					title={ tab === 'archived' ? 'Nothing archived' : 'No orders here' }
					description={ tab === 'archived' ? 'Archived orders are kept here as a permanent record.' : 'Orders placed on your site land here in real time.' }
				/>
			) : (
				<Stack spacing={ 3 }>
					{ groups.map( ( g ) => (
						<Box key={ g.label } sx={ g.scheduled ? { p: 1.5, borderRadius: '12px', border: `1px dashed ${ tokens.amber }`, bgcolor: tokens.amberSoft } : {} }>
							<Typography
								onClick={ g.scheduled ? () => setSchedOpen( ( s ) => ( { ...s, [ g.label ]: ! schedExpanded( g ) } ) ) : undefined }
								title={ g.scheduled ? ( schedExpanded( g ) ? 'Click to collapse' : 'Click to expand' ) : undefined }
								sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: g.scheduled ? tokens.amber : tokens.muted2, mb: g.scheduled && ! schedExpanded( g ) ? 0 : 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, ...( g.scheduled ? { cursor: 'pointer', userSelect: 'none', borderRadius: '8px', mx: -0.75, px: 0.75, py: 0.25, transition: 'background .12s ease', '&:hover': { bgcolor: 'rgba(217,119,6,0.12)' } } : {} ) } }
							>
								{ g.scheduled && (
									// The universal "this folds" signal: a chevron that
									// points down when open, right when closed.
									<Box component="span" aria-hidden="true" sx={ { display: 'inline-flex', fontSize: 13, lineHeight: 1, transition: 'transform .15s ease', transform: schedExpanded( g ) ? 'rotate(90deg)' : 'none' } }>
										▶
									</Box>
								) }
								{ g.label } · { g.orders.length }
								{ g.scheduled && (
									<Box component="span" sx={ { textTransform: 'none', letterSpacing: 0, fontWeight: 600 } }>
										— pre-orders, not for today’s kitchen
									</Box>
								) }
								{ g.scheduled && (
									<Box component="span" sx={ { textTransform: 'none', letterSpacing: 0, fontWeight: 700, ml: 'auto', border: `1px solid ${ tokens.amber }`, borderRadius: 999, px: 1, py: 0.1, fontSize: 11 } }>
										{ schedExpanded( g ) ? 'Hide ▲' : `Show ${ g.orders.length } ▼` }
									</Box>
								) }
							</Typography>
							{ ( ! g.scheduled || schedExpanded( g ) ) && (
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
													{ o.name }{ o.phone ? ` · ${ o.phone }` : '' } · { o.whenDate ? `${ fmtWhenDate( o.whenDate ) } · ${ o.when }` : ( o.when === 'asap' ? 'ASAP' : o.when ) }
												</Typography>
												{ ( () => {
													const cm = channelMeta( orderChannel( o ) );
													return cm ? <Chip label={ o.table ? `${ cm.chip } · ${ o.table }` : cm.chip } size="small" sx={ { height: 20, fontSize: 11, fontWeight: 700, color: cm.fg, bgcolor: cm.bg } } /> : null;
												} )() }
												{ !! o.whenDate && (
													<Chip label={ o.whenDate > todayIso() ? 'Scheduled' : 'Pre-ordered' } size="small" sx={ { height: 20, fontSize: 11, fontWeight: 700, color: tokens.amber, bgcolor: tokens.amberSoft } } />
												) }
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
							) }
						</Box>
					) ) }
				</Stack>
			) }
			<Drawer anchor="right" open={ !! detail } onClose={ () => setDetail( null ) } disableEnforceFocus sx={ { zIndex: 100000 } }>
				{ detail && <OrderDetail order={ detail } money={ money } onClose={ () => setDetail( null ) } onResend={ () => resend( detail.id ) } onCancel={ () => { reject( detail.id ); setDetail( null ); } } onPrint={ ( st ) => printTicket( detail, st ) } onRefund={ ( lines ) => { refund( detail.id, lines ); setDetail( null ); } } onAmend={ async ( body ) => {
				try {
					const fresh = await api.updateOrder( detail.id, body );
					setDetail( fresh );
					setOrders( ( os ) => os.map( ( o ) => ( o.id === fresh.id ? fresh : o ) ) );
				} catch ( e ) {
					toast.error( e.message || 'Could not amend the payment.' );
				}
			} } /> }
			</Drawer>
		</Page>
	);
}

// Staff order builder — phone/walk-in orders. Amount is recomputed server-side.
function NewOrder( { money, onCreated, onCancel } ) {
	// The same tap-to-add menu the till uses — a phone order is taken at POS
	// speed, not through a dropdown. Multi-price dishes render one tile per
	// price so no configurator sheet is ever needed here.
	const [ sections, setSections ] = useState( null );
	const [ sec, setSec ] = useState( 0 ); // 0 = all sections
	const [ lines, setLines ] = useState( [] ); // key = itemId|priceIndex
	const [ name, setName ] = useState( '' );
	const [ phone, setPhone ] = useState( '' );
	const [ notes, setNotes ] = useState( '' );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		api.getPosMenu()
			.then( ( m ) => setSections( ( m && m.sections ) || [] ) )
			.catch( () => setSections( [] ) );
	}, [] );

	// One tappable tile per priced variant: "Fish & Chips · Regular £14.50"
	// and "… · Large £17" are separate tiles — the fastest possible pick.
	const tiles = useMemo( () => {
		const out = [];
		( sections || [] ).forEach( ( s ) => {
			( s.items || [] ).forEach( ( it ) => {
				( it.prices || [] ).forEach( ( p, pi ) => {
					out.push( {
						key: it.id + '|' + pi,
						id: it.id,
						priceIndex: pi,
						title: it.title,
						label: p.label || '',
						unit: Number( p.amount ) || 0,
						off: it.available === false,
						sectionId: s.id,
					} );
				} );
			} );
		} );
		return out;
	}, [ sections ] );
	const visibleTiles = sec ? tiles.filter( ( t ) => t.sectionId === sec ) : tiles;

	const tap = ( t ) => {
		if ( t.off ) {
			return;
		}
		setLines( ( ls ) => {
			const existing = ls.find( ( l ) => l.key === t.key );
			return existing
				? ls.map( ( l ) => ( l.key === t.key ? { ...l, qty: l.qty + 1 } : l ) )
				: [ ...ls, { key: t.key, id: t.id, priceIndex: t.priceIndex, title: t.title + ( t.label ? ` (${ t.label })` : '' ), unit: t.unit, qty: 1 } ];
		} );
	};
	const setQty = ( key, d ) => setLines( ( ls ) => ls.map( ( l ) => ( l.key === key ? { ...l, qty: Math.max( 1, l.qty + d ) } : l ) ).filter( ( l ) => l.qty > 0 ) );
	const removeLine = ( key ) => setLines( ( ls ) => ls.filter( ( l ) => l.key !== key ) );
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
				items: lines.map( ( l ) => ( { itemId: l.id, qty: l.qty, priceIndex: l.priceIndex } ) ),
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
		<Box sx={ { p: { xs: 2, md: 3 }, maxHeight: '90vh', overflowY: 'auto' } }>
			<Typography variant="subtitle2" sx={ { color: tokens.ink, mb: 1.5, fontSize: 16, fontWeight: 700 } }>New order (phone / walk-in)</Typography>
			<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 2.5 } alignItems="flex-start">
				{ /* Left: the tap-to-add menu, straight from the till. */ }
				<Box sx={ { flex: 1, minWidth: 0, width: '100%' } }>
					{ sections === null ? (
						<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { color: tokens.muted, py: 3 } }>
							<CircularProgress size={ 16 } />
							<Typography sx={ { fontSize: 13 } }>Loading the menu…</Typography>
						</Stack>
					) : tiles.length === 0 ? (
						<Typography sx={ { fontSize: 13, color: tokens.muted, py: 3 } }>No priced dishes yet — add prices in the Menu Builder first.</Typography>
					) : (
						<>
							<Stack direction="row" spacing={ 0.75 } flexWrap="wrap" useFlexGap sx={ { mb: 1.25 } }>
								<Chip label="All" size="small" onClick={ () => setSec( 0 ) } sx={ { fontWeight: 700, cursor: 'pointer', bgcolor: sec === 0 ? tokens.accentSoft : tokens.surface, color: sec === 0 ? tokens.accentDark : tokens.muted, border: `1px solid ${ sec === 0 ? tokens.accentDark : tokens.border2 }` } } />
								{ ( sections || [] ).filter( ( s ) => ( s.items || [] ).length ).map( ( s ) => (
									<Chip key={ s.id } label={ s.name } size="small" onClick={ () => setSec( s.id ) } sx={ { fontWeight: 700, cursor: 'pointer', bgcolor: sec === s.id ? tokens.accentSoft : tokens.surface, color: sec === s.id ? tokens.accentDark : tokens.muted, border: `1px solid ${ sec === s.id ? tokens.accentDark : tokens.border2 }` } } />
								) ) }
							</Stack>
							<Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 } }>
								{ visibleTiles.map( ( t ) => (
									<Box
										key={ t.key }
										component="button"
										type="button"
										onClick={ () => tap( t ) }
										disabled={ t.off }
										sx={ {
											textAlign: 'left', fontFamily: 'inherit', cursor: t.off ? 'not-allowed' : 'pointer',
											border: `1px solid ${ tokens.border }`, borderRadius: '10px', bgcolor: t.off ? tokens.soft : tokens.surface,
											px: 1.25, py: 1, opacity: t.off ? 0.55 : 1, transition: 'border-color .12s, box-shadow .12s',
											'&:hover': t.off ? {} : { borderColor: tokens.accent, boxShadow: tokens.shadowSm },
										} }
									>
										<Typography sx={ { fontSize: 13, fontWeight: 650, color: tokens.ink, lineHeight: 1.25 } }>
											{ t.title }{ t.label ? <Box component="span" sx={ { color: tokens.muted, fontWeight: 600 } }> · { t.label }</Box> : null }
										</Typography>
										<Typography sx={ { fontSize: 12.5, fontWeight: 700, color: t.off ? tokens.muted2 : tokens.accentDark, mt: 0.25 } }>
											{ t.off ? '86’d' : money( t.unit ) }
										</Typography>
									</Box>
								) ) }
							</Box>
						</>
					) }
				</Box>

				{ /* Right: the order so far + customer details. */ }
				<Box sx={ { width: { xs: '100%', md: 340 }, flexShrink: 0 } }>
					<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.muted2, mb: 0.75 } }>
						The order
					</Typography>
					{ lines.length === 0 ? (
						<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 1.5 } }>Tap dishes to add them.</Typography>
					) : (
						<Stack spacing={ 0.75 } sx={ { mb: 1.5 } }>
							{ lines.map( ( l ) => (
								<Stack key={ l.key } direction="row" alignItems="center" spacing={ 0.75 } sx={ { bgcolor: tokens.soft, borderRadius: 2, px: 1.25, py: 0.6 } }>
									<Typography sx={ { flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>{ l.title }</Typography>
									<IconButton size="small" onClick={ () => setQty( l.key, -1 ) }>−</IconButton>
									<Typography sx={ { width: 22, textAlign: 'center', fontWeight: 700, fontSize: 13 } }>{ l.qty }</Typography>
									<IconButton size="small" onClick={ () => setQty( l.key, 1 ) }>+</IconButton>
									<Typography sx={ { width: 62, textAlign: 'right', fontWeight: 650, fontSize: 13 } }>{ money( l.unit * l.qty ) }</Typography>
									<IconButton size="small" onClick={ () => removeLine( l.key ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
								</Stack>
							) ) }
						</Stack>
					) }
					<Stack spacing={ 1.25 }>
						<TextField size="small" label="Customer name" value={ name } onChange={ ( e ) => setName( e.target.value ) } fullWidth />
						<TextField size="small" label="Phone" value={ phone } onChange={ ( e ) => setPhone( e.target.value ) } fullWidth />
						<TextField size="small" fullWidth label="Notes (allergies, requests…)" value={ notes } onChange={ ( e ) => setNotes( e.target.value ) } />
					</Stack>
					{ error && <Typography sx={ { color: tokens.red, fontSize: 13, mt: 1 } }>{ error }</Typography> }
					<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mt: 1.5 } }>
						<Typography sx={ { fontWeight: 800, fontSize: 17 } }>{ money( total ) }</Typography>
						<Box sx={ { flex: 1 } } />
						<Button onClick={ onCancel } sx={ { color: tokens.muted } }>Cancel</Button>
						<Button variant="contained" onClick={ create } disabled={ saving || lines.length === 0 }>
							{ saving ? 'Creating…' : 'Create order' }
						</Button>
					</Stack>
				</Box>
			</Stack>
		</Box>
	);
}

// Settings-row furniture: every setting gets a name + a plain-English line on
// the left and its control on the right — first-time readable, never mushed.
function SGroup( { title, children } ) {
	return (
		<Box sx={ { mb: 2 } }>
			<Typography sx={ { fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.muted2, mb: 0.5 } }>{ title }</Typography>
			<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', px: 2, py: 0.5 } }>{ children }</Box>
		</Box>
	);
}
function SRow( { title, desc, children, last } ) {
	return (
		<Stack direction={ { xs: 'column', sm: 'row' } } alignItems={ { xs: 'flex-start', sm: 'center' } } spacing={ 1.5 } sx={ { py: 1.4, borderBottom: last ? 'none' : `1px solid ${ tokens.soft }` } }>
			<Box sx={ { flex: 1, minWidth: 0, pr: 1 } }>
				<Typography sx={ { fontSize: 13.5, fontWeight: 650, color: tokens.ink } }>{ title }</Typography>
				<Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 0.2, lineHeight: 1.5 } }>{ desc }</Typography>
			</Box>
			<Box sx={ { flexShrink: 0 } }>{ children }</Box>
		</Stack>
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
		copyToClipboard( '[dinekit_order]' ).then( () => setCopied( true ) );
	};

	return (
		<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2.5, mb: 2 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<Typography variant="subtitle2" sx={ { color: tokens.ink } }>Ordering settings</Typography>
				<Typography sx={ { fontSize: 12, color: tokens.muted, minWidth: 50 } }>
					{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
				</Typography>
			</Stack>

			<SGroup title="Taking orders">
				<SRow title="Accept online orders" desc="The master switch for your ordering page. Off = the menu still shows online, but checkout is closed.">
					<Switch checked={ cfg.enabled } onChange={ ( e ) => patch( { enabled: e.target.checked } ) } />
				</SRow>
				<SRow title="Auto-accept orders" desc="On: new orders go straight to the kitchen. Off (recommended with card payments): every order waits for your Accept — a held card is only charged when you accept.">
					<Switch checked={ !! cfg.auto_accept } onChange={ ( e ) => patch( { auto_accept: e.target.checked } ) } />
				</SRow>
				<SRow title="Table QR: pay upfront" desc="Off: an order from a table's QR code joins that table's tab, paid at the end like normal dining. On: guests pay by card as they order, each time." last>
					<Switch checked={ !! cfg.table_qr_pay } onChange={ ( e ) => patch( { table_qr_pay: e.target.checked } ) } />
				</SRow>
			</SGroup>

			<SGroup title="Timing & capacity">
				<SRow title="Prep time (minutes)" desc="How long the kitchen needs. An “ASAP” order is promised in about this long, and it's the earliest collection time diners are offered.">
					<TextField type="number" size="small" value={ cfg.prep_mins } onChange={ ( e ) => patch( { prep_mins: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) } sx={ { width: 110 } } />
				</SRow>
				<SRow title="Slot length (minutes)" desc="Orders are counted in time slots of this length — the window the capacity cap below applies to.">
					<TextField type="number" size="small" value={ cfg.slot_mins != null ? cfg.slot_mins : 15 } onChange={ ( e ) => patch( { slot_mins: Math.max( 5, parseInt( e.target.value, 10 ) || 15 ) } ) } sx={ { width: 110 } } />
				</SRow>
				<SRow title="Max orders per slot" desc="Cap how many online orders can target the same slot, so a rush can't swamp the kitchen. Full slots grey out in the diner's time picker. 0 = no limit.">
					<TextField type="number" size="small" value={ cfg.slot_max != null ? cfg.slot_max : 0 } onChange={ ( e ) => patch( { slot_max: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) } sx={ { width: 110 } } />
				</SRow>
				<SRow title="Pre-order days ahead" desc="Let diners order for later days — tomorrow's lunch, Saturday's collection. They're only offered times you're open, and scheduled orders always arrive held for your Accept. 0 = today only.">
					<TextField type="number" size="small" value={ cfg.preorder_days != null ? cfg.preorder_days : 0 } onChange={ ( e ) => patch( { preorder_days: Math.max( 0, Math.min( 14, parseInt( e.target.value, 10 ) || 0 ) ) } ) } sx={ { width: 110 } } />
				</SRow>
				<SRow title="Kitchen sees timed orders (minutes before)" desc="A “collect at 19:00” order joins the Kitchen Display this many minutes before its slot, instead of sitting on the screen all day. 0 = show all day." last>
					<TextField type="number" size="small" value={ cfg.kds_lead_mins != null ? cfg.kds_lead_mins : 60 } onChange={ ( e ) => patch( { kds_lead_mins: Math.max( 0, Math.min( 1440, parseInt( e.target.value, 10 ) || 0 ) ) } ) } sx={ { width: 110 } } />
				</SRow>
			</SGroup>

			<SGroup title="Money">
				<SRow title="Minimum order" desc="The smallest basket the checkout accepts. 0 = no minimum." last>
					<TextField type="number" size="small" value={ cfg.min_order } onChange={ ( e ) => patch( { min_order: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) } sx={ { width: 110 } } />
				</SRow>
			</SGroup>

			<SGroup title="Notifications & printing">
				<SRow title="Email notifications" desc="Email the customer their confirmation and receipt, and alert the kitchen about each new order.">
					<Switch checked={ cfg.emails_enabled } onChange={ ( e ) => patch( { emails_enabled: e.target.checked } ) } />
				</SRow>
				<SRow title="Kitchen email" desc="Where new-order alerts are sent. Leave blank to use the site admin address.">
					<TextField type="email" size="small" placeholder="Defaults to site admin" value={ cfg.notify_email } onChange={ ( e ) => patch( { notify_email: e.target.value } ) } sx={ { width: 240 } } />
				</SRow>
				<SRow
					title="Kitchen printer email"
					desc={ <>Auto-print tickets on a thermal printer that has its own email address (e.g. <strong>Epson TM-m30</strong> via Epson Connect, <strong>Star mC-Print</strong> via CloudPRNT) — when an order is accepted, DineKit emails it a plain ticket and it prints itself, no computer needed. Leave blank to print manually from the order card.</> }
					last
				>
					<TextField type="email" size="small" placeholder="abc123@print.epsonconnect.com" value={ cfg.printer_email || '' } onChange={ ( e ) => patch( { printer_email: e.target.value } ) } sx={ { width: 260 } } />
				</SRow>
			</SGroup>

			<SGroup title="Delivery">
				<SRow title="Offer delivery" desc="Diners choose collection or delivery at checkout. (No live driver tracking yet.)" last={ ! cfg.delivery_enabled }>
					<Switch checked={ !! cfg.delivery_enabled } onChange={ ( e ) => patch( { delivery_enabled: e.target.checked } ) } />
				</SRow>
				{ cfg.delivery_enabled && (
					<>
						<SRow title="Delivery fee" desc="Flat fee added to every delivery order.">
							<TextField type="number" size="small" value={ cfg.delivery_fee } onChange={ ( e ) => patch( { delivery_fee: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) } sx={ { width: 110 } } />
						</SRow>
						<SRow title="Delivery minimum" desc="The smallest food total you'll deliver for. 0 = none.">
							<TextField type="number" size="small" value={ cfg.delivery_min } onChange={ ( e ) => patch( { delivery_min: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) } sx={ { width: 110 } } />
						</SRow>
						<SRow title="Delivery time (minutes)" desc="The estimate shown to diners at checkout.">
							<TextField type="number" size="small" value={ cfg.delivery_mins } onChange={ ( e ) => patch( { delivery_mins: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) } sx={ { width: 110 } } />
						</SRow>
						<SRow title="Delivery area" desc="A note shown at checkout so diners know if you'll reach them — e.g. “within 3 miles of GL1”." last>
							<TextField size="small" placeholder="e.g. within 3 miles" value={ cfg.delivery_area } onChange={ ( e ) => patch( { delivery_area: e.target.value } ) } sx={ { width: 240 } } />
						</SRow>
					</>
				) }
			</SGroup>

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
function OrderDetail( { order, money, onClose, onResend, onCancel, onPrint, onRefund, onAmend } ) {
	const m = O_STATUS.find( ( s ) => s.key === order.status ) || O_STATUS[ 0 ];
	// Amending money is a manager action (same permission as refunds/voids).
	const canAmendPay = ! window.DINEKIT || ! window.DINEKIT.caps || !! window.DINEKIT.caps.refunds;
	const [ retypeIdx, setRetypeIdx ] = useState( -1 ); // payment row showing the swap-method chips
	const pay = PAYMENT[ order.payment ];
	const fmt = ( iso ) => { try { return new Date( iso ).toLocaleString(); } catch ( e ) { return iso; } };
	const hasBar = ( order.items || [] ).some( ( li ) => li.station === 'bar' );
	const hasKitchen = ( order.items || [] ).some( ( li ) => li.station !== 'bar' );
	// Manager override: cancel + refund/release even after an order was accepted.
	const canCancel = ! [ 'cancelled', 'completed' ].includes( order.status );
	const refundable = [ 'paid', 'authorized', 'pending' ].includes( order.payment );
	const [ confirm, setConfirm ] = useState( null );
	// Partial refund: pick specific lines, or leave all unticked to refund it all.
	const [ refundOpen, setRefundOpen ] = useState( false );
	const [ refundSel, setRefundSel ] = useState( () => new Set() );
	const canPartRefund = [ 'paid', 'part_refunded' ].includes( order.payment );
	const refundLines = ( order.items || [] ).map( ( li, i ) => ( { li, i } ) ).filter( ( x ) => ! x.li.refunded );
	const selAmount = refundLines.filter( ( x ) => refundSel.has( x.i ) ).reduce( ( s, x ) => s + Number( x.li.lineTotal || 0 ), 0 );
	const toggleRefund = ( i ) => setRefundSel( ( prev ) => { const n = new Set( prev ); if ( n.has( i ) ) { n.delete( i ); } else { n.add( i ); } return n; } );
	return (
		<>
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
					onClick={ () => setConfirm( {
						title: refundable ? 'Cancel & refund this order?' : 'Cancel this order?',
						message: refundable ? 'The order is cancelled and the payment is refunded (or the hold released).' : 'This order will be cancelled.',
						confirmLabel: refundable ? 'Cancel & refund' : 'Cancel order',
						onConfirm: onCancel,
					} ) }
					sx={ { mb: 2 } }
				>
					{ refundable ? 'Cancel & refund' : 'Cancel order' }
				</Button>
			) }

			{ /* A served/completed order can still be refunded (post-meal issue) without cancelling it — whole order or selected items. */ }
			{ ! canCancel && canPartRefund && (
				<Button
					size="small"
					variant="outlined"
					color="error"
					onClick={ () => { setRefundSel( new Set() ); setRefundOpen( true ); } }
					sx={ { mb: 2 } }
				>
					Refund…
				</Button>
			) }

			{ order.refundDue && (
				<Box sx={ { mb: 2, p: 1.5, borderRadius: 2, bgcolor: tokens.redSoft } }>
					<Typography sx={ { fontSize: 13, color: tokens.red, fontWeight: 600 } }>A refund is owed but could not be processed automatically — refund the customer in Stripe.</Typography>
				</Box>
			) }

			{ /* The customer's note first — allergies and requests must never be
			     buried under items and totals. */ }
			{ order.notes && (
				<Box sx={ { mb: 2, p: 1.25, borderRadius: '10px', bgcolor: tokens.amberSoft, border: `1px solid ${ tokens.amber }` } }>
					<Typography sx={ { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tokens.amber } }>Customer note</Typography>
					<Typography sx={ { fontSize: 13.5, fontWeight: 600, color: tokens.ink, mt: 0.25 } }>“{ order.notes }”</Typography>
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
				{ /* Every payment taken, each removable by a manager — the fix for
				     "pressed cash with the wrong amount". Removing one that leaves
				     the bill uncovered reopens a settled dine-in tab. */ }
				{ ( order.tenders || [] ).length > 0 && (
					<Stack spacing={ 0.5 } sx={ { mt: 1 } }>
						{ order.tenders.map( ( t, i ) => (
							<Box key={ i }>
								<Stack direction="row" alignItems="center" spacing={ 1 } >
									<Typography sx={ { fontSize: 13, color: tokens.ink2 } }>{ t.type } · { money( Number( t.amount ) ) }</Typography>
									<Box sx={ { flex: 1 } } />
									{ canAmendPay && onAmend && (
										<Button size="small" onClick={ () => setRetypeIdx( retypeIdx === i ? -1 : i ) }>Change</Button>
									) }
									{ canAmendPay && onAmend && (
										<Button
											size="small"
											color="error"
											onClick={ () => setConfirm( {
												title: 'Remove this payment?',
												message: `The ${ t.type } payment of ${ money( Number( t.amount ) ) } comes off order #${ order.number }. If the bill is no longer covered, a settled tab reopens on its table.`,
												confirmLabel: 'Remove payment',
												onConfirm: () => onAmend( { action: 'remove_tender', tenderIndex: i, tenderType: t.type, amount: t.amount } ),
											} ) }
										>
											Remove
										</Button>
									) }
								</Stack>
								{ retypeIdx === i && (
									<Stack direction="row" spacing={ 0.75 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mt: 0.5 } }>
										<Typography sx={ { fontSize: 12, color: tokens.muted } }>Was actually…</Typography>
										{ [ 'cash', 'card', 'voucher', 'comp', 'account' ].filter( ( ty ) => ty !== t.type ).map( ( ty ) => (
											<Chip key={ ty } label={ ty } size="small" onClick={ () => { setRetypeIdx( -1 ); onAmend( { action: 'retype_tender', tenderIndex: i, tenderType: t.type, amount: t.amount, newType: ty } ); } } sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: tokens.soft, color: tokens.ink2, '&:hover': { bgcolor: tokens.accentSoft, color: tokens.accentDark } } } />
										) ) }
									</Stack>
								) }
							</Box>
						) ) }
					</Stack>
				) }
				{ canAmendPay && onAmend && 'dine_in' === order.channel && 'completed' === order.status && (
					<Button
						size="small"
						variant="outlined"
						sx={ { mt: 1 } }
						onClick={ () => setConfirm( {
							title: 'Reopen this tab?',
							message: `Order #${ order.number } goes back onto ${ order.table || 'its table' } as an open tab — settle it again when it's right.`,
							confirmLabel: 'Reopen tab',
							onConfirm: () => onAmend( { action: 'reopen' } ),
						} ) }
					>
						Reopen tab
					</Button>
				) }
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
		<ConfirmDialog
			open={ !! confirm }
			title={ ( confirm || {} ).title }
			message={ ( confirm || {} ).message }
			confirmLabel={ ( confirm || {} ).confirmLabel }
			onConfirm={ () => { const fn = confirm && confirm.onConfirm; setConfirm( null ); if ( fn ) { fn(); } } }
			onCancel={ () => setConfirm( null ) }
		/>
		<ConfirmDialog
			open={ refundOpen }
			title="Refund"
			message={ refundSel.size ? 'Refunding just the ticked items.' : 'Leave everything unticked to refund the whole order, or tick specific items for a partial refund.' }
			confirmLabel={ refundSel.size ? `Refund ${ money( selAmount ) }` : 'Refund whole order' }
			onConfirm={ () => { const lines = Array.from( refundSel ); setRefundOpen( false ); onRefund( lines ); } }
			onCancel={ () => setRefundOpen( false ) }
			details={
				refundLines.length ? (
					<Stack spacing={ 0.5 } sx={ { maxHeight: 260, overflowY: 'auto' } }>
						{ refundLines.map( ( { li, i } ) => (
							<Stack key={ i } direction="row" alignItems="center" spacing={ 1 } sx={ { py: 0.25 } }>
								<Checkbox size="small" checked={ refundSel.has( i ) } onChange={ () => toggleRefund( i ) } sx={ { p: 0.25 } } />
								<Typography sx={ { flex: 1, fontSize: 13 } }>{ li.qty }× { li.title }{ li.priceLabel ? ` (${ li.priceLabel })` : '' }</Typography>
								<Typography sx={ { fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ money( li.lineTotal ) }</Typography>
							</Stack>
						) ) }
						{ ( order.items || [] ).some( ( li ) => li.refunded ) && (
							<Typography sx={ { fontSize: 11.5, color: tokens.muted, pt: 0.5 } }>Already-refunded items are hidden.</Typography>
						) }
					</Stack>
				) : null
			}
		/>
		</>
	);
}
