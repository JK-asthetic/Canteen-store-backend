// services/backupScheduler.js
const cron = require("node-cron");
const mongoose = require("mongoose");
const { sendMailWithAttachment } = require("./mailer");
const { ObjectId } = mongoose.Types;

/**
 * Enhanced serialization with support for all MongoDB types
 */
function serializeDocument(doc) {
  if (doc === null || doc === undefined) {
    return doc;
  }

  if (Array.isArray(doc)) {
    return doc.map((item) => serializeDocument(item));
  }

  if (doc instanceof ObjectId || doc._bsontype === "ObjectId") {
    return { __type: "ObjectId", value: doc.toString() };
  }

  if (doc instanceof Date) {
    return { __type: "Date", value: doc.toISOString() };
  }

  if (typeof doc === "object") {
    const serialized = {};
    for (const [key, value] of Object.entries(doc)) {
      serialized[key] = serializeDocument(value);
    }
    return serialized;
  }

  return doc;
}

/**
 * Create database backup as JSON (exactly same as your backup route)
 */
async function createBackupJSON() {
  try {
    const collections = await mongoose.connection.db.collections();
    const backup = {
      timestamp: new Date().toISOString(),
      database: mongoose.connection.name,
      version: "3.0",
      format: "enhanced",
      collections: {},
    };

    // Export all collections
    for (const collection of collections) {
      const collectionName = collection.collectionName;
      const documents = await collection.find({}).toArray();

      // Serialize documents to preserve all MongoDB types
      backup.collections[collectionName] = documents.map((doc) =>
        serializeDocument(doc),
      );

      console.log(
        `Backed up ${documents.length} documents from ${collectionName}`,
      );
    }

    // Return JSON string with pretty printing (same as download route)
    return JSON.stringify(backup, null, 2);
  } catch (error) {
    console.error("Error creating backup:", error);
    throw error;
  }
}

/**
 * Send backup email
 */
async function sendBackupEmail() {
  try {
    console.log("Starting scheduled backup...");

    const backupJSON = await createBackupJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const database = mongoose.connection.name;
    const filename = `backup_${database}_${timestamp}.json`;

    const emailRecipient =
      process.env.BACKUP_EMAIL_RECIPIENT || process.env.EMAIL_USER;

    await sendMailWithAttachment(
      emailRecipient,
      `Daily Database Backup - ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      `Automated daily backup of ${database} database.\n\n` +
        `Backup Details:\n` +
        `- Database: ${database}\n` +
        `- Timestamp: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n` +
        `- File: ${filename}\n\n` +
        `This is an automated backup email. Please store this file securely.`,
      [
        {
          filename: filename,
          content: backupJSON,
          contentType: "application/json",
        },
      ],
    );

    console.log(
      "✅ Backup email sent successfully at:",
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    );
  } catch (error) {
    console.error("❌ Error sending backup email:", error);

    // Send error notification
    try {
      const emailRecipient =
        process.env.BACKUP_EMAIL_RECIPIENT || process.env.EMAIL_USER;
      await sendMailWithAttachment(
        emailRecipient,
        "⚠️ Backup Failed - Action Required",
        `The scheduled database backup failed.\n\n` +
          `Error: ${error.message}\n` +
          `Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\n` +
          `Please check the server logs for more details.`,
      );
    } catch (emailError) {
      console.error("Failed to send error notification email:", emailError);
    }
  }
}

/**
 * Initialize backup scheduler
 * Runs daily at 5:00 AM IST
 */
function initializeBackupScheduler() {
  // 5:00 AM IST = 11:30 PM UTC (previous day)
  // Cron expression: minute hour * * *
  const cronExpression = "30 23 * * *"; // 11:30 PM UTC = 5:00 AM IST

  const job = cron.schedule(
    cronExpression,
    () => {
      console.log("🔔 Backup cron job triggered");
      sendBackupEmail();
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  );

  console.log("✅ Backup scheduler initialized");
  console.log(
    `📅 Scheduled to run daily at 5:00 AM IST (${cronExpression} UTC)`,
  );
  console.log(
    `📧 Backup emails will be sent to: ${process.env.BACKUP_EMAIL_RECIPIENT || process.env.EMAIL_USER}`,
  );

  return job;
}

module.exports = {
  initializeBackupScheduler,
  sendBackupEmail,
};
