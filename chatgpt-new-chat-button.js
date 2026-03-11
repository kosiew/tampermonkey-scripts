// ==UserScript==
// @name         ChatGPT New Chat Floating Button
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds a floating New Chat button on GPT pages and triggers the native New chat action.
// @author       You
// @match        https://chatgpt.com/g/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const FLOATING_BUTTON_ID = "tm-new-chat-floating-button";

  function ensureFloatingButton() {
    const path = window.location.pathname;
    const existing = document.getElementById(FLOATING_BUTTON_ID);
    // only show the button on chat URLs that include '/c/'
    if (!path.includes("/c/")) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement("button");
    button.id = FLOATING_BUTTON_ID;
    button.type = "button";
    button.textContent = "New Chat";
    button.style.position = "fixed";
    button.style.right = "20px";
    button.style.bottom = "20px";
    button.style.padding = "10px 14px";
    button.style.border = "none";
    button.style.borderRadius = "8px";
    button.style.background = "#111827";
    button.style.color = "#ffffff";
    button.style.fontSize = "14px";
    button.style.fontWeight = "600";
    button.style.cursor = "pointer";
    button.style.zIndex = "2147483647";
    button.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.2)";

    button.addEventListener("click", () => {
      // navigate to the base GPT page by removing the '/c/...' suffix
      // when present.  e.g. '/g/xyz/c/abc' -> '/g/xyz/'.
      const origin = window.location.origin;
      let path = window.location.pathname;
      if (path.includes("/c/")) {
        path = path.split("/c/")[0] + "/";
      } else {
        // ensure trailing slash for consistency
        if (!path.endsWith("/")) path += "/";
      }
      window.location.href = origin + path;
    });

    document.body.appendChild(button);
  }

  function init() {
    ensureFloatingButton();
    const observer = new MutationObserver(ensureFloatingButton);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
