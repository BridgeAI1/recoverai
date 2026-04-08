require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const moment = require('moment');

// Handlers
const invoiceImportHandler = require('./handlers/invoice-import');
const outreachEngine = require('./handlers/outreach-engine');
const vapiWebhookHandler = require('./handlers/vapi-webhook');
const statusHandler = require('./handlers/status');

// Services & Data
const invoiceStore = require('./data/invoice-store');
const recoveryStats = require('./data/recovery-stats');
const compliance = require('./config/compliance');

const app = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// File upload config
const upload = multer({
  dest: '/tmp/recoverai-uploads',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.json'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'));
    }
  }
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==========================================
// STATUS & HEALTH ENDPOINTS
// ==========================================

/**
 * GET / - Status dashboard (HTML)
 */
app.get('/', (req, res) => {
  const html = statusHandler.getDashboardHTML();
  res.set('Content-Type', 'text/html');
  res.send(html);
});

/**
 * GET /status - JSON status
 */
app.get('/status', (req, res) => {
  res.json({
    system: statusHandler.getSystemStatus(),
    health: statusHandler.getHealthCheck(),
    dashboard: statusHandler.getDashboardData()
  });
});

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
  res.json(statusHandler.getHealthCheck());
});

// ==========================================
// INVOICE MANAGEMENT ENDPOINTS
// ==========================================

/**
 * POST /api/invoices/import - Import invoices from CSV or JSON
 */
app.post('/api/invoices/import', upload.single('file'), async (req, res) => {
  try {
    let result;

    if (req.file) {
      // File upload
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === '.csv') {
        result = await invoiceImportHandler.bulkImportCSV(req.file.path);
      } else if (ext === '.json') {
        const fileContent = require('fs').readFileSync(req.file.path, 'utf8');
        result = await invoiceImportHandler.bulkImportJSON(fileContent);
      } else {
        return res.status(400).json({ error: 'Unsupported file type' });
      }
    } else if (req.body.data) {
      // JSON body
      result = await invoiceImportHandler.bulkImportJSON(req.body.data);
    } else {
      return res.status(400).json({ error: 'No data or file provided' });
    }

    res.json(result);
  } catch (error) {
    console.error('Import error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/invoices - List all invoices with filtering
 */
app.get('/api/invoices', (req, res) => {
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.urgency) filter.urgency = req.query.urgency;
  if (req.query.email) filter.debtor_email = req.query.email;
  if (req.query.days_min) filter.days_overdue_min = parseInt(req.query.days_min);
  if (req.query.days_max) filter.days_overdue_max = parseInt(req.query.days_max);

  const invoices = invoiceStore.getAllInvoices(filter);

  res.json({
    total: invoices.length,
    invoices: invoices.map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      debtor_name: inv.debtor_name,
      debtor_email: inv.debtor_email,
      debtor_phone: inv.debtor_phone,
      amount: inv.amount,
      original_amount: inv.original_amount,
      due_date: inv.due_date,
      days_overdue: inv.days_overdue,
      status: inv.status,
      urgency: inv.urgency,
      created_at: inv.created_at,
      last_contact_at: inv.last_contact_at,
      outreach_count: inv.outreach_count
    }))
  });
});

/**
 * GET /api/invoices/:id - Get single invoice with full details
 */
app.get('/api/invoices/:id', (req, res) => {
  const invoice = invoiceStore.getInvoice(req.params.id);

  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const activities = invoiceStore.getActivityLog(req.params.id);
  const payments = invoiceStore.getPaymentHistory(req.params.id);

  res.json({
    invoice,
    activity_log: activities,
    payment_history: payments
  });
});

/**
 * POST /api/invoices/:id/action - Execute manual action on invoice
 */
app.post('/api/invoices/:id/action', async (req, res) => {
  try {
    const { action, data } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const result = await outreachEngine.executeManualAction(req.params.id, action, data || {});

    res.json(result);
  } catch (error) {
    console.error('Action error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// OUTREACH ENDPOINTS
// ==========================================

/**
 * POST /api/outreach/execute - Run outreach for due invoices
 */
app.post('/api/outreach/execute', async (req, res) => {
  try {
    const result = await outreachEngine.executeOutreach();
    res.json(result);
  } catch (error) {
    console.error('Outreach error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/outreach/schedule - Get next scheduled outreach
 */
app.get('/api/outreach/schedule', (req, res) => {
  const scheduled = outreachEngine.getNextScheduledOutreach();
  res.json({
    total_scheduled: scheduled.length,
    next_outreach: scheduled
  });
});

// ==========================================
// WEBHOOK ENDPOINTS
// ==========================================

/**
 * POST /webhook/vapi - Receive Vapi call results
 */
app.post('/webhook/vapi', async (req, res) => {
  try {
    // Validate webhook secret
    const secret = req.headers['x-webhook-secret'] || req.query.secret;
    const expectedSecret = process.env.WEBHOOK_SECRET || 'bridgeai-recoverai-2026';

    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const result = await vapiWebhookHandler.processCallWebhook(req.body);
    res.json(result);
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// STATISTICS & REPORTING ENDPOINTS
// ==========================================

/**
 * GET /api/stats - Recovery statistics
 */
app.get('/api/stats', (req, res) => {
  const stats = invoiceStore.getStats();
  const byUrgency = recoveryStats.getRecoveryRateByUrgency();
  const channels = recoveryStats.getChannelEffectiveness();
  const promised = recoveryStats.getPromisedPaymentsStatus();
  const avgDays = recoveryStats.getAverageDaysToCollect();
  const outreach = recoveryStats.getOutreachStats();

  res.json({
    summary: stats,
    recovery_rate_by_urgency: byUrgency,
    channel_effectiveness: channels,
    promised_payments: promised,
    average_days_to_collect: avgDays,
    outreach_metrics: outreach
  });
});

/**
 * GET /api/reports/weekly - Weekly recovery report
 */
app.get('/api/reports/weekly', (req, res) => {
  const report = recoveryStats.generateWeeklyReport();
  res.json(report);
});

/**
 * GET /api/reports/comparison - Week-over-week or month-over-month comparison
 */
app.get('/api/reports/comparison', (req, res) => {
  const period = req.query.period || 'week'; // 'week' or 'month'
  const comparison = recoveryStats.getComparisonMetrics(period);
  res.json(comparison);
});

// ==========================================
// TEMPLATE & SAMPLE ENDPOINTS
// ==========================================

/**
 * GET /api/templates/csv - Download CSV import template
 */
app.get('/api/templates/csv', (req, res) => {
  const template = invoiceImportHandler.generateCSVTemplate();
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename=invoices-template.csv');
  res.send(template);
});

/**
 * GET /api/templates/json - Download JSON import template
 */
app.get('/api/templates/json', (req, res) => {
  const template = invoiceImportHandler.generateJSONTemplate();
  res.json(template);
});

// ==========================================
// COMPLIANCE ENDPOINTS
// ==========================================

/**
 * GET /api/compliance/audit/:invoiceId - Get compliance audit for invoice
 */
app.get('/api/compliance/audit/:id', (req, res) => {
  const invoice = invoiceStore.getInvoice(req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const activities = invoiceStore.getActivityLog(req.params.id);
  const audit = compliance.getComplianceAudit(invoice, activities);

  res.json(audit);
});

/**
 * GET /api/compliance/next-contact-time - Get next compliant contact time
 */
app.get('/api/compliance/next-contact-time', (req, res) => {
  const nextTime = compliance.getNextCompliantContactTime();
  res.json({
    next_contact_time: nextTime
  });
});

// ==========================================
// ERROR HANDLING & 404
// ==========================================

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: err.message || 'Internal server error',
    timestamp: moment().toISOString()
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════╗
║         RecoverAI Server Started       ║
║  Automated AR Recovery Platform v1.0   ║
╚════════════════════════════════════════╝

Environment: ${process.env.NODE_ENV || 'development'}
Port: ${port}
Dashboard: http://localhost:${port}/
API Docs: http://localhost:${port}/api/status

Ready to process accounts receivable recovery.
  `);
});

module.exports = app;
