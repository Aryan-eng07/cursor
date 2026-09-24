import Groq from "groq-sdk";
import readlineSync from 'readline-sync';
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

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
        console.error("Error executing command:", error);
        throw error;
    }
};

const executeCommandDeclaration={
    name: "executeCommand",
    description:"Executes a single command on the terminal. A command to be create a folder,file, write on the file, delete a file, delete a folder, list the files in the folder, read the content of the file, etc.",
    parameters: {
        type: "OBJECT",
        properties: {
            args: {
                type: "string", 
                description: "The command to execute on the terminal.",
            },
        },
        required: ["args"],
    }
};

const availableTools = {
    executeCommand: executeCommand,
};

async function runAgent(userProblem) {
    History.push({
        role:'user',
        parts:[{text:userProblem}]
    });

   
    while(true){
    
   const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: History,
    reasoning_effort: low,
    config:{
        system: `You are a coding agent that builds websites by running terminal commands.
            The user's operating system is: ${platform}
            ${platform === "win32"
            ? "Use Windows cmd syntax (mkdir, type, dir, del). Do NOT use touch, cat, ls, or rm."
            : "Use Unix shell syntax (mkdir, touch, cat, ls)."}

            Your job:
            1. Work out what kind of website the user wants (e.g. a calculator, a portfolio, a todo app).
            2. Plan the files it needs (usually index.html, style.css, script.js inside a project folder).
            3. Use the executeCommand tool ONE command at a time. Wait for each result before the next step.
            4. Write complete, working code into each file. For file contents, use the writeFile tool instead of echo.
            5. Never delete files or folders unless the user explicitly asks.
            6. When finished, tell the user which files you created and how to open the site.`,
        tools: [executeCommandDeclaration],
    }
    });


   if(response.functionCalls&&response.functionCalls.length>0){
    
    console.log(response.functionCalls[0]);
    const {name,args} = response.functionCalls[0];

    const funCall =  availableTools[name];
    const result = await funCall(args);

    const functionResponsePart = {
      name: name,
      response: {
        result: result,
      },
    };
   
    // model 
    History.push({
      role: "model",
      parts: [
        {
          functionCall: response.functionCalls[0],
        },
      ],
    });

    // result Ko history daalna

    History.push({
      role: "user",
      parts: [
        {
          functionResponse: functionResponsePart,
        },
      ],
    });
   }
   else{

    History.push({
        role:'model',
        parts:[{text:response.text}]
    })
    console.log(response.text);
    break;
   }


  }




}


async function main() {
    console.log("Welcome to the coding agent! Ask me anything about building a website.");
    const userProblem = readlineSync.question("Ask me anything--> ");
    await runAgent(userProblem);
    main();
}


main();