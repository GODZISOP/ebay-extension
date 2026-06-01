export const CONFIG = {
  amazon: {
    usa: { tag: import.meta.env.VITE_AMAZON_TAG_USA || "alex3210b-20" },
    uk: { tag: import.meta.env.VITE_AMAZON_TAG_UK || "deluxmerge212-21" },
    australia: { tag: import.meta.env.VITE_AMAZON_TAG_AU || "asds0d-22" }
  },
  aliexpress: {
    appKey: import.meta.env.VITE_ALIEXPRESS_APP_KEY || "533338",
    appSecret: import.meta.env.VITE_ALIEXPRESS_APP_SECRET || ""
  }
};
