exports.getCurrentTime = async (req, res) => {
  try {
    const now = new Date();

    // Apply 2-hour backward shift for date boundary
    const twoHoursShift = 2 * 60 * 60 * 1000;
    const adjustedTime = new Date(now.getTime() - twoHoursShift);

    // Get start of day for the adjusted time
    const startOfDay = new Date(adjustedTime);
    startOfDay.setHours(0, 0, 0, 0);

    const response = {
      serverTime: now.toISOString(),
      adjustedTime: adjustedTime.toISOString(),
      adjustedDate: adjustedTime.toISOString().split("T")[0],
      startOfDay: startOfDay.toISOString(),
      timezone: "Asia/Kolkata",
      offset: "+05:30",
      note: "Time adjusted -2 hours for date boundary",

      // Keep legacy fields for backward compatibility (optional)
      istTime: adjustedTime.toISOString(),
      istDate: adjustedTime.toISOString().split("T")[0],
      utcStartOfDay: startOfDay.toISOString(),
    };

    console.log("Server time response:", JSON.stringify(response, null, 2));

    res.json(response);
  } catch (err) {
    console.error("Error getting current time:", err);
    res.status(500).json({ error: err.message });
  }
};

// exports.getCurrentTime = async (req, res) => {
//   try {
//     // Get current time in UTC
//     const now = new Date();

//     // Convert to IST (UTC+5:30)
//     const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
//     const istTime = new Date(now.getTime());

//     // Get start of day in IST
//     const istStartOfDay = new Date(istTime);
//     istStartOfDay.setHours(0, 0, 0, 0);

//     // Convert back to UTC for consistent storage
//     const utcStartOfDay = new Date(istStartOfDay.getTime());
//     console.log("UTC Start of Day:", istTime.toISOString());

//     res.json({
//       serverTime: now.toISOString(),
//       istTime: istTime.toISOString(),
//       istDate: istTime.toISOString().split("T")[0],
//       utcStartOfDay: utcStartOfDay.toISOString(),
//       timezone: "Asia/Kolkata",
//       offset: "+05:30",
//     });
//   } catch (err) {
//     console.error("Error getting current time:", err);
//     res.status(500).json({ error: err.message });
//   }
// };
