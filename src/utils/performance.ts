/**
 * Debounce function to limit the rate of execution.
 * Ensures the function is called only after 'wait' milliseconds of inactivity.
 */
export const debounce = (func: Function, wait: number) => {
  let timeout: any;
  return function(this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

/**
 * Throttle function to ensure execution at most once every 'limit' milliseconds.
 */
export const throttle = (func: Function, limit: number) => {
  let lastFunc: any;
  let lastRan: number;
  return function(this: any, ...args: any[]) {
    if (!lastRan) {
      func.apply(this, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func.apply(this, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
};

/**
 * Efficiently observe DOM changes and run a callback when specific elements are added.
 */
export const createLazyObserver = (callback: () => void, targetNode: Node = document.body, debounceMs: number = 1000) => {
  const debouncedCallback = debounce(callback, debounceMs);
  const observer = new MutationObserver((mutations) => {
    let hasRelevantChanges = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasRelevantChanges = true;
        break;
      }
    }
    if (hasRelevantChanges) {
      debouncedCallback();
    }
  });

  observer.observe(targetNode, { childList: true, subtree: true });
  return observer;
};
