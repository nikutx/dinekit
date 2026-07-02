import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';

// Central data store for the app: loads /state once, then applies optimistic
// updates while persisting through the REST API. `saveStatus` drives the
// "Saving… / Saved" indicator so the UI never needs a manual Save button.
export function useDineKit() {
	const [ data, setData ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ saveStatus, setSaveStatus ] = useState( 'idle' );
	const savingCount = useRef( 0 );
	const toast = useToast();

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

	// Wrap any persistence promise so the save indicator reflects it.
	const track = useCallback( async ( promise ) => {
		savingCount.current += 1;
		setSaveStatus( 'saving' );
		try {
			const result = await promise;
			savingCount.current -= 1;
			if ( savingCount.current <= 0 ) {
				savingCount.current = 0;
				setSaveStatus( 'saved' );
			}
			return result;
		} catch ( e ) {
			savingCount.current = Math.max( 0, savingCount.current - 1 );
			setSaveStatus( 'error' );
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

	const deleteItem = useCallback(
		async ( id ) => {
			setData( ( prev ) => ( { ...prev, items: prev.items.filter( ( it ) => it.id !== id ) } ) );
			await track( api.deleteItem( id ) );
			toast.success( 'Item deleted' );
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
		case 'dk_menu':
			return 'menus';
		case 'dk_section':
			return 'sections';
		case 'dk_dietary':
			return 'dietary';
		default:
			return 'sections';
	}
}
