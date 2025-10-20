// Create a separate file: jobs/autoUnlockJob.js
const cron = require('node-cron');
const Canteen = require('../models/Canteen');

// Run every day at midnight (00:00)
const autoUnlockJob = cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Running daily auto-unlock job...');
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const result = await Canteen.updateMany(
      {
        is_locked: true,
        locked_at: { $lt: startOfToday }
      },
      {
        $set: {
          is_locked: false,
          locked_at: null,
          locked_by: null,
          lock_reason: null
        }
      }
    );

    console.log(`Auto-unlock completed: ${result.modifiedCount} canteens unlocked`);
  } catch (error) {
    console.error('Error in auto-unlock job:', error);
  }
}, {
  timezone: "Asia/Kolkata" // Adjust timezone as needed
});

module.exports = autoUnlockJob;

// In your main app.js or server.js file, add:
/*
const autoUnlockJob = require('./jobs/autoUnlockJob');

// Start the cron job when the server starts
autoUnlockJob.start();

// To stop the job (if needed)
// autoUnlockJob.stop();
*/