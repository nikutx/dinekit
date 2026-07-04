import React, { useEffect, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	Button,
	Switch,
	Chip,
	ToggleButton,
	ToggleButtonGroup,
	CircularProgress,
	Divider,
	Link,
} from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

const REPO = 'https://github.com/nikutx/dinekit';
const SUPPORT_URL = 'https://weblevelup.co.uk/dinekit';

// Decorative tints cycled across the coming-soon cards (categorical, not status).
const SOON_TINTS = [
	{ fg: tokens.violet, bg: tokens.violetSoft },
	{ fg: tokens.sky, bg: tokens.skySoft },
	{ fg: tokens.amber, bg: tokens.amberSoft },
	{ fg: tokens.accent, bg: tokens.accentSoft },
];

// Accounting / CRM integrations on the roadmap — bring-your-own-account, later.
const SOON = [
	{ key: 'xero', name: 'Xero', desc: 'Sync bookings & takings into your accounts.' },
	{ key: 'sage', name: 'Sage', desc: 'Push payments through to Sage automatically.' },
	{ key: 'quickbooks', name: 'QuickBooks', desc: 'Reconcile deposits & prepayments.' },
	{ key: 'crmit', name: 'CRMiT', desc: 'Send guests & bookings to your CRM.' },
];

export default function IntegrationsView() {
	const [ loading, setLoading ] = useState( true );
	const [ data, setData ] = useState( null );
	const [ form, setForm ] = useState( { enabled: false, mode: 'test', testPublishable: '', livePublishable: '' } );
	const [ secret, setSecret ] = useState( { test: '', live: '' } );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const [ test, setTest ] = useState( null );
	const [ testing, setTesting ] = useState( false );
	const [ hook, setHook ] = useState( null );
	const [ hooking, setHooking ] = useState( false );

	const setupWebhook = () => {
		setHooking( true );
		setHook( null );
		api.registerStripeWebhook()
			.then( ( res ) => {
				setHook( res );
				if ( res.settings ) {
					setData( res.settings );
				}
			} )
			.catch( () => setHook( { ok: false, error: 'Could not reach the server.' } ) )
			.finally( () => setHooking( false ) );
	};

	const runTest = () => {
		setTesting( true );
		setTest( null );
		api.testStripe()
			.then( setTest )
			.catch( () => setTest( { valid: false, error: 'Could not reach the server.' } ) )
			.finally( () => setTesting( false ) );
	};

	useEffect( () => {
		api.getIntegrations()
			.then( ( res ) => {
				setData( res );
				setForm( {
					enabled: res.stripe.enabled,
					mode: res.stripe.mode,
					testPublishable: res.stripe.testPublishable,
					livePublishable: res.stripe.livePublishable,
				} );
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	const set = ( patch ) => setForm( ( f ) => ( { ...f, ...patch } ) );

	// Persist Stripe settings. Accepts an override so the enable toggle can save
	// its new value immediately (state updates are async), instead of silently
	// dropping the change until the user remembers to hit "Save Stripe keys".
	const persist = ( overrides = {} ) => {
		const next = { ...form, ...overrides };
		setForm( next );
		setSaveState( 'saving' );
		const payload = {
			stripe: {
				enabled: next.enabled,
				mode: next.mode,
				testPublishable: next.testPublishable,
				livePublishable: next.livePublishable,
			},
		};
		if ( secret.test ) {
			payload.stripe.testSecret = secret.test;
		}
		if ( secret.live ) {
			payload.stripe.liveSecret = secret.live;
		}
		api.saveIntegrations( payload )
			.then( ( res ) => {
				setData( res );
				setSecret( { test: '', live: '' } );
				setSaveState( 'saved' );
				setTimeout( () => setSaveState( 'idle' ), 2000 );
			} )
			.catch( () => setSaveState( 'error' ) );
	};

	const save = () => persist();

	if ( loading ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	const mode = form.mode;
	const pkKey = mode === 'live' ? 'livePublishable' : 'testPublishable';
	const secretSet = mode === 'live' ? data.stripe.liveSecretSet : data.stripe.testSecretSet;
	const webhookSet = mode === 'live' ? data.stripe.liveWebhookSet : data.stripe.testWebhookSet;
	const webhookable = !! data.stripe.webhookable;

	return (
		<Page>
			<PageHeader
				title="Integrations"
				subtitle="Connect the tools you already use. You bring your own accounts and keys — DineKit takes no cut and never sits between you and your money."
			/>

			{ /* Stripe */ }
			<Card>
				<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 0.5 } }>
					<CreditCardIcon sx={ { color: tokens.accent } } />
					<Box sx={ { flex: 1 } }>
						<Typography sx={ { fontWeight: 650, fontSize: 15, color: tokens.ink } }>Stripe</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>
							Take booking deposits & event prepayments — straight into your own Stripe account,
							0% commission.
						</Typography>
					</Box>
					<Chip
						label="You keep 100%"
						size="small"
						sx={ { bgcolor: tokens.greenSoft, color: tokens.green, fontWeight: 600 } }
					/>
				</Stack>

				<Divider sx={ { my: 2 } } />

				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<Switch checked={ form.enabled } onChange={ ( e ) => persist( { enabled: e.target.checked } ) } />
						<Typography sx={ { fontSize: 14, fontWeight: 600 } }>
							{ form.enabled ? 'Stripe enabled' : 'Stripe off' }
						</Typography>
					</Stack>
					<ToggleButtonGroup
						size="small"
						exclusive
						value={ mode }
						onChange={ ( e, v ) => v && set( { mode: v } ) }
					>
						<ToggleButton value="test">Test</ToggleButton>
						<ToggleButton value="live">Live</ToggleButton>
					</ToggleButtonGroup>
				</Stack>

				<Stack spacing={ 1.5 }>
					<TextField
						label={ `${ mode === 'live' ? 'Live' : 'Test' } publishable key` }
						placeholder={ mode === 'live' ? 'pk_live_…' : 'pk_test_…' }
						value={ form[ pkKey ] }
						onChange={ ( e ) => set( { [ pkKey ]: e.target.value } ) }
						fullWidth
					/>
					<TextField
						label={ `${ mode === 'live' ? 'Live' : 'Test' } secret key` }
						type="password"
						placeholder={ secretSet ? '•••••••••••• (saved — leave blank to keep)' : ( mode === 'live' ? 'sk_live_…' : 'sk_test_…' ) }
						value={ secret[ mode ] }
						onChange={ ( e ) => setSecret( ( s ) => ( { ...s, [ mode ]: e.target.value } ) ) }
						fullWidth
						InputProps={ { startAdornment: <LockIcon sx={ { fontSize: 16, color: tokens.muted2, mr: 1 } } /> } }
						helperText={
							secretSet
								? 'A secret key is stored securely and never shown again.'
								: 'Your secret key is stored on your site and never sent to us.'
						}
					/>
				</Stack>

				<Stack direction="row" alignItems="center" spacing={ 2 } sx={ { mt: 2 } }>
					<Button variant="contained" onClick={ save } disabled={ saveState === 'saving' }>
						{ saveState === 'saving' ? 'Saving…' : 'Save Stripe keys' }
					</Button>
					<Button variant="outlined" onClick={ runTest } disabled={ testing }>
						{ testing ? 'Testing…' : 'Test connection' }
					</Button>
					{ saveState === 'saved' && (
						<Stack direction="row" alignItems="center" spacing={ 0.5 } sx={ { color: tokens.green } }>
							<CheckCircleIcon sx={ { fontSize: 18 } } />
							<Typography sx={ { fontSize: 13, fontWeight: 600 } }>Saved</Typography>
						</Stack>
					) }
					<Box sx={ { flex: 1 } } />
					<Link href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener" sx={ { fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 0.5 } }>
						Where are my keys? <OpenInNewIcon sx={ { fontSize: 14 } } />
					</Link>
				</Stack>

				{ test && (
					<Box sx={ { mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: test.valid ? tokens.greenSoft : tokens.redSoft } }>
						{ test.valid ? (
							<Typography sx={ { fontSize: 13, color: tokens.green, fontWeight: 600 } }>
								✓ Connected{ test.account ? ` to ${ test.account }` : '' } · { test.mode } mode
								{ test.chargesEnabled ? ' · charges enabled' : ' · charges not enabled yet' }
								{ test.modeMismatch ? ' — note: this key’s mode differs from your selected mode' : '' }
							</Typography>
						) : (
							<Typography sx={ { fontSize: 13, color: tokens.red, fontWeight: 600 } }>
								✗ { test.error || 'Connection failed.' }
							</Typography>
						) }
					</Box>
				) }

				<Divider sx={ { my: 2 } } />

				{ /* Webhook — auto-registered so fulfilment is reliable even if the diner closes the tab. */ }
				<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 1 } }>
					<Box sx={ { flex: 1 } }>
						<Stack direction="row" alignItems="center" spacing={ 1 }>
							<Typography sx={ { fontWeight: 650, fontSize: 14, color: tokens.ink } }>Payment webhook</Typography>
							<Chip
								label={ webhookSet ? 'Set up' : 'Not set up' }
								size="small"
								sx={ {
									bgcolor: webhookSet ? tokens.greenSoft : tokens.soft,
									color: webhookSet ? tokens.green : tokens.muted,
									fontWeight: 600,
								} }
							/>
						</Stack>
						<Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 0.25 } }>
							Confirms payments even if the diner closes the tab. DineKit creates it in your Stripe
							account for you — no copy-pasting a signing secret.
						</Typography>
					</Box>
					<Button
						variant="outlined"
						onClick={ setupWebhook }
						disabled={ hooking || ! webhookable }
					>
						{ hooking ? 'Setting up…' : webhookSet ? 'Refresh webhook' : 'Set up automatically' }
					</Button>
				</Stack>

				{ ! webhookable && (
					<Typography sx={ { fontSize: 12.5, color: tokens.muted2 } }>
						Available on your live site — Stripe can’t reach a local/dev address ({ data.stripe.webhookUrl }).
					</Typography>
				) }

				{ hook && (
					<Box sx={ { mt: 1, p: 1.5, borderRadius: 2, bgcolor: hook.ok ? tokens.greenSoft : tokens.redSoft } }>
						<Typography sx={ { fontSize: 13, fontWeight: 600, color: hook.ok ? tokens.green : tokens.red } }>
							{ hook.ok
								? `✓ Webhook ready (${ hook.mode } mode) — listening for payments at ${ hook.url }`
								: `✗ ${ hook.error || 'Could not set up the webhook.' }` }
						</Typography>
					</Box>
				) }
			</Card>

			{ /* Coming soon: accounting & CRM */ }
			<Typography variant="subtitle2" sx={ { color: tokens.ink2, mt: 4, mb: 1.5 } }>
				Accounting &amp; CRM
				<Typography component="span" sx={ { color: tokens.muted2, fontWeight: 600, ml: 1 } }>
					on the roadmap — tell us which to build first
				</Typography>
			</Typography>
			<Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 } }>
				{ SOON.map( ( item, i ) => {
					const tint = SOON_TINTS[ i % SOON_TINTS.length ];
					return (
						<Card key={ item.key } sx={ { p: 2 } }>
							<Stack direction="row" alignItems="center" spacing={ 1.25 } sx={ { mb: 0.75 } }>
								<Box
									sx={ {
										width: 36,
										height: 36,
										borderRadius: '8px',
										bgcolor: tint.bg,
										color: tint.fg,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										flexShrink: 0,
									} }
								>
									<ReceiptLongIcon sx={ { fontSize: 20 } } />
								</Box>
								<Typography sx={ { fontWeight: 650, fontSize: 15, color: tokens.ink, flex: 1 } }>{ item.name }</Typography>
								<Chip label="Coming soon" size="small" sx={ { bgcolor: tokens.soft, color: tokens.muted, fontWeight: 600 } } />
							</Stack>
							<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 1.5 } }>{ item.desc }</Typography>
							<Button
								size="small"
								variant="outlined"
								startIcon={ <HowToVoteIcon /> }
								endIcon={ <OpenInNewIcon sx={ { fontSize: 14 } } /> }
								href={ `${ REPO }/discussions` }
								target="_blank"
								rel="noopener"
							>
								Vote on GitHub
							</Button>
						</Card>
					);
				} ) }
			</Box>

			{ /* Support */ }
			<Box sx={ { bgcolor: tokens.ink, color: '#fff', borderRadius: '12px', p: 2.5, mt: 4 } }>
				<Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 2 } alignItems={ { sm: 'center' } }>
					<SupportAgentIcon sx={ { fontSize: 32, color: tokens.accent } } />
					<Box sx={ { flex: 1 } }>
						<Typography sx={ { fontWeight: 800, fontSize: 16 } }>Need a hand?</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted2 } }>
							Web Level Up — the team behind DineKit — can set it up for you or fix an issue fast.
							£60 for a focused 15-minute diagnostic.
						</Typography>
					</Box>
					<Button
						variant="contained"
						endIcon={ <OpenInNewIcon sx={ { fontSize: 16 } } /> }
						href={ SUPPORT_URL }
						target="_blank"
						rel="noopener"
						sx={ { bgcolor: tokens.accent, '&:hover': { bgcolor: tokens.accentDark }, flexShrink: 0 } }
					>
						Get support
					</Button>
				</Stack>
			</Box>

			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 2, textAlign: 'center' } }>
				DineKit never phones home. Keys stay on your site; support and voting open in your browser
				only when you click.
			</Typography>
		</Page>
	);
}
