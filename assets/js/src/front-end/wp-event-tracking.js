( function( $ ) {

	/*
	 * Create a Google Analytics event
	 * category: Event Category
	 * label: Event Label
	 * action: Event Action
	 * value: optional
	*/
	function wp_analytics_tracking_event( type, category, action, label, value, non_interaction ) {
		if ( typeof gtag !== 'undefined' ) {
			// Sends the event to the Google Analytics property with
			// tracking ID GA_MEASUREMENT_ID set by the config command in
			// the global tracking snippet.
			// example: gtag('event', 'play', { 'event_category': 'Videos', 'event_label': 'Fall Campaign' });
			var params = {
				'event_category': category,
				'event_label': label
			};
			if ( typeof value !== 'undefined' ) {
				params.value = value;
			}
			if ( typeof non_interaction !== 'undefined' ) {
				params.non_interaction = non_interaction;
			}
			gtag( type, action, params );
		} else if ( typeof ga !== 'undefined' ) {
			// Uses the default tracker to send the event to the
			// Google Analytics property with tracking ID GA_MEASUREMENT_ID.
			// example: ga('send', 'event', 'Videos', 'play', 'Fall Campaign');
			// noninteraction seems to have been working like this in analytics.js.
			if ( non_interaction == 1 ) {
				value = { 'nonInteraction': 1 };
			}
			if ( typeof value === 'undefined' ) {
				ga( 'send', type, category, action, label );
			} else {
				ga( 'send', type, category, action, label, value );
			}
		} else {
			return;
		}
	}

	function wp_analytics_tracking_setup() {
		if ( 'undefined' === typeof gtag && 'undefined' === typeof ga ) {
			return;
		}
		var scrollDepthSettings = [];
		if ( 'undefined' !== typeof analytics_tracking_settings ) {
			if ( 'undefined' !== typeof analytics_tracking_settings.scroll && true === analytics_tracking_settings.scroll.enabled ) {

				// value is a string and a boolean
				if ( 'undefined' !== typeof analytics_tracking_settings.analytics_type && 'gtagjs' !== analytics_tracking_settings.analytics_type ) {
					scrollDepthSettings['gtmOverride'] = true;
					scrollDepthSettings['gaGlobal'] = 'ga';
				}

				// value is a string
				if ( 'undefined' !== typeof analytics_tracking_settings.scroll.minimum_height && '0' !== analytics_tracking_settings.scroll.minimum_height ) {
					scrollDepthSettings['minimum_height'] = analytics_tracking_settings.scroll.minimum_height;
				}

				// value is a boolean. default is true.
				if ( 'undefined' !== typeof analytics_tracking_settings.scroll.percentage && 'true' !== analytics_tracking_settings.scroll.percentage ) {
					scrollDepthSettings['percentage'] = false;
				}

				// value is a boolean. default is true.
				if ( 'undefined' !== typeof analytics_tracking_settings.scroll.user_timing && 'true' !== analytics_tracking_settings.scroll.user_timing ) {
					scrollDepthSettings['user_timing'] = false;
				}

				// value is a boolean. default is true.
				if ( 'undefined' !== typeof analytics_tracking_settings.scroll.pixel_depth && 'true' !== analytics_tracking_settings.scroll.user_timing ) {
					scrollDepthSettings['pixel_depth'] = false;
				}

				// value is a boolean. default is true.
				if ( 'undefined' !== typeof analytics_tracking_settings.scroll.non_interaction && 'true' !== analytics_tracking_settings.scroll.non_interaction ) {
					scrollDepthSettings['non_interaction'] = false;
				}

				// value is an array. default is empty.
				if ( 'undefined' !== typeof analytics_tracking_settings.scroll.scroll_elements ) {
					scrollDepthSettings['elements'] = $.map( analytics_tracking_settings.scroll.scroll_elements.split( ',' ), $.trim );
				}
				
				// send scroll settings to the scrolldepth plugin
				jQuery.scrollDepth( scrollDepthSettings );
			}

			if ( 'undefined' !== typeof analytics_tracking_settings.special && true === analytics_tracking_settings.special.enabled ) {

				// external links
				$( 'a[href^="http"]:not([href*="://' + document.domain + '"])' ).click( function() {
				    wp_analytics_tracking_event( 'event', 'Outbound links', 'Click', this.href );
				});

				// mailto links
				$( 'a[href^="mailto"]' ).click( function() {
				    wp_analytics_tracking_event( 'event', 'Mails', 'Click', this.href.substring( 7 ) );
				});

				// tel links
				$( 'a[href^="tel"]' ).click( function() {
				    wp_analytics_tracking_event( 'event', 'Telephone', 'Call', this.href.substring( 7 ) );
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
							wp_analytics_tracking_event( 'event', 'Downloads', extension, this.href );
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
							wp_analytics_tracking_event( 'event', 'Affiliate', 'Click', this.href );
						}
					}

				});
			}

			// link fragments as pageviews
			// does not use the event tracking method
			if ( 'undefined' !== typeof analytics_tracking_settings.fragment && true === analytics_tracking_settings.fragment.enabled ) {
				if ( typeof ga !== 'undefined' ) {
					window.onhashchange = function() {
						ga( 'send', 'pageview', location.pathname + location.search + location.hash );
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
		            wp_analytics_tracking_event( 'event', category, action, label );
		        });
			}

		} else {
			console.log( 'no analytics_tracking_settings' );
		}
	}

	$( document ).ready( function() {
		wp_analytics_tracking_setup();
		if ( 'undefined' !== typeof analytics_tracking_settings.track_adblocker && true === analytics_tracking_settings.track_adblocker.enabled ) {
			if ( typeof window.adblockDetector === 'undefined' ) {
				wp_analytics_tracking_event( 'event', 'Adblock', 'On', 'Adblocker Status', undefined, 1 );
			} else {
				window.adblockDetector.init(
					{
						debug: false,
						found: function() {
							wp_analytics_tracking_event( 'event', 'Adblock', 'On', 'Adblocker Status', undefined, 1 );
						},
						notFound: function() {
							wp_analytics_tracking_event( 'event', 'Adblock', 'Off', 'Adblocker Status', undefined, 1 );
						}
					}
				);
			}
		}
	});

} )( jQuery );
