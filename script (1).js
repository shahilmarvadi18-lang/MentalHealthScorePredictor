"use strict";

// Backend base URL (FastAPI served by uvicorn). Endpoint: POST {API_BASE_URL}/predict
const API_BASE_URL = "http://127.0.0.1:8000";
const PREDICT_URL = `${API_BASE_URL}/predict`;

// Field rules mirror the Pydantic model in main.py
const NUMBER_FIELDS = {
  age: { label: "Age", min: 10, max: 100, integer: true },
  avg_daily_usage_hours: { label: "Average daily usage", min: 0, max: 24 },
  daily_unlocks: { label: "Daily unlocks", min: 0, max: 500, integer: true },
  study_hours: { label: "Study hours", min: 0, max: 24 },
  physical_activity_hours: { label: "Physical activity", min: 0, max: 24 },
  sleep_hours_per_night: { label: "Sleep hours", min: 0, max: 24 },
};
const SELECT_FIELDS = {
  gender: "gender",
  country: "country",
  academic_level: "academic level",
  most_used_platform: "platform",
  purpose_of_use: "purpose",
  stress_level: "stress level",
};

const $ = (id) => document.getElementById(id);
const form = $("predictForm");

/* ---------- Validation ---------- */
function setFieldError(name, message) {
  const el = $(name);
  $("err-" + name).textContent = message;
  el.closest(".field").classList.toggle("invalid", Boolean(message));
  el.setAttribute("aria-invalid", message ? "true" : "false");
}

function validateForm() {
  let firstInvalid = null;
  const data = {};
  const fail = (name, msg) => {
    setFieldError(name, msg);
    firstInvalid = firstInvalid || $(name);
  };

  for (const [name, rule] of Object.entries(NUMBER_FIELDS)) {
    const raw = $(name).value.trim();
    const value = Number(raw);
    setFieldError(name, "");
    if (raw === "" || Number.isNaN(value))
      fail(name, `${rule.label} is required.`);
    else if (value < rule.min || value > rule.max)
      fail(name, `Enter a value between ${rule.min} and ${rule.max}.`);
    else if (rule.integer && !Number.isInteger(value))
      fail(name, "Enter a whole number.");
    else data[name] = value;
  }
  for (const [name, label] of Object.entries(SELECT_FIELDS)) {
    const value = $(name).value;
    setFieldError(name, "");
    if (!value) fail(name, `Please select a ${label}.`);
    else data[name] = value;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return null;
  }
  return data;
}

/* ---------- Loading state ---------- */
function setLoading(isLoading) {
  const btn = $("submitBtn");
  btn.disabled = isLoading;
  btn.classList.toggle("loading", isLoading);
  btn.querySelector(".btn-label").textContent = isLoading
    ? "Analysing…"
    : "Predict Mental Health Score";
}

/* ---------- API request ---------- */
async function requestPrediction(payload) {
  const response = await fetch(PREDICT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = Array.isArray(body.detail)
        ? body.detail
            .map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`)
            .join("; ")
        : String(body.detail || "");
    } catch (_) {
      /* non-JSON error body */
    }
    const err = new Error(
      detail || `Server responded with status ${response.status}.`,
    );
    err.isServerError = true;
    throw err;
  }
  const result = await response.json();
  const score = result.predicted_mental_health_score;
  if (typeof score !== "number")
    throw Object.assign(new Error("Unexpected response from the server."), {
      isServerError: true,
    });
  return score;
}

/* ---------- Display ---------- */
function interpret(score) {
  if (score >= 7.5)
    return [
      "Higher predicted well-being",
      "Your lifestyle pattern is associated with a higher mental well-being score in the data the model learned from.",
    ];
  if (score >= 6)
    return [
      "Moderate predicted well-being",
      "Your habits show a mixed pattern. Small changes in sleep, screen time, or stress may be associated with a higher score.",
    ];
  return [
    "Lower predicted well-being",
    "Some of your lifestyle factors may be associated with lower well-being in the training data. Consider talking to someone you trust or a professional if you feel unwell.",
  ];
}

function displayPrediction(score) {
  const clamped = Math.max(0, Math.min(10, score));
  const [verdict, text] = interpret(score);
  const circumference = 326.7;
  $("verdict").textContent = verdict;
  $("interpretation").textContent = text;
  $("gauge").setAttribute(
    "aria-label",
    `Predicted score ${score.toFixed(1)} out of 10`,
  );
  $("gaugeFill").style.stroke =
    score >= 7.5
      ? "var(--accent)"
      : score >= 6
        ? "var(--warn)"
        : "var(--danger)";
  $("result").hidden = false;
  requestAnimationFrame(() => {
    $("gaugeFill").style.strokeDashoffset = circumference * (1 - clamped / 10);
    animateNumber($("scoreValue"), score);
  });
  $("result").scrollIntoView({ behavior: "smooth", block: "center" });
}

function animateNumber(el, target) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target.toFixed(1);
    return;
  }
  const start = performance.now(),
    duration = 1100;
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Errors ---------- */
function showApiError(message) {
  const b = $("apiError");
  b.textContent = message;
  b.hidden = false;
}
function clearApiError() {
  $("apiError").hidden = true;
}
function handleError(err) {
  if (err.isServerError)
    showApiError(`The server could not process the request. ${err.message}`);
  else
    showApiError(
      "Unable to connect to the prediction server. Please make sure the backend is running.",
    );
}

/* ---------- Reset ---------- */
function resetForm() {
  form.reset();
  Object.keys({ ...NUMBER_FIELDS, ...SELECT_FIELDS }).forEach((n) =>
    setFieldError(n, ""),
  );
  clearApiError();
  $("result").hidden = true;
  $("gaugeFill").style.strokeDashoffset = 326.7;
  $("predict").scrollIntoView({ behavior: "smooth" });
}

/* ---------- Wiring ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearApiError();
  const payload = validateForm();
  if (!payload) return;
  setLoading(true);
  try {
    displayPrediction(await requestPrediction(payload));
  } catch (err) {
    handleError(err);
  } finally {
    setLoading(false);
  }
});
$("resetBtn").addEventListener("click", resetForm);
form.addEventListener("input", (e) => {
  if (e.target.id && $("err-" + e.target.id)) setFieldError(e.target.id, "");
});

const navToggle = $("navToggle"),
  navLinks = $("navLinks");
navToggle.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
});
navLinks.addEventListener("click", () => {
  navLinks.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
});
