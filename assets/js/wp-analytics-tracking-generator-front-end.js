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
        label = {
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
        wp_analytics_tracking_event('event', 'Adblock', 'On', 'Adblocker Status', undefined, 1);
      } else {
        window.adblockDetector.init({
          debug: false,
          found: function found() {
            wp_analytics_tracking_event('event', 'Adblock', 'On', 'Adblocker Status', undefined, 1);
          },
          notFound: function notFound() {
            wp_analytics_tracking_event('event', 'Adblock', 'Off', 'Adblocker Status', undefined, 1);
          }
        });
      }
    }
  });
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFkYmxvY2tEZXRlY3Rvci5qcyIsImpxdWVyeS5zY3JvbGxkZXB0aC5taW4uanMiLCJ3cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwiZiIsImEiLCJjIiwicCIsImciLCJtaW5IZWlnaHQiLCJlbGVtZW50cyIsInBlcmNlbnRhZ2UiLCJ1c2VyVGltaW5nIiwicGl4ZWxEZXB0aCIsIm5vbkludGVyYWN0aW9uIiwiZ2FHbG9iYWwiLCJndG1PdmVycmlkZSIsInRyYWNrZXJOYW1lIiwiZGF0YUxheWVyIiwibSIsIkQiLCJoIiwic2Nyb2xsRGVwdGgiLCJ1IiwicyIsIkRhdGUiLCJuIiwibyIsInIiLCJldmVudCIsImV2ZW50Q2F0ZWdvcnkiLCJldmVudEFjdGlvbiIsImV2ZW50TGFiZWwiLCJldmVudFZhbHVlIiwiZXZlbnROb25JbnRlcmFjdGlvbiIsImFyZ3VtZW50cyIsImwiLCJldmVudFRpbWluZyIsImd0YWciLCJldmVudF9jYXRlZ29yeSIsImV2ZW50X2xhYmVsIiwidmFsdWUiLCJub25faW50ZXJhY3Rpb24iLCJuYW1lIiwiX2dhcSIsIk1hdGgiLCJmbG9vciIsInRvU3RyaW5nIiwiYXBwbHkiLCJvbiIsImhlaWdodCIsImlubmVySGVpZ2h0Iiwic2Nyb2xsVG9wIiwicGFyc2VJbnQiLCJvZmYiLCJlYWNoIiwiaW5BcnJheSIsIm9mZnNldCIsInRvcCIsImV4dGVuZCIsImdhIiwiX19nYVRyYWNrZXIiLCJldmVudEhhbmRsZXIiLCJyZXNldCIsImFkZEVsZW1lbnRzIiwiaXNBcnJheSIsIm1lcmdlIiwicmVtb3ZlRWxlbWVudHMiLCJzcGxpY2UiLCIkIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50IiwidHlwZSIsImNhdGVnb3J5IiwiYWN0aW9uIiwibGFiZWwiLCJwYXJhbXMiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAiLCJzY3JvbGxEZXB0aFNldHRpbmdzIiwiYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsImFuYWx5dGljc190eXBlIiwibWluaW11bV9oZWlnaHQiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwic2Nyb2xsX2VsZW1lbnRzIiwibWFwIiwic3BsaXQiLCJ0cmltIiwic3BlY2lhbCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJjaGVja0Rvd25sb2FkRXh0ZW5zaW9uIiwiZXh0ZW5zaW9uUmVzdWx0IiwiZXhlYyIsImV4dGVuc2lvbiIsImFmZmlsaWF0ZSIsImFmZmlsaWF0ZV9yZWdleCIsImNoZWNrQWZmaWxpYXRlIiwiaXNBZmZpbGlhdGUiLCJmcmFnbWVudCIsIm9uaGFzaGNoYW5nZSIsImxvY2F0aW9uIiwicGF0aG5hbWUiLCJzZWFyY2giLCJoYXNoIiwiZm9ybSIsInBhcmVudHMiLCJmb3JtX3N1Ym1pc3Npb25zIiwic3VibWl0IiwiYnV0dG9uIiwiZ2V0IiwidGV4dCIsInJlYWR5IiwidHJhY2tfYWRibG9ja2VyIiwiYWRibG9ja0RldGVjdG9yIiwibm90Rm91bmQiXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQSxDQUFDLFVBQVNBLEdBQVQsRUFBYztBQUVkLE1BQUlDLE9BQU8sR0FBRyxLQUFkO0FBRUEsTUFBSUMsR0FBRyxHQUFHLFFBQVY7QUFBQSxNQUFvQkMsRUFBRSxHQUFHLFFBQXpCOztBQUNBLE1BQUlDLElBQUksR0FBRyxTQUFQQSxJQUFPLEdBQVUsQ0FBRSxDQUF2Qjs7QUFFQSxNQUFJQyxVQUFVLEdBQUcsS0FBakI7QUFDQSxNQUFJQyxhQUFhLEdBQUcsS0FBcEI7QUFFQSxNQUFJQyxhQUFhLEdBQUlQLEdBQUcsQ0FBQ1EsZ0JBQUosS0FBeUJDLFNBQTlDO0FBRUE7QUFDRDtBQUNBO0FBQ0E7O0FBQ0MsTUFBSUMsUUFBUSxHQUFHO0FBQ2RDLElBQUFBLFNBQVMsRUFBRSxFQURHO0FBRWRDLElBQUFBLE9BQU8sRUFBRSxDQUZLO0FBR2RDLElBQUFBLEtBQUssRUFBRSxJQUhPO0FB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UzFDLDJCQUEyQixDQUFDMEMsZUFBNUIsQ0FBNEN4QyxPQUFoSSxFQUEwSTtBQUN6SSxVQUFLLE9BQU9uRyxNQUFNLENBQUM0SSxlQUFkLEtBQWtDLFdBQXZDLEVBQXFEO0FBQ3BEbkQsUUFBQUEsMkJBQTJCLENBQUUsT0FBRixFQUFXLFNBQVgsRUFBc0IsSUFBdEIsRUFBNEIsa0JBQTVCLEVBQWdEMU0sU0FBaEQsRUFBMkQsQ0FBM0QsQ0FBM0I7QUFDQSxPQUZELE1BRU87QUFDTmlILFFBQUFBLE1BQU0sQ0FBQzRJLGVBQVAsQ0FBdUIvSCxJQUF2QixDQUNDO0FBQ0MxSCxVQUFBQSxLQUFLLEVBQUUsS0FEUjtBQUVDQyxVQUFBQSxLQUFLLEVBQUUsaUJBQVc7QUFDakJxTSxZQUFBQSwyQkFBMkIsQ0FBRSxPQUFGLEVBQVcsU0FBWCxFQUFzQixJQUF0QixFQUE0QixrQkFBNUIsRUFBZ0QxTSxTQUFoRCxFQUEyRCxDQUEzRCxDQUEzQjtBQUNBLFdBSkY7QUFLQzhQLFVBQUFBLFFBQVEsRUFBRSxvQkFBVztBQUNwQnBELFlBQUFBLDJCQUEyQixDQUFFLE9BQUYsRUFBVyxTQUFYLEVBQXNCLEtBQXRCLEVBQTZCLGtCQUE3QixFQUFpRDFNLFNBQWpELEVBQTRELENBQTVELENBQTNCO0FBQ0E7QUFQRixTQUREO0FBV0E7QUFDRDtBQUNELEdBbkJEO0FBcUJBLENBNU1ELEVBNE1LdUksTUE1TUwiLCJmaWxlIjoid3AtYW5hbHl0aWNzLXRyYWNraW5nLWdlbmVyYXRvci1mcm9udC1lbmQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQWRCbG9jayBkZXRlY3RvclxuLy9cbi8vIEF0dGVtcHRzIHRvIGRldGVjdCB0aGUgcHJlc2VuY2Ugb2YgQWQgQmxvY2tlciBzb2Z0d2FyZSBhbmQgbm90aWZ5IGxpc3RlbmVyIG9mIGl0cyBleGlzdGVuY2UuXG4vLyBDb3B5cmlnaHQgKGMpIDIwMTcgSUFCXG4vL1xuLy8gVGhlIEJTRC0zIExpY2Vuc2Vcbi8vIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbi8vIDEuIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbi8vIDIuIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbi8vIDMuIE5laXRoZXIgdGhlIG5hbWUgb2YgdGhlIGNvcHlyaWdodCBob2xkZXIgbm9yIHRoZSBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0cyBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbi8vIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORCBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SIEFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7IExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVCAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJUyBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuKiBAbmFtZSB3aW5kb3cuYWRibG9ja0RldGVjdG9yXG4qXG4qIElBQiBBZGJsb2NrIGRldGVjdG9yLlxuKiBVc2FnZTogd2luZG93LmFkYmxvY2tEZXRlY3Rvci5pbml0KG9wdGlvbnMpO1xuKlxuKiBPcHRpb25zIG9iamVjdCBzZXR0aW5nc1xuKlxuKlx0QHByb3AgZGVidWc6ICBib29sZWFuXG4qICAgICAgICAgRmxhZyB0byBpbmRpY2F0ZSBhZGRpdGlvbmFsIGRlYnVnIG91dHB1dCBzaG91bGQgYmUgcHJpbnRlZCB0byBjb25zb2xlXG4qXG4qXHRAcHJvcCBmb3VuZDogQGZ1bmN0aW9uXG4qICAgICAgICAgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBpZiBhZGJsb2NrIGlzIGRldGVjdGVkXG4qXG4qXHRAcHJvcCBub3Rmb3VuZDogQGZ1bmN0aW9uXG4qICAgICAgICAgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBpZiBhZGJsb2NrIGlzIG5vdCBkZXRlY3RlZC5cbiogICAgICAgICBOT1RFOiB0aGlzIGZ1bmN0aW9uIG1heSBmaXJlIG11bHRpcGxlIHRpbWVzIGFuZCBnaXZlIGZhbHNlIG5lZ2F0aXZlXG4qICAgICAgICAgcmVzcG9uc2VzIGR1cmluZyBhIHRlc3QgdW50aWwgYWRibG9jayBpcyBzdWNjZXNzZnVsbHkgZGV0ZWN0ZWQuXG4qXG4qXHRAcHJvcCBjb21wbGV0ZTogQGZ1bmN0aW9uXG4qICAgICAgICAgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBvbmNlIGEgcm91bmQgb2YgdGVzdGluZyBpcyBjb21wbGV0ZS5cbiogICAgICAgICBUaGUgdGVzdCByZXN1bHQgKGJvb2xlYW4pIGlzIGluY2x1ZGVkIGFzIGEgcGFyYW1ldGVyIHRvIGNhbGxiYWNrXG4qXG4qIGV4YW1wbGU6IFx0d2luZG93LmFkYmxvY2tEZXRlY3Rvci5pbml0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Zm91bmQ6IGZ1bmN0aW9uKCl7IC4uLn0sXG4gXHRcdFx0XHRcdG5vdEZvdW5kOiBmdW5jdGlvbigpey4uLn1cblx0XHRcdFx0fVxuXHRcdFx0KTtcbipcbipcbiovXG5cblwidXNlIHN0cmljdFwiO1xuKGZ1bmN0aW9uKHdpbikge1xuXG5cdHZhciB2ZXJzaW9uID0gJzEuMCc7XG5cblx0dmFyIG9mcyA9ICdvZmZzZXQnLCBjbCA9ICdjbGllbnQnO1xuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uKCl7fTtcblxuXHR2YXIgdGVzdGVkT25jZSA9IGZhbHNlO1xuXHR2YXIgdGVzdEV4ZWN1dGluZyA9IGZhbHNlO1xuXG5cdHZhciBpc09sZElFZXZlbnRzID0gKHdpbi5hZGRFdmVudExpc3RlbmVyID09PSB1bmRlZmluZWQpO1xuXG5cdC8qKlxuXHQqIE9wdGlvbnMgc2V0IHdpdGggZGVmYXVsdCBvcHRpb25zIGluaXRpYWxpemVkXG5cdCpcblx0Ki9cblx0dmFyIF9vcHRpb25zID0ge1xuXHRcdGxvb3BEZWxheTogNTAsXG5cdFx0bWF4TG9vcDogNSxcblx0XHRkZWJ1ZzogdHJ1ZSxcblx0XHRmb3VuZDogbm9vcCwgXHRcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgd2hlbiBhZGJsb2NrIGRldGVjdGVkXG5cdFx0bm90Zm91bmQ6IG5vb3AsIFx0XHRcdFx0Ly8gZnVuY3Rpb24gdG8gZmlyZSBpZiBhZGJsb2NrIG5vdCBkZXRlY3RlZCBhZnRlciB0ZXN0aW5nXG5cdFx0Y29tcGxldGU6IG5vb3AgIFx0XHRcdFx0Ly8gZnVuY3Rpb24gdG8gZmlyZSBhZnRlciB0ZXN0aW5nIGNvbXBsZXRlcywgcGFzc2luZyByZXN1bHQgYXMgcGFyYW1ldGVyXG5cdH1cblxuXHRmdW5jdGlvbiBwYXJzZUFzSnNvbihkYXRhKXtcblx0XHR2YXIgcmVzdWx0LCBmbkRhdGE7XG5cdFx0dHJ5e1xuXHRcdFx0cmVzdWx0ID0gSlNPTi5wYXJzZShkYXRhKTtcblx0XHR9XG5cdFx0Y2F0Y2goZXgpe1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHRmbkRhdGEgPSBuZXcgRnVuY3Rpb24oXCJyZXR1cm4gXCIgKyBkYXRhKTtcblx0XHRcdFx0cmVzdWx0ID0gZm5EYXRhKCk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdGxvZygnRmFpbGVkIHNlY29uZGFyeSBKU09OIHBhcnNlJywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQqIEFqYXggaGVscGVyIG9iamVjdCB0byBkb3dubG9hZCBleHRlcm5hbCBzY3JpcHRzLlxuXHQqIEluaXRpYWxpemUgb2JqZWN0IHdpdGggYW4gb3B0aW9ucyBvYmplY3Rcblx0KiBFeDpcblx0ICB7XG5cdFx0ICB1cmwgOiAnaHR0cDovL2V4YW1wbGUub3JnL3VybF90b19kb3dubG9hZCcsXG5cdFx0ICBtZXRob2Q6ICdQT1NUfEdFVCcsXG5cdFx0ICBzdWNjZXNzOiBjYWxsYmFja19mdW5jdGlvbixcblx0XHQgIGZhaWw6ICBjYWxsYmFja19mdW5jdGlvblxuXHQgIH1cblx0Ki9cblx0dmFyIEFqYXhIZWxwZXIgPSBmdW5jdGlvbihvcHRzKXtcblx0XHR2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cblx0XHR0aGlzLnN1Y2Nlc3MgPSBvcHRzLnN1Y2Nlc3MgfHwgbm9vcDtcblx0XHR0aGlzLmZhaWwgPSBvcHRzLmZhaWwgfHwgbm9vcDtcblx0XHR2YXIgbWUgPSB0aGlzO1xuXG5cdFx0dmFyIG1ldGhvZCA9IG9wdHMubWV0aG9kIHx8ICdnZXQnO1xuXG5cdFx0LyoqXG5cdFx0KiBBYm9ydCB0aGUgcmVxdWVzdFxuXHRcdCovXG5cdFx0dGhpcy5hYm9ydCA9IGZ1bmN0aW9uKCl7XG5cdFx0XHR0cnl7XG5cdFx0XHRcdHhoci5hYm9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHN0YXRlQ2hhbmdlKHZhbHMpe1xuXHRcdFx0aWYoeGhyLnJlYWR5U3RhdGUgPT0gNCl7XG5cdFx0XHRcdGlmKHhoci5zdGF0dXMgPT0gMjAwKXtcblx0XHRcdFx0XHRtZS5zdWNjZXNzKHhoci5yZXNwb25zZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHQvLyBmYWlsZWRcblx0XHRcdFx0XHRtZS5mYWlsKHhoci5zdGF0dXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0eGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IHN0YXRlQ2hhbmdlO1xuXG5cdFx0ZnVuY3Rpb24gc3RhcnQoKXtcblx0XHRcdHhoci5vcGVuKG1ldGhvZCwgb3B0cy51cmwsIHRydWUpO1xuXHRcdFx0eGhyLnNlbmQoKTtcblx0XHR9XG5cblx0XHRzdGFydCgpO1xuXHR9XG5cblx0LyoqXG5cdCogT2JqZWN0IHRyYWNraW5nIHRoZSB2YXJpb3VzIGJsb2NrIGxpc3RzXG5cdCovXG5cdHZhciBCbG9ja0xpc3RUcmFja2VyID0gZnVuY3Rpb24oKXtcblx0XHR2YXIgbWUgPSB0aGlzO1xuXHRcdHZhciBleHRlcm5hbEJsb2NrbGlzdERhdGEgPSB7fTtcblxuXHRcdC8qKlxuXHRcdCogQWRkIGEgbmV3IGV4dGVybmFsIFVSTCB0byB0cmFja1xuXHRcdCovXG5cdFx0dGhpcy5hZGRVcmwgPSBmdW5jdGlvbih1cmwpe1xuXHRcdFx0ZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybF0gPSB7XG5cdFx0XHRcdHVybDogdXJsLFxuXHRcdFx0XHRzdGF0ZTogJ3BlbmRpbmcnLFxuXHRcdFx0XHRmb3JtYXQ6IG51bGwsXG5cdFx0XHRcdGRhdGE6IG51bGwsXG5cdFx0XHRcdHJlc3VsdDogbnVsbFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybF07XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0KiBMb2FkcyBhIGJsb2NrIGxpc3QgZGVmaW5pdGlvblxuXHRcdCovXG5cdFx0dGhpcy5zZXRSZXN1bHQgPSBmdW5jdGlvbih1cmxLZXksIHN0YXRlLCBkYXRhKXtcblx0XHRcdHZhciBvYmogPSBleHRlcm5hbEJsb2NrbGlzdERhdGFbdXJsS2V5XTtcblx0XHRcdGlmKG9iaiA9PSBudWxsKXtcblx0XHRcdFx0b2JqID0gdGhpcy5hZGRVcmwodXJsS2V5KTtcblx0XHRcdH1cblxuXHRcdFx0b2JqLnN0YXRlID0gc3RhdGU7XG5cdFx0XHRpZihkYXRhID09IG51bGwpe1xuXHRcdFx0XHRvYmoucmVzdWx0ID0gbnVsbDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZih0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpe1xuXHRcdFx0XHR0cnl7XG5cdFx0XHRcdFx0ZGF0YSA9IHBhcnNlQXNKc29uKGRhdGEpO1xuXHRcdFx0XHRcdG9iai5mb3JtYXQgPSAnanNvbic7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRcdG9iai5mb3JtYXQgPSAnZWFzeWxpc3QnO1xuXHRcdFx0XHRcdC8vIHBhcnNlRWFzeUxpc3QoZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG9iai5kYXRhID0gZGF0YTtcblxuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9XG5cblx0fVxuXG5cdHZhciBsaXN0ZW5lcnMgPSBbXTsgLy8gZXZlbnQgcmVzcG9uc2UgbGlzdGVuZXJzXG5cdHZhciBiYWl0Tm9kZSA9IG51bGw7XG5cdHZhciBxdWlja0JhaXQgPSB7XG5cdFx0Y3NzQ2xhc3M6ICdwdWJfMzAweDI1MCBwdWJfMzAweDI1MG0gcHViXzcyOHg5MCB0ZXh0LWFkIHRleHRBZCB0ZXh0X2FkIHRleHRfYWRzIHRleHQtYWRzIHRleHQtYWQtbGlua3MnXG5cdH07XG5cdHZhciBiYWl0VHJpZ2dlcnMgPSB7XG5cdFx0bnVsbFByb3BzOiBbb2ZzICsgJ1BhcmVudCddLFxuXHRcdHplcm9Qcm9wczogW11cblx0fTtcblxuXHRiYWl0VHJpZ2dlcnMuemVyb1Byb3BzID0gW1xuXHRcdG9mcyArJ0hlaWdodCcsIG9mcyArJ0xlZnQnLCBvZnMgKydUb3AnLCBvZnMgKydXaWR0aCcsIG9mcyArJ0hlaWdodCcsXG5cdFx0Y2wgKyAnSGVpZ2h0JywgY2wgKyAnV2lkdGgnXG5cdF07XG5cblx0Ly8gcmVzdWx0IG9iamVjdFxuXHR2YXIgZXhlUmVzdWx0ID0ge1xuXHRcdHF1aWNrOiBudWxsLFxuXHRcdHJlbW90ZTogbnVsbFxuXHR9O1xuXG5cdHZhciBmaW5kUmVzdWx0ID0gbnVsbDsgLy8gcmVzdWx0IG9mIHRlc3QgZm9yIGFkIGJsb2NrZXJcblxuXHR2YXIgdGltZXJJZHMgPSB7XG5cdFx0dGVzdDogMCxcblx0XHRkb3dubG9hZDogMFxuXHR9O1xuXG5cdGZ1bmN0aW9uIGlzRnVuYyhmbil7XG5cdFx0cmV0dXJuIHR5cGVvZihmbikgPT0gJ2Z1bmN0aW9uJztcblx0fVxuXG5cdC8qKlxuXHQqIE1ha2UgYSBET00gZWxlbWVudFxuXHQqL1xuXHRmdW5jdGlvbiBtYWtlRWwodGFnLCBhdHRyaWJ1dGVzKXtcblx0XHR2YXIgaywgdiwgZWwsIGF0dHIgPSBhdHRyaWJ1dGVzO1xuXHRcdHZhciBkID0gZG9jdW1lbnQ7XG5cblx0XHRlbCA9IGQuY3JlYXRlRWxlbWVudCh0YWcpO1xuXG5cdFx0aWYoYXR0cil7XG5cdFx0XHRmb3IoayBpbiBhdHRyKXtcblx0XHRcdFx0aWYoYXR0ci5oYXNPd25Qcm9wZXJ0eShrKSl7XG5cdFx0XHRcdFx0ZWwuc2V0QXR0cmlidXRlKGssIGF0dHJba10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXR0YWNoRXZlbnRMaXN0ZW5lcihkb20sIGV2ZW50TmFtZSwgaGFuZGxlcil7XG5cdFx0aWYoaXNPbGRJRWV2ZW50cyl7XG5cdFx0XHRkb20uYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50TmFtZSwgaGFuZGxlcik7XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHRkb20uYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBsb2cobWVzc2FnZSwgaXNFcnJvcil7XG5cdFx0aWYoIV9vcHRpb25zLmRlYnVnICYmICFpc0Vycm9yKXtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYod2luLmNvbnNvbGUgJiYgd2luLmNvbnNvbGUubG9nKXtcblx0XHRcdGlmKGlzRXJyb3Ipe1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdbQUJEXSAnICsgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNle1xuXHRcdFx0XHRjb25zb2xlLmxvZygnW0FCRF0gJyArIG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhciBhamF4RG93bmxvYWRzID0gW107XG5cblx0LyoqXG5cdCogTG9hZCBhbmQgZXhlY3V0ZSB0aGUgVVJMIGluc2lkZSBhIGNsb3N1cmUgZnVuY3Rpb25cblx0Ki9cblx0ZnVuY3Rpb24gbG9hZEV4ZWN1dGVVcmwodXJsKXtcblx0XHR2YXIgYWpheCwgcmVzdWx0O1xuXG5cdFx0YmxvY2tMaXN0cy5hZGRVcmwodXJsKTtcblx0XHQvLyBzZXR1cCBjYWxsIGZvciByZW1vdGUgbGlzdFxuXHRcdGFqYXggPSBuZXcgQWpheEhlbHBlcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiB1cmwsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZ1bmN0aW9uKGRhdGEpe1xuXHRcdFx0XHRcdGxvZygnZG93bmxvYWRlZCBmaWxlICcgKyB1cmwpOyAvLyB0b2RvIC0gcGFyc2UgYW5kIHN0b3JlIHVudGlsIHVzZVxuXHRcdFx0XHRcdHJlc3VsdCA9IGJsb2NrTGlzdHMuc2V0UmVzdWx0KHVybCwgJ3N1Y2Nlc3MnLCBkYXRhKTtcblx0XHRcdFx0XHR0cnl7XG5cdFx0XHRcdFx0XHR2YXIgaW50ZXJ2YWxJZCA9IDAsXG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQgPSAwO1xuXG5cdFx0XHRcdFx0XHR2YXIgdHJ5RXhlY3V0ZVRlc3QgPSBmdW5jdGlvbihsaXN0RGF0YSl7XG5cdFx0XHRcdFx0XHRcdGlmKCF0ZXN0RXhlY3V0aW5nKXtcblx0XHRcdFx0XHRcdFx0XHRiZWdpblRlc3QobGlzdERhdGEsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYoZmluZFJlc3VsdCA9PSB0cnVlKXtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZih0cnlFeGVjdXRlVGVzdChyZXN1bHQuZGF0YSkpe1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNle1xuXHRcdFx0XHRcdFx0XHRsb2coJ1BhdXNlIGJlZm9yZSB0ZXN0IGV4ZWN1dGlvbicpO1xuXHRcdFx0XHRcdFx0XHRpbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRcdFx0XHRpZih0cnlFeGVjdXRlVGVzdChyZXN1bHQuZGF0YSkgfHwgcmV0cnlDb3VudCsrID4gNSl7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbGVhckludGVydmFsKGludGVydmFsSWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSwgMjUwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRcdFx0bG9nKGV4Lm1lc3NhZ2UgKyAnIHVybDogJyArIHVybCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmYWlsOiBmdW5jdGlvbihzdGF0dXMpe1xuXHRcdFx0XHRcdGxvZyhzdGF0dXMsIHRydWUpO1xuXHRcdFx0XHRcdGJsb2NrTGlzdHMuc2V0UmVzdWx0KHVybCwgJ2Vycm9yJywgbnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0YWpheERvd25sb2Fkcy5wdXNoKGFqYXgpO1xuXHR9XG5cblxuXHQvKipcblx0KiBGZXRjaCB0aGUgZXh0ZXJuYWwgbGlzdHMgYW5kIGluaXRpYXRlIHRoZSB0ZXN0c1xuXHQqL1xuXHRmdW5jdGlvbiBmZXRjaFJlbW90ZUxpc3RzKCl7XG5cdFx0dmFyIGksIHVybDtcblx0XHR2YXIgb3B0cyA9IF9vcHRpb25zO1xuXG5cdFx0Zm9yKGk9MDtpPG9wdHMuYmxvY2tMaXN0cy5sZW5ndGg7aSsrKXtcblx0XHRcdHVybCA9IG9wdHMuYmxvY2tMaXN0c1tpXTtcblx0XHRcdGxvYWRFeGVjdXRlVXJsKHVybCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY2FuY2VsUmVtb3RlRG93bmxvYWRzKCl7XG5cdFx0dmFyIGksIGFqO1xuXG5cdFx0Zm9yKGk9YWpheERvd25sb2Fkcy5sZW5ndGgtMTtpID49IDA7aS0tKXtcblx0XHRcdGFqID0gYWpheERvd25sb2Fkcy5wb3AoKTtcblx0XHRcdGFqLmFib3J0KCk7XG5cdFx0fVxuXHR9XG5cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvKipcblx0KiBCZWdpbiBleGVjdXRpb24gb2YgdGhlIHRlc3Rcblx0Ki9cblx0ZnVuY3Rpb24gYmVnaW5UZXN0KGJhaXQpe1xuXHRcdGxvZygnc3RhcnQgYmVnaW5UZXN0Jyk7XG5cdFx0aWYoZmluZFJlc3VsdCA9PSB0cnVlKXtcblx0XHRcdHJldHVybjsgLy8gd2UgZm91bmQgaXQuIGRvbid0IGNvbnRpbnVlIGV4ZWN1dGluZ1xuXHRcdH1cblx0XHR0ZXN0RXhlY3V0aW5nID0gdHJ1ZTtcblx0XHRjYXN0QmFpdChiYWl0KTtcblxuXHRcdGV4ZVJlc3VsdC5xdWljayA9ICd0ZXN0aW5nJztcblxuXHRcdHRpbWVySWRzLnRlc3QgPSBzZXRUaW1lb3V0KFxuXHRcdFx0ZnVuY3Rpb24oKXsgcmVlbEluKGJhaXQsIDEpOyB9LFxuXHRcdFx0NSk7XG5cdH1cblxuXHQvKipcblx0KiBDcmVhdGUgdGhlIGJhaXQgbm9kZSB0byBzZWUgaG93IHRoZSBicm93c2VyIHBhZ2UgcmVhY3RzXG5cdCovXG5cdGZ1bmN0aW9uIGNhc3RCYWl0KGJhaXQpe1xuXHRcdHZhciBpLCBkID0gZG9jdW1lbnQsIGIgPSBkLmJvZHk7XG5cdFx0dmFyIHQ7XG5cdFx0dmFyIGJhaXRTdHlsZSA9ICd3aWR0aDogMXB4ICFpbXBvcnRhbnQ7IGhlaWdodDogMXB4ICFpbXBvcnRhbnQ7IHBvc2l0aW9uOiBhYnNvbHV0ZSAhaW1wb3J0YW50OyBsZWZ0OiAtMTAwMDBweCAhaW1wb3J0YW50OyB0b3A6IC0xMDAwcHggIWltcG9ydGFudDsnXG5cblx0XHRpZihiYWl0ID09IG51bGwgfHwgdHlwZW9mKGJhaXQpID09ICdzdHJpbmcnKXtcblx0XHRcdGxvZygnaW52YWxpZCBiYWl0IGJlaW5nIGNhc3QnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZihiYWl0LnN0eWxlICE9IG51bGwpe1xuXHRcdFx0YmFpdFN0eWxlICs9IGJhaXQuc3R5bGU7XG5cdFx0fVxuXG5cdFx0YmFpdE5vZGUgPSBtYWtlRWwoJ2RpdicsIHtcblx0XHRcdCdjbGFzcyc6IGJhaXQuY3NzQ2xhc3MsXG5cdFx0XHQnc3R5bGUnOiBiYWl0U3R5bGVcblx0XHR9KTtcblxuXHRcdGxvZygnYWRkaW5nIGJhaXQgbm9kZSB0byBET00nKTtcblxuXHRcdGIuYXBwZW5kQ2hpbGQoYmFpdE5vZGUpO1xuXG5cdFx0Ly8gdG91Y2ggdGhlc2UgcHJvcGVydGllc1xuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMubnVsbFByb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0dCA9IGJhaXROb2RlW2JhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV1dO1xuXHRcdH1cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLnplcm9Qcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdHQgPSBiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMuemVyb1Byb3BzW2ldXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBSdW4gdGVzdHMgdG8gc2VlIGlmIGJyb3dzZXIgaGFzIHRha2VuIHRoZSBiYWl0IGFuZCBibG9ja2VkIHRoZSBiYWl0IGVsZW1lbnRcblx0Ki9cblx0ZnVuY3Rpb24gcmVlbEluKGJhaXQsIGF0dGVtcHROdW0pe1xuXHRcdHZhciBpLCBrLCB2O1xuXHRcdHZhciBib2R5ID0gZG9jdW1lbnQuYm9keTtcblx0XHR2YXIgZm91bmQgPSBmYWxzZTtcblxuXHRcdGlmKGJhaXROb2RlID09IG51bGwpe1xuXHRcdFx0bG9nKCdyZWNhc3QgYmFpdCcpO1xuXHRcdFx0Y2FzdEJhaXQoYmFpdCB8fCBxdWlja0JhaXQpO1xuXHRcdH1cblxuXHRcdGlmKHR5cGVvZihiYWl0KSA9PSAnc3RyaW5nJyl7XG5cdFx0XHRsb2coJ2ludmFsaWQgYmFpdCB1c2VkJywgdHJ1ZSk7XG5cdFx0XHRpZihjbGVhckJhaXROb2RlKCkpe1xuXHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0dGVzdEV4ZWN1dGluZyA9IGZhbHNlO1xuXHRcdFx0XHR9LCA1KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmKHRpbWVySWRzLnRlc3QgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy50ZXN0KTtcblx0XHRcdHRpbWVySWRzLnRlc3QgPSAwO1xuXHRcdH1cblxuXHRcdC8vIHRlc3QgZm9yIGlzc3Vlc1xuXG5cdFx0aWYoYm9keS5nZXRBdHRyaWJ1dGUoJ2FicCcpICE9PSBudWxsKXtcblx0XHRcdGxvZygnZm91bmQgYWRibG9jayBib2R5IGF0dHJpYnV0ZScpO1xuXHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMubnVsbFByb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0aWYoYmFpdE5vZGVbYmFpdFRyaWdnZXJzLm51bGxQcm9wc1tpXV0gPT0gbnVsbCl7XG5cdFx0XHRcdGlmKGF0dGVtcHROdW0+NClcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgbnVsbCBhdHRyOiAnICsgYmFpdFRyaWdnZXJzLm51bGxQcm9wc1tpXSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYoZm91bmQgPT0gdHJ1ZSl7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMuemVyb1Byb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0aWYoZm91bmQgPT0gdHJ1ZSl7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYoYmFpdE5vZGVbYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXV0gPT0gMCl7XG5cdFx0XHRcdGlmKGF0dGVtcHROdW0+NClcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgemVybyBhdHRyOiAnICsgYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYod2luZG93LmdldENvbXB1dGVkU3R5bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFyIGJhaXRUZW1wID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoYmFpdE5vZGUsIG51bGwpO1xuXHRcdFx0aWYoYmFpdFRlbXAuZ2V0UHJvcGVydHlWYWx1ZSgnZGlzcGxheScpID09ICdub25lJ1xuXHRcdFx0fHwgYmFpdFRlbXAuZ2V0UHJvcGVydHlWYWx1ZSgndmlzaWJpbGl0eScpID09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdGlmKGF0dGVtcHROdW0+NClcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgY29tcHV0ZWRTdHlsZSBpbmRpY2F0b3InKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0ZWRPbmNlID0gdHJ1ZTtcblxuXHRcdGlmKGZvdW5kIHx8IGF0dGVtcHROdW0rKyA+PSBfb3B0aW9ucy5tYXhMb29wKXtcblx0XHRcdGZpbmRSZXN1bHQgPSBmb3VuZDtcblx0XHRcdGxvZygnZXhpdGluZyB0ZXN0IGxvb3AgLSB2YWx1ZTogJyArIGZpbmRSZXN1bHQpO1xuXHRcdFx0bm90aWZ5TGlzdGVuZXJzKCk7XG5cdFx0XHRpZihjbGVhckJhaXROb2RlKCkpe1xuXHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0dGVzdEV4ZWN1dGluZyA9IGZhbHNlO1xuXHRcdFx0XHR9LCA1KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZXtcblx0XHRcdHRpbWVySWRzLnRlc3QgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdHJlZWxJbihiYWl0LCBhdHRlbXB0TnVtKTtcblx0XHRcdH0sIF9vcHRpb25zLmxvb3BEZWxheSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY2xlYXJCYWl0Tm9kZSgpe1xuXHRcdGlmKGJhaXROb2RlID09PSBudWxsKXtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRyeXtcblx0XHRcdGlmKGlzRnVuYyhiYWl0Tm9kZS5yZW1vdmUpKXtcblx0XHRcdFx0YmFpdE5vZGUucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0XHRkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGJhaXROb2RlKTtcblx0XHR9XG5cdFx0Y2F0Y2goZXgpe1xuXHRcdH1cblx0XHRiYWl0Tm9kZSA9IG51bGw7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQqIEhhbHQgdGhlIHRlc3QgYW5kIGFueSBwZW5kaW5nIHRpbWVvdXRzXG5cdCovXG5cdGZ1bmN0aW9uIHN0b3BGaXNoaW5nKCl7XG5cdFx0aWYodGltZXJJZHMudGVzdCA+IDApe1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVySWRzLnRlc3QpO1xuXHRcdH1cblx0XHRpZih0aW1lcklkcy5kb3dubG9hZCA+IDApe1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVySWRzLmRvd25sb2FkKTtcblx0XHR9XG5cblx0XHRjYW5jZWxSZW1vdGVEb3dubG9hZHMoKTtcblxuXHRcdGNsZWFyQmFpdE5vZGUoKTtcblx0fVxuXG5cdC8qKlxuXHQqIEZpcmUgYWxsIHJlZ2lzdGVyZWQgbGlzdGVuZXJzXG5cdCovXG5cdGZ1bmN0aW9uIG5vdGlmeUxpc3RlbmVycygpe1xuXHRcdHZhciBpLCBmdW5jcztcblx0XHRpZihmaW5kUmVzdWx0ID09PSBudWxsKXtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yKGk9MDtpPGxpc3RlbmVycy5sZW5ndGg7aSsrKXtcblx0XHRcdGZ1bmNzID0gbGlzdGVuZXJzW2ldO1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHRpZihmdW5jcyAhPSBudWxsKXtcblx0XHRcdFx0XHRpZihpc0Z1bmMoZnVuY3NbJ2NvbXBsZXRlJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydjb21wbGV0ZSddKGZpbmRSZXN1bHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmKGZpbmRSZXN1bHQgJiYgaXNGdW5jKGZ1bmNzWydmb3VuZCddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snZm91bmQnXSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIGlmKGZpbmRSZXN1bHQgPT09IGZhbHNlICYmIGlzRnVuYyhmdW5jc1snbm90Zm91bmQnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ25vdGZvdW5kJ10oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0bG9nKCdGYWlsdXJlIGluIG5vdGlmeSBsaXN0ZW5lcnMgJyArIGV4Lk1lc3NhZ2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQqIEF0dGFjaGVzIGV2ZW50IGxpc3RlbmVyIG9yIGZpcmVzIGlmIGV2ZW50cyBoYXZlIGFscmVhZHkgcGFzc2VkLlxuXHQqL1xuXHRmdW5jdGlvbiBhdHRhY2hPckZpcmUoKXtcblx0XHR2YXIgZmlyZU5vdyA9IGZhbHNlO1xuXHRcdHZhciBmbjtcblxuXHRcdGlmKGRvY3VtZW50LnJlYWR5U3RhdGUpe1xuXHRcdFx0aWYoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PSAnY29tcGxldGUnKXtcblx0XHRcdFx0ZmlyZU5vdyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm4gPSBmdW5jdGlvbigpe1xuXHRcdFx0YmVnaW5UZXN0KHF1aWNrQmFpdCwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdGlmKGZpcmVOb3cpe1xuXHRcdFx0Zm4oKTtcblx0XHR9XG5cdFx0ZWxzZXtcblx0XHRcdGF0dGFjaEV2ZW50TGlzdGVuZXIod2luLCAnbG9hZCcsIGZuKTtcblx0XHR9XG5cdH1cblxuXG5cdHZhciBibG9ja0xpc3RzOyAvLyB0cmFja3MgZXh0ZXJuYWwgYmxvY2sgbGlzdHNcblxuXHQvKipcblx0KiBQdWJsaWMgaW50ZXJmYWNlIG9mIGFkYmxvY2sgZGV0ZWN0b3Jcblx0Ki9cblx0dmFyIGltcGwgPSB7XG5cdFx0LyoqXG5cdFx0KiBWZXJzaW9uIG9mIHRoZSBhZGJsb2NrIGRldGVjdG9yIHBhY2thZ2Vcblx0XHQqL1xuXHRcdHZlcnNpb246IHZlcnNpb24sXG5cblx0XHQvKipcblx0XHQqIEluaXRpYWxpemF0aW9uIGZ1bmN0aW9uLiBTZWUgY29tbWVudHMgYXQgdG9wIGZvciBvcHRpb25zIG9iamVjdFxuXHRcdCovXG5cdFx0aW5pdDogZnVuY3Rpb24ob3B0aW9ucyl7XG5cdFx0XHR2YXIgaywgdiwgZnVuY3M7XG5cblx0XHRcdGlmKCFvcHRpb25zKXtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jcyA9IHtcblx0XHRcdFx0Y29tcGxldGU6IG5vb3AsXG5cdFx0XHRcdGZvdW5kOiBub29wLFxuXHRcdFx0XHRub3Rmb3VuZDogbm9vcFxuXHRcdFx0fTtcblxuXHRcdFx0Zm9yKGsgaW4gb3B0aW9ucyl7XG5cdFx0XHRcdGlmKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaykpe1xuXHRcdFx0XHRcdGlmKGsgPT0gJ2NvbXBsZXRlJyB8fCBrID09ICdmb3VuZCcgfHwgayA9PSAnbm90Rm91bmQnKXtcblx0XHRcdFx0XHRcdGZ1bmNzW2sudG9Mb3dlckNhc2UoKV0gPSBvcHRpb25zW2tdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNle1xuXHRcdFx0XHRcdFx0X29wdGlvbnNba10gPSBvcHRpb25zW2tdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsaXN0ZW5lcnMucHVzaChmdW5jcyk7XG5cblx0XHRcdGJsb2NrTGlzdHMgPSBuZXcgQmxvY2tMaXN0VHJhY2tlcigpO1xuXG5cdFx0XHRhdHRhY2hPckZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHR3aW5bJ2FkYmxvY2tEZXRlY3RvciddID0gaW1wbDtcblxufSkod2luZG93KVxuIiwiLyohXG4gKiBAcHJlc2VydmVcbiAqIGpxdWVyeS5zY3JvbGxkZXB0aC5qcyB8IHYxLjIuMFxuICogQ29weXJpZ2h0IChjKSAyMDIwIFJvYiBGbGFoZXJ0eSAoQHJvYmZsYWhlcnR5KVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBhbmQgR1BMIGxpY2Vuc2VzLlxuICovXG4hZnVuY3Rpb24oZSl7XCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kP2RlZmluZShbXCJqcXVlcnlcIl0sZSk6XCJvYmplY3RcIj09dHlwZW9mIG1vZHVsZSYmbW9kdWxlLmV4cG9ydHM/bW9kdWxlLmV4cG9ydHM9ZShyZXF1aXJlKFwianF1ZXJ5XCIpKTplKGpRdWVyeSl9KGZ1bmN0aW9uKGYpe1widXNlIHN0cmljdFwiO3ZhciBpLGEsYyxwLGcsZT17bWluSGVpZ2h0OjAsZWxlbWVudHM6W10scGVyY2VudGFnZTohMCx1c2VyVGltaW5nOiEwLHBpeGVsRGVwdGg6ITAsbm9uSW50ZXJhY3Rpb246ITAsZ2FHbG9iYWw6ITEsZ3RtT3ZlcnJpZGU6ITEsdHJhY2tlck5hbWU6ITEsZGF0YUxheWVyOlwiZGF0YUxheWVyXCJ9LG09Zih3aW5kb3cpLGQ9W10sRD0hMSxoPTA7cmV0dXJuIGYuc2Nyb2xsRGVwdGg9ZnVuY3Rpb24odSl7dmFyIHM9K25ldyBEYXRlO2Z1bmN0aW9uIHYoZSxuLHQsbyl7dmFyIHI9dS50cmFja2VyTmFtZT91LnRyYWNrZXJOYW1lK1wiLnNlbmRcIjpcInNlbmRcIjtnPyhnKHtldmVudDpcIlNjcm9sbERpc3RhbmNlXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOmUsZXZlbnRMYWJlbDpuLGV2ZW50VmFsdWU6MSxldmVudE5vbkludGVyYWN0aW9uOnUubm9uSW50ZXJhY3Rpb259KSx1LnBpeGVsRGVwdGgmJjI8YXJndW1lbnRzLmxlbmd0aCYmaDx0JiZnKHtldmVudDpcIlNjcm9sbERpc3RhbmNlXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOlwiUGl4ZWwgRGVwdGhcIixldmVudExhYmVsOmwoaD10KSxldmVudFZhbHVlOjEsZXZlbnROb25JbnRlcmFjdGlvbjp1Lm5vbkludGVyYWN0aW9ufSksdS51c2VyVGltaW5nJiYzPGFyZ3VtZW50cy5sZW5ndGgmJmcoe2V2ZW50OlwiU2Nyb2xsVGltaW5nXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOmUsZXZlbnRMYWJlbDpuLGV2ZW50VGltaW5nOm99KSk6cD8oZ3RhZyhcImV2ZW50XCIsZSx7ZXZlbnRfY2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudF9sYWJlbDpuLHZhbHVlOjEsbm9uX2ludGVyYWN0aW9uOnUubm9uSW50ZXJhY3Rpb259KSx1LnBpeGVsRGVwdGgmJjI8YXJndW1lbnRzLmxlbmd0aCYmaDx0JiYoaD10LGd0YWcoXCJldmVudFwiLFwiUGl4ZWwgRGVwdGhcIix7ZXZlbnRfY2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudF9sYWJlbDpsKHQpLHZhbHVlOjEsbm9uX2ludGVyYWN0aW9uOnUubm9uSW50ZXJhY3Rpb259KSksdS51c2VyVGltaW5nJiYzPGFyZ3VtZW50cy5sZW5ndGgmJmd0YWcoXCJldmVudFwiLFwidGltaW5nX2NvbXBsZXRlXCIse2V2ZW50X2NhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsbmFtZTplLGV2ZW50X2xhYmVsOm4sdmFsdWU6b30pKTooaSYmKHdpbmRvd1tjXShyLFwiZXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLGUsbiwxLHtub25JbnRlcmFjdGlvbjp1Lm5vbkludGVyYWN0aW9ufSksdS5waXhlbERlcHRoJiYyPGFyZ3VtZW50cy5sZW5ndGgmJmg8dCYmKGg9dCx3aW5kb3dbY10ocixcImV2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixcIlBpeGVsIERlcHRoXCIsbCh0KSwxLHtub25JbnRlcmFjdGlvbjp1Lm5vbkludGVyYWN0aW9ufSkpLHUudXNlclRpbWluZyYmMzxhcmd1bWVudHMubGVuZ3RoJiZ3aW5kb3dbY10ocixcInRpbWluZ1wiLFwiU2Nyb2xsIERlcHRoXCIsZSxvLG4pKSxhJiYoX2dhcS5wdXNoKFtcIl90cmFja0V2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixlLG4sMSx1Lm5vbkludGVyYWN0aW9uXSksdS5waXhlbERlcHRoJiYyPGFyZ3VtZW50cy5sZW5ndGgmJmg8dCYmKGg9dCxfZ2FxLnB1c2goW1wiX3RyYWNrRXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLFwiUGl4ZWwgRGVwdGhcIixsKHQpLDEsdS5ub25JbnRlcmFjdGlvbl0pKSx1LnVzZXJUaW1pbmcmJjM8YXJndW1lbnRzLmxlbmd0aCYmX2dhcS5wdXNoKFtcIl90cmFja1RpbWluZ1wiLFwiU2Nyb2xsIERlcHRoXCIsZSxvLG4sMTAwXSkpKX1mdW5jdGlvbiBsKGUpe3JldHVybigyNTAqTWF0aC5mbG9vcihlLzI1MCkpLnRvU3RyaW5nKCl9ZnVuY3Rpb24gbigpe2Z1bmN0aW9uIHQoKXtwPW5ldyBEYXRlLGM9bnVsbCxhPW8uYXBwbHkobCxpKX12YXIgbyxyLGwsaSxhLGMscDtEPSEwLG0ub24oXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIiwobz1mdW5jdGlvbigpe3ZhciBlLG4sdCxvLHIsbCxpLGE9Zihkb2N1bWVudCkuaGVpZ2h0KCksYz13aW5kb3cuaW5uZXJIZWlnaHQ/d2luZG93LmlubmVySGVpZ2h0Om0uaGVpZ2h0KCkscD1tLnNjcm9sbFRvcCgpK2MsZz0oZT1hLHtcIjI1JVwiOnBhcnNlSW50KC4yNSplLDEwKSxcIjUwJVwiOnBhcnNlSW50KC41KmUsMTApLFwiNzUlXCI6cGFyc2VJbnQoLjc1KmUsMTApLFwiMTAwJVwiOmUtNX0pLGg9bmV3IERhdGUtcztpZihkLmxlbmd0aD49dS5lbGVtZW50cy5sZW5ndGgrKHUucGVyY2VudGFnZT80OjApKXJldHVybiBtLm9mZihcInNjcm9sbC5zY3JvbGxEZXB0aFwiKSx2b2lkKEQ9ITEpO3UuZWxlbWVudHMmJihuPXUuZWxlbWVudHMsdD1wLG89aCxmLmVhY2gobixmdW5jdGlvbihlLG4pey0xPT09Zi5pbkFycmF5KG4sZCkmJmYobikubGVuZ3RoJiZ0Pj1mKG4pLm9mZnNldCgpLnRvcCYmKHYoXCJFbGVtZW50c1wiLG4sdCxvKSxkLnB1c2gobikpfSkpLHUucGVyY2VudGFnZSYmKHI9ZyxsPXAsaT1oLGYuZWFjaChyLGZ1bmN0aW9uKGUsbil7LTE9PT1mLmluQXJyYXkoZSxkKSYmbjw9bCYmKHYoXCJQZXJjZW50YWdlXCIsZSxsLGkpLGQucHVzaChlKSl9KSl9LHI9NTAwLGM9bnVsbCxwPTAsZnVuY3Rpb24oKXt2YXIgZT1uZXcgRGF0ZSxuPXItKGUtKHA9cHx8ZSkpO3JldHVybiBsPXRoaXMsaT1hcmd1bWVudHMsbjw9MD8oY2xlYXJUaW1lb3V0KGMpLGM9bnVsbCxwPWUsYT1vLmFwcGx5KGwsaSkpOmM9Y3x8c2V0VGltZW91dCh0LG4pLGF9KSl9dT1mLmV4dGVuZCh7fSxlLHUpLGYoZG9jdW1lbnQpLmhlaWdodCgpPHUubWluSGVpZ2h0fHwodS5nYUdsb2JhbD8oaT0hMCxjPXUuZ2FHbG9iYWwpOlwiZnVuY3Rpb25cIj09dHlwZW9mIGd0YWc/KHA9ITAsYz1cImd0YWdcIik6XCJmdW5jdGlvblwiPT10eXBlb2YgZ2E/KGk9ITAsYz1cImdhXCIpOlwiZnVuY3Rpb25cIj09dHlwZW9mIF9fZ2FUcmFja2VyJiYoaT0hMCxjPVwiX19nYVRyYWNrZXJcIiksXCJ1bmRlZmluZWRcIiE9dHlwZW9mIF9nYXEmJlwiZnVuY3Rpb25cIj09dHlwZW9mIF9nYXEucHVzaCYmKGE9ITApLFwiZnVuY3Rpb25cIj09dHlwZW9mIHUuZXZlbnRIYW5kbGVyP2c9dS5ldmVudEhhbmRsZXI6dm9pZCAwPT09d2luZG93W3UuZGF0YUxheWVyXXx8XCJmdW5jdGlvblwiIT10eXBlb2Ygd2luZG93W3UuZGF0YUxheWVyXS5wdXNofHx1Lmd0bU92ZXJyaWRlfHwoZz1mdW5jdGlvbihlKXt3aW5kb3dbdS5kYXRhTGF5ZXJdLnB1c2goZSl9KSxmLnNjcm9sbERlcHRoLnJlc2V0PWZ1bmN0aW9uKCl7ZD1bXSxoPTAsbS5vZmYoXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIiksbigpfSxmLnNjcm9sbERlcHRoLmFkZEVsZW1lbnRzPWZ1bmN0aW9uKGUpe3ZvaWQgMCE9PWUmJmYuaXNBcnJheShlKSYmKGYubWVyZ2UodS5lbGVtZW50cyxlKSxEfHxuKCkpfSxmLnNjcm9sbERlcHRoLnJlbW92ZUVsZW1lbnRzPWZ1bmN0aW9uKGUpe3ZvaWQgMCE9PWUmJmYuaXNBcnJheShlKSYmZi5lYWNoKGUsZnVuY3Rpb24oZSxuKXt2YXIgdD1mLmluQXJyYXkobix1LmVsZW1lbnRzKSxvPWYuaW5BcnJheShuLGQpOy0xIT10JiZ1LmVsZW1lbnRzLnNwbGljZSh0LDEpLC0xIT1vJiZkLnNwbGljZShvLDEpfSl9LG4oKSl9LGYuc2Nyb2xsRGVwdGh9KTsiLCIoIGZ1bmN0aW9uKCAkICkge1xuXG5cdC8qXG5cdCAqIENyZWF0ZSBhIEdvb2dsZSBBbmFseXRpY3MgZXZlbnRcblx0ICogY2F0ZWdvcnk6IEV2ZW50IENhdGVnb3J5XG5cdCAqIGxhYmVsOiBFdmVudCBMYWJlbFxuXHQgKiBhY3Rpb246IEV2ZW50IEFjdGlvblxuXHQgKiB2YWx1ZTogb3B0aW9uYWxcblx0Ki9cblx0ZnVuY3Rpb24gd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUsIG5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHRpZiAoIHR5cGVvZiBndGFnICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdC8vIFNlbmRzIHRoZSBldmVudCB0byB0aGUgR29vZ2xlIEFuYWx5dGljcyBwcm9wZXJ0eSB3aXRoXG5cdFx0XHQvLyB0cmFja2luZyBJRCBHQV9NRUFTVVJFTUVOVF9JRCBzZXQgYnkgdGhlIGNvbmZpZyBjb21tYW5kIGluXG5cdFx0XHQvLyB0aGUgZ2xvYmFsIHRyYWNraW5nIHNuaXBwZXQuXG5cdFx0XHQvLyBleGFtcGxlOiBndGFnKCdldmVudCcsICdwbGF5JywgeyAnZXZlbnRfY2F0ZWdvcnknOiAnVmlkZW9zJywgJ2V2ZW50X2xhYmVsJzogJ0ZhbGwgQ2FtcGFpZ24nIH0pO1xuXHRcdFx0dmFyIHBhcmFtcyA9IHtcblx0XHRcdFx0J2V2ZW50X2NhdGVnb3J5JzogY2F0ZWdvcnksXG5cdFx0XHRcdCdldmVudF9sYWJlbCc6IGxhYmVsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKCB0eXBlb2YgdmFsdWUgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRwYXJhbXMudmFsdWUgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICggdHlwZW9mIG5vbl9pbnRlcmFjdGlvbiAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdHBhcmFtcy5ub25faW50ZXJhY3Rpb24gPSBub25faW50ZXJhY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRndGFnKCB0eXBlLCBhY3Rpb24sIHBhcmFtcyApO1xuXHRcdH0gZWxzZSBpZiAoIHR5cGVvZiBnYSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHQvLyBVc2VzIHRoZSBkZWZhdWx0IHRyYWNrZXIgdG8gc2VuZCB0aGUgZXZlbnQgdG8gdGhlXG5cdFx0XHQvLyBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGggdHJhY2tpbmcgSUQgR0FfTUVBU1VSRU1FTlRfSUQuXG5cdFx0XHQvLyBleGFtcGxlOiBnYSgnc2VuZCcsICdldmVudCcsICdWaWRlb3MnLCAncGxheScsICdGYWxsIENhbXBhaWduJyk7XG5cdFx0XHQvLyBub25pbnRlcmFjdGlvbiBzZWVtcyB0byBoYXZlIGJlZW4gd29ya2luZyBsaWtlIHRoaXMgaW4gYW5hbHl0aWNzLmpzLlxuXHRcdFx0aWYgKCBub25faW50ZXJhY3Rpb24gPT0gMSApIHtcblx0XHRcdFx0bGFiZWwgPSB7ICdub25JbnRlcmFjdGlvbic6IDEgfTtcblx0XHRcdH1cblx0XHRcdGlmICggdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gd3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwKCkge1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiBndGFnICYmICd1bmRlZmluZWQnID09PSB0eXBlb2YgZ2EgKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZhciBzY3JvbGxEZXB0aFNldHRpbmdzID0gW107XG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyApIHtcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwuZW5hYmxlZCApIHtcblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIHN0cmluZyBhbmQgYSBib29sZWFuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgJiYgJ2d0YWdqcycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hbmFseXRpY3NfdHlwZSApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydndG1PdmVycmlkZSddID0gdHJ1ZTtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydnYUdsb2JhbCddID0gJ2dhJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgc3RyaW5nXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm1pbmltdW1faGVpZ2h0ICYmICcwJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydtaW5pbXVtX2hlaWdodCddID0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3BlcmNlbnRhZ2UnXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWyd1c2VyX3RpbWluZyddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwucGl4ZWxfZGVwdGggJiYgJ3RydWUnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nICkge1xuXHRcdFx0XHRcdHNjcm9sbERlcHRoU2V0dGluZ3NbJ3BpeGVsX2RlcHRoJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gJiYgJ3RydWUnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLm5vbl9pbnRlcmFjdGlvbiApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydub25faW50ZXJhY3Rpb24nXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYW4gYXJyYXkuIGRlZmF1bHQgaXMgZW1wdHkuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cyApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydlbGVtZW50cyddID0gJC5tYXAoIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwuc2Nyb2xsX2VsZW1lbnRzLnNwbGl0KCAnLCcgKSwgJC50cmltICk7XG5cdFx0XHRcdH1cblx0XHRcdFx0XG5cdFx0XHRcdC8vIHNlbmQgc2Nyb2xsIHNldHRpbmdzIHRvIHRoZSBzY3JvbGxkZXB0aCBwbHVnaW5cblx0XHRcdFx0alF1ZXJ5LnNjcm9sbERlcHRoKCBzY3JvbGxEZXB0aFNldHRpbmdzICk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5lbmFibGVkICkge1xuXG5cdFx0XHRcdC8vIGV4dGVybmFsIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwiaHR0cFwiXTpub3QoW2hyZWYqPVwiOi8vJyArIGRvY3VtZW50LmRvbWFpbiArICdcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ091dGJvdW5kIGxpbmtzJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIG1haWx0byBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cIm1haWx0b1wiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdNYWlscycsICdDbGljaycsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyB0ZWwgbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJ0ZWxcIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnVGVsZXBob25lJywgJ0NhbGwnLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gaW50ZXJuYWwgbGlua3Ncblx0XHRcdFx0JCggJ2E6bm90KFtocmVmXj1cIihodHRwOnxodHRwczopPy8vXCJdLFtocmVmXj1cIiNcIl0sW2hyZWZePVwibWFpbHRvOlwiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdFx0Ly8gdHJhY2sgZG93bmxvYWRzXG5cdFx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKSB7XG5cdFx0XHRcdFx0XHR2YXIgdXJsID0gdGhpcy5ocmVmO1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWQgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHRcdHZhciBpc0Rvd25sb2FkID0gY2hlY2tEb3dubG9hZC50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNEb3dubG9hZCApIHtcblx0XHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWRFeHRlbnNpb24gPSBuZXcgUmVnRXhwKFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIik7XG5cdFx0XHRcdFx0XHRcdHZhciBleHRlbnNpb25SZXN1bHQgPSBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uLmV4ZWMoIHVybCApO1xuXHRcdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uID0gJyc7XG5cdFx0XHRcdFx0XHRcdGlmICggbnVsbCAhPT0gZXh0ZW5zaW9uUmVzdWx0ICkge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdFsxXTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHQ7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Ly8gd2UgY2FuJ3QgdXNlIHRoZSB1cmwgZm9yIHRoZSB2YWx1ZSBoZXJlLCBldmVuIHRob3VnaCB0aGF0IHdvdWxkIGJlIG5pY2UsIGJlY2F1c2UgdmFsdWUgaXMgc3VwcG9zZWQgdG8gYmUgYW4gaW50ZWdlclxuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdEb3dubG9hZHMnLCBleHRlbnNpb24sIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9KTtcblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZSAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmVuYWJsZWQgKSB7XG5cdFx0XHRcdC8vIGFueSBsaW5rIGNvdWxkIGJlIGFuIGFmZmlsaWF0ZSwgaSBndWVzcz9cblx0XHRcdFx0JCggJ2EnICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdFx0Ly8gdHJhY2sgYWZmaWxpYXRlc1xuXHRcdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICkge1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrQWZmaWxpYXRlID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0XHR2YXIgaXNBZmZpbGlhdGUgPSBjaGVja0FmZmlsaWF0ZS50ZXN0KCB1cmwgKTtcblx0XHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNBZmZpbGlhdGUgKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FmZmlsaWF0ZScsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbGluayBmcmFnbWVudHMgYXMgcGFnZXZpZXdzXG5cdFx0XHQvLyBkb2VzIG5vdCB1c2UgdGhlIGV2ZW50IHRyYWNraW5nIG1ldGhvZFxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQuZW5hYmxlZCApIHtcblx0XHRcdFx0aWYgKCB0eXBlb2YgZ2EgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRcdHdpbmRvdy5vbmhhc2hjaGFuZ2UgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGdhKCAnc2VuZCcsICdwYWdldmlldycsIGxvY2F0aW9uLnBhdGhuYW1lICsgbG9jYXRpb24uc2VhcmNoICsgbG9jYXRpb24uaGFzaCApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyB3aGVuIGEgYnV0dG9uIGlzIGNsaWNrZWQsIGF0dGFjaCBpdCB0byB0aGUgZm9ybSdzIGRhdGFcblx0XHRcdCQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5vbiggJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHZhciBmb3JtID0gJCggdGhpcyApLnBhcmVudHMoICdmb3JtOmZpcnN0JyApO1xuXHRcdFx0XHQkKCBmb3JtICkuZGF0YSggJ2J1dHRvbicsIHRoaXMgKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBiYXNpYyBmb3JtIHN1Ym1pdHMuIHRyYWNrIHN1Ym1pdCBpbnN0ZWFkIG9mIGNsaWNrIGJlY2F1c2Ugb3RoZXJ3aXNlIGl0J3Mgd2VpcmQuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMuZW5hYmxlZCApIHtcblx0XHRcdFx0JCggJ2Zvcm0nICkuc3VibWl0KCBmdW5jdGlvbiggZiApIHtcblx0XHRcdFx0XHR2YXIgYnV0dG9uID0gJCggdGhpcyApLmRhdGEoICdidXR0b24nICkgfHwgJCggJ2lucHV0W3R5cGU9XCJzdWJtaXRcIl0sIGJ1dHRvblt0eXBlPVwic3VibWl0XCJdJyApLmdldCggMCApO1xuXHRcdCAgICAgICAgICAgIHZhciBjYXRlZ29yeSA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1jYXRlZ29yeScgKSB8fCAnRm9ybSc7XG5cdFx0ICAgICAgICAgICAgdmFyIGFjdGlvbiA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1hY3Rpb24nICkgfHwgJ1N1Ym1pdCc7XG5cdFx0ICAgICAgICAgICAgdmFyIGxhYmVsID0gJCggYnV0dG9uICkuZGF0YSggJ2dhLWxhYmVsJyApIHx8ICQoIGJ1dHRvbiApLnRleHQoKSB8fCBidXR0b24udmFsdWUgfHwgYnV0dG9uLm5hbWU7XG5cdFx0ICAgICAgICAgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdCAgICAgICAgfSk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5sb2coICdubyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MnICk7XG5cdFx0fVxuXHR9XG5cblx0JCggZG9jdW1lbnQgKS5yZWFkeSggZnVuY3Rpb24oKSB7XG5cdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwKCk7XG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy50cmFja19hZGJsb2NrZXIgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnRyYWNrX2FkYmxvY2tlci5lbmFibGVkICkge1xuXHRcdFx0aWYgKCB0eXBlb2Ygd2luZG93LmFkYmxvY2tEZXRlY3RvciA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT24nLCAnQWRibG9ja2VyIFN0YXR1cycsIHVuZGVmaW5lZCwgMSApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d2luZG93LmFkYmxvY2tEZXRlY3Rvci5pbml0KFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGRlYnVnOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZvdW5kOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPbicsICdBZGJsb2NrZXIgU3RhdHVzJywgdW5kZWZpbmVkLCAxICk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bm90Rm91bmQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09mZicsICdBZGJsb2NrZXIgU3RhdHVzJywgdW5kZWZpbmVkLCAxICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cbn0gKSggalF1ZXJ5ICk7XG4iXX0=
