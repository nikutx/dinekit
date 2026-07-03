import React, { useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Button,
	IconButton,
	TextField,
	Chip,
	MenuItem,
	CircularProgress,
	Tooltip,
	Divider,
	Switch,
	Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventIcon from '@mui/icons-material/Event';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PeopleIcon from '@mui/icons-material/People';
import { tokens } from '../theme';
import { api } from '../api/client';
import { prettyDate } from '../lib/bookings';

export default function EventsView() {
	const [ events, setEvents ] = useState( [] );
	const [ menus, setMenus ] = useState( [] );
	const [ selectedId, setSelectedId ] = useState( null );
	const [ detail, setDetail ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ copied, setCopied ] = useState( false );
	const debounce = useRef( null );

	useEffect( () => {
		Promise.all( [ api.getEvents(), api.getState() ] )
			.then( ( [ evs, state ] ) => {
				setEvents( evs || [] );
				setMenus( state.menus || [] );
				if ( ( evs || [] ).length ) {
					select( evs[ 0 ].id );
				}
			} )
			.finally( () => setLoading( false ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const select = ( id ) => {
		setSelectedId( id );
		setDetail( null );
		api.getEvent( id ).then( setDetail );
	};

	const createEvent = async () => {
		const ev = await api.createEvent( { name: 'New event' } );
		setEvents( ( e ) => [ ...e, ev ] );
		select( ev.id );
	};

	const patch = ( p ) => {
		setDetail( ( d ) => ( { ...d, ...p } ) );
		clearTimeout( debounce.current );
		debounce.current = setTimeout( () => {
			api.updateEvent( selectedId, p ).then( ( ev ) => {
				setEvents( ( list ) => list.map( ( x ) => ( x.id === ev.id ? { ...x, ...ev } : x ) ) );
			} );
		}, 500 );
	};

	const removeEvent = async ( id ) => {
		await api.deleteEvent( id );
		const next = events.filter( ( e ) => e.id !== id );
		setEvents( next );
		if ( selectedId === id ) {
			if ( next.length ) {
				select( next[ 0 ].id );
			} else {
				setSelectedId( null );
				setDetail( null );
			}
		}
	};

	const removeGuest = async ( gid ) => {
		await api.deleteGuest( selectedId, gid );
		select( selectedId );
	};

	const copyShare = () => {
		if ( detail?.shareUrl && navigator.clipboard ) {
			navigator.clipboard.writeText( detail.shareUrl ).then( () => setCopied( true ) );
		}
	};

	if ( loading ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	return (
		<Box sx={ { maxWidth: 1120, mx: 'auto' } }>
			<Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={ { mb: 2 } }>
				<Box>
					<Typography variant="h5">Events</Typography>
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>
						Set-menu events with per-guest pre-orders — guests pick their courses and flag
						allergens from a share link. The kitchen gets one tidy prep sheet.
					</Typography>
				</Box>
				<Button variant="contained" startIcon={ <AddIcon /> } onClick={ createEvent }>
					New event
				</Button>
			</Stack>

			{ events.length === 0 ? (
				<Box sx={ { border: `1px dashed ${ tokens.border2 }`, borderRadius: 3, p: 6, textAlign: 'center', color: tokens.muted } }>
					<Typography sx={ { fontWeight: 700, color: tokens.ink2 } }>No events yet</Typography>
					<Typography sx={ { fontSize: 14, mt: 0.5 } }>
						Create an event, link one of your menus as the set menu, then share the link with guests.
					</Typography>
				</Box>
			) : (
				<Stack direction="row" spacing={ 2 } alignItems="flex-start">
					{ /* List */ }
					<Stack spacing={ 1 } sx={ { width: 260, flexShrink: 0 } }>
						{ events.map( ( ev ) => {
							const active = ev.id === selectedId;
							return (
								<Box
									key={ ev.id }
									onClick={ () => select( ev.id ) }
									sx={ {
										bgcolor: active ? tokens.accentSoft : tokens.surface,
										border: `1px solid ${ active ? tokens.accent : tokens.border }`,
										borderRadius: 2,
										p: 1.5,
										cursor: 'pointer',
									} }
								>
									<Typography sx={ { fontWeight: 700, color: tokens.ink, fontSize: 14 } } noWrap>{ ev.name }</Typography>
									<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mt: 0.5 } }>
										<Typography sx={ { fontSize: 12, color: tokens.muted } }>
											{ ev.date ? prettyDate( ev.date ) : 'No date' }
										</Typography>
										<Chip
											label={ ev.status === 'published' ? 'Live' : 'Draft' }
											size="small"
											sx={ {
												height: 18, fontSize: 10,
												bgcolor: ev.status === 'published' ? tokens.greenSoft : tokens.soft,
												color: ev.status === 'published' ? tokens.green : tokens.muted,
											} }
										/>
										<Box sx={ { flex: 1 } } />
										<Typography sx={ { fontSize: 12, color: tokens.muted2 } }>{ ev.guestCount }👤</Typography>
									</Stack>
								</Box>
							);
						} ) }
					</Stack>

					{ /* Detail */ }
					<Box sx={ { flex: 1, minWidth: 0 } }>
						{ ! detail ? (
							<Box sx={ { display: 'flex', justifyContent: 'center', mt: 6 } }><CircularProgress size={ 24 } /></Box>
						) : (
							<EventDetail
								detail={ detail }
								menus={ menus }
								onPatch={ patch }
								onDelete={ () => removeEvent( detail.id ) }
								onRemoveGuest={ removeGuest }
								onCopyShare={ copyShare }
							/>
						) }
					</Box>
				</Stack>
			) }

			<Snackbar open={ copied } autoHideDuration={ 1800 } onClose={ () => setCopied( false ) } message="Share link copied" anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } } />
		</Box>
	);
}

function EventDetail( { detail, menus, onPatch, onDelete, onRemoveGuest, onCopyShare } ) {
	const published = detail.status === 'published';
	const itemName = ( id ) => {
		for ( const c of detail.courses || [] ) {
			const it = c.items.find( ( x ) => x.id === id );
			if ( it ) {
				return it.title;
			}
		}
		return '#' + id;
	};

	return (
		<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2.5 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
				<TextField
					value={ detail.name }
					onChange={ ( e ) => onPatch( { name: e.target.value } ) }
					variant="standard"
					InputProps={ { disableUnderline: true, sx: { fontSize: 20, fontWeight: 800 } } }
					sx={ { flex: 1 } }
				/>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Switch checked={ published } onChange={ ( e ) => onPatch( { status: e.target.checked ? 'published' : 'draft' } ) } />
					<Typography sx={ { fontSize: 13, fontWeight: 700, color: published ? tokens.green : tokens.muted } }>
						{ published ? 'Live' : 'Draft' }
					</Typography>
					<Tooltip title="Delete event">
						<IconButton size="small" onClick={ onDelete } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
					</Tooltip>
				</Stack>
			</Stack>

			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
				<TextField label="Date" type="date" size="small" InputLabelProps={ { shrink: true } } value={ detail.date } onChange={ ( e ) => onPatch( { date: e.target.value } ) } sx={ { width: 160 } } />
				<TextField label="Time" type="time" size="small" InputLabelProps={ { shrink: true } } value={ detail.time } onChange={ ( e ) => onPatch( { time: e.target.value } ) } sx={ { width: 120 } } />
				<TextField
					select label="Set menu" size="small" value={ detail.menu || 0 }
					onChange={ ( e ) => onPatch( { menu: Number( e.target.value ) } ) }
					sx={ { minWidth: 180 } }
				>
					<MenuItem value={ 0 }>— choose a menu —</MenuItem>
					{ menus.map( ( m ) => <MenuItem key={ m.id } value={ m.id }>{ m.name }</MenuItem> ) }
				</TextField>
				<TextField label="Order-by date" type="date" size="small" InputLabelProps={ { shrink: true } } value={ detail.deadline } onChange={ ( e ) => onPatch( { deadline: e.target.value } ) } sx={ { width: 160 } } />
				<TextField label="Capacity" type="number" size="small" value={ detail.capacity } onChange={ ( e ) => onPatch( { capacity: Math.max( 0, parseInt( e.target.value, 10 ) || 0 ) } ) } helperText="0 = no limit" sx={ { width: 110 } } />
			</Stack>
			<TextField label="Intro (optional)" size="small" fullWidth value={ detail.intro } onChange={ ( e ) => onPatch( { intro: e.target.value } ) } sx={ { mt: 1.5 } } />

			{ ! detail.menu && (
				<Typography sx={ { fontSize: 13, color: tokens.amber, mt: 1.5 } }>
					Pick a set menu so guests have courses to choose from.
				</Typography>
			) }

			{ /* Share link */ }
			<Box sx={ { mt: 2, p: 1.5, bgcolor: published ? tokens.accentSoft : tokens.soft, borderRadius: 2 } }>
				<Typography sx={ { fontSize: 12, fontWeight: 700, color: published ? tokens.accentDark : tokens.muted, mb: 0.5 } }>
					{ published ? 'Guest share link — send this out' : 'Publish the event to activate its share link' }
				</Typography>
				<Stack direction="row" alignItems="center" spacing={ 1 }>
					<Typography sx={ { fontSize: 13, fontFamily: 'monospace', color: tokens.ink2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>
						{ detail.shareUrl }
					</Typography>
					<Button size="small" startIcon={ <ContentCopyIcon sx={ { fontSize: 15 } } /> } onClick={ onCopyShare } disabled={ ! published }>Copy</Button>
				</Stack>
			</Box>

			<Divider sx={ { my: 2.5 } } />

			{ /* Prep sheet */ }
			<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1.5 } }>
				<RestaurantIcon sx={ { fontSize: 18, color: tokens.ink2 } } />
				<Typography variant="subtitle2" sx={ { color: tokens.ink } }>Kitchen prep sheet</Typography>
				<Chip icon={ <PeopleIcon sx={ { fontSize: 15 } } /> } label={ `${ detail.prep.totalGuests } ordered` } size="small" sx={ { bgcolor: tokens.soft, fontWeight: 700 } } />
			</Stack>

			{ detail.prep.totalGuests === 0 ? (
				<Typography sx={ { fontSize: 14, color: tokens.muted } }>No guest orders yet. Share the link above to start collecting choices.</Typography>
			) : (
				<Stack direction="row" spacing={ 3 } flexWrap="wrap" useFlexGap>
					<Box sx={ { minWidth: 220 } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted, mb: 0.5 } }>DISHES</Typography>
						<Stack spacing={ 0.5 }>
							{ detail.prep.items.map( ( it ) => (
								<Stack key={ it.id } direction="row" justifyContent="space-between" sx={ { fontSize: 14 } }>
									<span>{ it.title }</span>
									<strong>×{ it.count }</strong>
								</Stack>
							) ) }
						</Stack>
					</Box>
					{ detail.prep.allergens.length > 0 && (
						<Box sx={ { minWidth: 220 } }>
							<Stack direction="row" alignItems="center" spacing={ 0.5 } sx={ { mb: 0.5 } }>
								<WarningAmberIcon sx={ { fontSize: 15, color: tokens.amber } } />
								<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.amber } }>ALLERGENS</Typography>
							</Stack>
							<Stack spacing={ 0.5 }>
								{ detail.prep.allergens.map( ( a ) => (
									<Typography key={ a.name } sx={ { fontSize: 13 } }>
										<strong>{ a.name }</strong>: { a.guests.join( ', ' ) }
									</Typography>
								) ) }
							</Stack>
						</Box>
					) }
				</Stack>
			) }

			{ /* Guests */ }
			{ detail.guests.length > 0 && (
				<>
					<Divider sx={ { my: 2.5 } } />
					<Typography variant="subtitle2" sx={ { color: tokens.ink, mb: 1 } }>Guests</Typography>
					<Stack spacing={ 1 }>
						{ detail.guests.map( ( g ) => (
							<Stack key={ g.id } direction="row" alignItems="center" spacing={ 1.5 } sx={ { bgcolor: tokens.soft, borderRadius: 2, p: 1.25 } }>
								<Box sx={ { flex: 1, minWidth: 0 } }>
									<Typography sx={ { fontWeight: 700, fontSize: 14 } }>{ g.name }</Typography>
									<Typography sx={ { fontSize: 12, color: tokens.muted } } noWrap>
										{ Object.values( g.selections ).map( ( id ) => itemName( id ) ).join( ' · ' ) || 'No choices' }
										{ g.notes ? ` — ${ g.notes }` : '' }
									</Typography>
								</Box>
								{ g.allergens.length > 0 && (
									<Chip label={ `${ g.allergens.length } allergen${ g.allergens.length === 1 ? '' : 's' }` } size="small" sx={ { bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 700 } } />
								) }
								<IconButton size="small" onClick={ () => onRemoveGuest( g.id ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
							</Stack>
						) ) }
					</Stack>
				</>
			) }
		</Box>
	);
}
