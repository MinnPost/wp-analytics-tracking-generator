// ===============================================
// AdBlock detector
//
// Attempts to detect the presence of Ad Blocker software and notify listener of its existence.
// Copyright (c) 2017 IAB
//
// The BSD-3 License
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
// ===============================================

/**
* @name window.adblockDetector
*
* IAB Adblock detector.
* Usage: window.adblockDetector.init(options);
*
* Options object settings
*
*	@prop debug:  boolean
*         Flag to indicate additional debug output should be printed to console
*
*	@prop found: @function
*         Callback function to fire if adblock is detected
*
*	@prop notfound: @function
*         Callback function to fire if adblock is not detected.
*         NOTE: this function may fire multiple times and give false negative
*         responses during a test until adblock is successfully detected.
*
*	@prop complete: @function
*         Callback function to fire once a round of testing is complete.
*         The test result (boolean) is included as a parameter to callback
*
* example: 	window.adblockDetector.init(
				{
					found: function(){ ...},
 					notFound: function(){...}
				}
			);
*
*
*/
"use strict";

(function (win) {
  var version = '1.0';
  var ofs = 'offset',
      cl = 'client';

  var noop = function noop() {};

  var testedOnce = false;
  var testExecuting = false;
  var isOldIEevents = win.addEventListener === undefined;
  /**
  * Options set with default options initialized
  *
  */

  var _options = {
    loopDelay: 50,
    maxLoop: 5,
    debug: true,
    found: noop,
    // function to fire when adblock detected
    notfound: noop,
    // function to fire if adblock not detected after testing
    complete: noop // function to fire after testing completes, passing result as parameter

  };

  function parseAsJson(data) {
    var result, fnData;

    try {
      result = JSON.parse(data);
    } catch (ex) {
      try {
        fnData = new Function("return " + data);
        result = fnData();
      } catch (ex) {
        log('Failed secondary JSON parse', true);
      }
    }

    return result;
  }
  /**
  * Ajax helper object to download external scripts.
  * Initialize object with an options object
  * Ex:
    {
  	  url : 'http://example.org/url_to_download',
  	  method: 'POST|GET',
  	  success: callback_function,
  	  fail:  callback_function
    }
  */


  var AjaxHelper = function AjaxHelper(opts) {
    var xhr = new XMLHttpRequest();
    this.success = opts.success || noop;
    this.fail = opts.fail || noop;
    var me = this;
    var method = opts.method || 'get';
    /**
    * Abort the request
    */

    this.abort = function () {
      try {
        xhr.abort();
      } catch (ex) {}
    };

    function stateChange(vals) {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          me.success(xhr.response);
        } else {
          // failed
          me.fail(xhr.status);
        }
      }
    }

    xhr.onreadystatechange = stateChange;

    function start() {
      xhr.open(method, opts.url, true);
      xhr.send();
    }

    start();
  };
  /**
  * Object tracking the various block lists
  */


  var BlockListTracker = function BlockListTracker() {
    var me = this;
    var externalBlocklistData = {};
    /**
    * Add a new external URL to track
    */

    this.addUrl = function (url) {
      externalBlocklistData[url] = {
        url: url,
        state: 'pending',
        format: null,
        data: null,
        result: null
      };
      return externalBlocklistData[url];
    };
    /**
    * Loads a block list definition
    */


    this.setResult = function (urlKey, state, data) {
      var obj = externalBlocklistData[urlKey];

      if (obj == null) {
        obj = this.addUrl(urlKey);
      }

      obj.state = state;

      if (data == null) {
        obj.result = null;
        return;
      }

      if (typeof data === 'string') {
        try {
          data = parseAsJson(data);
          obj.format = 'json';
        } catch (ex) {
          obj.format = 'easylist'; // parseEasyList(data);
        }
      }

      obj.data = data;
      return obj;
    };
  };

  var listeners = []; // event response listeners

  var baitNode = null;
  var quickBait = {
    cssClass: 'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links'
  };
  var baitTriggers = {
    nullProps: [ofs + 'Parent'],
    zeroProps: []
  };
  baitTriggers.zeroProps = [ofs + 'Height', ofs + 'Left', ofs + 'Top', ofs + 'Width', ofs + 'Height', cl + 'Height', cl + 'Width']; // result object

  var exeResult = {
    quick: null,
    remote: null
  };
  var findResult = null; // result of test for ad blocker

  var timerIds = {
    test: 0,
    download: 0
  };

  function isFunc(fn) {
    return typeof fn == 'function';
  }
  /**
  * Make a DOM element
  */


  function makeEl(tag, attributes) {
    var k,
        v,
        el,
        attr = attributes;
    var d = document;
    el = d.createElement(tag);

    if (attr) {
      for (k in attr) {
        if (attr.hasOwnProperty(k)) {
          el.setAttribute(k, attr[k]);
        }
      }
    }

    return el;
  }

  function attachEventListener(dom, eventName, handler) {
    if (isOldIEevents) {
      dom.attachEvent('on' + eventName, handler);
    } else {
      dom.addEventListener(eventName, handler, false);
    }
  }

  function log(message, isError) {
    if (!_options.debug && !isError) {
      return;
    }

    if (win.console && win.console.log) {
      if (isError) {
        console.error('[ABD] ' + message);
      } else {
        console.log('[ABD] ' + message);
      }
    }
  }

  var ajaxDownloads = [];
  /**
  * Load and execute the URL inside a closure function
  */

  function loadExecuteUrl(url) {
    var ajax, result;
    blockLists.addUrl(url); // setup call for remote list

    ajax = new AjaxHelper({
      url: url,
      success: function success(data) {
        log('downloaded file ' + url); // todo - parse and store until use

        result = blockLists.setResult(url, 'success', data);

        try {
          var intervalId = 0,
              retryCount = 0;

          var tryExecuteTest = function tryExecuteTest(listData) {
            if (!testExecuting) {
              beginTest(listData, true);
              return true;
            }

            return false;
          };

          if (findResult == true) {
            return;
          }

          if (tryExecuteTest(result.data)) {
            return;
          } else {
            log('Pause before test execution');
            intervalId = setInterval(function () {
              if (tryExecuteTest(result.data) || retryCount++ > 5) {
                clearInterval(intervalId);
              }
            }, 250);
          }
        } catch (ex) {
          log(ex.message + ' url: ' + url, true);
        }
      },
      fail: function fail(status) {
        log(status, true);
        blockLists.setResult(url, 'error', null);
      }
    });
    ajaxDownloads.push(ajax);
  }
  /**
  * Fetch the external lists and initiate the tests
  */


  function fetchRemoteLists() {
    var i, url;
    var opts = _options;

    for (i = 0; i < opts.blockLists.length; i++) {
      url = opts.blockLists[i];
      loadExecuteUrl(url);
    }
  }

  function cancelRemoteDownloads() {
    var i, aj;

    for (i = ajaxDownloads.length - 1; i >= 0; i--) {
      aj = ajaxDownloads.pop();
      aj.abort();
    }
  } // =============================================================================

  /**
  * Begin execution of the test
  */


  function beginTest(bait) {
    log('start beginTest');

    if (findResult == true) {
      return; // we found it. don't continue executing
    }

    testExecuting = true;
    castBait(bait);
    exeResult.quick = 'testing';
    timerIds.test = setTimeout(function () {
      reelIn(bait, 1);
    }, 5);
  }
  /**
  * Create the bait node to see how the browser page reacts
  */


  function castBait(bait) {
    var i,
        d = document,
        b = d.body;
    var t;
    var baitStyle = 'width: 1px !important; height: 1px !important; position: absolute !important; left: -10000px !important; top: -1000px !important;';

    if (bait == null || typeof bait == 'string') {
      log('invalid bait being cast');
      return;
    }

    if (bait.style != null) {
      baitStyle += bait.style;
    }

    baitNode = makeEl('div', {
      'class': bait.cssClass,
      'style': baitStyle
    });
    log('adding bait node to DOM');
    b.appendChild(baitNode); // touch these properties

    for (i = 0; i < baitTriggers.nullProps.length; i++) {
      t = baitNode[baitTriggers.nullProps[i]];
    }

    for (i = 0; i < baitTriggers.zeroProps.length; i++) {
      t = baitNode[baitTriggers.zeroProps[i]];
    }
  }
  /**
  * Run tests to see if browser has taken the bait and blocked the bait element
  */


  function reelIn(bait, attemptNum) {
    var i, k, v;
    var body = document.body;
    var found = false;

    if (baitNode == null) {
      log('recast bait');
      castBait(bait || quickBait);
    }

    if (typeof bait == 'string') {
      log('invalid bait used', true);

      if (clearBaitNode()) {
        setTimeout(function () {
          testExecuting = false;
        }, 5);
      }

      return;
    }

    if (timerIds.test > 0) {
      clearTimeout(timerIds.test);
      timerIds.test = 0;
    } // test for issues


    if (body.getAttribute('abp') !== null) {
      log('found adblock body attribute');
      found = true;
    }

    for (i = 0; i < baitTriggers.nullProps.length; i++) {
      if (baitNode[baitTriggers.nullProps[i]] == null) {
        if (attemptNum > 4) found = true;
        log('found adblock null attr: ' + baitTriggers.nullProps[i]);
        break;
      }

      if (found == true) {
        break;
      }
    }

    for (i = 0; i < baitTriggers.zeroProps.length; i++) {
      if (found == true) {
        break;
      }

      if (baitNode[baitTriggers.zeroProps[i]] == 0) {
        if (attemptNum > 4) found = true;
        log('found adblock zero attr: ' + baitTriggers.zeroProps[i]);
      }
    }

    if (window.getComputedStyle !== undefined) {
      var baitTemp = window.getComputedStyle(baitNode, null);

      if (baitTemp.getPropertyValue('display') == 'none' || baitTemp.getPropertyValue('visibility') == 'hidden') {
        if (attemptNum > 4) found = true;
        log('found adblock computedStyle indicator');
      }
    }

    testedOnce = true;

    if (found || attemptNum++ >= _options.maxLoop) {
      findResult = found;
      log('exiting test loop - value: ' + findResult);
      notifyListeners();

      if (clearBaitNode()) {
        setTimeout(function () {
          testExecuting = false;
        }, 5);
      }
    } else {
      timerIds.test = setTimeout(function () {
        reelIn(bait, attemptNum);
      }, _options.loopDelay);
    }
  }

  function clearBaitNode() {
    if (baitNode === null) {
      return true;
    }

    try {
      if (isFunc(baitNode.remove)) {
        baitNode.remove();
      }

      document.body.removeChild(baitNode);
    } catch (ex) {}

    baitNode = null;
    return true;
  }
  /**
  * Halt the test and any pending timeouts
  */


  function stopFishing() {
    if (timerIds.test > 0) {
      clearTimeout(timerIds.test);
    }

    if (timerIds.download > 0) {
      clearTimeout(timerIds.download);
    }

    cancelRemoteDownloads();
    clearBaitNode();
  }
  /**
  * Fire all registered listeners
  */


  function notifyListeners() {
    var i, funcs;

    if (findResult === null) {
      return;
    }

    for (i = 0; i < listeners.length; i++) {
      funcs = listeners[i];

      try {
        if (funcs != null) {
          if (isFunc(funcs['complete'])) {
            funcs['complete'](findResult);
          }

          if (findResult && isFunc(funcs['found'])) {
            funcs['found']();
          } else if (findResult === false && isFunc(funcs['notfound'])) {
            funcs['notfound']();
          }
        }
      } catch (ex) {
        log('Failure in notify listeners ' + ex.Message, true);
      }
    }
  }
  /**
  * Attaches event listener or fires if events have already passed.
  */


  function attachOrFire() {
    var fireNow = false;
    var fn;

    if (document.readyState) {
      if (document.readyState == 'complete') {
        fireNow = true;
      }
    }

    fn = function fn() {
      beginTest(quickBait, false);
    };

    if (fireNow) {
      fn();
    } else {
      attachEventListener(win, 'load', fn);
    }
  }

  var blockLists; // tracks external block lists

  /**
  * Public interface of adblock detector
  */

  var impl = {
    /**
    * Version of the adblock detector package
    */
    version: version,

    /**
    * Initialization function. See comments at top for options object
    */
    init: function init(options) {
      var k, v, funcs;

      if (!options) {
        return;
      }

      funcs = {
        complete: noop,
        found: noop,
        notfound: noop
      };

      for (k in options) {
        if (options.hasOwnProperty(k)) {
          if (k == 'complete' || k == 'found' || k == 'notFound') {
            funcs[k.toLowerCase()] = options[k];
          } else {
            _options[k] = options[k];
          }
        }
      }

      listeners.push(funcs);
      blockLists = new BlockListTracker();
      attachOrFire();
    }
  };
  win['adblockDetector'] = impl;
})(window);
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/*!
 * @preserve
 * jquery.scrolldepth.js | v1.0
 * Copyright (c) 2016 Rob Flaherty (@robflaherty)
 * Licensed under the MIT and GPL licenses.
 */
!function (e) {
  "function" == typeof define && define.amd ? define(["jquery"], e) : "object" == (typeof module === "undefined" ? "undefined" : _typeof(module)) && module.exports ? module.exports = e(require("jquery")) : e(jQuery);
}(function (e) {
  "use strict";

  var n,
      t,
      r,
      o,
      i = {
    minHeight: 0,
    elements: [],
    percentage: !0,
    userTiming: !0,
    pixelDepth: !0,
    nonInteraction: !0,
    gaGlobal: !1,
    gtmOverride: !1,
    trackerName: !1,
    dataLayer: "dataLayer"
  },
      a = e(window),
      l = [],
      c = !1,
      u = 0;
  return e.scrollDepth = function (p) {
    function s(e, i, a, l) {
      var c = p.trackerName ? p.trackerName + ".send" : "send";
      o ? (o({
        event: "ScrollDistance",
        eventCategory: "Scroll Depth",
        eventAction: e,
        eventLabel: i,
        eventValue: 1,
        eventNonInteraction: p.nonInteraction
      }), p.pixelDepth && arguments.length > 2 && a > u && (u = a, o({
        event: "ScrollDistance",
        eventCategory: "Scroll Depth",
        eventAction: "Pixel Depth",
        eventLabel: d(a),
        eventValue: 1,
        eventNonInteraction: p.nonInteraction
      })), p.userTiming && arguments.length > 3 && o({
        event: "ScrollTiming",
        eventCategory: "Scroll Depth",
        eventAction: e,
        eventLabel: i,
        eventTiming: l
      })) : (n && (window[r](c, "event", "Scroll Depth", e, i, 1, {
        nonInteraction: p.nonInteraction
      }), p.pixelDepth && arguments.length > 2 && a > u && (u = a, window[r](c, "event", "Scroll Depth", "Pixel Depth", d(a), 1, {
        nonInteraction: p.nonInteraction
      })), p.userTiming && arguments.length > 3 && window[r](c, "timing", "Scroll Depth", e, l, i)), t && (_gaq.push(["_trackEvent", "Scroll Depth", e, i, 1, p.nonInteraction]), p.pixelDepth && arguments.length > 2 && a > u && (u = a, _gaq.push(["_trackEvent", "Scroll Depth", "Pixel Depth", d(a), 1, p.nonInteraction])), p.userTiming && arguments.length > 3 && _gaq.push(["_trackTiming", "Scroll Depth", e, l, i, 100])));
    }

    function h(e) {
      return {
        "25%": parseInt(.25 * e, 10),
        "50%": parseInt(.5 * e, 10),
        "75%": parseInt(.75 * e, 10),
        "100%": e - 5
      };
    }

    function g(n, t, r) {
      e.each(n, function (n, o) {
        -1 === e.inArray(n, l) && t >= o && (s("Percentage", n, t, r), l.push(n));
      });
    }

    function f(n, t, r) {
      e.each(n, function (n, o) {
        -1 === e.inArray(o, l) && e(o).length && t >= e(o).offset().top && (s("Elements", o, t, r), l.push(o));
      });
    }

    function d(e) {
      return (250 * Math.floor(e / 250)).toString();
    }

    function m() {
      y();
    }

    function v(e, n) {
      var t,
          r,
          o,
          i = null,
          a = 0,
          l = function l() {
        a = new Date(), i = null, o = e.apply(t, r);
      };

      return function () {
        var c = new Date();
        a || (a = c);
        var u = n - (c - a);
        return t = this, r = arguments, 0 >= u ? (clearTimeout(i), i = null, a = c, o = e.apply(t, r)) : i || (i = setTimeout(l, u)), o;
      };
    }

    function y() {
      c = !0, a.on("scroll.scrollDepth", v(function () {
        var n = e(document).height(),
            t = window.innerHeight ? window.innerHeight : a.height(),
            r = a.scrollTop() + t,
            o = h(n),
            i = +new Date() - D;
        return l.length >= p.elements.length + (p.percentage ? 4 : 0) ? (a.off("scroll.scrollDepth"), void (c = !1)) : (p.elements && f(p.elements, r, i), void (p.percentage && g(o, r, i)));
      }, 500));
    }

    var D = +new Date();
    p = e.extend({}, i, p), e(document).height() < p.minHeight || (p.gaGlobal ? (n = !0, r = p.gaGlobal) : "function" == typeof ga ? (n = !0, r = "ga") : "function" == typeof __gaTracker && (n = !0, r = "__gaTracker"), "undefined" != typeof _gaq && "function" == typeof _gaq.push && (t = !0), "function" == typeof p.eventHandler ? o = p.eventHandler : "undefined" == typeof window[p.dataLayer] || "function" != typeof window[p.dataLayer].push || p.gtmOverride || (o = function o(e) {
      window[p.dataLayer].push(e);
    }), e.scrollDepth.reset = function () {
      l = [], u = 0, a.off("scroll.scrollDepth"), y();
    }, e.scrollDepth.addElements = function (n) {
      "undefined" != typeof n && e.isArray(n) && (e.merge(p.elements, n), c || y());
    }, e.scrollDepth.removeElements = function (n) {
      "undefined" != typeof n && e.isArray(n) && e.each(n, function (n, t) {
        var r = e.inArray(t, p.elements),
            o = e.inArray(t, l);
        -1 != r && p.elements.splice(r, 1), -1 != o && l.splice(o, 1);
      });
    }, m());
  }, e.scrollDepth;
});
"use strict";

(function ($) {
  /*
   * Create a Google Analytics event
   * category: Event Category
   * label: Event Label
   * action: Event Action
   * value: optional
  */
  function wp_analytics_tracking_event(type, category, action, label, value) {
    if (typeof ga !== 'undefined') {
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
    if ('undefined' === typeof ga) {
      return;
    }

    var scrollDepthSettings = [];

    if ('undefined' !== typeof analytics_tracking_settings) {
      if ('undefined' !== typeof analytics_tracking_settings.scroll && true === analytics_tracking_settings.scroll.enabled) {
        // value is a string and a boolean
        if ('undefined' !== typeof analytics_tracking_settings.analytics_type && 'gtagjs' !== analytics_tracking_settings.analytics_type) {
          scrollDepthSettings['gtmOverride'] = true;
          scrollDepthSettings['gaGlobal'] = 'ga';
        } // value is a string


        if ('undefined' !== typeof analytics_tracking_settings.scroll.minimum_height && '0' !== analytics_tracking_settings.scroll.minimum_height) {
          scrollDepthSettings['minimum_height'] = analytics_tracking_settings.scroll.minimum_height;
        } // value is a boolean. default is true.


        if ('undefined' !== typeof analytics_tracking_settings.scroll.percentage && 'true' !== analytics_tracking_settings.scroll.percentage) {
          scrollDepthSettings['percentage'] = false;
        } // value is a boolean. default is true.


        if ('undefined' !== typeof analytics_tracking_settings.scroll.user_timing && 'true' !== analytics_tracking_settings.scroll.user_timing) {
          scrollDepthSettings['user_timing'] = false;
        } // value is a boolean. default is true.


        if ('undefined' !== typeof analytics_tracking_settings.scroll.pixel_depth && 'true' !== analytics_tracking_settings.scroll.user_timing) {
          scrollDepthSettings['pixel_depth'] = false;
        } // value is a boolean. default is true.


        if ('undefined' !== typeof analytics_tracking_settings.scroll.non_interaction && 'true' !== analytics_tracking_settings.scroll.non_interaction) {
          scrollDepthSettings['non_interaction'] = false;
        } // value is an array. default is empty.


        if ('undefined' !== typeof analytics_tracking_settings.scroll.scroll_elements) {
          scrollDepthSettings['elements'] = $.map(analytics_tracking_settings.scroll.scroll_elements.split(','), $.trim);
        } // send scroll settings to the scrolldepth plugin


        jQuery.scrollDepth(scrollDepthSettings);
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
    } else {
      console.log('no analytics_tracking_settings');
    }
  }

  $(document).ready(function () {
    wp_analytics_tracking_setup();

    if ('undefined' !== typeof analytics_tracking_settings.track_adblocker && true === analytics_tracking_settings.track_adblocker.enabled) {
      if (typeof window.adblockDetector === 'undefined') {
        wp_analytics_tracking_event('event', 'Adblock', 'On', {
          'nonInteraction': 1
        });
      } else {
        window.adblockDetector.init({
          debug: false,
          found: function found() {
            wp_analytics_tracking_event('event', 'Adblock', 'On', {
              'nonInteraction': 1
            });
          },
          notFound: function notFound() {
            wp_analytics_tracking_event('event', 'Adblock', 'Off', {
              'nonInteraction': 1
            });
          }
        });
      }
    }
  });
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFkYmxvY2tEZXRlY3Rvci5qcyIsImpxdWVyeS5zY3JvbGxkZXB0aC5taW4uanMiLCJ3cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwibiIsInIiLCJvIiwibWluSGVpZ2h0IiwiZWxlbWVudHMiLCJwZXJjZW50YWdlIiwidXNlclRpbWluZyIsInBpeGVsRGVwdGgiLCJub25JbnRlcmFjdGlvbiIsImdhR2xvYmFsIiwiZ3RtT3ZlcnJpZGUiLCJ0cmFja2VyTmFtZSIsImRhdGFMYXllciIsImEiLCJsIiwiYyIsInUiLCJzY3JvbGxEZXB0aCIsInAiLCJzIiwiZXZlbnQiLCJldmVudENhdGVnb3J5IiwiZXZlbnRBY3Rpb24iLCJldmVudExhYmVsIiwiZXZlbnRWYWx1ZSIsImV2ZW50Tm9uSW50ZXJhY3Rpb24iLCJhcmd1bWVudHMiLCJldmVudFRpbWluZyIsIl9nYXEiLCJoIiwicGFyc2VJbnQiLCJnIiwiZWFjaCIsImluQXJyYXkiLCJmIiwib2Zmc2V0IiwidG9wIiwiTWF0aCIsImZsb29yIiwidG9TdHJpbmciLCJtIiwieSIsIkRhdGUiLCJhcHBseSIsIm9uIiwiaGVpZ2h0IiwiaW5uZXJIZWlnaHQiLCJzY3JvbGxUb3AiLCJEIiwib2ZmIiwiZXh0ZW5kIiwiZ2EiLCJfX2dhVHJhY2tlciIsImV2ZW50SGFuZGxlciIsInJlc2V0IiwiYWRkRWxlbWVudHMiLCJpc0FycmF5IiwibWVyZ2UiLCJyZW1vdmVFbGVtZW50cyIsInNwbGljZSIsIiQiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwIiwic2Nyb2xsRGVwdGhTZXR0aW5ncyIsImFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyIsInNjcm9sbCIsImVuYWJsZWQiLCJhbmFseXRpY3NfdHlwZSIsIm1pbmltdW1faGVpZ2h0IiwidXNlcl90aW1pbmciLCJwaXhlbF9kZXB0aCIsIm5vbl9pbnRlcmFjdGlvbiIsInNjcm9sbF9lbGVtZW50cyIsIm1hcCIsInNwbGl0IiwidHJpbSIsInNwZWNpYWwiLCJkb21haW4iLCJjbGljayIsImhyZWYiLCJzdWJzdHJpbmciLCJkb3dubG9hZF9yZWdleCIsImNoZWNrRG93bmxvYWQiLCJSZWdFeHAiLCJpc0Rvd25sb2FkIiwiY2hlY2tEb3dubG9hZEV4dGVuc2lvbiIsImV4dGVuc2lvblJlc3VsdCIsImV4ZWMiLCJleHRlbnNpb24iLCJhZmZpbGlhdGUiLCJhZmZpbGlhdGVfcmVnZXgiLCJjaGVja0FmZmlsaWF0ZSIsImlzQWZmaWxpYXRlIiwiZnJhZ21lbnQiLCJvbmhhc2hjaGFuZ2UiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsImZvcm0iLCJwYXJlbnRzIiwiZm9ybV9zdWJtaXNzaW9ucyIsInN1Ym1pdCIsImJ1dHRvbiIsImdldCIsInRleHQiLCJuYW1lIiwicmVhZHkiLCJ0cmFja19hZGJsb2NrZXIiLCJhZGJsb2NrRGV0ZWN0b3IiLCJub3RGb3VuZCJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBaUNBOztBQUNBLENBQUMsVUFBU0EsR0FBVCxFQUFjO0FBRWQsTUFBSUMsT0FBTyxHQUFHLEtBQWQ7QUFFQSxNQUFJQyxHQUFHLEdBQUcsUUFBVjtBQUFBLE1BQW9CQyxFQUFFLEdBQUcsUUFBekI7O0FBQ0EsTUFBSUMsSUFBSSxHQUFHLFNBQVBBLElBQU8sR0FBVSxDQUFFLENBQXZCOztBQUVBLE1BQUlDLFVBQVUsR0FBRyxLQUFqQjtBQUNBLE1BQUlDLGFBQWEsR0FBRyxLQUFwQjtBQUVBLE1BQUlDLGFBQWEsR0FBSVAsR0FBRyxDQUFDUSxnQkFBSixLQUF5QkMsU0FBOUM7QUFFQTs7Ozs7QUFJQSxNQUFJQyxRQUFRLEdBQUc7QUFDZEMsSUFBQUEsU0FBUyxFQUFFLEVBREc7QUFFZEMsSUFBQUEsT0FBTyxFQUFFLENBRks7QUFHZEMsSUFBQUEsS0FBSyxFQUFFLElBSE87QUFJZEMsSUFBQUEsS0FBSyxFQUFFVixJQUpPO0FBSUk7QUFDbEJXLElBQUFBLFFBQVEsRUFBRVgsSUFMSTtBQUtNO0FBQ3BCWSxJQUFBQSxRQUFRLEVBQUVaLElBTkksQ0FNTTs7QUFOTixHQUFmOztBQVNBLFdBQVNhLFdBQVQsQ0FBcUJDLElBQXJCLEVBQTBCO0FBQ3pCLFFBQUlDLE1BQUosRUFBWUMsTUFBWjs7QUFD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O0FBT0E7QUFFRCxLQWpJRCxNQWlJTztBQUNOMUgsTUFBQUEsT0FBTyxDQUFDL0QsR0FBUixDQUFhLGdDQUFiO0FBQ0E7QUFDRDs7QUFFRG9MLEVBQUFBLENBQUMsQ0FBRWhJLFFBQUYsQ0FBRCxDQUFjb0wsS0FBZCxDQUFxQixZQUFXO0FBQy9CN0MsSUFBQUEsMkJBQTJCOztBQUMzQixRQUFLLGdCQUFnQixPQUFPRSwyQkFBMkIsQ0FBQzRDLGVBQW5ELElBQXNFLFNBQVM1QywyQkFBMkIsQ0FBQzRDLGVBQTVCLENBQTRDMUMsT0FBaEksRUFBMEk7QUFDekksVUFBSyxPQUFPOUYsTUFBTSxDQUFDeUksZUFBZCxLQUFrQyxXQUF2QyxFQUFxRDtBQUNwRHJELFFBQUFBLDJCQUEyQixDQUFFLE9BQUYsRUFBVyxTQUFYLEVBQXNCLElBQXRCLEVBQTRCO0FBQUUsNEJBQWtCO0FBQXBCLFNBQTVCLENBQTNCO0FBQ0EsT0FGRCxNQUVPO0FBQ05wRixRQUFBQSxNQUFNLENBQUN5SSxlQUFQLENBQXVCNUgsSUFBdkIsQ0FDQztBQUNDMUgsVUFBQUEsS0FBSyxFQUFFLEtBRFI7QUFFQ0MsVUFBQUEsS0FBSyxFQUFFLGlCQUFXO0FBQ2pCZ00sWUFBQUEsMkJBQTJCLENBQUUsT0FBRixFQUFXLFNBQVgsRUFBc0IsSUFBdEIsRUFBNEI7QUFBRSxnQ0FBa0I7QUFBcEIsYUFBNUIsQ0FBM0I7QUFDQSxXQUpGO0FBS0NzRCxVQUFBQSxRQUFRLEVBQUUsb0JBQVc7QUFDcEJ0RCxZQUFBQSwyQkFBMkIsQ0FBRSxPQUFGLEVBQVcsU0FBWCxFQUFzQixLQUF0QixFQUE2QjtBQUFFLGdDQUFrQjtBQUFwQixhQUE3QixDQUEzQjtBQUNBO0FBUEYsU0FERDtBQVdBO0FBQ0Q7QUFDRCxHQW5CRDtBQXFCQSxDQXJMRCxFQXFMSzlELE1BckxMIiwiZmlsZSI6IndwLWFuYWx5dGljcy10cmFja2luZy1nZW5lcmF0b3ItZnJvbnQtZW5kLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFkQmxvY2sgZGV0ZWN0b3Jcbi8vXG4vLyBBdHRlbXB0cyB0byBkZXRlY3QgdGhlIHByZXNlbmNlIG9mIEFkIEJsb2NrZXIgc29mdHdhcmUgYW5kIG5vdGlmeSBsaXN0ZW5lciBvZiBpdHMgZXhpc3RlbmNlLlxuLy8gQ29weXJpZ2h0IChjKSAyMDE3IElBQlxuLy9cbi8vIFRoZSBCU0QtMyBMaWNlbnNlXG4vLyBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4vLyAxLiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4vLyAyLiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4vLyAzLiBOZWl0aGVyIHRoZSBuYW1lIG9mIHRoZSBjb3B5cmlnaHQgaG9sZGVyIG5vciB0aGUgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHMgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4vLyBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUiBBTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTOyBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlQgKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVMgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiogQG5hbWUgd2luZG93LmFkYmxvY2tEZXRlY3RvclxuKlxuKiBJQUIgQWRibG9jayBkZXRlY3Rvci5cbiogVXNhZ2U6IHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChvcHRpb25zKTtcbipcbiogT3B0aW9ucyBvYmplY3Qgc2V0dGluZ3NcbipcbipcdEBwcm9wIGRlYnVnOiAgYm9vbGVhblxuKiAgICAgICAgIEZsYWcgdG8gaW5kaWNhdGUgYWRkaXRpb25hbCBkZWJ1ZyBvdXRwdXQgc2hvdWxkIGJlIHByaW50ZWQgdG8gY29uc29sZVxuKlxuKlx0QHByb3AgZm91bmQ6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBpcyBkZXRlY3RlZFxuKlxuKlx0QHByb3Agbm90Zm91bmQ6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBpcyBub3QgZGV0ZWN0ZWQuXG4qICAgICAgICAgTk9URTogdGhpcyBmdW5jdGlvbiBtYXkgZmlyZSBtdWx0aXBsZSB0aW1lcyBhbmQgZ2l2ZSBmYWxzZSBuZWdhdGl2ZVxuKiAgICAgICAgIHJlc3BvbnNlcyBkdXJpbmcgYSB0ZXN0IHVudGlsIGFkYmxvY2sgaXMgc3VjY2Vzc2Z1bGx5IGRldGVjdGVkLlxuKlxuKlx0QHByb3AgY29tcGxldGU6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb25jZSBhIHJvdW5kIG9mIHRlc3RpbmcgaXMgY29tcGxldGUuXG4qICAgICAgICAgVGhlIHRlc3QgcmVzdWx0IChib29sZWFuKSBpcyBpbmNsdWRlZCBhcyBhIHBhcmFtZXRlciB0byBjYWxsYmFja1xuKlxuKiBleGFtcGxlOiBcdHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGZvdW5kOiBmdW5jdGlvbigpeyAuLi59LFxuIFx0XHRcdFx0XHRub3RGb3VuZDogZnVuY3Rpb24oKXsuLi59XG5cdFx0XHRcdH1cblx0XHRcdCk7XG4qXG4qXG4qL1xuXG5cInVzZSBzdHJpY3RcIjtcbihmdW5jdGlvbih3aW4pIHtcblxuXHR2YXIgdmVyc2lvbiA9ICcxLjAnO1xuXG5cdHZhciBvZnMgPSAnb2Zmc2V0JywgY2wgPSAnY2xpZW50Jztcblx0dmFyIG5vb3AgPSBmdW5jdGlvbigpe307XG5cblx0dmFyIHRlc3RlZE9uY2UgPSBmYWxzZTtcblx0dmFyIHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblxuXHR2YXIgaXNPbGRJRWV2ZW50cyA9ICh3aW4uYWRkRXZlbnRMaXN0ZW5lciA9PT0gdW5kZWZpbmVkKTtcblxuXHQvKipcblx0KiBPcHRpb25zIHNldCB3aXRoIGRlZmF1bHQgb3B0aW9ucyBpbml0aWFsaXplZFxuXHQqXG5cdCovXG5cdHZhciBfb3B0aW9ucyA9IHtcblx0XHRsb29wRGVsYXk6IDUwLFxuXHRcdG1heExvb3A6IDUsXG5cdFx0ZGVidWc6IHRydWUsXG5cdFx0Zm91bmQ6IG5vb3AsIFx0XHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIHdoZW4gYWRibG9jayBkZXRlY3RlZFxuXHRcdG5vdGZvdW5kOiBub29wLCBcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBub3QgZGV0ZWN0ZWQgYWZ0ZXIgdGVzdGluZ1xuXHRcdGNvbXBsZXRlOiBub29wICBcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgYWZ0ZXIgdGVzdGluZyBjb21wbGV0ZXMsIHBhc3NpbmcgcmVzdWx0IGFzIHBhcmFtZXRlclxuXHR9XG5cblx0ZnVuY3Rpb24gcGFyc2VBc0pzb24oZGF0YSl7XG5cdFx0dmFyIHJlc3VsdCwgZm5EYXRhO1xuXHRcdHRyeXtcblx0XHRcdHJlc3VsdCA9IEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0fVxuXHRcdGNhdGNoKGV4KXtcblx0XHRcdHRyeXtcblx0XHRcdFx0Zm5EYXRhID0gbmV3IEZ1bmN0aW9uKFwicmV0dXJuIFwiICsgZGF0YSk7XG5cdFx0XHRcdHJlc3VsdCA9IGZuRGF0YSgpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRsb2coJ0ZhaWxlZCBzZWNvbmRhcnkgSlNPTiBwYXJzZScsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0KiBBamF4IGhlbHBlciBvYmplY3QgdG8gZG93bmxvYWQgZXh0ZXJuYWwgc2NyaXB0cy5cblx0KiBJbml0aWFsaXplIG9iamVjdCB3aXRoIGFuIG9wdGlvbnMgb2JqZWN0XG5cdCogRXg6XG5cdCAge1xuXHRcdCAgdXJsIDogJ2h0dHA6Ly9leGFtcGxlLm9yZy91cmxfdG9fZG93bmxvYWQnLFxuXHRcdCAgbWV0aG9kOiAnUE9TVHxHRVQnLFxuXHRcdCAgc3VjY2VzczogY2FsbGJhY2tfZnVuY3Rpb24sXG5cdFx0ICBmYWlsOiAgY2FsbGJhY2tfZnVuY3Rpb25cblx0ICB9XG5cdCovXG5cdHZhciBBamF4SGVscGVyID0gZnVuY3Rpb24ob3B0cyl7XG5cdFx0dmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG5cdFx0dGhpcy5zdWNjZXNzID0gb3B0cy5zdWNjZXNzIHx8IG5vb3A7XG5cdFx0dGhpcy5mYWlsID0gb3B0cy5mYWlsIHx8IG5vb3A7XG5cdFx0dmFyIG1lID0gdGhpcztcblxuXHRcdHZhciBtZXRob2QgPSBvcHRzLm1ldGhvZCB8fCAnZ2V0JztcblxuXHRcdC8qKlxuXHRcdCogQWJvcnQgdGhlIHJlcXVlc3Rcblx0XHQqL1xuXHRcdHRoaXMuYWJvcnQgPSBmdW5jdGlvbigpe1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHR4aHIuYWJvcnQoKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzdGF0ZUNoYW5nZSh2YWxzKXtcblx0XHRcdGlmKHhoci5yZWFkeVN0YXRlID09IDQpe1xuXHRcdFx0XHRpZih4aHIuc3RhdHVzID09IDIwMCl7XG5cdFx0XHRcdFx0bWUuc3VjY2Vzcyh4aHIucmVzcG9uc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0Ly8gZmFpbGVkXG5cdFx0XHRcdFx0bWUuZmFpbCh4aHIuc3RhdHVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBzdGF0ZUNoYW5nZTtcblxuXHRcdGZ1bmN0aW9uIHN0YXJ0KCl7XG5cdFx0XHR4aHIub3BlbihtZXRob2QsIG9wdHMudXJsLCB0cnVlKTtcblx0XHRcdHhoci5zZW5kKCk7XG5cdFx0fVxuXG5cdFx0c3RhcnQoKTtcblx0fVxuXG5cdC8qKlxuXHQqIE9iamVjdCB0cmFja2luZyB0aGUgdmFyaW91cyBibG9jayBsaXN0c1xuXHQqL1xuXHR2YXIgQmxvY2tMaXN0VHJhY2tlciA9IGZ1bmN0aW9uKCl7XG5cdFx0dmFyIG1lID0gdGhpcztcblx0XHR2YXIgZXh0ZXJuYWxCbG9ja2xpc3REYXRhID0ge307XG5cblx0XHQvKipcblx0XHQqIEFkZCBhIG5ldyBleHRlcm5hbCBVUkwgdG8gdHJhY2tcblx0XHQqL1xuXHRcdHRoaXMuYWRkVXJsID0gZnVuY3Rpb24odXJsKXtcblx0XHRcdGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxdID0ge1xuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0c3RhdGU6ICdwZW5kaW5nJyxcblx0XHRcdFx0Zm9ybWF0OiBudWxsLFxuXHRcdFx0XHRkYXRhOiBudWxsLFxuXHRcdFx0XHRyZXN1bHQ6IG51bGxcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxdO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCogTG9hZHMgYSBibG9jayBsaXN0IGRlZmluaXRpb25cblx0XHQqL1xuXHRcdHRoaXMuc2V0UmVzdWx0ID0gZnVuY3Rpb24odXJsS2V5LCBzdGF0ZSwgZGF0YSl7XG5cdFx0XHR2YXIgb2JqID0gZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybEtleV07XG5cdFx0XHRpZihvYmogPT0gbnVsbCl7XG5cdFx0XHRcdG9iaiA9IHRoaXMuYWRkVXJsKHVybEtleSk7XG5cdFx0XHR9XG5cblx0XHRcdG9iai5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0aWYoZGF0YSA9PSBudWxsKXtcblx0XHRcdFx0b2JqLnJlc3VsdCA9IG51bGw7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKXtcblx0XHRcdFx0dHJ5e1xuXHRcdFx0XHRcdGRhdGEgPSBwYXJzZUFzSnNvbihkYXRhKTtcblx0XHRcdFx0XHRvYmouZm9ybWF0ID0gJ2pzb24nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0XHRvYmouZm9ybWF0ID0gJ2Vhc3lsaXN0Jztcblx0XHRcdFx0XHQvLyBwYXJzZUVhc3lMaXN0KGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvYmouZGF0YSA9IGRhdGE7XG5cblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fVxuXG5cdH1cblxuXHR2YXIgbGlzdGVuZXJzID0gW107IC8vIGV2ZW50IHJlc3BvbnNlIGxpc3RlbmVyc1xuXHR2YXIgYmFpdE5vZGUgPSBudWxsO1xuXHR2YXIgcXVpY2tCYWl0ID0ge1xuXHRcdGNzc0NsYXNzOiAncHViXzMwMHgyNTAgcHViXzMwMHgyNTBtIHB1Yl83Mjh4OTAgdGV4dC1hZCB0ZXh0QWQgdGV4dF9hZCB0ZXh0X2FkcyB0ZXh0LWFkcyB0ZXh0LWFkLWxpbmtzJ1xuXHR9O1xuXHR2YXIgYmFpdFRyaWdnZXJzID0ge1xuXHRcdG51bGxQcm9wczogW29mcyArICdQYXJlbnQnXSxcblx0XHR6ZXJvUHJvcHM6IFtdXG5cdH07XG5cblx0YmFpdFRyaWdnZXJzLnplcm9Qcm9wcyA9IFtcblx0XHRvZnMgKydIZWlnaHQnLCBvZnMgKydMZWZ0Jywgb2ZzICsnVG9wJywgb2ZzICsnV2lkdGgnLCBvZnMgKydIZWlnaHQnLFxuXHRcdGNsICsgJ0hlaWdodCcsIGNsICsgJ1dpZHRoJ1xuXHRdO1xuXG5cdC8vIHJlc3VsdCBvYmplY3Rcblx0dmFyIGV4ZVJlc3VsdCA9IHtcblx0XHRxdWljazogbnVsbCxcblx0XHRyZW1vdGU6IG51bGxcblx0fTtcblxuXHR2YXIgZmluZFJlc3VsdCA9IG51bGw7IC8vIHJlc3VsdCBvZiB0ZXN0IGZvciBhZCBibG9ja2VyXG5cblx0dmFyIHRpbWVySWRzID0ge1xuXHRcdHRlc3Q6IDAsXG5cdFx0ZG93bmxvYWQ6IDBcblx0fTtcblxuXHRmdW5jdGlvbiBpc0Z1bmMoZm4pe1xuXHRcdHJldHVybiB0eXBlb2YoZm4pID09ICdmdW5jdGlvbic7XG5cdH1cblxuXHQvKipcblx0KiBNYWtlIGEgRE9NIGVsZW1lbnRcblx0Ki9cblx0ZnVuY3Rpb24gbWFrZUVsKHRhZywgYXR0cmlidXRlcyl7XG5cdFx0dmFyIGssIHYsIGVsLCBhdHRyID0gYXR0cmlidXRlcztcblx0XHR2YXIgZCA9IGRvY3VtZW50O1xuXG5cdFx0ZWwgPSBkLmNyZWF0ZUVsZW1lbnQodGFnKTtcblxuXHRcdGlmKGF0dHIpe1xuXHRcdFx0Zm9yKGsgaW4gYXR0cil7XG5cdFx0XHRcdGlmKGF0dHIuaGFzT3duUHJvcGVydHkoaykpe1xuXHRcdFx0XHRcdGVsLnNldEF0dHJpYnV0ZShrLCBhdHRyW2tdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGF0dGFjaEV2ZW50TGlzdGVuZXIoZG9tLCBldmVudE5hbWUsIGhhbmRsZXIpe1xuXHRcdGlmKGlzT2xkSUVldmVudHMpe1xuXHRcdFx0ZG9tLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudE5hbWUsIGhhbmRsZXIpO1xuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0ZG9tLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gbG9nKG1lc3NhZ2UsIGlzRXJyb3Ipe1xuXHRcdGlmKCFfb3B0aW9ucy5kZWJ1ZyAmJiAhaXNFcnJvcil7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmKHdpbi5jb25zb2xlICYmIHdpbi5jb25zb2xlLmxvZyl7XG5cdFx0XHRpZihpc0Vycm9yKXtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignW0FCRF0gJyArIG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZXtcblx0XHRcdFx0Y29uc29sZS5sb2coJ1tBQkRdICcgKyBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR2YXIgYWpheERvd25sb2FkcyA9IFtdO1xuXG5cdC8qKlxuXHQqIExvYWQgYW5kIGV4ZWN1dGUgdGhlIFVSTCBpbnNpZGUgYSBjbG9zdXJlIGZ1bmN0aW9uXG5cdCovXG5cdGZ1bmN0aW9uIGxvYWRFeGVjdXRlVXJsKHVybCl7XG5cdFx0dmFyIGFqYXgsIHJlc3VsdDtcblxuXHRcdGJsb2NrTGlzdHMuYWRkVXJsKHVybCk7XG5cdFx0Ly8gc2V0dXAgY2FsbCBmb3IgcmVtb3RlIGxpc3Rcblx0XHRhamF4ID0gbmV3IEFqYXhIZWxwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdHVybDogdXJsLFxuXHRcdFx0XHRzdWNjZXNzOiBmdW5jdGlvbihkYXRhKXtcblx0XHRcdFx0XHRsb2coJ2Rvd25sb2FkZWQgZmlsZSAnICsgdXJsKTsgLy8gdG9kbyAtIHBhcnNlIGFuZCBzdG9yZSB1bnRpbCB1c2Vcblx0XHRcdFx0XHRyZXN1bHQgPSBibG9ja0xpc3RzLnNldFJlc3VsdCh1cmwsICdzdWNjZXNzJywgZGF0YSk7XG5cdFx0XHRcdFx0dHJ5e1xuXHRcdFx0XHRcdFx0dmFyIGludGVydmFsSWQgPSAwLFxuXHRcdFx0XHRcdFx0XHRyZXRyeUNvdW50ID0gMDtcblxuXHRcdFx0XHRcdFx0dmFyIHRyeUV4ZWN1dGVUZXN0ID0gZnVuY3Rpb24obGlzdERhdGEpe1xuXHRcdFx0XHRcdFx0XHRpZighdGVzdEV4ZWN1dGluZyl7XG5cdFx0XHRcdFx0XHRcdFx0YmVnaW5UZXN0KGxpc3REYXRhLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmKGZpbmRSZXN1bHQgPT0gdHJ1ZSl7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYodHJ5RXhlY3V0ZVRlc3QocmVzdWx0LmRhdGEpKXtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHRcdFx0bG9nKCdQYXVzZSBiZWZvcmUgdGVzdCBleGVjdXRpb24nKTtcblx0XHRcdFx0XHRcdFx0aW50ZXJ2YWxJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0XHRcdFx0aWYodHJ5RXhlY3V0ZVRlc3QocmVzdWx0LmRhdGEpIHx8IHJldHJ5Q291bnQrKyA+IDUpe1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xlYXJJbnRlcnZhbChpbnRlcnZhbElkKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sIDI1MCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0XHRcdGxvZyhleC5tZXNzYWdlICsgJyB1cmw6ICcgKyB1cmwsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmFpbDogZnVuY3Rpb24oc3RhdHVzKXtcblx0XHRcdFx0XHRsb2coc3RhdHVzLCB0cnVlKTtcblx0XHRcdFx0XHRibG9ja0xpc3RzLnNldFJlc3VsdCh1cmwsICdlcnJvcicsIG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdGFqYXhEb3dubG9hZHMucHVzaChhamF4KTtcblx0fVxuXG5cblx0LyoqXG5cdCogRmV0Y2ggdGhlIGV4dGVybmFsIGxpc3RzIGFuZCBpbml0aWF0ZSB0aGUgdGVzdHNcblx0Ki9cblx0ZnVuY3Rpb24gZmV0Y2hSZW1vdGVMaXN0cygpe1xuXHRcdHZhciBpLCB1cmw7XG5cdFx0dmFyIG9wdHMgPSBfb3B0aW9ucztcblxuXHRcdGZvcihpPTA7aTxvcHRzLmJsb2NrTGlzdHMubGVuZ3RoO2krKyl7XG5cdFx0XHR1cmwgPSBvcHRzLmJsb2NrTGlzdHNbaV07XG5cdFx0XHRsb2FkRXhlY3V0ZVVybCh1cmwpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNhbmNlbFJlbW90ZURvd25sb2Fkcygpe1xuXHRcdHZhciBpLCBhajtcblxuXHRcdGZvcihpPWFqYXhEb3dubG9hZHMubGVuZ3RoLTE7aSA+PSAwO2ktLSl7XG5cdFx0XHRhaiA9IGFqYXhEb3dubG9hZHMucG9wKCk7XG5cdFx0XHRhai5hYm9ydCgpO1xuXHRcdH1cblx0fVxuXG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0LyoqXG5cdCogQmVnaW4gZXhlY3V0aW9uIG9mIHRoZSB0ZXN0XG5cdCovXG5cdGZ1bmN0aW9uIGJlZ2luVGVzdChiYWl0KXtcblx0XHRsb2coJ3N0YXJ0IGJlZ2luVGVzdCcpO1xuXHRcdGlmKGZpbmRSZXN1bHQgPT0gdHJ1ZSl7XG5cdFx0XHRyZXR1cm47IC8vIHdlIGZvdW5kIGl0LiBkb24ndCBjb250aW51ZSBleGVjdXRpbmdcblx0XHR9XG5cdFx0dGVzdEV4ZWN1dGluZyA9IHRydWU7XG5cdFx0Y2FzdEJhaXQoYmFpdCk7XG5cblx0XHRleGVSZXN1bHQucXVpY2sgPSAndGVzdGluZyc7XG5cblx0XHR0aW1lcklkcy50ZXN0ID0gc2V0VGltZW91dChcblx0XHRcdGZ1bmN0aW9uKCl7IHJlZWxJbihiYWl0LCAxKTsgfSxcblx0XHRcdDUpO1xuXHR9XG5cblx0LyoqXG5cdCogQ3JlYXRlIHRoZSBiYWl0IG5vZGUgdG8gc2VlIGhvdyB0aGUgYnJvd3NlciBwYWdlIHJlYWN0c1xuXHQqL1xuXHRmdW5jdGlvbiBjYXN0QmFpdChiYWl0KXtcblx0XHR2YXIgaSwgZCA9IGRvY3VtZW50LCBiID0gZC5ib2R5O1xuXHRcdHZhciB0O1xuXHRcdHZhciBiYWl0U3R5bGUgPSAnd2lkdGg6IDFweCAhaW1wb3J0YW50OyBoZWlnaHQ6IDFweCAhaW1wb3J0YW50OyBwb3NpdGlvbjogYWJzb2x1dGUgIWltcG9ydGFudDsgbGVmdDogLTEwMDAwcHggIWltcG9ydGFudDsgdG9wOiAtMTAwMHB4ICFpbXBvcnRhbnQ7J1xuXG5cdFx0aWYoYmFpdCA9PSBudWxsIHx8IHR5cGVvZihiYWl0KSA9PSAnc3RyaW5nJyl7XG5cdFx0XHRsb2coJ2ludmFsaWQgYmFpdCBiZWluZyBjYXN0Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYoYmFpdC5zdHlsZSAhPSBudWxsKXtcblx0XHRcdGJhaXRTdHlsZSArPSBiYWl0LnN0eWxlO1xuXHRcdH1cblxuXHRcdGJhaXROb2RlID0gbWFrZUVsKCdkaXYnLCB7XG5cdFx0XHQnY2xhc3MnOiBiYWl0LmNzc0NsYXNzLFxuXHRcdFx0J3N0eWxlJzogYmFpdFN0eWxlXG5cdFx0fSk7XG5cblx0XHRsb2coJ2FkZGluZyBiYWl0IG5vZGUgdG8gRE9NJyk7XG5cblx0XHRiLmFwcGVuZENoaWxkKGJhaXROb2RlKTtcblxuXHRcdC8vIHRvdWNoIHRoZXNlIHByb3BlcnRpZXNcblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLm51bGxQcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdHQgPSBiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldXTtcblx0XHR9XG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHR0ID0gYmFpdE5vZGVbYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXV07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCogUnVuIHRlc3RzIHRvIHNlZSBpZiBicm93c2VyIGhhcyB0YWtlbiB0aGUgYmFpdCBhbmQgYmxvY2tlZCB0aGUgYmFpdCBlbGVtZW50XG5cdCovXG5cdGZ1bmN0aW9uIHJlZWxJbihiYWl0LCBhdHRlbXB0TnVtKXtcblx0XHR2YXIgaSwgaywgdjtcblx0XHR2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG5cdFx0dmFyIGZvdW5kID0gZmFsc2U7XG5cblx0XHRpZihiYWl0Tm9kZSA9PSBudWxsKXtcblx0XHRcdGxvZygncmVjYXN0IGJhaXQnKTtcblx0XHRcdGNhc3RCYWl0KGJhaXQgfHwgcXVpY2tCYWl0KTtcblx0XHR9XG5cblx0XHRpZih0eXBlb2YoYmFpdCkgPT0gJ3N0cmluZycpe1xuXHRcdFx0bG9nKCdpbnZhbGlkIGJhaXQgdXNlZCcsIHRydWUpO1xuXHRcdFx0aWYoY2xlYXJCYWl0Tm9kZSgpKXtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZih0aW1lcklkcy50ZXN0ID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMudGVzdCk7XG5cdFx0XHR0aW1lcklkcy50ZXN0ID0gMDtcblx0XHR9XG5cblx0XHQvLyB0ZXN0IGZvciBpc3N1ZXNcblxuXHRcdGlmKGJvZHkuZ2V0QXR0cmlidXRlKCdhYnAnKSAhPT0gbnVsbCl7XG5cdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgYm9keSBhdHRyaWJ1dGUnKTtcblx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLm51bGxQcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdGlmKGJhaXROb2RlW2JhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV1dID09IG51bGwpe1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIG51bGwgYXR0cjogJyArIGJhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmKGZvdW5kID09IHRydWUpe1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLnplcm9Qcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdGlmKGZvdW5kID09IHRydWUpe1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmKGJhaXROb2RlW2JhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV1dID09IDApe1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIHplcm8gYXR0cjogJyArIGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmKHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhciBiYWl0VGVtcCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGJhaXROb2RlLCBudWxsKTtcblx0XHRcdGlmKGJhaXRUZW1wLmdldFByb3BlcnR5VmFsdWUoJ2Rpc3BsYXknKSA9PSAnbm9uZSdcblx0XHRcdHx8IGJhaXRUZW1wLmdldFByb3BlcnR5VmFsdWUoJ3Zpc2liaWxpdHknKSA9PSAnaGlkZGVuJykge1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIGNvbXB1dGVkU3R5bGUgaW5kaWNhdG9yJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdGVkT25jZSA9IHRydWU7XG5cblx0XHRpZihmb3VuZCB8fCBhdHRlbXB0TnVtKysgPj0gX29wdGlvbnMubWF4TG9vcCl7XG5cdFx0XHRmaW5kUmVzdWx0ID0gZm91bmQ7XG5cdFx0XHRsb2coJ2V4aXRpbmcgdGVzdCBsb29wIC0gdmFsdWU6ICcgKyBmaW5kUmVzdWx0KTtcblx0XHRcdG5vdGlmeUxpc3RlbmVycygpO1xuXHRcdFx0aWYoY2xlYXJCYWl0Tm9kZSgpKXtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHR0aW1lcklkcy50ZXN0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRyZWVsSW4oYmFpdCwgYXR0ZW1wdE51bSk7XG5cdFx0XHR9LCBfb3B0aW9ucy5sb29wRGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNsZWFyQmFpdE5vZGUoKXtcblx0XHRpZihiYWl0Tm9kZSA9PT0gbnVsbCl7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0cnl7XG5cdFx0XHRpZihpc0Z1bmMoYmFpdE5vZGUucmVtb3ZlKSl7XG5cdFx0XHRcdGJhaXROb2RlLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChiYWl0Tm9kZSk7XG5cdFx0fVxuXHRcdGNhdGNoKGV4KXtcblx0XHR9XG5cdFx0YmFpdE5vZGUgPSBudWxsO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0KiBIYWx0IHRoZSB0ZXN0IGFuZCBhbnkgcGVuZGluZyB0aW1lb3V0c1xuXHQqL1xuXHRmdW5jdGlvbiBzdG9wRmlzaGluZygpe1xuXHRcdGlmKHRpbWVySWRzLnRlc3QgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy50ZXN0KTtcblx0XHR9XG5cdFx0aWYodGltZXJJZHMuZG93bmxvYWQgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy5kb3dubG9hZCk7XG5cdFx0fVxuXG5cdFx0Y2FuY2VsUmVtb3RlRG93bmxvYWRzKCk7XG5cblx0XHRjbGVhckJhaXROb2RlKCk7XG5cdH1cblxuXHQvKipcblx0KiBGaXJlIGFsbCByZWdpc3RlcmVkIGxpc3RlbmVyc1xuXHQqL1xuXHRmdW5jdGlvbiBub3RpZnlMaXN0ZW5lcnMoKXtcblx0XHR2YXIgaSwgZnVuY3M7XG5cdFx0aWYoZmluZFJlc3VsdCA9PT0gbnVsbCl7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvcihpPTA7aTxsaXN0ZW5lcnMubGVuZ3RoO2krKyl7XG5cdFx0XHRmdW5jcyA9IGxpc3RlbmVyc1tpXTtcblx0XHRcdHRyeXtcblx0XHRcdFx0aWYoZnVuY3MgIT0gbnVsbCl7XG5cdFx0XHRcdFx0aWYoaXNGdW5jKGZ1bmNzWydjb21wbGV0ZSddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snY29tcGxldGUnXShmaW5kUmVzdWx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZihmaW5kUmVzdWx0ICYmIGlzRnVuYyhmdW5jc1snZm91bmQnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ2ZvdW5kJ10oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSBpZihmaW5kUmVzdWx0ID09PSBmYWxzZSAmJiBpc0Z1bmMoZnVuY3NbJ25vdGZvdW5kJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydub3Rmb3VuZCddKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdGxvZygnRmFpbHVyZSBpbiBub3RpZnkgbGlzdGVuZXJzICcgKyBleC5NZXNzYWdlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBBdHRhY2hlcyBldmVudCBsaXN0ZW5lciBvciBmaXJlcyBpZiBldmVudHMgaGF2ZSBhbHJlYWR5IHBhc3NlZC5cblx0Ki9cblx0ZnVuY3Rpb24gYXR0YWNoT3JGaXJlKCl7XG5cdFx0dmFyIGZpcmVOb3cgPSBmYWxzZTtcblx0XHR2YXIgZm47XG5cblx0XHRpZihkb2N1bWVudC5yZWFkeVN0YXRlKXtcblx0XHRcdGlmKGRvY3VtZW50LnJlYWR5U3RhdGUgPT0gJ2NvbXBsZXRlJyl7XG5cdFx0XHRcdGZpcmVOb3cgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZuID0gZnVuY3Rpb24oKXtcblx0XHRcdGJlZ2luVGVzdChxdWlja0JhaXQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHRpZihmaXJlTm93KXtcblx0XHRcdGZuKCk7XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHRhdHRhY2hFdmVudExpc3RlbmVyKHdpbiwgJ2xvYWQnLCBmbik7XG5cdFx0fVxuXHR9XG5cblxuXHR2YXIgYmxvY2tMaXN0czsgLy8gdHJhY2tzIGV4dGVybmFsIGJsb2NrIGxpc3RzXG5cblx0LyoqXG5cdCogUHVibGljIGludGVyZmFjZSBvZiBhZGJsb2NrIGRldGVjdG9yXG5cdCovXG5cdHZhciBpbXBsID0ge1xuXHRcdC8qKlxuXHRcdCogVmVyc2lvbiBvZiB0aGUgYWRibG9jayBkZXRlY3RvciBwYWNrYWdlXG5cdFx0Ki9cblx0XHR2ZXJzaW9uOiB2ZXJzaW9uLFxuXG5cdFx0LyoqXG5cdFx0KiBJbml0aWFsaXphdGlvbiBmdW5jdGlvbi4gU2VlIGNvbW1lbnRzIGF0IHRvcCBmb3Igb3B0aW9ucyBvYmplY3Rcblx0XHQqL1xuXHRcdGluaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuXHRcdFx0dmFyIGssIHYsIGZ1bmNzO1xuXG5cdFx0XHRpZighb3B0aW9ucyl7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3MgPSB7XG5cdFx0XHRcdGNvbXBsZXRlOiBub29wLFxuXHRcdFx0XHRmb3VuZDogbm9vcCxcblx0XHRcdFx0bm90Zm91bmQ6IG5vb3Bcblx0XHRcdH07XG5cblx0XHRcdGZvcihrIGluIG9wdGlvbnMpe1xuXHRcdFx0XHRpZihvcHRpb25zLmhhc093blByb3BlcnR5KGspKXtcblx0XHRcdFx0XHRpZihrID09ICdjb21wbGV0ZScgfHwgayA9PSAnZm91bmQnIHx8IGsgPT0gJ25vdEZvdW5kJyl7XG5cdFx0XHRcdFx0XHRmdW5jc1trLnRvTG93ZXJDYXNlKCldID0gb3B0aW9uc1trXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHRcdF9vcHRpb25zW2tdID0gb3B0aW9uc1trXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGlzdGVuZXJzLnB1c2goZnVuY3MpO1xuXG5cdFx0XHRibG9ja0xpc3RzID0gbmV3IEJsb2NrTGlzdFRyYWNrZXIoKTtcblxuXHRcdFx0YXR0YWNoT3JGaXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0d2luWydhZGJsb2NrRGV0ZWN0b3InXSA9IGltcGw7XG5cbn0pKHdpbmRvdylcbiIsIi8qIVxuICogQHByZXNlcnZlXG4gKiBqcXVlcnkuc2Nyb2xsZGVwdGguanMgfCB2MS4wXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTYgUm9iIEZsYWhlcnR5IChAcm9iZmxhaGVydHkpXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGFuZCBHUEwgbGljZW5zZXMuXG4gKi9cbiFmdW5jdGlvbihlKXtcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQ/ZGVmaW5lKFtcImpxdWVyeVwiXSxlKTpcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlJiZtb2R1bGUuZXhwb3J0cz9tb2R1bGUuZXhwb3J0cz1lKHJlcXVpcmUoXCJqcXVlcnlcIikpOmUoalF1ZXJ5KX0oZnVuY3Rpb24oZSl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG4sdCxyLG8saT17bWluSGVpZ2h0OjAsZWxlbWVudHM6W10scGVyY2VudGFnZTohMCx1c2VyVGltaW5nOiEwLHBpeGVsRGVwdGg6ITAsbm9uSW50ZXJhY3Rpb246ITAsZ2FHbG9iYWw6ITEsZ3RtT3ZlcnJpZGU6ITEsdHJhY2tlck5hbWU6ITEsZGF0YUxheWVyOlwiZGF0YUxheWVyXCJ9LGE9ZSh3aW5kb3cpLGw9W10sYz0hMSx1PTA7cmV0dXJuIGUuc2Nyb2xsRGVwdGg9ZnVuY3Rpb24ocCl7ZnVuY3Rpb24gcyhlLGksYSxsKXt2YXIgYz1wLnRyYWNrZXJOYW1lP3AudHJhY2tlck5hbWUrXCIuc2VuZFwiOlwic2VuZFwiO28/KG8oe2V2ZW50OlwiU2Nyb2xsRGlzdGFuY2VcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246ZSxldmVudExhYmVsOmksZXZlbnRWYWx1ZToxLGV2ZW50Tm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pLHAucGl4ZWxEZXB0aCYmYXJndW1lbnRzLmxlbmd0aD4yJiZhPnUmJih1PWEsbyh7ZXZlbnQ6XCJTY3JvbGxEaXN0YW5jZVwiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjpcIlBpeGVsIERlcHRoXCIsZXZlbnRMYWJlbDpkKGEpLGV2ZW50VmFsdWU6MSxldmVudE5vbkludGVyYWN0aW9uOnAubm9uSW50ZXJhY3Rpb259KSkscC51c2VyVGltaW5nJiZhcmd1bWVudHMubGVuZ3RoPjMmJm8oe2V2ZW50OlwiU2Nyb2xsVGltaW5nXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOmUsZXZlbnRMYWJlbDppLGV2ZW50VGltaW5nOmx9KSk6KG4mJih3aW5kb3dbcl0oYyxcImV2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixlLGksMSx7bm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pLHAucGl4ZWxEZXB0aCYmYXJndW1lbnRzLmxlbmd0aD4yJiZhPnUmJih1PWEsd2luZG93W3JdKGMsXCJldmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsXCJQaXhlbCBEZXB0aFwiLGQoYSksMSx7bm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pKSxwLnVzZXJUaW1pbmcmJmFyZ3VtZW50cy5sZW5ndGg+MyYmd2luZG93W3JdKGMsXCJ0aW1pbmdcIixcIlNjcm9sbCBEZXB0aFwiLGUsbCxpKSksdCYmKF9nYXEucHVzaChbXCJfdHJhY2tFdmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsZSxpLDEscC5ub25JbnRlcmFjdGlvbl0pLHAucGl4ZWxEZXB0aCYmYXJndW1lbnRzLmxlbmd0aD4yJiZhPnUmJih1PWEsX2dhcS5wdXNoKFtcIl90cmFja0V2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixcIlBpeGVsIERlcHRoXCIsZChhKSwxLHAubm9uSW50ZXJhY3Rpb25dKSkscC51c2VyVGltaW5nJiZhcmd1bWVudHMubGVuZ3RoPjMmJl9nYXEucHVzaChbXCJfdHJhY2tUaW1pbmdcIixcIlNjcm9sbCBEZXB0aFwiLGUsbCxpLDEwMF0pKSl9ZnVuY3Rpb24gaChlKXtyZXR1cm57XCIyNSVcIjpwYXJzZUludCguMjUqZSwxMCksXCI1MCVcIjpwYXJzZUludCguNSplLDEwKSxcIjc1JVwiOnBhcnNlSW50KC43NSplLDEwKSxcIjEwMCVcIjplLTV9fWZ1bmN0aW9uIGcobix0LHIpe2UuZWFjaChuLGZ1bmN0aW9uKG4sbyl7LTE9PT1lLmluQXJyYXkobixsKSYmdD49byYmKHMoXCJQZXJjZW50YWdlXCIsbix0LHIpLGwucHVzaChuKSl9KX1mdW5jdGlvbiBmKG4sdCxyKXtlLmVhY2gobixmdW5jdGlvbihuLG8pey0xPT09ZS5pbkFycmF5KG8sbCkmJmUobykubGVuZ3RoJiZ0Pj1lKG8pLm9mZnNldCgpLnRvcCYmKHMoXCJFbGVtZW50c1wiLG8sdCxyKSxsLnB1c2gobykpfSl9ZnVuY3Rpb24gZChlKXtyZXR1cm4oMjUwKk1hdGguZmxvb3IoZS8yNTApKS50b1N0cmluZygpfWZ1bmN0aW9uIG0oKXt5KCl9ZnVuY3Rpb24gdihlLG4pe3ZhciB0LHIsbyxpPW51bGwsYT0wLGw9ZnVuY3Rpb24oKXthPW5ldyBEYXRlLGk9bnVsbCxvPWUuYXBwbHkodCxyKX07cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIGM9bmV3IERhdGU7YXx8KGE9Yyk7dmFyIHU9bi0oYy1hKTtyZXR1cm4gdD10aGlzLHI9YXJndW1lbnRzLDA+PXU/KGNsZWFyVGltZW91dChpKSxpPW51bGwsYT1jLG89ZS5hcHBseSh0LHIpKTppfHwoaT1zZXRUaW1lb3V0KGwsdSkpLG99fWZ1bmN0aW9uIHkoKXtjPSEwLGEub24oXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIix2KGZ1bmN0aW9uKCl7dmFyIG49ZShkb2N1bWVudCkuaGVpZ2h0KCksdD13aW5kb3cuaW5uZXJIZWlnaHQ/d2luZG93LmlubmVySGVpZ2h0OmEuaGVpZ2h0KCkscj1hLnNjcm9sbFRvcCgpK3Qsbz1oKG4pLGk9K25ldyBEYXRlLUQ7cmV0dXJuIGwubGVuZ3RoPj1wLmVsZW1lbnRzLmxlbmd0aCsocC5wZXJjZW50YWdlPzQ6MCk/KGEub2ZmKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIpLHZvaWQoYz0hMSkpOihwLmVsZW1lbnRzJiZmKHAuZWxlbWVudHMscixpKSx2b2lkKHAucGVyY2VudGFnZSYmZyhvLHIsaSkpKX0sNTAwKSl9dmFyIEQ9K25ldyBEYXRlO3A9ZS5leHRlbmQoe30saSxwKSxlKGRvY3VtZW50KS5oZWlnaHQoKTxwLm1pbkhlaWdodHx8KHAuZ2FHbG9iYWw/KG49ITAscj1wLmdhR2xvYmFsKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBnYT8obj0hMCxyPVwiZ2FcIik6XCJmdW5jdGlvblwiPT10eXBlb2YgX19nYVRyYWNrZXImJihuPSEwLHI9XCJfX2dhVHJhY2tlclwiKSxcInVuZGVmaW5lZFwiIT10eXBlb2YgX2dhcSYmXCJmdW5jdGlvblwiPT10eXBlb2YgX2dhcS5wdXNoJiYodD0hMCksXCJmdW5jdGlvblwiPT10eXBlb2YgcC5ldmVudEhhbmRsZXI/bz1wLmV2ZW50SGFuZGxlcjpcInVuZGVmaW5lZFwiPT10eXBlb2Ygd2luZG93W3AuZGF0YUxheWVyXXx8XCJmdW5jdGlvblwiIT10eXBlb2Ygd2luZG93W3AuZGF0YUxheWVyXS5wdXNofHxwLmd0bU92ZXJyaWRlfHwobz1mdW5jdGlvbihlKXt3aW5kb3dbcC5kYXRhTGF5ZXJdLnB1c2goZSl9KSxlLnNjcm9sbERlcHRoLnJlc2V0PWZ1bmN0aW9uKCl7bD1bXSx1PTAsYS5vZmYoXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIikseSgpfSxlLnNjcm9sbERlcHRoLmFkZEVsZW1lbnRzPWZ1bmN0aW9uKG4pe1widW5kZWZpbmVkXCIhPXR5cGVvZiBuJiZlLmlzQXJyYXkobikmJihlLm1lcmdlKHAuZWxlbWVudHMsbiksY3x8eSgpKX0sZS5zY3JvbGxEZXB0aC5yZW1vdmVFbGVtZW50cz1mdW5jdGlvbihuKXtcInVuZGVmaW5lZFwiIT10eXBlb2YgbiYmZS5pc0FycmF5KG4pJiZlLmVhY2gobixmdW5jdGlvbihuLHQpe3ZhciByPWUuaW5BcnJheSh0LHAuZWxlbWVudHMpLG89ZS5pbkFycmF5KHQsbCk7LTEhPXImJnAuZWxlbWVudHMuc3BsaWNlKHIsMSksLTEhPW8mJmwuc3BsaWNlKG8sMSl9KX0sbSgpKX0sZS5zY3JvbGxEZXB0aH0pO1xuIiwiKCBmdW5jdGlvbiggJCApIHtcblxuXHQvKlxuXHQgKiBDcmVhdGUgYSBHb29nbGUgQW5hbHl0aWNzIGV2ZW50XG5cdCAqIGNhdGVnb3J5OiBFdmVudCBDYXRlZ29yeVxuXHQgKiBsYWJlbDogRXZlbnQgTGFiZWxcblx0ICogYWN0aW9uOiBFdmVudCBBY3Rpb25cblx0ICogdmFsdWU6IG9wdGlvbmFsXG5cdCovXG5cdGZ1bmN0aW9uIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICkge1xuXHRcdGlmICggdHlwZW9mIGdhICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdGlmICggdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gd3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwKCkge1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dmFyIHNjcm9sbERlcHRoU2V0dGluZ3MgPSBbXTtcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICkge1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5lbmFibGVkICkge1xuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgc3RyaW5nIGFuZCBhIGJvb2xlYW5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hbmFseXRpY3NfdHlwZSAmJiAnZ3RhZ2pzJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2d0bU92ZXJyaWRlJ10gPSB0cnVlO1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2dhR2xvYmFsJ10gPSAnZ2EnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmdcblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgJiYgJzAnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ21pbmltdW1faGVpZ2h0J10gPSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBlcmNlbnRhZ2UgJiYgJ3RydWUnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBlcmNlbnRhZ2UgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGVyY2VudGFnZSddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgJiYgJ3RydWUnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3VzZXJfdGltaW5nJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5waXhlbF9kZXB0aCAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGl4ZWxfZGVwdGgnXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm5vbl9pbnRlcmFjdGlvbiAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ25vbl9pbnRlcmFjdGlvbiddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhbiBhcnJheS4gZGVmYXVsdCBpcyBlbXB0eS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2VsZW1lbnRzJ10gPSAkLm1hcCggYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMuc3BsaXQoICcsJyApLCAkLnRyaW0gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRcblx0XHRcdFx0Ly8gc2VuZCBzY3JvbGwgc2V0dGluZ3MgdG8gdGhlIHNjcm9sbGRlcHRoIHBsdWdpblxuXHRcdFx0XHRqUXVlcnkuc2Nyb2xsRGVwdGgoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmVuYWJsZWQgKSB7XG5cblx0XHRcdFx0Ly8gZXh0ZXJuYWwgbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJodHRwXCJdOm5vdChbaHJlZio9XCI6Ly8nICsgZG9jdW1lbnQuZG9tYWluICsgJ1wiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnT3V0Ym91bmQgbGlua3MnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gbWFpbHRvIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwibWFpbHRvXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ01haWxzJywgJ0NsaWNrJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIHRlbCBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cInRlbFwiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdUZWxlcGhvbmUnLCAnQ2FsbCcsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBpbnRlcm5hbCBsaW5rc1xuXHRcdFx0XHQkKCAnYTpub3QoW2hyZWZePVwiKGh0dHA6fGh0dHBzOik/Ly9cIl0sW2hyZWZePVwiI1wiXSxbaHJlZl49XCJtYWlsdG86XCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0XHQvLyB0cmFjayBkb3dubG9hZHNcblx0XHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCApIHtcblx0XHRcdFx0XHRcdHZhciB1cmwgPSB0aGlzLmhyZWY7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZCA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdFx0dmFyIGlzRG93bmxvYWQgPSBjaGVja0Rvd25sb2FkLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0Rvd25sb2FkICkge1xuXHRcdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZEV4dGVuc2lvbiA9IG5ldyBSZWdFeHAoXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiKTtcblx0XHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvblJlc3VsdCA9IGNoZWNrRG93bmxvYWRFeHRlbnNpb24uZXhlYyggdXJsICk7XG5cdFx0XHRcdFx0XHRcdHZhciBleHRlbnNpb24gPSAnJztcblx0XHRcdFx0XHRcdFx0aWYgKCBudWxsICE9PSBleHRlbnNpb25SZXN1bHQgKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0WzFdO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvLyB3ZSBjYW4ndCB1c2UgdGhlIHVybCBmb3IgdGhlIHZhbHVlIGhlcmUsIGV2ZW4gdGhvdWdoIHRoYXQgd291bGQgYmUgbmljZSwgYmVjYXVzZSB2YWx1ZSBpcyBzdXBwb3NlZCB0byBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0Rvd25sb2FkcycsIGV4dGVuc2lvbiwgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9XG5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuZW5hYmxlZCApIHtcblx0XHRcdFx0Ly8gYW55IGxpbmsgY291bGQgYmUgYW4gYWZmaWxpYXRlLCBpIGd1ZXNzP1xuXHRcdFx0XHQkKCAnYScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0XHQvLyB0cmFjayBhZmZpbGlhdGVzXG5cdFx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKSB7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tBZmZpbGlhdGUgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHRcdHZhciBpc0FmZmlsaWF0ZSA9IGNoZWNrQWZmaWxpYXRlLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0FmZmlsaWF0ZSApIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWZmaWxpYXRlJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBsaW5rIGZyYWdtZW50cyBhcyBwYWdldmlld3Ncblx0XHRcdC8vIGRvZXMgbm90IHVzZSB0aGUgZXZlbnQgdHJhY2tpbmcgbWV0aG9kXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50ICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudC5lbmFibGVkICkge1xuXHRcdFx0XHRpZiAoIHR5cGVvZiBnYSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdFx0d2luZG93Lm9uaGFzaGNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Z2EoICdzZW5kJywgJ3BhZ2V2aWV3JywgbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBsb2NhdGlvbi5oYXNoICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIHdoZW4gYSBidXR0b24gaXMgY2xpY2tlZCwgYXR0YWNoIGl0IHRvIHRoZSBmb3JtJ3MgZGF0YVxuXHRcdFx0JCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLm9uKCAnY2xpY2snLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIGZvcm0gPSAkKCB0aGlzICkucGFyZW50cyggJ2Zvcm06Zmlyc3QnICk7XG5cdFx0XHRcdCQoIGZvcm0gKS5kYXRhKCAnYnV0dG9uJywgdGhpcyApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGJhc2ljIGZvcm0gc3VibWl0cy4gdHJhY2sgc3VibWl0IGluc3RlYWQgb2YgY2xpY2sgYmVjYXVzZSBvdGhlcndpc2UgaXQncyB3ZWlyZC5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucyAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucy5lbmFibGVkICkge1xuXHRcdFx0XHQkKCAnZm9ybScgKS5zdWJtaXQoIGZ1bmN0aW9uKCBmICkge1xuXHRcdFx0XHRcdHZhciBidXR0b24gPSAkKCB0aGlzICkuZGF0YSggJ2J1dHRvbicgKSB8fCAkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkuZ2V0KCAwICk7XG5cdFx0ICAgICAgICAgICAgdmFyIGNhdGVnb3J5ID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWNhdGVnb3J5JyApIHx8ICdGb3JtJztcblx0XHQgICAgICAgICAgICB2YXIgYWN0aW9uID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWFjdGlvbicgKSB8fCAnU3VibWl0Jztcblx0XHQgICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtbGFiZWwnICkgfHwgJCggYnV0dG9uICkudGV4dCgpIHx8IGJ1dHRvbi52YWx1ZSB8fCBidXR0b24ubmFtZTtcblx0XHQgICAgICAgICAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0ICAgICAgICB9KTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmxvZyggJ25vIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncycgKTtcblx0XHR9XG5cdH1cblxuXHQkKCBkb2N1bWVudCApLnJlYWR5KCBmdW5jdGlvbigpIHtcblx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKTtcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnRyYWNrX2FkYmxvY2tlciAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MudHJhY2tfYWRibG9ja2VyLmVuYWJsZWQgKSB7XG5cdFx0XHRpZiAoIHR5cGVvZiB3aW5kb3cuYWRibG9ja0RldGVjdG9yID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPbicsIHsgJ25vbkludGVyYWN0aW9uJzogMSB9ICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZGVidWc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Zm91bmQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09uJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRub3RGb3VuZDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT2ZmJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxufSApKCBqUXVlcnkgKTtcbiJdfQ==
