import { GoogleGenerativeAI } from "@google/generative-ai";
import { TriageResult } from "@crisisbridge/types";

// Using the most stable flash model identifier
const MODEL_NAME = "gemini-1.5-flash-latest"; 

export class TriageService {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Analyzes an emergency description and returns structured triage data.
   */
  async analyzeAlert(alert: any): Promise<TriageResult> {
    const model = this.genAI.getGenerativeModel({ model: MODEL_NAME });

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
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const response = await result.response;
      return JSON.parse(response.text()) as TriageResult;
    } catch (error) {
      console.error('Gemini Triage Error:', error);
      return this.getFallbackTriage(alert);
    }
  }

  /**
   * Generates a professional post-incident summary using Gemini.
   */
  async generateIncidentSummary(incidentRecord: any): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: MODEL_NAME });

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
