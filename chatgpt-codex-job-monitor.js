// ==UserScript==
// @name         ChatGPT Codex Job Completion Monitor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Monitor for job completion on ChatGPT Codex by detecting when stop buttons disappear
// @author       Siew Kam Onn
// @match        https://chatgpt.com/codex
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  console.log("==> ChatGPT Codex Job Monitor script started");
  const SECOND = 1000; // 1 second in milliseconds
  const CONFIG = {
    checkInterval: 30 * SECOND,
    debounceDelay: 10 * SECOND, // Wait 2 seconds before confirming job completion
  };

  /**
   * Represents a monitored job with its associated stop button and job name
   */
  class Job {
    constructor(stopButton, jobName, jobId) {
      this.stopButton = stopButton;
      this.jobName = jobName;
      this.jobId = jobId;
      this.isActive = true;
      this.lastSeen = Date.now();
    }

    /**
     * Updates the last seen timestamp for this job
     */
    updateLastSeen() {
      this.lastSeen = Date.now();
    }

    /**
     * Checks if this job should be considered completed (not seen for debounce period)
     * @returns {boolean} True if job should be considered completed
     */
    isCompleted() {
      return this.isActive && Date.now() - this.lastSeen > CONFIG.debounceDelay;
    }

    /**
     * Marks this job as completed
     */
    markCompleted() {
      this.isActive = false;
    }
  }

  /**
   * Main job monitor class that tracks stop buttons and job completions
   */
  class JobMonitor {
    constructor() {
      this.jobs = new Map(); // jobId -> Job
      this.monitorInterval = null;
      this.isMonitoring = false;
    }

    /**
     * Starts monitoring for job completions
     */
    startMonitoring() {
      if (this.isMonitoring) {
        console.log("==> Job monitoring already active");
        return;
      }

      console.log("==> Starting job monitoring");
      this.isMonitoring = true;
      this.monitorInterval = setInterval(() => {
        this.checkJobs();
      }, CONFIG.checkInterval);

      // Initial scan
      this.scanForJobs();
    }

    /**
     * Stops monitoring for job completions
     */
    stopMonitoring() {
      if (!this.isMonitoring) {
        return;
      }

      console.log("==> Stopping job monitoring");
      this.isMonitoring = false;
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
    }

    /**
     * Scans the page for current stop buttons and associated job names
     */
    scanForJobs() {
      // Find all stop buttons currently on the page
      const stopButtons = document.querySelectorAll(
        'button[data-testid="stop-button"], button[aria-label="Cancel task"]'
      );

      console.log(`==> Found ${stopButtons.length} stop button(s)`);

      // Track which jobs are currently active
      const currentJobIds = new Set();

      stopButtons.forEach((stopButton, index) => {
        const jobInfo = this.extractJobInfo(stopButton);
        if (jobInfo) {
          // Create a more stable job ID based on job name
          const sanitizedJobName = jobInfo.jobName
            .replace(/[^a-zA-Z0-9]/g, "_")
            .substring(0, 30);
          const jobId = `job_${sanitizedJobName}_${jobInfo.jobName.length}`;
          currentJobIds.add(jobId);

          if (this.jobs.has(jobId)) {
            // Update existing job
            this.jobs.get(jobId).updateLastSeen();
            console.log(
              `==> Updated existing job: "${jobInfo.jobName}" (ID: ${jobId})`
            );
          } else {
            // Create new job
            const job = new Job(stopButton, jobInfo.jobName, jobId);
            this.jobs.set(jobId, job);
            console.log(
              `==> New job detected: "${jobInfo.jobName}" (ID: ${jobId})`
            );
          }
        } else {
          console.log(
            `==> Could not extract job info for stop button ${index + 1}`
          );
        }
      });

      // Check for jobs whose stop buttons are no longer present
      for (const [jobId, job] of this.jobs) {
        if (!currentJobIds.has(jobId) && job.isActive) {
          console.log(
            `==> Job stop button disappeared: "${job.jobName}" (ID: ${jobId})`
          );
          // Don't update lastSeen here - let the debounce logic handle completion detection
        }
      }
    }

    /**
     * Extracts job information from a stop button's context
     * @param {HTMLElement} stopButton - The stop button element
     * @returns {Object|null} Job information or null if not found
     */
    extractJobInfo(stopButton) {
      try {
        console.log("==> Extracting job info from stop button:", stopButton);

        // Find the main job container (the div with grid layout)
        const jobContainer =
          stopButton.closest('div[class*="grid"]') ||
          stopButton.closest('div[class*="border-b"]') ||
          stopButton.closest("div");

        if (!jobContainer) {
          console.log("==> No job container found");
          return null;
        }

        console.log("==> Job container found:", jobContainer);

        // Look for the job name in the specific structure
        // Pattern: .text-token-text-primary > div > .font-medium > span
        let jobNameElement = jobContainer.querySelector(
          ".text-token-text-primary .font-medium span"
        );

        if (!jobNameElement) {
          // Alternative patterns to try
          jobNameElement =
            jobContainer.querySelector(".font-medium span") ||
            jobContainer.querySelector(".text-token-text-primary span") ||
            jobContainer.querySelector("div.font-medium span") ||
            jobContainer.querySelector(".truncate.font-medium span");
        }

        if (!jobNameElement) {
          console.log("==> Trying broader search within job container");
          // Broader search - look for any span with meaningful text
          const spans = jobContainer.querySelectorAll("span");
          for (const span of spans) {
            const text = span.textContent.trim();
            // Look for spans that contain job-like text (avoid timestamps, repo names, etc.)
            if (
              text.length > 5 &&
              !text.includes("min ago") &&
              !text.includes("·") &&
              !text.includes("/") &&
              !text.match(/^\d+/) &&
              !text.includes("Running") &&
              !text.includes("Cancel")
            ) {
              jobNameElement = span;
              console.log(`==> Found potential job name span: "${text}"`);
              break;
            }
          }
        }

        if (!jobNameElement) {
          console.log(
            "==> No job name element found, trying text node extraction"
          );
          // Last resort: extract meaningful text from the container
          const allText = jobContainer.textContent || "";
          const lines = allText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line);

          // Find the first line that looks like a job name
          for (const line of lines) {
            if (
              line.length > 5 &&
              !line.includes("min ago") &&
              !line.includes("·") &&
              !line.match(/^[\d\s]*$/) &&
              !line.includes("Running") &&
              !line.includes("Cancel")
            ) {
              console.log(`==> Extracted job name from text: "${line}"`);
              return {
                jobName: line.substring(0, 100),
                element: jobContainer,
              };
            }
          }

          console.log("==> Could not extract job name");
          return null;
        }

        const jobName = jobNameElement.textContent.trim();

        if (jobName && jobName.length > 0) {
          console.log(`==> Successfully extracted job name: "${jobName}"`);
          return {
            jobName: jobName,
            element: jobNameElement,
          };
        }

        console.log("==> Job name element found but empty");
        return null;
      } catch (error) {
        console.error("==> Error extracting job info:", error);
        return null;
      }
    }

    /**
     * Gets all text nodes within an element
     * @param {HTMLElement} element - The element to search
     * @returns {Array} Array of text nodes
     */
    getTextNodes(element) {
      const textNodes = [];
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim()) {
          textNodes.push(node);
        }
      }
      return textNodes;
    }

    /**
     * Checks all monitored jobs for completion
     */
    checkJobs() {
      // First, scan for current jobs to update their status
      this.scanForJobs();

      // Then check for completed jobs
      for (const [jobId, job] of this.jobs) {
        if (job.isCompleted()) {
          console.log(`==> Job completed: "${job.jobName}" (ID: ${jobId})`);
          this.notifyJobCompleted(job);
          job.markCompleted();
        } else if (job.isActive) {
          const timeSinceLastSeen = Date.now() - job.lastSeen;
          console.log(
            `==> Job "${job.jobName}" still active, last seen ${timeSinceLastSeen}ms ago`
          );
        }
      }

      // Clean up old completed jobs (keep them for a while for debugging)
      const cutoffTime = Date.now() - 5 * 60 * 1000; // 5 minutes
      for (const [jobId, job] of this.jobs) {
        if (!job.isActive && job.lastSeen < cutoffTime) {
          console.log(`==> Cleaning up old completed job: "${job.jobName}"`);
          this.jobs.delete(jobId);
        }
      }
    }

    /**
     * Sends a notification when a job completes
     * @param {Job} job - The completed job
     */
    notifyJobCompleted(job) {
      const message = `Job completed: ${job.jobName}`;

      console.log(`==> ${message}`);

      // Send GM notification
      GM.notification({
        title: "ChatGPT Codex Job Completed",
        text: job.jobName,
        timeout: 5000,
      });

      // Optional: Add visual notification on the page
      this.showPageNotification(job.jobName);
    }

    /**
     * Shows a brief visual notification on the page
     * @param {string} jobName - The name of the completed job
     */
    showPageNotification(jobName) {
      // Create a temporary notification element
      const notification = document.createElement("div");
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease-out;
      `;

      notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px;">Job Completed!</div>
        <div>${jobName}</div>
      `;

      // Add slide-in animation
      const style = document.createElement("style");
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(notification);

      // Remove notification after 4 seconds
      setTimeout(() => {
        notification.style.animation = "slideIn 0.3s ease-out reverse";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
          if (style.parentNode) {
            style.parentNode.removeChild(style);
          }
        }, 300);
      }, 4000);
    }

    /**
     * Gets the current status of all monitored jobs
     * @returns {Object} Status information
     */
    getStatus() {
      const activeJobs = Array.from(this.jobs.values()).filter(
        (job) => job.isActive
      );
      const completedJobs = Array.from(this.jobs.values()).filter(
        (job) => !job.isActive
      );

      return {
        isMonitoring: this.isMonitoring,
        activeJobs: activeJobs.length,
        completedJobs: completedJobs.length,
        totalJobs: this.jobs.size,
        jobs: Array.from(this.jobs.values()).map((job) => ({
          id: job.jobId,
          name: job.jobName,
          isActive: job.isActive,
          lastSeen: new Date(job.lastSeen).toLocaleTimeString(),
        })),
      };
    }
  }

  // Create global job monitor instance
  const jobMonitor = new JobMonitor();

  /**
   * Initialize the script
   */
  function initializeScript() {
    console.log("==> Initializing ChatGPT Codex Job Monitor");
    console.log("==> Current page URL:", window.location.href);

    // Check if we're on the right page
    if (!window.location.href.includes("/codex")) {
      console.log("==> Not on Codex page, monitoring not started");
      return;
    }

    // Start monitoring
    jobMonitor.startMonitoring();

    // Add debugging function to window for manual testing
    window.jobMonitorStatus = () => {
      const status = jobMonitor.getStatus();
      console.log("==> Job Monitor Status:", status);
      return status;
    };

    // Add function to manually scan for jobs (for debugging)
    window.scanJobs = () => {
      console.log("==> Manual job scan triggered");
      jobMonitor.scanForJobs();
      return jobMonitor.getStatus();
    };

    // Add function to test job extraction on current stop buttons
    window.testJobExtraction = () => {
      const stopButtons = document.querySelectorAll(
        'button[data-testid="stop-button"], button[aria-label="Cancel task"]'
      );
      console.log(`==> Found ${stopButtons.length} stop buttons for testing`);

      stopButtons.forEach((button, index) => {
        console.log(`==> Testing button ${index + 1}:`, button);
        const jobInfo = jobMonitor.extractJobInfo(button);
        console.log(`==> Extracted job info:`, jobInfo);
      });

      return Array.from(stopButtons).map((button, index) => ({
        buttonIndex: index + 1,
        button: button,
        jobInfo: jobMonitor.extractJobInfo(button),
      }));
    };

    console.log("==> Job monitor initialized. Debug functions available:");
    console.log("==> - jobMonitorStatus(): Get current status");
    console.log("==> - scanJobs(): Manually scan for jobs");
    console.log("==> - testJobExtraction(): Test job name extraction");
  }

  /**
   * Handle page navigation (ChatGPT uses client-side routing)
   */
  function handlePageChange() {
    console.log("==> Page change detected");

    // Stop current monitoring
    jobMonitor.stopMonitoring();

    // Restart if on codex page
    setTimeout(() => {
      initializeScript();
    }, 1000); // Give the page time to load
  }

  // Initialize when page is ready
  if (document.readyState === "loading") {
    console.log("==> Document still loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", initializeScript);
  } else {
    console.log("==> Document already loaded, initializing immediately");
    initializeScript();
  }

  // Handle client-side navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      handlePageChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Also listen for popstate events
  window.addEventListener("popstate", handlePageChange);

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    jobMonitor.stopMonitoring();
  });
})();
