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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import { tokens } from '../theme';
import { api } from '../api/client';
import { STATUSES, statusMeta, isoDate, addDays, prettyDate } from '../lib/bookings';

export default function BookingsView() {
	const [ date, setDate ] = useState( isoDate() );
	const [ bookings, setBookings ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ adding, setAdding ] = useState( false );

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
				<Button variant="contained" startIcon={ <AddIcon /> } onClick={ () => setAdding( ( v ) => ! v ) }>
					New booking
				</Button>
			</Stack>

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
