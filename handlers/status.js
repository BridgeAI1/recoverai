const invoiceStore = require('../data/invoice-store');
const recoveryStats = require('../data/recovery-stats');
const moment = require('moment');

/**
 * Status dashboard and health check handler
 */
class StatusHandler {
  /**
   * Get overall system status
   */
  getSystemStatus() {
    return {
      service: 'RecoverAI',
      version: '1.0.0',
      status: 'operational',
      timestamp: moment().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Get health check
   */
  getHealthCheck() {
    return {
      status: 'healthy',
      checks: {
        invoiceStore: { status: 'ok', message: 'Invoice store initialized' },
        database: { status: 'ok', message: 'Using in-memory store' },
        externalAPIs: { status: 'unknown', message: 'API keys not validated' }
      },
      timestamp: moment().toISOString()
    };
  }

  /**
   * Get recovery dashboard data
   */
  getDashboardData() {
    const stats = invoiceStore.getStats();
    const recoveryRateByUrgency = recoveryStats.getRecoveryRateByUrgency();
    const channelEffectiveness = recoveryStats.getChannelEffectiveness();
    const outreachStats = recoveryStats.getOutreachStats();
    const promisedPayments = recoveryStats.getPromisedPaymentsStatus();
    const avgDaysToCollect = recoveryStats.getAverageDaysToCollect();

    return {
      timestamp: moment().toISOString(),
      summary: {
        total_invoices: stats.total_invoices,
        total_amount: parseFloat(stats.total_amount),
        recovered_amount: parseFloat(stats.recovered_amount),
        remaining_amount: parseFloat(stats.remaining_amount),
        recovery_rate: parseFloat(stats.recovery_rate),
        average_days_to_collect: parseFloat(avgDaysToCollect)
      },
      status_breakdown: {
        pending: stats.pending_count,
        contacted: stats.contacted_count,
        promised: stats.promised_count,
        partial_payment: stats.partial_payment_count,
        paid: stats.recovered_count,
        escalated: stats.escalated_count,
        written_off: stats.written_off_count
      },
      urgency_breakdown: stats.by_urgency,
      performance: {
        recovery_rate_by_urgency: recoveryRateByUrgency,
        channel_effectiveness: channelEffectiveness,
        outreach_stats: outreachStats
      },
      promised_payments: {
        total: promisedPayments.total_promised,
        upcoming: promisedPayments.upcoming_count,
        upcoming_amount: parseFloat(promisedPayments.upcoming_amount),
        overdue: promisedPayments.overdue_count,
        overdue_amount: parseFloat(promisedPayments.overdue_amount)
      }
    };
  }

  /**
   * Get HTML dashboard
   */
  getDashboardHTML() {
    const data = this.getDashboardData();

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RecoverAI Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      color: white;
      margin-bottom: 30px;
    }

    h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }

    .subtitle {
      font-size: 14px;
      opacity: 0.9;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .card-title {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }

    .card-value {
      font-size: 28px;
      font-weight: 700;
      color: #333;
      margin-bottom: 8px;
    }

    .card-subtitle {
      font-size: 13px;
      color: #999;
    }

    .metric {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .metric:last-child {
      border-bottom: none;
    }

    .metric-label {
      color: #666;
      font-size: 13px;
    }

    .metric-value {
      font-weight: 600;
      color: #333;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 8px;
    }

    .badge-success { background-color: #d4edda; color: #155724; }
    .badge-warning { background-color: #fff3cd; color: #856404; }
    .badge-danger { background-color: #f8d7da; color: #721c24; }
    .badge-info { background-color: #d1ecf1; color: #0c5460; }

    .progress-bar {
      width: 100%;
      height: 8px;
      background-color: #e0e0e0;
      border-radius: 4px;
      margin-top: 8px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
    }

    .two-column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }

    @media (max-width: 768px) {
      .two-column {
        grid-template-columns: 1fr;
      }
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    th {
      text-align: left;
      padding: 10px;
      background-color: #f5f5f5;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      border-bottom: 2px solid #e0e0e0;
    }

    td {
      padding: 10px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 13px;
    }

    .footer {
      text-align: center;
      color: white;
      margin-top: 30px;
      font-size: 12px;
      opacity: 0.8;
    }

    .alert {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 4px;
      color: #856404;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 RecoverAI Dashboard</h1>
      <p class="subtitle">Accounts Receivable Recovery Platform</p>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Total Invoices</div>
        <div class="card-value">${data.summary.total_invoices}</div>
        <div class="card-subtitle">Active & processed</div>
      </div>

      <div class="card">
        <div class="card-title">Total Amount</div>
        <div class="card-value">$${(data.summary.total_amount / 1000).toFixed(1)}K</div>
        <div class="card-subtitle">Across all invoices</div>
      </div>

      <div class="card">
        <div class="card-title">Recovered Amount</div>
        <div class="card-value">$${(data.summary.recovered_amount / 1000).toFixed(1)}K</div>
        <div class="card-subtitle">Successfully collected</div>
      </div>

      <div class="card">
        <div class="card-title">Recovery Rate</div>
        <div class="card-value">${data.summary.recovery_rate.toFixed(1)}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${data.summary.recovery_rate}%"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Avg Days to Collect</div>
        <div class="card-value">${data.summary.average_days_to_collect}</div>
        <div class="card-subtitle">From creation to payment</div>
      </div>

      <div class="card">
        <div class="card-title">Remaining Amount</div>
        <div class="card-value">$${(data.summary.remaining_amount / 1000).toFixed(1)}K</div>
        <div class="card-subtitle">Outstanding balance</div>
      </div>
    </div>

    <div class="two-column">
      <div class="card">
        <div class="card-title">Invoice Status Breakdown</div>
        <div class="metric">
          <span class="metric-label">Pending</span>
          <span class="metric-value">${data.status_breakdown.pending}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Contacted</span>
          <span class="metric-value">${data.status_breakdown.contacted}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Promised Payment</span>
          <span class="metric-value">${data.status_breakdown.promised}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Partial Payment</span>
          <span class="metric-value">${data.status_breakdown.partial_payment}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Paid</span>
          <span class="metric-value"><span class="status-badge badge-success">${data.status_breakdown.paid}</span></span>
        </div>
        <div class="metric">
          <span class="metric-label">Escalated</span>
          <span class="metric-value"><span class="status-badge badge-danger">${data.status_breakdown.escalated}</span></span>
        </div>
        <div class="metric">
          <span class="metric-label">Written Off</span>
          <span class="metric-value">${data.status_breakdown.written_off}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Promised Payments Status</div>
        <div class="metric">
          <span class="metric-label">Total Promised</span>
          <span class="metric-value">${data.promised_payments.total}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Upcoming (on track)</span>
          <span class="metric-value"><span class="status-badge badge-info">${data.promised_payments.upcoming}</span></span>
        </div>
        <div class="metric">
          <span class="metric-label">Upcoming Amount</span>
          <span class="metric-value">$${(data.promised_payments.upcoming_amount / 1000).toFixed(1)}K</span>
        </div>
        <div class="metric">
          <span class="metric-label">Overdue Promises</span>
          <span class="metric-value"><span class="status-badge badge-danger">${data.promised_payments.overdue}</span></span>
        </div>
        <div class="metric">
          <span class="metric-label">Overdue Amount</span>
          <span class="metric-value">$${(data.promised_payments.overdue_amount / 1000).toFixed(1)}K</span>
        </div>
      </div>
    </div>

    <div class="two-column">
      <div class="card">
        <div class="card-title">Urgency Level Distribution</div>
        <div class="metric">
          <span class="metric-label">Fresh (1-30 days)</span>
          <span class="metric-value">${data.urgency_breakdown.fresh || 0}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Aging (31-60 days)</span>
          <span class="metric-value">${data.urgency_breakdown.aging || 0}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Critical (61-90 days)</span>
          <span class="metric-value"><span class="status-badge badge-warning">${data.urgency_breakdown.critical || 0}</span></span>
        </div>
        <div class="metric">
          <span class="metric-label">Severe (90+ days)</span>
          <span class="metric-value"><span class="status-badge badge-danger">${data.urgency_breakdown.severe || 0}</span></span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Outreach Metrics</div>
        <div class="metric">
          <span class="metric-label">Total Invoices</span>
          <span class="metric-value">${data.performance.outreach_stats.total_invoices}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Contacted</span>
          <span class="metric-value">${data.performance.outreach_stats.contacted_invoices}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Contact Rate</span>
          <span class="metric-value">${data.performance.outreach_stats.contact_rate}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Outreach/Invoice</span>
          <span class="metric-value">${data.performance.outreach_stats.average_outreach_per_invoice}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Total Attempts</span>
          <span class="metric-value">${data.performance.outreach_stats.total_outreach_attempts}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Channel Effectiveness</div>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Attempts</th>
            <th>Conversions</th>
            <th>Conversion Rate</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.performance.channel_effectiveness || {}).map(([channel, stats]) => `
          <tr>
            <td><strong>${channel.toUpperCase()}</strong></td>
            <td>${stats.attempts}</td>
            <td>${stats.conversions}</td>
            <td>${stats.conversion_rate}%</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p>RecoverAI v1.0.0 | Last updated: ${data.timestamp}</p>
      <p>Automated Accounts Receivable Recovery Platform for BridgeAI</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}

module.exports = new StatusHandler();
