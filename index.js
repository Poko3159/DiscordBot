const express = require("express");
const app = express();
const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const axios = require('axios');

// Express server for uptime monitoring
app.get("/", (req, res) => {
    res.send("Bot is alive!");
});

app.get('/ping', (req, res) => {
    res.send('Pong!');
});

// Keep-alive ping (replace with your actual Render URL)
setInterval(() => {
    require("http").get("https://discordbot-144o.onrender.com/ping");
}, 5 * 60 * 1000); // Every 5 minutes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Discord bot setup
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

// Debug log to check API key
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
        return { error: "Invalid clan tag or API issue." };
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
        return { error: "War data unavailable or incorrect clan tag." };
    }
}

// Fetch top global clans
async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/rankings/global/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });

        const topClans = response.data.items.slice(0, 5); // Get top 5 clans

        let leaderboard = "🌍 **Top 5 Global Clans** 🌍\n";
        topClans.forEach((clan, index) => {
            leaderboard += `\`${index + 1}.\` **${clan.name}** - 🏆 ${clan.clanPoints} points (Level ${clan.clanLevel})\n`;
        });

        return leaderboard;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return "Could not fetch leaderboard. Try again later.";
    }
}

// Bot ready event
client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

// Command handler
client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;

    const args = msg.content.split(" ");
    const command = args[0].toLowerCase();
    const param = args[1]?.replace("#", "");

    if (command === "!player") {
        if (!param) return msg.reply("Provide a valid player tag (e.g., `!player #ABC123`).");
        const playerData = await getPlayerInfo(param);
        if (playerData.error) return msg.reply(playerData.error);
        return msg.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
    }

    if (command === "!clan") {
        if (!param) return msg.reply("Provide a valid clan tag (e.g., `!clan #ABC123`).");
        const clanData = await getClanInfo(param);
        if (clanData.error) return msg.reply(clanData.error);
        return msg.reply(`🏰 **Clan Name:** ${clanData.name}\n📛 **Clan Tag:** ${clanData.tag}\n🔥 **Clan Level:** ${clanData.clanLevel}\n🛡️ **War Wins:** ${clanData.warWins}\n🏆 **Total Points:** ${clanData.clanPoints}\n👥 **Members:** ${clanData.members}/50`);
    }

    if (command === "!war") {
        if (!param) return msg.reply("Provide a valid clan tag (e.g., `!war #ABC123`).");
        const warData = await getWarInfo(param);
        if (warData.error) return msg.reply(warData.error);
        if (warData.state === "notInWar") return msg.reply("This clan is not currently in a war.");
        return msg.reply(`⚔️ **Clan War Status**\n🏰 **Opponent:** ${warData.opponent.name}\n🔥 **War State:** ${warData.state}\n🎯 **Stars Earned:** ${warData.clan.stars}\n⚔️ **Attacks Used:** ${warData.clan.attacks}/${warData.teamSize * 2}\n🏆 **Your Clan Stars:** ${warData.clan.stars}\n🎖 **Opponent Stars:** ${warData.opponent.stars}`);
    }

    if (command === "!leaderboard") {
        const leaderboard = await getTopClans();
        return msg.reply(leaderboard);
    }

    return msg.reply("Invalid command. Use `!player`, `!clan`, `!war`, or `!leaderboard`.");
});

// Login bot
client.login(process.env.DISCORD_TOKEN);
