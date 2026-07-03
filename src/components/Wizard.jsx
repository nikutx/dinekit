import React, { useMemo, useState } from 'react';
import {
	Box,
	Typography,
	TextField,
	Button,
	Stack,
	Alert,
	CircularProgress,
} from '@mui/material';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TakeoutDiningIcon from '@mui/icons-material/TakeoutDining';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { tokens } from '../theme';
import { api } from '../api/client';

const TYPES = [
	{ key: 'dinein', label: 'Dine-in', desc: 'Tables & bookings', icon: RestaurantIcon },
	{ key: 'takeaway', label: 'Takeaway', desc: 'Order & collect', icon: TakeoutDiningIcon },
	{ key: 'both', label: 'Both', desc: 'Dine-in + takeaway', icon: StorefrontIcon },
];

export default function Wizard( { onDone } ) {
	const [ step, setStep ] = useState( 0 );
	const [ name, setName ] = useState( '' );
	const [ type, setType ] = useState( '' );
	const [ tables, setTables ] = useState( 6 );
	const [ seedSample, setSeedSample ] = useState( true );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ done, setDone ] = useState( null );

	// Steps depend on the chosen business type (takeaway skips the tables step).
	const steps = useMemo( () => {
		const list = [ 'welcome', 'type' ];
		if ( type !== 'takeaway' ) {
			list.push( 'tables' );
		}
		list.push( 'menu' );
		return list;
	}, [ type ] );

	const current = steps[ Math.min( step, steps.length - 1 ) ];
	const isLast = step >= steps.length - 1;

	const canNext =
		( 'welcome' === current && name.trim() ) ||
		( 'type' === current && type ) ||
		'tables' === current ||
		'menu' === current;

	const finish = () => {
		setBusy( true );
		setError( '' );
		api.runWizard( {
			name: name.trim(),
			businessType: type || 'both',
			seedSample,
			tables: type === 'takeaway' ? 0 : tables,
		} )
			.then( ( res ) => {
				setDone( res );
				setBusy( false );
			} )
			.catch( ( e ) => {
				setError( e.message || 'Something went wrong.' );
				setBusy( false );
			} );
	};

	const next = () => {
		if ( isLast ) {
			finish();
		} else {
			setStep( ( s ) => s + 1 );
		}
	};
	const back = () => setStep( ( s ) => Math.max( 0, s - 1 ) );

	if ( done ) {
		return (
			<Box sx={ panelSx }>
				<CheckCircleIcon sx={ { fontSize: 44, color: tokens.green, mb: 1 } } />
				<Typography variant="h5" sx={ { mb: 1 } }>You’re all set!</Typography>
				<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
					{ done.tables ? `${ done.tables } tables and ` : '' }
					{ seedSample ? 'a sample menu are' : 'your workspace is' } ready. Jump in and make it yours.
				</Typography>
				<Stack direction="row" spacing={ 1.5 } justifyContent="center">
					{ done.page && (
						<Button variant="outlined" endIcon={ <OpenInNewIcon /> } href={ done.page } target="_blank" rel="noreferrer">
							View my menu
						</Button>
					) }
					<Button variant="contained" onClick={ () => window.location.reload() }>Start</Button>
				</Stack>
			</Box>
		);
	}

	return (
		<Box sx={ panelSx }>
			<Typography sx={ { fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.muted2, mb: 1 } }>
				Step { step + 1 } of { steps.length }
			</Typography>

			{ error && <Alert severity="error" sx={ { mb: 2, width: '100%', maxWidth: 460 } }>{ error }</Alert> }

			{ 'welcome' === current && (
				<>
					<RestaurantIcon sx={ { fontSize: 44, color: tokens.accent, mb: 1 } } />
					<Typography variant="h5" sx={ { mb: 1 } }>Welcome to DineKit</Typography>
					<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
						Let’s set you up in a minute. What’s your place called?
					</Typography>
					<TextField
						label="Restaurant name"
						placeholder="e.g. The Copper Kettle"
						value={ name }
						onChange={ ( e ) => setName( e.target.value ) }
						onKeyDown={ ( e ) => e.key === 'Enter' && name.trim() && next() }
						sx={ { width: '100%', maxWidth: 420 } }
					/>
				</>
			) }

			{ 'type' === current && (
				<>
					<Typography variant="h5" sx={ { mb: 1 } }>How do you serve?</Typography>
					<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
						We’ll switch on the right tools — and hide the ones you don’t need.
					</Typography>
					<Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 1.5 } sx={ { width: '100%', maxWidth: 480 } }>
						{ TYPES.map( ( t ) => {
							const Icon = t.icon;
							const on = type === t.key;
							return (
								<Box
									key={ t.key }
									onClick={ () => setType( t.key ) }
									sx={ {
										flex: 1,
										p: 2,
										borderRadius: 3,
										cursor: 'pointer',
										textAlign: 'center',
										border: `2px solid ${ on ? tokens.accent : tokens.border }`,
										bgcolor: on ? tokens.accentSoft : tokens.surface,
										transition: 'all 0.12s',
									} }
								>
									<Icon sx={ { fontSize: 30, color: on ? tokens.accentDark : tokens.muted2 } } />
									<Typography sx={ { fontWeight: 800, mt: 0.5, color: on ? tokens.accentDark : tokens.ink } }>{ t.label }</Typography>
									<Typography sx={ { fontSize: 12, color: tokens.muted } }>{ t.desc }</Typography>
								</Box>
							);
						} ) }
					</Stack>
				</>
			) }

			{ 'tables' === current && (
				<>
					<RestaurantIcon sx={ { fontSize: 40, color: tokens.accent, mb: 1 } } />
					<Typography variant="h5" sx={ { mb: 1 } }>Add some tables</Typography>
					<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
						We’ll drop this many 2-seaters into a “Main Restaurant” zone — you can rearrange,
						resize and join them on the floor plan later.
					</Typography>
					<TextField
						type="number"
						label="Number of tables"
						value={ tables }
						onChange={ ( e ) => setTables( Math.max( 0, Math.min( 50, parseInt( e.target.value, 10 ) || 0 ) ) ) }
						inputProps={ { min: 0, max: 50 } }
						sx={ { width: 160 } }
						helperText="0 to skip for now"
					/>
				</>
			) }

			{ 'menu' === current && (
				<>
					<AutoAwesomeIcon sx={ { fontSize: 40, color: tokens.accent, mb: 1 } } />
					<Typography variant="h5" sx={ { mb: 1 } }>Your menu</Typography>
					<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
						Start from a sample you can edit, or a clean slate.
					</Typography>
					<Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 1.5 } sx={ { width: '100%', maxWidth: 460 } }>
						{ [ { k: true, t: 'Sample menu', d: 'Starters, mains & desserts to edit' }, { k: false, t: 'Start blank', d: 'Build from scratch' } ].map( ( o ) => {
							const on = seedSample === o.k;
							return (
								<Box
									key={ String( o.k ) }
									onClick={ () => setSeedSample( o.k ) }
									sx={ {
										flex: 1, p: 2, borderRadius: 3, cursor: 'pointer', textAlign: 'center',
										border: `2px solid ${ on ? tokens.accent : tokens.border }`,
										bgcolor: on ? tokens.accentSoft : tokens.surface,
									} }
								>
									<Typography sx={ { fontWeight: 800, color: on ? tokens.accentDark : tokens.ink } }>{ o.t }</Typography>
									<Typography sx={ { fontSize: 12, color: tokens.muted } }>{ o.d }</Typography>
								</Box>
							);
						} ) }
					</Stack>
				</>
			) }

			<Stack direction="row" spacing={ 1.5 } sx={ { mt: 4 } }>
				{ step > 0 && (
					<Button variant="text" onClick={ back } disabled={ busy } sx={ { color: tokens.muted } }>Back</Button>
				) }
				<Button
					variant="contained"
					size="large"
					onClick={ next }
					disabled={ busy || ! canNext }
					startIcon={ busy ? <CircularProgress size={ 18 } color="inherit" /> : null }
				>
					{ isLast ? ( busy ? 'Setting up…' : 'Finish' ) : 'Continue' }
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
	maxWidth: 680,
	mx: 'auto',
	mt: 4,
	boxShadow: '0 12px 32px rgba(15,23,42,0.06)',
};
