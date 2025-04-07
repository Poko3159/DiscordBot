require('dotenv').config();  // Add this to load environment variables

const express = require("express");
const app = express();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
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

// Creating the Discord client
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// Initialize OpenAI and Clash of Clans API Key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";

// Registering Slash Commands
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
    new SlashCommandBuilder().setName('player').setDescription('Get player info by tag').addStringOption(option =>
        option.setName('tag').setDescription('Player Tag').setRequired(true)),
    new SlashCommandBuilder().setName('clan').setDescription('Get clan info by tag').addStringOption(option =>
        option.setName('tag').setDescription('Clan Tag').setRequired(true)),
    new SlashCommandBuilder().setName('ask').setDescription('Ask a question to the bot').addStringOption(option =>
        option.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('roast').setDescription('Roast a user').addStringOption(option =>
        option.setName('target').setDescription('User to roast').setRequired(false)),
    new SlashCommandBuilder().setName('rps').setDescription('Play rock, paper, scissors').addStringOption(option =>
        option.setName('choice').setDescription('Your choice: rock, paper, or scissors').setRequired(true)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Get the top 5 global clans'),
    new SlashCommandBuilder().setName('poster').setDescription('Get clan war status').addStringOption(option =>
        option.setName('tag').setDescription('Clan Tag').setRequired(true))
];

// Initialize REST client
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Register the commands using the CLIENT_ID from .env
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),  // Use CLIENT_ID from .env
            { body: commands },
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag || "Unknown Bot"}!`);
});

// Handle interactions (commands)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ping') {
        await interaction.reply("🏓 Pong! The bot is online and responsive.");
    } else if (commandName === 'player') {
        const playerTag = interaction.options.getString('tag');
        const playerData = await getPlayerInfo(playerTag);
        if (playerData.error) {
            await interaction.reply(`❌ Error: ${playerData.error}`);
        } else {
            await interaction.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
        }
    } else if (commandName === 'clan') {
        const clanTag = interaction.options.getString('tag');
        const clanData = await getClanInfo(clanTag);
        if (clanData.error) {
            await interaction.reply(`❌ Error: ${clanData.error}`);
        } else {
            await interaction.reply(`🏰 **Clan Name:** ${clanData.name}\n🏆 **Clan Level:** ${clanData.clanLevel}\n🎖️ **Clan Points:** ${clanData.clanPoints}\n🔥 **War Win Streak:** ${clanData.warWinStreak}\n⚔️ **War Wins:** ${clanData.warWins}`);
        }
    } else if (commandName === 'ask') {
        const question = interaction.options.getString('question');
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.reply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            await interaction.reply("❌ Error: Unable to process your request.");
        }
    } else if (commandName === 'roast') {
        const target = interaction.options.getString('target') || interaction.user.username;
        const roast = await roastUser(target);
        await interaction.reply(roast);
    } else if (commandName === 'rps') {
        const userChoice = interaction.options.getString('choice').toLowerCase();
        const result = playRps(userChoice);
        await interaction.reply(result);
    } else if (commandName === 'leaderboard') {
        const topClans = await getTopClans();
        if (topClans.error) {
            await interaction.reply(`❌ Error: ${topClans.error}`);
        } else {
            const leaderboard = topClans.map((clan, index) => `${index + 1}. **${clan.name}** - ${clan.clanPoints} points`).join("\n");
            await interaction.reply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
        }
    } else if (commandName === 'poster') {
        const clanTag = interaction.options.getString('tag');
        const warData = await getClanWarData(clanTag);
        if (warData.error) {
            await interaction.reply(`❌ Error: ${warData.error}`);
        } else {
            const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
            await interaction.reply(`📅 **Clan War Status:** ${warStatus}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
        }
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);