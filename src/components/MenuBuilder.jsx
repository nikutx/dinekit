import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Stack, Typography, TextField, InputAdornment, Chip, Alert } from '../ui';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import { useToast } from './Toast';
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
import SectionMediaDialog from './ui/SectionMediaDialog';
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

// One way into a blank menu: a big tap target, a plain-English label and a line
// saying what happens if you press it.
function StartAction( { icon, label, hint, primary, disabled, onClick } ) {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={ 1.75 }
			onClick={ disabled ? undefined : onClick }
			sx={ {
				textAlign: 'left',
				px: 2,
				py: 1.75,
				borderRadius: '12px',
				cursor: disabled ? 'default' : 'pointer',
				opacity: disabled ? 0.6 : 1,
				bgcolor: primary ? tokens.accent : tokens.surface,
				border: `1px solid ${ primary ? tokens.accent : tokens.border }`,
				boxShadow: tokens.shadowSm,
				transition: 'box-shadow .18s ease, border-color .18s ease, transform .18s ease',
				'&:hover': disabled
					? {}
					: {
							boxShadow: tokens.shadowMd,
							borderColor: primary ? tokens.accentDark : tokens.border2,
							transform: 'translateY(-1px)',
					  },
			} }
		>
			<Box
				sx={ {
					width: 38,
					height: 38,
					flexShrink: 0,
					borderRadius: '10px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: primary ? 'rgba(255,255,255,0.18)' : tokens.accentSoft,
					color: primary ? '#fff' : tokens.accent,
				} }
			>
				{ icon }
			</Box>
			<Box sx={ { flex: 1, minWidth: 0 } }>
				<Typography sx={ { fontSize: 14.5, fontWeight: 650, color: primary ? '#fff' : tokens.ink } }>
					{ label }
				</Typography>
				<Typography sx={ { fontSize: 12.5, color: primary ? 'rgba(255,255,255,0.85)' : tokens.muted } }>
					{ hint }
				</Typography>
			</Box>
		</Stack>
	);
}

const NONE = 'none';
const cid = ( key ) => `container:${ key }`;
const isContainerId = ( id ) => typeof id === 'string' && id.startsWith( 'container:' );
const keyFromContainerId = ( id ) => id.slice( 'container:'.length );

// Sections belong to a menu (s.menu; 0 = shared/legacy shown everywhere).
// Only the selected menu's own sections appear on its board.
function sectionsForMenu( sections, menuFilter ) {
	return menuFilter ? sections.filter( ( s ) => ! s.menu || s.menu === menuFilter ) : sections;
}

// Build the ordered container→item-ids map from store data. Each item lives in
// the first of its sections that still exists, else the "none" bucket.
// menuFilter (a dinekit_menu term id, or 0 for all) limits which items are shown.
function buildBoard( data, menuFilter ) {
	const secIds = sectionsForMenu( data.sections, menuFilter ).map( ( s ) => String( s.id ) );
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
	const [ showBulk, setShowBulk ] = useState( false );
	const toggleCollapse = ( key ) => setCollapsed( ( c ) => ( { ...c, [ key ]: ! c[ key ] } ) );

	// CSV import / export.
	const toast = useToast();
	const fileRef = useRef( null );
	const [ csvBusy, setCsvBusy ] = useState( false );
	const exportCsv = async () => {
		setCsvBusy( true );
		try {
			const res = await api.exportMenu();
			const blob = new Blob( [ res.csv ], { type: 'text/csv;charset=utf-8;' } );
			const url = URL.createObjectURL( blob );
			const a = document.createElement( 'a' );
			a.href = url;
			a.download = res.filename || 'dinekit-menu.csv';
			document.body.appendChild( a );
			a.click();
			a.remove();
			URL.revokeObjectURL( url );
			toast.info( 'Menu exported', `${ res.count } dish${ res.count === 1 ? '' : 'es' } saved to CSV.` );
		} catch ( e ) {
			toast.error( 'Export failed', e.message );
		} finally {
			setCsvBusy( false );
		}
	};
	const importCsv = async ( file ) => {
		if ( ! file ) {
			return;
		}
		setCsvBusy( true );
		try {
			const csv = await file.text();
			const r = await api.importMenu( csv );
			await store.reload();
			const bits = [];
			if ( r.created ) {
				bits.push( `${ r.created } added` );
			}
			if ( r.updated ) {
				bits.push( `${ r.updated } updated` );
			}
			if ( r.sectionsCreated ) {
				bits.push( `${ r.sectionsCreated } new section${ r.sectionsCreated === 1 ? '' : 's' }` );
			}
			if ( r.skipped ) {
				bits.push( `${ r.skipped } skipped` );
			}
			toast.info( 'Menu imported', bits.length ? bits.join( ' · ' ) : 'No changes.' );
			if ( r.unknownAllergens && r.unknownAllergens.length ) {
				toast.error( 'Some allergens were not recognised', `Left off: ${ r.unknownAllergens.join( ', ' ) }. Add them under Allergens first, then re-import.` );
			}
		} catch ( e ) {
			toast.error( 'Import failed', e.message );
		} finally {
			setCsvBusy( false );
			if ( fileRef.current ) {
				fileRef.current.value = '';
			}
		}
	};

	// Section delete goes through a confirm — a single stray click used to
	// silently ungroup every dish in the section (found the hard way in QA).
	const [ deletingSection, setDeletingSection ] = useState( null ); // { id, name, count }
	const [ deleteSectionBusy, setDeleteSectionBusy ] = useState( false );

	// Section photo/video dialog.
	const [ mediaSection, setMediaSection ] = useState( null ); // full section object
	const [ mediaBusy, setMediaBusy ] = useState( false );
	const saveSectionMedia = async ( patch ) => {
		setMediaBusy( true );
		try {
			await store.updateSectionMedia( mediaSection.id, mediaSection.name, patch );
			setMediaSection( null );
			toast.success( 'Section updated', 'Photo and video changes are live on your menu.' );
		} catch ( e ) {
			toast.error( 'Couldn’t save', e.message );
		} finally {
			setMediaBusy( false );
		}
	};
	const doDeleteSection = async () => {
		setDeleteSectionBusy( true );
		try {
			await store.deleteTerm( 'dinekit_section', deletingSection.id );
			setDeletingSection( null );
		} finally {
			setDeleteSectionBusy( false );
		}
	};

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
			data.sections.map( ( s ) => s.id + '@' + ( s.menu || 0 ) ).join( ',' ) +
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
		// Created inside a menu → belongs to that menu (deleting it can never
		// touch another menu's sections).
		await store.createTerm( 'dinekit_section', name, selectedMenu ? { menu: selectedMenu } : {} );
	};

	// One tap for the usual three courses, so a brand-new menu has somewhere to
	// put dishes without the owner having to think about "sections" at all.
	// Created one at a time on purpose — the order they arrive in is the order
	// they appear on the board.
	const [ startBusy, setStartBusy ] = useState( false );
	const startWithSections = async () => {
		setStartBusy( true );
		try {
			const extra = selectedMenu ? { menu: selectedMenu } : {};
			for ( const name of [ 'Starters', 'Mains', 'Desserts' ] ) {
				// eslint-disable-next-line no-await-in-loop
				await store.createTerm( 'dinekit_section', name, extra );
			}
			toast.success(
				'Starters, Mains and Desserts added',
				'Add your dishes into them — rename or delete any section you don’t need.'
			);
		} catch ( e ) {
			toast.error( 'Couldn’t add the sections', e.message );
		} finally {
			setStartBusy( false );
		}
	};

	// Naming the "Unsectioned" bucket turns it into a real section: create the
	// section (owned by the current menu) and move every unsectioned dish in.
	const convertUnsectioned = async ( rawName ) => {
		const name = rawName.trim();
		const ids = ( board.map[ NONE ] || [] ).slice();
		if ( ! name || ! ids.length ) {
			return;
		}
		try {
			const term = await store.createTerm( 'dinekit_section', name, selectedMenu ? { menu: selectedMenu } : {} );
			await Promise.all( ids.map( ( id ) => store.updateItem( id, { sections: [ term.id ] } ) ) );
			await store.reload();
			toast.success( `“${ name }” created`, `${ ids.length } dish${ ids.length === 1 ? '' : 'es' } moved into the new section.` );
		} catch ( e ) {
			toast.error( 'Couldn’t create the section', e.message );
		}
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
	const sectionCount = board.order.filter( ( k ) => k !== NONE && sectionsById[ k ] ).length;

	// A blank menu gets ONE screen with three ways in — nothing else renders
	// (no search, no bulk row, no section adder) until there's something to
	// manage. Once sections exist the board takes over, even with no dishes yet,
	// so "Start with sections" visibly does something.
	const firstRun = boardItemCount === 0 && sectionCount === 0;

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
	// A long board pushes "Add dish" off the top of the page. The wp-admin page
	// itself is the scroller (the app's content box is overflow:auto but never
	// actually scrolls), so `position: sticky` can't pin to the viewport here —
	// a small fixed bar appears instead once the header has scrolled away.
	const headerRef = useRef( null );
	const [ headerOut, setHeaderOut ] = useState( false );
	useEffect( () => {
		const el = headerRef.current;
		if ( ! el || typeof IntersectionObserver === 'undefined' ) {
			setHeaderOut( false );
			return undefined;
		}
		const io = new IntersectionObserver( ( [ entry ] ) => setHeaderOut( ! entry.isIntersecting ), { threshold: 0 } );
		io.observe( el );
		return () => io.disconnect();
	}, [ firstRun, q ] );

	const sectionLabel = ( item ) => {
		const s = ( item.sections || [] ).map( ( id ) => sectionsById[ id ] ).find( Boolean );
		return s ? s.name : 'No section';
	};

	return (
		<Box sx={ { maxWidth: 1180, mx: 'auto' } }>
			<LiveMenuBanner menuPage={ data.menuPage } />

			<MenuTabs menus={ data.menus } selected={ selectedMenu } onSelect={ setSelectedMenu } store={ store } />

			{ /* Blank menu: one calm screen with three ways in. Everything else
			     (search, bulk edit, section adder, archived) stays out of the way
			     until there's something to manage. */ }
			{ firstRun && (
				<Box sx={ { maxWidth: 560, mx: 'auto', mt: 4, mb: 2 } }>
					<Typography sx={ { fontSize: 20, fontWeight: 650, color: tokens.ink, textAlign: 'center', letterSpacing: '-0.015em' } }>
						{ selectedMenuName ? `Let’s fill your “${ selectedMenuName }”` : 'Let’s build your menu' }
					</Typography>
					<Typography sx={ { fontSize: 13.5, color: tokens.muted, textAlign: 'center', mt: 0.75, mb: 2.5 } }>
						Three ways to start — you can change everything later, and nothing goes live on your
						website until you’re happy with it.
					</Typography>
					<Stack spacing={ 1.25 }>
						<StartAction
							primary
							icon={ <RestaurantMenuIcon sx={ { fontSize: 20 } } /> }
							label="Add your first dish"
							hint="Name, price, description, allergens — one dish at a time."
							onClick={ () => addItem( NONE ) }
						/>
						<StartAction
							icon={ <ViewAgendaOutlinedIcon sx={ { fontSize: 20 } } /> }
							label="Start with sections"
							hint="Sets up Starters, Mains and Desserts for you to fill in."
							disabled={ startBusy }
							onClick={ startWithSections }
						/>
						<StartAction
							icon={ <FileUploadIcon sx={ { fontSize: 20 } } /> }
							label="Import from a spreadsheet"
							hint="Already typed up in Excel or Google Sheets? Bring it in as a CSV file."
							disabled={ csvBusy }
							onClick={ () => fileRef.current && fileRef.current.click() }
						/>
					</Stack>
				</Box>
			) }

			{ ! firstRun && (
			<>
			<Stack
				ref={ headerRef }
				direction="row"
				alignItems="center"
				spacing={ 1 }
				flexWrap="wrap"
				sx={ { mb: 1.5 } }
			>
				<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted2 } }>
					Dishes
				</Typography>
				<Typography sx={ { fontSize: 13, color: tokens.muted, flex: 1 } }>
					{ selectedMenuName
						? `Everything on your “${ selectedMenuName }” menu. Sections are optional — group dishes when it helps.`
						: 'All your dishes. Sections are optional — group into Starters, Mains… when it helps, and drag dishes between them.' }
				</Typography>
				{ /* The primary action stays on screen however far the board scrolls. */ }
				<Button size="small" variant="contained" startIcon={ <AddIcon /> } onClick={ () => addItem( NONE ) }>
					Add dish
				</Button>
			</Stack>

			{ selectedMenu > 0 && boardItemCount === 0 && (
				<Box sx={ { mb: 2, p: 2, bgcolor: tokens.accentSoft, borderRadius: 2, fontSize: 13, color: tokens.accentDark } }>
					No dishes are in the “{ selectedMenuName }” menu yet. Add dishes below (they’ll join this
					menu), or open any existing dish and tick “{ selectedMenuName }” under Menus.
				</Box>
			) }

			{ /* Search earns its place only once the board is long enough to get
			     lost in — a six-dish menu is quicker to read than to search. */ }
			{ scopedItems.length >= 6 && (
				<TextField
					value={ query }
					onChange={ ( e ) => setQuery( e.target.value ) }
					placeholder="Search dishes…"
					size="small"
					fullWidth
					InputProps={ { startAdornment: <InputAdornment position="start"><SearchIcon sx={ { fontSize: 18, color: tokens.muted2 } } /></InputAdornment> } }
					sx={ { mb: 2, maxWidth: 360 } }
				/>
			) }

			{ /* One repeated name is usually deliberate (or half-typed) — say it
			     quietly. Several is a mess worth a proper warning. */ }
			{ dupTitles.length === 1 && (
				<Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: -1, mb: 2 } }>
					Two dishes are both called <strong>{ dupTitles[ 0 ] }</strong> — fine if that’s on purpose.
				</Typography>
			) }
			{ dupTitles.length > 1 && (
				<Alert severity="warning" sx={ { mb: 2, '& .MuiAlert-message': { fontSize: 13 } } }>
					Duplicate dish names: <strong>{ dupTitles.join( ', ' ) }</strong>. Rename or remove copies so diners aren’t confused.
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
					{ /* Same one-render race as the items note below: after deleting a
					     section, board.order still lists it until the rebuild effect
					     runs, so resolve each key or the whole builder white-screens. */ }
					{ board.order
						.filter( ( k ) => k !== NONE && sectionsById[ k ] )
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
								onEditMedia={ () => setMediaSection( sectionsById[ key ] ) }
								onDelete={ () => setDeletingSection( { id: Number( key ), name: ( sectionsById[ key ] || {} ).name || '', count: ( board.map[ key ] || [] ).length, shared: ! ( sectionsById[ key ] || {} ).menu && data.menus.length > 1 } ) }
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
						/* "Unsectioned" is jargon, and it's plain wrong on a flat menu
						   where this group IS the menu. Name it for what the owner is
						   looking at. */
						<SortableSection
							section={ { id: NONE, name: sectionCount ? 'Other dishes' : 'Your dishes' } }
							itemIds={ board.map[ NONE ] }
							containerId={ cid( NONE ) }
							itemsById={ itemsById }
							muted
							onAddItem={ () => addItem( NONE ) }
							onConvert={ convertUnsectioned }
							onEditItem={ setEditingId }
							onDeleteItem={ askArchive }
						/>
					) }
				</Stack>

				<DragOverlay>
					{ activeItem ? <ItemRow item={ activeItem } overlay /> : null }
				</DragOverlay>
			</DndContext>

			{ /* Spreadsheet round-trip is a power tool — folded away until asked for. */ }
			{ ! showBulk ? (
				<Button
					size="small"
					variant="text"
					startIcon={ <FileDownloadIcon /> }
					onClick={ () => setShowBulk( true ) }
					sx={ { mt: 2, color: tokens.muted } }
				>
					Edit this menu in a spreadsheet
				</Button>
			) : (
				<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" sx={ { mt: 2, mb: 0.5 } }>
					<Typography sx={ { fontSize: 12.5, color: tokens.muted, mr: 0.5 } }>Bulk edit</Typography>
					<Button size="small" variant="outlined" startIcon={ <FileDownloadIcon /> } disabled={ csvBusy } onClick={ exportCsv }>Export CSV</Button>
					<Button size="small" variant="outlined" startIcon={ <FileUploadIcon /> } disabled={ csvBusy } onClick={ () => fileRef.current && fileRef.current.click() }>Import CSV</Button>
					<Typography sx={ { fontSize: 11.5, color: tokens.muted2 } }>Export to a spreadsheet, edit, and re-import — dishes keep their ID so edits update the right dish. Importing never deletes anything.</Typography>
				</Stack>
			) }

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
			<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 0.75 } }>
				Sections are optional — a short menu works fine as a simple list of dishes. When you do use
				them, they group dishes <em>within</em> this menu (Starters, Mains…) and give diners headings
				to jump between when ordering.{ selectedMenu ? ' Sections you add here belong to this menu only.' : '' } Running
				separate menus — Lunch, Dinner, Christmas? Use the menu switcher at the top instead.
			</Typography>

			</>
			) }
			</>
			) }

			{ ! q && <ArchivedDishes archived={ data.archived } onRestore={ store.restoreItem } /> }

			{ ! firstRun && ! q && headerOut && (
				<Stack
					direction="row"
					alignItems="center"
					spacing={ 1.25 }
					sx={ {
						position: 'fixed',
						right: 28,
						bottom: 24,
						zIndex: 20,
						px: 1.25,
						py: 0.75,
						borderRadius: '999px',
						bgcolor: tokens.surface,
						border: `1px solid ${ tokens.border }`,
						boxShadow: tokens.shadow,
					} }
				>
					<Typography sx={ { fontSize: 12.5, color: tokens.muted, pl: 0.75 } }>
						{ boardItemCount } dish{ boardItemCount === 1 ? '' : 'es' }
						{ selectedMenuName ? ` in ${ selectedMenuName }` : '' }
					</Typography>
					<Button size="small" variant="contained" startIcon={ <AddIcon /> } onClick={ () => addItem( NONE ) }>
						Add dish
					</Button>
				</Stack>
			) }

			{ /* Lives at the root so both the first-run card and the bulk-edit row
			     can open the file picker. */ }
			<Box
				component="input"
				ref={ fileRef }
				type="file"
				accept=".csv,text/csv"
				onChange={ ( e ) => importCsv( e.target.files && e.target.files[ 0 ] ) }
				sx={ { display: 'none' } }
			/>

			{ editingId && itemsById[ editingId ] && (
				<ItemEditor
					item={ itemsById[ editingId ] }
					store={ store }
					onArchive={ () => askArchive( editingId ) }
					onClose={ () => setEditingId( null ) }
				/>
			) }

			{ mediaSection && (
				<SectionMediaDialog
					section={ mediaSection }
					busy={ mediaBusy }
					onSave={ saveSectionMedia }
					onClose={ () => setMediaSection( null ) }
				/>
			) }

			<ConfirmDialog
				open={ !! deletingSection }
				title={ `Delete the “${ deletingSection?.name }” section?` }
				message={
					( deletingSection?.count
						? `Its ${ deletingSection.count } dish${ deletingSection.count === 1 ? '' : 'es' } stay${ deletingSection.count === 1 ? 's' : '' } on the menu — they just lose their grouping and move back in with the other loose dishes.`
						: 'The section is empty, so nothing else changes.' ) +
					( deletingSection?.shared
						? ' ⚠ This is a shared section (created before sections became per-menu), so deleting it removes the grouping from EVERY menu that uses it.'
						: '' )
				}
				confirmLabel="Delete section"
				busy={ deleteSectionBusy }
				onConfirm={ doDeleteSection }
				onCancel={ () => setDeletingSection( null ) }
			/>

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
