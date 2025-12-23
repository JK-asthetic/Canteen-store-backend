// routes/versionRoutes.js
const express = require("express");
const router = express.Router();

// Version configuration - UPDATE THESE VALUES AS NEEDED
const VERSION_CONFIG = {
  currentVersion: "4.0.0", // Latest available version
  minVersion: "2.0.0", // Minimum required version to use the app
  forceUpdate: false, // Set to true to force all users to update
  message: "A new version is available with bug fixes and improvements.",
};

/**
 * GET /canteen_store/version/check
 * Check if app version is compatible
 */
router.get("/check", (req, res) => {
  try {
    const { platform, version } = req.query;

    // Log version check for analytics
    console.log(`Version check: Platform=${platform}, Version=${version}`);

    // Return version information
    res.json({
      currentVersion: VERSION_CONFIG.currentVersion,
      minVersion: VERSION_CONFIG.minVersion,
      forceUpdate: VERSION_CONFIG.forceUpdate,
      message: VERSION_CONFIG.message,
      updateUrl: VERSION_CONFIG.updateUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Version check error:", error);
    res.status(500).json({
      error: "Failed to check version",
      currentVersion: VERSION_CONFIG.currentVersion,
      minVersion: VERSION_CONFIG.minVersion,
      forceUpdate: false,
    });
  }
});

/**
 * GET /canteen_store/version/info
 * Get current version information (admin endpoint)
 */
router.get("/info", (req, res) => {
  res.json({
    ...VERSION_CONFIG,
    serverTime: new Date().toISOString(),
  });
});

module.exports = router;
