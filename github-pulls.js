// ==UserScript==
// @name         GitHub Pulls - Sort by Repository
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Sort GitHub pull requests by repository name in repository view
// @author       You
// @match        https://github.com/pulls/inbox
// @match        https://github.com/pulls?*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Make `span.opened-by` more visible: larger font and white color
  try {
    const __gm_style = document.createElement("style");
    __gm_style.textContent =
      "span.opened-by { color: #ffffff !important; font-size: 14px !important; }";
    document.head && document.head.appendChild(__gm_style);
  } catch (e) {
    // ignore in environments where document.head isn't available yet
  }

  const DEBUG = true;
  const CONTAINER_SELECTORS = [
    "#js-issues-toolbar > div.js-navigation-container.js-active-navigation-container",
    "#js-issues-toolbar div.js-navigation-container.js-active-navigation-container",
    'div[aria-label="Issues"] .js-navigation-container.js-active-navigation-container',
    'div[aria-label="Pull requests"] .js-navigation-container.js-active-navigation-container',
    "div.js-navigation-container.js-active-navigation-container",
    "div.js-navigation-container",
  ];
  const REPO_LINK_SELECTOR = 'a[data-hovercard-type="repository"]';

  let observer = null;
  let bodyObserver = null;
  let debounceTimer = null;
  /** @type {HTMLElement[]} */
  let observedContainers = [];

  /**
   * Compare two container arrays by reference and order.
   * @param {HTMLElement[]} a
   * @param {HTMLElement[]} b
   * @returns {boolean}
   */
  function areSameContainers(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Return true when an element looks like a PR list container.
   * @param {HTMLElement} container
   * @returns {boolean}
   */
  function isPullContainer(container) {
    if (!container) return false;
    const children = Array.from(container.children || []);
    if (!children.length) return false;
    return children.some(
      (child) =>
        child.nodeType === 1 && child.querySelector('a[href*="/pull/"]'),
    );
  }

  /**
   * Find all containers that hold PR rows for both classic and inbox layouts.
   * @returns {HTMLElement[]}
   */
  function getContainers() {
    const containers = [];
    const seen = new Set();

    for (const selector of CONTAINER_SELECTORS) {
      const matches = document.querySelectorAll(selector);
      for (const container of matches) {
        if (seen.has(container)) continue;
        if (!isPullContainer(container)) continue;
        seen.add(container);
        containers.push(container);
        if (DEBUG) {
          console.log(
            "[github-pulls] getContainers found",
            selector,
            container,
          );
        }
      }
    }

    // Inbox view uses list containers per section.
    const inboxLists = document.querySelectorAll('ul[role="list"]');
    for (const list of inboxLists) {
      if (seen.has(list)) continue;
      if (!isPullContainer(list)) continue;
      seen.add(list);
      containers.push(list);
      if (DEBUG) {
        console.log("[github-pulls] getContainers found inbox list", list);
      }
    }

    if (DEBUG && !containers.length) {
      console.log("[github-pulls] getContainers: no containers found");
    }

    return containers;
  }

  function getRepoNameFromItem(item) {
    try {
      const anchor = item.querySelector(REPO_LINK_SELECTOR);
      if (anchor) {
        const rawText = anchor.textContent.trim();
        const parts = rawText
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean);
        const repoName = parts.length > 1 ? parts[parts.length - 1] : rawText;
        if (DEBUG) {
          console.log(
            "[github-pulls] repo from hovercard anchor",
            rawText,
            "=>",
            repoName,
          );
        }
        return repoName;
      }

      const prLink = item.querySelector('a[href*="/pull/"]');
      if (prLink && prLink.href) {
        const pathname = new URL(prLink.href, document.baseURI).pathname;
        const parts = pathname.split("/").filter(Boolean);
        if (parts.length >= 3) {
          const repoName = parts[1];
          if (DEBUG) {
            console.log(
              "[github-pulls] repo from PR URL",
              prLink.href,
              "=>",
              repoName,
            );
          }
          return repoName;
        }
      }

      if (DEBUG) {
        console.log("[github-pulls] getRepoNameFromItem: no repo found", item);
      }
      return null;
    } catch (e) {
      if (DEBUG) {
        console.error("[github-pulls] getRepoNameFromItem error", e, item);
      }
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

  function needsCounters(children) {
    return children.some((el) => !el.querySelector(".pr-counter"));
  }

  /**
   * Compute ratio of items that have a summary element loaded.
   * @param {HTMLElement[]} children
   * @returns {number}
   */
  function areItemsReady(children) {
    return children.length > 0;
  }

  /**
   * Create a lightweight model object for sorting from a container child element.
   * @param {HTMLElement} el
   * @param {number} idx
   */
  function createItemFromElement(el, idx) {
    const repo = getRepoNameFromItem(el) || "";

    const draft = Boolean(
      el.querySelector('span[aria-label="Draft Pull Request"]'),
    );

    // Enhanced error detection - use conservative checks
    const method1 = Boolean(
      el.querySelector('.color-fg-danger, [class*="color-fg-danger"]'),
    );
    const method2 = Boolean(el.querySelector(".State--error, .State--failure"));
    const method3 = Boolean(
      el.querySelector(".octicon-x, .octicon-alert, .octicon-stop"),
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
  function createRepoDivider(container) {
    const tagName = (container.tagName || "").toUpperCase();

    if (tagName === "UL" || tagName === "OL") {
      const li = document.createElement("li");
      li.className = "repo-divider";
      li.style.listStyle = "none";
      li.style.margin = "8px 0";
      li.style.padding = "0";

      const hr = document.createElement("hr");
      hr.style.border = "0";
      hr.style.borderTop = "1px solid #e1e4e8";
      hr.style.margin = "0";
      li.appendChild(hr);
      return li;
    }

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
  function buildFragmentFromItems(items, container) {
    const frag = document.createDocumentFragment();
    let lastRepo = null;
    const repoCounts = {};

    for (const it of items) {
      const repo = it.repo || "";
      repoCounts[repo] = repoCounts[repo] || 0;
      repoCounts[repo]++;

      if (lastRepo !== null && repo !== lastRepo) {
        frag.appendChild(createRepoDivider(container));
      }

      // Insert per-item counter before the repo link or other stable inner element.
      try {
        const target =
          it.el.querySelector(REPO_LINK_SELECTOR) ||
          it.el.querySelector(".flex-shrink-0.pt-2.pl-3") ||
          it.el.firstElementChild;
        if (target) {
          let counter = it.el.querySelector(".pr-counter");
          const label = String(repoCounts[repo]);
          if (!counter) {
            counter = document.createElement("span");
            counter.className = "pr-counter";
            counter.style.display = "inline-block";
            counter.style.marginRight = "8px";
            counter.style.marginTop = "4px";
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

  function sortContainerByRepo(container) {
    try {
      if (!container) {
        if (DEBUG) {
          console.log(
            "[github-pulls] sortContainerByRepo: no container argument",
          );
        }
        return;
      }

      const children = filterOutDividers(Array.from(container.children));
      if (children.length <= 1) {
        if (DEBUG) {
          console.log(
            "[github-pulls] sortContainerByRepo: insufficient children",
            children.length,
          );
        }
        return;
      }

      if (!areItemsReady(children)) {
        if (DEBUG) {
          console.log(
            "[github-pulls] sortContainerByRepo: items not ready yet",
          );
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => sortContainerByRepo(container), 1000);
        return;
      }

      const items = children.map((el, idx) => createItemFromElement(el, idx));
      const anyRepo = items.some((it) => it.repo !== "");
      if (!anyRepo) {
        if (DEBUG) {
          console.log(
            "[github-pulls] sortContainerByRepo: no repo names found",
            items.map((it) => it.repo),
          );
        }
        return;
      }

      const beforeRepos = items.map((it) => it.repo);
      sortItems(items);
      const afterRepos = items.map((it) => it.repo);

      const alreadyOrdered = items.every((it, i) => children[i] === it.el);
      const counterMissing = needsCounters(children);
      if (alreadyOrdered && !counterMissing) {
        if (DEBUG) {
          console.log(
            "[github-pulls] sortContainerByRepo: already ordered and counters present",
            { beforeRepos, afterRepos },
          );
        }
        return;
      }

      if (DEBUG) {
        console.log("[github-pulls] sortContainerByRepo: rebuilding list", {
          beforeRepos,
          afterRepos,
          alreadyOrdered,
          counterMissing,
        });
      }
      const frag = buildFragmentFromItems(items, container);

      container.innerHTML = "";
      container.appendChild(frag);
    } catch (err) {
      console.error("github-pulls-sort-by-repo error:", err);
    }
  }

  function sortAllContainers() {
    const containers = ensureObservedContainers();
    if (!containers.length) return;
    for (const container of containers) {
      sortContainerByRepo(container);
    }
  }

  function scheduleSort() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sortAllContainers, 150);
  }

  function observeContainers(containers) {
    if (!containers || !containers.length) return;
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

    for (const container of containers) {
      observer.observe(container, { childList: true, subtree: false });
    }
    observedContainers = containers.slice();
  }

  /**
   * Keep observer targets in sync with currently available PR containers.
   * @returns {HTMLElement[]}
   */
  function ensureObservedContainers() {
    const containers = getContainers();
    if (!containers.length) return [];

    if (!areSameContainers(containers, observedContainers)) {
      if (DEBUG) {
        console.log("[github-pulls] ensureObservedContainers: refreshing", {
          previous: observedContainers.length,
          current: containers.length,
        });
      }
      observeContainers(containers);
    }

    return containers;
  }

  function waitForContainerAndInit() {
    // Monitor page body continuously because inbox sections/lists can load incrementally.
    bodyObserver = new MutationObserver(() => {
      ensureObservedContainers();
      scheduleSort();
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
    scheduleSort();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForContainerAndInit);
  } else {
    waitForContainerAndInit();
  }
})();
