// ==UserScript==
// @name         ChatGPT Scroll Control Buttons
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Add scroll up and down buttons, including navigation between user messages and message-id divs
// @author       Your Name
// @match        https://chatgpt.com/*
// @exclude      https://chatgpt.com/codex/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/chatgpt-scroll-buttons.js
// @updateURL    https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/main/chatgpt-scroll-buttons.js
// ==/UserScript==

(function () {
  "use strict";

  // const selector = 'div[role="presentation"] > div > div > div.flex.h-full.flex-col.overflow-y-auto';
  // const selector = 'div[role="presentation"] div.flex.h-full.flex-col.overflow-y-auto';
  const selector = 'div[role="presentation"] div.overflow-y-auto';
  function getScrollableDiv() {
    return document.querySelector(selector);
  }

  function getMessageElements() {
    const messages = [...document.querySelectorAll("div[data-message-id]")]
      .map((m) => ({
        element: m,
        top: m.getBoundingClientRect().top + window.scrollY
      }))
      .filter((m) => m.top > 0) // Ensure only visible messages are considered
      .sort((a, b) => a.top - b.top);

    console.log(
      "%c📜 ==> Found messages:",
      "color: cyan; font-weight: bold;",
      messages.map((m) => m.top)
    );
    return messages;
  }

  function getNextMessage(currentScroll) {
    const messages = getMessageElements();
    const nextMessage =
      messages.find((msg) => msg.top > currentScroll)?.element || null;
    console.log(
      `%c🔍 ==> Searching for next message above ${currentScroll}`,
      "color: yellow;"
    );
    console.log(
      `%c➡️  ==> Next Message:`,
      "color: yellow; font-weight: bold;",
      nextMessage?.getBoundingClientRect().top + window.scrollY || "None Found"
    );
    return nextMessage;
  }

  function getPreviousMessage(currentScroll) {
    const messages = getMessageElements();
    const prevMessage =
      [...messages].reverse().find((msg) => msg.top < currentScroll)?.element ||
      null;
    console.log(
      `%c🔍 ==> Searching for previous message below ${currentScroll}`,
      "color: orange;"
    );
    console.log(
      `%c⬅️  ==> Previous Message:`,
      "color: orange; font-weight: bold;",
      prevMessage?.getBoundingClientRect().top + window.scrollY || "None Found"
    );
    return prevMessage;
  }

  function scrollToBottom() {
    const scrollableDiv = getScrollableDiv();
    if (scrollableDiv) {
      console.log(
        "%c👀  ==> Scrolling to Bottom 👀",
        "color: green; font-weight: bold;"
      );
      scrollableDiv.scrollTo({
        top: scrollableDiv.scrollHeight,
        behavior: "smooth"
      });
    } else {
      console.error("Scrollable div not found!");
    }
  }

  function scrollToTop() {
    const scrollableDiv = getScrollableDiv();
    if (scrollableDiv) {
      console.log(
        "%c👀  ==> Scrolling to Top 👀",
        "color: green; font-weight: bold;"
      );
      scrollableDiv.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } else {
      console.error("Scrollable div not found!");
    }
  }

  function scrollToNextMessageId() {
    const scrollableDiv = getScrollableDiv();
    if (!scrollableDiv) return;

    const currentScroll = scrollableDiv.scrollTop;
    console.log(
      `%c📍 Current Scroll Position: ${currentScroll}`,
      "color: blue; font-weight: bold;"
    );
    const nextMessage = getNextMessage(currentScroll);

    if (nextMessage) {
      console.log(
        `%c✅  ==> Scrolling to Next Message ✅`,
        "color: green; font-weight: bold;"
      );
      scrollableDiv.scrollTo({
        top: nextMessage.getBoundingClientRect().top + window.scrollY,
        behavior: "smooth"
      });
    } else {
      console.log(
        "%c🚫 No next message found 🚫",
        "color: red; font-weight: bold;"
      );
    }
  }

  function scrollToPreviousMessageId() {
    const scrollableDiv = getScrollableDiv();
    if (!scrollableDiv) return;

    const currentScroll = scrollableDiv.scrollTop;
    console.log(
      `%c📍 Current Scroll Position: ${currentScroll}`,
      "color: blue; font-weight: bold;"
    );
    const prevMessage = getPreviousMessage(currentScroll);

    if (prevMessage) {
      console.log(
        `%c✅  ==> Scrolling to Previous Message ✅`,
        "color: green; font-weight: bold;"
      );
      scrollableDiv.scrollTo({
        top: prevMessage.getBoundingClientRect().top + window.scrollY,
        behavior: "smooth"
      });
    } else {
      console.log(
        "%c🚫 No previous message found 🚫",
        "color: red; font-weight: bold;"
      );
    }
  }

  function createButton(text, onClick, bottomOffset) {
    const button = document.createElement("button");
    button.innerText = text;
    button.style.position = "fixed";
    button.style.right = "20px";
    button.style.bottom = bottomOffset + "px";
    button.style.padding = "10px";
    button.style.fontSize = "16px";
    button.style.border = "none";
    button.style.borderRadius = "5px";
    button.style.background = "rgba(0, 0, 0, 0.7)";
    button.style.color = "white";
    button.style.cursor = "pointer";
    button.style.zIndex = "1000";
    button.onclick = onClick;
    document.body.appendChild(button);
  }

  createButton("⬆", scrollToTop, 140);
  createButton("⬇", scrollToBottom, 110);
  createButton("▲", scrollToPreviousMessageId, 80);
  createButton("▼", scrollToNextMessageId, 50);
})();
