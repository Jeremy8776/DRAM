/**
 * Generated skill onboarding policy map derived from bundled SKILL.md metadata.
 * Do not hand-edit large sections; regenerate from resources/engine skills metadata.
 */

export type SkillSetupPath = 'direct' | 'in-app-config' | 'native-installer' | 'wsl-homebrew' | 'manual';

export type SkillOnboardingPolicy = {
  id: string;
  name: string;
  path: string;
  bins: string[];
  env: string[];
  config: string[];
  installers: string[];
  os: string[];
  windows: {
    setupPath: SkillSetupPath;
    requiresWslHomebrew: boolean;
    toolBootstrap: string[];
  };
};

const POLICIES: Record<string, SkillOnboardingPolicy> = {
  "1password": {"id":"1password","name":"1password","path":"skills/1password/SKILL.md","bins":["op"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "apple-notes": {"id":"apple-notes","name":"apple-notes","path":"skills/apple-notes/SKILL.md","bins":["memo"],"env":[],"config":[],"installers":["brew"],"os":["darwin"],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "apple-reminders": {"id":"apple-reminders","name":"apple-reminders","path":"skills/apple-reminders/SKILL.md","bins":["remindctl"],"env":[],"config":[],"installers":["brew"],"os":["darwin"],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "bear-notes": {"id":"bear-notes","name":"bear-notes","path":"skills/bear-notes/SKILL.md","bins":["grizzly"],"env":[],"config":[],"installers":["go"],"os":["darwin"],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "blogwatcher": {"id":"blogwatcher","name":"blogwatcher","path":"skills/blogwatcher/SKILL.md","bins":["blogwatcher"],"env":[],"config":[],"installers":["go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "blucli": {"id":"blucli","name":"blucli","path":"skills/blucli/SKILL.md","bins":["blu"],"env":[],"config":[],"installers":["go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "bluebubbles": {"id":"bluebubbles","name":"bluebubbles","path":"skills/bluebubbles/SKILL.md","bins":[],"env":[],"config":["channels.bluebubbles"],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "camsnap": {"id":"camsnap","name":"camsnap","path":"skills/camsnap/SKILL.md","bins":["camsnap"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "canvas": {"id":"canvas","name":"canvas","path":"skills/canvas/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "clawhub": {"id":"clawhub","name":"clawhub","path":"skills/clawhub/SKILL.md","bins":["clawhub"],"env":[],"config":[],"installers":["node"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["node"]}},
  "coding-agent": {"id":"coding-agent","name":"coding-agent","path":"skills/coding-agent/SKILL.md","bins":["claude","codex","opencode","pi"],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"manual","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "discord": {"id":"discord","name":"discord","path":"skills/discord/SKILL.md","bins":[],"env":[],"config":["channels.discord"],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "eightctl": {"id":"eightctl","name":"eightctl","path":"skills/eightctl/SKILL.md","bins":["eightctl"],"env":[],"config":[],"installers":["go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "feishu-doc": {"id":"feishu-doc","name":"feishu-doc","path":"extensions/feishu/skills/feishu-doc/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "feishu-drive": {"id":"feishu-drive","name":"feishu-drive","path":"extensions/feishu/skills/feishu-drive/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "feishu-perm": {"id":"feishu-perm","name":"feishu-perm","path":"extensions/feishu/skills/feishu-perm/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "feishu-wiki": {"id":"feishu-wiki","name":"feishu-wiki","path":"extensions/feishu/skills/feishu-wiki/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "food-order": {"id":"food-order","name":"food-order","path":"skills/food-order/SKILL.md","bins":["ordercli"],"env":[],"config":[],"installers":["go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "gemini": {"id":"gemini","name":"gemini","path":"skills/gemini/SKILL.md","bins":["gemini"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "gifgrep": {"id":"gifgrep","name":"gifgrep","path":"skills/gifgrep/SKILL.md","bins":["gifgrep"],"env":[],"config":[],"installers":["brew","go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "github": {"id":"github","name":"github","path":"skills/github/SKILL.md","bins":["gh"],"env":[],"config":[],"installers":["brew","apt"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":["gh"]}},
  "gog": {"id":"gog","name":"gog","path":"skills/gog/SKILL.md","bins":["gog"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "goplaces": {"id":"goplaces","name":"goplaces","path":"skills/goplaces/SKILL.md","bins":["goplaces"],"env":["GOOGLE_PLACES_API_KEY"],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "healthcheck": {"id":"healthcheck","name":"healthcheck","path":"skills/healthcheck/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "himalaya": {"id":"himalaya","name":"himalaya","path":"skills/himalaya/SKILL.md","bins":["himalaya"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "imsg": {"id":"imsg","name":"imsg","path":"skills/imsg/SKILL.md","bins":["imsg"],"env":[],"config":[],"installers":["brew"],"os":["darwin"],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "lobster": {"id":"lobster","name":"lobster","path":"extensions/lobster/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "local-places": {"id":"local-places","name":"local-places","path":"skills/local-places/SKILL.md","bins":["uv"],"env":["GOOGLE_PLACES_API_KEY"],"config":[],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":["uv"]}},
  "mcporter": {"id":"mcporter","name":"mcporter","path":"skills/mcporter/SKILL.md","bins":["mcporter"],"env":[],"config":[],"installers":["node"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["node"]}},
  "model-usage": {"id":"model-usage","name":"model-usage","path":"skills/model-usage/SKILL.md","bins":["codexbar"],"env":[],"config":[],"installers":["brew-cask","brew"],"os":["darwin"],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "nano-banana-pro": {"id":"nano-banana-pro","name":"nano-banana-pro","path":"skills/nano-banana-pro/SKILL.md","bins":["uv"],"env":["GEMINI_API_KEY"],"config":[],"installers":["uv-brew","brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":["uv"]}},
  "nano-pdf": {"id":"nano-pdf","name":"nano-pdf","path":"skills/nano-pdf/SKILL.md","bins":["nano-pdf"],"env":[],"config":[],"installers":["uv"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["uv"]}},
  "notion": {"id":"notion","name":"notion","path":"skills/notion/SKILL.md","bins":[],"env":["NOTION_API_KEY"],"config":[],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "obsidian": {"id":"obsidian","name":"obsidian","path":"skills/obsidian/SKILL.md","bins":["obsidian-cli"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "openai-image-gen": {"id":"openai-image-gen","name":"openai-image-gen","path":"skills/openai-image-gen/SKILL.md","bins":["python3"],"env":["OPENAI_API_KEY"],"config":[],"installers":["python-brew","brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":["python"]}},
  "openai-whisper": {"id":"openai-whisper","name":"openai-whisper","path":"skills/openai-whisper/SKILL.md","bins":["whisper"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "openai-whisper-api": {"id":"openai-whisper-api","name":"openai-whisper-api","path":"skills/openai-whisper-api/SKILL.md","bins":["curl"],"env":["OPENAI_API_KEY"],"config":[],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":["curl"]}},
  "openhue": {"id":"openhue","name":"openhue","path":"skills/openhue/SKILL.md","bins":["openhue"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "oracle": {"id":"oracle","name":"oracle","path":"skills/oracle/SKILL.md","bins":["oracle"],"env":[],"config":[],"installers":["node"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["node"]}},
  "ordercli": {"id":"ordercli","name":"ordercli","path":"skills/ordercli/SKILL.md","bins":["ordercli"],"env":[],"config":[],"installers":["brew","go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "peekaboo": {"id":"peekaboo","name":"peekaboo","path":"skills/peekaboo/SKILL.md","bins":["peekaboo"],"env":[],"config":[],"installers":["brew"],"os":["darwin"],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "prose": {"id":"prose","name":"prose","path":"extensions/open-prose/skills/prose/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "sag": {"id":"sag","name":"sag","path":"skills/sag/SKILL.md","bins":["sag"],"env":["ELEVENLABS_API_KEY"],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "session-logs": {"id":"session-logs","name":"session-logs","path":"skills/session-logs/SKILL.md","bins":["jq","rg"],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"manual","requiresWslHomebrew":false,"toolBootstrap":["jq","rg"]}},
  "sherpa-onnx-tts": {"id":"sherpa-onnx-tts","name":"sherpa-onnx-tts","path":"skills/sherpa-onnx-tts/SKILL.md","bins":[],"env":["SHERPA_ONNX_RUNTIME_DIR","SHERPA_ONNX_MODEL_DIR"],"config":[],"installers":["download-runtime-macos","download","download-runtime-linux-x64","download-runtime-win-x64","download-model-lessac"],"os":["darwin","linux","win32"],"windows":{"setupPath":"manual","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "skill-creator": {"id":"skill-creator","name":"skill-creator","path":"skills/skill-creator/SKILL.md","bins":[],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"direct","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "slack": {"id":"slack","name":"slack","path":"skills/slack/SKILL.md","bins":[],"env":[],"config":["channels.slack"],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "songsee": {"id":"songsee","name":"songsee","path":"skills/songsee/SKILL.md","bins":["songsee"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "sonoscli": {"id":"sonoscli","name":"sonoscli","path":"skills/sonoscli/SKILL.md","bins":["sonos"],"env":[],"config":[],"installers":["go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "spotify-player": {"id":"spotify-player","name":"spotify-player","path":"skills/spotify-player/SKILL.md","bins":["spogo","spotify_player"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "summarize": {"id":"summarize","name":"summarize","path":"skills/summarize/SKILL.md","bins":["summarize"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":[]}},
  "things-mac": {"id":"things-mac","name":"things-mac","path":"skills/things-mac/SKILL.md","bins":["things"],"env":[],"config":[],"installers":["go"],"os":["darwin"],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "tmux": {"id":"tmux","name":"tmux","path":"skills/tmux/SKILL.md","bins":["tmux"],"env":[],"config":[],"installers":[],"os":["darwin","linux"],"windows":{"setupPath":"manual","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "trello": {"id":"trello","name":"trello","path":"skills/trello/SKILL.md","bins":["jq"],"env":["TRELLO_API_KEY","TRELLO_TOKEN"],"config":[],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":["jq"]}},
  "video-frames": {"id":"video-frames","name":"video-frames","path":"skills/video-frames/SKILL.md","bins":["ffmpeg"],"env":[],"config":[],"installers":["brew"],"os":[],"windows":{"setupPath":"wsl-homebrew","requiresWslHomebrew":true,"toolBootstrap":["ffmpeg"]}},
  "voice-call": {"id":"voice-call","name":"voice-call","path":"skills/voice-call/SKILL.md","bins":[],"env":[],"config":["plugins.entries.voice-call.enabled"],"installers":[],"os":[],"windows":{"setupPath":"in-app-config","requiresWslHomebrew":false,"toolBootstrap":[]}},
  "wacli": {"id":"wacli","name":"wacli","path":"skills/wacli/SKILL.md","bins":["wacli"],"env":[],"config":[],"installers":["brew","go"],"os":[],"windows":{"setupPath":"native-installer","requiresWslHomebrew":false,"toolBootstrap":["go"]}},
  "weather": {"id":"weather","name":"weather","path":"skills/weather/SKILL.md","bins":["curl"],"env":[],"config":[],"installers":[],"os":[],"windows":{"setupPath":"manual","requiresWslHomebrew":false,"toolBootstrap":["curl"]}},
};

function normalizeSkillId(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function getSkillOnboardingPolicy(skillLike: any): SkillOnboardingPolicy | null {
  const candidates = [skillLike?.id, skillLike?.skillKey, skillLike?.name];
  for (const candidate of candidates) {
    const key = normalizeSkillId(candidate);
    if (key && POLICIES[key]) return POLICIES[key];
  }
  return null;
}

export function listSkillOnboardingPolicies(): SkillOnboardingPolicy[] {
  return Object.values(POLICIES);
}
