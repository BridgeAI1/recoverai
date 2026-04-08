const invoiceStore = require('../data/invoice-store');
const vapiCaller = require('../services/vapi-caller');
const claudeAI = require('../services/claude-ai');
const notifications = require('../services/notifications');
const moment = require('moment');

/**
 * Handle Vapi webhook callbacks for voice calls
 */
class VapiWebhookHandler {
  /**
   * Process call webhook
   */
  async processCallWebhook(webhookData) {
    try {
      // Parse webhook data
      const callData = vapiCaller.parseCallWebhook(webhookData);

      if (!callData) {
        return { success: false, error: 'Failed to parse webhook data' };
      }

      // Get invoice from custom data
      const invoiceId = callData.customData?.invoice_id;
      if (!invoiceId) {
        console.warn('No invoice_id in webhook data');
        return { success: false, error: 'No invoice_id found' };
      }

      const invoice = invoiceStore.getInvoice(invoiceId);
      if (!invoice) {
        return { success: false, error: `Invoice ${invoiceId} not found` };
      }

      // Process the call result
      const result = await this._processCallResult(invoice, callData);

      return result;
    } catch (error) {
      console.error('Error processing Vapi webhook:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process call result and update invoice
   */
  async _processCallResult(invoice, callData) {
    try {
      // Extract call outcome from transcript
      const outcome = vapiCaller.extractCallOutcome(callData.transcript);

      // Log the call activity
      invoiceStore.logActivity(invoice.id, 'voice_call_completed', {
        call_id: callData.call_id,
        duration: callData.duration,
        status: callData.status,
        outcome: outcome.outcome,
        transcript_available: !!callData.transcript,
        recording_available: !!callData.recordingUrl
      });

      // Process based on outcome
      if (outcome.outcome === 'promised_payment') {
        return await this._handlePaymentPromise(invoice, callData);
      } else if (outcome.outcome === 'dispute') {
        return await this._handleDispute(invoice, callData);
      } else if (outcome.outcome === 'call_back_promised') {
        return await this._handleCallBackPromise(invoice, callData);
      } else if (outcome.outcome === 'no_contact') {
        return await this._handleNoContact(invoice, callData);
      } else {
        return await this._handleInconclusiveCall(invoice, callData);
      }
    } catch (error) {
      console.error('Error processing call result:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle payment promise from call
   */
  async _handlePaymentPromise(invoice, callData) {
    try {
      // Try to extract payment details from transcript
      const promiseDetails = await claudeAI.extractPaymentPromise(callData.transcript, 'en');

      // Update invoice status
      invoiceStore.updateInvoiceStatus(invoice.id, 'promised', 'Payment promised during call');

      // Set promised payment date if provided
      if (promiseDetails.promised_date) {
        invoiceStore.setPromisedPaymentDate(invoice.id, promiseDetails.promised_date);
      }

      // Create notification
      const promiseDate = promiseDetails.promised_date || moment().add(3, 'days').format('YYYY-MM-DD');
      const notification = notifications.createPromiseNotification(invoice, promiseDate);
      notifications.queueNotification(notification.type, notification);

      return {
        success: true,
        action: 'payment_promised',
        invoice_id: invoice.id,
        promised_date: promiseDate,
        confidence: promiseDetails.confidence
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle dispute claim
   */
  async _handleDispute(invoice, callData) {
    try {
      // Analyze objections from call
      const objectionAnalysis = await claudeAI.detectObjections(callData.transcript, 'en');

      // Update invoice status
      invoiceStore.updateInvoiceStatus(invoice.id, 'escalated', `Dispute claimed: ${objectionAnalysis.primary_objection}`);

      // Log objections
      invoiceStore.logActivity(invoice.id, 'dispute_claimed', {
        objections: objectionAnalysis.objections,
        primary_objection: objectionAnalysis.primary_objection,
        severity: objectionAnalysis.severity,
        suggested_response: objectionAnalysis.suggested_response
      });

      // Create escalation notification
      const notification = notifications.createEscalationNotification(
        invoice,
        `Dispute: ${objectionAnalysis.primary_objection}`
      );
      notifications.queueNotification(notification.type, notification);

      return {
        success: true,
        action: 'dispute_claimed',
        invoice_id: invoice.id,
        primary_objection: objectionAnalysis.primary_objection,
        severity: objectionAnalysis.severity,
        suggested_response: objectionAnalysis.suggested_response
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle callback promise
   */
  async _handleCallBackPromise(invoice, callData) {
    try {
      // Extract callback details from transcript
      const callbackAnalysis = await claudeAI.extractPaymentPromise(callData.transcript, 'en');

      // Update invoice status
      invoiceStore.updateInvoiceStatus(invoice.id, 'promised', 'Callback promised');

      // Set callback date (default to 3 days)
      const callbackDate = callbackAnalysis.promised_date || moment().add(3, 'days').format('YYYY-MM-DD');
      invoiceStore.setPromisedPaymentDate(invoice.id, callbackDate);

      // Log callback promise
      invoiceStore.logActivity(invoice.id, 'callback_promised', {
        callback_date: callbackDate
      });

      return {
        success: true,
        action: 'callback_promised',
        invoice_id: invoice.id,
        callback_date: callbackDate
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle no contact (disconnection)
   */
  async _handleNoContact(invoice, callData) {
    try {
      // Update invoice - keep status as is, just log attempt
      invoiceStore.logActivity(invoice.id, 'call_no_contact', {
        reason: 'Call ended abruptly or no meaningful conversation'
      });

      return {
        success: true,
        action: 'no_contact',
        invoice_id: invoice.id,
        retry_needed: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle inconclusive call
   */
  async _handleInconclusiveCall(invoice, callData) {
    try {
      // Log the call
      invoiceStore.logActivity(invoice.id, 'call_inconclusive', {
        transcript: callData.transcript ? callData.transcript.substring(0, 200) : null
      });

      // Update invoice status to contacted
      if (invoice.status === 'pending') {
        invoiceStore.updateInvoiceStatus(invoice.id, 'contacted', 'Voice call completed');
      }

      return {
        success: true,
        action: 'inconclusive',
        invoice_id: invoice.id,
        requires_manual_review: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get summary of call results
   */
  generateCallSummary(callData) {
    const summary = vapiCaller.generateCallSummary(callData);

    return {
      ...summary,
      formatted_duration: this._formatDuration(callData.duration),
      cost_display: `$${(callData.costBreakdown?.total || 0).toFixed(4)}`
    };
  }

  /**
   * Helper: Format duration in seconds to readable string
   */
  _formatDuration(seconds) {
    if (!seconds) return '0s';

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }
}

module.exports = new VapiWebhookHandler();
