const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

async function hashPassword(rawPassword) {
  return bcrypt.hash(rawPassword, SALT_ROUNDS);
}

async function comparePassword(rawPassword, hashedPassword) {
  return bcrypt.compare(rawPassword, hashedPassword);
}

/**
 * Generates a random, human-typeable password such as "x8k2p9lq".
 * Used whenever a bot command creates website login credentials for a user.
 */
function generateRandomPassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function generateOtp(digits = 4) {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, '0');
}

module.exports = { hashPassword, comparePassword, generateRandomPassword, generateOtp };
