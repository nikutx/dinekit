import React, { useState } from 'react';
import { Box, Stack, Typography, Button, Collapse, IconButton, CircularProgress } from '../ui';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import RestoreIcon from '@mui/icons-material/Restore';
import { tokens } from '../theme';

// Archived dishes are hidden from the menu, the public page and ordering — but
// never deleted, because past orders reference them. Collapsed by default so it
// stays out of the way until it's needed.
export default function ArchivedDishes( { archived, onRestore } ) {
	const [ open, setOpen ] = useState( false );
	const [ busyId, setBusyId ] = useState( null );

	if ( ! archived || ! archived.length ) {
		return null;
	}

	const restore = async ( id ) => {
		setBusyId( id );
		try {
			await onRestore( id );
		} finally {
			setBusyId( null );
		}
	};

	return (
		<Box sx={ { mt: 3, border: `1px solid ${ tokens.border }`, borderRadius: '12px', bgcolor: tokens.surface } }>
			<Stack
				direction="row"
				alignItems="center"
				spacing={ 1 }
				onClick={ () => setOpen( ( o ) => ! o ) }
				sx={ { px: 2, py: 1.25, cursor: 'pointer', borderRadius: '12px' } }
			>
				<Inventory2Icon sx={ { fontSize: 18, color: tokens.muted2 } } />
				<Typography sx={ { fontWeight: 600, fontSize: 14, color: tokens.ink2, flex: 1 } }>
					Archived dishes ({ archived.length })
				</Typography>
				<Typography sx={ { fontSize: 12.5, color: tokens.muted2, display: { xs: 'none', sm: 'block' } } }>
					Hidden from your menu — kept for past orders
				</Typography>
				<IconButton size="small" aria-label={ open ? 'Collapse' : 'Expand' }>
					<KeyboardArrowDownIcon
						sx={ { fontSize: 20, color: tokens.muted, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' } }
					/>
				</IconButton>
			</Stack>

			<Collapse in={ open }>
				<Stack sx={ { borderTop: `1px solid ${ tokens.border }` } }>
					{ archived.map( ( item ) => (
						<Stack
							key={ item.id }
							direction="row"
							alignItems="center"
							spacing={ 1 }
							sx={ { px: 2, py: 1.25, borderBottom: `1px solid ${ tokens.soft }` } }
						>
							<Typography sx={ { flex: 1, fontSize: 14, color: tokens.muted, minWidth: 0 } }>
								{ item.title || 'Untitled item' }
							</Typography>
							<Button
								size="small"
								variant="outlined"
								startIcon={ busyId === item.id ? <CircularProgress size={ 13 } /> : <RestoreIcon sx={ { fontSize: 16 } } /> }
								disabled={ busyId === item.id }
								onClick={ () => restore( item.id ) }
							>
								Restore
							</Button>
						</Stack>
					) ) }
				</Stack>
			</Collapse>
		</Box>
	);
}
