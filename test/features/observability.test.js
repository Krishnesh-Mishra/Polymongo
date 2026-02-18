// test/features/observability.test.js
// ─── Metrics, Stats & Logging Tests ─────────────────────────────────────────
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const {
    assert, assertEqual, assertExists, assertType, assertArray,
    assertGreaterThanOrEqual, assertHasProperty,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Observability & Metrics", {

        "setup: initialize wrapper and seed data": async () => {
            wrapper = createWrapper({ debug: true, logPath: path.join(__dirname, "../../logs/test-observability") });

            const UserSchema = new mongoose.Schema({ name: String, email: String });
            const UserModel = mongoose.model("ObsUser", UserSchema);
            const WrappedUser = wrapper.wrapModel(UserModel);

            // Seed data so stats have something to report on
            await WrappedUser.deleteMany({});
            await WrappedUser.insertMany([
                { name: "Observer1", email: "obs1@test.com" },
                { name: "Observer2", email: "obs2@test.com" },
            ]);

            logInfo("Seeded 2 users for observability testing");
        },

        "stats.general() returns correct structure": async () => {
            const stats = wrapper.stats.general();

            assertExists(stats, "Stats should not be null");
            assertHasProperty(stats, "totalActivePools", "Should have totalActivePools");
            assertHasProperty(stats, "totalConnectionsAcrossPools", "Should have totalConnectionsAcrossPools");
            assertHasProperty(stats, "primary", "Should have primary field");

            assertType(stats.totalActivePools, "number", "totalActivePools should be number");
            assertType(stats.totalConnectionsAcrossPools, "number", "totalConnectionsAcrossPools should be number");
            assertGreaterThanOrEqual(stats.totalActivePools, 1, "Should have at least 1 active pool");

            logInfo(`Total active pools: ${stats.totalActivePools}, connections: ${stats.totalConnectionsAcrossPools}`);
        },

        "stats.general() shows primary connection info": async () => {
            const stats = wrapper.stats.general();

            assertExists(stats.primary, "Primary should exist");
            assertHasProperty(stats.primary, "readyState", "Primary should have readyState");
            assertHasProperty(stats.primary, "sharedDatabases", "Primary should have sharedDatabases");
            assertArray(stats.primary.sharedDatabases, "sharedDatabases should be an array");
        },

        "stats.general() shows separate DB info after scale.connectDB": async () => {
            await wrapper.scale.connectDB(["test_obs_separate"], {
                maxConnections: 3,
            });

            const stats = wrapper.stats.general();
            assertArray(stats.separateDB, "separateDB should be an array");

            const obs = stats.separateDB.find(s => s.dbName === "test_obs_separate");
            assertExists(obs, "Should have the test_obs_separate in separateDB");
            assertHasProperty(obs, "readyState", "Separate DB should have readyState");
            assertHasProperty(obs, "config", "Separate DB should have config");

            logInfo(`Separate DB pool found: readyState=${obs.readyState}`);
        },

        "stats.db() returns per-database metrics": async () => {
            const dbStats = await wrapper.stats.db(databases.default);

            assertExists(dbStats, "DB stats should exist");
            assertHasProperty(dbStats, "sizeMb", "Should have sizeMb");
            assertHasProperty(dbStats, "numCollections", "Should have numCollections");
            assertHasProperty(dbStats, "collections", "Should have collections");
            assertHasProperty(dbStats, "mongoURI", "Should have mongoURI");
            assertHasProperty(dbStats, "isInitialized", "Should have isInitialized");

            assertType(dbStats.sizeMb, "number", "sizeMb should be number");
            assertType(dbStats.numCollections, "number", "numCollections should be number");
            assertArray(dbStats.collections, "collections should be an array");

            logInfo(`DB ${databases.default}: ${dbStats.numCollections} collections, ${dbStats.sizeMb.toFixed(4)}MB`);
        },

        "stats.db() collections have docCount and sizeMb": async () => {
            const dbStats = await wrapper.stats.db(databases.default);

            if (dbStats.collections.length > 0) {
                const coll = dbStats.collections[0];
                assertHasProperty(coll, "name", "Collection should have name");
                assertHasProperty(coll, "docCount", "Collection should have docCount");
                assertHasProperty(coll, "sizeMb", "Collection should have sizeMb");
                assertType(coll.docCount, "number", "docCount should be number");
                assertType(coll.sizeMb, "number", "sizeMb should be number");
            }
        },

        "stats.listDatabases() returns array of database info": async () => {
            const dbList = await wrapper.stats.listDatabases();

            assertArray(dbList, "listDatabases should return an array");
            assertGreaterThanOrEqual(dbList.length, 1, "Should list at least 1 database");

            const firstDb = dbList[0];
            assertHasProperty(firstDb, "dbName", "Each DB should have dbName");
            assertHasProperty(firstDb, "sizeInMB", "Each DB should have sizeInMB");
            assertType(firstDb.dbName, "string", "dbName should be string");
            assertType(firstDb.sizeInMB, "number", "sizeInMB should be number");

            logInfo(`Listed ${dbList.length} databases`);
        },

        "debug mode creates log files": async () => {
            // Give some time for logs to flush
            await sleep(500);

            const logDir = path.join(__dirname, "../../logs/test-observability");
            const exists = fs.existsSync(logDir);
            assert(exists, "Log directory should be created when debug=true");

            if (exists) {
                const files = fs.readdirSync(logDir);
                const logFiles = files.filter(f => f.endsWith(".log"));
                assertGreaterThanOrEqual(logFiles.length, 1, "Should have at least 1 log file");
                logInfo(`Found ${logFiles.length} log file(s) in ${logDir}`);
            }
        },

        "cleanup: close wrapper": async () => {
            const UserSchema = new mongoose.Schema({ name: String, email: String });
            const UserModel2 = mongoose.model("ObsUser2", UserSchema);
            const WrappedUser2 = wrapper.wrapModel(UserModel2);
            await WrappedUser2.deleteMany({});

            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models
    const modelNames = ["ObsUser", "ObsUser2"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
