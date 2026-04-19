import { z } from 'zod';

/**
 * Production-Ready Configuration Schema
 * Ensures all required keys are present and formatted correctly before boot.
 */
export const ConfigSchema = z.object({
  // Infrastructure
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Security
  ALLOWED_ORIGINS: z.string().transform(s => s.split(',')).default('*'),
  ROOM_LINK_SIGNING_SECRET: z.string().min(32, "Signing secret must be at least 32 characters"),
  
  // External Services
  GEMINI_API_KEY: z.string().min(1, "Gemini API Key is mandatory for AI Triage"),
  SENDGRID_API_KEY: z.string().min(1, "SendGrid API Key is mandatory for Escalations"),
  
  // Business Defaults
  ESCALATION_EMAIL_TO: z.string().email(),
  ESCALATION_EMAIL_FROM: z.string().email(),
  GUEST_APP_BASE_URL: z.string().url(),
});

export function validateConfig() {
  try {
    return ConfigSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ CONFIGURATION ERROR: Missing or invalid environment variables:');
      error.issues.forEach(issue => {
        console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}
