import React from 'react';
import { Box, Stack, Typography, Chip, Avatar, IconButton, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens, hashTint } from '../theme';

// Presentational item row (also used as the drag overlay). Interaction wiring
// lives in SortableItem.
export default function ItemRow( { item, dragHandleProps, onEdit, onDuplicate, overlay } ) {
	const priceText = item.prices && item.prices.length
		? item.prices
				.map( ( p ) => ( p.label ? `${ p.label } ${ p.amount }` : p.amount ) )
				.filter( Boolean )
				.join( ' · ' )
		: '';

	const tint = hashTint( item.title );
	const badgeTint = item.badge ? hashTint( item.badge ) : null;

	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={ 1 }
			sx={ {
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: '8px',
				px: 1,
				py: 0.75,
				boxShadow: overlay ? tokens.shadowMd || '0 18px 48px rgba(15,23,42,0.18)' : 'none',
				cursor: overlay ? 'grabbing' : 'default',
				'&:hover': { borderColor: overlay ? tokens.accent : tokens.border2 },
				'&:hover .dk-dup': { opacity: 1 },
				'&:hover .dk-drag': { opacity: 1 },
			} }
		>
			<Box
				{ ...( dragHandleProps || {} ) }
				className="dk-drag"
				sx={ {
					display: 'flex',
					color: tokens.muted2,
					cursor: 'grab',
					touchAction: 'none',
					opacity: overlay ? 1 : { xs: 1, sm: 0 },
					transition: 'opacity 0.15s',
					'&:active': { cursor: 'grabbing' },
				} }
			>
				<DragIndicatorIcon fontSize="small" />
			</Box>

			<Avatar
				variant="rounded"
				src={ item.image?.thumb || undefined }
				sx={ {
					width: 40,
					height: 40,
					borderRadius: '8px',
					bgcolor: tint.bg,
					color: tint.fg,
					fontSize: 15,
					fontWeight: 650,
				} }
			>
				{ item.title ? item.title.trim().charAt( 0 ).toUpperCase() : <RestaurantMenuIcon sx={ { fontSize: 18 } } /> }
			</Avatar>

			<Box
				sx={ { flex: 1, minWidth: 0, cursor: 'pointer' } }
				onClick={ onEdit }
			>
				<Stack direction="row" spacing={ 0.75 } alignItems="center">
					<Typography
						sx={ {
							fontWeight: 600,
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
							sx={ { height: 20, fontSize: 11, fontWeight: 600, bgcolor: badgeTint.bg, color: badgeTint.fg } }
						/>
					) }
					{ item.status === 'draft' && (
						<Chip
							label="Draft"
							size="small"
							sx={ { height: 20, fontSize: 11, bgcolor: tokens.soft, color: tokens.muted } }
						/>
					) }
				</Stack>
			</Box>

			{ item.allergens && item.allergens.length > 0 && (
				<Chip
					label={ `${ item.allergens.length } allergen${ item.allergens.length > 1 ? 's' : '' }` }
					size="small"
					sx={ { height: 20, fontSize: 11, fontWeight: 600, bgcolor: tokens.amberSoft, color: tokens.amber } }
				/>
			) }

			{ priceText && (
				<Typography
					sx={ {
						fontWeight: 600,
						fontSize: 13.5,
						color: tokens.ink,
						textAlign: 'right',
						fontVariantNumeric: 'tabular-nums',
						whiteSpace: 'nowrap',
						flexShrink: 0,
					} }
				>
					{ priceText }
				</Typography>
			) }

			{ ! overlay && onDuplicate && (
				<Tooltip title="Duplicate this dish">
					<IconButton
						size="small"
						className="dk-dup"
						onClick={ ( e ) => {
							e.stopPropagation();
							onDuplicate();
						} }
						sx={ { color: tokens.muted2, opacity: { xs: 1, sm: 0 }, transition: 'opacity 0.15s' } }
					>
						<ContentCopyIcon sx={ { fontSize: 16 } } />
					</IconButton>
				</Tooltip>
			) }
		</Stack>
	);
}
