import lmstudio from "@lmstudio/sdk";
import fs from "fs";
import stream from "stream";
import logger from "node-color-log"
import { pipeline } from "node:stream/promises";
const LMStudioClient = lmstudio.LMStudioClient;
const INPUTFILE = "R:\\input.txt";
const OUTPUTFILE = "R:\\output.txt";

let PROMPTSETTING;
let PROMPTFILE;
let defconLevel = 5;

async function main() {
  try {
    fs.unlinkSync(INPUTFILE);
  } catch (e) { }
  fs.writeFileSync(INPUTFILE, "");
  PROMPTFILE = JSON.parse(fs.readFileSync("./initial_convo.json").toString());

  function updatePromptSetting() {
    PROMPTSETTING = PROMPTFILE[`defcon_${defconLevel}`] || PROMPTFILE[`defcon_5`];
  }


  const client = new lmstudio.LMStudioClient({
    baseUrl: "ws://127.0.0.1:1234",
    clientPasskey: 'lm-studio'
  });

  // Load a model
  /*const llama3 = await client.llm.load("lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF", {
    config: { gpuOffload: "max", contextLength: 8192 },
  });*/
  const llama3 = await client.llm.load("lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF", {
    config: { gpuOffload: "max", contextLength: 81192 },
  });

  let lastOutputOffset = 0;

  const delay = (time) => new Promise((resolve, reject) => setTimeout(resolve, time))

  let lastGameState = "";

  async function generateResponse() {
    logger.color('yellow').bgColor('blue').log(`New turn start - DEFCON ${defconLevel}`);
    // Create a text completion prediction
    let prompt = [].concat(PROMPTSETTING.initial, [{"role": "user", "content": lastGameState}], PROMPTSETTING.prompt);
    const prediction = llama3.respond(prompt, {
      temperature: 1.0
    });

    // Stream the response
    for await (const text of prediction) {
      //process.stdout.write(text);
    }

    await prediction.then(d => {
      const contents = d.content.split('\n');
      let writes = 0;
      for (const line of contents) {
        let color = 'green';
        if (line.startsWith("DebugLog")) {

        } else if (line.startsWith("PlaceStructure")) {

        } else if (line.startsWith("WhiteboardClear")) {

        } else if (line.startsWith("WhiteboardDraw")) {

        } else if (line.startsWith("SendChat")) {

        } else if (line.startsWith("PlaceFleet")) {

        } else if (line.startsWith("LaunchNukeFromSilo")) {

        } else if (line.startsWith("StopLaunchingNukesFromSiloAndGoDefensive")) {

        } else {
          color = 'red';
        }
        logger.color(color).log(line);
        if (color === 'green') {
          fs.writeFileSync(INPUTFILE, line + "\n", { flag: 'a' });
          writes += 1;
        }
      }
      if (writes == 0) {
        logger.color('blue').bgColor('red').log("No writes occured due to no significant input from LLM; writing an empty newline!");
        fs.writeFileSync(INPUTFILE, "\n", { flag: 'a' });
      }
      prompt.push({
        role: 'assistant',
        content: d.content
      });
    });

  }

  let read_output_from_game = true;

  async function awaitOutput() {
    if (read_output_from_game == false) {
      return;
    }
    while (true) {
      let newOutputOffset = (await fs.promises.stat(OUTPUTFILE)).size;
      if (newOutputOffset < lastOutputOffset) {
        logger.color('black').bgColor('red').log("Output.txt got truncated - resetting lastOutputOffset!");
        lastOutputOffset = newOutputOffset;
      }
      if (newOutputOffset > lastOutputOffset) {
        logger.color('blue').bgColor('yellow').log("Got response from game");
        updatePromptSetting();
        const stream = fs.createReadStream(OUTPUTFILE, { start: lastOutputOffset, end: newOutputOffset });
        let collected = "";
        stream.on("data", chunk => {
          collected += chunk.toString();
        });
        await pipeline(stream, (a) => {return a});
        let match = collected.match(/DEFCON level: (\d+)/);
        if (match) {
          defconLevel = parseInt(match[1]);
        }
        logger.color('blue').log(collected);
        lastGameState = collected;
        /*prompt.push({
          role: 'user',
          content: collected
        });*/
        lastOutputOffset = newOutputOffset;
        return;
      } else {
        process.stdout.write(".");
        await delay(1000);
      }
    }
  }
  
  async function loop() {
    await awaitOutput();
    await generateResponse();
    await delay(1000);
    read_output_from_game = true;
    loop();
  }

  loop();

}

main();
