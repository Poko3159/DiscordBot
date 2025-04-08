const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
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

// Helper functions for fetching data (no changes here)
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

// Slash Command Handling
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === "ping") {
        return interaction.reply("🏓 Pong! The bot is online and responsive.");
    }

    if (commandName === "player") {
        const playerTag = interaction.options.getString("playerTag");
        if (!playerTag) return interaction.reply("Please provide a player tag.");
        const playerData = await getPlayerInfo(playerTag);
        if (playerData.error) return interaction.reply(`❌ Error: ${playerData.error}`);
        return interaction.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
    }

    if (commandName === "clan") {
        const clanTag = interaction.options.getString("clanTag");
        if (!clanTag) return interaction.reply("Please provide a clan tag.");
        const clanData = await getClanInfo(clanTag);
        if (clanData.error) return interaction.reply(`❌ Error: ${clanData.error}`);
        return interaction.reply(`🏰 **Clan Name:** ${clanData.name}\n🏆 **Clan Level:** ${clanData.clanLevel}\n🎖️ **Clan Points:** ${clanData.clanPoints}\n🔥 **War Win Streak:** ${clanData.warWinStreak}\n⚔️ **War Wins:** ${clanData.warWins}`);
    }

    if (commandName === "leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return interaction.reply(`❌ Error: ${topClans.error}`);
        const leaderboard = topClans.map((clan, index) => `${index + 1}. **${clan.name}** - ${clan.clanPoints} points`).join("\n");
        return interaction.reply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (commandName === "ask") {
        const question = interaction.options.getString("question");
        if (!question) return interaction.reply("Please provide a question.");
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return interaction.reply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return interaction.reply("❌ Error: Unable to process your request.");
        }
    }

    if (commandName === "rps") {
        const userChoice = interaction.options.getString("choice").toLowerCase();
        const result = playRps(userChoice);
        return interaction.reply(result);
    }

    if (commandName === "roast") {
        const target = interaction.options.getString("target") || interaction.user.username;
        const roast = await roastUser(target);
        return interaction.reply(roast);
    }
});

// Register Slash Commands with Discord API
const commands = [
    {
        name: "ping",
        description: "Check if the bot is responsive."
    },
    {
        name: "player",
        description: "Get information about a player.",
        options: [
            {
                name: "playerTag",
                type: "STRING",
                description: "The player tag (e.g., #ABC123)",
                required: true
            }
        ]
    },
    {
        name: "clan",
        description: "Get information about a clan.",
        options: [
            {
                name: "clanTag",
                type: "STRING",
                description: "The clan tag (e.g., #ABC123)",
                required: true
            }
        ]
    },
    {
        name: "leaderboard",
        description: "Show the top 5 global clans."
    },
    {
        name: "ask",
        description: "Ask a question.",
        options: [
            {
                name: "question",
                type: "STRING",
                description: "The question you want to ask.",
                required: true
            }
        ]
    },
    {
        name: "rps",
        description: "Play Rock, Paper, Scissors.",
        options: [
            {
                name: "choice",
                type: "STRING",
                description: "Your choice (rock, paper, scissors)",
                required: true,
                choices: [
                    { name: "rock", value: "rock" },
                    { name: "paper", value: "paper" },
                    { name: "scissors", value: "scissors" }
                ]
            }
        ]
    },
    {
        name: "roast",
        description: "Roast a user.",
        options: [
            {
                name: "target",
                type: "STRING",
                description: "The user to roast",
                required: false
            }
        ]
    }
];

// Register commands with Discord
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
            body: commands
        });
        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
    }
})();

client.login(process.env.DISCORD_TOKEN);