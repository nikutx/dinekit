import React, { useEffect, useMemo, useState } from 'react';
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
import { tokens } from '../theme';
import { api } from '../api/client';

// Debounce a per-table save so typing seats/party doesn't hammer the API.
function useDebouncedSaver() {
	const timers = React.useRef( {} );
	return ( id, fn ) => {
		clearTimeout( timers.current[ id ] );
		timers.current[ id ] = setTimeout( fn, 450 );
	};
}

export default function FloorPlan() {
	const [ areas, setAreas ] = useState( [] );
	const [ tables, setTables ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ newArea, setNewArea ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const saveLater = useDebouncedSaver();

	useEffect( () => {
		api.getFloor()
			.then( ( data ) => {
				setAreas( data.areas || [] );
				setTables( data.tables || [] );
			} )
			.finally( () => setLoading( false ) );
	}, [] );

	const totalSeats = useMemo(
		() => tables.reduce( ( sum, t ) => sum + ( t.seats || 0 ), 0 ),
		[ tables ]
	);

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
		} finally {
			setBusy( false );
		}
	};

	const renameArea = ( id, name ) => {
		setAreas( ( a ) => a.map( ( x ) => ( x.id === id ? { ...x, name } : x ) ) );
		saveLater( 'area-' + id, () => api.updateArea( id, name ) );
	};

	const removeArea = async ( id ) => {
		await api.deleteArea( id );
		setAreas( ( a ) => a.filter( ( x ) => x.id !== id ) );
		// Tables in that area become unassigned locally (server already cleared the term).
		setTables( ( t ) => t.map( ( x ) => ( x.areaId === id ? { ...x, areaId: 0, area: '' } : x ) ) );
	};

	const addTable = async ( areaId ) => {
		const n = tables.length + 1;
		const table = await api.createTable( {
			name: 'T' + n,
			seats: 2,
			min: 1,
			max: 2,
			area: areaId || 0,
			order: n,
		} );
		setTables( ( t ) => [ ...t, table ] );
	};

	const patchTable = ( id, patch ) => {
		setTables( ( t ) => t.map( ( x ) => ( x.id === id ? { ...x, ...patch } : x ) ) );
		saveLater( 'table-' + id, () => api.updateTable( id, patch ) );
	};

	const removeTable = async ( id ) => {
		await api.deleteTable( id );
		setTables( ( t ) => t.filter( ( x ) => x.id !== id ) );
	};

	if ( loading ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	// Group tables: one bucket per area, plus an "Unassigned" bucket (areaId 0).
	const buckets = [
		...areas.map( ( a ) => ( { id: a.id, name: a.name } ) ),
		{ id: 0, name: 'Unassigned' },
	];
	const tablesIn = ( areaId ) => tables.filter( ( t ) => ( t.areaId || 0 ) === areaId );

	return (
		<Box sx={ { maxWidth: 960, mx: 'auto' } }>
			<Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={ { mb: 1 } }>
				<Box>
					<Typography variant="h5">Floor Plan</Typography>
					<Typography sx={ { color: tokens.muted, fontSize: 14, mt: 0.5 } }>
						Set up your zones, tables and how many guests each seats. Availability is worked
						out from this.
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

			{ /* Areas / zones */ }
			<Box
				sx={ {
					bgcolor: tokens.surface,
					border: `1px solid ${ tokens.border }`,
					borderRadius: 3,
					p: 2.5,
					mt: 2,
				} }
			>
				<Typography variant="subtitle2" sx={ { mb: 1.5, color: tokens.ink2 } }>
					Zones &amp; areas
				</Typography>
				<Stack direction="row" flexWrap="wrap" gap={ 1.25 } alignItems="center">
					{ areas.map( ( area ) => (
						<Stack
							key={ area.id }
							direction="row"
							alignItems="center"
							sx={ {
								bgcolor: tokens.soft,
								border: `1px solid ${ tokens.border }`,
								borderRadius: 2,
								pl: 1.25,
								pr: 0.5,
								py: 0.25,
							} }
						>
							<TextField
								variant="standard"
								value={ area.name }
								onChange={ ( e ) => renameArea( area.id, e.target.value ) }
								InputProps={ { disableUnderline: true } }
								sx={ { '& input': { fontWeight: 600, fontSize: 14, width: `${ Math.max( 6, area.name.length ) }ch` } } }
							/>
							<Tooltip title="Delete area">
								<IconButton size="small" onClick={ () => removeArea( area.id ) } sx={ { color: tokens.muted2 } }>
									<DeleteOutlineIcon sx={ { fontSize: 16 } } />
								</IconButton>
							</Tooltip>
						</Stack>
					) ) }
					<Stack direction="row" spacing={ 1 } alignItems="center">
						<TextField
							placeholder="New area, e.g. Terrace"
							value={ newArea }
							onChange={ ( e ) => setNewArea( e.target.value ) }
							onKeyDown={ ( e ) => e.key === 'Enter' && addArea() }
							sx={ { width: 180 } }
						/>
						<Button
							variant="outlined"
							size="small"
							startIcon={ <AddIcon /> }
							onClick={ addArea }
							disabled={ busy || ! newArea.trim() }
						>
							Add
						</Button>
					</Stack>
				</Stack>
			</Box>

			{ /* Tables grouped by area */ }
			<Stack spacing={ 2.5 } sx={ { mt: 3 } }>
				{ buckets.map( ( bucket ) => {
					const rows = tablesIn( bucket.id );
					// Hide the Unassigned bucket unless it actually holds tables.
					if ( bucket.id === 0 && rows.length === 0 ) {
						return null;
					}
					return (
						<Box key={ bucket.id }>
							<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1 } }>
								<Typography variant="subtitle2" sx={ { color: tokens.ink } }>
									{ bucket.name }
									<Typography component="span" sx={ { color: tokens.muted2, fontWeight: 600, ml: 1 } }>
										{ rows.length } table{ rows.length === 1 ? '' : 's' }
									</Typography>
								</Typography>
								<Button
									size="small"
									startIcon={ <AddIcon /> }
									onClick={ () => addTable( bucket.id ) }
									sx={ { color: tokens.accent } }
								>
									Add table
								</Button>
							</Stack>

							{ rows.length === 0 ? (
								<Box
									sx={ {
										border: `1px dashed ${ tokens.border2 }`,
										borderRadius: 2,
										p: 2,
										textAlign: 'center',
										color: tokens.muted2,
										fontSize: 13,
									} }
								>
									No tables here yet.
								</Box>
							) : (
								<Stack spacing={ 1 }>
									{ rows.map( ( t ) => (
										<TableRow
											key={ t.id }
											table={ t }
											areas={ areas }
											onChange={ ( patch ) => patchTable( t.id, patch ) }
											onDelete={ () => removeTable( t.id ) }
										/>
									) ) }
								</Stack>
							) }
						</Box>
					);
				} ) }
			</Stack>

			<Divider sx={ { my: 3 } } />
			<Typography sx={ { fontSize: 13, color: tokens.muted } }>
				<strong>Min / max party</strong> controls which tables a booking can use — a party of 2
				won&apos;t be offered a 6-seater if you set its minimum to 4. Leave the defaults if
				you&apos;re not sure.
			</Typography>
		</Box>
	);
}

function TableRow( { table, areas, onChange, onDelete } ) {
	const numField = ( label, key, min = 1 ) => (
		<TextField
			label={ label }
			type="number"
			value={ table[ key ] }
			onChange={ ( e ) => onChange( { [ key ]: Math.max( min, parseInt( e.target.value, 10 ) || min ) } ) }
			inputProps={ { min } }
			sx={ { width: 92 } }
		/>
	);

	return (
		<Stack
			direction="row"
			spacing={ 1.5 }
			alignItems="center"
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: 2,
				p: 1.5,
			} }
		>
			<TableRestaurantIcon sx={ { color: tokens.muted2, fontSize: 20 } } />
			<TextField
				label="Name"
				value={ table.name }
				onChange={ ( e ) => onChange( { name: e.target.value } ) }
				sx={ { width: 120 } }
			/>
			{ numField( 'Seats', 'seats' ) }
			{ numField( 'Min party', 'min' ) }
			{ numField( 'Max party', 'max' ) }
			<TextField
				select
				label="Area"
				value={ table.areaId || 0 }
				onChange={ ( e ) => onChange( { area: Number( e.target.value ) } ) }
				sx={ { minWidth: 140, flex: 1 } }
			>
				<MenuItem value={ 0 }>Unassigned</MenuItem>
				{ areas.map( ( a ) => (
					<MenuItem key={ a.id } value={ a.id }>
						{ a.name }
					</MenuItem>
				) ) }
			</TextField>
			<Tooltip title="Delete table">
				<IconButton size="small" onClick={ onDelete } sx={ { color: tokens.muted2 } }>
					<DeleteOutlineIcon fontSize="small" />
				</IconButton>
			</Tooltip>
		</Stack>
	);
}
