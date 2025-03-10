#!/usr/bin/env bun

import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { join } from "path";
import config from "./config.json";

const program = new Command();

program
  .name("paperplane")
  .description("Send projects and apps to your Linux server over HTTP")
  .version("1.0.0");

let log = console.log;
let logError = console.error;

function properUrl(domain: string){
  domain = domain.startsWith("http://") || domain.startsWith("https://") ? domain : `http://${domain}`;
  return domain.endsWith("/paperplane") ? domain : `${domain}/paperplane`;
}

const listServers = async () => {
  const servers = config.servers;

  log(chalk.underline.bold.whiteBright("Available servers:"));
  servers.forEach((server) => {
    log(chalk.whiteBright(`  [${chalk.bold.red(server.id)}] ${chalk.blue(properUrl(server.url))}`));
  });
};

const sendProject = async (id: string, folder: string) => {
  const spinner = ora(`Sending ${folder} to server ${chalk.red.bold(id)}`).start();
  const tarName = `${folder}.tar`;
  const url = `${config.servers.find((server) => server.id === id)?.url}/upload/${tarName}`;

  if(!url){
    spinner.fail(chalk.red("Server not found"));
    return;
  }

  if(!await Bun.file(join(folder, "deploy.sh")).exists()){
    spinner.fail(chalk.red("deploy.sh not found in the folder"));
    return;
  }

  spinner.color = "red";

  try {

    spinner.text = `Creating tarball of ${folder}`;
    await Bun.$`tar -cvf ${tarName} ${folder}`.quiet();
  
    spinner.text = `Sending ${tarName} to server ${chalk.red.bold(id)}`;
    const response = await fetch(url, {
      method: "POST",
      body: await Bun.file(tarName).text(),
    });

    const data = await response.json();
    if (response.ok) {
      spinner.succeed(chalk.green(data.message));
    } else {
      throw new Error(JSON.stringify(data));
    }

    spinner.stop();
    log(data.reponse)
  } catch (error) {
    //@ts-ignore
    spinner.fail(chalk.red(error.message));
    spinner.stop();
  } finally {
    await Bun.$`rm ${tarName}`;
  }
};

const disconnectServer = async (id: string) => {
  let serverUrl = config.servers.find((server) => server.id === id)?.url;
  let servers = config.servers.filter((server) => server.id !== id);
  const newConfig = Object.assign({}, config, { servers });
  await Bun.file("config.json").write(JSON.stringify(newConfig, null, 2));
  log(`Disconnected from server ${chalk.red.bold(id)} at ${chalk.blue(serverUrl)}`);
};

const connectServer = (id: string, url: string, pswd: string) => {
  let servers = config.servers;
  servers.push({ id, url: properUrl(url), pswd });
  const newConfig = Object.assign({}, config, { servers });
  Bun.file("config.json").write(JSON.stringify(newConfig, null, 2));
  log(`Connected to server ${chalk.red.bold(id)} at ${chalk.blue(properUrl(url))}`);
};

program.command("list").description("List all connected servers\n").action(listServers);

program.command("send <id> <folder>").description(
  "Send a folder to a server\n" + 
  "<id>: The id of the server you want to send to.\n" +
  "<folder>: The folder you want to send.\n"
).action(sendProject);

program.command("disconnect <id>").description(
  "Disconnect from a server\n" +
  "<id>: The id of the server you want to disconnect from.\n"
).action(disconnectServer);

program.command("connect <id> <url> <password>").description(
  "Connect to a new server\n" +
  "<id>: The id you want to assign the server.\n" +
  "<url>: The url of the server.\n" +
  "<password>: The password of the server.\n"
).action(connectServer);

program.parse(process.argv);