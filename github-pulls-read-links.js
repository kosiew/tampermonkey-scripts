// ==UserScript==
// @name         GitHub Pulls Read Links
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Open PR links in new tabs and mark visited PRs as read for 2 weeks.
// @author       You
// @match        https://github.com/*/*/pulls*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "tm_github_pulls_read_links_v1";
  const TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const LINK_ID_REGEX = /^issue_(\d+)_link$/;
  const READ_CLASS = "tm-pulls-read-link";

  function getRepoKey() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length < 3) {
      return null;
    }
    return `${parts[0]}/${parts[1]}`;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
    const links = document.querySelectorAll('a[id^="issue_"][id$="_link"]');
    return Array.from(links).filter((link) => LINK_ID_REGEX.test(link.id));
  }

  function markLinksForCurrentRepo() {
    const repoKey = getRepoKey();
    if (!repoKey) {
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

      if (Object.prototype.hasOwnProperty.call(repoData, link.id)) {
        link.classList.add(READ_CLASS);
      } else {
        link.classList.remove(READ_CLASS);
      }
    }
  }

  function markLinkAsRead(link) {
    const repoKey = getRepoKey();
    if (!repoKey || !LINK_ID_REGEX.test(link.id)) {
      return;
    }

    const now = Date.now();
    const store = loadStore();
    pruneExpired(store, now);

    if (!store[repoKey] || typeof store[repoKey] !== "object") {
      store[repoKey] = {};
    }

    store[repoKey][link.id] = now;
    saveStore(store);

    link.classList.add(READ_CLASS);
  }

  function onDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest('a[id^="issue_"][id$="_link"]');
    if (!link || !LINK_ID_REGEX.test(link.id)) {
      return;
    }

    link.target = "_blank";
    link.rel = "noopener noreferrer";
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
