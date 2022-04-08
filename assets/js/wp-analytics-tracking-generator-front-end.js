"use strict";

(function ($) {
  /*
   * Create a Google Analytics event
   * category: Event Category
   * label: Event Label
   * action: Event Action
   * value: optional
  */
  function wp_analytics_tracking_event(type, category, action, label, value, non_interaction) {
    if (typeof gtag !== 'undefined') {
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
    } else if (typeof ga !== 'undefined') {
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
    } else {
      return;
    }
  }

  function wp_analytics_tracking_setup() {
    if ('undefined' === typeof gtag && 'undefined' === typeof ga) {
      return;
    }

    var scrollDepthSettings = [];

    if ('undefined' !== typeof analytics_tracking_settings) {
      if ('undefined' !== typeof analytics_scrolldepth_settings.scroll && true === analytics_scrolldepth_settings.scroll.enabled) {
        // this needs to be true, regardless, because otherwise the assumption is that the tracking is defined in Google Tag Manager.
        // todo: it might be worth building a setting for this.
        scrollDepthSettings['gtmOverride'] = true; // value is a string and a boolean

        if ('undefined' !== typeof analytics_tracking_settings.analytics_type && 'gtagjs' !== analytics_tracking_settings.analytics_type) {
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
      // does not use the event tracking method


      if ('undefined' !== typeof analytics_tracking_settings.fragment && true === analytics_tracking_settings.fragment.enabled) {
        if (typeof ga !== 'undefined') {
          window.onhashchange = function () {
            ga('send', 'pageview', location.pathname + location.search + location.hash);
          };
        }
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
  }

  $(document).ready(function () {
    wp_analytics_tracking_setup();
  });
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndwLWV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwibm9uX2ludGVyYWN0aW9uIiwiZ3RhZyIsInBhcmFtcyIsImdhIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwIiwic2Nyb2xsRGVwdGhTZXR0aW5ncyIsImFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyIsImFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncyIsInNjcm9sbCIsImVuYWJsZWQiLCJhbmFseXRpY3NfdHlwZSIsIm1pbmltdW1faGVpZ2h0IiwicGVyY2VudGFnZSIsInVzZXJfdGltaW5nIiwicGl4ZWxfZGVwdGgiLCJzY3JvbGxfZWxlbWVudHMiLCJtYXAiLCJzcGxpdCIsInRyaW0iLCJ1c2VfanF1ZXJ5IiwialF1ZXJ5Iiwic2Nyb2xsRGVwdGgiLCJnYXNjcm9sbGRlcHRoIiwiaW5pdCIsInNwZWNpYWwiLCJkb2N1bWVudCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwidXJsIiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJ0ZXN0IiwiY2hlY2tEb3dubG9hZEV4dGVuc2lvbiIsImV4dGVuc2lvblJlc3VsdCIsImV4ZWMiLCJleHRlbnNpb24iLCJhZmZpbGlhdGUiLCJhZmZpbGlhdGVfcmVnZXgiLCJjaGVja0FmZmlsaWF0ZSIsImlzQWZmaWxpYXRlIiwiZnJhZ21lbnQiLCJ3aW5kb3ciLCJvbmhhc2hjaGFuZ2UiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsIm9uIiwiZm9ybSIsInBhcmVudHMiLCJkYXRhIiwiZm9ybV9zdWJtaXNzaW9ucyIsInN1Ym1pdCIsImYiLCJidXR0b24iLCJnZXQiLCJ0ZXh0IiwibmFtZSIsInJlYWR5Il0s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SUFBdUUsU0FBU2pELDJCQUEyQixDQUFDaUQsZ0JBQTVCLENBQTZDOUMsT0FBbEksRUFBNEk7QUFDM0loQixRQUFBQSxDQUFDLENBQUUsTUFBRixDQUFELENBQVkrRCxNQUFaLENBQW9CLFVBQVVDLENBQVYsRUFBYztBQUNqQyxjQUFJQyxNQUFNLEdBQUdqRSxDQUFDLENBQUUsSUFBRixDQUFELENBQVU2RCxJQUFWLENBQWdCLFFBQWhCLEtBQThCN0QsQ0FBQyxDQUFFLDZDQUFGLENBQUQsQ0FBbURrRSxHQUFuRCxDQUF3RCxDQUF4RCxDQUEzQztBQUNTLGNBQUkvRCxRQUFRLEdBQUdILENBQUMsQ0FBRWlFLE1BQUYsQ0FBRCxDQUFZSixJQUFaLENBQWtCLGFBQWxCLEtBQXFDLE1BQXBEO0FBQ0EsY0FBSXpELE1BQU0sR0FBR0osQ0FBQyxDQUFFaUUsTUFBRixDQUFELENBQVlKLElBQVosQ0FBa0IsV0FBbEIsS0FBbUMsUUFBaEQ7QUFDQSxjQUFJeEQsS0FBSyxHQUFHTCxDQUFDLENBQUVpRSxNQUFGLENBQUQsQ0FBWUosSUFBWixDQUFrQixVQUFsQixLQUFrQzdELENBQUMsQ0FBRWlFLE1BQUYsQ0FBRCxDQUFZRSxJQUFaLEVBQWxDLElBQXdERixNQUFNLENBQUMzRCxLQUEvRCxJQUF3RTJELE1BQU0sQ0FBQ0csSUFBM0Y7QUFDQW5FLFVBQUFBLDJCQUEyQixDQUFFLE9BQUYsRUFBV0UsUUFBWCxFQUFxQkMsTUFBckIsRUFBNkJDLEtBQTdCLENBQTNCO0FBQ0gsU0FOUDtBQU9BO0FBRUQ7QUFDRDs7QUFFREwsRUFBQUEsQ0FBQyxDQUFFZ0MsUUFBRixDQUFELENBQWNxQyxLQUFkLENBQXFCLFlBQVc7QUFDL0IxRCxJQUFBQSwyQkFBMkI7QUFDM0IsR0FGRDtBQUlBLENBOUxELEVBOExLZ0IsTUE5TEwiLCJmaWxlIjoid3AtYW5hbHl0aWNzLXRyYWNraW5nLWdlbmVyYXRvci1mcm9udC1lbmQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIoIGZ1bmN0aW9uKCAkICkge1xuXG5cdC8qXG5cdCAqIENyZWF0ZSBhIEdvb2dsZSBBbmFseXRpY3MgZXZlbnRcblx0ICogY2F0ZWdvcnk6IEV2ZW50IENhdGVnb3J5XG5cdCAqIGxhYmVsOiBFdmVudCBMYWJlbFxuXHQgKiBhY3Rpb246IEV2ZW50IEFjdGlvblxuXHQgKiB2YWx1ZTogb3B0aW9uYWxcblx0Ki9cblx0ZnVuY3Rpb24gd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUsIG5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHRpZiAoIHR5cGVvZiBndGFnICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdC8vIFNlbmRzIHRoZSBldmVudCB0byB0aGUgR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoXG5cdFx0XHQvLyB0cmFja2luZyBJRCBHQV9NRUFTVVJFTUVOVF9JRCBzZXQgYnkgdGhlIGNvbmZpZyBjb21tYW5kIGluXG5cdFx0XHQvLyB0aGUgZ2xvYmFsIHRyYWNraW5nIHNuaXBwZXQuXG5cdFx0XHQvLyBleGFtcGxlOiBndGFnKCdldmVudCcsICdwbGF5JywgeyAnZXZlbnRfY2F0ZWdvcnknOiAnVmlkZW9zJywgJ2V2ZW50X2xhYmVsJzogJ0ZhbGwgQ2FtcGFpZ24nIH0pO1xuXHRcdFx0dmFyIHBhcmFtcyA9IHtcblx0XHRcdFx0J2V2ZW50X2NhdGVnb3J5JzogY2F0ZWdvcnksXG5cdFx0XHRcdCdldmVudF9sYWJlbCc6IGxhYmVsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKCB0eXBlb2YgdmFsdWUgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRwYXJhbXMudmFsdWUgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICggdHlwZW9mIG5vbl9pbnRlcmFjdGlvbiAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdHBhcmFtcy5ub25faW50ZXJhY3Rpb24gPSBub25faW50ZXJhY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRndGFnKCB0eXBlLCBhY3Rpb24sIHBhcmFtcyApO1xuXHRcdH0gZWxzZSBpZiAoIHR5cGVvZiBnYSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHQvLyBVc2VzIHRoZSBkZWZhdWx0IHRyYWNrZXIgdG8gc2VuZCB0aGUgZXZlbnQgdG8gdGhlXG5cdFx0XHQvLyBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGggdHJhY2tpbmcgSUQgR0FfTUVBU1VSRU1FTlRfSUQuXG5cdFx0XHQvLyBleGFtcGxlOiBnYSgnc2VuZCcsICdldmVudCcsICdWaWRlb3MnLCAncGxheScsICdGYWxsIENhbXBhaWduJyk7XG5cdFx0XHQvLyBub25pbnRlcmFjdGlvbiBzZWVtcyB0byBoYXZlIGJlZW4gd29ya2luZyBsaWtlIHRoaXMgaW4gYW5hbHl0aWNzLmpzLlxuXHRcdFx0aWYgKCBub25faW50ZXJhY3Rpb24gPT0gMSApIHtcblx0XHRcdFx0dmFsdWUgPSB7ICdub25JbnRlcmFjdGlvbic6IDEgfTtcblx0XHRcdH1cblx0XHRcdGlmICggdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gd3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwKCkge1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiBndGFnICYmICd1bmRlZmluZWQnID09PSB0eXBlb2YgZ2EgKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZhciBzY3JvbGxEZXB0aFNldHRpbmdzID0gW107XG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyApIHtcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsICYmIHRydWUgPT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuZW5hYmxlZCApIHtcblx0XHRcdFx0Ly8gdGhpcyBuZWVkcyB0byBiZSB0cnVlLCByZWdhcmRsZXNzLCBiZWNhdXNlIG90aGVyd2lzZSB0aGUgYXNzdW1wdGlvbiBpcyB0aGF0IHRoZSB0cmFja2luZyBpcyBkZWZpbmVkIGluIEdvb2dsZSBUYWcgTWFuYWdlci5cblx0XHRcdFx0Ly8gdG9kbzogaXQgbWlnaHQgYmUgd29ydGggYnVpbGRpbmcgYSBzZXR0aW5nIGZvciB0aGlzLlxuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydndG1PdmVycmlkZSddID0gdHJ1ZTtcblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmcgYW5kIGEgYm9vbGVhblxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdndGFnanMnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ2FHbG9iYWwnXSA9ICdnYSc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIHN0cmluZ1xuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCAmJiAnMCcgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbWluaW11bV9oZWlnaHQnXSA9IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwZXJjZW50YWdlJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sndXNlcl90aW1pbmcnXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnBpeGVsX2RlcHRoICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwaXhlbF9kZXB0aCddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbm9uX2ludGVyYWN0aW9uJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGFuIGFycmF5LiBkZWZhdWx0IGlzIGVtcHR5LlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZWxlbWVudHMnXSA9ICQubWFwKCBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cy5zcGxpdCggJywnICksICQudHJpbSApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gc2VuZCBzY3JvbGwgc2V0dGluZ3MgdG8gdGhlIHNjcm9sbGRlcHRoIHBsdWdpblxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VfanF1ZXJ5ICYmIHRydWUgPT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlX2pxdWVyeSApIHtcblx0XHRcdFx0XHRqUXVlcnkuc2Nyb2xsRGVwdGgoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRnYXNjcm9sbGRlcHRoLmluaXQoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdFx0fVx0XG5cdFx0XHR9XG5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5lbmFibGVkICkge1xuXG5cdFx0XHRcdC8vIGV4dGVybmFsIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwiaHR0cFwiXTpub3QoW2hyZWYqPVwiOi8vJyArIGRvY3VtZW50LmRvbWFpbiArICdcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ091dGJvdW5kIGxpbmtzJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIG1haWx0byBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cIm1haWx0b1wiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdNYWlscycsICdDbGljaycsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyB0ZWwgbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJ0ZWxcIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnVGVsZXBob25lJywgJ0NhbGwnLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gaW50ZXJuYWwgbGlua3Ncblx0XHRcdFx0JCggJ2E6bm90KFtocmVmXj1cIihodHRwOnxodHRwczopPy8vXCJdLFtocmVmXj1cIiNcIl0sW2hyZWZePVwibWFpbHRvOlwiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdFx0Ly8gdHJhY2sgZG93bmxvYWRzXG5cdFx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKSB7XG5cdFx0XHRcdFx0XHR2YXIgdXJsID0gdGhpcy5ocmVmO1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWQgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHRcdHZhciBpc0Rvd25sb2FkID0gY2hlY2tEb3dubG9hZC50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNEb3dubG9hZCApIHtcblx0XHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWRFeHRlbnNpb24gPSBuZXcgUmVnRXhwKFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIik7XG5cdFx0XHRcdFx0XHRcdHZhciBleHRlbnNpb25SZXN1bHQgPSBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uLmV4ZWMoIHVybCApO1xuXHRcdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uID0gJyc7XG5cdFx0XHRcdFx0XHRcdGlmICggbnVsbCAhPT0gZXh0ZW5zaW9uUmVzdWx0ICkge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdFsxXTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHQ7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Ly8gd2UgY2FuJ3QgdXNlIHRoZSB1cmwgZm9yIHRoZSB2YWx1ZSBoZXJlLCBldmVuIHRob3VnaCB0aGF0IHdvdWxkIGJlIG5pY2UsIGJlY2F1c2UgdmFsdWUgaXMgc3VwcG9zZWQgdG8gYmUgYW4gaW50ZWdlclxuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdEb3dubG9hZHMnLCBleHRlbnNpb24sIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9KTtcblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZSAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmVuYWJsZWQgKSB7XG5cdFx0XHRcdC8vIGFueSBsaW5rIGNvdWxkIGJlIGFuIGFmZmlsaWF0ZSwgaSBndWVzcz9cblx0XHRcdFx0JCggJ2EnICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdFx0Ly8gdHJhY2sgYWZmaWxpYXRlc1xuXHRcdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICkge1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrQWZmaWxpYXRlID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0XHR2YXIgaXNBZmZpbGlhdGUgPSBjaGVja0FmZmlsaWF0ZS50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNBZmZpbGlhdGUgKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FmZmlsaWF0ZScsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbGluayBmcmFnbWVudHMgYXMgcGFnZXZpZXdzXG5cdFx0XHQvLyBkb2VzIG5vdCB1c2UgdGhlIGV2ZW50IHRyYWNraW5nIG1ldGhvZFxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQuZW5hYmxlZCApIHtcblx0XHRcdFx0aWYgKCB0eXBlb2YgZ2EgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRcdHdpbmRvdy5vbmhhc2hjaGFuZ2UgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGdhKCAnc2VuZCcsICdwYWdldmlldycsIGxvY2F0aW9uLnBhdGhuYW1lICsgbG9jYXRpb24uc2VhcmNoICsgbG9jYXRpb24uaGFzaCApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyB3aGVuIGEgYnV0dG9uIGlzIGNsaWNrZWQsIGF0dGFjaCBpdCB0byB0aGUgZm9ybSdzIGRhdGFcblx0XHRcdCQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5vbiggJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHZhciBmb3JtID0gJCggdGhpcyApLnBhcmVudHMoICdmb3JtOmZpcnN0JyApO1xuXHRcdFx0XHQkKCBmb3JtICkuZGF0YSggJ2J1dHRvbicsIHRoaXMgKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBiYXNpYyBmb3JtIHN1Ym1pdHMuIHRyYWNrIHN1Ym1pdCBpbnN0ZWFkIG9mIGNsaWNrIGJlY2F1c2Ugb3RoZXJ3aXNlIGl0J3Mgd2VpcmQuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMuZW5hYmxlZCApIHtcblx0XHRcdFx0JCggJ2Zvcm0nICkuc3VibWl0KCBmdW5jdGlvbiggZiApIHtcblx0XHRcdFx0XHR2YXIgYnV0dG9uID0gJCggdGhpcyApLmRhdGEoICdidXR0b24nICkgfHwgJCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLmdldCggMCApO1xuXHRcdCAgICAgICAgICAgIHZhciBjYXRlZ29yeSA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1jYXRlZ29yeScgKSB8fCAnRm9ybSc7XG5cdFx0ICAgICAgICAgICAgdmFyIGFjdGlvbiA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1hY3Rpb24nICkgfHwgJ1N1Ym1pdCc7XG5cdFx0ICAgICAgICAgICAgdmFyIGxhYmVsID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWxhYmVsJyApIHx8ICQoIGJ1dHRvbiApLnRleHQoKSB8fCBidXR0b24udmFsdWUgfHwgYnV0dG9uLm5hbWU7XG5cdFx0ICAgICAgICAgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdCAgICAgICAgfSk7XG5cdFx0XHR9XG5cblx0XHR9XG5cdH1cblxuXHQkKCBkb2N1bWVudCApLnJlYWR5KCBmdW5jdGlvbigpIHtcblx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKTtcblx0fSk7XG5cbn0gKSggalF1ZXJ5ICk7XG4iXX0=
