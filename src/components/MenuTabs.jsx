import React, { useState } from 'react';
import { Box, Stack, Button, IconButton, InputBase, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import { tokens } from '../theme';

// Lunch / Dinner / Drinks tabs. "All menus" (0) shows everything; a specific
// menu filters the builder and becomes the target for new items.
export default function MenuTabs( { menus, selected, onSelect, store } ) {
	const [ adding, setAdding ] = useState( false );
	const [ newName, setNewName ] = useState( '' );
	const [ renaming, setRenaming ] = useState( false );
	const [ renameValue, setRenameValue ] = useState( '' );

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

	const del = () => {
		if ( ! activeMenu ) {
			return;
		}
		store.deleteTerm( 'dk_menu', activeMenu.id );
		onSelect( 0 );
	};

	const tabSx = ( active ) => ( {
		px: 1.75,
		py: 0.75,
		borderRadius: 2,
		fontSize: 14,
		fontWeight: 700,
		cursor: 'pointer',
		whiteSpace: 'nowrap',
		color: active ? '#fff' : tokens.ink2,
		bgcolor: active ? tokens.accent : tokens.surface,
		border: `1px solid ${ active ? tokens.accent : tokens.border }`,
		transition: 'all 0.15s ease-in-out',
		'&:hover': { borderColor: tokens.accent },
	} );

	return (
		<Stack direction="row" spacing={ 1 } alignItems="center" flexWrap="wrap" sx={ { mb: 2.5, rowGap: 1 } }>
			<Box sx={ tabSx( selected === 0 ) } onClick={ () => onSelect( 0 ) }>
				All menus
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
				<Stack direction="row" alignItems="center" spacing={ 0.5 }>
					<InputBase
						autoFocus
						placeholder="Menu name"
						value={ newName }
						onChange={ ( e ) => setNewName( e.target.value ) }
						onKeyDown={ ( e ) => e.key === 'Enter' && addMenu() }
						onBlur={ addMenu }
						sx={ { border: `1px solid ${ tokens.border }`, borderRadius: 2, px: 1, py: 0.5, fontSize: 14, width: 130 } }
					/>
				</Stack>
			) : (
				<Button size="small" startIcon={ <AddIcon /> } onClick={ () => setAdding( true ) } sx={ { color: tokens.muted } }>
					New menu
				</Button>
			) }

			{ activeMenu && ! renaming && (
				<Stack direction="row" sx={ { ml: 'auto' } }>
					<Tooltip title="Rename this menu">
						<IconButton
							size="small"
							onClick={ () => {
								setRenameValue( activeMenu.name );
								setRenaming( true );
							} }
							sx={ { color: tokens.muted2 } }
						>
							<EditIcon fontSize="small" />
						</IconButton>
					</Tooltip>
					<Tooltip title="Delete this menu (dishes are kept)">
						<IconButton size="small" onClick={ del } sx={ { color: tokens.muted2 } }>
							<DeleteOutlineIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Stack>
			) }
		</Stack>
	);
}
