const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const Stock = require("../models/Stock");
const StockHistory = require("../models/StockHistory");
const Item = require("../models/Item");

// Special category ID that increases stock instead of decreasing
const SPECIAL_CATEGORY_ID = "68fd9f0be8e2ff65f8459ffa";

// Helper to send consistent error responses to frontend
const sendError = (res, status = 500, err) => {
  const message =
    err && err.message ? err.message : String(err) || "Internal server error";
  const payload = { error: message };

  // Include stack trace when not in production to aid debugging
  if (process.env.NODE_ENV !== "production" && err && err.stack) {
    payload.stack = err.stack;
  }

  return res.status(status).json(payload);
};
exports.createSale = async (req, res) => {
  try {
    const {
      canteen_id,
      items,
      cash_amount,
      online_amount,
      other_amount,
      description,
      previous_day_adjustment: frontendAdjustment, // ✅ Accept from frontend
      previous_day_reason: frontendReason, // ✅ Accept from frontend
    } = req.body;

    // Validate if current user belongs to this canteen (for managers)
    if (
      req.user.role === "manager" &&
      req.user.canteen_id.toString() !== canteen_id
    ) {
      return res
        .status(403)
        .json({ error: "You can only create sales for your assigned canteen" });
    }

    // Get today's date
    const now = new Date();
    const twoHoursShift = 2 * 60 * 60 * 1000;
    const adjustedTime = new Date(now.getTime() - twoHoursShift);
    const today = new Date(adjustedTime);
    today.setHours(0, 0, 0, 0);

    // Check for existing sale today
    let sale = await Sale.findOne({
      canteen_id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    // ✅ Use frontend adjustment if provided, otherwise check for yesterday's sale
    let previous_day_adjustment = 0;
    let previous_day_reason = "";

    if (frontendAdjustment !== undefined && frontendAdjustment !== null) {
      // Use adjustment from frontend (for new sales created via mobile app)
      previous_day_adjustment = frontendAdjustment;
      previous_day_reason = frontendReason || "";
    } else {
      // Fallback: Get yesterday's sale to check for adjustments
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdaySale = await Sale.findOne({
        canteen_id,
        date: {
          $gte: yesterday,
          $lt: today,
        },
      });

      if (yesterdaySale && yesterdaySale.next_day_adjustment) {
        previous_day_adjustment = yesterdaySale.next_day_adjustment;
        previous_day_reason = yesterdaySale.next_day_reason || "";
      }
    }

    // Calculate total amount from items
    let itemsTotal = 0;
    for (const item of items) {
      itemsTotal += item.quantity * item.unit_price;
    }
    itemsTotal = Math.round((itemsTotal + Number.EPSILON) * 100) / 100;

    // Total amount includes items + previous day adjustment
    const total_amount = itemsTotal + previous_day_adjustment;

    // Validate payment amounts
    const provided_total =
      (cash_amount || 0) + (online_amount || 0) + (other_amount || 0);
    if (Math.abs(provided_total - total_amount) > 0.01) {
      return res.status(400).json({
        error:
          "Cash + Online + Other amounts must equal total amount (including previous day adjustment)",
        expected: total_amount,
        provided: provided_total,
        items_total: itemsTotal,
        previous_day_adjustment: previous_day_adjustment,
      });
    }

    const saleItems = [];
    if (sale) {
      // ✅ Update existing sale - always use the calculated adjustment
      sale.total_amount = total_amount;
      sale.cash_amount = cash_amount || 0;
      sale.online_amount = online_amount || 0;
      sale.other_amount = other_amount || 0;
      sale.description = description || sale.description;
      sale.previous_day_adjustment = previous_day_adjustment; // ✅ Always update
      sale.previous_day_reason = previous_day_reason; // ✅ Always update
      sale.updated_at = new Date();
    } else {
      // Create new sale
      sale = new Sale({
        canteen_id,
        total_amount,
        cash_amount: cash_amount || 0,
        online_amount: online_amount || 0,
        other_amount: other_amount || 0,
        description: description || undefined,
        previous_day_adjustment,
        previous_day_reason,
        created_by: req.user._id,
        date: today,
      });
    }

    await sale.save();

    // ... rest of the code for handling items (same as before)
    for (const item of items) {
      const itemDetails = await Item.findById(item.item_id);
      if (!itemDetails) {
        return res.status(400).json({
          error: `Item ${item.item_id} not found`,
        });
      }

      const isSpecialCategory =
        itemDetails.category &&
        itemDetails.category.toString() === SPECIAL_CATEGORY_ID;

      let saleItem = await SaleItem.findOne({
        sale_id: sale._id,
        item_id: item.item_id,
      });

      const stock = await Stock.findOne({
        canteen_id,
        item_id: item.item_id,
      });

      if (!stock) {
        return res.status(400).json({
          error: `Stock not found for item ${item.item_id}`,
        });
      }

      if (!isSpecialCategory && stock.quantity < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for item ${item.item_id}`,
        });
      }

      let quantityDiff = item.quantity;
      if (saleItem) {
        quantityDiff = item.quantity - saleItem.quantity;
        saleItem.quantity = item.quantity;
        saleItem.unit_price = item.unit_price;
        saleItem.total_price = item.quantity * item.unit_price;
      } else {
        saleItem = new SaleItem({
          sale_id: sale._id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
        });
      }

      await saleItem.save();
      saleItems.push(saleItem);

      if (isSpecialCategory) {
        stock.quantity += quantityDiff;
      } else {
        stock.quantity -= quantityDiff;
      }
      stock.updated_at = new Date();
      await stock.save();

      let stockHistory = await StockHistory.findOne({
        canteen_id,
        item_id: item.item_id,
        date: today,
      });

      if (stockHistory) {
        stockHistory.sold_stock += quantityDiff;
        stockHistory.closing_stock = stock.quantity;
        stockHistory.updated_at = new Date();
        await stockHistory.save();
      } else {
        const openingStock = isSpecialCategory
          ? stock.quantity - quantityDiff
          : stock.quantity + quantityDiff;

        stockHistory = new StockHistory({
          canteen_id,
          item_id: item.item_id,
          date: today,
          opening_stock: openingStock,
          sold_stock: quantityDiff,
          closing_stock: stock.quantity,
          created_at: new Date(),
        });
        await stockHistory.save();
      }
    }

    const result = {
      ...sale.toObject(),
      items: saleItems,
    };

    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating/updating sale:", err);
    return sendError(res, 500, err);
  }
};

exports.verifySale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { adjustment_amount, reason } = req.body;

    // Only admin can verify
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Only admins can verify sales" });
    }

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    // Check if already verified
    if (sale.verified_by) {
      return res.status(400).json({ error: "Sale already verified" });
    }

    // Validate adjustment amount
    if (typeof adjustment_amount !== "number") {
      return res
        .status(400)
        .json({ error: "Adjustment amount must be a number" });
    }

    if (!reason || reason.trim() === "") {
      return res
        .status(400)
        .json({ error: "Reason is required for verification" });
    }

    // Set next day adjustment (this will be picked up by tomorrow's sale)
    sale.next_day_adjustment = adjustment_amount;
    sale.next_day_reason = reason.trim();
    sale.verified_by = req.user._id;
    sale.verified_at = new Date();

    await sale.save();

    // Lock the canteen after verification
    const Canteen = require("../models/Canteen");
    await Canteen.findByIdAndUpdate(sale.canteen_id, {
      $set: {
        is_locked: true,
        locked_at: new Date(),
        locked_by: req.user._id,
        lock_reason: `Sale verified By ${req.user.username}`,
      },
    });

    const result = await Sale.findById(saleId)
      .populate("canteen_id", "name location")
      .populate("created_by", "name username")
      .populate("verified_by", "name username");

    res.json(result);
  } catch (err) {
    console.error("Error verifying sale:", err);
    return sendError(res, 500, err);
  }
};

// New: Update verification for today's sale (or update existing verification) - only admins
exports.updateVerifySale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { adjustment_amount, reason } = req.body;

    // Only admin can update verification
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res
        .status(403)
        .json({ error: "Only admins can update verification" });
    }

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    // Validate that sale date is today (adjusted for 2 AM boundary)
    const now = new Date();
    const twoHoursShift = 2 * 60 * 60 * 1000;
    const adjustedTime = new Date(now.getTime() - twoHoursShift);
    const today = new Date(adjustedTime);
    today.setHours(0, 0, 0, 0);
    const saleDate = new Date(sale.date);
    saleDate.setHours(0, 0, 0, 0);

    if (saleDate.getTime() !== today.getTime()) {
      return res
        .status(403)
        .json({ error: "You can only update verification for today's sale" });
    }

    // Validate adjustment amount
    if (typeof adjustment_amount !== "number") {
      return res
        .status(400)
        .json({ error: "Adjustment amount must be a number" });
    }

    if (!reason || reason.trim() === "") {
      return res
        .status(400)
        .json({ error: "Reason is required for verification" });
    }

    // Update verification fields
    sale.next_day_adjustment = adjustment_amount;
    sale.next_day_reason = reason.trim();
    sale.verified_by = req.user._id;
    sale.verified_at = new Date();

    await sale.save();

    // Lock the canteen after verification update
    const Canteen = require("../models/Canteen");
    await Canteen.findByIdAndUpdate(sale.canteen_id, {
      $set: {
        is_locked: true,
        locked_at: new Date(),
        locked_by: req.user._id,
        lock_reason: `Sale verified By ${req.user.username}`,
      },
    });

    const result = await Sale.findById(saleId)
      .populate("canteen_id", "name location")
      .populate("created_by", "name username")
      .populate("verified_by", "name username");

    res.json(result);
  } catch (err) {
    console.error("Error updating sale verification:", err);
    return sendError(res, 500, err);
  }
};

exports.updateSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { items, cash_amount, online_amount, other_amount, description } =
      req.body;

    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    // Validate permissions
    if (
      req.user.role === "manager" &&
      req.user.canteen_id &&
      sale.canteen_id &&
      req.user.canteen_id.toString() !== sale.canteen_id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "You can only edit sales from your canteen" });
    }

    // Validate if sale is from today
    const now = new Date();
    const twoHoursShift = 2 * 60 * 60 * 1000;
    const adjustedTime = new Date(now.getTime() - twoHoursShift);
    const today = new Date(adjustedTime);
    today.setHours(0, 0, 0, 0);
    const saleDate = new Date(sale.date);
    saleDate.setHours(0, 0, 0, 0);
    if (saleDate.getTime() !== today.getTime()) {
      return res.status(403).json({
        error: "You can only edit sales for today (adjusted for 2 AM boundary)",
      });
    }

    // Calculate total amount from items
    let itemsTotal = 0;
    for (const item of items) {
      itemsTotal += item.quantity * item.unit_price;
    }
    itemsTotal = Math.round((itemsTotal + Number.EPSILON) * 100) / 100;

    // Total includes previous day adjustment (don't change it)
    const total_amount = itemsTotal + (sale.previous_day_adjustment || 0);

    // Validate payment amounts
    const provided_total =
      (cash_amount || 0) + (online_amount || 0) + (other_amount || 0);
    if (Math.abs(provided_total - total_amount) > 0.01) {
      return res.status(400).json({
        error:
          "Cash + Online + Other amounts must equal total amount (including previous day adjustment)",
        expected: total_amount,
        provided: provided_total,
        items_total: itemsTotal,
        previous_day_adjustment: sale.previous_day_adjustment || 0,
      });
    }

    // Update sale
    sale.total_amount = total_amount;
    sale.cash_amount = cash_amount || 0;
    sale.online_amount = online_amount || 0;
    sale.other_amount = other_amount || 0;
    if (description !== undefined) {
      sale.description = description;
    }
    // DON'T change previous_day_adjustment - it's locked once set
    sale.updated_at = new Date();
    await sale.save();

    // ... rest of the code for handling items (same as before)
    const existingItems = await SaleItem.find({ sale_id: sale._id });
    const saleItems = [];

    for (const item of items) {
      const itemDetails = await Item.findById(item.item_id);
      if (!itemDetails) {
        return res.status(400).json({
          error: `Item ${item.item_id} not found`,
        });
      }

      const isSpecialCategory = itemDetails.category
        ? itemDetails.category.toString() === SPECIAL_CATEGORY_ID
        : false;

      let saleItem = existingItems.find(
        (i) => i.item_id.toString() === item.item_id
      );
      const stock = await Stock.findOne({
        canteen_id: sale.canteen_id,
        item_id: item.item_id,
      });

      if (!stock) {
        return res.status(400).json({
          error: `Stock not found for item ${item.item_id}`,
        });
      }

      const originalQuantity = saleItem ? saleItem.quantity : 0;

      if (!isSpecialCategory) {
        const availableStock = stock.quantity + originalQuantity;
        if (item.quantity > availableStock) {
          return res.status(400).json({
            error: `Insufficient stock for item ${item.item_id}. Available: ${availableStock}`,
          });
        }
      }

      const quantityDiff = item.quantity - originalQuantity;

      if (saleItem) {
        saleItem.quantity = item.quantity;
        saleItem.unit_price = item.unit_price;
        saleItem.total_price = item.quantity * item.unit_price;
      } else {
        saleItem = new SaleItem({
          sale_id: sale._id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
        });
      }

      await saleItem.save();
      saleItems.push(saleItem);

      if (isSpecialCategory) {
        stock.quantity += quantityDiff;
      } else {
        stock.quantity -= quantityDiff;
      }
      stock.updated_at = new Date();
      await stock.save();

      const historyDate = new Date(sale.date);
      historyDate.setHours(0, 0, 0, 0);

      let stockHistory = await StockHistory.findOne({
        canteen_id: sale.canteen_id,
        item_id: item.item_id,
        date: historyDate,
      });

      if (stockHistory) {
        stockHistory.sold_stock += quantityDiff;
        stockHistory.closing_stock = stock.quantity;
        stockHistory.updated_at = new Date();
        await stockHistory.save();
      } else {
        const openingStock = isSpecialCategory
          ? stock.quantity - quantityDiff
          : stock.quantity + quantityDiff;

        stockHistory = new StockHistory({
          canteen_id: sale.canteen_id,
          item_id: item.item_id,
          date: historyDate,
          opening_stock: openingStock,
          sold_stock: quantityDiff,
          closing_stock: stock.quantity,
          created_at: new Date(),
        });
        await stockHistory.save();
      }
    }

    for (const existingItem of existingItems) {
      const itemIdStr = existingItem.item_id
        ? existingItem.item_id.toString()
        : null;
      if (!itemIdStr || !items.find((i) => i.item_id === itemIdStr)) {
        const itemDetails = await Item.findById(existingItem.item_id);
        const isSpecialCategory =
          itemDetails && itemDetails.category
            ? itemDetails.category.toString() === SPECIAL_CATEGORY_ID
            : false;

        const stock = await Stock.findOne({
          canteen_id: sale.canteen_id,
          item_id: existingItem.item_id,
        });

        if (stock) {
          if (isSpecialCategory) {
            stock.quantity -= existingItem.quantity;
          } else {
            stock.quantity += existingItem.quantity;
          }
          stock.updated_at = new Date();
          await stock.save();

          const historyDate = new Date(sale.date);
          historyDate.setHours(0, 0, 0, 0);

          let stockHistory = await StockHistory.findOne({
            canteen_id: sale.canteen_id,
            item_id: existingItem.item_id,
            date: historyDate,
          });

          if (stockHistory) {
            stockHistory.sold_stock -= existingItem.quantity;
            stockHistory.closing_stock = stock.quantity;
            stockHistory.updated_at = new Date();
            await stockHistory.save();
          } else {
            stockHistory = new StockHistory({
              canteen_id: sale.canteen_id,
              item_id: existingItem.item_id,
              date: historyDate,
              opening_stock: stock.quantity,
              sold_stock: 0,
              closing_stock: stock.quantity,
              created_at: new Date(),
            });
            await stockHistory.save();
          }
        }

        await SaleItem.deleteOne({ _id: existingItem._id });
      }
    }

    const result = {
      ...sale.toObject(),
      items: saleItems,
    };

    res.json(result);
  } catch (err) {
    console.error("Error updating sale:", err);
    return sendError(res, 500, err);
  }
};

exports.getSales = async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "manager") {
      filter.canteen_id = req.user.canteen_id;
    }

    if (req.query.date) {
      const date = new Date(req.query.date);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);

      filter.date = {
        $gte: date,
        $lt: nextDay,
      };
    }

    const sales = await Sale.find(filter)
      .populate("canteen_id", "name location")
      .populate("created_by", "name username")
      .sort({ date: -1 });

    const salesWithItems = await Promise.all(
      sales.map(async (sale) => {
        const items = await SaleItem.find({ sale_id: sale._id }).populate(
          "item_id",
          "name category unit"
        );

        return {
          ...sale.toObject(),
          items,
        };
      })
    );

    res.json(salesWithItems);
  } catch (err) {
    console.error("Error fetching sales:", err);
    return sendError(res, 500, err);
  }
};

exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("canteen_id", "name location type")
      .populate("created_by", "name username");

    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    if (
      req.user.role === "manager" &&
      req.user.canteen_id.toString() !== sale.canteen_id._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "You can only view sales from your canteen" });
    }

    const items = await SaleItem.find({ sale_id: sale._id }).populate(
      "item_id",
      "name category unit"
    );

    const result = {
      ...sale.toObject(),
      items,
    };

    res.json(result);
  } catch (err) {
    console.error("Error fetching sale:", err);
    return sendError(res, 500, err);
  }
};

exports.getSalesByCanteen = async (req, res) => {
  try {
    const { canteenId } = req.params;

    if (
      req.user.role === "manager" &&
      req.user.canteen_id.toString() !== canteenId
    ) {
      return res
        .status(403)
        .json({ error: "You can only view sales from your canteen" });
    }

    const sales = await Sale.find({ canteen_id: canteenId })
      .populate("created_by", "name username")
      .sort({ date: -1 });

    const salesWithItems = await Promise.all(
      sales.map(async (sale) => {
        const items = await SaleItem.find({ sale_id: sale._id }).populate(
          "item_id",
          "name category unit"
        );

        return {
          ...sale.toObject(),
          items,
        };
      })
    );

    res.json(salesWithItems);
  } catch (err) {
    console.error("Error fetching sales by canteen:", err);
    return sendError(res, 500, err);
  }
};

exports.getSalesByDateAndCanteen = async (req, res) => {
  try {
    let filter = {};

    // Apply role-based filtering
    if (req.user.role === "manager") {
      filter.canteen_id = req.user.canteen_id;
    }

    // Apply canteen filter from query params (if user has permission)
    if (req.query.canteen_id) {
      if (
        req.user.role === "manager" &&
        req.user.canteen_id.toString() !== req.query.canteen_id
      ) {
        return res.status(403).json({
          error: "You can only view sales from your assigned canteen",
        });
      }
      filter.canteen_id = req.query.canteen_id;
    }

    // Apply date filter from query params
    if (req.query.date) {
      const date = new Date(req.query.date);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);

      filter.date = {
        $gte: date,
        $lt: nextDay,
      };
    }

    const sales = await Sale.find(filter)
      .populate("canteen_id", "name location")
      .populate("created_by", "name username")
      .sort({ date: -1 });

    const salesWithItems = await Promise.all(
      sales.map(async (sale) => {
        const items = await SaleItem.find({ sale_id: sale._id }).populate(
          "item_id",
          "name category unit"
        );

        return {
          ...sale.toObject(),
          items,
        };
      })
    );

    res.json(salesWithItems);
  } catch (err) {
    console.error("Error fetching sales by date and canteen:", err);
    return sendError(res, 500, err);
  }
};

exports.getSalesByDateRange = async (req, res) => {
  try {
    const { start_date, end_date, canteen_id } = req.query;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "Start and end dates are required" });
    }

    const filter = {
      date: {
        $gte: new Date(start_date),
        $lte: new Date(end_date),
      },
    };

    if (canteen_id) {
      filter.canteen_id = canteen_id;
      if (
        req.user.role === "manager" &&
        req.user.canteen_id.toString() !== canteen_id
      ) {
        return res
          .status(403)
          .json({ error: "You can only view sales from your canteen" });
      }
    } else if (req.user.role === "manager") {
      filter.canteen_id = req.user.canteen_id;
    }

    const sales = await Sale.find(filter)
      .populate("canteen_id", "name location")
      .populate("created_by", "name username")
      .sort({ date: 1 });

    const salesByDate = {};
    for (const sale of sales) {
      const dateStr = sale.date.toISOString().split("T")[0];
      if (!salesByDate[dateStr]) {
        salesByDate[dateStr] = {
          date: dateStr,
          total_amount: 0,
          cash_amount: 0,
          online_amount: 0,
          other_amount: 0,
          sales_count: 0,
          total_items: 0,
        };
      }
      salesByDate[dateStr].total_amount += sale.total_amount;
      salesByDate[dateStr].cash_amount += sale.cash_amount || 0;
      salesByDate[dateStr].online_amount += sale.online_amount || 0;
      salesByDate[dateStr].other_amount += sale.other_amount || 0;
      salesByDate[dateStr].sales_count += 1;
      const items = await SaleItem.find({ sale_id: sale._id });
      salesByDate[dateStr].total_items += items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
    }

    const result = Object.values(salesByDate).map((day) => ({
      ...day,
      total_amount: Math.round((day.total_amount + Number.EPSILON) * 100) / 100,
      cash_amount: Math.round((day.cash_amount + Number.EPSILON) * 100) / 100,
      online_amount:
        Math.round((day.online_amount + Number.EPSILON) * 100) / 100,
      other_amount: Math.round((day.other_amount + Number.EPSILON) * 100) / 100,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error fetching sales by date range:", err);
    return sendError(res, 500, err);
  }
};
