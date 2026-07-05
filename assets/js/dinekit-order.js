/**
 * DineKit online ordering — vanilla JS. Builds the menu, a dish configurator
 * (sizes + choose/remove modifiers), a live cart, and checkout. Posts to the
 * public /checkout endpoint; the server recomputes the authoritative total.
 */
( function () {
	'use strict';

	function el( tag, cls, txt ) {
		var e = document.createElement( tag );
		if ( cls ) {
			e.className = cls;
		}
		if ( txt != null ) {
			e.textContent = txt;
		}
		return e;
	}
	function priceNum( p ) {
		var n = parseFloat( String( p == null ? '' : p ).replace( /[^0-9.\-]/g, '' ) );
		return isNaN( n ) ? 0 : n;
	}

	function setup( root ) {
		var cfg;
		try {
			cfg = JSON.parse( root.getAttribute( 'data-dinekit-order' ) );
		} catch ( e ) {
			return;
		}
		var t = cfg.i18n || {};
		var app = root.querySelector( '.dinekit-order__app' );
		if ( ! app ) {
			return;
		}
		var state = { lines: [], view: 'menu', done: null };

		// Visually-hidden polite live region so screen readers hear cart changes.
		var live = el( 'div', 'dinekit-order__sr' );
		live.setAttribute( 'aria-live', 'polite' );
		live.setAttribute( 'aria-atomic', 'true' );
		root.appendChild( live );
		function announce( msg ) {
			live.textContent = '';
			// Re-set on the next frame so identical consecutive messages re-announce.
			window.setTimeout( function () { live.textContent = msg; }, 30 );
		}

		function money( n ) {
			var v = ( Math.round( n * 100 ) / 100 ).toFixed( 2 );
			return cfg.currencyPos === 'after' ? v + cfg.currency : cfg.currency + v;
		}
		function findItem( id ) {
			for ( var i = 0; i < cfg.menu.length; i++ ) {
				var items = cfg.menu[ i ].items;
				for ( var j = 0; j < items.length; j++ ) {
					if ( items[ j ].id === id ) {
						return items[ j ];
					}
				}
			}
			return null;
		}
		function lineUnit( line ) {
			var item = findItem( line.itemId );
			if ( ! item ) {
				return 0;
			}
			var base = priceNum( ( item.prices[ line.priceIndex ] || item.prices[ 0 ] || {} ).amount );
			Object.keys( line.choices || {} ).forEach( function ( gi ) {
				( line.choices[ gi ] || [] ).forEach( function ( oi ) {
					var g = item.modifiers[ gi ];
					if ( g && g.type === 'choose' && g.options[ oi ] ) {
						base += priceNum( g.options[ oi ].price );
					}
				} );
			} );
			return base;
		}
		function lineTotal( line ) {
			return lineUnit( line ) * line.qty;
		}
		function subtotal() {
			return state.lines.reduce( function ( s, l ) { return s + lineTotal( l ); }, 0 );
		}
		function optsLabel( line ) {
			var item = findItem( line.itemId );
			if ( ! item ) {
				return '';
			}
			var parts = [];
			if ( item.prices.length > 1 && line.priceLabel ) {
				parts.push( line.priceLabel );
			}
			Object.keys( line.choices || {} ).forEach( function ( gi ) {
				( line.choices[ gi ] || [] ).forEach( function ( oi ) {
					var g = item.modifiers[ gi ];
					if ( g && g.options[ oi ] ) {
						parts.push( g.options[ oi ].label );
					}
				} );
			} );
			Object.keys( line.removed || {} ).forEach( function ( gi ) {
				( line.removed[ gi ] || [] ).forEach( function ( oi ) {
					var g = item.modifiers[ gi ];
					if ( g && g.options[ oi ] ) {
						parts.push( 'no ' + g.options[ oi ].label );
					}
				} );
			} );
			return parts.join( ', ' );
		}

		/* ---- render ---- */
		// Motion state: animate on view change + pulse the cart when it grows.
		// All animations are CSS and gated by prefers-reduced-motion.
		var lastView = null;
		var lastCount = 0;
		var justAdded = false;
		function render() {
			app.innerHTML = '';
			var viewChanged = lastView !== state.view;
			lastView = state.view;
			var count = state.lines.reduce( function ( s, l ) { return s + l.qty; }, 0 );
			var prevCount = lastCount;
			justAdded = count > prevCount;
			lastCount = count;
			// Announce cart changes to assistive tech (not on plain view switches).
			if ( count !== prevCount ) {
				announce( count > 0
					? count + ' ' + ( count === 1 ? ( t.item || 'item' ) : ( t.items || 'items' ) ) + ' · ' + ( t.total || 'Total' ) + ' ' + money( subtotal() )
					: ( t.empty || 'Your basket is empty.' ) );
			}
			// The "Order online" heading is redundant once we're on the receipt.
			var heading = root.querySelector( '.dinekit-order__heading' );
			if ( heading ) { heading.style.display = state.view === 'done' ? 'none' : ''; }
			if ( state.view === 'done' ) {
				renderDone();
			} else if ( state.view === 'pay' ) {
				renderPay();
			} else if ( state.view === 'checkout' ) {
				renderCheckout();
			} else {
				renderMenu();
			}
			// Subtle enter animation when the view changes (menu→checkout→pay→done).
			if ( viewChanged && app.firstChild && app.firstChild.classList ) {
				app.firstChild.classList.add( 'dinekit-order__enter' );
			}
			renderBar();
		}

		// Sticky bottom "view order" bar — mobile only (hidden ≥768px via CSS).
		// One-tap to checkout; mirrors the cart's min-order guard.
		function renderBar() {
			if ( state.view !== 'menu' || ! state.lines.length ) {
				return;
			}
			var count = state.lines.reduce( function ( s, l ) { return s + l.qty; }, 0 );
			var bar = el( 'button', 'dinekit-order__bar' );
			bar.type = 'button';
			bar.appendChild( el( 'span', 'dinekit-order__bar-count', String( count ) ) );
			var label = el( 'span', 'dinekit-order__bar-label', t.viewOrder || 'View order' );
			bar.appendChild( label );
			bar.appendChild( el( 'span', 'dinekit-order__bar-total', money( subtotal() ) ) );
			var min = cfg.minOrder || 0;
			if ( min > 0 && subtotal() < min ) {
				bar.disabled = true;
				bar.classList.add( 'is-min' );
				label.textContent = ( t.minOrder || 'Minimum order' ) + ' ' + money( min );
			}
			if ( justAdded && ! bar.disabled ) {
				bar.classList.add( 'is-bump' );
			}
			bar.addEventListener( 'click', function () { state.view = 'checkout'; render(); } );
			app.appendChild( bar );
		}

		function renderMenu() {
			var grid = el( 'div', 'dinekit-order__grid' );
			var menuCol = el( 'div', 'dinekit-order__menu' );
			cfg.menu.forEach( function ( sec ) {
				if ( ! sec.items.length ) {
					return;
				}
				menuCol.appendChild( el( 'h3', 'dinekit-order__section', sec.name ) );
				sec.items.forEach( function ( item ) {
					var hasImg = !! ( item.image && item.image.thumb );
					var off = item.available === false;
					var card = el( 'div', 'dinekit-order__item' + ( hasImg ? ' dinekit-order__item--has-img' : '' ) + ( off ? ' dinekit-order__item--off' : '' ) );
					if ( hasImg ) {
						var im = document.createElement( 'img' );
						im.className = 'dinekit-order__item-img';
						im.src = item.image.thumb;
						im.alt = item.title;
						im.loading = 'lazy';
						card.appendChild( im );
					}
					var info = el( 'div', 'dinekit-order__item-info' );
					info.appendChild( el( 'div', 'dinekit-order__item-name', item.title ) );
					if ( item.desc ) {
						info.appendChild( el( 'div', 'dinekit-order__item-desc', item.desc ) );
					}
					if ( off ) {
						// Kept visible (popular dishes stay on the menu) but not orderable.
						info.appendChild( el( 'div', 'dinekit-order__item-off', t.unavailable || 'Currently unavailable' ) );
					} else {
						var price = item.prices.length > 1
							? 'from ' + money( priceNum( item.prices[ 0 ].amount ) )
							: money( priceNum( item.prices[ 0 ].amount ) );
						info.appendChild( el( 'div', 'dinekit-order__item-price', price ) );
					}
					card.appendChild( info );
					if ( ! off ) {
						var add = el( 'button', 'dinekit-order__add', t.add || 'Add' );
						add.type = 'button';
						add.setAttribute( 'aria-label', ( t.add || 'Add' ) + ' ' + item.title );
						add.addEventListener( 'click', function () { onAdd( item ); } );
						card.appendChild( add );
					}
					menuCol.appendChild( card );
				} );
			} );
			grid.appendChild( menuCol );
			grid.appendChild( renderCart() );
			app.appendChild( grid );
		}

		function stepper( onMinus, onPlus, value ) {
			var q = el( 'div', 'dinekit-order__qty' );
			var minus = el( 'button', null, '−' );
			minus.type = 'button';
			minus.setAttribute( 'aria-label', t.decrease || 'Decrease quantity' );
			minus.addEventListener( 'click', onMinus );
			var plus = el( 'button', null, '+' );
			plus.type = 'button';
			plus.setAttribute( 'aria-label', t.increase || 'Increase quantity' );
			plus.addEventListener( 'click', onPlus );
			q.appendChild( minus );
			q.appendChild( el( 'span', null, String( value ) ) );
			q.appendChild( plus );
			return q;
		}

		function renderCart() {
			var cart = el( 'div', 'dinekit-order__cart' );
			cart.appendChild( el( 'h3', 'dinekit-order__cart-title', t.yourOrder || 'Your order' ) );
			if ( ! state.lines.length ) {
				cart.appendChild( el( 'p', 'dinekit-order__cart-empty', t.empty || 'Your basket is empty.' ) );
				return cart;
			}
			state.lines.forEach( function ( line, idx ) {
				var row = el( 'div', 'dinekit-order__cart-line' );
				var left = el( 'div', 'dinekit-order__cart-left' );
				left.appendChild( el( 'div', 'dinekit-order__cart-name', ( findItem( line.itemId ) || {} ).title ) );
				var ol = optsLabel( line );
				if ( ol ) {
					left.appendChild( el( 'div', 'dinekit-order__cart-opts', ol ) );
				}
				left.appendChild( stepper(
					function () { line.qty--; if ( line.qty < 1 ) { state.lines.splice( idx, 1 ); } render(); },
					function () { if ( line.qty < 20 ) { line.qty++; } render(); },
					line.qty
				) );
				row.appendChild( left );
				row.appendChild( el( 'div', 'dinekit-order__cart-price', money( lineTotal( line ) ) ) );
				cart.appendChild( row );
			} );
			var sub = el( 'div', 'dinekit-order__subtotal' );
			sub.appendChild( el( 'span', null, t.total || 'Total' ) );
			sub.appendChild( el( 'strong', null, money( subtotal() ) ) );
			if ( justAdded ) {
				sub.classList.add( 'is-bump' );
			}
			cart.appendChild( sub );
			var min = cfg.minOrder || 0;
			var co = el( 'button', 'dinekit-order__checkout', t.checkout || 'Checkout' );
			co.type = 'button';
			if ( min > 0 && subtotal() < min ) {
				co.disabled = true;
				co.textContent = ( t.minOrder || 'Minimum order' ) + ' ' + money( min );
			}
			co.addEventListener( 'click', function () { state.view = 'checkout'; render(); } );
			cart.appendChild( co );
			return cart;
		}

		function onAdd( item ) {
			if ( item.prices.length <= 1 && ( ! item.modifiers || ! item.modifiers.length ) ) {
				state.lines.push( { itemId: item.id, priceIndex: 0, priceLabel: '', choices: {}, removed: {}, qty: 1 } );
				render();
				return;
			}
			openConfig( item );
		}

		function openConfig( item ) {
			var sel = { priceIndex: 0, choices: {}, removed: {}, qty: 1 };
			( item.modifiers || [] ).forEach( function ( g, gi ) {
				if ( g.type === 'choose' && g.min >= 1 ) {
					sel.choices[ gi ] = [ 0 ];
				}
			} );

			// Remember what was focused so we can restore it when the dialog closes.
			var trigger = document.activeElement;

			var overlay = el( 'div', 'dinekit-order__overlay' );
			var modal = el( 'div', 'dinekit-order__modal' );
			modal.setAttribute( 'role', 'dialog' );
			modal.setAttribute( 'aria-modal', 'true' );
			modal.setAttribute( 'aria-label', item.title );
			modal.tabIndex = -1;
			var close = function () {
				if ( overlay.parentNode ) {
					overlay.parentNode.removeChild( overlay );
				}
				if ( trigger && trigger.focus ) {
					trigger.focus();
				}
			};

			var x = el( 'button', 'dinekit-order__modal-close', '×' );
			x.type = 'button';
			x.setAttribute( 'aria-label', t.close || 'Close' );
			x.addEventListener( 'click', close );
			modal.appendChild( x );
			if ( item.image && item.image.thumb ) {
				var mim = document.createElement( 'img' );
				mim.className = 'dinekit-order__modal-img';
				mim.src = item.image.thumb;
				mim.alt = item.title;
				mim.loading = 'lazy';
				modal.appendChild( mim );
			}
			modal.appendChild( el( 'h3', null, item.title ) );
			if ( item.desc ) {
				modal.appendChild( el( 'p', 'dinekit-order__modal-desc', item.desc ) );
			}

			if ( item.prices.length > 1 ) {
				var pg = el( 'div', 'dinekit-order__group' );
				pg.setAttribute( 'role', 'group' );
				pg.setAttribute( 'aria-label', t.size || 'Size' );
				pg.appendChild( el( 'div', 'dinekit-order__group-label', t.size || 'Size' ) );
				item.prices.forEach( function ( p, pi ) {
					var lab = el( 'label', 'dinekit-order__opt' );
					var inp = document.createElement( 'input' );
					inp.type = 'radio';
					inp.name = 'dinekit-price';
					if ( pi === 0 ) {
						inp.checked = true;
					}
					inp.addEventListener( 'change', function () { sel.priceIndex = pi; upd(); } );
					lab.appendChild( inp );
					lab.appendChild( el( 'span', null, ( p.label || 'Price' ) + ' — ' + money( priceNum( p.amount ) ) ) );
					pg.appendChild( lab );
				} );
				modal.appendChild( pg );
			}

			( item.modifiers || [] ).forEach( function ( g, gi ) {
				var grp = el( 'div', 'dinekit-order__group' );
				var lbl = g.name + ( g.type === 'choose' && g.min < 1 ? ' (' + ( t.optional || 'optional' ) + ')' : '' );
				grp.setAttribute( 'role', 'group' );
				grp.setAttribute( 'aria-label', lbl );
				grp.appendChild( el( 'div', 'dinekit-order__group-label', lbl ) );
				( g.options || [] ).forEach( function ( o, oi ) {
					var lab = el( 'label', 'dinekit-order__opt' );
					var inp = document.createElement( 'input' );
					if ( g.type === 'remove' ) {
						inp.type = 'checkbox';
						inp.addEventListener( 'change', function () {
							sel.removed[ gi ] = sel.removed[ gi ] || [];
							if ( inp.checked ) {
								sel.removed[ gi ].push( oi );
							} else {
								sel.removed[ gi ] = sel.removed[ gi ].filter( function ( v ) { return v !== oi; } );
							}
						} );
						lab.appendChild( inp );
						lab.appendChild( el( 'span', null, 'No ' + o.label ) );
					} else {
						var single = ( g.max === 1 );
						inp.type = single ? 'radio' : 'checkbox';
						inp.name = 'dinekit-g' + gi;
						if ( single && ( sel.choices[ gi ] || [] )[ 0 ] === oi ) {
							inp.checked = true;
						}
						inp.addEventListener( 'change', function () {
							if ( single ) {
								sel.choices[ gi ] = [ oi ];
							} else {
								sel.choices[ gi ] = sel.choices[ gi ] || [];
								if ( inp.checked ) {
									if ( g.max && sel.choices[ gi ].length >= g.max ) {
										inp.checked = false;
										return;
									}
									sel.choices[ gi ].push( oi );
								} else {
									sel.choices[ gi ] = sel.choices[ gi ].filter( function ( v ) { return v !== oi; } );
								}
							}
							upd();
						} );
						var label = o.label + ( priceNum( o.price ) > 0 ? ' (+' + money( priceNum( o.price ) ) + ')' : '' );
						lab.appendChild( inp );
						lab.appendChild( el( 'span', null, label ) );
					}
					grp.appendChild( lab );
				} );
				modal.appendChild( grp );
			} );

			var foot = el( 'div', 'dinekit-order__modal-foot' );
			foot.appendChild( stepper(
				function () { if ( sel.qty > 1 ) { sel.qty--; upd(); } },
				function () { if ( sel.qty < 20 ) { sel.qty++; upd(); } },
				1
			) );
			var addBtn = el( 'button', 'dinekit-order__modal-add' );
			addBtn.type = 'button';
			addBtn.addEventListener( 'click', function () {
				state.lines.push( {
					itemId: item.id,
					priceIndex: sel.priceIndex,
					priceLabel: ( item.prices[ sel.priceIndex ] || {} ).label || '',
					choices: sel.choices,
					removed: sel.removed,
					qty: sel.qty,
				} );
				close();
				render();
			} );
			foot.appendChild( addBtn );
			modal.appendChild( foot );

			overlay.appendChild( modal );
			overlay.addEventListener( 'click', function ( e ) { if ( e.target === overlay ) { close(); } } );
			// Keyboard: ESC closes, Tab is trapped inside the dialog.
			overlay.addEventListener( 'keydown', function ( e ) {
				if ( e.key === 'Escape' ) {
					e.preventDefault();
					close();
					return;
				}
				if ( e.key !== 'Tab' ) {
					return;
				}
				var f = modal.querySelectorAll( 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])' );
				if ( ! f.length ) {
					return;
				}
				var first = f[ 0 ];
				var last = f[ f.length - 1 ];
				if ( e.shiftKey && document.activeElement === first ) {
					e.preventDefault();
					last.focus();
				} else if ( ! e.shiftKey && document.activeElement === last ) {
					e.preventDefault();
					first.focus();
				}
			} );
			document.body.appendChild( overlay );
			// Move focus into the dialog (the close button is a safe first stop).
			x.focus();

			function unit() {
				var base = priceNum( item.prices[ sel.priceIndex ].amount );
				Object.keys( sel.choices ).forEach( function ( gi ) {
					( sel.choices[ gi ] || [] ).forEach( function ( oi ) {
						var g = item.modifiers[ gi ];
						if ( g && g.type === 'choose' && g.options[ oi ] ) {
							base += priceNum( g.options[ oi ].price );
						}
					} );
				} );
				return base;
			}
			function upd() {
				foot.querySelector( '.dinekit-order__qty span' ).textContent = String( sel.qty );
				addBtn.textContent = ( t.addToOrder || 'Add to order' ) + ' · ' + money( unit() * sel.qty );
			}
			upd();
		}

		function buildSlots() {
			var now = new Date();
			var start = now.getHours() * 60 + now.getMinutes() + ( cfg.prepMins || 0 );
			start = Math.ceil( start / 15 ) * 15;
			var slots = [];
			for ( var m = start; m <= 23 * 60; m += 15 ) {
				var h = Math.floor( m / 60 );
				var mm = m % 60;
				slots.push( ( h < 10 ? '0' : '' ) + h + ':' + ( mm < 10 ? '0' : '' ) + mm );
			}
			return slots.slice( 0, 40 );
		}

		function renderCheckout() {
			var box = el( 'div', 'dinekit-order__checkout-box' );
			var back = el( 'button', 'dinekit-order__back', '‹ ' + ( t.back || 'Back to menu' ) );
			back.type = 'button';
			back.addEventListener( 'click', function () { state.view = 'menu'; render(); } );
			box.appendChild( back );

			// Fulfilment: collection (default) or delivery (when the venue offers it).
			state.fulfilment = state.fulfilment || 'collection';
			var deliver = !! ( cfg.delivery && state.fulfilment === 'delivery' );
			var feeVal = deliver ? ( cfg.deliveryFee || 0 ) : 0;
			var orderTotal = subtotal() + feeVal;
			if ( cfg.delivery ) {
				var seg = el( 'div', 'dinekit-order__fulfil' );
				seg.setAttribute( 'role', 'group' );
				seg.setAttribute( 'aria-label', t.fulfilment || 'Collection or delivery' );
				[ [ 'collection', t.collection || 'Collection' ], [ 'delivery', t.delivery || 'Delivery' ] ].forEach( function ( opt ) {
					var active = state.fulfilment === opt[ 0 ];
					var bt = el( 'button', 'dinekit-order__fulfil-btn' + ( active ? ' is-active' : '' ), opt[ 1 ] );
					bt.type = 'button';
					bt.setAttribute( 'aria-pressed', active ? 'true' : 'false' );
					bt.addEventListener( 'click', function () { state.fulfilment = opt[ 0 ]; render(); } );
					seg.appendChild( bt );
				} );
				box.appendChild( seg );
			}

			state.lines.forEach( function ( line ) {
				var r = el( 'div', 'dinekit-order__sum-line' );
				r.appendChild( el( 'span', null, line.qty + '× ' + ( findItem( line.itemId ) || {} ).title ) );
				r.appendChild( el( 'span', null, money( lineTotal( line ) ) ) );
				box.appendChild( r );
			} );
			if ( deliver ) {
				var subL = el( 'div', 'dinekit-order__sum-line' );
				subL.appendChild( el( 'span', null, t.subtotal || 'Subtotal' ) );
				subL.appendChild( el( 'span', null, money( subtotal() ) ) );
				box.appendChild( subL );
				var feeL = el( 'div', 'dinekit-order__sum-line' );
				feeL.appendChild( el( 'span', null, t.deliveryFee || 'Delivery' ) );
				feeL.appendChild( el( 'span', null, money( feeVal ) ) );
				box.appendChild( feeL );
			}
			var sub = el( 'div', 'dinekit-order__subtotal' );
			sub.appendChild( el( 'span', null, t.total || 'Total' ) );
			sub.appendChild( el( 'strong', null, money( orderTotal ) ) );
			box.appendChild( sub );

			var form = el( 'form', 'dinekit-order__form' );
			function field( name, label, type ) {
				var l = el( 'label', 'dinekit-order__field' );
				l.appendChild( el( 'span', null, label ) );
				var i = document.createElement( type === 'textarea' ? 'textarea' : 'input' );
				if ( type !== 'textarea' ) {
					i.type = type || 'text';
				}
				i.name = name;
				l.appendChild( i );
				return l;
			}
			form.appendChild( field( 'name', t.name || 'Name' ) );
			var row = el( 'div', 'dinekit-order__form-row' );
			row.appendChild( field( 'email', t.email || 'Email', 'email' ) );
			row.appendChild( field( 'phone', t.phone || 'Phone', 'tel' ) );
			form.appendChild( row );

			if ( deliver ) {
				form.appendChild( field( 'address', t.address || 'Delivery address', 'textarea' ) );
			}

			var whenL = el( 'label', 'dinekit-order__field' );
			whenL.appendChild( el( 'span', null, t.collection || 'Collection' ) );
			var whenSel = document.createElement( 'select' );
			whenSel.name = 'when';
			var o0 = document.createElement( 'option' );
			o0.value = 'asap';
			o0.textContent = t.asap || 'As soon as possible';
			whenSel.appendChild( o0 );
			buildSlots().forEach( function ( hm ) {
				var o = document.createElement( 'option' );
				o.value = hm;
				o.textContent = hm;
				whenSel.appendChild( o );
			} );
			whenL.appendChild( whenSel );
			form.appendChild( whenL );

			form.appendChild( field( 'notes', t.notes || 'Notes', 'textarea' ) );

			var hp = el( 'div', 'dinekit-order__hp' );
			var hpi = document.createElement( 'input' );
			hpi.type = 'text';
			hpi.name = 'hp';
			hpi.tabIndex = -1;
			hp.appendChild( hpi );
			form.appendChild( hp );

			var submit = el( 'button', 'dinekit-order__place', ( t.placeOrder || 'Place order' ) + ' · ' + money( orderTotal ) );
			submit.type = 'submit';
			form.appendChild( submit );
			var result = el( 'p', 'dinekit-order__result' );
			result.setAttribute( 'role', 'alert' );
			form.appendChild( result );

			form.addEventListener( 'submit', function ( e ) {
				e.preventDefault();
				result.textContent = '';
				result.className = 'dinekit-order__result';
				var name = form.name.value.trim();
				var email = form.email.value.trim();
				var phone = form.phone.value.trim();
				if ( ! name || ( ! email && ! phone ) ) {
					result.textContent = t.needContact;
					result.classList.add( 'is-no' );
					return;
				}
				var address = ( deliver && form.address ) ? form.address.value.trim() : '';
				if ( deliver && ! address ) {
					result.textContent = t.needAddress || 'Please enter your delivery address.';
					result.classList.add( 'is-no' );
					return;
				}
				submit.disabled = true;
				fetch( cfg.restUrl + 'checkout', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
					body: JSON.stringify( {
						name: name,
						email: email,
						phone: phone,
						when: form.when.value,
						notes: form.notes.value,
						fulfilment: state.fulfilment,
						address: address,
						hp: form.hp.value,
						items: state.lines.map( function ( l ) {
							return { itemId: l.itemId, qty: l.qty, priceIndex: l.priceIndex, choices: l.choices, removed: l.removed };
						} ),
					} ),
				} )
					.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
					.then( function ( res ) {
						submit.disabled = false;
						if ( res.ok && res.d && res.d.ok ) {
							state.done = res.d;
							// Stripe connected + payable → collect card on-site; else done.
							state.view = ( res.d.pay && res.d.id && cfg.publishableKey && window.Stripe ) ? 'pay' : 'done';
							render();
						} else {
							result.textContent = ( res.d && res.d.message ) || t.genericError;
							result.classList.add( 'is-no' );
						}
					} )
					.catch( function () {
						submit.disabled = false;
						result.textContent = t.networkError;
						result.classList.add( 'is-no' );
					} );
			} );
			box.appendChild( form );
			app.appendChild( box );
		}

		// Native Stripe payment step for an order. Fulfilment is webhook-driven
		// server-side; this collects the card and confirms, then shows the receipt.
		function renderPay() {
			var box = el( 'div', 'dinekit-order__pay' );
			box.appendChild( el( 'div', 'dinekit-order__done-title', t.payTitle || 'Pay for your order' ) );
			// Shimmer placeholder while the PaymentIntent is fetched + Stripe.js mounts.
			var skel = el( 'div', 'dinekit-order__pay-skel' );
			skel.setAttribute( 'aria-hidden', 'true' );
			skel.appendChild( el( 'div', 'dinekit-order__skel-line' ) );
			skel.appendChild( el( 'div', 'dinekit-order__skel-line' ) );
			skel.appendChild( el( 'div', 'dinekit-order__skel-line dinekit-order__skel-line--short' ) );
			box.appendChild( skel );
			var removeSkel = function () { if ( skel.parentNode ) { skel.parentNode.removeChild( skel ); } };
			var host = el( 'div', 'dinekit-order__pay-element' );
			box.appendChild( host );
			var err = el( 'p', 'dinekit-order__result' );
			err.setAttribute( 'role', 'alert' );
			box.appendChild( err );
			var btn = el( 'button', 'dinekit-order__place', t.payNow || 'Pay now' );
			btn.type = 'button';
			btn.disabled = true;
			box.appendChild( btn );
			app.appendChild( box );

			var stripe = window.Stripe( cfg.publishableKey );
			fetch( cfg.restUrl + 'payments/intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
				body: JSON.stringify( { order: state.done.id } ),
			} )
				.then( function ( r ) { return r.json().then( function ( d ) { return { ok: r.ok, d: d }; } ); } )
				.then( function ( res ) {
					if ( ! res.ok || ! res.d || ! res.d.clientSecret ) {
						removeSkel();
						err.textContent = ( res.d && res.d.message ) || t.payError || '';
						err.classList.add( 'is-no' );
						return;
					}
					if ( res.d.amount ) {
						btn.textContent = ( t.payNow || 'Pay now' ) + ' · ' + money( res.d.amount / 100 );
					}
					var elements = stripe.elements( { clientSecret: res.d.clientSecret } );
					var paymentEl = elements.create( 'payment' );
					paymentEl.on( 'ready', removeSkel );
					paymentEl.mount( host );
					btn.disabled = false;
					btn.addEventListener( 'click', function () {
						btn.disabled = true;
						err.textContent = '';
						err.className = 'dinekit-order__result';
						btn.textContent = t.paying || '…';
						stripe.confirmPayment( {
							elements: elements,
							confirmParams: { return_url: window.location.href },
							redirect: 'if_required',
						} ).then( function ( result ) {
							if ( result.error ) {
								btn.disabled = false;
								btn.textContent = t.payNow || 'Pay now';
								err.textContent = result.error.message || t.payError || '';
								err.classList.add( 'is-no' );
							} else {
								state.paid = true;
								state.held = !! res.d.hold;
								state.view = 'done';
								render();
							}
						} );
					} );
				} )
				.catch( function () {
					removeSkel();
					err.textContent = t.networkError || '';
					err.classList.add( 'is-no' );
				} );
		}

		// Animated success tick (SVG stroke draw) for the receipt screen.
		function successTick() {
			var ns = 'http://www.w3.org/2000/svg';
			var svg = document.createElementNS( ns, 'svg' );
			svg.setAttribute( 'class', 'dinekit-order__tick' );
			svg.setAttribute( 'viewBox', '0 0 52 52' );
			svg.setAttribute( 'aria-hidden', 'true' );
			var circle = document.createElementNS( ns, 'circle' );
			circle.setAttribute( 'class', 'dinekit-order__tick-circle' );
			circle.setAttribute( 'cx', '26' );
			circle.setAttribute( 'cy', '26' );
			circle.setAttribute( 'r', '24' );
			var path = document.createElementNS( ns, 'path' );
			path.setAttribute( 'class', 'dinekit-order__tick-check' );
			path.setAttribute( 'd', 'M14 27l8 8 16-16' );
			svg.appendChild( circle );
			svg.appendChild( path );
			return svg;
		}

		function renderDone() {
			var box = el( 'div', 'dinekit-order__done' );
			box.appendChild( successTick() );
			box.appendChild( el( 'div', 'dinekit-order__done-title', state.held ? ( t.held || t.placed ) : state.paid ? ( t.paid || t.placed || 'Payment received' ) : ( t.placed || 'Order placed!' ) ) );
			box.appendChild( el( 'div', 'dinekit-order__done-num', ( t.orderNumber || 'Your order number is' ) + ' #' + ( state.done && state.done.number ) ) );
			box.appendChild( el( 'p', null, t.collectMsg || '' ) );
			app.appendChild( box );
		}

		render();
	}

	function init() {
		Array.prototype.forEach.call( document.querySelectorAll( '.dinekit-order' ), function ( n ) {
			if ( n.querySelector( '.dinekit-order__app' ) ) {
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
