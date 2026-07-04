import React, { useEffect, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	Switch,
	Tooltip,
	Chip,
	CircularProgress,
	Alert,
} from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

// Reviews & retention settings. The compliant flow (ask everyone the same way,
// same public link for all, private feedback in parallel) is fixed by design —
// this screen only tunes destinations, messaging and the win-back offer.
export default function ReviewsView() {
	const [ cfg, setCfg ] = useState( null );
	const [ feedback, setFeedback ] = useState( [] );
	const [ saveState, setSaveState ] = useState( 'idle' );
	const debounce = useRef( null );

	useEffect( () => {
		api.getReviews().then( setCfg );
		api.getFeedback().then( ( f ) => setFeedback( f || [] ) ).catch( () => {} );
	}, [] );

	const patch = ( p ) => {
		const next = { ...cfg, ...p };
		setCfg( next );
		clearTimeout( debounce.current );
		setSaveState( 'saving' );
		debounce.current = setTimeout( () => {
			api.saveReviews( next ).then( () => setSaveState( 'saved' ) ).catch( () => setSaveState( 'error' ) );
		}, 500 );
	};

	if ( ! cfg ) {
		return (
			<Page>
				<Box sx={ { display: 'flex', justifyContent: 'center', py: 6 } }><CircularProgress size={ 24 } /></Box>
			</Page>
		);
	}

	const section = ( title, sub ) => (
		<Box sx={ { mb: 2 } }>
			<Typography sx={ { fontWeight: 650, fontSize: 15, color: tokens.ink } }>{ title }</Typography>
			{ sub && <Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 0.25 } }>{ sub }</Typography> }
		</Box>
	);

	const onOff = ( label, key, tip ) => (
		<Stack direction="row" alignItems="center" spacing={ 1 }>
			<Switch checked={ !! cfg[ key ] } onChange={ ( e ) => patch( { [ key ]: e.target.checked } ) } />
			{ tip ? (
				<Tooltip title={ tip }><Typography sx={ { fontSize: 14, fontWeight: 600 } }>{ label }</Typography></Tooltip>
			) : (
				<Typography sx={ { fontSize: 14, fontWeight: 600 } }>{ label }</Typography>
			) }
		</Stack>
	);

	return (
		<Page>
			<PageHeader
				title="Reviews & retention"
				subtitle="Turn happy visits into public reviews and repeat bookings — the honest, compliant way."
				actions={
					<Typography sx={ { fontSize: 12, color: saveState === 'error' ? tokens.red : tokens.muted } }>
						{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }
					</Typography>
				}
			/>

			<Alert severity="info" icon={ <StarBorderIcon /> } sx={ { mb: 2, '& .MuiAlert-message': { fontSize: 13 } } }>
				<strong>How this works (and stays legal).</strong> Every diner gets the <em>same</em> message with the
				<em> same</em> public-review link, plus a private feedback form. DineKit never sends only happy guests to
				Google or hides unhappy ones — that “review gating” is unlawful in the UK (DMCC/CMA), against Google’s
				policy and the US FTC rule. Poor private feedback simply alerts you to put it right; incentives are only
				ever for a return visit, never for a positive review.
			</Alert>

			<Stack spacing={ 2 }>
				{ feedback.length > 0 && (
					<Card sx={ { p: 2.5 } }>
						{ section( 'Recent feedback', 'Private ratings diners have left. Low ones also email you an alert.' ) }
						<Stack spacing={ 1 }>
							{ feedback.slice( 0, 12 ).map( ( f ) => {
								const low = f.rating <= ( cfg.low_threshold || 3 );
								return (
									<Stack key={ f.id } direction="row" alignItems="center" spacing={ 1.5 } sx={ { bgcolor: tokens.soft, borderRadius: 2, p: 1.25 } }>
										<Box sx={ { width: 96, flexShrink: 0 } }>
											<Typography sx={ { fontSize: 15, color: low ? tokens.red : '#f59e0b', letterSpacing: '1px' } }>
												{ '★★★★★'.slice( 0, f.rating ) }<span style={ { color: tokens.border2 } }>{ '★★★★★'.slice( f.rating ) }</span>
											</Typography>
										</Box>
										<Box sx={ { flex: 1, minWidth: 0 } }>
											<Typography sx={ { fontWeight: 650, fontSize: 13.5, color: tokens.ink } } noWrap>
												{ f.name || 'Guest' }{ f.date ? ` · ${ f.date }` : '' }
											</Typography>
											{ f.comment && <Typography sx={ { fontSize: 13, color: tokens.muted } }>{ f.comment }</Typography> }
										</Box>
										{ low && <Chip label="Needs follow-up" size="small" sx={ { bgcolor: tokens.redSoft, color: tokens.red, fontWeight: 600 } } /> }
									</Stack>
								);
							} ) }
						</Stack>
					</Card>
				) }

				<Card sx={ { p: 2.5 } }>
					{ section( 'Post-visit review request', 'Ask for feedback a few hours after the visit.' ) }
					<Stack direction="row" spacing={ 3 } flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
						{ onOff( 'Send review requests', 'enabled' ) }
						{ onOff( 'Remind them what they ordered', 'jog_memory', 'Includes the dish(es) from their booking/order so feedback is specific.' ) }
					</Stack>
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
						<TextField
							label="Send after (hours)"
							type="number"
							size="small"
							value={ cfg.delay_hours }
							onChange={ ( e ) => patch( { delay_hours: Math.max( 0, Math.min( 168, parseInt( e.target.value, 10 ) || 0 ) ) } ) }
							helperText="A single meal is quick to judge — 2–3h works well"
							sx={ { width: 170 } }
						/>
					</Stack>
					<TextField
						label="Message to diners"
						size="small"
						fullWidth
						multiline
						minRows={ 2 }
						value={ cfg.message }
						onChange={ ( e ) => patch( { message: e.target.value } ) }
						sx={ { mt: 1.5, maxWidth: 560 } }
					/>
				</Card>

				<Card sx={ { p: 2.5 } }>
					{ section( 'Public review destinations', 'Shown to everyone alongside the private feedback form.' ) }
					<Stack spacing={ 1.5 } sx={ { maxWidth: 560 } }>
						<TextField
							label="Google review link"
							size="small"
							fullWidth
							placeholder="https://g.page/r/…/review"
							value={ cfg.google_url }
							onChange={ ( e ) => patch( { google_url: e.target.value } ) }
							helperText="Your Google Business “write a review” link"
						/>
						<TextField
							label="TripAdvisor link (optional)"
							size="small"
							fullWidth
							placeholder="https://www.tripadvisor.co.uk/…"
							value={ cfg.tripadvisor_url }
							onChange={ ( e ) => patch( { tripadvisor_url: e.target.value } ) }
						/>
					</Stack>
				</Card>

				<Card sx={ { p: 2.5 } }>
					{ section( 'Recover unhappy visits', 'Catch problems privately and win the guest back.' ) }
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
						<TextField
							label="Alert me at or below"
							type="number"
							size="small"
							value={ cfg.low_threshold }
							onChange={ ( e ) => patch( { low_threshold: Math.max( 1, Math.min( 5, parseInt( e.target.value, 10 ) || 1 ) ) } ) }
							helperText="Stars (1–5) that trigger a manager alert"
							sx={ { width: 170 } }
						/>
						<TextField
							label="Alert email"
							type="email"
							size="small"
							placeholder="Defaults to site admin"
							value={ cfg.notify_email }
							onChange={ ( e ) => patch( { notify_email: e.target.value } ) }
							sx={ { width: 260 } }
						/>
					</Stack>
					<TextField
						label="Win-back offer (optional)"
						size="small"
						fullWidth
						value={ cfg.offer }
						onChange={ ( e ) => patch( { offer: e.target.value } ) }
						placeholder="e.g. A free dessert on your next visit"
						helperText="Offered for a RETURN VISIT only — never in exchange for a public review"
						sx={ { mt: 1.5, maxWidth: 560 } }
					/>
				</Card>

				<Card sx={ { p: 2.5 } }>
					{ section( 'Consent & unsubscribe (UK GDPR / PECR)', 'Review requests count as marketing — send only with consent or a valid soft opt-in.' ) }
					<TextField
						label="Consent note"
						size="small"
						fullWidth
						multiline
						minRows={ 2 }
						value={ cfg.consent_note }
						onChange={ ( e ) => patch( { consent_note: e.target.value } ) }
						helperText="Shown where diners give their details; every message also carries an unsubscribe link"
						sx={ { maxWidth: 560 } }
					/>
				</Card>
			</Stack>
		</Page>
	);
}
