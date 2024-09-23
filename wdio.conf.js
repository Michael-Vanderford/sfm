exports.config = {
    //
    // ====================
    // Runner Configuration
    // ====================
    //
    runner: 'local',
    //
    // ==================
    // Specify Test Files
    // ==================
    specs: [
        './test/specs/**/*.js'
    ],
    //
    // ============
    // Capabilities
    // ============
    capabilities: [{
        browserName: 'chrome',
        'goog:chromeOptions': {
            binary: '/usr/bin/chrome'
        },
        'wdio:electronServiceOptions': {
            // appBinaryPath: '/path/to/your/electron/app',
            // or for unpackaged apps:
            appEntryPoint: './src/main.js',
            // appArgs: ['--some-argument']
        }
    }],
    //
    // ===================
    // Test Configurations
    // ===================
    logLevel: 'info',
    bail: 0,
    baseUrl: 'http://localhost',
    waitforTimeout: 10000,
    connectionRetryTimeout: 90000,
    connectionRetryCount: 3,
    services: ['electron'],
    framework: 'mocha',
    // reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },
    //
    // =====
    // Hooks
    // =====
    before: function (capabilities, specs) {
        // Add any setup code here
    },
}