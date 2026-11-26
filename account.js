import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, collection, getDocsFromServer, runTransaction, Bytes, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { readPlayers, writePlayers } from "./profile.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "nl";
const db = getFirestore(app);
const el = id => document.getElementById(id);
const nav = document.querySelector("nav");
const status = message => { el("auth-status").textContent = message; };
let player, creating = false, generation = 0, progressStore, local;
function screen(form, title, intro) {
  window.doublesLab.setAccount(null);
  nav.hidden = true;
  el("gate").hidden = false;
  for (const id of ["access", "profile-form", "local-import", "card-details"]) el(id).hidden = id !== form;
  el("gate-title").textContent = title;
  el("gate-intro").textContent = intro;
  el("logout").hidden = !auth.currentUser;
  el("auth-retry").hidden = true;
  status("");
}
function login() {
  screen("access", creating ? "TDF-account aanmaken" : "Aanmelden bij Doubles Lab",
    creating ? "Maak je account aan en vul daarna je spelerskaart in." : "Gebruik hetzelfde e-mailadres en wachtwoord als in ProCheckout.");
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
  const link = doc(db,"accounts",uid,"profileLink","active");
  const list = doc(db,"accounts",uid,"trainingData",btoa("trainingUsers").replace(/=+$/,""));
  return runTransaction(db, async tx => {
    const [linked, stored] = await Promise.all([tx.get(link),tx.get(list)]);
    const players = stored.exists() ? readPlayers(stored.data().payload.toUint8Array()) : [];
    const id = linked.data()?.userID;
    const current = players.find(item => item.id === id);
    if (!fields) return current || {id, nickname:linked.data()?.userName || ""};
    const item = {...current, ...fields, id:id || crypto.randomUUID()};
    item.name = item.nickname || [item.firstName,item.lastName].filter(Boolean).join(" ");
    const updated = players.filter(p => p.id !== item.id);
    updated.push(item);
    tx.set(list,{key:"trainingUsers",payload:Bytes.fromUint8Array(writePlayers(updated))});
    tx.set(link,{userID:item.id,userName:item.name,updatedAt:serverTimestamp()},{merge:true});
    return item;
  });
}
function card() {
  screen("profile-form","Mijn spelerskaart","Je deelt deze spelerskaart met ProCheckout.");
  for (const key of ["firstName","lastName","nickname","darts"]) {
    el("profile-form").elements[key].value = player?.[key] ?? (key === "nickname" ? player?.name || "" : "");
  }
}
function storeFor(uid) {
  const sessions = collection(db,"accounts",uid,"doublesLabSessions");
  const records = collection(db,"accounts",uid,"doublesLabResults");
  const load = async () => {
    const [s,r] = await Promise.all([getDocsFromServer(sessions),getDocsFromServer(records)]);
    return {version:2,sessions:Object.fromEntries(s.docs.map(d=>[d.id,JSON.parse(d.data().payload)])),
      records:r.docs.map(d=>JSON.parse(d.data().payload)).sort((a,b)=>b.date.localeCompare(a.date))};
  };
  const save = (session, previous, record) => runTransaction(db,async tx => {
    const ref = doc(sessions,session.mode);
    const latest = await tx.get(ref);
    if (latest.data()?.payload !== JSON.stringify(previous)) throw Error("conflict");
    tx.set(ref,{payload:JSON.stringify(session)});
    const result = doc(records,session.id);
    if (record) tx.set(result,{payload:JSON.stringify(record)});
    else if (previous?.id === session.id && Training.inspect(previous).done) tx.delete(result);
  });
  const importMissing = async (items, group, key) => {
    for (const item of items) {
      const ref = doc(group,item[key]);
      await runTransaction(db,async tx => {
        if (!(await tx.get(ref)).exists()) tx.set(ref,{payload:JSON.stringify(item)});
      });
    }
  };
  return {load,save,async importProgress(old) {
    await importMissing(old.records,records,"id");
    await importMissing(Object.values(old.sessions),sessions,"mode");
  }};
}
async function enter(epoch) {
  const store = progressStore;
  const data = await store.load();
  if (epoch !== generation) return;
  el("gate").hidden = true;
  nav.hidden = false;
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
