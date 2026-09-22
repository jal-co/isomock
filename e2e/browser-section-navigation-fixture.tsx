// Framework-only fixture: reuses the real panel with deliberately long labels.
import "../src/styles.css";
import { mountPanelScrollFixture } from "./browser-panel-scroll-fixture";

mountPanelScrollFixture({
  appId: "section-navigation",
  persist: false,
  side: "right",
  sectionTitles: [
    "Map motion",
    "Tab 4 points · Competitive Conquesting Customers",
    "Map life",
  ],
});
