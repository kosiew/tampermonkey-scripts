// ==UserScript==
// @name         Goodreads Book Links in New Tab
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Makes all book title links open in a new tab on Goodreads search pages
// @author       Siew Kam Onn
// @match        https://www.goodreads.com/search*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=goodreads.com

// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Function to make book title links open in a new tab
  function makeLinksOpenInNewTab() {
    const bookLinks = document.querySelectorAll("a.bookTitle");
    bookLinks.forEach((link) => {
      link.setAttribute("target", "_blank");
    });
  }

  // Wait for the page to fully load before running the script
  window.addEventListener("load", () => {
    makeLinksOpenInNewTab();
  });
})();
