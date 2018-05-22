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

	if ( 'undefined' !== typeof analytics_tracking_settings && true === analytics_tracking_settings.scroll.enabled ) {
		$.scrollDepth({
		  minHeight: analytics_tracking_settings.scroll.minimum_height,
		  elements: analytics_tracking_settings.scroll.scroll_elements.split(', '),
		  percentage: analytics_tracking_settings.scroll.percentage,
		  userTiming: analytics_tracking_settings.scroll.user_timing,
		  pixelDepth: analytics_tracking_settings.scroll.pixel_depth,
		  nonInteraction: analytics_tracking_settings.scroll.non_interaction
		});
	}

	/*$( document ).ready( function() {

	});*/

	if ( 'undefined' !== typeof analytics_tracking_settings && true === analytics_tracking_settings.special.enabled ) {
		$( 'a[href^="http"]:not([href*="://' + document.domain + '"])' ).click( function() {
		    wp_analytics_tracking_event( 'event', 'Outbound links', 'Click', this.href )
		});
	}

} )( jQuery );
