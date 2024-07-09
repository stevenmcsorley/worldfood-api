import fs from "fs";
import readline from "readline";
import https from "https";
import zlib from "zlib";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://admin:adminpassword@mongodb:27017/openfoodfacts?authSource=admin";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });

// Define your Product model schema
const ProductSchema = new mongoose.Schema({
  code: String,
  url: String,
  creator: String,
  created_t: Number,
  created_datetime: Date,
  last_modified_t: Number,
  last_modified_datetime: Date,
  product_name: String,
  generic_name: String,
  quantity: String,
  packaging: String,
  packaging_tags: [String],
  brands: String,
  brands_tags: [String],
  categories: String,
  categories_tags: [String],
  categories_fr: [String],
  origins: String,
  origins_tags: [String],
  manufacturing_places: String,
  manufacturing_places_tags: [String],
  labels: String,
  labels_tags: [String],
  labels_fr: [String],
  emb_codes: String,
  emb_codes_tags: [String],
  first_packaging_code_geo: String,
  cities: String,
  cities_tags: [String],
  purchase_places: String,
  stores: String,
  countries: String,
  countries_tags: [String],
  countries_fr: [String],
  ingredients_text: String,
  traces: String,
  traces_tags: [String],
  serving_size: String,
  no_nutriments: Boolean,
  additives_n: Number,
  additives: String,
  additives_tags: [String],
  ingredients_from_palm_oil_n: Number,
  ingredients_from_palm_oil: String,
  ingredients_from_palm_oil_tags: [String],
  ingredients_that_may_be_from_palm_oil_n: Number,
  ingredients_that_may_be_from_palm_oil: String,
  ingredients_that_may_be_from_palm_oil_tags: [String],
  nutrition_grade_fr: String,
  main_category: String,
  main_category_fr: String,
  image_url: String,
  image_small_url: String,
  energy_100g: Number,
  energy_kj_100g: Number,
  energy_kcal_100g: Number,
  proteins_100g: Number,
  carbohydrates_100g: Number,
  sugars_100g: Number,
  fat_100g: Number,
  saturated_fat_100g: Number,
  fiber_100g: Number,
  sodium_100g: Number,
  alcohol_100g: Number,
  fruits_vegetables_nuts_100g: Number,
  carbon_footprint_100g: Number,
  nutrition_score_fr_100g: Number,
  nutrition_score_uk_100g: Number,
});

const Product = mongoose.model("Product", ProductSchema);

const dataUrl =
  "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";
const outputPath = "./openfoodfacts_data.csv.gz";

function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          console.log("Download completed");
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(outputPath, () => reject(err));
      });
  });
}

function parseValue(value: string): any {
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (!isNaN(Number(value))) return Number(value);
  // If it's a JSON string, parse it
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

async function importData() {
  try {
    console.log("Downloading data...");
    await downloadFile(dataUrl, outputPath);

    console.log("Importing data...");
    const fileStream = fs
      .createReadStream(outputPath)
      .pipe(zlib.createGunzip());
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let headers: string[] = [];
    let count = 0;
    const batchSize = 1000;
    let batch: any[] = [];

    for await (const line of rl) {
      if (count === 0) {
        headers = line.split("\t");
      } else {
        const values = line.split("\t");
        const product: any = {};
        headers.forEach((header, index) => {
          const parsedValue = parseValue(values[index]);
          if (header === "categories" && Array.isArray(parsedValue)) {
            product.categories = parsedValue.join(", "); // Join array into string
            product.categories_tags = parsedValue; // Store array in categories_tags
          } else {
            product[header] = parsedValue;
          }
        });

        batch.push(product);

        if (batch.length === batchSize) {
          try {
            await Product.bulkWrite(
              batch.map((doc) => ({
                updateOne: {
                  filter: { code: doc.code },
                  update: { $set: doc },
                  upsert: true,
                },
              }))
            );
            console.log(`Imported ${count} products`);
          } catch (error) {
            console.error(`Error importing batch at count ${count}:`, error);
          }
          batch = [];
        }
      }
      count++;
    }

    // Import any remaining products in the last batch
    if (batch.length > 0) {
      try {
        await Product.bulkWrite(
          batch.map((doc) => ({
            updateOne: {
              filter: { code: doc.code },
              update: { $set: doc },
              upsert: true,
            },
          }))
        );
      } catch (error) {
        console.error(`Error importing final batch:`, error);
      }
    }

    console.log(`Import completed. Total products processed: ${count - 1}`);
    fs.unlinkSync(outputPath);
    console.log("Temporary file deleted");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

importData().catch((error) => {
  console.error("Unhandled error during import:", error);
  process.exit(1);
});
