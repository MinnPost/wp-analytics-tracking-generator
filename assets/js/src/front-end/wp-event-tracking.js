( function( $ ) {

	/*
	category: Event Category
	label: Event Label
	action: Event Action
	value: optional
	*/
	function wp_analytics_tracking_event( type, category, action, label, value ) {
		if ( typeof ga !== 'undefined' ) {
			if ( typeof value === 'undefined' ) {
				ga( 'send', type, category, action, label );
			} else {
				ga( 'send', type, category, action, label, value );
			}
		} else {
			return;
		}
	}

	if ( 'undefined' !== typeof analytics_tracking_settings ) {

		if ( 'undefined' !== typeof analytics_tracking_settings.scroll && true === analytics_tracking_settings.scroll.enabled ) {
			$.scrollDepth({
			  minHeight: analytics_tracking_settings.scroll.minimum_height,
			  elements: analytics_tracking_settings.scroll.scroll_elements.split(', '),
			  percentage: analytics_tracking_settings.scroll.percentage,
			  userTiming: analytics_tracking_settings.scroll.user_timing,
			  pixelDepth: analytics_tracking_settings.scroll.pixel_depth,
			  nonInteraction: analytics_tracking_settings.scroll.non_interaction
			});
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
		if ( 'undefined' !== typeof analytics_tracking_settings.fragment && true === analytics_tracking_settings.fragment.enabled ) {
			window.onhashchange = function() {
				wp_analytics_tracking_event( 'pageview', location.pathname + location.search + location.hash );
			}
		}

		// form submits
		if ( 'undefined' !== typeof analytics_tracking_settings.form_submits && true === analytics_tracking_settings.form_submits.enabled ) {
			$( 'input[type="submit"], button[type="submit"]' ).click( function( f ) {
	            var d = this;
	            var b = d.getAttribute("data-vars-ga-category") || "form";
	            var c = d.getAttribute("data-vars-ga-action") || "submit";
	            var a = d.getAttribute("data-vars-ga-label") || d.name || d.value;
	            gadwp_send_event(b, c, a, false)
	            wp_analytics_tracking_event( 'event', 'Form', 'Submit', this.href );
	        });
		}

	}

	/*$( document ).ready( function() {

	});*/

} )( jQuery );
