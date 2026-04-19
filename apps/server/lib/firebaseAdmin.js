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
      // Handle potential escaped newlines if the JSON was stringified incorrectly
      const sanitized = serviceAccountVar.replace(/\\n/g, '\n');
      const serviceAccount = JSON.parse(sanitized);

      console.log('✅ Firebase Admin: Initializing with Service Account');
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    } catch (e) {
      console.error('❌ Firebase Admin: Failed to parse FIREBASE_SERVICE_ACCOUNT:', e.message);
    }
  }

  console.warn('⚠️ Firebase Admin: No service account found. Falling back to default credentials (may fail in production).');

}

export const firebaseAdmin = initializeFirebase();
export const firestore = admin.firestore();
export const rtdbAdmin = admin.database();
