const express = require("express");
const app = express();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

// Express server for uptime monitoring
app.get("/", (req, res) => {
    res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

console.log("COC API Key loaded:", COC_API_KEY ? "Yes" : "No");

const rpsChoices = ["rock", "paper", "scissors"];

// COC Helper Functions
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

async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
        });
        return response.data.items.slice(0, 5);
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
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
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching war data. Check the clan tag or API status." };
    }
}

function playRps(userChoice) {
    const botChoice = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (userChoice === botChoice) return `It's a tie! We both chose ${botChoice}.`;
    if (
        (userChoice === "rock" && botChoice === "scissors") ||
        (userChoice === "paper" && botChoice === "rock") ||
        (userChoice === "scissors" && botChoice === "paper")
    ) {
        return `You win! I chose ${botChoice}.`;
    } else {
        return `I win! I chose ${botChoice}.`;
    }
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
    } catch (error) {
        console.error("OpenAI Error:", error);
        return "I couldn't roast them this time! Maybe they're just too nice?";
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
        new SlashCommandBuilder().setName("clans").setDescription("How to apply for a Lost Family clan.")
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered globally.");
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
                messages: [{ role: "user", content: question }],
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
            `**Available Slash Commands:**
\`/ping\` - Check bot status
\`/player [tag]\` - Get player info
\`/clan [tag]\` - Get clan info
\`/leaderboard\` - Top global clans
\`/ask [question]\` - Ask OpenAI anything
\`/roast [target]\` - Roast someone
\`/rps [choice]\` - Rock Paper Scissors
\`/poster [tag]\` - Clan war status
\`/remind\` - Reminder (Admin only)
\`/clans\` - Clan Application`
        );
    }

    if (commandName === "remind") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.editReply("❌ You do not have permission to use this command.");
        }

        return interaction.editReply(
            "We are still awaiting a response from you. Please respond at your earliest convenience.\n\nLost Family Team"
        );
    }

    if (commandName === "clans") {
        const embed = new EmbedBuilder()
            .setTitle("Clan Applications")
                .setDescription(`To apply for a Lost Family clan, please go to <#${ticketsChannelId}> and submit your request.`)
            .setColor(0x00AE86);

        return interaction.editReply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);