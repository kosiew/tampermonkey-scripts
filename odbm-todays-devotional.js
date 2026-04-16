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

  const LOG_PREFIX = "[ODBM Devotional]";
  const WAIT_TIMEOUT = 15000;
  const STORAGE_KEY = "odbm-todays-devotional-last-click-date";
  const CLEAR_BUTTON_ID = "odbm-devotional-clear-button";
  const TOAST_ID = "odbm-devotional-clear-toast";
  const DEVOTIONAL_SELECTOR = "#results-section > section > a";

  let hasClickedDevotional = false;

  console.log(LOG_PREFIX, "script loaded", window.location.href);

  function logInfo(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logWarn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function getTodayDateString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getLastClickDate() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      logWarn("unable to read last click date", error);
      return null;
    }
  }

  function setLastClickDate(dateString) {
    try {
      localStorage.setItem(STORAGE_KEY, dateString);
    } catch (error) {
      logWarn("unable to save last click date", error);
    }
  }

  function removeElementById(elementId) {
    const element = document.getElementById(elementId);
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  function clearLastClickDate() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      logInfo("cleared last click date from storage");
      removeElementById(CLEAR_BUTTON_ID);
      showToast("ODBM devotional cache cleared");
    } catch (error) {
      logWarn("unable to clear last click date", error);
    }
  }

  function showToast(message, duration = 3000) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.style.position = "fixed";
      toast.style.bottom = "90px";
      toast.style.right = "20px";
      toast.style.padding = "10px 14px";
      toast.style.background = "rgba(0, 0, 0, 0.85)";
      toast.style.color = "#fff";
      toast.style.borderRadius = "6px";
      toast.style.fontSize = "13px";
      toast.style.zIndex = "10001";
      toast.style.boxShadow = "0 3px 12px rgba(0,0,0,0.25)";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.transition = "";
    toast.style.opacity = "1";

    if (toast.dismissTimeoutId) {
      window.clearTimeout(toast.dismissTimeoutId);
    }

    toast.dismissTimeoutId = window.setTimeout(() => {
      toast.style.transition = "opacity 0.3s ease";
      toast.style.opacity = "0";
    }, duration);
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

  async function clickFirstDevotionalResult() {
    logInfo("waiting for devotional results selector:", DEVOTIONAL_SELECTOR);
    const anchor = await waitForSelector(DEVOTIONAL_SELECTOR);
    if (!anchor) {
      logWarn("no result anchor found for selector", DEVOTIONAL_SELECTOR);
      return false;
    }

    logInfo("clicking first devotional result anchor", anchor.href || anchor);
    if (typeof anchor.click === "function") {
      anchor.click();
    } else if (anchor.href) {
      window.location.href = anchor.href;
    }

    return true;
  }

  function ensureClearStorageButton() {
    if (getLastClickDate() !== null) {
      createClearStorageButton();
    }
  }

  async function clickTodaysDevotional() {
    logInfo("clickTodaysDevotional started");
    if (hasClickedDevotional) {
      logInfo("already clicked in this page load, skipping");
      return;
    }

    const today = getTodayDateString();
    const lastClickDate = getLastClickDate();

    if (lastClickDate === today) {
      logInfo("already clicked today, skipping auto-click", today);
      hasClickedDevotional = true;
      ensureClearStorageButton();
      return;
    }

    const clicked = await clickFirstDevotionalResult();
    if (clicked) {
      hasClickedDevotional = true;
      setLastClickDate(today);
      ensureClearStorageButton();
      return;
    }

    logWarn("no devotional result anchor was found");
  }

  function createClearStorageButton() {
    if (document.getElementById(CLEAR_BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = CLEAR_BUTTON_ID;
    button.type = "button";
    button.textContent = "Clear devotional cache";
    button.style.position = "fixed";
    button.style.bottom = "20px";
    button.style.right = "20px";
    button.style.padding = "10px 14px";
    button.style.backgroundColor = "#1a73e8";
    button.style.color = "#fff";
    button.style.border = "none";
    button.style.borderRadius = "8px";
    button.style.cursor = "pointer";
    button.style.fontSize = "13px";
    button.style.zIndex = "10000";
    button.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
    button.style.opacity = "0.95";

    button.addEventListener("click", () => {
      clearLastClickDate();
    });

    document.body.appendChild(button);
  }

  function init() {
    logInfo("init(), document.readyState=", document.readyState);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        logInfo("DOMContentLoaded");
        clickTodaysDevotional();
        ensureClearStorageButton();
      });
    } else {
      clickTodaysDevotional();
      ensureClearStorageButton();
    }
  }

  init();
})();
