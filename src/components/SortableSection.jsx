import React, { useState } from 'react';
import { Box, Stack, IconButton, InputBase, Tooltip, Typography, Button } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { tokens } from '../theme';
import SortableItem from './SortableItem';

export default function SortableSection( {
	section,
	itemIds,
	containerId,
	itemsById,
	isFirst,
	isLast,
	muted,
	onMoveUp,
	onMoveDown,
	onAddItem,
	onRename,
	onDelete,
	onEditItem,
} ) {
	const [ name, setName ] = useState( section.name );
	const { setNodeRef, isOver } = useDroppable( { id: containerId } );

	return (
		<Box
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ isOver ? tokens.accent : tokens.border }`,
				borderRadius: 3,
				overflow: 'hidden',
				transition: 'border-color 0.15s ease-in-out',
				opacity: muted ? 0.92 : 1,
			} }
		>
			<Stack
				direction="row"
				alignItems="center"
				spacing={ 1 }
				sx={ {
					px: 2,
					py: 1.25,
					borderBottom: `1px solid ${ tokens.border }`,
					bgcolor: muted ? tokens.soft : tokens.surface,
				} }
			>
				{ ! muted && (
					<Stack>
						<IconButton size="small" disabled={ isFirst } onClick={ onMoveUp } sx={ { p: 0.2 } }>
							<KeyboardArrowUpIcon fontSize="small" />
						</IconButton>
						<IconButton size="small" disabled={ isLast } onClick={ onMoveDown } sx={ { p: 0.2 } }>
							<KeyboardArrowDownIcon fontSize="small" />
						</IconButton>
					</Stack>
				) }

				{ muted ? (
					<Typography sx={ { flex: 1, fontWeight: 700, color: tokens.muted, fontSize: 14 } }>
						{ section.name }
					</Typography>
				) : (
					<InputBase
						value={ name }
						onChange={ ( e ) => setName( e.target.value ) }
						onBlur={ () => name.trim() && name !== section.name && onRename( name.trim() ) }
						sx={ { flex: 1, fontWeight: 800, fontSize: 16, color: tokens.ink } }
					/>
				) }

				<Typography className="dk-microlabel" sx={ { color: tokens.muted, fontSize: 12, fontWeight: 700 } }>
					{ itemIds.length } { itemIds.length === 1 ? 'item' : 'items' }
				</Typography>

				{ ! muted && (
					<Tooltip title="Delete section (items are kept, just unsectioned)">
						<IconButton size="small" onClick={ onDelete } sx={ { color: tokens.muted2 } }>
							<DeleteOutlineIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) }
			</Stack>

			<Box ref={ setNodeRef } sx={ { p: 1.25, minHeight: 56 } }>
				<SortableContext items={ itemIds } strategy={ verticalListSortingStrategy }>
					<Stack spacing={ 1 }>
						{ itemIds.map( ( id ) => (
							<SortableItem
								key={ id }
								item={ itemsById[ id ] }
								onEdit={ () => onEditItem( id ) }
							/>
						) ) }
					</Stack>
				</SortableContext>

				{ itemIds.length === 0 && (
					<Typography
						sx={ { textAlign: 'center', color: tokens.muted2, fontSize: 13, py: 1.5 } }
					>
						Drop items here, or add one.
					</Typography>
				) }

				<Button
					size="small"
					startIcon={ <AddIcon /> }
					onClick={ onAddItem }
					sx={ { mt: 1, color: tokens.accent } }
				>
					Add item
				</Button>
			</Box>
		</Box>
	);
}
