// controllers/unitController.js
const Unit = require('../models/Unit');

exports.createUnit = async (req, res) => {
  try {
    const unit = new Unit(req.body);
    await unit.save();
    res.status(201).json(unit);
  } catch (err) {
    console.error('Error creating unit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getUnits = async (req, res) => {
  try {
    // Allow filtering by active status
    const filter = {};
    if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

    const units = await Unit.find(filter);
    res.json(units);
  } catch (err) {
    console.error('Error fetching units:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getUnitById = async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    res.json(unit);
  } catch (err) {
    console.error('Error fetching unit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const updatedUnit = await Unit.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedUnit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(updatedUnit);
  } catch (err) {
    console.error('Error updating unit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const deletedUnit = await Unit.findByIdAndDelete(req.params.id);
    if (!deletedUnit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    res.json({ message: 'Unit deleted successfully' });
  } catch (err) {
    console.error('Error deleting unit:', err);
    res.status(500).json({ error: err.message });
  }
};