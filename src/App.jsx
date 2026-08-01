import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, Alert, Modal, Snackbar } from './ui';
import { NewBooking } from './components/BookingsView';
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
import StarBorderIcon from '@mui/icons-material/StarBorder';
import BadgeIcon from '@mui/icons-material/Badge';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import KitchenView from './components/KitchenView';
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
import ReviewsView from './components/ReviewsView';
import StaffView from './components/StaffView';
import OrdersView from './components/OrdersView';
import POSView from './components/POSView';
import EmailsView from './components/EmailsView';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import DashboardView from './components/DashboardView';
import ReportsView from './components/ReportsView';
import AccessView from './components/AccessView';
import AuditView from './components/AuditView';
import LockIcon from '@mui/icons-material/Lock';
import HistoryIcon from '@mui/icons-material/History';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import SupportView from './components/SupportView';
import Wizard from './components/Wizard';
import { startSync, useOnline, usePendingWrites } from './lib/useSync';
import CloudOffIcon from '@mui/icons-material/CloudOff';

// Grouped so the sidebar reads like a product, not a feature dump.
const NAV = [
	{ key: 'home', label: 'Home', icon: <SpaceDashboardIcon fontSize="small" /> },
	{ key: 'reports', label: 'Reports', icon: <InsightsIcon fontSize="small" /> },
	{ group: 'Front of house' },
	{ key: 'bookings', label: 'Bookings', icon: <EventNoteIcon fontSize="small" /> },
	{ key: 'floor', label: 'Floor Plan', icon: <GridViewIcon fontSize="small" /> },
	{ key: 'orders', label: 'Orders', icon: <ReceiptLongIcon fontSize="small" /> },
	{ key: 'kds', label: 'Kitchen Display', icon: <RestaurantIcon fontSize="small" /> },
	{ key: 'pos', label: 'Take Order', icon: <PointOfSaleIcon fontSize="small" /> },
	{ key: 'events', label: 'Events', icon: <CelebrationIcon fontSize="small" /> },
	{ key: 'guests', label: 'Guests', icon: <PeopleAltIcon fontSize="small" /> },
	{ key: 'reviews', label: 'Reviews', icon: <StarBorderIcon fontSize="small" /> },
	{ key: 'staff', label: 'Staff', icon: <BadgeIcon fontSize="small" /> },
	{ group: 'Menu' },
	{ key: 'builder', label: 'Menu Builder', icon: <RestaurantMenuIcon fontSize="small" /> },
	{ key: 'design', label: 'Design & Preview', icon: <PaletteIcon fontSize="small" /> },
	{ key: 'qr', label: 'QR Code', icon: <QrCode2Icon fontSize="small" /> },
	{ key: 'hours', label: 'Opening Hours', icon: <ScheduleIcon fontSize="small" /> },
	{ group: 'Setup' },
	{ key: 'integrations', label: 'Integrations', icon: <ExtensionIcon fontSize="small" /> },
	{ key: 'emails', label: 'Emails', icon: <MailOutlineIcon fontSize="small" /> },
	{ key: 'access', label: 'Access Control', icon: <LockIcon fontSize="small" /> },
	{ key: 'activity', label: 'Activity', icon: <HistoryIcon fontSize="small" /> },
	{ key: 'settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
	{ key: 'support', label: 'Support', icon: <SupportAgentIcon fontSize="small" /> },
];

// Feature gating by business type.
const DINEIN_ONLY = [ 'bookings', 'floor' ]; // hidden for takeaway-only.
const ORDERING_ONLY = [ 'orders' ];          // hidden for dine-in-only.

// Which access-control permission each nav item needs (maps to window.DINEKIT.caps).
const NAV_PERM = {
	home: 'access', reports: 'access',
	bookings: 'bookings', floor: 'bookings', guests: 'bookings',
	orders: 'orders', kds: 'orders', pos: 'orders', events: 'events', reviews: 'settings', staff: 'staff',
	builder: 'menu', design: 'menu', qr: 'menu', hours: 'menu',
	integrations: 'settings', emails: 'settings', access: 'owner', activity: 'staff', settings: 'settings',
	support: 'access',
};

// Full admins/owners see everything; if caps are somehow absent, fail open.
const ALL_CAPS = { access: true, owner: true, menu: true, orders: true, refunds: true, bookings: true, events: true, staff: true, settings: true };

function visibleNav( businessType, caps ) {
	const items = NAV.filter( ( n ) => {
		if ( n.group ) {
			return true; // Resolved in the empty-group pass below.
		}
		if ( 'takeaway' === businessType && DINEIN_ONLY.includes( n.key ) ) {
			return false;
		}
		if ( 'dinein' === businessType && ORDERING_ONLY.includes( n.key ) ) {
			return false;
		}
		const perm = NAV_PERM[ n.key ];
		return ! perm || !! caps[ perm ];
	} );
	// Drop group headers that end up with no items beneath them.
	return items.filter( ( n, i ) => {
		if ( ! n.group ) {
			return true;
		}
		return !! items[ i + 1 ] && ! items[ i + 1 ].group;
	} );
}

export default function App() {
	const { view, itemId, navigate } = useRoute();
	const store = useDineKit();
	const [ navCollapsed, setNavCollapsed ] = useState( false );
	// Global quick-capture from the "+ New" button: pops the booking/walk-in
	// form over WHATEVER screen is open (phone rings mid-floor-plan), then
	// drops you back exactly where you were.
	const [ quickAdd, setQuickAdd ] = useState( null ); // null | 'booking' | 'walkin'
	const [ quickMsg, setQuickMsg ] = useState( '' );
	const todayIso = () => {
		const d = new Date();
		const p = ( n ) => ( n < 10 ? '0' : '' ) + n;
		return `${ d.getFullYear() }-${ p( d.getMonth() + 1 ) }-${ p( d.getDate() ) }`;
	};
	const nowSlot = () => {
		const d = new Date();
		const min = Math.round( ( d.getHours() * 60 + d.getMinutes() ) / 15 ) * 15;
		const p = ( n ) => ( n < 10 ? '0' : '' ) + n;
		return p( Math.floor( ( min % 1440 ) / 60 ) ) + ':' + p( min % 60 );
	};

	// Boot the shared live-sync poller once, so every screen can react to changes
	// made on other tablets without pounding the server on individual timers.
	useEffect( () => {
		startSync();
	}, [] );

	// First run: guide the owner through the setup wizard before anything else.
	if ( ! store.loading && store.data && ! store.data.onboarded ) {
		return (
			<Box sx={ { minHeight: 'calc(100vh - 32px)', bgcolor: tokens.bg, p: 4 } }>
				<Wizard />
			</Box>
		);
	}

	const caps = ( window.DINEKIT && window.DINEKIT.caps ) || ALL_CAPS;
	const nav = visibleNav( store.data && store.data.businessType, caps );
	const activeView = nav.some( ( n ) => n.key === view ) ? view : 'home';
	// Installed/standalone app has no wp-admin bar, so fill the full viewport.
	const shellHeight = window.DINEKIT && window.DINEKIT.standalone ? '100vh' : 'calc(100vh - 32px)';

	return (
		<Box sx={ { display: 'flex', minHeight: shellHeight, bgcolor: tokens.bg } }>
			<Sidebar
				nav={ nav }
				view={ activeView }
				onChange={ ( key ) => navigate( key ) }
				collapsed={ navCollapsed }
				onToggleCollapse={ () => setNavCollapsed( ( v ) => ! v ) }
			/>

			<Box sx={ { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } }>
				<Topbar
					saveStatus={ store.saveStatus }
					title={ ( NAV.find( ( n ) => n.key === activeView ) || {} ).label }
					navigate={ navigate }
					businessType={ store.data && store.data.businessType }
					onQuick={ setQuickAdd }
				/>

				<Modal open={ !! quickAdd } onClose={ () => setQuickAdd( null ) }>
					{ !! quickAdd && (
						<NewBooking
							bare
							walkIn={ 'walkin' === quickAdd }
							initialDate={ todayIso() }
							initialTime={ 'walkin' === quickAdd ? nowSlot() : undefined }
							onCreated={ ( b ) => {
								setQuickAdd( null );
								setQuickMsg(
									b && b.assignedNote
										? `Booked · ${ b.table || '' } — ${ b.assignedNote }`
										: `Booked${ b && b.table ? ` · ${ b.table }` : '' }${ b && b.time ? ` · ${ b.time }` : '' }`
								);
							} }
							onCancel={ () => setQuickAdd( null ) }
						/>
					) }
				</Modal>
				<Snackbar
					open={ !! quickMsg }
					autoHideDuration={ 3500 }
					onClose={ () => setQuickMsg( '' ) }
					message={ quickMsg }
					anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
				/>

				<OfflineBanner />

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
						<Box
							key={ activeView }
							sx={ {
								'@keyframes dinekitViewIn': {
									from: { opacity: 0, transform: 'translateY(6px)' },
									to: { opacity: 1, transform: 'none' },
								},
								animation: 'dinekitViewIn 0.24s cubic-bezier(0.22, 1, 0.36, 1) both',
								'@media (prefers-reduced-motion: reduce)': { animation: 'none' },
							} }
						>
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
							{ activeView === 'kds' && <KitchenView /> }
						{ activeView === 'pos' && <POSView /> }
							{ activeView === 'bookings' && <BookingsView /> }
							{ activeView === 'floor' && <FloorPlan /> }
							{ activeView === 'events' && <EventsView /> }
							{ activeView === 'guests' && <GuestsView /> }
							{ activeView === 'reviews' && <ReviewsView /> }
							{ activeView === 'staff' && <StaffView /> }
							{ activeView === 'integrations' && <IntegrationsView /> }
							{ activeView === 'emails' && <EmailsView /> }
							{ activeView === 'access' && <AccessView /> }
							{ activeView === 'activity' && <AuditView /> }
							{ activeView === 'settings' && <SettingsView /> }
							{ activeView === 'support' && <SupportView openTicketId={ itemId } /> }
						</Box>
					) }
				</Box>
			</Box>
		</Box>
	);
}

// A thin bar that appears only when the connection drops, so staff know the app
// is offline. Detection is the heartbeat-aware signal from useSync (a failed
// heartbeat flips it, not just the browser flag).
function OfflineBanner() {
	const online = useOnline();
	const queued = usePendingWrites();

	// Stay up after the connection returns while writes are still draining —
	// "back online" is not the same as "your orders are safe on the server", and
	// staff need to see the difference before they close the tablet.
	if ( online && queued === 0 ) {
		return null;
	}
	const syncing = online && queued > 0;
	const held = queued === 1 ? '1 change is' : `${ queued } changes are`;
	return (
		<Box
			role="status"
			sx={ {
				display: 'flex',
				alignItems: 'center',
				gap: 1,
				px: 2,
				py: 1,
				bgcolor: syncing ? tokens.accentSoft : tokens.amberSoft,
				borderBottom: `1px solid ${ syncing ? tokens.accentDark : tokens.amber }`,
				color: syncing ? tokens.accentDark : tokens.amber,
				fontSize: 13,
				fontWeight: 600,
			} }
		>
			<CloudOffIcon sx={ { fontSize: 18 } } />
			{ syncing
				? `Back online — syncing ${ held } still saving. Keep this tab open.`
				: `You’re offline — DineKit will reconnect automatically${ queued > 0 ? `, and ${ held } saved on this device` : '' }. Take card payments only once you’re back online.` }
		</Box>
	);
}
