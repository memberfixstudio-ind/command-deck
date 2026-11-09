/**
 * Command Deck: a keyboard-first command palette for wp-admin.
 * No build step and no framework; it only depends on wp.apiFetch for search.
 */
( function () {
	'use strict';

	var data = window.commandDeck;
	if ( ! data ) {
		return;
	}

	var t = data.i18n;
	var RECENT_KEY = 'commandDeck.recent';
	var MAX_RECENT = 5;
	var state = { open: false, items: [], active: 0, query: '', remote: [], loading: false, timer: null, controller: null, lastFocus: null };
	var els = {};

	/* ---------- Storage (never required, so every call is guarded) ---------- */

	function readRecent() {
		try {
			var raw = window.localStorage.getItem( RECENT_KEY );
			return raw ? JSON.parse( raw ) : [];
		} catch ( e ) {
			return [];
		}
	}

	function saveRecent( item ) {
		try {
			var list = readRecent().filter( function ( r ) {
				return r.url !== item.url;
			} );
			list.unshift( { title: item.title, url: item.url, meta: item.meta || '', external: !! item.external } );
			window.localStorage.setItem( RECENT_KEY, JSON.stringify( list.slice( 0, MAX_RECENT ) ) );
		} catch ( e ) {}
	}

	/* ---------- Matching ---------- */

	// Scores a fuzzy match: every query character must appear in order.
	// Consecutive runs and word starts score higher, so "plug add" finds "Plugins › Add New".
	function score( text, query ) {
		var hay = text.toLowerCase();
		var q = query.toLowerCase().replace( /\s+/g, '' );
		if ( ! q ) {
			return { score: 1, hits: [] };
		}
		var hits = [];
		var total = 0;
		var run = 0;
		var from = 0;
		for ( var i = 0; i < q.length; i++ ) {
			var at = hay.indexOf( q[ i ], from );
			if ( at === -1 ) {
				return null;
			}
			var wordStart = at === 0 || /[\s›\-_/]/.test( hay[ at - 1 ] );
			run = at === from && i > 0 ? run + 1 : 0;
			total += 1 + run * 3 + ( wordStart ? 4 : 0 );
			hits.push( at );
			from = at + 1;
		}
		if ( hay.indexOf( query.toLowerCase().trim() ) === 0 ) {
			total += 20;
		}
		return { score: total - text.length * 0.05, hits: hits };
	}

	function matchLocal( list, query ) {
		return list
			.map( function ( item ) {
				var m = score( item.title, query );
				if ( ! m && item.keys ) {
					m = score( item.keys, query );
					if ( m ) {
						m.hits = [];
						m.score -= 5;
					}
				}
				return m ? Object.assign( {}, item, { score: m.score, hits: m.hits } ) : null;
			} )
			.filter( Boolean )
			.sort( function ( a, b ) {
				return b.score - a.score;
			} );
	}

	/* ---------- Remote search ---------- */

	function decode( html ) {
		var el = document.createElement( 'textarea' );
		el.innerHTML = html;
		return el.value;
	}

	function searchRemote( query ) {
		if ( state.controller ) {
			state.controller.abort();
		}
		if ( query.trim().length < 2 || ! window.wp || ! window.wp.apiFetch ) {
			state.remote = [];
			state.loading = false;
			render();
			return;
		}

		var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		state.controller = controller;
		state.loading = true;
		render();

		var signal = controller ? controller.signal : undefined;
		var q = encodeURIComponent( query.trim() );
		var requests = [
			window.wp.apiFetch( { path: '/wp/v2/search?per_page=6&_fields=id,title,subtype,type&search=' + q, signal: signal } ).then( function ( rows ) {
				return rows
					.filter( function ( r ) {
						return r.type === 'post';
					} )
					.map( function ( r ) {
						return {
							title: decode( r.title || t.untitled ),
							url: data.adminUrl + 'post.php?post=' + r.id + '&action=edit',
							group: t.content,
							meta: r.subtype,
						};
					} );
			} ),
		];

		if ( data.canUsers ) {
			requests.push(
				window.wp.apiFetch( { path: '/wp/v2/users?per_page=3&_fields=id,name,slug&search=' + q, signal: signal } ).then( function ( rows ) {
					return rows.map( function ( r ) {
						return {
							title: decode( r.name ),
							url: data.adminUrl + 'user-edit.php?user_id=' + r.id,
							group: t.users,
							meta: '@' + r.slug,
						};
					} );
				} )
			);
		}

		Promise.all(
			requests.map( function ( p ) {
				return p.catch( function ( err ) {
					if ( err && err.name === 'AbortError' ) {
						throw err;
					}
					return [];
				} );
			} )
		)
			.then( function ( groups ) {
				if ( state.controller !== controller ) {
					return;
				}
				state.remote = [].concat.apply( [], groups );
				state.loading = false;
				render();
			} )
			.catch( function () {} );
	}

	/* ---------- Rendering ---------- */

	function highlight( text, hits ) {
		var frag = document.createDocumentFragment();
		if ( ! hits || ! hits.length ) {
			frag.appendChild( document.createTextNode( text ) );
			return frag;
		}
		var set = {};
		hits.forEach( function ( h ) {
			set[ h ] = true;
		} );
		var buffer = '';
		var marked = false;
		for ( var i = 0; i <= text.length; i++ ) {
			var isHit = !! set[ i ];
			if ( i === text.length || isHit !== marked ) {
				if ( buffer ) {
					if ( marked ) {
						var m = document.createElement( 'mark' );
						m.textContent = buffer;
						frag.appendChild( m );
					} else {
						frag.appendChild( document.createTextNode( buffer ) );
					}
				}
				buffer = '';
				marked = isHit;
			}
			if ( i < text.length ) {
				buffer += text[ i ];
			}
		}
		return frag;
	}

	function collect() {
		var q = state.query.trim();
		if ( ! q ) {
			var recent = readRecent().map( function ( r ) {
				return Object.assign( {}, r, { group: t.recent } );
			} );
			return recent.concat( data.actions );
		}
		var local = matchLocal( data.actions.concat( data.screens ), q ).slice( 0, 8 );
		return local.concat( state.remote );
	}

	function render() {
		if ( ! state.open ) {
			return;
		}
		state.items = collect();
		if ( state.active >= state.items.length ) {
			state.active = Math.max( 0, state.items.length - 1 );
		}

		var list = els.list;
		list.textContent = '';
		var lastGroup = null;

		state.items.forEach( function ( item, index ) {
			if ( item.group !== lastGroup ) {
				var head = document.createElement( 'li' );
				head.className = 'cd-group';
				head.setAttribute( 'role', 'presentation' );
				head.textContent = item.group;
				list.appendChild( head );
				lastGroup = item.group;
			}

			var li = document.createElement( 'li' );
			li.id = 'cd-option-' + index;
			li.className = 'cd-item' + ( index === state.active ? ' is-active' : '' );
			li.setAttribute( 'role', 'option' );
			li.setAttribute( 'aria-selected', index === state.active ? 'true' : 'false' );

			var title = document.createElement( 'span' );
			title.className = 'cd-title';
			title.appendChild( highlight( item.title, item.hits ) );
			li.appendChild( title );

			if ( item.meta ) {
				var meta = document.createElement( 'span' );
				meta.className = 'cd-meta';
				meta.textContent = item.meta;
				li.appendChild( meta );
			}

			var go = document.createElement( 'span' );
			go.className = 'cd-enter';
			go.setAttribute( 'aria-hidden', 'true' );
			go.textContent = '↵';
			li.appendChild( go );

			li.addEventListener( 'mousemove', function () {
				if ( state.active !== index ) {
					state.active = index;
					paintActive();
				}
			} );
			li.addEventListener( 'click', function ( e ) {
				run( item, e.metaKey || e.ctrlKey );
			} );
			list.appendChild( li );
		} );

		if ( state.loading ) {
			list.appendChild( note( t.searching, 'cd-note is-loading' ) );
		} else if ( ! state.items.length ) {
			list.appendChild( note( t.empty, 'cd-note' ) );
		}

		paintActive();
	}

	function note( text, cls ) {
		var li = document.createElement( 'li' );
		li.className = cls;
		li.setAttribute( 'role', 'presentation' );
		li.textContent = text;
		return li;
	}

	function paintActive() {
		var options = els.list.querySelectorAll( '.cd-item' );
		options.forEach( function ( el, i ) {
			var on = i === state.active;
			el.classList.toggle( 'is-active', on );
			el.setAttribute( 'aria-selected', on ? 'true' : 'false' );
			if ( on ) {
				els.input.setAttribute( 'aria-activedescendant', el.id );
				el.scrollIntoView( { block: 'nearest' } );
			}
		} );
		if ( ! options.length ) {
			els.input.removeAttribute( 'aria-activedescendant' );
		}
	}

	/* ---------- Behaviour ---------- */

	function run( item, newTab ) {
		if ( ! item ) {
			return;
		}
		saveRecent( item );
		if ( newTab || item.external ) {
			window.open( item.url, '_blank', 'noopener' );
			close();
			return;
		}
		window.location.href = item.url;
	}

	function open() {
		if ( state.open ) {
			return;
		}
		state.open = true;
		state.lastFocus = document.activeElement;
		state.query = '';
		state.remote = [];
		state.active = 0;
		els.input.value = '';
		els.root.hidden = false;
		document.documentElement.classList.add( 'cd-locked' );
		requestAnimationFrame( function () {
			els.root.classList.add( 'is-open' );
			els.input.focus();
		} );
		render();
	}

	function close() {
		if ( ! state.open ) {
			return;
		}
		state.open = false;
		els.root.classList.remove( 'is-open' );
		document.documentElement.classList.remove( 'cd-locked' );
		window.setTimeout( function () {
			if ( ! state.open ) {
				els.root.hidden = true;
			}
		}, 160 );
		if ( state.lastFocus && state.lastFocus.focus ) {
			state.lastFocus.focus();
		}
	}

	function onInput() {
		state.query = els.input.value;
		state.active = 0;
		state.remote = [];
		window.clearTimeout( state.timer );
		render();
		state.timer = window.setTimeout( function () {
			searchRemote( state.query );
		}, 180 );
	}

	function onKey( e ) {
		var count = state.items.length;
		if ( e.key === 'ArrowDown' ) {
			e.preventDefault();
			state.active = count ? ( state.active + 1 ) % count : 0;
			paintActive();
		} else if ( e.key === 'ArrowUp' ) {
			e.preventDefault();
			state.active = count ? ( state.active - 1 + count ) % count : 0;
			paintActive();
		} else if ( e.key === 'Enter' ) {
			e.preventDefault();
			run( state.items[ state.active ], e.metaKey || e.ctrlKey );
		} else if ( e.key === 'Escape' ) {
			e.preventDefault();
			close();
		} else if ( e.key === 'Tab' ) {
			e.preventDefault();
		}
	}

	function build() {
		var mod = data.isMac ? '⌘' : 'Ctrl';
		var root = document.createElement( 'div' );
		root.className = 'cd-root';
		root.hidden = true;
		root.innerHTML =
			'<div class="cd-backdrop" data-cd-close></div>' +
			'<div class="cd-panel" role="dialog" aria-modal="true" aria-label="">' +
			'<div class="cd-search">' +
			'<svg class="cd-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
			'<input class="cd-input" type="text" role="combobox" aria-expanded="true" aria-controls="cd-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" />' +
			'<kbd class="cd-esc">Esc</kbd>' +
			'</div>' +
			'<ul class="cd-list" id="cd-list" role="listbox"></ul>' +
			'<div class="cd-footer">' +
			'<span><kbd>↑</kbd><kbd>↓</kbd> <span class="cd-f-move"></span></span>' +
			'<span><kbd>↵</kbd> <span class="cd-f-open"></span></span>' +
			'<span><kbd>' + mod + '</kbd><kbd>↵</kbd> <span class="cd-f-tab"></span></span>' +
			'<span class="cd-brand"></span>' +
			'</div>' +
			'</div>';

		document.body.appendChild( root );
		els.root = root;
		els.input = root.querySelector( '.cd-input' );
		els.list = root.querySelector( '.cd-list' );

		root.querySelector( '.cd-panel' ).setAttribute( 'aria-label', t.label );
		els.input.setAttribute( 'placeholder', t.placeholder );
		els.input.setAttribute( 'aria-label', t.placeholder );
		root.querySelector( '.cd-f-move' ).textContent = t.navigate;
		root.querySelector( '.cd-f-open' ).textContent = t.open;
		root.querySelector( '.cd-f-tab' ).textContent = t.newTab;
		root.querySelector( '.cd-brand' ).textContent = t.label;

		els.input.addEventListener( 'input', onInput );
		els.input.addEventListener( 'keydown', onKey );
		root.querySelector( '[data-cd-close]' ).addEventListener( 'click', close );

		var barKbd = document.querySelector( '#wp-admin-bar-command-deck .cd-bar-kbd' );
		if ( barKbd ) {
			barKbd.textContent = mod + ' K';
		}
		var barLink = document.querySelector( '#wp-admin-bar-command-deck > a' );
		if ( barLink ) {
			barLink.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				open();
			} );
		}
	}

	document.addEventListener( 'keydown', function ( e ) {
		var isK = e.key && e.key.toLowerCase() === 'k';
		// The block editor already uses ⌘K for links and its own command menu,
		// so leave the shortcut alone there. The admin bar button still works.
		var inEditor = document.body.classList.contains( 'block-editor-page' );
		if ( isK && ! inEditor && ( e.metaKey || e.ctrlKey ) && ! e.altKey && ! e.shiftKey ) {
			e.preventDefault();
			e.stopPropagation();
			if ( state.open ) {
				close();
			} else {
				open();
			}
		}
	}, true );

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', build );
	} else {
		build();
	}
} )();
