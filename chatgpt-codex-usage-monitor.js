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
  // Global flag: when true, the script will require `tampermonkey-utils.js` to be loaded
  // If the utils file is not present, the script will alert the user and abort.
  // If false, the script will fall back to local implementations when possible.
  const REQUIRE_TAMPERMONKEY_UTILS = true;
  // Allow overriding the constant by setting `window.REQUIRE_TAMPERMONKEY_UTILS = true|false` before the script runs
  const REQUIRE_UTILS =
    typeof window !== "undefined" &&
    typeof window.REQUIRE_TAMPERMONKEY_UTILS === "boolean"
      ? window.REQUIRE_TAMPERMONKEY_UTILS
      : REQUIRE_TAMPERMONKEY_UTILS;

  // Whether to show the equivalent buffer in days (can be overridden via `window.SHOW_EQUIVALENT_BUFFER = true|false`)
  const SHOW_EQUIVALENT_BUFFER = true;

  // Standard average daily quota (percent per day) = 100% over 7 days
  // Can be overridden via `window.QUOTA_PER_DAY = <number>` if desired
  const QUOTA_PER_DAY = 100 / 7;

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
    // Try a natural date first
    let d = new Date(dateStr);
    if (isNaN(d)) {
      // If the text contains only a time (eg. "3:18 PM" or "15:18"), assume it's resetting today.
      // We ignore the time portion for calculations, so return today's date at midnight.
      const timeOnly = /^\d{1,2}(:\d{2})?(\s*[AaPp][Mm])?$/.test(dateStr);
      if (timeOnly) {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate());
      }
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
  // Accept optional `todayParam` to make function testable and deterministic. Also accepts optional `quotaPerDayParam`.
  function computeSurplusOrDeficit(
    remainingPercent,
    resetDate,
    todayParam,
    quotaPerDayParam,
  ) {
    if (remainingPercent == null || !resetDate) return null;

    // Use a 7-day week
    const totalDays = 7;
    const today = todayParam || new Date();
    const todayMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
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

    // Compute an intuitive "equivalent days" measure:
    // - `equivalentDaysTotal` = how many days the remaining percent can sustain current average usage
    // - `equivalentBufferDays` = equivalentDaysTotal - daysRemaining (positive means extra days beyond reset)
    const equivalentDaysTotal =
      averageUsedPerDaySoFar > 0
        ? remainingPercent / averageUsedPerDaySoFar
        : null;
    const equivalentBufferDays =
      equivalentDaysTotal != null ? equivalentDaysTotal - daysRemaining : null;

    // Quota-based calculations: allow override, otherwise use configured QUOTA_PER_DAY
    const quotaPerDay =
      typeof quotaPerDayParam === "number"
        ? quotaPerDayParam
        : typeof window !== "undefined" &&
            typeof window.QUOTA_PER_DAY === "number"
          ? window.QUOTA_PER_DAY
          : QUOTA_PER_DAY;
    const daysFromQuota =
      quotaPerDay > 0 ? remainingPercent / quotaPerDay : null;

    return {
      ok: true,
      daysRemaining,
      daysElapsed,
      usedPercent,
      remainingPercent,
      averageUsedPerDaySoFar,
      remainingAveragePerDay,
      dailyDiff,
      equivalentDaysTotal,
      equivalentBufferDays,
      quotaPerDay,
      daysFromQuota,
      status: dailyDiff >= 0 ? "surplus" : "deficit",
    };
  }

  // Add a small in-page widget to show the status. Uses shared `TampermonkeyUtils.showStatusWidget` when available,
  // otherwise falls back to a local implementation similar to the original.
  function showStatusWidget(text, opts = {}) {
    const optsWithId = {
      id: opts.id || "tm-codex-usage-monitor-widget",
      ...opts,
    };
    if (
      window.TampermonkeyUtils &&
      typeof window.TampermonkeyUtils.showStatusWidget === "function"
    ) {
      try {
        window.TampermonkeyUtils.showStatusWidget(text, optsWithId);
        return;
      } catch (e) {
        // fallthrough to local fallback
      }
    }

    const id = optsWithId.id;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText = `position:fixed;right:${
        optsWithId.position?.right || 20
      }px;bottom:${optsWithId.position?.bottom || 80}px;background:${
        optsWithId.background || "#0d1117"
      };color:${
        optsWithId.color || "#fff"
      };padding:10px 14px;border-radius:8px;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;`;
      document.body.appendChild(el);
    }
    el.textContent = text;
    if (optsWithId.duration && optsWithId.duration > 0) {
      setTimeout(() => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, optsWithId.duration);
    }
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
      timeout = 5000,
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
          MAX_UTILS_WAIT_MS,
        )
      : false;

    // If the user requires the utils file to be present, abort with an alert if not loaded
    if (REQUIRE_UTILS && !utilsAvailable) {
      const alertMsg =
        "This script requires tampermonkey-utils.js to be loaded. Please include it using `@require https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-utils.js` in the userscript header.";
      console.error(alertMsg);
      try {
        showStatusWidget(alertMsg, { duration: 15000 });
      } catch (e) {
        /* ignore */
      }
      try {
        alert(alertMsg);
      } catch (e) {
        /* ignore */
      }
      return;
    }
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
          "TampermonkeyUtils.extractElementsContaining not available; using fallback search.",
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
          selector || "article, section, div",
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
        'Did not find "Weekly usage limit" quickly; waiting up to 10s for the element to appear.',
      );
      const foundWithinWait = await waitFn(
        () => findWeeklyUsage().length > 0,
        200,
        MAX_FIND_WAIT_MS,
      );
      if (foundWithinWait) {
        matches = findWeeklyUsage();
      }
    }

    // If still not found, observe DOM mutations to catch when the site inserts new content
    if (!matches || matches.length === 0) {
      console.debug(
        'Starting MutationObserver to catch dynamic insertion of "Weekly usage limit" for up to 10s',
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
        "Codex Usage: cannot compute — reset day is today or in the past",
      );
      console.info("Compute result:", result);
      return;
    }

    // Simplified widget: show only the surplus/deficit equivalent in days
    const sign = result.status === "surplus" ? "✅ Surplus" : "⚠️ Deficit";
    const buffer = result.equivalentBufferDays;

    let message;
    if (buffer == null) {
      message = `${sign}: N/A`;
    } else {
      const signChar = buffer >= 0 ? "+" : "-";
      message = `${sign}: ${signChar}${Math.abs(buffer).toFixed(2)} day${Math.abs(buffer) === 1 ? "" : "s"}`;
    }

    // Keep the full result in the console for debugging
    console.log("[Codex Usage]", message, result);
    showStatusWidget(message);
  }

  // Run main once DOM is loaded (guard for non-browser environments like Node)
  if (typeof document !== "undefined") {
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      main();
    } else {
      document.addEventListener("DOMContentLoaded", main);
    }
  }

  // Export functions for Node-based tests (when running under Node)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      computeSurplusOrDeficit,
      parsePercent,
      parseResetDate,
      daysBetweenIgnoreTime,
    };
  }
})();
