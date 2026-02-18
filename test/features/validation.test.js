// test/features/validation.test.js
// ─── Input Validation & Guard Tests ─────────────────────────────────────────
const {
    assert, assertThrows, runTestSuite,
    PolyMongo, mongoURI, databases, poolConfig
} = require("../test-config");

async function run() {
    return runTestSuite("Input Validation & Guards", {

        "createWrapper rejects missing mongoURI": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ defaultDB: "test" });
            }, "Should throw when mongoURI is missing");
        },

        "createWrapper rejects non-string mongoURI": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI: 12345, defaultDB: "test" });
            }, "Should throw when mongoURI is not a string");
        },

        "createWrapper rejects invalid URI prefix": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI: "http://localhost:27017", defaultDB: "test" });
            }, "Should throw for non-mongodb:// URI");
        },

        "createWrapper rejects negative maxPoolSize": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI, defaultDB: "test", maxPoolSize: -1 });
            }, "Should throw for negative maxPoolSize");
        },

        "createWrapper rejects zero maxPoolSize": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI, defaultDB: "test", maxPoolSize: 0 });
            }, "Should throw for zero maxPoolSize");
        },

        "createWrapper rejects string maxPoolSize": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI, defaultDB: "test", maxPoolSize: "ten" });
            }, "Should throw for non-number maxPoolSize");
        },

        "createWrapper rejects negative minFreeConnections": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI, defaultDB: "test", minFreeConnections: -1 });
            }, "Should throw for negative minFreeConnections");
        },

        "createWrapper rejects negative idleTimeoutMS": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({ mongoURI, defaultDB: "test", idleTimeoutMS: -100 });
            }, "Should throw for negative idleTimeoutMS");
        },

        "createWrapper rejects minFreeConnections > maxPoolSize": () => {
            assertThrows(() => {
                PolyMongo.createWrapper({
                    mongoURI, defaultDB: "test",
                    maxPoolSize: 5, minFreeConnections: 10
                });
            }, "Should throw when minFreeConnections exceeds maxPoolSize");
        },

        "createWrapper accepts valid mongodb:// URI": () => {
            const w = PolyMongo.createWrapper({ mongoURI: "mongodb://localhost:27017", defaultDB: "test" });
            assert(w !== null, "Wrapper should be created");
            w.actions.forceCloseAll().catch(() => { });
        },

        "createWrapper accepts valid mongodb+srv:// URI": () => {
            // Just validates no throw; actual connection may fail without Atlas
            let threw = false;
            try {
                const w = PolyMongo.createWrapper({ mongoURI: "mongodb+srv://fake:fake@cluster.test.net", defaultDB: "test" });
                w.actions.forceCloseAll().catch(() => { });
            } catch (e) {
                // Connection failure is OK, validation should pass
                threw = e.message.includes("mongoURI");
            }
            assert(!threw, "Should not throw a validation error for mongodb+srv:// prefix");
        },

        "wrapModel rejects null model": () => {
            const w = PolyMongo.createWrapper({ mongoURI, defaultDB: "test", ...poolConfig });
            assertThrows(() => {
                w.wrapModel(null);
            }, "Should throw for null model");
            w.actions.forceCloseAll().catch(() => { });
        },

        "wrapModel rejects object without modelName": () => {
            const w = PolyMongo.createWrapper({ mongoURI, defaultDB: "test", ...poolConfig });
            assertThrows(() => {
                w.wrapModel({ schema: {} });
            }, "Should throw for model without modelName");
            w.actions.forceCloseAll().catch(() => { });
        },

        "wrapModel rejects object without schema": () => {
            const w = PolyMongo.createWrapper({ mongoURI, defaultDB: "test", ...poolConfig });
            assertThrows(() => {
                w.wrapModel({ modelName: "Test" });
            }, "Should throw for model without schema");
            w.actions.forceCloseAll().catch(() => { });
        },

        "createWrapper accepts valid pool configuration": () => {
            const w = PolyMongo.createWrapper({
                mongoURI,
                defaultDB: "test",
                maxPoolSize: 50,
                minFreeConnections: 5,
                idleTimeoutMS: 30000
            });
            assert(w !== null, "Wrapper should be created with custom pool config");
            w.actions.forceCloseAll().catch(() => { });
        },

    });
}

module.exports = { run };
