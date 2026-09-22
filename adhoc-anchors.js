// ==UserScript==
// @name         Adhoc Anchors
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Add temporary anchors on GitHub issue/PR pages and ChatGPT conversations, with quick scroll-to-top/bottom controls
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

  const STORAGE_KEY = "adhoc_anchors";
  const PANEL_POSITION_KEY = "adhoc_anchors_panel_position";
  const PANEL_MINIMIZED_KEY = "adhoc_anchors_panel_minimized";

  const PANEL_ID = "adhoc-anchors-panel";
  const LIST_ID = "adhoc-anchors-list";
  const ADD_BUTTON_ID = "adhoc-anchor-add";
  const MINIMIZE_BUTTON_ID = "adhoc-anchor-minimize";
  const SCROLL_TOP_BUTTON_ID = "tm-scroll-to-top-button";
  const SCROLL_BOTTOM_BUTTON_ID = "tm-scroll-to-bottom-button";

  const GITHUB_PAGE_REGEX = /^\/[^/]+\/[^/]+\/(issues|pull)\/\d+/;

  // Stable per-message attributes, in order of preference.
  const CHATGPT_MESSAGE_ATTRIBUTES = [
    "data-message-id",
    "data-chatgpt-selection-message-id",
    "data-turn-key",
  ];
  const CHATGPT_MESSAGE_SELECTOR = CHATGPT_MESSAGE_ATTRIBUTES.map(
    (name) => `[${name}]`,
  ).join(", ");

  let isAddMode = false;
  let allAnchorData = {};
  let currentUrlKey = "";
  let lastHref = window.location.href;
  let panelPosition = null;
  let panelMinimized = false;
  let trackedScrollRoot = null;
  let badgeRenderFrame = null;
  let pageAdapter = null;

  function createTimestamp() {
    return new Date().toISOString();
  }

  function notify(title, text, timeout) {
    GM.notification({ title, text, timeout });
  }

  function getDefaultScrollRoot() {
    return (
      document.scrollingElement || document.documentElement || document.body
    );
  }

  function isInnerScrollRoot(scrollRoot) {
    return Boolean(
      scrollRoot &&
        scrollRoot !== document.body &&
        scrollRoot !== document.documentElement &&
        scrollRoot !== window,
    );
  }

  function getMaxScrollOffset(scrollRoot) {
    return Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  }

  // ChatGPT's thread container uses flex-direction: column-reverse, where
  // scrollTop is 0 at the bottom and negative towards the top.
  function isReversedScrollRoot(scrollRoot) {
    return (
      isInnerScrollRoot(scrollRoot) &&
      window.getComputedStyle(scrollRoot).flexDirection === "column-reverse"
    );
  }

  // Scroll offset measured from the top of the content (0 = top), regardless
  // of the container's flex direction.
  function getDefaultPageScrollTop(scrollRoot) {
    if (isInnerScrollRoot(scrollRoot)) {
      return isReversedScrollRoot(scrollRoot)
        ? scrollRoot.scrollTop + getMaxScrollOffset(scrollRoot)
        : scrollRoot.scrollTop;
    }

    return window.scrollY || 0;
  }

  function setDefaultPageScrollTop(scrollRoot, offset) {
    if (isInnerScrollRoot(scrollRoot)) {
      scrollRoot.scrollTop = isReversedScrollRoot(scrollRoot)
        ? offset - getMaxScrollOffset(scrollRoot)
        : offset;
      return;
    }

    window.scrollTo(0, offset);
  }

  function getScrollRootViewportTop(scrollRoot) {
    return isInnerScrollRoot(scrollRoot)
      ? scrollRoot.getBoundingClientRect().top
      : 0;
  }

  // Pin a badge to its anchor's on-screen position inside an inner scroll
  // container, hiding it once the anchor scrolls out of the visible area.
  function placeFixedBadge(badge, top, scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();
    const viewportTop =
      rootRect.top + top - getDefaultPageScrollTop(scrollRoot);
    const isVisible =
      viewportTop >= rootRect.top && viewportTop <= rootRect.bottom;

    badge.style.position = "fixed";
    badge.style.top = `${viewportTop}px`;
    badge.style.visibility = isVisible ? "visible" : "hidden";
  }

  function getDefaultElementPageTop(element, scrollRoot) {
    if (!element) {
      return 0;
    }

    return Math.round(
      getDefaultPageScrollTop(scrollRoot) +
        element.getBoundingClientRect().top -
        getScrollRootViewportTop(scrollRoot),
    );
  }

  let cachedScrollRoot = null;

  function isElementScrollable(node) {
    if (!node || !node.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY || style.overflow;

    return (
      node.scrollHeight > node.clientHeight + 40 &&
      (overflowY.includes("auto") ||
        overflowY.includes("scroll") ||
        overflowY.includes("overlay"))
    );
  }

  // Sites like GitHub's newer issue/PR UI and ChatGPT scroll an inner
  // container instead of the document, so detect the real scrolling element.
  function detectActiveScrollRoot() {
    const documentRoot = getDefaultScrollRoot();
    if (documentRoot.scrollHeight > documentRoot.clientHeight + 40) {
      return documentRoot;
    }

    const candidates = Array.from(document.querySelectorAll("body *")).filter(
      isElementScrollable,
    );

    if (!candidates.length) {
      return documentRoot;
    }

    candidates.sort((a, b) => b.clientHeight - a.clientHeight);
    return candidates[0];
  }

  function getActiveScrollRoot() {
    if (cachedScrollRoot && isElementScrollable(cachedScrollRoot)) {
      return cachedScrollRoot;
    }

    if (cachedScrollRoot && cachedScrollRoot === getDefaultScrollRoot()) {
      return cachedScrollRoot;
    }

    cachedScrollRoot = detectActiveScrollRoot();
    return cachedScrollRoot;
  }

  function invalidateActiveScrollRoot() {
    cachedScrollRoot = null;
  }

  function getDefaultAnchorTarget(target) {
    return (
      target.closest(
        "[id^='issuecomment-'], [id^='pullrequestreview-'], .js-timeline-item, .timeline-comment, [id]",
      ) || target
    );
  }

  function selectPageAdapter() {
    switch (window.location.hostname) {
      case "github.com":
        return createGitHubAdapter();
      case "chatgpt.com":
        return createChatGPTAdapter();
      default:
        return null;
    }
  }

  function getPageAdapter() {
    if (!pageAdapter) {
      pageAdapter = selectPageAdapter();
    }

    return pageAdapter;
  }

  // requestAnimationFrame (and native scrollTo smooth-animation) is throttled
  // or never fires on background/inactive tabs, so jump instantly instead of
  // animating — correctness over smoothness.
  function scrollToPageTop(targetTop) {
    setDefaultPageScrollTop(getScrollRootListenerTarget(), targetTop);
  }

  function scrollToTop() {
    scrollToPageTop(0);
  }

  function scrollToBottom() {
    scrollToPageTop(getMaxScrollOffset(getScrollRoot()));
  }

  function createGitHubAdapter() {
    return {
      isSupportedPage() {
        return GITHUB_PAGE_REGEX.test(window.location.pathname);
      },
      getScrollRoot() {
        return getActiveScrollRoot();
      },
      getPageScrollTop() {
        return getDefaultPageScrollTop(getActiveScrollRoot());
      },
      getElementPageTop(element) {
        return getDefaultElementPageTop(element, getActiveScrollRoot());
      },
      findAnchorTarget(target) {
        return getDefaultAnchorTarget(target);
      },
      getAnchorTop(anchor) {
        if (anchor.selector) {
          const element = document.querySelector(anchor.selector);
          if (element) {
            return getDefaultElementPageTop(element, getActiveScrollRoot());
          }
        }

        if (Number.isFinite(anchor.clickPageY)) {
          return anchor.clickPageY;
        }

        return anchor.targetTop || 0;
      },
      jumpToAnchor(anchor) {
        const targetTop = Math.max(0, findAnchorTop(anchor) - 80);
        scrollToPageTop(targetTop);
      },
      placeBadge(badge, anchor) {
        const top = findAnchorTop(anchor);
        const scrollRoot = getScrollRootListenerTarget();

        if (scrollRoot) {
          badge.style.right = "8px";
          placeFixedBadge(badge, top, scrollRoot);
        } else {
          badge.style.position = "absolute";
          badge.style.right = "8px";
          badge.style.top = `${Math.max(50, top)}px`;
        }

        document.body.appendChild(badge);
      },
    };
  }

  function createChatGPTAdapter() {
    // Generic detection can pick the sidebar before the thread has rendered,
    // so prefer ChatGPT's thread container when present.
    const getChatScrollRoot = () =>
      document.querySelector(".thread-scroll-container") ||
      getActiveScrollRoot();

    return {
      isSupportedPage() {
        return true;
      },
      getScrollRoot() {
        return getChatScrollRoot();
      },
      getPageScrollTop() {
        return getDefaultPageScrollTop(getChatScrollRoot());
      },
      getElementPageTop(element) {
        return getDefaultElementPageTop(element, getChatScrollRoot());
      },
      findAnchorTarget(target) {
        const messageTarget = target.closest(CHATGPT_MESSAGE_SELECTOR);
        if (messageTarget) {
          return messageTarget;
        }

        return getDefaultAnchorTarget(target);
      },
      getAnchorTop(anchor) {
        const scrollRoot = getChatScrollRoot();

        if (anchor.selector) {
          const element = document.querySelector(anchor.selector);
          if (element) {
            return (
              getDefaultElementPageTop(element, scrollRoot) +
              (Number.isFinite(anchor.deltaY) ? anchor.deltaY : 0)
            );
          }
        }

        if (Number.isFinite(anchor.clickPageY)) {
          return anchor.clickPageY;
        }

        return anchor.targetTop || 0;
      },
      jumpToAnchor(anchor) {
        const targetTop = Math.max(0, findAnchorTop(anchor) - 80);
        scrollToPageTop(targetTop);
      },
      placeBadge(badge, anchor) {
        // Appending into ChatGPT's message DOM gets wiped on React re-renders,
        // so keep badges in document.body and reposition on every scroll.
        const top = findAnchorTop(anchor);
        const scrollRoot = getScrollRootListenerTarget();

        badge.style.display = "block";
        badge.style.left = "auto";
        badge.style.right = "8px";
        badge.style.bottom = "auto";
        badge.style.transform = "none";

        if (scrollRoot) {
          placeFixedBadge(badge, top, scrollRoot);
        } else {
          badge.style.position = "absolute";
          badge.style.top = `${Math.max(50, top)}px`;
        }

        document.body.appendChild(badge);
      },
    };
  }

  function isSupportedPage() {
    const adapter = getPageAdapter();
    return Boolean(adapter && adapter.isSupportedPage());
  }

  function getScrollRoot() {
    const adapter = getPageAdapter();
    return adapter ? adapter.getScrollRoot() : getDefaultScrollRoot();
  }

  function getPageScrollTop() {
    const adapter = getPageAdapter();
    return adapter ? adapter.getPageScrollTop() : window.scrollY || 0;
  }

  function getElementPageTop(element) {
    const adapter = getPageAdapter();
    return adapter
      ? adapter.getElementPageTop(element)
      : getDefaultElementPageTop(element, getDefaultScrollRoot());
  }

  function findAnchorTarget(target) {
    const adapter = getPageAdapter();
    return adapter
      ? adapter.findAnchorTarget(target)
      : getDefaultAnchorTarget(target);
  }

  function normalizeUrl(url) {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  }

  function getCurrentAnchors() {
    const pageData = allAnchorData[currentUrlKey];
    return pageData && Array.isArray(pageData.anchors) ? pageData.anchors : [];
  }

  function setCurrentAnchors(anchors) {
    allAnchorData[currentUrlKey] = {
      anchors,
      updatedAt: createTimestamp(),
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
        background-color: rgba(255, 214, 102, 0.95);
        color: var(--color-fg-default, #1f2328);
        z-index: 99999;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      }

      #${PANEL_ID}.add-mode {
        outline: 2px solid var(--color-accent-fg, #1f6feb);
      }

      #${PANEL_ID}.minimized #${LIST_ID} {
        display: none;
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
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }

      #${PANEL_ID} .gh-anchor-scroll {
        padding: 6px 10px;
      }

      #${PANEL_ID} button {
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: bold;
        background-color: #2ea44f;
        color: white;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        transition: background-color 0.2s;
        cursor: pointer;
      }

      #${PANEL_ID} button:hover {
        background-color: #2c974b;
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
        background-color: #cf222e;
        color: white;
      }

      #${LIST_ID} .remove:hover {
        background-color: #a40e26;
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

      .gh-adhoc-anchor-target {
        position: relative !important;
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
    panelMinimized = await GM.getValue(PANEL_MINIMIZED_KEY, false);
  }

  function applyPanelMinimized(panel) {
    if (!panel) {
      return;
    }

    panel.classList.toggle("minimized", panelMinimized);

    const minimizeButton = panel.querySelector(`#${MINIMIZE_BUTTON_ID}`);
    if (minimizeButton) {
      minimizeButton.textContent = panelMinimized ? "Restore" : "Minimize";
      minimizeButton.title = panelMinimized
        ? "Restore the anchor list"
        : "Minimize the anchor list";
      minimizeButton.setAttribute(
        "aria-label",
        panelMinimized ? "Restore the anchor list" : "Minimize the anchor list",
      );
    }
  }

  async function setPanelMinimized(minimized) {
    panelMinimized = minimized;
    applyPanelMinimized(document.getElementById(PANEL_ID));

    try {
      await GM.setValue(PANEL_MINIMIZED_KEY, panelMinimized);
    } catch (error) {
      console.warn("[Adhoc Anchors] Failed to save panel state", error);
    }
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

  function getScrollRootListenerTarget() {
    const scrollRoot = getScrollRoot();
    if (
      !scrollRoot ||
      scrollRoot === document.body ||
      scrollRoot === document.documentElement ||
      scrollRoot === window
    ) {
      return null;
    }

    return scrollRoot;
  }

  function setTrackedScrollRoot(nextScrollRoot) {
    if (trackedScrollRoot && trackedScrollRoot.removeEventListener) {
      trackedScrollRoot.removeEventListener("scroll", scheduleBadgeRender);
    }

    trackedScrollRoot = nextScrollRoot;

    if (trackedScrollRoot) {
      trackedScrollRoot.addEventListener("scroll", scheduleBadgeRender, {
        passive: true,
      });
    }
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
        console.warn("[Adhoc Anchors] Failed to save panel position", error);
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
    const anchorTarget = findAnchorTarget(target);
    const targetTop = getElementPageTop(anchorTarget);

    const messageAttribute = CHATGPT_MESSAGE_ATTRIBUTES.find((name) =>
      anchorTarget.hasAttribute(name),
    );

    let selector = "";
    if (messageAttribute) {
      selector = `[${messageAttribute}="${CSS.escape(anchorTarget.getAttribute(messageAttribute))}"]`;
    } else if (anchorTarget.id) {
      selector = `#${CSS.escape(anchorTarget.id)}`;
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
      createdAt: createTimestamp(),
    };
  }

  function findAnchorTop(anchor) {
    const adapter = getPageAdapter();
    return adapter ? adapter.getAnchorTop(anchor) : anchor.targetTop || 0;
  }

  function jumpToAnchor(anchor) {
    const adapter = getPageAdapter();
    if (adapter) {
      adapter.jumpToAnchor(anchor);
    }
  }

  function clearBadges() {
    document
      .querySelectorAll(".gh-adhoc-anchor-badge")
      .forEach((node) => node.remove());
  }

  function createBadge(anchor, index) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "gh-adhoc-anchor-badge";
    badge.textContent = `${index + 1}`;
    badge.title = `${anchor.label} (double click to remove)`;
    badge.addEventListener("click", () => jumpToAnchor(anchor));
    badge.addEventListener("dblclick", async () => {
      await removeAnchor(anchor.id);
    });
    return badge;
  }

  function createListButton(className, text, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }

  function scheduleBadgeRender() {
    if (badgeRenderFrame !== null) {
      return;
    }

    // setTimeout (unlike requestAnimationFrame) still fires on inactive tabs.
    badgeRenderFrame = setTimeout(() => {
      badgeRenderFrame = null;
      renderBadges();
    }, 16);
  }

  function renderBadges() {
    clearBadges();

    const anchors = getCurrentAnchors();
    anchors.forEach((anchor, index) => {
      const badge = createBadge(anchor, index);
      const adapter = getPageAdapter();

      if (adapter) {
        adapter.placeBadge(badge, anchor);
        return;
      }

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

      const jump = createListButton(
        "jump",
        `${index + 1}. ${anchor.label}`,
        `Jump to ${anchor.label}`,
        () => jumpToAnchor(anchor),
      );

      const remove = createListButton(
        "remove",
        "Remove",
        `Remove ${anchor.label}`,
        () => {
          removeAnchor(anchor.id).catch((error) => {
            console.error("[Adhoc Anchors] Failed to remove anchor", error);
          });
        },
      );

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
      exportedAt: createTimestamp(),
      github_adhoc_anchors: allAnchorData,
    };
  }

  function normalizeAnchor(anchor, index) {
    return {
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
      clickPageY: Number.isFinite(anchor.clickPageY) ? anchor.clickPageY : 0,
      deltaY: Number.isFinite(anchor.deltaY) ? anchor.deltaY : 0,
      createdAt:
        typeof anchor.createdAt === "string" && anchor.createdAt
          ? anchor.createdAt
          : createTimestamp(),
    };
  }

  function normalizePageData(entry) {
    return {
      anchors: (Array.isArray(entry.anchors) ? entry.anchors : [])
        .filter((anchor) => anchor && typeof anchor === "object")
        .map((anchor, index) => normalizeAnchor(anchor, index)),
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt
          ? entry.updatedAt
          : createTimestamp(),
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

      normalized[url] = normalizePageData(entry);
    }

    return normalized;
  }

  async function exportAnchorsForNotes() {
    const payload = buildExportPayload();
    const json = JSON.stringify(payload, null, 2);

    GM.setClipboard(json, "text");

    notify(
      "Adhoc Anchors",
      "Anchors JSON copied. Paste into github-url-notes.",
      2500,
    );
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

      notify(
        "Adhoc Anchors",
        `Import complete. Pages: ${Object.keys(allAnchorData).length}`,
        2500,
      );
    } catch (error) {
      alert(`Failed to import anchors: ${error.message}`);
    }
  }

  async function removeAnchor(anchorId) {
    const anchors = getCurrentAnchors().filter((item) => item.id !== anchorId);
    setCurrentAnchors(anchors);
    await persistAllData();
    renderList();

    notify("Adhoc Anchors", "Anchor removed", 1500);
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

    const clickPageY = Math.round(
      getPageScrollTop() +
        event.clientY -
        getScrollRootViewportTop(getScrollRoot()),
    );
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

      notify("Adhoc Anchors", `Saved: ${newAnchor.label}`, 1800);
    } catch (error) {
      console.error("[Adhoc Anchors] Failed to save anchor", error);
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
          <button id="${MINIMIZE_BUTTON_ID}" type="button" title="Minimize the anchor list">Minimize</button>
          <button id="${SCROLL_TOP_BUTTON_ID}" class="gh-anchor-scroll" type="button" title="Scroll to the top of the page">↑</button>
          <button id="${SCROLL_BOTTOM_BUTTON_ID}" class="gh-anchor-scroll" type="button" title="Scroll to the bottom of the page">↓</button>
        </div>
      </div>
      <ul id="${LIST_ID}"></ul>
    `;

    document.body.appendChild(panel);
    applyPanelPosition(panel);
    applyPanelMinimized(panel);
    makePanelDraggable(panel);

    const addButton = panel.querySelector(`#${ADD_BUTTON_ID}`);
    addButton.addEventListener("click", () => setAddMode(!isAddMode));

    const minimizeButton = panel.querySelector(`#${MINIMIZE_BUTTON_ID}`);
    minimizeButton.addEventListener("click", () => {
      setPanelMinimized(!panelMinimized);
    });

    const scrollTopButton = panel.querySelector(`#${SCROLL_TOP_BUTTON_ID}`);
    scrollTopButton.addEventListener("click", scrollToTop);

    const scrollBottomButton = panel.querySelector(
      `#${SCROLL_BOTTOM_BUTTON_ID}`,
    );
    scrollBottomButton.addEventListener("click", scrollToBottom);

    const clearButton = panel.querySelector("#gh-adhoc-anchor-clear");
    clearButton.addEventListener("click", () => {
      clearCurrentPageAnchors().catch((error) => {
        console.error("[Adhoc Anchors] Failed to clear anchors", error);
      });
    });
  }

  function syncScrollTracking() {
    setTrackedScrollRoot(getScrollRootListenerTarget());
  }

  function refreshCurrentPage() {
    currentUrlKey = normalizeUrl(window.location.href);

    if (!allAnchorData[currentUrlKey]) {
      allAnchorData[currentUrlKey] = {
        anchors: [],
        updatedAt: createTimestamp(),
      };
    }

    invalidateActiveScrollRoot();
    syncScrollTracking();
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
          console.error("[Adhoc Anchors] Failed to add anchor", error);
          setAddMode(false);
        });
      },
      true,
    );

    window.addEventListener("scroll", scheduleBadgeRender, { passive: true });
    document.addEventListener("scroll", scheduleBadgeRender, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        applyPanelPosition(panel);
      }
      syncScrollTracking();
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
        console.error("[Adhoc Anchors] Initialization failed", error);
      });
    });
  } else {
    init().catch((error) => {
      console.error("[Adhoc Anchors] Initialization failed", error);
    });
  }
})();
