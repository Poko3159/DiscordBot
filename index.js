const express = require("express");
const app = express();
const { Client, GatewayIntentBits } = require("discord.js");
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

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

console.log('COC API Key loaded:', COC_API_KEY ? 'Yes' : 'No');

// Fetch player info
async function getPlayerInfo(playerTag) {
    try {
        const sanitizedTag = playerTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching player data. Check the tag or API status." };
    }
}

// OpenAI Chat Function
async function askOpenAI(question) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: question }],
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI API Error:", error.response?.data || error.message);
        return "Error processing your request. Try again later.";
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;

    const args = msg.content.split(" ");
    const command = args[0].toLowerCase();

    if (command === "!ping") {
        return msg.reply("🏓 Pong! Bot is responsive.");
    }

    if (command === "!player") {
        if (!args[1]) return msg.reply("Please provide a player tag.");
        const playerData = await getPlayerInfo(args[1]);
        if (playerData.error) return msg.reply(`❌ Error: ${playerData.error}`);
        return msg.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
    }

    if (command === "!ask") {
        if (args.length < 2) return msg.reply("Please provide a question.");
        const question = args.slice(1).join(" ");
        const answer = await askOpenAI(question);
        return msg.reply(`🧠 **AI Response:** ${answer}`);
    }

    return msg.reply("Invalid command. Use `!ping`, `!ask`, `!player`, `!clan`, `!war`, or `!leaderboard`.");
});

client.login(process.env.DISCORD_TOKEN);