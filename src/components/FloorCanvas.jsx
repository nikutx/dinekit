import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Typography } from '../ui';
import { tokens } from '../theme';
import { dims } from '../lib/floor';

// Read-only, responsive renderer for a set of positioned tables — the same
// geometry and tile look as the Floor Plan editor (rotating tile with a
// counter-rotated upright label + orientation pip), but presentational only.
// The caller supplies per-table visual state via `render(table)` and taps via
// `onTile(table)`. The whole plan scales to fit its container width, so it
// works on a phone, a tablet or a big kitchen screen without clipping.

// Axis-aligned bounding box of a w×h box rotated by `deg` degrees.
function bbox( w, h, deg ) {
	const r = ( ( deg || 0 ) * Math.PI ) / 180;
	const c = Math.abs( Math.cos( r ) );
	const s = Math.abs( Math.sin( r ) );
	return { w: w * c + h * s, h: w * s + h * c };
}

const PAD = 28; // breathing room around the tables, in canvas units.

export default function FloorCanvas( { tables, render, onTile, minScale = 0.4, maxScale = 1.3 } ) {
	const wrapRef = useRef( null );
	const [ width, setWidth ] = useState( 0 );

	// Track the available width so we can scale the fixed-coordinate plan to fit.
	useLayoutEffect( () => {
		const el = wrapRef.current;
		if ( ! el ) {
			return undefined;
		}
		const measure = () => setWidth( el.clientWidth );
		measure();
		let ro;
		if ( typeof ResizeObserver !== 'undefined' ) {
			ro = new ResizeObserver( measure );
			ro.observe( el );
		} else {
			window.addEventListener( 'resize', measure );
		}
		return () => { if ( ro ) { ro.disconnect(); } else { window.removeEventListener( 'resize', measure ); } };
	}, [] );

	// Natural bounds of the plan (accounting for rotated footprints).
	let contentW = 320;
	let contentH = 240;
	( tables || [] ).forEach( ( t ) => {
		const d = dims( t.shape );
		const b = bbox( d.w, d.h, t.rotation );
		contentW = Math.max( contentW, ( t.x || 0 ) + b.w );
		contentH = Math.max( contentH, ( t.y || 0 ) + b.h );
	} );
	contentW += PAD;
	contentH += PAD;

	const scale = width ? Math.max( minScale, Math.min( maxScale, width / contentW ) ) : 1;

	return (
		<Box ref={ wrapRef } sx={ { width: '100%', overflow: 'hidden' } }>
			{ /* Pulse ring for tiles flagged st.pulse (e.g. "needs a check"). */ }
			<style>{ '@keyframes dkCheckPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.55)}50%{box-shadow:0 0 0 9px rgba(220,38,38,0)}}' }</style>
			<Box
				sx={ {
					position: 'relative',
					width: contentW,
					height: contentH,
					transform: `scale(${ scale })`,
					transformOrigin: 'top left',
					// Reserve only the scaled footprint so nothing below floats away.
					mb: `${ contentH * scale - contentH }px`,
					borderRadius: '14px',
					border: `1px solid ${ tokens.border }`,
					bgcolor: '#fbfbfd',
					backgroundImage: `radial-gradient(${ tokens.border2 } 1px, transparent 1px)`,
					backgroundSize: '22px 22px',
					backgroundPosition: '11px 11px',
					boxShadow: 'inset 0 1px 3px rgba(24,24,27,.03)',
				} }
			>
				{ ( tables || [] ).map( ( t ) => {
					const d = dims( t.shape );
					const st = ( render && render( t ) ) || {};
					const rot = t.rotation || 0;
					return (
						<Box
							key={ t.id }
							onClick={ st.disabled ? undefined : () => onTile && onTile( t ) }
							title={ st.title || t.name }
							sx={ {
								position: 'absolute',
								left: t.x || 0,
								top: t.y || 0,
								width: d.w,
								height: d.h,
								transform: `rotate(${ rot }deg)`,
								borderRadius: d.radius,
								background: st.bg || tokens.surface,
								border: `${ st.dashed ? '2px dashed' : '2px solid' } ${ st.border || tokens.border2 }`,
								opacity: st.dim ? 0.62 : 1,
								boxShadow: st.raised ? tokens.shadowSm : 'none',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								cursor: st.disabled ? 'not-allowed' : 'pointer',
								userSelect: 'none',
								transition: 'box-shadow .15s ease, transform .08s ease',
								animation: st.pulse ? 'dkCheckPulse 1.15s ease-in-out infinite' : 'none',
								'&:hover': st.disabled ? {} : { boxShadow: tokens.shadowMd },
							} }
						>
							{ /* Orientation pip — rotates WITH the table so you can tell facing. */ }
							<Box aria-hidden="true" sx={ { position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', width: 16, height: 4, borderRadius: 2, bgcolor: st.fg || tokens.muted2, opacity: 0.55 } } />
							{ /* Label counter-rotated so it always reads upright. */ }
							<Box sx={ { transform: `rotate(${ -rot }deg)`, textAlign: 'center', lineHeight: 1.05 } }>
								<Typography sx={ { fontSize: 12.5, fontWeight: 700, color: st.fg || tokens.ink } }>{ t.name }</Typography>
								{ st.sub != null && (
									<Typography sx={ { fontSize: 10, fontWeight: 600, color: st.fg || tokens.muted, fontVariantNumeric: 'tabular-nums', mt: 0.15 } }>{ st.sub }</Typography>
								) }
							</Box>
						</Box>
					);
				} ) }
			</Box>
		</Box>
	);
}
