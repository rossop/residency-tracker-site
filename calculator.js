import {
  LIMIT, parseDate, formatDate, parseTripList, mergeTrips, summarise, summariseReturns, toCsv,
} from "./schengen.js";

const $ = (id) => document.getElementById(id);
let trips = []; // [[entryDay, exitDay]] exactly as entered; overlaps are merged only when counting

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const pretty = (day) => dateFmt.format(new Date(day * 86400000));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function say(id, msg) {
  $(id).textContent = msg;
}

function render() {
  const rows = $("trip-rows");
  rows.replaceChildren();
  [...trips].sort((a, b) => a[0] - b[0]).forEach((trip) => {
    const tr = rows.insertRow();
    tr.insertCell().textContent = formatDate(trip[0]);
    tr.insertCell().textContent = formatDate(trip[1]);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary";
    btn.textContent = "Remove";
    btn.setAttribute("aria-label", `Remove trip ${formatDate(trip[0])} to ${formatDate(trip[1])}`);
    btn.addEventListener("click", () => {
      trips.splice(trips.indexOf(trip), 1);
      render();
    });
    tr.insertCell().append(btn);
  });
  $("trip-table").hidden = trips.length === 0;
  $("no-trips").hidden = trips.length > 0;
  $("export").hidden = trips.length === 0;
  renderResults();
}

function renderResults() {
  const check = parseDate($("check-date").value);
  const out = $("results");
  if (check === null) {
    out.textContent = "Choose a valid check date.";
    return;
  }
  const s = summarise(trips, check);
  const safe = s.lastSafe === null
    ? "None: staying on this date would take you over 90 days"
    : pretty(s.lastSafe);
  const lines = [
    `<ul class="stats">`,
    `<li><strong>${s.used}</strong>days used of ${LIMIT}</li>`,
    `<li><strong>${s.left}</strong>days left</li>`,
    `<li><strong>${s.lastSafe === null ? "None" : pretty(s.lastSafe)}</strong>last safe day if you stay from ${pretty(check)}</li>`,
    `</ul>`,
  ];
  if (s.over > 0) lines.push(`<p class="error">Over the limit by ${plural(s.over, "day")} in the window ending ${pretty(check)}.</p>`);
  lines.push(`<p class="muted">Window: the 180 days from ${pretty(check - 179)} to ${pretty(check)}, entry and exit days included.</p>`);
  lines.push(`<h3>When days come back</h3>`);
  if (s.returns.length === 0) {
    lines.push(`<p>Nothing to come back: no days from your trips are inside the window.</p>`);
  } else {
    lines.push(`<ul>`);
    for (const r of summariseReturns(s.returns)) {
      const count = r.endDay - r.day + 1;
      lines.push(count === 1
        ? `<li>+${plural(r.gained, "day")} on ${pretty(r.day)} (${r.remaining} left)</li>`
        : `<li>+${plural(r.gained, "day")} on each date from ${pretty(r.day)} to ${pretty(r.endDay)} (${r.remaining} left by ${pretty(r.endDay)})</li>`);
    }
    lines.push(`</ul>`);
  }
  lines.push(`<p class="muted">Assumes no further days in the Schengen area after ${pretty(check)}. Last safe day: ${safe}.</p>`);
  out.innerHTML = lines.join("");
}

$("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const entry = parseDate($("entry").value);
  const exit = parseDate($("exit").value);
  if (entry === null || exit === null) return say("add-status", "Enter both an entry and an exit date.");
  if (exit < entry) return say("add-status", "The exit date is before the entry date.");
  trips.push([entry, exit]);
  $("entry").value = "";
  $("exit").value = "";
  say("add-status", "Trip added.");
  render();
  $("entry").focus();
});

$("paste-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const { trips: added, errors } = parseTripList($("paste").value);
  trips.push(...added);
  if (errors.length === 0) $("paste").value = "";
  say("paste-status", [
    added.length ? `Added ${plural(added.length, "trip")}.` : "",
    ...errors.map((x) => `Line ${x.line}: ${x.message}.`),
  ].join(" "));
  render();
});

$("check-date").addEventListener("input", renderResults);

$("clear").addEventListener("click", () => {
  trips = [];
  say("add-status", "All trips cleared.");
  render();
});

$("download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([toCsv(trips)], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "schengen-trips.csv" });
  a.click();
  URL.revokeObjectURL(url);
});

$("check-date").value = todayLocal();
render();
