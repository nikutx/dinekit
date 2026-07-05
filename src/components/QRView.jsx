import React, { useEffect, useState } from 'react';
import {
	Box,
	Stack,
	Typography,
	TextField,
	MenuItem,
	Button,
	CircularProgress,
	Alert,
} from '../ui';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

const UTM = 'utm_source=qr';
const withUtm = ( url ) => ( ! url ? url : url + ( url.includes( '?' ) ? '&' : '?' ) + UTM );

export default function QRView() {
	const [ pages, setPages ] = useState( [] );
	const [ selected, setSelected ] = useState( '' );
	const [ heading, setHeading ] = useState( '' );
	const [ svg, setSvg ] = useState( '' );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( '' );
	const [ showAdvanced, setShowAdvanced ] = useState( false );

	useEffect( () => {
		Promise.all( [ api.getPages(), api.getState().catch( () => ( {} ) ) ] ).then( ( [ list, state ] ) => {
			setPages( list );
			if ( state && state.siteName ) {
				setHeading( state.siteName );
			}
			const preferred =
				( state && state.menuPage && state.menuPage.url ) ||
				( list.find( ( p ) => /menu/i.test( p.title.rendered ) ) || list[ 0 ] || {} ).link ||
				'';
			setSelected( preferred );
			setLoading( false );
		} );
	}, [] );

	useEffect( () => {
		if ( ! selected ) {
			return;
		}
		setError( '' );
		api.getQr( withUtm( selected ) )
			.then( ( res ) => setSvg( res.svg ) )
			.catch( ( e ) => setError( e.message ) );
	}, [ selected ] );

	const printCard = ( size ) => {
		const title = heading || ( pages.find( ( p ) => p.link === selected ) || {} ).title?.rendered || 'Our Menu';
		const win = window.open( '', '_blank' );
		if ( ! win ) {
			return;
		}
		win.document.write(
			'<!doctype html><html><head><title>DineKit QR card</title><style>' +
				'@page{size:' + ( size === 'a4' ? 'A4' : 'A6' ) + ';margin:0}' +
				'*{box-sizing:border-box;margin:0;padding:0}' +
				'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111}' +
				'.card{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8%}' +
				'.card h1{font-size:' + ( size === 'a4' ? '48px' : '28px' ) + ';margin-bottom:0.3em}' +
				'.card p{font-size:' + ( size === 'a4' ? '22px' : '14px' ) + ';color:#555;margin-bottom:1em}' +
				'.qr{width:' + ( size === 'a4' ? '60%' : '68%' ) + ';max-width:520px}' +
				'.qr svg{width:100%;height:auto;display:block}' +
				'.foot{margin-top:1.2em;font-size:' + ( size === 'a4' ? '16px' : '11px' ) + ';color:#999}' +
				'</style></head><body><div class="card">' +
				'<h1>' + title + '</h1><p>Scan to view our menu</p>' +
				'<div class="qr">' + svg + '</div>' +
				'<div class="foot">Powered by DineKit</div>' +
				'</div><script>window.onload=function(){window.print()}</scr' + 'ipt></body></html>'
		);
		win.document.close();
	};

	const downloadSvg = () => {
		const blob = new Blob( [ svg ], { type: 'image/svg+xml' } );
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = 'dinekit-qr.svg';
		a.click();
		URL.revokeObjectURL( a.href );
	};

	if ( loading ) {
		return (
			<Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }>
				<CircularProgress />
			</Box>
		);
	}

	return (
		<Page width={ 860 }>
			<PageHeader
				title="QR Code"
				subtitle="Put a QR code on your tables. Diners point their phone camera at it and your menu opens instantly — no app, no typing."
			/>

			{ error && <Alert severity="error" sx={ { mb: 2 } }>{ error }</Alert> }
			{ ! pages.length && (
				<Alert severity="info" sx={ { mb: 2 } }>
					First, publish your menu on a page (use the “View live menu” button on the Menu Builder
					screen). Then come back here to print its QR code.
				</Alert>
			) }

			<Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 4 } alignItems="flex-start">
				{ /* Live A6 table-card mockup — what actually lands on the table. */ }
				<Card
					sx={ {
						width: '100%',
						maxWidth: 300,
						flexShrink: 0,
						aspectRatio: '3 / 4',
						boxShadow: tokens.shadowMd,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						textAlign: 'center',
						p: 3,
					} }
				>
					<Typography sx={ { fontWeight: 650, fontSize: 16, color: tokens.ink } }>
						{ heading || ( pages.find( ( p ) => p.link === selected ) || {} ).title?.rendered || 'Our Menu' }
					</Typography>
					<Typography sx={ { fontSize: 12, color: tokens.muted, mt: 0.5, mb: 2.5 } }>
						Scan for our menu
					</Typography>
					{ svg ? (
						<Box
							sx={ { width: 160, mx: 'auto', '& svg': { width: '100%', height: 'auto', display: 'block' } } }
							dangerouslySetInnerHTML={ { __html: svg } }
						/>
					) : (
						<Typography sx={ { color: tokens.muted2, py: 6 } }>No preview</Typography>
					) }
				</Card>

				{ /* Controls */ }
				<Box sx={ { flex: 1, width: '100%' } }>
					<Typography sx={ labelSx }>Wording on the card</Typography>
					<TextField
						fullWidth
						placeholder="e.g. The Copper Kettle"
						value={ heading }
						onChange={ ( e ) => setHeading( e.target.value ) }
						sx={ { mb: 2 } }
					/>

					<Typography sx={ labelSx }>Opens this page when scanned</Typography>
					<TextField
						select
						fullWidth
						value={ selected }
						onChange={ ( e ) => setSelected( e.target.value ) }
						sx={ { mb: 3 } }
					>
						{ pages.map( ( p ) => (
							<MenuItem key={ p.id } value={ p.link }>
								{ p.title.rendered || p.link }
							</MenuItem>
						) ) }
					</TextField>

					<Button
						variant="contained"
						size="large"
						fullWidth
						startIcon={ <PrintIcon /> }
						onClick={ () => printCard( 'a6' ) }
						disabled={ ! svg }
						sx={ { mb: 1 } }
					>
						Print table cards
					</Button>
					<Button
						variant="outlined"
						fullWidth
						startIcon={ <PrintIcon /> }
						onClick={ () => printCard( 'a4' ) }
						disabled={ ! svg }
					>
						Print a big A4 poster
					</Button>

					<Box sx={ { mt: 2 } }>
						<Button
							size="small"
							onClick={ () => setShowAdvanced( ! showAdvanced ) }
							sx={ { fontSize: 13, color: tokens.muted, px: 0.5 } }
						>
							{ showAdvanced ? 'Hide' : 'More options' }
						</Button>
						{ showAdvanced && (
							<Stack spacing={ 0.5 } sx={ { mt: 1 } }>
								<Button size="small" startIcon={ <DownloadIcon /> } onClick={ downloadSvg } disabled={ ! svg } sx={ { justifyContent: 'flex-start', color: tokens.muted } }>
									Download the QR image (SVG)
								</Button>
								<Typography sx={ { fontSize: 12, color: tokens.muted2 } }>
									Scans are counted automatically so you can see how many people use it.
								</Typography>
							</Stack>
						) }
					</Box>
				</Box>
			</Stack>
		</Page>
	);
}

const labelSx = {
	textTransform: 'uppercase',
	fontSize: 11,
	fontWeight: 700,
	letterSpacing: '0.04em',
	color: tokens.muted,
	mb: 0.75,
	display: 'block',
};
