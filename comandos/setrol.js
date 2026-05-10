const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { readGuildConfig, writeGuildConfig, ensureGuildConfig, hasConfigAccess } = require("../utils/guildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setrol")
        .setDescription("Configurar el rol aprobado para solicitudes")
        .setDMPermission(false)
        .addRoleOption(opt => opt
            .setName("aprobado")
            .setDescription("Rol que se asignara al aprobar")
            .setRequired(true)
        ),

    async execute(interaction) {
        if (!hasConfigAccess(interaction, PermissionsBitField.Flags.ManageRoles)) {
            await interaction.reply({ content: "No tienes permisos para configurar roles.", ephemeral: true });
            return;
        }

        const role = interaction.options.getRole("aprobado");
        const cfgAll = readGuildConfig();
        const guildCfg = ensureGuildConfig(cfgAll, interaction.guild.id);
        guildCfg.approvedRole = role.id;
        writeGuildConfig(cfgAll);

        await interaction.reply({ content: `Rol aprobado configurado: <@&${role.id}>`, ephemeral: true });
    }
};
