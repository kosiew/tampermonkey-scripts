// ==UserScript==
// @name         GitHub Copy List of PRs
// @namespace    xizun
// @version      1.0
// @description  Adds a button to copy the title and URL of GitHub issues and pull requests as markdown
// @author       Siew Kam Onn
// @match        https://github.com/*/issues/*
// @match        https://github.com/*/pull/*
// @match        https://github.com/pulls
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  function copyListOfPRs() {
    const prElements = document.querySelectorAll(".js-navigation-item");
    if (prElements.length > 0) {
      const prList = [];
      let index = 1;
      prElements.forEach((prElem) => {
        const prTitleElem = prElem.querySelector(".js-navigation-open");
        const prLinkElem = prElem.querySelector("a[id^='issue_']");
        // Encoding URLs to handle special characters
        const prLink = prLinkElem
          ? "https://github.com/" + prLinkElem.getAttribute("href")
          : "";
        const prTitle = prTitleElem ? prTitleElem.innerText.trim() : "";
        const prNumMatch = prTitleElem
          ? prTitleElem.getAttribute("id").match(/\d+/)
          : null;
        const prNum = prNumMatch ? prNumMatch[0] : "";
        prList.push(`- PR ${prNum}: ${prTitle} - ${prLink}`);
      });
      return prList.join("\n");
    }
    return "";
  }

  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log("Text copied to clipboard");
      })
      .catch((error) => {
        console.error("Error copying text: ", error);
      });
  }

  function createCopyButton() {
    const buttonLabel = "Copy PR List";
    const button = document.createElement("button");
    button.className = "btn btn-sm";
    button.style.marginLeft = "10px";
    button.innerText = buttonLabel;

    button.addEventListener("click", function () {
      const prList = copyListOfPRs();
      if (prList) {
        copyToClipboard(prList);
        button.innerText = "Copied";
        setTimeout(() => (button.innerText = buttonLabel), 2000);
      }
    });

    const headerElement = document.querySelector(
      "#js-issues-toolbar .table-list-header-toggle"
    );
    headerElement.appendChild(button);
  }

  createCopyButton();
})();
