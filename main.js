'use strict';

/**
 * A ping pong bot, whenever you send "ping", it replies "pong".
 */

// Import the discord.js module
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const secrets = require('./secrets.json');


let db = new sqlite3.Database('./waggzbot.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

// Create an instance of a Discord client
const client = new Discord.Client();

/**
 * The ready event is vital, it means that only _after_ this will your bot start reacting to information
 * received from Discord
 */
client.on('ready', () => {
    console.log('I am ready!');
});

// Create an event listener for messages
client.on('message', message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

  console.log(command);
  if (command === "!respond") {
      const response = message.content.slice(command.length + args[0].length + 2)

      db.run(`INSERT INTO responses(trigger,response) VALUES(?, ?)`, [args[0], response], function(err) {
          if (err) {
              message.channel.send("Error adding response, does it already exist?");
              return console.log(err.message);
          }
          // get the last insert id
          message.reply(`OK, I will respond to ***${args[0]}*** with ***${response}***`);
          console.log(`A row has been inserted with rowid ${this.lastID}`);
      });
  }

    let sql = `SELECT response
           FROM responses
           WHERE trigger  = ?`;

// first row only
    db.get(sql, [message.content], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        return row
            ? message.channel.send(row.response)
            : console.log(`No response found with the trigger ${message.content}`);
    });
});


// Log our bot in using the token from https://discord.com/developers/applications
client.login(secrets.token);

function getUserFromMention(mention) {
    if (!mention) return;

    if (mention.startsWith('<@') && mention.endsWith('>')) {
        mention = mention.slice(2, -1);

        if (mention.startsWith('!')) {
            mention = mention.slice(1);
        }

        return client.users.cache.get(mention);
    }
}