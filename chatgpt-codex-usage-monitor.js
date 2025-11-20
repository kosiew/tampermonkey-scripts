// ==UserScript==
// @name         ChatGPT Codex Weekly Usage Monitor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Computes daily surplus/deficit for ChatGPT Codex weekly usage limit and displays a friendly indicator
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-utils.js
// @author       You
// @match        https://chatgpt.com/codex/settings/usage
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // NOTE: This script optionally depends on `tampermonkey-utils.js` for shared utilities
  // (extractElementsContaining). A fallback search will be used if the utility library is
  // not present. To load the shared utilities automatically, include the following @require
  // metadata above (the raw GitHub URL is also present in the userscript header):
  // @require https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-utils.js

  // NOTE: waitForCondition moved into `tampermonkey-utils.js` and is used via `TampermonkeyUtils.waitForCondition`.
  // A fallback wrapper is available below to keep behavior if the shared util is not loaded for any reason.

  // Parse percent string (e.g., "66%" or "66 %") and return number 66
  function parsePercent(text) {
    if (!text || typeof text !== "string") return null;
    const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
    return m ? parseFloat(m[1]) : null;
  }

  // Parse a resetting date string like "Resets Nov 21, 2025 3:18 PM" or "Resets Nov 21, 2025"
  function parseResetDate(text) {
    if (!text || typeof text !== "string") return null;
    const m = text.match(/Resets\s+(.+)$/i);
    if (!m) return null;
    // Removing trailing/leading whitespace
    const dateStr = m[1].trim();
    const d = new Date(dateStr);
    if (isNaN(d)) {
      // Try to parse without time (ignore time as instructed)
      // Date constructor may be sensitive; return null on failure
      return null;
    }
    // Ignore time portion per requirements - set to midnight local
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Returns difference in days (integer) ignoring time portion
  function daysBetweenIgnoreTime(a, b) {
    const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((bMid - aMid) / msPerDay);
  }

  // Compute surplus/deficit
  function computeSurplusOrDeficit(remainingPercent, resetDate) {
    if (remainingPercent == null || !resetDate) return null;

    // Use a 7-day week
    const totalDays = 7;
    const today = new Date();
    const todayMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const daysRemaining = daysBetweenIgnoreTime(todayMid, resetDate);

    if (daysRemaining <= 0) {
      // If reset day is today or in the past, we can't compute effective remaining days.
      return {
        ok: false,
        reason: "reset_today_or_past",
        daysRemaining,
      };
    }

    const daysElapsed = totalDays - daysRemaining;

    const usedPercent = 100 - remainingPercent;

    const averageUsedPerDaySoFar =
      daysElapsed > 0 ? usedPercent / daysElapsed : usedPercent; // if no elapsed days, treat as entire used today
    const remainingAveragePerDay =
      daysRemaining > 0 ? remainingPercent / daysRemaining : remainingPercent;

    const dailyDiff = remainingAveragePerDay - averageUsedPerDaySoFar;

    return {
      ok: true,
      daysRemaining,
      daysElapsed,
      usedPercent,
      remainingPercent,
      averageUsedPerDaySoFar,
      remainingAveragePerDay,
      dailyDiff,
      status: dailyDiff >= 0 ? "surplus" : "deficit",
    };
  }

  // Add a small in-page widget to show the status
  function showStatusWidget(text) {
    const id = "tm-codex-usage-monitor-widget";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText =
        "position:fixed;right:20px;bottom:80px;background:#0d1117;color:#fff;padding:10px 14px;border-radius:8px;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;";
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // The main action
  async function main() {
    // Wait for utils to be present (our `tampermonkey-utils.js` should have created this)
    const utilsPresent = !!window.TampermonkeyUtils;
    const hasGlobalWait =
      utilsPresent &&
      typeof window.TampermonkeyUtils.waitForCondition === "function";
    // Local fallback wait function
    const fallbackWaitForCondition = (
      conditionFn,
      interval = 200,
      timeout = 5000
    ) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          try {
            if (conditionFn()) return resolve(true);
            if (Date.now() - start > timeout) return resolve(false);
            setTimeout(tick, interval);
          } catch (err) {
            return resolve(false);
          }
        };
        tick();
      });
    };

    const waitFn = hasGlobalWait
      ? window.TampermonkeyUtils.waitForCondition
      : fallbackWaitForCondition;
    const MAX_UTILS_WAIT_MS = 10000; // give utils up to 10s to load
    const utilsAvailable = utilsPresent
      ? await waitFn(
          () => !!window.TampermonkeyUtils.extractElementsContaining,
          200,
          MAX_UTILS_WAIT_MS
        )
      : false;
    let extractFn = null;
    if (utilsAvailable) {
      extractFn = window.TampermonkeyUtils.extractElementsContaining;
    } else if (utilsPresent) {
      // If utils were present but the specific function isn't, fallback to an available function
      extractFn =
        window.TampermonkeyUtils.extractElementsContaining ||
        fallbackExtractElementsContaining;
      if (extractFn === fallbackExtractElementsContaining)
        console.warn(
          "TampermonkeyUtils.extractElementsContaining not available; using fallback search."
        );
    } else {
      console.warn("TampermonkeyUtils not present; using fallback search.");
      extractFn = fallbackExtractElementsContaining;
    }

    // Fallback if the util is ever missing — simple DOM text search across a set of selectors
    function fallbackExtractElementsContaining(phrase, { selector } = {}) {
      const results = [];
      try {
        const nodes = document.querySelectorAll(
          selector || "article, section, div"
        );
        nodes.forEach((n) => {
          const text = n.textContent || "";
          if (text.toLowerCase().includes(String(phrase).toLowerCase())) {
            // Break into text nodes by whitespace
            const pieces = Array.from(text.split(/\s{2,}|\n|\r/))
              .map((s) => s.trim())
              .filter(Boolean);
            results.push({ element: n, texts: pieces, article: n });
          }
        });
      } catch (err) {
        // ignore
      }
      return results;
    }

    // Search for an element that contains "Weekly usage limit"
    // Try a few selectors to be resilient to markup changes, and keep trying for up to 10s
    const triedSelectors = ["article", "section", "div", "*"];
    const MAX_FIND_WAIT_MS = 10000; // per user request: try at least 10s

    function findWeeklyUsage() {
      for (const s of triedSelectors) {
        try {
          const res = extractFn("Weekly usage limit", { selector: s });
          if (res && res.length) return res;
        } catch (err) {
          // swallow errors from extractFn calls
        }
      }
      return [];
    }

    // Try immediate find first
    let matches = findWeeklyUsage();

    // If not found, wait using polling wait function for up to MAX_FIND_WAIT_MS
    if (!matches || matches.length === 0) {
      console.debug(
        'Did not find "Weekly usage limit" quickly; waiting up to 10s for the element to appear.'
      );
      const foundWithinWait = await waitFn(
        () => findWeeklyUsage().length > 0,
        200,
        MAX_FIND_WAIT_MS
      );
      if (foundWithinWait) {
        matches = findWeeklyUsage();
      }
    }

    // If still not found, observe DOM mutations to catch when the site inserts new content
    if (!matches || matches.length === 0) {
      console.debug(
        'Starting MutationObserver to catch dynamic insertion of "Weekly usage limit" for up to 10s'
      );
      matches = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          observer.disconnect();
          resolve([]);
        }, MAX_FIND_WAIT_MS);

        const observer = new MutationObserver((mutations) => {
          const found = findWeeklyUsage();
          if (found && found.length) {
            clearTimeout(timeout);
            observer.disconnect();
            resolve(found);
          }
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
        });
      });
    }

    if (!matches || matches.length === 0) {
      console.debug('No elements found matching "Weekly usage limit"');
      return;
    }

    // Use the first match with texts found
    const match = matches[0];
    const texts = match.texts || [];

    // Find remaining percent and reset date text
    let remainingPercent = null;
    let resetDate = null;

    texts.forEach((t) => {
      if (remainingPercent == null) {
        const p = parsePercent(t);
        if (p != null) remainingPercent = p;
      }
      if (!resetDate) {
        const d = parseResetDate(t);
        if (d) resetDate = d;
      }
    });

    if (remainingPercent == null) {
      console.warn("Could not find remaining percent in texts:", texts);
      showStatusWidget("Codex Usage: could not parse remaining percent");
      return;
    }

    if (!resetDate) {
      // We might find a separate text like "Resets Nov 21, 2025 3:18 PM" or simply the date; attempt a more permissive parse
      const resetText = texts.find((t) => /Resets/i.test(t));
      if (resetText) {
        resetDate = parseResetDate(resetText);
      }
    }

    if (!resetDate) {
      console.warn("Could not find a reset date in texts:", texts);
      showStatusWidget("Codex Usage: could not parse reset date");
      return;
    }

    const result = computeSurplusOrDeficit(remainingPercent, resetDate);
    if (!result || !result.ok) {
      showStatusWidget(
        "Codex Usage: cannot compute — reset day is today or in the past"
      );
      console.info("Compute result:", result);
      return;
    }

    const sign = result.status === "surplus" ? "✅ Surplus" : "⚠️ Deficit";
    const dailyDiffAbs = Math.abs(result.dailyDiff).toFixed(2);

    const message = `${sign}: ${
      result.status === "surplus" ? "+" : "-"
    }${dailyDiffAbs}% (daily)
Days remaining: ${result.daysRemaining}, used: ${result.usedPercent}%`;

    console.log("[Codex Usage]", message, result);
    showStatusWidget(message);
  }

  // Run main once DOM is loaded
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    main();
  } else {
    document.addEventListener("DOMContentLoaded", main);
  }
})();
