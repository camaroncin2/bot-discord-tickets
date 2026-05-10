const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("solicitud")
        .setDescription("Enviar un formulario al staff")
        .setDMPermission(false),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId("form_solicitud")
            .setTitle("Solicitud al Staff");

        const question = new TextInputBuilder()
            .setCustomId("respuesta1")
            .setLabel("Por que quieres entrar?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(question);
        modal.addComponents(row);

        await interaction.showModal(modal);
    }
};
