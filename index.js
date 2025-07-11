const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const { DateTime } = require("luxon");

// Express server for uptime monitoring
app.get("/", (req, res) => {
    res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

const rpsChoices = ["rock", "paper", "scissors"];

// Helper functions omitted for brevity (keep all your existing COC and OpenAI helper functions here)

async function sendClanReminder() {
    try {
        const channel = await client.channels.fetch(process.env.GLOBAL_CHAT_CHANNEL_ID);
        if (!channel) {
            console.error("Global chat channel not found.");
            return;
        }
        await channel.send("Hello! If you would like to apply for a Lost Family Clan, please navigate to the following channel - <#" + process.env.TICKETS_CHANNEL_ID + ">\n\nLost Family Team");
    } catch (error) {
        console.error("Error sending clan reminder:", error);
    }
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);

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
        new SlashCommandBuilder().setName("clans").setDescription("Send Lost Family Clan application reminder to global chat.")
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered globally.");

    // Schedule message daily at 16:00 UK time
    setInterval(() => {
        const now = DateTime.now().setZone("Europe/London");
        if (now.hour === 16 && now.minute === 0) {
            sendClanReminder();
        }
    }, 60 * 1000); // check every minute
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const { commandName, options } = interaction;

    if (commandName === "ping") {
        return interaction.editReply("🏓 Pong!");
    }

    if (commandName === "player") {
        const tag = options.getString("tag");
        const data = await getPlayerInfo(tag);
        if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);
        return interaction.editReply(`🏆 **Player Name:** ${data.name}\n🏰 **Town Hall Level:** ${data.townHallLevel}\n⭐ **Trophies:** ${data.trophies}\n⚔️ **War Stars:** ${data.warStars}\n🎖️ **Clan:** ${data.clan ? data.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${data.expLevel}`);
    }

    if (commandName === "clan") {
        const tag = options.getString("tag");
        const data = await getClanInfo(tag);
        if (data.error) return interaction.editReply(`❌ Error: ${data.error}`);
        return interaction.editReply(`🏰 **Clan Name:** ${data.name}\n🏆 **Clan Level:** ${data.clanLevel}\n🎖️ **Clan Points:** ${data.clanPoints}\n🔥 **War Win Streak:** ${data.warWinStreak}\n⚔️ **War Wins:** ${data.warWins}`);
    }

    if (commandName === "leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return interaction.editReply(`❌ Error: ${topClans.error}`);
        const leaderboard = topClans.map((clan, i) => `${i + 1}. **${clan.name}** - ${clan.clanPoints} points`).join("\n");
        return interaction.editReply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (commandName === "ask") {
        const question = options.getString("question");
        try {
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return interaction.editReply(res.choices[0].message.content);
        } catch (err) {
            console.error("OpenAI Error:", err);
            return interaction.editReply("❌ Error: Unable to process your request.");
        }
    }

    if (commandName === "roast") {
        const target = options.getString("target") || interaction.user.username;
        const roast = await roastUser(target);
        return interaction.editReply(roast);
    }

    if (commandName === "rps") {
        const choice = options.getString("choice").toLowerCase();
        if (!rpsChoices.includes(choice)) {
            return interaction.editReply("Invalid choice. Choose rock, paper, or scissors.");
        }
        const result = playRps(choice);
        return interaction.editReply(result);
    }

    if (commandName === "poster") {
        const tag = options.getString("tag");
        const warData = await getClanWarData(tag);
        if (warData.error) return interaction.editReply(`❌ Error: ${warData.error}`);
        const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
        return interaction.editReply(`📅 **Clan War Status:** ${warStatus}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
    }

    if (commandName === "help") {
        return interaction.editReply(
            "**Available Slash Commands:**\n" +
            "`/ping` - Check bot status\n" +
            "`/player [tag]` - Get player info\n" +
            "`/clan [tag]` - Get clan info\n" +
            "`/leaderboard` - Top global clans\n" +
            "`/ask [question]` - Ask OpenAI anything\n" +
            "`/roast [target]` - Roast someone\n" +
            "`/rps [choice]` - Rock Paper Scissors\n" +
            "`/poster [tag]` - Clan war status\n" +
            "`/remind` - Send a reminder (Admin only)\n" +
            "`/clans` - Send Lost Family Clan application reminder"
        );
    }

    if (commandName === "remind") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.editReply("❌ You do not have permission to use this command.");
        }
        const ticketsChannel = await client.channels.fetch(process.env.TICKETS_CHANNEL_ID);
        if (!ticketsChannel) return interaction.editReply("Tickets channel not found.");
        await ticketsChannel.send("Reminder: Please respond to your ticket if you’re awaiting a reply.");
        return interaction.editReply("Reminder sent to the tickets channel.");
    }

    if (commandName === "clans") {
        await sendClanReminder();
        return interaction.editReply("Lost Family Clan application reminder sent to #global-chat.");
    }
});

client.login(process.env.DISCORD_TOKEN);