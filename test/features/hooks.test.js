// test/features/hooks.test.js
// ─── Lifecycle Hook Tests ───────────────────────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists, assertType, assertHasProperty,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Lifecycle Hooks", {

        "wrapper.on('connect') fires with structured event payload": async () => {
            let receivedEvent = null;

            wrapper = createWrapper({ debug: false });

            wrapper.on("connect", (event) => {
                receivedEvent = event;
            });

            const TestSchema = new mongoose.Schema({ data: String });
            const TestModel = mongoose.model("HookTest1", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);
            await WrappedTest.deleteMany({});

            await sleep(1000);

            assertExists(receivedEvent, "connect event should have been captured");
            assertEqual(receivedEvent.name, "connect", "Event name should be connect");
            assertEqual(receivedEvent.dbName, databases.default, "Event should expose the database name");
            assertHasProperty(receivedEvent, "connection", "Event should include the connection");
            assertHasProperty(receivedEvent, "readyState", "Event should include readyState");
            assertHasProperty(receivedEvent, "state", "Event should include a readable state");
            assertHasProperty(receivedEvent, "timestamp", "Event should include a timestamp");
        },

        "wrapper.on('onDbConnect') works as connect alias": async () => {
            let aliasEvent = null;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.on("onDbConnect", (event) => {
                aliasEvent = event;
            });

            const TestSchema = new mongoose.Schema({ metric: String });
            const TestModel = mongoose.model("HookTest2", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);
            await WrappedTest.db(databases.analytics).deleteMany({});

            await sleep(1500);

            assertExists(aliasEvent, "Alias event should fire");
            assert(aliasEvent.name === "connect" || aliasEvent.name === "onDbConnect", "Alias event should be a connect payload");
            assertEqual(aliasEvent.dbName, databases.analytics, "Alias event should expose the accessed database name");
        },

        "connect event accepts multiple listeners": async () => {
            let callback1Count = 0;
            let callback2Count = 0;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.on("connect", () => { callback1Count++; });
            wrapper.on("connect", () => { callback2Count++; });

            const TestSchema = new mongoose.Schema({ key: String });
            const TestModel = mongoose.model("HookTest3", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);
            await WrappedTest.deleteMany({});

            await sleep(1000);

            assertEqual(callback1Count, callback2Count, "Both callbacks should fire same number of times");
            logInfo(`Callback1: ${callback1Count} times, Callback2: ${callback2Count} times`);
        },

        "wrapper.on() unsubscribe stops future hook delivery": async () => {
            let callCount = 0;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            const unsubscribe = wrapper.on("connect", () => {
                callCount++;
            });

            const TestSchema = new mongoose.Schema({ unsub: String });
            const TestModel = mongoose.model("HookTestUnsub", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);

            await WrappedTest.deleteMany({});
            await sleep(1000);
            const beforeUnsubscribe = callCount;
            unsubscribe();

            await wrapper.disconnect();
            await wrapper.connect();
            await sleep(1000);

            assert(callCount >= 1, "Listener should receive at least one event before unsubscribe");
            assertEqual(callCount, beforeUnsubscribe, "Unsubscribed listener should not receive later events");
        },

        "wrapper.on('connect') reports named database for shared connection access": async () => {
            let analyticsEvent = null;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.on("connect", (event) => {
                if (event.dbName === databases.analytics) {
                    analyticsEvent = event;
                }
            });

            const TestSchema = new mongoose.Schema({ metric: String });
            const TestModel = mongoose.model("HookTestAnalytics", TestSchema);
            const WrappedTest = wrapper.wrapModel(TestModel);
            await WrappedTest.db(databases.analytics).deleteMany({});

            await sleep(1000);

            assertExists(analyticsEvent, "Named database access should emit a connect event for that database");
            assertEqual(analyticsEvent.dbName, databases.analytics, "Shared connection hook should expose the accessed database name");
        },

        "wrapper.on('disconnect') fires after explicit disconnect()": async () => {
            let disconnectEvent = null;

            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            wrapper.on("disconnect", (event) => {
                disconnectEvent = event;
            });

            await wrapper.connect();
            await wrapper.disconnect();
            await sleep(1000);

            assertExists(disconnectEvent, "Disconnect event should fire");
            assertEqual(disconnectEvent.state, "disconnected", "Disconnect event should report disconnected state");
        },

        "connect() reports alreadyConnected after eager initialization": async () => {
            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false, coldStart: false });

            await sleep(1500);
            const result = await wrapper.connect();

            assertEqual(result.success, true, "connect() should succeed");
            assertEqual(result.alreadyConnected, true, "connect() should report alreadyConnected when eager init already connected");
            assertEqual(result.state, "connected", "connect() should report connected state");
        },

        "disconnect() allows reconnecting later": async () => {
            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false });

            const firstConnect = await wrapper.connect();
            const firstDisconnect = await wrapper.disconnect();
            const secondConnect = await wrapper.connect();

            assertEqual(firstConnect.success, true, "Initial connect should succeed");
            assertEqual(firstDisconnect.success, true, "disconnect() should succeed");
            assertEqual(secondConnect.success, true, "Reconnect should succeed");
            assertEqual(secondConnect.state, "connected", "Reconnect should end in connected state");
        },

        "cleanup: close wrapper": async () => {
            await cleanupWrapper(wrapper);
            wrapper = null;
        },

    });

    // Cleanup mongoose models
    const modelNames = ["HookTest1", "HookTest2", "HookTest3", "HookTestUnsub", "HookTestAnalytics"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
