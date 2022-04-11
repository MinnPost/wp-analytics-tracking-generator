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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndwLWV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbiIsInZlcnNpb24iLCJhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MiLCJhbmFseXRpY3NfdHlwZSIsImd0YWciLCJnYSIsIndwIiwiaG9va3MiLCJhZGRBY3Rpb24iLCJ3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwibm9uX2ludGVyYWN0aW9uIiwicGFyYW1zIiwid3BBbmFseXRpY3NUcmFja2luZ1NldHVwIiwiYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsInNjcm9sbERlcHRoU2V0dGluZ3MiLCJtaW5pbXVtX2hlaWdodCIsInBlcmNlbnRhZ2UiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwic2Nyb2xsX2VsZW1lbnRzIiwibWFwIiwic3BsaXQiLCJ0cmltIiwidXNlX2pxdWVyeSIsImpRdWVyeSIsInNjcm9sbERlcHRoIiwiZ2FzY3JvbGxkZXB0aCIsImluaXQiLCJzcGVjaWFsIiwiZG9jdW1lbnQiLCJkb21haW4iLCJjbGljayIsImhyZWYiLCJzdWJzdHJpbmciLCJkb3dubG9hZF9yZWdleCIsInVybCIsImNoZWNrRG93bmxvYWQiLCJSZWdFeHAiLCJpc0Rvd25sb2FkIiwidGVzdCIsImNoZWNrRG93bmxvYWRFeHRlbnNpb24iLCJleHRlbnNpb25SZXN1bHQiLCJleGVjIiwiZXh0ZW5zaW9uIiwiYWZmaWxpYXRlIiwiYWZmaWxpYXRlX3JlZ2V4IiwiY2hlY2tBZmZpbGlhdGUiLCJpc0FmZmlsaWF0ZSIsImZyYWdtZW50Iiwid2luZG93Iiwib25oYXNoY2hhbmdlIiwiZXZlbnQiLCJmcmFnbWVudF91cmwiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsIm9uIiwiZm9ybSIsInBhcmVudHMiLCJkYXRhIiwiZm9ybV9zdWJtaXNzaW9ucyIsInN1Ym1pdCIsImYiLCJidXR0b24iLCJnZXQiLCJ0ZXh0IiwibmFtZSIsInJlYWR5Il0sIm1hcHBpbmdzIjoiOztBQUFBLENBQUUsVUFBVUEsQ0FBVixFQUFjO0FBRWYsV0FBU0MsZ0NBQVQsR0FBNEM7QUFDM0MsUUFBSUMsT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsUUFBSyxnQkFBZ0IsT0FBT0MsMkJBQXZCLElBQXNELGdCQUFnQixPQUFPQSwyQkFBMkIsQ0FBQ0MsY0FBOUcsRUFBK0g7QUFDOUgsVUFBSyxhQUFhRCwyQkFBMkIsQ0FBQ0MsY0FBekMsSUFBMkQsZUFBZSxPQUFPQyxJQUF0RixFQUE2RjtBQUM1RkgsUUFBQUEsT0FBTyxHQUFHLE1BQVY7QUFDQSxPQUZELE1BRU8sSUFBSyxrQkFBa0JDLDJCQUEyQixDQUFDQyxjQUE5QyxJQUFnRSxlQUFlLE9BQU9FLEVBQTNGLEVBQWdHO0FBQ3RHSixRQUFBQSxPQUFPLEdBQUcsSUFBVjtBQUNBO0FBQ0Q7O0FBQ0QsV0FBT0EsT0FBUDtBQUNBO0FBRUQ7QUFDRDtBQUNBO0FBQ0E7OztBQUNDLE1BQUssT0FBT0ssRUFBUCxLQUFjLFdBQW5CLEVBQWlDO0FBQ2hDQSxJQUFBQSxFQUFFLENBQUNDLEtBQUgsQ0FBU0MsU0FBVCxDQUFvQixtQ0FBcEIsRUFBeUQsOEJBQXpELEVBQXlGQyx3QkFBekYsRUFBbUgsRUFBbkg7QUFDQTtBQUVEO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQyxXQUFTQSx3QkFBVCxDQUFtQ0MsSUFBbkMsRUFBeUNDLFFBQXpDLEVBQW1EQyxNQUFuRCxFQUEyREMsS0FBM0QsRUFBa0VDLEtBQWxFLEVBQXlFQyxlQUF6RSxFQUEyRjtBQUMxRixRQUFJZCxPQUFPLEdBQUdELGdDQUFnQyxFQUE5Qzs7QUFDQSxRQUFLLFdBQVdDLE9BQWhCLEVBQTBCO0FBQ3pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsVUFBSWUsTUFBTSxHQUFHO0FBQ1osMEJBQWtCTCxRQUROO0FBRVosdUJBQWVFO0FBRkgsT0FBYjs7QUFJQSxVQUFLLGdCQUFnQixPQUFPQyxLQUE1QixFQUFvQztBQUNuQ0UsUUFBQUEsTUFBTSxDQUFDRixLQUFQLEdBQWVBLEtBQWY7QUFDQTs7QUFDRCxVQUFLLGdCQUFnQixPQUFPQyxlQUE1QixFQUE4QztBQUM3Q0MsUUFBQUEsTUFBTSxDQUFDRCxlQUFQLEdBQXlCQSxlQUF6QjtBQUNBOztBQUNEWCxNQUFBQSxJQUFJLENBQUVNLElBQUYsRUFBUUUsTUFBUixFQUFnQkksTUFBaEIsQ0FBSjtBQUNBLEtBaEJELE1BZ0JPLElBQUssU0FBU2YsT0FBZCxFQUF3QjtBQUM5QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFVBQUtjLGVBQWUsSUFBSSxDQUF4QixFQUE0QjtBQUMzQkQsUUFBQUEsS0FBSyxHQUFHO0FBQUUsNEJBQWtCO0FBQXBCLFNBQVI7QUFDQTs7QUFDRCxVQUFLLGdCQUFnQixPQUFPQSxLQUE1QixFQUFvQztBQUNuQ1QsUUFBQUEsRUFBRSxDQUFFLE1BQUYsRUFBVUssSUFBVixFQUFnQkMsUUFBaEIsRUFBMEJDLE1BQTFCLEVBQWtDQyxLQUFsQyxDQUFGO0FBQ0EsT0FGRCxNQUVPO0FBQ05SLFFBQUFBLEVBQUUsQ0FBRSxNQUFGLEVBQVVLLElBQVYsRUFBZ0JDLFFBQWhCLEVBQTBCQyxNQUExQixFQUFrQ0MsS0FBbEMsRUFBeUNDLEtBQXpDLENBQUY7QUFDQTtBQUNEO0FBQ0Q7O0FBRUQsV0FBU0csd0JBQVQsR0FBb0M7QUFDbkMsUUFBSWhCLE9BQU8sR0FBR0QsZ0NBQWdDLEVBQTlDOztBQUNBLFFBQUssT0FBT0MsT0FBWixFQUFzQjtBQUNyQjtBQUNBLEtBSmtDLENBTW5DOzs7QUFDQSxRQUFLLGdCQUFnQixPQUFPaUIsOEJBQThCLENBQUNDLE1BQXRELElBQWdFLFNBQVNELDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0MsT0FBcEgsRUFBOEg7QUFDN0gsVUFBSUMsbUJBQW1CLEdBQUcsRUFBMUIsQ0FENkgsQ0FFN0g7QUFDQTs7QUFDQUEsTUFBQUEsbUJBQW1CLENBQUMsYUFBRCxDQUFuQixHQUFxQyxJQUFyQyxDQUo2SCxDQU03SDs7QUFDQSxVQUFLLFdBQVdwQixPQUFoQixFQUEwQjtBQUN6Qm9CLFFBQUFBLG1CQUFtQixDQUFDLFVBQUQsQ0FBbkIsR0FBa0MsSUFBbEM7QUFDQSxPQVQ0SCxDQVc3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDRyxjQUE3RCxJQUErRSxRQUFRSiw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NHLGNBQWxJLEVBQW1KO0FBQ2xKRCxRQUFBQSxtQkFBbUIsQ0FBQyxnQkFBRCxDQUFuQixHQUF3Q0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDRyxjQUE5RTtBQUNBLE9BZDRILENBZ0I3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0osOEJBQThCLENBQUNDLE1BQS9CLENBQXNDSSxVQUE3RCxJQUEyRSxXQUFXTCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NJLFVBQWpJLEVBQThJO0FBQzdJRixRQUFBQSxtQkFBbUIsQ0FBQyxZQUFELENBQW5CLEdBQW9DLEtBQXBDO0FBQ0EsT0FuQjRILENBcUI3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDSyxXQUE3RCxJQUE0RSxXQUFXTiw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NLLFdBQWxJLEVBQWdKO0FBQy9JSCxRQUFBQSxtQkFBbUIsQ0FBQyxhQUFELENBQW5CLEdBQXFDLEtBQXJDO0FBQ0EsT0F4QjRILENBMEI3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDTSxXQUE3RCxJQUE0RSxXQUFXUCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NLLFdBQWxJLEVBQWdKO0FBQy9JSCxRQUFBQSxtQkFBbUIsQ0FBQyxhQUFELENBQW5CLEdBQXFDLEtBQXJDO0FBQ0EsT0E3QjRILENBK0I3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDSixlQUE3RCxJQUFnRixXQUFXRyw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NKLGVBQXRJLEVBQXdKO0FBQ3ZKTSxRQUFBQSxtQkFBbUIsQ0FBQyxpQkFBRCxDQUFuQixHQUF5QyxLQUF6QztBQUNBLE9BbEM0SCxDQW9DN0g7OztBQUNBLFVBQUssZ0JBQWdCLE9BQU9ILDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ08sZUFBbEUsRUFBb0Y7QUFDbkZMLFFBQUFBLG1CQUFtQixDQUFDLFVBQUQsQ0FBbkIsR0FBa0N0QixDQUFDLENBQUM0QixHQUFGLENBQU9ULDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ08sZUFBdEMsQ0FBc0RFLEtBQXRELENBQTZELEdBQTdELENBQVAsRUFBMkU3QixDQUFDLENBQUM4QixJQUE3RSxDQUFsQztBQUNBLE9BdkM0SCxDQXlDN0g7OztBQUNBLFVBQUssZ0JBQWdCLE9BQU9YLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ1csVUFBN0QsSUFBMkUsU0FBU1osOEJBQThCLENBQUNDLE1BQS9CLENBQXNDVyxVQUEvSCxFQUE0STtBQUMzSUMsUUFBQUEsTUFBTSxDQUFDQyxXQUFQLENBQW9CWCxtQkFBcEI7QUFDQSxPQUZELE1BRU87QUFDTlksUUFBQUEsYUFBYSxDQUFDQyxJQUFkLENBQW9CYixtQkFBcEI7QUFDQTtBQUNEOztBQUVELFFBQUssZ0JBQWdCLE9BQU9uQiwyQkFBMkIsQ0FBQ2lDLE9BQW5ELElBQThELFNBQVNqQywyQkFBMkIsQ0FBQ2lDLE9BQTVCLENBQW9DZixPQUFoSCxFQUEwSDtBQUV6SDtBQUNBckIsTUFBQUEsQ0FBQyxDQUFFLG9DQUFvQ3FDLFFBQVEsQ0FBQ0MsTUFBN0MsR0FBc0QsS0FBeEQsQ0FBRCxDQUFpRUMsS0FBakUsQ0FBd0UsWUFBVztBQUNsRjdCLFFBQUFBLHdCQUF3QixDQUFFLE9BQUYsRUFBVyxnQkFBWCxFQUE2QixPQUE3QixFQUFzQyxLQUFLOEIsSUFBM0MsQ0FBeEI7QUFDQSxPQUZELEVBSHlILENBT3pIOztBQUNBeEMsTUFBQUEsQ0FBQyxDQUFFLG1CQUFGLENBQUQsQ0FBeUJ1QyxLQUF6QixDQUFnQyxZQUFXO0FBQzFDN0IsUUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXLE9BQVgsRUFBb0IsT0FBcEIsRUFBNkIsS0FBSzhCLElBQUwsQ0FBVUMsU0FBVixDQUFxQixDQUFyQixDQUE3QixDQUF4QjtBQUNBLE9BRkQsRUFSeUgsQ0FZekg7O0FBQ0F6QyxNQUFBQSxDQUFDLENBQUUsZ0JBQUYsQ0FBRCxDQUFzQnVDLEtBQXRCLENBQTZCLFlBQVc7QUFDdkM3QixRQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVcsV0FBWCxFQUF3QixNQUF4QixFQUFnQyxLQUFLOEIsSUFBTCxDQUFVQyxTQUFWLENBQXFCLENBQXJCLENBQWhDLENBQXhCO0FBQ0EsT0FGRCxFQWJ5SCxDQWlCekg7O0FBQ0F6QyxNQUFBQSxDQUFDLENBQUUsa0VBQUYsQ0FBRCxDQUF3RXVDLEtBQXhFLENBQStFLFlBQVc7QUFFekY7QUFDQSxZQUFLLE9BQU9wQywyQkFBMkIsQ0FBQ2lDLE9BQTVCLENBQW9DTSxjQUFoRCxFQUFpRTtBQUNoRSxjQUFJQyxHQUFHLEdBQUcsS0FBS0gsSUFBZjtBQUNBLGNBQUlJLGFBQWEsR0FBRyxJQUFJQyxNQUFKLENBQVksU0FBUzFDLDJCQUEyQixDQUFDaUMsT0FBNUIsQ0FBb0NNLGNBQTdDLEdBQThELGNBQTFFLEVBQTBGLEdBQTFGLENBQXBCO0FBQ0EsY0FBSUksVUFBVSxHQUFHRixhQUFhLENBQUNHLElBQWQsQ0FBb0JKLEdBQXBCLENBQWpCOztBQUNBLGNBQUssU0FBU0csVUFBZCxFQUEyQjtBQUMxQixnQkFBSUUsc0JBQXNCLEdBQUcsSUFBSUgsTUFBSixDQUFXLFNBQVMxQywyQkFBMkIsQ0FBQ2lDLE9BQTVCLENBQW9DTSxjQUE3QyxHQUE4RCxjQUF6RSxFQUF5RixHQUF6RixDQUE3QjtBQUNBLGdCQUFJTyxlQUFlLEdBQUdELHNCQUFzQixDQUFDRSxJQUF2QixDQUE2QlAsR0FBN0IsQ0FBdEI7QUFDQSxnQkFBSVEsU0FBUyxHQUFHLEVBQWhCOztBQUNBLGdCQUFLLFNBQVNGLGVBQWQsRUFBZ0M7QUFDL0JFLGNBQUFBLFNBQVMsR0FBR0YsZUFBZSxDQUFDLENBQUQsQ0FBM0I7QUFDQSxhQUZELE1BRU87QUFDTkUsY0FBQUEsU0FBUyxHQUFHRixlQUFaO0FBQ0EsYUFSeUIsQ0FTMUI7OztBQUNBdkMsWUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXLFdBQVgsRUFBd0J5QyxTQUF4QixFQUFtQyxLQUFLWCxJQUF4QyxDQUF4QjtBQUNBO0FBQ0Q7QUFDRCxPQXBCRDtBQXFCQTs7QUFFRCxRQUFLLGdCQUFnQixPQUFPckMsMkJBQTJCLENBQUNpRCxTQUFuRCxJQUFnRSxTQUFTakQsMkJBQTJCLENBQUNpRCxTQUE1QixDQUFzQy9CLE9BQXBILEVBQThIO0FBQzdIO0FBQ0FyQixNQUFBQSxDQUFDLENBQUUsR0FBRixDQUFELENBQVN1QyxLQUFULENBQWdCLFlBQVc7QUFFMUI7QUFDQSxZQUFLLE9BQU9wQywyQkFBMkIsQ0FBQ2lELFNBQTVCLENBQXNDQyxlQUFsRCxFQUFvRTtBQUNuRSxjQUFJQyxjQUFjLEdBQUcsSUFBSVQsTUFBSixDQUFZLFNBQVMxQywyQkFBMkIsQ0FBQ2lELFNBQTVCLENBQXNDQyxlQUEvQyxHQUFpRSxjQUE3RSxFQUE2RixHQUE3RixDQUFyQjtBQUNBLGNBQUlFLFdBQVcsR0FBR0QsY0FBYyxDQUFDUCxJQUFmLENBQXFCSixHQUFyQixDQUFsQjs7QUFDQSxjQUFLLFNBQVNZLFdBQWQsRUFBNEI7QUFDM0I3QyxZQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVcsV0FBWCxFQUF3QixPQUF4QixFQUFpQyxLQUFLOEIsSUFBdEMsQ0FBeEI7QUFDQTtBQUNEO0FBRUQsT0FYRDtBQVlBLEtBL0drQyxDQWlIbkM7QUFDQTs7O0FBQ0EsUUFBSyxnQkFBZ0IsT0FBT3JDLDJCQUEyQixDQUFDcUQsUUFBbkQsSUFBK0QsU0FBU3JELDJCQUEyQixDQUFDcUQsUUFBNUIsQ0FBcUNuQyxPQUFsSCxFQUE0SDtBQUMzSG9DLE1BQUFBLE1BQU0sQ0FBQ0MsWUFBUCxHQUFzQixVQUFTQyxLQUFULEVBQWdCO0FBQ3JDLFlBQUlDLFlBQVksR0FBR0MsUUFBUSxDQUFDQyxRQUFULEdBQW9CRCxRQUFRLENBQUNFLE1BQTdCLEdBQXNDRixRQUFRLENBQUNHLElBQWxFOztBQUNBLFlBQUssV0FBVzlELE9BQWhCLEVBQTBCO0FBQ3pCRyxVQUFBQSxJQUFJLENBQUMsS0FBRCxFQUFRLFdBQVIsRUFBcUJ1RCxZQUFyQixDQUFKO0FBQ0F2RCxVQUFBQSxJQUFJLENBQUMsT0FBRCxFQUFVLFdBQVYsQ0FBSjtBQUNBLFNBSEQsTUFHTyxJQUFLLFNBQVNILE9BQWQsRUFBd0I7QUFDOUJJLFVBQUFBLEVBQUUsQ0FBRSxNQUFGLEVBQVUsVUFBVixFQUFzQnNELFlBQXRCLENBQUY7QUFDQTtBQUNELE9BUkQ7QUFTQSxLQTdIa0MsQ0ErSG5DOzs7QUFDQTVELElBQUFBLENBQUMsQ0FBRSw2Q0FBRixDQUFELENBQW1EaUUsRUFBbkQsQ0FBdUQsT0FBdkQsRUFBZ0UsWUFBVztBQUMxRSxVQUFJQyxJQUFJLEdBQUdsRSxDQUFDLENBQUUsSUFBRixDQUFELENBQVVtRSxPQUFWLENBQW1CLFlBQW5CLENBQVg7QUFDQW5FLE1BQUFBLENBQUMsQ0FBRWtFLElBQUYsQ0FBRCxDQUFVRSxJQUFWLENBQWdCLFFBQWhCLEVBQTBCLElBQTFCO0FBQ0EsS0FIRCxFQWhJbUMsQ0FxSW5DOztBQUNBLFFBQUssZ0JBQWdCLE9BQU9qRSwyQkFBMkIsQ0FBQ2tFLGdCQUFuRCxJQUF1RSxTQUFTbEUsMkJBQTJCLENBQUNrRSxnQkFBNUIsQ0FBNkNoRCxPQUFsSSxFQUE0STtBQUMzSXJCLE1BQUFBLENBQUMsQ0FBRSxNQUFGLENBQUQsQ0FBWXNFLE1BQVosQ0FBb0IsVUFBVUMsQ0FBVixFQUFjO0FBQ2pDLFlBQUlDLE1BQU0sR0FBR3hFLENBQUMsQ0FBRSxJQUFGLENBQUQsQ0FBVW9FLElBQVYsQ0FBZ0IsUUFBaEIsS0FBOEJwRSxDQUFDLENBQUUsNkNBQUYsQ0FBRCxDQUFtRHlFLEdBQW5ELENBQXdELENBQXhELENBQTNDO0FBQ0EsWUFBSTdELFFBQVEsR0FBR1osQ0FBQyxDQUFFd0UsTUFBRixDQUFELENBQVlKLElBQVosQ0FBa0IsYUFBbEIsS0FBcUMsTUFBcEQ7QUFDQSxZQUFJdkQsTUFBTSxHQUFHYixDQUFDLENBQUV3RSxNQUFGLENBQUQsQ0FBWUosSUFBWixDQUFrQixXQUFsQixLQUFtQyxRQUFoRDtBQUNBLFlBQUl0RCxLQUFLLEdBQUdkLENBQUMsQ0FBRXdFLE1BQUYsQ0FBRCxDQUFZSixJQUFaLENBQWtCLFVBQWxCLEtBQWtDcEUsQ0FBQyxDQUFFd0UsTUFBRixDQUFELENBQVlFLElBQVosRUFBbEMsSUFBd0RGLE1BQU0sQ0FBQ3pELEtBQS9ELElBQXdFeUQsTUFBTSxDQUFDRyxJQUEzRjtBQUNBakUsUUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXRSxRQUFYLEVBQXFCQyxNQUFyQixFQUE2QkMsS0FBN0IsQ0FBeEI7QUFDQSxPQU5EO0FBT0E7QUFDRDs7QUFFRGQsRUFBQUEsQ0FBQyxDQUFFcUMsUUFBRixDQUFELENBQWN1QyxLQUFkLENBQXFCLFlBQVc7QUFDL0IxRCxJQUFBQSx3QkFBd0I7QUFDeEIsR0FGRDtBQUlBLENBcE5ELEVBb05LYyxNQXBOTCIsImZpbGUiOiJ3cC1hbmFseXRpY3MtdHJhY2tpbmctZ2VuZXJhdG9yLWZyb250LWVuZC5qcyIsInNvdXJjZXNDb250ZW50IjpbIiggZnVuY3Rpb24oICQgKSB7XG5cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKSB7XG5cdFx0dmFyIHZlcnNpb24gPSAnJztcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICYmICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICkge1xuXHRcdFx0aWYgKCAnZ3RhZ2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBndGFnICkge1xuXHRcdFx0XHR2ZXJzaW9uID0gJ2d0YWcnO1xuXHRcdFx0fSBlbHNlIGlmICggJ2FuYWx5dGljc2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdFx0dmVyc2lvbiA9ICdnYSc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2ZXJzaW9uO1xuXHR9XG5cblx0Lypcblx0ICogY2FsbCBob29rcyBmcm9tIG90aGVyIHBsdWdpbnMgb3IgdGhlbWVzXG5cdCAqXG5cdCovXG5cdGlmICggdHlwZW9mIHdwICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHR3cC5ob29rcy5hZGRBY3Rpb24oICd3cEFuYWx5dGljc1RyYWNraW5nR2VuZXJhdG9yRXZlbnQnLCAnd3BBbmFseXRpY3NUcmFja2luZ0dlbmVyYXRvcicsIHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCwgMTAgKTtcblx0fVxuXG5cdC8qXG5cdCAqIENyZWF0ZSBhIEdvb2dsZSBBbmFseXRpY3MgZXZlbnRcblx0ICogY2F0ZWdvcnk6IEV2ZW50IENhdGVnb3J5XG5cdCAqIGxhYmVsOiBFdmVudCBMYWJlbFxuXHQgKiBhY3Rpb246IEV2ZW50IEFjdGlvblxuXHQgKiB2YWx1ZTogb3B0aW9uYWxcblx0Ki9cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUsIG5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHR2YXIgdmVyc2lvbiA9IHdwQW5hbHl0aWNzQ2hlY2tBbmFseXRpY3NWZXJzaW9uKCk7XG5cdFx0aWYgKCAnZ3RhZycgPT09IHZlcnNpb24gKSB7XG5cdFx0XHQvLyBTZW5kcyB0aGUgZXZlbnQgdG8gdGhlIEdvb2dsZSBBbmFseXRpY3MgcHJvcGVydHkgd2l0aFxuXHRcdFx0Ly8gdHJhY2tpbmcgSUQgR0FfTUVBU1VSRU1FTlRfSUQgc2V0IGJ5IHRoZSBjb25maWcgY29tbWFuZCBpblxuXHRcdFx0Ly8gdGhlIGdsb2JhbCB0cmFja2luZyBzbmlwcGV0LlxuXHRcdFx0Ly8gZXhhbXBsZTogZ3RhZygnZXZlbnQnLCAncGxheScsIHsgJ2V2ZW50X2NhdGVnb3J5JzogJ1ZpZGVvcycsICdldmVudF9sYWJlbCc6ICdGYWxsIENhbXBhaWduJyB9KTtcblx0XHRcdHZhciBwYXJhbXMgPSB7XG5cdFx0XHRcdCdldmVudF9jYXRlZ29yeSc6IGNhdGVnb3J5LFxuXHRcdFx0XHQnZXZlbnRfbGFiZWwnOiBsYWJlbFxuXHRcdFx0fTtcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB2YWx1ZSApIHtcblx0XHRcdFx0cGFyYW1zLnZhbHVlID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2Ygbm9uX2ludGVyYWN0aW9uICkge1xuXHRcdFx0XHRwYXJhbXMubm9uX2ludGVyYWN0aW9uID0gbm9uX2ludGVyYWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Z3RhZyggdHlwZSwgYWN0aW9uLCBwYXJhbXMgKTtcblx0XHR9IGVsc2UgaWYgKCAnZ2EnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0Ly8gVXNlcyB0aGUgZGVmYXVsdCB0cmFja2VyIHRvIHNlbmQgdGhlIGV2ZW50IHRvIHRoZVxuXHRcdFx0Ly8gR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoIHRyYWNraW5nIElEIEdBX01FQVNVUkVNRU5UX0lELlxuXHRcdFx0Ly8gZXhhbXBsZTogZ2EoJ3NlbmQnLCAnZXZlbnQnLCAnVmlkZW9zJywgJ3BsYXknLCAnRmFsbCBDYW1wYWlnbicpO1xuXHRcdFx0Ly8gbm9uaW50ZXJhY3Rpb24gc2VlbXMgdG8gaGF2ZSBiZWVuIHdvcmtpbmcgbGlrZSB0aGlzIGluIGFuYWx5dGljcy5qcy5cblx0XHRcdGlmICggbm9uX2ludGVyYWN0aW9uID09IDEgKSB7XG5cdFx0XHRcdHZhbHVlID0geyAnbm9uSW50ZXJhY3Rpb24nOiAxIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoICd1bmRlZmluZWQnID09PSB0eXBlb2YgdmFsdWUgKSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUgKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB3cEFuYWx5dGljc1RyYWNraW5nU2V0dXAoKSB7XG5cdFx0dmFyIHZlcnNpb24gPSB3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbigpO1xuXHRcdGlmICggJycgPT09IHZlcnNpb24gKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gc2V0dGluZ3MgZm9yIFNjcm9sbERlcHRoIHBsdWdpblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsICYmIHRydWUgPT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwuZW5hYmxlZCApIHtcblx0XHRcdHZhciBzY3JvbGxEZXB0aFNldHRpbmdzID0gW107XG5cdFx0XHQvLyB0aGlzIG5lZWRzIHRvIGJlIHRydWUsIHJlZ2FyZGxlc3MsIGJlY2F1c2Ugb3RoZXJ3aXNlIHRoZSBhc3N1bXB0aW9uIGlzIHRoYXQgdGhlIHRyYWNraW5nIGlzIGRlZmluZWQgaW4gR29vZ2xlIFRhZyBNYW5hZ2VyLlxuXHRcdFx0Ly8gdG9kbzogaXQgbWlnaHQgYmUgd29ydGggYnVpbGRpbmcgYSBzZXR0aW5nIGZvciB0aGlzLlxuXHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ3RtT3ZlcnJpZGUnXSA9IHRydWU7XG5cblx0XHRcdC8vIGlmIHdlJ3JlIHVzaW5nIGdhLCB3ZSBuZWVkIHRvIHRlbGwgdGhlIHBsdWdpblxuXHRcdFx0aWYgKCAnZ3RhZycgIT09IHZlcnNpb24gKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2dhR2xvYmFsJ10gPSAnZ2EnO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhIHN0cmluZ1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgJiYgJzAnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydtaW5pbXVtX2hlaWdodCddID0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwZXJjZW50YWdlJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3VzZXJfdGltaW5nJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5waXhlbF9kZXB0aCAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3BpeGVsX2RlcHRoJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbm9uX2ludGVyYWN0aW9uJ10gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsdWUgaXMgYW4gYXJyYXkuIGRlZmF1bHQgaXMgZW1wdHkuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2VsZW1lbnRzJ10gPSAkLm1hcCggYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMuc3BsaXQoICcsJyApLCAkLnRyaW0gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2VuZCBzY3JvbGwgc2V0dGluZ3MgdG8gdGhlIHNjcm9sbGRlcHRoIHBsdWdpblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlX2pxdWVyeSAmJiB0cnVlID09PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZV9qcXVlcnkgKSB7XG5cdFx0XHRcdGpRdWVyeS5zY3JvbGxEZXB0aCggc2Nyb2xsRGVwdGhTZXR0aW5ncyApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2FzY3JvbGxkZXB0aC5pbml0KCBzY3JvbGxEZXB0aFNldHRpbmdzICk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmVuYWJsZWQgKSB7XG5cblx0XHRcdC8vIGV4dGVybmFsIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cImh0dHBcIl06bm90KFtocmVmKj1cIjovLycgKyBkb2N1bWVudC5kb21haW4gKyAnXCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgJ091dGJvdW5kIGxpbmtzJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gbWFpbHRvIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cIm1haWx0b1wiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgJ01haWxzJywgJ0NsaWNrJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gdGVsIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cInRlbFwiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgJ1RlbGVwaG9uZScsICdDYWxsJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gaW50ZXJuYWwgbGlua3Ncblx0XHRcdCQoICdhOm5vdChbaHJlZl49XCIoaHR0cDp8aHR0cHM6KT8vL1wiXSxbaHJlZl49XCIjXCJdLFtocmVmXj1cIm1haWx0bzpcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHQvLyB0cmFjayBkb3dubG9hZHNcblx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKSB7XG5cdFx0XHRcdFx0dmFyIHVybCA9IHRoaXMuaHJlZjtcblx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZCA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdHZhciBpc0Rvd25sb2FkID0gY2hlY2tEb3dubG9hZC50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzRG93bmxvYWQgKSB7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZEV4dGVuc2lvbiA9IG5ldyBSZWdFeHAoXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiKTtcblx0XHRcdFx0XHRcdHZhciBleHRlbnNpb25SZXN1bHQgPSBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uLmV4ZWMoIHVybCApO1xuXHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvbiA9ICcnO1xuXHRcdFx0XHRcdFx0aWYgKCBudWxsICE9PSBleHRlbnNpb25SZXN1bHQgKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdFsxXTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIHdlIGNhbid0IHVzZSB0aGUgdXJsIGZvciB0aGUgdmFsdWUgaGVyZSwgZXZlbiB0aG91Z2ggdGhhdCB3b3VsZCBiZSBuaWNlLCBiZWNhdXNlIHZhbHVlIGlzIHN1cHBvc2VkIHRvIGJlIGFuIGludGVnZXJcblx0XHRcdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgJ0Rvd25sb2FkcycsIGV4dGVuc2lvbiwgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZSAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmVuYWJsZWQgKSB7XG5cdFx0XHQvLyBhbnkgbGluayBjb3VsZCBiZSBhbiBhZmZpbGlhdGUsIGkgZ3Vlc3M/XG5cdFx0XHQkKCAnYScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0Ly8gdHJhY2sgYWZmaWxpYXRlc1xuXHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCApIHtcblx0XHRcdFx0XHR2YXIgY2hlY2tBZmZpbGlhdGUgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHR2YXIgaXNBZmZpbGlhdGUgPSBjaGVja0FmZmlsaWF0ZS50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzQWZmaWxpYXRlICkge1xuXHRcdFx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCAnQWZmaWxpYXRlJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGxpbmsgZnJhZ21lbnRzIGFzIHBhZ2V2aWV3c1xuXHRcdC8vIGRvZXMgbm90IHVzZSB0aGUgZXZlbnQgdHJhY2tpbmcgbWV0aG9kOyBmbGFncyBhIHBhZ2V2aWV3IGluc3RlYWQuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQuZW5hYmxlZCApIHtcblx0XHRcdHdpbmRvdy5vbmhhc2hjaGFuZ2UgPSBmdW5jdGlvbihldmVudCkge1xuXHRcdFx0XHR2YXIgZnJhZ21lbnRfdXJsID0gbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBsb2NhdGlvbi5oYXNoO1xuXHRcdFx0XHRpZiAoICdndGFnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdFx0XHRndGFnKCdzZXQnLCAncGFnZV9wYXRoJywgZnJhZ21lbnRfdXJsKTtcblx0XHRcdFx0XHRndGFnKCdldmVudCcsICdwYWdlX3ZpZXcnKTtcblx0XHRcdFx0fSBlbHNlIGlmICggJ2dhJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdFx0XHRnYSggJ3NlbmQnLCAncGFnZXZpZXcnLCBmcmFnbWVudF91cmwgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHdoZW4gYSBidXR0b24gaXMgY2xpY2tlZCwgYXR0YWNoIGl0IHRvIHRoZSBmb3JtJ3MgZGF0YVxuXHRcdCQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5vbiggJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgZm9ybSA9ICQoIHRoaXMgKS5wYXJlbnRzKCAnZm9ybTpmaXJzdCcgKTtcblx0XHRcdCQoIGZvcm0gKS5kYXRhKCAnYnV0dG9uJywgdGhpcyApO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYmFzaWMgZm9ybSBzdWJtaXRzLiB0cmFjayBzdWJtaXQgaW5zdGVhZCBvZiBjbGljayBiZWNhdXNlIG90aGVyd2lzZSBpdCdzIHdlaXJkLlxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucyAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucy5lbmFibGVkICkge1xuXHRcdFx0JCggJ2Zvcm0nICkuc3VibWl0KCBmdW5jdGlvbiggZiApIHtcblx0XHRcdFx0dmFyIGJ1dHRvbiA9ICQoIHRoaXMgKS5kYXRhKCAnYnV0dG9uJyApIHx8ICQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5nZXQoIDAgKTtcblx0XHRcdFx0dmFyIGNhdGVnb3J5ID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWNhdGVnb3J5JyApIHx8ICdGb3JtJztcblx0XHRcdFx0dmFyIGFjdGlvbiA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1hY3Rpb24nICkgfHwgJ1N1Ym1pdCc7XG5cdFx0XHRcdHZhciBsYWJlbCA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1sYWJlbCcgKSB8fCAkKCBidXR0b24gKS50ZXh0KCkgfHwgYnV0dG9uLnZhbHVlIHx8IGJ1dHRvbi5uYW1lO1xuXHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQkKCBkb2N1bWVudCApLnJlYWR5KCBmdW5jdGlvbigpIHtcblx0XHR3cEFuYWx5dGljc1RyYWNraW5nU2V0dXAoKTtcblx0fSk7XG5cbn0gKSggalF1ZXJ5ICk7XG4iXX0=
