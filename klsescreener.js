// ==UserScript==
// @name         KLSE Screener Auto Filter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically applies advanced filters on KLSE Screener
// @author       Your Name
// @match        https://www.klsescreener.com/v2/
// @grant        none
// ==/UserScript==

(function () {
  ("use strict");

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
          `Timeout: Could not find element with selector ${selector}`
        );
      }
    }, interval);
  }

  // add a button to before the Clear button
  // <div class="">
  // <input type="reset" class="btn btn-warning" value="Clear">
  // </div>
  function addFilterButton() {
    waitForElement(".btn-warning", (clearButton) => {
      // get the div that contains the clear button
      const clearButtonDiv = clearButton.parentElement;

      const filterButton = document.createElement("input");
      // enclose the button in a div
      const filterDiv = document.createElement("div");
      filterDiv.className = "form-group";
      filterDiv.appendChild(filterButton);

      filterButton.type = "button";
      filterButton.value = "Apply Filters";
      filterButton.className = "btn btn-primary";
      filterButton.addEventListener("click", setFilterValues);

      // place the div before the clear button div

      clearButtonDiv.insertAdjacentElement("beforebegin", filterDiv);
    });
  }

  // Function to set filter values
  function setFilterValues() {
    // Wait for the filter form to appear
    waitForElement("input[name='max_pe']", () => {
      document.querySelector("input[name='max_pe']").value = "10";
      document.querySelector("input[name='min_roe']").value = "8";
      document.querySelector("input[name='min_dy']").value = "8";
      document.querySelector("input[name='max_ptbv']").value = "1.5";
      document.querySelector("input[name='min_volume']").value = "100";

      const profitableTypeSelect = document.querySelector(
        "select[name='profitable_type']"
      );
      if (profitableTypeSelect) {
        profitableTypeSelect.value = "years";
        // Trigger change event to ensure the page reacts to the value change if necessary
        profitableTypeSelect.dispatchEvent(new Event("change"));
      }

      // Set "Continuous Profitable for" to "5 years"
      const profitableYearsSelect = document.querySelector(
        "select[name='profitable_years']"
      );
      if (profitableYearsSelect) {
        profitableYearsSelect.value = "5";
        // Trigger change event
        profitableYearsSelect.dispatchEvent(new Event("change"));
      }

      // Enable "Strict Mode" checkbox
      const strictModeCheckbox = document.querySelector(
        "input[name='profitable_strict']"
      );
      if (strictModeCheckbox && !strictModeCheckbox.checked) {
        strictModeCheckbox.click();
      }

      const netCashCheckbox = document.querySelector("input[name='netcash']");

      // Check if the checkbox exists and is not already checked
      if (netCashCheckbox && !netCashCheckbox.checked) {
        netCashCheckbox.click(); // Tick the checkbox
        console.log("Net Cash checkbox ticked.");
      } else if (netCashCheckbox) {
        console.log("Net Cash checkbox is already ticked.");
      } else {
        console.error("Net Cash checkbox not found.");
      }

      const debtToEquityInput = document.querySelector(
        "input[name='debt_to_equity_max']"
      );

      // Check if the input exists
      if (debtToEquityInput) {
        debtToEquityInput.value = "0.5"; // Set the value to 0.5
        // Trigger an input event to ensure the change is registered by any event listeners
        debtToEquityInput.dispatchEvent(new Event("input"));
        console.log("Debt to Equity max set to 0.5.");
      } else {
        console.error("Debt to Equity input field not found.");
      }
    });
  }

  // Wait for the page to fully load before running the script
  window.addEventListener("load", () => {
    addFilterButton();
  });
})();
