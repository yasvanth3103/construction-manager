// Simple localStorage-backed store
const STORAGE_KEY = "construction_manager_data_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { sites: [], labours: [], attendance: [], materials: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      sites: parsed.sites || [],
      labours: parsed.labours || [],
      attendance: parsed.attendance || [],
      materials: parsed.materials || [],
    };
  } catch (e) {
    console.error("Failed to load state", e);
    return { sites: [], labours: [], attendance: [], materials: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

let state = loadState();

// DOM helpers
function $(id) {
  return document.getElementById(id);
}

function formatDateForDisplay(value) {
  return value || "";
}

// Tabs
function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const sections = document.querySelectorAll(".tab-content");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => b.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      const section = document.getElementById(`tab-${tab}`);
      if (section) section.classList.add("active");
    });
  });
}

// Sites
function renderSites() {
  const tbody = $("sites-table-body");
  tbody.innerHTML = "";
  state.sites.forEach((site) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${site.name || ""}</td>
      <td>${site.location || ""}</td>
      <td>${formatDateForDisplay(site.startDate)}</td>
      <td><span class="status-pill ${site.status || ""}">${site.status || ""}</span></td>
      <td class="actions-cell">
        <button class="btn ghost btn-sm" data-action="edit" data-id="${site.id}">Edit</button>
        <button class="btn danger btn-sm" data-action="delete" data-id="${site.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function fillSiteSelects() {
  const siteSelects = [
    $("labour-site"),
    $("attendance-site"),
    $("material-site"),
    $("export-site"),
  ];
  siteSelects.forEach((select) => {
    if (!select) return;
    const currentId = select.id === "export-site" ? select.value : select.value;
    select.innerHTML = "";

    if (select.id === "export-site") {
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = "All sites";
      select.appendChild(optAll);
    } else {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select site";
      select.appendChild(placeholder);
    }

    state.sites.forEach((site) => {
      const opt = document.createElement("option");
      opt.value = site.id;
      opt.textContent = site.name || "(no name)";
      select.appendChild(opt);
    });

    if (currentId) {
      select.value = currentId;
    }
  });
}

function setupSites() {
  const form = $("site-form");
  const resetBtn = $("site-reset");
  const tbody = $("sites-table-body");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("site-id").value || generateId("site");
    const site = {
      id,
      name: $("site-name").value.trim(),
      location: $("site-location").value.trim(),
      startDate: $("site-start").value || "",
      status: $("site-status").value || "Active",
    };

    const existingIndex = state.sites.findIndex((s) => s.id === id);
    if (existingIndex >= 0) {
      state.sites[existingIndex] = site;
    } else {
      state.sites.push(site);
    }
    saveState();
    renderSites();
    fillSiteSelects();
    form.reset();
    $("site-id").value = "";
  });

  resetBtn.addEventListener("click", () => {
    form.reset();
    $("site-id").value = "";
  });

  tbody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) return;

    if (action === "edit") {
      const site = state.sites.find((s) => s.id === id);
      if (!site) return;
      $("site-id").value = site.id;
      $("site-name").value = site.name || "";
      $("site-location").value = site.location || "";
      $("site-start").value = site.startDate || "";
      $("site-status").value = site.status || "Active";
    } else if (action === "delete") {
      const hasDependencies =
        state.labours.some((l) => l.siteId === id) ||
        state.attendance.some((a) => a.siteId === id) ||
        state.materials.some((m) => m.siteId === id);
      if (hasDependencies) {
        alert("Cannot delete site while labours, attendance, or materials exist for it.");
        return;
      }
      if (confirm("Delete this site?")) {
        state.sites = state.sites.filter((s) => s.id !== id);
        saveState();
        renderSites();
        fillSiteSelects();
      }
    }
  });

  renderSites();
  fillSiteSelects();
}

// Labours
function renderLabours() {
  const tbody = $("labours-table-body");
  tbody.innerHTML = "";
  state.labours.forEach((labour) => {
    const site = state.sites.find((s) => s.id === labour.siteId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${labour.name || ""}</td>
      <td>${labour.role || ""}</td>
      <td>${labour.dailyWage != null ? Number(labour.dailyWage).toFixed(0) : ""}</td>
      <td>${site ? site.name : ""}</td>
      <td>${labour.active ? "Active" : "Inactive"}</td>
      <td class="actions-cell">
        <button class="btn ghost btn-sm" data-action="edit" data-id="${labour.id}">Edit</button>
        <button class="btn danger btn-sm" data-action="delete" data-id="${labour.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setupLabours() {
  const form = $("labour-form");
  const resetBtn = $("labour-reset");
  const tbody = $("labours-table-body");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("labour-id").value || generateId("labour");
    const labour = {
      id,
      name: $("labour-name").value.trim(),
      phone: $("labour-phone").value.trim(),
      role: $("labour-role").value.trim(),
      dailyWage: Number($("labour-daily-wage").value || 0),
      siteId: $("labour-site").value || "",
      active: $("labour-active").checked,
    };

    const existingIndex = state.labours.findIndex((l) => l.id === id);
    if (existingIndex >= 0) {
      state.labours[existingIndex] = labour;
    } else {
      state.labours.push(labour);
    }
    saveState();
    renderLabours();
    form.reset();
    $("labour-id").value = "";
    $("labour-active").checked = true;
  });

  resetBtn.addEventListener("click", () => {
    form.reset();
    $("labour-id").value = "";
    $("labour-active").checked = true;
  });

  tbody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) return;

    if (action === "edit") {
      const labour = state.labours.find((l) => l.id === id);
      if (!labour) return;
      $("labour-id").value = labour.id;
      $("labour-name").value = labour.name || "";
      $("labour-phone").value = labour.phone || "";
      $("labour-role").value = labour.role || "";
      $("labour-daily-wage").value =
        labour.dailyWage != null ? Number(labour.dailyWage).toString() : "";
      $("labour-site").value = labour.siteId || "";
      $("labour-active").checked = !!labour.active;
    } else if (action === "delete") {
      const hasAttendance = state.attendance.some((a) => a.labourId === id);
      if (hasAttendance) {
        alert("Cannot delete labour who has attendance records.");
        return;
      }
      if (confirm("Delete this labour?")) {
        state.labours = state.labours.filter((l) => l.id !== id);
        saveState();
        renderLabours();
      }
    }
  });

  renderLabours();
}

// Attendance
function computeBasePay(status, dailyWage) {
  const wage = Number(dailyWage || 0);
  if (status === "present") return wage;
  if (status === "halfday") return wage * 0.5;
  return 0;
}

function renderAttendanceRows(siteId, date) {
  const tbody = $("attendance-table-body");
  tbody.innerHTML = "";
  if (!siteId || !date) return;

  const laboursForSite = state.labours.filter((l) => l.siteId === siteId && l.active);
  laboursForSite.forEach((labour) => {
    const existing = state.attendance.find(
      (a) => a.siteId === siteId && a.date === date && a.labourId === labour.id,
    );
    const status = existing ? existing.status : "";
    const otAmount = existing ? existing.otAmount || 0 : 0;
    const remarks = existing ? existing.remarks || "" : "";
    const basePay = computeBasePay(status, labour.dailyWage);
    const totalPay = basePay + Number(otAmount || 0);

    const tr = document.createElement("tr");
    tr.dataset.labourId = labour.id;
    tr.innerHTML = `
      <td>${labour.name || ""}</td>
      <td>${labour.role || ""}</td>
      <td>
        <select class="attendance-status">
          <option value=""></option>
          <option value="present" ${status === "present" ? "selected" : ""}>Present</option>
          <option value="halfday" ${status === "halfday" ? "selected" : ""}>Half-day</option>
          <option value="absent" ${status === "absent" ? "selected" : ""}>Absent</option>
        </select>
      </td>
      <td>
        <input type="number" class="attendance-ot" min="0" step="1" value="${
          otAmount || ""
        }" placeholder="0" />
      </td>
      <td class="attendance-base">${basePay ? basePay.toFixed(0) : ""}</td>
      <td class="attendance-total">${totalPay ? totalPay.toFixed(0) : ""}</td>
      <td>
        <input type="text" class="attendance-remarks" value="${remarks}" />
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setupAttendance() {
  const loadBtn = $("attendance-load");
  const saveBtn = $("attendance-save");
  const tbody = $("attendance-table-body");

  // default date today
  const dateInput = $("attendance-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  loadBtn.addEventListener("click", () => {
    const siteId = $("attendance-site").value;
    const date = $("attendance-date").value;
    if (!siteId || !date) {
      alert("Select site and date to load attendance.");
      return;
    }
    renderAttendanceRows(siteId, date);
  });

  tbody.addEventListener("input", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest("tr");
    if (!row) return;
    const labourId = row.dataset.labourId;
    if (!labourId) return;
    const labour = state.labours.find((l) => l.id === labourId);
    if (!labour) return;

    const statusSelect = row.querySelector(".attendance-status");
    const otInput = row.querySelector(".attendance-ot");
    const baseCell = row.querySelector(".attendance-base");
    const totalCell = row.querySelector(".attendance-total");

    const status = statusSelect ? statusSelect.value : "";
    const otAmount = otInput ? Number(otInput.value || 0) : 0;

    const basePay = computeBasePay(status, labour.dailyWage);
    const totalPay = basePay + otAmount;

    if (baseCell) baseCell.textContent = basePay ? basePay.toFixed(0) : "";
    if (totalCell) totalCell.textContent = totalPay ? totalPay.toFixed(0) : "";
  });

  saveBtn.addEventListener("click", () => {
    const siteId = $("attendance-site").value;
    const date = $("attendance-date").value;
    if (!siteId || !date) {
      alert("Select site and date before saving.");
      return;
    }

    const rows = Array.from(tbody.querySelectorAll("tr"));
    rows.forEach((row) => {
      const labourId = row.dataset.labourId;
      if (!labourId) return;
      const statusSelect = row.querySelector(".attendance-status");
      const otInput = row.querySelector(".attendance-ot");
      const remarksInput = row.querySelector(".attendance-remarks");

      const status = statusSelect ? statusSelect.value : "";
      const otAmount = otInput ? Number(otInput.value || 0) : 0;
      const remarks = remarksInput ? remarksInput.value.trim() : "";

      const existingIndex = state.attendance.findIndex(
        (a) => a.siteId === siteId && a.date === date && a.labourId === labourId,
      );

      if (!status && !otAmount && !remarks) {
        if (existingIndex >= 0) {
          state.attendance.splice(existingIndex, 1);
        }
      } else {
        const record = {
          id:
            existingIndex >= 0
              ? state.attendance[existingIndex].id
              : generateId("attendance"),
          siteId,
          date,
          labourId,
          status,
          otAmount,
          remarks,
        };
        if (existingIndex >= 0) {
          state.attendance[existingIndex] = record;
        } else {
          state.attendance.push(record);
        }
      }
    });

    saveState();
    alert("Attendance saved.");
  });
}

// Materials
function renderMaterialsForCurrentFilter() {
  const tbody = $("materials-table-body");
  tbody.innerHTML = "";
  const siteId = $("material-site").value;
  const date = $("material-date").value;
  const rows = state.materials.filter((m) => {
    if (siteId && m.siteId !== siteId) return false;
    if (date && m.date !== date) return false;
    return true;
  });

  rows.forEach((m) => {
    const site = state.sites.find((s) => s.id === m.siteId);
    const amount = Number(m.qty || 0) * Number(m.rate || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateForDisplay(m.date)}</td>
      <td>${site ? site.name : ""}</td>
      <td>${m.name || ""}</td>
      <td>${m.unit || ""}</td>
      <td>${m.qty != null ? Number(m.qty).toString() : ""}</td>
      <td>${m.rate != null ? Number(m.rate).toFixed(2) : ""}</td>
      <td>${amount ? amount.toFixed(2) : ""}</td>
      <td>${m.supplier || ""}</td>
      <td>${m.notes || ""}</td>
      <td class="actions-cell">
        <button class="btn ghost btn-sm" data-action="edit" data-id="${m.id}">Edit</button>
        <button class="btn danger btn-sm" data-action="delete" data-id="${m.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setupMaterials() {
  const form = $("material-form");
  const resetBtn = $("material-reset");
  const tbody = $("materials-table-body");

  // default date today
  const dateInput = $("material-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("material-id").value || generateId("material");
    const record = {
      id,
      date: $("material-date").value || "",
      siteId: $("material-site").value || "",
      name: $("material-name").value.trim(),
      unit: $("material-unit").value.trim(),
      qty: Number($("material-qty").value || 0),
      rate: Number($("material-rate").value || 0),
      supplier: $("material-supplier").value.trim(),
      notes: $("material-notes").value.trim(),
    };

    if (!record.siteId || !record.date) {
      alert("Select site and date for material.");
      return;
    }

    const existingIndex = state.materials.findIndex((m) => m.id === id);
    if (existingIndex >= 0) {
      state.materials[existingIndex] = record;
    } else {
      state.materials.push(record);
    }
    saveState();
    renderMaterialsForCurrentFilter();
    form.reset();
    $("material-id").value = "";
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  });

  resetBtn.addEventListener("click", () => {
    form.reset();
    $("material-id").value = "";
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    renderMaterialsForCurrentFilter();
  });

  ["material-site", "material-date"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", () => {
      renderMaterialsForCurrentFilter();
    });
  });

  tbody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) return;

    if (action === "edit") {
      const rec = state.materials.find((m) => m.id === id);
      if (!rec) return;
      $("material-id").value = rec.id;
      $("material-date").value = rec.date || "";
      $("material-site").value = rec.siteId || "";
      $("material-name").value = rec.name || "";
      $("material-unit").value = rec.unit || "";
      $("material-qty").value =
        rec.qty != null ? Number(rec.qty).toString() : "";
      $("material-rate").value =
        rec.rate != null ? Number(rec.rate).toString() : "";
      $("material-supplier").value = rec.supplier || "";
      $("material-notes").value = rec.notes || "";
    } else if (action === "delete") {
      if (confirm("Delete this material entry?")) {
        state.materials = state.materials.filter((m) => m.id !== id);
        saveState();
        renderMaterialsForCurrentFilter();
      }
    }
  });

  renderMaterialsForCurrentFilter();
}

// Export to Excel
function filterBySiteAndDate(records, siteId, fromDate, toDate, dateField) {
  return records.filter((r) => {
    if (siteId && r.siteId !== siteId) return false;
    const d = r[dateField];
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}

function setupExport() {
  const btn = $("export-button");
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const siteId = $("export-site").value || "";
    const fromDate = $("export-from").value || "";
    const toDate = $("export-to").value || "";

    const wb = XLSX.utils.book_new();

    // Sites sheet
    const sitesRows = state.sites.map((s) => ({
      "Site ID": s.id,
      Name: s.name,
      Location: s.location,
      "Start Date": s.startDate,
      Status: s.status,
    }));
    const wsSites = XLSX.utils.json_to_sheet(sitesRows);
    XLSX.utils.book_append_sheet(wb, wsSites, "Sites");

    // Labours sheet
    const laboursRows = state.labours.map((l) => {
      const site = state.sites.find((s) => s.id === l.siteId);
      return {
        "Labour ID": l.id,
        Name: l.name,
        Phone: l.phone,
        Role: l.role,
        "Daily Wage (INR)": l.dailyWage,
        "Assigned Site ID": l.siteId,
        "Assigned Site Name": site ? site.name : "",
        Active: l.active ? "Yes" : "No",
      };
    });
    const wsLabours = XLSX.utils.json_to_sheet(laboursRows);
    XLSX.utils.book_append_sheet(wb, wsLabours, "Labours");

    // Attendance sheet
    const attFiltered = filterBySiteAndDate(
      state.attendance,
      siteId,
      fromDate,
      toDate,
      "date",
    );
    const attendanceRows = attFiltered.map((a) => {
      const site = state.sites.find((s) => s.id === a.siteId);
      const labour = state.labours.find((l) => l.id === a.labourId);
      const basePay = labour ? computeBasePay(a.status, labour.dailyWage) : 0;
      const totalPay = basePay + Number(a.otAmount || 0);
      return {
        Date: a.date,
        "Site ID": a.siteId,
        "Site Name": site ? site.name : "",
        "Labour ID": a.labourId,
        "Labour Name": labour ? labour.name : "",
        Role: labour ? labour.role : "",
        Status:
          a.status === "present"
            ? "Present"
            : a.status === "halfday"
            ? "Half-day"
            : a.status === "absent"
            ? "Absent"
            : "",
        "OT Amount (INR)": a.otAmount || 0,
        "Base Pay (INR)": basePay,
        "Total Pay (INR)": totalPay,
        Remarks: a.remarks || "",
      };
    });
    const wsAttendance = XLSX.utils.json_to_sheet(attendanceRows);
    XLSX.utils.book_append_sheet(wb, wsAttendance, "Attendance");

    // Materials sheet
    const matFiltered = filterBySiteAndDate(
      state.materials,
      siteId,
      fromDate,
      toDate,
      "date",
    );
    const materialsRows = matFiltered.map((m) => {
      const site = state.sites.find((s) => s.id === m.siteId);
      const amount = Number(m.qty || 0) * Number(m.rate || 0);
      return {
        Date: m.date,
        "Site ID": m.siteId,
        "Site Name": site ? site.name : "",
        Material: m.name,
        Unit: m.unit,
        Quantity: m.qty,
        "Rate (INR)": m.rate,
        "Amount (INR)": amount,
        Supplier: m.supplier || "",
        Notes: m.notes || "",
      };
    });
    const wsMaterials = XLSX.utils.json_to_sheet(materialsRows);
    XLSX.utils.book_append_sheet(wb, wsMaterials, "Materials");

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `ConstructionManager_${today}.xlsx`;
    XLSX.writeFile(wb, filename);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  setupSites();
  setupLabours();
  setupAttendance();
  setupMaterials();
  setupExport();
});

