// ==UserScript==
// @name         Github Notification Plus
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  github notifications enhancement: group by repo, PR links in new tab, bulk unsubscribe
// @author       Siew Kam Onn
// @match        https://github.com/notifications
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/github-notification-plus.js
// @updateURL    https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/github-notification-plus.js
// ==/UserScript==

(function () {
  console.log(`%c==> [Loading Github Notifications]`, "color: yellow");
  const keep = ["bloom/web-client", "Automattic/support-helper-tools"];
  const REPO_SELECTOR = ".d-flex p.m-0.f6.flex-auto";
  const ITEM_SELECTOR = "li.notifications-list-item, li.notification-unread, li.notification-read";
  const HEADER_CLASS = "tm-repo-group-header";

  function insertAfter(referenceNode, newNode) {
    console.log(`%c==> [insertAfter]`, "color: yellow");
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
  }

  function unsubscribeNonKeep() {
    const selector = "li.notification-unread";
    const elems = document.querySelectorAll(selector);

    const unreadNotificationItems = [...elems];

    const nonKeepItems = unreadNotificationItems.filter((elem) => {
      const repo = elem.querySelector(".d-flex p.m-0.f6.flex-auto");
      const repoText = repo.textContent.trim();
      for (const item of keep) {
        if (repoText.startsWith(item)) {
          return false;
        }
      }
      return true;
    });
    console.log(`%c  ==> [elems.length = ${elems.length}]`, "color: yellow");
    console.log(
      `%c ==> [nonKeepItems.length = ${nonKeepItems.length}]`,
      "color: yellow",
    );

    nonKeepItems.forEach((curVal, index, array) => {
      const repo = curVal.querySelector(".d-flex p.m-0.f6.flex-auto");
      const repoText = repo.textContent.trim();
      if (!repoText.startsWith(keep)) {
        repo.style.border = "1px solid blue";
      }
      const button = curVal.querySelector('[title="Unsubscribe"]');
      button.click();
    });
    return nonKeepItems.length;
  }
  function unsubscribe() {
    console.log(`%c==> [unsubscribe]`, "color: yellow");
    let nonKeepCount;
    do {
      nonKeepCount = unsubscribeNonKeep();
    } while (nonKeepCount > 0);
    console.log(`%c==> [unsubscribe done]`, "color: yellow");
  }

  function addUnsubscribeButton() {
    console.log(`%c==> [addUnsubscribeButton]`, "color: yellow");
    const unsubscribeButton = document.createElement("button");
    unsubscribeButton.classList.add("btn", "BtnGroup-item");
    unsubscribeButton.innerHTML = "Unsubscribe from non-keep repos";
    unsubscribeButton.onclick = unsubscribe;

    // GitHub's header no longer has an "Explore" link; fall back to above the notifications list
    const explore = [...document.querySelectorAll("a.js-selected-navigation-item")].find(
      (e) => e.innerHTML == "Explore",
    );
    if (explore) {
      insertAfter(explore, unsubscribeButton);
      return;
    }
    const firstItem = document.querySelector(ITEM_SELECTOR);
    const listBox = firstItem && firstItem.closest(".Box");
    if (!listBox) {
      console.log(`%c==> [addUnsubscribeButton] no anchor found, skipping`, "color: yellow");
      return;
    }
    unsubscribeButton.classList.add("mb-2");
    listBox.parentNode.insertBefore(unsubscribeButton, listBox);
  }
  function openPullRequestLinksInNewTab() {
    console.log(`%c==> [openPullRequestLinksInNewTab]`, "color: yellow");
    // Capture phase so this runs before GitHub's own click/Turbo handlers
    document.addEventListener(
      "click",
      (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        const link = event.target.closest("a[href]");
        if (!link) {
          return;
        }
        const url = new URL(link.href, location.origin);
        if (url.origin !== location.origin || !/^\/[^/]+\/[^/]+\/pull\/\d+/.test(url.pathname)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        window.open(url.href, "_blank", "noopener");
      },
      true,
    );
  }

  function getRepoName(item) {
    const repo = item.querySelector(REPO_SELECTOR);
    if (!repo) {
      return null;
    }
    // Text looks like "owner/repo #1234"; keep just "owner/repo"
    return repo.textContent.trim().split(/\s+/)[0] || null;
  }

  function createGroupHeader(repoName, count) {
    const header = document.createElement("li");
    header.className = `${HEADER_CLASS} Box-row color-bg-subtle text-bold f5`;
    header.style.cssText = "padding: 8px 16px; list-style: none;";
    header.textContent = `${repoName} (${count})`;
    return header;
  }

  function groupListByRepo(list) {
    list.querySelectorAll(`:scope > .${HEADER_CLASS}`).forEach((h) => h.remove());
    const items = [...list.children].filter((el) => el.matches(ITEM_SELECTOR));
    const groups = new Map(); // insertion order = first appearance (most recent first)
    for (const item of items) {
      const repoName = getRepoName(item) || "Other";
      if (!groups.has(repoName)) {
        groups.set(repoName, []);
      }
      groups.get(repoName).push(item);
    }
    if (items.length === 0) {
      return;
    }
    // Keep the grouped block where the items were, not after other list children
    const anchor = items[0].previousSibling;
    const fragment = document.createDocumentFragment();
    for (const [repoName, groupItems] of groups) {
      fragment.appendChild(createGroupHeader(repoName, groupItems.length));
      groupItems.forEach((item) => fragment.appendChild(item));
    }
    list.insertBefore(fragment, anchor ? anchor.nextSibling : list.firstChild);
  }

  function groupNotificationsByRepo() {
    const lists = new Set(
      [...document.querySelectorAll(ITEM_SELECTOR)].map((item) => item.parentElement).filter(Boolean),
    );
    lists.forEach(groupListByRepo);
    console.log(`%c==> [groupNotificationsByRepo] grouped ${lists.size} list(s)`, "color: yellow");
  }

  function watchAndGroupByRepo() {
    let timer = null;
    const observer = new MutationObserver((mutations) => {
      // Ignore mutations caused only by our own headers being added/removed
      const relevant = mutations.some((m) =>
        [...m.addedNodes, ...m.removedNodes].some(
          (n) => n.nodeType === 1 && !n.classList.contains(HEADER_CLASS),
        ),
      );
      if (!relevant) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(run, 200);
    });

    function run() {
      observer.disconnect();
      groupNotificationsByRepo();
      // Observe <html>, not <body>: Turbo navigations swap out <body>
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    run();
  }

  // Run each feature independently so one failure doesn't block the others
  for (const feature of [openPullRequestLinksInNewTab, watchAndGroupByRepo, addUnsubscribeButton]) {
    try {
      feature();
    } catch (error) {
      console.error(`[Github Notification Plus] ${feature.name} failed`, error);
    }
  }

  console.log(`%c==> [Github Notification Plus done]`, "color: yellow");
})();
