"use strict";

const { doubles, levels, modes, isMode, isLevel } = Training;
const storageKey = "tdf-doubles-lab-v1";
const home = document.querySelector("#home");
const play = document.querySelector("#play");
const historyPage = document.querySelector("#history");
const announcements = document.querySelector("#announcements");
const dateFormat = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const gameKeys = ["bingo", "rescue", "sprint"];
let storageAvailable = true;
let data = readData();

function readData() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.records)) return saved;
  } catch {
    storageAvailable = false;
  }
  return { records: [], session: null };
}

function save(session) {
  const records = data.records.filter((record) => record.id !== session.id);
  const result = Training.result(session, new Date().toISOString());
  if (result) records.unshift(result);
  data = { session, records };
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    storageAvailable = false;
  }
}

function lastTest() {
  return data.records.find((record) => record.mode === "test");
}

function sessionInProgress() {
  return data.session && !Training.inspect(data.session).done;
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
      <a class="button" href="${trainingLink(mode)}">${sessionInProgress() && data.session.mode === mode ? "Speel verder" : "Kies niveau"}<span class="visually-hidden"> voor ${game.title}</span></a>
    </article>`;
  }).join("");
  const test = lastTest();
  const trainings = data.records.filter((record) => record.mode !== "test");
  const testButton = document.querySelector(".hero [data-start]");
  testButton.innerHTML = `${sessionInProgress() && data.session.mode === "test" ? "Ga verder met je test" : "Doe de instaptest"} <span>36 darts</span>`;
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

function renderHistory() {
  const test = lastTest();
  const previous = data.records.filter((record) => record.mode === "test")[1];
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
      ${data.records.length ? `<ul class="history-list">${data.records.map((record) => `<li>
        <div><strong>${modes[record.mode].title}</strong>
        <span>${record.level ? `${levels[record.level].label} · ` : ""}${dateFormat.format(new Date(record.date))}</span></div>
        <span class="item-score">${scoreText(record)}</span>
      </li>`).join("")}</ul>` : `<p>Na een afgeronde sessie verschijnt je resultaat hier.</p><a class="button" href="#trainingen">Kies je eerste training</a>`}
    </section>`;
}

function intro(mode, subtitle) {
  return `<a class="back-link" href="#trainingen">Naar trainingen</a>
    <h1 id="play-title" tabindex="-1">${modes[mode].title}</h1>${subtitle ? `<p class="hint">${subtitle}</p>` : ""}`;
}

function renderSetup(mode) {
  const suggested = lastTest()?.recommendation ?? "start";
  const hasProgress = sessionInProgress();
  const resume = hasProgress && data.session.mode === mode;
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
  return `<div class="button-row">
    <button class="button primary" data-mark="hit">${hit}</button>
    <button class="button" data-mark="miss">${miss}</button>
  </div>`;
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
        markButtons("Raak", "Mis");
      break;
    case "bingo":
      controls = meter(`Beurt ${Math.floor(info.count / 3) + 1} van 6`, `${info.hits}/${info.targets.length} geraakt`, info.count, 18) +
        `<p class="target">D${info.target}</p><p class="hint">Dart ${info.count % 3 + 1} van deze beurt · ${info.canChoose ? "Kies een open double." : "Blijf mikken op dit doel."}</p>
        <div class="target-grid" aria-label="Bingokaart">${info.targets.map((target) => info.remaining.includes(target)
          ? `<button class="target-chip" data-target="${target}" aria-pressed="${target === info.target}" ${info.canChoose ? "" : "disabled"}>D${target}</button>`
          : `<span class="target-chip done" aria-label="D${target} geraakt">D${target} ✓</span>`).join("")}</div>` +
        markButtons("Raak", "Mis");
      break;
    case "rescue":
      controls = meter(`Situatie ${info.count + 1} van 6`, `${info.hits} gered`, info.count, 6) +
        `<p class="target">${info.target}</p>
        <p>Je stond op ${info.scenario[0]} en raakte S${info.scenario[1]}. Werk de rest af met twee darts.</p>
        <details><summary>Toon een route</summary><p>${info.scenario[2]}</p></details>` +
        markButtons("Uitgegooid", "Niet uitgegooid");
      break;
    case "sprint": {
      const needed = Math.max(0, 4 - info.hits);
      const remaining = info.max - info.count;
      const goal = needed === 0 ? "Je bent op koers voor 54 punten." : needed > remaining
        ? "Gooi de resterende checkouts uit voor je beste eindscore."
        : `Nog ${needed} ${needed === 1 ? "checkout" : "checkouts"} nodig voor 54 punten.`;
      controls = meter(`Poging ${info.count + 1} van 10`, `${info.score} punten`, info.count, 10) +
        `<p class="target">${info.target}</p><p>Gooi uit met maximaal drie darts. ${goal}</p>
        <details><summary>Toon een route</summary><p>${info.finish}</p></details>` +
        markButtons("Uitgegooid · +5", "Mis · −1");
      break;
    }
  }
  play.innerHTML = intro(mode, subtitle) + `<section class="panel">${controls}
    <div class="session-tools"><button class="quiet" data-undo ${info.count === 0 ? "disabled" : ""}>Laatste invoer herstellen</button>
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
    ${storageAvailable ? "" : `<p class="hint">De browser blokkeert opslag. Dit resultaat blijft beschikbaar zolang je deze pagina openhoudt.</p>`}
    <div class="button-row">
      <a class="button primary" href="#trainingen">Naar trainingen</a>
      <a class="button" href="#voortgang">Bekijk mijn voortgang</a>
    </div>
    <div class="session-tools"><button class="quiet" data-replay="${record.mode}">Speel opnieuw</button>
    <button class="quiet" data-undo>Laatste invoer herstellen</button></div>
  </section>`;
}

function route({ setup = false, focus = true } = {}) {
  const hash = location.hash.slice(1);
  const mode = hash.startsWith("speel/") ? hash.slice(6) : "";
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
    if (!setup && sessionInProgress() && data.session.mode === mode) renderSession(data.session);
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
  const ongoing = sessionInProgress();
  if (ongoing && data.session.mode === mode && !restart) {
    renderSession(data.session);
    document.querySelector("#play-title").focus({ preventScroll: true });
    return;
  }
  if (ongoing && !window.confirm("Je hebt nog een onvoltooide sessie. Deze vervangen door een nieuwe?")) return;
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  save(Training.start(mode, level, id));
  if (location.hash !== trainingLink(mode)) history.pushState(null, "", trainingLink(mode));
  renderSession(data.session);
  document.querySelector("#play-title").focus({ preventScroll: true });
}

function updateSession(next, control, message) {
  if (!data.session || next === data.session) return;
  save(next);
  renderSession(next);
  const info = Training.inspect(next);
  announcements.textContent = info.done
    ? `Sessie afgerond. ${scoreText(data.records.find((record) => record.id === next.id))}.`
    : `${message} Volgend doel ${next.mode === "test" || next.mode === "bingo" ? "D" : ""}${info.target}.`;
  const nextControl = play.querySelector(control);
  (nextControl?.disabled ? null : nextControl)?.focus({ preventScroll: true });
  if (!nextControl || nextControl.disabled) play.querySelector(info.done ? "#play-title" : "[data-mark]")?.focus({ preventScroll: true });
}

document.addEventListener("submit", (event) => {
  if (event.target.id !== "setup-form") return;
  event.preventDefault();
  const mode = event.target.dataset.mode;
  const level = new FormData(event.target).get("level");
  if (gameKeys.includes(mode) && isLevel(level)) begin(mode, level, true);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { start, begin: selectedMode, restart, resume, replay, mark, target } = button.dataset;
  if (start) {
    const repeatTest = button.closest("#history") !== null;
    openMode(start, repeatTest);
    return;
  }
  if (selectedMode) return begin(selectedMode, null);
  if (restart) return begin(restart, null, true);
  if (resume) return begin(data.session.mode, data.session.level);
  if (replay) return openMode(replay, true);
  if (!data.session) return;
  if (mark) return updateSession(Training.mark(data.session, mark === "hit"), `[data-mark="${mark}"]`, mark === "hit" ? "Gelukt." : "Gemist.");
  if (target) return updateSession(Training.select(data.session, Number(target)), `[data-target="${target}"]`, "Doel gekozen.");
  if (button.hasAttribute("data-undo")) return updateSession(Training.undo(data.session), "[data-undo]", "Laatste invoer hersteld.");
});

window.addEventListener("hashchange", () => {
  if (location.hash !== "#main") route();
});
window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) {
    data = readData();
    route({ focus: false });
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
