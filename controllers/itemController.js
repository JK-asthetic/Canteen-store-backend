// controllers/itemController.js
const Item = require('../models/Item');

exports.createItem = async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getItems = async (req, res) => {
  try {
    // Allow filtering by category or active status
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

    const items = await Item.find(filter).populate('unit', 'name abbreviation');
    res.json(items);
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    console.error('Error fetching item:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(updatedItem);
  } catch (err) {
    console.error('Error updating item:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const deletedItem = await Item.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: err.message });
  }
};