'use strict';

//required modules
const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
//required configs
const secrets = require('./secrets.json');

//connect to sqlite file
let db = new sqlite3.Database('./waggzbot.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

//init discord.js bot client
const client = new Discord.Client();

client.on('ready', () => {
    console.log('I am ready!', client.user.id);
});

//message handler
client.on('message', message => {
    //ignore bots
    if (message.author.bot) return;

    //split message into command and args
    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    //add new response
    if (command === "!respond") {
        insertResponse(message, command);
        return;
    }

    //get triggers and responses
    let sql = `SELECT *
           FROM responses`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        //init loop vars
        let triggerLen = 0;
        let triggerRow;
        let i = 0;
        //loop through triggers
        rows.forEach((row) => {
            //check for the trigger surrounded by breaks in the message content (this makes 'hi' match the word 'hi' but not the word 'this'
            // noinspection JSUnresolvedVariable
            let myReg = new RegExp("\\b(" + row.trigger.toLowerCase() + ")\\b", 'gi')
            let myMatch = message.content.trim().toLowerCase().match(myReg)
            if (myMatch){
                //if it's a match make note of it and how long the trigger is, if it's longer than a previous match, override it
                // noinspection JSUnresolvedVariable
                if (row.trigger.length > triggerLen) {
                    // noinspection JSUnresolvedVariable
                    triggerLen = row.trigger.length;
                    triggerRow = i;
                }
            }
            i++;
        });
        //if there was a trigger match, and spam control passes
        if (triggerRow && shouldWeRespond(message)) { // noinspection JSIgnoredPromiseFromCall
            let response = rows[triggerRow].response;
            //replace %user% in the trigger with message author
            let myRegex = /%user%/gi;
            response = response.replace(myRegex, message.author);
            if (!rows[triggerRow].reply)
                response = preface() + response;
            // noinspection JSIgnoredPromiseFromCall
            message.channel.send(response);
        }
    });
});

//start bot
// noinspection JSIgnoredPromiseFromCall
client.login(secrets.token);

//inserting responses
function insertResponse (message, command) {
    //check for split syntax
    if (!message.content.includes("=>")) {
        message.reply("Incorrect format for adding responses. Correct format is `!respond trigger phrase => response phrase`");
        return;
    }
    //split the command
    const args = message.content.slice(command.length + 1).split("=>");
    let response = args[1].trim().toLowerCase();
    let isreply;
    //check if response starts with <reply> and flag it true if so
    let replySearch = response.indexOf("<reply>");
    if (replySearch === 0) {
        response = response.slice(7);
        isreply = true;
    }
    else isreply = false;
    db.run(`INSERT INTO responses(trigger,response,reply) VALUES(?, ?, ?)`, [args[0].trim().toLowerCase(), response, isreply], function(err) {
        if (err) {
            message.channel.send("Error adding response, does it already exist?");
            return console.log(err.message);
        }
        //success, let the author know
        message.channel.send(`OK ${message.author}, I will respond to ***${args[0].trim()}*** with ***${args[1].trim()}***`);
        // get the last insert id
        // noinspection JSUnresolvedVariable
        console.log(`A row has been inserted with rowid ${this.lastID}`);
    });
}

//return random int from 0 through max-1
function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

//spam reduction
function shouldWeRespond (message) {
    return getRandomInt(2) === 1 || message.content.includes(client.user.id);

}

//prefaces
function preface (){
    let prefaces = [
        "i heard",
        "someone said",
        "somebody mentioned that",
        "it has been said that",
        "rumor has it",
        "did you know that",
        "i guess",
        "i think"
    ]
    return prefaces[Math.floor(Math.random() * prefaces.length)] + ' ';
}