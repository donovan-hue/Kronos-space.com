const mongoose = require("mongoose");

/**
 * Connects to the configured MongoDB instance.
 *
 * Deliberately does not fall back to MongoMemoryServer: an in-memory database
 * can hide production/configuration errors and loses all data on restart.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error("MONGODB_URI no configurado. Define una URI de MongoDB real.");
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
  });

  console.log(`MongoDB conectado (${mongoose.connection.name})`);
  return mongoose.connection;
}

module.exports = connectDB;
