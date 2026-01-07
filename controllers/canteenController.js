const Canteen = require("../models/Canteen");

exports.createCanteen = async (req, res) => {
  try {
    const canteen = new Canteen(req.body);
    await canteen.save();
    res.status(201).json(canteen);
  } catch (err) {
    console.error("Error creating canteen:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCanteens = async (req, res) => {
  try {
    const { type, include_locked } = req.query;
    let query = {};

    if (type) {
      query.type = type;
    }

    // By default, include all canteens (locked and unlocked) for admin
    // Admin needs to see locked canteens to manage them
    if (include_locked === "false") {
      query.is_locked = { $ne: true };
    }

    const canteens = await Canteen.find(query).populate(
      "locked_by",
      "name email"
    );
    res.json(canteens);
  } catch (err) {
    console.error("Error fetching canteens:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCanteenById = async (req, res) => {
  try {
    const canteen = await Canteen.findById(req.params.id).populate(
      "locked_by",
      "name email"
    );
    if (!canteen) {
      return res.status(404).json({ error: "Canteen not found" });
    }

    // Auto-unlock if needed
    // await canteen.autoUnlockIfNeeded();

    res.json(canteen);
  } catch (err) {
    console.error("Error fetching canteen:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateCanteen = async (req, res) => {
  try {
    const updatedCanteen = await Canteen.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate("locked_by", "name email");

    if (!updatedCanteen) {
      return res.status(404).json({ error: "Canteen not found" });
    }

    res.json(updatedCanteen);
  } catch (err) {
    console.error("Error updating canteen:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteCanteen = async (req, res) => {
  try {
    const deletedCanteen = await Canteen.findByIdAndDelete(req.params.id);
    if (!deletedCanteen) {
      return res.status(404).json({ error: "Canteen not found" });
    }
    res.json({ message: "Canteen deleted successfully" });
  } catch (err) {
    console.error("Error deleting canteen:", err);
    res.status(500).json({ error: err.message });
  }
};

// Lock canteen
// Lock canteen - MODIFIED to handle verification parameter
exports.lockCanteen = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, is_verification } = req.body;
    const userId = req.user.id;

    const canteen = await Canteen.findById(id);
    if (!canteen) {
      return res.status(404).json({ error: "Canteen not found" });
    }

    // If it's a verification action
    if (is_verification) {
      // Keep existing lock_reason if already locked, append verification info
      const verificationText = `Verified by ${
        req.user.name || req.user.username
      }`;

      if (canteen.is_locked && canteen.lock_reason) {
        // Already locked - append verification info
        canteen.lock_reason = `${canteen.lock_reason} | ${verificationText}`;
      } else {
        // Not locked yet - just set verification
        canteen.is_locked = true;
        canteen.locked_at = new Date();
        canteen.locked_by = userId;
        canteen.lock_reason = verificationText;
      }
    } else {
      // Manual lock
      if (canteen.is_locked) {
        return res.status(400).json({ error: "Canteen is already locked" });
      }

      canteen.is_locked = true;
      canteen.locked_at = new Date();
      canteen.locked_by = userId;
      canteen.lock_reason = `Locked by ${req.user.username}${
        reason ? `: ${reason}` : ""
      }`;
    }

    await canteen.save();
    await canteen.populate("locked_by", "name email username");

    res.json({
      message: is_verification
        ? "Canteen verified and locked successfully"
        : "Canteen locked successfully",
      canteen,
    });
  } catch (err) {
    console.error("Error locking canteen:", err);
    res.status(500).json({ error: err.message });
  }
};
// Unlock canteen - Clear all lock information
exports.unlockCanteen = async (req, res) => {
  try {
    const { id } = req.params;

    const canteen = await Canteen.findById(id);
    if (!canteen) {
      return res.status(404).json({ error: "Canteen not found" });
    }

    if (!canteen.is_locked) {
      return res.status(400).json({ error: "Canteen is not locked" });
    }

    // Clear all lock and verification information
    canteen.is_locked = false;
    canteen.locked_at = null;
    canteen.locked_by = null;
    canteen.lock_reason = null;

    await canteen.save();

    res.json({
      message: "Canteen unlocked successfully",
      canteen,
    });
  } catch (err) {
    console.error("Error unlocking canteen:", err);
    res.status(500).json({ error: err.message });
  }
};
// Get locked canteens
exports.getLockedCanteens = async (req, res) => {
  try {
    const lockedCanteens = await Canteen.find({ is_locked: true }).populate(
      "locked_by",
      "name email"
    );

    res.json(lockedCanteens);
  } catch (err) {
    console.error("Error fetching locked canteens:", err);
    res.status(500).json({ error: err.message });
  }
};

// Manual auto-unlock check (can be called by a cron job)
exports.autoUnlockCanteens = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const result = await Canteen.updateMany(
      {
        is_locked: true,
        locked_at: { $lt: startOfToday },
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

    res.json({
      message: "Auto-unlock completed",
      unlockedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error in auto-unlock:", err);
    res.status(500).json({ error: err.message });
  }
};
