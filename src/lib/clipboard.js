// Copy text to the clipboard. navigator.clipboard only works in secure
// contexts (https / localhost); fall back to execCommand for plain-http sites
// so copying still works on any WordPress install.
export function copyToClipboard( text ) {
	if ( navigator.clipboard && window.isSecureContext ) {
		return navigator.clipboard.writeText( text ).catch( () => legacyCopy( text ) );
	}
	return Promise.resolve( legacyCopy( text ) );
}

function legacyCopy( text ) {
	try {
		const ta = document.createElement( 'textarea' );
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild( ta );
		ta.focus();
		ta.select();
		document.execCommand( 'copy' );
		document.body.removeChild( ta );
		return true;
	} catch ( e ) {
		return false;
	}
}
