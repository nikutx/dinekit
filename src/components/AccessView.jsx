import React, { useEffect, useState } from 'react';
import { Box, Typography, Checkbox, CircularProgress } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

// Role → permission matrix. The site owner (WP admin) always has everything, so
// their row is shown locked-on for clarity and can't be edited here.
export default function AccessView() {
	const [ data, setData ] = useState( null );

	useEffect( () => {
		api.getAccess().then( setData );
	}, [] );

	if ( ! data ) {
		return (
			<Page>
				<PageHeader title="Access Control" />
				<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }><CircularProgress /></Box>
			</Page>
		);
	}

	const permKeys = Object.keys( data.permissions );
	const has = ( roleKey, perm ) => ( data.matrix[ roleKey ] || [] ).includes( perm );

	const toggle = ( roleKey, perm ) => {
		const cur = data.matrix[ roleKey ] || [];
		const next = cur.includes( perm ) ? cur.filter( ( p ) => p !== perm ) : cur.concat( perm );
		const matrix = { ...data.matrix, [ roleKey ]: next };
		setData( { ...data, matrix } );
		api.saveAccess( matrix );
	};

	const th = { p: '12px 10px', fontSize: 12, fontWeight: 700, color: tokens.muted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${ tokens.border }`, whiteSpace: 'nowrap' };
	const td = { p: '4px 10px', borderBottom: `1px solid ${ tokens.soft }`, textAlign: 'center' };

	return (
		<Page>
			<PageHeader
				title="Access Control"
				subtitle="Choose what each staff role can do. The owner (site admin) always has full access."
			/>
			<Card sx={ { p: 0, overflowX: 'auto' } }>
				<Box component="table" sx={ { width: '100%', borderCollapse: 'collapse', minWidth: 720 } }>
					<Box component="thead">
						<Box component="tr">
							<Box component="th" sx={ { ...th, textAlign: 'left' } }>Role</Box>
							{ permKeys.map( ( pk ) => (
								<Box component="th" key={ pk } sx={ { ...th, textAlign: 'center' } }>{ data.permissions[ pk ] }</Box>
							) ) }
						</Box>
					</Box>
					<Box component="tbody">
						<Box component="tr" sx={ { bgcolor: tokens.accentSoft } }>
							<Box component="td" sx={ { ...td, textAlign: 'left' } }>
								<Box sx={ { display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 700, fontSize: 14 } }>
									<LockIcon sx={ { fontSize: 16, color: tokens.accent } } /> Owner (site admin)
								</Box>
							</Box>
							{ permKeys.map( ( pk ) => (
								<Box component="td" key={ pk } sx={ td }><Checkbox checked disabled size="small" /></Box>
							) ) }
						</Box>
						{ data.roles.map( ( r ) => (
							<Box component="tr" key={ r.key }>
								<Box component="td" sx={ { ...td, textAlign: 'left', fontWeight: 600, fontSize: 14 } }>{ r.label }</Box>
								{ permKeys.map( ( pk ) => (
									<Box component="td" key={ pk } sx={ td }>
										<Checkbox
											size="small"
											checked={ has( r.key, pk ) }
											onChange={ () => toggle( r.key, pk ) }
											inputProps={ { 'aria-label': `${ r.label }: ${ data.permissions[ pk ] }` } }
										/>
									</Box>
								) ) }
							</Box>
						) ) }
					</Box>
				</Box>
			</Card>
			<Typography sx={ { fontSize: 13, color: tokens.muted, mt: 2, maxWidth: 720 } }>
				Refunding or voiding paid orders and deposits is controlled by <strong>Issue refunds / void paid</strong> — keep it to trusted roles. These permissions take effect for a staff member once you give them a login from the Staff screen. Changes save automatically.
			</Typography>
		</Page>
	);
}
