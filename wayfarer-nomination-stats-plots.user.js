// ==UserScript==
// @name        Wayfarer Nomination Stats Plots (Dev)
// @version     0.4.2
// @description Wayfarer Stats Plot
// @homepageURL https://github.com/toadlover/wayfarer-addons/
// @match       https://wayfarer.scopely.com/*
// @match       https://wayfarer.nianticlabs.com/*
// @run-at      document-start
// @grant       none
// @updateURL   none
// ==/UserScript==

// Copyright 2024 tehstone, Tntnnbltn
// This file is part of the Wayfarer Addons collection.
// This file is made as a modification of the wayfarer-nomination-stats.user.js script to display figure-like plots in the web page to summarize nomination stats over time or by submission area.
// File made by user NonEMusDingo
// User experience substantially improved by TrungLatias

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository:
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */

(function () {
  "use strict";
  const PLUGIN_ID = "wfmm-nomination-stats-plots";
  const PLUGIN_NAME = "Profile Stats Plots";
  const PLUGIN_DESCRIPTION = "Responsive Profile dashboard: persistent filters, grouped area and timeline charts, OSM cache, dark mode and paired PNG exports. Requires Wayfarer Map Mods.";
  const PLUGIN_NAMESPACE = "https://github.com/toadlover/wayfarer-addons/";
  const VERSION = "0.9.6";
  let savedPlotState = null;

function createRuntime(WFMM) {
    let active = false;
    let nominations;
    let dataRevision = 0;
    let renderedRevision = -1;
    let observer = null;
    let controller = null;
    const cleanups = [];
    const timers = new Set();
    const frames = new Set();
    // Own all scheduled work so disabling the external plugin really stops it.
    function setTimeout(callback, delay, ...args) {
      if (!active) return 0;
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (active) callback(...args);
      }, delay);
      timers.add(id);
      return id;
    }
    function clearTimeout(id) { window.clearTimeout(id); timers.delete(id); }
    function requestAnimationFrame(callback) {
      if (!active) return 0;
      const id = window.requestAnimationFrame(time => {
        frames.delete(id);
        if (active) callback(time);
      });
      frames.add(id);
      return id;
    }
    function fetch(input, options = {}) {
      return window.fetch(input, { ...options, signal: controller.signal });
    }

    // Contstants and states
    const PLOT_STATUS_TYPES = [
      "ACCEPTED",
      "REJECTED",
      "DUPLICATE",
      "VOTING",
      "NOMINATED",
      "NIANTIC_REVIEW",
      "APPEALED",
      "WITHDRAWN",
      "HELD"
    ];

    const PLOT_TYPE_OPTIONS = [
      "NOMINATION",
      "PHOTO",
      "EDIT_TITLE",
      "EDIT_DESCRIPTION",
      "EDIT_LOCATION"
    ];

    const STATUS_DISPLAY = {
      ACCEPTED: "Accepted",
      REJECTED: "Rejected",
      DUPLICATE: "Duplicates",
      VOTING: "In Voting",
      NOMINATED: "In Queue",
      NIANTIC_REVIEW: "NIA Review",
      APPEALED: "Appealed",
      WITHDRAWN: "Withdrawn",
      HELD: "On Hold"
    };

    const TYPE_DISPLAY = {
      NOMINATION: "Nominations",
      PHOTO: "Photos",
      EDIT_TITLE: "Title Edits",
      EDIT_DESCRIPTION: "Description Edits",
      EDIT_LOCATION: "Location Edits"
    };

    const TYPE_TITLE_DISPLAY = {
      NOMINATION: "Nominations",
      PHOTO: "Photos",
      EDIT_TITLE: "Title",
      EDIT_DESCRIPTION: "Description",
      EDIT_LOCATION: "Location"
    };

    const CHART_SCOPE_ALL_SELECTED = "__ALL_SELECTED_TYPES__";

    const plotState = {
      selectedStatuses: new Set(["ACCEPTED"]),
      selectedTypes: new Set(PLOT_TYPE_OPTIONS),
      visibleChartScopes: null,
      _chartScopeOptionKeys: null,
      aggregationMode: "cityState", // or "state"
      maxBars: 20, // default number of bars to display in plot
      timelineAreaFilter: "__ALL__",
      timelineMode: "cumulative", // or "monthly"
      showDataLabels: false, // toggle data labels on graphs
      showAllSubmissions: false, // overlay total submissions line regardless of status filter
      showAllSubmissionsArea: false, // show blank remainder bar in area chart
      timelineViewMode: "auto", // Auto scrolls histories longer than two years.
      timelineRangeEnabled: false, // toggle date-range filter on/off
      timelineRangeStart: "",      // "YYYY-MM-DD"
      timelineRangeEnd: "",        // "YYYY-MM-DD"
      areaRangeEnabled: false,     // date-range filter for area chart only
      areaRangeStart: "",          // "YYYY-MM-DD"
      areaRangeEnd: "",            // "YYYY-MM-DD"
      typeStatusRangeEnabled: false, // date-range filter applied to BOTH charts (by type/status)
      typeStatusRangeStart: "",      // "YYYY-MM-DD"
      typeStatusRangeEnd: "",        // "YYYY-MM-DD"
      timelineAreaProvinceOnly: false, // filter Timeline Area dropdown to province/state level
      areaBarScale: "balanced",       // "balanced" (log) or "proportional" (linear)
      settingsTab: "type-status",
      settingsHidden: false,
      chartKind: "all",
      chartGroup: "all",
      theme: "auto"
    };

    loadPreferences();
    if (savedPlotState) {
      Object.assign(plotState, savedPlotState);
      plotState.selectedStatuses = new Set(savedPlotState.selectedStatuses);
      plotState.selectedTypes = new Set(savedPlotState.selectedTypes);
      plotState.visibleChartScopes = savedPlotState.visibleChartScopes && new Set(savedPlotState.visibleChartScopes);
      plotState._chartScopeOptionKeys = savedPlotState._chartScopeOptionKeys && new Set(savedPlotState._chartScopeOptionKeys);
    }

    // Profile dashboard shell. The original filters and statistical builders below
    // remain the source of chart data; this layer owns placement and rendering.
    let renderFrame = 0;
    let renderEpoch = 0;
    let preferencesTimer = 0;
    let groupObserver = null;
    let resizeObserver = null;
    let themeObserver = null;
    let mountCleanups = [];
    let groups = new Map();
    let groupQueue = new Set();
    let groupFrame = 0;
    let loadAttempted = false;
    let dataLoading = false;
    let loadError = false;
    let exporting = false;
    let mountedRoot = null;
    let placementRestores = [];
    let settingsMeasureFrame = 0;
    let hoverPopup = null;
    let hoverOwner = null;
    let hoverKey = "";
    let hoverPinned = false;
    const nominationDateCache = new WeakMap();
    const nominationAreaCache = new WeakMap();
    const preparedScopes = new Map();
    const scopeDateBounds = new Map();
    let scopeCacheEpoch = -1;

    function loadPreferences() {
      try {
        const saved = JSON.parse(localStorage.getItem("wfns_profile_preferences_v1") || "null");
        if (!saved || saved.version !== 1 || !saved.state || typeof saved.state !== "object") return;
        const value = saved.state;
        const enums = {
          aggregationMode: ["cityState", "state", "osm"], timelineMode: ["cumulative", "monthly"],
          timelineViewMode: ["auto", "responsive", "scrollable"], areaBarScale: ["balanced", "proportional"],
          settingsTab: ["type-status", "by-area", "chart"], chartKind: ["all", "area", "timeline"],
          chartGroup: ["all", CHART_SCOPE_ALL_SELECTED, ...PLOT_TYPE_OPTIONS], theme: ["auto", "light", "dark"]
        };
        for (const key of Object.keys(plotState)) {
          if (!(key in value)) continue;
          if (key === "selectedTypes" || key === "selectedStatuses") {
            const allowed = key === "selectedTypes" ? PLOT_TYPE_OPTIONS : PLOT_STATUS_TYPES;
            if (Array.isArray(value[key])) plotState[key] = new Set(value[key].filter(item => allowed.includes(item)));
          } else if (enums[key]) {
            if (enums[key].includes(value[key])) plotState[key] = value[key];
          } else if (key === "maxBars") {
            if ([20, 50, 100, 200, "all"].includes(value[key])) plotState[key] = value[key];
          } else if (typeof plotState[key] === "boolean" && typeof value[key] === "boolean") {
            plotState[key] = value[key];
          } else if (/Range(Start|End)$/.test(key)) {
            if (value[key] === "" || /^\d{4}-\d{2}-\d{2}$/.test(value[key])) plotState[key] = value[key];
          } else if (key === "timelineAreaFilter" && typeof value[key] === "string" && value[key].length < 500) {
            plotState[key] = value[key];
          }
        }
      } catch (_) { /* Corrupt or unavailable storage must not prevent startup. */ }
    }

    function savePreferences(immediate = false) {
      clearTimeout(preferencesTimer);
      const save = () => {
        preferencesTimer = 0;
        try {
          const state = { ...plotState, selectedTypes: [...plotState.selectedTypes], selectedStatuses: [...plotState.selectedStatuses] };
          delete state.visibleChartScopes;
          delete state._chartScopeOptionKeys;
          localStorage.setItem("wfns_profile_preferences_v1", JSON.stringify({ version: 1, state }));
        } catch (_) { /* Session controls still work with storage disabled. */ }
      };
      if (immediate) save(); else preferencesTimer = setTimeout(save, 160);
    }

    function findTierCard() {
      const page = document.querySelector('[data-testid="profile-page"]');
      if (!page) return null;
      let tier = page.querySelector('[aria-labelledby="wayfinder-tier-heading"], [aria-labelledby="wayfarer-tier-heading"]');
      if (tier) return tier;
      const heading = [...page.querySelectorAll('h1,h2,h3,h4')].find(node => /way(?:finder|farer)\s+tier/i.test(node.textContent));
      if (!heading) return null;
      for (let node = heading.parentElement; node && node !== page; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.tagName === "SECTION" || Number.parseFloat(style.borderRadius) > 0 || Number.parseFloat(style.borderTopWidth) > 0) return node;
      }
      return heading.parentElement;
    }

    function restoreProfilePlacement() {
      for (const restore of placementRestores.splice(0)) restore();
    }

    function placeProfilePanel() {
      const root = document.getElementById("wfns-plots-root");
      const page = document.querySelector('[data-testid="profile-page"]');
      if (!root || !page) return;
      const tier = findTierCard();
      if (!tier) {
        // Never let the dashboard expand to a full-width outer route shell.
        if (root.parentElement !== page) page.appendChild(root);
        root.style.maxWidth = "1120px";
        root.style.marginInline = "auto";
        return;
      }
      const tierBox = tier.getBoundingClientRect();
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const parent = tier.parentElement;
      const display = getComputedStyle(parent).display;
      if (desktop) {
        if (root.previousElementSibling !== tier) {
          restoreProfilePlacement();
          tier.after(root);
        }
        root.dataset.placement = "tier";
        root.style.width = "100%";
        root.style.maxWidth = tierBox.width > 0 ? Math.round(tierBox.width) + "px" : "100%";
        root.style.marginInline = "0";
        if (display === "grid") {
          const style = getComputedStyle(tier);
          const column = style.gridColumn === "auto / auto" || style.gridColumn === "auto" ? "1" : style.gridColumn;
          root.style.gridColumn = column;
          root.style.gridRow = "2";
          // A right-hand stats/upgrade column spans both left-hand rows, so it
          // cannot push the dashboard below the bottom of the Upgrades card.
          for (const sibling of parent.children) {
            if (sibling === tier || sibling === root || sibling.getBoundingClientRect().left < tierBox.right - 1) continue;
            if (sibling.dataset.wfnsSpansRows) continue;
            const previous = sibling.style.gridRow;
            sibling.dataset.wfnsSpansRows = "1";
            sibling.style.gridRow = "1 / span 2";
            placementRestores.push(() => { sibling.style.gridRow = previous; delete sibling.dataset.wfnsSpansRows; });
          }
        } else {
          root.style.gridColumn = ""; root.style.gridRow = "";
        }
      } else {
        restoreProfilePlacement();
        // Find the constrained wrapper containing both profile columns. Mount
        // after it, rather than inside the full-window profile-page container.
        const stats = page.querySelector('[aria-labelledby="profile-stats-heading"]');
        let layout = parent;
        if (stats) {
          while (layout !== page && !layout.contains(stats)) layout = layout.parentElement;
        }
        const anchor = layout !== page ? layout : null;
        if (anchor) { if (root.previousElementSibling !== anchor) anchor.after(root); }
        else if (root.parentElement !== page || root !== page.lastElementChild) page.appendChild(root);
        const width = anchor?.getBoundingClientRect().width || page.getBoundingClientRect().width;
        root.dataset.placement = "bottom";
        root.style.width = "100%";
        root.style.maxWidth = width > 0 ? Math.round(width) + "px" : "1120px";
        root.style.marginInline = "auto";
        root.style.gridColumn = ""; root.style.gridRow = "";
      }
    }

    function mountProfileUi(root) {
      mountedRoot = root;
      root.querySelector("#wfns-toggle-settings").addEventListener("click", () => {
        plotState.settingsHidden = !plotState.settingsHidden;
        hideStatusPopup();
        syncSettingsVisibility();
        savePreferences(true);
      });
      const tabs = root.querySelector(".wfns-settings-tabs");
      tabs.addEventListener("click", event => {
        const button = event.target.closest("[data-settings-tab]");
        if (!button) return;
        plotState.settingsTab = button.dataset.settingsTab;
        syncSettingTabs();
        root.querySelector(".wfns-settings-viewport").scrollTop = 0;
        savePreferences();
      });
      root.addEventListener("keydown", event => {
        const tab = event.target.closest('[role="tab"]');
        if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const items = [...tab.parentElement.querySelectorAll('[role="tab"]')];
        let index = items.indexOf(tab);
        index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
        event.preventDefault();
        items[index].click();
        items[index].focus({ preventScroll: true });
      });
      const theme = root.querySelector("#wfns-theme");
      theme.value = plotState.theme;
      theme.addEventListener("change", () => { plotState.theme = theme.value; syncProfileTheme(); savePreferences(); });
      const breakpoint = window.matchMedia("(min-width: 1024px)");
      const onBreakpoint = () => { placeProfilePanel(); renderPlots(); };
      let layoutFrame = 0;
      const onWindowResize = () => {
        if (layoutFrame) return;
        layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; onBreakpoint(); });
      };
      window.addEventListener("resize", onWindowResize, { passive: true });
      mountCleanups.push(() => window.removeEventListener("resize", onWindowResize));
      breakpoint.addEventListener?.("change", onBreakpoint);
      mountCleanups.push(() => breakpoint.removeEventListener?.("change", onBreakpoint));
      const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
      const onDarkMode = () => syncProfileTheme();
      darkMode.addEventListener?.("change", onDarkMode);
      mountCleanups.push(() => darkMode.removeEventListener?.("change", onDarkMode));
      themeObserver = new MutationObserver(onDarkMode);
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        themeObserver.observe(parent, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "style"] });
      }
      if (typeof ResizeObserver === "function") {
        let lastWidth = 0;
        resizeObserver = new ResizeObserver(entries => {
          const width = Math.round(entries[0]?.contentRect.width || 0);
          if (!width || Math.abs(width - lastWidth) < 2) return;
          lastWidth = width;
          stabilizeSettingsHeight();
          renderPlots();
        });
        resizeObserver.observe(root);
      }
      const gallery = root.querySelector("#wfns-chart-gallery");
      if (typeof IntersectionObserver === "function") {
        groupObserver = new IntersectionObserver(entries => {
          for (const entry of entries) {
            const record = groups.get(entry.target.dataset.scope);
            if (!record) continue;
            record.visible = entry.isIntersecting;
            if (record.visible) queueGroup(record);
            else {
              // Release offscreen SVG trees; keep fixed-height slots to retain scroll.
              for (const slot of record.slots) {
                disposeChartSlot(slot);
                slot.dataset.pending = slot.dataset.kind === "area" ? "By Area" : "Timeline";
              }
              record.epoch = -1;
            }
          }
        }, { root: null, rootMargin: "300px 0px", threshold: 0 });
      }
      const onPageHide = () => savePreferences(true);
      window.addEventListener("pagehide", onPageHide);
      mountCleanups.push(() => window.removeEventListener("pagehide", onPageHide));
      const onVisibility = () => { if (document.hidden) savePreferences(true); else renderPlots(); };
      document.addEventListener("visibilitychange", onVisibility);
      mountCleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
      syncSettingTabs();
      syncProfileTheme();
      updateDataSummary();
      const dismiss = () => hideStatusPopup();
      const dismissHover = () => { if (!hoverPinned) dismiss(); };
      const outsideClick = event => {
        if (hoverOwner?.contains(event.target) || hoverPopup?.contains(event.target)) return;
        dismiss();
      };
      document.addEventListener("click", outsideClick, true);
      mountCleanups.push(() => document.removeEventListener("click", outsideClick, true));
      const escape = event => { if (event.key === "Escape") dismiss(); };
      document.addEventListener("scroll", dismissHover, { capture: true, passive: true });
      window.addEventListener("blur", dismiss);
      document.addEventListener("keydown", escape);
      mountCleanups.push(() => document.removeEventListener("scroll", dismissHover, true), () => window.removeEventListener("blur", dismiss), () => document.removeEventListener("keydown", escape));
      document.fonts?.ready.then(() => { if (active && mountedRoot) stabilizeSettingsHeight(); });
    }

    function arrangeSettingsControls() {
      const controls = document.getElementById("wfns-plot-controls");
      if (!controls) return;
      const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      for (const block of controls.querySelectorAll(".wfns-control-block")) {
        block.dataset.control = slug(block.querySelector(".wfns-control-block-label")?.textContent || "");
      }
      const area = controls.querySelector('[data-settings-panel="by-area"] .wfns-settings-row');
      if (area) {
        const stack = document.createElement("div"); stack.className = "wfns-area-options-stack";
        for (const key of ["max-bars", "bar-height", "area-date-range"]) {
          const block = area.querySelector('[data-control="' + key + '"]');
          if (block) stack.appendChild(block);
        }
        const aggregate = area.querySelector('[data-control="aggregate-by"]');
        if (aggregate) aggregate.after(stack); else area.prepend(stack);
      }
    }

    function disposeChartSlot(slot) {
      for (const card of slot.querySelectorAll(".wfns-chart-card")) card._wfnsDispose?.();
      slot.replaceChildren();
    }

    function chartContext(scope) {
      if (!scope) return "";
      const types = scope.types.map(key => (TYPE_DISPLAY[key] || key).toLowerCase()).join(", ");
      const area = plotState.timelineAreaFilter;
      return area && area !== "__ALL__"
        ? area + (types ? ", with " + types : "")
        : "Showing with " + (types || "no selected types");
    }

    function stabilizeSettingsHeight() {
      // All panels share one intrinsic grid row. Hidden panels still determine
      // its height, including their date controls, so no measured height can
      // become stale when fonts or responsive columns change.
      const controls = document.getElementById("wfns-plot-controls");
      if (!controls) return;
      controls.classList.remove("wfns-measuring-settings");
      controls.closest(".wfns-settings-viewport")?.style.removeProperty("--wfns-settings-height");
    }

    function reserveTimelineReadout(readout) {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      context.font = getComputedStyle(readout).font || "13px Arial, sans-serif";
      const maxWidth = Math.max(120, readout.clientWidth - 24);
      const worst = "2026-12-31 · " + PLOT_STATUS_TYPES.map(key =>
        (STATUS_DISPLAY[key] || key) + ": " + (nominations?.length || 0).toLocaleString()).join(" · ");
      let lines = 1, line = "";
      for (const word of worst.split(/\s+/)) {
        const next = line ? line + " " + word : word;
        if (line && context.measureText(next).width > maxWidth) { lines++; line = word; } else line = next;
      }
      readout.style.minHeight = Math.max(88, Math.ceil(lines * 22.1) + 24) + "px";
    }

    function hideStatusPopup(owner = null) {
      if (owner && hoverOwner !== owner) return;
      if (hoverPopup) hoverPopup.hidden = true;
      hoverOwner = null; hoverKey = ""; hoverPinned = false;
    }

    function bindStatusPopupInteraction(svg, inspectAt) {
      // Native click follows a completed tap, unlike pointerdown/pointerup while
      // the user is swiping. Leave pan and pinch gestures to the browser.
      svg.addEventListener("pointermove", event => {
        if (event.pointerType === "touch" || hoverPinned) return;
        inspectAt(event, false);
      }, { passive: true });
      svg.addEventListener("click", event => inspectAt(event, true));
      svg.addEventListener("pointerleave", () => {
        if (!hoverPinned) hideStatusPopup(svg);
      });
    }

    function showStatusPopup(owner, event, detail, pin = false) {
      if (!active || !owner.isConnected || (!pin && (hoverPinned || event.pointerType === "touch"))) return;
      hoverPinned = pin;
      if (!hoverPopup) {
        hoverPopup = document.createElement("div");
        hoverPopup.id = "wfns-chart-tooltip"; hoverPopup.setAttribute("role", "tooltip");
        // A body-level overlay stays outside chart overflow and never captures a
        // wheel event or pointer, on either light or dark profile themes.
        hoverPopup.style.cssText = "position:fixed;z-index:2147483000;pointer-events:none;padding:11px 13px;border:1px solid;border-radius:10px;box-shadow:0 5px 24px #0003;font:12px/1.65 system-ui,Arial,sans-serif;max-width:min(300px,calc(100vw - 16px));box-sizing:border-box;";
        document.body.appendChild(hoverPopup);
      }
      const key = detail.key;
      if (hoverOwner !== owner || hoverKey !== key) {
        hoverOwner = owner; hoverKey = key;
        hoverPopup.replaceChildren();
        const heading = document.createElement("div"); heading.textContent = detail.title; heading.style.cssText = "font-weight:600;margin-bottom:5px;overflow-wrap:anywhere;";
        hoverPopup.appendChild(heading);
        for (const status of PLOT_STATUS_TYPES) {
          const row = document.createElement("div"); row.dataset.status = status; row.style.cssText = "display:flex;align-items:center;gap:7px;white-space:nowrap;";
          const dot = document.createElement("span"); dot.style.cssText = "width:9px;height:9px;flex:none;border-radius:2px;"; dot.style.background = STATUS_COLORS[status];
          const value = document.createElement("span"); value.textContent = (STATUS_DISPLAY[status] || status) + ": " + (detail.counts[status] || 0).toLocaleString();
          row.append(dot, value); hoverPopup.appendChild(row);
        }
        hoverPopup.style.background = themeColor("--wfns-bg-card", "#fff");
        hoverPopup.style.color = themeColor("--wfns-text", "#131d2b");
        hoverPopup.style.borderColor = themeColor("--wfns-border", "#ddd");
      }
      hoverPopup.hidden = false;
      // A pinned popup can be tapped without activating a chart beneath it.
      hoverPopup.style.pointerEvents = pin ? "auto" : "none";
      const width = hoverPopup.offsetWidth, height = hoverPopup.offsetHeight;
      let x = event.clientX + 16, y = event.clientY + 16;
      if (pin && event.clientY - height - 12 >= 8) y = event.clientY - height - 12;
      if (x + width > innerWidth - 8) x = event.clientX - width - 16;
      if (y + height > innerHeight - 8) y = event.clientY - height - 12;
      hoverPopup.style.left = Math.max(8, Math.min(x, innerWidth - width - 8)) + "px";
      hoverPopup.style.top = Math.max(8, Math.min(y, innerHeight - height - 8)) + "px";
    }

    function resetScopeCache() {
      if (scopeCacheEpoch === renderEpoch) return;
      preparedScopes.clear(); scopeDateBounds.clear(); scopeCacheEpoch = renderEpoch;
    }

    function timelineHasData(data) {
      return data.series.some(series => series.values.some(value => value.count > 0)) ||
        !!data.allSeries?.values.some(value => value.count > 0);
    }

    function prepareScopeData(scope) {
      resetScopeCache();
      const key = scope.key + ":" + scope.types.join(",");
      if (preparedScopes.has(key)) return preparedScopes.get(key);
      const areaRows = getTopAreas(buildStackedAreaData(nominations || [], scope), plotState.maxBars);
      const timelineData = buildTimelineLineData(nominations || [], scope);
      const hasArea = areaRows.some(row => row.total > 0 || plotState.showAllSubmissionsArea && row.areaTotal > 0);
      const hasTimeline = timelineHasData(timelineData);
      const hasVisibleData = plotState.chartKind === "area" ? hasArea : plotState.chartKind === "timeline" ? hasTimeline : hasArea || hasTimeline;
      const result = { areaRows, timelineData, hasArea, hasTimeline, hasVisibleData };
      preparedScopes.set(key, result);
      return result;
    }

    function chartDateRange(kind, scope) {
      const ranges = [];
      const add = (enabled, start, end) => {
        if (enabled && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) &&
          !isNaN(parseDay(start)) && !isNaN(parseDay(end)) && start <= end) ranges.push([start, end]);
      };
      add(plotState.typeStatusRangeEnabled, plotState.typeStatusRangeStart, plotState.typeStatusRangeEnd);
      if (kind === "area") add(plotState.areaRangeEnabled, plotState.areaRangeStart, plotState.areaRangeEnd);
      else add(plotState.timelineRangeEnabled, plotState.timelineRangeStart, plotState.timelineRangeEnd);
      if (ranges.length) {
        const first = ranges.reduce((value, range) => value > range[0] ? value : range[0], "");
        const last = ranges.reduce((value, range) => value < range[1] ? value : range[1], "9999-12-31");
        return first <= last ? first + " → " + last : "No matching dates";
      }
      resetScopeCache();
      const key = scope.key + ":" + scope.types.join(",");
      if (!scopeDateBounds.has(key)) {
        let first = "", last = "";
        for (const nomination of nominations || []) {
          if (!nomination || !nominationMatchesChartScope(nomination, scope) ||
            !matchesAreaFilter(getAreaLabelCached(nomination, plotState.aggregationMode))) continue;
          const day = getDayKey(nomination);
          if (day === "Unknown") continue;
          if (!first || day < first) first = day;
          if (!last || day > last) last = day;
        }
        scopeDateBounds.set(key, first ? first + " → " + last : "No dates");
      }
      return scopeDateBounds.get(key);
    }

    function syncSettingsVisibility() {
      const root = document.getElementById("wfns-plots-root");
      if (!root) return;
      const hidden = plotState.settingsHidden;
      root.querySelector("#wfns-settings-region").hidden = hidden;
      const button = root.querySelector("#wfns-toggle-settings");
      button.textContent = hidden ? "Show settings" : "Hide settings";
      button.setAttribute("aria-expanded", String(!hidden));
      if (!hidden) stabilizeSettingsHeight();
    }

    function syncSettingTabs() {
      syncSettingsVisibility();
      const root = document.getElementById("wfns-plots-root");
      if (!root) return;
      root.querySelectorAll("[data-settings-tab]").forEach(button => {
        const selected = button.dataset.settingsTab === plotState.settingsTab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      root.querySelectorAll("[data-settings-panel]").forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== plotState.settingsTab; });
    }

    function syncProfileTheme() {
      const root = document.getElementById("wfns-plots-root");
      if (!root) return;
      let theme = plotState.theme;
      if (theme === "auto") {
        theme = "light";
        for (let parent = root.parentElement; parent; parent = parent.parentElement) {
          if (parent.matches('.dark, [data-theme="dark"], [data-mode="dark"]')) { theme = "dark"; break; }
          const style = getComputedStyle(parent);
          const rgb = style.backgroundColor.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/);
          if (rgb && (rgb[4] === undefined || Number(rgb[4]) > 0.8)) {
            theme = (+rgb[1] * 0.2126 + +rgb[2] * 0.7152 + +rgb[3] * 0.0722) < 100 ? "dark" : "light";
            break;
          }
        }
      }
      if (root.dataset.theme !== theme) { root.dataset.theme = theme; renderPlots(); }
    }

    function updateDataSummary() {
      const status = document.getElementById("wfns-export-status");
      if (!status) return;
      if (dataLoading) status.textContent = "Loading contributions…";
      else if (loadError) status.textContent = "Contributions could not load. Reopen Profile to retry.";
      else if (status.textContent === "Loading contributions…") status.textContent = "";
    }

    function ensureContributionData() {
      if (loadAttempted || nominations?.length || !WFMM.contributions?.load) return;
      loadAttempted = true;
      dataLoading = true;
      updateDataSummary();
      Promise.resolve().then(() => WFMM.contributions.load({ reason: "nomination-stats-profile" }))
        .then(() => { if (active) updateFromMapMods(); })
        .catch(error => { if (active) { loadError = true; console.warn("[WFNS Plots] Contribution loading failed", error); } })
        .finally(() => { if (active) { dataLoading = false; updateDataSummary(); } });
    }

    function refreshAreaOptions() {
      const select = document.getElementById("wfns-timeline-area");
      if (!select) return;
      const current = plotState.timelineAreaFilter;
      const fragment = document.createDocumentFragment();
      const all = document.createElement("option"); all.value = "__ALL__"; all.textContent = "All areas"; fragment.append(all);
      for (const area of getAvailableAreas(nominations || [])) {
        const option = document.createElement("option"); option.value = area; option.textContent = area; fragment.append(option);
      }
      select.replaceChildren(fragment);
      select.value = current;
      if (!select.value) { select.value = "__ALL__"; plotState.timelineAreaFilter = "__ALL__"; }
    }

    function renderChartPicker() {
      const root = document.getElementById("wfns-plots-root");
      if (!root) return;
      const definitions = [
        ["wfns-kind-tabs", "chartKind", [["all", "All"], ["area", "By Area"], ["timeline", "By Timeline"]]],
        ["wfns-group-tabs", "chartGroup", [["all", "All"], ...getChartScopeOptions().map(scope => [scope.key, scope.label])]]
      ];
      for (const [id, key, options] of definitions) {
        const host = root.querySelector("#" + id);
        if (!host.children.length) {
          options.forEach(([value, label]) => {
            const button = document.createElement("button"); button.type = "button"; button.textContent = label;
            button.dataset.value = value; button.setAttribute("role", "tab"); button.setAttribute("aria-controls", "wfns-chart-gallery");
            button.addEventListener("click", () => {
              plotState[key] = value;
              renderPlots();
            });
            host.appendChild(button);
          });
        }
        for (const button of host.children) {
          const selected = button.dataset.value === plotState[key];
          button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
        }
      }
    }

    function reconcileChartGroups() {
      if (!active || !isNominationsRoute() || document.hidden) return;
      const gallery = document.getElementById("wfns-chart-gallery");
      if (!gallery) return;
      renderChartPicker(); updateDataSummary();
      const osmBar = document.getElementById("wfns-osm-bar");
      if (osmBar) osmBar.hidden = plotState.aggregationMode !== "osm";
      const scopes = getVisibleChartScopes();
      const keys = new Set(scopes.map(scope => scope.key));
      for (const [key, record] of groups) {
        if (!keys.has(key)) {
          groupObserver?.unobserve(record.node);
          for (const slot of record.slots) disposeChartSlot(slot);
          record.node.remove(); groups.delete(key); groupQueue.delete(record);
        }
      }
      let empty = gallery.querySelector(".wfns-no-chart-data");
      if (!scopes.length) {
        if (!empty) { empty = document.createElement("p"); empty.className = "wfns-no-chart-data"; empty.setAttribute("role", "status"); gallery.appendChild(empty); }
        empty.textContent = "No data matches the selected types, area, statuses and dates.";
      } else empty?.remove();
      scopes.forEach((scope, index) => {
        let record = groups.get(scope.key);
        if (!record) {
          const node = document.createElement("article"); node.className = "wfns-chart-group"; node.dataset.scope = scope.key;
          const head = document.createElement("div"); head.className = "wfns-group-head";
          const title = document.createElement("h3"); title.textContent = scope.label;
          const button = document.createElement("button"); button.type = "button"; button.className = "wfns-export-pair"; button.textContent = "Save pair · PNG";
          button.title = "Save Area and Timeline together in one PNG";
          const noData = document.createElement("p"); noData.className = "wfns-group-empty"; noData.textContent = "No data for the selected area, statuses and date range."; noData.hidden = true; noData.setAttribute("role", "status");
          const pair = document.createElement("div"); pair.className = "wfns-chart-pair";
          const slots = ["area", "timeline"].map(kind => {
            const slot = document.createElement("div"); slot.className = "wfns-chart-slot"; slot.dataset.kind = kind;
            slot.dataset.pending = kind === "area" ? "Areas Chart" : "Timeline Chart"; pair.appendChild(slot); return slot;
          });
          head.append(title, button); node.append(head, noData, pair);
          record = { node, slots, scope, empty: noData, button, epoch: -1, visible: !groupObserver && index === 0 };
          button.addEventListener("click", async () => {
            button.disabled = true;
            try { await exportGroupPair(record); } finally { if (button.isConnected) button.disabled = !prepareScopeData(record.scope).hasVisibleData; }
          });
          groups.set(scope.key, record); gallery.appendChild(node);
          groupObserver?.observe(node);
        }
        record.scope = scope;
        const data = prepareScopeData(scope);
        record.areaRows = data.areaRows; record.timelineData = data.timelineData; record.preparedEpoch = renderEpoch;
        record.empty.hidden = data.hasVisibleData; record.button.disabled = !data.hasVisibleData;
        record.slots[0].style.minHeight = data.hasArea ? "424px" : "0px";
        record.slots[1].style.minHeight = data.hasTimeline ? "438px" : "0px";
        for (const slot of record.slots) slot.hidden = !data.hasVisibleData || plotState.chartKind !== "all" && slot.dataset.kind !== plotState.chartKind;
        if (record.visible) queueGroup(record);
      });
      if (!groupObserver && !gallery.dataset.fallbackScroll) {
        gallery.dataset.fallbackScroll = "1";
        const onScroll = () => {
          for (const record of groups.values()) {
            const box = record.node.getBoundingClientRect();
            record.visible = box.bottom >= -300 && box.top <= window.innerHeight + 300;
            if (record.visible) queueGroup(record);
            else { for (const slot of record.slots) disposeChartSlot(slot); record.epoch = -1; }
          }
        };
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        mountCleanups.push(() => document.removeEventListener("scroll", onScroll, true));
      }
      if (plotState.aggregationMode === "osm") osmStartPrewarm(nominations || []);
    }

    function queueGroup(record) {
      if (!active || record.epoch === renderEpoch || !record.node.isConnected) return;
      groupQueue.add(record);
      if (groupFrame) return;
      groupFrame = requestAnimationFrame(() => {
        groupFrame = 0;
        const next = groupQueue.values().next().value;
        if (!next) return;
        groupQueue.delete(next);
        if (next.visible && next.node.isConnected && isNominationsRoute()) renderGroup(next);
        if (groupQueue.size) queueGroup([...groupQueue][0]);
      });
    }

    function renderGroup(record, both = false) {
      if (!active || !record.node.isConnected) return;
      const data = prepareScopeData(record.scope);
      record.areaRows = data.areaRows; record.timelineData = data.timelineData;
      record.preparedEpoch = renderEpoch;
      const [area, timeline] = record.slots;
      if (!data.hasVisibleData && !both) {
        disposeChartSlot(area); disposeChartSlot(timeline);
      } else {
        if (both || !area.hidden) {
          renderVerticalStackedBarChart(data.areaRows, record.scope, false, area); delete area.dataset.pending;
        } else disposeChartSlot(area);
        if (both || !timeline.hidden) {
          renderTimelineChart(data.timelineData, record.scope, false, timeline); delete timeline.dataset.pending;
        } else disposeChartSlot(timeline);
      }
      record.epoch = record.preparedEpoch;
    }

    async function exportGroupPair(record) {
      if (exporting) return;
      renderGroup(record, true);
      const area = record.slots[0].querySelector(".wfns-chart-card");
      const timeline = record.slots[1].querySelector(".wfns-chart-card");
      const areaWidth = Number(area?.querySelector("svg")?.getAttribute("width")) || 800;
      const ticks = timeline?._wfnsTimelineTicks || 1;
      const width = Math.min(2400, Math.max(1200, areaWidth, ticks * 16 + 130));
      const columns = Math.max(1, Math.floor((width - 20 + 12) / (area?._wfnsColumnWidth || 84)));
      const rows = Math.max(1, Math.ceil((area?._wfnsAreaColumns || 1) / columns));
      const areaHeight = rows * ((area?._wfnsExportRowHeight || 322) + 16) - 16;
      // Match plot widths and, for typical selections, plot heights. Extremely
      // large Area exports stay complete without making Timeline needlessly tall.
      const timelineHeight = Math.max(322, Math.min(1200, areaHeight));
      const temp = document.createElement("div");
      temp.style.cssText = `position:fixed;left:-100000px;top:0;width:${width + 26}px;pointer-events:none;`;
      temp.setAttribute("aria-hidden", "true"); record.node.appendChild(temp);
      try {
        renderTimelineChart(buildTimelineLineData(nominations || [], record.scope), record.scope, false, temp, { width, height: timelineHeight - 30 });
        await exportCharts([area, temp.querySelector(".wfns-chart-card")], record.scope, "area-and-timeline", { width });
      } finally {
        temp.remove();
        if (active && record.node.isConnected) renderGroup(record);
      }
    }

    async function exportCharts(cards, scope, suffix, options = {}) {
      if (exporting || !active) return;
      const status = document.getElementById("wfns-export-status");
      exporting = true; if (status) status.textContent = "Preparing PNG…";
      let canvas = null;
      const date = new Date();
      const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const selectedStatuses = [...plotState.selectedStatuses];
      const colors = { ...STATUS_COLORS };
      const areaContext = chartContext(scope);
      try {
        const items = cards.filter(Boolean).map(card => {
          const svg = card.querySelector("svg");
          const width = Number(svg?.getAttribute("width")) || 800;
          const height = card._wfnsExportRowHeight || Number(svg?.getAttribute("height")) || 322;
          return { card, svg, width, height, title: card.querySelector(".wfns-chart-title")?.textContent || "Chart", dateRange: card.querySelector(".wfns-chart-date")?.textContent || "" };
        });
        if (!items.length) throw new Error("No charts are ready to export.");
        const plotWidth = options.width || Math.min(2400, Math.max(1200, ...items.map(item => item.width)));
        const padding = 28, width = plotWidth + padding * 2;
        canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("PNG export is unavailable in this browser.");
        const wrap = (text, maxWidth, font) => {
          ctx.font = font;
          const lines = []; let line = "";
          for (const word of String(text).split(/\s+/)) {
            const next = line ? line + " " + word : word;
            if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
          }
          if (line) lines.push(line);
          return lines;
        };
        const titleLines = wrap("Submission Insight - " + scope.label, plotWidth, "600 24px Arial, sans-serif");
        const headerHeight = titleLines.length * 31 + 55;
        const legendRows = []; let legendRow = [], usedWidth = 0;
        ctx.font = "13px Arial, sans-serif";
        for (const key of selectedStatuses) {
          const label = STATUS_DISPLAY[key] || key;
          const size = ctx.measureText(label).width + 39;
          if (legendRow.length && usedWidth + size > plotWidth) { legendRows.push(legendRow); legendRow = []; usedWidth = 0; }
          legendRow.push({ key, label, x: usedWidth }); usedWidth += size;
        }
        if (legendRow.length) legendRows.push(legendRow);
        const legendHeight = Math.max(1, legendRows.length) * 22;
        const contextLines = areaContext ? wrap(areaContext, plotWidth, "14px Arial, sans-serif") : [];
        for (const item of items) {
          item.columns = Math.max(1, Math.floor((plotWidth - 20 + 12) / (item.card._wfnsColumnWidth || 84)));
          item.rows = item.card._wfnsAreaColumns ? Math.ceil(item.card._wfnsAreaColumns / item.columns) : 1;
          item.drawHeight = item.card._wfnsAreaColumns ? item.rows * (item.height + 16) - 16 : item.height * Math.min(1, plotWidth / item.width);
          item.headerHeight = 34 + contextLines.length * 21;
        }
        const height = padding + headerHeight + items.reduce((sum, item) => sum + item.headerHeight + item.drawHeight + legendHeight + 44, 0);
        const scale = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(6000000 / (width * height)));
        canvas.width = Math.max(1, Math.floor(width * scale)); canvas.height = Math.max(1, Math.floor(height * scale));
        ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
        ctx.fillStyle = themeColor("--wfns-svg-bg", "#fff"); ctx.fillRect(0, 0, width, height);
        const textColor = themeColor("--wfns-text", "#131d2b");
        const muted = themeColor("--wfns-text-muted", "#667085");
        let y = padding + 25;
        ctx.fillStyle = textColor; ctx.font = "600 24px Arial, sans-serif";
        for (const line of titleLines) { ctx.fillText(line, padding, y); y += 31; }
        ctx.font = "15px Arial, sans-serif"; ctx.fillText("Date: " + dateText, padding, y); y += 44;
        for (const item of items) {
          if (!active) return;
          ctx.fillStyle = textColor; ctx.font = "600 17px Arial, sans-serif"; ctx.fillText(item.title, padding, y);
          if (item.dateRange) {
            ctx.fillStyle = muted; ctx.font = "13px Arial, sans-serif";
            ctx.fillText(item.dateRange, width - padding - ctx.measureText(item.dateRange).width, y);
          }
          y += 25;
          ctx.fillStyle = muted; ctx.font = "14px Arial, sans-serif";
          for (const line of contextLines) { ctx.fillText(line, padding, y); y += 21; }
          y += 9;
          if (item.svg) {
            const tiles = item.card._wfnsExportTiles ? item.card._wfnsExportTiles(item.columns) : [{ svg: item.svg.cloneNode(true), width: item.width, height: item.height }];
            let row = 0;
            for (const tile of tiles) {
              if (!active) return;
              tile.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
              const data = new XMLSerializer().serializeToString(tile.svg);
              const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
              try {
                const image = new Image();
                await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Could not render chart SVG.")); image.src = url; });
                const factor = Math.min(1, plotWidth / tile.width);
                const x = padding + Math.max(0, (plotWidth - tile.width * factor) / 2);
                ctx.drawImage(image, x, y + row * (tile.height + 16), tile.width * factor, tile.height * factor);
                image.src = ""; row++;
              } finally { URL.revokeObjectURL(url); }
            }
          } else { ctx.fillStyle = muted; ctx.font = "14px Arial, sans-serif"; ctx.fillText("No submissions match the current filters.", padding, y + 35); }
          y += item.drawHeight + 21;
          for (const row of legendRows) {
            for (const item of row) {
              ctx.fillStyle = colors[item.key] || "#888"; ctx.fillRect(padding + item.x, y - 10, 11, 11);
              ctx.fillStyle = textColor; ctx.font = "13px Arial, sans-serif"; ctx.fillText(item.label, padding + item.x + 18, y);
            }
            y += 22;
          }
          y += 23;
        }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("The browser could not create a PNG.");
        const url = URL.createObjectURL(blob);
        try {
          const link = document.createElement("a"); link.href = url;
          const type = scope.label.replace(/[<>:"/\\|?*]/g, "-");
          link.download = `Submission Insight - ${type} - ${dateText}${suffix === "area-and-timeline" ? "" : " - " + suffix}.png`;
          link.click();
        } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
        if (status) status.textContent = "PNG saved.";
      } catch (error) {
        if (status) status.textContent = "PNG export failed: " + error.message;
        console.warn("[WFNS Plots] PNG export failed", error);
      } finally { if (canvas) { canvas.width = 0; canvas.height = 0; } exporting = false; }
    }

    function unmountProfile() {
      if (!mountedRoot) return;
      groupObserver?.disconnect(); groupObserver = null;
      resizeObserver?.disconnect(); resizeObserver = null;
      themeObserver?.disconnect(); themeObserver = null;
      for (const cleanup of mountCleanups.splice(0)) cleanup();
      for (const record of groups.values()) for (const slot of record.slots) disposeChartSlot(slot);
      restoreProfilePlacement();
      hideStatusPopup(); hoverPopup?.remove(); hoverPopup = null;
      preparedScopes.clear(); scopeDateBounds.clear(); scopeCacheEpoch = -1;
      groups.clear(); groupQueue.clear();
      mountedRoot.remove(); mountedRoot = null;
      loadAttempted = false;
    }

    // ─── Collapsed/expanded state of the control sections ─────────────────────
    // plotState alone only survives a re-render; this carries it across a reload.
    const SECTION_STATE_KEY = "wfns_sections_v1";
    const STATUS_COLOR_KEY = "wfns_status_colors_v1";
    const BAR_SCALE_KEY = "wfns_bar_scale_v1";
    /**
     * Resolve one of the panel's CSS tokens to a real colour.
     *
     * The charts draw into SVG, and a var() in an SVG presentation attribute is
     * not reliably picked up by html2canvas when exporting a PNG. Reading the
     * computed value here keeps the export identical to what is on screen, and
     * still means the Theme control drives every colour from one place.
     */
    function themeColor(name, fallback) {
      const root = document.getElementById("wfns-plots-root");
      if (!root) return fallback;
      try {
        const value = getComputedStyle(root).getPropertyValue(name).trim();
        return value || fallback;
      } catch (e) {
        return fallback;
      }
    }

    try {
      const savedBarScale = localStorage.getItem(BAR_SCALE_KEY);
      if (savedBarScale === "balanced" || savedBarScale === "proportional") {
        plotState.areaBarScale = savedBarScale;
      }
    } catch (e) { /* private mode - session default is fine */ }

    /**
     * How tall an area bar is drawn, as a fraction of full height.
     *
     * Straight proportion is unreadable once one area dominates: with a 2778-bar
     * on the chart, an area with 12 submissions is 1px tall. This spaces the bars
     * on a log curve instead, so every area stays visible and the ordering is
     * still obvious.
     *
     *   scale = floor + (1 - floor) * t^2.5,  t = log(count) / log(maxCount)
     *
     * The floor opens up as the data grows - with a handful of submissions the
     * bars stay close together, and only once there is a real spread does the
     * chart use its full height. It is one continuous function of both count and
     * maxCount, so nothing jumps as the numbers cross 10, 100 or 1000.
     *
     * The trade-off: heights are no longer proportional, so read the number
     * printed above each bar rather than comparing heights by eye. "Proportional"
     * in the Bar Height control restores the straight linear mapping.
     */
    const BAR_SCALE_MIN = 0.30;   // shortest a non-empty bar is drawn
    const BAR_SCALE_GAMMA = 2.5;  // curve shape; fitted to feel evenly spaced

    /**
     * Split a bar's pixel height between its segments, in whole pixels.
     *
     * Segment heights used to be raw floats - 5.21739px starting at y=948.02 -
     * so the browser antialiased every band across its boundary row. Each bar had
     * a different fractional offset, so the same status stripe came out crisp in
     * one bar and smeared half a pixel in the next, which reads as bars being
     * shifted or the wrong length.
     *
     * Floor everything, then hand out the leftover pixels by largest remainder so
     * the parts still add up to the whole. A status with submissions is never
     * allowed to round away to nothing.
     */
    const SVG_LABEL_FONT = "11px Roboto, Arial, sans-serif";
    let labelMeasureCtx = null;

    function measureLabelWidth(text) {
      if (!labelMeasureCtx) labelMeasureCtx = document.createElement("canvas").getContext("2d");
      labelMeasureCtx.font = SVG_LABEL_FONT;
      return labelMeasureCtx.measureText(text).width;
    }

    /** SVG text does not wrap, so break an area name into lines that fit a column. */
    function wrapSvgLabel(text, maxWidth, maxLines) {
      const words = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";

      words.forEach(word => {
        const candidate = line ? line + " " + word : word;
        if (measureLabelWidth(candidate) <= maxWidth) { line = candidate; return; }
        if (line) { lines.push(line); line = ""; }
        if (measureLabelWidth(word) <= maxWidth) { line = word; return; }
        // A single word wider than the column has to be broken mid-word.
        let chunk = "";
        for (const ch of word) {
          if (chunk && measureLabelWidth(chunk + ch) > maxWidth) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      });
      if (line) lines.push(line);

      if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        let last = kept[maxLines - 1];
        while (last.length > 1 && measureLabelWidth(last + "\u2026") > maxWidth) {
          last = last.slice(0, -1);
        }
        kept[maxLines - 1] = last + "\u2026";
        return kept;
      }
      return lines;
    }

    function allocatePixels(weights, totalPx) {
      const out = weights.map(() => 0);
      const sum = weights.reduce((a, b) => a + b, 0);
      if (!(sum > 0) || !(totalPx > 0)) return out;

      const remainders = [];
      let used = 0;
      weights.forEach((w, i) => {
        const exact = (w / sum) * totalPx;
        out[i] = Math.floor(exact);
        used += out[i];
        remainders.push({ frac: exact - out[i], i });
      });

      remainders.sort((a, b) => b.frac - a.frac);
      for (let k = 0; k < totalPx - used; k++) out[remainders[k % remainders.length].i]++;

      // A status that exists should stay visible; borrow from the tallest band.
      for (let i = 0; i < out.length; i++) {
        if (weights[i] > 0 && out[i] === 0) {
          let big = 0;
          for (let j = 1; j < out.length; j++) if (out[j] > out[big]) big = j;
          if (out[big] > 1) { out[big]--; out[i] = 1; }
        }
      }
      return out;
    }

    function areaBarScale(count, maxCount) {
      if (!(count > 0)) return 0;
      if (!(maxCount > 1)) return 1;

      // Narrow data (max under ~15) keeps a higher floor, so 3-vs-8 does not get
      // dramatised into a tall-vs-tiny pair.
      const floor = Math.max(BAR_SCALE_MIN, Math.min(1, 1 - 0.05 * (maxCount - 1)));
      const t = Math.min(1, Math.max(0, Math.log(count) / Math.log(maxCount)));
      return floor + (1 - floor) * Math.pow(t, BAR_SCALE_GAMMA);
    }

    function loadSectionState() {
      try {
        const parsed = JSON.parse(localStorage.getItem(SECTION_STATE_KEY) || "null");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    function saveSectionState() {
      try {
        localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(sectionState));
      } catch (e) {
        /* private mode or full storage - collapsing still works for this session */
      }
    }

    const sectionState = loadSectionState();

    // ─── OSM Reverse-Geocoding Cache & Queue ──────────────────────────────────
    const OSM_CACHE_KEY = "wfns_osm_geocache_v1";
    const osmQueuedKeys = new Set();
    const osmFailedUntil = new Map();
    let osmGeneration = 0;
    let osmInFlight = false;
    let osmNextRequestAt = 0;
    let osmDrainTimer = 0;
    let osmQueue        = [];
    let osmQueueBusy    = false;
    let osmPendingCount = 0;
    let osmDoneCount    = 0;

    // In-memory mirror of the geocode cache. Bumped whenever it changes, so
    // derived label caches know to drop what they memoised.
    let osmCacheMap = null;
    let osmCacheVersion = 0;

    function osmCacheLoad() {
      if (!osmCacheMap) {
        try { osmCacheMap = cleanOsmCache(JSON.parse(localStorage.getItem(OSM_CACHE_KEY) || "{}")); }
        catch (_) { osmCacheMap = new Map(); }
      }
      return osmCacheMap;
    }

    /** Drop the in-memory copy, e.g. after an import or a clear. */
    function osmCacheInvalidate() {
      osmCacheMap = null;
      osmCacheVersion++;
    }

    // Round to 5 dp so tiny float drift doesn't create duplicate keys
    function osmCacheKey(lat, lng) {
      return `${(+lat).toFixed(5)},${(+lng).toFixed(5)}`;
    }

    function osmCacheGet(lat, lng) {
      return osmCacheLoad().get(osmCacheKey(lat, lng)) || null;
    }

    function osmCacheSet(lat, lng, value) {
      const store = osmCacheLoad();
      store.set(osmCacheKey(lat, lng), value);
      osmCacheVersion++;
      osmCachePersist();
    }

    // Writing the whole cache on every single geocode is wasteful when the queue
    // is draining one result a second, so batch the writes.
    let osmPersistTimer = null;
    function osmCachePersist() {
      if (osmPersistTimer) return;
      osmPersistTimer = setTimeout(() => {
        osmPersistTimer = null;
        try {
          const out = {};
          osmCacheLoad().forEach((v, k) => { out[k] = v; });
          localStorage.setItem(OSM_CACHE_KEY, JSON.stringify(out));
        } catch (_) { /* quota or private mode */ }
      }, 400);
    }

    function osmCacheSize() {
      return osmCacheLoad().size;
    }

    // Resolves to "State, CC" or falls back to "Unknown"
    function osmReverseGeocode(lat, lng) {
      return new Promise(resolve => {
        if (!active || !validOsmCoordinates(lat, lng)) return resolve("Unknown");
        const generation = osmGeneration;
        osmQueuedKeys.add(generation + ":" + osmCacheKey(lat, lng));
        osmQueue.push({ lat, lng, resolve, generation });
        if (!osmQueueBusy) osmDrainQueue();
      });
    }

    function osmDrainQueue() {
      if (!active || !isNominationsRoute() || plotState.aggregationMode !== "osm" || !osmQueue.length) { osmQueueBusy = false; return; }
      if (osmInFlight) return;
      const wait = osmNextRequestAt - Date.now();
      if (wait > 0) {
        osmQueueBusy = true;
        if (!osmDrainTimer) osmDrainTimer = setTimeout(() => { osmDrainTimer = 0; osmDrainQueue(); }, wait);
        return;
      }
      osmQueueBusy = true; osmInFlight = true;
      const { lat, lng, resolve, generation } = osmQueue.shift();
      const key = osmCacheKey(lat, lng);
      const failed = () => {
        if (active && generation === osmGeneration) osmFailedUntil.set(key, Math.max(Date.now() + 60000, osmNextRequestAt));
        resolve("Unknown");
      };
      osmNextRequestAt = Date.now() + 1000;
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
      fetch(url, { headers: { "Accept-Language": "en" } })
        .then(response => {
          if (!response.ok) {
            if (response.status === 429) {
              const retry = response.headers?.get("Retry-After");
              const retryAt = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry || "");
              osmNextRequestAt = Math.max(osmNextRequestAt, Number.isFinite(retryAt) ? retryAt : Date.now() + 60000);
            }
            return null;
          }
          return response.json();
        })
        .then(data => {
          const address = data?.address;
          if (!address || typeof address !== "object" || Array.isArray(address)) { failed(); return; }
          const town = address.suburb || address.neighbourhood || address.quarter || address.city_district || address.village || address.hamlet || address.town || "";
          const midRaw = address.city || address.municipality || address.county || address.district || address.state_district || address.state || address.province || address.region || "";
          const country = address.country || (typeof address.country_code === "string" ? address.country_code.toUpperCase() : "");
          const label = [town, midRaw !== town ? midRaw : "", country].filter(value => typeof value === "string" && value.trim()).join(", ");
          if (!label) { failed(); return; }
          if (active && generation === osmGeneration && !osmCacheGet(lat, lng)) osmCacheSet(lat, lng, label);
          resolve(label);
        })
        .catch(failed)
        .finally(() => { osmInFlight = false; osmDrainQueue(); });
    }

    // Geocode every nomination that has coords and isn't already cached.
    // DOM progress bar is updated if present; re-renders when finished.
    function osmStartPrewarm(nominations) {
      if (!active || plotState.aggregationMode !== "osm" || !Array.isArray(nominations)) return;
      const generation = osmGeneration, now = Date.now(), seen = new Set(), unique = [];
      for (const nomination of nominations) {
        if (!nomination || !validOsmCoordinates(nomination.lat, nomination.lng)) continue;
        const key = osmCacheKey(nomination.lat, nomination.lng);
        if (seen.has(key) || osmCacheGet(nomination.lat, nomination.lng) || osmQueuedKeys.has(generation + ":" + key) || (osmFailedUntil.get(key) || 0) > now) continue;
        seen.add(key); osmFailedUntil.delete(key); unique.push(nomination);
      }
      if (!unique.length) {
        if (!osmQueueBusy && osmQueue.length) osmDrainQueue();
        return;
      }
      if (osmDoneCount >= osmPendingCount) { osmPendingCount = 0; osmDoneCount = 0; }
      osmPendingCount += unique.length;
      osmUpdateProgressBar();
      for (const nomination of unique) {
        osmReverseGeocode(nomination.lat, nomination.lng).then(() => {
          osmQueuedKeys.delete(generation + ":" + osmCacheKey(nomination.lat, nomination.lng));
          if (!active || generation !== osmGeneration) return;
          osmDoneCount++;
          osmUpdateProgressBar();
          if (osmDoneCount % 10 === 0 && plotState.aggregationMode === "osm") { refreshAreaOptions(); renderPlots(); }
          if (osmDoneCount >= osmPendingCount) {
            osmHideProgressBar();
            const label = document.getElementById("wfns-osm-cache-count");
            if (label) label.textContent = `${osmCacheSize()} coords cached`;
            if (plotState.aggregationMode === "osm") { refreshAreaOptions(); renderPlots(); }
          }
        });
      }
    }

    function osmUpdateProgressBar() {
      let bar = document.getElementById("wfns-osm-bar");
      if (!bar) {
        // Create the inline progress bar; its reserved space prevents layout shifts.
        const root = document.getElementById("wfns-plots-inner");
        if (!root) return;
        bar = document.createElement("div");
        bar.id = "wfns-osm-bar";
        bar.style.cssText = `
          display:flex; align-items:center; gap:10px; padding:7px 12px;
          background:var(--wfns-bg-card,#fff); border:1px solid var(--wfns-ctrl-border,#DF471C);
          border-radius:6px; margin-bottom:8px; font-size:12px;
          color:var(--wfns-text,#000);
        `;
        bar.innerHTML = `
          <span id="wfns-osm-spin" style="
            display:inline-block;width:14px;height:14px;border-radius:50%;
            border:2px solid var(--wfns-ctrl-border,#DF471C);
            border-top-color:transparent;
            animation:wfns-spin 0.8s linear infinite;flex-shrink:0;"></span>
          <span id="wfns-osm-bar-lbl"></span>
          <span style="font-size:10px;opacity:0.65;">(1 request/s — cached permanently)</span>
        `;
        document.getElementById("wfns-osm-status-slot")?.appendChild(bar);
        // Inject keyframe once
        if (!document.getElementById("wfns-spin-kf")) {
          const s = document.createElement("style");
          s.id = "wfns-spin-kf";
          s.textContent = "@keyframes wfns-spin{to{transform:rotate(360deg)}}";
          document.head.appendChild(s);
        }
      }
      const lbl = document.getElementById("wfns-osm-bar-lbl");
      if (lbl) lbl.textContent = `OSM geocoding: ${osmDoneCount} / ${osmPendingCount}`;
    }

    function osmHideProgressBar() {
      const bar = document.getElementById("wfns-osm-bar");
      const label = bar?.querySelector("#wfns-osm-bar-lbl");
      if (label) label.textContent = "OSM labels up to date · " + osmCacheSize() + " locations cached";
    }
    // ─────────────────────────────────────────────────────────────────────────
    function loadHtml2Canvas() {
      // Retained for compatibility; exports use browser-native SVG + canvas.
      return Promise.resolve();
    }

    function getExportCard(target, rootId, wrapSelector) {
      let card = target && target.closest ? target.closest(".wfns-chart-card") : null;
      if (!card && target && target.querySelector) card = target;

      const root = document.getElementById(rootId);
      if ((!card || !card.querySelector(wrapSelector)) && root) {
        card = root.querySelector(".wfns-chart-card");
      }

      const wrap = card && card.querySelector ? card.querySelector(wrapSelector) : null;
      return { card, wrap };
    }

    async function exportAreaPlotAsPng(target, chartScope) {
      return exportCharts([target], chartScope, "area");
    }

    async function exportTimelinePlotAsPng(target, chartScope) {
      return exportCharts([target], chartScope, "timeline");
    }

    /**
     * Wayfarer moved from wayfarer.nianticlabs.com to wayfarer.scopely.com and the
     * Angular app now issues the manage call through both XHR and fetch, sometimes
     * with an absolute URL and/or a query string. Normalise before matching so the
     * plots keep working on the new site.
     */
    const MANAGE_PATH = '/api/v1/vault/manage';

    function isManageListUrl(url) {
      try {
        const parsed = new URL(String(url), window.location.origin);
        return parsed.origin === window.location.origin && /^\/api\/v\d+\/vault\/(?:manage|submissions)$/.test(parsed.pathname.replace(/\/+$/, ""));
      } catch (_) { return false; }
    }

    function ingestManageJson(json) {
      if (!active || !json || json.captcha || json.result?.captcha) return false;
      const submissions = Array.isArray(json.result?.submissions) ? json.result.submissions : json.submissions;
      if (!Array.isArray(submissions)) return false;
      nominations = submissions.filter(entry => entry && typeof entry === "object" && !Array.isArray(entry));
      dataRevision++;
      scheduleRenderPlotsApp();
      return true;
    }

    function parseNominations() {
        try {
            const raw = this.response || this.responseText;
            const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!ingestManageJson(json)) {
                console.log('[WFNS Plots] Manage response did not include nominations.');
            }
        } catch (e) {
            console.log(e); // eslint-disable-line no-console
        }
    }

    /**
     * Wayfarer Map Mods 4.0 already caches every contribution from the same endpoint.
     * If it is present we can render immediately instead of waiting for a network call
     * that may have happened before this script ran.
     */
    function nominationsFromMapMods() {
        try {
            const list = WFMM.contributions?.list();
            if (!Array.isArray(list)) return null;
            // Keep the original payload fields, overlaying locally updated status.
            return list.map(entry => entry?.raw ? { ...entry.raw, ...entry, raw: entry.raw } : entry).filter(Boolean);
        } catch (e) {
            return null;
        }
    }

    let renderTimer = 0;
    function scheduleRenderPlotsApp(delay) {
        if (!active) return;
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderPlotsApp, typeof delay === 'number' ? delay : 300);
    }


    function isNominationsRoute() {
        return window.location.pathname.replace(/\/+$/, "") === "/profile";
    }

    async function renderPlotsApp() {
        if (!active) return;
        if (!isNominationsRoute()) { unmountProfile(); return; }
        if (!document.querySelector('[data-testid="profile-page"]')) return;
        if (!Array.isArray(nominations)) nominations = nominationsFromMapMods() || [];
        addCss();
        if (!document.getElementById("wfns-plots-root")) addPlotsSection();
        placeProfilePanel();
        ensureContributionData();
        if (renderedRevision !== dataRevision) {
            renderPlotControls();
            renderPlots();
            renderedRevision = dataRevision;
        }
    }

    function findPlotsAnchor() {
      return findTierCard() || document.querySelector('[data-testid="profile-page"]');
    }

    function watchForNominationsRoute() {
        const schedule = () => scheduleRenderPlotsApp(60);
        if (WFMM.routes?.onChange) cleanups.push(WFMM.routes.onChange(schedule));
        window.addEventListener("popstate", schedule);
        cleanups.push(() => window.removeEventListener("popstate", schedule));
        observer = new MutationObserver(records => {
            if (!active) return;
            if (!isNominationsRoute()) { if (mountedRoot) unmountProfile(); return; }
            const root = document.getElementById("wfns-plots-root");
            if (records.every(record => root?.contains(record.target))) return;
            if (!root || !root.isConnected || !root.dataset.placement || records.some(record =>
              record.target?.matches?.('[data-testid="profile-page"]') ||
              [...record.removedNodes].some(node => node.contains?.(root)))) schedule();
        });
        observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
    }

    function addCss() {
      if (document.getElementById("wfns-plots-css")) return;
      const style = document.createElement("style"); style.id = "wfns-plots-css";
      style.textContent = "#wfns-plots-root {\n  --wfns-bg:#fff; --wfns-bg-card:#fff; --wfns-border:#e5e4e2;\n  --wfns-text:#131d2b; --wfns-text-muted:#7d8795; --wfns-axis:#596575;\n  --wfns-grid:#e9edf1; --wfns-ctrl-bg:#f7f7f7; --wfns-ctrl-bg2:#faf9f7;\n  --wfns-ctrl-border:#e86d28; --wfns-input-bg:#fff; --wfns-input-text:#131d2b;\n  --wfns-btn-bg:#f6f6f6; --wfns-btn-text:#131d2b; --wfns-svg-bg:#fff;\n  --wfns-bar-frame:#b1b9c4; --wfns-bar-blank:#edf0f4; --wfns-accent:#ed6725;\n  width:100%; min-width:0; box-sizing:border-box; margin-top:24px; padding:22px;\n  border:1px solid var(--wfns-border); border-radius:20px;\n  background:var(--wfns-bg); color:var(--wfns-text); font:inherit;\n  font-size:13px; line-height:1.45; overflow-anchor:none; container-type:inline-size;\n  isolation:isolate; text-align:left; color-scheme:light;\n}\n#wfns-plots-root *,#wfns-plots-root *::before,#wfns-plots-root *::after { box-sizing:border-box; }\n#wfns-plots-root[hidden],#wfns-plots-root [hidden] { display:none !important; }\n#wfns-plots-root[data-placement=\"tier\"] { border:0; border-top:1px solid var(--wfns-border); border-radius:0; padding:24px 0 0; }\n#wfns-plots-root[data-theme=\"dark\"] {\n  --wfns-bg:#1c1e22; --wfns-bg-card:#23262b; --wfns-border:#383c44;\n  --wfns-text:#eff1f5; --wfns-text-muted:#a1abba; --wfns-axis:#b9c4d3;\n  --wfns-grid:#383e48; --wfns-ctrl-bg:#282c33; --wfns-ctrl-bg2:#22262c;\n  --wfns-ctrl-border:#ff995f; --wfns-input-bg:#262a31; --wfns-input-text:#eff1f5;\n  --wfns-btn-bg:#2d323b; --wfns-btn-text:#eff1f5; --wfns-svg-bg:#23262b;\n  --wfns-bar-frame:#657184; --wfns-bar-blank:#343d4a; --wfns-accent:#ff995f; color-scheme:dark;\n}\n#wfns-plots-root .wfns-dashboard-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:18px; }\n#wfns-plots-root h2 { margin:0; font-family:inherit; font-size:18px; line-height:1.3; font-weight:600; color:var(--wfns-text); }\n#wfns-plots-root .wfns-dashboard-header p { margin:5px 0 0; color:var(--wfns-text-muted); font-size:11px; }\n#wfns-plots-root .wfns-theme-label { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--wfns-text-muted); }\n#wfns-plots-root button,#wfns-plots-root select,#wfns-plots-root input { font:inherit; }\n#wfns-plots-root button { cursor:pointer; background:var(--wfns-btn-bg); color:var(--wfns-btn-text); border:1px solid var(--wfns-border); border-radius:8px; padding:7px 10px; line-height:1.3; }\n#wfns-plots-root button:disabled { cursor:wait; opacity:.55; }\n#wfns-plots-root button:hover { border-color:var(--wfns-accent); }\n#wfns-plots-root :focus-visible { outline:2px solid var(--wfns-accent); outline-offset:3px; }\n#wfns-plots-root select,#wfns-plots-root input[type=\"date\"] { padding:7px 8px; max-width:100%; min-width:0; border:1px solid var(--wfns-border); background:var(--wfns-input-bg); color:var(--wfns-input-text); border-radius:7px; }\n#wfns-plots-root input[type=\"checkbox\"],#wfns-plots-root input[type=\"radio\"] { accent-color:var(--wfns-accent); margin:0 5px 0 0; vertical-align:middle; }\n#wfns-plots-root input[type=\"color\"] { width:30px; height:26px; border:0; padding:2px; background:transparent; }\n#wfns-plots-root label { color:var(--wfns-text); }\n#wfns-plots-root .wfns-settings-tabs { display:flex; border-bottom:1px solid var(--wfns-border); gap:4px; }\n#wfns-plots-root .wfns-settings-tabs button { flex:1; padding:12px 5px; border:0; border-bottom:2px solid transparent; border-radius:0; background:transparent; color:var(--wfns-text-muted); font-weight:500; }\n#wfns-plots-root .wfns-settings-tabs button[aria-selected=\"true\"] { border-bottom-color:var(--wfns-accent); color:var(--wfns-text); }\n#wfns-plots-root .wfns-settings-viewport { height:340px; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; border-bottom:1px solid var(--wfns-border); overflow-anchor:none; }\n#wfns-plots-root .wfns-settings-row { display:flex; flex-wrap:wrap; gap:14px; padding:18px 0; align-items:flex-start; }\n#wfns-plots-root .wfns-control-block { flex:1 1 145px; min-width:0; max-width:100%; padding:12px; border-radius:12px; background:var(--wfns-ctrl-bg); }\n#wfns-plots-root .wfns-control-block-label { margin-bottom:9px; font-size:10px; letter-spacing:.07em; font-weight:600; text-transform:uppercase; color:var(--wfns-text-muted); }\n#wfns-plots-root .wfns-control-block label { white-space:normal !important; line-height:1.7; }\n#wfns-plots-root .wfns-control-block:has(input[data-status]) { flex:2 1 250px; }\n#wfns-plots-root .wfns-control-block label:has(input[data-status]) { display:flex !important; align-items:center; white-space:nowrap !important; }\n#wfns-plots-root .wfns-toggle-switch { position:relative; display:inline-flex; align-items:center; }\n#wfns-plots-root .wfns-toggle-slider { display:none; }\n#wfns-plots-root .wfns-chart-picker { padding:18px 0 10px; }\n#wfns-plots-root .wfns-segments { display:flex; flex-wrap:wrap; gap:5px; }\n#wfns-plots-root .wfns-segments button { font-size:11px; padding:7px 10px; border-color:transparent; border-radius:8px; white-space:nowrap; }\n#wfns-plots-root .wfns-segments button[aria-selected=\"true\"] { color:var(--wfns-bg); background:var(--wfns-text); }\n#wfns-plots-root .wfns-group-tabs { margin-top:9px; }\n#wfns-plots-root .wfns-group-tabs button { background:transparent; color:var(--wfns-text-muted); }\n#wfns-plots-root .wfns-chart-hint { font-size:10px; color:var(--wfns-text-muted); margin:10px 0 0; min-height:15px; }\n#wfns-plots-root #wfns-chart-gallery { height:660px; max-height:82vh; min-height:400px; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; overflow-anchor:none; contain:layout style; padding-right:2px; }\n#wfns-plots-root .wfns-chart-group { border:1px solid var(--wfns-border); background:var(--wfns-bg-card); border-radius:14px; padding:12px; margin:0 0 12px; min-width:0; }\n#wfns-plots-root .wfns-group-head { display:flex; align-items:center; gap:8px; min-height:33px; margin-bottom:10px; }\n#wfns-plots-root .wfns-group-head h3 { margin:0 auto 0 0; font-size:13px; font-weight:600; color:var(--wfns-text); }\n#wfns-plots-root .wfns-export-pair { font-size:10px; padding:6px 8px; background:transparent; }\n#wfns-plots-root .wfns-chart-pair { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; }\n#wfns-plots-root .wfns-chart-slot { min-width:0; height:330px; overflow:hidden; border:1px solid var(--wfns-border); border-radius:10px; background:var(--wfns-bg-card); }\n#wfns-plots-root .wfns-chart-slot[data-pending]::before { content:attr(data-pending); display:block; padding:16px; color:var(--wfns-text-muted); font-size:12px; }\n#wfns-plots-root .wfns-chart-card { height:100%; min-width:0; display:flex; flex-direction:column; gap:0; padding:10px; }\n#wfns-plots-root .wfns-chart-header { display:flex; gap:6px; align-items:flex-start; min-height:32px; margin-bottom:4px; flex:none; }\n#wfns-plots-root .wfns-chart-title { font-size:10px; font-weight:500; line-height:1.4; color:var(--wfns-text-muted); overflow-wrap:anywhere; margin-right:auto; }\n#wfns-plots-root .wfns-chart-export-button { flex:none; font-size:9px; padding:3px 5px; background:transparent; }\n#wfns-plots-root .wfns-bars-wrap,#wfns-plots-root .wfns-timeline-wrap { flex:1; min-height:0; overflow:auto !important; overscroll-behavior:contain; border:0 !important; padding:0 !important; }\n#wfns-plots-root .wfns-bars-wrap svg { height:240px; }\n#wfns-plots-root .wfns-timeline-wrap svg { max-width:none; height:240px; }\n#wfns-plots-root .wfns-chart-card > div:last-child:not(.wfns-chart-header):not(.wfns-bars-wrap):not(.wfns-timeline-wrap) { flex:none; max-height:40px; overflow:auto; font-size:10px; gap:5px 9px !important; margin-top:6px !important; }\n#wfns-plots-root .wfns-legend-item { font-size:10px; }\n#wfns-plots-root .wfns-data-label { font-size:10px; text-anchor:middle; pointer-events:none; }\n#wfns-plots-root .wfns-hover-readout { height:17px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:9px; color:var(--wfns-text-muted); }\n#wfns-plots-root #wfns-osm-bar { min-height:20px; margin:8px 0 0 !important; padding:0 !important; border:0 !important; font-size:10px !important; background:transparent !important; }\n#wfns-plots-root #wfns-osm-spin { display:none !important; }\n#wfns-plots-root #wfns-osm-status-slot { min-height:25px; }\n#wfns-plots-root .wfns-export-status { margin:7px 0 0; min-height:16px; font-size:10px; color:var(--wfns-text-muted); }\n@container (min-width:600px) {\n  #wfns-plots-root .wfns-chart-pair { grid-template-columns:repeat(2,minmax(0,1fr)); }\n  #wfns-plots-root .wfns-chart-slot { height:330px; }\n}\n@container (max-width:390px) {\n  #wfns-plots-root .wfns-dashboard-header { flex-wrap:wrap; }\n  #wfns-plots-root .wfns-control-block { flex-basis:130px; padding:9px; }\n  #wfns-plots-root .wfns-settings-row { gap:8px; }\n  #wfns-plots-root .wfns-segments button { padding:7px; font-size:10px; }\n  #wfns-plots-root .wfns-chart-group { padding:8px; }\n}\n@media (max-width:600px) { #wfns-plots-root { padding:14px; border-radius:16px; } }\n@media (prefers-reduced-motion:reduce) { #wfns-plots-root * { scroll-behavior:auto !important; animation:none !important; transition:none !important; } }\n\n/* 0.9.1: normal page flow throughout, with no nested scrolling containers. */\n#wfns-plots-root { overflow:visible; align-self:start; min-width:0; }\n#wfns-plots-root[data-placement=\"tier\"] { border:1px solid var(--wfns-border); border-radius:20px; padding:22px; }\n#wfns-plots-root .wfns-dashboard-header { margin-bottom:14px; }\n#wfns-plots-root .wfns-settings-viewport,\n#wfns-plots-root #wfns-chart-gallery,\n#wfns-plots-root .wfns-chart-slot,\n#wfns-plots-root .wfns-chart-card,\n#wfns-plots-root .wfns-bars-wrap,\n#wfns-plots-root .wfns-timeline-wrap,\n#wfns-plots-root .wfns-chart-card > div:last-child {\n  height:auto !important; max-height:none !important; overflow:visible !important;\n  overscroll-behavior:auto !important; contain:none; scrollbar-gutter:auto;\n}\n#wfns-plots-root #wfns-chart-gallery { min-height:0; padding:0; }\n#wfns-plots-root .wfns-settings-viewport { min-height:0; }\n#wfns-plots-root .wfns-settings-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; padding:16px 0; }\n#wfns-plots-root .wfns-control-block { flex:none; min-width:0; padding:12px; }\n#wfns-plots-root .wfns-control-block[data-control=\"status-colours\"] { grid-column:span 2; }\n#wfns-plots-root .wfns-colour-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px 14px; }\n#wfns-plots-root .wfns-colour-grid > label { display:flex; align-items:center; gap:7px; min-width:0; margin:0; }\n#wfns-plots-root .wfns-colour-grid > label > span { white-space:normal !important; }\n#wfns-plots-root .wfns-colour-grid input[type=\"color\"] { flex:none; margin:0; }\n#wfns-plots-root .wfns-area-options-stack { display:flex; flex-direction:column; gap:10px; min-width:0; }\n#wfns-plots-root [data-control=\"osm-cache\"] > div { max-width:none !important; }\n#wfns-plots-root [data-control=\"aggregate-by\"] select { width:100%; }\n#wfns-plots-root .wfns-chart-picker { padding:16px 0; }\n#wfns-plots-root #wfns-osm-status-slot { min-height:0; }\n#wfns-plots-root .wfns-chart-group { padding:14px; margin:0 0 16px; }\n#wfns-plots-root .wfns-chart-pair { display:block !important; }\n#wfns-plots-root .wfns-chart-slot { margin-top:12px; }\n#wfns-plots-root .wfns-chart-card { display:block; padding:12px; }\n#wfns-plots-root .wfns-chart-header { min-height:0; margin-bottom:12px; }\n#wfns-plots-root .wfns-chart-title { font-size:12px; color:var(--wfns-text); }\n#wfns-plots-root .wfns-bars-wrap svg,\n#wfns-plots-root .wfns-timeline-wrap svg { display:block; width:100% !important; height:auto !important; max-width:100%; }\n#wfns-plots-root .wfns-chart-card > div:last-child { display:flex; flex-wrap:wrap; margin-top:10px !important; }\n#wfns-plots-root .wfns-hover-readout { height:auto; max-height:none; overflow:visible; white-space:normal; overflow-wrap:anywhere; margin-top:7px; }\n#wfns-plots-root .wfns-export-status:empty { display:none; }\n@container (max-width:580px) {\n  #wfns-plots-root .wfns-settings-row { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }\n  #wfns-plots-root .wfns-control-block[data-control=\"statuses\"] { grid-column:span 2; }\n  #wfns-plots-root .wfns-control-block[data-control=\"types\"] { grid-column:span 2; }\n  #wfns-plots-root [data-control=\"types\"] > label { display:inline-flex !important; align-items:center; width:50%; vertical-align:top; }\n  #wfns-plots-root [data-settings-panel=\"by-area\"] .wfns-settings-row { grid-template-columns:minmax(0,1fr); }\n  #wfns-plots-root .wfns-chart-group { padding:10px; }\n  #wfns-plots-root .wfns-chart-card { padding:10px; }\n}\n@container (max-width:300px) {\n  #wfns-plots-root .wfns-settings-row { grid-template-columns:minmax(0,1fr); }\n  #wfns-plots-root .wfns-control-block[data-control=\"statuses\"],\n  #wfns-plots-root .wfns-control-block[data-control=\"status-colours\"] { grid-column:auto; }\n}\n\n/* Fixed settings footprint. Hidden date controls reserve their full space. */\n#wfns-plots-root .wfns-settings-viewport { height:var(--wfns-settings-height,500px) !important; overflow:visible !important; }\n#wfns-plots-root #wfns-plot-controls { position:relative; }\n#wfns-plots-root #wfns-plot-controls.wfns-measuring-settings [data-settings-panel] {\n  display:block !important; position:absolute !important; left:0; right:0; top:0; visibility:hidden !important; pointer-events:none;\n}\n#wfns-plots-root #wfns-ts-date-range-inputs,\n#wfns-plots-root #wfns-area-date-range-inputs,\n#wfns-plots-root #wfns-date-range-inputs { display:flex !important; min-height:155px; }\n#wfns-plots-root #wfns-ts-date-range-inputs[style*=\"display: none\"],\n#wfns-plots-root #wfns-area-date-range-inputs[style*=\"display: none\"],\n#wfns-plots-root #wfns-date-range-inputs[style*=\"display: none\"] { visibility:hidden; pointer-events:none; }\n#wfns-plots-root #wfns-range-info,#wfns-plots-root #wfns-ts-range-info,#wfns-plots-root #wfns-area-range-info { min-height:30px; }\n/* Area scrolls horizontally; the page and Timeline keep normal vertical flow. */\n#wfns-plots-root .wfns-bars-wrap { overflow-x:auto !important; overflow-y:hidden !important; overscroll-behavior:auto !important; width:100%; padding:0 0 6px !important; }\n#wfns-plots-root .wfns-bars-wrap svg { width:auto !important; max-width:none !important; height:322px !important; }\n#wfns-plots-root .wfns-chart-heading { flex:1; min-width:0; }\n#wfns-plots-root .wfns-chart-title { font-size:14px; font-weight:600; }\n#wfns-plots-root .wfns-chart-subtitle { font-size:12px; color:var(--wfns-text-muted); margin-top:5px; line-height:1.5; overflow-wrap:anywhere; }\n#wfns-plots-root .wfns-chart-legend { display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:12px; }\n#wfns-plots-root .wfns-hover-readout {\n  display:block !important; font-size:13px !important; line-height:1.7; min-height:88px; white-space:normal; overflow-wrap:anywhere;\n  padding:11px 12px; margin-top:12px !important; background:var(--wfns-ctrl-bg); border-radius:8px; color:var(--wfns-text);\n}\n@container (max-width:580px) { #wfns-plots-root .wfns-hover-readout { min-height:138px; font-size:13px; } }\n\n/* A single intrinsic grid track reserves the largest complete settings panel.\n   Visibility switches, rather than display, keep every panel in the track. */\n#wfns-plots-root .wfns-settings-viewport { height:auto !important; min-height:550px; overflow:visible !important; padding-bottom:32px; }\n#wfns-plots-root #wfns-plot-controls { display:grid; grid-template-columns:minmax(0,1fr); align-items:start; position:relative; }\n#wfns-plots-root #wfns-plot-controls [data-settings-panel] { display:block !important; grid-area:1 / 1; position:relative !important; min-width:0; }\n#wfns-plots-root #wfns-plot-controls [data-settings-panel][hidden] { display:block !important; visibility:hidden !important; pointer-events:none; }\n#wfns-plots-root .wfns-chart-title-line { display:flex; align-items:baseline; flex-wrap:wrap; gap:5px 12px; }\n#wfns-plots-root .wfns-chart-date { font-size:11px; line-height:1.5; color:var(--wfns-text-muted); margin-left:auto; white-space:normal; }\n#wfns-plots-root .wfns-no-chart-data,#wfns-plots-root .wfns-group-empty { padding:18px 12px; margin:0; font-size:13px; color:var(--wfns-text-muted); }\n@container (max-width:580px) {\n  #wfns-plots-root .wfns-settings-viewport { min-height:600px; padding-bottom:36px; }\n  #wfns-plots-root .wfns-chart-date { margin-left:0; flex-basis:100%; }\n}\n@container (max-width:300px) {\n  #wfns-plots-root .wfns-control-block[data-control=\"types\"] { grid-column:auto; }\n}\n\n/* Only the long Timeline scrolls; vertical wheel movement stays on the page. */\n#wfns-plots-root .wfns-timeline-wrap[data-scrollable=\"true\"] { overflow-x:auto !important; overflow-y:hidden !important; max-width:100%; overscroll-behavior:auto; }\n#wfns-plots-root .wfns-timeline-wrap[data-scrollable=\"true\"] svg { width:auto !important; max-width:none !important; height:auto !important; }\n\n#wfns-plots-root .wfns-dashboard-header { flex-wrap:wrap; }\n#wfns-plots-root .wfns-dashboard-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:8px 12px; }\n#wfns-plots-root #wfns-toggle-settings { font-size:11px; }\n@container (max-width:300px) { #wfns-plots-root .wfns-dashboard-actions { flex-basis:100%; justify-content:space-between; } }\n";
      document.head.appendChild(style);
    }

    // Functionality to add plots section
    function addPlotsSection() {
        if (!active || document.getElementById("wfns-plots-root")) return;
        const root = document.createElement("section");
        root.id = "wfns-plots-root";
        root.setAttribute("aria-labelledby", "wfns-profile-heading");
        root.innerHTML = `
          <header class="wfns-dashboard-header">
            <div><h2 id="wfns-profile-heading">Submission insights</h2>
            </div>
            <div class="wfns-dashboard-actions">
            <button type="button" id="wfns-toggle-settings" aria-controls="wfns-settings-region" aria-expanded="true">Hide settings</button>
            <label class="wfns-theme-label">Theme <select id="wfns-theme" aria-label="Chart theme">
              <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
            </select></label></div>
          </header>
          <div id="wfns-plots-inner">
            <div id="wfns-settings-region">
            <div class="wfns-settings-tabs" role="tablist" aria-label="Plot settings">
              <button type="button" role="tab" data-settings-tab="type-status" id="wfns-tab-type-status" aria-controls="wfns-panel-type-status">Type / Status</button>
              <button type="button" role="tab" data-settings-tab="by-area" id="wfns-tab-by-area" aria-controls="wfns-panel-by-area">By Area</button>
              <button type="button" role="tab" data-settings-tab="chart" id="wfns-tab-chart" aria-controls="wfns-panel-chart">Chart</button>
            </div>
            <div class="wfns-settings-viewport"><div id="wfns-plot-controls"></div></div>
            </div>
            <div class="wfns-chart-picker" aria-label="Chart selection">
              <div id="wfns-kind-tabs" class="wfns-segments" role="tablist" aria-label="Chart view"></div>
              <div id="wfns-group-tabs" class="wfns-segments wfns-group-tabs" role="tablist" aria-label="Submission charts"></div>

              <div id="wfns-osm-status-slot" aria-live="polite"></div>
            </div>
            <div id="wfns-chart-gallery" tabindex="0" role="region" aria-label="Submission chart groups"></div>
            <p id="wfns-export-status" class="wfns-export-status" role="status"></p>
          </div>`;
        const host = findPlotsAnchor();
        if (!host) return;
        host.appendChild(root);
        mountProfileUi(root);
        renderPlotControls();
        renderPlots();
    }

    function renderPlotControls() {
      const controls = document.getElementById("wfns-plot-controls");
      if (!controls) return;

      const view = controls.closest(".wfns-settings-viewport");
      const oldScroll = view?.scrollTop || 0;
      const focusedId = controls.contains(document.activeElement) ? document.activeElement.id : "";
      controls.innerHTML = "";
      syncVisibleChartScopes();

      // ── Helpers ──────────────────────────────────────────────────────────────
      function makeControlBlock() {
        const block = document.createElement("div");
        block.className = "wfns-control-block";
        return block;
      }

      function makeControlLabel(text) {
        const label = document.createElement("div");
        label.className = "wfns-control-block-label";
        label.textContent = text;
        return label;
      }

      function makeSection(title, buildFn) {
        const key = title === "Type / Status" ? "type-status" : title === "By Area" ? "by-area" : "chart";
        const section = document.createElement("div");
        section.id = "wfns-panel-" + key;
        section.dataset.settingsPanel = key;
        section.className = "wfns-settings-panel";
        section.setAttribute("role", "tabpanel");
        section.setAttribute("aria-labelledby", "wfns-tab-" + key);
        section.hidden = plotState.settingsTab !== key;
        const row = document.createElement("div");
        row.className = "wfns-settings-row";
        buildFn(row);
        section.appendChild(row);
        return section;
      }

      // ── Section 2: Type / Status ──────────────────────────────────────────────
      controls.appendChild(makeSection("Type / Status", (row) => {
        // Types
        const typeBlock = makeControlBlock();
        typeBlock.appendChild(makeControlLabel("Types"));
        PLOT_TYPE_OPTIONS.forEach(type => {
          const label = document.createElement("label");
          label.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
          label.innerHTML = `<input type="checkbox" data-type="${type}" ${plotState.selectedTypes.has(type) ? "checked" : ""}> ${TYPE_DISPLAY[type] || type}`;
          typeBlock.appendChild(label);
        });
        row.appendChild(typeBlock);

        // Status split into two columns
        const statusBlock = makeControlBlock();
        statusBlock.appendChild(makeControlLabel("Statuses"));
        const statusCols = document.createElement("div");
        statusCols.style.cssText = "display:flex; gap:14px;";
        const col1 = document.createElement("div");
        const col2 = document.createElement("div");
        const half = Math.ceil(PLOT_STATUS_TYPES.length / 2);
        PLOT_STATUS_TYPES.forEach((status, idx) => {
          const label = document.createElement("label");
          label.style.cssText = "display:block; margin-bottom:4px; cursor:pointer; white-space:nowrap;";
          label.innerHTML = `<input type="checkbox" data-status="${status}" ${plotState.selectedStatuses.has(status) ? "checked" : ""}> ${STATUS_DISPLAY[status] || status}`;
          (idx < half ? col1 : col2).appendChild(label);
        });
        statusCols.appendChild(col1);
        statusCols.appendChild(col2);
        statusBlock.appendChild(statusCols);
        row.appendChild(statusBlock);

        // Date Range for both charts (by Type/Status)
        const tsDateRangeBlock = makeControlBlock();
        tsDateRangeBlock.appendChild(makeControlLabel("Date Range (Both)"));
        const tsDateToggleWrap = document.createElement("div");
        tsDateToggleWrap.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:8px;";
        tsDateToggleWrap.innerHTML = `
          <label class="wfns-toggle-switch">
            <input type="checkbox" id="wfns-ts-date-range-toggle" ${plotState.typeStatusRangeEnabled ? "checked" : ""}>
            <span class="wfns-toggle-slider"></span>
          </label>
          <span id="wfns-ts-date-range-text" style="font-size:12px;">${plotState.typeStatusRangeEnabled ? "On" : "Off"}</span>
        `;
        tsDateRangeBlock.appendChild(tsDateToggleWrap);
        const tsDateInputsWrap = document.createElement("div");
        tsDateInputsWrap.id = "wfns-ts-date-range-inputs";
        tsDateInputsWrap.style.cssText = `display:${plotState.typeStatusRangeEnabled ? "flex" : "none"}; flex-direction:column; gap:6px;`;
        tsDateInputsWrap.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:10px; color:var(--wfns-text-muted,#888);">From</span>
            <input type="date" id="wfns-ts-range-start" value="${plotState.typeStatusRangeStart}" style="
              padding:3px 6px; border-radius:4px; font-size:11px;
              background:var(--wfns-input-bg); color:var(--wfns-input-text);
              border:1px solid var(--wfns-border); cursor:pointer;">
          </div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:10px; color:var(--wfns-text-muted,#888);">To</span>
            <input type="date" id="wfns-ts-range-end" value="${plotState.typeStatusRangeEnd}" style="
              padding:3px 6px; border-radius:4px; font-size:11px;
              background:var(--wfns-input-bg); color:var(--wfns-input-text);
              border:1px solid var(--wfns-border); cursor:pointer;">
          </div>
          <div id="wfns-ts-range-info" style="font-size:10px; color:var(--wfns-text-muted,#888); margin-top:2px;"></div>
          <div style="font-size:10px; color:var(--wfns-text-muted,#888); margin-top:2px; max-width:130px; line-height:1.3;">Filters both Area and Timeline charts</div>
        `;
        tsDateRangeBlock.appendChild(tsDateInputsWrap);
        row.appendChild(tsDateRangeBlock);

        // Both "show everything" switches live together - they are the same idea
        // applied to the two charts, and split across two boxes they read as
        // unrelated settings.
        const allSubBlock = makeControlBlock();
        allSubBlock.appendChild(makeControlLabel("Show All Submissions"));

        const makeAllSubRow = (id, textId, on, caption) => {
          const line = document.createElement("div");
          line.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:6px;";
          line.innerHTML = `
            <label class="wfns-toggle-switch">
              <input type="checkbox" id="${id}" ${on ? "checked" : ""}>
              <span class="wfns-toggle-slider"></span>
            </label>
            <span style="font-size:12px; min-width:58px;">${caption}</span>
            <span id="${textId}" style="font-size:12px; color:var(--wfns-text-muted,#888);">${on ? "On" : "Off"}</span>
          `;
          return line;
        };

        allSubBlock.appendChild(makeAllSubRow(
          "wfns-all-submissions-area-toggle", "wfns-all-submissions-area-text",
          plotState.showAllSubmissionsArea, "Area bars"));
        allSubBlock.appendChild(makeAllSubRow(
          "wfns-all-submissions-toggle", "wfns-all-submissions-text",
          plotState.showAllSubmissions, "Timeline"));

        row.appendChild(allSubBlock);

        // ── Status colours ────────────────────────────────────────────────────
        const colourBlock = makeControlBlock();
        colourBlock.appendChild(makeControlLabel("Status Colours"));
        const colourGrid = document.createElement("div");
        colourGrid.className = "wfns-colour-grid";

        PLOT_STATUS_TYPES.forEach(status => {
          const swatch = document.createElement("input");
          swatch.type = "color";
          swatch.value = STATUS_COLORS[status] || "#888888";
          swatch.dataset.statusColor = status;
          swatch.title = "Colour for " + (STATUS_DISPLAY[status] || status);
          swatch.style.cssText = "width:22px; height:18px; padding:0; border:none; background:none; cursor:pointer;";

          const name = document.createElement("span");
          name.style.cssText = "font-size:11px; white-space:nowrap;";
          name.textContent = STATUS_DISPLAY[status] || status;

          const choice = document.createElement("label");
          choice.append(swatch, name);
          colourGrid.appendChild(choice);
        });
        colourBlock.appendChild(colourGrid);

        const resetColours = document.createElement("button");
        resetColours.type = "button";
        resetColours.id = "wfns-reset-colours";
        resetColours.textContent = "Reset colours";
        resetColours.style.cssText = "font-size:10px; padding:3px 7px; margin-top:6px; width:auto;";
        colourBlock.appendChild(resetColours);
        row.appendChild(colourBlock);
      }));

      // ── Section 3: By Area ────────────────────────────────────────────────────
      controls.appendChild(makeSection("By Area", (row) => {
        // Grouping and filtering are one decision - how the areas are cut, and
        // which of them to look at - so they share a box.
        const aggBlock = makeControlBlock();
        aggBlock.appendChild(makeControlLabel("Aggregate By"));
        [
          ["cityState", "City + State"],
          ["state",     "State"],
          ["osm",       "OSM Town·City·Country ★"]
        ].forEach(([val, text]) => {
          const lbl = document.createElement("label");
          lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
          lbl.innerHTML = `<input type="radio" name="wfns-agg" value="${val}" ${plotState.aggregationMode === val ? "checked" : ""}> ${text}`;
          aggBlock.appendChild(lbl);
        });
        // Appended at the end of this section, once the area filter has been
        // added to it as well.
        row.appendChild(aggBlock);

        const maxBarsBlock = makeControlBlock();
        maxBarsBlock.appendChild(makeControlLabel("Max Bars"));
        const maxBarsSelect = document.createElement("select");
        maxBarsSelect.id = "wfns-max-bars";
        maxBarsSelect.style.cssText = "padding: 4px 6px; border-radius: 4px;";
        [20, 50, 100, 200].forEach(v => {
          const opt = document.createElement("option");
          opt.value = v; opt.textContent = v;
          if (plotState.maxBars === v) opt.selected = true;
          maxBarsSelect.appendChild(opt);
        });
        const allOpt = document.createElement("option");
        allOpt.value = "all"; allOpt.textContent = "All";
        if (plotState.maxBars === "all") allOpt.selected = true;
        maxBarsSelect.appendChild(allOpt);
        maxBarsBlock.appendChild(maxBarsSelect);
        row.appendChild(maxBarsBlock);

        const barScaleBlock = makeControlBlock();
        barScaleBlock.appendChild(makeControlLabel("Bar Height"));
        [
          ["balanced",     "Balanced"],
          ["proportional", "Proportional"]
        ].forEach(([val, text]) => {
          const lbl = document.createElement("label");
          lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
          lbl.innerHTML = `<input type="radio" name="wfns-bar-scale" value="${val}" ${plotState.areaBarScale === val ? "checked" : ""}> ${text}`;
          barScaleBlock.appendChild(lbl);
        });
        row.appendChild(barScaleBlock);

        // OSM cache block
        const osmBlock = makeControlBlock();
        osmBlock.appendChild(makeControlLabel("OSM Cache"));
        const osmInfo = document.createElement("div");
        osmInfo.id = "wfns-osm-cache-count";
        osmInfo.style.cssText = "font-size:11px; margin-bottom:6px; color:var(--wfns-text-muted,#888);";
        osmInfo.textContent = `${osmCacheSize()} coords cached`;
        osmBlock.appendChild(osmInfo);
        const osmNote = document.createElement("div");
        osmNote.style.cssText = "font-size:10px; margin-bottom:6px; color:var(--wfns-text-muted,#888); max-width:140px; line-height:1.3;";
        osmNote.textContent = "Select \"OSM Town·City·Country\" to geocode coords via OpenStreetMap (1 req/s, stored forever). Labels: Town, City/County, Country.";
        osmBlock.appendChild(osmNote);
        const osmBtnWrap = document.createElement("div");
        osmBtnWrap.style.cssText = "display:flex; flex-direction:column; gap:4px;";

        const osmExportBtn = document.createElement("button");
        osmExportBtn.textContent = "⬇ Export Cache";
        osmExportBtn.style.cssText = "font-size:11px; padding:4px 8px; width:auto;";
        osmExportBtn.addEventListener("click", () => {
          try {
            const raw = JSON.stringify(Object.fromEntries(osmCacheLoad()));
            const blob = new Blob([raw], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const date = new Date().toISOString().slice(0, 10);
            a.download = `WayfarerOSMCache_${date}.json`;
            a.href = url;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) { console.log("OSM cache export failed:", err); }
        });

        const osmImportBtn = document.createElement("button");
        osmImportBtn.textContent = "⬆ Import Cache";
        osmImportBtn.style.cssText = "font-size:11px; padding:4px 8px; width:auto;";
        osmImportBtn.addEventListener("click", () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json,application/json";
          input.addEventListener("change", () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const imported = JSON.parse(ev.target.result);
                osmCacheReplace(imported, true);
                osmInfo.textContent = `${osmCacheSize()} coords cached`;
                if (plotState.aggregationMode === "osm") { refreshAreaOptions(); renderPlots(); }
              } catch (err) { console.log("OSM cache import failed:", err); }
            };
            reader.readAsText(file);
          });
          input.click();
        });

        const osmClearBtn = document.createElement("button");
        osmClearBtn.textContent = "Clear & Re-fetch";
        osmClearBtn.style.cssText = "font-size:11px; padding:4px 8px; width:auto;";
        osmClearBtn.addEventListener("click", () => {
          clearOsmCache();
          osmInfo.textContent = `${osmCacheSize()} coords cached`;
          refreshAreaOptions(); renderPlots();
        });

        osmBtnWrap.appendChild(osmExportBtn);
        osmBtnWrap.appendChild(osmImportBtn);
        osmBtnWrap.appendChild(osmClearBtn);
        osmBlock.appendChild(osmBtnWrap);
        row.appendChild(osmBlock);

        // Date Range for Area chart
        const areaDateRangeBlock = makeControlBlock();
        areaDateRangeBlock.id = "wfns-area-date-range-block";
        areaDateRangeBlock.appendChild(makeControlLabel("Area Date Range"));
        // Fade + block if Date Range (Both) is active
        const _applyAreaRangeBlockedState = () => {
          const blocked = plotState.typeStatusRangeEnabled;
          areaDateRangeBlock.style.opacity = blocked ? "0.4" : "1";
          areaDateRangeBlock.style.pointerEvents = blocked ? "none" : "";
          areaDateRangeBlock.title = blocked ? "Date Range (Both) is On — disable it first" : "";
        };
        _applyAreaRangeBlockedState();
        const areaDateToggleWrap = document.createElement("div");
        areaDateToggleWrap.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:8px;";
        areaDateToggleWrap.innerHTML = `
          <label class="wfns-toggle-switch">
            <input type="checkbox" id="wfns-area-date-range-toggle" ${plotState.areaRangeEnabled ? "checked" : ""}>
            <span class="wfns-toggle-slider"></span>
          </label>
          <span id="wfns-area-date-range-text" style="font-size:12px;">${plotState.areaRangeEnabled ? "On" : "Off"}</span>
        `;
        areaDateRangeBlock.appendChild(areaDateToggleWrap);
        const areaDateInputsWrap = document.createElement("div");
        areaDateInputsWrap.id = "wfns-area-date-range-inputs";
        areaDateInputsWrap.style.cssText = `display:${plotState.areaRangeEnabled ? "flex" : "none"}; flex-direction:column; gap:6px;`;
        areaDateInputsWrap.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:10px; color:var(--wfns-text-muted,#888);">From</span>
            <input type="date" id="wfns-area-range-start" value="${plotState.areaRangeStart}" style="
              padding:3px 6px; border-radius:4px; font-size:11px;
              background:var(--wfns-input-bg); color:var(--wfns-input-text);
              border:1px solid var(--wfns-border); cursor:pointer;">
          </div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:10px; color:var(--wfns-text-muted,#888);">To</span>
            <input type="date" id="wfns-area-range-end" value="${plotState.areaRangeEnd}" style="
              padding:3px 6px; border-radius:4px; font-size:11px;
              background:var(--wfns-input-bg); color:var(--wfns-input-text);
              border:1px solid var(--wfns-border); cursor:pointer;">
          </div>
          <div id="wfns-area-range-info" style="font-size:10px; color:var(--wfns-text-muted,#888); margin-top:2px;"></div>
        `;
        areaDateRangeBlock.appendChild(areaDateInputsWrap);
        row.appendChild(areaDateRangeBlock);

        // Area filter, in the same box as the aggregation it depends on. Named
        // "Timeline Area" before, when it only affected that chart; it now gates
        // both, so the old name would be misleading.
        // Same label treatment as the block heading above it, so the two halves
        // of the box read as siblings rather than one looking like stray text.
        const areaFilterHeading = makeControlLabel("Show Area");
        areaFilterHeading.style.marginTop = "12px";
        aggBlock.appendChild(areaFilterHeading);

        const timelineAreaBlock = aggBlock;
        const timelineAreaSelect = document.createElement("select");
        timelineAreaSelect.id = "wfns-timeline-area";
        // 140px clipped names like "Ho Chi Minh City, Vietnam". Let it size to the
        // content, with a cap so one very long label cannot stretch the row.
        timelineAreaSelect.style.cssText =
          "padding: 4px 6px; border-radius: 4px; width: 100%; min-width: 150px; max-width: 260px;";
        const allAreaOpt = document.createElement("option");
        allAreaOpt.value = "__ALL__"; allAreaOpt.textContent = "All areas";
        timelineAreaSelect.appendChild(allAreaOpt);
        timelineAreaBlock.appendChild(timelineAreaSelect);

        // Province-only checkbox
        const provinceOnlyLabel = document.createElement("label");
        provinceOnlyLabel.style.cssText = "display:flex; align-items:center; gap:6px; margin-top:8px; cursor:pointer; font-size:11px; color:var(--wfns-text);";
        const provinceOnlyCb = document.createElement("input");
        provinceOnlyCb.type = "checkbox";
        provinceOnlyCb.id = "wfns-province-only";
        provinceOnlyCb.checked = plotState.timelineAreaProvinceOnly;
        provinceOnlyLabel.appendChild(provinceOnlyCb);
        provinceOnlyLabel.appendChild(document.createTextNode("City/Province level only"));
        timelineAreaBlock.appendChild(provinceOnlyLabel);
      }));

      // ── Section 4: Chart ──────────────────────────────────────────────────────
      controls.appendChild(makeSection("Chart", (row) => {
        // Date Range
        const dateRangeBlock = makeControlBlock();
        dateRangeBlock.id = "wfns-chart-date-range-block";
        dateRangeBlock.appendChild(makeControlLabel("Date Range"));
        // Fade + block if Date Range (Both) is active
        const _applyChartRangeBlockedState = () => {
          const blocked = plotState.typeStatusRangeEnabled;
          dateRangeBlock.style.opacity = blocked ? "0.4" : "1";
          dateRangeBlock.style.pointerEvents = blocked ? "none" : "";
          dateRangeBlock.title = blocked ? "Date Range (Both) is On — disable it first" : "";
        };
        _applyChartRangeBlockedState();
        const dateRangeToggleWrap = document.createElement("div");
        dateRangeToggleWrap.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:8px;";
        dateRangeToggleWrap.innerHTML = `
          <label class="wfns-toggle-switch">
            <input type="checkbox" id="wfns-date-range-toggle" ${plotState.timelineRangeEnabled ? "checked" : ""}>
            <span class="wfns-toggle-slider"></span>
          </label>
          <span id="wfns-date-range-text" style="font-size:12px;">${plotState.timelineRangeEnabled ? "On" : "Off"}</span>
        `;
        dateRangeBlock.appendChild(dateRangeToggleWrap);
        const dateInputsWrap = document.createElement("div");
        dateInputsWrap.id = "wfns-date-range-inputs";
        dateInputsWrap.style.cssText = `display:${plotState.timelineRangeEnabled ? "flex" : "none"}; flex-direction:column; gap:6px;`;
        dateInputsWrap.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:10px; color:var(--wfns-text-muted,#888);">From</span>
            <input type="date" id="wfns-range-start" value="${plotState.timelineRangeStart}" style="
              padding:3px 6px; border-radius:4px; font-size:11px;
              background:var(--wfns-input-bg); color:var(--wfns-input-text);
              border:1px solid var(--wfns-border); cursor:pointer;">
          </div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:10px; color:var(--wfns-text-muted,#888);">To</span>
            <input type="date" id="wfns-range-end" value="${plotState.timelineRangeEnd}" style="
              padding:3px 6px; border-radius:4px; font-size:11px;
              background:var(--wfns-input-bg); color:var(--wfns-input-text);
              border:1px solid var(--wfns-border); cursor:pointer;">
          </div>
          <div id="wfns-range-info" style="font-size:10px; color:var(--wfns-text-muted,#888); margin-top:2px;"></div>
        `;
        dateRangeBlock.appendChild(dateInputsWrap);
        row.appendChild(dateRangeBlock);

        // Timeline mode (monthly/cumulative)
        const timelineModeBlock = makeControlBlock();
        timelineModeBlock.appendChild(makeControlLabel("Timeline Mode"));
        [["monthly", "Monthly"], ["cumulative", "Cumulative"]].forEach(([val, text]) => {
          const lbl = document.createElement("label");
          lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
          lbl.innerHTML = `<input type="radio" name="wfns-timeline-mode" value="${val}" ${plotState.timelineMode === val ? "checked" : ""}> ${text}`;
          timelineModeBlock.appendChild(lbl);
        });
        row.appendChild(timelineModeBlock);

        // Show Numbers toggle
        const dataLabelsBlock = makeControlBlock();
        dataLabelsBlock.appendChild(makeControlLabel("Show Numbers"));
        const toggleWrap = document.createElement("div");
        toggleWrap.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px;";
        toggleWrap.innerHTML = `
          <label class="wfns-toggle-switch">
            <input type="checkbox" id="wfns-data-labels-toggle" ${plotState.showDataLabels ? "checked" : ""}>
            <span class="wfns-toggle-slider"></span>
          </label>
          <span id="wfns-data-labels-text" style="font-size:12px;">${plotState.showDataLabels ? "On" : "Off"}</span>
        `;
        dataLabelsBlock.appendChild(toggleWrap);
        row.appendChild(dataLabelsBlock);

        // Timeline width preference uses the original saved view-mode field.
        const viewModeBlock = makeControlBlock();
        viewModeBlock.appendChild(makeControlLabel("Timeline Width"));
        for (const [value, text] of [["auto", "Auto"], ["responsive", "Fit"], ["scrollable", "Scrollable"]]) {
          const label = document.createElement("label");
          label.style.cssText = "display:block;margin-bottom:6px;cursor:pointer;";
          const input = document.createElement("input"); input.type = "radio";
          input.name = "wfns-chart-view"; input.value = value; input.checked = plotState.timelineViewMode === value;
          label.append(input, document.createTextNode(text)); viewModeBlock.appendChild(label);
        }
        row.appendChild(viewModeBlock);

      }));

      // ── Populate timeline area dropdown ───────────────────────────────────────
      const timelineAreaSelect = controls.querySelector("#wfns-timeline-area");
      if (timelineAreaSelect) {
        const areas = getAvailableAreas(nominations);

        if (
          plotState.timelineAreaFilter !== "__ALL__" &&
          !areas.includes(plotState.timelineAreaFilter)
        ) {
          plotState.timelineAreaFilter = "__ALL__";
        }

        areas.forEach(area => {
          const option = document.createElement("option");
          option.value = area;
          option.textContent = area;
          timelineAreaSelect.appendChild(option);
        });

        timelineAreaSelect.value = plotState.timelineAreaFilter;

        timelineAreaSelect.addEventListener("change", (e) => {
          plotState.timelineAreaFilter = e.target.value;
          renderPlots();
        });
      }

      // Province-only checkbox listener
      const provinceOnlyCbEl = controls.querySelector("#wfns-province-only");
      if (provinceOnlyCbEl) {
        provinceOnlyCbEl.addEventListener("change", (e) => {
          plotState.timelineAreaProvinceOnly = e.target.checked;
          plotState.timelineAreaFilter = "__ALL__"; // reset selection when mode changes
          // Repopulate the dropdown
          const sel = controls.querySelector("#wfns-timeline-area");
          if (sel) {
            // Clear all options except "All areas"
            while (sel.options.length > 1) sel.remove(1);
            const newAreas = getAvailableAreas(nominations);
            newAreas.forEach(area => {
              const opt = document.createElement("option");
              opt.value = area; opt.textContent = area;
              sel.appendChild(opt);
            });
            sel.value = "__ALL__";
          }
          renderPlots();
        });
      }

      // Event listeners
      controls.querySelectorAll("input[data-status-color]").forEach(input => {
        input.addEventListener("input", (e) => {
          STATUS_COLORS[e.target.dataset.statusColor] = e.target.value;
          saveStatusColors();
          renderPlots();
        });
      });

      const resetColourBtn = controls.querySelector("#wfns-reset-colours");
      if (resetColourBtn) {
        resetColourBtn.addEventListener("click", () => {
          Object.keys(DEFAULT_STATUS_COLORS).forEach(status => {
            STATUS_COLORS[status] = DEFAULT_STATUS_COLORS[status];
          });
          saveStatusColors();
          controls.querySelectorAll("input[data-status-color]").forEach(input => {
            input.value = STATUS_COLORS[input.dataset.statusColor] || "#888888";
          });
          renderPlots();
        });
      }

      controls.querySelectorAll('input[name="wfns-agg"]').forEach(input => {
        input.addEventListener("change", (e) => {
          plotState.aggregationMode = e.target.value;
          plotState.timelineAreaFilter = "__ALL__";
          renderPlotControls();
          renderPlots();
        });
      });

      controls.querySelectorAll('input[name="wfns-timeline-mode"]').forEach(input => {
        input.addEventListener("change", (e) => {
          plotState.timelineMode = e.target.value;
          renderPlots();
        });
      });

      controls.querySelectorAll("input[data-chart-scope]").forEach(input => {
        input.addEventListener("change", (e) => {
          const scopeKey = e.target.dataset.chartScope;
          if (!(plotState.visibleChartScopes instanceof Set)) syncVisibleChartScopes();

          if (e.target.checked) {
            plotState.visibleChartScopes.add(scopeKey);
          } else if (plotState.visibleChartScopes.size <= 1) {
            e.target.checked = true;
            return;
          } else {
            plotState.visibleChartScopes.delete(scopeKey);
          }

          renderPlots();
        });
      });

      controls.querySelectorAll("input[data-type]").forEach(input => {
        input.addEventListener("change", (e) => {
          const type = e.target.dataset.type;
          if (e.target.checked) {
            plotState.selectedTypes.add(type);
          } else {
            plotState.selectedTypes.delete(type);
          }
          syncVisibleChartScopes();
          renderPlots();
        });
      });

      controls.querySelectorAll("input[data-status]").forEach(input => {
        input.addEventListener("change", (e) => {
          const status = e.target.dataset.status;
          if (e.target.checked) {
            plotState.selectedStatuses.add(status);
          } else {
            plotState.selectedStatuses.delete(status);
          }
          renderPlots();
        });
      });

      // Data labels toggle listener
      const dataLabelsToggle = controls.querySelector("#wfns-data-labels-toggle");
      if (dataLabelsToggle) {
        dataLabelsToggle.addEventListener("change", (e) => {
          plotState.showDataLabels = e.target.checked;
          const span = controls.querySelector("#wfns-data-labels-text");
          if (span) span.textContent = plotState.showDataLabels ? "On" : "Off";
          renderPlots();
        });
      }

      // All submissions toggle listener
      const allSubToggle = controls.querySelector("#wfns-all-submissions-toggle");
      if (allSubToggle) {
        allSubToggle.addEventListener("change", (e) => {
          plotState.showAllSubmissions = e.target.checked;
          const span = controls.querySelector("#wfns-all-submissions-text");
          if (span) span.textContent = plotState.showAllSubmissions ? "On" : "Off";
          renderPlots();
        });
      }

      // All submissions area chart toggle listener
      const allSubAreaToggle = controls.querySelector("#wfns-all-submissions-area-toggle");
      if (allSubAreaToggle) {
        allSubAreaToggle.addEventListener("change", (e) => {
          plotState.showAllSubmissionsArea = e.target.checked;
          const span = controls.querySelector("#wfns-all-submissions-area-text");
          if (span) span.textContent = plotState.showAllSubmissionsArea ? "On" : "Off";
          renderPlots();
        });
      }

      // Chart view mode listener
      controls.querySelectorAll('input[name="wfns-chart-view"]').forEach(input => {
        input.addEventListener("change", (e) => {
          plotState.timelineViewMode = e.target.value;
          renderPlots();
        });
      });

      // Date range toggle listener
      const dateRangeToggle = controls.querySelector("#wfns-date-range-toggle");
      const dateRangeInputsWrap = controls.querySelector("#wfns-date-range-inputs");
      if (dateRangeToggle) {
        dateRangeToggle.addEventListener("change", (e) => {
          plotState.timelineRangeEnabled = e.target.checked;
          const span = controls.querySelector("#wfns-date-range-text");
          if (span) span.textContent = plotState.timelineRangeEnabled ? "On" : "Off";
          if (dateRangeInputsWrap) {
            dateRangeInputsWrap.style.display = plotState.timelineRangeEnabled ? "flex" : "none";
          }
          renderPlots();
        });
      }

      // Date input listeners
      const rangeStartInput = controls.querySelector("#wfns-range-start");
      const rangeEndInput   = controls.querySelector("#wfns-range-end");
      if (rangeStartInput) {
        rangeStartInput.addEventListener("change", (e) => {
          plotState.timelineRangeStart = e.target.value;
          renderPlots();
        });
      }
      if (rangeEndInput) {
        rangeEndInput.addEventListener("change", (e) => {
          plotState.timelineRangeEnd = e.target.value;
          renderPlots();
        });
      }

      // maxBarsSelect listener — query from DOM since it's built inside a closure
      controls.querySelectorAll('input[name="wfns-bar-scale"]').forEach(input => {
        input.addEventListener("change", (e) => {
          if (!e.target.checked) return;
          plotState.areaBarScale = e.target.value;
          try { localStorage.setItem(BAR_SCALE_KEY, plotState.areaBarScale); }
          catch (err) { /* private mode or full storage */ }
          renderPlots();
        });
      });

      const maxBarsSelectEl = controls.querySelector("#wfns-max-bars");
      if (maxBarsSelectEl) {
        maxBarsSelectEl.addEventListener("change", (e) => {
          plotState.maxBars = e.target.value === "all" ? "all" : Number(e.target.value);
          renderPlots();
        });
      }

      // Type/Status date range listeners (affects both charts)
      const tsDateRangeToggle = controls.querySelector("#wfns-ts-date-range-toggle");
      const tsDateInputsWrapEl = controls.querySelector("#wfns-ts-date-range-inputs");
      if (tsDateRangeToggle) {
        tsDateRangeToggle.addEventListener("change", (e) => {
          plotState.typeStatusRangeEnabled = e.target.checked;
          const span = controls.querySelector("#wfns-ts-date-range-text");
          if (span) span.textContent = plotState.typeStatusRangeEnabled ? "On" : "Off";
          if (tsDateInputsWrapEl) {
            tsDateInputsWrapEl.style.display = plotState.typeStatusRangeEnabled ? "flex" : "none";
          }
          // When turning On: force area/chart ranges off and fade them
          if (plotState.typeStatusRangeEnabled) {
            plotState.areaRangeEnabled = false;
            plotState.timelineRangeEnabled = false;
          }
          // Refresh blocked state for area date range block
          const areaBlock = controls.querySelector("#wfns-area-date-range-block");
          if (areaBlock) {
            const blocked = plotState.typeStatusRangeEnabled;
            areaBlock.style.opacity = blocked ? "0.4" : "1";
            areaBlock.style.pointerEvents = blocked ? "none" : "";
            areaBlock.title = blocked ? "Date Range (Both) is On — disable it first" : "";
          }
          // Refresh blocked state for chart date range block
          const chartBlock = controls.querySelector("#wfns-chart-date-range-block");
          if (chartBlock) {
            const blocked = plotState.typeStatusRangeEnabled;
            chartBlock.style.opacity = blocked ? "0.4" : "1";
            chartBlock.style.pointerEvents = blocked ? "none" : "";
            chartBlock.title = blocked ? "Date Range (Both) is On — disable it first" : "";
          }
          renderPlots();
        });
      }
      const tsRangeStartInput = controls.querySelector("#wfns-ts-range-start");
      const tsRangeEndInput   = controls.querySelector("#wfns-ts-range-end");
      if (tsRangeStartInput) {
        tsRangeStartInput.addEventListener("change", (e) => {
          plotState.typeStatusRangeStart = e.target.value;
          renderPlots();
        });
      }
      if (tsRangeEndInput) {
        tsRangeEndInput.addEventListener("change", (e) => {
          plotState.typeStatusRangeEnd = e.target.value;
          renderPlots();
        });
      }

      // Area date range listeners
      const areaDateRangeToggle = controls.querySelector("#wfns-area-date-range-toggle");
      const areaDateInputsWrapEl = controls.querySelector("#wfns-area-date-range-inputs");
      if (areaDateRangeToggle) {
        areaDateRangeToggle.addEventListener("change", (e) => {
          plotState.areaRangeEnabled = e.target.checked;
          const span = controls.querySelector("#wfns-area-date-range-text");
          if (span) span.textContent = plotState.areaRangeEnabled ? "On" : "Off";
          if (areaDateInputsWrapEl) {
            areaDateInputsWrapEl.style.display = plotState.areaRangeEnabled ? "flex" : "none";
          }
          renderPlots();
        });
      }
      const areaRangeStartInput = controls.querySelector("#wfns-area-range-start");
      const areaRangeEndInput   = controls.querySelector("#wfns-area-range-end");
      if (areaRangeStartInput) {
        areaRangeStartInput.addEventListener("change", (e) => {
          plotState.areaRangeStart = e.target.value;
          renderPlots();
        });
      }
      if (areaRangeEndInput) {
        areaRangeEndInput.addEventListener("change", (e) => {
          plotState.areaRangeEnd = e.target.value;
          renderPlots();
        });
      }
      // Export buttons are wired directly inside the makeSection closure above.
      arrangeSettingsControls();
      if (view) view.scrollTop = oldScroll;
      if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
      syncSettingTabs();
      stabilizeSettingsHeight();
    }

    function getSelectedTypesInOrder() {
      return PLOT_TYPE_OPTIONS.filter(type => plotState.selectedTypes.has(type));
    }

    function getTypeTitle(type) {
      return TYPE_TITLE_DISPLAY[type] || TYPE_DISPLAY[type] || type;
    }

    function getTypesTitle(types) {
      return types.map(getTypeTitle).join(", ");
    }

    function getChartScopeOptions() {
      return [{ key: CHART_SCOPE_ALL_SELECTED, types: getSelectedTypesInOrder(), label: "All Submissions", titleLabel: "All Submissions", filenamePart: "all-submissions" },
        ...PLOT_TYPE_OPTIONS.map(type => ({
          key: type, types: [type], label: TYPE_DISPLAY[type], titleLabel: TYPE_DISPLAY[type],
          filenamePart: type.toLowerCase().replace(/_/g, "-")
        }))];
    }

    function syncVisibleChartScopes() {
      // All = every group; a category tab = just that group. Type/Status filters
      // still constrain every group, including the combined submissions group.
      const options = getChartScopeOptions();
      if (plotState.chartGroup !== "all" && !options.some(scope => scope.key === plotState.chartGroup)) plotState.chartGroup = "all";
      plotState.visibleChartScopes = new Set(options.filter(scope => plotState.chartGroup === "all" || scope.key === plotState.chartGroup).map(scope => scope.key));
    }

    function getVisibleChartScopes() {
      syncVisibleChartScopes();
      const options = getChartScopeOptions();
      if (plotState.chartGroup !== "all") return options.filter(scope => scope.key === plotState.chartGroup);
      // Checkboxes control the combined/All view. Named tabs always retain
      // their own type and the same status, area and date filters.
      return options.filter(scope => (scope.key === CHART_SCOPE_ALL_SELECTED || plotState.selectedTypes.has(scope.key)) && prepareScopeData(scope).hasVisibleData);
    }

    function nominationMatchesChartScope(nomination, chartScope) {
      if (!chartScope || !chartScope.types || !chartScope.types.length) return false;
      return chartScope.types.some(type => nominationMatchesSelectedType(nomination, type));
    }

    function getChartScopeFilenamePart(chartScope) {
      if (!chartScope) return "unknown";
      return chartScope.filenamePart || String(chartScope.key).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    }

    /**
     * Per-nomination values that used to be recomputed on every pass.
     *
     * Both charts walk the whole list, once per visible chart type, and each walk
     * asked for the area label and the day key again. They are pure functions of
     * the nomination plus the current mode, so they are cached on the object and
     * thrown away when the mode or the geocode cache changes.
     */
    function getAreaLabelCached(nomination, aggregationMode) {
      const version = aggregationMode === "osm" ? osmCacheVersion : 0;
      const previous = nominationAreaCache.get(nomination);
      if (previous && previous.mode === aggregationMode && previous.version === version &&
          previous.city === nomination.city && previous.state === nomination.state &&
          previous.lat === nomination.lat && previous.lng === nomination.lng) return previous.label;
      const label = getAreaLabel(nomination, aggregationMode);
      nominationAreaCache.set(nomination, { mode: aggregationMode, version,
        city: nomination.city, state: nomination.state, lat: nomination.lat, lng: nomination.lng, label });
      return label;
    }

    function getAreaLabel(nomination, aggregationMode) {
      if (aggregationMode === "osm") {
        if (nomination.lat != null && nomination.lng != null) {
          const cached = osmCacheGet(nomination.lat, nomination.lng);
          if (cached) return cached;
        }
        // Not yet cached — group all pending into one hidden bucket
        return "__OSM_PENDING__";
      }

      const city  = nomination.city  || "Unknown City";
      const state = nomination.state || "Unknown State";

      if (aggregationMode === "state") return state;
      return `${city}, ${state}`;
    }

    /**
     * Does this area label pass the current area filter?
     *
     * In province-only mode the filter holds a province-level label, so compare
     * the province part of the nomination's label rather than the whole thing.
     * Shared by both charts - previously only the timeline applied it, which is
     * why choosing an area never changed the bar chart.
     */
    function matchesAreaFilter(area) {
      const filter = plotState.timelineAreaFilter;
      if (!filter || filter === "__ALL__") return true;
      return (plotState.timelineAreaProvinceOnly ? getProvinceLevelLabel(area) : area) === filter;
    }

    function nominationMatchesSelectedType(nomination, selectedType) {
      return nomination.type === selectedType;
    }

    function buildStackedAreaData(nominations, chartScope, selectedStatuses = plotState.selectedStatuses) {
      const result = {};
      const totalByArea = {}; // total submissions per area inside this chart's type scope

      // Area date-range gate
      let areaRangeStart = null, areaRangeEnd = null;
      if (plotState.areaRangeEnabled && plotState.areaRangeStart && plotState.areaRangeEnd) {
        areaRangeStart = parseDay(plotState.areaRangeStart);
        areaRangeEnd   = parseDay(plotState.areaRangeEnd);
        if (isNaN(areaRangeStart) || isNaN(areaRangeEnd) || areaRangeStart > areaRangeEnd) {
          areaRangeStart = null; areaRangeEnd = null;
        }
      }

      // Type/Status shared date-range gate
      let tsRangeStart = null, tsRangeEnd = null;
      if (plotState.typeStatusRangeEnabled && plotState.typeStatusRangeStart && plotState.typeStatusRangeEnd) {
        tsRangeStart = parseDay(plotState.typeStatusRangeStart);
        tsRangeEnd   = parseDay(plotState.typeStatusRangeEnd);
        if (isNaN(tsRangeStart) || isNaN(tsRangeEnd) || tsRangeStart > tsRangeEnd) {
          tsRangeStart = null; tsRangeEnd = null;
        }
      }

      nominations.forEach(nomination => {
        if (!nomination) return;

        if (!nominationMatchesChartScope(nomination, chartScope)) return;

        // Apply type/status shared date range
        if (tsRangeStart && tsRangeEnd) {
          const dayKey = getDayKey(nomination);
          if (dayKey === "Unknown") return;
          const nomDate = parseDay(dayKey);
          if (nomDate < tsRangeStart || nomDate > tsRangeEnd) return;
        }

        // Apply area date range
        if (areaRangeStart && areaRangeEnd) {
          const dayKey = getDayKey(nomination);
          if (dayKey === "Unknown") return;
          const nomDate = parseDay(dayKey);
          if (nomDate < areaRangeStart || nomDate > areaRangeEnd) return;
        }

        const area = getAreaLabelCached(nomination, plotState.aggregationMode);
        if (!matchesAreaFilter(area)) return;

        // Track this chart's total per area across all statuses.
        totalByArea[area] = (totalByArea[area] || 0) + 1;

        // Only count selected statuses for the stacked bar
        if (!selectedStatuses.has(nomination.status)) return;

        if (!result[area]) result[area] = {};
        if (!result[area][nomination.status]) result[area][nomination.status] = 0;
        result[area][nomination.status] += 1;
      });

      // Attach total counts to each area entry so renderVerticalStackedBarChart can use them
      Object.keys(totalByArea).forEach(area => {
        if (!result[area]) result[area] = {};
        result[area].__areaTotal__ = totalByArea[area];
      });

      return result;
    }


    const OTHER_AREA_LABEL = "Other";

    function getTopAreas(stackedData, maxBars = 20) {
      const showAll = plotState.showAllSubmissionsArea;
      const rows = Object.entries(stackedData)
        .map(([area, counts]) => {
          const areaTotal = counts.__areaTotal__ || 0;
          const total = Object.entries(counts)
            .filter(([k]) => k !== "__areaTotal__")
            .reduce((sum, [, val]) => sum + val, 0);
          return { area, counts, total, areaTotal };
        })
        // When showAll is on, include areas that have submissions even if selected total = 0
        .filter(row => showAll ? row.areaTotal > 0 : row.total > 0);

      // Anything without a real area - not geocoded yet, or no city/state on the
      // record - used to be dropped, which quietly under-counted the chart. Roll
      // it into one bar instead so the numbers still add up.
      const named = [];
      const other = { area: OTHER_AREA_LABEL, counts: {}, total: 0, areaTotal: 0 };
      let hasOther = false;

      rows.forEach(row => {
        if (isUnknownArea(row.area)) {
          hasOther = true;
          Object.keys(row.counts).forEach(key => {
            if (key === "__areaTotal__") return;
            other.counts[key] = (other.counts[key] || 0) + row.counts[key];
          });
          other.total += row.total;
          other.areaTotal += row.areaTotal;
        } else {
          named.push(row);
        }
      });

      named.sort((a, b) => showAll ? b.areaTotal - a.areaTotal : b.total - a.total);

      const limited = maxBars === "all" ? named : named.slice(0, maxBars);
      // "Other" always sits last rather than competing for a place in the top N.
      if (hasOther) limited.push(other);
      return limited;
    }

    /** Areas with nothing usable to group by, shown together as "Other". */
    function isUnknownArea(area) {
      if (!area) return true;
      if (area === "__OSM_PENDING__") return true;
      return /unknown/i.test(area);
    }

    const DEFAULT_STATUS_COLORS = {
      ACCEPTED: "#4caf50",
      REJECTED: "#f44336",
      DUPLICATE: "#ff9800",
      VOTING: "#2196f3",
      NOMINATED: "#9c27b0",
      NIANTIC_REVIEW: "#795548",
      APPEALED: "#009688",
      WITHDRAWN: "#607d8b",
      HELD: "#ffc107"
    };

    // Live colour table. Same shape as before, so every reader keeps working; it
    // is just seeded from saved overrides and mutated in place when one changes.
    const STATUS_COLORS = Object.assign({}, DEFAULT_STATUS_COLORS, loadStatusColors());

    function loadStatusColors() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STATUS_COLOR_KEY) || "null");
        if (!parsed || typeof parsed !== "object") return {};
        const clean = {};
        Object.keys(parsed).forEach(status => {
          // Only accept #rgb / #rrggbb, so a bad value can never reach the DOM.
          if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(parsed[status])) clean[status] = parsed[status];
        });
        return clean;
      } catch (e) {
        return {};
      }
    }

    function saveStatusColors() {
      try {
        const overrides = {};
        Object.keys(STATUS_COLORS).forEach(status => {
          if (STATUS_COLORS[status] !== DEFAULT_STATUS_COLORS[status]) {
            overrides[status] = STATUS_COLORS[status];
          }
        });
        localStorage.setItem(STATUS_COLOR_KEY, JSON.stringify(overrides));
      } catch (e) {
        /* storage unavailable - colours still apply for this session */
      }
    }

    function makeChartHeader(titleText, onExport, scope = null) {
      const header = document.createElement("div"); header.className = "wfns-chart-header";
      const labels = document.createElement("div"); labels.className = "wfns-chart-heading";
      const line = document.createElement("div"); line.className = "wfns-chart-title-line";
      const title = document.createElement("div"); title.className = "wfns-chart-title"; title.textContent = titleText;
      line.appendChild(title);
      if (scope) {
        const date = document.createElement("span"); date.className = "wfns-chart-date";
        date.textContent = chartDateRange(titleText === "Areas Chart" ? "area" : "timeline", scope);
        date.title = "Data date range"; line.appendChild(date);
      }
      labels.appendChild(line);
      const context = chartContext(scope);
      if (context) { const detail = document.createElement("div"); detail.className = "wfns-chart-subtitle"; detail.textContent = context; labels.appendChild(detail); }
      header.appendChild(labels);
      if (onExport) {
        const button = document.createElement("button"); button.type = "button"; button.className = "wfns-chart-export-button";
        button.textContent = "PNG"; button.title = "Download this chart as a PNG"; button.addEventListener("click", onExport); header.appendChild(button);
      }
      return header;
    }

    function getAreaTitle(chartScope) {
      return `All Areas, ${chartScope.titleLabel} by Area`;
    }

    function getTimelineTitlePrefix() {
      return plotState.timelineMode === "cumulative"
        ? "Cumulative Timeline"
        : "Timeline";
    }

    function getTimelineAreaTitle() {
      return plotState.timelineAreaFilter && plotState.timelineAreaFilter !== "__ALL__"
        ? plotState.timelineAreaFilter
        : "All Areas";
    }

    function renderVerticalStackedBarChart(areaRows, chartScope, append = false, target = null) {
      const chart = target || document.getElementById("wfns-plot-chart");
      if (!chart) return;

      if (!append) disposeChartSlot(chart);

      if (!areaRows.length) {
        const empty = document.createElement("div");
        empty.className = "wfns-chart-card";
        empty.appendChild(makeChartHeader("Areas Chart", null, chartScope));
        const message = document.createElement("div");
        message.textContent = "No data for the selected area, statuses and date range.";
        empty.appendChild(message);
        chart.appendChild(empty);
        return;
      }

      // Colours come from the panel's CSS tokens rather than a class sniff, so
      // the chart always matches the rest of the panel - including when the
      // Theme control overrides what the page is doing.
      const C_TEXT   = themeColor("--wfns-text", "#000000");
      const C_MUTED  = themeColor("--wfns-text-muted", "#555555");
      const C_FRAME  = themeColor("--wfns-bar-frame", "#8a8a8a");
      const C_BLANK  = themeColor("--wfns-bar-blank", "#e0e0e0");
      const C_SVG_BG = themeColor("--wfns-svg-bg", "#ffffff");
      const C_BORDER = themeColor("--wfns-border", "#dddddd");

      const showAll = plotState.showAllSubmissionsArea;

      // When showAll is on, scale bars relative to the area's grand total; otherwise selected total
      const maxTotal = showAll
        ? Math.max(...areaRows.map(row => row.areaTotal || row.total))
        : Math.max(...areaRows.map(row => row.total));

      const outer = document.createElement("div");
      outer.className = "wfns-chart-card";

      // Update area range info hint
      const areaRangeInfoEl = document.getElementById("wfns-area-range-info");
      const tsRangeInfoEl   = document.getElementById("wfns-ts-range-info");
      const _updateRangeInfoEl = (el, enabled, start, end) => {
        if (!el) return;
        if (enabled && start && end) {
          const s = new Date(start), e = new Date(end);
          if (!isNaN(s) && !isNaN(e) && s <= e) {
            const g = computeRangeGranularity(s, e);
            el.textContent = g.granularity === "day"
              ? `Day view — ${g.totalDays} days`
              : `Month view — ${g.totalDays} days span`;
          } else { el.textContent = ""; }
        } else { el.textContent = ""; }
      };
      _updateRangeInfoEl(areaRangeInfoEl, plotState.areaRangeEnabled, plotState.areaRangeStart, plotState.areaRangeEnd);
      _updateRangeInfoEl(tsRangeInfoEl, plotState.typeStatusRangeEnabled, plotState.typeStatusRangeStart, plotState.typeStatusRangeEnd);

      const areaDateRangeText = (plotState.areaRangeEnabled && plotState.areaRangeStart && plotState.areaRangeEnd)
        ? ` [${plotState.areaRangeStart} → ${plotState.areaRangeEnd}]` : "";
      const tsDateRangeText = (plotState.typeStatusRangeEnabled && plotState.typeStatusRangeStart && plotState.typeStatusRangeEnd)
        ? ` [${plotState.typeStatusRangeStart} → ${plotState.typeStatusRangeEnd}]` : "";
      outer.appendChild(makeChartHeader(
        "Areas Chart",
        () => exportAreaPlotAsPng(outer, chartScope), chartScope
      ));

      // -- The bars, drawn as one SVG ---------------------------------------
      // These used to be nested divs, so every bar's geometry came out of the
      // flex layout. At a fractional device-pixel ratio - Windows display
      // scaling at 125% or 150% - a 42px bar is 52.5 device pixels, and each
      // bar's edges rounded independently depending on where it landed. That is
      // what made the stripes look nudged a pixel left or right from bar to bar.
      // One SVG with integer coordinates and shape-rendering="crispEdges" puts
      // every bar on the same grid by construction, at any zoom or scaling.
      const SVG_NS    = "http://www.w3.org/2000/svg";
      const BAR_W     = 42;
      const COL_W     = 72;
      const COL_GAP   = 12;
      const PAD_X     = 10;
      const BAR_MAX   = 220;
      const COUNT_H   = 18;   // room for the count above each bar
      const LABEL_H   = 60;   // room for the wrapped area name
      const PAD_TOP   = 10;
      const PAD_BOT   = 6;
      const LINE_H    = 13;
      const MAX_LINES = Math.floor(LABEL_H / LINE_H);

      const baselineY = PAD_TOP + COUNT_H + BAR_MAX;
      const labelTop  = baselineY + 8;
      const svgHeight = labelTop + LABEL_H + PAD_BOT;
      const svgWidth  = PAD_X * 2 + areaRows.length * COL_W +
                        Math.max(0, areaRows.length - 1) * COL_GAP;

      const barsWrap = document.createElement("div");
      barsWrap.className = "wfns-bars-wrap";
      barsWrap.style.cssText = `
        padding: 12px 0 4px 0;
        border-bottom: 1px solid ${C_BORDER};
        overflow-x: auto;
      `;

      const svgEl = (name, attrs) => {
        const el = document.createElementNS(SVG_NS, name);
        Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
        return el;
      };
      const svgTitle = (el, text) => {
        const t = document.createElementNS(SVG_NS, "title");
        t.textContent = text;
        el.setAttribute("aria-label", text);
        return el;
      };
      const svgLabel = (attrs, text) => {
        const el = svgEl("text", attrs);
        el.textContent = text;
        return el;
      };

      const svg = svgEl("svg", {
        width: svgWidth,
        height: svgHeight,
        viewBox: `0 0 ${svgWidth} ${svgHeight}`,
        "shape-rendering": "crispEdges"
      });
      svg.style.cssText = `display:block; background:${C_SVG_BG};`;
      svg.setAttribute("font-family", "Arial, sans-serif");

      function paintArea(targetSvg, start, end) {
        targetSvg.replaceChildren();
        areaRows.slice(start, end).forEach((row, offset) => {
        const index = start + offset;
        const denominator = showAll ? (row.areaTotal || row.total) : row.total;
        const barH = maxTotal > 0
          ? Math.round((plotState.areaBarScale === "proportional"
              ? (denominator / maxTotal)
              : areaBarScale(denominator, maxTotal)) * BAR_MAX)
          : 0;

        const colX   = PAD_X + index * (COL_W + COL_GAP);
        const midX   = colX + COL_W / 2;
        const barX   = colX + (COL_W - BAR_W) / 2;
        const barTop = baselineY - barH;

        const statusesInBar = PLOT_STATUS_TYPES
          .filter(status => plotState.selectedStatuses.has(status) && row.counts[status]);

        // The unselected remainder is the last weight when showAll is on, so the
        // whole bar is divided in one pass and the pixels always add up.
        const unselectedCount = showAll
          ? Math.max(0, (row.areaTotal || row.total) - row.total)
          : 0;
        const segWeights = statusesInBar.map(status => row.counts[status]);
        if (showAll) segWeights.push(unselectedCount);
        const segPixels = allocatePixels(segWeights, barH);

        // Frame around the column, hugging the bar and its two labels.
        const frameTop = Math.max(0, barTop - COUNT_H - 4);
        targetSvg.appendChild(svgEl("rect", {
          x: colX, y: frameTop,
          width: COL_W, height: (labelTop + LABEL_H) - frameTop,
          rx: 5, fill: "none",
          stroke: C_FRAME, "stroke-width": 1
        }));

        // The count, sitting directly on top of its bar.
        targetSvg.appendChild(svgLabel({
          x: midX, y: barTop - 6, "text-anchor": "middle",
          "font-size": showAll ? 10 : 12, fill: C_TEXT
        }, showAll ? `${row.total}/${row.areaTotal || row.total}` : String(row.total)));

        // Segments, stacked from the baseline up.
        let y = baselineY;
        segWeights.forEach((weight, i) => {
          const h = segPixels[i];
          if (h <= 0) return;
          y -= h;

          const isBlank = showAll && i === segWeights.length - 1;
          const status  = isBlank ? null : statusesInBar[i];
          const count   = isBlank ? unselectedCount : row.counts[status];

          targetSvg.appendChild(svgTitle(svgEl("rect", {
            x: barX, y: y, width: BAR_W, height: h,
            fill: isBlank ? C_BLANK : (STATUS_COLORS[status] || "#888")
          }), isBlank
            ? `${row.area} | Unselected statuses: ${count}`
            : `${row.area} | ${STATUS_DISPLAY[status] || status}: ${count}`));

          if (plotState.showDataLabels && h >= 14) {
            targetSvg.appendChild(svgLabel({
              x: barX + BAR_W / 2, y: y + h / 2 + 4, "text-anchor": "middle",
              "font-size": 10, "font-weight": 700, "pointer-events": "none",
              fill: isBlank ? C_MUTED : "#ffffff"
            }, String(count)));
          }
        });

        // Area name, wrapped by hand because SVG text does not wrap.
        const label = svgEl("text", {
          x: midX, y: labelTop + 11, "text-anchor": "middle",
          "font-size": 11, fill: C_TEXT
        });
        wrapSvgLabel(row.area, COL_W - 8, MAX_LINES).forEach((line, i) => {
          const tspan = svgEl("tspan", i ? { x: midX, dy: LINE_H } : { x: midX });
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        targetSvg.appendChild(svgTitle(label, row.area));
      });
      }
      let barFrame = 0;
      const paintVisible = () => {
        barFrame = 0;
        const start = Math.max(0, Math.floor(barsWrap.scrollLeft / (COL_W + COL_GAP)) - 2);
        const count = Math.ceil((barsWrap.clientWidth || chart.clientWidth || 600) / (COL_W + COL_GAP)) + 5;
        paintArea(svg, start, Math.min(areaRows.length, start + count));
      };
      requestAnimationFrame(paintVisible);
      barsWrap.addEventListener("scroll", () => {
        if (!barFrame) barFrame = requestAnimationFrame(() => { if (svg.isConnected) paintVisible(); });
      }, { passive: true });
      // Export in small SVG tiles. Even Max Bars=All never creates one huge DOM
      // tree or giant intermediate bitmap. The final PNG includes every bar.
      outer._wfnsAreaColumns = areaRows.length;
      outer._wfnsExportRowHeight = svgHeight;
      outer._wfnsColumnWidth = COL_W + COL_GAP;
      outer._wfnsExportTiles = function* (columns = 32) {
        for (let start = 0; start < areaRows.length; start += columns) {
          const end = Math.min(areaRows.length, start + columns);
          const x = start ? PAD_X + start * (COL_W + COL_GAP) : 0;
          const right = end === areaRows.length ? svgWidth : PAD_X + end * (COL_W + COL_GAP);
          const tile = svg.cloneNode(false);
          tile.setAttribute("viewBox", `${x} 0 ${right - x} ${svgHeight}`);
          tile.setAttribute("width", right - x);
          paintArea(tile, start, end);
          yield { svg: tile, x, width: right - x, height: svgHeight };
        }
      };

      barsWrap.appendChild(svg);
      outer.appendChild(barsWrap);

      const legend = document.createElement("div");
      legend.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 12px;
      `;

      Array.from(plotState.selectedStatuses).forEach(status => {
        const item = document.createElement("div");
        item.className = "wfns-legend-item";
        item.innerHTML = `
          <span style="display:inline-block;width:12px;height:12px;background:${STATUS_COLORS[status] || "#888"};border-radius:2px;"></span>
          <span>${STATUS_DISPLAY[status] || status}</span>
        `;
        legend.appendChild(item);
      });

      if (showAll) {
        const blankItem = document.createElement("div");
        blankItem.className = "wfns-legend-item";
        blankItem.innerHTML = `
          <span style="display:inline-block;width:12px;height:12px;background:${C_BLANK};border-radius:2px;border:1px solid ${C_FRAME};"></span>
          <span>Unselected (all submissions)</span>
        `;
        legend.appendChild(blankItem);
      }

      legend.className = "wfns-chart-legend";
      outer.appendChild(legend);
      chart.appendChild(outer);
      let fullCounts = null;
      const detailAt = index => {
        const row = areaRows[index];
        if (!row) return null;
        if (!fullCounts) fullCounts = buildStackedAreaData(nominations || [], chartScope, new Set(PLOT_STATUS_TYPES));
        let counts = fullCounts[row.area];
        if (row.area === OTHER_AREA_LABEL) {
          counts = Object.fromEntries(PLOT_STATUS_TYPES.map(key => [key, 0]));
          for (const [label, values] of Object.entries(fullCounts)) {
            if (isUnknownArea(label)) for (const key of PLOT_STATUS_TYPES) counts[key] += values[key] || 0;
          }
        }
        return { key: String(index), title: row.area, counts: counts || row.counts };
      };
      bindStatusPopupInteraction(svg, (event, pin) => {
        const box = svg.getBoundingClientRect();
        const x = (event.clientX - box.left) * svgWidth / (box.width || svgWidth);
        const index = Math.floor((x - PAD_X) / (COL_W + COL_GAP));
        const offset = x - PAD_X - index * (COL_W + COL_GAP);
        const detail = x >= PAD_X && x < svgWidth - PAD_X && offset < COL_W ? detailAt(index) : null;
        if (detail) showStatusPopup(svg, event, detail, pin); else hideStatusPopup();
      });
      outer._wfnsDispose = () => hideStatusPopup(svg);
    }

    function getMonthKey(nomination) {
      const day = nominationDateKey(nomination);
      return day === "Unknown" ? day : day.slice(0, 7);
    }

    function parseDay(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
      if (!match) return new Date(NaN);
      const date = new Date(0);
      date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      date.setUTCHours(0, 0, 0, 0);
      return date.toISOString().slice(0, 10) === value ? date : new Date(NaN);
    }

    function nominationDateKey(nomination) {
      if (!nomination || typeof nomination !== "object") return "Unknown";
      const sources = [nomination.day, nomination.lastUpdateTime, nomination.imageImportedAt];
      const stamps = sources.map(value => value instanceof Date ? value.getTime() : value);
      const previous = nominationDateCache.get(nomination);
      if (previous && stamps.every((value, i) => Object.is(value, previous.stamps[i]))) return previous.key;
      let key = "Unknown";
      for (const raw of sources) {
        if (raw == null || raw === "") continue;
        // The calendar date supplied by Wayfarer must not shift with the
        // viewer's timezone. The same rule applies to dates and ISO timestamps.
        if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}(?:$|[Tt ])/.test(raw)) {
          const day = raw.slice(0, 10);
          if (!isNaN(parseDay(day))) { key = day; break; }
          continue;
        }
        if (typeof raw !== "string" && typeof raw !== "number" && !(raw instanceof Date)) continue;
        const date = new Date(raw);
        if (!isNaN(date)) {
          key = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          break;
        }
      }
      nominationDateCache.set(nomination, { stamps, key });
      return key;
    }

    function getProvinceLevelLabel(label) {
      const parts = String(label).split(",").map(part => part.trim()).filter(Boolean);
      if (parts.length < 2) return String(label);
      return plotState.aggregationMode === "osm"
        ? parts.slice(parts.length >= 3 ? 1 : 0).join(", ")
        : parts[parts.length - 1];
    }

    function handleContributionResponse(payload) {
      if (!active || !payload || String(payload.method || "GET").toUpperCase() !== "GET" ||
          payload.ok === false || (payload.status != null && (payload.status < 200 || payload.status >= 300))) return;
      const known = WFMM.api?.ENDPOINT_IDS?.MANAGE_LIST;
      if (!(known && payload.endpointId === known) && !isManageListUrl(payload.url || payload.path || "")) return;
      let json = payload.responseJson;
      if (!json && typeof payload.responseText === "string") {
        try { json = JSON.parse(payload.responseText); } catch (_) { return; }
      }
      ingestManageJson(json);
    }

    function observeAlternateContributionResponses() {
      // Map Mods 5.3 publishes /api/v1/vault responses. Observe newer API
      // versions passively until the host publishes them too; never refetch.
      const alternate = url => String(url).includes("/vault/") && isManageListUrl(url) &&
        !new URL(String(url), window.location.origin).pathname.startsWith("/api/v1/vault/");
      const nativeFetch = window.fetch;
      if (typeof nativeFetch === "function") {
        const wrapped = function(input, options) {
          const result = nativeFetch.apply(this, arguments);
          const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url || "";
          const method = String(options?.method || input?.method || "GET").toUpperCase();
          if (active && method === "GET" && alternate(url)) {
            Promise.resolve(result).then(response => {
              if (!active || !response.ok) return;
              return response.clone().json().then(responseJson => handleContributionResponse({ url, method, ok: response.ok, status: response.status, responseJson }));
            }).catch(() => {});
          }
          return result;
        };
        window.fetch = wrapped;
        cleanups.push(() => { if (window.fetch === wrapped) window.fetch = nativeFetch; });
      }
      const prototype = window.XMLHttpRequest?.prototype;
      if (!prototype?.open) return;
      const nativeOpen = prototype.open, requests = new WeakMap(), pending = new Set();
      const wrappedOpen = function(method, url) {
        const result = nativeOpen.apply(this, arguments);
        const token = {}; requests.set(this, token);
        if (active && String(method).toUpperCase() === "GET" && alternate(url)) {
          const xhr = this;
          const record = { xhr, listener: null };
          record.listener = () => {
            pending.delete(record);
            if (!active || requests.get(xhr) !== token || xhr.status < 200 || xhr.status >= 300) return;
            try {
              const raw = xhr.response || xhr.responseText;
              handleContributionResponse({ url, method: "GET", status: xhr.status, ok: true,
                responseJson: typeof raw === "string" ? JSON.parse(raw) : raw });
            } catch (_) { /* Non-JSON responses leave the current charts intact. */ }
          };
          pending.add(record); xhr.addEventListener("loadend", record.listener, { once: true });
        }
        return result;
      };
      prototype.open = wrappedOpen;
      cleanups.push(() => {
        if (prototype.open === wrappedOpen) prototype.open = nativeOpen;
        for (const { xhr, listener } of pending) xhr.removeEventListener("loadend", listener);
        pending.clear();
      });
    }

    function validOsmCoordinates(lat, lng) {
      return ["number", "string"].includes(typeof lat) && ["number", "string"].includes(typeof lng) && String(lat).trim() !== "" && String(lng).trim() !== "" &&
        Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
    }

    function cleanOsmCache(store) {
      const entries = new Map();
      if (!store || typeof store !== "object" || Array.isArray(store)) return entries;
      for (const [key, value] of Object.entries(store)) {
        const parts = key.split(",");
        if (parts.length !== 2 || !validOsmCoordinates(parts[0], parts[1]) ||
            typeof value !== "string" || !value.trim() || isUnknownArea(value)) continue;
        entries.set(osmCacheKey(parts[0], parts[1]), value.trim());
      }
      return entries;
    }

    function osmCacheReplace(store, merge = false) {
      const cleaned = cleanOsmCache(store);
      const next = merge ? new Map(osmCacheLoad()) : new Map();
      for (const [key, value] of cleaned) next.set(key, value);
      osmCacheMap = next;
      osmCacheVersion++;
      osmCachePersist();
    }

    function clearOsmCache() {
      // Old responses may finish after Clear; they must not refill the cache.
      osmGeneration++;
      for (const item of osmQueue.splice(0)) item.resolve("Unknown");
      osmQueuedKeys.clear(); osmFailedUntil.clear();
      osmPendingCount = 0; osmDoneCount = 0;
      osmCacheReplace({});
      if (plotState.aggregationMode === "osm") osmStartPrewarm(nominations);
    }

    function getDayKey(nomination) {
      return nominationDateKey(nomination);
    }

    function buildContinuousDayRange(minDay, maxDay) {
      const days = [];
      const start = Date.parse(minDay + "T00:00:00Z");
      const end = Date.parse(maxDay + "T00:00:00Z");
      if (!Number.isFinite(start) || !Number.isFinite(end)) return days;
      for (let time = start; time <= end; time += 86400000) {
        days.push(new Date(time).toISOString().slice(0, 10));
      }
      return days;
    }

    // Daily data through 90 days; label spacing increases every 15 days.
    function computeRangeGranularity(startDate, endDate) {
      // Count civil dates, independently of daylight-saving clock changes.
      const totalDays = Math.round((endDate - startDate) / 86400000) + 1;
      const tickEvery = totalDays < 15 ? 1 : totalDays <= 30 ? 2 :
        totalDays <= 45 ? 3 : totalDays <= 60 ? 4 : totalDays <= 75 ? 5 : 6;
      return totalDays <= 90
        ? { granularity: "day", tickEvery, totalDays }
        : { granularity: "month", totalDays };
    }

    // Days in the month that contains dayKey ("YYYY-MM-DD").
    function daysInMonthForKey(dayKey) {
      const [y, m] = dayKey.split("-").map(Number);
      return new Date(y, m, 0).getDate();
    }

    // True when day dd (1-based) should get a label in midrange mode.
    // Rule: 1, 10, 20, last day of month — but skip 30 when the month has 31 days.
    function isMidrangeLabelDay(dd, daysInMonth) {
      if (dd === 1 || dd === 10 || dd === 20) return true;
      if (dd === daysInMonth && !(daysInMonth === 31 && dd === 30)) return true;
      return false;
    }

    function buildContinuousMonthRange(minMonth, maxMonth) {
      const months = [];
      if (!minMonth || !maxMonth) return months;
      let [year, month] = minMonth.split("-").map(Number);
      const [maxYear, maxMonthNum] = maxMonth.split("-").map(Number);
      while (year < maxYear || (year === maxYear && month <= maxMonthNum)) {
        months.push(`${year}-${String(month).padStart(2, "0")}`);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
      }
      return months;
    }

    function buildTimelineLineData(nominations, chartScope, selectedStatuses = plotState.selectedStatuses) {
      let startDay = null, endDay = null;
      for (const [enabled, start, end] of [
        [plotState.typeStatusRangeEnabled, plotState.typeStatusRangeStart, plotState.typeStatusRangeEnd],
        [plotState.timelineRangeEnabled, plotState.timelineRangeStart, plotState.timelineRangeEnd]
      ]) {
        if (!enabled || !start || !end || start > end ||
            isNaN(parseDay(start)) || isNaN(parseDay(end))) continue;
        startDay = startDay && startDay > start ? startDay : start;
        endDay = endDay && endDay < end ? endDay : end;
      }
      const rows = [];
      let first = null, last = null;
      if (!startDay || startDay <= endDay) {
        for (const nomination of nominations) {
          if (!nomination || !nominationMatchesChartScope(nomination, chartScope)) continue;
          if (!matchesAreaFilter(getAreaLabelCached(nomination, plotState.aggregationMode))) continue;
          const day = getDayKey(nomination);
          if (day === "Unknown" || (startDay && (day < startDay || day > endDay))) continue;
          rows.push([nomination, day]);
          if (!first || day < first) first = day;
          if (!last || day > last) last = day;
        }
      }
      startDay = startDay || first;
      endDay = endDay || last;
      const rangeInfo = startDay && endDay && startDay <= endDay
        ? computeRangeGranularity(new Date(startDay), new Date(endDay)) : null;
      const isDayMode = rangeInfo?.granularity === "day";
      if (!rows.length) return { ticks: [], series: [], allSeries: null, rangeInfo, isDayMode };
      const countsByStatus = Object.fromEntries(PLOT_STATUS_TYPES.filter(status => selectedStatuses.has(status)).map(status => [status, {}]));
      const countsByKeyAll = {};
      for (const [nomination, day] of rows) {
        const bucket = isDayMode ? day : day.slice(0, 7);
        countsByKeyAll[bucket] = (countsByKeyAll[bucket] || 0) + 1;
        if (!selectedStatuses.has(nomination.status)) continue;
        const counts = countsByStatus[nomination.status] || (countsByStatus[nomination.status] = {});
        counts[bucket] = (counts[bucket] || 0) + 1;
      }
      const ticks = isDayMode ? buildContinuousDayRange(startDay, endDay)
        : buildContinuousMonthRange(startDay.slice(0, 7), endDay.slice(0, 7));
      let series = Object.keys(countsByStatus).map(status => ({
        key: status, label: STATUS_DISPLAY[status] || status,
        values: ticks.map(tick => ({ tick, count: countsByStatus[status][tick] || 0 }))
      }));
      if (plotState.timelineMode === "cumulative") series = makeSeriesCumulativeTicks(series);
      let allSeries = null;
      if (plotState.showAllSubmissions) {
        allSeries = { key: "__ALL__", label: "All Submissions", values: ticks.map(tick => ({ tick, count: countsByKeyAll[tick] || 0 })) };
        if (plotState.timelineMode === "cumulative") allSeries = makeSeriesCumulativeTicks([allSeries])[0];
      }
      return { ticks, series, allSeries, rangeInfo, isDayMode, startDay, endDay };
    }

    function layoutTimelineDateLabels(ticks, isDayMode, rangeInfo, width, getX) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const labels = [], groups = new Map();
      const every = isDayMode ? rangeInfo.tickEvery : Math.max(1, Math.ceil(30 / Math.max(1, getX(1) - getX(0))));
      ticks.forEach((date, index) => {
        const parts = date.split("-");
        const groupKey = isDayMode ? date.slice(0, 7) : parts[0];
        if (!groups.has(groupKey)) groups.set(groupKey, { start: index, end: index, text: isDayMode ? months[Number(parts[1]) - 1] + "/" + parts[0] : parts[0] });
        groups.get(groupKey).end = index;
        const boundary = index === 0 || index === ticks.length - 1 ||
          (isDayMode && (Number(parts[2]) === 1 || Number(parts[2]) === daysInMonthForKey(date)));
        if (boundary || index % every === 0) labels.push({
          index, date, boundary, x: getX(index),
          text: isDayMode ? String(Number(parts[2])) : months[Number(parts[1]) - 1]
        });
      });
      // Conservative text widths keep the SVG and exported PNG equally legible.
      // Adjacent forced boundaries get separate rows, never dropped or overlapped.
      const pack = items => {
        const ends = [];
        for (const item of items) {
          const half = item.text.length * 3.8 + 1;
          // Month-end labels lean left, month starts right. This separates
          // Jan 31 / Feb 1 even when the data points are only a few pixels apart.
          if (isDayMode && item.date) {
            const day = Number(item.date.slice(8));
            if (item.index === 0 || day === daysInMonthForKey(item.date)) item.x -= half;
            else if (item.index === ticks.length - 1 || day === 1) item.x += half;
          }
          item.x = Math.max(half + 4, Math.min(width - half - 4, item.x));
        }
        for (const item of [...items].sort((a, b) => a.x - b.x)) {
          const half = item.text.length * 3.8 + 1;
          let lane = ends.findIndex(end => end + 5 <= item.x - half);
          if (lane < 0) lane = ends.length;
          ends[lane] = item.x + half;
          item.lane = lane;
        }
        return Math.max(1, ends.length);
      };
      const labelRows = pack(labels);
      const captions = [...groups.values()].map(group => ({ ...group, x: (getX(group.start) + getX(group.end)) / 2 }));
      const captionRows = pack(captions);
      return { labels, captions, labelRows, captionRows, bottom: 18 + labelRows * 16 + captionRows * 18 + 24 };
    }

    function drawTimelineDateAxis(svg, ticks, timelineData, axis, getX, baseline, width, colors) {
      const ns = "http://www.w3.org/2000/svg";
      const line = (x1, y1, x2, y2, color) => {
        const node = document.createElementNS(ns, "line");
        for (const [name, value] of Object.entries({ x1, y1, x2, y2, stroke: color })) node.setAttribute(name, value);
        svg.appendChild(node);
      };
      const text = (item, y, className, bold = false) => {
        const node = document.createElementNS(ns, "text");
        for (const [name, value] of Object.entries({ x: item.x, y, "text-anchor": "middle", "font-size": 11, "font-weight": bold ? 600 : 400, fill: colors.text, class: className })) node.setAttribute(name, value);
        if (item.date) node.setAttribute("data-date", item.date);
        node.textContent = item.text;
        svg.appendChild(node);
      };
      const selected = new Map(axis.labels.map(item => [item.index, item]));
      ticks.forEach((date, index) => {
        const item = selected.get(index), x = getX(index);
        line(x, baseline, x, baseline + (item ? 6 : 3), item ? colors.axis : colors.muted);
        if (item) {
          const y = baseline + 19 + item.lane * 16;
          if (item.lane || Math.abs(item.x - x) > 1) line(x, baseline + 6, item.x, y - 10, colors.muted);
          text(item, y, "wfns-date-tick-label", item.boundary);
        }
      });
      const captionTop = baseline + 19 + axis.labelRows * 16;
      for (const caption of axis.captions) {
        const y = captionTop + caption.lane * 18;
        line(getX(caption.start), y - 9, getX(caption.end), y - 9, colors.muted);
        text(caption, y + 4, "wfns-date-period-label", true);
      }
      const footerY = captionTop + axis.captionRows * 18 + 9;
      const start = timelineData.startDay || ticks[0];
      const end = timelineData.endDay || ticks[ticks.length - 1];
      // Exact endpoints remain explicit even in monthly mode or partial months.
      text({ x: 44, text: start }, footerY, "wfns-date-endpoint");
      if (start !== end) text({ x: width - 44, text: end }, footerY, "wfns-date-endpoint");
    }


    function renderTimelineChart(timelineData, chartScope, append = false, target = null, layout = {}) {
      const chart = target || document.getElementById("wfns-timeline-chart");
      if (!chart) return;
      if (!append) disposeChartSlot(chart);

      const { ticks, series, allSeries, rangeInfo, isDayMode } = timelineData;

      if (!ticks || !ticks.length || !timelineHasData(timelineData)) {
        const empty = document.createElement("div");
        empty.className = "wfns-chart-card";
        empty.appendChild(makeChartHeader("Timeline Chart", null, chartScope));
        const message = document.createElement("div");
        message.textContent = "No data for the selected area, statuses and date range.";
        empty.appendChild(message);
        chart.appendChild(empty);
        return;
      }

      // Update the range info hint in the control
      const rangeInfoEl = document.getElementById("wfns-range-info");
      if (rangeInfoEl && rangeInfo) {
        const modeLabel = rangeInfo.granularity === "day"
          ? `Day view — tick every ${rangeInfo.tickEvery} day(s) — ${rangeInfo.totalDays} days total`
          : `Month view — ${rangeInfo.totalDays} days span`;
        rangeInfoEl.textContent = modeLabel;
      } else if (rangeInfoEl) {
        rangeInfoEl.textContent = "";
      }
      // Update ts-range-info (also shown in Type/Status section)
      const tsRangeInfoEl2 = document.getElementById("wfns-ts-range-info");
      if (tsRangeInfoEl2) {
        if (plotState.typeStatusRangeEnabled && plotState.typeStatusRangeStart && plotState.typeStatusRangeEnd) {
          const s2 = new Date(plotState.typeStatusRangeStart), e2 = new Date(plotState.typeStatusRangeEnd);
          if (!isNaN(s2) && !isNaN(e2) && s2 <= e2) {
            const g2 = computeRangeGranularity(s2, e2);
            tsRangeInfoEl2.textContent = g2.granularity === "day"
              ? `Day view — ${g2.totalDays} days`
              : `Month view — ${g2.totalDays} days span`;
          } else { tsRangeInfoEl2.textContent = ""; }
        } else { tsRangeInfoEl2.textContent = ""; }
      }

      // Same token source as the area chart, so picking a theme changes both.
      const COLOR_AXIS  = themeColor("--wfns-axis", "#333333");
      const COLOR_GRID  = themeColor("--wfns-grid", "#dddddd");
      const COLOR_TEXT  = themeColor("--wfns-text", "#000000");
      const COLOR_MUTED = themeColor("--wfns-text-muted", "#555555");
      const COLOR_BG    = themeColor("--wfns-svg-bg", "#ffffff");
      const isDark      = themeColor("--wfns-svg-bg", "#ffffff").toLowerCase() !== "#ffffff";
      const ALL_COLOR   = isDark ? "#f0b429" : "#e67e00";


      const outer = document.createElement("div");
      outer.className = "wfns-chart-card";

      const timelineTitleBase = `${getTimelineTitlePrefix()} - ${getTimelineAreaTitle()}, ${chartScope.titleLabel}`;
      const rangeText = (plotState.timelineRangeEnabled && plotState.timelineRangeStart && plotState.timelineRangeEnd)
        ? ` [${plotState.timelineRangeStart} → ${plotState.timelineRangeEnd}]` : "";
      const tsRangeText = (plotState.typeStatusRangeEnabled && plotState.typeStatusRangeStart && plotState.typeStatusRangeEnd)
        ? ` [${plotState.typeStatusRangeStart} → ${plotState.typeStatusRangeEnd}]` : "";
      outer.appendChild(makeChartHeader(
        "Timeline Chart",
        () => exportTimelinePlotAsPng(outer, chartScope), chartScope
      ));

      // ── Y-scale ──
      const allSeriesValues = allSeries ? allSeries.values.map(v => v.count) : [];
      const rawMaxY = Math.max(1, ...series.flatMap(s => s.values.map(v => v.count)), ...allSeriesValues);
      const yStep = getNiceStep(rawMaxY);
      const maxY  = getNiceAxisMax(rawMaxY);

      // Label rows are planned before the plot so phone layouts reserve space.
      const margin = { top: 28, right: 25, bottom: 62, left: 48 };
      const xPadLeft = 12;
      const height = layout.height || 340;
      const axisExtend = 14;
      const viewportWidth = layout.width || Math.max(220, (chart.clientWidth || 700) - 26);
      // Export renders a balanced fitted copy; the live chart may be wider.
      const wantsScroll = !layout.width && (plotState.timelineViewMode === "scrollable" ||
        (plotState.timelineViewMode === "auto" && !isDayMode && ticks.length > 24));
      const idealStep = isDayMode ? Math.max(8, rangeInfo.tickEvery * 22) : 40;
      const svgWidth = wantsScroll ? Math.max(viewportWidth, 110 + (ticks.length - 1) * idealStep / 0.9) : viewportWidth;
      const isScrollable = svgWidth > viewportWidth + 1;
      const innerWidth = Math.max(1, Math.floor((svgWidth - margin.left - margin.right - xPadLeft) * 0.9));
      const xStepSize = ticks.length > 1 ? innerWidth / (ticks.length - 1) : 0;
      const getX = i => margin.left + xPadLeft + i * xStepSize;
      const dateAxis = layoutTimelineDateLabels(ticks, isDayMode, rangeInfo, svgWidth, getX);
      margin.bottom = Math.max(62, dateAxis.bottom);
      const innerHeight = Math.max(80, height - margin.top - margin.bottom);
      const getY = (v) => margin.top + innerHeight - (v / maxY) * innerHeight;

      // ── SVG ──
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("font-family", "Arial, sans-serif");
      svg.setAttribute("width", svgWidth);
      svg.setAttribute("height", Math.max(height + 30, margin.top + innerHeight + margin.bottom + 12));
      svg.dataset.dateGranularity = isDayMode ? "day" : "month";
      svg.dataset.tickEvery = isDayMode ? rangeInfo.tickEvery : 1;
      svg.style.cssText = `display:block; background:${COLOR_BG};`;
      if (!isScrollable) svg.style.width = "100%";

      // ── Arrow marker ──
      const defs   = document.createElementNS(svgNS, "defs");
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", "wfns-arrow-" + chartScope.key);
      marker.setAttribute("markerWidth", "8"); marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", "6");        marker.setAttribute("refY", "3");
      marker.setAttribute("orient", "auto");
      const arrowPath = document.createElementNS(svgNS, "path");
      arrowPath.setAttribute("d", "M0,0 L0,6 L8,3 z");
      arrowPath.setAttribute("fill", COLOR_AXIS);
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
      svg.appendChild(defs);

      // ── Axes ──
      const xAxisEnd = margin.left + xPadLeft + innerWidth +
        (isScrollable ? 20 : Math.floor((svgWidth - margin.left - margin.right - xPadLeft) * 0.1));
      const xAxis = document.createElementNS(svgNS, "line");
      xAxis.setAttribute("x1", margin.left); xAxis.setAttribute("y1", margin.top + innerHeight);
      xAxis.setAttribute("x2", xAxisEnd);    xAxis.setAttribute("y2", margin.top + innerHeight);
      xAxis.setAttribute("stroke", COLOR_AXIS); xAxis.setAttribute("stroke-width", "1.5");
      xAxis.setAttribute("marker-end", "url(#wfns-arrow-" + chartScope.key + ")");
      svg.appendChild(xAxis);

      const yAxis = document.createElementNS(svgNS, "line");
      yAxis.setAttribute("x1", margin.left); yAxis.setAttribute("y1", margin.top + innerHeight);
      yAxis.setAttribute("x2", margin.left); yAxis.setAttribute("y2", margin.top - axisExtend);
      yAxis.setAttribute("stroke", COLOR_AXIS); yAxis.setAttribute("stroke-width", "1.5");
      yAxis.setAttribute("marker-end", "url(#wfns-arrow-" + chartScope.key + ")");
      svg.appendChild(yAxis);

      // ── Y ticks + grid ──
      for (let value = 0; value <= maxY; value += yStep) {
        const y = getY(value);
        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", margin.left - 5); tick.setAttribute("y1", y);
        tick.setAttribute("x2", margin.left);      tick.setAttribute("y2", y);
        tick.setAttribute("stroke", COLOR_AXIS);
        svg.appendChild(tick);

        const grid = document.createElementNS(svgNS, "line");
        grid.setAttribute("x1", margin.left);                    grid.setAttribute("y1", y);
        grid.setAttribute("x2", margin.left + xPadLeft + innerWidth); grid.setAttribute("y2", y);
        grid.setAttribute("stroke", COLOR_GRID); grid.setAttribute("stroke-dasharray", "2,2");
        svg.appendChild(grid);

        const lbl = document.createElementNS(svgNS, "text");
        lbl.setAttribute("x", margin.left - 8); lbl.setAttribute("y", y + 4);
        lbl.setAttribute("text-anchor", "end"); lbl.setAttribute("font-size", "11");
        lbl.setAttribute("fill", COLOR_TEXT);
        lbl.textContent = value;
        svg.appendChild(lbl);
      }

      // Y title
      const yTitle = document.createElementNS(svgNS, "text");
      yTitle.setAttribute("x", 14);
      yTitle.setAttribute("y", margin.top + innerHeight / 2);
      yTitle.setAttribute("text-anchor", "middle"); yTitle.setAttribute("font-size", "12");
      yTitle.setAttribute("fill", COLOR_TEXT);
      yTitle.setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);
      yTitle.textContent = "Count";
      svg.appendChild(yTitle);

      drawTimelineDateAxis(svg, ticks, timelineData, dateAxis, getX,
        margin.top + innerHeight, svgWidth,
        { text: COLOR_TEXT, axis: COLOR_AXIS, muted: COLOR_MUTED });

      // ── Draw series lines ──
      function drawSeries(s, color, dashArray) {
        const points = s.values.map((v, i) => `${getX(i)},${getY(v.count)}`).join(" ");
        const polyline = document.createElementNS(svgNS, "polyline");
        polyline.setAttribute("fill", "none"); polyline.setAttribute("stroke", color);
        polyline.setAttribute("stroke-width", "2.5");
        if (dashArray) polyline.setAttribute("stroke-dasharray", dashArray);
        polyline.setAttribute("points", points);
        svg.appendChild(polyline);

        const markerStep = Math.max(1, Math.ceil(s.values.length / 100));
        s.values.forEach((v, i) => {
          if (i % markerStep && i !== s.values.length - 1) return;
          const cx = getX(i);
          const cy = getY(v.count);

          const circle = document.createElementNS(svgNS, "circle");
          circle.setAttribute("cx", cx); circle.setAttribute("cy", cy);
          circle.setAttribute("r", "3"); circle.setAttribute("fill", color);
          const titleNode = document.createElementNS(svgNS, "title");
          titleNode.textContent = `${s.label} | ${v.tick || v.month}: ${v.count}`;
          circle.setAttribute("aria-label", titleNode.textContent);
          svg.appendChild(circle);

          if (plotState.showDataLabels && v.count > 0) {
            const lbl = document.createElementNS(svgNS, "text");
            lbl.setAttribute("x", cx); lbl.setAttribute("y", cy - 20);
            lbl.setAttribute("text-anchor", "middle"); lbl.setAttribute("font-size", "9");
            lbl.setAttribute("fill", color); lbl.setAttribute("font-weight", "700");
            lbl.setAttribute("class", "wfns-data-label");
            lbl.textContent = v.count;
            svg.appendChild(lbl);
          }
        });
      }

      series.forEach(s => drawSeries(s, STATUS_COLORS[s.key] || "#888", null));
      if (allSeries) drawSeries(allSeries, ALL_COLOR, "6,3");

      // ── Wrap ──
      const svgWrap = document.createElement("div");
      svgWrap.className = "wfns-timeline-wrap";
      svgWrap.dataset.scrollable = isScrollable ? "true" : "false";
      svgWrap.style.cssText = isScrollable
        ? "overflow-x: auto; padding-bottom: 6px;"
        : "overflow-x: hidden; padding-bottom: 6px;";
      svgWrap.appendChild(svg);
      outer.appendChild(svgWrap);
      const readout = document.createElement("div");
      readout.className = "wfns-hover-readout";
      readout.textContent = "Hover, tap, or use ← → to inspect each date";
      let inspected = -1;
      let detailData = null;
      const inspect = (index, event = null, pin = false) => {
        const next = Math.max(0, Math.min(ticks.length - 1, index));
        if (!detailData) detailData = buildTimelineLineData(nominations || [], chartScope, new Set(PLOT_STATUS_TYPES));
        const counts = Object.fromEntries(detailData.series.map(item => [item.key, item.values[next]?.count || 0]));
        if (next !== inspected) {
          inspected = next;
          readout.textContent = ticks[next] + " · " + PLOT_STATUS_TYPES.map(key =>
            (STATUS_DISPLAY[key] || key) + ": " + (counts[key] || 0).toLocaleString()).join(" · ");
        }
        if (event) showStatusPopup(svg, event, { key: ticks[next], title: ticks[next], counts }, pin);
      };
      svg.tabIndex = 0;
      svg.setAttribute("aria-label", "Timeline data. Tap to keep details open, or use left and right arrow keys to inspect dates.");
      bindStatusPopupInteraction(svg, (event, pin) => {
        const box = svg.getBoundingClientRect();
        const x = (event.clientX - box.left) * svgWidth / (box.width || svgWidth);
        if (x < getX(0) - 8 || x > getX(ticks.length - 1) + 8) {
          hideStatusPopup(); return;
        }
        inspect(xStepSize ? Math.round((x - margin.left - xPadLeft) / xStepSize) : 0, event, pin);
      });
      svg.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); inspect(inspected + (event.key === "ArrowRight" ? 1 : -1));
      });

      // ── Legend ──
      const legend = document.createElement("div");
      legend.style.cssText = "display:flex; flex-wrap:wrap; gap:12px; margin-top:12px;";
      series.forEach(s => {
        const color = STATUS_COLORS[s.key] || "#888";
        const item = document.createElement("div");
        item.className = "wfns-legend-item";
        item.innerHTML = `
          <span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;"></span>
          <span>${s.label}</span>`;
        legend.appendChild(item);
      });
      if (allSeries) {
        const item = document.createElement("div");
        item.className = "wfns-legend-item";
        item.innerHTML = `
          <span style="display:inline-block;width:20px;height:3px;background:${ALL_COLOR};border-radius:2px;
            border-top:2px dashed ${ALL_COLOR};margin-top:4px;"></span>
          <span>All Submissions</span>`;
        legend.appendChild(item);
      }
      legend.className = "wfns-chart-legend";
      outer.appendChild(legend);
      outer.appendChild(readout);
      outer._wfnsTimelineTicks = ticks.length;
      outer._wfnsDispose = () => hideStatusPopup(svg);
      chart.appendChild(outer);
      reserveTimelineReadout(readout);
    }

    function getNiceStep(maxValue) {
      if (maxValue <= 10) return 1;
      if (maxValue <= 50) return 5;
      if (maxValue <= 100) return 10;

      const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
      const normalized = maxValue / magnitude;

      if (normalized <= 2) return 0.2 * magnitude;
      if (normalized <= 5) return 0.5 * magnitude;
      return 1 * magnitude;
    }

    function getNiceAxisMax(maxValue) {
      const step = getNiceStep(maxValue);
      return Math.ceil(maxValue / step) * step;
    }

    function renderPlots() {
      if (!active) return;
      savePreferences();
      if (!document.getElementById("wfns-chart-gallery")) return;
      renderEpoch++;
      if (renderFrame) return;
      renderFrame = requestAnimationFrame(() => { renderFrame = 0; reconcileChartGroups(); });
    }

    function getAvailableAreas(nominations) {
      if (!Array.isArray(nominations)) return [];
      const labels = nominations.filter(Boolean)
        .map(nomination => getAreaLabelCached(nomination, plotState.aggregationMode))
        .filter(label => !isUnknownArea(label));
      return [...new Set(plotState.timelineAreaProvinceOnly ? labels.map(getProvinceLevelLabel) : labels)].sort();
    }

    const awaitElement = get => new Promise((resolve, reject) => {
      let triesLeft = 20;
      const queryLoop = () => {
        const ref = get();
        if (ref) resolve(ref);
        else if (!triesLeft) reject();
        else setTimeout(queryLoop, 200);
        triesLeft--;
      };
      queryLoop();
    });

    function makeSeriesCumulative(series) {
      return series.map(s => {
        let runningTotal = 0;
        return {
          ...s,
          values: s.values.map(v => {
            runningTotal += v.count;
            return { ...v, count: runningTotal };
          })
        };
      });
    }

    // Same as makeSeriesCumulative but values use { tick, count } keys
    function makeSeriesCumulativeTicks(series) {
      return series.map(s => {
        let runningTotal = 0;
        return {
          ...s,
          values: s.values.map(v => {
            runningTotal += v.count;
            return { ...v, count: runningTotal };
          })
        };
      });
    }

    function updateFromMapMods(payload) {
      if (!active) return;
      const list = Array.isArray(payload?.contributions) ? payload.contributions : WFMM.contributions?.list();
      if (!Array.isArray(list)) return;
      nominations = list.map(entry => entry?.raw ? { ...entry.raw, ...entry, raw: entry.raw } : entry).filter(Boolean);
      dataRevision++;
      if (isNominationsRoute()) scheduleRenderPlotsApp();
    }

    function start() {
      if (active) return;
      if (!WFMM.contributions?.list || !WFMM.contributions?.onUpdated) throw new Error("Map Mods contributions API is unavailable.");
      active = true;
      controller = new AbortController();
      cleanups.push(WFMM.contributions.onUpdated(updateFromMapMods));
      if (WFMM.api?.onResponse) {
        cleanups.push(WFMM.api.onResponse(handleContributionResponse));
      } else {
        if (WFMM.events?.on) cleanups.push(WFMM.events.on("api:response", handleContributionResponse));
        if (WFMM.api?.onEndpointResponse && WFMM.api.ENDPOINT_IDS?.MANAGE_LIST) {
          cleanups.push(WFMM.api.onEndpointResponse(WFMM.api.ENDPOINT_IDS.MANAGE_LIST,
            payload => handleContributionResponse({ ...payload, endpointId: WFMM.api.ENDPOINT_IDS.MANAGE_LIST })));
        }
      }
      observeAlternateContributionResponses();
      watchForNominationsRoute();
      updateFromMapMods();
      scheduleRenderPlotsApp(0);
    }

    function stop() {
      if (!active) return;
      savePreferences(true);
      unmountProfile();
      savedPlotState = { ...plotState };
      // Flush a batched OSM cache write before cancelling its timer.
      if (osmCacheMap && osmPersistTimer) {
        try { localStorage.setItem(OSM_CACHE_KEY, JSON.stringify(Object.fromEntries(osmCacheMap))); } catch (_) {}
      }
      active = false;
      controller?.abort();
      observer?.disconnect();
      for (const cleanup of cleanups.splice(0)) if (typeof cleanup === "function") cleanup();
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      for (const id of frames) window.cancelAnimationFrame(id);
      frames.clear();
      for (const item of osmQueue.splice(0)) item.resolve("Unknown");
      osmQueuedKeys.clear();
      document.getElementById("wfns-plots-root")?.remove();
      document.getElementById("wfns-plots-css")?.remove();
      document.getElementById("wfns-spin-kf")?.remove();
    }
    return { start, stop };
}

  // No standalone startup: WFMM owns start/stop and the enabled preference.
  function registerWithMapMods() {
    let poll = 0;
    let warned = false;
    const tryRegister = () => {
      const api = window.WFMM;
      if (!api?.plugins?.registerExternal || api.pluginApiVersion !== 1) return;
      window.removeEventListener("wfmm:api-ready", tryRegister);
      window.clearInterval(poll);
      try {
        api.plugins.registerExternal({
          id: PLUGIN_ID,
          name: PLUGIN_NAME,
          description: PLUGIN_DESCRIPTION,
          source: "external",
          requirement: "optional",
          apiVersion: 1,
          author: "TrungLatias",
          version: VERSION,
          namespace: PLUGIN_NAMESPACE,
          create: createRuntime
        });
      } catch (error) {
        console.error("[" + PLUGIN_NAME + "] WFMM registration failed.", error);
      }
    };
    window.addEventListener("wfmm:api-ready", tryRegister);
    poll = window.setInterval(() => {
      tryRegister();
      if (!window.WFMM && !warned) {
        warned = true;
        console.info("[" + PLUGIN_NAME + "] Waiting for Wayfarer Map Mods (API v1). Enable Map Mods and reload if needed.");
      }
    }, 1000);
    tryRegister();
  }
  registerWithMapMods();

})();
