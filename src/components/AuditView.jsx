import React, { useEffect, useState } from 'react';
import { Box, Stack, Typography, Chip, CircularProgress } from '../ui';
import HistoryIcon from '@mui/icons-material/History';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';

// Category → tint for the activity chips (categorical, not status).
const TINT = {
	refund: { fg: tokens.red, bg: tokens.redSoft },
	order: { fg: tokens.accent, bg: tokens.accentSoft },
	booking: { fg: tokens.sky, bg: tokens.skySoft },
	payments: { fg: tokens.green, bg: tokens.greenSoft },
	access: { fg: tokens.amber, bg: tokens.amberSoft },
	login: { fg: tokens.muted, bg: tokens.soft },
};

function when( iso ) {
	try {
		const d = new Date( iso );
		return d.toLocaleString( undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } );
	} catch ( e ) {
		return iso;
	}
}

export default function AuditView() {
	const [ data, setData ] = useState( null );
	const [ filter, setFilter ] = useState( '' );
	const [ loading, setLoading ] = useState( true );

	useEffect( () => {
		setLoading( true );
		api.getActivity( filter ).then( setData ).finally( () => setLoading( false ) );
	}, [ filter ] );

	const cats = ( data && data.categories ) || {};
	const entries = ( data && data.entries ) || [];

	return (
		<Page>
			<PageHeader
				title="Activity"
				subtitle="A trail of sensitive actions — refunds, cancellations, payment setup, permission changes and sign-ins — so you can always see who did what, and when."
			/>

			<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap sx={ { mb: 2 } }>
				<Chip
					label="All"
					onClick={ () => setFilter( '' ) }
					sx={ { fontWeight: 600, bgcolor: '' === filter ? tokens.accent : tokens.soft, color: '' === filter ? '#fff' : tokens.ink } }
				/>
				{ Object.keys( cats ).map( ( key ) => (
					<Chip
						key={ key }
						label={ cats[ key ] }
						onClick={ () => setFilter( key ) }
						sx={ { fontWeight: 600, bgcolor: filter === key ? tokens.accent : tokens.soft, color: filter === key ? '#fff' : tokens.ink } }
					/>
				) ) }
			</Stack>

			{ loading ? (
				<Box sx={ { display: 'flex', justifyContent: 'center', mt: 6 } }><CircularProgress /></Box>
			) : entries.length === 0 ? (
				<EmptyState icon={ <HistoryIcon /> } title="Nothing logged yet" description="Refunds, cancellations and setup changes will appear here as they happen." />
			) : (
				<Card sx={ { p: 0 } }>
					<Stack divider={ <Box sx={ { borderBottom: `1px solid ${ tokens.soft }` } } /> }>
						{ entries.map( ( e ) => {
							const tint = TINT[ e.action ] || TINT.login;
							return (
								<Stack key={ e.id } direction="row" alignItems="center" spacing={ 1.5 } sx={ { p: 1.5 } }>
									<Chip label={ ( cats[ e.action ] || e.action ) } size="small" sx={ { bgcolor: tint.bg, color: tint.fg, fontWeight: 600, flexShrink: 0 } } />
									<Box sx={ { flex: 1, minWidth: 0 } }>
										<Typography sx={ { fontSize: 14, fontWeight: 600, color: tokens.ink } } noWrap>{ e.label }</Typography>
										{ e.details && <Typography sx={ { fontSize: 12.5, color: tokens.muted } } noWrap>{ e.details }</Typography> }
									</Box>
									<Box sx={ { textAlign: 'right', flexShrink: 0 } }>
										<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink2 } }>{ e.actor || '—' }</Typography>
										<Typography sx={ { fontSize: 12, color: tokens.muted2, fontVariantNumeric: 'tabular-nums' } }>{ when( e.time ) }</Typography>
									</Box>
								</Stack>
							);
						} ) }
					</Stack>
				</Card>
			) }
		</Page>
	);
}
