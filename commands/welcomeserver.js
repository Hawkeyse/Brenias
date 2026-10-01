const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcomeserver')
        .setDescription('Display welcome information for the server.'),
    async execute(interaction) {
        const divider = '<:D6:1423301251369537679>'; // Reuse from rules if applicable, or remove if not needed
        const topDivider = divider; // Just one emote as requested

        const fullWelcomeText = `
${topDivider}

Please be sure to read the **RULES**. We want everyone to be safe and have a good time! 

<:LittleBean:ID> **Invite your friends with this link!** > [https://discord.gg/Gc4jXZuBEt](https://discord.gg/Gc4jXZuBEt)
        `.trim();

        // Defer the reply to acknowledge the command
        await interaction.deferReply();

        // Prepare the embeds array
        const embeds = [];

        // Banner embed first
        const bannerEmbed = new EmbedBuilder()
            .setImage('https://i.imgur.com/YDDg8Uf.jpg') // Assuming .jpg extension; adjust if needed
            .setColor(0x9B59B6); // Reuse color from rules for consistency

        embeds.push(bannerEmbed);

        // Welcome embed
        const welcomeEmbed = new EmbedBuilder()
            .setDescription(fullWelcomeText)
            .setColor(0x9B59B6)
            .setFooter({ text: 'Welcome to Wave Hangout!' });

        embeds.push(welcomeEmbed);

        // Send the embeds as a separate message in the channel (not as a reply)
        await interaction.channel.send({ embeds });

        // Delete the deferred reply to hide it
        await interaction.deleteReply();
    },
};