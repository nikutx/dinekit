import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	Button,
	IconButton,
	TextField,
	Chip,
	MenuItem,
	Tooltip,
	Divider,
	Switch,
	Collapse,
	ToggleButton,
	ToggleButtonGroup,
} from '../ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BuildIcon from '@mui/icons-material/Build';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import CloseIcon from '@mui/icons-material/Close';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import LinkIcon from '@mui/icons-material/Link';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import { tokens, TINTS } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import { ListSkeleton } from './ui/Skeletons';
import PageTour from './PageTour';
import ConfirmDialog from './ui/ConfirmDialog';

// Canvas geometry.
const CANVAS_H = 720;
// Auto-placement grid — must match the wizard's seeding in includes/rest.php.
const GRID_COLS = 8;
const GRID_GAP = 90;
const SNAP = 10;
const snap = ( v ) => Math.round( v / SNAP ) * SNAP;

// Table shapes and their pixel footprint. Radius MUST be a string with units —
// a bare number is scaled by theme.shape.borderRadius (×8) and clamps every
// shape into a circle. '50%' = round; px strings keep square/rect/bar squared.
const SHAPES = {
	round: { w: 62, h: 62, radius: '50%', label: 'Round' },
	square: { w: 62, h: 62, radius: '10px', label: 'Square' },
	rect: { w: 104, h: 62, radius: '10px', label: 'Rectangle' },
	bar: { w: 150, h: 42, radius: '10px', label: 'Bar / bench' },
};
const dims = ( shape ) => SHAPES[ shape ] || SHAPES.round;

// Debounce persistence per key so dragging/typing doesn't hammer the API.
function useDebouncedSaver() {
	const timers = useRef( {} );
	return ( key, fn, delay = 400 ) => {
		clearTimeout( timers.current[ key ] );
		timers.current[ key ] = setTimeout( fn, delay );
	};
}

export default function FloorPlan() {
	const [ areas, setAreas ] = useState( [] );
	const [ tables, setTables ] = useState( [] );
	const [ combos, setCombos ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ newArea, setNewArea ] = useState( '' );
	const [ zone, setZone ] = useState( 0 );
	const [ selectedId, setSelectedId ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const [ joinMode, setJoinMode ] = useState( false );
	const [ joinSel, setJoinSel ] = useState( [] ); // table ids selected to join
	const [ viewMode, setViewMode ] = useState( 'plan' ); // 'plan' (canvas) | 'list'
	// Zone-delete dialog: { id, name, tables, upcoming, loading, error } | null.
	const [ zoneDel, setZoneDel ] = useState( null );
	const [ zoneDelBusy, setZoneDelBusy ] = useState( false );
	const [ moveTo, setMoveTo ] = useState( 0 ); // target area id, 0 = Unzoned, -1 = void tables
	// Table-delete dialog + shared booking-reassignment map (bookingId -> tableId; 0 = keep).
	const [ tableDel, setTableDel ] = useState( null ); // { id, name, upcoming, joins, loading, error } | null
	const [ tableDelBusy, setTableDelBusy ] = useState( false );
	const [ reassign, setReassign ] = useState( {} );
	// History tab (voided zones + tables).
	const [ history, setHistory ] = useState( null ); // { zones, tables } | null
	const [ historyBusy, setHistoryBusy ] = useState( false );

	const canvasRef = useRef( null );
	const drag = useRef( null );
	const saveLater = useDebouncedSaver();

	const loadFloor = () =>
		api.getFloor().then( ( data ) => {
			setAreas( data.areas || [] );
			setTables( data.tables || [] );
			setCombos( data.combos || [] );
			return data;
		} );

	useEffect( () => {
		loadFloor()
			.then( ( data ) => {
				if ( ( data.areas || [] ).length ) {
					setZone( data.areas[ 0 ].id );
				}
			} )
			.finally( () => setLoading( false ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Fetch the voided list whenever the History tab is opened (fresh each time).
	useEffect( () => {
		if ( 'history' === viewMode ) {
			loadHistory();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ viewMode ] );

	const totalSeats = useMemo( () => tables.reduce( ( s, t ) => s + ( t.seats || 0 ), 0 ), [ tables ] );
	const unzonedCount = useMemo( () => tables.filter( ( t ) => ! ( t.areaId || 0 ) ).length, [ tables ] );
	const byId = useMemo( () => Object.fromEntries( tables.map( ( t ) => [ t.id, t ] ) ), [ tables ] );
	const joinedIds = useMemo( () => new Set( combos.flatMap( ( c ) => c.tables ) ), [ combos ] );
	// Each combo gets a stable colour by its order, so joined tables can be tinted
	// to match their group on the canvas (a table in two joins blends both).
	const comboTints = useMemo( () => combos.map( ( c, i ) => TINTS[ i % TINTS.length ] ), [ combos ] );
	const tintsForTable = ( id ) => combos.reduce( ( acc, c, i ) => ( c.tables.includes( id ) ? [ ...acc, comboTints[ i ] ] : acc ), [] );

	const zones = useMemo( () => {
		const list = areas.map( ( a ) => ( { id: a.id, name: a.name } ) );
		if ( unzonedCount > 0 ) {
			list.push( { id: 0, name: 'Unzoned' } );
		}
		return list;
	}, [ areas, unzonedCount ] );

	const zoneTables = tables.filter( ( t ) => ( t.areaId || 0 ) === zone );
	const selected = tables.find( ( t ) => t.id === selectedId ) || null;

	/* ---- areas ---- */
	const addArea = async () => {
		const name = newArea.trim();
		if ( ! name ) {
			return;
		}
		setBusy( true );
		try {
			const area = await api.createArea( name );
			setAreas( ( a ) => [ ...a, area ] );
			setNewArea( '' );
			setZone( area.id );
		} finally {
			setBusy( false );
		}
	};
	// Deleting a zone is destructive (it can take tables — and their bookings —
	// with it), so open a dialog that first checks what it would affect.
	const askDeleteZone = async ( id ) => {
		const name = areas.find( ( a ) => a.id === id )?.name || 'this zone';
		setMoveTo( 0 ); // default: keep the tables, just un-zone them.
		setZoneDel( { id, name, tables: [], upcoming: [], loading: true, error: '' } );
		try {
			const impact = await api.getAreaImpact( id );
			setReassign( defaultReassign( impact.upcoming || [] ) );
			setZoneDel( ( z ) =>
				z && z.id === id
					? { ...z, tables: impact.tables || [], upcoming: impact.upcoming || [], loading: false }
					: z
			);
		} catch ( e ) {
			setZoneDel( ( z ) => ( z && z.id === id ? { ...z, loading: false, error: e.message || 'Could not read the zone.' } : z ) );
		}
	};

	const confirmDeleteZone = async () => {
		if ( ! zoneDel ) {
			return;
		}
		setZoneDelBusy( true );
		try {
			await api.deleteArea( zoneDel.id, moveTo, moveTo === -1 ? reassign : {} );
			const targetName = areas.find( ( a ) => a.id === moveTo )?.name || '';
			setAreas( ( a ) => a.filter( ( x ) => x.id !== zoneDel.id ) );
			setTables( ( t ) => {
				if ( moveTo === -1 ) {
					const gone = new Set( zoneDel.tables.map( ( x ) => x.id ) );
					return t.filter( ( x ) => ! gone.has( x.id ) );
				}
				return t.map( ( x ) =>
					x.areaId === zoneDel.id
						? { ...x, areaId: moveTo > 0 ? moveTo : 0, area: moveTo > 0 ? targetName : '' }
						: x
				);
			} );
			if ( zone === zoneDel.id ) {
				setZone( moveTo > 0 ? moveTo : ( areas.find( ( a ) => a.id !== zoneDel.id )?.id || 0 ) );
			}
			setSelectedId( null );
			setZoneDel( null );
		} catch ( e ) {
			setZoneDel( ( z ) => ( z ? { ...z, error: e.message || 'Could not delete the zone.' } : z ) );
		} finally {
			setZoneDelBusy( false );
		}
	};

	// A voided table keeps any upcoming bookings unless they're reassigned. Default
	// each to its best-fit suggestion so "just delete" still does the safe thing.
	const defaultReassign = ( upcoming ) =>
		Object.fromEntries( upcoming.map( ( b ) => [ b.id, b.suggested || 0 ] ) );
	const autoAssign = ( upcoming ) =>
		setReassign( defaultReassign( upcoming ) );
	const keepAll = ( upcoming ) =>
		setReassign( Object.fromEntries( upcoming.map( ( b ) => [ b.id, 0 ] ) ) );

	// Deleting a single table voids it (restorable from History); check first for
	// upcoming bookings that would be stranded, and offer to move them.
	const askDeleteTable = async ( id ) => {
		const t = tables.find( ( x ) => x.id === id );
		const joins = combosForTable( id ).map( ( c ) => c.name );
		setTableDel( { id, name: t?.name || 'this table', upcoming: [], joins, loading: true, error: '' } );
		try {
			const impact = await api.getTableImpact( id );
			setReassign( defaultReassign( impact.upcoming || [] ) );
			setTableDel( ( d ) => ( d && d.id === id ? { ...d, upcoming: impact.upcoming || [], loading: false } : d ) );
		} catch ( e ) {
			setTableDel( ( d ) => ( d && d.id === id ? { ...d, loading: false, error: e.message || 'Could not read the table.' } : d ) );
		}
	};

	const confirmDeleteTable = async () => {
		if ( ! tableDel ) {
			return;
		}
		setTableDelBusy( true );
		try {
			await api.deleteTable( tableDel.id, reassign );
			setTables( ( t ) => t.filter( ( x ) => x.id !== tableDel.id ) );
			detachLocally( tableDel.id );
			setSelectedId( null );
			setTableDel( null );
		} catch ( e ) {
			setTableDel( ( d ) => ( d ? { ...d, error: e.message || 'Could not delete the table.' } : d ) );
		} finally {
			setTableDelBusy( false );
		}
	};

	/* ---- history (voided zones + tables) ---- */
	const loadHistory = () => {
		setHistoryBusy( true );
		api.getFloorHistory()
			.then( ( h ) => setHistory( { zones: h.zones || [], tables: h.tables || [] } ) )
			.finally( () => setHistoryBusy( false ) );
	};
	const restoreZone = async ( id ) => {
		await api.restoreArea( id );
		await loadFloor();
		loadHistory();
	};
	const restoreVoidTable = async ( id ) => {
		await api.restoreTable( id );
		await loadFloor();
		loadHistory();
	};

	/* ---- tables ---- */
	const addTable = async () => {
		// Number from the highest existing T-number, not the array length: deleting
		// T3 of 5 and adding would otherwise mint a second T5 on top of the first.
		const highest = tables.reduce( ( max, t ) => {
			const m = /^T(\d+)$/.exec( t.name || '' );
			return m ? Math.max( max, parseInt( m[ 1 ], 10 ) ) : max;
		}, 0 );
		const n = highest + 1;
		// Place into the first free slot in this zone, so zones don't share a grid.
		const taken = new Set( tables.filter( ( t ) => t.areaId === ( zone || 0 ) ).map( ( t ) => `${ t.x },${ t.y }` ) );
		let slot = 0;
		let x = 40;
		let y = 40;
		do {
			x = 40 + ( slot % GRID_COLS ) * GRID_GAP;
			y = 40 + Math.floor( slot / GRID_COLS ) * GRID_GAP;
			++slot;
		} while ( taken.has( `${ x },${ y }` ) && y < CANVAS_H - GRID_GAP );
		const table = await api.createTable( {
			name: 'T' + n,
			seats: 2,
			min: 1,
			max: 2,
			shape: 'round',
			area: zone || 0,
			x,
			y,
			order: n,
		} );
		setTables( ( t ) => [ ...t, table ] );
		setSelectedId( table.id );
	};

	const patchTable = ( id, patch, persist = true ) => {
		setTables( ( t ) => t.map( ( x ) => ( x.id === id ? { ...x, ...patch } : x ) ) );
		if ( persist ) {
			saveLater( 'table-' + id, () => api.updateTable( id, patch ) );
		}
	};

	// Combos (joins) a table belongs to — used to warn before delete/move.
	const combosForTable = ( id ) => combos.filter( ( c ) => c.tables.includes( id ) );

	// Remove a table from its joins locally, mirroring the server: drop the id,
	// and drop any join left with fewer than two tables.
	const detachLocally = ( id ) =>
		setCombos( ( cs ) =>
			cs
				.map( ( c ) => ( { ...c, tables: c.tables.filter( ( x ) => x !== id ) } ) )
				.filter( ( c ) => c.tables.length >= 2 )
		);

	// Change a table's zone. If it's joined, moving zones breaks the join — ask
	// first, then detach it (server-side too, via breakJoins).
	const changeTableZone = ( id, areaId ) => {
		const joins = combosForTable( id );
		// The canvas filters on `areaId` (and shows the `area` name), but the server
		// takes the term id as `area` — so update the local keys explicitly rather
		// than merging `{ area: id }` (which left `areaId` stale, so the table only
		// moved on a page refresh). Persist separately with the server's `area` param.
		const areaName = areas.find( ( a ) => a.id === areaId )?.name || '';
		const moveLocal = ( extra = {} ) =>
			setTables( ( t ) => t.map( ( x ) => ( x.id === id ? { ...x, areaId, area: areaName, ...extra } : x ) ) );
		if ( joins.length ) {
			// eslint-disable-next-line no-alert
			const okMove = window.confirm(
				( byId[ id ]?.name || 'This table' ) + ' is joined in ' + joins.map( ( c ) => c.name ).join( ', ' ) +
					'. Moving it to another zone will break that join. Continue?'
			);
			if ( ! okMove ) {
				return;
			}
			detachLocally( id );
			moveLocal();
			saveLater( 'table-' + id, () => api.updateTable( id, { area: areaId, breakJoins: true } ) );
			return;
		}
		moveLocal();
		saveLater( 'table-' + id, () => api.updateTable( id, { area: areaId } ) );
	};

	/* ---- join / combos ---- */
	const toggleJoinPick = ( id ) => {
		setJoinSel( ( sel ) => ( sel.includes( id ) ? sel.filter( ( x ) => x !== id ) : [ ...sel, id ] ) );
	};
	const createCombo = async () => {
		if ( joinSel.length < 2 ) {
			return;
		}
		const seats = joinSel.reduce( ( s, id ) => s + ( byId[ id ]?.seats || 0 ), 0 );
		const combo = await api.createCombo( { tables: joinSel, min: 2, max: seats || joinSel.length * 2, priority: combos.length } );
		setCombos( ( cs ) => [ ...cs, combo ] );
		setJoinMode( false );
		setJoinSel( [] );
	};
	const patchCombo = ( id, patch ) => {
		setCombos( ( cs ) => cs.map( ( c ) => ( c.id === id ? { ...c, ...patch } : c ) ) );
		saveLater( 'combo-' + id, () => api.updateCombo( id, patch ) );
	};
	const removeCombo = async ( id ) => {
		await api.deleteCombo( id );
		setCombos( ( cs ) => cs.filter( ( c ) => c.id !== id ) );
	};
	const moveCombo = ( index, dir ) => {
		const to = index + dir;
		if ( to < 0 || to >= combos.length ) {
			return;
		}
		const next = combos.slice();
		[ next[ index ], next[ to ] ] = [ next[ to ], next[ index ] ];
		setCombos( next );
		next.forEach( ( c, i ) => {
			if ( c.priority !== i ) {
				api.updateCombo( c.id, { priority: i } );
			}
		} );
	};

	/* ---- drag ---- */
	const onPointerDown = ( e, table ) => {
		if ( joinMode ) {
			return;
		}
		e.preventDefault();
		setSelectedId( table.id );
		const rect = canvasRef.current.getBoundingClientRect();
		const { w, h } = dims( table.shape );
		drag.current = {
			id: table.id,
			startX: e.clientX,
			startY: e.clientY,
			origX: table.x,
			origY: table.y,
			maxX: rect.width - w,
			maxY: CANVAS_H - h,
		};
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const onPointerMove = ( e ) => {
		const d = drag.current;
		if ( ! d || d.id == null ) {
			return;
		}
		const nx = Math.max( 0, Math.min( d.maxX, snap( d.origX + ( e.clientX - d.startX ) ) ) );
		const ny = Math.max( 0, Math.min( d.maxY, snap( d.origY + ( e.clientY - d.startY ) ) ) );
		patchTable( d.id, { x: nx, y: ny }, false );
	};
	const onPointerUp = () => {
		const d = drag.current;
		if ( d && d.id != null ) {
			const t = tables.find( ( x ) => x.id === d.id );
			if ( t ) {
				api.updateTable( d.id, { x: t.x, y: t.y } );
			}
		}
		drag.current = null;
	};

	if ( loading ) {
		return (
			<Page>
				<PageHeader title="Floor Plan" />
				<ListSkeleton rows={ 4 } />
			</Page>
		);
	}

	const noZones = zones.length === 0;

	return (
		<Page>
			<PageHeader
				title="Floor Plan"
				subtitle="Arrange your real tables, then join tables that can be pushed together for bigger parties. Availability is worked out from this."
				actions={
					<>
						<Chip
							icon={ <TableRestaurantIcon sx={ { fontSize: 16 } } /> }
							label={ `${ tables.length } table${ tables.length === 1 ? '' : 's' }` }
							sx={ { bgcolor: tokens.soft, color: tokens.ink2, fontWeight: 600 } }
						/>
						<Chip
							icon={ <EventSeatIcon sx={ { fontSize: 16 } } /> }
							label={ `${ totalSeats } covers` }
							sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600 } }
						/>
						<ToggleButtonGroup
							exclusive
							size="small"
							value={ viewMode }
							onChange={ ( e, v ) => v && setViewMode( v ) }
						>
							<ToggleButton value="plan"><GridViewIcon sx={ { fontSize: 16, mr: 0.5 } } /> Plan</ToggleButton>
							<ToggleButton value="list"><ViewListIcon sx={ { fontSize: 17, mr: 0.5 } } /> List</ToggleButton>
							<ToggleButton value="history"><HistoryIcon sx={ { fontSize: 17, mr: 0.5 } } /> History</ToggleButton>
						</ToggleButtonGroup>
					</>
				}
			/>

			<PageTour
				id="floor"
				title="Designing your floor"
				points={ [
					'Add a zone (a room or area), then “Add table” and drag tables to match your real layout.',
					'Click a table to set seats, party sizes, shape and zone — or mark it Out of service.',
					'“Join tables” groups tables that push together for bigger parties.',
					'Switch to List view for a quick overview; availability is worked out from all this.',
				] }
			/>

			{ viewMode === 'plan' && (
			<>
			{ /* Zone tabs + management */ }
			<Stack direction="row" alignItems="center" gap={ 1 } flexWrap="wrap" sx={ { mt: 2, mb: 1.5 } }>
				{ zones.map( ( z ) => {
					const active = z.id === zone;
					return (
						<Chip
							key={ z.id }
							label={ z.name }
							onClick={ () => { setZone( z.id ); setSelectedId( null ); } }
							onDelete={ z.id !== 0 ? () => askDeleteZone( z.id ) : undefined }
							deleteIcon={ z.id !== 0 ? <CloseIcon /> : undefined }
							variant={ active ? 'filled' : 'outlined' }
							sx={ {
								fontWeight: 600,
								borderRadius: 999,
								px: 0.5,
								...( active
									? {
										background: `linear-gradient(180deg, #5a52ea 0%, ${ tokens.accent } 100%)`,
										color: '#fff',
										boxShadow: '0 1px 2.5px rgba(79,70,229,.35)',
									}
									: { bgcolor: tokens.surface, color: tokens.ink2, borderColor: tokens.border2 } ),
								'& .MuiChip-deleteIcon': { color: active ? 'rgba(255,255,255,0.7)' : tokens.muted2 },
							} }
						/>
					);
				} ) }
				<Stack direction="row" spacing={ 0.5 } alignItems="center">
					<TextField
						placeholder="Add zone (e.g. Terrace)"
						value={ newArea }
						onChange={ ( e ) => setNewArea( e.target.value ) }
						onKeyDown={ ( e ) => e.key === 'Enter' && addArea() }
						sx={ { width: 170 } }
					/>
					<Button size="small" startIcon={ <AddIcon /> } onClick={ addArea } disabled={ busy || ! newArea.trim() }>
						Zone
					</Button>
				</Stack>
			</Stack>

			{ noZones ? (
				<EmptyState
					icon={ <TableRestaurantIcon /> }
					title="Add a zone to start"
					description="A zone is a room or area — Main Restaurant, Terrace, Bar. Then drop your tables in."
				/>
			) : (
				<Stack direction="row" spacing={ 2 } alignItems="flex-start">
					<Box sx={ { flex: 1, minWidth: 0 } }>
						<Stack direction="row" justifyContent="space-between" alignItems="center" sx={ { mb: 1 } }>
							<Typography sx={ { fontSize: 13, color: tokens.muted } }>
								{ joinMode
									? 'Click tables to join them together'
									: `${ zoneTables.length } table${ zoneTables.length === 1 ? '' : 's' } in this zone · drag to arrange` }
							</Typography>
							<Stack direction="row" spacing={ 1 }>
								{ joinMode ? (
									<>
										<Button size="small" variant="contained" onClick={ createCombo } disabled={ joinSel.length < 2 }>
											Join { joinSel.length || '' } tables
										</Button>
										<Button size="small" onClick={ () => { setJoinMode( false ); setJoinSel( [] ); } } sx={ { color: tokens.muted } }>
											Cancel
										</Button>
									</>
								) : (
									<>
										<Button
											size="small"
											startIcon={ <JoinFullIcon /> }
											onClick={ () => { setJoinMode( true ); setSelectedId( null ); setJoinSel( [] ); } }
											disabled={ zoneTables.length < 2 }
											sx={ { color: tokens.accent } }
										>
											Join tables
										</Button>
										<Button size="small" variant="outlined" startIcon={ <AddIcon /> } onClick={ addTable }>
											Add table
										</Button>
									</>
								) }
							</Stack>
						</Stack>
						<Box
							ref={ canvasRef }
							onPointerDown={ ( e ) => { if ( e.target === canvasRef.current ) { setSelectedId( null ); } } }
							sx={ {
								position: 'relative',
								height: CANVAS_H,
								borderRadius: '12px',
								border: `1px solid ${ joinMode ? tokens.accent : tokens.border }`,
								boxShadow: joinMode ? `0 0 0 3px ${ tokens.accentSoft }` : `inset 0 1px 3px rgba(24,24,27,.03)`,
								bgcolor: '#fbfbfd',
								backgroundImage: `radial-gradient(${ tokens.border2 } 1px, transparent 1px)`,
								backgroundSize: '22px 22px',
								backgroundPosition: '11px 11px',
								overflow: 'hidden',
								touchAction: 'none',
								transition: 'border-color .2s ease, box-shadow .2s ease',
							} }
						>
							{ zoneTables.length === 0 && (
								<Box sx={ { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.muted2, fontSize: 14, pointerEvents: 'none' } }>
									No tables here yet — click “Add table”.
								</Box>
							) }
							{ zoneTables.map( ( t ) => {
								const s = dims( t.shape );
								const isSel = ! joinMode && t.id === selectedId;
								const isPicked = joinMode && joinSel.includes( t.id );
								const inCombo = joinedIds.has( t.id );
								const isMaint = 'maintenance' === t.status;
								// Colour a joined table to match its combo(s) — a table in two
								// joins blends both soft tints so you can see the grouping.
								const tTints = inCombo ? tintsForTable( t.id ) : [];
								const joinBg = tTints.length > 1
									? `linear-gradient(135deg, ${ tTints.map( ( x ) => x.bg ).join( ', ' ) })`
									: tTints.length === 1 ? tTints[ 0 ].bg : null;
								const joinFg = tTints.length ? tTints[ 0 ].fg : null;
								return (
									<Box
										key={ t.id }
										onPointerDown={ ( e ) => onPointerDown( e, t ) }
										onPointerMove={ onPointerMove }
										onPointerUp={ onPointerUp }
										onClick={ () => { if ( joinMode ) { toggleJoinPick( t.id ); } } }
										sx={ {
											position: 'absolute',
											left: t.x,
											top: t.y,
											width: s.w,
											height: s.h,
											transform: `rotate(${ t.rotation || 0 }deg)`,
											borderRadius: s.radius,
											background: isPicked ? tokens.accent : isSel ? tokens.accentSoft : isMaint ? tokens.soft : ( joinBg || tokens.surface ),
											border: `${ isPicked ? '2px dashed' : isSel ? '2px solid' : isMaint ? '1.5px dashed' : '1.5px solid' } ${ isPicked || isSel ? tokens.accent : isMaint ? tokens.amber : ( joinFg || tokens.border2 ) }`,
											opacity: isMaint && ! isSel ? 0.72 : 1,
											boxShadow: isPicked
												? '0 4px 12px rgba(79,70,229,.35)'
												: isSel
													? `0 0 0 3px ${ tokens.accentSoft }, ${ tokens.shadowSm }`
													: tokens.shadowSm,
											cursor: joinMode ? 'pointer' : 'grab',
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											justifyContent: 'center',
											lineHeight: 1.1,
											userSelect: 'none',
											transition: 'box-shadow .15s ease, background-color .15s ease',
											'&:hover': { boxShadow: isPicked ? '0 4px 12px rgba(79,70,229,.35)' : tokens.shadowMd },
											'&:active': { cursor: joinMode ? 'pointer' : 'grabbing' },
										} }
									>
										{ /* Orientation pip — sits on the "top" edge and rotates WITH the
										     table (it is NOT counter-rotated like the label), so you can
										     tell which way a table faces even when it's round/square. */ }
										<Box
											aria-hidden="true"
											sx={ {
												position: 'absolute',
												top: 4,
												left: '50%',
												transform: 'translateX(-50%)',
												width: 18,
												height: 4,
												borderRadius: 2,
												bgcolor: isPicked ? 'rgba(255,255,255,0.9)' : isSel ? tokens.accent : tokens.muted2,
												opacity: isPicked || isSel ? 1 : 0.65,
											} }
										/>
										<Box sx={ { transform: `rotate(${ -( t.rotation || 0 ) }deg)`, textAlign: 'center' } }>
											<Typography sx={ { fontSize: 12, fontWeight: 650, color: isPicked ? '#fff' : tokens.ink } }>{ t.name }</Typography>
											<Typography sx={ { fontSize: 10, fontWeight: 550, color: isPicked ? 'rgba(255,255,255,0.85)' : isSel ? tokens.accentDark : tokens.muted } }>
												{ t.seats } seats
											</Typography>
										</Box>
										{ inCombo && ! joinMode && (
											<Box
												sx={ {
													position: 'absolute',
													top: -5,
													right: -5,
													width: 16,
													height: 16,
													borderRadius: '50%',
													background: tTints.length > 1
														? `linear-gradient(135deg, ${ tTints.map( ( x ) => x.fg ).join( ', ' ) })`
														: ( joinFg || tokens.accent ),
													border: '1.5px solid #fff',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
												} }
											>
												<LinkIcon sx={ { fontSize: 9, color: '#fff' } } />
											</Box>
										) }
										{ isMaint && (
											<Box
												sx={ {
													position: 'absolute',
													top: -5,
													left: -5,
													width: 16,
													height: 16,
													borderRadius: '50%',
													bgcolor: tokens.amber,
													border: '1.5px solid #fff',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
												} }
											>
												<BuildIcon sx={ { fontSize: 9, color: '#fff' } } />
											</Box>
										) }
									</Box>
								);
							} ) }
						</Box>

						{ /* Combinations list */ }
						{ combos.length > 0 && (
							<Box sx={ { mt: 2 } }>
								<Typography variant="subtitle2" sx={ { color: tokens.ink2, mb: 1 } }>
									Table combinations
									<Typography component="span" sx={ { color: tokens.muted2, fontWeight: 600, ml: 1 } }>
										offered top-first when no single table fits
									</Typography>
								</Typography>
								<Stack spacing={ 1 }>
									{ combos.map( ( c, i ) => {
										const seats = c.tables.reduce( ( s, id ) => s + ( byId[ id ]?.seats || 0 ), 0 );
										const tint = comboTints[ i ] || TINTS[ 0 ];
										return (
											<Stack
												key={ c.id }
												direction="row"
												spacing={ 1.5 }
												alignItems="center"
												sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderLeft: `4px solid ${ tint.fg }`, borderRadius: '12px', p: 1.25 } }
											>
												<Stack spacing={ 0 } sx={ { pr: 0.5 } }>
													<IconButton size="small" onClick={ () => moveCombo( i, -1 ) } disabled={ i === 0 } sx={ { p: 0.1 } }>
														<ArrowUpwardIcon sx={ { fontSize: 14 } } />
													</IconButton>
													<IconButton size="small" onClick={ () => moveCombo( i, 1 ) } disabled={ i === combos.length - 1 } sx={ { p: 0.1 } }>
														<ArrowDownwardIcon sx={ { fontSize: 14 } } />
													</IconButton>
												</Stack>
												<JoinFullIcon sx={ { color: tint.fg, fontSize: 18 } } />
												<Stack direction="row" spacing={ 0.5 } flexWrap="wrap" sx={ { flex: 1 } } useFlexGap>
													{ c.tables.map( ( id ) => (
														<Chip key={ id } label={ byId[ id ]?.name || `#${ id }` } size="small" sx={ { bgcolor: tint.bg, color: tint.fg, fontWeight: 700 } } />
													) ) }
													<Chip label={ `${ seats } seats` } size="small" sx={ { bgcolor: tint.bg, color: tint.fg, fontWeight: 700 } } />
												</Stack>
												<TextField
													label="Min"
													type="number"
													size="small"
													value={ c.min }
													onChange={ ( e ) => patchCombo( c.id, { min: Math.max( 1, parseInt( e.target.value, 10 ) || 1 ) } ) }
													sx={ { width: 74 } }
												/>
												<TextField
													label="Max"
													type="number"
													size="small"
													value={ c.max }
													onChange={ ( e ) => patchCombo( c.id, { max: Math.max( 1, parseInt( e.target.value, 10 ) || 1 ) } ) }
													sx={ { width: 74 } }
												/>
												<Tooltip title="Delete combination">
													<IconButton size="small" onClick={ () => removeCombo( c.id ) } sx={ { color: tokens.muted2 } }>
														<DeleteOutlineIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											</Stack>
										);
									} ) }
								</Stack>
							</Box>
						) }
					</Box>

					{ selected && ! joinMode && (
						<TableProps
							table={ selected }
							areas={ areas }
							onChange={ ( patch ) => patchTable( selected.id, patch ) }
							onChangeZone={ ( areaId ) => changeTableZone( selected.id, areaId ) }
							onDelete={ () => askDeleteTable( selected.id ) }
							onClose={ () => setSelectedId( null ) }
						/>
					) }
				</Stack>
			) }
			</>
			) }

			{ viewMode === 'list' && (
				<Stack direction="row" spacing={ 2 } alignItems="flex-start">
					<Box sx={ { flex: 1, minWidth: 0 } }>
						<FloorListView zones={ zones } tables={ tables } combos={ combos } selectedId={ selectedId } onSelect={ setSelectedId } />
					</Box>
					{ selected && (
						<TableProps
							table={ selected }
							areas={ areas }
							onChange={ ( patch ) => patchTable( selected.id, patch ) }
							onChangeZone={ ( areaId ) => changeTableZone( selected.id, areaId ) }
							onDelete={ () => askDeleteTable( selected.id ) }
							onClose={ () => setSelectedId( null ) }
						/>
					) }
				</Stack>
			) }

			{ viewMode === 'history' && (
				<FloorHistoryView
					history={ history }
					busy={ historyBusy }
					onRestoreZone={ restoreZone }
					onRestoreTable={ restoreVoidTable }
				/>
			) }

			{ viewMode !== 'history' && (
				<>
					<Divider sx={ { my: 3 } } />
					<Typography sx={ { fontSize: 13, color: tokens.muted } }>
						Tip: <strong>Join tables</strong> for parties too big for one table — set the combined
						min/max covers, and the order decides which join is offered first (put your best fit at the
						top). A booked join blocks all its tables.
					</Typography>
				</>
			) }

			<ConfirmDialog
				open={ !! zoneDel }
				title={ zoneDel ? `Delete “${ zoneDel.name }”?` : '' }
				message={
					! zoneDel
						? ''
						: zoneDel.loading
							? 'Checking what this zone contains…'
							: zoneDel.tables.length
								? `This zone has ${ zoneDel.tables.length } table${ zoneDel.tables.length === 1 ? '' : 's' } (${ zoneDel.tables.reduce( ( s, t ) => s + ( t.seats || 0 ), 0 ) } covers). Choose what happens to them.`
								: 'This zone is empty — deleting it can’t be undone.'
				}
				confirmLabel="Delete zone"
				busy={ zoneDelBusy }
				confirmDisabled={ !! zoneDel && zoneDel.loading }
				onCancel={ () => setZoneDel( null ) }
				onConfirm={ confirmDeleteZone }
				details={
					zoneDel ? (
						<Stack spacing={ 1.25 }>
							{ ! zoneDel.loading && zoneDel.tables.length > 0 && (
								<>
									<TextField
										select
										label="What happens to the tables?"
										size="small"
										value={ moveTo }
										onChange={ ( e ) => setMoveTo( Number( e.target.value ) ) }
										fullWidth
									>
										<MenuItem value={ 0 }>Move them to Unzoned</MenuItem>
										{ areas.filter( ( a ) => a.id !== zoneDel.id ).map( ( a ) => (
											<MenuItem key={ a.id } value={ a.id }>Move them to { a.name }</MenuItem>
										) ) }
										<MenuItem value={ -1 }>
											Delete the { zoneDel.tables.length } table{ zoneDel.tables.length === 1 ? '' : 's' } too
										</MenuItem>
									</TextField>
									{ moveTo === -1 && (
										<ReassignList
											upcoming={ zoneDel.upcoming }
											reassign={ reassign }
											onSet={ ( bid, tid ) => setReassign( ( r ) => ( { ...r, [ bid ]: tid } ) ) }
											onAuto={ () => autoAssign( zoneDel.upcoming ) }
											onKeep={ () => keepAll( zoneDel.upcoming ) }
										/>
									) }
								</>
							) }
							{ zoneDel.error && (
								<Typography sx={ { fontSize: 13, color: tokens.red } }>{ zoneDel.error }</Typography>
							) }
						</Stack>
					) : null
				}
			/>

			<ConfirmDialog
				open={ !! tableDel }
				title={ tableDel ? `Delete “${ tableDel.name }”?` : '' }
				message={
					! tableDel
						? ''
						: tableDel.loading
							? 'Checking for upcoming bookings…'
							: 'The table is removed from the plan but kept in History, so you can restore it later.'
				}
				confirmLabel="Delete table"
				busy={ tableDelBusy }
				confirmDisabled={ !! tableDel && tableDel.loading }
				onCancel={ () => setTableDel( null ) }
				onConfirm={ confirmDeleteTable }
				details={
					tableDel ? (
						<Stack spacing={ 1.25 }>
							{ tableDel.joins && tableDel.joins.length > 0 && (
								<Typography sx={ { fontSize: 12.5, color: tokens.ink2 } }>
									Joined in { tableDel.joins.join( ', ' ) } — deleting it breaks that join.
								</Typography>
							) }
							{ ! tableDel.loading && tableDel.upcoming.length > 0 && (
								<ReassignList
									upcoming={ tableDel.upcoming }
									reassign={ reassign }
									onSet={ ( bid, tid ) => setReassign( ( r ) => ( { ...r, [ bid ]: tid } ) ) }
									onAuto={ () => autoAssign( tableDel.upcoming ) }
									onKeep={ () => keepAll( tableDel.upcoming ) }
								/>
							) }
							{ tableDel.error && (
								<Typography sx={ { fontSize: 13, color: tokens.red } }>{ tableDel.error }</Typography>
							) }
						</Stack>
					) : null
				}
			/>
		</Page>
	);
}

// Section → tables list: each zone is a collapsible group (like menu sections →
// dishes), for quickly scanning/finding tables without the spatial canvas.
function FloorListView( { zones, tables, combos, selectedId, onSelect } ) {
	const [ collapsed, setCollapsed ] = useState( {} );
	const joinedIds = new Set( combos.flatMap( ( c ) => c.tables ) );
	const toggle = ( id ) => setCollapsed( ( c ) => ( { ...c, [ id ]: ! c[ id ] } ) );

	if ( ! zones.length ) {
		return <Typography sx={ { fontSize: 13, color: tokens.muted } }>Add a zone and some tables to see them here.</Typography>;
	}

	return (
		<Stack spacing={ 1.5 }>
			{ zones.map( ( z ) => {
				const zt = tables.filter( ( t ) => ( t.areaId || 0 ) === z.id );
				const seats = zt.reduce( ( s, t ) => s + ( t.seats || 0 ), 0 );
				const open = ! collapsed[ z.id ];
				return (
					<Box key={ z.id } sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', overflow: 'hidden', bgcolor: tokens.surface } }>
						<Stack
							direction="row"
							alignItems="center"
							spacing={ 1 }
							onClick={ () => toggle( z.id ) }
							sx={ { px: 1.5, py: 1.25, cursor: 'pointer', bgcolor: tokens.soft } }
						>
							<KeyboardArrowDownIcon sx={ { fontSize: 20, color: tokens.muted, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' } } />
							<Typography sx={ { fontWeight: 700, color: tokens.ink, flex: 1 } }>{ z.name }</Typography>
							<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>
								{ zt.length } table{ zt.length === 1 ? '' : 's' } · { seats } covers
							</Typography>
						</Stack>
						<Collapse in={ open } unmountOnExit>
							{ zt.length === 0 ? (
								<Typography sx={ { fontSize: 13, color: tokens.muted2, px: 2, py: 1.5 } }>No tables in this zone.</Typography>
							) : (
								zt.map( ( t ) => (
									<Stack
										key={ t.id }
										direction="row"
										alignItems="center"
										spacing={ 1.5 }
										onClick={ () => onSelect( t.id ) }
										sx={ {
											px: 2,
											py: 1,
											cursor: 'pointer',
											borderTop: `1px solid ${ tokens.border }`,
											bgcolor: t.id === selectedId ? tokens.accentSoft : 'transparent',
											'&:hover': { bgcolor: t.id === selectedId ? tokens.accentSoft : tokens.soft },
										} }
									>
										<Typography sx={ { fontWeight: 650, color: tokens.ink, width: 90 } }>{ t.name }</Typography>
										<Typography sx={ { fontSize: 13, color: tokens.muted, flex: 1 } }>
											{ t.seats } seats · party { t.min }–{ t.max } · { ( SHAPES[ t.shape ] || SHAPES.round ).label }
										</Typography>
										{ joinedIds.has( t.id ) && (
											<Chip icon={ <LinkIcon sx={ { fontSize: 14 } } /> } label="Joined" size="small" sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600, height: 22 } } />
										) }
										{ 'maintenance' === t.status && (
											<Chip icon={ <BuildIcon sx={ { fontSize: 13 } } /> } label="Out of service" size="small" sx={ { bgcolor: tokens.amberSoft, color: tokens.amber, fontWeight: 600, height: 22 } } />
										) }
									</Stack>
								) )
							) }
						</Collapse>
					</Box>
				);
			} ) }
		</Stack>
	);
}

function TableProps( { table, areas, onChange, onChangeZone, onDelete, onClose } ) {
	const num = ( label, key, min = 1 ) => (
		<TextField
			label={ label }
			type="number"
			size="small"
			value={ table[ key ] }
			onChange={ ( e ) => onChange( { [ key ]: Math.max( min, parseInt( e.target.value, 10 ) || min ) } ) }
			inputProps={ { min } }
			fullWidth
		/>
	);
	return (
		<Box sx={ { width: 264, flexShrink: 0, bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '12px', p: 2, boxShadow: tokens.shadowMd } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1.5 } }>
				<Typography sx={ { color: tokens.ink, fontWeight: 650, fontSize: 14 } }>Table settings</Typography>
				<IconButton size="small" onClick={ onClose } sx={ { color: tokens.muted2 } }>
					<CloseIcon fontSize="small" />
				</IconButton>
			</Stack>
			<Stack spacing={ 1.5 }>
				<TextField
					label="Name"
					size="small"
					value={ table.name }
					onChange={ ( e ) => onChange( { name: e.target.value } ) }
					fullWidth
				/>
				{ num( 'Seats', 'seats' ) }
				<Stack direction="row" spacing={ 1 }>
					{ num( 'Min party', 'min' ) }
					{ num( 'Max party', 'max' ) }
				</Stack>
				<TextField
					select
					label="Shape"
					size="small"
					value={ table.shape || 'round' }
					onChange={ ( e ) => onChange( { shape: e.target.value } ) }
					fullWidth
				>
					{ Object.entries( SHAPES ).map( ( [ key, s ] ) => (
						<MenuItem key={ key } value={ key }>{ s.label }</MenuItem>
					) ) }
				</TextField>
				{ /* flex-end so the rotate button lines up with the select BOX, not the
				     centre of the whole field (whose label adds height above it). */ }
				<Stack direction="row" spacing={ 1 } alignItems="flex-end">
					<TextField
						select
						label="Zone"
						size="small"
						value={ table.areaId || 0 }
						onChange={ ( e ) => onChangeZone( Number( e.target.value ) ) }
						sx={ { flex: 1 } }
					>
						<MenuItem value={ 0 }>Unzoned</MenuItem>
						{ areas.map( ( a ) => <MenuItem key={ a.id } value={ a.id }>{ a.name }</MenuItem> ) }
					</TextField>
					<Tooltip title="Rotate 90°">
						<IconButton
							onClick={ () => onChange( { rotation: ( ( table.rotation || 0 ) + 90 ) % 360 } ) }
							sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, width: 40, height: 40 } }
						>
							<Rotate90DegreesCwIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Stack>
				<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { bgcolor: tokens.soft, borderRadius: 2, px: 1.25, py: 0.5 } }>
					<Stack direction="row" alignItems="center" spacing={ 0.75 }>
						<BuildIcon sx={ { fontSize: 16, color: 'maintenance' === table.status ? tokens.amber : tokens.muted2 } } />
						<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.ink2 } }>Out of service</Typography>
					</Stack>
					<Switch
						size="small"
						checked={ 'maintenance' === table.status }
						onChange={ ( e ) => onChange( { status: e.target.checked ? 'maintenance' : 'active' } ) }
					/>
				</Stack>
				<Button
					color="error"
					size="small"
					startIcon={ <DeleteOutlineIcon /> }
					onClick={ onDelete }
					sx={ { justifyContent: 'flex-start' } }
				>
					Delete table
				</Button>
			</Stack>
		</Box>
	);
}

// Per-booking reassignment shown when deleting table(s): each upcoming booking
// gets a best-fit target (from the availability engine) or can be kept with the
// voided table (it lives on in History with it).
function ReassignList( { upcoming, reassign, onSet, onAuto, onKeep } ) {
	if ( ! upcoming || ! upcoming.length ) {
		return null;
	}
	const anyStranded = upcoming.some( ( b ) => ! ( b.candidates && b.candidates.length ) );
	return (
		<Box sx={ { bgcolor: tokens.soft, border: `1px solid ${ tokens.border }`, borderRadius: '10px', p: 1.25 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 0.75 } }>
				<Typography sx={ { fontSize: 13, fontWeight: 700, color: tokens.ink2 } }>
					{ upcoming.length } upcoming booking{ upcoming.length === 1 ? '' : 's' } to move
				</Typography>
				<Stack direction="row" spacing={ 0.5 }>
					<Button size="small" variant="text" onClick={ onAuto } sx={ { color: tokens.accent, minWidth: 0 } }>Auto-assign</Button>
					<Button size="small" variant="text" onClick={ onKeep } sx={ { color: tokens.muted, minWidth: 0 } }>Keep all</Button>
				</Stack>
			</Stack>
			<Stack spacing={ 1 }>
				{ upcoming.map( ( b ) => (
					<Stack key={ b.id } direction="row" spacing={ 1 } alignItems="flex-end">
						<Box sx={ { flex: 1, minWidth: 0 } }>
							<Typography sx={ { fontSize: 12.5, fontWeight: 650, color: tokens.ink } }>
								{ b.tableName } · { b.date } { b.time }
							</Typography>
							<Typography sx={ { fontSize: 11.5, color: tokens.muted } }>
								party of { b.party }{ b.name ? ` · ${ b.name }` : '' }
							</Typography>
						</Box>
						<TextField
							select
							size="small"
							label="Move to"
							value={ reassign[ b.id ] ?? 0 }
							onChange={ ( e ) => onSet( b.id, Number( e.target.value ) ) }
							sx={ { width: 156 } }
						>
							<MenuItem value={ 0 }>Keep (void with table)</MenuItem>
							{ ( b.candidates || [] ).map( ( c ) => (
								<MenuItem key={ c.id } value={ c.id }>{ c.name } · { c.seats } seats</MenuItem>
							) ) }
						</TextField>
					</Stack>
				) ) }
			</Stack>
			{ anyStranded && (
				<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 0.75 } }>
					A booking with no free table at its time can only be kept — it stays on the voided table until you rebook it.
				</Typography>
			) }
		</Box>
	);
}

// History tab: voided zones and tables, newest first, each restorable in one click.
function FloorHistoryView( { history, busy, onRestoreZone, onRestoreTable } ) {
	if ( busy && ! history ) {
		return <Typography sx={ { fontSize: 13, color: tokens.muted, mt: 2 } }>Loading…</Typography>;
	}
	const zones = history?.zones || [];
	const voidTables = history?.tables || [];
	if ( ! zones.length && ! voidTables.length ) {
		return (
			<Box sx={ { mt: 2 } }>
				<EmptyState
					icon={ <HistoryIcon /> }
					title="Nothing deleted yet"
					description="Deleted zones and tables show up here — bring any of them back with one click."
				/>
			</Box>
		);
	}
	const when = ( ts ) => ( ts ? new Date( ts * 1000 ).toLocaleDateString() : '' );
	const Row = ( { icon, title, sub, onRestore } ) => (
		<Stack direction="row" alignItems="center" spacing={ 1.5 } sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '12px', p: 1.25 } }>
			{ icon }
			<Box sx={ { flex: 1, minWidth: 0 } }>
				<Typography sx={ { fontSize: 13.5, fontWeight: 650, color: tokens.ink } }>{ title }</Typography>
				<Typography sx={ { fontSize: 12, color: tokens.muted } }>{ sub }</Typography>
			</Box>
			<Button size="small" variant="outlined" startIcon={ <RestoreIcon sx={ { fontSize: 16 } } /> } onClick={ onRestore }>
				Restore
			</Button>
		</Stack>
	);
	return (
		<Stack spacing={ 2 } sx={ { mt: 2 } }>
			{ zones.length > 0 && (
				<Box>
					<Typography variant="subtitle2" sx={ { color: tokens.ink2, mb: 1 } }>Deleted zones</Typography>
					<Stack spacing={ 1 }>
						{ zones.map( ( z ) => (
							<Row
								key={ z.id }
								icon={ <TableRestaurantIcon sx={ { color: tokens.accent, fontSize: 20 } } /> }
								title={ z.name }
								sub={ `Deleted ${ when( z.voidedAt ) }` }
								onRestore={ () => onRestoreZone( z.id ) }
							/>
						) ) }
					</Stack>
				</Box>
			) }
			{ voidTables.length > 0 && (
				<Box>
					<Typography variant="subtitle2" sx={ { color: tokens.ink2, mb: 1 } }>Deleted tables</Typography>
					<Stack spacing={ 1 }>
						{ voidTables.map( ( t ) => (
							<Row
								key={ t.id }
								icon={ <EventSeatIcon sx={ { color: tokens.muted, fontSize: 20 } } /> }
								title={ t.name }
								sub={ `${ t.seats } seats${ t.zone ? ` · was in ${ t.zone }` : '' } · deleted ${ when( t.voidedAt ) }` }
								onRestore={ () => onRestoreTable( t.id ) }
							/>
						) ) }
					</Stack>
				</Box>
			) }
			<Typography sx={ { fontSize: 12, color: tokens.muted2 } }>
				Restoring a table whose old zone is gone brings it back Unzoned. Restoring a zone brings back the empty zone — restore its tables separately.
			</Typography>
		</Stack>
	);
}
