import React, { useState } from 'react';
import { Modal, Box, Stack, Typography, Button, TextField, IconButton, Tooltip, CircularProgress } from '../../ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { openMediaPicker } from '../../lib/media';
import { useToast } from '../Toast';
import { tokens } from '../../theme';

/**
 * Photo & video for one menu section — both show under the section's heading
 * on the public menu. The photo comes from the media library; the video is a
 * YouTube/Vimeo link or a video file uploaded to the media library.
 */
export default function SectionMediaDialog( { section, busy, onSave, onClose } ) {
	const toast = useToast();
	const [ image, setImage ] = useState( section.image || null );
	const [ video, setVideo ] = useState( section.video || '' );

	const pickImage = () => {
		openMediaPicker(
			( att ) => setImage( {
				id: att.id,
				thumb: att.sizes?.thumbnail?.url || att.url,
				url: att.url,
			} ),
			( message ) => toast.error( 'Media library unavailable', message )
		);
	};

	return (
		<Modal open onClose={ busy ? undefined : onClose } sx={ { maxWidth: 480 } }>
			<Box sx={ { p: 3 } }>
				<Typography sx={ { fontSize: 16, fontWeight: 650, color: tokens.ink, mb: 0.5 } }>
					Photo &amp; video — { section.name }
				</Typography>
				<Typography sx={ { fontSize: 13.5, color: tokens.muted, lineHeight: 1.5, mb: 2 } }>
					These appear under the “{ section.name }” heading on your public menu — a banner
					photo, a short video, or both.
				</Typography>

				<Typography className="dinekit-microlabel" sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted2, mb: 0.75 } }>
					Section photo
				</Typography>
				<Stack direction="row" spacing={ 1.5 } alignItems="center" sx={ { mb: 2.25 } }>
					{ image ? (
						<>
							<Box
								component="img"
								src={ image.thumb || image.url }
								alt=""
								sx={ { width: 72, height: 54, objectFit: 'cover', borderRadius: '8px', border: `1px solid ${ tokens.border }` } }
							/>
							<Button size="small" variant="outlined" onClick={ pickImage }>Change photo</Button>
							<Tooltip title="Remove photo">
								<IconButton size="small" onClick={ () => setImage( null ) } sx={ { color: tokens.muted } }>
									<DeleteOutlineIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</>
					) : (
						<Button size="small" variant="outlined" startIcon={ <AddPhotoAlternateOutlinedIcon /> } onClick={ pickImage }>
							Add photo
						</Button>
					) }
				</Stack>

				<Typography className="dinekit-microlabel" sx={ { fontSize: 12, fontWeight: 700, color: tokens.muted2, mb: 0.75 } }>
					Section video
				</Typography>
				<TextField
					value={ video }
					onChange={ ( e ) => setVideo( e.target.value ) }
					placeholder="Paste a YouTube or Vimeo link…"
					size="small"
					fullWidth
				/>
				<Typography sx={ { fontSize: 12, color: tokens.muted2, mt: 0.75 } }>
					YouTube and Vimeo links work, or upload a video to your media library and paste
					its file link. Leave blank for no video.
				</Typography>

				<Stack direction="row" spacing={ 1 } justifyContent="flex-end" sx={ { mt: 2.5 } }>
					<Button variant="text" onClick={ onClose } disabled={ busy } sx={ { color: tokens.muted } }>
						Cancel
					</Button>
					<Button
						variant="contained"
						onClick={ () => onSave( { image: image ? image.id : 0, video: video.trim() } ) }
						disabled={ busy }
						startIcon={ busy ? <CircularProgress size={ 15 } color="inherit" /> : null }
					>
						Save
					</Button>
				</Stack>
			</Box>
		</Modal>
	);
}
