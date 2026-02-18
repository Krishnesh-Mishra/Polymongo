// test/features/transactions.test.js
// ─── Multi-DB Transaction Tests ─────────────────────────────────────────────
const mongoose = require("mongoose");
const {
    assert, assertEqual, assertExists, assertThrowsAsync,
    runTestSuite, createWrapper, cleanupWrapper, sleep,
    mongoURI, databases, poolConfig, logInfo, logWarn
} = require("../test-config");

async function run() {
    let wrapper;
    let isReplicaSet = false;

    const result = await runTestSuite("Transactions (Multi-DB)", {

        "setup: initialize wrapper and detect replica set": async () => {
            wrapper = createWrapper({ debug: false });

            // Detect if running on a replica set
            try {
                const primary = wrapper.initPrimary();
                await new Promise((resolve, reject) => {
                    if (primary.readyState === 1) resolve();
                    else {
                        primary.once("open", resolve);
                        primary.once("error", reject);
                        setTimeout(() => reject(new Error("Connection timeout")), 5000);
                    }
                });

                if (primary.db) {
                    const admin = primary.db.admin();
                    try {
                        await admin.command({ replSetGetStatus: 1 });
                        isReplicaSet = true;
                        logInfo("Replica set detected — full transaction tests enabled");
                    } catch (e) {
                        isReplicaSet = false;
                        logWarn("No replica set detected — transaction tests will run in limited mode");
                    }
                }
            } catch (e) {
                logWarn("Could not determine replica set status: " + e.message);
            }
            assert(wrapper !== null, "Wrapper should be created");
        },

        "transaction() method exists and is callable": async () => {
            assertExists(wrapper.transaction, "transaction method should exist");
            assert(typeof wrapper.transaction === "function", "transaction should be a function");
        },

        "transaction commits successfully on simple operation": async () => {
            if (!isReplicaSet) {
                logWarn("Skipped (no replica set) — transactions require a replica set");
                return;
            }

            const TxSchema = new mongoose.Schema({ value: Number, label: String });
            const TxModel = mongoose.model("TxCommitTest", TxSchema);
            const WrappedTx = wrapper.wrapModel(TxModel);

            await WrappedTx.deleteMany({});

            const result = await wrapper.transaction(async (session) => {
                await WrappedTx.create([{ value: 100, label: "tx_test_1" }], { session });
                await WrappedTx.create([{ value: 200, label: "tx_test_2" }], { session });
                return "committed";
            });

            const count = await WrappedTx.countDocuments();
            assertEqual(count, 2, "Should have 2 documents after committed transaction");
            await WrappedTx.deleteMany({});
        },

        "transaction rolls back on error (no partial data)": async () => {
            if (!isReplicaSet) {
                logWarn("Skipped (no replica set) — transactions require a replica set");
                return;
            }

            const RbSchema = new mongoose.Schema({ value: Number });
            const RbModel = mongoose.model("TxRollbackTest", RbSchema);
            const WrappedRb = wrapper.wrapModel(RbModel);

            await WrappedRb.deleteMany({});

            try {
                await wrapper.transaction(async (session) => {
                    await WrappedRb.create([{ value: 1 }], { session });
                    await WrappedRb.create([{ value: 2 }], { session });
                    // Force an error to trigger rollback
                    throw new Error("Intentional failure for rollback test");
                });
            } catch (e) {
                // Expected
            }

            const count = await WrappedRb.countDocuments();
            assertEqual(count, 0, "Should have 0 documents after rolled-back transaction");
        },

        "transaction across multiple collections": async () => {
            if (!isReplicaSet) {
                logWarn("Skipped (no replica set) — transactions require a replica set");
                return;
            }

            const AccSchema = new mongoose.Schema({ name: String, balance: Number });
            const LogSchema = new mongoose.Schema({ action: String, timestamp: Date });
            const AccModel = mongoose.model("TxAccount", AccSchema);
            const LogModel = mongoose.model("TxLog", LogSchema);
            const WrappedAcc = wrapper.wrapModel(AccModel);
            const WrappedLog = wrapper.wrapModel(LogModel);

            await WrappedAcc.deleteMany({});
            await WrappedLog.deleteMany({});

            await wrapper.transaction(async (session) => {
                await WrappedAcc.create([{ name: "Sender", balance: 500 }], { session });
                await WrappedAcc.create([{ name: "Receiver", balance: 1000 }], { session });
                await WrappedLog.create([{ action: "transfer", timestamp: new Date() }], { session });
            });

            const accCount = await WrappedAcc.countDocuments();
            const logCount = await WrappedLog.countDocuments();

            assertEqual(accCount, 2, "Should have 2 accounts");
            assertEqual(logCount, 1, "Should have 1 log entry");

            await WrappedAcc.deleteMany({});
            await WrappedLog.deleteMany({});
        },

        "transaction method throws on non-replica-set with session": async () => {
            if (isReplicaSet) {
                logInfo("Skipped — this test is for non-replica-set environments only");
                return;
            }

            // On a standalone server, startTransaction should throw
            let threw = false;
            try {
                await wrapper.transaction(async (session) => {
                    return "should not reach here";
                });
            } catch (e) {
                threw = true;
                logInfo("Expected error on standalone: " + e.message);
            }

            assert(threw, "Transaction should throw on standalone MongoDB");
        },

        "cleanup: close wrapper": async () => {
            await cleanupWrapper(wrapper);
            wrapper = null;
        },
    });

    // Cleanup mongoose models
    const modelNames = ["TxCommitTest", "TxRollbackTest", "TxAccount", "TxLog"];
    for (const name of modelNames) {
        try {
            delete mongoose.connection.models[name];
            delete mongoose.models[name];
        } catch (e) { /* OK */ }
    }

    return result;
}

module.exports = { run };
