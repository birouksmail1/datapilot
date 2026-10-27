
"use strict";

// ==========================================
// DataPilot - CSV Analytics Dashboard
// Search + Filter + Export CSV
// ==========================================

const csvFile = document.getElementById("csvFile");
const fileStatus = document.getElementById("fileStatus");
const dataSummary = document.getElementById("dataSummary");
const dashboard = document.getElementById("analytics-dashboard");
const tableContainer = document.getElementById("tableContainer");
const startButton = document.getElementById("startButton");
const statusMessage = document.getElementById("status");

const totalSalesElement = document.getElementById("totalSales");
const averageSalesElement = document.getElementById("averageSales");
const topProductElement = document.getElementById("topProduct");
const topProductSalesElement = document.getElementById("topProductSales");
const dataQualityElement = document.getElementById("dataQuality");
const qualityDetailsElement = document.getElementById("qualityDetails");

let allHeaders = [];
let allRecords = [];
let filteredRecords = [];

let salesBarChart = null;
let salesLineChart = null;

// ==========================================
// Navigation
// ==========================================

if (startButton) {
  startButton.addEventListener("click", () => {
    document.getElementById("upload")?.scrollIntoView({
      behavior: "smooth"
    });

    if (statusMessage) {
      statusMessage.textContent = "Choose a CSV file to get started.";
    }
  });
}

// ==========================================
// Utility functions
// ==========================================

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findColumn(headers, possibleNames) {
  return headers.findIndex((header) =>
    possibleNames.includes(normalizeHeader(header))
  );
}

function parseRow(line) {
  const values = [];
  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value.trim());
  return values;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let cleaned = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") {
    return null;
  }

  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    const parts = cleaned.split(",");

    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  }

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function formatDH(value) {
  return new Intl.NumberFormat("fr-MA", {
    maximumFractionDigits: 2
  }).format(value) + " DH";
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function destroyCharts() {
  if (salesBarChart) {
    salesBarChart.destroy();
    salesBarChart = null;
  }

  if (salesLineChart) {
    salesLineChart.destroy();
    salesLineChart = null;
  }
}

// ==========================================
// Reset dashboard
// ==========================================

function resetDashboard() {
  destroyCharts();

  if (dashboard) {
    dashboard.hidden = true;
  }

  setText(totalSalesElement, "—");
  setText(averageSalesElement, "—");
  setText(topProductElement, "—");
  setText(topProductSalesElement, "Best-performing product");
  setText(dataQualityElement, "—");
  setText(qualityDetailsElement, "Missing and duplicate data");
  setText(dataSummary, "");

  if (tableContainer) {
    tableContainer.replaceChildren();
  }

  allHeaders = [];
  allRecords = [];
  filteredRecords = [];
}

// ==========================================
// Read and process CSV
// ==========================================

if (csvFile) {
  csvFile.addEventListener("change", (event) => {
    resetDashboard();

    const file = event.target.files?.[0];

    if (!file) {
      setText(fileStatus, "No file selected yet.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setText(fileStatus, "Please choose a CSV file.");
      return;
    }

    setText(fileStatus, "Reading your CSV file...");

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const content = String(reader.result || "").replace(/^\uFEFF/, "");
        const lines = content
          .split(/\r?\n/)
          .filter((line) => line.trim() !== "");

        if (lines.length < 2) {
          setText(
            fileStatus,
            "The CSV file is empty or contains no data rows."
          );
          return;
        }

        allHeaders = parseRow(lines[0]);

        if (!allHeaders.length || allHeaders.every((h) => !h.trim())) {
          setText(fileStatus, "Could not find column headers in this CSV.");
          return;
        }

        allRecords = lines.slice(1).map((line) => {
          const row = parseRow(line);

          while (row.length < allHeaders.length) {
            row.push("");
          }

          return row.slice(0, allHeaders.length);
        });

        filteredRecords = [...allRecords];

        showDashboard(allHeaders, allRecords);
        createTableTools();
        applyFilters();

        setText(fileStatus, `Successfully loaded: ${file.name}`);
      } catch (error) {
        console.error("CSV processing error:", error);
        setText(
          fileStatus,
          "Could not process this CSV file. Please check its format."
        );
      }
    };

    reader.onerror = () => {
      setText(fileStatus, "Could not read the selected file.");
    };

    reader.readAsText(file);
  });
}

// ==========================================
// Create search and filter controls
// ==========================================

function createTableTools() {
  if (!tableContainer) return;

  tableContainer.replaceChildren();

  const tools = document.createElement("div");
  tools.className = "data-tools";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.id = "dataSearch";
  searchInput.placeholder = "Search your data...";
  searchInput.setAttribute("aria-label", "Search all data columns");

  const columnSelect = document.createElement("select");
  columnSelect.id = "filterColumn";
  columnSelect.setAttribute("aria-label", "Choose a column to filter");

  const allColumnsOption = document.createElement("option");
  allColumnsOption.value = "-1";
  allColumnsOption.textContent = "All columns";
  columnSelect.appendChild(allColumnsOption);

  allHeaders.forEach((header, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = header || `Column ${index + 1}`;
    columnSelect.appendChild(option);
  });

  const valueSelect = document.createElement("select");
  valueSelect.id = "filterValue";
  valueSelect.setAttribute("aria-label", "Filter by a value");

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.id = "exportCsv";
  exportButton.className = "export-button";
  exportButton.textContent = "↓ Export CSV";

  tools.append(searchInput, columnSelect, valueSelect, exportButton);

  const tableInfo = document.createElement("div");
  tableInfo.className = "table-info";

  const resultCount = document.createElement("span");
  resultCount.id = "resultCount";

  const filterHint = document.createElement("span");
  filterHint.id = "filterHint";
  filterHint.textContent = "Search and filter your records";

  tableInfo.append(resultCount, filterHint);

  const table = document.createElement("table");
  table.id = "dataTable";
  table.className = "data-table";

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-wrapper";
  tableWrapper.appendChild(table);

  tableContainer.append(tools, tableInfo, tableWrapper);

  searchInput.addEventListener("input", applyFilters);

  columnSelect.addEventListener("change", () => {
    updateFilterValues();
    applyFilters();
  });

  valueSelect.addEventListener("change", applyFilters);

  exportButton.addEventListener("click", exportFilteredCSV);

  updateFilterValues();
}

// ==========================================
// Populate filter values
// ==========================================

function updateFilterValues() {
  const columnSelect = document.getElementById("filterColumn");
  const valueSelect = document.getElementById("filterValue");

  if (!columnSelect || !valueSelect) return;

  const selectedColumn = Number(columnSelect.value);

  valueSelect.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All values";
  valueSelect.appendChild(allOption);

  if (selectedColumn < 0) {
    valueSelect.disabled = true;
    return;
  }

  valueSelect.disabled = false;

  const uniqueValues = [
    ...new Set(
      allRecords
        .map((record) => record[selectedColumn] ?? "")
        .filter((value) => value !== "")
    )
  ].sort((a, b) => a.localeCompare(b));

  uniqueValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    valueSelect.appendChild(option);
  });
}

// ==========================================
// Apply search and filters
// ==========================================

function applyFilters() {
  const searchInput = document.getElementById("dataSearch");
  const columnSelect = document.getElementById("filterColumn");
  const valueSelect = document.getElementById("filterValue");

  if (!searchInput || !columnSelect || !valueSelect) return;

  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedColumn = Number(columnSelect.value);
  const selectedValue = valueSelect.value;

  filteredRecords = allRecords.filter((record) => {
    const matchesSearch =
      searchTerm === "" ||
      record.some((value) =>
        String(value ?? "").toLowerCase().includes(searchTerm)
      );

    const matchesColumn =
      selectedColumn < 0 ||
      selectedValue === "" ||
      String(record[selectedColumn] ?? "") === selectedValue;

    return matchesSearch && matchesColumn;
  });

  renderTable();
  updateResultCount();
}

// ==========================================
// Render visible table rows
// ==========================================

function renderTable() {
  const table = document.getElementById("dataTable");
  if (!table) return;

  table.replaceChildren();

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  allHeaders.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  filteredRecords.forEach((record) => {
    const row = document.createElement("tr");

    allHeaders.forEach((_, index) => {
      const td = document.createElement("td");
      td.textContent = record[index] ?? "";
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);

  if (filteredRecords.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");

    emptyCell.colSpan = Math.max(allHeaders.length, 1);
    emptyCell.className = "empty-table-message";
    emptyCell.textContent = "No matching records found.";

    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  }
}

function updateResultCount() {
  setText(
    document.getElementById("resultCount"),
    `Showing ${filteredRecords.length} of ${allRecords.length} records`
  );

  setText(
    document.getElementById("filterHint"),
    filteredRecords.length === allRecords.length
      ? "All records displayed"
      : "Search or filter is active"
  );
}

// ==========================================
// Export currently visible results to CSV
// ==========================================

function exportFilteredCSV() {
  if (!allHeaders.length) {
    setText(fileStatus, "Load a CSV file before exporting.");
    return;
  }

  const csvCell = (value) => {
    const text = String(value ?? "");
    return '"' + text.replace(/"/g, '""') + '"';
  };

  const rows = [
    allHeaders,
    ...filteredRecords
  ];

  const csvContent = "\uFEFF" + rows
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "datapilot_filtered_data.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  setText(
    fileStatus,
    `Exported ${filteredRecords.length} records to CSV.`
  );
}

// ==========================================
// Analytics dashboard
// ==========================================

function showDashboard(headers, records) {
  const salesIndex = findColumn(headers, [
    "sales", "revenue", "amount", "total",
    "totaldh", "totalsales", "montant", "ventes", "ca"
  ]);

  const productIndex = findColumn(headers, [
    "product", "productname", "produit",
    "item", "article", "name", "nom"
  ]);

  let totalSales = 0;
  let validSalesCount = 0;
  let missingCells = 0;
  let duplicateRows = 0;

  const seenRows = new Set();
  const productTotals = new Map();

  records.forEach((record) => {
    headers.forEach((_, index) => {
      if (!String(record[index] ?? "").trim()) {
        missingCells++;
      }
    });

    const rowKey = JSON.stringify(record);

    if (seenRows.has(rowKey)) {
      duplicateRows++;
    }

    seenRows.add(rowKey);

    if (salesIndex !== -1) {
      const amount = parseNumber(record[salesIndex]);

      if (amount !== null) {
        totalSales += amount;
        validSalesCount++;

        if (productIndex !== -1) {
          const product = record[productIndex] || "Unknown product";

          productTotals.set(
            product,
            (productTotals.get(product) || 0) + amount
          );
        }
      }
    }
  });

  const averageSales =
    validSalesCount > 0 ? totalSales / validSalesCount : 0;

  let bestProduct = "—";
  let bestProductSales = 0;

  for (const [product, amount] of productTotals.entries()) {
    if (bestProduct === "—" || amount > bestProductSales) {
      bestProduct = product;
      bestProductSales = amount;
    }
  }

  const totalCells = records.length * headers.length;
  const qualityScore = totalCells > 0
    ? Math.round(((totalCells - missingCells) / totalCells) * 100)
    : 0;

  setText(
    totalSalesElement,
    salesIndex !== -1 ? formatDH(totalSales) : "No sales column"
  );

  setText(
    averageSalesElement,
    salesIndex !== -1 && validSalesCount > 0
      ? formatDH(averageSales)
      : "—"
  );

  setText(topProductElement, bestProduct);

  setText(
    topProductSalesElement,
    bestProduct !== "—" ? formatDH(bestProductSales) : "No product data"
  );

  setText(dataQualityElement, `${qualityScore}%`);

  setText(
    qualityDetailsElement,
    `${missingCells} missing cells · ${duplicateRows} duplicate rows`
  );

  setText(
    dataSummary,
    `${records.length} rows · ${headers.length} columns`
  );

  if (dashboard) {
    dashboard.hidden = false;
  }

  renderCharts(headers, records);
}

// ==========================================
// Charts
// ==========================================

function renderCharts(headers, records) {
  destroyCharts();

  if (typeof Chart === "undefined") {
    setText(
      fileStatus,
      "CSV loaded, but charts need an internet connection to load Chart.js."
    );
    return;
  }

  const barCanvas = document.getElementById("salesBarChart");
  const lineCanvas = document.getElementById("salesLineChart");

  const productIndex = findColumn(headers, [
    "product", "productname", "produit",
    "item", "article", "name", "nom"
  ]);

  const salesIndex = findColumn(headers, [
    "sales", "revenue", "amount", "total",
    "totaldh", "totalsales", "montant", "ventes", "ca"
  ]);

  const dateIndex = findColumn(headers, [
    "date", "orderdate", "saledate", "transactiondate"
  ]);

  if (salesIndex === -1) return;

  if (barCanvas && productIndex !== -1) {
    const totals = new Map();

    records.forEach((record) => {
      const product = record[productIndex] || "Unknown product";
      const amount = parseNumber(record[salesIndex]);

      if (amount !== null) {
        totals.set(product, (totals.get(product) || 0) + amount);
      }
    });

    const products = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    salesBarChart = new Chart(barCanvas, {
      type: "bar",
      data: {
        labels: products.map(([product]) => product),
        datasets: [{
          label: "Sales (DH)",
          data: products.map(([, amount]) => amount),
          backgroundColor: "#3977f6",
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  if (lineCanvas && dateIndex !== -1) {
    const totalsByDate = new Map();

    records.forEach((record) => {
      const date = record[dateIndex];
      const amount = parseNumber(record[salesIndex]);

      if (date && amount !== null) {
        totalsByDate.set(
          date,
          (totalsByDate.get(date) || 0) + amount
        );
      }
    });

    const dates = [...totalsByDate.entries()]
      .sort((a, b) => {
        const timeA = Date.parse(a[0]);
        const timeB = Date.parse(b[0]);

        if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
          return timeA - timeB;
        }

        return a[0].localeCompare(b[0]);
      });

    salesLineChart = new Chart(lineCanvas, {
      type: "line",
      data: {
        labels: dates.map(([date]) => date),
        datasets: [{
          label: "Sales (DH)",
          data: dates.map(([, amount]) => amount),
          borderColor: "#0d9488",
          backgroundColor: "rgba(13, 148, 136, 0.12)",
          fill: true,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
}
