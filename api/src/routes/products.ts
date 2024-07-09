import express from "express";
import { Product } from "../models/product";

const router = express.Router();

router.get("/search", async (req, res) => {
  try {
    const { query, page = 1, pageSize = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(pageSize);

    const products = await Product.find(
      { $text: { $search: query as string } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .skip(skip)
      .limit(Number(pageSize));

    const total = await Product.countDocuments({
      $text: { $search: query as string },
    });

    res.json({
      products,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(total / Number(pageSize)),
      total,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: "Server error", error: error.message });
    } else {
      res.status(500).json({ message: "An unknown error occurred" });
    }
  }
});

// Add a route to fetch a product by barcode
router.get("/:barcode", async (req, res) => {
  try {
    const product = await Product.findOne({ code: req.params.barcode });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: "Server error", error: error.message });
    } else {
      res.status(500).json({ message: "An unknown error occurred" });
    }
  }
});

export default router;
