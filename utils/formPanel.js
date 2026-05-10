const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function buildFormPanel(guild, cfg = {}) {
    const title = cfg.formTitle || "Formulario de Solicitud";
    const description = cfg.formDescription || "Completa tu solicitud para el staff.";
    const instructions = cfg.formInstructions || "Pulsa el boton y completa el formulario con tus datos.";
    const notes = cfg.formNotes || "Se claro y respetuoso. Informacion incompleta puede demorar la revision.";
    const responseTime = cfg.formResponseTime || "24-48 horas habiles.";
    const image = cfg.formImageUrl || guild.iconURL();

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: "Instrucciones", value: instructions, inline: false },
            { name: "Notas", value: notes, inline: false },
            { name: "Tiempo de respuesta", value: responseTime, inline: false }
        )
        .setColor(0x00a6ff);

    if (image) embed.setImage(image);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("open_form")
            .setLabel("Abrir Formulario")
            .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

function hasOpenFormButton(message) {
    return message.components?.some(row =>
        row.components?.some(component => component.customId === "open_form")
    );
}

async function upsertFormPanel(channel, clientUserId, cfg = {}) {
    const panel = buildFormPanel(channel.guild, cfg);
    const messages = await channel.messages.fetch({ limit: 50 }).catch(error => {
        console.error(`No se pudieron buscar mensajes en ${channel.id}:`, error);
        return null;
    });
    const existing = messages?.find(message =>
        message.author.id === clientUserId && hasOpenFormButton(message)
    );

    if (existing) {
        await existing.edit(panel);
        return existing;
    }

    return channel.send(panel);
}

module.exports = {
    buildFormPanel,
    hasOpenFormButton,
    upsertFormPanel
};
