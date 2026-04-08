# RecoverAI Architecture & Design

## System Overview

RecoverAI is a production-ready Node.js service for automated accounts receivable recovery. It orchestrates multi-channel outreach (Email, SMS, Voice, Letters) with AI-generated, compliance-aware messaging.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Express.js REST API                       │
│                    (server.js - Port 3002)                   │
└────┬──────────────┬──────────────┬──────────────┬────────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Invoice  │  │ Outreach │  │ Webhook  │  │ Status   │
│ Import   │  │ Engine   │  │ Handlers │  │ Dashboard│
└──────────┘  └──────────┘  └──────────┘  └──────────┘
     │              │              │              │
     └──────────────┼──────────────┼──────────────┘
                    ▼
         ┌──────────────────────┐
         │   Data Layer         │
         │  ┌────────────────┐  │
         │  │ Invoice Store  │  │
         │  │ (in-memory)    │  │
         │  └────────────────┘  │
         │  ┌────────────────┐  │
         │  │ Recovery Stats │  │
         │  └────────────────┘  │
         └──────────────────────┘
                    │
         ┌──────────┴──────────────┐
         │                         │
         ▼                         ▼
    ┌─────────┐          ┌──────────────┐
    │Services │          │  Config      │
    │         │          │              │
    │ Claude  │◄────────►│ Sequences    │
    │ Brevo   │          │ Compliance   │
    │ Twilio  │          │ Clients      │
    │ Vapi    │          │              │
    └─────────┘          └──────────────┘
         │
         ▼
    ┌──────────────────────────┐
    │  External APIs           │
    │  ├─ Anthropic (Claude)   │
    │  ├─ Brevo (Email)        │
    │  ├─ Twilio (SMS)         │
    │  └─ Vapi.ai (Voice)      │
    └──────────────────────────┘
```

## Directory Structure & Responsibilities

### `/server.js` - Main Entry Point
- Express application setup
- Route definitions (19 endpoints)
- Middleware configuration (CORS, JSON, file upload)
- Error handling

### `/handlers/` - Request Handlers
- **invoice-import.js**: CSV/JSON parsing, validation, bulk import
- **outreach-engine.js**: Orchestrates multi-channel outreach execution
- **vapi-webhook.js**: Processes voice call results, extracts outcomes
- **status.js**: Dashboard data, health checks, HTML rendering

### `/services/` - External Integrations
- **claude-ai.js**: Message generation (email, SMS, voice, letters)
- **brevo-email.js**: Email sending via Brevo API
- **sms-sender.js**: SMS sending via Twilio API
- **vapi-caller.js**: Voice calls via Vapi.ai API
- **notifications.js**: Alert generation for business owner

### `/config/` - Configuration & Rules
- **sequences.js**: Collection schedules by urgency (fresh/aging/critical/severe)
- **compliance.js**: FDCPA rules, contact hours, frequency limits
- **clients.js**: Multi-tenant settings, branding, communication preferences

### `/prompts/` - AI Prompt Engineering
- **collection-prompts.js**: Claude prompts for generating 5-level tone messages
- **voice-scripts.js**: Voice agent scripts with objection handling

### `/data/` - In-Memory Data Layer
- **invoice-store.js**: CRUD operations on invoices, activities, payments
- **recovery-stats.js**: Analytics calculations (rates, trends, metrics)

## Request Flow Examples

### Example 1: Import & Automatic Outreach

```
1. POST /api/invoices/import (CSV file)
   ↓ invoiceImportHandler.bulkImportCSV()
   ├─ Parse CSV
   ├─ Validate each row
   ├─ Create in invoiceStore
   └─ Add to Brevo list

2. POST /api/outreach/execute (automatic)
   ↓ outreachEngine.executeOutreach()
   ├─ Get due invoices
   └─ For each invoice:
      ├─ Check compliance
      ├─ Get next action (email/SMS/voice)
      ├─ Generate message (Claude)
      ├─ Send via channel (Brevo/Twilio/Vapi)
      └─ Log activity
```

### Example 2: Voice Call & Payment Promise

```
1. POST /webhook/vapi (callback from Vapi)
   ↓ vapiWebhookHandler.processCallWebhook()
   ├─ Parse call data
   ├─ Extract outcome (promised/disputed/no contact)
   ├─ Analyze with Claude (if disputed)
   └─ Update invoice status
      ├─ If promised: set promise date
      ├─ If disputed: escalate
      └─ Create notification

2. Promise reminder (automatic)
   ├─ Check promised payments daily
   └─ If overdue: escalate
```

### Example 3: Manual Invoice Action

```
POST /api/invoices/:id/action
{
  "action": "record_payment",
  "data": { "amount": 5000, "method": "check" }
}
   ↓ outreachEngine.executeManualAction()
   ├─ Validate action
   ├─ Update invoice status
   ├─ Record payment
   ├─ Create notification
   └─ Update analytics
```

## Data Models

### Invoice Model
```javascript
{
  id: "uuid",
  debtor_name: "John Smith",
  debtor_email: "john@example.com",
  debtor_phone: "+1-555-0123",
  amount: 5000,                    // remaining
  original_amount: 5000,           // initial
  due_date: "2026-03-15",
  invoice_number: "INV-001",
  days_overdue: 23,
  business_name: "BridgeAI",
  status: "pending|contacted|promised|partial_payment|paid|escalated|written_off",
  urgency: "fresh|aging|critical|severe",
  created_at: "ISO timestamp",
  last_contact_at: "ISO timestamp",
  promised_payment_date: "YYYY-MM-DD",
  outreach_count: 3,
  last_tone_level: 2,
  notes: "string",
  custom_fields: {}
}
```

### Activity Model
```javascript
{
  id: "uuid",
  invoice_id: "uuid",
  event_type: "invoice_created|outreach|status_changed|payment_received|...",
  details: { /* channel, tone, message_id, status, error, etc */ },
  timestamp: "ISO timestamp"
}
```

### Outreach Sequence Model
```javascript
{
  urgency: "fresh|aging|critical|severe",
  actions: [
    {
      day: 1,
      channel: "email|sms|voice|letter",
      tone: 1-5,
      name: "action name",
      description: "detailed description"
    },
    // ... more actions
  ]
}
```

## API Design Patterns

### Input Validation
```javascript
// Invoice import validates:
- Required fields (debtor_name, email, phone, amount, due_date, invoice_number)
- Email format (regex)
- Phone format (10-15 digits)
- Amount (positive number)
- Due date (YYYY-MM-DD)
```

### Error Handling
```javascript
// Consistent error responses
{
  "success": false,
  "error": "error message",
  "details": {} // optional
}

// HTTP Status Codes:
200 - Success
400 - Bad request (validation, business logic)
404 - Not found
500 - Server error
```

### Pagination (Future Enhancement)
```javascript
// Recommended format for list endpoints
{
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8,
  "data": [...]
}
```

## Compliance Engine

### Automatic Checks
1. **Contact Time**: Business hours only (9 AM - 5 PM, configurable)
2. **Contact Frequency**: Max 3 calls/week, 1/day
3. **Cease & Desist**: Honor requests immediately
4. **Message Content**: Validate for threats, harassment, deception
5. **FDCPA Disclosures**: Auto-include required notices

### Audit Trail
- Every action logged with timestamp
- Compliance check results stored
- Can generate compliance reports

## Scaling Considerations

### Current (In-Memory)
- ~100K invoices max
- Single process
- No persistence
- ~500MB RAM peak

### Production Ready (Recommended)
```
┌─────────────┐
│ Load Balancer│
└──────┬──────┘
       ├─ RecoverAI Pod 1
       ├─ RecoverAI Pod 2
       └─ RecoverAI Pod 3
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
  PostgreSQL Redis   S3 (letters)
```

### Database Layer
```sql
-- invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  invoice_number VARCHAR,
  debtor_name VARCHAR,
  amount DECIMAL,
  status VARCHAR,
  created_at TIMESTAMP,
  ...
);

-- activities table
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES invoices,
  event_type VARCHAR,
  details JSONB,
  timestamp TIMESTAMP
);

-- payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES invoices,
  amount DECIMAL,
  method VARCHAR,
  received_at TIMESTAMP
);
```

## Security Measures

### Current Implementation
- API keys in environment variables only
- CORS enabled (configurable)
- Webhook secret validation
- Input validation on all endpoints
- Error messages don't expose internal details

### Production Enhancements
- Rate limiting per IP/API key
- JWT authentication for admin endpoints
- HTTPS only (enforced in Railway)
- SQL injection prevention (ORM/prepared statements)
- Request logging & audit trails
- DDoS protection via CDN
- Secrets rotation policies

## Monitoring & Observability

### Metrics to Track
- Request latency (API endpoints)
- Success/failure rates by channel
- Recovery rate trends
- Cost per recovery (by channel)
- API quota usage (Claude, Brevo, etc.)
- Error rates & types
- Outreach execution times

### Logging Strategy
```javascript
// Every significant event logged with context:
[2026-04-07 14:32:15] POST /api/outreach/execute - 200 (2345ms)
[2026-04-07 14:32:16] INFO: Processing invoice INV-001
[2026-04-07 14:32:18] EMAIL SENT: INV-001, message_id=brevo-12345
[2026-04-07 14:32:19] ACTIVITY LOGGED: invoice_id=uuid, event=outreach
```

## Future Enhancements

1. **Database Persistence**: PostgreSQL + migrations
2. **Real-time Notifications**: WebSocket dashboard updates
3. **Advanced Analytics**: Predictive recovery rates
4. **Dispute Management**: Detailed dispute tracking & resolution
5. **Multi-language**: Full i18n support
6. **Callback Handling**: SMS/Email reply parsing
7. **Document Management**: Letter generation to PDF
8. **Integration Hub**: Xero, QuickBooks sync
9. **Machine Learning**: Optimal outreach timing prediction
10. **API Rate Limits**: Per-client quotas

---

**Last Updated**: 2026-04-07
**Version**: 1.0.0
**Status**: Production Ready
