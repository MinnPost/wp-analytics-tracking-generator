(function($){

	function toggleScrollFields( parent ) {
		var $toggle = $('input[type="checkbox"]', $(parent) );

		$( '.wp-analytics-generator-field' ).wrapAll( '<tr class="wp-analytics-generator-fields-wrap"><td colspan="2"><table />');
		$( '.wp-analytics-generator-fields-wrap' ).hide();
		$( '.wp-analytics-generator-fields-wrap table' ).before( '<h3>Scroll depth settings</h3>' );

		if ($toggle.is(':checked')) {
			$( '.wp-analytics-generator-fields-wrap' ).show();
		}
		$toggle.on('click', function(e) {
			var checkbox = $(this);

			$( '.wp-analytics-generator-fields-wrap' ).hide();

			if (checkbox.is(':checked')) {
				$( '.wp-analytics-generator-fields-wrap' ).show();
			}
		});
	}

	$(document).ready(function() {
		if ( $('.wp-analytics-generator-field-track-page-scroll-toggle').length > 0 ) {
			toggleScrollFields( '.wp-analytics-generator-field-track-page-scroll-toggle' );
		}
	});

})(jQuery);
