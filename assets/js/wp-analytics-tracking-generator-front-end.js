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
      if ('undefined' !== typeof analytics_tracking_settings.scroll && true === analytics_tracking_settings.scroll.enabled) {
        scrollDepthSettings['gtmOverride'] = true; // value is a string and a boolean

        if ('undefined' !== typeof analytics_tracking_settings.analytics_type && 'gtagjs' !== analytics_tracking_settings.analytics_type) {
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFkYmxvY2tEZXRlY3Rvci5qcyIsImpxdWVyeS5zY3JvbGxkZXB0aC5taW4uanMiLCJ3cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwiZiIsImEiLCJjIiwicCIsImciLCJtaW5IZWlnaHQiLCJlbGVtZW50cyIsInBlcmNlbnRhZ2UiLCJ1c2VyVGltaW5nIiwicGl4ZWxEZXB0aCIsIm5vbkludGVyYWN0aW9uIiwiZ2FHbG9iYWwiLCJndG1PdmVycmlkZSIsInRyYWNrZXJOYW1lIiwiZGF0YUxheWVyIiwibSIsIkQiLCJoIiwic2Nyb2xsRGVwdGgiLCJ1IiwicyIsIkRhdGUiLCJuIiwibyIsInIiLCJldmVudCIsImV2ZW50Q2F0ZWdvcnkiLCJldmVudEFjdGlvbiIsImV2ZW50TGFiZWwiLCJldmVudFZhbHVlIiwiZXZlbnROb25JbnRlcmFjdGlvbiIsImFyZ3VtZW50cyIsImwiLCJldmVudFRpbWluZyIsImd0YWciLCJldmVudF9jYXRlZ29yeSIsImV2ZW50X2xhYmVsIiwidmFsdWUiLCJub25faW50ZXJhY3Rpb24iLCJuYW1lIiwiX2dhcSIsIk1hdGgiLCJmbG9vciIsInRvU3RyaW5nIiwiYXBwbHkiLCJvbiIsImhlaWdodCIsImlubmVySGVpZ2h0Iiwic2Nyb2xsVG9wIiwicGFyc2VJbnQiLCJvZmYiLCJlYWNoIiwiaW5BcnJheSIsIm9mZnNldCIsInRvcCIsImV4dGVuZCIsImdhIiwiX19nYVRyYWNrZXIiLCJldmVudEhhbmRsZXIiLCJyZXNldCIsImFkZEVsZW1lbnRzIiwiaXNBcnJheSIsIm1lcmdlIiwicmVtb3ZlRWxlbWVudHMiLCJzcGxpY2UiLCIkIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50IiwidHlwZSIsImNhdGVnb3J5IiwiYWN0aW9uIiwibGFiZWwiLCJwYXJhbXMiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAiLCJzY3JvbGxEZXB0aFNldHRpbmdzIiwiYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsImFuYWx5dGljc190eXBlIiwibWluaW11bV9oZWlnaHQiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwic2Nyb2xsX2VsZW1lbnRzIiwibWFwIiwic3BsaXQiLCJ0cmltIiwic3BlY2lhbCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJjaGVja0Rvd25sb2FkRXh0ZW5zaW9uIiwiZXh0ZW5zaW9uUmVzdWx0IiwiZXhlYyIsImV4dGVuc2lvbiIsImFmZmlsaWF0ZSIsImFmZmlsaWF0ZV9yZWdleCIsImNoZWNrQWZmaWxpYXRlIiwiaXNBZmZpbGlhdGUiLCJmcmFnbWVudCIsIm9uaGFzaGNoYW5nZSIsImxvY2F0aW9uIiwicGF0aG5hbWUiLCJzZWFyY2giLCJoYXNoIiwiZm9ybSIsInBhcmVudHMiLCJmb3JtX3N1Ym1pc3Npb25zIiwic3VibWl0IiwiYnV0dG9uIiwiZ2V0IiwidGV4dCIsInJlYWR5IiwidHJhY2tfYWRibG9ja2VyIiwiYWRibG9ja0RldGVjdG9yIiwibm90Rm91bmQiXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTs7QUFDQSxDQUFDLFVBQVNBLEdBQVQsRUFBYztBQUVkLE1BQUlDLE9BQU8sR0FBRyxLQUFkO0FBRUEsTUFBSUMsR0FBRyxHQUFHLFFBQVY7QUFBQSxNQUFvQkMsRUFBRSxHQUFHLFFBQXpCOztBQUNBLE1BQUlDLElBQUksR0FBRyxTQUFQQSxJQUFPLEdBQVUsQ0FBRSxDQUF2Qjs7QUFFQSxNQUFJQyxVQUFVLEdBQUcsS0FBakI7QUFDQSxNQUFJQyxhQUFhLEdBQUcsS0FBcEI7QUFFQSxNQUFJQyxhQUFhLEdBQUlQLEdBQUcsQ0FBQ1EsZ0JBQUosS0FBeUJDLFNBQTlDO0FBRUE7QUFDRDtBQUNBO0FBQ0E7O0FBQ0MsTUFBSUMsUUFBUSxHQUFHO0FBQ2RDLElBQUFBLFNBQVMsRUFBRSxFQURHO0FBRWRDLElBQUFBLE9BQU8sRUFBRSxDQUZLO0FBR2RDLElBQUFBLEtBQUssRUFBRSxJQUhPO0FB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RSxTQUFTMUMsMkJBQTJCLENBQUMwQyxlQUE1QixDQUE0Q3hDLE9BQWhJLEVBQTBJO0FBQ3pJLFVBQUssT0FBT25HLE1BQU0sQ0FBQzRJLGVBQWQsS0FBa0MsV0FBdkMsRUFBcUQ7QUFDcERuRCxRQUFBQSwyQkFBMkIsQ0FBRSxPQUFGLEVBQVcsU0FBWCxFQUFzQixJQUF0QixFQUE0QixrQkFBNUIsRUFBZ0QxTSxTQUFoRCxFQUEyRCxDQUEzRCxDQUEzQjtBQUNBLE9BRkQsTUFFTztBQUNOaUgsUUFBQUEsTUFBTSxDQUFDNEksZUFBUCxDQUF1Qi9ILElBQXZCLENBQ0M7QUFDQzFILFVBQUFBLEtBQUssRUFBRSxLQURSO0FBRUNDLFVBQUFBLEtBQUssRUFBRSxpQkFBVztBQUNqQnFNLFlBQUFBLDJCQUEyQixDQUFFLE9BQUYsRUFBVyxTQUFYLEVBQXNCLElBQXRCLEVBQTRCLGtCQUE1QixFQUFnRDFNLFNBQWhELEVBQTJELENBQTNELENBQTNCO0FBQ0EsV0FKRjtBQUtDOFAsVUFBQUEsUUFBUSxFQUFFLG9CQUFXO0FBQ3BCcEQsWUFBQUEsMkJBQTJCLENBQUUsT0FBRixFQUFXLFNBQVgsRUFBc0IsS0FBdEIsRUFBNkIsa0JBQTdCLEVBQWlEMU0sU0FBakQsRUFBNEQsQ0FBNUQsQ0FBM0I7QUFDQTtBQVBGLFNBREQ7QUFXQTtBQUNEO0FBQ0QsR0FuQkQ7QUFxQkEsQ0EzTUQsRUEyTUt1SSxNQTNNTCIsImZpbGUiOiJ3cC1hbmFseXRpY3MtdHJhY2tpbmctZ2VuZXJhdG9yLWZyb250LWVuZC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBBZEJsb2NrIGRldGVjdG9yXG4vL1xuLy8gQXR0ZW1wdHMgdG8gZGV0ZWN0IHRoZSBwcmVzZW5jZSBvZiBBZCBCbG9ja2VyIHNvZnR3YXJlIGFuZCBub3RpZnkgbGlzdGVuZXIgb2YgaXRzIGV4aXN0ZW5jZS5cbi8vIENvcHlyaWdodCAoYykgMjAxNyBJQUJcbi8vXG4vLyBUaGUgQlNELTMgTGljZW5zZVxuLy8gUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuLy8gMS4gUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuLy8gMi4gUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuLy8gMy4gTmVpdGhlciB0aGUgbmFtZSBvZiB0aGUgY29weXJpZ2h0IGhvbGRlciBub3IgdGhlIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuLy8gVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1IgQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUzsgTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4qIEBuYW1lIHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3JcbipcbiogSUFCIEFkYmxvY2sgZGV0ZWN0b3IuXG4qIFVzYWdlOiB3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQob3B0aW9ucyk7XG4qXG4qIE9wdGlvbnMgb2JqZWN0IHNldHRpbmdzXG4qXG4qXHRAcHJvcCBkZWJ1ZzogIGJvb2xlYW5cbiogICAgICAgICBGbGFnIHRvIGluZGljYXRlIGFkZGl0aW9uYWwgZGVidWcgb3V0cHV0IHNob3VsZCBiZSBwcmludGVkIHRvIGNvbnNvbGVcbipcbipcdEBwcm9wIGZvdW5kOiBAZnVuY3Rpb25cbiogICAgICAgICBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIGlmIGFkYmxvY2sgaXMgZGV0ZWN0ZWRcbipcbipcdEBwcm9wIG5vdGZvdW5kOiBAZnVuY3Rpb25cbiogICAgICAgICBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIGlmIGFkYmxvY2sgaXMgbm90IGRldGVjdGVkLlxuKiAgICAgICAgIE5PVEU6IHRoaXMgZnVuY3Rpb24gbWF5IGZpcmUgbXVsdGlwbGUgdGltZXMgYW5kIGdpdmUgZmFsc2UgbmVnYXRpdmVcbiogICAgICAgICByZXNwb25zZXMgZHVyaW5nIGEgdGVzdCB1bnRpbCBhZGJsb2NrIGlzIHN1Y2Nlc3NmdWxseSBkZXRlY3RlZC5cbipcbipcdEBwcm9wIGNvbXBsZXRlOiBAZnVuY3Rpb25cbiogICAgICAgICBDYWxsYmFjayBmdW5jdGlvbiB0byBmaXJlIG9uY2UgYSByb3VuZCBvZiB0ZXN0aW5nIGlzIGNvbXBsZXRlLlxuKiAgICAgICAgIFRoZSB0ZXN0IHJlc3VsdCAoYm9vbGVhbikgaXMgaW5jbHVkZWQgYXMgYSBwYXJhbWV0ZXIgdG8gY2FsbGJhY2tcbipcbiogZXhhbXBsZTogXHR3aW5kb3cuYWRibG9ja0RldGVjdG9yLmluaXQoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmb3VuZDogZnVuY3Rpb24oKXsgLi4ufSxcbiBcdFx0XHRcdFx0bm90Rm91bmQ6IGZ1bmN0aW9uKCl7Li4ufVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuKlxuKlxuKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG4oZnVuY3Rpb24od2luKSB7XG5cblx0dmFyIHZlcnNpb24gPSAnMS4wJztcblxuXHR2YXIgb2ZzID0gJ29mZnNldCcsIGNsID0gJ2NsaWVudCc7XG5cdHZhciBub29wID0gZnVuY3Rpb24oKXt9O1xuXG5cdHZhciB0ZXN0ZWRPbmNlID0gZmFsc2U7XG5cdHZhciB0ZXN0RXhlY3V0aW5nID0gZmFsc2U7XG5cblx0dmFyIGlzT2xkSUVldmVudHMgPSAod2luLmFkZEV2ZW50TGlzdGVuZXIgPT09IHVuZGVmaW5lZCk7XG5cblx0LyoqXG5cdCogT3B0aW9ucyBzZXQgd2l0aCBkZWZhdWx0IG9wdGlvbnMgaW5pdGlhbGl6ZWRcblx0KlxuXHQqL1xuXHR2YXIgX29wdGlvbnMgPSB7XG5cdFx0bG9vcERlbGF5OiA1MCxcblx0XHRtYXhMb29wOiA1LFxuXHRcdGRlYnVnOiB0cnVlLFxuXHRcdGZvdW5kOiBub29wLCBcdFx0XHRcdFx0Ly8gZnVuY3Rpb24gdG8gZmlyZSB3aGVuIGFkYmxvY2sgZGV0ZWN0ZWRcblx0XHRub3Rmb3VuZDogbm9vcCwgXHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIGlmIGFkYmxvY2sgbm90IGRldGVjdGVkIGFmdGVyIHRlc3Rpbmdcblx0XHRjb21wbGV0ZTogbm9vcCAgXHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIGFmdGVyIHRlc3RpbmcgY29tcGxldGVzLCBwYXNzaW5nIHJlc3VsdCBhcyBwYXJhbWV0ZXJcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlQXNKc29uKGRhdGEpe1xuXHRcdHZhciByZXN1bHQsIGZuRGF0YTtcblx0XHR0cnl7XG5cdFx0XHRyZXN1bHQgPSBKU09OLnBhcnNlKGRhdGEpO1xuXHRcdH1cblx0XHRjYXRjaChleCl7XG5cdFx0XHR0cnl7XG5cdFx0XHRcdGZuRGF0YSA9IG5ldyBGdW5jdGlvbihcInJldHVybiBcIiArIGRhdGEpO1xuXHRcdFx0XHRyZXN1bHQgPSBmbkRhdGEoKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0bG9nKCdGYWlsZWQgc2Vjb25kYXJ5IEpTT04gcGFyc2UnLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCogQWpheCBoZWxwZXIgb2JqZWN0IHRvIGRvd25sb2FkIGV4dGVybmFsIHNjcmlwdHMuXG5cdCogSW5pdGlhbGl6ZSBvYmplY3Qgd2l0aCBhbiBvcHRpb25zIG9iamVjdFxuXHQqIEV4OlxuXHQgIHtcblx0XHQgIHVybCA6ICdodHRwOi8vZXhhbXBsZS5vcmcvdXJsX3RvX2Rvd25sb2FkJyxcblx0XHQgIG1ldGhvZDogJ1BPU1R8R0VUJyxcblx0XHQgIHN1Y2Nlc3M6IGNhbGxiYWNrX2Z1bmN0aW9uLFxuXHRcdCAgZmFpbDogIGNhbGxiYWNrX2Z1bmN0aW9uXG5cdCAgfVxuXHQqL1xuXHR2YXIgQWpheEhlbHBlciA9IGZ1bmN0aW9uKG9wdHMpe1xuXHRcdHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuXHRcdHRoaXMuc3VjY2VzcyA9IG9wdHMuc3VjY2VzcyB8fCBub29wO1xuXHRcdHRoaXMuZmFpbCA9IG9wdHMuZmFpbCB8fCBub29wO1xuXHRcdHZhciBtZSA9IHRoaXM7XG5cblx0XHR2YXIgbWV0aG9kID0gb3B0cy5tZXRob2QgfHwgJ2dldCc7XG5cblx0XHQvKipcblx0XHQqIEFib3J0IHRoZSByZXF1ZXN0XG5cdFx0Ki9cblx0XHR0aGlzLmFib3J0ID0gZnVuY3Rpb24oKXtcblx0XHRcdHRyeXtcblx0XHRcdFx0eGhyLmFib3J0KCk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc3RhdGVDaGFuZ2UodmFscyl7XG5cdFx0XHRpZih4aHIucmVhZHlTdGF0ZSA9PSA0KXtcblx0XHRcdFx0aWYoeGhyLnN0YXR1cyA9PSAyMDApe1xuXHRcdFx0XHRcdG1lLnN1Y2Nlc3MoeGhyLnJlc3BvbnNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNle1xuXHRcdFx0XHRcdC8vIGZhaWxlZFxuXHRcdFx0XHRcdG1lLmZhaWwoeGhyLnN0YXR1cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gc3RhdGVDaGFuZ2U7XG5cblx0XHRmdW5jdGlvbiBzdGFydCgpe1xuXHRcdFx0eGhyLm9wZW4obWV0aG9kLCBvcHRzLnVybCwgdHJ1ZSk7XG5cdFx0XHR4aHIuc2VuZCgpO1xuXHRcdH1cblxuXHRcdHN0YXJ0KCk7XG5cdH1cblxuXHQvKipcblx0KiBPYmplY3QgdHJhY2tpbmcgdGhlIHZhcmlvdXMgYmxvY2sgbGlzdHNcblx0Ki9cblx0dmFyIEJsb2NrTGlzdFRyYWNrZXIgPSBmdW5jdGlvbigpe1xuXHRcdHZhciBtZSA9IHRoaXM7XG5cdFx0dmFyIGV4dGVybmFsQmxvY2tsaXN0RGF0YSA9IHt9O1xuXG5cdFx0LyoqXG5cdFx0KiBBZGQgYSBuZXcgZXh0ZXJuYWwgVVJMIHRvIHRyYWNrXG5cdFx0Ki9cblx0XHR0aGlzLmFkZFVybCA9IGZ1bmN0aW9uKHVybCl7XG5cdFx0XHRleHRlcm5hbEJsb2NrbGlzdERhdGFbdXJsXSA9IHtcblx0XHRcdFx0dXJsOiB1cmwsXG5cdFx0XHRcdHN0YXRlOiAncGVuZGluZycsXG5cdFx0XHRcdGZvcm1hdDogbnVsbCxcblx0XHRcdFx0ZGF0YTogbnVsbCxcblx0XHRcdFx0cmVzdWx0OiBudWxsXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBleHRlcm5hbEJsb2NrbGlzdERhdGFbdXJsXTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQqIExvYWRzIGEgYmxvY2sgbGlzdCBkZWZpbml0aW9uXG5cdFx0Ki9cblx0XHR0aGlzLnNldFJlc3VsdCA9IGZ1bmN0aW9uKHVybEtleSwgc3RhdGUsIGRhdGEpe1xuXHRcdFx0dmFyIG9iaiA9IGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxLZXldO1xuXHRcdFx0aWYob2JqID09IG51bGwpe1xuXHRcdFx0XHRvYmogPSB0aGlzLmFkZFVybCh1cmxLZXkpO1xuXHRcdFx0fVxuXG5cdFx0XHRvYmouc3RhdGUgPSBzdGF0ZTtcblx0XHRcdGlmKGRhdGEgPT0gbnVsbCl7XG5cdFx0XHRcdG9iai5yZXN1bHQgPSBudWxsO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJyl7XG5cdFx0XHRcdHRyeXtcblx0XHRcdFx0XHRkYXRhID0gcGFyc2VBc0pzb24oZGF0YSk7XG5cdFx0XHRcdFx0b2JqLmZvcm1hdCA9ICdqc29uJztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdFx0b2JqLmZvcm1hdCA9ICdlYXN5bGlzdCc7XG5cdFx0XHRcdFx0Ly8gcGFyc2VFYXN5TGlzdChkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0b2JqLmRhdGEgPSBkYXRhO1xuXG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH1cblxuXHR9XG5cblx0dmFyIGxpc3RlbmVycyA9IFtdOyAvLyBldmVudCByZXNwb25zZSBsaXN0ZW5lcnNcblx0dmFyIGJhaXROb2RlID0gbnVsbDtcblx0dmFyIHF1aWNrQmFpdCA9IHtcblx0XHRjc3NDbGFzczogJ3B1Yl8zMDB4MjUwIHB1Yl8zMDB4MjUwbSBwdWJfNzI4eDkwIHRleHQtYWQgdGV4dEFkIHRleHRfYWQgdGV4dF9hZHMgdGV4dC1hZHMgdGV4dC1hZC1saW5rcydcblx0fTtcblx0dmFyIGJhaXRUcmlnZ2VycyA9IHtcblx0XHRudWxsUHJvcHM6IFtvZnMgKyAnUGFyZW50J10sXG5cdFx0emVyb1Byb3BzOiBbXVxuXHR9O1xuXG5cdGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMgPSBbXG5cdFx0b2ZzICsnSGVpZ2h0Jywgb2ZzICsnTGVmdCcsIG9mcyArJ1RvcCcsIG9mcyArJ1dpZHRoJywgb2ZzICsnSGVpZ2h0Jyxcblx0XHRjbCArICdIZWlnaHQnLCBjbCArICdXaWR0aCdcblx0XTtcblxuXHQvLyByZXN1bHQgb2JqZWN0XG5cdHZhciBleGVSZXN1bHQgPSB7XG5cdFx0cXVpY2s6IG51bGwsXG5cdFx0cmVtb3RlOiBudWxsXG5cdH07XG5cblx0dmFyIGZpbmRSZXN1bHQgPSBudWxsOyAvLyByZXN1bHQgb2YgdGVzdCBmb3IgYWQgYmxvY2tlclxuXG5cdHZhciB0aW1lcklkcyA9IHtcblx0XHR0ZXN0OiAwLFxuXHRcdGRvd25sb2FkOiAwXG5cdH07XG5cblx0ZnVuY3Rpb24gaXNGdW5jKGZuKXtcblx0XHRyZXR1cm4gdHlwZW9mKGZuKSA9PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0LyoqXG5cdCogTWFrZSBhIERPTSBlbGVtZW50XG5cdCovXG5cdGZ1bmN0aW9uIG1ha2VFbCh0YWcsIGF0dHJpYnV0ZXMpe1xuXHRcdHZhciBrLCB2LCBlbCwgYXR0ciA9IGF0dHJpYnV0ZXM7XG5cdFx0dmFyIGQgPSBkb2N1bWVudDtcblxuXHRcdGVsID0gZC5jcmVhdGVFbGVtZW50KHRhZyk7XG5cblx0XHRpZihhdHRyKXtcblx0XHRcdGZvcihrIGluIGF0dHIpe1xuXHRcdFx0XHRpZihhdHRyLmhhc093blByb3BlcnR5KGspKXtcblx0XHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoaywgYXR0cltrXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBhdHRhY2hFdmVudExpc3RlbmVyKGRvbSwgZXZlbnROYW1lLCBoYW5kbGVyKXtcblx0XHRpZihpc09sZElFZXZlbnRzKXtcblx0XHRcdGRvbS5hdHRhY2hFdmVudCgnb24nICsgZXZlbnROYW1lLCBoYW5kbGVyKTtcblx0XHR9XG5cdFx0ZWxzZXtcblx0XHRcdGRvbS5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgaGFuZGxlciwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGxvZyhtZXNzYWdlLCBpc0Vycm9yKXtcblx0XHRpZighX29wdGlvbnMuZGVidWcgJiYgIWlzRXJyb3Ipe1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZih3aW4uY29uc29sZSAmJiB3aW4uY29uc29sZS5sb2cpe1xuXHRcdFx0aWYoaXNFcnJvcil7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ1tBQkRdICcgKyBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdGVsc2V7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdbQUJEXSAnICsgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dmFyIGFqYXhEb3dubG9hZHMgPSBbXTtcblxuXHQvKipcblx0KiBMb2FkIGFuZCBleGVjdXRlIHRoZSBVUkwgaW5zaWRlIGEgY2xvc3VyZSBmdW5jdGlvblxuXHQqL1xuXHRmdW5jdGlvbiBsb2FkRXhlY3V0ZVVybCh1cmwpe1xuXHRcdHZhciBhamF4LCByZXN1bHQ7XG5cblx0XHRibG9ja0xpc3RzLmFkZFVybCh1cmwpO1xuXHRcdC8vIHNldHVwIGNhbGwgZm9yIHJlbW90ZSBsaXN0XG5cdFx0YWpheCA9IG5ldyBBamF4SGVscGVyKFxuXHRcdFx0e1xuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0c3VjY2VzczogZnVuY3Rpb24oZGF0YSl7XG5cdFx0XHRcdFx0bG9nKCdkb3dubG9hZGVkIGZpbGUgJyArIHVybCk7IC8vIHRvZG8gLSBwYXJzZSBhbmQgc3RvcmUgdW50aWwgdXNlXG5cdFx0XHRcdFx0cmVzdWx0ID0gYmxvY2tMaXN0cy5zZXRSZXN1bHQodXJsLCAnc3VjY2VzcycsIGRhdGEpO1xuXHRcdFx0XHRcdHRyeXtcblx0XHRcdFx0XHRcdHZhciBpbnRlcnZhbElkID0gMCxcblx0XHRcdFx0XHRcdFx0cmV0cnlDb3VudCA9IDA7XG5cblx0XHRcdFx0XHRcdHZhciB0cnlFeGVjdXRlVGVzdCA9IGZ1bmN0aW9uKGxpc3REYXRhKXtcblx0XHRcdFx0XHRcdFx0aWYoIXRlc3RFeGVjdXRpbmcpe1xuXHRcdFx0XHRcdFx0XHRcdGJlZ2luVGVzdChsaXN0RGF0YSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZihmaW5kUmVzdWx0ID09IHRydWUpe1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmKHRyeUV4ZWN1dGVUZXN0KHJlc3VsdC5kYXRhKSl7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0XHRcdGxvZygnUGF1c2UgYmVmb3JlIHRlc3QgZXhlY3V0aW9uJyk7XG5cdFx0XHRcdFx0XHRcdGludGVydmFsSWQgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdFx0XHRcdGlmKHRyeUV4ZWN1dGVUZXN0KHJlc3VsdC5kYXRhKSB8fCByZXRyeUNvdW50KysgPiA1KXtcblx0XHRcdFx0XHRcdFx0XHRcdGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxJZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LCAyNTApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdFx0XHRsb2coZXgubWVzc2FnZSArICcgdXJsOiAnICsgdXJsLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZhaWw6IGZ1bmN0aW9uKHN0YXR1cyl7XG5cdFx0XHRcdFx0bG9nKHN0YXR1cywgdHJ1ZSk7XG5cdFx0XHRcdFx0YmxvY2tMaXN0cy5zZXRSZXN1bHQodXJsLCAnZXJyb3InLCBudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRhamF4RG93bmxvYWRzLnB1c2goYWpheCk7XG5cdH1cblxuXG5cdC8qKlxuXHQqIEZldGNoIHRoZSBleHRlcm5hbCBsaXN0cyBhbmQgaW5pdGlhdGUgdGhlIHRlc3RzXG5cdCovXG5cdGZ1bmN0aW9uIGZldGNoUmVtb3RlTGlzdHMoKXtcblx0XHR2YXIgaSwgdXJsO1xuXHRcdHZhciBvcHRzID0gX29wdGlvbnM7XG5cblx0XHRmb3IoaT0wO2k8b3B0cy5ibG9ja0xpc3RzLmxlbmd0aDtpKyspe1xuXHRcdFx0dXJsID0gb3B0cy5ibG9ja0xpc3RzW2ldO1xuXHRcdFx0bG9hZEV4ZWN1dGVVcmwodXJsKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjYW5jZWxSZW1vdGVEb3dubG9hZHMoKXtcblx0XHR2YXIgaSwgYWo7XG5cblx0XHRmb3IoaT1hamF4RG93bmxvYWRzLmxlbmd0aC0xO2kgPj0gMDtpLS0pe1xuXHRcdFx0YWogPSBhamF4RG93bmxvYWRzLnBvcCgpO1xuXHRcdFx0YWouYWJvcnQoKTtcblx0XHR9XG5cdH1cblxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8qKlxuXHQqIEJlZ2luIGV4ZWN1dGlvbiBvZiB0aGUgdGVzdFxuXHQqL1xuXHRmdW5jdGlvbiBiZWdpblRlc3QoYmFpdCl7XG5cdFx0bG9nKCdzdGFydCBiZWdpblRlc3QnKTtcblx0XHRpZihmaW5kUmVzdWx0ID09IHRydWUpe1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBmb3VuZCBpdC4gZG9uJ3QgY29udGludWUgZXhlY3V0aW5nXG5cdFx0fVxuXHRcdHRlc3RFeGVjdXRpbmcgPSB0cnVlO1xuXHRcdGNhc3RCYWl0KGJhaXQpO1xuXG5cdFx0ZXhlUmVzdWx0LnF1aWNrID0gJ3Rlc3RpbmcnO1xuXG5cdFx0dGltZXJJZHMudGVzdCA9IHNldFRpbWVvdXQoXG5cdFx0XHRmdW5jdGlvbigpeyByZWVsSW4oYmFpdCwgMSk7IH0sXG5cdFx0XHQ1KTtcblx0fVxuXG5cdC8qKlxuXHQqIENyZWF0ZSB0aGUgYmFpdCBub2RlIHRvIHNlZSBob3cgdGhlIGJyb3dzZXIgcGFnZSByZWFjdHNcblx0Ki9cblx0ZnVuY3Rpb24gY2FzdEJhaXQoYmFpdCl7XG5cdFx0dmFyIGksIGQgPSBkb2N1bWVudCwgYiA9IGQuYm9keTtcblx0XHR2YXIgdDtcblx0XHR2YXIgYmFpdFN0eWxlID0gJ3dpZHRoOiAxcHggIWltcG9ydGFudDsgaGVpZ2h0OiAxcHggIWltcG9ydGFudDsgcG9zaXRpb246IGFic29sdXRlICFpbXBvcnRhbnQ7IGxlZnQ6IC0xMDAwMHB4ICFpbXBvcnRhbnQ7IHRvcDogLTEwMDBweCAhaW1wb3J0YW50OydcblxuXHRcdGlmKGJhaXQgPT0gbnVsbCB8fCB0eXBlb2YoYmFpdCkgPT0gJ3N0cmluZycpe1xuXHRcdFx0bG9nKCdpbnZhbGlkIGJhaXQgYmVpbmcgY2FzdCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmKGJhaXQuc3R5bGUgIT0gbnVsbCl7XG5cdFx0XHRiYWl0U3R5bGUgKz0gYmFpdC5zdHlsZTtcblx0XHR9XG5cblx0XHRiYWl0Tm9kZSA9IG1ha2VFbCgnZGl2Jywge1xuXHRcdFx0J2NsYXNzJzogYmFpdC5jc3NDbGFzcyxcblx0XHRcdCdzdHlsZSc6IGJhaXRTdHlsZVxuXHRcdH0pO1xuXG5cdFx0bG9nKCdhZGRpbmcgYmFpdCBub2RlIHRvIERPTScpO1xuXG5cdFx0Yi5hcHBlbmRDaGlsZChiYWl0Tm9kZSk7XG5cblx0XHQvLyB0b3VjaCB0aGVzZSBwcm9wZXJ0aWVzXG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy5udWxsUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHR0ID0gYmFpdE5vZGVbYmFpdFRyaWdnZXJzLm51bGxQcm9wc1tpXV07XG5cdFx0fVxuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMuemVyb1Byb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0dCA9IGJhaXROb2RlW2JhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV1dO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQqIFJ1biB0ZXN0cyB0byBzZWUgaWYgYnJvd3NlciBoYXMgdGFrZW4gdGhlIGJhaXQgYW5kIGJsb2NrZWQgdGhlIGJhaXQgZWxlbWVudFxuXHQqL1xuXHRmdW5jdGlvbiByZWVsSW4oYmFpdCwgYXR0ZW1wdE51bSl7XG5cdFx0dmFyIGksIGssIHY7XG5cdFx0dmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xuXHRcdHZhciBmb3VuZCA9IGZhbHNlO1xuXG5cdFx0aWYoYmFpdE5vZGUgPT0gbnVsbCl7XG5cdFx0XHRsb2coJ3JlY2FzdCBiYWl0Jyk7XG5cdFx0XHRjYXN0QmFpdChiYWl0IHx8IHF1aWNrQmFpdCk7XG5cdFx0fVxuXG5cdFx0aWYodHlwZW9mKGJhaXQpID09ICdzdHJpbmcnKXtcblx0XHRcdGxvZygnaW52YWxpZCBiYWl0IHVzZWQnLCB0cnVlKTtcblx0XHRcdGlmKGNsZWFyQmFpdE5vZGUoKSl7XG5cdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHR0ZXN0RXhlY3V0aW5nID0gZmFsc2U7XG5cdFx0XHRcdH0sIDUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYodGltZXJJZHMudGVzdCA+IDApe1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVySWRzLnRlc3QpO1xuXHRcdFx0dGltZXJJZHMudGVzdCA9IDA7XG5cdFx0fVxuXG5cdFx0Ly8gdGVzdCBmb3IgaXNzdWVzXG5cblx0XHRpZihib2R5LmdldEF0dHJpYnV0ZSgnYWJwJykgIT09IG51bGwpe1xuXHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIGJvZHkgYXR0cmlidXRlJyk7XG5cdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy5udWxsUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHRpZihiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldXSA9PSBudWxsKXtcblx0XHRcdFx0aWYoYXR0ZW1wdE51bT40KVxuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGxvZygnZm91bmQgYWRibG9jayBudWxsIGF0dHI6ICcgKyBiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZihmb3VuZCA9PSB0cnVlKXtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHRpZihmb3VuZCA9PSB0cnVlKXtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZihiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMuemVyb1Byb3BzW2ldXSA9PSAwKXtcblx0XHRcdFx0aWYoYXR0ZW1wdE51bT40KVxuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGxvZygnZm91bmQgYWRibG9jayB6ZXJvIGF0dHI6ICcgKyBiYWl0VHJpZ2dlcnMuemVyb1Byb3BzW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZih3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YXIgYmFpdFRlbXAgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShiYWl0Tm9kZSwgbnVsbCk7XG5cdFx0XHRpZihiYWl0VGVtcC5nZXRQcm9wZXJ0eVZhbHVlKCdkaXNwbGF5JykgPT0gJ25vbmUnXG5cdFx0XHR8fCBiYWl0VGVtcC5nZXRQcm9wZXJ0eVZhbHVlKCd2aXNpYmlsaXR5JykgPT0gJ2hpZGRlbicpIHtcblx0XHRcdFx0aWYoYXR0ZW1wdE51bT40KVxuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdGxvZygnZm91bmQgYWRibG9jayBjb21wdXRlZFN0eWxlIGluZGljYXRvcicpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3RlZE9uY2UgPSB0cnVlO1xuXG5cdFx0aWYoZm91bmQgfHwgYXR0ZW1wdE51bSsrID49IF9vcHRpb25zLm1heExvb3Ape1xuXHRcdFx0ZmluZFJlc3VsdCA9IGZvdW5kO1xuXHRcdFx0bG9nKCdleGl0aW5nIHRlc3QgbG9vcCAtIHZhbHVlOiAnICsgZmluZFJlc3VsdCk7XG5cdFx0XHRub3RpZnlMaXN0ZW5lcnMoKTtcblx0XHRcdGlmKGNsZWFyQmFpdE5vZGUoKSl7XG5cdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHR0ZXN0RXhlY3V0aW5nID0gZmFsc2U7XG5cdFx0XHRcdH0sIDUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0dGltZXJJZHMudGVzdCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcblx0XHRcdFx0cmVlbEluKGJhaXQsIGF0dGVtcHROdW0pO1xuXHRcdFx0fSwgX29wdGlvbnMubG9vcERlbGF5KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjbGVhckJhaXROb2RlKCl7XG5cdFx0aWYoYmFpdE5vZGUgPT09IG51bGwpe1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0dHJ5e1xuXHRcdFx0aWYoaXNGdW5jKGJhaXROb2RlLnJlbW92ZSkpe1xuXHRcdFx0XHRiYWl0Tm9kZS5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHRcdGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYmFpdE5vZGUpO1xuXHRcdH1cblx0XHRjYXRjaChleCl7XG5cdFx0fVxuXHRcdGJhaXROb2RlID0gbnVsbDtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCogSGFsdCB0aGUgdGVzdCBhbmQgYW55IHBlbmRpbmcgdGltZW91dHNcblx0Ki9cblx0ZnVuY3Rpb24gc3RvcEZpc2hpbmcoKXtcblx0XHRpZih0aW1lcklkcy50ZXN0ID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMudGVzdCk7XG5cdFx0fVxuXHRcdGlmKHRpbWVySWRzLmRvd25sb2FkID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMuZG93bmxvYWQpO1xuXHRcdH1cblxuXHRcdGNhbmNlbFJlbW90ZURvd25sb2FkcygpO1xuXG5cdFx0Y2xlYXJCYWl0Tm9kZSgpO1xuXHR9XG5cblx0LyoqXG5cdCogRmlyZSBhbGwgcmVnaXN0ZXJlZCBsaXN0ZW5lcnNcblx0Ki9cblx0ZnVuY3Rpb24gbm90aWZ5TGlzdGVuZXJzKCl7XG5cdFx0dmFyIGksIGZ1bmNzO1xuXHRcdGlmKGZpbmRSZXN1bHQgPT09IG51bGwpe1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IoaT0wO2k8bGlzdGVuZXJzLmxlbmd0aDtpKyspe1xuXHRcdFx0ZnVuY3MgPSBsaXN0ZW5lcnNbaV07XG5cdFx0XHR0cnl7XG5cdFx0XHRcdGlmKGZ1bmNzICE9IG51bGwpe1xuXHRcdFx0XHRcdGlmKGlzRnVuYyhmdW5jc1snY29tcGxldGUnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ2NvbXBsZXRlJ10oZmluZFJlc3VsdCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYoZmluZFJlc3VsdCAmJiBpc0Z1bmMoZnVuY3NbJ2ZvdW5kJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydmb3VuZCddKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2UgaWYoZmluZFJlc3VsdCA9PT0gZmFsc2UgJiYgaXNGdW5jKGZ1bmNzWydub3Rmb3VuZCddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snbm90Zm91bmQnXSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRsb2coJ0ZhaWx1cmUgaW4gbm90aWZ5IGxpc3RlbmVycyAnICsgZXguTWVzc2FnZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCogQXR0YWNoZXMgZXZlbnQgbGlzdGVuZXIgb3IgZmlyZXMgaWYgZXZlbnRzIGhhdmUgYWxyZWFkeSBwYXNzZWQuXG5cdCovXG5cdGZ1bmN0aW9uIGF0dGFjaE9yRmlyZSgpe1xuXHRcdHZhciBmaXJlTm93ID0gZmFsc2U7XG5cdFx0dmFyIGZuO1xuXG5cdFx0aWYoZG9jdW1lbnQucmVhZHlTdGF0ZSl7XG5cdFx0XHRpZihkb2N1bWVudC5yZWFkeVN0YXRlID09ICdjb21wbGV0ZScpe1xuXHRcdFx0XHRmaXJlTm93ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmbiA9IGZ1bmN0aW9uKCl7XG5cdFx0XHRiZWdpblRlc3QocXVpY2tCYWl0LCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0aWYoZmlyZU5vdyl7XG5cdFx0XHRmbigpO1xuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0YXR0YWNoRXZlbnRMaXN0ZW5lcih3aW4sICdsb2FkJywgZm4pO1xuXHRcdH1cblx0fVxuXG5cblx0dmFyIGJsb2NrTGlzdHM7IC8vIHRyYWNrcyBleHRlcm5hbCBibG9jayBsaXN0c1xuXG5cdC8qKlxuXHQqIFB1YmxpYyBpbnRlcmZhY2Ugb2YgYWRibG9jayBkZXRlY3RvclxuXHQqL1xuXHR2YXIgaW1wbCA9IHtcblx0XHQvKipcblx0XHQqIFZlcnNpb24gb2YgdGhlIGFkYmxvY2sgZGV0ZWN0b3IgcGFja2FnZVxuXHRcdCovXG5cdFx0dmVyc2lvbjogdmVyc2lvbixcblxuXHRcdC8qKlxuXHRcdCogSW5pdGlhbGl6YXRpb24gZnVuY3Rpb24uIFNlZSBjb21tZW50cyBhdCB0b3AgZm9yIG9wdGlvbnMgb2JqZWN0XG5cdFx0Ki9cblx0XHRpbml0OiBmdW5jdGlvbihvcHRpb25zKXtcblx0XHRcdHZhciBrLCB2LCBmdW5jcztcblxuXHRcdFx0aWYoIW9wdGlvbnMpe1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmNzID0ge1xuXHRcdFx0XHRjb21wbGV0ZTogbm9vcCxcblx0XHRcdFx0Zm91bmQ6IG5vb3AsXG5cdFx0XHRcdG5vdGZvdW5kOiBub29wXG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IoayBpbiBvcHRpb25zKXtcblx0XHRcdFx0aWYob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShrKSl7XG5cdFx0XHRcdFx0aWYoayA9PSAnY29tcGxldGUnIHx8IGsgPT0gJ2ZvdW5kJyB8fCBrID09ICdub3RGb3VuZCcpe1xuXHRcdFx0XHRcdFx0ZnVuY3Nbay50b0xvd2VyQ2FzZSgpXSA9IG9wdGlvbnNba107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0XHRfb3B0aW9uc1trXSA9IG9wdGlvbnNba107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxpc3RlbmVycy5wdXNoKGZ1bmNzKTtcblxuXHRcdFx0YmxvY2tMaXN0cyA9IG5ldyBCbG9ja0xpc3RUcmFja2VyKCk7XG5cblx0XHRcdGF0dGFjaE9yRmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHdpblsnYWRibG9ja0RldGVjdG9yJ10gPSBpbXBsO1xuXG59KSh3aW5kb3cpXG4iLCIvKiFcbiAqIEBwcmVzZXJ2ZVxuICoganF1ZXJ5LnNjcm9sbGRlcHRoLmpzIHwgdjEuMi4wXG4gKiBDb3B5cmlnaHQgKGMpIDIwMjAgUm9iIEZsYWhlcnR5IChAcm9iZmxhaGVydHkpXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGFuZCBHUEwgbGljZW5zZXMuXG4gKi9cbiFmdW5jdGlvbihlKXtcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQ/ZGVmaW5lKFtcImpxdWVyeVwiXSxlKTpcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlJiZtb2R1bGUuZXhwb3J0cz9tb2R1bGUuZXhwb3J0cz1lKHJlcXVpcmUoXCJqcXVlcnlcIikpOmUoalF1ZXJ5KX0oZnVuY3Rpb24oZil7XCJ1c2Ugc3RyaWN0XCI7dmFyIGksYSxjLHAsZyxlPXttaW5IZWlnaHQ6MCxlbGVtZW50czpbXSxwZXJjZW50YWdlOiEwLHVzZXJUaW1pbmc6ITAscGl4ZWxEZXB0aDohMCxub25JbnRlcmFjdGlvbjohMCxnYUdsb2JhbDohMSxndG1PdmVycmlkZTohMSx0cmFja2VyTmFtZTohMSxkYXRhTGF5ZXI6XCJkYXRhTGF5ZXJcIn0sbT1mKHdpbmRvdyksZD1bXSxEPSExLGg9MDtyZXR1cm4gZi5zY3JvbGxEZXB0aD1mdW5jdGlvbih1KXt2YXIgcz0rbmV3IERhdGU7ZnVuY3Rpb24gdihlLG4sdCxvKXt2YXIgcj11LnRyYWNrZXJOYW1lP3UudHJhY2tlck5hbWUrXCIuc2VuZFwiOlwic2VuZFwiO2c/KGcoe2V2ZW50OlwiU2Nyb2xsRGlzdGFuY2VcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246ZSxldmVudExhYmVsOm4sZXZlbnRWYWx1ZToxLGV2ZW50Tm9uSW50ZXJhY3Rpb246dS5ub25JbnRlcmFjdGlvbn0pLHUucGl4ZWxEZXB0aCYmMjxhcmd1bWVudHMubGVuZ3RoJiZoPHQmJmcoe2V2ZW50OlwiU2Nyb2xsRGlzdGFuY2VcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246XCJQaXhlbCBEZXB0aFwiLGV2ZW50TGFiZWw6bChoPXQpLGV2ZW50VmFsdWU6MSxldmVudE5vbkludGVyYWN0aW9uOnUubm9uSW50ZXJhY3Rpb259KSx1LnVzZXJUaW1pbmcmJjM8YXJndW1lbnRzLmxlbmd0aCYmZyh7ZXZlbnQ6XCJTY3JvbGxUaW1pbmdcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246ZSxldmVudExhYmVsOm4sZXZlbnRUaW1pbmc6b30pKTpwPyhndGFnKFwiZXZlbnRcIixlLHtldmVudF9jYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50X2xhYmVsOm4sdmFsdWU6MSxub25faW50ZXJhY3Rpb246dS5ub25JbnRlcmFjdGlvbn0pLHUucGl4ZWxEZXB0aCYmMjxhcmd1bWVudHMubGVuZ3RoJiZoPHQmJihoPXQsZ3RhZyhcImV2ZW50XCIsXCJQaXhlbCBEZXB0aFwiLHtldmVudF9jYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50X2xhYmVsOmwodCksdmFsdWU6MSxub25faW50ZXJhY3Rpb246dS5ub25JbnRlcmFjdGlvbn0pKSx1LnVzZXJUaW1pbmcmJjM8YXJndW1lbnRzLmxlbmd0aCYmZ3RhZyhcImV2ZW50XCIsXCJ0aW1pbmdfY29tcGxldGVcIix7ZXZlbnRfY2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixuYW1lOmUsZXZlbnRfbGFiZWw6bix2YWx1ZTpvfSkpOihpJiYod2luZG93W2NdKHIsXCJldmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsZSxuLDEse25vbkludGVyYWN0aW9uOnUubm9uSW50ZXJhY3Rpb259KSx1LnBpeGVsRGVwdGgmJjI8YXJndW1lbnRzLmxlbmd0aCYmaDx0JiYoaD10LHdpbmRvd1tjXShyLFwiZXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLFwiUGl4ZWwgRGVwdGhcIixsKHQpLDEse25vbkludGVyYWN0aW9uOnUubm9uSW50ZXJhY3Rpb259KSksdS51c2VyVGltaW5nJiYzPGFyZ3VtZW50cy5sZW5ndGgmJndpbmRvd1tjXShyLFwidGltaW5nXCIsXCJTY3JvbGwgRGVwdGhcIixlLG8sbikpLGEmJihfZ2FxLnB1c2goW1wiX3RyYWNrRXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLGUsbiwxLHUubm9uSW50ZXJhY3Rpb25dKSx1LnBpeGVsRGVwdGgmJjI8YXJndW1lbnRzLmxlbmd0aCYmaDx0JiYoaD10LF9nYXEucHVzaChbXCJfdHJhY2tFdmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsXCJQaXhlbCBEZXB0aFwiLGwodCksMSx1Lm5vbkludGVyYWN0aW9uXSkpLHUudXNlclRpbWluZyYmMzxhcmd1bWVudHMubGVuZ3RoJiZfZ2FxLnB1c2goW1wiX3RyYWNrVGltaW5nXCIsXCJTY3JvbGwgRGVwdGhcIixlLG8sbiwxMDBdKSkpfWZ1bmN0aW9uIGwoZSl7cmV0dXJuKDI1MCpNYXRoLmZsb29yKGUvMjUwKSkudG9TdHJpbmcoKX1mdW5jdGlvbiBuKCl7ZnVuY3Rpb24gdCgpe3A9bmV3IERhdGUsYz1udWxsLGE9by5hcHBseShsLGkpfXZhciBvLHIsbCxpLGEsYyxwO0Q9ITAsbS5vbihcInNjcm9sbC5zY3JvbGxEZXB0aFwiLChvPWZ1bmN0aW9uKCl7dmFyIGUsbix0LG8scixsLGksYT1mKGRvY3VtZW50KS5oZWlnaHQoKSxjPXdpbmRvdy5pbm5lckhlaWdodD93aW5kb3cuaW5uZXJIZWlnaHQ6bS5oZWlnaHQoKSxwPW0uc2Nyb2xsVG9wKCkrYyxnPShlPWEse1wiMjUlXCI6cGFyc2VJbnQoLjI1KmUsMTApLFwiNTAlXCI6cGFyc2VJbnQoLjUqZSwxMCksXCI3NSVcIjpwYXJzZUludCguNzUqZSwxMCksXCIxMDAlXCI6ZS01fSksaD1uZXcgRGF0ZS1zO2lmKGQubGVuZ3RoPj11LmVsZW1lbnRzLmxlbmd0aCsodS5wZXJjZW50YWdlPzQ6MCkpcmV0dXJuIG0ub2ZmKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIpLHZvaWQoRD0hMSk7dS5lbGVtZW50cyYmKG49dS5lbGVtZW50cyx0PXAsbz1oLGYuZWFjaChuLGZ1bmN0aW9uKGUsbil7LTE9PT1mLmluQXJyYXkobixkKSYmZihuKS5sZW5ndGgmJnQ+PWYobikub2Zmc2V0KCkudG9wJiYodihcIkVsZW1lbnRzXCIsbix0LG8pLGQucHVzaChuKSl9KSksdS5wZXJjZW50YWdlJiYocj1nLGw9cCxpPWgsZi5lYWNoKHIsZnVuY3Rpb24oZSxuKXstMT09PWYuaW5BcnJheShlLGQpJiZuPD1sJiYodihcIlBlcmNlbnRhZ2VcIixlLGwsaSksZC5wdXNoKGUpKX0pKX0scj01MDAsYz1udWxsLHA9MCxmdW5jdGlvbigpe3ZhciBlPW5ldyBEYXRlLG49ci0oZS0ocD1wfHxlKSk7cmV0dXJuIGw9dGhpcyxpPWFyZ3VtZW50cyxuPD0wPyhjbGVhclRpbWVvdXQoYyksYz1udWxsLHA9ZSxhPW8uYXBwbHkobCxpKSk6Yz1jfHxzZXRUaW1lb3V0KHQsbiksYX0pKX11PWYuZXh0ZW5kKHt9LGUsdSksZihkb2N1bWVudCkuaGVpZ2h0KCk8dS5taW5IZWlnaHR8fCh1LmdhR2xvYmFsPyhpPSEwLGM9dS5nYUdsb2JhbCk6XCJmdW5jdGlvblwiPT10eXBlb2YgZ3RhZz8ocD0hMCxjPVwiZ3RhZ1wiKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBnYT8oaT0hMCxjPVwiZ2FcIik6XCJmdW5jdGlvblwiPT10eXBlb2YgX19nYVRyYWNrZXImJihpPSEwLGM9XCJfX2dhVHJhY2tlclwiKSxcInVuZGVmaW5lZFwiIT10eXBlb2YgX2dhcSYmXCJmdW5jdGlvblwiPT10eXBlb2YgX2dhcS5wdXNoJiYoYT0hMCksXCJmdW5jdGlvblwiPT10eXBlb2YgdS5ldmVudEhhbmRsZXI/Zz11LmV2ZW50SGFuZGxlcjp2b2lkIDA9PT13aW5kb3dbdS5kYXRhTGF5ZXJdfHxcImZ1bmN0aW9uXCIhPXR5cGVvZiB3aW5kb3dbdS5kYXRhTGF5ZXJdLnB1c2h8fHUuZ3RtT3ZlcnJpZGV8fChnPWZ1bmN0aW9uKGUpe3dpbmRvd1t1LmRhdGFMYXllcl0ucHVzaChlKX0pLGYuc2Nyb2xsRGVwdGgucmVzZXQ9ZnVuY3Rpb24oKXtkPVtdLGg9MCxtLm9mZihcInNjcm9sbC5zY3JvbGxEZXB0aFwiKSxuKCl9LGYuc2Nyb2xsRGVwdGguYWRkRWxlbWVudHM9ZnVuY3Rpb24oZSl7dm9pZCAwIT09ZSYmZi5pc0FycmF5KGUpJiYoZi5tZXJnZSh1LmVsZW1lbnRzLGUpLER8fG4oKSl9LGYuc2Nyb2xsRGVwdGgucmVtb3ZlRWxlbWVudHM9ZnVuY3Rpb24oZSl7dm9pZCAwIT09ZSYmZi5pc0FycmF5KGUpJiZmLmVhY2goZSxmdW5jdGlvbihlLG4pe3ZhciB0PWYuaW5BcnJheShuLHUuZWxlbWVudHMpLG89Zi5pbkFycmF5KG4sZCk7LTEhPXQmJnUuZWxlbWVudHMuc3BsaWNlKHQsMSksLTEhPW8mJmQuc3BsaWNlKG8sMSl9KX0sbigpKX0sZi5zY3JvbGxEZXB0aH0pOyIsIiggZnVuY3Rpb24oICQgKSB7XG5cblx0Lypcblx0ICogQ3JlYXRlIGEgR29vZ2xlIEFuYWx5dGljcyBldmVudFxuXHQgKiBjYXRlZ29yeTogRXZlbnQgQ2F0ZWdvcnlcblx0ICogbGFiZWw6IEV2ZW50IExhYmVsXG5cdCAqIGFjdGlvbjogRXZlbnQgQWN0aW9uXG5cdCAqIHZhbHVlOiBvcHRpb25hbFxuXHQqL1xuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSwgbm9uX2ludGVyYWN0aW9uICkge1xuXHRcdGlmICggdHlwZW9mIGd0YWcgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0Ly8gU2VuZHMgdGhlIGV2ZW50IHRvIHRoZSBHb29nbGUgQW5hbHl0aWNzIHByb3BlcnR5IHdpdGhcblx0XHRcdC8vIHRyYWNraW5nIElEIEdBX01FQVNVUkVNRU5UX0lEIHNldCBieSB0aGUgY29uZmlnIGNvbW1hbmQgaW5cblx0XHRcdC8vIHRoZSBnbG9iYWwgdHJhY2tpbmcgc25pcHBldC5cblx0XHRcdC8vIGV4YW1wbGU6IGd0YWcoJ2V2ZW50JywgJ3BsYXknLCB7ICdldmVudF9jYXRlZ29yeSc6ICdWaWRlb3MnLCAnZXZlbnRfbGFiZWwnOiAnRmFsbCBDYW1wYWlnbicgfSk7XG5cdFx0XHR2YXIgcGFyYW1zID0ge1xuXHRcdFx0XHQnZXZlbnRfY2F0ZWdvcnknOiBjYXRlZ29yeSxcblx0XHRcdFx0J2V2ZW50X2xhYmVsJzogbGFiZWxcblx0XHRcdH07XG5cdFx0XHRpZiAoIHR5cGVvZiB2YWx1ZSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdHBhcmFtcy52YWx1ZSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCB0eXBlb2Ygbm9uX2ludGVyYWN0aW9uICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0cGFyYW1zLm5vbl9pbnRlcmFjdGlvbiA9IG5vbl9pbnRlcmFjdGlvbjtcblx0XHRcdH1cblx0XHRcdGd0YWcoIHR5cGUsIGFjdGlvbiwgcGFyYW1zICk7XG5cdFx0fSBlbHNlIGlmICggdHlwZW9mIGdhICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdC8vIFVzZXMgdGhlIGRlZmF1bHQgdHJhY2tlciB0byBzZW5kIHRoZSBldmVudCB0byB0aGVcblx0XHRcdC8vIEdvb2dsZSBBbmFseXRpY3MgcHJvcGVydHkgd2l0aCB0cmFja2luZyBJRCBHQV9NRUFTVVJFTUVOVF9JRC5cblx0XHRcdC8vIGV4YW1wbGU6IGdhKCdzZW5kJywgJ2V2ZW50JywgJ1ZpZGVvcycsICdwbGF5JywgJ0ZhbGwgQ2FtcGFpZ24nKTtcblx0XHRcdC8vIG5vbmludGVyYWN0aW9uIHNlZW1zIHRvIGhhdmUgYmVlbiB3b3JraW5nIGxpa2UgdGhpcyBpbiBhbmFseXRpY3MuanMuXG5cdFx0XHRpZiAoIG5vbl9pbnRlcmFjdGlvbiA9PSAxICkge1xuXHRcdFx0XHR2YWx1ZSA9IHsgJ25vbkludGVyYWN0aW9uJzogMSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKSB7XG5cdFx0aWYgKCAndW5kZWZpbmVkJyA9PT0gdHlwZW9mIGd0YWcgJiYgJ3VuZGVmaW5lZCcgPT09IHR5cGVvZiBnYSApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dmFyIHNjcm9sbERlcHRoU2V0dGluZ3MgPSBbXTtcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzICkge1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5lbmFibGVkICkge1xuXHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydndG1PdmVycmlkZSddID0gdHJ1ZTtcblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBzdHJpbmcgYW5kIGEgYm9vbGVhblxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFuYWx5dGljc190eXBlICYmICdndGFnanMnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYW5hbHl0aWNzX3R5cGUgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZ2FHbG9iYWwnXSA9ICdnYSc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIHN0cmluZ1xuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5taW5pbXVtX2hlaWdodCAmJiAnMCcgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbWluaW11bV9oZWlnaHQnXSA9IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwucGVyY2VudGFnZSApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwZXJjZW50YWdlJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGEgYm9vbGVhbi4gZGVmYXVsdCBpcyB0cnVlLlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyAmJiAndHJ1ZScgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwudXNlcl90aW1pbmcgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1sndXNlcl90aW1pbmcnXSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmFsdWUgaXMgYSBib29sZWFuLiBkZWZhdWx0IGlzIHRydWUuXG5cdFx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBpeGVsX2RlcHRoICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC51c2VyX3RpbWluZyApIHtcblx0XHRcdFx0XHRzY3JvbGxEZXB0aFNldHRpbmdzWydwaXhlbF9kZXB0aCddID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB2YWx1ZSBpcyBhIGJvb2xlYW4uIGRlZmF1bHQgaXMgdHJ1ZS5cblx0XHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubm9uX2ludGVyYWN0aW9uICYmICd0cnVlJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb24gKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snbm9uX2ludGVyYWN0aW9uJ10gPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHZhbHVlIGlzIGFuIGFycmF5LiBkZWZhdWx0IGlzIGVtcHR5LlxuXHRcdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5zY3JvbGxfZWxlbWVudHMgKSB7XG5cdFx0XHRcdFx0c2Nyb2xsRGVwdGhTZXR0aW5nc1snZWxlbWVudHMnXSA9ICQubWFwKCBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cy5zcGxpdCggJywnICksICQudHJpbSApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyBzZW5kIHNjcm9sbCBzZXR0aW5ncyB0byB0aGUgc2Nyb2xsZGVwdGggcGx1Z2luXG5cdFx0XHRcdGpRdWVyeS5zY3JvbGxEZXB0aCggc2Nyb2xsRGVwdGhTZXR0aW5ncyApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZW5hYmxlZCApIHtcblxuXHRcdFx0XHQvLyBleHRlcm5hbCBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cImh0dHBcIl06bm90KFtocmVmKj1cIjovLycgKyBkb2N1bWVudC5kb21haW4gKyAnXCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdPdXRib3VuZCBsaW5rcycsICdDbGljaycsIHRoaXMuaHJlZiApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBtYWlsdG8gbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJtYWlsdG9cIl0nICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnTWFpbHMnLCAnQ2xpY2snLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gdGVsIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwidGVsXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ1RlbGVwaG9uZScsICdDYWxsJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGludGVybmFsIGxpbmtzXG5cdFx0XHRcdCQoICdhOm5vdChbaHJlZl49XCIoaHR0cDp8aHR0cHM6KT8vL1wiXSxbaHJlZl49XCIjXCJdLFtocmVmXj1cIm1haWx0bzpcIl0pJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHRcdC8vIHRyYWNrIGRvd25sb2Fkc1xuXHRcdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICkge1xuXHRcdFx0XHRcdFx0dmFyIHVybCA9IHRoaXMuaHJlZjtcblx0XHRcdFx0XHRcdHZhciBjaGVja0Rvd25sb2FkID0gbmV3IFJlZ0V4cCggXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiICk7XG5cdFx0XHRcdFx0XHR2YXIgaXNEb3dubG9hZCA9IGNoZWNrRG93bmxvYWQudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzRG93bmxvYWQgKSB7XG5cdFx0XHRcdFx0XHRcdHZhciBjaGVja0Rvd25sb2FkRXh0ZW5zaW9uID0gbmV3IFJlZ0V4cChcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIpO1xuXHRcdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uUmVzdWx0ID0gY2hlY2tEb3dubG9hZEV4dGVuc2lvbi5leGVjKCB1cmwgKTtcblx0XHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvbiA9ICcnO1xuXHRcdFx0XHRcdFx0XHRpZiAoIG51bGwgIT09IGV4dGVuc2lvblJlc3VsdCApIHtcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHRbMV07XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdC8vIHdlIGNhbid0IHVzZSB0aGUgdXJsIGZvciB0aGUgdmFsdWUgaGVyZSwgZXZlbiB0aG91Z2ggdGhhdCB3b3VsZCBiZSBuaWNlLCBiZWNhdXNlIHZhbHVlIGlzIHN1cHBvc2VkIHRvIGJlIGFuIGludGVnZXJcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnRG93bmxvYWRzJywgZXh0ZW5zaW9uLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSk7XG5cblx0XHRcdH1cblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5lbmFibGVkICkge1xuXHRcdFx0XHQvLyBhbnkgbGluayBjb3VsZCBiZSBhbiBhZmZpbGlhdGUsIGkgZ3Vlc3M/XG5cdFx0XHRcdCQoICdhJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHRcdC8vIHRyYWNrIGFmZmlsaWF0ZXNcblx0XHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCApIHtcblx0XHRcdFx0XHRcdHZhciBjaGVja0FmZmlsaWF0ZSA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdFx0dmFyIGlzQWZmaWxpYXRlID0gY2hlY2tBZmZpbGlhdGUudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0XHRpZiAoIHRydWUgPT09IGlzQWZmaWxpYXRlICkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZmZpbGlhdGUnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGxpbmsgZnJhZ21lbnRzIGFzIHBhZ2V2aWV3c1xuXHRcdFx0Ly8gZG9lcyBub3QgdXNlIHRoZSBldmVudCB0cmFja2luZyBtZXRob2Rcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuZnJhZ21lbnQgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50LmVuYWJsZWQgKSB7XG5cdFx0XHRcdGlmICggdHlwZW9mIGdhICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0XHR3aW5kb3cub25oYXNoY2hhbmdlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRnYSggJ3NlbmQnLCAncGFnZXZpZXcnLCBsb2NhdGlvbi5wYXRobmFtZSArIGxvY2F0aW9uLnNlYXJjaCArIGxvY2F0aW9uLmhhc2ggKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gd2hlbiBhIGJ1dHRvbiBpcyBjbGlja2VkLCBhdHRhY2ggaXQgdG8gdGhlIGZvcm0ncyBkYXRhXG5cdFx0XHQkKCAnaW5wdXRbdHlwZT1cInN1Ym1pdFwiXSwgYnV0dG9uW3R5cGU9XCJzdWJtaXRcIl0nICkub24oICdjbGljaycsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgZm9ybSA9ICQoIHRoaXMgKS5wYXJlbnRzKCAnZm9ybTpmaXJzdCcgKTtcblx0XHRcdFx0JCggZm9ybSApLmRhdGEoICdidXR0b24nLCB0aGlzICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gYmFzaWMgZm9ybSBzdWJtaXRzLiB0cmFjayBzdWJtaXQgaW5zdGVhZCBvZiBjbGljayBiZWNhdXNlIG90aGVyd2lzZSBpdCdzIHdlaXJkLlxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mb3JtX3N1Ym1pc3Npb25zICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mb3JtX3N1Ym1pc3Npb25zLmVuYWJsZWQgKSB7XG5cdFx0XHRcdCQoICdmb3JtJyApLnN1Ym1pdCggZnVuY3Rpb24oIGYgKSB7XG5cdFx0XHRcdFx0dmFyIGJ1dHRvbiA9ICQoIHRoaXMgKS5kYXRhKCAnYnV0dG9uJyApIHx8ICQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5nZXQoIDAgKTtcblx0XHQgICAgICAgICAgICB2YXIgY2F0ZWdvcnkgPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtY2F0ZWdvcnknICkgfHwgJ0Zvcm0nO1xuXHRcdCAgICAgICAgICAgIHZhciBhY3Rpb24gPSAkKCBidXR0b24gKS5kYXRhKCAnZ2EtYWN0aW9uJyApIHx8ICdTdWJtaXQnO1xuXHRcdCAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoIGJ1dHRvbiApLmRhdGEoICdnYS1sYWJlbCcgKSB8fCAkKCBidXR0b24gKS50ZXh0KCkgfHwgYnV0dG9uLnZhbHVlIHx8IGJ1dHRvbi5uYW1lO1xuXHRcdCAgICAgICAgICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHQgICAgICAgIH0pO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUubG9nKCAnbm8gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzJyApO1xuXHRcdH1cblx0fVxuXG5cdCQoIGRvY3VtZW50ICkucmVhZHkoIGZ1bmN0aW9uKCkge1xuXHRcdHdwX2FuYWx5dGljc190cmFja2luZ19zZXR1cCgpO1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MudHJhY2tfYWRibG9ja2VyICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy50cmFja19hZGJsb2NrZXIuZW5hYmxlZCApIHtcblx0XHRcdGlmICggdHlwZW9mIHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IgPT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09uJywgJ0FkYmxvY2tlciBTdGF0dXMnLCB1bmRlZmluZWQsIDEgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRkZWJ1ZzogZmFsc2UsXG5cdFx0XHRcdFx0XHRmb3VuZDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT24nLCAnQWRibG9ja2VyIFN0YXR1cycsIHVuZGVmaW5lZCwgMSApO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG5vdEZvdW5kOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPZmYnLCAnQWRibG9ja2VyIFN0YXR1cycsIHVuZGVmaW5lZCwgMSApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG59ICkoIGpRdWVyeSApO1xuIl19
