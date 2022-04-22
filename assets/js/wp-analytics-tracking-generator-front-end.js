"use strict";

(function ($) {
  function wpAnalyticsCheckAnalyticsVersion() {
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
   * call hooks from other plugins or themes
   *
  */


  if (typeof wp !== 'undefined') {
    wp.hooks.addAction('wpAnalyticsTrackingGeneratorEvent', 'wpAnalyticsTrackingGenerator', wpAnalyticsTrackingEvent, 10);
    wp.hooks.addAction('wpAnalyticsTrackingGeneratorEcommerceAction', 'wpAnalyticsTrackingGenerator', wpAnalyticsTrackingEcommerceAction, 10);
  }
  /*
   * Create a Google Analytics event
   * category: Event Category
   * label: Event Label
   * action: Event Action
   * value: optional
  */


  function wpAnalyticsTrackingEvent(type, category, action, label, value, non_interaction) {
    var version = wpAnalyticsCheckAnalyticsVersion();

    if ('gtag' === version) {
      // Sends the event to the Google Analytics property with
      // tracking ID GA_MEASUREMENT_ID set by the config command in
      // the global tracking snippet.
      // example: gtag('event', 'play', { 'event_category': 'Videos', 'event_label': 'Fall Campaign' });
      var params = {
        'event_category': category,
        'event_label': label
      };

      if ('undefined' !== typeof value) {
        params.value = value;
      }

      if ('undefined' !== typeof non_interaction) {
        params.non_interaction = non_interaction;
      }

      gtag(type, action, params);
    } else if ('ga' === version) {
      // Uses the default tracker to send the event to the
      // Google Analytics property with tracking ID GA_MEASUREMENT_ID.
      // example: ga('send', 'event', 'Videos', 'play', 'Fall Campaign');
      // noninteraction seems to have been working like this in analytics.js.
      if (non_interaction == 1) {
        value = {
          'nonInteraction': 1
        };
      }

      if ('undefined' === typeof value) {
        ga('send', type, category, action, label);
      } else {
        ga('send', type, category, action, label, value);
      }
    }
  }
  /*
   * Create a Google Analytics Ecommerce action
   * 
  */


  function wpAnalyticsTrackingEcommerceAction(type, action, product, step) {
    var version = wpAnalyticsCheckAnalyticsVersion();

    if ('gtag' === version) {
      gtag(type, action, {
        "items": [product]
      });
    } else if ('ga' === version) {
      ga('require', 'ec');
      ga('ec:addProduct', product);

      switch (action) {
        case 'select_content':
          ga('ec:setAction', 'detail');
          break;

        case 'add_to_cart':
          ga('ec:setAction', 'add');
          break;

        case 'begin_checkout':
          ga('ec:setAction', 'checkout', {
            'step': step
          });
          break;

        default:
      }
    }
  }

  function wpAnalyticsTrackingSetup() {
    var version = wpAnalyticsCheckAnalyticsVersion();

    if ('' === version) {
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
        wpAnalyticsTrackingEvent('event', 'Outbound links', 'Click', this.href);
      }); // mailto links

      $('a[href^="mailto"]').click(function () {
        wpAnalyticsTrackingEvent('event', 'Mails', 'Click', this.href.substring(7));
      }); // tel links

      $('a[href^="tel"]').click(function () {
        wpAnalyticsTrackingEvent('event', 'Telephone', 'Call', this.href.substring(7));
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


            wpAnalyticsTrackingEvent('event', 'Downloads', extension, this.href);
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
            wpAnalyticsTrackingEvent('event', 'Affiliate', 'Click', this.href);
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
        wpAnalyticsTrackingEvent('event', category, action, label);
      });
    }
  }

  $(document).ready(function () {
    wpAnalyticsTrackingSetup();
  });
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndwLWV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbiIsInZlcnNpb24iLCJhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MiLCJhbmFseXRpY3NfdHlwZSIsImd0YWciLCJnYSIsIndwIiwiaG9va3MiLCJhZGRBY3Rpb24iLCJ3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQiLCJ3cEFuYWx5dGljc1RyYWNraW5nRWNvbW1lcmNlQWN0aW9uIiwidHlwZSIsImNhdGVnb3J5IiwiYWN0aW9uIiwibGFiZWwiLCJ2YWx1ZSIsIm5vbl9pbnRlcmFjdGlvbiIsInBhcmFtcyIsInByb2R1Y3QiLCJzdGVwIiwid3BBbmFseXRpY3NUcmFja2luZ1NldHVwIiwiYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsInNjcm9sbERlcHRoU2V0dGluZ3MiLCJtaW5pbXVtX2hlaWdodCIsInBlcmNlbnRhZ2UiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwic2Nyb2xsX2VsZW1lbnRzIiwibWFwIiwic3BsaXQiLCJ0cmltIiwidXNlX2pxdWVyeSIsImpRdWVyeSIsInNjcm9sbERlcHRoIiwiZ2FzY3JvbGxkZXB0aCIsImluaXQiLCJzcGVjaWFsIiwiZG9jdW1lbnQiLCJkb21haW4iLCJjbGljayIsImhyZWYiLCJzdWJzdHJpbmciLCJkb3dubG9hZF9yZWdleCIsInVybCIsImNoZWNrRG93bmxvYWQiLCJSZWdFeHAiLCJpc0Rvd25sb2FkIiwidGVzdCIsImNoZWNrRG93bmxvYWRFeHRlbnNpb24iLCJleHRlbnNpb25SZXN1bHQiLCJleGVjIiwiZXh0ZW5zaW9uIiwiYWZmaWxpYXRlIiwiYWZmaWxpYXRlX3JlZ2V4IiwiY2hlY2tBZmZpbGlhdGUiLCJpc0FmZmlsaWF0ZSIsImZyYWdtZW50Iiwid2luZG93Iiwib25oYXNoY2hhbmdlIiwiZXZlbnQiLCJmcmFnbWVudF91cmwiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsIm9uIiwiZm9ybSIsInBhcmVudHMiLCJkYXRhIiwiZm9ybV9zdWJtaXNzaW9ucyIsInN1Ym1pdCIsImYiLCJidXR0b24iLCJnZXQiLCJ0ZXh0IiwibmFtZSIsInJlYWR5Il0sIm1hcHBpbmdzIjoiOztBQUFBLENBQUUsVUFBVUEsQ0FBVixFQUFjO0FBRWYsV0FBU0MsZ0NBQVQsR0FBNEM7QUFDM0MsUUFBSUMsT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsUUFBSyxnQkFBZ0IsT0FBT0MsMkJBQXZCLElBQXNELGdCQUFnQixPQUFPQSwyQkFBMkIsQ0FBQ0MsY0FBOUcsRUFBK0g7QUFDOUgsVUFBSyxhQUFhRCwyQkFBMkIsQ0FBQ0MsY0FBekMsSUFBMkQsZUFBZSxPQUFPQyxJQUF0RixFQUE2RjtBQUM1RkgsUUFBQUEsT0FBTyxHQUFHLE1BQVY7QUFDQSxPQUZELE1BRU8sSUFBSyxrQkFBa0JDLDJCQUEyQixDQUFDQyxjQUE5QyxJQUFnRSxlQUFlLE9BQU9FLEVBQTNGLEVBQWdHO0FBQ3RHSixRQUFBQSxPQUFPLEdBQUcsSUFBVjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBT0EsT0FBUDtBQUNBO0FBRUQ7QUFDRDtBQUNBO0FBQ0E7OztBQUNDLE1BQUssT0FBT0ssRUFBUCxLQUFjLFdBQW5CLEVBQWlDO0FBQ2hDQSxJQUFBQSxFQUFFLENBQUNDLEtBQUgsQ0FBU0MsU0FBVCxDQUFvQixtQ0FBcEIsRUFBeUQsOEJBQXpELEVBQXlGQyx3QkFBekYsRUFBbUgsRUFBbkg7QUFDQUgsSUFBQUEsRUFBRSxDQUFDQyxLQUFILENBQVNDLFNBQVQsQ0FBb0IsNkNBQXBCLEVBQW1FLDhCQUFuRSxFQUFtR0Usa0NBQW5HLEVBQXVJLEVBQXZJO0FBQ0E7QUFFRDtBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0MsV0FBU0Qsd0JBQVQsQ0FBbUNFLElBQW5DLEVBQXlDQyxRQUF6QyxFQUFtREMsTUFBbkQsRUFBMkRDLEtBQTNELEVBQWtFQyxLQUFs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QSxZQUFJekQsTUFBTSxHQUFHZCxDQUFDLENBQUUyRSxNQUFGLENBQUQsQ0FBWUosSUFBWixDQUFrQixXQUFsQixLQUFtQyxRQUFoRDtBQUNBLFlBQUl4RCxLQUFLLEdBQUdmLENBQUMsQ0FBRTJFLE1BQUYsQ0FBRCxDQUFZSixJQUFaLENBQWtCLFVBQWxCLEtBQWtDdkUsQ0FBQyxDQUFFMkUsTUFBRixDQUFELENBQVlFLElBQVosRUFBbEMsSUFBd0RGLE1BQU0sQ0FBQzNELEtBQS9ELElBQXdFMkQsTUFBTSxDQUFDRyxJQUEzRjtBQUNBcEUsUUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXRyxRQUFYLEVBQXFCQyxNQUFyQixFQUE2QkMsS0FBN0IsQ0FBeEI7QUFDQSxPQU5EO0FBT0E7QUFDRDs7QUFFRGYsRUFBQUEsQ0FBQyxDQUFFd0MsUUFBRixDQUFELENBQWN1QyxLQUFkLENBQXFCLFlBQVc7QUFDL0IxRCxJQUFBQSx3QkFBd0I7QUFDeEIsR0FGRDtBQUlBLENBclBELEVBcVBLYyxNQXJQTCIsImZpbGUiOiJ3cC1hbmFseXRpY3MtdHJhY2tpbmctZ2VuZXJhdG9yLWZyb250LWVuZC5qcyIsInNvdXJjZXNDb250ZW50IjpbIiggZnVuY3Rpb24oICQgKSB7XG5cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKSB7XG5cdFx0dmFyIHZlcnNpb24gPSAnJztcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICYmICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICkge1xuXHRcdFx0aWYgKCAnZ3RhZ2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBndGFnICkge1xuXHRcdFx0XHR2ZXJzaW9uID0gJ2d0YWcnO1xuXHRcdFx0fSBlbHNlIGlmICggJ2FuYWx5dGljc2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdFx0dmVyc2lvbiA9ICdnYSc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2ZXJzaW9uO1xuXHR9XG5cblx0Lypcblx0ICogY2FsbCBob29rcyBmcm9tIG90aGVyIHBsdWdpbnMgb3IgdGhlbWVzXG5cdCAqXG5cdCovXG5cdGlmICggdHlwZW9mIHdwICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHR3cC5ob29rcy5hZGRBY3Rpb24oICd3cEFuYWx5dGljc1RyYWNraW5nR2VuZXJhdG9yRXZlbnQnLCAnd3BBbmFseXRpY3NUcmFja2luZ0dlbmVyYXRvcicsIHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCwgMTAgKTtcblx0XHR3cC5ob29rcy5hZGRBY3Rpb24oICd3cEFuYWx5dGljc1RyYWNraW5nR2VuZXJhdG9yRWNvbW1lcmNlQWN0aW9uJywgJ3dwQW5hbHl0aWNzVHJhY2tpbmdHZW5lcmF0b3InLCB3cEFuYWx5dGljc1RyYWNraW5nRWNvbW1lcmNlQWN0aW9uLCAxMCApO1xuXHR9XG5cblx0Lypcblx0ICogQ3JlYXRlIGEgR29vZ2xlIEFuYWx5dGljcyBldmVudFxuXHQgKiBjYXRlZ29yeTogRXZlbnQgQ2F0ZWdvcnlcblx0ICogbGFiZWw6IEV2ZW50IExhYmVsXG5cdCAqIGFjdGlvbjogRXZlbnQgQWN0aW9uXG5cdCAqIHZhbHVlOiBvcHRpb25hbFxuXHQqL1xuXHRmdW5jdGlvbiB3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSwgbm9uX2ludGVyYWN0aW9uICkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKTtcblx0XHRpZiAoICdndGFnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdC8vIFNlbmRzIHRoZSBldmVudCB0byB0aGUgR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoXG5cdFx0XHQvLyB0cmFja2luZyBJRCBHQV9NRUFTVVJFTUVOVF9JRCBzZXQgYnkgdGhlIGNvbmZpZyBjb21tYW5kIGluXG5cdFx0XHQvLyB0aGUgZ2xvYmFsIHRyYWNraW5nIHNuaXBwZXQuXG5cdFx0XHQvLyBleGFtcGxlOiBndGFnKCdldmVudCcsICdwbGF5JywgeyAnZXZlbnRfY2F0ZWdvcnknOiAnVmlkZW9zJywgJ2V2ZW50X2xhYmVsJzogJ0ZhbGwgQ2FtcGFpZ24nIH0pO1xuXHRcdFx0dmFyIHBhcmFtcyA9IHtcblx0XHRcdFx0J2V2ZW50X2NhdGVnb3J5JzogY2F0ZWdvcnksXG5cdFx0XHRcdCdldmVudF9sYWJlbCc6IGxhYmVsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHZhbHVlICkge1xuXHRcdFx0XHRwYXJhbXMudmFsdWUgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdHBhcmFtcy5ub25faW50ZXJhY3Rpb24gPSBub25faW50ZXJhY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRndGFnKCB0eXBlLCBhY3Rpb24sIHBhcmFtcyApO1xuXHRcdH0gZWxzZSBpZiAoICdnYScgPT09IHZlcnNpb24gKSB7XG5cdFx0XHQvLyBVc2VzIHRoZSBkZWZhdWx0IHRyYWNrZXIgdG8gc2VuZCB0aGUgZXZlbnQgdG8gdGhlXG5cdFx0XHQvLyBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGggdHJhY2tpbmcgSUQgR0FfTUVBU1VSRU1FTlRfSUQuXG5cdFx0XHQvLyBleGFtcGxlOiBnYSgnc2VuZCcsICdldmVudCcsICdWaWRlb3MnLCAncGxheScsICdGYWxsIENhbXBhaWduJyk7XG5cdFx0XHQvLyBub25pbnRlcmFjdGlvbiBzZWVtcyB0byBoYXZlIGJlZW4gd29ya2luZyBsaWtlIHRoaXMgaW4gYW5hbHl0aWNzLmpzLlxuXHRcdFx0aWYgKCBub25faW50ZXJhY3Rpb24gPT0gMSApIHtcblx0XHRcdFx0dmFsdWUgPSB7ICdub25JbnRlcmFjdGlvbic6IDEgfTtcblx0XHRcdH1cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiB2YWx1ZSApIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qXG5cdCAqIENyZWF0ZSBhIEdvb2dsZSBBbmFseXRpY3MgRWNvbW1lcmNlIGFjdGlvblxuXHQgKiBcblx0Ki9cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NUcmFja2luZ0Vjb21tZXJjZUFjdGlvbiggdHlwZSwgYWN0aW9uLCBwcm9kdWN0LCBzdGVwICkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKTtcblx0XHRpZiAoICdndGFnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdGd0YWcoIHR5cGUsIGFjdGlvbiwge1xuXHRcdFx0XHRcIml0ZW1zXCI6IFtcblx0XHRcdFx0XHRwcm9kdWN0XG5cdFx0XHRcdF1cblx0XHRcdH0gKTtcblx0XHR9IGVsc2UgaWYgKCAnZ2EnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0Z2EoICdyZXF1aXJlJywgJ2VjJyApO1xuXHRcdFx0Z2EoICdlYzphZGRQcm9kdWN0JywgcHJvZHVjdCApO1xuXHRcdFx0c3dpdGNoKCBhY3Rpb24pIHtcblx0XHRcdFx0Y2FzZSAnc2VsZWN0X2NvbnRlbnQnOlxuXHRcdFx0XHRcdGdhKCAnZWM6c2V0QWN0aW9uJywgJ2RldGFpbCcgKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2FkZF90b19jYXJ0Jzpcblx0XHRcdFx0XHRnYSggJ2VjOnNldEFjdGlvbicsICdhZGQnICk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdiZWdpbl9jaGVja291dCc6XG5cdFx0XHRcdFx0Z2EoICdlYzpzZXRBY3Rpb24nLCAnY2hlY2tvdXQnLCB7XG5cdFx0XHRcdFx0XHQnc3RlcCc6IHN0ZXAsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0ICB9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NUcmFja2luZ1NldHVwKCkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKTtcblx0XHRpZiAoICcnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHNldHRpbmdzIGZvciBTY3JvbGxEZXB0aCBwbHVnaW5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbCAmJiB0cnVlID09PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLmVuYWJsZWQgKSB7XG5cdFx0XHR2YXIgc2Nyb2xsRGVwdGhTZXR0aW5ncyA9IFtdO1xuXHRcdFx0Ly8gdGhpcyBuZWVkcyB0byBiZSB0cnVlLCByZWdhcmRsZXNzLCBiZWNhdXNlIG90aGVyd2lzZSB0aGUgYXNzdW1wdGlvbiBpcyB0aGF0IHRoZSB0cmFja2luZyBpcyBkZWZpbmVkIGluIEdvb2dsZSBUYWcgTWFuYWdlci5cblx0XHRcdC8vIHRvZG86IGl0IG1pZ2h0IGJlIHdvcnRoIGJ1aWxkaW5nIGEgc2V0dGluZyBmb3IgdGhpcy5cblx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2d0bU92ZXJyaWRlJ10gPSB0cnVlO1xuXG5cdFx0XHQvLyBpZiB3ZSdyZSB1c2luZyBnYSwgd2UgbmVlZCB0byB0ZWxsIHRoZSBwbHVnaW5cblx0XHRcdGlmICggJ2d0YWcnICE9PSB2ZXJzaW9uICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydnYUdsb2JhbCddID0gJ2dhJztcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmdcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICYmICcwJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbWluaW11bV9oZWlnaHQnXSA9IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGVyY2VudGFnZSddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWyd1c2VyX3RpbWluZyddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGl4ZWxfZGVwdGggJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwaXhlbF9kZXB0aCddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ25vbl9pbnRlcmFjdGlvbiddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGFuIGFycmF5LiBkZWZhdWx0IGlzIGVtcHR5LlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydlbGVtZW50cyddID0gJC5tYXAoIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzLnNwbGl0KCAnLCcgKSwgJC50cmltICk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNlbmQgc2Nyb2xsIHNldHRpbmdzIHRvIHRoZSBzY3JvbGxkZXB0aCBwbHVnaW5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZV9qcXVlcnkgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VfanF1ZXJ5ICkge1xuXHRcdFx0XHRqUXVlcnkuc2Nyb2xsRGVwdGgoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhc2Nyb2xsZGVwdGguaW5pdCggc2Nyb2xsRGVwdGhTZXR0aW5ncyApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5lbmFibGVkICkge1xuXG5cdFx0XHQvLyBleHRlcm5hbCBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJodHRwXCJdOm5vdChbaHJlZio9XCI6Ly8nICsgZG9jdW1lbnQuZG9tYWluICsgJ1wiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdPdXRib3VuZCBsaW5rcycsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIG1haWx0byBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJtYWlsdG9cIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdNYWlscycsICdDbGljaycsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIHRlbCBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJ0ZWxcIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdUZWxlcGhvbmUnLCAnQ2FsbCcsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGludGVybmFsIGxpbmtzXG5cdFx0XHQkKCAnYTpub3QoW2hyZWZePVwiKGh0dHA6fGh0dHBzOik/Ly9cIl0sW2hyZWZePVwiI1wiXSxbaHJlZl49XCJtYWlsdG86XCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0Ly8gdHJhY2sgZG93bmxvYWRzXG5cdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICkge1xuXHRcdFx0XHRcdHZhciB1cmwgPSB0aGlzLmhyZWY7XG5cdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWQgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHR2YXIgaXNEb3dubG9hZCA9IGNoZWNrRG93bmxvYWQudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0Rvd25sb2FkICkge1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWRFeHRlbnNpb24gPSBuZXcgUmVnRXhwKFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIik7XG5cdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uUmVzdWx0ID0gY2hlY2tEb3dubG9hZEV4dGVuc2lvbi5leGVjKCB1cmwgKTtcblx0XHRcdFx0XHRcdHZhciBleHRlbnNpb24gPSAnJztcblx0XHRcdFx0XHRcdGlmICggbnVsbCAhPT0gZXh0ZW5zaW9uUmVzdWx0ICkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHRbMV07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyB3ZSBjYW4ndCB1c2UgdGhlIHVybCBmb3IgdGhlIHZhbHVlIGhlcmUsIGV2ZW4gdGhvdWdoIHRoYXQgd291bGQgYmUgbmljZSwgYmVjYXVzZSB2YWx1ZSBpcyBzdXBwb3NlZCB0byBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdEb3dubG9hZHMnLCBleHRlbnNpb24sIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5lbmFibGVkICkge1xuXHRcdFx0Ly8gYW55IGxpbmsgY291bGQgYmUgYW4gYWZmaWxpYXRlLCBpIGd1ZXNzP1xuXHRcdFx0JCggJ2EnICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdC8vIHRyYWNrIGFmZmlsaWF0ZXNcblx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKSB7XG5cdFx0XHRcdFx0dmFyIGNoZWNrQWZmaWxpYXRlID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0dmFyIGlzQWZmaWxpYXRlID0gY2hlY2tBZmZpbGlhdGUudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0FmZmlsaWF0ZSApIHtcblx0XHRcdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgJ0FmZmlsaWF0ZScsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBsaW5rIGZyYWdtZW50cyBhcyBwYWdldmlld3Ncblx0XHQvLyBkb2VzIG5vdCB1c2UgdGhlIGV2ZW50IHRyYWNraW5nIG1ldGhvZDsgZmxhZ3MgYSBwYWdldmlldyBpbnN0ZWFkLlxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50LmVuYWJsZWQgKSB7XG5cdFx0XHR3aW5kb3cub25oYXNoY2hhbmdlID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0XHRcdFx0dmFyIGZyYWdtZW50X3VybCA9IGxvY2F0aW9uLnBhdGhuYW1lICsgbG9jYXRpb24uc2VhcmNoICsgbG9jYXRpb24uaGFzaDtcblx0XHRcdFx0aWYgKCAnZ3RhZycgPT09IHZlcnNpb24gKSB7XG5cdFx0XHRcdFx0Z3RhZygnc2V0JywgJ3BhZ2VfcGF0aCcsIGZyYWdtZW50X3VybCk7XG5cdFx0XHRcdFx0Z3RhZygnZXZlbnQnLCAncGFnZV92aWV3Jyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoICdnYScgPT09IHZlcnNpb24gKSB7XG5cdFx0XHRcdFx0Z2EoICdzZW5kJywgJ3BhZ2V2aWV3JywgZnJhZ21lbnRfdXJsICk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB3aGVuIGEgYnV0dG9uIGlzIGNsaWNrZWQsIGF0dGFjaCBpdCB0byB0aGUgZm9ybSdzIGRhdGFcblx0XHQkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkub24oICdjbGljaycsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGZvcm0gPSAkKCB0aGlzICkucGFyZW50cyggJ2Zvcm06Zmlyc3QnICk7XG5cdFx0XHQkKCBmb3JtICkuZGF0YSggJ2J1dHRvbicsIHRoaXMgKTtcblx0XHR9KTtcblxuXHRcdC8vIGJhc2ljIGZvcm0gc3VibWl0cy4gdHJhY2sgc3VibWl0IGluc3RlYWQgb2YgY2xpY2sgYmVjYXVzZSBvdGhlcndpc2UgaXQncyB3ZWlyZC5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMuZW5hYmxlZCApIHtcblx0XHRcdCQoICdmb3JtJyApLnN1Ym1pdCggZnVuY3Rpb24oIGYgKSB7XG5cdFx0XHRcdHZhciBidXR0b24gPSAkKCB0aGlzICkuZGF0YSggJ2J1dHRvbicgKSB8fCAkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkuZ2V0KCAwICk7XG5cdFx0XHRcdHZhciBjYXRlZ29yeSA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1jYXRlZ29yeScgKSB8fCAnRm9ybSc7XG5cdFx0XHRcdHZhciBhY3Rpb24gPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtYWN0aW9uJyApIHx8ICdTdWJtaXQnO1xuXHRcdFx0XHR2YXIgbGFiZWwgPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtbGFiZWwnICkgfHwgJCggYnV0dG9uICkudGV4dCgpIHx8IGJ1dHRvbi52YWx1ZSB8fCBidXR0b24ubmFtZTtcblx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0JCggZG9jdW1lbnQgKS5yZWFkeSggZnVuY3Rpb24oKSB7XG5cdFx0d3BBbmFseXRpY3NUcmFja2luZ1NldHVwKCk7XG5cdH0pO1xuXG59ICkoIGpRdWVyeSApO1xuIl19
