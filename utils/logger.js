const chalk = require('chalk');

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (scope, message) => console.log(chalk.cyan(`[${timestamp()}] [${scope}]`), message),
  success: (scope, message) => console.log(chalk.green(`[${timestamp()}] [${scope}]`), message),
  warn: (scope, message) => console.log(chalk.yellow(`[${timestamp()}] [${scope}]`), message),
  error: (scope, message) => console.log(chalk.red(`[${timestamp()}] [${scope}]`), message)
};

module.exports = logger;
