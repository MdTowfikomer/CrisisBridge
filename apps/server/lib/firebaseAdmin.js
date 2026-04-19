import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Initializes Firebase Admin with high resilience for production environment variables.
 */
function initializeFirebase() {
  try {
    if (admin.apps.length) return admin.app();

    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!serviceAccountVar) {
      console.warn('⚠️ Firebase Admin: FIREBASE_SERVICE_ACCOUNT missing. Using default credentials.');
      return admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL
      });
    }

    // SANITIZATION: Remove all actual newlines and control characters that break JSON.parse
    // but preserve the \n in the private_key string.
    const sanitized = serviceAccountVar
      .trim()
      .replace(/[\u0000-\u001F]+/g, " "); // Remove literal control chars
    
    const serviceAccount = JSON.parse(sanitized);
    
    // Ensure the private key has proper newlines for RSA
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    console.log('✅ Firebase Admin: System Initialized Successfully');
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL
    });

  } catch (error) {
    console.error('❌ FATAL FIREBASE INIT ERROR:', error.message);
    // Return a proxy or throw a more descriptive error
    throw new Error(`Firebase Initialization Failed: ${error.message}`);
  }
}

// Initialize the app immediately
const app = initializeFirebase();

export const firebaseAdmin = app;
export const firestore = admin.firestore(app);
export const rtdbAdmin = admin.database(app);
