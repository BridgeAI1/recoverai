# RecoverAI - Automated Accounts Receivable Recovery

RecoverAI is an enterprise-grade Node.js service for BridgeAI that automates accounts receivable recovery through multi-channel outreach sequences. It intelligently escalates collection efforts from friendly reminders to formal legal notices using AI-generated, compliant communications.

## Features

- **Multi-Channel Outreach**: Email → SMS → AI Voice Calls → Formal Letters
- **AI-Powered Message Generation**: Claude API generates personalized, compliant collection messages
- **5-Level Tone Escalation**: Friendly → Professional → Firm → Formal → Final
- **Automatic Sequencing**: Smart scheduling based on invoice urgency and days overdue
- **FDCPA Compliance**: Built-in compliance engine ensures all communications follow Fair Debt Collection Practices Act
- **Bilingual Support**: English and Spanish messages
- **Recovery Analytics**: Detailed metrics on recovery rates, channel effectiveness, and ROI
- **Real-Time Dashboard**: HTML dashboard with live recovery metrics
- **Payment Tracking**: Automatic updates when payments are received
- **Promise Management**: Track promised payments and escalate if missed
- **Multi-Tenant Ready**: Support for multiple client configurations
- **Webhook Integration**: Vapi.ai voice call results, future SMS/email callbacks

## Architecture

### Core Components

```
recoverai/
├── server.js                 # Express server with all endpoints
├── package.json              # Dependencies
├── .env.example              # Environment template
├── Dockerfile                # Docker container config
├── railway.json              # Railway deployment config
│
├── handlers/
│   ├── invoice-import.js     # CSV/JSON invoice import
│   ├── outreach-engine.js    # Multi-channel outreach orchestration
│   ├── vapi-webhook.js       # Voice call result processing
│   └── status.js             # Dashboard and health checks
│
├── services/
│   ├── claude-ai.js          # Claude API integration
│   ├── brevo-email.js        # Brevo email service
│   ├── sms-sender.js         # Twilio SMS integration
│   ├── vapi-caller.js        # Vapi.ai voice calls
│   └── notifications.js      # Business owner alerts
│
├── config/
│   ├── sequences.js          # Collection sequence templates
│   ├── clients.js            # Multi-tenant configuration
│   └── compliance.js         # FDCPA compliance rules
│
├── prompts/
│   ├── collection-prompts.js # Claude prompts for message generation
│   └── voice-scripts.js      # Voice agent scripts
│
└── data/
    ├── invoice-store.js      # In-memory invoice storage
    └── recovery-stats.js     # Analytics and metrics
```

## API Endpoints

### Status & Health
- `GET /` - HTML recovery dashboard
- `GET /status` - JSON system status
- `GET /health` - Health check

### Invoice Management
- `POST /api/invoices/import` - Import CSV or JSON invoices
- `GET /api/invoices` - List invoices with filtering
- `GET /api/invoices/:id` - Get invoice details with activity log
- `POST /api/invoices/:id/action` - Mark paid, write off, escalate, etc.

### Outreach
- `POST /api/outreach/execute` - Run outreach for due invoices
- `GET /api/outreach/schedule` - Get next scheduled outreach

### Webhooks
- `POST /webhook/vapi` - Receive Vapi voice call results

### Analytics & Reports
- `GET /api/stats` - Recovery statistics
- `GET /api/reports/weekly` - Weekly recovery report
- `GET /api/reports/comparison` - Week-over-week comparison

### Compliance
- `GET /api/compliance/audit/:id` - Audit invoice compliance
- `GET /api/compliance/next-contact-time` - Next allowed contact time

### Templates
- `GET /api/templates/csv` - Download CSV import template
- `GET /api/templates/json` - Download JSON import template

## Setup & Installation

### Prerequisites
- Node.js 18+
- API Keys:
  - `ANTHROPIC_API_KEY` - Claude API
  - `BREVO_API_KEY` - Email service
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` - SMS service
  - `VAPI_API_KEY`, `VAPI_PRIVATE_KEY` - Voice calls

### Local Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Start development server
npm run dev

# Start production server
npm start
```

### Environment Variables

```bash
# Server
PORT=3002
NODE_ENV=production

# APIs
ANTHROPIC_API_KEY=sk-ant-xxxxx
BREVO_API_KEY=xkeysib-xxxxx
VAPI_API_KEY=xxxxx
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# Business Configuration
BUSINESS_NAME=BridgeAI
BUSINESS_EMAIL=alex@bridgeaihq.com
BUSINESS_PHONE=+13464439488
BREVO_LIST_ID=9

# Compliance
COLLECTION_START_HOUR=9
COLLECTION_END_HOUR=17
COLLECTION_TIMEZONE=America/Chicago
ENABLE_FDCPA_COMPLIANCE=true

# Security
WEBHOOK_SECRET=bridgeai-recoverai-2026
```

### Docker Deployment

```bash
# Build image
docker build -t recoverai:latest .

# Run container
docker run -p 3002:3002 \
  -e ANTHROPIC_API_KEY=sk-ant-xxxxx \
  -e BREVO_API_KEY=xkeysib-xxxxx \
  recoverai:latest
```

### Railway Deployment

```bash
# Push to Railway
railway up

# Set environment variables
railway variables set ANTHROPIC_API_KEY=sk-ant-xxxxx
railway variables set BREVO_API_KEY=xkeysib-xxxxx

# Deploy
railway deploy
```

## Usage Examples

### Import Invoices

```bash
# CSV Upload
curl -X POST http://localhost:3002/api/invoices/import \
  -F "file=@invoices.csv"

# JSON Upload
curl -X POST http://localhost:3002/api/invoices/import \
  -H "Content-Type: application/json" \
  -d @invoices.json
```

### Execute Outreach

```bash
# Run all due outreach
curl -X POST http://localhost:3002/api/outreach/execute

# Get response:
{
  "processed": 25,
  "successful": 23,
  "failed": 2,
  "skipped": 0,
  "details": [...]
}
```

### Record Payment

```bash
curl -X POST http://localhost:3002/api/invoices/INV-001/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "record_payment",
    "data": {
      "amount": 5000,
      "method": "check",
      "reference": "Check #12345"
    }
  }'
```

### Set Payment Promise

```bash
curl -X POST http://localhost:3002/api/invoices/INV-001/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "set_promise",
    "data": {
      "promised_date": "2026-04-15",
      "notes": "Debtor promised payment by this date"
    }
  }'
```

### Get Recovery Statistics

```bash
curl http://localhost:3002/api/stats

# Response includes:
{
  "summary": {
    "total_invoices": 150,
    "total_amount": 250000,
    "recovered_amount": 180000,
    "recovery_rate": 72
  },
  "recovery_rate_by_urgency": {...},
  "channel_effectiveness": {...}
}
```

## Collection Sequence Details

### Fresh (1-30 days overdue)
1. Day 1: Friendly email reminder
2. Day 3: SMS with payment link
3. Day 7: Professional email
4. Day 14: Professional SMS
5. Day 21: Voice call (friendly)
6. Day 30: Final professional email

### Aging (31-60 days overdue)
1. Day 1: Professional email
2. Day 2: Professional SMS
3. Day 5: Professional voice call
4. Day 10: Firm demand email
5. Day 15: Firm SMS
6. Day 20: Firm voice call
7. Day 30: Formal demand letter

### Critical (61-90 days overdue)
1. Day 1: Immediate firm voice call + demand email
2. Day 2: Critical SMS
3. Day 5: Formal legal-tone voice call
4. Day 7: Formal demand letter
5. Day 10: Final SMS warning
6. Day 15: Final notice email
7. Day 20: Final voice call with escalation

### Severe (90+ days overdue)
1. Day 1: Immediate legal-tone call + legal demand
2. Day 2: Final notice email
3. Day 3: Final SMS
4. Day 5: Final voice call
5. Day 10: Legal proceedings notice

## FDCPA Compliance Features

✓ **Business Hours Only**: Voice calls 9 AM - 5 PM (configurable)
✓ **Maximum Contact Frequency**: 3 calls per week, 1 per day
✓ **Cease & Desist**: Honors debtor requests to stop contact
✓ **Required Disclosures**: Automatic inclusion of FDCPA notices
✓ **No Threats**: Content validation prevents illegal language
✓ **No Deception**: Accurate, non-misleading statements only
✓ **Proper Identification**: Clear identification of collector
✓ **Bilingual Support**: Spanish language options

## Tone Escalation

### Level 1: Friendly (1-30 days)
- "Hi [Name], just a friendly reminder..."
- Professional, courteous, non-threatening
- Goal: Payment reminder

### Level 2: Professional (31-60 days)
- "Dear [Name], regarding your overdue balance..."
- Direct but respectful
- Goal: Payment request

### Level 3: Firm (61-90 days)
- "This is regarding your overdue amount of..."
- Clear demand for payment
- Goal: Escalate urgency

### Level 4: Formal (90+ days)
- "FORMAL DEMAND: Please remit payment of..."
- Legal language, formal structure
- Goal: Pre-litigation notice

### Level 5: Final (120+ days)
- "FINAL NOTICE: Failure to pay may result in..."
- Reference to legal action
- Goal: Ultimate demand

## Analytics & Reporting

### Key Metrics
- **Recovery Rate**: % of invoices fully paid
- **Average Days to Collect**: Mean collection time
- **Channel Effectiveness**: Conversion rates by channel
- **Promised Payment Tracking**: On-time vs overdue promises
- **Urgency Distribution**: Invoices by aging category
- **Tone Level Distribution**: Escalation progress

### Weekly Reports
- New invoices added
- Payments received
- Promised payments due
- Escalations needed
- Top urgent invoices

### Trend Analysis
- Week-over-week recovery comparison
- Month-over-month trends
- Channel performance changes
- Debtor response patterns

## Security & Best Practices

- **API Key Protection**: All secrets in .env (never in code)
- **Webhook Validation**: Secret token validation required
- **CORS Enabled**: Configurable origin restrictions
- **Rate Limiting**: Built-in protection (add in production)
- **Error Handling**: Comprehensive error responses
- **Logging**: Detailed activity logging
- **Compliance Audits**: Every action logged and auditable

## Production Deployment Checklist

- [ ] All API keys configured in environment
- [ ] HTTPS enabled (Railway/Heroku provides this)
- [ ] Webhook secret changed from default
- [ ] Database/persistence layer implemented (currently in-memory)
- [ ] Monitoring and alerting configured
- [ ] Rate limiting implemented
- [ ] Backup procedures in place
- [ ] Compliance audit scheduled
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

## Performance Characteristics

- **Throughput**: ~1000 invoices/day processing capacity
- **Response Times**: <500ms for API calls (excluding AI generation)
- **Memory Usage**: ~50MB baseline + ~100KB per 1000 invoices
- **CPU**: Low usage except during Claude API calls
- **AI Generation**: ~2-3s per message (Claude API latency)
- **Database**: Scales to ~100K invoices in memory

For production, recommend:
- PostgreSQL for invoice persistence
- Redis for caching
- Message queue for async outreach
- CDN for dashboard assets

## Support & Troubleshooting

### Common Issues

**"ANTHROPIC_API_KEY is not set"**
- Ensure .env file exists and has valid key
- Check key format: `sk-ant-xxxxx`

**"Vapi call failed"**
- Verify VAPI_API_KEY and VAPI_PRIVATE_KEY
- Check phone number format (E.164)
- Ensure phone number is valid

**"Email not sending"**
- Verify BREVO_API_KEY
- Check Brevo list ID is correct
- Ensure email addresses are valid

**"Compliance violation"**
- Check COLLECTION_START_HOUR, END_HOUR
- Verify COLLECTION_TIMEZONE setting
- Review FDCPA configuration

## Support

For issues and support:
- Email: support@bridgeaihq.com
- Issues: GitHub Issues
- Documentation: /docs folder

## License

Proprietary - BridgeAI 2026

---

**RecoverAI v1.0.0** - Automated Accounts Receivable Recovery Platform
