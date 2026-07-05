import React, { useEffect, useState } from 'react';
import { Box, Stack, Typography, TextField, CircularProgress } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { tokens } from '../theme';
import { api } from '../api/client';
import Card from './ui/Card';

const pad = ( n ) => ( n < 10 ? '0' : '' ) + n;
const todayIso = () => {
	const d = new Date();
	return d.getFullYear() + '-' + pad( d.getMonth() + 1 ) + '-' + pad( d.getDate() );
};

function Tile( { label, value, sub, tint } ) {
	return (
		<Card sx={ { p: 2 } }>
			<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 0.5 } }>{ label }</Typography>
			<Typography sx={ { fontSize: 26, fontWeight: 750, color: tint || tokens.ink, lineHeight: 1.1 } }>{ value }</Typography>
			{ sub && <Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.25 } }>{ sub }</Typography> }
		</Card>
	);
}

// "Are we staffed?" — covers vs capacity and staff-on vs the staff those covers
// imply, computed from DineKit's own bookings, floor, turn time and rota.
export default function StaffDashboard() {
	const [ date, setDate ] = useState( todayIso );
	const [ ops, setOps ] = useState( null );
	const [ cfg, setCfg ] = useState( null );

	useEffect( () => {
		api.getStaffSettings().then( setCfg );
	}, [] );
	useEffect( () => {
		setOps( null );
		api.getStaffOps( date ).then( setOps );
	}, [ date ] );

	const saveCfg = ( p ) => {
		const next = { ...cfg, ...p };
		setCfg( next );
		api.saveStaffSettings( next ).then( () => api.getStaffOps( date ).then( setOps ) );
	};

	const under = ops && ops.overUnderPct < -5;
	const over = ops && ops.overUnderPct > 15;
	const statusTint = under ? tokens.red : over ? tokens.amber : tokens.green;
	const summary = ops
		? ( ops.required === 0
			? `No covers booked for this day yet — ${ ops.staffOn } staff scheduled.`
			: under
				? `Understaffed by ~${ Math.abs( ops.overUnderPct ) }% — ${ ops.serversOn } front-of-house on, ~${ ops.required } needed for ${ ops.covers } covers.`
				: over
					? `Overstaffed by ~${ ops.overUnderPct }% — ${ ops.serversOn } on vs ~${ ops.required } needed. Room to trim labour.`
					: `Well matched — ${ ops.serversOn } front-of-house on for ${ ops.covers } covers (~${ ops.required } needed).` )
		: '';

	return (
		<Box>
			<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 2 } }>
				<TextField type="date" size="small" value={ date } onChange={ ( e ) => setDate( e.target.value || todayIso() ) } sx={ { width: 170 } } />
				<Box sx={ { flex: 1 } } />
				{ ! ops && <CircularProgress size={ 18 } /> }
			</Stack>

			{ ops && (
				<>
					<Box sx={ { mb: 2, p: 2, borderRadius: '12px', bgcolor: `${ statusTint }14`, border: `1px solid ${ statusTint }33` } }>
						<Typography sx={ { fontWeight: 700, fontSize: 15, color: statusTint } }>{ summary }</Typography>
					</Box>

					{ ops.clashCount > 0 && (
						<Box sx={ { mb: 2, p: 2, borderRadius: '12px', bgcolor: `${ tokens.amber }14`, border: `1px solid ${ tokens.amber }55` } }>
							<Typography sx={ { fontWeight: 750, fontSize: 14, color: tokens.amber, mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 } }>
								<WarningAmberIcon sx={ { fontSize: 18 } } />
								{ ops.clashCount } potential holiday { ops.clashCount === 1 ? 'clash' : 'clashes' } — needs attention
							</Typography>
							<Stack spacing={ 0.5 }>
								{ ops.clashes.map( ( c, i ) => (
									<Typography key={ i } sx={ { fontSize: 13, color: tokens.ink2, lineHeight: 1.45 } }>
										<strong>{ c.name }</strong> ({ c.role }) is on the rota { c.start }–{ c.end } but on approved holiday
										{ c.from !== c.to ? ` (${ c.from } → ${ c.to })` : '' }. Left as-is you’ll pay both the holiday and the shift — remove the shift, or move the holiday.
									</Typography>
								) ) }
							</Stack>
						</Box>
					) }

					<Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 } }>
						<Tile label="Covers booked" value={ ops.covers } sub={ `of ~${ ops.theoretical } seats-capacity` } />
						<Tile label="Capacity used" value={ `${ ops.capacityPct }%` } sub={ `${ ops.seats } seats · ${ ops.serviceHours }h · ${ ops.turnTime }m turns` } tint={ ops.capacityPct > 90 ? tokens.amber : tokens.ink } />
						<Tile label="Front-of-house on" value={ `${ ops.serversOn }/${ ops.required || 0 }` } sub="scheduled / needed" tint={ statusTint } />
						<Tile label="Labour today" value={ `£${ ops.labourCost.toFixed( 2 ) }` } sub={ `${ ops.staffOn } staff scheduled` } />
					</Box>
				</>
			) }

			{ cfg && (
				<Card sx={ { p: 2.5 } }>
					<Typography sx={ { fontWeight: 650, fontSize: 15, color: tokens.ink, mb: 0.25 } }>Labour rules</Typography>
					<Typography sx={ { fontSize: 12.5, color: tokens.muted, mb: 1.5 } }>Tune these to your venue — they drive the numbers above.</Typography>
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap>
						<TextField
							label="Covers per server"
							type="number"
							size="small"
							value={ cfg.covers_per_server }
							onChange={ ( e ) => saveCfg( { covers_per_server: Math.max( 1, parseInt( e.target.value, 10 ) || 1 ) } ) }
							helperText="Fine dining ~14 · casual ~20 · fast ~35"
							sx={ { width: 170 } }
						/>
						<TextField
							label="Seat utilisation %"
							type="number"
							size="small"
							value={ cfg.utilisation }
							onChange={ ( e ) => saveCfg( { utilisation: Math.max( 10, Math.min( 100, parseInt( e.target.value, 10 ) || 10 ) ) } ) }
							helperText="Realistic fill per turn (~65–85%)"
							sx={ { width: 170 } }
						/>
						<TextField
							label="Target labour %"
							type="number"
							size="small"
							value={ cfg.target_labour_pct }
							onChange={ ( e ) => saveCfg( { target_labour_pct: Math.max( 1, Math.min( 90, parseInt( e.target.value, 10 ) || 1 ) ) } ) }
							helperText="Of sales (casual ~25–30%)"
							sx={ { width: 170 } }
						/>
					</Stack>
				</Card>
			) }
		</Box>
	);
}
