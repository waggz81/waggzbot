'use strict';

//required modules
import {
    Client,
    Intents,
    Permissions,
    MessageEmbed,
    MessageActionRow,
    MessageButton,
    TextChannel,
    ButtonInteraction,
    ColorResolvable,
    Message
} from "discord.js";

const yahooStockPrices = require("yahoo-stock-prices");

const myIntents = new Intents();

myIntents.add('GUILDS', 'GUILD_PRESENCES', 'GUILD_MEMBERS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILD_MESSAGE_REACTIONS');

const sqlite3 = require('sqlite3').verbose();
//required configs
const secrets = require('./secrets.json');
const imdbapi = require('imdb-api');
const imdb = new imdbapi.Client({apiKey: secrets.omdbkey});
//const wiki = require('wikipedia');
const URL = require("url").URL;
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

const stringIsAValidUrl = (s) => {
    try {
        new URL(s);
        return true;
    } catch (err) {
        return false;
    }
};

//connect to sqlite file
let db = new sqlite3.Database('./waggzbot.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

//init discord.js bot client
const client = new Client({ intents: myIntents, partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });

client.on('ready', () => {
    console.log('I am ready!', `${client.user.tag}`);
});

//message handler
client.on('messageCreate', message => {
    console.log("1", message)
    //ignore bots
    if (message.author.bot) return;
    //if (client.user.username === "waggzbot-test" && message.channel.id !== '989648406941159424') return;
    //split message into command and args
    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();
    //add new response
    if (command === "!respond") {
        insertResponse(message, command);
        return;
    }
    if (command === "!request") {
        plexRequest(message);
        return;
    }
    if (command === "!imdb") {
        IMDBLookup(message);
        return;
    }
    if (command === "!embed") {
        createEmbed(message);
        return
    }
    if (command === ".metar") {
        getMETAR(message);
        return
    }
    if (command === ".stock") {
        getStockPrice(message);
        return
    }
    if (command === "!roulette") {
        roulette(message);
        return
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
          (message.channel as TextChannel).send(response).catch(console.error);

        }
    });
});

client.on('interactionCreate', async interaction => {
    //if (!interaction.isButton()) return;
    if (interaction.isButton()) {
        const thisInteraction = interaction as ButtonInteraction;
        const chan = thisInteraction.channel as TextChannel;
        // noinspection JSUnresolvedVariable
        if (interaction.customId === "cancelticket" || interaction.customId === "completeticket") {
            // noinspection JSUnresolvedVariable
            chan.delete().catch(console.error);
            const user = client.users.cache.get(chan.topic);
            // noinspection JSUnresolvedVariable
            user.send({
                content: `Your Plex request has been ${interaction.customId === "cancelticket" ? "canceled" : "completed"}:`,
                embeds: (interaction.message as Message).embeds
            }).catch(console.error);
        }
    }
});

//start bot
// noinspection JSIgnoredPromiseFromCall
client.login(secrets.token);

// const app = require('./app')

//inserting responses
function insertResponse (message, command) {
    //check for split syntax
    if (!message.content.includes("=>")) {
        message.reply("Incorrect format for adding responses. Correct format is `!respond trigger phrase => response phrase`");
        return;
    }
    //split the command
    const args = message.content.slice(command.length + 1).split("=>");
    let response = args[1].trim();
    let isreply;
    //check if response starts with <reply> and flag it true if so
    let replySearch = response.indexOf("<reply>");
    if (replySearch === 0) {
        response = response.slice(7);
        isreply = true;
    }
    else isreply = false;
    db.run(`INSERT INTO responses(trigger,response,reply) VALUES(?, ?, ?)`, [args[0].trim(), response, isreply], function(err) {
        if (err) {
            message.channel.send("Error adding response, does it already exist?");
            return console.error(err.message);
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

function plexRequest (message) {

    const name = message.content.slice(8).trim();
    const regex = /t{2}[0-9]{7,}/g;
    const imdbid = name.match(regex);

if (imdbid === null) {
    message.reply("Please use an IMDB title id or URL. (You can get these by using !imdb <title>");
    return;
}
    const params = { 'id': imdbid[0] };
    imdb.get(params).then((search) => {
        // noinspection JSCheckFunctionSignatures
        message.guild.channels.create(search.title, {
            type: 'GUILD_TEXT',
            parent: '636503079197605911',
            permissionOverwrites: [
                {
                    id: message.author.id,
                    allow: [Permissions.FLAGS.VIEW_CHANNEL],
                },
                {
                    id: client.user.id,
                    allow: [Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.MANAGE_CHANNELS],
                },
                {
                    id: message.guild.id, // shortcut for @everyone role ID
                    deny: [Permissions.FLAGS.VIEW_CHANNEL],
                },
            ],
            topic: `${message.author.id}`,
            reason: `New Plex Request by ${message.author.username}#${message.author.discriminator}`,

        }).then((result)=> {
            message.reply(`Created channel <#${result.id}>`);
            const embed = new MessageEmbed()
                .setTitle(`${search.title} (${search._yearData} ${search.type})`)
                .setURL(search.imdburl)
                .setDescription(`${search.imdbid} - ${search.genres}
                        Starring ${search.actors}
                        Rated ${search.rated} - ${search.runtime}
                        ${search.plot.substring(0,300)}...`)
                .setImage(stringIsAValidUrl(search.poster) ? search.poster : null)
            // noinspection JSCheckFunctionSignatures
            const row = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('cancelticket')
                        .setLabel('Cancel')
                        .setStyle('DANGER'),
                    new MessageButton()
                        .setCustomId('completeticket')
                        .setLabel('Completed')
                        .setStyle('SUCCESS'),
                )
            result.send({embeds: [embed], components: [row]})
                .catch(console.error);

        }).catch(console.error)
    })
        .catch(console.error)

}

function IMDBLookup (message) {
    const query = message.content.slice(5).trim();

    let params = {'name': query};
    let list = [];
    let num;
    imdb.search(params).then((search) => {
        num = search.results.length;
        for (const result in search.results) {
            imdb.get({id: search.results[result].imdbid})
                .then( (movie) => {
                    const embed = new MessageEmbed()
                        .setTitle(`${movie.title} (${search.results[result].year} ${movie.type})`)
                        .setURL(movie.imdburl)
                        .setDescription(`${movie.imdbid} - ${movie.genres}
                        Starring ${movie.actors}
                        Rated ${movie.rated} - ${movie.runtime}
                        ${movie.plot.substring(0,300)}...`)
                        .setImage(stringIsAValidUrl(movie.poster) ? movie.poster : null)
                        .setColor(getRandomColor() as ColorResolvable)
                    list.push(embed);

                })
                .catch(console.error)
        }



    })
        .catch(console.error)
        .finally(() => {
            sleep(2000).then(()=>{
                message.author.send({embeds:list}).catch(console.error)
            })

        })


}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

async function createEmbed (message) {
// get the file's URL
    const file = message.attachments.first()?.url;
    if (!file) return console.log('No attached file found');

    try {
        // fetch the file from the external URL
        const response = await fetch(file);

        // if there was an error send a message with the status
        if (!response.ok)
            return message.channel.send(
                'There was an error with fetching the file:',
                response.statusText,
            );

        // take the response stream and read it to completion
        const text = await response.text();

        if (text) {
            console.log(JSON.parse(text));
            const data = JSON.parse(text);
            message.guild.channels.cache.get(data.channel).send({content: data.message.content, embeds: data.message.embeds});
        }
    } catch (error) {
        console.log(error);
    }

}

async function getMETAR (message) {
    const station = message.content.slice(6).trim();
    const url = `https://www.aviationweather.gov/api/data/metar?ids=${station}&format=json`;
    console.log(url)
    // fetch the file from the external URL
    const response = await fetch(url);

    // if there was an error send a message with the status
    if (!response.ok)
        return message.channel.send(
            'There was an error with fetching the file:',
            response.statusText,
        );

    // take the response stream and read it to completion
    const text = await response.text();

    if (text) {
        message.channel.send(JSON.parse(text)[0].rawOb)
    }
}

function roulette (message) {
    const outcome = getRandomInt(6) === 1;
    message.channel.send(outcome ? `BANG! You're dead, ${message.author}.` : "Click! Empty chamber..." )
}

async function getStockPrice (message) {
    const symbol = message.content.slice(6).trim().toUpperCase();
    const price = await yahooStockPrices.getCurrentPrice(symbol);
    console.log(price)
    message.channel.send(price.toString());
}
export {client}
require('./bin/www')