#!/usr/bin/env node

require('dotenv').config();

const { ArgumentParser } = require('argparse');
const inquirer = require('inquirer');

const { version } = require('../package.json');
const provisioner = require('./provisioner'); 

const parser = new ArgumentParser({
  description: 'Argparse example',
  add_help: true,
});
 
parser.add_argument('-v', '--version', { action: 'version', version });
parser.add_argument('-e', '--email');
parser.add_argument('-p', '--password');

const initArgs = async (args) => {
  if(!args.email) {
    if (process.env.PROVISIONNING_EMAIL) {
      args.email = process.env.PROVISIONNING_EMAIL;
    } else {
      const res = await inquirer.prompt([{
        type: 'input',
        name: 'email',
        message: "What is the Strapi admin email?",
      }]);
      args.email = res.email;
    }
  }
  if(!args.password) {
    if (process.env.PROVISIONNING_PASSWORD) {
      args.password = process.env.PROVISIONNING_PASSWORD;
    } else {
      const res = await inquirer.prompt([{
        type: 'password',
        name: 'password',
        message: "What is the Strapi admin password?",
      }]);
      args.password = res.password;
    }
  }
};
const start = async () => {
  const args = parser.parse_args();

  await initArgs(args);
  provisioner.start(args.email, args.password);
}

start();