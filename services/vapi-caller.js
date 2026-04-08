const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

/**
 * Vapi.ai integration for AI voice collection calls
 */
class VapiCallerService {
  constructor() {
    this.apiKey = process.env.VAPI_API_KEY;
    this.privateKey = process.env.VAPI_PRIVATE_KEY;
    this.baseUrl = 'https://api.vapi.ai';
    this.assistantId = process.env.VAPI_ASSISTANT_ID;
  }

  /**
   * Trigger AI voice call
   */
  async triggerVoiceCall(invoice, voiceScript, tone) {
    try {
      if (!this.apiKey) {
        throw new Error('VAPI_API_KEY is not set');
      }

      if (!this._isValidPhoneNumber(invoice.debtor_phone)) {
        return {
          success: false,
          error: 'Invalid phone number',
          phone: invoice.debtor_phone
        };
      }

      const phoneNumber = this._formatPhoneNumber(invoice.debtor_phone);

      // Build custom instructions for the call
      const customInstructions = this._buildCallInstructions(invoice, voiceScript, tone);

      const payload = {
        phoneNumber,
        assistantId: this.assistantId,
        assistantOverrides: {
          system: customInstructions,
          firstMessage: `Hello ${invoice.debtor_name}, this is a call from ${process.env.BUSINESS_NAME || 'BridgeAI'} regarding invoice number ${invoice.invoice_number}. Do you have a few minutes to discuss a past due balance?`
        },
        customData: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          debtor_name: invoice.debtor_name,
          debtor_email: invoice.debtor_email,
          amount: invoice.amount,
          days_overdue: invoice.days_overdue,
          tone_level: tone,
          urgency: invoice.urgency,
          webhook_url: process.env.WEBHOOK_URL || 'https://api.bridgeaihq.com/webhook'
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/call`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        call_id: response.data.id,
        phone: invoice.debtor_phone,
        status: response.data.status || 'initiated',
        initiated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error initiating voice call via Vapi:', error.message);
      return {
        success: false,
        error: error.message,
        phone: invoice.debtor_phone
      };
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callId) {
    try {
      if (!this.apiKey) {
        throw new Error('VAPI_API_KEY is not set');
      }

      const response = await axios.get(
        `${this.baseUrl}/call/${callId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        call_id: response.data.id,
        status: response.data.status,
        duration: response.data.duration,
        recording_url: response.data.recordingUrl,
        transcript: response.data.transcript,
        summary: response.data.summary
      };
    } catch (error) {
      console.error('Error getting call status from Vapi:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Hangup call
   */
  async hangupCall(callId) {
    try {
      if (!this.apiKey) {
        throw new Error('VAPI_API_KEY is not set');
      }

      const response = await axios.delete(
        `${this.baseUrl}/call/${callId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        call_id: callId
      };
    } catch (error) {
      console.error('Error hanging up call:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build system instructions for the call
   */
  _buildCallInstructions(invoice, voiceScript, tone) {
    const voiceScripts = require('../prompts/voice-scripts');
    const scriptLevel = tone <= 2 ? 'friendly' : tone === 3 ? 'firm' : tone === 4 ? 'formal' : 'final';
    const script = voiceScripts[scriptLevel].en;

    return `You are calling ${invoice.debtor_name} regarding an overdue invoice.

INVOICE DETAILS:
- Invoice Number: ${invoice.invoice_number}
- Amount: $${invoice.amount.toFixed(2)}
- Due Date: ${invoice.due_date}
- Days Overdue: ${invoice.days_overdue}
- Business: ${invoice.business_name}

INSTRUCTIONS:
${script}

TONE LEVEL: ${tone}/5 (1=friendly, 5=final)

IMPORTANT:
- Be respectful and professional
- Do NOT make threats
- Do NOT use excessive capitalization
- Follow FDCPA guidelines
- If they hang up, do NOT call back immediately
- If they request cease and desist, honor it immediately
- If they promise payment, confirm the date and method
- Record any payment promises for follow-up
- Keep the conversation to 2-3 minutes maximum`;
  }

  /**
   * Parse call webhook data
   */
  parseCallWebhook(webhookData) {
    try {
      return {
        call_id: webhookData.id,
        status: webhookData.status,
        phoneNumber: webhookData.phoneNumber,
        duration: webhookData.duration,
        startedAt: webhookData.startedAt,
        endedAt: webhookData.endedAt,
        recordingUrl: webhookData.recordingUrl,
        transcript: webhookData.transcript,
        summary: webhookData.summary,
        customData: webhookData.customData,
        costBreakdown: webhookData.costBreakdown,
        messages: webhookData.messages || []
      };
    } catch (error) {
      console.error('Error parsing call webhook:', error.message);
      return null;
    }
  }

  /**
   * Extract call outcome from transcript
   */
  extractCallOutcome(transcript) {
    if (!transcript) return { outcome: 'unknown' };

    const lowerTranscript = transcript.toLowerCase();

    // Check for payment commitment
    if (lowerTranscript.includes('yes') || lowerTranscript.includes('i will pay') ||
        lowerTranscript.includes('i can pay') || lowerTranscript.includes('you will receive')) {
      return {
        outcome: 'promised_payment',
        confidence: 0.8
      };
    }

    // Check for refusal
    if (lowerTranscript.includes("don't owe") || lowerTranscript.includes('i didnt') ||
        lowerTranscript.includes('not my bill') || lowerTranscript.includes('dispute')) {
      return {
        outcome: 'dispute',
        confidence: 0.7
      };
    }

    // Check for disconnection/abrupt end
    if (lowerTranscript.length < 50) {
      return {
        outcome: 'no_contact',
        confidence: 0.6
      };
    }

    // Check for promise of call back
    if (lowerTranscript.includes('call back') || lowerTranscript.includes('later')) {
      return {
        outcome: 'call_back_promised',
        confidence: 0.6
      };
    }

    return {
      outcome: 'inconclusive',
      confidence: 0.5
    };
  }

  /**
   * Helper: Validate phone number
   */
  _isValidPhoneNumber(phone) {
    if (!phone) return false;
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }

  /**
   * Helper: Format phone number for Vapi (E.164)
   */
  _formatPhoneNumber(phone) {
    if (!phone) return null;

    let digitsOnly = phone.replace(/\D/g, '');

    if (digitsOnly.startsWith('1')) {
      return `+${digitsOnly}`;
    }

    if (digitsOnly.length === 10) {
      return `+1${digitsOnly}`;
    }

    return `+${digitsOnly}`;
  }

  /**
   * Generate voice call summary for invoice
   */
  generateCallSummary(callData) {
    return {
      call_id: callData.call_id,
      invoice_id: callData.customData?.invoice_id,
      debtor_phone: callData.phoneNumber,
      duration_seconds: callData.duration,
      status: callData.status,
      recording_available: !!callData.recordingUrl,
      transcript_available: !!callData.transcript,
      outcome: this.extractCallOutcome(callData.transcript),
      started_at: callData.startedAt,
      ended_at: callData.endedAt,
      summary: callData.summary,
      cost: callData.costBreakdown?.total || 0
    };
  }
}

module.exports = new VapiCallerService();
