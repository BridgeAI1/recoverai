const moment = require('moment');
const invoiceStore = require('./invoice-store');

/**
 * Recovery statistics and metrics
 */
class RecoveryStats {
  constructor() {
    this.dailyStats = new Map();
    this.weeklyStats = new Map();
    this.monthlyStats = new Map();
  }

  /**
   * Calculate average days to collect
   */
  getAverageDaysToCollect() {
    const paidInvoices = invoiceStore.getAllInvoices({ status: 'paid' });

    if (paidInvoices.length === 0) return 0;

    const totalDays = paidInvoices.reduce((sum, inv) => {
      const created = moment(inv.created_at);
      const paid = moment(inv.payment_received_at);
      return sum + paid.diff(created, 'days');
    }, 0);

    return (totalDays / paidInvoices.length).toFixed(1);
  }

  /**
   * Get recovery rate by urgency level
   */
  getRecoveryRateByUrgency() {
    const invoices = invoiceStore.getAllInvoices();

    const byUrgency = {
      fresh: { total: 0, recovered: 0 },
      aging: { total: 0, recovered: 0 },
      critical: { total: 0, recovered: 0 },
      severe: { total: 0, recovered: 0 }
    };

    invoices.forEach(inv => {
      if (byUrgency[inv.urgency]) {
        byUrgency[inv.urgency].total += 1;
        if (inv.status === 'paid') {
          byUrgency[inv.urgency].recovered += 1;
        }
      }
    });

    const rates = {};
    Object.keys(byUrgency).forEach(key => {
      const data = byUrgency[key];
      rates[key] = {
        total: data.total,
        recovered: data.recovered,
        rate: data.total > 0 ? ((data.recovered / data.total) * 100).toFixed(2) : '0.00'
      };
    });

    return rates;
  }

  /**
   * Get channel effectiveness
   */
  getChannelEffectiveness() {
    const invoices = invoiceStore.getAllInvoices();
    const channelStats = {
      email: { attempts: 0, conversions: 0 },
      sms: { attempts: 0, conversions: 0 },
      voice: { attempts: 0, conversions: 0 },
      letter: { attempts: 0, conversions: 0 }
    };

    invoices.forEach(inv => {
      const activities = invoiceStore.getActivityLog(inv.id);
      activities.forEach(activity => {
        if (activity.event_type === 'outreach' && activity.details.channel) {
          const channel = activity.details.channel;
          if (channelStats[channel]) {
            channelStats[channel].attempts += 1;
            // If invoice was eventually paid, count as conversion
            if (inv.status === 'paid') {
              channelStats[channel].conversions += 1;
            }
          }
        }
      });
    });

    const rates = {};
    Object.keys(channelStats).forEach(channel => {
      const stats = channelStats[channel];
      rates[channel] = {
        attempts: stats.attempts,
        conversions: stats.conversions,
        conversion_rate: stats.attempts > 0 ? ((stats.conversions / stats.attempts) * 100).toFixed(2) : '0.00'
      };
    });

    return rates;
  }

  /**
   * Get promised payments status
   */
  getPromisedPaymentsStatus() {
    const promised = invoiceStore.getAllInvoices({ status: 'promised' });

    const overdue = promised.filter(inv => {
      if (!inv.promised_payment_date) return false;
      return moment().isAfter(moment(inv.promised_payment_date));
    });

    const upComing = promised.filter(inv => {
      if (!inv.promised_payment_date) return false;
      return moment().isBefore(moment(inv.promised_payment_date));
    });

    return {
      total_promised: promised.length,
      upcoming_count: upComing.length,
      upcoming_amount: upComing.reduce((sum, inv) => sum + inv.amount, 0).toFixed(2),
      overdue_count: overdue.length,
      overdue_amount: overdue.reduce((sum, inv) => sum + inv.amount, 0).toFixed(2),
      upcoming_invoices: upComing.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        amount: inv.amount,
        debtor_name: inv.debtor_name,
        promised_date: inv.promised_payment_date
      })),
      overdue_invoices: overdue.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        amount: inv.amount,
        debtor_name: inv.debtor_name,
        promised_date: inv.promised_payment_date
      }))
    };
  }

  /**
   * Generate weekly report
   */
  generateWeeklyReport() {
    const invoices = invoiceStore.getAllInvoices();
    const weekAgo = moment().subtract(7, 'days');

    const thisWeek = invoices.filter(inv => {
      return moment(inv.created_at).isAfter(weekAgo) ||
             (inv.payment_received_at && moment(inv.payment_received_at).isAfter(weekAgo)) ||
             (inv.last_contact_at && moment(inv.last_contact_at).isAfter(weekAgo));
    });

    const newInvoices = invoices.filter(inv => moment(inv.created_at).isAfter(weekAgo));
    const paidThisWeek = invoices.filter(inv =>
      inv.payment_received_at && moment(inv.payment_received_at).isAfter(weekAgo)
    );
    const contactedThisWeek = invoices.filter(inv =>
      inv.last_contact_at && moment(inv.last_contact_at).isAfter(weekAgo)
    );

    const stats = invoiceStore.getStats();
    const avgDaysToCollect = this.getAverageDaysToCollect();
    const channelEffectiveness = this.getChannelEffectiveness();

    return {
      period: {
        start: weekAgo.toISOString(),
        end: moment().toISOString()
      },
      summary: {
        new_invoices: newInvoices.length,
        new_amount: newInvoices.reduce((sum, inv) => sum + inv.original_amount, 0).toFixed(2),
        payments_received: paidThisWeek.length,
        payments_amount: paidThisWeek.reduce((sum, inv) => sum + inv.original_amount, 0).toFixed(2),
        debtors_contacted: contactedThisWeek.length,
        outreach_attempts: contactedThisWeek.reduce((sum, inv) => sum + inv.outreach_count, 0)
      },
      current_totals: stats,
      performance: {
        recovery_rate: stats.recovery_rate,
        average_days_to_collect: avgDaysToCollect,
        channel_effectiveness: channelEffectiveness
      },
      promised_payments: this.getPromisedPaymentsStatus(),
      top_urgent_invoices: invoices
        .filter(inv => ['critical', 'severe'].includes(inv.urgency) && inv.status !== 'paid')
        .sort((a, b) => b.days_overdue - a.days_overdue)
        .slice(0, 10)
        .map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          amount: inv.amount,
          debtor_name: inv.debtor_name,
          days_overdue: inv.days_overdue,
          status: inv.status
        }))
    };
  }

  /**
   * Get outreach statistics
   */
  getOutreachStats() {
    const invoices = invoiceStore.getAllInvoices();

    const contacted = invoices.filter(inv => inv.outreach_count > 0);
    const notContacted = invoices.filter(inv => inv.outreach_count === 0);

    const avgOutreachPerInvoice = contacted.length > 0
      ? (contacted.reduce((sum, inv) => sum + inv.outreach_count, 0) / contacted.length).toFixed(2)
      : '0.00';

    const toneDistribution = {};
    [1, 2, 3, 4, 5].forEach(level => {
      toneDistribution[`level_${level}`] = invoices.filter(inv => inv.last_tone_level === level).length;
    });

    return {
      total_invoices: invoices.length,
      contacted_invoices: contacted.length,
      not_contacted_invoices: notContacted.length,
      contact_rate: invoices.length > 0
        ? ((contacted.length / invoices.length) * 100).toFixed(2)
        : '0.00',
      average_outreach_per_invoice: avgOutreachPerInvoice,
      total_outreach_attempts: contacted.reduce((sum, inv) => sum + inv.outreach_count, 0),
      tone_distribution: toneDistribution
    };
  }

  /**
   * Get comparison metrics (week-over-week or month-over-month)
   */
  getComparisonMetrics(period = 'week') {
    const currentPeriod = period === 'week' ? 7 : 30;
    const comparePeriod = period === 'week' ? 14 : 60;

    const currentStart = moment().subtract(currentPeriod, 'days');
    const compareStart = moment().subtract(comparePeriod, 'days');
    const compareEnd = moment().subtract(currentPeriod, 'days');

    const invoices = invoiceStore.getAllInvoices();

    const currentPaid = invoices.filter(inv =>
      inv.payment_received_at &&
      moment(inv.payment_received_at).isAfter(currentStart)
    );

    const comparePaid = invoices.filter(inv =>
      inv.payment_received_at &&
      moment(inv.payment_received_at).isAfter(compareStart) &&
      moment(inv.payment_received_at).isBefore(compareEnd)
    );

    const currentAmount = currentPaid.reduce((sum, inv) => sum + inv.original_amount, 0);
    const compareAmount = comparePaid.reduce((sum, inv) => sum + inv.original_amount, 0);

    const amountTrend = compareAmount > 0
      ? (((currentAmount - compareAmount) / compareAmount) * 100).toFixed(2)
      : (currentAmount > 0 ? 100 : 0);

    const countTrend = comparePaid.length > 0
      ? (((currentPaid.length - comparePaid.length) / comparePaid.length) * 100).toFixed(2)
      : (currentPaid.length > 0 ? 100 : 0);

    return {
      period_type: period,
      current_period: {
        start: currentStart.toISOString(),
        end: moment().toISOString(),
        payments_count: currentPaid.length,
        payments_amount: currentAmount.toFixed(2)
      },
      compare_period: {
        start: compareStart.toISOString(),
        end: compareEnd.toISOString(),
        payments_count: comparePaid.length,
        payments_amount: compareAmount.toFixed(2)
      },
      trends: {
        amount_change_percent: parseFloat(amountTrend),
        count_change_percent: parseFloat(countTrend),
        direction: amountTrend >= 0 ? 'up' : 'down'
      }
    };
  }
}

module.exports = new RecoveryStats();
