// test/index.js
// ─── PolyMongo Production-Grade Test Runner ─────────────────────────────────
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const PolyMongo = require("../dist/index");
const {
    colors, logSection, logInfo, logWarn,
    mongoURI, databases, poolConfig,
    createWrapper, cleanupWrapper
} = require("./test-config");

// ─── Import All Test Suites ─────────────────────────────────────────────────
const validationTests = require("./features/validation.test");
const poolingTests = require("./features/pooling.test");
const multidbTests = require("./features/multidb.test");
const transactionTests = require("./features/transactions.test");
const bulkTests = require("./features/bulk.test");
const observabilityTests = require("./features/observability.test");
const hooksTests = require("./features/hooks.test");
const actionsTests = require("./features/actions.test");
const injectionTests = require("./vulnerabilities/injection.test");
const exhaustionTests = require("./vulnerabilities/exhaustion.test");

// ─── Main Runner ────────────────────────────────────────────────────────────
async function runAllTests() {
    const startTime = Date.now();

    console.log("\n" + "═".repeat(60));
    console.log(`${colors.bold}${colors.cyan}  🚀 PolyMongo Production-Grade Test Suite${colors.reset}`);
    console.log(`${colors.dim}  Target: ${mongoURI}${colors.reset}`);
    console.log(`${colors.dim}  Started: ${new Date().toISOString()}${colors.reset}`);
    console.log("═".repeat(60));

    // ─── Step 1: Verify MongoDB Connectivity ────────────────────────────
    logSection("Pre-flight: MongoDB Connectivity Check");
    let preWrapper;
    try {
        preWrapper = createWrapper({ debug: false });
        const TestSchema = new mongoose.Schema({ _preflight: Boolean });
        const TestModel = mongoose.model("_PreflightCheck", TestSchema);
        const WrappedTest = preWrapper.wrapModel(TestModel);
        await WrappedTest.deleteMany({});
        await WrappedTest.create({ _preflight: true });
        await WrappedTest.deleteMany({});
        logInfo("MongoDB connection verified ✓");
        await cleanupWrapper(preWrapper);
        delete mongoose.connection.models["_PreflightCheck"];
        delete mongoose.models["_PreflightCheck"];
    } catch (error) {
        console.error(`\n${colors.red}${colors.bold}  ❌ CANNOT CONNECT TO MONGODB${colors.reset}`);
        console.error(`${colors.red}  URI: ${mongoURI}${colors.reset}`);
        console.error(`${colors.red}  Error: ${error.message}${colors.reset}`);
        console.error(`\n${colors.yellow}  Make sure MongoDB is running on localhost:27017${colors.reset}`);
        console.error(`${colors.yellow}  Or set MONGO_URI environment variable.${colors.reset}\n`);
        process.exit(1);
    }

    // ─── Step 2: Seed Dummy Data ────────────────────────────────────────
    logSection("Seed: Loading Dummy Data");
    let seedWrapper;
    try {
        seedWrapper = createWrapper({ debug: false });
        const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, "dummy/users.json"), "utf-8"));
        const ordersData = JSON.parse(fs.readFileSync(path.join(__dirname, "dummy/orders.json"), "utf-8"));

        const UserSchema = new mongoose.Schema({ name: String, email: String, role: String });
        const OrderSchema = new mongoose.Schema({ orderId: String, amount: Number, status: String });
        const UserModel = mongoose.model("_SeedUser", UserSchema);
        const OrderModel = mongoose.model("_SeedOrder", OrderSchema);
        const WrappedUser = seedWrapper.wrapModel(UserModel);
        const WrappedOrder = seedWrapper.wrapModel(OrderModel);

        await WrappedUser.deleteMany({});
        await WrappedUser.insertMany(usersData);
        await WrappedOrder.db(databases.analytics).deleteMany({});
        await WrappedOrder.db(databases.analytics).insertMany(ordersData);

        logInfo(`Seeded ${usersData.length} users into ${databases.default}`);
        logInfo(`Seeded ${ordersData.length} orders into ${databases.analytics}`);

        await cleanupWrapper(seedWrapper);
        delete mongoose.connection.models["_SeedUser"];
        delete mongoose.models["_SeedUser"];
        delete mongoose.connection.models["_SeedOrder"];
        delete mongoose.models["_SeedOrder"];
    } catch (error) {
        logWarn("Seed data error (tests may still pass): " + error.message);
        await cleanupWrapper(seedWrapper);
    }

    // ─── Step 3: Run All Test Suites ────────────────────────────────────
    const allResults = [];

    // Feature Tests
    const featureSuites = [
        { name: "Validation", runner: validationTests },
        { name: "Pooling", runner: poolingTests },
        { name: "Multi-DB", runner: multidbTests },
        { name: "Transactions", runner: transactionTests },
        { name: "Bulk Ops", runner: bulkTests },
        { name: "Observability", runner: observabilityTests },
        { name: "Hooks", runner: hooksTests },
        { name: "Actions", runner: actionsTests },
    ];

    // Vulnerability Tests
    const vulnSuites = [
        { name: "Injection", runner: injectionTests },
        { name: "Exhaustion", runner: exhaustionTests },
    ];

    console.log("\n" + "─".repeat(60));
    console.log(`${colors.bold}  📋 FEATURE TESTS${colors.reset}`);
    console.log("─".repeat(60));

    for (const suite of featureSuites) {
        try {
            const result = await suite.runner.run();
            allResults.push(result);
        } catch (error) {
            console.error(`  ${colors.red}❌ Suite "${suite.name}" crashed: ${error.message}${colors.reset}`);
            allResults.push({
                suiteName: suite.name,
                passed: 0,
                failed: 1,
                failures: [{ testName: "Suite Crash", error }]
            });
        }
    }

    console.log("\n" + "─".repeat(60));
    console.log(`${colors.bold}  🛡️  VULNERABILITY TESTS${colors.reset}`);
    console.log("─".repeat(60));

    for (const suite of vulnSuites) {
        try {
            const result = await suite.runner.run();
            allResults.push(result);
        } catch (error) {
            console.error(`  ${colors.red}❌ Suite "${suite.name}" crashed: ${error.message}${colors.reset}`);
            allResults.push({
                suiteName: suite.name,
                passed: 0,
                failed: 1,
                failures: [{ testName: "Suite Crash", error }]
            });
        }
    }

    // ─── Step 4: Cleanup Test Databases ─────────────────────────────────
    logSection("Teardown: Cleaning Test Databases");
    let cleanupW;
    try {
        cleanupW = createWrapper({ debug: false });
        const testDbNames = Object.values(databases);
        for (const dbName of testDbNames) {
            try {
                await cleanupW.bulkTasks.dropDatabase(dbName);
            } catch (e) {
                // Ignore drop errors for non-existent DBs
            }
        }
        // Also clean up extra test DBs
        const extraDbs = [
            "test_pool_scaled", "test_pool_separate", "test_ttl_db",
            "test_obs_separate", "test_action_sep",
            "test_switch_a", "test_switch_b", "test_switch_c",
        ];
        for (const dbName of extraDbs) {
            try { await cleanupW.bulkTasks.dropDatabase(dbName); } catch (e) { /* OK */ }
        }
        // Drop exhaust test DBs
        for (let i = 0; i < 5; i++) {
            try { await cleanupW.bulkTasks.dropDatabase(`test_exhaust_seq_${i}`); } catch (e) { /* OK */ }
            try { await cleanupW.bulkTasks.dropDatabase(`test_exhaust_par_${i}`); } catch (e) { /* OK */ }
        }
        try { await cleanupW.bulkTasks.dropDatabase("test_exhaust_dup"); } catch (e) { /* OK */ }

        await cleanupWrapper(cleanupW);
        logInfo("Test databases cleaned up ✓");
    } catch (error) {
        logWarn("Cleanup warning: " + error.message);
        await cleanupWrapper(cleanupW);
    }

    // ─── Step 5: Final Report ───────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    let totalPassed = 0;
    let totalFailed = 0;
    const failedTests = [];

    for (const result of allResults) {
        totalPassed += result.passed;
        totalFailed += result.failed;
        if (result.failures.length > 0) {
            failedTests.push(...result.failures.map(f => ({
                suite: result.suiteName,
                ...f
            })));
        }
    }

    const totalTests = totalPassed + totalFailed;

    console.log("\n" + "═".repeat(60));
    console.log(`${colors.bold}  📊 FINAL TEST REPORT${colors.reset}`);
    console.log("═".repeat(60));
    console.log();

    // Suite-by-suite breakdown
    for (const result of allResults) {
        const icon = result.failed === 0 ? `${colors.green}✔` : `${colors.red}✘`;
        const counts = `${colors.green}${result.passed} passed${colors.reset}, ${result.failed > 0 ? colors.red : colors.dim}${result.failed} failed${colors.reset}`;
        console.log(`  ${icon}${colors.reset} ${result.suiteName} — ${counts}`);
    }

    console.log();
    console.log("─".repeat(60));

    if (totalFailed === 0) {
        console.log(`\n  ${colors.green}${colors.bold}✅ ALL ${totalTests} TESTS PASSED${colors.reset}`);
    } else {
        console.log(`\n  ${colors.red}${colors.bold}❌ ${totalFailed} OF ${totalTests} TESTS FAILED${colors.reset}`);
        console.log();
        for (const f of failedTests) {
            console.log(`  ${colors.red}✘ [${f.suite}] ${f.testName}${colors.reset}`);
            if (f.error) {
                console.log(`    ${colors.dim}${f.error.message || f.error}${colors.reset}`);
            }
        }
    }

    console.log(`\n  ${colors.dim}Duration: ${elapsed}s | Suites: ${allResults.length} | Tests: ${totalTests}${colors.reset}`);
    console.log(`  ${colors.dim}Finished: ${new Date().toISOString()}${colors.reset}`);
    console.log("\n  DONE EVERYTHING.");
    console.log("═".repeat(60) + "\n");

    // Close any remaining mongoose connections
    try {
        await mongoose.disconnect();
    } catch (e) { /* OK */ }

    // Exit with appropriate code
    process.exit(totalFailed > 0 ? 1 : 0);
}

// ─── Execute ────────────────────────────────────────────────────────────────
runAllTests().catch((error) => {
    console.error(`\n${colors.red}${colors.bold}FATAL ERROR:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
