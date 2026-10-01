// commands/profile.js
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const canvafy = require('canvafy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show profile card with custom activity')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to show profile for (optional)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    // Get target user (mentioned or command user)
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Fetch member to get accurate guild data
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    try {
      const profile = await new canvafy.Profile()
        .setUser(targetUser.id)                    // Important: Use setUser with ID
        .setBorder("#f0f0f0")
        .setActivity({
          activity: {
            name: 'Visual Studio Code',
            type: 0, // Playing
            url: null,
            details: '📝 In canvafy ❓ 0 problems found',
            state: 'Working on package.json:45:5',
            applicationId: '810516608442695700',
            party: null,
            assets: {
              largeText: '📝 Editing a NPM',
              smallText: '❓ Visual Studio Code',
              largeImage: 'mp:external/CPFiq3MlvnvOKJSW6pUeZ7gfOdfcrLPtGK9dT3LrsCo/https/raw.githubusercontent.com/LeonardSSH/vscord/main/assets/icons/npm.png',
              smallImage: 'mp:external/Joitre7BBxO-F2IaS7R300AaAcixAvPu3WD1YchRgdc/https/raw.githubusercontent.com/LeonardSSH/vscord/main/assets/icons/vscode.png'
            }
          },
          largeImage: "https://raw.githubusercontent.com/LeonardSSH/vscord/main/assets/icons/js.png"
        })
        .build();

      const attachment = new AttachmentBuilder(profile, { 
        name: `profile-${targetUser.id}.png` 
      });

      await interaction.editReply({
        content: `📋 **${targetUser.tag}'s Profile**`,
        files: [attachment]
      });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ 
        content: '❌ Failed to generate profile card.', 
        ephemeral: true 
      });
    }
  },
};