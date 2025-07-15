Test  not working 

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
            case "ping":
                return await interaction.editReply("🏓 Pong!");

            case "player": {
                const tag = options.getString("tag");
                const data = await getPlayerInfo(tag);
                return await interaction.editReply(data.error ? `❌ ${data.error}` :
                    `🏆 **Player Name:** ${data.name}\n🏰 **Town Hall:** ${data.townHallLevel}\n⭐ **Trophies:** ${data.trophies}\n⚔️ **War Stars:** ${data.warStars}\n🎖️ **Clan:** ${data.clan?.name || "No Clan"}\n🛠️ **XP:** ${data.expLevel}`);
            }

            case "clan": {
                const tag = options.getString("tag");
                const data = await getClanInfo(tag);
                return await interaction.editReply(data.error ? `❌ ${data.error}` :
                    `🏰 **Clan Name:** ${data.name}\n🏆 **Level:** ${data.clanLevel}\n🎖️ **Points:** ${data.clanPoints}\n🔥 **Streak:** ${data.warWinStreak}\n⚔️ **Wins:** ${data.warWins}`);
            }

            case "leaderboard": {
                const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
                    headers: { Authorization: `Bearer ${COC_API_KEY}` },
                });
                const topClans = response.data.items.slice(0, 5);
                return await interaction.editReply(`🏆 **Top Clans:**\n${topClans.map((clan, i) => `${i + 1}. **${clan.name}** - ${clan.clanPoints} pts`).join("\n")}`);
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
                const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
                    headers: { Authorization: `Bearer ${COC_API_KEY}` },
                });
                const warData = response.data;
                return await interaction.editReply(
                    `📅 **Status:** ${warData.state === "inWar" ? "In War" : "Not in war"}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`
                );
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
                    if (i.user.id !== interaction.user.id) return i.reply({ content: "Not your session.", ephemeral: true });

                    if (i.customId === "prev") page = (page - 1 + pages) % pages;
                    if (i.customId === "next") page = (page + 1) % pages;
                    if (i.customId === "export") {
                        const file = await generateExcel(clanData.name, members);
                        return await i.reply({ content: "📁 Exported Excel file:", files: [file], ephemeral: true });
                    }

                    const updated = new EmbedBuilder()
                        .setTitle(`${clanData.name} Members (Page ${page + 1}/${pages})`)
                        .setDescription(paginateMembers(members, pageSize, page).map(m =>
                            `**${m.name}** (${m.role}) — ${m.trophies} 🏆`).join("\n"))
                        .setColor(0x3498db);
                    await i.update({ embeds: [updated], components: [row] });
                });

                collector.on("end", () => {
                    msg.edit({ components: [] }).catch(() => {});
                });
                break;
            }

            case "help": {
                const helpEmbed = new EmbedBuilder()
                    .setTitle("Help — List of Commands")
                    .setColor(0x00AE86)
                    .setDescription([
                        "/ping — Check if the bot is alive.",
                        "/player [tag] — Get info about a player.",
                        "/clan [tag] — Get info about a clan.",
                        "/leaderboard — Get top 5 global clans.",
                        "/ask [question] — Ask any question to OpenAI.",
                        "/roast [target] — Roast a user.",
                        "/rps [choice] — Play Rock Paper Scissors.",
                        "/poster [tag] — Get current war data for a clan.",
                        "/remind — Send a reminder message (admin only).",
                        "/clans — Info on how to apply for Lost Family clans (admin only).",
                        "/members [tag] — Get clan members in pages or export Excel.",
                        "/help — Show this help message."
                    ].join("\n"))
                    .setFooter({ text: "Lost Family Bot" });

                return await interaction.editReply({ embeds: [helpEmbed] });
            }

            default:
                return await interaction.editReply("❌ Unknown command.");
        }
    } catch (err) {
        console.error("❌ Error:", err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply("❌ Something went wrong.");
        } else {
            await interaction.reply("❌ Something went wrong.");
        }
    }
});

// === Start Bot ===
client.login(process.env.DISCORD_TOKEN);