// ===== 0. CONFIG =====

const BACKEND_BASE = "http://127.0.0.1:5000/api";

// ===== 1. GLOBAL STATE =====

// Monthly indicators (main + comparison charts)
let labelsFull = [];       // union of all monthly labels (YYYY-MM)
const indicatorData = {};  // unemployment, fed_funds, cpi, m2 (aligned to labelsFull)

// Quarterly delinquency indicators
let delinquencyLabelsFull = [];
const delinquencyData = {}; // all_loans, mortgage, consumer, credit_card

// Per-chart range state
const chartRanges = {
  main: "12",
  comparison: "12",
  delinquency: "max",
};

let currentIndicatorKey = "unemployment";

// Chart instances
let indicatorChart;
let comparisonChart;
let loanDefaultChart;


// ===== 2. HELPERS: FRED + ALIGNMENT =====

async function loadFredSeries(seriesId, keep) {
  const url = `${BACKEND_BASE}/fred?series_id=${seriesId}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Backend HTTP error ${response.status} for ${seriesId}`);
  }

  const json = await response.json();
  const labels = [];
  const values = [];

  json.observations.forEach((obs) => {
    const v = parseFloat(obs.value);
    if (!isNaN(v)) {
      labels.push(obs.date.slice(0, 7)); // YYYY-MM
      values.push(v);
    }
  });

  if (keep && labels.length > keep) {
    const start = labels.length - keep;
    return {
      labels: labels.slice(start),
      values: values.slice(start),
    };
  }

  return { labels, values };
}

// Union of label arrays, sorted ascending
function unionSorted(arrays) {
  const set = new Set();
  arrays.forEach((arr) => arr.forEach((x) => set.add(x)));
  return Array.from(set).sort(); // YYYY-MM sorts correctly as strings
}

// Align series to a master label set (fill missing with null)
function alignToMaster(masterLabels, seriesLabels, seriesValues) {
  const map = new Map();
  for (let i = 0; i < seriesLabels.length; i++) {
    map.set(seriesLabels[i], seriesValues[i]);
  }
  return masterLabels.map((label) => (map.has(label) ? map.get(label) : null));
}


// ===== 3. RANGE SLICING =====

// For monthly series
function sliceForRangeMonthly(labels, data, range) {
  if (range === "max") return { labels, data };
  const months = parseInt(range, 10);
  const start = Math.max(labels.length - months, 0);
  return {
    labels: labels.slice(start),
    data: data.slice(start),
  };
}

// For quarterly series (approximate 1Y = 4 pts, 2Y = 8)
function sliceForRangeQuarterly(labels, data, range) {
  if (range === "max") return { labels, data };
  const months = parseInt(range, 10);
  const points = Math.max(Math.round(months / 3), 1);
  const start = Math.max(labels.length - points, 0);
  return {
    labels: labels.slice(start),
    data: data.slice(start),
  };
}


// ===== 4. CREATE CHARTS =====

function createCharts() {
  // ----- MAIN SELECTED INDICATOR CHART -----
  const mainCtx = document.getElementById("indicatorChart").getContext("2d");
  const initialMain = sliceForRangeMonthly(
    labelsFull,
    indicatorData[currentIndicatorKey].data,
    chartRanges.main
  );

  indicatorChart = new Chart(mainCtx, {
    type: "line",
    data: {
      labels: initialMain.labels,
      datasets: [
        {
          label: indicatorData[currentIndicatorKey].label,
          data: initialMain.data,
          borderWidth: 2,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: "Date" } },
        y: { title: { display: true, text: "Value" } },
      },
    },
  });

  // indicator dropdown
  const indicatorSelect = document.getElementById("indicator-select");
  indicatorSelect.addEventListener("change", (event) => {
    const key = event.target.value;
    currentIndicatorKey = key;

    const sliced = sliceForRangeMonthly(
      labelsFull,
      indicatorData[key].data,
      chartRanges.main
    );

    indicatorChart.data.labels = sliced.labels;
    indicatorChart.data.datasets[0].label = indicatorData[key].label;
    indicatorChart.data.datasets[0].data = sliced.data;
    indicatorChart.update();
  });

  // ----- COMPARISON CHART (UNEMPLOYMENT VS FED FUNDS) -----
  const cmpCtx = document.getElementById("comparisonChart").getContext("2d");
  const cmpUnemp = sliceForRangeMonthly(
    labelsFull,
    indicatorData.unemployment.data,
    chartRanges.comparison
  );
  const cmpFed = sliceForRangeMonthly(
    labelsFull,
    indicatorData.fed_funds.data,
    chartRanges.comparison
  );

  comparisonChart = new Chart(cmpCtx, {
    type: "line",
    data: {
      labels: cmpUnemp.labels, // same as cmpFed.labels because we slice off same union labelsFull
      datasets: [
        {
          label: indicatorData.unemployment.label,
          data: cmpUnemp.data,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          label: indicatorData.fed_funds.label,
          data: cmpFed.data,
          borderWidth: 2,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true } },
      scales: {
        x: { title: { display: true, text: "Date" } },
        y: { title: { display: true, text: "Value" } },
      },
    },
  });

  // ----- DELINQUENCY CHART (QUARTERLY) -----
  const loanCtx = document.getElementById("loanDefaultChart").getContext("2d");
  const delAll = sliceForRangeQuarterly(
    delinquencyLabelsFull,
    delinquencyData.all_loans.data,
    chartRanges.delinquency
  );
  const delMort = sliceForRangeQuarterly(
    delinquencyLabelsFull,
    delinquencyData.mortgage.data,
    chartRanges.delinquency
  );
  const delCons = sliceForRangeQuarterly(
    delinquencyLabelsFull,
    delinquencyData.consumer.data,
    chartRanges.delinquency
  );
  const delCC = sliceForRangeQuarterly(
    delinquencyLabelsFull,
    delinquencyData.credit_card.data,
    chartRanges.delinquency
  );

  loanDefaultChart = new Chart(loanCtx, {
    type: "line",
    data: {
      labels: delAll.labels,
      datasets: [
        {
          label: delinquencyData.all_loans.label,
          data: delAll.data,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          label: delinquencyData.mortgage.label,
          data: delMort.data,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          label: delinquencyData.consumer.label,
          data: delCons.data,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          label: delinquencyData.credit_card.label,
          data: delCC.data,
          borderWidth: 2,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true } },
      scales: {
        x: { title: { display: true, text: "Date (Quarterly)" } },
        y: { title: { display: true, text: "Delinquency Rate (%)" } },
      },
    },
  });

  setupRangeControls();
  setupCarouselNav();
}


// ===== 5. RANGE CONTROL HANDLERS =====

function setupRangeControls() {
  const groups = document.querySelectorAll(".range-group");

  groups.forEach((group) => {
    const target = group.dataset.target; // "main" | "comparison" | "delinquency"

    group.querySelectorAll(".range-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        // visual active state only inside this group
        group.querySelectorAll(".range-btn").forEach((b) =>
          b.classList.remove("range-btn-active")
        );
        btn.classList.add("range-btn-active");

        const range = btn.dataset.range;
        chartRanges[target] = range;

        if (target === "main") {
          const sliced = sliceForRangeMonthly(
            labelsFull,
            indicatorData[currentIndicatorKey].data,
            chartRanges.main
          );
          indicatorChart.data.labels = sliced.labels;
          indicatorChart.data.datasets[0].data = sliced.data;
          indicatorChart.update();
        } else if (target === "comparison") {
          const unemp = sliceForRangeMonthly(
            labelsFull,
            indicatorData.unemployment.data,
            chartRanges.comparison
          );
          const fed = sliceForRangeMonthly(
            labelsFull,
            indicatorData.fed_funds.data,
            chartRanges.comparison
          );
          comparisonChart.data.labels = unemp.labels;
          comparisonChart.data.datasets[0].data = unemp.data;
          comparisonChart.data.datasets[1].data = fed.data;
          comparisonChart.update();
        } else if (target === "delinquency") {
          const all = sliceForRangeQuarterly(
            delinquencyLabelsFull,
            delinquencyData.all_loans.data,
            chartRanges.delinquency
          );
          const mort = sliceForRangeQuarterly(
            delinquencyLabelsFull,
            delinquencyData.mortgage.data,
            chartRanges.delinquency
          );
          const cons = sliceForRangeQuarterly(
            delinquencyLabelsFull,
            delinquencyData.consumer.data,
            chartRanges.delinquency
          );
          const cc = sliceForRangeQuarterly(
            delinquencyLabelsFull,
            delinquencyData.credit_card.data,
            chartRanges.delinquency
          );

          loanDefaultChart.data.labels = all.labels;
          loanDefaultChart.data.datasets[0].data = all.data;
          loanDefaultChart.data.datasets[1].data = mort.data;
          loanDefaultChart.data.datasets[2].data = cons.data;
          loanDefaultChart.data.datasets[3].data = cc.data;
          loanDefaultChart.update();
        }
      });
    });
  });
}


// ===== 6. CAROUSEL NAV (STACKED CARD EFFECT) =====

function setupCarouselNav() {
  const slides = document.querySelectorAll(".chart-slide");
  const navButtons = document.querySelectorAll(".carousel-nav-btn");
  let current = 0;

  function applyClasses() {
    slides.forEach((slide, idx) => {
      slide.classList.remove("active", "stacked-1", "stacked-2", "hidden-left");

      if (idx === current) {
        slide.classList.add("active");
      } else if (idx > current && idx - current === 1) {
        slide.classList.add("stacked-1");
      } else if (idx > current && idx - current === 2) {
        slide.classList.add("stacked-2");
      } else {
        slide.classList.add("hidden-left");
      }
    });

    navButtons.forEach((btn, idx) => {
      btn.classList.toggle("nav-active", idx === current);
    });
  }

  // nav pills
  navButtons.forEach((btn) => {
    const idx = parseInt(btn.dataset.slide, 10);
    btn.addEventListener("click", () => {
      current = idx;
      applyClasses();
    });
  });

  // 👇 cards themselves
  slides.forEach((slide, idx) => {
    slide.addEventListener("click", () => {
      if (idx !== current) {
        current = idx;
        applyClasses();
      }
    });
  });

  applyClasses();
}




// ===== 7. INIT: fetch FRED data and build everything =====

async function initDashboard() {
  try {
    // --- Monthly indicators (keep last ~10 years for initial load) ---
    const keepMonths = null;

    const unemp = await loadFredSeries("UNRATE", keepMonths);
    const fed = await loadFredSeries("FEDFUNDS", keepMonths);
    const cpi = await loadFredSeries("CPIAUCSL", keepMonths);
    const m2 = await loadFredSeries("M2SL", keepMonths);

    // union of all monthly labels, so "Max" goes as far back as any series
    labelsFull = unionSorted([
      unemp.labels,
      fed.labels,
      cpi.labels,
      m2.labels,
    ]);

    indicatorData.unemployment = {
      label: "Unemployment Rate (%)",
      data: alignToMaster(labelsFull, unemp.labels, unemp.values),
    };

    indicatorData.fed_funds = {
      label: "Fed Funds Rate (%)",
      data: alignToMaster(labelsFull, fed.labels, fed.values),
    };

    indicatorData.cpi = {
      label: "CPI (Index)",
      data: alignToMaster(labelsFull, cpi.labels, cpi.values),
    };

    indicatorData.m2 = {
      label: "M2 Money Stock (Billions $)",
      data: alignToMaster(labelsFull, m2.labels, m2.values),
    };

    // ----- 3. Quarterly delinquency series (FRED) -----

const keepQuarters = null; // no trimming; range buttons will handle it

// 1) Load all four series (as-is from FRED)
const allLoansRaw  = await loadFredSeries("DRALACBS",  keepQuarters);
const consumerRaw  = await loadFredSeries("DRCLACBS",  keepQuarters);
const creditRaw    = await loadFredSeries("DRCCLACBS", keepQuarters);
const mortgageRaw  = await loadFredSeries("DRSFRMACBS", keepQuarters);

// 2) Choose ONE master timeline. Use credit as master so we never
// truncate its history or future values by accident.
delinquencyLabelsFull = creditRaw.labels;

// 3) Align the other three to that master
const allLoansAligned = alignToMaster(
  delinquencyLabelsFull,
  allLoansRaw.labels,
  allLoansRaw.values
);

const consumerAligned = alignToMaster(
  delinquencyLabelsFull,
  consumerRaw.labels,
  consumerRaw.values
);

const mortgageAligned = alignToMaster(
  delinquencyLabelsFull,
  mortgageRaw.labels,
  mortgageRaw.values
);

// 4) Store aligned data for the chart
delinquencyData.all_loans = {
  label: "All Loans Delinquency Rate (%)",
  data: allLoansAligned
};

delinquencyData.consumer = {
  label: "Consumer Loans Delinquency Rate (%)",
  data: consumerAligned
};

delinquencyData.credit_card = {
  label: "Credit Card Delinquency Rate (%)",
  data: creditRaw.values   // master – unchanged
};

delinquencyData.mortgage = {
  label: "Mortgage Delinquency Rate (%)",
  data: mortgageAligned
};


    // Build charts + UI
    createCharts();
  } catch (err) {
    console.error("Error initializing dashboard:", err);
  }
}

// Start it all
initDashboard();
