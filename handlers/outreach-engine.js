const invoiceStore = require('../data/invoice-store');
const claudeAI = require('../services/claude-ai');
const brevoEmail = require('../services/brevo-email');
const smsSender = require('../services/sms-sender');
const vapiCaller = require('../services/vapi-caller');
const compliance = require('../config/compliance');
const sequences = require('../config/sequences');
const notifications = require('../services/notifications');
const moment = require('moment');

/**
 * Outreach engine - orchestrates multi-channel collection outreach
 */
class OutreachEngine {
  /**
   * Execute outreach for all due invoices
   */
  async executeOutreach() {
    const invoices = invoiceStore.getInvoicesDueForOutreach();
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    for (const invoice of invoices) {
      try {
        const result = await this.executeOutreachForInvoice(invoice);
        results.details.push(result);

        if (result.success) {
          results.successful += 1;
        } else {
          results.failed += 1;
        }
        results.processed += 1;
      } catch (error) {
        results.details.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          success: false,
          error: error.message
        });
        results.failed += 1;
        results.processed += 1;
      }
    }

    return results;
  }

  /**
   * Execute outreach for a specific invoice
   */
  async executeOutreachForInvoice(invoice) {
    try {
      const activityLog = invoiceStore.getActivityLog(invoice.id);
      const sequence = sequences.getSequenceForInvoice(invoice);
      const nextAction = sequences.getNextAction(invoice);

      if (nextAction.channel === 'escalate') {
        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          success: false,
          reason: 'All outreach actions completed - escalate to legal'
        };
      }

      // Check compliance
      const complianceAudit = compliance.getComplianceAudit(invoice, activityLog);
      if (!complianceAudit.compliant) {
        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          success: false,
          reason: 'Compliance violation',
          violations: complianceAudit.checks
        };
      }

      // Check if contact time is allowed
      if (nextAction.channel === 'voice') {
        const timeCheck = compliance.isContactTimeAllowed(invoice.debtor_phone, 'call');
        if (!timeCheck.compliant) {
          return {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            success: false,
            reason: timeCheck.reason,
            retry_at: compliance.getNextCompliantContactTime()
          };
        }
      }

      // Execute the outreach
      const outreachResult = await this._executeOutreachChannel(
        invoice,
        nextAction.channel,
        nextAction.tone
      );

      if (outreachResult.success) {
        // Record the outreach attempt
        invoiceStore.recordOutreach(invoice.id, nextAction.channel, {
          tone_level: nextAction.tone,
          message_id: outreachResult.message_id,
          status: 'sent',
          error: null
        });

        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          success: true,
          channel: nextAction.channel,
          tone: nextAction.tone,
          message_id: outreachResult.message_id
        };
      } else {
        // Record failed attempt
        invoiceStore.recordOutreach(invoice.id, nextAction.channel, {
          tone_level: nextAction.tone,
          message_id: null,
          status: 'failed',
          error: outreachResult.error
        });

        // Create notification for failed outreach
        const notification = notifications.createFailedOutreachNotification(
          invoice,
          nextAction.channel,
          outreachResult.error
        );
        notifications.queueNotification(notification.type, notification);

        return {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          success: false,
          channel: nextAction.channel,
          error: outreachResult.error
        };
      }
    } catch (error) {
      return {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute outreach through a specific channel
   */
  async _executeOutreachChannel(invoice, channel, toneLevel) {
    try {
      if (channel === 'email') {
        return await this._sendEmail(invoice, toneLevel);
      } else if (channel === 'sms') {
        return await this._sendSMS(invoice, toneLevel);
      } else if (channel === 'voice') {
        return await this._initiateVoiceCall(invoice, toneLevel);
      } else if (channel === 'letter') {
        return await this._sendLetter(invoice, toneLevel);
      } else {
        return { success: false, error: `Unknown channel: ${channel}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email
   */
  async _sendEmail(invoice, toneLevel) {
    try {
      // Generate email content using Claude
      const emailContent = await claudeAI.generateEmail(invoice, toneLevel, 'en');

      // Add FDCPA disclosure if needed
      const compliance_module = require('../config/compliance');
      const disclosure = compliance_module.getRequiredDisclosures(toneLevel);

      if (toneLevel >= 3) {
        emailContent.body += `\n\n${disclosure.text}`;
      }

      // Send via Brevo
      const result = await brevoEmail.sendCollectionEmail(invoice, emailContent, toneLevel);

      if (result.success) {
        return {
          success: true,
          message_id: result.message_id
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send SMS
   */
  async _sendSMS(invoice, toneLevel) {
    try {
      // Generate SMS content
      const smsContent = await claudeAI.generateSMS(invoice, toneLevel, 'en');

      // Send via Twilio
      const result = await smsSender.sendCollectionSMS(invoice, smsContent, toneLevel);

      if (result.success) {
        return {
          success: true,
          message_id: result.message_id
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate voice call
   */
  async _initiateVoiceCall(invoice, toneLevel) {
    try {
      // Generate voice script
      const voiceScript = await claudeAI.generateVoiceScript(invoice, toneLevel, 'en');

      // Initiate call via Vapi
      const result = await vapiCaller.triggerVoiceCall(invoice, voiceScript, toneLevel);

      if (result.success) {
        return {
          success: true,
          message_id: result.call_id
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send formal letter
   */
  async _sendLetter(invoice, toneLevel) {
    try {
      // Generate letter content
      const letterContent = await claudeAI.generateLetter(invoice, toneLevel, 'en');

      // In production, would integrate with printing/mailing service
      // For now, store the letter for manual processing
      invoiceStore.logActivity(invoice.id, 'letter_generated', {
        tone_level: toneLevel,
        content: letterContent,
        status: 'pending_manual_processing'
      });

      return {
        success: true,
        message_id: `letter_${invoice.id}_${Date.now()}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute manual action on invoice
   */
  async executeManualAction(invoiceId, actionType, actionData) {
    const invoice = invoiceStore.getInvoice(invoiceId);
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    try {
      if (actionType === 'mark_paid') {
        const payment = {
          amount: actionData.amount || invoice.amount,
          method: actionData.method || 'manual'
        };
        const result = invoiceStore.recordPayment(invoiceId, payment.amount, payment.method);

        // Create notification
        const paymentHistory = invoiceStore.getPaymentHistory(invoiceId);
        const notification = notifications.createPaymentNotification(result.invoice, result.payment, paymentHistory);
        notifications.queueNotification(notification.type, notification);

        return {
          success: true,
          action: 'mark_paid',
          invoice: result.invoice
        };
      } else if (actionType === 'write_off') {
        invoiceStore.writeOff(invoiceId, actionData.reason || 'Manual write-off');

        const notification = notifications.createWriteOffNotification(invoice, actionData.reason || 'Manual write-off');
        notifications.queueNotification(notification.type, notification);

        return {
          success: true,
          action: 'write_off',
          invoice: invoiceStore.getInvoice(invoiceId)
        };
      } else if (actionType === 'escalate') {
        invoiceStore.escalateInvoice(invoiceId, actionData.reason || 'Manual escalation');

        const notification = notifications.createEscalationNotification(invoice, actionData.reason || 'Manual escalation');
        notifications.queueNotification(notification.type, notification);

        return {
          success: true,
          action: 'escalate',
          invoice: invoiceStore.getInvoice(invoiceId)
        };
      } else if (actionType === 'set_promise') {
        invoiceStore.setPromisedPaymentDate(invoiceId, actionData.promised_date, actionData.notes || '');

        const notification = notifications.createPromiseNotification(invoice, actionData.promised_date);
        notifications.queueNotification(notification.type, notification);

        return {
          success: true,
          action: 'set_promise',
          invoice: invoiceStore.getInvoice(invoiceId)
        };
      } else if (actionType === 'record_payment') {
        const result = invoiceStore.recordPayment(
          invoiceId,
          actionData.amount,
          actionData.method || 'other',
          actionData.reference || ''
        );

        const paymentHistory = invoiceStore.getPaymentHistory(invoiceId);
        const notification = notifications.createPaymentNotification(result.invoice, result.payment, paymentHistory);
        notifications.queueNotification(notification.type, notification);

        return {
          success: true,
          action: 'record_payment',
          invoice: result.invoice
        };
      } else {
        return { success: false, error: 'Unknown action type' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get next scheduled outreach
   */
  getNextScheduledOutreach() {
    const invoices = invoiceStore.getInvoicesDueForOutreach();
    const nextOutreach = [];

    for (const invoice of invoices.slice(0, 10)) {
      const activityLog = invoiceStore.getActivityLog(invoice.id);
      const nextAction = sequences.getNextAction(invoice);

      nextOutreach.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        amount: invoice.amount,
        next_action: nextAction.channel,
        tone: nextAction.tone,
        urgency: invoice.urgency,
        days_overdue: invoice.days_overdue
      });
    }

    return nextOutreach;
  }
}

module.exports = new OutreachEngine();
