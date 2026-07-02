import React from 'react';
import { Box, Stack, Typography, Chip, Avatar } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { tokens } from '../theme';

// Presentational item row (also used as the drag overlay). Interaction wiring
// lives in SortableItem.
export default function ItemRow( { item, dragHandleProps, onEdit, overlay } ) {
	const priceText = item.prices && item.prices.length
		? item.prices
				.map( ( p ) => ( p.label ? `${ p.label } ${ p.amount }` : p.amount ) )
				.filter( Boolean )
				.join( ' · ' )
		: '';

	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={ 1 }
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: 2,
				px: 1,
				py: 0.75,
				boxShadow: overlay ? tokens.shadowMd || '0 18px 48px rgba(15,23,42,0.18)' : 'none',
				cursor: overlay ? 'grabbing' : 'default',
				'&:hover': { borderColor: overlay ? tokens.accent : tokens.border2 },
			} }
		>
			<Box
				{ ...( dragHandleProps || {} ) }
				sx={ {
					display: 'flex',
					color: tokens.muted2,
					cursor: 'grab',
					touchAction: 'none',
					'&:active': { cursor: 'grabbing' },
				} }
			>
				<DragIndicatorIcon fontSize="small" />
			</Box>

			<Avatar
				variant="rounded"
				src={ item.image?.thumb || undefined }
				sx={ { width: 36, height: 36, bgcolor: tokens.soft, color: tokens.muted2 } }
			>
				<RestaurantIcon fontSize="small" />
			</Avatar>

			<Box
				sx={ { flex: 1, minWidth: 0, cursor: 'pointer' } }
				onClick={ onEdit }
			>
				<Stack direction="row" spacing={ 0.75 } alignItems="center">
					<Typography
						sx={ {
							fontWeight: 700,
							fontSize: 14,
							color: item.title ? tokens.ink : tokens.muted2,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						} }
					>
						{ item.title || 'Untitled item' }
					</Typography>
					{ item.badge && (
						<Chip
							label={ item.badge }
							size="small"
							sx={ { height: 18, fontSize: 10, bgcolor: tokens.accentSoft, color: tokens.accentDark } }
						/>
					) }
					{ item.status === 'draft' && (
						<Chip
							label="Draft"
							size="small"
							sx={ { height: 18, fontSize: 10, bgcolor: tokens.soft, color: tokens.muted } }
						/>
					) }
				</Stack>
				{ priceText && (
					<Typography sx={ { fontSize: 12, color: tokens.muted } }>{ priceText }</Typography>
				) }
			</Box>

			{ item.allergens && item.allergens.length > 0 && (
				<Chip
					label={ `${ item.allergens.length } allergen${ item.allergens.length > 1 ? 's' : '' }` }
					size="small"
					sx={ { height: 20, fontSize: 11, bgcolor: tokens.amberSoft, color: tokens.amber } }
				/>
			) }
		</Stack>
	);
}
