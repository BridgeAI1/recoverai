const fs = require('fs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const invoiceStore = require('../data/invoice-store');
const brevoEmail = require('../services/brevo-email');

/**
 * Handle invoice imports (CSV or JSON)
 */
class InvoiceImportHandler {
  /**
   * Import invoices from CSV file
   */
  async importFromCSV(filePath) {
    return new Promise((resolve, reject) => {
      const invoices = [];
      const errors = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            const invoice = this._validateInvoiceData(row);
            if (invoice.valid) {
              invoices.push(invoice.data);
            } else {
              errors.push({
                row: row,
                error: invoice.error
              });
            }
          } catch (error) {
            errors.push({
              row: row,
              error: error.message
            });
          }
        })
        .on('end', () => {
          resolve({
            success: true,
            total: invoices.length,
            errors: errors.length,
            invoices,
            errorDetails: errors
          });
        })
        .on('error', (error) => {
          reject({
            success: false,
            error: error.message
          });
        });
    });
  }

  /**
   * Import invoices from JSON
   */
  async importFromJSON(data) {
    try {
      let invoices = data;

      // If data is a string, parse it
      if (typeof data === 'string') {
        invoices = JSON.parse(data);
      }

      // Ensure it's an array
      if (!Array.isArray(invoices)) {
        invoices = [invoices];
      }

      const results = [];
      const errors = [];

      invoices.forEach((row, index) => {
        try {
          const invoice = this._validateInvoiceData(row);
          if (invoice.valid) {
            results.push(invoice.data);
          } else {
            errors.push({
              index,
              row: row,
              error: invoice.error
            });
          }
        } catch (error) {
          errors.push({
            index,
            row: row,
            error: error.message
          });
        }
      });

      return {
        success: true,
        total: results.length,
        errors: errors.length,
        invoices: results,
        errorDetails: errors
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save imported invoices to store and Brevo
   */
  async saveImportedInvoices(invoices) {
    const saved = [];
    const errors = [];

    for (const invoiceData of invoices) {
      try {
        // Create invoice in store
        const invoice = invoiceStore.createInvoice(invoiceData);
        saved.push(invoice);

        // Add to Brevo contact list
        await brevoEmail.addContactToList(invoice);
      } catch (error) {
        errors.push({
          invoice_number: invoiceData.invoice_number,
          error: error.message
        });
      }
    }

    return {
      success: errors.length === 0,
      saved: saved.length,
      errors: errors.length,
      invoices: saved,
      errorDetails: errors
    };
  }

  /**
   * Bulk import: CSV -> validate -> save
   */
  async bulkImportCSV(filePath) {
    try {
      // Parse CSV
      const csvResult = await this.importFromCSV(filePath);
      if (!csvResult.success) {
        return csvResult;
      }

      // Save to store
      const saveResult = await this.saveImportedInvoices(csvResult.invoices);
      return {
        ...saveResult,
        csv_total: csvResult.total,
        csv_errors: csvResult.errors
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bulk import: JSON -> validate -> save
   */
  async bulkImportJSON(data) {
    try {
      // Parse JSON
      const jsonResult = await this.importFromJSON(data);
      if (!jsonResult.success) {
        return jsonResult;
      }

      // Save to store
      const saveResult = await this.saveImportedInvoices(jsonResult.invoices);
      return {
        ...saveResult,
        json_total: jsonResult.total,
        json_errors: jsonResult.errors
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate invoice data
   */
  _validateInvoiceData(row) {
    const errors = [];

    // Required fields
    const requiredFields = ['debtor_name', 'debtor_email', 'debtor_phone', 'amount', 'due_date', 'invoice_number'];
    requiredFields.forEach(field => {
      if (!row[field] || (typeof row[field] === 'string' && row[field].trim() === '')) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (errors.length > 0) {
      return { valid: false, error: errors.join('; ') };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.debtor_email)) {
      return { valid: false, error: 'Invalid email format' };
    }

    // Validate phone format (basic)
    const phoneDigits = row.debtor_phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return { valid: false, error: 'Invalid phone number format' };
    }

    // Validate amount
    const amount = parseFloat(row.amount);
    if (isNaN(amount) || amount <= 0) {
      return { valid: false, error: 'Invalid amount (must be positive number)' };
    }

    // Validate due date
    const dueDate = new Date(row.due_date);
    if (isNaN(dueDate.getTime())) {
      return { valid: false, error: 'Invalid due_date format (use YYYY-MM-DD)' };
    }

    // Calculate days overdue if not provided
    let daysOverdue = parseInt(row.days_overdue) || 0;
    if (daysOverdue === 0) {
      const today = new Date();
      daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
    }

    return {
      valid: true,
      data: {
        debtor_name: row.debtor_name.trim(),
        debtor_email: row.debtor_email.trim().toLowerCase(),
        debtor_phone: row.debtor_phone.trim(),
        amount: amount,
        due_date: row.due_date.trim(),
        invoice_number: row.invoice_number.trim(),
        days_overdue: Math.max(0, daysOverdue),
        business_name: row.business_name ? row.business_name.trim() : process.env.BUSINESS_NAME,
        notes: row.notes ? row.notes.trim() : '',
        custom_fields: this._extractCustomFields(row)
      }
    };
  }

  /**
   * Extract custom fields from row
   */
  _extractCustomFields(row) {
    const standardFields = [
      'debtor_name', 'debtor_email', 'debtor_phone',
      'amount', 'due_date', 'invoice_number', 'days_overdue',
      'business_name', 'notes'
    ];

    const custom = {};
    Object.keys(row).forEach(key => {
      if (!standardFields.includes(key) && row[key]) {
        custom[key] = row[key];
      }
    });

    return custom;
  }

  /**
   * Generate sample CSV template
   */
  generateCSVTemplate() {
    return `debtor_name,debtor_email,debtor_phone,amount,due_date,invoice_number,days_overdue,business_name,notes
John Smith,john@example.com,+1-555-0123,5000.00,2026-03-15,INV-001,23,Acme Corp,Past due
Jane Doe,jane@example.com,+1-555-0456,2500.50,2026-02-28,INV-002,39,Acme Corp,Contacted via email
Bob Johnson,bob@example.com,+1-555-0789,10000.00,2026-01-15,INV-003,82,Acme Corp,Promised payment`;
  }

  /**
   * Generate sample JSON template
   */
  generateJSONTemplate() {
    return [
      {
        debtor_name: 'John Smith',
        debtor_email: 'john@example.com',
        debtor_phone: '+1-555-0123',
        amount: 5000.00,
        due_date: '2026-03-15',
        invoice_number: 'INV-001',
        days_overdue: 23,
        business_name: 'Acme Corp',
        notes: 'Past due'
      },
      {
        debtor_name: 'Jane Doe',
        debtor_email: 'jane@example.com',
        debtor_phone: '+1-555-0456',
        amount: 2500.50,
        due_date: '2026-02-28',
        invoice_number: 'INV-002',
        days_overdue: 39,
        business_name: 'Acme Corp',
        notes: 'Contacted via email'
      }
    ];
  }
}

module.exports = new InvoiceImportHandler();
