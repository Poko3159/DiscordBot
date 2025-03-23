const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

// Keep-alive function to prevent Replit from sleeping
app.get('/ping', (req, res) => {
  res.send('Pong!');
});

setInterval(() => {
  require("http").get(`http://0.0.0.0:${PORT}/ping`);
}, 5 * 60 * 1000); // Pings itself every 5 minutes

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const axios = require('axios');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

// Debug log to check if API key is loaded
console.log('COC API Key loaded:', COC_API_KEY ? 'Yes' : 'No');

async function getPlayerInfo(playerTag) {
    try {
        const response = await axios.get(`${COC_BASE_URL}/players/%23${playerTag}`, {
            headers: { 
                'Authorization': `Bearer ${COC_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('COC API Error Details:', {
            status: error.response?.status,
            data: error.response?.data,
            headers: error.response?.headers,
            message: error.message
        });
        if (!COC_API_KEY) {
            return { error: "COC API key is missing. Please check your environment variables." };
        }
        if (error.response?.status === 403) {
            if (error.response?.data?.reason === 'accessDenied.invalidIp') {
                return { error: `IP Address not authorized. Please whitelist IP ${error.response?.data?.message.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || 'unknown'} in your COC Developer portal.` };
            }
            return { error: "Invalid API key. Please check your COC API key." };
        }
        if (error.response?.status === 404) {
            return { error: "Player not found. Please check the tag." };
        }
        return { error: `API Error: ${error.response?.data?.message || error.message}` };
    }
}

async function getClanInfo(clanTag) {
    try {
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${clanTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
        return { error: "Invalid clan tag or API issue." };
    }
}

async function getWarInfo(clanTag) {
    try {
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${clanTag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
        return { error: "War data unavailable or incorrect clan tag." };
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith("!")) return; // Only respond to commands starting with '!'

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

    if (command === "!checkurl") {
        return msg.reply(`Your bot URL is: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    }

    return msg.reply("Invalid command. Use `!player`, `!clan`, `!war`, `!checkurl`, or `!leaderboard`.");
});

client.login(process.env.DISCORD_TOKEN);
