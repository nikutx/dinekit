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
	Switch,
	Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import TuneIcon from '@mui/icons-material/Tune';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PrintIcon from '@mui/icons-material/Print';
import { tokens } from '../theme';
import { api } from '../api/client';
import { STATUSES, statusMeta, isoDate, addDays, prettyDate } from '../lib/bookings';
import { printDoc, esc } from '../lib/print';

export default function BookingsView() {
	const [ date, setDate ] = useState( isoDate() );
	const [ bookings, setBookings ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ adding, setAdding ] = useState( false );
	const [ settingsOpen, setSettingsOpen ] = useState( false );

	const load = useCallback( ( d ) => {
		setLoading( true );
		api.listBookings( { from: d } )
			.then( ( rows ) => setBookings( rows || [] ) )
			.finally( () => setLoading( false ) );
	}, [] );

	useEffect( () => {
		load( date );
	}, [ date, load ] );

	const covers = bookings
		.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) )
		.reduce( ( s, b ) => s + ( b.party || 0 ), 0 );

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

	return (
		<Box sx={ { maxWidth: 900, mx: 'auto' } }>
			<Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={ { mb: 2 } }>
				<Box>
					<Typography variant="h5">Bookings</Typography>
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>
						Your booking diary — take a reservation and see who&apos;s coming in.
					</Typography>
				</Box>
				<Stack direction="row" spacing={ 1 }>
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
				</Stack>
			</Stack>

			<Collapse in={ settingsOpen } unmountOnExit>
				<BookingSettings />
			</Collapse>

			<Collapse in={ adding } unmountOnExit>
				<NewBooking initialDate={ date } onCreated={ onCreated } onCancel={ () => setAdding( false ) } />
			</Collapse>

			{ /* Day navigator */ }
			<Stack
				direction="row"
				alignItems="center"
				spacing={ 1 }
				sx={ {
					bgcolor: tokens.surface,
					border: `1px solid ${ tokens.border }`,
					borderRadius: 3,
					px: 1.5,
					py: 1,
					mb: 2,
				} }
			>
				<IconButton size="small" onClick={ () => setDate( addDays( date, -1 ) ) }>
					<ChevronLeftIcon />
				</IconButton>
				<TextField
					type="date"
					value={ date }
					onChange={ ( e ) => setDate( e.target.value || isoDate() ) }
					sx={ { width: 160 } }
				/>
				<IconButton size="small" onClick={ () => setDate( addDays( date, 1 ) ) }>
					<ChevronRightIcon />
				</IconButton>
				<Button size="small" onClick={ () => setDate( isoDate() ) } sx={ { color: tokens.accent } }>
					Today
				</Button>
				<Box sx={ { flex: 1 } } />
				<Typography sx={ { fontWeight: 700, color: tokens.ink } }>{ prettyDate( date ) }</Typography>
				<Chip
					icon={ <EventSeatIcon sx={ { fontSize: 16 } } /> }
					label={ `${ covers } cover${ covers === 1 ? '' : 's' }` }
					sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 700 } }
				/>
				<Tooltip title="Print reservation slips">
					<span>
						<IconButton size="small" onClick={ printDay } disabled={ bookings.length === 0 } sx={ { color: tokens.muted } }>
							<PrintIcon fontSize="small" />
						</IconButton>
					</span>
				</Tooltip>
			</Stack>

			{ loading ? (
				<Box sx={ { display: 'flex', justifyContent: 'center', mt: 6 } }>
					<CircularProgress />
				</Box>
			) : bookings.length === 0 ? (
				<Box
					sx={ {
						border: `1px dashed ${ tokens.border2 }`,
						borderRadius: 3,
						p: 5,
						textAlign: 'center',
						color: tokens.muted,
					} }
				>
					<Typography sx={ { fontWeight: 700, color: tokens.ink2 } }>No bookings for this day</Typography>
					<Typography sx={ { fontSize: 14, mt: 0.5 } }>
						Click <strong>New booking</strong> to add one.
					</Typography>
				</Box>
			) : (
				<Stack spacing={ 1 }>
					{ bookings.map( ( b ) => (
						<BookingRow
							key={ b.id }
							booking={ b }
							onStatus={ ( s ) => setStatus( b.id, s ) }
							onDelete={ () => remove( b.id ) }
						/>
					) ) }
				</Stack>
			) }
		</Box>
	);
}

function BookingRow( { booking, onStatus, onDelete } ) {
	const meta = statusMeta( booking.status );
	return (
		<Stack
			direction="row"
			spacing={ 2 }
			alignItems="center"
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderLeft: `3px solid ${ meta.fg }`,
				borderRadius: 2,
				px: 2,
				py: 1.25,
			} }
		>
			<Typography sx={ { fontWeight: 800, fontSize: 18, width: 58, color: tokens.ink } }>
				{ booking.time }
			</Typography>
			<Box sx={ { flex: 1, minWidth: 0 } }>
				<Typography sx={ { fontWeight: 700, color: tokens.ink } } noWrap>
					{ booking.name || 'Guest' }
				</Typography>
				<Typography sx={ { fontSize: 13, color: tokens.muted } } noWrap>
					{ booking.party } { booking.party === 1 ? 'guest' : 'guests' }
					{ booking.table ? ` · ${ booking.table }` : ' · no table' }
					{ booking.phone ? ` · ${ booking.phone }` : '' }
				</Typography>
			</Box>
			{ booking.notes && (
				<Tooltip title={ booking.notes }>
					<Chip label="Notes" size="small" sx={ { bgcolor: tokens.soft, color: tokens.muted } } />
				</Tooltip>
			) }
			<Select
				value={ booking.status }
				onChange={ ( e ) => onStatus( e.target.value ) }
				size="small"
				sx={ {
					minWidth: 132,
					fontWeight: 700,
					fontSize: 13,
					color: meta.fg,
					bgcolor: meta.bg,
					'& fieldset': { border: 'none' },
				} }
			>
				{ STATUSES.map( ( s ) => (
					<MenuItem key={ s.key } value={ s.key } sx={ { fontSize: 13, fontWeight: 600 } }>
						{ s.label }
					</MenuItem>
				) ) }
			</Select>
			<Tooltip title="Delete booking">
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

function BookingSettings() {
	const [ cfg, setCfg ] = useState( null );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ copied, setCopied ] = useState( false );
	const debounce = useRef( null );

	useEffect( () => {
		api.getBookingSettings().then( setCfg );
	}, [] );

	const patch = ( p ) => {
		const next = { ...cfg, ...p };
		setCfg( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveBookingSettings( next ).then( () => setSaveState( 'saved' ) ).catch( () => setSaveState( 'error' ) );
		}, 500 );
	};

	if ( ! cfg ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', py: 3 } }>
				<CircularProgress size={ 22 } />
			</Box>
		);
	}

	const num = ( label, key, min, max, help ) => (
		<TextField
			label={ label }
			type="number"
			size="small"
			value={ cfg[ key ] }
			onChange={ ( e ) => patch( { [ key ]: Math.max( min, Math.min( max, parseInt( e.target.value, 10 ) || min ) ) } ) }
			inputProps={ { min, max } }
			helperText={ help }
			sx={ { width: 150 } }
		/>
	);

	const copyShortcode = () => {
		const text = '[dinekit_booking]';
		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( text ).then( () => setCopied( true ) );
		}
	};

	return (
		<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2.5, mb: 2 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<Typography variant="subtitle2" sx={ { color: tokens.ink } }>Booking settings</Typography>
				<Typography sx={ { fontSize: 12, color: tokens.muted, minWidth: 50 } }>
					{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
				</Typography>
			</Stack>

			<Stack direction="row" spacing={ 3 } flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.online_enabled } onChange={ ( e ) => patch( { online_enabled: e.target.checked } ) } />
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Accept online bookings</Typography>
				</Stack>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.auto_confirm } onChange={ ( e ) => patch( { auto_confirm: e.target.checked } ) } />
					<Tooltip title="On: booked instantly. Off: comes in as a request you confirm.">
						<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Auto-confirm</Typography>
					</Tooltip>
				</Stack>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.allow_waitlist } onChange={ ( e ) => patch( { allow_waitlist: e.target.checked } ) } />
					<Tooltip title="When a slot is full, let diners join the waitlist (penciled in) instead of being turned away.">
						<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Waitlist when full</Typography>
					</Tooltip>
				</Stack>
			</Stack>

			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				{ num( 'Max party', 'max_party', 1, 100 ) }
				{ num( 'Notice (hours)', 'min_notice', 0, 720 ) }
				{ num( 'Book up to (days)', 'max_days_ahead', 1, 730 ) }
				{ num( 'Slot gap (min)', 'slot_interval', 15, 240 ) }
			</Stack>
			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mt: 1.5 } }>
				<TextField label="Opens" type="time" size="small" value={ cfg.open_time } onChange={ ( e ) => patch( { open_time: e.target.value } ) } sx={ { width: 130 } } />
				<TextField label="Last booking" type="time" size="small" value={ cfg.close_time } onChange={ ( e ) => patch( { close_time: e.target.value } ) } sx={ { width: 130 } } />
				{ num( 'Covers / hour', 'covers_per_hour', 0, 1000, '0 = no limit' ) }
				{ num( 'Deposit over (guests)', 'deposit_over', 0, 100, '0 = never' ) }
				{ num( 'Deposit / guest', 'deposit_amount', 0, 100000 ) }
			</Stack>

			<Stack direction="row" spacing={ 2 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { mt: 2 } }>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ cfg.emails_enabled } onChange={ ( e ) => patch( { emails_enabled: e.target.checked } ) } />
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>Email notifications</Typography>
				</Stack>
				<TextField
					label="Notify email (staff)"
					type="email"
					size="small"
					placeholder="Defaults to site admin"
					value={ cfg.notify_email }
					onChange={ ( e ) => patch( { notify_email: e.target.value } ) }
					sx={ { width: 260 } }
				/>
			</Stack>

			<Divider sx={ { my: 2 } } />
			<Stack direction="row" alignItems="center" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				<Typography sx={ { fontSize: 13, color: tokens.muted } }>
					Add the booking form to any page with the <strong>DineKit Booking Form</strong> block, or this shortcode:
				</Typography>
				<Chip
					label="[dinekit_booking]"
					onClick={ copyShortcode }
					onDelete={ copyShortcode }
					deleteIcon={ <ContentCopyIcon /> }
					sx={ { fontFamily: 'monospace', fontWeight: 700, bgcolor: tokens.soft } }
				/>
			</Stack>
			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
				Deposit amounts are collected once you connect Stripe in Integrations (coming with payments).
			</Typography>
			<Snackbar
				open={ copied }
				autoHideDuration={ 1800 }
				onClose={ () => setCopied( false ) }
				message="Shortcode copied"
				anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
			/>
		</Box>
	);
}
