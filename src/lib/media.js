// Opens the WordPress media library (wp.media, enqueued by PHP via
// wp_enqueue_media). Falls back to a no-op if unavailable.
let frame = null;

export function openMediaPicker( onSelect, onError ) {
	const wp = window.wp;
	if ( ! wp || ! wp.media ) {
		if ( onError ) {
			onError( 'The media library is unavailable on this screen.' );
		}
		return;
	}

	if ( ! frame ) {
		frame = wp.media( {
			title: 'Select item photo',
			button: { text: 'Use this photo' },
			library: { type: 'image' },
			multiple: false,
		} );
	}

	// Rebind each open so the latest callback is used.
	frame.off( 'select' );
	frame.on( 'select', () => {
		const attachment = frame.state().get( 'selection' ).first().toJSON();
		onSelect( attachment );
	} );
	frame.open();
}
