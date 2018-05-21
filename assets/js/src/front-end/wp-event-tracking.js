( function( $ ) {

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

} )( jQuery );
