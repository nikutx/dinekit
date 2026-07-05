/**
 * DineKit first-party feedback form. Vanilla JS. Collects a star rating + a
 * comment and posts them to the public feedback endpoint. The public-review
 * links are shown to everyone regardless of the rating (no gating).
 */
( function () {
	'use strict';

	function setup( root ) {
		var cfg;
		try {
			cfg = JSON.parse( root.getAttribute( 'data-dinekit-feedback' ) );
		} catch ( e ) {
			return;
		}
		var t = cfg.i18n || {};
		var form = root.querySelector( '.dinekit-feedback__form' );
		if ( ! form ) {
			return;
		}
		var stars = Array.prototype.slice.call( form.querySelectorAll( '.dinekit-feedback__star' ) );
		var resultEl = form.querySelector( '.dinekit-booking__result' );
		var submitEl = form.querySelector( '.dinekit-booking__submit' );

		function paint( value ) {
			stars.forEach( function ( s ) {
				var v = parseInt( s.getAttribute( 'data-star' ), 10 );
				s.classList.toggle( 'is-on', v <= value );
			} );
		}

		stars.forEach( function ( s ) {
			s.addEventListener( 'change', function () { paint( parseInt( s.getAttribute( 'data-star' ), 10 ) ); } );
			s.addEventListener( 'mouseenter', function () { paint( parseInt( s.getAttribute( 'data-star' ), 10 ) ); } );
		} );
		form.addEventListener( 'mouseleave', function () {
			var checked = form.querySelector( 'input[name=rating]:checked' );
			paint( checked ? parseInt( checked.value, 10 ) : 0 );
		} );

		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			resultEl.textContent = '';
			resultEl.className = 'dinekit-booking__result';

			var checked = form.querySelector( 'input[name=rating]:checked' );
			if ( ! checked ) {
				resultEl.textContent = t.needRating;
				resultEl.classList.add( 'is-no' );
				return;
			}

			submitEl.disabled = true;
			submitEl.classList.add( 'is-loading' );

			var payload = {
				rating: parseInt( checked.value, 10 ),
				comment: form.querySelector( '[name=comment]' ).value,
				hp: form.querySelector( '[name=hp]' ).value,
			};

			fetch( cfg.restUrl + 'feedback/' + encodeURIComponent( cfg.token ), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
				body: JSON.stringify( payload ),
			} )
				.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
				.then( function ( res ) {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					if ( res.ok && res.d && res.d.ok ) {
						// Replace the form with a thank-you; the public-review links
						// (a sibling below) stay visible for everyone.
						var wrap = document.createElement( 'div' );
						wrap.className = 'dinekit-booking__success';
						wrap.setAttribute( 'role', 'status' );
						wrap.tabIndex = -1;
						var h = document.createElement( 'p' );
						h.className = 'dinekit-booking__success-title';
						h.textContent = t.thanks;
						wrap.appendChild( h );
						var nudge = document.createElement( 'p' );
						nudge.textContent = t.alsoPublic;
						wrap.appendChild( nudge );
						form.parentNode.replaceChild( wrap, form );
						wrap.focus();
					} else {
						resultEl.textContent = ( res.d && res.d.message ) ? res.d.message : t.genericError;
						resultEl.classList.add( 'is-no' );
					}
				} )
				.catch( function () {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					resultEl.textContent = t.networkError;
					resultEl.classList.add( 'is-no' );
				} );
		} );
	}

	function init() {
		Array.prototype.forEach.call( document.querySelectorAll( '.dinekit-feedback' ), setup );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
