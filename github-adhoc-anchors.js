// ==UserScript==
// @name         GitHub + ChatGPT Adhoc Anchors
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add temporary anchors on GitHub issue/PR pages and ChatGPT conversations
// @author       Siew Kam Onn
// @match        https://github.com/*/*/issues/*
// @match        https://github.com/*/*/pull/*
// @match        https://chatgpt.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @grant        GM.notification
// @grant        GM.setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "github_adhoc_anchors";
  const PANEL_POSITION_KEY = "github_adhoc_anchors_panel_position";

  const PANEL_ID = "gh-adhoc-anchors-panel";
  const LIST_ID = "gh-adhoc-anchors-list";
  const ADD_BUTTON_ID = "gh-adhoc-anchor-add";

  const GITHUB_PAGE_REGEX = /^\/[^/]+\/[^/]+\/(issues|pull)\/\d+/;

  let isAddMode = false;
  let allAnchorData = {};
  let currentUrlKey = "";
  let lastHref = window.location.href;
  let panelPosition = null;

  function isSupportedPage() {
    const hostname = window.location.hostname;

    if (hostname === "github.com") {
      return GITHUB_PAGE_REGEX.test(window.location.pathname);
    }

    if (hostname === "chatgpt.com") {
      return true;
    }

    return false;
  }

  function getScrollRoot() {
    if (window.location.hostname === "chatgpt.com") {
      return (
        document.querySelector(
          'div[role="presentation"] div.overflow-y-auto',
        ) ||
        document.scrollingElement ||
        document.documentElement ||
        document.body
      );
    }

    return (
      document.scrollingElement || document.documentElement || document.body
    );
  }

  function normalizeUrl(url) {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  }

  function getCurrentAnchors() {
    const pageData = allAnchorData[currentUrlKey];
    if (!pageData || !Array.isArray(pageData.anchors)) {
      return [];
    }
    return pageData.anchors;
  }

  function setCurrentAnchors(anchors) {
    allAnchorData[currentUrlKey] = {
      anchors,
      updatedAt: new Date().toISOString(),
    };
  }

  function addStyles() {
    if (document.getElementById("gh-adhoc-anchors-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "gh-adhoc-anchors-style";
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 14px;
        bottom: 14px;
        width: 320px;
        max-height: 60vh;
        overflow: hidden;
        border: 1px solid var(--color-border-default, #d0d7de);
        border-radius: 10px;
        background: var(--color-canvas-default, #ffffff);
        color: var(--color-fg-default, #1f2328);
        z-index: 99999;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      }

      #${PANEL_ID}.add-mode {
        outline: 2px solid var(--color-accent-fg, #1f6feb);
      }

      #${PANEL_ID} .gh-anchor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--color-border-muted, #d8dee4);
      }

      #${PANEL_ID} .gh-anchor-title {
        font-size: 13px;
        font-weight: 600;
      }

      #${PANEL_ID} .gh-anchor-actions {
        display: flex;
        gap: 6px;
      }

      #${PANEL_ID} button {
        border: 1px solid var(--color-border-default, #d0d7de);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 12px;
        background: var(--color-btn-bg, #f6f8fa);
        color: var(--color-fg-default, #1f2328);
        cursor: pointer;
      }

      #${PANEL_ID} button:hover {
        opacity: 0.9;
      }

      #${PANEL_ID} .gh-anchor-empty {
        padding: 12px;
        font-size: 12px;
        color: var(--color-fg-muted, #656d76);
      }

      #${LIST_ID} {
        list-style: none;
        margin: 0;
        padding: 8px;
        max-height: calc(60vh - 50px);
        overflow: auto;
      }

      #${LIST_ID} li {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }

      #${LIST_ID} .jump {
        flex: 1;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${LIST_ID} .remove {
        color: var(--color-danger-fg, #cf222e);
      }

      .gh-adhoc-anchor-badge {
        position: absolute;
        right: 8px;
        transform: translateY(-50%);
        z-index: 9998;
        border: 1px solid var(--color-border-default, #d0d7de);
        border-radius: 10px;
        padding: 2px 7px;
        background: var(--color-accent-subtle, #ddf4ff);
        color: var(--color-accent-fg, #0969da);
        font-size: 11px;
        line-height: 1.4;
        cursor: pointer;
      }

      body.gh-adhoc-anchor-adding {
        cursor: crosshair !important;
      }
    `;

    document.head.appendChild(style);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  async function loadPanelPosition() {
    panelPosition = await GM.getValue(PANEL_POSITION_KEY, null);
  }

  function applyPanelPosition(panel) {
    if (!panel) {
      return;
    }

    if (
      !panelPosition ||
      !Number.isFinite(panelPosition.left) ||
      !Number.isFinite(panelPosition.top)
    ) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "14px";
      panel.style.bottom = "14px";
      return;
    }

    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
    const left = clamp(panelPosition.left, 0, maxLeft);
    const top = clamp(panelPosition.top, 0, maxTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  async function savePanelPosition(panel) {
    const left = Math.round(panel.offsetLeft);
    const top = Math.round(panel.offsetTop);
    panelPosition = { left, top };
    await GM.setValue(PANEL_POSITION_KEY, panelPosition);
  }

  function makePanelDraggable(panel) {
    const header = panel.querySelector(".gh-anchor-header");
    if (!header || header.dataset.dragEnabled === "true") {
      return;
    }

    header.dataset.dragEnabled = "true";
    header.style.cursor = "move";

    let dragState = null;

    const onPointerMove = (event) => {
      if (!dragState) {
        return;
      }

      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      const nextLeft = clamp(event.clientX - dragState.offsetX, 0, maxLeft);
      const nextTop = clamp(event.clientY - dragState.offsetY, 0, maxTop);

      panel.style.left = `${Math.round(nextLeft)}px`;
      panel.style.top = `${Math.round(nextTop)}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    };

    const onPointerUp = async () => {
      if (!dragState) {
        return;
      }

      dragState = null;
      document.body.style.userSelect = "";

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      try {
        await savePanelPosition(panel);
      } catch (error) {
        console.warn(
          "[GitHub Adhoc Anchors] Failed to save panel position",
          error,
        );
      }
    };

    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      if (event.target.closest("button")) {
        return;
      }

      event.preventDefault();

      const panelRect = panel.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - panelRect.left,
        offsetY: event.clientY - panelRect.top,
      };

      document.body.style.userSelect = "none";

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    });
  }

  function fallbackSelector(element) {
    const parts = [];
    let current = element;

    while (current && current !== document.body && parts.length < 8) {
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      const tag = current.tagName.toLowerCase();
      let index = 1;
      let sibling = current;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName.toLowerCase() === tag) {
          index += 1;
        }
      }

      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function createAnchorDescriptor(target, clickPageY, label) {
    const preferred = target.closest(
      "[data-message-id], [id^='issuecomment-'], [id^='pullrequestreview-'], .js-timeline-item, .timeline-comment, [id]",
    );

    const anchorTarget = preferred || target;
    const rect = anchorTarget.getBoundingClientRect();
    const scrollRoot = getScrollRoot();
    const rootTop =
      scrollRoot &&
      scrollRoot !== document.body &&
      scrollRoot !== document.documentElement
        ? scrollRoot.getBoundingClientRect().top
        : 0;
    const targetTop = Math.round(
      (scrollRoot &&
      scrollRoot !== document.body &&
      scrollRoot !== document.documentElement
        ? scrollRoot.scrollTop
        : window.scrollY) +
        rect.top -
        rootTop,
    );

    let selector = "";
    if (anchorTarget.id) {
      selector = `#${CSS.escape(anchorTarget.id)}`;
    } else if (anchorTarget.dataset && anchorTarget.dataset.messageId) {
      selector = `[data-message-id="${CSS.escape(anchorTarget.dataset.messageId)}"]`;
    } else {
      selector = fallbackSelector(anchorTarget);
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      selector,
      targetTop,
      clickPageY,
      deltaY: clickPageY - targetTop,
      createdAt: new Date().toISOString(),
    };
  }

  function findAnchorTop(anchor) {
    if (anchor.selector) {
      const element = document.querySelector(anchor.selector);
      if (element) {
        const scrollRoot = getScrollRoot();
        const rootTop =
          scrollRoot &&
          scrollRoot !== document.body &&
          scrollRoot !== document.documentElement
            ? scrollRoot.getBoundingClientRect().top
            : 0;
        const elementTop = Math.round(
          (scrollRoot &&
          scrollRoot !== document.body &&
          scrollRoot !== document.documentElement
            ? scrollRoot.scrollTop
            : window.scrollY) +
            element.getBoundingClientRect().top -
            rootTop,
        );
        return (
          elementTop + (Number.isFinite(anchor.deltaY) ? anchor.deltaY : 0)
        );
      }
    }

    if (Number.isFinite(anchor.clickPageY)) {
      return anchor.clickPageY;
    }

    return anchor.targetTop || 0;
  }

  function jumpToAnchor(anchor) {
    const scrollRoot = getScrollRoot();
    const targetTop = Math.max(0, findAnchorTop(anchor) - 80);

    if (
      scrollRoot &&
      scrollRoot !== document.body &&
      scrollRoot !== document.documentElement &&
      typeof scrollRoot.scrollTo === "function"
    ) {
      scrollRoot.scrollTo({ top: targetTop, behavior: "smooth" });
      return;
    }

    window.scrollTo({ top: targetTop, behavior: "smooth" });
  }

  function clearBadges() {
    document
      .querySelectorAll(".gh-adhoc-anchor-badge")
      .forEach((node) => node.remove());
  }

  function renderBadges() {
    clearBadges();

    const anchors = getCurrentAnchors();
    anchors.forEach((anchor, index) => {
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "gh-adhoc-anchor-badge";
      badge.textContent = `${index + 1}`;
      badge.title = `${anchor.label} (double click to remove)`;

      const scrollRoot = getScrollRoot();
      const top = findAnchorTop(anchor);

      if (
        scrollRoot &&
        scrollRoot !== document.body &&
        scrollRoot !== document.documentElement
      ) {
        badge.style.position = "fixed";
        badge.style.right = "8px";
        badge.style.top = `${Math.max(20, top - scrollRoot.scrollTop)}px`;
      } else {
        badge.style.position = "absolute";
        badge.style.right = "8px";
        badge.style.top = `${Math.max(50, top)}px`;
      }

      badge.addEventListener("click", () => jumpToAnchor(anchor));
      badge.addEventListener("dblclick", async () => {
        await removeAnchor(anchor.id);
      });

      document.body.appendChild(badge);
    });
  }

  function renderList() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    const list = panel.querySelector(`#${LIST_ID}`);
    list.innerHTML = "";

    const anchors = getCurrentAnchors();
    if (!anchors.length) {
      const empty = document.createElement("div");
      empty.className = "gh-anchor-empty";
      empty.textContent =
        "No anchors yet. Click Add, then click a place on the page.";
      list.appendChild(empty);
      renderBadges();
      return;
    }

    anchors.forEach((anchor, index) => {
      const item = document.createElement("li");

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "jump";
      jump.textContent = `${index + 1}. ${anchor.label}`;
      jump.title = `Jump to ${anchor.label}`;
      jump.addEventListener("click", () => jumpToAnchor(anchor));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "Remove";
      remove.title = `Remove ${anchor.label}`;
      remove.addEventListener("click", async () => {
        await removeAnchor(anchor.id);
      });

      item.appendChild(jump);
      item.appendChild(remove);
      list.appendChild(item);
    });

    renderBadges();
  }

  async function persistAllData() {
    await GM.setValue(STORAGE_KEY, allAnchorData);
  }

  function buildExportPayload() {
    return {
      format: "github_adhoc_anchors_v1",
      exportedAt: new Date().toISOString(),
      github_adhoc_anchors: allAnchorData,
    };
  }

  function normalizeImportedData(rawData) {
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
      throw new Error("Imported data must be a JSON object");
    }

    const normalized = {};
    for (const [url, entry] of Object.entries(rawData)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const anchors = Array.isArray(entry.anchors) ? entry.anchors : [];
      const validAnchors = anchors
        .filter((anchor) => anchor && typeof anchor === "object")
        .map((anchor, index) => ({
          id:
            typeof anchor.id === "string" && anchor.id
              ? anchor.id
              : `${Date.now()}-${index}`,
          label:
            typeof anchor.label === "string" && anchor.label.trim()
              ? anchor.label.trim()
              : `Anchor ${index + 1}`,
          selector: typeof anchor.selector === "string" ? anchor.selector : "",
          targetTop: Number.isFinite(anchor.targetTop) ? anchor.targetTop : 0,
          clickPageY: Number.isFinite(anchor.clickPageY)
            ? anchor.clickPageY
            : 0,
          deltaY: Number.isFinite(anchor.deltaY) ? anchor.deltaY : 0,
          createdAt:
            typeof anchor.createdAt === "string" && anchor.createdAt
              ? anchor.createdAt
              : new Date().toISOString(),
        }));

      normalized[url] = {
        anchors: validAnchors,
        updatedAt:
          typeof entry.updatedAt === "string" && entry.updatedAt
            ? entry.updatedAt
            : new Date().toISOString(),
      };
    }

    return normalized;
  }

  async function exportAnchorsForNotes() {
    const payload = buildExportPayload();
    const json = JSON.stringify(payload, null, 2);

    GM.setClipboard(json, "text");

    GM.notification({
      title: "GitHub Adhoc Anchors",
      text: "Anchors JSON copied. Paste into github-url-notes.",
      timeout: 2500,
    });
  }

  async function importAnchorsFromNotes() {
    const raw = prompt(
      "Paste exported anchors JSON from github-url-notes:",
      "",
    );

    if (raw === null) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const importedData =
        parsed?.github_adhoc_anchors || parsed?.data || parsed;
      allAnchorData = normalizeImportedData(importedData);

      await persistAllData();
      refreshCurrentPage();

      GM.notification({
        title: "GitHub Adhoc Anchors",
        text: `Import complete. Pages: ${Object.keys(allAnchorData).length}`,
        timeout: 2500,
      });
    } catch (error) {
      alert(`Failed to import anchors: ${error.message}`);
    }
  }

  async function removeAnchor(anchorId) {
    const anchors = getCurrentAnchors().filter((item) => item.id !== anchorId);
    setCurrentAnchors(anchors);
    await persistAllData();
    renderList();

    GM.notification({
      title: "GitHub Adhoc Anchors",
      text: "Anchor removed",
      timeout: 1500,
    });
  }

  function setAddMode(enabled) {
    isAddMode = enabled;
    const panel = document.getElementById(PANEL_ID);
    const addButton = document.getElementById(ADD_BUTTON_ID);

    if (panel) {
      panel.classList.toggle("add-mode", enabled);
    }

    if (addButton) {
      addButton.textContent = enabled ? "Cancel" : "Add";
      addButton.title = enabled
        ? "Cancel add-anchor mode"
        : "Add an anchor by clicking on the page";
    }

    document.body.classList.toggle("gh-adhoc-anchor-adding", enabled);
  }

  async function addAnchorFromClick(event) {
    if (!isAddMode) {
      return;
    }

    const panel = document.getElementById(PANEL_ID);
    if (panel && panel.contains(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const labelInput = prompt(
      "Anchor label:",
      `Anchor ${getCurrentAnchors().length + 1}`,
    );

    if (!labelInput || !labelInput.trim()) {
      setAddMode(false);
      return;
    }

    const clickPageY = Math.round(window.scrollY + event.clientY);
    const newAnchor = createAnchorDescriptor(
      event.target,
      clickPageY,
      labelInput.trim(),
    );

    const anchors = getCurrentAnchors();
    anchors.push(newAnchor);
    setCurrentAnchors(anchors);

    try {
      await persistAllData();
      renderList();
      setAddMode(false);

      GM.notification({
        title: "GitHub Adhoc Anchors",
        text: `Saved: ${newAnchor.label}`,
        timeout: 1800,
      });
    } catch (error) {
      console.error("[GitHub Adhoc Anchors] Failed to save anchor", error);
      alert(`Failed to save anchor: ${error.message}`);
      setAddMode(false);
    }
  }

  async function clearCurrentPageAnchors() {
    if (!getCurrentAnchors().length) {
      return;
    }

    const ok = confirm("Remove all anchors for this page?");
    if (!ok) {
      return;
    }

    setCurrentAnchors([]);
    await persistAllData();
    renderList();
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="gh-anchor-header">
        <div class="gh-anchor-title">Adhoc Anchors</div>
        <div class="gh-anchor-actions">
          <button id="${ADD_BUTTON_ID}" type="button" title="Add an anchor by clicking on the page">Add</button>
          <button id="gh-adhoc-anchor-clear" type="button" title="Remove all anchors for this page">Clear</button>
        </div>
      </div>
      <ul id="${LIST_ID}"></ul>
    `;

    document.body.appendChild(panel);
    applyPanelPosition(panel);
    makePanelDraggable(panel);

    const addButton = panel.querySelector(`#${ADD_BUTTON_ID}`);
    addButton.addEventListener("click", () => setAddMode(!isAddMode));

    const clearButton = panel.querySelector("#gh-adhoc-anchor-clear");
    clearButton.addEventListener("click", () => {
      clearCurrentPageAnchors().catch((error) => {
        console.error("[GitHub Adhoc Anchors] Failed to clear anchors", error);
      });
    });
  }

  function refreshCurrentPage() {
    currentUrlKey = normalizeUrl(window.location.href);

    if (!allAnchorData[currentUrlKey]) {
      allAnchorData[currentUrlKey] = {
        anchors: [],
        updatedAt: new Date().toISOString(),
      };
    }

    renderList();
  }

  async function loadData() {
    const localData = await GM.getValue(STORAGE_KEY, {});
    allAnchorData = normalizeImportedData(localData);
    await GM.setValue(STORAGE_KEY, allAnchorData);
  }

  function onPageMutation() {
    if (window.location.href === lastHref) {
      return;
    }

    lastHref = window.location.href;

    if (!isSupportedPage()) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.remove();
      }
      clearBadges();
      return;
    }

    addStyles();
    createPanel();
    refreshCurrentPage();
  }

  async function init() {
    if (!isSupportedPage()) {
      return;
    }

    addStyles();
    await loadPanelPosition();
    createPanel();

    await loadData();
    refreshCurrentPage();

    document.addEventListener(
      "click",
      (event) => {
        addAnchorFromClick(event).catch((error) => {
          console.error("[GitHub Adhoc Anchors] Failed to add anchor", error);
          setAddMode(false);
        });
      },
      true,
    );

    window.addEventListener("scroll", renderBadges, { passive: true });
    window.addEventListener("resize", () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        applyPanelPosition(panel);
      }
      renderBadges();
    });

    const observer = new MutationObserver(onPageMutation);
    observer.observe(document.body, { childList: true, subtree: true });

    GM.registerMenuCommand("Export Anchors JSON (for Notes)", async () => {
      await exportAnchorsForNotes();
    });
    GM.registerMenuCommand("Import Anchors JSON (from Notes)", async () => {
      await importAnchorsFromNotes();
    });
    GM.registerMenuCommand("Clear Anchors for Current Page", async () => {
      await clearCurrentPageAnchors();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((error) => {
        console.error("[GitHub Adhoc Anchors] Initialization failed", error);
      });
    });
  } else {
    init().catch((error) => {
      console.error("[GitHub Adhoc Anchors] Initialization failed", error);
    });
  }
})();
