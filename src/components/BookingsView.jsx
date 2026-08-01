import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Button,
	IconButton,
	TextField,
	Chip,
	MenuItem,
	Select,
	CircularProgress,
	Tooltip,
	Divider,
	Collapse,
	Alert,
	Snackbar,
	ToggleButton,
	ToggleButtonGroup,
	Drawer,
	Modal,
	Menu,
	ListItemIcon,
	Checkbox,
} from '../ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import TuneIcon from '@mui/icons-material/Tune';
import PrintIcon from '@mui/icons-material/Print';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import CelebrationIcon from '@mui/icons-material/Celebration';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { tokens } from '../theme';
import { api } from '../api/client';
import { STATUSES, statusMeta, isoDate, addDays, prettyDate } from '../lib/bookings';
import { printDoc, esc } from '../lib/print';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import { ListSkeleton } from './ui/Skeletons';
import BookingSettingsView from './BookingSettingsView';
import ServiceTimeline from './ServiceTimeline';
import PageTour from './PageTour';
import { DetailSection, DetailRow } from './ui/Detail';

export default function BookingsView() {
	const [ date, setDate ] = useState( isoDate() );
	const [ bookings, setBookings ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ adding, setAdding ] = useState( false ); // inline add form (list view)
	const [ popupAdd, setPopupAdd ] = useState( false ); // popup add form (timeline view)
	const [ settingsOpen, setSettingsOpen ] = useState( false );
	const [ view, setView ] = useState( 'list' ); // 'list' (diary) | 'timeline' (full-width service view)
	const [ listScope, setListScope ] = useState( 'upcoming' ); // 'upcoming' (what's left today) | 'all'
	const [ selectMode, setSelectMode ] = useState( false ); // bulk-manage toggle
	const [ selected, setSelected ] = useState( () => new Set() ); // selected booking ids
	const [ bulkConfirm, setBulkConfirm ] = useState( false );
	const [ walkInConfirm, setWalkInConfirm ] = useState( null ); // holds the pending walk-in time when over cap
	const [ floor, setFloor ] = useState( { areas: [], tables: [], combos: [] } );
	const [ svc, setSvc ] = useState( { openMin: 720, closeMin: 1320 } );
	const [ turnMin, setTurnMin ] = useState( 120 );
	const [ events, setEvents ] = useState( [] );
	const [ , setTick ] = useState( 0 ); // 30s heartbeat so on-table timers tick

	// Events share the day; the turn time (cover duration) drives the live on-table
	// timers on seated tables. Load both on mount, and tick every 30s.
	useEffect( () => {
		api.getEvents().then( ( e ) => setEvents( e || [] ) ).catch( () => {} );
		api.getBookingSettings().then( ( s ) => { if ( s && s.turn_time ) { setTurnMin( s.turn_time ); } } ).catch( () => {} );
		const t = window.setInterval( () => setTick( ( n ) => n + 1 ), 30000 );
		return () => window.clearInterval( t );
	}, [] );

	const load = useCallback( ( d ) => {
		setLoading( true );
		api.listBookings( { from: d } )
			.then( ( rows ) => setBookings( rows || [] ) )
			.finally( () => setLoading( false ) );
	}, [] );

	useEffect( () => {
		load( date );
	}, [ date, load ] );

	// Timeline needs the floor (rows), the day's service window (axis) and the
	// turn time (block width). Fetch lazily when the view is first opened.
	useEffect( () => {
		if ( view !== 'timeline' ) {
			return;
		}
		api.getFloor().then( ( f ) => setFloor( f || { areas: [], tables: [], combos: [] } ) );
		api.getBookingSettings().then( ( s ) => setTurnMin( ( s && s.turn_time ) || 120 ) );
	}, [ view ] );

	useEffect( () => {
		if ( view !== 'timeline' ) {
			return;
		}
		api.getServiceWindow( date ).then( ( w ) => w && setSvc( w ) );
	}, [ view, date ] );

	const covers = bookings
		.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) )
		.reduce( ( s, b ) => s + ( b.party || 0 ), 0 );

	// Events happening on the shown day, with an expected head-count.
	const eventCovers = ( e ) =>
		( e.groups || [] ).reduce( ( s, g ) => s + ( g.size || 0 ), 0 ) || e.capacity || e.guestCount || 0;
	const eventsToday = events.filter( ( e ) => e.date === date );

	const [ reviewMsg, setReviewMsg ] = useState( '' );
	const askReview = ( id ) => {
		api.requestReview( id )
			.then( () => setReviewMsg( 'Review request sent ✓' ) )
			.catch( ( e ) => setReviewMsg( e.message || 'Could not send the request' ) );
	};

	const [ detail, setDetail ] = useState( null ); // Booking shown in the detail drawer.
	const patchLocal = ( id, changes ) => {
		setBookings( ( bs ) => bs.map( ( b ) => ( b.id === id ? { ...b, ...changes } : b ) ) );
		setDetail( ( d ) => ( d && d.id === id ? { ...d, ...changes } : d ) );
	};

	const setStatus = ( id, status ) => {
		patchLocal( id, { status } );
		// Use the server response so deposit/refund fields (e.g. cancelling a paid
		// booking → refunded) reflect in the diary + open drawer.
		api.updateBooking( id, { status } ).then( ( b ) => b && patchLocal( id, b ) );
	};

	const remove = async ( id ) => {
		await api.deleteBooking( id );
		setBookings( ( bs ) => bs.filter( ( b ) => b.id !== id ) );
		setDetail( ( d ) => ( d && d.id === id ? null : d ) );
	};

	// Bulk-manage: multi-select several bookings then cancel & archive them in one
	// go (e.g. clearing a stale wave of no-shows). Cancelling honours deposits via
	// the server response, same as a single cancel.
	const toggleSelected = ( id ) => {
		setSelected( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( id ) ) {
				next.delete( id );
			} else {
				next.add( id );
			}
			return next;
		} );
	};
	const exitSelect = () => {
		setSelectMode( false );
		setSelected( new Set() );
	};
	const bulkCancel = async () => {
		const ids = Array.from( selected );
		setBulkConfirm( false );
		for ( const id of ids ) {
			patchLocal( id, { status: 'cancelled' } );
			// eslint-disable-next-line no-await-in-loop
			const b = await api.updateBooking( id, { status: 'cancelled' } );
			if ( b ) {
				patchLocal( id, b );
			}
		}
		exitSelect();
	};

	const printDay = () => {
		const active = bookings.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) );
		let body = '<h1>Bookings — ' + esc( prettyDate( date ) ) + '</h1>';
		body += '<p class="dinekit-sub">' + active.length + ' bookings · ' + covers + ' covers</p><div class="dinekit-grid">';
		active.forEach( ( b ) => {
			body += '<div class="dinekit-ticket"><h3>' + esc( b.time ) + ' — ' + esc( b.name || 'Guest' ) + '</h3>';
			body += '<p class="dinekit-meta">' + b.party + ' guests' + ( b.table ? ' · ' + esc( b.table ) : '' ) +
				( b.phone ? ' · ' + esc( b.phone ) : '' ) + '</p>';
			body += '<p class="dinekit-meta">' + esc( statusMeta( b.status ).label ) + '</p>';
			if ( b.notes ) {
				body += '<p class="dinekit-flag">“' + esc( b.notes ) + '”</p>';
			}
			body += '</div>';
		} );
		body += '</div>';
		printDoc( 'Bookings — ' + prettyDate( date ), body );
	};

	// Pre-shift service sheet — the FOH/kitchen briefing for the day: a timed
	// run sheet with allergies and VIPs flagged, plus a prep-by-hour summary.
	const printServiceSheet = async () => {
		const s = await api.getServiceSheet( date );
		let body = '<h1>Service sheet — ' + esc( prettyDate( date ) ) + '</h1>';
		body += '<p class="dinekit-sub">' + s.bookings + ' booking' + ( s.bookings === 1 ? '' : 's' ) +
			' · ' + s.covers + ' covers</p>';

		if ( s.allergenAlert.length ) {
			body += '<div class="dinekit-section-title">⚠ Allergen alerts</div>';
			body += '<p class="dinekit-allergen" style="font-size:15px">' +
				s.allergenAlert.map( esc ).join( ' · ' ) + '</p>';
		}

		body += '<div class="dinekit-section-title">Run sheet</div>';
		if ( ! s.rows.length ) {
			body += '<p class="dinekit-sub">No bookings for this day.</p>';
		}
		s.rows.forEach( ( r ) => {
			const flags = [];
			if ( r.vip ) {
				flags.push( '★ VIP' );
			}
			( r.tags || [] ).forEach( ( t ) => flags.push( t ) );
			body += '<div class="dinekit-ticket"><h3>' + esc( r.time ) + ' — ' + esc( r.name || 'Guest' ) +
				' <span style="font-weight:400;color:#64748b">(' + r.party + 'p)</span></h3>';
			body += '<p class="dinekit-meta">' + ( r.table ? esc( r.table ) : 'Table TBC' ) +
				( r.phone ? ' · ' + esc( r.phone ) : '' ) + '</p>';
			if ( flags.length ) {
				body += '<p class="dinekit-flag"><strong>' + flags.map( esc ).join( ' · ' ) + '</strong></p>';
			}
			if ( r.allergens ) {
				body += '<p class="dinekit-flag dinekit-allergen">Allergies: ' + esc( r.allergens ) + '</p>';
			}
			if ( r.guestNote ) {
				body += '<p class="dinekit-flag">Note: ' + esc( r.guestNote ) + '</p>';
			}
			if ( r.notes ) {
				body += '<p class="dinekit-flag">“' + esc( r.notes ) + '”</p>';
			}
			body += '</div>';
		} );

		if ( s.prep.length ) {
			body += '<div class="dinekit-section-title">Covers by hour</div>';
			s.prep.forEach( ( p ) => {
				body += '<div class="dinekit-row"><span>' + esc( p.hour ) + '</span><strong>' +
					p.covers + ' covers</strong></div>';
			} );
		}

		if ( s.events.length ) {
			body += '<div class="dinekit-section-title">Events today</div>';
			s.events.forEach( ( e ) => {
				body += '<div class="dinekit-row"><span>' + esc( e.name ) + '</span><strong>' +
					esc( e.time || '' ) + '</strong></div>';
			} );
		}

		printDoc( 'Service sheet — ' + prettyDate( date ), body );
	};

	const [ prefill, setPrefill ] = useState( null ); // { time, tableId } for click-to-book.
	const onCreated = ( booking ) => {
		setAdding( false );
		setPopupAdd( false );
		setPrefill( null );
		// Always tell the user which table it landed on. When a specific table was
		// full, the engine best-fit-assigns another — showing the real table makes
		// that visible instead of bookings mysteriously "piling onto one table".
		if ( booking.assignedNote ) {
			setReviewMsg( `Booked · ${ booking.table || '' } — ${ booking.assignedNote }` );
		} else if ( booking.table ) {
			setReviewMsg( `Booked · ${ booking.table }` );
		} else if ( [ 'provisional', 'penciled', 'waitlist' ].includes( booking.status ) ) {
			setReviewMsg( 'Penciled in — no table held yet' );
		}
		if ( booking.date === date ) {
			setBookings( ( bs ) =>
				[ ...bs, booking ].sort( ( a, b ) => ( a.time > b.time ? 1 : -1 ) )
			);
		} else {
			setDate( booking.date );
		}
	};

	// Timeline: click an empty table cell → open the booking form as a popup with
	// the time + table pre-selected (stays on the timeline, no bounce to the list).
	// "Now" rounded to the nearest 15 min, clamped to the service window.
	const nowSlot = () => {
		const now = new Date();
		let min = now.getHours() * 60 + now.getMinutes();
		min = Math.max( svc.openMin, Math.min( svc.closeMin, Math.round( min / 15 ) * 15 ) );
		const p2 = ( n ) => ( n < 10 ? '0' : '' ) + n;
		return p2( Math.floor( min / 60 ) ) + ':' + p2( min % 60 );
	};

	// Clicking a table for a slot: if it's now (this slot or earlier, today) the
	// guest is here — seat an instant walk-in at that table. A future slot is a
	// reservation, so open the form to capture a name.
	const createAt = ( tableId, time ) => {
		const now = new Date();
		const hm = ( '0' + now.getHours() ).slice( -2 ) + ':' + ( '0' + now.getMinutes() ).slice( -2 );
		if ( date === isoDate() && time <= hm ) {
			seatWalkIn( nowSlot(), tableId );
			return;
		}
		setPrefill( { time, tableId } );
		setPopupAdd( true );
	};

	// Click a booking on the timeline → edit it in a popup.
	const [ editBooking, setEditBooking ] = useState( null );
	// Change a booking's status straight from the open edit panel (arrived/seated,
	// no-show, completed…), keeping the panel in sync — no separate list dropdown
	// or detail-then-edit dance.
	const editStatus = ( status ) => {
		if ( ! editBooking ) {
			return;
		}
		setStatus( editBooking.id, status );
		setEditBooking( ( b ) => ( b ? { ...b, status } : b ) );
	};
	const onEdited = ( b ) => {
		setEditBooking( null );
		setBookings( ( bs ) => {
			const without = bs.filter( ( x ) => x.id !== b.id );
			return b.date === date
				? [ ...without, b ].sort( ( a, c ) => ( a.time > c.time ? 1 : -1 ) )
				: without;
		} );
	};

	// Drag a booking to another table (and/or time) on the timeline → reschedule.
	const moveBooking = async ( id, tableId, time ) => {
		const prev = bookings.find( ( x ) => x.id === id );
		if ( ! prev || ( prev.tableId === tableId && prev.time === time ) ) {
			return;
		}
		// Optimistic move; revert on failure.
		setBookings( ( bs ) =>
			bs
				.map( ( x ) => ( x.id === id ? { ...x, tableId, comboId: 0, time } : x ) )
				.sort( ( a, c ) => ( a.time > c.time ? 1 : -1 ) )
		);
		try {
			const b = await api.updateBooking( id, { tableId, comboId: 0, time } );
			if ( b ) {
				patchLocal( id, b );
			}
		} catch ( e ) {
			setBookings( ( bs ) => bs.map( ( x ) => ( x.id === id ? prev : x ) ) );
			setReviewMsg( e.message || 'Could not move the booking' );
		}
	};

	// Walk-in: an on-the-spot guest, seated immediately with no details required.
	// Booked from "now" rounded to the nearest 15 min, and auto-seated at the
	// best-fit free table (smallest that fits) if one's open — falling back to
	// no-table only when the room's full.
	const addWalkIn = async () => {
		const time = nowSlot();
		// Walk-ins previously bypassed all capacity checks — you could seat well
		// past your room. Respect the covers-per-hour cap the booking form warns
		// on: if we're over, ask before seating another party (staff can override).
		let tableId = 0;
		try {
			const a = await api.getAvailability( { date, time, party: 2 } );
			tableId = a && a.tables && a.tables.length ? a.tables[ 0 ].id : 0;
			if ( a && a.overCap ) {
				setWalkInConfirm( { time, tableId } );
				return;
			}
		} catch ( e ) { /* availability check is best-effort — never block a walk-in on a network hiccup */ }
		seatWalkIn( time, tableId );
	};

	const seatWalkIn = async ( time, tableId = 0 ) => {
		try {
			const booking = await api.createBooking( { date, time, party: 2, name: 'Walk-in', status: 'seated', tableId, comboId: 0 } );
			onCreated( booking );
		} catch ( e ) {
			setReviewMsg( e.message || 'Could not add the walk-in' );
		}
	};

	if ( settingsOpen ) {
		return (
			<Page width={ 900 }>
				<BookingSettingsView onBack={ () => setSettingsOpen( false ) } />
			</Page>
		);
	}

	// "Upcoming" hides finished/cancelled bookings and (for today) any whose time
	// has passed, so staff aren't scrolling past the morning to find who's next.
	const nowHM = ( () => { const d = new Date(); return ( '0' + d.getHours() ).slice( -2 ) + ':' + ( '0' + d.getMinutes() ).slice( -2 ); } )();
	const isToday = date === isoDate();
	const shown = 'all' === listScope
		? bookings
		: bookings.filter( ( b ) => {
			if ( [ 'cancelled', 'no_show', 'completed' ].includes( b.status ) ) {
				return false;
			}
			return ! ( isToday && ( b.time || '' ) < nowHM );
		} );
	const hiddenCount = bookings.length - shown.length;

	return (
		<Page width={ view === 'timeline' ? '100%' : 900 }>
			<PageHeader
				title="Bookings"
				subtitle="Your booking diary — take a reservation and see who's coming in."
				actions={
					<>
						<ToggleButtonGroup
							exclusive
							size="small"
							value={ view }
							onChange={ ( e, v ) => v && setView( v ) }
						>
							<ToggleButton value="list"><ViewListIcon sx={ { fontSize: 17, mr: 0.5 } } /> List</ToggleButton>
							<ToggleButton value="timeline"><ViewTimelineIcon sx={ { fontSize: 17, mr: 0.5 } } /> Timeline</ToggleButton>
						</ToggleButtonGroup>
						<Tooltip title="Booking settings & the public form">
							<IconButton
								onClick={ () => setSettingsOpen( ( v ) => ! v ) }
								sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, color: settingsOpen ? tokens.accent : tokens.muted } }
							>
								<TuneIcon />
							</IconButton>
						</Tooltip>
						<Button variant="outlined" startIcon={ <PeopleAltIcon /> } onClick={ addWalkIn }>
							Walk-in
						</Button>
						<Button
							variant="contained"
							startIcon={ <AddIcon /> }
							onClick={ () => ( view === 'timeline' ? ( setPrefill( null ), setPopupAdd( true ) ) : setAdding( ( v ) => ! v ) ) }
						>
							New booking
						</Button>
					</>
				}
			/>

			<PageTour
				id="bookings"
				title="Your booking diary"
				points={ [
					'Step through days with the arrows; “New booking” takes one over the phone.',
					'Availability follows your Opening Hours + tables; full slots suggest the next free time.',
					'Switch to Timeline for a full-width tables-vs-clock view of the service.',
					'The gear opens booking rules & the public widget; the ★ asks a guest for a review.',
				] }
			/>

			<Collapse in={ adding && view === 'list' } unmountOnExit>
				<NewBooking initialDate={ date } initialTime={ prefill && prefill.time } initialTable={ prefill && prefill.tableId } onCreated={ onCreated } onCancel={ () => { setAdding( false ); setPrefill( null ); } } />
			</Collapse>

			{ /* Day navigator — one cohesive toolbar: segmented date stepper + jump-to-today */ }
			<Card sx={ { px: 1.5, py: 1, mb: 2 } }>
			<Stack direction="row" alignItems="center" spacing={ 1 } flexWrap="wrap" useFlexGap>
				<Stack
					direction="row"
					alignItems="center"
					sx={ { bgcolor: tokens.soft, borderRadius: '9px', p: '3px', gap: '2px' } }
				>
					<IconButton size="small" onClick={ () => setDate( addDays( date, -1 ) ) } sx={ { borderRadius: '7px', color: tokens.muted } }>
						<ChevronLeftIcon fontSize="small" />
					</IconButton>
					<TextField
						type="date"
						value={ date }
						onChange={ ( e ) => setDate( e.target.value || isoDate() ) }
						sx={ {
							width: 172,
							'& input': { py: 0.5, fontSize: 13, fontWeight: 550 },
						} }
					/>
					<IconButton size="small" onClick={ () => setDate( addDays( date, 1 ) ) } sx={ { borderRadius: '7px', color: tokens.muted } }>
						<ChevronRightIcon fontSize="small" />
					</IconButton>
				</Stack>
				<Button size="small" variant="outlined" onClick={ () => setDate( isoDate() ) } sx={ { minHeight: 30 } }>
					Today
				</Button>
				<Box sx={ { flex: 1 } } />
				<Typography sx={ { fontWeight: 650, fontSize: 14, color: tokens.ink } }>{ prettyDate( date ) }</Typography>
				<Chip
					icon={ <EventSeatIcon sx={ { fontSize: 14 } } /> }
					label={ `${ covers } cover${ covers === 1 ? '' : 's' }` }
					size="small"
					sx={ { height: 22, fontSize: 12, bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600, '& .MuiChip-icon': { color: tokens.accent } } }
				/>
				<Tooltip title="Pre-shift service sheet — run sheet with allergies & VIPs">
					<span>
						<Button
							size="small"
							variant="outlined"
							startIcon={ <AssignmentIcon fontSize="small" /> }
							onClick={ printServiceSheet }
							disabled={ bookings.length === 0 }
							sx={ { textTransform: 'none' } }
						>
							Service sheet
						</Button>
					</span>
				</Tooltip>
				<Tooltip title="Print reservation slips">
					<span>
						<IconButton size="small" onClick={ printDay } disabled={ bookings.length === 0 } sx={ { color: tokens.muted } }>
							<PrintIcon fontSize="small" />
						</IconButton>
					</span>
				</Tooltip>
			</Stack>
			</Card>

			{ view === 'timeline' && (
				<ServiceTimeline
					bookings={ bookings }
					tables={ floor.tables }
					areas={ floor.areas }
					combos={ floor.combos }
					events={ eventsToday }
					eventCovers={ eventCovers }
					openMin={ svc.openMin }
					closeMin={ svc.closeMin }
					turnMin={ turnMin }
					onSelect={ ( b ) => setEditBooking( b ) }
					onCreate={ createAt }
					onMove={ moveBooking }
				/>
			) }

			{ view === 'list' && (
			<>
			{ bookings.length > 0 && (
				<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
					<ToggleButtonGroup exclusive size="small" value={ listScope } onChange={ ( e, v ) => v && setListScope( v ) }>
						<ToggleButton value="upcoming">Upcoming</ToggleButton>
						<ToggleButton value="all">All</ToggleButton>
					</ToggleButtonGroup>
					{ 'upcoming' === listScope && hiddenCount > 0 && (
						<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>{ hiddenCount } earlier / finished hidden</Typography>
					) }
					<Box sx={ { flex: 1 } } />
					{ selectMode ? (
						<Button size="small" onClick={ exitSelect } sx={ { color: tokens.muted } }>Done</Button>
					) : (
						<Button size="small" variant="outlined" onClick={ () => setSelectMode( true ) }>Select</Button>
					) }
				</Stack>
			) }
			{ selectMode && selected.size > 0 && (
				<Stack
					direction="row"
					alignItems="center"
					spacing={ 1.5 }
					sx={ { mb: 2, p: 1.25, borderRadius: '10px', bgcolor: tokens.redSoft, border: `1px solid ${ tokens.border }` } }
				>
					<Typography sx={ { fontSize: 13.5, fontWeight: 600, color: tokens.ink } }>
						{ selected.size } selected
					</Typography>
					<Box sx={ { flex: 1 } } />
					<Button size="small" onClick={ () => setSelected( new Set() ) } sx={ { color: tokens.muted } }>Clear</Button>
					<Button size="small" variant="contained" color="error" onClick={ () => setBulkConfirm( true ) }>
						Cancel &amp; archive
					</Button>
				</Stack>
			) }
			{ eventsToday.length > 0 && (
				<Box sx={ { mb: 2 } }>
					<Typography sx={ { fontSize: 11, fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.muted, mb: 1, px: 0.5 } }>
						Events
					</Typography>
					<Stack spacing={ 1 }>
						{ eventsToday.map( ( ev ) => (
							<Stack
								key={ ev.id }
								direction="row"
								alignItems="center"
								spacing={ 1.5 }
								onClick={ () => { window.location.hash = '#/events'; } }
								sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderLeft: `3px solid ${ tokens.violet }`, borderRadius: '10px', p: 1.25, cursor: 'pointer', '&:hover': { boxShadow: tokens.shadowSm } } }
							>
								<CelebrationIcon sx={ { fontSize: 18, color: tokens.violet } } />
								<Box sx={ { flex: 1, minWidth: 0 } }>
									<Typography sx={ { fontWeight: 700, fontSize: 14, color: tokens.ink } } noWrap>{ ev.name }</Typography>
									<Typography sx={ { fontSize: 12, color: tokens.muted } }>
										{ ev.time || 'Time TBC' }{ ev.status !== 'published' ? ' · draft' : '' }
									</Typography>
								</Box>
								<Chip
									icon={ <PeopleAltIcon sx={ { fontSize: 14 } } /> }
									label={ `${ eventCovers( ev ) } covers` }
									size="small"
									sx={ { bgcolor: tokens.violetSoft, color: tokens.violet, fontWeight: 600, '& .MuiChip-icon': { color: tokens.violet } } }
								/>
							</Stack>
						) ) }
					</Stack>
				</Box>
			) }
			{ loading ? (
				<ListSkeleton rows={ 5 } />
			) : bookings.length === 0 ? (
				<EmptyState
					icon={ <EventSeatIcon /> }
					title="No bookings for this day"
					description="Take one over the phone or let guests book from your site — either way it lands in this diary."
					action={
						<Button variant="contained" startIcon={ <AddIcon /> } onClick={ () => setAdding( true ) }>
							New booking
						</Button>
					}
				/>
			) : shown.length === 0 ? (
				<Box sx={ { textAlign: 'center', py: 4 } }>
					<Typography sx={ { fontSize: 14, color: tokens.muted, mb: 1.5 } }>Nothing left today — all { bookings.length } { bookings.length === 1 ? 'booking is' : 'bookings are' } earlier or finished.</Typography>
					<Button size="small" variant="outlined" onClick={ () => setListScope( 'all' ) }>Show all</Button>
				</Box>
			) : (
				<Stack spacing={ 3 }>
					{ [
						{ key: 'lunch', label: 'Lunch', rows: shown.filter( ( b ) => ( b.time || '' ) < '16:00' ) },
						{ key: 'dinner', label: 'Dinner', rows: shown.filter( ( b ) => ( b.time || '' ) >= '16:00' ) },
					]
						.filter( ( g ) => g.rows.length > 0 )
						.map( ( g ) => {
							const gCovers = g.rows
								.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) )
								.reduce( ( s, b ) => s + ( b.party || 0 ), 0 );
							return (
								<Box key={ g.key }>
									<Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={ { mb: 1, px: 0.5 } }>
										<Typography sx={ { fontSize: 11, fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.muted } }>
											{ g.label }
										</Typography>
										<Typography sx={ { fontSize: 12, color: tokens.muted, fontVariantNumeric: 'tabular-nums' } }>
											{ gCovers } cover{ gCovers === 1 ? '' : 's' }
										</Typography>
									</Stack>
									<Stack spacing={ 1 }>
										{ g.rows.map( ( b ) => (
											<BookingRow
												key={ b.id }
												booking={ b }
												turnMin={ turnMin }
												onStatus={ ( s ) => setStatus( b.id, s ) }
												onDelete={ () => remove( b.id ) }
												onRequestReview={ () => askReview( b.id ) }
												onOpen={ () => setEditBooking( b ) }
												selectMode={ selectMode }
												selected={ selected.has( b.id ) }
												onToggleSelect={ () => toggleSelected( b.id ) }
											/>
										) ) }
									</Stack>
								</Box>
							);
						} ) }
				</Stack>
			) }
			</>
			) }
			<Snackbar
				open={ !! reviewMsg }
				autoHideDuration={ 2500 }
				onClose={ () => setReviewMsg( '' ) }
				message={ reviewMsg }
				anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
			/>
			<ConfirmDialog
				open={ bulkConfirm }
				title={ `Cancel & archive ${ selected.size } booking${ selected.size === 1 ? '' : 's' }?` }
				message="These bookings will be cancelled and removed from the active diary. Any paid deposits are marked for refund."
				confirmLabel="Cancel &amp; archive"
				onConfirm={ bulkCancel }
				onCancel={ () => setBulkConfirm( false ) }
			/>
			<ConfirmDialog
				open={ !! walkInConfirm }
				destructive={ false }
				title="Over your covers cap"
				message="You're over your covers-per-hour cap for this time. Seat this walk-in anyway?"
				confirmLabel="Seat anyway"
				onConfirm={ () => { const w = walkInConfirm; setWalkInConfirm( null ); if ( w ) { seatWalkIn( w.time, w.tableId ); } } }
				onCancel={ () => setWalkInConfirm( null ) }
			/>
			<Modal open={ popupAdd } onClose={ () => { setPopupAdd( false ); setPrefill( null ); } }>
				<NewBooking
					bare
					initialDate={ date }
					initialTime={ prefill && prefill.time }
					initialTable={ prefill && prefill.tableId }
					onCreated={ onCreated }
					onCancel={ () => { setPopupAdd( false ); setPrefill( null ); } }
				/>
			</Modal>
			<Modal open={ !! editBooking } onClose={ () => setEditBooking( null ) }>
				{ editBooking && (
					<NewBooking
						bare
						editing={ editBooking }
						initialDate={ date }
						onCreated={ onEdited }
						onCancel={ () => setEditBooking( null ) }
						onStatus={ editStatus }
					/>
				) }
			</Modal>
		</Page>
	);
}

// Live on-table timer for a seated party: minutes since seated, colour-escalating
// from green → amber (past 75% of the turn time) → red (over it), so a table
// that's been sitting too long jumps out at a glance.
function onTableTimer( seatedAt, turnMin ) {
	if ( ! seatedAt ) {
		return null;
	}
	const t = new Date( String( seatedAt ).replace( ' ', 'T' ) ).getTime();
	if ( Number.isNaN( t ) ) {
		return null;
	}
	const mins = Math.max( 0, Math.floor( ( Date.now() - t ) / 60000 ) );
	const turn = Math.max( 30, Number( turnMin ) || 120 );
	const tone = mins >= turn
		? { fg: tokens.red, bg: tokens.redSoft }
		: ( mins >= turn * 0.75 ? { fg: tokens.amber, bg: tokens.amberSoft } : { fg: tokens.green, bg: tokens.greenSoft } );
	return { mins, tone, over: mins >= turn };
}

function BookingRow( { booking, turnMin, onStatus, onDelete, onRequestReview, onOpen, selectMode, selected, onToggleSelect } ) {
	const meta = statusMeta( booking.status );
	const onTable = 'seated' === booking.status ? onTableTimer( booking.seatedAt, turnMin ) : null;
	const [ menuEl, setMenuEl ] = useState( null );
	const closeMenu = () => setMenuEl( null );
	const run = ( fn ) => () => { closeMenu(); fn(); };
	return (
		<Stack
			direction="row"
			spacing={ 1.75 }
			alignItems="center"
			onClick={ selectMode ? onToggleSelect : undefined }
			sx={ {
				bgcolor: selectMode && selected ? tokens.accentSoft : tokens.surface,
				border: `1px solid ${ selectMode && selected ? tokens.accent : tokens.border }`,
				borderRadius: '12px',
				pl: 1.25,
				pr: 2,
				py: 1.25,
				cursor: selectMode ? 'pointer' : 'default',
			} }
		>
			{ selectMode && (
				<Checkbox checked={ !! selected } onChange={ onToggleSelect } onClick={ ( e ) => e.stopPropagation() } size="small" sx={ { p: 0.25 } } />
			) }
			{ /* Status rail */ }
			<Box sx={ { width: 3, borderRadius: 999, alignSelf: 'stretch', bgcolor: meta.fg, flexShrink: 0 } } />
			<Typography sx={ { fontWeight: 650, fontSize: 15, width: 52, color: tokens.ink, fontVariantNumeric: 'tabular-nums' } }>
				{ booking.time }
			</Typography>
			<Box onClick={ onOpen } sx={ { flex: 1, minWidth: 0, cursor: 'pointer' } }>
				<Typography sx={ { fontWeight: 600, fontSize: 14, color: tokens.ink } } noWrap>
					{ booking.name || 'Guest' }
				</Typography>
				<Typography sx={ { fontSize: 12.5, color: tokens.muted } } noWrap>
					{ booking.party } { booking.party === 1 ? 'guest' : 'guests' }
					{ booking.table ? ` · ${ booking.table }` : ' · no table' }
					{ booking.phone ? ` · ${ booking.phone }` : '' }
				</Typography>
			</Box>
			{ onTable && (
				<Tooltip title={ onTable.over ? `On table ${ onTable.mins }m — past the ${ turnMin }-min turn` : `Seated ${ onTable.mins } min ago` }>
					<Chip
						label={ `⏱ ${ onTable.mins }m` }
						size="small"
						sx={ { height: 20, fontSize: 11.5, fontWeight: 700, bgcolor: onTable.tone.bg, color: onTable.tone.fg, fontVariantNumeric: 'tabular-nums' } }
					/>
				</Tooltip>
			) }
			{ booking.guestNoShows > 0 && (
				<Tooltip title={ `This guest has ${ booking.guestNoShows } previous no-show${ booking.guestNoShows === 1 ? '' : 's' } — consider a deposit` }>
					<Chip label={ `⚠ ${ booking.guestNoShows } no-show${ booking.guestNoShows === 1 ? '' : 's' }` } size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 700, bgcolor: tokens.redSoft, color: tokens.red } } />
				</Tooltip>
			) }
			{ booking.depositPaid ? (
				<Chip
					label={ booking.depositAmount ? `Deposit £${ ( booking.depositAmount / 100 ).toFixed( 2 ) }` : 'Deposit paid' }
					size="small"
					sx={ { height: 20, fontSize: 11.5, fontWeight: 600, bgcolor: tokens.greenSoft, color: tokens.green } }
				/>
			) : booking.depositRequired ? (
				<Chip label="Deposit due" size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 600, bgcolor: tokens.amberSoft, color: tokens.amber } } />
			) : null }
			{ booking.refundDue && (
				<Tooltip title="A deposit refund is owed — refund the guest in Stripe">
					<Chip label="Refund owed" size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 600, bgcolor: tokens.redSoft, color: tokens.red } } />
				</Tooltip>
			) }
			{ booking.notes && (
				<Tooltip title={ booking.notes }>
					<Chip label="Notes" size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 600, bgcolor: tokens.soft, color: tokens.muted } } />
				</Tooltip>
			) }
			<Select
				value={ booking.status }
				onChange={ ( e ) => onStatus( e.target.value ) }
				size="small"
				sx={ {
					minWidth: 132,
					fontWeight: 600,
					fontSize: 13,
					color: meta.fg,
					bgcolor: meta.bg,
					borderRadius: '8px',
					'& fieldset': { border: 'none' },
				} }
			>
				{ STATUSES.map( ( s ) => (
					<MenuItem key={ s.key } value={ s.key } sx={ { fontSize: 13, fontWeight: 600 } }>
						{ s.label }
					</MenuItem>
				) ) }
			</Select>
			<Tooltip title="Actions">
				<IconButton size="small" onClick={ ( e ) => setMenuEl( e.currentTarget ) } sx={ { color: tokens.muted2 } }>
					<MoreVertIcon fontSize="small" />
				</IconButton>
			</Tooltip>
			<Menu
				anchorEl={ menuEl }
				open={ !! menuEl }
				onClose={ closeMenu }
				anchorOrigin={ { vertical: 'bottom', horizontal: 'right' } }
				transformOrigin={ { vertical: 'top', horizontal: 'right' } }
			>
				<MenuItem onClick={ run( onOpen ) }>
					<ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
					Details
				</MenuItem>
				{ booking.email && (
					<MenuItem onClick={ run( onRequestReview ) }>
						<ListItemIcon><StarBorderIcon fontSize="small" /></ListItemIcon>
						Ask for a review
					</MenuItem>
				) }
				<MenuItem onClick={ run( onDelete ) } sx={ { color: tokens.red } }>
					<ListItemIcon><DeleteOutlineIcon fontSize="small" sx={ { color: tokens.red } } /></ListItemIcon>
					Cancel &amp; archive
				</MenuItem>
			</Menu>
		</Stack>
	);
}

const BLANK = { name: '', phone: '', email: '', party: 2, time: '19:00', notes: '' };

function NewBooking( { initialDate, initialTime, initialTable, onCreated, onCancel, bare, editing, onStatus } ) {
	const [ confirmCancel, setConfirmCancel ] = useState( false );
	const [ form, setForm ] = useState( editing
		? {
			name: editing.name || '',
			phone: editing.phone || '',
			email: editing.email || '',
			party: editing.party || 2,
			time: editing.time || BLANK.time,
			notes: editing.notes || '',
			date: editing.date || initialDate,
		}
		: { ...BLANK, date: initialDate, time: initialTime || BLANK.time } );
	const [ avail, setAvail ] = useState( null ); // null | { available, tables, combos }
	const [ checking, setChecking ] = useState( false );
	const [ tableId, setTableId ] = useState( 0 ); // 0 = auto
	const [ comboId, setComboId ] = useState( 0 ); // 0 = none
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ guests, setGuests ] = useState( [] ); // CRM directory for returning-guest search.
	const [ sugOpen, setSugOpen ] = useState( false );
	const [ intel, setIntel ] = useState( null ); // Merged CRM record for the guest being edited.
	const [ sms, setSms ] = useState( null ); // { configured, waitlist } — gates the table-ready button.
	const [ smsNote, setSmsNote ] = useState( '' );
	const debounce = useRef( null );

	// Load the guest directory once (new bookings only) so we can recognise
	// returning guests and pre-fill their details.
	useEffect( () => {
		if ( editing ) {
			// Editing an existing booking: pull the guest's merged CRM record
			// (VIP, allergies, visits, spend, points, no-shows) for the floor.
			if ( editing.email || editing.phone ) {
				api.getGuestIntel( { email: editing.email || '', phone: editing.phone || '', name: editing.name || '' } )
					.then( setIntel )
					.catch( () => {} );
			}
			if ( editing.phone ) {
				api.getSmsStatus().then( setSms ).catch( () => {} );
			}
			return;
		}
		api.getGuests().then( ( g ) => setGuests( Array.isArray( g ) ? g : ( ( g && g.guests ) || [] ) ) ).catch( () => {} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const intelMoney = ( n ) => {
		const v = Number( n || 0 ).toFixed( 2 );
		const sym = ( intel && intel.currency ) || '£';
		return ( intel && intel.curPos ) === 'after' ? `${ v }${ sym }` : `${ sym }${ v }`;
	};

	const nq = form.name.trim().toLowerCase();
	const guestMatches = ( ! editing && nq.length >= 2 && sugOpen )
		? guests.filter( ( g ) => ( g.name || '' ).toLowerCase().includes( nq ) || ( g.phone || '' ).includes( nq ) || ( g.email || '' ).toLowerCase().includes( nq ) ).slice( 0, 6 )
		: [];
	const pickGuest = ( g ) => {
		set( { name: g.name || '', phone: g.phone || '', email: g.email || '' } );
		setSugOpen( false );
	};
	// Pre-select a table/combo once availability loads: the timeline-clicked table
	// when creating, or the booking's own table/combo when editing.
	const prefillTable = useRef( ( editing && editing.tableId ) || initialTable || 0 );
	const prefillCombo = useRef( ( editing && editing.comboId ) || 0 );

	const set = ( patch ) => setForm( ( f ) => ( { ...f, ...patch } ) );

	// Re-check availability whenever date/time/party change.
	useEffect( () => {
		setAvail( null );
		setTableId( 0 );
		setComboId( 0 );
		if ( ! form.date || ! form.time || ! form.party ) {
			return;
		}
		clearTimeout( debounce.current );
		setChecking( true );
		debounce.current = setTimeout( () => {
			api.getAvailability( { date: form.date, time: form.time, party: form.party, exclude: editing ? editing.id : 0 } )
				.then( ( res ) => setAvail( res ) )
				.finally( () => setChecking( false ) );
		}, 350 );
		return () => clearTimeout( debounce.current );
	}, [ form.date, form.time, form.party ] );

	// Pre-select the table clicked in the timeline (or the edited booking's own
	// table/combo), once it's confirmed available.
	useEffect( () => {
		if ( avail && prefillTable.current && ( avail.tables || [] ).some( ( t ) => t.id === prefillTable.current ) ) {
			setTableId( prefillTable.current );
			prefillTable.current = 0;
		}
		if ( avail && prefillCombo.current && ( avail.combos || [] ).some( ( c ) => c.id === prefillCombo.current ) ) {
			setComboId( prefillCombo.current );
			prefillCombo.current = 0;
		}
	}, [ avail ] );

	const noTables = avail && ! avail.available;

	const save = async ( status ) => {
		setSaving( true );
		setError( '' );
		try {
			const payload = {
				date: form.date,
				time: form.time,
				party: Number( form.party ),
				name: form.name,
				phone: form.phone,
				email: form.email,
				notes: form.notes,
				tableId: tableId || 0,
				comboId: comboId || 0,
			};
			const booking = editing
				? await api.updateBooking( editing.id, payload )
				: await api.createBooking( { ...payload, status } );
			onCreated( booking );
		} catch ( e ) {
			setError( e.message || 'Could not save the booking.' );
		} finally {
			setSaving( false );
		}
	};

	return (
		<>
		<Box
			sx={ bare
				? { p: 3 }
				: {
					bgcolor: tokens.surface,
					border: `1px solid ${ tokens.border }`,
					borderRadius: 3,
					p: 2.5,
					mb: 2,
				} }
		>
			<Typography variant="subtitle2" sx={ { mb: 2, color: tokens.ink } }>
				{ editing ? 'Edit booking' : 'New booking' }
			</Typography>

			{ /* Guest intel — who's walking in: VIP, allergies, history, spend. */ }
			{ editing && intel && ( intel.vip || intel.visits > 0 || intel.orders > 0 || intel.points > 0 || intel.noShows > 0 || intel.allergens || ( intel.tags || [] ).length > 0 || intel.notes ) && (
				<Box sx={ { mb: 2, p: 1.25, borderRadius: '10px', bgcolor: tokens.soft, border: `1px solid ${ tokens.border }` } }>
					<Stack direction="row" spacing={ 0.75 } alignItems="center" flexWrap="wrap" useFlexGap>
						{ intel.vip && <Chip label="⭐ VIP" size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 700, bgcolor: tokens.amberSoft, color: tokens.amber } } /> }
						{ intel.allergens && (
							<Chip label={ `⚠ ${ intel.allergens }` } size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 700, bgcolor: tokens.redSoft, color: tokens.red } } />
						) }
						{ ( intel.tags || [] ).map( ( t ) => (
							<Chip key={ t } label={ t } size="small" sx={ { height: 20, fontSize: 11, bgcolor: tokens.surface, color: tokens.ink2, fontWeight: 600 } } />
						) ) }
						{ intel.visits > 0 && (
							<Chip label={ `${ intel.visits } visit${ intel.visits === 1 ? '' : 's' }` } size="small" sx={ { height: 20, fontSize: 11, bgcolor: tokens.surface, color: tokens.ink2, fontWeight: 600 } } />
						) }
						{ intel.spend > 0 && (
							<Chip label={ `${ intelMoney( intel.spend ) } lifetime · avg ${ intelMoney( intel.avgSpend ) }` } size="small" sx={ { height: 20, fontSize: 11, bgcolor: tokens.greenSoft, color: tokens.green, fontWeight: 700 } } />
						) }
						{ intel.points > 0 && (
							<Chip label={ `${ intel.points } pts` } size="small" sx={ { height: 20, fontSize: 11, bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 700 } } />
						) }
						{ intel.noShows > 0 && (
							<Chip label={ `${ intel.noShows } no-show${ intel.noShows === 1 ? '' : 's' }` } size="small" sx={ { height: 20, fontSize: 11.5, fontWeight: 700, bgcolor: tokens.redSoft, color: tokens.red } } />
						) }
					</Stack>
					{ intel.notes && (
						<Typography sx={ { fontSize: 12, color: tokens.ink2, mt: 0.75, fontStyle: 'italic' } }>
							“{ intel.notes }”
						</Typography>
					) }
				</Box>
			) }

			{ editing && onStatus && (
				<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
					<Select
						size="small"
						value={ editing.status }
						onChange={ ( e ) => onStatus( e.target.value ) }
						sx={ { minWidth: 150, fontWeight: 600, color: statusMeta( editing.status ).fg, bgcolor: statusMeta( editing.status ).bg, borderRadius: '8px', '& fieldset': { border: 'none' } } }
					>
						{ STATUSES.map( ( s ) => <MenuItem key={ s.key } value={ s.key }>{ s.label }</MenuItem> ) }
					</Select>
					{ 'seated' !== editing.status && ! [ 'cancelled', 'no_show', 'completed' ].includes( editing.status ) && (
						<Button size="small" variant="contained" onClick={ () => onStatus( 'seated' ) } sx={ { bgcolor: tokens.green, '&:hover': { bgcolor: tokens.green } } }>
							Seat now
						</Button>
					) }
					{ /* Waitlist rescue: one tap texts the guest their table is free. */ }
					{ sms && sms.waitlist && editing.phone && ! [ 'cancelled', 'no_show', 'completed', 'seated' ].includes( editing.status ) && (
						<Button
							size="small"
							variant="outlined"
							onClick={ async () => {
								setSmsNote( '' );
								try {
									await api.smsTableReady( editing.id );
									setSmsNote( `✓ Texted ${ editing.phone } — table ready` );
								} catch ( e ) {
									setSmsNote( `✗ ${ e.message || 'Text failed' }` );
								}
							} }
						>
							📱 Text: table ready
						</Button>
					) }
					{ smsNote && (
						<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: smsNote.startsWith( '✓' ) ? tokens.green : tokens.red } }>{ smsNote }</Typography>
					) }
					<Box sx={ { flex: 1 } } />
					{ ! [ 'cancelled', 'no_show' ].includes( editing.status ) && (
						<Button size="small" color="error" onClick={ () => setConfirmCancel( true ) }>Cancel booking</Button>
					) }
				</Stack>
			) }

			<Stack direction="row" flexWrap="wrap" gap={ 1.5 }>
				<TextField
					label="Date"
					type="date"
					value={ form.date }
					onChange={ ( e ) => set( { date: e.target.value } ) }
					InputLabelProps={ { shrink: true } }
					sx={ { width: 160 } }
				/>
				<TextField
					label="Time"
					type="time"
					value={ form.time }
					onChange={ ( e ) => set( { time: e.target.value } ) }
					InputLabelProps={ { shrink: true } }
					sx={ { width: 120 } }
				/>
				<TextField
					label="Guests"
					type="number"
					value={ form.party }
					onChange={ ( e ) => set( { party: Math.max( 1, parseInt( e.target.value, 10 ) || 1 ) } ) }
					inputProps={ { min: 1 } }
					sx={ { width: 96 } }
				/>
				<Box sx={ { position: 'relative', flex: 1, minWidth: 160 } }>
					<TextField
						label="Name"
						value={ form.name }
						onChange={ ( e ) => { set( { name: e.target.value } ); setSugOpen( true ); } }
						onFocus={ () => setSugOpen( true ) }
						onBlur={ () => setTimeout( () => setSugOpen( false ), 150 ) }
						fullWidth
					/>
					{ guestMatches.length > 0 && (
						<Box sx={ { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, mt: 0.5, bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 2, boxShadow: tokens.shadowSm, overflow: 'hidden' } }>
							{ guestMatches.map( ( g, i ) => (
								<Box key={ i } onMouseDown={ () => pickGuest( g ) } sx={ { px: 1.5, py: 1, cursor: 'pointer', '&:hover': { bgcolor: tokens.soft } } }>
									<Typography sx={ { fontSize: 13.5, fontWeight: 600, color: tokens.ink } }>{ g.name || 'Guest' }{ g.vip ? ' ⭐' : '' }</Typography>
									<Typography sx={ { fontSize: 12, color: tokens.muted } }>
										{ [ g.phone, g.email, g.visits ? `${ g.visits } visit${ g.visits === 1 ? '' : 's' }` : '', ( g.allergens && g.allergens.length ) ? `${ g.allergens.length } allergen${ g.allergens.length === 1 ? '' : 's' }` : '' ].filter( Boolean ).join( ' · ' ) }
									</Typography>
								</Box>
							) ) }
						</Box>
					) }
				</Box>
			</Stack>

			<Stack direction="row" flexWrap="wrap" gap={ 1.5 } sx={ { mt: 1.5 } }>
				<TextField
					label="Phone"
					value={ form.phone }
					onChange={ ( e ) => set( { phone: e.target.value } ) }
					sx={ { width: 180 } }
				/>
				<TextField
					label="Email"
					type="email"
					value={ form.email }
					onChange={ ( e ) => set( { email: e.target.value } ) }
					sx={ { width: 220 } }
				/>
				<TextField
					label="Notes (allergies, occasion…)"
					value={ form.notes }
					onChange={ ( e ) => set( { notes: e.target.value } ) }
					sx={ { flex: 1, minWidth: 200 } }
				/>
			</Stack>

			{ /* Availability feedback */ }
			<Box sx={ { mt: 2, minHeight: 40 } }>
				{ checking && (
					<Stack direction="row" spacing={ 1 } alignItems="center" sx={ { color: tokens.muted } }>
						<CircularProgress size={ 16 } />
						<Typography sx={ { fontSize: 13 } }>Checking availability…</Typography>
					</Stack>
				) }

				{ ! checking && avail && avail.available && (
					<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap>
						<CheckCircleIcon sx={ { color: tokens.green, fontSize: 18 } } />
						<Typography sx={ { fontSize: 13, color: tokens.ink2, fontWeight: 600, mr: 0.5 } }>
							{ avail.tables.length === 0 && ( avail.combos || [] ).length > 0 ? 'Join available:' : 'Free to book:' }
						</Typography>
						<Chip
							label="Auto-assign"
							onClick={ () => { setTableId( 0 ); setComboId( 0 ); } }
							variant={ tableId === 0 && comboId === 0 ? 'filled' : 'outlined' }
							size="small"
							sx={ {
								fontWeight: 700,
								bgcolor: tableId === 0 && comboId === 0 ? tokens.accentSoft : 'transparent',
								color: tableId === 0 && comboId === 0 ? tokens.accentDark : tokens.muted,
							} }
						/>
						{ avail.tables.map( ( t ) => (
							<Chip
								key={ t.id }
								label={ `${ t.name } · ${ t.seats }` }
								onClick={ () => { setTableId( t.id ); setComboId( 0 ); } }
								variant={ tableId === t.id ? 'filled' : 'outlined' }
								size="small"
								sx={ {
									fontWeight: 700,
									bgcolor: tableId === t.id ? tokens.accentSoft : 'transparent',
									color: tableId === t.id ? tokens.accentDark : tokens.ink2,
								} }
							/>
						) ) }
						{ ( avail.combos || [] ).map( ( c ) => (
							<Chip
								key={ 'c' + c.id }
								icon={ <JoinFullIcon sx={ { fontSize: 15 } } /> }
								label={ `${ c.name } · ${ c.seats }` }
								onClick={ () => { setComboId( c.id ); setTableId( 0 ); } }
								variant={ comboId === c.id ? 'filled' : 'outlined' }
								size="small"
								sx={ {
									fontWeight: 700,
									bgcolor: comboId === c.id ? tokens.accentSoft : 'transparent',
									color: comboId === c.id ? tokens.accentDark : tokens.ink2,
								} }
							/>
						) ) }
					</Stack>
				) }

				{ ! checking && noTables && (
					<Alert
						severity="warning"
						sx={ { py: 0, '& .MuiAlert-message': { fontSize: 13 } } }
					>
						No tables free at { form.time } for { form.party }. You can still pencil it in — the
						guest confirms later, or you shuffle tables.
					</Alert>
				) }

				{ ! checking && avail && avail.overCap && (
					<Alert
						severity="info"
						sx={ { mt: noTables ? 1 : 0, py: 0, '& .MuiAlert-message': { fontSize: 13 } } }
					>
						Over your covers-per-hour cap for this time — the online widget would offer the
						waitlist here. You can still book it in.
					</Alert>
				) }

				{ ! checking && avail && ! avail.available && ( avail.suggestions || [] ).length > 0 && (
					<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mt: 1 } }>
						<Typography sx={ { fontSize: 13, color: tokens.muted, fontWeight: 600 } }>Next free:</Typography>
						{ avail.suggestions.map( ( s ) => (
							<Chip
								key={ s }
								label={ s }
								size="small"
								onClick={ () => set( { time: s } ) }
								sx={ { fontWeight: 700, bgcolor: tokens.accentSoft, color: tokens.accentDark, cursor: 'pointer' } }
							/>
						) ) }
					</Stack>
				) }
			</Box>

			{ error && (
				<Alert severity="error" sx={ { mt: 1.5, fontSize: 13 } }>
					{ error }
				</Alert>
			) }

			<Divider sx={ { my: 2 } } />
			<Stack direction="row" spacing={ 1 } justifyContent="flex-end">
				<Button onClick={ onCancel } sx={ { color: tokens.muted } }>
					Cancel
				</Button>
				{ editing ? (
					<Button
						variant="contained"
						disabled={ saving || checking }
						onClick={ () => save( editing.status ) }
					>
						{ saving ? 'Saving…' : 'Save changes' }
					</Button>
				) : noTables ? (
					<Button
						variant="contained"
						color="warning"
						disabled={ saving }
						onClick={ () => save( 'provisional' ) }
					>
						Pencil in
					</Button>
				) : (
					<Button
						variant="contained"
						disabled={ saving || checking }
						onClick={ () => save( 'confirmed' ) }
					>
						{ saving ? 'Saving…' : 'Confirm booking' }
					</Button>
				) }
			</Stack>
		</Box>
		{ editing && onStatus && (
			<ConfirmDialog
				open={ confirmCancel }
				title="Cancel this booking?"
				message={ editing.depositPaid ? 'The booking is cancelled and the deposit is refunded.' : 'This booking will be cancelled.' }
				confirmLabel="Cancel booking"
				onConfirm={ () => { setConfirmCancel( false ); onStatus( 'cancelled' ); if ( onCancel ) { onCancel(); } } }
				onCancel={ () => setConfirmCancel( false ) }
			/>
		) }
		</>
	);
}

// Full booking detail: reservation, guest, deposit/payment (+Stripe link),
// history trail, and a Cancel & refund override.
function BookingDetail( { booking, onClose, onCancel, onEdit } ) {
	const [ confirmCancel, setConfirmCancel ] = useState( false );
	const m = statusMeta( booking.status );
	const fmt = ( iso ) => { try { return new Date( iso ).toLocaleString(); } catch ( e ) { return iso; } };
	const canCancel = ! [ 'cancelled', 'no_show', 'completed' ].includes( booking.status );
	const stripeUrl = booking.depositPi ? `https://dashboard.stripe.com/${ api.config.stripeMode === 'live' ? '' : 'test/' }payments/${ booking.depositPi }` : '';
	return (
		<>
		<Box sx={ { p: 3 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<Typography variant="h6" sx={ { fontSize: 18 } }>{ booking.name || 'Guest' }</Typography>
				<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
			</Stack>
			<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
				<Chip label={ m.label } size="small" sx={ { fontWeight: 600, color: m.fg, bgcolor: m.bg } } />
				{ booking.depositPaid && <Chip label={ booking.depositAmount ? `Deposit £${ ( booking.depositAmount / 100 ).toFixed( 2 ) } paid` : 'Deposit paid' } size="small" sx={ { fontWeight: 600, color: tokens.green, bgcolor: tokens.greenSoft } } /> }
			</Stack>

			{ booking.refundDue && (
				<Box sx={ { mb: 2, p: 1.5, borderRadius: 2, bgcolor: tokens.redSoft } }>
					<Stack direction="row" spacing={ 1 } alignItems="center">
						<ErrorOutlineIcon sx={ { fontSize: 16, color: tokens.red } } />
						<Typography sx={ { fontSize: 13, color: tokens.red, fontWeight: 600 } }>A deposit refund is owed — refund the guest in Stripe.</Typography>
					</Stack>
				</Box>
			) }

			<Stack direction="row" spacing={ 1 } sx={ { mb: 2 } } flexWrap="wrap" useFlexGap>
				{ onEdit && (
					<Button size="small" variant="contained" onClick={ onEdit }>
						Edit booking
					</Button>
				) }
				{ canCancel && (
					<Button size="small" variant="outlined" color="error"
						onClick={ () => setConfirmCancel( true ) }>
						{ booking.depositPaid ? 'Cancel & refund' : 'Cancel booking' }
					</Button>
				) }
			</Stack>

			<DetailSection title="Reservation">
				<DetailRow label="Date" value={ booking.date } />
				<DetailRow label="Time" value={ booking.time } />
				<DetailRow label="Party" value={ `${ booking.party } ${ booking.party === 1 ? 'guest' : 'guests' }` } />
				<DetailRow label="Table" value={ booking.table || 'Unassigned' } />
				{ booking.source && <DetailRow label="Source" value={ booking.source } /> }
			</DetailSection>

			<DetailSection title="Guest">
				<DetailRow label="Name" value={ booking.name || '—' } />
				{ booking.email && <DetailRow label="Email" value={ booking.email } /> }
				{ booking.phone && <DetailRow label="Phone" value={ booking.phone } /> }
			</DetailSection>

			{ booking.notes && (
				<DetailSection title="Notes">
					<Typography sx={ { fontSize: 13, fontStyle: 'italic', color: tokens.ink2 } }>“{ booking.notes }”</Typography>
				</DetailSection>
			) }

			{ ( booking.depositRequired || booking.depositPaid || booking.depositPi ) && (
				<DetailSection title="Deposit">
					<DetailRow label="Status" value={ booking.depositPaid ? 'Paid' : ( booking.depositRequired ? 'Due' : '—' ) } />
					{ booking.depositAmount > 0 && <DetailRow label="Amount" value={ `£${ ( booking.depositAmount / 100 ).toFixed( 2 ) }` } /> }
					{ booking.depositPi && (
						<DetailRow label="Stripe" mono value={
							<Box component="a" href={ stripeUrl } target="_blank" rel="noopener" sx={ { color: tokens.accent, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } } }>{ booking.depositPi } ↗</Box>
						} />
					) }
				</DetailSection>
			) }

			{ ( booking.history || [] ).length > 0 && (
				<DetailSection title="History">
					<Stack spacing={ 0.5 }>
						{ booking.history.map( ( h, i ) => (
							<Stack key={ i } direction="row" spacing={ 1 }>
								<Typography sx={ { color: tokens.muted2, minWidth: 130, fontSize: 12 } }>{ fmt( h.t ) }</Typography>
								<Typography sx={ { color: tokens.ink2, fontSize: 12.5 } }>{ h.e }</Typography>
							</Stack>
						) ) }
					</Stack>
				</DetailSection>
			) }
		</Box>
		<ConfirmDialog
			open={ confirmCancel }
			title={ booking.depositPaid ? 'Cancel booking & refund deposit?' : 'Cancel this booking?' }
			message={ booking.depositPaid ? 'The booking is cancelled and the deposit is refunded.' : 'This booking will be cancelled.' }
			confirmLabel={ booking.depositPaid ? 'Cancel & refund' : 'Cancel booking' }
			onConfirm={ () => { setConfirmCancel( false ); onCancel(); } }
			onCancel={ () => setConfirmCancel( false ) }
		/>
		</>
	);
}
