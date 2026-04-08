/**
 * Collection sequence templates by urgency level
 * Defines the automated outreach schedule for each invoice
 */

const sequences = {
  // 1-30 days overdue: Friendly reminders
  fresh: {
    urgency: 'fresh',
    description: '1-30 days overdue - Friendly reminders',
    initial_tone: 1,
    max_tone: 2,
    actions: [
      {
        day: 1,
        channel: 'email',
        tone: 1,
        name: 'Initial friendly reminder',
        description: 'Courteous first email mentioning overdue invoice'
      },
      {
        day: 3,
        channel: 'sms',
        tone: 1,
        name: 'SMS follow-up',
        description: 'Quick text reminder with payment link'
      },
      {
        day: 7,
        channel: 'email',
        tone: 2,
        name: 'Second email - professional',
        description: 'More professional tone, emphasizing prompt payment'
      },
      {
        day: 14,
        channel: 'sms',
        tone: 2,
        name: 'Second SMS - professional',
        description: 'Professional SMS reminder with urgency'
      },
      {
        day: 21,
        channel: 'voice',
        tone: 2,
        name: 'Voice call - friendly',
        description: 'AI agent call with friendly but professional tone'
      },
      {
        day: 30,
        channel: 'email',
        tone: 2,
        name: 'Final professional email',
        description: 'Professional final reminder before escalation'
      }
    ]
  },

  // 31-60 days overdue: Aging accounts
  aging: {
    urgency: 'aging',
    description: '31-60 days overdue - Aging accounts',
    initial_tone: 2,
    max_tone: 3,
    actions: [
      {
        day: 1,
        channel: 'email',
        tone: 2,
        name: 'Professional entry email',
        description: 'Direct professional message about overdue amount'
      },
      {
        day: 2,
        channel: 'sms',
        tone: 2,
        name: 'Professional SMS',
        description: 'Urgent SMS with clear deadline'
      },
      {
        day: 5,
        channel: 'voice',
        tone: 2,
        name: 'Voice call - professional',
        description: 'AI agent call with professional firm tone'
      },
      {
        day: 10,
        channel: 'email',
        tone: 3,
        name: 'Firm demand email',
        description: 'Firmer tone emphasizing immediate payment needed'
      },
      {
        day: 15,
        channel: 'sms',
        tone: 3,
        name: 'Firm SMS demand',
        description: 'Urgent SMS with short deadline'
      },
      {
        day: 20,
        channel: 'voice',
        tone: 3,
        name: 'Voice call - firm',
        description: 'AI agent call with firm assertive tone'
      },
      {
        day: 30,
        channel: 'letter',
        tone: 3,
        name: 'Formal demand letter',
        description: 'Formal written demand with legal undertones'
      }
    ]
  },

  // 61-90 days overdue: Critical accounts
  critical: {
    urgency: 'critical',
    description: '61-90 days overdue - Critical accounts',
    initial_tone: 3,
    max_tone: 4,
    actions: [
      {
        day: 1,
        channel: 'voice',
        tone: 3,
        name: 'Immediate voice call - firm',
        description: 'Urgent AI agent call with firm tone'
      },
      {
        day: 1,
        channel: 'email',
        tone: 3,
        name: 'Firm demand email',
        description: 'Formal demand letter format via email'
      },
      {
        day: 2,
        channel: 'sms',
        tone: 3,
        name: 'Critical SMS',
        description: 'Urgent SMS about escalation threat'
      },
      {
        day: 5,
        channel: 'voice',
        tone: 4,
        name: 'Voice call - formal',
        description: 'Legal-toned AI agent call'
      },
      {
        day: 7,
        channel: 'letter',
        tone: 4,
        name: 'Formal demand letter',
        description: 'Formal legal demand with 10-day deadline'
      },
      {
        day: 10,
        channel: 'sms',
        tone: 4,
        name: 'Final SMS warning',
        description: 'Final warning before legal action'
      },
      {
        day: 15,
        channel: 'email',
        tone: 4,
        name: 'Final notice email',
        description: 'Final notice before escalation to legal'
      },
      {
        day: 20,
        channel: 'voice',
        tone: 4,
        name: 'Final voice call',
        description: 'Final attempt with escalation notification'
      }
    ]
  },

  // 90+ days overdue: Severe accounts
  severe: {
    urgency: 'severe',
    description: '90+ days overdue - Severe accounts',
    initial_tone: 4,
    max_tone: 5,
    actions: [
      {
        day: 1,
        channel: 'voice',
        tone: 4,
        name: 'Immediate legal-tone call',
        description: 'Urgent AI agent call with legal language'
      },
      {
        day: 1,
        channel: 'letter',
        tone: 4,
        name: 'Formal legal demand',
        description: 'Formal legal demand letter with escalation notice'
      },
      {
        day: 2,
        channel: 'email',
        tone: 5,
        name: 'Final notice email',
        description: 'Final notice before legal proceedings'
      },
      {
        day: 3,
        channel: 'sms',
        tone: 5,
        name: 'Final SMS notice',
        description: 'Final SMS notice about legal action'
      },
      {
        day: 5,
        channel: 'voice',
        tone: 5,
        name: 'Final voice notice',
        description: 'Final AI agent call stating legal action is imminent'
      },
      {
        day: 10,
        channel: 'letter',
        tone: 5,
        name: 'Legal proceedings notice',
        description: 'Notice that legal proceedings will begin'
      }
    ]
  }
};

/**
 * Get sequence for an invoice's urgency
 */
function getSequenceForInvoice(invoice) {
  return sequences[invoice.urgency] || sequences.fresh;
}

/**
 * Get next action for an invoice
 */
function getNextAction(invoice) {
  const sequence = getSequenceForInvoice(invoice);
  const lastContact = invoice.last_contact_at ? new Date(invoice.last_contact_at) : new Date(invoice.created_at);
  const daysSinceLastContact = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));

  // Find the next action that's due
  for (const action of sequence.actions) {
    if (action.day > daysSinceLastContact) {
      return action;
    }
  }

  // If all actions are exhausted, escalate
  return {
    day: 999,
    channel: 'escalate',
    tone: 5,
    name: 'Escalate to legal',
    description: 'Escalate to legal department'
  };
}

/**
 * Get all actions for a specific day from sequence
 */
function getActionsForDay(sequence, dayNumber) {
  return sequence.actions.filter(action => action.day === dayNumber);
}

/**
 * Get escalation path for invoice
 */
function getEscalationPath(invoice) {
  const sequence = getSequenceForInvoice(invoice);
  const escalationPoints = sequence.actions.filter(action => action.tone > 2);

  return {
    current_tone: invoice.last_tone_level,
    max_tone: sequence.max_tone,
    escalation_points: escalationPoints.map(action => ({
      day: action.day,
      tone: action.tone,
      description: action.description
    }))
  };
}

module.exports = {
  sequences,
  getSequenceForInvoice,
  getNextAction,
  getActionsForDay,
  getEscalationPath
};
