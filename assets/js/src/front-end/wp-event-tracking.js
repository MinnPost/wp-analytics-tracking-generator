( function( $ ) {

	function wpAnalyticsCheckAnalyticsVersion() {
		var version = '';
		if ( 'undefined' !== typeof analytics_tracking_settings && 'undefined' !== typeof analytics_tracking_settings.analytics_type ) {
			if ( 'gtagjs' === analytics_tracking_settings.analytics_type && 'function' === typeof gtag ) {
				version = 'gtag';
			} else if ( 'analyticsjs' === analytics_tracking_settings.analytics_type && 'function' === typeof ga ) {
				version = 'ga';
			}
		}
		return version;
	}

	/*
	 * call hooks from other plugins or themes
	 *
	*/
	if ( typeof wp !== 'undefined' ) {
		wp.hooks.addAction( 'wpAnalyticsTrackingGeneratorEvent', 'wpAnalyticsTrackingGenerator', wpAnalyticsTrackingEvent, 10 );
		wp.hooks.addAction( 'wpAnalyticsTrackingGeneratorEcommerceAction', 'wpAnalyticsTrackingGenerator', wpAnalyticsTrackingEcommerceAction, 10 );
	}

	/*
	 * Create a Google Analytics event
	 * category: Event Category
	 * label: Event Label
	 * action: Event Action
	 * value: optional
	*/
	function wpAnalyticsTrackingEvent( type, category, action, label, value, non_interaction ) {
		var version = wpAnalyticsCheckAnalyticsVersion();
		if ( 'gtag' === version ) {
			// Sends the event to the Google Analytics property with
			// tracking ID GA_MEASUREMENT_ID set by the config command in
			// the global tracking snippet.
			// example: gtag('event', 'play', { 'event_category': 'Videos', 'event_label': 'Fall Campaign' });
			var params = {
				'event_category': category,
				'event_label': label
			};
			if ( 'undefined' !== typeof value ) {
				params.value = value;
			}
			if ( 'undefined' !== typeof non_interaction ) {
				params.non_interaction = non_interaction;
			}
			gtag( type, action, params );
		} else if ( 'ga' === version ) {
			// Uses the default tracker to send the event to the
			// Google Analytics property with tracking ID GA_MEASUREMENT_ID.
			// example: ga('send', 'event', 'Videos', 'play', 'Fall Campaign');
			// noninteraction seems to have been working like this in analytics.js.
			if ( non_interaction == 1 ) {
				value = { 'nonInteraction': 1 };
			}
			if ( 'undefined' === typeof value ) {
				ga( 'send', type, category, action, label );
			} else {
				ga( 'send', type, category, action, label, value );
			}
		}
	}

	/*
	 * Create a Google Analytics Ecommerce action
	 * 
	*/
	function wpAnalyticsTrackingEcommerceAction( type, action, product ) {
		var version = wpAnalyticsCheckAnalyticsVersion();
		if ( 'gtag' === version ) {
			gtag( type, action, {
				"items": [
					product
				]
			} );
		} else if ( 'ga' === version ) {
			ga( 'require', 'ec' );
			ga( 'ec:addProduct', product );
			switch( action) {
				case 'add_to_cart':
					ga( 'ec:setAction', 'add' );
				break;
				case 'begin_checkout':
					ga( 'ec:setAction', 'checkout', {
						'step': 1,
					});
				break;
				case 'select_content':
					ga( 'ec:setAction', 'detail' );
				break;
				default:
			  }
		}
	}

	function wpAnalyticsTrackingSetup() {
		var version = wpAnalyticsCheckAnalyticsVersion();
		if ( '' === version ) {
			return;
		}

		// settings for ScrollDepth plugin
		if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll && true === analytics_scrolldepth_settings.scroll.enabled ) {
			var scrollDepthSettings = [];
			// this needs to be true, regardless, because otherwise the assumption is that the tracking is defined in Google Tag Manager.
			// todo: it might be worth building a setting for this.
			scrollDepthSettings['gtmOverride'] = true;

			// if we're using ga, we need to tell the plugin
			if ( 'gtag' !== version ) {
				scrollDepthSettings['gaGlobal'] = 'ga';
			}

			// value is a string
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.minimum_height && '0' !== analytics_scrolldepth_settings.scroll.minimum_height ) {
				scrollDepthSettings['minimum_height'] = analytics_scrolldepth_settings.scroll.minimum_height;
			}

			// value is a boolean. default is true.
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.percentage && 'true' !== analytics_scrolldepth_settings.scroll.percentage ) {
				scrollDepthSettings['percentage'] = false;
			}

			// value is a boolean. default is true.
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.user_timing && 'true' !== analytics_scrolldepth_settings.scroll.user_timing ) {
				scrollDepthSettings['user_timing'] = false;
			}

			// value is a boolean. default is true.
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.pixel_depth && 'true' !== analytics_scrolldepth_settings.scroll.user_timing ) {
				scrollDepthSettings['pixel_depth'] = false;
			}

			// value is a boolean. default is true.
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.non_interaction && 'true' !== analytics_scrolldepth_settings.scroll.non_interaction ) {
				scrollDepthSettings['non_interaction'] = false;
			}

			// value is an array. default is empty.
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.scroll_elements ) {
				scrollDepthSettings['elements'] = $.map( analytics_scrolldepth_settings.scroll.scroll_elements.split( ',' ), $.trim );
			}

			// send scroll settings to the scrolldepth plugin
			if ( 'undefined' !== typeof analytics_scrolldepth_settings.scroll.use_jquery && true === analytics_scrolldepth_settings.scroll.use_jquery ) {
				jQuery.scrollDepth( scrollDepthSettings );
			} else {
				gascrolldepth.init( scrollDepthSettings );
			}
		}

		if ( 'undefined' !== typeof analytics_tracking_settings.special && true === analytics_tracking_settings.special.enabled ) {

			// external links
			$( 'a[href^="http"]:not([href*="://' + document.domain + '"])' ).click( function() {
				wpAnalyticsTrackingEvent( 'event', 'Outbound links', 'Click', this.href );
			});

			// mailto links
			$( 'a[href^="mailto"]' ).click( function() {
				wpAnalyticsTrackingEvent( 'event', 'Mails', 'Click', this.href.substring( 7 ) );
			});

			// tel links
			$( 'a[href^="tel"]' ).click( function() {
				wpAnalyticsTrackingEvent( 'event', 'Telephone', 'Call', this.href.substring( 7 ) );
			});

			// internal links
			$( 'a:not([href^="(http:|https:)?//"],[href^="#"],[href^="mailto:"])' ).click( function() {

				// track downloads
				if ( '' !== analytics_tracking_settings.special.download_regex ) {
					var url = this.href;
					var checkDownload = new RegExp( "\\.(" + analytics_tracking_settings.special.download_regex + ")([\?#].*)?$", "i" );
					var isDownload = checkDownload.test( url );
					if ( true === isDownload ) {
						var checkDownloadExtension = new RegExp("\\.(" + analytics_tracking_settings.special.download_regex + ")([\?#].*)?$", "i");
						var extensionResult = checkDownloadExtension.exec( url );
						var extension = '';
						if ( null !== extensionResult ) {
							extension = extensionResult[1];
						} else {
							extension = extensionResult;
						}
						// we can't use the url for the value here, even though that would be nice, because value is supposed to be an integer
						wpAnalyticsTrackingEvent( 'event', 'Downloads', extension, this.href );
					}
				}
			});
		}

		if ( 'undefined' !== typeof analytics_tracking_settings.affiliate && true === analytics_tracking_settings.affiliate.enabled ) {
			// any link could be an affiliate, i guess?
			$( 'a' ).click( function() {

				// track affiliates
				if ( '' !== analytics_tracking_settings.affiliate.affiliate_regex ) {
					var checkAffiliate = new RegExp( "\\.(" + analytics_tracking_settings.affiliate.affiliate_regex + ")([\?#].*)?$", "i" );
					var isAffiliate = checkAffiliate.test( url );
					if ( true === isAffiliate ) {
						wpAnalyticsTrackingEvent( 'event', 'Affiliate', 'Click', this.href );
					}
				}

			});
		}

		// link fragments as pageviews
		// does not use the event tracking method; flags a pageview instead.
		if ( 'undefined' !== typeof analytics_tracking_settings.fragment && true === analytics_tracking_settings.fragment.enabled ) {
			window.onhashchange = function(event) {
				var fragment_url = location.pathname + location.search + location.hash;
				if ( 'gtag' === version ) {
					gtag('set', 'page_path', fragment_url);
					gtag('event', 'page_view');
				} else if ( 'ga' === version ) {
					ga( 'send', 'pageview', fragment_url );
				}
			}
		}

		// when a button is clicked, attach it to the form's data
		$( 'input[type="submit"], button[type="submit"]' ).on( 'click', function() {
			var form = $( this ).parents( 'form:first' );
			$( form ).data( 'button', this );
		});

		// basic form submits. track submit instead of click because otherwise it's weird.
		if ( 'undefined' !== typeof analytics_tracking_settings.form_submissions && true === analytics_tracking_settings.form_submissions.enabled ) {
			$( 'form' ).submit( function( f ) {
				var button = $( this ).data( 'button' ) || $( 'input[type="submit"], button[type="submit"]' ).get( 0 );
				var category = $( button ).data( 'ga-category' ) || 'Form';
				var action = $( button ).data( 'ga-action' ) || 'Submit';
				var label = $( button ).data( 'ga-label' ) || $( button ).text() || button.value || button.name;
				wpAnalyticsTrackingEvent( 'event', category, action, label );
			});
		}
	}

	$( document ).ready( function() {
		wpAnalyticsTrackingSetup();
	});

} )( jQuery );
