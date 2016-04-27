'use strict';

let util = require('util');
let http = require('http');
let Bot  = require('@kikinteractive/kik');
var request = require('request');

// anilist oauth
var ani_client_id = "mwoo-8zevs";
var ani_client_secret = "PVbpoDC2My1xqyuL5OHK";

// kikbot auth
var botname = "anibot";
var botkey = "efa3684be264";
var botURL = "anibot.herokuapp.com/incoming"

// set bot's webhook to the heroku app
request.post('https://api.kik.com/v1/config', function (error, response, body) {
    //Check for error
    if(error){
        return console.log('Error:', error);
    }

    //Check for right status code
    if(response.statusCode !== 200){
        return console.log('Invalid Status Code Returned:', response.statusCode);
    }

    //All is good. Print the body
    console.log(body); // Show the HTML for the Modulus homepage.

});

// Configure the bot API endpoint, details for your bot
let bot = new Bot({
    username: botname,
    apiKey: botkey,
    baseUrl: '/incoming'
});

bot.updateBotConfiguration();

bot.onTextMessage((message) => {
    message.reply(message.body);
});

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);