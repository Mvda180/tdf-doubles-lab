"use strict";

const Training = (() => {
  const doubles = [20, 16, 12, 10, 8, 4];
  const levels = {
    start: { label: "Start", bingo: [20, 16, 8], rescue: [16, 20, 8], sprint: [32, 40] },
    groei: { label: "Groei", bingo: [20, 16, 12, 8], rescue: [12, 18, 10], sprint: [24, 36, 40] },
    uitdaging: { label: "Uitdaging", bingo: doubles, rescue: [25, 35, 15], sprint: [41, 48, 52] },
  };
  const switchPairs = {
    start: [[20, 16], [16, 8], [8, 20]],
    groei: [[20, 12], [18, 8], [10, 16]],
    uitdaging: [[1, 18], [7, 16], [11, 4], [15, 10], [3, 20]],
  };
  const legTargets = {
    start: [20, 16, 8, 20, 16, 8, 16, 20, 8, 16],
    groei: [20, 12, 16, 18, 8, 10, 12, 18, 16, 20],
    uitdaging: [16, 13, 20, 9, 25, 6, 18, 14, 11, 8],
  };
  const legBudgets = {
    start: [3],
    groei: [3, 2],
    uitdaging: [2, 1],
  };
  const doubleLabel = (target) => target === 25 ? "Bull" : `D${target}`;
  const scenarios = {
    16: [32, 16, "D8"], 20: [40, 20, "D10"], 8: [16, 8, "D4"],
    12: [24, 12, "D6"], 18: [36, 18, "D9"], 10: [20, 10, "D5"],
    25: [32, 7, "S9, D8"], 35: [40, 5, "S3, D16"], 15: [24, 9, "S7, D4"],
  };
  const finishes = {
    32: "D16", 40: "D20", 24: "D12", 36: "D18",
    41: "S9, D16", 48: "S16, D16", 52: "S12, D20",
  };
  const modes = {
    bingo: {
      title: "Dubbelbingo",
      category: "Spel",
      description: "Streep de doubles op je kaart af.",
      goal: "Maak je bingokaart leeg in zes beurten van drie darts. Kies bij een nieuwe beurt of na een rake dart een open double.",
      meta: "Max. 18 darts",
    },
    rescue: {
      title: "Red je finish",
      category: "Training",
      description: "Gooi uit met twee darts na een misser.",
      goal: "Je denkbeeldige eerste dart zit al in een verkeerd vak. Gooi de resterende score uit met maximaal twee echte darts. Elke checkout levert één punt op.",
      meta: "6 situaties",
    },
    sprint: {
      title: "Pro Checkout Sprint",
      category: "Training",
      description: "Haal je doelscore in tien checkouts.",
      goal: "Start op 40 punten en speel tien checkouts met maximaal drie darts per poging. Je krijgt +5 bij een checkout en −1 bij een misser. Je doel is 54 punten.",
      meta: "10 pogingen",
    },
    wissel: {
      title: "Dubbelwissel",
      category: "Training",
      description: "Vergelijk mikken in blokken met wisselen na elke dart.",
      goal: "Gooi 18 darts per onderdeel op twee doubles. In blokken gooi je eerst negen darts op de ene en dan negen op de andere. Bij wisselen verander je van doel na elke dart. Rond beide onderdelen af om je percentages te vergelijken.",
      meta: "36 darts",
    },
    leg: {
      title: "Steel de Leg",
      category: "Spel",
      description: "Win de leg met je laatste kans op de double.",
      goal: "Speel tien legs tegen een gesimuleerde tegenstander. Je krijgt één, twee of drie darts op de getoonde double. Raak je die, dan win je de leg meteen. Zijn je darts op, dan wint je tegenstander.",
      meta: "10 legs",
    },
    test: {
      title: "Instaptest",
      goal: "Gooi zes darts per double, in twee beurten van drie. Registreer elke dart, ook als je het doel eerder al raakte.",
    },
  };
  const isMode = (mode) => Object.hasOwn(modes, mode);
  const isLevel = (level) => Object.hasOwn(levels, level);
  const recommend = (hits) => hits >= 12 ? "uitdaging" : hits >= 6 ? "groei" : "start";
  const totalFor = (mode) => ({ test: 36, bingo: 18, rescue: 6, sprint: 10, wissel: 36, leg: 10 })[mode];
  const isCheckout = (mode) => mode === "rescue" || mode === "sprint";
  const dartLimit = (mode) => mode === "rescue" ? 2 : 3;
  const boardNumbers = Array.from({ length: 20 }, (_, index) => index + 1);
  const dartScores = { "0": 0, "25": 25, Bull: 50 };
  for (const [prefix, multiplier] of [["S", 1], ["D", 2], ["T", 3]]) {
    for (const number of boardNumbers) dartScores[prefix + number] = number * multiplier;
  }

  function start(mode, level, id, completed = 0) {
    const session = { id, mode, level: mode === "test" ? null : level, attempts: [], selection: null };
    if (mode === "wissel") {
      const pairs = switchPairs[level];
      session.pair = pairs[completed % pairs.length];
      session.switchFirst = completed % 2 === 1;
    }
    return session;
  }

  function switchPhase(session, index) {
    return (index < 18) === session.switchFirst ? "wisselen" : "blokken";
  }

  function inspectLeg({ level, attempts }, info) {
    const budgets = legBudgets[level];
    const budgetStats = Object.fromEntries(budgets.map(budget => [budget, { legs: 0, wins: 0, darts: 0 }]));
    let legs = 0;
    let used = 0;
    let lastWinner = null;
    for (const dart of attempts) {
      const budget = budgets[legs % budgets.length];
      const row = budgetStats[budget];
      row.darts++;
      used++;
      if (dart.hit || used === budget) {
        row.legs++;
        row.wins += Number(dart.hit);
        lastWinner = dart.hit ? "Jij" : "Tegenstander";
        legs++;
        used = 0;
      }
    }
    const budget = budgets[legs % budgets.length];
    return { ...info, done: legs >= info.max, legs, budget, left: budget - used,
      target: legTargets[level][legs], budgetStats, lastWinner };
  }

  function tally(attempts) {
    const targets = {};
    let count = 0;
    let hits = 0;
    for (const attempt of attempts) {
      const row = targets[attempt.target] ??= { attempts: 0, hits: 0 };
      const shots = attempt.shots ?? 1;
      const made = attempt.hits ?? Number(attempt.hit);
      row.attempts += shots;
      row.hits += made;
      count += shots;
      hits += made;
    }
    return { count, hits, targets };
  }

  function inspect(session) {
    const { mode, level, attempts } = session;
    const { count, hits, targets: targetStats } = tally(attempts);
    const max = totalFor(mode);
    const info = { count, max, hits, targetStats, done: count >= max };
    if (mode === "wissel") {
      const phase = switchPhase(session, count);
      const index = count % 18;
      const target = session.pair[phase === "wisselen" ? index % 2 : Math.floor(index / 9)];
      return { ...info, phase, target };
    }
    if (mode === "leg") return inspectLeg(session, info);
    if (mode === "test") {
      const breakdown = Object.fromEntries(doubles.map((double) => [double, targetStats[double]?.hits ?? 0]));
      return { ...info, target: doubles[Math.floor(count / 6)], breakdown, recommendation: recommend(hits) };
    }
    if (mode === "bingo") {
      const targets = levels[level].bingo;
      const remaining = targets.filter((target) => !targetStats[target]?.hits);
      const canChoose = count % 3 === 0 || attempts.at(-1)?.hit === true;
      const target = remaining.includes(session.selection) ? session.selection : remaining[0];
      return { ...info, targets, remaining, canChoose, target, done: info.done || remaining.length === 0 };
    }
    const scores = levels[level][mode];
    const target = scores[count % scores.length];
    const limit = dartLimit(mode);
    const pending = session.pending ?? [];
    return { ...info, target, limit, pending, visit: evaluateVisit(target, pending, limit),
      scenario: scenarios[target], finish: finishes[target], score: 40 + hits * 5 - (count - hits) };
  }

  function append(session, attempt, selection = null) {
    return { ...session, attempts: [...session.attempts, attempt], selection, pending: [] };
  }

  function mark(session, hit, dartsUsed) {
    const info = inspect(session);
    if (info.done || info.pending?.length) return session;
    const attempt = { hit, target: info.target };
    if (dartsUsed !== undefined) {
      if (!isCheckout(session.mode) || !hit || !Number.isInteger(dartsUsed) ||
          dartsUsed < 1 || dartsUsed > info.limit || (dartsUsed === 1 && !oneDartFinish(info.target))) return session;
      attempt.dartsUsed = dartsUsed;
    }
    return append(session, attempt, session.mode === "bingo" && !hit ? info.target : null);
  }

  function markVisit(session, hits) {
    const { count, done, target } = inspect(session);
    if (done || !Number.isInteger(hits)) return session;
    if (session.mode === "test" && count % 3 === 0 && hits >= 0 && hits <= 3) {
      return append(session, { target, shots: 3, hits });
    }
    if (session.mode === "bingo" && hits === 0) {
      return append(session, { target, shots: 3 - count % 3, hits: 0 }, target);
    }
    return session;
  }

  function oneDartFinish(score) {
    return score === 50 || (score >= 2 && score <= 40 && score % 2 === 0);
  }

  function evaluateVisit(target, darts, limit) {
    let remaining = target;
    for (const dart of darts) {
      remaining -= dartScores[dart];
      if (remaining === 0 && (dart.startsWith("D") || dart === "Bull")) return { remaining, outcome: "finish" };
      if (remaining <= 1) return { remaining: target, outcome: "bust" };
    }
    return { remaining, outcome: darts.length === limit ? "miss" : null };
  }

  function scoreDart(session, dart) {
    if (!isCheckout(session.mode) || !Object.hasOwn(dartScores, dart)) return session;
    const info = inspect(session);
    if (info.done) return session;
    const darts = [...info.pending, dart];
    const { outcome } = evaluateVisit(info.target, darts, info.limit);
    if (!outcome) return { ...session, pending: darts };
    return append(session, { target: info.target, hit: outcome === "finish", outcome, darts, dartsUsed: darts.length });
  }

  function toggleEntry(session) {
    if (!isCheckout(session.mode) || session.pending?.length || inspect(session).done) return session;
    return { ...session, detailed: !session.detailed };
  }

  function select(session, target) {
    const info = inspect(session);
    if (session.mode !== "bingo" || info.done || !info.canChoose || !info.remaining.includes(target)) return session;
    return { ...session, selection: target };
  }

  function undo(session) {
    if (session.pending?.length) return { ...session, pending: session.pending.slice(0, -1) };
    const last = session.attempts.at(-1);
    if (!last) return session;
    return { ...session, attempts: session.attempts.slice(0, -1), selection: last.target,
      pending: last.darts?.slice(0, -1) ?? [], detailed: last.darts ? true : session.detailed };
  }

  function result(session, date) {
    const info = inspect(session);
    if (!info.done) return null;
    const record = { id: session.id, mode: session.mode, level: session.level, date, hits: info.hits, targetStats: info.targetStats };
    if (session.mode === "test") return { ...record, breakdown: info.breakdown, recommendation: info.recommendation };
    if (session.mode === "bingo") return { ...record, remaining: info.remaining, darts: info.count, targetCount: info.targets.length };
    if (session.mode === "wissel") {
      const phaseStats = Object.fromEntries(["blokken", "wisselen"].map(phase =>
        [phase, tally(session.attempts.filter((_, index) => switchPhase(session, index) === phase)).targets]));
      return { ...record, phaseStats };
    }
    if (session.mode === "leg") return { ...record, darts: info.count, budgetStats: info.budgetStats };
    const attempts = session.attempts.filter((attempt) => attempt.hit && Number.isInteger(attempt.dartsUsed));
    const checkoutDarts = attempts.reduce((sum, attempt) => sum + attempt.dartsUsed, 0);
    const finishing = { ...record, checkoutDarts, measuredCheckouts: attempts.length };
    return session.mode === "sprint" ? { ...finishing, score: info.score } : finishing;
  }

  function readProgress(raw) {
    if (raw === null) return { version: 2, records: [], sessions: {} };
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored?.records)) throw new Error("Ongeldige trainingsopslag");
    if (stored.version === 2 && stored.sessions && typeof stored.sessions === "object" && !Array.isArray(stored.sessions)) return stored;
    if (stored.version !== undefined) throw new Error("Onbekende trainingsopslag");
    const sessions = stored.session && isMode(stored.session.mode) ? { [stored.session.mode]: stored.session } : {};
    return { version: 2, records: stored.records, sessions };
  }

  function saveSession(progress, session, date) {
    const records = progress.records.filter((record) => record.id !== session.id);
    const finished = result(session, date);
    if (finished) records.unshift(finished);
    return { ...progress, sessions: { ...progress.sessions, [session.mode]: session }, records };
  }

  function summarize(records) {
    const targets = {};
    let attempts = 0;
    let hits = 0;
    let measuredCheckouts = 0;
    let checkoutDarts = 0;
    for (const record of records) {
      attempts += record.darts ?? totalFor(record.mode);
      hits += record.hits;
      measuredCheckouts += record.measuredCheckouts ?? 0;
      checkoutDarts += record.checkoutDarts ?? 0;
      const legacyTest = record.mode === "test" && record.breakdown
        ? Object.fromEntries(doubles.map((target) => [target, { attempts: 6, hits: record.breakdown[target] }])) : {};
      for (const [target, values] of Object.entries(record.targetStats ?? legacyTest)) {
        const total = targets[target] ??= { attempts: 0, hits: 0 };
        total.attempts += values.attempts;
        total.hits += values.hits;
      }
    }
    return { attempts, hits, targets, measuredCheckouts, checkoutDarts };
  }

  return { doubles, levels, modes, boardNumbers, doubleLabel, legBudgets, isMode, isLevel, isCheckout, oneDartFinish,
    recommend, start, inspect, mark, markVisit, scoreDart, toggleEntry, select, undo, result, readProgress, saveSession, summarize };
})();

if (typeof module !== "undefined") module.exports = Training;
