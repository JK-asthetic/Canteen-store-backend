const Sale = require("../models/Sale");
const SaleItem = require("../models/SaleItem");
const Stock = require("../models/Stock");
const StockHistory = require("../models/StockHistory");
const Item = require("../models/Item");

// Special category ID that increases stock instead of decreasing
const SPECIAL_CATEGORY_ID = "68fd9f0be8e2ff65f8459ffa";

exports.createSale = async (req, res) => {
  try {
    const { canteen_id, items, cash_amount, online_amount } = req.body;

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for existing sale today
    let sale = await Sale.findOne({
      canteen_id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    // Calculate total amount
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }
    total_amount = Math.round((total_amount + Number.EPSILON) * 100) / 100;

    // Validate payment amounts
    const provided_total = (cash_amount || 0) + (online_amount || 0);
    if (Math.abs(provided_total - total_amount) > 0.01) {
      return res.status(400).json({
        error: "Cash amount plus online amount must equal total amount",
        expected: total_amount,
        provided: provided_total,
      });
    }

    const saleItems = [];
    if (sale) {
      // Update existing sale
      sale.total_amount = total_amount;
      sale.cash_amount = cash_amount || 0;
      sale.online_amount = online_amount || 0;
      sale.updated_at = new Date();
    } else {
      // Create new sale
      sale = new Sale({
        canteen_id,
        total_amount,
        cash_amount: cash_amount || 0,
        online_amount: online_amount || 0,
        created_by: req.user._id,
        date: today,
      });
    }

    await sale.save();

    // Update or create sale items
    for (const item of items) {
      // Fetch item details to check category
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

      // Update stock
      const stock = await Stock.findOne({
        canteen_id,
        item_id: item.item_id,
      });

      if (!stock) {
        return res.status(400).json({
          error: `Stock not found for item ${item.item_id}`,
        });
      }

      // For normal items, check if sufficient stock exists
      if (!isSpecialCategory && stock.quantity < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for item ${item.item_id}`,
        });
      }

      // Calculate quantity difference for stock history
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

      // Update stock - INCREASE for special category, DECREASE for normal items
      if (isSpecialCategory) {
        stock.quantity += quantityDiff;
      } else {
        stock.quantity -= quantityDiff;
      }
      stock.updated_at = new Date();
      await stock.save();

      // Update stock history
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
    res.status(500).json({ error: err.message });
  }
};

exports.updateSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { items, cash_amount, online_amount } = req.body;

    console.log("UpdateSale - Starting update for sale:", saleId);
    console.log("UpdateSale - Items received:", JSON.stringify(items, null, 2));

    // Find the sale
    const sale = await Sale.findById(saleId);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    console.log("UpdateSale - Sale found:", sale._id);

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const saleDate = new Date(sale.date);
    saleDate.setHours(0, 0, 0, 0);
    if (saleDate.getTime() !== today.getTime()) {
      return res
        .status(403)
        .json({ error: "You can only edit sales for today" });
    }

    // Calculate total amount
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }
    total_amount = Math.round((total_amount + Number.EPSILON) * 100) / 100;

    // Validate payment amounts
    const provided_total = (cash_amount || 0) + (online_amount || 0);
    if (Math.abs(provided_total - total_amount) > 0.01) {
      return res.status(400).json({
        error: "Cash amount plus online amount must equal total amount",
        expected: total_amount,
        provided: provided_total,
      });
    }

    // Update sale
    sale.total_amount = total_amount;
    sale.cash_amount = cash_amount || 0;
    sale.online_amount = online_amount || 0;
    sale.updated_at = new Date();
    await sale.save();

    // Get existing sale items
    const existingItems = await SaleItem.find({ sale_id: sale._id });
    const saleItems = [];

    // Process each item in the request
    for (const item of items) {
      // Fetch item details to check category
      const itemDetails = await Item.findById(item.item_id);
      if (!itemDetails) {
        return res.status(400).json({
          error: `Item ${item.item_id} not found`,
        });
      }
      console.log("UpdateSale - Processing item:", itemDetails.category);

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

      // Calculate available stock considering existing sale quantities
      const originalQuantity = saleItem ? saleItem.quantity : 0;

      // For special category, we don't need to check stock availability
      // For normal items, check if sufficient stock is available
      if (!isSpecialCategory) {
        const availableStock = stock.quantity + originalQuantity;
        if (item.quantity > availableStock) {
          return res.status(400).json({
            error: `Insufficient stock for item ${item.item_id}. Available: ${availableStock}`,
          });
        }
      }

      // Calculate quantity difference
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

      // Update stock - INCREASE for special category, DECREASE for normal items
      if (isSpecialCategory) {
        stock.quantity += quantityDiff;
      } else {
        stock.quantity -= quantityDiff;
      }
      stock.updated_at = new Date();
      await stock.save();

      // Update stock history
      const historyDate = new Date(sale.date);
      historyDate.setHours(0, 0, 0, 0);

      let stockHistory = await StockHistory.findOne({
        canteen_id: sale.canteen_id,
        item_id: item.item_id,
        date: historyDate,
      });

      if (stockHistory) {
        // For special category, adjust sold_stock differently
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

    // Remove items not in the updated list
    for (const existingItem of existingItems) {
      const itemIdStr = existingItem.item_id
        ? existingItem.item_id.toString()
        : null;
      if (!itemIdStr || !items.find((i) => i.item_id === itemIdStr)) {
        console.log("UpdateSale - Removing item:", itemIdStr);

        // Fetch item details to check category
        const itemDetails = await Item.findById(existingItem.item_id);
        const isSpecialCategory =
          itemDetails && itemDetails.category
            ? itemDetails.category.toString() === SPECIAL_CATEGORY_ID
            : false;

        console.log(
          "UpdateSale - Item to remove is special category:",
          isSpecialCategory
        );

        const stock = await Stock.findOne({
          canteen_id: sale.canteen_id,
          item_id: existingItem.item_id,
        });

        if (stock) {
          // Reverse the stock change - DECREASE for special category, INCREASE for normal items
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
        return res
          .status(403)
          .json({
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
    res.status(500).json({ error: err.message });
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
          sales_count: 0,
          total_items: 0,
        };
      }
      salesByDate[dateStr].total_amount += sale.total_amount;
      salesByDate[dateStr].cash_amount += sale.cash_amount || 0;
      salesByDate[dateStr].online_amount += sale.online_amount || 0;
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
    }));

    res.json(result);
  } catch (err) {
    console.error("Error fetching sales by date range:", err);
    res.status(500).json({ error: err.message });
  }
};
