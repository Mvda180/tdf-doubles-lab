import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, collection, getDocsFromServer, runTransaction, getDocFromServer, setDoc }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js?v=independent-accounts";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "nl";
const db = getFirestore(app);
const el = id => document.getElementById(id);
const trainingMenu = el("training-menu");
const status = message => { el("auth-status").textContent = message; };
let player, creating = false, generation = 0, progressStore, local;
function screen(form, title, intro) {
  window.doublesLab.setAccount(null);
  trainingMenu.hidden = true;
  el("gate").hidden = false;
  for (const id of ["access", "profile-form", "local-import", "card-details", "cloud-import"]) el(id).hidden = id !== form;
  el("gate-title").textContent = title;
  el("gate-intro").textContent = intro;
  el("logout").hidden = !auth.currentUser;
  el("auth-retry").hidden = true;
  status("");
}
function login() {
  screen("access", creating ? "Trainings Lab-account aanmaken" : "Aanmelden bij\nTDF Trainings Lab",
    creating ? "Kies je e-mailadres en een wachtwoord voor Trainings Lab. Daarna maak je je spelerskaart aan." : "Meld je aan met je e-mailadres en wachtwoord om verder te trainen.");
  el("auth-submit").textContent = creating ? "Account aanmaken" : "Aanmelden";
  el("switch-auth").textContent = creating ? "Ik heb al een account" : "Nieuw account aanmaken";
  el("reset-password").hidden = creating;
  el("access").elements.password.autocomplete = creating ? "new-password" : "current-password";
  el("access").elements.password.minLength = creating ? 6 : 1;
}
function message(error) {
  return ({
    "auth/invalid-credential":"E-mailadres of wachtwoord klopt niet.",
    "auth/email-already-in-use":"Er bestaat al een account met dit e-mailadres. Kies ‘Ik heb al een account’.",
    "auth/weak-password":"Kies een wachtwoord van minstens zes tekens.",
    "auth/too-many-requests":"Te veel pogingen. Probeer het later opnieuw.",
    "auth/invalid-email":"Controleer je e-mailadres.",
    "permission-denied":"Je account heeft geen toegang tot deze gegevens."
  })[error.code] || "De verbinding met je account is mislukt. Probeer het opnieuw.";
}
el("switch-auth").onclick = () => { creating = !creating; login(); };
el("access").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  form.inert = true;
  try {
    const authenticate = creating ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
    await authenticate(auth, form.elements.email.value.trim(), form.elements.password.value);
    form.reset();
  } catch (error) { status(message(error)); }
  finally { form.inert = false; }
};
el("reset-password").onclick = async () => {
  const email = el("access").elements.email;
  if (!email.reportValidity()) return;
  try {
    await sendPasswordResetEmail(auth, email.value.trim());
    status("Als er een account bestaat, ontvang je een e-mail om je wachtwoord te herstellen.");
  } catch (error) { status(message(error)); }
};
el("logout").onclick = async () => { try { await signOut(auth); } catch (error) { status(message(error)); } };
el("auth-retry").onclick = () => location.reload();

async function profile(uid, fields) {
  const ref = doc(db, "accounts", uid, "profile", "active");
  if (!fields) return (await getDocFromServer(ref)).data() ?? {};
  await setDoc(ref, fields);
  return fields;
}
function card() {
  screen("profile-form","Mijn spelerskaart","Vul je spelerskaart voor Trainings Lab in.");
  for (const key of ["firstName","lastName","nickname","darts"]) {
    el("profile-form").elements[key].value = player?.[key] ?? (key === "nickname" ? player?.name || "" : "");
  }
}
async function loadProgress(database, uid) {
  const sessions = collection(database, "accounts", uid, "doublesLabSessions");
  const records = collection(database, "accounts", uid, "doublesLabResults");
  const [s, r] = await Promise.all([getDocsFromServer(sessions), getDocsFromServer(records)]);
  return {
    version: 2,
    sessions: Object.fromEntries(s.docs.map(d => [d.id, JSON.parse(d.data().payload)])),
    records: r.docs.map(d => JSON.parse(d.data().payload)).sort((a, b) => b.date.localeCompare(a.date))
  };
}
function storeFor(uid) {
  const sessions = collection(db, "accounts", uid, "doublesLabSessions");
  const records = collection(db, "accounts", uid, "doublesLabResults");
  const load = () => loadProgress(db, uid);
  const save = (session, previous, record) => runTransaction(db,async tx => {
    const ref = doc(sessions,session.mode);
    const latest = await tx.get(ref);
    if (latest.data()?.payload !== JSON.stringify(previous)) throw Error("conflict");
    tx.set(ref,{payload:JSON.stringify(session)});
    const result = doc(records,session.id);
    if (record) tx.set(result,{payload:JSON.stringify(record)});
    else if (previous?.id === session.id && Training.inspect(previous).done) tx.delete(result);
  });
  const discard = session => runTransaction(db, async tx => {
    const ref = doc(sessions, session.mode);
    const latest = await tx.get(ref);
    if (!latest.exists()) return;
    if (latest.data().payload !== JSON.stringify(session) || Training.inspect(session).done) {
      throw Error("conflict");
    }
    tx.delete(ref);
  });
  const importMissing = async (items, group, key) => {
    for (const item of items) {
      const ref = doc(group,item[key]);
      await runTransaction(db,async tx => {
        if (!(await tx.get(ref)).exists()) tx.set(ref,{payload:JSON.stringify(item)});
      });
    }
  };
  return {load,save,discard,async importProgress(old) {
    await importMissing(old.records,records,"id");
    await importMissing(Object.values(old.sessions),sessions,"mode");
  }};
}
async function enter(epoch) {
  const store = progressStore;
  const data = await store.load();
  if (epoch !== generation) return;
  el("gate").hidden = true;
  trainingMenu.hidden = false;
  window.doublesLab.setAccount(store,data);
}
function recovered(error, epoch) {
  if (epoch !== generation) return;
  status(message(error));
  el("auth-retry").hidden = false;
}
function localProgress() {
  try {
    if (localStorage.getItem("tdf-lab-migration-complete")) return null;
    const old = Training.readProgress(localStorage.getItem("tdf-doubles-lab-v2") ?? localStorage.getItem("tdf-doubles-lab-v1"));
    return old.records.length || Object.keys(old.sessions).length ? old : null;
  } catch { return null; }
}
async function next(epoch) {
  local = localProgress();
  if (local) screen("local-import","Trainingen op dit toestel","Zijn deze resultaten van jou? Voeg ze toe aan je account. Bestaande accountresultaten blijven behouden.");
  else await enter(epoch);
}
el("profile-form").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget, epoch = generation;
  const fields = Object.fromEntries(Array.from(new FormData(form), ([k,v])=>[k,v.trim()]));
  if (!fields.firstName || !fields.lastName) { status("Vul je voornaam en achternaam in."); return; }
  form.inert = true;
  try {
    const saved = await profile(auth.currentUser.uid,fields);
    if (epoch !== generation) return;
    player = saved;
    await next(epoch);
  } catch (error) { recovered(error,epoch); }
  finally { form.inert = false; }
};
el("show-card").onclick = () => {
  screen("card-details",player.nickname || player.name || "Mijn spelerskaart","Je TDF-spelerskaart");
  const list = el("card-details").querySelector("dl");
  list.replaceChildren();
  for (const [label,value] of [["Naam",[player.firstName,player.lastName].filter(Boolean).join(" ")],["Bijnaam",player.nickname],["Darts",player.darts]]) {
    const term = document.createElement("dt"), description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value || "Niet ingevuld";
    list.append(term,description);
  }
};
el("edit-card").onclick = card;
el("open-cloud-import").onclick = () => {
  el("cloud-import").reset();
  screen("cloud-import", "Oude trainingen overzetten",
    "Meld je hier eenmalig aan met je vroegere account om je Trainings Lab-resultaten te kopiëren naar je nieuwe account.");
};
el("close-cloud-import").onclick = () => {
  el("cloud-import").reset();
  el("show-card").onclick();
};
el("cloud-import").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const epoch = generation;
  const store = progressStore;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  form.reset();
  form.inert = true;
  el("logout").disabled = true;
  status("Oude trainingen ophalen…");
  try {
    const { readLegacyProgress } = await import("./legacy-import.js");
    const previous = await readLegacyProgress(email, password, loadProgress);
    if (epoch !== generation) return;
    await store.importProgress(previous);
    if (epoch !== generation) return;
    status(previous.records.length || Object.keys(previous.sessions).length
      ? "Je trainingsgegevens zijn overgezet. Bestaande resultaten bleven behouden."
      : "Bij dit account zijn geen oude Trainings Lab-trainingen gevonden.");
  } catch (error) {
    if (epoch === generation) status(message(error));
  } finally {
    form.inert = false;
    el("logout").disabled = false;
  }
};
el("back-app").onclick = () => { const epoch = generation; enter(epoch).catch(error=>recovered(error,epoch)); };
el("import-yes").onclick = async () => {
  const epoch = generation;
  el("local-import").inert = true;
  try {
    await progressStore.importProgress(local);
    if (epoch !== generation) return;
    try { localStorage.setItem("tdf-lab-migration-complete","1"); } catch {}
    await enter(epoch);
  } catch (error) { recovered(error,epoch); }
  finally { el("local-import").inert = false; }
};
el("import-no").onclick = () => { const epoch=generation; enter(epoch).catch(error=>recovered(error,epoch)); };
onAuthStateChanged(auth, async user => {
  const epoch = ++generation;
  el("cloud-import").reset();
  player = progressStore = local = null;
  el("profile-form").reset();
  if (!user) { creating = false; login(); return; }
  screen(null,"Spelerskaart laden","Je accountgegevens worden opgehaald.");
  try {
    const loaded = await profile(user.uid);
    if (generation !== epoch) return;
    player = loaded;
    progressStore = storeFor(user.uid);
    if (!player.firstName || !player.lastName) card();
    else await next(epoch);
  } catch (error) { recovered(error,epoch); }
});
