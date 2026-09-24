import Groq from "groq-sdk";
import readlineSync from 'readline-sync';
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import fs from "fs/promises";
import path from "path";

const History = [];
const asyncExecute= promisify(exec);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const platform = os.platform();
// Define tools that execute commands on terminal
async function executeCommand({args}) {
    try{
        const {stdout,stderr}=await asyncExecute(args);
        if(stderr){
            console.error("Error executing command:", stderr);
            return `Error executing command: ${stderr}`;
        }
        return stdout;
    } catch (error) {
        console.error("Error executing command:", error.message);
        return `Error executing command: ${error.stderr || error.message}`;
    }
};

// Write full file contents (terminal redirection can't handle multi-line code on Windows)
async function writeFile({filePath, content}) {
    try{
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf8");
        console.log("Wrote file:", filePath);
        return `Successfully wrote ${filePath}`;
    } catch (error) {
        console.error("Error writing file:", error.message);
        return `Error writing file: ${error.message}`;
    }
};

const writeFileDeclaration={
  type: "function",
  function: {
    name: "writeFile",
    description:"Creates or overwrites a file with the given content. Parent folders are created automatically.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path of the file to write, e.g. calculator/index.html",
        },
        content: {
          type: "string",
          description: "The complete content of the file.",
        },
      },
      required: ["filePath", "content"],
    },
  }
};

const executeCommandDeclaration={
  type: "function",
  function: {
    name: "executeCommand",
    description:"Executes a single command on the terminal.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "string",
          description: "The command to execute on the terminal.",
        },
            },
      required: ["args"],
        },
    }
};

const availableTools = {
    executeCommand: executeCommand,
    writeFile: writeFile,
};

async function runAgent(userProblem) {
    History.push({
      role: 'user',
      content: userProblem,
    });

   
    while(true){
    
   const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      {
        role: "system",
        content: `You are a coding agent that builds websites by running terminal commands.
            The user's operating system is: ${platform}
            ${platform === "win32"
            ? "Use Windows cmd syntax (mkdir, dir). Do NOT use touch, cat, ls, or rm."
            : "Use Unix shell syntax (mkdir, touch, cat, ls)."}

            Your job:
            1. Work out what kind of website the user wants (e.g. a calculator, a portfolio, a todo app).
            2. Plan the files it needs (usually index.html, style.css, script.js inside a project folder).
            3. Use the executeCommand tool ONE command at a time. Wait for each result before the next step.
            4. Write complete, working code into each file using the writeFile tool. Never use echo or redirection (>) to write file contents.
            5. Never delete files or folders unless the user explicitly asks.
            6. When finished, tell the user which files you created and how to open the site.`,
        },
        ...History,
    ],
    reasoning_effort: "low",
    tools: [executeCommandDeclaration, writeFileDeclaration],
    });

   const message = response.choices[0].message;

   if(message.tool_calls && message.tool_calls.length > 0){
    
    History.push(message);

    // Every tool call must get a response, or the next API request is rejected
    for (const toolCall of message.tool_calls) {
      const {name} = toolCall.function;
      const funCall = availableTools[name];
      let result;
      try {
        const args = JSON.parse(toolCall.function.arguments);
        result = funCall ? await funCall(args) : `Unknown tool: ${name}`;
      } catch (error) {
        result = `Error: ${error.message}`;
      }

      History.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: String(result),
      });
    }
   }
   else{

    History.push({
        role: 'assistant',
        content: message.content,
    });
    console.log(message.content);
    break;
   }


  }




}


async function main() {
    console.log("Welcome to the coding agent! Ask me anything about building a website.");
  while (true) {
    const userProblem = readlineSync.question("Ask me anything--> ");
    await runAgent(userProblem);
  }
}


main();