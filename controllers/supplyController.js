// controllers/supplyController.js
const Supply = require("../models/Supply");
const SupplyItem = require("../models/SupplyItem");
const Stock = require("../models/Stock");
const StockHistory = require("../models/StockHistory");
const Canteen = require("../models/Canteen");
const mongoose = require("mongoose");

// Helper function to check if a date is today
const isToday = (date) => {
  const today = new Date();
  const compareDate = new Date(date);

  return (
    compareDate.getDate() === today.getDate() &&
    compareDate.getMonth() === today.getMonth() &&
    compareDate.getFullYear() === today.getFullYear()
  );
};

exports.createSupply = async (req, res) => {
  try {
    const { from_canteen_id, to_canteen_id, items } = req.body;

    // Validate canteens exist
    const fromCanteen = await Canteen.findById(from_canteen_id);
    const toCanteen = await Canteen.findById(to_canteen_id);

    if (!fromCanteen || !toCanteen) {
      return res.status(404).json({ error: "One or both canteens not found" });
    }

    // Validate user permissions
    if (req.user.role === "manager") {
      if (req.user.canteen_id.toString() !== to_canteen_id) {
        return res.status(403).json({
          error: "You can only create supplies from your assigned canteen",
        });
      }
    }

    // Get today's date
    const now = new Date();
    const twoHoursShift = 2 * 60 * 60 * 1000;
    const adjustedTime = new Date(now.getTime() - twoHoursShift);
    const today = new Date(adjustedTime);
    today.setHours(0, 0, 0, 0);

    // Find or create supply for today
    let supply = await Supply.findOne({
      from_canteen_id,
      to_canteen_id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    if (!supply) {
      supply = new Supply({
        from_canteen_id,
        to_canteen_id,
        created_by: req.user._id,
        date: today,
      });
      await supply.save();
    }

    // Get today's total for each item (to validate negative quantities)
    const todayTotals = await SupplyItem.aggregate([
      {
        $match: {
          supply_id: supply._id,
        },
      },
      {
        $group: {
          _id: "$item_id",
          total: { $sum: "$quantity" },
        },
      },
    ]);

    const todayTotalsMap = {};
    todayTotals.forEach((t) => {
      todayTotalsMap[t._id.toString()] = t.total;
    });

    // Process each item
    const supplyItems = [];
    for (const item of items) {
      const itemIdStr = item.item_id.toString();

      // Validate negative quantity against ACTUAL STOCK
      if (item.quantity < 0) {
        const currentStock = await Stock.findOne({
          canteen_id: to_canteen_id, // or supply.to_canteen_id for updateSupply
          item_id: item.item_id,
        });

        const availableStock = currentStock ? currentStock.quantity : 0;

        if (availableStock + item.quantity < 0) {
          return res.status(400).json({
            error: `Insufficient stock for this item. Available stock: ${availableStock}, Attempting to reduce by: ${Math.abs(
              item.quantity
            )}. This would result in negative stock.`,
          });
        }
      }

      // Always create new entry (never update existing)
      const supplyItem = new SupplyItem({
        supply_id: supply._id,
        item_id: item.item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        created_by: req.user._id,
      });

      await supplyItem.save();
      supplyItems.push(supplyItem);

      // Update destination canteen stock
      let destStockItem = await Stock.findOne({
        canteen_id: to_canteen_id,
        item_id: item.item_id,
      });

      if (destStockItem) {
        const previousQuantity = destStockItem.quantity;
        destStockItem.quantity += item.quantity;
        destStockItem.updated_at = new Date();
        await destStockItem.save();

        // Update stock history
        await updateStockHistory(
          to_canteen_id,
          item.item_id,
          previousQuantity,
          destStockItem.quantity,
          Math.max(0, item.quantity), // received_stock only positive
          Math.max(0, -item.quantity) // sold_stock for negative quantities
        );
      } else {
        // Create new stock entry
        destStockItem = new Stock({
          canteen_id: to_canteen_id,
          item_id: item.item_id,
          quantity: Math.max(0, item.quantity),
          updated_at: new Date(),
        });
        await destStockItem.save();

        await updateStockHistory(
          to_canteen_id,
          item.item_id,
          0,
          destStockItem.quantity,
          Math.max(0, item.quantity),
          0
        );
      }
    }

    // Return full list of supply items with populated item and creator info
    const populatedItems = await SupplyItem.find({ supply_id: supply._id })
      .populate({
        path: "item_id",
        select: "name category unit",
        populate: [
          { path: "category", select: "name" },
          { path: "unit", select: "name abbreviation" },
        ],
      })
      .populate("created_by", "name username email")
      .sort({ created_at: 1 });

    const result = {
      ...supply.toObject(),
      items: populatedItems,
    };

    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating supply:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateSupply = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    const supply = await Supply.findById(id);

    if (!supply) {
      return res.status(404).json({ error: "Supply not found" });
    }

    // Check if supply is locked
    if (supply.is_locked) {
      return res.status(403).json({ error: "Cannot modify locked supply" });
    }

    // Check permissions
    if (req.user.role === "manager") {
      if (req.user.canteen_id.toString() !== supply.to_canteen_id.toString()) {
        return res.status(403).json({
          error: "You can only update supplies for your assigned canteen",
        });
      }
    }

    // Get today's total for each item
    const todayTotals = await SupplyItem.aggregate([
      {
        $match: {
          supply_id: supply._id,
        },
      },
      {
        $group: {
          _id: "$item_id",
          total: { $sum: "$quantity" },
        },
      },
    ]);

    const todayTotalsMap = {};
    todayTotals.forEach((t) => {
      todayTotalsMap[t._id.toString()] = t.total;
    });

    // Process each item
    const supplyItems = [];
    for (const item of items) {
      const itemIdStr = item.item_id.toString();

      // Validate negative quantity against ACTUAL STOCK
      if (item.quantity < 0) {
        const currentStock = await Stock.findOne({
          canteen_id: supply.to_canteen_id, // or supply.to_canteen_id for updateSupply
          item_id: item.item_id,
        });

        const availableStock = currentStock ? currentStock.quantity : 0;

        if (availableStock + item.quantity < 0) {
          return res.status(400).json({
            error: `Insufficient stock for this item. Available stock: ${availableStock}, Attempting to reduce by: ${Math.abs(
              item.quantity
            )}. This would result in negative stock.`,
          });
        }
      }

      // Always create new entry
      const supplyItem = new SupplyItem({
        supply_id: supply._id,
        item_id: item.item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        created_by: req.user._id,
      });

      await supplyItem.save();
      supplyItems.push(supplyItem);

      // Update destination canteen stock
      let destStockItem = await Stock.findOne({
        canteen_id: supply.to_canteen_id,
        item_id: item.item_id,
      });

      if (destStockItem) {
        const previousQuantity = destStockItem.quantity;
        destStockItem.quantity += item.quantity;
        destStockItem.updated_at = new Date();
        await destStockItem.save();

        // Update stock history
        const now = new Date();
        const twoHoursShift = 2 * 60 * 60 * 1000;
        const adjustedTime = new Date(now.getTime() - twoHoursShift);
        const today = new Date(adjustedTime);
        today.setHours(0, 0, 0, 0);

        let stockHistory = await StockHistory.findOne({
          canteen_id: supply.to_canteen_id,
          item_id: item.item_id,
          date: today,
        });

        if (stockHistory) {
          if (item.quantity > 0) {
            stockHistory.received_stock += item.quantity;
          } else {
            stockHistory.sold_stock += Math.abs(item.quantity);
          }
          stockHistory.closing_stock = destStockItem.quantity;
          await stockHistory.save();
        } else if (item.quantity > 0) {
          stockHistory = new StockHistory({
            canteen_id: supply.to_canteen_id,
            item_id: item.item_id,
            date: today,
            opening_stock: previousQuantity,
            received_stock: item.quantity,
            sold_stock: 0,
            closing_stock: destStockItem.quantity,
          });
          await stockHistory.save();
        }
      } else if (item.quantity > 0) {
        destStockItem = new Stock({
          canteen_id: supply.to_canteen_id,
          item_id: item.item_id,
          quantity: item.quantity,
          updated_at: new Date(),
        });
        await destStockItem.save();

        const stockHistory = new StockHistory({
          canteen_id: supply.to_canteen_id,
          item_id: item.item_id,
          date: new Date(),
          opening_stock: 0,
          received_stock: item.quantity,
          sold_stock: 0,
          closing_stock: item.quantity,
        });
        await stockHistory.save();
      }
    }

    supply.updated_at = new Date();
    await supply.save();

    // Return full list of supply items with populated item and creator info
    const populatedItems = await SupplyItem.find({ supply_id: supply._id })
      .populate({
        path: "item_id",
        select: "name category unit",
        populate: [
          { path: "category", select: "name" },
          { path: "unit", select: "name abbreviation" },
        ],
      })
      .populate("created_by", "name username email")
      .sort({ created_at: 1 });

    const result = {
      ...supply.toObject(),
      items: populatedItems,
    };

    res.status(200).json(result);
  } catch (err) {
    console.error("Error updating supply:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.removeSupplyItem = async (req, res) => {
  try {
    const { supplyId, itemId } = req.params;

    // Find the supply
    const supply = await Supply.findById(supplyId);
    if (!supply) {
      return res.status(404).json({ error: "Supply not found" });
    }

    // Check permissions
    if (req.user.role === "manager") {
      if (req.user.canteen_id.toString() !== supply.to_canteen_id.toString()) {
        return res.status(403).json({
          error: "You can only update supplies for your assigned canteen",
        });
      }
    }

    // Find the supply item
    const supplyItem = await SupplyItem.findOne({
      supply_id: supplyId,
      item_id: itemId,
    });

    if (!supplyItem) {
      return res.status(404).json({ error: "Supply item not found" });
    }

    const removedQuantity = supplyItem.quantity;

    // Remove the item from supply
    await SupplyItem.deleteOne({ _id: supplyItem._id });

    // Update destination canteen stock (reduce by the removed quantity)
    const destStockItem = await Stock.findOne({
      canteen_id: supply.to_canteen_id,
      item_id: itemId,
    });

    if (destStockItem) {
      const previousQuantity = destStockItem.quantity;
      destStockItem.quantity = Math.max(
        0,
        destStockItem.quantity - removedQuantity
      );
      destStockItem.updated_at = new Date();
      await destStockItem.save();

      // Find today's stock history record to update it
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stockHistory = await StockHistory.findOne({
        canteen_id: supply.to_canteen_id,
        item_id: itemId,
        date: today,
      });

      if (stockHistory) {
        // Directly update the stock history to reduce received_stock
        stockHistory.received_stock = Math.max(
          0,
          stockHistory.received_stock - removedQuantity
        );
        stockHistory.closing_stock = destStockItem.quantity;
        await stockHistory.save();
      }
    }

    // Update supply's last modified time
    supply.updated_at = new Date();
    await supply.save();

    // If this was the last item in the supply, optionally remove the whole supply
    const remainingItems = await SupplyItem.countDocuments({
      supply_id: supplyId,
    });
    if (remainingItems === 0) {
      await Supply.deleteOne({ _id: supplyId });
    }

    res.status(200).json({ message: "Supply item removed successfully" });
  } catch (err) {
    console.error("Error removing supply item:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSupplies = async (req, res) => {
  try {
    // Apply filters based on user role
    let filter = {};

    // If user is a manager, restrict to supplies involving their canteen
    if (req.user.role === "manager") {
      filter = {
        $or: [
          { from_canteen_id: req.user.canteen_id },
          { to_canteen_id: req.user.canteen_id },
        ],
      };
    }

    // Apply status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const supplies = await Supply.find(filter)
      .populate("from_canteen_id", "name location")
      .populate("to_canteen_id", "name location")
      .populate("created_by", "name username")
      .sort({ date: -1 });

    // For each supply, get its items
    const suppliesWithItems = await Promise.all(
      supplies.map(async (supply) => {
        const items = await SupplyItem.find({ supply_id: supply._id })
          .populate({
            path: "item_id",
            select: "name category unit",
            populate: [
              { path: "category", select: "name" },
              { path: "unit", select: "name abbreviation" },
            ],
          })
          .populate("created_by", "name username");

        return {
          ...supply.toObject(),
          items,
        };
      })
    );

    res.json(suppliesWithItems);
  } catch (err) {
    console.error("Error fetching supplies:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSupplyById = async (req, res) => {
  try {
    const supply = await Supply.findById(req.params.id)
      .populate("from_canteen_id", "name location type")
      .populate("to_canteen_id", "name location type")
      .populate("created_by", "name username");

    if (!supply) {
      return res.status(404).json({ error: "Supply not found" });
    }

    // Check permissions if user is a manager
    if (req.user.role === "manager") {
      const userCanteenId = req.user.canteen_id.toString();
      const fromCanteenId = supply.from_canteen_id._id.toString();
      const toCanteenId = supply.to_canteen_id._id.toString();

      if (userCanteenId !== fromCanteenId && userCanteenId !== toCanteenId) {
        return res.status(403).json({
          error: "You can only view supplies related to your canteen",
        });
      }
    }

    // Get supply items
    const items = await SupplyItem.find({ supply_id: supply._id })
      .populate({
        path: "item_id",
        select: "name category unit",
        populate: [
          { path: "category", select: "name" },
          { path: "unit", select: "name abbreviation" },
        ],
      })
      .populate("created_by", "name username");

    const result = {
      ...supply.toObject(),
      items,
    };

    res.json(result);
  } catch (err) {
    console.error("Error fetching supply:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSuppliesFromCanteen = async (req, res) => {
  try {
    const { canteenId } = req.params;

    // Check permissions if user is a manager
    if (
      req.user.role === "manager" &&
      req.user.canteen_id.toString() !== canteenId
    ) {
      return res
        .status(403)
        .json({ error: "You can only view supplies from your canteen" });
    }

    const supplies = await Supply.find({ from_canteen_id: canteenId })
      .populate("to_canteen_id", "name location")
      .populate("created_by", "name username")
      .sort({ date: -1 });

    // For each supply, get its items
    const suppliesWithItems = await Promise.all(
      supplies.map(async (supply) => {
        const items = await SupplyItem.find({ supply_id: supply._id })
          .populate({
            path: "item_id",
            select: "name category unit",
            populate: [
              { path: "category", select: "name" },
              { path: "unit", select: "name abbreviation" },
            ],
          })
          .populate("created_by", "name username");

        return {
          ...supply.toObject(),
          items,
        };
      })
    );

    res.json(suppliesWithItems);
  } catch (err) {
    console.error("Error fetching supplies from canteen:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSuppliesToCanteen = async (req, res) => {
  try {
    const { canteenId } = req.params;

    // Check permissions if user is a manager
    if (
      req.user.role === "manager" &&
      req.user.canteen_id.toString() !== canteenId
    ) {
      return res
        .status(403)
        .json({ error: "You can only view supplies to your canteen" });
    }

    const supplies = await Supply.find({ to_canteen_id: canteenId })
      .populate("from_canteen_id", "name location")
      .populate("created_by", "name username")
      .sort({ date: -1 });

    // For each supply, get its items
    const suppliesWithItems = await Promise.all(
      supplies.map(async (supply) => {
        const items = await SupplyItem.find({ supply_id: supply._id })
          .populate({
            path: "item_id",
            select: "name category unit",
            populate: [
              { path: "category", select: "name" },
              { path: "unit", select: "name abbreviation" },
            ],
          })
          .populate("created_by", "name username");

        return {
          ...supply.toObject(),
          items,
        };
      })
    );

    res.json(suppliesWithItems);
  } catch (err) {
    console.error("Error fetching supplies to canteen:", err);
    res.status(500).json({ error: err.message });
  }
};

// Helper function to update stock history
// REPLACE the updateStockHistory helper function:
async function updateStockHistory(
  canteenId,
  itemId,
  openingStock,
  closingStock,
  receivedStock,
  soldStock
) {
  const now = new Date();
  const twoHoursShift = 2 * 60 * 60 * 1000;
  const adjustedTime = new Date(now.getTime() - twoHoursShift);
  const today = new Date(adjustedTime);
  today.setHours(0, 0, 0, 0);

  console.log("Updating stock history - adjusted today:", today);

  let stockHistory = await StockHistory.findOne({
    canteen_id: canteenId,
    item_id: itemId,
    date: today,
  });

  if (stockHistory) {
    // Update existing record
    stockHistory.received_stock += receivedStock;
    stockHistory.sold_stock += soldStock;
    stockHistory.closing_stock = closingStock;
    await stockHistory.save();
  } else {
    // Create new record
    stockHistory = new StockHistory({
      canteen_id: canteenId,
      item_id: itemId,
      date: today,
      opening_stock: openingStock,
      received_stock: receivedStock,
      sold_stock: soldStock,
      closing_stock: closingStock,
    });
    await stockHistory.save();
  }

  return stockHistory;
}
exports.getSuppliesByItemAndMonth = async (req, res) => {
  try {
    const { canteen_id, item_id } = req.params;
    const { year, month } = req.query;

    console.log("Request params:", { canteen_id, item_id, year, month });

    // Default to current month if not specified
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();

    // Calculate start and end dates for the month
    const startDate = new Date(targetYear, targetMonth, 1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(targetYear, targetMonth + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Step 1: Find all supply_ids that have this item
    const supplyItemsWithItem = await SupplyItem.find({
      item_id: item_id,
    }).distinct("supply_id");

    // Step 2: Find supplies in date range that match those supply_ids
    const supplies = await Supply.find({
      _id: { $in: supplyItemsWithItem },
      to_canteen_id: canteen_id,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate("from_canteen_id", "name location")
      .populate("to_canteen_id", "name location")
      .sort({ date: -1 });

    // Step 3: For each supply, get only the items for this specific item_id
    const suppliesWithItems = await Promise.all(
      supplies.map(async (supply) => {
        const items = await SupplyItem.find({
          supply_id: supply._id,
          item_id: item_id,
        })
          .populate({
            path: "item_id",
            select: "name description mrp category unit",
            populate: [
              { path: "category", select: "name" },
              { path: "unit", select: "name abbreviation" },
            ],
          })
          .populate("created_by", "name username");

        // Calculate total_price for each item if not stored
        const itemsWithTotal = items.map((item) => ({
          ...item.toObject(),
          total_price: item.quantity * item.unit_price,
        }));

        return {
          ...supply.toObject(),
          items: itemsWithTotal,
        };
      })
    );

    res.json(suppliesWithItems);
  } catch (err) {
    console.error("Error fetching supplies by item:", err);
    res.status(500).json({ error: err.message });
  }
};
