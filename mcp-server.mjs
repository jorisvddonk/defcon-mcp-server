import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import fs from "fs";
import { z } from "zod";
import { randomUUID } from "crypto";
import os from "os";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Constants for file paths - platform specific
const isWindows = os.platform() === 'win32';
const INPUTFILE = isWindows ? "R:\\input.txt" : "/mnt/r/input.txt";
const OUTPUTFILE = isWindows ? "R:\\output.txt" : "/mnt/r/output.txt";

// Game state tracking
let lastGameState = "";
let defconLevel = 5;
let PROMPTSETTING;
let PROMPTFILE;
let lastCorrelationId = 1000; // Starting correlation ID

// Initialize the MCP server
const server = new McpServer({
  name: "DEFCON-LLM-Bot",
  version: "1.0.0",
  description: "MCP Server for DEFCON game AI using LLMs"
});

// Load the initial conversation settings
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  PROMPTFILE = JSON.parse(fs.readFileSync(join(__dirname, "initial_convo.json")).toString());
  updatePromptSetting();
} catch (error) {
  console.error("Failed to load initial_convo.json:", error);
  process.exit(1);
}

function updatePromptSetting() {
  PROMPTSETTING = PROMPTFILE[`defcon_${defconLevel}`] || PROMPTFILE[`defcon_5`];
}

// Initialize the game files
function initializeGameFiles() {
  try {
    fs.unlinkSync(INPUTFILE);
  } catch (e) { /* File might not exist */ }
  fs.writeFileSync(INPUTFILE, "");
}

// Read game state from output file
async function readGameState() {
  try {
    const stats = await fs.promises.stat(OUTPUTFILE);
    const fileContent = await fs.promises.readFile(OUTPUTFILE, 'utf8');
    
    // Extract DEFCON level
    const match = fileContent.match(/DEFCON level: (\d+)/);
    if (match) {
      defconLevel = parseInt(match[1]);
      updatePromptSetting();
    }
    
    lastGameState = fileContent;
    return fileContent;
  } catch (error) {
    console.error("Error reading game state:", error);
    return "Error reading game state";
  }
}

// Write commands to the input file
function writeCommandToGame(command) {
  try {
    fs.writeFileSync(INPUTFILE, command + "\n", { flag: 'a' });
    return true;
  } catch (error) {
    console.error("Error writing command to game:", error);
    return false;
  }
}

// MCP Resources

// Game state resource
server.resource(
  "game-state",
  "defcon://game-state",
  async (uri) => {
    const gameState = await readGameState();
    return {
      contents: [{
        uri: uri.href,
        text: gameState
      }]
    };
  }
);

// DEFCON level resource
server.resource(
  "defcon-level",
  "defcon://level",
  async (uri) => {
    return {
      contents: [{
        uri: uri.href,
        text: `Current DEFCON level: ${defconLevel}`
      }]
    };
  }
);

// MCP Tools

// Debug log tool
server.tool(
  "debug-log", "Logs a message to the game's debug console",
  { 
    message: z.string().describe("Message to log to the debug console"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result")
  },
  async ({ message, correlationId }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `DebugLog("${message}") -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    return {
      content: [{ 
        type: "text", 
        text: success ? `Debug log sent: ${message} with correlation ID: ${correlationId}` : "Failed to send debug log" 
      }],
      correlationId: correlationId
    };
  }
);

// Send chat message tool
server.tool(
  "send-chat", "Sends a chat message visible to all players in the game",
  { 
    message: z.string().describe("Chat message to send to all players"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result")
  },
  async ({ message, correlationId }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `SendChat("${message}") -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    return {
      content: [{ 
        type: "text", 
        text: success ? `Chat message sent: ${message} with correlation ID: ${correlationId}` : "Failed to send chat message" 
      }],
      correlationId: correlationId
    };
  }
);

// Place structure tool
server.tool(
  "place-structure", "Places a military structure (Silo, RadarStation, or AirBase) at the specified coordinates. IMPORTANT: Check the response to verify if placement was successful!",
  { 
    longitude: z.number().describe("Longitude coordinate for structure placement (-180 to 180)"), 
    latitude: z.number().describe("Latitude coordinate for structure placement (-90 to 90)"), 
    type: z.enum(["RadarStation", "Silo", "AirBase"]).describe("Type of structure to place"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result"),
    skipVerification: z.boolean().optional().default(false).describe("Set to true to skip automatic verification (faster for batch operations)")
  },
  async ({ longitude, latitude, type, correlationId, skipVerification }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `PlaceStructure(${longitude}, ${latitude}, "${type}") -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    if (!success) {
      return {
        content: [{ 
          type: "text", 
          text: "Failed to place structure" 
        }],
        correlationId: correlationId
      };
    }
    
    // Skip verification if requested
    if (skipVerification) {
      return {
        content: [{ 
          type: "text", 
          text: `Structure placement attempted: ${type} at ${longitude}, ${latitude} with correlation ID: ${correlationId}\n\nVerification skipped. Use get-command-results tool to check the result later.`
        }],
        correlationId: correlationId
      };
    }
    
    // Wait a short time for the game to process the command
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if the command was successful
    const result = await getCommandResult(correlationId);
    
    return {
      content: [{ 
        type: "text", 
        text: `Structure placement ${result.found ? (result.success ? "succeeded" : "failed") : "attempted"}: ${type} at ${longitude}, ${latitude} with correlation ID: ${correlationId}${result.found ? "\n\nResult: " + result.result : "\n\nIMPORTANT: You must use the get-command-results tool to verify if this placement was successful!"}`
      }],
      correlationId: correlationId,
      success: result.found ? result.success : undefined
    };
  }
);

// Whiteboard draw tool
server.tool(
  "whiteboard-draw", "Draws a line on the game's whiteboard between two coordinate points",
  { 
    longitude1: z.number().describe("Starting longitude coordinate for the line"), 
    latitude1: z.number().describe("Starting latitude coordinate for the line"), 
    longitude2: z.number().describe("Ending longitude coordinate for the line"), 
    latitude2: z.number().describe("Ending latitude coordinate for the line"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result")
  },
  async ({ longitude1, latitude1, longitude2, latitude2, correlationId }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `WhiteboardDraw(${longitude1}, ${latitude1}, ${longitude2}, ${latitude2}) -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    return {
      content: [{ 
        type: "text", 
        text: success ? `Whiteboard line drawn from (${longitude1}, ${latitude1}) to (${longitude2}, ${latitude2}) with correlation ID: ${correlationId}` : "Failed to draw on whiteboard" 
      }],
      correlationId: correlationId
    };
  }
);

// Whiteboard clear tool
server.tool(
  "whiteboard-clear", "Clears all drawings from the game's whiteboard",
  {
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result")
  },
  async ({ correlationId }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `WhiteboardClear() -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    return {
      content: [{ 
        type: "text", 
        text: success ? `Whiteboard cleared with correlation ID: ${correlationId}` : "Failed to clear whiteboard" 
      }],
      correlationId: correlationId
    };
  }
);

// Place fleet tool
server.tool(
  "place-fleet", "Places a fleet of ships at the specified coordinates. You can specify up to 6 ships. IMPORTANT: Check the response to verify if placement was successful!",
  { 
    longitude: z.number().describe("Longitude coordinate for fleet placement (-180 to 180)"), 
    latitude: z.number().describe("Latitude coordinate for fleet placement (-90 to 90)"), 
    ship1: z.enum(["Sub", "Carrier", "BattleShip"]).describe("Type of first ship to place"),
    ship2: z.enum(["Sub", "Carrier", "BattleShip"]).optional().describe("Type of second ship to place"),
    ship3: z.enum(["Sub", "Carrier", "BattleShip"]).optional().describe("Type of third ship to place"),
    ship4: z.enum(["Sub", "Carrier", "BattleShip"]).optional().describe("Type of fourth ship to place"),
    ship5: z.enum(["Sub", "Carrier", "BattleShip"]).optional().describe("Type of fifth ship to place"),
    ship6: z.enum(["Sub", "Carrier", "BattleShip"]).optional().describe("Type of sixth ship to place"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result"),
    skipVerification: z.boolean().optional().default(false).describe("Set to true to skip automatic verification (faster for batch operations)")
  },
  async ({ longitude, latitude, ship1, ship2, ship3, ship4, ship5, ship6, correlationId, skipVerification }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    // Build the command with only the ships that were provided
    let ships = [ship1];
    if (ship2) ships.push(ship2);
    if (ship3) ships.push(ship3);
    if (ship4) ships.push(ship4);
    if (ship5) ships.push(ship5);
    if (ship6) ships.push(ship6);
    
    let shipsStr = ships.map(ship => `"${ship}"`).join(", ");
    let command = `PlaceFleet(${longitude}, ${latitude}, ${shipsStr}) -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    if (!success) {
      return {
        content: [{ 
          type: "text", 
          text: "Failed to place fleet" 
        }],
        correlationId: correlationId
      };
    }
    
    // Skip verification if requested
    if (skipVerification) {
      return {
        content: [{ 
          type: "text", 
          text: `Fleet placement attempted at ${longitude}, ${latitude} with ships: ${ships.join(", ")} and correlation ID: ${correlationId}\n\nVerification skipped. Use get-command-results tool to check the result later.`
        }],
        correlationId: correlationId
      };
    }
    
    // Wait a short time for the game to process the command
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if the command was successful
    const result = await getCommandResult(correlationId);
    
    return {
      content: [{ 
        type: "text", 
        text: `Fleet placement ${result.found ? (result.success ? "succeeded" : "failed") : "attempted"} at ${longitude}, ${latitude} with ships: ${ships.join(", ")} and correlation ID: ${correlationId}${result.found ? "\n\nResult: " + result.result : "\n\nIMPORTANT: You must use the get-command-results tool to verify if this placement was successful!"}`
      }],
      correlationId: correlationId,
      success: result.found ? result.success : undefined
    };
  }
);

// Launch nuke tool
server.tool(
  "launch-nuke", "Launches a nuclear missile from a specified silo to target coordinates. IMPORTANT: Check the response to verify if launch was successful!",
  { 
    siloId: z.string().describe("ID of the silo to launch the nuke from"), 
    targetLongitude: z.number().describe("Target longitude coordinate for the nuclear strike"), 
    targetLatitude: z.number().describe("Target latitude coordinate for the nuclear strike"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result"),
    skipVerification: z.boolean().optional().default(false).describe("Set to true to skip automatic verification (faster for batch operations)")
  },
  async ({ siloId, targetLongitude, targetLatitude, correlationId, skipVerification }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `LaunchNukeFromSilo(${siloId}, ${targetLongitude}, ${targetLatitude}) -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    if (!success) {
      return {
        content: [{ 
          type: "text", 
          text: "Failed to launch nuke" 
        }],
        correlationId: correlationId
      };
    }
    
    // Skip verification if requested
    if (skipVerification) {
      return {
        content: [{ 
          type: "text", 
          text: `Nuke launch attempted from silo ${siloId} to (${targetLongitude}, ${targetLatitude}) with correlation ID: ${correlationId}\n\nVerification skipped. Use get-command-results tool to check the result later.`
        }],
        correlationId: correlationId
      };
    }
    
    // Wait a short time for the game to process the command
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if the command was successful
    const result = await getCommandResult(correlationId);
    
    return {
      content: [{ 
        type: "text", 
        text: `Nuke launch ${result.found ? (result.success ? "succeeded" : "failed") : "attempted"} from silo ${siloId} to (${targetLongitude}, ${targetLatitude}) with correlation ID: ${correlationId}${result.found ? "\n\nResult: " + result.result : "\n\nIMPORTANT: You must use the get-command-results tool to verify if this launch was successful!"}`
      }],
      correlationId: correlationId,
      success: result.found ? result.success : undefined
    };
  }
);

// Set silo to defensive mode tool
server.tool(
  "set-silo-defensive", "Sets a silo to defensive mode to shoot down incoming nuclear missiles. IMPORTANT: Check the response to verify if the command was successful!",
  { 
    siloId: z.string().describe("ID of the silo to set to defensive mode"),
    correlationId: z.number().optional().describe("Optional ID to correlate this command with its result"),
    skipVerification: z.boolean().optional().default(false).describe("Set to true to skip automatic verification (faster for batch operations)")
  },
  async ({ siloId, correlationId, skipVerification }) => {
    // Auto-generate correlation ID if not provided
    if (correlationId === undefined) {
      correlationId = ++lastCorrelationId;
    }
    
    let command = `StopLaunchingNukesFromSiloAndGoDefensive(${siloId}) -- ${correlationId}`;
    const success = writeCommandToGame(command);
    
    if (!success) {
      return {
        content: [{ 
          type: "text", 
          text: "Failed to set silo to defensive mode" 
        }],
        correlationId: correlationId
      };
    }
    
    // Skip verification if requested
    if (skipVerification) {
      return {
        content: [{ 
          type: "text", 
          text: `Silo ${siloId} attempted to set to defensive mode with correlation ID: ${correlationId}\n\nVerification skipped. Use get-command-results tool to check the result later.`
        }],
        correlationId: correlationId
      };
    }
    
    // Wait a short time for the game to process the command
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if the command was successful
    const result = await getCommandResult(correlationId);
    
    return {
      content: [{ 
        type: "text", 
        text: `Silo ${siloId} ${result.found ? (result.success ? "successfully set" : "failed to set") : "attempted to set"} to defensive mode with correlation ID: ${correlationId}${result.found ? "\n\nResult: " + result.result : "\n\nIMPORTANT: You must use the get-command-results tool to verify if this command was successful!"}`
      }],
      correlationId: correlationId,
      success: result.found ? result.success : undefined
    };
  }
);

// Helper function to check command results
async function getCommandResult(correlationId) {
  try {
    const gameState = await fs.promises.readFile(OUTPUTFILE, 'utf8');
    const regex = new RegExp(`Command result:.*\\[ID:${correlationId}\\]`, 'g');
    const matches = gameState.match(regex);
    
    if (matches) {
      // Check if the command was successful
      const successMatch = matches[0].match(/SUCCESS/);
      return {
        found: true,
        success: !!successMatch,
        result: matches[0]
      };
    } else {
      return {
        found: false,
        success: false,
        result: "No result found"
      };
    }
  } catch (error) {
    console.error("Error checking command result:", error);
    return {
      found: false,
      success: false,
      result: "Error checking command result"
    };
  }
}

// Get command results by correlation IDs tool
server.tool(
  "get-command-results", "Retrieves the results of previously executed commands by their correlation IDs. Use this to check results when skipVerification=true was used.",
  { correlationIds: z.array(z.number()).describe("List of correlation IDs to retrieve results for") },
  async ({ correlationIds }) => {
    try {
      const gameState = await fs.promises.readFile(OUTPUTFILE, 'utf8');
      const results = {};
      
      // Search for each correlation ID in the output
      for (const id of correlationIds) {
        const regex = new RegExp(`Command result:.*\\[ID:${id}\\]`, 'g');
        const matches = gameState.match(regex);
        if (matches) {
          results[id] = matches;
        } else {
          results[id] = ["No result found"];
        }
      }
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(results, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error retrieving command results: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// Generate AI response tool
server.tool(
  "generate-ai-response", "Generates a prompt for an AI model based on the current game state",
  {}, // No parameters needed
  async () => {
    try {
      // Read the current game state
      const gameState = await readGameState();
      
      // Create the prompt for the LLM
      const prompt = [
        ...PROMPTSETTING.initial,
        {"role": "user", "content": gameState},
        ...PROMPTSETTING.prompt
      ];
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(prompt, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error generating AI response: ${error.message}` 
        }],
        isError: true
      };
    }
  }
);

// MCP Prompts

// Game state analysis prompt
server.prompt(
  "analyze-game-state",
  {},
  () => {
    return {
      messages: [
        {
          role: "system",
          content: {
            type: "text",
            text: "You are a strategic AI assistant for the game DEFCON. Analyze the current game state and suggest optimal moves."
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: `Please analyze the current game state and suggest strategic moves:\n\n${lastGameState}`
          }
        }
      ]
    };
  }
);

// Structure placement prompt
server.prompt(
  "suggest-structure-placement",
  { structureType: z.enum(["RadarStation", "Silo", "AirBase"]) },
  ({ structureType }) => {
    return {
      messages: [
        {
          role: "system",
          content: {
            type: "text",
            text: "You are a strategic AI assistant for the game DEFCON. Suggest optimal structure placements."
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: `Based on the current game state, suggest optimal locations to place ${structureType} structures:\n\n${lastGameState}`
          }
        }
      ]
    };
  }
);

// Nuke targeting prompt
server.prompt(
  "suggest-nuke-targets",
  {},
  () => {
    return {
      messages: [
        {
          role: "system",
          content: {
            type: "text",
            text: "You are a strategic AI assistant for the game DEFCON. Suggest optimal nuclear strike targets."
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: `Based on the current game state, suggest optimal targets for nuclear strikes:\n\n${lastGameState}`
          }
        }
      ]
    };
  }
);

// Start the MCP server with the appropriate transport
async function startServer() {
  // Initialize game files
  initializeGameFiles();
  
  // Determine which transport to use based on command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--http')) {
    // Start with HTTP transport
    const app = express();
    app.use(express.json());
    
    // Map to store transports by session ID
    const transports = {};
    
    // Handle POST requests for client-to-server communication
    app.post('/mcp', async (req, res) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'];
      let transport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
          }
        });
        
        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        
        // Connect to the MCP server
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }
      
      // Handle the request
      await transport.handleRequest(req, res, req.body);
    });
    
    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };
    
    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', handleSessionRequest);
    
    // Handle DELETE requests for session termination
    app.delete('/mcp', handleSessionRequest);
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      log(`DEFCON MCP Server listening on port ${PORT}`);
    });
  } else {
    // Default to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("DEFCON MCP Server started with stdio transport");
  }
}

startServer().catch(error => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});

function log(message) {
  // log to standard ERROR
  if (typeof message !== 'string') {
    message = JSON.stringify(message);
  }
  //console.error(`[Defcon MCP Server] ${message}`);
}