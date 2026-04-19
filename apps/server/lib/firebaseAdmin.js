import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Initializes Firebase Admin using a service account or default credentials.
 * For Render/Railway production, you can paste the service account JSON
 * into an environment variable named FIREBASE_SERVICE_ACCOUNT.
 */
function initializeFirebase() {
  if (admin.apps.length) return admin.app();

  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.VITE_FIREBASE_DATABASE_URL
      });
    } catch (e) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT. Falling back to default.');
    }
  }

  // Fallback to Application Default Credentials (good for local dev)
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL
  });
}

export const firebaseAdmin = initializeFirebase();
export const firestore = admin.firestore();
export const rtdbAdmin = admin.database();
