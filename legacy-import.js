import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, terminate } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Public Firebase Web SDK identifiers for the shared TDF project.
const legacyProject = {
  apiKey: "AIzaSyDxaTJVcAY6JjX6Yy1hMJwll4JqJ6F3Hd0",
  authDomain: "tdf-app-b3af2.firebaseapp.com",
  projectId: "tdf-app-b3af2",
  appId: "1:624063173736:web:35a3933b21ec5cddcc17dd"
};


export async function readLegacyProgress(email, password, loadProgress) {
  const source = initializeApp(legacyProject, "legacy-training-import");
  let database;
  try {
    const auth = initializeAuth(source, { persistence: inMemoryPersistence });
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    database = getFirestore(source);
    return await loadProgress(database, user.uid);
  } finally {
    try {
      if (database) await terminate(database);
    } finally {
      await deleteApp(source);
    }
  }
}
