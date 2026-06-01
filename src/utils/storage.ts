// Chrome Storage Wrapper (TS)
export const storage = {
  get: (key: string): Promise<any> => new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  }),
  
  set: (key: string, value: any): Promise<void> => new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  }),
  
  remove: (key: string): Promise<void> => new Promise((resolve) => {
    chrome.storage.local.remove(key, () => {
      resolve();
    });
  })
};
