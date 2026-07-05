import React from 'react';
import { Box } from '../ui';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ItemRow from './ItemRow';

export default function SortableItem( { item, onEdit, onDuplicate } ) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable( { id: item.id } );

	return (
		<Box
			ref={ setNodeRef }
			style={ {
				transform: CSS.Transform.toString( transform ),
				transition,
				opacity: isDragging ? 0.4 : 1,
			} }
		>
			<ItemRow
				item={ item }
				onEdit={ onEdit }
				onDuplicate={ onDuplicate }
				dragHandleProps={ { ...attributes, ...listeners } }
			/>
		</Box>
	);
}
