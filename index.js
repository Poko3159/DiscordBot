client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;

    const args = msg.content.split(" ");
    const command = args[0].toLowerCase();

    // Help command - Shows available commands
    if (command === "!help") {
        return msg.reply(`
Here are the available commands:

1. **!ping** - Check if the bot is online and responsive.
2. **!player [playerTag]** - Get information about a player.
3. **!clan [clanTag]** - Get information about a clan.
4. **!leaderboard** - Show the top 5 global clans.
5. **!ask [question]** - Ask the bot a question, and it will respond.
6. **!roast [username]** - Get a funny roast of a user (or yourself if no username is provided).
7. **!rps [rock/paper/scissors]** - Play a game of Rock, Paper, Scissors.
8. **!poster [clanTag]** - Get current war information about a clan.

Type `!commandName` to use any of the above commands.

Note: Replace `[playerTag]` and `[clanTag]` with valid tags (e.g., `#ABC123`).
        `);
    }

    if (command === "!ping") {
        return msg.reply("🏓 Pong! The bot is online and responsive.");
    }

    if (command === "!player") {
        if (!args[1]) return msg.reply("Please provide a player tag.");
        const playerData = await getPlayerInfo(args[1]);
        if (playerData.error) return msg.reply(`❌ Error: ${playerData.error}`);
        return msg.reply(`🏆 **Player Name:** ${playerData.name}\n🏰 **Town Hall Level:** ${playerData.townHallLevel}\n⭐ **Trophies:** ${playerData.trophies}\n⚔️ **War Stars:** ${playerData.warStars}\n🎖️ **Clan:** ${playerData.clan ? playerData.clan.name : "No Clan"}\n🛠️ **Experience Level:** ${playerData.expLevel}`);
    }

    if (command === "!clan") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const clanData = await getClanInfo(args[1]);
        if (clanData.error) return msg.reply(`❌ Error: ${clanData.error}`);
        return msg.reply(`🏰 **Clan Name:** ${clanData.name}\n🏆 **Clan Level:** ${clanData.clanLevel}\n🎖️ **Clan Points:** ${clanData.clanPoints}\n🔥 **War Win Streak:** ${clanData.warWinStreak}\n⚔️ **War Wins:** ${clanData.warWins}`);
    }

    if (command === "!ask") {
        if (args.length < 2) return msg.reply("Please provide a question.");
        const question = args.slice(1).join(" ");
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: question }]
            });
            return msg.reply(response.choices[0].message.content);
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return msg.reply("❌ Error: Unable to process your request.");
        }
    }

    if (command === "!roast") {
        const target = args[1] ? args[1] : msg.author.username;
        const roast = await roastUser(target);
        return msg.reply(roast);
    }

    if (command === "!rps") {
        if (args.length < 2) return msg.reply("Please choose rock, paper, or scissors.");
        const userChoice = args[1].toLowerCase();
        if (!rpsChoices.includes(userChoice)) return msg.reply("Invalid choice! Choose rock, paper, or scissors.");
        const result = playRps(userChoice);
        return msg.reply(result);
    }

    if (command === "!leaderboard") {
        const topClans = await getTopClans();
        if (topClans.error) return msg.reply(`❌ Error: ${topClans.error}`);
        const leaderboard = topClans.map((clan, index) => `${index + 1}. **${clan.name}** - ${clan.clanPoints} points`).join("\n");
        return msg.reply(`🏆 **Top 5 Global Clans:**\n${leaderboard}`);
    }

    if (command === "!poster") {
        if (!args[1]) return msg.reply("Please provide a clan tag.");
        const clanTag = args[1];
        const warData = await getClanWarData(clanTag);
        if (warData.error) return msg.reply(`❌ Error: ${warData.error}`);
        
        const warStatus = warData.state === "inWar" ? "Currently at War" : "Not in a war right now";
        return msg.reply(`📅 **Clan War Status:** ${warStatus}\n🛡️ **Opponent:** ${warData.opponent.name}\n⚔️ **Clan Wins:** ${warData.clan.winCount}\n🔥 **Opponent Wins:** ${warData.opponent.winCount}`);
    }

    return msg.reply("Invalid command. Use `!help` for a list of available commands.");
});