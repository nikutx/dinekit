/**
 * DineKit event pre-order form. Vanilla JS. Collects one dish per course plus
 * allergen/dietary flags and posts them to the public event endpoint.
 */
( function () {
	'use strict';

	function setup( root ) {
		var cfg;
		try {
			cfg = JSON.parse( root.getAttribute( 'data-dinekit-event' ) );
		} catch ( e ) {
			return;
		}
		var t = cfg.i18n || {};
		var form = root.querySelector( '.dinekit-event__form' );
		if ( ! form ) {
			return;
		}
		var resultEl = form.querySelector( '.dinekit-booking__result' );
		var submitEl = form.querySelector( '.dinekit-booking__submit' );

		function checkedValues( selector ) {
			return Array.prototype.slice
				.call( form.querySelectorAll( selector + ':checked' ) )
				.map( function ( el ) { return parseInt( el.value, 10 ); } );
		}

		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			resultEl.textContent = '';
			resultEl.className = 'dinekit-booking__result';

			var name = form.querySelector( '[name=name]' ).value.trim();
			if ( ! name ) {
				resultEl.textContent = t.needName;
				resultEl.classList.add( 'is-no' );
				return;
			}

			var selections = {};
			Array.prototype.forEach.call( form.querySelectorAll( '.dinekit-event__course' ), function ( fs ) {
				var section = fs.getAttribute( 'data-section' );
				var picked = fs.querySelector( 'input[type=radio]:checked' );
				if ( section && picked ) {
					selections[ section ] = parseInt( picked.value, 10 );
				}
			} );

			submitEl.disabled = true;
			submitEl.classList.add( 'is-loading' );

			var payload = {
				name: name,
				email: form.querySelector( '[name=email]' ).value,
				selections: selections,
				allergens: checkedValues( 'input[name="allergens[]"]' ),
				dietary: checkedValues( 'input[name="dietary[]"]' ),
				notes: form.querySelector( '[name=notes]' ).value,
				hp: form.querySelector( '[name=hp]' ).value,
			};

			fetch( cfg.restUrl + 'event/' + encodeURIComponent( cfg.token ) + '/guest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
				body: JSON.stringify( payload ),
			} )
				.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
				.then( function ( res ) {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					if ( res.ok && res.d && res.d.ok ) {
						var wrap = document.createElement( 'div' );
						wrap.className = 'dinekit-booking__success';
						var h = document.createElement( 'p' );
						h.className = 'dinekit-booking__success-title';
						h.textContent = t.submitted;
						var p = document.createElement( 'p' );
						p.textContent = res.d.message || '';
						wrap.appendChild( h );
						wrap.appendChild( p );
						root.innerHTML = '';
						root.appendChild( wrap );
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
		Array.prototype.forEach.call( document.querySelectorAll( '.dinekit-event' ), setup );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
