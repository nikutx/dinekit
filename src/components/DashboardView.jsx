import React, { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography, Button, Chip, LinearProgress } from '@mui/material';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PaymentsIcon from '@mui/icons-material/Payments';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import CelebrationIcon from '@mui/icons-material/Celebration';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import AddIcon from '@mui/icons-material/Add';
import { tokens } from '../theme';
import { api } from '../api/client';
import { prettyDate, statusMeta } from '../lib/bookings';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import StatTile from './ui/StatTile';
import Card from './ui/Card';
import { TilesSkeleton, ListSkeleton } from './ui/Skeletons';

const CHECKLIST = [
	{ key: 'menu', label: 'Build your menu', view: 'builder' },
	{ key: 'hours', label: 'Set your opening hours', view: 'hours' },
	{ key: 'page', label: 'Publish your menu page', view: 'qr' },
	{ key: 'floor', label: 'Lay out your floor plan', view: 'floor', types: [ 'dinein', 'both' ] },
	{ key: 'booking', label: 'Take your first booking', view: 'bookings', types: [ 'dinein', 'both' ] },
];

export default function DashboardView( { navigate } ) {
	const [ d, setD ] = useState( null );
	const [ loading, setLoading ] = useState( true );

	useEffect( () => {
		api.getDashboard().then( setD ).finally( () => setLoading( false ) );
	}, [] );

	const greeting = useMemo( () => {
		const h = new Date().getHours();
		return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
	}, [] );

	if ( loading || ! d ) {
		return (
			<Page>
				<PageHeader title={ `${ greeting } 👋` } />
				<TilesSkeleton count={ 4 } />
				<ListSkeleton rows={ 4 } />
			</Page>
		);
	}

	const money = ( n ) => {
		const v = Number( n || 0 ).toFixed( 2 );
		return d.currencyPos === 'after' ? `${ v }${ d.currency }` : `${ d.currency }${ v }`;
	};
	const isDinein = d.businessType !== 'takeaway';
	const isTakeaway = d.businessType !== 'dinein';

	const tiles = [];
	if ( isDinein ) {
		tiles.push( { label: 'Covers today', value: d.covers, sub: `${ d.bookingsCount } booking${ d.bookingsCount === 1 ? '' : 's' }`, icon: <EventSeatIcon />, tint: { fg: tokens.accent, bg: tokens.accentSoft }, spark: d.sparkCovers } );
	}
	if ( isTakeaway ) {
		tiles.push( { label: 'Orders today', value: d.ordersToday, sub: `${ d.activeOrders } active`, icon: <ReceiptLongIcon />, tint: { fg: tokens.violet, bg: tokens.violetSoft }, spark: d.sparkOrders } );
		tiles.push( { label: 'Revenue today', value: money( d.revenueToday ), sub: `${ money( d.weekRevenue ) } this week`, icon: <PaymentsIcon />, tint: { fg: tokens.green, bg: tokens.greenSoft }, spark: d.sparkRevenue } );
	}
	if ( isDinein ) {
		tiles.push( { label: 'Covers this week', value: d.weekCovers, icon: <EventSeatIcon />, tint: { fg: tokens.sky, bg: tokens.skySoft }, spark: d.sparkCovers } );
	}
	tiles.push( { label: 'Upcoming events', value: d.upcomingEvents.length, sub: d.upcomingEvents[ 0 ] ? `next ${ prettyDate( d.upcomingEvents[ 0 ].date ) }` : 'none scheduled', icon: <CelebrationIcon />, tint: { fg: tokens.amber, bg: tokens.amberSoft } } );

	const alerts = [];
	if ( d.pendingBookings > 0 ) {
		alerts.push( { label: `${ d.pendingBookings } booking${ d.pendingBookings === 1 ? '' : 's' } to confirm`, view: 'bookings', fg: tokens.amber, bg: tokens.amberSoft } );
	}
	if ( d.activeOrders > 0 ) {
		alerts.push( { label: `${ d.activeOrders } active order${ d.activeOrders === 1 ? '' : 's' }`, view: 'orders', fg: tokens.accentDark, bg: tokens.accentSoft } );
	}
	if ( d.waitlist > 0 ) {
		alerts.push( { label: `${ d.waitlist } on the waitlist`, view: 'bookings', fg: tokens.ink2, bg: tokens.soft } );
	}

	const checklist = CHECKLIST.filter( ( c ) => ! c.types || c.types.includes( d.businessType ) );
	const doneCount = checklist.filter( ( c ) => d.checklist[ c.key ] ).length;
	const setupComplete = doneCount === checklist.length;

	return (
		<Page>
			<PageHeader
				title={ `${ greeting } 👋` }
				subtitle={ prettyDate( d.today ) }
				actions={
					isDinein ? (
						<Button variant="contained" startIcon={ <AddIcon /> } onClick={ () => navigate( 'bookings' ) }>New booking</Button>
					) : (
						<Button variant="contained" startIcon={ <ReceiptLongIcon /> } onClick={ () => navigate( 'orders' ) }>View orders</Button>
					)
				}
			/>

			{ /* KPI tiles */ }
			<Stack direction="row" spacing={ 2 } flexWrap="wrap" useFlexGap sx={ { mb: 3 } }>
				{ tiles.map( ( t, i ) => (
					<StatTile key={ i } { ...t } />
				) ) }
			</Stack>

			{ /* Alerts */ }
			{ alerts.length > 0 && (
				<Stack direction="row" spacing={ 1.5 } flexWrap="wrap" useFlexGap sx={ { mb: 3 } }>
					{ alerts.map( ( a, i ) => (
						<Box
							key={ i }
							onClick={ () => navigate( a.view ) }
							sx={ { display: 'flex', alignItems: 'center', gap: 1, bgcolor: a.bg, color: a.fg, borderRadius: 2, px: 2, py: 1.25, cursor: 'pointer', fontWeight: 600, fontSize: 14 } }
						>
							<PendingActionsIcon sx={ { fontSize: 18 } } />
							{ a.label }
							<ArrowForwardIcon sx={ { fontSize: 16 } } />
						</Box>
					) ) }
				</Stack>
			) }

			<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 3 } alignItems="flex-start">
				{ /* Left: today's schedule */ }
				<Box sx={ { flex: 1, minWidth: 0, width: '100%' } }>
					{ isDinein && (
						<Section title="Today's bookings">
							{ d.todayBookings.length === 0 ? (
								<Muted>No bookings for today yet.</Muted>
							) : (
								<Stack spacing={ 0.5 }>
									{ d.todayBookings.map( ( b, i ) => {
										const sm = statusMeta( b.status );
										return (
											<Stack key={ i } direction="row" alignItems="center" spacing={ 1.5 } sx={ { py: 1, borderBottom: `1px solid ${ tokens.soft }` } }>
												<Box sx={ { width: 3, height: 30, borderRadius: 999, bgcolor: sm.fg, flexShrink: 0 } } />
												<Typography sx={ { fontWeight: 650, width: 46, fontVariantNumeric: 'tabular-nums', fontSize: 14 } }>{ b.time }</Typography>
												<Box sx={ { flex: 1, minWidth: 0 } }>
													<Typography sx={ { fontWeight: 600, fontSize: 14 } } noWrap>{ b.name || 'Guest' }</Typography>
													<Typography sx={ { fontSize: 12, color: tokens.muted } } noWrap>{ b.party } guests{ b.table ? ` · ${ b.table }` : '' }</Typography>
												</Box>
												<Chip label={ sm.label } size="small" sx={ { bgcolor: sm.bg, color: sm.fg, fontWeight: 600 } } />
											</Stack>
										);
									} ) }
								</Stack>
							) }
						</Section>
					) }

					{ isTakeaway && (
						<Section title="Recent orders" sx={ { mt: isDinein ? 3 : 0 } }>
							{ d.recentOrders.length === 0 ? (
								<Muted>No orders yet — share your ordering page to get the first one in.</Muted>
							) : (
								<Stack spacing={ 0.5 }>
									{ d.recentOrders.map( ( o, i ) => (
										<Stack key={ i } direction="row" alignItems="center" spacing={ 1.5 } sx={ { py: 1, borderBottom: `1px solid ${ tokens.soft }` } }>
											<Typography sx={ { fontWeight: 700, width: 56, fontVariantNumeric: 'tabular-nums' } }>#{ o.number }</Typography>
											<Typography sx={ { flex: 1, fontSize: 14 } } noWrap>{ o.name || 'Customer' }</Typography>
											<Typography sx={ { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ money( o.total ) }</Typography>
										</Stack>
									) ) }
								</Stack>
							) }
						</Section>
					) }
				</Box>

				{ /* Right: setup checklist + events */ }
				<Box sx={ { width: { xs: '100%', md: 320 }, flexShrink: 0 } }>
					{ ! setupComplete && (
						<Card feature sx={ { p: 2.25, mb: 3 } }>
							<Typography sx={ { fontWeight: 650, fontSize: 15, mb: 0.5 } }>Get set up</Typography>
							<Typography sx={ { fontSize: 13, color: tokens.muted, mb: 1.5 } }>{ doneCount } of { checklist.length } done</Typography>
							<LinearProgress variant="determinate" value={ ( doneCount / checklist.length ) * 100 } sx={ { mb: 1.5, height: 6 } } />
							<Stack spacing={ 0.5 }>
								{ checklist.map( ( c ) => {
									const done = d.checklist[ c.key ];
									return (
										<Stack
											key={ c.key }
											direction="row"
											alignItems="center"
											spacing={ 1 }
											onClick={ () => ! done && navigate( c.view ) }
											sx={ { py: 0.75, cursor: done ? 'default' : 'pointer', color: done ? tokens.muted2 : tokens.ink } }
										>
											{ done
												? <CheckCircleIcon sx={ { fontSize: 18, color: tokens.green } } />
												: <RadioButtonUncheckedIcon sx={ { fontSize: 18, color: tokens.border2 } } /> }
											<Typography sx={ { fontSize: 14, flex: 1, textDecoration: done ? 'line-through' : 'none' } }>{ c.label }</Typography>
											{ ! done && <ArrowForwardIcon sx={ { fontSize: 15, color: tokens.muted2 } } /> }
										</Stack>
									);
								} ) }
							</Stack>
						</Card>
					) }

					<Card sx={ { p: 2.25 } }>
						<Typography sx={ { fontWeight: 650, fontSize: 15, mb: 1.5 } }>Upcoming events</Typography>
						{ d.upcomingEvents.length === 0 ? (
							<Muted>No events scheduled.</Muted>
						) : (
							<Stack spacing={ 1 }>
								{ d.upcomingEvents.map( ( e, i ) => (
									<Stack key={ i } direction="row" justifyContent="space-between" sx={ { fontSize: 14 } }>
										<Typography sx={ { fontSize: 14 } } noWrap>{ e.name }</Typography>
										<Typography sx={ { fontSize: 13, color: tokens.muted, whiteSpace: 'nowrap', ml: 1 } }>{ prettyDate( e.date ) }</Typography>
									</Stack>
								) ) }
							</Stack>
						) }
					</Card>
				</Box>
			</Stack>
		</Page>
	);
}

function Section( { title, children, sx } ) {
	return (
		<Box sx={ sx }>
			<Typography variant="h6" sx={ { fontSize: 16, mb: 1.5 } }>{ title }</Typography>
			<Card sx={ { p: 2.25 } }>
				{ children }
			</Card>
		</Box>
	);
}
function Muted( { children } ) {
	return <Typography sx={ { fontSize: 14, color: tokens.muted } }>{ children }</Typography>;
}
