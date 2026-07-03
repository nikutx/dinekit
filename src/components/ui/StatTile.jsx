import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { tokens } from '../../theme';

// Tiny inline sparkline — area fill + line, no library.
function Spark( { data, color } ) {
	const w = 72;
	const h = 30;
	const max = Math.max( 1, ...data );
	const min = Math.min( 0, ...data );
	const span = max - min || 1;
	const step = data.length > 1 ? w / ( data.length - 1 ) : w;
	const pts = data.map( ( v, i ) => `${ ( i * step ).toFixed( 1 ) },${ ( h - 3 - ( ( v - min ) / span ) * ( h - 6 ) ).toFixed( 1 ) }` );
	const line = pts.join( ' ' );
	const area = `0,${ h } ${ line } ${ w },${ h }`;
	const id = 'sp' + color.replace( /[^a-z0-9]/gi, '' );
	return (
		<svg width={ w } height={ h } style={ { display: 'block', flexShrink: 0 } }>
			<defs>
				<linearGradient id={ id } x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={ color } stopOpacity="0.22" />
					<stop offset="100%" stopColor={ color } stopOpacity="0" />
				</linearGradient>
			</defs>
			<polygon points={ area } fill={ `url(#${ id })` } />
			<polyline points={ line } fill="none" stroke={ color } strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	);
}

/**
 * KPI tile v2 — colored icon chip, big tabular value, optional delta badge
 * (vs previous period) and 7-point sparkline.
 *
 * `tint` accepts a { fg, bg } pair (v2) or a plain bg string (legacy — the
 * icon inherits the surrounding color).
 */
export default function StatTile( { label, value, sub, icon, tint, delta, spark } ) {
	const pair = typeof tint === 'object' && tint ? tint : { fg: 'inherit', bg: tint || tokens.accentSoft };
	const sparkColor = pair.fg !== 'inherit' ? pair.fg : tokens.accent;
	const up = typeof delta === 'number' && delta > 0;
	const down = typeof delta === 'number' && delta < 0;
	return (
		<Box
			sx={ {
				flex: 1,
				minWidth: 160,
				bgcolor: tokens.surface,
				border: `1px solid ${ tokens.border }`,
				borderRadius: '12px',
				p: 2.25,
				transition: 'box-shadow .18s ease, border-color .18s ease',
				'&:hover': { boxShadow: tokens.shadowSm, borderColor: tokens.border2 },
			} }
		>
			<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mb: 1.25 } }>
				{ icon && (
					<Box
						sx={ {
							width: 28,
							height: 28,
							borderRadius: '8px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							bgcolor: pair.bg,
							color: pair.fg,
							'& svg': { fontSize: 16 },
						} }
					>
						{ icon }
					</Box>
				) }
				<Typography sx={ { fontSize: 11.5, fontWeight: 600, color: tokens.muted, textTransform: 'uppercase', letterSpacing: '0.04em' } }>
					{ label }
				</Typography>
			</Stack>

			<Stack direction="row" alignItems="flex-end" spacing={ 1.25 }>
				<Box sx={ { flex: 1, minWidth: 0 } }>
					<Stack direction="row" alignItems="center" spacing={ 1 }>
						<Typography sx={ { fontSize: 26, fontWeight: 650, letterSpacing: '-0.025em', color: tokens.ink, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' } }>
							{ value }
						</Typography>
						{ ( up || down ) && (
							<Typography
								sx={ {
									fontSize: 11,
									fontWeight: 650,
									px: 0.75,
									py: 0.25,
									borderRadius: 999,
									fontVariantNumeric: 'tabular-nums',
									color: up ? tokens.green : tokens.red,
									bgcolor: up ? tokens.greenSoft : tokens.redSoft,
								} }
							>
								{ up ? '▲' : '▼' } { Math.abs( delta ) }%
							</Typography>
						) }
					</Stack>
					{ sub && <Typography sx={ { fontSize: 12.5, color: tokens.muted, mt: 0.25 } } noWrap>{ sub }</Typography> }
				</Box>
				{ Array.isArray( spark ) && spark.length > 1 && <Spark data={ spark } color={ sparkColor } /> }
			</Stack>
		</Box>
	);
}
