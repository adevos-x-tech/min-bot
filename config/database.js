const mongoose = require('mongoose');

let isConnected = false;

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('[database] MONGODB_URI is not set. Running without a persistent database.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
    isConnected = true;
    console.log('[database] Connected to MongoDB');

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[database] MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      console.log('[database] MongoDB reconnected');
    });

    return true;
  } catch (err) {
    isConnected = false;
    console.error('[database] Failed to connect to MongoDB:', err.message);
    return false;
  }
}

function isDatabaseConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, isDatabaseConnected };
