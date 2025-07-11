const express = require("express");
const app = express();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require("discord.js");
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

const rpsChoices = ["rock", "paper", "scissors"];

// COC Helper Functions
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
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const { commandName, options } = interaction;

    if (commandName === "clans") {
        const ticketChannelId = process.env.TICKET_CHANNEL_ID;

        if (!ticketChannelId) {
            return interaction.editReply("â TICKET_CHANNEL_ID is not set in the environment.");
        }

        const embed = {
            color: 0x00bfff,
            title: "Clan Applications",
            description: `To apply for a Lost Family clan, please go to <#${ticketChannelId}> and submit your request.`,
            footer: {
                text: "Lost Family Team"
            }
        };

        return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === "remind") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.editReply("â You do not have permission to use this command.");
        }

        return interaction.editReply(
            "We are still awaiting a response from you. Please respond at your earliest convenience.

Lost Family Team"
        );
    }
});

client.login(process.env.DISCORD_TOKEN);