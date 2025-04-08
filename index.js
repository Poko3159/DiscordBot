require('dotenv').config();

const express = require("express");
const app = express();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

// Express server for uptime monitoring
app.get("/", (req, res) => res.send("Bot is alive!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

// Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// OpenAI and Clash of Clans API config
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

// Slash commands
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
    new SlashCommandBuilder().setName('player').setDescription('Get player info by tag')
        .addStringOption(option => option.setName('tag').setDescription('Player Tag').setRequired(true)),
    new SlashCommandBuilder().setName('clan').setDescription('Get clan info by tag')
        .addStringOption(option => option.setName('tag').setDescription('Clan Tag').setRequired(true)),
    new SlashCommandBuilder().setName('ask').setDescription('Ask a question to the bot')
        .addStringOption(option => option.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('roast').setDescription('Roast a user')
        .addStringOption(option => option.setName('target').setDescription('User to roast')),
    new SlashCommandBuilder().setName('rps').setDescription('Play rock, paper, scissors')
        .addStringOption(option => option.setName('choice').setDescription('Your choice: rock, paper, or scissors').setRequired(true)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Get the top 5 global clans'),
    new SlashCommandBuilder().setName('poster').setDescription('Get clan war status')
        .addStringOption(option => option.setName('tag').setDescription('Clan Tag').setRequired(true)),
];

// Register commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

// Command handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'ping') {
        await interaction.reply("🏓 Pong! The bot is online and responsive.");
    }

    else if (commandName === 'player') {
        await interaction.deferReply();
        const tag = interaction.options.getString('tag');
        const playerData = await getPlayerInfo(tag);
        if (playerData.error) {
            await interaction.editReply(`❌ Error: ${playerData.error}`);
        } else {
            await interaction.editReply(
                `🏆 **Player Name:** ${playerData.name}\n` +
                `🏰 **Town Hall Level:** ${playerData.townHallLevel}\n` +
                `⭐ **Trophies:** ${playerData.trophies}\n` +
                `⚔️ **War Stars:** ${playerData.warStars}\n` +
                `🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n` +
                `🛠️ **Experience Level:** ${playerData.expLevel}`
            );
        }
    }

    else if (commandName === 'clan') {
        await interaction.deferReply();
        const tag = interaction.options.getString('tag');
        const clanData = await getClanInfo(tag);
        if (clanData.error) {
            await interaction.editReply(`❌ Error: ${clanData.error}`);
        } else {
            await interaction.editReply(
                `🏰 **Clan Name:** ${clanData.name}\n` +
                `🏆 **Clan Level:** ${clanData.clanLevel}\n` +
                `🎖️ **Clan Points:** ${clanData.clanPoints}\n` +
                `🔥 **War Win Streak:** ${clanData.warWinStreak}\n` +
                `⚔️ **War Wins:** ${clanData.warWins}`
            );
        }
    }

    else if (commandName === 'ask') {
        await interaction.deferReply();
        const question = interaction.options.getString('question');
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.editReply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            await interaction.editReply("❌ Error: Unable to process your request.");
        }
    }

    else if (commandName === 'roast') {
        await interaction.deferReply();
        const target = interaction.options.getString('target') || interaction.user.username;
        const roast = await roastUser(target);
        await interaction.editReply(roast);
    }

    else if (commandName === 'rps') {
        const userChoice = interaction.options.getString('choice').toLowerCase();
        const result = playRps(userChoice);
        await interaction.reply(result);
    }

    else if (commandName === 'leaderboard') {
        await interaction.deferReply();
        const topClans = await getTopClans();
        if (topClans.error) {
            await interaction.editReply(`❌ Error: ${topClans.error}`);
        } else {
            const leaderboard = topClans
                .map((clan, i) => `${i + 1}. **${clan.name}** - ${clan.clanPoints} points`)
                .join("\n");
            await interaction.editReply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
        }
    }

    else if (commandName === 'poster') {
        await interaction.deferReply();
        const tag = interaction.options.getString('tag');
        const warData = await getClanWarData(tag);
        if (warData.error) {
            await interaction.editReply(`❌ Error: ${warData.error}`);
        } else {
            const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
            await interaction.editReply(
                `📅 **Clan War Status:** ${warStatus}\n` +
                `🛡️ **Opponent:** ${warData.opponent.name}\n` +
                `⚔️ **Clan Wins:** ${warData.clan.winCount}\n` +
                `🔥 **Opponent Wins:** ${warData.opponent.winCount}`
            );
        }
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Helper functions (assumed you have these implemented elsewhere)
async function getPlayerInfo(tag) {
    try {
        const res = await axios.get(`${COC_BASE_URL}/players/${encodeURIComponent(tag)}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (error) {
        return { error: error.response?.data?.message || "Failed to fetch player data." };
    }
}

async function getClanInfo(tag) {
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/${encodeURIComponent(tag)}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (error) {
        return { error: error.response?.data?.message || "Failed to fetch clan data." };
    }
}

async function getClanWarData(tag) {
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/${encodeURIComponent(tag)}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (error) {
        return { error: error.response?.data?.message || "Failed to fetch war data." };
    }
}

// Updated getTopClans function to handle API response correctly
async function getTopClans() {
    try {
        const res = await axios.get(`${COC_BASE_URL}/locations/32000000/rankings/clans`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });

        if (res.data && res.data.items && Array.isArray(res.data.items)) {
            return res.data.items.slice(0, 5); // Top 5 clans
        } else {
            return { error: "Failed to retrieve top clans data. Invalid response format." };
        }
    } catch (error) {
        console.error("Error fetching top clans:", error);
        return { error: error.response?.data?.message || "Failed to fetch top clans." };
    }
}

async function roastUser(username) {
    const roasts = [
        `${username}, you're like a cloud. When you disappear, it's a beautiful day.`,
        `If I had a dollar for every time you said something smart, I’d be broke.`,
        `${username}, you're proof that evolution can go in reverse.`,
        `You're the reason the gene pool needs a lifeguard.`,
    ];
    return roasts[Math.floor(Math.random() * roasts.length)];
}

function playRps(choice) {
    const options = ['rock', 'paper', 'scissors'];
    const botChoice = options[Math.floor(Math.random() * options.length)];
    if (choice === botChoice) return `It's a tie! We both chose **${choice}**.`;
    if (
        (choice === 'rock' && botChoice === 'scissors') ||
        (choice === 'paper' && botChoice === 'rock') ||
        (choice === 'scissors' && botChoice === 'paper')
    ) {
        return `You win! You chose **${choice}** and I chose **${botChoice}**.`;
    } else {
        return `You lose! You chose **${choice}** and I chose **${botChoice}**.`;
    }
}