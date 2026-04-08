const axios = require('axios');

/**
 * Twilio SMS integration for collection SMS messages
 */
class SMSSenderService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    this.baseUrl = 'https://api.twilio.com';
  }

  /**
   * Send collection SMS
   */
  async sendCollectionSMS(invoice, smsContent, tone) {
    try {
      if (!this.accountSid || !this.authToken) {
        throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not set');
      }

      if (!this.fromNumber) {
        throw new Error('TWILIO_PHONE_NUMBER is not set');
      }

      // Validate phone number
      if (!this._isValidPhoneNumber(invoice.debtor_phone)) {
        return {
          success: false,
          error: 'Invalid phone number',
          phone: invoice.debtor_phone
        };
      }

      // Create auth
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const payload = new URLSearchParams({
        From: this.fromNumber,
        To: invoice.debtor_phone,
        Body: smsContent.message
      });

      const response = await axios.post(
        `${this.baseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        payload,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        success: true,
        message_id: response.data.sid,
        phone: invoice.debtor_phone,
        status: response.data.status,
        sent_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error sending SMS via Twilio:', error.message);
      return {
        success: false,
        error: error.message,
        phone: invoice.debtor_phone
      };
    }
  }

  /**
   * Send batch SMS messages
   */
  async sendBatchSMS(invoices, smsContents) {
    const results = [];

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const smsContent = smsContents[i];

      const result = await this.sendCollectionSMS(invoice, smsContent, 2);
      results.push({
        invoice_id: invoice.id,
        ...result
      });

      // Rate limiting: wait between SMS
      if (i < invoices.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return results;
  }

  /**
   * Check SMS delivery status
   */
  async getSMSStatus(messageSid) {
    try {
      if (!this.accountSid || !this.authToken) {
        throw new Error('Twilio credentials not set');
      }

      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const response = await axios.get(
        `${this.baseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages/${messageSid}.json`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      return {
        success: true,
        message_id: response.data.sid,
        status: response.data.status,
        error_code: response.data.error_code,
        error_message: response.data.error_message
      };
    } catch (error) {
      console.error('Error getting SMS status:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get incoming SMS webhook and parse
   */
  async parseIncomingSMS(webhookData) {
    try {
      return {
        from: webhookData.From,
        to: webhookData.To,
        body: webhookData.Body,
        message_sid: webhookData.MessageSid,
        account_sid: webhookData.AccountSid,
        num_media: webhookData.NumMedia,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error parsing incoming SMS:', error.message);
      return null;
    }
  }

  /**
   * Build SMS content for collection
   */
  buildSMSContent(invoice, toneLevel, language = 'en') {
    const isEnglish = language === 'en';
    const daysOverdue = invoice.days_overdue;

    if (isEnglish) {
      if (toneLevel === 1) {
        return `Hi ${invoice.debtor_name}, this is a friendly reminder: Invoice #${invoice.invoice_number} for $${invoice.amount.toFixed(2)} is overdue. Please arrange payment. Reply STOP to opt out.`;
      } else if (toneLevel === 2) {
        return `URGENT: Invoice #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) is ${daysOverdue} days overdue. Immediate payment required. Contact us: ${process.env.BUSINESS_PHONE}`;
      } else if (toneLevel === 3) {
        return `FINAL NOTICE: Invoice #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) is critically overdue (${daysOverdue} days). Pay immediately or face escalation. Reply with payment confirmation.`;
      } else if (toneLevel >= 4) {
        return `FINAL: Invoice #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) past due ${daysOverdue} days. Pay by ${new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString()} or legal action will be taken.`;
      }
    } else {
      if (toneLevel === 1) {
        return `Hola ${invoice.debtor_name}, recordatorio amistoso: Factura #${invoice.invoice_number} por $${invoice.amount.toFixed(2)} está vencida. Por favor, arrange pago. Responde STOP para optar por no participar.`;
      } else if (toneLevel === 2) {
        return `URGENTE: Factura #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) está vencida hace ${daysOverdue} días. Se requiere pago inmediato. Contáctanos: ${process.env.BUSINESS_PHONE}`;
      } else if (toneLevel === 3) {
        return `AVISO FINAL: Factura #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) está críticamente vencida (${daysOverdue} días). Paga inmediatamente o enfrenta escalación.`;
      } else if (toneLevel >= 4) {
        return `FINAL: Factura #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) vencida hace ${daysOverdue} días. Paga antes de ${new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString()} o se tomarán acciones legales.`;
      }
    }

    return '';
  }

  /**
   * Helper: Validate phone number
   */
  _isValidPhoneNumber(phone) {
    if (!phone) return false;
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, '');
    // Should have 10-15 digits
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }

  /**
   * Helper: Format phone number for Twilio (E.164)
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digit characters
    let digitsOnly = phone.replace(/\D/g, '');

    // If starts with 1 (US), ensure +1
    if (digitsOnly.startsWith('1')) {
      return `+${digitsOnly}`;
    }

    // If 10 digits (US), add +1
    if (digitsOnly.length === 10) {
      return `+1${digitsOnly}`;
    }

    // Otherwise, add + and assume country code is included
    return `+${digitsOnly}`;
  }
}

module.exports = new SMSSenderService();
