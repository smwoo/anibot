'use strict';

let util = require('util');
let http = require('http');
let Bot  = require('@kikinteractive/kik');

// Configure the bot API endpoint, details for your bot
let bot = new Bot({
    username: 'anibot',
    apiKey: '90b0e4fd-177a-4610-ab20-efa3684be264',
    baseUrl: 'salty-reaches-46421.herokuapp.com'
    // baseUrl: 'http://localhost:'+ process.env.PORT || 8080
});

bot.updateBotConfiguration();

bot.onTextMessage((message) => {
    message.reply(message.body);
});

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);