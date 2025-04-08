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

// Fetch top global clans (FIXED ENDPOINT)
async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data.items;
    } catch (error) {
        console.error("COC API Error:", error.response?.data || error.message);
        return { error: "Error fetching global leaderboard. API might be down or the endpoint is incorrect." };
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;

    const args = msg.content.split(" ");
    const command = args[0].toLowerCase();

    if (command === "!help") {
        return msg.reply(`
Here are the available commands:

1. **!ping** - Check if the bot is online and responsive.
2. **!player [playerTag]** - Get information about a player.
3. **!clan [clanTag]** - Get information about a clan.
4. **!leaderboard** - Show the top 5 global clans.
5. **!ask [question]** - Ask the bot a question, and it will respond.
6. **!roast [username]** - Get a funny roast of a user (or yourself if no username is provided).
7. **!rps [rock/paper/scissors]** - Play a game of Rock, Paper, Scissors.
8. **!poster [clanTag]** - Get current war information about a clan.

Type `!commandName` to use any of the above commands.

Note: Replace `[playerTag]` and `[clanTag]` with valid tags (e.g., `#ABC123`).
        `);
    }

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

    if (command === "!leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return msg.reply(`❌ Error: ${topClans.error}`);

        const leaderboard = topClans
            .slice(0, 5)
            .map((clan, index) => `${index + 1}. **${clan.name}** - 🏆 ${clan.clanPoints} Points - ${clan.members} Members`)
            .join("\n");

        return msg.reply(`🌍 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (command === "!ask") {
        if (args.length < 2) return msg.reply("Please provide a question.");
        const question = args.slice(1).join(" ");

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: question }]
            });

            return msg.reply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return msg.reply("❌ Error: Unable to process your request.");
        }
    }

    if (command === "!rps") {
        if (!args[1]) return msg.reply("Please choose rock, paper, or scissors! Example: `!rps rock`");

        const choices = ["rock", "paper", "scissors"];
        const userChoice = args[1].toLowerCase();
        if (!choices.includes(userChoice)) {
            return msg.reply("Invalid choice! Please choose rock, paper, or scissors.");
        }

        const botChoice = choices[Math.floor(Math.random() * choices.length)];

        let result;
        if (userChoice === botChoice) {
            result = "It's a tie!";
        } else if (
            (userChoice === "rock" && botChoice === "scissors") ||
            (userChoice === "paper" && botChoice === "rock") ||
            (userChoice === "scissors" && botChoice === "paper")
        ) {
            result = "You win! 🎉";
        } else {
            result = "I win! 👻";
        }

        return msg.reply(`You chose **${userChoice}**. I chose **${botChoice}**. ${result}`);
    }

    return msg.reply("Invalid command. Use `!ping`, `!player`, `!clan`, `!leaderboard`, `!ask`, or `!rps`.");
});

client.login(process.env.DISCORD_TOKEN);