const express = require("express");
const { DateTime } = require("luxon");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
const globalChannelId = process.env.GLOBAL_CHANNEL_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const rpsChoices = ["rock", "paper", "scissors"];

async function getPlayerInfo(playerTag) {
    try {
        const sanitizedTag = playerTag.replace("#", "");
        const response = await axios.get(`${COC_BASE_URL}/players/%23${sanitizedTag}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
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
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
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
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
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
            headers: { Authorization: `Bearer ${COC_API_KEY}` },
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
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` },
            ],
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI Error:", error);
        return "I couldn't roast them this time! Maybe they're just too nice?";
    }
}

client.once("ready", async () => {
    console.log(`â Logged in as ${client.user?.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
            .addStringOption(option => option.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask any question to OpenAI.")
            .addStringOption(option => option.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(option => option.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(option => option.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data for a clan.")
            .addStringOption(option => option.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
        new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
        new SlashCommandBuilder().setName("clans").setDescription("How to apply for a Lost Family clan.")
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("â Slash commands registered.");

    setInterval(async () => {
        const now = DateTime.now().setZone("Europe/London");
        if (now.hour === 16 && now.minute === 0) {
            try {
                const channel = await client.channels.fetch(globalChannelId);
                if (!channel || !channel.isTextBased()) return;

                const embed = new EmbedBuilder()
                    .setTitle("Clan Applications")
                    .setDescription(`To apply for a Lost Family clan, please go to <#${ticketsChannelId}> and select application from the ticket dropdown.`)
                    .setColor(0x00AE86);

                await channel.send({ embeds: [embed] });
                console.log(`[â] Daily 4PM UK message sent.`);
            } catch (error) {
                console.error("â Error sending 4PM message:", error);
            }
        }
    }, 60 * 1000);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
        await interaction.deferReply();

        switch (commandName) {
            case "ping": {
                const embed = new EmbedBuilder().setTitle("ð Pong!").setColor(0x00AE86);
                return await interaction.editReply({ embeds: [embed] });
            }

            case "player": {
                const tag = options.getString("tag");
                const data = await getPlayerInfo(tag);
                if (data.error) return await interaction.editReply(`â ${data.error}`);
                const embed = new EmbedBuilder()
                    .setTitle(`ð¤ Player Info: ${data.name}`)
                    .addFields(
                        { name: "ð° Town Hall", value: `${data.townHallLevel}`, inline: true },
                        { name: "â­ Trophies", value: `${data.trophies}`, inline: true },
                        { name: "âï¸ War Stars", value: `${data.warStars}`, inline: true },
                        { name: "ð ï¸ XP Level", value: `${data.expLevel}`, inline: true },
                        { name: "ðï¸ Clan", value: `${data.clan?.name || "No Clan"}`, inline: true }
                    )
                    .setColor(0x0099FF);
                return await interaction.editReply({ embeds: [embed] });
            }

            case "clan": {
                const tag = options.getString("tag");
                const data = await getClanInfo(tag);
                if (data.error) return await interaction.editReply(`â ${data.error}`);
                const embed = new EmbedBuilder()
                    .setTitle(`ð° Clan Info: ${data.name}`)
                    .addFields(
                        { name: "ð Level", value: `${data.clanLevel}`, inline: true },
                        { name: "ð¯ Points", value: `${data.clanPoints}`, inline: true },
                        { name: "ð¥ Win Streak", value: `${data.warWinStreak}`, inline: true },
                        { name: "âï¸ War Wins", value: `${data.warWins}`, inline: true },
                        { name: "ð¥ Members", value: `${data.members}`, inline: true }
                    )
                    .setColor(0xFFA500);
                return await interaction.editReply({ embeds: [embed] });
            }

            case "leaderboard": {
                const topClans = await getTopClans();
                if (topClans.error) return await interaction.editReply(`â ${topClans.error}`);
                const embed = new EmbedBuilder()
                    .setTitle("ð Global Top 5 Clans")
                    .setDescription(topClans.map((clan, i) => `**${i + 1}. ${clan.name}** - ${clan.clanPoints} pts`).join("\n"))
                    .setColor(0x00FF7F);
                return await interaction.editReply({ embeds: [embed] });
            }

            case "poster": {
                const tag = options.getString("tag");
                const warData = await getClanWarData(tag);
                if (warData.error) return await interaction.editReply(`â ${warData.error}`);
                const embed = new EmbedBuilder()
                    .setTitle("ð¡ï¸ Clan War Poster")
                    .addFields(
                        { name: "ð Status", value: warData.state === "inWar" ? "In War" : warData.state, inline: true },
                        { name: "ð Opponent", value: warData.opponent?.name || "N/A", inline: true },
                        { name: "âï¸ Your Clan Wins", value: `${warData.clan?.winCount || 0}`, inline: true },
                        { name: "ð¥ Opponent Wins", value: `${warData.opponent?.winCount || 0}`, inline: true }
                    )
                    .setColor(0x8A2BE2);
                return await interaction.editReply({ embeds: [embed] });
            }

            case "ask": {
                const question = options.getString("question");
                const res = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{ role: "user", content: question }],
                });
                const embed = new EmbedBuilder()
                    .setTitle("ð§  OpenAI Response")
                    .setDescription(res.choices[0].message.content)
                    .setColor(0xCCCCFF);
                return await interaction.editReply({ embeds: [embed] });
            }

            default:
                return await interaction.editReply("â Unknown command.");
        }
    } catch (err) {
        console.error("â Interaction Error:", err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply("â Something went wrong.");
        } else {
            await interaction.reply("â Something went wrong.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);