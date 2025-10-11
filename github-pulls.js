// ==UserScript==
// @name         GitHub Pulls - Sort by Repository
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Sort GitHub pull requests by repository name in repository view
// @author       You
// @match        https://github.com/pulls
// @match        https://github.com/pulls?*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Style only the PR number when present (we'll wrap it in `.pr-number`)
  try {
    const __gm_style = document.createElement("style");
    __gm_style.textContent =
      ".pr-number { color: #ffffff !important; font-size: 14px !important; font-weight: 600; }";
    document.head && document.head.appendChild(__gm_style);
  } catch (e) {
    // ignore in environments where document.head isn't available yet
  }

  const CONTAINER_SELECTOR =
    "#js-issues-toolbar > div.js-navigation-container.js-active-navigation-container";
  const REPO_LINK_SELECTOR = 'a[data-hovercard-type="repository"]';

  let observer = null;
  let debounceTimer = null;

  function getContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

  function getRepoNameFromItem(item) {
    try {
      const anchor = item.querySelector(REPO_LINK_SELECTOR);
      if (!anchor) return null;
      return anchor.textContent.trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Filter out injected repo divider nodes from a container children list.
   * @param {HTMLElement[]} nodes
   * @returns {HTMLElement[]}
   */
  function filterOutDividers(nodes) {
    return nodes.filter((n) => {
      return !(
        n.nodeType === 1 &&
        n.classList &&
        n.classList.contains("repo-divider")
      );
    });
  }

  /**
   * Compute ratio of items that have a summary element loaded.
   * @param {HTMLElement[]} children
   * @returns {number}
   */
  function computeSummaryLoadingRatio(children) {
    const summaryCount = children.reduce((count, child) => {
      const hasSummary = Boolean(
        child.querySelector("summary") ||
          child.querySelector(".flex-auto summary") ||
          child.querySelector("div.flex-auto details summary")
      );
      return count + (hasSummary ? 1 : 0);
    }, 0);
    return summaryCount / (children.length || 1);
  }

  /**
   * Create a lightweight model object for sorting from a container child element.
   * @param {HTMLElement} el
   * @param {number} idx
   */
  function createItemFromElement(el, idx) {
    const repo = getRepoNameFromItem(el) || "";

    const draft = Boolean(
      el.querySelector('span[aria-label="Draft Pull Request"]')
    );

    // Enhanced error detection - use conservative checks
    const method1 = Boolean(
      el.querySelector('.color-fg-danger, [class*="color-fg-danger"]')
    );
    const method2 = Boolean(el.querySelector(".State--error, .State--failure"));
    const method3 = Boolean(
      el.querySelector(".octicon-x, .octicon-alert, .octicon-stop")
    );
    const error = method1 || method2 || method3;

    return { el, repo, idx, draft, error };
  }

  /**
   * Sort item models by repo name then by priority (draft -> error -> other) and original index.
   * @param {Array} items
   */
  function sortItems(items) {
    items.sort((a, b) => {
      const cmp = a.repo.localeCompare(b.repo, undefined, {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;

      const getPriority = (item) => {
        if (item.draft) return 1;
        if (item.error) return 2;
        return 3;
      };

      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa !== pb) return pa - pb;

      return a.idx - b.idx;
    });
  }

  /**
   * Create a HR divider used between repository groups.
   * @returns {HTMLElement}
   */
  function createRepoDivider() {
    const hr = document.createElement("hr");
    hr.className = "repo-divider";
    hr.style.border = "0";
    hr.style.borderTop = "1px solid #e1e4e8";
    hr.style.margin = "8px 0";
    return hr;
  }

  /**
   * Build a document fragment from sorted items, inserting counters and dividers.
   * @param {Array} items
   */
  function buildFragmentFromItems(items) {
    const frag = document.createDocumentFragment();
    let lastRepo = null;
    const repoCounts = {};

    for (const it of items) {
      const repo = it.repo || "";
      repoCounts[repo] = repoCounts[repo] || 0;
      repoCounts[repo]++;

      if (lastRepo !== null && repo !== lastRepo) {
        frag.appendChild(createRepoDivider());
      }

      // Insert per-item counter before the target inner element, idempotent
      try {
        const target = it.el.querySelector(".flex-shrink-0.pt-2.pl-3");
        if (target) {
          let counter = it.el.querySelector(".pr-counter");
          const label = String(repoCounts[repo]);
          if (!counter) {
            counter = document.createElement("span");
            counter.className = "pr-counter";
            counter.style.display = "inline-block";
            counter.style.marginRight = "8px";
            counter.style.marginTop = "8px";
            counter.style.fontSize = "13px";
            counter.style.fontWeight = "600";
            counter.style.borderRadius = "999px";
            counter.style.padding = "2px 8px";
            counter.style.lineHeight = "1";
            counter.style.minWidth = "22px";
            counter.style.textAlign = "center";

            if (it.draft) {
              counter.style.color = "#fb8500";
              counter.style.background = "rgba(251,133,0,0.12)";
              counter.style.border = "1px solid rgba(251,133,0,0.18)";
            } else if (it.error) {
              counter.style.color = "#dc2626";
              counter.style.background = "rgba(220,38,38,0.12)";
              counter.style.border = "1px solid rgba(220,38,38,0.18)";
            } else {
              counter.style.color = "#0366d6";
              counter.style.background = "rgba(3,102,214,0.12)";
              counter.style.border = "1px solid rgba(3,102,214,0.18)";
            }

            target.parentNode.insertBefore(counter, target);
          }
          counter.textContent = label;
        }
      } catch (e) {
        // ignore failing to insert counter for an item
      }

      frag.appendChild(it.el);
      lastRepo = repo;
    }

    return frag;
  }

  /**
   * Wrap leading PR number (e.g. "#18989") inside a span.pr-number within span.opened-by
   * Only operates on plain text spans (skips when child elements already present or .pr-number exists).
   * @param {HTMLElement} [root] - optional scope to search within
   */
  function wrapPrNumberInOpenedBy(root) {
    try {
      const scope = root || document;
      const spans = scope.querySelectorAll("span.opened-by");
      for (const s of spans) {
        if (s.querySelector(".pr-number")) continue;
        // avoid altering complex nodes
        if (s.childElementCount > 0) continue;
        const text = s.textContent;
        if (!text) continue;
        const m = text.match(/^(#\d+)(\s*)([\s\S]*)/);
        if (!m) continue;
        const pr = m[1];
        const sep = m[2] || " ";
        const rest = m[3] || "";
        // rebuild content: <span class="pr-number">#123</span> + remainder
        s.textContent = "";
        const prSpan = document.createElement("span");
        prSpan.className = "pr-number";
        prSpan.textContent = pr;
        s.appendChild(prSpan);
        s.appendChild(document.createTextNode(sep + rest));
      }
    } catch (e) {
      // swallow errors to avoid breaking the page
    }
  }

  function sortContainerByRepo() {
    try {
      const container = getContainer();
      if (!container) return;

      const children = filterOutDividers(Array.from(container.children));
      if (children.length <= 1) return;

      const ratio = computeSummaryLoadingRatio(children);
      if (ratio < 0.8) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(sortContainerByRepo, 1000);
        return;
      }

      const items = children.map((el, idx) => createItemFromElement(el, idx));
      const anyRepo = items.some((it) => it.repo !== "");
      if (!anyRepo) return;

      sortItems(items);

      const alreadyOrdered = items.every((it, i) => children[i] === it.el);
      if (alreadyOrdered) return;

      const frag = buildFragmentFromItems(items);

      container.innerHTML = "";
      container.appendChild(frag);
      // Ensure PR numbers inside "opened-by" spans are wrapped so only the number gets styled
      wrapPrNumberInOpenedBy(container);
    } catch (err) {
      console.error("github-pulls-sort-by-repo error:", err);
    }
  }

  function scheduleSort() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sortContainerByRepo, 150);
  }

  function observeContainer(container) {
    if (!container) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (
          m.type === "childList" &&
          (m.addedNodes.length || m.removedNodes.length)
        ) {
          scheduleSort();
          break;
        }
      }
    });

    observer.observe(container, { childList: true, subtree: false });
    scheduleSort();
  }

  function waitForContainerAndInit() {
    const container = getContainer();
    if (container) {
      observeContainer(container);
      return;
    }

    // If not present, monitor the page body for the container to appear (SPA navigation)
    const bodyObserver = new MutationObserver((mutations, obs) => {
      const c = getContainer();
      if (c) {
        obs.disconnect();
        observeContainer(c);
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForContainerAndInit);
  } else {
    waitForContainerAndInit();
  }
})();
