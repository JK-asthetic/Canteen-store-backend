// routes/backupRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { ObjectId } = mongoose.Types;

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

/**
 * Enhanced serialization with support for all MongoDB types
 */
function serializeDocument(doc) {
  if (doc === null || doc === undefined) {
    return doc;
  }

  // Handle Arrays
  if (Array.isArray(doc)) {
    return doc.map((item) => serializeDocument(item));
  }

  // Handle ObjectId
  if (doc instanceof ObjectId || doc._bsontype === "ObjectId") {
    return { __type: "ObjectId", value: doc.toString() };
  }

  // Handle Date
  if (doc instanceof Date) {
    return { __type: "Date", value: doc.toISOString() };
  }

  // Handle Regular Objects
  if (typeof doc === "object") {
    const serialized = {};
    for (const [key, value] of Object.entries(doc)) {
      serialized[key] = serializeDocument(value);
    }
    return serialized;
  }

  // Primitive types (string, number, boolean, etc.)
  return doc;
}

/**
 * Enhanced deserialization with support for all MongoDB types
 */
function deserializeDocument(doc) {
  if (doc === null || doc === undefined) {
    return doc;
  }

  // Handle Arrays
  if (Array.isArray(doc)) {
    return doc.map((item) => deserializeDocument(item));
  }

  // Handle Objects
  if (typeof doc === "object") {
    // Check for special type markers
    if (doc.__type === "ObjectId" && doc.value) {
      try {
        return new ObjectId(doc.value);
      } catch (e) {
        console.error("Failed to deserialize ObjectId:", doc.value, e);
        return doc.value; // Fallback to string
      }
    }

    if (doc.__type === "Date" && doc.value) {
      try {
        return new Date(doc.value);
      } catch (e) {
        console.error("Failed to deserialize Date:", doc.value, e);
        return doc.value; // Fallback to string
      }
    }

    // Regular object - deserialize all properties
    const deserialized = {};
    for (const [key, value] of Object.entries(doc)) {
      deserialized[key] = deserializeDocument(value);
    }
    return deserialized;
  }

  // Primitive types
  return doc;
}

/**
 * GET /canteen_store/backup/download
 * Download complete database backup as JSON with proper type preservation
 */
router.get("/backup/download", async (req, res) => {
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
        serializeDocument(doc)
      );

      console.log(
        `Backed up ${documents.length} documents from ${collectionName}`
      );
    }

    // Set headers for file download
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${backup.database}_${timestamp}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Send with pretty printing for readability
    res.send(JSON.stringify(backup, null, 2));
  } catch (error) {
    console.error("Backup error:", error);
    res.status(500).json({
      error: "Failed to create backup",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * GET /canteen_store/backup/info
 * Get backup statistics and information
 */
router.get("/backup/info", async (req, res) => {
  try {
    const collections = await mongoose.connection.db.collections();
    const info = {
      database: mongoose.connection.name,
      timestamp: new Date().toISOString(),
      totalCollections: collections.length,
      collections: [],
    };

    let totalDocuments = 0;

    for (const collection of collections) {
      const count = await collection.countDocuments();
      totalDocuments += count;

      // Get sample document to show structure
      const sample = await collection.findOne({});

      info.collections.push({
        name: collection.collectionName,
        documentCount: count,
        hasDocuments: count > 0,
        sampleKeys: sample ? Object.keys(sample) : [],
      });
    }

    info.totalDocuments = totalDocuments;

    res.json(info);
  } catch (error) {
    console.error("Info error:", error);
    res.status(500).json({
      error: "Failed to get backup info",
      message: error.message,
    });
  }
});

/**
 * POST /canteen_store/backup/restore
 * Restore database from uploaded backup file with enhanced validation
 */
router.post("/backup/restore", upload.single("backup"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No backup file uploaded" });
    }

    // Parse the uploaded JSON file
    let backupData;
    try {
      backupData = JSON.parse(req.file.buffer.toString("utf-8"));
    } catch (parseError) {
      return res.status(400).json({
        error: "Invalid JSON format",
        message: parseError.message,
      });
    }

    // Validate backup structure
    if (!backupData.collections || typeof backupData.collections !== "object") {
      return res.status(400).json({
        error: "Invalid backup file format",
        message: "Missing or invalid 'collections' field",
      });
    }

    console.log(
      `Starting restore from backup version: ${backupData.version || "unknown"}`
    );
    console.log(`Backup timestamp: ${backupData.timestamp || "unknown"}`);

    const restoredCollections = [];
    const errors = [];
    const warnings = [];

    // Restore each collection
    for (const [collectionName, documents] of Object.entries(
      backupData.collections
    )) {
      try {
        console.log(`Restoring collection: ${collectionName}`);

        if (!Array.isArray(documents)) {
          warnings.push({
            collection: collectionName,
            message: "Documents is not an array, skipping",
          });
          continue;
        }

        const collection = mongoose.connection.db.collection(collectionName);

        // Clear existing data
        const deleteResult = await collection.deleteMany({});
        console.log(
          `Cleared ${deleteResult.deletedCount} existing documents from ${collectionName}`
        );

        // Deserialize and insert backup data
        if (documents.length > 0) {
          // Deserialize documents to restore ObjectIds and Dates
          const deserializedDocs = documents.map((doc, index) => {
            try {
              return deserializeDocument(doc);
            } catch (deserError) {
              console.error(
                `Error deserializing document ${index} in ${collectionName}:`,
                deserError
              );
              throw deserError;
            }
          });

          // Insert with ordered: false to continue on error
          const insertResult = await collection.insertMany(deserializedDocs, {
            ordered: false,
          });

          restoredCollections.push({
            name: collectionName,
            documentsRestored: insertResult.insertedCount || documents.length,
            documentsInBackup: documents.length,
          });

          console.log(
            `Restored ${documents.length} documents to ${collectionName}`
          );
        } else {
          restoredCollections.push({
            name: collectionName,
            documentsRestored: 0,
            documentsInBackup: 0,
          });
          console.log(`Collection ${collectionName} was empty`);
        }
      } catch (collError) {
        console.error(
          `Error restoring collection ${collectionName}:`,
          collError
        );
        errors.push({
          collection: collectionName,
          error: collError.message,
          code: collError.code,
        });
      }
    }

    const response = {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? "Database restored successfully"
          : "Database restored with some errors",
      restored: restoredCollections,
      totalCollections: restoredCollections.length,
      totalDocuments: restoredCollections.reduce(
        (sum, col) => sum + col.documentsRestored,
        0
      ),
      backupInfo: {
        timestamp: backupData.timestamp,
        version: backupData.version || "unknown",
        database: backupData.database,
        format: backupData.format || "legacy",
      },
    };

    if (errors.length > 0) {
      response.errors = errors;
    }

    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    res.json(response);
  } catch (error) {
    console.error("Restore error:", error);
    res.status(500).json({
      error: "Failed to restore backup",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * POST /canteen_store/backup/validate
 * Validate a backup file without restoring it
 */
router.post("/backup/validate", upload.single("backup"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No backup file uploaded" });
    }

    const backupData = JSON.parse(req.file.buffer.toString("utf-8"));

    if (!backupData.collections) {
      return res.status(400).json({
        valid: false,
        error: "Invalid backup file format - missing collections",
      });
    }

    const validation = {
      valid: true,
      version: backupData.version || "unknown",
      timestamp: backupData.timestamp,
      database: backupData.database,
      collections: [],
      totalDocuments: 0,
    };

    for (const [collectionName, documents] of Object.entries(
      backupData.collections
    )) {
      const collectionInfo = {
        name: collectionName,
        documentCount: Array.isArray(documents) ? documents.length : 0,
        isValid: Array.isArray(documents),
      };

      if (Array.isArray(documents) && documents.length > 0) {
        // Check first document structure
        const firstDoc = documents[0];
        collectionInfo.sampleKeys = Object.keys(firstDoc);
        collectionInfo.hasId = "_id" in firstDoc;
      }

      validation.collections.push(collectionInfo);
      validation.totalDocuments += collectionInfo.documentCount;
    }

    res.json(validation);
  } catch (error) {
    res.status(400).json({
      valid: false,
      error: "Failed to parse backup file",
      message: error.message,
    });
  }
});

/**
 * DELETE /canteen_store/backup/clear
 * Clear all data from database (use with caution!)
 */
router.delete("/backup/clear", async (req, res) => {
  try {
    const { confirmToken } = req.body;

    // Require confirmation token to prevent accidental deletion
    if (confirmToken !== "CONFIRM_DELETE_ALL_DATA") {
      return res.status(400).json({
        error: "Invalid confirmation token",
        required: "CONFIRM_DELETE_ALL_DATA",
        message: "Please provide the confirmation token in the request body",
      });
    }

    const collections = await mongoose.connection.db.collections();
    const cleared = [];

    for (const collection of collections) {
      const result = await collection.deleteMany({});
      cleared.push({
        name: collection.collectionName,
        deletedCount: result.deletedCount,
      });
      console.log(
        `Cleared ${result.deletedCount} documents from ${collection.collectionName}`
      );
    }

    res.json({
      success: true,
      message: "All data cleared successfully",
      cleared,
      totalDeleted: cleared.reduce((sum, col) => sum + col.deletedCount, 0),
    });
  } catch (error) {
    console.error("Clear error:", error);
    res.status(500).json({
      error: "Failed to clear database",
      message: error.message,
    });
  }
});

module.exports = router;
