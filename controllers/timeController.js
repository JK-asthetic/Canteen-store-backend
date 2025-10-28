exports.getCurrentTime = async (req, res) => {
  try {
    // Get current time in UTC
    const now = new Date();

    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    const istTime = new Date(now.getTime());

    // Get start of day in IST
    const istStartOfDay = new Date(istTime);
    istStartOfDay.setHours(0, 0, 0, 0);

    // Convert back to UTC for consistent storage
    const utcStartOfDay = new Date(istStartOfDay.getTime());
    console.log("UTC Start of Day:", istTime.toISOString());

    res.json({
      serverTime: now.toISOString(),
      istTime: istTime.toISOString(),
      istDate: istTime.toISOString().split("T")[0],
      utcStartOfDay: utcStartOfDay.toISOString(),
      timezone: "Asia/Kolkata",
      offset: "+05:30",
    });
  } catch (err) {
    console.error("Error getting current time:", err);
    res.status(500).json({ error: err.message });
  }
};
