import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== 'your_sendgrid_api_key_here') {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export const EscalationService = {
  /**
   * Sends an escalation email if an alert is not acknowledged.
   * @param {Object} alert - The emergency alert data.
   * @param {Object} triage - The triage data from Gemini.
   */
  async sendEscalation(alert, triage) {
    if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY === 'your_sendgrid_api_key_here') {
      console.warn('SENDGRID_API_KEY not set. Skipping escalation email.');
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
      await sgMail.send(msg);
      console.log('Escalation email sent successfully to:', process.env.ESCALATION_EMAIL_TO);
    } catch (error) {
      console.error('SendGrid Escalation Error:', error);
    }
  }
};
