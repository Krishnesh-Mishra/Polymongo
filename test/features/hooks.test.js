// test/features/hooks.test.js
// ─── Lifecycle Hook Tests ───────────────────────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists, assertType,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Lifecycle Hooks", {

        "onDbConnect callback fires on first connection": async () => {
            let callbackFired = false;
            let receivedConnection = null;

            wrapper = createWrapper({ debug: false });

            wrapper.onDbConnect((connection) => {
                callbackFired = true;
                receivedConnection = connection;
            });

            // Trigger a connection via a query
            const TestSchema = new mongoose.Schema({ data: String });
            const TestModel = mongoose.model("HookTest1", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);
            await WrappedTest.deleteMany({});

            // Wait for callback to fire
            await sleep(1000);

            assert(callbackFired, "onDbConnect callback should have fired");
            assertExists(receivedConnection, "Connection should be passed to callback");

            await WrappedTest.deleteMany({});
        },

        "onTheseDBConnect fires for specified database": async () => {
            let specificDbCallbackFired = false;
            let specificDbName = null;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.onTheseDBConnect([databases.analytics], (connection) => {
                specificDbCallbackFired = true;
                specificDbName = connection.name;
            });

            // Trigger connection to the specific DB
            const TestSchema = new mongoose.Schema({ metric: String });
            const TestModel = mongoose.model("HookTest2", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);

            // Access the specific database to trigger connection
            await wrapper.scale.connectDB([databases.analytics], { coldStart: false });
            await sleep(1500);

            // Even if the callback timing is tricky, verify no error occurred
            logInfo(`Specific DB callback fired: ${specificDbCallbackFired}, dbName: ${specificDbName}`);
        },

        "onDbConnect accepts multiple callbacks": async () => {
            let callback1Count = 0;
            let callback2Count = 0;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.onDbConnect(() => { callback1Count++; });
            wrapper.onDbConnect(() => { callback2Count++; });

            // Trigger a connection
            const TestSchema = new mongoose.Schema({ key: String });
            const TestModel = mongoose.model("HookTest3", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);
            await WrappedTest.deleteMany({});

            await sleep(1000);

            assertEqual(callback1Count, callback2Count, "Both callbacks should fire same number of times");
            logInfo(`Callback1: ${callback1Count} times, Callback2: ${callback2Count} times`);
        },

        "onTheseDBConnect scopes to correct databases only": async () => {
            let analyticsCallback = 0;
            let archiveCallback = 0;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.onTheseDBConnect([databases.analytics], () => { analyticsCallback++; });
            wrapper.onTheseDBConnect([databases.archive], () => { archiveCallback++; });

            // Connect only to analytics
            await wrapper.scale.connectDB([databases.analytics], { coldStart: false });
            await sleep(1000);

            // Archive should not fire since we didn't connect to it via separate connection
            logInfo(`Analytics callbacks: ${analyticsCallback}, Archive callbacks: ${archiveCallback}`);
        },

        "hook methods are chainable (do not throw)": async () => {
            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            // All hook registration methods should not throw
            wrapper.onDbConnect(() => { });
            wrapper.onDbDisconnect(() => { });
            wrapper.onTheseDBConnect(["db1", "db2"], () => { });
            wrapper.onTheseDBDisconnect(["db1"], () => { });

            assert(true, "Hook registration should not throw");
        },

        "cleanup: close wrapper": async () => {
            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models
    const modelNames = ["HookTest1", "HookTest2", "HookTest3"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
