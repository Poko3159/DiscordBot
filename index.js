const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

app.get("/", (req, res) => res.send("Bot is alive!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

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

async function getPlayerInfo(playerTag) {
    try {
        const sanitizedTag = playerTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return response.data;
    } catch (error) {
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
        return { error: "Error fetching war data. Check the clan tag or API status." };
    }
}

// Register slash commands
client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is online."),
        new SlashCommandBuilder().setName("player")
            .setDescription("Get Clash of Clans player info")
            .addStringOption(option => option.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan")
            .setDescription("Get Clash of Clans clan info")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans"),
        new SlashCommandBuilder().setName("ask")
            .setDescription("Ask a question to the AI")
            .addStringOption(option => option.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast")
            .setDescription("Roast someone (light-hearted)")
            .addStringOption(option => option.setName("target").setDescription("Name to roast").setRequired(false)),
        new SlashCommandBuilder().setName("rps")
            .setDescription("Play rock paper scissors")
            .addStringOption(option => option.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster")
            .setDescription("Get war info for a clan")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
    ];

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log("✅ Slash commands registered globally.");
    } catch (err) {
        console.error("Error registering slash commands:", err);
    }

    console.log(`Logged in as ${client.user.tag}`);
});

// Handle slash commands
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "ping") {
        await interaction.reply("🏓 Pong! I'm alive.");
    }

    if (commandName === "player") {
        const tag = interaction.options.getString("tag");
        const data = await getPlayerInfo(tag);
        if (data.error) return interaction.reply(`❌ ${data.error}`);
        return interaction.reply(`🏆 **Name:** ${data.name}\n🏰 TH Level: ${data.townHallLevel}\n⭐ Trophies: ${data.trophies}\n⚔️ War Stars: ${data.warStars}\n🎖️ Clan: ${data.clan?.name || "None"}\n🛠️ XP: ${data.expLevel}`);
    }

    if (commandName === "clan") {
        const tag = interaction.options.getString("tag");
        const data = await getClanInfo(tag);
        if (data.error) return interaction.reply(`❌ ${data.error}`);
        return interaction.reply(`🏰 **Clan:** ${data.name}\n🏆 Level: ${data.clanLevel}\n🎖️ Points: ${data.clanPoints}\n🔥 Win Streak: ${data.warWinStreak}\n⚔️ Wins: ${data.warWins}`);
    }

    if (commandName === "leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return interaction.reply(`❌ ${topClans.error}`);
        const list = topClans.map((c, i) => `${i + 1}. **${c.name}** - ${c.clanPoints} pts`).join("\n");
        return interaction.reply(`🏆 **Top Global Clans:**\n${list}`);
    }

    if (commandName === "ask") {
        const question = interaction.options.getString("question");
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return interaction.reply(response.choices[0].message.content);
        } catch {
            return interaction.reply("❌ Error contacting AI.");
        }
    }

    if (commandName === "roast") {
        const target = interaction.options.getString("target") || interaction.user.username;
        const roast = await roastUser(target);
        return interaction.reply(roast);
    }

    if (commandName === "rps") {
        const choice = interaction.options.getString("choice").toLowerCase();
        if (!rpsChoices.includes(choice)) return interaction.reply("❌ Invalid choice.");
        return interaction.reply(playRps(choice));
    }

    if (commandName === "poster") {
        const tag = interaction.options.getString("tag");
        const data = await getClanWarData(tag);
        if (data.error) return interaction.reply(`❌ ${data.error}`);
        const warStatus = data.state === "inWar" ? "Currently at War" : "Not in war";
        return interaction.reply(`📅 **War Status:** ${warStatus}\n🛡️ **Opponent:** ${data.opponent.name}\n⚔️ Wins: ${data.clan.winCount} vs ${data.opponent.winCount}`);
    }
});

client.login(process.env.DISCORD_TOKEN);