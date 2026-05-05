// ==UserScript==
// @name        Wayfarer Nomination Stats Plots (Dev)
// @version     0.0.18
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
      showAllSubmissions: false // overlay total submissions line regardless of status filter
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
      renderPlots();
    }

    function renderPlotControls() {
      const controls = document.getElementById("wfns-plot-controls");
      if (!controls) return;

      controls.innerHTML = "";

      const wrapper = document.createElement("div");
      wrapper.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 16px;
        align-items: flex-start;
        justify-content: space-between;
      `;

      // Helper to create a styled control block with background bar
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

      // Max bars selector
      const maxBarsBlock = makeControlBlock();
      maxBarsBlock.appendChild(makeControlLabel("Max Bars"));
      const maxBarsSelect = document.createElement("select");
      maxBarsSelect.id = "wfns-max-bars";
      maxBarsSelect.style.cssText = "padding: 4px 6px; border-radius: 4px;";
      [20, 50, 100, 200].forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        if (plotState.maxBars === v) opt.selected = true;
        maxBarsSelect.appendChild(opt);
      });
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "All";
      if (plotState.maxBars === "all") allOpt.selected = true;
      maxBarsSelect.appendChild(allOpt);
      maxBarsBlock.appendChild(maxBarsSelect);
      wrapper.appendChild(maxBarsBlock);

      // Aggregation selector
      const aggBlock = makeControlBlock();
      aggBlock.appendChild(makeControlLabel("Aggregate By"));
      [["cityState", "City + State"], ["state", "State"]].forEach(([val, text]) => {
        const lbl = document.createElement("label");
        lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
        lbl.innerHTML = `<input type="radio" name="wfns-agg" value="${val}" ${plotState.aggregationMode === val ? "checked" : ""}> ${text}`;
        aggBlock.appendChild(lbl);
      });
      wrapper.appendChild(aggBlock);

      // Timeline area selector
      const timelineAreaBlock = makeControlBlock();
      timelineAreaBlock.appendChild(makeControlLabel("Timeline Area"));
      const timelineAreaSelect = document.createElement("select");
      timelineAreaSelect.id = "wfns-timeline-area";
      timelineAreaSelect.style.cssText = "padding: 4px 6px; border-radius: 4px; max-width: 140px;";
      const allAreaOpt = document.createElement("option");
      allAreaOpt.value = "__ALL__";
      allAreaOpt.textContent = "All areas";
      timelineAreaSelect.appendChild(allAreaOpt);
      timelineAreaBlock.appendChild(timelineAreaSelect);
      wrapper.appendChild(timelineAreaBlock);

      // Timeline mode selector
      const timelineModeBlock = makeControlBlock();
      timelineModeBlock.appendChild(makeControlLabel("Timeline Mode"));
      [["monthly", "Monthly"], ["cumulative", "Cumulative"]].forEach(([val, text]) => {
        const lbl = document.createElement("label");
        lbl.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
        lbl.innerHTML = `<input type="radio" name="wfns-timeline-mode" value="${val}" ${plotState.timelineMode === val ? "checked" : ""}> ${text}`;
        timelineModeBlock.appendChild(lbl);
      });
      wrapper.appendChild(timelineModeBlock);

      // Data labels toggle
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
      wrapper.appendChild(dataLabelsBlock);

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
      wrapper.appendChild(allSubBlock);

      // Type selector
      const typeBlock = makeControlBlock();
      typeBlock.appendChild(makeControlLabel("Types"));
      PLOT_TYPE_OPTIONS.forEach(type => {
        const label = document.createElement("label");
        label.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
        label.innerHTML = `<input type="checkbox" data-type="${type}" ${plotState.selectedTypes.has(type) ? "checked" : ""}> ${TYPE_DISPLAY[type] || type}`;
        typeBlock.appendChild(label);
      });
      wrapper.appendChild(typeBlock);

      // Status selector
      const statusBlock = makeControlBlock();
      statusBlock.appendChild(makeControlLabel("Statuses"));
      PLOT_STATUS_TYPES.forEach(status => {
        const label = document.createElement("label");
        label.style.cssText = "display:block; margin-bottom:4px; cursor:pointer;";
        label.innerHTML = `<input type="checkbox" data-status="${status}" ${plotState.selectedStatuses.has(status) ? "checked" : ""}> ${STATUS_DISPLAY[status] || status}`;
        statusBlock.appendChild(label);
      });
      wrapper.appendChild(statusBlock);

      // Export buttons
      const exportBlock = document.createElement("div");
      exportBlock.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-left: auto;
        min-width: 180px;
      `;
      exportBlock.innerHTML = `
        <div>
          <div style="font-weight: 600; margin-bottom: 6px; color: var(--wfns-text);">Export area plot</div>
          <button id="wfns-export-area-image" style="
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--wfns-border);
            background: var(--wfns-btn-bg);
            color: var(--wfns-btn-text);
            cursor: pointer;
            width: 100%;
          ">Download Area PNG</button>
        </div>
        <div>
          <div style="font-weight: 600; margin-bottom: 6px; color: var(--wfns-text);">Export timeline plot</div>
          <button id="wfns-export-timeline-image" style="
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--wfns-border);
            background: var(--wfns-btn-bg);
            color: var(--wfns-btn-text);
            cursor: pointer;
            width: 100%;
          ">Download Timeline PNG</button>
        </div>
      `;
      wrapper.appendChild(exportBlock);

      controls.appendChild(wrapper);

      // Populate timeline area dropdown
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

      if (maxBarsSelect) {
        maxBarsSelect.addEventListener("change", (e) => {
          plotState.maxBars = e.target.value === "all" ? "all" : Number(e.target.value);
          renderPlots();
        });
      }

      const exportAreaBtn = controls.querySelector("#wfns-export-area-image");
      if (exportAreaBtn) {
        exportAreaBtn.addEventListener("click", () => {
          exportAreaPlotAsPng();
        });
      }

      const exportTimelineBtn = controls.querySelector("#wfns-export-timeline-image");
      if (exportTimelineBtn) {
        exportTimelineBtn.addEventListener("click", () => {
          exportTimelinePlotAsPng();
        });
      }
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

      nominations.forEach(nomination => {
        if (!nomination) return;
        if (!plotState.selectedStatuses.has(nomination.status)) return;

        const typeMatch = Array.from(plotState.selectedTypes).some(type =>
          nominationMatchesSelectedType(nomination, type)
        );

        if (!typeMatch) return;

        const area = getAreaLabel(nomination, plotState.aggregationMode);

        if (!result[area]) {
          result[area] = {};
        }

        if (!result[area][nomination.status]) {
          result[area][nomination.status] = 0;
        }

        result[area][nomination.status] += 1;
      });

      return result;
    }


    function getTopAreas(stackedData, maxBars = 20) {
      const rows = Object.entries(stackedData)
        .map(([area, counts]) => {
          const total = Object.values(counts).reduce((sum, val) => sum + val, 0);
          return { area, counts, total };
        })
        .sort((a, b) => b.total - a.total);

      if (maxBars === "all") {
        return rows;
      }

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

      const maxTotal = Math.max(...areaRows.map(row => row.total));

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

        const totalLabel = document.createElement("div");
        totalLabel.textContent = row.total;
        totalLabel.style.cssText = `
          font-size: 12px;
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

        const scaledHeight = maxTotal > 0 ? (row.total / maxTotal) * 220 : 0;

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
          const segHeight = (row.counts[status] / row.total) * scaledHeight;
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

    function buildContinuousMonthRange(minMonth, maxMonth) {
      const months = [];
      if (!minMonth || !maxMonth) return months;

      let [year, month] = minMonth.split("-").map(Number);
      const [maxYear, maxMonthNum] = maxMonth.split("-").map(Number);

      while (year < maxYear || (year === maxYear && month <= maxMonthNum)) {
        months.push(`${year}-${String(month).padStart(2, "0")}`);
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }

      return months;
    }

    function buildTimelineLineData(nominations) {
      const observedMonths = [];
      const countsByStatus = {};
      const countsByMonthAll = {}; // total submissions regardless of status

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
        ) {
          return;
        }

        const month = getMonthKey(nomination);
        if (!month || month === "Unknown") return;

        observedMonths.push(month);

        // "All submissions" counter — ignores status filter
        countsByMonthAll[month] = (countsByMonthAll[month] || 0) + 1;

        // Per-status counters — only for selected statuses
        if (!plotState.selectedStatuses.has(nomination.status)) return;
        if (!countsByStatus[nomination.status]) {
          countsByStatus[nomination.status] = {};
        }
        countsByStatus[nomination.status][month] =
          (countsByStatus[nomination.status][month] || 0) + 1;
      });

      if (!observedMonths.length) {
        return { months: [], series: [] };
      }

      observedMonths.sort();
      const minMonth = observedMonths[0];
      const maxMonth = observedMonths[observedMonths.length - 1];
      const months = buildContinuousMonthRange(minMonth, maxMonth);

      let series = Object.keys(countsByStatus).map(status => ({
        key: status,
        label: STATUS_DISPLAY[status] || status,
        values: months.map(month => ({
          month,
          count: countsByStatus[status][month] || 0
        }))
      }));

      if (plotState.timelineMode === "cumulative") {
        series = makeSeriesCumulative(series);
      }

      // Build "All Submissions" series if toggled on
      let allSeries = null;
      if (plotState.showAllSubmissions) {
        allSeries = {
          key: "__ALL__",
          label: "All Submissions",
          values: months.map(month => ({
            month,
            count: countsByMonthAll[month] || 0
          }))
        };
        if (plotState.timelineMode === "cumulative") {
          allSeries = makeSeriesCumulative([allSeries])[0];
        }
      }

      return { months, series, allSeries };
    }

    function renderTimelineChart(timelineData) {
      const chart = document.getElementById("wfns-timeline-chart");
      if (!chart) return;

      chart.innerHTML = "";

      const { months, series, allSeries } = timelineData;

      if (!months.length || !series.length) {
        chart.textContent = "No timeline data for selected filters.";
        return;
      }

      // Detect dark mode via the .dark class on <body> or <html>
      const isDark = document.body.classList.contains("dark") ||
                     document.documentElement.classList.contains("dark");

      const COLOR_AXIS   = isDark ? "#cccccc" : "#333333";
      const COLOR_GRID   = isDark ? "#3a3a3a" : "#dddddd";
      const COLOR_TEXT   = isDark ? "#e8e8e8" : "#000000";
      const COLOR_MUTED  = isDark ? "#aaaaaa" : "#555555";
      const COLOR_BG     = isDark ? "#242424" : "#ffffff";
      const COLOR_BORDER = isDark ? "#3a3a3a" : "#dddddd";
      const ALL_COLOR    = isDark ? "#f0b429" : "#e67e00"; // amber for "all submissions"

      const outer = document.createElement("div");
      outer.className = "wfns-chart-card";

      const titleEl = document.createElement("div");
      titleEl.className = "wfns-chart-title";
      const areaText =
        plotState.timelineAreaFilter && plotState.timelineAreaFilter !== "__ALL__"
          ? ` (${plotState.timelineAreaFilter})`
          : " (All areas)";
      const modeText = plotState.timelineMode === "cumulative" ? "Cumulative Nominations Over Time" : "Nominations Over Time";
      titleEl.textContent = `${modeText}${areaText}`;
      outer.appendChild(titleEl);

      // Include allSeries in Y-scale calculation
      const allSeriesValues = allSeries ? allSeries.values.map(v => v.count) : [];
      const rawMaxY = Math.max(
        1,
        ...series.flatMap(s => s.values.map(v => v.count)),
        ...allSeriesValues
      );
      const yStep = getNiceStep(rawMaxY);
      const maxY  = getNiceAxisMax(rawMaxY);

      // Responsive: use container width, fall back to 700 minimum
      const containerWidth = chart.clientWidth || 700;
      const width  = containerWidth;
      const height = 440;
      const margin = { top: 60, right: 60, bottom: 80, left: 70 };
      const xPadLeft  = 30;
      // Month axis spans 9/10 of the available inner width; the remaining 1/10 gives
      // room for the arrowhead and the last tick label to never be clipped.
      const totalInnerWidth = width - margin.left - margin.right - xPadLeft;
      const innerWidth  = Math.floor(totalInnerWidth * 0.9);
      const innerHeight = height - margin.top - margin.bottom;

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", width);
      svg.setAttribute("height", height + 30);
      svg.style.cssText = `display:block; background:${COLOR_BG}; width:100%;`;

      const xStep = months.length > 1 ? innerWidth / (months.length - 1) : 0;
      const getX  = (i) => margin.left + xPadLeft + (months.length > 1 ? i * xStep : innerWidth / 2);
      const getY  = (v) => margin.top + innerHeight - (v / maxY) * innerHeight;

      // ── Arrowhead marker ──
      const defs   = document.createElementNS(svgNS, "defs");
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", "wfns-arrow");
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", "6");
      marker.setAttribute("refY", "3");
      marker.setAttribute("orient", "auto");
      const arrowPath = document.createElementNS(svgNS, "path");
      arrowPath.setAttribute("d", "M0,0 L0,6 L8,3 z");
      arrowPath.setAttribute("fill", COLOR_AXIS);
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const axisExtend = 14;

      // X-axis — extend 10% more than innerWidth so the arrow clears the last label
      const xAxisEnd = margin.left + xPadLeft + innerWidth + Math.floor(totalInnerWidth * 0.1) - 4;
      const xAxis = document.createElementNS(svgNS, "line");
      xAxis.setAttribute("x1", margin.left);
      xAxis.setAttribute("y1", margin.top + innerHeight);
      xAxis.setAttribute("x2", xAxisEnd);
      xAxis.setAttribute("y2", margin.top + innerHeight);
      xAxis.setAttribute("stroke", COLOR_AXIS);
      xAxis.setAttribute("stroke-width", "1.5");
      xAxis.setAttribute("marker-end", "url(#wfns-arrow)");
      svg.appendChild(xAxis);

      // Y-axis
      const yAxis = document.createElementNS(svgNS, "line");
      yAxis.setAttribute("x1", margin.left);
      yAxis.setAttribute("y1", margin.top + innerHeight);
      yAxis.setAttribute("x2", margin.left);
      yAxis.setAttribute("y2", margin.top - axisExtend);
      yAxis.setAttribute("stroke", COLOR_AXIS);
      yAxis.setAttribute("stroke-width", "1.5");
      yAxis.setAttribute("marker-end", "url(#wfns-arrow)");
      svg.appendChild(yAxis);

      // ── Y-axis ticks, grid, labels ──
      for (let value = 0; value <= maxY; value += yStep) {
        const y = getY(value);

        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", margin.left - 5); tick.setAttribute("y1", y);
        tick.setAttribute("x2", margin.left);      tick.setAttribute("y2", y);
        tick.setAttribute("stroke", COLOR_AXIS);
        svg.appendChild(tick);

        const grid = document.createElementNS(svgNS, "line");
        grid.setAttribute("x1", margin.left); grid.setAttribute("y1", y);
        grid.setAttribute("x2", margin.left + xPadLeft + innerWidth); grid.setAttribute("y2", y);
        grid.setAttribute("stroke", COLOR_GRID);
        grid.setAttribute("stroke-dasharray", "2,2");
        svg.appendChild(grid);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", margin.left - 8);
        label.setAttribute("y", y + 4);
        label.setAttribute("text-anchor", "end");
        label.setAttribute("font-size", "11");
        label.setAttribute("fill", COLOR_TEXT);
        label.textContent = value;
        svg.appendChild(label);
      }

      // Y-axis title
      const yTitle = document.createElementNS(svgNS, "text");
      yTitle.setAttribute("x", 14);
      yTitle.setAttribute("y", margin.top + innerHeight / 2);
      yTitle.setAttribute("text-anchor", "middle");
      yTitle.setAttribute("font-size", "12");
      yTitle.setAttribute("fill", COLOR_TEXT);
      yTitle.setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);
      yTitle.textContent = "Count";
      svg.appendChild(yTitle);

      // ── X-axis: month abbreviations + year brackets ──
      const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

      const yearGroups = {};
      months.forEach((month, i) => {
        const [year] = month.split("-");
        if (!yearGroups[year]) yearGroups[year] = { start: i, end: i };
        yearGroups[year].end = i;
      });

      months.forEach((month, i) => {
        const x = getX(i);
        const [, monthNum] = month.split("-");
        const mIdx = parseInt(monthNum, 10) - 1;

        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", x); tick.setAttribute("y1", margin.top + innerHeight);
        tick.setAttribute("x2", x); tick.setAttribute("y2", margin.top + innerHeight + 4);
        tick.setAttribute("stroke", COLOR_AXIS);
        svg.appendChild(tick);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", x);
        label.setAttribute("y", margin.top + innerHeight + 15);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "10");
        label.setAttribute("fill", COLOR_TEXT);
        label.textContent = MONTH_ABBR[mIdx];
        svg.appendChild(label);
      });

      const bracketY   = margin.top + innerHeight + 28;
      const yearLabelY = bracketY + 24;

      Object.entries(yearGroups).forEach(([year, { start, end }]) => {
        const xStart = getX(start);
        const xEnd   = getX(end);
        const midX   = (xStart + xEnd) / 2;
        const bBot   = bracketY + 10;

        [[xStart, bracketY, xStart, bBot],
         [xStart, bBot,     xEnd,   bBot],
         [xEnd,   bracketY, xEnd,   bBot]].forEach(([x1,y1,x2,y2]) => {
          const l = document.createElementNS(svgNS, "line");
          l.setAttribute("x1",x1); l.setAttribute("y1",y1);
          l.setAttribute("x2",x2); l.setAttribute("y2",y2);
          l.setAttribute("stroke", COLOR_MUTED); l.setAttribute("stroke-width","1");
          svg.appendChild(l);
        });

        const yearText = document.createElementNS(svgNS, "text");
        yearText.setAttribute("x", midX);
        yearText.setAttribute("y", yearLabelY);
        yearText.setAttribute("text-anchor", "middle");
        yearText.setAttribute("font-size", "11");
        yearText.setAttribute("font-weight", "600");
        yearText.setAttribute("fill", COLOR_TEXT);
        yearText.textContent = year;
        svg.appendChild(yearText);
      });

      // ── Draw series lines ──
      function drawSeries(s, color, dashArray) {
        const points = s.values.map((v, i) => `${getX(i)},${getY(v.count)}`).join(" ");
        const polyline = document.createElementNS(svgNS, "polyline");
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("stroke", color);
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
          titleNode.textContent = `${s.label} | ${v.month}: ${v.count}`;
          circle.appendChild(titleNode);
          svg.appendChild(circle);

          if (plotState.showDataLabels && v.count > 0) {
            const lbl = document.createElementNS(svgNS, "text");
            lbl.setAttribute("x", cx);
            lbl.setAttribute("y", cy - 20);
            lbl.setAttribute("text-anchor", "middle");
            lbl.setAttribute("font-size", "9");
            lbl.setAttribute("fill", color);
            lbl.setAttribute("font-weight", "700");
            lbl.setAttribute("class", "wfns-data-label");
            lbl.textContent = v.count;
            svg.appendChild(lbl);
          }
        });
      }

      // Draw status series first, then All on top
      series.forEach(s => {
        drawSeries(s, STATUS_COLORS[s.key] || "#888", null);
      });

      if (allSeries) {
        drawSeries(allSeries, ALL_COLOR, "6,3");
      }

      const svgWrap = document.createElement("div");
      svgWrap.id = "wfns-timeline-wrap";
      svgWrap.style.cssText = "overflow-x: auto; padding-bottom: 6px;";
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
          <span>${s.label}</span>
        `;
        legend.appendChild(item);
      });

      if (allSeries) {
        const item = document.createElement("div");
        item.className = "wfns-legend-item";
        item.innerHTML = `
          <span style="display:inline-block;width:20px;height:3px;background:${ALL_COLOR};border-radius:2px;
            border-top: 2px dashed ${ALL_COLOR}; margin-top:4px;"></span>
          <span>All Submissions</span>
        `;
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
            return {
              ...v,
              count: runningTotal
            };
          })
        };
      });
    }

}

init();

