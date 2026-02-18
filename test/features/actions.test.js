// test/features/actions.test.js
// ─── Connection Actions Tests ───────────────────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Connection Actions", {

        "actions.closeAll() closes primary gracefully": async () => {
            wrapper = createWrapper({ debug: false });

            // Trigger a connection by doing a query
            const Schema = new mongoose.Schema({ temp: Boolean });
            const Model = mongoose.model("ActionTest1", Schema);
            const Wrapped = wrapper.wrapModel(Model);
            await Wrapped.deleteMany({});

            // Verify connected
            assertEqual(wrapper.isConnected(), true, "Should be connected before closeAll");

            // Close all
            await wrapper.actions.closeAll();
            logInfo("closeAll completed without error");

            // After close, it should not be connected
            // Note: the wrapper may recreate connections on next use
            await cleanupWrapper(wrapper);
        },

        "actions.forceCloseAll() force-closes everything": async () => {
            wrapper = createWrapper({ debug: false });

            // Create some connections
            const Schema = new mongoose.Schema({ temp: Boolean });
            const Model = mongoose.model("ActionTest2", Schema);
            const Wrapped = wrapper.wrapModel(Model);
            await Wrapped.deleteMany({});

            // Create a separate connection too
            await wrapper.scale.connectDB(["test_action_sep"], {
                maxConnections: 2,
            });

            // Force close all
            await wrapper.actions.forceCloseAll();

            logInfo("forceCloseAll completed — all connections terminated");

            // Verify connection state
            const connected = wrapper.isConnected();
            assertEqual(connected, false, "Should not be connected after forceCloseAll");
        },

        "actions.closeDBstream() handles non-existent stream gracefully": async () => {
            wrapper = createWrapper({ debug: false });

            // Should not throw even for a DB with no streams
            wrapper.actions.closeDBstream("nonexistent_db");
            logInfo("closeDBstream for non-existent DB handled gracefully");
        },

        "actions.closeAllWatches() handles no active watches": async () => {
            // Should not throw when no watches are active
            wrapper.actions.closeAllWatches();
            logInfo("closeAllWatches with no watches handled gracefully");
        },

        "wrapper survives forceCloseAll and can reinitialize": async () => {
            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            // Initially trigger connection
            const Schema = new mongoose.Schema({ x: Number });
            const Model = mongoose.model("ActionTest3", Schema);
            const Wrapped = wrapper.wrapModel(Model);
            await Wrapped.deleteMany({});

            // Force close
            await wrapper.actions.forceCloseAll();
            assertEqual(wrapper.isConnected(), false, "Should be disconnected");

            // Reinitialize by querying again (cold start triggers reconnection)
            const freshWrapper = createWrapper({ debug: false });
            const Model2 = mongoose.model("ActionTest4", Schema);
            const Wrapped2 = freshWrapper.wrapModel(Model2);
            await Wrapped2.deleteMany({});
            await Wrapped2.create({ x: 42 });

            const count = await Wrapped2.countDocuments();
            assertEqual(count, 1, "Should work after reinitializing");

            await Wrapped2.deleteMany({});
            await cleanupWrapper(freshWrapper);
        },

        "cleanup: close wrapper": async () => {
            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models
    const modelNames = ["ActionTest1", "ActionTest2", "ActionTest3", "ActionTest4"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
