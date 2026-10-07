/**
 * Every Firestore function and type `@lift/data` uses, from one place.
 *
 * This is the web build: the Firebase JS SDK. On mobile, Metro picks
 * `firestore.native.ts` beside it, which re-exports the same names from
 * `@react-native-firebase/firestore` (native SDKs, disk-backed offline cache).
 * The two lists must stay identical; `tsconfig.native.json` checks the whole
 * package against the native one.
 *
 * Instance setup (cache, emulator) is not here: see `../firestore.ts`.
 */
export {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
export type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  WriteBatch,
} from 'firebase/firestore';
