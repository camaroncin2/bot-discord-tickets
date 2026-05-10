require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");

let pool;
let ready = false;
let initPromise;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "discord_bot",
            waitForConnections: true,
            connectionLimit: 10,
            namedPlaceholders: true
        });
    }

    return pool;
}

async function query(sql, params = {}) {
    const [rows] = await getPool().execute(sql, params);
    return rows;
}

async function transaction(work) {
    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function initDb() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        await query(`
            CREATE TABLE IF NOT EXISTS ticket_panels (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                guild_id VARCHAR(32) NOT NULL,
                channel_id VARCHAR(32) NOT NULL,
                message_id VARCHAR(32) NULL,
                default_category_id VARCHAR(32) NULL,
                title VARCHAR(256) NOT NULL,
                description TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_ticket_panels_guild (guild_id)
            )
        `);

        await query("ALTER TABLE ticket_panels ADD COLUMN IF NOT EXISTS default_category_id VARCHAR(32) NULL AFTER message_id");

        await query(`
            CREATE TABLE IF NOT EXISTS ticket_buttons (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                panel_id BIGINT UNSIGNED NOT NULL,
                guild_id VARCHAR(32) NOT NULL,
                label VARCHAR(80) NOT NULL,
                style VARCHAR(16) NOT NULL,
                category_id VARCHAR(32) NOT NULL,
                staff_role_ids JSON NOT NULL,
                close_role_ids JSON NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_ticket_buttons_panel (panel_id),
                CONSTRAINT fk_ticket_buttons_panel FOREIGN KEY (panel_id) REFERENCES ticket_panels(id) ON DELETE CASCADE
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS ticket_counters (
                guild_id VARCHAR(32) NOT NULL,
                last_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (guild_id)
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                guild_id VARCHAR(32) NOT NULL,
                ticket_number BIGINT UNSIGNED NOT NULL,
                button_id BIGINT UNSIGNED NULL,
                panel_id BIGINT UNSIGNED NULL,
                type_label VARCHAR(80) NOT NULL,
                channel_id VARCHAR(32) NULL,
                user_id VARCHAR(32) NOT NULL,
                claimed_by VARCHAR(32) NULL,
                status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
                reason TEXT NOT NULL,
                close_reason TEXT NULL,
                closed_by VARCHAR(32) NULL,
                opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                claimed_at TIMESTAMP NULL,
                closed_at TIMESTAMP NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_tickets_guild_number (guild_id, ticket_number),
                INDEX idx_tickets_open_duplicate (guild_id, user_id, button_id, status),
                INDEX idx_tickets_channel (guild_id, channel_id),
                INDEX idx_tickets_status (guild_id, status)
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS ticket_events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                ticket_id BIGINT UNSIGNED NOT NULL,
                guild_id VARCHAR(32) NOT NULL,
                event_type VARCHAR(32) NOT NULL,
                actor_id VARCHAR(32) NULL,
                details JSON NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_ticket_events_ticket (ticket_id),
                CONSTRAINT fk_ticket_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            )
        `);

        ready = true;
    })();

    return initPromise;
}

function isDbReady() {
    return ready;
}

module.exports = {
    getPool,
    initDb,
    isDbReady,
    query,
    transaction
};
