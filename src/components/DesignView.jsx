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
	CircularProgress,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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

// Design & Preview: pick a style, see an isolated live preview of the real
// menu, and copy the shortcode that produces exactly what you see.
export default function DesignView() {
	const [ layout, setLayout ] = useState( 'list' );
	const [ columns, setColumns ] = useState( '0' );
	const [ images, setImages ] = useState( true );
	const [ allergens, setAllergens ] = useState( true );
	const [ dietary, setDietary ] = useState( true );
	const [ matrix, setMatrix ] = useState( true );
	const [ filter, setFilter ] = useState( true );
	const [ preview, setPreview ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ design, setDesign ] = useState( null );
	const dsave = useRef( null );
	const toast = useToast();

	useEffect( () => {
		api.getSettings().then( ( s ) =>
			setDesign( {
				accent: s.accent || '#b91c1c',
				menu_ink: s.menu_ink || '#1f2937',
				menu_muted: s.menu_muted || '#6b7280',
				menu_line: s.menu_line || '#e5e7eb',
				menu_bg: s.menu_bg || '',
				menu_radius: s.menu_radius != null ? s.menu_radius : 12,
			} )
		);
	}, [] );

	const patchDesign = ( p ) => {
		const next = { ...design, ...p };
		setDesign( next );
		clearTimeout( dsave.current );
		dsave.current = setTimeout( () => api.saveSettings( next ), 500 );
	};

	const params = useMemo(
		() => ( {
			layout,
			columns,
			images: images ? '1' : '0',
			allergens: allergens ? '1' : '0',
			dietary: dietary ? '1' : '0',
			matrix: matrix ? '1' : '0',
			filter: filter ? '1' : '0',
		} ),
		[ layout, columns, images, allergens, dietary, matrix, filter ]
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
		return `[${ parts.join( ' ' ) }]`;
	}, [ layout, columns, images, allergens, dietary, matrix, filter ] );

	// Live colour overrides so the preview reflects unsaved picks instantly.
	const varStyle = design
		? `.dinekit-menu{--dinekit-accent:${ design.accent };--dinekit-ink:${ design.menu_ink };--dinekit-muted:${ design.menu_muted };--dinekit-line:${ design.menu_line };--dinekit-radius:${ design.menu_radius }px;${ design.menu_bg ? `--dinekit-bg:${ design.menu_bg };` : '' }}`
		: '';
	const srcDoc = preview
		? `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${ preview.cssUrl }"><style>body{margin:0;padding:20px;background:#fff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}${ varStyle }</style></head><body>${ preview.html }<script src="${ preview.jsUrl }"></script></body></html>`
		: '';

	const copyShortcode = () => {
		copyToClipboard( shortcode );
		toast.info( 'Shortcode copied', 'Paste it into any page or post to show this menu.' );
	};

	return (
		<Page width={ 1320 }>
			<PageHeader
				title="Design & Preview"
				subtitle="Choose how your menu looks, preview it exactly as diners will see it, then copy the shortcode to drop it onto any page."
			/>

			{ /* Compact toolbar (keeps the preview below full-width so column
			     counts render truthfully). */ }
			<Card sx={ { p: 2, mb: 2.5 } }>
				<Stack direction="row" spacing={ 3 } rowGap={ 2 } alignItems="flex-end" flexWrap="wrap">
					<Box>
						<Typography sx={ labelSx }>Layout</Typography>
						<ToggleButtonGroup exclusive size="small" value={ layout } onChange={ ( e, v ) => v && setLayout( v ) }>
							{ LAYOUTS.map( ( l ) => (
								<ToggleButton key={ l.value } value={ l.value } sx={ { px: 1.75, textTransform: 'none' } }>
									{ l.label }
								</ToggleButton>
							) ) }
						</ToggleButtonGroup>
					</Box>

					<Box>
						<Typography sx={ labelSx }>Columns</Typography>
						<ToggleButtonGroup exclusive size="small" value={ columns } onChange={ ( e, v ) => v && setColumns( v ) }>
							{ COLS.map( ( c ) => (
								<ToggleButton key={ c } value={ c } sx={ { px: 1.75 } }>
									{ c === '0' ? 'Auto' : c }
								</ToggleButton>
							) ) }
						</ToggleButtonGroup>
					</Box>

					<Box>
						<Typography sx={ labelSx }>Show</Typography>
						<Stack direction="row" flexWrap="wrap" sx={ { columnGap: 1 } }>
							<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ images } onChange={ ( e ) => setImages( e.target.checked ) } /> } label="Photos" />
							<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ allergens } onChange={ ( e ) => setAllergens( e.target.checked ) } /> } label="Allergens" />
							<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ dietary } onChange={ ( e ) => setDietary( e.target.checked ) } /> } label="Dietary" />
							<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ matrix } onChange={ ( e ) => setMatrix( e.target.checked ) } /> } label="Matrix" />
							<FormControlLabel sx={ compactSwitch } control={ <Switch size="small" checked={ filter } onChange={ ( e ) => setFilter( e.target.checked ) } /> } label="Filter" />
						</Stack>
					</Box>

					<Box sx={ { flex: 1, minWidth: 240 } }>
						<Typography sx={ labelSx }>Shortcode</Typography>
						<Stack direction="row" spacing={ 1 } alignItems="center">
							<Box sx={ { flex: 1, fontFamily: 'monospace', fontSize: 12.5, color: tokens.ink2, bgcolor: tokens.soft, border: `1px solid ${ tokens.border }`, borderRadius: 1.5, px: 1, py: 0.75, wordBreak: 'break-all' } }>
								{ shortcode }
							</Box>
							<Button size="small" variant="outlined" startIcon={ <ContentCopyIcon /> } onClick={ copyShortcode } sx={ { flexShrink: 0 } }>
								Copy
							</Button>
						</Stack>
					</Box>
				</Stack>
			</Card>

			{ /* Colours — every menu token, saved and applied to the live front end. */ }
			{ design && (
				<Card sx={ { p: 2, mb: 2.5 } }>
					<Typography sx={ { ...labelSx, mb: 1.5 } }>Colours</Typography>
					<Stack direction="row" spacing={ 3 } rowGap={ 2 } flexWrap="wrap" alignItems="flex-end">
						{ [
							[ 'accent', 'Accent' ],
							[ 'menu_ink', 'Text' ],
							[ 'menu_muted', 'Muted text' ],
							[ 'menu_line', 'Lines' ],
						].map( ( [ key, label ] ) => (
							<Box key={ key }>
								<Typography sx={ labelSx }>{ label }</Typography>
								<Box
									component="input"
									type="color"
									value={ design[ key ] }
									onChange={ ( e ) => patchDesign( { [ key ]: e.target.value } ) }
									sx={ { width: 46, height: 34, p: 0, border: `1px solid ${ tokens.border2 }`, borderRadius: 1, bgcolor: 'transparent', cursor: 'pointer' } }
								/>
							</Box>
						) ) }
						<Box>
							<Typography sx={ labelSx }>Background</Typography>
							<Stack direction="row" spacing={ 0.75 } alignItems="center">
								<Box
									component="input"
									type="color"
									value={ design.menu_bg || '#ffffff' }
									onChange={ ( e ) => patchDesign( { menu_bg: e.target.value } ) }
									sx={ { width: 46, height: 34, p: 0, border: `1px solid ${ tokens.border2 }`, borderRadius: 1, bgcolor: 'transparent', cursor: 'pointer' } }
								/>
								<Button size="small" onClick={ () => patchDesign( { menu_bg: '' } ) } sx={ { color: tokens.muted, minWidth: 0 } }>
									Clear
								</Button>
							</Stack>
						</Box>
						<TextField
							label="Radius (px)"
							type="number"
							size="small"
							value={ design.menu_radius }
							onChange={ ( e ) => patchDesign( { menu_radius: Math.max( 0, Math.min( 40, parseInt( e.target.value, 10 ) || 0 ) ) } ) }
							sx={ { width: 110 } }
						/>
					</Stack>
					<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 1.5 } }>
						Saved automatically and applied to your live menu. Colours are scoped to <code>.dinekit-menu</code> as CSS custom properties — a theme can’t easily override them, and developers can via the <code>dinekit_menu_style_vars</code> filter.
					</Typography>
				</Card>
			) }

			{ /* Full-width preview, framed as a little browser window */ }
			<Typography sx={ labelSx }>Live preview</Typography>
			<Box
				sx={ {
					border: `1px solid ${ tokens.border }`,
					borderRadius: '12px',
					overflow: 'hidden',
					bgcolor: '#fff',
				} }
			>
				{ /* Browser chrome bar */ }
				<Box
					sx={ {
						height: 36,
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
				</Box>

				<Box sx={ { position: 'relative' } }>
					{ loading && (
						<Box sx={ { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.6)', zIndex: 1 } }>
							<CircularProgress size={ 28 } />
						</Box>
					) }
					<Box component="iframe" title="Menu preview" srcDoc={ srcDoc } sx={ { width: '100%', height: 720, border: 0, display: 'block' } } />
				</Box>
			</Box>
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
