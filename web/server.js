require("dotenv").config({ quiet: true });
const express = require("express");
const session = require("express-session");
const path = require("path");
const { ChannelType } = require("discord.js");
const {
    addButton,
    createPanel,
    deleteButton,
    deletePanel,
    getPanel,
    getPanelButtons,
    getPanelWithButtons,
    getPanels,
    getTicketById,
    getTicketEvents,
    parseJsonArray,
    publishPanelForGuild,
    searchTickets,
    ticketStats,
    updateButton,
    updatePanel
} = require("../utils/ticketService");

function requireAuth(req, res, next) {
    if (req.session?.authed) return next();
    return res.status(401).json({ error: "No autenticado." });
}

function firstGuild(client) {
    return client.guilds.cache.first();
}

function jsonIds(value) {
    if (Array.isArray(value)) return value;
    return parseJsonArray(value);
}

function mapPanel(panel, guild) {
    return {
        ...panel,
        channelName: guild.channels.cache.get(panel.channel_id)?.name || null,
        defaultCategoryName: panel.default_category_id
            ? guild.channels.cache.get(panel.default_category_id)?.name || null
            : null
    };
}

function mapButton(button, guild) {
    return {
        ...button,
        staff_role_ids: jsonIds(button.staff_role_ids),
        close_role_ids: jsonIds(button.close_role_ids),
        categoryName: guild.channels.cache.get(button.category_id)?.name || null
    };
}

async function findOrCreateTextChannel(guild, channelId, name) {
    if (channelId) {
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (channel) return channel;
    }

    const cleanName = String(name || "abrir-ticket")
        .trim()
        .toLowerCase()
        .replace(/^#/, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 90);

    let channel = guild.channels.cache.find(item => item.type === ChannelType.GuildText && item.name === cleanName);
    if (!channel) {
        channel = await guild.channels.create({
            name: cleanName,
            type: ChannelType.GuildText,
            reason: "Canal creado desde web de tickets"
        });
    }
    return channel;
}

async function findOrCreateCategory(guild, categoryId, name) {
    if (categoryId) {
        const category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
        if (category) return category;
    }

    const cleanName = String(name || "tickets")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 90);

    let category = guild.channels.cache.find(item =>
        item.type === ChannelType.GuildCategory && item.name.toLowerCase() === cleanName
    );
    if (!category) {
        category = await guild.channels.create({
            name: cleanName,
            type: ChannelType.GuildCategory,
            reason: "Categoria creada desde web de tickets"
        });
    }
    return category;
}

function startWebServer(client) {
    const app = express();
    const port = Number(process.env.WEB_PORT || 3000);
    const password = process.env.WEB_PASSWORD || "admin";
    const sessionSecret = process.env.SESSION_SECRET || "change-this-session-secret";
    const frontendPath = path.join(__dirname, "dist");

    app.use(express.json({ limit: "1mb" }));
    app.use(session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax"
        }
    }));
    app.use(express.static(frontendPath));

    app.post("/api/login", (req, res) => {
        if (req.body?.password !== password) {
            return res.status(401).json({ error: "Clave incorrecta." });
        }
        req.session.authed = true;
        return res.json({ ok: true });
    });

    app.post("/api/logout", (req, res) => {
        req.session.destroy(() => res.json({ ok: true }));
    });

    app.get("/api/me", (req, res) => {
        res.json({ authed: Boolean(req.session?.authed) });
    });

    app.get("/api/guild", requireAuth, (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "El bot no esta en ningun servidor." });

        res.json({
            id: guild.id,
            name: guild.name,
            channels: guild.channels.cache
                .filter(channel => channel.type === ChannelType.GuildText)
                .map(channel => ({ id: channel.id, name: channel.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            categories: guild.channels.cache
                .filter(channel => channel.type === ChannelType.GuildCategory)
                .map(channel => ({ id: channel.id, name: channel.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            roles: guild.roles.cache
                .filter(role => role.id !== guild.id)
                .map(role => ({ id: role.id, name: role.name, color: role.hexColor }))
                .sort((a, b) => a.name.localeCompare(b.name))
        });
    });

    app.get("/api/stats", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        res.json(await ticketStats(guild.id));
    });

    app.get("/api/tickets", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const rows = await searchTickets(guild.id, req.query);
        res.json(rows);
    });

    app.get("/api/tickets/:id", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const ticket = await getTicketById(req.params.id, guild.id);
        if (!ticket) return res.status(404).json({ error: "Ticket no encontrado." });
        const events = await getTicketEvents(ticket.id, guild.id);
        res.json({ ticket, events });
    });

    app.get("/api/panels", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const panels = await getPanels(guild.id, 100);
        const result = [];
        for (const panel of panels) {
            const buttons = await getPanelButtons(panel.id, guild.id);
            const channel = guild.channels.cache.get(panel.channel_id);
            let status = "sin publicar";
            if (panel.message_id && !channel) status = "canal no encontrado";
            if (panel.message_id && channel) {
                const message = await channel.messages.fetch(panel.message_id).catch(() => null);
                status = message ? "publicado" : "mensaje no encontrado";
            }
            result.push({
                ...mapPanel(panel, guild),
                buttons: buttons.map(button => mapButton(button, guild)),
                status
            });
        }
        res.json(result);
    });

    app.get("/api/panels/:id", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const panel = await getPanelWithButtons(req.params.id, guild.id);
        if (!panel) return res.status(404).json({ error: "Panel no encontrado." });
        panel.buttons = panel.buttons.map(button => mapButton(button, guild));
        res.json(mapPanel(panel, guild));
    });

    app.post("/api/panels", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const channel = await findOrCreateTextChannel(guild, req.body.channelId, req.body.channelName);
        const category = await findOrCreateCategory(guild, req.body.defaultCategoryId, req.body.defaultCategoryName);
        const panelId = await createPanel(guild.id, channel.id, req.body.title, req.body.description, category.id);
        res.json({ id: panelId });
    });

    app.put("/api/panels/:id", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const channel = await findOrCreateTextChannel(guild, req.body.channelId, req.body.channelName);
        const category = await findOrCreateCategory(guild, req.body.defaultCategoryId, req.body.defaultCategoryName);
        await updatePanel(guild.id, req.params.id, {
            channelId: channel.id,
            defaultCategoryId: category.id,
            title: req.body.title,
            description: req.body.description
        });
        res.json({ ok: true });
    });

    app.delete("/api/panels/:id", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const panel = await deletePanel(guild, req.params.id);
        res.json({ ok: Boolean(panel) });
    });

    app.post("/api/panels/:id/publish", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const message = await publishPanelForGuild(client, guild.id, req.params.id);
        res.json({ ok: true, messageId: message.id });
    });

    app.post("/api/panels/:id/buttons", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const category = await findOrCreateCategory(guild, req.body.categoryId, req.body.categoryName);
        const buttonId = await addButton(
            guild.id,
            req.params.id,
            req.body.label,
            req.body.style,
            category.id,
            req.body.staffRoleIds || [],
            req.body.closeRoleIds || []
        );
        res.json({ id: buttonId });
    });

    app.put("/api/buttons/:id", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        const category = await findOrCreateCategory(guild, req.body.categoryId, req.body.categoryName);
        await updateButton(guild.id, req.params.id, {
            label: req.body.label,
            style: req.body.style,
            categoryId: category.id,
            staffRoleIds: req.body.staffRoleIds || [],
            closeRoleIds: req.body.closeRoleIds || []
        });
        res.json({ ok: true });
    });

    app.delete("/api/buttons/:id", requireAuth, async (req, res) => {
        const guild = firstGuild(client);
        if (!guild) return res.status(503).json({ error: "Servidor no disponible." });
        await deleteButton(guild.id, req.params.id);
        res.json({ ok: true });
    });

    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(frontendPath, "index.html"));
    });

    app.listen(port, () => {
        console.log(`Web dashboard disponible en http://localhost:${port}`);
    });
}

module.exports = { startWebServer };
