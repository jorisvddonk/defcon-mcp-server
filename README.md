# DEFCON LLM bot

This is a simple proof of concept bot for [DEFCON](https://store.steampowered.com/app/1520/DEFCON/). It uses LLMs (via [LM Studio](https://lmstudio.ai/)) to parse gamestate and suggest actions.

## Setting up

1. Install DEFCON. Make sure to start it once to load your CD key.
2. Download the [DEFCON AI API](https://defconexpanded.com/api/download-mod/88) and extract v1.57 to your DEFCON installation folder. You may want to rename the AI API .exe to `DEFCON_ai.exe`.
3. Download [LUABOT](https://defconexpanded.com/api/download-mod/93) and extract it to `<defcon installation folder>/AI`; rename the folder so that you have `<defcon installation folder>/AI/luabot/luabot.dll`. Remove `main.lua` from that folder.
4. Git clone this repository into the `luabot` folder.
5. Install [LM Studio](https://lmstudio.ai/) and enable the API Server.
6. `npm ci` in this repository folder.
7. Check `main.lua` and `index.mjs` and possibly rename the file paths. The way that all of this works is that a NodeJS process writes to an "input.txt" file, which the Lua bot reads. The lua bot then writes "output.txt" which is then read by the NodeJS process again. You will have to set the file paths yourself; they're hardcoded to write to `R:\input.txt` and `R:\output.txt`. I recommend writing to a RAMDisk if you can set one up.
8. Start the game via `.\Defcon_ai.exe host nowan nolan nowlan luabot="AI\luabot\main.lua" numplayers=2 territory=0 debug`. Select `AI/luabot/luabot.dll` as the "external bot", and then add an internal AI player as well. The game should start automatically; if it doesn't just ready up to start!
9. Start the LLM via `node index.mjs`.
10. Watch the carnage unfold!
