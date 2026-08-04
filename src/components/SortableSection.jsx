import React, { useEffect, useRef, useState } from 'react';
import { Box, Stack, IconButton, InputBase, Tooltip, Typography, Button } from '../ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
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
	onConvert,
	onEditMedia,
	onDelete,
	onEditItem,
	onDuplicateItem,
	onDeleteItem,
	onDuplicateSection,
	collapsed,
	onToggleCollapse,
} ) {
	// Renaming is a deliberate act: the heading is plain text with a pencil next
	// to it until you ask to edit. An always-live input read as greyed-out and
	// locked — nobody could tell the loose-dishes group was nameable at all.
	const [ editing, setEditing ] = useState( false );
	const [ name, setName ] = useState( section ? section.name : '' );
	const inputRef = useRef( null );
	const { setNodeRef, isOver } = useDroppable( { id: containerId } );

	// The loose-dishes group has no name of its own yet — naming it is what
	// creates a section — so it opens empty rather than pre-filled with a label
	// the owner never chose.
	const isBucket = !! ( muted && onConvert );

	const startEdit = () => {
		setName( isBucket ? '' : section.name );
		setEditing( true );
	};

	useEffect( () => {
		if ( editing && inputRef.current ) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [ editing ] );

	const commit = () => {
		// Blur and the tick button can both fire — make committing idempotent.
		if ( ! editing ) {
			return;
		}
		const n = name.trim();
		setEditing( false );
		if ( ! n || n === section.name ) {
			return;
		}
		if ( isBucket ) {
			onConvert( n );
		} else if ( onRename ) {
			onRename( n );
		}
	};

	const cancel = () => {
		setName( section.name );
		setEditing( false );
	};

	// Belt-and-braces: a section deleted mid-render must never crash the builder.
	if ( ! section ) {
		return null;
	}

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

				{ editing ? (
					<InputBase
						ref={ inputRef }
						className="dk-section__title-input"
						aria-label={ isBucket ? 'Name this group' : 'Section name' }
						value={ name }
						onChange={ ( e ) => setName( e.target.value ) }
						placeholder={ isBucket ? 'Name this group — e.g. Starters' : 'Section name' }
						onBlur={ commit }
						onKeyDown={ ( e ) => {
							if ( e.key === 'Enter' ) {
								commit();
							} else if ( e.key === 'Escape' ) {
								cancel();
							}
						} }
						sx={ {
							flex: 1,
							fontWeight: 650,
							fontSize: 15,
							color: tokens.ink,
							bgcolor: tokens.surface,
							border: `1px solid ${ tokens.accent }`,
							boxShadow: `0 0 0 3px ${ tokens.accentSoft }`,
							borderRadius: '8px',
							px: 1,
							py: 0.25,
						} }
					/>
				) : (
					<Typography
						className="dk-section__title"
						onClick={ startEdit }
						sx={ {
							flex: 1,
							fontWeight: 650,
							fontSize: muted ? 14 : 15,
							color: tokens.ink,
							cursor: 'text',
							borderRadius: '8px',
							px: 0.75,
							py: 0.25,
							mx: -0.75,
							'&:hover': { bgcolor: tokens.soft },
						} }
					>
						{ section.name }
					</Typography>
				) }

				{ editing ? (
					<Tooltip title={ isBucket ? 'Create this section' : 'Save name' }>
						{ /* preventDefault on mousedown keeps focus, so blur can't fire
						     the same commit a split second before the click. */ }
						<IconButton
							size="small"
							aria-label={ isBucket ? 'Create this section' : 'Save name' }
							onMouseDown={ ( e ) => e.preventDefault() }
							onClick={ commit }
							sx={ { color: tokens.green } }
						>
							<CheckIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) : (
					<Tooltip title={ isBucket ? 'Name this group to turn it into a section' : 'Rename section' }>
						<IconButton
							size="small"
							aria-label={ isBucket ? 'Name this group' : 'Rename section' }
							onClick={ startEdit }
							sx={ { color: tokens.muted } }
						>
							<EditOutlinedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) }

				<Typography className="dinekit-microlabel" sx={ { color: tokens.muted, fontSize: 12.5 } }>
					{ itemIds.length } { itemIds.length === 1 ? 'dish' : 'dishes' }
				</Typography>

				{ onToggleCollapse && (
					<Tooltip title={ collapsed ? 'Expand section' : 'Collapse section' }>
						<IconButton size="small" onClick={ onToggleCollapse } sx={ { color: tokens.muted } }>
							<ExpandMoreIcon fontSize="small" sx={ { transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' } } />
						</IconButton>
					</Tooltip>
				) }

				{ ! muted && onEditMedia && (
					<Tooltip title={ section.image || section.video ? 'Photo & video (set)' : 'Add a photo or video to this section' }>
						<IconButton
							size="small"
							onClick={ onEditMedia }
							sx={ { color: section.image || section.video ? tokens.accent : tokens.muted } }
						>
							<ImageOutlinedIcon fontSize="small" />
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
					<Tooltip title="Delete section (dishes are kept, they just lose the grouping)">
						<IconButton size="small" onClick={ onDelete } sx={ { color: tokens.muted } }>
							<DeleteOutlineIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) }
			</Stack>

			<Box ref={ setNodeRef } sx={ { p: 1.25, minHeight: collapsed ? 0 : 56, display: collapsed ? 'none' : 'block' } }>
				{ isBucket && ! editing && (
					<Typography sx={ { fontSize: 12, color: tokens.muted, px: 0.75, pb: 0.75 } }>
						These dishes aren’t in a section — fine as it is. Give the group a name (✎ above) and
						it becomes a real section with these dishes inside.
					</Typography>
				) }

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
						Drag dishes here, or add one.
					</Typography>
				) }

				{ /* Same word everywhere the owner adds one: a dish. */ }
				<Button
					size="small"
					startIcon={ <AddIcon /> }
					onClick={ onAddItem }
					sx={ { mt: 1, color: tokens.accent } }
				>
					Add dish
				</Button>
			</Box>
		</Box>
	);
}
