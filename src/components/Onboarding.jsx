import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Stack, Alert, CircularProgress } from '@mui/material';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { tokens } from '../theme';
import { api } from '../api/client';

// First-run experience: shown when the menu is empty. Seeds a sample menu and a
// page so the user reaches a published menu in under three minutes.
export default function Onboarding( { onDone } ) {
	const [ name, setName ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const [ done, setDone ] = useState( null );
	const [ error, setError ] = useState( '' );

	const run = () => {
		setBusy( true );
		setError( '' );
		api.setup( name.trim() )
			.then( ( res ) => {
				setDone( res );
				setBusy( false );
			} )
			.catch( ( e ) => {
				setError( e.message );
				setBusy( false );
			} );
	};

	if ( done ) {
		return (
			<Box sx={ panelSx }>
				<AutoAwesomeIcon sx={ { fontSize: 40, color: tokens.accent, mb: 1 } } />
				<Typography variant="h5" sx={ { mb: 1 } }>
					Your starter menu is ready!
				</Typography>
				<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
					We’ve added sample sections and dishes below, and created a Menu page. Edit anything,
					drag to reorder, then view it live.
				</Typography>
				<Stack direction="row" spacing={ 1.5 } justifyContent="center">
					{ done.page && (
						<Button
							variant="contained"
							endIcon={ <OpenInNewIcon /> }
							href={ done.page }
							target="_blank"
							rel="noreferrer"
						>
							View my menu page
						</Button>
					) }
					<Button variant="outlined" onClick={ () => window.location.reload() }>
						Start editing
					</Button>
				</Stack>
			</Box>
		);
	}

	return (
		<Box sx={ panelSx }>
			<RestaurantMenuIcon sx={ { fontSize: 44, color: tokens.accent, mb: 1 } } />
			<Typography variant="h5" sx={ { mb: 1 } }>
				Welcome to DineKit
			</Typography>
			<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
				Let’s get your menu online in a couple of minutes. Tell us your restaurant’s name and
				we’ll set up a sample menu you can make your own.
			</Typography>

			{ error && <Alert severity="error" sx={ { mb: 2, width: '100%', maxWidth: 420 } }>{ error }</Alert> }

			<Stack spacing={ 1.5 } sx={ { width: '100%', maxWidth: 420 } }>
				<TextField
					label="Restaurant name"
					placeholder="e.g. The Copper Kettle"
					value={ name }
					onChange={ ( e ) => setName( e.target.value ) }
					onKeyDown={ ( e ) => e.key === 'Enter' && ! busy && run() }
					fullWidth
				/>
				<Button
					variant="contained"
					size="large"
					onClick={ run }
					disabled={ busy }
					startIcon={ busy ? <CircularProgress size={ 18 } color="inherit" /> : <AutoAwesomeIcon /> }
				>
					{ busy ? 'Setting up…' : 'Create my starter menu' }
				</Button>
				<Button variant="text" onClick={ onDone } disabled={ busy } sx={ { color: tokens.muted } }>
					I’ll start from scratch
				</Button>
			</Stack>
		</Box>
	);
}

const panelSx = {
	bgcolor: tokens.surface,
	border: `1px solid ${ tokens.border }`,
	borderRadius: 4,
	p: { xs: 4, sm: 6 },
	textAlign: 'center',
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	maxWidth: 640,
	mx: 'auto',
	mt: 4,
	boxShadow: tokens.shadowSm || '0 12px 32px rgba(15,23,42,0.06)',
};
