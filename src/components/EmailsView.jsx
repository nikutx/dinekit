import React, { useEffect, useRef, useState } from 'react';
import { Box, Stack, Typography, TextField, MenuItem, Select, Chip, CircularProgress, Divider } from '../ui';
import { tokens } from '../theme';
import { api } from '../api/client';
import Page from './ui/Page';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';
import PageTour from './PageTour';

const PLACEHOLDERS = [ '{name}', '{number}', '{site}', '{date}', '{time}' ];

export default function EmailsView() {
	const [ cfg, setCfg ] = useState( null );
	const [ sel, setSel ] = useState( '' );
	const [ preview, setPreview ] = useState( null );
	const debounce = useRef( null );

	useEffect( () => {
		api.getEmails().then( ( c ) => {
			setCfg( c );
			const first = Object.keys( c.templates )[ 0 ];
			setSel( first );
		} );
	}, [] );

	// Refresh the preview when the selected template changes (after any pending save).
	useEffect( () => {
		if ( sel ) {
			api.previewEmail( sel ).then( setPreview );
		}
	}, [ sel ] );

	// Persist + refresh preview (debounced) on any edit.
	const persist = ( next ) => {
		setCfg( next );
		clearTimeout( debounce.current );
		debounce.current = setTimeout( () => {
			api.saveEmails( next ).then( () => api.previewEmail( sel ).then( setPreview ) );
		}, 500 );
	};

	const setBrand = ( patch ) => persist( { ...cfg, ...patch } );
	const setTpl = ( key, patch ) => persist( {
		...cfg,
		templates: { ...cfg.templates, [ key ]: { ...cfg.templates[ key ], ...patch } },
	} );

	if ( ! cfg ) {
		return <Page><Box sx={ { display: 'flex', justifyContent: 'center', mt: 8 } }><CircularProgress /></Box></Page>;
	}

	const tpl = cfg.templates[ sel ] || {};

	return (
		<Page>
			<PageHeader
				title="Emails"
				subtitle="Brand your guest emails and reword them however you like — the order and booking details are always included automatically."
			/>
			<PageTour
				id="emails"
				title="Branded emails"
				points={ [
					'Set your logo, accent colour, sender name and footer once — every email uses them.',
					'Reword each email’s subject and intro; use {name}, {number}, {site}, {date}, {time} placeholders.',
					'The live preview on the right shows exactly what guests receive.',
				] }
			/>

			<Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' } }>
				<Stack spacing={ 2 }>
					<Card sx={ { p: 2.5 } }>
						<Typography sx={ { fontWeight: 650, fontSize: 15, mb: 1.5 } }>Branding</Typography>
						<Stack spacing={ 1.5 }>
							<Stack direction="row" spacing={ 1.5 } alignItems="center">
								<Box>
									<Typography sx={ { fontSize: 12.5, fontWeight: 600, color: tokens.muted, mb: 0.5 } }>Accent</Typography>
									<Box component="input" type="color" value={ cfg.accent } onChange={ ( e ) => setBrand( { accent: e.target.value } ) } sx={ { width: 46, height: 34, p: 0, border: `1px solid ${ tokens.border2 }`, borderRadius: 1, bgcolor: 'transparent', cursor: 'pointer' } } />
								</Box>
								<TextField label="Logo URL" size="small" value={ cfg.logo } onChange={ ( e ) => setBrand( { logo: e.target.value } ) } placeholder="https://…/logo.png" sx={ { flex: 1 } } helperText="Optional — falls back to your site name" />
							</Stack>
							<TextField label="Sender name" size="small" value={ cfg.from_name } onChange={ ( e ) => setBrand( { from_name: e.target.value } ) } fullWidth />
							<TextField label="Reply-to email" size="small" type="email" value={ cfg.reply_to } onChange={ ( e ) => setBrand( { reply_to: e.target.value } ) } fullWidth />
							<TextField label="Footer text" size="small" value={ cfg.footer } onChange={ ( e ) => setBrand( { footer: e.target.value } ) } fullWidth placeholder="e.g. 12 High St · 01234 567890 · Reply to change your booking" />
						</Stack>
					</Card>

					<Card sx={ { p: 2.5 } }>
						<Stack direction="row" alignItems="center" justifyContent="space-between" sx={ { mb: 1.5 } }>
							<Typography sx={ { fontWeight: 650, fontSize: 15 } }>Template</Typography>
							<Select size="small" value={ sel } onChange={ ( e ) => setSel( e.target.value ) } sx={ { minWidth: 200 } }>
								{ Object.entries( cfg.templates ).map( ( [ key, t ] ) => (
									<MenuItem key={ key } value={ key }>{ t.label }</MenuItem>
								) ) }
							</Select>
						</Stack>
						<Stack spacing={ 1.5 }>
							<TextField label="Subject" size="small" value={ tpl.subject || '' } onChange={ ( e ) => setTpl( sel, { subject: e.target.value } ) } fullWidth />
							<TextField label="Intro message" size="small" multiline minRows={ 3 } value={ tpl.intro || '' } onChange={ ( e ) => setTpl( sel, { intro: e.target.value } ) } fullWidth />
							<Box>
								<Typography sx={ { fontSize: 12, color: tokens.muted, mb: 0.5 } }>Placeholders (click to copy):</Typography>
								<Stack direction="row" spacing={ 0.5 } flexWrap="wrap" useFlexGap>
									{ PLACEHOLDERS.map( ( ph ) => (
										<Chip key={ ph } label={ ph } size="small" onClick={ () => navigator.clipboard && navigator.clipboard.writeText( ph ) } sx={ { fontFamily: 'monospace', bgcolor: tokens.soft, cursor: 'pointer' } } />
									) ) }
								</Stack>
							</Box>
						</Stack>
					</Card>
				</Stack>

				<Card sx={ { p: 0, overflow: 'hidden', position: { md: 'sticky' }, top: { md: 16 } } }>
					<Box sx={ { px: 2, py: 1.25, borderBottom: `1px solid ${ tokens.border }`, bgcolor: tokens.soft } }>
						<Typography sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted } }>Live preview</Typography>
						{ preview && <Typography sx={ { fontSize: 13, color: tokens.ink, mt: 0.25 } } noWrap>Subject: { preview.subject }</Typography> }
					</Box>
					{ preview ? (
						<Box component="iframe" title="Email preview" srcDoc={ preview.html } sx={ { width: '100%', height: 460, border: 0, display: 'block', bgcolor: '#f1f5f9' } } />
					) : (
						<Box sx={ { display: 'flex', justifyContent: 'center', py: 6 } }><CircularProgress size={ 22 } /></Box>
					) }
				</Card>
			</Box>
		</Page>
	);
}
