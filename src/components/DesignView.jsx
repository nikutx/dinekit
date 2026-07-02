import React, { useEffect, useMemo, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	ToggleButton,
	ToggleButtonGroup,
	Switch,
	FormControlLabel,
	Button,
	CircularProgress,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokens } from '../theme';
import { api } from '../api/client';
import { useToast } from './Toast';
import { copyToClipboard } from '../lib/clipboard';

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
	const toast = useToast();

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

	const srcDoc = preview
		? `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${ preview.cssUrl }"><style>body{margin:0;padding:20px;background:#fff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}</style></head><body>${ preview.html }<script src="${ preview.jsUrl }"></script></body></html>`
		: '';

	const copyShortcode = () => {
		copyToClipboard( shortcode );
		toast.info( 'Shortcode copied', 'Paste it into any page or post to show this menu.' );
	};

	return (
		<Box sx={ { maxWidth: 1320, mx: 'auto' } }>
			<Typography variant="h5" sx={ { mb: 0.5 } }>
				Design & Preview
			</Typography>
			<Typography sx={ { color: tokens.muted, mb: 3 } }>
				Choose how your menu looks, preview it exactly as diners will see it, then copy the
				shortcode to drop it onto any page.
			</Typography>

			{ /* Compact toolbar (keeps the preview below full-width so column
			     counts render truthfully). */ }
			<Box
				sx={ {
					bgcolor: tokens.surface,
					border: `1px solid ${ tokens.border }`,
					borderRadius: 3,
					p: 2,
					mb: 2.5,
				} }
			>
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
			</Box>

			{ /* Full-width preview */ }
			<Typography sx={ labelSx }>Live preview</Typography>
			<Box
				sx={ {
					border: `1px solid ${ tokens.border }`,
					borderRadius: 3,
					overflow: 'hidden',
					bgcolor: '#fff',
					position: 'relative',
				} }
			>
				{ loading && (
					<Box sx={ { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.6)', zIndex: 1 } }>
						<CircularProgress size={ 28 } />
					</Box>
				) }
				<Box component="iframe" title="Menu preview" srcDoc={ srcDoc } sx={ { width: '100%', height: 720, border: 0, display: 'block' } } />
			</Box>
		</Box>
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
