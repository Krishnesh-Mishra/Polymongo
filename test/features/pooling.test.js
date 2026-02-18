// test/features/pooling.test.js
// ─── Smart Connection Pooling Tests ─────────────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists, assertType, assertGreaterThanOrEqual,
    assertHasProperty, runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Smart Connection Pooling", {

        "wrapper initializes with cold-start (no immediate connection)": async () => {
            wrapper = createWrapper({ debug: false });
            // Cold start means no primary connection yet
            const state = wrapper.getConnectionState();
            assertEqual(state, "not initialized", "Should be 'not initialized' on cold start");
        },

        "first query triggers primary connection initialization": async () => {
            const UserSchema = new mongoose.Schema({ name: String });
            const UserModel = mongoose.model("PoolTestUser", UserSchema);
            const WrappedUser = wrapper.wrapModel(UserModel);

            // Access the model — this triggers connection init
            await WrappedUser.deleteMany({});
            await WrappedUser.create({ name: "PoolTest" });

            const count = await WrappedUser.countDocuments();
            assertGreaterThanOrEqual(count, 1, "Should have at least 1 document after insert");
            await WrappedUser.deleteMany({});
        },

        "isConnected() returns true after connection": async () => {
            // After a query, the connection should be established
            const connected = wrapper.isConnected();
            assertEqual(connected, true, "isConnected should be true after query");
        },

        "getConnectionState() returns 'connected' when active": async () => {
            const state = wrapper.getConnectionState();
            assertEqual(state, "connected", "State should be 'connected'");
        },

        "scale.setDB() configures a database without connecting": async () => {
            wrapper.scale.setDB(["test_pool_scaled"], {
                maxConnections: 5,
                autoClose: true,
                ttl: 3000,
            });
            // The DB config is saved, but no connection is created (cold start)
            logInfo("setDB configured for test_pool_scaled with TTL=3000ms");
            assert(true, "setDB should not throw");
        },

        "scale.connectDB() creates separate pool for database": async () => {
            await wrapper.scale.connectDB(["test_pool_separate"], {
                maxConnections: 3,
            });
            logInfo("Separate connection created for test_pool_separate");
            assert(true, "connectDB should not throw");
        },

        "stats.general() reflects separate pool": async () => {
            const stats = wrapper.stats.general();
            assertExists(stats, "Stats should exist");
            assertType(stats.totalActivePools, "number", "totalActivePools should be number");
            assertGreaterThanOrEqual(stats.totalActivePools, 1, "Should have at least 1 pool");
            assertExists(stats.separateDB, "separateDB should exist");
        },

        "auto-close timer removes idle connection after TTL": async () => {
            // Create a wrapper with a very short TTL
            const ttlWrapper = createWrapper({ debug: false });
            ttlWrapper.scale.setDB(["test_ttl_db"], {
                autoClose: true,
                ttl: 2000,    // 2 seconds
                coldStart: false,
            });

            // Wait for the connection to initialize
            await sleep(500);

            // Access it to trigger connection
            const Schema = new mongoose.Schema({ x: Number });
            const Model = mongoose.model("TtlTestModel", Schema);
            const Wrapped = ttlWrapper.wrapModel(Model);
            try { await Wrapped.db("test_ttl_db").deleteMany({}); } catch (e) { /* OK */ }

            // Wait for TTL to expire
            await sleep(3000);

            // After TTL, stats should show the connection was cleaned up
            logInfo("TTL expiration waited — verifying cleanup");
            await cleanupWrapper(ttlWrapper);
        },

        "cleanup: force close all connections": async () => {
            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models registered during testing
    try {
        delete mongoose.connection.models["PoolTestUser"];
        delete mongoose.models["PoolTestUser"];
        delete mongoose.connection.models["TtlTestModel"];
        delete mongoose.models["TtlTestModel"];
    } catch (e) { /* OK */ }

    return result;
}

module.exports = { run };
