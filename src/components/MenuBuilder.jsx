import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Stack, Typography, TextField, InputAdornment, Chip, Alert } from '../ui';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	KeyboardSensor,
	closestCorners,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { tokens } from '../theme';
import SortableSection from './SortableSection';
import ItemRow from './ItemRow';
import ItemEditor from './ItemEditor';
import LiveMenuBanner from './LiveMenuBanner';
import MenuTabs from './MenuTabs';
import ArchivedDishes from './ArchivedDishes';
import ConfirmDialog from './ui/ConfirmDialog';
import { api } from '../api/client';

// Consequences the owner can't see from the menu screen: is this dish sitting on
// an order the kitchen is cooking right now, and how much history references it?
function ArchiveUsage( { usage } ) {
	if ( ! usage ) {
		return (
			<Typography sx={ { fontSize: 12.5, color: tokens.muted2 } }>Checking orders…</Typography>
		);
	}
	if ( ! usage.total ) {
		return (
			<Typography sx={ { fontSize: 12.5, color: tokens.muted2 } }>
				No orders have ever included this dish.
			</Typography>
		);
	}
	const live = usage.live > 0;
	return (
		<Box
			sx={ {
				p: 1.5,
				borderRadius: '10px',
				border: `1px solid ${ live ? tokens.amber : tokens.border }`,
				bgcolor: live ? tokens.amberSoft : tokens.soft,
			} }
		>
			{ live && (
				<Typography sx={ { fontSize: 13, fontWeight: 600, color: tokens.amber, mb: 0.25 } }>
					On { usage.live } live order{ usage.live === 1 ? '' : 's' }
					{ usage.liveNumbers?.length ? ` (#${ usage.liveNumbers.join( ', #' ) })` : '' }
				</Typography>
			) }
			<Typography sx={ { fontSize: 12.5, color: live ? tokens.ink2 : tokens.muted } }>
				{ live
					? 'Those orders are unaffected — they keep their own copy of the dish. It just won’t be orderable again.'
					: `Used in ${ usage.capped ? `${ usage.total }+` : usage.total } past order${ usage.total === 1 ? '' : 's' }, which keep their own copy.` }
			</Typography>
		</Box>
	);
}

const NONE = 'none';
const cid = ( key ) => `container:${ key }`;
const isContainerId = ( id ) => typeof id === 'string' && id.startsWith( 'container:' );
const keyFromContainerId = ( id ) => id.slice( 'container:'.length );

// Build the ordered container→item-ids map from store data. Each item lives in
// the first of its sections that still exists, else the "none" bucket.
// menuFilter (a dinekit_menu term id, or 0 for all) limits which items are shown.
function buildBoard( data, menuFilter ) {
	const secIds = data.sections.map( ( s ) => String( s.id ) );
	const map = { [ NONE ]: [] };
	secIds.forEach( ( id ) => ( map[ id ] = [] ) );

	const items = menuFilter
		? data.items.filter( ( it ) => ( it.menus || [] ).includes( menuFilter ) )
		: data.items;
	const sorted = [ ...items ].sort(
		( a, b ) => a.order - b.order || a.title.localeCompare( b.title )
	);
	sorted.forEach( ( item ) => {
		const home = item.sections.map( String ).find( ( s ) => map[ s ] ) || NONE;
		map[ home ].push( item.id );
	} );

	const order = [ ...secIds ];
	if ( map[ NONE ].length ) {
		order.push( NONE );
	}
	return { order, map };
}

export default function MenuBuilder( { store, openItemId, onOpenItem } ) {
	const { data } = store;
	const [ selectedMenu, setSelectedMenu ] = useState( 0 );
	const [ board, setBoard ] = useState( () => buildBoard( data, 0 ) );
	const [ activeId, setActiveId ] = useState( null );
	const [ newSection, setNewSection ] = useState( '' );
	const [ query, setQuery ] = useState( '' );
	const [ collapsed, setCollapsed ] = useState( {} );
	const toggleCollapse = ( key ) => setCollapsed( ( c ) => ( { ...c, [ key ]: ! c[ key ] } ) );

	// Archive confirmation. `usage` is fetched while the dialog is open so the
	// owner can see whether the dish is on an order that's being cooked right now.
	const [ archiving, setArchiving ] = useState( null ); // { id, title }
	const [ usage, setUsage ] = useState( null );
	const [ archiveBusy, setArchiveBusy ] = useState( false );

	const askArchive = ( id ) => {
		const item = ( data.items || [] ).find( ( it ) => it.id === id );
		setUsage( null );
		setArchiving( { id, title: item?.title || '' } );
		api.itemUsage( id ).then( setUsage ).catch( () => setUsage( { live: 0, total: 0, liveNumbers: [] } ) );
	};

	const doArchive = async () => {
		setArchiveBusy( true );
		try {
			await store.deleteItem( archiving.id );
			if ( editingId === archiving.id ) {
				setEditingId( null );
			}
			setArchiving( null );
		} finally {
			setArchiveBusy( false );
		}
	};

	// The open dish is driven by the route (#/builder/item/:id) so it's
	// deep-linkable and survives a refresh.
	const editingId = openItemId || null;
	const setEditingId = ( id ) => onOpenItem( id || null );

	// Rebuild only when the set of items/sections changes (add/remove), not on
	// content edits or reorders — those are already reflected in local board.
	const signature = useMemo(
		() =>
			data.sections.map( ( s ) => s.id ).join( ',' ) +
			'|' +
			data.items.map( ( i ) => i.id + ':' + ( i.menus || [] ).join( '.' ) ).join( ',' ),
		[ data.sections, data.items ]
	);
	useEffect( () => {
		setBoard( buildBoard( data, selectedMenu ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ signature, selectedMenu ] );

	const sensors = useSensors(
		useSensor( PointerSensor, { activationConstraint: { distance: 5 } } ),
		useSensor( KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates } )
	);

	const itemsById = useMemo( () => {
		const m = {};
		data.items.forEach( ( it ) => ( m[ it.id ] = it ) );
		return m;
	}, [ data.items ] );

	const sectionsById = useMemo( () => {
		const m = {};
		data.sections.forEach( ( s ) => ( m[ s.id ] = s ) );
		return m;
	}, [ data.sections ] );

	const findContainer = ( id ) => {
		if ( isContainerId( id ) ) {
			return keyFromContainerId( id );
		}
		const num = Number( id );
		return board.order.find( ( key ) => board.map[ key ].includes( num ) );
	};

	const handleDragOver = ( { active, over } ) => {
		if ( ! over ) {
			return;
		}
		const from = findContainer( active.id );
		const to = findContainer( over.id );
		if ( ! from || ! to || from === to ) {
			return;
		}
		setBoard( ( prev ) => {
			const activeItems = prev.map[ from ].filter( ( i ) => i !== Number( active.id ) );
			const overItems = [ ...prev.map[ to ] ];
			const overIndex = isContainerId( over.id )
				? overItems.length
				: overItems.indexOf( Number( over.id ) );
			overItems.splice( overIndex < 0 ? overItems.length : overIndex, 0, Number( active.id ) );
			return { ...prev, map: { ...prev.map, [ from ]: activeItems, [ to ]: overItems } };
		} );
	};

	const handleDragEnd = ( { active, over } ) => {
		setActiveId( null );
		if ( ! over ) {
			return;
		}
		const from = findContainer( active.id );
		const to = findContainer( over.id );
		if ( ! from || ! to ) {
			return;
		}

		let nextMap = board.map;
		if ( from === to && ! isContainerId( over.id ) && active.id !== over.id ) {
			const oldIndex = board.map[ to ].indexOf( Number( active.id ) );
			const newIndex = board.map[ to ].indexOf( Number( over.id ) );
			nextMap = { ...board.map, [ to ]: arrayMove( board.map[ to ], oldIndex, newIndex ) };
			setBoard( ( prev ) => ( { ...prev, map: nextMap } ) );
		}

		persistArrangement( from, to, nextMap );
	};

	// Persist section membership (if moved) + menu_order for affected buckets.
	const persistArrangement = ( from, to, map ) => {
		const movedId = Number( activeId );
		const affected = new Set( [ from, to ] );
		const orderPayload = [];
		const localPatches = [];

		affected.forEach( ( key ) => {
			map[ key ].forEach( ( id, index ) => {
				orderPayload.push( { id, order: index } );
				localPatches.push( { id, order: index } );
			} );
		} );

		// Membership change for the dragged item.
		if ( from !== to && movedId ) {
			const sections = to === NONE ? [] : [ Number( to ) ];
			store.updateItem( movedId, { sections } );
		}

		// Reflect order locally so a later rebuild stays consistent.
		store.setItems( ( items ) =>
			items.map( ( it ) => {
				const patch = localPatches.find( ( p ) => p.id === it.id );
				return patch ? { ...it, order: patch.order } : it;
			} )
		);

		if ( orderPayload.length ) {
			store.persistOrder( { items: orderPayload } );
		}
	};

	const moveSection = ( index, dir ) => {
		const realSections = board.order.filter( ( k ) => k !== NONE );
		const target = index + dir;
		if ( target < 0 || target >= realSections.length ) {
			return;
		}
		const reordered = arrayMove( realSections, index, target );
		setBoard( ( prev ) => ( {
			...prev,
			order: prev.order.includes( NONE ) ? [ ...reordered, NONE ] : reordered,
		} ) );
		store.persistOrder( { sections: reordered.map( Number ) } );
	};

	const addSection = async () => {
		const name = newSection.trim();
		if ( ! name ) {
			return;
		}
		setNewSection( '' );
		await store.createTerm( 'dinekit_section', name );
	};

	const addItem = async ( sectionKey ) => {
		const order = board.map[ sectionKey ] ? board.map[ sectionKey ].length : 0;
		const created = await store.createItem( {
			title: '',
			order,
			sections: sectionKey === NONE ? [] : [ Number( sectionKey ) ],
			menus: selectedMenu ? [ selectedMenu ] : [],
		} );
		setEditingId( created.id );
	};

	const activeItem = activeId ? itemsById[ activeId ] : null;
	const selectedMenuName = ( data.menus.find( ( m ) => m.id === selectedMenu ) || {} ).name || '';
	const boardItemCount = Object.values( board.map ).reduce( ( sum, arr ) => sum + arr.length, 0 );

	// Items in scope of the current menu filter — for search + duplicate detection.
	const scopedItems = useMemo(
		() => ( selectedMenu ? data.items.filter( ( it ) => ( it.menus || [] ).includes( selectedMenu ) ) : data.items ),
		[ data.items, selectedMenu ]
	);
	const q = query.trim().toLowerCase();
	const matches = q ? scopedItems.filter( ( it ) => ( it.title || '' ).toLowerCase().includes( q ) ) : [];
	const dupTitles = useMemo( () => {
		const counts = {};
		scopedItems.forEach( ( it ) => {
			const t = ( it.title || '' ).trim().toLowerCase();
			if ( t ) {
				counts[ t ] = ( counts[ t ] || 0 ) + 1;
			}
		} );
		return Object.keys( counts ).filter( ( t ) => counts[ t ] > 1 );
	}, [ scopedItems ] );
	const sectionLabel = ( item ) => {
		const s = ( item.sections || [] ).map( ( id ) => sectionsById[ id ] ).find( Boolean );
		return s ? s.name : 'Unsectioned';
	};

	return (
		<Box sx={ { maxWidth: 1180, mx: 'auto' } }>
			<LiveMenuBanner menuPage={ data.menuPage } />

			<MenuTabs menus={ data.menus } selected={ selectedMenu } onSelect={ setSelectedMenu } store={ store } />

			<Stack direction="row" alignItems="baseline" spacing={ 1 } flexWrap="wrap" sx={ { mb: 1.5 } }>
				<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted2 } }>
					Sections
				</Typography>
				<Typography sx={ { fontSize: 13, color: tokens.muted } }>
					{ selectedMenuName
						? `Dishes in your “${ selectedMenuName }” menu, grouped into sections.`
						: 'Group your dishes into sections like Starters, Mains and Desserts. Drag dishes between them.' }
				</Typography>
			</Stack>

			{ selectedMenu > 0 && boardItemCount === 0 && (
				<Box sx={ { mb: 2, p: 2, bgcolor: tokens.accentSoft, borderRadius: 2, fontSize: 13, color: tokens.accentDark } }>
					No dishes are in the “{ selectedMenuName }” menu yet. Add dishes below (they’ll join this
					menu), or open any existing dish and tick “{ selectedMenuName }” under Menus.
				</Box>
			) }

			{ /* Search across all dishes (handy once you have a lot). */ }
			<TextField
				value={ query }
				onChange={ ( e ) => setQuery( e.target.value ) }
				placeholder="Search dishes…"
				size="small"
				fullWidth
				InputProps={ { startAdornment: <InputAdornment position="start"><SearchIcon sx={ { fontSize: 18, color: tokens.muted2 } } /></InputAdornment> } }
				sx={ { mb: 2, maxWidth: 360 } }
			/>

			{ dupTitles.length > 0 && (
				<Alert severity="warning" sx={ { mb: 2, '& .MuiAlert-message': { fontSize: 13 } } }>
					Duplicate dish name{ dupTitles.length === 1 ? '' : 's' }: <strong>{ dupTitles.join( ', ' ) }</strong>. Rename or remove copies so diners aren’t confused.
				</Alert>
			) }

			{ /* Search results — a flat list so matches are easy to find + open. */ }
			{ q && (
				<Stack spacing={ 1 } sx={ { mb: 3 } }>
					{ matches.length === 0 && (
						<Typography sx={ { color: tokens.muted, fontSize: 14, py: 2, textAlign: 'center' } }>No dishes match “{ query }”.</Typography>
					) }
					{ matches.map( ( it ) => (
						<Stack
							key={ it.id }
							direction="row"
							alignItems="center"
							spacing={ 1.5 }
							onClick={ () => setEditingId( it.id ) }
							sx={ { bgcolor: tokens.surface, border: `1px solid ${ tokens.border }`, borderRadius: '10px', px: 1.75, py: 1.25, cursor: 'pointer', '&:hover': { borderColor: tokens.border2, boxShadow: tokens.shadowSm } } }
						>
							<Typography sx={ { flex: 1, fontWeight: 600, fontSize: 14, color: tokens.ink } } noWrap>{ it.title || 'Untitled dish' }</Typography>
							<Chip label={ sectionLabel( it ) } size="small" sx={ { bgcolor: tokens.soft, color: tokens.muted, fontWeight: 600 } } />
						</Stack>
					) ) }
				</Stack>
			) }

			{ ! q && (
			<>
			<DndContext
				sensors={ sensors }
				collisionDetection={ closestCorners }
				onDragStart={ ( { active } ) => setActiveId( active.id ) }
				onDragOver={ handleDragOver }
				onDragEnd={ handleDragEnd }
			>
				<Stack spacing={ 2.5 }>
					{ board.order
						.filter( ( k ) => k !== NONE )
						.map( ( key, index, arr ) => (
							<SortableSection
								key={ key }
								section={ sectionsById[ key ] }
								itemIds={ board.map[ key ] }
								containerId={ cid( key ) }
								itemsById={ itemsById }
								isFirst={ index === 0 }
								isLast={ index === arr.length - 1 }
								onMoveUp={ () => moveSection( index, -1 ) }
								onMoveDown={ () => moveSection( index, 1 ) }
								onAddItem={ () => addItem( key ) }
								onRename={ ( name ) => store.renameTerm( 'dinekit_section', Number( key ), name ) }
								onDelete={ () => store.deleteTerm( 'dinekit_section', Number( key ) ) }
								onEditItem={ setEditingId }
								onDuplicateItem={ async ( id ) => {
									const copy = await store.duplicateItem( id );
									if ( copy ) {
										setEditingId( copy.id );
									}
								} }
								onDeleteItem={ askArchive }
								onDuplicateSection={ () => store.duplicateSection( Number( key ) ) }
								collapsed={ !! collapsed[ key ] }
								onToggleCollapse={ () => toggleCollapse( key ) }
							/>
						) ) }

					{ board.order.includes( NONE ) && (
						<SortableSection
							section={ { id: NONE, name: 'Unsectioned' } }
							itemIds={ board.map[ NONE ] }
							containerId={ cid( NONE ) }
							itemsById={ itemsById }
							muted
							onAddItem={ () => addItem( NONE ) }
							onEditItem={ setEditingId }
							onDeleteItem={ askArchive }
						/>
					) }
				</Stack>

				<DragOverlay>
					{ activeItem ? <ItemRow item={ activeItem } overlay /> : null }
				</DragOverlay>
			</DndContext>

			<Stack
				direction="row"
				spacing={ 1 }
				sx={ {
					mt: 3,
					p: 2,
					bgcolor: tokens.surface,
					border: `1px dashed ${ tokens.border2 }`,
					borderRadius: '12px',
				} }
			>
				<TextField
					placeholder="Add a section — e.g. Starters, Mains, Desserts, Sides"
					value={ newSection }
					onChange={ ( e ) => setNewSection( e.target.value ) }
					onKeyDown={ ( e ) => e.key === 'Enter' && addSection() }
					sx={ { flex: 1 } }
				/>
				<Button variant="contained" startIcon={ <AddIcon /> } onClick={ addSection }>
					Add section
				</Button>
			</Stack>

			{ board.order.filter( ( k ) => k !== NONE ).length === 0 && (
				<Typography color="text.secondary" sx={ { textAlign: 'center', mt: 4 } }>
					Add your first section to start building the menu.
				</Typography>
			) }

			<ArchivedDishes archived={ data.archived } onRestore={ store.restoreItem } />
			</>
			) }

			{ editingId && itemsById[ editingId ] && (
				<ItemEditor
					item={ itemsById[ editingId ] }
					store={ store }
					onArchive={ () => askArchive( editingId ) }
					onClose={ () => setEditingId( null ) }
				/>
			) }

			<ConfirmDialog
				open={ !! archiving }
				title={ `Archive ${ archiving?.title ? `“${ archiving.title }”` : 'this dish' }?` }
				message="It'll be hidden from your menu, your public page and online ordering. Past orders keep it, and you can restore it any time."
				confirmLabel="Archive dish"
				busy={ archiveBusy }
				onConfirm={ doArchive }
				onCancel={ () => setArchiving( null ) }
				details={ <ArchiveUsage usage={ usage } /> }
			/>
		</Box>
	);
}
