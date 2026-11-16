// ==UserScript==
// @name         ChatGPT New Chat Floating Button
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Adds a floating New Chat button on GPT pages and triggers the native New chat action.
// @author       Siew Kam Onn
// @match        https://chatgpt.com/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/chatgpt-new-chat-button.js
// @updateURL    https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/chatgpt-new-chat-button.js
// ==/UserScript==

(function () {
  "use strict";

  const FLOATING_BUTTON_ID = "tm-new-chat-floating-button";

  // Icons are built with DOM APIs (not innerHTML) so they work under
  // ChatGPT's Trusted Types policy.
  const SVG_NS = "http://www.w3.org/2000/svg";

  function createSvg() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    return svg;
  }

  // Pencil-on-square "compose" icon.
  function createNewChatIcon() {
    const svg = createSvg();
    for (const d of [
      "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
      "M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z",
    ]) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  // Spinning arc shown after click while the page navigates. Uses SVG
  // animateTransform so no stylesheet/keyframes are needed.
  function createLoadingIcon() {
    const svg = createSvg();
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M21 12a9 9 0 1 1-6.219-8.56");
    const spin = document.createElementNS(SVG_NS, "animateTransform");
    spin.setAttribute("attributeName", "transform");
    spin.setAttribute("type", "rotate");
    spin.setAttribute("from", "0 12 12");
    spin.setAttribute("to", "360 12 12");
    spin.setAttribute("dur", "0.8s");
    spin.setAttribute("repeatCount", "indefinite");
    path.appendChild(spin);
    svg.appendChild(path);
    return svg;
  }

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
    button.title = "New Chat";
    button.setAttribute("aria-label", "New Chat");
    button.appendChild(createNewChatIcon());
    button.style.position = "fixed";
    button.style.right = "20px";
    button.style.bottom = "20px";
    button.style.width = "44px";
    button.style.height = "44px";
    button.style.padding = "0";
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.border = "none";
    button.style.borderRadius = "50%";
    button.style.background = "#0f766e";
    button.style.color = "#ffffff";
    button.style.cursor = "pointer";
    button.style.zIndex = "2147483647";
    button.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.2)";
    button.style.transition = "background 0.12s ease, transform 0.12s ease";

    button.addEventListener("click", () => {
      button.style.background = "#2563eb";
      button.style.transform = "scale(0.98)";
      button.replaceChildren(createLoadingIcon());

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

      setTimeout(() => {
        window.location.href = origin + path;
      }, 120);
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
