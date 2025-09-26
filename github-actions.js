// ==UserScript==
// @name         GitHub Actions Monitor
// @namespace    https://github.com/kosiew/tampermonkey-scripts
// @version      0.1.0
// @description  Monitor GitHub Actions page for "In progress" runs and notify when all are finished
// @author       Your Name
// @match        https://github.com/*/*/actions
// @grant        GM_notification
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Configuration
  const POLL_INTERVAL_MS = 5000; // how often to check (5s)

  // Utility: find spans indicating pending runs ("in progress" or "queued", case-insensitive)
  function findPendingSpans() {
    // The user provided sample selector path; we'll be flexible and search for spans that contain the text "In progress" or "Queued" (case-insensitive)
    const spans = Array.from(document.querySelectorAll("span"));
    return spans.filter((s) => {
      if (!s.textContent) return false;
      const t = s.textContent.trim();
      return /in\s*progress/i.test(t) || /queued/i.test(t);
    });
  }

  // Notify helper
  function notifyAllComplete(repoFullName) {
    const title = `GitHub Actions - ${repoFullName}`;
    const text = `All Actions for ${repoFullName} have completed`;
    if (typeof GM_notification === "function") {
      GM_notification({ title, text, timeout: 5000 });
    } else if (window.Notification) {
      try {
        if (Notification.permission === "granted") {
          new Notification(title, { body: text });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((p) => {
            if (p === "granted") new Notification(title, { body: text });
          });
        }
      } catch (e) {
        console.log(title, text);
      }
    } else {
      console.log(title, text);
    }
  }

  // Notify that monitoring has started
  function notifyMonitoringStarted(repoFullName) {
    const title = `GitHub Actions - ${repoFullName}`;
    const text = `Started monitoring Actions for ${repoFullName}`;
    if (typeof GM_notification === "function") {
      GM_notification({ title, text, timeout: 3000 });
    } else if (window.Notification) {
      try {
        if (Notification.permission === "granted") {
          new Notification(title, { body: text });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((p) => {
            if (p === "granted") new Notification(title, { body: text });
          });
        }
      } catch (e) {
        console.log(title, text);
      }
    } else {
      console.log(title, text);
    }
  }

  // Derive repo name from URL
  function getRepoFullName() {
    const m = location.pathname.split("/").filter(Boolean);
    if (m.length >= 2) return m[0] + "/" + m[1];
    return location.hostname + location.pathname;
  }

  let intervalId = null;

  function checkAndNotify() {
    try {
      const pending = findPendingSpans();
      // For debugging: console.log('pending count', pending.length);
      if (pending.length === 0) {
        // No in-progress runs, notify and stop
        const repo = getRepoFullName();
        notifyAllComplete(repo);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    } catch (e) {
      console.error("Error checking Actions status", e);
    }
  }

  // Start polling
  function start() {
    // If navigated away or not an actions page, don't start
    if (!/\/actions(\/|$)/.test(location.pathname)) return;
    // Notify that monitoring has started
    try {
      notifyMonitoringStarted(getRepoFullName());
    } catch (e) {
      // ignore notification errors
    }
    // Run immediately then poll
    checkAndNotify();
    intervalId = setInterval(checkAndNotify, POLL_INTERVAL_MS);

    // Also observe DOM changes to run checks faster when content updates
    const observer = new MutationObserver(() => {
      // If already stopped, disconnect
      if (!intervalId) return observer.disconnect();
      checkAndNotify();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Start after page load
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    start();
  } else {
    window.addEventListener("DOMContentLoaded", start);
  }
})();
