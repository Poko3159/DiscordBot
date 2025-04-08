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

// Fetch top global clans
async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data.items.slice(0, 5);
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching global leaderboard." };
    }
}

// Fetch war data for a clan
async function getClanWarData(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching war data. Check the clan tag or API status." };
    }
}

// Rock Paper Scissors game
const rpsChoices = ["rock", "paper", "scissors"];
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

// Roast generator using OpenAI
async function roastUser(target) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` }
            ]
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI Error:", error);
        return "I couldn't roast them this time! Maybe they're just too nice?";
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
        return msg.reply("🏓 Pong! The bot is online and responsive.");
    }

    if (command === "!player") {
        if (!args[1]) return msg.reply("Please provide a player tag.");
        const playerData = await getPlayerInfo(args[1]);
        if (playerData.error) return msg.reply(`❌ Error: ${playerData.error}`);
        return msg.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
    }

    if (command === "!clan") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const clanData = await getClanInfo(args[1]);
        if (clanData.error) return msg.reply(`❌ Error: ${clanData.error}`);
        return msg.reply(`🏰 **Clan Name:** ${clanData.name}\n🏆 **Clan Level:** ${clanData.clanLevel}\n🎖️ **Clan Points:** ${clanData.clanPoints}\n🔥 **War Win Streak:** ${clanData.warWinStreak}\n⚔️ **War Wins:** ${clanData.warWins}`);
    }

    if (command === "!ask") {
        if (args.length < 2) return msg.reply("Please provide a question.");
        const question = args.slice(1).join(" ");
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return msg.reply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return msg.reply("❌ Error: Unable to process your request.");
        }
    }

    if (command === "!roast") {
        const target = args[1] ? args[1] : msg.author.username;
        const roast = await roastUser(target);
        return msg.reply(roast);
    }

    if (command === "!rps") {
        if (args.length < 2) return msg.reply("Please choose rock, paper, or scissors.");
        const userChoice = args[1].toLowerCase();
        if (!rpsChoices.includes(userChoice)) return msg.reply("Invalid choice! Choose rock, paper, or scissors.");
        const result = playRps(userChoice);
        return msg.reply(result);
    }

    if (command === "!leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return msg.reply(`❌ Error: ${topClans.error}`);
        const leaderboard = topClans.map((clan, index) => `${index + 1}. **${clan.name}** - ${clan.clanPoints} points`).join("\n");
        return msg.reply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (command === "!poster") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const clanTag = args[1];
        const warData = await getClanWarData(clanTag);
        if (warData.error) return msg.reply(`❌ Error: ${warData.error}`);
        
        const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
        return msg.reply(`📅 **Clan War Status:** ${warStatus}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
    }

    return msg.reply("Invalid command. Use `!ping`, `!player`, `!clan`, `!leaderboard`, `!ask`, `!roast`, `!rps`, `!poster`.");
});

// Register slash commands globally
client.once("ready", async () => {
    const commands = [
        // your slash commands here
    ];
    
    try {
        await client.application?.commands.set(commands); // Global commands
        console.log("Slash commands registered successfully!");
    } catch (error) {
        console.error("Error registering slash commands:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);