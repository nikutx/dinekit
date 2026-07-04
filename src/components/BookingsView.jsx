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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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

export default function BookingsView() {
	const [ date, setDate ] = useState( isoDate() );
	const [ bookings, setBookings ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ adding, setAdding ] = useState( false );
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

	const setStatus = ( id, status ) => {
		setBookings( ( bs ) => bs.map( ( b ) => ( b.id === id ? { ...b, status } : b ) ) );
		api.updateBooking( id, { status } );
	};

	const remove = async ( id ) => {
		await api.deleteBooking( id );
		setBookings( ( bs ) => bs.filter( ( b ) => b.id !== id ) );
	};

	const printDay = () => {
		const active = bookings.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) );
		let body = '<h1>Bookings — ' + esc( prettyDate( date ) ) + '</h1>';
		body += '<p class="dk-sub">' + active.length + ' bookings · ' + covers + ' covers</p><div class="dk-grid">';
		active.forEach( ( b ) => {
			body += '<div class="dk-ticket"><h3>' + esc( b.time ) + ' — ' + esc( b.name || 'Guest' ) + '</h3>';
			body += '<p class="dk-meta">' + b.party + ' guests' + ( b.table ? ' · ' + esc( b.table ) : '' ) +
				( b.phone ? ' · ' + esc( b.phone ) : '' ) + '</p>';
			body += '<p class="dk-meta">' + esc( statusMeta( b.status ).label ) + '</p>';
			if ( b.notes ) {
				body += '<p class="dk-flag">“' + esc( b.notes ) + '”</p>';
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
		body += '<p class="dk-sub">' + s.bookings + ' booking' + ( s.bookings === 1 ? '' : 's' ) +
			' · ' + s.covers + ' covers</p>';

		if ( s.allergenAlert.length ) {
			body += '<div class="dk-section-title">⚠ Allergen alerts</div>';
			body += '<p class="dk-allergen" style="font-size:15px">' +
				s.allergenAlert.map( esc ).join( ' · ' ) + '</p>';
		}

		body += '<div class="dk-section-title">Run sheet</div>';
		if ( ! s.rows.length ) {
			body += '<p class="dk-sub">No bookings for this day.</p>';
		}
		s.rows.forEach( ( r ) => {
			const flags = [];
			if ( r.vip ) {
				flags.push( '★ VIP' );
			}
			( r.tags || [] ).forEach( ( t ) => flags.push( t ) );
			body += '<div class="dk-ticket"><h3>' + esc( r.time ) + ' — ' + esc( r.name || 'Guest' ) +
				' <span style="font-weight:400;color:#64748b">(' + r.party + 'p)</span></h3>';
			body += '<p class="dk-meta">' + ( r.table ? esc( r.table ) : 'Table TBC' ) +
				( r.phone ? ' · ' + esc( r.phone ) : '' ) + '</p>';
			if ( flags.length ) {
				body += '<p class="dk-flag"><strong>' + flags.map( esc ).join( ' · ' ) + '</strong></p>';
			}
			if ( r.allergens ) {
				body += '<p class="dk-flag dk-allergen">Allergies: ' + esc( r.allergens ) + '</p>';
			}
			if ( r.guestNote ) {
				body += '<p class="dk-flag">Note: ' + esc( r.guestNote ) + '</p>';
			}
			if ( r.notes ) {
				body += '<p class="dk-flag">“' + esc( r.notes ) + '”</p>';
			}
			body += '</div>';
		} );

		if ( s.prep.length ) {
			body += '<div class="dk-section-title">Covers by hour</div>';
			s.prep.forEach( ( p ) => {
				body += '<div class="dk-row"><span>' + esc( p.hour ) + '</span><strong>' +
					p.covers + ' covers</strong></div>';
			} );
		}

		if ( s.events.length ) {
			body += '<div class="dk-section-title">Events today</div>';
			s.events.forEach( ( e ) => {
				body += '<div class="dk-row"><span>' + esc( e.name ) + '</span><strong>' +
					esc( e.time || '' ) + '</strong></div>';
			} );
		}

		printDoc( 'Service sheet — ' + prettyDate( date ), body );
	};

	const onCreated = ( booking ) => {
		setAdding( false );
		if ( booking.date === date ) {
			setBookings( ( bs ) =>
				[ ...bs, booking ].sort( ( a, b ) => ( a.time > b.time ? 1 : -1 ) )
			);
		} else {
			setDate( booking.date );
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
						<Button variant="contained" startIcon={ <AddIcon /> } onClick={ () => setAdding( ( v ) => ! v ) }>
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

			<Collapse in={ adding } unmountOnExit>
				<NewBooking initialDate={ date } onCreated={ onCreated } onCancel={ () => setAdding( false ) } />
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
							width: 148,
							'& .MuiOutlinedInput-root': { boxShadow: tokens.shadowSm },
							'& fieldset': { border: 'none' },
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
		</Page>
	);
}

function BookingRow( { booking, onStatus, onDelete, onRequestReview } ) {
	const meta = statusMeta( booking.status );
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
			{ booking.email && (
				<Tooltip title="Ask this guest for a review">
					<IconButton size="small" onClick={ onRequestReview } sx={ { color: tokens.muted2 } }>
						<StarBorderIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			) }
			<Tooltip title="Cancel &amp; archive (refunds a paid deposit; kept on record)">
				<IconButton size="small" onClick={ onDelete } sx={ { color: tokens.muted2 } }>
					<DeleteOutlineIcon fontSize="small" />
				</IconButton>
			</Tooltip>
		</Stack>
	);
}

const BLANK = { name: '', phone: '', email: '', party: 2, time: '19:00', notes: '' };

function NewBooking( { initialDate, onCreated, onCancel } ) {
	const [ form, setForm ] = useState( { ...BLANK, date: initialDate } );
	const [ avail, setAvail ] = useState( null ); // null | { available, tables, combos }
	const [ checking, setChecking ] = useState( false );
	const [ tableId, setTableId ] = useState( 0 ); // 0 = auto
	const [ comboId, setComboId ] = useState( 0 ); // 0 = none
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const debounce = useRef( null );

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
			api.getAvailability( { date: form.date, time: form.time, party: form.party } )
				.then( ( res ) => setAvail( res ) )
				.finally( () => setChecking( false ) );
		}, 350 );
		return () => clearTimeout( debounce.current );
	}, [ form.date, form.time, form.party ] );

	const noTables = avail && ! avail.available;

	const save = async ( status ) => {
		setSaving( true );
		setError( '' );
		try {
			const booking = await api.createBooking( {
				date: form.date,
				time: form.time,
				party: Number( form.party ),
				name: form.name,
				phone: form.phone,
				email: form.email,
				notes: form.notes,
				tableId: tableId || 0,
				comboId: comboId || 0,
				status,
			} );
			onCreated( booking );
		} catch ( e ) {
			setError( e.message || 'Could not save the booking.' );
		} finally {
			setSaving( false );
		}
	};

	return (
		<Box
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: 3,
				p: 2.5,
				mb: 2,
			} }
		>
			<Typography variant="subtitle2" sx={ { mb: 2, color: tokens.ink } }>
				New booking
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
				{ noTables ? (
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
