import React, { useEffect, useMemo, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	Chip,
	CircularProgress,
	InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { tokens } from '../theme';
import { api } from '../api/client';
import { prettyDate } from '../lib/bookings';

export default function GuestsView() {
	const [ guests, setGuests ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ q, setQ ] = useState( '' );

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

	const withAllergies = guests.filter( ( g ) => g.allergens.length > 0 ).length;

	if ( loading ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	return (
		<Box sx={ { maxWidth: 960, mx: 'auto' } }>
			<Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={ { mb: 2 } }>
				<Box>
					<Typography variant="h5">Guests</Typography>
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>
						Everyone who has booked or pre-ordered — with the allergies they’ve told you about,
						carried across every visit.
					</Typography>
				</Box>
				<Stack direction="row" spacing={ 1 }>
					<Chip icon={ <PeopleIcon sx={ { fontSize: 16 } } /> } label={ `${ guests.length } guests` } sx={ { bgcolor: tokens.soft, color: tokens.ink2, fontWeight: 700 } } />
					{ withAllergies > 0 && (
						<Chip icon={ <WarningAmberIcon sx={ { fontSize: 16 } } /> } label={ `${ withAllergies } with allergies` } sx={ { bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 700 } } />
					) }
				</Stack>
			</Stack>

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
				<Box sx={ { border: `1px dashed ${ tokens.border2 }`, borderRadius: 3, p: 5, textAlign: 'center', color: tokens.muted } }>
					<Typography sx={ { fontWeight: 700, color: tokens.ink2 } }>{ guests.length ? 'No matches' : 'No guests yet' }</Typography>
					<Typography sx={ { fontSize: 14, mt: 0.5 } }>
						{ guests.length ? 'Try a different search.' : 'Guests appear here as bookings and event pre-orders come in.' }
					</Typography>
				</Box>
			) : (
				<Stack spacing={ 1 }>
					{ filtered.map( ( g ) => (
						<Stack
							key={ ( g.email || g.name ) }
							direction="row"
							spacing={ 2 }
							alignItems="center"
							sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 2, px: 2, py: 1.5 } }
						>
							<Box sx={ { flex: 1, minWidth: 0 } }>
								<Typography sx={ { fontWeight: 700, color: tokens.ink } } noWrap>
									{ g.name || 'Guest' }
									{ g.visits >= 3 && (
										<Chip label="Regular" size="small" sx={ { ml: 1, height: 18, fontSize: 10, bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 700 } } />
									) }
								</Typography>
								<Typography sx={ { fontSize: 13, color: tokens.muted } } noWrap>
									{ [ g.email, g.phone ].filter( Boolean ).join( ' · ' ) || '—' }
								</Typography>
								{ ( g.allergens.length > 0 || g.dietary.length > 0 ) && (
									<Stack direction="row" spacing={ 0.5 } flexWrap="wrap" useFlexGap sx={ { mt: 0.75 } }>
										{ g.allergens.map( ( a ) => (
											<Chip key={ 'a' + a } label={ a } size="small" sx={ { height: 20, bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 700 } } />
										) ) }
										{ g.dietary.map( ( d ) => (
											<Chip key={ 'd' + d } label={ d } size="small" sx={ { height: 20, bgcolor: tokens.greenSoft, color: tokens.green, fontWeight: 700 } } />
										) ) }
									</Stack>
								) }
							</Box>
							<Stack alignItems="flex-end" sx={ { flexShrink: 0 } }>
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
		</Box>
	);
}
