javascript: (function () {
  d1.keyValueStore.set("is-dev", true);
  const INTERVAL = 200;
  const features = [
    { name: "enableExperimentalAI", value: true },
    { name: "prefilledEntryURLs", value: true },
    { name: "enableComments", value: true },
    { name: "showSharedJournals", value: true },
    { name: "showSearchButton", value: true },
    { name: "enableE2EEKeyGeneration", value: true },
    { name: "showNewTimelineRows", value: true },
    { name: "enablePasskeys", value: true },
    { name: "enableE2EEKeyFromGoogleDrive", value: true },
    { name: "enableManageTemplates", value: true },
    { name: "showProfileSharingSetting", value: true },
    { name: "enableMediaView", value: true }
  ];

  async function setFeature(feature) {
    await d1.userSettingsRepository.setFeatureFlag(feature.name, feature.value);
  }

  function setFeatures(features) {
    let index = 0;
    const intervalID = setInterval(function () {
      if (index >= features.length) {
        clearInterval(intervalID);
      } else {
        setFeature(features[index]);
        index++;
      }
    }, INTERVAL);
  }

  setFeatures(features);

  const css = `@keyframes shake {
        0% { transform: translate(1px, 1px) rotate(0deg); }
        10% { transform: translate(-1px, -2px) rotate(-1deg); }
        20% { transform: translate(-3px, 0px) rotate(1deg); }
        30% { transform: translate(3px, 2px) rotate(0deg); }
        40% { transform: translate(1px, -1px) rotate(1deg); }
        50% { transform: translate(-1px, 2px) rotate(-1deg); }
        60% { transform: translate(-3px, 1px) rotate(0deg); }
        70% { transform: translate(3px, 1px) rotate(-1deg); }
        80% { transform: translate(-1px, -1px) rotate(1deg); }
        90% { transform: translate(1px, 2px) rotate(0deg); }
        100% { transform: translate(1px, -2px) rotate(-1deg); }
    }`;

  const style = document.createElement("style");
  if (document.getElementById("shakeStyle")) {
    document.getElementById("shakeStyle").remove();
  }
  style.id = "shakeStyle";
  document.head.appendChild(style);
  style.sheet.insertRule(css, 0);
  document.body.style.animation = "shake 0.5s";
  document.body.style.animationIterationCount = "1";
  document.body.addEventListener("animationend", () => {
    document.body.style.animation = "";
  });
})();
