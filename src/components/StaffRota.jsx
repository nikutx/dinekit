import React, { useEffect, useMemo, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	IconButton,
	Button,
	TextField,
	MenuItem,
	Drawer,
	Chip,
	CircularProgress,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { tokens } from '../theme';
import { api } from '../api/client';

const pad = ( n ) => ( n < 10 ? '0' : '' ) + n;
const isoOf = ( d ) => d.getFullYear() + '-' + pad( d.getMonth() + 1 ) + '-' + pad( d.getDate() );
const DAYNAMES = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];

function mondayOf( d ) {
	const dow = ( d.getDay() + 6 ) % 7; // 0 = Monday.
	const m = new Date( d );
	m.setDate( d.getDate() - dow );
	m.setHours( 0, 0, 0, 0 );
	return m;
}
function addDays( d, n ) {
	const x = new Date( d );
	x.setDate( x.getDate() + n );
	return x;
}
const money = ( n ) => '£' + Number( n || 0 ).toFixed( 2 );

// Weekly rota grid — staff down the side, the week across the top; each cell
// holds that person's shifts for the day, with a running hours + labour cost.
export default function StaffRota( { staff, roles } ) {
	const [ weekStart, setWeekStart ] = useState( () => mondayOf( new Date() ) );
	const [ shifts, setShifts ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ editing, setEditing ] = useState( null );

	const days = useMemo( () => Array.from( { length: 7 }, ( _, i ) => addDays( weekStart, i ) ), [ weekStart ] );
	const from = isoOf( days[ 0 ] );
	const to = isoOf( days[ 6 ] );

	const load = () => {
		setLoading( true );
		api.getShifts( { from, to } ).then( ( rows ) => setShifts( rows || [] ) ).finally( () => setLoading( false ) );
	};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect( load, [ from, to ] );

	const roleLabel = ( key ) => ( roles.find( ( r ) => r.key === key ) || {} ).label || key;
	const active = staff.filter( ( m ) => m.active );
	const cellShifts = ( staffId, date ) => shifts.filter( ( s ) => s.staffId === staffId && s.date === date );

	const totalHours = shifts.reduce( ( s, sh ) => s + ( sh.hours || 0 ), 0 );
	const totalCost = shifts.reduce( ( s, sh ) => s + ( sh.cost || 0 ), 0 );

	const openNew = ( m, date ) => setEditing( { staffId: m.id, staffName: m.name, date, start: '17:00', end: '23:00', role: m.role, note: '' } );
	const openEdit = ( sh ) => {
		const m = staff.find( ( x ) => x.id === sh.staffId );
		setEditing( { ...sh, staffName: m ? m.name : '' } );
	};
	const saveShift = async () => {
		const body = { staffId: editing.staffId, date: editing.date, start: editing.start, end: editing.end, role: editing.role, note: editing.note };
		if ( editing.id ) {
			await api.updateShift( editing.id, body );
		} else {
			await api.createShift( body );
		}
		setEditing( null );
		load();
	};
	const deleteShift = async () => {
		if ( editing.id ) {
			await api.deleteShift( editing.id );
		}
		setEditing( null );
		load();
	};

	if ( ! active.length ) {
		return <Typography sx={ { fontSize: 14, color: tokens.muted, py: 3, textAlign: 'center' } }>Add active team members to build a rota.</Typography>;
	}

	const NAME_W = 150;

	return (
		<Box>
			{ /* Week navigator */ }
			<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1.5 } }>
				<IconButton size="small" onClick={ () => setWeekStart( ( w ) => addDays( w, -7 ) ) } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } }><ChevronLeftIcon fontSize="small" /></IconButton>
				<Button size="small" variant="outlined" onClick={ () => setWeekStart( mondayOf( new Date() ) ) }>This week</Button>
				<IconButton size="small" onClick={ () => setWeekStart( ( w ) => addDays( w, 7 ) ) } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } }><ChevronRightIcon fontSize="small" /></IconButton>
				<Typography sx={ { fontWeight: 650, fontSize: 14, color: tokens.ink, ml: 1 } }>
					Week of { days[ 0 ].toLocaleDateString( undefined, { day: 'numeric', month: 'short' } ) }
				</Typography>
				<Box sx={ { flex: 1 } } />
				{ loading && <CircularProgress size={ 16 } /> }
				<Chip label={ `${ totalHours.toFixed( 1 ) } h` } size="small" sx={ { bgcolor: tokens.soft, fontWeight: 600 } } />
				<Chip label={ `${ money( totalCost ) } labour` } size="small" sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600 } } />
			</Stack>

			<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', overflowX: 'auto', bgcolor: tokens.surface } }>
				<Box sx={ { minWidth: 760 } }>
					{ /* Header */ }
					<Stack direction="row" sx={ { bgcolor: tokens.soft, borderBottom: `1px solid ${ tokens.border }` } }>
						<Box sx={ { width: NAME_W, flexShrink: 0, px: 1.5, py: 1, borderRight: `1px solid ${ tokens.border }` } }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted } }>Team</Typography>
						</Box>
						{ days.map( ( d, i ) => (
							<Box key={ i } sx={ { flex: 1, px: 1, py: 1, textAlign: 'center', borderLeft: i ? `1px solid ${ tokens.border }` : 'none' } }>
								<Typography sx={ { fontSize: 11.5, fontWeight: 700, color: tokens.ink } }>{ DAYNAMES[ i ] }</Typography>
								<Typography sx={ { fontSize: 11, color: tokens.muted } }>{ d.getDate() }</Typography>
							</Box>
						) ) }
					</Stack>

					{ /* Staff rows */ }
					{ active.map( ( m ) => (
						<Stack key={ m.id } direction="row" sx={ { borderTop: `1px solid ${ tokens.border }`, minHeight: 54 } }>
							<Box sx={ { width: NAME_W, flexShrink: 0, px: 1.5, py: 1, borderRight: `1px solid ${ tokens.border }`, display: 'flex', alignItems: 'center', gap: 0.75 } }>
								<Box sx={ { width: 10, height: 10, borderRadius: '50%', bgcolor: m.color, flexShrink: 0 } } />
								<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>{ m.name || 'Unnamed' }</Typography>
							</Box>
							{ days.map( ( d, i ) => {
								const date = isoOf( d );
								const cs = cellShifts( m.id, date );
								return (
									<Box
										key={ i }
										onClick={ () => cs.length === 0 && openNew( m, date ) }
										sx={ {
											flex: 1,
											minWidth: 0,
											p: 0.5,
											borderLeft: i ? `1px solid ${ tokens.border }` : 'none',
											cursor: cs.length === 0 ? 'pointer' : 'default',
											'&:hover': cs.length === 0 ? { bgcolor: tokens.soft } : {},
										} }
									>
										{ cs.map( ( sh ) => (
											<Box
												key={ sh.id }
												onClick={ ( e ) => { e.stopPropagation(); openEdit( sh ); } }
												title={ sh.onLeave ? 'Clash — this shift is on the member’s approved holiday' : undefined }
												sx={ {
													bgcolor: m.color,
													color: '#fff',
													borderRadius: '6px',
													px: 0.75,
													py: 0.4,
													mb: 0.4,
													cursor: 'pointer',
													fontSize: 11,
													fontWeight: 700,
													lineHeight: 1.2,
													...( sh.onLeave ? { outline: `2px solid ${ tokens.amber }`, outlineOffset: '1px' } : {} ),
												} }
											>
												{ sh.start }–{ sh.end }
												{ sh.onLeave && <Box component="span" sx={ { display: 'block', fontSize: 10, fontWeight: 700 } }>⚠ on holiday</Box> }
											</Box>
										) ) }
										{ cs.length === 0 && (
											<Box sx={ { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: tokens.border2 } }>
												<AddIcon sx={ { fontSize: 16 } } />
											</Box>
										) }
									</Box>
								);
							} ) }
						</Stack>
					) ) }
				</Box>
			</Box>

			<Drawer
				anchor="right"
				open={ !! editing }
				onClose={ () => setEditing( null ) }
				disableEnforceFocus
				sx={ { zIndex: 100000 } }
				PaperProps={ { sx: { width: { xs: '100%', sm: 360 } } } }
			>
				{ editing && (
					<Box sx={ { p: 3 } }>
						<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
							<Typography variant="h6" sx={ { fontSize: 18 } }>{ editing.id ? 'Edit shift' : 'Add shift' }</Typography>
							<IconButton size="small" onClick={ () => setEditing( null ) }><CloseIcon fontSize="small" /></IconButton>
						</Stack>
						<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 2 } }>
							{ editing.staffName } · { new Date( editing.date + 'T00:00:00' ).toLocaleDateString( undefined, { weekday: 'long', day: 'numeric', month: 'short' } ) }
						</Typography>
						<Stack spacing={ 2 }>
							<Stack direction="row" spacing={ 1.5 }>
								<TextField label="Start" type="time" size="small" value={ editing.start } onChange={ ( e ) => setEditing( { ...editing, start: e.target.value } ) } sx={ { flex: 1 } } />
								<TextField label="End" type="time" size="small" value={ editing.end } onChange={ ( e ) => setEditing( { ...editing, end: e.target.value } ) } sx={ { flex: 1 } } />
							</Stack>
							<TextField select label="Role for this shift" size="small" value={ editing.role } onChange={ ( e ) => setEditing( { ...editing, role: e.target.value } ) } fullWidth>
								{ roles.map( ( r ) => <MenuItem key={ r.key } value={ r.key }>{ r.label }</MenuItem> ) }
							</TextField>
							<TextField label="Note (optional)" size="small" value={ editing.note } onChange={ ( e ) => setEditing( { ...editing, note: e.target.value } ) } fullWidth />
							<Stack direction="row" alignItems="center" spacing={ 1 }>
								{ editing.id && (
									<Button color="error" size="small" startIcon={ <DeleteOutlineIcon /> } onClick={ deleteShift }>Delete</Button>
								) }
								<Box sx={ { flex: 1 } } />
								<Button onClick={ () => setEditing( null ) } sx={ { color: tokens.muted } }>Cancel</Button>
								<Button variant="contained" onClick={ saveShift }>Save shift</Button>
							</Stack>
							<Typography sx={ { fontSize: 12, color: tokens.muted2 } }>Role: { roleLabel( editing.role ) }</Typography>
						</Stack>
					</Box>
				) }
			</Drawer>
		</Box>
	);
}
