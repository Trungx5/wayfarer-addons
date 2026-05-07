// ==UserScript==
// @name        Wayfarer Nomination Stats Plots (Dev)
// @version     0.0.24
// @description Plot nomination trends and location summaries on the Wayfarer nominations page
// @namespace   https://github.com/toadlover/wayfarer-addons/
// @downloadURL https://raw.githubusercontent.com/toadlover/wayfarer-addons/main/wayfarer-nomination-stats-plots.user.js
// @homepageURL https://github.com/toadlover/wayfarer-addons/
// @match       https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2024 tehstone, Tntnnbltn
// This file is part of the Wayfarer Addons collection.
// This file is made as a modification of the wayfarer-nomination-stats.user.js script to display figure-like plots in the web page to summarize nomination stats over time or by submission area.
// File made by user NonEMusDingo

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

function init() {
    let nominations;

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
      EDIT_TITLE: "Edit Title",
      EDIT_DESCRIPTION: "Edit Description",
      EDIT_LOCATION: "Edit Location"
    };

    const plotState = {
      selectedStatuses: new Set(["ACCEPTED"]),
      selectedTypes: new Set(["NOMINATION"]),
      aggregationMode: "cityState", // or "state"
      maxBars: 20, // default number of bars to display in plot
      timelineAreaFilter: "__ALL__",
      timelineMode: "cumulative", // or "monthly"
      showDataLabels: false, // toggle data labels on graphs
      showAllSubmissions: false, // overlay total submissions line regardless of status filter
      showAllSubmissionsArea: false, // show blank remainder bar in area chart
      timelineViewMode: "responsive", // "responsive" = fit to width | "scrollable" = fixed 3-letter months
      timelineRangeEnabled: false, // toggle date-range filter on/off
      timelineRangeStart: "",      // "YYYY-MM-DD"
      timelineRangeEnd: ""         // "YYYY-MM-DD"
    };

    //setup to be able to export plots as png
    function loadHtml2Canvas() {
      return new Promise((resolve, reject) => {
        if (window.html2canvas) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async function exportAreaPlotAsPng() {
      await loadHtml2Canvas();

      const chart = document.getElementById("wfns-plot-chart");
      const barsWrap = document.getElementById("wfns-bars-wrap");

      if (!chart || !barsWrap) {
        console.log("Plot export failed: chart or barsWrap not found.");
        return;
      }

      const original = {
        chartWidth: chart.style.width,
        chartOverflow: chart.style.overflow,
        barsWrapWidth: barsWrap.style.width,
        barsWrapOverflow: barsWrap.style.overflow,
        barsWrapOverflowX: barsWrap.style.overflowX,
      };

      try {
        const fullWidth = Math.max(barsWrap.scrollWidth, barsWrap.clientWidth);

        barsWrap.style.width = `${fullWidth}px`;
        barsWrap.style.overflow = "visible";
        barsWrap.style.overflowX = "visible";

        chart.style.width = `${fullWidth + 40}px`;
        chart.style.overflow = "visible";

        const canvas = await html2canvas(chart, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true
        });

        const link = document.createElement("a");
        const mode = plotState.aggregationMode === "state" ? "state" : "citystate";
        const date = new Date().toISOString().slice(0, 10);

        const types = Array.from(plotState.selectedTypes).join("-");
        const statuses = Array.from(plotState.selectedStatuses).join("-");

        //link.download = `wayfarer_plot_${mode}_${date}.png`;
        link.download = `wayfarer_${mode}_${types}_${statuses}_${date}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch (err) {
        console.log("Plot export failed:", err);
      } finally {
        chart.style.width = original.chartWidth;
        chart.style.overflow = original.chartOverflow;
        barsWrap.style.width = original.barsWrapWidth;
        barsWrap.style.overflow = original.barsWrapOverflow;
        barsWrap.style.overflowX = original.barsWrapOverflowX;
      }
    }

    async function exportTimelinePlotAsPng() {
      await loadHtml2Canvas();

      const chart = document.getElementById("wfns-timeline-chart");
      const timelineWrap = document.getElementById("wfns-timeline-wrap");

      if (!chart || !timelineWrap) {
        console.log("Timeline export failed: chart or timelineWrap not found.");
        return;
      }

      const original = {
        chartWidth: chart.style.width,
        chartOverflow: chart.style.overflow,
        wrapWidth: timelineWrap.style.width,
        wrapOverflow: timelineWrap.style.overflow,
        wrapOverflowX: timelineWrap.style.overflowX,
      };

      try {
        const fullWidth = Math.max(timelineWrap.scrollWidth, timelineWrap.clientWidth);

        timelineWrap.style.width = `${fullWidth}px`;
        timelineWrap.style.overflow = "visible";
        timelineWrap.style.overflowX = "visible";

        chart.style.width = `${fullWidth + 40}px`;
        chart.style.overflow = "visible";

        const canvas = await html2canvas(chart, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true
        });

        const link = document.createElement("a");
        const mode = plotState.aggregationMode === "state" ? "state" : "citystate";
        const areaPart =
          plotState.timelineAreaFilter && plotState.timelineAreaFilter !== "__ALL__"
            ? plotState.timelineAreaFilter.replace(/[^a-zA-Z0-9_-]+/g, "_")
            : "allareas";
        const date = new Date().toISOString().slice(0, 10);

        link.download = `wayfarer_timeline_${mode}_${areaPart}_${date}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch (err) {
        console.log("Timeline export failed:", err);
      } finally {
        chart.style.width = original.chartWidth;
        chart.style.overflow = original.chartOverflow;
        timelineWrap.style.width = original.wrapWidth;
        timelineWrap.style.overflow = original.wrapOverflow;
        timelineWrap.style.overflowX = original.wrapOverflowX;
      }
    }

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/manage') {
                if (method == 'GET') {
                    this.addEventListener('load', parseNominations, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function parseNominations(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.log('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            nominations = json.result.submissions;
            if (!nominations) {
                console.log('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            setTimeout(() => {
                renderPlotsApp();
            }, 300);          

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }

    async function renderPlotsApp() {
        awaitElement(() => document.querySelector('app-submissions-list'))
            .then(() => {
                addCss();
                addPlotsSection();
            })
            .catch(() => {
                console.log("Could not find app-submissions-list.");
            });
    }

    function addCss() {
        const css = `
            /* ── Theme tokens ── */
            #wfns-plots-root {
                --wfns-bg:          #ffffff;
                --wfns-bg-card:     #ffffff;
                --wfns-border:      #dddddd;
                --wfns-text:        #000000;
                --wfns-text-muted:  #555555;
                --wfns-axis:        #333333;
                --wfns-grid:        #dddddd;
                --wfns-ctrl-bg:     rgba(223,71,28,0.10);
                --wfns-ctrl-bg2:    rgba(223,71,28,0.04);
                --wfns-ctrl-border: #DF471C;
                --wfns-input-bg:    #ffffff;
                --wfns-input-text:  #000000;
                --wfns-btn-bg:      #e5e5e5;
                --wfns-btn-text:    #000000;
                --wfns-svg-bg:      #ffffff;
            }

            .dark #wfns-plots-root {
                --wfns-bg:          #1a1a1a;
                --wfns-bg-card:     #242424;
                --wfns-border:      #3a3a3a;
                --wfns-text:        #e8e8e8;
                --wfns-text-muted:  #aaaaaa;
                --wfns-axis:        #cccccc;
                --wfns-grid:        #3a3a3a;
                --wfns-ctrl-bg:     rgba(223,71,28,0.18);
                --wfns-ctrl-bg2:    rgba(223,71,28,0.08);
                --wfns-ctrl-border: #ff6b3d;
                --wfns-input-bg:    #2e2e2e;
                --wfns-input-text:  #e8e8e8;
                --wfns-btn-bg:      #3a3a3a;
                --wfns-btn-text:    #e8e8e8;
                --wfns-svg-bg:      #242424;
            }

            .wrap-collabsible {
                margin-bottom: 1.2rem;
            }

            .lbl-toggle-ns {
                display: block;
                font-weight: bold;
                font-family: monospace;
                font-size: 1.2rem;
                text-transform: uppercase;
                text-align: center;
                padding: 1rem;
                color: white;
                background: #DF471C;
                cursor: pointer;
                border-radius: 7px;
                transition: all 0.25s ease-out;
            }

            .lbl-toggle-ns:hover { color: lightgrey; }

            .lbl-toggle-ns::before {
                content: ' ';
                display: inline-block;
                border-top: 5px solid transparent;
                border-bottom: 5px solid transparent;
                border-left: 5px solid currentColor;
                vertical-align: middle;
                margin-right: .7rem;
                transform: translateY(-2px);
                transition: transform .2s ease-out;
            }

            .toggle { display: none; }

            .toggle:checked+.lbl-toggle-ns::before {
                transform: rotate(90deg) translateX(-3px);
            }

            .collapsible-content-ns {
                max-height: 0px;
                overflow: hidden;
                transition: max-height .25s ease-in-out;
            }

            .toggle:checked+.lbl-toggle-ns+.collapsible-content-ns {
                max-height: 9999999pt;
            }

            .toggle:checked+.lbl-toggle-ns {
                border-bottom-right-radius: 0;
                border-bottom-left-radius: 0;
            }

            .collapsible-content-ns .content-inner {
                border-bottom: 1px solid var(--wfns-border, rgba(0,0,0,1));
                border-left:   1px solid var(--wfns-border, rgba(0,0,0,1));
                border-right:  1px solid var(--wfns-border, rgba(0,0,0,1));
                border-bottom-left-radius: 7px;
                border-bottom-right-radius: 7px;
                padding: .5rem 1rem;
            }

            #wfns-plots-root {
                width: 100%;
                max-width: none;
                margin: 16px 0 0 0;
                color: var(--wfns-text);
            }

            #wfns-plots-inner,
            #wfns-plot-chart,
            #wfns-timeline-chart {
                width: 100%;
                max-width: none;
            }

            #wfns-bars-wrap { justify-content: flex-start; }

            /* Control blocks */
            .wfns-control-block {
                position: relative;
                padding: 10px 12px 10px 14px;
                border-radius: 6px;
                overflow: hidden;
                min-width: 90px;
            }

            .wfns-control-block::before {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, var(--wfns-ctrl-bg) 0%, var(--wfns-ctrl-bg2) 100%);
                border-left: 3px solid var(--wfns-ctrl-border);
                border-radius: 6px;
                pointer-events: none;
                z-index: 0;
            }

            .wfns-control-block > * { position: relative; z-index: 1; }

            .wfns-control-block-label {
                font-weight: 600;
                margin-bottom: 6px;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--wfns-ctrl-border) !important;
            }

            #wfns-plots-root select,
            #wfns-plots-root input[type="checkbox"],
            #wfns-plots-root input[type="radio"] {
                accent-color: #DF471C;
            }

            #wfns-plots-root select {
                background: var(--wfns-input-bg);
                color: var(--wfns-input-text);
                border: 1px solid var(--wfns-border);
                border-radius: 4px;
                padding: 4px 6px;
            }

            #wfns-plots-root label { color: var(--wfns-text); }

            #wfns-plots-root button {
                background: var(--wfns-btn-bg);
                color: var(--wfns-btn-text);
                border: 1px solid var(--wfns-border);
                border-radius: 4px;
                padding: 6px 10px;
                cursor: pointer;
                font-weight: 500;
                width: 100%;
            }

            #wfns-plots-root button:hover { opacity: 0.8; }

            /* Toggle switch */
            .wfns-toggle-switch {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
                vertical-align: middle;
                margin-right: 6px;
            }

            .wfns-toggle-switch input { opacity: 0; width: 0; height: 0; }

            .wfns-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background: #ccc;
                border-radius: 20px;
                transition: background 0.2s;
            }

            .wfns-toggle-slider:before {
                content: '';
                position: absolute;
                width: 14px; height: 14px;
                left: 3px; bottom: 3px;
                background: white;
                border-radius: 50%;
                transition: transform 0.2s;
            }

            .wfns-toggle-switch input:checked + .wfns-toggle-slider { background: #DF471C; }
            .wfns-toggle-switch input:checked + .wfns-toggle-slider:before { transform: translateX(16px); }

            /* Chart cards */
            .wfns-chart-card {
                border: 1px solid var(--wfns-border);
                border-radius: 8px;
                background: var(--wfns-bg-card);
                padding: 16px;
            }

            .wfns-chart-title {
                font-weight: 700;
                margin-bottom: 12px;
                color: var(--wfns-text);
            }

            .wfns-legend-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: var(--wfns-text);
            }

            /* Data labels on SVG timeline */
            .wfns-data-label {
                font-size: 10px;
                text-anchor: middle;
                pointer-events: none;
            }

            /* ── Control section toggles ── */
            .wfns-sec-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 700;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                padding: 6px 14px;
                margin-bottom: 0;
                background: var(--wfns-ctrl-bg);
                border: 1px solid var(--wfns-ctrl-border);
                border-radius: 6px;
                color: var(--wfns-ctrl-border);
                cursor: pointer;
                user-select: none;
                transition: background 0.15s;
            }
            .wfns-sec-toggle:hover {
                background: var(--wfns-ctrl-bg2, rgba(223,71,28,0.06));
            }
            .wfns-sec-toggle::before {
                content: '▶';
                font-size: 9px;
                display: inline-block;
                transition: transform 0.2s;
            }

            /* Section body: hidden by default via display:none so it doesn't
               interfere with clientWidth measurements on the chart elements. */
            .wfns-sec-body {
                display: none;
                border-left: 2px solid var(--wfns-ctrl-border);
                margin-left: 6px;
                border-radius: 0 0 6px 6px;
            }

            /* checked state: show body + rotate arrow */
            .wfns-sec-cb:checked + .wfns-sec-toggle::before {
                transform: rotate(90deg);
            }
            .wfns-sec-cb:checked + .wfns-sec-toggle + .wfns-sec-body {
                display: block;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }

    // Functionality to add plots section
    function addPlotsSection() {
      if (document.getElementById("wfns-plots-root")) return;

      const list = document.querySelector("app-submissions-list");
      const submissionsLayout = document.querySelector(".submissions");

      if (!list || !submissionsLayout) return;

      const root = document.createElement("div");
      root.id = "wfns-plots-root";
      root.className = "wayfarerns";
      root.style.marginTop = "16px";

      root.innerHTML = `
        <div class="wrap-collabsible">
          <input id="collapsed-plots" class="toggle" type="checkbox" checked>
          <label for="collapsed-plots" class="lbl-toggle-ns">View Nomination Plots</label>
          <div class="collapsible-content-ns">
            <div class="content-inner" id="wfns-plots-inner">
              <div id="wfns-plot-controls"></div>
              <div id="wfns-plot-chart"></div>
              <div id="wfns-timeline-chart" style="margin-top: 20px;"></div>
            </div>
          </div>
        </div>
      `;

      submissionsLayout.insertAdjacentElement("afterend", root);

      renderPlotControls();
      // Defer one frame so the browser has laid out the DOM before we read clientWidth
      requestAnimationFrame(() => renderPlots());
    }

    function renderPlotControls() {
      const controls = document.getElementById("wfns-plot-controls");
      if (!controls) return;

      controls.innerHTML = "";

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

      // Creates a collapsible section row in the toggle bar
      function makeSection(title, buildFn) {
        const section = document.createElement("div");
        section.style.cssText = "margin-bottom: 6px;";

        const uid = "wfns-sec-" + title.replace(/\W+/g, "-").toLowerCase();
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = uid;
        checkbox.className = "wfns-sec-cb"; // dedicated class — does NOT inherit .toggle CSS
        checkbox.style.display = "none";
        // Remember collapsed state in plotState to survive re-renders
        const stateKey = "_sec_" + uid;
        checkbox.checked = plotState[stateKey] !== false; // default open

        const lbl = document.createElement("label");
        lbl.htmlFor = uid;
        lbl.className = "wfns-sec-toggle";
        lbl.textContent = title;

        const body = document.createElement("div");
        body.className = "wfns-sec-body";

        // inner flex row for the control blocks
        const row = document.createElement("div");
        row.style.cssText = "display:flex; flex-wrap:wrap; gap:12px; padding:10px 12px 10px 12px; align-items:flex-start;";
        buildFn(row);
        body.appendChild(row);

        checkbox.addEventListener("change", () => {
          plotState[stateKey] = checkbox.checked;
        });

        section.appendChild(checkbox);
        section.appendChild(lbl);
        section.appendChild(body);
        return section;
      }

      // ── Section 1: Max Bar ────────────────────────────────────────────────────
      controls.appendChild(makeSection("Max Bar", (row) => {
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
      }));

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
      }));

      // ── Section 3: By Area ────────────────────────────────────────────────────
      controls.appendChild(makeSection("By Area", (row) => {
        // Aggregation
        const aggBlock = makeControlBlock();
        aggBlock.appendChild(makeControlLabel("Aggregate By"));
        [["cityState", "City + State"], ["state", "State"]].forEach(([val, text]) => {
          const lbl = document.createElement("label");
          lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
          lbl.innerHTML = `<input type="radio" name="wfns-agg" value="${val}" ${plotState.aggregationMode === val ? "checked" : ""}> ${text}`;
          aggBlock.appendChild(lbl);
        });
        row.appendChild(aggBlock);

        // Timeline area filter
        const timelineAreaBlock = makeControlBlock();
        timelineAreaBlock.appendChild(makeControlLabel("Timeline Area"));
        const timelineAreaSelect = document.createElement("select");
        timelineAreaSelect.id = "wfns-timeline-area";
        timelineAreaSelect.style.cssText = "padding: 4px 6px; border-radius: 4px; max-width: 140px;";
        const allAreaOpt = document.createElement("option");
        allAreaOpt.value = "__ALL__"; allAreaOpt.textContent = "All areas";
        timelineAreaSelect.appendChild(allAreaOpt);
        timelineAreaBlock.appendChild(timelineAreaSelect);
        row.appendChild(timelineAreaBlock);

        // All Submissions in area chart toggle
        const allSubAreaBlock = makeControlBlock();
        allSubAreaBlock.appendChild(makeControlLabel("All Submissions"));
        const allSubAreaWrap = document.createElement("label");
        allSubAreaWrap.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px;";
        allSubAreaWrap.innerHTML = `
          <label class="wfns-toggle-switch">
            <input type="checkbox" id="wfns-all-submissions-area-toggle" ${plotState.showAllSubmissionsArea ? "checked" : ""}>
            <span class="wfns-toggle-slider"></span>
          </label>
          <span id="wfns-all-submissions-area-text" style="font-size:12px;">${plotState.showAllSubmissionsArea ? "On" : "Off"}</span>
        `;
        const allSubAreaNote = document.createElement("div");
        allSubAreaNote.style.cssText = "font-size:10px; margin-top:4px; color: var(--wfns-text-muted, #888);";
        allSubAreaNote.textContent = "Show unselected as blank";
        allSubAreaBlock.appendChild(allSubAreaWrap);
        allSubAreaBlock.appendChild(allSubAreaNote);
        row.appendChild(allSubAreaBlock);
      }));

      // ── Section 4: Chart ──────────────────────────────────────────────────────
      controls.appendChild(makeSection("Chart", (row) => {
        // Date Range
        const dateRangeBlock = makeControlBlock();
        dateRangeBlock.appendChild(makeControlLabel("Date Range"));
        const dateRangeToggleWrap = document.createElement("label");
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
        const toggleWrap = document.createElement("label");
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

        // All submissions overlay toggle
        const allSubBlock = makeControlBlock();
        allSubBlock.appendChild(makeControlLabel("All Submissions"));
        const allSubWrap = document.createElement("label");
        allSubWrap.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:4px;";
        allSubWrap.innerHTML = `
          <label class="wfns-toggle-switch">
            <input type="checkbox" id="wfns-all-submissions-toggle" ${plotState.showAllSubmissions ? "checked" : ""}>
            <span class="wfns-toggle-slider"></span>
          </label>
          <span id="wfns-all-submissions-text" style="font-size:12px;">${plotState.showAllSubmissions ? "On" : "Off"}</span>
        `;
        const allSubNote = document.createElement("div");
        allSubNote.style.cssText = "font-size:10px; margin-top:4px; color: var(--wfns-text-muted, #888);";
        allSubNote.textContent = "Shows total regardless of status";
        allSubBlock.appendChild(allSubWrap);
        allSubBlock.appendChild(allSubNote);
        row.appendChild(allSubBlock);

        // Chart view mode
        const chartViewBlock = makeControlBlock();
        chartViewBlock.appendChild(makeControlLabel("Chart View"));
        [
          ["responsive", "Responsive (fit width)"],
          ["scrollable", "Scrollable (fixed months)"]
        ].forEach(([val, text]) => {
          const lbl = document.createElement("label");
          lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
          lbl.innerHTML = `<input type="radio" name="wfns-chart-view" value="${val}" ${plotState.timelineViewMode === val ? "checked" : ""}> ${text}`;
          chartViewBlock.appendChild(lbl);
        });
        const chartViewNote = document.createElement("div");
        chartViewNote.style.cssText = "font-size:10px; margin-top:4px; color: var(--wfns-text-muted, #888);";
        chartViewNote.textContent = "Responsive auto-hides labels at scale";
        chartViewBlock.appendChild(chartViewNote);
        row.appendChild(chartViewBlock);
      }));

      // ── Section 5: Download PNG ───────────────────────────────────────────────
      controls.appendChild(makeSection("Download PNG", (row) => {
        const exportBlock = makeControlBlock();
        exportBlock.appendChild(makeControlLabel("Export Plots"));
        exportBlock.style.minWidth = "180px";

        const btnWrap = document.createElement("div");
        btnWrap.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-top:4px;";

        const areaBtn = document.createElement("button");
        areaBtn.id = "wfns-export-area-image";
        areaBtn.textContent = "⬇ Export Area Plot";
        areaBtn.addEventListener("click", () => exportAreaPlotAsPng());

        const timelineBtn = document.createElement("button");
        timelineBtn.id = "wfns-export-timeline-image";
        timelineBtn.textContent = "⬇ Export Timeline Plot";
        timelineBtn.addEventListener("click", () => exportTimelinePlotAsPng());

        btnWrap.appendChild(areaBtn);
        btnWrap.appendChild(timelineBtn);
        exportBlock.appendChild(btnWrap);
        row.appendChild(exportBlock);
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

      // Event listeners
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

      controls.querySelectorAll("input[data-type]").forEach(input => {
        input.addEventListener("change", (e) => {
          const type = e.target.dataset.type;
          if (e.target.checked) {
            plotState.selectedTypes.add(type);
          } else {
            plotState.selectedTypes.delete(type);
          }
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
      const maxBarsSelectEl = controls.querySelector("#wfns-max-bars");
      if (maxBarsSelectEl) {
        maxBarsSelectEl.addEventListener("change", (e) => {
          plotState.maxBars = e.target.value === "all" ? "all" : Number(e.target.value);
          renderPlots();
        });
      }
      // Export buttons are wired directly inside the makeSection closure above.
    }

    function getAreaLabel(nomination, aggregationMode) {
      const city = nomination.city || "Unknown City";
      const state = nomination.state || "Unknown State";

      if (aggregationMode === "state") {
        return state;
      }
      return `${city}, ${state}`;
    }

    function nominationMatchesSelectedType(nomination, selectedType) {
      return nomination.type === selectedType;
    }

    function buildStackedAreaData(nominations) {
      const result = {};
      const totalByArea = {}; // total nominations per area regardless of status/type filter

      nominations.forEach(nomination => {
        if (!nomination) return;

        const typeMatch = Array.from(plotState.selectedTypes).some(type =>
          nominationMatchesSelectedType(nomination, type)
        );
        if (!typeMatch) return;

        const area = getAreaLabel(nomination, plotState.aggregationMode);

        // Track grand total per area (all statuses)
        totalByArea[area] = (totalByArea[area] || 0) + 1;

        // Only count selected statuses for the stacked bar
        if (!plotState.selectedStatuses.has(nomination.status)) return;

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


    function getTopAreas(stackedData, maxBars = 20) {
      const rows = Object.entries(stackedData)
        .map(([area, counts]) => {
          const areaTotal = counts.__areaTotal__ || 0;
          const total = Object.entries(counts)
            .filter(([k]) => k !== "__areaTotal__")
            .reduce((sum, [, val]) => sum + val, 0);
          return { area, counts, total, areaTotal };
        })
        .sort((a, b) => b.total - a.total);

      if (maxBars === "all") return rows;
      return rows.slice(0, maxBars);
    }

    const STATUS_COLORS = {
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

    function renderVerticalStackedBarChart(areaRows) {
      const chart = document.getElementById("wfns-plot-chart");
      if (!chart) return;

      chart.innerHTML = "";

      if (!areaRows.length) {
        chart.textContent = "No nominations match the current filters.";
        return;
      }

      // Dark mode detection (mirrors timeline chart)
      const isDark = document.body.classList.contains("dark") ||
                     document.documentElement.classList.contains("dark");
      const AREA_TEXT       = isDark ? "#e8e8e8" : "#000000";
      const AREA_BAR_BG     = isDark ? "#2e2e2e" : "#f7f7f7";
      const AREA_BAR_BORDER = isDark ? "#555555" : "#bbb";
      const AREA_WRAP_BORDER = isDark ? "#3a3a3a" : "#ccc";
      const BLANK_COLOR     = isDark ? "#3a3a3a" : "#e0e0e0"; // colour for unselected portion

      const showAll = plotState.showAllSubmissionsArea;

      // When showAll is on, scale bars relative to the area's grand total; otherwise selected total
      const maxTotal = showAll
        ? Math.max(...areaRows.map(row => row.areaTotal || row.total))
        : Math.max(...areaRows.map(row => row.total));

      const outer = document.createElement("div");
      outer.className = "wfns-chart-card";

      const title = document.createElement("div");
      title.textContent = "Nominations by Area";
      title.className = "wfns-chart-title";
      outer.appendChild(title);

      const barsWrap = document.createElement("div");
      barsWrap.id = "wfns-bars-wrap";
      barsWrap.style.cssText = `
        display: flex;
        align-items: flex-end;
        gap: 12px;
        min-height: 280px;
        padding: 12px 0 4px 0;
        border-bottom: 1px solid ${AREA_WRAP_BORDER};
        overflow-x: auto;
      `;

      areaRows.forEach(row => {
        const denominator = showAll ? (row.areaTotal || row.total) : row.total;
        const scaledHeight = maxTotal > 0 ? (denominator / maxTotal) * 220 : 0;
        const selectedHeight = (denominator > 0 && showAll)
          ? (row.total / denominator) * scaledHeight
          : scaledHeight;
        const blankHeight = scaledHeight - selectedHeight;

        const col = document.createElement("div");
        col.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 72px;
          flex: 0 0 72px;
          border: 2.5px solid #000000;
          border-radius: 6px;
          padding: 4px 2px 4px 2px;
          box-sizing: border-box;
        `;

        // Show selected count / total if showAll, else just selected total
        const totalLabel = document.createElement("div");
        totalLabel.textContent = showAll
          ? `${row.total}/${row.areaTotal || row.total}`
          : row.total;
        totalLabel.style.cssText = `
          font-size: ${showAll ? "10px" : "12px"};
          margin-bottom: 6px;
          color: ${AREA_TEXT};
        `;

        const barOuter = document.createElement("div");
        barOuter.style.cssText = `
          width: 42px;
          height: 220px;
          display: flex;
          flex-direction: column-reverse;
          justify-content: flex-start;
          border: 1px solid ${AREA_BAR_BORDER};
          background: ${AREA_BAR_BG};
          border-radius: 4px 4px 0 0;
          overflow: hidden;
        `;

        const barInner = document.createElement("div");
        barInner.style.cssText = `
          width: 100%;
          height: ${scaledHeight}px;
          display: flex;
          flex-direction: column-reverse;
        `;

        const statusesInBar = Array.from(plotState.selectedStatuses)
          .filter(status => row.counts[status])
          .sort((a, b) => row.counts[b] - row.counts[a]);

        statusesInBar.forEach(status => {
          const segment = document.createElement("div");
          const segHeight = denominator > 0
            ? (row.counts[status] / denominator) * scaledHeight
            : 0;
          segment.style.width = "100%";
          segment.style.height = `${segHeight}px`;
          segment.style.background = STATUS_COLORS[status] || "#888";
          segment.style.position = "relative";
          segment.title = `${row.area} | ${STATUS_DISPLAY[status] || status}: ${row.counts[status]}`;

          // Data label inside segment
          if (plotState.showDataLabels && segHeight >= 14) {
            const numLabel = document.createElement("span");
            numLabel.textContent = row.counts[status];
            numLabel.style.cssText = `
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              font-size: 10px;
              color: #fff;
              font-weight: 700;
              text-shadow: 0 0 2px rgba(0,0,0,0.6);
              white-space: nowrap;
              pointer-events: none;
              line-height: 1;
            `;
            segment.appendChild(numLabel);
          }

          barInner.appendChild(segment);
        });

        // Blank remainder segment (top of bar, shown in column-reverse so renders above selected)
        if (showAll && blankHeight > 0) {
          const blankSeg = document.createElement("div");
          blankSeg.style.width = "100%";
          blankSeg.style.height = `${blankHeight}px`;
          blankSeg.style.background = BLANK_COLOR;
          blankSeg.style.position = "relative";
          const unselected = (row.areaTotal || row.total) - row.total;
          blankSeg.title = `${row.area} | Unselected statuses: ${unselected}`;

          if (plotState.showDataLabels && blankHeight >= 14 && unselected > 0) {
            const numLabel = document.createElement("span");
            numLabel.textContent = unselected;
            numLabel.style.cssText = `
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              font-size: 10px;
              color: ${isDark ? "#aaa" : "#555"};
              font-weight: 700;
              white-space: nowrap;
              pointer-events: none;
              line-height: 1;
            `;
            blankSeg.appendChild(numLabel);
          }
          barInner.appendChild(blankSeg);
        }

        barOuter.appendChild(barInner);

        const xLabel = document.createElement("div");
        xLabel.textContent = row.area;
        xLabel.style.cssText = `
          margin-top: 8px;
          font-size: 11px;
          text-align: center;
          width: 72px;
          min-height: 60px;
          max-height: 60px;
          line-height: 1.2;
          overflow: hidden;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          word-break: break-word;
          overflow-wrap: anywhere;
          color: ${AREA_TEXT};
        `;

        col.appendChild(totalLabel);
        col.appendChild(barOuter);
        col.appendChild(xLabel);
        barsWrap.appendChild(col);
      });

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
          <span style="display:inline-block;width:12px;height:12px;background:${BLANK_COLOR};border-radius:2px;border:1px solid ${AREA_BAR_BORDER};"></span>
          <span>Unselected (all submissions)</span>
        `;
        legend.appendChild(blankItem);
      }

      outer.appendChild(legend);
      chart.appendChild(outer);
    }

    function getMonthKey(nomination) {
      if (!nomination.day) return "Unknown";

      const d = new Date(nomination.day);
      if (isNaN(d)) return "Unknown";

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");

      return `${year}-${month}`;
    }

    function getDayKey(nomination) {
      const dateStr = nomination.day || nomination.lastUpdateTime || nomination.imageImportedAt;
      if (!dateStr) return "Unknown";
      const d = new Date(dateStr);
      if (isNaN(d)) return "Unknown";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    function buildContinuousDayRange(minDay, maxDay) {
      const days = [];
      if (!minDay || !maxDay) return days;
      const cur = new Date(minDay);
      const end = new Date(maxDay);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        days.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    }

    // Returns the granularity descriptor when a date range is active.
    //   granularity "day" subMode "every"    → every single day  (< 30 days)
    //   granularity "day" subMode "midrange" → 1/10/20/last-of-month (30–149 days)
    //   granularity "month"                  → monthly ticks (>= 150 days)
    function computeRangeGranularity(startDate, endDate) {
      const msPerDay = 86400000;
      const totalDays = Math.round((endDate - startDate) / msPerDay) + 1;
      if (totalDays < 30)  return { granularity: "day", subMode: "every",    totalDays };
      if (totalDays < 150) return { granularity: "day", subMode: "midrange", totalDays };
      return { granularity: "month", totalDays };
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

    function buildTimelineLineData(nominations) {
      const useRange = plotState.timelineRangeEnabled &&
                       plotState.timelineRangeStart &&
                       plotState.timelineRangeEnd;

      let rangeStart = null, rangeEnd = null, rangeInfo = null;
      if (useRange) {
        rangeStart = new Date(plotState.timelineRangeStart);
        rangeEnd   = new Date(plotState.timelineRangeEnd);
        if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart > rangeEnd) {
          // invalid range — fall back to no filter
          rangeStart = null; rangeEnd = null;
        } else {
          rangeInfo = computeRangeGranularity(rangeStart, rangeEnd);
        }
      }

      const isDayMode = rangeInfo && rangeInfo.granularity === "day";

      // Bucket keys are either "YYYY-MM-DD" (day mode) or "YYYY-MM" (month mode)
      const observedKeys = [];
      const countsByStatus = {};
      const countsByKeyAll = {};

      PLOT_STATUS_TYPES.forEach(status => {
        if (plotState.selectedStatuses.has(status)) {
          countsByStatus[status] = {};
        }
      });

      nominations.forEach(nomination => {
        if (!nomination) return;

        const typeMatch = Array.from(plotState.selectedTypes).some(type =>
          nominationMatchesSelectedType(nomination, type)
        );
        if (!typeMatch) return;

        const area = getAreaLabel(nomination, plotState.aggregationMode);
        if (
          plotState.timelineAreaFilter &&
          plotState.timelineAreaFilter !== "__ALL__" &&
          area !== plotState.timelineAreaFilter
        ) return;

        // Date-range gate
        if (rangeStart && rangeEnd) {
          const dayKey = getDayKey(nomination);
          if (dayKey === "Unknown") return;
          const nomDate = new Date(dayKey);
          if (nomDate < rangeStart || nomDate > rangeEnd) return;
        }

        const bucketKey = isDayMode ? getDayKey(nomination) : getMonthKey(nomination);
        if (!bucketKey || bucketKey === "Unknown") return;

        observedKeys.push(bucketKey);
        countsByKeyAll[bucketKey] = (countsByKeyAll[bucketKey] || 0) + 1;

        if (!plotState.selectedStatuses.has(nomination.status)) return;
        if (!countsByStatus[nomination.status]) countsByStatus[nomination.status] = {};
        countsByStatus[nomination.status][bucketKey] =
          (countsByStatus[nomination.status][bucketKey] || 0) + 1;
      });

      if (!observedKeys.length) {
        return { ticks: [], series: [], allSeries: null, rangeInfo, isDayMode };
      }

      observedKeys.sort();
      const minKey = observedKeys[0];
      const maxKey = observedKeys[observedKeys.length - 1];

      // When a date range is active, always span from the range boundaries so
      // days/months with zero counts (e.g. the tail of February) are still shown.
      let tickMin, tickMax;
      if (useRange && rangeStart && rangeEnd) {
        if (isDayMode) {
          const pad = d => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dy = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${dy}`;
          };
          tickMin = pad(rangeStart);
          tickMax = pad(rangeEnd);
        } else {
          const padM = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          tickMin = padM(rangeStart);
          tickMax = padM(rangeEnd);
        }
      } else {
        tickMin = minKey;
        tickMax = maxKey;
      }

      // Build the full continuous tick list
      const ticks = isDayMode
        ? buildContinuousDayRange(tickMin, tickMax)
        : buildContinuousMonthRange(tickMin, tickMax);

      let series = Object.keys(countsByStatus).map(status => ({
        key: status,
        label: STATUS_DISPLAY[status] || status,
        values: ticks.map(t => ({ tick: t, count: countsByStatus[status][t] || 0 }))
      }));

      if (plotState.timelineMode === "cumulative") {
        series = makeSeriesCumulativeTicks(series);
      }

      let allSeries = null;
      if (plotState.showAllSubmissions) {
        allSeries = {
          key: "__ALL__",
          label: "All Submissions",
          values: ticks.map(t => ({ tick: t, count: countsByKeyAll[t] || 0 }))
        };
        if (plotState.timelineMode === "cumulative") {
          allSeries = makeSeriesCumulativeTicks([allSeries])[0];
        }
      }

      return { ticks, series, allSeries, rangeInfo, isDayMode };
    }

    function renderTimelineChart(timelineData) {
      const chart = document.getElementById("wfns-timeline-chart");
      if (!chart) return;
      chart.innerHTML = "";

      const { ticks, series, allSeries, rangeInfo, isDayMode } = timelineData;

      if (!ticks || !ticks.length || !series.length) {
        chart.textContent = "No timeline data for selected filters.";
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

      const isDark = document.body.classList.contains("dark") ||
                     document.documentElement.classList.contains("dark");
      const COLOR_AXIS  = isDark ? "#cccccc" : "#333333";
      const COLOR_GRID  = isDark ? "#3a3a3a" : "#dddddd";
      const COLOR_TEXT  = isDark ? "#e8e8e8" : "#000000";
      const COLOR_MUTED = isDark ? "#aaaaaa" : "#555555";
      const COLOR_BG    = isDark ? "#242424" : "#ffffff";
      const ALL_COLOR   = isDark ? "#f0b429" : "#e67e00";

      const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

      const outer = document.createElement("div");
      outer.className = "wfns-chart-card";

      const titleEl = document.createElement("div");
      titleEl.className = "wfns-chart-title";
      const areaText = plotState.timelineAreaFilter && plotState.timelineAreaFilter !== "__ALL__"
        ? ` (${plotState.timelineAreaFilter})` : " (All areas)";
      const modeText = plotState.timelineMode === "cumulative"
        ? "Cumulative Nominations Over Time" : "Nominations Over Time";
      const rangeText = (plotState.timelineRangeEnabled && plotState.timelineRangeStart && plotState.timelineRangeEnd)
        ? ` [${plotState.timelineRangeStart} → ${plotState.timelineRangeEnd}]` : "";
      titleEl.textContent = `${modeText}${areaText}${rangeText}`;
      outer.appendChild(titleEl);

      // ── Y-scale ──
      const allSeriesValues = allSeries ? allSeries.values.map(v => v.count) : [];
      const rawMaxY = Math.max(1, ...series.flatMap(s => s.values.map(v => v.count)), ...allSeriesValues);
      const yStep = getNiceStep(rawMaxY);
      const maxY  = getNiceAxisMax(rawMaxY);

      // ── Layout ──
      const margin      = { top: 60, right: 60, bottom: 80, left: 70 };
      const xPadLeft    = 30;
      const height      = 440;
      const innerHeight = height - margin.top - margin.bottom;
      const axisExtend  = 14;
      const isScrollable = plotState.timelineViewMode === "scrollable";

      let svgWidth, xStepSize;

      if (isDayMode) {
        // Day granularity: each tick is a day; fixed or responsive
        const tickEvery  = rangeInfo ? rangeInfo.tickEvery : 1;
        // xStepSize is always pixels-per-day; tickEvery only controls label density
        if (isScrollable) {
          xStepSize = 28; // 28px per day regardless of label density
          svgWidth  = margin.left + xPadLeft + (ticks.length - 1) * xStepSize
                      + margin.right + xPadLeft;
          svgWidth  = Math.max(svgWidth, 400);
        } else {
          const containerWidth = chart.clientWidth || 700;
          svgWidth  = containerWidth;
          const totalInner = svgWidth - margin.left - margin.right - xPadLeft;
          const innerData  = Math.floor(totalInner * 0.9);
          xStepSize = ticks.length > 1 ? innerData / (ticks.length - 1) : 0;
        }
      } else {
        // Month granularity (same as before)
        if (isScrollable) {
          xStepSize = 28;
          svgWidth  = margin.left + xPadLeft + (ticks.length - 1) * xStepSize
                      + margin.right + xPadLeft;
          svgWidth  = Math.max(svgWidth, 400);
        } else {
          const containerWidth = chart.clientWidth || 700;
          svgWidth  = containerWidth;
          const totalInner = svgWidth - margin.left - margin.right - xPadLeft;
          const innerData  = Math.floor(totalInner * 0.9);
          xStepSize = ticks.length > 1 ? innerData / (ticks.length - 1) : 0;
        }
      }

      const innerWidth = ticks.length > 1
        ? (ticks.length - 1) * xStepSize
        : xStepSize;

      const getX = (i) => margin.left + xPadLeft + i * xStepSize;
      const getY = (v) => margin.top + innerHeight - (v / maxY) * innerHeight;

      // ── SVG ──
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", svgWidth);
      svg.setAttribute("height", height + 30);
      svg.style.cssText = `display:block; background:${COLOR_BG};`;
      if (!isScrollable) svg.style.width = "100%";

      // ── Arrow marker ──
      const defs   = document.createElementNS(svgNS, "defs");
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", "wfns-arrow");
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
      xAxis.setAttribute("marker-end", "url(#wfns-arrow)");
      svg.appendChild(xAxis);

      const yAxis = document.createElementNS(svgNS, "line");
      yAxis.setAttribute("x1", margin.left); yAxis.setAttribute("y1", margin.top + innerHeight);
      yAxis.setAttribute("x2", margin.left); yAxis.setAttribute("y2", margin.top - axisExtend);
      yAxis.setAttribute("stroke", COLOR_AXIS); yAxis.setAttribute("stroke-width", "1.5");
      yAxis.setAttribute("marker-end", "url(#wfns-arrow)");
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

      // ── X-axis ticks + labels ──
      const bracketY   = margin.top + innerHeight + 28;
      const yearLabelY = bracketY + 24;

      if (isDayMode) {
        // Determine which subMode applies (falls back to "every" if no rangeInfo)
        const daySubMode = rangeInfo ? rangeInfo.subMode : "every";
        const monthGroups = {};

        ticks.forEach((dayKey, i) => {
          const [year, mm, dd] = dayKey.split("-");
          const ddNum = parseInt(dd, 10);
          const monthKey = `${year}-${mm}`;
          if (!monthGroups[monthKey]) monthGroups[monthKey] = { start: i, end: i, year, mm };
          monthGroups[monthKey].end = i;

          const x = getX(i);
          const isLastTick   = i === ticks.length - 1;
          const dimInMonth   = daysInMonthForKey(dayKey);

          const isFirstTick  = i === 0;
          const isFirstOfMonth = ddNum === 1;
          const isLastOfMonth  = ddNum === dimInMonth;

          // Decide whether this day should be labelled
          let shouldLabel;
          if (isLastTick || isFirstTick) {
            shouldLabel = true; // always mark first and last date of the chart
          } else if (daySubMode === "every") {
            shouldLabel = true; // < 30 days: every day
          } else {
            // midrange: 1 / 10 / 20 / last-of-month (skip day-30 in 31-day months)
            shouldLabel = isMidrangeLabelDay(ddNum, dimInMonth);
          }

          // Tick mark — taller and darker on labelled days
          const tickEl = document.createElementNS(svgNS, "line");
          tickEl.setAttribute("x1", x); tickEl.setAttribute("y1", margin.top + innerHeight);
          tickEl.setAttribute("x2", x); tickEl.setAttribute("y2", margin.top + innerHeight + (shouldLabel ? 6 : 3));
          tickEl.setAttribute("stroke", shouldLabel ? COLOR_AXIS : COLOR_MUTED);
          tickEl.setAttribute("stroke-width", shouldLabel ? "1.2" : "0.7");
          svg.appendChild(tickEl);

          if (shouldLabel) {
            const lbl = document.createElementNS(svgNS, "text");
            lbl.setAttribute("x", x); lbl.setAttribute("y", margin.top + innerHeight + 15);
            // Anchor logic to prevent label collisions at month boundaries:
            //   • first tick of chart   → "start"  (leans right, no left overflow)
            //   • last tick of chart    → "end"    (leans left, no right overflow)
            //   • first day of a month  → "start"  (leans right, away from prev-month last-day label)
            //   • last day of a month   → "end"    (leans left, away from next-month first-day label)
            //   • everything else       → "middle"
            let anchor;
            if (isFirstTick) {
              anchor = "end";
            } else if (isLastTick) {
              anchor = "start";
            } else if (isFirstOfMonth) {
              anchor = "start";
            } else if (isLastOfMonth) {
              anchor = "end";
            } else {
              anchor = "middle";
            }
            lbl.setAttribute("text-anchor", anchor);
            lbl.setAttribute("font-size", "9");
            lbl.setAttribute("fill", (isFirstTick || isLastTick) ? COLOR_AXIS : COLOR_TEXT);
            lbl.setAttribute("font-weight", (isFirstTick || isLastTick) ? "700" : "400");
            lbl.textContent = dd;
            svg.appendChild(lbl);
          }
        });

        // Month brackets (replaces year brackets in day mode)
        Object.entries(monthGroups).forEach(([monthKey, { start, end, year, mm }]) => {
          const xStart = getX(start);
          const xEnd   = getX(end);
          const midX   = (xStart + xEnd) / 2;
          const bBot   = bracketY + 10;
          const mIdx   = parseInt(mm, 10) - 1;

          [[xStart, bracketY, xStart, bBot],
           [xStart, bBot,     xEnd,   bBot],
           [xEnd,   bracketY, xEnd,   bBot]].forEach(([x1, y1, x2, y2]) => {
            const l = document.createElementNS(svgNS, "line");
            l.setAttribute("x1", x1); l.setAttribute("y1", y1);
            l.setAttribute("x2", x2); l.setAttribute("y2", y2);
            l.setAttribute("stroke", COLOR_MUTED); l.setAttribute("stroke-width", "1");
            svg.appendChild(l);
          });

          // "Jan 2025" label under each month bracket
          const mLbl = document.createElementNS(svgNS, "text");
          mLbl.setAttribute("x", midX); mLbl.setAttribute("y", yearLabelY);
          mLbl.setAttribute("text-anchor", "middle"); mLbl.setAttribute("font-size", "10");
          mLbl.setAttribute("font-weight", "600"); mLbl.setAttribute("fill", COLOR_TEXT);
          mLbl.textContent = `${MONTH_ABBR[mIdx]} ${year}`;
          svg.appendChild(mLbl);
        });

      } else {
        // Month-mode: same label density logic as before
        const numYears = Object.keys(
          ticks.reduce((acc, m) => { acc[m.split("-")[0]] = 1; return acc; }, {})
        ).length;

        const yearGroups = {};
        ticks.forEach((tick, i) => {
          const [year] = tick.split("-");
          if (!yearGroups[year]) yearGroups[year] = { start: i, end: i };
          yearGroups[year].end = i;
        });

        ticks.forEach((tick, i) => {
          const x = getX(i);
          const [, monthNum] = tick.split("-");
          const mIdx = parseInt(monthNum, 10) - 1;
          const isLastTick = i === ticks.length - 1;

          const tickEl = document.createElementNS(svgNS, "line");
          tickEl.setAttribute("x1", x); tickEl.setAttribute("y1", margin.top + innerHeight);
          tickEl.setAttribute("x2", x); tickEl.setAttribute("y2", margin.top + innerHeight + (isLastTick ? 6 : 4));
          tickEl.setAttribute("stroke", isLastTick ? COLOR_AXIS : COLOR_AXIS);
          tickEl.setAttribute("stroke-width", isLastTick ? "1.8" : "1");
          svg.appendChild(tickEl);

          let labelText = null;
          if (isLastTick)             labelText = MONTH_ABBR[mIdx];
          else if (isScrollable)      labelText = MONTH_ABBR[mIdx];
          else if (numYears <= 3)     labelText = MONTH_ABBR[mIdx];
          else if (numYears <= 6)     labelText = MONTH_ABBR[mIdx][0];

          if (labelText) {
            const lbl = document.createElementNS(svgNS, "text");
            lbl.setAttribute("x", x); lbl.setAttribute("y", margin.top + innerHeight + 15);
            lbl.setAttribute("text-anchor", isLastTick ? "end" : "middle");
            lbl.setAttribute("font-size", "10");
            lbl.setAttribute("fill", COLOR_TEXT);
            lbl.setAttribute("font-weight", isLastTick ? "700" : "400");
            lbl.textContent = labelText;
            svg.appendChild(lbl);
          }
        });

        // Year brackets
        Object.entries(yearGroups).forEach(([year, { start, end }]) => {
          const xStart = getX(start);
          const xEnd   = getX(end);
          const midX   = (xStart + xEnd) / 2;
          const bBot   = bracketY + 10;

          [[xStart, bracketY, xStart, bBot],
           [xStart, bBot,     xEnd,   bBot],
           [xEnd,   bracketY, xEnd,   bBot]].forEach(([x1, y1, x2, y2]) => {
            const l = document.createElementNS(svgNS, "line");
            l.setAttribute("x1", x1); l.setAttribute("y1", y1);
            l.setAttribute("x2", x2); l.setAttribute("y2", y2);
            l.setAttribute("stroke", COLOR_MUTED); l.setAttribute("stroke-width", "1");
            svg.appendChild(l);
          });

          const yearText = document.createElementNS(svgNS, "text");
          yearText.setAttribute("x", midX); yearText.setAttribute("y", yearLabelY);
          yearText.setAttribute("text-anchor", "middle"); yearText.setAttribute("font-size", "11");
          yearText.setAttribute("font-weight", "600"); yearText.setAttribute("fill", COLOR_TEXT);
          yearText.textContent = year;
          svg.appendChild(yearText);
        });
      }

      // ── Draw series lines ──
      function drawSeries(s, color, dashArray) {
        const points = s.values.map((v, i) => `${getX(i)},${getY(v.count)}`).join(" ");
        const polyline = document.createElementNS(svgNS, "polyline");
        polyline.setAttribute("fill", "none"); polyline.setAttribute("stroke", color);
        polyline.setAttribute("stroke-width", "2.5");
        if (dashArray) polyline.setAttribute("stroke-dasharray", dashArray);
        polyline.setAttribute("points", points);
        svg.appendChild(polyline);

        s.values.forEach((v, i) => {
          const cx = getX(i);
          const cy = getY(v.count);

          const circle = document.createElementNS(svgNS, "circle");
          circle.setAttribute("cx", cx); circle.setAttribute("cy", cy);
          circle.setAttribute("r", "3"); circle.setAttribute("fill", color);
          const titleNode = document.createElementNS(svgNS, "title");
          titleNode.textContent = `${s.label} | ${v.tick || v.month}: ${v.count}`;
          circle.appendChild(titleNode);
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
      svgWrap.id = "wfns-timeline-wrap";
      svgWrap.style.cssText = isScrollable
        ? "overflow-x: auto; padding-bottom: 6px;"
        : "overflow-x: hidden; padding-bottom: 6px;";
      svgWrap.appendChild(svg);
      outer.appendChild(svgWrap);

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
      outer.appendChild(legend);
      chart.appendChild(outer);
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
    //location plot
      const stackedData = buildStackedAreaData(nominations);
      const topAreas = getTopAreas(stackedData, plotState.maxBars);
      renderVerticalStackedBarChart(topAreas);

      //timeline plot
      const timelineData = buildTimelineLineData(nominations);
      renderTimelineChart(timelineData);
    }

    function getAvailableAreas(nominations) {
      const areas = Array.from(
        new Set(
          nominations
            .filter(n => n)
            .map(n => getAreaLabel(n, plotState.aggregationMode))
        )
      ).sort();

      return areas;
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

}

init();

