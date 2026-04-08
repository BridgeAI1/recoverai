const moment = require('moment-timezone');

/**
 * FDCPA (Fair Debt Collection Practices Act) Compliance Rules
 * Ensures all outreach follows legal guidelines
 */

class ComplianceEngine {
  constructor() {
    this.businessHoursStart = parseInt(process.env.COLLECTION_START_HOUR) || 9; // 9 AM
    this.businessHoursEnd = parseInt(process.env.COLLECTION_END_HOUR) || 17; // 5 PM
    this.timezone = process.env.COLLECTION_TIMEZONE || 'America/Chicago';
    this.maxCallsPerWeek = 3;
    this.maxCallsPerDay = 1;
    this.ceaseAndDesistHonored = true;
  }

  /**
   * Check if contact attempt is compliant
   */
  isContactTimeAllowed(targetPhone, contactMethod = 'call') {
    if (!process.env.ENABLE_FDCPA_COMPLIANCE) {
      return { compliant: true, reason: 'Compliance disabled' };
    }

    if (contactMethod === 'email' || contactMethod === 'sms') {
      // No time restrictions for non-voice contact
      return { compliant: true, reason: 'Non-voice contact allowed at any time' };
    }

    // For voice calls, check business hours
    const now = moment.tz(this.timezone);
    const hour = now.hour();

    if (hour < this.businessHoursStart || hour >= this.businessHoursEnd) {
      return {
        compliant: false,
        reason: `Voice calls only allowed between ${this.businessHoursStart}:00 and ${this.businessHoursEnd}:00 ${this.timezone}`
      };
    }

    // Check if it's a weekend (Saturday = 6, Sunday = 0)
    const dayOfWeek = now.day();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        compliant: false,
        reason: 'Voice calls not allowed on weekends'
      };
    }

    return { compliant: true, reason: 'Contact time is compliant' };
  }

  /**
   * Check if debtor has requested cease and desist
   */
  validateCeaseAndDesist(invoice, contactLog) {
    // In real implementation, this would check a cease-and-desist registry
    const ceaseAndDesistMarker = contactLog?.find(activity =>
      activity.event_type === 'cease_and_desist_requested'
    );

    if (ceaseAndDesistMarker && this.ceaseAndDesistHonored) {
      return {
        compliant: false,
        reason: 'Debtor has requested cease and desist - no further contact allowed',
        ceaseDate: ceaseAndDesistMarker.timestamp
      };
    }

    return { compliant: true, reason: 'No cease and desist on file' };
  }

  /**
   * Validate message content for FDCPA compliance
   */
  validateMessageContent(message) {
    const violations = [];

    // Check for prohibited language
    const prohibitedPhrases = [
      /threat.*legal action/i,
      /we will.*destroy your/i,
      /we will sue you/i,
      /we will garnish/i,
      /we will arrest/i,
      /jail.*time/i,
      /criminal.*charges/i
    ];

    prohibitedPhrases.forEach(phrase => {
      if (phrase.test(message)) {
        violations.push(`Prohibited threat language detected: ${phrase}`);
      }
    });

    // Check for harassment indicators
    const harassmentPhrases = [
      /constantly.*contact/i,
      /day and night/i,
      /repeated calls/i,
      /harassment/i,
      /embarrassment/i
    ];

    harassmentPhrases.forEach(phrase => {
      if (phrase.test(message)) {
        violations.push(`Potential harassment language: ${phrase}`);
      }
    });

    // Check for misrepresentation
    const misrepPhrases = [
      /attorney general/i,
      /government agency/i,
      /government official/i,
      /your case.*attorney/i
    ];

    misrepPhrases.forEach(phrase => {
      if (phrase.test(message)) {
        violations.push(`Potential misrepresentation: ${phrase}`);
      }
    });

    // Check for non-payment threats without legal basis
    if (/we will report to credit/i.test(message)) {
      // This is allowed, but should be accurate
      if (!message.includes('credit bureau') && !message.includes('credit agencies')) {
        violations.push('Credit bureau reference lacks specificity');
      }
    }

    if (violations.length > 0) {
      return {
        compliant: false,
        violations
      };
    }

    return { compliant: true };
  }

  /**
   * Required FDCPA disclosures
   */
  getRequiredDisclosures(toneLevel) {
    const disclosures = {
      1: {
        type: 'initial_contact',
        text: 'This is an attempt to collect a debt. Any information obtained will be used for that purpose.'
      },
      2: {
        type: 'initial_contact',
        text: 'This is an attempt to collect a debt. Any information obtained will be used for that purpose.'
      },
      3: {
        type: 'collection_notice',
        text: 'This is an attempt to collect a debt. Any information obtained will be used for that purpose. Unless you dispute the validity of the debt within 30 days, we will assume the debt is valid.'
      },
      4: {
        type: 'formal_demand',
        text: 'This is a formal demand for payment. This communication is an attempt to collect a debt. Any information obtained will be used for that purpose. Unless you dispute the validity of the debt in writing within 30 days of receipt of this notice, we will assume the debt is valid.'
      },
      5: {
        type: 'final_notice',
        text: 'FINAL COLLECTION NOTICE: This is a formal demand for full payment of this debt. This is an attempt to collect a debt. If you have already paid this debt, please disregard this notice. Unless you dispute the validity of the debt in writing within 30 days, we will assume the debt is valid. If you dispute the debt, send your dispute in writing to [CREDITOR_ADDRESS]. We will verify the debt and send you verification.'
      }
    };

    return disclosures[toneLevel] || disclosures[1];
  }

  /**
   * Validate collection frequency
   */
  validateContactFrequency(invoice, activityLog) {
    const violations = [];

    // Count calls in last 7 days
    const sevenDaysAgo = moment().subtract(7, 'days');
    const callsLastWeek = activityLog.filter(activity =>
      activity.event_type === 'outreach' &&
      activity.details.channel === 'voice' &&
      moment(activity.timestamp).isAfter(sevenDaysAgo)
    ).length;

    if (callsLastWeek >= this.maxCallsPerWeek) {
      violations.push(`Too many calls: ${callsLastWeek} calls in last 7 days (max: ${this.maxCallsPerWeek})`);
    }

    // Count calls in last 24 hours
    const oneDayAgo = moment().subtract(1, 'day');
    const callsLastDay = activityLog.filter(activity =>
      activity.event_type === 'outreach' &&
      activity.details.channel === 'voice' &&
      moment(activity.timestamp).isAfter(oneDayAgo)
    ).length;

    if (callsLastDay >= this.maxCallsPerDay) {
      violations.push(`Too many calls: ${callsLastDay} call(s) in last 24 hours (max: ${this.maxCallsPerDay})`);
    }

    if (violations.length > 0) {
      return { compliant: false, violations };
    }

    return { compliant: true };
  }

  /**
   * Validate contact method for phone
   */
  validateContactMethod(invoice) {
    const violations = [];

    // Check if phone number is valid
    if (!this.isValidPhoneNumber(invoice.debtor_phone)) {
      violations.push('Invalid phone number format');
    }

    // Check for emergency numbers or invalid numbers
    const emergencyNumbers = /^(911|411|611|811|0)$/;
    if (emergencyNumbers.test(invoice.debtor_phone)) {
      violations.push('Contact number appears to be emergency or service number');
    }

    if (violations.length > 0) {
      return { compliant: false, violations };
    }

    return { compliant: true };
  }

  /**
   * Validate email for FDCPA compliance
   */
  validateEmailCompliance(email) {
    if (!email || !email.subject || !email.body) {
      return { compliant: false, reason: 'Email missing required fields' };
    }

    const violations = [];

    // Check for FDCPA disclosure in email
    const hasDisclosure = email.body.includes('attempt to collect') ||
                         email.body.includes('This communication is an attempt');

    if (!hasDisclosure && email.tone && email.tone >= 3) {
      violations.push('Missing FDCPA disclosure in formal/legal tone email');
    }

    // Check email content for prohibited language
    const contentCheck = this.validateMessageContent(email.body);
    if (!contentCheck.compliant) {
      violations.push(...contentCheck.violations);
    }

    if (violations.length > 0) {
      return { compliant: false, violations };
    }

    return { compliant: true };
  }

  /**
   * Helper: Validate phone number format
   */
  isValidPhoneNumber(phone) {
    if (!phone) return false;
    // Simple validation: should have at least 10 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }

  /**
   * Get compliance audit log for invoice
   */
  getComplianceAudit(invoice, activityLog) {
    const audit = {
      invoice_id: invoice.id,
      audit_date: moment().toISOString(),
      checks: {
        cease_and_desist: this.validateCeaseAndDesist(invoice, activityLog),
        contact_frequency: this.validateContactFrequency(invoice, activityLog),
        contact_method: this.validateContactMethod(invoice)
      },
      compliant: true
    };

    // Check if all checks passed
    Object.values(audit.checks).forEach(check => {
      if (!check.compliant) {
        audit.compliant = false;
      }
    });

    return audit;
  }

  /**
   * Get next compliant contact time
   */
  getNextCompliantContactTime(timezone = null) {
    const tz = timezone || this.timezone;
    let now = moment.tz(tz);

    // If past business hours, move to next day
    if (now.hour() >= this.businessHoursEnd) {
      now = now.add(1, 'day').hour(this.businessHoursStart).minute(0).second(0);
    }

    // If before business hours, move to start
    if (now.hour() < this.businessHoursStart) {
      now = now.hour(this.businessHoursStart).minute(0).second(0);
    }

    // If weekend, move to Monday
    const dayOfWeek = now.day();
    if (dayOfWeek === 6) {
      now = now.add(2, 'days').hour(this.businessHoursStart).minute(0).second(0);
    } else if (dayOfWeek === 0) {
      now = now.add(1, 'day').hour(this.businessHoursStart).minute(0).second(0);
    }

    return now.toISOString();
  }
}

module.exports = new ComplianceEngine();
