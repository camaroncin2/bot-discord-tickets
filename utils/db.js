require("dotenv").config({ quiet: true });
const { MongoClient } = require("mongodb");

let client;
let db;
let ready = false;
let initPromise;

function getMongoUri() {
    return String(process.env.MONGODB_URI || process.env.MONGO_URI || "").trim();
}

function getDatabaseName() {
    return String(process.env.MONGODB_DB_NAME || process.env.DB_NAME || "discord_bot").trim();
}

function assertMongoUri(uri) {
    if (!uri) {
        throw new Error("Falta configurar MONGODB_URI en .env.");
    }
    if (uri.includes("<db_password>") || uri.includes("REEMPLAZA_PASSWORD")) {
        throw new Error("MONGODB_URI todavia contiene un placeholder. Reemplaza <db_password> por la contrasena real.");
    }
}

async function initDb() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const uri = getMongoUri();
        assertMongoUri(uri);

        client = new MongoClient(uri);
        await client.connect();
        db = client.db(getDatabaseName());
        await db.command({ ping: 1 });

        await Promise.all([
            db.collection("ticket_panels").createIndex({ id: 1 }, { unique: true }),
            db.collection("ticket_panels").createIndex({ guild_id: 1, id: -1 }),
            db.collection("ticket_buttons").createIndex({ id: 1 }, { unique: true }),
            db.collection("ticket_buttons").createIndex({ guild_id: 1, panel_id: 1, id: 1 }),
            db.collection("tickets").createIndex({ id: 1 }, { unique: true }),
            db.collection("tickets").createIndex({ guild_id: 1, ticket_number: 1 }, { unique: true }),
            db.collection("tickets").createIndex({ guild_id: 1, user_id: 1, button_id: 1, status: 1 }),
            db.collection("tickets").createIndex({ guild_id: 1, channel_id: 1, status: 1 }),
            db.collection("tickets").createIndex({ guild_id: 1, status: 1, opened_at: -1 }),
            db.collection("ticket_events").createIndex({ id: 1 }, { unique: true }),
            db.collection("ticket_events").createIndex({ ticket_id: 1, guild_id: 1, created_at: 1 }),
            db.collection("ticket_messages").createIndex({ ticket_id: 1, guild_id: 1, created_at: 1 }),
            db.collection("ticket_messages").createIndex({ ticket_id: 1, guild_id: 1, author_id: 1 })
        ]);

        ready = true;
    })();

    return initPromise;
}

function getDb() {
    if (!db) {
        throw new Error("MongoDB no esta inicializado. Llama initDb() primero.");
    }
    return db;
}

function collection(name) {
    return getDb().collection(name);
}

async function nextSequence(name) {
    await initDb();
    const result = await collection("ticket_counters").findOneAndUpdate(
        { _id: name },
        {
            $inc: { last_number: 1 },
            $setOnInsert: { created_at: new Date() },
            $set: { updated_at: new Date() }
        },
        { upsert: true, returnDocument: "after" }
    );

    const doc = result?.value || result;
    return doc.last_number;
}

function isDbReady() {
    return ready;
}

module.exports = {
    collection,
    getDb,
    initDb,
    isDbReady,
    nextSequence
};
