'use strict';

let util = require('util');
let http = require('http');
let Bot  = require('@kikinteractive/kik');
var request = require('request');

// anilist oauth
var ani_client_id = "mwoo-8zevs";
var ani_client_secret = "PVbpoDC2My1xqyuL5OHK";
var ani_endpoint = "https://anilist.co/api/";
var ani_token = '';

function getNewAniToken(){
  var ani_refresh = {
    grant_type: "client_credentials",
    client_id: ani_client_id,
    client_secret: ani_client_secret
  };

  request.post({
    url: ani_endpoint+'auth/access_token',
    json: ani_refresh
    },
    function (error, response, body) {
      //Check for error
      if(error){
          return console.log('Error:', error);
      }

      //Check for right status code
      if(response.statusCode !== 200){
          return console.log('Invalid Status Code Returned:', response.statusCode);
      }

      //All is good. Print the body
      // var jbody = JSON.parse(body);
      console.log(body);
      // console.log(jbody);
      // ani_token = jbody['access_token'];
    }
  )
}

function searchAnime(name, attempt){
  request(ani_endpoint+'anime/search/'+name+'?access_token='+token, function(error, response, body){
    if(error){
      console.log('Error:', error);
      if(response.statusCode == 401 && attempt == 0){
      	getNewAniToken();
      	searchAnime(name, attempt++);
      }
      return 1;
    }

    if(response.statusCode == 200){
    	var jbody = JSON.parse(body);

    }
  })
}

// kikbot auth
var botname = 'anibot';
var botkey = '90b0e4fd-177a-4610-ab20-efa3684be264';
var botUrl = "https://anibot.herokuapp.com/incoming";

var botsettings = {
  baseUrl: '/incoming',
  username: botname,
  apiKey: botkey
};

var bothooksettings = {webhook: botUrl,
                       features: {}};

// set bot's webhook to the heroku app
request.post({
  url: 'https://api.kik.com/v1/config',
  auth: {user : botname, pass : botkey},
  json: bothooksettings
  },
  function (error, response, body) {
    //Check for error
    if(error){
        return console.log('Error:', error);
    }

    //Check for right status code
    if(response.statusCode !== 200){
        return console.log('Invalid Status Code Returned:', response.statusCode);
    }

    //All is good. Print the body
    console.log('success');
    // console.log(body); // Show the HTML for the Modulus homepage.
  }
);

getNewAniToken();

// Configure the bot API endpoint, details for your bot
let bot = new Bot(botsettings);

bot.updateBotConfiguration();

bot.onTextMessage((message) => {
    message.reply(message.body);
});

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);