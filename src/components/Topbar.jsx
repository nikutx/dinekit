import React, { useState } from 'react';
import { Box, Typography, Stack, Button, Menu, MenuItem, ListItemIcon } from '../ui';
import AddIcon from '@mui/icons-material/Add';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import CelebrationIcon from '@mui/icons-material/Celebration';
import { tokens } from '../theme';
import NotificationCenter from './NotificationCenter';
import SavePill from './ui/SavePill';

export default function Topbar( { saveStatus, title, navigate, businessType, onQuick } ) {
	const [ anchor, setAnchor ] = useState( null );

	// Quick captures (a phone booking, a walk-in) pop up over the CURRENT
	// screen — no navigation, no lost place. Authoring work (a dish, an
	// event) still goes to its screen: that's a sit-down job, not a capture.
	const quick = [
		businessType !== 'takeaway' && { label: 'New booking', icon: <EventSeatIcon fontSize="small" />, popup: 'booking' },
		businessType !== 'takeaway' && { label: 'Seat a walk-in', icon: <PeopleAltIcon fontSize="small" />, popup: 'walkin' },
		{ label: 'New dish', icon: <RestaurantMenuIcon fontSize="small" />, view: 'builder' },
		{ label: 'New event', icon: <CelebrationIcon fontSize="small" />, view: 'events' },
	].filter( Boolean );

	return (
		<Box
			sx={ {
				height: 58,
				flexShrink: 0,
				bgcolor: tokens.surface,
				borderBottom: `1px solid ${ tokens.border }`,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				px: 4,
				position: 'sticky',
				top: 32,
				zIndex: 5,
			} }
		>
			<Typography sx={ { fontSize: 15, fontWeight: 650, letterSpacing: '-0.014em', color: tokens.ink } }>
				{ title || 'Home' }
			</Typography>

			<Stack direction="row" spacing={ 1.5 } alignItems="center">
				{ /* Save status pill */ }
				<SavePill status={ saveStatus } />

				{ /* Notification center — actionable items, on every screen */ }
				<NotificationCenter navigate={ navigate } />

				{ /* Global quick-create */ }
				<Button
					variant="contained"
					size="small"
					startIcon={ <AddIcon sx={ { fontSize: 16 } } /> }
					onClick={ ( e ) => setAnchor( e.currentTarget ) }
					sx={ { minHeight: 32, px: 1.5, fontSize: 13 } }
				>
					New
				</Button>
				<Menu
					anchorEl={ anchor }
					open={ !! anchor }
					onClose={ () => setAnchor( null ) }
					anchorOrigin={ { vertical: 'bottom', horizontal: 'right' } }
					transformOrigin={ { vertical: 'top', horizontal: 'right' } }
				>
					{ quick.map( ( q ) => (
						<MenuItem
							key={ q.label }
							onClick={ () => {
								setAnchor( null );
								if ( q.popup ) {
									onQuick && onQuick( q.popup );
								} else {
									navigate && navigate( q.view );
								}
							} }
							sx={ { fontSize: 13.5, fontWeight: 500, minWidth: 170 } }
						>
							<ListItemIcon sx={ { color: tokens.muted, minWidth: '30px !important' } }>{ q.icon }</ListItemIcon>
							{ q.label }
						</MenuItem>
					) ) }
				</Menu>
			</Stack>
		</Box>
	);
}
