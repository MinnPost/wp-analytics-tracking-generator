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

function _typeof(obj) { if (typeof Symbol === "function" && _typeof(Symbol.iterator) === "symbol") { _typeof = function (_typeof2) { function _typeof(_x) { return _typeof2.apply(this, arguments); } _typeof.toString = function () { return _typeof2.toString(); }; return _typeof; }(function (obj) { return typeof obj === "undefined" ? "undefined" : _typeof(obj); }); } else { _typeof = function (_typeof3) { function _typeof(_x2) { return _typeof3.apply(this, arguments); } _typeof.toString = function () { return _typeof3.toString(); }; return _typeof; }(function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj === "undefined" ? "undefined" : _typeof(obj); }); } return _typeof(obj); }

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
    if ('undefined' !== typeof analytics_tracking_settings) {
      if ('undefined' !== typeof analytics_tracking_settings.scroll && true === analytics_tracking_settings.scroll.enabled) {
        console.log('start scroll track');
        jQuery.scrollDepth(analytics_tracking_settings.scroll);
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInZlbmRvci9hZGJsb2NrRGV0ZWN0b3IuanMiLCJ2ZW5kb3IvanF1ZXJ5LnNjcm9sbGRlcHRoLm1pbi5qcyIsImZyb250LWVuZC93cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwibiIsInIiLCJvIiwibWluSGVpZ2h0IiwiZWxlbWVudHMiLCJwZXJjZW50YWdlIiwidXNlclRpbWluZyIsInBpeGVsRGVwdGgiLCJub25JbnRlcmFjdGlvbiIsImdhR2xvYmFsIiwiZ3RtT3ZlcnJpZGUiLCJ0cmFja2VyTmFtZSIsImRhdGFMYXllciIsImEiLCJsIiwiYyIsInUiLCJzY3JvbGxEZXB0aCIsInAiLCJzIiwiZXZlbnQiLCJldmVudENhdGVnb3J5IiwiZXZlbnRBY3Rpb24iLCJldmVudExhYmVsIiwiZXZlbnRWYWx1ZSIsImV2ZW50Tm9uSW50ZXJhY3Rpb24iLCJhcmd1bWVudHMiLCJldmVudFRpbWluZyIsIl9nYXEiLCJoIiwicGFyc2VJbnQiLCJnIiwiZWFjaCIsImluQXJyYXkiLCJmIiwib2Zmc2V0IiwidG9wIiwiTWF0aCIsImZsb29yIiwidG9TdHJpbmciLCJtIiwieSIsIkRhdGUiLCJhcHBseSIsIm9uIiwiaGVpZ2h0IiwiaW5uZXJIZWlnaHQiLCJzY3JvbGxUb3AiLCJEIiwib2ZmIiwiZXh0ZW5kIiwiZ2EiLCJfX2dhVHJhY2tlciIsImV2ZW50SGFuZGxlciIsInJlc2V0IiwiYWRkRWxlbWVudHMiLCJpc0FycmF5IiwibWVyZ2UiLCJyZW1vdmVFbGVtZW50cyIsInNwbGljZSIsIiQiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwid3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwIiwiYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsInNwZWNpYWwiLCJkb21haW4iLCJjbGljayIsImhyZWYiLCJzdWJzdHJpbmciLCJkb3dubG9hZF9yZWdleCIsImNoZWNrRG93bmxvYWQiLCJSZWdFeHAiLCJpc0Rvd25sb2FkIiwiY2hlY2tEb3dubG9hZEV4dGVuc2lvbiIsImV4dGVuc2lvblJlc3VsdCIsImV4ZWMiLCJleHRlbnNpb24iLCJhZmZpbGlhdGUiLCJhZmZpbGlhdGVfcmVnZXgiLCJjaGVja0FmZmlsaWF0ZSIsImlzQWZmaWxpYXRlIiwiZnJhZ21lbnQiLCJvbmhhc2hjaGFuZ2UiLCJsb2NhdGlvbiIsInBhdGhuYW1lIiwic2VhcmNoIiwiaGFzaCIsImZvcm1fc3VibWlzc2lvbnMiLCJuYW1lIiwicmVhZHkiLCJ0cmFja19hZGJsb2NrZXIiLCJhZGJsb2NrRGV0ZWN0b3IiLCJub3RGb3VuZCJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBaUNBOztBQUNBLENBQUMsVUFBU0EsR0FBVCxFQUFjO0FBRWQsTUFBSUMsT0FBTyxHQUFHLEtBQWQ7QUFFQSxNQUFJQyxHQUFHLEdBQUcsUUFBVjtBQUFBLE1BQW9CQyxFQUFFLEdBQUcsUUFBekI7O0FBQ0EsTUFBSUMsSUFBSSxHQUFHLFNBQVBBLElBQU8sR0FBVSxDQUFFLENBQXZCOztBQUVBLE1BQUlDLFVBQVUsR0FBRyxLQUFqQjtBQUNBLE1BQUlDLGFBQWEsR0FBRyxLQUFwQjtBQUVBLE1BQUlDLGFBQWEsR0FBSVAsR0FBRyxDQUFDUSxnQkFBSixLQUF5QkMsU0FBOUM7QUFFQTs7Ozs7QUFJQSxNQUFJQyxRQUFRLEdBQUc7QUFDZEMsSUFBQUEsU0FBUyxFQUFFLEVBREc7QUFFZEMsSUFBQUEsT0FBTyxFQUFFLENBRks7QUFHZEMsSUFBQUEsS0FBSyxFQUFFLElBSE87QUFJZEMsSUFBQUEsS0FBSyxFQUFFVixJQUpPO0FBSUk7QUFDbEJXLElBQUFBLFFBQVEsRUFBRVgsSUFMSTtBQUtNO0FBQ3BCWSxJQUFBQSxRQUFRLEVBQUVaLElBTkksQ0FNTTs7QUFOTixHQUFmOztBQVNBLFdBQVNhLFdBQVQsQ0FBcUJDLElBQXJCLEVBQTBCO0FBQ3pCLFFBQUlDLE1BQUosRUFBWUMsTUFBWjs7QUFDQSxRQUFHO0FBQ0ZELE1BQUFBLE1BQU0sR0FBR0UsSUFBSSxDQUFDQyxLQUFMLENBQVdKLElBQVgsQ0FBVDtBQUNBLEtBRkQsQ0FHQSxPQUFNSyxFQUFOLEVBQVM7QUFDUixVQUFHO0FBQ0ZILFFBQUFBLE1BQU0sR0FBRyxJQUFJSSxRQUFKLENBQWEsWUFBWU4sSUFBekIsQ0FBVDtBQUNBQyxR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QixDQUFDNkIsZUFBbkQsSUFBc0UsU0FBUzdCLDJCQUEyQixDQUFDNkIsZUFBNUIsQ0FBNEMzQixPQUFoSSxFQUEwSTtBQUN6SSxVQUFLLE9BQU83RixNQUFNLENBQUN5SCxlQUFkLEtBQWtDLFdBQXZDLEVBQXFEO0FBQ3BEckMsUUFBQUEsMkJBQTJCLENBQUUsT0FBRixFQUFXLFNBQVgsRUFBc0IsSUFBdEIsRUFBNEI7QUFBRSw0QkFBa0I7QUFBcEIsU0FBNUIsQ0FBM0I7QUFDQSxPQUZELE1BRU87QUFDTnBGLFFBQUFBLE1BQU0sQ0FBQ3lILGVBQVAsQ0FBdUI1RyxJQUF2QixDQUNDO0FBQ0MxSCxVQUFBQSxLQUFLLEVBQUUsS0FEUjtBQUVDQyxVQUFBQSxLQUFLLEVBQUUsaUJBQVc7QUFDakJnTSxZQUFBQSwyQkFBMkIsQ0FBRSxPQUFGLEVBQVcsU0FBWCxFQUFzQixJQUF0QixFQUE0QjtBQUFFLGdDQUFrQjtBQUFwQixhQUE1QixDQUEzQjtBQUNBLFdBSkY7QUFLQ3NDLFVBQUFBLFFBQVEsRUFBRSxvQkFBVztBQUNwQnRDLFlBQUFBLDJCQUEyQixDQUFFLE9BQUYsRUFBVyxTQUFYLEVBQXNCLEtBQXRCLEVBQTZCO0FBQUUsZ0NBQWtCO0FBQXBCLGFBQTdCLENBQTNCO0FBQ0E7QUFQRixTQUREO0FBV0E7QUFDRDtBQUNELEdBbkJEO0FBcUJBLENBcklELEVBcUlLOUQsTUFySUwiLCJmaWxlIjoid3AtYW5hbHl0aWNzLXRyYWNraW5nLWdlbmVyYXRvci1mcm9udC1lbmQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQWRCbG9jayBkZXRlY3RvclxuLy9cbi8vIEF0dGVtcHRzIHRvIGRldGVjdCB0aGUgcHJlc2VuY2Ugb2YgQWQgQmxvY2tlciBzb2Z0d2FyZSBhbmQgbm90aWZ5IGxpc3RlbmVyIG9mIGl0cyBleGlzdGVuY2UuXG4vLyBDb3B5cmlnaHQgKGMpIDIwMTcgSUFCXG4vL1xuLy8gVGhlIEJTRC0zIExpY2Vuc2Vcbi8vIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbi8vIDEuIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbi8vIDIuIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbi8vIDMuIE5laXRoZXIgdGhlIG5hbWUgb2YgdGhlIGNvcHlyaWdodCBob2xkZXIgbm9yIHRoZSBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0cyBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbi8vIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORCBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SIEFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFUyAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7IExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVCAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJUyBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuKiBAbmFtZSB3aW5kb3cuYWRibG9ja0RldGVjdG9yXG4qXG4qIElBQiBBZGJsb2NrIGRldGVjdG9yLlxuKiBVc2FnZTogd2luZG93LmFkYmxvY2tEZXRlY3Rvci5pbml0KG9wdGlvbnMpO1xuKlxuKiBPcHRpb25zIG9iamVjdCBzZXR0aW5nc1xuKlxuKlx0QHByb3AgZGVidWc6ICBib29sZWFuXG4qICAgICAgICAgRmxhZyB0byBpbmRpY2F0ZSBhZGRpdGlvbmFsIGRlYnVnIG91dHB1dCBzaG91bGQgYmUgcHJpbnRlZCB0byBjb25zb2xlXG4qXG4qXHRAcHJvcCBmb3VuZDogQGZ1bmN0aW9uXG4qICAgICAgICAgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBpZiBhZGJsb2NrIGlzIGRldGVjdGVkXG4qXG4qXHRAcHJvcCBub3Rmb3VuZDogQGZ1bmN0aW9uXG4qICAgICAgICAgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBpZiBhZGJsb2NrIGlzIG5vdCBkZXRlY3RlZC5cbiogICAgICAgICBOT1RFOiB0aGlzIGZ1bmN0aW9uIG1heSBmaXJlIG11bHRpcGxlIHRpbWVzIGFuZCBnaXZlIGZhbHNlIG5lZ2F0aXZlXG4qICAgICAgICAgcmVzcG9uc2VzIGR1cmluZyBhIHRlc3QgdW50aWwgYWRibG9jayBpcyBzdWNjZXNzZnVsbHkgZGV0ZWN0ZWQuXG4qXG4qXHRAcHJvcCBjb21wbGV0ZTogQGZ1bmN0aW9uXG4qICAgICAgICAgQ2FsbGJhY2sgZnVuY3Rpb24gdG8gZmlyZSBvbmNlIGEgcm91bmQgb2YgdGVzdGluZyBpcyBjb21wbGV0ZS5cbiogICAgICAgICBUaGUgdGVzdCByZXN1bHQgKGJvb2xlYW4pIGlzIGluY2x1ZGVkIGFzIGEgcGFyYW1ldGVyIHRvIGNhbGxiYWNrXG4qXG4qIGV4YW1wbGU6IFx0d2luZG93LmFkYmxvY2tEZXRlY3Rvci5pbml0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Zm91bmQ6IGZ1bmN0aW9uKCl7IC4uLn0sXG4gXHRcdFx0XHRcdG5vdEZvdW5kOiBmdW5jdGlvbigpey4uLn1cblx0XHRcdFx0fVxuXHRcdFx0KTtcbipcbipcbiovXG5cblwidXNlIHN0cmljdFwiO1xuKGZ1bmN0aW9uKHdpbikge1xuXG5cdHZhciB2ZXJzaW9uID0gJzEuMCc7XG5cblx0dmFyIG9mcyA9ICdvZmZzZXQnLCBjbCA9ICdjbGllbnQnO1xuXHR2YXIgbm9vcCA9IGZ1bmN0aW9uKCl7fTtcblxuXHR2YXIgdGVzdGVkT25jZSA9IGZhbHNlO1xuXHR2YXIgdGVzdEV4ZWN1dGluZyA9IGZhbHNlO1xuXG5cdHZhciBpc09sZElFZXZlbnRzID0gKHdpbi5hZGRFdmVudExpc3RlbmVyID09PSB1bmRlZmluZWQpO1xuXG5cdC8qKlxuXHQqIE9wdGlvbnMgc2V0IHdpdGggZGVmYXVsdCBvcHRpb25zIGluaXRpYWxpemVkXG5cdCpcblx0Ki9cblx0dmFyIF9vcHRpb25zID0ge1xuXHRcdGxvb3BEZWxheTogNTAsXG5cdFx0bWF4TG9vcDogNSxcblx0XHRkZWJ1ZzogdHJ1ZSxcblx0XHRmb3VuZDogbm9vcCwgXHRcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgd2hlbiBhZGJsb2NrIGRldGVjdGVkXG5cdFx0bm90Zm91bmQ6IG5vb3AsIFx0XHRcdFx0Ly8gZnVuY3Rpb24gdG8gZmlyZSBpZiBhZGJsb2NrIG5vdCBkZXRlY3RlZCBhZnRlciB0ZXN0aW5nXG5cdFx0Y29tcGxldGU6IG5vb3AgIFx0XHRcdFx0Ly8gZnVuY3Rpb24gdG8gZmlyZSBhZnRlciB0ZXN0aW5nIGNvbXBsZXRlcywgcGFzc2luZyByZXN1bHQgYXMgcGFyYW1ldGVyXG5cdH1cblxuXHRmdW5jdGlvbiBwYXJzZUFzSnNvbihkYXRhKXtcblx0XHR2YXIgcmVzdWx0LCBmbkRhdGE7XG5cdFx0dHJ5e1xuXHRcdFx0cmVzdWx0ID0gSlNPTi5wYXJzZShkYXRhKTtcblx0XHR9XG5cdFx0Y2F0Y2goZXgpe1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHRmbkRhdGEgPSBuZXcgRnVuY3Rpb24oXCJyZXR1cm4gXCIgKyBkYXRhKTtcblx0XHRcdFx0cmVzdWx0ID0gZm5EYXRhKCk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdGxvZygnRmFpbGVkIHNlY29uZGFyeSBKU09OIHBhcnNlJywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQqIEFqYXggaGVscGVyIG9iamVjdCB0byBkb3dubG9hZCBleHRlcm5hbCBzY3JpcHRzLlxuXHQqIEluaXRpYWxpemUgb2JqZWN0IHdpdGggYW4gb3B0aW9ucyBvYmplY3Rcblx0KiBFeDpcblx0ICB7XG5cdFx0ICB1cmwgOiAnaHR0cDovL2V4YW1wbGUub3JnL3VybF90b19kb3dubG9hZCcsXG5cdFx0ICBtZXRob2Q6ICdQT1NUfEdFVCcsXG5cdFx0ICBzdWNjZXNzOiBjYWxsYmFja19mdW5jdGlvbixcblx0XHQgIGZhaWw6ICBjYWxsYmFja19mdW5jdGlvblxuXHQgIH1cblx0Ki9cblx0dmFyIEFqYXhIZWxwZXIgPSBmdW5jdGlvbihvcHRzKXtcblx0XHR2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cblx0XHR0aGlzLnN1Y2Nlc3MgPSBvcHRzLnN1Y2Nlc3MgfHwgbm9vcDtcblx0XHR0aGlzLmZhaWwgPSBvcHRzLmZhaWwgfHwgbm9vcDtcblx0XHR2YXIgbWUgPSB0aGlzO1xuXG5cdFx0dmFyIG1ldGhvZCA9IG9wdHMubWV0aG9kIHx8ICdnZXQnO1xuXG5cdFx0LyoqXG5cdFx0KiBBYm9ydCB0aGUgcmVxdWVzdFxuXHRcdCovXG5cdFx0dGhpcy5hYm9ydCA9IGZ1bmN0aW9uKCl7XG5cdFx0XHR0cnl7XG5cdFx0XHRcdHhoci5hYm9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHN0YXRlQ2hhbmdlKHZhbHMpe1xuXHRcdFx0aWYoeGhyLnJlYWR5U3RhdGUgPT0gNCl7XG5cdFx0XHRcdGlmKHhoci5zdGF0dXMgPT0gMjAwKXtcblx0XHRcdFx0XHRtZS5zdWNjZXNzKHhoci5yZXNwb25zZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHQvLyBmYWlsZWRcblx0XHRcdFx0XHRtZS5mYWlsKHhoci5zdGF0dXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0eGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IHN0YXRlQ2hhbmdlO1xuXG5cdFx0ZnVuY3Rpb24gc3RhcnQoKXtcblx0XHRcdHhoci5vcGVuKG1ldGhvZCwgb3B0cy51cmwsIHRydWUpO1xuXHRcdFx0eGhyLnNlbmQoKTtcblx0XHR9XG5cblx0XHRzdGFydCgpO1xuXHR9XG5cblx0LyoqXG5cdCogT2JqZWN0IHRyYWNraW5nIHRoZSB2YXJpb3VzIGJsb2NrIGxpc3RzXG5cdCovXG5cdHZhciBCbG9ja0xpc3RUcmFja2VyID0gZnVuY3Rpb24oKXtcblx0XHR2YXIgbWUgPSB0aGlzO1xuXHRcdHZhciBleHRlcm5hbEJsb2NrbGlzdERhdGEgPSB7fTtcblxuXHRcdC8qKlxuXHRcdCogQWRkIGEgbmV3IGV4dGVybmFsIFVSTCB0byB0cmFja1xuXHRcdCovXG5cdFx0dGhpcy5hZGRVcmwgPSBmdW5jdGlvbih1cmwpe1xuXHRcdFx0ZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybF0gPSB7XG5cdFx0XHRcdHVybDogdXJsLFxuXHRcdFx0XHRzdGF0ZTogJ3BlbmRpbmcnLFxuXHRcdFx0XHRmb3JtYXQ6IG51bGwsXG5cdFx0XHRcdGRhdGE6IG51bGwsXG5cdFx0XHRcdHJlc3VsdDogbnVsbFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybF07XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0KiBMb2FkcyBhIGJsb2NrIGxpc3QgZGVmaW5pdGlvblxuXHRcdCovXG5cdFx0dGhpcy5zZXRSZXN1bHQgPSBmdW5jdGlvbih1cmxLZXksIHN0YXRlLCBkYXRhKXtcblx0XHRcdHZhciBvYmogPSBleHRlcm5hbEJsb2NrbGlzdERhdGFbdXJsS2V5XTtcblx0XHRcdGlmKG9iaiA9PSBudWxsKXtcblx0XHRcdFx0b2JqID0gdGhpcy5hZGRVcmwodXJsS2V5KTtcblx0XHRcdH1cblxuXHRcdFx0b2JqLnN0YXRlID0gc3RhdGU7XG5cdFx0XHRpZihkYXRhID09IG51bGwpe1xuXHRcdFx0XHRvYmoucmVzdWx0ID0gbnVsbDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZih0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpe1xuXHRcdFx0XHR0cnl7XG5cdFx0XHRcdFx0ZGF0YSA9IHBhcnNlQXNKc29uKGRhdGEpO1xuXHRcdFx0XHRcdG9iai5mb3JtYXQgPSAnanNvbic7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRcdG9iai5mb3JtYXQgPSAnZWFzeWxpc3QnO1xuXHRcdFx0XHRcdC8vIHBhcnNlRWFzeUxpc3QoZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG9iai5kYXRhID0gZGF0YTtcblxuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9XG5cblx0fVxuXG5cdHZhciBsaXN0ZW5lcnMgPSBbXTsgLy8gZXZlbnQgcmVzcG9uc2UgbGlzdGVuZXJzXG5cdHZhciBiYWl0Tm9kZSA9IG51bGw7XG5cdHZhciBxdWlja0JhaXQgPSB7XG5cdFx0Y3NzQ2xhc3M6ICdwdWJfMzAweDI1MCBwdWJfMzAweDI1MG0gcHViXzcyOHg5MCB0ZXh0LWFkIHRleHRBZCB0ZXh0X2FkIHRleHRfYWRzIHRleHQtYWRzIHRleHQtYWQtbGlua3MnXG5cdH07XG5cdHZhciBiYWl0VHJpZ2dlcnMgPSB7XG5cdFx0bnVsbFByb3BzOiBbb2ZzICsgJ1BhcmVudCddLFxuXHRcdHplcm9Qcm9wczogW11cblx0fTtcblxuXHRiYWl0VHJpZ2dlcnMuemVyb1Byb3BzID0gW1xuXHRcdG9mcyArJ0hlaWdodCcsIG9mcyArJ0xlZnQnLCBvZnMgKydUb3AnLCBvZnMgKydXaWR0aCcsIG9mcyArJ0hlaWdodCcsXG5cdFx0Y2wgKyAnSGVpZ2h0JywgY2wgKyAnV2lkdGgnXG5cdF07XG5cblx0Ly8gcmVzdWx0IG9iamVjdFxuXHR2YXIgZXhlUmVzdWx0ID0ge1xuXHRcdHF1aWNrOiBudWxsLFxuXHRcdHJlbW90ZTogbnVsbFxuXHR9O1xuXG5cdHZhciBmaW5kUmVzdWx0ID0gbnVsbDsgLy8gcmVzdWx0IG9mIHRlc3QgZm9yIGFkIGJsb2NrZXJcblxuXHR2YXIgdGltZXJJZHMgPSB7XG5cdFx0dGVzdDogMCxcblx0XHRkb3dubG9hZDogMFxuXHR9O1xuXG5cdGZ1bmN0aW9uIGlzRnVuYyhmbil7XG5cdFx0cmV0dXJuIHR5cGVvZihmbikgPT0gJ2Z1bmN0aW9uJztcblx0fVxuXG5cdC8qKlxuXHQqIE1ha2UgYSBET00gZWxlbWVudFxuXHQqL1xuXHRmdW5jdGlvbiBtYWtlRWwodGFnLCBhdHRyaWJ1dGVzKXtcblx0XHR2YXIgaywgdiwgZWwsIGF0dHIgPSBhdHRyaWJ1dGVzO1xuXHRcdHZhciBkID0gZG9jdW1lbnQ7XG5cblx0XHRlbCA9IGQuY3JlYXRlRWxlbWVudCh0YWcpO1xuXG5cdFx0aWYoYXR0cil7XG5cdFx0XHRmb3IoayBpbiBhdHRyKXtcblx0XHRcdFx0aWYoYXR0ci5oYXNPd25Qcm9wZXJ0eShrKSl7XG5cdFx0XHRcdFx0ZWwuc2V0QXR0cmlidXRlKGssIGF0dHJba10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXR0YWNoRXZlbnRMaXN0ZW5lcihkb20sIGV2ZW50TmFtZSwgaGFuZGxlcil7XG5cdFx0aWYoaXNPbGRJRWV2ZW50cyl7XG5cdFx0XHRkb20uYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50TmFtZSwgaGFuZGxlcik7XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHRkb20uYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBsb2cobWVzc2FnZSwgaXNFcnJvcil7XG5cdFx0aWYoIV9vcHRpb25zLmRlYnVnICYmICFpc0Vycm9yKXtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYod2luLmNvbnNvbGUgJiYgd2luLmNvbnNvbGUubG9nKXtcblx0XHRcdGlmKGlzRXJyb3Ipe1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdbQUJEXSAnICsgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNle1xuXHRcdFx0XHRjb25zb2xlLmxvZygnW0FCRF0gJyArIG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhciBhamF4RG93bmxvYWRzID0gW107XG5cblx0LyoqXG5cdCogTG9hZCBhbmQgZXhlY3V0ZSB0aGUgVVJMIGluc2lkZSBhIGNsb3N1cmUgZnVuY3Rpb25cblx0Ki9cblx0ZnVuY3Rpb24gbG9hZEV4ZWN1dGVVcmwodXJsKXtcblx0XHR2YXIgYWpheCwgcmVzdWx0O1xuXG5cdFx0YmxvY2tMaXN0cy5hZGRVcmwodXJsKTtcblx0XHQvLyBzZXR1cCBjYWxsIGZvciByZW1vdGUgbGlzdFxuXHRcdGFqYXggPSBuZXcgQWpheEhlbHBlcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiB1cmwsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZ1bmN0aW9uKGRhdGEpe1xuXHRcdFx0XHRcdGxvZygnZG93bmxvYWRlZCBmaWxlICcgKyB1cmwpOyAvLyB0b2RvIC0gcGFyc2UgYW5kIHN0b3JlIHVudGlsIHVzZVxuXHRcdFx0XHRcdHJlc3VsdCA9IGJsb2NrTGlzdHMuc2V0UmVzdWx0KHVybCwgJ3N1Y2Nlc3MnLCBkYXRhKTtcblx0XHRcdFx0XHR0cnl7XG5cdFx0XHRcdFx0XHR2YXIgaW50ZXJ2YWxJZCA9IDAsXG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQgPSAwO1xuXG5cdFx0XHRcdFx0XHR2YXIgdHJ5RXhlY3V0ZVRlc3QgPSBmdW5jdGlvbihsaXN0RGF0YSl7XG5cdFx0XHRcdFx0XHRcdGlmKCF0ZXN0RXhlY3V0aW5nKXtcblx0XHRcdFx0XHRcdFx0XHRiZWdpblRlc3QobGlzdERhdGEsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYoZmluZFJlc3VsdCA9PSB0cnVlKXtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZih0cnlFeGVjdXRlVGVzdChyZXN1bHQuZGF0YSkpe1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNle1xuXHRcdFx0XHRcdFx0XHRsb2coJ1BhdXNlIGJlZm9yZSB0ZXN0IGV4ZWN1dGlvbicpO1xuXHRcdFx0XHRcdFx0XHRpbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRcdFx0XHRpZih0cnlFeGVjdXRlVGVzdChyZXN1bHQuZGF0YSkgfHwgcmV0cnlDb3VudCsrID4gNSl7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbGVhckludGVydmFsKGludGVydmFsSWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSwgMjUwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRcdFx0bG9nKGV4Lm1lc3NhZ2UgKyAnIHVybDogJyArIHVybCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmYWlsOiBmdW5jdGlvbihzdGF0dXMpe1xuXHRcdFx0XHRcdGxvZyhzdGF0dXMsIHRydWUpO1xuXHRcdFx0XHRcdGJsb2NrTGlzdHMuc2V0UmVzdWx0KHVybCwgJ2Vycm9yJywgbnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0YWpheERvd25sb2Fkcy5wdXNoKGFqYXgpO1xuXHR9XG5cblxuXHQvKipcblx0KiBGZXRjaCB0aGUgZXh0ZXJuYWwgbGlzdHMgYW5kIGluaXRpYXRlIHRoZSB0ZXN0c1xuXHQqL1xuXHRmdW5jdGlvbiBmZXRjaFJlbW90ZUxpc3RzKCl7XG5cdFx0dmFyIGksIHVybDtcblx0XHR2YXIgb3B0cyA9IF9vcHRpb25zO1xuXG5cdFx0Zm9yKGk9MDtpPG9wdHMuYmxvY2tMaXN0cy5sZW5ndGg7aSsrKXtcblx0XHRcdHVybCA9IG9wdHMuYmxvY2tMaXN0c1tpXTtcblx0XHRcdGxvYWRFeGVjdXRlVXJsKHVybCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY2FuY2VsUmVtb3RlRG93bmxvYWRzKCl7XG5cdFx0dmFyIGksIGFqO1xuXG5cdFx0Zm9yKGk9YWpheERvd25sb2Fkcy5sZW5ndGgtMTtpID49IDA7aS0tKXtcblx0XHRcdGFqID0gYWpheERvd25sb2Fkcy5wb3AoKTtcblx0XHRcdGFqLmFib3J0KCk7XG5cdFx0fVxuXHR9XG5cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvKipcblx0KiBCZWdpbiBleGVjdXRpb24gb2YgdGhlIHRlc3Rcblx0Ki9cblx0ZnVuY3Rpb24gYmVnaW5UZXN0KGJhaXQpe1xuXHRcdGxvZygnc3RhcnQgYmVnaW5UZXN0Jyk7XG5cdFx0aWYoZmluZFJlc3VsdCA9PSB0cnVlKXtcblx0XHRcdHJldHVybjsgLy8gd2UgZm91bmQgaXQuIGRvbid0IGNvbnRpbnVlIGV4ZWN1dGluZ1xuXHRcdH1cblx0XHR0ZXN0RXhlY3V0aW5nID0gdHJ1ZTtcblx0XHRjYXN0QmFpdChiYWl0KTtcblxuXHRcdGV4ZVJlc3VsdC5xdWljayA9ICd0ZXN0aW5nJztcblxuXHRcdHRpbWVySWRzLnRlc3QgPSBzZXRUaW1lb3V0KFxuXHRcdFx0ZnVuY3Rpb24oKXsgcmVlbEluKGJhaXQsIDEpOyB9LFxuXHRcdFx0NSk7XG5cdH1cblxuXHQvKipcblx0KiBDcmVhdGUgdGhlIGJhaXQgbm9kZSB0byBzZWUgaG93IHRoZSBicm93c2VyIHBhZ2UgcmVhY3RzXG5cdCovXG5cdGZ1bmN0aW9uIGNhc3RCYWl0KGJhaXQpe1xuXHRcdHZhciBpLCBkID0gZG9jdW1lbnQsIGIgPSBkLmJvZHk7XG5cdFx0dmFyIHQ7XG5cdFx0dmFyIGJhaXRTdHlsZSA9ICd3aWR0aDogMXB4ICFpbXBvcnRhbnQ7IGhlaWdodDogMXB4ICFpbXBvcnRhbnQ7IHBvc2l0aW9uOiBhYnNvbHV0ZSAhaW1wb3J0YW50OyBsZWZ0OiAtMTAwMDBweCAhaW1wb3J0YW50OyB0b3A6IC0xMDAwcHggIWltcG9ydGFudDsnXG5cblx0XHRpZihiYWl0ID09IG51bGwgfHwgdHlwZW9mKGJhaXQpID09ICdzdHJpbmcnKXtcblx0XHRcdGxvZygnaW52YWxpZCBiYWl0IGJlaW5nIGNhc3QnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZihiYWl0LnN0eWxlICE9IG51bGwpe1xuXHRcdFx0YmFpdFN0eWxlICs9IGJhaXQuc3R5bGU7XG5cdFx0fVxuXG5cdFx0YmFpdE5vZGUgPSBtYWtlRWwoJ2RpdicsIHtcblx0XHRcdCdjbGFzcyc6IGJhaXQuY3NzQ2xhc3MsXG5cdFx0XHQnc3R5bGUnOiBiYWl0U3R5bGVcblx0XHR9KTtcblxuXHRcdGxvZygnYWRkaW5nIGJhaXQgbm9kZSB0byBET00nKTtcblxuXHRcdGIuYXBwZW5kQ2hpbGQoYmFpdE5vZGUpO1xuXG5cdFx0Ly8gdG91Y2ggdGhlc2UgcHJvcGVydGllc1xuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMubnVsbFByb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0dCA9IGJhaXROb2RlW2JhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV1dO1xuXHRcdH1cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLnplcm9Qcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdHQgPSBiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMuemVyb1Byb3BzW2ldXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBSdW4gdGVzdHMgdG8gc2VlIGlmIGJyb3dzZXIgaGFzIHRha2VuIHRoZSBiYWl0IGFuZCBibG9ja2VkIHRoZSBiYWl0IGVsZW1lbnRcblx0Ki9cblx0ZnVuY3Rpb24gcmVlbEluKGJhaXQsIGF0dGVtcHROdW0pe1xuXHRcdHZhciBpLCBrLCB2O1xuXHRcdHZhciBib2R5ID0gZG9jdW1lbnQuYm9keTtcblx0XHR2YXIgZm91bmQgPSBmYWxzZTtcblxuXHRcdGlmKGJhaXROb2RlID09IG51bGwpe1xuXHRcdFx0bG9nKCdyZWNhc3QgYmFpdCcpO1xuXHRcdFx0Y2FzdEJhaXQoYmFpdCB8fCBxdWlja0JhaXQpO1xuXHRcdH1cblxuXHRcdGlmKHR5cGVvZihiYWl0KSA9PSAnc3RyaW5nJyl7XG5cdFx0XHRsb2coJ2ludmFsaWQgYmFpdCB1c2VkJywgdHJ1ZSk7XG5cdFx0XHRpZihjbGVhckJhaXROb2RlKCkpe1xuXHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0dGVzdEV4ZWN1dGluZyA9IGZhbHNlO1xuXHRcdFx0XHR9LCA1KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmKHRpbWVySWRzLnRlc3QgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy50ZXN0KTtcblx0XHRcdHRpbWVySWRzLnRlc3QgPSAwO1xuXHRcdH1cblxuXHRcdC8vIHRlc3QgZm9yIGlzc3Vlc1xuXG5cdFx0aWYoYm9keS5nZXRBdHRyaWJ1dGUoJ2FicCcpICE9PSBudWxsKXtcblx0XHRcdGxvZygnZm91bmQgYWRibG9jayBib2R5IGF0dHJpYnV0ZScpO1xuXHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMubnVsbFByb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0aWYoYmFpdE5vZGVbYmFpdFRyaWdnZXJzLm51bGxQcm9wc1tpXV0gPT0gbnVsbCl7XG5cdFx0XHRcdGlmKGF0dGVtcHROdW0+NClcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgbnVsbCBhdHRyOiAnICsgYmFpdFRyaWdnZXJzLm51bGxQcm9wc1tpXSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYoZm91bmQgPT0gdHJ1ZSl7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvcihpPTA7aTxiYWl0VHJpZ2dlcnMuemVyb1Byb3BzLmxlbmd0aDtpKyspe1xuXHRcdFx0aWYoZm91bmQgPT0gdHJ1ZSl7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYoYmFpdE5vZGVbYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXV0gPT0gMCl7XG5cdFx0XHRcdGlmKGF0dGVtcHROdW0+NClcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgemVybyBhdHRyOiAnICsgYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYod2luZG93LmdldENvbXB1dGVkU3R5bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFyIGJhaXRUZW1wID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoYmFpdE5vZGUsIG51bGwpO1xuXHRcdFx0aWYoYmFpdFRlbXAuZ2V0UHJvcGVydHlWYWx1ZSgnZGlzcGxheScpID09ICdub25lJ1xuXHRcdFx0fHwgYmFpdFRlbXAuZ2V0UHJvcGVydHlWYWx1ZSgndmlzaWJpbGl0eScpID09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdGlmKGF0dGVtcHROdW0+NClcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgY29tcHV0ZWRTdHlsZSBpbmRpY2F0b3InKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0ZWRPbmNlID0gdHJ1ZTtcblxuXHRcdGlmKGZvdW5kIHx8IGF0dGVtcHROdW0rKyA+PSBfb3B0aW9ucy5tYXhMb29wKXtcblx0XHRcdGZpbmRSZXN1bHQgPSBmb3VuZDtcblx0XHRcdGxvZygnZXhpdGluZyB0ZXN0IGxvb3AgLSB2YWx1ZTogJyArIGZpbmRSZXN1bHQpO1xuXHRcdFx0bm90aWZ5TGlzdGVuZXJzKCk7XG5cdFx0XHRpZihjbGVhckJhaXROb2RlKCkpe1xuXHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0dGVzdEV4ZWN1dGluZyA9IGZhbHNlO1xuXHRcdFx0XHR9LCA1KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZXtcblx0XHRcdHRpbWVySWRzLnRlc3QgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdHJlZWxJbihiYWl0LCBhdHRlbXB0TnVtKTtcblx0XHRcdH0sIF9vcHRpb25zLmxvb3BEZWxheSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY2xlYXJCYWl0Tm9kZSgpe1xuXHRcdGlmKGJhaXROb2RlID09PSBudWxsKXtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRyeXtcblx0XHRcdGlmKGlzRnVuYyhiYWl0Tm9kZS5yZW1vdmUpKXtcblx0XHRcdFx0YmFpdE5vZGUucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0XHRkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGJhaXROb2RlKTtcblx0XHR9XG5cdFx0Y2F0Y2goZXgpe1xuXHRcdH1cblx0XHRiYWl0Tm9kZSA9IG51bGw7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQqIEhhbHQgdGhlIHRlc3QgYW5kIGFueSBwZW5kaW5nIHRpbWVvdXRzXG5cdCovXG5cdGZ1bmN0aW9uIHN0b3BGaXNoaW5nKCl7XG5cdFx0aWYodGltZXJJZHMudGVzdCA+IDApe1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVySWRzLnRlc3QpO1xuXHRcdH1cblx0XHRpZih0aW1lcklkcy5kb3dubG9hZCA+IDApe1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVySWRzLmRvd25sb2FkKTtcblx0XHR9XG5cblx0XHRjYW5jZWxSZW1vdGVEb3dubG9hZHMoKTtcblxuXHRcdGNsZWFyQmFpdE5vZGUoKTtcblx0fVxuXG5cdC8qKlxuXHQqIEZpcmUgYWxsIHJlZ2lzdGVyZWQgbGlzdGVuZXJzXG5cdCovXG5cdGZ1bmN0aW9uIG5vdGlmeUxpc3RlbmVycygpe1xuXHRcdHZhciBpLCBmdW5jcztcblx0XHRpZihmaW5kUmVzdWx0ID09PSBudWxsKXtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yKGk9MDtpPGxpc3RlbmVycy5sZW5ndGg7aSsrKXtcblx0XHRcdGZ1bmNzID0gbGlzdGVuZXJzW2ldO1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHRpZihmdW5jcyAhPSBudWxsKXtcblx0XHRcdFx0XHRpZihpc0Z1bmMoZnVuY3NbJ2NvbXBsZXRlJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydjb21wbGV0ZSddKGZpbmRSZXN1bHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmKGZpbmRSZXN1bHQgJiYgaXNGdW5jKGZ1bmNzWydmb3VuZCddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snZm91bmQnXSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIGlmKGZpbmRSZXN1bHQgPT09IGZhbHNlICYmIGlzRnVuYyhmdW5jc1snbm90Zm91bmQnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ25vdGZvdW5kJ10oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0bG9nKCdGYWlsdXJlIGluIG5vdGlmeSBsaXN0ZW5lcnMgJyArIGV4Lk1lc3NhZ2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQqIEF0dGFjaGVzIGV2ZW50IGxpc3RlbmVyIG9yIGZpcmVzIGlmIGV2ZW50cyBoYXZlIGFscmVhZHkgcGFzc2VkLlxuXHQqL1xuXHRmdW5jdGlvbiBhdHRhY2hPckZpcmUoKXtcblx0XHR2YXIgZmlyZU5vdyA9IGZhbHNlO1xuXHRcdHZhciBmbjtcblxuXHRcdGlmKGRvY3VtZW50LnJlYWR5U3RhdGUpe1xuXHRcdFx0aWYoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PSAnY29tcGxldGUnKXtcblx0XHRcdFx0ZmlyZU5vdyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm4gPSBmdW5jdGlvbigpe1xuXHRcdFx0YmVnaW5UZXN0KHF1aWNrQmFpdCwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdGlmKGZpcmVOb3cpe1xuXHRcdFx0Zm4oKTtcblx0XHR9XG5cdFx0ZWxzZXtcblx0XHRcdGF0dGFjaEV2ZW50TGlzdGVuZXIod2luLCAnbG9hZCcsIGZuKTtcblx0XHR9XG5cdH1cblxuXG5cdHZhciBibG9ja0xpc3RzOyAvLyB0cmFja3MgZXh0ZXJuYWwgYmxvY2sgbGlzdHNcblxuXHQvKipcblx0KiBQdWJsaWMgaW50ZXJmYWNlIG9mIGFkYmxvY2sgZGV0ZWN0b3Jcblx0Ki9cblx0dmFyIGltcGwgPSB7XG5cdFx0LyoqXG5cdFx0KiBWZXJzaW9uIG9mIHRoZSBhZGJsb2NrIGRldGVjdG9yIHBhY2thZ2Vcblx0XHQqL1xuXHRcdHZlcnNpb246IHZlcnNpb24sXG5cblx0XHQvKipcblx0XHQqIEluaXRpYWxpemF0aW9uIGZ1bmN0aW9uLiBTZWUgY29tbWVudHMgYXQgdG9wIGZvciBvcHRpb25zIG9iamVjdFxuXHRcdCovXG5cdFx0aW5pdDogZnVuY3Rpb24ob3B0aW9ucyl7XG5cdFx0XHR2YXIgaywgdiwgZnVuY3M7XG5cblx0XHRcdGlmKCFvcHRpb25zKXtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jcyA9IHtcblx0XHRcdFx0Y29tcGxldGU6IG5vb3AsXG5cdFx0XHRcdGZvdW5kOiBub29wLFxuXHRcdFx0XHRub3Rmb3VuZDogbm9vcFxuXHRcdFx0fTtcblxuXHRcdFx0Zm9yKGsgaW4gb3B0aW9ucyl7XG5cdFx0XHRcdGlmKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaykpe1xuXHRcdFx0XHRcdGlmKGsgPT0gJ2NvbXBsZXRlJyB8fCBrID09ICdmb3VuZCcgfHwgayA9PSAnbm90Rm91bmQnKXtcblx0XHRcdFx0XHRcdGZ1bmNzW2sudG9Mb3dlckNhc2UoKV0gPSBvcHRpb25zW2tdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNle1xuXHRcdFx0XHRcdFx0X29wdGlvbnNba10gPSBvcHRpb25zW2tdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsaXN0ZW5lcnMucHVzaChmdW5jcyk7XG5cblx0XHRcdGJsb2NrTGlzdHMgPSBuZXcgQmxvY2tMaXN0VHJhY2tlcigpO1xuXG5cdFx0XHRhdHRhY2hPckZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHR3aW5bJ2FkYmxvY2tEZXRlY3RvciddID0gaW1wbDtcblxufSkod2luZG93KVxuIiwiLyohXG4gKiBAcHJlc2VydmVcbiAqIGpxdWVyeS5zY3JvbGxkZXB0aC5qcyB8IHYxLjBcbiAqIENvcHlyaWdodCAoYykgMjAxNiBSb2IgRmxhaGVydHkgKEByb2JmbGFoZXJ0eSlcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgYW5kIEdQTCBsaWNlbnNlcy5cbiAqL1xuIWZ1bmN0aW9uKGUpe1wiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZD9kZWZpbmUoW1wianF1ZXJ5XCJdLGUpOlwib2JqZWN0XCI9PXR5cGVvZiBtb2R1bGUmJm1vZHVsZS5leHBvcnRzP21vZHVsZS5leHBvcnRzPWUocmVxdWlyZShcImpxdWVyeVwiKSk6ZShqUXVlcnkpfShmdW5jdGlvbihlKXtcInVzZSBzdHJpY3RcIjt2YXIgbix0LHIsbyxpPXttaW5IZWlnaHQ6MCxlbGVtZW50czpbXSxwZXJjZW50YWdlOiEwLHVzZXJUaW1pbmc6ITAscGl4ZWxEZXB0aDohMCxub25JbnRlcmFjdGlvbjohMCxnYUdsb2JhbDohMSxndG1PdmVycmlkZTohMSx0cmFja2VyTmFtZTohMSxkYXRhTGF5ZXI6XCJkYXRhTGF5ZXJcIn0sYT1lKHdpbmRvdyksbD1bXSxjPSExLHU9MDtyZXR1cm4gZS5zY3JvbGxEZXB0aD1mdW5jdGlvbihwKXtmdW5jdGlvbiBzKGUsaSxhLGwpe3ZhciBjPXAudHJhY2tlck5hbWU/cC50cmFja2VyTmFtZStcIi5zZW5kXCI6XCJzZW5kXCI7bz8obyh7ZXZlbnQ6XCJTY3JvbGxEaXN0YW5jZVwiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjplLGV2ZW50TGFiZWw6aSxldmVudFZhbHVlOjEsZXZlbnROb25JbnRlcmFjdGlvbjpwLm5vbkludGVyYWN0aW9ufSkscC5waXhlbERlcHRoJiZhcmd1bWVudHMubGVuZ3RoPjImJmE+dSYmKHU9YSxvKHtldmVudDpcIlNjcm9sbERpc3RhbmNlXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOlwiUGl4ZWwgRGVwdGhcIixldmVudExhYmVsOmQoYSksZXZlbnRWYWx1ZToxLGV2ZW50Tm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pKSxwLnVzZXJUaW1pbmcmJmFyZ3VtZW50cy5sZW5ndGg+MyYmbyh7ZXZlbnQ6XCJTY3JvbGxUaW1pbmdcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246ZSxldmVudExhYmVsOmksZXZlbnRUaW1pbmc6bH0pKToobiYmKHdpbmRvd1tyXShjLFwiZXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLGUsaSwxLHtub25JbnRlcmFjdGlvbjpwLm5vbkludGVyYWN0aW9ufSkscC5waXhlbERlcHRoJiZhcmd1bWVudHMubGVuZ3RoPjImJmE+dSYmKHU9YSx3aW5kb3dbcl0oYyxcImV2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixcIlBpeGVsIERlcHRoXCIsZChhKSwxLHtub25JbnRlcmFjdGlvbjpwLm5vbkludGVyYWN0aW9ufSkpLHAudXNlclRpbWluZyYmYXJndW1lbnRzLmxlbmd0aD4zJiZ3aW5kb3dbcl0oYyxcInRpbWluZ1wiLFwiU2Nyb2xsIERlcHRoXCIsZSxsLGkpKSx0JiYoX2dhcS5wdXNoKFtcIl90cmFja0V2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixlLGksMSxwLm5vbkludGVyYWN0aW9uXSkscC5waXhlbERlcHRoJiZhcmd1bWVudHMubGVuZ3RoPjImJmE+dSYmKHU9YSxfZ2FxLnB1c2goW1wiX3RyYWNrRXZlbnRcIixcIlNjcm9sbCBEZXB0aFwiLFwiUGl4ZWwgRGVwdGhcIixkKGEpLDEscC5ub25JbnRlcmFjdGlvbl0pKSxwLnVzZXJUaW1pbmcmJmFyZ3VtZW50cy5sZW5ndGg+MyYmX2dhcS5wdXNoKFtcIl90cmFja1RpbWluZ1wiLFwiU2Nyb2xsIERlcHRoXCIsZSxsLGksMTAwXSkpKX1mdW5jdGlvbiBoKGUpe3JldHVybntcIjI1JVwiOnBhcnNlSW50KC4yNSplLDEwKSxcIjUwJVwiOnBhcnNlSW50KC41KmUsMTApLFwiNzUlXCI6cGFyc2VJbnQoLjc1KmUsMTApLFwiMTAwJVwiOmUtNX19ZnVuY3Rpb24gZyhuLHQscil7ZS5lYWNoKG4sZnVuY3Rpb24obixvKXstMT09PWUuaW5BcnJheShuLGwpJiZ0Pj1vJiYocyhcIlBlcmNlbnRhZ2VcIixuLHQsciksbC5wdXNoKG4pKX0pfWZ1bmN0aW9uIGYobix0LHIpe2UuZWFjaChuLGZ1bmN0aW9uKG4sbyl7LTE9PT1lLmluQXJyYXkobyxsKSYmZShvKS5sZW5ndGgmJnQ+PWUobykub2Zmc2V0KCkudG9wJiYocyhcIkVsZW1lbnRzXCIsbyx0LHIpLGwucHVzaChvKSl9KX1mdW5jdGlvbiBkKGUpe3JldHVybigyNTAqTWF0aC5mbG9vcihlLzI1MCkpLnRvU3RyaW5nKCl9ZnVuY3Rpb24gbSgpe3koKX1mdW5jdGlvbiB2KGUsbil7dmFyIHQscixvLGk9bnVsbCxhPTAsbD1mdW5jdGlvbigpe2E9bmV3IERhdGUsaT1udWxsLG89ZS5hcHBseSh0LHIpfTtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgYz1uZXcgRGF0ZTthfHwoYT1jKTt2YXIgdT1uLShjLWEpO3JldHVybiB0PXRoaXMscj1hcmd1bWVudHMsMD49dT8oY2xlYXJUaW1lb3V0KGkpLGk9bnVsbCxhPWMsbz1lLmFwcGx5KHQscikpOml8fChpPXNldFRpbWVvdXQobCx1KSksb319ZnVuY3Rpb24geSgpe2M9ITAsYS5vbihcInNjcm9sbC5zY3JvbGxEZXB0aFwiLHYoZnVuY3Rpb24oKXt2YXIgbj1lKGRvY3VtZW50KS5oZWlnaHQoKSx0PXdpbmRvdy5pbm5lckhlaWdodD93aW5kb3cuaW5uZXJIZWlnaHQ6YS5oZWlnaHQoKSxyPWEuc2Nyb2xsVG9wKCkrdCxvPWgobiksaT0rbmV3IERhdGUtRDtyZXR1cm4gbC5sZW5ndGg+PXAuZWxlbWVudHMubGVuZ3RoKyhwLnBlcmNlbnRhZ2U/NDowKT8oYS5vZmYoXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIiksdm9pZChjPSExKSk6KHAuZWxlbWVudHMmJmYocC5lbGVtZW50cyxyLGkpLHZvaWQocC5wZXJjZW50YWdlJiZnKG8scixpKSkpfSw1MDApKX12YXIgRD0rbmV3IERhdGU7cD1lLmV4dGVuZCh7fSxpLHApLGUoZG9jdW1lbnQpLmhlaWdodCgpPHAubWluSGVpZ2h0fHwocC5nYUdsb2JhbD8obj0hMCxyPXAuZ2FHbG9iYWwpOlwiZnVuY3Rpb25cIj09dHlwZW9mIGdhPyhuPSEwLHI9XCJnYVwiKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBfX2dhVHJhY2tlciYmKG49ITAscj1cIl9fZ2FUcmFja2VyXCIpLFwidW5kZWZpbmVkXCIhPXR5cGVvZiBfZ2FxJiZcImZ1bmN0aW9uXCI9PXR5cGVvZiBfZ2FxLnB1c2gmJih0PSEwKSxcImZ1bmN0aW9uXCI9PXR5cGVvZiBwLmV2ZW50SGFuZGxlcj9vPXAuZXZlbnRIYW5kbGVyOlwidW5kZWZpbmVkXCI9PXR5cGVvZiB3aW5kb3dbcC5kYXRhTGF5ZXJdfHxcImZ1bmN0aW9uXCIhPXR5cGVvZiB3aW5kb3dbcC5kYXRhTGF5ZXJdLnB1c2h8fHAuZ3RtT3ZlcnJpZGV8fChvPWZ1bmN0aW9uKGUpe3dpbmRvd1twLmRhdGFMYXllcl0ucHVzaChlKX0pLGUuc2Nyb2xsRGVwdGgucmVzZXQ9ZnVuY3Rpb24oKXtsPVtdLHU9MCxhLm9mZihcInNjcm9sbC5zY3JvbGxEZXB0aFwiKSx5KCl9LGUuc2Nyb2xsRGVwdGguYWRkRWxlbWVudHM9ZnVuY3Rpb24obil7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIG4mJmUuaXNBcnJheShuKSYmKGUubWVyZ2UocC5lbGVtZW50cyxuKSxjfHx5KCkpfSxlLnNjcm9sbERlcHRoLnJlbW92ZUVsZW1lbnRzPWZ1bmN0aW9uKG4pe1widW5kZWZpbmVkXCIhPXR5cGVvZiBuJiZlLmlzQXJyYXkobikmJmUuZWFjaChuLGZ1bmN0aW9uKG4sdCl7dmFyIHI9ZS5pbkFycmF5KHQscC5lbGVtZW50cyksbz1lLmluQXJyYXkodCxsKTstMSE9ciYmcC5lbGVtZW50cy5zcGxpY2UociwxKSwtMSE9byYmbC5zcGxpY2UobywxKX0pfSxtKCkpfSxlLnNjcm9sbERlcHRofSk7XG4iLCIoIGZ1bmN0aW9uKCAkICkge1xuXG5cdC8qXG5cdCAqIENyZWF0ZSBhIEdvb2dsZSBBbmFseXRpY3MgZXZlbnRcblx0ICogY2F0ZWdvcnk6IEV2ZW50IENhdGVnb3J5XG5cdCAqIGxhYmVsOiBFdmVudCBMYWJlbFxuXHQgKiBhY3Rpb246IEV2ZW50IEFjdGlvblxuXHQgKiB2YWx1ZTogb3B0aW9uYWxcblx0Ki9cblx0ZnVuY3Rpb24gd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCwgdmFsdWUgKSB7XG5cdFx0aWYgKCB0eXBlb2YgZ2EgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0aWYgKCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHRnYSggJ3NlbmQnLCB0eXBlLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB3cF9hbmFseXRpY3NfdHJhY2tpbmdfc2V0dXAoKSB7XG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyApIHtcblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwuZW5hYmxlZCApIHtcblx0XHRcdFx0Y29uc29sZS5sb2coICdzdGFydCBzY3JvbGwgdHJhY2snICk7XG5cdFx0XHRcdGpRdWVyeS5zY3JvbGxEZXB0aChhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmVuYWJsZWQgKSB7XG5cblx0XHRcdFx0Ly8gZXh0ZXJuYWwgbGlua3Ncblx0XHRcdFx0JCggJ2FbaHJlZl49XCJodHRwXCJdOm5vdChbaHJlZio9XCI6Ly8nICsgZG9jdW1lbnQuZG9tYWluICsgJ1wiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnT3V0Ym91bmQgbGlua3MnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gbWFpbHRvIGxpbmtzXG5cdFx0XHRcdCQoICdhW2hyZWZePVwibWFpbHRvXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ01haWxzJywgJ0NsaWNrJywgdGhpcy5ocmVmLnN1YnN0cmluZyggNyApICk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIHRlbCBsaW5rc1xuXHRcdFx0XHQkKCAnYVtocmVmXj1cInRlbFwiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdUZWxlcGhvbmUnLCAnQ2FsbCcsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBpbnRlcm5hbCBsaW5rc1xuXHRcdFx0XHQkKCAnYTpub3QoW2hyZWZePVwiKGh0dHA6fGh0dHBzOik/Ly9cIl0sW2hyZWZePVwiI1wiXSxbaHJlZl49XCJtYWlsdG86XCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0XHQvLyB0cmFjayBkb3dubG9hZHNcblx0XHRcdFx0XHRpZiAoICcnICE9PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCApIHtcblx0XHRcdFx0XHRcdHZhciB1cmwgPSB0aGlzLmhyZWY7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZCA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdFx0dmFyIGlzRG93bmxvYWQgPSBjaGVja0Rvd25sb2FkLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0Rvd25sb2FkICkge1xuXHRcdFx0XHRcdFx0XHR2YXIgY2hlY2tEb3dubG9hZEV4dGVuc2lvbiA9IG5ldyBSZWdFeHAoXCJcXFxcLihcIiArIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICsgXCIpKFtcXD8jXS4qKT8kXCIsIFwiaVwiKTtcblx0XHRcdFx0XHRcdFx0dmFyIGV4dGVuc2lvblJlc3VsdCA9IGNoZWNrRG93bmxvYWRFeHRlbnNpb24uZXhlYyggdXJsICk7XG5cdFx0XHRcdFx0XHRcdHZhciBleHRlbnNpb24gPSAnJztcblx0XHRcdFx0XHRcdFx0aWYgKCBudWxsICE9PSBleHRlbnNpb25SZXN1bHQgKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uUmVzdWx0WzFdO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvblJlc3VsdDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvLyB3ZSBjYW4ndCB1c2UgdGhlIHVybCBmb3IgdGhlIHZhbHVlIGhlcmUsIGV2ZW4gdGhvdWdoIHRoYXQgd291bGQgYmUgbmljZSwgYmVjYXVzZSB2YWx1ZSBpcyBzdXBwb3NlZCB0byBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0Rvd25sb2FkcycsIGV4dGVuc2lvbiwgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9XG5cblx0XHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuZW5hYmxlZCApIHtcblx0XHRcdFx0Ly8gYW55IGxpbmsgY291bGQgYmUgYW4gYWZmaWxpYXRlLCBpIGd1ZXNzP1xuXHRcdFx0XHQkKCAnYScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0XHQvLyB0cmFjayBhZmZpbGlhdGVzXG5cdFx0XHRcdFx0aWYgKCAnJyAhPT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKSB7XG5cdFx0XHRcdFx0XHR2YXIgY2hlY2tBZmZpbGlhdGUgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmFmZmlsaWF0ZS5hZmZpbGlhdGVfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHRcdHZhciBpc0FmZmlsaWF0ZSA9IGNoZWNrQWZmaWxpYXRlLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0FmZmlsaWF0ZSApIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWZmaWxpYXRlJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBsaW5rIGZyYWdtZW50cyBhcyBwYWdldmlld3Ncblx0XHRcdC8vIGRvZXMgbm90IHVzZSB0aGUgZXZlbnQgdHJhY2tpbmcgbWV0aG9kXG5cdFx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50ICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudC5lbmFibGVkICkge1xuXHRcdFx0XHRpZiAoIHR5cGVvZiBnYSAhPT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdFx0d2luZG93Lm9uaGFzaGNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Z2EoICdzZW5kJywgJ3BhZ2V2aWV3JywgbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBsb2NhdGlvbi5oYXNoICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGJhc2ljIGZvcm0gc3VibWl0c1xuXHRcdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mb3JtX3N1Ym1pc3Npb25zICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mb3JtX3N1Ym1pc3Npb25zLmVuYWJsZWQgKSB7XG5cdFx0XHRcdCQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5jbGljayggZnVuY3Rpb24oIGYgKSB7XG5cdFx0ICAgICAgICAgICAgdmFyIGNhdGVnb3J5ID0gJCggdGhpcyApLmRhdGEoICdnYS1jYXRlZ29yeScgKSB8fCAnRm9ybSc7XG5cdFx0ICAgICAgICAgICAgdmFyIGFjdGlvbiA9ICQoIHRoaXMgKS5kYXRhKCAnZ2EtYWN0aW9uJyApIHx8ICdTdWJtaXQnO1xuXHRcdCAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoIHRoaXMgKS5kYXRhKCAnZ2EtbGFiZWwnICkgfHwgdGhpcy5uYW1lIHx8IHRoaXMudmFsdWU7XG5cdFx0ICAgICAgICAgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCBjYXRlZ29yeSwgYWN0aW9uLCBsYWJlbCApO1xuXHRcdCAgICAgICAgfSk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5sb2coICdubyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MnICk7XG5cdFx0fVxuXHR9XG5cblx0JCggZG9jdW1lbnQgKS5yZWFkeSggZnVuY3Rpb24oKSB7XG5cdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX3NldHVwKCk7XG5cdFx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy50cmFja19hZGJsb2NrZXIgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnRyYWNrX2FkYmxvY2tlci5lbmFibGVkICkge1xuXHRcdFx0aWYgKCB0eXBlb2Ygd2luZG93LmFkYmxvY2tEZXRlY3RvciA9PT0gJ3VuZGVmaW5lZCcgKSB7XG5cdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT24nLCB7ICdub25JbnRlcmFjdGlvbic6IDEgfSApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d2luZG93LmFkYmxvY2tEZXRlY3Rvci5pbml0KFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGRlYnVnOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZvdW5kOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPbicsIHsgJ25vbkludGVyYWN0aW9uJzogMSB9ICk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bm90Rm91bmQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09mZicsIHsgJ25vbkludGVyYWN0aW9uJzogMSB9ICk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cbn0gKSggalF1ZXJ5ICk7XG4iXX0=
