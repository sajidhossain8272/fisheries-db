import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "fisheries";

if (!uri) {
  throw new Error("Missing MONGODB_URI in environment variables.");
}

let clientPromise = globalThis._mongoClientPromise;
if (!clientPromise) {
  const client = new MongoClient(uri);
  clientPromise = client.connect();
  globalThis._mongoClientPromise = clientPromise;
}

export async function getMongoClient() {
  return clientPromise;
}

export async function getDb() {
  const mongoClient = await getMongoClient();
  return mongoClient.db(dbName);
}
