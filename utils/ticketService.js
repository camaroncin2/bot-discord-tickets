const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");
const { collection, initDb, nextSequence } = require("./db");

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

function numericId(value) {
    const id = Number(value);
    return Number.isFinite(id) ? id : value;
}

function cleanDoc(doc) {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
}

function cleanDocs(docs) {
    return docs.map(cleanDoc);
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const id = await nextSequence("ticket_panels");
    const now = new Date();
    await collection("ticket_panels").insertOne({
        id,
        guild_id: guildId,
        channel_id: channelId,
        message_id: null,
        default_category_id: defaultCategoryId || null,
        title,
        description,
        created_at: now,
        updated_at: now
    });
    return id;
}

async function getPanel(panelId, guildId) {
    await ensureDb();
    return cleanDoc(await collection("ticket_panels").findOne({ id: numericId(panelId), guild_id: guildId }));
}

async function getLatestPanel(guildId) {
    await ensureDb();
    return cleanDoc(await collection("ticket_panels").find({ guild_id: guildId }).sort({ id: -1 }).limit(1).next());
}

async function getPanels(guildId, limit = 25) {
    await ensureDb();
    return cleanDocs(await collection("ticket_panels")
        .find({ guild_id: guildId })
        .sort({ id: -1 })
        .limit(Number(limit))
        .toArray());
}

async function getPanelButtons(panelId, guildId) {
    await ensureDb();
    return cleanDocs(await collection("ticket_buttons")
        .find({ panel_id: numericId(panelId), guild_id: guildId })
        .sort({ id: 1 })
        .toArray());
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

    await collection("ticket_panels").deleteOne({ id: panel.id, guild_id: guild.id });
    await collection("ticket_buttons").deleteMany({ panel_id: panel.id, guild_id: guild.id });

    return panel;
}

async function updatePanel(guildId, panelId, data) {
    await ensureDb();
    await collection("ticket_panels").updateOne(
        { id: numericId(panelId), guild_id: guildId },
        {
            $set: {
                channel_id: data.channelId,
                default_category_id: data.defaultCategoryId || null,
                title: data.title,
                description: data.description,
                updated_at: new Date()
            }
        }
    );
}

async function getButton(buttonId, guildId) {
    await ensureDb();
    const button = cleanDoc(await collection("ticket_buttons").findOne({ id: numericId(buttonId), guild_id: guildId }));
    if (!button) return null;

    const panel = await getPanel(button.panel_id, guildId);
    if (!panel) return null;

    return {
        ...button,
        panel_channel_id: panel.channel_id,
        panel_message_id: panel.message_id
    };
}

async function updateButton(guildId, buttonId, data) {
    await ensureDb();
    await collection("ticket_buttons").updateOne(
        { id: numericId(buttonId), guild_id: guildId },
        {
            $set: {
                label: data.label,
                style: data.style,
                category_id: data.categoryId,
                staff_role_ids: data.staffRoleIds || [],
                close_role_ids: data.closeRoleIds || [],
                updated_at: new Date()
            }
        }
    );
}

async function deleteButton(guildId, buttonId) {
    await ensureDb();
    await collection("ticket_buttons").deleteOne({ id: numericId(buttonId), guild_id: guildId });
}

async function addButton(guildId, panelId, label, style, categoryId, staffRoleIds, closeRoleIds) {
    await ensureDb();
    const id = await nextSequence("ticket_buttons");
    const now = new Date();
    await collection("ticket_buttons").insertOne({
        id,
        panel_id: numericId(panelId),
        guild_id: guildId,
        label,
        style,
        category_id: categoryId,
        staff_role_ids: staffRoleIds || [],
        close_role_ids: closeRoleIds || [],
        created_at: now,
        updated_at: now
    });
    return id;
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

    await collection("ticket_panels").updateOne(
        { id: panel.id, guild_id: interaction.guild.id },
        { $set: { message_id: message.id, updated_at: new Date() } }
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

    await collection("ticket_panels").updateOne(
        { id: panel.id, guild_id: guildId },
        { $set: { message_id: message.id, updated_at: new Date() } }
    );

    return message;
}

async function getTicketEvents(ticketId, guildId) {
    await ensureDb();
    return cleanDocs(await collection("ticket_events")
        .find({ ticket_id: numericId(ticketId), guild_id: guildId })
        .sort({ created_at: 1 })
        .toArray());
}

async function searchTickets(guildId, filters = {}) {
    await ensureDb();
    const where = { guild_id: guildId };

    if (filters.status && ["open", "closed"].includes(filters.status)) {
        where.status = filters.status;
    }
    if (filters.type) {
        where.type_label = { $regex: escapeRegex(filters.type), $options: "i" };
    }
    if (filters.userId) {
        where.user_id = filters.userId;
    }
    if (filters.number) {
        const number = Number(filters.number);
        if (Number.isFinite(number)) where.ticket_number = number;
    }
    if (filters.from || filters.to) {
        where.opened_at = {};
        if (filters.from) where.opened_at.$gte = new Date(filters.from);
        if (filters.to) {
            const toDate = new Date(filters.to);
            toDate.setHours(23, 59, 59, 999);
            where.opened_at.$lte = toDate;
        }
    }

    return cleanDocs(await collection("tickets")
        .find(where)
        .sort({ opened_at: -1 })
        .limit(100)
        .toArray());
}

async function ticketStats(guildId) {
    await ensureDb();
    const tickets = collection("tickets");
    const [openCount, closedCount, totalCount] = await Promise.all([
        tickets.countDocuments({ guild_id: guildId, status: "open" }),
        tickets.countDocuments({ guild_id: guildId, status: "closed" }),
        tickets.countDocuments({ guild_id: guildId })
    ]);

    return {
        open_count: openCount,
        closed_count: closedCount,
        total_count: totalCount
    };
}

async function nextTicketNumber(guildId) {
    return nextSequence(`ticket_number:${guildId}`);
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
    const normalizedButtonId = numericId(buttonId);
    const button = await getButton(normalizedButtonId, interaction.guild.id);
    if (!button) throw new Error("El boton de ticket no existe.");

    const opener = targetUser || interaction.user;
    const duplicate = cleanDoc(await collection("tickets").findOne(
        {
            guild_id: interaction.guild.id,
            user_id: opener.id,
            button_id: normalizedButtonId,
            status: "open"
        },
        { projection: { id: 1, ticket_number: 1, channel_id: 1 } }
    ));
    if (duplicate) {
        return { duplicate };
    }

    const ticketNumber = await nextTicketNumber(interaction.guild.id);
    const channel = await interaction.guild.channels.create({
        name: `ticket-${ticketNumber}`,
        type: ChannelType.GuildText,
        parent: button.category_id,
        permissionOverwrites: buildTicketPermissionOverwrites(interaction.guild, opener.id, button),
        reason: `Ticket ${ticketNumber} creado por ${interaction.user.tag}`
    });

    const id = await nextSequence("tickets");
    const now = new Date();
    const ticket = {
        id,
        guild_id: interaction.guild.id,
        ticket_number: ticketNumber,
        button_id: normalizedButtonId,
        panel_id: button.panel_id,
        type_label: button.label,
        channel_id: channel.id,
        user_id: opener.id,
        claimed_by: null,
        status: "open",
        reason,
        close_reason: null,
        closed_by: null,
        opened_at: now,
        claimed_at: null,
        closed_at: null
    };

    await collection("tickets").insertOne(ticket);

    await addEvent(ticket.id, interaction.guild.id, "created", interaction.user.id, {
        channelId: channel.id,
        userId: opener.id,
        buttonId: normalizedButtonId
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
    await collection("ticket_events").insertOne({
        id: await nextSequence("ticket_events"),
        ticket_id: numericId(ticketId),
        guild_id: guildId,
        event_type: eventType,
        actor_id: actorId,
        details,
        created_at: new Date()
    });
}

async function getTicketById(ticketId, guildId) {
    await ensureDb();
    const ticket = cleanDoc(await collection("tickets").findOne({ id: numericId(ticketId), guild_id: guildId }));
    if (!ticket) return null;

    const button = ticket.button_id
        ? cleanDoc(await collection("ticket_buttons").findOne({ id: ticket.button_id, guild_id: guildId }))
        : null;

    return {
        ...ticket,
        staff_role_ids: button?.staff_role_ids || [],
        close_role_ids: button?.close_role_ids || []
    };
}

async function getTicketByChannel(channelId, guildId) {
    await ensureDb();
    const ticket = cleanDoc(await collection("tickets").findOne({
        channel_id: channelId,
        guild_id: guildId,
        status: "open"
    }));
    if (!ticket) return null;

    const button = ticket.button_id
        ? cleanDoc(await collection("ticket_buttons").findOne({ id: ticket.button_id, guild_id: guildId }))
        : null;

    return {
        ...ticket,
        staff_role_ids: button?.staff_role_ids || [],
        close_role_ids: button?.close_role_ids || []
    };
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

    const result = await collection("tickets").updateOne(
        {
            id: ticket.id,
            guild_id: interaction.guild.id,
            claimed_by: null,
            status: "open"
        },
        {
            $set: {
                claimed_by: interaction.user.id,
                claimed_at: new Date()
            }
        }
    );
    if (result.modifiedCount === 0) {
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

    const result = await collection("tickets").updateOne(
        { id: ticket.id, guild_id: interaction.guild.id, status: "open" },
        {
            $set: {
                status: "closed",
                close_reason: closeReason,
                closed_by: interaction.user.id,
                closed_at: new Date()
            }
        }
    );
    if (result.modifiedCount === 0) {
        throw new Error("Ticket abierto no encontrado.");
    }

    await addEvent(ticket.id, interaction.guild.id, "closed", interaction.user.id, { closeReason });

    return { ticket };
}

async function listTickets(guildId, status, limit = 10) {
    await ensureDb();
    const sortField = status === "open" ? "opened_at" : "closed_at";
    return cleanDocs(await collection("tickets")
        .find({ guild_id: guildId, status })
        .sort({ [sortField]: -1 })
        .limit(Number(limit))
        .toArray());
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
