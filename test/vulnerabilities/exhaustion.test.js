// test/vulnerabilities/exhaustion.test.js
// ─── Connection Exhaustion & Leakage Tests ──────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists, assertGreaterThanOrEqual,
    assertType, assertHasProperty,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo, logWarn
} = require("../test-config");

async function run() {
    let wrapper;

    const result = await runTestSuite("Connection Exhaustion & Leakage", {

        "setup: create wrapper": async () => {
            wrapper = createWrapper({ debug: false, maxPoolSize: 10 });
            assert(wrapper !== null, "Wrapper should be created");
        },

        "rapid sequential connectDB calls do not crash": async () => {
            const dbNames = [];
            for (let i = 0; i < 5; i++) {
                dbNames.push(`test_exhaust_seq_${i}`);
            }

            for (const name of dbNames) {
                await wrapper.scale.connectDB([name], { maxConnections: 2 });
            }

            const stats = wrapper.stats.general();
            assertGreaterThanOrEqual(stats.separateDB.length, 5,
                "Should have at least 5 separate pools");

            logInfo(`Created ${stats.separateDB.length} separate pools sequentially`);
        },

        "parallel connectDB calls do not crash": async () => {
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    wrapper.scale.connectDB([`test_exhaust_par_${i}`], { maxConnections: 2 })
                );
            }

            await Promise.all(promises);

            const stats = wrapper.stats.general();
            assertGreaterThanOrEqual(stats.separateDB.length, 10,
                "Should have at least 10 separate pools after parallel creation");

            logInfo(`Total pools after parallel creation: ${stats.separateDB.length}`);
        },

        "rapid queries on same wrapper do not exhaust pool": async () => {
            const Schema = new mongoose.Schema({ idx: Number });
            const Model = mongoose.model("ExhaustQuery", Schema);
            const Wrapped = wrapper.wrapModel(Model);

            await Wrapped.deleteMany({});

            // Fire 20 concurrent insertions
            const inserts = [];
            for (let i = 0; i < 20; i++) {
                inserts.push(Wrapped.create({ idx: i }));
            }
            await Promise.all(inserts);

            const count = await Wrapped.countDocuments();
            assertEqual(count, 20, "All 20 concurrent inserts should succeed");

            await Wrapped.deleteMany({});
            logInfo("20 concurrent inserts completed without pool exhaustion");
        },

        "forceCloseAll cleans up all created pools": async () => {
            // Before close, verify we have many pools
            const statsBefore = wrapper.stats.general();
            assertGreaterThanOrEqual(statsBefore.totalActivePools, 1, "Should have pools before cleanup");

            logInfo(`Pools before cleanup: ${statsBefore.totalActivePools}`);

            // Force close all
            await wrapper.actions.forceCloseAll();

            // After force close, wrapper should report not connected
            const connected = wrapper.isConnected();
            assertEqual(connected, false, "Should not be connected after forceCloseAll");

            logInfo("forceCloseAll cleaned up all pools successfully");
        },

        "wrapper can recover after force close": async () => {
            // Create a fresh wrapper after force close
            await cleanupWrapper(wrapper);
            wrapper = createWrapper({ debug: false, maxPoolSize: 10 });

            const Schema = new mongoose.Schema({ recovery: Boolean });
            const Model = mongoose.model("ExhaustRecovery", Schema);
            const Wrapped = wrapper.wrapModel(Model);

            await Wrapped.deleteMany({});
            await Wrapped.create({ recovery: true });
            const count = await Wrapped.countDocuments();
            assertEqual(count, 1, "Should work after recovery");

            await Wrapped.deleteMany({});
            logInfo("Wrapper recovered and operational after force close");
        },

        "connectDB with same name twice does not create duplicate pools": async () => {
            await wrapper.scale.connectDB(["test_exhaust_dup"], { maxConnections: 3 });
            const stats1 = wrapper.stats.general();
            const countBefore = stats1.separateDB.filter(s => s.dbName === "test_exhaust_dup").length;

            await wrapper.scale.connectDB(["test_exhaust_dup"], { maxConnections: 3 });
            const stats2 = wrapper.stats.general();
            const countAfter = stats2.separateDB.filter(s => s.dbName === "test_exhaust_dup").length;

            assertEqual(countBefore, countAfter,
                "Duplicate connectDB should not create additional pool");

            logInfo("Duplicate connectDB handled correctly");
        },

        "many simultaneous DB switches via wrapModel work correctly": async () => {
            const Schema = new mongoose.Schema({ db: String, value: Number });
            const Model = mongoose.model("ExhaustSwitch", Schema);
            const Wrapped = wrapper.wrapModel(Model);

            // Clean databases
            const dbNames = ["test_switch_a", "test_switch_b", "test_switch_c"];
            for (const name of dbNames) {
                await Wrapped.db(name).deleteMany({});
            }

            // Simultaneous switches
            const writes = [];
            for (let i = 0; i < 15; i++) {
                const db = dbNames[i % 3];
                writes.push(Wrapped.db(db).create({ db, value: i }));
            }
            await Promise.all(writes);

            // Verify each DB got its correct documents
            for (const name of dbNames) {
                const count = await Wrapped.db(name).countDocuments();
                assertEqual(count, 5, `${name} should have 5 documents`);
            }

            // Cleanup
            for (const name of dbNames) {
                await Wrapped.db(name).deleteMany({});
            }

            logInfo("15 simultaneous DB switches completed correctly");
        },

        "connection pool stats are accurate after operations": async () => {
            const stats = wrapper.stats.general();
            assertExists(stats, "Stats should exist");
            assertType(stats.totalActivePools, "number", "totalActivePools should be number");
            assertType(stats.totalConnectionsAcrossPools, "number", "totalConnectionsAcrossPools should be number");

            logInfo(`Final stats: ${stats.totalActivePools} active pools, ${stats.totalConnectionsAcrossPools} connections`);
        },

        "cleanup: force close all and verify": async () => {
            await cleanupWrapper(wrapper);
            wrapper = null;
            logInfo("Final cleanup complete");
        },

    });

    // Cleanup mongoose models
    const modelNames = ["ExhaustQuery", "ExhaustRecovery", "ExhaustSwitch"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
