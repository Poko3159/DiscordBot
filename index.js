const express = require("express");
const app = express();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, InteractionType } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
require("dotenv").config();

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

const rpsChoices = ["rock", "paper", "scissors"];

function playRps(userChoice) {
    const botChoice = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (userChoice === botChoice) return `It's a tie! We both chose ${botChoice}.`;
    if ((userChoice === "rock" && botChoice === "scissors") || (userChoice === "paper" && botChoice === "rock") || (userChoice === "scissors" && botChoice === "paper")) {
        return `You win! I chose ${botChoice}.`;
    } else {
        return `I win! I chose ${botChoice}.`;
    }
}

async function getPlayerInfo(tag) {
    try {
        const sanitizedTag = tag.replace("#", "");
        const res = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (err) {
        return { error: "Error fetching player data." };
    }
}

async function getClanInfo(tag) {
    try {
        const sanitizedTag = tag.replace("#", "");
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (err) {
        return { error: "Error fetching clan data." };
    }
}

async function getTopClans() {
    try {
        const res = await axios.get(`${COC_BASE_URL}/locations/global/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data.items.slice(0, 5);
    } catch (err) {
        return { error: "Error fetching leaderboard." };
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
        return { error: "Error fetching war data." };
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
        return "I couldn't roast them this time! Maybe they're just too nice?";
    }
}

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!"),
        new SlashCommandBuilder().setName("player").setDescription("Get Clash of Clans player info.").addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get Clash of Clans clan info.").addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("ask").setDescription("Ask a question to AI.").addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user").addStringOption(opt => opt.setName("target").setDescription("Target username")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors!").addStringOption(opt => opt.setName("choice").setDescription("rock/paper/scissors").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans"),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war info for a clan").addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered globally.");
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "ping") {
        return interaction.reply("🏓 Pong!");
    }

    if (commandName === "player") {
        const tag = interaction.options.getString("tag");
        await interaction.deferReply();
        const player = await getPlayerInfo(tag);
        if (player.error) return interaction.editReply(player.error);
        return interaction.editReply(`🏆 **${player.name}** | TH ${player.townHallLevel}\n⭐ **Trophies:** ${player.trophies}\n⚔️ **War Stars:** ${player.warStars}\n🎖️ **Clan:** ${player.clan ? player.clan.name : "No Clan"}\n🛠️ **Exp:** ${player.expLevel}`);
    }

    if (commandName === "clan") {
        const tag = interaction.options.getString("tag");
        await interaction.deferReply();
        const clan = await getClanInfo(tag);
        if (clan.error) return interaction.editReply(clan.error);
        return interaction.editReply(`🏰 **${clan.name}**\n🏆 **Level:** ${clan.clanLevel}\n🎖️ **Points:** ${clan.clanPoints}\n🔥 **Win Streak:** ${clan.warWinStreak}\n⚔️ **Wins:** ${clan.warWins}`);
    }

    if (commandName === "ask") {
        const question = interaction.options.getString("question");
        await interaction.deferReply();
        try {
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return interaction.editReply(res.choices[0].message.content);
        } catch (err) {
            return interaction.editReply("❌ Error: Unable to process your request.");
        }
    }

    if (commandName === "roast") {
        const target = interaction.options.getString("target") || interaction.user.username;
        await interaction.deferReply();
        const result = await roastUser(target);
        return interaction.editReply(result);
    }

    if (commandName === "rps") {
        const choice = interaction.options.getString("choice").toLowerCase();
        if (!rpsChoices.includes(choice)) return interaction.reply("Choose rock, paper, or scissors.");
        const result = playRps(choice);
        return interaction.reply(result);
    }

    if (commandName === "leaderboard") {
        await interaction.deferReply();
        const topClans = await getTopClans();
        if (topClans.error) return interaction.editReply(topClans.error);
        const board = topClans.map((c, i) => `${i + 1}. **${c.name}** - ${c.clanPoints} pts`).join("\n");
        return interaction.editReply(`🏆 **Top 5 Clans:**\n${board}`);
    }

    if (commandName === "poster") {
        const tag = interaction.options.getString("tag");
        await interaction.deferReply();
        const war = await getClanWarData(tag);
        if (war.error) return interaction.editReply(war.error);
        const status = war.state === "inWar" ? "Currently at War" : "Not in a war right now";
        return interaction.editReply(`📅 **War Status:** ${status}\n🛡️ **Opponent:** ${war.opponent?.name || "N/A"}`);
    }
});

client.login(process.env.DISCORD_TOKEN);
