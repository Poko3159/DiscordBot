const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

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

client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);

    const commands = [
        {
            name: "ping",
            description: "Check if the bot is online"
        },
        {
            name: "player",
            description: "Get Clash of Clans player info",
            options: [{
                name: "tag",
                description: "Player tag (e.g. #ABC123)",
                type: 3,
                required: true
            }]
        },
        {
            name: "clan",
            description: "Get Clash of Clans clan info",
            options: [{
                name: "tag",
                description: "Clan tag (e.g. #DEF456)",
                type: 3,
                required: true
            }]
        },
        {
            name: "ask",
            description: "Ask a question to AI",
            options: [{
                name: "question",
                description: "Your question",
                type: 3,
                required: true
            }]
        },
        {
            name: "roast",
            description: "Generate a funny roast",
            options: [{
                name: "target",
                description: "Who should I roast?",
                type: 3,
                required: false
            }]
        },
        {
            name: "rps",
            description: "Play rock-paper-scissors",
            options: [{
                name: "choice",
                description: "rock, paper or scissors",
                type: 3,
                required: true
            }]
        },
        {
            name: "leaderboard",
            description: "Get top 5 global clans"
        },
        {
            name: "poster",
            description: "Get current war status of a clan",
            options: [{
                name: "tag",
                description: "Clan tag (e.g. #XYZ789)",
                type: 3,
                required: true
            }]
        },
        {
            name: "help",
            description: "Show all available commands"
        },
        {
            name: "summarise",
            description: "Summarise a block of text using AI",
            options: [{
                name: "text",
                description: "The text you want summarised",
                type: 3,
                required: true
            }]
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log("👻 Slash commands registered globally.");
    } catch (error) {
        console.error("Error registering slash commands:", error);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === "ping") {
        await interaction.reply("🏓 Pong! Ghost’s AI is online and responsive.");
    }

    if (commandName === "player") {
        const tag = options.getString("tag");
        const data = await getPlayerInfo(tag);
        if (data.error) return interaction.reply(`❌ Error: ${data.error}`);

        return interaction.reply(`🏆 **Player Name:** ${data.name}\n🏰 **Town Hall Level:** ${data.townHallLevel}\n⭐ **Trophies:** ${data.trophies}\n⚔️ **War Stars:** ${data.warStars}\n🎖️ **Clan:** ${data.clan ? data.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${data.expLevel}`);
    }

    if (commandName === "clan") {
        const tag = options.getString("tag");
        const data = await getClanInfo(tag);
        if (data.error) return interaction.reply(`❌ Error: ${data.error}`);

        return interaction.reply(`🏰 **Clan Name:** ${data.name}\n🏆 **Clan Level:** ${data.clanLevel}\n🎖️ **Clan Points:** ${data.clanPoints}\n🔥 **War Win Streak:** ${data.warWinStreak}\n⚔️ **War Wins:** ${data.warWins}`);
    }

    if (commandName === "ask") {
        const question = options.getString("question");
        await interaction.deferReply();
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return interaction.editReply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return interaction.editReply("❌ Error: Unable to process your request.");
        }
    }

    if (commandName === "roast") {
        const target = options.getString("target") || interaction.user.username;
        const roast = await roastUser(target);
        return interaction.reply(roast);
    }

    if (commandName === "rps") {
        const userChoice = options.getString("choice").toLowerCase();
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
        const clanTag = options.getString("tag");
        const warData = await getClanWarData(clanTag);
        if (warData.error) return interaction.reply(`❌ Error: ${warData.error}`);
        const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
        return interaction.reply(`📅 **Clan War Status:** ${warStatus}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
    }

    if (commandName === "help") {
        return interaction.reply(
            "**Available Slash Commands:**\n" +
            "/ping - Check if the bot is online\n" +
            "/player [tag] - Get player info\n" +
            "/clan [tag] - Get clan info\n" +
            "/ask [question] - Ask AI anything\n" +
            "/roast [target] - Get a funny roast\n" +
            "/rps [choice] - Rock Paper Scissors\n" +
            "/leaderboard - Top 5 clans\n" +
            "/poster [tag] - Clan war status\n" +
            "/summarise [text] - Summarise text using AI"
        );
    }

    if (commandName === "summarise") {
        const text = options.getString("text");
        await interaction.deferReply();

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "Summarise the following text clearly and concisely." },
                    { role: "user", content: text }
                ]
            });

            await interaction.editReply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            await interaction.editReply("❌ Failed to summarise the text.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);