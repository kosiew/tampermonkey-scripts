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

  function clearLastClickDate() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log("[ODBM Devotional] cleared last click date from storage");
      showToast("ODBM devotional cache cleared");
    } catch (error) {
      console.warn("[ODBM Devotional] unable to clear last click date", error);
    }
  }

  function showToast(message, duration = 3000) {
    const toastId = "odbm-devotional-clear-toast";
    let toast = document.getElementById(toastId);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = toastId;
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
    toast.style.opacity = "1";
    window.clearTimeout(toast.dismissTimeout);
    toast.dismissTimeout = window.setTimeout(() => {
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

  function createClearStorageButton() {
    const buttonId = "odbm-devotional-clear-button";
    if (document.getElementById(buttonId)) {
      return;
    }

    const button = document.createElement("button");
    button.id = buttonId;
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
    console.log(
      "[ODBM Devotional] init(), document.readyState=",
      document.readyState,
    );
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        console.log("[ODBM Devotional] DOMContentLoaded");
        clickTodaysDevotional();
        createClearStorageButton();
      });
    } else {
      clickTodaysDevotional();
      createClearStorageButton();
    }
  }

  init();
})();
