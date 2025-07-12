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

// === COC Helper Functions ===
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

// === Bot Ready Event ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

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
    console.log("✅ Slash commands registered.");

    // === DAILY MESSAGE AT 4PM UK ===
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
                console.log(`[✅] Daily 4PM UK message sent.`);
            } catch (error) {
                console.error("❌ Error sending 4PM message:", error);
            }
        }
    }, 60 * 1000);
});

// === Slash Commands Handler ===
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        await interaction.deferReply();

        const { commandName, options } = interaction;

        if (commandName === "ping") return interaction.editReply("🏓 Pong!");

        if (commandName === "player") {
            const tag = options.getString("tag");
            const data = await getPlayerInfo(tag);
            return interaction.editReply(data.error ? `❌ ${data.error}` :
                `🏆 **Player Name:** ${data.name}\n🏰 **Town Hall:** ${data.townHallLevel}\n⭐ **Trophies:** ${data.trophies}\n⚔️ **War Stars:** ${data.warStars}\n🎖️ **Clan:** ${data.clan?.name || "No Clan"}\n🛠️ **XP:** ${data.expLevel}`);
        }

        if (commandName === "clan") {
            const tag = options.getString("tag");
            const data = await getClanInfo(tag);
            return interaction.editReply(data.error ? `❌ ${data.error}` :
                `🏰 **Clan Name:** ${data.name}\n🏆 **Level:** ${data.clanLevel}\n🎖️ **Points:** ${data.clanPoints}\n🔥 **Streak:** ${data.warWinStreak}\n⚔️ **Wins:** ${data.warWins}`);
        }

        if (commandName === "leaderboard") {
            const topClans = await getTopClans();
            return interaction.editReply(topClans.error ? `❌ ${topClans.error}` :
                `🏆 **Top Clans:**\n${topClans.map((clan, i) => `${i + 1}. **${clan.name}** - ${clan.clanPoints} pts`).join("\n")}`);
        }

        if (commandName === "ask") {
            try {
                const question = options.getString("question");
                const res = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{ role: "user", content: question }],
                });
                return interaction.editReply(res.choices[0].message.content);
            } catch (err) {
                console.error("OpenAI Error:", err);
                return interaction.editReply("❌ Error processing your request.");
            }
        }

        if (commandName === "roast") {
            const target = options.getString("target") || interaction.user.username;
            return interaction.editReply(await roastUser(target));
        }

        if (commandName === "rps") {
            const choice = options.getString("choice").toLowerCase();
            if (!rpsChoices.includes(choice)) return interaction.editReply("Invalid choice. Choose rock, paper, or scissors.");
            return interaction.editReply(playRps(choice));
        }

        if (commandName === "poster") {
            const tag = options.getString("tag");
            const warData = await getClanWarData(tag);
            return interaction.editReply(warData.error ? `❌ ${warData.error}` :
                `📅 **Status:** ${warData.state === "inWar" ? "In War" : "Not in war"}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
        }

        if (commandName === "help") {
            return interaction.editReply(`**Commands Available:**\n/ping\n/player [tag]\n/clan [tag]\n/leaderboard\n/ask [question]\n/roast [target]\n/rps [choice]\n/poster [tag]\n/remind\n/clans`);
        }

        if (commandName === "remind") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.editReply("❌ You do not have permission.");
            }
            const embed = new EmbedBuilder()
                .setTitle("⏰ Reminder")
                .setDescription("We are still awaiting a response from you. Please respond at your earliest convenience.\n\nLost Family Team")
                .setColor(0xFF0000);
            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === "clans") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.editReply("❌ You do not have permission.");
            }
            const embed = new EmbedBuilder()
                .setTitle("Clan Applications")
                .setDescription(`To apply for a Lost Family clan, please go to <#${ticketsChannelId}> and select application from the ticket dropdown.`)
                .setColor(0x00AE86);
            return interaction.editReply({ embeds: [embed] });
        }

    } catch (err) {
        console.error("❌ Interaction handler error:", err);

        try {
            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ Something went wrong while processing your command.",
                    ephemeral: true,
                });
            }
        } catch (replyErr) {
            console.error("❌ Failed to send fallback interaction reply:", replyErr);
        }
    }
});

// === Start Bot ===
client.login(process.env.DISCORD_TOKEN);