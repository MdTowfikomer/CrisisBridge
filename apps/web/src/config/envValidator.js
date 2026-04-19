import { z } from 'zod';

export const EnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1, "Firebase API Key is missing"),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_DATABASE_URL: z.string().url("Invalid Firebase Database URL"),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_BACKEND_URL: z.string().url("VITE_BACKEND_URL must be a full HTTPS URL in production").optional().default('/api'),
});

export function validateEnv() {
  const env = import.meta.env;
  
  // Only strict validate in production
  const isProd = env.PROD;
  
  try {
    return EnvSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn('⚠️ FRONTEND CONFIGURATION WARNING:');
      error.issues.forEach(issue => {
        console.warn(`   - ${issue.path.join('.')}: ${issue.message}`);
      });
      
      if (isProd) {
        throw new Error("Critical Configuration Missing. Deployment halted.");
      }
    }
    return env;
  }
}
