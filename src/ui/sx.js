/**
 * Tiny MUI-compatible `sx` resolver. The DineKit admin is dropping MUI/emotion in
 * favour of our own primitives; this reproduces the slice of the `sx` prop the
 * app actually uses so migrating a component is just changing its import.
 *
 * Flat sx (the ~95% case) resolves to a plain React inline-style object — React
 * appends "px" to length-y numbers for us, so there is no style engine on the
 * common path. Only sx that use pseudo/nested selectors ('&:hover') or responsive
 * breakpoint objects ({ xs, md }) need real CSS; those (and only those) are
 * emitted once into a single injected <style> keyed by a hash of the sx.
 */

const SPACE = 8; // MUI theme.spacing() unit.
const RADIUS = 8; // MUI theme.shape.borderRadius.
export const BP = { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 };

// sx shorthand → CSS property (a few expand to a pair).
const SHORT = {
	m: [ 'margin' ], mt: [ 'marginTop' ], mr: [ 'marginRight' ], mb: [ 'marginBottom' ], ml: [ 'marginLeft' ],
	mx: [ 'marginLeft', 'marginRight' ], my: [ 'marginTop', 'marginBottom' ],
	p: [ 'padding' ], pt: [ 'paddingTop' ], pr: [ 'paddingRight' ], pb: [ 'paddingBottom' ], pl: [ 'paddingLeft' ],
	px: [ 'paddingLeft', 'paddingRight' ], py: [ 'paddingTop', 'paddingBottom' ],
};

// Props whose bare-number value is multiplied by the spacing unit.
const SPACED = {
	margin: 1, marginTop: 1, marginRight: 1, marginBottom: 1, marginLeft: 1,
	padding: 1, paddingTop: 1, paddingRight: 1, paddingBottom: 1, paddingLeft: 1,
	gap: 1, rowGap: 1, columnGap: 1,
};

const ALIAS = { bgcolor: 'backgroundColor' };

// CSS props whose bare numbers must NOT get a "px" suffix in the injected-CSS
// path (mirrors the relevant subset of React's own unitless list).
const UNITLESS = {
	flex: 1, flexGrow: 1, flexShrink: 1, order: 1, zIndex: 1, opacity: 1,
	fontWeight: 1, lineHeight: 1, tabSize: 1, columnCount: 1,
	fillOpacity: 1, strokeOpacity: 1,
};

function isResponsive( v ) {
	return v && typeof v === 'object' && ! Array.isArray( v ) &&
		Object.keys( v ).some( ( k ) => k in BP );
}

// Scale a scalar for a resolved CSS prop (spacing/radius units); leave the rest.
function scale( prop, val ) {
	if ( typeof val === 'number' ) {
		if ( prop === 'borderRadius' ) {
			return val * RADIUS;
		}
		if ( SPACED[ prop ] ) {
			return val * SPACE;
		}
	}
	return val;
}

/* ---- flat path: React inline style ---- */

function toStyle( sx ) {
	const out = {};
	for ( const key in sx ) {
		const val = sx[ key ];
		if ( val === undefined || val === null ) {
			continue;
		}
		const targets = SHORT[ key ] || [ ALIAS[ key ] || key ];
		for ( let i = 0; i < targets.length; i++ ) {
			out[ targets[ i ] ] = scale( targets[ i ], val );
		}
	}
	return out;
}

/* ---- complex path: one injected class ---- */

function kebab( p ) {
	return p.replace( /[A-Z]/g, ( m ) => '-' + m.toLowerCase() );
}

function cssValue( prop, val ) {
	const v = scale( prop, val );
	return ( typeof v === 'number' && ! UNITLESS[ prop ] ) ? v + 'px' : v;
}

// Flatten one style object (no nesting) into "prop:value;" declarations.
function declList( obj ) {
	let out = '';
	for ( const key in obj ) {
		const val = obj[ key ];
		if ( val === undefined || val === null ) {
			continue;
		}
		const targets = SHORT[ key ] || [ ALIAS[ key ] || key ];
		for ( let i = 0; i < targets.length; i++ ) {
			out += kebab( targets[ i ] ) + ':' + cssValue( targets[ i ], val ) + ';';
		}
	}
	return out;
}

function buildRules( cls, sx ) {
	const base = {};
	const media = {}; // breakpoint -> flat style object
	let css = '';

	for ( const key in sx ) {
		const val = sx[ key ];
		if ( val === undefined || val === null ) {
			continue;
		}
		if ( key.charAt( 0 ) === '&' ) {
			const sel = key.replace( /&/g, '.' + cls );
			css += sel + '{' + declList( val ) + '}';
			continue;
		}
		if ( isResponsive( val ) ) {
			for ( const bp in val ) {
				if ( bp === 'xs' ) {
					base[ key ] = val[ bp ];
				} else {
					media[ bp ] = media[ bp ] || {};
					media[ bp ][ key ] = val[ bp ];
				}
			}
			continue;
		}
		base[ key ] = val;
	}

	const baseDecl = declList( base );
	let head = '';
	if ( baseDecl ) {
		head = '.' + cls + '{' + baseDecl + '}';
	}
	let tail = '';
	for ( const bp in media ) {
		tail += '@media (min-width:' + BP[ bp ] + 'px){.' + cls + '{' + declList( media[ bp ] ) + '}}';
	}
	return head + css + tail;
}

function hash( str ) {
	let h = 0;
	for ( let i = 0; i < str.length; i++ ) {
		h = ( h * 31 + str.charCodeAt( i ) ) | 0;
	}
	return 'dk' + ( h >>> 0 ).toString( 36 );
}

const seen = new Set();
let sheet = null;

function inject( cls, css ) {
	if ( seen.has( cls ) ) {
		return;
	}
	seen.add( cls );
	if ( ! sheet && typeof document !== 'undefined' ) {
		sheet = document.createElement( 'style' );
		sheet.id = 'dk-sx';
		document.head.appendChild( sheet );
	}
	if ( sheet ) {
		sheet.appendChild( document.createTextNode( css ) );
	}
}

/**
 * Resolve an sx object to `{ style, className }`. Flat sx returns an inline
 * style; sx with pseudo/nested selectors or responsive values returns a class
 * (its rules injected once) and no inline style so the cascade behaves normally.
 */
export function sxResolve( sx ) {
	if ( ! sx ) {
		return { style: undefined, className: '' };
	}
	let complex = false;
	for ( const key in sx ) {
		if ( key.charAt( 0 ) === '&' || isResponsive( sx[ key ] ) ) {
			complex = true;
			break;
		}
	}
	if ( ! complex ) {
		return { style: toStyle( sx ), className: '' };
	}
	const cls = hash( JSON.stringify( sx ) );
	inject( cls, buildRules( cls, sx ) );
	return { style: undefined, className: cls };
}

// MUI "system props" — style props passable bare on Box/Stack (e.g. <Box p={2}
// width={120}>). We fold them into sx so migrated components behave like MUI.
const SYSTEM = {
	m: 1, mt: 1, mr: 1, mb: 1, ml: 1, mx: 1, my: 1,
	p: 1, pt: 1, pr: 1, pb: 1, pl: 1, px: 1, py: 1,
	gap: 1, rowGap: 1, columnGap: 1,
	display: 1, flex: 1, flexGrow: 1, flexShrink: 1, flexBasis: 1, flexDirection: 1,
	flexWrap: 1, alignItems: 1, alignContent: 1, alignSelf: 1,
	justifyContent: 1, justifyItems: 1, justifySelf: 1, order: 1,
	width: 1, height: 1, minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
	position: 1, top: 1, right: 1, bottom: 1, left: 1, zIndex: 1, overflow: 1,
	color: 1, bgcolor: 1, borderRadius: 1,
	border: 1, borderTop: 1, borderRight: 1, borderBottom: 1, borderLeft: 1, borderColor: 1,
	textAlign: 1, fontSize: 1, fontWeight: 1, fontFamily: 1, lineHeight: 1, letterSpacing: 1,
};

// Pull any bare system props out of `props` and merge them under sx (sx wins,
// matching MUI). Returns the props to spread onto the DOM element.
export function splitSystem( props, sx ) {
	let extra = null;
	const rest = {};
	for ( const key in props ) {
		if ( SYSTEM[ key ] ) {
			extra = extra || {};
			extra[ key ] = props[ key ];
		} else {
			rest[ key ] = props[ key ];
		}
	}
	return { sx: extra ? { ...extra, ...sx } : sx, rest };
}

// Join truthy class names.
export function cx() {
	let out = '';
	for ( let i = 0; i < arguments.length; i++ ) {
		if ( arguments[ i ] ) {
			out += ( out ? ' ' : '' ) + arguments[ i ];
		}
	}
	return out;
}
