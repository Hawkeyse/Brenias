// commands/serverrules.js → FINAL WITH REAL CF6 & BF6 (2025 PERFECTION)
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Display the full server rules and info.'),
  async execute(interaction) {
    await interaction.deferReply();
    const color = 0x9B59B6;
    // YOUR REAL SERVER EMOTES (updated IDs)
    const cf = '<:CF6:1423301323746574486>'; // real CF6
    const bf = '<:BF6:1423301397939617864>'; // real BF6
    const divider = '<:D6:1423301251369537679>';
    const top = divider.repeat(15);
    const bottom = divider.repeat(15);
    const send = async (embed) => await interaction.channel.send({ embeds: [embed] });
    // 1. Banner
    await send(new EmbedBuilder().setImage('https://i.imgur.com/vDMF5Jq.jpg').setColor(color));
    // 2. Rules — classic CF6/BF6 style, your exact text
    const rules = [
      `${top}\n\n${cf} **Don’t @everyone**\n${bf} You can’t use @everyone or @here on this server. These tags are only for staff announcements. Using them incorrectly causes unnecessary notifications and bothers other members. If you need help, open a ticket or message staff. Repeated misuse will result in warnings or further action.\n\n${cf} **Always be polite**\n${bf} Everyone should feel safe and welcome here. Insults, harassment, bullying, or trying to start fights are not allowed. Do not bring personal conflicts into the server—use the ticket system so staff can handle it. Depending on severity, punishments may include mutes, kicks, or bans.`,
      `${cf} **No adult content**\n${bf} Absolutely no sexually explicit, pornographic, or adult material is permitted. This includes images, videos, links, roleplay, and even jokes. The server must remain safe for everyone. Violations will result in immediate punishment, usually a ban.\n\n${cf} **No politics or discrimination**\n${bf} Do not discuss politics or religion, and do not make discriminatory comments of any kind. This includes racist, sexist, homophobic, or otherwise offensive jokes, slurs, or remarks. We are here to build community, not division. Breaking this rule may result in warnings or bans.`,
      `${cf} **No scams, exploits, or harmful links**\n${bf} Scam links, phishing attempts, IP grabbers, cheats, or exploits are forbidden. Offenders will be permanently banned without warning to keep members safe.\n\n${cf} **No loud, distorted, or annoying VC sounds**\n${bf} Voice chat should remain comfortable for everyone. Do not play ear-piercing, distorted, or disruptive sounds through mics or soundboards. Repeated violations may result in being muted, kicked from VC, or further punishment.\n\n${cf} **Use English in main chats**\n${bf} English is the primary language of this server. Please use English in all public channels so staff and members can understand. Other languages may be used in private group chats or DMs, but not in public spaces.`,
      `${cf} **Invite friends responsibly**\n${bf} Only use the official invite link when inviting friends. Do not spam unsolicited invites in DMs or other servers. Abusing the invite system will result in restrictions.\n\n${cf} **Don’t pretend to be staff**\n${bf} Only staff members may enforce rules. Do not impersonate admins or moderators. If there is a problem, make a ticket or report it to staff. Impersonation will lead to consequences.\n\n${cf} **No mass mentions**\n${bf} Do not ping groups of users unnecessarily. Spamming or repeatedly tagging people without reason is considered harassment and may result in mutes or bans.\n\n${cf} **No excessive swearing**\n${bf} Mild swearing (such as shit) is tolerated, but heavy profanity, slurs, or suggestive language are not. Keep your language friendly and appropriate. Offenders may receive warnings or mutes.`,
      `${cf} **Don’t steal art**\n${bf} Do not claim or share art as your own if you didn’t make it. Always credit the original artist or source. If you can’t find the artist, at least state where you found it. Repeated violations may lead to content removal and warnings.\n\n${cf} **No animal cruelty content**\n${bf} Posting or promoting animal cruelty is strictly forbidden. Content of this kind will be deleted immediately, and depending on severity, offenders may be banned without warning.\n\n${cf} **Follow Discord’s Terms of Service**\n${bf} All members must follow Discord’s official Terms of Service and Community Guidelines. Users must be at least 13 years old to have a Discord account. Accounts found to be underage will be removed.\n\n${cf} **No spam or forum abuse**\n${bf} Do not flood chats with repeated messages, emojis, or irrelevant content. Forums should not be misused for trolling, off-topic posts, or spamming. Offenders may be muted or kicked.\n\n${cf} **No advertisements outside designated channel**\n${bf} Any form of advertisement is not allowed outside the designated channel. Do not attempt to message our members with advertisements or post advertisements in the wrong channels. We have a designated channel <#717749000299741356> for advertising, and you must meet the requirements before posting there.\n\n${cf} **Use channels correctly**\n${bf} Each channel has a purpose. Keep bot commands in bot channels, memes in meme channels, and discussions relevant to their spaces. Repeated misuse of channels may result in warnings or restricted access.\n\n${bottom}`
    ];
    for (const rule of rules) {
      await send(new EmbedBuilder().setDescription(rule).setColor(color));
    }
    // Other channels & Admins
    await send(new EmbedBuilder().setColor(color).setTitle('Other channels to check out').setDescription('<#747007771345551473>\n<#750802931049169091>\n<#1364738225800745040>\n<#1364036889241321523>'));
    await send(new EmbedBuilder().setColor(color).setTitle('Admins of Culzmac community').setDescription('<@338866244830887948> • <@313112945909301248> • <@417913153456963585> • <@710963394164949044> • <@683747514738147330> • <@1045400374313484419>'));
    // Art Credits — UPDATED: added new ID <@1450808947580600340> for Stickers/Server Icon/Invite BG
    await send(new EmbedBuilder().setColor(color).setTitle('Art Credits').addFields(
      { 
        name: 'Stickers • Server Icon • Invite Background', 
        value: '<@338866244830887948> • <@1450808947580600340>', 
        inline: false 
      },
      { 
        name: 'Server Banner', 
        value: '<@1077302726943326349>', 
        inline: false 
      }
    ));
    // Custom Emojis — UPDATED with your latest list for 338866244830887948, duplicates removed from other creators
    await send(new EmbedBuilder()
      .setColor(color)
      .setTitle('Custom Emojis')
      .setDescription(
        `<@338866244830887948> <:Tempest_Coffee:1350634658840449125> <:Brenias_Heart:1456816178541363353> <:Brenias_Sad:1456815553506443379> <:Brenias_Happy:1456815449260953757> <:Blanco:1161302929500803162> <:BirbBlushing:855912024085102642> <:Blu_HangGlider:1117853052792217671> <:Brenias_Grumpy:1456815381560688773> <:Brenias_Shocked:1456815299171975219> <:FF_Secretary:1117859764983054426> <:Eyelashes:1005536692863778877> <:DerpDove:854765423371354162> <:BruhBirb:854788856719998996> <:Pidove:855963969432846376>\n` +
        `<@1268709947265257522> <:Shocked_Hoopoe:1236481267277758534> <:SickEmu:1237176992307220591> <:Nerdy_Kookaburra:1236479529787199529> <:Bread_Slayer_Shoebill:1236479712566444083>\n` +
        `<@1264137132700733591> <:MoogwithPacifier:1343621700494954587>\n\n` +
        `**StarbucksTaxman** <:PhoenixWithGlasses:1285602293517127681>`
      )
    );
    await interaction.deleteReply();
  },
};