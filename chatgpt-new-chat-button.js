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
  // menu triggers are Radix elements that open the GPT dropdown (e.g. the "Auto" model selector)
  // the markup can change frequently so keep these patterns broad; we also fall back to
  // any element with aria-haspopup="menu" in triggerNewChat().
  const MENU_TRIGGER_SELECTORS = [
    'div[id^="radix_-r"]',
    'div[id^="radix-"]',
    'button[id^="radix_-r"]',
    'button[id^="radix-"]',
    '[id^="radix_-r"][role="button"]',
    '[id^="radix-"][role="button"]',
    '[aria-haspopup="menu"]',
  ];

  /**
   * @param {Element | null} element
   * @returns {boolean}
   */
  function isVisible(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  /**
   * Tries to click obvious New chat controls that already exist in the page.
   * @returns {boolean}
   */
  function clickDirectNewChatControl() {
    // look for any element that clearly represents a "new chat" action; avoid
    // blindly clicking the homepage link (`a[href="/"]`) because that often
    // just reloads the page and prevents us from opening the dropdown menu.
    const directSelectors = [
      'a[aria-label="New chat"]',
      'button[aria-label="New chat"]',
      // intentionally omit `a[href="/"]` to keep the logic focused on actual
      // new‑chat controls that contain the text or aria-label.
      '[data-testid*="new-chat"]',
      '[data-testid*="new_chat"]',
      '[data-testid*="create-new-chat"]',
      '[data-testid*="newConversation"]',
    ];

    for (const selector of directSelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const element of candidates) {
        const text = (element.textContent || "").trim().toLowerCase();
        const ariaLabel = (element.getAttribute("aria-label") || "")
          .trim()
          .toLowerCase();

        if (
          isVisible(element) &&
          (text.includes("new chat") || ariaLabel.includes("new chat"))
        ) {
          element.click();
          return true;
        }
      }
    }

    const textCandidates = document.querySelectorAll(
      'button, a, div[role="button"], [type="button"]',
    );

    for (const element of textCandidates) {
      const text = (element.textContent || "").trim().toLowerCase();
      if (isVisible(element) && text === "new chat") {
        element.click();
        return true;
      }
    }

    return false;
  }

  /**
   * Finds and clicks a visible element whose text content matches "New chat".
   * @returns {boolean}
   */
  function clickNewChatMenuItem() {
    // prefer items that are part of an open "menu" (radix dropdowns use role=menu)
    const menuCandidates = document.querySelectorAll(
      '[role="menu"] [role="menuitem"], [role="menu"] button, [role="menu"] a',
    );
    for (const element of menuCandidates) {
      const text = (element.textContent || "").trim().toLowerCase();
      if (text === "new chat") {
        element.click();
        return true;
      }
    }

    // fallback to global search but explicitly ignore sidebar links that are always
    // present and not part of the dropdown we just opened
    const candidates = document.querySelectorAll(
      'button, div[role="menuitem"], a, [type="button"]',
    );
    for (const element of candidates) {
      if (
        element.closest("aside") ||
        element.hasAttribute("data-sidebar-item")
      ) {
        continue;
      }
      const text = (element.textContent || "").trim().toLowerCase();
      if (isVisible(element) && text === "new chat") {
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
  // click the first visible div whose text equals "Solis V" (model header); this
  // is the element the user indicated should be clicked to open the menu.
  function clickFirstSolisV() {
    // grab all visible dropdown buttons that start with "Solis V"; there are
    // sometimes duplicates in the page, and the user wants the one that actually
    // opens the model menu, which appears later in the DOM.  We'll click the
    // *last* candidate therefore.
    const candidates = Array.from(
      document.querySelectorAll('div[type="button"][aria-haspopup="menu"]'),
    ).filter((el) => {
      if (!isVisible(el)) return false;
      const text = el.textContent.trim();
      return text.startsWith("Solis V");
    });

    if (candidates.length) {
      candidates[candidates.length - 1].click();
      return true;
    }
    return false;
  }

  async function triggerNewChat() {
    if (clickFirstSolisV()) {
      // wait for menu to open before trying to select the new chat item
      await sleep(120);
      clickNewChatMenuItem();
      return;
    }

    if (clickDirectNewChatControl()) {
      return;
    }

    const triggers = [];
    for (const selector of MENU_TRIGGER_SELECTORS) {
      const found = document.querySelectorAll(selector);
      for (const element of found) {
        if (isVisible(element)) {
          triggers.push(element);
        }
      }
    }

    if (!triggers.length) {
      // try a last–ditch search for the model selector button itself (text = "Auto" /
      // "GPT-4", etc.) in case our generic selectors missed it.
      const autoButtons = Array.from(
        document.querySelectorAll('div[role="button"], button, a'),
      ).filter(
        (el) => isVisible(el) && el.textContent.trim().toLowerCase() === "auto",
      );
      if (autoButtons.length) {
        triggers.push(...autoButtons);
      }
    }

    if (!triggers.length) {
      console.warn(
        "[ChatGPT New Chat Floating Button] No direct New chat control or Radix trigger was found.",
      );
      return;
    }

    console.log(
      `[ChatGPT New Chat Floating Button] Found ${triggers.length} trigger candidate(s).`,
    );

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
