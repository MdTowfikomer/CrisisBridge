import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Using Gemini 3 Flash for maximum speed and compatibility with the new SDK
const MODEL_NAME = "gemini-3-flash-preview"; 

export const TriageService = {
  /**
   * Analyzes an emergency description and returns structured triage data.
   * @param {Object} alert - The emergency alert data.
   * @returns {Promise<Object>} - Structured triage response.
   */
  async analyzeAlert(alert) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.warn('GEMINI_API_KEY not set. Using fallback triage logic.');
      return this.getFallbackTriage(alert);
    }

    const prompt = `
      You are an emergency triage AI for a hospitality environment. 
      Analyze the following emergency alert and provide a structured response in JSON format.
      
      GUEST INPUT: "${alert.description || 'No description provided'}"
      EMERGENCY TYPE: ${alert.type}
      LOCATION: ${alert.location}
      
      Respond with ONLY a JSON object containing these fields:
      - severity: "CRITICAL", "HIGH", "MEDIUM", or "LOW"
      - classification: A short specific category (e.g., "Cardiac Arrest", "Kitchen Fire", "Physical Altercation")
      - immediate_action: One sentence instruction for the first responder on site.
      - task_card: An object with { title, action_item } for a staff task list.
      - requires_ems: boolean (true if professional emergency services like 911 are needed)
    `;

    try {
      const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          response_mime_type: "application/json"
        }
      });

      const text = response.text;
      return JSON.parse(text);
    } catch (error) {
      console.error('Gemini Triage Error:', error);
      return this.getFallbackTriage(alert);
    }
  },

  /**
   * Generates a professional post-incident summary using Gemini.
   * @param {Object} incidentRecord - The finalized incident data.
   */
  async generateIncidentSummary(incidentRecord) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return "AI Summary unavailable. Incident finalized successfully.";
    }

    const prompt = `
      You are a professional crisis coordinator. 
      Review the following incident record and generate a concise (3-4 sentences) summary report suitable for management and insurance review.
      
      INCIDENT DETAILS:
      - Type: ${incidentRecord.alert.type}
      - Location: ${incidentRecord.alert.location}
      - Description: ${incidentRecord.alert.description || 'No description provided'}
      - AI Classification: ${incidentRecord.triage.classification}
      - Responder Actions: ${incidentRecord.actions.join(', ')}
      - Resolution Status: ${incidentRecord.summary}
      
      Generate a professional, neutral, and objective report summary.
    `;

    try {
      const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
      });
      return response.text;
    } catch (error) {
      console.error('Summary Generation Error:', error);
      return "Failed to generate AI summary. Manual review required.";
    }
  },

  getFallbackTriage(alert) {
    return {
      severity: "HIGH",
      classification: alert.type === 'MEDICAL' ? 'General Medical' : alert.type === 'FIRE' ? 'Fire Alarm' : 'Security Concern',
      immediate_action: "Proceed to location with caution and assess the situation.",
      task_card: {
        title: `EMERGENCY: ${alert.type}`,
        action_item: `Report to ${alert.location} immediately.`
      },
      requires_ems: true
    };
  }
};
