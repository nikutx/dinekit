/**
 * DineKit public booking widget. Vanilla JS, no dependencies. Builds time slots,
 * checks availability live, and submits a booking to the public REST endpoints.
 * All user-facing strings come translated from PHP via the config object.
 */
( function () {
	'use strict';

	function pad( n ) {
		return ( n < 10 ? '0' : '' ) + n;
	}
	function localDate( d ) {
		return d.getFullYear() + '-' + pad( d.getMonth() + 1 ) + '-' + pad( d.getDate() );
	}

	function setup( root ) {
		var cfg;
		try {
			cfg = JSON.parse( root.getAttribute( 'data-dinekit-booking' ) );
		} catch ( e ) {
			return;
		}
		var t = cfg.i18n || {};
		var form = root.querySelector( '.dinekit-booking__form' );
		if ( ! form ) {
			return;
		}
		var dateEl = form.querySelector( '[name=date]' );
		var timeEl = form.querySelector( '[name=time]' );
		var partyEl = form.querySelector( '[name=party]' );
		var availEl = root.querySelector( '.dinekit-booking__availability' );
		var resultEl = root.querySelector( '.dinekit-booking__result' );
		var submitEl = form.querySelector( '.dinekit-booking__submit' );
		var origSubmit = submitEl.textContent;

		var today = localDate( new Date() );
		dateEl.min = today;
		var maxD = new Date();
		maxD.setDate( maxD.getDate() + ( cfg.maxDaysAhead || 90 ) );
		dateEl.max = localDate( maxD );
		if ( ! dateEl.value ) {
			dateEl.value = today;
		}

		// Slots come from the server (service periods = Opening Hours), so lunch/
		// dinner services, closed days and min-notice are all honoured centrally.
		function loadSlots() {
			if ( ! dateEl.value ) {
				return;
			}
			var url = cfg.restUrl + 'book/slots?date=' + encodeURIComponent( dateEl.value );
			fetch( url, { headers: { 'X-WP-Nonce': cfg.nonce } } )
				.then( function ( r ) { return r.json(); } )
				.then( function ( d ) {
					var slots = ( d && d.slots ) || [];
					var keep = timeEl.value;
					if ( ! slots.length ) {
						timeEl.innerHTML = '';
						submitEl.disabled = true;
						say( availEl, '✗ ' + ( t.closedDay || 'Sorry, we’re closed that day.' ), 'is-no' );
						return;
					}
					submitEl.disabled = false;
					var html = '';
					for ( var i = 0; i < slots.length; i++ ) {
						html += '<option value="' + slots[ i ] + '">' + slots[ i ] + '</option>';
					}
					timeEl.innerHTML = html;
					if ( keep && slots.indexOf( keep ) !== -1 ) {
						timeEl.value = keep;
					}
					check();
				} )
				.catch( function () {} );
		}

		function say( elm, msg, cls ) {
			elm.textContent = msg;
			elm.className = elm.className.replace( /\bis-(ok|no|wait)\b/g, '' ).trim();
			if ( cls ) {
				elm.classList.add( cls );
			}
		}

		var timer;
		function check() {
			say( availEl, '', '' );
			if ( ! dateEl.value || ! timeEl.value || ! partyEl.value ) {
				return;
			}
			clearTimeout( timer );
			timer = setTimeout( function () {
				var url = cfg.restUrl + 'book/check?date=' + encodeURIComponent( dateEl.value ) +
					'&time=' + encodeURIComponent( timeEl.value ) +
					'&party=' + encodeURIComponent( partyEl.value );
				fetch( url, { headers: { 'X-WP-Nonce': cfg.nonce } } )
					.then( function ( r ) { return r.json(); } )
					.then( function ( d ) {
						if ( d.available ) {
							var msg = ( cfg.autoConfirm ? t.available : t.availableReq );
							if ( d.deposit ) {
								msg += ' · ' + t.deposit;
							}
							say( availEl, '✓ ' + msg, 'is-ok' );
							submitEl.textContent = origSubmit;
						} else if ( d.waitlist ) {
							say( availEl, '★ ' + t.waitlistOffer, 'is-wait' );
							submitEl.textContent = t.joinWaitlist;
						} else {
							say( availEl, '✗ ' + t.notAvailable, 'is-no' );
							submitEl.textContent = origSubmit;
						}
					} )
					.catch( function () {} );
			}, 300 );
		}

		dateEl.addEventListener( 'change', loadSlots );
		timeEl.addEventListener( 'change', check );
		partyEl.addEventListener( 'change', check );

		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			say( resultEl, '', '' );
			var name = form.querySelector( '[name=name]' ).value.trim();
			var email = form.querySelector( '[name=email]' ).value.trim();
			if ( ! name || ! email || email.indexOf( '@' ) < 1 ) {
				say( resultEl, t.needNameEmail, 'is-no' );
				return;
			}
			submitEl.disabled = true;
			submitEl.classList.add( 'is-loading' );
			var payload = {
				date: dateEl.value,
				time: timeEl.value,
				party: partyEl.value,
				name: name,
				email: email,
				phone: form.querySelector( '[name=phone]' ).value,
				notes: form.querySelector( '[name=notes]' ).value,
				hp: form.querySelector( '[name=hp]' ).value,
			};
			fetch( cfg.restUrl + 'book', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
				body: JSON.stringify( payload ),
			} )
				.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
				.then( function ( res ) {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					if ( res.ok && res.d && res.d.ok ) {
						var title = res.d.waitlist ? t.waitlisted : ( res.d.status === 'confirmed' ? t.tableBooked : t.requestSent );
						var wrap = document.createElement( 'div' );
						wrap.className = 'dinekit-booking__success';
						var h = document.createElement( 'p' );
						h.className = 'dinekit-booking__success-title';
						h.textContent = title;
						var p = document.createElement( 'p' );
						p.textContent = res.d.message || '';
						wrap.appendChild( h );
						wrap.appendChild( p );
						root.innerHTML = '';
						root.appendChild( wrap );
					} else {
						say( resultEl, ( res.d && res.d.message ) ? res.d.message : t.genericError, 'is-no' );
					}
				} )
				.catch( function () {
					submitEl.disabled = false;
					submitEl.classList.remove( 'is-loading' );
					say( resultEl, t.networkError, 'is-no' );
				} );
		} );

		loadSlots();
	}

	function init() {
		var nodes = document.querySelectorAll( '.dinekit-booking' );
		Array.prototype.forEach.call( nodes, function ( n ) {
			if ( n.querySelector( '.dinekit-booking__form' ) ) {
				setup( n );
			}
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
