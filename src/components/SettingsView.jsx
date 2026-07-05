import React, { useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	ToggleButtonGroup,
	ToggleButton,
	CircularProgress,
} from '../ui';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useToast } from './Toast';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

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
		<Page>
			<PageHeader
				title="Settings"
				subtitle="These apply to every DineKit menu on your website."
				actions={
					<Typography sx={ { fontSize: 13, color: tokens.muted } }>
						{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
					</Typography>
				}
			/>

			<Stack spacing={ 2.5 }>
				<Card>
					<Typography sx={ { fontWeight: 650, fontSize: 15 } }>Brand</Typography>
					<Typography sx={ { fontSize: 13, color: tokens.muted, mt: 0.25, mb: 2 } }>
						Used for section headings, badges and accents on your menu.
					</Typography>
					<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap sx={ { rowGap: 1 } }>
						{ PRESETS.map( ( c ) => (
							<Box
								key={ c }
								onClick={ () => update( { accent: c } ) }
								sx={ {
									width: 28,
									height: 28,
									borderRadius: '50%',
									bgcolor: c,
									cursor: 'pointer',
									boxShadow: 'inset 0 0 0 2px #fff',
									outline: settings.accent === c ? `2px solid ${ tokens.accent }` : '2px solid transparent',
									outlineOffset: '1px',
									transition: 'outline-color 0.15s',
								} }
							/>
						) ) }
						<Box
							component="input"
							type="color"
							value={ settings.accent }
							onChange={ ( e ) => update( { accent: e.target.value } ) }
							sx={ { width: 36, height: 28, border: `1px solid ${ tokens.border }`, borderRadius: 1, p: 0, cursor: 'pointer', bgcolor: 'transparent' } }
						/>
						<Typography sx={ { fontFamily: 'monospace', fontSize: 13, color: tokens.muted } }>
							{ settings.accent }
						</Typography>
					</Stack>
				</Card>

				<Card>
					<Typography sx={ { fontWeight: 650, fontSize: 15, mb: 2 } }>Currency</Typography>
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
					<Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 1.5 } }>
						Prices will show as{ ' ' }
						{ settings.currencyPosition === 'after'
							? `9.50${ settings.currency }`
							: `${ settings.currency }9.50` }
					</Typography>
				</Card>
			</Stack>
		</Page>
	);
}
