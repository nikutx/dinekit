import React, { useEffect, useMemo, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	Chip,
	InputAdornment,
	Drawer,
	Switch,
	Button,
	IconButton,
	Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import StarIcon from '@mui/icons-material/Star';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import { tokens, hashTint } from '../theme';
import { api } from '../api/client';
import { prettyDate } from '../lib/bookings';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import { ListSkeleton } from './ui/Skeletons';

export default function GuestsView() {
	const [ guests, setGuests ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ q, setQ ] = useState( '' );
	const [ editing, setEditing ] = useState( null );
	const [ toast, setToast ] = useState( '' );

	useEffect( () => {
		api.getGuests()
			.then( ( rows ) => setGuests( rows || [] ) )
			.finally( () => setLoading( false ) );
	}, [] );

	const filtered = useMemo( () => {
		const s = q.trim().toLowerCase();
		if ( ! s ) {
			return guests;
		}
		return guests.filter(
			( g ) => g.name.toLowerCase().includes( s ) || ( g.email || '' ).toLowerCase().includes( s )
		);
	}, [ guests, q ] );

	const withAllergies = guests.filter( ( g ) => g.allergens.length > 0 || g.noteAllergens ).length;
	const vipCount = guests.filter( ( g ) => g.vip ).length;

	const onSaved = ( profile ) => {
		// Merge the saved profile back into the guest list by identity.
		setGuests( ( gs ) =>
			gs.map( ( g ) =>
				( g.email || g.name ) === ( editing.email || editing.name )
					? { ...g, ...profile }
					: g
			)
		);
		setEditing( null );
		setToast( 'Guest profile saved' );
	};

	if ( loading ) {
		return (
			<Page>
				<ListSkeleton rows={ 6 } />
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title="Guests"
				subtitle="Everyone who has booked or pre-ordered. Tap a guest to flag VIPs, add tags and record allergies — they carry across every visit."
				actions={
					<>
						<Chip icon={ <PeopleIcon sx={ { fontSize: 16 } } /> } label={ `${ guests.length } guests` } sx={ { bgcolor: tokens.soft, color: tokens.ink2, fontWeight: 600 } } />
						{ vipCount > 0 && (
							<Chip icon={ <StarIcon sx={ { fontSize: 16 } } /> } label={ `${ vipCount } VIP` } sx={ { bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 600 } } />
						) }
						{ withAllergies > 0 && (
							<Chip icon={ <WarningAmberIcon sx={ { fontSize: 16 } } /> } label={ `${ withAllergies } with allergies` } sx={ { bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 600 } } />
						) }
					</>
				}
			/>

			<TextField
				placeholder="Search by name or email…"
				value={ q }
				onChange={ ( e ) => setQ( e.target.value ) }
				fullWidth
				size="small"
				sx={ { mb: 2 } }
				InputProps={ { startAdornment: <InputAdornment position="start"><SearchIcon sx={ { fontSize: 18, color: tokens.muted2 } } /></InputAdornment> } }
			/>

			{ filtered.length === 0 ? (
				<EmptyState
					icon={ <PeopleIcon /> }
					title={ guests.length ? 'No matches' : 'No guests yet' }
					description={ guests.length ? 'Try a different search.' : 'Guests appear here as bookings and event pre-orders come in.' }
				/>
			) : (
				<Stack spacing={ 1 }>
					{ filtered.map( ( g ) => (
						<Stack
							key={ ( g.email || g.name ) }
							direction="row"
							spacing={ 2 }
							alignItems="center"
							onClick={ () => setEditing( g ) }
							sx={ {
								bgcolor: tokens.surface,
								border: `1px solid ${ g.vip ? tokens.amber : tokens.border }`,
								borderRadius: '12px',
								px: 2,
								py: 1.5,
								cursor: 'pointer',
								transition: 'border-color .15s, box-shadow .15s',
								'&:hover': { boxShadow: tokens.shadowSm, borderColor: g.vip ? tokens.amber : tokens.border2 },
							} }
						>
							<GuestAvatar name={ g.name } email={ g.email } />
							<Box sx={ { flex: 1, minWidth: 0 } }>
								<Typography sx={ { fontWeight: 700, color: tokens.ink, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 } } component="div">
									{ g.vip && <StarIcon sx={ { fontSize: 17, color: tokens.amber } } /> }
									<span style={ { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }>{ g.name || 'Guest' }</span>
									{ g.visits >= 3 && ! g.vip && (
										<Chip label="Regular" size="small" sx={ { height: 18, fontSize: 10, bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600 } } />
									) }
									{ ( g.tags || [] ).map( ( t ) => (
										<Chip key={ t } label={ t } size="small" sx={ { height: 18, fontSize: 10, bgcolor: tokens.soft, color: tokens.ink2, fontWeight: 600 } } />
									) ) }
								</Typography>
								<Typography sx={ { fontSize: 13, color: tokens.muted } } noWrap>
									{ [ g.email, g.phone ].filter( Boolean ).join( ' · ' ) || '—' }
								</Typography>
								{ ( g.allergens.length > 0 || g.dietary.length > 0 || g.noteAllergens ) && (
									<Stack direction="row" spacing={ 0.5 } flexWrap="wrap" useFlexGap sx={ { mt: 0.75 } }>
										{ g.noteAllergens && (
											<Chip label={ g.noteAllergens } size="small" sx={ { height: 20, bgcolor: tokens.redSoft, color: tokens.red, fontWeight: 600 } } />
										) }
										{ g.allergens.map( ( a ) => (
											<Chip key={ 'a' + a } label={ a } size="small" sx={ { height: 20, bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 600 } } />
										) ) }
										{ g.dietary.map( ( dd ) => (
											<Chip key={ 'd' + dd } label={ dd } size="small" sx={ { height: 20, bgcolor: tokens.greenSoft, color: tokens.green, fontWeight: 600 } } />
										) ) }
									</Stack>
								) }
							</Box>
							<Stack alignItems="flex-end" sx={ { width: 64, flexShrink: 0 } }>
								<Typography sx={ { fontWeight: 800, fontSize: 18, color: tokens.ink } }>{ g.visits }</Typography>
								<Typography sx={ { fontSize: 11, color: tokens.muted2 } }>{ g.visits === 1 ? 'booking' : 'bookings' }</Typography>
							</Stack>
							<Box sx={ { width: 130, flexShrink: 0 } }>
								{ g.nextVisit ? (
									<Typography sx={ { fontSize: 12, color: tokens.accentDark, fontWeight: 700 } }>Next: { prettyDate( g.nextVisit ) }</Typography>
								) : null }
								{ g.lastVisit ? (
									<Typography sx={ { fontSize: 12, color: tokens.muted } }>Last: { prettyDate( g.lastVisit ) }</Typography>
								) : null }
							</Box>
						</Stack>
					) ) }
				</Stack>
			) }

			<GuestProfileDrawer guest={ editing } onClose={ () => setEditing( null ) } onSaved={ onSaved } />

			<Snackbar
				open={ !! toast }
				autoHideDuration={ 2500 }
				onClose={ () => setToast( '' ) }
				message={ toast }
				anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
			/>
		</Page>
	);
}

// Circular initials avatar tinted consistently per guest (hash of email/name).
function GuestAvatar( { name, email } ) {
	const tint = hashTint( email || name );
	const initials = String( name || '' )
		.trim()
		.split( /\s+/ )
		.filter( Boolean )
		.slice( 0, 2 )
		.map( ( w ) => w[ 0 ].toUpperCase() )
		.join( '' ) || '?';
	return (
		<Box
			sx={ {
				width: 34,
				height: 34,
				borderRadius: '50%',
				flexShrink: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				bgcolor: tint.bg,
				color: tint.fg,
				fontWeight: 650,
				fontSize: 13,
			} }
		>
			{ initials }
		</Box>
	);
}

function GuestProfileDrawer( { guest, onClose, onSaved } ) {
	const [ vip, setVip ] = useState( false );
	const [ tags, setTags ] = useState( [] );
	const [ tagInput, setTagInput ] = useState( '' );
	const [ allergens, setAllergens ] = useState( '' );
	const [ notes, setNotes ] = useState( '' );
	const [ saving, setSaving ] = useState( false );

	useEffect( () => {
		if ( guest ) {
			setVip( !! guest.vip );
			setTags( guest.tags || [] );
			setAllergens( guest.noteAllergens || '' );
			setNotes( guest.notes || '' );
			setTagInput( '' );
		}
	}, [ guest ] );

	const addTag = () => {
		const t = tagInput.trim();
		if ( t && ! tags.includes( t ) ) {
			setTags( [ ...tags, t ] );
		}
		setTagInput( '' );
	};

	const save = async () => {
		setSaving( true );
		try {
			const profile = await api.saveGuestProfile( {
				email: guest.email || '',
				name: guest.name || '',
				vip,
				tags,
				allergens,
				notes,
			} );
			onSaved( { ...profile, noteAllergens: profile.allergens } );
		} finally {
			setSaving( false );
		}
	};

	return (
		<Drawer
			anchor="right"
			open={ !! guest }
			onClose={ onClose }
			// Sit above the WP admin bar (99999) so the drawer isn't hidden behind it.
			disableEnforceFocus
			sx={ { zIndex: 100000 } }
			PaperProps={ { sx: { width: { xs: '100%', sm: 400 } } } }
		>
			{ guest && (
				<Box sx={ { p: 3, display: 'flex', flexDirection: 'column', height: '100%' } }>
					<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 0.5 } }>
						<Typography variant="h6" sx={ { fontSize: 18 } }>{ guest.name || 'Guest' }</Typography>
						<IconButton size="small" onClick={ onClose }><CloseIcon fontSize="small" /></IconButton>
					</Stack>
					<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 3 } }>
						{ [ guest.email, guest.phone ].filter( Boolean ).join( ' · ' ) || 'No contact details' }
					</Typography>

					<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { bgcolor: vip ? tokens.amberSoft : tokens.soft, borderRadius: 2, px: 2, py: 1.25, mb: 3 } }>
						<Stack direction="row" alignItems="center" spacing={ 1 }>
							<StarIcon sx={ { fontSize: 20, color: vip ? tokens.amber : tokens.muted2 } } />
							<Typography sx={ { fontWeight: 600, fontSize: 14 } }>VIP guest</Typography>
						</Stack>
						<Switch checked={ vip } onChange={ ( e ) => setVip( e.target.checked ) } />
					</Stack>

					<Typography sx={ { fontWeight: 600, fontSize: 13, mb: 1, color: tokens.ink2 } }>Allergies & dietary</Typography>
					<TextField
						placeholder="e.g. Nut allergy, coeliac"
						value={ allergens }
						onChange={ ( e ) => setAllergens( e.target.value ) }
						fullWidth
						size="small"
						sx={ { mb: 3 } }
						helperText="Shown in red on the pre-shift service sheet."
					/>

					<Typography sx={ { fontWeight: 600, fontSize: 13, mb: 1, color: tokens.ink2 } }>Tags</Typography>
					<Stack direction="row" spacing={ 1 } sx={ { mb: 1 } }>
						<TextField
							placeholder="Wine club, birthday…"
							value={ tagInput }
							onChange={ ( e ) => setTagInput( e.target.value ) }
							onKeyDown={ ( e ) => { if ( e.key === 'Enter' ) { e.preventDefault(); addTag(); } } }
							fullWidth
							size="small"
						/>
						<Button variant="outlined" onClick={ addTag } sx={ { minWidth: 44 } }><AddIcon fontSize="small" /></Button>
					</Stack>
					<Stack direction="row" spacing={ 0.5 } flexWrap="wrap" useFlexGap sx={ { mb: 3 } }>
						{ tags.map( ( t ) => (
							<Chip key={ t } label={ t } size="small" onDelete={ () => setTags( tags.filter( ( x ) => x !== t ) ) } sx={ { bgcolor: tokens.soft, fontWeight: 600 } } />
						) ) }
					</Stack>

					<Typography sx={ { fontWeight: 600, fontSize: 13, mb: 1, color: tokens.ink2 } }>Service notes</Typography>
					<TextField
						placeholder="Prefers the window table, allergic to the house dog…"
						value={ notes }
						onChange={ ( e ) => setNotes( e.target.value ) }
						fullWidth
						multiline
						minRows={ 3 }
						size="small"
					/>

					<Box sx={ { flex: 1 } } />
					<Stack direction="row" spacing={ 1 } sx={ { borderTop: `1px solid ${ tokens.border }`, pt: 2 } }>
						<Button onClick={ onClose } sx={ { color: tokens.muted } }>Cancel</Button>
						<Box sx={ { flex: 1 } } />
						<Button variant="contained" onClick={ save } disabled={ saving }>{ saving ? 'Saving…' : 'Save profile' }</Button>
					</Stack>
				</Box>
			) }
		</Drawer>
	);
}
