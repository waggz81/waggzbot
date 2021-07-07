'use strict';

const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const secrets = require('./secrets.json');


let db = new sqlite3.Database('./waggzbot.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

const client = new Discord.Client();

client.on('ready', () => {
    console.log('I am ready!');
});

client.on('message', message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "!respond") {
        insertResponse(message, command);
        return;
    }

    let sql = `SELECT *
           FROM responses`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        let triggerLen = 0;
        let triggerRow;
        let i = 0;
        rows.forEach((row) => {
            // noinspection JSUnresolvedVariable
            let myReg = new RegExp("\\b(" + row.trigger.toLowerCase() + ")\\b", 'gi')
            let myMatch = message.content.trim().toLowerCase().match(myReg)
            if (myMatch){
                // noinspection JSUnresolvedVariable
                if (row.trigger.length > triggerLen) {
                    // noinspection JSUnresolvedVariable
                    triggerLen = row.trigger.length;
                    triggerRow = i;
                }
            }
            i++;
        });
        if (triggerRow && getRandomInt(2) === 1) { // noinspection JSIgnoredPromiseFromCall
            message.channel.send(rows[triggerRow].response);
        }

    });
});


// noinspection JSIgnoredPromiseFromCall
client.login(secrets.token);

/*
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
*/

function insertResponse (message, command) {
    if (!message.content.includes("=>")) {
        message.reply("Incorrect format for adding responses. Correct format is `!respond trigger phrase => response phrase`");
        return;
    }
    const args = message.content.slice(command.length + 1).split("=>");

    db.run(`INSERT INTO responses(trigger,response) VALUES(?, ?)`, [args[0].trim().toLowerCase(), args[1].trim().toLowerCase()], function(err) {
        if (err) {
            message.channel.send("Error adding response, does it already exist?");
            return console.log(err.message);
        }
        // get the last insert id
        message.channel.send(`OK ${message.author}, I will respond to ***${args[0].trim()}*** with ***${args[1].trim()}***`);
        // noinspection JSUnresolvedVariable
        console.log(`A row has been inserted with rowid ${this.lastID}`);
    });
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}