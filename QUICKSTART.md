# RecoverAI Quick Start Guide

## 5-Minute Setup

### 1. Environment Setup
```bash
cd recoverai
cp .env.example .env
```

Edit `.env` with your API keys:
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
BREVO_API_KEY=xkeysib-xxxxx
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
VAPI_API_KEY=xxxxx
VAPI_PRIVATE_KEY=xxxxx
```

### 2. Install & Start
```bash
npm install
npm start
```

Server runs at: `http://localhost:3002`

### 3. View Dashboard
Open in browser: `http://localhost:3002`

See live recovery metrics, invoice status, and performance analytics.

## Common Tasks

### Import Sample Invoices

**Option A: CSV Upload**
```bash
# Download template
curl http://localhost:3002/api/templates/csv > invoices.csv

# Edit invoices.csv with your data, then upload:
curl -X POST http://localhost:3002/api/invoices/import \
  -F "file=@invoices.csv"
```

**Option B: JSON Upload**
```bash
# Create invoices.json
cat > invoices.json << 'EOF'
[
  {
    "debtor_name": "John Smith",
    "debtor_email": "john@example.com",
    "debtor_phone": "+1-555-0123",
    "amount": 5000,
    "due_date": "2026-03-15",
    "invoice_number": "INV-001",
    "days_overdue": 23,
    "business_name": "BridgeAI"
  }
]
EOF

# Upload
curl -X POST http://localhost:3002/api/invoices/import \
  -H "Content-Type: application/json" \
  -d @invoices.json
```

### Execute Outreach

```bash
# Send emails/SMS/voice calls to all overdue invoices
curl -X POST http://localhost:3002/api/outreach/execute

# Response shows what was sent
{
  "processed": 25,
  "successful": 24,
  "failed": 1,
  "details": [...]
}
```

### List All Invoices

```bash
# All invoices
curl http://localhost:3002/api/invoices

# Filter by status
curl "http://localhost:3002/api/invoices?status=pending"

# Filter by urgency
curl "http://localhost:3002/api/invoices?urgency=critical"
```

### Record a Payment

```bash
curl -X POST http://localhost:3002/api/invoices/INVOICE_ID/action \
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

### View Invoice Details

```bash
curl http://localhost:3002/api/invoices/INVOICE_ID

# Shows:
{
  "invoice": { /* invoice details */ },
  "activity_log": [ /* all actions */ ],
  "payment_history": [ /* all payments */ ]
}
```

### Set Payment Promise

```bash
curl -X POST http://localhost:3002/api/invoices/INVOICE_ID/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "set_promise",
    "data": {
      "promised_date": "2026-04-15",
      "notes": "Debtor promised payment"
    }
  }'
```

### Escalate Invoice

```bash
curl -X POST http://localhost:3002/api/invoices/INVOICE_ID/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "escalate",
    "data": {
      "reason": "Overdue promised payment"
    }
  }'
```

### Write Off Invoice

```bash
curl -X POST http://localhost:3002/api/invoices/INVOICE_ID/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "write_off",
    "data": {
      "reason": "Uncollectible"
    }
  }'
```

### View Recovery Statistics

```bash
curl http://localhost:3002/api/stats

# Shows:
{
  "summary": {
    "total_invoices": 150,
    "total_amount": 250000,
    "recovered_amount": 180000,
    "recovery_rate": 72
  },
  "recovery_rate_by_urgency": {...},
  "channel_effectiveness": {...},
  "promised_payments": {...}
}
```

### Generate Weekly Report

```bash
curl http://localhost:3002/api/reports/weekly

# Shows:
{
  "period": { "start": "...", "end": "..." },
  "summary": {
    "new_invoices": 15,
    "payments_received": 8,
    "debtors_contacted": 25
  },
  "performance": {...},
  "top_urgent_invoices": [...]
}
```

## Sequence Examples

### What Happens Automatically

**Day 1**: Friendly email sent
```
"Hi John, just a friendly reminder that invoice #INV-001 for 
$5,000 was due on 2026-03-15. We'd appreciate prompt payment."
```

**Day 3**: SMS reminder
```
"Hi John Smith, reminder: Invoice #INV-001 for $5,000 is overdue. 
Please arrange payment."
```

**Day 7**: Professional email
```
"Dear John, regarding your overdue balance of $5,000 
(Invoice #INV-001). Payment was due 7 days ago. 
Please arrange payment within 5 business days."
```

**Day 14**: Professional SMS
```
"URGENT: Invoice #INV-001 ($5,000) is 14 days overdue. 
Immediate payment required. Contact us: +13464439488"
```

**Day 21**: Voice call
System calls and plays:
```
"Hello John, this is a call from BridgeAI regarding invoice 
number INV-001. Do you have a few minutes to discuss a 
past due balance?"
```

## Compliance Built-In

✓ Business hours only (9 AM - 5 PM)
✓ Maximum 3 calls per week
✓ FDCPA language validation
✓ Cease & desist honored
✓ Bilingual support (EN/ES)
✓ Required disclosures auto-included
✓ All actions logged & auditable

## Webhook Integration (Vapi)

To receive voice call results:

1. Configure webhook in Vapi.ai dashboard:
   ```
   https://your-domain.com/webhook/vapi?secret=YOUR_WEBHOOK_SECRET
   ```

2. System automatically:
   - Extracts call outcome
   - Updates invoice status
   - Sets payment promise if provided
   - Creates notification

## Dashboard Features

Access at: `http://localhost:3002`

Shows in real-time:
- Total invoices & amounts
- Recovery rate & trends
- Invoice status breakdown
- Promised payments tracking
- Channel effectiveness metrics
- Days to collect average
- Top urgent invoices
- Weekly performance summary

## API Rate Limiting

Current: Unlimited (for development)

Production recommendations:
- 100 requests/minute per IP
- 1000 requests/minute per API key
- Contact support for higher limits

## Testing Checklist

- [ ] Import test invoices
- [ ] View dashboard
- [ ] Record a payment
- [ ] Set payment promise
- [ ] Check statistics
- [ ] Run weekly report
- [ ] Test webhook (optional)
- [ ] Mark invoice as paid
- [ ] Write off an invoice

## Troubleshooting

**"Port 3002 already in use"**
```bash
# Kill existing process
lsof -i :3002
kill -9 <PID>

# Or use different port
PORT=3003 npm start
```

**"API keys not working"**
- Check .env file exists
- Verify keys are correct format
- Restart server after .env changes

**"Emails not sending"**
- Verify BREVO_API_KEY
- Check Brevo list ID (BREVO_LIST_ID)
- Ensure debtor_email is valid

**"SMS not sending"**
- Verify TWILIO credentials
- Ensure phone is E.164 format (+1-555-0123)
- Check Twilio account balance

**"Voice calls failing"**
- Verify VAPI_API_KEY
- Check VAPI_ASSISTANT_ID is set
- Ensure phone number is valid

## Next Steps

1. **Import Real Invoices**: Use CSV/JSON import
2. **Configure Settings**: Update collection hours, tone escalation
3. **Set Up Webhooks**: For Vapi.ai voice call callbacks
4. **Monitor Dashboard**: Track recovery metrics
5. **Review Reports**: Weekly performance analysis
6. **Deploy to Production**: Use Railway or Docker

## Documentation

- **README.md** - Full feature documentation
- **ARCHITECTURE.md** - System design & scaling
- **API Documentation** - All endpoints at `/status`

## Support

Email: support@bridgeaihq.com

---

**RecoverAI v1.0.0** - Start collecting in 5 minutes!
