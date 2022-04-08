"use strict";

(function ($) {
  function wp_analytics_check_analytics_version() {
    var version = '';

    if ('undefined' !== typeof analytics_tracking_settings && 'undefined' !== typeof analytics_tracking_settings.analytics_type) {
      if ('gtagjs' === analytics_tracking_settings.analytics_type && 'function' === typeof gtag) {
        version = 'gtag';
      } else if ('analyticsjs' === analytics_tracking_settings.analytics_type && 'function' === typeof ga) {
        version = 'ga';
      }
    }

    return version;
  }
  /*
   * Create a Google Analytics event
   * category: Event Category
   * label: Event Label
   * action: Event Action
   * value: optional
  */


  function wp_analytics_tracking_event(type, category, action, label, value, non_interaction) {
    var version = wp_analytics_check_analytics_version();

    if (version === 'gtag') {
      // Sends the event to the Google Analytics property with
      // tracking ID GA_MEASUREMENT_ID set by the config command in
      // the global tracking snippet.
      // example: gtag('event', 'play', { 'event_category': 'Videos', 'event_label': 'Fall Campaign' });
      var params = {
        'event_category': category,
        'event_label': label
      };

      if (typeof value !== 'undefined') {
        params.value = value;
      }

      if (typeof non_interaction !== 'undefined') {
        params.non_interaction = non_interaction;
      }

      gtag(type, action, params);
    } else if (version === 'ga') {
      // Uses the default tracker to send the event to the
      // Google Analytics property with tracking ID GA_MEASUREMENT_ID.
      // example: ga('send', 'event', 'Videos', 'play', 'Fall Campaign');
      // noninteraction seems to have been working like this in analytics.js.
      if (non_interaction == 1) {
        value = {
          'nonInteraction': 1
        };
      }

      if (typeof value === 'undefined') {
        ga('send', type, category, action, label);
      } else {
        ga('send', type, category, action, label, value);
      }
    }
  }

  function wp_analytics_tracking_setup() {
    var version = wp_analytics_check_analytics_version();

    if (version === '') {
      return;
    } // settings for ScrollDepth plugin


    if ('undefined' !== typeof analytics_scrolldepth_settings.scroll && true === analytics_scrolldepth_settings.scroll.enabled) {
      var scrollDepthSettings = []; // this needs to be true, regardless, because otherwise the assumption is that the tracking is defined in Google Tag Manager.
      // todo: it might be worth building a setting for this.

      scrollDepthSettings['gtmOverride'] = true; // if we're using ga, we need to tell the plugin

      if ('gtag' !== version) {
        scrollDepthSettings['gaGlobal'] = 'ga';
      } // value is a string


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.minimum_height && '0' !== analytics_scrolldepth_settings.scroll.minimum_height) {
        scrollDepthSettings['minimum_height'] = analytics_scrolldepth_settings.scroll.minimum_height;
      } // value is a boolean. default is true.


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.percentage && 'true' !== analytics_scrolldepth_settings.scroll.percentage) {
        scrollDepthSettings['percentage'] = false;
      } // value is a boolean. default is true.


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.user_timing && 'true' !== analytics_scrolldepth_settings.scroll.user_timing) {
        scrollDepthSettings['user_timing'] = false;
      } // value is a boolean. default is true.


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.pixel_depth && 'true' !== analytics_scrolldepth_settings.scroll.user_timing) {
        scrollDepthSettings['pixel_depth'] = false;
      } // value is a boolean. default is true.


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.non_interaction && 'true' !== analytics_scrolldepth_settings.scroll.non_interaction) {
        scrollDepthSettings['non_interaction'] = false;
      } // value is an array. default is empty.


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.scroll_elements) {
        scrollDepthSettings['elements'] = $.map(analytics_scrolldepth_settings.scroll.scroll_elements.split(','), $.trim);
      } // send scroll settings to the scrolldepth plugin


      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll.use_jquery && true === analytics_scrolldepth_settings.scroll.use_jquery) {
        jQuery.scrollDepth(scrollDepthSettings);
      } else {
        gascrolldepth.init(scrollDepthSettings);
      }
    }

    if ('undefined' !== typeof analytics_tracking_settings.special && true === analytics_tracking_settings.special.enabled) {
      // external links
      $('a[href^="http"]:not([href*="://' + document.domain + '"])').click(function () {
        wp_analytics_tracking_event('event', 'Outbound links', 'Click', this.href);
      }); // mailto links

      $('a[href^="mailto"]').click(function () {
        wp_analytics_tracking_event('event', 'Mails', 'Click', this.href.substring(7));
      }); // tel links

      $('a[href^="tel"]').click(function () {
        wp_analytics_tracking_event('event', 'Telephone', 'Call', this.href.substring(7));
      }); // internal links

      $('a:not([href^="(http:|https:)?//"],[href^="#"],[href^="mailto:"])').click(function () {
        // track downloads
        if ('' !== analytics_tracking_settings.special.download_regex) {
          var url = this.href;
          var checkDownload = new RegExp("\\.(" + analytics_tracking_settings.special.download_regex + ")([\?#].*)?$", "i");
          var isDownload = checkDownload.test(url);

          if (true === isDownload) {
            var checkDownloadExtension = new RegExp("\\.(" + analytics_tracking_settings.special.download_regex + ")([\?#].*)?$", "i");
            var extensionResult = checkDownloadExtension.exec(url);
            var extension = '';

            if (null !== extensionResult) {
              extension = extensionResult[1];
            } else {
              extension = extensionResult;
            } // we can't use the url for the value here, even though that would be nice, because value is supposed to be an integer


            wp_analytics_tracking_event('event', 'Downloads', extension, this.href);
          }
        }
      });
    }

    if ('undefined' !== typeof analytics_tracking_settings.affiliate && true === analytics_tracking_settings.affiliate.enabled) {
      // any link could be an affiliate, i guess?
      $('a').click(function () {
        // track affiliates
        if ('' !== analytics_tracking_settings.affiliate.affiliate_regex) {
          var checkAffiliate = new RegExp("\\.(" + analytics_tracking_settings.affiliate.affiliate_regex + ")([\?#].*)?$", "i");
          var isAffiliate = checkAffiliate.test(url);

          if (true === isAffiliate) {
            wp_analytics_tracking_event('event', 'Affiliate', 'Click', this.href);
          }
        }
      });
    } // link fragments as pageviews
    // does not use the event tracking method; flags a pageview instead.


    if ('undefined' !== typeof analytics_tracking_settings.fragment && true === analytics_tracking_settings.fragment.enabled) {
      window.onhashchange = function (event) {
        var fragment_url = location.pathname + location.search + location.hash;

        if ('gtag' === version) {
          gtag('set', 'page_path', fragment_url);
          gtag('event', 'page_view');
        } else if ('ga' === version) {
          ga('send', 'pageview', fragment_url);
        }
      };
    } // when a button is clicked, attach it to the form's data


    $('input[type="submit"], button[type="submit"]').on('click', function () {
      var form = $(this).parents('form:first');
      $(form).data('button', this);
    }); // basic form submits. track submit instead of click because otherwise it's weird.

    if ('undefined' !== typeof analytics_tracking_settings.form_submissions && true === analytics_tracking_settings.form_submissions.enabled) {
      $('form').submit(function (f) {
        var button = $(this).data('button') || $('input[type="submit"], button[type="submit"]').get(0);
        var category = $(button).data('ga-category') || 'Form';
        var action = $(button).data('ga-action') || 'Submit';
        var label = $(button).data('ga-label') || $(button).text() || button.value || button.name;
        wp_analytics_tracking_event('event', category, action, label);
      });
    }
  }

  $(document).ready(function () {
    wp_analytics_tracking_setup();
  });
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndwLWV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ3cF9hbmFseXRpY3NfY2hlY2tfYW5hbHl0aWNzX3ZlcnNpb24iLCJ2ZXJzaW9uIiwiYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzIiwiYW5hbHl0aWNzX3R5cGUiLCJndGFnIiwiZ2EiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwibm9uX2ludGVyYWN0aW9uIiwicGFyYW1zIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwIiwiYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsInNjcm9sbERlcHRoU2V0dGluZ3MiLCJtaW5pbXVtX2hlaWdodCIsInBlcmNlbnRhZ2UiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwic2Nyb2xsX2VsZW1lbnRzIiwibWFwIiwic3BsaXQiLCJ0cmltIiwidXNlX2pxdWVyeSIsImpRdWVyeSIsInNjcm9sbERlcHRoIiwiZ2FzY3JvbGxkZXB0aCIsImluaXQiLCJzcGVjaWFsIiwiZG9jdW1lbnQiLCJkb21haW4iLCJjbGljayIsImhyZWYiLCJzdWJzdHJpbmciLCJkb3dubG9hZF9yZWdleCIsInVybCIsImNoZWNrRG93bmxvYWQiLCJSZWdFeHAiLCJpc0Rvd25sb2FkIiwidGVzdCIsImNoZWNrRG93bmxvYWRFeHRlbnNpb24iLCJleHRlbnNpb25SZXN1bHQiLCJleGVjIiwiZXh0ZW5zaW9uIiwiYWZmaWxpYXRlIiwiYWZmaWxpYXRlX3JlZ2V4IiwiY2hlY2tBZmZpbGlhdGUiLCJpc0FmZmlsaWF0ZSIsImZyYWdtZW50Iiwid2luZG93Iiwib25oYXNoY2hhbmdlIiwiZXZlbnQiLCJmcmFnbWVudF91cmwiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsIm9uIiwiZm9ybSIsInBhcmVudHMiLCJkYXRhIiwiZm9ybV9zdWJtaXNzaW9ucyIsInN1Ym1pdCIsImYiLCJidXR0b24iLCJnZXQiLCJ0ZXh0IiwibmFtZSIsInJlYWR5Il0sIm1hcHBpbmdzIjoiOztBQUFBLENBQUUsVUFBVUEsQ0FBVixFQUFjO0FBRWYsV0FBU0Msb0NBQVQsR0FBZ0Q7QUFDL0MsUUFBSUMsT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsUUFBSyxnQkFBZ0IsT0FBT0MsMkJBQXZCLElBQXNELGdCQUFnQixPQUFPQSwyQkFBMkIsQ0FBQ0MsY0FBOUcsRUFBK0g7QUFDOUgsVUFBSyxhQUFhRCwyQkFBMkIsQ0FBQ0MsY0FBekMsSUFBMkQsZUFBZSxPQUFPQyxJQUF0RixFQUE2RjtBQUM1RkgsUUFBQUEsT0FBTyxHQUFHLE1BQVY7QUFDQSxPQUZELE1BRU8sSUFBSyxrQkFBa0JDLDJCQUEyQixDQUFDQyxjQUE5QyxJQUFnRSxlQUFlLE9BQU9FLEVBQTNGLEVBQWdHO0FBQ3RHSixRQUFBQSxPQUFPLEdBQUcsSUFBVjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBT0EsT0FBUDtBQUNBO0FBRUQ7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNDLFdBQVNLLDJCQUFULENBQXNDQyxJQUF0QyxFQUE0Q0MsUUFBNUMsRUFBc0RDLE1BQXRELEVBQThEQyxLQUE5RCxFQUFxRUMsS0FBckUsRUFBNEVDLGVBQTVFLEVBQThGO0FBQzdGLFFBQUlYLE9BQU8sR0FBR0Qsb0NBQW9DLEVBQWxEOztBQUNBLFFBQUtDLE9BQU8sS0FBSyxNQUFqQixFQUEwQjtBQUN6QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFVBQUlZLE1BQU0sR0FBRztBQUNaLDBCQUFrQkwsUUFETjtBQUVaLHVCQUFlRTtBQUZILE9BQWI7O0FBSUEsVUFBSyxPQUFPQyxLQUFQLEtBQWlCLFdBQXRCLEVBQW9DO0FBQ25DRSxRQUFBQSxNQUFNLENBQUNGLEtBQVAsR0FBZUEsS0FBZjtBQUNBOztBQUNELFVBQUssT0FBT0MsZUFBUCxLQUEyQixXQUFoQyxFQUE4QztBQUM3Q0MsUUFBQUEsTUFBTSxD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LE1BQUYsQ0FBRCxDQUFZSixJQUFaLENBQWtCLFdBQWxCLEtBQW1DLFFBQWhEO0FBQ0EsWUFBSXRELEtBQUssR0FBR1gsQ0FBQyxDQUFFcUUsTUFBRixDQUFELENBQVlKLElBQVosQ0FBa0IsVUFBbEIsS0FBa0NqRSxDQUFDLENBQUVxRSxNQUFGLENBQUQsQ0FBWUUsSUFBWixFQUFsQyxJQUF3REYsTUFBTSxDQUFDekQsS0FBL0QsSUFBd0V5RCxNQUFNLENBQUNHLElBQTNGO0FBQ0FqRSxRQUFBQSwyQkFBMkIsQ0FBRSxPQUFGLEVBQVdFLFFBQVgsRUFBcUJDLE1BQXJCLEVBQTZCQyxLQUE3QixDQUEzQjtBQUNBLE9BTkQ7QUFPQTtBQUNEOztBQUVEWCxFQUFBQSxDQUFDLENBQUVrQyxRQUFGLENBQUQsQ0FBY3VDLEtBQWQsQ0FBcUIsWUFBVztBQUMvQjFELElBQUFBLDJCQUEyQjtBQUMzQixHQUZEO0FBSUEsQ0E1TUQsRUE0TUtjLE1BNU1MIiwiZmlsZSI6IndwLWFuYWx5dGljcy10cmFja2luZy1nZW5lcmF0b3ItZnJvbnQtZW5kLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKCBmdW5jdGlvbiggJCApIHtcblxuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfY2hlY2tfYW5hbHl0aWNzX3ZlcnNpb24oKSB7XG5cdFx0dmFyIHZlcnNpb24gPSAnJztcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICYmICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICkge1xuXHRcdFx0aWYgKCAnZ3RhZ2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBndGFnICkge1xuXHRcdFx0XHR2ZXJzaW9uID0gJ2d0YWcnO1xuXHRcdFx0fSBlbHNlIGlmICggJ2FuYWx5dGljc2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdFx0dmVyc2lvbiA9ICdnYSc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2ZXJzaW9uO1xuXHR9XG5cblx0Lypcblx0ICogQ3JlYXRlIGEgR29vZ2xlIEFuYWx5dGljcyBldmVudFxuXHQgKiBjYXRlZ29yeTogRXZlbnQgQ2F0ZWdvcnlcblx0ICogbGFiZWw6IEV2ZW50IExhYmVsXG5cdCAqIGFjdGlvbjogRXZlbnQgQWN0aW9uXG5cdCAqIHZhbHVlOiBvcHRpb25hbFxuXHQqL1xuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSwgbm9uX2ludGVyYWN0aW9uICkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BfYW5hbHl0aWNzX2NoZWNrX2FuYWx5dGljc192ZXJzaW9uKCk7XG5cdFx0aWYgKCB2ZXJzaW9uID09PSAnZ3RhZycgKSB7XG5cdFx0XHQvLyBTZW5kcyB0aGUgZXZlbnQgdG8gdGhlIEdvb2dsZSBBbmFseXRpY3MgcHJvcGVydHkgd2l0aFxuXHRcdFx0Ly8gdHJhY2tpbmcgSUQgR0FfTUVBU1VSRU1FTlRfSUQgc2V0IGJ5IHRoZSBjb25maWcgY29tbWFuZCBpblxuXHRcdFx0Ly8gdGhlIGdsb2JhbCB0cmFja2luZyBzbmlwcGV0LlxuXHRcdFx0Ly8gZXhhbXBsZTogZ3RhZygnZXZlbnQnLCAncGxheScsIHsgJ2V2ZW50X2NhdGVnb3J5JzogJ1ZpZGVvcycsICdldmVudF9sYWJlbCc6ICdGYWxsIENhbXBhaWduJyB9KTtcblx0XHRcdHZhciBwYXJhbXMgPSB7XG5cdFx0XHRcdCdldmVudF9jYXRlZ29yeSc6IGNhdGVnb3J5LFxuXHRcdFx0XHQnZXZlbnRfbGFiZWwnOiBsYWJlbFxuXHRcdFx0fTtcblx0XHRcdGlmICggdHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0cGFyYW1zLnZhbHVlID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIHR5cGVvZiBub25faW50ZXJhY3Rpb24gIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRwYXJhbXMubm9uX2ludGVyYWN0aW9uID0gbm9uX2ludGVyYWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Z3RhZyggdHlwZSwgYWN0aW9uLCBwYXJhbXMgKTtcblx0XHR9IGVsc2UgaWYgKCB2ZXJzaW9uID09PSAnZ2EnICkge1xuXHRcdFx0Ly8gVXNlcyB0aGUgZGVmYXVsdCB0cmFja2VyIHRvIHNlbmQgdGhlIGV2ZW50IHRvIHRoZVxuXHRcdFx0Ly8gR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoIHRyYWNraW5nIElEIEdBX01FQVNVUkVNRU5UX0lELlxuXHRcdFx0Ly8gZXhhbXBsZTogZ2EoJ3NlbmQnLCAnZXZlbnQnLCAnVmlkZW9zJywgJ3BsYXknLCAnRmFsbCBDYW1wYWlnbicpO1xuXHRcdFx0Ly8gbm9uaW50ZXJhY3Rpb24gc2VlbXMgdG8gaGF2ZSBiZWVuIHdvcmtpbmcgbGlrZSB0aGlzIGluIGFuYWx5dGljcy5qcy5cblx0XHRcdGlmICggbm9uX2ludGVyYWN0aW9uID09IDEgKSB7XG5cdFx0XHRcdHZhbHVlID0geyAnbm9uSW50ZXJhY3Rpb24nOiAxIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUgKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKSB7XG5cdFx0dmFyIHZlcnNpb24gPSB3cF9hbmFseXRpY3NfY2hlY2tfYW5hbHl0aWNzX3ZlcnNpb24oKTtcblx0XHRpZiAoIHZlcnNpb24gPT09ICcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gc2V0dGluZ3MgZm9yIFNjcm9sbERlcHRoIHBsdWdpblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsICYmIHRydWUgPT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuZW5hYmxlZCApIHtcblx0XHRcdHZhciBzY3JvbGxEZXB0aFNldHRpbmdzID0gW107XG5cdFx0XHQvLyB0aGlzIG5lZWRzIHRvIGJlIHRydWUsIHJlZ2FyZGxlc3MsIGJlY2F1c2Ugb3RoZXJ3aXNlIHRoZSBhc3N1bXB0aW9uIGlzIHRoYXQgdGhlIHRyYWNraW5nIGlzIGRlZmluZWQgaW4gR29vZ2xlIFRhZyBNYW5hZ2VyLlxuXHRcdFx0Ly8gdG9kbzogaXQgbWlnaHQgYmUgd29ydGggYnVpbGRpbmcgYSBzZXR0aW5nIGZvciB0aGlzLlxuXHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ3RtT3ZlcnJpZGUnXSA9IHRydWU7XG5cblx0XHRcdC8vIGlmIHdlJ3JlIHVzaW5nIGdhLCB3ZSBuZWVkIHRvIHRlbGwgdGhlIHBsdWdpblxuXHRcdFx0aWYgKCAnZ3RhZycgIT09IHZlcnNpb24gKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2dhR2xvYmFsJ10gPSAnZ2EnO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhIHN0cmluZ1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgJiYgJzAnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydtaW5pbXVtX2hlaWdodCddID0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwZXJjZW50YWdlJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3VzZXJfdGltaW5nJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5waXhlbF9kZXB0aCAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3BpeGVsX2RlcHRoJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbm9uX2ludGVyYWN0aW9uJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYW4gYXJyYXkuIGRlZmF1bHQgaXMgZW1wdHkuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2VsZW1lbnRzJ10gPSAkLm1hcCggYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMuc3BsaXQoICcsJyApLCAkLnRyaW0gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2VuZCBzY3JvbGwgc2V0dGluZ3MgdG8gdGhlIHNjcm9sbGRlcHRoIHBsdWdpblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlX2pxdWVyeSAmJiB0cnVlID09PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZV9qcXVlcnkgKSB7XG5cdFx0XHRcdGpRdWVyeS5zY3JvbGxEZXB0aCggc2Nyb2xsRGVwdGhTZXR0aW5ncyApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2FzY3JvbGxkZXB0aC5pbml0KCBzY3JvbGxEZXB0aFNldHRpbmdzICk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmVuYWJsZWQgKSB7XG5cblx0XHRcdC8vIGV4dGVybmFsIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cImh0dHBcIl06bm90KFtocmVmKj1cIjovLycgKyBkb2N1bWVudC5kb21haW4gKyAnXCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ091dGJvdW5kIGxpbmtzJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gbWFpbHRvIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cIm1haWx0b1wiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ01haWxzJywgJ0NsaWNrJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gdGVsIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cInRlbFwiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ1RlbGVwaG9uZScsICdDYWxsJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gaW50ZXJuYWwgbGlua3Ncblx0XHRcdCQoICdhOm5vdChbaHJlZl49XCIoaHR0cDp8aHR0cHM6KT8vL1wiXSxbaHJlZl49XCIjXCJdLFtocmVmXj1cIm1haWx0bzpcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHQvLyB0cmFjayBkb3dubG9hZHNcblx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKSB7XG5cdFx0XHRcdFx0dmFyIHVybCA9IHRoaXMuaHJlZjtcblx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZCA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdHZhciBpc0Rvd25sb2FkID0gY2hlY2tEb3dubG9hZC50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzRG93bmxvYWQgKSB7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZEV4dGVuc2lvbiA9IG5ldyBSZWdFeHAoXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiKTtcblx0XHRcdFx0XHRcdHZhciBleHRlbnNpb25SZXN1bHQgPSBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uLmV4ZWMoIHVybCApO1xuXHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvbiA9ICcnO1xuXHRcdFx0XHRcdFx0aWYgKCBudWxsICE9PSBleHRlbnNpb25SZXN1bHQgKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdFsxXTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIHdlIGNhbid0IHVzZSB0aGUgdXJsIGZvciB0aGUgdmFsdWUgaGVyZSwgZXZlbiB0aG91Z2ggdGhhdCB3b3VsZCBiZSBuaWNlLCBiZWNhdXNlIHZhbHVlIGlzIHN1cHBvc2VkIHRvIGJlIGFuIGludGVnZXJcblx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0Rvd25sb2FkcycsIGV4dGVuc2lvbiwgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZSAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmVuYWJsZWQgKSB7XG5cdFx0XHQvLyBhbnkgbGluayBjb3VsZCBiZSBhbiBhZmZpbGlhdGUsIGkgZ3Vlc3M/XG5cdFx0XHQkKCAnYScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0Ly8gdHJhY2sgYWZmaWxpYXRlc1xuXHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCApIHtcblx0XHRcdFx0XHR2YXIgY2hlY2tBZmZpbGlhdGUgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHR2YXIgaXNBZmZpbGlhdGUgPSBjaGVja0FmZmlsaWF0ZS50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzQWZmaWxpYXRlICkge1xuXHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWZmaWxpYXRlJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGxpbmsgZnJhZ21lbnRzIGFzIHBhZ2V2aWV3c1xuXHRcdC8vIGRvZXMgbm90IHVzZSB0aGUgZXZlbnQgdHJhY2tpbmcgbWV0aG9kOyBmbGFncyBhIHBhZ2V2aWV3IGluc3RlYWQuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQuZW5hYmxlZCApIHtcblx0XHRcdHdpbmRvdy5vbmhhc2hjaGFuZ2UgPSBmdW5jdGlvbihldmVudCkge1xuXHRcdFx0XHR2YXIgZnJhZ21lbnRfdXJsID0gbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBsb2NhdGlvbi5oYXNoO1xuXHRcdFx0XHRpZiAoICdndGFnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdFx0XHRndGFnKCdzZXQnLCAncGFnZV9wYXRoJywgZnJhZ21lbnRfdXJsKTtcblx0XHRcdFx0XHRndGFnKCdldmVudCcsICdwYWdlX3ZpZXcnKTtcblx0XHRcdFx0fSBlbHNlIGlmICggJ2dhJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdFx0XHRnYSggJ3NlbmQnLCAncGFnZXZpZXcnLCBmcmFnbWVudF91cmwgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHdoZW4gYSBidXR0b24gaXMgY2xpY2tlZCwgYXR0YWNoIGl0IHRvIHRoZSBmb3JtJ3MgZGF0YVxuXHRcdCQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5vbiggJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgZm9ybSA9ICQoIHRoaXMgKS5wYXJlbnRzKCAnZm9ybTpmaXJzdCcgKTtcblx0XHRcdCQoIGZvcm0gKS5kYXRhKCAnYnV0dG9uJywgdGhpcyApO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYmFzaWMgZm9ybSBzdWJtaXRzLiB0cmFjayBzdWJtaXQgaW5zdGVhZCBvZiBjbGljayBiZWNhdXNlIG90aGVyd2lzZSBpdCdzIHdlaXJkLlxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucyAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucy5lbmFibGVkICkge1xuXHRcdFx0JCggJ2Zvcm0nICkuc3VibWl0KCBmdW5jdGlvbiggZiApIHtcblx0XHRcdFx0dmFyIGJ1dHRvbiA9ICQoIHRoaXMgKS5kYXRhKCAnYnV0dG9uJyApIHx8ICQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5nZXQoIDAgKTtcblx0XHRcdFx0dmFyIGNhdGVnb3J5ID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWNhdGVnb3J5JyApIHx8ICdGb3JtJztcblx0XHRcdFx0dmFyIGFjdGlvbiA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1hY3Rpb24nICkgfHwgJ1N1Ym1pdCc7XG5cdFx0XHRcdHZhciBsYWJlbCA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1sYWJlbCcgKSB8fCAkKCBidXR0b24gKS50ZXh0KCkgfHwgYnV0dG9uLnZhbHVlIHx8IGJ1dHRvbi5uYW1lO1xuXHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQkKCBkb2N1bWVudCApLnJlYWR5KCBmdW5jdGlvbigpIHtcblx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKTtcblx0fSk7XG5cbn0gKSggalF1ZXJ5ICk7XG4iXX0=
