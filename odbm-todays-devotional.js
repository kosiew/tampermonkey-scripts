// ==UserScript==
// @name         ODBM Today's Devotional Auto-Click
// @namespace    http://tampermonkey.net/
// @version      2026-04-13
// @description  Automatically clicks the first Today's Devotional link on odbm.org/en-GB
// @author       You
// @match        https://www.odbm.org/en-GB/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  console.log("[ODBM Devotional] script loaded", window.location.href);
  let hasClickedDevotional = false;
  const SEARCH_TEXT = "TODAY'S DEVOTIONAL";
  const WAIT_TIMEOUT = 15000;

  function waitForDevotionalAnchor(timeout = WAIT_TIMEOUT) {
    return new Promise((resolve) => {
      const normalizeText = (text) =>
        text.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toUpperCase();

      const matchText = normalizeText(SEARCH_TEXT);

      const findAnchor = () => {
        const anchorCandidates = Array.from(
          document.querySelectorAll(
            "a[href*='/en-GB/devotional'], a[href*='/devotional/']",
          ),
        );

        console.log(
          "[ODBM Devotional] anchor candidates by devotional href:",
          anchorCandidates.length,
        );

        for (const anchor of anchorCandidates) {
          const container = anchor.closest("div") || anchor;
          const containerText = normalizeText(container.textContent || "");
          const anchorText = normalizeText(anchor.textContent || "");

          console.log(
            "[ODBM Devotional] candidate anchor",
            anchor.href,
            "containerText snippet",
            containerText.slice(0, 120),
          );

          if (
            containerText.includes(matchText) ||
            anchorText.includes(matchText) ||
            normalizeText(
              (anchor.closest("div") || document.body).textContent || "",
            ).includes(matchText)
          ) {
            return anchor;
          }
        }

        const textElements = Array.from(
          document.querySelectorAll("span,div,p,h1,h2,h3"),
        ).filter((el) => {
          const text = normalizeText(el.textContent || "");
          return text === matchText || text.includes(matchText);
        });

        console.log(
          "[ODBM Devotional] text elements matching devotional label:",
          textElements.length,
        );

        for (const element of textElements) {
          const anchor =
            element.closest("a") ||
            element
              .closest("div")
              ?.querySelector(
                "a[href*='/en-GB/devotional'], a[href*='/devotional/']",
              ) ||
            element.closest("div")?.querySelector("a");
          console.log(
            "[ODBM Devotional] devotional label element found, candidate anchor:",
            anchor,
            "element snippet",
            normalizeText(element.textContent || "").slice(0, 120),
          );
          if (anchor) {
            return anchor;
          }
        }

        return null;
      };

      console.log("[ODBM Devotional] waiting for devotional anchor...");
      const anchor = findAnchor();
      if (anchor) {
        console.log(
          "[ODBM Devotional] devotional anchor found immediately",
          anchor,
        );
        resolve(anchor);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        console.log(
          "[ODBM Devotional] mutation observer triggered",
          mutations.length,
          "mutations",
        );
        const found = findAnchor();
        if (found) {
          console.log(
            "[ODBM Devotional] devotional anchor found by observer",
            found,
          );
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        console.log("[ODBM Devotional] wait timeout reached, no anchor found");
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function clickTodaysDevotional() {
    console.log("[ODBM Devotional] clickTodaysDevotional started");
    if (hasClickedDevotional) {
      console.log(
        "[ODBM Devotional] already clicked in this page load, skipping",
      );
      return;
    }

    const anchor = await waitForDevotionalAnchor();
    if (!anchor) {
      console.warn("[ODBM Devotional] no devotional anchor was found");
      return;
    }

    console.log(
      "[ODBM Devotional] clicking devotional anchor",
      anchor.href || anchor,
    );
    hasClickedDevotional = true;

    if (typeof anchor.click === "function") {
      anchor.click();
    } else if (anchor.href) {
      window.location.href = anchor.href;
    }
  }

  function init() {
    console.log(
      "[ODBM Devotional] init(), document.readyState=",
      document.readyState,
    );
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        console.log("[ODBM Devotional] DOMContentLoaded");
        clickTodaysDevotional();
      });
    } else {
      clickTodaysDevotional();
    }
  }

  init();
})();
