const express = require("express");
const app = express();
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const Tesseract = require("tesseract.js");

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

// OCR functionality
async function ocrImage(imageUrl) {
    try {
        const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng', {
            logger: (m) => console.log(m)
        });
        return text;
    } catch (error) {
        console.error("OCR Error:", error);
        return "Sorry, I couldn't extract text from the image.";
    }
}

// Summarize functionality using OpenAI
async function summarizeText(text) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful assistant that can summarize long texts into short summaries." },
                { role: "user", content: `Please summarize the following text:\n\n${text}` }
            ]
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI Error:", error);
        return "Sorry, I couldn't summarize the text. Please try again.";
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === "ping") {
        await interaction.reply("🏓 Pong! The bot is online and responsive.");
    }

    if (commandName === "player") {
        const playerTag = interaction.options.getString("tag");
        if (!playerTag) return interaction.reply("Please provide a player tag.");
        const playerData = await getPlayerInfo(playerTag);
        if (playerData.error) return interaction.reply(`❌ Error: ${playerData.error}`);
        return interaction.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
    }

    if (commandName === "clan") {
        const clanTag = interaction.options.getString("tag");
        if (!clanTag) return interaction.reply("Please provide a clan tag.");
        const clanData = await getClanInfo(clanTag);
        if (clanData.error) return interaction.reply(`❌ Error: ${clanData.error}`);
        return interaction.reply(`🏰 **Clan Name:** ${clanData.name}\n🏆 **Clan Level:** ${clanData.clanLevel}\n🎖️ **Clan Points:** ${clanData.clanPoints}\n🔥 **War Win Streak:** ${clanData.warWinStreak}\n⚔️ **War Wins:** ${clanData.warWins}`);
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

    if (commandName === "roast") {
        const target = interaction.options.getString("target") || interaction.user.username;
        const roast = await roastUser(target);
        return interaction.reply(roast);
    }

    if (commandName === "rps") {
        const userChoice = interaction.options.getString("choice").toLowerCase();
        if (!rpsChoices.includes(userChoice)) return interaction.reply("Invalid choice! Choose rock, paper, or scissors.");
        const result = playRps(userChoice);
        return interaction.reply(result);
    }

    if (commandName === "leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return interaction.reply(`❌ Error: ${topClans.error}`);
        const leaderboard = topClans.map((clan, index) => `${index + 1}. **${clan.name}** - ${clan.clanPoints} points`).join("\n");
        return interaction.reply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (commandName === "poster") {
        const clanTag = interaction.options.getString("tag");
        if (!clanTag) return interaction.reply("Please provide a clan tag.");
        const warData = await getClanWarData(clanTag);
        if (warData.error) return interaction.reply(`❌ Error: ${warData.error}`);
        const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
        return interaction.reply(`📅 **Clan War Status:** ${warStatus}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
    }

    if (commandName === "ocr") {
        const imageUrl = interaction.options.getString("image");
        if (!imageUrl) return interaction.reply("Please provide an image URL.");
        const text = await ocrImage(imageUrl);
        return interaction.reply(`Extracted Text: ${text}`);
    }

    if (commandName === "summarise") {
        const textToSummarize = interaction.options.getString("text");
        if (!textToSummarize) return interaction.reply("Please provide the text you want to summarize.");
        const summary = await summarizeText(textToSummarize);
        return interaction.reply(`Summary: ${summary}`);
    }

    if (commandName === "help") {
        return interaction.reply(`Here are the available commands:
        /ping - Check if the bot is online
        /player [tag] - Get player information
        /clan [tag] - Get clan information
        /ask [question] - Ask me anything
        /roast [target] - Roast someone (or yourself)
        /rps [rock|paper|scissors] - Play rock-paper-scissors
        /leaderboard - Show the top 5 global clans
        /poster [tag] - Get clan war details
        /ocr [image URL] - Extract text from an image using OCR
        /summarise [text] - Summarize the provided text
        `);
    }
});

// Register slash commands globally
client.once("ready", async () => {
    const commands = [
        {
            name: "ping",
            description: "Check if the bot is online"
        },
        {
            name: "player",
            description: "Get player information",
            options: [{
                name: "tag",
                type: "STRING",
                description: "Player tag",
                required: true
            }]
        },
        {
            name: "clan",
            description: "Get clan information",
            options: [{
                name: "tag",
                type: "STRING",
                description: "Clan tag",
                required: true
            }]
        },
        {
            name: "ask",
            description: "Ask me anything",
            options: [{
                name: "question",
                type: "STRING",
                description: "Your question",
                required: true
            }]
        },
        {
            name: "roast",
            description: "Roast someone",
            options: [{
                name: "target",
                type: "STRING",
                description: "User to roast",
                required: false
            }]
        },
        {
            name: "rps",
            description: "Play rock-paper-scissors",
            options: [{
                name: "choice",
                type: "STRING",
                description: "Your choice",
                required: true,
                choices: [
                    { name: "rock", value: "rock" },
                    { name: "paper", value: "paper" },
                    { name: "scissors", value: "scissors" }
                ]
            }]
        },
        {
            name: "leaderboard",
            description: "Show the top 5 global clans"
        },
        {
            name: "poster",
            description: "Get clan war details",
            options: [{
                name: "tag",
                type: "STRING",
                description: "Clan tag",
                required: true
            }]
        },
        {
            name: "ocr",
            description: "Extract text from an image using OCR",
            options: [{
                name: "image",
                type: "STRING",
                description: "Image URL",
                required: true
            }]
        },
        {
            name: "summarise",
            description: "Summarize the provided text",
            options: [{
                name: "text",
                type: "STRING",
                description: "Text to summarize",
                required: true
            }]
        },
        {
            name: "help",
            description: "Show all available commands"
        }
    ];
    
    try {
        await client.application?.commands.set(commands); // Global commands
        console.log("Slash commands registered successfully!");
    } catch (error) {
        console.error("Error registering slash commands:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);