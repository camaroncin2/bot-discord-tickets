const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { readGuildConfig, writeGuildConfig, ensureGuildConfig, hasConfigAccess } = require("../utils/guildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("configperms")
        .setDescription("Gestionar roles permitidos para configurar el bot")
        .setDMPermission(false)
        .addSubcommand(sc => sc
            .setName("add")
            .setDescription("Agregar un rol permitido")
            .addRoleOption(opt => opt.setName("rol").setDescription("Rol a agregar").setRequired(true))
        )
        .addSubcommand(sc => sc
            .setName("remove")
            .setDescription("Eliminar un rol permitido")
            .addRoleOption(opt => opt.setName("rol").setDescription("Rol a eliminar").setRequired(true))
        )
        .addSubcommand(sc => sc
            .setName("list")
            .setDescription("Listar roles permitidos")
        ),

    async execute(interaction) {
        if (!hasConfigAccess(interaction, PermissionsBitField.Flags.ManageGuild)) {
            await interaction.reply({ content: "No tienes permisos para gestionar roles permitidos.", ephemeral: true });
            return;
        }

        const cfgAll = readGuildConfig();
        const guildCfg = ensureGuildConfig(cfgAll, interaction.guild.id);
        guildCfg.configRoles = guildCfg.configRoles || [];

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "add") {
            const role = interaction.options.getRole("rol");
            if (!guildCfg.configRoles.includes(role.id)) {
                guildCfg.configRoles.push(role.id);
                writeGuildConfig(cfgAll);
            }
            await interaction.reply({ content: `Rol agregado: <@&${role.id}>`, ephemeral: true });
            return;
        }

        if (subcommand === "remove") {
            const role = interaction.options.getRole("rol");
            guildCfg.configRoles = guildCfg.configRoles.filter(id => id !== role.id);
            writeGuildConfig(cfgAll);
            await interaction.reply({ content: `Rol eliminado: <@&${role.id}>`, ephemeral: true });
            return;
        }

        const list = guildCfg.configRoles.map(id => `<@&${id}>`).join(", ") || "sin roles";
        await interaction.reply({ content: `Roles permitidos: ${list}`, ephemeral: true });
    }
};
