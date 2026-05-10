const { SlashCommandBuilder } = require("discord.js");
const { sendTicketSetupHome, showDeletePanelSelect } = require("../utils/ticketSetupUi");

module.exports = {
    skipGlobalPermission: true,
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Configurar tickets")
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName("asistente")
            .setDescription("Abrir asistente visual para configurar tickets")
        )
        .addSubcommand(sub => sub
            .setName("borrar")
            .setDescription("Borrar un panel de tickets creado")
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === "asistente") {
            await sendTicketSetupHome(interaction);
            return;
        }

        if (sub === "borrar") {
            await showDeletePanelSelect(interaction);
        }
    }
};
