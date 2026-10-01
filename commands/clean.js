// commands/clean.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clean')
    .setDescription('Clean a number of messages in the current channel (optionally from a specific user)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to attempt to delete (max 100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100))
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Only delete messages from this user (optional)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');
    const targetDisplay = targetUser ? `<@${targetUser.id}>` : 'the channel';

    // ─── Phase 1: Target found ───
    const phase1 = new EmbedBuilder()
      .setColor('#5865F2')
      .setDescription(`<a:69863pengumodcheck:1466826898163109990> Target user found ${targetDisplay}`);

    await interaction.editReply({ embeds: [phase1] });
    await new Promise(r => setTimeout(r, 1100));

    // ─── Phase 2: Cleanup initialized ───
    const phase2 = new EmbedBuilder()
      .setColor('#F1C40F')
      .setDescription(`<:83888settingsanimation:1466826894883160250> Cleanup initialized`);

    await interaction.editReply({ embeds: [phase2] });
    await new Promise(r => setTimeout(r, 1300));

    // ─── Phase 3: Removing messages ───
    const phase3 = new EmbedBuilder()
      .setColor('#2ECC71')
      .setDescription(`<a:56834pengumop1:1466826892832407706> Removing **${amount}** messages…`);

    await interaction.editReply({ embeds: [phase3] });

    try {
      // Fetch more than requested to give buffer for filtering
      const fetched = await interaction.channel.messages.fetch({ limit: Math.min(amount + 20, 100) });

      let toDelete = fetched;

      if (targetUser) {
        toDelete = fetched.filter(m => m.author.id === targetUser.id);
      }

      // Discord bulkDelete only allows messages < 14 days old
      const deletable = toDelete.filter(m => 
        Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      const deletedCount = deletable.size;

      if (deletedCount === 0) {
        let reason = 'No messages match the criteria.';
        if (targetUser) reason += '\n→ No recent messages from that user';
        reason += '\n→ All matching messages are older than **14 days** (Discord does not allow bulk deletion of older messages)';

        const failEmbed = new EmbedBuilder()
          .setColor('#E74C3C')
          .setDescription(`<:23646no:some_no_emoji_id> Nothing could be deleted.\n\n${reason}`);

        await interaction.editReply({ embeds: [failEmbed] });

        // Still auto-delete after 5s
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
        return;
      }

      // Perform bulk delete
      await interaction.channel.bulkDelete(deletable, true);

      // ─── Success ───
      await new Promise(r => setTimeout(r, 1600)); // nice dramatic pause

      const successEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setDescription(
          `<:23646yes:1443367106455539876> All done! I cleaned up **${deletedCount}** message${deletedCount === 1 ? '' : 's'} for ${targetDisplay}`
        );

      if (deletedCount < amount) {
        successEmbed.setFooter({ text: `Note: Some messages were older than 14 days and could not be bulk-deleted.` });
      }

      await interaction.editReply({ embeds: [successEmbed] });

      // Auto-remove the reply after 5 seconds
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch {
          // ignore if already gone or expired
        }
      }, 5000);

    } catch (error) {
      console.error('[clean command error]', error);

      let errorMsg = 'An unexpected error occurred while cleaning messages.';
      if (error.code === 50034 || error.message?.includes('older than 2 weeks')) {
        errorMsg = 'Discord prevented deletion — messages are older than 14 days.';
      }

      const errorEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setDescription(`<:23646no:some_no_emoji_id> ${errorMsg}\n\n\`\`\`${error.message.slice(0, 180)}\`\`\``);

      await interaction.editReply({ embeds: [errorEmbed] });

      setTimeout(() => interaction.deleteReply().catch(() => {}), 7000);
    }
  },
};