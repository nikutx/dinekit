import React, { useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	ToggleButtonGroup,
	ToggleButton,
	CircularProgress,
} from '@mui/material';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useToast } from './Toast';

const PRESETS = [ '#b91c1c', '#0ea5e9', '#16a34a', '#7c3aed', '#d97706', '#0f172a', '#db2777' ];

// Brand + currency settings — applied globally to every menu on the frontend.
export default function SettingsView() {
	const [ settings, setSettings ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ saveState, setSaveState ] = useState( '' );
	const debounce = useRef( null );
	const toast = useToast();

	useEffect( () => {
		api.getSettings().then( ( s ) => {
			setSettings( s );
			setLoading( false );
		} );
	}, [] );

	const update = ( patch ) => {
		const next = { ...settings, ...patch };
		setSettings( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveSettings( next )
				.then( () => setSaveState( 'saved' ) )
				.catch( ( e ) => {
					setSaveState( '' );
					toast.error( 'Couldn’t save settings', e.message );
				} );
		}, 400 );
	};

	if ( loading ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	return (
		<Box sx={ { maxWidth: 720, mx: 'auto' } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 0.5 } }>
				<Typography variant="h5">Settings</Typography>
				<Typography sx={ { fontSize: 13, color: tokens.muted } }>
					{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
				</Typography>
			</Stack>
			<Typography sx={ { color: tokens.muted, mb: 3 } }>
				These apply to every DineKit menu on your website.
			</Typography>

			<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 3 } }>
				<Typography sx={ labelSx }>Brand colour</Typography>
				<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 1.5 } }>
					Used for section headings, badges and accents on your menu.
				</Typography>
				<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" sx={ { mb: 3 } }>
					{ PRESETS.map( ( c ) => (
						<Box
							key={ c }
							onClick={ () => update( { accent: c } ) }
							sx={ {
								width: 34,
								height: 34,
								borderRadius: '50%',
								bgcolor: c,
								cursor: 'pointer',
								boxShadow: settings.accent === c ? `0 0 0 3px #fff, 0 0 0 5px ${ c }` : 'none',
								transition: 'box-shadow 0.15s',
							} }
						/>
					) ) }
					<Box
						component="input"
						type="color"
						value={ settings.accent }
						onChange={ ( e ) => update( { accent: e.target.value } ) }
						sx={ { width: 40, height: 34, border: `1px solid ${ tokens.border }`, borderRadius: 1, p: 0, cursor: 'pointer', bgcolor: 'transparent' } }
					/>
					<Typography sx={ { fontFamily: 'monospace', fontSize: 13, color: tokens.muted } }>
						{ settings.accent }
					</Typography>
				</Stack>

				<Typography sx={ labelSx }>Currency</Typography>
				<Stack direction="row" spacing={ 2 } alignItems="flex-end" flexWrap="wrap">
					<Box>
						<Typography sx={ { fontSize: 12, color: tokens.muted, mb: 0.5 } }>Symbol</Typography>
						<TextField
							value={ settings.currency }
							onChange={ ( e ) => update( { currency: e.target.value } ) }
							sx={ { width: 90 } }
							inputProps={ { maxLength: 8 } }
						/>
					</Box>
					<Box>
						<Typography sx={ { fontSize: 12, color: tokens.muted, mb: 0.5 } }>Position</Typography>
						<ToggleButtonGroup
							exclusive
							size="small"
							value={ settings.currencyPosition }
							onChange={ ( e, v ) => v && update( { currencyPosition: v } ) }
						>
							<ToggleButton value="before" sx={ { textTransform: 'none' } }>
								{ settings.currency }9.50
							</ToggleButton>
							<ToggleButton value="after" sx={ { textTransform: 'none' } }>
								9.50{ settings.currency }
							</ToggleButton>
						</ToggleButtonGroup>
					</Box>
				</Stack>
			</Box>
		</Box>
	);
}

const labelSx = {
	textTransform: 'uppercase',
	fontSize: 11,
	fontWeight: 700,
	letterSpacing: '0.04em',
	color: tokens.muted,
	mb: 0.75,
	display: 'block',
};
