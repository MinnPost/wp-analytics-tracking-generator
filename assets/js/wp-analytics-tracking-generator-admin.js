'use strict';

(function ($) {

	function toggleEventFields(parent, type, heading) {
		var $toggle = $('input[type="checkbox"]', $(parent));

		$('.wp-analytics-generator-field-' + type).wrapAll('<tr class="wp-analytics-generator-fields-' + type + '-wrap"><td colspan="2"><table />');
		$('.wp-analytics-generator-fields-' + type + '-wrap').hide();
		if ('' !== heading) {
			$('.wp-analytics-generator-fields-' + type + '-wrap table').before('<h3>' + heading + '</h3>');
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ0b2dnbGVFdmVudEZpZWxkcyIsInBhcmVudCIsInR5cGUiLCJoZWFkaW5nIiwiJHRvZ2dsZSIsIndyYXBBbGwiLCJoaWRlIiwiYmVmb3JlIiwiaXMiLCJzaG93Iiwib24iLCJlIiwiY2hlY2tib3giLCJkb2N1bWVudCIsInJlYWR5IiwibGVuZ3RoIiwialF1ZXJ5Il0sIm1hcHBpbmdzIjoiOztBQUFBLENBQUMsVUFBU0EsQ0FBVCxFQUFXOztBQUVYLFVBQVNDLGlCQUFULENBQTRCQyxNQUE1QixFQUFvQ0MsSUFBcEMsRUFBMENDLE9BQTFDLEVBQW9EO0FBQ25ELE1BQUlDLFVBQVVMLEVBQUUsd0JBQUYsRUFBNEJBLEVBQUVFLE1BQUYsQ0FBNUIsQ0FBZDs7QUFFQUYsSUFBRyxtQ0FBbUNHLElBQXRDLEVBQTZDRyxPQUE3QyxDQUFzRCw4Q0FBOENILElBQTlDLEdBQXFELGtDQUEzRztBQUNBSCxJQUFHLG9DQUFvQ0csSUFBcEMsR0FBMkMsT0FBOUMsRUFBd0RJLElBQXhEO0FBQ0EsTUFBSyxPQUFPSCxPQUFaLEVBQXNCO0FBQ3JCSixLQUFHLG9DQUFvQ0csSUFBcEMsR0FBMkMsYUFBOUMsRUFBOERLLE1BQTlELENBQXNFLFNBQVNKLE9BQVQsR0FBbUIsT0FBekY7QUFDQTs7QUFFRCxNQUFJQyxRQUFRSSxFQUFSLENBQVcsVUFBWCxDQUFKLEVBQTRCO0FBQzNCVCxLQUFHLG9DQUFvQ0csSUFBcEMsR0FBMkMsT0FBOUMsRUFBd0RPLElBQXhEO0FBQ0E7QUFDREwsVUFBUU0sRUFBUixDQUFXLE9BQVgsRUFBb0IsVUFBU0MsQ0FBVCxFQUFZO0FBQy9CLE9BQUlDLFdBQVdiLEVBQUUsSUFBRixDQUFmOztBQUVBQSxLQUFHLG9DQUFvQ0csSUFBcEMsR0FBMkMsT0FBOUMsRUFBd0RJLElBQXhEOztBQUVBLE9BQUlNLFNBQVNKLEVBQVQsQ0FBWSxVQUFaLENBQUosRUFBNkI7QUFDNUJULE1BQUcsb0NBQW9DRyxJQUFwQyxHQUEyQyxPQUE5QyxFQUF3RE8sSUFBeEQ7QUFDQTtBQUNELEdBUkQ7QUFTQTs7QUFFRFYsR0FBRWMsUUFBRixFQUFZQyxLQUFaLENBQWtCLFlBQVc7QUFDNUIsTUFBS2YsRUFBRSx3REFBRixFQUE0RGdCLE1BQTVELEdBQXFFLENBQTFFLEVBQThFO0FBQzdFZixxQkFBbUIsd0RBQW5CLEVBQTZFLFFBQTdFLEVBQXVGLHVCQUF2RjtBQUNBO0FBQ0QsTUFBS0QsRUFBRSw2Q0FBRixFQUFpRGdCLE1BQWpELEdBQTBELENBQS9ELEVBQW1FO0FBQ2xFZixxQkFBbUIsNkNBQW5CLEVBQWtFLFNBQWxFLEVBQTZFLEVBQTdFO0FBQ0E7QUFDRCxNQUFLRCxFQUFFLCtDQUFGLEVBQW1EZ0IsTUFBbkQsR0FBNEQsQ0FBakUsRUFBcUU7QUFDcEVmLHFCQUFtQiwrQ0FBbkIsRUFBb0UsV0FBcEUsRUFBaUYsRUFBakY7QUFDQTtBQUNELEVBVkQ7QUFZQSxDQXJDRCxFQXFDR2dCLE1BckNIIiwiZmlsZSI6IndwLWFuYWx5dGljcy10cmFja2luZy1nZW5lcmF0b3ItYWRtaW4uanMiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oJCl7XG5cblx0ZnVuY3Rpb24gdG9nZ2xlRXZlbnRGaWVsZHMoIHBhcmVudCwgdHlwZSwgaGVhZGluZyApIHtcblx0XHR2YXIgJHRvZ2dsZSA9ICQoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScsICQocGFyZW50KSApO1xuXG5cdFx0JCggJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkLScgKyB0eXBlICkud3JhcEFsbCggJzx0ciBjbGFzcz1cIndwLWFuYWx5dGljcy1nZW5lcmF0b3ItZmllbGRzLScgKyB0eXBlICsgJy13cmFwXCI+PHRkIGNvbHNwYW49XCIyXCI+PHRhYmxlIC8+Jyk7XG5cdFx0JCggJy53cC1hbmFseXRpY3MtZ2VuZXJhdG9yLWZpZWxkcy0nICsgdHlwZSArICctd3JhcCcgKS5oaWRlKCk7XG5cdFx0aWYgKCAnJyAhPT0gaGVhZGluZyApIHtcblx0XHRcdCQoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZHMtJyArIHR5cGUgKyAnLXdyYXAgdGFibGUnICkuYmVmb3JlKCAnPGgzPicgKyBoZWFkaW5nICsgJzwvaDM+JyApO1xuXHRcdH1cblxuXHRcdGlmICgkdG9nZ2xlLmlzKCc6Y2hlY2tlZCcpKSB7XG5cdFx0XHQkKCAnLndwLWFuYWx5dGljcy1nZW5lcmF0b3ItZmllbGRzLScgKyB0eXBlICsgJy13cmFwJyApLnNob3coKTtcblx0XHR9XG5cdFx0JHRvZ2dsZS5vbignY2xpY2snLCBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgY2hlY2tib3ggPSAkKHRoaXMpO1xuXG5cdFx0XHQkKCAnLndwLWFuYWx5dGljcy1nZW5lcmF0b3ItZmllbGRzLScgKyB0eXBlICsgJy13cmFwJyApLmhpZGUoKTtcblxuXHRcdFx0aWYgKGNoZWNrYm94LmlzKCc6Y2hlY2tlZCcpKSB7XG5cdFx0XHRcdCQoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZHMtJyArIHR5cGUgKyAnLXdyYXAnICkuc2hvdygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0JChkb2N1bWVudCkucmVhZHkoZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCAkKCcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC10cmFjay1wYWdlLXNjcm9sbC10b2dnbGUnKS5sZW5ndGggPiAwICkge1xuXHRcdFx0dG9nZ2xlRXZlbnRGaWVsZHMoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC10cmFjay1wYWdlLXNjcm9sbC10b2dnbGUnLCAnc2Nyb2xsJywgJ1Njcm9sbCBkZXB0aCBzZXR0aW5ncycgKTtcblx0XHR9XG5cdFx0aWYgKCAkKCcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC10cmFjay1zcGVjaWFsJykubGVuZ3RoID4gMCApIHtcblx0XHRcdHRvZ2dsZUV2ZW50RmllbGRzKCAnLndwLWFuYWx5dGljcy1nZW5lcmF0b3ItZmllbGQtdHJhY2stc3BlY2lhbCcsICdzcGVjaWFsJywgJycgKTtcblx0XHR9XG5cdFx0aWYgKCAkKCcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC10cmFjay1hZmZpbGlhdGUnKS5sZW5ndGggPiAwICkge1xuXHRcdFx0dG9nZ2xlRXZlbnRGaWVsZHMoICcud3AtYW5hbHl0aWNzLWdlbmVyYXRvci1maWVsZC10cmFjay1hZmZpbGlhdGUnLCAnYWZmaWxpYXRlJywgJycgKTtcblx0XHR9XG5cdH0pO1xuXG59KShqUXVlcnkpO1xuIl19
