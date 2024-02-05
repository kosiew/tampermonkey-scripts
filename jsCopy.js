javascript: (function () {
  const WAIT_MILISECONDS = 1000;
  const translateX = 200;

  function dlog(message) {
    console.log(message);
  }

  function flashBorder(elem) {
    elem.style.border = "1px solid blue";

    setTimeout(() => (elem.style.border = ""), WAIT_MILISECONDS);
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

  function copyItemsToClipboard(items) {
    const WAIT_MILISECONDS_BETWEEN_COPY = 1000;

    const loop = setInterval(() => {
      if (items.length > 0) {
        const item = items.shift();
        dlog("copying ".concat(item));
        copyToClipboard(item);
      } else {
        clearInterval(loop);
      }
    }, WAIT_MILISECONDS_BETWEEN_COPY);
  }

  function transform(transforms) {
    const b = document.body;
    const _transform = transforms.shift();
    b.style.transform = _transform;
  }

  function getTransforms() {
    const turns = 1;
    const result = [];
    for (let index = 0; index < 360 * turns + 1; index += 10) {
      const _transform = `skewY(${index}deg)`;
      result.push(_transform);
    }
    return result;
  }
  function opacity(transforms) {
    const b = document.body;
    const _transform = transforms.shift();
    b.style.opacity = _transform;
  }

  function getOpacities() {
    const result = [];

    for (let index = 1; index > 0; index -= 0.1) {
      result.push(index);
    }

    for (let index = 0; index < 1.1; index += 0.1) {
      result.push(index);
    }
    return result;
  }
  function getScales() {
    const result = [];

    for (let index = 1; index > 0; index -= 0.1) {
      const _transform = `scale(${index})`;
      result.push(_transform);
    }

    for (let index = 0; index < 1.1; index += 0.1) {
      const _transform = `scale(${index})`;
      result.push(_transform);
    }
    return result;
  }
  function animateBody(animationInterval = 25, animation = "transform") {
    const b = document.body;
    let transforms, func;

    switch (animation) {
      case "opacity":
        b.style.transition = `opacity ${animationInterval}ms`;
        transforms = getOpacities();
        func = opacity;
        break;
      case "transform":
        b.style.transition = `transform ${animationInterval}ms`;
        transforms = getTransforms();
        func = transform;
        break;
      case "scale":
        b.style.transition = `transform ${animationInterval}ms`;
        transforms = getScales();
        func = transform;
        break;
      default:
        break;
    }
    func(transforms);
    const loop = setInterval(() => {
      func(transforms);
      if (transforms.length == 0) {
        clearInterval(loop);
      }
    }, animationInterval);
  }

  function addClick(array) {
    for (const elem of array) {
      elem.addEventListener("click", () => {
        const items = [];
        const text = elem.innerText;
        const link = document.location.href;
        const phrases = [
          `the ${text} section at ${link}`,
          `Guided Customer to the ${text} section at ${link}`,
          `To learn more about this, I would like to share the "${text}" section at ${link} with you.`
        ];
        items.push(text);
        for (const phrase of phrases) {
          items.push(phrase);
        }
        items.push(link);
        flashBorder(elem);
        copyItemsToClipboard(items);
      });
    }
  }
  for (let i = 1; i <= 6; i++) {
    const tag = `h${i}`;
    dlog(tag);
    const headers = document.querySelectorAll(tag);

    addClick(headers);
  }

  const strong = document.querySelectorAll("strong");
  addClick(strong);

  copyToClipboard(location.href);
  setTimeout(animateBody, WAIT_MILISECONDS);
})();

// working
function transform(transforms) {
  const b = document.body;
  const _transform = transforms.shift();
  b.style.transform = _transform;
}

function getScales() {
  const result = [];

  for (let index = 1; index > 0; index -= 0.1) {
    const _transform = `scale(${index})`;
    result.push(_transform);
  }

  for (let index = 0; index < 1.1; index += 0.1) {
    const _transform = `scale(${index})`;
    result.push(_transform);
  }
  return result;
}
function animateBody(animationInterval = 25, animation = "transform") {
  const b = document.body;
  let transforms, func;

  switch (animation) {
    case "opacity":
      b.style.transition = `opacity ${animationInterval}ms`;
      transforms = getOpacities();
      func = opacity;
      break;
    case "transform":
      b.style.transition = `transform ${animationInterval}ms`;
      transforms = getTransforms();
      func = transform;
      break;
    case "scale":
      b.style.transition = `transform ${animationInterval}ms`;
      transforms = getScales();
      func = transform;
      break;
    default:
      break;
  }
  func(transforms);
  const loop = setInterval(() => {
    func(transforms);
    if (transforms.length == 0) {
      clearInterval(loop);
    }
  }, animationInterval);
}

function keep(keep) {}

elems.forEach();

elems.forEach(
  (curVal, index, array) => (curVal.style.border = "1px solid red")
);

selector = "li.notification-unread";
elems = document.querySelectorAll(selector);

keep = "bloom/web-client";
elemsArray = [...elems];

newElems = elemsArray.filter((elem) => {
  const repo = elem.querySelector(".d-flex p.m-0.f6.flex-auto");
  const repoText = repo.textContent.trim();
  if (repoText.startsWith(keep)) {
    return false;
  }
  return true;
});

newElems.forEach((curVal, index, array) => {
  const repo = curVal.querySelector(".d-flex p.m-0.f6.flex-auto");
  const repoText = repo.textContent.trim();
  if (!repoText.startsWith(keep)) {
    repo.style.border = "1px solid blue";
  }
  const button = curVal.querySelector('[title="Unsubscribe"]');
  button.style.border = "1px solid red";
  button.click();
});
