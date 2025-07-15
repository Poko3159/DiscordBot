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
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const ExcelJS = require("exceljs");

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

// === Slash Command Definitions ===
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Show this help message"),
  new SlashCommandBuilder()
    .setName("members")
    .setDescription("Get clan members")
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Clan tag")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive"),
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("Get info about a player")
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Player tag")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("clan")
    .setDescription("Get info about a clan")
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Clan tag")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans"),
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask a question to OpenAI")
    .addStringOption(option =>
      option.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Roast a user")
    .addStringOption(option =>
      option.setName("target")
        .setDescription("User to roast")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock Paper Scissors")
    .addStringOption(option =>
      option.setName("choice")
        .setDescription("rock, paper, or scissors")
        .setRequired(true)
        .addChoices(
          { name: "rock", value: "rock" },
          { name: "paper", value: "paper" },
          { name: "scissors", value: "scissors" }
        )
    ),
  new SlashCommandBuilder()
    .setName("poster")
    .setDescription("Get current war data for a clan")
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Clan tag")
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message (admin only)"),
  new SlashCommandBuilder().setName("clans").setDescription("Info on how to apply for Lost Family clans (admin only)"),
];

// Register commands with Discord REST API
(async () => {
    try {
        console.log("Started refreshing application (/) commands.");
        const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands.map(command => command.toJSON()) }
        );
        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
    }
})();

// === COC Helper Functions ===
async function getPlayerInfo(playerTag) {
    try {
        const sanitizedTag = playerTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching player data. Check the tag or API status." };
    }
}

async function getClanInfo(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching clan data. Check the tag or API status." };
    }
}

async function getClanMembers(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data.members;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return null;
    }
}

function paginateMembers(members, pageSize, pageIndex) {
    const start = pageIndex * pageSize;
    return members.slice(start, start + pageSize);
}

async function generateExcel(clanName, members) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${clanName} Members`);
    worksheet.columns = [
        { header: "Name", key: "name" },
        { header: "Tag", key: "tag" },
        { header: "Role", key: "role" },
        { header: "Level", key: "expLevel" },
        { header: "Trophies", key: "trophies" },
        { header: "Donations", key: "donations" },
        { header: "Received", key: "donationsReceived" },
    ];

    members.forEach(member => worksheet.addRow(member));
    const buffer = await workbook.xlsx.writeBuffer();
    return new AttachmentBuilder(buffer, { name: `${clanName}_members.xlsx` });
}

// === Interaction Handler ===
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
        await interaction.deferReply();

        switch (commandName) {
            case "help": {
                const helpText = `
**Available Commands:**
/help - Show this help message
/members [tag] - List clan members with pagination and Excel export
/ping - Check if the bot is alive
/player [tag] - Get info about a player
/clan [tag] - Get info about a clan
/leaderboard - Get top 5 global clans
/ask [question] - Ask a question to OpenAI
/roast [target] - Roast a user
/rps [choice] - Play Rock Paper Scissors
/poster [tag] - Get current war data for a clan
/remind - Send a reminder message (admin only)
/clans - Info on how to apply for Lost Family clans (admin only)
`;
                return await interaction.editReply(helpText);
            }

            case "ping":
                return await interaction.editReply("🏓 Pong!");

            case "player": {
                const tag = options.getString("tag");
                const data = await getPlayerInfo(tag);
                if (data.error) return interaction.editReply(`❌ ${data.error}`);
                return await interaction.editReply(
                    `🏆 **Player Name:** ${data.name}\n🏰 **Town Hall:** ${data.townHallLevel}\n⭐ **Trophies:** ${data.trophies}\n⚔️ **War Stars:** ${data.warStars}\n🎖️ **Clan:** ${data.clan?.name || "No Clan"}\n🛠️ **XP:** ${data.expLevel}`
                );
            }

            case "clan": {
                const tag = options.getString("tag");
                const data = await getClanInfo(tag);
                if (data.error) return interaction.editReply(`❌ ${data.error}`);
                return await interaction.editReply(
                    `🏰 **Clan Name:** ${data.name}\n🏆 **Level:** ${data.clanLevel}\n🎖️ **Points:** ${data.clanPoints}\n🔥 **Streak:** ${data.warWinStreak}\n⚔️ **Wins:** ${data.warWins}`
                );
            }

            case "leaderboard": {
                const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
                    headers: { Authorization: `Bearer ${COC_API_KEY}` },
                });
                const topClans = response.data.items.slice(0, 5);
                return await interaction.editReply(
                    `🏆 **Top Clans:**\n${topClans.map((clan, i) => `${i + 1}. **${clan.name}** - ${clan.clanPoints} pts`).join("\n")}`
                );
            }

            case "ask": {
                const question = options.getString("question");
                const res = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{ role: "user", content: question }],
                });
                return await interaction.editReply(res.choices[0].message.content);
            }

            case "roast": {
                const target = options.getString("target") || interaction.user.username;
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                        { role: "user", content: `Roast ${target} in a funny but lighthearted way.` },
                    ],
                });
                return await interaction.editReply(response.choices[0].message.content);
            }

            case "rps": {
                const choice = options.getString("choice").toLowerCase();
                if (!rpsChoices.includes(choice)) return await interaction.editReply("Invalid choice. Choose rock, paper, or scissors.");
                const botChoice = rpsChoices[Math.floor(Math.random() * 3)];
                const result =
                    choice === botChoice ? `It's a tie! We both chose ${botChoice}.` :
                    (choice === "rock" && botChoice === "scissors") ||
                    (choice === "paper" && botChoice === "rock") ||
                    (choice === "scissors" && botChoice === "paper")
                        ? `You win! I chose ${botChoice}.`
                        : `I win! I chose ${botChoice}.`;
                return await interaction.editReply(result);
            }

            case "poster": {
                const tag = options.getString("tag");
                const sanitizedTag = tag.replace("#", "");
                try {
                    const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
                        headers: { Authorization: `Bearer ${COC_API_KEY}` },
                    });
                    const warData = response.data;
                    return await interaction.editReply(
                        `📅 **Status:** ${warData.state === "inWar" ? "In War" : "Not in war"}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`
                    );
                } catch {
                    return await interaction.editReply("❌ Error fetching war data or no current war.");
                }
            }

            case "remind":
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return await interaction.editReply("❌ You do not have permission.");
                }
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("⏰ Reminder")
                        .setDescription("We are still awaiting a response from you. Please respond at your earliest convenience.\n\nLost Family Team")
                        .setColor(0xFF0000)],
                });

            case "clans":
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return await interaction.editReply("❌ You do not have permission.");
                }
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("Clan Applications")
                        .setDescription(`To apply for a Lost Family clan, please go to <#${ticketsChannelId}> and select application from the ticket dropdown.`)
                        .setColor(0x00AE86)],
                });

            case "members": {
                const tag = options.getString("tag");
                const members = await getClanMembers(tag);
                if (!members) return await interaction.editReply("❌ Failed to fetch members.");
                const clanData = await getClanInfo(tag);
                if (!clanData) return await interaction.editReply("❌ Failed to get clan info.");

                let page = 0;
                const pageSize = 10;
                const pages = Math.ceil(members.length / pageSize);

                const embed = new EmbedBuilder()
                    .setTitle(`${clanData.name} Members (Page ${page + 1}/${pages})`)
                    .setDescription(paginateMembers(members, pageSize, page).map(m =>
                        `**${m.name}** (${m.role}) — ${m.trophies} 🏆`).join("\n"))
                    .setColor(0x3498db);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("next").setLabel("Next ➡️").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("export").setLabel("📄 Export Excel").setStyle(ButtonStyle.Success)
                );

                const msg = await interaction.editReply({ embeds: [embed], components: [row] });

                const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

                collector.on("collect", async i => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: "This is not your session.", ephemeral: true });
                    }
                    if (i.customId === "prev") {
                        page = page > 0 ? page - 1 : pages - 1;
                    } else if (i.customId === "next") {
                        page = page < pages - 1 ? page + 1 : 0;
                    } else if (i.customId === "export") {
                        collector.stop();
                        const attachment = await generateExcel(clanData.name, members);
                        return await i.update({ content: "Here is the Excel file:", files: [attachment], embeds: [], components: [] });
                    }
                    const updatedEmbed = new EmbedBuilder()
                        .setTitle(`${clanData.name} Members (Page ${page + 1}/${pages})`)
                        .setDescription(paginateMembers(members, pageSize, page).map(m =>
                            `**${m.name}** (${m.role}) — ${m.trophies} 🏆`).join("\n"))
                        .setColor(0x3498db);
                    await i.update({ embeds: [updatedEmbed], components: [row] });
                });

                collector.on("end", async () => {
                    await msg.edit({ components: [] });
                });

                break;
            }

            default:
                return await interaction.editReply("Unknown command.");
        }
    } catch (error) {
        console.error(error);
        await interaction.editReply("An error occurred while processing your command.");
    }
});

client.login(process.env.DISCORD_TOKEN);