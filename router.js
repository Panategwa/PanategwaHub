(function(){
  "use strict";

  var PAGES = [
    "index.html",
    "panategwa-page.html",
    "panategwa-b-page.html",
    "panategwa-c-page.html",
    "panategwa-d-page.html",
    "panategwa-e-page.html",
    "panategwa-f-page.html",
    "panategwa-g-page.html",
    "panategwa-d-map-page.html",
    "panategwa-d-life-page.html",
    "panategwa-d-ideologies-page.html",
    "streak-page.html",
    "settings-page.html",
    "account-page.html",
    "pitons-page.html",
    "tri-panategwaoi-anthropoi-civilis-page.html",
    "empire-of-pitosia-page.html",
    "thrinsachelom-history-page.html",
    "dendrospheres-page.html",
    "bathythalassas-gigaperipatitis-page.html"
  ];

  var currentPage = null;
  var currentParams = {};
  var navigating = false;
  var styleElement = null;

  function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }

  function parseQueryString(qs) {
    var params = {};
    if (!qs) return params;
    var parts = qs.split("&");
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split("=");
      if (pair[0]) {
        params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
      }
    }
    return params;
  }

  function buildQueryString(params) {
    var parts = [];
    for (var key in params) {
      if (params.hasOwnProperty(key)) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    }
    return parts.join("&");
  }

  function isInternalHref(href) {
    if (!href) return null;
    var hashIdx = href.indexOf("#");
    var pathAndQuery = hashIdx !== -1 ? href.substring(0, hashIdx) : href;
    var qIndex = pathAndQuery.indexOf("?");
    var pathPart = qIndex !== -1 ? pathAndQuery.substring(0, qIndex) : pathAndQuery;
    for (var i = 0; i < PAGES.length; i++) {
      if (endsWith(pathPart, PAGES[i])) {
        return PAGES[i];
      }
    }
    return null;
  }

  function navigateTo(page, params, replace) {
    if (typeof params === "undefined") params = {};
    if (typeof replace === "undefined") replace = false;
    if (navigating) return;
    if (page === currentPage && JSON.stringify(params) === JSON.stringify(currentParams)) {
      return;
    }
    navigating = true;
    var hash = "#page=" + page;
    var qs = buildQueryString(params);
    if (qs) hash += "&" + qs;
    fetch(page, { cache: "no-store" })
      .then(function(response) {
        if (!response.ok) throw new Error("Fetch failed: " + response.status);
        return response.text();
      })
      .then(function(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");
        var styles = doc.head.querySelectorAll("style");
        if (!styleElement) {
          styleElement = document.createElement("style");
          styleElement.id = "panategwa-route-style";
          document.head.appendChild(styleElement);
        }
        var combinedStyles = "";
        for (var i = 0; i < styles.length; i++) {
          combinedStyles += styles[i].textContent;
        }
        styleElement.textContent = combinedStyles;
        var clone = doc.body.cloneNode(true);
        var menuContainer = clone.querySelector("#menu-container");
        if (menuContainer) menuContainer.remove();
        var scripts = clone.querySelectorAll("script");
        var inlineScripts = [];
        for (var i = 0; i < scripts.length; i++) {
          if (!scripts[i].hasAttribute("src")) {
            inlineScripts.push(scripts[i].textContent);
          }
        }
        for (var i = 0; i < scripts.length; i++) {
          scripts[i].remove();
        }
        var contentHost = document.getElementById("page-content");
        contentHost.innerHTML = "";
        contentHost.appendChild(clone);
        for (var i = 0; i < inlineScripts.length; i++) {
          var scr = document.createElement("script");
          scr.textContent = inlineScripts[i];
          document.body.appendChild(scr);
          scr.remove();
        }
        currentPage = page;
        currentParams = params;
        var newUrl = window.location.pathname + window.location.search + hash;
        if (replace) {
          history.replaceState({}, "", newUrl);
        } else {
          history.pushState({}, "", newUrl);
        }
        window.dispatchEvent(new CustomEvent("panategwa:routechange", {
          detail: { page: page, params: params }
        }));
        navigating = false;
      })
      .catch(function(err) {
        console.error("PanategwaRouter: navigation error for page " + page, err);
        navigating = false;
      });
  }

  function getCurrentPage() {
    return currentPage;
  }

  function syncParams(params) {
    currentParams = params;
    var hash = "#page=" + currentPage;
    var qs = buildQueryString(params);
    if (qs) hash += "&" + qs;
    history.replaceState({}, "", window.location.pathname + window.location.search + hash);
    window.dispatchEvent(new CustomEvent("panategwa:routechange", {
      detail: { page: currentPage, params: params }
    }));
  }

  function PanategwaNavigate(page, params) {
    if (typeof params === "undefined") params = {};
    navigateTo(page, params, false);
  }

  function getPageFromHash() {
    var hash = window.location.hash;
    if (!hash) return null;
    if (hash.indexOf("#page=") !== 0) return null;
    var rest = hash.substring(6);
    var parts = rest.split("&");
    var page = parts[0];
    var params = {};
    for (var i = 1; i < parts.length; i++) {
      var pair = parts[i].split("=");
      if (pair[0]) {
        params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
      }
    }
    return { page: page, params: params };
  }

  function getPageFromPathname() {
    var path = window.location.pathname;
    var segments = path.split("/");
    var last = segments[segments.length - 1];
    if (!last) return "index.html";
    if (last.indexOf(".") === -1) return "index.html";
    return last;
  }

  function init() {
    var attempts = 0;
    var maxAttempts = 200;
    function tryInit() {
      var contentHost = document.getElementById("page-content");
      if (!contentHost) {
        attempts++;
        if (attempts >= maxAttempts) return;
        setTimeout(tryInit, 10);
        return;
      }
      var hashInfo = getPageFromHash();
      var pathPage = getPageFromPathname();
      var page = hashInfo ? hashInfo.page : pathPage;
      var params = hashInfo ? hashInfo.params : {};
      if (hashInfo && hashInfo.page !== pathPage) {
        navigateTo(hashInfo.page, hashInfo.params, true);
      } else if (hashInfo && hashInfo.page === pathPage && JSON.stringify(hashInfo.params) !== JSON.stringify(currentParams)) {
        currentPage = pathPage;
        syncParams(hashInfo.params);
      } else {
        currentPage = page;
        currentParams = params;
        var hash = "#page=" + page;
        if (Object.keys(params).length > 0) {
          hash += "&" + buildQueryString(params);
        }
        history.replaceState({}, "", window.location.pathname + window.location.search + hash);
      }
    }
    tryInit();
    document.addEventListener("click", function(e) {
      var target = e.target;
      while (target && target !== document) {
        if (target.tagName === "A" && target.getAttribute("href")) {
          var href = target.getAttribute("href");
          var linkTarget = target.getAttribute("target") || "";
          if (linkTarget && linkTarget.toLowerCase() !== "_self") return;
          var lowerHref = href.toLowerCase();
          if (lowerHref.indexOf("http://") === 0 ||
              lowerHref.indexOf("https://") === 0 ||
              lowerHref.indexOf("mailto:") === 0 ||
              lowerHref.indexOf("tel:") === 0 ||
              lowerHref.indexOf("javascript:") === 0) return;
          if (target.hasAttribute("download")) return;
          var ipage = isInternalHref(href);
          if (ipage) {
            e.preventDefault();
            var params = {};
            var qIndex = href.indexOf("?");
            if (qIndex !== -1) {
              var qs = href.substring(qIndex + 1);
              params = parseQueryString(qs);
            }
            navigateTo(ipage, params, false);
          }
          return;
        }
        target = target.parentNode;
      }
    });
    window.addEventListener("popstate", function() {
      var hashInfo = getPageFromHash();
      if (hashInfo) {
        navigateTo(hashInfo.page, hashInfo.params, true);
      }
    });
  }

  window.PanategwaRouter = {
    navigateTo: navigateTo,
    getCurrentPage: getCurrentPage,
    syncParams: syncParams,
    isInternalHref: isInternalHref
  };
  window.PanategwaNavigate = PanategwaNavigate;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
