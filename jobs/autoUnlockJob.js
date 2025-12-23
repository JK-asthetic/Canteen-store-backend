// jobs/autoUnlockJob.js
const cron = require("node-cron");
const Canteen = require("../models/Canteen");

// Run every day at 2 AM (02:00)
const autoUnlockJob = cron.schedule(
  "0 2 * * *",
  async () => {
    try {
      const result = await Canteen.updateMany(
        {
          is_locked: true,
        },
        {
          $set: {
            is_locked: false,
            locked_at: null,
            locked_by: null,
            lock_reason: null,
          },
        }
      );

      console.log(
        `Auto-unlock completed: ${result.modifiedCount} canteens unlocked`
      );
    } catch (error) {
      console.error("Error in auto-unlock job:", error);
    }
  },
  {
    scheduled: false, // Don't start automatically, we'll call .start() manually
    timezone: "Asia/Kolkata",
  }
);

module.exports = autoUnlockJob;
