"use strict";

const { doubles, levels, modes, isMode, isLevel, isCheckout } = Training;
const storageKey = "tdf-doubles-lab-v2";
const legacyStorageKey = "tdf-doubles-lab-v1";
const home = document.querySelector("#home");
const play = document.querySelector("#play");
const historyPage = document.querySelector("#history");
const announcements = document.querySelector("#announcements");
const dataNotice = document.querySelector("#data-notice");
const dateFormat = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const gameKeys = ["bingo", "rescue", "sprint"];
const percentFormat = new Intl.NumberFormat("nl-BE", { style: "percent", maximumFractionDigits: 1 });
const decimalFormat = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });
let storageAvailable = true;
let data = Training.readProgress(null);
let historyFilter = "all";
let levelFilter = "all";
let multiplier = "S";

function readData() {
  try {
    const saved = Training.readProgress(localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey));
    storageAvailable = true;
    return saved;
  } catch {
    storageAvailable = false;
    return null;
  }
}

data = readData() ?? data;

function notice(message) {
  dataNotice.hidden = !message;
  dataNotice.textContent = message;
}

function save(session) {
  // Reconcile the latest browser data before replacing a session, including edits from another tab.
  const latest = storageAvailable ? readData() : null;
  if (latest && JSON.stringify(latest.sessions[session.mode]) !== JSON.stringify(data.sessions[session.mode])) {
    data = latest;
    route({ focus: false });
    notice("Deze training is aangepast in een ander tabblad. Je ziet nu de bijgewerkte stand. Voer je laatste actie opnieuw in.");
    return false;
  }
  data = Training.saveSession(latest ?? data, session, new Date().toISOString());
  if (!latest) {
    notice("Opslag is niet beschikbaar. Je wijzigingen blijven beschikbaar zolang dit tabblad open is.");
    return true;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    notice("");
  } catch {
    storageAvailable = false;
    notice("Opslaan is mislukt. Je wijzigingen blijven beschikbaar zolang dit tabblad open is.");
  }
  return true;
}

function lastTest() {
  return data.records.find((record) => record.mode === "test");
}

function sessionInProgress(mode) {
  const session = data.sessions[mode];
  return session && !Training.inspect(session).done;
}

function routeMode() {
  const hash = location.hash.slice(1);
  return hash.startsWith("speel/") ? hash.slice(6) : "";
}

function trainingLink(mode) {
  return `#speel/${mode}`;
}

function scoreText(record) {
  switch (record.mode) {
    case "test": return `${record.hits}/36 geraakt`;
    case "bingo": return `${record.hits}/${record.targetCount} doubles`;
    case "rescue": return `${record.hits}/6 finishes`;
    case "sprint": return `${record.score} punten · ${record.hits}/10 checkouts`;
  }
}

function stat(label, value) {
  return `<div class="stat"><small>${label}</small><strong>${value}</strong></div>`;
}

function renderHome() {
  document.querySelector("#training-cards").innerHTML = gameKeys.map((mode) => {
    const game = modes[mode];
    return `<article class="training-card">
      <span class="card-icon ${mode}" aria-hidden="true"><i></i></span>
      <h3>${game.title}</h3><p>${game.description}</p><p class="meta">${game.meta}</p>
      <a class="button" href="${trainingLink(mode)}">${sessionInProgress(mode) ? "Speel verder" : "Kies niveau"}<span class="visually-hidden"> voor ${game.title}</span></a>
    </article>`;
  }).join("");
  const test = lastTest();
  const trainings = data.records.filter((record) => record.mode !== "test");
  const testButton = document.querySelector(".hero [data-start]");
  testButton.innerHTML = `${sessionInProgress("test") ? "Ga verder met je test" : "Doe de instaptest"} <span>36 darts</span>`;
  document.querySelector("#overview").innerHTML =
    stat("Voorgesteld niveau", test ? levels[test.recommendation].label : "Nog geen test") +
    stat("Laatste instaptest", test ? `${test.hits} / 36 geraakt` : "—") +
    stat("Afgeronde trainingen", trainings.length);
}

function breakdown(record) {
  return `<ul class="result-breakdown" aria-label="Resultaat per double">${doubles.map((target) =>
    `<li><strong>D${target}</strong><span>${record.breakdown[target]}/6</span></li>`
  ).join("")}</ul>`;
}

function signed(number) {
  return number > 0 ? `+${number}` : String(number).replace("-", "−");
}

function rate(hits, count) {
  return count ? percentFormat.format(hits / count) : "—";
}

function scoreDetails(records, mode, label) {
  if (!records.length) return "";
  const { hits, attempts, targets, measuredCheckouts, checkoutDarts } = Training.summarize(records);
  const checkout = isCheckout(mode);
  const hasTargets = Object.keys(targets).length > 0;
  return `<div class="score-details">
    <p><strong>${hits}/${attempts} · ${rate(hits, attempts)}</strong> ${checkout ? "checkouts gelukt" : "darts raak"}</p>
    ${measuredCheckouts ? `<p>Gemiddeld <strong>${decimalFormat.format(checkoutDarts / measuredCheckouts)} darts</strong> per geslaagde checkout (${measuredCheckouts} van ${hits} met gekend aantal).</p>` : ""}
    ${hasTargets ? `<div class="stats-table"><table aria-label="${label}"><thead><tr><th scope="col">${checkout ? "Startscore" : "Double"}</th><th scope="col">Raak / pogingen</th><th scope="col">Percentage</th></tr></thead>
      <tbody>${Object.entries(targets).map(([target, count]) => `<tr><th scope="row">${checkout ? "" : "D"}${target}</th><td>${count.hits}/${count.attempts}</td><td>${rate(count.hits, count.attempts)}</td></tr>`).join("")}</tbody>
    </table></div>` : ""}
    ${!hasTargets || Object.values(targets).reduce((sum, row) => sum + row.attempts, 0) < attempts
      ? '<p class="hint">Oudere sessies zonder details tellen mee in het totaal.</p>' : ""}
  </div>`;
}

function renderHistory() {
  const test = lastTest();
  const previous = data.records.filter((record) => record.mode === "test")[1];
  const records = data.records.filter((record) =>
    (historyFilter === "all" || record.mode === historyFilter) &&
    (levelFilter === "all" || record.level === levelFilter)
  );
  const filteredModes = Object.keys(modes).filter((mode) => records.some((record) => record.mode === mode));
  historyPage.querySelector(".section-heading p").textContent = storageAvailable
    ? "Je resultaten blijven in deze browser bewaard."
    : "Deze browser blokkeert opslag. Resultaten verdwijnen als je de pagina sluit of vernieuwt.";
  historyPage.querySelector("#history-content").innerHTML = `
    ${test ? `<section class="panel"><h2>Laatste instaptest</h2>
      <p><strong>${test.hits}/36 geraakt</strong> · Voorgesteld niveau ${levels[test.recommendation].label}</p>
      ${breakdown(test)}
      ${previous ? `<p>Verschil met je vorige test <strong>${signed(test.hits - previous.hits)}</strong> op 36 darts.</p>
        <p class="hint">Per double: ${doubles.map((target) => `D${target} ${signed(test.breakdown[target] - previous.breakdown[target])}`).join(" · ")}</p>` : ""}
      <button class="button" data-start="test">Doe de instaptest opnieuw</button>
    </section>` : ""}
    <section class="panel"><h2>Sessiegeschiedenis</h2>
      ${data.records.length ? `<div class="history-filters">
        <label>Training <select id="history-filter">
          <option value="all">Alle trainingen</option>
          ${Object.entries(modes).map(([mode, game]) => `<option value="${mode}" ${mode === historyFilter ? "selected" : ""}>${game.title}</option>`).join("")}
        </select></label>
        <label>Niveau <select id="level-filter" ${historyFilter === "test" ? "disabled" : ""}>
          <option value="all">Alle niveaus</option>
          ${Object.entries(levels).map(([key, level]) => `<option value="${key}" ${key === levelFilter ? "selected" : ""}>${level.label}</option>`).join("")}
        </select></label>
      </div>
      ${filteredModes.length ? `<div class="history-statistics">${filteredModes.map((mode) => `<details ${historyFilter === mode ? "open" : ""}><summary>Statistieken · ${modes[mode].title}</summary>${scoreDetails(records.filter((record) => record.mode === mode), mode, modes[mode].title)}</details>`).join("")}</div>` : ""}
      ${records.length ? `<ul class="history-list">${records.map((record) => `<li>
        <div><strong>${modes[record.mode].title}</strong>
        <span>${record.level ? `${levels[record.level].label} · ` : ""}${dateFormat.format(new Date(record.date))}</span></div>
        <span class="item-score">${scoreText(record)}</span>
      </li>`).join("")}</ul>` : "<p>Geen sessies met deze filters.</p>"}` : `<p>Na een afgeronde sessie verschijnt je resultaat hier.</p><a class="button" href="#trainingen">Kies je eerste training</a>`}
    </section>`;
}

function intro(mode, subtitle) {
  return `<a class="back-link" href="#trainingen">Naar trainingen</a>
    <h1 id="play-title" tabindex="-1">${modes[mode].title}</h1>${subtitle ? `<p class="hint">${subtitle}</p>` : ""}`;
}

function renderSetup(mode) {
  const suggested = lastTest()?.recommendation ?? "start";
  const resume = sessionInProgress(mode);
  if (mode === "test") {
    play.innerHTML = intro(mode) + `<section class="panel"><h2>36 darts op zes doubles</h2>
      <p>${modes.test.goal}</p><p>${doubles.map((target) => `D${target}`).join(" · ")}</p>
      <button class="button primary" data-begin="test">${resume ? "Ga verder" : "Start test"}</button>
      ${resume ? `<button class="quiet" data-restart="test">Herbegin test</button>` : ""}
    </section>`;
    return;
  }
  play.innerHTML = intro(mode) + `<section class="panel"><p>${modes[mode].goal}</p>
    ${resume ? `<p><button class="button dark" data-resume="true">Speel je sessie verder</button></p>` : ""}
    <form id="setup-form" data-mode="${mode}">
      <h2 id="level-title">Kies je niveau</h2>
      <div class="level-picker" role="radiogroup" aria-labelledby="level-title">
        ${Object.entries(levels).map(([id, level]) => `<label>
          <input type="radio" name="level" value="${id}" ${id === suggested ? "checked" : ""}>
          <span><strong>${level.label}</strong><small>${mode === "bingo" ? `${level.bingo.length} doubles` : level[mode].join(", ")}</small></span>
        </label>`).join("")}
      </div>
      <button class="button primary" type="submit">${resume ? "Start nieuwe training" : "Start training"}</button>
    </form>
  </section>`;
}

function meter(left, right, value, max) {
  return `<div class="play-meter"><span>${left}</span><span>${right}</span></div>
    <progress value="${value}" max="${max}" aria-label="Voortgang van deze sessie"></progress>`;
}

function markButtons(hit, miss) {
  return `<div class="score-buttons">
    <button class="button primary" data-mark="hit" aria-keyshortcuts="R">${hit}</button>
    <button class="button" data-mark="miss" aria-keyshortcuts="M">${miss}</button>
  </div>`;
}

function currentDarts(darts, limit) {
  return `<ol class="dart-slots" aria-label="Darts van deze beurt">${Array.from({ length: limit }, (_, index) =>
    `<li><small>Dart ${index + 1}</small><strong>${darts[index] ?? "—"}</strong></li>`
  ).join("")}</ol>`;
}

function lastEntry(session) {
  const last = session.attempts.at(-1);
  if (!last) return "";
  if (isCheckout(session.mode)) {
    const outcome = last.hit ? `uitgegooid${last.dartsUsed ? ` in ${last.dartsUsed} dart${last.dartsUsed === 1 ? "" : "s"}` : ""}`
      : last.outcome === "bust" ? "bust" : "niet uitgegooid";
    return `Laatste poging ${last.target} · ${outcome}${last.darts ? ` · ${last.darts.join(" · ")}` : ""}`;
  }
  if (last.shots) return `Laatste invoer D${last.target} · ${last.hits}/${last.shots} raak`;
  return `Laatste dart D${last.target} · ${last.hit ? "raak" : "mis"}`;
}

function checkoutButtons(session, info) {
  const detailed = session.detailed;
  const routeHint = session.mode === "rescue" ? info.scenario[2] : info.finish;
  const routeHelp = info.pending.length ? "" : `<details class="route-hint"><summary>Toon een route</summary><p>${routeHint}</p></details>`;
  const toggle = `<button class="quiet" data-entry-toggle ${info.pending.length ? "disabled" : ""}>${detailed ? "Snelle invoer" : "Per dart invoeren"}</button>`;
  if (!detailed) {
    return routeHelp + `<div class="score-buttons checkout-buttons" aria-label="Aantal darts voor de checkout">
      ${Array.from({ length: info.limit }, (_, index) => {
        const number = index + 1;
        const disabled = number === 1 && !Training.oneDartFinish(info.target);
        return `<button class="button primary" data-checkout="${number}" aria-keyshortcuts="${number}" ${disabled ? "disabled" : ""}>In ${number} dart${number === 1 ? "" : "s"}</button>`;
      }).join("")}
      <button class="button" data-mark="miss" aria-keyshortcuts="M">Niet uit</button>
    </div><div class="entry-toggle">${toggle}</div>`;
  }
  return currentDarts(info.pending, info.limit) + routeHelp +
    `<div class="score-picker" aria-label="Raak segment">
      <div class="multiplier-row" role="group" aria-label="Vermenigvuldiger">
        ${[["S", "Single"], ["D", "Double"], ["T", "Triple"]].map(([prefix, label]) =>
          `<button class="button" data-multiplier="${prefix}" aria-pressed="${multiplier === prefix}">${label}</button>`).join("")}
      </div>
      <div class="number-grid">
        ${Training.boardNumbers.map((number) => `<button class="button" data-dart="${multiplier}${number}" aria-label="${multiplier}${number}">${number}</button>`).join("")}
      </div>
      <div class="multiplier-row">
        <button class="button" data-dart="0">Mis · 0</button><button class="button" data-dart="25">25</button><button class="button" data-dart="Bull">Bull · 50</button>
      </div>
    </div><div class="entry-toggle">${toggle}${info.pending.length ? '<span class="hint">Rond je poging af om te wisselen.</span>' : ""}</div>`;
}

function renderSession(session) {
  const info = Training.inspect(session);
  const { mode, level } = session;
  const subtitle = level ? `Niveau ${levels[level].label}` : "36 darts op zes doubles";
  if (info.done) {
    renderResult(data.records.find((record) => record.id === session.id));
    return;
  }
  let controls;
  switch (mode) {
    case "test":
      controls = meter(`Dart ${info.count + 1} van 36`, `${info.hits} geraakt`, info.count, 36) +
        `<p class="target">D${info.target}</p>
        <p class="hint">Dart ${info.count % 3 + 1} van deze beurt · Beurt ${Math.floor((info.count % 6) / 3) + 1} van 2 op dit doel</p>` +
        markButtons("Raak · 1 dart", "Mis · 1 dart") +
        (info.count % 3 === 0 ? `<div class="visit-controls"><p>Hoeveel van je drie darts raakten D${info.target}?</p>
          <div class="score-buttons checkout-buttons" aria-label="Raak in drie darts">${[0, 1, 2, 3].map((hits) =>
          `<button class="button" data-visit="${hits}" aria-keyshortcuts="${hits}">${hits} raak</button>`).join("")}</div>
        </div>` : "");
      break;
    case "bingo":
      controls = meter(`Beurt ${Math.floor(info.count / 3) + 1} van 6`, `${info.hits}/${info.targets.length} geraakt`, info.count, 18) +
        `<p class="target">D${info.target}</p><p class="hint">Dart ${info.count % 3 + 1} van deze beurt · ${info.canChoose ? "Kies een open double." : "Blijf mikken op dit doel."}</p>
        <div class="target-grid" aria-label="Bingokaart">${info.targets.map((target) => info.remaining.includes(target)
          ? `<button class="target-chip" data-target="${target}" aria-pressed="${target === info.target}" ${info.canChoose ? "" : "disabled"}>D${target}</button>`
          : `<span class="target-chip done" aria-label="D${target} geraakt">D${target} ✓</span>`).join("")}</div>` +
        markButtons("Raak", "Mis") +
        (info.count % 3 < 2 ? `<div class="entry-toggle"><button class="quiet" data-visit="0">${info.count % 3 === 0 ? "3 darts gemist" : "Laatste 2 darts gemist"}</button></div>` : "");
      break;
    case "rescue":
      controls = meter(`Situatie ${info.count + 1} van 6`, `${info.hits} gered`, info.count, 6) +
        `<p class="target">${info.visit.remaining}</p>
        <p>Je stond op ${info.scenario[0]} en raakte S${info.scenario[1]}. Werk de rest af met twee darts.</p>` +
        checkoutButtons(session, info);
      break;
    case "sprint": {
      const needed = Math.max(0, 4 - info.hits);
      const remaining = info.max - info.count;
      const goal = needed === 0 ? "Je bent op koers voor 54 punten." : needed > remaining
        ? "Gooi de resterende checkouts uit voor je beste eindscore."
        : `Nog ${needed} ${needed === 1 ? "checkout" : "checkouts"} nodig voor 54 punten.`;
      controls = meter(`Poging ${info.count + 1} van 10`, `${info.score} punten`, info.count, 10) +
        `<p class="target">${info.visit.remaining}</p><p>Gooi uit met maximaal drie darts. ${goal}</p>` +
        checkoutButtons(session, info);
      break;
    }
  }
  play.innerHTML = intro(mode, subtitle) + `<section class="panel">${controls}
    <p class="last-entry">${lastEntry(session)}</p>
    <div class="session-tools"><button class="quiet" data-undo aria-keyshortcuts="U" ${!info.count && !info.pending?.length ? "disabled" : ""}>Laatste invoer herstellen</button>
    <a class="quiet" href="#trainingen">Pauzeer</a></div></section>`;
}

function renderResult(record) {
  let detail;
  switch (record.mode) {
    case "test": {
      const earlier = data.records.find((item) => item.mode === "test" && item.id !== record.id);
      detail = `<p>Voorgesteld niveau <strong>${levels[record.recommendation].label}</strong>. Je kunt per training zelf kiezen.</p>
        ${breakdown(record)}${earlier ? `<p>Verschil met je vorige test <strong>${signed(record.hits - earlier.hits)}</strong> op 36 darts.</p>` : ""}`;
      break;
    }
    case "bingo":
      detail = `<p>${record.remaining.length
        ? `Nog open: ${record.remaining.map((target) => `D${target}`).join(", ")}. Neem deze doubles mee in je volgende ronde.`
        : `Bingo! Je kaart is leeg na ${record.darts} darts.`}</p>`;
      break;
    case "rescue":
      detail = `<p>${record.hits} van de 6 finishes gered binnen twee darts.</p>`;
      break;
    case "sprint": {
      const times = data.records.filter((item) => item.mode === "sprint" && item.level === record.level && item.score >= 54).length;
      const levelUp = record.score >= 54 && times >= 2 && record.level !== "uitdaging";
      detail = `<p>${record.score >= 54 ? "Doel van 54 punten gehaald." : "Je doel was 54 punten."}
        ${levelUp ? "Je haalde het doel in minstens twee sessies op dit niveau. Probeer het volgende niveau." : ""}</p>`;
      break;
    }
  }
  play.innerHTML = intro(record.mode, "Sessie afgerond") + `<section class="panel">
    <h2>Je resultaat</h2><p class="result-number">${scoreText(record)}</p>${detail}
    ${record.mode !== "test" ? scoreDetails([record], record.mode, "Resultaat van deze sessie") : ""}
    ${storageAvailable ? "" : `<p class="hint">De browser blokkeert opslag. Dit resultaat blijft beschikbaar zolang je deze pagina openhoudt.</p>`}
    <div class="button-row">
      <a class="button primary" href="#trainingen">Naar trainingen</a>
      <a class="button" href="#voortgang">Bekijk mijn voortgang</a>
    </div>
    <div class="session-tools"><button class="quiet" data-replay="${record.mode}">Speel opnieuw</button>
    <button class="quiet" data-undo aria-keyshortcuts="U">Laatste invoer herstellen</button></div>
  </section>`;
}

function route({ setup = false, focus = true } = {}) {
  const hash = location.hash.slice(1);
  const mode = routeMode();
  const view = hash === "voortgang" ? "history" : isMode(mode) ? "play" : "home";
  home.hidden = view !== "home";
  play.hidden = view !== "play";
  historyPage.hidden = view !== "history";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === (view === "history" ? "voortgang" : "trainingen");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (view === "home") renderHome();
  if (view === "history") renderHistory();
  if (view === "play") {
    if (!setup && sessionInProgress(mode)) renderSession(data.sessions[mode]);
    else renderSetup(mode);
  }
  if (focus) {
    window.scrollTo(0, 0);
    const heading = document.querySelector("main > section:not([hidden]) h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }
}

function openMode(mode, setup = false) {
  const hash = trainingLink(mode);
  if (location.hash !== hash && !setup) {
    location.hash = hash;
    return;
  }
  if (location.hash !== hash) history.pushState(null, "", hash);
  route({ setup });
}

function begin(mode, level, restart = false) {
  const ongoing = sessionInProgress(mode);
  if (ongoing && !restart) {
    renderSession(data.sessions[mode]);
    document.querySelector("#play-title").focus({ preventScroll: true });
    return;
  }
  if (ongoing && !window.confirm("Je hebt nog een onvoltooide sessie voor deze training. Deze vervangen?")) return;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const session = Training.start(mode, level, id);
  if (!save(session)) return;
  multiplier = "S";
  if (location.hash !== trainingLink(mode)) history.pushState(null, "", trainingLink(mode));
  renderSession(session);
  document.querySelector("#play-title").focus({ preventScroll: true });
}

function updateSession(next, control, message) {
  if (next === data.sessions[next.mode] || !save(next)) return;
  if (!next.pending?.length && control.startsWith("[data-dart")) multiplier = "S";
  renderSession(next);
  const info = Training.inspect(next);
  announcements.textContent = info.done
    ? `Sessie afgerond. ${scoreText(data.records.find((record) => record.id === next.id))}.`
    : isCheckout(next.mode) ? `${message} ${info.visit.remaining} over.`
      : `${message} Volgend doel D${info.target}.`;
  const nextControl = play.querySelector(control);
  (nextControl?.disabled ? null : nextControl)?.focus({ preventScroll: true });
  if (!nextControl || nextControl.disabled) play.querySelector(info.done ? "#play-title" : "[data-mark], [data-multiplier]")?.focus({ preventScroll: true });
}

document.addEventListener("submit", (event) => {
  if (event.target.id !== "setup-form") return;
  event.preventDefault();
  const mode = event.target.dataset.mode;
  const level = new FormData(event.target).get("level");
  if (gameKeys.includes(mode) && isLevel(level)) begin(mode, level, true);
});

document.addEventListener("change", (event) => {
  const { id, value } = event.target;
  if (id === "history-filter") {
    historyFilter = value;
    if (value === "test") levelFilter = "all";
  } else if (id === "level-filter") {
    levelFilter = value;
  } else {
    return;
  }
  renderHistory();
  document.getElementById(id).focus({ preventScroll: true });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { start, begin: selectedMode, restart, resume, replay, mark, target, checkout, visit, dart } = button.dataset;
  if (start) {
    const repeatTest = button.closest("#history") !== null;
    openMode(start, repeatTest);
    return;
  }
  if (selectedMode) return begin(selectedMode, null);
  if (restart) return begin(restart, null, true);
  const session = data.sessions[routeMode()];
  if (resume && session) return begin(session.mode, session.level);
  if (replay) return openMode(replay, true);
  if (!session) return;
  if (mark) return updateSession(Training.mark(session, mark === "hit"), `[data-mark="${mark}"]`, mark === "hit" ? "Gelukt." : "Gemist.");
  if (checkout) return updateSession(Training.mark(session, true, Number(checkout)), `[data-checkout="${checkout}"]`, "Uitgegooid.");
  if (visit !== undefined) return updateSession(Training.markVisit(session, Number(visit)), `[data-visit="${visit}"]`, "Beurt geregistreerd.");
  if (dart !== undefined) {
    const next = Training.scoreDart(session, dart);
    const message = next.attempts.length > session.attempts.length ? lastEntry(next) + "." : `${dart} geregistreerd.`;
    return updateSession(next, `[data-dart="${dart}"]`, message);
  }
  if (button.dataset.multiplier) {
    multiplier = button.dataset.multiplier;
    renderSession(session);
    play.querySelector(`[data-multiplier="${multiplier}"]`).focus({ preventScroll: true });
    return;
  }
  if (button.hasAttribute("data-entry-toggle")) return updateSession(Training.toggleEntry(session), "[data-entry-toggle]", "Invoermethode gewijzigd.");
  if (target) return updateSession(Training.select(session, Number(target)), `[data-target="${target}"]`, "Doel gekozen.");
  if (button.hasAttribute("data-undo")) return updateSession(Training.undo(session), "[data-undo]", "Laatste invoer hersteld.");
});

document.addEventListener("keydown", (event) => {
  if (play.hidden || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target.closest("input, select, textarea, [contenteditable]")) return;
  const key = event.key.toLowerCase();
  const shortcuts = { r: '[data-mark="hit"]', m: '[data-mark="miss"]', u: "[data-undo]" };
  const selector = /^[0-3]$/.test(key) ? `[data-checkout="${key}"], [data-visit="${key}"][aria-keyshortcuts]` : shortcuts[key];
  const control = selector && play.querySelector(selector);
  if (!control || control.disabled) return;
  event.preventDefault();
  control.click();
});

window.addEventListener("hashchange", () => {
  if (location.hash !== "#main") route();
});
window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) {
    if (!storageAvailable) return;
    const latest = readData();
    if (latest) {
      data = latest;
      route({ focus: false });
    }
  }
});

function drawBoard() {
  const canvas = document.querySelector("#board");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const active = [20, 16, 8, 12, 10, 4];
  const step = Math.PI / 10;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  function circle(radius, fill, stroke, width = 1) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function arcBand(inner, outer, angle, fill) {
    ctx.beginPath();
    ctx.arc(0, 0, outer, angle - step / 2, angle + step / 2);
    ctx.arc(0, 0, inner, angle + step / 2, angle - step / 2, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "#27261b";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  circle(394, "#0e100c", "#534631", 3);
  circle(382, "#191a14", "#3b3628", 2);
  circle(363, null, "#4a4030");
  order.forEach((number, index) => {
    const angle = -Math.PI / 2 + index * step;
    const inner = index % 2 ? "#a38e66" : "#313228";
    const multiplier = index % 2 ? "#3d5745" : "#704138";
    arcBand(0, 194, angle, inner);
    arcBand(194, 210, angle, multiplier);
    arcBand(210, 306, angle, inner);
    arcBand(306, 327, angle, active.includes(number) ? "#d1a459" : multiplier);
    ctx.fillStyle = active.includes(number) ? "#ebc778" : "#b2a385";
    ctx.font = `${active.includes(number) ? "700" : "500"} 30px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(number, Math.cos(angle) * 349, Math.sin(angle) * 349);
  });
  circle(327, null, "#776549", 2);
  circle(306, null, "#8b7451", 1.3);
  circle(32, "#435645", "#8f7850", 1.5);
  circle(13, "#854838", "#b8935a", 1.5);
}
drawBoard();
route({ focus: false });
