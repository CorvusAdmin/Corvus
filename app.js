import { createClient } from "@supabase/supabase-js";

const DEFAULT_SCHEDULE_TITLE = "Corvus Planner";
const METADATA_PRIORITY = "corvus-metadata";
const TASK_PRIORITY = "corvus-task";
const UNAVAILABLE_PRIORITY = "corvus-unavailable";
const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_URL = normalizeSupabaseProjectUrl(RAW_SUPABASE_URL);
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
console.log("Supabase env present", {
  VITE_SUPABASE_URL: Boolean(SUPABASE_URL),
  VITE_SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  VITE_SUPABASE_URL_NORMALIZED: Boolean(RAW_SUPABASE_URL && RAW_SUPABASE_URL !== SUPABASE_URL),
});
if (RAW_SUPABASE_URL && RAW_SUPABASE_URL !== SUPABASE_URL) {
  console.warn("Supabase URL included an API path and was normalized before client initialization.");
}
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;

const dayNames = [
  { index: 0, short: "Sun", label: "Sunday" },
  { index: 1, short: "Mon", label: "Monday" },
  { index: 2, short: "Tue", label: "Tuesday" },
  { index: 3, short: "Wed", label: "Wednesday" },
  { index: 4, short: "Thu", label: "Thursday" },
  { index: 5, short: "Fri", label: "Friday" },
  { index: 6, short: "Sat", label: "Saturday" },
];

const defaultCategories = [
  { id: "board", name: "Board Follow-up", color: "#6478b8", locked: true },
  { id: "maintenance", name: "Maintenance", color: "#3b9f93", locked: true },
  { id: "resident", name: "Resident Communication", color: "#8b72b5", locked: true },
  { id: "vendor", name: "Vendor Coordination", color: "#5d946f", locked: true },
  { id: "financial", name: "Financial/Admin", color: "#24d26f", locked: true },
  { id: "documents", name: "Document Creation/Edit", color: "#7fa7d9", locked: true },
  { id: "meeting", name: "Meeting", color: "#a985d6", locked: true },
  { id: "scheduled-call", name: "Scheduled Call", color: "#70c7b8", locked: true },
  { id: "project", name: "Project", color: "#d4ad63", locked: true },
  { id: "compliance", name: "Compliance", color: "#b7655e", locked: true },
  { id: "inspections", name: "Inspections", color: "#f0d45a", locked: true },
  { id: "other", name: "Other", color: "#65726d", locked: true },
];

const defaultState = {
  settings: {
    workDays: [1, 2, 3, 4, 5],
    workStart: "08:30",
    workEnd: "17:00",
    chunkMinutes: 90,
  },
  categories: defaultCategories,
  unavailable: [],
  tasks: [],
  filter: "open",
  scheduleView: "week",
};

let state = structuredClone(defaultState);
let latestPlan = { segments: [], risks: [], unscheduled: [] };
let saveWarning = "";
let currentUser = null;
let currentSchedule = null;
let remoteReady = false;
let isLoadingRemote = false;
let remoteSaveTimer = null;
let remoteSaveInFlight = false;
let pendingRemoteSave = false;
let loginSuccessGateActive = false;
let dashboardArrivalPending = false;

const els = {
  authShell: document.querySelector("#authShell"),
  appShell: document.querySelector("#appShell"),
  loginView: document.querySelector("#loginView"),
  signupView: document.querySelector("#signupView"),
  loginForm: document.querySelector("#loginForm"),
  signupForm: document.querySelector("#signupForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  signupEmail: document.querySelector("#signupEmail"),
  signupPassword: document.querySelector("#signupPassword"),
  signupPasswordError: document.querySelector("#signupPasswordError"),
  showSignup: document.querySelector("#showSignup"),
  showLogin: document.querySelector("#showLogin"),
  authMessage: document.querySelector("#authMessage"),
  userEmail: document.querySelector("#userEmail"),
  userDebugLine: document.querySelector("#userDebugLine"),
  logoutButton: document.querySelector("#logoutButton"),
  workDays: document.querySelector("#workDays"),
  workStart: document.querySelector("#workStart"),
  workEnd: document.querySelector("#workEnd"),
  chunkMinutes: document.querySelector("#chunkMinutes"),
  unavailableForm: document.querySelector("#unavailableForm"),
  blockTitle: document.querySelector("#blockTitle"),
  blockStart: document.querySelector("#blockStart"),
  blockEnd: document.querySelector("#blockEnd"),
  blockRecurrence: document.querySelector("#blockRecurrence"),
  blockRepeatUntil: document.querySelector("#blockRepeatUntil"),
  blockNthControls: document.querySelector("#blockNthControls"),
  blockNthWeek: document.querySelector("#blockNthWeek"),
  blockNthDay: document.querySelector("#blockNthDay"),
  blockList: document.querySelector("#blockList"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskCategory: document.querySelector("#taskCategory"),
  taskCategoryPicker: document.querySelector("#taskCategoryPicker"),
  taskEstimate: document.querySelector("#taskEstimate"),
  taskDue: document.querySelector("#taskDue"),
  taskRecurrence: document.querySelector("#taskRecurrence"),
  taskRepeatUntil: document.querySelector("#taskRepeatUntil"),
  taskNotes: document.querySelector("#taskNotes"),
  categoryForm: document.querySelector("#categoryForm"),
  categoryName: document.querySelector("#categoryName"),
  categoryColor: document.querySelector("#categoryColor"),
  categoryColorPreview: document.querySelector("#categoryColorPreview"),
  categoryColorValue: document.querySelector("#categoryColorValue"),
  categoryList: document.querySelector("#categoryList"),
  scheduleList: document.querySelector("#scheduleList"),
  scheduleSubhead: document.querySelector("#scheduleSubhead"),
  queueList: document.querySelector("#queueList"),
  openCount: document.querySelector("#openCount"),
  openHours: document.querySelector("#openHours"),
  riskCount: document.querySelector("#riskCount"),
  riskDetail: document.querySelector("#riskDetail"),
  nextDue: document.querySelector("#nextDue"),
  nextDueDetail: document.querySelector("#nextDueDetail"),
  weekCapacity: document.querySelector("#weekCapacity"),
  weekCapacityDetail: document.querySelector("#weekCapacityDetail"),
  exportCsv: document.querySelector("#exportCsv"),
  printSchedule: document.querySelector("#printSchedule"),
  clearData: document.querySelector("#clearData"),
  todayButton: document.querySelector("#todayButton"),
  saveNotice: document.querySelector("#saveNotice"),
};

initialize();

async function initialize() {
  renderWorkDays();
  hydrateForms();
  bindEvents();
  bindAuthEvents();
  setSmartDefaults();
  await initializeAuth();
}

function normalizeCategories(categories) {
  const merged = [...defaultCategories];
  if (Array.isArray(categories)) {
    categories.forEach((category) => {
      if (!category?.id || !category?.name) return;
      const existing = merged.find((item) => item.id === category.id);
      if (existing) {
        existing.name = category.name;
        if (!existing.locked) existing.color = category.color || existing.color;
      } else {
        merged.push({
          id: category.id,
          name: category.name,
          color: category.color || "#607075",
          locked: Boolean(category.locked),
        });
      }
    });
  }
  return merged;
}

function saveState() {
  if (!remoteReady || isLoadingRemote || !currentUser || !currentSchedule) {
    return false;
  }
  queueRemoteSave();
  return true;
}

function queueRemoteSave() {
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(() => {
    void saveStateToSupabase();
  }, 300);
}

function renderWorkDays() {
  els.workDays.innerHTML = "";
  dayNames.forEach((day) => {
    const label = document.createElement("label");
    label.className = "day-toggle";
    label.title = day.label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(day.index);
    input.checked = state.settings.workDays.includes(day.index);

    const span = document.createElement("span");
    span.textContent = day.short;

    label.append(input, span);
    els.workDays.append(label);
  });
}

function hydrateForms() {
  els.workStart.value = state.settings.workStart;
  els.workEnd.value = state.settings.workEnd;
  els.chunkMinutes.value = String(state.settings.chunkMinutes);
}

function bindEvents() {
  els.workDays.addEventListener("change", () => {
    state.settings.workDays = [...els.workDays.querySelectorAll("input:checked")].map((input) => Number(input.value));
    persistAndRender();
  });

  [els.workStart, els.workEnd, els.chunkMinutes].forEach((input) => {
    input.addEventListener("change", () => {
      state.settings.workStart = els.workStart.value || defaultState.settings.workStart;
      state.settings.workEnd = els.workEnd.value || defaultState.settings.workEnd;
      state.settings.chunkMinutes = Number(els.chunkMinutes.value) || 90;
      persistAndRender();
    });
  });

  [els.blockStart, els.blockRecurrence].forEach((input) => {
    input.addEventListener("change", syncBlockRecurrenceControls);
  });

  [els.taskDue, els.taskRecurrence].forEach((input) => {
    input.addEventListener("change", syncTaskRepeatUntil);
  });

  els.taskCategoryPicker.addEventListener("click", handleCategoryPickerClick);
  els.taskCategoryPicker.addEventListener("keydown", handleCategoryPickerKeydown);
  els.categoryColor.addEventListener("input", renderCategoryColorPreview);

  els.unavailableForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const start = parseInputDate(els.blockStart.value);
    const end = parseInputDate(els.blockEnd.value);
    if (!start || !end || end <= start) {
      setTemporaryMessage(els.blockList, "Unavailable time needs a valid start and end.");
      return;
    }

    const recurrence = els.blockRecurrence.value || "none";
    const repeatUntil = getRepeatUntilDate(els.blockRepeatUntil.value, start, recurrence, 6);
    const durationMinutes = minutesBetween(start, end);
    const seriesId = recurrence === "none" ? null : createId("series");
    const recurrenceOptions = getBlockRecurrenceOptions(start, recurrence);
    const occurrences = buildRecurringDates(start, recurrence, repeatUntil, recurrenceOptions).map((occurrenceStart, index) => ({
      id: createId("block"),
      seriesId,
      recurrence,
      nthWeek: recurrenceOptions.nthWeek ?? null,
      nthDay: recurrenceOptions.nthDay ?? null,
      occurrenceIndex: index + 1,
      title: els.blockTitle.value.trim() || "Unavailable",
      start: occurrenceStart.toISOString(),
      end: addMinutes(occurrenceStart, durationMinutes).toISOString(),
    }));

    state.unavailable.push(...occurrences);
    els.unavailableForm.reset();
    setSmartDefaults();
    persistAndRender();
  });

  els.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const due = parseInputDate(els.taskDue.value);
    const title = els.taskTitle.value.trim();
    const estimate = Number(els.taskEstimate.value);
    if (!title || !due || !Number.isFinite(estimate) || estimate <= 0) return;

    const recurrence = els.taskRecurrence.value || "none";
    const repeatUntil = getRepeatUntilDate(els.taskRepeatUntil.value, due, recurrence, 3);
    const seriesId = recurrence === "none" ? null : createId("series");
    const roundedEstimate = Math.max(15, Math.round(estimate / 15) * 15);
    const occurrences = buildRecurringDates(due, recurrence, repeatUntil).map((occurrenceDue, index) => ({
      id: createId("task"),
      seriesId,
      recurrence,
      occurrenceIndex: index + 1,
      title: recurrence === "none" ? title : `${title} (${formatShortDate(occurrenceDue)})`,
      categoryId: getValidCategoryId(els.taskCategory.value),
      estimateMinutes: roundedEstimate,
      due: occurrenceDue.toISOString(),
      notes: els.taskNotes.value.trim(),
      complete: false,
      createdAt: new Date().toISOString(),
    }));

    state.tasks.push(...occurrences);

    els.taskForm.reset();
    els.taskEstimate.value = "60";
    els.taskCategory.value = state.categories[0]?.id || "other";
    els.taskRecurrence.value = "none";
    setDefaultDue();
    syncTaskRepeatUntil();
    persistAndRender();
  });

  els.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.categoryName.value.trim();
    if (!name) return;

    const category = {
      id: createId("cat"),
      name,
      color: normalizeColor(els.categoryColor.value, "#2a9d8f"),
      locked: false,
    };
    state.categories.push(category);
    els.categoryForm.reset();
    els.categoryColor.value = "#2a9d8f";
    els.taskCategory.value = category.id;
    renderCategoryColorPreview();
    persistAndRender();
  });

  els.queueList.addEventListener("click", handleQueueClick);
  els.blockList.addEventListener("click", handleBlockClick);
  els.categoryList.addEventListener("click", handleCategoryClick);

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      persistAndRender();
    });
  });

  document.querySelectorAll(".schedule-view-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.scheduleView = button.dataset.scheduleView || "week";
      persistAndRender();
    });
  });

  els.exportCsv.addEventListener("click", exportScheduleCsv);
  els.printSchedule.addEventListener("click", () => window.print());
  els.todayButton.addEventListener("click", scrollToToday);
  els.clearData.addEventListener("click", () => {
    const shouldClear = confirm("Clear all saved tasks, categories, and unavailable time?");
    if (!shouldClear) return;
    state = structuredClone(defaultState);
    saveState();
    renderWorkDays();
    hydrateForms();
    setSmartDefaults();
    render();
  });
}

function bindAuthEvents() {
  els.showSignup.addEventListener("click", () => navigateAuth("signup"));
  els.showLogin.addEventListener("click", () => navigateAuth("login"));
  window.addEventListener("hashchange", renderAuthRoute);
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  els.signupPassword.addEventListener("input", () => {
    if (isSignupPasswordValid(els.signupPassword.value)) {
      setSignupPasswordError(false);
    }
  });

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireSupabaseConfig()) return;
    if (loginSuccessGateActive) return;
    const loginButton = els.loginForm.querySelector("button[type='submit']");
    loginButton.disabled = true;
    setAuthMessage("Logging in...");
    loginSuccessGateActive = true;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: els.loginEmail.value.trim(),
      password: els.loginPassword.value,
    });
    if (error) {
      loginSuccessGateActive = false;
      loginButton.disabled = false;
      setAuthMessage(error.message);
      return;
    }
    const user = data.session?.user || data.user;
    if (!user) {
      loginSuccessGateActive = false;
      loginButton.disabled = false;
      setAuthMessage("Login succeeded, but the user session was not returned. Please refresh and try again.");
      return;
    }
    setAuthMessage("");
    try {
      await playLoginSuccessTransition();
      dashboardArrivalPending = true;
      loginSuccessGateActive = false;
      await enterProtectedApp(user);
    } finally {
      loginSuccessGateActive = false;
      loginButton.disabled = false;
    }
  });

  els.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireSupabaseConfig()) return;
    if (!isSignupPasswordValid(els.signupPassword.value)) {
      setSignupPasswordError(true);
      return;
    }
    setSignupPasswordError(false);
    setAuthMessage("Creating account...");
    const { data, error } = await supabase.auth.signUp({
      email: els.signupEmail.value.trim(),
      password: els.signupPassword.value,
    });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    if (data.session?.user) {
      await enterProtectedApp(data.session.user);
      return;
    }
    setAuthMessage("Check your email to confirm your account, then log in.");
    navigateAuth("login");
  });

  els.logoutButton.addEventListener("click", async () => {
    if (!supabase) return;
    await flushRemoteSave();
    await supabase.auth.signOut();
  });
}

async function initializeAuth() {
  if (!requireSupabaseConfig()) {
    showLoggedOutView("login");
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showLoggedOutView("login");
      return;
    }
    if (session?.user && event !== "INITIAL_SESSION" && !loginSuccessGateActive) {
      void enterProtectedApp(session.user);
    }
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showLoggedOutView("login");
    setAuthMessage(error.message);
    return;
  }

  if (data.session?.user) {
    await enterProtectedApp(data.session.user);
  } else {
    showLoggedOutView(getAuthModeFromHash());
  }
}

function requireSupabaseConfig() {
  if (supabaseConfigured) return true;
  setAuthMessage("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.");
  return false;
}

function navigateAuth(mode) {
  window.location.hash = mode === "signup" ? "signup" : "login";
  renderAuthRoute();
}

function renderAuthRoute() {
  if (currentUser) {
    showProtectedView();
    return;
  }
  showLoggedOutView(getAuthModeFromHash());
}

function getAuthModeFromHash() {
  return window.location.hash.replace("#", "") === "signup" ? "signup" : "login";
}

function showLoggedOutView(mode) {
  currentUser = null;
  currentSchedule = null;
  remoteReady = false;
  window.clearTimeout(remoteSaveTimer);
  resetPlannerState();
  setActiveUserDisplay(null);
  els.appShell.hidden = true;
  els.authShell.hidden = false;
  els.loginView.hidden = mode === "signup";
  els.signupView.hidden = mode !== "signup";
  if (!["#login", "#signup"].includes(window.location.hash)) {
    window.location.hash = mode === "signup" ? "signup" : "login";
  }
}

function showProtectedView() {
  els.authShell.hidden = true;
  els.appShell.hidden = false;
  if (dashboardArrivalPending) {
    dashboardArrivalPending = false;
    els.appShell.classList.add("dashboard-arriving");
    window.setTimeout(() => {
      els.appShell.classList.remove("dashboard-arriving");
    }, 950);
  }
  if (window.location.hash !== "#schedule") {
    history.replaceState(null, "", "#schedule");
  }
}

function setAuthMessage(message) {
  els.authMessage.hidden = !message;
  els.authMessage.textContent = message || "";
}

function playLoginSuccessTransition() {
  return new Promise((resolve) => {
    LoginRavenTransition({
      startElement: els.loginForm.querySelector("button[type='submit']"),
      duration: 3600,
      onComplete: resolve,
    });
  });
}

// Temporary inline raven component. Replace the SVG below with the final branded raven asset when it is ready.
function LoginRavenTransition({ onComplete, startElement, duration = 3600 }) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const overlay = document.createElement("div");
  const path = getLoginTransitionPath(startElement);
  const transitionDuration = prefersReducedMotion ? 460 : duration;

  overlay.className = `login-raven-transition${prefersReducedMotion ? " reduced-motion" : ""}`;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Login successful. Opening dashboard.");
  overlay.style.setProperty("--origin-x", `${path.startX}px`);
  overlay.style.setProperty("--origin-y", `${path.startY}px`);
  overlay.style.setProperty("--feather-rise-x", `${path.featherX}px`);
  overlay.style.setProperty("--feather-rise-y", `${path.featherY}px`);
  overlay.style.setProperty("--raven-form-x", `${path.formX}px`);
  overlay.style.setProperty("--raven-form-y", `${path.formY}px`);
  overlay.style.setProperty("--raven-center-x", `${path.centerX}px`);
  overlay.style.setProperty("--raven-center-y", `${path.centerY}px`);
  overlay.style.setProperty("--raven-exit-x", `${path.exitX}px`);
  overlay.style.setProperty("--raven-exit-y", `${path.exitY}px`);
  overlay.innerHTML = `
    <div class="raven-veil" aria-hidden="true"></div>
    <div class="button-origin-glow" aria-hidden="true"></div>
    <div class="waypoint-field" aria-hidden="true">
      <svg viewBox="0 0 760 520" focusable="false">
        <path class="waypoint-line line-one" d="M92 372 C190 214 345 168 505 240 S656 260 704 118"></path>
        <path class="waypoint-line line-two" d="M118 162 C266 214 374 118 558 174"></path>
        <path class="waypoint-line line-three" d="M184 430 C298 338 408 336 604 410"></path>
        <circle class="waypoint-node node-one" cx="92" cy="372" r="7"></circle>
        <circle class="waypoint-node node-two" cx="238" cy="224" r="5"></circle>
        <circle class="waypoint-node node-three" cx="390" cy="174" r="6"></circle>
        <circle class="waypoint-node node-four" cx="550" cy="250" r="7"></circle>
        <circle class="waypoint-node node-five" cx="704" cy="118" r="5"></circle>
        <circle class="waypoint-node node-six" cx="604" cy="410" r="6"></circle>
      </svg>
    </div>
    <div class="dashboard-vision" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="feather-spirit" aria-hidden="true">
      <div class="feather-glow"></div>
      <svg viewBox="0 0 96 142" focusable="false">
        <path class="feather-core" d="M75 6 C42 18 21 47 15 86 C12 108 19 128 29 137 C28 109 37 75 60 30 C49 58 37 93 36 136 C54 119 72 84 79 48 C82 30 81 15 75 6 Z"></path>
        <path class="feather-edge" d="M75 6 C42 18 21 47 15 86 C12 108 19 128 29 137 C29 103 40 62 75 6 Z"></path>
        <path class="feather-vein" d="M31 136 C34 96 47 52 75 6"></path>
        <path class="feather-barb" d="M38 101 C25 105 18 112 13 122"></path>
        <path class="feather-barb" d="M45 77 C31 79 23 85 16 95"></path>
        <path class="feather-barb" d="M54 53 C39 54 30 60 22 70"></path>
      </svg>
    </div>
    <div class="spirit-raven" aria-hidden="true">
      <div class="raven-energy"></div>
      <div class="raven-trail"></div>
      <div class="raven-particles">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <svg class="raven-svg" viewBox="0 0 188 128" focusable="false">
        <defs>
          <linearGradient id="ravenEdgeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#b8eee4" stop-opacity="0.82"></stop>
            <stop offset="62%" stop-color="#00f0d1" stop-opacity="0.24"></stop>
            <stop offset="100%" stop-color="#8fa6d9" stop-opacity="0.05"></stop>
          </linearGradient>
        </defs>
        <path class="raven-wing raven-wing-back" d="M78 67 C52 53 31 28 8 18 C20 44 43 70 74 83 C94 91 113 89 132 78 C110 78 94 74 78 67 Z"></path>
        <path class="raven-body" d="M58 82 C72 51 101 38 135 42 C148 43 160 37 174 25 C170 42 158 54 143 61 C126 80 98 95 59 101 C39 104 24 101 10 93 C27 92 44 88 58 82 Z"></path>
        <path class="raven-wing raven-wing-front" d="M88 72 C76 50 69 30 70 7 C95 20 121 43 142 72 C121 75 103 75 88 72 Z"></path>
        <path class="raven-head" d="M132 43 C146 27 164 20 188 17 C174 31 157 44 139 52 Z"></path>
        <path class="raven-tail" d="M57 84 C38 75 22 66 0 65 C14 80 29 91 52 99 Z"></path>
        <path class="raven-edge" d="M18 19 C50 55 85 78 132 77 M70 8 C94 23 118 44 142 72 M134 44 C151 31 166 23 188 17"></path>
      </svg>
    </div>
    <div class="arrival-dust" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
  `;

  startElement?.classList.add("login-success-origin");
  els.authShell.classList.add("auth-shell-transitioning");
  document.body.append(overlay);

  window.setTimeout(() => {
    overlay.remove();
    startElement?.classList.remove("login-success-origin");
    els.authShell.classList.remove("auth-shell-transitioning");
    onComplete?.();
  }, transitionDuration);

  return overlay;
}

function getLoginTransitionPath(startElement) {
  const fallbackX = Math.round(window.innerWidth * 0.46);
  const fallbackY = Math.round(window.innerHeight * 0.62);
  const rect = startElement?.getBoundingClientRect();
  const startX = rect ? rect.left + (rect.width * 0.42) : fallbackX;
  const startY = rect ? rect.top + (rect.height * 0.45) : fallbackY;
  const centerX = Math.round(window.innerWidth * 0.54);
  const centerY = Math.round(window.innerHeight * 0.42);
  return {
    startX,
    startY,
    featherX: startX + Math.max(52, window.innerWidth * 0.045),
    featherY: Math.max(78, startY - Math.max(150, window.innerHeight * 0.24)),
    formX: centerX - Math.max(132, window.innerWidth * 0.12),
    formY: Math.max(76, centerY - Math.max(72, window.innerHeight * 0.12)),
    centerX,
    centerY,
    exitX: Math.min(window.innerWidth - 98, centerX + Math.max(210, window.innerWidth * 0.24)),
    exitY: Math.max(48, centerY - Math.max(180, window.innerHeight * 0.28)),
  };
}

function setActiveUserDisplay(user) {
  const email = user?.email || "";
  const shortId = user?.id ? user.id.slice(0, 8) : "";
  els.userEmail.textContent = email;
  els.userDebugLine.textContent = user
    ? `Logged in as: ${email} | User ID: ${shortId}`
    : "";
}

function togglePasswordVisibility(button) {
  const input = document.querySelector(`#${button.dataset.passwordToggle}`);
  if (!input) return;

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.textContent = shouldShow ? "Hide" : "Show";
  button.setAttribute("aria-pressed", String(shouldShow));
  button.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} password`);
}

function isSignupPasswordValid(password) {
  return password.length >= 6
    && /[a-z]/i.test(password)
    && /\d/.test(password);
}

function setSignupPasswordError(shouldShow) {
  els.signupPasswordError.hidden = !shouldShow;
  els.signupPassword.setAttribute("aria-invalid", String(shouldShow));
  if (shouldShow) setAuthMessage("");
}

function resetPlannerState() {
  state = structuredClone(defaultState);
  latestPlan = { segments: [], risks: [], unscheduled: [] };
  saveWarning = "";
  renderWorkDays();
  hydrateForms();
  setSmartDefaults();
  render();
}

async function enterProtectedApp(user) {
  if (!user) {
    showLoggedOutView("login");
    return;
  }

  if (remoteReady && currentUser?.id === user.id) {
    showProtectedView();
    return;
  }

  if (currentUser?.id && currentUser.id !== user.id) {
    resetPlannerState();
  }

  currentUser = user;
  setActiveUserDisplay(user);
  setAuthMessage("");
  showProtectedView();
  await loadUserSchedule();
}

async function loadUserSchedule() {
  if (!currentUser || !supabase) return;
  isLoadingRemote = true;
  remoteReady = false;
  saveWarning = "Loading your schedule...";
  renderSaveNotice();

  try {
    await ensureProfile();
    currentSchedule = await ensureDefaultSchedule();
    const { data, error } = await supabase
      .from("schedule_items")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("schedule_id", currentSchedule.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (data?.length) {
      state = deserializeScheduleItems(data);
      saveWarning = "";
    } else {
      state = structuredClone(defaultState);
      saveWarning = "";
      remoteReady = true;
      isLoadingRemote = false;
      hydrateLoadedState();
      render();
      await saveStateToSupabase();
      return;
    }

    remoteReady = true;
    isLoadingRemote = false;
    hydrateLoadedState();
    render();
  } catch (error) {
    isLoadingRemote = false;
    saveWarning = `Supabase could not load this schedule: ${error.message}`;
    renderSaveNotice();
    showLoggedOutView("login");
    setAuthMessage(saveWarning);
  }
}

async function ensureProfile() {
  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: currentUser.id,
      email: currentUser.email || "",
    }, { onConflict: "id" });
  if (error) throw error;
}

async function ensureDefaultSchedule() {
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from("schedules")
    .insert({
      user_id: currentUser.id,
      title: DEFAULT_SCHEDULE_TITLE,
    })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

function hydrateLoadedState() {
  renderWorkDays();
  hydrateForms();
  setSmartDefaults();
}

async function flushRemoteSave() {
  window.clearTimeout(remoteSaveTimer);
  if (remoteReady && currentUser && currentSchedule) {
    await saveStateToSupabase();
  }
}

async function saveStateToSupabase() {
  if (!remoteReady || isLoadingRemote || !currentUser || !currentSchedule || !supabase) return;
  if (remoteSaveInFlight) {
    pendingRemoteSave = true;
    return;
  }

  remoteSaveInFlight = true;
  pendingRemoteSave = false;

  try {
    const rows = serializeScheduleItems();
    const { error: deleteError } = await supabase
      .from("schedule_items")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("schedule_id", currentSchedule.id);

    if (deleteError) throw deleteError;

    if (rows.length) {
      const { error: insertError } = await supabase
        .from("schedule_items")
        .insert(rows);
      if (insertError) throw insertError;
    }

    saveWarning = "";
    renderSaveNotice();
  } catch (error) {
    saveWarning = `Supabase could not save this schedule: ${error.message}`;
    renderSaveNotice();
  } finally {
    remoteSaveInFlight = false;
    if (pendingRemoteSave) {
      pendingRemoteSave = false;
      await saveStateToSupabase();
    }
  }
}

function serializeScheduleItems() {
  const base = {
    schedule_id: currentSchedule.id,
    user_id: currentUser.id,
  };

  const rows = [{
    ...base,
    title: "Corvus planner settings",
    priority: METADATA_PRIORITY,
    status: "metadata",
    notes: encodeItemNotes("metadata", {
      settings: state.settings,
      categories: state.categories,
      filter: state.filter,
      scheduleView: state.scheduleView,
    }),
  }];

  state.unavailable.forEach((block) => {
    rows.push({
      ...base,
      title: block.title,
      start_time: block.start,
      end_time: block.end,
      priority: UNAVAILABLE_PRIORITY,
      status: "blocked",
      notes: encodeItemNotes("unavailable", block),
    });
  });

  state.tasks.forEach((task) => {
    rows.push({
      ...base,
      title: task.title,
      end_time: task.due,
      priority: TASK_PRIORITY,
      status: task.complete ? "complete" : "open",
      notes: encodeItemNotes("task", task),
    });
  });

  return rows;
}

function deserializeScheduleItems(rows) {
  const nextState = structuredClone(defaultState);

  rows.forEach((row) => {
    const decoded = decodeItemNotes(row.notes);
    if (decoded.kind !== "metadata") return;
    const metadata = decoded.payload || {};
    nextState.settings = { ...defaultState.settings, ...(metadata.settings || {}) };
    nextState.categories = normalizeCategories(metadata.categories);
    nextState.filter = metadata.filter || defaultState.filter;
    nextState.scheduleView = metadata.scheduleView || defaultState.scheduleView;
  });

  rows.forEach((row) => {
    const decoded = decodeItemNotes(row.notes);
    if (decoded.kind === "task") {
      nextState.tasks.push(normalizeTask(decoded.payload, row));
      return;
    }
    if (decoded.kind === "unavailable") {
      nextState.unavailable.push(normalizeUnavailableBlock(decoded.payload, row));
      return;
    }
    if (decoded.kind === "metadata" || row.priority === METADATA_PRIORITY) return;
    nextState.tasks.push(convertScheduleItemToTask(row));
  });

  return nextState;
}

function encodeItemNotes(kind, payload) {
  return JSON.stringify({
    corvus: true,
    version: 1,
    kind,
    payload,
  });
}

function decodeItemNotes(notes) {
  try {
    const parsed = JSON.parse(notes || "");
    if (parsed?.corvus && parsed.kind) return parsed;
  } catch {
    return { kind: "", payload: null };
  }
  return { kind: "", payload: null };
}

function normalizeTask(task, row) {
  const fallbackDue = row.end_time || row.start_time || new Date().toISOString();
  return {
    id: task?.id || row.id || createId("task"),
    seriesId: task?.seriesId || null,
    recurrence: task?.recurrence || "none",
    occurrenceIndex: task?.occurrenceIndex || 1,
    title: task?.title || row.title,
    categoryId: getValidCategoryId(task?.categoryId || "other"),
    estimateMinutes: Number(task?.estimateMinutes) || 60,
    due: task?.due || fallbackDue,
    notes: task?.notes || "",
    complete: typeof task?.complete === "boolean" ? task.complete : row.status === "complete",
    createdAt: task?.createdAt || row.created_at || new Date().toISOString(),
  };
}

function normalizeUnavailableBlock(block, row) {
  const start = block?.start || row.start_time || new Date().toISOString();
  return {
    id: block?.id || row.id || createId("block"),
    seriesId: block?.seriesId || null,
    recurrence: block?.recurrence || "none",
    nthWeek: block?.nthWeek ?? null,
    nthDay: block?.nthDay ?? null,
    occurrenceIndex: block?.occurrenceIndex || 1,
    title: block?.title || row.title || "Unavailable",
    start,
    end: block?.end || row.end_time || addMinutes(new Date(start), 60).toISOString(),
  };
}

function convertScheduleItemToTask(row) {
  return {
    id: row.id || createId("task"),
    seriesId: null,
    recurrence: "none",
    occurrenceIndex: 1,
    title: row.title || "Untitled task",
    categoryId: "other",
    estimateMinutes: 60,
    due: row.end_time || row.start_time || new Date().toISOString(),
    notes: row.notes || "",
    complete: row.status === "complete",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function setSmartDefaults() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(now.getMinutes() > 30 ? 0 : 30, 0, 0);
  if (now.getMinutes() > 30) nextHour.setHours(now.getHours() + 1);

  const blockEnd = new Date(nextHour);
  blockEnd.setHours(blockEnd.getHours() + 1);
  els.blockStart.value = toInputDate(nextHour);
  els.blockEnd.value = toInputDate(blockEnd);
  els.blockRecurrence.value = "none";
  syncBlockRecurrenceControls();
  setDefaultDue();
  syncTaskRepeatUntil();
}

function setDefaultDue() {
  if (els.taskDue.value) return;
  const due = new Date();
  due.setDate(due.getDate() + 1);
  const endMinutes = timeToMinutes(state.settings.workEnd);
  due.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  els.taskDue.value = toInputDate(due);
}

function syncBlockRecurrenceControls() {
  const start = parseInputDate(els.blockStart.value) || new Date();
  const until = addMonths(start, 6);
  els.blockRepeatUntil.value = toInputDateOnly(until);
  els.blockRepeatUntil.disabled = els.blockRecurrence.value === "none";
  syncNthWeekdayDefaults(start);

  const usesNthControls = isNthWeekdayRecurrence(els.blockRecurrence.value);
  els.blockNthControls.hidden = !usesNthControls;
  els.blockNthWeek.disabled = !usesNthControls;
  els.blockNthDay.disabled = !usesNthControls;
}

function syncNthWeekdayDefaults(date) {
  els.blockNthWeek.value = String(getWeekOfMonth(date));
  els.blockNthDay.value = String(date.getDay());
}

function syncTaskRepeatUntil() {
  const due = parseInputDate(els.taskDue.value) || new Date();
  const until = addMonths(due, 3);
  els.taskRepeatUntil.value = toInputDateOnly(until);
  els.taskRepeatUntil.disabled = els.taskRecurrence.value === "none";
}

function getBlockRecurrenceOptions(start, recurrence) {
  if (!isNthWeekdayRecurrence(recurrence)) return {};
  return {
    nthWeek: Number(els.blockNthWeek.value) || getWeekOfMonth(start),
    nthDay: Number(els.blockNthDay.value),
  };
}

function getRepeatUntilDate(value, firstDate, recurrence, defaultMonths) {
  if (recurrence === "none") return firstDate;
  const selected = parseInputDateOnlyEnd(value);
  const fallback = endOfDay(addMonths(firstDate, defaultMonths));
  const until = selected || fallback;
  return until < firstDate ? firstDate : until;
}

function buildRecurringDates(firstDate, recurrence, repeatUntil, options = {}) {
  if (recurrence === "none") return [new Date(firstDate)];
  if (recurrence === "weekdays" || recurrence === "weekends") {
    return buildFilteredDailyDates(firstDate, recurrence, repeatUntil);
  }
  if (isNthWeekdayRecurrence(recurrence)) {
    return buildNthWeekdayDates(firstDate, recurrence, repeatUntil, options);
  }

  const dates = [new Date(firstDate)];
  const maxOccurrences = 260;
  let next = advanceRecurringDate(firstDate, recurrence);

  while (next <= repeatUntil && dates.length < maxOccurrences) {
    dates.push(new Date(next));
    next = advanceRecurringDate(next, recurrence);
  }

  return dates;
}

function buildFilteredDailyDates(firstDate, recurrence, repeatUntil) {
  const dates = [];
  const maxOccurrences = 260;
  let next = new Date(firstDate);

  while (next <= repeatUntil && dates.length < maxOccurrences) {
    const day = next.getDay();
    const isWeekend = day === 0 || day === 6;
    if ((recurrence === "weekdays" && !isWeekend) || (recurrence === "weekends" && isWeekend)) {
      dates.push(new Date(next));
    }
    next = addDays(next, 1);
  }

  return dates.length ? dates : [new Date(firstDate)];
}

function buildNthWeekdayDates(firstDate, recurrence, repeatUntil, options = {}) {
  const dates = [];
  const maxOccurrences = 80;
  const monthInterval = recurrence === "bimonthlyNth" ? 2 : 1;
  const nthWeek = options.nthWeek ?? getWeekOfMonth(firstDate);
  const nthDay = options.nthDay ?? firstDate.getDay();
  let cursor = startOfMonth(firstDate);

  while (dates.length < maxOccurrences) {
    const occurrence = getNthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), nthWeek, nthDay, firstDate);
    if (occurrence && occurrence > repeatUntil) break;
    if (occurrence && occurrence >= firstDate) dates.push(occurrence);
    cursor = addMonths(cursor, monthInterval);
    if (cursor > repeatUntil && startOfMonth(cursor) > repeatUntil) break;
  }

  return dates.length ? dates : [new Date(firstDate)];
}

function advanceRecurringDate(date, recurrence) {
  if (recurrence === "daily") return addDays(date, 1);
  if (recurrence === "weekly") return addDays(date, 7);
  if (recurrence === "biweekly") return addDays(date, 14);
  if (recurrence === "monthly") return addMonths(date, 1);
  return new Date(date);
}

function isNthWeekdayRecurrence(recurrence) {
  return recurrence === "monthlyNth" || recurrence === "bimonthlyNth";
}

function persistAndRender() {
  render();
  saveState();
}

function render() {
  latestPlan = buildSchedule();
  renderSaveNotice();
  renderCategoryControls();
  renderUnavailable();
  renderSchedule();
  renderQueue();
  renderMetrics();
}

function renderSaveNotice() {
  if (!els.saveNotice) return;
  els.saveNotice.hidden = !saveWarning;
  els.saveNotice.textContent = saveWarning;
}

function renderCategoryControls() {
  const selectedCategory = getValidCategoryId(els.taskCategory.value);
  els.taskCategory.innerHTML = "";
  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    els.taskCategory.append(option);
  });
  els.taskCategory.value = selectedCategory;
  renderTaskCategoryPicker(selectedCategory);

  els.categoryList.innerHTML = "";
  state.categories.forEach((category) => {
    const chip = document.createElement("span");
    chip.className = "category-chip";
    chip.innerHTML = `
      <span class="swatch" style="background:${escapeAttribute(normalizeColor(category.color))}"></span>
      <span>${escapeHtml(category.name)}</span>
      ${category.locked ? "" : `<button class="chip-remove" type="button" data-category-delete="${escapeAttribute(category.id)}" title="Remove category">x</button>`}
    `;
    els.categoryList.append(chip);
  });
  renderCategoryColorPreview();
}

function renderTaskCategoryPicker(selectedCategory) {
  els.taskCategoryPicker.innerHTML = "";
  state.categories.forEach((category) => {
    const isSelected = category.id === selectedCategory;
    const button = document.createElement("button");
    const color = normalizeColor(category.color);
    button.type = "button";
    button.className = `category-option${isSelected ? " selected" : ""}`;
    button.dataset.categorySelect = category.id;
    button.style.setProperty("--category-color", color);
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
    button.innerHTML = `
      <span class="swatch" style="background:${escapeAttribute(color)}"></span>
      <span>${escapeHtml(category.name)}</span>
    `;
    els.taskCategoryPicker.append(button);
  });
}

function renderCategoryColorPreview() {
  const color = normalizeColor(els.categoryColor.value, "#2a9d8f");
  els.categoryColor.value = color;
  els.categoryColorPreview.style.background = color;
  els.categoryColorValue.textContent = color.toUpperCase();
}

function renderUnavailable() {
  els.blockList.innerHTML = "";
  const blocks = [...state.unavailable].sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!blocks.length) {
    appendEmpty(els.blockList, "No unavailable time", "Meetings and inspections will appear here.");
    return;
  }

  groupUnavailableForDisplay(blocks).forEach((item) => {
    if (item.type === "series") {
      els.blockList.append(renderUnavailableSeries(item));
    } else {
      els.blockList.append(renderUnavailableBlock(item.block));
    }
  });
}

function groupUnavailableForDisplay(blocks) {
  const series = new Map();
  const items = [];

  blocks.forEach((block) => {
    const groupKey = getUnavailableGroupKey(block);
    if (!groupKey) {
      items.push({ type: "single", block, start: new Date(block.start) });
      return;
    }

    if (!series.has(groupKey)) {
      series.set(groupKey, {
        type: "series",
        seriesKey: groupKey,
        recurrence: block.recurrence,
        nthWeek: block.nthWeek,
        nthDay: block.nthDay,
        title: block.title,
        blocks: [],
        start: new Date(block.start),
      });
    }

    const group = series.get(groupKey);
    group.blocks.push(block);
    if (new Date(block.start) < group.start) group.start = new Date(block.start);
  });

  series.forEach((group) => {
    group.blocks.sort((a, b) => new Date(a.start) - new Date(b.start));
    items.push(group);
  });

  return items.sort((a, b) => a.start - b.start);
}

function getUnavailableGroupKey(block) {
  if (block.seriesId) return block.seriesId;
  if (!block.recurrence || block.recurrence === "none") return "";

  const start = new Date(block.start);
  const end = new Date(block.end);
  const startMinutes = (start.getHours() * 60) + start.getMinutes();
  const duration = minutesBetween(start, end);
  return [
    "fallback-series",
    block.title,
    block.recurrence,
    block.nthWeek ?? "",
    block.nthDay ?? "",
    startMinutes,
    duration,
  ].join("|");
}

function renderUnavailableBlock(block) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.innerHTML = `
    <div class="item-top">
      <div class="item-title">${escapeHtml(block.title)}</div>
      <button class="small-button danger" type="button" data-block-delete="${escapeAttribute(block.id)}">Remove</button>
    </div>
    <div class="item-meta">${formatDateTimeRange(new Date(block.start), new Date(block.end))}</div>
  `;
  return card;
}

function renderUnavailableSeries(group) {
  const card = document.createElement("article");
  const first = group.blocks[0];
  const last = group.blocks[group.blocks.length - 1];
  const next = group.blocks.find((block) => new Date(block.end) >= new Date()) || first;
  const dateRows = group.blocks.map((block) => `
    <div class="series-date-row">
      <span>${escapeHtml(formatDateTimeRange(new Date(block.start), new Date(block.end)))}</span>
      <button class="small-button danger" type="button" data-block-delete="${escapeAttribute(block.id)}">Remove</button>
    </div>
  `).join("");

  card.className = "item-card series-card";
  card.innerHTML = `
    <div class="item-top">
      <div>
        <div class="item-title">${escapeHtml(group.title)}</div>
        <div class="item-meta">
          ${escapeHtml(formatRecurrence(group.recurrence, group))} series - ${group.blocks.length} date${group.blocks.length === 1 ? "" : "s"} - ${escapeHtml(formatShortDate(new Date(first.start)))} to ${escapeHtml(formatShortDate(new Date(last.start)))}
        </div>
      </div>
      <button class="small-button danger" type="button" data-block-series-delete="${escapeAttribute(group.seriesKey)}">Delete series</button>
    </div>
    <div class="series-next">Next: ${escapeHtml(formatDateTimeRange(new Date(next.start), new Date(next.end)))}</div>
    <details class="series-details">
      <summary>View series dates</summary>
      <div class="series-date-list">${dateRows}</div>
    </details>
  `;
  return card;
}

function renderSchedule() {
  els.scheduleList.innerHTML = "";
  renderScheduleViewButtons();

  const range = getScheduleViewRange();
  const scheduled = latestPlan.segments.filter((segment) => (
    segment.type === "task" && segmentIntersectsRange(segment, range)
  ));
  const scheduledDays = new Set(scheduled.map((segment) => formatDayKey(segment.start)));
  const blocked = latestPlan.segments.filter((segment) => (
    segment.type === "blocked"
    && segmentIntersectsRange(segment, range)
  ));
  const allSegments = [...scheduled, ...blocked].sort((a, b) => a.start - b.start);

  if (!allSegments.length) {
    appendEmpty(els.scheduleList, `No schedule items ${getScheduleViewPhrase()}`, "Switch views or add tasks to generate a workday plan.");
    els.scheduleSubhead.textContent = formatScheduleRangeLabel(range);
    return;
  }

  const totalMinutes = scheduled.reduce((sum, segment) => sum + segment.minutes, 0);
  const workText = scheduled.length
    ? `${scheduled.length} work block${scheduled.length === 1 ? "" : "s"} across ${formatDuration(totalMinutes)}`
    : "No task work in this view";
  els.scheduleSubhead.textContent = `${formatScheduleRangeLabel(range)} - ${workText}`;

  const groups = groupByDay(allSegments);
  groups.forEach((group) => {
    const day = document.createElement("section");
    day.className = "day-group";
    day.dataset.day = group.key;
    const workMinutes = group.items
      .filter((segment) => segment.type === "task")
      .reduce((sum, segment) => sum + segment.minutes, 0);
    day.innerHTML = `
      <header class="day-header">
        <strong>${escapeHtml(formatDayHeading(group.date))}</strong>
        <span>${formatDuration(workMinutes)}</span>
      </header>
    `;

    group.items.forEach((segment) => {
      const row = document.createElement("article");
      row.className = `schedule-item ${segment.type === "blocked" ? "blocked" : ""}`;

      if (segment.type === "blocked") {
        row.innerHTML = `
          <div class="schedule-time">${formatTime(segment.start)}<br>${formatTime(segment.end)}</div>
          <div class="schedule-body">
            <div class="schedule-title">${escapeHtml(segment.title)}</div>
            <div class="schedule-meta">
              <span class="time-pill">${formatDuration(segment.minutes)}</span>
            </div>
          </div>
        `;
      } else {
        const category = getCategory(segment.categoryId);
        row.innerHTML = `
          <div class="schedule-time">${formatTime(segment.start)}<br>${formatTime(segment.end)}</div>
          <div class="schedule-body">
            <div class="schedule-title">${escapeHtml(segment.title)}${segment.partCount > 1 ? `, part ${segment.partNumber}` : ""}</div>
            <div class="schedule-meta">
              <span class="category-pill" style="background:${escapeAttribute(category.color)}">${escapeHtml(category.name)}</span>
              <span class="time-pill">${formatDuration(segment.minutes)}</span>
              ${segment.endsAfterDue ? `<span class="risk-pill">After due date</span>` : ""}
            </div>
          </div>
        `;
      }
      day.append(row);
    });
    els.scheduleList.append(day);
  });
}

function renderScheduleViewButtons() {
  document.querySelectorAll(".schedule-view-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.scheduleView === state.scheduleView);
  });
}

function getScheduleViewRange() {
  const today = startOfDay(new Date());
  if (state.scheduleView === "day") {
    return { start: today, end: addDays(today, 1), view: "day" };
  }
  if (state.scheduleView === "month") {
    return { start: startOfMonth(today), end: addMonths(startOfMonth(today), 1), view: "month" };
  }
  return { start: today, end: addDays(today, 7), view: "week" };
}

function segmentIntersectsRange(segment, range) {
  return segment.end > range.start && segment.start < range.end;
}

function getScheduleViewPhrase() {
  if (state.scheduleView === "day") return "today";
  if (state.scheduleView === "month") return "this month";
  return "this week";
}

function formatScheduleRangeLabel(range) {
  if (range.view === "day") return formatDayHeading(range.start);
  if (range.view === "month") {
    return new Intl.DateTimeFormat([], { month: "long", year: "numeric" }).format(range.start);
  }
  return `${formatShortDate(range.start)} to ${formatShortDate(addDays(range.end, -1))}`;
}

function renderQueue() {
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });

  els.queueList.innerHTML = "";
  const riskByTask = new Map(latestPlan.risks.map((risk) => [risk.taskId, risk]));
  const tasks = state.tasks
    .filter(taskMatchesQueueFilter)
    .sort(compareQueueTasks);

  if (!tasks.length) {
    appendEmpty(els.queueList, "No tasks in this view", "Tasks will appear here after they are added.");
    return;
  }

  groupTasksForQueue(tasks).forEach((item) => {
    els.queueList.append(item.type === "series"
      ? renderTaskSeries(item, riskByTask)
      : renderTaskCard(item.task, riskByTask));
  });
}

function taskMatchesQueueFilter(task) {
  if (state.filter === "open") return !task.complete;
  if (state.filter === "complete") return task.complete;
  return true;
}

function compareQueueTasks(a, b) {
  if (a.complete !== b.complete) return a.complete ? 1 : -1;
  return new Date(a.due) - new Date(b.due);
}

function groupTasksForQueue(tasks) {
  const series = new Map();
  const items = [];

  tasks.forEach((task) => {
    if (!task.seriesId) {
      items.push({
        type: "single",
        task,
        complete: task.complete,
        sortDate: new Date(task.due),
      });
      return;
    }

    if (!series.has(task.seriesId)) {
      const allTasks = state.tasks
        .filter((candidate) => candidate.seriesId === task.seriesId)
        .sort((a, b) => new Date(a.due) - new Date(b.due));

      series.set(task.seriesId, {
        type: "series",
        seriesId: task.seriesId,
        recurrence: task.recurrence,
        categoryId: task.categoryId,
        title: getTaskSeriesTitle(task),
        displayTasks: [],
        allTasks,
      });
    }

    series.get(task.seriesId).displayTasks.push(task);
  });

  series.forEach((group) => {
    group.displayTasks.sort(compareQueueTasks);
    group.openTasks = group.allTasks.filter((task) => !task.complete);
    group.completedTasks = group.allTasks.filter((task) => task.complete);
    group.complete = group.openTasks.length === 0;
    group.sortDate = new Date((group.displayTasks[0] || group.allTasks[0]).due);
    items.push(group);
  });

  return items.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return a.sortDate - b.sortDate;
  });
}

function renderTaskCard(task, riskByTask) {
  const category = getCategory(task.categoryId);
  const risk = riskByTask.get(task.id);
  const card = document.createElement("article");
  card.className = `item-card ${task.complete ? "task-complete" : ""}`;
  card.innerHTML = `
    <div class="item-top">
      <div class="item-title">${escapeHtml(task.title)}</div>
      <span class="category-pill" style="background:${escapeAttribute(category.color)}">${escapeHtml(category.name)}</span>
    </div>
    <div class="item-meta">
      ${formatDuration(task.estimateMinutes)} needed - due ${formatDateTime(new Date(task.due))}
      ${risk ? ` - <span class="risk-pill">${escapeHtml(risk.reason)}</span>` : ""}
    </div>
    ${task.notes ? `<div class="item-notes">${escapeHtml(task.notes)}</div>` : ""}
    <div class="item-actions">
      <button class="small-button" type="button" data-task-toggle="${escapeAttribute(task.id)}">${task.complete ? "Reopen" : "Complete"}</button>
      <button class="small-button danger" type="button" data-task-delete="${escapeAttribute(task.id)}">Delete</button>
    </div>
  `;
  return card;
}

function renderTaskSeries(group, riskByTask) {
  const card = document.createElement("article");
  const category = getCategory(group.categoryId);
  const first = group.allTasks[0];
  const last = group.allTasks[group.allTasks.length - 1];
  const actionTask = state.filter === "complete"
    ? [...group.displayTasks].reverse().find((task) => task.complete) || group.completedTasks[group.completedTasks.length - 1]
    : group.openTasks[0] || group.completedTasks[group.completedTasks.length - 1];
  const actionLabel = actionTask.complete ? "Reopen latest" : "Complete next";
  const nextTask = group.openTasks.find((task) => new Date(task.due) >= new Date()) || group.openTasks[0] || group.displayTasks[0];
  const riskCount = group.displayTasks.filter((task) => riskByTask.has(task.id)).length;
  const detailLabel = state.filter === "open"
    ? "View open dates"
    : state.filter === "complete"
      ? "View completed dates"
      : "View series dates";
  const dateRows = group.displayTasks.map((task) => {
    const risk = riskByTask.get(task.id);
    return `
      <div class="series-date-row task-series-row ${task.complete ? "task-complete" : ""}">
        <span class="series-row-copy">
          <strong>${escapeHtml(formatDateTime(new Date(task.due)))}</strong>
          <span>${formatDuration(task.estimateMinutes)} needed${risk ? ` - ${escapeHtml(risk.reason)}` : ""}</span>
        </span>
        <span class="series-row-actions">
          <button class="small-button" type="button" data-task-toggle="${escapeAttribute(task.id)}">${task.complete ? "Reopen" : "Complete"}</button>
          <button class="small-button danger" type="button" data-task-delete="${escapeAttribute(task.id)}">Delete</button>
        </span>
      </div>
    `;
  }).join("");

  card.className = `item-card series-card ${group.complete ? "task-complete" : ""}`;
  card.innerHTML = `
    <div class="item-top">
      <div>
        <div class="item-title">${escapeHtml(group.title)}</div>
        <div class="item-meta">
          ${escapeHtml(formatRecurrence(group.recurrence))} series - ${group.allTasks.length} task${group.allTasks.length === 1 ? "" : "s"} - ${group.openTasks.length} open, ${group.completedTasks.length} complete - ${escapeHtml(formatShortDate(new Date(first.due)))} to ${escapeHtml(formatShortDate(new Date(last.due)))}
          ${riskCount ? ` - <span class="risk-pill">${riskCount} at risk</span>` : ""}
        </div>
      </div>
      <span class="category-pill" style="background:${escapeAttribute(category.color)}">${escapeHtml(category.name)}</span>
    </div>
    <div class="series-next">Next due: ${escapeHtml(formatDateTime(new Date(nextTask.due)))} - ${formatDuration(nextTask.estimateMinutes)} needed</div>
    ${nextTask.notes ? `<div class="item-notes">${escapeHtml(nextTask.notes)}</div>` : ""}
    <div class="item-actions">
      <button class="small-button" type="button" data-task-toggle="${escapeAttribute(actionTask.id)}">${actionLabel}</button>
      <button class="small-button danger" type="button" data-task-series-delete="${escapeAttribute(group.seriesId)}">Delete series</button>
    </div>
    <details class="series-details">
      <summary>${detailLabel}</summary>
      <div class="series-date-list">${dateRows}</div>
    </details>
  `;
  return card;
}

function renderMetrics() {
  const openTasks = state.tasks.filter((task) => !task.complete);
  const totalOpenMinutes = openTasks.reduce((sum, task) => sum + task.estimateMinutes, 0);
  const sortedOpen = [...openTasks].sort((a, b) => new Date(a.due) - new Date(b.due));
  const next = sortedOpen[0];

  els.openCount.textContent = String(openTasks.length);
  els.openHours.textContent = `${formatDuration(totalOpenMinutes)} queued`;

  els.riskCount.textContent = String(latestPlan.risks.length + latestPlan.unscheduled.length);
  els.riskDetail.textContent = latestPlan.risks.length || latestPlan.unscheduled.length
    ? "Review the queue"
    : "Nothing at risk";

  if (next) {
    const due = new Date(next.due);
    els.nextDue.textContent = formatShortDate(due);
    els.nextDueDetail.textContent = `${next.title} at ${formatTime(due)}`;
  } else {
    els.nextDue.textContent = "None";
    els.nextDueDetail.textContent = "No open deadlines";
  }

  const capacity = calculateCapacityThisWeek();
  els.weekCapacity.textContent = formatDuration(capacity.availableMinutes);
  els.weekCapacityDetail.textContent = `${formatDuration(capacity.blockedMinutes)} unavailable`;
}

function handleQueueClick(event) {
  const toggleId = event.target.closest("[data-task-toggle]")?.dataset.taskToggle;
  const deleteId = event.target.closest("[data-task-delete]")?.dataset.taskDelete;
  const deleteSeriesId = event.target.closest("[data-task-series-delete]")?.dataset.taskSeriesDelete;

  if (toggleId) {
    state.tasks = state.tasks.map((task) => task.id === toggleId ? { ...task, complete: !task.complete } : task);
    persistAndRender();
  }

  if (deleteId) {
    state.tasks = state.tasks.filter((task) => task.id !== deleteId);
    persistAndRender();
  }

  if (deleteSeriesId) {
    state.tasks = state.tasks.filter((task) => task.seriesId !== deleteSeriesId);
    persistAndRender();
  }
}

function handleBlockClick(event) {
  const deleteId = event.target.closest("[data-block-delete]")?.dataset.blockDelete;
  const deleteSeriesId = event.target.closest("[data-block-series-delete]")?.dataset.blockSeriesDelete;
  if (deleteId) {
    state.unavailable = state.unavailable.filter((block) => block.id !== deleteId);
    persistAndRender();
  }
  if (deleteSeriesId) {
    state.unavailable = state.unavailable.filter((block) => getUnavailableGroupKey(block) !== deleteSeriesId);
    persistAndRender();
  }
}

function handleCategoryPickerClick(event) {
  const selectId = event.target.closest("[data-category-select]")?.dataset.categorySelect;
  if (!selectId) return;
  selectTaskCategory(selectId);
}

function handleCategoryPickerKeydown(event) {
  const navigationKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!navigationKeys.includes(event.key)) return;

  const buttons = [...els.taskCategoryPicker.querySelectorAll("[data-category-select]")];
  if (!buttons.length) return;

  const currentIndex = Math.max(0, buttons.findIndex((button) => button.getAttribute("aria-checked") === "true"));
  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % buttons.length;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = buttons.length - 1;

  event.preventDefault();
  const nextId = buttons[nextIndex].dataset.categorySelect;
  selectTaskCategory(nextId);
  [...els.taskCategoryPicker.querySelectorAll("[data-category-select]")]
    .find((button) => button.dataset.categorySelect === nextId)
    ?.focus();
}

function selectTaskCategory(categoryId) {
  const selectedCategory = getValidCategoryId(categoryId);
  els.taskCategory.value = selectedCategory;
  renderTaskCategoryPicker(selectedCategory);
}

function handleCategoryClick(event) {
  const deleteId = event.target.closest("[data-category-delete]")?.dataset.categoryDelete;
  if (!deleteId) return;
  state.categories = state.categories.filter((category) => category.id !== deleteId || category.locked);
  state.tasks = state.tasks.map((task) => task.categoryId === deleteId ? { ...task, categoryId: "other" } : task);
  if (els.taskCategory.value === deleteId) els.taskCategory.value = getValidCategoryId("other");
  persistAndRender();
}

function buildSchedule() {
  const pendingTasks = state.tasks
    .filter((task) => !task.complete)
    .sort((a, b) => {
      const dueDiff = new Date(a.due) - new Date(b.due);
      if (dueDiff !== 0) return dueDiff;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

  const intervals = generateWorkIntervals(120);
  const segments = buildBlockedSegments(120);
  const risks = [];
  const unscheduled = [];

  pendingTasks.forEach((task) => {
    let remaining = task.estimateMinutes;
    const taskSegments = [];
    const due = new Date(task.due);
    const schedulableFrom = getTaskSchedulableStart(task);

    while (remaining > 0) {
      const intervalIndex = findNextSchedulableInterval(intervals, schedulableFrom);
      if (intervalIndex === -1) break;
      const interval = intervals[intervalIndex];
      const start = maxDate(interval.start, schedulableFrom);
      const available = minutesBetween(start, interval.end);
      if (available <= 0) break;

      const minutes = Math.min(remaining, available, state.settings.chunkMinutes);
      const end = addMinutes(start, minutes);
      remaining -= minutes;
      consumeIntervalTime(intervals, intervalIndex, start, end);

      taskSegments.push({
        type: "task",
        taskId: task.id,
        title: task.title,
        categoryId: task.categoryId,
        start,
        end,
        minutes,
        due,
        endsAfterDue: end > due,
      });
    }

    if (remaining > 0) {
      unscheduled.push({ taskId: task.id, reason: "Needs more future work time" });
    }

    if (taskSegments.some((segment) => segment.end > due)) {
      risks.push({ taskId: task.id, reason: "Scheduled after due date" });
      taskSegments.forEach((segment) => {
        if (segment.end > due) segment.endsAfterDue = true;
      });
    }

    taskSegments.forEach((segment, index) => {
      segment.partNumber = index + 1;
      segment.partCount = taskSegments.length;
      segments.push(segment);
    });
  });

  return {
    segments: segments.sort((a, b) => a.start - b.start),
    risks,
    unscheduled,
  };
}

function getTaskSchedulableStart(task) {
  const due = new Date(task.due);
  if (!task.recurrence || task.recurrence === "none") return new Date(0);
  if (task.recurrence === "daily" || task.recurrence === "weekdays" || task.recurrence === "weekends") {
    return startOfDay(due);
  }
  if (task.recurrence === "weekly" || task.recurrence === "biweekly") {
    return startOfWeek(due);
  }
  return startOfMonth(due);
}

function findNextSchedulableInterval(intervals, schedulableFrom) {
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    const start = maxDate(interval.start, schedulableFrom);
    if (minutesBetween(start, interval.end) > 0) return index;
  }
  return -1;
}

function consumeIntervalTime(intervals, index, start, end) {
  const interval = intervals[index];
  const pieces = [];

  if (interval.start < start) {
    pieces.push({ start: interval.start, end: start });
  }
  if (end < interval.end) {
    pieces.push({ start: end, end: interval.end });
  }

  intervals.splice(index, 1, ...pieces);
}

function generateWorkIntervals(daysAhead) {
  const now = new Date();
  const startDay = startOfDay(now);
  const blocks = state.unavailable.map((block) => ({
    start: new Date(block.start),
    end: new Date(block.end),
  }));
  const intervals = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const day = addDays(startDay, offset);
    if (!state.settings.workDays.includes(day.getDay())) continue;

    let dayStart = withMinutesOfDay(day, timeToMinutes(state.settings.workStart));
    const dayEnd = withMinutesOfDay(day, timeToMinutes(state.settings.workEnd));
    if (dayEnd <= dayStart) continue;
    if (isSameDay(day, now)) dayStart = maxDate(dayStart, roundUpToQuarterHour(now));
    if (dayStart >= dayEnd) continue;

    const available = subtractBlocks([{ start: dayStart, end: dayEnd }], blocks);
    available.forEach((interval) => {
      if (minutesBetween(interval.start, interval.end) > 0) intervals.push(interval);
    });
  }

  return intervals.sort((a, b) => a.start - b.start);
}

function buildBlockedSegments(daysAhead) {
  const now = new Date();
  const rangeEnd = addDays(startOfDay(now), daysAhead + 1);
  return state.unavailable
    .map((block) => ({
      type: "blocked",
      title: block.title,
      start: new Date(block.start),
      end: new Date(block.end),
      minutes: minutesBetween(new Date(block.start), new Date(block.end)),
    }))
    .filter((block) => block.end >= now && block.start <= rangeEnd);
}

function subtractBlocks(intervals, blocks) {
  let result = intervals.map((interval) => ({ start: new Date(interval.start), end: new Date(interval.end) }));

  blocks.forEach((block) => {
    result = result.flatMap((interval) => {
      if (block.end <= interval.start || block.start >= interval.end) return [interval];
      const pieces = [];
      if (block.start > interval.start) {
        pieces.push({ start: interval.start, end: minDate(block.start, interval.end) });
      }
      if (block.end < interval.end) {
        pieces.push({ start: maxDate(block.end, interval.start), end: interval.end });
      }
      return pieces;
    });
  });

  return result;
}

function calculateCapacityThisWeek() {
  const today = new Date();
  const start = startOfDay(today);
  const end = addDays(start, 7);
  const workIntervals = generateWorkIntervals(6).filter((interval) => interval.start < end);
  const availableMinutes = workIntervals.reduce((sum, interval) => sum + minutesBetween(interval.start, interval.end), 0);
  const blockedMinutes = state.unavailable
    .map((block) => ({ start: new Date(block.start), end: new Date(block.end) }))
    .reduce((sum, block) => {
      const overlapStart = maxDate(block.start, start);
      const overlapEnd = minDate(block.end, end);
      return sum + Math.max(0, minutesBetween(overlapStart, overlapEnd));
    }, 0);
  return { availableMinutes, blockedMinutes };
}

function exportScheduleCsv() {
  const rows = [["Date", "Start", "End", "Type", "Title", "Category", "Minutes", "Due", "Risk"]];
  latestPlan.segments
    .sort((a, b) => a.start - b.start)
    .forEach((segment) => {
      const category = segment.type === "task" ? getCategory(segment.categoryId).name : "";
      rows.push([
        formatCsvDate(segment.start),
        formatTime(segment.start),
        formatTime(segment.end),
        segment.type === "task" ? "Task" : "Unavailable",
        segment.title,
        category,
        String(segment.minutes),
        segment.due ? formatDateTime(segment.due) : "",
        segment.endsAfterDue ? "After due date" : "",
      ]);
    });

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `corvus-schedule-${formatFileDate(new Date())}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function scrollToToday() {
  const key = formatDayKey(new Date());
  const target = els.scheduleList.querySelector(`[data-day="${key}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function getCategory(categoryId) {
  return state.categories.find((category) => category.id === categoryId) || state.categories.find((category) => category.id === "other") || defaultCategories.at(-1);
}

function getTaskSeriesTitle(task) {
  const dueSuffix = ` (${formatShortDate(new Date(task.due))})`;
  return task.title.endsWith(dueSuffix)
    ? task.title.slice(0, -dueSuffix.length)
    : task.title;
}

function getValidCategoryId(categoryId) {
  if (state.categories.some((category) => category.id === categoryId)) return categoryId;
  return state.categories.find((category) => category.id === "other")?.id || state.categories[0]?.id || "";
}

function normalizeColor(value, fallback = "#65726d") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeSupabaseProjectUrl(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

function appendEmpty(parent, title, body) {
  const template = document.querySelector("#emptyStateTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = title;
  node.querySelector("span").textContent = body;
  parent.append(node);
}

function setTemporaryMessage(parent, message) {
  parent.innerHTML = "";
  appendEmpty(parent, message, "Please adjust the values and try again.");
  window.setTimeout(renderUnavailable, 2000);
}

function groupByDay(segments) {
  const map = new Map();
  segments.forEach((segment) => {
    const key = formatDayKey(segment.start);
    if (!map.has(key)) map.set(key, { key, date: startOfDay(segment.start), items: [] });
    map.get(key).items.push(segment);
  });
  return [...map.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => a.start - b.start),
  }));
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseInputDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInputDateOnlyEnd(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function toInputDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toInputDateOnly(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function withMinutesOfDay(day, minutes) {
  const date = new Date(day);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function startOfMonth(date) {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  const targetDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDay, lastDay));
  return next;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function getWeekOfMonth(date) {
  const dayOfMonth = date.getDate();
  const week = Math.ceil(dayOfMonth / 7);
  return week >= 5 ? -1 : week;
}

function getNthWeekdayOfMonth(year, month, nthWeek, nthDay, timeSource) {
  const occurrence = new Date(timeSource);
  occurrence.setFullYear(year, month, 1);

  if (nthWeek === -1) {
    occurrence.setMonth(month + 1, 0);
    const offset = (occurrence.getDay() - nthDay + 7) % 7;
    occurrence.setDate(occurrence.getDate() - offset);
    return occurrence;
  }

  const firstDayOffset = (nthDay - occurrence.getDay() + 7) % 7;
  occurrence.setDate(1 + firstDayOffset + ((nthWeek - 1) * 7));
  if (occurrence.getMonth() !== month) return null;
  return occurrence;
}

function minutesBetween(start, end) {
  return Math.round((end - start) / 60000);
}

function roundUpToQuarterHour(date) {
  const next = new Date(date);
  const minutes = next.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;
  if (rounded === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(rounded, 0, 0);
  }
  return next;
}

function maxDate(a, b) {
  return a > b ? a : b;
}

function minDate(a, b) {
  return a < b ? a : b;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDuration(minutes) {
  if (!minutes) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatRecurrence(recurrence, options = {}) {
  if (recurrence === "daily") return "Daily";
  if (recurrence === "weekdays") return "Weekdays";
  if (recurrence === "weekends") return "Weekends";
  if (recurrence === "weekly") return "Weekly";
  if (recurrence === "biweekly") return "Every 2 weeks";
  if (recurrence === "monthly") return "Monthly";
  if (recurrence === "monthlyNth") return `${formatNthWeek(options.nthWeek)} ${formatWeekday(options.nthDay)} monthly`;
  if (recurrence === "bimonthlyNth") return `${formatNthWeek(options.nthWeek)} ${formatWeekday(options.nthDay)} every other month`;
  return "No repeat";
}

function formatNthWeek(value) {
  const week = Number(value);
  if (week === 1) return "1st";
  if (week === 2) return "2nd";
  if (week === 3) return "3rd";
  if (week === 4) return "4th";
  if (week === -1) return "Last";
  return "Selected";
}

function formatWeekday(value) {
  const day = dayNames.find((item) => item.index === Number(value));
  return day ? day.label : "weekday";
}

function formatTime(date) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeRange(start, end) {
  if (isSameDay(start, end)) {
    return `${formatShortDate(start)} · ${formatTime(start)} to ${formatTime(end)}`;
  }
  return `${formatDateTime(start)} to ${formatDateTime(end)}`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat([], { month: "short", day: "numeric" }).format(date);
}

function formatDayHeading(date) {
  return new Intl.DateTimeFormat([], { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function formatCsvDate(date) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDayKey(date) {
  return formatCsvDate(date);
}

function formatFileDate(date) {
  return formatCsvDate(date).replaceAll("-", "");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
