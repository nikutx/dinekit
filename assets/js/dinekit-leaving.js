/**
 * Leaving questionnaire on the Plugins screen.
 *
 * Intercepts DineKit's own Deactivate link to ask why. Everything here is
 * best-effort: if anything goes wrong we fall through to the original link,
 * because a plugin that's hard to turn off is a broken plugin. Nothing is sent
 * unless the owner presses "Send & deactivate".
 */
( function () {
	var cfg = window.DINEKIT_LEAVING || {};
	var dialog = document.getElementById( 'dinekit-lv' );
	if ( ! dialog || ! cfg.plugin ) {
		return;
	}

	var row = document.querySelector( 'tr[data-plugin="' + cfg.plugin + '"]' );
	var link = row ? row.querySelector( '.deactivate a' ) : null;
	if ( ! link ) {
		return;
	}

	var deactivateUrl = link.getAttribute( 'href' );
	var detail = dialog.querySelector( '.dinekit-lv__detail' );
	var help = document.getElementById( 'dinekit-lv-help' );
	var comment = document.getElementById( 'dinekit-lv-comment' );
	var contact = document.getElementById( 'dinekit-lv-contact' );
	var email = document.getElementById( 'dinekit-lv-email' );
	var sendBtn = document.getElementById( 'dinekit-lv-send' );
	var skipBtn = document.getElementById( 'dinekit-lv-skip' );
	var errorEl = document.getElementById( 'dinekit-lv-error' );
	var lastFocus = null;

	function open( event ) {
		event.preventDefault();
		lastFocus = document.activeElement;
		dialog.hidden = false;
		var first = dialog.querySelector( 'input[name="dinekit-lv-reason"]' );
		if ( first ) {
			first.focus();
		}
		document.addEventListener( 'keydown', onKey );
	}

	// Cancel = stay on the plugin. Deactivating is never forced through here.
	function close() {
		dialog.hidden = true;
		document.removeEventListener( 'keydown', onKey );
		if ( lastFocus && lastFocus.focus ) {
			lastFocus.focus();
		}
	}

	function onKey( event ) {
		if ( event.key === 'Escape' ) {
			close();
		}
	}

	function go() {
		window.location.href = deactivateUrl;
	}

	dialog.addEventListener( 'change', function ( event ) {
		if ( event.target.name === 'dinekit-lv-reason' ) {
			sendBtn.disabled = false;
			detail.hidden = false;
			var text = event.target.getAttribute( 'data-help' ) || '';
			help.textContent = text;
			help.hidden = ! text;
		}
		if ( event.target === contact ) {
			email.hidden = ! contact.checked;
		}
	} );

	Array.prototype.forEach.call( dialog.querySelectorAll( '[data-dinekit-lv-cancel]' ), function ( el ) {
		el.addEventListener( 'click', close );
	} );

	link.addEventListener( 'click', open );
	skipBtn.addEventListener( 'click', go );

	sendBtn.addEventListener( 'click', function () {
		var picked = dialog.querySelector( 'input[name="dinekit-lv-reason"]:checked' );
		if ( ! picked ) {
			return;
		}
		sendBtn.disabled = true;
		sendBtn.textContent = 'Sending…';
		errorEl.hidden = true;

		var body = {
			reason: picked.value,
			comment: comment.value,
			contact: contact.checked ? 1 : 0,
			contact_email: contact.checked ? email.value : '',
		};

		// A failed send must never strand someone on a plugin they're turning
		// off: on any error, deactivate anyway.
		fetch( cfg.restUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
			body: JSON.stringify( body ),
		} )
			.then( function ( res ) {
				if ( ! res.ok ) {
					throw new Error( 'send failed' );
				}
				go();
			} )
			.catch( function () {
				errorEl.textContent = 'We couldn’t send that just now — deactivating anyway.';
				errorEl.hidden = false;
				window.setTimeout( go, 1200 );
			} );
	} );
} )();
