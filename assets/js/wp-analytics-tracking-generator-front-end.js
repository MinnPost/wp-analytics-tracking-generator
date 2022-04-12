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


  function wpAnalyticsTrackingEcommerceAction(type, action, product) {
    var version = wpAnalyticsCheckAnalyticsVersion();

    if ('gtag' === version) {
      gtag(type, action, {
        "items": [product]
      });
    } else if ('ga' === version) {
      ga('require', 'ec');
      ga('ec:addProduct', product);

      switch (action) {
        case 'add_to_cart':
          ga('ec:setAction', 'add');
          break;

        case 'begin_checkout':
          ga('ec:setAction', 'checkout', {
            'step': 1
          });
          break;

        default: // code block

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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndwLWV2ZW50LXRyYWNraW5nLmpzIl0sIm5hbWVzIjpbIiQiLCJ3cEFuYWx5dGljc0NoZWNrQW5hbHl0aWNzVmVyc2lvbiIsInZlcnNpb24iLCJhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MiLCJhbmFseXRpY3NfdHlwZSIsImd0YWciLCJnYSIsIndwIiwiaG9va3MiLCJhZGRBY3Rpb24iLCJ3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQiLCJ3cEFuYWx5dGljc1RyYWNraW5nRWNvbW1lcmNlQWN0aW9uIiwidHlwZSIsImNhdGVnb3J5IiwiYWN0aW9uIiwibGFiZWwiLCJ2YWx1ZSIsIm5vbl9pbnRlcmFjdGlvbiIsInBhcmFtcyIsInByb2R1Y3QiLCJ3cEFuYWx5dGljc1RyYWNraW5nU2V0dXAiLCJhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3MiLCJzY3JvbGwiLCJlbmFibGVkIiwic2Nyb2xsRGVwdGhTZXR0aW5ncyIsIm1pbmltdW1faGVpZ2h0IiwicGVyY2VudGFnZSIsInVzZXJfdGltaW5nIiwicGl4ZWxfZGVwdGgiLCJzY3JvbGxfZWxlbWVudHMiLCJtYXAiLCJzcGxpdCIsInRyaW0iLCJ1c2VfanF1ZXJ5IiwialF1ZXJ5Iiwic2Nyb2xsRGVwdGgiLCJnYXNjcm9sbGRlcHRoIiwiaW5pdCIsInNwZWNpYWwiLCJkb2N1bWVudCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwidXJsIiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJ0ZXN0IiwiY2hlY2tEb3dubG9hZEV4dGVuc2lvbiIsImV4dGVuc2lvblJlc3VsdCIsImV4ZWMiLCJleHRlbnNpb24iLCJhZmZpbGlhdGUiLCJhZmZpbGlhdGVfcmVnZXgiLCJjaGVja0FmZmlsaWF0ZSIsImlzQWZmaWxpYXRlIiwiZnJhZ21lbnQiLCJ3aW5kb3ciLCJvbmhhc2hjaGFuZ2UiLCJldmVudCIsImZyYWdtZW50X3VybCIsImxvY2F0aW9uIiwicGF0aG5hbWUiLCJzZWFyY2giLCJoYXNoIiwib24iLCJmb3JtIiwicGFyZW50cyIsImRhdGEiLCJmb3JtX3N1Ym1pc3Npb25zIiwic3VibWl0IiwiZiIsImJ1dHRvbiIsImdldCIsInRleHQiLCJuYW1lIiwicmVhZHkiXSwibWFwcGluZ3MiOiI7O0FBQUEsQ0FBRSxVQUFVQSxDQUFWLEVBQWM7QUFFZixXQUFTQyxnQ0FBVCxHQUE0QztBQUMzQyxRQUFJQyxPQUFPLEdBQUcsRUFBZDs7QUFDQSxRQUFLLGdCQUFnQixPQUFPQywyQkFBdkIsSUFBc0QsZ0JBQWdCLE9BQU9BLDJCQUEyQixDQUFDQyxjQUE5RyxFQUErSDtBQUM5SCxVQUFLLGFBQWFELDJCQUEyQixDQUFDQyxjQUF6QyxJQUEyRCxlQUFlLE9BQU9DLElBQXRGLEVBQTZGO0FBQzVGSCxRQUFBQSxPQUFPLEdBQUcsTUFBVjtBQUNBLE9BRkQsTUFFTyxJQUFLLGtCQUFrQkMsMkJBQTJCLENBQUNDLGNBQTlDLElBQWdFLGVBQWUsT0FBT0UsRUFBM0YsRUFBZ0c7QUFDdEdKLFFBQUFBLE9BQU8sR0FBRyxJQUFWO0FBQ0E7QUFDRDs7QUFDRCxXQUFPQSxPQUFQO0FBQ0E7QUFFRDtBQUNEO0FBQ0E7QUFDQTs7O0FBQ0MsTUFBSyxPQUFPSyxFQUFQLEtBQWMsV0FBbkIsRUFBaUM7QUFDaENBLElBQUFBLEVBQUUsQ0FBQ0MsS0FBSCxDQUFTQyxTQUFULENBQW9CLG1DQUFwQixFQUF5RCw4QkFBekQsRUFBeUZDLHdCQUF6RixFQUFtSCxFQUFuSDtBQUNBSCxJQUFBQSxFQUFFLENBQUNDLEtBQUgsQ0FBU0MsU0FBVCxDQUFvQiw2Q0FBcEIsRUFBbUUsOEJBQW5FLEVBQW1HRSxrQ0FBbkcsRUFBdUksRUFBdkk7QUFDQTtBQUVEO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQyxXQUFTRCx3QkFBVCxDQUFtQ0UsSUFBbkMsRUFBeUNDLFFBQXpDLEVBQW1EQyxNQUFuRCxFQUEyREMsS0FBM0QsRUFBa0VDLEtBQWxFLEVBQXlFQyxlQUF6RSxFQUEyRjtBQUMxRixRQUFJZixPQUFPLEdBQUdELGdDQUFnQyxFQUE5Qzs7QUFDQSxRQUFLLFdBQVdDLE9BQWhCLEVBQTBCO0FBQ3pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsVUFBSWdCLE1BQU0sR0FBRztBQUNaLDBCQUFrQkwsUUFETjtBQUVaLHVCQUFlRTtBQUZILE9BQWI7O0FBSUEsVUFBSyxnQkFBZ0IsT0FBT0MsS0FBNUIsRUFBb0M7QUFDbkNFLFFBQUFBLE1BQU0sQ0FBQ0YsS0FBUCxHQUFlQSxLQUFmO0FBQ0E7O0FBQ0QsVUFBSyxnQkFBZ0IsT0FBT0MsZUFBNUIsRUFBOEM7QUFDN0NDLFFBQUFBLE1BQU0sQ0FBQ0QsZUFBUCxHQUF5QkEsZUFBekI7QUFDQTs7QUFDRFosTUFBQUEsSUFBSSxDQUFFTyxJQUFGLEVBQVFFLE1BQVIsRUFBZ0JJLE1BQWhCLENBQUo7QUFDQSxLQWhCRCxNQWdCTyxJQUFLLFNBQVNoQixPQUFkLEVBQXdCO0FBQzlCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsVUFBS2UsZUFBZSxJQUFJLENBQXhCLEVBQTRCO0FBQzNCRCxRQUFBQSxLQUFLLEdBQUc7QUFBRSw0QkFBa0I7QUFBcEIsU0FBUjtBQUNBOztBQUNELFVBQUssZ0JBQWdCLE9BQU9BLEtBQTVCLEVBQW9DO0FBQ25DVixRQUFBQSxFQUFFLENBQUUsTUFBRixFQUFVTSxJQUFWLEVBQWdCQyxRQUFoQixFQUEwQkMsTUFBMUIsRUFBa0NDLEtBQWxDLENBQUY7QUFDQSxPQUZELE1BRU87QUFDTlQsUUFBQUEsRUFBRSxDQUFFLE1BQUYsRUFBVU0sSUFBVixFQUFnQkMsUUFBaEIsRUFBMEJDLE1BQTFCLEVBQWtDQyxLQUFsQyxFQUF5Q0MsS0FBekMsQ0FBRjtBQUNBO0FBQ0Q7QUFDRDtBQUVEO0FBQ0Q7QUFDQTtBQUNBOzs7QUFDQyxXQUFTTCxrQ0FBVCxDQUE2Q0MsSUFBN0MsRUFBbURFLE1BQW5ELEVBQTJESyxPQUEzRCxFQUFxRTtBQUNwRSxRQUFJakIsT0FBTyxHQUFHRCxnQ0FBZ0MsRUFBOUM7O0FBQ0EsUUFBSyxXQUFXQyxPQUFoQixFQUEwQjtBQUN6QkcsTUFBQUEsSUFBSSxDQUFFTyxJQUFGLEVBQVFFLE1BQVIsRUFBZ0I7QUFDbkIsaUJBQVMsQ0FDUkssT0FEUTtBQURVLE9BQWhCLENBQUo7QUFLQSxLQU5ELE1BTU8sSUFBSyxTQUFTakIsT0FBZCxFQUF3QjtBQUM5QkksTUFBQUEsRUFBRSxDQUFFLFNBQUYsRUFBYSxJQUFiLENBQUY7QUFDQUEsTUFBQUEsRUFBRSxDQUFFLGVBQUYsRUFBbUJhLE9BQW5CLENBQUY7O0FBQ0EsY0FBUUwsTUFBUjtBQUNDLGFBQUssYUFBTDtBQUNDUixVQUFBQSxFQUFFLENBQUMsY0FBRCxFQUFpQixLQUFqQixDQUFGO0FBQ0Q7O0FBQ0EsYUFBSyxnQkFBTDtBQUNDQSxVQUFBQSxFQUFFLENBQUUsY0FBRixFQUFrQixVQUFsQixFQUE4QjtBQUMvQixvQkFBUTtBQUR1QixXQUE5QixDQUFGO0FBR0Q7O0FBQ0EsZ0JBVEQsQ0FVRzs7QUFWSDtBQVlBO0FBQ0Q7O0FBRUQsV0FBU2Msd0JBQVQsR0FBb0M7QUFDbkMsUUFBSWxCLE9BQU8sR0FBR0QsZ0NBQWdDLEVBQTlDOztBQUNBLFFBQUssT0FBT0MsT0FBWixFQUFzQjtBQUNyQjtBQUNBLEtBSmtDLENBTW5DOzs7QUFDQSxRQUFLLGdCQUFnQixPQUFPbUIsOEJBQThCLENBQUNDLE1BQXRELElBQWdFLFNBQVNELDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ0MsT0FBcEgsRUFBOEg7QUFDN0gsVUFBSUMsbUJBQW1CLEdBQUcsRUFBMUIsQ0FENkgsQ0FFN0g7QUFDQTs7QUFDQUEsTUFBQUEsbUJBQW1CLENBQUMsYUFBRCxDQUFuQixHQUFxQyxJQUFyQyxDQUo2SCxDQU03SDs7QUFDQSxVQUFLLFdBQVd0QixPQUFoQixFQUEwQjtBQUN6QnNCLFFBQUFBLG1CQUFtQixDQUFDLFVBQUQsQ0FBbkIsR0FBa0MsSUFBbEM7QUFDQSxPQVQ0SCxDQVc3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDRyxjQUE3RCxJQUErRSxRQUFRSiw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NHLGNBQWxJLEVBQW1KO0FBQ2xKRCxRQUFBQSxtQkFBbUIsQ0FBQyxnQkFBRCxDQUFuQixHQUF3Q0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDRyxjQUE5RTtBQUNBLE9BZDRILENBZ0I3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0osOEJBQThCLENBQUNDLE1BQS9CLENBQXNDSSxVQUE3RCxJQUEyRSxXQUFXTCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NJLFVBQWpJLEVBQThJO0FBQzdJRixRQUFBQSxtQkFBbUIsQ0FBQyxZQUFELENBQW5CLEdBQW9DLEtBQXBDO0FBQ0EsT0FuQjRILENBcUI3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDSyxXQUE3RCxJQUE0RSxXQUFXTiw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NLLFdBQWxJLEVBQWdKO0FBQy9JSCxRQUFBQSxtQkFBbUIsQ0FBQyxhQUFELENBQW5CLEdBQXFDLEtBQXJDO0FBQ0EsT0F4QjRILENBMEI3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDTSxXQUE3RCxJQUE0RSxXQUFXUCw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NLLFdBQWxJLEVBQWdKO0FBQy9JSCxRQUFBQSxtQkFBbUIsQ0FBQyxhQUFELENBQW5CLEdBQXFDLEtBQXJDO0FBQ0EsT0E3QjRILENBK0I3SDs7O0FBQ0EsVUFBSyxnQkFBZ0IsT0FBT0gsOEJBQThCLENBQUNDLE1BQS9CLENBQXNDTCxlQUE3RCxJQUFnRixXQUFXSSw4QkFBOEIsQ0FBQ0MsTUFBL0IsQ0FBc0NMLGVBQXRJLEVBQXdKO0FBQ3ZKTyxRQUFBQSxtQkFBbUIsQ0FBQyxpQkFBRCxDQUFuQixHQUF5QyxLQUF6QztBQUNBLE9BbEM0SCxDQW9DN0g7OztBQUNBLFVBQUssZ0JBQWdCLE9BQU9ILDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ08sZUFBbEUsRUFBb0Y7QUFDbkZMLFFBQUFBLG1CQUFtQixDQUFDLFVBQUQsQ0FBbkIsR0FBa0N4QixDQUFDLENBQUM4QixHQUFGLENBQU9ULDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ08sZUFBdEMsQ0FBc0RFLEtBQXRELENBQTZELEdBQTdELENBQVAsRUFBMkUvQixDQUFDLENBQUNnQyxJQUE3RSxDQUFsQztBQUNBLE9BdkM0SCxDQXlDN0g7OztBQUNBLFVBQUssZ0JBQWdCLE9BQU9YLDhCQUE4QixDQUFDQyxNQUEvQixDQUFzQ1csVUFBN0QsSUFBMkUsU0FBU1osOEJBQThCLENBQUNDLE1BQS9CLENBQXNDVyxVQUEvSCxFQUE0STtBQUMzSUMsUUFBQUEsTUFBTSxDQUFDQyxXQUFQLENBQW9CWCxtQkFBcEI7QUFDQSxPQUZELE1BRU87QUFDTlksUUFBQUEsYUFBYSxDQUFDQyxJQUFkLENBQW9CYixtQkFBcEI7QUFDQTtBQUNEOztBQUVELFFBQUssZ0JBQWdCLE9BQU9yQiwyQkFBMkIsQ0FBQ21DLE9BQW5ELElBQThELFNBQVNuQywyQkFBMkIsQ0FBQ21DLE9BQTVCLENBQW9DZixPQUFoSCxFQUEwSDtBQUV6SDtBQUNBdkIsTUFBQUEsQ0FBQyxDQUFFLG9DQUFvQ3VDLFFBQVEsQ0FBQ0MsTUFBN0MsR0FBc0QsS0FBeEQsQ0FBRCxDQUFpRUMsS0FBakUsQ0FBd0UsWUFBVztBQUNsRi9CLFFBQUFBLHdCQUF3QixDQUFFLE9BQUYsRUFBVyxnQkFBWCxFQUE2QixPQUE3QixFQUFzQyxLQUFLZ0MsSUFBM0MsQ0FBeEI7QUFDQSxPQUZELEVBSHlILENBT3pIOztBQUNBMUMsTUFBQUEsQ0FBQyxDQUFFLG1CQUFGLENBQUQsQ0FBeUJ5QyxLQUF6QixDQUFnQyxZQUFXO0FBQzFDL0IsUUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXLE9BQVgsRUFBb0IsT0FBcEIsRUFBNkIsS0FBS2dDLElBQUwsQ0FBVUMsU0FBVixDQUFxQixDQUFyQixDQUE3QixDQUF4QjtBQUNBLE9BRkQsRUFSeUgsQ0FZekg7O0FBQ0EzQyxNQUFBQSxDQUFDLENBQUUsZ0JBQUYsQ0FBRCxDQUFzQnlDLEtBQXRCLENBQTZCLFlBQVc7QUFDdkMvQixRQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVcsV0FBWCxFQUF3QixNQUF4QixFQUFnQyxLQUFLZ0MsSUFBTCxDQUFVQyxTQUFWLENBQXFCLENBQXJCLENBQWhDLENBQXhCO0FBQ0EsT0FGRCxFQWJ5SCxDQWlCekg7O0FBQ0EzQyxNQUFBQSxDQUFDLENBQUUsa0VBQUYsQ0FBRCxDQUF3RXlDLEtBQXhFLENBQStFLFlBQVc7QUFFekY7QUFDQSxZQUFLLE9BQU90QywyQkFBMkIsQ0FBQ21DLE9BQTVCLENBQW9DTSxjQUFoRCxFQUFpRTtBQUNoRSxjQUFJQyxHQUFHLEdBQUcsS0FBS0gsSUFBZjtBQUNBLGNBQUlJLGFBQWEsR0FBRyxJQUFJQyxNQUFKLENBQVksU0FBUzVDLDJCQUEyQixDQUFDbUMsT0FBNUIsQ0FBb0NNLGNBQTdDLEdBQThELGNBQTFFLEVBQTBGLEdBQTFGLENBQXBCO0FBQ0EsY0FBSUksVUFBVSxHQUFHRixhQUFhLENBQUNHLElBQWQsQ0FBb0JKLEdBQXBCLENBQWpCOztBQUNBLGNBQUssU0FBU0csVUFBZCxFQUEyQjtBQUMxQixnQkFBSUUsc0JBQXNCLEdBQUcsSUFBSUgsTUFBSixDQUFXLFNBQVM1QywyQkFBMkIsQ0FBQ21DLE9BQTVCLENBQW9DTSxjQUE3QyxHQUE4RCxjQUF6RSxFQUF5RixHQUF6RixDQUE3QjtBQUNBLGdCQUFJTyxlQUFlLEdBQUdELHNCQUFzQixDQUFDRSxJQUF2QixDQUE2QlAsR0FBN0IsQ0FBdEI7QUFDQSxnQkFBSVEsU0FBUyxHQUFHLEVBQWhCOztBQUNBLGdCQUFLLFNBQVNGLGVBQWQsRUFBZ0M7QUFDL0JFLGNBQUFBLFNBQVMsR0FBR0YsZUFBZSxDQUFDLENBQUQsQ0FBM0I7QUFDQSxhQUZELE1BRU87QUFDTkUsY0FBQUEsU0FBUyxHQUFHRixlQUFaO0FBQ0EsYUFSeUIsQ0FTMUI7OztBQUNBekMsWUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXLFdBQVgsRUFBd0IyQyxTQUF4QixFQUFtQyxLQUFLWCxJQUF4QyxDQUF4QjtBQUNBO0FBQ0Q7QUFDRCxPQXBCRDtBQXFCQTs7QUFFRCxRQUFLLGdCQUFnQixPQUFPdkMsMkJBQTJCLENBQUNtRCxTQUFuRCxJQUFnRSxTQUFTbkQsMkJBQTJCLENBQUNtRCxTQUE1QixDQUFzQy9CLE9BQXBILEVBQThIO0FBQzdIO0FBQ0F2QixNQUFBQSxDQUFDLENBQUUsR0FBRixDQUFELENBQVN5QyxLQUFULENBQWdCLFlBQVc7QUFFMUI7QUFDQSxZQUFLLE9BQU90QywyQkFBMkIsQ0FBQ21ELFNBQTVCLENBQXNDQyxlQUFsRCxFQUFvRTtBQUNuRSxjQUFJQyxjQUFjLEdBQUcsSUFBSVQsTUFBSixDQUFZLFNBQVM1QywyQkFBMkIsQ0FBQ21ELFNBQTVCLENBQXNDQyxlQUEvQyxHQUFpRSxjQUE3RSxFQUE2RixHQUE3RixDQUFyQjtBQUNBLGNBQUlFLFdBQVcsR0FBR0QsY0FBYyxDQUFDUCxJQUFmLENBQXFCSixHQUFyQixDQUFsQjs7QUFDQSxjQUFLLFNBQVNZLFdBQWQsRUFBNEI7QUFDM0IvQyxZQUFBQSx3QkFBd0IsQ0FBRSxPQUFGLEVBQVcsV0FBWCxFQUF3QixPQUF4QixFQUFpQyxLQUFLZ0MsSUFBdEMsQ0FBeEI7QUFDQTtBQUNEO0FBRUQsT0FYRDtBQVlBLEtBL0drQyxDQWlIbkM7QUFDQTs7O0FBQ0EsUUFBSyxnQkFBZ0IsT0FBT3ZDLDJCQUEyQixDQUFDdUQsUUFBbkQsSUFBK0QsU0FBU3ZELDJCQUEyQixDQUFDdUQsUUFBNUIsQ0FBcUNuQyxPQUFsSCxFQUE0SDtBQUMzSG9DLE1BQUFBLE1BQU0sQ0FBQ0MsWUFBUCxHQUFzQixVQUFTQyxLQUFULEVBQWdCO0FBQ3JDLFlBQUlDLFlBQVksR0FBR0MsUUFBUSxDQUFDQyxRQUFULEdBQW9CRCxRQUFRLENBQUNFLE1BQTdCLEdBQXNDRixRQUFRLENBQUNHLElBQWxFOztBQUNBLFlBQUssV0FBV2hFLE9BQWhCLEVBQTBCO0FBQ3pCRyxVQUFBQSxJQUFJLENBQUMsS0FBRCxFQUFRLFdBQVIsRUFBcUJ5RCxZQUFyQixDQUFKO0FBQ0F6RCxVQUFBQSxJQUFJLENBQUMsT0FBRCxFQUFVLFdBQVYsQ0FBSjtBQUNBLFNBSEQsTUFHTyxJQUFLLFNBQVNILE9BQWQsRUFBd0I7QUFDOUJJLFVBQUFBLEVBQUUsQ0FBRSxNQUFGLEVBQVUsVUFBVixFQUFzQndELFlBQXRCLENBQUY7QUFDQTtBQUNELE9BUkQ7QUFTQSxLQTdIa0MsQ0ErSG5DOzs7QUFDQTlELElBQUFBLENBQUMsQ0FBRSw2Q0FBRixDQUFELENBQW1EbUUsRUFBbkQsQ0FBdUQsT0FBdkQsRUFBZ0UsWUFBVztBQUMxRSxVQUFJQyxJQUFJLEdBQUdwRSxDQUFDLENBQUUsSUFBRixDQUFELENBQVVxRSxPQUFWLENBQW1CLFlBQW5CLENBQVg7QUFDQXJFLE1BQUFBLENBQUMsQ0FBRW9FLElBQUYsQ0FBRCxDQUFVRSxJQUFWLENBQWdCLFFBQWhCLEVBQTBCLElBQTFCO0FBQ0EsS0FIRCxFQWhJbUMsQ0FxSW5DOztBQUNBLFFBQUssZ0JBQWdCLE9BQU9uRSwyQkFBMkIsQ0FBQ29FLGdCQUFuRCxJQUF1RSxTQUFTcEUsMkJBQTJCLENBQUNvRSxnQkFBNUIsQ0FBNkNoRCxPQUFsSSxFQUE0STtBQUMzSXZCLE1BQUFBLENBQUMsQ0FBRSxNQUFGLENBQUQsQ0FBWXdFLE1BQVosQ0FBb0IsVUFBVUMsQ0FBVixFQUFjO0FBQ2pDLFlBQUlDLE1BQU0sR0FBRzFFLENBQUMsQ0FBRSxJQUFGLENBQUQsQ0FBVXNFLElBQVYsQ0FBZ0IsUUFBaEIsS0FBOEJ0RSxDQUFDLENBQUUsNkNBQUYsQ0FBRCxDQUFtRDJFLEdBQW5ELENBQXdELENBQXhELENBQTNDO0FBQ0EsWUFBSTlELFFBQVEsR0FBR2IsQ0FBQyxDQUFFMEUsTUFBRixDQUFELENBQVlKLElBQVosQ0FBa0IsYUFBbEIsS0FBcUMsTUFBcEQ7QUFDQSxZQUFJeEQsTUFBTSxHQUFHZCxDQUFDLENBQUUwRSxNQUFGLENBQUQsQ0FBWUosSUFBWixDQUFrQixXQUFsQixLQUFtQyxRQUFoRDtBQUNBLFlBQUl2RCxLQUFLLEdBQUdmLENBQUMsQ0FBRTBFLE1BQUYsQ0FBRCxDQUFZSixJQUFaLENBQWtCLFVBQWxCLEtBQWtDdEUsQ0FBQyxDQUFFMEUsTUFBRixDQUFELENBQVlFLElBQVosRUFBbEMsSUFBd0RGLE1BQU0sQ0FBQzFELEtBQS9ELElBQXdFMEQsTUFBTSxDQUFDRyxJQUEzRjtBQUNBbkUsUUFBQUEsd0JBQXdCLENBQUUsT0FBRixFQUFXRyxRQUFYLEVBQXFCQyxNQUFyQixFQUE2QkMsS0FBN0IsQ0FBeEI7QUFDQSxPQU5EO0FBT0E7QUFDRDs7QUFFRGYsRUFBQUEsQ0FBQyxDQUFFdUMsUUFBRixDQUFELENBQWN1QyxLQUFkLENBQXFCLFlBQVc7QUFDL0IxRCxJQUFBQSx3QkFBd0I7QUFDeEIsR0FGRDtBQUlBLENBblBELEVBbVBLYyxNQW5QTCIsImZpbGUiOiJ3cC1hbmFseXRpY3MtdHJhY2tpbmctZ2VuZXJhdG9yLWZyb250LWVuZC5qcyIsInNvdXJjZXNDb250ZW50IjpbIiggZnVuY3Rpb24oICQgKSB7XG5cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKSB7XG5cdFx0dmFyIHZlcnNpb24gPSAnJztcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICYmICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICkge1xuXHRcdFx0aWYgKCAnZ3RhZ2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBndGFnICkge1xuXHRcdFx0XHR2ZXJzaW9uID0gJ2d0YWcnO1xuXHRcdFx0fSBlbHNlIGlmICggJ2FuYWx5dGljc2pzJyA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdFx0dmVyc2lvbiA9ICdnYSc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2ZXJzaW9uO1xuXHR9XG5cblx0Lypcblx0ICogY2FsbCBob29rcyBmcm9tIG90aGVyIHBsdWdpbnMgb3IgdGhlbWVzXG5cdCAqXG5cdCovXG5cdGlmICggdHlwZW9mIHdwICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHR3cC5ob29rcy5hZGRBY3Rpb24oICd3cEFuYWx5dGljc1RyYWNraW5nR2VuZXJhdG9yRXZlbnQnLCAnd3BBbmFseXRpY3NUcmFja2luZ0dlbmVyYXRvcicsIHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCwgMTAgKTtcblx0XHR3cC5ob29rcy5hZGRBY3Rpb24oICd3cEFuYWx5dGljc1RyYWNraW5nR2VuZXJhdG9yRWNvbW1lcmNlQWN0aW9uJywgJ3dwQW5hbHl0aWNzVHJhY2tpbmdHZW5lcmF0b3InLCB3cEFuYWx5dGljc1RyYWNraW5nRWNvbW1lcmNlQWN0aW9uLCAxMCApO1xuXHR9XG5cblx0Lypcblx0ICogQ3JlYXRlIGEgR29vZ2xlIEFuYWx5dGljcyBldmVudFxuXHQgKiBjYXRlZ29yeTogRXZlbnQgQ2F0ZWdvcnlcblx0ICogbGFiZWw6IEV2ZW50IExhYmVsXG5cdCAqIGFjdGlvbjogRXZlbnQgQWN0aW9uXG5cdCAqIHZhbHVlOiBvcHRpb25hbFxuXHQqL1xuXHRmdW5jdGlvbiB3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSwgbm9uX2ludGVyYWN0aW9uICkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKTtcblx0XHRpZiAoICdndGFnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdC8vIFNlbmRzIHRoZSBldmVudCB0byB0aGUgR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoXG5cdFx0XHQvLyB0cmFja2luZyBJRCBHQV9NRUFTVVJFTUVOVF9JRCBzZXQgYnkgdGhlIGNvbmZpZyBjb21tYW5kIGluXG5cdFx0XHQvLyB0aGUgZ2xvYmFsIHRyYWNraW5nIHNuaXBwZXQuXG5cdFx0XHQvLyBleGFtcGxlOiBndGFnKCdldmVudCcsICdwbGF5JywgeyAnZXZlbnRfY2F0ZWdvcnknOiAnVmlkZW9zJywgJ2V2ZW50X2xhYmVsJzogJ0ZhbGwgQ2FtcGFpZ24nIH0pO1xuXHRcdFx0dmFyIHBhcmFtcyA9IHtcblx0XHRcdFx0J2V2ZW50X2NhdGVnb3J5JzogY2F0ZWdvcnksXG5cdFx0XHRcdCdldmVudF9sYWJlbCc6IGxhYmVsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHZhbHVlICkge1xuXHRcdFx0XHRwYXJhbXMudmFsdWUgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdHBhcmFtcy5ub25faW50ZXJhY3Rpb24gPSBub25faW50ZXJhY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRndGFnKCB0eXBlLCBhY3Rpb24sIHBhcmFtcyApO1xuXHRcdH0gZWxzZSBpZiAoICdnYScgPT09IHZlcnNpb24gKSB7XG5cdFx0XHQvLyBVc2VzIHRoZSBkZWZhdWx0IHRyYWNrZXIgdG8gc2VuZCB0aGUgZXZlbnQgdG8gdGhlXG5cdFx0XHQvLyBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGggdHJhY2tpbmcgSUQgR0FfTUVBU1VSRU1FTlRfSUQuXG5cdFx0XHQvLyBleGFtcGxlOiBnYSgnc2VuZCcsICdldmVudCcsICdWaWRlb3MnLCAncGxheScsICdGYWxsIENhbXBhaWduJyk7XG5cdFx0XHQvLyBub25pbnRlcmFjdGlvbiBzZWVtcyB0byBoYXZlIGJlZW4gd29ya2luZyBsaWtlIHRoaXMgaW4gYW5hbHl0aWNzLmpzLlxuXHRcdFx0aWYgKCBub25faW50ZXJhY3Rpb24gPT0gMSApIHtcblx0XHRcdFx0dmFsdWUgPSB7ICdub25JbnRlcmFjdGlvbic6IDEgfTtcblx0XHRcdH1cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiB2YWx1ZSApIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qXG5cdCAqIENyZWF0ZSBhIEdvb2dsZSBBbmFseXRpY3MgRWNvbW1lcmNlIGFjdGlvblxuXHQgKiBcblx0Ki9cblx0ZnVuY3Rpb24gd3BBbmFseXRpY3NUcmFja2luZ0Vjb21tZXJjZUFjdGlvbiggdHlwZSwgYWN0aW9uLCBwcm9kdWN0ICkge1xuXHRcdHZhciB2ZXJzaW9uID0gd3BBbmFseXRpY3NDaGVja0FuYWx5dGljc1ZlcnNpb24oKTtcblx0XHRpZiAoICdndGFnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdGd0YWcoIHR5cGUsIGFjdGlvbiwge1xuXHRcdFx0XHRcIml0ZW1zXCI6IFtcblx0XHRcdFx0XHRwcm9kdWN0XG5cdFx0XHRcdF1cblx0XHRcdH0gKTtcblx0XHR9IGVsc2UgaWYgKCAnZ2EnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0Z2EoICdyZXF1aXJlJywgJ2VjJyApO1xuXHRcdFx0Z2EoICdlYzphZGRQcm9kdWN0JywgcHJvZHVjdCApO1xuXHRcdFx0c3dpdGNoKCBhY3Rpb24pIHtcblx0XHRcdFx0Y2FzZSAnYWRkX3RvX2NhcnQnOlxuXHRcdFx0XHRcdGdhKCdlYzpzZXRBY3Rpb24nLCAnYWRkJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdiZWdpbl9jaGVja291dCc6XG5cdFx0XHRcdFx0Z2EoICdlYzpzZXRBY3Rpb24nLCAnY2hlY2tvdXQnLCB7XG5cdFx0XHRcdFx0XHQnc3RlcCc6IDEsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHQgIC8vIGNvZGUgYmxvY2tcblx0XHRcdCAgfVxuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHdwQW5hbHl0aWNzVHJhY2tpbmdTZXR1cCgpIHtcblx0XHR2YXIgdmVyc2lvbiA9IHdwQW5hbHl0aWNzQ2hlY2tBbmFseXRpY3NWZXJzaW9uKCk7XG5cdFx0aWYgKCAnJyA9PT0gdmVyc2lvbiApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBzZXR0aW5ncyBmb3IgU2Nyb2xsRGVwdGggcGx1Z2luXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5lbmFibGVkICkge1xuXHRcdFx0dmFyIHNjcm9sbERlcHRoU2V0dGluZ3MgPSBbXTtcblx0XHRcdC8vIHRoaXMgbmVlZHMgdG8gYmUgdHJ1ZSwgcmVnYXJkbGVzcywgYmVjYXVzZSBvdGhlcndpc2UgdGhlIGFzc3VtcHRpb24gaXMgdGhhdCB0aGUgdHJhY2tpbmcgaXMgZGVmaW5lZCBpbiBHb29nbGUgVGFnIE1hbmFnZXIuXG5cdFx0XHQvLyB0b2RvOiBpdCBtaWdodCBiZSB3b3J0aCBidWlsZGluZyBhIHNldHRpbmcgZm9yIHRoaXMuXG5cdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydndG1PdmVycmlkZSddID0gdHJ1ZTtcblxuXHRcdFx0Ly8gaWYgd2UncmUgdXNpbmcgZ2EsIHdlIG5lZWQgdG8gdGVsbCB0aGUgcGx1Z2luXG5cdFx0XHRpZiAoICdndGFnJyAhPT0gdmVyc2lvbiApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ2FHbG9iYWwnXSA9ICdnYSc7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbHVlIGlzIGEgc3RyaW5nXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCAmJiAnMCcgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ21pbmltdW1faGVpZ2h0J10gPSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnBlcmNlbnRhZ2UgJiYgJ3RydWUnICE9PSBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnBlcmNlbnRhZ2UgKSB7XG5cdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3BlcmNlbnRhZ2UnXSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sndXNlcl90aW1pbmcnXSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnBpeGVsX2RlcHRoICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGl4ZWxfZGVwdGgnXSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLm5vbl9pbnRlcmFjdGlvbiAmJiAndHJ1ZScgIT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydub25faW50ZXJhY3Rpb24nXSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB2YWx1ZSBpcyBhbiBhcnJheS4gZGVmYXVsdCBpcyBlbXB0eS5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cyApIHtcblx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZWxlbWVudHMnXSA9ICQubWFwKCBhbmFseXRpY3Nfc2Nyb2xsZGVwdGhfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cy5zcGxpdCggJywnICksICQudHJpbSApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzZW5kIHNjcm9sbCBzZXR0aW5ncyB0byB0aGUgc2Nyb2xsZGVwdGggcGx1Z2luXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3Njcm9sbGRlcHRoX3NldHRpbmdzLnNjcm9sbC51c2VfanF1ZXJ5ICYmIHRydWUgPT09IGFuYWx5dGljc19zY3JvbGxkZXB0aF9zZXR0aW5ncy5zY3JvbGwudXNlX2pxdWVyeSApIHtcblx0XHRcdFx0alF1ZXJ5LnNjcm9sbERlcHRoKCBzY3JvbGxEZXB0aFNldHRpbmdzICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnYXNjcm9sbGRlcHRoLmluaXQoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZW5hYmxlZCApIHtcblxuXHRcdFx0Ly8gZXh0ZXJuYWwgbGlua3Ncblx0XHRcdCQoICdhW2hyZWZePVwiaHR0cFwiXTpub3QoW2hyZWYqPVwiOi8vJyArIGRvY3VtZW50LmRvbWFpbiArICdcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCAnT3V0Ym91bmQgbGlua3MnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBtYWlsdG8gbGlua3Ncblx0XHRcdCQoICdhW2hyZWZePVwibWFpbHRvXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCAnTWFpbHMnLCAnQ2xpY2snLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyB0ZWwgbGlua3Ncblx0XHRcdCQoICdhW2hyZWZePVwidGVsXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCAnVGVsZXBob25lJywgJ0NhbGwnLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBpbnRlcm5hbCBsaW5rc1xuXHRcdFx0JCggJ2E6bm90KFtocmVmXj1cIihodHRwOnxodHRwczopPy8vXCJdLFtocmVmXj1cIiNcIl0sW2hyZWZePVwibWFpbHRvOlwiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdC8vIHRyYWNrIGRvd25sb2Fkc1xuXHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCApIHtcblx0XHRcdFx0XHR2YXIgdXJsID0gdGhpcy5ocmVmO1xuXHRcdFx0XHRcdHZhciBjaGVja0Rvd25sb2FkID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0dmFyIGlzRG93bmxvYWQgPSBjaGVja0Rvd25sb2FkLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNEb3dubG9hZCApIHtcblx0XHRcdFx0XHRcdHZhciBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uID0gbmV3IFJlZ0V4cChcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIpO1xuXHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvblJlc3VsdCA9IGNoZWNrRG93bmxvYWRFeHRlbnNpb24uZXhlYyggdXJsICk7XG5cdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uID0gJyc7XG5cdFx0XHRcdFx0XHRpZiAoIG51bGwgIT09IGV4dGVuc2lvblJlc3VsdCApIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0WzFdO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gd2UgY2FuJ3QgdXNlIHRoZSB1cmwgZm9yIHRoZSB2YWx1ZSBoZXJlLCBldmVuIHRob3VnaCB0aGF0IHdvdWxkIGJlIG5pY2UsIGJlY2F1c2UgdmFsdWUgaXMgc3VwcG9zZWQgdG8gYmUgYW4gaW50ZWdlclxuXHRcdFx0XHRcdFx0d3BBbmFseXRpY3NUcmFja2luZ0V2ZW50KCAnZXZlbnQnLCAnRG93bmxvYWRzJywgZXh0ZW5zaW9uLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuZW5hYmxlZCApIHtcblx0XHRcdC8vIGFueSBsaW5rIGNvdWxkIGJlIGFuIGFmZmlsaWF0ZSwgaSBndWVzcz9cblx0XHRcdCQoICdhJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHQvLyB0cmFjayBhZmZpbGlhdGVzXG5cdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICkge1xuXHRcdFx0XHRcdHZhciBjaGVja0FmZmlsaWF0ZSA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdHZhciBpc0FmZmlsaWF0ZSA9IGNoZWNrQWZmaWxpYXRlLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNBZmZpbGlhdGUgKSB7XG5cdFx0XHRcdFx0XHR3cEFuYWx5dGljc1RyYWNraW5nRXZlbnQoICdldmVudCcsICdBZmZpbGlhdGUnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gbGluayBmcmFnbWVudHMgYXMgcGFnZXZpZXdzXG5cdFx0Ly8gZG9lcyBub3QgdXNlIHRoZSBldmVudCB0cmFja2luZyBtZXRob2Q7IGZsYWdzIGEgcGFnZXZpZXcgaW5zdGVhZC5cblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50ICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudC5lbmFibGVkICkge1xuXHRcdFx0d2luZG93Lm9uaGFzaGNoYW5nZSA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdFx0XHRcdHZhciBmcmFnbWVudF91cmwgPSBsb2NhdGlvbi5wYXRobmFtZSArIGxvY2F0aW9uLnNlYXJjaCArIGxvY2F0aW9uLmhhc2g7XG5cdFx0XHRcdGlmICggJ2d0YWcnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0XHRcdGd0YWcoJ3NldCcsICdwYWdlX3BhdGgnLCBmcmFnbWVudF91cmwpO1xuXHRcdFx0XHRcdGd0YWcoJ2V2ZW50JywgJ3BhZ2VfdmlldycpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCAnZ2EnID09PSB2ZXJzaW9uICkge1xuXHRcdFx0XHRcdGdhKCAnc2VuZCcsICdwYWdldmlldycsIGZyYWdtZW50X3VybCApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gd2hlbiBhIGJ1dHRvbiBpcyBjbGlja2VkLCBhdHRhY2ggaXQgdG8gdGhlIGZvcm0ncyBkYXRhXG5cdFx0JCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLm9uKCAnY2xpY2snLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBmb3JtID0gJCggdGhpcyApLnBhcmVudHMoICdmb3JtOmZpcnN0JyApO1xuXHRcdFx0JCggZm9ybSApLmRhdGEoICdidXR0b24nLCB0aGlzICk7XG5cdFx0fSk7XG5cblx0XHQvLyBiYXNpYyBmb3JtIHN1Ym1pdHMuIHRyYWNrIHN1Ym1pdCBpbnN0ZWFkIG9mIGNsaWNrIGJlY2F1c2Ugb3RoZXJ3aXNlIGl0J3Mgd2VpcmQuXG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mb3JtX3N1Ym1pc3Npb25zICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mb3JtX3N1Ym1pc3Npb25zLmVuYWJsZWQgKSB7XG5cdFx0XHQkKCAnZm9ybScgKS5zdWJtaXQoIGZ1bmN0aW9uKCBmICkge1xuXHRcdFx0XHR2YXIgYnV0dG9uID0gJCggdGhpcyApLmRhdGEoICdidXR0b24nICkgfHwgJCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLmdldCggMCApO1xuXHRcdFx0XHR2YXIgY2F0ZWdvcnkgPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtY2F0ZWdvcnknICkgfHwgJ0Zvcm0nO1xuXHRcdFx0XHR2YXIgYWN0aW9uID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWFjdGlvbicgKSB8fCAnU3VibWl0Jztcblx0XHRcdFx0dmFyIGxhYmVsID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWxhYmVsJyApIHx8ICQoIGJ1dHRvbiApLnRleHQoKSB8fCBidXR0b24udmFsdWUgfHwgYnV0dG9uLm5hbWU7XG5cdFx0XHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdFdmVudCggJ2V2ZW50JywgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdCQoIGRvY3VtZW50ICkucmVhZHkoIGZ1bmN0aW9uKCkge1xuXHRcdHdwQW5hbHl0aWNzVHJhY2tpbmdTZXR1cCgpO1xuXHR9KTtcblxufSApKCBqUXVlcnkgKTtcbiJdfQ==
