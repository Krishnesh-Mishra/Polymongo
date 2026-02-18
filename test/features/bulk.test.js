// test/features/bulk.test.js
// ─── Bulk Operations: Export, Import, Copy, Drop, Streaming ─────────────────
const mongoose = require("mongoose");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const {
    assert, assertEqual, assertExists, assertType, assertArray,
    assertGreaterThan, assertGreaterThanOrEqual, assertHasProperty,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;
    const productsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../dummy/products.json"), "utf-8")
    );

    const result = await runTestSuite("Bulk Operations", {

        "setup: initialize wrapper and seed bulk_source DB": async () => {
            wrapper = createWrapper({ debug: false });

            // Create a schema and seed data into bulkSource DB
            const ProductSchema = new mongoose.Schema({
                sku: String, name: String, price: Number, category: String, stock: Number
            });
            const ProductModel = mongoose.model("BulkProduct", ProductSchema);
            const WrappedProduct = wrapper.wrapModel(ProductModel);

            await WrappedProduct.db(databases.bulkSource).deleteMany({});
            await WrappedProduct.db(databases.bulkSource).insertMany(productsData);

            const count = await WrappedProduct.db(databases.bulkSource).countDocuments();
            assertEqual(count, productsData.length, `Should have ${productsData.length} products seeded`);
            logInfo(`Seeded ${count} products into ${databases.bulkSource}`);
        },

        "bulkTasks.export() returns valid export object": async () => {
            const exported = await wrapper.bulkTasks.export(databases.bulkSource);

            assertExists(exported, "Export data should exist");
            assertHasProperty(exported, "database", "Should have database field");
            assertHasProperty(exported, "exportDate", "Should have exportDate field");
            assertHasProperty(exported, "collections", "Should have collections field");
            assertEqual(exported.database, databases.bulkSource, "Database name should match");
            assertType(exported.collections, "object", "Collections should be an object");

            logInfo(`Exported ${Object.keys(exported.collections).length} collection(s) from ${databases.bulkSource}`);
        },

        "bulkTasks.import() restores data into new database": async () => {
            // First export
            const exported = await wrapper.bulkTasks.export(databases.bulkSource);

            // Clean target
            try { await wrapper.bulkTasks.dropDatabase(databases.bulkTarget); } catch (e) { /* OK */ }

            // Import into target
            await wrapper.bulkTasks.import(databases.bulkTarget, exported);

            // Verify data
            const ProductSchema2 = new mongoose.Schema({
                sku: String, name: String, price: Number, category: String, stock: Number
            }, { collection: "bulkproducts" });
            const ProductModel2 = mongoose.model("BulkProduct2", ProductSchema2);
            const WrappedProduct2 = wrapper.wrapModel(ProductModel2);

            const count = await WrappedProduct2.db(databases.bulkTarget).countDocuments();
            assertGreaterThanOrEqual(count, productsData.length,
                "Imported DB should have at least as many docs as source");

            logInfo(`Imported ${count} documents into ${databases.bulkTarget}`);
        },

        "bulkTasks.import() preserves data integrity": async () => {
            const ProductSchema3 = new mongoose.Schema({
                sku: String, name: String, price: Number, category: String, stock: Number
            }, { collection: "bulkproducts" });
            const ProductModel3 = mongoose.model("BulkProduct3", ProductSchema3);
            const WrappedProduct3 = wrapper.wrapModel(ProductModel3);

            // Check that specific product exists in target
            const mouse = await WrappedProduct3.db(databases.bulkTarget)
                .findOne({ sku: "PROD-001" }).lean();
            assertExists(mouse, "PROD-001 should exist in imported DB");
            assertEqual(mouse.name, "Wireless Mouse", "Product name should match");
            assertEqual(mouse.price, 29.99, "Product price should match");
        },

        "bulkTasks.copyDatabase() copies all data and indexes": async () => {
            // Seed source
            const CopySchema = new mongoose.Schema({ key: String, value: Number });
            const CopyModel = mongoose.model("BulkCopy", CopySchema);
            const WrappedCopy = wrapper.wrapModel(CopyModel);

            await WrappedCopy.db(databases.copySource).deleteMany({});
            await WrappedCopy.db(databases.copySource).insertMany([
                { key: "alpha", value: 1 },
                { key: "beta", value: 2 },
                { key: "gamma", value: 3 },
            ]);

            // Copy
            try { await wrapper.bulkTasks.dropDatabase(databases.copyTarget); } catch (e) { /* OK */ }
            await wrapper.bulkTasks.copyDatabase(databases.copySource, databases.copyTarget);

            // Verify
            const CopySchema2 = new mongoose.Schema({ key: String, value: Number }, { collection: "bulkcopies" });
            const CopyModel2 = mongoose.model("BulkCopy2", CopySchema2);
            const WrappedCopy2 = wrapper.wrapModel(CopyModel2);
            const count = await WrappedCopy2.db(databases.copyTarget).countDocuments();
            assertEqual(count, 3, "Copied DB should have 3 documents");

            const doc = await WrappedCopy2.db(databases.copyTarget)
                .findOne({ key: "beta" }).lean();
            assertExists(doc, "Document 'beta' should exist in copied DB");
            assertEqual(doc.value, 2, "Document value should match");

            logInfo("Database copy verified with data integrity");
        },

        "bulkTasks.dropDatabase() removes database": async () => {
            // Create a temporary database
            const DropSchema = new mongoose.Schema({ temp: Boolean });
            const DropModel = mongoose.model("BulkDrop", DropSchema);
            const WrappedDrop = wrapper.wrapModel(DropModel);

            await WrappedDrop.db(databases.temp).deleteMany({});
            await WrappedDrop.db(databases.temp).create({ temp: true });
            let count = await WrappedDrop.db(databases.temp).countDocuments();
            assertEqual(count, 1, "Temp DB should have 1 document before drop");

            // Drop it
            await wrapper.bulkTasks.dropDatabase(databases.temp);

            // Verify it's empty
            const DropModel2 = mongoose.model("BulkDrop2", DropSchema);
            const WrappedDrop2 = wrapper.wrapModel(DropModel2);
            count = await WrappedDrop2.db(databases.temp).countDocuments();
            assertEqual(count, 0, "Temp DB should be empty after drop");

            logInfo("Database drop verified");
        },

        "bulkTasks.exportStream() produces valid JSON stream": async () => {
            const stream = wrapper.bulkTasks.exportStream(databases.bulkSource);
            assertExists(stream, "Export stream should exist");

            // Collect stream data
            const chunks = [];
            await new Promise((resolve, reject) => {
                stream.on("data", (chunk) => chunks.push(chunk.toString()));
                stream.on("end", resolve);
                stream.on("error", reject);
            });

            const jsonString = chunks.join("");
            assert(jsonString.length > 0, "Stream should produce data");

            // Verify it's valid JSON
            const parsed = JSON.parse(jsonString);
            assertHasProperty(parsed, "database", "Stream JSON should have database");
            assertHasProperty(parsed, "collections", "Stream JSON should have collections");
            assertEqual(parsed.database, databases.bulkSource, "Database name should match");

            logInfo(`Stream export produced ${jsonString.length} bytes of valid JSON`);
        },

        "bulkTasks.importStream() restores data from stream": async () => {
            // First export via stream
            const exportStream = wrapper.bulkTasks.exportStream(databases.bulkSource);
            const exportChunks = [];
            await new Promise((resolve, reject) => {
                exportStream.on("data", (chunk) => exportChunks.push(chunk.toString()));
                exportStream.on("end", resolve);
                exportStream.on("error", reject);
            });
            const jsonData = exportChunks.join("");

            // Clean target
            try { await wrapper.bulkTasks.dropDatabase(databases.streamTarget); } catch (e) { /* OK */ }

            // Create an import stream from the JSON
            const importStream = new Readable();
            importStream.push(jsonData);
            importStream.push(null);

            // Import via stream
            await wrapper.bulkTasks.importStream(databases.streamTarget, importStream);

            // Verify data
            const StreamSchema = new mongoose.Schema({
                sku: String, name: String, price: Number, category: String, stock: Number
            }, { collection: "bulkproducts" });
            const StreamModel = mongoose.model("BulkStream", StreamSchema);
            const WrappedStream = wrapper.wrapModel(StreamModel);
            const count = await WrappedStream.db(databases.streamTarget).countDocuments();
            assertGreaterThanOrEqual(count, productsData.length,
                "Stream-imported DB should have correct document count");

            logInfo(`Stream import verified: ${count} documents in ${databases.streamTarget}`);
        },

        "bulkTasks.import() rejects invalid data format": async () => {
            let threw = false;
            try {
                await wrapper.bulkTasks.import(databases.temp, { invalid: "data" });
            } catch (e) {
                threw = true;
            }
            assert(threw, "Import should throw for invalid data format");
        },

        "bulkTasks.dropDatabase() rejects empty database name": async () => {
            let threw = false;
            try {
                await wrapper.bulkTasks.dropDatabase("");
            } catch (e) {
                threw = true;
            }
            assert(threw, "dropDatabase should throw for empty name");
        },

        "cleanup: drop test DBs and close": async () => {
            const dbsToClean = [
                databases.bulkSource, databases.bulkTarget,
                databases.copySource, databases.copyTarget,
                databases.streamTarget, databases.temp,
            ];
            for (const db of dbsToClean) {
                try { await wrapper.bulkTasks.dropDatabase(db); } catch (e) { /* OK */ }
            }
            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models
    const modelNames = [
        "BulkProduct", "BulkProduct2", "BulkProduct3",
        "BulkCopy", "BulkCopy2", "BulkDrop", "BulkDrop2", "BulkStream"
    ];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
