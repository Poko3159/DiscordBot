// === IMPORTS ===
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

// === SERVER SETUP ===
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

// === CONSTANTS ===
const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
const globalChannelId = process.env.GLOBAL_CHANNEL_ID;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const rpsChoices = ["rock", "paper", "scissors"];

// === COC FUNCTIONS ===
async function getPlayerInfo(playerTag) {
    try {
        const sanitizedTag = playerTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
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
        return { error: "Error fetching clan data. Check the tag or API status." };
    }
}
async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data.items.slice(0, 5);
    } catch (error) {
        return { error: "Error fetching global leaderboard." };
    }
}
async function getClanWarData(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data;
    } catch (error) {
        return { error: "Error fetching war data. Check the clan tag or API status." };
    }
}
async function getClanMembers(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const clanData = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return clanData.data.memberList || [];
    } catch (error) {
        return { error: "Error fetching clan members. Check the clan tag or API status." };
    }
}

// === OTHER FUNCTIONS ===
function playRps(userChoice) {
    const botChoice = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (userChoice === botChoice) return `It's a tie! We both chose ${botChoice}.`;
    if (
        (userChoice === "rock" && botChoice === "scissors") ||
        (userChoice === "paper" && botChoice === "rock") ||
        (userChoice === "scissors" && botChoice === "paper")
    ) return `You win! I chose ${botChoice}.`;
    return `I win! I chose ${botChoice}.`;
}
async function roastUser(target) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` },
            ],
        });
        return response.choices[0].message.content;
    } catch {
        return "I couldn't roast them this time! Maybe they're just too nice?";
    }
}

// === READY EVENT ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
            .addStringOption(option => option.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask any question to OpenAI.")
            .addStringOption(option => option.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(option => option.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(option => option.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data for a clan.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
        new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
        new SlashCommandBuilder().setName("clans").setDescription("How to apply for a Lost Family clan."),
        new SlashCommandBuilder().setName("clanmembers").setDescription("List clan members with pagination.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");

    // === DAILY MESSAGE AT 4PM UK ===
    setInterval(async () => {
        const now = DateTime.now().setZone("Europe/London");
        if (now.hour === 16 && now.minute === 0) {
            try {
                const channel = await client.channels.fetch(globalChannelId);
                if (!channel || !channel.isTextBased()) return;

                const embed = new EmbedBuilder()
                    .setTitle("Clan Applications")
                    .setDescription(`To apply for a Lost Family clan, please go to <#${ticketsChannelId}> and select application from the ticket dropdown.`)
                    .setColor(0x00AE86);

                await channel.send({ embeds: [embed] });
                console.log(`[✅] Daily 4PM UK message sent.`);
            } catch (error) {
                console.error("❌ Error sending 4PM message:", error);
            }
        }
    }, 60 * 1000);
});

// === INTERACTIONS ===
client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith("clanMembers:")) {
            const [_, tag, pageStr] = interaction.customId.split(":");
            const page = parseInt(pageStr, 10);
            const members = client.clanMembersCache?.[tag];
            if (!members) {
                return await interaction.reply({ content: "Session expired. Run the command again.", ephemeral: true });
            }

            const totalPages = Math.ceil(members.length / 10);
            const start = (page - 1) * 10;
            const pageMembers = members.slice(start, start + 10);

            const embed = new EmbedBuilder()
                .setTitle(`Clan Members - Page ${page}/${totalPages}`)
                .setColor(0x0099ff)
                .setDescription(pageMembers.map((m, i) =>
                    `${start + i + 1}. **${m.name}** - ${m.role} - TH${m.townHallLevel} - Trophies: ${m.trophies}`
                ).join("\n"));

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
                    .setDisabled(page === totalPages)
            );

            return await interaction.update({ embeds: [embed], components: [row] });
        }
    }

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
                const topClans = await getTopClans();
                return await interaction.editReply(topClans.error ? `❌ ${topClans.error}` :
                    `🏆 **Top Clans:**\n${topClans.map((clan, i) => `${i + 1}. **${clan.name}** - ${clan.clanPoints} pts`).join("\n")}`);
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
                return await interaction.editReply(await roastUser(target));
            }
            case "rps": {
                const choice = options.getString("choice").toLowerCase();
                if (!rpsChoices.includes(choice)) return await interaction.editReply("Invalid choice.");
                return await interaction.editReply(playRps(choice));
            }
            case "poster": {
                const tag = options.getString("tag");
                const warData = await getClanWarData(tag);
                return await interaction.editReply(warData.error ? `❌ ${warData.error}` :
                    `📅 **Status:** ${warData.state}\n🛡️ **Opponent:** ${warData.opponent.name}`);
            }
            case "remind": {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return await interaction.editReply("❌ You do not have permission.");
                }
                const embed = new EmbedBuilder()
                    .setTitle("⏰ Reminder")
                    .setDescription("We are still awaiting a response from you. Please reply to the ticket when you're ready.")
                    .setColor(0xff0000);
                return await interaction.editReply({ embeds: [embed] });
            }
            case "clans":
                return await interaction.editReply(`To apply for a Lost Family clan, go to <#${ticketsChannelId}> and select "Application" from the dropdown.`);
            case "clanmembers": {
                const tag = options.getString("tag");
                const members = await getClanMembers(tag);
                if (members.error) return await interaction.editReply(`❌ ${members.error}`);

                client.clanMembersCache = client.clanMembersCache || {};
                client.clanMembersCache[tag] = members;

                const page = 1;
                const totalPages = Math.ceil(members.length / 10);
                const start = (page - 1) * 10;
                const pageMembers = members.slice(start, start + 10);

                const embed = new EmbedBuilder()
                    .setTitle(`Clan Members - Page ${page}/${totalPages}`)
                    .setColor(0x0099ff)
                    .setDescription(pageMembers.map((m, i) =>
                        `${start + i + 1}. **${m.name}** - ${m.role} - TH${m.townHallLevel} - Trophies: ${m.trophies}`
                    ).join("\n"));

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`clanMembers:${tag}:${page + 1}`)
                        .setLabel("Next")
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(totalPages <= 1)
                );

                return await interaction.editReply({ embeds: [embed], components: [row] });
            }
        }
    } catch (error) {
        console.error("❌ Interaction Error:", error);
        return await interaction.editReply("Something went wrong.");
    }
});

// === START BOT ===
client.login(process.env.DISCORD_TOKEN);