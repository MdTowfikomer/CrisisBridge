import { GoogleGenerativeAI } from "@google/generative-ai";
import { TriageResult } from "@crisisbridge/types";

// Primary, Secondary, and Tertiary models for maximum resilience
const PRIMARY_MODEL = "gemini-1.5-flash";
const SECONDARY_MODEL = "gemini-1.5-pro";
const TERTIARY_MODEL = "gemini-1.0-pro";

export class TriageService {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Analyzes an emergency description with an automatic model fallback mechanism.
   */
  async analyzeAlert(alert: any, targetLanguage: string = 'en'): Promise<TriageResult> {
    const prompt = `
      You are an emergency triage AI for a hospitality environment.
      Analyze the following emergency alert and provide a structured response in JSON format.

      GUEST INPUT: "${alert.description || 'No description provided'}"
      EMERGENCY TYPE: ${alert.type}
      LOCATION: ${alert.location}
      TARGET LANGUAGE: ${targetLanguage}

      Respond with ONLY a JSON object containing these fields. 
      CRITICAL: The fields "classification", "immediate_action", and "task_card" contents MUST be in the TARGET LANGUAGE (${targetLanguage}).

      - severity: "CRITICAL", "HIGH", "MEDIUM", or "LOW"
      - classification: A short specific category in ${targetLanguage}
      - immediate_action: One sentence instruction for the first responder in ${targetLanguage}
      - task_card: An object with { title, action_item } in ${targetLanguage}
      - requires_ems: boolean (true if professional emergency services like 911 are needed)  
    `;

    try {
      // Attempt 1: Primary Model (1.5 Flash)
      return await this.executeTriage(PRIMARY_MODEL, prompt);
    } catch (e1) {
      console.warn(`⚠️ Primary Model (${PRIMARY_MODEL}) failed, trying ${SECONDARY_MODEL}...`);
      try {
        // Attempt 2: Secondary Model (1.5 Pro)
        return await this.executeTriage(SECONDARY_MODEL, prompt);
      } catch (e2) {
        console.warn(`⚠️ Secondary Model (${SECONDARY_MODEL}) failed, trying ${TERTIARY_MODEL}...`);
        try {
          // Attempt 3: Tertiary Model (1.0 Pro)
          return await this.executeTriage(TERTIARY_MODEL, prompt);
        } catch (e3: any) {
          console.error('❌ ALL Gemini Models failed:', e3.message);
          return this.getFallbackTriage(alert);
        }
      }
    }
  }

  private async executeTriage(modelName: string, prompt: string): Promise<TriageResult> {
    const model = this.genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const response = await result.response;
    return JSON.parse(response.text()) as TriageResult;
  }

  /**
   * Generates a professional post-incident summary using Gemini.
   */
  async generateIncidentSummary(incidentRecord: any): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: PRIMARY_MODEL });

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
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Summary Generation Error:', error);
      return "Failed to generate AI summary. Manual review required.";
    }
  }

  getFallbackTriage(alert: any): TriageResult {
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
}
