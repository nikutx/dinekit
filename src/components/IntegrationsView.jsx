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
} from '../ui';
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
	const [ connecting, setConnecting ] = useState( '' ); // '', 'saving', 'testing', 'webhook'
	const [ connectDone, setConnectDone ] = useState( false );

	// One-click connect: save keys → test → auto-register webhook + wallets.
	const connect = async () => {
		setConnectDone( false );
		setTest( null );
		setHook( null );
		const payload = {
			stripe: {
				enabled: true,
				mode: form.mode,
				testPublishable: form.testPublishable,
				livePublishable: form.livePublishable,
			},
		};
		if ( secret.test ) {
			payload.stripe.testSecret = secret.test;
		}
		if ( secret.live ) {
			payload.stripe.liveSecret = secret.live;
		}
		try {
			setConnecting( 'saving' );
			const saved = await api.saveIntegrations( payload );
			setData( saved );
			setSecret( { test: '', live: '' } );
			set( { enabled: true } );

			setConnecting( 'testing' );
			const t = await api.testStripe();
			setTest( t );

			if ( t && t.valid && saved.stripe.webhookable ) {
				setConnecting( 'webhook' );
				const h = await api.registerStripeWebhook();
				setHook( h );
				if ( h.settings ) {
					setData( h.settings );
				}
			}
			setConnectDone( true );
		} catch ( e ) {
			setTest( { valid: false, error: ( e && e.message ) || 'Could not connect.' } );
		} finally {
			setConnecting( '' );
		}
	};

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

	// Deep-link straight to the right Stripe API-keys page + validate as they paste.
	const keysUrl = mode === 'live' ? 'https://dashboard.stripe.com/apikeys' : 'https://dashboard.stripe.com/test/apikeys';
	const pkVal = form[ pkKey ] || '';
	const pkOk = new RegExp( '^pk_' + ( mode === 'live' ? 'live' : 'test' ) + '_' ).test( pkVal );
	const pkBad = pkVal.length > 3 && ! pkOk;
	const skVal = secret[ mode ] || '';
	const skOk = /^(sk|rk)_(test|live)_/.test( skVal );
	const skBad = skVal.length > 3 && ! skOk;
	const okTick = <CheckCircleIcon sx={ { fontSize: 18, color: tokens.green } } />;
	const canConnect = ( pkOk || ( secretSet && '' === pkVal ) ) && ! skBad && '' === connecting;

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

				{ /* Step 1 — deep-link straight to the correct (test/live) keys page. */ }
				<Box sx={ { display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, mb: 1.5, borderRadius: 2, bgcolor: tokens.soft } }>
					<Box sx={ { width: 22, height: 22, borderRadius: '50%', bgcolor: tokens.accent, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }>1</Box>
					<Typography sx={ { fontSize: 13, color: tokens.ink2, flex: 1 } }>
						Open your Stripe { mode === 'live' ? 'live' : 'test' } keys, then copy the Publishable + Secret key below.
					</Typography>
					<Button size="small" variant="outlined" endIcon={ <OpenInNewIcon sx={ { fontSize: 14 } } /> } href={ keysUrl } target="_blank" rel="noopener">
						Open Stripe keys
					</Button>
				</Box>

				{ /* Step 2 — paste keys (validated as you type). */ }
				<Stack spacing={ 1.5 }>
					<TextField
						label={ `${ mode === 'live' ? 'Live' : 'Test' } publishable key` }
						placeholder={ mode === 'live' ? 'pk_live_…' : 'pk_test_…' }
						value={ form[ pkKey ] }
						onChange={ ( e ) => set( { [ pkKey ]: e.target.value.trim() } ) }
						error={ pkBad }
						helperText={ pkBad ? `That doesn’t look like a ${ mode } publishable key (should start pk_${ mode }_).` : ' ' }
						InputProps={ pkOk ? { endAdornment: okTick } : undefined }
						fullWidth
					/>
					<TextField
						label={ `${ mode === 'live' ? 'Live' : 'Test' } secret key` }
						type="password"
						placeholder={ secretSet ? '•••••••••••• (saved — leave blank to keep)' : ( mode === 'live' ? 'sk_live_…' : 'sk_test_…' ) }
						value={ secret[ mode ] }
						onChange={ ( e ) => setSecret( ( s ) => ( { ...s, [ mode ]: e.target.value.trim() } ) ) }
						error={ skBad }
						fullWidth
						InputProps={ {
							startAdornment: <LockIcon sx={ { fontSize: 16, color: tokens.muted2, mr: 1 } } />,
							endAdornment: skOk ? okTick : undefined,
						} }
						helperText={
							skBad
								? 'That doesn’t look like a Stripe secret key (should start sk_ or rk_).'
								: secretSet
									? 'A secret key is stored securely and never shown again.'
									: 'Your secret key is stored on your site (encrypted) and never sent to us.'
						}
					/>
				</Stack>

				{ /* Step 3 — one click: save + test + auto-register webhook & wallets. */ }
				<Stack direction="row" alignItems="center" spacing={ 2 } sx={ { mt: 1.5 } }>
					<Button variant="contained" onClick={ connect } disabled={ ! canConnect } startIcon={ connecting ? <CircularProgress size={ 16 } color="inherit" /> : <CreditCardIcon /> }>
						{ 'saving' === connecting ? 'Saving keys…' : 'testing' === connecting ? 'Testing…' : 'webhook' === connecting ? 'Finishing…' : 'Connect Stripe' }
					</Button>
					<Button variant="text" onClick={ runTest } disabled={ testing || !! connecting }>
						{ testing ? 'Testing…' : 'Test connection' }
					</Button>
					<Box sx={ { flex: 1 } } />
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
						{ hook.ok && hook.wallets && hook.wallets.ok && (
							<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.green, mt: 0.5 } }>
								{ `✓ Apple Pay ${ hook.wallets.apple || 'registered' } · Google Pay ${ hook.wallets.google || 'registered' } on ${ hook.wallets.domain } — wallet buttons appear at checkout on supported devices.` }
							</Typography>
						) }
					</Box>
				) }
			</Card>

			<SmsCard />

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
							Message the DineKit team directly from your dashboard — free, no account needed.
							Replies land right here and in your inbox.
						</Typography>
					</Box>
					<Button
						variant="contained"
						href="#/support"
						sx={ { bgcolor: tokens.accent, '&:hover': { bgcolor: tokens.accentDark }, flexShrink: 0 } }
					>
						Get support
					</Button>
				</Stack>
			</Box>

			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 2, textAlign: 'center' } }>
				DineKit never phones home. Keys stay on your site; support messages and votes leave your
				site only when you press send.
			</Typography>
		</Page>
	);
}

// ---- SMS via the venue's own Twilio account (BYO — no middleman, no markup).
function SmsCard() {
	const [ cfg, setCfg ] = useState( null );
	const [ token, setToken ] = useState( '' ); // never echoed back; typed fresh
	const [ testTo, setTestTo ] = useState( '' );
	const [ msg, setMsg ] = useState( null ); // { ok, text }
	const [ busy, setBusy ] = useState( false );

	useEffect( () => {
		api.getSms().then( setCfg ).catch( () => setCfg( null ) );
	}, [] );
	if ( ! cfg ) {
		return null;
	}

	const save = async ( patch = {} ) => {
		setBusy( true );
		try {
			const body = { ...patch };
			if ( token.trim() ) {
				body.token = token.trim();
			}
			const next = await api.saveSms( body );
			setCfg( next );
			if ( body.token ) {
				setToken( '' );
			}
			setMsg( { ok: true, text: 'SMS settings saved.' } );
		} catch ( e ) {
			setMsg( { ok: false, text: e.message || 'Could not save.' } );
		} finally {
			setBusy( false );
		}
	};
	const sendTest = async () => {
		setBusy( true );
		setMsg( null );
		try {
			await save( {} ); // persist any pending edits first
			await api.testSms( testTo );
			setMsg( { ok: true, text: `Test text sent to ${ testTo } — check the phone. 🎉` } );
			api.getSms().then( setCfg ).catch( () => {} );
		} catch ( e ) {
			setMsg( { ok: false, text: e.message || 'Twilio refused the message.' } );
		} finally {
			setBusy( false );
		}
	};
	const field = ( label, key, props = {} ) => (
		<Box>
			<Typography sx={ { fontSize: 12, color: tokens.muted, mb: 0.5 } }>{ label }</Typography>
			<TextField size="small" value={ cfg[ key ] || '' } onChange={ ( e ) => setCfg( { ...cfg, [ key ]: e.target.value } ) } { ...props } />
		</Box>
	);
	const toggle = ( label, key, hint ) => (
		<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { py: 0.25 } }>
			<Switch checked={ !! cfg[ key ] } onChange={ ( e ) => { const v = e.target.checked; setCfg( { ...cfg, [ key ]: v } ); save( { [ key ]: v } ); } } />
			<Box>
				<Typography sx={ { fontSize: 13.5, fontWeight: 600, color: tokens.ink } }>{ label }</Typography>
				{ hint && <Typography sx={ { fontSize: 12, color: tokens.muted } }>{ hint }</Typography> }
			</Box>
		</Stack>
	);

	return (
		<Card sx={ { p: 2.5, mt: 2 } }>
			<Stack direction="row" alignItems="center" spacing={ 1.25 } sx={ { mb: 0.5 } }>
				<Typography sx={ { fontWeight: 700, fontSize: 16 } }>Text messages (SMS)</Typography>
				{ cfg.enabled && cfg.sid && cfg.tokenSet && cfg.from ? (
					<Chip icon={ <CheckCircleIcon sx={ { fontSize: 15 } } /> } label="Connected" size="small" sx={ { bgcolor: tokens.greenSoft, color: tokens.green, fontWeight: 700 } } />
				) : (
					<Chip label="Not set up" size="small" sx={ { bgcolor: tokens.soft, color: tokens.muted, fontWeight: 600 } } />
				) }
				{ cfg.sentMonth > 0 && (
					<Chip label={ `${ cfg.sentMonth } sent this month` } size="small" sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600 } } />
				) }
			</Stack>
			<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 2 } }>
				Booking confirmations, reminders, “your table is ready” and “order ready for collection” —
				sent through <strong>your own Twilio account</strong>, so you pay Twilio’s raw price
				(fractions of a penny per text) and DineKit never sees your messages.
			</Typography>

			{ /* Until it's connected, walk the owner to the exact spots in the
			     Twilio console — "get your keys" is not enough for someone who
			     has never seen it. */ }
			{ ! ( cfg.sid && cfg.tokenSet && cfg.from ) && (
				<Box sx={ { mb: 2, px: 1.75, py: 1.5, borderRadius: '10px', bgcolor: tokens.accentSoft, border: `1px solid ${ tokens.border }` } }>
					<Typography sx={ { fontSize: 12.5, fontWeight: 700, color: tokens.accentDark, mb: 0.75 } }>Where to find these (5 minutes, free):</Typography>
					<Box component="ol" sx={ { m: 0, pl: 2.5, fontSize: 12.5, color: tokens.ink2, '& li': { mb: 0.5, lineHeight: 1.5 } } }>
						<li>
							Create a free account at{ ' ' }
							<Link href="https://console.twilio.com" target="_blank" rel="noreferrer">console.twilio.com <OpenInNewIcon sx={ { fontSize: 12 } } /></Link>
							{ ' ' }(no card needed for the trial).
						</li>
						<li>
							Open{ ' ' }
							<Link href="https://console.twilio.com/us1/account/keys-credentials/api-keys" target="_blank" rel="noreferrer">API keys &amp; tokens <OpenInNewIcon sx={ { fontSize: 12 } } /></Link>
							{ ' ' }(that link goes straight there — it also lives under the <strong>Admin</strong> menu, top right → <strong>Account settings</strong>).
							The <strong>“Live credentials”</strong> box holds your <strong>Account SID</strong> (starts with “AC”) and <strong>Auth Token</strong> —
							press <strong>Show</strong>, copy both here. (Some accounts also show an “Account Info” box on the console homepage — same values.)
						</li>
						<li>
							Get your sending number: on a trial the homepage shows a <strong>“Get a phone number”</strong> button — one click.
							Otherwise it’s under <strong>Phone Numbers → Manage → Active numbers</strong>. Paste it here with the country code (+44…).
						</li>
						<li>
							<strong>Trial accounts</strong> can only text numbers you’ve verified
							(Phone Numbers → Manage → <strong>Verified Caller IDs</strong> — add your own mobile),
							and Twilio prefixes each text with “Sent from your Twilio trial account”. Upgrading removes both limits.
						</li>
						<li>Flip <strong>Enable SMS</strong> on and use <strong>Send a test text</strong> below — to your verified mobile.</li>
					</Box>
				</Box>
			) }

			<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mb: 1.5 } }>
				{ field( 'Account SID', 'sid', { placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', sx: { width: 330 }, onBlur: () => save( { sid: cfg.sid } ) } ) }
				<Box>
					<Typography sx={ { fontSize: 12, color: tokens.muted, mb: 0.5 } }>
						Auth token { cfg.tokenSet && <Box component="span" sx={ { color: tokens.green, fontWeight: 700 } }>· saved ✓</Box> }
					</Typography>
					<TextField size="small" type="password" value={ token } placeholder={ cfg.tokenSet ? '•••••••• (leave blank to keep)' : 'Paste your auth token' }
						onChange={ ( e ) => setToken( e.target.value ) } onBlur={ () => token.trim() && save( {} ) } sx={ { width: 260 } } />
				</Box>
				{ field( 'Your Twilio number', 'from', { placeholder: '+44 7911 123456', sx: { width: 180 }, onBlur: () => save( { from: cfg.from } ) } ) }
				{ field( 'Country dial code', 'cc', { placeholder: '44', sx: { width: 120 }, onBlur: () => save( { cc: cfg.cc } ),
					helperText: 'For local numbers (07… → +44…)' } ) }
			</Stack>

			{ toggle( 'Enable SMS', 'enabled', 'Master switch — nothing sends while this is off.' ) }
			{ toggle( 'Booking confirmation text', 'confirm', 'When a booking is confirmed (once per booking).' ) }
			<Stack direction="row" alignItems="center" spacing={ 1 }>
				{ toggle( 'Booking reminder text', 'remind', 'Sent automatically before the booking.' ) }
				<TextField size="small" type="number" value={ cfg.remind_hours } sx={ { width: 84 } }
					onChange={ ( e ) => setCfg( { ...cfg, remind_hours: Math.max( 1, Math.min( 48, parseInt( e.target.value, 10 ) || 1 ) ) } ) }
					onBlur={ () => save( { remind_hours: cfg.remind_hours } ) } />
				<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>hours before</Typography>
			</Stack>
			{ toggle( '“Your table is ready” button', 'waitlist', 'Shows on waitlisted/pending bookings with a phone number.' ) }
			{ toggle( '“Order ready for collection” text', 'order_ready', 'When the kitchen marks a collection order ready.' ) }

			<Divider sx={ { my: 1.5 } } />
			<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" useFlexGap>
				<TextField size="small" placeholder="Your mobile, e.g. 07700 900123" value={ testTo } onChange={ ( e ) => setTestTo( e.target.value ) } sx={ { width: 240 } } />
				<Button variant="outlined" disabled={ busy || ! testTo.trim() } onClick={ sendTest }>Send a test text</Button>
				{ busy && <CircularProgress size={ 16 } /> }
			</Stack>
			{ msg && (
				<Typography sx={ { fontSize: 13, fontWeight: 600, mt: 1, color: msg.ok ? tokens.green : tokens.red } }>
					{ msg.ok ? '✓ ' : '✗ ' }{ msg.text }
				</Typography>
			) }
			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
				On a Twilio <strong>trial</strong>: texts only reach numbers you’ve verified in the Twilio
				console (up to 5), every message is prefixed “Sent from your Twilio trial account”, and
				you have a small free credit. Upgrading removes all three limits. Messages are sent to
				Twilio only when a trigger fires — disclosed under “External services” in the readme.
			</Typography>
		</Card>
	);
}
