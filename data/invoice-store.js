const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

/**
 * In-memory invoice store with persistence hooks
 * In production, this would connect to a real database
 */
class InvoiceStore {
  constructor() {
    this.invoices = new Map();
    this.activities = new Map(); // invoice_id -> array of activities
    this.paymentHistory = new Map(); // invoice_id -> array of payments
  }

  /**
   * Create or import a new invoice
   */
  createInvoice(data) {
    const invoice = {
      id: uuidv4(),
      debtor_name: data.debtor_name,
      debtor_email: data.debtor_email,
      debtor_phone: data.debtor_phone,
      amount: parseFloat(data.amount),
      original_amount: parseFloat(data.amount),
      due_date: data.due_date,
      invoice_number: data.invoice_number,
      days_overdue: parseInt(data.days_overdue) || 0,
      business_name: data.business_name || process.env.BUSINESS_NAME,
      status: 'pending', // pending, contacted, promised, partial_payment, paid, escalated, written_off
      urgency: this._calculateUrgency(data.days_overdue),
      created_at: moment().toISOString(),
      last_contact_at: null,
      promised_payment_date: null,
      payment_received_at: null,
      outreach_count: 0,
      last_tone_level: 1, // 1-5: friendly to final
      assigned_to: null,
      notes: data.notes || '',
      custom_fields: data.custom_fields || {}
    };

    this.invoices.set(invoice.id, invoice);
    this.activities.set(invoice.id, []);
    this.paymentHistory.set(invoice.id, []);

    this.logActivity(invoice.id, 'invoice_created', {
      amount: invoice.amount,
      days_overdue: invoice.days_overdue,
      urgency: invoice.urgency
    });

    return invoice;
  }

  /**
   * Get invoice by ID
   */
  getInvoice(invoiceId) {
    return this.invoices.get(invoiceId);
  }

  /**
   * Get all invoices with optional filtering
   */
  getAllInvoices(filter = {}) {
    let results = Array.from(this.invoices.values());

    if (filter.status) {
      results = results.filter(inv => inv.status === filter.status);
    }

    if (filter.urgency) {
      results = results.filter(inv => inv.urgency === filter.urgency);
    }

    if (filter.debtor_email) {
      results = results.filter(inv => inv.debtor_email === filter.debtor_email);
    }

    if (filter.days_overdue_min) {
      results = results.filter(inv => inv.days_overdue >= filter.days_overdue_min);
    }

    if (filter.days_overdue_max) {
      results = results.filter(inv => inv.days_overdue <= filter.days_overdue_max);
    }

    return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Update invoice status
   */
  updateInvoiceStatus(invoiceId, status, reason = '') {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return null;

    const oldStatus = invoice.status;
    invoice.status = status;

    if (status === 'paid') {
      invoice.payment_received_at = moment().toISOString();
    }

    this.logActivity(invoiceId, 'status_changed', {
      from: oldStatus,
      to: status,
      reason
    });

    return invoice;
  }

  /**
   * Record outreach attempt
   */
  recordOutreach(invoiceId, channel, details) {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return null;

    invoice.outreach_count += 1;
    invoice.last_contact_at = moment().toISOString();
    invoice.last_tone_level = details.tone_level || invoice.last_tone_level;

    this.logActivity(invoiceId, 'outreach', {
      channel, // email, sms, voice, letter
      tone_level: details.tone_level,
      message_id: details.message_id,
      status: details.status,
      error: details.error
    });

    return invoice;
  }

  /**
   * Record payment received
   */
  recordPayment(invoiceId, amount, method = 'unknown', reference = '') {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return null;

    const payment = {
      id: uuidv4(),
      invoice_id: invoiceId,
      amount: parseFloat(amount),
      method, // check, wire, credit_card, ach, cash, other
      reference,
      received_at: moment().toISOString()
    };

    this.paymentHistory.get(invoiceId).push(payment);

    invoice.amount -= payment.amount;
    invoice.last_contact_at = moment().toISOString();

    if (invoice.amount <= 0) {
      invoice.status = 'paid';
      invoice.payment_received_at = moment().toISOString();
    } else if (invoice.amount < invoice.original_amount) {
      invoice.status = 'partial_payment';
    }

    this.logActivity(invoiceId, 'payment_received', {
      amount: payment.amount,
      remaining_balance: Math.max(0, invoice.amount),
      method,
      reference
    });

    return { invoice, payment };
  }

  /**
   * Set promised payment date
   */
  setPromisedPaymentDate(invoiceId, promiseDate, notes = '') {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return null;

    invoice.promised_payment_date = promiseDate;
    invoice.status = 'promised';

    this.logActivity(invoiceId, 'promise_recorded', {
      promised_date: promiseDate,
      notes
    });

    return invoice;
  }

  /**
   * Write off invoice
   */
  writeOff(invoiceId, reason) {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return null;

    invoice.status = 'written_off';

    this.logActivity(invoiceId, 'written_off', {
      reason,
      amount: invoice.original_amount
    });

    return invoice;
  }

  /**
   * Escalate invoice
   */
  escalateInvoice(invoiceId, reason) {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return null;

    if (invoice.last_tone_level < 5) {
      invoice.last_tone_level += 1;
    }

    invoice.status = 'escalated';

    this.logActivity(invoiceId, 'escalated', {
      new_tone_level: invoice.last_tone_level,
      reason
    });

    return invoice;
  }

  /**
   * Log activity for an invoice
   */
  logActivity(invoiceId, eventType, details = {}) {
    if (!this.activities.has(invoiceId)) {
      this.activities.set(invoiceId, []);
    }

    const activity = {
      id: uuidv4(),
      invoice_id: invoiceId,
      event_type: eventType,
      details,
      timestamp: moment().toISOString()
    };

    this.activities.get(invoiceId).push(activity);
    return activity;
  }

  /**
   * Get activity log for invoice
   */
  getActivityLog(invoiceId) {
    return this.activities.get(invoiceId) || [];
  }

  /**
   * Get payment history for invoice
   */
  getPaymentHistory(invoiceId) {
    return this.paymentHistory.get(invoiceId) || [];
  }

  /**
   * Get invoices due for outreach
   */
  getInvoicesDueForOutreach() {
    return this.getAllInvoices()
      .filter(inv => {
        // Only outreach pending, contacted, and promised statuses
        if (!['pending', 'contacted', 'promised'].includes(inv.status)) {
          return false;
        }

        // Only if overdue
        if (inv.days_overdue < 1) {
          return false;
        }

        return true;
      });
  }

  /**
   * Calculate urgency level based on days overdue
   */
  _calculateUrgency(daysOverdue) {
    const days = parseInt(daysOverdue) || 0;
    if (days <= 30) return 'fresh';
    if (days <= 60) return 'aging';
    if (days <= 90) return 'critical';
    return 'severe';
  }

  /**
   * Get recovery statistics
   */
  getStats() {
    const invoices = Array.from(this.invoices.values());
    const totalInvoices = invoices.length;
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.original_amount, 0);
    const recoveredAmount = invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.original_amount, 0) +
      invoices.reduce((sum, inv) => sum + (inv.original_amount - inv.amount), 0);

    const recoveredCount = invoices.filter(inv => inv.status === 'paid').length;
    const contactedCount = invoices.filter(inv => inv.outreach_count > 0).length;

    const byStatus = {};
    invoices.forEach(inv => {
      byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
    });

    const byUrgency = {};
    invoices.forEach(inv => {
      byUrgency[inv.urgency] = (byUrgency[inv.urgency] || 0) + 1;
    });

    return {
      total_invoices: totalInvoices,
      total_amount: totalAmount.toFixed(2),
      recovered_amount: recoveredAmount.toFixed(2),
      remaining_amount: (totalAmount - recoveredAmount).toFixed(2),
      recovery_rate: totalInvoices > 0 ? ((recoveredCount / totalInvoices) * 100).toFixed(2) : '0.00',
      recovered_count: recoveredCount,
      contacted_count: contactedCount,
      pending_count: invoices.filter(inv => inv.status === 'pending').length,
      promised_count: invoices.filter(inv => inv.status === 'promised').length,
      partial_payment_count: invoices.filter(inv => inv.status === 'partial_payment').length,
      escalated_count: invoices.filter(inv => inv.status === 'escalated').length,
      written_off_count: invoices.filter(inv => inv.status === 'written_off').length,
      by_status: byStatus,
      by_urgency: byUrgency
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear() {
    this.invoices.clear();
    this.activities.clear();
    this.paymentHistory.clear();
  }
}

module.exports = new InvoiceStore();
