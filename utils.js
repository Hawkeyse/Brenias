// utils.js (Added role fetch safety; voice XP calc)
const levelRoles = {
  5: { name: 'Sparrow〚LVL 5〛', roleId: '1364042144804769813' },
  10: { name: 'Robin〚LVL 10〛', roleId: '1364043352491692052' },
  20: { name: 'Pigeon〚LVL 20〛', roleId: '1364043452421242931' },
  30: { name: 'Duck〚LVL 30〛', roleId: '1364043659934302309' },
  40: { name: 'Kestrel〚LVL 40〛', roleId: '1364043742260101150' },
  50: { name: 'Seagull〚LVL 50〛', roleId: '1364043904726597722' },
  60: { name: 'Macaw〚LVL 60〛', roleId: '1364043967011885096' },
  70: { name: 'Caracara〚LVL 70〛', roleId: '1364044000448876655' },
  80: { name: 'Raven 〚LVL 80〛', roleId: '1364044026696699915' },
  90: { name: 'Heron〚LVL 90〛', roleId: '1364044179273154650' },
  100: { name: 'Eagle〚LVL 100〛', roleId: '1364044204413685821' },
};

// Function to calculate cumulative XP needed to reach a level (0 for level 1)
function getXPForLevel(level) {
  return Math.round(50 * level * (level - 1));
}

// Function to calculate exact level from total XP (quadratic solve)
function getLevelFromXP(xp) {
  if (xp <= 0) return 1;
  return Math.floor((1 + Math.sqrt(1 + (8 * xp / 100))) / 2);
}

// New: Voice XP calculator (5 XP per minute active)
function calculateVoiceXP(joinTime, leaveTime) {
  const activeMs = leaveTime - joinTime;
  return Math.floor(activeMs / (1000 * 60)) * 5;  // 5 XP/min
}

// Enhanced role assignment with fetch safety
async function assignRolesForLevel(member) {
  try {
    const guildId = member.guild.id;
    const userId = member.user.id;
    const User = require('./models/User');
    const user = await User.findOne({ guildId, userId });
    if (!user) return { success: false };

    const currentLevel = getLevelFromXP(user.xp);
    let highestRole = null;
    let highestLevelKey = null;

    // Find highest applicable role (fetch to ensure exists)
    for (const [rewardLevelStr, reward] of Object.entries(levelRoles)) {
      const rewardLevelNum = Number(rewardLevelStr);
      if (currentLevel >= rewardLevelNum) {
        const role = await member.guild.roles.fetch(reward.roleId).catch(() => null);
        if (role && (!highestLevelKey || rewardLevelNum > Number(highestLevelKey))) {
          highestRole = role;
          highestLevelKey = rewardLevelStr;
        }
      }
    }

    // Collect roles to remove: All level roles except the highest
    const rolesToRemove = [];
    for (const [rewardLevelStr, reward] of Object.entries(levelRoles)) {
      if (rewardLevelStr !== highestLevelKey) {
        const role = await member.guild.roles.fetch(reward.roleId).catch(() => null);
        if (role && member.roles.cache.has(role.id)) {
          rolesToRemove.push(role);
        }
      }
    }

    // Apply changes
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
    }
    if (highestRole && !member.roles.cache.has(highestRole.id)) {
      await member.roles.add(highestRole);
      console.log(`Assigned role ${highestRole.name} to ${member.user.tag}`);
    }
    return { success: true };
  } catch (error) {
    console.error(`Error assigning/removing roles for ${member.user.tag}:`, error);
    return { success: false };
  }
}

module.exports = {
  getXPForLevel,
  getLevelFromXP,
  assignRolesForLevel,
  calculateVoiceXP,  // New export
  levelRoles,
};