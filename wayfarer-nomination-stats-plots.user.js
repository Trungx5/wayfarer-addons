// ==UserScript==
// @name        Wayfarer Nomination Stats Plots (Dev)
// @version     0.0.14
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
      timelineMode: "cumulative" // or "monthly"
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

            .lbl-toggle-ns:hover {
                color: lightgrey;
            }

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

            .toggle {
                display:none;
            }

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
                border-bottom: 1px solid rgba(0, 0, 0, 1);
                border-left: 1px solid rgba(0, 0, 0, 1);
                border-right: 1px solid rgba(0, 0, 0, 1);
                border-bottom-left-radius: 7px;
                border-bottom-right-radius: 7px;
                padding: .5rem 1rem;
            }

            /* Force controls text to black */
            #wfns-plots-root select,
            #wfns-plots-root button {
                color: #000 !important;
            }

            /* Ensure dropdown text + options are readable */
            #wfns-plots-root select option {
                color: #000;
            }

            /* Labels (like "Max bars", "Timeline area", etc.) */
            #wfns-plots-root div {
                color: #000;
            }

            /* Buttons specifically */
            #wfns-plots-root button {
                color: #000 !important;
                font-weight: 500;
            }

            #wfns-plots-root {
                width: 100%;
                max-width: none;
                margin: 16px 0 0 0;
            }

            #wfns-plots-inner,
            #wfns-plot-chart,
            #wfns-timeline-chart {
                width: 100%;
                max-width: none;
            }

            #wfns-bars-wrap {
                justify-content: flex-start;
            }

            #wfns-bars-wrap {
                justify-content: flex-start;
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

      // Max bars selector
      const maxBarsBlock = document.createElement("div");
      maxBarsBlock.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px;">Max bars</div>
        <select id="wfns-max-bars" style="padding: 4px 6px; border-radius: 4px;">
          <option value="20" ${plotState.maxBars === 20 ? "selected" : ""}>20</option>
          <option value="50" ${plotState.maxBars === 50 ? "selected" : ""}>50</option>
          <option value="100" ${plotState.maxBars === 100 ? "selected" : ""}>100</option>
          <option value="200" ${plotState.maxBars === 200 ? "selected" : ""}>200</option>
          <option value="all" ${plotState.maxBars === "all" ? "selected" : ""}>All</option>
        </select>
      `;
      wrapper.appendChild(maxBarsBlock);

      // Aggregation selector
      const aggBlock = document.createElement("div");
      aggBlock.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px;">Aggregate by</div>
        <label style="display:block; margin-bottom:4px;">
          <input type="radio" name="wfns-agg" value="cityState" ${plotState.aggregationMode === "cityState" ? "checked" : ""}>
          City + State
        </label>
        <label style="display:block;">
          <input type="radio" name="wfns-agg" value="state" ${plotState.aggregationMode === "state" ? "checked" : ""}>
          State
        </label>
      `;
      wrapper.appendChild(aggBlock);

      // Timeline area selector
      const timelineAreaBlock = document.createElement("div");
      timelineAreaBlock.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px;">Timeline area</div>
        <select id="wfns-timeline-area" style="padding: 4px 6px; border-radius: 4px;">
          <option value="__ALL__">All areas</option>
        </select>
      `;
      wrapper.appendChild(timelineAreaBlock);

      // Type selector
      const typeBlock = document.createElement("div");
      typeBlock.innerHTML = `<div style="font-weight: 600; margin-bottom: 6px;">Types</div>`;
      PLOT_TYPE_OPTIONS.forEach(type => {
        const label = document.createElement("label");
        label.style.display = "block";
        label.style.marginBottom = "4px";
        label.innerHTML = `
          <input type="checkbox" data-type="${type}" ${plotState.selectedTypes.has(type) ? "checked" : ""}>
          ${TYPE_DISPLAY[type] || type}
        `;
        typeBlock.appendChild(label);
      });
      wrapper.appendChild(typeBlock);

      // Status selector
      const statusBlock = document.createElement("div");
      statusBlock.innerHTML = `<div style="font-weight: 600; margin-bottom: 6px;">Statuses</div>`;
      PLOT_STATUS_TYPES.forEach(status => {
        const label = document.createElement("label");
        label.style.display = "block";
        label.style.marginBottom = "4px";
        label.innerHTML = `
          <input type="checkbox" data-status="${status}" ${plotState.selectedStatuses.has(status) ? "checked" : ""}>
          ${STATUS_DISPLAY[status] || status}
        `;
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
          <div style="font-weight: 600; margin-bottom: 6px;">Export area plot</div>
          <button id="wfns-export-area-image" style="
            padding: 6px 10px;
            border-radius: 4px;
            border: none;
            background: #e5e5e5;
            cursor: pointer;
            width: 100%;
          ">
            Download Area PNG
          </button>
        </div>

        <div>
          <div style="font-weight: 600; margin-bottom: 6px;">Export timeline plot</div>
          <button id="wfns-export-timeline-image" style="
            padding: 6px 10px;
            border-radius: 4px;
            border: none;
            background: #e5e5e5;
            cursor: pointer;
            width: 100%;
          ">
            Download Timeline PNG
          </button>
        </div>
      `;
      wrapper.appendChild(exportBlock);

      controls.appendChild(wrapper);

      // Populate timeline area dropdown
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

      const timelineModeBlock = document.createElement("div");
      timelineModeBlock.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px;">Timeline mode</div>
        <label style="display:block; margin-bottom:4px;">
          <input type="radio" name="wfns-timeline-mode" value="monthly" ${plotState.timelineMode === "monthly" ? "checked" : ""}>
          Monthly
        </label>
        <label style="display:block;">
          <input type="radio" name="wfns-timeline-mode" value="cumulative" ${plotState.timelineMode === "cumulative" ? "checked" : ""}>
          Cumulative
        </label>
      `;
      wrapper.appendChild(timelineModeBlock);

      controls.querySelectorAll('input[name="wfns-timeline-mode"]').forEach(input => {
        input.addEventListener("change", (e) => {
          plotState.timelineMode = e.target.value;
          renderPlots();
        });
      });

      const maxBarsSelect = controls.querySelector("#wfns-max-bars");
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

      const maxTotal = Math.max(...areaRows.map(row => row.total));

      const outer = document.createElement("div");
      outer.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #fff;
        padding: 16px;
      `;

      const title = document.createElement("div");
      title.textContent = "Nominations by Area";
      title.style.cssText = "font-weight: 700; margin-bottom: 12px; color: #000;";
      outer.appendChild(title);

      const barsWrap = document.createElement("div");
      barsWrap.id = "wfns-bars-wrap";
      barsWrap.style.cssText = `
        display: flex;
        align-items: flex-end;
        gap: 12px;
        min-height: 280px;
        padding: 12px 0 4px 0;
        border-bottom: 1px solid #ccc;
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
        `;

        const totalLabel = document.createElement("div");
        totalLabel.textContent = row.total;
        totalLabel.style.cssText = `
          font-size: 12px;
          margin-bottom: 6px;
          color: #000;
        `;

        const barOuter = document.createElement("div");
        barOuter.style.cssText = `
          width: 42px;
          height: 220px;
          display: flex;
          flex-direction: column-reverse;
          justify-content: flex-start;
          border: 1px solid #bbb;
          background: #f7f7f7;
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
          segment.style.width = "100%";
          segment.style.height = `${(row.counts[status] / row.total) * scaledHeight}px`;
          segment.style.background = STATUS_COLORS[status] || "#888";
          segment.title = `${row.area} | ${STATUS_DISPLAY[status] || status}: ${row.counts[status]}`;
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
          color: #000;
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
        item.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #000;
        `;
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

      PLOT_STATUS_TYPES.forEach(status => {
        if (plotState.selectedStatuses.has(status)) {
          countsByStatus[status] = {};
        }
      });

      nominations.forEach(nomination => {
        if (!nomination) return;
        if (!plotState.selectedStatuses.has(nomination.status)) return;

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

      return { months, series };
    }

    function renderTimelineChart(timelineData) {
      const chart = document.getElementById("wfns-timeline-chart");
      if (!chart) return;

      chart.innerHTML = "";

      const { months, series } = timelineData;

      if (!months.length || !series.length) {
        chart.textContent = "No timeline data for selected filters.";
        return;
      }

      const outer = document.createElement("div");
      outer.style.cssText = `
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #fff;
        padding: 16px;
      `;

      const title = document.createElement("div");
      const areaText =
        plotState.timelineAreaFilter && plotState.timelineAreaFilter !== "__ALL__"
          ? ` (${plotState.timelineAreaFilter})`
          : " (All areas)";
      const modeText = plotState.timelineMode === "cumulative" ? "Cumulative Nominations Over Time" : "Nominations Over Time";
      title.textContent = `${modeText}${areaText}`;
      title.style.cssText = "font-weight: 700; margin-bottom: 12px; color: #000;";
      outer.appendChild(title);

      const rawMaxY = Math.max(
        1,
        ...series.flatMap(s => s.values.map(v => v.count))
      );
      const yStep = getNiceStep(rawMaxY);
      const maxY = getNiceAxisMax(rawMaxY);

      const width = Math.max(700, months.length * 24);
      const height = 320;
      const margin = { top: 20, right: 20, bottom: 50, left: 60 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      svg.style.display = "block";
      svg.style.background = "#fff";

      const xStep = months.length > 1 ? innerWidth / (months.length - 1) : 0;
      const getX = (i) => margin.left + (months.length > 1 ? i * xStep : innerWidth / 2);
      const getY = (v) => margin.top + innerHeight - (v / maxY) * innerHeight;

      const xAxis = document.createElementNS(svgNS, "line");
      xAxis.setAttribute("x1", margin.left);
      xAxis.setAttribute("y1", margin.top + innerHeight);
      xAxis.setAttribute("x2", margin.left + innerWidth);
      xAxis.setAttribute("y2", margin.top + innerHeight);
      xAxis.setAttribute("stroke", "#333");
      svg.appendChild(xAxis);

      const yAxis = document.createElementNS(svgNS, "line");
      yAxis.setAttribute("x1", margin.left);
      yAxis.setAttribute("y1", margin.top);
      yAxis.setAttribute("x2", margin.left);
      yAxis.setAttribute("y2", margin.top + innerHeight);
      yAxis.setAttribute("stroke", "#333");
      svg.appendChild(yAxis);

      // y-axis ticks and labels
      for (let value = 0; value <= maxY; value += yStep) {
        const y = getY(value);

        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", margin.left - 5);
        tick.setAttribute("y1", y);
        tick.setAttribute("x2", margin.left);
        tick.setAttribute("y2", y);
        tick.setAttribute("stroke", "#333");
        svg.appendChild(tick);

        const grid = document.createElementNS(svgNS, "line");
        grid.setAttribute("x1", margin.left);
        grid.setAttribute("y1", y);
        grid.setAttribute("x2", margin.left + innerWidth);
        grid.setAttribute("y2", y);
        grid.setAttribute("stroke", "#ddd");
        grid.setAttribute("stroke-dasharray", "2,2");
        svg.appendChild(grid);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", margin.left - 8);
        label.setAttribute("y", y + 4);
        label.setAttribute("text-anchor", "end");
        label.setAttribute("font-size", "11");
        label.setAttribute("fill", "#000");
        label.textContent = value;
        svg.appendChild(label);
      }

      const yTitle = document.createElementNS(svgNS, "text");
      yTitle.setAttribute("x", 14);
      yTitle.setAttribute("y", margin.top + innerHeight / 2);
      yTitle.setAttribute("text-anchor", "middle");
      yTitle.setAttribute("font-size", "12");
      yTitle.setAttribute("fill", "#000");
      yTitle.setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);
      yTitle.textContent = "Count";
      svg.appendChild(yTitle);

      months.forEach((month, i) => {
        const x = getX(i);
        const [year, monthNum] = month.split("-");

        // minor tick for every month
        const tick = document.createElementNS(svgNS, "line");
        tick.setAttribute("x1", x);
        tick.setAttribute("y1", margin.top + innerHeight);
        tick.setAttribute("x2", x);
        tick.setAttribute("y2", margin.top + innerHeight + 5);
        tick.setAttribute("stroke", "#333");
        svg.appendChild(tick);

        // label only January
        if (monthNum === "01") {
          const label = document.createElementNS(svgNS, "text");
          label.setAttribute("x", x);
          label.setAttribute("y", margin.top + innerHeight + 18);
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("font-size", "11");
          label.setAttribute("fill", "#000");
          label.textContent = year;
          svg.appendChild(label);
        }
      });

      series.forEach(s => {
        const color = STATUS_COLORS[s.key] || "#888";
        const points = s.values.map((v, i) => `${getX(i)},${getY(v.count)}`).join(" ");

        const polyline = document.createElementNS(svgNS, "polyline");
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("stroke", color);
        polyline.setAttribute("stroke-width", "2.5");
        polyline.setAttribute("points", points);
        svg.appendChild(polyline);

        s.values.forEach((v, i) => {
          const circle = document.createElementNS(svgNS, "circle");
          circle.setAttribute("cx", getX(i));
          circle.setAttribute("cy", getY(v.count));
          circle.setAttribute("r", "3");
          circle.setAttribute("fill", color);

          const titleNode = document.createElementNS(svgNS, "title");
          titleNode.textContent = `${s.label} | ${v.month}: ${v.count}`;
          circle.appendChild(titleNode);

          svg.appendChild(circle);
        });
      });

      const svgWrap = document.createElement("div");
      svgWrap.id = "wfns-timeline-wrap";
      svgWrap.style.cssText = `
        overflow-x: auto;
        padding-bottom: 6px;
      `;
      svgWrap.appendChild(svg);
      outer.appendChild(svgWrap);

      const legend = document.createElement("div");
      legend.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 12px;
      `;

      series.forEach(s => {
        const color = STATUS_COLORS[s.key] || "#888";
        const item = document.createElement("div");
        item.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #000;
        `;
        item.innerHTML = `
          <span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;"></span>
          <span>${s.label}</span>
        `;
        legend.appendChild(item);
      });

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

