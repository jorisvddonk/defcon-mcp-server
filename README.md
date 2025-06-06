# DEFCON MCP Server

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server for [DEFCON](https://store.steampowered.com/app/1520/DEFCON/). Because AI needs to be able to play GLOBAL THERMONUCLEAR WAR.

## Setting up

1. Install DEFCON. Make sure to start it once to load your CD key.
2. Download the [DEFCON AI API](https://defconexpanded.com/api/download-mod/88) and extract v1.57 to your DEFCON installation folder. You may want to rename the AI API .exe to `DEFCON_ai.exe`.
3. Download [LUABOT](https://defconexpanded.com/api/download-mod/93) and extract it to `<defcon installation folder>/AI`; rename the folder so that you have `<defcon installation folder>/AI/luabot/luabot.dll`.
4. Git clone this repository into the `luabot` folder.
5. Check `main.lua` and possibly rename the file paths. The MCP server writes to an "input.txt" file, which the Lua bot reads. The lua bot then writes "output.txt" which is read by the MCP server. You will have to set the file paths yourself; they're hardcoded to write to `R:\input.txt` and `R:\output.txt`. A RAMDisk is recommended if you can set one up.
6. Install dependencies with `npm ci` in this repository folder.
7. Start the game via `.\Defcon_ai.exe host nowan nolan nowlan luabot="AI\luabot\main.lua" numplayers=2 territory=0 debug`. Select `AI/luabot/luabot.dll` as the "external bot", and then add an internal AI player as well. The game should start automatically; if it doesn't just ready up to start!
8. Configure your MCP-enabled LLM interface to start the MCP server via `npm run start` (for stdio transport) or `npm run start:http` (for HTTP transport).
9. Watch the carnage unfold!

## Available MCP Tools

The MCP server provides the following tools:

- `debug-log`: Send a debug message to the game log
- `send-chat`: Send a chat message to opponents
- `place-structure`: Place a structure (RadarStation, Silo, or AirBase) at specified coordinates
- `place-fleet`: Place a fleet of ships at specified coordinates
- `move-fleet`: Move a fleet to specified coordinates
- `whiteboard-draw`: Draw a line on the whiteboard
- `whiteboard-clear`: Clear all lines from the whiteboard
- `launch-nuke`: Launch a nuclear missile from a silo to target coordinates
- `set-silo-defensive`: Set a silo to defensive mode
- `get-command-results`: Retrieve results of previously executed commands
- `get-game-state`: Get the latest game state information
- `generate-ai-response`: Generate an AI response based on the current game state

## Available MCP Resources

The MCP server provides the following resources:

- `defcon://game-state`: Get the current game state
- `defcon://level`: Get the current DEFCON level

## Available MCP Prompts

The MCP server provides the following prompts:

- `analyze-game-state`: Analyze the current game state and suggest optimal moves
- `suggest-structure-placement`: Suggest optimal locations for structure placement
- `suggest-nuke-targets`: Suggest optimal targets for nuclear strikes