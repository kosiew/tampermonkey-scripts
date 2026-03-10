// ==UserScript==
// @name         ChatGPT New Chat Floating Button
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a floating New Chat button on GPT pages and triggers the native New chat action.
// @author       You
// @match        https://chatgpt.com/g/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const FLOATING_BUTTON_ID = "tm-new-chat-floating-button";
  const MENU_TRIGGER_SELECTOR = 'div[id^="radix_-r"][type="button"]';

  /**
   * Finds and clicks a visible element whose text content matches "New chat".
   * @returns {boolean}
   */
  function clickNewChatMenuItem() {
    const candidates = document.querySelectorAll(
      'button, div[role="menuitem"], a, [type="button"]',
    );

    for (const element of candidates) {
      const text = (element.textContent || "").trim().toLowerCase();
      if (text === "new chat") {
        element.click();
        return true;
      }
    }

    return false;
  }

  /**
   * Wait helper used after opening menus to allow DOM updates.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Attempts to open each Radix trigger and click the "New chat" menu item.
   */
  async function triggerNewChat() {
    const triggers = document.querySelectorAll(MENU_TRIGGER_SELECTOR);

    if (!triggers.length) {
      console.warn(
        "[ChatGPT New Chat Floating Button] No matching triggers found.",
      );
      return;
    }

    for (const trigger of triggers) {
      trigger.click();
      await sleep(120);

      if (clickNewChatMenuItem()) {
        return;
      }

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await sleep(60);
    }

    console.warn(
      "[ChatGPT New Chat Floating Button] 'New chat' menu item was not found.",
    );
  }

  /**
   * Creates a floating action button at the bottom right of the page.
   */
  function ensureFloatingButton() {
    if (document.getElementById(FLOATING_BUTTON_ID)) {
      return;
    }

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
      void triggerNewChat();
    });

    document.body.appendChild(button);
  }

  function init() {
    ensureFloatingButton();

    // Re-assert button for SPA transitions if ChatGPT re-renders the page.
    const observer = new MutationObserver(() => {
      ensureFloatingButton();
    });

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
