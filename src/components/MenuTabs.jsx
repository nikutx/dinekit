import React, { useState } from 'react';
import {
	Box,
	Stack,
	Button,
	IconButton,
	InputBase,
	Tooltip,
	Chip,
	Typography,
	Collapse,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens } from '../theme';

const DAYS = [
	[ 'mon', 'Mon' ], [ 'tue', 'Tue' ], [ 'wed', 'Wed' ], [ 'thu', 'Thu' ],
	[ 'fri', 'Fri' ], [ 'sat', 'Sat' ], [ 'sun', 'Sun' ],
];

function statusChip( status ) {
	if ( ! status ) {
		return null;
	}
	if ( status.state === 'coming' ) {
		return { label: status.label, bg: tokens.amberSoft, fg: tokens.amber };
	}
	if ( status.state === 'scheduled' ) {
		return status.liveNow
			? { label: `Live now · ${ status.label }`, bg: tokens.greenSoft, fg: tokens.green }
			: { label: status.label, bg: tokens.soft, fg: tokens.muted };
	}
	return null; // "Always on" — no chip.
}

export default function MenuTabs( { menus, selected, onSelect, store } ) {
	const [ adding, setAdding ] = useState( false );
	const [ newName, setNewName ] = useState( '' );
	const [ renaming, setRenaming ] = useState( false );
	const [ renameValue, setRenameValue ] = useState( '' );
	const [ scheduleOpen, setScheduleOpen ] = useState( false );

	const activeMenu = menus.find( ( m ) => m.id === selected );

	const addMenu = async () => {
		const name = newName.trim();
		setAdding( false );
		setNewName( '' );
		if ( ! name ) {
			return;
		}
		const term = await store.createTerm( 'dk_menu', name );
		if ( term && term.id ) {
			onSelect( term.id );
		}
	};

	const saveRename = () => {
		const name = renameValue.trim();
		setRenaming( false );
		if ( name && activeMenu && name !== activeMenu.name ) {
			store.renameTerm( 'dk_menu', activeMenu.id, name );
		}
	};

	const tabSx = ( active ) => ( {
		px: 1.75, py: 0.75, borderRadius: 2, fontSize: 14, fontWeight: 700,
		cursor: 'pointer', whiteSpace: 'nowrap',
		color: active ? '#fff' : tokens.ink2,
		bgcolor: active ? tokens.accent : tokens.surface,
		border: `1px solid ${ active ? tokens.accent : tokens.border }`,
		transition: 'all 0.15s ease-in-out',
		'&:hover': { borderColor: tokens.accent },
	} );

	const chip = statusChip( activeMenu && activeMenu.status );

	// No menus yet: keep it simple with just a subtle opt-in for places that
	// run separate menus (Lunch/Dinner). Most restaurants never need this.
	if ( menus.length === 0 ) {
		return (
			<Box sx={ { mb: 2 } }>
				{ adding ? (
					<InputBase
						autoFocus
						placeholder="Menu name (e.g. Lunch)"
						value={ newName }
						onChange={ ( e ) => setNewName( e.target.value ) }
						onKeyDown={ ( e ) => e.key === 'Enter' && addMenu() }
						onBlur={ addMenu }
						sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, px: 1, py: 0.5, fontSize: 14, width: 180 } }
					/>
				) : (
					<Button size="small" startIcon={ <AddIcon /> } onClick={ () => setAdding( true ) } sx={ { color: tokens.muted } }>
						Running separate menus? (Lunch, Dinner…)
					</Button>
				) }
			</Box>
		);
	}

	return (
		<Box sx={ { mb: 2.5 } }>
			<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" sx={ { rowGap: 1 } }>
				<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted2, mr: 0.5 } }>
					Menus
				</Typography>
				<Box sx={ tabSx( selected === 0 ) } onClick={ () => onSelect( 0 ) }>
					All
				</Box>

				{ menus.map( ( m ) =>
					renaming && m.id === selected ? (
						<Stack key={ m.id } direction="row" alignItems="center" sx={ { ...tabSx( true ), py: 0.25 } }>
							<InputBase
								autoFocus
								value={ renameValue }
								onChange={ ( e ) => setRenameValue( e.target.value ) }
								onKeyDown={ ( e ) => e.key === 'Enter' && saveRename() }
								sx={ { color: '#fff', fontWeight: 700, fontSize: 14, width: 90 } }
							/>
							<IconButton size="small" onClick={ saveRename } sx={ { color: '#fff', p: 0.25 } }>
								<CheckIcon fontSize="small" />
							</IconButton>
						</Stack>
					) : (
						<Box key={ m.id } sx={ tabSx( m.id === selected ) } onClick={ () => onSelect( m.id ) }>
							{ m.name }
						</Box>
					)
				) }

				{ adding ? (
					<InputBase
						autoFocus
						placeholder="Menu name"
						value={ newName }
						onChange={ ( e ) => setNewName( e.target.value ) }
						onKeyDown={ ( e ) => e.key === 'Enter' && addMenu() }
						onBlur={ addMenu }
						sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, px: 1, py: 0.5, fontSize: 14, width: 130 } }
					/>
				) : (
					<Button size="small" startIcon={ <AddIcon /> } onClick={ () => setAdding( true ) } sx={ { color: tokens.muted } }>
						New menu
					</Button>
				) }
			</Stack>

			{ activeMenu && ! renaming && (
				<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" sx={ { mt: 1.25, rowGap: 1 } }>
					{ chip && (
						<Chip
							size="small"
							icon={ <ScheduleIcon sx={ { fontSize: 15 } } /> }
							label={ chip.label }
							sx={ { fontWeight: 700, bgcolor: chip.bg, color: chip.fg, '& .MuiChip-icon': { color: chip.fg } } }
						/>
					) }
					{ activeMenu.status && activeMenu.status.created > 0 && (
						<Typography sx={ { fontSize: 12, color: tokens.muted2 } }>
							Created { new Date( activeMenu.status.created * 1000 ).toLocaleDateString() }
						</Typography>
					) }
					<Box sx={ { flex: 1 } } />
					<Button size="small" startIcon={ <ScheduleIcon /> } onClick={ () => setScheduleOpen( ! scheduleOpen ) } sx={ { color: tokens.ink2 } }>
						Schedule
					</Button>
					<Button size="small" startIcon={ <ContentCopyIcon sx={ { fontSize: 16 } } /> } onClick={ () => store.duplicateMenu( activeMenu.id ) } sx={ { color: tokens.ink2 } }>
						Duplicate
					</Button>
					<Tooltip title="Rename">
						<IconButton size="small" onClick={ () => { setRenameValue( activeMenu.name ); setRenaming( true ); } } sx={ { color: tokens.muted2 } }>
							<EditIcon fontSize="small" />
						</IconButton>
					</Tooltip>
					<Tooltip title="Delete this menu (dishes are kept)">
						<IconButton size="small" onClick={ () => { store.deleteTerm( 'dk_menu', activeMenu.id ); onSelect( 0 ); } } sx={ { color: tokens.muted2 } }>
							<DeleteOutlineIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Stack>
			) }

			<Collapse in={ scheduleOpen && !! activeMenu }>
				{ activeMenu && (
					<ScheduleEditor
						key={ activeMenu.id }
						menu={ activeMenu }
						onSave={ ( sched ) => {
							store.saveMenuSchedule( activeMenu.id, sched );
							setScheduleOpen( false );
						} }
					/>
				) }
			</Collapse>
		</Box>
	);
}

function ScheduleEditor( { menu, onSave } ) {
	const s = menu.schedule || {};
	const [ goLive, setGoLive ] = useState( s.goLive || '' );
	const [ days, setDays ] = useState( s.days || [] );
	const [ start, setStart ] = useState( s.start || '' );
	const [ end, setEnd ] = useState( s.end || '' );

	const labelSx = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted, mb: 0.5, display: 'block' };

	return (
		<Box sx={ { mt: 1.5, p: 2, bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3 } }>
			<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 3 } alignItems="flex-start" flexWrap="wrap">
				<Box>
					<Typography sx={ labelSx }>Go live</Typography>
					<TextField type="datetime-local" size="small" value={ goLive } onChange={ ( e ) => setGoLive( e.target.value ) } />
					<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.5 } }>Leave empty to be live now.</Typography>
				</Box>
				<Box>
					<Typography sx={ labelSx }>Available days</Typography>
					<ToggleButtonGroup
						size="small"
						value={ days }
						onChange={ ( e, v ) => setDays( v ) }
					>
						{ DAYS.map( ( [ key, label ] ) => (
							<ToggleButton key={ key } value={ key } sx={ { px: 1, textTransform: 'none' } }>
								{ label }
							</ToggleButton>
						) ) }
					</ToggleButtonGroup>
					<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.5 } }>None = every day.</Typography>
				</Box>
				<Box>
					<Typography sx={ labelSx }>Time window</Typography>
					<Stack direction="row" spacing={ 1 } alignItems="center">
						<TextField type="time" size="small" value={ start } onChange={ ( e ) => setStart( e.target.value ) } sx={ { width: 120 } } />
						<Typography sx={ { color: tokens.muted } }>–</Typography>
						<TextField type="time" size="small" value={ end } onChange={ ( e ) => setEnd( e.target.value ) } sx={ { width: 120 } } />
					</Stack>
				</Box>
			</Stack>
			<Stack direction="row" spacing={ 1 } sx={ { mt: 2 } }>
				<Button variant="contained" size="small" onClick={ () => onSave( { goLive, days, start, end } ) }>
					Save schedule
				</Button>
				<Button size="small" onClick={ () => onSave( { goLive: '', days: [], start: '', end: '' } ) } sx={ { color: tokens.muted } }>
					Clear
				</Button>
			</Stack>
		</Box>
	);
}
