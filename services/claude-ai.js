const axios = require('axios');

/**
 * Claude API integration for generating collection messages
 */
class ClaudeAIService {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.model = 'claude-3-5-sonnet-20241022';
  }

  /**
   * Generate email message
   */
  async generateEmail(invoice, toneLevel, language = 'en') {
    try {
      const prompts = require('../prompts/collection-prompts');
      const { systemPrompt, userPrompt } = prompts.generateEmailPrompt(invoice, toneLevel, language);

      const response = await this._callClaude(systemPrompt, userPrompt);
      const content = response.content[0].text;

      // Parse JSON response
      try {
        return JSON.parse(content);
      } catch (e) {
        // If not valid JSON, extract from markdown code block
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        throw new Error('Failed to parse Claude response as JSON');
      }
    } catch (error) {
      console.error('Error generating email:', error.message);
      throw error;
    }
  }

  /**
   * Generate SMS message
   */
  async generateSMS(invoice, toneLevel, language = 'en') {
    try {
      const prompts = require('../prompts/collection-prompts');
      const { systemPrompt, userPrompt } = prompts.generateSmsPrompt(invoice, toneLevel, language);

      const response = await this._callClaude(systemPrompt, userPrompt);
      const content = response.content[0].text;

      try {
        return JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        throw new Error('Failed to parse Claude response as JSON');
      }
    } catch (error) {
      console.error('Error generating SMS:', error.message);
      throw error;
    }
  }

  /**
   * Generate voice call script
   */
  async generateVoiceScript(invoice, toneLevel, language = 'en') {
    try {
      const prompts = require('../prompts/collection-prompts');
      const { systemPrompt, userPrompt } = prompts.generateVoiceScriptPrompt(invoice, toneLevel, language);

      const response = await this._callClaude(systemPrompt, userPrompt);
      const content = response.content[0].text;

      try {
        return JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        throw new Error('Failed to parse Claude response as JSON');
      }
    } catch (error) {
      console.error('Error generating voice script:', error.message);
      throw error;
    }
  }

  /**
   * Generate formal letter
   */
  async generateLetter(invoice, toneLevel, language = 'en') {
    try {
      const prompts = require('../prompts/collection-prompts');
      const { systemPrompt, userPrompt } = prompts.generateLetterPrompt(invoice, toneLevel, language);

      const response = await this._callClaude(systemPrompt, userPrompt);
      const content = response.content[0].text;

      try {
        return JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        throw new Error('Failed to parse Claude response as JSON');
      }
    } catch (error) {
      console.error('Error generating letter:', error.message);
      throw error;
    }
  }

  /**
   * Generate personalized collection message
   */
  async generatePersonalizedMessage(invoice, channel, toneLevel, language = 'en') {
    try {
      if (channel === 'email') {
        return await this.generateEmail(invoice, toneLevel, language);
      } else if (channel === 'sms') {
        return await this.generateSMS(invoice, toneLevel, language);
      } else if (channel === 'voice') {
        return await this.generateVoiceScript(invoice, toneLevel, language);
      } else if (channel === 'letter') {
        return await this.generateLetter(invoice, toneLevel, language);
      } else {
        throw new Error(`Unknown channel: ${channel}`);
      }
    } catch (error) {
      console.error(`Error generating ${channel} message:`, error.message);
      throw error;
    }
  }

  /**
   * Call Claude API
   */
  async _callClaude(systemPrompt, userPrompt) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: this.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ]
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      if (error.response) {
        console.error('Claude API error:', error.response.data);
        throw new Error(`Claude API error: ${error.response.data.error?.message || 'Unknown error'}`);
      }
      throw error;
    }
  }

  /**
   * Extract payment promise from text
   */
  async extractPaymentPromise(text, language = 'en') {
    try {
      const prompt = language === 'en'
        ? `Extract payment promise details from this text. Return JSON with: promised_date (YYYY-MM-DD if mentioned), payment_amount (number if mentioned), and confidence (0-100).

Text: "${text}"

Return only JSON, no explanation.`
        : `Extrae detalles de promesa de pago de este texto. Devuelve JSON con: promised_date (YYYY-MM-DD si se menciona), payment_amount (número si se menciona), y confidence (0-100).

Texto: "${text}"

Devuelve solo JSON, sin explicación.`;

      const response = await this._callClaude('You are a data extraction assistant.', prompt);
      const content = response.content[0].text;

      try {
        return JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        }
        return { confidence: 0 };
      }
    } catch (error) {
      console.error('Error extracting payment promise:', error.message);
      return { confidence: 0 };
    }
  }

  /**
   * Detect objections from response
   */
  async detectObjections(text, language = 'en') {
    try {
      const prompt = language === 'en'
        ? `Analyze this debtor response for objections/reasons given for non-payment. Return JSON with: objections (array), primary_objection (string), severity (low/medium/high), and suggested_response.

Response: "${text}"

Return only JSON, no explanation.`
        : `Analiza esta respuesta del deudor para objeciones/razones dadas por no pago. Devuelve JSON con: objections (array), primary_objection (string), severity (low/medium/high), y suggested_response.

Respuesta: "${text}"

Devuelve solo JSON, sin explicación.`;

      const response = await this._callClaude('You are a debt collection analysis assistant.', prompt);
      const content = response.content[0].text;

      try {
        return JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        }
        return { objections: [], severity: 'unknown' };
      }
    } catch (error) {
      console.error('Error detecting objections:', error.message);
      return { objections: [], severity: 'unknown' };
    }
  }

  /**
   * Generate follow-up strategy
   */
  async generateFollowUpStrategy(invoice, previousResponses, language = 'en') {
    try {
      const responsesText = previousResponses
        .map(r => `${r.channel} (${r.date}): ${r.response}`)
        .join('\n');

      const prompt = language === 'en'
        ? `Generate next collection strategy for debtor. Previous context:
Invoice: ${invoice.invoice_number}
Amount: $${invoice.amount}
Days Overdue: ${invoice.days_overdue}
Previous Responses:
${responsesText}

Return JSON with: recommended_channel, recommended_tone, suggested_message, and reasoning.`
        : `Genera la siguiente estrategia de cobro para el deudor. Contexto anterior:
Factura: ${invoice.invoice_number}
Monto: $${invoice.amount}
Días de Atraso: ${invoice.days_overdue}
Respuestas Anteriores:
${responsesText}

Devuelve JSON con: recommended_channel, recommended_tone, suggested_message, y reasoning.`;

      const response = await this._callClaude('You are a collection strategy expert.', prompt);
      const content = response.content[0].text;

      try {
        return JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        }
        return { recommended_channel: 'email', recommended_tone: 2 };
      }
    } catch (error) {
      console.error('Error generating follow-up strategy:', error.message);
      return { recommended_channel: 'email', recommended_tone: 2 };
    }
  }
}

module.exports = new ClaudeAIService();
