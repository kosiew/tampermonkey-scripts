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
   * Extracts articles that contain the given phrase.
   * It walks text nodes inside article elements and returns matches with node text snippets.
   * @param {string} phrase - Phrase to search for (case-insensitive)
   * @param {Object} [options] - Optional settings
   * @param {string} [options.selector='article'] - Selector used to find article elements (defaults to `article` tag)
   * @returns {Array<{ article: HTMLElement, texts: string[] }>} - Array of matches
   */
  function extractArticlesContaining(phrase, options = {}) {
    const selector = options.selector || 'article';
    const articles = document.querySelectorAll(selector);
    const results = [];

    if (!phrase || typeof phrase !== 'string') return results;

    const lowerPhrase = phrase.toLowerCase();

    const walkerOptions = {
      acceptNode(node) {
        // Accept non-empty text nodes
        return node.textContent.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    };

    articles.forEach(articleEl => {
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
      const combinedText = textList.join(' ').toLowerCase();

      if (combinedText.includes(lowerPhrase)) {
        results.push({
          article: articleEl,
          texts: textList
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
      }
    };

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, walkerOptions);
    while (walker.nextNode()) texts.push(walker.currentNode.textContent.trim());

    return texts;
  }

  // Expose to global window for other Tampermonkey scripts to consume
  window.TampermonkeyUtils = window.TampermonkeyUtils || {};
  Object.assign(window.TampermonkeyUtils, {
    extractArticlesContaining,
    getTextNodeStrings
  });

})();

// Example usage (uncomment to run on console):
// const matches = window.TampermonkeyUtils.extractArticlesContaining('your phrase here');
// console.log(matches);
