import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	ToggleButton,
	ToggleButtonGroup,
	Switch,
	FormControlLabel,
	Button,
	TextField,
	Slider,
	CircularProgress,
	Select,
	MenuItem,
	Chip,
} from '../ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useToast } from './Toast';
import { copyToClipboard } from '../lib/clipboard';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

const LAYOUTS = [
	{ value: 'list', label: 'Classic list' },
	{ value: 'grid', label: 'Card grid' },
	{ value: 'chalkboard', label: 'Chalkboard' },
];
const COLS = [ '0', '1', '2', '3' ];
const TEXT_SIZES = [
	{ value: 0.9, label: 'Compact' },
	{ value: 1, label: 'Normal' },
	{ value: 1.15, label: 'Large' },
	{ value: 1.3, label: 'X-large' },
];

// Menu templates (flavours). Each has a base palette shown in the colour
// pickers until the venue overrides it.
const TEMPLATES = [
	{ value: 'signature', label: 'Signature', desc: 'The DineKit look — modern restaurants' },
	{ value: 'maison', label: 'Maison', desc: 'Fine dining & tasting menus' },
	{ value: 'counter', label: 'Counter', desc: 'Fast-casual & takeaway' },
	{ value: 'noir', label: 'Noir', desc: 'Evening menus & cocktail bars' },
	{ value: 'bistro', label: 'Bistro', desc: 'Neighbourhood bistro & pub classics' },
	{ value: 'fresh', label: 'Fresh', desc: 'Cafés, brunch & juice bars' },
	{ value: 'mono', label: 'Mono', desc: 'Minimalist & monochrome' },
];
const TEMPLATE_PALETTE = {
	signature: { accent: '#c14f24', menu_ink: '#191613', menu_muted: '#8b8175', menu_line: '#efe9df', menu_bg: '#fffdfa' },
	maison: { accent: '#7c2d3a', menu_ink: '#2b2622', menu_muted: '#8a7f73', menu_line: '#e4dccd', menu_bg: '#faf7f1' },
	counter: { accent: '#4f46e5', menu_ink: '#101319', menu_muted: '#667085', menu_line: '#edeff3', menu_bg: '' },
	noir: { accent: '#c9a26a', menu_ink: '#ece3d4', menu_muted: '#a2937c', menu_line: '#342f27', menu_bg: '#17130e' },
	bistro: { accent: '#2f5d4c', menu_ink: '#23201c', menu_muted: '#7a7367', menu_line: '#d8cfbf', menu_bg: '#f6f2e9' },
	fresh: { accent: '#0d9488', menu_ink: '#0f172a', menu_muted: '#64748b', menu_line: '#e2eeeb', menu_bg: '' },
	mono: { accent: '#111111', menu_ink: '#111111', menu_muted: '#767676', menu_line: '#e5e5e5', menu_bg: '' },
};

// One-click looks: a preset bundles template + layout options so one tap
// transforms the whole menu. Born from real venue requests — keep crediting
// them in the description; it's the plugin's story.
const PRESETS = [
	{
		key: 'gallery',
		label: 'Gallery',
		desc: 'Photo-first cards, big appetite appeal — BBQ, burgers, brunch. Suggested by a real BBQ house.',
		patch: { template: 'signature' },
		controls: { layout: 'grid', columns: '3', images: true },
	},
	{
		key: 'classic-list',
		label: 'Classic list',
		desc: 'The traditional single-column read — most restaurants.',
		patch: { template: 'signature' },
		controls: { layout: 'list', columns: '0', images: true },
	},
	{
		key: 'chalk-wall',
		label: 'Chalk wall',
		desc: 'Dark board, no photos — pubs, coffee, specials.',
		patch: { template: 'noir' },
		controls: { layout: 'chalkboard', columns: '0', images: false },
	},
];

// The Design Studio's clickable element roles. Order = hit-test priority
// (innermost/most specific first; background last as the catch-all).
// sizeKey → the per-element multiplier setting; colorKey → the shared design
// token this element's colour comes from.
const ROLES = [
	{ key: 'title', selector: '.dinekit-section__title', label: 'Section titles', sizeKey: 'menu_size_title', colorKey: 'menu_ink', colorLabel: 'Text colour', colorNote: 'Shared with dish names.' },
	{ key: 'name', selector: '.dinekit-item__name', label: 'Dish names', sizeKey: 'menu_size_name', colorKey: 'menu_ink', colorLabel: 'Text colour', colorNote: 'Shared with section titles.' },
	{ key: 'desc', selector: '.dinekit-item__desc', label: 'Descriptions', sizeKey: 'menu_size_desc', colorKey: 'menu_muted', colorLabel: 'Secondary text colour', colorNote: 'Shared with other quiet text.' },
	{ key: 'price', selector: '.dinekit-item__prices', label: 'Prices', sizeKey: 'menu_size_price', colorKey: 'accent', colorLabel: 'Accent colour', colorNote: 'Prices use your accent — this also recolours badges and highlights.' },
	{ key: 'badge', selector: '.dinekit-badge, .dinekit-diet, .dinekit-allergens', label: 'Badges & allergens', sizeKey: null, colorKey: null },
	{ key: 'media', selector: '.dinekit-section__media', label: 'Section photos', sizeKey: null, colorKey: null },
	{ key: 'filter', selector: '.dinekit-filter', label: 'Diner filter', sizeKey: null, colorKey: null },
	{ key: 'background', selector: '.dinekit-menu', label: 'Menu background', sizeKey: null, colorKey: 'menu_bg', colorLabel: 'Background colour' },
];
const roleByKey = ( key ) => ROLES.find( ( r ) => r.key === key ) || null;

const SIZE_KEYS = [ 'menu_size_title', 'menu_size_name', 'menu_size_desc', 'menu_size_price' ];

// Design Studio: click any element in the live preview, style it from the
// left rail, watch it change instantly. Saved automatically.
export default function DesignView() {
	const [ layout, setLayout ] = useState( 'list' );
	const [ columns, setColumns ] = useState( '0' );
	const [ images, setImages ] = useState( true );
	const [ allergens, setAllergens ] = useState( true );
	const [ dietary, setDietary ] = useState( true );
	const [ matrix, setMatrix ] = useState( true );
	const [ filter, setFilter ] = useState( true );
	const [ filterStyle, setFilterStyle ] = useState( 'chips' ); // chips | dropdown
	const [ allergensAs, setAllergensAs ] = useState( 'icons' ); // icons | text | codes
	const [ preview, setPreview ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ design, setDesign ] = useState( null );
	const [ selected, setSelected ] = useState( null ); // ROLES key or null
	const [ hovered, setHovered ] = useState( null );
	// What is being styled: 0 = the venue's house style (every menu that hasn't
	// been styled follows it), or a menu id = just that menu.
	const [ scope, setScope ] = useState( 0 );
	const [ menus, setMenus ] = useState( [] );
	// Which keys this menu overrides — so the rail can say what's inherited.
	const [ overrides, setOverrides ] = useState( {} );
	const iframeRef = useRef( null );
	const designRef = useRef( null );
	const selectedRef = useRef( null );
	const dsave = useRef( null );
	const toast = useToast();

	// The menu list, for the "what am I styling?" picker.
	useEffect( () => {
		api.getState().then( ( st ) => setMenus( st.menus || [] ) ).catch( () => setMenus( [] ) );
	}, [] );

	const shapeDesign = ( s ) => {
		const d = {
			template: s.template || 'signature',
			// Empty = "use the template's colour" (an override only when set).
			accent: s.accent || '',
			menu_ink: s.menu_ink || '',
			menu_muted: s.menu_muted || '',
			menu_line: s.menu_line || '',
			menu_bg: s.menu_bg || '',
			menu_radius: s.menu_radius != null ? s.menu_radius : 12,
			menu_scale: s.menu_scale != null ? Number( s.menu_scale ) : 1,
			menu_media_size: s.menu_media_size || 'full',
			menu_badge_style: s.menu_badge_style || 'accent',
		};
		SIZE_KEYS.forEach( ( k ) => ( d[ k ] = s[ k ] != null ? Number( s[ k ] ) : 1 ) );
		return d;
	};

	// Load whatever the current scope is: the house style, or one menu's own
	// look (resolved, so inherited values still show in the controls).
	useEffect( () => {
		let alive = true;
		if ( ! scope ) {
			api.getSettings().then( ( s ) => {
				if ( alive ) {
					setDesign( shapeDesign( s ) );
					setOverrides( {} );
				}
			} );
		} else {
			api.getMenuDesign( scope ).then( ( res ) => {
				if ( alive ) {
					setDesign( shapeDesign( res.resolved || {} ) );
					setOverrides( res.overrides || {} );
				}
			} );
		}
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ scope ] );

	const patchDesign = ( p ) => {
		const next = { ...design, ...p };
		setDesign( next );
		if ( scope ) {
			// Only the keys actually touched become this menu's overrides —
			// everything else keeps following the house style.
			setOverrides( ( o ) => ( { ...o, ...p } ) );
		}
		clearTimeout( dsave.current );
		dsave.current = setTimeout(
			() => ( scope ? api.saveMenuDesign( scope, p ) : api.saveSettings( next ) ),
			500
		);
	};

	// Hand one setting back to the house style.
	const inheritKey = async ( key ) => {
		if ( ! scope ) {
			return;
		}
		const res = await api.saveMenuDesign( scope, { [ key ]: null } );
		setOverrides( res.overrides || {} );
		setDesign( shapeDesign( res.resolved || {} ) );
	};

	// Hand the whole menu back.
	const resetScope = async () => {
		if ( ! scope ) {
			return;
		}
		const res = await api.resetMenuDesign( scope );
		setOverrides( {} );
		setDesign( shapeDesign( res.resolved || {} ) );
		toast.success( 'Back to your house style', 'This menu follows the venue design again.' );
	};

	const scopeName = ( menus.find( ( m ) => m.id === scope ) || {} ).name || '';

	// Apply a one-click look: saved template + the layout controls in one tap.
	const applyPreset = ( p ) => {
		patchDesign( p.patch );
		setLayout( p.controls.layout );
		setColumns( p.controls.columns );
		setImages( p.controls.images );
		toast.success(
			`“${ p.label }” applied`,
			'The preview shows it now. If your menu page uses a custom shortcode, copy the updated one below onto the page.'
		);
	};
	// Which preset matches the current studio state (for the ✓ highlight).
	const activePreset = PRESETS.find(
		( p ) =>
			design &&
			design.template === p.patch.template &&
			layout === p.controls.layout &&
			columns === p.controls.columns &&
			images === p.controls.images
	);

	// Preview HTML only refetches on structural changes — NOT on colour/size
	// tweaks, which patch into the live iframe without a reload (no flicker,
	// scroll position kept).
	const template = design ? design.template : 'signature';
	const params = useMemo(
		() => ( {
			// Preview exactly what's being styled — the whole card deck for the
			// house style, or just this menu when one is selected.
			menu: scope || '',
			layout,
			columns,
			template,
			images: images ? '1' : '0',
			allergens: allergens ? '1' : '0',
			dietary: dietary ? '1' : '0',
			matrix: matrix ? '1' : '0',
			filter: filter ? '1' : '0',
			filter_style: filterStyle,
			allergen_display: allergensAs,
		} ),
		[ scope, layout, columns, images, allergens, dietary, matrix, filter, filterStyle, allergensAs, template ]
	);

	useEffect( () => {
		let alive = true;
		setLoading( true );
		api.getPreview( params ).then( ( res ) => {
			if ( alive ) {
				setPreview( res );
				setLoading( false );
			}
		} );
		return () => {
			alive = false;
		};
	}, [ params ] );

	const shortcode = useMemo( () => {
		const parts = [ 'dinekit_menu' ];
		// A menu-scoped design only makes sense on a shortcode that asks for
		// that menu — otherwise the page renders everything in the house style.
		if ( scope ) {
			parts.push( `menu="${ scope }"` );
		}
		if ( layout !== 'list' ) {
			parts.push( `layout="${ layout }"` );
		}
		if ( columns !== '0' ) {
			parts.push( `columns="${ columns }"` );
		}
		if ( ! images ) {
			parts.push( 'images="no"' );
		}
		if ( ! allergens ) {
			parts.push( 'allergens="no"' );
		}
		if ( ! dietary ) {
			parts.push( 'dietary="no"' );
		}
		if ( ! matrix ) {
			parts.push( 'matrix="no"' );
		}
		if ( ! filter ) {
			parts.push( 'filter="no"' );
		}
		if ( filter && filterStyle !== 'chips' ) {
			parts.push( `filter_style="${ filterStyle }"` );
		}
		if ( allergens && allergensAs !== 'icons' ) {
			parts.push( `allergens_as="${ allergensAs }"` );
		}
		return `[${ parts.join( ' ' ) }]`;
	}, [ scope, layout, columns, images, allergens, dietary, matrix, filter, filterStyle, allergensAs ] );

	// ---- Live iframe plumbing -------------------------------------------------

	// The preview HTML arrives with the SAVED design baked inline on the menu
	// root (that's how the front end works) — and inline beats any stylesheet.
	// So live edits write to the same place: the element's own style.
	const applyLiveVars = () => {
		const doc = iframeRef.current && iframeRef.current.contentDocument;
		const menu = doc && doc.querySelector && doc.querySelector( '.dinekit-menu' );
		const d = designRef.current;
		if ( ! menu || ! d ) {
			return;
		}
		menu.style.setProperty( '--dinekit-radius', `${ d.menu_radius }px` );
		menu.style.setProperty( '--dinekit-scale', String( d.menu_scale != null ? d.menu_scale : 1 ) );
		[ [ 'accent', 'accent' ], [ 'menu_ink', 'ink' ], [ 'menu_muted', 'muted' ], [ 'menu_line', 'line' ], [ 'menu_bg', 'bg' ] ].forEach( ( [ k, t ] ) => {
			if ( d[ k ] ) {
				menu.style.setProperty( `--dinekit-${ t }`, d[ k ] );
			} else {
				menu.style.removeProperty( `--dinekit-${ t }` );
			}
		} );
		[ [ 'menu_size_title', 'title' ], [ 'menu_size_name', 'name' ], [ 'menu_size_desc', 'desc' ], [ 'menu_size_price', 'price' ] ].forEach( ( [ k, t ] ) => {
			menu.style.setProperty( `--dinekit-size-${ t }`, String( d[ k ] != null ? d[ k ] : 1 ) );
		} );
		const mediaH = { banner: '220px', standard: '420px' }[ d.menu_media_size ];
		if ( mediaH ) {
			menu.style.setProperty( '--dinekit-media-h', mediaH );
		} else {
			menu.style.removeProperty( '--dinekit-media-h' );
		}
		menu.classList.toggle( 'dinekit-menu--badges-varied', d.menu_badge_style === 'varied' );
	};

	const markSelection = () => {
		const doc = iframeRef.current && iframeRef.current.contentDocument;
		if ( ! doc || ! doc.body ) {
			return;
		}
		doc.querySelectorAll( '.dk-studio-selected' ).forEach( ( el ) => el.classList.remove( 'dk-studio-selected' ) );
		const role = roleByKey( selectedRef.current );
		if ( role ) {
			doc.querySelectorAll( role.selector ).forEach( ( el ) => el.classList.add( 'dk-studio-selected' ) );
		}
	};

	// Wire hover outlines + click-to-select into the preview document. The
	// iframe is srcDoc (same-origin) so we can script it directly. All clicks
	// are captured — the preview never navigates or filters while in the studio.
	const attachStudio = () => {
		const doc = iframeRef.current && iframeRef.current.contentDocument;
		if ( ! doc || ! doc.body || doc.getElementById( 'dk-studio-css' ) ) {
			applyLiveVars();
			markSelection();
			return;
		}
		const style = doc.createElement( 'style' );
		style.id = 'dk-studio-css';
		style.textContent = `
			.dk-studio-hover { outline: 2px dashed rgba(79,70,229,0.7) !important; outline-offset: 3px; cursor: pointer !important; }
			.dk-studio-selected { outline: 2px solid #4f46e5 !important; outline-offset: 3px; }
			body { cursor: default; }
		`;
		doc.head.appendChild( style );

		const roleFor = ( target ) => {
			for ( const role of ROLES ) {
				const el = target.closest ? target.closest( role.selector ) : null;
				if ( el ) {
					return { role, el };
				}
			}
			return null;
		};

		let hoverEl = null;
		doc.body.addEventListener( 'mousemove', ( e ) => {
			const hit = roleFor( e.target );
			const el = hit && hit.role.key !== 'background' ? hit.el : null;
			if ( el !== hoverEl ) {
				if ( hoverEl ) {
					hoverEl.classList.remove( 'dk-studio-hover' );
				}
				hoverEl = el;
				if ( hoverEl ) {
					hoverEl.classList.add( 'dk-studio-hover' );
				}
				setHovered( hit && hit.role.key !== 'background' ? hit.role.key : null );
			}
		} );
		doc.body.addEventListener(
			'click',
			( e ) => {
				e.preventDefault();
				e.stopPropagation();
				const hit = roleFor( e.target );
				const key = hit ? hit.role.key : null;
				setSelected( ( prev ) => ( prev === key ? null : key ) );
			},
			true
		);
		applyLiveVars();
		markSelection();
	};

	useEffect( () => {
		designRef.current = design;
		applyLiveVars();
	}, [ design ] );
	useEffect( () => {
		selectedRef.current = selected;
		markSelection();
	}, [ selected, preview ] );

	const srcDoc = preview
		? `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${ preview.cssUrl }"><style>body{margin:0;padding:20px;background:#fff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}</style></head><body>${ preview.html }<script src="${ preview.jsUrl }"></script></body></html>`
		: '';

	const copyShortcode = () => {
		copyToClipboard( shortcode );
		toast.info( 'Shortcode copied', 'Paste it into any page or post to show this menu.' );
	};

	const selectedRole = roleByKey( selected );
	const palette = design ? TEMPLATE_PALETTE[ design.template ] || {} : {};

	const colorPicker = ( key, fallback ) => (
		<Stack direction="row" spacing={ 0.75 } alignItems="center">
			<Box
				component="input"
				type="color"
				value={ ( design && design[ key ] ) || fallback || '#000000' }
				onChange={ ( e ) => patchDesign( { [ key ]: e.target.value } ) }
				sx={ { width: 46, height: 34, p: 0, border: `1px solid ${ tokens.border2 }`, borderRadius: 1, bgcolor: 'transparent', cursor: 'pointer' } }
			/>
			{ design && design[ key ] && (
				<Button size="small" onClick={ () => patchDesign( { [ key ]: '' } ) } sx={ { color: tokens.muted, minWidth: 0 } }>
					Clear
				</Button>
			) }
		</Stack>
	);

	const sizeSlider = ( sizeKey, label ) => (
		<Box key={ sizeKey } sx={ { width: '100%' } }>
			<Stack direction="row" justifyContent="space-between" alignItems="baseline">
				<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.ink2 } }>{ label }</Typography>
				<Typography sx={ { fontSize: 12, color: tokens.muted, fontVariantNumeric: 'tabular-nums' } }>
					{ Math.round( ( design ? design[ sizeKey ] : 1 ) * 100 ) }%
					{ design && Math.abs( design[ sizeKey ] - 1 ) > 0.001 && (
						<Button size="small" onClick={ () => patchDesign( { [ sizeKey ]: 1 } ) } sx={ { color: tokens.muted, minWidth: 0, ml: 0.5, p: 0 } }>
							reset
						</Button>
					) }
				</Typography>
			</Stack>
			<Slider
				value={ Math.round( ( design ? design[ sizeKey ] : 1 ) * 100 ) }
				min={ 70 }
				max={ 160 }
				step={ 5 }
				onChange={ ( e, v ) => patchDesign( { [ sizeKey ]: v / 100 } ) }
			/>
		</Box>
	);

	// Contextual controls for the element clicked in the preview.
	const selectedPanel = selectedRole && design && (
		<Card sx={ { p: 2, mb: 2, border: `2px solid ${ tokens.accent }` } }>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1 } }>
				<Typography sx={ { fontSize: 14, fontWeight: 800, color: tokens.ink } }>{ selectedRole.label }</Typography>
				<Button size="small" startIcon={ <CloseIcon sx={ { fontSize: 15 } } /> } onClick={ () => setSelected( null ) } sx={ { color: tokens.muted, minWidth: 0 } }>
					Done
				</Button>
			</Stack>
			<Stack spacing={ 1.5 }>
				{ selectedRole.sizeKey && sizeSlider( selectedRole.sizeKey, 'Size' ) }
				{ selectedRole.colorKey && (
					<Box>
						<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.ink2, mb: 0.5 } }>{ selectedRole.colorLabel }</Typography>
						{ colorPicker( selectedRole.colorKey, palette[ selectedRole.colorKey ] ) }
						{ selectedRole.colorNote && (
							<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 0.5 } }>{ selectedRole.colorNote }</Typography>
						) }
					</Box>
				) }
				{ selectedRole.key === 'badge' && (
					<Stack spacing={ 0.5 }>
						<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ dietary } onChange={ ( e ) => setDietary( e.target.checked ) } /> } label="Show dietary badges" />
						<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ allergens } onChange={ ( e ) => setAllergens( e.target.checked ) } /> } label="Show allergens" />
						<Box>
							<Typography sx={ { ...labelSx, mb: 0.5 } }>Allergens as</Typography>
							<ToggleButtonGroup exclusive size="small" value={ allergensAs } onChange={ ( e, v ) => v && setAllergensAs( v ) }>
								<ToggleButton value="icons" sx={ { px: 1.5, textTransform: 'none' } }>Icons</ToggleButton>
								<ToggleButton value="text" sx={ { px: 1.5, textTransform: 'none' } }>Text</ToggleButton>
								<ToggleButton value="codes" sx={ { px: 1.5, textTransform: 'none' } }>Codes</ToggleButton>
							</ToggleButtonGroup>
						</Box>
						<Box>
							<Typography sx={ { ...labelSx, mb: 0.5 } }>Badge colours</Typography>
							<ToggleButtonGroup exclusive size="small" value={ design.menu_badge_style || 'accent' } onChange={ ( e, v ) => v && patchDesign( { menu_badge_style: v } ) }>
								<ToggleButton value="accent" sx={ { px: 1.5, textTransform: 'none' } }>One colour</ToggleButton>
								<ToggleButton value="varied" sx={ { px: 1.5, textTransform: 'none' } }>Colour by badge</ToggleButton>
							</ToggleButtonGroup>
							<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 0.5 } }>
								Colour by badge gives each badge its own tone, so Seasonal and Must try stop looking alike. Suggested by a real BBQ house.
							</Typography>
						</Box>
					</Stack>
				) }
				{ selectedRole.key === 'media' && (
					<Box>
						<Typography sx={ { ...labelSx, mb: 0.5 } }>Photo size</Typography>
						<ToggleButtonGroup exclusive size="small" value={ design.menu_media_size || 'full' } onChange={ ( e, v ) => v && patchDesign( { menu_media_size: v } ) }>
							<ToggleButton value="banner" sx={ { px: 1.5, textTransform: 'none' } }>Short banner</ToggleButton>
							<ToggleButton value="standard" sx={ { px: 1.5, textTransform: 'none' } }>Standard</ToggleButton>
							<ToggleButton value="full" sx={ { px: 1.5, textTransform: 'none' } }>Full image</ToggleButton>
						</ToggleButtonGroup>
						<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 0.5 } }>
							Short banner keeps the menu about the food — wide, shallow photos (around 1600 × 500 pixels) look best.
						</Typography>
					</Box>
				) }
				{ selectedRole.key === 'filter' && (
					<Stack spacing={ 0.75 }>
						<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ filter } onChange={ ( e ) => setFilter( e.target.checked ) } /> } label="Show the diner filter" />
						<Box>
							<Typography sx={ { ...labelSx, mb: 0.5 } }>Style</Typography>
							<ToggleButtonGroup exclusive size="small" value={ filterStyle } onChange={ ( e, v ) => v && setFilterStyle( v ) }>
								<ToggleButton value="chips" sx={ { px: 1.5, textTransform: 'none' } }>Chips</ToggleButton>
								<ToggleButton value="dropdown" sx={ { px: 1.5, textTransform: 'none' } }>Dropdown</ToggleButton>
							</ToggleButtonGroup>
						</Box>
					</Stack>
				) }
				{ selectedRole.key === 'background' && (
					<Box>
						<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.ink2, mb: 0.5 } }>Corner rounding</Typography>
						<TextField
							type="number"
							size="small"
							value={ design.menu_radius }
							onChange={ ( e ) => patchDesign( { menu_radius: Math.max( 0, Math.min( 40, parseInt( e.target.value, 10 ) || 0 ) ) } ) }
							sx={ { width: 100 } }
						/>
					</Box>
				) }
			</Stack>
		</Card>
	);

	return (
		<Page width={ 1600 }>
			<PageHeader
				title="Design Studio"
				subtitle="Click any part of the menu preview to style it — sizes and colours update live and save automatically. Copy the shortcode to put this exact menu on any page."
			/>

			<Stack direction="row" spacing={ 2.5 } alignItems="stretch">
				{ /* ---- Left rail: contextual panel + global controls ---- */ }
				<Box sx={ { width: 340, flexShrink: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', minHeight: 560, pr: 0.5 } }>
					{ /* What am I styling? The house style, or one menu. */ }
					<Card sx={ { p: 1.5, mb: 2 } }>
						<Typography sx={ { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.muted2, mb: 0.75 } }>
							Styling
						</Typography>
						<Select
							value={ String( scope ) }
							onChange={ ( e ) => setScope( Number( e.target.value ) ) }
							size="small"
							fullWidth
						>
							<MenuItem value="0">Your house style (all menus)</MenuItem>
							{ menus.map( ( m ) => (
								<MenuItem key={ m.id } value={ String( m.id ) }>
									Just “{ m.name }”
								</MenuItem>
							) ) }
						</Select>
						<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.75 } }>
							{ scope
								? `Changes here apply to “${ scopeName }” only. Anything you don’t change follows your house style — including later changes to it.`
								: 'Your default look. Every menu you haven’t styled separately follows this.' }
						</Typography>
						{ scope && Object.keys( overrides ).length > 0 && (
							<Stack direction="row" alignItems="center" spacing={ 1 } sx={ { mt: 1 } }>
								<Chip
									size="small"
									label={ `${ Object.keys( overrides ).length } own setting${ Object.keys( overrides ).length === 1 ? '' : 's' }` }
									sx={ { bgcolor: tokens.accentSoft, color: tokens.accentDark, fontWeight: 600 } }
								/>
								<Button size="small" variant="text" onClick={ resetScope } sx={ { color: tokens.muted } }>
									Use my house style
								</Button>
							</Stack>
						) }
					</Card>

					{ selectedPanel }

					{ ! selectedRole && (
						<Card sx={ { p: 1.5, mb: 2, bgcolor: tokens.accentSoft, border: 0 } }>
							<Typography sx={ { fontSize: 12.5, color: tokens.accentDark } }>
								💡 <strong>Click anything in the preview</strong> — a section title, dish name, price — to style just that element.
							</Typography>
						</Card>
					) }

					{ design && (
						<Card sx={ { p: 2, mb: 2 } }>
							<Typography sx={ { ...labelSx, mb: 0.5 } }>One-click looks</Typography>
							<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mb: 1.25 } }>
								A whole style in one tap — template, layout and photos together.
							</Typography>
							<Stack spacing={ 0.75 }>
								{ PRESETS.map( ( p ) => (
									<Box
										key={ p.key }
										onClick={ () => applyPreset( p ) }
										sx={ {
											px: 1.5,
											py: 1,
											borderRadius: 2,
											cursor: 'pointer',
											border: `1px solid ${ activePreset && activePreset.key === p.key ? tokens.accent : tokens.border }`,
											bgcolor: activePreset && activePreset.key === p.key ? tokens.accentSoft : 'transparent',
											'&:hover': { borderColor: tokens.accent },
										} }
									>
										<Box sx={ { fontWeight: 700, fontSize: 13 } }>
											{ p.label }
											{ activePreset && activePreset.key === p.key ? ' ✓' : '' }
										</Box>
										<Box sx={ { fontSize: 11, color: tokens.muted } }>{ p.desc }</Box>
									</Box>
								) ) }
							</Stack>
							{ ! activePreset && (
								<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 1 } }>
									You’re on your own mix — a look is a starting point (template + layout together), and
									changing either afterwards makes it yours. Tap a look any time to jump back.
								</Typography>
							) }
						</Card>
					) }

					{ design && (
						<Card sx={ { p: 2, mb: 2 } }>
							<Typography sx={ { ...labelSx, mb: 1.25 } }>Template</Typography>
							<Stack spacing={ 0.75 }>
								{ TEMPLATES.map( ( t ) => (
									<Box
										key={ t.value }
										className="dk-template-swatch"
										data-template={ t.value }
										onClick={ () => patchDesign( { template: t.value } ) }
										sx={ {
											px: 1.5,
											py: 1,
											borderRadius: 2,
											cursor: 'pointer',
											border: `1px solid ${ design.template === t.value ? tokens.accent : tokens.border }`,
											bgcolor: design.template === t.value ? tokens.accentSoft : 'transparent',
											'&:hover': { borderColor: tokens.accent },
										} }
									>
										<Stack direction="row" alignItems="center" spacing={ 1 }>
											<Box sx={ { width: 14, height: 14, borderRadius: '50%', bgcolor: TEMPLATE_PALETTE[ t.value ].accent, flexShrink: 0 } } />
											<Box>
												<Box sx={ { fontWeight: 700, fontSize: 13 } }>{ t.label }</Box>
												<Box sx={ { fontSize: 11, color: tokens.muted } }>{ t.desc }</Box>
											</Box>
										</Stack>
									</Box>
								) ) }
							</Stack>
						</Card>
					) }

					{ design && (
						<Card sx={ { p: 2, mb: 2 } }>
							<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1.25 } }>
								<Typography sx={ labelSx }>Colours</Typography>
								<Button size="small" onClick={ () => patchDesign( { accent: '', menu_ink: '', menu_muted: '', menu_line: '', menu_bg: '' } ) } sx={ { color: tokens.muted, minWidth: 0 } }>
									Reset to template
								</Button>
							</Stack>
							<Stack direction="row" spacing={ 2 } rowGap={ 1.5 } flexWrap="wrap">
								{ [
									[ 'accent', 'Accent' ],
									[ 'menu_ink', 'Text' ],
									[ 'menu_muted', 'Secondary' ],
									[ 'menu_line', 'Lines' ],
									[ 'menu_bg', 'Background' ],
								].map( ( [ key, label ] ) => (
									<Box key={ key }>
										<Typography sx={ { ...labelSx, mb: 0.5 } }>{ label }</Typography>
										{ colorPicker( key, palette[ key ] || ( key === 'menu_bg' ? '#ffffff' : '#000000' ) ) }
									</Box>
								) ) }
							</Stack>
							<Typography sx={ { fontSize: 11.5, color: tokens.muted2, mt: 1.25 } }>
								Leave a colour cleared to use the template’s own. Accent + corner rounding also style your Order Online page.
							</Typography>
						</Card>
					) }

					{ design && (
						<Card sx={ { p: 2, mb: 2 } }>
							<Typography sx={ { ...labelSx, mb: 1.25 } }>Text sizes</Typography>
							<Stack spacing={ 1.25 }>
								<Box>
									<Typography sx={ { ...labelSx, mb: 0.5 } }>Everything</Typography>
									<ToggleButtonGroup exclusive size="small" value={ Number( design.menu_scale ) } onChange={ ( e, v ) => v != null && patchDesign( { menu_scale: v } ) }>
										{ TEXT_SIZES.map( ( s ) => (
											<ToggleButton key={ s.value } value={ s.value } sx={ { px: 1.25, textTransform: 'none' } }>{ s.label }</ToggleButton>
										) ) }
									</ToggleButtonGroup>
								</Box>
								{ sizeSlider( 'menu_size_title', 'Section titles' ) }
								{ sizeSlider( 'menu_size_name', 'Dish names' ) }
								{ sizeSlider( 'menu_size_desc', 'Descriptions' ) }
								{ sizeSlider( 'menu_size_price', 'Prices' ) }
							</Stack>
						</Card>
					) }

					<Card sx={ { p: 2, mb: 2 } }>
						<Typography sx={ { ...labelSx, mb: 1.25 } }>Layout & display</Typography>
						<Stack spacing={ 1.5 }>
							<Box>
								<Typography sx={ { ...labelSx, mb: 0.5 } }>Layout</Typography>
								<ToggleButtonGroup exclusive size="small" value={ layout } onChange={ ( e, v ) => v && setLayout( v ) }>
									{ LAYOUTS.map( ( l ) => (
										<ToggleButton key={ l.value } value={ l.value } sx={ { px: 1.25, textTransform: 'none' } }>
											{ l.label }
										</ToggleButton>
									) ) }
								</ToggleButtonGroup>
							</Box>
							<Box>
								<Typography sx={ { ...labelSx, mb: 0.5 } }>Columns</Typography>
								<ToggleButtonGroup exclusive size="small" value={ columns } onChange={ ( e, v ) => v && setColumns( v ) }>
									{ COLS.map( ( c ) => (
										<ToggleButton key={ c } value={ c } sx={ { px: 1.5 } }>
											{ c === '0' ? 'Auto' : c }
										</ToggleButton>
									) ) }
								</ToggleButtonGroup>
							</Box>
							<Stack spacing={ 0.25 }>
								<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ images } onChange={ ( e ) => setImages( e.target.checked ) } /> } label="Photos" />
								<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ allergens } onChange={ ( e ) => setAllergens( e.target.checked ) } /> } label="Allergens" />
								<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ dietary } onChange={ ( e ) => setDietary( e.target.checked ) } /> } label="Dietary badges" />
								<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ matrix } onChange={ ( e ) => setMatrix( e.target.checked ) } /> } label="Allergen matrix" />
								<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ filter } onChange={ ( e ) => setFilter( e.target.checked ) } /> } label="Diner filter" />
							</Stack>
						</Stack>
					</Card>

					<Card sx={ { p: 2, mb: 2 } }>
						<Typography sx={ { ...labelSx, mb: 0.75 } }>Shortcode</Typography>
						<Box sx={ { fontFamily: 'monospace', fontSize: 12, color: tokens.ink2, bgcolor: tokens.soft, border: `1px solid ${ tokens.border }`, borderRadius: 1.5, px: 1, py: 0.75, wordBreak: 'break-all', mb: 1 } }>
							{ shortcode }
						</Box>
						<Button size="small" variant="outlined" startIcon={ <ContentCopyIcon /> } onClick={ copyShortcode }>
							Copy shortcode
						</Button>
					</Card>
				</Box>

				{ /* ---- Preview, framed as a little browser window ---- */ }
				<Box sx={ { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } }>
					<Box
						sx={ {
							border: `1px solid ${ tokens.border }`,
							borderRadius: '12px',
							overflow: 'hidden',
							bgcolor: '#fff',
							display: 'flex',
							flexDirection: 'column',
							height: 'calc(100vh - 200px)',
							minHeight: 560,
						} }
					>
						<Box
							sx={ {
								height: 36,
								flexShrink: 0,
								bgcolor: tokens.soft,
								borderBottom: `1px solid ${ tokens.border }`,
								display: 'flex',
								alignItems: 'center',
								px: 1.5,
								position: 'relative',
							} }
						>
							<Stack direction="row" spacing={ 0.75 }>
								{ [ '#f87171', '#fbbf24', '#34d399' ].map( ( c ) => (
									<Box key={ c } sx={ { width: 8, height: 8, borderRadius: '50%', bgcolor: c } } />
								) ) }
							</Stack>
							<Box
								sx={ {
									position: 'absolute',
									left: '50%',
									transform: 'translateX(-50%)',
									bgcolor: tokens.surface,
									border: `1px solid ${ tokens.border }`,
									borderRadius: 999,
									px: 1.5,
									py: 0.25,
									fontSize: 11.5,
									color: tokens.muted,
									whiteSpace: 'nowrap',
									userSelect: 'none',
								} }
							>
								yoursite.com/menu
							</Box>
							<Box sx={ { ml: 'auto', fontSize: 11.5, color: hovered ? tokens.accent : tokens.muted2, fontWeight: 600, whiteSpace: 'nowrap' } }>
								{ hovered ? `Click to style: ${ ( roleByKey( hovered ) || {} ).label }` : 'Click any element to style it' }
							</Box>
						</Box>

						<Box sx={ { position: 'relative', flex: 1, minHeight: 0 } }>
							{ loading && (
								<Box sx={ { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.6)', zIndex: 1 } }>
									<CircularProgress size={ 28 } />
								</Box>
							) }
							<Box
								component="iframe"
								ref={ iframeRef }
								title="Menu preview"
								srcDoc={ srcDoc }
								onLoad={ attachStudio }
								sx={ { width: '100%', height: '100%', border: 0, display: 'block' } }
							/>
						</Box>
					</Box>
				</Box>
			</Stack>
		</Page>
	);
}

const compactSwitch = { m: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } };

const labelSx = {
	textTransform: 'uppercase',
	fontSize: 11,
	fontWeight: 700,
	letterSpacing: '0.04em',
	color: tokens.muted,
	mb: 0.75,
	display: 'block',
};
