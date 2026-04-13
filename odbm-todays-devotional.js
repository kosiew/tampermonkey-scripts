// ==UserScript==
// @name         ODBM Today's Devotional Auto-Click
// @namespace    http://tampermonkey.net/
// @version      2026-04-13
// @description  Automatically clicks the first Today's Devotional link on odbm.org/en-GB
// @author       You
// @match        https://www.odbm.org/en-GB/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const SESSION_KEY = "odbm-todays-devotional-clicked";
  const SEARCH_TEXT = "TODAY'S DEVOTIONAL";
  const WAIT_TIMEOUT = 15000;

  function waitForDevotionalAnchor(timeout = WAIT_TIMEOUT) {
    return new Promise((resolve) => {
      const findAnchor = () => {
        const divs = document.querySelectorAll("div");
        for (const div of divs) {
          if (
            div.textContent &&
            div.textContent.toUpperCase().includes(SEARCH_TEXT)
          ) {
            const anchor = div.querySelector("a");
            if (anchor) {
              return anchor;
            }
          }
        }
        return null;
      };

      const anchor = findAnchor();
      if (anchor) {
        resolve(anchor);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = findAnchor();
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function clickTodaysDevotional() {
    if (sessionStorage.getItem(SESSION_KEY)) {
      return;
    }

    const anchor = await waitForDevotionalAnchor();
    if (!anchor) {
      return;
    }

    sessionStorage.setItem(SESSION_KEY, "true");

    if (typeof anchor.click === "function") {
      anchor.click();
    } else if (anchor.href) {
      window.location.href = anchor.href;
    }
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", clickTodaysDevotional);
    } else {
      clickTodaysDevotional();
    }
  }

  init();
})();
