// test/test-config.js
// ─── Global Test Configuration & Helpers ────────────────────────────────────

const PolyMongo = require("../dist/index");

// ─── MongoDB Config ─────────────────────────────────────────────────────────
const mongoURI = process.env.MONGO_URI || "mongodb://admin:admin@localhost:27017/?replicaSet=rs0&authSource=admin";

const databases = {
    default: "test_inventory",
    analytics: "test_analytics",
    archive: "test_archive",
    staging: "test_staging",
    temp: "test_temp",
    bulkSource: "test_bulk_source",
    bulkTarget: "test_bulk_target",
    copySource: "test_copy_source",
    copyTarget: "test_copy_target",
    streamSource: "test_stream_source",
    streamTarget: "test_stream_target",
    isolation_a: "test_isolation_a",
    isolation_b: "test_isolation_b",
};

const poolConfig = {
    maxPoolSize: 20,
    minFreeConnections: 2,
    idleTimeoutMS: 5000, // 5 seconds for fast testing of TTL
    debug: false         // disable console noise during tests
};

// ─── Color Helpers ──────────────────────────────────────────────────────────
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    magenta: "\x1b[35m",
};

function logPass(msg) {
    console.log(`   ${colors.green}✔ PASS${colors.reset} ${msg}`);
}

function logFail(msg, error) {
    console.log(`   ${colors.red}✘ FAIL${colors.reset} ${msg}`);
    if (error) {
        console.log(`     ${colors.dim}${error.message || error}${colors.reset}`);
    }
}

function logInfo(msg) {
    console.log(`   ${colors.cyan}ℹ INFO${colors.reset} ${msg}`);
}

function logWarn(msg) {
    console.log(`   ${colors.yellow}⚠ WARN${colors.reset} ${msg}`);
}

function logSection(msg) {
    console.log(`\n${colors.bold}${colors.magenta}▸ ${msg}${colors.reset}`);
}

// ─── Assertion Helpers ──────────────────────────────────────────────────────
class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = "AssertionError";
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new AssertionError(message || "Assertion failed");
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new AssertionError(
            `${message || "assertEqual failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
    }
}

function assertDeepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        throw new AssertionError(
            `${message || "assertDeepEqual failed"}: expected ${e}, got ${a}`
        );
    }
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (e) {
        threw = true;
    }
    if (!threw) {
        throw new AssertionError(message || "Expected function to throw, but it did not");
    }
}

async function assertThrowsAsync(fn, message) {
    let threw = false;
    try {
        await fn();
    } catch (e) {
        threw = true;
    }
    if (!threw) {
        throw new AssertionError(message || "Expected async function to throw, but it did not");
    }
}

function assertType(value, type, message) {
    if (typeof value !== type) {
        throw new AssertionError(
            `${message || "assertType failed"}: expected type "${type}", got "${typeof value}"`
        );
    }
}

function assertExists(value, message) {
    if (value === null || value === undefined) {
        throw new AssertionError(message || "Expected value to exist, but got null/undefined");
    }
}

function assertArray(value, message) {
    if (!Array.isArray(value)) {
        throw new AssertionError(message || `Expected array, got ${typeof value}`);
    }
}

function assertGreaterThan(actual, expected, message) {
    if (!(actual > expected)) {
        throw new AssertionError(
            `${message || "assertGreaterThan failed"}: ${actual} is not > ${expected}`
        );
    }
}

function assertGreaterThanOrEqual(actual, expected, message) {
    if (!(actual >= expected)) {
        throw new AssertionError(
            `${message || "assertGreaterThanOrEqual failed"}: ${actual} is not >= ${expected}`
        );
    }
}

function assertIncludes(arr, item, message) {
    if (!arr.includes(item)) {
        throw new AssertionError(
            `${message || "assertIncludes failed"}: ${JSON.stringify(arr)} does not include ${JSON.stringify(item)}`
        );
    }
}

function assertHasProperty(obj, prop, message) {
    if (!(prop in obj) && obj[prop] === undefined) {
        throw new AssertionError(
            `${message || "assertHasProperty failed"}: object does not have property "${prop}"`
        );
    }
}

// ─── Utility Helpers ────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWrapper(overrides = {}) {
    return PolyMongo.createWrapper({
        mongoURI,
        defaultDB: databases.default,
        ...poolConfig,
        ...overrides
    });
}

async function cleanupWrapper(wrapper) {
    if (wrapper) {
        try {
            await wrapper.actions.forceCloseAll();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

// ─── Test Runner Helpers ────────────────────────────────────────────────────
async function runTestSuite(suiteName, tests) {
    logSection(suiteName);
    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const [testName, testFn] of Object.entries(tests)) {
        try {
            await testFn();
            logPass(testName);
            passed++;
        } catch (error) {
            logFail(testName, error);
            failed++;
            failures.push({ testName, error });
        }
    }

    return { suiteName, passed, failed, failures };
}

// ─── Exports ────────────────────────────────────────────────────────────────
module.exports = {
    mongoURI,
    databases,
    poolConfig,
    // Colors
    colors,
    logPass,
    logFail,
    logInfo,
    logWarn,
    logSection,
    // Assertions
    assert,
    assertEqual,
    assertDeepEqual,
    assertThrows,
    assertThrowsAsync,
    assertType,
    assertExists,
    assertArray,
    assertGreaterThan,
    assertGreaterThanOrEqual,
    assertIncludes,
    assertHasProperty,
    AssertionError,
    // Utilities
    sleep,
    createWrapper,
    cleanupWrapper,
    runTestSuite,
    PolyMongo,
};
