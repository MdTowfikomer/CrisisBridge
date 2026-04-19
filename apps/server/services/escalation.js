import sgMail from '@sendgrid/mail';
import { retry, expoBackoff, handleType } from 'cockatiel';
import dotenv from 'dotenv';

dotenv.config();

if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== 'your_sendgrid_api_key_here') {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Production-grade retry policy: 3 attempts with exponential backoff
const retryPolicy = retry(handleType(Error), {
  maxAttempts: 3,
  backoff: new expoBackoff(),
});

export const EscalationService = {
  /**
   * Sends an escalation email if an alert is not acknowledged.
   * Retries automatically if the SendGrid service is unreachable.
   */
  async sendEscalation(alert, triage) {
    if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY === 'your_sendgrid_api_key_here') {
      console.warn('⚠️ ESCALATION: NO SENDGRID KEY. Emergency logged only.');
      console.log('ESCALATION LOG:', { alert, triage });
      return;
    }

    const msg = {
      to: process.env.ESCALATION_EMAIL_TO,
      from: process.env.ESCALATION_EMAIL_FROM,
      subject: `[UNACKNOWLEDGED] ${triage.severity} Emergency in ${alert.location}`,
      text: `
        AN EMERGENCY ALERT HAS NOT BEEN ACKNOWLEDGED WITHIN THE TIMEOUT.

        Location: ${alert.location}
        Type: ${alert.type}
        Classification: ${triage.classification}
        Severity: ${triage.severity}

        Guest Description: ${alert.description || 'None provided'}

        AI Recommendation: ${triage.immediate_action}

        Please take immediate action.
      `,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 4px solid red;">
          <h1 style="color: red;">CRITICAL ESCALATION</h1>
          <p><strong>Location:</strong> ${alert.location}</p>
          <p><strong>Type:</strong> ${alert.type}</p>
          <p><strong>Severity:</strong> <span style="background: red; color: white; padding: 2px 5px;">${triage.severity}</span></p>
          <hr />
          <p><strong>Description:</strong> ${alert.description || 'None provided'}</p>       
          <p><strong>AI Action:</strong> ${triage.immediate_action}</p>
        </div>
      `,
    };

    try {
      await retryPolicy.execute(() => sgMail.send(msg));
      console.log('✅ Escalation email delivered to:', process.env.ESCALATION_EMAIL_TO);
    } catch (error) {
      if (error.response) {
        console.error('❌ SendGrid Reject (403 Forbidden):', error.response.body);
        console.error('Verification Tip: Ensure "' + process.env.ESCALATION_EMAIL_FROM + '" is a Verified Sender in SendGrid.');
      }
      console.error('❌ FATAL ESCALATION FAILURE after retries:', error.message);
    }
  }
};
