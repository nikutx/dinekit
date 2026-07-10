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
import ScheduleIcon from '@mui/icons-material/Schedule';
import { tokens } from '../theme';
import { api } from '../api/client';

const DAYS = [
	[ 'mon', 'Monday' ], [ 'tue', 'Tuesday' ], [ 'wed', 'Wednesday' ], [ 'thu', 'Thursday' ],
	[ 'fri', 'Friday' ], [ 'sat', 'Saturday' ], [ 'sun', 'Sunday' ],
];

// Mirrors Hours\default_week() on the server.
const defaultWeek = () =>
	Object.fromEntries( DAYS.map( ( [ k ] ) => [ k, [ { open: '12:00', close: '22:00' } ] ] ) );

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

// Opening hours, pre-filled and adjustable right here. Bookings and the ordering
// cutoff both read these, so capturing them up front avoids a venue that looks
// open but takes no bookings (or takes them at 3am).
function HoursStep( { week, setWeek } ) {
	const setDay = ( key, patch ) =>
		setWeek( ( w ) => {
			const periods = w[ key ] || [];
			if ( patch.closed ) {
				return { ...w, [ key ]: [] };
			}
			const base = periods[ 0 ] || { open: '12:00', close: '22:00' };
			return { ...w, [ key ]: [ { ...base, ...patch } ] };
		} );

	return (
		<Stack spacing={ 0.75 } sx={ { width: '100%', maxWidth: 460 } }>
			{ DAYS.map( ( [ key, label ] ) => {
				const periods = week[ key ] || [];
				const closed = periods.length === 0;
				const p = periods[ 0 ] || { open: '12:00', close: '22:00' };
				return (
					<Stack
						key={ key }
						direction="row"
						alignItems="center"
						spacing={ 1 }
						sx={ {
							px: 1.5, py: 0.75, borderRadius: '10px',
							border: `1px solid ${ tokens.border }`,
							bgcolor: closed ? tokens.soft : tokens.surface,
						} }
					>
						<Typography sx={ { width: 96, textAlign: 'left', fontWeight: 550, fontSize: 14, color: closed ? tokens.muted2 : tokens.ink } }>
							{ label }
						</Typography>
						{ closed ? (
							<Typography sx={ { flex: 1, textAlign: 'left', fontSize: 13, color: tokens.muted2 } }>Closed</Typography>
						) : (
							<Stack direction="row" alignItems="center" spacing={ 0.75 } sx={ { flex: 1 } }>
								<TextField
									type="time" size="small" value={ p.open }
									onChange={ ( e ) => setDay( key, { open: e.target.value } ) }
									sx={ { width: 116 } }
								/>
								<Typography sx={ { color: tokens.muted2, fontSize: 13 } }>to</Typography>
								<TextField
									type="time" size="small" value={ p.close }
									onChange={ ( e ) => setDay( key, { close: e.target.value } ) }
									sx={ { width: 116 } }
								/>
							</Stack>
						) }
						<Button
							variant="text" size="small"
							onClick={ () => setDay( key, closed ? { open: '12:00', close: '22:00' } : { closed: true } ) }
							sx={ { color: tokens.muted, minWidth: 64 } }
						>
							{ closed ? 'Open' : 'Close' }
						</Button>
					</Stack>
				);
			} ) }
		</Stack>
	);
}

export default function Wizard( { onDone } ) {
	const [ step, setStep ] = useState( 0 );
	const [ name, setName ] = useState( '' );
	const [ type, setType ] = useState( '' );
	const [ tables, setTables ] = useState( 6 );
	const [ seedSample, setSeedSample ] = useState( true );
	const [ week, setWeek ] = useState( defaultWeek );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ done, setDone ] = useState( null );

	// Steps depend on the chosen business type (takeaway skips the tables step).
	const steps = useMemo( () => {
		const list = [ 'welcome', 'type' ];
		if ( type !== 'takeaway' ) {
			list.push( 'tables' );
		}
		list.push( 'menu', 'hours' );
		return list;
	}, [ type ] );

	const current = steps[ Math.min( step, steps.length - 1 ) ];
	const isLast = step >= steps.length - 1;

	const canNext =
		( 'welcome' === current && name.trim() ) ||
		( 'type' === current && type ) ||
		'tables' === current ||
		'menu' === current ||
		'hours' === current;

	// `skip` bails out of the guided flow but still records the essentials, so the
	// dashboard's setup guide picks up exactly where this left off.
	const finish = ( skip = false ) => {
		setBusy( true );
		setError( '' );
		api.runWizard( {
			name: name.trim(),
			businessType: type || 'both',
			seedSample: skip ? false : seedSample,
			tables: skip || type === 'takeaway' ? 0 : tables,
			hours: skip ? undefined : week,
		} )
			.then( ( res ) => {
				setDone( { ...res, skipped: skip, seeded: skip ? false : seedSample } );
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
		// What to do next depends on what actually exists now. With a sample menu
		// there's a real page worth viewing; from a blank start there isn't, so we
		// point at the builder instead of a live, empty page.
		const nextStep = done.seeded
			? { label: 'Build on your sample menu', hint: 'Edit the starter dishes, prices and allergens.' }
			: { label: 'Add your first dishes', hint: 'Create a section, then add dishes with prices and allergens.' };

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
				<Typography variant="h5" sx={ { mb: 1 } }>
					{ done.skipped ? 'Setup skipped' : 'You’re all set!' }
				</Typography>
				<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
					{ done.skipped
						? 'No problem — the setup guide on your dashboard has every step whenever you want it.'
						: `${ done.tables ? `${ done.tables } tables, ` : '' }${ done.seeded ? 'a sample menu' : 'a blank menu' } and your opening hours are ready.` }
				</Typography>

				{ ! done.skipped && (
					<Box sx={ { width: '100%', maxWidth: 460, textAlign: 'left', p: 2, mb: 3, borderRadius: '12px', border: `1px solid ${ tokens.border }`, bgcolor: tokens.soft } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 0.75 } }>
							Next up
						</Typography>
						<Typography sx={ { fontWeight: 600, fontSize: 14.5, color: tokens.ink } }>{ nextStep.label }</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>{ nextStep.hint }</Typography>
						<Typography sx={ { fontSize: 12.5, color: tokens.muted2, mt: 1 } }>
							Your dashboard tracks the rest — publishing pages, payments and taking your first booking.
						</Typography>
					</Box>
				) }

				<Stack direction="row" spacing={ 1.5 } justifyContent="center">
					{ done.page && (
						<Button variant="outlined" endIcon={ <OpenInNewIcon /> } href={ done.page } target="_blank" rel="noreferrer">
							View my menu
						</Button>
					) }
					<Button
						variant="contained"
						onClick={ () => {
							// Land on the next action, not a generic dashboard. Skippers go
							// to the dashboard, where the setup guide is waiting.
							window.location.hash = done.skipped ? '#/home' : '#/builder';
							window.location.reload();
						} }
					>
						{ done.skipped ? 'Go to dashboard' : 'Start building' }
					</Button>
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

			{ 'hours' === current && (
				<>
					<ScheduleIcon sx={ { fontSize: 40, color: tokens.accent, mb: 1 } } />
					<Typography variant="h5" sx={ { mb: 1 } }>When are you open?</Typography>
					<Typography sx={ { color: tokens.muted, mb: 3, maxWidth: 460 } }>
						These drive your booking times and when you stop taking orders.
						We’ve started you at 12:00–22:00 — adjust anything that’s wrong.
					</Typography>
					<HoursStep week={ week } setWeek={ setWeek } />
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

			<Button
				variant="text"
				size="small"
				onClick={ () => finish( true ) }
				disabled={ busy }
				sx={ { mt: 1.5, color: tokens.muted2, fontWeight: 500 } }
			>
				Skip setup — I’ll do it myself
			</Button>
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
