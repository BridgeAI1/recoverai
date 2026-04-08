/**
 * Multi-tenant client configurations
 * Each client can have custom settings for branding and behavior
 */

const defaultClientConfig = {
  id: 'default',
  name: 'BridgeAI',
  email: process.env.BUSINESS_EMAIL || 'alex@bridgeaihq.com',
  phone: process.env.BUSINESS_PHONE || '+13464439488',
  language: 'en',
  timezone: process.env.COLLECTION_TIMEZONE || 'America/Chicago',

  // Email settings
  email_settings: {
    from_email: process.env.BREVO_FROM_EMAIL || 'collections@bridgeaihq.com',
    from_name: process.env.BREVO_FROM_NAME || 'BridgeAI Collections',
    reply_to: process.env.BUSINESS_EMAIL || 'alex@bridgeaihq.com'
  },

  // SMS settings
  sms_settings: {
    from_name: process.env.SMS_FROM_NAME || 'BridgeAI',
    from_number: process.env.TWILIO_PHONE_NUMBER
  },

  // Voice settings
  voice_settings: {
    language: process.env.VOICE_LANGUAGE || 'en-US',
    gender: process.env.VOICE_GENDER || 'male',
    assistant_id: process.env.VAPI_ASSISTANT_ID
  },

  // Brevo list
  brevo_list_id: parseInt(process.env.BREVO_LIST_ID) || 9,

  // Business hours
  business_hours: {
    start_hour: parseInt(process.env.COLLECTION_START_HOUR) || 9,
    end_hour: parseInt(process.env.COLLECTION_END_HOUR) || 17,
    timezone: process.env.COLLECTION_TIMEZONE || 'America/Chicago'
  },

  // Escalation settings
  escalation: {
    enable_legal_referral: true,
    legal_referral_days: 120,
    enable_credit_reporting: true,
    credit_reporting_days: 90
  },

  // Message preferences
  message_preferences: {
    include_payment_link: true,
    include_phone_number: true,
    include_email: true,
    language_preference: 'bilingual' // 'en', 'es', or 'bilingual'
  },

  // Compliance
  compliance: {
    fdcpa_enabled: true,
    max_calls_per_week: 3,
    max_calls_per_day: 1,
    honor_cease_and_desist: true
  },

  // Webhook
  webhook_secret: process.env.WEBHOOK_SECRET || 'bridgeai-recoverai-2026',
  webhook_url: process.env.WEBHOOK_URL || 'https://api.bridgeaihq.com/webhook'
};

/**
 * Client store - in production, load from database
 */
class ClientManager {
  constructor() {
    this.clients = new Map();
    this.loadDefaultClient();
  }

  /**
   * Load default client
   */
  loadDefaultClient() {
    this.clients.set('default', defaultClientConfig);
  }

  /**
   * Get client by ID
   */
  getClient(clientId = 'default') {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`Client ${clientId} not found, using default`);
      return defaultClientConfig;
    }
    return client;
  }

  /**
   * Register a new client
   */
  registerClient(clientConfig) {
    if (!clientConfig.id) {
      throw new Error('Client config must include an id');
    }

    const fullConfig = {
      ...defaultClientConfig,
      ...clientConfig
    };

    this.clients.set(clientConfig.id, fullConfig);
    return fullConfig;
  }

  /**
   * Update client configuration
   */
  updateClient(clientId, updates) {
    const client = this.getClient(clientId);
    const updated = {
      ...client,
      ...updates
    };
    this.clients.set(clientId, updated);
    return updated;
  }

  /**
   * Get all clients
   */
  getAllClients() {
    return Array.from(this.clients.values());
  }

  /**
   * Delete client
   */
  deleteClient(clientId) {
    if (clientId === 'default') {
      throw new Error('Cannot delete default client');
    }
    return this.clients.delete(clientId);
  }

  /**
   * Validate client webhook
   */
  validateWebhookSecret(clientId, providedSecret) {
    const client = this.getClient(clientId);
    return client.webhook_secret === providedSecret;
  }

  /**
   * Get client branding
   */
  getClientBranding(clientId = 'default') {
    const client = this.getClient(clientId);
    return {
      name: client.name,
      email: client.email,
      phone: client.phone,
      from_email: client.email_settings.from_email,
      from_name: client.email_settings.from_name
    };
  }

  /**
   * Get client communication settings
   */
  getClientCommunicationSettings(clientId = 'default') {
    const client = this.getClient(clientId);
    return {
      email: client.email_settings,
      sms: client.sms_settings,
      voice: client.voice_settings,
      language_preference: client.message_preferences.language_preference
    };
  }
}

module.exports = new ClientManager();
