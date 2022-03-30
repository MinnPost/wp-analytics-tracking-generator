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

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }

/*!
 * @preserve
 * jquery.scrolldepth.js | v1.2.0
 * Copyright (c) 2020 Rob Flaherty (@robflaherty)
 * Licensed under the MIT and GPL licenses.
 */
!function (e) {
  "function" == typeof define && define.amd ? define(["jquery"], e) : "object" == (typeof module === "undefined" ? "undefined" : _typeof(module)) && module.exports ? module.exports = e(require("jquery")) : e(jQuery);
}(function (f) {
  "use strict";

  var i,
      a,
      c,
      p,
      g,
      e = {
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
      m = f(window),
      d = [],
      D = !1,
      h = 0;
  return f.scrollDepth = function (u) {
    var s = +new Date();

    function v(e, n, t, o) {
      var r = u.trackerName ? u.trackerName + ".send" : "send";
      g ? (g({
        event: "ScrollDistance",
        eventCategory: "Scroll Depth",
        eventAction: e,
        eventLabel: n,
        eventValue: 1,
        eventNonInteraction: u.nonInteraction
      }), u.pixelDepth && 2 < arguments.length && h < t && g({
        event: "ScrollDistance",
        eventCategory: "Scroll Depth",
        eventAction: "Pixel Depth",
        eventLabel: l(h = t),
        eventValue: 1,
        eventNonInteraction: u.nonInteraction
      }), u.userTiming && 3 < arguments.length && g({
        event: "ScrollTiming",
        eventCategory: "Scroll Depth",
        eventAction: e,
        eventLabel: n,
        eventTiming: o
      })) : p ? (gtag("event", e, {
        event_category: "Scroll Depth",
        event_label: n,
        value: 1,
        non_interaction: u.nonInteraction
      }), u.pixelDepth && 2 < arguments.length && h < t && (h = t, gtag("event", "Pixel Depth", {
        event_category: "Scroll Depth",
        event_label: l(t),
        value: 1,
        non_interaction: u.nonInteraction
      })), u.userTiming && 3 < arguments.length && gtag("event", "timing_complete", {
        event_category: "Scroll Depth",
        name: e,
        event_label: n,
        value: o
      })) : (i && (window[c](r, "event", "Scroll Depth", e, n, 1, {
        nonInteraction: u.nonInteraction
      }), u.pixelDepth && 2 < arguments.length && h < t && (h = t, window[c](r, "event", "Scroll Depth", "Pixel Depth", l(t), 1, {
        nonInteraction: u.nonInteraction
      })), u.userTiming && 3 < arguments.length && window[c](r, "timing", "Scroll Depth", e, o, n)), a && (_gaq.push(["_trackEvent", "Scroll Depth", e, n, 1, u.nonInteraction]), u.pixelDepth && 2 < arguments.length && h < t && (h = t, _gaq.push(["_trackEvent", "Scroll Depth", "Pixel Depth", l(t), 1, u.nonInteraction])), u.userTiming && 3 < arguments.length && _gaq.push(["_trackTiming", "Scroll Depth", e, o, n, 100])));
    }

    function l(e) {
      return (250 * Math.floor(e / 250)).toString();
    }

    function n() {
      function t() {
        p = new Date(), c = null, a = o.apply(l, i);
      }

      var o, r, l, i, a, c, p;
      D = !0, m.on("scroll.scrollDepth", (o = function o() {
        var e,
            n,
            t,
            o,
            r,
            l,
            i,
            a = f(document).height(),
            c = window.innerHeight ? window.innerHeight : m.height(),
            p = m.scrollTop() + c,
            g = (e = a, {
          "25%": parseInt(.25 * e, 10),
          "50%": parseInt(.5 * e, 10),
          "75%": parseInt(.75 * e, 10),
          "100%": e - 5
        }),
            h = new Date() - s;
        if (d.length >= u.elements.length + (u.percentage ? 4 : 0)) return m.off("scroll.scrollDepth"), void (D = !1);
        u.elements && (n = u.elements, t = p, o = h, f.each(n, function (e, n) {
          -1 === f.inArray(n, d) && f(n).length && t >= f(n).offset().top && (v("Elements", n, t, o), d.push(n));
        })), u.percentage && (r = g, l = p, i = h, f.each(r, function (e, n) {
          -1 === f.inArray(e, d) && n <= l && (v("Percentage", e, l, i), d.push(e));
        }));
      }, r = 500, c = null, p = 0, function () {
        var e = new Date(),
            n = r - (e - (p = p || e));
        return l = this, i = arguments, n <= 0 ? (clearTimeout(c), c = null, p = e, a = o.apply(l, i)) : c = c || setTimeout(t, n), a;
      }));
    }

    u = f.extend({}, e, u), f(document).height() < u.minHeight || (u.gaGlobal ? (i = !0, c = u.gaGlobal) : "function" == typeof gtag ? (p = !0, c = "gtag") : "function" == typeof ga ? (i = !0, c = "ga") : "function" == typeof __gaTracker && (i = !0, c = "__gaTracker"), "undefined" != typeof _gaq && "function" == typeof _gaq.push && (a = !0), "function" == typeof u.eventHandler ? g = u.eventHandler : void 0 === window[u.dataLayer] || "function" != typeof window[u.dataLayer].push || u.gtmOverride || (g = function g(e) {
      window[u.dataLayer].push(e);
    }), f.scrollDepth.reset = function () {
      d = [], h = 0, m.off("scroll.scrollDepth"), n();
    }, f.scrollDepth.addElements = function (e) {
      void 0 !== e && f.isArray(e) && (f.merge(u.elements, e), D || n());
    }, f.scrollDepth.removeElements = function (e) {
      void 0 !== e && f.isArray(e) && f.each(e, function (e, n) {
        var t = f.inArray(n, u.elements),
            o = f.inArray(n, d);
        -1 != t && u.elements.splice(t, 1), -1 != o && d.splice(o, 1);
      });
    }, n());
  }, f.scrollDepth;
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
    if (typeof gtag !== 'undefined') {
      // Sends the event to the Google Analytics property with
      // tracking ID GA_MEASUREMENT_ID set by the config command in
      // the global tracking snippet.
      // example: gtag('event', 'play', { 'event_category': 'Videos', 'event_label': 'Fall Campaign' });
      if (typeof value === 'undefined') {
        gtag(type, action, {
          'event_category': category,
          'event_label': label
        });
      } else {
        gtag(type, action, {
          'event_category': category,
          'event_label': label,
          'value': value
        });
      }
    } else if (typeof ga !== 'undefined') {
      // Uses the default tracker to send the event to the
      // Google Analytics property with tracking ID GA_MEASUREMENT_ID.
      // example: ga('send', 'event', 'Videos', 'play', 'Fall Campaign');
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFkYmxvY2tEZXRlY3Rvci5qcyIsImpxdWVyeS5zY3JvbGxkZXB0aC5taW4uanMiLCJ3cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwiZiIsImEiLCJjIiwicCIsImciLCJtaW5IZWlnaHQiLCJlbGVtZW50cyIsInBlcmNlbnRhZ2UiLCJ1c2VyVGltaW5nIiwicGl4ZWxEZXB0aCIsIm5vbkludGVyYWN0aW9uIiwiZ2FHbG9iYWwiLCJndG1PdmVycmlkZSIsInRyYWNrZXJOYW1lIiwiZGF0YUxheWVyIiwibSIsIkQiLCJoIiwic2Nyb2xsRGVwdGgiLCJ1IiwicyIsIkRhdGUiLCJuIiwibyIsInIiLCJldmVudCIsImV2ZW50Q2F0ZWdvcnkiLCJldmVudEFjdGlvbiIsImV2ZW50TGFiZWwiLCJldmVudFZhbHVlIiwiZXZlbnROb25JbnRlcmFjdGlvbiIsImFyZ3VtZW50cyIsImwiLCJldmVudFRpbWluZyIsImd0YWciLCJldmVudF9jYXRlZ29yeSIsImV2ZW50X2xhYmVsIiwidmFsdWUiLCJub25faW50ZXJhY3Rpb24iLCJuYW1lIiwiX2dhcSIsIk1hdGgiLCJmbG9vciIsInRvU3RyaW5nIiwiYXBwbHkiLCJvbiIsImhlaWdodCIsImlubmVySGVpZ2h0Iiwic2Nyb2xsVG9wIiwicGFyc2VJbnQiLCJvZmYiLCJlYWNoIiwiaW5BcnJheSIsIm9mZnNldCIsInRvcCIsImV4dGVuZCIsImdhIiwiX19nYVRyYWNrZXIiLCJldmVudEhhbmRsZXIiLCJyZXNldCIsImFkZEVsZW1lbnRzIiwiaXNBcnJheSIsIm1lcmdlIiwicmVtb3ZlRWxlbWVudHMiLCJzcGxpY2UiLCIkIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50IiwidHlwZSIsImNhdGVnb3J5IiwiYWN0aW9uIiwibGFiZWwiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAiLCJzY3JvbGxEZXB0aFNldHRpbmdzIiwiYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsImFuYWx5dGljc190eXBlIiwibWluaW11bV9oZWlnaHQiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwic2Nyb2xsX2VsZW1lbnRzIiwibWFwIiwic3BsaXQiLCJ0cmltIiwic3BlY2lhbCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJjaGVja0Rvd25sb2FkRXh0ZW5zaW9uIiwiZXh0ZW5zaW9uUmVzdWx0IiwiZXhlYyIsImV4dGVuc2lvbiIsImFmZmlsaWF0ZSIsImFmZmlsaWF0ZV9yZWdleCIsImNoZWNrQWZmaWxpYXRlIiwiaXNBZmZpbGlhdGUiLCJmcmFnbWVudCIsIm9uaGFzaGNoYW5nZSIsImxvY2F0aW9uIiwicGF0aG5hbWUiLCJzZWFyY2giLCJoYXNoIiwiZm9ybSIsInBhcmVudHMiLCJmb3JtX3N1Ym1pc3Npb25zIiwic3VibWl0IiwiYnV0dG9uIiwiZ2V0IiwidGV4dCIsInJlYWR5IiwidHJhY2tfYWRibG9ja2VyIiwiYWRibG9ja0RldGVjdG9yIiwibm90Rm91bmQiXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQSxDQUFDLFVBQVNBLEdBQVQsRUFBYztBQUVkLE1BQUlDLE9BQU8sR0FBRyxLQUFkO0FBRUEsTUFBSUMsR0FBRyxHQUFHLFFBQVY7QUFBQSxNQUFvQkMsRUFBRSxHQUFHLFFBQXpCOztBQUNBLE1BQUlDLElBQUksR0FBRyxTQUFQQSxJQUFPLEdBQVUsQ0FBRSxDQUF2Qjs7QUFFQSxNQUFJQyxVQUFVLEdBQUcsS0FBakI7QUFDQSxNQUFJQyxhQUFhLEdBQUcsS0FBcEI7QUFFQSxNQUFJQyxhQUFhLEdBQUlQLEdBQUcsQ0FBQ1EsZ0JBQUosS0FBeUJDLFNBQTlDO0FBRUE7QUFDRDtBQUNBO0FBQ0E7O0FBQ0MsTUFBSUMsUUFBUSxHQUFHO0FBQ2RDLElBQUFBLFNBQVMsRUFBRSxFQURHO0FBRWRDLElBQUFBLE9BQU8sRUFBRSxDQUZLO0FBR2RDLElBQUFBLEtBQUssRUFBRSxJQUhPO0FBSWRDLElBQUFB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LElBQXRCLEVBQTRCO0FBQUUsNEJBQWtCO0FBQXBCLFNBQTVCLENBQTNCO0FBQ0EsT0FGRCxNQUVPO0FBQ056RixRQUFBQSxNQUFNLENBQUMySSxlQUFQLENBQXVCOUgsSUFBdkIsQ0FDQztBQUNDMUgsVUFBQUEsS0FBSyxFQUFFLEtBRFI7QUFFQ0MsVUFBQUEsS0FBSyxFQUFFLGlCQUFXO0FBQ2pCcU0sWUFBQUEsMkJBQTJCLENBQUUsT0FBRixFQUFXLFNBQVgsRUFBc0IsSUFBdEIsRUFBNEI7QUFBRSxnQ0FBa0I7QUFBcEIsYUFBNUIsQ0FBM0I7QUFDQSxXQUpGO0FBS0NtRCxVQUFBQSxRQUFRLEVBQUUsb0JBQVc7QUFDcEJuRCxZQUFBQSwyQkFBMkIsQ0FBRSxPQUFGLEVBQVcsU0FBWCxFQUFzQixLQUF0QixFQUE2QjtBQUFFLGdDQUFrQjtBQUFwQixhQUE3QixDQUEzQjtBQUNBO0FBUEYsU0FERDtBQVdBO0FBQ0Q7QUFDRCxHQW5CRDtBQXFCQSxDQXpNRCxFQXlNS25FLE1Bek1MIiwiZmlsZSI6IndwLWFuYWx5dGljcy10cmFja2luZy1nZW5lcmF0b3ItZnJvbnQtZW5kLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFkQmxvY2sgZGV0ZWN0b3Jcbi8vXG4vLyBBdHRlbXB0cyB0byBkZXRlY3QgdGhlIHByZXNlbmNlIG9mIEFkIEJsb2NrZXIgc29mdHdhcmUgYW5kIG5vdGlmeSBsaXN0ZW5lciBvZiBpdHMgZXhpc3RlbmNlLlxuLy8gQ29weXJpZ2h0IChjKSAyMDE3IElBQlxuLy9cbi8vIFRoZSBCU0QtMyBMaWNlbnNlXG4vLyBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4vLyAxLiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4vLyAyLiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4vLyAzLiBOZWl0aGVyIHRoZSBuYW1lIG9mIHRoZSBjb3B5cmlnaHQgaG9sZGVyIG5vciB0aGUgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHMgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4vLyBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUiBBTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTOyBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlQgKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVMgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiogQG5hbWUgd2luZG93LmFkYmxvY2tEZXRlY3RvclxuKlxuKiBJQUIgQWRibG9jayBkZXRlY3Rvci5cbiogVXNhZ2U6IHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChvcHRpb25zKTtcbipcbiogT3B0aW9ucyBvYmplY3Qgc2V0dGluZ3NcbipcbipcdEBwcm9wIGRlYnVnOiAgYm9vbGVhblxuKiAgICAgICAgIEZsYWcgdG8gaW5kaWNhdGUgYWRkaXRpb25hbCBkZWJ1ZyBvdXRwdXQgc2hvdWxkIGJlIHByaW50ZWQgdG8gY29uc29sZVxuKlxuKlx0QHByb3AgZm91bmQ6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBpcyBkZXRlY3RlZFxuKlxuKlx0QHByb3Agbm90Zm91bmQ6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBpcyBub3QgZGV0ZWN0ZWQuXG4qICAgICAgICAgTk9URTogdGhpcyBmdW5jdGlvbiBtYXkgZmlyZSBtdWx0aXBsZSB0aW1lcyBhbmQgZ2l2ZSBmYWxzZSBuZWdhdGl2ZVxuKiAgICAgICAgIHJlc3BvbnNlcyBkdXJpbmcgYSB0ZXN0IHVudGlsIGFkYmxvY2sgaXMgc3VjY2Vzc2Z1bGx5IGRldGVjdGVkLlxuKlxuKlx0QHByb3AgY29tcGxldGU6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb25jZSBhIHJvdW5kIG9mIHRlc3RpbmcgaXMgY29tcGxldGUuXG4qICAgICAgICAgVGhlIHRlc3QgcmVzdWx0IChib29sZWFuKSBpcyBpbmNsdWRlZCBhcyBhIHBhcmFtZXRlciB0byBjYWxsYmFja1xuKlxuKiBleGFtcGxlOiBcdHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGZvdW5kOiBmdW5jdGlvbigpeyAuLi59LFxuIFx0XHRcdFx0XHRub3RGb3VuZDogZnVuY3Rpb24oKXsuLi59XG5cdFx0XHRcdH1cblx0XHRcdCk7XG4qXG4qXG4qL1xuXG5cInVzZSBzdHJpY3RcIjtcbihmdW5jdGlvbih3aW4pIHtcblxuXHR2YXIgdmVyc2lvbiA9ICcxLjAnO1xuXG5cdHZhciBvZnMgPSAnb2Zmc2V0JywgY2wgPSAnY2xpZW50Jztcblx0dmFyIG5vb3AgPSBmdW5jdGlvbigpe307XG5cblx0dmFyIHRlc3RlZE9uY2UgPSBmYWxzZTtcblx0dmFyIHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblxuXHR2YXIgaXNPbGRJRWV2ZW50cyA9ICh3aW4uYWRkRXZlbnRMaXN0ZW5lciA9PT0gdW5kZWZpbmVkKTtcblxuXHQvKipcblx0KiBPcHRpb25zIHNldCB3aXRoIGRlZmF1bHQgb3B0aW9ucyBpbml0aWFsaXplZFxuXHQqXG5cdCovXG5cdHZhciBfb3B0aW9ucyA9IHtcblx0XHRsb29wRGVsYXk6IDUwLFxuXHRcdG1heExvb3A6IDUsXG5cdFx0ZGVidWc6IHRydWUsXG5cdFx0Zm91bmQ6IG5vb3AsIFx0XHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIHdoZW4gYWRibG9jayBkZXRlY3RlZFxuXHRcdG5vdGZvdW5kOiBub29wLCBcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBub3QgZGV0ZWN0ZWQgYWZ0ZXIgdGVzdGluZ1xuXHRcdGNvbXBsZXRlOiBub29wICBcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgYWZ0ZXIgdGVzdGluZyBjb21wbGV0ZXMsIHBhc3NpbmcgcmVzdWx0IGFzIHBhcmFtZXRlclxuXHR9XG5cblx0ZnVuY3Rpb24gcGFyc2VBc0pzb24oZGF0YSl7XG5cdFx0dmFyIHJlc3VsdCwgZm5EYXRhO1xuXHRcdHRyeXtcblx0XHRcdHJlc3VsdCA9IEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0fVxuXHRcdGNhdGNoKGV4KXtcblx0XHRcdHRyeXtcblx0XHRcdFx0Zm5EYXRhID0gbmV3IEZ1bmN0aW9uKFwicmV0dXJuIFwiICsgZGF0YSk7XG5cdFx0XHRcdHJlc3VsdCA9IGZuRGF0YSgpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRsb2coJ0ZhaWxlZCBzZWNvbmRhcnkgSlNPTiBwYXJzZScsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0KiBBamF4IGhlbHBlciBvYmplY3QgdG8gZG93bmxvYWQgZXh0ZXJuYWwgc2NyaXB0cy5cblx0KiBJbml0aWFsaXplIG9iamVjdCB3aXRoIGFuIG9wdGlvbnMgb2JqZWN0XG5cdCogRXg6XG5cdCAge1xuXHRcdCAgdXJsIDogJ2h0dHA6Ly9leGFtcGxlLm9yZy91cmxfdG9fZG93bmxvYWQnLFxuXHRcdCAgbWV0aG9kOiAnUE9TVHxHRVQnLFxuXHRcdCAgc3VjY2VzczogY2FsbGJhY2tfZnVuY3Rpb24sXG5cdFx0ICBmYWlsOiAgY2FsbGJhY2tfZnVuY3Rpb25cblx0ICB9XG5cdCovXG5cdHZhciBBamF4SGVscGVyID0gZnVuY3Rpb24ob3B0cyl7XG5cdFx0dmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG5cdFx0dGhpcy5zdWNjZXNzID0gb3B0cy5zdWNjZXNzIHx8IG5vb3A7XG5cdFx0dGhpcy5mYWlsID0gb3B0cy5mYWlsIHx8IG5vb3A7XG5cdFx0dmFyIG1lID0gdGhpcztcblxuXHRcdHZhciBtZXRob2QgPSBvcHRzLm1ldGhvZCB8fCAnZ2V0JztcblxuXHRcdC8qKlxuXHRcdCogQWJvcnQgdGhlIHJlcXVlc3Rcblx0XHQqL1xuXHRcdHRoaXMuYWJvcnQgPSBmdW5jdGlvbigpe1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHR4aHIuYWJvcnQoKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzdGF0ZUNoYW5nZSh2YWxzKXtcblx0XHRcdGlmKHhoci5yZWFkeVN0YXRlID09IDQpe1xuXHRcdFx0XHRpZih4aHIuc3RhdHVzID09IDIwMCl7XG5cdFx0XHRcdFx0bWUuc3VjY2Vzcyh4aHIucmVzcG9uc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0Ly8gZmFpbGVkXG5cdFx0XHRcdFx0bWUuZmFpbCh4aHIuc3RhdHVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBzdGF0ZUNoYW5nZTtcblxuXHRcdGZ1bmN0aW9uIHN0YXJ0KCl7XG5cdFx0XHR4aHIub3BlbihtZXRob2QsIG9wdHMudXJsLCB0cnVlKTtcblx0XHRcdHhoci5zZW5kKCk7XG5cdFx0fVxuXG5cdFx0c3RhcnQoKTtcblx0fVxuXG5cdC8qKlxuXHQqIE9iamVjdCB0cmFja2luZyB0aGUgdmFyaW91cyBibG9jayBsaXN0c1xuXHQqL1xuXHR2YXIgQmxvY2tMaXN0VHJhY2tlciA9IGZ1bmN0aW9uKCl7XG5cdFx0dmFyIG1lID0gdGhpcztcblx0XHR2YXIgZXh0ZXJuYWxCbG9ja2xpc3REYXRhID0ge307XG5cblx0XHQvKipcblx0XHQqIEFkZCBhIG5ldyBleHRlcm5hbCBVUkwgdG8gdHJhY2tcblx0XHQqL1xuXHRcdHRoaXMuYWRkVXJsID0gZnVuY3Rpb24odXJsKXtcblx0XHRcdGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxdID0ge1xuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0c3RhdGU6ICdwZW5kaW5nJyxcblx0XHRcdFx0Zm9ybWF0OiBudWxsLFxuXHRcdFx0XHRkYXRhOiBudWxsLFxuXHRcdFx0XHRyZXN1bHQ6IG51bGxcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxdO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCogTG9hZHMgYSBibG9jayBsaXN0IGRlZmluaXRpb25cblx0XHQqL1xuXHRcdHRoaXMuc2V0UmVzdWx0ID0gZnVuY3Rpb24odXJsS2V5LCBzdGF0ZSwgZGF0YSl7XG5cdFx0XHR2YXIgb2JqID0gZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybEtleV07XG5cdFx0XHRpZihvYmogPT0gbnVsbCl7XG5cdFx0XHRcdG9iaiA9IHRoaXMuYWRkVXJsKHVybEtleSk7XG5cdFx0XHR9XG5cblx0XHRcdG9iai5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0aWYoZGF0YSA9PSBudWxsKXtcblx0XHRcdFx0b2JqLnJlc3VsdCA9IG51bGw7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKXtcblx0XHRcdFx0dHJ5e1xuXHRcdFx0XHRcdGRhdGEgPSBwYXJzZUFzSnNvbihkYXRhKTtcblx0XHRcdFx0XHRvYmouZm9ybWF0ID0gJ2pzb24nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0XHRvYmouZm9ybWF0ID0gJ2Vhc3lsaXN0Jztcblx0XHRcdFx0XHQvLyBwYXJzZUVhc3lMaXN0KGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvYmouZGF0YSA9IGRhdGE7XG5cblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fVxuXG5cdH1cblxuXHR2YXIgbGlzdGVuZXJzID0gW107IC8vIGV2ZW50IHJlc3BvbnNlIGxpc3RlbmVyc1xuXHR2YXIgYmFpdE5vZGUgPSBudWxsO1xuXHR2YXIgcXVpY2tCYWl0ID0ge1xuXHRcdGNzc0NsYXNzOiAncHViXzMwMHgyNTAgcHViXzMwMHgyNTBtIHB1Yl83Mjh4OTAgdGV4dC1hZCB0ZXh0QWQgdGV4dF9hZCB0ZXh0X2FkcyB0ZXh0LWFkcyB0ZXh0LWFkLWxpbmtzJ1xuXHR9O1xuXHR2YXIgYmFpdFRyaWdnZXJzID0ge1xuXHRcdG51bGxQcm9wczogW29mcyArICdQYXJlbnQnXSxcblx0XHR6ZXJvUHJvcHM6IFtdXG5cdH07XG5cblx0YmFpdFRyaWdnZXJzLnplcm9Qcm9wcyA9IFtcblx0XHRvZnMgKydIZWlnaHQnLCBvZnMgKydMZWZ0Jywgb2ZzICsnVG9wJywgb2ZzICsnV2lkdGgnLCBvZnMgKydIZWlnaHQnLFxuXHRcdGNsICsgJ0hlaWdodCcsIGNsICsgJ1dpZHRoJ1xuXHRdO1xuXG5cdC8vIHJlc3VsdCBvYmplY3Rcblx0dmFyIGV4ZVJlc3VsdCA9IHtcblx0XHRxdWljazogbnVsbCxcblx0XHRyZW1vdGU6IG51bGxcblx0fTtcblxuXHR2YXIgZmluZFJlc3VsdCA9IG51bGw7IC8vIHJlc3VsdCBvZiB0ZXN0IGZvciBhZCBibG9ja2VyXG5cblx0dmFyIHRpbWVySWRzID0ge1xuXHRcdHRlc3Q6IDAsXG5cdFx0ZG93bmxvYWQ6IDBcblx0fTtcblxuXHRmdW5jdGlvbiBpc0Z1bmMoZm4pe1xuXHRcdHJldHVybiB0eXBlb2YoZm4pID09ICdmdW5jdGlvbic7XG5cdH1cblxuXHQvKipcblx0KiBNYWtlIGEgRE9NIGVsZW1lbnRcblx0Ki9cblx0ZnVuY3Rpb24gbWFrZUVsKHRhZywgYXR0cmlidXRlcyl7XG5cdFx0dmFyIGssIHYsIGVsLCBhdHRyID0gYXR0cmlidXRlcztcblx0XHR2YXIgZCA9IGRvY3VtZW50O1xuXG5cdFx0ZWwgPSBkLmNyZWF0ZUVsZW1lbnQodGFnKTtcblxuXHRcdGlmKGF0dHIpe1xuXHRcdFx0Zm9yKGsgaW4gYXR0cil7XG5cdFx0XHRcdGlmKGF0dHIuaGFzT3duUHJvcGVydHkoaykpe1xuXHRcdFx0XHRcdGVsLnNldEF0dHJpYnV0ZShrLCBhdHRyW2tdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGF0dGFjaEV2ZW50TGlzdGVuZXIoZG9tLCBldmVudE5hbWUsIGhhbmRsZXIpe1xuXHRcdGlmKGlzT2xkSUVldmVudHMpe1xuXHRcdFx0ZG9tLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudE5hbWUsIGhhbmRsZXIpO1xuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0ZG9tLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gbG9nKG1lc3NhZ2UsIGlzRXJyb3Ipe1xuXHRcdGlmKCFfb3B0aW9ucy5kZWJ1ZyAmJiAhaXNFcnJvcil7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmKHdpbi5jb25zb2xlICYmIHdpbi5jb25zb2xlLmxvZyl7XG5cdFx0XHRpZihpc0Vycm9yKXtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignW0FCRF0gJyArIG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZXtcblx0XHRcdFx0Y29uc29sZS5sb2coJ1tBQkRdICcgKyBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR2YXIgYWpheERvd25sb2FkcyA9IFtdO1xuXG5cdC8qKlxuXHQqIExvYWQgYW5kIGV4ZWN1dGUgdGhlIFVSTCBpbnNpZGUgYSBjbG9zdXJlIGZ1bmN0aW9uXG5cdCovXG5cdGZ1bmN0aW9uIGxvYWRFeGVjdXRlVXJsKHVybCl7XG5cdFx0dmFyIGFqYXgsIHJlc3VsdDtcblxuXHRcdGJsb2NrTGlzdHMuYWRkVXJsKHVybCk7XG5cdFx0Ly8gc2V0dXAgY2FsbCBmb3IgcmVtb3RlIGxpc3Rcblx0XHRhamF4ID0gbmV3IEFqYXhIZWxwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdHVybDogdXJsLFxuXHRcdFx0XHRzdWNjZXNzOiBmdW5jdGlvbihkYXRhKXtcblx0XHRcdFx0XHRsb2coJ2Rvd25sb2FkZWQgZmlsZSAnICsgdXJsKTsgLy8gdG9kbyAtIHBhcnNlIGFuZCBzdG9yZSB1bnRpbCB1c2Vcblx0XHRcdFx0XHRyZXN1bHQgPSBibG9ja0xpc3RzLnNldFJlc3VsdCh1cmwsICdzdWNjZXNzJywgZGF0YSk7XG5cdFx0XHRcdFx0dHJ5e1xuXHRcdFx0XHRcdFx0dmFyIGludGVydmFsSWQgPSAwLFxuXHRcdFx0XHRcdFx0XHRyZXRyeUNvdW50ID0gMDtcblxuXHRcdFx0XHRcdFx0dmFyIHRyeUV4ZWN1dGVUZXN0ID0gZnVuY3Rpb24obGlzdERhdGEpe1xuXHRcdFx0XHRcdFx0XHRpZighdGVzdEV4ZWN1dGluZyl7XG5cdFx0XHRcdFx0XHRcdFx0YmVnaW5UZXN0KGxpc3REYXRhLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmKGZpbmRSZXN1bHQgPT0gdHJ1ZSl7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYodHJ5RXhlY3V0ZVRlc3QocmVzdWx0LmRhdGEpKXtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHRcdFx0bG9nKCdQYXVzZSBiZWZvcmUgdGVzdCBleGVjdXRpb24nKTtcblx0XHRcdFx0XHRcdFx0aW50ZXJ2YWxJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0XHRcdFx0aWYodHJ5RXhlY3V0ZVRlc3QocmVzdWx0LmRhdGEpIHx8IHJldHJ5Q291bnQrKyA+IDUpe1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xlYXJJbnRlcnZhbChpbnRlcnZhbElkKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sIDI1MCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0XHRcdGxvZyhleC5tZXNzYWdlICsgJyB1cmw6ICcgKyB1cmwsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmFpbDogZnVuY3Rpb24oc3RhdHVzKXtcblx0XHRcdFx0XHRsb2coc3RhdHVzLCB0cnVlKTtcblx0XHRcdFx0XHRibG9ja0xpc3RzLnNldFJlc3VsdCh1cmwsICdlcnJvcicsIG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdGFqYXhEb3dubG9hZHMucHVzaChhamF4KTtcblx0fVxuXG5cblx0LyoqXG5cdCogRmV0Y2ggdGhlIGV4dGVybmFsIGxpc3RzIGFuZCBpbml0aWF0ZSB0aGUgdGVzdHNcblx0Ki9cblx0ZnVuY3Rpb24gZmV0Y2hSZW1vdGVMaXN0cygpe1xuXHRcdHZhciBpLCB1cmw7XG5cdFx0dmFyIG9wdHMgPSBfb3B0aW9ucztcblxuXHRcdGZvcihpPTA7aTxvcHRzLmJsb2NrTGlzdHMubGVuZ3RoO2krKyl7XG5cdFx0XHR1cmwgPSBvcHRzLmJsb2NrTGlzdHNbaV07XG5cdFx0XHRsb2FkRXhlY3V0ZVVybCh1cmwpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNhbmNlbFJlbW90ZURvd25sb2Fkcygpe1xuXHRcdHZhciBpLCBhajtcblxuXHRcdGZvcihpPWFqYXhEb3dubG9hZHMubGVuZ3RoLTE7aSA+PSAwO2ktLSl7XG5cdFx0XHRhaiA9IGFqYXhEb3dubG9hZHMucG9wKCk7XG5cdFx0XHRhai5hYm9ydCgpO1xuXHRcdH1cblx0fVxuXG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0LyoqXG5cdCogQmVnaW4gZXhlY3V0aW9uIG9mIHRoZSB0ZXN0XG5cdCovXG5cdGZ1bmN0aW9uIGJlZ2luVGVzdChiYWl0KXtcblx0XHRsb2coJ3N0YXJ0IGJlZ2luVGVzdCcpO1xuXHRcdGlmKGZpbmRSZXN1bHQgPT0gdHJ1ZSl7XG5cdFx0XHRyZXR1cm47IC8vIHdlIGZvdW5kIGl0LiBkb24ndCBjb250aW51ZSBleGVjdXRpbmdcblx0XHR9XG5cdFx0dGVzdEV4ZWN1dGluZyA9IHRydWU7XG5cdFx0Y2FzdEJhaXQoYmFpdCk7XG5cblx0XHRleGVSZXN1bHQucXVpY2sgPSAndGVzdGluZyc7XG5cblx0XHR0aW1lcklkcy50ZXN0ID0gc2V0VGltZW91dChcblx0XHRcdGZ1bmN0aW9uKCl7IHJlZWxJbihiYWl0LCAxKTsgfSxcblx0XHRcdDUpO1xuXHR9XG5cblx0LyoqXG5cdCogQ3JlYXRlIHRoZSBiYWl0IG5vZGUgdG8gc2VlIGhvdyB0aGUgYnJvd3NlciBwYWdlIHJlYWN0c1xuXHQqL1xuXHRmdW5jdGlvbiBjYXN0QmFpdChiYWl0KXtcblx0XHR2YXIgaSwgZCA9IGRvY3VtZW50LCBiID0gZC5ib2R5O1xuXHRcdHZhciB0O1xuXHRcdHZhciBiYWl0U3R5bGUgPSAnd2lkdGg6IDFweCAhaW1wb3J0YW50OyBoZWlnaHQ6IDFweCAhaW1wb3J0YW50OyBwb3NpdGlvbjogYWJzb2x1dGUgIWltcG9ydGFudDsgbGVmdDogLTEwMDAwcHggIWltcG9ydGFudDsgdG9wOiAtMTAwMHB4ICFpbXBvcnRhbnQ7J1xuXG5cdFx0aWYoYmFpdCA9PSBudWxsIHx8IHR5cGVvZihiYWl0KSA9PSAnc3RyaW5nJyl7XG5cdFx0XHRsb2coJ2ludmFsaWQgYmFpdCBiZWluZyBjYXN0Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYoYmFpdC5zdHlsZSAhPSBudWxsKXtcblx0XHRcdGJhaXRTdHlsZSArPSBiYWl0LnN0eWxlO1xuXHRcdH1cblxuXHRcdGJhaXROb2RlID0gbWFrZUVsKCdkaXYnLCB7XG5cdFx0XHQnY2xhc3MnOiBiYWl0LmNzc0NsYXNzLFxuXHRcdFx0J3N0eWxlJzogYmFpdFN0eWxlXG5cdFx0fSk7XG5cblx0XHRsb2coJ2FkZGluZyBiYWl0IG5vZGUgdG8gRE9NJyk7XG5cblx0XHRiLmFwcGVuZENoaWxkKGJhaXROb2RlKTtcblxuXHRcdC8vIHRvdWNoIHRoZXNlIHByb3BlcnRpZXNcblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLm51bGxQcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdHQgPSBiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldXTtcblx0XHR9XG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHR0ID0gYmFpdE5vZGVbYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXV07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCogUnVuIHRlc3RzIHRvIHNlZSBpZiBicm93c2VyIGhhcyB0YWtlbiB0aGUgYmFpdCBhbmQgYmxvY2tlZCB0aGUgYmFpdCBlbGVtZW50XG5cdCovXG5cdGZ1bmN0aW9uIHJlZWxJbihiYWl0LCBhdHRlbXB0TnVtKXtcblx0XHR2YXIgaSwgaywgdjtcblx0XHR2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG5cdFx0dmFyIGZvdW5kID0gZmFsc2U7XG5cblx0XHRpZihiYWl0Tm9kZSA9PSBudWxsKXtcblx0XHRcdGxvZygncmVjYXN0IGJhaXQnKTtcblx0XHRcdGNhc3RCYWl0KGJhaXQgfHwgcXVpY2tCYWl0KTtcblx0XHR9XG5cblx0XHRpZih0eXBlb2YoYmFpdCkgPT0gJ3N0cmluZycpe1xuXHRcdFx0bG9nKCdpbnZhbGlkIGJhaXQgdXNlZCcsIHRydWUpO1xuXHRcdFx0aWYoY2xlYXJCYWl0Tm9kZSgpKXtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZih0aW1lcklkcy50ZXN0ID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMudGVzdCk7XG5cdFx0XHR0aW1lcklkcy50ZXN0ID0gMDtcblx0XHR9XG5cblx0XHQvLyB0ZXN0IGZvciBpc3N1ZXNcblxuXHRcdGlmKGJvZHkuZ2V0QXR0cmlidXRlKCdhYnAnKSAhPT0gbnVsbCl7XG5cdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgYm9keSBhdHRyaWJ1dGUnKTtcblx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLm51bGxQcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdGlmKGJhaXROb2RlW2JhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV1dID09IG51bGwpe1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIG51bGwgYXR0cjogJyArIGJhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmKGZvdW5kID09IHRydWUpe1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLnplcm9Qcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdGlmKGZvdW5kID09IHRydWUpe1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmKGJhaXROb2RlW2JhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV1dID09IDApe1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIHplcm8gYXR0cjogJyArIGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmKHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhciBiYWl0VGVtcCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGJhaXROb2RlLCBudWxsKTtcblx0XHRcdGlmKGJhaXRUZW1wLmdldFByb3BlcnR5VmFsdWUoJ2Rpc3BsYXknKSA9PSAnbm9uZSdcblx0XHRcdHx8IGJhaXRUZW1wLmdldFByb3BlcnR5VmFsdWUoJ3Zpc2liaWxpdHknKSA9PSAnaGlkZGVuJykge1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIGNvbXB1dGVkU3R5bGUgaW5kaWNhdG9yJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdGVkT25jZSA9IHRydWU7XG5cblx0XHRpZihmb3VuZCB8fCBhdHRlbXB0TnVtKysgPj0gX29wdGlvbnMubWF4TG9vcCl7XG5cdFx0XHRmaW5kUmVzdWx0ID0gZm91bmQ7XG5cdFx0XHRsb2coJ2V4aXRpbmcgdGVzdCBsb29wIC0gdmFsdWU6ICcgKyBmaW5kUmVzdWx0KTtcblx0XHRcdG5vdGlmeUxpc3RlbmVycygpO1xuXHRcdFx0aWYoY2xlYXJCYWl0Tm9kZSgpKXtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHR0aW1lcklkcy50ZXN0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRyZWVsSW4oYmFpdCwgYXR0ZW1wdE51bSk7XG5cdFx0XHR9LCBfb3B0aW9ucy5sb29wRGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNsZWFyQmFpdE5vZGUoKXtcblx0XHRpZihiYWl0Tm9kZSA9PT0gbnVsbCl7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0cnl7XG5cdFx0XHRpZihpc0Z1bmMoYmFpdE5vZGUucmVtb3ZlKSl7XG5cdFx0XHRcdGJhaXROb2RlLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChiYWl0Tm9kZSk7XG5cdFx0fVxuXHRcdGNhdGNoKGV4KXtcblx0XHR9XG5cdFx0YmFpdE5vZGUgPSBudWxsO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0KiBIYWx0IHRoZSB0ZXN0IGFuZCBhbnkgcGVuZGluZyB0aW1lb3V0c1xuXHQqL1xuXHRmdW5jdGlvbiBzdG9wRmlzaGluZygpe1xuXHRcdGlmKHRpbWVySWRzLnRlc3QgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy50ZXN0KTtcblx0XHR9XG5cdFx0aWYodGltZXJJZHMuZG93bmxvYWQgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy5kb3dubG9hZCk7XG5cdFx0fVxuXG5cdFx0Y2FuY2VsUmVtb3RlRG93bmxvYWRzKCk7XG5cblx0XHRjbGVhckJhaXROb2RlKCk7XG5cdH1cblxuXHQvKipcblx0KiBGaXJlIGFsbCByZWdpc3RlcmVkIGxpc3RlbmVyc1xuXHQqL1xuXHRmdW5jdGlvbiBub3RpZnlMaXN0ZW5lcnMoKXtcblx0XHR2YXIgaSwgZnVuY3M7XG5cdFx0aWYoZmluZFJlc3VsdCA9PT0gbnVsbCl7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvcihpPTA7aTxsaXN0ZW5lcnMubGVuZ3RoO2krKyl7XG5cdFx0XHRmdW5jcyA9IGxpc3RlbmVyc1tpXTtcblx0XHRcdHRyeXtcblx0XHRcdFx0aWYoZnVuY3MgIT0gbnVsbCl7XG5cdFx0XHRcdFx0aWYoaXNGdW5jKGZ1bmNzWydjb21wbGV0ZSddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snY29tcGxldGUnXShmaW5kUmVzdWx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZihmaW5kUmVzdWx0ICYmIGlzRnVuYyhmdW5jc1snZm91bmQnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ2ZvdW5kJ10oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSBpZihmaW5kUmVzdWx0ID09PSBmYWxzZSAmJiBpc0Z1bmMoZnVuY3NbJ25vdGZvdW5kJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydub3Rmb3VuZCddKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdGxvZygnRmFpbHVyZSBpbiBub3RpZnkgbGlzdGVuZXJzICcgKyBleC5NZXNzYWdlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBBdHRhY2hlcyBldmVudCBsaXN0ZW5lciBvciBmaXJlcyBpZiBldmVudHMgaGF2ZSBhbHJlYWR5IHBhc3NlZC5cblx0Ki9cblx0ZnVuY3Rpb24gYXR0YWNoT3JGaXJlKCl7XG5cdFx0dmFyIGZpcmVOb3cgPSBmYWxzZTtcblx0XHR2YXIgZm47XG5cblx0XHRpZihkb2N1bWVudC5yZWFkeVN0YXRlKXtcblx0XHRcdGlmKGRvY3VtZW50LnJlYWR5U3RhdGUgPT0gJ2NvbXBsZXRlJyl7XG5cdFx0XHRcdGZpcmVOb3cgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZuID0gZnVuY3Rpb24oKXtcblx0XHRcdGJlZ2luVGVzdChxdWlja0JhaXQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHRpZihmaXJlTm93KXtcblx0XHRcdGZuKCk7XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHRhdHRhY2hFdmVudExpc3RlbmVyKHdpbiwgJ2xvYWQnLCBmbik7XG5cdFx0fVxuXHR9XG5cblxuXHR2YXIgYmxvY2tMaXN0czsgLy8gdHJhY2tzIGV4dGVybmFsIGJsb2NrIGxpc3RzXG5cblx0LyoqXG5cdCogUHVibGljIGludGVyZmFjZSBvZiBhZGJsb2NrIGRldGVjdG9yXG5cdCovXG5cdHZhciBpbXBsID0ge1xuXHRcdC8qKlxuXHRcdCogVmVyc2lvbiBvZiB0aGUgYWRibG9jayBkZXRlY3RvciBwYWNrYWdlXG5cdFx0Ki9cblx0XHR2ZXJzaW9uOiB2ZXJzaW9uLFxuXG5cdFx0LyoqXG5cdFx0KiBJbml0aWFsaXphdGlvbiBmdW5jdGlvbi4gU2VlIGNvbW1lbnRzIGF0IHRvcCBmb3Igb3B0aW9ucyBvYmplY3Rcblx0XHQqL1xuXHRcdGluaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuXHRcdFx0dmFyIGssIHYsIGZ1bmNzO1xuXG5cdFx0XHRpZighb3B0aW9ucyl7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3MgPSB7XG5cdFx0XHRcdGNvbXBsZXRlOiBub29wLFxuXHRcdFx0XHRmb3VuZDogbm9vcCxcblx0XHRcdFx0bm90Zm91bmQ6IG5vb3Bcblx0XHRcdH07XG5cblx0XHRcdGZvcihrIGluIG9wdGlvbnMpe1xuXHRcdFx0XHRpZihvcHRpb25zLmhhc093blByb3BlcnR5KGspKXtcblx0XHRcdFx0XHRpZihrID09ICdjb21wbGV0ZScgfHwgayA9PSAnZm91bmQnIHx8IGsgPT0gJ25vdEZvdW5kJyl7XG5cdFx0XHRcdFx0XHRmdW5jc1trLnRvTG93ZXJDYXNlKCldID0gb3B0aW9uc1trXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHRcdF9vcHRpb25zW2tdID0gb3B0aW9uc1trXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGlzdGVuZXJzLnB1c2goZnVuY3MpO1xuXG5cdFx0XHRibG9ja0xpc3RzID0gbmV3IEJsb2NrTGlzdFRyYWNrZXIoKTtcblxuXHRcdFx0YXR0YWNoT3JGaXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0d2luWydhZGJsb2NrRGV0ZWN0b3InXSA9IGltcGw7XG5cbn0pKHdpbmRvdylcbiIsIi8qIVxuICogQHByZXNlcnZlXG4gKiBqcXVlcnkuc2Nyb2xsZGVwdGguanMgfCB2MS4yLjBcbiAqIENvcHlyaWdodCAoYykgMjAyMCBSb2IgRmxhaGVydHkgKEByb2JmbGFoZXJ0eSlcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgYW5kIEdQTCBsaWNlbnNlcy5cbiAqL1xuIWZ1bmN0aW9uKGUpe1wiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZD9kZWZpbmUoW1wianF1ZXJ5XCJdLGUpOlwib2JqZWN0XCI9PXR5cGVvZiBtb2R1bGUmJm1vZHVsZS5leHBvcnRzP21vZHVsZS5leHBvcnRzPWUocmVxdWlyZShcImpxdWVyeVwiKSk6ZShqUXVlcnkpfShmdW5jdGlvbihmKXtcInVzZSBzdHJpY3RcIjt2YXIgaSxhLGMscCxnLGU9e21pbkhlaWdodDowLGVsZW1lbnRzOltdLHBlcmNlbnRhZ2U6ITAsdXNlclRpbWluZzohMCxwaXhlbERlcHRoOiEwLG5vbkludGVyYWN0aW9uOiEwLGdhR2xvYmFsOiExLGd0bU92ZXJyaWRlOiExLHRyYWNrZXJOYW1lOiExLGRhdGFMYXllcjpcImRhdGFMYXllclwifSxtPWYod2luZG93KSxkPVtdLEQ9ITEsaD0wO3JldHVybiBmLnNjcm9sbERlcHRoPWZ1bmN0aW9uKHUpe3ZhciBzPStuZXcgRGF0ZTtmdW5jdGlvbiB2KGUsbix0LG8pe3ZhciByPXUudHJhY2tlck5hbWU/dS50cmFja2VyTmFtZStcIi5zZW5kXCI6XCJzZW5kXCI7Zz8oZyh7ZXZlbnQ6XCJTY3JvbGxEaXN0YW5jZVwiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjplLGV2ZW50TGFiZWw6bixldmVudFZhbHVlOjEsZXZlbnROb25JbnRlcmFjdGlvbjp1Lm5vbkludGVyYWN0aW9ufSksdS5waXhlbERlcHRoJiYyPGFyZ3VtZW50cy5sZW5ndGgmJmg8dCYmZyh7ZXZlbnQ6XCJTY3JvbGxEaXN0YW5jZVwiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjpcIlBpeGVsIERlcHRoXCIsZXZlbnRMYWJlbDpsKGg9dCksZXZlbnRWYWx1ZToxLGV2ZW50Tm9uSW50ZXJhY3Rpb246dS5ub25JbnRlcmFjdGlvbn0pLHUudXNlclRpbWluZyYmMzxhcmd1bWVudHMubGVuZ3RoJiZnKHtldmVudDpcIlNjcm9sbFRpbWluZ1wiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjplLGV2ZW50TGFiZWw6bixldmVudFRpbWluZzpvfSkpOnA/KGd0YWcoXCJldmVudFwiLGUse2V2ZW50X2NhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRfbGFiZWw6bix2YWx1ZToxLG5vbl9pbnRlcmFjdGlvbjp1Lm5vbkludGVyYWN0aW9ufSksdS5waXhlbERlcHRoJiYyPGFyZ3VtZW50cy5sZW5ndGgmJmg8dCYmKGg9dCxndGFnKFwiZXZlbnRcIixcIlBpeGVsIERlcHRoXCIse2V2ZW50X2NhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRfbGFiZWw6bCh0KSx2YWx1ZToxLG5vbl9pbnRlcmFjdGlvbjp1Lm5vbkludGVyYWN0aW9ufSkpLHUudXNlclRpbWluZyYmMzxhcmd1bWVudHMubGVuZ3RoJiZndGFnKFwiZXZlbnRcIixcInRpbWluZ19jb21wbGV0ZVwiLHtldmVudF9jYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLG5hbWU6ZSxldmVudF9sYWJlbDpuLHZhbHVlOm99KSk6KGkmJih3aW5kb3dbY10ocixcImV2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixlLG4sMSx7bm9uSW50ZXJhY3Rpb246dS5ub25JbnRlcmFjdGlvbn0pLHUucGl4ZWxEZXB0aCYmMjxhcmd1bWVudHMubGVuZ3RoJiZoPHQmJihoPXQsd2luZG93W2NdKHIsXCJldmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsXCJQaXhlbCBEZXB0aFwiLGwodCksMSx7bm9uSW50ZXJhY3Rpb246dS5ub25JbnRlcmFjdGlvbn0pKSx1LnVzZXJUaW1pbmcmJjM8YXJndW1lbnRzLmxlbmd0aCYmd2luZG93W2NdKHIsXCJ0aW1pbmdcIixcIlNjcm9sbCBEZXB0aFwiLGUsbyxuKSksYSYmKF9nYXEucHVzaChbXCJfdHJhY2tFdmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsZSxuLDEsdS5ub25JbnRlcmFjdGlvbl0pLHUucGl4ZWxEZXB0aCYmMjxhcmd1bWVudHMubGVuZ3RoJiZoPHQmJihoPXQsX2dhcS5wdXNoKFtcIl90cmFja0V2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixcIlBpeGVsIERlcHRoXCIsbCh0KSwxLHUubm9uSW50ZXJhY3Rpb25dKSksdS51c2VyVGltaW5nJiYzPGFyZ3VtZW50cy5sZW5ndGgmJl9nYXEucHVzaChbXCJfdHJhY2tUaW1pbmdcIixcIlNjcm9sbCBEZXB0aFwiLGUsbyxuLDEwMF0pKSl9ZnVuY3Rpb24gbChlKXtyZXR1cm4oMjUwKk1hdGguZmxvb3IoZS8yNTApKS50b1N0cmluZygpfWZ1bmN0aW9uIG4oKXtmdW5jdGlvbiB0KCl7cD1uZXcgRGF0ZSxjPW51bGwsYT1vLmFwcGx5KGwsaSl9dmFyIG8scixsLGksYSxjLHA7RD0hMCxtLm9uKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIsKG89ZnVuY3Rpb24oKXt2YXIgZSxuLHQsbyxyLGwsaSxhPWYoZG9jdW1lbnQpLmhlaWdodCgpLGM9d2luZG93LmlubmVySGVpZ2h0P3dpbmRvdy5pbm5lckhlaWdodDptLmhlaWdodCgpLHA9bS5zY3JvbGxUb3AoKStjLGc9KGU9YSx7XCIyNSVcIjpwYXJzZUludCguMjUqZSwxMCksXCI1MCVcIjpwYXJzZUludCguNSplLDEwKSxcIjc1JVwiOnBhcnNlSW50KC43NSplLDEwKSxcIjEwMCVcIjplLTV9KSxoPW5ldyBEYXRlLXM7aWYoZC5sZW5ndGg+PXUuZWxlbWVudHMubGVuZ3RoKyh1LnBlcmNlbnRhZ2U/NDowKSlyZXR1cm4gbS5vZmYoXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIiksdm9pZChEPSExKTt1LmVsZW1lbnRzJiYobj11LmVsZW1lbnRzLHQ9cCxvPWgsZi5lYWNoKG4sZnVuY3Rpb24oZSxuKXstMT09PWYuaW5BcnJheShuLGQpJiZmKG4pLmxlbmd0aCYmdD49ZihuKS5vZmZzZXQoKS50b3AmJih2KFwiRWxlbWVudHNcIixuLHQsbyksZC5wdXNoKG4pKX0pKSx1LnBlcmNlbnRhZ2UmJihyPWcsbD1wLGk9aCxmLmVhY2gocixmdW5jdGlvbihlLG4pey0xPT09Zi5pbkFycmF5KGUsZCkmJm48PWwmJih2KFwiUGVyY2VudGFnZVwiLGUsbCxpKSxkLnB1c2goZSkpfSkpfSxyPTUwMCxjPW51bGwscD0wLGZ1bmN0aW9uKCl7dmFyIGU9bmV3IERhdGUsbj1yLShlLShwPXB8fGUpKTtyZXR1cm4gbD10aGlzLGk9YXJndW1lbnRzLG48PTA/KGNsZWFyVGltZW91dChjKSxjPW51bGwscD1lLGE9by5hcHBseShsLGkpKTpjPWN8fHNldFRpbWVvdXQodCxuKSxhfSkpfXU9Zi5leHRlbmQoe30sZSx1KSxmKGRvY3VtZW50KS5oZWlnaHQoKTx1Lm1pbkhlaWdodHx8KHUuZ2FHbG9iYWw/KGk9ITAsYz11LmdhR2xvYmFsKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBndGFnPyhwPSEwLGM9XCJndGFnXCIpOlwiZnVuY3Rpb25cIj09dHlwZW9mIGdhPyhpPSEwLGM9XCJnYVwiKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBfX2dhVHJhY2tlciYmKGk9ITAsYz1cIl9fZ2FUcmFja2VyXCIpLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBfZ2FxJiZcImZ1bmN0aW9uXCI9PXR5cGVvZiBfZ2FxLnB1c2gmJihhPSEwKSxcImZ1bmN0aW9uXCI9PXR5cGVvZiB1LmV2ZW50SGFuZGxlcj9nPXUuZXZlbnRIYW5kbGVyOnZvaWQgMD09PXdpbmRvd1t1LmRhdGFMYXllcl18fFwiZnVuY3Rpb25cIiE9dHlwZW9mIHdpbmRvd1t1LmRhdGFMYXllcl0ucHVzaHx8dS5ndG1PdmVycmlkZXx8KGc9ZnVuY3Rpb24oZSl7d2luZG93W3UuZGF0YUxheWVyXS5wdXNoKGUpfSksZi5zY3JvbGxEZXB0aC5yZXNldD1mdW5jdGlvbigpe2Q9W10saD0wLG0ub2ZmKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIpLG4oKX0sZi5zY3JvbGxEZXB0aC5hZGRFbGVtZW50cz1mdW5jdGlvbihlKXt2b2lkIDAhPT1lJiZmLmlzQXJyYXkoZSkmJihmLm1lcmdlKHUuZWxlbWVudHMsZSksRHx8bigpKX0sZi5zY3JvbGxEZXB0aC5yZW1vdmVFbGVtZW50cz1mdW5jdGlvbihlKXt2b2lkIDAhPT1lJiZmLmlzQXJyYXkoZSkmJmYuZWFjaChlLGZ1bmN0aW9uKGUsbil7dmFyIHQ9Zi5pbkFycmF5KG4sdS5lbGVtZW50cyksbz1mLmluQXJyYXkobixkKTstMSE9dCYmdS5lbGVtZW50cy5zcGxpY2UodCwxKSwtMSE9byYmZC5zcGxpY2UobywxKX0pfSxuKCkpfSxmLnNjcm9sbERlcHRofSk7IiwiKCBmdW5jdGlvbiggJCApIHtcblxuXHQvKlxuXHQgKiBDcmVhdGUgYSBHb29nbGUgQW5hbHl0aWNzIGV2ZW50XG5cdCAqIGNhdGVnb3J5OiBFdmVudCBDYXRlZ29yeVxuXHQgKiBsYWJlbDogRXZlbnQgTGFiZWxcblx0ICogYWN0aW9uOiBFdmVudCBBY3Rpb25cblx0ICogdmFsdWU6IG9wdGlvbmFsXG5cdCovXG5cdGZ1bmN0aW9uIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICkge1xuXHRcdGlmICggdHlwZW9mIGd0YWcgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0Ly8gU2VuZHMgdGhlIGV2ZW50IHRvIHRoZSBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGhcblx0XHRcdC8vIHRyYWNraW5nIElEIEdBX01FQVNVUkVNRU5UX0lEIHNldCBieSB0aGUgY29uZmlnIGNvbW1hbmQgaW5cblx0XHRcdC8vIHRoZSBnbG9iYWwgdHJhY2tpbmcgc25pcHBldC5cblx0XHRcdC8vIGV4YW1wbGU6IGd0YWcoJ2V2ZW50JywgJ3BsYXknLCB7ICdldmVudF9jYXRlZ29yeSc6ICdWaWRlb3MnLCAnZXZlbnRfbGFiZWwnOiAnRmFsbCBDYW1wYWlnbicgfSk7XG5cdFx0XHRpZiAoIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdGd0YWcoIHR5cGUsIGFjdGlvbiwge1xuXHRcdFx0XHRcdCdldmVudF9jYXRlZ29yeSc6IGNhdGVnb3J5LFxuXHRcdFx0XHRcdCdldmVudF9sYWJlbCc6IGxhYmVsXG5cdFx0XHRcdH0gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGd0YWcoIHR5cGUsIGFjdGlvbiwge1xuXHRcdFx0XHRcdCdldmVudF9jYXRlZ29yeSc6IGNhdGVnb3J5LFxuXHRcdFx0XHRcdCdldmVudF9sYWJlbCc6IGxhYmVsLFxuXHRcdFx0XHRcdCd2YWx1ZSc6IHZhbHVlXG5cdFx0XHRcdH0gKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCB0eXBlb2YgZ2EgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0Ly8gVXNlcyB0aGUgZGVmYXVsdCB0cmFja2VyIHRvIHNlbmQgdGhlIGV2ZW50IHRvIHRoZVxuXHRcdFx0Ly8gR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoIHRyYWNraW5nIElEIEdBX01FQVNVUkVNRU5UX0lELlxuXHRcdFx0Ly8gZXhhbXBsZTogZ2EoJ3NlbmQnLCAnZXZlbnQnLCAnVmlkZW9zJywgJ3BsYXknLCAnRmFsbCBDYW1wYWlnbicpO1xuXHRcdFx0aWYgKCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKSB7XG5cdFx0aWYgKCAndW5kZWZpbmVkJyA9PT0gdHlwZW9mIGd0YWcgJiYgJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dmFyIHNjcm9sbERlcHRoU2V0dGluZ3MgPSBbXTtcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICkge1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5lbmFibGVkICkge1xuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgc3RyaW5nIGFuZCBhIGJvb2xlYW5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hbmFseXRpY3NfdHlwZSAmJiAnZ3RhZ2pzJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2d0bU92ZXJyaWRlJ10gPSB0cnVlO1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2dhR2xvYmFsJ10gPSAnZ2EnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmdcblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgJiYgJzAnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ21pbmltdW1faGVpZ2h0J10gPSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBlcmNlbnRhZ2UgJiYgJ3RydWUnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBlcmNlbnRhZ2UgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGVyY2VudGFnZSddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgJiYgJ3RydWUnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3VzZXJfdGltaW5nJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5waXhlbF9kZXB0aCAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sncGl4ZWxfZGVwdGgnXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm5vbl9pbnRlcmFjdGlvbiAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ25vbl9pbnRlcmFjdGlvbiddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhbiBhcnJheS4gZGVmYXVsdCBpcyBlbXB0eS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ2VsZW1lbnRzJ10gPSAkLm1hcCggYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMuc3BsaXQoICcsJyApLCAkLnRyaW0gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRcblx0XHRcdFx0Ly8gc2VuZCBzY3JvbGwgc2V0dGluZ3MgdG8gdGhlIHNjcm9sbGRlcHRoIHBsdWdpblxuXHRcdFx0XHRqUXVlcnkuc2Nyb2xsRGVwdGgoIHNjcm9sbERlcHRoU2V0dGluZ3MgKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmVuYWJsZWQgKSB7XG5cblx0XHRcdFx0Ly8gZXh0ZXJuYWwgbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJodHRwXCJdOm5vdChbaHJlZio9XCI6Ly8nICsgZG9jdW1lbnQuZG9tYWluICsgJ1wiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnT3V0Ym91bmQgbGlua3MnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gbWFpbHRvIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwibWFpbHRvXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ01haWxzJywgJ0NsaWNrJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIHRlbCBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cInRlbFwiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdUZWxlcGhvbmUnLCAnQ2FsbCcsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBpbnRlcm5hbCBsaW5rc1xuXHRcdFx0XHQkKCAnYTpub3QoW2hyZWZePVwiKGh0dHA6fGh0dHBzOik/Ly9cIl0sW2hyZWZePVwiI1wiXSxbaHJlZl49XCJtYWlsdG86XCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0XHQvLyB0cmFjayBkb3dubG9hZHNcblx0XHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCApIHtcblx0XHRcdFx0XHRcdHZhciB1cmwgPSB0aGlzLmhyZWY7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZCA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdFx0dmFyIGlzRG93bmxvYWQgPSBjaGVja0Rvd25sb2FkLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0Rvd25sb2FkICkge1xuXHRcdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZEV4dGVuc2lvbiA9IG5ldyBSZWdFeHAoXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiKTtcblx0XHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvblJlc3VsdCA9IGNoZWNrRG93bmxvYWRFeHRlbnNpb24uZXhlYyggdXJsICk7XG5cdFx0XHRcdFx0XHRcdHZhciBleHRlbnNpb24gPSAnJztcblx0XHRcdFx0XHRcdFx0aWYgKCBudWxsICE9PSBleHRlbnNpb25SZXN1bHQgKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0WzFdO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvLyB3ZSBjYW4ndCB1c2UgdGhlIHVybCBmb3IgdGhlIHZhbHVlIGhlcmUsIGV2ZW4gdGhvdWdoIHRoYXQgd291bGQgYmUgbmljZSwgYmVjYXVzZSB2YWx1ZSBpcyBzdXBwb3NlZCB0byBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0Rvd25sb2FkcycsIGV4dGVuc2lvbiwgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9XG5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuZW5hYmxlZCApIHtcblx0XHRcdFx0Ly8gYW55IGxpbmsgY291bGQgYmUgYW4gYWZmaWxpYXRlLCBpIGd1ZXNzP1xuXHRcdFx0XHQkKCAnYScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0XHQvLyB0cmFjayBhZmZpbGlhdGVzXG5cdFx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKSB7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tBZmZpbGlhdGUgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHRcdHZhciBpc0FmZmlsaWF0ZSA9IGNoZWNrQWZmaWxpYXRlLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0FmZmlsaWF0ZSApIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWZmaWxpYXRlJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBsaW5rIGZyYWdtZW50cyBhcyBwYWdldmlld3Ncblx0XHRcdC8vIGRvZXMgbm90IHVzZSB0aGUgZXZlbnQgdHJhY2tpbmcgbWV0aG9kXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50ICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudC5lbmFibGVkICkge1xuXHRcdFx0XHRpZiAoIHR5cGVvZiBnYSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdFx0d2luZG93Lm9uaGFzaGNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Z2EoICdzZW5kJywgJ3BhZ2V2aWV3JywgbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBsb2NhdGlvbi5oYXNoICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIHdoZW4gYSBidXR0b24gaXMgY2xpY2tlZCwgYXR0YWNoIGl0IHRvIHRoZSBmb3JtJ3MgZGF0YVxuXHRcdFx0JCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLm9uKCAnY2xpY2snLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIGZvcm0gPSAkKCB0aGlzICkucGFyZW50cyggJ2Zvcm06Zmlyc3QnICk7XG5cdFx0XHRcdCQoIGZvcm0gKS5kYXRhKCAnYnV0dG9uJywgdGhpcyApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGJhc2ljIGZvcm0gc3VibWl0cy4gdHJhY2sgc3VibWl0IGluc3RlYWQgb2YgY2xpY2sgYmVjYXVzZSBvdGhlcndpc2UgaXQncyB3ZWlyZC5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucyAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZm9ybV9zdWJtaXNzaW9ucy5lbmFibGVkICkge1xuXHRcdFx0XHQkKCAnZm9ybScgKS5zdWJtaXQoIGZ1bmN0aW9uKCBmICkge1xuXHRcdFx0XHRcdHZhciBidXR0b24gPSAkKCB0aGlzICkuZGF0YSggJ2J1dHRvbicgKSB8fCAkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkuZ2V0KCAwICk7XG5cdFx0ICAgICAgICAgICAgdmFyIGNhdGVnb3J5ID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWNhdGVnb3J5JyApIHx8ICdGb3JtJztcblx0XHQgICAgICAgICAgICB2YXIgYWN0aW9uID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWFjdGlvbicgKSB8fCAnU3VibWl0Jztcblx0XHQgICAgICAgICAgICB2YXIgbGFiZWwgPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtbGFiZWwnICkgfHwgJCggYnV0dG9uICkudGV4dCgpIHx8IGJ1dHRvbi52YWx1ZSB8fCBidXR0b24ubmFtZTtcblx0XHQgICAgICAgICAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsICk7XG5cdFx0ICAgICAgICB9KTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmxvZyggJ25vIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncycgKTtcblx0XHR9XG5cdH1cblxuXHQkKCBkb2N1bWVudCApLnJlYWR5KCBmdW5jdGlvbigpIHtcblx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKTtcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnRyYWNrX2FkYmxvY2tlciAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MudHJhY2tfYWRibG9ja2VyLmVuYWJsZWQgKSB7XG5cdFx0XHRpZiAoIHR5cGVvZiB3aW5kb3cuYWRibG9ja0RldGVjdG9yID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPbicsIHsgJ25vbkludGVyYWN0aW9uJzogMSB9ICk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZGVidWc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Zm91bmQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09uJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRub3RGb3VuZDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT2ZmJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxufSApKCBqUXVlcnkgKTtcbiJdfQ==
