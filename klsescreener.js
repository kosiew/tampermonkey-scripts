// ==UserScript==
// @name         KLSE Screener Auto Filter
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Automatically applies advanced filters on KLSE Screener
// @author       Your Name
// @match        https://www.klsescreener.com/v2/
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/klsescreener.js
// @updateURL    https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/klsescreener.js
// ==/UserScript==

(function () {
  "use strict";

  // Wait for the page to load fully
  function waitForElement(selector, callback, interval = 100, timeout = 10000) {
    const start = Date.now();
    const check = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(check);
        callback(element);
      } else if (Date.now() - start > timeout) {
        clearInterval(check);
        console.error(
          `Timeout: Could not find element with selector ${selector}`,
        );
      }
    }, interval);
  }

  // add a button to before the Clear button
  // <div class="">
  // <input type="reset" class="btn btn-warning" value="Clear">
  // </div>
  function addFilterButton() {
    // KLSE updated Clear from input.btn-warning to button[type=reset].
    const clearSelector =
      "button[type='reset'], input[type='reset'], .btn-warning";

    waitForElement(clearSelector, (clearButton) => {
      if (document.getElementById("tm-apply-filters-btn")) {
        return;
      }

      const filterButton = document.createElement("button");
      filterButton.id = "tm-apply-filters-btn";
      filterButton.type = "button";
      filterButton.textContent = "Apply Filters";
      filterButton.className = "btn btn-primary btn-sm rounded-pill py-0 px-2";
      filterButton.style.fontSize = "0.7rem";
      filterButton.style.height = "22px";
      filterButton.style.borderWidth = "1px";
      filterButton.addEventListener("click", setFilterValues);

      clearButton.insertAdjacentElement("beforebegin", filterButton);
    });
  }

  // Set a field's value and fire bubbling events so the page's delegated
  // jQuery handlers (formAction on #form / document) register the change.
  function setField(name, value) {
    const el = document.querySelector(`#form [name='${name}']`);
    if (!el) {
      console.error(`[KLSE Screener] Field not found: ${name}`);
      return null;
    }
    if (el.type === "checkbox") {
      el.checked = value;
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el;
  }

  function setFilterValues() {
    waitForElement("#form input[name='max_pe']", () => {
      setField("max_pe", "10");
      setField("min_roe", "8");
      setField("min_dy", "8");
      setField("max_ptbv", "1.5");
      setField("min_volume", "100");
      setField("debt_to_equity_max", "0.5");

      // profitable_type must change first: the page's change handler enables
      // the otherwise-disabled profitable_years and profitable_strict fields.
      setField("profitable_type", "years");
      setField("profitable_years", "5");
      setField("profitable_strict", true);

      setField("netcash", true);
      console.log("[KLSE Screener] Filters applied.");
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", addFilterButton, {
      once: true,
    });
  } else {
    addFilterButton();
  }
})();
