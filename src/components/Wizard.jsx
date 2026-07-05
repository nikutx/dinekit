import React, { useMemo, useState } from 'react';
import {
	Box,
	Typography,
	TextField,
	Button,
	Stack,
	Alert,
	CircularProgress,
} from '../ui';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TakeoutDiningIcon from '@mui/icons-material/TakeoutDining';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { tokens } from '../theme';
import { api } from '../api/client';

const TYPES = [
	{ key: 'dinein', label: 'Dine-in', desc: 'Tables & bookings', icon: RestaurantIcon, fg: tokens.accent, bg: tokens.accentSoft },
	{ key: 'takeaway', label: 'Takeaway', desc: 'Order & collect', icon: TakeoutDiningIcon, fg: tokens.violet, bg: tokens.violetSoft },
	{ key: 'both', label: 'Both', desc: 'Dine-in + takeaway', icon: StorefrontIcon, fg: tokens.sky, bg: tokens.skySoft },
];

// Brand mark — matches the sidebar logo.
function Mark( { size = 44 } ) {
	return (
		<Box
			sx={ {
				width: size,
				height: size,
				borderRadius: '12px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				mx: 'auto',
				mb: 2,
				background: `linear-gradient(135deg, #6366f1 0%, ${ tokens.accentDark } 100%)`,
				boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22), 0 4px 14px rgba(79,70,229,.35)',
			} }
		>
			<RestaurantIcon sx={ { fontSize: size * 0.5, color: '#fff' } } />
		</Box>
	);
}

// Step progress dots.
function Dots( { count, active } ) {
	return (
		<Stack direction="row" spacing={ 0.75 } justifyContent="center" sx={ { mb: 3 } }>
			{ Array.from( { length: count } ).map( ( _, i ) => (
				<Box
					key={ i }
					sx={ {
						height: 6,
						borderRadius: 999,
						width: i === active ? 22 : 6,
						bgcolor: i === active ? tokens.accent : i < active ? `${ tokens.accent }66` : tokens.border2,
						transition: 'all .25s ease',
					} }
				/>
			) ) }
		</Stack>
	);
}

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
				<Box
					sx={ {
						width: 64,
						height: 64,
						borderRadius: '50%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						mx: 'auto',
						mb: 2,
						background: `radial-gradient(circle at 50% 35%, ${ tokens.greenSoft } 0%, #ffffff 90%)`,
						border: `1px solid ${ tokens.border }`,
					} }
				>
					<CheckCircleIcon sx={ { fontSize: 34, color: tokens.green } } />
				</Box>
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
			<Dots count={ steps.length } active={ step } />

			{ error && <Alert severity="error" sx={ { mb: 2, width: '100%', maxWidth: 460 } }>{ error }</Alert> }

			{ 'welcome' === current && (
				<>
					<Mark />
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
										p: 2.25,
										borderRadius: '12px',
										cursor: 'pointer',
										textAlign: 'center',
										border: `2px solid ${ on ? tokens.accent : tokens.border }`,
										bgcolor: tokens.surface,
										boxShadow: on ? `0 0 0 3px ${ tokens.accentSoft }` : 'none',
										transition: 'all 0.15s ease',
										'&:hover': { borderColor: on ? tokens.accent : tokens.border2, boxShadow: on ? `0 0 0 3px ${ tokens.accentSoft }` : tokens.shadowMd, transform: 'translateY(-1px)' },
									} }
								>
									<Box
										sx={ {
											width: 44,
											height: 44,
											borderRadius: '10px',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											mx: 'auto',
											mb: 1,
											bgcolor: t.bg,
										} }
									>
										<Icon sx={ { fontSize: 24, color: t.fg } } />
									</Box>
									<Typography sx={ { fontWeight: 650, color: on ? tokens.accentDark : tokens.ink } }>{ t.label }</Typography>
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
										flex: 1, p: 2.25, borderRadius: '12px', cursor: 'pointer', textAlign: 'center',
										border: `2px solid ${ on ? tokens.accent : tokens.border }`,
										bgcolor: tokens.surface,
										boxShadow: on ? `0 0 0 3px ${ tokens.accentSoft }` : 'none',
										transition: 'all 0.15s ease',
										'&:hover': { borderColor: on ? tokens.accent : tokens.border2 },
									} }
								>
									<Typography sx={ { fontWeight: 650, color: on ? tokens.accentDark : tokens.ink } }>{ o.t }</Typography>
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
	borderRadius: '16px',
	p: { xs: 4, sm: 6 },
	textAlign: 'center',
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	maxWidth: 660,
	mx: 'auto',
	mt: 5,
	boxShadow: tokens.shadow,
	background: `linear-gradient(180deg, #fdfdff 0%, #ffffff 30%)`,
};
