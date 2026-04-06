// ==UserScript==
// @name        Wayfarer Nomination Stats Plots (Dev)
// @version     0.0.8
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

    const EDIT_SUBTYPES = [
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
      maxBars: 20 // default number of bars to display in plot
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

    async function exportCurrentPlotAsPng() {
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
                addNominationDetails();
                addExportButtons();
                addUpgradeSetting();
            }, 300);
            

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }

    async function addNominationDetails() {
        awaitElement(() => document.querySelector('app-submissions-list'))
            .then((ref) => {
            addNotificationDiv();
            addCss();

            //start addition of basic bar plot
            //const areaCounts = getAcceptedNominationsByArea(nominations);

            //const chart = renderBarChart(areaCounts, "Accepted Nominations (NOMINATION only) by Area");

            //const list = document.querySelector('app-submissions-list');
            //if (list && list.parentNode) {
            //  list.parentNode.insertBefore(chart, list);
            //}

            //addPlotsSection();
            //end addition of basic bar plot

            const countsByTypeAndStatus = {
                "NOMINATION": {},
                "EDIT": {},
                "EDIT_LOCATION": {},
                "EDIT_DESCRIPTION": {},
                "EDIT_TITLE": {},
                "PHOTO": {},
                "TOTAL": {},
            };

            for (let i = 0; i < nominations.length; i++) {
                const { type, status, upgraded } = nominations[i];

                if (!countsByTypeAndStatus[type]) {
                    countsByTypeAndStatus[type] = {};
                }
                if (!countsByTypeAndStatus[type][status]) {
                    countsByTypeAndStatus[type][status] = 0;
                }

                // Increment counts based on status and upgraded flag
                // Not currently displayed in the stats
                countsByTypeAndStatus[type][status]++;
                if (status === "NOMINATED" && upgraded) {
                    countsByTypeAndStatus[type]["NOMINATED_UPGRADED"] = (countsByTypeAndStatus[type]["NOMINATED_UPGRADED"] || 0) + 1;
                } else if (status === "VOTING" && upgraded) {
                    countsByTypeAndStatus[type]["VOTING_UPGRADED"] = (countsByTypeAndStatus[type]["VOTING_UPGRADED"] || 0) + 1;
                }

                if (["ACCEPTED", "REJECTED", "DUPLICATE"].includes(status)) {
                    countsByTypeAndStatus[type]["DECIDED"] = (countsByTypeAndStatus[type]["DECIDED"] || 0) + 1;
                }
                if (["ACCEPTED", "REJECTED", "DUPLICATE", "VOTING", "NOMINATED", "NIANTIC_REVIEW", "APPEALED", "WITHDRAWN", "HELD"].includes(status)) {
                    countsByTypeAndStatus[type]["SUBMITTED"] = (countsByTypeAndStatus[type]["SUBMITTED"] || 0) + 1;
                }

            }

            // Sum the stats for the different types of edits
            const statusTypes = ["SUBMITTED", "DECIDED", "ACCEPTED", "REJECTED", "DUPLICATE", "VOTING", "NOMINATED", "NIANTIC_REVIEW", "APPEALED", "WITHDRAWN", "HELD"];
            for (const type of statusTypes) {
                countsByTypeAndStatus.EDIT[type] = 0;
                for (const editType of ["EDIT_TITLE", "EDIT_DESCRIPTION", "EDIT_LOCATION"]) {
                    countsByTypeAndStatus.EDIT[type] += countsByTypeAndStatus[editType][type] ?? 0;
                }
            }

            // Sum the total stats
            for (const type of statusTypes) {
                countsByTypeAndStatus.TOTAL[type] = 0;
                for (const editType of ["EDIT", "NOMINATION", "PHOTO"]) {
                    countsByTypeAndStatus.TOTAL[type] += countsByTypeAndStatus[editType][type] ?? 0;
                }
            }


            let html = "<table class='wfns-stats-table'>";
            html += "<colgroup>";
            html += "<col style='width: 20%;'>".repeat(4);
            html += "</colgroup>";
            html += "<tr><th></th><th>Nominations</th><th>Edits</th><th>Photos</th><th>Total</th></tr>";

            const statusLabels = ["Submitted", "Decided", "Accepted", "Rejected", "Duplicates", "In Voting", "In Queue", "NIA Review", "Appealed", "Withdrawn", "On Hold"];
            const columnTypes = ["NOMINATION", "EDIT", "PHOTO", "TOTAL"];

            for (let i = 0; i < statusLabels.length; i++) {
                const status = statusTypes[i];
                html += "<tr><td>" + statusLabels[i] + "</td>";

                for (let j = 0; j < columnTypes.length; j++) {
                    const columnType = columnTypes[j];
                    let count = 0;
                    let decidedCount = countsByTypeAndStatus[columnType]["DECIDED"] || 0;

                    count += countsByTypeAndStatus[columnType][status] || 0;

                    // Append percentage only for "Accepted" and "Rejected" statuses
                    if (status === "ACCEPTED" || status === "REJECTED") {
                        let percentage = Math.round((count / decidedCount) * 100);
                        if (isNaN(percentage)) {
                            percentage = "—%";
                        } else {
                            percentage += "%";
                        }
                        html += "<td id='" + columnType + "-" + status.replace(/ /g, '-') + "'>" + count + "<br><span style='font-size: smaller'>" + percentage + "</span></td>";;
                    } else {
                        html += "<td id='" + columnType + "-" + status.replace(/ /g, '-') + "'>" + count + "</td>";
                    }
                }
                html += "</tr>";
            }

            html += "</table>";

            const statsContainer = document.createElement('div');
            statsContainer.setAttribute('class', 'wrap-collabsible');
            statsContainer.id = "nomStats";

            const collapsibleInput = document.createElement("input");
            collapsibleInput.id = "collapsed-stats";
            collapsibleInput.setAttribute("class", "toggle");
            collapsibleInput.type = "checkbox";

            const collapsibleLabel = document.createElement("label");
            collapsibleLabel.setAttribute("class", "lbl-toggle-ns");
            collapsibleLabel.innerText = "View Nomination Stats";
            collapsibleLabel.setAttribute("for", "collapsed-stats");

            const collapsibleContent = document.createElement("div");
            collapsibleContent.setAttribute("class", "collapsible-content-ns");
            collapsibleContent.innerHTML = html;

            statsContainer.appendChild(collapsibleInput);
            statsContainer.appendChild(collapsibleLabel);
            statsContainer.appendChild(collapsibleContent);

            const container = ref.parentNode;
            container.appendChild(statsContainer);

            // Make plot here after data is derived
            addPlotsSection();

            // Check upgrade notification
            const userId = getUserId();
            let upgradeNotify = localStorage.getItem(`wfns_upgrade_notify_${userId}`);
            if (upgradeNotify === undefined || upgradeNotify === null || upgradeNotify === "") {
                upgradeNotify = false;
            }

            // Display notification if upgrade is not set
            const nextUpgradeSet = nominations.some(nom => nom.nextUpgrade);
            if (upgradeNotify === "true" && !nextUpgradeSet) {
                createNotification("No Upgrade Next is set!");
            }
        });
    }

    function addExportButtons() {
        if (document.getElementById("wayfarernsexport") !== null) {
            return;
        }
        const ref = document.querySelector('wf-logo');
        const div = document.createElement('div');

        let exportButton = document.createElement('button');
            exportButton.innerHTML = "Export JSON";
            exportButton.onclick = function() {
              exportNominationsJson();
        }
        exportButton.classList.add('wayfarerns__button');
        exportButton.id = "wayfarernsexport";
        div.appendChild(exportButton);

        let exportCsvButton = document.createElement('button');
            exportCsvButton.innerHTML = "Export CSV";
            exportCsvButton.onclick = function() {
              exportNominationsCsv();
        }
        exportCsvButton.classList.add('wayfarerns__button');
        exportCsvButton.id = "wayfarernsexport";
        div.appendChild(exportCsvButton);

        const container = ref.parentNode.parentNode;
        container.appendChild(div);

        RHButtons = div;
        RHButtons.classList.add('wayfarerns__visible');
    }

    function exportNominationsJson() {
        const dataStr = JSON.stringify(nominations);

        if (typeof window.saveFile != 'undefined') {
            window.saveFile(dataStr, 'nominations.json', 'application/json');
            return;
        }
    }

    function exportNominationsCsv() {
        const csv = convertToCSV(nominations);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        let link = document.createElement("a");
        if (link.download !== undefined) {
            link.setAttribute("href", url);
            link.setAttribute("download", 'nominations.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

    }

    function convertToCSV(objArray) {
        let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;

        // Extract all possible headers including poiData fields
        let headers = new Set();
        array.forEach(item => {
            Object.keys(item).forEach(key => {
                if (Array.isArray(item[key])) {
                    item[key].forEach(poi => {
                        Object.keys(poi).forEach(poiKey => {
                            headers.add(`poiData_${poiKey}`);
                        });
                    });
                } else if (key === 'poiData') {
                    Object.keys(item[key]).forEach(poiKey => {
                        headers.add(`poiData_${poiKey}`);
                    });
                } else {
                    headers.add(key);
                }
            });
        });

        // Generate CSV headers dynamically from headers
        let csv = [...headers].join(',') + '\r\n';

        // Generate CSV rows
        array.forEach(item => {
            let row = '';
            [...headers].forEach(header => {
                if (header.startsWith('poiData_')) {
                    let poiKey = header.substring(8);
                    if (Array.isArray(item.poiData)) {
                        let poiDataValue = '';
                        item.poiData.forEach(poi => {
                            poiDataValue += `${poi[poiKey]},`;
                        });
                        row += `"${poiDataValue.slice(0, -1)}",`; // Remove trailing comma
                    } else {
                        row += `"${String(item.poiData[poiKey] || '').replace(/"/g, '""')}",`;
                    }
                } else {
                    row += `"${String(item[header] || '').replace(/"/g, '""')}",`;
                }
            });
            csv += row.slice(0, -1) + '\r\n'; // Remove trailing comma
        });

        return csv;
    }

    function addUpgradeSetting() {
        awaitElement(() => document.querySelector(".cdk-virtual-scroll-content-wrapper")).then(ref => {
            const listEl = document.querySelector(".cdk-virtual-scroll-content-wrapper");
            const insDiv = document.querySelector(".mt-2");
            const userId = getUserId();

            let upgradeNotifyChkbox = document.createElement("INPUT");
            upgradeNotifyChkbox.setAttribute("type", "checkbox");

            upgradeNotifyChkbox.id = 'wayfarernsupgradenotifychkbox';

            const upgradeNotifyChkboxLabel = document.createElement("label");
            upgradeNotifyChkboxLabel.innerText = "Notify when no Upgrade Next set:";
            upgradeNotifyChkboxLabel.setAttribute("for", "wayfarernsupgradenotifychkbox");

            insDiv.insertBefore(upgradeNotifyChkbox, insDiv.children[0]);
            insDiv.insertBefore(upgradeNotifyChkboxLabel, insDiv.children[0]);

            let upgradeNotify = localStorage.getItem(`wfns_upgrade_notify_${userId}`);
            if (upgradeNotify === undefined || upgradeNotify === null || upgradeNotify === ""){
                upgradeNotify = false;
            }
            upgradeNotify = upgradeNotify === "true";

            if (upgradeNotify) {
            	upgradeNotifyChkbox.checked = true;
            }

            upgradeNotifyChkbox.addEventListener('click', e => {
                localStorage.setItem(`wfns_upgrade_notify_${userId}`, e.target.checked);
                console.log(e.target.checked);
            });
        });
    }

    function addNotificationDiv() {
        if (document.getElementById("wfnsNotify") === null) {
            let container = document.createElement("div");
            container.id = "wfnsNotify";
            document.getElementsByTagName("body")[0].appendChild(container);
        }
    }

    function createNotification(message, color = 'red'){
        let notification = document.createElement("div");
        switch (color) {
            case 'red':
                notification.setAttribute("class", "wfnsNoUpgradeNextNotification wfnsBgRed");
                break;
        }
        notification.onclick = function(){
            notification.remove();
        };

        let content = document.createElement("p");
        content.innerText = message;

        // Purely aesthetic (The whole div closes the notification)
        let closeButton = document.createElement("div");
        closeButton.innerText = "X";
        closeButton.setAttribute("class", "wfnsNotifyCloseButton");
        closeButton.setAttribute("style", "cursor: pointer;");

        notification.appendChild(closeButton);
        notification.appendChild(content);

        document.getElementById("wfnsNotify").appendChild(notification);
    }

    function getUserId() {
        var els = document.getElementsByTagName("image");
        for (var i = 0; i < els.length; i++) {
           const element = els[i];
           const attribute = element.getAttribute("href");
           let fields = attribute.split('/');
           let userId = fields[fields.length-1];
           fields = userId.split('=');
           userId = fields[0];
           return userId;
        }
        return "temporary_default_userid";
    }

    const awaitElement = get => new Promise((resolve, reject) => {
        let triesLeft = 10;
        const queryLoop = () => {
            const ref = get();
            if (ref) resolve(ref);
            else if (!triesLeft) reject();
            else setTimeout(queryLoop, 100);
            triesLeft--;
        }
        queryLoop();
    });

    function addCss() {
        const css = `
            #wfnsNotify{
                position: absolute;
                bottom: 1em;
                right: 1em;
                width: 30em;
                z-index: 100;
                }
                .wfnsNoUpgradeNextNotification{
                border-radius: 0.5em;
                padding: 1em;
                margin-top: 1.5em;
                color: white;
                }
                .wfnsBgRed{
                background-color: #CC0000B0;
                }
                .wfnsNotifyCloseButton{
                float: right;
                }

            .wayfarerns__visible {
                display: block;
            }

            .wayfarerns__button {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 10px 10px;
                margin: 10px;
                border-radius: .375rem;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
            }

            .wayfarerns__button:hover {
                background-color: #bdbbbb;
                transition: 0.2s;
            }

            .dark .wayfarerns__button {
                background-color: #404040;
                color: #20B8E3;
            }

            .dark .wayfarerns__button:hover {
                background-color: #707070;
                transition: 0.2s;
            }

            .wrap-collabsible {
                margin-bottom: 1.2rem;
            }

            #collapsible,
            #collapsed-stats {
                display: none;
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

            .content-inner td:last-child {
                text-align: right;
            }

            th,
            td {
                border: white solid 1pt;
                padding: 1pt 5pt;
            }
            .wfns-stats-table {
                width: 100%;
            }
            .wfns-stats-table th:first-child,
            .wfns-stats-table td:first-child {
                text-align: left; /* Left-align the content within the first column */
            }
            .wfns-stats-table th:not(:first-child),
            .wfns-stats-table td:not(:first-child) {
                text-align: center; /* Center-align the content within columns 2 to 5 */
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }

    function saveAs (data,filename,dataType) {
      if (!(data instanceof Array)) { data = [data]; }
      let file = new Blob(data, {type: dataType});
      let objectURL = URL.createObjectURL(file);

      let link = document.createElement('a');
      link.href = objectURL;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(objectURL);
    }

    // Derive nomination location data
    function getAcceptedNominationsByArea(nominations) {
      const counts = {};

      nominations.forEach(n => {
        if (!n) return;

        // Filter: only nominations + accepted
        if (n.type !== 'NOMINATION') return;
        if (n.status !== 'ACCEPTED') return;

        // Define area (edit this based on your actual fields)
        const city = n.city || 'Unknown City';
        const state = n.state || 'Unknown State';
        const area = `${city}, ${state}`;

        counts[area] = (counts[area] || 0) + 1;
      });

      return counts;
    }

    // Function to render a basic bar chart of accepted nominations
    function renderBarChart(dataObj, title = "Accepted Nominations by Area") {
      const container = document.createElement('div');
      container.style.cssText = `
        margin: 16px 0;
        padding: 16px;
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #ffffff;
      `;

      const heading = document.createElement('h3');
      heading.textContent = title;
      heading.style.marginBottom = '12px';
      container.appendChild(heading);

      const entries = Object.entries(dataObj)
        .sort((a, b) => b[1] - a[1]); // descending

      if (entries.length === 0) {
        container.appendChild(document.createTextNode("No data available."));
        return container;
      }

      const maxVal = Math.max(...entries.map(e => e[1]));

      entries.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.style.marginBottom = '6px';

        const text = document.createElement('div');
        text.textContent = `${label} (${value})`;
        text.style.fontSize = '12px';

        const bar = document.createElement('div');
        bar.style.height = '14px';
        bar.style.width = `${(value / maxVal) * 100}%`;
        bar.style.background = '#4CAF50';
        bar.style.borderRadius = '4px';

        row.appendChild(text);
        row.appendChild(bar);
        container.appendChild(row);
      });

      return container;
    }

    // Functionality to add plots section
    function addPlotsSection() {
      if (document.getElementById("wfns-plots-root")) return;

      const statsContainer =
        document.querySelector("#nomStats") ||
        document.querySelector(".wayfarerns__visible") ||
        document.querySelector("app-submissions-list");

      if (!statsContainer) return;

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
            </div>
          </div>
        </div>
      `;

      // Prefer placing directly after the stats panel if it exists
      const nomStats = document.getElementById("nomStats");
      if (nomStats && nomStats.parentNode) {
        nomStats.parentNode.insertBefore(root, nomStats.nextSibling);
      } else if (statsContainer.parentNode) {
        statsContainer.parentNode.insertBefore(root, statsContainer.nextSibling);
      }

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

      controls.appendChild(wrapper);

      controls.querySelectorAll('input[name="wfns-agg"]').forEach(input => {
        input.addEventListener("change", (e) => {
          plotState.aggregationMode = e.target.value;
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

      const maxBarsSelect = controls.querySelector("#wfns-max-bars");
      if (maxBarsSelect) {
        maxBarsSelect.addEventListener("change", (e) => {
          plotState.maxBars = e.target.value === "all" ? "all" : Number(e.target.value);
          renderPlots();
        });
      }

      const exportBlock = document.createElement("div");
      exportBlock.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px;">Export</div>
        <button id="wfns-export-image" style="
          padding: 6px 10px;
          border-radius: 4px;
          border: none;
          background: #e5e5e5;
          cursor: pointer;
        ">
          Download PNG
        </button>
      `;
      wrapper.appendChild(exportBlock);

      const exportBtn = wrapper.querySelector("#wfns-export-image");
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          exportCurrentPlotAsPng();
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

    function renderPlots() {
      const stackedData = buildStackedAreaData(nominations);
      const topAreas = getTopAreas(stackedData, plotState.maxBars);
      renderVerticalStackedBarChart(topAreas);
    }

    window.saveFile = typeof android === 'undefined' || !android.saveFile
          ? saveAs : function (data,filename,dataType) {
      android.saveFile(filename || '', dataType || '*/*', data);
    };
}

init();

