// Firebase configuration for THIS experiment's project.
//
// Replace the placeholder object below with the one from your Firebase project:
//   Firebase console -> Project settings (gear icon) -> General -> Your apps -> Web app -> "Config"
// It looks exactly like this object. Paste it over the placeholder and commit the file.
//
// Yes, this file is meant to be public. The apiKey is an identifier for your project,
// not a password: anyone loading your experiment page downloads it anyway. What keeps your
// data safe is firebase/firestore.rules, which only lets participants append their own data.
//
// While the values still say PASTE_ME, the experiment runs in "offline" mode: it works, shows
// a banner, and offers a JSON download at the end instead of saving to Firestore. That is
// fine for building and piloting on your own machine.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCAq8My16IbdxYy1CBkqUZTpvEIQSUp9PI",
  authDomain: "stephens2012-a9b54.firebaseapp.com",
  projectId: "stephens2012-a9b54",
  storageBucket: "stephens2012-a9b54.firebasestorage.app",
  messagingSenderId: "624072270310",
  appId: "1:624072270310:web:4ca7fe710786793b44f627",
};
