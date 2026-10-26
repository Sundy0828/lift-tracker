/**
 * Every Firestore function and type `@lift/data` uses, from one place.
 *
 * This is the mobile build: `@react-native-firebase/firestore`, the native
 * SDKs with a disk-backed offline cache. Web uses `firestore.ts` beside it,
 * which re-exports the same names from the Firebase JS SDK.
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
} from '@react-native-firebase/firestore';
export type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  WriteBatch,
} from '@react-native-firebase/firestore';
