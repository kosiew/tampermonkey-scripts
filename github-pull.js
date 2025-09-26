// ==UserScript==
// @name         GitHub PR successful checks monitor
// @namespace    https://github.com/kosiew/tampermonkey-scripts
// @version      0.1
// @description  Watch GitHub PR pages and notify when the Discussion paragraph shows "N successful checks"
// @author       auto-generated
// @match        https://github.com/*/*/pull/*
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const selector = "#discussion_bucket p";
  const regex = /^\s*(\d+)\s+successful checks\s*$/i;

  let lastNotified = null;
  let completed = false;
  let startedNotified = false;
  let mainObserver = null;
  let bodyObserver = null;

  // parse PR number from URL
  const prMatch = location.pathname.match(/\/pull\/(\d+)/);
  const prNumber = prMatch ? prMatch[1] : "unknown";

  function notifyMessage(title, body) {
    try {
      if (typeof GM_notification === "function") {
        GM_notification({ title, text: body, timeout: 5000 });
      } else if (window.Notification && Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (window.Notification && Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification(title, { body });
        });
      } else {
        console.log(`[github-pull] ${title} - ${body}`);
      }
    } catch (e) {
      console.error("github-pull: notifyMessage error", e);
    }
  }

  function checkNode(node) {
    try {
      const text = node.textContent || "";
      const m = text.match(regex);
      if (m) {
        const count = m[1];
        if (lastNotified !== text) {
          lastNotified = text;
          const title = `PR ${prNumber} ${count} successful checks`;
          const body = text.trim();
          // completion notification
          notifyMessage(title, body);
          completed = true;
          // stop observers
          try {
            if (mainObserver && typeof mainObserver.disconnect === "function")
              mainObserver.disconnect();
            if (bodyObserver && typeof bodyObserver.disconnect === "function")
              bodyObserver.disconnect();
          } catch (e) {
            console.warn("github-pull: error disconnecting observers", e);
          }
        }
        return true;
      }
    } catch (e) {
      console.error("github-pull: checkNode error", e);
    }
    return false;
  }

  function scanOnce() {
    const el = document.querySelector(selector);
    if (el) checkNode(el);
  }

  // observe changes under discussion_bucket
  const container = document.querySelector("#discussion_bucket");
  function startObserving(containerEl) {
    if (startedNotified) return;
    startedNotified = true;
    notifyMessage("Started monitoring PR " + prNumber + " checks", "");
    // scan once right away
    scanOnce();
    mainObserver = new MutationObserver((mutations) => {
      if (completed) return;
      for (const mu of mutations) {
        for (const node of mu.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches("p")) {
              checkNode(node);
            } else {
              const p = node.querySelector && node.querySelector("p");
              if (p) checkNode(p);
            }
          }
        }
        if (
          mu.type === "characterData" &&
          mu.target &&
          mu.target.parentElement
        ) {
          const p =
            mu.target.parentElement.closest &&
            mu.target.parentElement.closest("p");
          if (p) checkNode(p);
        }
      }
    });
    mainObserver.observe(containerEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (container) {
    startObserving(container);
  } else {
    // if container not yet present, watch body for it
    bodyObserver = new MutationObserver(() => {
      const c = document.querySelector("#discussion_bucket");
      if (c) {
        if (bodyObserver && typeof bodyObserver.disconnect === "function")
          bodyObserver.disconnect();
        startObserving(c);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }
})();
