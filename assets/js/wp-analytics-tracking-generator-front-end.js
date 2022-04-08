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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndwLWV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbiIsInZlcnNpb24iLCJhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MiLCJhbmFseXRpY3NfdHlwZSIsImd0YWciLCJnYSIsIndwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCIsInR5cGUiLCJjYXRlZ29yeSIsImFjdGlvbiIsImxhYmVsIiwidmFsdWUiLCJub25faW50ZXJhY3Rpb24iLCJwYXJhbXMiLCJ3cEFuYWx5dGljc1RyYWNraW5nU2V0dXAiLCJhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3MiLCJzY3JvbGwiLCJlbmFibGVkIiwic2Nyb2xsRGVwdGhTZXR0aW5ncyIsIm1pbmltdW1faGVpZ2h0IiwicGVyY2VudGFnZSIsInVzZXJfdGltaW5nIiwicGl4ZWxfZGVwdGgiLCJzY3JvbGxfZWxlbWVudHMiLCJtYXAiLCJzcGxpdCIsInRyaW0iLCJ1c2VfanF1ZXJ5IiwialF1ZXJ5Iiwic2Nyb2xsRGVwdGgiLCJnYXNjcm9sbGRlcHRoIiwiaW5pdCIsInNwZWNpYWwiLCJkb2N1bWVudCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwidXJsIiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJ0ZXN0IiwiY2hlY2tEb3dubG9hZEV4dGVuc2lvbiIsImV4dGVuc2lvblJlc3VsdCIsImV4ZWMiLCJleHRlbnNpb24iLCJhZmZpbGlhdGUiLCJhZmZpbGlhdGVfcmVnZXgiLCJjaGVja0FmZmlsaWF0ZSIsImlzQWZmaWxpYXRlIiwiZnJhZ21lbnQiLCJ3aW5kb3ciLCJvbmhhc2hjaGFuZ2UiLCJldmVudCIsImZyYWdtZW50X3VybCIsImxvY2F0aW9uIiwicGF0aG5hbWUiLCJzZWFyY2giLCJoYXNoIiwib24iLCJmb3JtIiwicGFyZW50cyIsImRhdGEiLCJmb3JtX3N1Ym1pc3Npb25zIiwic3VibWl0IiwiZiIsImJ1dHRvbiIsImdldCIsInRleHQiLCJuYW1lIiwicmVhZHkiXSwibWFwcGluZ3MiOiI7O0FBQUEsQ0FBRSxVQUFVQSxDQUFWLEVBQWM7QUFFZixXQUFTQyxnQ0FBVCxHQUE0QztBQUMzQyxRQUFJQyxPQUFPLEdBQUcsRUFBZDs7QUFDQSxRQUFLLGdCQUFnQixPQUFPQywyQkFBdkIsSUFBc0QsZ0JBQWdCLE9BQU9BLDJCQUEyQixDQUFDQyxjQUE5RyxFQUErSDtBQUM5SCxVQUFLLGFBQWFELDJCQUEyQixDQUFDQyxjQUF6QyxJQUEyRCxlQUFlLE9BQU9DLElBQXRGLEVBQTZGO0FBQzVGSCxRQUFBQSxPQUFPLEdBQUcsTUFBVjtBQUNBLE9BRkQsTUFFTyxJQUFLLGtCQUFrQkMsMkJBQTJCLENBQUNDLGNBQTlDLElBQWdFLGVBQWUsT0FBT0UsRUFBM0YsRUFBZ0c7QUFDdEdKLFFBQUFBLE9BQU8sR0FBRyxJQUFWO0FBQ0E7QUFDRDs7QUFDRCxXQUFPQSxPQUFQO0FBQ0E7QUFFRDtBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0MsV0FBU0ssd0JBQVQsQ0FBbUNDLElBQW5DLEVBQXlDQyxRQUF6QyxFQUFtREMsTUFBbkQsRUFBMkRDLEtBQTNELEVBQWtFQyxLQUFsRSxFQUF5RUMsZUFBekUsRUFBMkY7QUFDMUYsUUFBSVgsT0FBTyxHQUFHRCxnQ0FBZ0MsRUFBOUM7O0FBQ0EsUUFBSyxXQUFXQyxPQUFoQixFQUEwQjtBQUN6QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFVBQUlZLE1BQU0sR0FBRztBQUNaLDBCQUFrQkwsUUFETjtBQUVaLHVCQUFlRTtBQUZILE9BQWI7O0FBSUEsVUFBSyxnQkFBZ0IsT0FBT0MsS0FBNUIsRUFBb0M7QUFDbkNFLFFBQUFBLE1BQU0sQ0FBQ0YsS0FBUCxHQUFlQSxLQUFmO0FBQ0E7O0FBQ0QsVUFBSyxnQkFBZ0IsT0FBT0MsZUFBNUIsRUFBOEM7QUFDN0NDLFFBQUFBLE1BQU0sQ0FBQ0QsZUFBUCxHQUF5QkEsZUFBekI7QUFDQTs7QUFDRFIsTUFBQUEsSUFBSSxDQUFFRyxJQUFGLEVBQVFFLE1BQVIsRUFBZ0JJLE1BQWhCLENBQUo7QUFDQSxLQWhCRCxNQWdCTyxJQUFLLFNBQVNaLE9BQWQsRUFBd0I7QUFDOUI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxVQUFLVyxlQUFlLElBQUksQ0FBeEIsRUFBNEI7QUFDM0JELFFBQUFBLEtBQUssR0FBRztBQUFFLDRCQUFrQjtBQUFwQixTQUFSO0FBQ0E7O0FBQ0QsVUFBSyxnQkFBZ0IsT0FBT0EsS0FBNUIsRUFBb0M7QUFDbkNOLFFBQUFBLEVBQUUsQ0FBRSxNQUFGLEVBQVVFLElBQVYsRUFBZ0JDLFFBQWhCLEVBQTBCQyxNQUExQixFQUFrQ0MsS0FBbEMsQ0FBRjtBQUNBLE9BRkQsTUFFTztBQUNOTCxRQUFBQSxFQUFFLENBQUUsTUFBRixFQUFVRSxJQUFWLEVBQWdCQyxRQUFoQixFQUEwQkMsTUFBMUIsRUFBa0NDLEtBQWxDLEVBQXlDQyxLQUF6QyxDQUFGO0FBQ0E7QUFDRDtBQUNEOztBQUVELFdBQVNHLHdCQUFULEdBQW9DO0FBQ25DLFFBQUliLE9BQU8sR0FBR0QsZ0NBQWdDLEVBQTlDOztBQUNBLFFBQUssT0FBT0MsT0FBWixFQUFzQjtBQUNyQjtBQUNBLEtBSmtDLENBTW5DOzs7QUFDQSxRQUFLLGdCQUFnQixPQUFPYyw4QkFBOEIsQ0FBQ0MsTUFBdEQsSUFBZ0UsU0FBU0QsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDQyxPQUFwSCxFQUE4SDtBQUM3SCxVQUFJQyxtQkFBbUIsR0FBRyxFQUExQixDQUQ2SCxDQUU3SDtBQUNBOztBQUNBQSxNQUFBQSxtQkFBbUIsQ0FBQyxhQUFELENBQW5CLEdBQXFDLElBQXJDLENBSjZILENBTTdIOztBQUNBLFVBQUssV0FBV2pCLE9BQWhCLEVBQTBCO0FBQ3pCaUIsUUFBQUEsbUJBQW1CLENBQUMsVUFBRCxDQUFuQixHQUFrQyxJQUFsQztBQUNBLE9BVDRILENBVzdIOzs7QUFDQSxVQUFLLGdCQUFnQixPQUFPSCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NHLGNBQTdELElBQStFLFFBQVFKLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0csY0FBbEksRUFBbUo7QUFDbEpELFFBQUFBLG1CQUFtQixDQUFDLGdCQUFELENBQW5CLEdBQXdDSCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NHLGNBQTlFO0FBQ0EsT0FkNEgsQ0FnQjdIOzs7QUFDQSxVQUFLLGdCQUFnQixPQUFPSiw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NJLFVBQTdELElBQTJFLFdBQVdMLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0ksVUFBakksRUFBOEk7QUFDN0lGLFFBQUFBLG1CQUFtQixDQUFDLFlBQUQsQ0FBbkIsR0FBb0MsS0FBcEM7QUFDQSxPQW5CNEgsQ0FxQjdIOzs7QUFDQSxVQUFLLGdCQUFnQixPQUFPSCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NLLFdBQTdELElBQTRFLFdBQVdOLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0ssV0FBbEksRUFBZ0o7QUFDL0lILFFBQUFBLG1CQUFtQixDQUFDLGFBQUQsQ0FBbkIsR0FBcUMsS0FBckM7QUFDQSxPQXhCNEgsQ0EwQjdIOzs7QUFDQSxVQUFLLGdCQUFnQixPQUFPSCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NNLFdBQTdELElBQTRFLFdBQVdQLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0ssV0FBbEksRUFBZ0o7QUFDL0lILFFBQUFBLG1CQUFtQixDQUFDLGFBQUQsQ0FBbkIsR0FBcUMsS0FBckM7QUFDQSxPQTdCNEgsQ0ErQjdIOzs7QUFDQSxVQUFLLGdCQUFnQixPQUFPSCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NKLGVBQTdELElBQWdGLFdBQVdHLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0osZUFBdEksRUFBd0o7QUFDdkpNLFFBQUFBLG1CQUFtQixDQUFDLGlCQUFELENBQW5CLEdBQXlDLEtBQXpDO0FBQ0EsT0FsQzRILENBb0M3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDTyxlQUFsRSxFQUFvRjtBQUNuRkwsUUFBQUEsbUJBQW1CLENBQUMsVUFBRCxDQUFuQixHQUFrQ25CLENBQUMsQ0FBQ3lCLEdBQUYsQ0FBT1QsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDTyxlQUF0QyxDQUFzREUsS0FBdEQsQ0FBNkQsR0FBN0QsQ0FBUCxFQUEyRTFCLENBQUMsQ0FBQzJCLElBQTdFLENBQWxDO0FBQ0EsT0F2QzRILENBeUM3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT1gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDVyxVQUE3RCxJQUEyRSxTQUFTWiw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NXLFVBQS9ILEVBQTRJO0FBQzNJQyxRQUFBQSxNQUFNLENBQUNDLFdBQVAsQ0FBb0JYLG1CQUFwQjtBQUNBLE9BRkQsTUFFTztBQUNOWSxRQUFBQSxhQUFhLENBQUNDLElBQWQsQ0FBb0JiLG1CQUFwQjtBQUNBO0FBQ0Q7O0FBRUQsUUFBSyxnQkFBZ0IsT0FBT2hCLDJCQUEyQixDQUFDOEIsT0FBbkQsSUFBOEQsU0FBUzlCLDJCQUEyQixDQUFDOEIsT0FBNUIsQ0FBb0NmLE9BQWhILEVBQTBIO0FBRXpIO0FBQ0FsQixNQUFBQSxDQUFDLENBQUUsb0NBQW9Da0MsUUFBUSxDQUFDQyxNQUE3QyxHQUFzRCxLQUF4RCxDQUFELENBQWlFQyxLQUFqRSxDQUF3RSxZQUFXO0FBQ2xGN0IsUUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXLGdCQUFYLEVBQTZCLE9BQTdCLEVBQXNDLEtBQUs4QixJQUEzQyxDQUF4QjtBQUNBLE9BRkQsRUFIeUgsQ0FPekg7O0FBQ0FyQyxNQUFBQSxDQUFDLENBQUUsbUJBQUYsQ0FBRCxDQUF5Qm9DLEtBQXpCLENBQWdDLFlBQVc7QUFDMUM3QixRQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVcsT0FBWCxFQUFvQixPQUFwQixFQUE2QixLQUFLOEIsSUFBTCxDQUFVQyxTQUFWLENBQXFCLENBQXJCLENBQTdCLENBQXhCO0FBQ0EsT0FGRCxFQVJ5SCxDQVl6SDs7QUFDQXRDLE1BQUFBLENBQUMsQ0FBRSxnQkFBRixDQUFELENBQXNCb0MsS0FBdEIsQ0FBNkIsWUFBVztBQUN2QzdCLFFBQUFBLHdCQUF3QixDQUFFLE9BQUYsRUFBVyxXQUFYLEVBQXdCLE1BQXhCLEVBQWdDLEtBQUs4QixJQUFMLENBQVVDLFNBQVYsQ0FBcUIsQ0FBckIsQ0FBaEMsQ0FBeEI7QUFDQSxPQUZELEVBYnlILENBaUJ6SDs7QUFDQXRDLE1BQUFBLENBQUMsQ0FBRSxrRUFBRixDQUFELENBQXdFb0MsS0FBeEUsQ0FBK0UsWUFBVztBQUV6RjtBQUNBLFlBQUssT0FBT2pDLDJCQUEyQixDQUFDOEIsT0FBNUIsQ0FBb0NNLGNBQWhELEVBQWlFO0FBQ2hFLGNBQUlDLEdBQUcsR0FBRyxLQUFLSCxJQUFmO0FBQ0EsY0FBSUksYUFBYSxHQUFHLElBQUlDLE1BQUosQ0FBWSxTQUFTdkMsMkJBQTJCLENBQUM4QixPQUE1QixDQUFvQ00sY0FBN0MsR0FBOEQsY0FBMUUsRUFBMEYsR0FBMUYsQ0FBcEI7QUFDQSxjQUFJSSxVQUFVLEdBQUdGLGFBQWEsQ0FBQ0csSUFBZCxDQUFvQkosR0FBcEIsQ0FBakI7O0FBQ0EsY0FBSyxTQUFTRyxVQUFkLEVBQTJCO0FBQzFCLGdCQUFJRSxzQkFBc0IsR0FBRyxJQUFJSCxNQUFKLENBQVcsU0FBU3ZDLDJCQUEyQixDQUFDOEIsT0FBNUIsQ0FBb0NNLGNBQTdDLEdBQThELGNBQXpFLEVBQXlGLEdBQXpGLENBQTdCO0FBQ0EsZ0JBQUlPLGVBQWUsR0FBR0Qsc0JBQXNCLENBQUNFLElBQXZCLENBQTZCUCxHQUE3QixDQUF0QjtBQUNBLGdCQUFJUSxTQUFTLEdBQUcsRUFBaEI7O0FBQ0EsZ0JBQUssU0FBU0YsZUFBZCxFQUFnQztBQUMvQkUsY0FBQUEsU0FBUyxHQUFHRixlQUFlLENBQUMsQ0FBRCxDQUEzQjtBQUNBLGFBRkQsTUFFTztBQUNORSxjQUFBQSxTQUFTLEdBQUdGLGVBQVo7QUFDQSxhQVJ5QixDQVMxQjs7O0FBQ0F2QyxZQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVcsV0FBWCxFQUF3QnlDLFNBQXhCLEVBQW1DLEtBQUtYLElBQXhDLENBQXhCO0FBQ0E7QUFDRDtBQUNELE9BcEJEO0FBcUJBOztBQUVELFFBQUssZ0JBQWdCLE9BQU9sQywyQkFBMkIsQ0FBQzhDLFNBQW5ELElBQWdFLFNBQVM5QywyQkFBMkIsQ0FBQzhDLFNBQTVCLENBQXNDL0IsT0FBcEgsRUFBOEg7QUFDN0g7QUFDQWxCLE1BQUFBLENBQUMsQ0FBRSxHQUFGLENBQUQsQ0FBU29DLEtBQVQsQ0FBZ0IsWUFBVztBQUUxQjtBQUNBLFlBQUssT0FBT2pDLDJCQUEyQixDQUFDOEMsU0FBNUIsQ0FBc0NDLGVBQWxELEVBQW9FO0FBQ25FLGNBQUlDLGNBQWMsR0FBRyxJQUFJVCxNQUFKLENBQVksU0FBU3ZDLDJCQUEyQixDQUFDOEMsU0FBNUIsQ0FBc0NDLGVBQS9DLEdBQWlFLGNBQTdFLEVBQTZGLEdBQTdGLENBQXJCO0FBQ0EsY0FBSUUsV0FBVyxHQUFHRCxjQUFjLENBQUNQLElBQWYsQ0FBcUJKLEdBQXJCLENBQWxCOztBQUNBLGNBQUssU0FBU1ksV0FBZCxFQUE0QjtBQUMzQjdDLFlBQUFBLHdCQUF3QixDQUFFLE9BQUYsRUFBVyxXQUFYLEVBQXdCLE9BQXhCLEVBQWlDLEtBQUs4QixJQUF0QyxDQUF4QjtBQUNBO0FBQ0Q7QUFFRCxPQVhEO0FBWUEsS0EvR2tDLENBaUhuQztBQUNBOzs7QUFDQSxRQUFLLGdCQUFnQixPQUFPbEMsMkJBQTJCLENBQUNrRCxRQUFuRCxJQUErRCxTQUFTbEQsMkJBQTJCLENBQUNrRCxRQUE1QixDQUFxQ25DLE9BQWxILEVBQTRIO0FBQzNIb0MsTUFBQUEsTUFBTSxDQUFDQyxZQUFQLEdBQXNCLFVBQVNDLEtBQVQsRUFBZ0I7QUFDckMsWUFBSUMsWUFBWSxHQUFHQyxRQUFRLENBQUNDLFFBQVQsR0FBb0JELFFBQVEsQ0FBQ0UsTUFBN0IsR0FBc0NGLFFBQVEsQ0FBQ0csSUFBbEU7O0FBQ0EsWUFBSyxXQUFXM0QsT0FBaEIsRUFBMEI7QUFDekJHLFVBQUFBLElBQUksQ0FBQyxLQUFELEVBQVEsV0FBUixFQUFxQm9ELFlBQXJCLENBQUo7QUFDQXBELFVBQUFBLElBQUksQ0FBQyxPQUFELEVBQVUsV0FBVixDQUFKO0FBQ0EsU0FIRCxNQUdPLElBQUssU0FBU0gsT0FBZCxFQUF3QjtBQUM5QkksVUFBQUEsRUFBRSxDQUFFLE1BQUYsRUFBVSxVQUFWLEVBQXNCbUQsWUFBdEIsQ0FBRjtBQUNBO0FBQ0QsT0FSRDtBQVNBLEtBN0hrQyxDQStIbkM7OztBQUNBekQsSUFBQUEsQ0FBQyxDQUFFLDZDQUFGLENBQUQsQ0FBbUQ4RCxFQUFuRCxDQUF1RCxPQUF2RCxFQUFnRSxZQUFXO0FBQzFFLFVBQUlDLElBQUksR0FBRy9ELENBQUMsQ0FBRSxJQUFGLENBQUQsQ0FBVWdFLE9BQVYsQ0FBbUIsWUFBbkIsQ0FBWDtBQUNBaEUsTUFBQUEsQ0FBQyxDQUFFK0QsSUFBRixDQUFELENBQVVFLElBQVYsQ0FBZ0IsUUFBaEIsRUFBMEIsSUFBMUI7QUFDQSxLQUhELEVBaEltQyxDQXFJbkM7O0FBQ0EsUUFBSyxnQkFBZ0IsT0FBTzlELDJCQUEyQixDQUFDK0QsZ0JBQW5ELElBQXVFLFNBQVMvRCwyQkFBMkIsQ0FBQytELGdCQUE1QixDQUE2Q2hELE9BQWxJLEVBQTRJO0FBQzNJbEIsTUFBQUEsQ0FBQyxDQUFFLE1BQUYsQ0FBRCxDQUFZbUUsTUFBWixDQUFvQixVQUFVQyxDQUFWLEVBQWM7QUFDakMsWUFBSUMsTUFBTSxHQUFHckUsQ0FBQyxDQUFFLElBQUYsQ0FBRCxDQUFVaUUsSUFBVixDQUFnQixRQUFoQixLQUE4QmpFLENBQUMsQ0FBRSw2Q0FBRixDQUFELENBQW1Ec0UsR0FBbkQsQ0FBd0QsQ0FBeEQsQ0FBM0M7QUFDQSxZQUFJN0QsUUFBUSxHQUFHVCxDQUFDLENBQUVxRSxNQUFGLENBQUQsQ0FBWUosSUFBWixDQUFrQixhQUFsQixLQUFxQyxNQUFwRDtBQUNBLFlBQUl2RCxNQUFNLEdBQUdWLENBQUMsQ0FBRXFFLE1BQUYsQ0FBRCxDQUFZSixJQUFaLENBQWtCLFdBQWxCLEtBQW1DLFFBQWhEO0FBQ0EsWUFBSXRELEtBQUssR0FBR1gsQ0FBQyxDQUFFcUUsTUFBRixDQUFELENBQVlKLElBQVosQ0FBa0IsVUFBbEIsS0FBa0NqRSxDQUFDLENBQUVxRSxNQUFGLENBQUQsQ0FBWUUsSUFBWixFQUFsQyxJQUF3REYsTUFBTSxDQUFDekQsS0FBL0QsSUFBd0V5RCxNQUFNLENBQUNHLElBQTNGO0FBQ0FqRSxRQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVdFLFFBQVgsRUFBcUJDLE1BQXJCLEVBQTZCQyxLQUE3QixDQUF4QjtBQUNBLE9BTkQ7QUFPQTtBQUNEOztBQUVEWCxFQUFBQSxDQUFDLENBQUVrQyxRQUFGLENBQUQsQ0FBY3VDLEtBQWQsQ0FBcUIsWUFBVztBQUMvQjFELElBQUFBLHdCQUF3QjtBQUN4QixHQUZEO0FBSUEsQ0E1TUQsRUE0TUtjLE1BNU1MIiwiZmlsZSI6IndwLWFuYWx5dGljcy10cmFja2luZy1nZW5lcmF0b3ItZnJvbnQtZW5kLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKCBmdW5jdGlvbiggJCApIHtcblxuXHRmdW5jdGlvbiB3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbigpIHtcblx0XHR2YXIgdmVyc2lvbiA9ICcnO1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MgJiYgJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgKSB7XG5cdFx0XHRpZiAoICdndGFnanMnID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGd0YWcgKSB7XG5cdFx0XHRcdHZlcnNpb24gPSAnZ3RhZyc7XG5cdFx0XHR9IGVsc2UgaWYgKCAnYW5hbHl0aWNzanMnID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGdhICkge1xuXHRcdFx0XHR2ZXJzaW9uID0gJ2dhJztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHZlcnNpb247XG5cdH1cblxuXHQvKlxuXHQgKiBDcmVhdGUgYSBHb29nbGUgQW5hbHl0aWNzIGV2ZW50XG5cdCAqIGNhdGVnb3J5OiBFdmVudCBDYXRlZ29yeVxuXHQgKiBsYWJlbDogRXZlbnQgTGFiZWxcblx0ICogYWN0aW9uOiBFdmVudCBBY3Rpb25cblx0ICogdmFsdWU6IG9wdGlvbmFsXG5cdCovXG5cdGZ1bmN0aW9uIHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlLCBub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0dmFyIHZlcnNpb24gPSB3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbigpO1xuXHRcdGlmICggJ2d0YWcnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0Ly8gU2VuZHMgdGhlIGV2ZW50IHRvIHRoZSBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGhcblx0XHRcdC8vIHRyYWNraW5nIElEIEdBX01FQVNVUkVNRU5UX0lEIHNldCBieSB0aGUgY29uZmlnIGNvbW1hbmQgaW5cblx0XHRcdC8vIHRoZSBnbG9iYWwgdHJhY2tpbmcgc25pcHBldC5cblx0XHRcdC8vIGV4YW1wbGU6IGd0YWcoJ2V2ZW50JywgJ3BsYXknLCB7ICdldmVudF9jYXRlZ29yeSc6ICdWaWRlb3MnLCAnZXZlbnRfbGFiZWwnOiAnRmFsbCBDYW1wYWlnbicgfSk7XG5cdFx0XHR2YXIgcGFyYW1zID0ge1xuXHRcdFx0XHQnZXZlbnRfY2F0ZWdvcnknOiBjYXRlZ29yeSxcblx0XHRcdFx0J2V2ZW50X2xhYmVsJzogbGFiZWxcblx0XHRcdH07XG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgdmFsdWUgKSB7XG5cdFx0XHRcdHBhcmFtcy52YWx1ZSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIG5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHRcdFx0cGFyYW1zLm5vbl9pbnRlcmFjdGlvbiA9IG5vbl9pbnRlcmFjdGlvbjtcblx0XHRcdH1cblx0XHRcdGd0YWcoIHR5cGUsIGFjdGlvbiwgcGFyYW1zICk7XG5cdFx0fSBlbHNlIGlmICggJ2dhJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdC8vIFVzZXMgdGhlIGRlZmF1bHQgdHJhY2tlciB0byBzZW5kIHRoZSBldmVudCB0byB0aGVcblx0XHRcdC8vIEdvb2dsZSBBbmFseXRpY3MgcHJvcGVydHkgd2l0aCB0cmFja2luZyBJRCBHQV9NRUFTVVJFTUVOVF9JRC5cblx0XHRcdC8vIGV4YW1wbGU6IGdhKCdzZW5kJywgJ2V2ZW50JywgJ1ZpZGVvcycsICdwbGF5JywgJ0ZhbGwgQ2FtcGFpZ24nKTtcblx0XHRcdC8vIG5vbmludGVyYWN0aW9uIHNlZW1zIHRvIGhhdmUgYmVlbiB3b3JraW5nIGxpa2UgdGhpcyBpbiBhbmFseXRpY3MuanMuXG5cdFx0XHRpZiAoIG5vbl9pbnRlcmFjdGlvbiA9PSAxICkge1xuXHRcdFx0XHR2YWx1ZSA9IHsgJ25vbkludGVyYWN0aW9uJzogMSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyA9PT0gdHlwZW9mIHZhbHVlICkge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NUcmFja2luZ1NldHVwKCkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKTtcblx0XHRpZiAoICcnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHNldHRpbmdzIGZvciBTY3JvbGxEZXB0aCBwbHVnaW5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbCAmJiB0cnVlID09PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLmVuYWJsZWQgKSB7XG5cdFx0XHR2YXIgc2Nyb2xsRGVwdGhTZXR0aW5ncyA9IFtdO1xuXHRcdFx0Ly8gdGhpcyBuZWVkcyB0byBiZSB0cnVlLCByZWdhcmRsZXNzLCBiZWNhdXNlIG90aGVyd2lzZSB0aGUgYXNzdW1wdGlvbiBpcyB0aGF0IHRoZSB0cmFja2luZyBpcyBkZWZpbmVkIGluIEdvb2dsZSBUYWcgTWFuYWdlci5cblx0XHRcdC8vIHRvZG86IGl0IG1pZ2h0IGJlIHdvcnRoIGJ1aWxkaW5nIGEgc2V0dGluZyBmb3IgdGhpcy5cblx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2d0bU92ZXJyaWRlJ10gPSB0cnVlO1xuXG5cdFx0XHQvLyBpZiB3ZSdyZSB1c2luZyBnYSwgd2UgbmVlZCB0byB0ZWxsIHRoZSBwbHVnaW5cblx0XHRcdGlmICggJ2d0YWcnICE9PSB2ZXJzaW9uICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydnYUdsb2JhbCddID0gJ2dhJztcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmdcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICYmICcwJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbWluaW11bV9oZWlnaHQnXSA9IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGVyY2VudGFnZSddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWyd1c2VyX3RpbWluZyddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwucGl4ZWxfZGVwdGggJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwaXhlbF9kZXB0aCddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ25vbl9pbnRlcmFjdGlvbiddID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGFuIGFycmF5LiBkZWZhdWx0IGlzIGVtcHR5LlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydlbGVtZW50cyddID0gJC5tYXAoIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzLnNwbGl0KCAnLCcgKSwgJC50cmltICk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNlbmQgc2Nyb2xsIHNldHRpbmdzIHRvIHRoZSBzY3JvbGxkZXB0aCBwbHVnaW5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZV9qcXVlcnkgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VfanF1ZXJ5ICkge1xuXHRcdFx0XHRqUXVlcnkuc2Nyb2xsRGVwdGgoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhc2Nyb2xsZGVwdGguaW5pdCggc2Nyb2xsRGVwdGhTZXR0aW5ncyApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5lbmFibGVkICkge1xuXG5cdFx0XHQvLyBleHRlcm5hbCBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJodHRwXCJdOm5vdChbaHJlZio9XCI6Ly8nICsgZG9jdW1lbnQuZG9tYWluICsgJ1wiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdPdXRib3VuZCBsaW5rcycsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIG1haWx0byBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJtYWlsdG9cIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdNYWlscycsICdDbGljaycsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIHRlbCBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJ0ZWxcIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdUZWxlcGhvbmUnLCAnQ2FsbCcsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGludGVybmFsIGxpbmtzXG5cdFx0XHQkKCAnYTpub3QoW2hyZWZePVwiKGh0dHA6fGh0dHBzOik/Ly9cIl0sW2hyZWZePVwiI1wiXSxbaHJlZl49XCJtYWlsdG86XCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0Ly8gdHJhY2sgZG93bmxvYWRzXG5cdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICkge1xuXHRcdFx0XHRcdHZhciB1cmwgPSB0aGlzLmhyZWY7XG5cdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWQgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHR2YXIgaXNEb3dubG9hZCA9IGNoZWNrRG93bmxvYWQudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0Rvd25sb2FkICkge1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWRFeHRlbnNpb24gPSBuZXcgUmVnRXhwKFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIik7XG5cdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uUmVzdWx0ID0gY2hlY2tEb3dubG9hZEV4dGVuc2lvbi5leGVjKCB1cmwgKTtcblx0XHRcdFx0XHRcdHZhciBleHRlbnNpb24gPSAnJztcblx0XHRcdFx0XHRcdGlmICggbnVsbCAhPT0gZXh0ZW5zaW9uUmVzdWx0ICkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHRbMV07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyB3ZSBjYW4ndCB1c2UgdGhlIHVybCBmb3IgdGhlIHZhbHVlIGhlcmUsIGV2ZW4gdGhvdWdoIHRoYXQgd291bGQgYmUgbmljZSwgYmVjYXVzZSB2YWx1ZSBpcyBzdXBwb3NlZCB0byBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdEb3dubG9hZHMnLCBleHRlbnNpb24sIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5lbmFibGVkICkge1xuXHRcdFx0Ly8gYW55IGxpbmsgY291bGQgYmUgYW4gYWZmaWxpYXRlLCBpIGd1ZXNzP1xuXHRcdFx0JCggJ2EnICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdC8vIHRyYWNrIGFmZmlsaWF0ZXNcblx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKSB7XG5cdFx0XHRcdFx0dmFyIGNoZWNrQWZmaWxpYXRlID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0dmFyIGlzQWZmaWxpYXRlID0gY2hlY2tBZmZpbGlhdGUudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0FmZmlsaWF0ZSApIHtcblx0XHRcdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgJ0FmZmlsaWF0ZScsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBsaW5rIGZyYWdtZW50cyBhcyBwYWdldmlld3Ncblx0XHQvLyBkb2VzIG5vdCB1c2UgdGhlIGV2ZW50IHRyYWNraW5nIG1ldGhvZDsgZmxhZ3MgYSBwYWdldmlldyBpbnN0ZWFkLlxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50LmVuYWJsZWQgKSB7XG5cdFx0XHR3aW5kb3cub25oYXNoY2hhbmdlID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0XHRcdFx0dmFyIGZyYWdtZW50X3VybCA9IGxvY2F0aW9uLnBhdGhuYW1lICsgbG9jYXRpb24uc2VhcmNoICsgbG9jYXRpb24uaGFzaDtcblx0XHRcdFx0aWYgKCAnZ3RhZycgPT09IHZlcnNpb24gKSB7XG5cdFx0XHRcdFx0Z3RhZygnc2V0JywgJ3BhZ2VfcGF0aCcsIGZyYWdtZW50X3VybCk7XG5cdFx0XHRcdFx0Z3RhZygnZXZlbnQnLCAncGFnZV92aWV3Jyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoICdnYScgPT09IHZlcnNpb24gKSB7XG5cdFx0XHRcdFx0Z2EoICdzZW5kJywgJ3BhZ2V2aWV3JywgZnJhZ21lbnRfdXJsICk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB3aGVuIGEgYnV0dG9uIGlzIGNsaWNrZWQsIGF0dGFjaCBpdCB0byB0aGUgZm9ybSdzIGRhdGFcblx0XHQkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkub24oICdjbGljaycsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGZvcm0gPSAkKCB0aGlzICkucGFyZW50cyggJ2Zvcm06Zmlyc3QnICk7XG5cdFx0XHQkKCBmb3JtICkuZGF0YSggJ2J1dHRvbicsIHRoaXMgKTtcblx0XHR9KTtcblxuXHRcdC8vIGJhc2ljIGZvcm0gc3VibWl0cy4gdHJhY2sgc3VibWl0IGluc3RlYWQgb2YgY2xpY2sgYmVjYXVzZSBvdGhlcndpc2UgaXQncyB3ZWlyZC5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMuZW5hYmxlZCApIHtcblx0XHRcdCQoICdmb3JtJyApLnN1Ym1pdCggZnVuY3Rpb24oIGYgKSB7XG5cdFx0XHRcdHZhciBidXR0b24gPSAkKCB0aGlzICkuZGF0YSggJ2J1dHRvbicgKSB8fCAkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkuZ2V0KCAwICk7XG5cdFx0XHRcdHZhciBjYXRlZ29yeSA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1jYXRlZ29yeScgKSB8fCAnRm9ybSc7XG5cdFx0XHRcdHZhciBhY3Rpb24gPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtYWN0aW9uJyApIHx8ICdTdWJtaXQnO1xuXHRcdFx0XHR2YXIgbGFiZWwgPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtbGFiZWwnICkgfHwgJCggYnV0dG9uICkudGV4dCgpIHx8IGJ1dHRvbi52YWx1ZSB8fCBidXR0b24ubmFtZTtcblx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0JCggZG9jdW1lbnQgKS5yZWFkeSggZnVuY3Rpb24oKSB7XG5cdFx0d3BBbmFseXRpY3NUcmFja2luZ1NldHVwKCk7XG5cdH0pO1xuXG59ICkoIGpRdWVyeSApO1xuIl19
