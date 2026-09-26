// ==UserScript==
// @name         GitHub Pulls Read Links
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Open PR/issue links in new tabs and mark visited PRs/issues as read for 30 days.
// @author       You
// @match        https://github.com/*/*/pulls*
// @match        https://github.com/*/*/issues*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "tm_github_pulls_read_links_v1";
  // Switch storage backend here: "gmStorage" or "localStorage".
  const STORAGE_BACKEND = "gmStorage";
  const STORAGE_DAYS = 30; // Number of days to keep read links.
  const TTL_MS = STORAGE_DAYS * 24 * 60 * 60 * 1000;
  const LINK_ID_REGEX = /^issue_(\d+)_link$/;
  const TRACKED_LINK_SELECTOR = [
    'a[data-hovercard-type="pull_request"]',
    'a[data-hovercard-type="issue"]',
    'a[data-testid="issue-listitem-title-link"]',
  ].join(", ");
  // PRs and issues share one number space per repo, so ids never collide.
  const LINK_NUMBER_REGEX = /\/(?:pull|issues)\/(\d+)(?:[/?#]|$)/;
  // List pages only; skips detail pages like /issues/123 matched by @match.
  const LIST_PAGE_REGEX = /^\/[^/]+\/[^/]+\/(?:pulls|issues)(?!\/\d)/;
  const READ_CLASS = "tm-pulls-read-link";
  const NEW_TAB_TITLE = "Open in a new tab";

  const StorageStrategies = {
    localStorage: {
      read(key) {
        return window.localStorage.getItem(key);
      },
      write(key, raw) {
        window.localStorage.setItem(key, raw);
      },
    },
    gmStorage: {
      read(key) {
        if (typeof GM_getValue !== "function") {
          return null;
        }
        return GM_getValue(key, null);
      },
      write(key, raw) {
        if (typeof GM_setValue !== "function") {
          return;
        }
        GM_setValue(key, raw);
      },
    },
  };

  const storageStrategy =
    StorageStrategies[STORAGE_BACKEND] || StorageStrategies.localStorage;

  function isListPage() {
    return LIST_PAGE_REGEX.test(window.location.pathname);
  }

  function getRepoKey() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length < 3) {
      return null;
    }
    return `${parts[0]}/${parts[1]}`;
  }

  function loadStore() {
    try {
      const raw = storageStrategy.read(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
      return parsed;
    } catch (error) {
      return {};
    }
  }

  function saveStore(store) {
    try {
      storageStrategy.write(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      // Ignore storage write failures.
    }
  }

  function pruneExpired(store, now) {
    let changed = false;

    for (const repoKey of Object.keys(store)) {
      const ids = store[repoKey];
      if (!ids || typeof ids !== "object") {
        delete store[repoKey];
        changed = true;
        continue;
      }

      for (const id of Object.keys(ids)) {
        const ts = ids[id];
        if (typeof ts !== "number" || now - ts > TTL_MS) {
          delete ids[id];
          changed = true;
        }
      }

      if (Object.keys(ids).length === 0) {
        delete store[repoKey];
        changed = true;
      }
    }

    return changed;
  }

  function ensureStyle() {
    if (document.getElementById("tm-pulls-read-links-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "tm-pulls-read-links-style";
    style.textContent = `
      a.${READ_CLASS} {
        color: #57606a !important;
      }

      a.${READ_CLASS} .js-issue-row {
        opacity: 0.92;
      }
    `;
    document.head.appendChild(style);
  }

  function getTrackedLinks() {
    return Array.from(document.querySelectorAll(TRACKED_LINK_SELECTOR))
      .map((link) => getTrackedLink(link))
      .filter(Boolean);
  }

  function markLinksForCurrentRepo() {
    const repoKey = getRepoKey();
    if (!repoKey || !isListPage()) {
      return;
    }

    const now = Date.now();
    const store = loadStore();
    if (pruneExpired(store, now)) {
      saveStore(store);
    }

    const repoData = store[repoKey] || {};

    for (const link of getTrackedLinks()) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = NEW_TAB_TITLE;

      if (Object.prototype.hasOwnProperty.call(repoData, link.id)) {
        link.classList.add(READ_CLASS);
      } else {
        link.classList.remove(READ_CLASS);
      }
    }
  }

  function markLinkAsRead(link) {
    const repoKey = getRepoKey();
    const trackedLink = getTrackedLink(link);
    if (!repoKey || !trackedLink) {
      return;
    }

    const linkId = trackedLink.id;

    const now = Date.now();
    const store = loadStore();
    pruneExpired(store, now);

    if (!store[repoKey] || typeof store[repoKey] !== "object") {
      store[repoKey] = {};
    }

    store[repoKey][linkId] = now;
    saveStore(store);

    trackedLink.classList.add(READ_CLASS);
  }

  function getTrackedLink(element) {
    const link = element.closest(TRACKED_LINK_SELECTOR);
    if (!link) {
      return null;
    }

    const match = link.href.match(LINK_NUMBER_REGEX);
    if (!match) {
      return null;
    }

    if (!LINK_ID_REGEX.test(link.id)) {
      link.id = `issue_${match[1]}_link`;
    }
    return link;
  }

  function onDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element) || !isListPage()) {
      return;
    }

    const link = getTrackedLink(target);
    if (!link) {
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = NEW_TAB_TITLE;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.open(link.href, "_blank", "noopener,noreferrer");
    markLinkAsRead(link);
  }

  let repaintTimer = null;
  function scheduleMarking() {
    if (repaintTimer) {
      clearTimeout(repaintTimer);
    }

    repaintTimer = setTimeout(() => {
      markLinksForCurrentRepo();
      repaintTimer = null;
    }, 120);
  }

  function setupObservers() {
    const observer = new MutationObserver(() => {
      scheduleMarking();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("pjax:end", scheduleMarking, true);
    window.addEventListener("turbo:load", scheduleMarking, true);
    window.addEventListener("turbo:render", scheduleMarking, true);
    window.addEventListener("popstate", scheduleMarking, true);
  }

  function init() {
    ensureStyle();
    markLinksForCurrentRepo();
    document.addEventListener("click", onDocumentClick, true);
    setupObservers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
