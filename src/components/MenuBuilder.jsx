import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Stack, Typography, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
import Onboarding from './Onboarding';
import LiveMenuBanner from './LiveMenuBanner';

const NONE = 'none';
const cid = ( key ) => `container:${ key }`;
const isContainerId = ( id ) => typeof id === 'string' && id.startsWith( 'container:' );
const keyFromContainerId = ( id ) => id.slice( 'container:'.length );

// Build the ordered container→item-ids map from store data. Each item lives in
// the first of its sections that still exists, else the "none" bucket.
function buildBoard( data ) {
	const secIds = data.sections.map( ( s ) => String( s.id ) );
	const map = { [ NONE ]: [] };
	secIds.forEach( ( id ) => ( map[ id ] = [] ) );

	const sorted = [ ...data.items ].sort(
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
	const [ board, setBoard ] = useState( () => buildBoard( data ) );
	const [ activeId, setActiveId ] = useState( null );
	const [ newSection, setNewSection ] = useState( '' );
	const [ skipOnboarding, setSkipOnboarding ] = useState( false );

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
			data.items.map( ( i ) => i.id ).join( ',' ),
		[ data.sections, data.items ]
	);
	useEffect( () => {
		setBoard( buildBoard( data ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ signature ] );

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
		await store.createTerm( 'dk_section', name );
	};

	const addItem = async ( sectionKey ) => {
		const order = board.map[ sectionKey ] ? board.map[ sectionKey ].length : 0;
		const created = await store.createItem( {
			title: '',
			order,
			sections: sectionKey === NONE ? [] : [ Number( sectionKey ) ],
		} );
		setEditingId( created.id );
	};

	const activeItem = activeId ? itemsById[ activeId ] : null;

	const isEmpty = data.sections.length === 0 && data.items.length === 0;
	if ( isEmpty && ! skipOnboarding ) {
		return <Onboarding onDone={ () => setSkipOnboarding( true ) } />;
	}

	return (
		<Box sx={ { maxWidth: 1180, mx: 'auto' } }>
			<LiveMenuBanner menuPage={ data.menuPage } />

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
								onRename={ ( name ) => store.renameTerm( 'dk_section', Number( key ), name ) }
								onDelete={ () => store.deleteTerm( 'dk_section', Number( key ) ) }
								onEditItem={ setEditingId }
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
					borderRadius: 3,
				} }
			>
				<TextField
					placeholder="New section name (e.g. Starters)"
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

			{ editingId && itemsById[ editingId ] && (
				<ItemEditor
					item={ itemsById[ editingId ] }
					store={ store }
					onClose={ () => setEditingId( null ) }
				/>
			) }
		</Box>
	);
}
