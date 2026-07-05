import React, { useEffect, useMemo, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Button,
	IconButton,
	TextField,
	MenuItem,
	Chip,
	Alert,
	LinearProgress,
	CircularProgress,
} from '../ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import { tokens } from '../theme';
import { api } from '../api/client';
import Card from './ui/Card';

const spanDays = ( from, to ) => {
	const a = Date.parse( from + 'T00:00:00' );
	const b = Date.parse( to + 'T00:00:00' );
	if ( isNaN( a ) || isNaN( b ) || b < a ) {
		return 0;
	}
	return Math.round( ( b - a ) / 86400000 ) + 1;
};

const STATUS = {
	pending: { label: 'Pending', bg: tokens.amberSoft, fg: tokens.amber },
	approved: { label: 'Approved', bg: tokens.greenSoft, fg: tokens.green },
	denied: { label: 'Denied', bg: tokens.redSoft, fg: tokens.red },
};

// Holiday requests + balances. UK-correct posture: allowance in days, approve/
// deny, balance = allowance − approved days taken this year. Irregular/zero-hours
// staff accrue at 12.07% of hours worked (noted for the owner).
export default function StaffHoliday( { staff } ) {
	const [ data, setData ] = useState( { requests: [], balances: {} } );
	const [ loading, setLoading ] = useState( true );
	const [ form, setForm ] = useState( null );

	const load = () => {
		setLoading( true );
		api.getLeave().then( ( d ) => setData( d || { requests: [], balances: {} } ) ).finally( () => setLoading( false ) );
	};
	useEffect( load, [] );

	const staffById = useMemo( () => Object.fromEntries( staff.map( ( m ) => [ m.id, m ] ) ), [ staff ] );
	const name = ( id ) => ( staffById[ id ] || {} ).name || 'Unknown';
	const active = staff.filter( ( m ) => m.active );

	const openForm = () => setForm( { staffId: active[ 0 ] ? active[ 0 ].id : '', from: '', to: '', days: 0, note: '' } );
	const setFormField = ( p ) => setForm( ( f ) => {
		const next = { ...f, ...p };
		if ( ( 'from' in p || 'to' in p ) && next.from && next.to ) {
			next.days = spanDays( next.from, next.to );
		}
		return next;
	} );
	const submit = async () => {
		if ( ! form.staffId || ! form.from || ! form.to ) {
			return;
		}
		await api.createLeave( { staffId: form.staffId, from: form.from, to: form.to, days: form.days, note: form.note } );
		setForm( null );
		load();
	};
	const setStatus = async ( id, status ) => {
		await api.updateLeave( id, { status } );
		load();
	};
	const remove = async ( id ) => {
		await api.deleteLeave( id );
		load();
	};

	if ( loading ) {
		return <Box sx={ { display: 'flex', justifyContent: 'center', py: 4 } }><CircularProgress size={ 22 } /></Box>;
	}

	return (
		<Box>
			<Alert severity="info" sx={ { mb: 2, '& .MuiAlert-message': { fontSize: 12.5 } } }>
				UK statutory minimum is 5.6 weeks (up to 28 days, incl. bank holidays). Irregular-hours / zero-hours
				staff accrue holiday at <strong>12.07% of hours worked</strong> — set their allowance accordingly on
				their profile. DineKit tracks the days; run the money side through your payroll.
			</Alert>

			{ /* Balances */ }
			<Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5, mb: 3 } }>
				{ active.map( ( m ) => {
					const bal = data.balances[ m.id ] || { allowance: m.holiday, taken: 0, remaining: m.holiday };
					const pct = bal.allowance > 0 ? Math.min( 100, ( bal.taken / bal.allowance ) * 100 ) : 0;
					return (
						<Card key={ m.id } sx={ { p: 1.75 } }>
							<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1 } }>
								<Box sx={ { width: 10, height: 10, borderRadius: '50%', bgcolor: m.color } } />
								<Typography sx={ { fontWeight: 650, fontSize: 14, flex: 1 } } noWrap>{ m.name || 'Unnamed' }</Typography>
								<Typography sx={ { fontSize: 13, fontWeight: 700, color: bal.remaining < 0 ? tokens.red : tokens.ink } }>
									{ bal.remaining } left
								</Typography>
							</Stack>
							<LinearProgress variant="determinate" value={ pct } sx={ { height: 6, borderRadius: 3, bgcolor: tokens.soft, '& .MuiLinearProgress-bar': { bgcolor: pct >= 100 ? tokens.red : tokens.accent } } } />
							<Typography sx={ { fontSize: 11.5, color: tokens.muted, mt: 0.5 } }>{ bal.taken } of { bal.allowance } days taken</Typography>
						</Card>
					);
				} ) }
			</Box>

			<Stack direction="row" alignItems="center" sx={ { mb: 1.5 } }>
				<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, flex: 1 } }>Requests</Typography>
				<Button size="small" startIcon={ <AddIcon /> } onClick={ openForm }>Request leave</Button>
			</Stack>

			{ form && (
				<Card sx={ { p: 2, mb: 2 } }>
					<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap alignItems="flex-end">
						<TextField select size="small" label="Team member" value={ form.staffId } onChange={ ( e ) => setFormField( { staffId: e.target.value } ) } sx={ { minWidth: 180 } }>
							{ active.map( ( m ) => <MenuItem key={ m.id } value={ m.id }>{ m.name || 'Unnamed' }</MenuItem> ) }
						</TextField>
						<TextField size="small" type="date" label="From" InputLabelProps={ { shrink: true } } value={ form.from } onChange={ ( e ) => setFormField( { from: e.target.value } ) } sx={ { width: 160 } } />
						<TextField size="small" type="date" label="To" InputLabelProps={ { shrink: true } } value={ form.to } onChange={ ( e ) => setFormField( { to: e.target.value } ) } sx={ { width: 160 } } />
						<TextField size="small" type="number" label="Days" value={ form.days } onChange={ ( e ) => setFormField( { days: Math.max( 0, parseFloat( e.target.value ) || 0 ) } ) } sx={ { width: 90 } } inputProps={ { step: 0.5 } } />
						<TextField size="small" label="Note" value={ form.note } onChange={ ( e ) => setFormField( { note: e.target.value } ) } sx={ { flex: 1, minWidth: 160 } } />
						<Button variant="contained" onClick={ submit }>Add</Button>
						<Button onClick={ () => setForm( null ) } sx={ { color: tokens.muted } }>Cancel</Button>
					</Stack>
				</Card>
			) }

			{ data.requests.length === 0 ? (
				<Typography sx={ { fontSize: 14, color: tokens.muted, py: 2, textAlign: 'center' } }>No leave requested yet.</Typography>
			) : (
				<Stack spacing={ 1 }>
					{ data.requests.map( ( r ) => {
						const st = STATUS[ r.status ] || STATUS.pending;
						return (
							<Stack key={ r.id } direction="row" alignItems="center" spacing={ 1.5 } sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '10px', px: 1.75, py: 1.25 } }>
								<Box sx={ { flex: 1, minWidth: 0 } }>
									<Typography sx={ { fontWeight: 650, fontSize: 14 } } noWrap>{ name( r.staffId ) }</Typography>
									<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>
										{ r.from } → { r.to } · { r.days } day{ r.days === 1 ? '' : 's' }{ r.note ? ` · ${ r.note }` : '' }
									</Typography>
								</Box>
								<Chip label={ st.label } size="small" sx={ { bgcolor: st.bg, color: st.fg, fontWeight: 600 } } />
								{ r.status === 'pending' && (
									<>
										<IconButton size="small" onClick={ () => setStatus( r.id, 'approved' ) } sx={ { color: tokens.green } }><CheckIcon fontSize="small" /></IconButton>
										<IconButton size="small" onClick={ () => setStatus( r.id, 'denied' ) } sx={ { color: tokens.red } }><BlockIcon fontSize="small" /></IconButton>
									</>
								) }
								<IconButton size="small" onClick={ () => remove( r.id ) } sx={ { color: tokens.muted2 } }><DeleteOutlineIcon fontSize="small" /></IconButton>
							</Stack>
						);
					} ) }
				</Stack>
			) }
		</Box>
	);
}
