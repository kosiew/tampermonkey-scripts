// ==UserScript==
// @name         GitHub URL Notes Manager
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a button to manage notes for GitHub URLs with Gist storage
// @author       Siew Kam Onn
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @grant        window.open
// @connect      api.github.com
// @connect      github.com
// ==/UserScript==

(function () {
  "use strict";

  const GITHUB_API = "https://api.github.com";

  // Add rate limiting constants
  const RATE_LIMIT_RESET_KEY = "gh_rate_limit_reset";
  const MIN_REQUEST_INTERVAL = 1000; // 1 second minimum between requests
  let lastRequestTime = 0;
  let isAuthenticating = false;

  // Initialize environment variables
  async function getEnvVariables() {
    let gistId = await GM.getValue("GIST_ID");
    let clientId = await GM.getValue("CLIENT_ID");

    if (!gistId) {
      gistId = prompt("Please enter your Gist ID:");
      if (gistId) {
        await GM.setValue("GIST_ID", gistId);
      }
    }

    if (!clientId) {
      clientId = prompt("Please enter your GitHub OAuth App Client ID:");
      if (clientId) {
        await GM.setValue("CLIENT_ID", clientId);
      }
    }

    return { gistId, clientId };
  }

  // Helper function to delay between requests
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Check if we're rate limited
  async function checkRateLimit() {
    const resetTime = await GM.getValue(RATE_LIMIT_RESET_KEY, 0);
    if (resetTime > Date.now()) {
      const waitMinutes = Math.ceil((resetTime - Date.now()) / 60000);
      throw new Error(
        `Rate limit exceeded. Please wait ${waitMinutes} minutes before trying again.`
      );
    }
  }

  async function makeRequest(options) {
    await checkRateLimit();

    // Ensure minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }

    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        ...options,
        onload: (response) => {
          lastRequestTime = Date.now();

          // Check for rate limit headers
          const rateLimitRemaining = parseInt(
            response.responseHeaders.match(/x-ratelimit-remaining: (\d+)/i)?.[1]
          );
          const rateLimitReset = parseInt(
            response.responseHeaders.match(/x-ratelimit-reset: (\d+)/i)?.[1]
          );

          if (rateLimitRemaining === 0 && rateLimitReset) {
            GM.setValue(RATE_LIMIT_RESET_KEY, rateLimitReset * 1000);
          }

          if (response.status === 429) {
            const resetTime = new Date(rateLimitReset * 1000);
            reject(
              new Error(
                `Rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`
              )
            );
            return;
          }

          if (response.status >= 200 && response.status < 300) {
            resolve(response);
          } else {
            reject(
              new Error(
                `Request failed: ${response.status} ${response.statusText}`
              )
            );
          }
        },
        onerror: (error) => reject(error)
      });
    });
  }

  async function initializeAuth() {
    if (isAuthenticating) {
      alert(
        "Authentication already in progress. Please complete the device flow authentication."
      );
      return null;
    }

    try {
      await checkRateLimit();
    } catch (error) {
      alert(error.message);
      return null;
    }

    const token = await GM.getValue("github_token");
    if (!token) {
      isAuthenticating = true;
      try {
        const newToken = await startDeviceFlow();
        isAuthenticating = false;
        return newToken;
      } catch (error) {
        isAuthenticating = false;
        if (error.message.includes("rate limit")) {
          alert(error.message);
        } else {
          alert("Authentication failed: " + error.message);
        }
        return null;
      }
    }
    return token;
  }

  async function startDeviceFlow() {
    const { clientId } = await getEnvVariables();
    if (!clientId) {
      throw new Error("Client ID is required");
    }

    try {
      const response = await makeRequest({
        method: "POST",
        url: "https://github.com/login/device/code",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        data: JSON.stringify({
          client_id: clientId,
          scope: "gist"
        })
      });

      const data = JSON.parse(response.responseText);
      if (!data.device_code || !data.user_code || !data.verification_uri) {
        throw new Error("Invalid response from GitHub device flow");
      }

      window.open(data.verification_uri, "_blank");
      alert(
        `Please enter this code on GitHub: ${data.user_code}\nKeep this tab open while authenticating.`
      );

      return await pollForToken(data.device_code, data.interval || 5);
    } catch (error) {
      throw error;
    }
  }

  async function pollForToken(deviceCode, interval) {
    const { clientId } = await getEnvVariables();

    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 180; // 15 minutes maximum polling time

      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollInterval);
          reject(new Error("Authentication timed out"));
          return;
        }

        try {
          const response = await makeRequest({
            method: "POST",
            url: "https://github.com/login/oauth/access_token",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            data: JSON.stringify({
              client_id: clientId,
              device_code: deviceCode,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code"
            })
          });

          const data = JSON.parse(response.responseText);

          if (data.error) {
            if (data.error !== "authorization_pending") {
              clearInterval(pollInterval);
              reject(new Error(data.error_description || data.error));
            }
            return;
          }

          if (data.access_token) {
            clearInterval(pollInterval);
            await GM.setValue("github_token", data.access_token);
            alert("Successfully authenticated!");
            resolve(data.access_token);
          }
        } catch (error) {
          if (error.message.includes("rate limit")) {
            clearInterval(pollInterval);
            reject(error);
          }
        }
      }, interval * 1000);
    });
  }

  function createButton() {
    const button = document.createElement("button");
    button.textContent = "Save Note";
    button.style.position = "fixed";
    button.style.bottom = "20px";
    button.style.right = "20px";
    button.style.zIndex = "9999";
    button.style.padding = "8px 16px";
    button.style.backgroundColor = "#2ea44f";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";

    button.addEventListener("click", updateGist);
    document.body.appendChild(button);
  }

  async function updateGist() {
    const { gistId } = await getEnvVariables();
    if (!gistId) {
      alert("Gist ID is required");
      return;
    }

    const currentUrl = window.location.href;
    const content = "Hello World";

    try {
      const token = await initializeAuth();
      if (!token) {
        return;
      }

      const response = await makeRequest({
        method: "PATCH",
        url: `${GITHUB_API}/gists/${gistId}`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        data: JSON.stringify({
          files: {
            "notes.json": {
              content: JSON.stringify(
                {
                  url: currentUrl,
                  note: content,
                  timestamp: new Date().toISOString()
                },
                null,
                2
              )
            }
          }
        })
      });

      alert("Note saved successfully!");
    } catch (error) {
      if (error.message.includes("401")) {
        await GM.setValue("github_token", null);
        alert("Authentication expired. Please try again.");
        await initializeAuth();
      } else {
        alert("Error saving note: " + error.message);
      }
    }
  }

  // Initialize
  createButton();
})();
