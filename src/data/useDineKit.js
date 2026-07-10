import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { saveBus } from '../lib/saveBus';
import { useToast } from '../components/Toast';

// Central data store for the app: loads /state once, then applies optimistic
// updates while persisting through the REST API. `saveStatus` drives the
// "Saving… / Saved" indicator so the UI never needs a manual Save button.
export function useDineKit() {
	const [ data, setData ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ saveStatus, setSaveStatus ] = useState( 'idle' );
	const savedTimer = useRef( null );
	const toast = useToast();

	// Reflect every mutating API call (from any view, incl. settings toggles) in
	// the topbar pill; settle back to idle shortly after a successful save.
	useEffect( () => {
		return saveBus.subscribe( ( status ) => {
			clearTimeout( savedTimer.current );
			setSaveStatus( status );
			if ( 'saved' === status || 'error' === status ) {
				savedTimer.current = setTimeout( () => setSaveStatus( 'idle' ), 'error' === status ? 4000 : 1600 );
			}
		} );
	}, [] );

	useEffect( () => {
		let alive = true;
		api
			.getState()
			.then( ( state ) => {
				if ( alive ) {
					setData( state );
					setLoading( false );
				}
			} )
			.catch( ( e ) => {
				if ( alive ) {
					setError( e.message );
					setLoading( false );
				}
			} );
		return () => {
			alive = false;
		};
	}, [] );

	// The API client already drives the save-status pill (via saveBus); track()
	// now just surfaces a toast + keeps the promise chain for optimistic updates.
	const track = useCallback( async ( promise ) => {
		try {
			return await promise;
		} catch ( e ) {
			setError( e.message );
			toast.error( 'Couldn’t save that change', e.message );
			throw e;
		}
	}, [ toast ] );

	const patchLocalItem = useCallback( ( id, changes ) => {
		setData( ( prev ) => ( {
			...prev,
			items: prev.items.map( ( it ) => ( it.id === id ? { ...it, ...changes } : it ) ),
		} ) );
	}, [] );

	// --- Items ---------------------------------------------------------------
	const createItem = useCallback(
		async ( fields ) => {
			const created = await track( api.createItem( fields ) );
			setData( ( prev ) => ( { ...prev, items: [ ...prev.items, created ] } ) );
			return created;
		},
		[ track ]
	);

	const updateItem = useCallback(
		async ( id, changes ) => {
			patchLocalItem( id, changes ); // optimistic
			const saved = await track( api.updateItem( id, changes ) );
			patchLocalItem( id, saved );
			return saved;
		},
		[ track, patchLocalItem ]
	);

	// Archive, never delete. The dish moves out of `items` and into `archived`,
	// where it can be restored. Past orders keep their own title/price snapshot.
	const deleteItem = useCallback(
		async ( id ) => {
			let moved = null;
			setData( ( prev ) => {
				moved = prev.items.find( ( it ) => it.id === id ) || null;
				return {
					...prev,
					items: prev.items.filter( ( it ) => it.id !== id ),
					archived: moved ? [ ...( prev.archived || [] ), moved ] : prev.archived || [],
				};
			} );
			await track( api.deleteItem( id ) );
			toast.success( 'Dish archived', 'You can restore it from Archived dishes.' );
		},
		[ track, toast ]
	);

	const restoreItem = useCallback(
		async ( id ) => {
			const restored = await track( api.restoreItem( id ) );
			setData( ( prev ) => ( {
				...prev,
				archived: ( prev.archived || [] ).filter( ( it ) => it.id !== id ),
				items: [ ...prev.items, restored ],
			} ) );
			toast.success( 'Dish restored' );
			return restored;
		},
		[ track, toast ]
	);

	const duplicateItem = useCallback(
		async ( id ) => {
			const created = await track( api.duplicateItem( id ) );
			setData( ( prev ) => ( { ...prev, items: [ ...prev.items, created ] } ) );
			toast.success( 'Dish duplicated' );
			return created;
		},
		[ track, toast ]
	);

	const duplicateSection = useCallback(
		async ( id ) => {
			const res = await track( api.duplicateSection( id ) );
			setData( ( prev ) => ( {
				...prev,
				sections: [ ...prev.sections, res.section ],
				items: [ ...prev.items, ...res.items ],
			} ) );
			toast.success( 'Section duplicated' );
			return res;
		},
		[ track, toast ]
	);

	// --- Terms ---------------------------------------------------------------
	const createTerm = useCallback(
		async ( tax, name ) => {
			const term = await track( api.createTerm( tax, name ) );
			const key = taxKey( tax );
			setData( ( prev ) => ( { ...prev, [ key ]: [ ...prev[ key ], term ] } ) );
			return term;
		},
		[ track ]
	);

	const renameTerm = useCallback(
		async ( tax, id, name ) => {
			const key = taxKey( tax );
			setData( ( prev ) => ( {
				...prev,
				[ key ]: prev[ key ].map( ( t ) => ( t.id === id ? { ...t, name } : t ) ),
			} ) );
			await track( api.updateTerm( tax, id, name ) );
		},
		[ track ]
	);

	const deleteTerm = useCallback(
		async ( tax, id ) => {
			const key = taxKey( tax );
			setData( ( prev ) => ( {
				...prev,
				[ key ]: prev[ key ].filter( ( t ) => t.id !== id ),
			} ) );
			await track( api.deleteTerm( tax, id ) );
		},
		[ track ]
	);

	// --- Menu scheduling -----------------------------------------------------
	const saveMenuSchedule = useCallback(
		async ( id, schedule ) => {
			const updated = await track( api.saveMenuSchedule( id, schedule ) );
			setData( ( prev ) => ( {
				...prev,
				menus: prev.menus.map( ( m ) => ( m.id === id ? updated : m ) ),
			} ) );
			return updated;
		},
		[ track ]
	);

	const duplicateMenu = useCallback(
		async ( id ) => {
			const created = await track( api.duplicateMenu( id ) );
			setData( ( prev ) => ( { ...prev, menus: [ ...prev.menus, created ] } ) );
			toast.success( 'Menu duplicated' );
			return created;
		},
		[ track, toast ]
	);

	// --- Ordering ------------------------------------------------------------
	// Accepts the new local arrangement and persists it. `items` is a flat list
	// of { id, order }; `sections` / `menus` are ordered id arrays.
	const persistOrder = useCallback(
		( payload ) => track( api.saveOrder( payload ) ),
		[ track ]
	);

	const setItems = useCallback( ( updater ) => {
		setData( ( prev ) => ( { ...prev, items: updater( prev.items ) } ) );
	}, [] );

	const setSections = useCallback( ( updater ) => {
		setData( ( prev ) => ( { ...prev, sections: updater( prev.sections ) } ) );
	}, [] );

	return {
		data,
		loading,
		error,
		saveStatus,
		createItem,
		updateItem,
		deleteItem,
		restoreItem,
		duplicateItem,
		duplicateSection,
		createTerm,
		renameTerm,
		deleteTerm,
		saveMenuSchedule,
		duplicateMenu,
		persistOrder,
		setItems,
		setSections,
	};
}

function taxKey( tax ) {
	switch ( tax ) {
		case 'dinekit_menu':
			return 'menus';
		case 'dinekit_section':
			return 'sections';
		case 'dinekit_dietary':
			return 'dietary';
		default:
			return 'sections';
	}
}
