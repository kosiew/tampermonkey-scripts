// ==UserScript==
// @name         Tampermonkey Utils
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Utility functions shared across Tampermonkey scripts
// @author       You
// @match        https://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Extracts elements that contain the given phrase.
   * It walks text nodes inside matched elements and returns matches with node text snippets.
   * Supported selector options (in order of precedence):
   *  - `options.selector` (string): any valid CSS selector
   *  - `options.tag` + `options.class` + `options.id`: builds a selector from the parts
   *  - defaults to `article` if no selector/tag/id/class provided
   * @param {string} phrase - Phrase to search for (case-insensitive)
   * @param {Object} [options] - Optional settings
   * @param {string} [options.selector] - Explicit CSS selector (highest precedence)
   * @param {string} [options.tag='article'] - Tag name to match (eg. 'div', 'article')
   * @param {string|Array<string>} [options.class] - Class name(s) to match (without leading '.')
   * @param {string} [options.id] - ID to match (without leading '#')
   * @returns {Array<{ element: HTMLElement, texts: string[], article?: HTMLElement }>} - Array of matches; `article` present for backward compatibility
   */
  function extractElementsContaining(phrase, options = {}) {
    // Normalize options
    const explicitSelector = options.selector;
    let selector = explicitSelector || "";

    if (!selector) {
      const tag = options.tag || options.tagName || "article";

      let classSelector = "";
      // Support multiple property names for class: `class`, `className`, `classes`
      const classOptions =
        options.class || options.className || options.classes;
      if (classOptions) {
        if (Array.isArray(classOptions)) {
          classSelector = classOptions
            .map((c) => `.${String(c).replace(/^\./, "")}`)
            .join("");
        } else {
          classSelector = `.${String(classOptions).replace(/^\./, "")}`;
        }
      }

      let idSelector = "";
      if (options.id) {
        idSelector = `#${String(options.id).replace(/^#/, "")}`;
      }

      selector = `${tag}${classSelector}${idSelector}`;
    }
    const articles = document.querySelectorAll(selector);
    const results = [];

    if (!phrase || typeof phrase !== "string") return results;

    const lowerPhrase = phrase.toLowerCase();

    const walkerOptions = {
      acceptNode(node) {
        // Accept non-empty text nodes
        return node.textContent.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    };

    articles.forEach((articleEl) => {
      const textList = [];
      const walker = document.createTreeWalker(
        articleEl,
        NodeFilter.SHOW_TEXT,
        walkerOptions
      );

      while (walker.nextNode()) {
        textList.push(walker.currentNode.textContent.trim());
      }

      // Combine text and check match
      const combinedText = textList.join(" ").toLowerCase();

      if (combinedText.includes(lowerPhrase)) {
        results.push({
          element: articleEl,
          texts: textList,
          // Keep `article` key for backwards compatibility with older callers
          article: articleEl,
        });
      }
    });

    return results;
  }

  /**
   * A small helper to return all non-empty text nodes inside a root node as an array of strings.
   * Useful if consumers want the snippets without searching for articles specifically.
   * @param {Node} root
   * @returns {string[]}
   */
  function getTextNodeStrings(root) {
    const texts = [];
    const walkerOptions = {
      acceptNode(node) {
        return node.textContent.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    };

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      walkerOptions
    );
    while (walker.nextNode()) texts.push(walker.currentNode.textContent.trim());

    return texts;
  }

  // Expose to global window for other Tampermonkey scripts to consume
  window.TampermonkeyUtils = window.TampermonkeyUtils || {};
  Object.assign(window.TampermonkeyUtils, {
    extractElementsContaining,
    getTextNodeStrings,
    // Add waiting helper
    waitForCondition: function waitForCondition(
      conditionFn,
      interval = 200,
      timeout = 5000
    ) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          try {
            if (conditionFn()) return resolve(true);
            if (Date.now() - start > timeout) return resolve(false);
            setTimeout(check, interval);
          } catch (err) {
            return resolve(false);
          }
        };
        check();
      });
    },
  });
  // Keep the original name as an alias for backward compatibility
  window.TampermonkeyUtils.extractArticlesContaining =
    extractElementsContaining;
})();

// Example usage (uncomment to run on console):
// Basic: find phrase in elements (new API)
// const matches = window.TampermonkeyUtils.extractElementsContaining('your phrase here');
// (Backward compat alias still exists: window.TampermonkeyUtils.extractArticlesContaining)
// console.log(matches);

// Tag/class selector (search `div.post` elements)
// const matches2 = window.TampermonkeyUtils.extractElementsContaining('your phrase here', { tag: 'div', class: 'post' });
// console.log(matches2);

// ID selector (search `#main`)
// const matches3 = window.TampermonkeyUtils.extractElementsContaining('your phrase here', { id: 'main' });
// console.log(matches3);

// Multiple classes example
// const matches4 = window.TampermonkeyUtils.extractElementsContaining('your phrase here', { tag: 'div', class: ['post', 'featured'] });
// console.log(matches4);

// Explicit CSS selector (highest precedence)
// const matches5 = window.TampermonkeyUtils.extractElementsContaining('your phrase here', { selector: 'div.post > .body' });
// console.log(matches5);
