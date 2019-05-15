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

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

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
      } // basic form submits


      if ('undefined' !== typeof analytics_tracking_settings.form_submissions && true === analytics_tracking_settings.form_submissions.enabled) {
        $('input[type="submit"], button[type="submit"]').click(function (f) {
          var category = $(this).data('ga-category') || 'Form';
          var action = $(this).data('ga-action') || 'Submit';
          var label = $(this).data('ga-label') || this.name || this.value;
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFkYmxvY2tEZXRlY3Rvci5qcyIsImpxdWVyeS5zY3JvbGxkZXB0aC5taW4uanMiLCJ3cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwibiIsInIiLCJvIiwibWluSGVpZ2h0IiwiZWxlbWVudHMiLCJwZXJjZW50YWdlIiwidXNlclRpbWluZyIsInBpeGVsRGVwdGgiLCJub25JbnRlcmFjdGlvbiIsImdhR2xvYmFsIiwiZ3RtT3ZlcnJpZGUiLCJ0cmFja2VyTmFtZSIsImRhdGFMYXllciIsImEiLCJsIiwiYyIsInUiLCJzY3JvbGxEZXB0aCIsInAiLCJzIiwiZXZlbnQiLCJldmVudENhdGVnb3J5IiwiZXZlbnRBY3Rpb24iLCJldmVudExhYmVsIiwiZXZlbnRWYWx1ZSIsImV2ZW50Tm9uSW50ZXJhY3Rpb24iLCJhcmd1bWVudHMiLCJldmVudFRpbWluZyIsIl9nYXEiLCJoIiwicGFyc2VJbnQiLCJnIiwiZWFjaCIsImluQXJyYXkiLCJmIiwib2Zmc2V0IiwidG9wIiwiTWF0aCIsImZsb29yIiwidG9TdHJpbmciLCJtIiwieSIsIkRhdGUiLCJhcHBseSIsIm9uIiwiaGVpZ2h0IiwiaW5uZXJIZWlnaHQiLCJzY3JvbGxUb3AiLCJEIiwib2ZmIiwiZXh0ZW5kIiwiZ2EiLCJfX2dhVHJhY2tlciIsImV2ZW50SGFuZGxlciIsInJlc2V0IiwiYWRkRWxlbWVudHMiLCJpc0FycmF5IiwibWVyZ2UiLCJyZW1vdmVFbGVtZW50cyIsInNwbGljZSIsIiQiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwIiwic2Nyb2xsRGVwdGhTZXR0aW5ncyIsImFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyIsInNjcm9sbCIsImVuYWJsZWQiLCJhbmFseXRpY3NfdHlwZSIsIm1pbmltdW1faGVpZ2h0IiwidXNlcl90aW1pbmciLCJwaXhlbF9kZXB0aCIsIm5vbl9pbnRlcmFjdGlvbiIsInNjcm9sbF9lbGVtZW50cyIsIm1hcCIsInNwbGl0IiwidHJpbSIsInNwZWNpYWwiLCJkb21haW4iLCJjbGljayIsImhyZWYiLCJzdWJzdHJpbmciLCJkb3dubG9hZF9yZWdleCIsImNoZWNrRG93bmxvYWQiLCJSZWdFeHAiLCJpc0Rvd25sb2FkIiwiY2hlY2tEb3dubG9hZEV4dGVuc2lvbiIsImV4dGVuc2lvblJlc3VsdCIsImV4ZWMiLCJleHRlbnNpb24iLCJhZmZpbGlhdGUiLCJhZmZpbGlhdGVfcmVnZXgiLCJjaGVja0FmZmlsaWF0ZSIsImlzQWZmaWxpYXRlIiwiZnJhZ21lbnQiLCJvbmhhc2hjaGFuZ2UiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsImZvcm1fc3VibWlzc2lvbnMiLCJuYW1lIiwicmVhZHkiLCJ0cmFja19hZGJsb2NrZXIiLCJhZGJsb2NrRGV0ZWN0b3IiLCJub3RGb3VuZCJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBaUNBOztBQUNBLENBQUMsVUFBU0EsR0FBVCxFQUFjO0FBRWQsTUFBSUMsT0FBTyxHQUFHLEtBQWQ7QUFFQSxNQUFJQyxHQUFHLEdBQUcsUUFBVjtBQUFBLE1BQW9CQyxFQUFFLEdBQUcsUUFBekI7O0FBQ0EsTUFBSUMsSUFBSSxHQUFHLFNBQVBBLElBQU8sR0FBVSxDQUFFLENBQXZCOztBQUVBLE1BQUlDLFVBQVUsR0FBRyxLQUFqQjtBQUNBLE1BQUlDLGFBQWEsR0FBRyxLQUFwQjtBQUVBLE1BQUlDLGFBQWEsR0FBSVAsR0FBRyxDQUFDUSxnQkFBSixLQUF5QkMsU0FBOUM7QUFFQTs7Ozs7QUFJQSxNQUFJQyxRQUFRLEdBQUc7QUFDZEMsSUFBQUEsU0FBUyxFQUFFLEVBREc7QUFFZEMsSUFBQUEsT0FBTyxFQUFFLENBRks7QUFHZEMsSUFBQUEsS0FBSyxFQUFFLElBSE87QUFJZEMsSUFBQUEsS0FBSyxFQUFFVixJQUpPO0FBSUk7QUFDbEJXLElBQUFBLFFBQVEsRUFBRVgsSUFMSTtBQUtNO0FBQ3BCWSxJQUFBQSxRQUFRLEVBQUVaLElBTkksQ0FNTTs7QUFOTixHQUFmOztBQVNBLFdBQVNhLFdBQVQsQ0FBcUJDLElBQXJCLEVBQTBCO0FBQ3pCLFFBQUlDLE1BQUosRUFBWUMsTUFBWjs7QUFDQSxRQUFHO0FBQ0ZELE1BQUFBLE1BQU0sR0FBR0UsSUFBSSxDQUFDQyxLQUFMLENB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QUEyQixDQUFFLE9BQUYsRUFBVyxTQUFYLEVBQXNCLElBQXRCLEVBQTRCO0FBQUUsZ0NBQWtCO0FBQXBCLGFBQTVCLENBQTNCO0FBQ0EsV0FKRjtBQUtDZ0QsVUFBQUEsUUFBUSxFQUFFLG9CQUFXO0FBQ3BCaEQsWUFBQUEsMkJBQTJCLENBQUUsT0FBRixFQUFXLFNBQVgsRUFBc0IsS0FBdEIsRUFBNkI7QUFBRSxnQ0FBa0I7QUFBcEIsYUFBN0IsQ0FBM0I7QUFDQTtBQVBGLFNBREQ7QUFXQTtBQUNEO0FBQ0QsR0FuQkQ7QUFxQkEsQ0EzS0QsRUEyS0s5RCxNQTNLTCIsImZpbGUiOiJ3cC1hbmFseXRpY3MtdHJhY2tpbmctZ2VuZXJhdG9yLWZyb250LWVuZC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBBZEJsb2NrIGRldGVjdG9yXG4vL1xuLy8gQXR0ZW1wdHMgdG8gZGV0ZWN0IHRoZSBwcmVzZW5jZSBvZiBBZCBCbG9ja2VyIHNvZnR3YXJlIGFuZCBub3RpZnkgbGlzdGVuZXIgb2YgaXRzIGV4aXN0ZW5jZS5cbi8vIENvcHlyaWdodCAoYykgMjAxNyBJQUJcbi8vXG4vLyBUaGUgQlNELTMgTGljZW5zZVxuLy8gUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuLy8gMS4gUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuLy8gMi4gUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuLy8gMy4gTmVpdGhlciB0aGUgbmFtZSBvZiB0aGUgY29weXJpZ2h0IGhvbGRlciBub3IgdGhlIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuLy8gVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1IgQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUzsgTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4qIEBuYW1lIHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3JcbipcbiogSUFCIEFkYmxvY2sgZGV0ZWN0b3IuXG4qIFVzYWdlOiB3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQob3B0aW9ucyk7XG4qXG4qIE9wdGlvbnMgb2JqZWN0IHNldHRpbmdzXG4qXG4qXHRAcHJvcCBkZWJ1ZzogIGJvb2xlYW5cbiogICAgICAgICBGbGFnIHRvIGluZGljYXRlIGFkZGl0aW9uYWwgZGVidWcgb3V0cHV0IHNob3VsZCBiZSBwcmludGVkIHRvIGNvbnNvbGVcbipcbipcdEBwcm9wIGZvdW5kOiBAZnVuY3Rpb25cbiogICAgICAgICBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIGlmIGFkYmxvY2sgaXMgZGV0ZWN0ZWRcbipcbipcdEBwcm9wIG5vdGZvdW5kOiBAZnVuY3Rpb25cbiogICAgICAgICBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIGlmIGFkYmxvY2sgaXMgbm90IGRldGVjdGVkLlxuKiAgICAgICAgIE5PVEU6IHRoaXMgZnVuY3Rpb24gbWF5IGZpcmUgbXVsdGlwbGUgdGltZXMgYW5kIGdpdmUgZmFsc2UgbmVnYXRpdmVcbiogICAgICAgICByZXNwb25zZXMgZHVyaW5nIGEgdGVzdCB1bnRpbCBhZGJsb2NrIGlzIHN1Y2Nlc3NmdWxseSBkZXRlY3RlZC5cbipcbipcdEBwcm9wIGNvbXBsZXRlOiBAZnVuY3Rpb25cbiogICAgICAgICBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9uY2UgYSByb3VuZCBvZiB0ZXN0aW5nIGlzIGNvbXBsZXRlLlxuKiAgICAgICAgIFRoZSB0ZXN0IHJlc3VsdCAoYm9vbGVhbikgaXMgaW5jbHVkZWQgYXMgYSBwYXJhbWV0ZXIgdG8gY2FsbGJhY2tcbipcbiogZXhhbXBsZTogXHR3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmb3VuZDogZnVuY3Rpb24oKXsgLi4ufSxcbiBcdFx0XHRcdFx0bm90Rm91bmQ6IGZ1bmN0aW9uKCl7Li4ufVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuKlxuKlxuKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG4oZnVuY3Rpb24od2luKSB7XG5cblx0dmFyIHZlcnNpb24gPSAnMS4wJztcblxuXHR2YXIgb2ZzID0gJ29mZnNldCcsIGNsID0gJ2NsaWVudCc7XG5cdHZhciBub29wID0gZnVuY3Rpb24oKXt9O1xuXG5cdHZhciB0ZXN0ZWRPbmNlID0gZmFsc2U7XG5cdHZhciB0ZXN0RXhlY3V0aW5nID0gZmFsc2U7XG5cblx0dmFyIGlzT2xkSUVldmVudHMgPSAod2luLmFkZEV2ZW50TGlzdGVuZXIgPT09IHVuZGVmaW5lZCk7XG5cblx0LyoqXG5cdCogT3B0aW9ucyBzZXQgd2l0aCBkZWZhdWx0IG9wdGlvbnMgaW5pdGlhbGl6ZWRcblx0KlxuXHQqL1xuXHR2YXIgX29wdGlvbnMgPSB7XG5cdFx0bG9vcERlbGF5OiA1MCxcblx0XHRtYXhMb29wOiA1LFxuXHRcdGRlYnVnOiB0cnVlLFxuXHRcdGZvdW5kOiBub29wLCBcdFx0XHRcdFx0Ly8gZnVuY3Rpb24gdG8gZmlyZSB3aGVuIGFkYmxvY2sgZGV0ZWN0ZWRcblx0XHRub3Rmb3VuZDogbm9vcCwgXHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIGlmIGFkYmxvY2sgbm90IGRldGVjdGVkIGFmdGVyIHRlc3Rpbmdcblx0XHRjb21wbGV0ZTogbm9vcCAgXHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIGFmdGVyIHRlc3RpbmcgY29tcGxldGVzLCBwYXNzaW5nIHJlc3VsdCBhcyBwYXJhbWV0ZXJcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlQXNKc29uKGRhdGEpe1xuXHRcdHZhciByZXN1bHQsIGZuRGF0YTtcblx0XHR0cnl7XG5cdFx0XHRyZXN1bHQgPSBKU09OLnBhcnNlKGRhdGEpO1xuXHRcdH1cblx0XHRjYXRjaChleCl7XG5cdFx0XHR0cnl7XG5cdFx0XHRcdGZuRGF0YSA9IG5ldyBGdW5jdGlvbihcInJldHVybiBcIiArIGRhdGEpO1xuXHRcdFx0XHRyZXN1bHQgPSBmbkRhdGEoKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0bG9nKCdGYWlsZWQgc2Vjb25kYXJ5IEpTT04gcGFyc2UnLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCogQWpheCBoZWxwZXIgb2JqZWN0IHRvIGRvd25sb2FkIGV4dGVybmFsIHNjcmlwdHMuXG5cdCogSW5pdGlhbGl6ZSBvYmplY3Qgd2l0aCBhbiBvcHRpb25zIG9iamVjdFxuXHQqIEV4OlxuXHQgIHtcblx0XHQgIHVybCA6ICdodHRwOi8vZXhhbXBsZS5vcmcvdXJsX3RvX2Rvd25sb2FkJyxcblx0XHQgIG1ldGhvZDogJ1BPU1R8R0VUJyxcblx0XHQgIHN1Y2Nlc3M6IGNhbGxiYWNrX2Z1bmN0aW9uLFxuXHRcdCAgZmFpbDogIGNhbGxiYWNrX2Z1bmN0aW9uXG5cdCAgfVxuXHQqL1xuXHR2YXIgQWpheEhlbHBlciA9IGZ1bmN0aW9uKG9wdHMpe1xuXHRcdHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuXHRcdHRoaXMuc3VjY2VzcyA9IG9wdHMuc3VjY2VzcyB8fCBub29wO1xuXHRcdHRoaXMuZmFpbCA9IG9wdHMuZmFpbCB8fCBub29wO1xuXHRcdHZhciBtZSA9IHRoaXM7XG5cblx0XHR2YXIgbWV0aG9kID0gb3B0cy5tZXRob2QgfHwgJ2dldCc7XG5cblx0XHQvKipcblx0XHQqIEFib3J0IHRoZSByZXF1ZXN0XG5cdFx0Ki9cblx0XHR0aGlzLmFib3J0ID0gZnVuY3Rpb24oKXtcblx0XHRcdHRyeXtcblx0XHRcdFx0eGhyLmFib3J0KCk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc3RhdGVDaGFuZ2UodmFscyl7XG5cdFx0XHRpZih4aHIucmVhZHlTdGF0ZSA9PSA0KXtcblx0XHRcdFx0aWYoeGhyLnN0YXR1cyA9PSAyMDApe1xuXHRcdFx0XHRcdG1lLnN1Y2Nlc3MoeGhyLnJlc3BvbnNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNle1xuXHRcdFx0XHRcdC8vIGZhaWxlZFxuXHRcdFx0XHRcdG1lLmZhaWwoeGhyLnN0YXR1cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gc3RhdGVDaGFuZ2U7XG5cblx0XHRmdW5jdGlvbiBzdGFydCgpe1xuXHRcdFx0eGhyLm9wZW4obWV0aG9kLCBvcHRzLnVybCwgdHJ1ZSk7XG5cdFx0XHR4aHIuc2VuZCgpO1xuXHRcdH1cblxuXHRcdHN0YXJ0KCk7XG5cdH1cblxuXHQvKipcblx0KiBPYmplY3QgdHJhY2tpbmcgdGhlIHZhcmlvdXMgYmxvY2sgbGlzdHNcblx0Ki9cblx0dmFyIEJsb2NrTGlzdFRyYWNrZXIgPSBmdW5jdGlvbigpe1xuXHRcdHZhciBtZSA9IHRoaXM7XG5cdFx0dmFyIGV4dGVybmFsQmxvY2tsaXN0RGF0YSA9IHt9O1xuXG5cdFx0LyoqXG5cdFx0KiBBZGQgYSBuZXcgZXh0ZXJuYWwgVVJMIHRvIHRyYWNrXG5cdFx0Ki9cblx0XHR0aGlzLmFkZFVybCA9IGZ1bmN0aW9uKHVybCl7XG5cdFx0XHRleHRlcm5hbEJsb2NrbGlzdERhdGFbdXJsXSA9IHtcblx0XHRcdFx0dXJsOiB1cmwsXG5cdFx0XHRcdHN0YXRlOiAncGVuZGluZycsXG5cdFx0XHRcdGZvcm1hdDogbnVsbCxcblx0XHRcdFx0ZGF0YTogbnVsbCxcblx0XHRcdFx0cmVzdWx0OiBudWxsXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBleHRlcm5hbEJsb2NrbGlzdERhdGFbdXJsXTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQqIExvYWRzIGEgYmxvY2sgbGlzdCBkZWZpbml0aW9uXG5cdFx0Ki9cblx0XHR0aGlzLnNldFJlc3VsdCA9IGZ1bmN0aW9uKHVybEtleSwgc3RhdGUsIGRhdGEpe1xuXHRcdFx0dmFyIG9iaiA9IGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxLZXldO1xuXHRcdFx0aWYob2JqID09IG51bGwpe1xuXHRcdFx0XHRvYmogPSB0aGlzLmFkZFVybCh1cmxLZXkpO1xuXHRcdFx0fVxuXG5cdFx0XHRvYmouc3RhdGUgPSBzdGF0ZTtcblx0XHRcdGlmKGRhdGEgPT0gbnVsbCl7XG5cdFx0XHRcdG9iai5yZXN1bHQgPSBudWxsO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJyl7XG5cdFx0XHRcdHRyeXtcblx0XHRcdFx0XHRkYXRhID0gcGFyc2VBc0pzb24oZGF0YSk7XG5cdFx0XHRcdFx0b2JqLmZvcm1hdCA9ICdqc29uJztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdFx0b2JqLmZvcm1hdCA9ICdlYXN5bGlzdCc7XG5cdFx0XHRcdFx0Ly8gcGFyc2VFYXN5TGlzdChkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0b2JqLmRhdGEgPSBkYXRhO1xuXG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH1cblxuXHR9XG5cblx0dmFyIGxpc3RlbmVycyA9IFtdOyAvLyBldmVudCByZXNwb25zZSBsaXN0ZW5lcnNcblx0dmFyIGJhaXROb2RlID0gbnVsbDtcblx0dmFyIHF1aWNrQmFpdCA9IHtcblx0XHRjc3NDbGFzczogJ3B1Yl8zMDB4MjUwIHB1Yl8zMDB4MjUwbSBwdWJfNzI4eDkwIHRleHQtYWQgdGV4dEFkIHRleHRfYWQgdGV4dF9hZHMgdGV4dC1hZHMgdGV4dC1hZC1saW5rcydcblx0fTtcblx0dmFyIGJhaXRUcmlnZ2VycyA9IHtcblx0XHRudWxsUHJvcHM6IFtvZnMgKyAnUGFyZW50J10sXG5cdFx0emVyb1Byb3BzOiBbXVxuXHR9O1xuXG5cdGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMgPSBbXG5cdFx0b2ZzICsnSGVpZ2h0Jywgb2ZzICsnTGVmdCcsIG9mcyArJ1RvcCcsIG9mcyArJ1dpZHRoJywgb2ZzICsnSGVpZ2h0Jyxcblx0XHRjbCArICdIZWlnaHQnLCBjbCArICdXaWR0aCdcblx0XTtcblxuXHQvLyByZXN1bHQgb2JqZWN0XG5cdHZhciBleGVSZXN1bHQgPSB7XG5cdFx0cXVpY2s6IG51bGwsXG5cdFx0cmVtb3RlOiBudWxsXG5cdH07XG5cblx0dmFyIGZpbmRSZXN1bHQgPSBudWxsOyAvLyByZXN1bHQgb2YgdGVzdCBmb3IgYWQgYmxvY2tlclxuXG5cdHZhciB0aW1lcklkcyA9IHtcblx0XHR0ZXN0OiAwLFxuXHRcdGRvd25sb2FkOiAwXG5cdH07XG5cblx0ZnVuY3Rpb24gaXNGdW5jKGZuKXtcblx0XHRyZXR1cm4gdHlwZW9mKGZuKSA9PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0LyoqXG5cdCogTWFrZSBhIERPTSBlbGVtZW50XG5cdCovXG5cdGZ1bmN0aW9uIG1ha2VFbCh0YWcsIGF0dHJpYnV0ZXMpe1xuXHRcdHZhciBrLCB2LCBlbCwgYXR0ciA9IGF0dHJpYnV0ZXM7XG5cdFx0dmFyIGQgPSBkb2N1bWVudDtcblxuXHRcdGVsID0gZC5jcmVhdGVFbGVtZW50KHRhZyk7XG5cblx0XHRpZihhdHRyKXtcblx0XHRcdGZvcihrIGluIGF0dHIpe1xuXHRcdFx0XHRpZihhdHRyLmhhc093blByb3BlcnR5KGspKXtcblx0XHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoaywgYXR0cltrXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBhdHRhY2hFdmVudExpc3RlbmVyKGRvbSwgZXZlbnROYW1lLCBoYW5kbGVyKXtcblx0XHRpZihpc09sZElFZXZlbnRzKXtcblx0XHRcdGRvbS5hdHRhY2hFdmVudCgnb24nICsgZXZlbnROYW1lLCBoYW5kbGVyKTtcblx0XHR9XG5cdFx0ZWxzZXtcblx0XHRcdGRvbS5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgaGFuZGxlciwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGxvZyhtZXNzYWdlLCBpc0Vycm9yKXtcblx0XHRpZighX29wdGlvbnMuZGVidWcgJiYgIWlzRXJyb3Ipe1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZih3aW4uY29uc29sZSAmJiB3aW4uY29uc29sZS5sb2cpe1xuXHRcdFx0aWYoaXNFcnJvcil7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ1tBQkRdICcgKyBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdGVsc2V7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdbQUJEXSAnICsgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dmFyIGFqYXhEb3dubG9hZHMgPSBbXTtcblxuXHQvKipcblx0KiBMb2FkIGFuZCBleGVjdXRlIHRoZSBVUkwgaW5zaWRlIGEgY2xvc3VyZSBmdW5jdGlvblxuXHQqL1xuXHRmdW5jdGlvbiBsb2FkRXhlY3V0ZVVybCh1cmwpe1xuXHRcdHZhciBhamF4LCByZXN1bHQ7XG5cblx0XHRibG9ja0xpc3RzLmFkZFVybCh1cmwpO1xuXHRcdC8vIHNldHVwIGNhbGwgZm9yIHJlbW90ZSBsaXN0XG5cdFx0YWpheCA9IG5ldyBBamF4SGVscGVyKFxuXHRcdFx0e1xuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0c3VjY2VzczogZnVuY3Rpb24oZGF0YSl7XG5cdFx0XHRcdFx0bG9nKCdkb3dubG9hZGVkIGZpbGUgJyArIHVybCk7IC8vIHRvZG8gLSBwYXJzZSBhbmQgc3RvcmUgdW50aWwgdXNlXG5cdFx0XHRcdFx0cmVzdWx0ID0gYmxvY2tMaXN0cy5zZXRSZXN1bHQodXJsLCAnc3VjY2VzcycsIGRhdGEpO1xuXHRcdFx0XHRcdHRyeXtcblx0XHRcdFx0XHRcdHZhciBpbnRlcnZhbElkID0gMCxcblx0XHRcdFx0XHRcdFx0cmV0cnlDb3VudCA9IDA7XG5cblx0XHRcdFx0XHRcdHZhciB0cnlFeGVjdXRlVGVzdCA9IGZ1bmN0aW9uKGxpc3REYXRhKXtcblx0XHRcdFx0XHRcdFx0aWYoIXRlc3RFeGVjdXRpbmcpe1xuXHRcdFx0XHRcdFx0XHRcdGJlZ2luVGVzdChsaXN0RGF0YSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZihmaW5kUmVzdWx0ID09IHRydWUpe1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmKHRyeUV4ZWN1dGVUZXN0KHJlc3VsdC5kYXRhKSl7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0XHRcdGxvZygnUGF1c2UgYmVmb3JlIHRlc3QgZXhlY3V0aW9uJyk7XG5cdFx0XHRcdFx0XHRcdGludGVydmFsSWQgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdFx0XHRcdGlmKHRyeUV4ZWN1dGVUZXN0KHJlc3VsdC5kYXRhKSB8fCByZXRyeUNvdW50KysgPiA1KXtcblx0XHRcdFx0XHRcdFx0XHRcdGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxJZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LCAyNTApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdFx0XHRsb2coZXgubWVzc2FnZSArICcgdXJsOiAnICsgdXJsLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZhaWw6IGZ1bmN0aW9uKHN0YXR1cyl7XG5cdFx0XHRcdFx0bG9nKHN0YXR1cywgdHJ1ZSk7XG5cdFx0XHRcdFx0YmxvY2tMaXN0cy5zZXRSZXN1bHQodXJsLCAnZXJyb3InLCBudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRhamF4RG93bmxvYWRzLnB1c2goYWpheCk7XG5cdH1cblxuXG5cdC8qKlxuXHQqIEZldGNoIHRoZSBleHRlcm5hbCBsaXN0cyBhbmQgaW5pdGlhdGUgdGhlIHRlc3RzXG5cdCovXG5cdGZ1bmN0aW9uIGZldGNoUmVtb3RlTGlzdHMoKXtcblx0XHR2YXIgaSwgdXJsO1xuXHRcdHZhciBvcHRzID0gX29wdGlvbnM7XG5cblx0XHRmb3IoaT0wO2k8b3B0cy5ibG9ja0xpc3RzLmxlbmd0aDtpKyspe1xuXHRcdFx0dXJsID0gb3B0cy5ibG9ja0xpc3RzW2ldO1xuXHRcdFx0bG9hZEV4ZWN1dGVVcmwodXJsKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjYW5jZWxSZW1vdGVEb3dubG9hZHMoKXtcblx0XHR2YXIgaSwgYWo7XG5cblx0XHRmb3IoaT1hamF4RG93bmxvYWRzLmxlbmd0aC0xO2kgPj0gMDtpLS0pe1xuXHRcdFx0YWogPSBhamF4RG93bmxvYWRzLnBvcCgpO1xuXHRcdFx0YWouYWJvcnQoKTtcblx0XHR9XG5cdH1cblxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8qKlxuXHQqIEJlZ2luIGV4ZWN1dGlvbiBvZiB0aGUgdGVzdFxuXHQqL1xuXHRmdW5jdGlvbiBiZWdpblRlc3QoYmFpdCl7XG5cdFx0bG9nKCdzdGFydCBiZWdpblRlc3QnKTtcblx0XHRpZihmaW5kUmVzdWx0ID09IHRydWUpe1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBmb3VuZCBpdC4gZG9uJ3QgY29udGludWUgZXhlY3V0aW5nXG5cdFx0fVxuXHRcdHRlc3RFeGVjdXRpbmcgPSB0cnVlO1xuXHRcdGNhc3RCYWl0KGJhaXQpO1xuXG5cdFx0ZXhlUmVzdWx0LnF1aWNrID0gJ3Rlc3RpbmcnO1xuXG5cdFx0dGltZXJJZHMudGVzdCA9IHNldFRpbWVvdXQoXG5cdFx0XHRmdW5jdGlvbigpeyByZWVsSW4oYmFpdCwgMSk7IH0sXG5cdFx0XHQ1KTtcblx0fVxuXG5cdC8qKlxuXHQqIENyZWF0ZSB0aGUgYmFpdCBub2RlIHRvIHNlZSBob3cgdGhlIGJyb3dzZXIgcGFnZSByZWFjdHNcblx0Ki9cblx0ZnVuY3Rpb24gY2FzdEJhaXQoYmFpdCl7XG5cdFx0dmFyIGksIGQgPSBkb2N1bWVudCwgYiA9IGQuYm9keTtcblx0XHR2YXIgdDtcblx0XHR2YXIgYmFpdFN0eWxlID0gJ3dpZHRoOiAxcHggIWltcG9ydGFudDsgaGVpZ2h0OiAxcHggIWltcG9ydGFudDsgcG9zaXRpb246IGFic29sdXRlICFpbXBvcnRhbnQ7IGxlZnQ6IC0xMDAwMHB4ICFpbXBvcnRhbnQ7IHRvcDogLTEwMDBweCAhaW1wb3J0YW50OydcblxuXHRcdGlmKGJhaXQgPT0gbnVsbCB8fCB0eXBlb2YoYmFpdCkgPT0gJ3N0cmluZycpe1xuXHRcdFx0bG9nKCdpbnZhbGlkIGJhaXQgYmVpbmcgY2FzdCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmKGJhaXQuc3R5bGUgIT0gbnVsbCl7XG5cdFx0XHRiYWl0U3R5bGUgKz0gYmFpdC5zdHlsZTtcblx0XHR9XG5cblx0XHRiYWl0Tm9kZSA9IG1ha2VFbCgnZGl2Jywge1xuXHRcdFx0J2NsYXNzJzogYmFpdC5jc3NDbGFzcyxcblx0XHRcdCdzdHlsZSc6IGJhaXRTdHlsZVxuXHRcdH0pO1xuXG5cdFx0bG9nKCdhZGRpbmcgYmFpdCBub2RlIHRvIERPTScpO1xuXG5cdFx0Yi5hcHBlbmRDaGlsZChiYWl0Tm9kZSk7XG5cblx0XHQvLyB0b3VjaCB0aGVzZSBwcm9wZXJ0aWVzXG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy5udWxsUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHR0ID0gYmFpdE5vZGVbYmFpdFRyaWdnZXJzLm51bGxQcm9wc1tpXV07XG5cdFx0fVxuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMuemVyb1Byb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0dCA9IGJhaXROb2RlW2JhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV1dO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQqIFJ1biB0ZXN0cyB0byBzZWUgaWYgYnJvd3NlciBoYXMgdGFrZW4gdGhlIGJhaXQgYW5kIGJsb2NrZWQgdGhlIGJhaXQgZWxlbWVudFxuXHQqL1xuXHRmdW5jdGlvbiByZWVsSW4oYmFpdCwgYXR0ZW1wdE51bSl7XG5cdFx0dmFyIGksIGssIHY7XG5cdFx0dmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xuXHRcdHZhciBmb3VuZCA9IGZhbHNlO1xuXG5cdFx0aWYoYmFpdE5vZGUgPT0gbnVsbCl7XG5cdFx0XHRsb2coJ3JlY2FzdCBiYWl0Jyk7XG5cdFx0XHRjYXN0QmFpdChiYWl0IHx8IHF1aWNrQmFpdCk7XG5cdFx0fVxuXG5cdFx0aWYodHlwZW9mKGJhaXQpID09ICdzdHJpbmcnKXtcblx0XHRcdGxvZygnaW52YWxpZCBiYWl0IHVzZWQnLCB0cnVlKTtcblx0XHRcdGlmKGNsZWFyQmFpdE5vZGUoKSl7XG5cdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHR0ZXN0RXhlY3V0aW5nID0gZmFsc2U7XG5cdFx0XHRcdH0sIDUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYodGltZXJJZHMudGVzdCA+IDApe1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVySWRzLnRlc3QpO1xuXHRcdFx0dGltZXJJZHMudGVzdCA9IDA7XG5cdFx0fVxuXG5cdFx0Ly8gdGVzdCBmb3IgaXNzdWVzXG5cblx0XHRpZihib2R5LmdldEF0dHJpYnV0ZSgnYWJwJykgIT09IG51bGwpe1xuXHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIGJvZHkgYXR0cmlidXRlJyk7XG5cdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy5udWxsUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHRpZihiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldXSA9PSBudWxsKXtcblx0XHRcdFx0aWYoYXR0ZW1wdE51bT40KVxuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGxvZygnZm91bmQgYWRibG9jayBudWxsIGF0dHI6ICcgKyBiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZihmb3VuZCA9PSB0cnVlKXtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHRpZihmb3VuZCA9PSB0cnVlKXtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZihiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMuemVyb1Byb3BzW2ldXSA9PSAwKXtcblx0XHRcdFx0aWYoYXR0ZW1wdE51bT40KVxuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGxvZygnZm91bmQgYWRibG9jayB6ZXJvIGF0dHI6ICcgKyBiYWl0VHJpZ2dlcnMuemVyb1Byb3BzW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZih3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YXIgYmFpdFRlbXAgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShiYWl0Tm9kZSwgbnVsbCk7XG5cdFx0XHRpZihiYWl0VGVtcC5nZXRQcm9wZXJ0eVZhbHVlKCdkaXNwbGF5JykgPT0gJ25vbmUnXG5cdFx0XHR8fCBiYWl0VGVtcC5nZXRQcm9wZXJ0eVZhbHVlKCd2aXNpYmlsaXR5JykgPT0gJ2hpZGRlbicpIHtcblx0XHRcdFx0aWYoYXR0ZW1wdE51bT40KVxuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGxvZygnZm91bmQgYWRibG9jayBjb21wdXRlZFN0eWxlIGluZGljYXRvcicpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3RlZE9uY2UgPSB0cnVlO1xuXG5cdFx0aWYoZm91bmQgfHwgYXR0ZW1wdE51bSsrID49IF9vcHRpb25zLm1heExvb3Ape1xuXHRcdFx0ZmluZFJlc3VsdCA9IGZvdW5kO1xuXHRcdFx0bG9nKCdleGl0aW5nIHRlc3QgbG9vcCAtIHZhbHVlOiAnICsgZmluZFJlc3VsdCk7XG5cdFx0XHRub3RpZnlMaXN0ZW5lcnMoKTtcblx0XHRcdGlmKGNsZWFyQmFpdE5vZGUoKSl7XG5cdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHR0ZXN0RXhlY3V0aW5nID0gZmFsc2U7XG5cdFx0XHRcdH0sIDUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0dGltZXJJZHMudGVzdCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0cmVlbEluKGJhaXQsIGF0dGVtcHROdW0pO1xuXHRcdFx0fSwgX29wdGlvbnMubG9vcERlbGF5KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjbGVhckJhaXROb2RlKCl7XG5cdFx0aWYoYmFpdE5vZGUgPT09IG51bGwpe1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0dHJ5e1xuXHRcdFx0aWYoaXNGdW5jKGJhaXROb2RlLnJlbW92ZSkpe1xuXHRcdFx0XHRiYWl0Tm9kZS5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHRcdGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYmFpdE5vZGUpO1xuXHRcdH1cblx0XHRjYXRjaChleCl7XG5cdFx0fVxuXHRcdGJhaXROb2RlID0gbnVsbDtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCogSGFsdCB0aGUgdGVzdCBhbmQgYW55IHBlbmRpbmcgdGltZW91dHNcblx0Ki9cblx0ZnVuY3Rpb24gc3RvcEZpc2hpbmcoKXtcblx0XHRpZih0aW1lcklkcy50ZXN0ID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMudGVzdCk7XG5cdFx0fVxuXHRcdGlmKHRpbWVySWRzLmRvd25sb2FkID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMuZG93bmxvYWQpO1xuXHRcdH1cblxuXHRcdGNhbmNlbFJlbW90ZURvd25sb2FkcygpO1xuXG5cdFx0Y2xlYXJCYWl0Tm9kZSgpO1xuXHR9XG5cblx0LyoqXG5cdCogRmlyZSBhbGwgcmVnaXN0ZXJlZCBsaXN0ZW5lcnNcblx0Ki9cblx0ZnVuY3Rpb24gbm90aWZ5TGlzdGVuZXJzKCl7XG5cdFx0dmFyIGksIGZ1bmNzO1xuXHRcdGlmKGZpbmRSZXN1bHQgPT09IG51bGwpe1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IoaT0wO2k8bGlzdGVuZXJzLmxlbmd0aDtpKyspe1xuXHRcdFx0ZnVuY3MgPSBsaXN0ZW5lcnNbaV07XG5cdFx0XHR0cnl7XG5cdFx0XHRcdGlmKGZ1bmNzICE9IG51bGwpe1xuXHRcdFx0XHRcdGlmKGlzRnVuYyhmdW5jc1snY29tcGxldGUnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ2NvbXBsZXRlJ10oZmluZFJlc3VsdCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYoZmluZFJlc3VsdCAmJiBpc0Z1bmMoZnVuY3NbJ2ZvdW5kJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydmb3VuZCddKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2UgaWYoZmluZFJlc3VsdCA9PT0gZmFsc2UgJiYgaXNGdW5jKGZ1bmNzWydub3Rmb3VuZCddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snbm90Zm91bmQnXSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRsb2coJ0ZhaWx1cmUgaW4gbm90aWZ5IGxpc3RlbmVycyAnICsgZXguTWVzc2FnZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCogQXR0YWNoZXMgZXZlbnQgbGlzdGVuZXIgb3IgZmlyZXMgaWYgZXZlbnRzIGhhdmUgYWxyZWFkeSBwYXNzZWQuXG5cdCovXG5cdGZ1bmN0aW9uIGF0dGFjaE9yRmlyZSgpe1xuXHRcdHZhciBmaXJlTm93ID0gZmFsc2U7XG5cdFx0dmFyIGZuO1xuXG5cdFx0aWYoZG9jdW1lbnQucmVhZHlTdGF0ZSl7XG5cdFx0XHRpZihkb2N1bWVudC5yZWFkeVN0YXRlID09ICdjb21wbGV0ZScpe1xuXHRcdFx0XHRmaXJlTm93ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmbiA9IGZ1bmN0aW9uKCl7XG5cdFx0XHRiZWdpblRlc3QocXVpY2tCYWl0LCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0aWYoZmlyZU5vdyl7XG5cdFx0XHRmbigpO1xuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0YXR0YWNoRXZlbnRMaXN0ZW5lcih3aW4sICdsb2FkJywgZm4pO1xuXHRcdH1cblx0fVxuXG5cblx0dmFyIGJsb2NrTGlzdHM7IC8vIHRyYWNrcyBleHRlcm5hbCBibG9jayBsaXN0c1xuXG5cdC8qKlxuXHQqIFB1YmxpYyBpbnRlcmZhY2Ugb2YgYWRibG9jayBkZXRlY3RvclxuXHQqL1xuXHR2YXIgaW1wbCA9IHtcblx0XHQvKipcblx0XHQqIFZlcnNpb24gb2YgdGhlIGFkYmxvY2sgZGV0ZWN0b3IgcGFja2FnZVxuXHRcdCovXG5cdFx0dmVyc2lvbjogdmVyc2lvbixcblxuXHRcdC8qKlxuXHRcdCogSW5pdGlhbGl6YXRpb24gZnVuY3Rpb24uIFNlZSBjb21tZW50cyBhdCB0b3AgZm9yIG9wdGlvbnMgb2JqZWN0XG5cdFx0Ki9cblx0XHRpbml0OiBmdW5jdGlvbihvcHRpb25zKXtcblx0XHRcdHZhciBrLCB2LCBmdW5jcztcblxuXHRcdFx0aWYoIW9wdGlvbnMpe1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmNzID0ge1xuXHRcdFx0XHRjb21wbGV0ZTogbm9vcCxcblx0XHRcdFx0Zm91bmQ6IG5vb3AsXG5cdFx0XHRcdG5vdGZvdW5kOiBub29wXG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IoayBpbiBvcHRpb25zKXtcblx0XHRcdFx0aWYob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShrKSl7XG5cdFx0XHRcdFx0aWYoayA9PSAnY29tcGxldGUnIHx8IGsgPT0gJ2ZvdW5kJyB8fCBrID09ICdub3RGb3VuZCcpe1xuXHRcdFx0XHRcdFx0ZnVuY3Nbay50b0xvd2VyQ2FzZSgpXSA9IG9wdGlvbnNba107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0XHRfb3B0aW9uc1trXSA9IG9wdGlvbnNba107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxpc3RlbmVycy5wdXNoKGZ1bmNzKTtcblxuXHRcdFx0YmxvY2tMaXN0cyA9IG5ldyBCbG9ja0xpc3RUcmFja2VyKCk7XG5cblx0XHRcdGF0dGFjaE9yRmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHdpblsnYWRibG9ja0RldGVjdG9yJ10gPSBpbXBsO1xuXG59KSh3aW5kb3cpXG4iLCIvKiFcbiAqIEBwcmVzZXJ2ZVxuICoganF1ZXJ5LnNjcm9sbGRlcHRoLmpzIHwgdjEuMFxuICogQ29weXJpZ2h0IChjKSAyMDE2IFJvYiBGbGFoZXJ0eSAoQHJvYmZsYWhlcnR5KVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBhbmQgR1BMIGxpY2Vuc2VzLlxuICovXG4hZnVuY3Rpb24oZSl7XCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kP2RlZmluZShbXCJqcXVlcnlcIl0sZSk6XCJvYmplY3RcIj09dHlwZW9mIG1vZHVsZSYmbW9kdWxlLmV4cG9ydHM/bW9kdWxlLmV4cG9ydHM9ZShyZXF1aXJlKFwianF1ZXJ5XCIpKTplKGpRdWVyeSl9KGZ1bmN0aW9uKGUpe1widXNlIHN0cmljdFwiO3ZhciBuLHQscixvLGk9e21pbkhlaWdodDowLGVsZW1lbnRzOltdLHBlcmNlbnRhZ2U6ITAsdXNlclRpbWluZzohMCxwaXhlbERlcHRoOiEwLG5vbkludGVyYWN0aW9uOiEwLGdhR2xvYmFsOiExLGd0bU92ZXJyaWRlOiExLHRyYWNrZXJOYW1lOiExLGRhdGFMYXllcjpcImRhdGFMYXllclwifSxhPWUod2luZG93KSxsPVtdLGM9ITEsdT0wO3JldHVybiBlLnNjcm9sbERlcHRoPWZ1bmN0aW9uKHApe2Z1bmN0aW9uIHMoZSxpLGEsbCl7dmFyIGM9cC50cmFja2VyTmFtZT9wLnRyYWNrZXJOYW1lK1wiLnNlbmRcIjpcInNlbmRcIjtvPyhvKHtldmVudDpcIlNjcm9sbERpc3RhbmNlXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOmUsZXZlbnRMYWJlbDppLGV2ZW50VmFsdWU6MSxldmVudE5vbkludGVyYWN0aW9uOnAubm9uSW50ZXJhY3Rpb259KSxwLnBpeGVsRGVwdGgmJmFyZ3VtZW50cy5sZW5ndGg+MiYmYT51JiYodT1hLG8oe2V2ZW50OlwiU2Nyb2xsRGlzdGFuY2VcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246XCJQaXhlbCBEZXB0aFwiLGV2ZW50TGFiZWw6ZChhKSxldmVudFZhbHVlOjEsZXZlbnROb25JbnRlcmFjdGlvbjpwLm5vbkludGVyYWN0aW9ufSkpLHAudXNlclRpbWluZyYmYXJndW1lbnRzLmxlbmd0aD4zJiZvKHtldmVudDpcIlNjcm9sbFRpbWluZ1wiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjplLGV2ZW50TGFiZWw6aSxldmVudFRpbWluZzpsfSkpOihuJiYod2luZG93W3JdKGMsXCJldmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsZSxpLDEse25vbkludGVyYWN0aW9uOnAubm9uSW50ZXJhY3Rpb259KSxwLnBpeGVsRGVwdGgmJmFyZ3VtZW50cy5sZW5ndGg+MiYmYT51JiYodT1hLHdpbmRvd1tyXShjLFwiZXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLFwiUGl4ZWwgRGVwdGhcIixkKGEpLDEse25vbkludGVyYWN0aW9uOnAubm9uSW50ZXJhY3Rpb259KSkscC51c2VyVGltaW5nJiZhcmd1bWVudHMubGVuZ3RoPjMmJndpbmRvd1tyXShjLFwidGltaW5nXCIsXCJTY3JvbGwgRGVwdGhcIixlLGwsaSkpLHQmJihfZ2FxLnB1c2goW1wiX3RyYWNrRXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLGUsaSwxLHAubm9uSW50ZXJhY3Rpb25dKSxwLnBpeGVsRGVwdGgmJmFyZ3VtZW50cy5sZW5ndGg+MiYmYT51JiYodT1hLF9nYXEucHVzaChbXCJfdHJhY2tFdmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsXCJQaXhlbCBEZXB0aFwiLGQoYSksMSxwLm5vbkludGVyYWN0aW9uXSkpLHAudXNlclRpbWluZyYmYXJndW1lbnRzLmxlbmd0aD4zJiZfZ2FxLnB1c2goW1wiX3RyYWNrVGltaW5nXCIsXCJTY3JvbGwgRGVwdGhcIixlLGwsaSwxMDBdKSkpfWZ1bmN0aW9uIGgoZSl7cmV0dXJue1wiMjUlXCI6cGFyc2VJbnQoLjI1KmUsMTApLFwiNTAlXCI6cGFyc2VJbnQoLjUqZSwxMCksXCI3NSVcIjpwYXJzZUludCguNzUqZSwxMCksXCIxMDAlXCI6ZS01fX1mdW5jdGlvbiBnKG4sdCxyKXtlLmVhY2gobixmdW5jdGlvbihuLG8pey0xPT09ZS5pbkFycmF5KG4sbCkmJnQ+PW8mJihzKFwiUGVyY2VudGFnZVwiLG4sdCxyKSxsLnB1c2gobikpfSl9ZnVuY3Rpb24gZihuLHQscil7ZS5lYWNoKG4sZnVuY3Rpb24obixvKXstMT09PWUuaW5BcnJheShvLGwpJiZlKG8pLmxlbmd0aCYmdD49ZShvKS5vZmZzZXQoKS50b3AmJihzKFwiRWxlbWVudHNcIixvLHQsciksbC5wdXNoKG8pKX0pfWZ1bmN0aW9uIGQoZSl7cmV0dXJuKDI1MCpNYXRoLmZsb29yKGUvMjUwKSkudG9TdHJpbmcoKX1mdW5jdGlvbiBtKCl7eSgpfWZ1bmN0aW9uIHYoZSxuKXt2YXIgdCxyLG8saT1udWxsLGE9MCxsPWZ1bmN0aW9uKCl7YT1uZXcgRGF0ZSxpPW51bGwsbz1lLmFwcGx5KHQscil9O3JldHVybiBmdW5jdGlvbigpe3ZhciBjPW5ldyBEYXRlO2F8fChhPWMpO3ZhciB1PW4tKGMtYSk7cmV0dXJuIHQ9dGhpcyxyPWFyZ3VtZW50cywwPj11PyhjbGVhclRpbWVvdXQoaSksaT1udWxsLGE9YyxvPWUuYXBwbHkodCxyKSk6aXx8KGk9c2V0VGltZW91dChsLHUpKSxvfX1mdW5jdGlvbiB5KCl7Yz0hMCxhLm9uKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIsdihmdW5jdGlvbigpe3ZhciBuPWUoZG9jdW1lbnQpLmhlaWdodCgpLHQ9d2luZG93LmlubmVySGVpZ2h0P3dpbmRvdy5pbm5lckhlaWdodDphLmhlaWdodCgpLHI9YS5zY3JvbGxUb3AoKSt0LG89aChuKSxpPStuZXcgRGF0ZS1EO3JldHVybiBsLmxlbmd0aD49cC5lbGVtZW50cy5sZW5ndGgrKHAucGVyY2VudGFnZT80OjApPyhhLm9mZihcInNjcm9sbC5zY3JvbGxEZXB0aFwiKSx2b2lkKGM9ITEpKToocC5lbGVtZW50cyYmZihwLmVsZW1lbnRzLHIsaSksdm9pZChwLnBlcmNlbnRhZ2UmJmcobyxyLGkpKSl9LDUwMCkpfXZhciBEPStuZXcgRGF0ZTtwPWUuZXh0ZW5kKHt9LGkscCksZShkb2N1bWVudCkuaGVpZ2h0KCk8cC5taW5IZWlnaHR8fChwLmdhR2xvYmFsPyhuPSEwLHI9cC5nYUdsb2JhbCk6XCJmdW5jdGlvblwiPT10eXBlb2YgZ2E/KG49ITAscj1cImdhXCIpOlwiZnVuY3Rpb25cIj09dHlwZW9mIF9fZ2FUcmFja2VyJiYobj0hMCxyPVwiX19nYVRyYWNrZXJcIiksXCJ1bmRlZmluZWRcIiE9dHlwZW9mIF9nYXEmJlwiZnVuY3Rpb25cIj09dHlwZW9mIF9nYXEucHVzaCYmKHQ9ITApLFwiZnVuY3Rpb25cIj09dHlwZW9mIHAuZXZlbnRIYW5kbGVyP289cC5ldmVudEhhbmRsZXI6XCJ1bmRlZmluZWRcIj09dHlwZW9mIHdpbmRvd1twLmRhdGFMYXllcl18fFwiZnVuY3Rpb25cIiE9dHlwZW9mIHdpbmRvd1twLmRhdGFMYXllcl0ucHVzaHx8cC5ndG1PdmVycmlkZXx8KG89ZnVuY3Rpb24oZSl7d2luZG93W3AuZGF0YUxheWVyXS5wdXNoKGUpfSksZS5zY3JvbGxEZXB0aC5yZXNldD1mdW5jdGlvbigpe2w9W10sdT0wLGEub2ZmKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIpLHkoKX0sZS5zY3JvbGxEZXB0aC5hZGRFbGVtZW50cz1mdW5jdGlvbihuKXtcInVuZGVmaW5lZFwiIT10eXBlb2YgbiYmZS5pc0FycmF5KG4pJiYoZS5tZXJnZShwLmVsZW1lbnRzLG4pLGN8fHkoKSl9LGUuc2Nyb2xsRGVwdGgucmVtb3ZlRWxlbWVudHM9ZnVuY3Rpb24obil7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIG4mJmUuaXNBcnJheShuKSYmZS5lYWNoKG4sZnVuY3Rpb24obix0KXt2YXIgcj1lLmluQXJyYXkodCxwLmVsZW1lbnRzKSxvPWUuaW5BcnJheSh0LGwpOy0xIT1yJiZwLmVsZW1lbnRzLnNwbGljZShyLDEpLC0xIT1vJiZsLnNwbGljZShvLDEpfSl9LG0oKSl9LGUuc2Nyb2xsRGVwdGh9KTtcbiIsIiggZnVuY3Rpb24oICQgKSB7XG5cblx0Lypcblx0ICogQ3JlYXRlIGEgR29vZ2xlIEFuYWx5dGljcyBldmVudFxuXHQgKiBjYXRlZ29yeTogRXZlbnQgQ2F0ZWdvcnlcblx0ICogbGFiZWw6IEV2ZW50IExhYmVsXG5cdCAqIGFjdGlvbjogRXZlbnQgQWN0aW9uXG5cdCAqIHZhbHVlOiBvcHRpb25hbFxuXHQqL1xuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApIHtcblx0XHRpZiAoIHR5cGVvZiBnYSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRpZiAoIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUgKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHdwX2FuYWx5dGljc190cmFja2luZ19zZXR1cCgpIHtcblx0XHR2YXIgc2Nyb2xsRGVwdGhTZXR0aW5ncyA9IFtdO1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MgKSB7XG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLmVuYWJsZWQgKSB7XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmcgYW5kIGEgYm9vbGVhblxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdndGFnanMnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ3RtT3ZlcnJpZGUnXSA9IHRydWU7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ2FHbG9iYWwnXSA9ICdnYSc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIHN0cmluZ1xuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCAmJiAnMCcgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbWluaW11bV9oZWlnaHQnXSA9IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwZXJjZW50YWdlJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sndXNlcl90aW1pbmcnXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBpeGVsX2RlcHRoICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwaXhlbF9kZXB0aCddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbm9uX2ludGVyYWN0aW9uJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGFuIGFycmF5LiBkZWZhdWx0IGlzIGVtcHR5LlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZWxlbWVudHMnXSA9ICQubWFwKCBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cy5zcGxpdCggJywnICksICQudHJpbSApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyBzZW5kIHNjcm9sbCBzZXR0aW5ncyB0byB0aGUgc2Nyb2xsZGVwdGggcGx1Z2luXG5cdFx0XHRcdGpRdWVyeS5zY3JvbGxEZXB0aCggc2Nyb2xsRGVwdGhTZXR0aW5ncyApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZW5hYmxlZCApIHtcblxuXHRcdFx0XHQvLyBleHRlcm5hbCBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cImh0dHBcIl06bm90KFtocmVmKj1cIjovLycgKyBkb2N1bWVudC5kb21haW4gKyAnXCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdPdXRib3VuZCBsaW5rcycsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBtYWlsdG8gbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJtYWlsdG9cIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnTWFpbHMnLCAnQ2xpY2snLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gdGVsIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwidGVsXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ1RlbGVwaG9uZScsICdDYWxsJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGludGVybmFsIGxpbmtzXG5cdFx0XHRcdCQoICdhOm5vdChbaHJlZl49XCIoaHR0cDp8aHR0cHM6KT8vL1wiXSxbaHJlZl49XCIjXCJdLFtocmVmXj1cIm1haWx0bzpcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHRcdC8vIHRyYWNrIGRvd25sb2Fkc1xuXHRcdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICkge1xuXHRcdFx0XHRcdFx0dmFyIHVybCA9IHRoaXMuaHJlZjtcblx0XHRcdFx0XHRcdHZhciBjaGVja0Rvd25sb2FkID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0XHR2YXIgaXNEb3dubG9hZCA9IGNoZWNrRG93bmxvYWQudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzRG93bmxvYWQgKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uID0gbmV3IFJlZ0V4cChcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIpO1xuXHRcdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uUmVzdWx0ID0gY2hlY2tEb3dubG9hZEV4dGVuc2lvbi5leGVjKCB1cmwgKTtcblx0XHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvbiA9ICcnO1xuXHRcdFx0XHRcdFx0XHRpZiAoIG51bGwgIT09IGV4dGVuc2lvblJlc3VsdCApIHtcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHRbMV07XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdC8vIHdlIGNhbid0IHVzZSB0aGUgdXJsIGZvciB0aGUgdmFsdWUgaGVyZSwgZXZlbiB0aG91Z2ggdGhhdCB3b3VsZCBiZSBuaWNlLCBiZWNhdXNlIHZhbHVlIGlzIHN1cHBvc2VkIHRvIGJlIGFuIGludGVnZXJcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnRG93bmxvYWRzJywgZXh0ZW5zaW9uLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSk7XG5cblx0XHRcdH1cblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5lbmFibGVkICkge1xuXHRcdFx0XHQvLyBhbnkgbGluayBjb3VsZCBiZSBhbiBhZmZpbGlhdGUsIGkgZ3Vlc3M/XG5cdFx0XHRcdCQoICdhJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHRcdC8vIHRyYWNrIGFmZmlsaWF0ZXNcblx0XHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCApIHtcblx0XHRcdFx0XHRcdHZhciBjaGVja0FmZmlsaWF0ZSA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdFx0dmFyIGlzQWZmaWxpYXRlID0gY2hlY2tBZmZpbGlhdGUudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzQWZmaWxpYXRlICkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZmZpbGlhdGUnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGxpbmsgZnJhZ21lbnRzIGFzIHBhZ2V2aWV3c1xuXHRcdFx0Ly8gZG9lcyBub3QgdXNlIHRoZSBldmVudCB0cmFja2luZyBtZXRob2Rcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50LmVuYWJsZWQgKSB7XG5cdFx0XHRcdGlmICggdHlwZW9mIGdhICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0XHR3aW5kb3cub25oYXNoY2hhbmdlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRnYSggJ3NlbmQnLCAncGFnZXZpZXcnLCBsb2NhdGlvbi5wYXRobmFtZSArIGxvY2F0aW9uLnNlYXJjaCArIGxvY2F0aW9uLmhhc2ggKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gYmFzaWMgZm9ybSBzdWJtaXRzXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMuZW5hYmxlZCApIHtcblx0XHRcdFx0JCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLmNsaWNrKCBmdW5jdGlvbiggZiApIHtcblx0XHQgICAgICAgICAgICB2YXIgY2F0ZWdvcnkgPSAkKCB0aGlzICkuZGF0YSggJ2dhLWNhdGVnb3J5JyApIHx8ICdGb3JtJztcblx0XHQgICAgICAgICAgICB2YXIgYWN0aW9uID0gJCggdGhpcyApLmRhdGEoICdnYS1hY3Rpb24nICkgfHwgJ1N1Ym1pdCc7XG5cdFx0ICAgICAgICAgICAgdmFyIGxhYmVsID0gJCggdGhpcyApLmRhdGEoICdnYS1sYWJlbCcgKSB8fCB0aGlzLm5hbWUgfHwgdGhpcy52YWx1ZTtcblx0XHQgICAgICAgICAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0ICAgICAgICB9KTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmxvZyggJ25vIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncycgKTtcblx0XHR9XG5cdH1cblxuXHQkKCBkb2N1bWVudCApLnJlYWR5KCBmdW5jdGlvbigpIHtcblx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKTtcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnRyYWNrX2FkYmxvY2tlciAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MudHJhY2tfYWRibG9ja2VyLmVuYWJsZWQgKSB7XG5cdFx0XHRpZiAoIHR5cGVvZiB3aW5kb3cuYWRibG9ja0RldGVjdG9yID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPbicsIHsgJ25vbkludGVyYWN0aW9uJzogMSB9ICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZGVidWc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Zm91bmQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09uJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRub3RGb3VuZDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT2ZmJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxufSApKCBqUXVlcnkgKTtcbiJdfQ==
