import React, { useState } from 'react';
import { Box, Stack, IconButton, InputBase, Tooltip, Typography, Button } from '../ui';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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
	onDuplicateItem,
	onDeleteItem,
	onDuplicateSection,
	collapsed,
	onToggleCollapse,
} ) {
	const [ name, setName ] = useState( section.name );
	const { setNodeRef, isOver } = useDroppable( { id: containerId } );

	// Ids whose item still exists in the store — see the note by SortableContext.
	const liveItemIds = itemIds.filter( ( id ) => itemsById[ id ] );

	return (
		<Box
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ isOver ? tokens.accent : tokens.border }`,
				borderRadius: '12px',
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
					<Typography sx={ { flex: 1, fontWeight: 650, color: tokens.muted, fontSize: 14 } }>
						{ section.name }
					</Typography>
				) : (
					<InputBase
						value={ name }
						onChange={ ( e ) => setName( e.target.value ) }
						onBlur={ () => name.trim() && name !== section.name && onRename( name.trim() ) }
						sx={ { flex: 1, fontWeight: 650, fontSize: 15, color: tokens.ink } }
					/>
				) }

				<Typography className="dinekit-microlabel" sx={ { color: tokens.muted, fontSize: 12.5 } }>
					{ itemIds.length } { itemIds.length === 1 ? 'item' : 'items' }
				</Typography>

				{ onToggleCollapse && (
					<Tooltip title={ collapsed ? 'Expand section' : 'Collapse section' }>
						<IconButton size="small" onClick={ onToggleCollapse } sx={ { color: tokens.muted } }>
							<ExpandMoreIcon fontSize="small" sx={ { transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' } } />
						</IconButton>
					</Tooltip>
				) }

				{ ! muted && onDuplicateSection && (
					<Tooltip title="Duplicate section with its dishes">
						<IconButton size="small" onClick={ onDuplicateSection } sx={ { color: tokens.muted } }>
							<ContentCopyIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) }

				{ ! muted && (
					<Tooltip title="Delete section (items are kept, just unsectioned)">
						<IconButton size="small" onClick={ onDelete } sx={ { color: tokens.muted } }>
							<DeleteOutlineIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) }
			</Stack>

			<Box ref={ setNodeRef } sx={ { p: 1.25, minHeight: collapsed ? 0 : 56, display: collapsed ? 'none' : 'block' } }>
				{ /* The board is rebuilt in an effect, so for one render after a dish is
				     removed its id is still listed here while itemsById has dropped it.
				     Render only ids we can resolve, or SortableItem reads item.id of
				     undefined and takes the whole builder down. */ }
				<SortableContext items={ liveItemIds } strategy={ verticalListSortingStrategy }>
					<Stack spacing={ 1 }>
						{ liveItemIds.map( ( id ) => (
							<SortableItem
								key={ id }
								item={ itemsById[ id ] }
								onEdit={ () => onEditItem( id ) }
								onDuplicate={ onDuplicateItem ? () => onDuplicateItem( id ) : undefined }
								onDelete={ onDeleteItem ? () => onDeleteItem( id ) : undefined }
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
