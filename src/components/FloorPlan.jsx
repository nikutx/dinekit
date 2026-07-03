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
	CircularProgress,
	Tooltip,
	Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import CloseIcon from '@mui/icons-material/Close';
import { tokens } from '../theme';
import { api } from '../api/client';

// Canvas geometry.
const CANVAS_H = 560;
const SNAP = 10;
const snap = ( v ) => Math.round( v / SNAP ) * SNAP;

// Table shapes and their pixel footprint.
const SHAPES = {
	round: { w: 62, h: 62, radius: '50%', label: 'Round' },
	square: { w: 62, h: 62, radius: 10, label: 'Square' },
	rect: { w: 104, h: 62, radius: 10, label: 'Rectangle' },
	bar: { w: 150, h: 42, radius: 10, label: 'Bar / bench' },
};
const dims = ( shape ) => SHAPES[ shape ] || SHAPES.round;

// Debounce persistence per table so dragging/typing doesn't hammer the API.
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
	const [ loading, setLoading ] = useState( true );
	const [ newArea, setNewArea ] = useState( '' );
	const [ zone, setZone ] = useState( 0 ); // active area id (0 = Unzoned)
	const [ selectedId, setSelectedId ] = useState( null );
	const [ busy, setBusy ] = useState( false );

	const canvasRef = useRef( null );
	const drag = useRef( null );
	const saveLater = useDebouncedSaver();

	useEffect( () => {
		api.getFloor()
			.then( ( data ) => {
				setAreas( data.areas || [] );
				setTables( data.tables || [] );
				if ( ( data.areas || [] ).length ) {
					setZone( data.areas[ 0 ].id );
				}
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	const totalSeats = useMemo( () => tables.reduce( ( s, t ) => s + ( t.seats || 0 ), 0 ), [ tables ] );
	const unzonedCount = useMemo( () => tables.filter( ( t ) => ! ( t.areaId || 0 ) ).length, [ tables ] );

	// Tabs: every area, plus an "Unzoned" tab only when it holds tables.
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
		// Stagger new tables so they don't stack.
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
		setSelectedId( null );
	};

	/* ---- drag ---- */
	const onPointerDown = ( e, table ) => {
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
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	const noZones = zones.length === 0;

	return (
		<Box sx={ { maxWidth: 1120, mx: 'auto' } }>
			<Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={ { mb: 1 } }>
				<Box>
					<Typography variant="h5">Floor Plan</Typography>
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>
						Arrange your real tables. Drag them into place and set how many each seats —
						availability is worked out from this.
					</Typography>
				</Box>
				<Stack direction="row" spacing={ 1 }>
					<Chip
						icon={ <TableRestaurantIcon sx={ { fontSize: 16 } } /> }
						label={ `${ tables.length } table${ tables.length === 1 ? '' : 's' }` }
						sx={ { bgcolor: tokens.soft, color: tokens.ink2, fontWeight: 700 } }
					/>
					<Chip
						icon={ <EventSeatIcon sx={ { fontSize: 16 } } /> }
						label={ `${ totalSeats } covers` }
						sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 700 } }
					/>
				</Stack>
			</Stack>

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
								fontWeight: 700,
								bgcolor: active ? tokens.accent : 'transparent',
								color: active ? '#fff' : tokens.ink2,
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
				<Box sx={ { border: `1px dashed ${ tokens.border2 }`, borderRadius: 3, p: 6, textAlign: 'center', color: tokens.muted } }>
					<Typography sx={ { fontWeight: 700, color: tokens.ink2 } }>Add a zone to start</Typography>
					<Typography sx={ { fontSize: 14, mt: 0.5 } }>
						A zone is a room or area — Main Restaurant, Terrace, Bar. Then drop your tables in.
					</Typography>
				</Box>
			) : (
				<Stack direction="row" spacing={ 2 } alignItems="flex-start">
					{ /* Canvas */ }
					<Box sx={ { flex: 1, minWidth: 0 } }>
						<Stack direction="row" justifyContent="space-between" alignItems="center" sx={ { mb: 1 } }>
							<Typography sx={ { fontSize: 13, color: tokens.muted } }>
								{ zoneTables.length } table{ zoneTables.length === 1 ? '' : 's' } in this zone · drag to arrange
							</Typography>
							<Button size="small" variant="outlined" startIcon={ <AddIcon /> } onClick={ addTable }>
								Add table
							</Button>
						</Stack>
						<Box
							ref={ canvasRef }
							onPointerDown={ ( e ) => { if ( e.target === canvasRef.current ) { setSelectedId( null ); } } }
							sx={ {
								position: 'relative',
								height: CANVAS_H,
								borderRadius: 3,
								border: `1px solid ${ tokens.border }`,
								bgcolor: tokens.surface,
								backgroundImage: `radial-gradient(${ tokens.border } 1px, transparent 1px)`,
								backgroundSize: '20px 20px',
								overflow: 'hidden',
								touchAction: 'none',
							} }
						>
							{ zoneTables.length === 0 && (
								<Box sx={ { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.muted2, fontSize: 14, pointerEvents: 'none' } }>
									No tables here yet — click “Add table”.
								</Box>
							) }
							{ zoneTables.map( ( t ) => {
								const s = dims( t.shape );
								const isSel = t.id === selectedId;
								return (
									<Box
										key={ t.id }
										onPointerDown={ ( e ) => onPointerDown( e, t ) }
										onPointerMove={ onPointerMove }
										onPointerUp={ onPointerUp }
										sx={ {
											position: 'absolute',
											left: t.x,
											top: t.y,
											width: s.w,
											height: s.h,
											transform: `rotate(${ t.rotation || 0 }deg)`,
											borderRadius: s.radius,
											bgcolor: isSel ? tokens.accentSoft : tokens.soft,
											border: `2px solid ${ isSel ? tokens.accent : tokens.border2 }`,
											boxShadow: isSel ? `0 0 0 3px ${ tokens.accentSoft }` : 'none',
											cursor: 'grab',
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											justifyContent: 'center',
											lineHeight: 1.1,
											userSelect: 'none',
											'&:active': { cursor: 'grabbing' },
										} }
									>
										{ /* Counter-rotate the label so text stays upright */ }
										<Box sx={ { transform: `rotate(${ -( t.rotation || 0 ) }deg)`, textAlign: 'center' } }>
											<Typography sx={ { fontSize: 12, fontWeight: 800, color: tokens.ink } }>{ t.name }</Typography>
											<Typography sx={ { fontSize: 10, fontWeight: 700, color: isSel ? tokens.accentDark : tokens.muted } }>
												{ t.seats } seats
											</Typography>
										</Box>
									</Box>
								);
							} ) }
						</Box>
					</Box>

					{ /* Properties panel */ }
					{ selected && (
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
				Tip: <strong>min / max party</strong> controls which tables a booking can use — a party of 2
				won’t be offered a 6-seater if you set its minimum higher. Joining tables for big parties is
				coming next.
			</Typography>
		</Box>
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
		<Box sx={ { width: 264, flexShrink: 0, bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: 3, p: 2 } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1.5 } }>
				<Typography variant="subtitle2" sx={ { color: tokens.ink } }>Table</Typography>
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
