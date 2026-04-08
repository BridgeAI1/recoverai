const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const compliance = require('../config/compliance');

/**
 * Brevo (formerly Sendinblue) email integration
 */
class BrevoEmailService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.baseUrl = 'https://api.brevo.com/v3';
    this.listId = parseInt(process.env.BREVO_LIST_ID) || 9;
  }

  /**
   * Send collection email
   */
  async sendCollectionEmail(invoice, emailContent, tone) {
    try {
      if (!this.apiKey) {
        throw new Error('BREVO_API_KEY is not set');
      }

      // Validate compliance
      const complianceCheck = compliance.validateEmailCompliance({
        subject: emailContent.subject,
        body: emailContent.body,
        tone
      });

      if (!complianceCheck.compliant) {
        throw new Error(`Compliance violation: ${complianceCheck.violations.join(', ')}`);
      }

      const clientConfig = require('../config/clients').getClient();
      const fromEmail = clientConfig.email_settings.from_email;
      const fromName = clientConfig.email_settings.from_name;

      const payload = {
        to: [
          {
            email: invoice.debtor_email,
            name: invoice.debtor_name
          }
        ],
        sender: {
          email: fromEmail,
          name: fromName
        },
        subject: emailContent.subject,
        htmlContent: this._formatEmailBody(emailContent.body, emailContent.cta, invoice),
        replyTo: {
          email: clientConfig.email_settings.reply_to
        },
        tags: ['collection', `tone_${tone}`, `urgency_${invoice.urgency}`],
        params: {
          DEBTOR_NAME: invoice.debtor_name,
          INVOICE_NUMBER: invoice.invoice_number,
          AMOUNT: invoice.amount.toFixed(2),
          DUE_DATE: invoice.due_date,
          DAYS_OVERDUE: invoice.days_overdue,
          BUSINESS_NAME: invoice.business_name,
          BUSINESS_EMAIL: process.env.BUSINESS_EMAIL,
          BUSINESS_PHONE: process.env.BUSINESS_PHONE
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/smtp/email`,
        payload,
        {
          headers: {
            'api-key': this.apiKey,
            'content-type': 'application/json'
          }
        }
      );

      return {
        success: true,
        message_id: response.data.messageId,
        email: invoice.debtor_email,
        sent_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error sending email via Brevo:', error.message);
      return {
        success: false,
        error: error.message,
        email: invoice.debtor_email
      };
    }
  }

  /**
   * Add contact to list
   */
  async addContactToList(invoice, listId = null) {
    try {
      if (!this.apiKey) {
        throw new Error('BREVO_API_KEY is not set');
      }

      const list = listId || this.listId;

      const payload = {
        email: invoice.debtor_email,
        attributes: {
          FNAME: invoice.debtor_name.split(' ')[0],
          LNAME: invoice.debtor_name.split(' ').slice(1).join(' '),
          PHONE: invoice.debtor_phone,
          AMOUNT: invoice.amount,
          INVOICE_NUM: invoice.invoice_number,
          DAYS_OVERDUE: invoice.days_overdue,
          BUSINESS: invoice.business_name
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/contacts`,
        payload,
        {
          headers: {
            'api-key': this.apiKey,
            'content-type': 'application/json'
          }
        }
      );

      // Add to list
      await axios.post(
        `${this.baseUrl}/contacts/lists/${list}/contacts/add`,
        { emails: [invoice.debtor_email] },
        {
          headers: {
            'api-key': this.apiKey,
            'content-type': 'application/json'
          }
        }
      );

      return {
        success: true,
        contact_id: response.data.id,
        email: invoice.debtor_email
      };
    } catch (error) {
      // 409 means contact already exists, which is fine
      if (error.response?.status === 409) {
        return {
          success: true,
          email: invoice.debtor_email,
          already_exists: true
        };
      }
      console.error('Error adding contact to Brevo:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update contact status
   */
  async updateContactStatus(email, attributes) {
    try {
      if (!this.apiKey) {
        throw new Error('BREVO_API_KEY is not set');
      }

      const response = await axios.put(
        `${this.baseUrl}/contacts/${email}`,
        { attributes },
        {
          headers: {
            'api-key': this.apiKey,
            'content-type': 'application/json'
          }
        }
      );

      return { success: true, email };
    } catch (error) {
      console.error('Error updating contact in Brevo:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get contact info
   */
  async getContact(email) {
    try {
      if (!this.apiKey) {
        throw new Error('BREVO_API_KEY is not set');
      }

      const response = await axios.get(
        `${this.baseUrl}/contacts/${email}`,
        {
          headers: {
            'api-key': this.apiKey
          }
        }
      );

      return {
        success: true,
        contact: response.data
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Contact not found'
        };
      }
      console.error('Error getting contact from Brevo:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send batch emails
   */
  async sendBatchEmails(invoices, emailContents) {
    const results = [];

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const emailContent = emailContents[i];

      const result = await this.sendCollectionEmail(invoice, emailContent, 2);
      results.push({
        invoice_id: invoice.id,
        ...result
      });

      // Rate limiting: wait between emails
      if (i < invoices.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Format email body as HTML
   */
  _formatEmailBody(text, cta, invoice) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .content { margin-bottom: 20px; }
    .invoice-details { background-color: #f9f9f9; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0; }
    .cta-button { display: inline-block; background-color: #d32f2f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Collections Notice</h2>
    </div>

    <div class="content">
      ${text.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
    </div>

    <div class="invoice-details">
      <strong>Invoice Details:</strong><br>
      Invoice #: ${invoice.invoice_number}<br>
      Amount Due: $${invoice.amount.toFixed(2)}<br>
      Due Date: ${invoice.due_date}<br>
      Days Overdue: ${invoice.days_overdue}
    </div>

    ${cta ? `<p><strong>${cta}</strong></p>` : ''}

    <div class="footer">
      <p>This is an attempt to collect a debt. Any information obtained will be used for that purpose.</p>
      <p>
        ${process.env.BUSINESS_NAME || 'BridgeAI'}<br>
        ${process.env.BUSINESS_EMAIL || 'collections@bridgeaihq.com'}<br>
        ${process.env.BUSINESS_PHONE || '+1-XXX-XXX-XXXX'}
      </p>
    </div>
  </div>
</body>
</html>
    `;

    return html;
  }
}

module.exports = new BrevoEmailService();
