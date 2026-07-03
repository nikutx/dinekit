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

const REPO = 'https://github.com/nikutx/dinekit';
const SUPPORT_URL = 'https://weblevelup.co.uk/dinekit';

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

	const save = () => {
		setSaveState( 'saving' );
		const payload = {
			stripe: {
				enabled: form.enabled,
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

	return (
		<Box sx={ { maxWidth: 780, mx: 'auto' } }>
			<Typography variant="h5">Integrations</Typography>
			<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5, mb: 3 } }>
				Connect the tools you already use. You bring your own accounts and keys — DineKit takes
				no cut and never sits between you and your money.
			</Typography>

			{ /* Stripe */ }
			<Box sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2.5 } }>
				<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 0.5 } }>
					<CreditCardIcon sx={ { color: tokens.accent } } />
					<Box sx={ { flex: 1 } }>
						<Typography sx={ { fontWeight: 800, color: tokens.ink } }>Stripe</Typography>
						<Typography sx={ { fontSize: 13, color: tokens.muted } }>
							Take booking deposits & event prepayments — straight into your own Stripe account,
							0% commission.
						</Typography>
					</Box>
					<Chip
						label="You keep 100%"
						size="small"
						sx={ { bgcolor: tokens.greenSoft, color: tokens.green, fontWeight: 700 } }
					/>
				</Stack>

				<Divider sx={ { my: 2 } } />

				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<Switch checked={ form.enabled } onChange={ ( e ) => set( { enabled: e.target.checked } ) } />
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
			</Box>

			{ /* Coming soon: accounting & CRM */ }
			<Typography variant="subtitle2" sx={ { color: tokens.ink2, mt: 4, mb: 1.5 } }>
				Accounting &amp; CRM
				<Typography component="span" sx={ { color: tokens.muted2, fontWeight: 600, ml: 1 } }>
					on the roadmap — tell us which to build first
				</Typography>
			</Typography>
			<Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 } }>
				{ SOON.map( ( item ) => (
					<Box
						key={ item.key }
						sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2 } }
					>
						<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 0.5 } }>
							<ReceiptLongIcon sx={ { color: tokens.muted2, fontSize: 20 } } />
							<Typography sx={ { fontWeight: 700, color: tokens.ink, flex: 1 } }>{ item.name }</Typography>
							<Chip label="Coming soon" size="small" sx={ { bgcolor: tokens.soft, color: tokens.muted, fontWeight: 700 } } />
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
					</Box>
				) ) }
			</Box>

			{ /* Support */ }
			<Box sx={ { bgcolor: tokens.ink, color: '#fff', borderRadius: 3, p: 2.5, mt: 4 } }>
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
		</Box>
	);
}
