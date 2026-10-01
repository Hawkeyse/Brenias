// events/halloweenBossAttack.js
// Handles clicks on the ⚔️ Attack button posted with an active Halloween Boss.
const { Events } = require('discord.js');
const HalloweenBoss = require('../models/HalloweenBoss');
const {
  ATTACK_COOLDOWN_MS,
  PARTICIPATION_REWARD,
  DAMAGE_TIERS,
  rollDamage,
  buildBossEmbed,
  buildAttackRow,
  finishBoss,
} = require('../utils/halloweenBoss');
const { addHalloweenPoints } = require('../utils/halloweenPoints');
const { logBossAttack } = require('../utils/halloweenLog');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');

// Guards against a user's double-click being processed twice before the
// first click's DB round-trip finishes. Not a substitute for the real
// 30-minute cooldown below — just prevents a race on rapid double-taps.
const processing = new Set();

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'halloween-boss-attack') return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const lockKey = `${guildId}-${userId}`;

    if (processing.has(lockKey)) {
      return interaction.reply({ embeds: [simpleEmbed('⏳ Still processing your last attack, hang on!', COLORS.warning)], ephemeral: true }).catch(() => {});
    }
    processing.add(lockKey);

    try {
      await interaction.deferReply({ ephemeral: true });

      const boss = await HalloweenBoss.findOne({ guildId, active: true });
      if (!boss || boss.currentHP <= 0) {
        return interaction.editReply({ embeds: [simpleEmbed("There's no active Boss fight right now.", COLORS.info)] });
      }

      let participant = boss.participants.find(p => p.userId === userId);

      if (participant?.lastAttackAt) {
        const nextAvailable = participant.lastAttackAt.getTime() + ATTACK_COOLDOWN_MS;
        if (Date.now() < nextAvailable) {
          const ts = Math.floor(nextAvailable / 1000);
          return interaction.editReply({
            embeds: [simpleEmbed(`🕒 You've already attacked recently — you can attack again <t:${ts}:R>.`, COLORS.warning)]
          });
        }
      }

      const isFirstAttack = !participant || participant.attackCount === 0;
      const attack = rollDamage(boss.maxHP);
      const damage = Math.min(boss.currentHP, attack.damage);
      const { isCrit } = attack;
      const prevDamage = participant ? participant.damage : 0;
      const newTotal = prevDamage + damage;
      const alreadyClaimed = participant ? participant.tiersClaimed : [];
      const tiersCrossed = DAMAGE_TIERS.filter(t => newTotal >= t.min && !alreadyClaimed.includes(t.min));

      if (!participant) {
        boss.participants.push({ userId, damage: 0, attackCount: 0, tiersClaimed: [] });
        participant = boss.participants[boss.participants.length - 1];
      }

      participant.damage += damage;
      participant.attackCount += 1;
      participant.lastAttackAt = new Date();
      tiersCrossed.forEach(t => participant.tiersClaimed.push(t.min));

      boss.currentHP = Math.max(0, boss.currentHP - damage);
      await boss.save();

      const tierBonus = tiersCrossed.reduce((sum, t) => sum + t.bonus, 0);
      const pointsEarned = tierBonus + (isFirstAttack ? PARTICIPATION_REWARD : 0);
      if (pointsEarned > 0) {
        await addHalloweenPoints(guildId, userId, pointsEarned);
      }

      const bossDefeated = boss.currentHP <= 0;

      await logBossAttack(interaction.client, {
        userId,
        bossName: boss.name,
        damage,
        isCrit,
        hpRemaining: boss.currentHP,
        maxHP: boss.maxHP,
      });

      // Only touch the public message here if the fight is still going —
      // if it just ended, finishBoss() below handles the final edit
      // (defeated title, disabled button) so we don't double-edit it.
      if (!bossDefeated) {
        try {
          const channel = await interaction.client.channels.fetch(boss.channelId);
          const message = boss.messageId ? await channel.messages.fetch(boss.messageId) : null;
          if (message) {
            await message.edit({ embeds: [buildBossEmbed(boss)], components: [buildAttackRow(false)] });
          }
        } catch (err) {
          console.error('[halloweenBossAttack] Failed to update boss message:', err.message);
        }
      }

      let summaryText = `${isCrit ? '💥 **CRITICAL HIT!** ' : ''}⚔️ You dealt **${damage.toLocaleString()}** damage!\n` +
        `Boss HP: **${Math.max(0, boss.currentHP).toLocaleString()} / ${boss.maxHP.toLocaleString()}**`;

      if (pointsEarned > 0) {
        summaryText += `\n🎃 +${pointsEarned.toLocaleString()} Halloween Points earned!`;
      }
      if (bossDefeated) {
        summaryText += `\n\n💀 **You landed the finishing blow!** The boss has been defeated — check the leaderboard channel for final rewards.`;
      }

      await interaction.editReply({ embeds: [simpleEmbed(summaryText, bossDefeated ? COLORS.success : COLORS.info)] });

      if (bossDefeated) {
        await finishBoss(interaction.client, boss);
      }
    } catch (err) {
      console.error('[halloweenBossAttack] error:', err);
      await interaction.editReply({ embeds: [simpleEmbed('❌ Something went wrong processing your attack — try again.', COLORS.error)] }).catch(() => {});
    } finally {
      processing.delete(lockKey);
    }
  });

  console.log('[halloweenBossAttack] Ready – listening for Boss attack clicks');
};
