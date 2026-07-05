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
	const [ floor, setFloor ] = useState( { areas: [], tables: [], combos: [] } );
	const [ svc, setSvc ] = useState( { openMin: 720, closeMin: 1320 } );
	const [ turnMin, setTurnMin ] = useState( 120 );
	const [ events, setEvents ] = useState( [] );

	// Events share the day with bookings — surface them in the diary + timeline.
	useEffect( () => {
		api.getEvents().then( ( e ) => setEvents( e || [] ) ).catch( () => {} );
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
	const createAt = ( tableId, time ) => {
		setPrefill( { time, tableId } );
		setPopupAdd( true );
	};

	// Click a booking on the timeline → edit it in a popup.
	const [ editBooking, setEditBooking ] = useState( null );
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
	const addWalkIn = async () => {
		const now = new Date();
		let min = now.getHours() * 60 + now.getMinutes();
		min = Math.max( svc.openMin, Math.min( svc.closeMin, Math.round( min / 15 ) * 15 ) );
		const p2 = ( n ) => ( n < 10 ? '0' : '' ) + n;
		const time = p2( Math.floor( min / 60 ) ) + ':' + p2( min % 60 );
		try {
			const booking = await api.createBooking( { date, time, party: 2, name: 'Walk-in', status: 'seated', tableId: 0, comboId: 0 } );
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
			) : (
				<Stack spacing={ 3 }>
					{ [
						{ key: 'lunch', label: 'Lunch', rows: bookings.filter( ( b ) => ( b.time || '' ) < '16:00' ) },
						{ key: 'dinner', label: 'Dinner', rows: bookings.filter( ( b ) => ( b.time || '' ) >= '16:00' ) },
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
												onStatus={ ( s ) => setStatus( b.id, s ) }
												onDelete={ () => remove( b.id ) }
												onRequestReview={ () => askReview( b.id ) }
												onOpen={ () => setDetail( b ) }
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
			<Drawer anchor="right" open={ !! detail } onClose={ () => setDetail( null ) } disableEnforceFocus sx={ { zIndex: 100000 } } PaperProps={ { sx: { width: { xs: '100%', sm: 460 } } } }>
				{ detail && <BookingDetail booking={ detail } onClose={ () => setDetail( null ) } onCancel={ () => setStatus( detail.id, 'cancelled' ) } /> }
			</Drawer>
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
					/>
				) }
			</Modal>
		</Page>
	);
}

function BookingRow( { booking, onStatus, onDelete, onRequestReview, onOpen } ) {
	const meta = statusMeta( booking.status );
	const [ menuEl, setMenuEl ] = useState( null );
	const closeMenu = () => setMenuEl( null );
	const run = ( fn ) => () => { closeMenu(); fn(); };
	return (
		<Stack
			direction="row"
			spacing={ 1.75 }
			alignItems="center"
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: '12px',
				pl: 1.25,
				pr: 2,
				py: 1.25,
			} }
		>
			{ /* Status rail */ }
			<Box sx={ { width: 3, borderRadius: 999, alignSelf: 'stretch', bgcolor: meta.fg, flexShrink: 0 } } />
			<Typography sx={ { fontWeight: 650, fontSize: 15, width: 52, color: tokens.ink, fontVariantNumeric: 'tabular-nums' } }>
				{ booking.time }
			</Typography>
			<Box sx={ { flex: 1, minWidth: 0 } }>
				<Typography sx={ { fontWeight: 600, fontSize: 14, color: tokens.ink } } noWrap>
					{ booking.name || 'Guest' }
				</Typography>
				<Typography sx={ { fontSize: 12.5, color: tokens.muted } } noWrap>
					{ booking.party } { booking.party === 1 ? 'guest' : 'guests' }
					{ booking.table ? ` · ${ booking.table }` : ' · no table' }
					{ booking.phone ? ` · ${ booking.phone }` : '' }
				</Typography>
			</Box>
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

function NewBooking( { initialDate, initialTime, initialTable, onCreated, onCancel, bare, editing } ) {
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
	const debounce = useRef( null );
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
				<TextField
					label="Name"
					value={ form.name }
					onChange={ ( e ) => set( { name: e.target.value } ) }
					sx={ { flex: 1, minWidth: 160 } }
				/>
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
	);
}

// Full booking detail: reservation, guest, deposit/payment (+Stripe link),
// history trail, and a Cancel & refund override.
function BookingDetail( { booking, onClose, onCancel } ) {
	const m = statusMeta( booking.status );
	const fmt = ( iso ) => { try { return new Date( iso ).toLocaleString(); } catch ( e ) { return iso; } };
	const canCancel = ! [ 'cancelled', 'no_show', 'completed' ].includes( booking.status );
	const stripeUrl = booking.depositPi ? `https://dashboard.stripe.com/${ api.config.stripeMode === 'live' ? '' : 'test/' }payments/${ booking.depositPi }` : '';
	return (
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

			{ canCancel && (
				<Button size="small" variant="outlined" color="error" sx={ { mb: 2 } }
					onClick={ () => { if ( window.confirm( booking.depositPaid ? 'Cancel this booking and refund the deposit?' : 'Cancel this booking?' ) ) { onCancel(); } } }>
					{ booking.depositPaid ? 'Cancel & refund' : 'Cancel booking' }
				</Button>
			) }

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
	);
}
