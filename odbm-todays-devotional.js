// ==UserScript==
// @name         ODBM Today's Devotional Auto-Click
// @namespace    http://tampermonkey.net/
// @version      2026-04-13
// @description  Automatically clicks the first Today's Devotional link on odbm.org/en-GB
// @author       You
// @match        https://www.odbm.org/en-GB/devotional*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  console.log("[ODBM Devotional] script loaded", window.location.href);
  let hasClickedDevotional = false;
  const WAIT_TIMEOUT = 15000;
  const STORAGE_KEY = "odbm-todays-devotional-last-click-date";

  function getTodayDateString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getLastClickDate() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn("[ODBM Devotional] unable to read last click date", error);
      return null;
    }
  }

  function setLastClickDate(dateString) {
    try {
      localStorage.setItem(STORAGE_KEY, dateString);
    } catch (error) {
      console.warn("[ODBM Devotional] unable to save last click date", error);
    }
  }

  function waitForSelector(selector, timeout = WAIT_TIMEOUT) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function findAndClickTodaysDevotional() {
    const selector = "#results-section > section > a";
    console.log(
      "[ODBM Devotional] waiting for devotional results selector:",
      selector,
    );
    const anchor = await waitForSelector(selector);
    if (!anchor) {
      console.warn(
        "[ODBM Devotional] no result anchor found for selector",
        selector,
      );
      return false;
    }

    console.log(
      "[ODBM Devotional] clicking first devotional result anchor",
      anchor.href || anchor,
    );
    if (typeof anchor.click === "function") {
      anchor.click();
    } else if (anchor.href) {
      window.location.href = anchor.href;
    }
    return true;
  }

  async function clickTodaysDevotional() {
    console.log("[ODBM Devotional] clickTodaysDevotional started");
    if (hasClickedDevotional) {
      console.log(
        "[ODBM Devotional] already clicked in this page load, skipping",
      );
      return;
    }

    const today = getTodayDateString();
    const lastClickDate = getLastClickDate();
    if (lastClickDate === today) {
      console.log(
        "[ODBM Devotional] already clicked today, skipping auto-click",
        today,
      );
      hasClickedDevotional = true;
      return;
    }

    const clicked = await findAndClickTodaysDevotional();
    if (clicked) {
      hasClickedDevotional = true;
      setLastClickDate(today);
      return;
    }

    console.warn("[ODBM Devotional] no devotional result anchor was found");
  }

  function init() {
    console.log(
      "[ODBM Devotional] init(), document.readyState=",
      document.readyState,
    );
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        console.log("[ODBM Devotional] DOMContentLoaded");
        clickTodaysDevotional();
      });
    } else {
      clickTodaysDevotional();
    }
  }

  init();
})();
