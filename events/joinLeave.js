// events/welcome.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');

module.exports = (client) => {
  // ─── WELCOME (MEMBER JOIN) ─────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    const welcomeChannel = member.guild.channels.cache.get('1366456828409679892');
    if (!welcomeChannel) {
      console.log('Welcome channel not found');
      return;
    }

    const memberCount = member.guild.memberCount;
    const rulesChannelLink = 'https://discord.com/channels/' + member.guild.id + '/716736324459167775';
    const rolesChannelLink = 'https://discord.com/channels/' + member.guild.id + '/747007771345551473';

    const embed = new EmbedBuilder()
      .setColor(0x57F287)           // welcoming green
      .setAuthor({
        name: `Welcome to Wave Hangout!`,
        iconURL: member.guild.iconURL({ dynamic: true })
      })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setDescription(
        `Hello ${member}! We are thrilled to have you join **Wave Hangout**.\n` +
        `Enjoy your stay!\n\n` +
        `Please take a moment to review our rules and select your roles to get started.`
      )
      .addFields(
        { name: 'Member Count', value: `${memberCount}`, inline: true }
      )
      .setFooter({ text: 'We hope you have fun here!' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Server Rules')
          .setStyle(ButtonStyle.Link)
          .setURL(rulesChannelLink),
        new ButtonBuilder()
          .setLabel('Pick a Role')
          .setStyle(ButtonStyle.Link)
          .setURL(rolesChannelLink)
      );

    await welcomeChannel.send({
      embeds: [embed],
      components: [row],
      content: `${member}`   // pings the new member
    }).catch(console.error);
  });

  // ─── GOODBYE (MEMBER LEAVE) ────────────────────────────────────
  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) return;

    const goodbyeChannel = member.guild.channels.cache.get('1366501278514942063');
    if (!goodbyeChannel) {
      console.log('Goodbye channel not found');
      return;
    }

    const memberCount = member.guild.memberCount;

    const embed = new EmbedBuilder()
      .setColor(0xED4245)           // sad/red leave color
      .setAuthor({
        name: `Goodbye from Wave Hangout!`,
        iconURL: member.guild.iconURL({ dynamic: true })
      })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setDescription(
        `**${member.user.tag}** has left Wave Hangout.\n` +
        `We hope to see you again soon!`
      )
      .addFields(
        { name: 'Member Count', value: `${memberCount}`, inline: true }
      )
      .setFooter({ text: 'Farewell ✧' });

    await goodbyeChannel.send({ embeds: [embed] }).catch(console.error);
  });
};