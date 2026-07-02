import React from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import PaletteIcon from '@mui/icons-material/Palette';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { tokens } from './theme';
import { useDineKit } from './data/useDineKit';
import { useRoute } from './lib/useRoute';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import MenuBuilder from './components/MenuBuilder';
import HoursEditor from './components/HoursEditor';
import QRView from './components/QRView';
import DesignView from './components/DesignView';

const NAV = [
	{ key: 'builder', label: 'Menu Builder', icon: <RestaurantMenuIcon fontSize="small" /> },
	{ key: 'design', label: 'Design & Preview', icon: <PaletteIcon fontSize="small" /> },
	{ key: 'qr', label: 'QR Code', icon: <QrCode2Icon fontSize="small" /> },
	{ key: 'hours', label: 'Opening Hours', icon: <ScheduleIcon fontSize="small" /> },
];

export default function App() {
	const { view, itemId, navigate } = useRoute();
	const store = useDineKit();

	return (
		<Box sx={ { display: 'flex', minHeight: 'calc(100vh - 32px)', bgcolor: tokens.bg } }>
			<Sidebar nav={ NAV } view={ view } onChange={ ( key ) => navigate( key ) } />

			<Box sx={ { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } }>
				<Topbar
					saveStatus={ store.saveStatus }
					title={ ( NAV.find( ( n ) => n.key === view ) || {} ).label }
				/>

				<Box sx={ { flex: 1, p: 4, overflow: 'auto' } }>
					{ store.loading && (
						<Box sx={ { display: 'flex', justifyContent: 'center', mt: 10 } }>
							<CircularProgress />
						</Box>
					) }

					{ store.error && ! store.loading && (
						<Alert severity="error" sx={ { mb: 3 } }>
							{ store.error }
						</Alert>
					) }

					{ ! store.loading && store.data && (
						<>
							{ view === 'builder' && (
								<MenuBuilder
									store={ store }
									openItemId={ itemId }
									onOpenItem={ ( id ) => navigate( 'builder', id ) }
								/>
							) }
							{ view === 'design' && <DesignView /> }
							{ view === 'hours' && <HoursEditor /> }
							{ view === 'qr' && <QRView /> }
						</>
					) }
				</Box>
			</Box>
		</Box>
	);
}
