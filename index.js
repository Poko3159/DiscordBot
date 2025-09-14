Dev bot 

const express = require("express");
const { DateTime } = require("luxon");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");
const OpenAI = require("openai");
const axios = require("axios");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const COC_API_KEY = process.env.COC_API_KEY;
const COC_BASE_URL = "https://api.clashofclans.com/v1";
const ticketsChannelId = process.env.TICKETS_CHANNEL_ID;
const reminderChannelId = process.env.REMINDER_CHANNEL_ID;
const rpsChoices = ["rock", "paper", "scissors"];
let lastReminderMessageId = null;

// === Helper Functions ===
async function getPlayerInfo(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/players/%23${sanitized}`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (err) {
        return { error: "Error fetching player data." };
    }
}

async function getClanInfo(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitized}`, {
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

async function getClanWarData(tag) {
    const sanitized = tag.replace("#", "");
    try {
        const res = await axios.get(`${COC_BASE_URL}/clans/%23${sanitized}/currentwar`, {
            headers: { Authorization: `Bearer ${COC_API_KEY}` }
        });
        return res.data;
    } catch (err) {
        return { error: "Error fetching war data." };
    }
}

function playRps(choice) {
    const bot = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (choice === bot) return `It's a tie! We both chose ${bot}.`;
    if ((choice === "rock" && bot === "scissors") || (choice === "paper" && bot === "rock") || (choice === "scissors" && bot === "paper")) {
        return `You win! I chose ${bot}.`;
    }
    return `I win! I chose ${bot}.`;
}

async function roastUser(target) {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a humorous, sarcastic AI that generates funny but non-offensive roasts." },
                { role: "user", content: `Roast ${target} in a funny but lighthearted way.` }
            ]
        });
        return res.choices[0].message.content;
    } catch (err) {
        return "Couldn't roast them this time!";
    }
}

// === Reminder Logic ===
async function cleanupOldReminders(channel) {
    if (!channel?.isTextBased()) return;
    try {
        const fetched = await channel.messages.fetch({ limit: 50 });
        const toDelete = fetched.filter(m =>
            m.author?.id === client.user?.id &&
            m.embeds?.length &&
            m.embeds[0].title?.includes("Lost Family")
        ).first(5);
        for (const msg of toDelete) {
            if (msg.deletable) await msg.delete().catch(() => {});
        }
    } catch (err) {
        console.warn("Reminder cleanup error:", err);
    }
}

async function postApplicationReminder(channel) {
    if (!channel || !channel.isTextBased()) return;
    await cleanupOldReminders(channel);

    const now = DateTime.now().setZone("Europe/London");
    const nextReminder = now.plus({ hours: 6 - (now.hour % 6), minutes: -now.minute, seconds: -now.second });
    const timeLeft = nextReminder.diff(now, ["hours", "minutes"]).toObject();
    const countdownText = `${Math.floor(timeLeft.hours)}h ${Math.floor(timeLeft.minutes)}m`;

    const ticketUrl = `https://discord.com/channels/${channel.guildId}/${ticketsChannelId}`;
    const embed = new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle("📢 Join a Lost Family Clan!")
        .setDescription(`Looking to join a Lost Family clan?\n\nHead over to <#${ticketsChannelId}> and select **Clan Application** from the ticket dropdown.`)
        .addFields({ name: "⏳ Time Until Next Reminder", value: countdownText, inline: true })
        .setFooter({ text: "Lost Family Network | Applications open 24/7" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("📝 Apply Now")
            .setStyle(ButtonStyle.Link)
            .setURL(ticketUrl)
    );

    try {
        const sent = await channel.send({ embeds: [embed], components: [row] });
        lastReminderMessageId = sent.id;
    } catch (err) {
        console.error("Reminder post error:", err);
    }
}

// === Bot Ready and Command Registration ===
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}!`);

    const commands = [
        new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is alive."),
        new SlashCommandBuilder().setName("help").setDescription("List all available commands."),
        new SlashCommandBuilder().setName("player").setDescription("Get info about a player.")
            .addStringOption(opt => opt.setName("tag").setDescription("Player tag").setRequired(true)),
        new SlashCommandBuilder().setName("clan").setDescription("Get info about a clan.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Get top 5 global clans."),
        new SlashCommandBuilder().setName("ask").setDescription("Ask OpenAI anything.")
            .addStringOption(opt => opt.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("roast").setDescription("Roast a user.")
            .addStringOption(opt => opt.setName("target").setDescription("Target to roast")),
        new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors.")
            .addStringOption(opt => opt.setName("choice").setDescription("rock, paper, or scissors").setRequired(true)),
        new SlashCommandBuilder().setName("poster").setDescription("Get current war data.")
            .addStringOption(opt => opt.setName("tag").setDescription("Clan tag").setRequired(true)),
        new SlashCommandBuilder().setName("remind").setDescription("Send a reminder message."),
        new SlashCommandBuilder().setName("clans").setDescription("How to apply for a Lost Family clan.")
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered.");
});

// === Interaction Handler ===
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    try {
        if (commandName === "ping") {
            await interaction.reply("🏓 Pong! I'm alive.");
        } else if (commandName === "help") {
            await interaction.reply("Available commands: /ping /help /player /clan /leaderboard /ask /roast /rps /poster /remind /clans");
         } else if (commandName === "player") {
            const tag = options.getString("tag");
            const info = await getPlayerInfo(tag);
            if (info.error) return await interaction.reply(info.error);
            await interaction.reply(`🏅 Player: ${info.name}\n🏰 Clan: ${info.clan?.name || "None"}\n🏆 Trophies: ${info.trophies}`);
        } else if (commandName === "clan") {
            const tag = options.getString("tag");
            const info = await getClanInfo(tag);
            if (info.error) return await interaction.reply(info.error);
            await interaction.reply(`🏰 Clan: ${info.name}\n📊 Members: ${info.members}\n🏆 Points: ${info.clanPoints}`);
        } else if (commandName === "leaderboard") {
            const clans = await getTopClans();
            if (clans.error) return await interaction.reply(clans.error);
            const list = clans.map((c, i) => `${i + 1}. ${c.name} – ${c.clanPoints} pts`).join("\n");
            await interaction.reply(`🌍 Top 5 Global Clans:\n${list}`);
        } else if (commandName === "ask") {
            const question = options.getString("question");
            const res = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            await interaction.reply(res.choices[0].message.content);
        } else if (commandName === "roast") {
            const target = options.getString("target") || "you";
            const roast = await roastUser(target);
            await interaction.reply(roast);
        } else if (commandName === "rps") {
            const choice = options.getString("choice");
            const result = playRps(choice.toLowerCase());
            await interaction.reply(result);
        } else if (commandName === "poster") {
            const tag = options.getString("tag");
            const war = await getClanWarData(tag);
            if (war.error) return await interaction.reply(war.error);
            await interaction.reply(`⚔️ War Status: ${war.state}\nStars: ${war.clan.stars} vs ${war.opponent.stars}`);
        } else if (commandName === "remind") {
            const channel = await client.channels.fetch(reminderChannelId);
            await postApplicationReminder(channel);
            await interaction.reply("✅ Reminder sent.");
        } else if (commandName === "clans") {
            await interaction.reply(`📢 To apply for a Lost Family clan, head to <#${ticketsChannelId}> and open a Clan Application ticket.`);
        }
    } catch (err) {
        console.error("Interaction error:", err);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "❌ Something went wrong.", ephemeral: true });
        } else {
            await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
        }
    }
});

// === Start Bot ===
client.login(process.env.DISCORD_TOKEN);