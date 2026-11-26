"use strict";

const Training = (() => {
  const doubles = [20, 16, 12, 10, 8, 4];
  const levels = {
    start: { label: "Start", bingo: [20, 16, 8], rescue: [16, 20, 8], sprint: [32, 40] },
    groei: { label: "Groei", bingo: [20, 16, 12, 8], rescue: [12, 18, 10], sprint: [24, 36, 40] },
    uitdaging: { label: "Uitdaging", bingo: doubles, rescue: [25, 35, 15], sprint: [41, 48, 52] },
  };
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
      description: "Streep de doubles op je kaart af.",
      goal: "Maak je bingokaart leeg in zes beurten van drie darts. Kies bij een nieuwe beurt of na een rake dart een open double.",
      meta: "Max. 18 darts",
    },
    rescue: {
      title: "Red je finish",
      description: "Gooi uit met twee darts na een misser.",
      goal: "Je denkbeeldige eerste dart zit al in een verkeerd vak. Gooi de resterende score uit met maximaal twee echte darts. Elke checkout levert één punt op.",
      meta: "6 situaties",
    },
    sprint: {
      title: "Pro Checkout Sprint",
      description: "Haal je doelscore in tien checkouts.",
      goal: "Start op 40 punten en speel tien checkouts met maximaal drie darts per poging. Je krijgt +5 bij een checkout en −1 bij een misser. Je doel is 54 punten.",
      meta: "10 pogingen",
    },
    test: {
      title: "Instaptest",
      goal: "Gooi zes darts per double, in twee beurten van drie. Registreer elke dart, ook als je het doel eerder al raakte.",
    },
  };
  const isMode = (mode) => Object.hasOwn(modes, mode);
  const isLevel = (level) => Object.hasOwn(levels, level);
  const recommend = (hits) => hits >= 12 ? "uitdaging" : hits >= 6 ? "groei" : "start";
  const totalFor = (mode) => ({ test: 36, bingo: 18, rescue: 6, sprint: 10 })[mode];

  function start(mode, level, id) {
    return { id, mode, level: mode === "test" ? null : level, attempts: [], selection: null };
  }

  function inspect(session) {
    const { mode, level, attempts } = session;
    const count = attempts.length;
    const max = totalFor(mode);
    const hits = attempts.filter((attempt) => attempt.hit).length;
    const info = { count, max, hits, done: count === max };
    if (mode === "test") {
      const breakdown = Object.fromEntries(doubles.map((double, index) => [
        double, attempts.slice(index * 6, index * 6 + 6).filter((attempt) => attempt.hit).length,
      ]));
      return { ...info, target: doubles[Math.floor(count / 6)], breakdown, recommendation: recommend(hits) };
    }
    if (mode === "bingo") {
      const targets = levels[level].bingo;
      const remaining = targets.filter((target) => !attempts.some((attempt) => attempt.hit && attempt.target === target));
      const canChoose = count % 3 === 0 || attempts.at(-1)?.hit === true;
      const target = remaining.includes(session.selection) ? session.selection : remaining[0];
      return { ...info, targets, remaining, canChoose, target, done: info.done || remaining.length === 0 };
    }
    if (mode === "rescue") {
      const target = levels[level].rescue[count % 3];
      return { ...info, target, scenario: scenarios[target] };
    }
    const scores = levels[level].sprint;
    const target = scores[count % scores.length];
    return { ...info, target, finish: finishes[target], score: 40 + hits * 5 - (count - hits) };
  }

  function mark(session, hit) {
    const info = inspect(session);
    if (info.done) return session;
    const attempt = { hit, target: info.target };
    const next = { ...session, attempts: [...session.attempts, attempt] };
    return { ...next, selection: session.mode === "bingo" && !hit ? info.target : null };
  }

  function select(session, target) {
    const info = inspect(session);
    if (session.mode !== "bingo" || info.done || !info.canChoose || !info.remaining.includes(target)) return session;
    return { ...session, selection: target };
  }

  function undo(session) {
    if (session.attempts.length === 0) return session;
    return { ...session, attempts: session.attempts.slice(0, -1), selection: session.attempts.at(-1).target };
  }

  function result(session, date) {
    const info = inspect(session);
    if (!info.done) return null;
    const record = { id: session.id, mode: session.mode, level: session.level, date, hits: info.hits };
    if (session.mode === "test") return { ...record, breakdown: info.breakdown, recommendation: info.recommendation };
    if (session.mode === "bingo") return { ...record, remaining: info.remaining, darts: info.count, targetCount: info.targets.length };
    if (session.mode === "sprint") return { ...record, score: info.score };
    return record;
  }

  return { doubles, levels, modes, isMode, isLevel, recommend, start, inspect, mark, select, undo, result };
})();

if (typeof module !== "undefined") module.exports = Training;
