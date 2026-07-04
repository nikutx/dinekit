import React, { useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Button,
	TextField,
	Chip,
	CircularProgress,
	Tooltip,
	Switch,
	Snackbar,
	Slider,
	ToggleButton,
	ToggleButtonGroup,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens } from '../theme';
import { api } from '../api/client';
import Card from './ui/Card';
import PageHeader from './ui/PageHeader';

// Restaurant-friendly accent presets for the public widget.
const SWATCHES = [
	'#4f46e5', // DineKit indigo
	'#18181b', // Ink
	'#7f1d1d', // Burgundy
	'#b45309', // Amber
	'#047857', // Forest
	'#0369a1', // Sea
	'#be185d', // Rose
	'#57534e', // Stone
];

export default function BookingSettingsView( { onBack } ) {
	const [ cfg, setCfg ] = useState( null );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ copied, setCopied ] = useState( false );
	const debounce = useRef( null );

	useEffect( () => {
		api.getBookingSettings().then( setCfg );
	}, [] );

	const patch = ( p ) => {
		const next = { ...cfg, ...p };
		setCfg( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveBookingSettings( next ).then( () => setSaveState( 'saved' ) ).catch( () => setSaveState( 'error' ) );
		}, 500 );
	};

	if ( ! cfg ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', py: 6 } }>
				<CircularProgress size={ 24 } />
			</Box>
		);
	}

	const num = ( label, key, min, max, help, width = 150 ) => (
		<TextField
			label={ label }
			type="number"
			size="small"
			value={ cfg[ key ] }
			onChange={ ( e ) => patch( { [ key ]: Math.max( min, Math.min( max, parseInt( e.target.value, 10 ) || min ) ) } ) }
			inputProps={ { min, max } }
			helperText={ help }
			sx={ { width } }
		/>
	);

	const onOff = ( label, key, tip ) => (
		<Stack direction="row" alignItems="center" spacing={ 1 }>
			<Switch checked={ !! cfg[ key ] } onChange={ ( e ) => patch( { [ key ]: e.target.checked } ) } />
			{ tip ? (
				<Tooltip title={ tip }>
					<Typography sx={ { fontSize: 14, fontWeight: 600 } }>{ label }</Typography>
				</Tooltip>
			) : (
				<Typography sx={ { fontSize: 14, fontWeight: 600 } }>{ label }</Typography>
			) }
		</Stack>
	);

	const copyShortcode = () => {
		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( '[dinekit_booking]' ).then( () => setCopied( true ) );
		}
	};

	const section = ( title, sub ) => (
		<Box sx={ { mb: 2 } }>
			<Typography sx={ { fontWeight: 650, fontSize: 15, color: tokens.ink } }>{ title }</Typography>
			{ sub && <Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 0.25 } }>{ sub }</Typography> }
		</Box>
	);

	return (
		<Box>
			<PageHeader
				title="Booking settings"
				subtitle="The rules behind your diary and the public booking widget."
				actions={
					<>
						<Typography sx={ { fontSize: 12, color: saveState === 'error' ? tokens.red : tokens.muted, minWidth: 50, textAlign: 'right' } }>
							{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : '' }
						</Typography>
						<Button startIcon={ <ArrowBackIcon /> } onClick={ onBack } variant="outlined">
							Back to diary
						</Button>
					</>
				}
			/>

			<Stack spacing={ 2 }>
				{ /* ---- Online bookings ---- */ }
				<Card sx={ { p: 2.5 } }>
					{ section( 'Online bookings', 'How requests from your website are taken.' ) }
					<Stack direction="row" spacing={ 3 } flexWrap="wrap" useFlexGap>
						{ onOff( 'Accept online bookings', 'online_enabled' ) }
						{ onOff( 'Auto-confirm', 'auto_confirm', 'On: booked instantly. Off: comes in as a request you confirm.' ) }
						{ onOff( 'Waitlist when full', 'allow_waitlist', 'When a slot is full, diners can join the waitlist (penciled in) instead of being turned away.' ) }
					</Stack>
				</Card>

				{ /* ---- Rules ---- */ }
				<Card sx={ { p: 2.5 } }>
					{ section( 'Booking rules', 'Party sizes, lead times and how long a table is held.' ) }
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
						{ num( 'Min party', 'min_party', 1, 50 ) }
						{ num( 'Max party', 'max_party', 1, 100 ) }
						{ num( 'Notice (hours)', 'min_notice', 0, 720 ) }
						{ num( 'Book up to (days)', 'max_days_ahead', 1, 730 ) }
					</Stack>
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mt: 1.5 } }>
						<TextField label="First booking" type="time" size="small" value={ cfg.open_time } onChange={ ( e ) => patch( { open_time: e.target.value } ) } sx={ { width: 130 } } />
						<TextField label="Last booking" type="time" size="small" value={ cfg.close_time } onChange={ ( e ) => patch( { close_time: e.target.value } ) } sx={ { width: 130 } } />
						{ num( 'Slot gap (min)', 'slot_interval', 5, 240 ) }
						{ num( 'Turn time (min)', 'turn_time', 15, 480, 'How long a table is held' ) }
						{ num( 'Buffer (min)', 'buffer', 0, 120, 'Gap between sittings' ) }
					</Stack>
					<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
						Bookable times follow your <strong>Opening Hours</strong> — set separate lunch &amp; dinner
						services, closed days and holidays there and the widget updates automatically. First/Last
						booking above are only used as a fallback until you&rsquo;ve set your Opening Hours.
					</Typography>
				</Card>

				{ /* ---- Capacity & deposits ---- */ }
				<Card sx={ { p: 2.5 } }>
					{ section( 'Capacity & deposits', 'Pace the kitchen and protect big tables against no-shows.' ) }
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
						{ num( 'Covers / hour', 'covers_per_hour', 0, 1000, '0 = no limit' ) }
						{ num( 'Deposit over (guests)', 'deposit_over', 0, 100, '0 = never' ) }
						{ num( 'Deposit / guest', 'deposit_amount', 0, 100000 ) }
					</Stack>
					<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
						Online bookings above the covers-per-hour cap are offered the waitlist. Deposit amounts
						are collected automatically once Stripe is connected in Integrations — until then the
						widget shows the deposit note and the booking is flagged.
					</Typography>
				</Card>

				{ /* ---- Widget appearance ---- */ }
				<Card sx={ { p: 2.5 } }>
					{ section( 'Widget appearance', 'Make the booking form look like your restaurant, not like a plugin.' ) }
					<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 3 }>
						<Box sx={ { flex: 1, minWidth: 260 } }>
							<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.muted, mb: 1 } }>Accent colour</Typography>
							<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap>
								{ SWATCHES.map( ( c ) => (
									<Box
										key={ c }
										onClick={ () => patch( { widget_accent: c } ) }
										sx={ {
											width: 26,
											height: 26,
											borderRadius: '8px',
											bgcolor: c,
											cursor: 'pointer',
											outline: cfg.widget_accent === c ? `2px solid ${ tokens.ink }` : `1px solid ${ tokens.border2 }`,
											outlineOffset: 2,
										} }
									/>
								) ) }
								<Box
									component="input"
									type="color"
									value={ cfg.widget_accent }
									onChange={ ( e ) => patch( { widget_accent: e.target.value } ) }
									sx={ { width: 34, height: 30, p: 0, border: `1px solid ${ tokens.border2 }`, borderRadius: '8px', bgcolor: 'transparent', cursor: 'pointer' } }
								/>
							</Stack>

							<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.muted, mt: 2.5, mb: 0.5 } }>
								Corner radius — { cfg.widget_radius }px
							</Typography>
							<Slider
								value={ cfg.widget_radius }
								onChange={ ( e, v ) => patch( { widget_radius: v } ) }
								min={ 0 }
								max={ 32 }
								size="small"
								sx={ { maxWidth: 260 } }
							/>

							<Stack direction="row" spacing={ 3 } sx={ { mt: 2 } } flexWrap="wrap" useFlexGap>
								<Box>
									<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.muted, mb: 0.75 } }>Style</Typography>
									<ToggleButtonGroup
										exclusive
										size="small"
										value={ cfg.widget_style }
										onChange={ ( e, v ) => v && patch( { widget_style: v } ) }
									>
										<ToggleButton value="light">Light</ToggleButton>
										<ToggleButton value="dark">Dark</ToggleButton>
									</ToggleButtonGroup>
								</Box>
								<Box>
									<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.muted, mb: 0.75 } }>Font</Typography>
									<ToggleButtonGroup
										exclusive
										size="small"
										value={ cfg.widget_font }
										onChange={ ( e, v ) => v && patch( { widget_font: v } ) }
									>
										<ToggleButton value="system">Clean (system)</ToggleButton>
										<ToggleButton value="inherit">Match my theme</ToggleButton>
									</ToggleButtonGroup>
								</Box>
							</Stack>

							<TextField
								label="Intro text (above the form)"
								size="small"
								fullWidth
								value={ cfg.intro }
								onChange={ ( e ) => patch( { intro: e.target.value } ) }
								placeholder="We hold tables for 15 minutes — call for parties over 8."
								sx={ { mt: 2.5, maxWidth: 420 } }
							/>
						</Box>

						<WidgetPreview cfg={ cfg } />
					</Stack>

					<Stack direction="row" alignItems="center" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mt: 2.5 } }>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>
							Add the form to any page with the <strong>DineKit Booking Form</strong> block, or this shortcode:
						</Typography>
						<Chip
							label="[dinekit_booking]"
							onClick={ copyShortcode }
							onDelete={ copyShortcode }
							deleteIcon={ <ContentCopyIcon /> }
							sx={ { fontFamily: 'monospace', fontWeight: 700, bgcolor: tokens.soft } }
						/>
					</Stack>
				</Card>

				{ /* ---- Notifications ---- */ }
				<Card sx={ { p: 2.5 } }>
					{ section( 'Notifications', 'Who hears about new bookings.' ) }
					<Stack direction="row" spacing={ 2 } alignItems="center" flexWrap="wrap" useFlexGap>
						{ onOff( 'Email notifications', 'emails_enabled' ) }
						<TextField
							label="Notify email (staff)"
							type="email"
							size="small"
							placeholder="Defaults to site admin"
							value={ cfg.notify_email }
							onChange={ ( e ) => patch( { notify_email: e.target.value } ) }
							sx={ { width: 260 } }
						/>
					</Stack>
				</Card>
			</Stack>

			<Snackbar
				open={ copied }
				autoHideDuration={ 1800 }
				onClose={ () => setCopied( false ) }
				message="Shortcode copied"
				anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
			/>
		</Box>
	);
}

/**
 * Live mock of the public widget so branding changes are instant — mirrors the
 * markup/values that assets/css/booking.css renders on the real form.
 */
function WidgetPreview( { cfg } ) {
	const dark = cfg.widget_style === 'dark';
	const c = {
		surface: dark ? '#0f172a' : '#fff',
		ink: dark ? '#f1f5f9' : '#0f172a',
		muted: dark ? '#94a3b8' : '#64748b',
		border: dark ? '#334155' : '#e2e8f0',
		soft: dark ? '#1e293b' : '#f8fafc',
		green: dark ? '#4ade80' : '#16a34a',
	};
	const radius = cfg.widget_radius;
	const inner = Math.max( 0, radius - 6 );
	const field = ( label, value ) => (
		<Box sx={ { flex: 1, minWidth: 0 } }>
			<Typography sx={ { fontSize: 10.5, fontWeight: 600, color: c.muted, mb: 0.25 } }>{ label }</Typography>
			<Box sx={ { border: `1px solid ${ c.border }`, borderRadius: `${ inner }px`, px: 1, py: 0.75, fontSize: 12, color: c.ink, bgcolor: c.surface, whiteSpace: 'nowrap', overflow: 'hidden' } }>
				{ value }
			</Box>
		</Box>
	);

	return (
		<Box
			sx={ {
				width: 320,
				flexShrink: 0,
				alignSelf: 'flex-start',
				bgcolor: c.surface,
				border: `1px solid ${ c.border }`,
				borderRadius: `${ radius }px`,
				p: 2,
				boxShadow: tokens.shadowSm,
				fontFamily: cfg.widget_font === 'system' ? '-apple-system, "Segoe UI", Roboto, sans-serif' : 'inherit',
			} }
		>
			<Typography sx={ { fontWeight: 800, fontSize: 16, color: c.ink, letterSpacing: '-0.02em' } }>Book a table</Typography>
			<Typography sx={ { fontSize: 11.5, color: c.muted, mb: 1.5 } }>
				{ cfg.intro || 'Live preview — this is how diners see it.' }
			</Typography>
			<Stack direction="row" spacing={ 1 } sx={ { mb: 1 } }>
				{ field( 'Date', 'Fri 10 Jul' ) }
				{ field( 'Time', '19:30' ) }
				{ field( 'Guests', '2 guests' ) }
			</Stack>
			<Typography sx={ { fontSize: 11.5, fontWeight: 700, color: c.green, mb: 1 } }>✓ Available</Typography>
			<Stack direction="row" spacing={ 1 } sx={ { mb: 1.5 } }>
				{ field( 'Name', 'Alex Diner' ) }
				{ field( 'Email', 'alex@…' ) }
			</Stack>
			<Box
				sx={ {
					bgcolor: cfg.widget_accent,
					color: '#fff',
					textAlign: 'center',
					fontWeight: 700,
					fontSize: 13,
					py: 1,
					borderRadius: `${ inner }px`,
				} }
			>
				Book now
			</Box>
		</Box>
	);
}
