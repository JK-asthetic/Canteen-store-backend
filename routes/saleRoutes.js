const express = require("express");
const router = express.Router();
const saleController = require("../controllers/saleController");
const authMiddleware = require("../middleware/auth");

// Sale routes - Order matters! More specific routes should come before general ones
router.get(
  "/sales/canteen/:canteenId",
  authMiddleware,
  saleController.getSalesByCanteen
);
router.get(
  "/sales/date-range",
  authMiddleware,
  saleController.getSalesByDateRange
);
router.get("/sales/:id", authMiddleware, saleController.getSaleById);

// NEW: Verification routes - Must come before general routes
router.post("/sales/:saleId/verify", authMiddleware, saleController.verifySale);
router.put(
  "/sales/:saleId/verify",
  authMiddleware,
  saleController.updateVerifySale
);

router.post("/sales", authMiddleware, saleController.createSale);
router.put("/sales/:saleId", authMiddleware, saleController.updateSale);

// General get route should be last
router.get("/sales", authMiddleware, saleController.getSalesByDateAndCanteen);

module.exports = router;
