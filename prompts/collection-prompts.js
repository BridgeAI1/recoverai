/**
 * Collection message prompts with 5 escalation levels
 * All messages are bilingual (English + Spanish)
 */

const toneDescriptions = {
  1: 'friendly and courteous',
  2: 'professional and direct',
  3: 'firm and assertive',
  4: 'formal and demanding',
  5: 'final notice and severe'
};

const systemPrompt = {
  en: `You are a professional accounts receivable collection specialist. Generate collection messages that are:
- Accurate in amounts and dates
- Respectful but firm as required by tone level
- FDCPA compliant (no threats, no harassment, no deceptive practices)
- Personalized with specific invoice details
- Business hours appropriate
- Clear about payment methods and deadlines

Always include:
- Invoice number
- Original amount
- Days overdue
- Specific payment deadline (X business days)
- Payment instructions/link if available
- Contact information for questions

Tone levels:
1 = Friendly reminder (1-30 days overdue)
2 = Professional follow-up (31-60 days overdue)
3 = Firm demand (61-90 days overdue)
4 = Formal demand letter (90+ days overdue)
5 = Final notice before escalation (120+ days overdue)

Do NOT include threats, do NOT use excessive capitalization except for FINAL NOTICE, do NOT demand payment in ways that could be interpreted as harassment.`,

  es: `Eres un especialista profesional en cobro de cuentas por cobrar. Genera mensajes de cobro que sean:
- Precisos en montos y fechas
- Respetuosos pero firmes según lo requiera el nivel de tono
- Cumplidos con FDCPA (sin amenazas, sin acoso, sin prácticas engañosas)
- Personalizados con detalles específicos de la factura
- Apropiados para horario comercial
- Claros sobre métodos de pago y plazos

Siempre incluye:
- Número de factura
- Monto original
- Días de atraso
- Plazo de pago específico (X días hábiles)
- Instrucciones de pago/enlace si está disponible
- Información de contacto para preguntas

Niveles de tono:
1 = Recordatorio amistoso (1-30 días de atraso)
2 = Seguimiento profesional (31-60 días de atraso)
3 = Demanda firme (61-90 días de atraso)
4 = Demanda formal (90+ días de atraso)
5 = Aviso final antes de escalación (120+ días de atraso)

NO incluyas amenazas, NO uses mayúsculas excesivas excepto para AVISO FINAL, NO demandes el pago de formas que puedan interpretarse como acoso.`
};

/**
 * Generate email prompt
 */
function generateEmailPrompt(invoice, toneLevel, language = 'en') {
  const isEnglish = language === 'en';

  const prompt = isEnglish ?
    `Generate a ${toneDescriptions[toneLevel]} collection email.

INVOICE DETAILS:
- Debtor: ${invoice.debtor_name}
- Invoice #: ${invoice.invoice_number}
- Amount: $${invoice.amount.toFixed(2)}
- Due Date: ${invoice.due_date}
- Days Overdue: ${invoice.days_overdue}
- Business: ${invoice.business_name}

Instructions:
1. Write subject line (10-15 words, engaging)
2. Write email body (150-300 words)
3. Include clear CTA with deadline
4. Sign with ${process.env.BUSINESS_NAME || 'BridgeAI'} Collections Team

Format as JSON:
{
  "subject": "...",
  "body": "...",
  "cta": "..."
}`
    :
    `Genera un correo electrónico de cobro ${toneDescriptions[toneLevel]}.

DETALLES DE LA FACTURA:
- Deudor: ${invoice.debtor_name}
- Factura #: ${invoice.invoice_number}
- Monto: $${invoice.amount.toFixed(2)}
- Fecha de Vencimiento: ${invoice.due_date}
- Días de Atraso: ${invoice.days_overdue}
- Negocio: ${invoice.business_name}

Instrucciones:
1. Escribe línea de asunto (10-15 palabras, atractiva)
2. Escribe cuerpo del correo (150-300 palabras)
3. Incluye CTA claro con plazo
4. Firma con Equipo de Cobros de ${process.env.BUSINESS_NAME || 'BridgeAI'}

Formato como JSON:
{
  "subject": "...",
  "body": "...",
  "cta": "..."
}`;

  return {
    systemPrompt: systemPrompt[language],
    userPrompt: prompt,
    toneLevel,
    language
  };
}

/**
 * Generate SMS prompt
 */
function generateSmsPrompt(invoice, toneLevel, language = 'en') {
  const isEnglish = language === 'en';

  const prompt = isEnglish ?
    `Generate a ${toneDescriptions[toneLevel]} collection SMS.

INVOICE DETAILS:
- Debtor: ${invoice.debtor_name}
- Invoice #: ${invoice.invoice_number}
- Amount: $${invoice.amount.toFixed(2)}
- Days Overdue: ${invoice.days_overdue}

Instructions:
1. Keep to 160 characters (1 SMS)
2. Include invoice # and amount
3. Include deadline (e.g., "respond within 3 days")
4. Include action (e.g., click link, call, reply)
5. Be concise and direct

Format as JSON:
{
  "message": "...",
  "cta_url": "optional_payment_link"
}`
    :
    `Genera un SMS de cobro ${toneDescriptions[toneLevel]}.

DETALLES DE LA FACTURA:
- Deudor: ${invoice.debtor_name}
- Factura #: ${invoice.invoice_number}
- Monto: $${invoice.amount.toFixed(2)}
- Días de Atraso: ${invoice.days_overdue}

Instrucciones:
1. Mantén 160 caracteres (1 SMS)
2. Incluye # de factura y monto
3. Incluye plazo (ej: "responde en 3 días")
4. Incluye acción (ej: haz clic en enlace, llama, responde)
5. Sé conciso y directo

Formato como JSON:
{
  "message": "...",
  "cta_url": "enlace_de_pago_opcional"
}`;

  return {
    systemPrompt: systemPrompt[language],
    userPrompt: prompt,
    toneLevel,
    language
  };
}

/**
 * Generate voice call script prompt
 */
function generateVoiceScriptPrompt(invoice, toneLevel, language = 'en') {
  const isEnglish = language === 'en';

  const prompt = isEnglish ?
    `Generate a ${toneDescriptions[toneLevel]} collection voice call script.

INVOICE DETAILS:
- Debtor: ${invoice.debtor_name}
- Invoice #: ${invoice.invoice_number}
- Amount: $${invoice.amount.toFixed(2)}
- Days Overdue: ${invoice.days_overdue}
- Business: ${invoice.business_name}

Instructions:
1. Write opening statement (greeting and purpose)
2. Write key talking points (3-4 points)
3. Write objection handling (common objections)
4. Write closing (deadline and next steps)
5. Keep natural and conversational
6. Include pauses for listener response
7. Total time: 2-3 minutes when read naturally

Format as JSON:
{
  "opening": "...",
  "talking_points": ["...", "...", "..."],
  "handle_objections": {
    "cant_pay_now": "...",
    "doesnt_owe": "...",
    "need_time": "..."
  },
  "closing": "..."
}`
    :
    `Genera un script de llamada de cobro ${toneDescriptions[toneLevel]}.

DETALLES DE LA FACTURA:
- Deudor: ${invoice.debtor_name}
- Factura #: ${invoice.invoice_number}
- Monto: $${invoice.amount.toFixed(2)}
- Días de Atraso: ${invoice.days_overdue}
- Negocio: ${invoice.business_name}

Instrucciones:
1. Escribe declaración de apertura (saludo y propósito)
2. Escribe puntos clave (3-4 puntos)
3. Escribe manejo de objeciones (objeciones comunes)
4. Escribe cierre (plazo y próximos pasos)
5. Mantén natural y conversacional
6. Incluye pausas para respuesta del oyente
7. Tiempo total: 2-3 minutos cuando se lee naturalmente

Formato como JSON:
{
  "opening": "...",
  "talking_points": ["...", "...", "..."],
  "handle_objections": {
    "cant_pay_now": "...",
    "doesnt_owe": "...",
    "need_time": "..."
  },
  "closing": "..."
}`;

  return {
    systemPrompt: systemPrompt[language],
    userPrompt: prompt,
    toneLevel,
    language
  };
}

/**
 * Generate formal letter prompt
 */
function generateLetterPrompt(invoice, toneLevel, language = 'en') {
  const isEnglish = language === 'en';

  const prompt = isEnglish ?
    `Generate a ${toneDescriptions[toneLevel]} formal collection letter.

INVOICE DETAILS:
- Debtor: ${invoice.debtor_name}
- Invoice #: ${invoice.invoice_number}
- Amount: $${invoice.amount.toFixed(2)}
- Due Date: ${invoice.due_date}
- Days Overdue: ${invoice.days_overdue}
- Business: ${invoice.business_name}

Instructions:
1. Format as formal business letter
2. Include date, debtor address (use details provided)
3. Write body (3-4 paragraphs)
4. Include FDCPA required disclosures if level 4-5
5. Clear deadline (7-10 business days)
6. Professional closing
7. 400-600 words

Format as JSON:
{
  "date": "...",
  "recipient_name": "...",
  "recipient_address": "...",
  "subject": "...",
  "body": "...",
  "signature_line": "..."
}`
    :
    `Genera una carta formal de cobro ${toneDescriptions[toneLevel]}.

DETALLES DE LA FACTURA:
- Deudor: ${invoice.debtor_name}
- Factura #: ${invoice.invoice_number}
- Monto: $${invoice.amount.toFixed(2)}
- Fecha de Vencimiento: ${invoice.due_date}
- Días de Atraso: ${invoice.days_overdue}
- Negocio: ${invoice.business_name}

Instrucciones:
1. Formatea como carta comercial formal
2. Incluye fecha, dirección del deudor (usa detalles proporcionados)
3. Escribe cuerpo (3-4 párrafos)
4. Incluye divulgaciones requeridas si nivel 4-5
5. Plazo claro (7-10 días hábiles)
6. Cierre profesional
7. 400-600 palabras

Formato como JSON:
{
  "date": "...",
  "recipient_name": "...",
  "recipient_address": "...",
  "subject": "...",
  "body": "...",
  "signature_line": "..."
}`;

  return {
    systemPrompt: systemPrompt[language],
    userPrompt: prompt,
    toneLevel,
    language
  };
}

module.exports = {
  generateEmailPrompt,
  generateSmsPrompt,
  generateVoiceScriptPrompt,
  generateLetterPrompt,
  toneDescriptions,
  systemPrompt
};
