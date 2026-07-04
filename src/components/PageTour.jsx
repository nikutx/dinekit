import React, { useState } from 'react';
import { Box, Stack, Typography, Button, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { tokens } from '../theme';

// A lightweight, skippable first-run explainer shown once per page. "Got it"
// dismisses this page's tip; "Don't show tips" silences them everywhere. State
// lives in localStorage so it's per-user without a backend round-trip.
const key = ( id ) => 'dk_tour_' + id;
const OFF = 'dk_tours_off';

function read( k ) {
	try {
		return window.localStorage.getItem( k );
	} catch ( e ) {
		return null;
	}
}
function write( k, v ) {
	try {
		window.localStorage.setItem( k, v );
	} catch ( e ) {
		// Private mode / storage disabled — the tip just won't be remembered.
	}
}

export default function PageTour( { id, title, points } ) {
	const [ seen, setSeen ] = useState( () => '1' === read( OFF ) || '1' === read( key( id ) ) );
	if ( seen ) {
		return null;
	}
	const dismiss = () => {
		write( key( id ), '1' );
		setSeen( true );
	};
	const off = () => {
		write( OFF, '1' );
		setSeen( true );
	};
	return (
		<Box sx={ { mb: 2, p: 2, borderRadius: '12px', bgcolor: tokens.accentSoft, border: `1px solid ${ tokens.accent }33` } }>
			<Stack direction="row" spacing={ 1.25 } alignItems="flex-start">
				<LightbulbOutlinedIcon sx={ { color: tokens.accent, fontSize: 20, mt: 0.25, flexShrink: 0 } } />
				<Box sx={ { flex: 1, minWidth: 0 } }>
					<Typography sx={ { fontWeight: 700, color: tokens.accentDark, mb: 0.5 } }>{ title }</Typography>
					<Stack component="ul" sx={ { m: 0, pl: 2.25 } } spacing={ 0.25 }>
						{ points.map( ( pt, i ) => (
							<Typography component="li" key={ i } sx={ { fontSize: 13, color: tokens.ink2 } }>{ pt }</Typography>
						) ) }
					</Stack>
					<Stack direction="row" spacing={ 1 } sx={ { mt: 1.25 } }>
						<Button size="small" variant="contained" onClick={ dismiss }>Got it</Button>
						<Button size="small" onClick={ off } sx={ { color: tokens.muted } }>Don’t show tips</Button>
					</Stack>
				</Box>
				<IconButton size="small" onClick={ dismiss } sx={ { color: tokens.muted2 } }><CloseIcon fontSize="small" /></IconButton>
			</Stack>
		</Box>
	);
}
