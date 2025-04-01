const express = require("express");
const app = express();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
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
        return { error: "Error fetching player data." };
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
        return { error: "Error fetching clan data." };
    }
}

// Fetch top 5 global clans
async function getTopClans() {
    try {
        const response = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data.items.slice(0, 5);
    } catch (error) {
        return { error: "Error fetching global leaderboard." };
    }
}

// Fetch current war details
async function getCurrentWar(clanTag) {
    try {
        const sanitizedTag = clanTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        if (response.data.state !== "warInProgress" && response.data.state !== "preparation") {
            return { error: "No active war currently." };
        }
        return {
            clan1: response.data.clan.name,
            clan2: response.data.opponent.name
        };
    } catch (error) {
        return { error: "Error fetching war data." };
    }
}

// Generate war slogan using GPT-4 Turbo
async function generateWarSlogan(clan1, clan2) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "user", content: `Create an epic war slogan for a Clash of Clans battle between ${clan1} and ${clan2}.` }]
        });
        return response.choices[0].message.content;
    } catch (error) {
        return "An epic battle is about to begin!";
    }
}

// Generate battle poster using DALL·E
async function generateWarPoster(clan1, clan2) {
    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: `Epic battle scene between two powerful Clash of Clans clans, ${clan1} and ${clan2}, medieval fantasy war, fire, banners, warriors charging.`,
            n: 1,
            size: "1024x1024"
        });
        return response.data[0].url;
    } catch (error) {
        return null;
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
        return msg.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}`);
    }

    if (command === "!clan") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const clanData = await getClanInfo(args[1]);
        if (clanData.error) return msg.reply(`❌ Error: ${clanData.error}`);
        return msg.reply(`🏰 **Clan Name:** ${clanData.name}\n🏆 **Clan Level:** ${clanData.clanLevel}`);
    }

    if (command === "!leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return msg.reply(`❌ ${topClans.error}`);
        
        const leaderboard = topClans.map((clan, index) => `${index + 1}. **${clan.name}** - 🏆 ${clan.clanPoints} Points`).join("\n");
        return msg.reply(`🌍 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (command === "!roast") {
        const target = args[1] ? args[1] : msg.author.username;
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    { role: "system", content: "You are a sarcastic AI that generates funny, lighthearted roasts." },
                    { role: "user", content: `Roast ${target} in a funny but non-offensive way.` }
                ]
            });
            return msg.reply(response.choices[0].message.content);
        } catch (error) {
            return msg.reply("❌ Error: Couldn't generate a roast.");
        }
    }

    if (command === "!rps") {
        const choices = ["rock", "paper", "scissors"];
        const userChoice = args[1]?.toLowerCase();
        if (!choices.includes(userChoice)) {
            return msg.reply("Please choose rock, paper, or scissors. Example: `!rps rock`");
        }
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        const result = userChoice === botChoice 
            ? "It's a tie!" 
            : (userChoice === "rock" && botChoice === "scissors") || (userChoice === "scissors" && botChoice === "paper") || (userChoice === "paper" && botChoice === "rock") 
            ? "You win! 🎉" 
            : "I win! 😈";
        return msg.reply(`You chose **${userChoice}**. I chose **${botChoice}**. ${result}`);
    }

    if (command === "!poster") {
        const clanTag = process.env.CLAN_TAG;
        const warData = await getCurrentWar(clanTag);
        if (warData.error) return msg.reply(`❌ ${warData.error}`);
        
        const slogan = await generateWarSlogan(warData.clan1, warData.clan2);
        const imageUrl = await generateWarPoster(warData.clan1, warData.clan2);

        const embed = new EmbedBuilder()
            .setTitle("⚔️ CLAN WAR ALERT! ⚔️")
            .setDescription(slogan)
            .setColor(0xff0000);
        
        if (imageUrl) embed.setImage(imageUrl);
        
        return msg.channel.send({ embeds: [embed] });
    }

    return msg.reply("Invalid command. Use `!ping`, `!player`, `!clan`, `!leaderboard`, `!poster`, `!roast`, or `!rps`.");
});

client.login(process.env.DISCORD_TOKEN);