import React from 'react';
import { Box, Stack, Typography, Tooltip } from '@mui/material';
import { tokens } from '../theme';

// Full-width service view: tables down the left, the day's clock across the top,
// each booking a block on its table's row positioned by time + turn length.

const pad = ( n ) => ( n < 10 ? '0' : '' ) + n;
const hhmm = ( m ) => pad( Math.floor( ( m % 1440 ) / 60 ) ) + ':' + pad( m % 60 );
const toMin = ( t ) => {
	const p = String( t ).split( ':' );
	return ( parseInt( p[ 0 ], 10 ) || 0 ) * 60 + ( parseInt( p[ 1 ], 10 ) || 0 );
};

const STATUS_COLOR = {
	confirmed: tokens.green,
	seated: tokens.accent,
	pending: tokens.amber,
	provisional: tokens.violet,
	waitlist: tokens.violet,
};
const colorFor = ( s ) => STATUS_COLOR[ s ] || tokens.muted;

const LABEL_W = 150;

export default function ServiceTimeline( { bookings, tables, areas, combos, openMin, closeMin, turnMin, onSelect } ) {
	const span = Math.max( 60, closeMin - openMin );
	const active = bookings.filter( ( b ) => ! [ 'cancelled', 'no_show' ].includes( b.status ) );
	const comboMembers = Object.fromEntries( ( combos || [] ).map( ( c ) => [ c.id, c.tables ] ) );

	const rowsFor = ( tableId ) =>
		active.filter( ( b ) => b.tableId === tableId || ( b.comboId && ( comboMembers[ b.comboId ] || [] ).includes( tableId ) ) );
	const unassigned = active.filter( ( b ) => ! b.tableId && ! b.comboId );

	const ticks = [];
	for ( let m = Math.ceil( openMin / 60 ) * 60; m <= closeMin; m += 60 ) {
		ticks.push( m );
	}

	const zones = ( areas || [] ).map( ( a ) => ( { id: a.id, name: a.name } ) );
	if ( tables.some( ( t ) => ! ( t.areaId || 0 ) ) ) {
		zones.push( { id: 0, name: 'Unzoned' } );
	}

	const Block = ( { b } ) => {
		const start = Math.max( openMin, toMin( b.time ) );
		const left = ( ( start - openMin ) / span ) * 100;
		const width = Math.max( 4, Math.min( 100 - left, ( turnMin / span ) * 100 ) );
		const soft = 'provisional' === b.status || 'waitlist' === b.status;
		return (
			<Tooltip title={ `${ b.time } · ${ b.name || 'Guest' } · ${ b.party }p · ${ b.status }` }>
				<Box
					onClick={ () => onSelect && onSelect( b ) }
					sx={ {
						position: 'absolute',
						left: `${ left }%`,
						width: `${ width }%`,
						top: 4,
						bottom: 4,
						bgcolor: colorFor( b.status ),
						color: '#fff',
						borderRadius: '6px',
						px: 0.75,
						display: 'flex',
						alignItems: 'center',
						overflow: 'hidden',
						fontSize: 11,
						fontWeight: 700,
						cursor: onSelect ? 'pointer' : 'default',
						opacity: soft ? 0.82 : 1,
						border: soft ? '1px dashed rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.25)',
					} }
				>
					<span style={ { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }>
						{ b.time } { b.name || 'Guest' } · { b.party }
					</span>
				</Box>
			</Tooltip>
		);
	};

	const Row = ( { label, sub, blocks, head } ) => (
		<Stack direction="row" sx={ { borderTop: `1px solid ${ tokens.border }`, minHeight: head ? 30 : 42, bgcolor: head ? tokens.soft : 'transparent' } }>
			<Box sx={ { width: LABEL_W, flexShrink: 0, px: 1.5, py: 0.75, borderRight: `1px solid ${ tokens.border }` } }>
				<Typography sx={ { fontSize: head ? 12 : 13, fontWeight: head ? 700 : 650, color: head ? tokens.muted : tokens.ink, textTransform: head ? 'uppercase' : 'none', letterSpacing: head ? '0.03em' : 0 } }>
					{ label }
				</Typography>
				{ sub && <Typography sx={ { fontSize: 11, color: tokens.muted } }>{ sub }</Typography> }
			</Box>
			<Box sx={ { position: 'relative', flex: 1, minWidth: 0 } }>
				{ ( blocks || [] ).map( ( b ) => <Block key={ b.id } b={ b } /> ) }
			</Box>
		</Stack>
	);

	return (
		<Box sx={ { border: `1px solid ${ tokens.border }`, borderRadius: '12px', overflowX: 'auto', bgcolor: tokens.surface } }>
			<Box sx={ { minWidth: 720 } }>
				{ /* Clock axis */ }
				<Stack direction="row" sx={ { bgcolor: tokens.soft } }>
					<Box sx={ { width: LABEL_W, flexShrink: 0, px: 1.5, py: 1, borderRight: `1px solid ${ tokens.border }` } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted } }>Tables</Typography>
					</Box>
					<Box sx={ { position: 'relative', flex: 1, height: 32 } }>
						{ ticks.map( ( m ) => (
							<Box key={ m } sx={ { position: 'absolute', left: `${ ( ( m - openMin ) / span ) * 100 }%`, top: 0, bottom: 0, borderLeft: `1px solid ${ tokens.border }`, pl: 0.5 } }>
								<Typography sx={ { fontSize: 10.5, color: tokens.muted2, fontWeight: 600 } }>{ hhmm( m ) }</Typography>
							</Box>
						) ) }
					</Box>
				</Stack>

				{ unassigned.length > 0 && <Row label={ `Unassigned · ${ unassigned.length }` } blocks={ unassigned } head /> }

				{ zones.map( ( z ) => {
					const zt = tables.filter( ( t ) => ( t.areaId || 0 ) === z.id );
					if ( ! zt.length ) {
						return null;
					}
					return (
						<React.Fragment key={ z.id }>
							<Row label={ z.name } head />
							{ zt.map( ( t ) => <Row key={ t.id } label={ t.name } sub={ `${ t.seats } seats` } blocks={ rowsFor( t.id ) } /> ) }
						</React.Fragment>
					);
				} ) }

				{ active.length === 0 && (
					<Box sx={ { p: 3, textAlign: 'center' } }>
						<Typography sx={ { fontSize: 13, color: tokens.muted2 } }>No bookings for this day yet.</Typography>
					</Box>
				) }
			</Box>
		</Box>
	);
}
