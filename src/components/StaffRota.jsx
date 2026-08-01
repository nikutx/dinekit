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
	ToggleButton,
	ToggleButtonGroup,
} from '../ui';
import ConfirmDialog from './ui/ConfirmDialog';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
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

// Day grading — the treatment every big rota/calendar tool uses (Deputy,
// 7shifts, Google Calendar): today's column is tinted in the ONE brand hue,
// tomorrow gets a fainter hint of the same, the past greys out (still
// editable), and the rest of the future stays plain. No new rainbow.
const DAY_BG = {
	past: '#fafafa',
	today: '#eef2ff', // tokens.accentSoft
	tomorrow: '#f7f8ff', // half-strength hint of the same indigo
	future: 'transparent',
};
const fmtDay = ( iso ) => new Date( iso + 'T00:00:00' ).toLocaleDateString( undefined, { day: 'numeric', month: 'short' } );

// Weekly rota grid — staff down the side, the week across the top; each cell
// holds that person's shifts for the day, with a running hours + labour cost.
// v2: group by role, colour shifts by role, clone a shift across days, approve
// holiday on the rota, and warn when scheduled hours exceed a contract.
export default function StaffRota( { staff, roles } ) {
	const [ weekStart, setWeekStart ] = useState( () => mondayOf( new Date() ) );
	const [ shifts, setShifts ] = useState( [] );
	const [ leave, setLeave ] = useState( [] ); // holiday requests (for the on-rota approve panel)
	const [ loading, setLoading ] = useState( true );
	const [ editing, setEditing ] = useState( null );
	const [ confirmDel, setConfirmDel ] = useState( false );
	const [ groupByRole, setGroupByRole ] = useState( true );
	const [ colorBy, setColorBy ] = useState( 'role' ); // 'role' (dept colour) | 'staff'
	const [ copyTargets, setCopyTargets ] = useState( [] ); // ISO dates to clone the editing shift to

	const days = useMemo( () => Array.from( { length: 7 }, ( _, i ) => addDays( weekStart, i ) ), [ weekStart ] );
	const from = isoOf( days[ 0 ] );
	const to = isoOf( days[ 6 ] );

	const load = () => {
		setLoading( true );
		api.getShifts( { from, to } ).then( ( rows ) => setShifts( rows || [] ) ).finally( () => setLoading( false ) );
	};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect( load, [ from, to ] );
	const loadLeave = () => api.getLeave().then( ( r ) => setLeave( ( r && r.requests ) || [] ) ).catch( () => {} );
	useEffect( () => { loadLeave(); }, [] );

	const roleOf = ( key ) => roles.find( ( r ) => r.key === key ) || null;
	const roleLabel = ( key ) => ( roleOf( key ) || {} ).label || key;
	const roleColor = ( key ) => ( roleOf( key ) || {} ).color || tokens.muted2;
	const active = staff.filter( ( m ) => m.active );
	const cellShifts = ( staffId, date ) => shifts.filter( ( s ) => s.staffId === staffId && s.date === date );
	const chipColor = ( sh, m ) => ( colorBy === 'role' ? roleColor( sh.role ) : ( m.color || tokens.muted2 ) );

	// Per-staff PAID hours this week (break-adjusted — drives the contracted-hours guard).
	const hoursByStaff = useMemo( () => {
		const map = {};
		shifts.forEach( ( s ) => { map[ s.staffId ] = ( map[ s.staffId ] || 0 ) + ( s.paidHours ?? s.hours ?? 0 ); } );
		return map;
	}, [ shifts ] );

	const totalHours = shifts.reduce( ( s, sh ) => s + ( sh.paidHours ?? sh.hours ?? 0 ), 0 );
	const totalCost = shifts.reduce( ( s, sh ) => s + ( sh.cost || 0 ), 0 );

	// Group the roster by role (catalogue order), else one flat group.
	const groups = useMemo( () => {
		if ( ! groupByRole ) {
			return [ { key: '_all', label: '', color: null, members: active } ];
		}
		const out = [];
		roles.forEach( ( r ) => {
			const members = active.filter( ( m ) => m.role === r.key );
			if ( members.length ) {
				out.push( { key: r.key, label: r.label, color: r.color, members } );
			}
		} );
		const leftover = active.filter( ( m ) => ! roles.some( ( r ) => r.key === m.role ) );
		if ( leftover.length ) {
			out.push( { key: '_none', label: 'Unassigned', color: tokens.muted2, members: leftover } );
		}
		return out;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ active, roles, groupByRole ] );

	// Pending holiday requests — surfaced so a manager can approve/decline right
	// on the rota. Ones overlapping the visible week float to the top.
	const pending = useMemo( () => {
		return ( leave || [] )
			.filter( ( r ) => r.status === 'pending' )
			.map( ( r ) => ( { ...r, member: staff.find( ( m ) => m.id === r.staffId ), thisWeek: r.from <= to && r.to >= from } ) )
			.sort( ( a, b ) => ( b.thisWeek - a.thisWeek ) || ( a.from || '' ).localeCompare( b.from || '' ) );
	}, [ leave, staff, from, to ] );
	const setLeaveStatus = async ( id, status ) => {
		await api.updateLeave( id, { status } );
		await loadLeave();
		load(); // approving may create a clash badge on an existing shift
	};

	// "Who's on today?" — a plain names view for the day, not just weekly counts.
	const todayIso = isoOf( new Date() );
	const tomorrowIso = isoOf( addDays( new Date(), 1 ) );
	const dayKind = ( iso ) => {
		if ( iso === todayIso ) {
			return 'today';
		}
		if ( iso === tomorrowIso ) {
			return 'tomorrow';
		}
		return iso < todayIso ? 'past' : 'future';
	};
	const todayInWeek = todayIso >= from && todayIso <= to;
	const todayShifts = shifts
		.filter( ( s ) => s.date === todayIso )
		.map( ( s ) => ( { ...s, member: staff.find( ( m ) => m.id === s.staffId ) } ) )
		.sort( ( a, b ) => ( a.start || '' ).localeCompare( b.start || '' ) );
	const workingToday = todayShifts.filter( ( s ) => ( s.type || 'work' ) === 'work' );
	const workingCount = workingToday.filter( ( s ) => ! s.onLeave ).length;
	const clashCount = workingToday.length - workingCount;
	const absentCount = todayShifts.length - workingToday.length;

	const openNew = ( m, date ) => { setCopyTargets( [] ); setEditing( { staffId: m.id, staffName: m.name, date, start: '17:00', end: '23:00', role: m.role, note: '', type: 'work' } ); };
	const openEdit = ( sh ) => {
		const m = staff.find( ( x ) => x.id === sh.staffId );
		setCopyTargets( [] );
		setEditing( { ...sh, staffName: m ? m.name : '' } );
	};
	// Save = save AND copy: ticked days are intent, so one press does the lot
	// (the button says so). Copies skip a day that already has a shift for the
	// same person — the + in the cell is the deliberate route to split shifts.
	const saveShift = async () => {
		const body = { staffId: editing.staffId, date: editing.date, start: editing.start, end: editing.end, role: editing.role, note: editing.note, type: editing.type || 'work' };
		if ( editing.id ) {
			await api.updateShift( editing.id, body );
		} else {
			await api.createShift( body );
		}
		for ( const date of copyTargets ) {
			if ( date === editing.date || cellShifts( editing.staffId, date ).length ) {
				continue;
			}
			// eslint-disable-next-line no-await-in-loop
			await api.createShift( { ...body, date } );
		}
		setEditing( null );
		setCopyTargets( [] );
		load();
	};
	const deleteShift = async () => {
		if ( editing.id ) {
			await api.deleteShift( editing.id );
		}
		setEditing( null );
		load();
	};
	// Split shift from inside the drawer: save what's on screen, then flip the
	// drawer to the NEXT block of hours for the same person/day — starting
	// where the last one ended. Press it as many times as the day needs.
	const addSplit = async () => {
		const body = { staffId: editing.staffId, date: editing.date, start: editing.start, end: editing.end, role: editing.role, note: editing.note, type: editing.type || 'work' };
		if ( editing.id ) {
			await api.updateShift( editing.id, body );
		} else {
			await api.createShift( body );
		}
		load();
		const start = /^\d{1,2}:\d{2}$/.test( editing.end || '' ) && editing.end < '23:00' ? editing.end : '17:00';
		setCopyTargets( [] );
		setEditing( { staffId: editing.staffId, staffName: editing.staffName, date: editing.date, start, end: '23:00', role: editing.role, note: '', type: 'work' } );
	};

	if ( ! active.length ) {
		return <Typography sx={ { fontSize: 14, color: tokens.muted, py: 3, textAlign: 'center' } }>Add active team members to build a rota.</Typography>;
	}

	const NAME_W = 168;

	const nameCell = ( m ) => {
		const wk = hoursByStaff[ m.id ] || 0;
		const contracted = parseFloat( m.contracted );
		const hasContract = Number.isFinite( contracted ) && contracted > 0;
		const over = hasContract && wk > contracted + 0.001;
		return (
			<Box sx={ { width: NAME_W, flexShrink: 0, px: 1.5, py: 1, borderRight: `1px solid ${ tokens.border }`, display: 'flex', alignItems: 'center', gap: 0.75 } }>
				<Box sx={ { width: 10, height: 10, borderRadius: '50%', bgcolor: colorBy === 'role' ? roleColor( m.role ) : m.color, flexShrink: 0 } } />
				<Box sx={ { minWidth: 0 } }>
					<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>{ m.name || 'Unnamed' }</Typography>
					<Typography sx={ { fontSize: 11, color: over ? tokens.red : tokens.muted2, fontWeight: over ? 700 : 400, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }>
						{ wk.toFixed( 1 ) }h{ hasContract ? ` / ${ contracted }h` : '' }{ over ? ' ⚠' : '' }
					</Typography>
				</Box>
			</Box>
		);
	};

	const staffRow = ( m ) => (
		<Stack key={ m.id } direction="row" sx={ { borderTop: `1px solid ${ tokens.border }`, minHeight: 54 } }>
			{ nameCell( m ) }
			{ days.map( ( d, i ) => {
				const date = isoOf( d );
				const cs = cellShifts( m.id, date );
				const kind = dayKind( date );
				return (
					<Box
						key={ i }
						onClick={ () => cs.length === 0 && openNew( m, date ) }
						sx={ {
							flex: 1,
							minWidth: 0,
							p: 0.5,
							borderLeft: i ? `1px solid ${ tokens.border }` : 'none',
							bgcolor: DAY_BG[ kind ],
							cursor: cs.length === 0 ? 'pointer' : 'default',
							'&:hover': cs.length === 0 ? { bgcolor: kind === 'today' ? '#e0e7ff' : tokens.soft } : {},
						} }
					>
						{ cs.map( ( sh ) => {
							const off = sh.type === 'off';
							const sick = sh.type === 'sick';
							const tip = sick ? 'Marked sick — not counted in hours or cost'
								: off ? 'Day off — blocks this day, no hours'
									: ( sh.onLeave ? 'Clash — this shift is on the member’s approved holiday'
										: roleLabel( sh.role ) + ( sh.breakMins ? ` · ${ sh.breakMins }m unpaid break deducted` : '' ) );
							return (
								<Box
									key={ sh.id }
									onClick={ ( e ) => { e.stopPropagation(); openEdit( sh ); } }
									title={ tip }
									sx={ {
										bgcolor: off ? tokens.soft : ( sick ? tokens.redSoft : chipColor( sh, m ) ),
										color: off ? tokens.muted : ( sick ? tokens.red : '#fff' ),
										border: off ? `1px dashed ${ tokens.border2 }` : 'none',
										borderRadius: '6px',
										px: 0.75,
										py: 0.4,
										mb: 0.4,
										cursor: 'pointer',
										fontSize: 11,
										fontWeight: 700,
										lineHeight: 1.2,
										...( sh.onLeave && ! off && ! sick ? { outline: `2px solid ${ tokens.amber }`, outlineOffset: '1px' } : {} ),
										...( kind === 'past' ? { opacity: 0.55, filter: 'saturate(0.7)' } : {} ),
									} }
								>
									{ off ? 'DAY OFF' : (
										<Box component="span" sx={ sick ? { textDecoration: 'line-through' } : {} }>{ sh.start }–{ sh.end }</Box>
									) }
									{ sick && <Box component="span" sx={ { display: 'block', fontSize: 10, fontWeight: 700 } }>SICK</Box> }
									{ ! off && ! sick && sh.breakMins > 0 && <Box component="span" sx={ { display: 'block', fontSize: 9.5, fontWeight: 600, opacity: 0.85 } }>{ sh.breakMins }m break</Box> }
									{ sh.onLeave && ! off && ! sick && <Box component="span" sx={ { display: 'block', fontSize: 10, fontWeight: 700 } }>⚠ on holiday</Box> }
								</Box>
							);
						} ) }
						{ cs.length === 0 ? (
							<Box sx={ { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: tokens.border2 } }>
								<AddIcon sx={ { fontSize: 16 } } />
							</Box>
						) : (
							// Split shifts: a second (third…) shift on the same day.
							<Box
								onClick={ ( e ) => { e.stopPropagation(); openNew( m, date ); } }
								title="Add another shift this day (split shift)"
								sx={ { display: 'flex', alignItems: 'center', justifyContent: 'center', py: 0.1, borderRadius: '6px', color: tokens.border2, cursor: 'pointer', '&:hover': { color: tokens.accent, bgcolor: tokens.soft } } }
							>
								<AddIcon sx={ { fontSize: 13 } } />
							</Box>
						) }
					</Box>
				);
			} ) }
		</Stack>
	);

	return (
		<Box>
			{ /* Week navigator */ }
			<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1.5, flexWrap: 'wrap' } }>
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

			{ /* View controls */ }
			<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { mb: 1.5, flexWrap: 'wrap' } }>
				<ToggleButtonGroup size="small" exclusive value={ groupByRole ? 'role' : 'flat' } onChange={ ( e, v ) => v && setGroupByRole( v === 'role' ) }>
					<ToggleButton value="role">Group by role</ToggleButton>
					<ToggleButton value="flat">Flat list</ToggleButton>
				</ToggleButtonGroup>
				<Stack direction="row" alignItems="center" spacing={ 0.75 }>
					<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>Colour</Typography>
					<ToggleButtonGroup size="small" exclusive value={ colorBy } onChange={ ( e, v ) => v && setColorBy( v ) }>
						<ToggleButton value="role">Role</ToggleButton>
						<ToggleButton value="staff">Staff</ToggleButton>
					</ToggleButtonGroup>
				</Stack>
			</Stack>

			{ /* Pending holiday requests — approve/decline on the rota */ }
			{ pending.length > 0 && (
				<Box sx={ { mb: 1.5, p: 1.5, borderRadius: '12px', border: `1px solid ${ tokens.amber }`, bgcolor: tokens.amberSoft } }>
					<Typography sx={ { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.amber, mb: 1 } }>
						Holiday requests · { pending.length } pending
					</Typography>
					<Stack spacing={ 1 }>
						{ pending.map( ( r ) => (
							<Stack key={ r.id } direction="row" alignItems="center" spacing={ 1 } sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '10px', px: 1.25, py: 0.75 } }>
								<Box sx={ { flex: 1, minWidth: 0 } }>
									<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink } }>
										{ ( r.member && r.member.name ) || 'Unknown' }
										{ r.thisWeek && <Box component="span" sx={ { ml: 0.75, fontSize: 11, fontWeight: 700, color: tokens.amber } }>this week</Box> }
									</Typography>
									<Typography sx={ { fontSize: 12, color: tokens.muted } }>
										{ fmtDay( r.from ) }{ r.to !== r.from ? ` – ${ fmtDay( r.to ) }` : '' } · { r.days } day{ Number( r.days ) === 1 ? '' : 's' }
										{ r.note ? ` · ${ r.note }` : '' }
									</Typography>
								</Box>
								<Button size="small" variant="contained" startIcon={ <CheckIcon /> } onClick={ () => setLeaveStatus( r.id, 'approved' ) }>Approve</Button>
								<Button size="small" color="error" startIcon={ <CloseIcon /> } onClick={ () => setLeaveStatus( r.id, 'denied' ) }>Decline</Button>
							</Stack>
						) ) }
					</Stack>
				</Box>
			) }

			{ todayInWeek && (
				<Box sx={ { mb: 1.5, p: 1.5, borderRadius: '12px', border: `1px solid ${ tokens.border }`, bgcolor: tokens.accentSoft } }>
					<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: todayShifts.length ? 1 : 0 } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.accentDark } }>
							On today
						</Typography>
						<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>
							{ todayShifts.length ? `${ workingCount } working` : 'Nobody scheduled' }
							{ clashCount > 0 ? ` · ${ clashCount } on holiday ⚠` : '' }
							{ absentCount > 0 ? ` · ${ absentCount } off/sick` : '' }
						</Typography>
					</Stack>
					{ todayShifts.length > 0 && (
						<Stack direction="row" spacing={ 1 } flexWrap="wrap" useFlexGap>
							{ todayShifts.map( ( s ) => (
								<Stack key={ s.id } direction="row" alignItems="center" spacing={ 0.75 } sx={ { bgcolor: tokens.surface, border: `1px solid ${ s.onLeave ? tokens.amber : tokens.border }`, borderRadius: '999px', pl: 0.75, pr: 1.25, py: 0.5, opacity: s.onLeave ? 0.85 : 1 } }>
									<Box sx={ { width: 8, height: 8, borderRadius: '50%', bgcolor: colorBy === 'role' ? roleColor( s.role ) : ( ( s.member && s.member.color ) || tokens.muted2 ), flexShrink: 0 } } />
									<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.ink } }>{ ( s.member && s.member.name ) || 'Unnamed' }</Typography>
									<Typography sx={ { fontSize: 11.5, color: tokens.muted } }>
										{ s.type === 'off' ? 'Day off' : s.type === 'sick' ? `${ roleLabel( s.role ) } · sick` : `${ roleLabel( s.role ) } · ${ s.start }–${ s.end }` }
									</Typography>
									{ s.type === 'sick' && <Typography sx={ { fontSize: 11, fontWeight: 700, color: tokens.red } }>sick</Typography> }
									{ s.onLeave && s.type !== 'off' && s.type !== 'sick' && <Typography sx={ { fontSize: 11, fontWeight: 700, color: tokens.amber } }>on holiday ⚠</Typography> }
								</Stack>
							) ) }
						</Stack>
					) }
				</Box>
			) }

			<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', overflowX: 'auto', bgcolor: tokens.surface } }>
				<Box sx={ { minWidth: 760 } }>
					{ /* Header */ }
					<Stack direction="row" sx={ { bgcolor: tokens.soft, borderBottom: `1px solid ${ tokens.border }` } }>
						<Box sx={ { width: NAME_W, flexShrink: 0, px: 1.5, py: 1, borderRight: `1px solid ${ tokens.border }` } }>
							<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted } }>Team</Typography>
						</Box>
						{ days.map( ( d, i ) => {
							const kind = dayKind( isoOf( d ) );
							return (
								<Box
									key={ i }
									sx={ {
										flex: 1,
										px: 1,
										py: 0.75,
										textAlign: 'center',
										borderLeft: i ? `1px solid ${ tokens.border }` : 'none',
										bgcolor: DAY_BG[ kind ],
										...( kind === 'today' ? { boxShadow: `inset 0 -2px 0 ${ tokens.accent }` } : {} ),
									} }
								>
									<Typography sx={ { fontSize: 11.5, fontWeight: 700, color: kind === 'today' ? tokens.accentDark : ( kind === 'past' ? tokens.muted2 : tokens.ink ) } }>{ DAYNAMES[ i ] }</Typography>
									{ kind === 'today' ? (
										<Box component="span" sx={ { display: 'inline-block', minWidth: 18, lineHeight: '18px', px: 0.25, borderRadius: '999px', bgcolor: tokens.accent, color: '#fff', fontSize: 11, fontWeight: 700 } }>{ d.getDate() }</Box>
									) : (
										<Typography sx={ { fontSize: 11, color: kind === 'past' ? tokens.muted2 : tokens.muted } }>{ d.getDate() }</Typography>
									) }
									{ ( kind === 'today' || kind === 'tomorrow' ) && (
										<Typography sx={ { fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tokens.accentDark, opacity: kind === 'tomorrow' ? 0.65 : 1 } }>
											{ kind === 'today' ? 'Today' : 'Tomorrow' }
										</Typography>
									) }
								</Box>
							);
						} ) }
					</Stack>

					{ /* Rows, optionally grouped by role */ }
					{ groups.map( ( g ) => (
						<React.Fragment key={ g.key }>
							{ groupByRole && (
								<Stack direction="row" sx={ { borderTop: `1px solid ${ tokens.border }`, bgcolor: tokens.soft } }>
									<Box sx={ { width: '100%', px: 1.5, py: 0.6, display: 'flex', alignItems: 'center', gap: 0.75 } }>
										<Box sx={ { width: 9, height: 9, borderRadius: '2px', bgcolor: g.color || tokens.muted2, flexShrink: 0 } } />
										<Typography sx={ { fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: tokens.muted } }>
											{ g.label } · { g.members.length }
										</Typography>
									</Box>
								</Stack>
							) }
							{ g.members.map( ( m ) => staffRow( m ) ) }
						</React.Fragment>
					) ) }
				</Box>
			</Box>

			<Drawer
				anchor="right"
				open={ !! editing }
				onClose={ () => setEditing( null ) }
				disableEnforceFocus
				sx={ { zIndex: 100000 } }
				PaperProps={ { sx: { width: 'min(440px, 100%)', height: 'auto' } } }
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
							{ /* Working / day off / sick — a day off blocks the day with no
							     hours; sick keeps the record but zeroes hours + cost. */ }
							<ToggleButtonGroup size="small" exclusive value={ editing.type || 'work' } onChange={ ( e, v ) => v && setEditing( { ...editing, type: v } ) }>
								<ToggleButton value="work">Working</ToggleButton>
								<ToggleButton value="off">Day off</ToggleButton>
								<ToggleButton value="sick">Sick</ToggleButton>
							</ToggleButtonGroup>
							{ ( editing.type || 'work' ) !== 'off' && (
								<Stack direction="row" spacing={ 1.5 }>
									<TextField label="Start" type="time" size="small" value={ editing.start } onChange={ ( e ) => setEditing( { ...editing, start: e.target.value } ) } sx={ { flex: 1 } } />
									<TextField label="End" type="time" size="small" value={ editing.end } onChange={ ( e ) => setEditing( { ...editing, end: e.target.value } ) } sx={ { flex: 1 } } />
								</Stack>
							) }
							{ ( editing.type || 'work' ) === 'sick' && (
								<Typography sx={ { fontSize: 12, color: tokens.red } }>Marked sick — kept on the rota for the record, but no hours or labour cost are counted.</Typography>
							) }
							<TextField select label="Role for this shift" size="small" value={ editing.role } onChange={ ( e ) => setEditing( { ...editing, role: e.target.value } ) } fullWidth>
								{ roles.map( ( r ) => <MenuItem key={ r.key } value={ r.key }>{ r.label }</MenuItem> ) }
							</TextField>
							<TextField label="Note (optional)" size="small" value={ editing.note } onChange={ ( e ) => setEditing( { ...editing, note: e.target.value } ) } fullWidth />

							{ /* Copy to other days: tick the days, then ONE press of Save does
						     the saving and the copying — the button says so. Available
						     when creating too (make Monday, tick Tue–Fri, done). */ }
							<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, p: 1.5 } }>
								<Typography sx={ { fontSize: 12.5, fontWeight: 700, color: tokens.ink2, mb: 1 } }>Also copy to…</Typography>
								<Stack direction="row" spacing={ 0.75 } flexWrap="wrap" useFlexGap>
									{ days.map( ( d, i ) => {
										const date = isoOf( d );
										if ( date === editing.date ) {
											return null;
										}
										const on = copyTargets.includes( date );
										return (
											<Chip
												key={ date }
												label={ `${ DAYNAMES[ i ] } ${ d.getDate() }` }
												size="small"
												onClick={ () => setCopyTargets( ( t ) => ( on ? t.filter( ( x ) => x !== date ) : [ ...t, date ] ) ) }
												sx={ { cursor: 'pointer', fontWeight: 600, bgcolor: on ? tokens.accent : tokens.soft, color: on ? '#fff' : tokens.ink2 } }
											/>
										);
									} ) }
								</Stack>
								{ copyTargets.length > 0 && (
									<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 1 } }>
										Saving will also create this shift on { copyTargets.length } more day{ copyTargets.length === 1 ? '' : 's' } (days that already have one are skipped).
									</Typography>
								) }
							</Box>

							<Stack direction="row" alignItems="center" spacing={ 1 }>
								{ editing.id && (
									<Button color="error" size="small" startIcon={ <DeleteOutlineIcon /> } onClick={ () => setConfirmDel( true ) }>Delete</Button>
								) }
								{ ( editing.type || 'work' ) === 'work' && (
									<Button size="small" startIcon={ <AddIcon /> } onClick={ addSplit } title="Save this shift, then add another block of hours the same day">
										Split shift
									</Button>
								) }
								<Box sx={ { flex: 1 } } />
								<Button onClick={ () => setEditing( null ) } sx={ { color: tokens.muted } }>Cancel</Button>
								<Button variant="contained" onClick={ saveShift }>
									{ copyTargets.length ? `Save + copy to ${ copyTargets.length } day${ copyTargets.length === 1 ? '' : 's' }` : 'Save shift' }
								</Button>
							</Stack>
						</Stack>
					</Box>
				) }
			</Drawer>
			<ConfirmDialog
				open={ confirmDel }
				title="Delete this shift?"
				message={ editing ? `${ editing.staffName }'s ${ editing.start }–${ editing.end } shift will be removed from the rota.` : '' }
				confirmLabel="Delete shift"
				onConfirm={ () => { setConfirmDel( false ); deleteShift(); } }
				onCancel={ () => setConfirmDel( false ) }
			/>
		</Box>
	);
}
