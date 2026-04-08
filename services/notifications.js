const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

/**
 * Notification service for alerting business owner of important events
 */
class NotificationsService {
  constructor() {
    this.businessEmail = process.env.BUSINESS_EMAIL;
    this.businessPhone = process.env.BUSINESS_PHONE;
    this.notificationQueue = [];
  }

  /**
   * Queue notification
   */
  queueNotification(type, data) {
    const notification = {
      id: uuidv4(),
      type,
      data,
      created_at: moment().toISOString(),
      sent: false,
      retry_count: 0
    };

    this.notificationQueue.push(notification);
    return notification;
  }

  /**
   * Create payment received notification
   */
  createPaymentNotification(invoice, payment, paymentHistory) {
    return {
      type: 'payment_received',
      priority: 'high',
      title: `Payment Received: ${invoice.invoice_number}`,
      message: `Payment of $${payment.amount.toFixed(2)} received for invoice #${invoice.invoice_number} from ${invoice.debtor_name}.`,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        debtor_email: invoice.debtor_email,
        payment_amount: payment.amount,
        remaining_balance: invoice.amount,
        payment_method: payment.method,
        fully_paid: invoice.amount <= 0,
        total_paid: paymentHistory.reduce((sum, p) => sum + p.amount, 0)
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Create escalation notification
   */
  createEscalationNotification(invoice, reason) {
    return {
      type: 'escalation',
      priority: 'critical',
      title: `Invoice Escalated: ${invoice.invoice_number}`,
      message: `Invoice #${invoice.invoice_number} for $${invoice.amount.toFixed(2)} from ${invoice.debtor_name} has been escalated. Reason: ${reason}. Days overdue: ${invoice.days_overdue}.`,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        debtor_email: invoice.debtor_email,
        amount: invoice.amount,
        days_overdue: invoice.days_overdue,
        urgency: invoice.urgency,
        reason
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Create promised payment notification
   */
  createPromiseNotification(invoice, promiseDate) {
    const daysUntilPromise = moment(promiseDate).diff(moment(), 'days');

    return {
      type: 'payment_promised',
      priority: daysUntilPromise <= 3 ? 'high' : 'medium',
      title: `Payment Promised: ${invoice.invoice_number}`,
      message: `Debtor promised payment for invoice #${invoice.invoice_number} ($${invoice.amount.toFixed(2)}) by ${moment(promiseDate).format('YYYY-MM-DD')}.`,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        debtor_email: invoice.debtor_email,
        amount: invoice.amount,
        promised_date: promiseDate,
        days_until: daysUntilPromise
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      },
      reminders: [
        { days_before: 1 },
        { days_before: 0, at_hour: 14 }
      ]
    };
  }

  /**
   * Create overdue promised payment notification
   */
  createOverduePromiseNotification(invoice, promiseDate) {
    const daysSincePromise = moment().diff(moment(promiseDate), 'days');

    return {
      type: 'promised_payment_overdue',
      priority: 'high',
      title: `Promised Payment Overdue: ${invoice.invoice_number}`,
      message: `Payment promised on ${moment(promiseDate).format('YYYY-MM-DD')} for invoice #${invoice.invoice_number} has not been received. Now ${daysSincePromise} days overdue.`,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        debtor_email: invoice.debtor_email,
        amount: invoice.amount,
        promised_date: promiseDate,
        days_overdue_promise: daysSincePromise
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Create written off notification
   */
  createWriteOffNotification(invoice, reason) {
    return {
      type: 'written_off',
      priority: 'medium',
      title: `Invoice Written Off: ${invoice.invoice_number}`,
      message: `Invoice #${invoice.invoice_number} for $${invoice.original_amount.toFixed(2)} from ${invoice.debtor_name} has been written off. Reason: ${reason}`,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        debtor_email: invoice.debtor_email,
        amount: invoice.original_amount,
        days_overdue: invoice.days_overdue,
        reason
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Create daily summary notification
   */
  createDailySummaryNotification(stats) {
    return {
      type: 'daily_summary',
      priority: 'low',
      title: 'Daily Recovery Summary',
      message: `Daily summary: ${stats.payments_today} payments received ($${stats.payments_amount.toFixed(2)}), ${stats.new_contacts} new contacts, ${stats.promised_payments} promised payments.`,
      data: stats,
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Create recovery milestone notification
   */
  createMilestoneNotification(milestone, recoveryStats) {
    let title, message;

    switch (milestone) {
      case 'recovery_rate_50':
        title = 'Recovery Milestone: 50% Recovery Rate Achieved';
        message = 'Congratulations! Your recovery rate has reached 50%.';
        break;
      case 'recovery_rate_75':
        title = 'Recovery Milestone: 75% Recovery Rate Achieved';
        message = 'Excellent! Your recovery rate has reached 75%.';
        break;
      case 'first_payment':
        title = 'First Payment Received';
        message = 'Your first invoice payment has been received!';
        break;
      case 'recovery_amount_10000':
        title = 'Recovery Milestone: $10,000 Recovered';
        message = 'You have recovered $10,000 in accounts receivable.';
        break;
      case 'recovery_amount_50000':
        title = 'Recovery Milestone: $50,000 Recovered';
        message = 'You have recovered $50,000 in accounts receivable.';
        break;
      default:
        title = 'Recovery Milestone';
        message = `Milestone reached: ${milestone}`;
    }

    return {
      type: 'milestone',
      priority: 'high',
      title,
      message,
      data: {
        milestone,
        stats: recoveryStats
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Create failed outreach notification
   */
  createFailedOutreachNotification(invoice, channel, error) {
    return {
      type: 'failed_outreach',
      priority: 'medium',
      title: `Failed Outreach: ${invoice.invoice_number}`,
      message: `Failed to send ${channel} for invoice #${invoice.invoice_number}. Error: ${error}`,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        debtor_name: invoice.debtor_name,
        channel,
        error
      },
      recipients: {
        email: this.businessEmail,
        phone: this.businessPhone
      }
    };
  }

  /**
   * Format notification for email
   */
  formatEmailNotification(notification) {
    const { type, title, message, data, priority } = notification;

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${this._getPriorityColor(priority)}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
    .footer { color: #666; font-size: 12px; margin-top: 20px; }
    .badge { display: inline-block; background-color: ${this._getPriorityColor(priority)}; color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${title}</h2>
    </div>
    <div class="content">
      <div class="badge">${priority.toUpperCase()} - ${type.replace(/_/g, ' ').toUpperCase()}</div>
      <p>${message}</p>
      ${this._formatDataTable(data)}
      <div class="footer">
        <p>RecoverAI Notification - ${moment().format('YYYY-MM-DD HH:mm:ss')}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Format notification for SMS
   */
  formatSMSNotification(notification) {
    const { title, message } = notification;
    return `[RecoverAI] ${title}: ${message}`.substring(0, 160);
  }

  /**
   * Helper: Get color for priority level
   */
  _getPriorityColor(priority) {
    switch (priority) {
      case 'critical':
        return '#d32f2f';
      case 'high':
        return '#f57c00';
      case 'medium':
        return '#fbc02d';
      case 'low':
        return '#388e3c';
      default:
        return '#1976d2';
    }
  }

  /**
   * Helper: Format data as table
   */
  _formatDataTable(data) {
    if (!data || Object.keys(data).length === 0) {
      return '';
    }

    let html = '<table style="width: 100%; border-collapse: collapse; margin: 15px 0;">';

    Object.entries(data).forEach(([key, value]) => {
      const displayKey = key.replace(/_/g, ' ').toUpperCase();
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      html += `
<tr style="border-bottom: 1px solid #ddd;">
  <td style="padding: 8px; font-weight: bold; width: 40%;">${displayKey}</td>
  <td style="padding: 8px;">${displayValue}</td>
</tr>
      `;
    });

    html += '</table>';
    return html;
  }

  /**
   * Get unprocessed notifications
   */
  getUnprocessedNotifications() {
    return this.notificationQueue.filter(n => !n.sent);
  }

  /**
   * Mark notification as sent
   */
  markAsSent(notificationId) {
    const notification = this.notificationQueue.find(n => n.id === notificationId);
    if (notification) {
      notification.sent = true;
      notification.sent_at = moment().toISOString();
    }
    return notification;
  }

  /**
   * Clear sent notifications
   */
  clearSentNotifications() {
    this.notificationQueue = this.notificationQueue.filter(n => !n.sent);
  }
}

module.exports = new NotificationsService();
