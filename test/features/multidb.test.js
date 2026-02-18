// test/features/multidb.test.js
// ─── Multi-Database Isolation Tests ─────────────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists, assertGreaterThanOrEqual,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Multi-Database Isolation", {

        "setup: initialize wrapper and schemas": async () => {
            wrapper = createWrapper({ debug: false });
            assert(wrapper !== null, "Wrapper should be created");
        },

        "insert data into DB_A and DB_B independently": async () => {
            const UserSchema = new mongoose.Schema({ name: String, email: String, role: String });
            const UserModel = mongoose.model("MultiDbUser", UserSchema);
            const WrappedUser = wrapper.wrapModel(UserModel);

            // Clean both databases first
            await WrappedUser.db(databases.isolation_a).deleteMany({});
            await WrappedUser.db(databases.isolation_b).deleteMany({});

            // Insert unique data into each DB
            await WrappedUser.db(databases.isolation_a).insertMany([
                { name: "Alice_A", email: "alice_a@test.com", role: "admin" },
                { name: "Bob_A", email: "bob_a@test.com", role: "user" },
            ]);
            await WrappedUser.db(databases.isolation_b).insertMany([
                { name: "Charlie_B", email: "charlie_b@test.com", role: "editor" },
                { name: "Dave_B", email: "dave_b@test.com", role: "viewer" },
                { name: "Eve_B", email: "eve_b@test.com", role: "user" },
            ]);

            logInfo("Inserted 2 records into isolation_a, 3 records into isolation_b");
        },

        "DB_A data is isolated from DB_B": async () => {
            const UserSchema = new mongoose.Schema({ name: String, email: String, role: String }, { collection: "multidbusers" });
            const UserModel = mongoose.model("MultiDbUser2", UserSchema);
            const WrappedUser = wrapper.wrapModel(UserModel);

            const countA = await WrappedUser.db(databases.isolation_a).countDocuments();
            const countB = await WrappedUser.db(databases.isolation_b).countDocuments();

            assertEqual(countA, 2, "DB_A should have exactly 2 documents");
            assertEqual(countB, 3, "DB_B should have exactly 3 documents");
        },

        "concurrent queries on DB_A and DB_B return correct data": async () => {
            const UserSchema = new mongoose.Schema({ name: String, email: String, role: String }, { collection: "multidbusers" });
            const UserModel = mongoose.model("MultiDbUser3", UserSchema);
            const WrappedUser = wrapper.wrapModel(UserModel);

            // Run queries concurrently
            const [docsA, docsB] = await Promise.all([
                WrappedUser.db(databases.isolation_a).find({}).lean(),
                WrappedUser.db(databases.isolation_b).find({}).lean(),
            ]);

            assertEqual(docsA.length, 2, "Concurrent: DB_A should return 2 docs");
            assertEqual(docsB.length, 3, "Concurrent: DB_B should return 3 docs");

            // Verify no data leakage
            const namesA = docsA.map(d => d.name);
            const namesB = docsB.map(d => d.name);

            assert(namesA.includes("Alice_A"), "DB_A should contain Alice_A");
            assert(namesA.includes("Bob_A"), "DB_A should contain Bob_A");
            assert(!namesA.includes("Charlie_B"), "DB_A should NOT contain Charlie_B");

            assert(namesB.includes("Charlie_B"), "DB_B should contain Charlie_B");
            assert(!namesB.includes("Alice_A"), "DB_B should NOT contain Alice_A");
        },

        "default DB is separate from named DBs": async () => {
            const ItemSchema = new mongoose.Schema({ item: String });
            const ItemModel = mongoose.model("MultiDbItem", ItemSchema);
            const WrappedItem = wrapper.wrapModel(ItemModel);

            // Insert into default DB
            await WrappedItem.deleteMany({});
            await WrappedItem.create({ item: "default_item" });

            // Insert into a named DB
            await WrappedItem.db(databases.isolation_a).deleteMany({});
            await WrappedItem.db(databases.isolation_a).create({ item: "isolation_a_item" });

            const defaultDocs = await WrappedItem.find({}).lean();
            const isolationDocs = await WrappedItem.db(databases.isolation_a).find({}).lean();

            assertEqual(defaultDocs.length, 1, "Default DB should have 1 item");
            assertEqual(defaultDocs[0].item, "default_item", "Default DB should have correct item");
            assertEqual(isolationDocs.length, 1, "Isolation DB should have 1 item");
            assertEqual(isolationDocs[0].item, "isolation_a_item", "Isolation DB should have correct item");

            // Cleanup
            await WrappedItem.deleteMany({});
            await WrappedItem.db(databases.isolation_a).deleteMany({});
        },

        "wrapModel().db() returns correct model per database": async () => {
            const LogSchema = new mongoose.Schema({ message: String, level: String });
            const LogModel = mongoose.model("MultiDbLog", LogSchema);
            const WrappedLog = wrapper.wrapModel(LogModel);

            // Insert into 3 different DBs
            await WrappedLog.db(databases.default).deleteMany({});
            await WrappedLog.db(databases.analytics).deleteMany({});
            await WrappedLog.db(databases.archive).deleteMany({});

            await WrappedLog.db(databases.default).create({ message: "info log", level: "info" });
            await WrappedLog.db(databases.analytics).create({ message: "analytics event", level: "debug" });
            await WrappedLog.db(databases.analytics).create({ message: "analytics event 2", level: "warn" });
            await WrappedLog.db(databases.archive).create({ message: "archived log", level: "error" });

            const defaultCount = await WrappedLog.db(databases.default).countDocuments();
            const analyticsCount = await WrappedLog.db(databases.analytics).countDocuments();
            const archiveCount = await WrappedLog.db(databases.archive).countDocuments();

            assertEqual(defaultCount, 1, "Default should have 1 log");
            assertEqual(analyticsCount, 2, "Analytics should have 2 logs");
            assertEqual(archiveCount, 1, "Archive should have 1 log");

            // Cleanup
            await WrappedLog.db(databases.default).deleteMany({});
            await WrappedLog.db(databases.analytics).deleteMany({});
            await WrappedLog.db(databases.archive).deleteMany({});
        },

        "scale.setDB() with dbSpecific config works": async () => {
            wrapper.scale.setDB([databases.staging], {
                maxConnections: 3,
                coldStart: true,
            });
            logInfo("setDB configured for staging DB with maxConnections=3");
            assert(true, "setDB should configure without throwing");
        },

        "cleanup: drop test DBs and close": async () => {
            try {
                const UserSchema = new mongoose.Schema({ name: String, email: String, role: String });
                const UserModel = mongoose.model("MultiDbClean", UserSchema);
                const Wrapped = wrapper.wrapModel(UserModel);
                await Wrapped.db(databases.isolation_a).deleteMany({});
                await Wrapped.db(databases.isolation_b).deleteMany({});
            } catch (e) { /* ignore */ }
            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models
    const modelNames = ["MultiDbUser", "MultiDbUser2", "MultiDbUser3", "MultiDbItem", "MultiDbLog", "MultiDbClean"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
