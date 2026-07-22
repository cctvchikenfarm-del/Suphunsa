'use strict';

process.env.AUTOMATION_RUNNER_ENABLED = 'true';
const { automationTick } = require('./server');

automationTick(true)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Automation runner failed:', error.message);
    process.exit(1);
  });
