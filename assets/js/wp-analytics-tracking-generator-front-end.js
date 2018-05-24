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
		found: noop, // function to fire when adblock detected
		notfound: noop, // function to fire if adblock not detected after testing
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
					obj.format = 'easylist';
					// parseEasyList(data);
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

	baitTriggers.zeroProps = [ofs + 'Height', ofs + 'Left', ofs + 'Top', ofs + 'Width', ofs + 'Height', cl + 'Height', cl + 'Width'];

	// result object
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

		blockLists.addUrl(url);
		// setup call for remote list
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
	}

	// =============================================================================
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

		b.appendChild(baitNode);

		// touch these properties
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
		}

		// test for issues

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

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

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
      i = { minHeight: 0, elements: [], percentage: !0, userTiming: !0, pixelDepth: !0, nonInteraction: !0, gaGlobal: !1, gtmOverride: !1, trackerName: !1, dataLayer: "dataLayer" },
      a = e(window),
      l = [],
      c = !1,
      u = 0;return e.scrollDepth = function (p) {
    function s(e, i, a, l) {
      var c = p.trackerName ? p.trackerName + ".send" : "send";o ? (o({ event: "ScrollDistance", eventCategory: "Scroll Depth", eventAction: e, eventLabel: i, eventValue: 1, eventNonInteraction: p.nonInteraction }), p.pixelDepth && arguments.length > 2 && a > u && (u = a, o({ event: "ScrollDistance", eventCategory: "Scroll Depth", eventAction: "Pixel Depth", eventLabel: d(a), eventValue: 1, eventNonInteraction: p.nonInteraction })), p.userTiming && arguments.length > 3 && o({ event: "ScrollTiming", eventCategory: "Scroll Depth", eventAction: e, eventLabel: i, eventTiming: l })) : (n && (window[r](c, "event", "Scroll Depth", e, i, 1, { nonInteraction: p.nonInteraction }), p.pixelDepth && arguments.length > 2 && a > u && (u = a, window[r](c, "event", "Scroll Depth", "Pixel Depth", d(a), 1, { nonInteraction: p.nonInteraction })), p.userTiming && arguments.length > 3 && window[r](c, "timing", "Scroll Depth", e, l, i)), t && (_gaq.push(["_trackEvent", "Scroll Depth", e, i, 1, p.nonInteraction]), p.pixelDepth && arguments.length > 2 && a > u && (u = a, _gaq.push(["_trackEvent", "Scroll Depth", "Pixel Depth", d(a), 1, p.nonInteraction])), p.userTiming && arguments.length > 3 && _gaq.push(["_trackTiming", "Scroll Depth", e, l, i, 100])));
    }function h(e) {
      return { "25%": parseInt(.25 * e, 10), "50%": parseInt(.5 * e, 10), "75%": parseInt(.75 * e, 10), "100%": e - 5 };
    }function g(n, t, r) {
      e.each(n, function (n, o) {
        -1 === e.inArray(n, l) && t >= o && (s("Percentage", n, t, r), l.push(n));
      });
    }function f(n, t, r) {
      e.each(n, function (n, o) {
        -1 === e.inArray(o, l) && e(o).length && t >= e(o).offset().top && (s("Elements", o, t, r), l.push(o));
      });
    }function d(e) {
      return (250 * Math.floor(e / 250)).toString();
    }function m() {
      y();
    }function v(e, n) {
      var t,
          r,
          o,
          i = null,
          a = 0,
          l = function l() {
        a = new Date(), i = null, o = e.apply(t, r);
      };return function () {
        var c = new Date();a || (a = c);var u = n - (c - a);return t = this, r = arguments, 0 >= u ? (clearTimeout(i), i = null, a = c, o = e.apply(t, r)) : i || (i = setTimeout(l, u)), o;
      };
    }function y() {
      c = !0, a.on("scroll.scrollDepth", v(function () {
        var n = e(document).height(),
            t = window.innerHeight ? window.innerHeight : a.height(),
            r = a.scrollTop() + t,
            o = h(n),
            i = +new Date() - D;return l.length >= p.elements.length + (p.percentage ? 4 : 0) ? (a.off("scroll.scrollDepth"), void (c = !1)) : (p.elements && f(p.elements, r, i), void (p.percentage && g(o, r, i)));
      }, 500));
    }var D = +new Date();p = e.extend({}, i, p), e(document).height() < p.minHeight || (p.gaGlobal ? (n = !0, r = p.gaGlobal) : "function" == typeof ga ? (n = !0, r = "ga") : "function" == typeof __gaTracker && (n = !0, r = "__gaTracker"), "undefined" != typeof _gaq && "function" == typeof _gaq.push && (t = !0), "function" == typeof p.eventHandler ? o = p.eventHandler : "undefined" == typeof window[p.dataLayer] || "function" != typeof window[p.dataLayer].push || p.gtmOverride || (o = function o(e) {
      window[p.dataLayer].push(e);
    }), e.scrollDepth.reset = function () {
      l = [], u = 0, a.off("scroll.scrollDepth"), y();
    }, e.scrollDepth.addElements = function (n) {
      "undefined" != typeof n && e.isArray(n) && (e.merge(p.elements, n), c || y());
    }, e.scrollDepth.removeElements = function (n) {
      "undefined" != typeof n && e.isArray(n) && e.each(n, function (n, t) {
        var r = e.inArray(t, p.elements),
            o = e.inArray(t, l);-1 != r && p.elements.splice(r, 1), -1 != o && l.splice(o, 1);
      });
    }, m());
  }, e.scrollDepth;
});
'use strict';

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

	if ('undefined' !== typeof analytics_tracking_settings) {

		if ('undefined' !== typeof analytics_tracking_settings.scroll && true === analytics_tracking_settings.scroll.enabled) {
			$.scrollDepth({
				minHeight: analytics_tracking_settings.scroll.minimum_height,
				elements: analytics_tracking_settings.scroll.scroll_elements.split(', '),
				percentage: analytics_tracking_settings.scroll.percentage,
				userTiming: analytics_tracking_settings.scroll.user_timing,
				pixelDepth: analytics_tracking_settings.scroll.pixel_depth,
				nonInteraction: analytics_tracking_settings.scroll.non_interaction
			});
		}

		if ('undefined' !== typeof analytics_tracking_settings.special && true === analytics_tracking_settings.special.enabled) {

			// external links
			$('a[href^="http"]:not([href*="://' + document.domain + '"])').click(function () {
				wp_analytics_tracking_event('event', 'Outbound links', 'Click', this.href);
			});

			// mailto links
			$('a[href^="mailto"]').click(function () {
				wp_analytics_tracking_event('event', 'Mails', 'Click', this.href.substring(7));
			});

			// tel links
			$('a[href^="tel"]').click(function () {
				wp_analytics_tracking_event('event', 'Telephone', 'Call', this.href.substring(7));
			});

			// internal links
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
						}
						// we can't use the url for the value here, even though that would be nice, because value is supposed to be an integer
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
		}

		// link fragments as pageviews
		// does not use the event tracking method
		if ('undefined' !== typeof analytics_tracking_settings.fragment && true === analytics_tracking_settings.fragment.enabled) {
			if (typeof ga !== 'undefined') {
				window.onhashchange = function () {
					ga('send', 'pageview', location.pathname + location.search + location.hash);
				};
			}
		}

		// basic form submits
		if ('undefined' !== typeof analytics_tracking_settings.form_submissions && true === analytics_tracking_settings.form_submissions.enabled) {
			$('input[type="submit"], button[type="submit"]').click(function (f) {
				var category = $(this).data('ga-category') || 'Form';
				var action = $(this).data('ga-action') || 'Submit';
				var label = $(this).data('ga-label') || this.name || this.value;
				wp_analytics_tracking_event('event', category, action, label);
			});
		}
	}

	$(document).ready(function () {
		if ('undefined' !== typeof analytics_tracking_settings.track_adblocker && true === analytics_tracking_settings.track_adblocker.enabled) {
			if (typeof window.adblockDetector === 'undefined') {
				wp_analytics_tracking_event('event', 'Adblock', 'On', { 'nonInteraction': 1 });
			} else {
				window.adblockDetector.init({
					debug: false,
					found: function found() {
						wp_analytics_tracking_event('event', 'Adblock', 'On', { 'nonInteraction': 1 });
					},
					notFound: function notFound() {
						wp_analytics_tracking_event('event', 'Adblock', 'Off', { 'nonInteraction': 1 });
					}
				});
			}
		}
	});
})(jQuery);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFkYmxvY2tEZXRlY3Rvci5qcyIsImpxdWVyeS5zY3JvbGxkZXB0aC5taW4uanMiLCJ3cC1ldmVudC10cmFja2luZy5qcyJdLCJuYW1lcyI6WyJ3aW4iLCJ2ZXJzaW9uIiwib2ZzIiwiY2wiLCJub29wIiwidGVzdGVkT25jZSIsInRlc3RFeGVjdXRpbmciLCJpc09sZElFZXZlbnRzIiwiYWRkRXZlbnRMaXN0ZW5lciIsInVuZGVmaW5lZCIsIl9vcHRpb25zIiwibG9vcERlbGF5IiwibWF4TG9vcCIsImRlYnVnIiwiZm91bmQiLCJub3Rmb3VuZCIsImNvbXBsZXRlIiwicGFyc2VBc0pzb24iLCJkYXRhIiwicmVzdWx0IiwiZm5EYXRhIiwiSlNPTiIsInBhcnNlIiwiZXgiLCJGdW5jdGlvbiIsImxvZyIsIkFqYXhIZWxwZXIiLCJvcHRzIiwieGhyIiwiWE1MSHR0cFJlcXVlc3QiLCJzdWNjZXNzIiwiZmFpbCIsIm1lIiwibWV0aG9kIiwiYWJvcnQiLCJzdGF0ZUNoYW5nZSIsInZhbHMiLCJyZWFkeVN0YXRlIiwic3RhdHVzIiwicmVzcG9uc2UiLCJvbnJlYWR5c3RhdGVjaGFuZ2UiLCJzdGFydCIsIm9wZW4iLCJ1cmwiLCJzZW5kIiwiQmxvY2tMaXN0VHJhY2tlciIsImV4dGVybmFsQmxvY2tsaXN0RGF0YSIsImFkZFVybCIsInN0YXRlIiwiZm9ybWF0Iiwic2V0UmVzdWx0IiwidXJsS2V5Iiwib2JqIiwibGlzdGVuZXJzIiwiYmFpdE5vZGUiLCJxdWlja0JhaXQiLCJjc3NDbGFzcyIsImJhaXRUcmlnZ2VycyIsIm51bGxQcm9wcyIsInplcm9Qcm9wcyIsImV4ZVJlc3VsdCIsInF1aWNrIiwicmVtb3RlIiwiZmluZFJlc3VsdCIsInRpbWVySWRzIiwidGVzdCIsImRvd25sb2FkIiwiaXNGdW5jIiwiZm4iLCJtYWtlRWwiLCJ0YWciLCJhdHRyaWJ1dGVzIiwiayIsInYiLCJlbCIsImF0dHIiLCJkIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaGFzT3duUHJvcGVydHkiLCJzZXRBdHRyaWJ1dGUiLCJhdHRhY2hFdmVudExpc3RlbmVyIiwiZG9tIiwiZXZlbnROYW1lIiwiaGFuZGxlciIsImF0dGFjaEV2ZW50IiwibWVzc2FnZSIsImlzRXJyb3IiLCJjb25zb2xlIiwiZXJyb3IiLCJhamF4RG93bmxvYWRzIiwibG9hZEV4ZWN1dGVVcmwiLCJhamF4IiwiYmxvY2tMaXN0cyIsImludGVydmFsSWQiLCJyZXRyeUNvdW50IiwidHJ5RXhlY3V0ZVRlc3QiLCJsaXN0RGF0YSIsImJlZ2luVGVzdCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInB1c2giLCJmZXRjaFJlbW90ZUxpc3RzIiwiaSIsImxlbmd0aCIsImNhbmNlbFJlbW90ZURvd25sb2FkcyIsImFqIiwicG9wIiwiYmFpdCIsImNhc3RCYWl0Iiwic2V0VGltZW91dCIsInJlZWxJbiIsImIiLCJib2R5IiwidCIsImJhaXRTdHlsZSIsInN0eWxlIiwiYXBwZW5kQ2hpbGQiLCJhdHRlbXB0TnVtIiwiY2xlYXJCYWl0Tm9kZSIsImNsZWFyVGltZW91dCIsImdldEF0dHJpYnV0ZSIsIndpbmRvdyIsImdldENvbXB1dGVkU3R5bGUiLCJiYWl0VGVtcCIsImdldFByb3BlcnR5VmFsdWUiLCJub3RpZnlMaXN0ZW5lcnMiLCJyZW1vdmUiLCJyZW1vdmVDaGlsZCIsInN0b3BGaXNoaW5nIiwiZnVuY3MiLCJNZXNzYWdlIiwiYXR0YWNoT3JGaXJlIiwiZmlyZU5vdyIsImltcGwiLCJpbml0Iiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiZSIsImRlZmluZSIsImFtZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJyZXF1aXJlIiwialF1ZXJ5IiwibiIsInIiLCJvIiwibWluSGVpZ2h0IiwiZWxlbWVudHMiLCJwZXJjZW50YWdlIiwidXNlclRpbWluZyIsInBpeGVsRGVwdGgiLCJub25JbnRlcmFjdGlvbiIsImdhR2xvYmFsIiwiZ3RtT3ZlcnJpZGUiLCJ0cmFja2VyTmFtZSIsImRhdGFMYXllciIsImEiLCJsIiwiYyIsInUiLCJzY3JvbGxEZXB0aCIsInAiLCJzIiwiZXZlbnQiLCJldmVudENhdGVnb3J5IiwiZXZlbnRBY3Rpb24iLCJldmVudExhYmVsIiwiZXZlbnRWYWx1ZSIsImV2ZW50Tm9uSW50ZXJhY3Rpb24iLCJhcmd1bWVudHMiLCJldmVudFRpbWluZyIsIl9nYXEiLCJoIiwicGFyc2VJbnQiLCJnIiwiZWFjaCIsImluQXJyYXkiLCJmIiwib2Zmc2V0IiwidG9wIiwiTWF0aCIsImZsb29yIiwidG9TdHJpbmciLCJtIiwieSIsIkRhdGUiLCJhcHBseSIsIm9uIiwiaGVpZ2h0IiwiaW5uZXJIZWlnaHQiLCJzY3JvbGxUb3AiLCJEIiwib2ZmIiwiZXh0ZW5kIiwiZ2EiLCJfX2dhVHJhY2tlciIsImV2ZW50SGFuZGxlciIsInJlc2V0IiwiYWRkRWxlbWVudHMiLCJpc0FycmF5IiwibWVyZ2UiLCJyZW1vdmVFbGVtZW50cyIsInNwbGljZSIsIiQiLCJ3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQiLCJ0eXBlIiwiY2F0ZWdvcnkiLCJhY3Rpb24iLCJsYWJlbCIsInZhbHVlIiwiYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzIiwic2Nyb2xsIiwiZW5hYmxlZCIsIm1pbmltdW1faGVpZ2h0Iiwic2Nyb2xsX2VsZW1lbnRzIiwic3BsaXQiLCJ1c2VyX3RpbWluZyIsInBpeGVsX2RlcHRoIiwibm9uX2ludGVyYWN0aW9uIiwic3BlY2lhbCIsImRvbWFpbiIsImNsaWNrIiwiaHJlZiIsInN1YnN0cmluZyIsImRvd25sb2FkX3JlZ2V4IiwiY2hlY2tEb3dubG9hZCIsIlJlZ0V4cCIsImlzRG93bmxvYWQiLCJjaGVja0Rvd25sb2FkRXh0ZW5zaW9uIiwiZXh0ZW5zaW9uUmVzdWx0IiwiZXhlYyIsImV4dGVuc2lvbiIsImFmZmlsaWF0ZSIsImFmZmlsaWF0ZV9yZWdleCIsImNoZWNrQWZmaWxpYXRlIiwiaXNBZmZpbGlhdGUiLCJmcmFnbWVudCIsIm9uaGFzaGNoYW5nZSIsImxvY2F0aW9uIiwicGF0aG5hbWUiLCJzZWFyY2giLCJoYXNoIiwiZm9ybV9zdWJtaXNzaW9ucyIsIm5hbWUiLCJyZWFkeSIsInRyYWNrX2FkYmxvY2tlciIsImFkYmxvY2tEZXRlY3RvciIsIm5vdEZvdW5kIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBaUNBOztBQUNBLENBQUMsVUFBU0EsR0FBVCxFQUFjOztBQUVkLEtBQUlDLFVBQVUsS0FBZDs7QUFFQSxLQUFJQyxNQUFNLFFBQVY7QUFBQSxLQUFvQkMsS0FBSyxRQUF6QjtBQUNBLEtBQUlDLE9BQU8sU0FBUEEsSUFBTyxHQUFVLENBQUUsQ0FBdkI7O0FBRUEsS0FBSUMsYUFBYSxLQUFqQjtBQUNBLEtBQUlDLGdCQUFnQixLQUFwQjs7QUFFQSxLQUFJQyxnQkFBaUJQLElBQUlRLGdCQUFKLEtBQXlCQyxTQUE5Qzs7QUFFQTs7OztBQUlBLEtBQUlDLFdBQVc7QUFDZEMsYUFBVyxFQURHO0FBRWRDLFdBQVMsQ0FGSztBQUdkQyxTQUFPLElBSE87QUFJZEMsU0FBT1YsSUFKTyxFQUlJO0FBQ2xCVyxZQUFVWCxJQUxJLEVBS007QUFDcEJZLFlBQVVaLElBTkksQ0FNTTtBQU5OLEVBQWY7O0FBU0EsVUFBU2EsV0FBVCxDQUFxQkMsSUFBckIsRUFBMEI7QUFDekIsTUFBSUMsTUFBSixFQUFZQyxNQUFaO0FBQ0EsTUFBRztBQUNGRCxZQUFTRSxLQUFLQyxLQUFMLENBQVdKLElBQVgsQ0FBVDtBQUNBLEdBRkQsQ0FHQSxPQUFNSyxFQUFOLEVBQVM7QUFDUixPQUFHO0FBQ0ZILGFBQVMsSUFBSUksUUFBSixDQUFhLFlBQVlOLElBQXpCLENBQVQ7QUFDQUMsYUFBU0MsUUFBVDtBQUNBLElBSEQsQ0FJQSxPQUFNRyxFQUFOLEVBQVM7QUFDUkUsUUFBSSw2QkFBSixFQUFtQyxJQUFuQztBQUNBO0FBQ0Q7O0FBRUQsU0FBT04sTUFBUDtB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V0FBaEIsS0FBaUMsUUFBOUM7QUFDQSxRQUFJZ00sUUFBUUwsRUFBRyxJQUFILEVBQVUzTCxJQUFWLENBQWdCLFVBQWhCLEtBQWdDLEtBQUttTyxJQUFyQyxJQUE2QyxLQUFLbEMsS0FBOUQ7QUFDQUwsZ0NBQTZCLE9BQTdCLEVBQXNDRSxRQUF0QyxFQUFnREMsTUFBaEQsRUFBd0RDLEtBQXhEO0FBQ0gsSUFMUDtBQU1BO0FBRUQ7O0FBRURMLEdBQUdoSSxRQUFILEVBQWN5SyxLQUFkLENBQXFCLFlBQVc7QUFDL0IsTUFBSyxnQkFBZ0IsT0FBT2xDLDRCQUE0Qm1DLGVBQW5ELElBQXNFLFNBQVNuQyw0QkFBNEJtQyxlQUE1QixDQUE0Q2pDLE9BQWhJLEVBQTBJO0FBQ3pJLE9BQUssT0FBTzVGLE9BQU84SCxlQUFkLEtBQWtDLFdBQXZDLEVBQXFEO0FBQ3BEMUMsZ0NBQTZCLE9BQTdCLEVBQXNDLFNBQXRDLEVBQWlELElBQWpELEVBQXVELEVBQUUsa0JBQWtCLENBQXBCLEVBQXZEO0FBQ0EsSUFGRCxNQUVPO0FBQ05wRixXQUFPOEgsZUFBUCxDQUF1QmpILElBQXZCLENBQ0M7QUFDQzFILFlBQU8sS0FEUjtBQUVDQyxZQUFPLGlCQUFXO0FBQ2pCZ00sa0NBQTZCLE9BQTdCLEVBQXNDLFNBQXRDLEVBQWlELElBQWpELEVBQXVELEVBQUUsa0JBQWtCLENBQXBCLEVBQXZEO0FBQ0EsTUFKRjtBQUtDMkMsZUFBVSxvQkFBVztBQUNwQjNDLGtDQUE2QixPQUE3QixFQUFzQyxTQUF0QyxFQUFpRCxLQUFqRCxFQUF3RCxFQUFFLGtCQUFrQixDQUFwQixFQUF4RDtBQUNBO0FBUEYsS0FERDtBQVdBO0FBQ0Q7QUFDRCxFQWxCRDtBQW9CQSxDQXZJRCxFQXVJSzlELE1BdklMIiwiZmlsZSI6IndwLWFuYWx5dGljcy10cmFja2luZy1nZW5lcmF0b3ItZnJvbnQtZW5kLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFkQmxvY2sgZGV0ZWN0b3Jcbi8vXG4vLyBBdHRlbXB0cyB0byBkZXRlY3QgdGhlIHByZXNlbmNlIG9mIEFkIEJsb2NrZXIgc29mdHdhcmUgYW5kIG5vdGlmeSBsaXN0ZW5lciBvZiBpdHMgZXhpc3RlbmNlLlxuLy8gQ29weXJpZ2h0IChjKSAyMDE3IElBQlxuLy9cbi8vIFRoZSBCU0QtMyBMaWNlbnNlXG4vLyBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4vLyAxLiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4vLyAyLiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4vLyAzLiBOZWl0aGVyIHRoZSBuYW1lIG9mIHRoZSBjb3B5cmlnaHQgaG9sZGVyIG5vciB0aGUgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHMgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4vLyBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUiBBTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTOyBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlQgKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVMgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiogQG5hbWUgd2luZG93LmFkYmxvY2tEZXRlY3RvclxuKlxuKiBJQUIgQWRibG9jayBkZXRlY3Rvci5cbiogVXNhZ2U6IHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChvcHRpb25zKTtcbipcbiogT3B0aW9ucyBvYmplY3Qgc2V0dGluZ3NcbipcbipcdEBwcm9wIGRlYnVnOiAgYm9vbGVhblxuKiAgICAgICAgIEZsYWcgdG8gaW5kaWNhdGUgYWRkaXRpb25hbCBkZWJ1ZyBvdXRwdXQgc2hvdWxkIGJlIHByaW50ZWQgdG8gY29uc29sZVxuKlxuKlx0QHByb3AgZm91bmQ6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBpcyBkZXRlY3RlZFxuKlxuKlx0QHByb3Agbm90Zm91bmQ6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBpcyBub3QgZGV0ZWN0ZWQuXG4qICAgICAgICAgTk9URTogdGhpcyBmdW5jdGlvbiBtYXkgZmlyZSBtdWx0aXBsZSB0aW1lcyBhbmQgZ2l2ZSBmYWxzZSBuZWdhdGl2ZVxuKiAgICAgICAgIHJlc3BvbnNlcyBkdXJpbmcgYSB0ZXN0IHVudGlsIGFkYmxvY2sgaXMgc3VjY2Vzc2Z1bGx5IGRldGVjdGVkLlxuKlxuKlx0QHByb3AgY29tcGxldGU6IEBmdW5jdGlvblxuKiAgICAgICAgIENhbGxiYWNrIGZ1bmN0aW9uIHRvIGZpcmUgb25jZSBhIHJvdW5kIG9mIHRlc3RpbmcgaXMgY29tcGxldGUuXG4qICAgICAgICAgVGhlIHRlc3QgcmVzdWx0IChib29sZWFuKSBpcyBpbmNsdWRlZCBhcyBhIHBhcmFtZXRlciB0byBjYWxsYmFja1xuKlxuKiBleGFtcGxlOiBcdHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGZvdW5kOiBmdW5jdGlvbigpeyAuLi59LFxuIFx0XHRcdFx0XHRub3RGb3VuZDogZnVuY3Rpb24oKXsuLi59XG5cdFx0XHRcdH1cblx0XHRcdCk7XG4qXG4qXG4qL1xuXG5cInVzZSBzdHJpY3RcIjtcbihmdW5jdGlvbih3aW4pIHtcblxuXHR2YXIgdmVyc2lvbiA9ICcxLjAnO1xuXG5cdHZhciBvZnMgPSAnb2Zmc2V0JywgY2wgPSAnY2xpZW50Jztcblx0dmFyIG5vb3AgPSBmdW5jdGlvbigpe307XG5cblx0dmFyIHRlc3RlZE9uY2UgPSBmYWxzZTtcblx0dmFyIHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblxuXHR2YXIgaXNPbGRJRWV2ZW50cyA9ICh3aW4uYWRkRXZlbnRMaXN0ZW5lciA9PT0gdW5kZWZpbmVkKTtcblxuXHQvKipcblx0KiBPcHRpb25zIHNldCB3aXRoIGRlZmF1bHQgb3B0aW9ucyBpbml0aWFsaXplZFxuXHQqXG5cdCovXG5cdHZhciBfb3B0aW9ucyA9IHtcblx0XHRsb29wRGVsYXk6IDUwLFxuXHRcdG1heExvb3A6IDUsXG5cdFx0ZGVidWc6IHRydWUsXG5cdFx0Zm91bmQ6IG5vb3AsIFx0XHRcdFx0XHQvLyBmdW5jdGlvbiB0byBmaXJlIHdoZW4gYWRibG9jayBkZXRlY3RlZFxuXHRcdG5vdGZvdW5kOiBub29wLCBcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgaWYgYWRibG9jayBub3QgZGV0ZWN0ZWQgYWZ0ZXIgdGVzdGluZ1xuXHRcdGNvbXBsZXRlOiBub29wICBcdFx0XHRcdC8vIGZ1bmN0aW9uIHRvIGZpcmUgYWZ0ZXIgdGVzdGluZyBjb21wbGV0ZXMsIHBhc3NpbmcgcmVzdWx0IGFzIHBhcmFtZXRlclxuXHR9XG5cblx0ZnVuY3Rpb24gcGFyc2VBc0pzb24oZGF0YSl7XG5cdFx0dmFyIHJlc3VsdCwgZm5EYXRhO1xuXHRcdHRyeXtcblx0XHRcdHJlc3VsdCA9IEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0fVxuXHRcdGNhdGNoKGV4KXtcblx0XHRcdHRyeXtcblx0XHRcdFx0Zm5EYXRhID0gbmV3IEZ1bmN0aW9uKFwicmV0dXJuIFwiICsgZGF0YSk7XG5cdFx0XHRcdHJlc3VsdCA9IGZuRGF0YSgpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZXgpe1xuXHRcdFx0XHRsb2coJ0ZhaWxlZCBzZWNvbmRhcnkgSlNPTiBwYXJzZScsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0KiBBamF4IGhlbHBlciBvYmplY3QgdG8gZG93bmxvYWQgZXh0ZXJuYWwgc2NyaXB0cy5cblx0KiBJbml0aWFsaXplIG9iamVjdCB3aXRoIGFuIG9wdGlvbnMgb2JqZWN0XG5cdCogRXg6XG5cdCAge1xuXHRcdCAgdXJsIDogJ2h0dHA6Ly9leGFtcGxlLm9yZy91cmxfdG9fZG93bmxvYWQnLFxuXHRcdCAgbWV0aG9kOiAnUE9TVHxHRVQnLFxuXHRcdCAgc3VjY2VzczogY2FsbGJhY2tfZnVuY3Rpb24sXG5cdFx0ICBmYWlsOiAgY2FsbGJhY2tfZnVuY3Rpb25cblx0ICB9XG5cdCovXG5cdHZhciBBamF4SGVscGVyID0gZnVuY3Rpb24ob3B0cyl7XG5cdFx0dmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG5cdFx0dGhpcy5zdWNjZXNzID0gb3B0cy5zdWNjZXNzIHx8IG5vb3A7XG5cdFx0dGhpcy5mYWlsID0gb3B0cy5mYWlsIHx8IG5vb3A7XG5cdFx0dmFyIG1lID0gdGhpcztcblxuXHRcdHZhciBtZXRob2QgPSBvcHRzLm1ldGhvZCB8fCAnZ2V0JztcblxuXHRcdC8qKlxuXHRcdCogQWJvcnQgdGhlIHJlcXVlc3Rcblx0XHQqL1xuXHRcdHRoaXMuYWJvcnQgPSBmdW5jdGlvbigpe1xuXHRcdFx0dHJ5e1xuXHRcdFx0XHR4aHIuYWJvcnQoKTtcblx0XHRcdH1cblx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzdGF0ZUNoYW5nZSh2YWxzKXtcblx0XHRcdGlmKHhoci5yZWFkeVN0YXRlID09IDQpe1xuXHRcdFx0XHRpZih4aHIuc3RhdHVzID09IDIwMCl7XG5cdFx0XHRcdFx0bWUuc3VjY2Vzcyh4aHIucmVzcG9uc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2V7XG5cdFx0XHRcdFx0Ly8gZmFpbGVkXG5cdFx0XHRcdFx0bWUuZmFpbCh4aHIuc3RhdHVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBzdGF0ZUNoYW5nZTtcblxuXHRcdGZ1bmN0aW9uIHN0YXJ0KCl7XG5cdFx0XHR4aHIub3BlbihtZXRob2QsIG9wdHMudXJsLCB0cnVlKTtcblx0XHRcdHhoci5zZW5kKCk7XG5cdFx0fVxuXG5cdFx0c3RhcnQoKTtcblx0fVxuXG5cdC8qKlxuXHQqIE9iamVjdCB0cmFja2luZyB0aGUgdmFyaW91cyBibG9jayBsaXN0c1xuXHQqL1xuXHR2YXIgQmxvY2tMaXN0VHJhY2tlciA9IGZ1bmN0aW9uKCl7XG5cdFx0dmFyIG1lID0gdGhpcztcblx0XHR2YXIgZXh0ZXJuYWxCbG9ja2xpc3REYXRhID0ge307XG5cblx0XHQvKipcblx0XHQqIEFkZCBhIG5ldyBleHRlcm5hbCBVUkwgdG8gdHJhY2tcblx0XHQqL1xuXHRcdHRoaXMuYWRkVXJsID0gZnVuY3Rpb24odXJsKXtcblx0XHRcdGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxdID0ge1xuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0c3RhdGU6ICdwZW5kaW5nJyxcblx0XHRcdFx0Zm9ybWF0OiBudWxsLFxuXHRcdFx0XHRkYXRhOiBudWxsLFxuXHRcdFx0XHRyZXN1bHQ6IG51bGxcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGV4dGVybmFsQmxvY2tsaXN0RGF0YVt1cmxdO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCogTG9hZHMgYSBibG9jayBsaXN0IGRlZmluaXRpb25cblx0XHQqL1xuXHRcdHRoaXMuc2V0UmVzdWx0ID0gZnVuY3Rpb24odXJsS2V5LCBzdGF0ZSwgZGF0YSl7XG5cdFx0XHR2YXIgb2JqID0gZXh0ZXJuYWxCbG9ja2xpc3REYXRhW3VybEtleV07XG5cdFx0XHRpZihvYmogPT0gbnVsbCl7XG5cdFx0XHRcdG9iaiA9IHRoaXMuYWRkVXJsKHVybEtleSk7XG5cdFx0XHR9XG5cblx0XHRcdG9iai5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0aWYoZGF0YSA9PSBudWxsKXtcblx0XHRcdFx0b2JqLnJlc3VsdCA9IG51bGw7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKXtcblx0XHRcdFx0dHJ5e1xuXHRcdFx0XHRcdGRhdGEgPSBwYXJzZUFzSnNvbihkYXRhKTtcblx0XHRcdFx0XHRvYmouZm9ybWF0ID0gJ2pzb24nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0XHRvYmouZm9ybWF0ID0gJ2Vhc3lsaXN0Jztcblx0XHRcdFx0XHQvLyBwYXJzZUVhc3lMaXN0KGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvYmouZGF0YSA9IGRhdGE7XG5cblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fVxuXG5cdH1cblxuXHR2YXIgbGlzdGVuZXJzID0gW107IC8vIGV2ZW50IHJlc3BvbnNlIGxpc3RlbmVyc1xuXHR2YXIgYmFpdE5vZGUgPSBudWxsO1xuXHR2YXIgcXVpY2tCYWl0ID0ge1xuXHRcdGNzc0NsYXNzOiAncHViXzMwMHgyNTAgcHViXzMwMHgyNTBtIHB1Yl83Mjh4OTAgdGV4dC1hZCB0ZXh0QWQgdGV4dF9hZCB0ZXh0X2FkcyB0ZXh0LWFkcyB0ZXh0LWFkLWxpbmtzJ1xuXHR9O1xuXHR2YXIgYmFpdFRyaWdnZXJzID0ge1xuXHRcdG51bGxQcm9wczogW29mcyArICdQYXJlbnQnXSxcblx0XHR6ZXJvUHJvcHM6IFtdXG5cdH07XG5cblx0YmFpdFRyaWdnZXJzLnplcm9Qcm9wcyA9IFtcblx0XHRvZnMgKydIZWlnaHQnLCBvZnMgKydMZWZ0Jywgb2ZzICsnVG9wJywgb2ZzICsnV2lkdGgnLCBvZnMgKydIZWlnaHQnLFxuXHRcdGNsICsgJ0hlaWdodCcsIGNsICsgJ1dpZHRoJ1xuXHRdO1xuXG5cdC8vIHJlc3VsdCBvYmplY3Rcblx0dmFyIGV4ZVJlc3VsdCA9IHtcblx0XHRxdWljazogbnVsbCxcblx0XHRyZW1vdGU6IG51bGxcblx0fTtcblxuXHR2YXIgZmluZFJlc3VsdCA9IG51bGw7IC8vIHJlc3VsdCBvZiB0ZXN0IGZvciBhZCBibG9ja2VyXG5cblx0dmFyIHRpbWVySWRzID0ge1xuXHRcdHRlc3Q6IDAsXG5cdFx0ZG93bmxvYWQ6IDBcblx0fTtcblxuXHRmdW5jdGlvbiBpc0Z1bmMoZm4pe1xuXHRcdHJldHVybiB0eXBlb2YoZm4pID09ICdmdW5jdGlvbic7XG5cdH1cblxuXHQvKipcblx0KiBNYWtlIGEgRE9NIGVsZW1lbnRcblx0Ki9cblx0ZnVuY3Rpb24gbWFrZUVsKHRhZywgYXR0cmlidXRlcyl7XG5cdFx0dmFyIGssIHYsIGVsLCBhdHRyID0gYXR0cmlidXRlcztcblx0XHR2YXIgZCA9IGRvY3VtZW50O1xuXG5cdFx0ZWwgPSBkLmNyZWF0ZUVsZW1lbnQodGFnKTtcblxuXHRcdGlmKGF0dHIpe1xuXHRcdFx0Zm9yKGsgaW4gYXR0cil7XG5cdFx0XHRcdGlmKGF0dHIuaGFzT3duUHJvcGVydHkoaykpe1xuXHRcdFx0XHRcdGVsLnNldEF0dHJpYnV0ZShrLCBhdHRyW2tdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGF0dGFjaEV2ZW50TGlzdGVuZXIoZG9tLCBldmVudE5hbWUsIGhhbmRsZXIpe1xuXHRcdGlmKGlzT2xkSUVldmVudHMpe1xuXHRcdFx0ZG9tLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudE5hbWUsIGhhbmRsZXIpO1xuXHRcdH1cblx0XHRlbHNle1xuXHRcdFx0ZG9tLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gbG9nKG1lc3NhZ2UsIGlzRXJyb3Ipe1xuXHRcdGlmKCFfb3B0aW9ucy5kZWJ1ZyAmJiAhaXNFcnJvcil7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmKHdpbi5jb25zb2xlICYmIHdpbi5jb25zb2xlLmxvZyl7XG5cdFx0XHRpZihpc0Vycm9yKXtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignW0FCRF0gJyArIG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZXtcblx0XHRcdFx0Y29uc29sZS5sb2coJ1tBQkRdICcgKyBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR2YXIgYWpheERvd25sb2FkcyA9IFtdO1xuXG5cdC8qKlxuXHQqIExvYWQgYW5kIGV4ZWN1dGUgdGhlIFVSTCBpbnNpZGUgYSBjbG9zdXJlIGZ1bmN0aW9uXG5cdCovXG5cdGZ1bmN0aW9uIGxvYWRFeGVjdXRlVXJsKHVybCl7XG5cdFx0dmFyIGFqYXgsIHJlc3VsdDtcblxuXHRcdGJsb2NrTGlzdHMuYWRkVXJsKHVybCk7XG5cdFx0Ly8gc2V0dXAgY2FsbCBmb3IgcmVtb3RlIGxpc3Rcblx0XHRhamF4ID0gbmV3IEFqYXhIZWxwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdHVybDogdXJsLFxuXHRcdFx0XHRzdWNjZXNzOiBmdW5jdGlvbihkYXRhKXtcblx0XHRcdFx0XHRsb2coJ2Rvd25sb2FkZWQgZmlsZSAnICsgdXJsKTsgLy8gdG9kbyAtIHBhcnNlIGFuZCBzdG9yZSB1bnRpbCB1c2Vcblx0XHRcdFx0XHRyZXN1bHQgPSBibG9ja0xpc3RzLnNldFJlc3VsdCh1cmwsICdzdWNjZXNzJywgZGF0YSk7XG5cdFx0XHRcdFx0dHJ5e1xuXHRcdFx0XHRcdFx0dmFyIGludGVydmFsSWQgPSAwLFxuXHRcdFx0XHRcdFx0XHRyZXRyeUNvdW50ID0gMDtcblxuXHRcdFx0XHRcdFx0dmFyIHRyeUV4ZWN1dGVUZXN0ID0gZnVuY3Rpb24obGlzdERhdGEpe1xuXHRcdFx0XHRcdFx0XHRpZighdGVzdEV4ZWN1dGluZyl7XG5cdFx0XHRcdFx0XHRcdFx0YmVnaW5UZXN0KGxpc3REYXRhLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmKGZpbmRSZXN1bHQgPT0gdHJ1ZSl7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYodHJ5RXhlY3V0ZVRlc3QocmVzdWx0LmRhdGEpKXtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHRcdFx0bG9nKCdQYXVzZSBiZWZvcmUgdGVzdCBleGVjdXRpb24nKTtcblx0XHRcdFx0XHRcdFx0aW50ZXJ2YWxJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0XHRcdFx0aWYodHJ5RXhlY3V0ZVRlc3QocmVzdWx0LmRhdGEpIHx8IHJldHJ5Q291bnQrKyA+IDUpe1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xlYXJJbnRlcnZhbChpbnRlcnZhbElkKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sIDI1MCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhdGNoKGV4KXtcblx0XHRcdFx0XHRcdGxvZyhleC5tZXNzYWdlICsgJyB1cmw6ICcgKyB1cmwsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmFpbDogZnVuY3Rpb24oc3RhdHVzKXtcblx0XHRcdFx0XHRsb2coc3RhdHVzLCB0cnVlKTtcblx0XHRcdFx0XHRibG9ja0xpc3RzLnNldFJlc3VsdCh1cmwsICdlcnJvcicsIG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdGFqYXhEb3dubG9hZHMucHVzaChhamF4KTtcblx0fVxuXG5cblx0LyoqXG5cdCogRmV0Y2ggdGhlIGV4dGVybmFsIGxpc3RzIGFuZCBpbml0aWF0ZSB0aGUgdGVzdHNcblx0Ki9cblx0ZnVuY3Rpb24gZmV0Y2hSZW1vdGVMaXN0cygpe1xuXHRcdHZhciBpLCB1cmw7XG5cdFx0dmFyIG9wdHMgPSBfb3B0aW9ucztcblxuXHRcdGZvcihpPTA7aTxvcHRzLmJsb2NrTGlzdHMubGVuZ3RoO2krKyl7XG5cdFx0XHR1cmwgPSBvcHRzLmJsb2NrTGlzdHNbaV07XG5cdFx0XHRsb2FkRXhlY3V0ZVVybCh1cmwpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNhbmNlbFJlbW90ZURvd25sb2Fkcygpe1xuXHRcdHZhciBpLCBhajtcblxuXHRcdGZvcihpPWFqYXhEb3dubG9hZHMubGVuZ3RoLTE7aSA+PSAwO2ktLSl7XG5cdFx0XHRhaiA9IGFqYXhEb3dubG9hZHMucG9wKCk7XG5cdFx0XHRhai5hYm9ydCgpO1xuXHRcdH1cblx0fVxuXG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0LyoqXG5cdCogQmVnaW4gZXhlY3V0aW9uIG9mIHRoZSB0ZXN0XG5cdCovXG5cdGZ1bmN0aW9uIGJlZ2luVGVzdChiYWl0KXtcblx0XHRsb2coJ3N0YXJ0IGJlZ2luVGVzdCcpO1xuXHRcdGlmKGZpbmRSZXN1bHQgPT0gdHJ1ZSl7XG5cdFx0XHRyZXR1cm47IC8vIHdlIGZvdW5kIGl0LiBkb24ndCBjb250aW51ZSBleGVjdXRpbmdcblx0XHR9XG5cdFx0dGVzdEV4ZWN1dGluZyA9IHRydWU7XG5cdFx0Y2FzdEJhaXQoYmFpdCk7XG5cblx0XHRleGVSZXN1bHQucXVpY2sgPSAndGVzdGluZyc7XG5cblx0XHR0aW1lcklkcy50ZXN0ID0gc2V0VGltZW91dChcblx0XHRcdGZ1bmN0aW9uKCl7IHJlZWxJbihiYWl0LCAxKTsgfSxcblx0XHRcdDUpO1xuXHR9XG5cblx0LyoqXG5cdCogQ3JlYXRlIHRoZSBiYWl0IG5vZGUgdG8gc2VlIGhvdyB0aGUgYnJvd3NlciBwYWdlIHJlYWN0c1xuXHQqL1xuXHRmdW5jdGlvbiBjYXN0QmFpdChiYWl0KXtcblx0XHR2YXIgaSwgZCA9IGRvY3VtZW50LCBiID0gZC5ib2R5O1xuXHRcdHZhciB0O1xuXHRcdHZhciBiYWl0U3R5bGUgPSAnd2lkdGg6IDFweCAhaW1wb3J0YW50OyBoZWlnaHQ6IDFweCAhaW1wb3J0YW50OyBwb3NpdGlvbjogYWJzb2x1dGUgIWltcG9ydGFudDsgbGVmdDogLTEwMDAwcHggIWltcG9ydGFudDsgdG9wOiAtMTAwMHB4ICFpbXBvcnRhbnQ7J1xuXG5cdFx0aWYoYmFpdCA9PSBudWxsIHx8IHR5cGVvZihiYWl0KSA9PSAnc3RyaW5nJyl7XG5cdFx0XHRsb2coJ2ludmFsaWQgYmFpdCBiZWluZyBjYXN0Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYoYmFpdC5zdHlsZSAhPSBudWxsKXtcblx0XHRcdGJhaXRTdHlsZSArPSBiYWl0LnN0eWxlO1xuXHRcdH1cblxuXHRcdGJhaXROb2RlID0gbWFrZUVsKCdkaXYnLCB7XG5cdFx0XHQnY2xhc3MnOiBiYWl0LmNzc0NsYXNzLFxuXHRcdFx0J3N0eWxlJzogYmFpdFN0eWxlXG5cdFx0fSk7XG5cblx0XHRsb2coJ2FkZGluZyBiYWl0IG5vZGUgdG8gRE9NJyk7XG5cblx0XHRiLmFwcGVuZENoaWxkKGJhaXROb2RlKTtcblxuXHRcdC8vIHRvdWNoIHRoZXNlIHByb3BlcnRpZXNcblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLm51bGxQcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdHQgPSBiYWl0Tm9kZVtiYWl0VHJpZ2dlcnMubnVsbFByb3BzW2ldXTtcblx0XHR9XG5cdFx0Zm9yKGk9MDtpPGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHMubGVuZ3RoO2krKyl7XG5cdFx0XHR0ID0gYmFpdE5vZGVbYmFpdFRyaWdnZXJzLnplcm9Qcm9wc1tpXV07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCogUnVuIHRlc3RzIHRvIHNlZSBpZiBicm93c2VyIGhhcyB0YWtlbiB0aGUgYmFpdCBhbmQgYmxvY2tlZCB0aGUgYmFpdCBlbGVtZW50XG5cdCovXG5cdGZ1bmN0aW9uIHJlZWxJbihiYWl0LCBhdHRlbXB0TnVtKXtcblx0XHR2YXIgaSwgaywgdjtcblx0XHR2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG5cdFx0dmFyIGZvdW5kID0gZmFsc2U7XG5cblx0XHRpZihiYWl0Tm9kZSA9PSBudWxsKXtcblx0XHRcdGxvZygncmVjYXN0IGJhaXQnKTtcblx0XHRcdGNhc3RCYWl0KGJhaXQgfHwgcXVpY2tCYWl0KTtcblx0XHR9XG5cblx0XHRpZih0eXBlb2YoYmFpdCkgPT0gJ3N0cmluZycpe1xuXHRcdFx0bG9nKCdpbnZhbGlkIGJhaXQgdXNlZCcsIHRydWUpO1xuXHRcdFx0aWYoY2xlYXJCYWl0Tm9kZSgpKXtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZih0aW1lcklkcy50ZXN0ID4gMCl7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXJJZHMudGVzdCk7XG5cdFx0XHR0aW1lcklkcy50ZXN0ID0gMDtcblx0XHR9XG5cblx0XHQvLyB0ZXN0IGZvciBpc3N1ZXNcblxuXHRcdGlmKGJvZHkuZ2V0QXR0cmlidXRlKCdhYnAnKSAhPT0gbnVsbCl7XG5cdFx0XHRsb2coJ2ZvdW5kIGFkYmxvY2sgYm9keSBhdHRyaWJ1dGUnKTtcblx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLm51bGxQcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdGlmKGJhaXROb2RlW2JhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV1dID09IG51bGwpe1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIG51bGwgYXR0cjogJyArIGJhaXRUcmlnZ2Vycy5udWxsUHJvcHNbaV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmKGZvdW5kID09IHRydWUpe1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IoaT0wO2k8YmFpdFRyaWdnZXJzLnplcm9Qcm9wcy5sZW5ndGg7aSsrKXtcblx0XHRcdGlmKGZvdW5kID09IHRydWUpe1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmKGJhaXROb2RlW2JhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV1dID09IDApe1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIHplcm8gYXR0cjogJyArIGJhaXRUcmlnZ2Vycy56ZXJvUHJvcHNbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmKHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhciBiYWl0VGVtcCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGJhaXROb2RlLCBudWxsKTtcblx0XHRcdGlmKGJhaXRUZW1wLmdldFByb3BlcnR5VmFsdWUoJ2Rpc3BsYXknKSA9PSAnbm9uZSdcblx0XHRcdHx8IGJhaXRUZW1wLmdldFByb3BlcnR5VmFsdWUoJ3Zpc2liaWxpdHknKSA9PSAnaGlkZGVuJykge1xuXHRcdFx0XHRpZihhdHRlbXB0TnVtPjQpXG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bG9nKCdmb3VuZCBhZGJsb2NrIGNvbXB1dGVkU3R5bGUgaW5kaWNhdG9yJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdGVkT25jZSA9IHRydWU7XG5cblx0XHRpZihmb3VuZCB8fCBhdHRlbXB0TnVtKysgPj0gX29wdGlvbnMubWF4TG9vcCl7XG5cdFx0XHRmaW5kUmVzdWx0ID0gZm91bmQ7XG5cdFx0XHRsb2coJ2V4aXRpbmcgdGVzdCBsb29wIC0gdmFsdWU6ICcgKyBmaW5kUmVzdWx0KTtcblx0XHRcdG5vdGlmeUxpc3RlbmVycygpO1xuXHRcdFx0aWYoY2xlYXJCYWl0Tm9kZSgpKXtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHRlc3RFeGVjdXRpbmcgPSBmYWxzZTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHR0aW1lcklkcy50ZXN0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuXHRcdFx0XHRyZWVsSW4oYmFpdCwgYXR0ZW1wdE51bSk7XG5cdFx0XHR9LCBfb3B0aW9ucy5sb29wRGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNsZWFyQmFpdE5vZGUoKXtcblx0XHRpZihiYWl0Tm9kZSA9PT0gbnVsbCl7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0cnl7XG5cdFx0XHRpZihpc0Z1bmMoYmFpdE5vZGUucmVtb3ZlKSl7XG5cdFx0XHRcdGJhaXROb2RlLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChiYWl0Tm9kZSk7XG5cdFx0fVxuXHRcdGNhdGNoKGV4KXtcblx0XHR9XG5cdFx0YmFpdE5vZGUgPSBudWxsO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0KiBIYWx0IHRoZSB0ZXN0IGFuZCBhbnkgcGVuZGluZyB0aW1lb3V0c1xuXHQqL1xuXHRmdW5jdGlvbiBzdG9wRmlzaGluZygpe1xuXHRcdGlmKHRpbWVySWRzLnRlc3QgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy50ZXN0KTtcblx0XHR9XG5cdFx0aWYodGltZXJJZHMuZG93bmxvYWQgPiAwKXtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcklkcy5kb3dubG9hZCk7XG5cdFx0fVxuXG5cdFx0Y2FuY2VsUmVtb3RlRG93bmxvYWRzKCk7XG5cblx0XHRjbGVhckJhaXROb2RlKCk7XG5cdH1cblxuXHQvKipcblx0KiBGaXJlIGFsbCByZWdpc3RlcmVkIGxpc3RlbmVyc1xuXHQqL1xuXHRmdW5jdGlvbiBub3RpZnlMaXN0ZW5lcnMoKXtcblx0XHR2YXIgaSwgZnVuY3M7XG5cdFx0aWYoZmluZFJlc3VsdCA9PT0gbnVsbCl7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvcihpPTA7aTxsaXN0ZW5lcnMubGVuZ3RoO2krKyl7XG5cdFx0XHRmdW5jcyA9IGxpc3RlbmVyc1tpXTtcblx0XHRcdHRyeXtcblx0XHRcdFx0aWYoZnVuY3MgIT0gbnVsbCl7XG5cdFx0XHRcdFx0aWYoaXNGdW5jKGZ1bmNzWydjb21wbGV0ZSddKSl7XG5cdFx0XHRcdFx0XHRmdW5jc1snY29tcGxldGUnXShmaW5kUmVzdWx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZihmaW5kUmVzdWx0ICYmIGlzRnVuYyhmdW5jc1snZm91bmQnXSkpe1xuXHRcdFx0XHRcdFx0ZnVuY3NbJ2ZvdW5kJ10oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSBpZihmaW5kUmVzdWx0ID09PSBmYWxzZSAmJiBpc0Z1bmMoZnVuY3NbJ25vdGZvdW5kJ10pKXtcblx0XHRcdFx0XHRcdGZ1bmNzWydub3Rmb3VuZCddKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXRjaChleCl7XG5cdFx0XHRcdGxvZygnRmFpbHVyZSBpbiBub3RpZnkgbGlzdGVuZXJzICcgKyBleC5NZXNzYWdlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBBdHRhY2hlcyBldmVudCBsaXN0ZW5lciBvciBmaXJlcyBpZiBldmVudHMgaGF2ZSBhbHJlYWR5IHBhc3NlZC5cblx0Ki9cblx0ZnVuY3Rpb24gYXR0YWNoT3JGaXJlKCl7XG5cdFx0dmFyIGZpcmVOb3cgPSBmYWxzZTtcblx0XHR2YXIgZm47XG5cblx0XHRpZihkb2N1bWVudC5yZWFkeVN0YXRlKXtcblx0XHRcdGlmKGRvY3VtZW50LnJlYWR5U3RhdGUgPT0gJ2NvbXBsZXRlJyl7XG5cdFx0XHRcdGZpcmVOb3cgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZuID0gZnVuY3Rpb24oKXtcblx0XHRcdGJlZ2luVGVzdChxdWlja0JhaXQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHRpZihmaXJlTm93KXtcblx0XHRcdGZuKCk7XG5cdFx0fVxuXHRcdGVsc2V7XG5cdFx0XHRhdHRhY2hFdmVudExpc3RlbmVyKHdpbiwgJ2xvYWQnLCBmbik7XG5cdFx0fVxuXHR9XG5cblxuXHR2YXIgYmxvY2tMaXN0czsgLy8gdHJhY2tzIGV4dGVybmFsIGJsb2NrIGxpc3RzXG5cblx0LyoqXG5cdCogUHVibGljIGludGVyZmFjZSBvZiBhZGJsb2NrIGRldGVjdG9yXG5cdCovXG5cdHZhciBpbXBsID0ge1xuXHRcdC8qKlxuXHRcdCogVmVyc2lvbiBvZiB0aGUgYWRibG9jayBkZXRlY3RvciBwYWNrYWdlXG5cdFx0Ki9cblx0XHR2ZXJzaW9uOiB2ZXJzaW9uLFxuXG5cdFx0LyoqXG5cdFx0KiBJbml0aWFsaXphdGlvbiBmdW5jdGlvbi4gU2VlIGNvbW1lbnRzIGF0IHRvcCBmb3Igb3B0aW9ucyBvYmplY3Rcblx0XHQqL1xuXHRcdGluaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuXHRcdFx0dmFyIGssIHYsIGZ1bmNzO1xuXG5cdFx0XHRpZighb3B0aW9ucyl7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3MgPSB7XG5cdFx0XHRcdGNvbXBsZXRlOiBub29wLFxuXHRcdFx0XHRmb3VuZDogbm9vcCxcblx0XHRcdFx0bm90Zm91bmQ6IG5vb3Bcblx0XHRcdH07XG5cblx0XHRcdGZvcihrIGluIG9wdGlvbnMpe1xuXHRcdFx0XHRpZihvcHRpb25zLmhhc093blByb3BlcnR5KGspKXtcblx0XHRcdFx0XHRpZihrID09ICdjb21wbGV0ZScgfHwgayA9PSAnZm91bmQnIHx8IGsgPT0gJ25vdEZvdW5kJyl7XG5cdFx0XHRcdFx0XHRmdW5jc1trLnRvTG93ZXJDYXNlKCldID0gb3B0aW9uc1trXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZXtcblx0XHRcdFx0XHRcdF9vcHRpb25zW2tdID0gb3B0aW9uc1trXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGlzdGVuZXJzLnB1c2goZnVuY3MpO1xuXG5cdFx0XHRibG9ja0xpc3RzID0gbmV3IEJsb2NrTGlzdFRyYWNrZXIoKTtcblxuXHRcdFx0YXR0YWNoT3JGaXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0d2luWydhZGJsb2NrRGV0ZWN0b3InXSA9IGltcGw7XG5cbn0pKHdpbmRvdylcbiIsIi8qIVxuICogQHByZXNlcnZlXG4gKiBqcXVlcnkuc2Nyb2xsZGVwdGguanMgfCB2MS4wXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTYgUm9iIEZsYWhlcnR5IChAcm9iZmxhaGVydHkpXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGFuZCBHUEwgbGljZW5zZXMuXG4gKi9cbiFmdW5jdGlvbihlKXtcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQ/ZGVmaW5lKFtcImpxdWVyeVwiXSxlKTpcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlJiZtb2R1bGUuZXhwb3J0cz9tb2R1bGUuZXhwb3J0cz1lKHJlcXVpcmUoXCJqcXVlcnlcIikpOmUoalF1ZXJ5KX0oZnVuY3Rpb24oZSl7XCJ1c2Ugc3RyaWN0XCI7dmFyIG4sdCxyLG8saT17bWluSGVpZ2h0OjAsZWxlbWVudHM6W10scGVyY2VudGFnZTohMCx1c2VyVGltaW5nOiEwLHBpeGVsRGVwdGg6ITAsbm9uSW50ZXJhY3Rpb246ITAsZ2FHbG9iYWw6ITEsZ3RtT3ZlcnJpZGU6ITEsdHJhY2tlck5hbWU6ITEsZGF0YUxheWVyOlwiZGF0YUxheWVyXCJ9LGE9ZSh3aW5kb3cpLGw9W10sYz0hMSx1PTA7cmV0dXJuIGUuc2Nyb2xsRGVwdGg9ZnVuY3Rpb24ocCl7ZnVuY3Rpb24gcyhlLGksYSxsKXt2YXIgYz1wLnRyYWNrZXJOYW1lP3AudHJhY2tlck5hbWUrXCIuc2VuZFwiOlwic2VuZFwiO28/KG8oe2V2ZW50OlwiU2Nyb2xsRGlzdGFuY2VcIixldmVudENhdGVnb3J5OlwiU2Nyb2xsIERlcHRoXCIsZXZlbnRBY3Rpb246ZSxldmVudExhYmVsOmksZXZlbnRWYWx1ZToxLGV2ZW50Tm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pLHAucGl4ZWxEZXB0aCYmYXJndW1lbnRzLmxlbmd0aD4yJiZhPnUmJih1PWEsbyh7ZXZlbnQ6XCJTY3JvbGxEaXN0YW5jZVwiLGV2ZW50Q2F0ZWdvcnk6XCJTY3JvbGwgRGVwdGhcIixldmVudEFjdGlvbjpcIlBpeGVsIERlcHRoXCIsZXZlbnRMYWJlbDpkKGEpLGV2ZW50VmFsdWU6MSxldmVudE5vbkludGVyYWN0aW9uOnAubm9uSW50ZXJhY3Rpb259KSkscC51c2VyVGltaW5nJiZhcmd1bWVudHMubGVuZ3RoPjMmJm8oe2V2ZW50OlwiU2Nyb2xsVGltaW5nXCIsZXZlbnRDYXRlZ29yeTpcIlNjcm9sbCBEZXB0aFwiLGV2ZW50QWN0aW9uOmUsZXZlbnRMYWJlbDppLGV2ZW50VGltaW5nOmx9KSk6KG4mJih3aW5kb3dbcl0oYyxcImV2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixlLGksMSx7bm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pLHAucGl4ZWxEZXB0aCYmYXJndW1lbnRzLmxlbmd0aD4yJiZhPnUmJih1PWEsd2luZG93W3JdKGMsXCJldmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsXCJQaXhlbCBEZXB0aFwiLGQoYSksMSx7bm9uSW50ZXJhY3Rpb246cC5ub25JbnRlcmFjdGlvbn0pKSxwLnVzZXJUaW1pbmcmJmFyZ3VtZW50cy5sZW5ndGg+MyYmd2luZG93W3JdKGMsXCJ0aW1pbmdcIixcIlNjcm9sbCBEZXB0aFwiLGUsbCxpKSksdCYmKF9nYXEucHVzaChbXCJfdHJhY2tFdmVudFwiLFwiU2Nyb2xsIERlcHRoXCIsZSxpLDEscC5ub25JbnRlcmFjdGlvbl0pLHAucGl4ZWxEZXB0aCYmYXJndW1lbnRzLmxlbmd0aD4yJiZhPnUmJih1PWEsX2dhcS5wdXNoKFtcIl90cmFja0V2ZW50XCIsXCJTY3JvbGwgRGVwdGhcIixcIlBpeGVsIERlcHRoXCIsZChhKSwxLHAubm9uSW50ZXJhY3Rpb25dKSkscC51c2VyVGltaW5nJiZhcmd1bWVudHMubGVuZ3RoPjMmJl9nYXEucHVzaChbXCJfdHJhY2tUaW1pbmdcIixcIlNjcm9sbCBEZXB0aFwiLGUsbCxpLDEwMF0pKSl9ZnVuY3Rpb24gaChlKXtyZXR1cm57XCIyNSVcIjpwYXJzZUludCguMjUqZSwxMCksXCI1MCVcIjpwYXJzZUludCguNSplLDEwKSxcIjc1JVwiOnBhcnNlSW50KC43NSplLDEwKSxcIjEwMCVcIjplLTV9fWZ1bmN0aW9uIGcobix0LHIpe2UuZWFjaChuLGZ1bmN0aW9uKG4sbyl7LTE9PT1lLmluQXJyYXkobixsKSYmdD49byYmKHMoXCJQZXJjZW50YWdlXCIsbix0LHIpLGwucHVzaChuKSl9KX1mdW5jdGlvbiBmKG4sdCxyKXtlLmVhY2gobixmdW5jdGlvbihuLG8pey0xPT09ZS5pbkFycmF5KG8sbCkmJmUobykubGVuZ3RoJiZ0Pj1lKG8pLm9mZnNldCgpLnRvcCYmKHMoXCJFbGVtZW50c1wiLG8sdCxyKSxsLnB1c2gobykpfSl9ZnVuY3Rpb24gZChlKXtyZXR1cm4oMjUwKk1hdGguZmxvb3IoZS8yNTApKS50b1N0cmluZygpfWZ1bmN0aW9uIG0oKXt5KCl9ZnVuY3Rpb24gdihlLG4pe3ZhciB0LHIsbyxpPW51bGwsYT0wLGw9ZnVuY3Rpb24oKXthPW5ldyBEYXRlLGk9bnVsbCxvPWUuYXBwbHkodCxyKX07cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIGM9bmV3IERhdGU7YXx8KGE9Yyk7dmFyIHU9bi0oYy1hKTtyZXR1cm4gdD10aGlzLHI9YXJndW1lbnRzLDA+PXU/KGNsZWFyVGltZW91dChpKSxpPW51bGwsYT1jLG89ZS5hcHBseSh0LHIpKTppfHwoaT1zZXRUaW1lb3V0KGwsdSkpLG99fWZ1bmN0aW9uIHkoKXtjPSEwLGEub24oXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIix2KGZ1bmN0aW9uKCl7dmFyIG49ZShkb2N1bWVudCkuaGVpZ2h0KCksdD13aW5kb3cuaW5uZXJIZWlnaHQ/d2luZG93LmlubmVySGVpZ2h0OmEuaGVpZ2h0KCkscj1hLnNjcm9sbFRvcCgpK3Qsbz1oKG4pLGk9K25ldyBEYXRlLUQ7cmV0dXJuIGwubGVuZ3RoPj1wLmVsZW1lbnRzLmxlbmd0aCsocC5wZXJjZW50YWdlPzQ6MCk/KGEub2ZmKFwic2Nyb2xsLnNjcm9sbERlcHRoXCIpLHZvaWQoYz0hMSkpOihwLmVsZW1lbnRzJiZmKHAuZWxlbWVudHMscixpKSx2b2lkKHAucGVyY2VudGFnZSYmZyhvLHIsaSkpKX0sNTAwKSl9dmFyIEQ9K25ldyBEYXRlO3A9ZS5leHRlbmQoe30saSxwKSxlKGRvY3VtZW50KS5oZWlnaHQoKTxwLm1pbkhlaWdodHx8KHAuZ2FHbG9iYWw/KG49ITAscj1wLmdhR2xvYmFsKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBnYT8obj0hMCxyPVwiZ2FcIik6XCJmdW5jdGlvblwiPT10eXBlb2YgX19nYVRyYWNrZXImJihuPSEwLHI9XCJfX2dhVHJhY2tlclwiKSxcInVuZGVmaW5lZFwiIT10eXBlb2YgX2dhcSYmXCJmdW5jdGlvblwiPT10eXBlb2YgX2dhcS5wdXNoJiYodD0hMCksXCJmdW5jdGlvblwiPT10eXBlb2YgcC5ldmVudEhhbmRsZXI/bz1wLmV2ZW50SGFuZGxlcjpcInVuZGVmaW5lZFwiPT10eXBlb2Ygd2luZG93W3AuZGF0YUxheWVyXXx8XCJmdW5jdGlvblwiIT10eXBlb2Ygd2luZG93W3AuZGF0YUxheWVyXS5wdXNofHxwLmd0bU92ZXJyaWRlfHwobz1mdW5jdGlvbihlKXt3aW5kb3dbcC5kYXRhTGF5ZXJdLnB1c2goZSl9KSxlLnNjcm9sbERlcHRoLnJlc2V0PWZ1bmN0aW9uKCl7bD1bXSx1PTAsYS5vZmYoXCJzY3JvbGwuc2Nyb2xsRGVwdGhcIikseSgpfSxlLnNjcm9sbERlcHRoLmFkZEVsZW1lbnRzPWZ1bmN0aW9uKG4pe1widW5kZWZpbmVkXCIhPXR5cGVvZiBuJiZlLmlzQXJyYXkobikmJihlLm1lcmdlKHAuZWxlbWVudHMsbiksY3x8eSgpKX0sZS5zY3JvbGxEZXB0aC5yZW1vdmVFbGVtZW50cz1mdW5jdGlvbihuKXtcInVuZGVmaW5lZFwiIT10eXBlb2YgbiYmZS5pc0FycmF5KG4pJiZlLmVhY2gobixmdW5jdGlvbihuLHQpe3ZhciByPWUuaW5BcnJheSh0LHAuZWxlbWVudHMpLG89ZS5pbkFycmF5KHQsbCk7LTEhPXImJnAuZWxlbWVudHMuc3BsaWNlKHIsMSksLTEhPW8mJmwuc3BsaWNlKG8sMSl9KX0sbSgpKX0sZS5zY3JvbGxEZXB0aH0pO1xuIiwiKCBmdW5jdGlvbiggJCApIHtcblxuXHQvKlxuXHQgKiBDcmVhdGUgYSBHb29nbGUgQW5hbHl0aWNzIGV2ZW50XG5cdCAqIGNhdGVnb3J5OiBFdmVudCBDYXRlZ29yeVxuXHQgKiBsYWJlbDogRXZlbnQgTGFiZWxcblx0ICogYWN0aW9uOiBFdmVudCBBY3Rpb25cblx0ICogdmFsdWU6IG9wdGlvbmFsXG5cdCovXG5cdGZ1bmN0aW9uIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwsIHZhbHVlICkge1xuXHRcdGlmICggdHlwZW9mIGdhICE9PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdGlmICggdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyApIHtcblx0XHRcdFx0Z2EoICdzZW5kJywgdHlwZSwgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdhKCAnc2VuZCcsIHR5cGUsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0aWYgKCAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncyApIHtcblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwuZW5hYmxlZCApIHtcblx0XHRcdCQuc2Nyb2xsRGVwdGgoe1xuXHRcdFx0ICBtaW5IZWlnaHQ6IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zY3JvbGwubWluaW11bV9oZWlnaHQsXG5cdFx0XHQgIGVsZW1lbnRzOiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnNjcm9sbF9lbGVtZW50cy5zcGxpdCgnLCAnKSxcblx0XHRcdCAgcGVyY2VudGFnZTogYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5wZXJjZW50YWdlLFxuXHRcdFx0ICB1c2VyVGltaW5nOiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnVzZXJfdGltaW5nLFxuXHRcdFx0ICBwaXhlbERlcHRoOiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc2Nyb2xsLnBpeGVsX2RlcHRoLFxuXHRcdFx0ICBub25JbnRlcmFjdGlvbjogYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNjcm9sbC5ub25faW50ZXJhY3Rpb25cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbCAmJiB0cnVlID09PSBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5lbmFibGVkICkge1xuXG5cdFx0XHQvLyBleHRlcm5hbCBsaW5rc1xuXHRcdFx0JCggJ2FbaHJlZl49XCJodHRwXCJdOm5vdChbaHJlZio9XCI6Ly8nICsgZG9jdW1lbnQuZG9tYWluICsgJ1wiXSknICkuY2xpY2soIGZ1bmN0aW9uKCkge1xuXHRcdFx0ICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ091dGJvdW5kIGxpbmtzJywgJ0NsaWNrJywgdGhpcy5ocmVmICk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gbWFpbHRvIGxpbmtzXG5cdFx0XHQkKCAnYVtocmVmXj1cIm1haWx0b1wiXScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cdFx0XHQgICAgd3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnTWFpbHMnLCAnQ2xpY2snLCB0aGlzLmhyZWYuc3Vic3RyaW5nKCA3ICkgKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyB0ZWwgbGlua3Ncblx0XHRcdCQoICdhW2hyZWZePVwidGVsXCJdJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblx0XHRcdCAgICB3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdUZWxlcGhvbmUnLCAnQ2FsbCcsIHRoaXMuaHJlZi5zdWJzdHJpbmcoIDcgKSApO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGludGVybmFsIGxpbmtzXG5cdFx0XHQkKCAnYTpub3QoW2hyZWZePVwiKGh0dHA6fGh0dHBzOik/Ly9cIl0sW2hyZWZePVwiI1wiXSxbaHJlZl49XCJtYWlsdG86XCJdKScgKS5jbGljayggZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0Ly8gdHJhY2sgZG93bmxvYWRzXG5cdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5zcGVjaWFsLmRvd25sb2FkX3JlZ2V4ICkge1xuXHRcdFx0XHRcdHZhciB1cmwgPSB0aGlzLmhyZWY7XG5cdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWQgPSBuZXcgUmVnRXhwKCBcIlxcXFwuKFwiICsgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLnNwZWNpYWwuZG93bmxvYWRfcmVnZXggKyBcIikoW1xcPyNdLiopPyRcIiwgXCJpXCIgKTtcblx0XHRcdFx0XHR2YXIgaXNEb3dubG9hZCA9IGNoZWNrRG93bmxvYWQudGVzdCggdXJsICk7XG5cdFx0XHRcdFx0aWYgKCB0cnVlID09PSBpc0Rvd25sb2FkICkge1xuXHRcdFx0XHRcdFx0dmFyIGNoZWNrRG93bmxvYWRFeHRlbnNpb24gPSBuZXcgUmVnRXhwKFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3Muc3BlY2lhbC5kb3dubG9hZF9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIik7XG5cdFx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uUmVzdWx0ID0gY2hlY2tEb3dubG9hZEV4dGVuc2lvbi5leGVjKCB1cmwgKTtcblx0XHRcdFx0XHRcdHZhciBleHRlbnNpb24gPSAnJztcblx0XHRcdFx0XHRcdGlmICggbnVsbCAhPT0gZXh0ZW5zaW9uUmVzdWx0ICkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHRbMV07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25SZXN1bHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyB3ZSBjYW4ndCB1c2UgdGhlIHVybCBmb3IgdGhlIHZhbHVlIGhlcmUsIGV2ZW4gdGhvdWdoIHRoYXQgd291bGQgYmUgbmljZSwgYmVjYXVzZSB2YWx1ZSBpcyBzdXBwb3NlZCB0byBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdEb3dubG9hZHMnLCBleHRlbnNpb24sIHRoaXMuaHJlZiApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9KTtcblxuXHRcdH1cblxuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuZW5hYmxlZCApIHtcblx0XHRcdC8vIGFueSBsaW5rIGNvdWxkIGJlIGFuIGFmZmlsaWF0ZSwgaSBndWVzcz9cblx0XHRcdCQoICdhJyApLmNsaWNrKCBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHQvLyB0cmFjayBhZmZpbGlhdGVzXG5cdFx0XHRcdGlmICggJycgIT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5hZmZpbGlhdGUuYWZmaWxpYXRlX3JlZ2V4ICkge1xuXHRcdFx0XHRcdHZhciBjaGVja0FmZmlsaWF0ZSA9IG5ldyBSZWdFeHAoIFwiXFxcXC4oXCIgKyBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MuYWZmaWxpYXRlLmFmZmlsaWF0ZV9yZWdleCArIFwiKShbXFw/I10uKik/JFwiLCBcImlcIiApO1xuXHRcdFx0XHRcdHZhciBpc0FmZmlsaWF0ZSA9IGNoZWNrQWZmaWxpYXRlLnRlc3QoIHVybCApO1xuXHRcdFx0XHRcdGlmICggdHJ1ZSA9PT0gaXNBZmZpbGlhdGUgKSB7XG5cdFx0XHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZmZpbGlhdGUnLCAnQ2xpY2snLCB0aGlzLmhyZWYgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gbGluayBmcmFnbWVudHMgYXMgcGFnZXZpZXdzXG5cdFx0Ly8gZG9lcyBub3QgdXNlIHRoZSBldmVudCB0cmFja2luZyBtZXRob2Rcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZyYWdtZW50ICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy5mcmFnbWVudC5lbmFibGVkICkge1xuXHRcdFx0aWYgKCB0eXBlb2YgZ2EgIT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHR3aW5kb3cub25oYXNoY2hhbmdlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0Z2EoICdzZW5kJywgJ3BhZ2V2aWV3JywgbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBsb2NhdGlvbi5oYXNoICk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBiYXNpYyBmb3JtIHN1Ym1pdHNcblx0XHRpZiAoICd1bmRlZmluZWQnICE9PSB0eXBlb2YgYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMgJiYgdHJ1ZSA9PT0gYW5hbHl0aWNzX3RyYWNraW5nX3NldHRpbmdzLmZvcm1fc3VibWlzc2lvbnMuZW5hYmxlZCApIHtcblx0XHRcdCQoICdpbnB1dFt0eXBlPVwic3VibWl0XCJdLCBidXR0b25bdHlwZT1cInN1Ym1pdFwiXScgKS5jbGljayggZnVuY3Rpb24oIGYgKSB7XG5cdCAgICAgICAgICAgIHZhciBjYXRlZ29yeSA9ICQoIHRoaXMgKS5kYXRhKCAnZ2EtY2F0ZWdvcnknICkgfHwgJ0Zvcm0nO1xuXHQgICAgICAgICAgICB2YXIgYWN0aW9uID0gJCggdGhpcyApLmRhdGEoICdnYS1hY3Rpb24nICkgfHwgJ1N1Ym1pdCc7XG5cdCAgICAgICAgICAgIHZhciBsYWJlbCA9ICQoIHRoaXMgKS5kYXRhKCAnZ2EtbGFiZWwnICkgfHwgdGhpcy5uYW1lIHx8IHRoaXMudmFsdWU7XG5cdCAgICAgICAgICAgIHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgY2F0ZWdvcnksIGFjdGlvbiwgbGFiZWwgKTtcblx0ICAgICAgICB9KTtcblx0XHR9XG5cblx0fVxuXG5cdCQoIGRvY3VtZW50ICkucmVhZHkoIGZ1bmN0aW9uKCkge1xuXHRcdGlmICggJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBhbmFseXRpY3NfdHJhY2tpbmdfc2V0dGluZ3MudHJhY2tfYWRibG9ja2VyICYmIHRydWUgPT09IGFuYWx5dGljc190cmFja2luZ19zZXR0aW5ncy50cmFja19hZGJsb2NrZXIuZW5hYmxlZCApIHtcblx0XHRcdGlmICggdHlwZW9mIHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IgPT09ICd1bmRlZmluZWQnICkge1xuXHRcdFx0XHR3cF9hbmFseXRpY3NfdHJhY2tpbmdfZXZlbnQoICdldmVudCcsICdBZGJsb2NrJywgJ09uJywgeyAnbm9uSW50ZXJhY3Rpb24nOiAxIH0gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpbmRvdy5hZGJsb2NrRGV0ZWN0b3IuaW5pdChcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRkZWJ1ZzogZmFsc2UsXG5cdFx0XHRcdFx0XHRmb3VuZDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHdwX2FuYWx5dGljc190cmFja2luZ19ldmVudCggJ2V2ZW50JywgJ0FkYmxvY2snLCAnT24nLCB7ICdub25JbnRlcmFjdGlvbic6IDEgfSApO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG5vdEZvdW5kOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFx0d3BfYW5hbHl0aWNzX3RyYWNraW5nX2V2ZW50KCAnZXZlbnQnLCAnQWRibG9jaycsICdPZmYnLCB7ICdub25JbnRlcmFjdGlvbic6IDEgfSApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG59ICkoIGpRdWVyeSApO1xuIl19
