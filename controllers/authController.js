// controllers/authController.js
const User = require("../models/User");
const Canteen = require("../models/Canteen");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username }).populate("canteen_id");
    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid credentials user not found" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(password, user.password);
      return res
        .status(400)
        .json({ error: "Invalid credentials password incorrect" });
    }

    // Check if user has an assigned canteen
    if (user.canteen_id) {
      const canteen = user.canteen_id;

      // Auto-unlock if needed (checks if it's a new day)
      await canteen.autoUnlockIfNeeded();

      // Check if canteen is locked
      if (canteen.is_locked) {
        return res.status(403).json({
          error: "The canteen is locked",
          message:
            canteen.lock_reason ||
            "Your assigned canteen is currently locked. Please contact an administrator.",
          locked_at: canteen.locked_at,
          locked_by: canteen.locked_by,
        });
      }
    }

    // Create and sign the JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d", // Token expires in 1 day
    });

    // Return token and user info
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      token,
      user: userResponse,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Check if user is admin
    if (user.role !== "super_admin") {
      return res
        .status(403)
        .json({ error: "Access denied. Admin privileges required." });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Create and sign the JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d", // Token expires in 1 day
      }
    );

    // Return token and user info
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      token,
      user: userResponse,
    });
  } catch (err) {
    console.error("Admin login error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.logout = (req, res) => {
  // JWT is stateless, so the client needs to remove the token.
  // This endpoint is mainly for compatibility and future extensions.
  res.json({ message: "Logged out successfully" });
};

exports.getCurrentUser = async (req, res) => {
  try {
    // Get token from header
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token, authorization denied" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by id
    const user = await User.findById(decoded.userId)
      .select("-password")
      .populate(
        "canteen_id",
        "name location type is_locked locked_at lock_reason"
      );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if canteen is locked (for current session validation)
    if (user.canteen_id && user.canteen_id.is_locked) {
      return res.status(403).json({
        error: "The canteen is locked",
        message:
          user.canteen_id.lock_reason ||
          "Your assigned canteen is currently locked.",
        locked_at: user.canteen_id.locked_at,
      });
    }

    res.json(user);
  } catch (err) {
    console.error("Get current user error:", err.message);
    res.status(401).json({ error: "Token is not valid" });
  }
};
