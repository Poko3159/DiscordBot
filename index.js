const express = require("express");
const { DateTime } = require("luxon");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
const globalChannelId = process.env.GLOBAL_CHANNEL_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const rpsChoices = ["rock", "paper", "scissors"];

async function getClanMembers(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const clanData = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return clanData.data.memberList || [];
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching clan members. Check the clan tag or API status." };
    }
}

client.once("ready", async () => {
    console.log(`â Logged in as ${client.user?.tag}!`);
    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("clanmembers").setDescription("List clan members with pagination.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("â Slash commands registered.");
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith("clanMembers:")) {
            const [_, tag, pageStr] = interaction.customId.split(":");
            const page = parseInt(pageStr, 10);
            const members = client.clanMembersCache?.[tag];
            const totalPages = Math.ceil(members.length / 10);
            const start = (page - 1) * 10;
            const pageMembers = members.slice(start, start + 10);

            const description = pageMembers.length > 0
                ? pageMembers.map((m, i) =>
                    `${start + i + 1}. **${m.name}** - ${m.role} - TH${m.townHallLevel} - Trophies: ${m.trophies}`
                ).join("\n")
                : "No members found on this page.";

            const embed = new EmbedBuilder()
                .setTitle(`Clan Members - Page ${page}/${totalPages}`)
                .setColor(0x0099ff)
                .setDescription(description);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`clanMembers:${tag}:${page - 1}`)
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId(`clanMembers:${tag}:${page + 1}`)
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages),
            );

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "clanmembers") {
        const tag = interaction.options.getString("tag");
        const members = await getClanMembers(tag);
        if (members.error) return await interaction.reply({ content: members.error, ephemeral: true });

        client.clanMembersCache = client.clanMembersCache || {};
        client.clanMembersCache[tag] = members;

        const page = 1;
        const start = 0;
        const pageMembers = members.slice(start, start + 10);
        const totalPages = Math.ceil(members.length / 10);

        const description = pageMembers.length > 0
            ? pageMembers.map((m, i) =>
                `${start + i + 1}. **${m.name}** - ${m.role} - TH${m.townHallLevel} - Trophies: ${m.trophies}`
            ).join("\n")
            : "No members found on this page.";

        const embed = new EmbedBuilder()
            .setTitle(`Clan Members - Page ${page}/${totalPages}`)
            .setColor(0x0099ff)
            .setDescription(description);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`clanMembers:${tag}:${page + 1}`)
                .setLabel("Next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(totalPages <= 1)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

client.login(process.env.DISCORD_TOKEN);