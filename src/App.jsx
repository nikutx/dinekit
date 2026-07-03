import React from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import PaletteIcon from '@mui/icons-material/Palette';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SettingsIcon from '@mui/icons-material/Settings';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GridViewIcon from '@mui/icons-material/GridView';
import ExtensionIcon from '@mui/icons-material/Extension';
import CelebrationIcon from '@mui/icons-material/Celebration';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import InsightsIcon from '@mui/icons-material/Insights';
import { tokens } from './theme';
import { useDineKit } from './data/useDineKit';
import { useRoute } from './lib/useRoute';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import MenuBuilder from './components/MenuBuilder';
import HoursEditor from './components/HoursEditor';
import QRView from './components/QRView';
import DesignView from './components/DesignView';
import SettingsView from './components/SettingsView';
import BookingsView from './components/BookingsView';
import FloorPlan from './components/FloorPlan';
import IntegrationsView from './components/IntegrationsView';
import EventsView from './components/EventsView';
import GuestsView from './components/GuestsView';
import OrdersView from './components/OrdersView';
import DashboardView from './components/DashboardView';
import ReportsView from './components/ReportsView';
import Wizard from './components/Wizard';

// Grouped so the sidebar reads like a product, not a feature dump.
const NAV = [
	{ key: 'home', label: 'Home', icon: <SpaceDashboardIcon fontSize="small" /> },
	{ key: 'reports', label: 'Reports', icon: <InsightsIcon fontSize="small" /> },
	{ group: 'Front of house' },
	{ key: 'bookings', label: 'Bookings', icon: <EventNoteIcon fontSize="small" /> },
	{ key: 'floor', label: 'Floor Plan', icon: <GridViewIcon fontSize="small" /> },
	{ key: 'orders', label: 'Orders', icon: <ReceiptLongIcon fontSize="small" /> },
	{ key: 'events', label: 'Events', icon: <CelebrationIcon fontSize="small" /> },
	{ key: 'guests', label: 'Guests', icon: <PeopleAltIcon fontSize="small" /> },
	{ group: 'Menu' },
	{ key: 'builder', label: 'Menu Builder', icon: <RestaurantMenuIcon fontSize="small" /> },
	{ key: 'design', label: 'Design & Preview', icon: <PaletteIcon fontSize="small" /> },
	{ key: 'qr', label: 'QR Code', icon: <QrCode2Icon fontSize="small" /> },
	{ key: 'hours', label: 'Opening Hours', icon: <ScheduleIcon fontSize="small" /> },
	{ group: 'Setup' },
	{ key: 'integrations', label: 'Integrations', icon: <ExtensionIcon fontSize="small" /> },
	{ key: 'settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
];

// Feature gating by business type.
const DINEIN_ONLY = [ 'bookings', 'floor' ]; // hidden for takeaway-only.
const ORDERING_ONLY = [ 'orders' ];          // hidden for dine-in-only.

function visibleNav( businessType ) {
	return NAV.filter( ( n ) => {
		if ( 'takeaway' === businessType && DINEIN_ONLY.includes( n.key ) ) {
			return false;
		}
		if ( 'dinein' === businessType && ORDERING_ONLY.includes( n.key ) ) {
			return false;
		}
		return true;
	} );
}

export default function App() {
	const { view, itemId, navigate } = useRoute();
	const store = useDineKit();

	// First run: guide the owner through the setup wizard before anything else.
	if ( ! store.loading && store.data && ! store.data.onboarded ) {
		return (
			<Box sx={ { minHeight: 'calc(100vh - 32px)', bgcolor: tokens.bg, p: 4 } }>
				<Wizard />
			</Box>
		);
	}

	const nav = visibleNav( store.data && store.data.businessType );
	const activeView = nav.some( ( n ) => n.key === view ) ? view : 'home';

	return (
		<Box sx={ { display: 'flex', minHeight: 'calc(100vh - 32px)', bgcolor: tokens.bg } }>
			<Sidebar nav={ nav } view={ activeView } onChange={ ( key ) => navigate( key ) } />

			<Box sx={ { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } }>
				<Topbar
					saveStatus={ store.saveStatus }
					title={ ( NAV.find( ( n ) => n.key === activeView ) || {} ).label }
					navigate={ navigate }
					businessType={ store.data && store.data.businessType }
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
							{ activeView === 'home' && <DashboardView navigate={ navigate } /> }
							{ activeView === 'reports' && <ReportsView businessType={ store.data.businessType } /> }
							{ activeView === 'builder' && (
								<MenuBuilder
									store={ store }
									openItemId={ itemId }
									onOpenItem={ ( id ) => navigate( 'builder', id ) }
								/>
							) }
							{ activeView === 'design' && <DesignView /> }
							{ activeView === 'hours' && <HoursEditor /> }
							{ activeView === 'qr' && <QRView /> }
							{ activeView === 'orders' && <OrdersView /> }
							{ activeView === 'bookings' && <BookingsView /> }
							{ activeView === 'floor' && <FloorPlan /> }
							{ activeView === 'events' && <EventsView /> }
							{ activeView === 'guests' && <GuestsView /> }
							{ activeView === 'integrations' && <IntegrationsView /> }
							{ activeView === 'settings' && <SettingsView /> }
						</>
					) }
				</Box>
			</Box>
		</Box>
	);
}
