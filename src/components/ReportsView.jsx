import React, { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography, Button, ToggleButtonGroup, ToggleButton } from '../ui';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { tokens } from '../theme';
import { api } from '../api/client';
import { isoDate, addDays, prettyDate } from '../lib/bookings';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import EmptyState from './ui/EmptyState';
import StatTile from './ui/StatTile';
import Card from './ui/Card';
import { TilesSkeleton, ChartSkeleton } from './ui/Skeletons';

const RANGES = [
	{ key: '7', label: '7 days', days: 6 },
	{ key: '30', label: '30 days', days: 29 },
	{ key: '90', label: '90 days', days: 89 },
];
const WEEKDAYS = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];

// % change vs the previous period (null → no badge).
function pct( cur, prev ) {
	const c = Number( cur );
	const p = Number( prev );
	if ( ! isFinite( c ) || ! isFinite( p ) || p <= 0 ) {
		return undefined;
	}
	const d = Math.round( ( ( c - p ) / p ) * 100 );
	return d === 0 ? undefined : d;
}

export default function ReportsView( { businessType } ) {
	const [ rangeKey, setRangeKey ] = useState( '30' );
	const [ metric, setMetric ] = useState( 'covers' );
	const [ d, setD ] = useState( null );
	const [ loading, setLoading ] = useState( true );

	const range = useMemo( () => {
		const to = isoDate();
		const from = addDays( to, -RANGES.find( ( r ) => r.key === rangeKey ).days );
		return { from, to };
	}, [ rangeKey ] );

	useEffect( () => {
		let alive = true;
		setLoading( true );
		api.getReports( range ).then( ( res ) => {
			if ( alive ) {
				setD( res );
			}
		} ).finally( () => alive && setLoading( false ) );
		return () => { alive = false; };
	}, [ range ] );

	const isDinein = businessType !== 'takeaway';
	const isTakeaway = businessType !== 'dinein';

	const money = ( n ) => {
		if ( ! d ) {
			return n;
		}
		const v = Number( n || 0 ).toFixed( 2 );
		return d.currencyPos === 'after' ? `${ v }${ d.currency }` : `${ d.currency }${ v }`;
	};

	const exportCsv = () => {
		const head = 'date,bookings,covers,orders,revenue';
		const rows = d.perDay.map( ( r ) => [ r.date, r.bookings, r.covers, r.orders, r.revenue ].join( ',' ) );
		const dishes = d.topDishes.length
			? [ '', 'top dishes', 'dish,qty,revenue', ...d.topDishes.map( ( t ) => `"${ t.title.replace( /"/g, '""' ) }",${ t.qty },${ t.revenue }` ) ]
			: [];
		const csv = [ head, ...rows, ...dishes ].join( '\n' );
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( new Blob( [ csv ], { type: 'text/csv' } ) );
		a.download = `dinekit-report-${ d.from }-to-${ d.to }.csv`;
		a.click();
		URL.revokeObjectURL( a.href );
	};

	const prev = d && d.prev;

	return (
		<Page>
			<PageHeader
				title="Reports"
				subtitle="How your restaurant is performing — covers, revenue and what's selling."
				actions={
					<Stack direction="row" spacing={ 1.5 } alignItems="center">
						<ToggleButtonGroup
							size="small"
							exclusive
							value={ rangeKey }
							onChange={ ( e, v ) => v && setRangeKey( v ) }
						>
							{ RANGES.map( ( r ) => (
								<ToggleButton key={ r.key } value={ r.key } sx={ { px: 1.75 } }>
									{ r.label }
								</ToggleButton>
							) ) }
						</ToggleButtonGroup>
						<Button
							variant="outlined"
							size="small"
							startIcon={ <FileDownloadOutlinedIcon sx={ { fontSize: 16 } } /> }
							onClick={ exportCsv }
							disabled={ loading || ! d }
							sx={ { minHeight: 34 } }
						>
							Export
						</Button>
					</Stack>
				}
			/>

			{ loading || ! d ? (
				<>
					<TilesSkeleton count={ 4 } />
					<ChartSkeleton height={ 240 } />
				</>
			) : (
				<>
					{ /* KPI row — deltas vs the preceding period */ }
					<Stack direction="row" spacing={ 2 } flexWrap="wrap" useFlexGap sx={ { mb: 3 } }>
						{ isDinein && <StatTile label="Covers" value={ d.covers } sub={ `${ d.coversPerDay }/day avg` } icon={ <GroupsIcon /> } tint={ { fg: tokens.accent, bg: tokens.accentSoft } } delta={ prev && pct( d.covers, prev.covers ) } /> }
						{ isDinein && <StatTile label="Bookings" value={ d.bookings } sub={ `party of ${ d.avgParty } avg` } icon={ <EventSeatIcon /> } tint={ { fg: tokens.sky, bg: tokens.skySoft } } delta={ prev && pct( d.bookings, prev.bookings ) } /> }
						{ isDinein && <StatTile label="No-show rate" value={ `${ d.noShowRate }%` } sub={ `${ d.noShow } no-shows · ${ d.cancelled } cancelled` } icon={ <PersonOffIcon /> } tint={ d.noShowRate >= 10 ? { fg: tokens.red, bg: tokens.redSoft } : { fg: tokens.muted, bg: tokens.soft } } /> }
						{ isTakeaway && <StatTile label="Revenue" value={ money( d.revenue ) } sub={ `${ d.orders } orders` } icon={ <PaymentsIcon /> } tint={ { fg: tokens.green, bg: tokens.greenSoft } } delta={ prev && pct( d.revenue, prev.revenue ) } /> }
						{ isTakeaway && <StatTile label="Avg order" value={ money( d.avgOrder ) } icon={ <ReceiptLongIcon /> } tint={ { fg: tokens.violet, bg: tokens.violetSoft } } /> }
					</Stack>

					{ /* Trend chart */ }
					<Card sx={ { mb: 3 } }>
						<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 2 } }>
							<Box>
								<Typography sx={ { fontWeight: 650, fontSize: 15 } }>Daily trend</Typography>
								{ prev && (
									<Typography sx={ { fontSize: 12.5, color: tokens.muted } }>
										vs { prettyDate( addDays( d.from, -( d.perDay.length ) ) ) } – { prettyDate( addDays( d.from, -1 ) ) }
									</Typography>
								) }
							</Box>
							{ isDinein && isTakeaway && (
								<ToggleButtonGroup size="small" exclusive value={ metric } onChange={ ( e, v ) => v && setMetric( v ) }>
									<ToggleButton value="covers" sx={ { px: 1.5 } }>Covers</ToggleButton>
									<ToggleButton value="revenue" sx={ { px: 1.5 } }>Revenue</ToggleButton>
								</ToggleButtonGroup>
							) }
						</Stack>
						<AreaChart perDay={ d.perDay } metric={ isTakeaway && ! isDinein ? 'revenue' : metric } money={ money } />
					</Card>

					<Stack direction={ { xs: 'column', md: 'row' } } spacing={ 3 } alignItems="flex-start">
						{ /* Top dishes */ }
						{ isTakeaway && (
							<Panel title="Top dishes" sx={ { flex: 1, width: '100%' } }>
								{ d.topDishes.length === 0 ? (
									<Muted>No orders in this period yet.</Muted>
								) : (
									<Stack spacing={ 0 }>
										{ d.topDishes.map( ( dish, i ) => (
											<Stack key={ i } direction="row" alignItems="center" spacing={ 1.5 } sx={ { py: 1, borderBottom: i < d.topDishes.length - 1 ? `1px solid ${ tokens.soft }` : 'none' } }>
												<Typography sx={ { width: 20, color: i < 3 ? tokens.accent : tokens.muted2, fontWeight: i < 3 ? 650 : 400, fontVariantNumeric: 'tabular-nums', fontSize: 13 } }>{ i + 1 }</Typography>
												<Typography sx={ { flex: 1, fontSize: 14, fontWeight: 500 } } noWrap>{ dish.title }</Typography>
												<Typography sx={ { fontSize: 13, color: tokens.muted, fontVariantNumeric: 'tabular-nums' } }>×{ dish.qty }</Typography>
												<Typography sx={ { width: 72, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 14 } }>{ money( dish.revenue ) }</Typography>
											</Stack>
										) ) }
									</Stack>
								) }
							</Panel>
						) }

						{ /* Busiest days */ }
						{ isDinein && (
							<Panel title="Busiest days" sx={ { flex: 1, width: '100%' } }>
								<WeekdayBars byWeekday={ d.byWeekday } />
								{ d.busiestHour !== null && (
									<Typography sx={ { fontSize: 13, color: tokens.muted, mt: 2 } }>
										Peak arrival time: <strong style={ { color: tokens.ink2 } }>{ String( d.busiestHour ).padStart( 2, '0' ) }:00</strong>
									</Typography>
								) }
							</Panel>
						) }

						{ /* Booking sources */ }
						{ isDinein && d.sources.length > 0 && (
							<Panel title="Booking sources" sx={ { width: { xs: '100%', md: 260 }, flexShrink: 0 } }>
								<Stack spacing={ 1 }>
									{ d.sources.map( ( s, i ) => (
										<Stack key={ i } direction="row" alignItems="center" spacing={ 1 }>
											<Box sx={ { width: 8, height: 8, borderRadius: '50%', bgcolor: [ tokens.accent, tokens.violet, tokens.sky, tokens.amber ][ i % 4 ] } } />
											<Typography sx={ { flex: 1, fontSize: 14, textTransform: 'capitalize' } }>{ s.source === 'admin' ? 'Added by staff' : s.source }</Typography>
											<Typography sx={ { fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ s.count }</Typography>
										</Stack>
									) ) }
								</Stack>
							</Panel>
						) }
					</Stack>

					<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 3 } }>
						{ prettyDate( d.from ) } – { prettyDate( d.to ) }
					</Typography>
				</>
			) }
		</Page>
	);
}

// Gradient area chart — hand-rolled SVG, no library. Hover a point for the
// exact value (native <title> tooltip).
function AreaChart( { perDay, metric, money } ) {
	const vals = perDay.map( ( r ) => Number( metric === 'revenue' ? r.revenue : r.covers ) );
	const total = vals.reduce( ( s, v ) => s + v, 0 );
	if ( total === 0 ) {
		return (
			<EmptyState
				icon={ <ShowChartIcon /> }
				title="Nothing to chart yet"
				description="Once you take bookings or orders, your daily trend appears here."
			/>
		);
	}
	const W = 800;
	const H = 190;
	const PAD = 8;
	const max = Math.max( 1, ...vals );
	const step = vals.length > 1 ? ( W - PAD * 2 ) / ( vals.length - 1 ) : 0;
	const y = ( v ) => H - 22 - ( v / max ) * ( H - 40 );
	const pts = vals.map( ( v, i ) => ( { x: PAD + i * step, y: y( v ), v, date: perDay[ i ].date } ) );
	const line = pts.map( ( p ) => `${ p.x.toFixed( 1 ) },${ p.y.toFixed( 1 ) }` ).join( ' ' );
	const area = `${ PAD },${ H - 22 } ${ line } ${ ( W - PAD ).toFixed( 1 ) },${ H - 22 }`;
	const labelStep = Math.ceil( perDay.length / 10 );
	return (
		<Box sx={ { position: 'relative' } }>
			<svg viewBox={ `0 0 ${ W } ${ H }` } width="100%" style={ { display: 'block', height: 'auto' } }>
				<defs>
					<linearGradient id="dkArea" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={ tokens.accent } stopOpacity="0.20" />
						<stop offset="100%" stopColor={ tokens.accent } stopOpacity="0.01" />
					</linearGradient>
				</defs>
				{ /* Gridlines */ }
				{ [ 0.25, 0.5, 0.75 ].map( ( f ) => (
					<line key={ f } x1={ PAD } x2={ W - PAD } y1={ y( max * f ) } y2={ y( max * f ) } stroke={ tokens.soft } strokeWidth="1" />
				) ) }
				<polygon points={ area } fill="url(#dkArea)" />
				<polyline points={ line } fill="none" stroke={ tokens.accent } strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
				{ pts.map( ( p, i ) => (
					<g key={ i }>
						<circle cx={ p.x } cy={ p.y } r="9" fill="transparent">
							<title>{ `${ prettyDate( p.date ) }: ${ metric === 'revenue' ? money( p.v ) : p.v + ' covers' }` }</title>
						</circle>
						{ p.v > 0 && p.v === max && (
							<circle cx={ p.x } cy={ p.y } r="3.2" fill={ tokens.accent } stroke="#fff" strokeWidth="1.5" />
						) }
					</g>
				) ) }
				{ /* Last point dot */ }
				<circle cx={ pts[ pts.length - 1 ].x } cy={ pts[ pts.length - 1 ].y } r="3.2" fill={ tokens.accent } stroke="#fff" strokeWidth="1.5" />
				{ /* X labels */ }
				{ pts.map( ( p, i ) => ( i % labelStep === 0 ? (
					<text key={ 'l' + i } x={ p.x } y={ H - 6 } textAnchor="middle" fontSize="10" fill={ tokens.muted2 } fontFamily="inherit">
						{ Number( p.date.slice( 8, 10 ) ) }
					</text>
				) : null ) ) }
			</svg>
		</Box>
	);
}

function WeekdayBars( { byWeekday } ) {
	const max = Math.max( 1, ...byWeekday );
	// Present Mon-first, which reads more naturally for a working week.
	const order = [ 1, 2, 3, 4, 5, 6, 0 ];
	return (
		<Stack spacing={ 1 }>
			{ order.map( ( idx ) => {
				const v = byWeekday[ idx ] || 0;
				const isMax = v === max && v > 0;
				return (
					<Stack key={ idx } direction="row" alignItems="center" spacing={ 1.5 }>
						<Typography sx={ { width: 34, fontSize: 13, color: tokens.muted } }>{ WEEKDAYS[ idx ] }</Typography>
						<Box sx={ { flex: 1, bgcolor: tokens.soft, borderRadius: 999, height: 16, overflow: 'hidden' } }>
							<Box
								sx={ {
									width: `${ ( v / max ) * 100 }%`,
									height: '100%',
									borderRadius: 999,
									background: isMax
										? `linear-gradient(90deg, #6366f1, ${ tokens.accent })`
										: `${ tokens.accent }55`,
									transition: 'width .3s ease',
								} }
							/>
						</Box>
						<Typography sx={ { width: 32, textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ v }</Typography>
					</Stack>
				);
			} ) }
		</Stack>
	);
}

function Panel( { title, children, sx } ) {
	return (
		<Card sx={ sx }>
			<Typography sx={ { fontWeight: 650, fontSize: 15, mb: 2 } }>{ title }</Typography>
			{ children }
		</Card>
	);
}
function Muted( { children } ) {
	return <Typography sx={ { fontSize: 14, color: tokens.muted } }>{ children }</Typography>;
}
