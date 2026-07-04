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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import CloseIcon from '@mui/icons-material/Close';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import LinkIcon from '@mui/icons-material/Link';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import { ListSkeleton } from './ui/Skeletons';

// Canvas geometry.
const CANVAS_H = 560;
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

	const canvasRef = useRef( null );
	const drag = useRef( null );
	const saveLater = useDebouncedSaver();

	useEffect( () => {
		api.getFloor()
			.then( ( data ) => {
				setAreas( data.areas || [] );
				setTables( data.tables || [] );
				setCombos( data.combos || [] );
				if ( ( data.areas || [] ).length ) {
					setZone( data.areas[ 0 ].id );
				}
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	const totalSeats = useMemo( () => tables.reduce( ( s, t ) => s + ( t.seats || 0 ), 0 ), [ tables ] );
	const unzonedCount = useMemo( () => tables.filter( ( t ) => ! ( t.areaId || 0 ) ).length, [ tables ] );
	const byId = useMemo( () => Object.fromEntries( tables.map( ( t ) => [ t.id, t ] ) ), [ tables ] );
	const joinedIds = useMemo( () => new Set( combos.flatMap( ( c ) => c.tables ) ), [ combos ] );

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
	const removeArea = async ( id ) => {
		await api.deleteArea( id );
		setAreas( ( a ) => a.filter( ( x ) => x.id !== id ) );
		setTables( ( t ) => t.map( ( x ) => ( x.areaId === id ? { ...x, areaId: 0, area: '' } : x ) ) );
		if ( zone === id ) {
			setZone( areas.find( ( a ) => a.id !== id )?.id || 0 );
		}
	};

	/* ---- tables ---- */
	const addTable = async () => {
		const n = tables.length + 1;
		const x = 40 + ( ( n - 1 ) % 6 ) * 80;
		const y = 40 + Math.floor( ( ( n - 1 ) % 18 ) / 6 ) * 90;
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

	const removeTable = async ( id ) => {
		await api.deleteTable( id );
		setTables( ( t ) => t.filter( ( x ) => x.id !== id ) );
		// Drop any combo that referenced it (server keeps the combo but it's now invalid); refresh locally.
		setCombos( ( cs ) => cs.filter( ( c ) => ! c.tables.includes( id ) ) );
		setSelectedId( null );
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
					</>
				}
			/>

			{ /* Zone tabs + management */ }
			<Stack direction="row" alignItems="center" gap={ 1 } flexWrap="wrap" sx={ { mt: 2, mb: 1.5 } }>
				{ zones.map( ( z ) => {
					const active = z.id === zone;
					return (
						<Chip
							key={ z.id }
							label={ z.name }
							onClick={ () => { setZone( z.id ); setSelectedId( null ); } }
							onDelete={ z.id !== 0 ? () => removeArea( z.id ) : undefined }
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
											bgcolor: isPicked ? tokens.accent : isSel ? tokens.accentSoft : tokens.surface,
											border: `${ isPicked ? '2px dashed' : isSel ? '2px solid' : '1.5px solid' } ${ isPicked || isSel ? tokens.accent : tokens.border2 }`,
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
													bgcolor: tokens.accent,
													border: '1.5px solid #fff',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
												} }
											>
												<LinkIcon sx={ { fontSize: 9, color: '#fff' } } />
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
										return (
											<Stack
												key={ c.id }
												direction="row"
												spacing={ 1.5 }
												alignItems="center"
												sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '12px', p: 1.25 } }
											>
												<Stack spacing={ 0 } sx={ { pr: 0.5 } }>
													<IconButton size="small" onClick={ () => moveCombo( i, -1 ) } disabled={ i === 0 } sx={ { p: 0.1 } }>
														<ArrowUpwardIcon sx={ { fontSize: 14 } } />
													</IconButton>
													<IconButton size="small" onClick={ () => moveCombo( i, 1 ) } disabled={ i === combos.length - 1 } sx={ { p: 0.1 } }>
														<ArrowDownwardIcon sx={ { fontSize: 14 } } />
													</IconButton>
												</Stack>
												<JoinFullIcon sx={ { color: tokens.accent, fontSize: 18 } } />
												<Stack direction="row" spacing={ 0.5 } flexWrap="wrap" sx={ { flex: 1 } } useFlexGap>
													{ c.tables.map( ( id ) => (
														<Chip key={ id } label={ byId[ id ]?.name || `#${ id }` } size="small" sx={ { bgcolor: tokens.soft, fontWeight: 700 } } />
													) ) }
													<Chip label={ `${ seats } seats` } size="small" sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 700 } } />
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
							onDelete={ () => removeTable( selected.id ) }
							onClose={ () => setSelectedId( null ) }
						/>
					) }
				</Stack>
			) }

			<Divider sx={ { my: 3 } } />
			<Typography sx={ { fontSize: 13, color: tokens.muted } }>
				Tip: <strong>Join tables</strong> for parties too big for one table — set the combined
				min/max covers, and the order decides which join is offered first (put your best fit at the
				top). A booked join blocks all its tables.
			</Typography>
		</Page>
	);
}

function TableProps( { table, areas, onChange, onDelete, onClose } ) {
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
				<Stack direction="row" spacing={ 1 } alignItems="center">
					<TextField
						select
						label="Zone"
						size="small"
						value={ table.areaId || 0 }
						onChange={ ( e ) => onChange( { area: Number( e.target.value ) } ) }
						sx={ { flex: 1 } }
					>
						<MenuItem value={ 0 }>Unzoned</MenuItem>
						{ areas.map( ( a ) => <MenuItem key={ a.id } value={ a.id }>{ a.name }</MenuItem> ) }
					</TextField>
					<Tooltip title="Rotate 90°">
						<IconButton
							onClick={ () => onChange( { rotation: ( ( table.rotation || 0 ) + 90 ) % 360 } ) }
							sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2 } }
						>
							<Rotate90DegreesCwIcon fontSize="small" />
						</IconButton>
					</Tooltip>
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
