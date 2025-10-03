// safe-interaction.js
function _toFlags(opts = {}) {
  if ('ephemeral' in opts) {
    const ephemeral = !!opts.ephemeral;
    delete opts.ephemeral;
    if (ephemeral) opts.flags = 64;
  }
  return opts;
}

async function safeDefer(interaction, options = {}) {
  try {
    if (!interaction || typeof interaction.isRepliable !== 'function') return false;
    if (interaction.deferred || interaction.replied) return true;
    await interaction.deferReply(_toFlags(options));
    return true;
  } catch (err) {
    if (err?.rawError?.code === 10062) return false;
    console.error('safeDefer unexpected error', err);
    throw err;
  }
}

async function safeReplyOrFollow(interaction, options = {}) {
  try {
    if (!interaction || typeof interaction.isRepliable !== 'function') return;
    options = _toFlags(options);
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp(options);
    } else {
      return await interaction.reply(options);
    }
  } catch (err) {
    const code = err?.rawError?.code ?? err?.code;
    if (code === 10062) {
      console.warn('safeReplyOrFollow: Unknown interaction (token expired) - ignoring');
      return;
    }
    if (code === 40060) {
      console.warn('safeReplyOrFollow: Interaction already acknowledged - ignoring');
      return;
    }
    throw err;
  }
}

async function safeEdit(interaction, options = {}) {
  try {
    if (!interaction) return;
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(_toFlags(options));
    }
    return await safeReplyOrFollow(interaction, options);
  } catch (err) {
    const code = err?.rawError?.code ?? err?.code;
    if (code === 10062 || code === 40060) {
      console.warn('safeEdit: interaction token issue - ignoring');
      return;
    }
    throw err;
  }
}

module.exports = { safeDefer, safeReplyOrFollow, safeEdit };