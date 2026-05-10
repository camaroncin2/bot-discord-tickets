const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");
const { initDb, query, transaction } = require("./db");

const BUTTON_STYLES = {
    azul: ButtonStyle.Primary,
    gris: ButtonStyle.Secondary,
    verde: ButtonStyle.Success,
    rojo: ButtonStyle.Danger
};

function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        return JSON.parse(value);
    } catch {
        return [];
    }
}

function buttonCustomId(buttonId) {
    return `ticket_open_${buttonId}`;
}

function claimCustomId(ticketId) {
    return `ticket_claim_${ticketId}`;
}

function closeCustomId(ticketId) {
    return `ticket_close_${ticketId}`;
}

function closeModalCustomId(ticketId) {
    return `ticket_close_modal_${ticketId}`;
}

function buildTicketPanel(panel, buttons) {
    const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description)
        .setColor(0x00a6ff);

    const rows = [];
    let row = new ActionRowBuilder();

    buttons.slice(0, 25).forEach((button, index) => {
        if (index > 0 && index % 5 === 0) {
            rows.push(row);
            row = new ActionRowBuilder();
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(buttonCustomId(button.id))
                .setLabel(button.label)
                .setStyle(BUTTON_STYLES[button.style] || ButtonStyle.Primary)
        );
    });

    if (row.components.length > 0) rows.push(row);
    return { embeds: [embed], components: rows };
}

function buildTicketControls(ticket) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(claimCustomId(ticket.id))
            .setLabel("Atender")
            .setStyle(ButtonStyle.Success)
            .setDisabled(Boolean(ticket.claimed_by)),
        new ButtonBuilder()
            .setCustomId(closeCustomId(ticket.id))
            .setLabel("Cerrar")
            .setStyle(ButtonStyle.Danger)
    );
}

function buildTicketEmbed(ticket, userId) {
    const claimed = ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Sin atender";
    return new EmbedBuilder()
        .setTitle(`Ticket #${ticket.ticket_number}`)
        .setDescription(ticket.reason)
        .addFields(
            { name: "Usuario", value: `<@${userId || ticket.user_id}>`, inline: true },
            { name: "Tipo", value: ticket.type_label, inline: true },
            { name: "Atendido por", value: claimed, inline: true }
        )
        .setColor(0x00a6ff);
}

async function ensureDb() {
    await initDb();
}

async function createPanel(guildId, channelId, title, description, defaultCategoryId = null) {
    await ensureDb();
    const result = await query(
        `INSERT INTO ticket_panels (guild_id, channel_id, default_category_id, title, description)
         VALUES (:guildId, :channelId, :defaultCategoryId, :title, :description)`,
        { guildId, channelId, defaultCategoryId, title, description }
    );
    return result.insertId;
}

async function getPanel(panelId, guildId) {
    await ensureDb();
    const rows = await query(
        "SELECT * FROM ticket_panels WHERE id = :panelId AND guild_id = :guildId LIMIT 1",
        { panelId, guildId }
    );
    return rows[0] || null;
}

async function getLatestPanel(guildId) {
    await ensureDb();
    const rows = await query(
        "SELECT * FROM ticket_panels WHERE guild_id = :guildId ORDER BY id DESC LIMIT 1",
        { guildId }
    );
    return rows[0] || null;
}

async function getPanels(guildId, limit = 25) {
    await ensureDb();
    return query(
        `SELECT *
         FROM ticket_panels
         WHERE guild_id = :guildId
         ORDER BY id DESC
         LIMIT ${Number(limit)}`,
        { guildId }
    );
}

async function getPanelButtons(panelId, guildId) {
    await ensureDb();
    return query(
        "SELECT * FROM ticket_buttons WHERE panel_id = :panelId AND guild_id = :guildId ORDER BY id ASC",
        { panelId, guildId }
    );
}

async function getPanelWithButtons(panelId, guildId) {
    const panel = await getPanel(panelId, guildId);
    if (!panel) return null;

    const buttons = await getPanelButtons(panel.id, guildId);
    return { ...panel, buttons };
}

async function deletePanel(guild, panelId) {
    await ensureDb();
    const panel = await getPanel(panelId, guild.id);
    if (!panel) return null;

    const channel = guild.channels.cache.get(panel.channel_id);
    if (channel && panel.message_id) {
        const message = await channel.messages.fetch(panel.message_id).catch(() => null);
        if (message) {
            await message.delete().catch(console.error);
        }
    }

    await query(
        "DELETE FROM ticket_panels WHERE id = :panelId AND guild_id = :guildId",
        { panelId, guildId: guild.id }
    );

    return panel;
}

async function updatePanel(guildId, panelId, data) {
    await ensureDb();
    await query(
        `UPDATE ticket_panels
         SET channel_id = :channelId,
             default_category_id = :defaultCategoryId,
             title = :title,
             description = :description
         WHERE id = :panelId AND guild_id = :guildId`,
        {
            guildId,
            panelId,
            channelId: data.channelId,
            defaultCategoryId: data.defaultCategoryId || null,
            title: data.title,
            description: data.description
        }
    );
}

async function getButton(buttonId, guildId) {
    await ensureDb();
    const rows = await query(
        `SELECT b.*, p.channel_id AS panel_channel_id, p.message_id AS panel_message_id
         FROM ticket_buttons b
         JOIN ticket_panels p ON p.id = b.panel_id
         WHERE b.id = :buttonId AND b.guild_id = :guildId
         LIMIT 1`,
        { buttonId, guildId }
    );
    return rows[0] || null;
}

async function updateButton(guildId, buttonId, data) {
    await ensureDb();
    await query(
        `UPDATE ticket_buttons
         SET label = :label,
             style = :style,
             category_id = :categoryId,
             staff_role_ids = :staffRoleIds,
             close_role_ids = :closeRoleIds
         WHERE id = :buttonId AND guild_id = :guildId`,
        {
            guildId,
            buttonId,
            label: data.label,
            style: data.style,
            categoryId: data.categoryId,
            staffRoleIds: JSON.stringify(data.staffRoleIds || []),
            closeRoleIds: JSON.stringify(data.closeRoleIds || [])
        }
    );
}

async function deleteButton(guildId, buttonId) {
    await ensureDb();
    await query(
        "DELETE FROM ticket_buttons WHERE id = :buttonId AND guild_id = :guildId",
        { buttonId, guildId }
    );
}

async function addButton(guildId, panelId, label, style, categoryId, staffRoleIds, closeRoleIds) {
    await ensureDb();
    const result = await query(
        `INSERT INTO ticket_buttons
            (panel_id, guild_id, label, style, category_id, staff_role_ids, close_role_ids)
         VALUES
            (:panelId, :guildId, :label, :style, :categoryId, :staffRoleIds, :closeRoleIds)`,
        {
            panelId,
            guildId,
            label,
            style,
            categoryId,
            staffRoleIds: JSON.stringify(staffRoleIds),
            closeRoleIds: JSON.stringify(closeRoleIds)
        }
    );
    return result.insertId;
}

async function publishPanel(interaction, panelId) {
    const panel = await getPanel(panelId, interaction.guild.id);
    if (!panel) throw new Error("Panel no encontrado.");

    const buttons = await getPanelButtons(panel.id, interaction.guild.id);
    if (buttons.length === 0) throw new Error("El panel no tiene botones configurados.");

    const channel = interaction.guild.channels.cache.get(panel.channel_id);
    if (!channel) throw new Error("El canal configurado para el panel no existe.");

    const payload = buildTicketPanel(panel, buttons);
    let message = null;
    if (panel.message_id) {
        message = await channel.messages.fetch(panel.message_id).catch(() => null);
    }

    if (message) {
        await message.edit(payload);
    } else {
        message = await channel.send(payload);
    }

    await query(
        "UPDATE ticket_panels SET message_id = :messageId WHERE id = :panelId AND guild_id = :guildId",
        { messageId: message.id, panelId: panel.id, guildId: interaction.guild.id }
    );

    return message;
}

async function publishPanelForGuild(client, guildId, panelId) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error("Servidor no encontrado.");

    const panel = await getPanel(panelId, guildId);
    if (!panel) throw new Error("Panel no encontrado.");

    const buttons = await getPanelButtons(panel.id, guildId);
    if (buttons.length === 0) throw new Error("El panel no tiene botones configurados.");

    const channel = guild.channels.cache.get(panel.channel_id) || await guild.channels.fetch(panel.channel_id).catch(() => null);
    if (!channel) throw new Error("El canal configurado para el panel no existe.");

    const payload = buildTicketPanel(panel, buttons);
    let message = null;
    if (panel.message_id) {
        message = await channel.messages.fetch(panel.message_id).catch(() => null);
    }

    if (message) {
        await message.edit(payload);
    } else {
        message = await channel.send(payload);
    }

    await query(
        "UPDATE ticket_panels SET message_id = :messageId WHERE id = :panelId AND guild_id = :guildId",
        { messageId: message.id, panelId: panel.id, guildId }
    );

    return message;
}

async function getTicketEvents(ticketId, guildId) {
    await ensureDb();
    return query(
        `SELECT *
         FROM ticket_events
         WHERE ticket_id = :ticketId AND guild_id = :guildId
         ORDER BY created_at ASC`,
        { ticketId, guildId }
    );
}

async function searchTickets(guildId, filters = {}) {
    await ensureDb();
    const where = ["guild_id = :guildId"];
    const params = { guildId };

    if (filters.status && ["open", "closed"].includes(filters.status)) {
        where.push("status = :status");
        params.status = filters.status;
    }
    if (filters.type) {
        where.push("type_label LIKE :type");
        params.type = `%${filters.type}%`;
    }
    if (filters.userId) {
        where.push("user_id = :userId");
        params.userId = filters.userId;
    }
    if (filters.number) {
        where.push("ticket_number = :number");
        params.number = Number(filters.number);
    }
    if (filters.from) {
        where.push("opened_at >= :from");
        params.from = filters.from;
    }
    if (filters.to) {
        where.push("opened_at <= :to");
        params.to = filters.to;
    }

    return query(
        `SELECT *
         FROM tickets
         WHERE ${where.join(" AND ")}
         ORDER BY opened_at DESC
         LIMIT 100`,
        params
    );
}

async function ticketStats(guildId) {
    await ensureDb();
    const rows = await query(
        `SELECT
            SUM(status = 'open') AS open_count,
            SUM(status = 'closed') AS closed_count,
            COUNT(*) AS total_count
         FROM tickets
         WHERE guild_id = :guildId`,
        { guildId }
    );
    return rows[0] || { open_count: 0, closed_count: 0, total_count: 0 };
}

async function nextTicketNumber(guildId, connection) {
    await connection.execute(
        `INSERT INTO ticket_counters (guild_id, last_number)
         VALUES (:guildId, 0)
         ON DUPLICATE KEY UPDATE last_number = last_number`,
        { guildId }
    );
    await connection.execute(
        "UPDATE ticket_counters SET last_number = LAST_INSERT_ID(last_number + 1) WHERE guild_id = :guildId",
        { guildId }
    );
    const [rows] = await connection.execute("SELECT LAST_INSERT_ID() AS ticket_number");
    return rows[0].ticket_number;
}

function canUseRoles(member, roleIds) {
    return roleIds.some(roleId => member.roles.cache.has(roleId));
}

function canManageTicket(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator)
        || member.permissions.has(PermissionFlagsBits.ManageChannels);
}

function canClaimTicket(member, button) {
    const staffRoleIds = parseJsonArray(button.staff_role_ids);
    const closeRoleIds = parseJsonArray(button.close_role_ids);
    return canManageTicket(member) || canUseRoles(member, [...staffRoleIds, ...closeRoleIds]);
}

function canCloseTicket(member, button) {
    const closeRoleIds = parseJsonArray(button.close_role_ids);
    return canManageTicket(member) || canUseRoles(member, closeRoleIds);
}

function buildTicketPermissionOverwrites(guild, userId, button) {
    const staffRoleIds = parseJsonArray(button.staff_role_ids);
    const closeRoleIds = parseJsonArray(button.close_role_ids);
    const roleIds = [...new Set([...staffRoleIds, ...closeRoleIds])];

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: userId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        }
    ];

    for (const roleId of roleIds) {
        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        });
    }

    return overwrites;
}

async function createTicket(interaction, buttonId, reason, targetUser = null) {
    await ensureDb();
    const button = await getButton(buttonId, interaction.guild.id);
    if (!button) throw new Error("El boton de ticket no existe.");

    const opener = targetUser || interaction.user;
    const duplicate = await query(
        `SELECT id, ticket_number, channel_id
         FROM tickets
         WHERE guild_id = :guildId
           AND user_id = :userId
           AND button_id = :buttonId
           AND status = 'open'
         LIMIT 1`,
        { guildId: interaction.guild.id, userId: opener.id, buttonId }
    );
    if (duplicate[0]) {
        return { duplicate: duplicate[0] };
    }

    const ticketNumber = await transaction(async connection => nextTicketNumber(interaction.guild.id, connection));
    const channel = await interaction.guild.channels.create({
        name: `ticket-${ticketNumber}`,
        type: ChannelType.GuildText,
        parent: button.category_id,
        permissionOverwrites: buildTicketPermissionOverwrites(interaction.guild, opener.id, button),
        reason: `Ticket ${ticketNumber} creado por ${interaction.user.tag}`
    });

    const result = await query(
        `INSERT INTO tickets
            (guild_id, ticket_number, button_id, panel_id, type_label, channel_id, user_id, reason)
         VALUES
            (:guildId, :ticketNumber, :buttonId, :panelId, :typeLabel, :channelId, :userId, :reason)`,
        {
            guildId: interaction.guild.id,
            ticketNumber,
            buttonId,
            panelId: button.panel_id,
            typeLabel: button.label,
            channelId: channel.id,
            userId: opener.id,
            reason
        }
    );

    const ticket = {
        id: result.insertId,
        guild_id: interaction.guild.id,
        ticket_number: ticketNumber,
        button_id: buttonId,
        panel_id: button.panel_id,
        type_label: button.label,
        channel_id: channel.id,
        user_id: opener.id,
        reason,
        claimed_by: null
    };

    await addEvent(ticket.id, interaction.guild.id, "created", interaction.user.id, {
        channelId: channel.id,
        userId: opener.id,
        buttonId
    });

    await channel.send({
        content: `<@${opener.id}>`,
        embeds: [buildTicketEmbed(ticket, opener.id)],
        components: [buildTicketControls(ticket)]
    });

    return { ticket, channel };
}

async function addEvent(ticketId, guildId, eventType, actorId, details = {}) {
    await ensureDb();
    await query(
        `INSERT INTO ticket_events (ticket_id, guild_id, event_type, actor_id, details)
         VALUES (:ticketId, :guildId, :eventType, :actorId, :details)`,
        {
            ticketId,
            guildId,
            eventType,
            actorId,
            details: JSON.stringify(details)
        }
    );
}

async function getTicketById(ticketId, guildId) {
    await ensureDb();
    const rows = await query(
        `SELECT t.*, b.staff_role_ids, b.close_role_ids
         FROM tickets t
         LEFT JOIN ticket_buttons b ON b.id = t.button_id
         WHERE t.id = :ticketId AND t.guild_id = :guildId
         LIMIT 1`,
        { ticketId, guildId }
    );
    return rows[0] || null;
}

async function getTicketByChannel(channelId, guildId) {
    await ensureDb();
    const rows = await query(
        `SELECT t.*, b.staff_role_ids, b.close_role_ids
         FROM tickets t
         LEFT JOIN ticket_buttons b ON b.id = t.button_id
         WHERE t.channel_id = :channelId AND t.guild_id = :guildId AND t.status = 'open'
         LIMIT 1`,
        { channelId, guildId }
    );
    return rows[0] || null;
}

async function claimTicket(interaction, ticketId) {
    const ticket = await getTicketById(ticketId, interaction.guild.id);
    if (!ticket || ticket.status !== "open") throw new Error("Ticket abierto no encontrado.");
    if (!canClaimTicket(interaction.member, ticket)) {
        return { denied: true };
    }
    if (ticket.claimed_by) {
        return { alreadyClaimed: ticket };
    }

    const result = await query(
        `UPDATE tickets
         SET claimed_by = :staffId, claimed_at = CURRENT_TIMESTAMP
         WHERE id = :ticketId
           AND guild_id = :guildId
           AND claimed_by IS NULL
           AND status = 'open'`,
        { staffId: interaction.user.id, ticketId, guildId: interaction.guild.id }
    );
    if (result.affectedRows === 0) {
        const current = await getTicketById(ticketId, interaction.guild.id);
        return { alreadyClaimed: current };
    }

    await addEvent(ticket.id, interaction.guild.id, "claimed", interaction.user.id, { staffId: interaction.user.id });

    return {
        ticket: {
            ...ticket,
            claimed_by: interaction.user.id
        }
    };
}

async function closeTicket(interaction, ticketId, closeReason) {
    const ticket = await getTicketById(ticketId, interaction.guild.id);
    if (!ticket || ticket.status !== "open") throw new Error("Ticket abierto no encontrado.");
    if (!canCloseTicket(interaction.member, ticket)) {
        return { denied: true };
    }

    const result = await query(
        `UPDATE tickets
         SET status = 'closed',
             close_reason = :closeReason,
             closed_by = :closedBy,
             closed_at = CURRENT_TIMESTAMP
         WHERE id = :ticketId AND guild_id = :guildId AND status = 'open'`,
        {
            closeReason,
            closedBy: interaction.user.id,
            ticketId,
            guildId: interaction.guild.id
        }
    );
    if (result.affectedRows === 0) {
        throw new Error("Ticket abierto no encontrado.");
    }

    await addEvent(ticket.id, interaction.guild.id, "closed", interaction.user.id, { closeReason });

    return { ticket };
}

async function listTickets(guildId, status, limit = 10) {
    await ensureDb();
    return query(
        `SELECT *
         FROM tickets
         WHERE guild_id = :guildId AND status = :status
         ORDER BY ${status === "open" ? "opened_at" : "closed_at"} DESC
         LIMIT ${Number(limit)}`,
        { guildId, status }
    );
}

async function addTicketAccess(interaction, target) {
    const ticket = await getTicketByChannel(interaction.channel.id, interaction.guild.id);
    if (!ticket) return { noTicket: true };
    if (!canClaimTicket(interaction.member, ticket)) return { denied: true };

    await interaction.channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    });
    await addEvent(ticket.id, interaction.guild.id, "access_added", interaction.user.id, { targetId: target.id });
    return { ticket };
}

async function removeTicketAccess(interaction, target) {
    const ticket = await getTicketByChannel(interaction.channel.id, interaction.guild.id);
    if (!ticket) return { noTicket: true };
    if (!canClaimTicket(interaction.member, ticket)) return { denied: true };

    await interaction.channel.permissionOverwrites.delete(target.id);
    await addEvent(ticket.id, interaction.guild.id, "access_removed", interaction.user.id, { targetId: target.id });
    return { ticket };
}

module.exports = {
    addButton,
    addTicketAccess,
    buildTicketControls,
    buildTicketEmbed,
    buttonCustomId,
    canClaimTicket,
    canCloseTicket,
    claimCustomId,
    claimTicket,
    closeCustomId,
    closeModalCustomId,
    closeTicket,
    createPanel,
    createTicket,
    deleteButton,
    deletePanel,
    getButton,
    getLatestPanel,
    getPanel,
    getPanelButtons,
    getPanelWithButtons,
    getPanels,
    getTicketEvents,
    getTicketByChannel,
    getTicketById,
    listTickets,
    parseJsonArray,
    publishPanel,
    publishPanelForGuild,
    removeTicketAccess,
    searchTickets,
    ticketStats,
    updateButton,
    updatePanel
};
