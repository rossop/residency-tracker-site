// The app name and link live here only. Pages ship generic fallback text and a working relative link,
// and this fills in the name and the App Store URL once one exists.
const APP_NAME = "Residency Tracker";
const APP_URL = ""; // App Store URL when published; empty keeps each page's own link to the site home.

for (const el of document.querySelectorAll("[data-app-name]")) el.textContent = APP_NAME;
if (APP_URL) for (const a of document.querySelectorAll("a[data-app-link]")) a.href = APP_URL;
