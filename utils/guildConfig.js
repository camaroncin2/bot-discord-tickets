const fs = require("fs");
const path = require("path");

const cfgPath = path.join(__dirname, "..", "guild-config.json");

function readGuildConfig() {
    try {
        return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("No se pudo leer guild-config.json:", error);
        }
        return {};
    }
}

function writeGuildConfig(config) {
    fs.writeFileSync(cfgPath, `${JSON.stringify(config, null, 4)}\n`);
}

function getGuildConfig(guildId) {
    return readGuildConfig()[guildId] || {};
}

function ensureGuildConfig(config, guildId) {
    config[guildId] = config[guildId] || {};
    return config[guildId];
}

function hasConfigAccess(interaction, permission) {
    if (!interaction.guild || !interaction.member) return false;

    const cfg = getGuildConfig(interaction.guild.id);
    const roles = cfg.configRoles || [];
    const hasRole = roles.length > 0 && interaction.member.roles.cache.some(role => roles.includes(role.id));
    const hasPerm = permission ? interaction.memberPermissions?.has(permission) : false;

    return hasRole || hasPerm;
}

module.exports = {
    cfgPath,
    readGuildConfig,
    writeGuildConfig,
    getGuildConfig,
    ensureGuildConfig,
    hasConfigAccess
};
