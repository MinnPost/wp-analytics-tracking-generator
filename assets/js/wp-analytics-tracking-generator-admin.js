'use strict';

(function ($) {

	function toggleEventFields(parent, type, heading) {
		var $toggle = $('input[type="checkbox"]', $(parent));

		$('.wp-analytics-generator-field-' + type).wrapAll('<tr class="wp-analytics-generator-fields-wrap wp-analytics-generator-fields-' + type + '-wrap"><td colspan="2"><table />');
		$('.wp-analytics-generator-fields-' + type + '-wrap').hide();
		if ('' !== heading) {
			$('.wp-analytics-generator-fields-' + type + '-wrap table').prepend('<caption>' + heading + '</caption>');
		}

		if ($toggle.is(':checked')) {
			$('.wp-analytics-generator-fields-' + type + '-wrap').show();
		}
		$toggle.on('click', function (e) {
			var checkbox = $(this);

			$('.wp-analytics-generator-fields-' + type + '-wrap').hide();

			if (checkbox.is(':checked')) {
				$('.wp-analytics-generator-fields-' + type + '-wrap').show();
			}
		});
	}

	$(document).ready(function () {
		if ($('.wp-analytics-generator-field-track-page-scroll-toggle').length > 0) {
			toggleEventFields('.wp-analytics-generator-field-track-page-scroll-toggle', 'scroll', 'Scroll depth settings');
		}
		if ($('.wp-analytics-generator-field-track-special').length > 0) {
			toggleEventFields('.wp-analytics-generator-field-track-special', 'special', '');
		}
		if ($('.wp-analytics-generator-field-track-affiliate').length > 0) {
			toggleEventFields('.wp-analytics-generator-field-track-affiliate', 'affiliate', '');
		}
	});
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ0b2dnbGVFdmVudEZpZWxkcyIsInBhcmVudCIsInR5cGUiLCJoZWFkaW5nIiwiJHRvZ2dsZSIsIndyYXBBbGwiLCJoaWRlIiwicHJlcGVuZCIsImlzIiwic2hvdyIsIm9uIiwiZSIsImNoZWNrYm94IiwiZG9jdW1lbnQiLCJyZWFkeSIsImxlbmd0aCIsImpRdWVyeSJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxDQUFDLFVBQVNBLENBQVQsRUFBVzs7QUFFWCxVQUFTQyxpQkFBVCxDQUE0QkMsTUFBNUIsRUFBb0NDLElBQXBDLEVBQTBDQyxPQUExQyxFQUFvRDtBQUNuRCxNQUFJQyxVQUFVTCxFQUFFLHdCQUFGLEVBQTRCQSxFQUFFRSxNQUFGLENBQTVCLENBQWQ7O0FBRUFGLElBQUcsbUNBQW1DRyxJQUF0QyxFQUE2Q0csT0FBN0MsQ0FBc0QsaUZBQWlGSCxJQUFqRixHQUF3RixrQ0FBOUk7QUFDQUgsSUFBRyxvQ0FBb0NHLElBQXBDLEdBQTJDLE9BQTlDLEVBQXdESSxJQUF4RDtBQUNBLE1BQUssT0FBT0gsT0FBWixFQUFzQjtBQUNyQkosS0FBRyxvQ0FBb0NHLElBQXBDLEdBQTJDLGFBQTlDLEVBQThESyxPQUE5RCxDQUF1RSxjQUFjSixPQUFkLEdBQXdCLFlBQS9GO0FBQ0E7O0FBRUQsTUFBSUMsUUFBUUksRUFBUixDQUFXLFVBQVgsQ0FBSixFQUE0QjtBQUMzQlQsS0FBRyxvQ0FBb0NHLElBQXBDLEdBQTJDLE9BQTlDLEVBQXdETyxJQUF4RDtBQUNBO0FBQ0RMLFVBQVFNLEVBQVIsQ0FBVyxPQUFYLEVBQW9CLFVBQVNDLENBQVQsRUFBWTtBQUMvQixPQUFJQyxXQUFXYixFQUFFLElBQUYsQ0FBZjs7QUFFQUEsS0FBRyxvQ0FBb0NHLElBQXBDLEdBQTJDLE9BQTlDLEVBQXdESSxJQUF4RDs7QUFFQSxPQUFJTSxTQUFTSixFQUFULENBQVksVUFBWixDQUFKLEVBQTZCO0FBQzVCVCxNQUFHLG9DQUFvQ0csSUFBcEMsR0FBMkMsT0FBOUMsRUFBd0RPLElBQXhEO0FBQ0E7QUFDRCxHQVJEO0FBU0E7O0FBRURWLEdBQUVjLFFBQUYsRUFBWUMsS0FBWixDQUFrQixZQUFXO0FBQzVCLE1BQUtmLEVBQUUsd0RBQUYsRUFBNERnQixNQUE1RCxHQUFxRSxDQUExRSxFQUE4RTtBQUM3RWYscUJBQW1CLHdEQUFuQixFQUE2RSxRQUE3RSxFQUF1Rix1QkFBdkY7QUFDQTtBQUNELE1BQUtELEVBQUUsNkNBQUYsRUFBaURnQixNQUFqRCxHQUEwRCxDQUEvRCxFQUFtRTtBQUNsRWYscUJBQW1CLDZDQUFuQixFQUFrRSxTQUFsRSxFQUE2RSxFQUE3RTtBQUNBO0FBQ0QsTUFBS0QsRUFBRSwrQ0FBRixFQUFtRGdCLE1BQW5ELEdBQTRELENBQWpFLEVBQXFFO0FBQ3BFZixxQkFBbUIsK0NBQW5CLEVBQW9FLFdBQXBFLEVBQWlGLEVBQWpGO0FBQ0E7QUFDRCxFQVZEO0FBWUEsQ0FyQ0QsRUFxQ0dnQixNQXJDSCIsImZpbGUiOiJ3cC1hbmFseXRpY3MtdHJhY2tpbmctZ2VuZXJhdG9yLWFkbWluLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCQpe1xuXG5cdGZ1bmN0aW9uIHRvZ2dsZUV2ZW50RmllbGRzKCBwYXJlbnQsIHR5cGUsIGhlYWRpbmcgKSB7XG5cdFx0dmFyICR0b2dnbGUgPSAkKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nLCAkKHBhcmVudCkgKTtcblxuXHRcdCQoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC0nICsgdHlwZSApLndyYXBBbGwoICc8dHIgY2xhc3M9XCJ3cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkcy13cmFwIHdwLWFuYWx5dGljcy1nZW5lcmF0b3ItZmllbGRzLScgKyB0eXBlICsgJy13cmFwXCI+PHRkIGNvbHNwYW49XCIyXCI+PHRhYmxlIC8+Jyk7XG5cdFx0JCggJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkcy0nICsgdHlwZSArICctd3JhcCcgKS5oaWRlKCk7XG5cdFx0aWYgKCAnJyAhPT0gaGVhZGluZyApIHtcblx0XHRcdCQoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZHMtJyArIHR5cGUgKyAnLXdyYXAgdGFibGUnICkucHJlcGVuZCggJzxjYXB0aW9uPicgKyBoZWFkaW5nICsgJzwvY2FwdGlvbj4nICk7XG5cdFx0fVxuXG5cdFx0aWYgKCR0b2dnbGUuaXMoJzpjaGVja2VkJykpIHtcblx0XHRcdCQoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZHMtJyArIHR5cGUgKyAnLXdyYXAnICkuc2hvdygpO1xuXHRcdH1cblx0XHQkdG9nZ2xlLm9uKCdjbGljaycsIGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciBjaGVja2JveCA9ICQodGhpcyk7XG5cblx0XHRcdCQoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZHMtJyArIHR5cGUgKyAnLXdyYXAnICkuaGlkZSgpO1xuXG5cdFx0XHRpZiAoY2hlY2tib3guaXMoJzpjaGVja2VkJykpIHtcblx0XHRcdFx0JCggJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkcy0nICsgdHlwZSArICctd3JhcCcgKS5zaG93KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQkKGRvY3VtZW50KS5yZWFkeShmdW5jdGlvbigpIHtcblx0XHRpZiAoICQoJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkLXRyYWNrLXBhZ2Utc2Nyb2xsLXRvZ2dsZScpLmxlbmd0aCA+IDAgKSB7XG5cdFx0XHR0b2dnbGVFdmVudEZpZWxkcyggJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkLXRyYWNrLXBhZ2Utc2Nyb2xsLXRvZ2dsZScsICdzY3JvbGwnLCAnU2Nyb2xsIGRlcHRoIHNldHRpbmdzJyApO1xuXHRcdH1cblx0XHRpZiAoICQoJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkLXRyYWNrLXNwZWNpYWwnKS5sZW5ndGggPiAwICkge1xuXHRcdFx0dG9nZ2xlRXZlbnRGaWVsZHMoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC10cmFjay1zcGVjaWFsJywgJ3NwZWNpYWwnLCAnJyApO1xuXHRcdH1cblx0XHRpZiAoICQoJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkLXRyYWNrLWFmZmlsaWF0ZScpLmxlbmd0aCA+IDAgKSB7XG5cdFx0XHR0b2dnbGVFdmVudEZpZWxkcyggJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkLXRyYWNrLWFmZmlsaWF0ZScsICdhZmZpbGlhdGUnLCAnJyApO1xuXHRcdH1cblx0fSk7XG5cbn0pKGpRdWVyeSk7XG4iXX0=
