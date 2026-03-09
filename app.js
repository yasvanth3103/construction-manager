// Simple store (server-backed with local backup)
const STORAGE_KEY = "construction_manager_data_v1";
const AUTH_TOKEN_KEY = "construction_manager_auth_token";
const API_BASE = "https://construction-manager-e0om.onrender.com";

let authToken = null;
let currentUser = null;
let appInitialized = false;

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

function setAuth(token, user) {
  authToken = token || null;
  currentUser = user || null;
  const pill = document.getElementById("auth-user-pill");
  if (pill) {
    if (authToken && currentUser && currentUser.email) {
      pill.textContent = currentUser.email;
    } else if (authToken) {
      pill.textContent = "Signed in";
    } else {
      pill.textContent = "";
    }
  }
  try {
    if (authToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {
    console.error("Failed to persist auth token", e);
  }
}

function apiFetch(path, options = {}) {
  const opts = { ...options };
  opts.headers = opts.headers || {};
  if (!(opts.body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    opts.headers["Authorization"] = `Bearer ${authToken}`;
  }
  return fetch(path, opts);
}

function saveState() {
  // local backup so the app still has some resilience
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to persist local backup", e);
  }
  if (!authToken) return;
  apiFetch("/api/state", {
    method: "PUT",
    body: JSON.stringify(state),
  }).catch((err) => {
    console.error("Failed to sync state to server", err);
  });
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

function showAppShell() {
  const authShell = document.getElementById("auth-shell");
  const appShell = document.getElementById("app-shell");
  if (authShell) authShell.classList.add("app-shell-hidden");
  if (appShell) appShell.classList.remove("app-shell-hidden");
}

function showAuthShell() {
  const authShell = document.getElementById("auth-shell");
  const appShell = document.getElementById("app-shell");
  if (appShell) appShell.classList.add("app-shell-hidden");
  if (authShell) authShell.classList.remove("app-shell-hidden");
}

function applyStateAndRerender(newState) {
  state = {
    sites: newState.sites || [],
    labours: newState.labours || [],
    attendance: newState.attendance || [],
    materials: newState.materials || [],
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to persist state backup", e);
  }

  renderSites();
  fillSiteSelects();
  renderLabours();
  fillLabourWeekSelect();
  renderMaterialsForCurrentFilter();
  updateTodayOverview();
  updateDashboardToday();
}

function loadStateFromServer() {
  if (!authToken) return Promise.resolve();
  return apiFetch("/api/state")
    .then((res) => {
      if (!res.ok) {
        throw new Error("Failed to load state");
      }
      return res.json();
    })
    .then((data) => {
      applyStateAndRerender(data);
    })
    .catch((err) => {
      console.error("Failed to load state from server", err);
    });
}

function initAppAfterAuth() {
  if (appInitialized) return;
  appInitialized = true;
  setupSites();
  setupLabours();
  setupAttendance();
  setupMaterials();
  setupExport();
  setupBackupRestore();
  setupWeekSummary();
  setupLabourWeekSummary();
  setupDashboard();
  updateTodayOverview();
  updateDashboardToday();

  const attendanceSiteSelect = $("attendance-site");
  if (attendanceSiteSelect) {
    attendanceSiteSelect.addEventListener("change", () => {
      updateTodayOverview();
    });
  }
}

function setupAuth() {
  const form = document.getElementById("auth-form");
  const loginBtn = document.getElementById("auth-login");
  const registerBtn = document.getElementById("auth-register");
  const errorEl = document.getElementById("auth-error");
  const logoutBtn = document.getElementById("logout-button");

  const setError = (msg) => {
    if (errorEl) {
      errorEl.textContent = msg || "";
    }
  };

  const handleAuth = (mode) => {
    if (!form) return;
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    if (!(emailInput && passwordInput)) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      setError("Enter email and password.");
      return;
    }
    setError("");

    fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((res) => {
        if (!res.ok) {
          return res
            .json()
            .catch(() => ({}))
            .then((body) => {
              throw new Error(body.error || "Failed to authenticate");
            });
        }
        return res.json();
      })
      .then((data) => {
        setAuth(data.token, data.user);
        showAppShell();
        initTabs();
        initAppAfterAuth();
        return loadStateFromServer();
      })
      .catch((err) => {
        console.error("Auth error", err);
        setError(err.message || "Authentication failed");
      });
  };

  if (loginBtn) {
    loginBtn.addEventListener("click", () => handleAuth("login"));
  }
  if (registerBtn) {
    registerBtn.addEventListener("click", () => handleAuth("register"));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      setAuth(null, null);
      appInitialized = false;
      showAuthShell();
      if (form) {
        form.reset();
      }
    });
  }

  // Try existing token
  try {
    const stored = localStorage.getItem(AUTH_TOKEN_KEY);
    if (stored) {
      setAuth(stored, null);
      showAppShell();
      initTabs();
      initAppAfterAuth();
      loadStateFromServer();
    }
  } catch (e) {
    console.error("Failed to read auth token", e);
  }
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
    $("week-site"),
    $("dash-month-site"),
  ];
  siteSelects.forEach((select) => {
    if (!select) return;
    const currentId = select.value;
    select.innerHTML = "";

    if (select.id === "export-site" || select.id === "week-site") {
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = "All sites";
      select.appendChild(optAll);
    } else if (select.id === "labour-site") {
      const optAllSites = document.createElement("option");
      optAllSites.value = "";
      optAllSites.textContent = "All sites";
      select.appendChild(optAllSites);
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
      <td>${labour.siteId ? (site ? site.name : "") : "All sites"}</td>
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
  fillLabourWeekSelect();
}

// Attendance
function computeBasePay(status, dailyWage) {
  const wage = Number(dailyWage || 0);
  if (status === "present") return wage;
  if (status === "halfday") return wage * 0.5;
  return 0;
}

function countWorkersWorkedOnDate(date, siteId) {
  const records = state.attendance.filter((a) => {
    if (a.date !== date) return false;
    if (siteId && a.siteId !== siteId) return false;
    return a.status === "present" || a.status === "halfday";
  });
  const ids = new Set(records.map((r) => r.labourId));
  return ids.size;
}

function updateTodayOverview() {
  const today = new Date().toISOString().slice(0, 10);
  const allSpan = $("today-workers-all");
  const siteSpan = $("today-workers-site");
  if (allSpan) {
    allSpan.textContent = countWorkersWorkedOnDate(today, "");
  }
  if (siteSpan) {
    const siteId = $("attendance-site") ? $("attendance-site").value : "";
    if (siteId) {
      siteSpan.textContent = countWorkersWorkedOnDate(today, siteId);
    } else {
      siteSpan.textContent = 0;
    }
  }
}

function setupWeekSummary() {
  const weekStartInput = $("week-start");
  const weekCalcBtn = $("week-calc");
  const tbody = $("week-summary-body");

  if (weekStartInput && !weekStartInput.value) {
    weekStartInput.value = new Date().toISOString().slice(0, 10);
  }

  const calc = () => {
    if (!weekStartInput) return;
    const start = weekStartInput.value;
    if (!start) {
      alert("Select week starting date.");
      return;
    }
    const siteId = $("week-site") ? $("week-site").value || "" : "";
    tbody.innerHTML = "";

    const startDate = new Date(start + "T00:00:00");
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const count = countWorkersWorkedOnDate(iso, siteId);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${iso}</td>
        <td>${dayNames[d.getDay()]}</td>
        <td>${count}</td>
      `;
      tbody.appendChild(tr);
    }
  };

  if (weekCalcBtn) {
    weekCalcBtn.addEventListener("click", calc);
  }
}

function fillLabourWeekSelect() {
  const select = $("labour-week-select");
  if (!select) return;
  const current = select.value;
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select labour";
  select.appendChild(placeholder);

  state.labours.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name || "(no name)";
    select.appendChild(opt);
  });

  if (current) {
    select.value = current;
  }
}

function setupLabourWeekSummary() {
  const labourSelect = $("labour-week-select");
  const weekInput = $("labour-week-start");
  const btn = $("labour-week-calc");
  const tbody = $("labour-week-body");
  const totalSpan = $("labour-week-total");
  const otTotalSpan = $("labour-week-ot-total");

  if (weekInput && !weekInput.value) {
    weekInput.value = new Date().toISOString().slice(0, 10);
  }

  const calc = () => {
    if (!labourSelect || !weekInput) return;
    const labourId = labourSelect.value;
    const start = weekInput.value;
    if (!labourId || !start) {
      alert("Select labour and week starting date.");
      return;
    }

    const startDate = new Date(start + "T00:00:00");
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    tbody.innerHTML = "";
    let daysWorked = 0;
    let totalOt = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const iso = d.toISOString().slice(0, 10);

      const rec = state.attendance.find(
        (a) => a.labourId === labourId && a.date === iso,
      );

      let statusLabel = "";
      let siteName = "";
      let otCount = 0;
      if (rec) {
        const site = state.sites.find((s) => s.id === rec.siteId);
        siteName = site ? site.name : "";
        if (rec.status === "present") statusLabel = "Present";
        else if (rec.status === "halfday") statusLabel = "Half-day";
        else if (rec.status === "absent") statusLabel = "Absent";

        if (rec.status === "present" || rec.status === "halfday") {
          daysWorked += 1;
        }

        if (rec.otType === "morning" || rec.otType === "night") {
          otCount = 1;
        } else if (rec.otType === "both") {
          otCount = 2;
        }
        totalOt += otCount;
      }

      const otText = otCount ? `${otCount} OT` : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${iso}</td>
        <td>${dayNames[d.getDay()]}</td>
        <td>${siteName}</td>
        <td>${statusLabel}</td>
        <td>${otText}</td>
      `;
      tbody.appendChild(tr);
    }

    if (totalSpan) {
      totalSpan.textContent = daysWorked.toString();
    }
    if (otTotalSpan) {
      otTotalSpan.textContent = totalOt.toString();
    }
  };

  if (btn) {
    btn.addEventListener("click", calc);
  }
}

// Dashboard
function updateDashboardToday() {
  const today = new Date().toISOString().slice(0, 10);
  const totalSpan = $("dash-today-all-workers");
  const tbody = $("dash-today-site-body");
  if (!tbody) return;

  const allCount = countWorkersWorkedOnDate(today, "");
  if (totalSpan) {
    totalSpan.textContent = allCount.toString();
  }

  tbody.innerHTML = "";
  state.sites.forEach((site) => {
    const count = countWorkersWorkedOnDate(today, site.id);
    if (count === 0) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${site.name || ""}</td>
      <td>${count}</td>
    `;
    tbody.appendChild(tr);
  });
}

function setupDashboard() {
  const monthInput = $("dash-month");
  const monthBtn = $("dash-month-calc");
  const workersSpan = $("dash-month-workers");
  const labourSpan = $("dash-month-labour");
  const otSpan = $("dash-month-ot");
  const matSpan = $("dash-month-materials");
  const tbody = $("dash-month-site-body");

  if (monthInput && !monthInput.value) {
    const today = new Date();
    const monthStr = today.toISOString().slice(0, 7);
    monthInput.value = monthStr;
  }

  const calcMonth = () => {
    if (!monthInput || !tbody) return;
    const month = monthInput.value;
    if (!month) {
      alert("Please select a month.");
      return;
    }
    const siteFilter = $("dash-month-site") ? $("dash-month-site").value || "" : "";

    // Attendance-based stats
    const att = state.attendance.filter((a) => {
      if (!a.date || !a.date.startsWith(month)) return false;
      if (siteFilter && a.siteId !== siteFilter) return false;
      return true;
    });

    const workerIds = new Set();
    let totalLabourCost = 0;
    let totalOtAmount = 0;

    att.forEach((a) => {
      workerIds.add(a.labourId);
      const labour = state.labours.find((l) => l.id === a.labourId);
      const base = labour ? computeBasePay(a.status, labour.dailyWage) : 0;
      const total = base + Number(a.otAmount || 0);
      totalLabourCost += total;
      totalOtAmount += Number(a.otAmount || 0);
    });

    // Materials-based stats
    const mats = state.materials.filter((m) => {
      if (!m.date || !m.date.startsWith(month)) return false;
      if (siteFilter && m.siteId !== siteFilter) return false;
      return true;
    });

    let totalMaterials = 0;
    mats.forEach((m) => {
      totalMaterials += Number(m.qty || 0) * Number(m.rate || 0);
    });

    if (workersSpan) workersSpan.textContent = workerIds.size.toString();
    if (labourSpan) labourSpan.textContent = totalLabourCost.toFixed(0);
    if (otSpan) otSpan.textContent = totalOtAmount.toFixed(0);
    if (matSpan) matSpan.textContent = totalMaterials.toFixed(0);

    // Per-site breakdown
    tbody.innerHTML = "";
    state.sites.forEach((site) => {
      if (siteFilter && site.id !== siteFilter) return;

      const siteAtt = att.filter((a) => a.siteId === site.id);
      const siteWorkers = new Set(siteAtt.map((a) => a.labourId));
      let siteLabourCost = 0;
      siteAtt.forEach((a) => {
        const labour = state.labours.find((l) => l.id === a.labourId);
        const base = labour ? computeBasePay(a.status, labour.dailyWage) : 0;
        const total = base + Number(a.otAmount || 0);
        siteLabourCost += total;
      });

      const siteMats = mats.filter((m) => m.siteId === site.id);
      let siteMatTotal = 0;
      siteMats.forEach((m) => {
        siteMatTotal += Number(m.qty || 0) * Number(m.rate || 0);
      });

      if (siteWorkers.size === 0 && siteMats.length === 0) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${site.name || ""}</td>
        <td>${siteWorkers.size}</td>
        <td>${siteLabourCost.toFixed(0)}</td>
        <td>${siteMatTotal.toFixed(0)}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  if (monthBtn) {
    monthBtn.addEventListener("click", calcMonth);
  }

  // Initial calculation
  calcMonth();
}

function renderAttendanceRows(siteId, date) {
  const tbody = $("attendance-table-body");
  tbody.innerHTML = "";
  if (!siteId || !date) return;

  const laboursForSite = state.labours.filter(
    (l) => (l.siteId === siteId || !l.siteId) && l.active,
  );
  laboursForSite.forEach((labour) => {
    const existing = state.attendance.find(
      (a) => a.siteId === siteId && a.date === date && a.labourId === labour.id,
    );
    const status = existing ? existing.status : "";
    const otAmount = existing ? existing.otAmount || 0 : 0;
    const otType = existing ? existing.otType || "" : "";
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
        <select class="attendance-ot-type">
          <option value=""></option>
          <option value="morning" ${otType === "morning" ? "selected" : ""}>Morning OT</option>
          <option value="night" ${otType === "night" ? "selected" : ""}>Night OT</option>
          <option value="both" ${otType === "both" ? "selected" : ""}>Morning + Night</option>
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
    updateTodayOverview();
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
      const otTypeSelect = row.querySelector(".attendance-ot-type");
      const otInput = row.querySelector(".attendance-ot");
      const remarksInput = row.querySelector(".attendance-remarks");

      const status = statusSelect ? statusSelect.value : "";
      const otAmount = otInput ? Number(otInput.value || 0) : 0;
      const otType = otTypeSelect ? otTypeSelect.value : "";
      const remarks = remarksInput ? remarksInput.value.trim() : "";

      const existingIndex = state.attendance.findIndex(
        (a) => a.siteId === siteId && a.date === date && a.labourId === labourId,
      );

      if (!status && !otAmount && !remarks && !otType) {
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
          otType,
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
    updateTodayOverview();
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
        "OT Type":
          a.otType === "morning"
            ? "Morning OT"
            : a.otType === "night"
            ? "Night OT"
            : a.otType === "both"
            ? "Morning + Night"
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

// Backup & restore
function setupBackupRestore() {
  const downloadBtn = $("backup-download");
  const restoreBtn = $("backup-restore");
  const fileInput = $("backup-file");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const data = localStorage.getItem(STORAGE_KEY) || JSON.stringify(state);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "construction-manager-backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => {
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Please choose a backup JSON file first.");
        return;
      }
      if (!confirm("Are you sure you want to replace all current data with this backup?")) {
        return;
      }
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          state = {
            sites: parsed.sites || [],
            labours: parsed.labours || [],
            attendance: parsed.attendance || [],
            materials: parsed.materials || [],
          };
          saveState();
          // Refresh UI
          renderSites();
          fillSiteSelects();
          renderLabours();
          renderMaterialsForCurrentFilter();
          fillLabourWeekSelect();
          updateTodayOverview();
          alert("Backup restored successfully.");
        } catch (err) {
          console.error("Failed to restore backup", err);
          alert("Failed to restore backup. Please make sure this is a valid backup file.");
        }
      };
      reader.readAsText(file);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuth();
});

