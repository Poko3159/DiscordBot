const express = require("express");
const app = express();
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

// Express server for uptime monitoring
app.get("/", (req, res) => {
    res.send("Bot is alive!");
});

app.get("/ping", (req, res) => {
    res.send("Pong!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

// Keep-alive ping (Replace with your actual Render or Replit URL)
setInterval(() => {
    require("http").get(`http://0.0.0.0:${PORT}/ping`);
    require("http").get("https://discordbot-144o.onrender.com/ping");
}, 5 * 60 * 1000); // Pings every 5 minutes

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

// Fetch clan info
async function getClanInfo(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching clan data. Check the tag or API status." };
    }
}

// Fetch war info
async function getWarInfo(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching war data. Check the tag or API status." };
    }
}

// Fetch top global clans
async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/rankings/global/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        const topClans = response.data.items.slice(0, 5);

        let leaderboard = "\ud83c\udf0d **Top 5 Global Clans** \ud83c\udf0d\n";
        topClans.forEach((clan, index) => {
            leaderboard += `\`${index + 1}.\` **${clan.name}** - \ud83c\udfc6 ${clan.clanPoints} points (Level ${clan.clanLevel})\n`;
        });

        return leaderboard;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return "Could not fetch leaderboard. Try again later.";
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;

    const args = msg.content.split(" ");
    const command = args[0].toLowerCase();

    if (command === "!player") {
        if (!args[1]) return msg.reply("Please provide a player tag.");
        const playerData = await getPlayerInfo(args[1]);
        if (playerData.error) return msg.reply(`❌ Error: ${playerData.error}`);
        return msg.reply(`🏆 **${playerData.name}** - Level: ${playerData.expLevel}, Trophies: ${playerData.trophies}`);
    }

    if (command === "!clan") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const clanData = await getClanInfo(args[1]);
        if (clanData.error) return msg.reply(`❌ Error: ${clanData.error}`);
        return msg.reply(`🏰 **${clanData.name}** - Level: ${clanData.clanLevel}, Members: ${clanData.members}/50`);
    }

    if (command === "!war") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const warData = await getWarInfo(args[1]);
        if (warData.error) return msg.reply(`❌ Error: ${warData.error}`);
        return msg.reply(`⚔️ **Clan War Status**\n🏰 **Opponent:** ${warData.opponent.name}\n🔥 **War State:** ${warData.state}`);
    }

    if (command === "!leaderboard") {
        const leaderboard = await getTopClans();
        return msg.reply(leaderboard);
    }

    return msg.reply("Invalid command. Use `!player`, `!clan`, `!war`, or `!leaderboard`.");
});

client.login(process.env.DISCORD_TOKEN);
