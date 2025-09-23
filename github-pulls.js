// ==UserScript==
// @name         GitHub Pulls - Sort by Repository
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Sort pull request entries on /pulls by repository name inside the issues toolbar container.
// @author       Siew Kam Onn
// @match        https://github.com/pulls
// @match        https://github.com/pulls?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM_notification
// ==/UserScript==

(function () {
  "use strict";

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

  function sortContainerByRepo() {
    try {
      const container = getContainer();
      if (!container) return;

      // Filter out any previously inserted divider elements so we don't duplicate them
      const children = Array.from(container.children).filter((n) => {
        return !(
          n.nodeType === 1 &&
          n.classList &&
          n.classList.contains("repo-divider")
        );
      });
      if (children.length <= 1) return;

      const items = children.map((el, idx) => ({
        el,
        repo: getRepoNameFromItem(el) || "",
        idx,
      }));

      const anyRepo = items.some((it) => it.repo !== "");
      if (!anyRepo) return;

      items.sort((a, b) => {
        const cmp = a.repo.localeCompare(b.repo, undefined, {
          sensitivity: "base",
        });
        return cmp !== 0 ? cmp : a.idx - b.idx;
      });

      const alreadyOrdered = items.every((it, i) => children[i] === it.el);
      if (alreadyOrdered) return;

      const frag = document.createDocumentFragment();
      let lastRepo = null;
      for (const it of items) {
        // When repo changes, insert a visible divider between groups
        if (lastRepo !== null && it.repo !== lastRepo) {
          const hr = document.createElement("hr");
          hr.className = "repo-divider";
          // lightweight styling to match GitHub's neutral divider color
          hr.style.border = "0";
          hr.style.borderTop = "1px solid #e1e4e8";
          hr.style.margin = "8px 0";
          frag.appendChild(hr);
        }

        frag.appendChild(it.el);
        lastRepo = it.repo;
      }

      // Replace children with sorted fragment
      container.innerHTML = "";
      container.appendChild(frag);
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
