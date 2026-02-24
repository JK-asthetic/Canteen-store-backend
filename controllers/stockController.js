// controllers/stockController.js
const Stock = require("../models/Stock");
const Item = require("../models/Item");
const StockHistory = require("../models/StockHistory");

exports.updateStock = async (req, res) => {
  try {
    const { canteen_id, item_id, quantity, description } = req.body;

    // Find the current stock or create a new one
    let stock = await Stock.findOne({ canteen_id, item_id });

    // Get the old quantity for stock history
    const oldQuantity = stock ? stock.quantity : 0;
    const adjustedAmount = quantity - oldQuantity;

    if (!stock) {
      // Create new stock if it doesn't exist
      stock = new Stock({ canteen_id, item_id, quantity });
    } else {
      // Update existing stock
      stock.quantity = quantity;
      stock.updated_at = Date.now();
    }

    await stock.save();

    // Create stock history entry
    const date = new Date();
    date.setHours(0, 0, 0, 0); // Set to beginning of day for daily tracking

    let stockHistory = await StockHistory.findOne({
      canteen_id,
      item_id,
      date,
    });

    if (!stockHistory) {
      // Create new history entry for today
      stockHistory = new StockHistory({
        canteen_id,
        item_id,
        date,
        opening_stock: oldQuantity,
        closing_stock: quantity,
        adjusted_stock: adjustedAmount,
        adjustment_description: description || '',
      });

      // Calculate received/sold based on whether quantity increased or decreased
      if (quantity > oldQuantity) {
        stockHistory.received_stock = quantity - oldQuantity;
      } else if (quantity < oldQuantity) {
        stockHistory.sold_stock = oldQuantity - quantity;
      }
    } else {
      // Update existing history entry
      if (quantity > stockHistory.closing_stock) {
        stockHistory.received_stock += quantity - stockHistory.closing_stock;
      } else if (quantity < stockHistory.closing_stock) {
        stockHistory.sold_stock += stockHistory.closing_stock - quantity;
      }
      stockHistory.closing_stock = quantity;
      stockHistory.adjusted_stock = (stockHistory.adjusted_stock || 0) + adjustedAmount;
      if (description) {
        stockHistory.adjustment_description = stockHistory.adjustment_description
          ? `${stockHistory.adjustment_description}; ${description}`
          : description;
      }
    }

    await stockHistory.save();

    // Return stock with populated item data
    const populatedStock = await Stock.findById(stock._id).populate({
      path: "item_id",
      populate: [
        { path: "category", select: "name" },
        { path: "unit", select: "name abbreviation" },
      ],
    });

    res.status(200).json(populatedStock);
  } catch (err) {
    console.error("Error updating stock:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getStockByCanteen = async (req, res) => {
  try {
    const { canteen_id } = req.params;

    const stocks = await Stock.find({ canteen_id })
      .populate({
        path: "item_id",
        populate: [
          { path: "category", select: "name" },
          { path: "unit", select: "name abbreviation" },
        ],
      })
      .populate("canteen_id", "name location type");

    res.json(stocks);
  } catch (err) {
    console.error("Error fetching stocks:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getStockHistory = async (req, res) => {
  try {
    const { canteen_id, item_id } = req.params;

    // Default to last 30 days if not specified
    const days = req.query.days ? parseInt(req.query.days) : 30;

    let startDate;
    if (req.query.date) {
      // If specific date is provided, use it
      startDate = new Date(req.query.date);
      startDate.setHours(0, 0, 0, 0);
    } else {
      // Otherwise, calculate from current date
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
    }

    let endDate;
    if (req.query.date) {
      // Specific date: show just that day
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Last N days: end date is today end-of-day
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    const filter = {
      canteen_id,
      date: { $gte: startDate, $lte: endDate },
    };
    if (item_id) filter.item_id = item_id;

    const history = await StockHistory.find(filter)
      .populate({
        path: "item_id",
        select: "name",
        populate: [{ path: "unit", select: "name abbreviation" }],
      })
      .sort({ date: 1 });

    res.json(history);
  } catch (err) {
    console.error("Error fetching stock history:", err);
    res.status(500).json({ error: err.message });
  }
};
